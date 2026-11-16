import type { SupabaseClient } from "@supabase/supabase-js";

export type Categoria = { id: string; nome: string; ativo: boolean };
export type Servico = {
  id: string;
  categoria_id: string;
  nome: string;
  duracao_min: number;
  preco_centavos: number;
  ativo: boolean;
};

/** Categorias e serviços do salão (a RLS garante que só vêm os do salão da pessoa). */
export async function buscarCatalogo(supabase: SupabaseClient, salaoId: string) {
  const [cat, serv] = await Promise.all([
    supabase.from("categorias_servico").select("id, nome, ativo").eq("salao_id", salaoId).order("nome"),
    supabase
      .from("servicos")
      .select("id, categoria_id, nome, duracao_min, preco_centavos, ativo")
      .eq("salao_id", salaoId)
      .order("nome"),
  ]);
  const categorias = (cat.data ?? []) as Categoria[];
  const servicos = ((serv.data ?? []) as Servico[]).map((s) => ({ ...s, preco_centavos: Number(s.preco_centavos) }));
  return { categorias, servicos };
}
