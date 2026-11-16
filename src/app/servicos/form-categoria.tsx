"use client";

import { useActionState } from "react";
import { Mensagem } from "@/components/ui";
import { criarCategoria } from "./acoes";

export default function FormCategoria() {
  const [estado, acao, carregando] = useActionState(criarCategoria, undefined);

  return (
    <form action={acao} className="space-y-3">
      {estado?.erro && <Mensagem tipo="erro">{estado.erro}</Mensagem>}
      {estado?.ok && <Mensagem tipo="aviso">{estado.ok}</Mensagem>}
      <div className="flex gap-2">
        <label className="flex-1">
          <span className="sr-only">Nome da nova categoria</span>
          <input
            name="nome"
            required
            minLength={2}
            maxLength={60}
            placeholder="Nova categoria (ex.: Cabelo)"
            key={estado?.ok} // limpa o campo depois de criar
            className="block w-full rounded-lg border border-stone-300 bg-white px-3 py-2.5 text-base text-stone-900 outline-none focus:border-rose-600 focus:ring-2 focus:ring-rose-200"
          />
        </label>
        <button
          disabled={carregando}
          className="shrink-0 rounded-lg bg-rose-700 px-4 py-2.5 text-sm font-semibold text-white hover:bg-rose-800 disabled:opacity-60"
        >
          {carregando ? "..." : "Criar"}
        </button>
      </div>
    </form>
  );
}
