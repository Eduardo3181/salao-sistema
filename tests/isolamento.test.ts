/**
 * Teste de isolamento entre salões.
 *
 * Roda no banco de TESTE dentro de uma transação que é desfeita no final:
 * cria usuários e salões de mentira, verifica as travas e não deixa nada salvo.
 */
import { randomUUID } from "node:crypto";
import { Client } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const dbUrl = process.env.SUPABASE_DB_URL;
if (!dbUrl) {
  throw new Error("Falta SUPABASE_DB_URL no arquivo .env.local");
}

const db = new Client({ connectionString: dbUrl });

const usuarioA = randomUUID(); // dono do Salão A
const usuarioB = randomUUID(); // dono do Salão B
const usuarioC = randomUUID(); // recepção do Salão A
let salaoA = "";
let salaoB = "";

/** Passa a agir como um usuário logado (ou visitante, se null). */
async function como(userId: string | null) {
  await db.query("reset role");
  const claims = userId
    ? { sub: userId, role: "authenticated" }
    : { role: "anon" };
  await db.query("select set_config('request.jwt.claims', $1, true)", [
    JSON.stringify(claims),
  ]);
  await db.query(`set local role ${userId ? "authenticated" : "anon"}`);
}

/** Volta a agir como administrador do banco (só para preparar e conferir). */
async function comoAdmin() {
  await db.query("reset role");
  await db.query("select set_config('request.jwt.claims', '', true)");
}

/** Executa algo que DEVE falhar, sem estragar a transação do teste. */
async function deveFalhar(sql: string, params: unknown[] = []) {
  await db.query("savepoint tentativa");
  try {
    await db.query(sql, params);
  } catch (erro) {
    await db.query("rollback to savepoint tentativa");
    return erro as Error;
  }
  await db.query("release savepoint tentativa");
  throw new Error(`Era para ter sido bloqueado, mas passou: ${sql}`);
}

beforeAll(async () => {
  await db.connect();
  await db.query("begin");

  for (const id of [usuarioA, usuarioB, usuarioC]) {
    await db.query(
      "insert into auth.users (id, aud, role, email) values ($1, 'authenticated', 'authenticated', $2)",
      [id, `teste-${id}@exemplo.test`],
    );
  }

  await como(usuarioA);
  salaoA = (await db.query("select public.criar_salao('Salão A') as id")).rows[0].id;

  await como(usuarioB);
  salaoB = (await db.query("select public.criar_salao('Salão B') as id")).rows[0].id;

  await comoAdmin();
  await db.query(
    "insert into public.usuarios_salao (salao_id, user_id, perfil) values ($1, $2, 'recepcao')",
    [salaoA, usuarioC],
  );
});

afterAll(async () => {
  await db.query("rollback"); // desfaz tudo: nada fica no banco
  await db.end();
});

describe("Regra geral", () => {
  it("nenhuma tabela do sistema está sem RLS", async () => {
    await comoAdmin();
    const { rows } = await db.query(`
      select c.relname
      from pg_class c join pg_namespace n on n.oid = c.relnamespace
      where n.nspname = 'public' and c.relkind in ('r', 'p') and not c.relrowsecurity
    `);
    expect(rows.map((r) => r.relname)).toEqual([]);
  });
});

describe("Isolamento entre salões", () => {
  it("o dono do Salão A só vê o Salão A", async () => {
    await como(usuarioA);
    const { rows } = await db.query("select id from public.saloes");
    expect(rows.map((r) => r.id)).toEqual([salaoA]);
  });

  it("o dono do Salão B só vê o Salão B", async () => {
    await como(usuarioB);
    const { rows } = await db.query("select id from public.saloes");
    expect(rows.map((r) => r.id)).toEqual([salaoB]);
  });

  it("o Salão A não vê a equipe do Salão B", async () => {
    await como(usuarioA);
    const { rows } = await db.query("select salao_id from public.usuarios_salao");
    expect(rows.length).toBe(2); // dono + recepção do Salão A
    expect(rows.every((r) => r.salao_id === salaoA)).toBe(true);
  });

  it("o Salão A não vê a auditoria do Salão B", async () => {
    await como(usuarioA);
    const { rows } = await db.query("select salao_id from public.audit_log");
    expect(rows.length).toBeGreaterThan(0);
    expect(rows.every((r) => r.salao_id === salaoA)).toBe(true);
  });

  it("o Salão A não consegue alterar o Salão B", async () => {
    await como(usuarioA);
    const r = await db.query("update public.saloes set nome = 'Invadido' where id = $1", [salaoB]);
    expect(r.rowCount).toBe(0);

    await comoAdmin();
    const { rows } = await db.query("select nome from public.saloes where id = $1", [salaoB]);
    expect(rows[0].nome).toBe("Salão B");
  });

  it("o Salão A não consegue se colocar dentro do Salão B", async () => {
    await como(usuarioA);
    await deveFalhar(
      "insert into public.usuarios_salao (salao_id, user_id, perfil) values ($1, $2, 'dono')",
      [salaoB, usuarioA],
    );
  });
});

describe("Perfis", () => {
  it("a recepção vê o próprio salão, mas não altera o nome", async () => {
    await como(usuarioC);
    const { rows } = await db.query("select id from public.saloes");
    expect(rows.map((r) => r.id)).toEqual([salaoA]);

    const r = await db.query("update public.saloes set nome = 'Outro' where id = $1", [salaoA]);
    expect(r.rowCount).toBe(0);
  });

  it("a recepção não vê a auditoria", async () => {
    await como(usuarioC);
    const { rows } = await db.query("select id from public.audit_log");
    expect(rows).toEqual([]);
  });

  it("o dono não consegue mudar o próprio plano nem o status", async () => {
    await como(usuarioA);
    await deveFalhar("update public.saloes set plano = 'premium' where id = $1", [salaoA]);
    await deveFalhar("update public.saloes set status = 'ativo' where id = $1", [salaoA]);
  });
});

describe("Visitante sem login", () => {
  it("não vê nenhum salão", async () => {
    await como(null);
    await deveFalhar("select * from public.saloes");
  });

  it("não consegue criar salão", async () => {
    await como(null);
    await deveFalhar("select public.criar_salao('Pirata')");
  });
});

describe("Auditoria", () => {
  it("registra quem alterou o nome do salão, com antes e depois", async () => {
    await como(usuarioA);
    const r = await db.query("update public.saloes set nome = 'Salão A Novo' where id = $1", [salaoA]);
    expect(r.rowCount).toBe(1);

    const { rows } = await db.query(
      "select user_id, antes->>'nome' as antes, depois->>'nome' as depois from public.audit_log where entidade = 'saloes' and acao = 'update'",
    );
    expect(rows).toEqual([{ user_id: usuarioA, antes: "Salão A", depois: "Salão A Novo" }]);
  });

  it("registra a criação do salão e a entrada do dono", async () => {
    await como(usuarioA);
    const { rows } = await db.query(
      "select entidade from public.audit_log where acao = 'insert' order by id",
    );
    expect(rows.map((r) => r.entidade)).toEqual(
      expect.arrayContaining(["saloes", "usuarios_salao"]),
    );
  });

  it("ninguém consegue apagar ou alterar a auditoria", async () => {
    await como(usuarioA);
    await deveFalhar("delete from public.audit_log");
    await deveFalhar("update public.audit_log set acao = 'x'");
  });
});
