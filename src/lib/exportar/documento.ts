/**
 * Documento para baixar (módulo puro): título + seções com tabelas.
 * O mesmo documento vira PDF (exportar/pdf.ts) e Excel (exportar/xlsx.ts).
 * Dinheiro sempre em centavos inteiros aqui; só na hora de escrever o arquivo vira R$.
 */

export type Celula = { texto: string } | { centavos: number } | { numero: number };
export type Secao = {
  titulo: string;
  nota?: string;
  colunas: string[];
  linhas: Celula[][];
  total?: Celula[];
};
export type Documento = {
  titulo: string;
  salao: string;
  periodo: string;
  secoes: Secao[];
  rodape?: string;
  /** No Excel: só a tabela, com os nomes das colunas na linha 1 (para a planilha poder ser importada de volta). */
  soTabela?: boolean;
};

export const t = (texto: string | null | undefined): Celula => ({ texto: texto ?? "" });
export const r = (centavos: number | string | null | undefined): Celula => ({ centavos: Number(centavos ?? 0) });
export const n = (numero: number | string | null | undefined): Celula => ({ numero: Number(numero ?? 0) });

/** "R$ 1.234,56" / "-R$ 5,00", só com contas inteiras (sem número quebrado). */
export function reaisTexto(centavos: number): string {
  const neg = centavos < 0;
  const abs = Math.abs(Math.trunc(centavos));
  const inteiro = String(Math.floor(abs / 100)).replace(/\B(?=(\d{3})+(?!\d))/g, ".");
  return `${neg ? "-" : ""}R$ ${inteiro},${String(abs % 100).padStart(2, "0")}`;
}

/** Texto de qualquer célula (para o PDF). */
export function textoDaCelula(c: Celula): string {
  if ("texto" in c) return c.texto;
  if ("centavos" in c) return reaisTexto(c.centavos);
  return String(c.numero);
}

/** Nome de arquivo seguro: sem acento, espaço ou símbolo. */
export function nomeDeArquivo(base: string, extensao: "pdf" | "xlsx"): string {
  const limpo = base
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
  return `${limpo || "relatorio"}.${extensao}`;
}

/** "2026-11-18" -> "18/11/2026" */
export const dataBr = (d: string) => d.split("-").reverse().join("/");
