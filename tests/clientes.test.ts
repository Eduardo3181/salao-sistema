/**
 * Clientes e configurações: isolamento, permissões por perfil, chave dos profissionais,
 * telefone protegido, assistente sem acesso e auditoria sem dados pessoais (LGPD).
 * Roda no banco de TESTE dentro de uma transação desfeita no final.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { novaConexao } from "./apoio/banco";

const { db, como, comoAdmin, deveFalhar, criarUsuario, criarSalao, colocarNaEquipe } = novaConexao();

let donoA = "", donoB = "", recepcaoA = "", profissionalA = "", assistenteA = "";
let salaoA = "", salaoB = "";
let clienteA = "";

const inserir =
  "insert into public.clientes (salao_id, nome, telefone, nascimento, observacoes) values ($1, $2, $3, $4, $5) returning id";
const listar = "select * from public.clientes_do_salao($1, $2)";

beforeAll(async () => {
  await db.connect();
  await db.query("begin");
  donoA = await criarUsuario();
  donoB = await criarUsuario();
  recepcaoA = await criarUsuario();
  profissionalA = await criarUsuario();
  assistenteA = await criarUsuario();
  salaoA = await criarSalao(donoA, "Salão A");
  salaoB = await criarSalao(donoB, "Salão B");
  await colocarNaEquipe(salaoA, recepcaoA, "recepcao");
  await colocarNaEquipe(salaoA, profissionalA, "profissional");
  await comoAdmin();
  await db.query("insert into public.usuarios_salao (salao_id, user_id, perfil) values ($1, $2, 'assistente')", [
    salaoA,
    assistenteA,
  ]);
});

afterAll(async () => {
  await db.query("rollback");
  await db.end();
});

describe("Quem cadastra clientes", () => {
  it("a recepção cadastra cliente", async () => {
    await como(recepcaoA);
    clienteA = (await db.query(inserir, [salaoA, "Maria Teste", "11987654321", "1990-05-10", "Alergia a amônia"])).rows[0].id;
    expect(clienteA).toBeTruthy();
  });

  it("o dono cadastra cliente só com o nome", async () => {
    await como(donoA);
    const { rows } = await db.query(inserir, [salaoA, "Joana Teste", null, null, null]);
    expect(rows[0].id).toBeTruthy();
  });

  it("com a chave no padrão (ligada), a profissional cadastra e altera", async () => {
    await como(profissionalA);
    const { rows } = await db.query(inserir, [salaoA, "Cliente da Profissional", "1133334444", null, null]);
    expect(rows[0].id).toBeTruthy();
    const r = await db.query("update public.clientes set observacoes = 'Prefere manhã' where id = $1", [clienteA]);
    expect(r.rowCount).toBe(1);
  });

  it("recepção e profissional não mexem na chave", async () => {
    for (const quem of [profissionalA, recepcaoA]) {
      await como(quem);
      await deveFalhar(
        "insert into public.configuracao_salao (salao_id, profissionais_editam_clientes) values ($1, false)",
        [salaoA],
      );
    }
  });

  it("quando o dono desliga a chave, a profissional perde a permissão na hora", async () => {
    await como(donoA);
    await db.query("insert into public.configuracao_salao (salao_id, profissionais_editam_clientes) values ($1, false)", [salaoA]);
    await como(profissionalA);
    await deveFalhar(inserir, [salaoA, "Outra", null, null, null]);
    const r = await db.query("update public.clientes set nome = 'Mudou' where id = $1", [clienteA]);
    expect(r.rowCount).toBe(0);
  });

  it("quando o dono religa, a profissional volta a poder", async () => {
    await como(donoA);
    await db.query("update public.configuracao_salao set profissionais_editam_clientes = true where salao_id = $1", [salaoA]);
    await como(profissionalA);
    const { rows } = await db.query(inserir, [salaoA, "Cliente Depois", null, null, null]);
    expect(rows[0].id).toBeTruthy();
  });

  it("a mudança da chave vai para a auditoria", async () => {
    await como(donoA);
    const { rows } = await db.query(
      "select acao, user_id from public.audit_log where entidade = 'configuracao_salao' order by id",
    );
    expect(rows).toEqual([
      { acao: "insert", user_id: donoA },
      { acao: "update", user_id: donoA },
    ]);
  });
});

describe("Telefone protegido", () => {
  it("ninguém lê a coluna de telefone direto (nem o dono)", async () => {
    for (const quem of [donoA, recepcaoA, profissionalA]) {
      await como(quem);
      await deveFalhar("select telefone from public.clientes");
    }
  });

  it("dono e recepção veem o telefone pela função", async () => {
    for (const quem of [donoA, recepcaoA]) {
      await como(quem);
      const { rows } = await db.query(listar, [salaoA, "Maria"]);
      expect(rows.map((r) => r.telefone)).toEqual(["11987654321"]);
    }
  });

  it("a profissional encontra pelo nome, mas sem telefone", async () => {
    await como(profissionalA);
    const { rows } = await db.query(listar, [salaoA, "Maria"]);
    expect(rows.map((r) => [r.nome, r.telefone])).toEqual([["Maria Teste", null]]);
  });

  it("a profissional não acha cliente pelo número de telefone", async () => {
    await como(profissionalA);
    const { rows } = await db.query(listar, [salaoA, "98765"]);
    expect(rows).toEqual([]);
    await como(recepcaoA);
    const r2 = await db.query(listar, [salaoA, "98765"]);
    expect(r2.rows.map((r) => r.nome)).toEqual(["Maria Teste"]);
  });

  it("a profissional cadastra telefone de cliente nova, mas depois não consegue ler", async () => {
    await como(profissionalA);
    const { rows } = await db.query(inserir, [salaoA, "Nova com Telefone", "11955554444", null, null]);
    const lida = await db.query("select * from public.clientes_do_salao($1, null, false, $2)", [salaoA, rows[0].id]);
    expect(lida.rows[0].telefone).toBeNull();
  });

  it("a profissional não altera o telefone de cliente existente; a recepção altera", async () => {
    await como(profissionalA);
    await deveFalhar("update public.clientes set telefone = null where id = $1", [clienteA]);
    await como(recepcaoA);
    const r = await db.query("update public.clientes set telefone = '11987654321' where id = $1", [clienteA]);
    expect(r.rowCount).toBe(1);
  });
});

describe("Assistente", () => {
  it("não vê clientes, nem pela tabela nem pela função", async () => {
    await como(assistenteA);
    const t = await db.query("select id from public.clientes");
    expect(t.rows).toEqual([]);
    const f = await db.query(listar, [salaoA, null]);
    expect(f.rows).toEqual([]);
  });

  it("não cadastra nem altera clientes, mesmo com a chave ligada", async () => {
    await como(assistenteA);
    await deveFalhar(inserir, [salaoA, "Pela Assistente", null, null, null]);
    const r = await db.query("update public.clientes set nome = 'X' where id = $1", [clienteA]);
    expect(r.rowCount).toBe(0);
  });

  it("o dono consegue dar acesso a uma assistente pela equipe", async () => {
    await comoAdmin();
    const nova = await criarUsuario();
    await como(donoA);
    const { rows } = await db.query("select public.adicionar_membro($1, $2, 'assistente', 'Assistente Nova', true) as id", [
      salaoA,
      nova,
    ]);
    expect(rows[0].id).toBeTruthy();
  });
});

describe("Validações", () => {
  it("telefone só com números e DDD (10 ou 11 dígitos)", async () => {
    await como(donoA);
    await deveFalhar(inserir, [salaoA, "Tel errado", "(11) 98765-4321", null, null]);
    await deveFalhar(inserir, [salaoA, "Tel curto", "98765432", null, null]);
  });

  it("observações com no máximo 1000 letras", async () => {
    await como(donoA);
    await deveFalhar(inserir, [salaoA, "Obs grande", null, null, "x".repeat(1001)]);
  });
});

describe("Isolamento entre salões", () => {
  it("o Salão B não vê as clientes do Salão A (tabela e função)", async () => {
    await como(donoB);
    const { rows } = await db.query("select id from public.clientes");
    expect(rows).toEqual([]);
    const f = await db.query(listar, [salaoA, null]);
    expect(f.rows).toEqual([]);
  });

  it("o Salão B não altera nem cadastra no Salão A", async () => {
    await como(donoB);
    const r = await db.query("update public.clientes set observacoes = 'x' where id = $1", [clienteA]);
    expect(r.rowCount).toBe(0);
    await deveFalhar(inserir, [salaoA, "Intrusa", null, null, null]);
  });

  it("o Salão B não vê nem muda as configurações do Salão A", async () => {
    await como(donoB);
    const { rows } = await db.query("select salao_id from public.configuracao_salao");
    expect(rows).toEqual([]);
    const r = await db.query(
      "update public.configuracao_salao set profissionais_editam_clientes = false where salao_id = $1",
      [salaoA],
    );
    expect(r.rowCount).toBe(0);
  });

  it("ninguém muda a cliente de salão nem apaga", async () => {
    await como(donoA);
    await deveFalhar("update public.clientes set salao_id = $1 where id = $2", [salaoB, clienteA]);
    await deveFalhar("delete from public.clientes where id = $1", [clienteA]);
  });

  it("visitante sem login não vê clientes", async () => {
    await como(null);
    await deveFalhar("select id from public.clientes");
    await deveFalhar(listar, [salaoA, null]);
  });
});

describe("LGPD: auditoria sem dados pessoais", () => {
  it("o registro da cliente não guarda nome, telefone, nascimento nem observações", async () => {
    await como(donoA);
    await db.query("update public.clientes set telefone = '11911112222' where id = $1", [clienteA]);
    const { rows } = await db.query(
      "select antes, depois from public.audit_log where entidade = 'clientes' and entidade_id = $1 order by id",
      [clienteA],
    );
    expect(rows.length).toBeGreaterThanOrEqual(3); // criação + 2 alterações
    const tudo = JSON.stringify(rows);
    for (const dado of ["Maria", "11987654321", "11911112222", "1990-05-10", "amônia", "manhã"]) {
      expect(tudo).not.toContain(dado);
    }
    expect(rows.at(-1).depois.campos_alterados).toEqual(["telefone"]);
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
