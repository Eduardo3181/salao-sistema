/** Apoio das despesas (módulo puro). */

export type FormaDespesa = "dinheiro" | "pix" | "transferencia" | "boleto" | "cartao" | "debito_automatico" | "outro";

export const NOME_FORMA_DESPESA: Record<FormaDespesa, string> = {
  dinheiro: "Dinheiro (sai do caixa)",
  pix: "Pix",
  transferencia: "Transferência",
  boleto: "Boleto",
  cartao: "Cartão",
  debito_automatico: "Débito automático",
  outro: "Outro",
};

export type SituacaoDespesa = "cancelada" | "paga" | "atrasada" | "vence_hoje" | "a_pagar";

export const NOME_SITUACAO_DESPESA: Record<SituacaoDespesa, string> = {
  cancelada: "Cancelada",
  paga: "Paga",
  atrasada: "Atrasada",
  vence_hoje: "Vence hoje",
  a_pagar: "A pagar",
};

/** Situação de uma conta no dia de hoje (datas "AAAA-MM-DD", horário de Brasília). */
export function situacaoDespesa(d: { vencimento: string; pago_em: string | null; cancelado_em: string | null }, hoje: string): SituacaoDespesa {
  if (d.cancelado_em) return "cancelada";
  if (d.pago_em) return "paga";
  if (d.vencimento < hoje) return "atrasada";
  if (d.vencimento === hoje) return "vence_hoje";
  return "a_pagar";
}

/** "2026-11" -> { de: "2026-11-01", ate: "2026-11-30" } ; mês inválido devolve null. */
export function limitesDoMes(mes: string): { de: string; ate: string } | null {
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(mes)) return null;
  const [a, m] = mes.split("-").map(Number);
  const ultimo = new Date(Date.UTC(a, m, 0)).getUTCDate();
  return { de: `${mes}-01`, ate: `${mes}-${String(ultimo).padStart(2, "0")}` };
}

/** Mês anterior ou seguinte: ("2026-01", -1) -> "2025-12". */
export function somarMeses(mes: string, n: number): string {
  const [a, m] = mes.split("-").map(Number);
  const d = new Date(Date.UTC(a, m - 1 + n, 1));
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
}

const MESES = ["janeiro", "fevereiro", "março", "abril", "maio", "junho", "julho", "agosto", "setembro", "outubro", "novembro", "dezembro"];
/** "2026-11" -> "novembro de 2026" */
export const nomeDoMes = (mes: string) => `${MESES[Number(mes.slice(5, 7)) - 1]} de ${mes.slice(0, 4)}`;
