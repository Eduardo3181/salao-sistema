import type { Metadata } from "next";
import { CartaoAcesso } from "@/components/ui";
import FormTrocarSenha from "./form";

export const metadata: Metadata = { title: "Criar sua senha | Sistema do Salão" };

export default function PaginaTrocarSenha() {
  return (
    <CartaoAcesso
      titulo="Crie a sua senha"
      subtitulo="Você entrou com uma senha provisória. Escolha agora uma senha só sua."
    >
      <FormTrocarSenha />
    </CartaoAcesso>
  );
}
