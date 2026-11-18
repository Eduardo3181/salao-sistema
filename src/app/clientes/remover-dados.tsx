"use client";

import { useActionState, useState } from "react";
import { Mensagem } from "@/components/ui";
import { removerDadosCliente } from "./acoes";

/** LGPD: apagar os dados pessoais de um cliente (só aparece para o dono). Pede confirmação. */
export function RemoverDadosCliente({ clienteId, nome }: { clienteId: string; nome: string }) {
  const [aberto, setAberto] = useState(false);
  const [estado, acao, carregando] = useActionState(removerDadosCliente, undefined);

  if (!aberto) {
    return (
      <div className="text-center">
        <button type="button" onClick={() => setAberto(true)} className="text-sm font-medium text-red-700 hover:underline">
          Apagar dados pessoais (pedido do cliente)
        </button>
      </div>
    );
  }

  return (
    <form action={acao} className="space-y-3 rounded-2xl bg-white p-5 shadow-sm ring-1 ring-red-200">
      <input type="hidden" name="id" value={clienteId} />
      <h2 className="font-semibold text-red-800">Apagar os dados de {nome}?</h2>
      <ul className="list-disc space-y-1 pl-5 text-sm text-stone-700">
        <li>Nome, telefone, aniversário e observações serão apagados <strong>para sempre</strong>. Não tem como desfazer.</li>
        <li>Os atendimentos e valores continuam, com o nome &ldquo;Cliente removido&rdquo;, para o caixa, os relatórios e as comissões não mudarem.</li>
        <li>Use só quando o próprio cliente pedir. Para apenas esconder da lista, use &ldquo;Desativar cliente&rdquo;.</li>
      </ul>
      {estado?.erro && <Mensagem tipo="erro">{estado.erro}</Mensagem>}
      <label className="flex items-start gap-2 text-sm text-stone-800">
        <input type="checkbox" name="confirmo" value="sim" required className="mt-1 h-4 w-4" />
        Entendi que os dados serão apagados para sempre.
      </label>
      <div className="flex flex-wrap gap-2">
        <button disabled={carregando} className="rounded-lg bg-red-700 px-4 py-2 text-sm font-semibold text-white hover:bg-red-800 disabled:opacity-60">
          {carregando ? "Apagando..." : "Apagar dados"}
        </button>
        <button type="button" onClick={() => setAberto(false)} className="rounded-lg px-4 py-2 text-sm font-medium text-stone-700 ring-1 ring-stone-300 hover:bg-stone-50">
          Cancelar
        </button>
      </div>
    </form>
  );
}
