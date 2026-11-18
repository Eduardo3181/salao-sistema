/**
 * Revisão de segurança (Etapa 7): "intruso" tenta usar TODAS as funções do sistema contra outro salão.
 *
 * O teste monta um salão A com dados de todo tipo e, como dono de outro salão (e também sem login),
 * chama cada função que a equipe pode chamar, passando os ids do salão A.
 * Passa só se: nenhum dado do salão A mudou e nenhuma resposta trouxe dado do salão A.
 * A lista de funções vem do próprio banco: função nova entra no teste sozinha; se ela tiver um
 * parâmetro desconhecido, o teste falha pedindo para ensinar o valor a usar.
 * Roda no banco de TESTE dentro de uma transação desfeita no final.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { novaConexao } from "./apoio/banco";

const { db, como, comoAdmin, comoServidor, criarUsuario, criarSalao, colocarNaEquipe } = novaConexao();

let donoA = "", donoB = "", recepcaoA = "", anaUser = "";
let salaoA = "";
const ids: Record<string, string> = {};
let hoje = "", amanha10 = "", amanha11 = "", ontemTs = "";
const marcas: string[] = ["Maria Fictícia", "Ana Fictícia", "Carla Fictícia", "Conta de luz fictícia"];

type Funcao = { nome: string; params: { nome: string; tipo: string }[] };
let funcoes: Funcao[] = [];

async function retrato() {
  await comoAdmin();
  const tabelas = (
    await db.query(
      "select table_name from information_schema.columns where table_schema = 'public' and column_name = 'salao_id' order by 1",
    )
  ).rows.map((r) => r.table_name as string);
  const partes: Record<string, string> = {};
  for (const t of tabelas) {
    partes[t] = (
      await db.query(`select md5(coalesce(string_agg(x::text, '|' order by x::text), '')) h from public.${t} x where salao_id = $1`, [salaoA])
    ).rows[0].h;
  }
  partes.saloes = (await db.query("select md5(x::text) h from public.saloes x where id = $1", [salaoA])).rows[0].h;
  partes.contas = (await db.query("select count(*)::text h from auth.users")).rows[0].h;
  return partes;
}

beforeAll(async () => {
  await db.connect();
  await db.query("begin");
  // Nenhuma chamada pode ficar presa: cada uma tem no máximo 15 segundos.
  await db.query("set local statement_timeout = '15s'");
  donoA = await criarUsuario();
  donoB = await criarUsuario();
  recepcaoA = await criarUsuario();
  anaUser = await criarUsuario();
  salaoA = await criarSalao(donoA, "Salão A");
  await criarSalao(donoB, "Salão do intruso");
  await colocarNaEquipe(salaoA, recepcaoA, "recepcao");
  await colocarNaEquipe(salaoA, anaUser, "profissional");

  await comoAdmin();
  const d = (
    await db.query(`select (now() at time zone 'America/Sao_Paulo')::date::text h,
      ((((now() at time zone 'America/Sao_Paulo')::date + 1) + time '10:00') at time zone 'America/Sao_Paulo')::text a10,
      ((((now() at time zone 'America/Sao_Paulo')::date + 1) + time '11:00') at time zone 'America/Sao_Paulo')::text a11,
      (now() - interval '1 day')::text o`)
  ).rows[0];
  hoje = d.h;
  amanha10 = d.a10;
  amanha11 = d.a11;
  ontemTs = d.o;
  const um = async (sql: string, p: unknown[]) => (await db.query(sql, p)).rows[0].id as string;
  ids.ana = await um("insert into public.profissionais (salao_id, nome, tipo, user_id) values ($1, 'Ana Fictícia', 'profissional', $2) returning id", [salaoA, anaUser]);
  ids.carla = await um("insert into public.profissionais (salao_id, nome, tipo) values ($1, 'Carla Fictícia', 'assistente') returning id", [salaoA]);
  const cat = await um("insert into public.categorias_servico (salao_id, nome) values ($1, 'Cabelo') returning id", [salaoA]);
  ids.corte = await um("insert into public.servicos (salao_id, categoria_id, nome, duracao_min, preco_centavos) values ($1, $2, 'Corte', 45, 10000) returning id", [salaoA, cat]);
  ids.cliente = await um("insert into public.clientes (salao_id, nome, telefone) values ($1, 'Maria Fictícia', '11988887777') returning id", [salaoA]);
  ids.catLuz = await um("select id from public.categorias_despesa where salao_id = $1 and nome = 'Luz'", [salaoA]);
  ids.membroRecepcao = await um("select id from public.usuarios_salao where salao_id = $1 and user_id = $2", [salaoA, recepcaoA]);
  ids.membroAna = await um("select id from public.usuarios_salao where salao_id = $1 and user_id = $2", [salaoA, anaUser]);

  await como(donoA);
  // Comanda fechada (com pagamento e comissão) e comanda aberta (com item)
  ids.comandaFechada = await um("select public.abrir_comanda($1, $2, null) as id", [salaoA, ids.cliente]);
  await db.query("select public.lancar_item_comanda($1, 'servico', $2, $3, 1, null, 0)", [ids.comandaFechada, ids.corte, ids.ana]);
  await db.query("select public.registrar_pagamento($1, 'pix', 10000, 1, null)", [ids.comandaFechada]);
  ids.comandaAberta = await um("select public.abrir_comanda($1, $2, null) as id", [salaoA, ids.cliente]);
  await db.query("select public.lancar_item_comanda($1, 'servico', $2, $3, 1, null, 0)", [ids.comandaAberta, ids.corte, ids.ana]);
  await comoAdmin();
  ids.itemAberto = await um("select id from public.comanda_itens where comanda_id = $1", [ids.comandaAberta]);
  ids.itemFechado = await um("select id from public.comanda_itens where comanda_id = $1", [ids.comandaFechada]);
  ids.pagamento = await um("select id from public.pagamentos where comanda_id = $1", [ids.comandaFechada]);
  const f = (await db.query("select fechada_em::text as f from public.comandas where id = $1", [ids.comandaFechada])).rows[0].f;
  await comoServidor();
  await db.query("select public.gravar_comissoes($1, $2, $3, '[]', $4)", [
    ids.comandaFechada,
    f,
    JSON.stringify([{ item_id: ids.itemFechado, snapshot: { v: 1 } }]),
    JSON.stringify([{ item_id: ids.itemFechado, profissional_id: ids.ana, papel: "profissional", valor_centavos: 5000 }]),
  ]);

  await como(donoA);
  ids.vale = await um("select public.registrar_vale($1, $2, 1000, $3, 'dinheiro', null) as id", [salaoA, ids.ana, hoje]);
  ids.pagamentoComissao = await um("select public.registrar_pagamento_comissao($1, $2, $3, 5000, 'pix', $3, null, 0) as id", [salaoA, ids.ana, hoje]);
  ids.agendamento = await um("select public.criar_agendamento($1, $2, $3::jsonb) as id", [
    salaoA,
    ids.cliente,
    JSON.stringify([{ servico_id: ids.corte, profissional_id: ids.ana, inicio: amanha10 }]),
  ]);
  await comoAdmin();
  ids.itemAgenda = await um("select id from public.agendamento_itens where agendamento_id = $1", [ids.agendamento]);
  await como(donoA);
  ids.caixa = await um("select public.abrir_caixa($1, 5000) as id", [salaoA]);
  ids.movimento = await um("select public.registrar_movimento_caixa($1, 'retirada', 1000, 'Banco') as id", [salaoA]);
  ids.despesa = await um("select public.criar_despesa($1, $2, 'Conta de luz fictícia', 18050, $3, null, null, null) as id", [salaoA, ids.catLuz, hoje]);
  ids.despesaPaga = await um("select public.criar_despesa($1, $2, 'Água', 5000, $3, $3, 'pix', null) as id", [salaoA, ids.catLuz, hoje]);
  ids.fixa = await um("select public.criar_despesa_fixa($1, $2, 'Aluguel', 150000, 10, $3) as id", [salaoA, ids.catLuz, hoje]);

  marcas.push(salaoA, ...Object.values(ids));

  await comoAdmin();
  funcoes = (
    await db.query(`
      select p.proname as nome,
             coalesce(json_agg(json_build_object('nome', x.n, 'tipo', format_type(x.t, null)) order by x.ord) filter (where x.n is not null), '[]') as params
      from pg_proc p
      left join lateral unnest(p.proargnames[1:p.pronargs], p.proargtypes::oid[]) with ordinality as x(n, t, ord) on true
      where p.pronamespace = 'public'::regnamespace and p.prokind = 'f'
        and has_function_privilege('authenticated', p.oid, 'execute')
      group by p.oid, p.proname
      order by p.proname`)
  ).rows;
});

afterAll(async () => {
  await db.query("rollback");
  await db.end();
});

/** Valores que o intruso tenta em cada parâmetro (ids do salão A, ou valores comuns). */
function candidatos(p: { nome: string; tipo: string }): unknown[] | undefined {
  const porNome: Record<string, unknown[]> = {
    p_salao_id: [salaoA],
    p_comanda_id: [ids.comandaAberta, ids.comandaFechada],
    p_item_id: [ids.itemAberto, ids.itemAgenda],
    p_agendamento_id: [ids.agendamento],
    p_assistente_id: [ids.carla],
    p_assistentes: [[ids.carla]],
    p_profissionais: [[ids.ana]],
    p_profissional_id: [ids.ana],
    p_cliente_id: [ids.cliente],
    p_id: [ids.cliente],
    p_caixa_id: [ids.caixa],
    p_movimento_id: [ids.movimento],
    p_categoria_id: [ids.catLuz],
    p_despesa_id: [ids.despesa, ids.despesaPaga],
    p_fixa_id: [ids.fixa],
    p_vale_id: [ids.vale],
    p_pagamento_id: [ids.pagamento, ids.pagamentoComissao],
    p_membro_id: [ids.membroRecepcao, ids.membroAna],
    p_user_id: [donoB],
    p_ref_id: [ids.corte],
    p_ignorar_item: [null],
    p_ativo: [true, false],
    p_busca: [null, "Maria"],
    p_incluir_inativas: [true],
    p_conferido_cartao: [true],
    p_conferido_pix: [true],
    p_senha_provisoria: [false],
    p_contado: [4000],
    p_desconto: [0],
    p_desconto_vales: [0],
    p_preco_unitario: [1000],
    p_recebido: [1000],
    p_troco: [1000],
    p_valor: [1000],
    p_valor_conferido: [5000],
    p_dia: [10],
    p_duracao_min: [30],
    p_mes: [Number(hoje.slice(5, 7))],
    p_parcelas: [1],
    p_quantidade: [1],
    p_descricao: ["Intruso"],
    p_nome: ["Intruso"],
    p_observacao: [null],
    p_itens: [JSON.stringify([{ servico_id: ids.corte, profissional_id: ids.ana, inicio: amanha11 }])],
    p_linhas: [JSON.stringify([{ nome: "Intruso", telefone: "11977776666" }])],
  };
  const porTipo: Record<string, unknown[]> = {
    date: [hoje],
    "timestamp with time zone": [p.nome === "p_de" ? ontemTs : p.nome === "p_fim" || p.nome === "p_ate" ? amanha11 : amanha10],
    forma_despesa: ["pix"],
    forma_pagamento: ["pix"],
    meio_pagamento_comissao: ["pix"],
    motivo_cancelamento: ["outro"],
    perfil_usuario: ["recepcao"],
    situacao_agendamento: ["confirmado", "cancelado"],
    tipo_item_comanda: ["servico"],
    tipo_movimento_caixa: ["retirada"],
  };
  if (p.nome === "p_motivo" && p.tipo === "text") return ["Intruso tentando"];
  return porTipo[p.tipo] ?? porNome[p.nome];
}

function combinacoes(listas: unknown[][]): unknown[][] {
  return listas.reduce<unknown[][]>((acc, l) => acc.flatMap((a) => l.map((v) => [...a, v])), [[]]);
}

async function tentarTudo(quem: string | null, so?: string[]) {
  const vazamentos: string[] = [];
  const desconhecidos: string[] = [];
  const travadas: string[] = [];
  for (const f of funcoes.filter((x) => !so || so.includes(x.nome))) {
    const listas = f.params.map((p) => candidatos(p));
    const falta = f.params.filter((_, i) => !listas[i]);
    if (falta.length) {
      desconhecidos.push(`${f.nome}: ${falta.map((p) => `${p.nome} (${p.tipo})`).join(", ")}`);
      continue;
    }
    const sinal = f.params.map((p, i) => `$${i + 1}::${p.tipo}`).join(", ");
    for (const args of combinacoes(listas as unknown[][])) {
      await como(quem);
      await db.query("savepoint intruso");
      try {
        const r = await db.query(`select * from public.${f.nome}(${sinal})`, args);
        const texto = JSON.stringify(r.rows);
        const achou = marcas.filter((m) => texto.includes(m));
        if (achou.length) vazamentos.push(`${f.nome}(${JSON.stringify(args)}) devolveu dado do salão A`);
        await db.query("release savepoint intruso");
      } catch (e) {
        // 57014 = passou do limite de tempo: não é recusa, é travamento (o teste acusa).
        if ((e as { code?: string }).code === "57014") travadas.push(`${f.nome}(${JSON.stringify(args)})`);
        await db.query("rollback to savepoint intruso");
      }
    }
  }
  return { vazamentos, desconhecidos, travadas };
}

describe("Intruso tentando usar todas as funções contra outro salão", () => {
  it("o teste conhece todas as funções e tem dados para cada parâmetro", () => {
    expect(funcoes.length).toBeGreaterThan(50);
    const semCandidato = funcoes.flatMap((f) => f.params.filter((p) => !candidatos(p)).map((p) => `${f.nome}: ${p.nome} (${p.tipo})`));
    expect(semCandidato).toEqual([]);
  });

  it("a função que grava comissões não pode ser chamada pela equipe (só pelo servidor)", () => {
    expect(funcoes.map((f) => f.nome)).not.toContain("gravar_comissoes");
  });

  for (const [rotulo, quem] of [
    ["dono de outro salão", () => donoB],
    ["sem login", () => null],
  ] as const) {
    it(`${rotulo}: nada do salão A muda e nada do salão A aparece`, async () => {
      const antes = await retrato();
      const r = await tentarTudo(quem());
      expect(r.desconhecidos).toEqual([]);
      expect(r.travadas).toEqual([]);
      expect(r.vazamentos).toEqual([]);
      const depois = await retrato();
      expect(depois).toEqual(antes);
    }, 300_000);
  }

  it("controle: com o próprio dono do salão A, o teste percebe leitura e mudança (ele enxerga de verdade)", async () => {
    const antes = await retrato();
    const r = await tentarTudo(donoA, ["clientes_do_salao", "registrar_movimento_caixa"]);
    expect(r.vazamentos.length).toBeGreaterThan(0);
    const depois = await retrato();
    expect(depois).not.toEqual(antes);
  });
});
