"use client";

import { useActionState } from "react";
import { sair } from "@/app/acoes";
import { Botao, Campo, Mensagem } from "@/components/ui";
import { confirmarCodigoEntrada } from "./acoes";

export function FormCodigo() {
  const [estado, acao, carregando] = useActionState(confirmarCodigoEntrada, undefined);
  return (
    <div className="space-y-4">
      <form action={acao} className="space-y-4">
        {estado?.erro && <Mensagem tipo="erro">{estado.erro}</Mensagem>}
        <Campo
          rotulo="Código de 6 números"
          name="codigo"
          inputMode="numeric"
          autoComplete="one-time-code"
          pattern="[0-9 ]*"
          maxLength={7}
          autoFocus
          required
        />
        <Botao type="submit" carregando={carregando}>Confirmar</Botao>
      </form>
      <form action={sair} className="text-center">
        <button className="text-sm font-medium text-stone-600 hover:underline">Sair e entrar com outra conta</button>
      </form>
      <p className="text-center text-xs text-stone-500">
        Perdeu o celular ou apagou o aplicativo? Fale com o suporte do sistema para desligar a dupla verificação da sua conta.
      </p>
    </div>
  );
}
