/**
 * Caixa do dia (Etapa 6, parte 1): abrir com troco, entradas das comandas, retiradas e reforços,
 * comissões e vales em dinheiro, fechamento com conferência e motivo da diferença, reabrir só o dono,
 * quem vê e isolamento entre salões.
 * Roda no banco de TESTE dentro de uma transação desfeita no final.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { novaConexao } from "./apoio/banco";

const { db, como, comoAdmin, comoServidor, deveFalhar, criarUsuario, criarSalao, colocarNaEquipe } = novaConexao();

let donoA = "", donoB = "", recepcaoA = "", anaUser = "";
let salaoA = "";
let ana = "", corte = "", cliente = "";
let hoje = "", caixaA = "";

const resumo = async (quem: string, data = hoje) => {
  await como(quem);
  return (await db.query("select public.resumo_caixa($1, $2::date) as r", [salaoA, data])).rows[0].r;
};
const esperado = async () => Number((await resumo(donoA)).esperado_dinheiro);

/** Comanda com um corte de R$ 100, paga numa forma, e comissão gravada pelo servidor. */
async function comandaPaga(forma: string, valor = 10000, recebido: number | null = null) {
  await como(recepcaoA);
  const id = (await db.query("select public.abrir_comanda($1, $2, null) as id", [salaoA, cliente])).rows[0].id as string;
  await db.query("select public.lancar_item_comanda($1, 'servico', $2, $3, 1, $4, 0)", [id, corte, ana, valor]);
  await db.query("select public.registrar_pagamento($1, $2, $3, 1, $4)", [id, forma, valor, recebido]);
  return id;
}

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
  ana = (await db.query("insert into public.profissionais (salao_id, nome, tipo, user_id) values ($1, 'Ana', 'profissional', $2) returning id", [salaoA, anaUser])).rows[0].id;
  const cat = (await db.query("insert into public.categorias_servico (salao_id, nome) values ($1, 'Cabelo') returning id", [salaoA])).rows[0].id;
  corte = (await db.query("insert into public.servicos (salao_id, categoria_id, nome, duracao_min, preco_centavos) values ($1, $2, 'Corte', 45, 10000) returning id", [salaoA, cat])).rows[0].id;
  cliente = (await db.query("insert into public.clientes (salao_id, nome) values ($1, 'Maria Fictícia') returning id", [salaoA])).rows[0].id;
});

afterAll(async () => {
  await db.query("rollback");
  await db.end();
});

describe("Abrir", () => {
  it("profissional, visitante e outro salão não abrem nem veem o caixa", async () => {
    for (const quem of [anaUser, donoB]) {
      await como(quem);
      await deveFalhar("select public.abrir_caixa($1, 0)", [salaoA]);
      await deveFalhar("select public.resumo_caixa($1, $2::date)", [salaoA, hoje]);
      await deveFalhar("insert into public.caixas (salao_id, data, troco_inicial_centavos) values ($1, $2, 0)", [salaoA, hoje]);
    }
    await como(null);
    await deveFalhar("select public.abrir_caixa($1, 0)", [salaoA]);
  });

  it("receber pagamento não depende do caixa aberto", async () => {
    await comandaPaga("pix", 5000);
    expect((await resumo(donoA)).entradas_por_forma).toEqual({ pix: 5000 });
  });

  it("sem troco é recusado; a recepção abre com troco; não abre duas vezes", async () => {
    await como(recepcaoA);
    await deveFalhar("select public.abrir_caixa($1, -1)", [salaoA]);
    caixaA = (await db.query("select public.abrir_caixa($1, 10000) as id", [salaoA])).rows[0].id;
    await deveFalhar("select public.abrir_caixa($1, 0)", [salaoA]);
    expect(await esperado()).toBe(10000);
  });
});

describe("Movimento do dia", () => {
  it("dinheiro recebido entra (troco ao cliente não conta); Pix e cartão aparecem por forma", async () => {
    await comandaPaga("dinheiro", 8000, 10000); // cliente deu R$ 100, troco R$ 20
    await comandaPaga("debito", 12000);
    const r = await resumo(donoA);
    expect(r.entradas_por_forma).toEqual({ pix: 5000, dinheiro: 8000, debito: 12000 });
    expect(Number(r.esperado_dinheiro)).toBe(18000); // 100 de troco + 80
  });

  it("pagamento removido da comanda deixa de contar", async () => {
    const id = await comandaPaga("dinheiro", 3000);
    expect(await esperado()).toBe(21000);
    await comoAdmin();
    const pag = (await db.query("select id from public.pagamentos where comanda_id = $1", [id])).rows[0].id;
    await como(recepcaoA);
    await deveFalhar("select public.remover_pagamento($1, 'Errado')", [pag]); // comanda já fechou
    await db.query("select public.reabrir_comanda($1, 'Lançado errado')", [id]);
    await db.query("select public.remover_pagamento($1, 'Lançado errado')", [pag]);
    expect(await esperado()).toBe(18000);
  });

  it("retirada e reforço com motivo; retirada não passa do dinheiro no caixa", async () => {
    await como(recepcaoA);
    await deveFalhar("select public.registrar_movimento_caixa($1, 'retirada', 5000, 'x')", [salaoA]);
    await deveFalhar("select public.registrar_movimento_caixa($1, 'retirada', 18001, 'Banco')", [salaoA]);
    await db.query("select public.registrar_movimento_caixa($1, 'retirada', 5000, 'Depósito no banco')", [salaoA]);
    await db.query("select public.registrar_movimento_caixa($1, 'reforco', 2000, 'Troco extra')", [salaoA]);
    expect(await esperado()).toBe(15000);
    await como(anaUser);
    await deveFalhar("select public.registrar_movimento_caixa($1, 'reforco', 100, 'Teste')", [salaoA]);
  });

  it("cancelar movimento com motivo (nada é apagado)", async () => {
    await comoAdmin();
    const mov = (await db.query("select id from public.caixa_movimentos where tipo = 'reforco' and salao_id = $1", [salaoA])).rows[0].id;
    await como(recepcaoA);
    await deveFalhar("select public.cancelar_movimento_caixa($1, 'x')", [mov]);
    await db.query("select public.cancelar_movimento_caixa($1, 'Lancei errado')", [mov]);
    await deveFalhar("select public.cancelar_movimento_caixa($1, 'De novo')", [mov]);
    await deveFalhar("delete from public.caixa_movimentos where id = $1", [mov]);
    expect(await esperado()).toBe(13000);
  });

  it("comissão e vale pagos em dinheiro saem do caixa; cancelados voltam", async () => {
    await comoAdmin();
    const comanda = (await db.query("select id, fechada_em::text as f from public.comandas where salao_id = $1 and situacao = 'fechada' order by aberta_em limit 1", [salaoA])).rows[0];
    const item = (await db.query("select id from public.comanda_itens where comanda_id = $1", [comanda.id])).rows[0].id;
    await comoServidor();
    await db.query("select public.gravar_comissoes($1, $2, $3, '[]', $4)", [
      comanda.id,
      comanda.f,
      JSON.stringify([{ item_id: item, snapshot: { v: 1 } }]),
      JSON.stringify([{ item_id: item, profissional_id: ana, papel: "profissional", valor_centavos: 2500 }]),
    ]);
    await como(donoA);
    await db.query("select public.registrar_vale($1, $2, 1000, $3, 'dinheiro', null)", [salaoA, ana, hoje]);
    expect(await esperado()).toBe(12000);
    await como(donoA);
    const pag = (await db.query("select public.registrar_pagamento_comissao($1, $2, $3, 2500, 'dinheiro', $3, null, 1000) as id", [salaoA, ana, hoje])).rows[0].id;
    expect(await esperado()).toBe(10500); // entregou R$ 15 (comissão 25 − vale 10)
    await como(donoA);
    await db.query("select public.cancelar_pagamento_comissao($1, 'Errado')", [pag]);
    expect(await esperado()).toBe(12000);
  });
});

describe("Quem vê", () => {
  it("a recepção vê o caixa de hoje, não o de outros dias; o dono vê qualquer dia", async () => {
    await como(recepcaoA);
    await deveFalhar("select public.resumo_caixa($1, '2026-01-01'::date)", [salaoA]);
    const r = await resumo(donoA, "2026-01-01");
    expect(r.caixa).toBeNull();
    expect(Number(r.esperado_dinheiro)).toBe(0);
  });

  it("tabelas: dono e recepção veem; profissional e outro salão não", async () => {
    await como(recepcaoA);
    expect((await db.query("select id from public.caixas")).rows).toHaveLength(1);
    for (const quem of [anaUser, donoB]) {
      await como(quem);
      expect((await db.query("select id from public.caixas")).rows).toEqual([]);
      expect((await db.query("select id from public.caixa_movimentos")).rows).toEqual([]);
    }
  });
});

describe("Fechar e reabrir", () => {
  it("diferença exige motivo; fechamento guarda o esperado e o contado", async () => {
    await como(recepcaoA);
    await deveFalhar("select public.fechar_caixa($1, 11900, true, true, null)", [caixaA]);
    const r = (await db.query("select public.fechar_caixa($1, 11900, true, false, 'Faltou R$ 1 de troco') as r", [caixaA])).rows[0].r;
    expect(r).toEqual({ esperado_centavos: 12000, diferenca_centavos: -100 });
    await comoAdmin();
    const c = (await db.query("select situacao, contado_centavos::int as c, esperado_centavos::int as e, conferido_pix, conferido_cartao, motivo_diferenca from public.caixas where id = $1", [caixaA])).rows[0];
    expect(c).toEqual({ situacao: "fechado", c: 11900, e: 12000, conferido_pix: true, conferido_cartao: false, motivo_diferenca: "Faltou R$ 1 de troco" });
  });

  it("caixa fechado: não fecha de novo, não aceita retirada nem reabre o dia", async () => {
    await como(recepcaoA);
    await deveFalhar("select public.fechar_caixa($1, 12000, true, true, null)", [caixaA]);
    await deveFalhar("select public.registrar_movimento_caixa($1, 'retirada', 100, 'Banco')", [salaoA]);
    await deveFalhar("select public.abrir_caixa($1, 0)", [salaoA]);
  });

  it("só o dono reabre, com motivo; o fechamento anterior fica no histórico", async () => {
    await como(recepcaoA);
    await deveFalhar("select public.reabrir_caixa($1, 'Contei errado')", [caixaA]);
    await como(donoB);
    await deveFalhar("select public.reabrir_caixa($1, 'Contei errado')", [caixaA]);
    await como(donoA);
    await deveFalhar("select public.reabrir_caixa($1, 'x')", [caixaA]);
    await db.query("select public.reabrir_caixa($1, 'Contei errado')", [caixaA]);
    await como(recepcaoA);
    await db.query("select public.fechar_caixa($1, 12000, true, true, null)", [caixaA]);
    await comoAdmin();
    const n = (await db.query("select count(*)::int as n from public.audit_log where entidade = 'caixas' and entidade_id = $1", [caixaA])).rows[0].n;
    expect(n).toBe(4); // aberto, fechado, reaberto, fechado
  });
});
