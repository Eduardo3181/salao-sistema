"use client";

import { useActionState, useEffect } from "react";
import { trocarSenha } from "@/app/acoes";
import { Botao, Campo, Mensagem } from "@/components/ui";

export default function FormTrocarSenha() {
  const [estado, acao, carregando] = useActionState(trocarSenha, undefined);

  // Senha trocada: recarrega a página inteira no painel (sem cópia antiga guardada).
  useEffect(() => {
    // Recarga completa de propósito: router.push reaproveitava uma cópia antiga do painel
    // (que ainda mandava trocar a senha) e a pessoa ficava presa nesta tela.
    // eslint-disable-next-line @next/next/no-location-assign-relative-destination
    if (estado?.concluido) window.location.assign("/painel");
  }, [estado]);

  if (estado?.concluido) {
    return <Mensagem tipo="aviso">Senha salva! Abrindo o painel...</Mensagem>;
  }

  return (
    <form action={acao} className="space-y-4">
      {estado?.erro && <Mensagem tipo="erro">{estado.erro}</Mensagem>}
      <Campo rotulo="Nova senha (mínimo 8 caracteres)" name="senha" type="password" autoComplete="new-password" minLength={8} required />
      <Campo rotulo="Repita a nova senha" name="confirmacao" type="password" autoComplete="new-password" minLength={8} required />
      <Botao type="submit" carregando={carregando}>Salvar senha</Botao>
    </form>
  );
}
