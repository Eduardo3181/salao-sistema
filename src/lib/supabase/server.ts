import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { connection } from "next/server";

/**
 * Cliente do Supabase para o lado do servidor (páginas, ações de formulário).
 * Usa só a chave pública: quem decide o que cada pessoa vê é a RLS do banco.
 * Criar um novo a cada requisição; nunca compartilhar entre pessoas.
 */
export async function criarClienteSupabase() {
  await connection(); // sempre na hora da requisição (a biblioteca lê o relógio)
  const cookieStore = await cookies();

  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(lista) {
          try {
            lista.forEach(({ name, value, options }) => cookieStore.set(name, value, options));
          } catch {
            // Páginas não podem gravar cookies; o proxy.ts renova a sessão.
          }
        },
      },
    },
  );
}

/**
 * Devolve o id do usuário logado, ou null.
 * Pergunta ao servidor de login (getUser), então detecta conta apagada ou bloqueada,
 * e não só um "crachá" ainda válido no navegador.
 * Quando vier null, a página deve mandar para /auth/sair (limpa o login do navegador).
 */
export async function usuarioLogado() {
  const supabase = await criarClienteSupabase();
  const { data } = await supabase.auth.getUser();
  const id = data?.user?.id ?? null;
  return { supabase, userId: id };
}
