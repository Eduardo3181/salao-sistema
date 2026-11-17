/**
 * Comandas (Etapa 4, parte 2a): isolamento entre salões, regras por perfil, preços e exclusão com motivo.
 * Roda no banco de TESTE dentro de uma transação desfeita no final.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { novaConexao } from "./apoio/banco";

const { db, como, comoAdmin, deveFalhar, criarUsuario, criarSalao, colocarNaEquipe } = novaConexao();

let donoA = "", donoB = "", recepcaoA = "", anaUser = "", biaUser = "", assistUser = "";
let salaoA = "", salaoB = "";
let ana = "", bia = "", dani = "", anaB = "";
let corte = "", escova = "", shampoo = "", corteB = "";
let cliente = "", clienteB = "";
let agMisto = "", agAna = "";
let comandaMista = "", comandaAna = "", comandaAvulsa = "";

const amanha = (hora: string) => {
  const d = new Date(Date.now() + 86400000).toLocaleDateString("en-CA", { timeZone: "America/Sao_Paulo" });
  return `${d}T${hora}:00-03:00`;
};
const abrir = "select public.abrir_comanda($1, $2, $3) as id";
const lancar = "select public.lancar_item_comanda($1, $2, $3, $4, $5, $6, $7) as id";
const itensDe = async (comanda: string) =>
  (await db.query("select tipo, profissional_id, preco_unitario_centavos::int as preco, desconto_centavos::int as desc, total_centavos::int as total, removido_em from public.comanda_itens where comanda_id = $1 order by criado_em", [comanda])).rows;
const resumo = async (comanda: string) => (await db.query("select public.resumo_comanda($1) as r", [comanda])).rows[0].r;

beforeAll(async () => {
  await db.connect();
  await db.query("begin");
  donoA = await criarUsuario();
  donoB = await criarUsuario();
  recepcaoA = await criarUsuario();
  anaUser = await criarUsuario();
  biaUser = await criarUsuario();
  assistUser = await criarUsuario();
  salaoA = await criarSalao(donoA, "Salão A");
  salaoB = await criarSalao(donoB, "Salão B");
  await colocarNaEquipe(salaoA, recepcaoA, "recepcao");
  await colocarNaEquipe(salaoA, anaUser, "profissional");
  await colocarNaEquipe(salaoA, biaUser, "profissional");
  await comoAdmin();
  await db.query("insert into public.usuarios_salao (salao_id, user_id, perfil) values ($1, $2, 'assistente')", [salaoA, assistUser]);

  const prof = async (salao: string, nome: string, tipo: string, user: string | null) =>
    (await db.query("insert into public.profissionais (salao_id, nome, tipo, user_id) values ($1, $2, $3, $4) returning id", [salao, nome, tipo, user])).rows[0].id;
  ana = await prof(salaoA, "Ana", "profissional", anaUser);
  bia = await prof(salaoA, "Bia", "profissional", biaUser);
  dani = await prof(salaoA, "Dani", "assistente", assistUser);
  anaB = await prof(salaoB, "Ana do B", "profissional", null);

  const cat = (await db.query("insert into public.categorias_servico (salao_id, nome) values ($1, 'Cabelo') returning id", [salaoA])).rows[0].id;
  corte = (await db.query("insert into public.servicos (salao_id, categoria_id, nome, duracao_min, preco_centavos) values ($1, $2, 'Corte', 45, 8000) returning id", [salaoA, cat])).rows[0].id;
  escova = (await db.query("insert into public.servicos (salao_id, categoria_id, nome, duracao_min, preco_centavos) values ($1, $2, 'Escova', 40, 5500) returning id", [salaoA, cat])).rows[0].id;
  shampoo = (await db.query("insert into public.produtos (salao_id, nome, preco_centavos, custo_centavos) values ($1, 'Shampoo', 4500, 2000) returning id", [salaoA])).rows[0].id;
  const catB = (await db.query("insert into public.categorias_servico (salao_id, nome) values ($1, 'Cabelo') returning id", [salaoB])).rows[0].id;
  corteB = (await db.query("insert into public.servicos (salao_id, categoria_id, nome, duracao_min, preco_centavos) values ($1, $2, 'Corte B', 30, 5000) returning id", [salaoB, catB])).rows[0].id;
  cliente = (await db.query("insert into public.clientes (salao_id, nome) values ($1, 'Maria') returning id", [salaoA])).rows[0].id;
  clienteB = (await db.query("insert into public.clientes (salao_id, nome) values ($1, 'Joana B') returning id", [salaoB])).rows[0].id;

  await como(recepcaoA);
  const criar = "select public.criar_agendamento($1, $2, $3::jsonb) as id";
  agMisto = (await db.query(criar, [salaoA, cliente, JSON.stringify([
    { servico_id: corte, profissional_id: ana, inicio: amanha("10:00") },
    { servico_id: escova, profissional_id: bia, inicio: amanha("10:45") },
  ])])).rows[0].id;
  agAna = (await db.query(criar, [salaoA, cliente, JSON.stringify([{ servico_id: corte, profissional_id: ana, inicio: amanha("14:00") }])])).rows[0].id;
});

afterAll(async () => {
  await db.query("rollback");
  await db.end();
});

describe("Abrir comanda", () => {
  it("a recepção abre a comanda de um agendamento e os serviços entram sozinhos, com o preço marcado", async () => {
    await como(recepcaoA);
    comandaMista = (await db.query(abrir, [salaoA, cliente, agMisto])).rows[0].id;
    const itens = await itensDe(comandaMista);
    expect(itens.map((i) => [i.profissional_id, i.preco])).toEqual([[ana, 8000], [bia, 5500]]);
    expect((await resumo(comandaMista)).total_centavos).toBe(13500);
  });

  it("abrir de novo o mesmo agendamento devolve a mesma comanda (não duplica)", async () => {
    await como(donoA);
    expect((await db.query(abrir, [salaoA, cliente, agMisto])).rows[0].id).toBe(comandaMista);
  });

  it("a profissional abre a comanda do próprio agendamento, mas não a de um agendamento misto", async () => {
    await como(anaUser);
    comandaAna = (await db.query(abrir, [salaoA, cliente, agAna])).rows[0].id;
    expect(comandaAna).toBeTruthy();
    await como(biaUser);
    await deveFalhar(abrir, [salaoA, cliente, agMisto]);
  });

  it("a recepção abre comanda avulsa (sem agendamento)", async () => {
    await como(recepcaoA);
    comandaAvulsa = (await db.query(abrir, [salaoA, cliente, null])).rows[0].id;
    expect(await itensDe(comandaAvulsa)).toEqual([]);
  });

  it("assistente e outro salão não abrem comanda; cliente de outro salão não serve", async () => {
    await como(assistUser);
    await deveFalhar(abrir, [salaoA, cliente, null]);
    await como(donoB);
    await deveFalhar(abrir, [salaoA, cliente, null]);
    await deveFalhar(abrir, [salaoB, cliente, null]);
    await como(donoA);
    await deveFalhar(abrir, [salaoA, clienteB, null]);
  });
});

describe("Lançar itens", () => {
  it("a recepção lança produto (2 unidades) com o preço do cadastro", async () => {
    await como(recepcaoA);
    await db.query(lancar, [comandaAvulsa, "produto", shampoo, null, 2, null, 0]);
    const [p] = await itensDe(comandaAvulsa);
    expect([p.tipo, p.preco, p.total]).toEqual(["produto", 4500, 9000]);
  });

  it("a recepção lança serviço com preço ajustado e desconto", async () => {
    await como(recepcaoA);
    await db.query(lancar, [comandaAvulsa, "servico", corte, ana, 1, 7000, 500]);
    const itens = await itensDe(comandaAvulsa);
    expect(itens[1].total).toBe(6500);
    expect((await resumo(comandaAvulsa)).total_centavos).toBe(15500);
  });

  it("a profissional lança só em nome dela e, com a chave desligada, não muda preço nem dá desconto", async () => {
    await como(anaUser);
    await db.query(lancar, [comandaAna, "servico", escova, null, 1, null, 0]);
    expect((await itensDe(comandaAna)).every((i) => i.profissional_id === ana)).toBe(true);
    await deveFalhar(lancar, [comandaAna, "servico", escova, bia, 1, null, 0]);
    await deveFalhar(lancar, [comandaAna, "servico", escova, null, 1, 1000, 0]);
    await deveFalhar(lancar, [comandaAna, "produto", shampoo, null, 1, null, 100]);
  });

  it("com a chave ligada pelo dono, a profissional pode dar desconto", async () => {
    await como(donoA);
    await db.query(
      "insert into public.configuracao_salao (salao_id, profissionais_alteram_preco) values ($1, true) on conflict (salao_id) do update set profissionais_alteram_preco = true",
      [salaoA],
    );
    await como(anaUser);
    await db.query(lancar, [comandaAna, "produto", shampoo, null, 1, null, 500]);
    await como(donoA);
    await db.query("update public.configuracao_salao set profissionais_alteram_preco = false where salao_id = $1", [salaoA]);
  });

  it("não aceita: serviço com quantidade 2, desconto maior que o item, serviço sem profissional, assistente como profissional", async () => {
    await como(recepcaoA);
    await deveFalhar(lancar, [comandaAvulsa, "servico", corte, ana, 2, null, 0]);
    await deveFalhar(lancar, [comandaAvulsa, "produto", shampoo, null, 1, null, 4501]);
    await deveFalhar(lancar, [comandaAvulsa, "servico", corte, null, 1, null, 0]);
    await deveFalhar(lancar, [comandaAvulsa, "servico", corte, dani, 1, null, 0]);
  });

  it("não aceita serviço nem profissional de outro salão", async () => {
    await como(recepcaoA);
    await deveFalhar(lancar, [comandaAvulsa, "servico", corteB, ana, 1, null, 0]);
    await deveFalhar(lancar, [comandaAvulsa, "servico", corte, anaB, 1, null, 0]);
  });

  it("ninguém grava direto nas tabelas (só pelas portas)", async () => {
    await como(donoA);
    await deveFalhar("update public.comanda_itens set preco_unitario_centavos = 1 where comanda_id = $1", [comandaAvulsa]);
    await deveFalhar("insert into public.comandas (salao_id, cliente_id) values ($1, $2)", [salaoA, cliente]);
    await deveFalhar("delete from public.comanda_itens where comanda_id = $1", [comandaAvulsa]);
  });
});

describe("Quem vê o quê", () => {
  it("na comanda mista, a Bia vê a comanda mas só o próprio item, e não mexe na comanda inteira", async () => {
    await como(biaUser);
    const itens = await itensDe(comandaMista);
    expect(itens.map((i) => i.profissional_id)).toEqual([bia]);
    expect((await resumo(comandaMista)).pode_mexer).toBe(false);
    await deveFalhar("select public.definir_desconto_comanda($1, 100)", [comandaMista]);
  });

  it("a Bia não vê a comanda que é só da Ana", async () => {
    await como(biaUser);
    expect((await db.query("select id from public.comandas where id = $1", [comandaAna])).rows).toEqual([]);
    expect(await resumo(comandaAna)).toBeNull();
    await deveFalhar(lancar, [comandaAna, "produto", shampoo, null, 1, null, 0]);
  });

  it("a assistente não vê comandas", async () => {
    await como(assistUser);
    expect((await db.query("select id from public.comandas")).rows).toEqual([]);
    expect((await db.query("select id from public.comanda_itens")).rows).toEqual([]);
  });

  it("o Salão B não vê nem mexe nas comandas do Salão A", async () => {
    await como(donoB);
    expect((await db.query("select id from public.comandas")).rows).toEqual([]);
    expect((await db.query("select id from public.comanda_itens")).rows).toEqual([]);
    expect(await resumo(comandaAvulsa)).toBeNull();
    await deveFalhar(lancar, [comandaAvulsa, "servico", corteB, anaB, 1, null, 0]);
    await deveFalhar("select public.cancelar_comanda($1, 'intruso')", [comandaAvulsa]);
  });

  it("visitante sem login não vê nada", async () => {
    await como(null);
    await deveFalhar("select id from public.comandas");
    await deveFalhar(abrir, [salaoA, cliente, null]);
  });
});

describe("Alterar, excluir, assistentes e desconto geral", () => {
  it("a profissional não altera preço do próprio item com a chave desligada; a recepção altera", async () => {
    await como(anaUser);
    const { rows } = await db.query("select id from public.comanda_itens where comanda_id = $1 and tipo = 'servico' order by criado_em limit 1", [comandaAna]);
    await deveFalhar("select public.alterar_item_comanda($1, 1, 1000, 0)", [rows[0].id]);
    await como(recepcaoA);
    await db.query("select public.alterar_item_comanda($1, 1, 7500, 0)", [rows[0].id]);
  });

  it("excluir item: profissional não pode; recepção pode com motivo, e o item fica marcado (não some)", async () => {
    await como(donoA);
    const item = (await db.query("select id from public.comanda_itens where comanda_id = $1 and tipo = 'produto'", [comandaAvulsa])).rows[0].id;
    await como(anaUser);
    await deveFalhar("select public.remover_item_comanda($1, 'engano')", [item]);
    await como(recepcaoA);
    await deveFalhar("select public.remover_item_comanda($1, '')", [item]);
    await db.query("select public.remover_item_comanda($1, 'Lançado por engano')", [item]);
    const itens = await itensDe(comandaAvulsa);
    expect(itens.filter((i) => i.removido_em).length).toBe(1);
    expect((await resumo(comandaAvulsa)).total_centavos).toBe(6500);
  });

  it("assistentes do serviço: só assistentes ativas do salão; a profissional escolhe no próprio item", async () => {
    await como(anaUser);
    const item = (await db.query("select id from public.comanda_itens where comanda_id = $1 and tipo = 'servico' order by criado_em limit 1", [comandaAna])).rows[0].id;
    await db.query("select public.definir_assistentes_item($1, $2::uuid[])", [item, [dani]]);
    await deveFalhar("select public.definir_assistentes_item($1, $2::uuid[])", [item, [bia]]);
    expect((await db.query("select assistente_id from public.comanda_item_assistentes where item_id = $1", [item])).rows).toEqual([{ assistente_id: dani }]);
    await como(biaUser);
    await deveFalhar("select public.definir_assistentes_item($1, $2::uuid[])", [item, []]);
  });

  it("desconto geral: a recepção dá; não pode passar do total dos itens", async () => {
    await como(recepcaoA);
    await deveFalhar("select public.definir_desconto_comanda($1, 999999)", [comandaAvulsa]);
    await db.query("select public.definir_desconto_comanda($1, 1500)", [comandaAvulsa]);
    expect((await resumo(comandaAvulsa)).total_centavos).toBe(5000);
  });

  it("cancelar: só recepção/dono, com motivo; depois não aceita mais itens", async () => {
    await como(anaUser);
    await deveFalhar("select public.cancelar_comanda($1, 'desistiu')", [comandaAna]);
    await como(recepcaoA);
    await deveFalhar("select public.cancelar_comanda($1, '')", [comandaAvulsa]);
    await db.query("select public.cancelar_comanda($1, 'Cliente desistiu')", [comandaAvulsa]);
    await deveFalhar(lancar, [comandaAvulsa, "produto", shampoo, null, 1, null, 0]);
  });

  it("agendamento com comanda cancelada pode ganhar uma comanda nova", async () => {
    await como(recepcaoA);
    await db.query("select public.cancelar_comanda($1, 'Aberta errada')", [comandaMista]);
    const nova = (await db.query(abrir, [salaoA, cliente, agMisto])).rows[0].id;
    expect(nova).not.toBe(comandaMista);
  });
});

describe("Concluir na agenda abre a comanda sozinha", () => {
  it("a profissional conclui o próprio horário e a comanda aparece com o serviço", async () => {
    await como(anaUser);
    const ag = (await db.query("select public.criar_agendamento($1, $2, $3::jsonb) as id", [
      salaoA, cliente, JSON.stringify([{ servico_id: escova, profissional_id: ana, inicio: amanha("16:00") }]),
    ])).rows[0].id;
    await db.query("select public.mudar_situacao_agendamento($1, 'concluido')", [ag]);
    const { rows } = await db.query("select id from public.comandas where agendamento_id = $1", [ag]);
    expect(rows.length).toBe(1);
    expect((await itensDe(rows[0].id)).map((i) => i.preco)).toEqual([5500]);
    // concluir de novo não duplica
    await db.query("select public.mudar_situacao_agendamento($1, 'concluido')", [ag]);
    expect((await db.query("select id from public.comandas where agendamento_id = $1", [ag])).rows.length).toBe(1);
  });
});

describe("Auditoria", () => {
  it("registra abertura, itens, exclusão (com motivo) e cancelamento", async () => {
    await comoAdmin();
    const { rows } = await db.query(
      "select entidade, acao, depois->>'motivo_remocao' as motivo_item, depois->>'situacao' as situacao from public.audit_log where salao_id = $1 and entidade in ('comandas', 'comanda_itens')",
      [salaoA],
    );
    expect(rows.some((r) => r.entidade === "comandas" && r.acao === "insert")).toBe(true);
    expect(rows.some((r) => r.motivo_item === "Lançado por engano")).toBe(true);
    expect(rows.some((r) => r.situacao === "cancelada")).toBe(true);
  });
});
