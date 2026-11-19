import type { Metadata } from "next";
import { CartaoAcesso } from "@/components/ui";
import { FormCodigo } from "./form";

export const metadata: Metadata = { title: "Código de verificação | Sistema do Salão" };

export default function PaginaCodigo() {
  return (
    <CartaoAcesso titulo="Código de verificação" subtitulo="Abra o aplicativo de verificação no seu celular e digite o código do Sistema do Salão.">
      <FormCodigo />
    </CartaoAcesso>
  );
}
