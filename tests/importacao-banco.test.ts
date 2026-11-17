/**
 * Importação no banco: só o dono importa, só no próprio salão, sem duplicar,
 * e uma linha inválida desfaz a importação inteira (nada pela metade).
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { novaConexao } from "./apoio/banco";

const { db, como, comoAdmin, deveFalhar, criarUsuario, criarSalao, colocarNaEquipe } = novaConexao();

let donoA = "", donoB = "", recepcaoA = "";
let salaoA = "", salaoB = "";

const clientes = (linhas: unknown[]) => [JSON.stringify(linhas)];
const importarClientes = "select public.importar_clientes($1, $2::jsonb) as r";
const importarServicos = "select public.importar_servicos($1, $2::jsonb) as r";

beforeAll(async () => {
  await db.connect();
  await db.query("begin");
  donoA = await criarUsuario();
  donoB = await criarUsuario();
  recepcaoA = await criarUsuario();
  salaoA = await criarSalao(donoA, "Salão A");
  salaoB = await criarSalao(donoB, "Salão B");
  await colocarNaEquipe(salaoA, recepcaoA, "recepcao");
});

afterAll(async () => {
  await db.query("rollback");
  await db.end();
});

describe("Importar clientes", () => {
  it("o dono importa e as repetidas são puladas", async () => {
    await como(donoA);
    const linhas = [
      { nome: "Ana", telefone: "11987654321", nascimento: "1990-05-10", observacoes: null },
      { nome: "Bia", telefone: null, nascimento: null, observacoes: "Cliente antiga" },
    ];
    const r1 = (await db.query(importarClientes, [salaoA, ...clientes(linhas)])).rows[0].r;
    expect(r1).toEqual({ inseridas: 2, ja_existiam: 0 });

    // De novo, com uma nova e duas que já existem (mesmo telefone; mesmo nome sem telefone)
    const r2 = (
      await db.query(importarClientes, [
        salaoA,
        ...clientes([...linhas.map((l) => ({ ...l, nome: l.nome + " " })), { nome: "Carla", telefone: "1133334444" }]),
      ])
    ).rows[0].r;
    expect(r2).toEqual({ inseridas: 1, ja_existiam: 2 });
  });

  it("recepção não importa; dono de outro salão não importa no Salão A", async () => {
    for (const quem of [recepcaoA, donoB]) {
      await como(quem);
      await deveFalhar(importarClientes, [salaoA, ...clientes([{ nome: "Intrusa" }])]);
    }
  });

  it("uma linha inválida desfaz a importação inteira", async () => {
    await como(donoA);
    await deveFalhar(importarClientes, [
      salaoA,
      ...clientes([
        { nome: "Valida Um", telefone: "11911112222" },
        { nome: "Telefone Ruim", telefone: "123" },
      ]),
    ]);
    const { rows } = await db.query("select nome from public.clientes where nome = 'Valida Um'");
    expect(rows).toEqual([]);
  });

  it("as clientes importadas aparecem só no Salão A, e a auditoria registra o dono", async () => {
    await como(donoB);
    expect((await db.query("select id from public.clientes")).rows).toEqual([]);
    // O dono B importa no próprio salão a mesma cliente: não conta como repetida (é outro salão)
    const r = (await db.query(importarClientes, [salaoB, ...clientes([{ nome: "Ana", telefone: "11987654321" }])])).rows[0].r;
    expect(r).toEqual({ inseridas: 1, ja_existiam: 0 });
    await como(donoA);
    const { rows } = await db.query(
      "select distinct user_id from public.audit_log where entidade = 'clientes' and acao = 'insert'",
    );
    expect(rows).toEqual([{ user_id: donoA }]);
  });
});

describe("Importar serviços", () => {
  it("cria as categorias que faltam e pula serviços repetidos", async () => {
    await como(donoA);
    const linhas = [
      { nome: "Corte", categoria: "Cabelo", duracao_min: 45, preco_centavos: 8000 },
      { nome: "Escova", categoria: "cabelo ", duracao_min: 40, preco_centavos: 5500 },
      { nome: "Mão", categoria: "Unhas", duracao_min: 30, preco_centavos: 2550 },
    ];
    const r1 = (await db.query(importarServicos, [salaoA, JSON.stringify(linhas)])).rows[0].r;
    expect(r1).toEqual({ inseridos: 3, ja_existiam: 0, categorias_criadas: 2 });
    const r2 = (await db.query(importarServicos, [salaoA, JSON.stringify(linhas)])).rows[0].r;
    expect(r2).toEqual({ inseridos: 0, ja_existiam: 3, categorias_criadas: 0 });
  });

  it("recepção e dono de outro salão não importam serviços", async () => {
    for (const quem of [recepcaoA, donoB]) {
      await como(quem);
      await deveFalhar(importarServicos, [
        salaoA,
        JSON.stringify([{ nome: "X", categoria: "Y", duracao_min: 30, preco_centavos: 100 }]),
      ]);
    }
  });

  it("preço negativo é barrado pelo banco", async () => {
    await como(donoA);
    await deveFalhar(importarServicos, [
      salaoA,
      JSON.stringify([{ nome: "Negativo", categoria: "Cabelo", duracao_min: 30, preco_centavos: -1 }]),
    ]);
  });

  it("visitante sem login não importa", async () => {
    await como(null);
    await deveFalhar(importarServicos, [salaoA, "[]"]);
    await comoAdmin();
  });
});
