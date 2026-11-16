import type { Metadata } from "next";
import { CartaoAcesso } from "@/components/ui";
import FormCriarConta from "./form";

export const metadata: Metadata = { title: "Criar conta | Sistema do Salão" };

export default function PaginaCriarConta() {
  return (
    <CartaoAcesso titulo="Criar conta" subtitulo="Depois de confirmar o e-mail, você cadastra o seu salão.">
      <FormCriarConta />
    </CartaoAcesso>
  );
}
