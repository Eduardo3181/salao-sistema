/**
 * Lançamentos de comissão (Etapa 5, parte 3): só o servidor grava; cada um vê só as suas;
 * reabrir a comanda estorna; isolamento entre salões.
 * Roda no banco de TESTE dentro de uma transação desfeita no final.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { novaConexao } from "./apoio/banco";

const { db, como, comoAdmin, comoServidor, deveFalhar, criarUsuario, criarSalao, colocarNaEquipe } = novaConexao();

let donoA = "", donoB = "", recepcaoA = "", anaUser = "", biaUser = "";
let salaoA = "";
let ana = "", bia = "";
let corte = "", shampoo = "";
let cliente = "";
let comanda = "", itemCorte = "", itemShampoo = "";

const gravar = "select public.gravar_comissoes($1, $2, $3, $4, $5) as ok";
const fechadaEm = async () => {
  await comoAdmin();
  return (await db.query("select fechada_em::text as fechada_em from public.comandas where id = $1", [comanda])).rows[0].fechada_em;
};
const itensJson = () => JSON.stringify([{ item_id: itemCorte, snapshot: { v: 1 } }, { item_id: itemShampoo, snapshot: { v: 1 } }]);
const lancamentosJson = () =>
  JSON.stringify([
    { item_id: itemCorte, profissional_id: ana, papel: "profissional", valor_centavos: 5000 },
    { item_id: itemShampoo, profissional_id: bia, papel: "profissional", valor_centavos: 459 },
  ]);
const linhas = async (quem: string) => {
  await como(quem);
  return (await db.query("select profissional_id, valor_centavos::int as v from public.comissoes order by criado_em, valor_centavos")).rows;
};

beforeAll(async () => {
  await db.connect();
  await db.query("begin");
  donoA = await criarUsuario();
  donoB = await criarUsuario();
  recepcaoA = await criarUsuario();
  anaUser = await criarUsuario();
  biaUser = await criarUsuario();
  salaoA = await criarSalao(donoA, "Salão A");
  await criarSalao(donoB, "Salão B");
  await colocarNaEquipe(salaoA, recepcaoA, "recepcao");
  await colocarNaEquipe(salaoA, anaUser, "profissional");
  await colocarNaEquipe(salaoA, biaUser, "profissional");
  await comoAdmin();
  const prof = async (nome: string, user: string) =>
    (await db.query("insert into public.profissionais (salao_id, nome, tipo, user_id) values ($1, $2, 'profissional', $3) returning id", [salaoA, nome, user])).rows[0].id;
  ana = await prof("Ana", anaUser);
  bia = await prof("Bia", biaUser);
  const cat = (await db.query("insert into public.categorias_servico (salao_id, nome) values ($1, 'Cabelo') returning id", [salaoA])).rows[0].id;
  corte = (await db.query("insert into public.servicos (salao_id, categoria_id, nome, duracao_min, preco_centavos) values ($1, $2, 'Corte', 45, 10000) returning id", [salaoA, cat])).rows[0].id;
  shampoo = (await db.query("insert into public.produtos (salao_id, nome, preco_centavos) values ($1, 'Shampoo', 4590) returning id", [salaoA])).rows[0].id;
  cliente = (await db.query("insert into public.clientes (salao_id, nome) values ($1, 'Maria') returning id", [salaoA])).rows[0].id;

  // Comanda: corte com a Ana + shampoo vendido pela Bia, paga no Pix pela recepção (fecha sozinha)
  await como(recepcaoA);
  comanda = (await db.query("select public.abrir_comanda($1, $2, null) as id", [salaoA, cliente])).rows[0].id;
  await db.query("select public.lancar_item_comanda($1, 'servico', $2, $3, 1, null, 0)", [comanda, corte, ana]);
  await db.query("select public.lancar_item_comanda($1, 'produto', $2, $3, 1, null, 0)", [comanda, shampoo, bia]);
  await db.query("select public.registrar_pagamento($1, 'pix', 14590, 1, null)", [comanda]);
  await comoAdmin();
  const its = (await db.query("select id, tipo from public.comanda_itens where comanda_id = $1", [comanda])).rows;
  itemCorte = its.find((i) => i.tipo === "servico").id;
  itemShampoo = its.find((i) => i.tipo === "produto").id;
});

afterAll(async () => {
  await db.query("rollback");
  await db.end();
});

describe("Quem grava comissão", () => {
  it("comanda fechada começa com a comissão pendente", async () => {
    await comoAdmin();
    const c = (await db.query("select situacao, comissao_calculada_em from public.comandas where id = $1", [comanda])).rows[0];
    expect(c).toEqual({ situacao: "fechada", comissao_calculada_em: null });
  });

  it("ninguém da equipe grava comissão: nem pela tabela, nem pela função do servidor", async () => {
    const f = await fechadaEm();
    for (const quem of [donoA, recepcaoA, anaUser, donoB]) {
      await como(quem);
      await deveFalhar(gravar, [comanda, f, itensJson(), "[]", lancamentosJson()]);
      await deveFalhar(
        "insert into public.comissoes (salao_id, comanda_id, item_id, profissional_id, papel, valor_centavos) values ($1, $2, $3, $4, 'profissional', 100000)",
        [salaoA, comanda, itemCorte, ana],
      );
    }
    await como(null);
    await deveFalhar(gravar, [comanda, f, itensJson(), "[]", lancamentosJson()]);
  });

  it("o servidor recusa itens e pessoas que não são da comanda", async () => {
    const f = await fechadaEm();
    await comoServidor();
    await deveFalhar(gravar, [comanda, f, JSON.stringify([{ item_id: itemCorte, snapshot: {} }]), "[]", "[]"]); // faltou item
    const errado = JSON.stringify([{ item_id: itemCorte, profissional_id: bia, papel: "profissional", valor_centavos: 5000 }]);
    await deveFalhar(gravar, [comanda, f, itensJson(), "[]", errado]); // comissão para quem não fez
    const assist = JSON.stringify([{ item_id: itemCorte, profissional_id: bia, papel: "assistente", valor_centavos: 100 }]);
    await deveFalhar(gravar, [comanda, f, itensJson(), "[]", assist]); // assistente que não está no item
  });

  it("se a comanda mudou durante o cálculo, nada é gravado", async () => {
    await comoServidor();
    const r = await db.query(gravar, [comanda, "2000-01-01T00:00:00Z", itensJson(), "[]", lancamentosJson()]);
    expect(r.rows[0].ok).toBe(false);
    expect(await linhas(donoA)).toEqual([]);
  });

  it("o servidor grava uma vez; chamar de novo não duplica", async () => {
    const f = await fechadaEm();
    await comoServidor();
    expect((await db.query(gravar, [comanda, f, itensJson(), "[]", lancamentosJson()])).rows[0].ok).toBe(true);
    expect((await db.query(gravar, [comanda, f, itensJson(), "[]", lancamentosJson()])).rows[0].ok).toBe(true);
    await comoAdmin();
    const c = (await db.query("select comissao_calculada_em from public.comandas where id = $1", [comanda])).rows[0];
    expect(c.comissao_calculada_em).not.toBeNull();
    const snap = (await db.query("select regra_snapshot from public.comanda_itens where id = $1", [itemCorte])).rows[0];
    expect(snap.regra_snapshot).toEqual({ v: 1 });
    expect(await linhas(donoA)).toHaveLength(2);
  });
});

describe("Quem vê comissão", () => {
  it("dono vê todas; cada profissional só as suas; recepção e outro salão nada", async () => {
    expect((await linhas(donoA)).map((l) => l.v).sort()).toEqual([459, 5000]);
    expect(await linhas(anaUser)).toEqual([{ profissional_id: ana, v: 5000 }]);
    expect(await linhas(biaUser)).toEqual([{ profissional_id: bia, v: 459 }]);
    expect(await linhas(recepcaoA)).toEqual([]);
    expect(await linhas(donoB)).toEqual([]);
  });

  it("ninguém altera nem apaga uma comissão", async () => {
    for (const quem of [donoA, anaUser]) {
      await como(quem);
      await deveFalhar("update public.comissoes set valor_centavos = 99999");
      await deveFalhar("delete from public.comissoes");
    }
    expect((await linhas(donoA)).map((l) => l.v).sort()).toEqual([459, 5000]);
  });
});

describe("Reabrir desfaz a comissão", () => {
  it("reabrir estorna cada lançamento e deixa a comanda pendente de novo", async () => {
    await como(recepcaoA);
    await db.query("select public.reabrir_comanda($1, 'Cliente pediu outro serviço')", [comanda]);
    const todas = await linhas(donoA);
    expect(todas).toHaveLength(4);
    expect(todas.reduce((s, l) => s + l.v, 0)).toBe(0);
    expect(await linhas(anaUser)).toEqual([
      { profissional_id: ana, v: -5000 },
      { profissional_id: ana, v: 5000 },
    ]);
    await comoAdmin();
    const c = (await db.query("select comissao_calculada_em from public.comandas where id = $1", [comanda])).rows[0];
    expect(c.comissao_calculada_em).toBeNull();
  });

  it("fechar e calcular de novo; reabrir outra vez estorna só o novo cálculo", async () => {
    await como(recepcaoA);
    await db.query("select public.fechar_comanda($1)", [comanda]);
    const f = await fechadaEm();
    await comoServidor();
    expect((await db.query(gravar, [comanda, f, itensJson(), "[]", lancamentosJson()])).rows[0].ok).toBe(true);
    await como(donoA);
    await db.query("select public.reabrir_comanda($1, 'Outro ajuste')", [comanda]);
    const todas = await linhas(donoA);
    expect(todas).toHaveLength(8);
    expect(todas.reduce((s, l) => s + l.v, 0)).toBe(0);
  });
});
