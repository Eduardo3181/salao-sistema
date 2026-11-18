"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { buscarConfiguracao, podeEditarClientes } from "@/lib/clientes";
import { exigirSalao } from "@/lib/sessao";
import { hojeEmBrasilia, normalizarTelefone, validarNascimento } from "@/lib/telefone-data";

export type EstadoCliente = { erro?: string; ok?: string; valores?: Record<string, string> } | undefined;

const texto = (f: FormData, c: string) => String(f.get(c) ?? "").trim();

async function exigirPermissao() {
  const ctx = await exigirSalao();
  const config = await buscarConfiguracao(ctx.supabase, ctx.salao.salaoId);
  return podeEditarClientes(ctx.salao.perfil, config.profissionaisEditamClientes) ? ctx : null;
}

export async function salvarCliente(_: EstadoCliente, form: FormData): Promise<EstadoCliente> {
  const r = await salvarInterno(form);
  if (!r?.erro) return r;
  // Em caso de erro, devolve o que foi digitado para o formulário não perder nada.
  const valores = Object.fromEntries(
    ["nome", "telefone", "nascimento", "observacoes"].map((c) => [c, String(form.get(c) ?? "")]),
  );
  return { ...r, valores };
}

async function salvarInterno(form: FormData): Promise<EstadoCliente> {
  const ctx = await exigirPermissao();
  if (!ctx) return { erro: "Você não tem permissão para cadastrar ou alterar clientes." };

  const id = texto(form, "id");
  const nome = texto(form, "nome");
  const temTelefone = form.has("telefone");
  const telefone = temTelefone ? normalizarTelefone(texto(form, "telefone")) : "";
  const nascimento = validarNascimento(texto(form, "nascimento"), hojeEmBrasilia());
  const observacoes = texto(form, "observacoes");

  if (nome.length < 2 || nome.length > 120) return { erro: "O nome deve ter entre 2 e 120 letras." };
  if (telefone === null) return { erro: "Telefone inválido. Use o DDD, por exemplo: (11) 98765-4321." };
  if (nascimento === null) return { erro: "Data de nascimento inválida." };
  if (observacoes.length > 1000) return { erro: "As observações podem ter no máximo 1000 letras." };

  const dados = {
    nome,
    ...(temTelefone ? { telefone: telefone || null } : {}),
    nascimento: nascimento || null,
    observacoes: observacoes || null,
  };

  const { error } = id
    ? await ctx.supabase.from("clientes").update(dados).eq("id", id)
    : await ctx.supabase.from("clientes").insert({ ...dados, salao_id: ctx.salao.salaoId });

  if (error) {
    console.error("salvarCliente falhou:", error.code); // só o código: nada de dado pessoal no registro
    return { erro: "Não foi possível salvar. Tente de novo." };
  }

  revalidatePath("/clientes");
  if (id) redirect(`/clientes/${id}?salvo=1`);
  return { ok: `${nome} cadastrada.` };
}

export async function alternarCliente(form: FormData) {
  const ctx = await exigirPermissao();
  if (!ctx) return;
  const id = texto(form, "id");
  const { error } = await ctx.supabase
    .from("clientes")
    .update({ ativo: form.get("ativo") === "true" })
    .eq("id", id);
  if (error) console.error("alternarCliente falhou:", error.code);
  revalidatePath("/clientes");
  revalidatePath(`/clientes/${id}`);
}

export async function salvarConfiguracao(form: FormData) {
  const ctx = await exigirSalao();
  if (!ctx.ehDono) return;
  const valores = {
    profissionais_editam_clientes: form.get("profissionais_editam_clientes") === "on",
    exigir_motivo_cancelamento: form.get("exigir_motivo_cancelamento") === "on",
    profissionais_alteram_preco: form.get("profissionais_alteram_preco") === "on",
    profissionais_recebem_pagamento: form.get("profissionais_recebem_pagamento") === "on",
  };
  // Atualiza se já existe; senão cria (o banco só deixa o dono fazer as duas coisas).
  const atualizado = await ctx.supabase
    .from("configuracao_salao")
    .update(valores)
    .eq("salao_id", ctx.salao.salaoId)
    .select("salao_id");
  const { error } =
    atualizado.error || (atualizado.data ?? []).length > 0
      ? atualizado
      : await ctx.supabase
          .from("configuracao_salao")
          .insert({ salao_id: ctx.salao.salaoId, ...valores });
  if (error) console.error("salvarConfiguracao falhou:", error.code);
  revalidatePath("/configuracoes");
  revalidatePath("/clientes");
  redirect("/configuracoes?salvo=1");
}

/** Registra o aceite (ou a recusa) de mensagens no WhatsApp. Nunca apaga o histórico. */
export async function registrarAceiteWhatsapp(form: FormData) {
  const ctx = await exigirSalao();
  if (ctx.salao.perfil !== "dono" && ctx.salao.perfil !== "recepcao") return;
  const clienteId = texto(form, "cliente_id");
  const { error } = await ctx.supabase.from("consentimentos_whatsapp").insert({
    salao_id: ctx.salao.salaoId,
    cliente_id: clienteId,
    aceitou: form.get("aceitou") === "true",
  });
  if (error) console.error("registrarAceiteWhatsapp falhou:", error.code);
  revalidatePath(`/clientes/${clienteId}`);
}

export type EstadoRemocao = { erro?: string } | undefined;

/** LGPD: apaga para sempre os dados pessoais do cliente. Só o dono (o banco confere). */
export async function removerDadosCliente(_: EstadoRemocao, form: FormData): Promise<EstadoRemocao> {
  const { supabase, salao, ehDono } = await exigirSalao();
  if (!ehDono) return { erro: "Só o dono pode apagar os dados de um cliente." };
  const id = texto(form, "id");
  if (form.get("confirmo") !== "sim") return { erro: "Marque a confirmação para continuar." };
  const { error } = await supabase.rpc("remover_dados_cliente", { p_salao_id: salao.salaoId, p_cliente_id: id });
  if (error) {
    console.error("removerDadosCliente falhou:", error.code);
    if (error.code === "42501" || error.code === "22023") return { erro: error.message };
    return { erro: "Não foi possível apagar agora. Tente de novo em instantes." };
  }
  revalidatePath("/clientes");
  revalidatePath(`/clientes/${id}`);
  return undefined;
}
