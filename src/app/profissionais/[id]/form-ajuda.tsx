"use client";

import { useActionState } from "react";
import { Botao, Mensagem } from "@/components/ui";
import { salvarAjudaAssistente } from "../acoes";

/** Caixinhas com as profissionais; as marcadas são as que a assistente ajuda. */
export default function FormAjuda({
  assistenteId,
  profissionais,
  marcadas,
}: {
  assistenteId: string;
  profissionais: { id: string; nome: string }[];
  marcadas: string[];
}) {
  const [estado, acao, carregando] = useActionState(salvarAjudaAssistente, undefined);

  if (profissionais.length === 0)
    return <p className="text-sm text-stone-500">Cadastre primeiro os profissionais em Quem atende.</p>;

  return (
    <form action={acao} className="space-y-4">
      {estado?.erro && <Mensagem tipo="erro">{estado.erro}</Mensagem>}
      {estado?.ok && <Mensagem tipo="aviso">{estado.ok}</Mensagem>}
      <input type="hidden" name="assistente_id" value={assistenteId} />
      <fieldset className="space-y-2">
        <legend className="sr-only">Profissionais que ela ajuda</legend>
        {profissionais.map((p) => (
          <label key={p.id} className="flex items-center gap-3 rounded-lg px-3 py-2.5 text-base text-stone-800 ring-1 ring-stone-200 hover:bg-stone-50">
            <input type="checkbox" name="profissional_id" value={p.id} defaultChecked={marcadas.includes(p.id)} className="h-5 w-5 accent-rose-700" />
            {p.nome}
          </label>
        ))}
      </fieldset>
      <Botao type="submit" carregando={carregando}>Salvar quem ela ajuda</Botao>
    </form>
  );
}
