import type { SupabaseClient } from "@supabase/supabase-js";
import type { Perfil } from "@/lib/salao";

export type Cliente = {
  id: string;
  nome: string;
  telefone: string | null; // vem vazio para quem não pode ver telefone
  nascimento: string | null;
  observacoes: string | null;
  ativo: boolean;
};

/** Configurações do salão (sem linha salva = padrões: chaves de clientes e motivo ligadas; as da comanda desligadas). */
export async function buscarConfiguracao(supabase: SupabaseClient, salaoId: string) {
  const { data } = await supabase
    .from("configuracao_salao")
    .select("profissionais_editam_clientes, exigir_motivo_cancelamento, profissionais_alteram_preco, profissionais_recebem_pagamento")
    .eq("salao_id", salaoId)
    .maybeSingle();
  return {
    profissionaisEditamClientes: data ? Boolean(data.profissionais_editam_clientes) : true,
    exigirMotivoCancelamento: data ? Boolean(data.exigir_motivo_cancelamento) : true,
    profissionaisAlteramPreco: data ? Boolean(data.profissionais_alteram_preco) : false,
    profissionaisRecebemPagamento: data ? Boolean(data.profissionais_recebem_pagamento) : false,
  };
}

/** Mesma regra do banco (privado.pode_editar_clientes), para mostrar ou esconder botões. */
export function podeEditarClientes(perfil: Perfil, profissionaisEditamClientes: boolean) {
  return perfil === "dono" || perfil === "recepcao" || (perfil === "profissional" && profissionaisEditamClientes);
}

/** Mesma regra do banco (privado.ve_telefone_clientes). */
export function podeVerTelefone(perfil: Perfil) {
  return perfil === "dono" || perfil === "recepcao";
}

/** Assistente não acessa clientes (decisão da dona). */
export function podeVerClientes(perfil: Perfil) {
  return perfil !== "assistente";
}

/**
 * Lista de clientes, com busca. Passa pela função do banco, que:
 * só devolve clientes do salão, esconde o telefone de quem não pode ver
 * e só deixa buscar por telefone quem pode ver telefone.
 */
export async function buscarClientes(supabase: SupabaseClient, salaoId: string, busca: string, incluirInativas: boolean) {
  const { data, error } = await supabase.rpc("clientes_do_salao", {
    p_salao_id: salaoId,
    p_busca: busca.slice(0, 60) || null,
    p_incluir_inativas: incluirInativas,
  });
  if (error) console.error("buscarClientes falhou:", error.code);
  return (data ?? []) as Cliente[];
}

export async function buscarCliente(supabase: SupabaseClient, salaoId: string, id: string) {
  const { data, error } = await supabase.rpc("clientes_do_salao", { p_salao_id: salaoId, p_id: id });
  if (error) console.error("buscarCliente falhou:", error.code);
  return ((data ?? [])[0] ?? null) as Cliente | null;
}
