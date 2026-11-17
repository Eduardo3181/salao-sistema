"use server";

import { revalidatePath } from "next/cache";
import { percentualParaCentesimos } from "@/lib/dinheiro";
import { exigirSalao } from "@/lib/sessao";
import { CHAVES_TAXA, type ChaveTaxa } from "@/lib/taxas";

export type EstadoTaxas = { erro?: string; ok?: string } | undefined;

/** Salva as taxas do cartão. Vazio = sem taxa (apaga a linha). Só grava o que mudou (fica no histórico). */
export async function salvarTaxas(_: EstadoTaxas, form: FormData): Promise<EstadoTaxas> {
  const ctx = await exigirSalao();
  if (!ctx.ehDono) return { erro: "Só o dono altera as taxas." };
  const salaoId = ctx.salao.salaoId;

  const novas = new Map<string, number | null>();
  for (const c of CHAVES_TAXA) {
    const texto = String(form.get(c.campo) ?? "").trim();
    if (!texto) {
      novas.set(c.campo, null);
      continue;
    }
    const v = percentualParaCentesimos(texto);
    if (v === null) return { erro: `${c.rotulo}: taxa inválida. Use por exemplo 2,99 (de 0 a 100).` };
    novas.set(c.campo, v);
  }

  const { data: atuais, error: e1 } = await ctx.supabase
    .from("taxas_cartao")
    .select("forma, parcelas, taxa_centesimos")
    .eq("salao_id", salaoId);
  if (e1) {
    console.error("salvarTaxas (ler) falhou:", e1.code);
    return { erro: "Não foi possível salvar. Tente de novo." };
  }
  const atual = (c: ChaveTaxa) =>
    (atuais ?? []).find((t) => t.forma === c.forma && t.parcelas === c.parcelas)?.taxa_centesimos as number | undefined;

  for (const c of CHAVES_TAXA) {
    const nova = novas.get(c.campo) ?? null;
    const velha = atual(c);
    let error = null;
    if (nova === null && velha !== undefined) {
      ({ error } = await ctx.supabase.from("taxas_cartao").delete().eq("salao_id", salaoId).eq("forma", c.forma).eq("parcelas", c.parcelas));
    } else if (nova !== null && velha === undefined) {
      ({ error } = await ctx.supabase.from("taxas_cartao").insert({ salao_id: salaoId, forma: c.forma, parcelas: c.parcelas, taxa_centesimos: nova }));
    } else if (nova !== null && velha !== nova) {
      ({ error } = await ctx.supabase
        .from("taxas_cartao")
        .update({ taxa_centesimos: nova })
        .eq("salao_id", salaoId)
        .eq("forma", c.forma)
        .eq("parcelas", c.parcelas));
    }
    if (error) {
      console.error("salvarTaxas falhou:", error.code);
      return { erro: "Não foi possível salvar todas as taxas. Confira e tente de novo." };
    }
  }
  revalidatePath("/configuracoes");
  return { ok: "Taxas salvas. Valem para os próximos pagamentos; os já recebidos guardam a taxa do dia." };
}
