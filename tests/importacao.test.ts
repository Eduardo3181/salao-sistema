import { describe, expect, it } from "vitest";
import {
  converterData,
  converterDuracao,
  converterPreco,
  encontrarColunas,
  lerCsv,
  lerPlanilha,
  normalizarCabecalho,
} from "@/lib/importacao";

const hoje = "2026-11-17";

describe("Cabeçalhos", () => {
  it("entende cabeçalhos com acento, espaço e maiúscula", () => {
    expect(normalizarCabecalho("Data de Nascimento")).toBe("datadenascimento");
    expect(normalizarCabecalho(" Observações ")).toBe("observacoes");
  });

  it("acha as colunas de clientes por sinônimos comuns", () => {
    expect(encontrarColunas(["Cliente", "Celular", "Aniversário", "Obs"], "clientes")).toEqual({
      nome: 0,
      telefone: 1,
      nascimento: 2,
      observacoes: 3,
    });
  });

  it("em serviços prefere a coluna 'Serviço' à coluna 'Nome'", () => {
    expect(encontrarColunas(["Nome", "Serviço", "Grupo", "Tempo", "Valor"], "servicos")).toMatchObject({ nome: 1, categoria: 2 });
  });
});

describe("Conversões", () => {
  it.each([
    [new Date(Date.UTC(1990, 4, 10)), "1990-05-10"],
    ["10/05/1990", "1990-05-10"],
    ["1/5/1990", "1990-05-01"],
    ["1990-05-10", "1990-05-10"],
    [32998, "1990-05-05"], // número de série do Excel
    ["", ""],
    [null, ""],
  ])("data %j vira %j", (c, esperado) => {
    expect(converterData(c as never, hoje)).toBe(esperado);
  });

  it.each(["31/02/1990", "10/05/90", "amanhã", "2030-01-01"])("recusa a data %j", (c) => {
    expect(converterData(c, hoje)).toBeNull();
  });

  it.each([
    [80, 8000],
    [80.5, 8050],
    [19.99, 1999],
    ["R$ 80,50", 8050],
    ["1.234,56", 123456],
  ])("preço %j vira %i centavos", (c, esperado) => {
    expect(converterPreco(c)).toBe(esperado);
  });

  it("recusa preço negativo ou texto", () => {
    expect(converterPreco(-1)).toBeNull();
    expect(converterPreco("grátis")).toBeNull();
  });

  it.each([
    [45, 45],
    ["45", 45],
    ["45min", 45],
    ["1h30", 90],
    ["1h", 60],
    ["01:30", 90],
    [0.0625, 90], // 1h30 como fração de dia no Excel
  ])("duração %j vira %i minutos", (c, esperado) => {
    expect(converterDuracao(c)).toBe(esperado);
  });

  it("recusa duração absurda", () => {
    expect(converterDuracao(0)).toBeNull();
    expect(converterDuracao("13h")).toBeNull();
    expect(converterDuracao("rápido")).toBeNull();
  });
});

describe("Planilha de clientes", () => {
  it("separa linhas certas, com erro, repetidas e em branco", () => {
    const r = lerPlanilha(
      [
        ["Nome", "Celular", "Nascimento"],
        ["Ana Teste", 11987654321, "10/05/1990"], // telefone salvo como número
        ["Bia Teste", "(11) 3333-4444", ""],
        ["", "", ""], // em branco: ignorada
        ["Carla Teste", "98765", ""], // sem DDD
        ["Ana Repetida", "11 98765-4321", ""], // mesmo telefone da linha 2
        ["Dani Teste", "", "31/02/1990"], // data inexistente
        ["Eva Teste", null, null],
      ],
      "clientes",
      hoje,
    );
    expect(r.faltando).toEqual([]);
    expect(r.validas.map((v) => [v.linha, v.nome, v.telefone, v.nascimento])).toEqual([
      [2, "Ana Teste", "11987654321", "1990-05-10"],
      [3, "Bia Teste", "1133334444", null],
      [8, "Eva Teste", null, null],
    ]);
    expect(r.erros).toEqual([
      { linha: 5, motivo: "telefone inválido (use DDD + número)" },
      { linha: 6, motivo: "repetida na planilha (igual à linha 2)" },
      { linha: 7, motivo: "data de nascimento inválida" },
    ]);
  });

  it("avisa quando não encontra a coluna de nome", () => {
    const r = lerPlanilha([["Telefone"], ["11987654321"]], "clientes", hoje);
    expect(r.faltando).toEqual(["nome"]);
    expect(r.validas).toEqual([]);
  });
});

describe("Planilha de serviços", () => {
  it("lê serviços com categoria, duração e preço em formatos variados", () => {
    const r = lerPlanilha(
      [
        ["Serviço", "Categoria", "Duração", "Preço"],
        ["Corte feminino", "Cabelo", "45min", "R$ 80,00"],
        ["Escova", "Cabelo", 40, 55],
        ["Mão", "Unhas", "30", "25,5"],
        ["Escova", "Cabelo", 40, 55], // repetido
        ["Pé", "", "30", "30"], // sem categoria
      ],
      "servicos",
      hoje,
    );
    expect(r.validas.map((v) => [v.nome, v.categoria, v.duracao_min, v.preco_centavos])).toEqual([
      ["Corte feminino", "Cabelo", 45, 8000],
      ["Escova", "Cabelo", 40, 5500],
      ["Mão", "Unhas", 30, 2550],
    ]);
    expect(r.erros.map((e) => e.linha)).toEqual([5, 6]);
  });

  it("exige as quatro colunas", () => {
    const r = lerPlanilha([["Serviço", "Preço"]], "servicos", hoje);
    expect(r.faltando).toEqual(["categoria", "duracao"]);
  });
});

describe("Arquivo CSV", () => {
  it("lê CSV do Excel brasileiro (ponto e vírgula, aspas, acentos)", () => {
    const csv = '﻿Nome;Telefone;Observações\r\n"Silva; Ana";11987654321;"Diz ""oi"""\r\nBia;;\r\n';
    expect(lerCsv(csv)).toEqual([
      ["Nome", "Telefone", "Observações"],
      ["Silva; Ana", "11987654321", 'Diz "oi"'],
      ["Bia", "", ""],
    ]);
  });

  it("lê CSV separado por vírgula", () => {
    expect(lerCsv("Nome,Telefone\nAna,11987654321")).toEqual([
      ["Nome", "Telefone"],
      ["Ana", "11987654321"],
    ]);
  });
});
