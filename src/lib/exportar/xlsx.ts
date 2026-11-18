import "server-only";

import writeExcelFile from "write-excel-file/node";
import type { Celula, Documento } from "./documento";

// Formato de dinheiro no Excel. O valor vai como número em reais (centavos ÷ 100) só para a planilha
// poder somar; as contas do sistema continuam em centavos inteiros.
const FORMATO_REAIS = '"R$" #,##0.00;-"R$" #,##0.00';

type CelulaXlsx = { value: string | number; type?: typeof String | typeof Number; format?: string; fontWeight?: "bold"; fontSize?: number } | null;

function celula(c: Celula, negrito = false): CelulaXlsx {
  const peso = negrito ? ({ fontWeight: "bold" } as const) : {};
  if ("texto" in c) return { value: c.texto, type: String, ...peso };
  if ("centavos" in c) return { value: c.centavos / 100, type: Number, format: FORMATO_REAIS, ...peso };
  return { value: c.numero, type: Number, ...peso };
}

const texto = (v: string, extra: Partial<NonNullable<CelulaXlsx>> = {}): CelulaXlsx => ({ value: v, type: String, ...extra });

/** Gera o .xlsx de um documento: tudo numa aba, uma seção embaixo da outra. */
export async function gerarXlsx(doc: Documento): Promise<Buffer> {
  const linhas: CelulaXlsx[][] = [
    [texto(doc.titulo, { fontWeight: "bold", fontSize: 14 })],
    [texto(`${doc.salao} · ${doc.periodo}`)],
  ];
  for (const s of doc.secoes) {
    linhas.push([null]);
    linhas.push([texto(s.titulo, { fontWeight: "bold", fontSize: 12 })]);
    if (s.nota) linhas.push([texto(s.nota)]);
    linhas.push(s.colunas.map((c) => texto(c, { fontWeight: "bold" })));
    if (s.linhas.length === 0) linhas.push([texto("Nada no período.")]);
    for (const l of s.linhas) linhas.push(l.map((c) => celula(c)));
    if (s.total) linhas.push(s.total.map((c) => celula(c, true)));
  }
  if (doc.rodape) linhas.push([null], [texto(doc.rodape)]);

  const largura = Math.max(...doc.secoes.map((s) => s.colunas.length), 1);
  const columns = Array.from({ length: largura }, (_, i) => ({ width: i === 0 ? 34 : 18 }));
  const resultado = await writeExcelFile(linhas as never, { columns, sheet: "Relatório" }).toBuffer();
  return resultado as Buffer;
}
