/**
 * Extrato de comissões (Etapa 5, parte 4): quem vê o extrato de quem, detalhes,
 * período, estorno e isolamento entre salões.
 * Roda no banco de TESTE dentro de uma transação desfeita no final.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { novaConexao } from "./apoio/banco";

const { db, como, comoAdmin, deveFalhar, criarUsuario, criarSalao, colocarNaEquipe } = novaConexao();

let donoA = "", donoB = "", recepcaoA = "", anaUser = "", carlaUser = "";
let salaoA = "", salaoB = "";
let ana = "", bia = "", carla = "";
let comanda = "";

const extrato = "select * from public.extrato_comissoes($1, $2, $3, $4)";
const DE = "2000-01-01T00:00:00Z";
const agoraMais = () => new Date(Date.now() + 86400000).toISOString();
const DE_RECENTE = () => new Date(Date.now() - 86400000).toISOString();

async function comoServidor() {
  await db.query("reset role");
  await db.query("select set_config('request.jwt.claims', $1, true)", [JSON.stringify({ role: "service_role" })]);
  await db.query("set local role service_role");
}

beforeAll(async () => {
  await db.connect();
  await db.query("begin");
  donoA = await criarUsuario();
  donoB = await criarUsuario();
  recepcaoA = await criarUsuario();
  anaUser = await criarUsuario();
  carlaUser = await criarUsuario();
  salaoA = await criarSalao(donoA, "Salão A");
  salaoB = await criarSalao(donoB, "Salão B");
  await colocarNaEquipe(salaoA, recepcaoA, "recepcao");
  await colocarNaEquipe(salaoA, anaUser, "profissional");
  await comoAdmin();
  await db.query("insert into public.usuarios_salao (salao_id, user_id, perfil) values ($1, $2, 'assistente')", [salaoA, carlaUser]);
  const prof = async (nome: string, tipo: string, user: string | null) =>
    (await db.query("insert into public.profissionais (salao_id, nome, tipo, user_id) values ($1, $2, $3, $4) returning id", [salaoA, nome, tipo, user])).rows[0].id;
  ana = await prof("Ana", "profissional", anaUser);
  bia = await prof("Bia", "profissional", null);
  carla = await prof("Carla", "assistente", carlaUser);
  const cat = (await db.query("insert into public.categorias_servico (salao_id, nome) values ($1, 'Cabelo') returning id", [salaoA])).rows[0].id;
  const coloracao = (await db.query("insert into public.servicos (salao_id, categoria_id, nome, duracao_min, preco_centavos) values ($1, $2, 'Coloração', 90, 20000) returning id", [salaoA, cat])).rows[0].id;
  const cliente = (await db.query("insert into public.clientes (salao_id, nome) values ($1, 'Maria Fictícia') returning id", [salaoA])).rows[0].id;

  await como(recepcaoA);
  comanda = (await db.query("select public.abrir_comanda($1, $2, null) as id", [salaoA, cliente])).rows[0].id;
  await db.query("select public.lancar_item_comanda($1, 'servico', $2, $3, 1, null, 0)", [comanda, coloracao, ana]);
  await comoAdmin();
  const item = (await db.query("select id from public.comanda_itens where comanda_id = $1", [comanda])).rows[0].id;
  await como(recepcaoA);
  await db.query("select public.definir_assistentes_item($1, $2)", [item, [carla]]);
  await db.query("select public.registrar_pagamento($1, 'pix', 20000, 1, null)", [comanda]);
  await comoAdmin();
  const f = (await db.query("select fechada_em::text as f from public.comandas where id = $1", [comanda])).rows[0].f;
  const snapshot = {
    v: 1, percentual: 5000, origem: "padrao_salao", descontarTaxa: false, valorCentavos: 20000, taxaCentavos: 0,
    resultado: { taxaDescontadaCentavos: 0, repasseProfissionalCentavos: 2000, comissaoProfissionalCentavos: 8000 },
  };
  await comoServidor();
  await db.query("select public.gravar_comissoes($1, $2, $3, $4, $5)", [
    comanda,
    f,
    JSON.stringify([{ item_id: item, snapshot }]),
    JSON.stringify([{ item_id: item, assistente_id: carla, valor_centavos: 2000 }]),
    JSON.stringify([
      { item_id: item, profissional_id: ana, papel: "profissional", valor_centavos: 8000 },
      { item_id: item, profissional_id: carla, papel: "assistente", valor_centavos: 2000 },
    ]),
  ]);
});

afterAll(async () => {
  await db.query("rollback");
  await db.end();
});

describe("Extrato de comissões", () => {
  it("o dono vê o extrato de qualquer pessoa, com os detalhes", async () => {
    await como(donoA);
    const r = (await db.query(extrato, [salaoA, ana, DE_RECENTE(), agoraMais()])).rows;
    expect(r).toHaveLength(1);
    expect(r[0]).toMatchObject({
      estorno: false,
      papel: "profissional",
      item_nome: "Coloração",
      cliente_nome: "Maria Fictícia",
      percentual: 5000,
    });
    expect(Number(r[0].valor_centavos)).toBe(8000);
    expect(Number(r[0].parte_assistente_centavos)).toBe(2000);
    expect((await db.query(extrato, [salaoA, carla, DE_RECENTE(), agoraMais()])).rows).toHaveLength(1);
    expect((await db.query(extrato, [salaoA, bia, DE_RECENTE(), agoraMais()])).rows).toEqual([]);
  });

  it("o profissional vê só o próprio extrato", async () => {
    await como(anaUser);
    expect((await db.query(extrato, [salaoA, ana, DE_RECENTE(), agoraMais()])).rows).toHaveLength(1);
    await deveFalhar(extrato, [salaoA, bia, DE_RECENTE(), agoraMais()]);
    await deveFalhar(extrato, [salaoA, carla, DE_RECENTE(), agoraMais()]);
  });

  it("o assistente vê o próprio, sem o nome da cliente", async () => {
    await como(carlaUser);
    const r = (await db.query(extrato, [salaoA, carla, DE_RECENTE(), agoraMais()])).rows;
    expect(r).toHaveLength(1);
    expect(r[0].cliente_nome).toBeNull();
    expect(r[0].parte_assistente_centavos).toBeNull();
    await deveFalhar(extrato, [salaoA, ana, DE_RECENTE(), agoraMais()]);
  });

  it("recepção sem cadastro, visitante e outro salão não veem nada", async () => {
    await como(recepcaoA);
    await deveFalhar(extrato, [salaoA, ana, DE_RECENTE(), agoraMais()]);
    await como(donoB);
    await deveFalhar(extrato, [salaoA, ana, DE_RECENTE(), agoraMais()]);
    expect((await db.query(extrato, [salaoB, ana, DE_RECENTE(), agoraMais()])).rows).toEqual([]); // no próprio salão, nada do A
    await como(null);
    await deveFalhar(extrato, [salaoA, ana, DE_RECENTE(), agoraMais()]);
  });

  it("período: fora dele não aparece; mais de 400 dias é recusado", async () => {
    await como(donoA);
    expect((await db.query(extrato, [salaoA, ana, DE, "2000-02-01T00:00:00Z"])).rows).toEqual([]);
    await deveFalhar(extrato, [salaoA, ana, "2020-01-01T00:00:00Z", agoraMais()]);
    await deveFalhar(extrato, [salaoA, ana, agoraMais(), DE_RECENTE()]);
  });

  it("comanda reaberta aparece como estorno e zera o total", async () => {
    await como(recepcaoA);
    await db.query("select public.reabrir_comanda($1, 'Teste de estorno')", [comanda]);
    await como(anaUser);
    const r = (await db.query(extrato, [salaoA, ana, DE_RECENTE(), agoraMais()])).rows;
    expect(r.map((x) => [x.estorno, Number(x.valor_centavos)])).toEqual([
      [false, 8000],
      [true, -8000],
    ]);
  });
});
