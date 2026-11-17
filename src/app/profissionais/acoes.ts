"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import type { TipoProfissional } from "@/lib/profissionais";
import { exigirSalao } from "@/lib/sessao";

export type EstadoProfissional = { erro?: string; ok?: string; valores?: Record<string, string> } | undefined;

const texto = (f: FormData, c: string) => String(f.get(c) ?? "").trim();
const TIPOS: TipoProfissional[] = ["profissional", "assistente"];

export async function salvarProfissional(_: EstadoProfissional, form: FormData): Promise<EstadoProfissional> {
  const r = await salvarInterno(form);
  // Em caso de erro, devolve o que foi digitado para o formulário não perder nada.
  if (!r?.erro) return r;
  return { ...r, valores: { nome: texto(form, "nome"), tipo: texto(form, "tipo"), user_id: texto(form, "user_id") } };
}

async function salvarInterno(form: FormData): Promise<EstadoProfissional> {
  const ctx = await exigirSalao();
  if (!ctx.ehDono) return { erro: "Só o dono pode cadastrar e alterar quem atende." };

  const id = texto(form, "id");
  const nome = texto(form, "nome");
  const tipo = texto(form, "tipo") as TipoProfissional;
  const userId = texto(form, "user_id") || null;

  if (nome.length < 2 || nome.length > 80) return { erro: "O nome deve ter entre 2 e 80 letras." };
  if (!TIPOS.includes(tipo)) return { erro: "Escolha Profissional ou Assistente." };

  const dados = { nome, tipo, user_id: userId };
  const { error } = id
    ? await ctx.supabase.from("profissionais").update(dados).eq("id", id)
    : await ctx.supabase.from("profissionais").insert({ ...dados, salao_id: ctx.salao.salaoId });

  if (error) {
    if (error.code === "23505")
      return {
        erro: error.message.includes("usuario")
          ? "Essa pessoa da equipe já está ligada a outro cadastro."
          : "Já existe alguém cadastrado com esse nome.",
      };
    if (error.code === "23514") return { erro: "Só é possível ligar a alguém da equipe deste salão." };
    console.error("salvarProfissional falhou:", error.code);
    return { erro: "Não foi possível salvar. Tente de novo." };
  }

  revalidatePath("/profissionais");
  revalidatePath("/painel");
  if (id) redirect("/profissionais");
  return { ok: `${nome} cadastrado(a) como ${tipo === "assistente" ? "assistente" : "profissional"}.` };
}

export async function alternarProfissional(form: FormData) {
  const ctx = await exigirSalao();
  if (!ctx.ehDono) return;
  const { error } = await ctx.supabase
    .from("profissionais")
    .update({ ativo: form.get("ativo") === "true" })
    .eq("id", texto(form, "id"));
  if (error) console.error("alternarProfissional falhou:", error.code);
  revalidatePath("/profissionais");
}

/** O dono escolhe quais profissionais a assistente ajuda (a assistente vê a agenda delas). */
export async function salvarAjudaAssistente(_: EstadoProfissional, form: FormData): Promise<EstadoProfissional> {
  const ctx = await exigirSalao();
  if (!ctx.ehDono) return { erro: "Só o dono escolhe quem a assistente ajuda." };
  const assistenteId = texto(form, "assistente_id");
  const escolhidas = form.getAll("profissional_id").map(String);
  const { error } = await ctx.supabase.rpc("definir_ajuda_assistente", {
    p_assistente_id: assistenteId,
    p_profissionais: escolhidas,
  });
  if (error) {
    if (error.code === "42501" || error.code === "22023") return { erro: error.message };
    console.error("salvarAjudaAssistente falhou:", error.code);
    return { erro: "Não foi possível salvar. Tente de novo." };
  }
  revalidatePath(`/profissionais/${assistenteId}`);
  revalidatePath("/agenda");
  return {
    ok: escolhidas.length
      ? `Salvo. Ela vê a agenda de ${escolhidas.length} ${escolhidas.length === 1 ? "profissional" : "profissionais"}.`
      : "Salvo. Ela não vê a agenda de ninguém por enquanto.",
  };
}
