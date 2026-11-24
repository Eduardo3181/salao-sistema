import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { Suspense } from "react";
import { sair } from "@/app/acoes";
import { CartaoAcesso } from "@/components/ui";
import { buscarMeuSalao } from "@/lib/salao";
import { usuarioLogado } from "@/lib/supabase/server";
import FormNovoSalao from "./form";

export const metadata: Metadata = { title: "Cadastrar salão | Sistema do Salão" };

export default function PaginaNovoSalao() {
  return (
    <Suspense fallback={<p className="p-6 text-sm text-stone-500">Carregando...</p>}>
      <Conteudo />
    </Suspense>
  );
}

async function Conteudo() {
  const { supabase, userId } = await usuarioLogado();
  if (!userId) redirect("/auth/sair");
  if (await buscarMeuSalao(supabase, userId)) redirect("/painel");

  // Quem perdeu o acesso a um salão vê um aviso, em vez de cair direto no cadastro de salão novo.
  const { data } = await supabase.rpc("acessos_retirados");
  const saloes = ((data ?? []) as { salao: string }[]).map((s) => s.salao);

  if (saloes.length === 0) {
    return (
      <CartaoAcesso titulo="Cadastre o seu salão" subtitulo="Você será o(a) dono(a) e poderá convidar a equipe depois.">
        <FormNovoSalao />
      </CartaoAcesso>
    );
  }

  const nomes = saloes.map((s) => `"${s}"`).join(", ");
  return (
    <CartaoAcesso titulo="Seu acesso foi retirado">
      <div className="space-y-4">
        <p className="text-sm text-stone-700">
          O dono do salão {nomes} retirou o seu acesso ao sistema. Se você acha que foi engano, fale com o dono do salão: ele pode
          devolver o acesso no Painel, em Equipe.
        </p>
        <form action={sair}>
          <button className="w-full rounded-lg bg-rose-700 px-4 py-2.5 text-sm font-semibold text-white hover:bg-rose-800">Sair</button>
        </form>
        <details className="text-sm text-stone-600">
          <summary className="cursor-pointer font-medium">Quero cadastrar o meu próprio salão</summary>
          <div className="mt-4">
            <FormNovoSalao />
          </div>
        </details>
      </div>
    </CartaoAcesso>
  );
}
