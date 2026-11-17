import type { RegraAssistente, RegrasPercentual } from "@/lib/comissoes";

/** Linha de configuracao_comissao como vem do banco. */
export type LinhaConfigComissao = {
  percentual_padrao: number;
  descontar_taxa_cartao: boolean;
  comissao_produtos: boolean;
  percentual_produtos: number;
  assistente_base: RegraAssistente["base"] | null;
  assistente_valor: number | null;
  assistente_quem_paga: RegraAssistente["quemPaga"] | null;
  assistente_percentual_profissional: number | null;
};

/** Linha de regras_comissao como vem do banco. */
export type LinhaRegraComissao = { profissional_id: string | null; servico_id: string | null; percentual: number };

/** Salão sem configuração salva: tudo zerado (nenhuma comissão até o dono configurar). */
export const CONFIG_VAZIA: LinhaConfigComissao = {
  percentual_padrao: 0,
  descontar_taxa_cartao: false,
  comissao_produtos: false,
  percentual_produtos: 0,
  assistente_base: null,
  assistente_valor: null,
  assistente_quem_paga: null,
  assistente_percentual_profissional: null,
};

/** Monta as regras de porcentagem no formato do motor. */
export function montarRegras(config: LinhaConfigComissao, regras: LinhaRegraComissao[]): RegrasPercentual {
  const r: RegrasPercentual = { padraoSalao: config.percentual_padrao, porProfissional: {}, porServico: {}, porProfissionalServico: {} };
  for (const x of regras) {
    if (x.profissional_id && x.servico_id) r.porProfissionalServico[`${x.profissional_id}:${x.servico_id}`] = x.percentual;
    else if (x.profissional_id) r.porProfissional[x.profissional_id] = x.percentual;
    else if (x.servico_id) r.porServico[x.servico_id] = x.percentual;
  }
  return r;
}

/** Regra das assistentes no formato do motor (nula = salão sem assistentes). */
export function montarRegraAssistente(config: LinhaConfigComissao): RegraAssistente | null {
  if (!config.assistente_base || config.assistente_valor === null || !config.assistente_quem_paga) return null;
  return {
    base: config.assistente_base,
    valor: Number(config.assistente_valor),
    quemPaga: config.assistente_quem_paga,
    percentualDaProfissional: config.assistente_percentual_profissional ?? undefined,
  };
}

/** Modelos prontos de docs/04 (o dono escolhe um e pode ajustar). */
export const MODELOS_ASSISTENTE: { id: string; nome: string; descricao: string; regra: RegraAssistente | null }[] = [
  { id: "sem", nome: "Sem assistentes", descricao: "O salão não paga comissão para assistentes.", regra: null },
  {
    id: "da_profissional",
    nome: "Fixo mensal + comissão que sai da profissional",
    descricao: "A assistente recebe uma % da comissão da profissional; o salão não tem custo extra por serviço.",
    regra: { base: "percentual_comissao", valor: 2000, quemPaga: "profissional" },
  },
  {
    id: "salao_paga",
    nome: "Salão paga a assistente por fora",
    descricao: "A assistente recebe uma % do valor do serviço, paga pelo salão; a profissional não perde nada.",
    regra: { base: "percentual_servico", valor: 1000, quemPaga: "salao" },
  },
  {
    id: "valor_fixo",
    nome: "Valor fixo por serviço",
    descricao: "A assistente recebe um valor fixo por serviço em que ajudou, descontado da profissional.",
    regra: { base: "valor_fixo", valor: 1500, quemPaga: "profissional" },
  },
];
