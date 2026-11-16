import "server-only";

import { redirect } from "next/navigation";
import { buscarMeuSalao } from "@/lib/salao";
import { usuarioLogado } from "@/lib/supabase/server";

/**
 * Para páginas e ações que exigem login e salão.
 * Manda para o lugar certo quando falta algo (login, salão, troca de senha).
 */
export async function exigirSalao() {
  const { supabase, userId } = await usuarioLogado();
  if (!userId) redirect("/auth/sair");

  const salao = await buscarMeuSalao(supabase, userId);
  if (!salao) redirect("/novo-salao");
  if (salao.trocarSenha) redirect("/trocar-senha");

  return { supabase, userId, salao, ehDono: salao.perfil === "dono" };
}
