import type { SupabaseClient } from "@supabase/supabase-js";

export type Produto = {
  id: string;
  nome: string;
  preco_centavos: number;
  ativo: boolean;
  custo_centavos: number | null; // só vem preenchido para o dono
};

/**
 * Produtos do salão. A RLS garante que só vêm os do salão da pessoa.
 * O custo só chega para o dono (a função do banco devolve vazio para os outros perfis).
 */
export async function buscarProdutos(supabase: SupabaseClient, salaoId: string, comCusto: boolean): Promise<Produto[]> {
  const [{ data }, custos] = await Promise.all([
    supabase.from("produtos").select("id, nome, preco_centavos, ativo").eq("salao_id", salaoId).order("nome"),
    comCusto
      ? supabase.rpc("custos_dos_produtos", { p_salao_id: salaoId }).then((r) => (r.data ?? []) as { id: string; custo_centavos: number | null }[])
      : Promise.resolve([]),
  ]);
  const custoPorId = new Map(custos.map((c) => [c.id, c.custo_centavos === null ? null : Number(c.custo_centavos)]));
  return ((data ?? []) as Omit<Produto, "custo_centavos">[]).map((p) => ({
    ...p,
    preco_centavos: Number(p.preco_centavos),
    custo_centavos: custoPorId.get(p.id) ?? null,
  }));
}
