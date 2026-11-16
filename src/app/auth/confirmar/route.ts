import type { EmailOtpType } from "@supabase/supabase-js";
import { NextResponse, type NextRequest } from "next/server";
import { criarClienteSupabase } from "@/lib/supabase/server";

/** Destino do link de confirmação enviado por e-mail. */
export async function GET(request: NextRequest) {
  const { searchParams, origin } = request.nextUrl;
  const code = searchParams.get("code");
  const tokenHash = searchParams.get("token_hash");
  const tipo = searchParams.get("type") as EmailOtpType | null;

  const supabase = await criarClienteSupabase();

  let ok = false;
  if (code) {
    ok = !(await supabase.auth.exchangeCodeForSession(code)).error;
  } else if (tokenHash && tipo) {
    ok = !(await supabase.auth.verifyOtp({ token_hash: tokenHash, type: tipo })).error;
  }

  return NextResponse.redirect(new URL(ok ? "/painel" : "/entrar?erro=link", origin));
}
