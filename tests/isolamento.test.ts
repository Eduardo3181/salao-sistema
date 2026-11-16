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
const usuarioD = randomUUID(); // pessoa nova, adicionada à equipe nos testes
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

  for (const id of [usuarioA, usuarioB, usuarioC, usuarioD]) {
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

describe("Equipe", () => {
  let membroD = "";

  it("o dono do Salão B não consegue colocar alguém no Salão A", async () => {
    await como(usuarioB);
    await deveFalhar(
      "select public.adicionar_membro($1, $2, 'recepcao', 'Intrusa', true)",
      [salaoA, usuarioD],
    );
  });

  it("a recepção não consegue adicionar pessoas", async () => {
    await como(usuarioC);
    await deveFalhar(
      "select public.adicionar_membro($1, $2, 'profissional', 'Fulana', true)",
      [salaoA, usuarioD],
    );
  });

  it("ninguém consegue ser adicionado como dono por aqui", async () => {
    await como(usuarioA);
    await deveFalhar("select public.adicionar_membro($1, $2, 'dono', 'Fulana', true)", [salaoA, usuarioD]);
  });

  it("o dono adiciona uma profissional com senha provisória", async () => {
    await como(usuarioA);
    membroD = (
      await db.query("select public.adicionar_membro($1, $2, 'profissional', 'Profissional D', true) as id", [
        salaoA,
        usuarioD,
      ])
    ).rows[0].id;
    expect(membroD).toBeTruthy();

    await como(usuarioD);
    const { rows } = await db.query("select id from public.saloes");
    expect(rows.map((r) => r.id)).toEqual([salaoA]);
  });

  it("a auditoria registra quem adicionou a pessoa", async () => {
    await como(usuarioA);
    const { rows } = await db.query(
      "select user_id from public.audit_log where entidade = 'usuarios_salao' and entidade_id = $1",
      [membroD],
    );
    expect(rows).toEqual([{ user_id: usuarioA }]);
  });

  it("só o dono do salão vê a lista da equipe com e-mails", async () => {
    await como(usuarioA);
    const dono = await db.query("select email from public.equipe_do_salao($1)", [salaoA]);
    expect(dono.rows.length).toBe(3); // dono, recepção e profissional

    await como(usuarioB); // dono de OUTRO salão
    const outro = await db.query("select email from public.equipe_do_salao($1)", [salaoA]);
    expect(outro.rows).toEqual([]);

    await como(usuarioC); // recepção do mesmo salão
    const recepcao = await db.query("select email from public.equipe_do_salao($1)", [salaoA]);
    expect(recepcao.rows).toEqual([]);
  });

  it("a pessoa conclui a troca da senha provisória", async () => {
    await como(usuarioD);
    await db.query("select public.concluir_troca_senha()");
    await comoAdmin();
    const { rows } = await db.query("select trocar_senha from public.usuarios_salao where id = $1", [membroD]);
    expect(rows[0].trocar_senha).toBe(false);
  });

  it("o dono de outro salão e a recepção não tiram o acesso de ninguém", async () => {
    await como(usuarioB);
    await deveFalhar("select public.definir_acesso_membro($1, false)", [membroD]);
    await como(usuarioC);
    await deveFalhar("select public.definir_acesso_membro($1, false)", [membroD]);
  });

  it("o acesso do dono não pode ser tirado", async () => {
    await comoAdmin();
    const { rows } = await db.query(
      "select id from public.usuarios_salao where salao_id = $1 and perfil = 'dono'",
      [salaoA],
    );
    await como(usuarioA);
    await deveFalhar("select public.definir_acesso_membro($1, false)", [rows[0].id]);
  });

  it("quem perde o acesso deixa de ver o salão na hora", async () => {
    await como(usuarioA);
    await db.query("select public.definir_acesso_membro($1, false)", [membroD]);

    await como(usuarioD);
    const saloes = await db.query("select id from public.saloes");
    expect(saloes.rows).toEqual([]);
    const equipe = await db.query("select id from public.usuarios_salao");
    expect(equipe.rows).toEqual([]);
  });

  it("procurar conta por e-mail é só para o servidor", async () => {
    await como(usuarioA);
    await deveFalhar("select public.id_usuario_por_email($1)", [`teste-${usuarioB}@exemplo.test`]);

    await db.query("reset role");
    await db.query("set local role service_role");
    const { rows } = await db.query("select public.id_usuario_por_email($1) as id", [
      `TESTE-${usuarioB}@exemplo.test`,
    ]);
    expect(rows[0].id).toBe(usuarioB);
  });
});
