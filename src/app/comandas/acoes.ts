"use server";

import { revalidatePath } from "next/cache";
import { exigirSalao } from "@/lib/sessao";

type Resposta<T> = { ok: true; dados: T } | { ok: false; erro: string };

const mensagem = (code: string | undefined, texto: string) =>
  code === "42501" || code === "22023" ? texto : "Não foi possível abrir a comanda. Tente de novo.";

/** Nova comanda (sem agendamento) para a cliente escolhida. Devolve o id para a tela abrir. */
export async function abrirComanda(clienteId: string): Promise<Resposta<string>> {
  const { supabase, salao } = await exigirSalao();
  const { data, error } = await supabase.rpc("abrir_comanda", { p_salao_id: salao.salaoId, p_cliente_id: clienteId });
  if (error) {
    console.error("abrirComanda falhou:", error.code);
    return { ok: false, erro: mensagem(error.code, error.message) };
  }
  revalidatePath("/comandas");
  return { ok: true, dados: data as string };
}

/** Comanda de um agendamento (se já existir, devolve a mesma). */
export async function abrirComandaDoAgendamento(agendamentoId: string): Promise<Resposta<string>> {
  const { supabase, salao } = await exigirSalao();
  const { data: ag } = await supabase.from("agendamentos").select("cliente_id").eq("id", agendamentoId).maybeSingle();
  if (!ag) return { ok: false, erro: "Agendamento não encontrado." };
  const { data, error } = await supabase.rpc("abrir_comanda", {
    p_salao_id: salao.salaoId,
    p_cliente_id: ag.cliente_id,
    p_agendamento_id: agendamentoId,
  });
  if (error) {
    console.error("abrirComandaDoAgendamento falhou:", error.code);
    return { ok: false, erro: mensagem(error.code, error.message) };
  }
  revalidatePath("/comandas");
  return { ok: true, dados: data as string };
}
