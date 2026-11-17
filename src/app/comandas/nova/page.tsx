import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { Suspense } from "react";
import { Cabecalho } from "@/components/cabecalho";
import { buscarConfiguracao, podeEditarClientes } from "@/lib/clientes";
import { exigirSalao } from "@/lib/sessao";
import Nova from "./nova";

export const metadata: Metadata = { title: "Nova comanda | Sistema do Salão" };

export default function PaginaNovaComanda() {
  return (
    <Suspense fallback={<p className="p-6 text-sm text-stone-500">Carregando...</p>}>
      <Conteudo />
    </Suspense>
  );
}

async function Conteudo() {
  const { supabase, salao } = await exigirSalao();
  if (salao.perfil === "assistente") redirect("/painel");
  const config = await buscarConfiguracao(supabase, salao.salaoId);

  return (
    <div className="flex flex-1 flex-col bg-stone-100 pb-20 md:pb-0 md:pl-56">
      <Cabecalho salao={salao} atual="/comandas" />
      <main className="mx-auto w-full max-w-2xl flex-1 space-y-4 px-4 py-5">
        <Link href="/comandas" className="text-sm font-medium text-stone-600 hover:underline">
          ‹ Voltar para as comandas
        </Link>
        <section className="space-y-4 rounded-2xl bg-white p-5 shadow-sm ring-1 ring-stone-200">
          <div>
            <h1 className="text-xl font-semibold text-stone-900">Nova comanda</h1>
            <p className="text-sm text-stone-500">Para quem veio sem horário ou só vai levar produto. Escolha a cliente.</p>
          </div>
          <Nova podeCadastrar={podeEditarClientes(salao.perfil, config.profissionaisEditamClientes)} />
        </section>
      </main>
    </div>
  );
}
