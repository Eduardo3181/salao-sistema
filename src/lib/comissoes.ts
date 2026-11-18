/**
 * Motor de cálculo de comissões (regra 3 do projeto: módulo puro, sem tela e sem banco).
 * Regras e decisões: docs/04-comissoes-e-assistentes.md e docs/02-decisoes.md (17/11/2026).
 *
 * Unidades (sempre inteiros, nunca número quebrado):
 *  - dinheiro em CENTAVOS;
 *  - porcentagens em CENTÉSIMOS de ponto percentual (50% = 5000; 2,99% = 299).
 */

export const CEM_POR_CENTO = 10000;

/** Porcentagem de um valor, arredondada ao centavo mais próximo (meio centavo sobe). */
export function porcentagem(centavos: number, centesimos: number): number {
  if (!Number.isSafeInteger(centavos) || !Number.isSafeInteger(centesimos) || centavos < 0 || centesimos < 0)
    throw new Error("Valores inválidos para porcentagem.");
  return Math.floor((centavos * centesimos + CEM_POR_CENTO / 2) / CEM_POR_CENTO);
}

/**
 * Divide um total entre partes proporcionais aos pesos, sem perder centavo
 * (maior resto: os centavos que sobram vão para as partes com maior fração; empate, a primeira).
 */
export function ratearProporcional(total: number, pesos: number[]): number[] {
  if (!Number.isSafeInteger(total) || total < 0 || pesos.some((p) => !Number.isSafeInteger(p) || p < 0))
    throw new Error("Rateio com valor inválido.");
  const soma = pesos.reduce((a, b) => a + BigInt(b), BigInt(0));
  if (soma === BigInt(0)) return pesos.map(() => 0);
  // Conta exata com inteiros grandes: parte inteira e resto de cada divisão.
  const contas = pesos.map((p, i) => {
    const n = BigInt(total) * BigInt(p);
    return { i, parte: Number(n / soma), resto: n % soma };
  });
  let sobra = total - contas.reduce((a, c) => a + c.parte, 0);
  const ordem = [...contas].sort((a, b) => (b.resto > a.resto ? 1 : b.resto < a.resto ? -1 : a.i - b.i));
  const partes = contas.map((c) => c.parte);
  for (const { i } of ordem) {
    if (sobra <= 0) break;
    partes[i] += 1;
    sobra -= 1;
  }
  return partes;
}

// ---------------------------------------------------------------------------
// Qual porcentagem vale para a profissional (a mais específica vence)
// ---------------------------------------------------------------------------
export type RegrasPercentual = {
  padraoSalao: number; // % padrão do salão
  porProfissional: Record<string, number>; // profissionalId -> %
  porServico: Record<string, number>; // servicoId -> %
  porProfissionalServico: Record<string, number>; // `${profissionalId}:${servicoId}` -> %
};

export type OrigemRegra = "profissional_servico" | "servico" | "profissional" | "padrao_salao";

export function resolverPercentual(
  regras: RegrasPercentual,
  profissionalId: string,
  servicoId: string,
): { percentual: number; origem: OrigemRegra } {
  const ps = regras.porProfissionalServico[`${profissionalId}:${servicoId}`];
  if (ps !== undefined) return { percentual: ps, origem: "profissional_servico" };
  const s = regras.porServico[servicoId];
  if (s !== undefined) return { percentual: s, origem: "servico" };
  const p = regras.porProfissional[profissionalId];
  if (p !== undefined) return { percentual: p, origem: "profissional" };
  return { percentual: regras.padraoSalao, origem: "padrao_salao" };
}

// ---------------------------------------------------------------------------
// Regra da(s) assistente(s)
// ---------------------------------------------------------------------------
export type RegraAssistente = {
  /** Sobre o que a parte das assistentes é calculada. */
  base: "percentual_comissao" | "percentual_servico" | "valor_fixo";
  /** % (centésimos) quando a base é percentual; centavos quando é valor fixo por serviço. */
  valor: number;
  /** Quem arca com a parte das assistentes. */
  quemPaga: "profissional" | "salao" | "dividido";
  /** Só em "dividido": quanto da parte das assistentes sai da profissional (centésimos de %). */
  percentualDaProfissional?: number;
};

// ---------------------------------------------------------------------------
// Cálculo de um item da comanda
// ---------------------------------------------------------------------------
export type EntradaItem = {
  /** Valor cobrado no item (preço × quantidade − desconto do item), em centavos. */
  valorCentavos: number;
  /** Parte da taxa do cartão que cabe a este item (já rateada), em centavos. */
  taxaCentavos: number;
  /** % da profissional já resolvida (centésimos). Zero = sem comissão. */
  percentual: number;
  /** Descontar a taxa do cartão antes de calcular a comissão (configuração do salão). */
  descontarTaxa: boolean;
  /** Assistentes do serviço (vazio = nenhuma). */
  assistentes: string[];
  /** Regra das assistentes (obrigatória se houver assistente). */
  regraAssistente: RegraAssistente | null;
};

export type ResultadoItem = {
  baseCentavos: number; // valor sobre o qual a comissão foi calculada
  taxaDescontadaCentavos: number;
  comissaoBrutaCentavos: number; // comissão da profissional antes de repassar às assistentes
  repasseProfissionalCentavos: number; // quanto sai da profissional para as assistentes
  repasseSalaoCentavos: number; // quanto o salão paga às assistentes por fora
  comissaoProfissionalCentavos: number; // o que a profissional recebe
  assistentes: { id: string; valorCentavos: number }[];
};

export class ErroComissao extends Error {}

export function calcularComissaoItem(e: EntradaItem): ResultadoItem {
  for (const [nome, v] of [
    ["valor", e.valorCentavos],
    ["taxa", e.taxaCentavos],
    ["percentual", e.percentual],
  ] as const) {
    if (!Number.isSafeInteger(v) || v < 0) throw new ErroComissao(`Valor inválido: ${nome}.`);
  }
  if (e.percentual > CEM_POR_CENTO) throw new ErroComissao("Comissão acima de 100%.");
  if (e.taxaCentavos > e.valorCentavos) throw new ErroComissao("Taxa maior que o valor do item.");

  const taxaDescontada = e.descontarTaxa ? e.taxaCentavos : 0;
  const base = e.valorCentavos - taxaDescontada;
  const bruta = porcentagem(base, e.percentual);

  const vazio: ResultadoItem = {
    baseCentavos: base,
    taxaDescontadaCentavos: taxaDescontada,
    comissaoBrutaCentavos: bruta,
    repasseProfissionalCentavos: 0,
    repasseSalaoCentavos: 0,
    comissaoProfissionalCentavos: bruta,
    assistentes: [],
  };
  const ids = [...new Set(e.assistentes)];
  if (ids.length === 0) return vazio;

  const r = e.regraAssistente;
  if (!r) throw new ErroComissao("Há assistente no serviço, mas o salão ainda não configurou como pagar assistentes. Ajuste em Configurações > Comissões.");
  if (!Number.isSafeInteger(r.valor) || r.valor < 0) throw new ErroComissao("Regra de assistente inválida.");
  if (r.base !== "valor_fixo" && r.valor > CEM_POR_CENTO) throw new ErroComissao("Parte da assistente acima de 100%.");

  // Parte total das assistentes (calculada uma vez e dividida igualmente entre elas).
  const pote =
    r.base === "percentual_comissao" ? porcentagem(bruta, r.valor) : r.base === "percentual_servico" ? porcentagem(base, r.valor) : r.valor;

  const cada = Math.floor(pote / ids.length);
  const distribuido = cada * ids.length; // o centavo que sobra volta para quem paga

  let daProfissional: number;
  if (r.quemPaga === "profissional") daProfissional = distribuido;
  else if (r.quemPaga === "salao") daProfissional = 0;
  else {
    const p = r.percentualDaProfissional ?? 0;
    if (!Number.isSafeInteger(p) || p < 0 || p > CEM_POR_CENTO) throw new ErroComissao("Divisão da parte da assistente inválida.");
    daProfissional = porcentagem(distribuido, p);
  }

  // A soma dos repasses não pode passar da comissão da profissional.
  if (daProfissional > bruta)
    throw new ErroComissao("A parte do assistente passa da comissão do profissional. Ajuste a regra do assistente.");

  return {
    ...vazio,
    repasseProfissionalCentavos: daProfissional,
    repasseSalaoCentavos: distribuido - daProfissional,
    comissaoProfissionalCentavos: bruta - daProfissional,
    assistentes: ids.map((id) => ({ id, valorCentavos: cada })),
  };
}

// ---------------------------------------------------------------------------
// Rateio da taxa do cartão entre os itens da comanda (proporcional ao valor de cada um)
// ---------------------------------------------------------------------------
export function ratearTaxaEntreItens(taxaTotalCentavos: number, valoresItens: number[]): number[] {
  const partes = ratearProporcional(taxaTotalCentavos, valoresItens);
  // A taxa de um item nunca passa do valor dele.
  return partes.map((p, i) => Math.min(p, valoresItens[i]));
}
