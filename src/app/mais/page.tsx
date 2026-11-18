import { ChevronRight, KeyRound, LogOut } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { sair } from "@/app/acoes";
import { Cabecalho, itensDoMenu } from "@/components/cabecalho";
import { exigirSalao } from "@/lib/sessao";

export const metadata: Metadata = { title: "Menu | Sistema do Salão" };

export default function PaginaMais() {
  return (
    <Suspense fallback={<p className="p-6 text-sm text-stone-500">Carregando...</p>}>
      <Mais />
    </Suspense>
  );
}

/** "Mais" do celular: todas as áreas do sistema e o botão Sair. */
async function Mais() {
  const { salao } = await exigirSalao();
  return (
    <div className="flex flex-1 flex-col bg-stone-100 pb-20 md:pb-0 md:pl-56">
      <Cabecalho salao={salao} atual="/mais" />
      <main className="mx-auto w-full max-w-3xl flex-1 space-y-4 px-4 py-6">
        <h1 className="text-xl font-semibold text-stone-900">Menu</h1>
        <ul className="divide-y divide-stone-100 overflow-hidden rounded-2xl bg-white shadow-sm ring-1 ring-stone-200">
          {itensDoMenu(salao.perfil).map(({ href, rotulo, Icone }) => (
            <li key={href}>
              <Link href={href} className="flex items-center gap-3 px-4 py-4 text-base text-stone-800 hover:bg-stone-50">
                <Icone aria-hidden className="h-5 w-5 text-stone-500" strokeWidth={1.75} />
                <span className="flex-1">{rotulo}</span>
                <ChevronRight aria-hidden className="h-4 w-4 text-stone-400" />
              </Link>
            </li>
          ))}
        </ul>
        <Link href="/minha-senha" className="flex items-center gap-3 rounded-2xl bg-white px-4 py-4 text-base text-stone-800 shadow-sm ring-1 ring-stone-200 hover:bg-stone-50">
          <KeyRound aria-hidden className="h-5 w-5 text-stone-500" strokeWidth={1.75} />
          <span className="flex-1">Minha senha</span>
          <ChevronRight aria-hidden className="h-4 w-4 text-stone-400" />
        </Link>
        <form action={sair}>
          <button className="flex w-full items-center justify-center gap-2 rounded-2xl bg-white px-4 py-4 text-base font-medium text-stone-700 shadow-sm ring-1 ring-stone-200 hover:bg-stone-50">
            <LogOut aria-hidden className="h-5 w-5" strokeWidth={1.75} />
            Sair
          </button>
        </form>
      </main>
    </div>
  );
}
