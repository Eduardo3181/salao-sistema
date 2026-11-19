"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { aplicativoConfirmado, conferirCodigo, lerCodigo, MENSAGEM_CODIGO } from "@/lib/dupla";
import { criarClienteSupabase } from "@/lib/supabase/server";

export type EstadoCodigo = { erro?: string } | undefined;

/** Segundo passo do login de quem ligou a dupla verificação. */
export async function confirmarCodigoEntrada(_: EstadoCodigo, form: FormData): Promise<EstadoCodigo> {
  const codigo = lerCodigo(form.get("codigo"));
  if (!codigo) return { erro: MENSAGEM_CODIGO.formato };

  const supabase = await criarClienteSupabase();
  const { data } = await supabase.auth.getUser();
  if (!data?.user) redirect("/auth/sair");
  const app = await aplicativoConfirmado(supabase);
  if (!app) redirect("/painel");

  const r = await conferirCodigo(supabase, app.id, codigo);
  if (r !== "ok") return { erro: MENSAGEM_CODIGO[r] };

  revalidatePath("/", "layout");
  redirect("/painel");
}
