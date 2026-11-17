import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { Suspense } from "react";
import { Cabecalho } from "@/components/cabecalho";
import { exigirSalao } from "@/lib/sessao";
import { hojeEmBrasilia } from "@/lib/telefone-data";
import Importador from "./importador";

export const metadata: Metadata = { title: "Importar planilha | Sistema do Salão" };

export default function PaginaImportar() {
  return (
    <Suspense fallback={<p className="p-6 text-sm text-stone-500">Carregando...</p>}>
      <Importar />
    </Suspense>
  );
}

async function Importar() {
  const { salao, ehDono } = await exigirSalao();
  if (!ehDono) redirect("/painel");

  return (
    <div className="flex flex-1 flex-col bg-stone-100">
      <Cabecalho salao={salao} atual="/configuracoes" />
      <main className="mx-auto w-full max-w-3xl flex-1 space-y-6 px-4 py-6">
        <div>
          <h1 className="text-xl font-semibold text-stone-900">Importar planilha</h1>
          <p className="mt-1 text-sm text-stone-500">Traga clientes ou serviços de outro sistema ou de uma planilha do Excel.</p>
        </div>
        <Importador hoje={hojeEmBrasilia()} />
      </main>
    </div>
  );
}
