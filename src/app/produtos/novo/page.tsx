import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { Suspense } from "react";
import { CartaoAcesso } from "@/components/ui";
import { exigirSalao } from "@/lib/sessao";
import FormProduto from "../form-produto";

export const metadata: Metadata = { title: "Novo produto | Sistema do Salão" };

export default function PaginaNovoProduto() {
  return (
    <CartaoAcesso titulo="Novo produto">
      <Suspense fallback={<p className="text-sm text-stone-500">Carregando...</p>}>
        <Conteudo />
      </Suspense>
    </CartaoAcesso>
  );
}

async function Conteudo() {
  const { ehDono } = await exigirSalao();
  if (!ehDono) redirect("/produtos");
  return <FormProduto />;
}
