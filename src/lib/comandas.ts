import type { SupabaseClient } from "@supabase/supabase-js";

export type SituacaoComanda = "aberta" | "fechada" | "cancelada";
export type FormaPagamento = "dinheiro" | "pix" | "debito" | "credito_vista" | "credito_parcelado";

export const NOME_SITUACAO_COMANDA: Record<SituacaoComanda, string> = {
  aberta: "Aberta",
  fechada: "Fechada",
  cancelada: "Cancelada",
};

export const NOME_FORMA: Record<FormaPagamento, string> = {
  dinheiro: "Dinheiro",
  pix: "Pix",
  debito: "Débito",
  credito_vista: "Crédito à vista",
  credito_parcelado: "Crédito parcelado",
};

export type ItemComanda = {
  id: string;
  tipo: "servico" | "produto";
  nome: string;
  profissional: string | null;
  quantidade: number;
  precoTabela: number;
  precoUnitario: number;
  desconto: number;
  total: number;
  removido: { em: string; motivo: string } | null;
  assistentes: string[];
};

export type ResumoComanda = {
  total_centavos: number;
  pago_centavos: number | null; // nulo para quem não mexe na comanda inteira
  falta_centavos: number | null;
  pode_mexer: boolean;
  pode_receber: boolean;
  pode_alterar_preco: boolean;
};

type LinhaItem = {
  id: string;
  tipo: "servico" | "produto";
  quantidade: number;
  preco_tabela_centavos: number;
  preco_unitario_centavos: number;
  desconto_centavos: number;
  total_centavos: number;
  removido_em: string | null;
  motivo_remocao: string | null;
  servicos: { nome: string } | null;
  produtos: { nome: string } | null;
  profissionais: { nome: string } | null;
  comanda_item_assistentes: { profissionais: { nome: string } | null }[];
};

/** Itens da comanda que a pessoa pode ver (a RLS esconde os itens de outras profissionais). */
export async function buscarItensComanda(supabase: SupabaseClient, comandaId: string): Promise<ItemComanda[]> {
  const { data } = await supabase
    .from("comanda_itens")
    .select(
      "id, tipo, quantidade, preco_tabela_centavos, preco_unitario_centavos, desconto_centavos, total_centavos, removido_em, motivo_remocao, servicos(nome), produtos(nome), profissionais(nome), comanda_item_assistentes(profissionais(nome))",
    )
    .eq("comanda_id", comandaId)
    .order("criado_em");
  return ((data ?? []) as unknown as LinhaItem[]).map((i) => ({
    id: i.id,
    tipo: i.tipo,
    nome: (i.tipo === "servico" ? i.servicos?.nome : i.produtos?.nome) ?? "Item",
    profissional: i.profissionais?.nome ?? null,
    quantidade: i.quantidade,
    precoTabela: Number(i.preco_tabela_centavos),
    precoUnitario: Number(i.preco_unitario_centavos),
    desconto: Number(i.desconto_centavos),
    total: Number(i.total_centavos),
    removido: i.removido_em ? { em: i.removido_em, motivo: i.motivo_remocao ?? "" } : null,
    assistentes: i.comanda_item_assistentes.map((a) => a.profissionais?.nome ?? "").filter(Boolean),
  }));
}

/** "18/11 às 14:30" no horário de Brasília. */
export function quandoBrasilia(iso: string): string {
  const f = new Intl.DateTimeFormat("pt-BR", {
    timeZone: "America/Sao_Paulo",
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(new Date(iso));
  const v = (t: string) => f.find((p) => p.type === t)?.value ?? "";
  return `${v("day")}/${v("month")} às ${v("hour")}:${v("minute")}`;
}
