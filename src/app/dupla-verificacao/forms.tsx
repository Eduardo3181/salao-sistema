"use client";

import { useActionState } from "react";
import { Botao, Campo, Mensagem } from "@/components/ui";
import { confirmarDupla, desligarDupla, iniciarDupla } from "./acoes";

const campoCodigo = {
  name: "codigo",
  inputMode: "numeric" as const,
  autoComplete: "one-time-code",
  pattern: "[0-9 ]*",
  maxLength: 7,
  required: true,
};

export function LigarDupla() {
  const [inicio, comecar, gerando] = useActionState(iniciarDupla, undefined);
  const [estado, confirmar, conferindo] = useActionState(confirmarDupla, undefined);

  if (estado?.concluido) {
    return (
      <Mensagem tipo="aviso">
        Dupla verificação ligada! Da próxima vez que entrar, depois da senha, o sistema vai pedir o código do aplicativo.
      </Mensagem>
    );
  }

  if (!inicio?.qr) {
    return (
      <form action={comecar} className="space-y-4">
        {inicio?.erro && <Mensagem tipo="erro">{inicio.erro}</Mensagem>}
        <ol className="list-decimal space-y-1 pl-5 text-sm text-stone-700">
          <li>
            Instale no celular um aplicativo de verificação. Exemplos gratuitos: Google Authenticator ou Microsoft
            Authenticator (na Play Store ou App Store).
          </li>
          <li>Clique em Começar: vai aparecer um quadrado (QR code) para o aplicativo ler.</li>
          <li>Digite aqui o código de 6 números que o aplicativo mostrar.</li>
        </ol>
        <Botao type="submit" carregando={gerando}>Começar</Botao>
      </form>
    );
  }

  return (
    <form action={confirmar} className="space-y-4">
      <p className="text-sm text-stone-700">
        No aplicativo, toque em <strong>+</strong> (adicionar) e escolha <strong>ler QR code</strong>. Aponte a câmera para o quadrado abaixo.
      </p>
      {/* eslint-disable-next-line @next/next/no-img-element -- imagem gerada na hora pelo Supabase */}
      <img
        src={inicio.qr}
        alt="QR code para o aplicativo de verificação"
        width={200}
        height={200}
        className="mx-auto rounded-lg bg-white p-2 ring-1 ring-stone-200"
      />
      <details className="text-sm text-stone-600">
        <summary className="cursor-pointer">Não consegue ler o QR code? Digite a chave no aplicativo</summary>
        <p className="mt-2 break-all rounded-lg bg-stone-50 p-3 font-mono text-xs text-stone-800">{inicio.segredo}</p>
      </details>
      {estado?.erro && <Mensagem tipo="erro">{estado.erro}</Mensagem>}
      <input type="hidden" name="factor_id" value={inicio.factorId} />
      <Campo rotulo="Código de 6 números que aparece no aplicativo" {...campoCodigo} />
      <Botao type="submit" carregando={conferindo}>Confirmar e ligar</Botao>
    </form>
  );
}

export function DesligarDupla() {
  const [estado, acao, carregando] = useActionState(desligarDupla, undefined);
  if (estado?.concluido) {
    return <Mensagem tipo="aviso">Dupla verificação desligada. Da próxima vez, o sistema vai pedir só a senha.</Mensagem>;
  }
  return (
    <details className="text-sm">
      <summary className="cursor-pointer font-medium text-stone-700">Desligar a dupla verificação</summary>
      <form action={acao} className="mt-3 space-y-3">
        <p className="text-stone-600">Sem ela, quem descobrir a sua senha consegue entrar. Para confirmar, digite o código do aplicativo.</p>
        {estado?.erro && <Mensagem tipo="erro">{estado.erro}</Mensagem>}
        <Campo rotulo="Código de 6 números" {...campoCodigo} />
        <button
          type="submit"
          disabled={carregando}
          className="w-full rounded-lg px-4 py-2.5 text-sm font-semibold text-red-700 ring-1 ring-red-300 hover:bg-red-50 disabled:opacity-60"
        >
          {carregando ? "Desligando..." : "Desligar"}
        </button>
      </form>
    </details>
  );
}
