/**
 * Vales (Etapa 5, parte 6): só o dono registra e cancela; desconto no pagamento à escolha do dono
 * (tudo, parte ou nada), nunca acima dos vales em aberto nem do valor a pagar; nada é apagado;
 * cada um vê só os próprios; isolamento entre salões.
 * Roda no banco de TESTE dentro de uma transação desfeita no final.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { novaConexao } from "./apoio/banco";

const { db, como, comoAdmin, comoServidor, deveFalhar, criarUsuario, criarSalao, colocarNaEquipe } = novaConexao();

let donoA = "", donoB = "", recepcaoA = "", anaUser = "";
let salaoA = "", salaoB = "";
let ana = "", bia = "";
let corte = "", cliente = "";
let hoje = "", ontem = "";
let vale1 = "", vale2 = "", pagamento = "";

const registrarVale = "select public.registrar_vale($1, $2, $3, $4, $5, $6) as id";
const pagar = "select public.registrar_pagamento_comissao($1, $2, $3, $4, 'pix', $5, null, $6) as id";
const saldoVale = async (id: string) => {
  await comoAdmin();
  return Number((await db.query("select privado.saldo_vale($1) as s", [id])).rows[0].s);
};

async function comandaComComissao(prof: string, comissao: number) {
  await como(recepcaoA);
  const id = (await db.query("select public.abrir_comanda($1, $2, null) as id", [salaoA, cliente])).rows[0].id as string;
  await db.query("select public.lancar_item_comanda($1, 'servico', $2, $3, 1, null, 0)", [id, corte, prof]);
  await db.query("select public.registrar_pagamento($1, 'pix', 10000, 1, null)", [id]);
  await comoAdmin();
  const item = (await db.query("select id from public.comanda_itens where comanda_id = $1", [id])).rows[0].id;
  const f = (await db.query("select fechada_em::text as f from public.comandas where id = $1", [id])).rows[0].f;
  await comoServidor();
  await db.query("select public.gravar_comissoes($1, $2, $3, '[]', $4)", [
    id,
    f,
    JSON.stringify([{ item_id: item, snapshot: { v: 1 } }]),
    JSON.stringify([{ item_id: item, profissional_id: prof, papel: "profissional", valor_centavos: comissao }]),
  ]);
}

beforeAll(async () => {
  await db.connect();
  await db.query("begin");
  donoA = await criarUsuario();
  donoB = await criarUsuario();
  recepcaoA = await criarUsuario();
  anaUser = await criarUsuario();
  salaoA = await criarSalao(donoA, "Salão A");
  salaoB = await criarSalao(donoB, "Salão B");
  await colocarNaEquipe(salaoA, recepcaoA, "recepcao");
  await colocarNaEquipe(salaoA, anaUser, "profissional");
  await comoAdmin();
  const d = (await db.query("select ((now() at time zone 'America/Sao_Paulo')::date)::text as h, ((now() at time zone 'America/Sao_Paulo')::date - 1)::text as o")).rows[0];
  hoje = d.h;
  ontem = d.o;
  const prof = async (nome: string, user: string | null) =>
    (await db.query("insert into public.profissionais (salao_id, nome, tipo, user_id) values ($1, $2, 'profissional', $3) returning id", [salaoA, nome, user])).rows[0].id;
  ana = await prof("Ana", anaUser);
  bia = await prof("Bia", null);
  const cat = (await db.query("insert into public.categorias_servico (salao_id, nome) values ($1, 'Cabelo') returning id", [salaoA])).rows[0].id;
  corte = (await db.query("insert into public.servicos (salao_id, categoria_id, nome, duracao_min, preco_centavos) values ($1, $2, 'Corte', 45, 10000) returning id", [salaoA, cat])).rows[0].id;
  cliente = (await db.query("insert into public.clientes (salao_id, nome) values ($1, 'Maria Fictícia') returning id", [salaoA])).rows[0].id;
  await comandaComComissao(ana, 9000);
});

afterAll(async () => {
  await db.query("rollback");
  await db.end();
});

describe("Registrar vale", () => {
  it("só o dono registra; ninguém grava direto na tabela", async () => {
    for (const quem of [recepcaoA, anaUser, donoB]) {
      await como(quem);
      await deveFalhar(registrarVale, [salaoA, ana, 1000, hoje, "dinheiro", null]);
      await deveFalhar("insert into public.vales (salao_id, profissional_id, valor_centavos, dado_em, meio) values ($1, $2, 1000, $3, 'pix')", [salaoA, ana, hoje]);
    }
    await como(null);
    await deveFalhar(registrarVale, [salaoA, ana, 1000, hoje, "dinheiro", null]);
  });

  it("recusa valor zero, data no futuro e pessoa de outro salão", async () => {
    await como(donoA);
    await deveFalhar(registrarVale, [salaoA, ana, 0, hoje, "dinheiro", null]);
    await deveFalhar(registrarVale, [salaoA, ana, 1000, "2999-01-01", "dinheiro", null]);
    await comoAdmin();
    const deB = (await db.query("insert into public.profissionais (salao_id, nome, tipo) values ($1, 'Outra', 'profissional') returning id", [salaoB])).rows[0].id;
    await como(donoA);
    await deveFalhar(registrarVale, [salaoA, deB, 1000, hoje, "dinheiro", null]);
  });

  it("o dono registra dois vales para a Ana e um para a Bia", async () => {
    await como(donoA);
    vale1 = (await db.query(registrarVale, [salaoA, ana, 3000, ontem, "dinheiro", null])).rows[0].id;
    vale2 = (await db.query(registrarVale, [salaoA, ana, 2000, hoje, "pix", "Adiantamento"])).rows[0].id;
    await db.query(registrarVale, [salaoA, bia, 1500, hoje, "dinheiro", null]);
    expect(await saldoVale(vale1)).toBe(3000);
  });
});

describe("Quem vê", () => {
  it("dono vê todos; a profissional só os seus; recepção e outro salão nada", async () => {
    await como(donoA);
    expect((await db.query("select id from public.vales")).rows).toHaveLength(3);
    await como(anaUser);
    const meus = (await db.query("select profissional_id from public.vales")).rows;
    expect(meus).toHaveLength(2);
    expect(meus.every((v) => v.profissional_id === ana)).toBe(true);
    for (const quem of [recepcaoA, donoB]) {
      await como(quem);
      expect((await db.query("select id from public.vales")).rows).toEqual([]);
    }
  });

  it("a tela de pagar mostra os vales em aberto de cada pessoa", async () => {
    await como(donoA);
    const r = (await db.query("select profissional_id, vales_centavos::int as v from public.saldos_comissao_a_pagar($1, $2::date)", [salaoA, hoje])).rows;
    expect(r).toEqual([{ profissional_id: ana, v: 5000 }]);
  });
});

describe("Desconto no pagamento", () => {
  it("não desconta mais do que os vales em aberto, nem mais do que o valor a pagar, nem negativo", async () => {
    await como(donoA);
    await deveFalhar(pagar, [salaoA, ana, hoje, 9000, hoje, 5001]);
    await deveFalhar(pagar, [salaoA, ana, hoje, 9000, hoje, -1]);
    // Bia: vale de R$ 15 e comissão de R$ 10: no máximo R$ 10
    await comandaComComissao(bia, 1000);
    await como(donoA);
    await deveFalhar(pagar, [salaoA, bia, hoje, 1000, hoje, 1500]);
  });

  it("desconto parcial: usa o vale mais antigo primeiro", async () => {
    await como(donoA);
    pagamento = (await db.query(pagar, [salaoA, ana, hoje, 9000, hoje, 4000])).rows[0].id;
    expect(await saldoVale(vale1)).toBe(0);
    expect(await saldoVale(vale2)).toBe(1000);
    await comoAdmin();
    const p = (await db.query("select valor_centavos::int as v, desconto_vales_centavos::int as d from public.pagamentos_comissao where id = $1", [pagamento])).rows[0];
    expect(p).toEqual({ v: 9000, d: 4000 }); // entregue: R$ 50,00
  });

  it("pode não descontar nada", async () => {
    await como(donoA);
    const id = (await db.query(pagar, [salaoA, bia, hoje, 1000, hoje, 0])).rows[0].id;
    await comoAdmin();
    expect((await db.query("select desconto_vales_centavos::int as d from public.pagamentos_comissao where id = $1", [id])).rows[0].d).toBe(0);
  });

  it("a profissional vê os descontos dos próprios vales; outro salão não", async () => {
    await como(anaUser);
    expect((await db.query("select valor_centavos::int as v from public.vale_descontos order by valor_centavos")).rows.map((x) => x.v)).toEqual([1000, 3000]);
    await como(donoB);
    expect((await db.query("select id from public.vale_descontos")).rows).toEqual([]);
  });
});

describe("Cancelar", () => {
  it("vale já descontado não pode ser cancelado; outro salão e recepção também não cancelam", async () => {
    await como(donoA);
    await deveFalhar("select public.cancelar_vale($1, 'Errado')", [vale1]);
    for (const quem of [recepcaoA, donoB]) {
      await como(quem);
      await deveFalhar("select public.cancelar_vale($1, 'Errado')", [vale2]);
    }
  });

  it("cancelar o pagamento devolve o desconto aos vales (nada é apagado)", async () => {
    await como(donoA);
    await db.query("select public.cancelar_pagamento_comissao($1, 'Desconto errado')", [pagamento]);
    expect(await saldoVale(vale1)).toBe(3000);
    expect(await saldoVale(vale2)).toBe(2000);
    await comoAdmin();
    expect((await db.query("select count(*)::int as n from public.vale_descontos where pagamento_id = $1", [pagamento])).rows[0].n).toBe(2);
  });

  it("vale em aberto pode ser cancelado com motivo e deixa de contar", async () => {
    await como(donoA);
    await deveFalhar("select public.cancelar_vale($1, 'x')", [vale2]);
    await db.query("select public.cancelar_vale($1, 'Lancei errado')", [vale2]);
    await deveFalhar("select public.cancelar_vale($1, 'De novo')", [vale2]);
    await deveFalhar("delete from public.vales where id = $1", [vale2]);
    const r = (await db.query("select vales_centavos::int as v from public.saldos_comissao_a_pagar($1, $2::date) where profissional_id = $3", [salaoA, hoje, ana])).rows;
    expect(r).toEqual([{ v: 3000 }]);
  });

  it("o histórico de atividades guarda os vales", async () => {
    await comoAdmin();
    const n = (await db.query("select count(*)::int as n from public.audit_log where entidade = 'vales' and salao_id = $1", [salaoA])).rows[0].n;
    expect(n).toBeGreaterThanOrEqual(4); // 3 registros + 1 cancelamento
  });
});
