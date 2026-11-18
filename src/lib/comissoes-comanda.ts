/**
 * Monta as comissões de uma comanda fechada (módulo puro: sem tela e sem banco).
 * Usa o motor (src/lib/comissoes.ts) item por item e devolve o que deve ser gravado.
 */
import { calcularComissaoItem, ratearTaxaEntreItens, resolverPercentual, type ResultadoItem } from "@/lib/comissoes";
import { montarRegraAssistente, montarRegras, type LinhaConfigComissao, type LinhaRegraComissao } from "@/lib/comissoes-config";

export type ItemParaCalculo = {
  id: string;
  tipo: "servico" | "produto";
  servicoId: string | null;
  profissionalId: string | null; // no produto: quem vendeu (pode faltar)
  totalCentavos: number; // valor cobrado no item (já com o desconto do item)
  assistentes: string[];
};

export type EntradaComanda = {
  itens: ItemParaCalculo[];
  taxaTotalCentavos: number; // soma das taxas de cartão dos pagamentos ativos
  config: LinhaConfigComissao;
  regras: LinhaRegraComissao[];
};

export type Snapshot = {
  v: 1;
  percentual: number;
  origem: "profissional_servico" | "servico" | "profissional" | "padrao_salao" | "produto" | "sem_comissao";
  descontarTaxa: boolean;
  valorCentavos: number;
  taxaCentavos: number;
  regraAssistente: ReturnType<typeof montarRegraAssistente>;
  resultado: ResultadoItem;
};

export type Lancamento = { item_id: string; profissional_id: string; papel: "profissional" | "assistente"; valor_centavos: number };

export type CalculoComanda = {
  itens: { item_id: string; snapshot: Snapshot }[];
  assistentes: { item_id: string; assistente_id: string; valor_centavos: number }[];
  lancamentos: Lancamento[];
};

export function calcularComanda(e: EntradaComanda): CalculoComanda {
  const regras = montarRegras(e.config, e.regras);
  const regraAssistente = montarRegraAssistente(e.config);
  const taxas = ratearTaxaEntreItens(
    e.taxaTotalCentavos,
    e.itens.map((i) => i.totalCentavos),
  );

  const saida: CalculoComanda = { itens: [], assistentes: [], lancamentos: [] };
  e.itens.forEach((item, n) => {
    let percentual = 0;
    let origem: Snapshot["origem"] = "sem_comissao";
    let assistentes: string[] = [];
    if (item.tipo === "servico" && item.profissionalId && item.servicoId) {
      const r = resolverPercentual(regras, item.profissionalId, item.servicoId);
      percentual = r.percentual;
      origem = r.origem;
      assistentes = item.assistentes;
    } else if (item.tipo === "produto" && item.profissionalId && e.config.comissao_produtos) {
      percentual = e.config.percentual_produtos;
      origem = "produto";
    }

    const resultado = calcularComissaoItem({
      valorCentavos: item.totalCentavos,
      taxaCentavos: taxas[n],
      percentual,
      descontarTaxa: e.config.descontar_taxa_cartao,
      assistentes,
      regraAssistente: assistentes.length ? regraAssistente : null,
    });

    saida.itens.push({
      item_id: item.id,
      snapshot: {
        v: 1,
        percentual,
        origem,
        descontarTaxa: e.config.descontar_taxa_cartao,
        valorCentavos: item.totalCentavos,
        taxaCentavos: taxas[n],
        regraAssistente: assistentes.length ? regraAssistente : null,
        resultado,
      },
    });
    if (item.profissionalId && resultado.comissaoProfissionalCentavos > 0)
      saida.lancamentos.push({
        item_id: item.id,
        profissional_id: item.profissionalId,
        papel: "profissional",
        valor_centavos: resultado.comissaoProfissionalCentavos,
      });
    for (const a of resultado.assistentes) {
      saida.assistentes.push({ item_id: item.id, assistente_id: a.id, valor_centavos: a.valorCentavos });
      if (a.valorCentavos > 0)
        saida.lancamentos.push({ item_id: item.id, profissional_id: a.id, papel: "assistente", valor_centavos: a.valorCentavos });
    }
  });
  return saida;
}
