"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { reaisParaCentavos } from "@/lib/dinheiro";
import { exigirSalao } from "@/lib/sessao";

export type EstadoServico = { erro?: string; ok?: string; valores?: Record<string, string> } | undefined;

const texto = (f: FormData, c: string) => String(f.get(c) ?? "").trim();

/** Só o dono passa daqui. O banco confere de novo (RLS). */
async function exigirDono() {
  const ctx = await exigirSalao();
  if (!ctx.ehDono) return null;
  return ctx;
}

export async function criarCategoria(_: EstadoServico, form: FormData): Promise<EstadoServico> {
  const ctx = await exigirDono();
  if (!ctx) return { erro: "Só o dono pode criar categorias." };

  const nome = texto(form, "nome");
  if (nome.length < 2 || nome.length > 60) return { erro: "O nome da categoria deve ter entre 2 e 60 letras." };

  const { error } = await ctx.supabase.from("categorias_servico").insert({ salao_id: ctx.salao.salaoId, nome });
  if (error) {
    if (error.code === "23505") return { erro: "Já existe uma categoria com esse nome." };
    console.error("criarCategoria falhou:", error.code);
    return { erro: "Não foi possível criar a categoria. Tente de novo." };
  }
  revalidatePath("/servicos");
  return { ok: `Categoria "${nome}" criada.` };
}

export async function salvarServico(_: EstadoServico, form: FormData): Promise<EstadoServico> {
  const r = await salvarServicoInterno(form);
  // Em caso de erro, devolve o que foi digitado para o formulário não perder nada.
  return r?.erro ? { ...r, valores: Object.fromEntries([...form.entries()].map(([k, v]) => [k, String(v)])) } : r;
}

async function salvarServicoInterno(form: FormData): Promise<EstadoServico> {
  const ctx = await exigirDono();
  if (!ctx) return { erro: "Só o dono pode cadastrar e alterar serviços." };

  const id = texto(form, "id");
  const nome = texto(form, "nome");
  const categoriaId = texto(form, "categoria_id");
  const duracao = Number(texto(form, "duracao_min"));
  const preco = reaisParaCentavos(texto(form, "preco"));

  if (nome.length < 2 || nome.length > 120) return { erro: "O nome do serviço deve ter entre 2 e 120 letras." };
  if (!categoriaId) return { erro: "Escolha a categoria." };
  if (!Number.isInteger(duracao) || duracao < 5 || duracao > 720)
    return { erro: "A duração deve ser em minutos, entre 5 e 720 (12 horas)." };
  if (preco === null) return { erro: "Preço inválido. Exemplos: 80 ou 80,50." };
  if (preco > 100_000_000) return { erro: "Preço alto demais." };

  const dados = { nome, categoria_id: categoriaId, duracao_min: duracao, preco_centavos: preco };
  const { error } = id
    ? await ctx.supabase.from("servicos").update(dados).eq("id", id)
    : await ctx.supabase.from("servicos").insert({ ...dados, salao_id: ctx.salao.salaoId });

  if (error) {
    if (error.code === "23505") return { erro: "Já existe um serviço com esse nome." };
    console.error("salvarServico falhou:", error.code);
    return { erro: "Não foi possível salvar. Tente de novo." };
  }
  revalidatePath("/servicos");
  redirect("/servicos");
}

export async function alternarServico(form: FormData) {
  const ctx = await exigirDono();
  if (!ctx) return;
  const { error } = await ctx.supabase
    .from("servicos")
    .update({ ativo: form.get("ativo") === "true" })
    .eq("id", texto(form, "id"));
  if (error) console.error("alternarServico falhou:", error.code);
  revalidatePath("/servicos");
}

export async function alternarCategoria(form: FormData) {
  const ctx = await exigirDono();
  if (!ctx) return;
  const { error } = await ctx.supabase
    .from("categorias_servico")
    .update({ ativo: form.get("ativo") === "true" })
    .eq("id", texto(form, "id"));
  if (error) console.error("alternarCategoria falhou:", error.code);
  revalidatePath("/servicos");
}
