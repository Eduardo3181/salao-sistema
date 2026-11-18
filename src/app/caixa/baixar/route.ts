import { dataValida, hojeBrasilia } from "@/lib/agenda";
import { documentoCaixa, rodapeGerado, type DadosCaixa } from "@/lib/exportar/modelos";
import { erroTexto, formatoPedido, responderArquivo } from "@/lib/exportar/responder";
import { exigirSalao } from "@/lib/sessao";

/** Baixar o caixa de um dia (dono e recepção; o banco confere quem vê qual dia). */
export async function GET(request: Request) {
  const url = new URL(request.url);
  const formato = formatoPedido(url);
  if (!formato) return erroTexto("Formato inválido.", 400);
  const { supabase, salao } = await exigirSalao();
  if (salao.perfil !== "dono" && salao.perfil !== "recepcao") return erroTexto("Sem acesso ao caixa.", 403);
  const hoje = hojeBrasilia();
  const d = url.searchParams.get("d");
  const data = d && dataValida(d) && d <= hoje ? d : hoje;
  const { data: r, error } = await supabase.rpc("resumo_caixa", { p_salao_id: salao.salaoId, p_data: data });
  if (error || !r) {
    console.error("baixar caixa falhou:", error?.code);
    return erroTexto(error?.code === "42501" ? error.message : "Não foi possível gerar o arquivo. Tente de novo.", error?.code === "42501" ? 403 : 500);
  }
  return responderArquivo(documentoCaixa(r as DadosCaixa, salao.nome, rodapeGerado()), formato, `caixa-${data}`);
}
