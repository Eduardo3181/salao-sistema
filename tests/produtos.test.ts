/**
 * Produtos: isolamento entre salões, permissões por perfil e custo visível só para o dono.
 * Roda no banco de TESTE dentro de uma transação desfeita no final.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { novaConexao } from "./apoio/banco";

const { db, como, comoAdmin, deveFalhar, criarUsuario, criarSalao, colocarNaEquipe } = novaConexao();

let donoA = "", donoB = "", recepcaoA = "", profissionalA = "";
let salaoA = "", salaoB = "";
let produtoA = "";

const criar = "insert into public.produtos (salao_id, nome, preco_centavos, custo_centavos) values ($1, $2, $3, $4) returning id";

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

describe("Cadastro de produtos", () => {
  it("o dono cria produto com preço e custo", async () => {
    await como(donoA);
    produtoA = (await db.query(criar, [salaoA, "Shampoo 300 ml", 4500, 2000])).rows[0].id;
    expect(produtoA).toBeTruthy();
  });

  it("custo é opcional", async () => {
    await como(donoA);
    expect((await db.query(criar, [salaoA, "Esmalte", 1200, null])).rows[0].id).toBeTruthy();
  });

  it("não aceita nome repetido, preço ou custo negativo", async () => {
    await como(donoA);
    await deveFalhar(criar, [salaoA, " shampoo 300 ML ", 1000, null]);
    await deveFalhar(criar, [salaoA, "Creme", -1, null]);
    await deveFalhar(criar, [salaoA, "Creme", 1000, -5]);
  });

  it("recepção e profissional veem nome e preço, mas não criam nem alteram", async () => {
    for (const quem of [recepcaoA, profissionalA]) {
      await como(quem);
      const { rows } = await db.query("select nome, preco_centavos from public.produtos order by nome");
      expect(rows.map((r) => r.nome)).toEqual(["Esmalte", "Shampoo 300 ml"]);
      await deveFalhar(criar, [salaoA, "Máscara", 5000, null]);
      const r = await db.query("update public.produtos set preco_centavos = 1 where id = $1", [produtoA]);
      expect(r.rowCount).toBe(0);
    }
  });

  it("ninguém apaga produto (só desativa)", async () => {
    await como(donoA);
    await deveFalhar("delete from public.produtos where id = $1", [produtoA]);
    await db.query("update public.produtos set ativo = false where id = $1", [produtoA]);
    await db.query("update public.produtos set ativo = true where id = $1", [produtoA]);
  });
});

describe("Custo só para o dono", () => {
  it("ninguém lê a coluna de custo diretamente, nem o dono", async () => {
    for (const quem of [donoA, recepcaoA, profissionalA]) {
      await como(quem);
      await deveFalhar("select custo_centavos from public.produtos");
    }
  });

  it("o dono vê o custo pela função; recepção e profissional recebem vazio", async () => {
    await como(donoA);
    const { rows } = await db.query("select * from public.custos_dos_produtos($1) where id = $2", [salaoA, produtoA]);
    expect(Number(rows[0].custo_centavos)).toBe(2000);
    for (const quem of [recepcaoA, profissionalA]) {
      await como(quem);
      expect((await db.query("select * from public.custos_dos_produtos($1)", [salaoA])).rows).toEqual([]);
    }
  });
});

describe("Isolamento entre salões", () => {
  it("o Salão B não vê, não altera nem cria produto no Salão A", async () => {
    await como(donoB);
    expect((await db.query("select id from public.produtos")).rows).toEqual([]);
    expect((await db.query("update public.produtos set preco_centavos = 1 where id = $1", [produtoA])).rowCount).toBe(0);
    await deveFalhar(criar, [salaoA, "Intruso", 100, null]);
    expect((await db.query("select * from public.custos_dos_produtos($1)", [salaoA])).rows).toEqual([]);
  });

  it("o dono não consegue mudar o produto de salão", async () => {
    await como(donoA);
    await deveFalhar("update public.produtos set salao_id = $1 where id = $2", [salaoB, produtoA]);
  });

  it("visitante sem login não vê produtos", async () => {
    await como(null);
    await deveFalhar("select id from public.produtos");
  });
});

describe("Auditoria", () => {
  it("registra a mudança de preço com antes e depois", async () => {
    await como(donoA);
    await db.query("update public.produtos set preco_centavos = 5000 where id = $1", [produtoA]);
    await comoAdmin();
    const { rows } = await db.query(
      "select (antes->>'preco_centavos')::bigint as antes, (depois->>'preco_centavos')::bigint as depois from public.audit_log where entidade = 'produtos' and acao = 'update' and depois->>'preco_centavos' = '5000'",
    );
    expect(rows.map((r) => [Number(r.antes), Number(r.depois)])).toEqual([[4500, 5000]]);
  });
});
