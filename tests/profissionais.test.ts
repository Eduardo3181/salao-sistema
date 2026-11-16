/**
 * Profissionais e assistentes: isolamento entre salões, permissões e vínculo com a equipe.
 * Roda no banco de TESTE dentro de uma transação desfeita no final.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { novaConexao } from "./apoio/banco";

const { db, como, comoAdmin, deveFalhar, criarUsuario, criarSalao, colocarNaEquipe } = novaConexao();

let donoA = "", donoB = "", recepcaoA = "", profissionalA = "";
let salaoA = "", salaoB = "";
let anaA = "";

const inserir = "insert into public.profissionais (salao_id, nome, tipo, user_id) values ($1, $2, $3, $4) returning id";

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
});

afterAll(async () => {
  await db.query("rollback");
  await db.end();
});

describe("Dono cadastra quem atende", () => {
  it("cadastra profissional sem e-mail e sem conta", async () => {
    await como(donoA);
    anaA = (await db.query(inserir, [salaoA, "Ana", "profissional", null])).rows[0].id;
    expect(anaA).toBeTruthy();
  });

  it("cadastra assistente", async () => {
    await como(donoA);
    const { rows } = await db.query(inserir, [salaoA, "Bia", "assistente", null]);
    expect(rows[0].id).toBeTruthy();
  });

  it("o dono pode se cadastrar como profissional (Sou eu)", async () => {
    await como(donoA);
    const { rows } = await db.query(inserir, [salaoA, "Dona do salão", "profissional", donoA]);
    expect(rows[0].id).toBeTruthy();
  });

  it("liga uma profissional a quem já tem acesso no mesmo salão", async () => {
    await como(donoA);
    const { rows } = await db.query(inserir, [salaoA, "Carla", "profissional", profissionalA]);
    expect(rows[0].id).toBeTruthy();
  });

  it("a mesma conta não pode virar duas profissionais no mesmo salão", async () => {
    await como(donoA);
    await deveFalhar(inserir, [salaoA, "Carla de novo", "profissional", profissionalA]);
  });

  it("não aceita dois cadastros com o mesmo nome", async () => {
    await como(donoA);
    await deveFalhar(inserir, [salaoA, " ana ", "assistente", null]);
  });
});

describe("Isolamento entre salões", () => {
  it("o Salão B não vê quem atende no Salão A", async () => {
    await como(donoB);
    const { rows } = await db.query("select id from public.profissionais");
    expect(rows).toEqual([]);
  });

  it("o Salão B não altera nem cadastra no Salão A", async () => {
    await como(donoB);
    const r = await db.query("update public.profissionais set nome = 'Invadida' where id = $1", [anaA]);
    expect(r.rowCount).toBe(0);
    await deveFalhar(inserir, [salaoA, "Intrusa", "profissional", null]);
  });

  it("não dá para ligar a conta de alguém de outro salão", async () => {
    await como(donoB);
    await deveFalhar(inserir, [salaoB, "Ligação errada", "profissional", recepcaoA]);
    await como(donoA);
    await deveFalhar("update public.profissionais set user_id = $1 where id = $2", [donoB, anaA]);
  });

  it("o dono não muda o cadastro de salão", async () => {
    await como(donoA);
    await deveFalhar("update public.profissionais set salao_id = $1 where id = $2", [salaoB, anaA]);
  });
});

describe("Perfis", () => {
  it("recepção e profissional veem quem atende no próprio salão", async () => {
    for (const quem of [recepcaoA, profissionalA]) {
      await como(quem);
      const { rows } = await db.query("select nome from public.profissionais order by nome");
      expect(rows.map((r) => r.nome)).toEqual(["Ana", "Bia", "Carla", "Dona do salão"]);
    }
  });

  it("recepção e profissional não cadastram nem alteram", async () => {
    for (const quem of [recepcaoA, profissionalA]) {
      await como(quem);
      const r = await db.query("update public.profissionais set nome = 'Mudou' where id = $1", [anaA]);
      expect(r.rowCount).toBe(0);
      await deveFalhar(inserir, [salaoA, "Nova", "profissional", null]);
    }
  });

  it("ninguém apaga; o dono desativa", async () => {
    await como(donoA);
    await deveFalhar("delete from public.profissionais where id = $1", [anaA]);
    const r = await db.query("update public.profissionais set ativo = false where id = $1", [anaA]);
    expect(r.rowCount).toBe(1);
  });

  it("visitante sem login não vê nada", async () => {
    await como(null);
    await deveFalhar("select * from public.profissionais");
  });
});

describe("Auditoria e regra geral", () => {
  it("registra quem desativou a profissional", async () => {
    await como(donoA);
    const { rows } = await db.query(
      "select user_id from public.audit_log where entidade = 'profissionais' and entidade_id = $1 and acao = 'update'",
      [anaA],
    );
    expect(rows).toEqual([{ user_id: donoA }]);
  });

  it("nenhuma tabela do sistema está sem RLS", async () => {
    await comoAdmin();
    const { rows } = await db.query(`
      select c.relname from pg_class c join pg_namespace n on n.oid = c.relnamespace
      where n.nspname = 'public' and c.relkind in ('r', 'p') and not c.relrowsecurity
    `);
    expect(rows).toEqual([]);
  });
});
