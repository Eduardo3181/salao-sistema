import { hojeBrasilia } from "@/lib/agenda";
import { documentoExtrato, rodapeGerado, type LinhaExtrato } from "@/lib/exportar/modelos";
import { erroTexto, formatoPedido, responderArquivo } from "@/lib/exportar/responder";
import { lerPeriodo, limitesDoPeriodo } from "@/lib/periodos";
import { buscarProfissionais } from "@/lib/profissionais";
import { exigirSalao } from "@/lib/sessao";

/**
 * Baixar o extrato de comissões. O dono escolhe a pessoa (?p=); os demais só o próprio.
 * O banco confere de novo (extrato_comissoes recusa extrato de outra pessoa).
 */
export async function GET(request: Request) {
  const url = new URL(request.url);
  const formato = formatoPedido(url);
  if (!formato) return erroTexto("Formato inválido.", 400);
  const { supabase, userId, salao, ehDono } = await exigirSalao();
  const { periodo } = lerPeriodo(url.searchParams.get("de") ?? undefined, url.searchParams.get("ate") ?? undefined, hojeBrasilia());
  const equipe = await buscarProfissionais(supabase, salao.salaoId);
  const meu = equipe.find((p) => p.user_id === userId) ?? null;
  const pessoa = ehDono ? (equipe.find((p) => p.id === url.searchParams.get("p")) ?? meu ?? equipe[0]) : meu;
  if (!pessoa) return erroTexto("Sem extrato para mostrar.", 404);

  const lim = limitesDoPeriodo(periodo);
  const { data, error } = await supabase.rpc("extrato_comissoes", { p_salao_id: salao.salaoId, p_profissional_id: pessoa.id, p_de: lim.de, p_ate: lim.ate });
  if (error) {
    console.error("baixar extrato falhou:", error.code);
    return erroTexto(error.code === "42501" ? error.message : "Não foi possível gerar o arquivo. Tente de novo.", error.code === "42501" ? 403 : 500);
  }
  const linhas = ((data ?? []) as LinhaExtrato[]).map((l) => ({ ...l, valor_centavos: Number(l.valor_centavos) }));
  return responderArquivo(documentoExtrato(linhas, pessoa.nome, salao.nome, periodo.de, periodo.ate, rodapeGerado()), formato, `comissoes-${pessoa.nome}-${periodo.de}-a-${periodo.ate}`);
}
