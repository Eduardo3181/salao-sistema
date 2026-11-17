"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { reaisParaCentavos } from "@/lib/dinheiro";
import { exigirSalao } from "@/lib/sessao";

export type EstadoProduto = { erro?: string; valores?: Record<string, string> } | undefined;

const texto = (f: FormData, c: string) => String(f.get(c) ?? "").trim();

export async function salvarProduto(_: EstadoProduto, form: FormData): Promise<EstadoProduto> {
  const r = await salvarProdutoInterno(form);
  // Em caso de erro, devolve o que foi digitado para o formulário não perder nada.
  return r?.erro ? { ...r, valores: Object.fromEntries([...form.entries()].map(([k, v]) => [k, String(v)])) } : r;
}

async function salvarProdutoInterno(form: FormData): Promise<EstadoProduto> {
  const ctx = await exigirSalao();
  if (!ctx.ehDono) return { erro: "Só o dono pode cadastrar e alterar produtos." };

  const id = texto(form, "id");
  const nome = texto(form, "nome");
  const preco = reaisParaCentavos(texto(form, "preco"));
  const custoTexto = texto(form, "custo");
  const custo = custoTexto ? reaisParaCentavos(custoTexto) : null;

  if (nome.length < 2 || nome.length > 120) return { erro: "O nome do produto deve ter entre 2 e 120 letras." };
  if (preco === null) return { erro: "Preço inválido. Exemplos: 45 ou 45,90." };
  if (preco > 100_000_000) return { erro: "Preço alto demais." };
  if (custoTexto && custo === null) return { erro: "Custo inválido. Exemplos: 20 ou 19,90. Pode deixar em branco." };
  if (custo !== null && custo > 100_000_000) return { erro: "Custo alto demais." };

  const dados = { nome, preco_centavos: preco, custo_centavos: custo };
  const { error } = id
    ? await ctx.supabase.from("produtos").update(dados).eq("id", id)
    : await ctx.supabase.from("produtos").insert({ ...dados, salao_id: ctx.salao.salaoId });

  if (error) {
    if (error.code === "23505") return { erro: "Já existe um produto com esse nome." };
    console.error("salvarProduto falhou:", error.code);
    return { erro: "Não foi possível salvar. Tente de novo." };
  }
  revalidatePath("/produtos");
  redirect("/produtos");
}

export async function alternarProduto(form: FormData) {
  const ctx = await exigirSalao();
  if (!ctx.ehDono) return;
  const { error } = await ctx.supabase
    .from("produtos")
    .update({ ativo: form.get("ativo") === "true" })
    .eq("id", texto(form, "id"));
  if (error) console.error("alternarProduto falhou:", error.code);
  revalidatePath("/produtos");
}
