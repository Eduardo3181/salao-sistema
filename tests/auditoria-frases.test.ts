/**
 * Toda tabela com registro de atividades precisa ter frase em português.
 * Lê do banco quais tabelas têm o gatilho de auditoria: tabela nova sem frase faz este teste falhar.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { descreverAuditoria } from "@/lib/salao";
import { novaConexao } from "./apoio/banco";

const { db } = novaConexao();
let tabelas: string[] = [];

beforeAll(async () => {
  await db.connect();
  tabelas = (
    await db.query(`
      select distinct c.relname as tabela
      from pg_trigger t
      join pg_class c on c.oid = t.tgrelid
      join pg_proc p on p.oid = t.tgfoid
      where c.relnamespace = 'public'::regnamespace and p.proname like 'auditar%' and not t.tgisinternal
      order by 1`)
  ).rows.map((r) => r.tabela);
});

afterAll(async () => {
  await db.end();
});

describe("Frases do registro de atividades", () => {
  it("todas as tabelas auditadas têm frase (nada de \"insert em ...\")", () => {
    expect(tabelas.length).toBeGreaterThan(20);
    const semFrase: string[] = [];
    for (const entidade of tabelas) {
      for (const acao of ["insert", "update", "delete"]) {
        const frase = descreverAuditoria({ id: 1, user_id: null, entidade, acao, antes: {}, depois: acao === "delete" ? null : {}, em: "" });
        if (frase === `${acao} em ${entidade}`) semFrase.push(`${acao} em ${entidade}`);
      }
    }
    expect(semFrase).toEqual([]);
  });
});
