"use server";

import { revalidatePath } from "next/cache";
import { reaisParaCentavos } from "@/lib/dinheiro";
import { exigirSalao } from "@/lib/sessao";

type Resposta = { ok: true } | { ok: false; erro: string };

const erroDoBanco = (code: string | undefined, texto: string, padrao: string) => (code === "42501" || code === "22023" ? texto : padrao);

/** Valor digitado em reais; vazio conta como zero quando `vazioEhZero`. */
function lerValor(texto: string, vazioEhZero: boolean): number | null {
  if (!texto.trim()) return vazioEhZero ? 0 : null;
  return reaisParaCentavos(texto);
}

async function chamar(nome: string, args: Record<string, unknown>, padrao: string): Promise<Resposta> {
  const { supabase } = await exigirSalao();
  const { error } = await supabase.rpc(nome, args);
  if (error) {
    console.error(`${nome} falhou:`, error.code);
    return { ok: false, erro: erroDoBanco(error.code, error.message, padrao) };
  }
  revalidatePath("/caixa");
  revalidatePath("/painel");
  return { ok: true };
}

export async function abrirCaixa(trocoTexto: string): Promise<Resposta> {
  const troco = lerValor(trocoTexto, true);
  if (troco === null) return { ok: false, erro: "Troco inválido. Exemplos: 0, 100 ou 150,50." };
  const { salao } = await exigirSalao();
  return chamar("abrir_caixa", { p_salao_id: salao.salaoId, p_troco: troco }, "Não foi possível abrir o caixa. Tente de novo.");
}

export async function registrarMovimento(tipo: "retirada" | "reforco", valorTexto: string, motivo: string): Promise<Resposta> {
  if (tipo !== "retirada" && tipo !== "reforco") return { ok: false, erro: "Escolha retirada ou reforço." };
  const valor = lerValor(valorTexto, false);
  if (valor === null || valor < 1) return { ok: false, erro: "Valor inválido. Exemplos: 100 ou 150,50." };
  const { salao } = await exigirSalao();
  return chamar(
    "registrar_movimento_caixa",
    { p_salao_id: salao.salaoId, p_tipo: tipo, p_valor: valor, p_motivo: motivo.slice(0, 200) },
    "Não foi possível registrar. Tente de novo.",
  );
}

export async function cancelarMovimento(movimentoId: string, motivo: string): Promise<Resposta> {
  return chamar("cancelar_movimento_caixa", { p_movimento_id: movimentoId, p_motivo: motivo.slice(0, 200) }, "Não foi possível cancelar. Tente de novo.");
}

export async function fecharCaixa(
  caixaId: string,
  contadoTexto: string,
  conferidoPix: boolean,
  conferidoCartao: boolean,
  motivo: string,
): Promise<Resposta> {
  const contado = lerValor(contadoTexto, false);
  if (contado === null) return { ok: false, erro: "Informe quanto dinheiro foi contado (pode ser 0)." };
  return chamar(
    "fechar_caixa",
    { p_caixa_id: caixaId, p_contado: contado, p_conferido_pix: conferidoPix, p_conferido_cartao: conferidoCartao, p_motivo: motivo.slice(0, 200) || null },
    "Não foi possível fechar o caixa. Tente de novo.",
  );
}

export async function reabrirCaixa(caixaId: string, motivo: string): Promise<Resposta> {
  const { ehDono } = await exigirSalao();
  if (!ehDono) return { ok: false, erro: "Só o dono reabre o caixa." };
  return chamar("reabrir_caixa", { p_caixa_id: caixaId, p_motivo: motivo.slice(0, 200) }, "Não foi possível reabrir. Tente de novo.");
}
