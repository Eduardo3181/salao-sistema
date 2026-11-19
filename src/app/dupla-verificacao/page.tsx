import type { Metadata } from "next";
import { ShieldCheck } from "lucide-react";
import { Suspense } from "react";
import { Cabecalho } from "@/components/cabecalho";
import { aplicativoConfirmado } from "@/lib/dupla";
import { dataHoraBrasil } from "@/lib/salao";
import { exigirSalao } from "@/lib/sessao";
import { DesligarDupla, LigarDupla } from "./forms";

export const metadata: Metadata = { title: "Dupla verificação | Sistema do Salão" };

export default function PaginaDupla() {
  return (
    <Suspense fallback={<p className="p-6 text-sm text-stone-500">Carregando...</p>}>
      <Dupla />
    </Suspense>
  );
}

async function Dupla() {
  const { supabase, salao } = await exigirSalao();
  const app = await aplicativoConfirmado(supabase);
  return (
    <div className="flex flex-1 flex-col bg-stone-100 pb-20 md:pb-0 md:pl-56">
      <Cabecalho salao={salao} atual="/minha-senha" />
      <main className="mx-auto w-full max-w-md flex-1 space-y-4 px-4 py-6">
        <div>
          <h1 className="text-xl font-semibold text-stone-900">Dupla verificação</h1>
          <p className="text-sm text-stone-500">
            Além da senha, o sistema pede um código de 6 números que aparece num aplicativo do seu celular e muda a cada 30
            segundos. Assim, mesmo que alguém descubra a sua senha, não consegue entrar sem o seu celular.
          </p>
        </div>
        <section className="space-y-4 rounded-2xl bg-white p-5 shadow-sm ring-1 ring-stone-200">
          {app ? (
            <>
              <p className="flex items-center gap-2 font-semibold text-emerald-800">
                <ShieldCheck aria-hidden className="h-5 w-5" /> Ligada desde {dataHoraBrasil(app.criadoEm)}
              </p>
              <p className="text-sm text-stone-600">
                Se trocar de celular, desligue aqui antes e ligue de novo no celular novo. Se perder o celular, fale com o
                suporte do sistema.
              </p>
              <DesligarDupla />
            </>
          ) : (
            <LigarDupla />
          )}
        </section>
      </main>
    </div>
  );
}
