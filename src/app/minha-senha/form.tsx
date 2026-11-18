"use client";

import { useActionState } from "react";
import { Botao, Campo, Mensagem } from "@/components/ui";
import { alterarMinhaSenha } from "./acoes";

export function FormMinhaSenha() {
  const [estado, acao, carregando] = useActionState(alterarMinhaSenha, undefined);

  if (estado?.concluido) {
    return (
      <Mensagem tipo="aviso">
        Senha trocada! Use a nova senha da próxima vez que entrar. Se você estava conectado em outro celular ou computador, lá vai pedir para entrar de novo.
      </Mensagem>
    );
  }

  return (
    <form action={acao} className="space-y-4">
      {estado?.erro && <Mensagem tipo="erro">{estado.erro}</Mensagem>}
      <Campo rotulo="Senha atual" name="atual" type="password" autoComplete="current-password" required />
      <Campo rotulo="Nova senha (mínimo 8 caracteres)" name="senha" type="password" autoComplete="new-password" minLength={8} maxLength={72} required />
      <Campo rotulo="Repita a nova senha" name="confirmacao" type="password" autoComplete="new-password" minLength={8} maxLength={72} required />
      <Botao type="submit" carregando={carregando}>Trocar senha</Botao>
    </form>
  );
}
