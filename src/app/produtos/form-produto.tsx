"use client";

import Link from "next/link";
import { useActionState } from "react";
import { Botao, Campo, Mensagem } from "@/components/ui";
import { centavosParaTexto } from "@/lib/dinheiro";
import type { Produto } from "@/lib/produtos";
import { salvarProduto } from "./acoes";

export default function FormProduto({ produto }: { produto?: Produto }) {
  const [estado, acao, carregando] = useActionState(salvarProduto, undefined);
  // Depois de um erro, reaproveita o que a pessoa tinha digitado.
  const v = estado?.valores;

  return (
    <form key={JSON.stringify(v ?? {})} action={acao} className="space-y-4">
      {estado?.erro && <Mensagem tipo="erro">{estado.erro}</Mensagem>}
      {produto && <input type="hidden" name="id" value={produto.id} />}

      <Campo rotulo="Nome do produto" name="nome" required minLength={2} maxLength={120} defaultValue={v?.nome ?? produto?.nome} placeholder="Ex.: Shampoo hidratante 300 ml" />

      <div className="grid grid-cols-2 gap-3">
        <Campo
          rotulo="Preço de venda (R$)"
          name="preco"
          inputMode="decimal"
          required
          placeholder="45,00"
          defaultValue={v?.preco ?? (produto ? centavosParaTexto(produto.preco_centavos) : "")}
        />
        <Campo
          rotulo="Custo (R$, opcional)"
          name="custo"
          inputMode="decimal"
          placeholder="20,00"
          defaultValue={v?.custo ?? (produto?.custo_centavos != null ? centavosParaTexto(produto.custo_centavos) : "")}
        />
      </div>
      <p className="text-xs text-stone-500">O custo é quanto o salão pagou. Só você (dono) vê esse valor.</p>

      <Botao type="submit" carregando={carregando}>{produto ? "Salvar alterações" : "Cadastrar produto"}</Botao>
      <Link href="/produtos" className="block text-center text-sm font-semibold text-stone-600 hover:underline">
        Cancelar
      </Link>
    </form>
  );
}
