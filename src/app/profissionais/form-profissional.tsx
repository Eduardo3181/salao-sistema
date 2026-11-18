"use client";

import Link from "next/link";
import { useActionState, useState } from "react";
import { Botao, Campo, Mensagem } from "@/components/ui";
import type { Profissional } from "@/lib/profissionais";
import { salvarProfissional } from "./acoes";

type Opcao = { valor: string; rotulo: string };

const estiloSelect =
  "mt-1 block w-full rounded-lg border border-stone-300 bg-white px-3 py-2.5 text-base text-stone-900 outline-none focus:border-rose-600 focus:ring-2 focus:ring-rose-200";

/**
 * Formulário de quem atende.
 * Sem "profissional": é cadastro novo e fica fechado atrás de um botão.
 * Com "profissional": é edição e já aparece aberto.
 */
export default function FormProfissional({ vinculos, profissional }: { vinculos: Opcao[]; profissional?: Profissional }) {
  const [estado, acao, carregando] = useActionState(salvarProfissional, undefined);
  const [aberto, setAberto] = useState(Boolean(profissional));
  const v = estado?.valores;

  if (!aberto) {
    return (
      <div className="space-y-3">
        {estado?.ok && <Mensagem tipo="aviso">{estado.ok}</Mensagem>}
        <button
          type="button"
          onClick={() => setAberto(true)}
          className="rounded-lg bg-rose-700 px-4 py-2 text-sm font-semibold text-white hover:bg-rose-800"
        >
          + Cadastrar quem atende
        </button>
      </div>
    );
  }

  return (
    <form key={JSON.stringify(v ?? estado?.ok ?? {})} action={acao} className="space-y-4">
      {estado?.erro && <Mensagem tipo="erro">{estado.erro}</Mensagem>}
      {estado?.ok && <Mensagem tipo="aviso">{estado.ok} Pode cadastrar a próxima.</Mensagem>}
      {profissional && <input type="hidden" name="id" value={profissional.id} />}

      <Campo rotulo="Nome" name="nome" required minLength={2} maxLength={80} defaultValue={v?.nome ?? profissional?.nome} placeholder="Ex.: Ana" />

      <label className="block">
        <span className="text-sm font-medium text-stone-700">Tipo</span>
        <select name="tipo" required defaultValue={v?.tipo ?? profissional?.tipo ?? "profissional"} className={estiloSelect}>
          <option value="profissional">Profissional</option>
          <option value="assistente">Assistente</option>
        </select>
      </label>

      <label className="block">
        <span className="text-sm font-medium text-stone-700">Ligar a uma conta do sistema (opcional)</span>
        <select name="user_id" defaultValue={v?.user_id ?? profissional?.user_id ?? ""} className={estiloSelect}>
          <option value="">Ninguém (só atende, sem acesso)</option>
          {vinculos.map((o) => (
            <option key={o.valor} value={o.valor}>{o.rotulo}</option>
          ))}
        </select>
        <span className="mt-1 block text-xs text-stone-500">
          Escolha &quot;Eu&quot; se você também atende. Para o profissional usar o app, dê acesso a ele em Equipe e ligue aqui.
        </span>
      </label>

      <Botao type="submit" carregando={carregando}>{profissional ? "Salvar alterações" : "Cadastrar"}</Botao>
      {profissional ? (
        <Link href="/profissionais" className="block text-center text-sm font-semibold text-stone-600 hover:underline">
          Cancelar
        </Link>
      ) : (
        <button type="button" onClick={() => setAberto(false)} className="block w-full text-center text-sm font-semibold text-stone-600 hover:underline">
          Fechar
        </button>
      )}
    </form>
  );
}
