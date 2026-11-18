import "server-only";

import { nomeDeArquivo, type Documento } from "./documento";
import { gerarPdf } from "./pdf";
import { gerarXlsx } from "./xlsx";

/** Lê o formato pedido no endereço (?formato=pdf ou ?formato=xlsx). */
export function formatoPedido(url: URL): "pdf" | "xlsx" | null {
  const f = url.searchParams.get("formato");
  return f === "pdf" || f === "xlsx" ? f : null;
}

/** Devolve o arquivo para o navegador baixar. Nada fica guardado no servidor. */
export async function responderArquivo(doc: Documento, formato: "pdf" | "xlsx", nomeBase: string): Promise<Response> {
  const corpo = formato === "pdf" ? gerarPdf(doc) : await gerarXlsx(doc);
  return new Response(new Uint8Array(corpo), {
    headers: {
      "Content-Type": formato === "pdf" ? "application/pdf" : "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="${nomeDeArquivo(nomeBase, formato)}"`,
      "Cache-Control": "no-store",
    },
  });
}

export const erroTexto = (mensagem: string, status: number) =>
  new Response(mensagem, { status, headers: { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "no-store" } });
