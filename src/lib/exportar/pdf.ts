import "server-only";

import { jsPDF } from "jspdf";
import { autoTable } from "jspdf-autotable";
import { textoDaCelula, type Documento } from "./documento";

/** As fontes padrão do PDF não têm alguns símbolos; troca por equivalentes simples. */
const limpar = (s: string) => s.replace(/[−–—]/g, "-").replace(/[‹›]/g, "").replace(/ /g, " ");

/** Gera o PDF de um documento (A4 em pé, tabelas simples, sem cores fortes para imprimir bem). */
export function gerarPdf(doc: Documento): Buffer {
  const pdf = new jsPDF({ unit: "pt", format: "a4" });
  const margem = 40;
  let y = margem;

  pdf.setFont("helvetica", "bold");
  pdf.setFontSize(15);
  pdf.text(limpar(doc.titulo), margem, y);
  y += 18;
  pdf.setFont("helvetica", "normal");
  pdf.setFontSize(10);
  pdf.setTextColor(90);
  pdf.text(limpar(`${doc.salao} · ${doc.periodo}`), margem, y);
  pdf.setTextColor(0);
  y += 14;

  for (const s of doc.secoes) {
    y += 14;
    if (y > 760) {
      pdf.addPage();
      y = margem;
    }
    pdf.setFont("helvetica", "bold");
    pdf.setFontSize(12);
    pdf.text(limpar(s.titulo), margem, y);
    y += 6;
    if (s.nota) {
      pdf.setFont("helvetica", "normal");
      pdf.setFontSize(9);
      pdf.setTextColor(90);
      const linhasNota = pdf.splitTextToSize(limpar(s.nota), 515);
      pdf.text(linhasNota, margem, y + 10);
      pdf.setTextColor(0);
      y += 10 + linhasNota.length * 11;
    }
    const corpo = s.linhas.length ? s.linhas.map((l) => l.map((c) => limpar(textoDaCelula(c)))) : [[limpar("Nada no período.")]];
    autoTable(pdf, {
      startY: y + 4,
      margin: { left: margem, right: margem },
      head: [s.colunas.map(limpar)],
      body: corpo,
      foot: s.total ? [s.total.map((c) => limpar(textoDaCelula(c)))] : undefined,
      theme: "grid",
      styles: { font: "helvetica", fontSize: 9, cellPadding: 4, lineColor: 210, lineWidth: 0.5, textColor: 20 },
      headStyles: { fillColor: [240, 236, 234], textColor: 20, fontStyle: "bold" },
      footStyles: { fillColor: [250, 248, 247], textColor: 20, fontStyle: "bold" },
      // Primeira coluna à esquerda; as demais (números e valores) à direita, inclusive título e total.
      didParseCell: (dado) => {
        dado.cell.styles.halign = dado.column.index === 0 ? "left" : "right";
      },
    });
    y = (pdf as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 6;
  }

  const paginas = pdf.getNumberOfPages();
  for (let p = 1; p <= paginas; p++) {
    pdf.setPage(p);
    pdf.setFontSize(8);
    pdf.setTextColor(120);
    pdf.text(limpar(doc.rodape ?? ""), margem, 815);
    pdf.text(`Página ${p} de ${paginas}`, 555, 815, { align: "right" });
  }
  return Buffer.from(pdf.output("arraybuffer"));
}
