/**
 * Documentos dos clientes (LGPD e portabilidade): o arquivo de um cliente e a lista completa.
 * A lista tem que poder ser importada de volta (mesmos nomes de coluna da importação).
 */
import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { textoDaCelula } from "@/lib/exportar/documento";
import { documentoDadosCliente, documentoListaClientes, type DadosCliente, type LinhaListaClientes } from "@/lib/exportar/modelos";
import { gerarPdf } from "@/lib/exportar/pdf";
import { gerarXlsx } from "@/lib/exportar/xlsx";
import { lerPlanilha } from "@/lib/importacao";

const dados: DadosCliente = {
  cliente: { nome: "Maria Fictícia", telefone: "11999990000", nascimento: "1990-05-10", observacoes: "Alergia a amônia", ativo: true, cadastrado_em: "2026-11-10T13:00:00Z" },
  aceites: [{ aceitou: true, origem: "recepcao", registrado_em: "2026-11-10T13:05:00Z" }],
  horarios: [{ inicio: "2026-11-19T13:00:00Z", servico: "Corte", profissional: "Ana", situacao: "agendado", valor: 10000 }],
  consumo: [
    { data: "2026-11-12T13:00:00Z", situacao: "fechada", item: "Corte", profissional: "Ana", quantidade: 1, total: 10000 },
    { data: "2026-11-12T13:00:00Z", situacao: "fechada", item: "Desconto na comanda", profissional: null, quantidade: 1, total: -1000 },
  ],
  pagamentos: [{ data: "2026-11-12T14:00:00Z", forma: "credito_parcelado", parcelas: 3, valor: 9000 }],
};

const textos = (linhas: { texto: string }[][] | unknown[][]) => (linhas as Parameters<typeof textoDaCelula>[0][][]).map((l) => l.map(textoDaCelula));

describe("Arquivo com os dados de um cliente", () => {
  const doc = documentoDadosCliente(dados, "Salão Teste", "Gerado em 18/11/2026 às 14:00 (horário de Brasília)");

  it("traz a ficha, os aceites, os horários, o consumo e os pagamentos, com datas em Brasília", () => {
    expect(doc.periodo).toBe("Maria Fictícia");
    expect(doc.secoes.map((s) => s.titulo)).toHaveLength(5);
    expect(textos(doc.secoes[0].linhas)).toContainEqual(["Telefone", "(11) 99999-0000"]);
    expect(textos(doc.secoes[0].linhas)).toContainEqual(["Nascimento", "10/05/1990"]);
    expect(textos(doc.secoes[1].linhas)[0]).toEqual(["10/11/2026 10:05", "Aceitou", "Registrado no salão"]);
    expect(textos(doc.secoes[2].linhas)[0]).toEqual(["19/11/2026 10:00", "Corte", "Ana", "Agendado", "R$ 100,00"]);
    expect(textos(doc.secoes[3].linhas)[1]).toEqual(["12/11/2026", "Desconto na comanda", "", "1", "-R$ 10,00", "Fechada"]);
    expect(textos(doc.secoes[4].linhas)[0]).toEqual(["12/11/2026 11:00", "Crédito parcelado (3x)", "R$ 90,00"]);
    expect(doc.rodape).toContain("LGPD");
  });

  it("seções vazias dizem que não há nada", () => {
    const vazio = documentoDadosCliente({ ...dados, aceites: [], horarios: [], consumo: [], pagamentos: [] }, "Salão", "Gerado");
    expect(textos(vazio.secoes[1].linhas)[0][0]).toBe("Nunca perguntado");
    expect(textos(vazio.secoes[4].linhas)[0][0]).toBe("Nenhum");
    expect(vazio.secoes[4].total).toBeUndefined();
  });

  it("gera PDF e Excel de verdade", async () => {
    expect(gerarPdf(doc).subarray(0, 4).toString("latin1")).toBe("%PDF");
    expect((await gerarXlsx(doc)).subarray(0, 2).toString("latin1")).toBe("PK");
  });
});

describe("Lista completa de clientes", () => {
  const lista: LinhaListaClientes[] = [
    { nome: "Joana Fictícia", telefone: null, nascimento: null, observacoes: null, ativo: false, cadastrado_em: "2026-11-01T13:00:00Z", whatsapp: null, ultima_visita: null },
    { nome: "Maria Fictícia", telefone: "11999990000", nascimento: "1990-05-10", observacoes: "Alergia a amônia", ativo: true, cadastrado_em: "2026-11-10T13:00:00Z", whatsapp: true, ultima_visita: "2026-11-12T14:00:00Z" },
  ];
  const doc = documentoListaClientes(lista, "Salão Teste", "2026-11-18", "Gerado");

  it("uma linha por cliente, com situação, WhatsApp e última visita", () => {
    expect(doc.periodo).toBe("2 clientes em 18/11/2026");
    expect(textos(doc.secoes[0].linhas)[0]).toEqual(["Joana Fictícia", "", "", "", "Desativado", "Não perguntado", "", "01/11/2026"]);
    expect(textos(doc.secoes[0].linhas)[1]).toEqual(["Maria Fictícia", "(11) 99999-0000", "10/05/1990", "Alergia a amônia", "Ativo", "Aceitou", "12/11/2026", "10/11/2026"]);
  });

  it("a planilha pode ser importada de volta, sem perder nome, telefone, nascimento e observações", () => {
    const planilha = [doc.secoes[0].colunas, ...textos(doc.secoes[0].linhas)];
    const r = lerPlanilha(planilha, "clientes", "2026-11-18");
    expect(r.faltando).toEqual([]);
    expect(r.erros).toEqual([]);
    expect(r.validas).toEqual([
      expect.objectContaining({ nome: "Joana Fictícia", telefone: null, nascimento: null, observacoes: null }),
      expect.objectContaining({ nome: "Maria Fictícia", telefone: "11999990000", nascimento: "1990-05-10", observacoes: "Alergia a amônia" }),
    ]);
  });

  it("o arquivo Excel de verdade volta pelo importador", async () => {
    const { readSheet } = await import("read-excel-file/node");
    const linhas = await readSheet(await gerarXlsx(doc));
    expect(linhas[0]).toEqual(doc.secoes[0].colunas);
    const r = lerPlanilha(linhas as Parameters<typeof lerPlanilha>[0], "clientes", "2026-11-18");
    expect(r.erros).toEqual([]);
    expect(r.validas.map((c) => c.telefone)).toEqual([null, "11999990000"]);
  });
});
