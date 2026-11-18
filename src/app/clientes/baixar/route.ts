import { hojeBrasilia } from "@/lib/agenda";
import { documentoListaClientes, rodapeGerado, type LinhaListaClientes } from "@/lib/exportar/modelos";
import { erroTexto, formatoPedido, responderArquivo } from "@/lib/exportar/responder";
import { exigirSalao } from "@/lib/sessao";

/** Baixar a lista completa de clientes do salão (cópia ou levar para outro sistema). Só o dono; fica no histórico. */
export async function GET(request: Request) {
  const url = new URL(request.url);
  const formato = formatoPedido(url);
  if (!formato) return erroTexto("Formato inválido.", 400);
  const { supabase, salao, ehDono } = await exigirSalao();
  if (!ehDono) return erroTexto("Só o dono baixa a lista de clientes.", 403);
  const { data, error } = await supabase.rpc("exportar_clientes", { p_salao_id: salao.salaoId });
  if (error || !data) {
    console.error("baixar lista de clientes falhou:", error?.code);
    return erroTexto("Não foi possível gerar o arquivo. Tente de novo.", 500);
  }
  const hoje = hojeBrasilia();
  const doc = documentoListaClientes(data as LinhaListaClientes[], salao.nome, hoje, rodapeGerado());
  return responderArquivo(doc, formato, `clientes-${hoje}`);
}
