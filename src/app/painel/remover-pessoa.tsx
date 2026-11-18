"use client";

import { useActionState, useState } from "react";
import { Mensagem } from "@/components/ui";
import { removerPessoa } from "./acoes-equipe";

/** LGPD: apagar de vez o acesso de quem saiu. Só aparece para quem já está sem acesso. Pede confirmação. */
export function RemoverPessoa({ membroId, nome }: { membroId: string; nome: string }) {
  const [aberto, setAberto] = useState(false);
  const [estado, acao, carregando] = useActionState(removerPessoa, undefined);

  if (!aberto) {
    return (
      <button type="button" onClick={() => setAberto(true)} className="shrink-0 rounded-lg px-3 py-1.5 text-xs font-medium text-red-700 ring-1 ring-red-200 hover:bg-red-50">
        Apagar de vez
      </button>
    );
  }

  return (
    <form action={acao} className="mt-2 w-full space-y-3 rounded-xl bg-red-50/50 p-4 ring-1 ring-red-200">
      <input type="hidden" name="membro_id" value={membroId} />
      <p className="text-sm font-semibold text-red-800">Apagar de vez o acesso de {nome}?</p>
      <ul className="list-disc space-y-1 pl-5 text-sm text-stone-700">
        <li>O login (e-mail e senha) será apagado <strong>para sempre</strong>. Para voltar, será preciso adicionar a pessoa de novo.</li>
        <li>O nome continua nas comissões, vales e comprovantes, porque são registros de pagamento do salão.</li>
        <li>Use quando a pessoa saiu do salão e pediu para ter os dados apagados.</li>
      </ul>
      {estado?.erro && <Mensagem tipo="erro">{estado.erro}</Mensagem>}
      <label className="flex items-start gap-2 text-sm text-stone-800">
        <input type="checkbox" name="confirmo" value="sim" required className="mt-1 h-4 w-4" />
        Entendi que o acesso será apagado para sempre.
      </label>
      <div className="flex flex-wrap gap-2">
        <button disabled={carregando} className="rounded-lg bg-red-700 px-4 py-2 text-sm font-semibold text-white hover:bg-red-800 disabled:opacity-60">
          {carregando ? "Apagando..." : "Apagar acesso"}
        </button>
        <button type="button" onClick={() => setAberto(false)} className="rounded-lg px-4 py-2 text-sm font-medium text-stone-700 ring-1 ring-stone-300 hover:bg-stone-50">
          Cancelar
        </button>
      </div>
    </form>
  );
}
