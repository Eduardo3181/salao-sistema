"use server";

import { revalidatePath } from "next/cache";
import { reaisParaCentavos } from "@/lib/dinheiro";
import type { FormaDespesa } from "@/lib/despesas";
import { exigirSalao } from "@/lib/sessao";

type Resposta = { ok: true } | { ok: false; erro: string };

const FORMAS: FormaDespesa[] = ["dinheiro", "pix", "transferencia", "boleto", "cartao", "debito_automatico", "outro"];
const dataOk = (d: string) => /^\d{4}-\d{2}-\d{2}$/.test(d);

async function chamar(nome: string, args: Record<string, unknown>, padrao: string): Promise<Resposta> {
  const { supabase, ehDono } = await exigirSalao();
  if (!ehDono) return { ok: false, erro: "Só o dono mexe em despesas." };
  const { error } = await supabase.rpc(nome, args);
  if (error) {
    console.error(`${nome} falhou:`, error.code);
    return { ok: false, erro: error.code === "42501" || error.code === "22023" ? error.message : padrao };
  }
  revalidatePath("/despesas");
  revalidatePath("/caixa");
  revalidatePath("/painel");
  return { ok: true };
}

export async function criarDespesa(d: {
  categoriaId: string;
  descricao: string;
  valor: string;
  vencimento: string;
  paga: boolean;
  pagoEm: string;
  forma: FormaDespesa;
  observacao: string;
}): Promise<Resposta> {
  const valor = reaisParaCentavos(d.valor);
  if (valor === null || valor < 1) return { ok: false, erro: "Valor inválido. Exemplos: 120 ou 89,90." };
  if (!dataOk(d.vencimento)) return { ok: false, erro: "Informe o vencimento." };
  if (d.paga && (!dataOk(d.pagoEm) || !FORMAS.includes(d.forma))) return { ok: false, erro: "Informe a data e a forma do pagamento." };
  const { salao } = await exigirSalao();
  return chamar(
    "criar_despesa",
    {
      p_salao_id: salao.salaoId,
      p_categoria_id: d.categoriaId,
      p_descricao: d.descricao.slice(0, 120),
      p_valor: valor,
      p_vencimento: d.vencimento,
      p_pago_em: d.paga ? d.pagoEm : null,
      p_forma: d.paga ? d.forma : null,
      p_observacao: d.observacao.slice(0, 200) || null,
    },
    "Não foi possível salvar. Tente de novo.",
  );
}

export async function pagarDespesa(despesaId: string, pagoEm: string, forma: FormaDespesa): Promise<Resposta> {
  if (!dataOk(pagoEm) || !FORMAS.includes(forma)) return { ok: false, erro: "Informe a data e a forma do pagamento." };
  return chamar("pagar_despesa", { p_despesa_id: despesaId, p_pago_em: pagoEm, p_forma: forma }, "Não foi possível marcar como paga. Tente de novo.");
}

export async function desfazerPagamento(despesaId: string, motivo: string): Promise<Resposta> {
  return chamar("desfazer_pagamento_despesa", { p_despesa_id: despesaId, p_motivo: motivo.slice(0, 200) }, "Não foi possível desfazer. Tente de novo.");
}

export async function cancelarDespesa(despesaId: string, motivo: string): Promise<Resposta> {
  return chamar("cancelar_despesa", { p_despesa_id: despesaId, p_motivo: motivo.slice(0, 200) }, "Não foi possível cancelar. Tente de novo.");
}

export async function criarDespesaFixa(d: { categoriaId: string; descricao: string; valor: string; dia: string; inicio: string }): Promise<Resposta> {
  const valor = reaisParaCentavos(d.valor);
  if (valor === null || valor < 1) return { ok: false, erro: "Valor inválido. Exemplos: 1500 ou 99,90." };
  const dia = Number(d.dia);
  if (!Number.isInteger(dia) || dia < 1 || dia > 31) return { ok: false, erro: "O dia do vencimento vai de 1 a 31." };
  if (!/^\d{4}-\d{2}$/.test(d.inicio)) return { ok: false, erro: "Escolha o mês de início." };
  const { salao } = await exigirSalao();
  return chamar(
    "criar_despesa_fixa",
    { p_salao_id: salao.salaoId, p_categoria_id: d.categoriaId, p_descricao: d.descricao.slice(0, 120), p_valor: valor, p_dia: dia, p_inicio: `${d.inicio}-01` },
    "Não foi possível salvar. Tente de novo.",
  );
}

export async function encerrarDespesaFixa(fixaId: string): Promise<Resposta> {
  return chamar("encerrar_despesa_fixa", { p_fixa_id: fixaId }, "Não foi possível encerrar. Tente de novo.");
}

export async function criarCategoria(nome: string): Promise<Resposta> {
  const { salao } = await exigirSalao();
  return chamar("criar_categoria_despesa", { p_salao_id: salao.salaoId, p_nome: nome.slice(0, 60) }, "Não foi possível criar. Tente de novo.");
}

export async function ativarCategoria(categoriaId: string, ativo: boolean): Promise<Resposta> {
  return chamar("ativar_categoria_despesa", { p_categoria_id: categoriaId, p_ativo: ativo }, "Não foi possível salvar. Tente de novo.");
}
