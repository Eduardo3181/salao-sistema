"use server";

import { revalidatePath } from "next/cache";
import { reaisParaCentavos } from "@/lib/dinheiro";
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

// ---------------------------------------------------------------------------
// Itens, desconto e cancelamento. As regras (quem pode o quê) ficam no banco;
// aqui só convertemos reais em centavos e devolvemos mensagens simples.
// ---------------------------------------------------------------------------
const erroDoBanco = (code: string | undefined, texto: string, padrao: string) =>
  code === "42501" || code === "22023" ? texto : padrao;

/** "80,50" -> 8050; vazio -> null; inválido -> "erro". */
function lerReais(texto: string): number | null | "erro" {
  if (!texto.trim()) return null;
  const c = reaisParaCentavos(texto);
  return c === null || c > 100_000_000 ? "erro" : c;
}

export type NovoItem = {
  tipo: "servico" | "produto";
  refId: string;
  profissionalId: string | null;
  quantidade: number;
  preco: string; // em reais, vazio = preço do cadastro
  desconto: string; // em reais, vazio = 0
};

export async function lancarItem(comandaId: string, item: NovoItem): Promise<Resposta<null>> {
  const preco = lerReais(item.preco);
  const desconto = lerReais(item.desconto);
  if (preco === "erro") return { ok: false, erro: "Preço inválido. Exemplos: 80 ou 80,50." };
  if (desconto === "erro") return { ok: false, erro: "Desconto inválido. Exemplos: 10 ou 10,50." };
  if (!item.refId) return { ok: false, erro: item.tipo === "servico" ? "Escolha o serviço." : "Escolha o produto." };
  if (!Number.isInteger(item.quantidade) || item.quantidade < 1 || item.quantidade > 999)
    return { ok: false, erro: "Quantidade deve ser de 1 a 999." };

  const { supabase } = await exigirSalao();
  const { error } = await supabase.rpc("lancar_item_comanda", {
    p_comanda_id: comandaId,
    p_tipo: item.tipo,
    p_ref_id: item.refId,
    p_profissional_id: item.profissionalId || null,
    p_quantidade: item.quantidade,
    p_preco_unitario: preco,
    p_desconto: desconto ?? 0,
  });
  if (error) {
    console.error("lancarItem falhou:", error.code);
    return { ok: false, erro: erroDoBanco(error.code, error.message, "Não foi possível lançar. Tente de novo.") };
  }
  revalidatePath(`/comandas/${comandaId}`);
  return { ok: true, dados: null };
}

export async function alterarItem(
  comandaId: string,
  itemId: string,
  quantidade: number,
  precoTexto: string,
  descontoTexto: string,
): Promise<Resposta<null>> {
  const preco = lerReais(precoTexto);
  const desconto = lerReais(descontoTexto);
  if (preco === "erro" || preco === null) return { ok: false, erro: "Preço inválido. Exemplos: 80 ou 80,50." };
  if (desconto === "erro") return { ok: false, erro: "Desconto inválido. Exemplos: 10 ou 10,50." };
  if (!Number.isInteger(quantidade) || quantidade < 1 || quantidade > 999) return { ok: false, erro: "Quantidade deve ser de 1 a 999." };

  const { supabase } = await exigirSalao();
  const { error } = await supabase.rpc("alterar_item_comanda", {
    p_item_id: itemId,
    p_quantidade: quantidade,
    p_preco_unitario: preco,
    p_desconto: desconto ?? 0,
  });
  if (error) {
    console.error("alterarItem falhou:", error.code);
    return { ok: false, erro: erroDoBanco(error.code, error.message, "Não foi possível salvar. Tente de novo.") };
  }
  revalidatePath(`/comandas/${comandaId}`);
  return { ok: true, dados: null };
}

export async function removerItem(comandaId: string, itemId: string, motivo: string): Promise<Resposta<null>> {
  const { supabase } = await exigirSalao();
  const { error } = await supabase.rpc("remover_item_comanda", { p_item_id: itemId, p_motivo: motivo.slice(0, 200) });
  if (error) {
    console.error("removerItem falhou:", error.code);
    return { ok: false, erro: erroDoBanco(error.code, error.message, "Não foi possível excluir. Tente de novo.") };
  }
  revalidatePath(`/comandas/${comandaId}`);
  return { ok: true, dados: null };
}

export async function definirAssistentes(comandaId: string, itemId: string, assistentes: string[]): Promise<Resposta<null>> {
  const { supabase } = await exigirSalao();
  const { error } = await supabase.rpc("definir_assistentes_item", { p_item_id: itemId, p_assistentes: assistentes });
  if (error) {
    console.error("definirAssistentes falhou:", error.code);
    return { ok: false, erro: erroDoBanco(error.code, error.message, "Não foi possível salvar. Tente de novo.") };
  }
  revalidatePath(`/comandas/${comandaId}`);
  return { ok: true, dados: null };
}

export async function definirDesconto(comandaId: string, descontoTexto: string): Promise<Resposta<null>> {
  const desconto = lerReais(descontoTexto);
  if (desconto === "erro") return { ok: false, erro: "Desconto inválido. Exemplos: 10 ou 10,50." };
  const { supabase } = await exigirSalao();
  const { error } = await supabase.rpc("definir_desconto_comanda", { p_comanda_id: comandaId, p_desconto: desconto ?? 0 });
  if (error) {
    console.error("definirDesconto falhou:", error.code);
    return { ok: false, erro: erroDoBanco(error.code, error.message, "Não foi possível salvar. Tente de novo.") };
  }
  revalidatePath(`/comandas/${comandaId}`);
  return { ok: true, dados: null };
}

export async function cancelarComanda(comandaId: string, motivo: string): Promise<Resposta<null>> {
  const { supabase } = await exigirSalao();
  const { error } = await supabase.rpc("cancelar_comanda", { p_comanda_id: comandaId, p_motivo: motivo.slice(0, 200) });
  if (error) {
    console.error("cancelarComanda falhou:", error.code);
    return { ok: false, erro: erroDoBanco(error.code, error.message, "Não foi possível cancelar. Tente de novo.") };
  }
  revalidatePath("/comandas");
  revalidatePath(`/comandas/${comandaId}`);
  return { ok: true, dados: null };
}
