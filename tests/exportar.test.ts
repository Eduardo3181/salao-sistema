/**
 * Baixar em PDF e Excel (Etapa 6, parte 4): formatação de valores, nomes de arquivo,
 * montagem dos documentos e geração real dos arquivos.
 */
import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { nomeDeArquivo, reaisTexto, textoDaCelula } from "@/lib/exportar/documento";
import { documentoCaixa, documentoDespesas, documentoExtrato, documentoRelatorio, rodapeGerado } from "@/lib/exportar/modelos";
import { gerarPdf } from "@/lib/exportar/pdf";
import { gerarXlsx } from "@/lib/exportar/xlsx";

const relatorio = {
  resultado: { entradas: 20000, taxas_cartao: 200, comissoes_pagas: 4000, vales: 1000, despesas: 3000, resultado: 11800 },
  por_forma: [
    { forma: "debito" as const, total: 10000, quantidade: 1, taxas: 200 },
    { forma: "pix" as const, total: 10000, quantidade: 1, taxas: 0 },
  ],
  por_profissional: [
    { nome: "Ana", servicos: 16000, produtos: 0, total: 16000 },
    { nome: "Bia", servicos: 0, produtos: 4590, total: 4590 },
  ],
  por_item: [{ tipo: "servico" as const, nome: "Coloração", quantidade: 1, total: 20000 }],
  por_categoria: [{ nome: "Luz", total: 3000, quantidade: 1 }],
  descontos_comanda: 590,
  comandas_fechadas: 2,
  comissoes_a_pagar: 13722,
};

describe("Formatação", () => {
  it("reais com milhar, centavos e negativo, sem número quebrado", () => {
    expect(reaisTexto(0)).toBe("R$ 0,00");
    expect(reaisTexto(5)).toBe("R$ 0,05");
    expect(reaisTexto(123456789)).toBe("R$ 1.234.567,89");
    expect(reaisTexto(-100)).toBe("-R$ 1,00");
  });

  it("nome de arquivo sem acento nem símbolo", () => {
    expect(nomeDeArquivo("Comissões Ana Júlia 2026-11-01 a 2026-11-30", "pdf")).toBe("comissoes-ana-julia-2026-11-01-a-2026-11-30.pdf");
    expect(nomeDeArquivo("!!!", "xlsx")).toBe("relatorio.xlsx");
  });

  it("rodapé com data e hora de Brasília", () => {
    expect(rodapeGerado(new Date("2026-11-18T17:05:00Z"))).toBe("Gerado em 18/11/2026 às 14:05 (horário de Brasília)");
  });
});

describe("Documentos", () => {
  it("relatório: resultado, totais por forma e aviso de comissões a pagar", () => {
    const d = documentoRelatorio(relatorio, "Salão Teste", "2026-11-01", "2026-11-30", "rodapé");
    expect(d.periodo).toBe("01/11/2026 a 30/11/2026");
    const resultado = d.secoes[0];
    expect(textoDaCelula(resultado.total![1])).toBe("R$ 118,00");
    expect(resultado.nota).toContain("R$ 137,22");
    const formas = d.secoes[1];
    expect(formas.linhas.map((l) => textoDaCelula(l[0]))).toEqual(["Débito", "Pix"]);
    expect(formas.total!.map(textoDaCelula)).toEqual(["Total", "2", "R$ 2,00", "R$ 200,00"]);
    expect(d.secoes[2].nota).toContain("R$ 5,90");
  });

  it("extrato: assistente sem nome de cliente e sem %; estorno marcado; total soma tudo", () => {
    const base = { valor_item_centavos: 20000, percentual: 5000, taxa_centavos: 398, parte_assistente_centavos: null, pago_em: null };
    const d = documentoExtrato(
      [
        { ...base, criado_em: "2026-11-18T13:00:00Z", estorno: false, papel: "assistente", item_nome: "Coloração", cliente_nome: null, valor_centavos: 1960 },
        { ...base, criado_em: "2026-11-18T15:00:00Z", estorno: true, papel: "assistente", item_nome: "Coloração", cliente_nome: null, valor_centavos: -1960 },
      ],
      "Carla",
      "Salão Teste",
      "2026-11-01",
      "2026-11-30",
      "rodapé",
    );
    const s = d.secoes[0];
    expect(s.colunas).not.toContain("Cliente");
    expect(textoDaCelula(s.linhas[0][3])).toBe(""); // % não se aplica ao assistente
    expect(textoDaCelula(s.linhas[1][1])).toContain("(estorno)");
    expect(textoDaCelula(s.total![s.total!.length - 1])).toBe("R$ 0,00");
    expect(s.total!.length).toBe(s.colunas.length);
  });

  it("despesas: canceladas aparecem marcadas mas ficam fora do total", () => {
    const d = documentoDespesas(
      [
        { descricao: "Luz", categoria: "Luz", valor_centavos: 18050, vencimento: "2026-11-10", pago_em: "2026-11-10", forma: "dinheiro", cancelado_em: null, motivo_cancelamento: null },
        { descricao: "Dobro", categoria: "Luz", valor_centavos: 18050, vencimento: "2026-11-10", pago_em: null, forma: null, cancelado_em: "2026-11-11T10:00:00Z", motivo_cancelamento: "Lancei em dobro" },
      ],
      "Salão Teste",
      "novembro de 2026",
      "2026-11-18",
      "rodapé",
    );
    const s = d.secoes[0];
    expect(textoDaCelula(s.total![6])).toBe("R$ 180,50");
    expect(textoDaCelula(s.linhas[0][5])).toBe("Dinheiro");
    expect(textoDaCelula(s.linhas[1][0])).toContain("cancelada: Lancei em dobro");
  });

  it("caixa fechado: diferença e conferências", () => {
    const d = documentoCaixa(
      {
        data: "2026-11-17",
        troco_inicial: 5000,
        entradas_por_forma: { dinheiro: 28000 },
        dinheiro_recebido: 28000,
        reforcos: 0,
        retiradas: 10000,
        comissoes_dinheiro: 0,
        vales_dinheiro: 0,
        despesas_dinheiro: 0,
        esperado_dinheiro: 23000,
        caixa: { situacao: "fechado", fechado_em: "2026-11-17T23:00:00Z", contado_centavos: 22900, esperado_centavos: 23000, motivo_diferenca: "Troco a mais", conferido_pix: false, conferido_cartao: false },
        movimentos: [{ tipo: "retirada", valor_centavos: 10000, motivo: "Banco", criado_em: "2026-11-17T22:00:00Z", cancelado_em: null }],
      },
      "Salão Teste",
      "rodapé",
    );
    expect(d.titulo).toBe("Caixa de 17/11/2026");
    expect(d.secoes.map((s) => s.titulo)).toEqual(["Entradas das comandas", "Dinheiro na gaveta", "Retiradas e reforços", "Fechamento"]);
    expect(textoDaCelula(d.secoes[3].total![1])).toBe("-R$ 1,00");
  });
});

describe("Arquivos", () => {
  const doc = documentoRelatorio(relatorio, "Salão Teste", "2026-11-01", "2026-11-30", "rodapé");

  it("gera um PDF de verdade", () => {
    const pdf = gerarPdf(doc);
    expect(pdf.subarray(0, 5).toString("latin1")).toBe("%PDF-");
    expect(pdf.length).toBeGreaterThan(2000);
  });

  it("gera um Excel (.xlsx) de verdade", async () => {
    const xlsx = await gerarXlsx(doc);
    expect(xlsx.subarray(0, 2).toString("latin1")).toBe("PK"); // .xlsx é um arquivo compactado
    expect(xlsx.length).toBeGreaterThan(2000);
  });
});
