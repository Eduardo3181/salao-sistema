/** Nomes dos meios de pagamento de comissão (os saldos são somados no banco: saldos_comissao_a_pagar). */

export const NOME_MEIO: Record<"pix" | "dinheiro" | "transferencia" | "outro", string> = {
  pix: "Pix",
  dinheiro: "Dinheiro",
  transferencia: "Transferência",
  outro: "Outro",
};

