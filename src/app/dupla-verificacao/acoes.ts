"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { aplicativoConfirmado, conferirCodigo, lerCodigo, MENSAGEM_CODIGO } from "@/lib/dupla";
import { criarClienteSupabase } from "@/lib/supabase/server";

export type EstadoInicio = { erro?: string; factorId?: string; qr?: string; segredo?: string } | undefined;
export type EstadoDupla = { erro?: string; concluido?: boolean } | undefined;

async function clienteLogado() {
  const supabase = await criarClienteSupabase();
  const { data } = await supabase.auth.getUser();
  if (!data?.user) redirect("/auth/sair");
  return supabase;
}

/** Passo 1: gera o QR code para a pessoa ler com o aplicativo. Nada muda no login até ela confirmar um código. */
export async function iniciarDupla(): Promise<EstadoInicio> {
  const supabase = await clienteLogado();
  if (await aplicativoConfirmado(supabase)) return { erro: "A dupla verificação já está ligada." };

  // Tentativas anteriores que não foram até o fim são descartadas.
  const { data: lista } = await supabase.auth.mfa.listFactors();
  for (const f of lista?.all ?? []) {
    if (f.status === "unverified") await supabase.auth.mfa.unenroll({ factorId: f.id });
  }

  const { data, error } = await supabase.auth.mfa.enroll({ factorType: "totp", friendlyName: "Celular", issuer: "Sistema do Salão" });
  if (error || !data) {
    console.error("iniciarDupla falhou:", error?.code);
    return { erro: "Não foi possível começar agora. Tente de novo em alguns minutos." };
  }
  return { factorId: data.id, qr: data.totp.qr_code, segredo: data.totp.secret };
}

/** Passo 2: confere o primeiro código. Só aí a dupla verificação passa a valer. */
export async function confirmarDupla(_: EstadoDupla, form: FormData): Promise<EstadoDupla> {
  const factorId = form.get("factor_id");
  const codigo = lerCodigo(form.get("codigo"));
  if (typeof factorId !== "string" || !factorId) return { erro: "Comece de novo." };
  if (!codigo) return { erro: MENSAGEM_CODIGO.formato };

  const supabase = await clienteLogado();
  const r = await conferirCodigo(supabase, factorId, codigo);
  if (r !== "ok") return { erro: MENSAGEM_CODIGO[r] };

  revalidatePath("/", "layout");
  return { concluido: true };
}

/** Desligar: pede o código atual, para ninguém desligar só por encontrar o computador aberto. */
export async function desligarDupla(_: EstadoDupla, form: FormData): Promise<EstadoDupla> {
  const codigo = lerCodigo(form.get("codigo"));
  if (!codigo) return { erro: MENSAGEM_CODIGO.formato };

  const supabase = await clienteLogado();
  const app = await aplicativoConfirmado(supabase);
  if (!app) return { concluido: true };

  const r = await conferirCodigo(supabase, app.id, codigo);
  if (r !== "ok") return { erro: MENSAGEM_CODIGO[r] };

  const { error } = await supabase.auth.mfa.unenroll({ factorId: app.id });
  if (error) {
    console.error("desligarDupla falhou:", error.code);
    return { erro: "Não foi possível desligar agora. Tente de novo." };
  }
  // O login atual continua; o próximo login volta a pedir só a senha.
  await supabase.auth.refreshSession();
  revalidatePath("/", "layout");
  return { concluido: true };
}
