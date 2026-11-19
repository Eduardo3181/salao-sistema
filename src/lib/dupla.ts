import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Dupla verificação (senha + código do aplicativo no celular). Opcional, para todos.
 * "aal1" = entrou só com a senha; "aal2" = também digitou o código.
 */

/** Verdadeiro quando a pessoa ligou a dupla verificação e ainda não digitou o código nesta sessão. */
export async function faltaCodigo(supabase: SupabaseClient): Promise<boolean> {
  const { data } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
  return data?.currentLevel === "aal1" && data?.nextLevel === "aal2";
}

/** Código de 6 números (aceita espaços digitados no meio). */
export function lerCodigo(valor: FormDataEntryValue | null): string | null {
  const codigo = typeof valor === "string" ? valor.replace(/\s/g, "") : "";
  return /^\d{6}$/.test(codigo) ? codigo : null;
}

/** O aplicativo já confirmado da pessoa (só um por conta), ou null. */
export async function aplicativoConfirmado(supabase: SupabaseClient): Promise<{ id: string; criadoEm: string } | null> {
  const { data } = await supabase.auth.mfa.listFactors();
  const f = data?.totp?.find((x) => x.status === "verified");
  return f ? { id: f.id, criadoEm: f.created_at } : null;
}

/** Confere o código digitado. */
export async function conferirCodigo(supabase: SupabaseClient, factorId: string, codigo: string): Promise<"ok" | "errado" | "limite"> {
  const { error } = await supabase.auth.mfa.challengeAndVerify({ factorId, code: codigo });
  if (!error) return "ok";
  const m = `${error.code ?? ""} ${error.message}`.toLowerCase();
  if (m.includes("rate") || m.includes("too many")) return "limite";
  return "errado";
}

export const MENSAGEM_CODIGO = {
  formato: "Digite os 6 números que aparecem no aplicativo.",
  errado: "Código errado ou vencido. O código muda a cada 30 segundos: digite o que aparece agora no aplicativo.",
  limite: "Muitas tentativas seguidas. Espere alguns minutos e tente de novo.",
};
