"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { buscarMeuSalao, NOME_PERFIL, type Perfil } from "@/lib/salao";
import { gerarSenhaProvisoria } from "@/lib/senha";
import { criarClienteAdmin } from "@/lib/supabase/admin";
import { usuarioLogado } from "@/lib/supabase/server";

export type EstadoConvite =
  | {
      erro?: string;
      sucesso?: { nome: string; email: string; perfil: string; senha: string | null };
      valores?: { nome: string; email: string; perfil: string };
    }
  | undefined;

const EMAIL_VALIDO = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const PERFIS_PERMITIDOS: Perfil[] = ["recepcao", "profissional"];

/** Confere que quem está pedindo é dono do salão. */
async function exigirDono() {
  const { supabase, userId } = await usuarioLogado();
  if (!userId) redirect("/auth/sair");
  const salao = await buscarMeuSalao(supabase, userId);
  if (!salao || salao.perfil !== "dono") return null;
  return { supabase, userId, salao };
}

export async function adicionarPessoa(_: EstadoConvite, form: FormData): Promise<EstadoConvite> {
  const r = await adicionarPessoaInterno(form);
  // Em caso de erro, devolve o que foi digitado para o formulário não perder nada.
  if (!r?.erro) return r;
  const valores = { nome: String(form.get("nome") ?? ""), email: String(form.get("email") ?? ""), perfil: String(form.get("perfil") ?? "") };
  return { ...r, valores };
}

async function adicionarPessoaInterno(form: FormData): Promise<EstadoConvite> {
  const ctx = await exigirDono();
  if (!ctx) return { erro: "Só o dono do salão pode adicionar pessoas." };

  const nome = String(form.get("nome") ?? "").trim();
  const email = String(form.get("email") ?? "").trim().toLowerCase();
  const perfil = String(form.get("perfil") ?? "") as Perfil;

  if (nome.length < 2 || nome.length > 120) return { erro: "Digite o nome da pessoa (2 a 120 letras)." };
  if (!EMAIL_VALIDO.test(email)) return { erro: "Digite um e-mail válido." };
  if (!PERFIS_PERMITIDOS.includes(perfil)) return { erro: "Escolha Recepção ou Profissional." };

  const admin = criarClienteAdmin();

  // A pessoa já tem conta no sistema? Então só liga ao salão, sem senha nova.
  const { data: idExistente, error: erroBusca } = await admin.rpc("id_usuario_por_email", { p_email: email });
  if (erroBusca) {
    console.error("adicionarPessoa: busca falhou", erroBusca.code);
    return { erro: "Não foi possível adicionar agora. Tente de novo." };
  }

  let userId = idExistente as string | null;
  let senha: string | null = null;
  let contaCriadaAgora = false;

  if (!userId) {
    senha = gerarSenhaProvisoria();
    const { data, error } = await admin.auth.admin.createUser({ email, password: senha, email_confirm: true });
    if (error || !data.user) {
      console.error("adicionarPessoa: criar conta falhou", error?.code);
      return { erro: "Não foi possível criar o acesso. Confira o e-mail e tente de novo." };
    }
    userId = data.user.id;
    contaCriadaAgora = true;
  }

  // A ligação ao salão é feita COMO O DONO: o banco confere a permissão e registra na auditoria.
  const { error: erroLigar } = await ctx.supabase.rpc("adicionar_membro", {
    p_salao_id: ctx.salao.salaoId,
    p_user_id: userId,
    p_perfil: perfil,
    p_nome: nome,
    p_senha_provisoria: contaCriadaAgora,
  });

  if (erroLigar) {
    if (contaCriadaAgora) await admin.auth.admin.deleteUser(userId); // desfaz a conta criada
    if (erroLigar.code === "23505") return { erro: "Esta pessoa já faz parte da equipe." };
    console.error("adicionarPessoa: ligar ao salão falhou", erroLigar.code);
    return { erro: "Não foi possível adicionar agora. Tente de novo." };
  }

  revalidatePath("/painel");
  return { sucesso: { nome, email, perfil: NOME_PERFIL[perfil], senha } };
}

export async function mudarAcesso(form: FormData) {
  const ctx = await exigirDono();
  if (!ctx) return;
  const membroId = String(form.get("membro_id") ?? "");
  const ativo = form.get("ativo") === "true";

  const { error } = await ctx.supabase.rpc("definir_acesso_membro", { p_membro_id: membroId, p_ativo: ativo });
  if (error) console.error("mudarAcesso falhou", error.code);
  revalidatePath("/painel");
}
