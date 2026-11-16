import { NextResponse, type NextRequest } from "next/server";
import { criarClienteSupabase } from "@/lib/supabase/server";

/**
 * Limpa o login do navegador e volta para /entrar.
 * Usado quando a conta não existe mais ou o login ficou inválido.
 */
export async function GET(request: NextRequest) {
  const supabase = await criarClienteSupabase();
  await supabase.auth.signOut({ scope: "local" });
  return NextResponse.redirect(new URL("/entrar", request.nextUrl.origin));
}
