"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { criarClienteSupabase } from "@/lib/supabase/server";

export type EstadoForm = { erro?: string; aviso?: string; email?: string } | undefined;

const EMAIL_VALIDO = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function texto(form: FormData, campo: string) {
  const v = form.get(campo);
  return typeof v === "string" ? v.trim() : "";
}

/** Traduz as mensagens do Supabase para português simples. */
function traduzirErro(mensagem: string): string {
  const m = mensagem.toLowerCase();
  if (m.includes("invalid login credentials")) return "E-mail ou senha incorretos.";
  if (m.includes("email not confirmed"))
    return "Você ainda não confirmou seu e-mail. Abra o e-mail que enviamos e clique no link.";
  if (m.includes("rate limit") || m.includes("too many"))
    return "Muitas tentativas seguidas. Espere alguns minutos e tente de novo.";
  if (m.includes("password")) return "A senha não foi aceita. Use pelo menos 8 caracteres.";
  return "Não foi possível concluir agora. Tente de novo em instantes.";
}

export async function criarConta(_: EstadoForm, form: FormData): Promise<EstadoForm> {
  const email = texto(form, "email").toLowerCase();
  const senha = form.get("senha");
  const confirmacao = form.get("confirmacao");

  if (!EMAIL_VALIDO.test(email)) return { erro: "Digite um e-mail válido.", email };
  if (typeof senha !== "string" || senha.length < 8)
    return { erro: "A senha precisa ter pelo menos 8 caracteres.", email };
  if (senha !== confirmacao) return { erro: "As duas senhas não são iguais.", email };

  const origem = (await headers()).get("origin") ?? "";
  const supabase = await criarClienteSupabase();
  const { error } = await supabase.auth.signUp({
    email,
    password: senha,
    options: { emailRedirectTo: `${origem}/auth/confirmar` },
  });
  if (error) return { erro: traduzirErro(error.message), email };

  return {
    aviso: `Quase lá! Enviamos um e-mail para ${email}. Abra e clique no link para confirmar sua conta. Se não aparecer, olhe a caixa de spam.`,
  };
}

export async function entrar(_: EstadoForm, form: FormData): Promise<EstadoForm> {
  const email = texto(form, "email").toLowerCase();
  const senha = form.get("senha");
  if (!EMAIL_VALIDO.test(email) || typeof senha !== "string" || !senha)
    return { erro: "Preencha e-mail e senha.", email };

  const supabase = await criarClienteSupabase();
  const { error } = await supabase.auth.signInWithPassword({ email, password: senha });
  if (error) return { erro: traduzirErro(error.message), email };

  redirect("/painel");
}

export async function sair() {
  const supabase = await criarClienteSupabase();
  await supabase.auth.signOut();
  redirect("/entrar");
}

export async function cadastrarSalao(_: EstadoForm, form: FormData): Promise<EstadoForm> {
  const nome = texto(form, "nome");
  if (nome.length < 2 || nome.length > 120)
    return { erro: "O nome do salão deve ter entre 2 e 120 letras." };

  const supabase = await criarClienteSupabase();
  const { error } = await supabase.rpc("criar_salao", { p_nome: nome });
  if (error) {
    // Só o código técnico vai para o registro (nada de dado pessoal).
    console.error("cadastrarSalao falhou:", error.code);
    // 23503 = conta não existe mais; 42501 = login inválido. Limpa o login.
    if (error.code === "23503" || error.code === "42501") redirect("/auth/sair");
    return { erro: "Não foi possível cadastrar o salão. Tente de novo." };
  }

  redirect("/painel");
}
