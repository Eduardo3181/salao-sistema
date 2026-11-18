/**
 * Pagamento de comissões (Etapa 5, parte 5): só o dono registra; o valor é exatamente o saldo
 * a pagar (nunca passa do extrato); nada é apagado (cancelamento com motivo); estorno vira ajuste;
 * cada um vê só os próprios pagamentos; isolamento entre salões.
 * Roda no banco de TESTE dentro de uma transação desfeita no final.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { novaConexao } from "./apoio/banco";

const { db, como, comoAdmin, comoServidor, deveFalhar, criarUsuario, criarSalao, colocarNaEquipe } = novaConexao();

let donoA = "", donoB = "", recepcaoA = "", anaUser = "";
let salaoA = "";
let ana = "", bia = "";
let corte = "", cliente = "";
let hoje = "";
let comanda1 = "";

const pagar = "select public.registrar_pagamento_comissao($1, $2, $3, $4, $5, $6, $7) as id";
const cancelar = "select public.cancelar_pagamento_comissao($1, $2)";


/** Abre, fecha (Pix) e grava a comissão de uma comanda com um corte. */
async function comandaComComissao(prof: string, comissao: number) {
  await como(recepcaoA);
  const id = (await db.query("select public.abrir_comanda($1, $2, null) as id", [salaoA, cliente])).rows[0].id as string;
  await db.query("select public.lancar_item_comanda($1, 'servico', $2, $3, 1, null, 0)", [id, corte, prof]);
  await db.query("select public.registrar_pagamento($1, 'pix', 10000, 1, null)", [id]);
  await gravar(id, prof, comissao);
  return id;
}
async function gravar(comanda: string, prof: string, comissao: number) {
  await comoAdmin();
  const item = (await db.query("select id from public.comanda_itens where comanda_id = $1 and removido_em is null", [comanda])).rows[0].id;
  const f = (await db.query("select fechada_em::text as f from public.comandas where id = $1", [comanda])).rows[0].f;
  await comoServidor();
  await db.query("select public.gravar_comissoes($1, $2, $3, '[]', $4)", [
    comanda,
    f,
    JSON.stringify([{ item_id: item, snapshot: { v: 1 } }]),
    JSON.stringify([{ item_id: item, profissional_id: prof, papel: "profissional", valor_centavos: comissao }]),
  ]);
}
const saldo = async (prof: string) => {
  await comoAdmin();
  return Number((await db.query("select coalesce(sum(valor_centavos), 0) as s from public.comissoes where profissional_id = $1 and pagamento_id is null", [prof])).rows[0].s);
};

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
  ana = await prof("Ana", anaUser);
  bia = await prof("Bia", null);
  const cat = (await db.query("insert into public.categorias_servico (salao_id, nome) values ($1, 'Cabelo') returning id", [salaoA])).rows[0].id;
  corte = (await db.query("insert into public.servicos (salao_id, categoria_id, nome, duracao_min, preco_centavos) values ($1, $2, 'Corte', 45, 10000) returning id", [salaoA, cat])).rows[0].id;
  cliente = (await db.query("insert into public.clientes (salao_id, nome) values ($1, 'Maria Fictícia') returning id", [salaoA])).rows[0].id;

  comanda1 = await comandaComComissao(ana, 5000);
  await comandaComComissao(ana, 4000);
  await comandaComComissao(bia, 3000);
});

afterAll(async () => {
  await db.query("rollback");
  await db.end();
});

describe("Quem registra", () => {
  it("recepção, profissional, visitante e outro salão não registram nem mexem direto", async () => {
    for (const quem of [recepcaoA, anaUser, donoB]) {
      await como(quem);
      await deveFalhar(pagar, [salaoA, ana, hoje, 9000, "pix", hoje, null]);
      await deveFalhar("insert into public.pagamentos_comissao (salao_id, profissional_id, ate, primeiro_lancamento, valor_centavos, quantidade, lancamentos, meio, pago_em) values ($1, $2, $3, $3, 1, 1, '{}', 'pix', $3)", [salaoA, ana, hoje]);
      await deveFalhar("update public.comissoes set pagamento_id = null");
    }
    await como(null);
    await deveFalhar(pagar, [salaoA, ana, hoje, 9000, "pix", hoje, null]);
    expect(await saldo(ana)).toBe(9000);
  });

  it("o valor precisa ser exatamente o saldo a pagar (nem a mais, nem a menos)", async () => {
    await como(donoA);
    await deveFalhar(pagar, [salaoA, ana, hoje, 9001, "pix", hoje, null]);
    await deveFalhar(pagar, [salaoA, ana, hoje, 5000, "pix", hoje, null]);
    expect(await saldo(ana)).toBe(9000);
  });

  it("datas no futuro são recusadas", async () => {
    await como(donoA);
    await deveFalhar(pagar, [salaoA, ana, "2999-01-01", 9000, "pix", hoje, null]);
    await deveFalhar(pagar, [salaoA, ana, hoje, 9000, "pix", "2999-01-01", null]);
  });

  it("até uma data passada só entra o que foi lançado até ela", async () => {
    await como(donoA);
    await deveFalhar(pagar, [salaoA, ana, "2000-01-01", 0, "pix", hoje, null]); // nada a pagar
  });

  it("o dono registra: quita os lançamentos e não deixa pagar duas vezes", async () => {
    await como(donoA);
    const id = (await db.query(pagar, [salaoA, ana, hoje, 9000, "pix", hoje, "Pago na conta de sempre"])).rows[0].id;
    expect(id).toBeTruthy();
    expect(await saldo(ana)).toBe(0);
    expect(await saldo(bia)).toBe(3000); // a outra pessoa não é afetada
    await como(donoA);
    await deveFalhar(pagar, [salaoA, ana, hoje, 0, "pix", hoje, null]);
    await deveFalhar(pagar, [salaoA, ana, hoje, 9000, "pix", hoje, null]);
    await comoAdmin();
    const p = (await db.query("select valor_centavos::int as v, quantidade, cardinality(lancamentos) as n from public.pagamentos_comissao where id = $1", [id])).rows[0];
    expect(p).toEqual({ v: 9000, quantidade: 2, n: 2 });
  });
});

describe("Quem vê", () => {
  it("o profissional vê os próprios pagamentos e itens; recepção e outro salão não", async () => {
    await como(anaUser);
    const meus = (await db.query("select id, profissional_id from public.pagamentos_comissao")).rows;
    expect(meus).toHaveLength(1);
    expect(meus[0].profissional_id).toBe(ana);
    const itens = (await db.query("select * from public.itens_pagamento_comissao($1)", [meus[0].id])).rows;
    expect(itens.map((i) => Number(i.valor_centavos)).sort()).toEqual([4000, 5000]);
    expect(itens[0].item_nome).toBe("Corte");
    for (const quem of [recepcaoA, donoB]) {
      await como(quem);
      expect((await db.query("select id from public.pagamentos_comissao")).rows).toEqual([]);
      expect((await db.query("select * from public.itens_pagamento_comissao($1)", [meus[0].id])).rows).toEqual([]);
    }
  });

  it("o extrato mostra a data do pagamento", async () => {
    await como(anaUser);
    const r = (await db.query("select pago_em::text as p from public.extrato_comissoes($1, $2, now() - interval '1 day', now() + interval '1 day')", [salaoA, ana])).rows;
    expect(r.map((x) => x.p)).toEqual([hoje, hoje]);
  });
});

describe("Ajustes e cancelamento", () => {
  it("comanda reaberta depois de paga: o estorno fica a pagar como ajuste (saldo negativo não se paga)", async () => {
    await como(recepcaoA);
    await db.query("select public.reabrir_comanda($1, 'Cliente devolveu')", [comanda1]);
    expect(await saldo(ana)).toBe(-5000);
    await como(donoA);
    await deveFalhar(pagar, [salaoA, ana, hoje, -5000, "pix", hoje, null]);
    // Comanda corrigida e fechada de novo, com comissão menor: o próximo pagamento é a diferença.
    await como(recepcaoA);
    await db.query("select public.fechar_comanda($1)", [comanda1]);
    await gravar(comanda1, ana, 4500);
    expect(await saldo(ana)).toBe(-500);
    await comandaComComissao(ana, 6000);
    expect(await saldo(ana)).toBe(5500);
    await como(donoA);
    await db.query(pagar, [salaoA, ana, hoje, 5500, "dinheiro", hoje, null]);
    expect(await saldo(ana)).toBe(0);
  });

  it("cancelar: só o dono, com motivo; nada é apagado e os lançamentos voltam a ficar a pagar", async () => {
    await como(donoA);
    const bId = (await db.query(pagar, [salaoA, bia, hoje, 3000, "transferencia", hoje, null])).rows[0].id;
    await como(recepcaoA);
    await deveFalhar(cancelar, [bId, "Pessoa errada"]);
    await como(donoA);
    await deveFalhar(cancelar, [bId, "x"]);
    await db.query(cancelar, [bId, "Pessoa errada"]);
    await deveFalhar(cancelar, [bId, "De novo"]);
    expect(await saldo(bia)).toBe(3000);
    await comoAdmin();
    const p = (await db.query("select cancelado_em is not null as c, motivo_cancelamento as m from public.pagamentos_comissao where id = $1", [bId])).rows[0];
    expect(p).toEqual({ c: true, m: "Pessoa errada" });
    await como(donoA);
    await deveFalhar("delete from public.pagamentos_comissao where id = $1", [bId]);
    // Pode registrar de novo, certo.
    await db.query(pagar, [salaoA, bia, hoje, 3000, "pix", hoje, null]);
    expect(await saldo(bia)).toBe(0);
  });

  it("o histórico de atividades guarda registro e cancelamento", async () => {
    await comoAdmin();
    const n = (await db.query("select count(*)::int as n from public.audit_log where entidade = 'pagamentos_comissao' and salao_id = $1", [salaoA])).rows[0].n;
    expect(n).toBeGreaterThanOrEqual(4);
  });
});

describe("Ajustes da revisão", () => {
  it("saldos a pagar somados no banco: só o dono vê", async () => {
    await comandaComComissao(bia, 2500);
    await como(donoA);
    const r = (await db.query("select profissional_id, total_centavos::int as t, quantidade::int as q from public.saldos_comissao_a_pagar($1, $2::date)", [salaoA, hoje])).rows;
    expect(r).toEqual([{ profissional_id: bia, t: 2500, q: 1 }]);
    for (const quem of [recepcaoA, anaUser, donoB]) {
      await como(quem);
      await deveFalhar("select * from public.saldos_comissao_a_pagar($1, $2::date)", [salaoA, hoje]);
    }
  });

  it("a data do pagamento não pode ser antes das comissões que ele quita", async () => {
    await comoAdmin();
    const ontem = (await db.query("select ($1::date - 1)::text as d", [hoje])).rows[0].d;
    await como(donoA);
    await deveFalhar(pagar, [salaoA, bia, hoje, 2500, "pix", ontem, null]);
    await db.query(pagar, [salaoA, bia, hoje, 2500, "pix", hoje, null]);
  });

  it("o extrato traz o total e a quantidade do período inteiro em cada linha", async () => {
    await como(donoA);
    const r = (await db.query("select valor_centavos::int as v, total_periodo_centavos::int as t, quantidade_periodo::int as q from public.extrato_comissoes($1, $2, now() - interval '1 day', now() + interval '1 day')", [salaoA, ana])).rows;
    const soma = r.reduce((s, x) => s + x.v, 0);
    expect(r.every((x) => x.t === soma && x.q === r.length)).toBe(true);
  });
});
