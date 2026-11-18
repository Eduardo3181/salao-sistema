import "server-only"; // usa a chave secreta: nunca vai para o navegador

import { ErroComissao } from "@/lib/comissoes";
import { calcularComanda } from "@/lib/comissoes-comanda";
import { CONFIG_VAZIA, type LinhaConfigComissao, type LinhaRegraComissao } from "@/lib/comissoes-config";
import { criarClienteAdmin } from "@/lib/supabase/admin";

export type ResultadoCalculo = { ok: true } | { ok: false; erro: string };

/**
 * Calcula e grava as comissões de uma comanda FECHADA.
 * Só chamar depois de conferir, com o login da pessoa, que ela vê a comanda e que ela é do salão `salaoId`.
 * Se a comanda já estiver calculada, não faz nada. Nunca lança erro: devolve a mensagem.
 */
export async function calcularComissoesDaComanda(salaoId: string, comandaId: string): Promise<ResultadoCalculo> {
  const admin = criarClienteAdmin();
  try {
    const { data: comanda, error: e0 } = await admin
      .from("comandas")
      .select("id, situacao, fechada_em, comissao_calculada_em")
      .eq("id", comandaId)
      .eq("salao_id", salaoId)
      .maybeSingle();
    if (e0 || !comanda) return { ok: false, erro: "Comanda não encontrada." };
    if (comanda.situacao !== "fechada") return { ok: false, erro: "A comissão só é calculada com a comanda fechada." };
    if (comanda.comissao_calculada_em) return { ok: true };

    const [itensR, assistR, pagR, configR, regrasR] = await Promise.all([
      admin
        .from("comanda_itens")
        .select("id, tipo, servico_id, profissional_id, total_centavos")
        .eq("salao_id", salaoId)
        .eq("comanda_id", comandaId)
        .is("removido_em", null)
        .order("criado_em"),
      admin.from("comanda_item_assistentes").select("item_id, assistente_id, comanda_itens!inner(comanda_id)").eq("salao_id", salaoId).eq("comanda_itens.comanda_id", comandaId),
      admin.from("pagamentos").select("taxa_centavos").eq("salao_id", salaoId).eq("comanda_id", comandaId).is("removido_em", null),
      admin.from("configuracao_comissao").select("*").eq("salao_id", salaoId).maybeSingle(),
      admin.from("regras_comissao").select("profissional_id, servico_id, percentual").eq("salao_id", salaoId),
    ]);
    const erroLeitura = itensR.error ?? assistR.error ?? pagR.error ?? configR.error ?? regrasR.error;
    if (erroLeitura) {
      console.error("calcularComissoes (leitura) falhou:", erroLeitura.code);
      return { ok: false, erro: "Não foi possível ler a comanda para calcular a comissão." };
    }

    const assistentesPorItem = new Map<string, string[]>();
    for (const a of (assistR.data ?? []) as { item_id: string; assistente_id: string }[])
      assistentesPorItem.set(a.item_id, [...(assistentesPorItem.get(a.item_id) ?? []), a.assistente_id]);

    const calculo = calcularComanda({
      itens: (itensR.data ?? []).map((i) => ({
        id: i.id,
        tipo: i.tipo,
        servicoId: i.servico_id,
        profissionalId: i.profissional_id,
        totalCentavos: Number(i.total_centavos),
        assistentes: (assistentesPorItem.get(i.id) ?? []).sort(),
      })),
      taxaTotalCentavos: (pagR.data ?? []).reduce((s, p) => s + Number(p.taxa_centavos), 0),
      config: (configR.data as LinhaConfigComissao | null) ?? CONFIG_VAZIA,
      regras: (regrasR.data ?? []) as LinhaRegraComissao[],
    });

    const { data: gravou, error: e1 } = await admin.rpc("gravar_comissoes", {
      p_comanda_id: comandaId,
      p_fechada_em: comanda.fechada_em,
      p_itens: calculo.itens,
      p_assistentes: calculo.assistentes,
      p_lancamentos: calculo.lancamentos,
    });
    if (e1) {
      console.error("calcularComissoes (gravar) falhou:", e1.code);
      return { ok: false, erro: "Não foi possível gravar a comissão. Tente de novo." };
    }
    if (!gravou) return { ok: false, erro: "A comanda mudou durante o cálculo. Tente de novo." };
    return { ok: true };
  } catch (e) {
    if (e instanceof ErroComissao) return { ok: false, erro: e.message };
    console.error("calcularComissoes falhou:", (e as Error).name);
    return { ok: false, erro: "Não foi possível calcular a comissão. Tente de novo." };
  }
}
