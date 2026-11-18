/**
 * Relatórios (Etapa 6, parte 3): resultado pelo regime de caixa, vendas por forma, por profissional
 * e por item, despesas por categoria; só o dono; isolamento entre salões.
 * Roda no banco de TESTE dentro de uma transação desfeita no final.
 *
 * Cenário do dia (conta feita à mão):
 *   Comanda 1: Corte R$ 100 (Ana), pago no Pix .................... entra R$ 100,00
 *   Comanda 2: Escova R$ 60 (Ana) + Shampoo R$ 45,90 (Bia), desconto R$ 5,90 na comanda,
 *              pago R$ 100 no débito com taxa de 2% (R$ 2,00) ......... entra R$ 100,00
 *   Comanda 3: paga R$ 50 no Pix, depois reaberta e o pagamento removido (não conta)
 *   Comissão da Ana R$ 50 paga em dinheiro com vale de R$ 10 descontado (entregue R$ 40)
 *   Vale de R$ 10 dado à Ana no dia
 *   Despesa de luz R$ 30 paga; outra cancelada e outra ainda não paga (não contam)
 *   Resultado: 200,00 − 2,00 − 40,00 − 10,00 − 30,00 = R$ 118,00
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { novaConexao } from "./apoio/banco";

const { db, como, comoAdmin, comoServidor, deveFalhar, criarUsuario, criarSalao, colocarNaEquipe } = novaConexao();

let donoA = "", donoB = "", recepcaoA = "", anaUser = "";
let salaoA = "";
let hoje = "";
let rel: Record<string, unknown> = {};

const relatorio = "select public.relatorio_periodo($1, $2::date, $3::date) as r";

beforeAll(async () => {
  await db.connect();
  await db.query("begin");
  donoA = await criarUsuario();
  donoB = await criarUsuario();
  recepcaoA = await criarUsuario();
  anaUser = await criarUsuario();
  salaoA = await criarSalao(donoA, "Salão A");
  await criarSalao(donoB, "Salão B");
  await colocarNaEquipe(salaoA, recepcaoA, "recepcao");
  await colocarNaEquipe(salaoA, anaUser, "profissional");
  await comoAdmin();
  hoje = (await db.query("select ((now() at time zone 'America/Sao_Paulo')::date)::text as d")).rows[0].d;
  const prof = async (nome: string, user: string | null) =>
    (await db.query("insert into public.profissionais (salao_id, nome, tipo, user_id) values ($1, $2, 'profissional', $3) returning id", [salaoA, nome, user])).rows[0].id;
  const ana = await prof("Ana", anaUser);
  const bia = await prof("Bia", null);
  const cat = (await db.query("insert into public.categorias_servico (salao_id, nome) values ($1, 'Cabelo') returning id", [salaoA])).rows[0].id;
  const corte = (await db.query("insert into public.servicos (salao_id, categoria_id, nome, duracao_min, preco_centavos) values ($1, $2, 'Corte', 45, 10000) returning id", [salaoA, cat])).rows[0].id;
  const escova = (await db.query("insert into public.servicos (salao_id, categoria_id, nome, duracao_min, preco_centavos) values ($1, $2, 'Escova', 45, 6000) returning id", [salaoA, cat])).rows[0].id;
  const shampoo = (await db.query("insert into public.produtos (salao_id, nome, preco_centavos) values ($1, 'Shampoo', 4590) returning id", [salaoA])).rows[0].id;
  const cliente = (await db.query("insert into public.clientes (salao_id, nome) values ($1, 'Maria Fictícia') returning id", [salaoA])).rows[0].id;
  const catLuz = (await db.query("select id from public.categorias_despesa where salao_id = $1 and nome = 'Luz'", [salaoA])).rows[0].id;

  await como(donoA);
  await db.query("insert into public.taxas_cartao (salao_id, forma, parcelas, taxa_centesimos) values ($1, 'debito', 1, 200)", [salaoA]);

  await como(recepcaoA);
  const abrir = async () => (await db.query("select public.abrir_comanda($1, $2, null) as id", [salaoA, cliente])).rows[0].id as string;
  const lancar = (c: string, tipo: string, ref: string, prof: string | null) =>
    db.query("select public.lancar_item_comanda($1, $2, $3, $4, 1, null, 0)", [c, tipo, ref, prof]);
  const c1 = await abrir();
  await lancar(c1, "servico", corte, ana);
  await db.query("select public.registrar_pagamento($1, 'pix', 10000, 1, null)", [c1]);
  const c2 = await abrir();
  await lancar(c2, "servico", escova, ana);
  await lancar(c2, "produto", shampoo, bia);
  await db.query("select public.definir_desconto_comanda($1, 590)", [c2]);
  await db.query("select public.registrar_pagamento($1, 'debito', 10000, 1, null)", [c2]);
  const c3 = await abrir();
  await lancar(c3, "servico", escova, ana);
  await db.query("select public.definir_desconto_comanda($1, 1000)", [c3]);
  await db.query("select public.registrar_pagamento($1, 'pix', 5000, 1, null)", [c3]);
  await db.query("select public.reabrir_comanda($1, 'Pagamento errado')", [c3]);
  await comoAdmin();
  const pag3 = (await db.query("select id from public.pagamentos where comanda_id = $1", [c3])).rows[0].id;
  await como(recepcaoA);
  await db.query("select public.remover_pagamento($1, 'Pagamento errado')", [pag3]);

  // Comissão da Ana gravada pelo servidor na comanda 1
  await comoAdmin();
  const item = (await db.query("select id from public.comanda_itens where comanda_id = $1", [c1])).rows[0].id;
  const f = (await db.query("select fechada_em::text as f from public.comandas where id = $1", [c1])).rows[0].f;
  await comoServidor();
  await db.query("select public.gravar_comissoes($1, $2, $3, '[]', $4)", [
    c1,
    f,
    JSON.stringify([{ item_id: item, snapshot: { v: 1 } }]),
    JSON.stringify([{ item_id: item, profissional_id: ana, papel: "profissional", valor_centavos: 5000 }]),
  ]);
  await como(donoA);
  await db.query("select public.registrar_vale($1, $2, 1000, $3, 'dinheiro', null)", [salaoA, ana, hoje]);
  await db.query("select public.registrar_pagamento_comissao($1, $2, $3, 5000, 'dinheiro', $3, null, 1000)", [salaoA, ana, hoje]);

  // Despesas
  const criar = "select public.criar_despesa($1, $2, $3, $4, $5, $6, $7, null) as id";
  await db.query(criar, [salaoA, catLuz, "Conta de luz", 3000, hoje, hoje, "pix"]);
  const cancelada = (await db.query(criar, [salaoA, catLuz, "Em dobro", 3000, hoje, null, null])).rows[0].id;
  await db.query("select public.cancelar_despesa($1, 'Lancei em dobro')", [cancelada]);
  await db.query(criar, [salaoA, catLuz, "Água", 2000, hoje, null, null]);

  await como(donoA);
  rel = (await db.query(relatorio, [salaoA, hoje, hoje])).rows[0].r;
});

afterAll(async () => {
  await db.query("rollback");
  await db.end();
});

const num = (v: unknown) => Number(v);

describe("Resultado do período (regime de caixa)", () => {
  it("bate com a conta feita à mão", () => {
    const r = rel.resultado as Record<string, unknown>;
    expect(Object.fromEntries(Object.entries(r).map(([k, v]) => [k, num(v)]))).toEqual({
      entradas: 20000,
      taxas_cartao: 200,
      comissoes_pagas: 4000,
      vales: 1000,
      despesas: 3000,
      resultado: 11800,
    });
  });

  it("período sem movimento dá zero", async () => {
    await como(donoA);
    const r = (await db.query(relatorio, [salaoA, "2020-01-01", "2020-01-31"])).rows[0].r;
    expect(num(r.resultado.resultado)).toBe(0);
    expect(r.por_forma).toEqual([]);
  });
});

describe("Vendas", () => {
  it("por forma de pagamento (pagamento removido não conta)", () => {
    const f = (rel.por_forma as { forma: string; total: number; quantidade: number; taxas: number }[]).map((x) => [x.forma, num(x.total), num(x.quantidade), num(x.taxas)]);
    expect(f.sort()).toEqual([
      ["debito", 10000, 1, 200],
      ["pix", 10000, 1, 0],
    ]);
  });

  it("por profissional e por item: só comandas fechadas; desconto da comanda à parte", () => {
    const p = (rel.por_profissional as { nome: string; servicos: number; produtos: number; total: number }[]).map((x) => [x.nome, num(x.servicos), num(x.produtos), num(x.total)]);
    expect(p).toEqual([
      ["Ana", 16000, 0, 16000],
      ["Bia", 0, 4590, 4590],
    ]);
    const i = (rel.por_item as { nome: string; quantidade: number; total: number }[]).map((x) => [x.nome, num(x.quantidade), num(x.total)]);
    expect(i).toEqual([
      ["Corte", 1, 10000],
      ["Escova", 1, 6000],
      ["Shampoo", 1, 4590],
    ]);
    expect(num(rel.descontos_comanda)).toBe(590);
    expect(num(rel.comandas_fechadas)).toBe(2);
  });

  it("despesas por categoria (só as pagas; canceladas não contam)", () => {
    expect((rel.por_categoria as { nome: string; total: number; quantidade: number }[]).map((x) => [x.nome, num(x.total), num(x.quantidade)])).toEqual([["Luz", 3000, 1]]);
  });

  it("informa comissões do período ainda não pagas", () => {
    expect(num(rel.comissoes_a_pagar)).toBe(0); // a única comissão foi paga
  });
});

describe("Quem vê", () => {
  it("só o dono do salão; período de mais de 400 dias é recusado", async () => {
    for (const quem of [recepcaoA, anaUser, donoB]) {
      await como(quem);
      await deveFalhar(relatorio, [salaoA, hoje, hoje]);
    }
    await como(null);
    await deveFalhar(relatorio, [salaoA, hoje, hoje]);
    await como(donoA);
    await deveFalhar(relatorio, [salaoA, "2020-01-01", hoje]);
    await deveFalhar(relatorio, [salaoA, hoje, "2020-01-01"]);
  });
});
