"use client";

import Link from "next/link";
import { useActionState } from "react";
import { Botao, Campo, Mensagem } from "@/components/ui";
import { centavosParaTexto } from "@/lib/dinheiro";
import type { Categoria, Servico } from "@/lib/servicos";
import { salvarServico } from "./acoes";

export default function FormServico({ categorias, servico }: { categorias: Categoria[]; servico?: Servico }) {
  const [estado, acao, carregando] = useActionState(salvarServico, undefined);
  // Na edição, mostra também a categoria atual mesmo se estiver desativada.
  // Depois de um erro, reaproveita o que a pessoa tinha digitado.
  const v = estado?.valores;
  const opcoes = categorias.filter((c) => c.ativo || c.id === servico?.categoria_id);

  return (
    <form key={JSON.stringify(v ?? {})} action={acao} className="space-y-4">
      {estado?.erro && <Mensagem tipo="erro">{estado.erro}</Mensagem>}
      {servico && <input type="hidden" name="id" value={servico.id} />}

      <Campo rotulo="Nome do serviço" name="nome" required minLength={2} maxLength={120} defaultValue={v?.nome ?? servico?.nome} placeholder="Ex.: Corte feminino" />

      <label className="block">
        <span className="text-sm font-medium text-stone-700">Categoria</span>
        <select
          name="categoria_id"
          required
          defaultValue={v?.categoria_id ?? servico?.categoria_id ?? ""}
          className="mt-1 block w-full rounded-lg border border-stone-300 bg-white px-3 py-2.5 text-base text-stone-900 outline-none focus:border-rose-600 focus:ring-2 focus:ring-rose-200"
        >
          <option value="" disabled>Escolha...</option>
          {opcoes.map((c) => (
            <option key={c.id} value={c.id}>{c.nome}</option>
          ))}
        </select>
      </label>

      <div className="grid grid-cols-2 gap-3">
        <Campo
          rotulo="Duração (minutos)"
          name="duracao_min"
          type="number"
          inputMode="numeric"
          min={5}
          max={720}
          step={5}
          required
          defaultValue={v?.duracao_min ?? servico?.duracao_min ?? 30}
        />
        <Campo
          rotulo="Preço (R$)"
          name="preco"
          inputMode="decimal"
          required
          placeholder="80,00"
          defaultValue={v?.preco ?? (servico ? centavosParaTexto(servico.preco_centavos) : "")}
        />
      </div>

      <Botao type="submit" carregando={carregando}>{servico ? "Salvar alterações" : "Cadastrar serviço"}</Botao>
      <Link href="/servicos" className="block text-center text-sm font-semibold text-stone-600 hover:underline">
        Cancelar
      </Link>
    </form>
  );
}
