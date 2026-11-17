import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

/** Páginas que exigem login. */
const PROTEGIDAS = ["/painel", "/novo-salao", "/trocar-senha", "/servicos", "/profissionais", "/clientes", "/configuracoes", "/importar", "/aniversarios"];
/** Páginas só para quem não está logado. */
const SO_VISITANTE = ["/", "/entrar", "/criar-conta"];

/**
 * Roda antes de cada página: renova a sessão de login (cookies) e
 * manda para /entrar quem tenta abrir uma página protegida sem estar logado.
 * A proteção de verdade dos dados é a RLS do banco; isto é só conveniência.
 */
export async function proxy(request: NextRequest) {
  const url = request.nextUrl;

  // Link de confirmação de e-mail que caiu na página inicial: encaminha.
  if (url.pathname === "/" && (url.searchParams.has("code") || url.searchParams.has("token_hash"))) {
    const destino = url.clone();
    destino.pathname = "/auth/confirmar";
    return NextResponse.redirect(destino);
  }

  let resposta = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(lista) {
          lista.forEach(({ name, value }) => request.cookies.set(name, value));
          resposta = NextResponse.next({ request });
          lista.forEach(({ name, value, options }) => resposta.cookies.set(name, value, options));
        },
      },
    },
  );

  const { data } = await supabase.auth.getClaims();
  const logado = Boolean(data?.claims?.sub);

  if (!logado && PROTEGIDAS.some((p) => url.pathname.startsWith(p))) {
    const destino = url.clone();
    destino.pathname = "/entrar";
    destino.search = "";
    return NextResponse.redirect(destino);
  }

  // Quem já está logado não precisa ver a capa nem as telas de acesso.
  if (logado && SO_VISITANTE.includes(url.pathname)) {
    const destino = url.clone();
    destino.pathname = "/painel";
    destino.search = "";
    return NextResponse.redirect(destino);
  }

  return resposta;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)"],
};
