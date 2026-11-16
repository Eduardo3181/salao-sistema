import type { Metadata } from "next";
import { Suspense } from "react";
import { CartaoAcesso } from "@/components/ui";
import FormEntrar from "./form";

export const metadata: Metadata = { title: "Entrar | Sistema do Salão" };

export default function PaginaEntrar() {
  return (
    <CartaoAcesso titulo="Entrar" subtitulo="Use o e-mail e a senha da sua conta.">
      <Suspense>
        <FormEntrar />
      </Suspense>
    </CartaoAcesso>
  );
}
