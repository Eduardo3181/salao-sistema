/**
 * Ferramentas comuns dos testes de banco.
 * Cada arquivo de teste abre a própria conexão, trabalha dentro de uma transação
 * e desfaz tudo no final (nada fica salvo no banco de teste).
 */
import { randomUUID } from "node:crypto";
import { Client } from "pg";

export function novaConexao() {
  const dbUrl = process.env.SUPABASE_DB_URL;
  if (!dbUrl) throw new Error("Falta SUPABASE_DB_URL no arquivo .env.local");
  const db = new Client({ connectionString: dbUrl });

  /** Passa a agir como um usuário logado (ou visitante, se null). */
  async function como(userId: string | null) {
    await db.query("reset role");
    const claims = userId ? { sub: userId, role: "authenticated" } : { role: "anon" };
    await db.query("select set_config('request.jwt.claims', $1, true)", [JSON.stringify(claims)]);
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

  /** Cria um usuário de mentira (só existe dentro da transação). */
  async function criarUsuario() {
    const id = randomUUID();
    await db.query(
      "insert into auth.users (id, aud, role, email) values ($1, 'authenticated', 'authenticated', $2)",
      [id, `teste-${id}@exemplo.test`],
    );
    return id;
  }

  /** Cria um salão com o usuário como dono. */
  async function criarSalao(donoId: string, nome: string) {
    await como(donoId);
    const { rows } = await db.query("select public.criar_salao($1) as id", [nome]);
    await comoAdmin();
    return rows[0].id as string;
  }

  /** Coloca alguém na equipe de um salão (direto, como administrador). */
  async function colocarNaEquipe(salaoId: string, userId: string, perfil: "recepcao" | "profissional") {
    await comoAdmin();
    await db.query("insert into public.usuarios_salao (salao_id, user_id, perfil) values ($1, $2, $3)", [
      salaoId,
      userId,
      perfil,
    ]);
  }

  return { db, como, comoAdmin, deveFalhar, criarUsuario, criarSalao, colocarNaEquipe };
}
