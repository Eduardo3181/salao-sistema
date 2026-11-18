"use server";

import { createClient } from "@supabase/supabase-js";
import { redirect } from "next/navigation";
import { criarClienteSupabase } from "@/lib/supabase/server";

export type EstadoSenha = { erro?: string; concluido?: boolean } | undefined;

/**
 * Confere a senha atual sem mexer no login de quem está usando o sistema:
 * usa um cliente separado, que não grava cookie, e depois descarta só aquela sessão de conferência.
 */
async function senhaAtualConfere(email: string, senha: string): Promise<"ok" | "errada" | "limite"> {
  const conferencia = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });
  const { error } = await conferencia.auth.signInWithPassword({ email, password: senha });
  if (error) {
    const m = error.message.toLowerCase();
    return m.includes("rate limit") || m.includes("too many") ? "limite" : "errada";
  }
  await conferencia.auth.signOut({ scope: "local" });
  return "ok";
}

/** "Minha senha": troca a senha de quem está logado. Pede a senha atual e desconecta os outros aparelhos. */
export async function alterarMinhaSenha(_: EstadoSenha, form: FormData): Promise<EstadoSenha> {
  const atual = form.get("atual");
  const nova = form.get("senha");
  const confirmacao = form.get("confirmacao");
  if (typeof atual !== "string" || !atual) return { erro: "Digite a sua senha atual." };
  if (typeof nova !== "string" || nova.length < 8) return { erro: "A nova senha precisa ter pelo menos 8 caracteres." };
  if (nova.length > 72) return { erro: "A nova senha pode ter no máximo 72 caracteres." };
  if (nova !== confirmacao) return { erro: "As duas senhas novas não são iguais." };
  if (nova === atual) return { erro: "A nova senha precisa ser diferente da atual." };

  const supabase = await criarClienteSupabase();
  const { data } = await supabase.auth.getUser();
  const email = data?.user?.email;
  if (!email) redirect("/auth/sair");

  const conferida = await senhaAtualConfere(email, atual);
  if (conferida === "limite") return { erro: "Muitas tentativas seguidas. Espere alguns minutos e tente de novo." };
  if (conferida === "errada") return { erro: "A senha atual não está certa." };

  const { error } = await supabase.auth.updateUser({ password: nova });
  if (error) {
    console.error("alterarMinhaSenha falhou:", error.code);
    if (error.code === "same_password") return { erro: "A nova senha precisa ser diferente da atual." };
    if (error.code === "weak_password") return { erro: "Essa senha é fraca demais. Use uma mais longa, misturando letras e números." };
    return { erro: "Não foi possível trocar a senha agora. Tente de novo em instantes." };
  }

  // Quem tiver entrado com a senha antiga em outro celular ou computador precisa entrar de novo.
  const { error: erroOutros } = await supabase.auth.signOut({ scope: "others" });
  if (erroOutros) console.error("alterarMinhaSenha: sair dos outros aparelhos falhou", erroOutros.code);

  return { concluido: true };
}
