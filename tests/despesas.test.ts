/**
 * Despesas (Etapa 6, parte 2): categorias prontas, contas a pagar, despesas fixas mensais,
 * pagamento em dinheiro saindo do caixa, nada apagado, só o dono e isolamento entre salões.
 * Roda no banco de TESTE dentro de uma transação desfeita no final.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { novaConexao } from "./apoio/banco";

const { db, como, comoAdmin, deveFalhar, criarUsuario, criarSalao, colocarNaEquipe } = novaConexao();

let donoA = "", donoB = "", recepcaoA = "";
let salaoA = "", salaoB = "";
let hoje = "", ontem = "", mesAtual = "";
let catLuz = "", catDeB = "";
let conta = "";

const criar = "select public.criar_despesa($1, $2, $3, $4, $5, $6, $7, null) as id";
const esperadoCaixa = async () => {
  await como(donoA);
  return Number((await db.query("select public.resumo_caixa($1, $2::date) as r", [salaoA, hoje])).rows[0].r.esperado_dinheiro);
};

beforeAll(async () => {
  await db.connect();
  await db.query("begin");
  donoA = await criarUsuario();
  donoB = await criarUsuario();
  recepcaoA = await criarUsuario();
  salaoA = await criarSalao(donoA, "Salão A");
  salaoB = await criarSalao(donoB, "Salão B");
  await colocarNaEquipe(salaoA, recepcaoA, "recepcao");
  await comoAdmin();
  const d = (await db.query("select ((now() at time zone 'America/Sao_Paulo')::date)::text as h, ((now() at time zone 'America/Sao_Paulo')::date - 1)::text as o")).rows[0];
  hoje = d.h;
  ontem = d.o;
  mesAtual = hoje.slice(0, 7);
  catLuz = (await db.query("select id from public.categorias_despesa where salao_id = $1 and nome = 'Luz'", [salaoA])).rows[0].id;
  catDeB = (await db.query("select id from public.categorias_despesa where salao_id = $1 and nome = 'Luz'", [salaoB])).rows[0].id;
});

afterAll(async () => {
  await db.query("rollback");
  await db.end();
});

describe("Categorias", () => {
  it("salão novo já nasce com as 10 categorias prontas", async () => {
    await como(donoA);
    const nomes = (await db.query("select nome from public.categorias_despesa order by nome")).rows.map((r) => r.nome);
    expect(nomes).toEqual(["Água", "Aluguel", "Impostos", "Internet", "Luz", "Manutenção", "Marketing", "Outros", "Produtos", "Salários"]);
  });

  it("o dono cria e desativa; nome repetido é recusado; recepção e outro salão não mexem", async () => {
    await como(donoA);
    const id = (await db.query("select public.criar_categoria_despesa($1, 'Café e copa') as id", [salaoA])).rows[0].id;
    await deveFalhar("select public.criar_categoria_despesa($1, ' luz ')", [salaoA]);
    await db.query("select public.ativar_categoria_despesa($1, false)", [id]);
    await deveFalhar(criar, [salaoA, id, "Café", 1000, hoje, null, null]); // categoria desativada
    for (const quem of [recepcaoA, donoB]) {
      await como(quem);
      await deveFalhar("select public.criar_categoria_despesa($1, 'Outra')", [salaoA]);
      await deveFalhar("select public.ativar_categoria_despesa($1, true)", [id]);
    }
  });
});

describe("Contas", () => {
  it("só o dono registra; categoria de outro salão não serve", async () => {
    for (const quem of [recepcaoA, donoB]) {
      await como(quem);
      await deveFalhar(criar, [salaoA, catLuz, "Conta de luz", 18050, hoje, null, null]);
    }
    await como(null);
    await deveFalhar(criar, [salaoA, catLuz, "Conta de luz", 18050, hoje, null, null]);
    await como(donoA);
    await deveFalhar(criar, [salaoA, catDeB, "Conta de luz", 18050, hoje, null, null]);
    await deveFalhar(criar, [salaoA, catLuz, "Conta de luz", 0, hoje, null, null]);
    await deveFalhar(criar, [salaoA, catLuz, "Conta de luz", 100, hoje, hoje, null]); // paga sem forma
    conta = (await db.query(criar, [salaoA, catLuz, "Conta de luz", 18050, hoje, null, null])).rows[0].id;
  });

  it("quem vê: só o dono do salão", async () => {
    await como(donoA);
    expect((await db.query("select id from public.despesas")).rows).toHaveLength(1);
    for (const quem of [recepcaoA, donoB]) {
      await como(quem);
      expect((await db.query("select id from public.despesas where salao_id = $1", [salaoA])).rows).toEqual([]);
      expect((await db.query("select id from public.categorias_despesa where salao_id = $1", [salaoA])).rows).toEqual([]);
    }
  });

  it("paga em dinheiro sai do caixa do dia; desfazer com motivo devolve", async () => {
    await como(donoA);
    await db.query("select public.abrir_caixa($1, 50000)", [salaoA]);
    expect(await esperadoCaixa()).toBe(50000);
    await como(donoA);
    await deveFalhar("select public.pagar_despesa($1, $2, 'dinheiro')", [conta, "2999-01-01"]);
    await db.query("select public.pagar_despesa($1, $2, 'dinheiro')", [conta, hoje]);
    await deveFalhar("select public.pagar_despesa($1, $2, 'pix')", [conta, hoje]); // já paga
    expect(await esperadoCaixa()).toBe(31950);
    await como(donoA);
    await deveFalhar("select public.cancelar_despesa($1, 'Errada')", [conta]); // paga não cancela
    await deveFalhar("select public.desfazer_pagamento_despesa($1, 'x')", [conta]);
    await db.query("select public.desfazer_pagamento_despesa($1, 'Paguei no Pix, não em dinheiro')", [conta]);
    expect(await esperadoCaixa()).toBe(50000);
    await como(donoA);
    await db.query("select public.pagar_despesa($1, $2, 'pix')", [conta, hoje]);
    expect(await esperadoCaixa()).toBe(50000); // Pix não mexe na gaveta
  });

  it("cancelar com motivo; nada é apagado", async () => {
    await como(donoA);
    const id = (await db.query(criar, [salaoA, catLuz, "Lançada em dobro", 18050, hoje, null, null])).rows[0].id;
    await deveFalhar("select public.cancelar_despesa($1, 'x')", [id]);
    await db.query("select public.cancelar_despesa($1, 'Lancei em dobro')", [id]);
    await deveFalhar("select public.cancelar_despesa($1, 'De novo')", [id]);
    await deveFalhar("select public.pagar_despesa($1, $2, 'pix')", [id, hoje]);
    await deveFalhar("delete from public.despesas where id = $1", [id]);
    await deveFalhar("update public.despesas set valor_centavos = 1 where id = $1", [id]);
  });

  it("já paga no cadastro (ontem, em dinheiro) conta no caixa de ontem, não no de hoje", async () => {
    await como(donoA);
    await db.query(criar, [salaoA, catLuz, "Lâmpada", 2500, ontem, ontem, "dinheiro"]);
    expect(await esperadoCaixa()).toBe(50000);
    await como(donoA);
    const r = (await db.query("select public.resumo_caixa($1, $2::date) as r", [salaoA, ontem])).rows[0].r;
    expect(Number(r.despesas_dinheiro)).toBe(2500);
  });
});

describe("Despesas fixas", () => {
  it("gera uma conta por mês desde o início, sem duplicar; dia 31 vira o último dia do mês", async () => {
    await comoAdmin();
    const tresMesesAtras = (await db.query("select (date_trunc('month', $1::date) - interval '3 months')::date::text as d", [hoje])).rows[0].d;
    await como(donoA);
    const fixa = (await db.query("select public.criar_despesa_fixa($1, $2, 'Aluguel', 150000, 31, $3) as id", [salaoA, catLuz, tresMesesAtras])).rows[0].id;
    expect((await db.query("select public.gerar_despesas_fixas($1) as n", [salaoA])).rows[0].n).toBe(0); // já gerou ao criar
    const contas = (await db.query("select vencimento::text as v, competencia::text as c from public.despesas where fixa_id = $1 order by competencia", [fixa])).rows;
    expect(contas).toHaveLength(4); // 3 meses atrás até este mês
    for (const c of contas) {
      const [a, m] = c.c.split("-").map(Number);
      const ultimo = new Date(Date.UTC(a, m, 0)).getUTCDate();
      expect(c.v).toBe(`${c.c.slice(0, 7)}-${String(ultimo).padStart(2, "0")}`);
    }
    expect(contas[contas.length - 1].c).toBe(`${mesAtual}-01`);
  });

  it("encerrar para de gerar; recepção e outro salão não mexem; início muito antigo é recusado", async () => {
    await como(donoA);
    const fixa = (await db.query("select public.criar_despesa_fixa($1, $2, 'Internet', 9990, 10, $3) as id", [salaoA, catLuz, `${mesAtual}-01`])).rows[0].id;
    await deveFalhar("select public.criar_despesa_fixa($1, $2, 'Antiga', 100, 10, '2000-01-01')", [salaoA, catLuz]);
    for (const quem of [recepcaoA, donoB]) {
      await como(quem);
      await deveFalhar("select public.encerrar_despesa_fixa($1)", [fixa]);
      await deveFalhar("select public.gerar_despesas_fixas($1)", [salaoA]);
    }
    await como(donoA);
    await db.query("select public.encerrar_despesa_fixa($1)", [fixa]);
    await deveFalhar("select public.encerrar_despesa_fixa($1)", [fixa]);
    expect((await db.query("select count(*)::int as n from public.despesas where fixa_id = $1", [fixa])).rows[0].n).toBe(1);
  });

  it("o histórico de atividades guarda as despesas", async () => {
    await comoAdmin();
    const n = (await db.query("select count(*)::int as n from public.audit_log where entidade = 'despesas' and salao_id = $1", [salaoA])).rows[0].n;
    expect(n).toBeGreaterThanOrEqual(8);
  });
});

describe("Histórico das categorias", () => {
  it("as categorias prontas não entram no histórico; as do dono entram", async () => {
    const u = await criarUsuario();
    const s = await criarSalao(u, "Salão C");
    await comoAdmin();
    const n = (await db.query("select count(*)::int as n from public.audit_log where entidade = 'categorias_despesa' and salao_id = $1", [s])).rows[0].n;
    expect(n).toBe(0);
    await como(u);
    await db.query("select public.criar_categoria_despesa($1, 'Copa')", [s]);
    await comoAdmin();
    const m = (await db.query("select count(*)::int as n from public.audit_log where entidade = 'categorias_despesa' and salao_id = $1", [s])).rows[0].n;
    expect(m).toBe(1);
  });
});
