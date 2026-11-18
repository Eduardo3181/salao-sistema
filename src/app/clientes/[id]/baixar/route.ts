import { documentoDadosCliente, rodapeGerado, type DadosCliente } from "@/lib/exportar/modelos";
import { erroTexto, formatoPedido, responderArquivo } from "@/lib/exportar/responder";
import { exigirSalao } from "@/lib/sessao";

/** Baixar tudo o que o salão guarda sobre um cliente, para entregar a ele (LGPD). Só o dono; o banco confere de novo e anota no histórico. */
export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const url = new URL(request.url);
  const formato = formatoPedido(url);
  if (!formato) return erroTexto("Formato inválido.", 400);
  const { id } = await params;
  const { supabase, salao, ehDono } = await exigirSalao();
  if (!ehDono) return erroTexto("Só o dono baixa os dados de um cliente.", 403);
  const { data, error } = await supabase.rpc("exportar_dados_cliente", { p_salao_id: salao.salaoId, p_cliente_id: id });
  if (error || !data) {
    if (error?.code === "22023" || error?.code === "42501") return erroTexto(error.message, 400);
    console.error("baixar dados do cliente falhou:", error?.code);
    return erroTexto("Não foi possível gerar o arquivo. Tente de novo.", 500);
  }
  const doc = documentoDadosCliente(data as DadosCliente, salao.nome, rodapeGerado());
  return responderArquivo(doc, formato, `dados-${doc.periodo}`);
}
