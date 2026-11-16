import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { Suspense } from "react";
import { CartaoAcesso } from "@/components/ui";
import { buscarProfissionais, opcoesDeVinculo } from "@/lib/profissionais";
import type { MembroEquipe } from "@/lib/salao";
import { exigirSalao } from "@/lib/sessao";
import FormProfissional from "../form-profissional";

export const metadata: Metadata = { title: "Editar quem atende | Sistema do Salão" };

export default function PaginaEditarProfissional({ params }: PageProps<"/profissionais/[id]">) {
  return (
    <CartaoAcesso titulo="Editar quem atende">
      <Suspense fallback={<p className="text-sm text-stone-500">Carregando...</p>}>
        <Conteudo params={params} />
      </Suspense>
    </CartaoAcesso>
  );
}

async function Conteudo({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { supabase, userId, salao, ehDono } = await exigirSalao();
  if (!ehDono) redirect("/profissionais");

  const [profissionais, equipe] = await Promise.all([
    buscarProfissionais(supabase, salao.salaoId),
    supabase.rpc("equipe_do_salao", { p_salao_id: salao.salaoId }).then((r) => (r.data ?? []) as MembroEquipe[]),
  ]);
  const profissional = profissionais.find((p) => p.id === id);
  if (!profissional) notFound();

  return <FormProfissional profissional={profissional} vinculos={opcoesDeVinculo(equipe, profissionais, userId, id)} />;
}
