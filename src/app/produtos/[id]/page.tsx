import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { Suspense } from "react";
import { CartaoAcesso } from "@/components/ui";
import { buscarProdutos } from "@/lib/produtos";
import { exigirSalao } from "@/lib/sessao";
import FormProduto from "../form-produto";

export const metadata: Metadata = { title: "Editar produto | Sistema do Salão" };

export default function PaginaEditarProduto({ params }: PageProps<"/produtos/[id]">) {
  return (
    <CartaoAcesso titulo="Editar produto">
      <Suspense fallback={<p className="text-sm text-stone-500">Carregando...</p>}>
        <Conteudo params={params} />
      </Suspense>
    </CartaoAcesso>
  );
}

async function Conteudo({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { supabase, salao, ehDono } = await exigirSalao();
  if (!ehDono) redirect("/produtos");
  const produto = (await buscarProdutos(supabase, salao.salaoId, true)).find((p) => p.id === id);
  if (!produto) notFound();
  return <FormProduto produto={produto} />;
}
