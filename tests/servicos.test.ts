/**
 * Serviços e categorias: isolamento entre salões e permissões por perfil.
 * Roda no banco de TESTE dentro de uma transação desfeita no final.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { novaConexao } from "./apoio/banco";

const { db, como, comoAdmin, deveFalhar, criarUsuario, criarSalao, colocarNaEquipe } = novaConexao();

let donoA = "", donoB = "", recepcaoA = "", profissionalA = "";
let salaoA = "", salaoB = "";
let categoriaA = "", categoriaB = "", servicoA = "";

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

describe("Dono cadastra", () => {
  it("o dono do Salão A cria categoria e serviço", async () => {
    await como(donoA);
    categoriaA = (
      await db.query("insert into public.categorias_servico (salao_id, nome) values ($1, 'Cabelo') returning id", [salaoA])
    ).rows[0].id;
    servicoA = (
      await db.query(
        "insert into public.servicos (salao_id, categoria_id, nome, duracao_min, preco_centavos) values ($1, $2, 'Corte feminino', 45, 8000) returning id",
        [salaoA, categoriaA],
      )
    ).rows[0].id;
    expect(servicoA).toBeTruthy();
  });

  it("o dono do Salão B cria a própria categoria", async () => {
    await como(donoB);
    categoriaB = (
      await db.query("insert into public.categorias_servico (salao_id, nome) values ($1, 'Unhas') returning id", [salaoB])
    ).rows[0].id;
    expect(categoriaB).toBeTruthy();
  });

  it("não aceita dois serviços com o mesmo nome no salão", async () => {
    await como(donoA);
    await deveFalhar(
      "insert into public.servicos (salao_id, categoria_id, nome, duracao_min, preco_centavos) values ($1, $2, ' corte FEMININO ', 30, 5000)",
      [salaoA, categoriaA],
    );
  });

  it("não aceita preço negativo nem duração zero", async () => {
    await como(donoA);
    await deveFalhar(
      "insert into public.servicos (salao_id, categoria_id, nome, duracao_min, preco_centavos) values ($1, $2, 'Grátis demais', 30, -1)",
      [salaoA, categoriaA],
    );
    await deveFalhar(
      "insert into public.servicos (salao_id, categoria_id, nome, duracao_min, preco_centavos) values ($1, $2, 'Sem tempo', 0, 1000)",
      [salaoA, categoriaA],
    );
  });
});

describe("Isolamento entre salões", () => {
  it("o Salão B não vê os serviços nem as categorias do Salão A", async () => {
    await como(donoB);
    const s = await db.query("select salao_id from public.servicos");
    expect(s.rows.every((r) => r.salao_id === salaoB)).toBe(true);
    const c = await db.query("select salao_id from public.categorias_servico");
    expect(c.rows.map((r) => r.salao_id)).toEqual([salaoB]);
  });

  it("o Salão B não altera o preço de um serviço do Salão A", async () => {
    await como(donoB);
    const r = await db.query("update public.servicos set preco_centavos = 1 where id = $1", [servicoA]);
    expect(r.rowCount).toBe(0);
    await comoAdmin();
    const { rows } = await db.query("select preco_centavos from public.servicos where id = $1", [servicoA]);
    expect(Number(rows[0].preco_centavos)).toBe(8000);
  });

  it("o Salão B não cria serviço dentro do Salão A", async () => {
    await como(donoB);
    await deveFalhar(
      "insert into public.servicos (salao_id, categoria_id, nome, duracao_min, preco_centavos) values ($1, $2, 'Invasão', 30, 100)",
      [salaoA, categoriaA],
    );
  });

  it("um serviço não pode usar a categoria de outro salão", async () => {
    await como(donoA);
    await deveFalhar(
      "insert into public.servicos (salao_id, categoria_id, nome, duracao_min, preco_centavos) values ($1, $2, 'Mistura', 30, 100)",
      [salaoA, categoriaB],
    );
  });

  it("o dono não consegue mudar o serviço de salão", async () => {
    await como(donoA);
    await deveFalhar("update public.servicos set salao_id = $1 where id = $2", [salaoB, servicoA]);
  });
});

describe("Perfis", () => {
  it("recepção e profissional veem os serviços do próprio salão", async () => {
    for (const quem of [recepcaoA, profissionalA]) {
      await como(quem);
      const { rows } = await db.query("select id from public.servicos");
      expect(rows.map((r) => r.id)).toEqual([servicoA]);
    }
  });

  it("recepção e profissional não alteram preços nem criam serviços", async () => {
    for (const quem of [recepcaoA, profissionalA]) {
      await como(quem);
      const r = await db.query("update public.servicos set preco_centavos = 1 where id = $1", [servicoA]);
      expect(r.rowCount).toBe(0);
      await deveFalhar(
        "insert into public.servicos (salao_id, categoria_id, nome, duracao_min, preco_centavos) values ($1, $2, 'Novo', 30, 100)",
        [salaoA, categoriaA],
      );
      await deveFalhar("insert into public.categorias_servico (salao_id, nome) values ($1, 'Nova')", [salaoA]);
    }
  });

  it("ninguém apaga serviço (só desativa)", async () => {
    await como(donoA);
    await deveFalhar("delete from public.servicos where id = $1", [servicoA]);
    const r = await db.query("update public.servicos set ativo = false where id = $1", [servicoA]);
    expect(r.rowCount).toBe(1);
  });

  it("visitante sem login não vê serviços", async () => {
    await como(null);
    await deveFalhar("select * from public.servicos");
  });
});

describe("Auditoria", () => {
  it("registra a mudança de preço com antes e depois", async () => {
    await como(donoA);
    await db.query("update public.servicos set preco_centavos = 9000 where id = $1", [servicoA]);
    const { rows } = await db.query(
      "select (antes->>'preco_centavos')::bigint as antes, (depois->>'preco_centavos')::bigint as depois from public.audit_log where entidade = 'servicos' and acao = 'update' and depois->>'preco_centavos' = '9000'",
    );
    expect(rows.map((r) => [Number(r.antes), Number(r.depois)])).toEqual([[8000, 9000]]);
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
