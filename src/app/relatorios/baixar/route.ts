import { hojeBrasilia } from "@/lib/agenda";
import { documentoRelatorio, rodapeGerado, type DadosRelatorio } from "@/lib/exportar/modelos";
import { erroTexto, formatoPedido, responderArquivo } from "@/lib/exportar/responder";
import { lerPeriodo } from "@/lib/periodos";
import { exigirSalao } from "@/lib/sessao";

/** Baixar o relatório do período (só o dono; o banco confere de novo). */
export async function GET(request: Request) {
  const url = new URL(request.url);
  const formato = formatoPedido(url);
  if (!formato) return erroTexto("Formato inválido.", 400);
  const { supabase, salao, ehDono } = await exigirSalao();
  if (!ehDono) return erroTexto("Só o dono baixa relatórios.", 403);
  const { periodo } = lerPeriodo(url.searchParams.get("de") ?? undefined, url.searchParams.get("ate") ?? undefined, hojeBrasilia());
  const { data, error } = await supabase.rpc("relatorio_periodo", { p_salao_id: salao.salaoId, p_de: periodo.de, p_ate: periodo.ate });
  if (error || !data) {
    console.error("baixar relatório falhou:", error?.code);
    return erroTexto("Não foi possível gerar o arquivo. Tente de novo.", 500);
  }
  const doc = documentoRelatorio(data as DadosRelatorio, salao.nome, periodo.de, periodo.ate, rodapeGerado());
  return responderArquivo(doc, formato, `relatorio-${periodo.de}-a-${periodo.ate}`);
}
