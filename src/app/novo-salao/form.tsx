"use client";

import { useActionState } from "react";
import { cadastrarSalao, sair } from "@/app/acoes";
import { Botao, Campo, Mensagem } from "@/components/ui";

export default function FormNovoSalao() {
  const [estado, acao, carregando] = useActionState(cadastrarSalao, undefined);

  return (
    <form action={acao} className="space-y-4">
      {estado?.erro && <Mensagem tipo="erro">{estado.erro}</Mensagem>}
      <Campo rotulo="Nome do salão" name="nome" required minLength={2} maxLength={120} placeholder="Ex.: Studio Bela Forma" />
      <Botao type="submit" carregando={carregando}>Cadastrar salão</Botao>
      <p className="text-center text-sm text-stone-600">
        Entrou com a conta errada?{" "}
        <button type="submit" formAction={sair} formNoValidate className="font-semibold text-rose-700 hover:underline">
          Sair
        </button>
      </p>
    </form>
  );
}
