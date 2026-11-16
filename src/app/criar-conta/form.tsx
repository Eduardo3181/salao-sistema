"use client";

import Link from "next/link";
import { useActionState } from "react";
import { criarConta } from "@/app/acoes";
import { Botao, Campo, Mensagem } from "@/components/ui";

export default function FormCriarConta() {
  const [estado, acao, carregando] = useActionState(criarConta, undefined);

  if (estado?.aviso) {
    return (
      <div className="space-y-4">
        <Mensagem tipo="aviso">{estado.aviso}</Mensagem>
        <Link href="/entrar" className="block text-center text-sm font-semibold text-rose-700 hover:underline">
          Ir para a tela de entrar
        </Link>
      </div>
    );
  }

  return (
    <form action={acao} className="space-y-4">
      {estado?.erro && <Mensagem tipo="erro">{estado.erro}</Mensagem>}
      <Campo rotulo="E-mail" name="email" type="email" autoComplete="email" required defaultValue={estado?.email} />
      <Campo rotulo="Senha (mínimo 8 caracteres)" name="senha" type="password" autoComplete="new-password" minLength={8} required />
      <Campo rotulo="Repita a senha" name="confirmacao" type="password" autoComplete="new-password" minLength={8} required />
      <Botao type="submit" carregando={carregando}>Criar conta</Botao>
      <p className="text-center text-sm text-stone-600">
        Já tem conta?{" "}
        <Link href="/entrar" className="font-semibold text-rose-700 hover:underline">Entrar</Link>
      </p>
    </form>
  );
}
