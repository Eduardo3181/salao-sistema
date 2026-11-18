"use server";

import { revalidatePath } from "next/cache";
import { exigirSalao } from "@/lib/sessao";

const MEIOS = ["pix", "dinheiro", "transferencia", "outro"] as const;
export type Meio = (typeof MEIOS)[number];

type ResultadoPessoa = { profissionalId: string; ok: true; pagamentoId: string } | { profissionalId: string; ok: false; erro: string };

const erroDoBanco = (code: string | undefined, texto: string, padrao: string) => (code === "42501" || code === "22023" ? texto : padrao);

/**
 * Registra o pagamento das comissões de uma ou mais pessoas (só o dono).
 * O sistema só anota: o dinheiro é pago pelo dono fora do sistema.
 * Cada pessoa é gravada separadamente; o banco confere que o valor é exatamente o saldo a pagar.
 */
export async function registrarPagamentos(
  ate: string,
  pessoas: { profissionalId: string; valorConferido: number }[],
  meio: Meio,
  pagoEm: string,
  observacao: string,
): Promise<{ ok: true; resultados: ResultadoPessoa[] } | { ok: false; erro: string }> {
  const { supabase, salao, ehDono } = await exigirSalao();
  if (!ehDono) return { ok: false, erro: "Só o dono registra pagamento de comissões." };
  if (!MEIOS.includes(meio)) return { ok: false, erro: "Escolha como foi pago." };
  if (!pessoas.length) return { ok: false, erro: "Escolha pelo menos uma pessoa." };

  const resultados: ResultadoPessoa[] = [];
  for (const p of pessoas) {
    const { data, error } = await supabase.rpc("registrar_pagamento_comissao", {
      p_salao_id: salao.salaoId,
      p_profissional_id: p.profissionalId,
      p_ate: ate,
      p_valor_conferido: p.valorConferido,
      p_meio: meio,
      p_pago_em: pagoEm,
      p_observacao: observacao.slice(0, 200) || null,
    });
    if (error) {
      console.error("registrarPagamento falhou:", error.code);
      resultados.push({ profissionalId: p.profissionalId, ok: false, erro: erroDoBanco(error.code, error.message, "Não foi possível registrar. Tente de novo.") });
    } else resultados.push({ profissionalId: p.profissionalId, ok: true, pagamentoId: data as string });
  }
  revalidatePath("/comissoes");
  return { ok: true, resultados };
}

export async function cancelarPagamento(pagamentoId: string, motivo: string): Promise<{ ok: true } | { ok: false; erro: string }> {
  const { supabase, ehDono } = await exigirSalao();
  if (!ehDono) return { ok: false, erro: "Só o dono cancela pagamento de comissões." };
  const { error } = await supabase.rpc("cancelar_pagamento_comissao", { p_pagamento_id: pagamentoId, p_motivo: motivo.slice(0, 200) });
  if (error) {
    console.error("cancelarPagamento falhou:", error.code);
    return { ok: false, erro: erroDoBanco(error.code, error.message, "Não foi possível cancelar. Tente de novo.") };
  }
  revalidatePath("/comissoes");
  revalidatePath(`/comissoes/pagamentos/${pagamentoId}`);
  return { ok: true };
}
