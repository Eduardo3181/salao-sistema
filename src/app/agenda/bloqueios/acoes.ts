"use server";

import { revalidatePath } from "next/cache";
import { periodoDoBloqueio } from "@/lib/agenda";
import { exigirSalao } from "@/lib/sessao";

export type NovoBloqueio = {
  profissionalId: string | null; // null = salão inteiro (feriado)
  diaInteiro: boolean;
  de: string;
  ate: string;
  horaDe: string;
  horaAte: string;
  motivo: string;
};
type Resposta<T> = { ok: true; dados: T } | { ok: false; erro: string };

/**
 * Antes de bloquear: já existem atendimentos marcados nesse período?
 * Não impede o bloqueio; só avisa para a pessoa remarcar ou cancelar depois.
 */
export async function avisosDoBloqueio(b: NovoBloqueio): Promise<Resposta<string[]>> {
  const periodo = periodoDoBloqueio(b);
  if (!periodo.ok) return periodo;
  const { supabase, salao } = await exigirSalao();

  const { data: colunas } = await supabase.rpc("minhas_agendas", { p_salao_id: salao.salaoId });
  const alvos = ((colunas ?? []) as { id: string; nome: string }[]).filter((c) => b.profissionalId === null || c.id === b.profissionalId);

  const avisos: string[] = [];
  for (const p of alvos) {
    const { data } = await supabase.rpc("conflitos_agenda", {
      p_salao_id: salao.salaoId,
      p_profissional_id: p.id,
      p_inicio: periodo.inicio,
      p_fim: periodo.fim,
    });
    const n = (data as { atendimentos: number } | null)?.atendimentos ?? 0;
    if (n > 0) avisos.push(`${p.nome} já tem ${n} ${n === 1 ? "atendimento marcado" : "atendimentos marcados"} nesse período.`);
  }
  return { ok: true, dados: avisos };
}

export async function criarBloqueio(b: NovoBloqueio): Promise<Resposta<null>> {
  const periodo = periodoDoBloqueio(b);
  if (!periodo.ok) return periodo;
  const motivo = b.motivo.trim().slice(0, 120) || null;
  const { supabase, salao } = await exigirSalao();

  // As regras de quem pode bloquear o quê ficam no banco (RLS).
  const { error } = await supabase.from("bloqueios").insert({
    salao_id: salao.salaoId,
    profissional_id: b.profissionalId,
    inicio: periodo.inicio,
    fim: periodo.fim,
    motivo,
  });
  if (error) {
    if (error.code === "42501")
      return {
        ok: false,
        erro: b.profissionalId === null ? "Só o dono pode bloquear o salão inteiro." : "Você não tem permissão para bloquear essa agenda.",
      };
    if (error.code === "23514") return { ok: false, erro: "Confira o período: ele precisa terminar depois de começar e ter no máximo 62 dias." };
    console.error("criarBloqueio falhou:", error.code);
    return { ok: false, erro: "Não foi possível salvar o bloqueio. Tente de novo." };
  }
  revalidatePath("/agenda", "layout");
  return { ok: true, dados: null };
}

export async function apagarBloqueio(id: string): Promise<Resposta<null>> {
  const { supabase } = await exigirSalao();
  const { data, error } = await supabase.from("bloqueios").delete().eq("id", id).select("id");
  if (error) {
    console.error("apagarBloqueio falhou:", error.code);
    return { ok: false, erro: "Não foi possível apagar. Tente de novo." };
  }
  if (!data?.length) return { ok: false, erro: "Você não tem permissão para apagar este bloqueio." };
  revalidatePath("/agenda", "layout");
  return { ok: true, dados: null };
}
