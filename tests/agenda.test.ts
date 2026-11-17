/**
 * Agenda: isolamento entre salões e a regra "cada profissional só vê a própria agenda".
 * Roda no banco de TESTE dentro de uma transação desfeita no final.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { novaConexao } from "./apoio/banco";

const { db, como, comoAdmin, deveFalhar, criarUsuario, criarSalao, colocarNaEquipe } = novaConexao();

let donoA = "", donoB = "", recepcaoA = "", anaUser = "", biaUser = "", assistUser = "";
let salaoA = "", salaoB = "";
let ana = "", bia = "", carla = "", assistente = "", anaB = "";
let corte = "", escova = "", corteB = "";
let cliente = "", clienteB = "";
let agAna = "", agMisto = "", itemAna = "", itemBia = "";

// Datas sempre no futuro (amanhã às 10h de Brasília), para não esbarrar na regra do passado.
const amanha = (hora: string) => {
  const d = new Date(Date.now() + 86400000).toLocaleDateString("en-CA", { timeZone: "America/Sao_Paulo" });
  return `${d}T${hora}:00-03:00`;
};
const ontem = (hora: string) => {
  const d = new Date(Date.now() - 86400000).toLocaleDateString("en-CA", { timeZone: "America/Sao_Paulo" });
  return `${d}T${hora}:00-03:00`;
};

const criar = "select public.criar_agendamento($1, $2, $3::jsonb) as id";
const item = (servico: string, profissional: string, inicio: string, duracao?: number) => ({
  servico_id: servico,
  profissional_id: profissional,
  inicio,
  ...(duracao ? { duracao_min: duracao } : {}),
});

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
  carla = await prof(salaoA, "Carla", "profissional", null);
  assistente = await prof(salaoA, "Dani Assistente", "assistente", assistUser);
  anaB = await prof(salaoB, "Ana do B", "profissional", null);
  await db.query("insert into public.assistentes_profissionais (salao_id, assistente_id, profissional_id) values ($1, $2, $3)", [salaoA, assistente, ana]);

  const cat = (await db.query("insert into public.categorias_servico (salao_id, nome) values ($1, 'Cabelo') returning id", [salaoA])).rows[0].id;
  corte = (await db.query("insert into public.servicos (salao_id, categoria_id, nome, duracao_min, preco_centavos) values ($1, $2, 'Corte', 45, 8000) returning id", [salaoA, cat])).rows[0].id;
  escova = (await db.query("insert into public.servicos (salao_id, categoria_id, nome, duracao_min, preco_centavos) values ($1, $2, 'Escova', 40, 5500) returning id", [salaoA, cat])).rows[0].id;
  const catB = (await db.query("insert into public.categorias_servico (salao_id, nome) values ($1, 'Cabelo') returning id", [salaoB])).rows[0].id;
  corteB = (await db.query("insert into public.servicos (salao_id, categoria_id, nome, duracao_min, preco_centavos) values ($1, $2, 'Corte B', 30, 5000) returning id", [salaoB, catB])).rows[0].id;
  cliente = (await db.query("insert into public.clientes (salao_id, nome) values ($1, 'Maria') returning id", [salaoA])).rows[0].id;
  clienteB = (await db.query("insert into public.clientes (salao_id, nome) values ($1, 'Joana B') returning id", [salaoB])).rows[0].id;
});

afterAll(async () => {
  await db.query("rollback");
  await db.end();
});

describe("Marcar horário", () => {
  it("a recepção marca um agendamento com dois serviços de profissionais diferentes", async () => {
    await como(recepcaoA);
    agMisto = (await db.query(criar, [salaoA, cliente, JSON.stringify([item(corte, ana, amanha("10:00")), item(escova, bia, amanha("10:30"))])])).rows[0].id;
    const { rows } = await db.query("select profissional_id, preco_centavos, extract(epoch from fim - inicio)/60 as minutos from public.agendamento_itens where agendamento_id = $1 order by inicio", [agMisto]);
    expect(rows.map((r) => [r.profissional_id, Number(r.preco_centavos), Number(r.minutos)])).toEqual([
      [ana, 8000, 45],
      [bia, 5500, 40],
    ]);
    itemAna = (await db.query("select id from public.agendamento_itens where agendamento_id = $1 and profissional_id = $2", [agMisto, ana])).rows[0].id;
    itemBia = (await db.query("select id from public.agendamento_itens where agendamento_id = $1 and profissional_id = $2", [agMisto, bia])).rows[0].id;
  });

  it("a profissional marca na própria agenda", async () => {
    await como(anaUser);
    agAna = (await db.query(criar, [salaoA, cliente, JSON.stringify([item(corte, ana, amanha("15:00"))])])).rows[0].id;
    expect(agAna).toBeTruthy();
  });

  it("a profissional NÃO marca na agenda de outra", async () => {
    await como(anaUser);
    await deveFalhar(criar, [salaoA, cliente, JSON.stringify([item(corte, bia, amanha("16:00"))])]);
  });

  it("horário no passado: dono e recepção podem; profissional não", async () => {
    await como(anaUser);
    await deveFalhar(criar, [salaoA, cliente, JSON.stringify([item(corte, ana, ontem("10:00"))])]);
    await como(recepcaoA);
    const { rows } = await db.query(criar, [salaoA, cliente, JSON.stringify([item(corte, ana, ontem("10:00"))])]);
    expect(rows[0].id).toBeTruthy();
  });

  it("encaixe (mesma hora, mesma profissional) é permitido; a consulta de conflitos avisa", async () => {
    await como(recepcaoA);
    await db.query(criar, [salaoA, cliente, JSON.stringify([item(escova, ana, amanha("10:15"))])]);
    const { rows } = await db.query("select public.conflitos_agenda($1, $2, $3, $4) as c", [salaoA, ana, amanha("10:00"), amanha("10:45")]);
    expect(rows[0].c.atendimentos).toBeGreaterThanOrEqual(2);
  });

  it("a assistente não marca horário", async () => {
    await como(assistUser);
    await deveFalhar(criar, [salaoA, cliente, JSON.stringify([item(corte, ana, amanha("17:00"))])]);
  });

  it("não aceita assistente como 'profissional' do horário, nem serviço ou cliente de outro salão", async () => {
    await como(recepcaoA);
    await deveFalhar(criar, [salaoA, cliente, JSON.stringify([item(corte, assistente, amanha("11:00"))])]);
    await deveFalhar(criar, [salaoA, cliente, JSON.stringify([item(corteB, ana, amanha("11:00"))])]);
    await deveFalhar(criar, [salaoA, clienteB, JSON.stringify([item(corte, ana, amanha("11:00"))])]);
    await deveFalhar(criar, [salaoA, cliente, JSON.stringify([item(corte, anaB, amanha("11:00"))])]);
  });

  it("ninguém grava direto nas tabelas (só pelas portas)", async () => {
    await como(donoA);
    await deveFalhar("insert into public.agendamentos (salao_id, cliente_id) values ($1, $2)", [salaoA, cliente]);
    await deveFalhar("update public.agendamento_itens set preco_centavos = 1 where id = $1", [itemAna]);
    await deveFalhar("delete from public.agendamento_itens where id = $1", [itemAna]);
  });
});

describe("Quem vê o quê", () => {
  it("dono e recepção veem todas as agendas", async () => {
    for (const quem of [donoA, recepcaoA]) {
      await como(quem);
      const { rows } = await db.query("select distinct profissional_id from public.agendamento_itens");
      expect(new Set(rows.map((r) => r.profissional_id))).toEqual(new Set([ana, bia]));
    }
  });

  it("a Ana vê só os próprios horários (nem o serviço da Bia no agendamento misto)", async () => {
    await como(anaUser);
    const { rows } = await db.query("select profissional_id from public.agendamento_itens");
    expect(rows.length).toBeGreaterThan(0);
    expect(rows.every((r) => r.profissional_id === ana)).toBe(true);
  });

  it("a Bia não vê nenhum horário da Ana, nem o agendamento só da Ana", async () => {
    await como(biaUser);
    const itens = await db.query("select profissional_id from public.agendamento_itens");
    expect(itens.rows.every((r) => r.profissional_id === bia)).toBe(true);
    const ag = await db.query("select id from public.agendamentos where id = $1", [agAna]);
    expect(ag.rows).toEqual([]);
  });

  it("a assistente vê só a agenda das profissionais que ela ajuda (Ana), e não altera nada", async () => {
    await como(assistUser);
    const { rows } = await db.query("select distinct profissional_id from public.agendamento_itens");
    expect(rows.map((r) => r.profissional_id)).toEqual([ana]);
    await deveFalhar("select public.mudar_situacao_agendamento($1, 'confirmado')", [agAna]);
    await deveFalhar("select public.remarcar_item($1, $2)", [itemAna, amanha("12:00")]);
  });

  it("a consulta de conflitos não revela a agenda de quem a pessoa não pode ver", async () => {
    await como(biaUser);
    const { rows } = await db.query("select public.conflitos_agenda($1, $2, $3, $4) as c", [salaoA, ana, amanha("10:00"), amanha("11:00")]);
    expect(rows[0].c).toBeNull();
  });

  it("o Salão B não vê nada da agenda do Salão A", async () => {
    await como(donoB);
    expect((await db.query("select id from public.agendamentos")).rows).toEqual([]);
    expect((await db.query("select id from public.agendamento_itens")).rows).toEqual([]);
    await deveFalhar("select public.mudar_situacao_agendamento($1, 'confirmado')", [agAna]);
    await deveFalhar("select public.remarcar_item($1, $2)", [itemAna, amanha("12:00")]);
    await deveFalhar(criar, [salaoA, cliente, JSON.stringify([item(corte, ana, amanha("12:00"))])]);
  });

  it("visitante sem login não vê nada", async () => {
    await como(null);
    await deveFalhar("select id from public.agendamentos");
    await deveFalhar(criar, [salaoA, cliente, "[]"]);
  });
});

describe("Situação e cancelamento", () => {
  it("a profissional muda a situação do agendamento que é só dela", async () => {
    await como(anaUser);
    await db.query("select public.mudar_situacao_agendamento($1, 'confirmado')", [agAna]);
    await comoAdmin();
    expect((await db.query("select situacao from public.agendamentos where id = $1", [agAna])).rows[0].situacao).toBe("confirmado");
  });

  it("a profissional NÃO muda a situação de um agendamento que tem serviço de outra", async () => {
    await como(anaUser);
    await deveFalhar("select public.mudar_situacao_agendamento($1, 'chegou')", [agMisto]);
  });

  it("cancelar exige motivo quando o salão exige (padrão)", async () => {
    await como(recepcaoA);
    await deveFalhar("select public.mudar_situacao_agendamento($1, 'cancelado')", [agMisto]);
    await db.query("select public.mudar_situacao_agendamento($1, 'cancelado', 'cliente_desmarcou')", [agMisto]);
    await comoAdmin();
    const { rows } = await db.query("select situacao, motivo_cancelamento, cancelado_em is not null as tem_data from public.agendamentos where id = $1", [agMisto]);
    expect(rows[0]).toEqual({ situacao: "cancelado", motivo_cancelamento: "cliente_desmarcou", tem_data: true });
  });

  it("se o dono desliga a exigência, cancela sem motivo", async () => {
    await como(donoA);
    await db.query("insert into public.configuracao_salao (salao_id, exigir_motivo_cancelamento) values ($1, false)", [salaoA]);
    await como(anaUser);
    await db.query("select public.mudar_situacao_agendamento($1, 'cancelado')", [agAna]);
    await comoAdmin();
    expect((await db.query("select situacao from public.agendamentos where id = $1", [agAna])).rows[0].situacao).toBe("cancelado");
  });

  it("reabrir um cancelado limpa o motivo e a data", async () => {
    await como(recepcaoA);
    await db.query("select public.mudar_situacao_agendamento($1, 'agendado')", [agMisto]);
    await comoAdmin();
    const { rows } = await db.query("select motivo_cancelamento, cancelado_em from public.agendamentos where id = $1", [agMisto]);
    expect(rows[0]).toEqual({ motivo_cancelamento: null, cancelado_em: null });
  });

  it("a auditoria registra quem cancelou", async () => {
    await como(donoA);
    const { rows } = await db.query(
      "select user_id from public.audit_log where entidade = 'agendamentos' and entidade_id = $1 and depois->>'situacao' = 'cancelado'",
      [agMisto],
    );
    expect(rows).toEqual([{ user_id: recepcaoA }]);
  });
});

describe("Remarcar", () => {
  it("a profissional remarca o próprio serviço, mas não passa para outra profissional", async () => {
    await como(anaUser);
    await db.query("select public.remarcar_item($1, $2)", [itemAna, amanha("11:00")]);
    await deveFalhar("select public.remarcar_item($1, $2, $3)", [itemAna, amanha("11:00"), bia]);
  });

  it("a profissional não remarca o serviço da outra", async () => {
    await como(anaUser);
    await deveFalhar("select public.remarcar_item($1, $2)", [itemBia, amanha("12:00")]);
  });

  it("a recepção remarca e troca de profissional, mantendo a duração", async () => {
    await como(recepcaoA);
    await db.query("select public.remarcar_item($1, $2, $3)", [itemBia, amanha("14:00"), carla]);
    await comoAdmin();
    const { rows } = await db.query("select profissional_id, extract(epoch from fim - inicio)/60 as minutos from public.agendamento_itens where id = $1", [itemBia]);
    expect([rows[0].profissional_id, Number(rows[0].minutos)]).toEqual([carla, 40]);
  });

  it("não remarca agendamento cancelado", async () => {
    await como(recepcaoA);
    const { rows } = await db.query("select id from public.agendamento_itens where agendamento_id = $1", [agAna]);
    await deveFalhar("select public.remarcar_item($1, $2)", [rows[0].id, amanha("18:00")]);
  });
});

describe("Bloqueios", () => {
  const bloquear = "insert into public.bloqueios (salao_id, profissional_id, inicio, fim, motivo) values ($1, $2, $3, $4, $5) returning id";

  it("a profissional bloqueia só a própria agenda", async () => {
    await como(anaUser);
    const { rows } = await db.query(bloquear, [salaoA, ana, amanha("12:00"), amanha("13:00"), "Almoço"]);
    expect(rows[0].id).toBeTruthy();
    await deveFalhar(bloquear, [salaoA, bia, amanha("12:00"), amanha("13:00"), "Almoço"]);
  });

  it("feriado (salão inteiro) só o dono", async () => {
    for (const quem of [recepcaoA, anaUser]) {
      await como(quem);
      await deveFalhar(bloquear, [salaoA, null, amanha("05:00"), amanha("23:00"), "Feriado"]);
    }
    await como(donoA);
    const { rows } = await db.query(bloquear, [salaoA, null, amanha("05:00"), amanha("23:00"), "Feriado"]);
    expect(rows[0].id).toBeTruthy();
  });

  it("a recepção bloqueia qualquer profissional; a assistente não bloqueia", async () => {
    await como(recepcaoA);
    await db.query(bloquear, [salaoA, bia, amanha("08:00"), amanha("09:00"), "Médico"]);
    await como(assistUser);
    await deveFalhar(bloquear, [salaoA, ana, amanha("08:00"), amanha("09:00"), "X"]);
  });

  it("a Bia não vê o bloqueio da Ana; todos veem o feriado", async () => {
    await como(biaUser);
    const { rows } = await db.query("select profissional_id from public.bloqueios");
    expect(rows.some((r) => r.profissional_id === ana)).toBe(false);
    expect(rows.some((r) => r.profissional_id === null)).toBe(true);
  });

  it("o bloqueio entra na consulta de conflitos", async () => {
    await como(anaUser);
    const { rows } = await db.query("select public.conflitos_agenda($1, $2, $3, $4) as c", [salaoA, ana, amanha("12:30"), amanha("12:45")]);
    expect(rows[0].c.bloqueios).toBeGreaterThanOrEqual(1);
  });

  it("o Salão B não vê nem cria bloqueio no Salão A", async () => {
    await como(donoB);
    expect((await db.query("select id from public.bloqueios")).rows).toEqual([]);
    await deveFalhar(bloquear, [salaoA, null, amanha("05:00"), amanha("06:00"), "Intruso"]);
  });
});

describe("Colunas da agenda", () => {
  it("cada perfil recebe só as colunas que pode ver", async () => {
    const colunas = async (quem: string) => {
      await como(quem);
      return (await db.query("select id from public.minhas_agendas($1)", [salaoA])).rows.map((r) => r.id).sort();
    };
    expect(await colunas(recepcaoA)).toEqual([ana, bia, carla].sort());
    expect(await colunas(anaUser)).toEqual([ana]);
    expect(await colunas(assistUser)).toEqual([ana]);
    expect(await colunas(donoB)).toEqual([]);
  });
});

describe("Regra geral", () => {
  it("nenhuma tabela do sistema está sem RLS", async () => {
    await comoAdmin();
    const { rows } = await db.query(`
      select c.relname from pg_class c join pg_namespace n on n.oid = c.relnamespace
      where n.nspname = 'public' and c.relkind in ('r', 'p') and not c.relrowsecurity
    `);
    expect(rows).toEqual([]);
  });
});
