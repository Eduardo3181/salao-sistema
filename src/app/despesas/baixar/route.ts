import { hojeBrasilia } from "@/lib/agenda";
import { limitesDoMes, nomeDoMes, type FormaDespesa } from "@/lib/despesas";
import { documentoDespesas, rodapeGerado } from "@/lib/exportar/modelos";
import { erroTexto, formatoPedido, responderArquivo } from "@/lib/exportar/responder";
import { exigirSalao } from "@/lib/sessao";

/** Baixar as despesas de um mês (só o dono; a RLS também só mostra ao dono). */
export async function GET(request: Request) {
  const url = new URL(request.url);
  const formato = formatoPedido(url);
  if (!formato) return erroTexto("Formato inválido.", 400);
  const { supabase, salao, ehDono } = await exigirSalao();
  if (!ehDono) return erroTexto("Só o dono baixa despesas.", 403);
  const hoje = hojeBrasilia();
  const pedido = url.searchParams.get("mes") ?? "";
  const mes = limitesDoMes(pedido) ? pedido : hoje.slice(0, 7);
  const lim = limitesDoMes(mes)!;
  const { data, error } = await supabase
    .from("despesas")
    .select("descricao, valor_centavos, vencimento, pago_em, forma, cancelado_em, motivo_cancelamento, categorias_despesa(nome)")
    .eq("salao_id", salao.salaoId)
    .gte("vencimento", lim.de)
    .lte("vencimento", lim.ate)
    .order("vencimento")
    .order("descricao");
  if (error) {
    console.error("baixar despesas falhou:", error.code);
    return erroTexto("Não foi possível gerar o arquivo. Tente de novo.", 500);
  }
  type Linha = {
    descricao: string;
    valor_centavos: number;
    vencimento: string;
    pago_em: string | null;
    forma: FormaDespesa | null;
    cancelado_em: string | null;
    motivo_cancelamento: string | null;
    categorias_despesa: { nome: string } | null;
  };
  const itens = ((data ?? []) as unknown as Linha[]).map((d) => ({ ...d, valor_centavos: Number(d.valor_centavos), categoria: d.categorias_despesa?.nome ?? "" }));
  return responderArquivo(documentoDespesas(itens, salao.nome, nomeDoMes(mes), hoje, rodapeGerado()), formato, `despesas-${mes}`);
}
