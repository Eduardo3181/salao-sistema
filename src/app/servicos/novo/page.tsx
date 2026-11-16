import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { Suspense } from "react";
import { CartaoAcesso } from "@/components/ui";
import { buscarCatalogo } from "@/lib/servicos";
import { exigirSalao } from "@/lib/sessao";
import FormServico from "../form-servico";

export const metadata: Metadata = { title: "Novo serviço | Sistema do Salão" };

export default function PaginaNovoServico() {
  return (
    <CartaoAcesso titulo="Novo serviço">
      <Suspense fallback={<p className="text-sm text-stone-500">Carregando...</p>}>
        <Conteudo />
      </Suspense>
    </CartaoAcesso>
  );
}

async function Conteudo() {
  const { supabase, salao, ehDono } = await exigirSalao();
  if (!ehDono) redirect("/servicos");
  const { categorias } = await buscarCatalogo(supabase, salao.salaoId);
  if (!categorias.some((c) => c.ativo)) redirect("/servicos");
  return <FormServico categorias={categorias} />;
}
