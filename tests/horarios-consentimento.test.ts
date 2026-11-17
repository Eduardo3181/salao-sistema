/**
 * Horários de funcionamento, opção de motivo ao cancelar e aceite de WhatsApp:
 * isolamento entre salões, permissões por perfil e histórico preservado.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { novaConexao } from "./apoio/banco";

const { db, como, comoAdmin, deveFalhar, criarUsuario, criarSalao, colocarNaEquipe } = novaConexao();

let donoA = "", donoB = "", recepcaoA = "", profissionalA = "";
let salaoA = "", salaoB = "";
let anaA = "", anaB = "", clienteA = "";

const horario = "insert into public.horarios_funcionamento (salao_id, profissional_id, dia_semana, abre, fecha) values ($1, $2, $3, $4, $5) returning id";
const aceite = "insert into public.consentimentos_whatsapp (salao_id, cliente_id, aceitou) values ($1, $2, $3)";

beforeAll(async () => {
  await db.connect();
  await db.query("begin");
  donoA = await criarUsuario();
  donoB = await criarUsuario();
  recepcaoA = await criarUsuario();
  profissionalA = await criarUsuario();
  salaoA = await criarSalao(donoA, "Salão A");
  salaoB = await criarSalao(donoB, "Salão B");
  await colocarNaEquipe(salaoA, recepcaoA, "recepcao");
  await colocarNaEquipe(salaoA, profissionalA, "profissional");
  await comoAdmin();
  anaA = (await db.query("insert into public.profissionais (salao_id, nome) values ($1, 'Ana') returning id", [salaoA])).rows[0].id;
  anaB = (await db.query("insert into public.profissionais (salao_id, nome) values ($1, 'Ana B') returning id", [salaoB])).rows[0].id;
  clienteA = (await db.query("insert into public.clientes (salao_id, nome) values ($1, 'Cliente A') returning id", [salaoA])).rows[0].id;
});

afterAll(async () => {
  await db.query("rollback");
  await db.end();
});

describe("Horário de funcionamento", () => {
  it("o dono define o horário do salão e o horário próprio da profissional", async () => {
    await como(donoA);
    await db.query(horario, [salaoA, null, 2, "09:00", "19:00"]);
    await db.query(horario, [salaoA, anaA, 2, "13:00", "19:00"]);
    const { rows } = await db.query("select count(*)::int as n from public.horarios_funcionamento");
    expect(rows[0].n).toBe(2);
  });

  it("um horário por dia: não deixa duplicar o mesmo dia", async () => {
    await como(donoA);
    await deveFalhar(horario, [salaoA, null, 2, "10:00", "18:00"]);
  });

  it("recusa horário invertido ou fora da grade de 30 minutos", async () => {
    await como(donoA);
    await deveFalhar(horario, [salaoA, null, 3, "19:00", "09:00"]);
    await deveFalhar(horario, [salaoA, null, 3, "09:15", "18:00"]);
  });

  it("recepção e profissional veem, mas não alteram", async () => {
    for (const quem of [recepcaoA, profissionalA]) {
      await como(quem);
      const { rows } = await db.query("select id from public.horarios_funcionamento");
      expect(rows.length).toBe(2);
      await deveFalhar(horario, [salaoA, null, 4, "09:00", "18:00"]);
      const r = await db.query("update public.horarios_funcionamento set fecha = '20:00'");
      expect(r.rowCount).toBe(0);
    }
  });

  it("o Salão B não vê nem mexe no horário do Salão A", async () => {
    await como(donoB);
    expect((await db.query("select id from public.horarios_funcionamento")).rows).toEqual([]);
    await deveFalhar(horario, [salaoA, null, 5, "09:00", "18:00"]);
    const r = await db.query("delete from public.horarios_funcionamento where salao_id = $1", [salaoA]);
    expect(r.rowCount).toBe(0);
  });

  it("não aceita horário de uma profissional de outro salão", async () => {
    await como(donoA);
    await deveFalhar(horario, [salaoA, anaB, 1, "09:00", "18:00"]);
  });

  it("o dono fecha um dia apagando o horário, e isso vai para a auditoria", async () => {
    await como(donoA);
    const r = await db.query("delete from public.horarios_funcionamento where salao_id = $1 and profissional_id is null and dia_semana = 2", [salaoA]);
    expect(r.rowCount).toBe(1);
    const { rows } = await db.query("select acao from public.audit_log where entidade = 'horarios_funcionamento' order by id");
    expect(rows.map((x) => x.acao)).toEqual(["insert", "insert", "delete"]);
  });
});

describe("Exigir motivo ao cancelar", () => {
  it("começa ligado e só o dono muda", async () => {
    await como(donoA);
    await db.query("insert into public.configuracao_salao (salao_id) values ($1)", [salaoA]);
    const { rows } = await db.query("select exigir_motivo_cancelamento from public.configuracao_salao where salao_id = $1", [salaoA]);
    expect(rows[0].exigir_motivo_cancelamento).toBe(true);

    await como(recepcaoA);
    const r = await db.query("update public.configuracao_salao set exigir_motivo_cancelamento = false where salao_id = $1", [salaoA]);
    expect(r.rowCount).toBe(0);

    await como(donoA);
    const r2 = await db.query("update public.configuracao_salao set exigir_motivo_cancelamento = false where salao_id = $1", [salaoA]);
    expect(r2.rowCount).toBe(1);
  });
});

describe("Aceite de WhatsApp", () => {
  it("a recepção registra o aceite e a recusa; o histórico fica guardado", async () => {
    await como(recepcaoA);
    await db.query(aceite, [salaoA, clienteA, true]);
    await db.query(aceite, [salaoA, clienteA, false]);
    const { rows } = await db.query(
      "select aceitou, registrado_por, origem from public.consentimentos_whatsapp where cliente_id = $1 order by registrado_em, id",
      [clienteA],
    );
    expect(rows.length).toBe(2);
    expect(rows.every((x) => x.registrado_por === recepcaoA && x.origem === "recepcao")).toBe(true);
  });

  it("ninguém altera nem apaga o histórico", async () => {
    await como(donoA);
    await deveFalhar("update public.consentimentos_whatsapp set aceitou = true");
    await deveFalhar("delete from public.consentimentos_whatsapp");
  });

  it("ninguém registra em nome de outra pessoa", async () => {
    await como(recepcaoA);
    await deveFalhar(
      "insert into public.consentimentos_whatsapp (salao_id, cliente_id, aceitou, registrado_por) values ($1, $2, true, $3)",
      [salaoA, clienteA, donoA],
    );
  });

  it("profissional não vê nem registra aceite", async () => {
    await como(profissionalA);
    expect((await db.query("select id from public.consentimentos_whatsapp")).rows).toEqual([]);
    await deveFalhar(aceite, [salaoA, clienteA, true]);
  });

  it("o Salão B não vê nem registra aceite de cliente do Salão A", async () => {
    await como(donoB);
    expect((await db.query("select id from public.consentimentos_whatsapp")).rows).toEqual([]);
    await deveFalhar(aceite, [salaoA, clienteA, true]);
    await deveFalhar(aceite, [salaoB, clienteA, true]); // cliente de outro salão
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
