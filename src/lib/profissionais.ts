import type { SupabaseClient } from "@supabase/supabase-js";
import type { MembroEquipe } from "@/lib/salao";

export type TipoProfissional = "profissional" | "assistente";

export const NOME_TIPO: Record<TipoProfissional, string> = {
  profissional: "Profissional",
  assistente: "Assistente",
};

export type Profissional = {
  id: string;
  nome: string;
  tipo: TipoProfissional;
  user_id: string | null;
  ativo: boolean;
};

/** Quem atende no salão (a RLS garante que só vêm os do salão da pessoa). */
export async function buscarProfissionais(supabase: SupabaseClient, salaoId: string) {
  const { data } = await supabase
    .from("profissionais")
    .select("id, nome, tipo, user_id, ativo")
    .eq("salao_id", salaoId)
    .order("nome");
  return (data ?? []) as Profissional[];
}

/** Opções de vínculo com a equipe: "Ninguém", "Eu" e quem tem acesso e ainda não está ligado. */
export function opcoesDeVinculo(
  equipe: MembroEquipe[],
  profissionais: Profissional[],
  meuUserId: string,
  editandoId?: string,
) {
  const usados = new Set(profissionais.filter((p) => p.user_id && p.id !== editandoId).map((p) => p.user_id));
  return equipe
    .filter((m) => m.ativo && !usados.has(m.user_id))
    .map((m) => ({
      valor: m.user_id,
      rotulo: m.user_id === meuUserId ? "Eu (sou eu que atendo)" : `${m.nome ?? m.email} (tem acesso ao sistema)`,
    }));
}
