"use client";

import { useActionState } from "react";
import { Botao, Mensagem } from "@/components/ui";
import { salvarTaxas } from "./acoes-taxas";

const campo =
  "block w-full rounded-lg border border-stone-300 bg-white px-3 py-2 text-base text-stone-900 outline-none focus:border-rose-600 focus:ring-2 focus:ring-rose-200";

/** Taxas da maquininha em %. "valores": campo -> "2,99" (vazio = sem taxa). */
export default function FormTaxas({ chaves, valores }: { chaves: { campo: string; rotulo: string }[]; valores: Record<string, string> }) {
  const [estado, acao, carregando] = useActionState(salvarTaxas, undefined);
  const [debito, vista, ...parceladas] = chaves;

  const campoDe = (c: { campo: string; rotulo: string }) => (
    <label key={c.campo} className="block">
      <span className="text-sm text-stone-700">{c.rotulo} (%)</span>
      <input name={c.campo} inputMode="decimal" defaultValue={valores[c.campo] ?? ""} placeholder="0,00" className={`${campo} mt-1`} />
    </label>
  );

  return (
    <form action={acao} className="space-y-4">
      {estado?.erro && <Mensagem tipo="erro">{estado.erro}</Mensagem>}
      {estado?.ok && <Mensagem tipo="aviso">{estado.ok}</Mensagem>}
      <div className="grid grid-cols-2 gap-3">
        {campoDe(debito)}
        {campoDe(vista)}
      </div>
      <details className="rounded-lg ring-1 ring-stone-200" open={parceladas.some((c) => valores[c.campo])}>
        <summary className="cursor-pointer px-3 py-2.5 text-sm font-medium text-stone-800">Crédito parcelado (uma taxa para cada número de parcelas)</summary>
        <div className="grid grid-cols-2 gap-3 p-3 sm:grid-cols-3">
          {parceladas.map(campoDe)}
        </div>
      </details>
      <Botao type="submit" carregando={carregando}>Salvar taxas</Botao>
    </form>
  );
}
