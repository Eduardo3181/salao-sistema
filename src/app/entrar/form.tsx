"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useActionState } from "react";
import { entrar } from "@/app/acoes";
import { Botao, Campo, Mensagem } from "@/components/ui";

export default function FormEntrar() {
  const linkInvalido = useSearchParams().get("erro") === "link";
  const [estado, acao, carregando] = useActionState(entrar, undefined);

  return (
    <form action={acao} className="space-y-4">
      {linkInvalido && !estado && (
        <Mensagem tipo="erro">O link de confirmação expirou ou já foi usado. Tente entrar com seu e-mail e senha.</Mensagem>
      )}
      {estado?.erro && <Mensagem tipo="erro">{estado.erro}</Mensagem>}
      <Campo rotulo="E-mail" name="email" type="email" autoComplete="email" required defaultValue={estado?.email} />
      <Campo rotulo="Senha" name="senha" type="password" autoComplete="current-password" required />
      <Botao type="submit" carregando={carregando}>Entrar</Botao>
      <p className="text-center text-sm text-stone-600">
        Ainda não tem conta?{" "}
        <Link href="/criar-conta" className="font-semibold text-rose-700 hover:underline">Criar conta</Link>
      </p>
    </form>
  );
}
