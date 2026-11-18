"use server";

import { revalidatePath } from "next/cache";
import { percentualParaCentesimos, reaisParaCentavos } from "@/lib/dinheiro";
import { exigirSalao } from "@/lib/sessao";

/** O que a tela manda (porcentagens e valores como a pessoa digitou). */
export type FormComissoes = {
  padrao: string;
  descontarTaxa: boolean;
  produtos: boolean;
  percentualProdutos: string;
  assistente: null | {
    base: "percentual_comissao" | "percentual_servico" | "valor_fixo";
    valor: string; // % ou R$, conforme a base
    quemPaga: "profissional" | "salao" | "dividido";
    percentualDaProfissional: string;
  };
  porProfissional: Record<string, string>; // vazio = segue o padrão
  porServico: Record<string, string>; // vazio = sem exceção
  porProfissionalServico: { profissionalId: string; servicoId: string; percentual: string }[];
};

type Resposta = { ok: true } | { ok: false; erro: string };

const pct = (texto: string, rotulo: string): number => {
  const v = percentualParaCentesimos(texto);
  if (v === null) throw new Error(`${rotulo}: use uma porcentagem de 0 a 100, por exemplo 50 ou 42,5.`);
  return v;
};

export async function salvarComissoes(f: FormComissoes): Promise<Resposta> {
  const ctx = await exigirSalao();
  if (!ctx.ehDono) return { ok: false, erro: "Só o dono altera as comissões." };
  const salaoId = ctx.salao.salaoId;

  // 1) Ler e conferir o que foi digitado
  let config: Record<string, unknown>;
  const desejadas = new Map<string, { profissional_id: string | null; servico_id: string | null; percentual: number }>();
  try {
    let assistente = { assistente_base: null, assistente_valor: null, assistente_quem_paga: null, assistente_percentual_profissional: null } as Record<
      string,
      unknown
    >;
    if (f.assistente) {
      const a = f.assistente;
      const valor = a.base === "valor_fixo" ? reaisParaCentavos(a.valor) : percentualParaCentesimos(a.valor);
      if (valor === null) throw new Error(a.base === "valor_fixo" ? "Valor da assistente inválido (ex.: 15 ou 15,50)." : "Porcentagem da assistente inválida.");
      assistente = {
        assistente_base: a.base,
        assistente_valor: valor,
        assistente_quem_paga: a.quemPaga,
        assistente_percentual_profissional: a.quemPaga === "dividido" ? pct(a.percentualDaProfissional, "Parte que sai do profissional") : null,
      };
    }
    config = {
      percentual_padrao: pct(f.padrao, "Comissão padrão"),
      descontar_taxa_cartao: f.descontarTaxa,
      comissao_produtos: f.produtos,
      percentual_produtos: f.produtos ? pct(f.percentualProdutos, "Comissão de produtos") : 0,
      ...assistente,
    };
    for (const [id, t] of Object.entries(f.porProfissional))
      if (t.trim()) desejadas.set(`${id}:`, { profissional_id: id, servico_id: null, percentual: pct(t, "Comissão do profissional") });
    for (const [id, t] of Object.entries(f.porServico))
      if (t.trim()) desejadas.set(`:${id}`, { profissional_id: null, servico_id: id, percentual: pct(t, "Comissão do serviço") });
    for (const x of f.porProfissionalServico) {
      if (!x.profissionalId || !x.servicoId) throw new Error("Na exceção por profissional e serviço, escolha os dois.");
      const chave = `${x.profissionalId}:${x.servicoId}`;
      if (desejadas.has(chave)) throw new Error("Há duas exceções para a mesma profissional e o mesmo serviço.");
      desejadas.set(chave, { profissional_id: x.profissionalId, servico_id: x.servicoId, percentual: pct(x.percentual, "Exceção") });
    }
  } catch (e) {
    return { ok: false, erro: (e as Error).message };
  }

  // 2) Configuração do salão (atualiza ou cria; o banco só deixa o dono)
  const atualizado = await ctx.supabase.from("configuracao_comissao").update(config).eq("salao_id", salaoId).select("salao_id");
  const { error: e1 } =
    atualizado.error || (atualizado.data ?? []).length > 0
      ? atualizado
      : await ctx.supabase.from("configuracao_comissao").insert({ salao_id: salaoId, ...config });
  if (e1) {
    console.error("salvarComissoes (config) falhou:", e1.code);
    return { ok: false, erro: e1.code === "23514" ? "Combinação inválida na regra da assistente." : "Não foi possível salvar. Tente de novo." };
  }

  // 3) Exceções: grava só o que mudou (cada mudança vai para o histórico)
  const { data: atuais, error: e2 } = await ctx.supabase
    .from("regras_comissao")
    .select("id, profissional_id, servico_id, percentual")
    .eq("salao_id", salaoId);
  if (e2) {
    console.error("salvarComissoes (ler regras) falhou:", e2.code);
    return { ok: false, erro: "Não foi possível salvar as exceções. Tente de novo." };
  }
  const chaveDe = (r: { profissional_id: string | null; servico_id: string | null }) => `${r.profissional_id ?? ""}:${r.servico_id ?? ""}`;
  for (const r of atuais ?? []) {
    const nova = desejadas.get(chaveDe(r));
    const { error } = !nova
      ? await ctx.supabase.from("regras_comissao").delete().eq("id", r.id)
      : nova.percentual !== r.percentual
        ? await ctx.supabase.from("regras_comissao").update({ percentual: nova.percentual }).eq("id", r.id)
        : { error: null };
    if (error) {
      console.error("salvarComissoes (regra) falhou:", error.code);
      return { ok: false, erro: "Não foi possível salvar todas as exceções. Confira e tente de novo." };
    }
    desejadas.delete(chaveDe(r));
  }
  if (desejadas.size) {
    const { error } = await ctx.supabase.from("regras_comissao").insert([...desejadas.values()].map((r) => ({ salao_id: salaoId, ...r })));
    if (error) {
      console.error("salvarComissoes (novas regras) falhou:", error.code);
      return { ok: false, erro: error.code === "22023" ? error.message : "Não foi possível salvar todas as exceções. Confira e tente de novo." };
    }
  }

  revalidatePath("/configuracoes/comissoes");
  return { ok: true };
}
