import type { Metadata } from "next";
import { ShieldCheck } from "lucide-react";
import Link from "next/link";
import { Suspense } from "react";
import { Cabecalho } from "@/components/cabecalho";
import { exigirSalao } from "@/lib/sessao";
import { FormMinhaSenha } from "./form";

export const metadata: Metadata = { title: "Minha senha | Sistema do Salão" };

export default function PaginaMinhaSenha() {
  return (
    <Suspense fallback={<p className="p-6 text-sm text-stone-500">Carregando...</p>}>
      <MinhaSenha />
    </Suspense>
  );
}

async function MinhaSenha() {
  const { salao } = await exigirSalao();
  return (
    <div className="flex flex-1 flex-col bg-stone-100 pb-20 md:pb-0 md:pl-56">
      <Cabecalho salao={salao} atual="/minha-senha" />
      <main className="mx-auto w-full max-w-md flex-1 space-y-4 px-4 py-6">
        <div>
          <h1 className="text-xl font-semibold text-stone-900">Minha senha</h1>
          <p className="text-sm text-stone-500">
            Troque a sua senha quando quiser. Por segurança, pedimos a senha atual, e os outros aparelhos onde você estiver conectado vão pedir para entrar de novo.
          </p>
        </div>
        <section className="rounded-2xl bg-white p-5 shadow-sm ring-1 ring-stone-200">
          <FormMinhaSenha />
        </section>
        <Link
          href="/dupla-verificacao"
          className="flex items-center gap-3 rounded-2xl bg-white p-5 shadow-sm ring-1 ring-stone-200 hover:bg-stone-50"
        >
          <ShieldCheck aria-hidden className="h-5 w-5 shrink-0 text-rose-700" />
          <span className="min-w-0">
            <span className="block font-semibold text-stone-900">Dupla verificação</span>
            <span className="block text-sm text-stone-600">Além da senha, um código do celular. Recomendado para o dono.</span>
          </span>
        </Link>
      </main>
    </div>
  );
}
