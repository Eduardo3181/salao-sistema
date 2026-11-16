"use client";

import { useActionState, useState } from "react";
import { Botao, Campo, Mensagem } from "@/components/ui";
import { adicionarPessoa } from "./acoes-equipe";

export default function FormEquipe() {
  const [estado, acao, carregando] = useActionState(adicionarPessoa, undefined);
  const [dispensado, setDispensado] = useState<typeof estado>(undefined); // aviso que já foi fechado

  if (estado?.sucesso && estado !== dispensado) {
    const s = estado.sucesso;
    return (
      <div className="space-y-3 rounded-xl bg-emerald-50 p-4 ring-1 ring-emerald-200">
        <p className="font-semibold text-emerald-900">
          {s.nome} foi adicionado(a) como {s.perfil}.
        </p>
        {s.senha ? (
          <>
            <p className="text-sm text-emerald-900">
              Passe estes dados para a pessoa. <strong>A senha aparece só agora</strong>; ela será obrigada a trocar no
              primeiro acesso.
            </p>
            <dl className="rounded-lg bg-white p-3 text-sm ring-1 ring-emerald-200">
              <dt className="text-stone-500">Endereço</dt>
              <dd className="mb-2 break-all font-medium text-stone-900">{typeof window !== "undefined" ? window.location.origin : ""}</dd>
              <dt className="text-stone-500">E-mail</dt>
              <dd className="mb-2 break-all font-medium text-stone-900">{s.email}</dd>
              <dt className="text-stone-500">Senha provisória</dt>
              <dd className="font-mono text-lg font-semibold tracking-wide text-stone-900">{s.senha}</dd>
            </dl>
          </>
        ) : (
          <p className="text-sm text-emerald-900">
            Essa pessoa já tinha conta no sistema. Ela entra com o e-mail e a senha que já usa.
          </p>
        )}
        <button
          type="button"
          onClick={() => setDispensado(estado)}
          className="text-sm font-semibold text-emerald-800 hover:underline"
        >
          Já anotei. Adicionar outra pessoa
        </button>
      </div>
    );
  }

  return (
    <form key={JSON.stringify(estado?.valores ?? {})} action={acao} className="space-y-3">
      {estado?.erro && estado !== dispensado && <Mensagem tipo="erro">{estado.erro}</Mensagem>}
      <Campo rotulo="Nome" name="nome" required minLength={2} maxLength={120} autoComplete="off" defaultValue={estado?.valores?.nome} />
      <Campo rotulo="E-mail" name="email" type="email" required autoComplete="off" defaultValue={estado?.valores?.email} />
      <label className="block">
        <span className="text-sm font-medium text-stone-700">Perfil</span>
        <select
          name="perfil"
          required
          defaultValue={estado?.valores?.perfil ?? ""}
          className="mt-1 block w-full rounded-lg border border-stone-300 bg-white px-3 py-2.5 text-base text-stone-900 outline-none focus:border-rose-600 focus:ring-2 focus:ring-rose-200"
        >
          <option value="" disabled>Escolha...</option>
          <option value="recepcao">Recepção</option>
          <option value="profissional">Profissional</option>
        </select>
      </label>
      <Botao type="submit" carregando={carregando}>Adicionar à equipe</Botao>
    </form>
  );
}
