import type { SupabaseClient } from "@supabase/supabase-js";

export type Perfil = "dono" | "recepcao" | "profissional";

export const NOME_PERFIL: Record<Perfil, string> = {
  dono: "Dono(a)",
  recepcao: "Recepção",
  profissional: "Profissional",
};

export type MeuSalao = { salaoId: string; nome: string; perfil: Perfil };

/**
 * Salão do usuário logado. A RLS garante que só vêm salões dele.
 * Por enquanto usa o primeiro salão (troca de salão fica para depois).
 */
export async function buscarMeuSalao(supabase: SupabaseClient, userId: string): Promise<MeuSalao | null> {
  const { data } = await supabase
    .from("usuarios_salao")
    .select("salao_id, perfil, criado_em, saloes(nome)")
    .eq("user_id", userId)
    .eq("ativo", true)
    .order("criado_em", { ascending: true })
    .limit(1)
    .maybeSingle();

  if (!data) return null;
  const salao = data.saloes as unknown as { nome: string } | null;
  return { salaoId: data.salao_id, nome: salao?.nome ?? "", perfil: data.perfil as Perfil };
}

export type RegistroAuditoria = {
  id: number;
  user_id: string | null;
  acao: string;
  entidade: string;
  antes: Record<string, unknown> | null;
  depois: Record<string, unknown> | null;
  em: string;
};

/** Frase em português para um registro da auditoria. */
export function descreverAuditoria(r: RegistroAuditoria): string {
  if (r.entidade === "saloes" && r.acao === "insert") return `Salão criado: "${r.depois?.nome}"`;
  if (r.entidade === "saloes" && r.acao === "update") {
    if (r.antes?.nome !== r.depois?.nome) return `Nome do salão alterado de "${r.antes?.nome}" para "${r.depois?.nome}"`;
    return "Dados do salão alterados";
  }
  if (r.entidade === "usuarios_salao") {
    const perfil = NOME_PERFIL[(r.depois?.perfil ?? r.antes?.perfil) as Perfil] ?? "";
    if (r.acao === "insert") return `Pessoa adicionada à equipe (${perfil})`;
    if (r.acao === "delete") return `Pessoa removida da equipe (${perfil})`;
    return `Acesso de pessoa da equipe alterado (${perfil})`;
  }
  return `${r.acao} em ${r.entidade}`;
}

/** Data e hora no horário de Brasília. */
export function dataHoraBrasil(iso: string): string {
  return new Intl.DateTimeFormat("pt-BR", {
    timeZone: "America/Sao_Paulo",
    dateStyle: "short",
    timeStyle: "short",
  }).format(new Date(iso));
}
