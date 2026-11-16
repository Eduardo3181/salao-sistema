import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { Suspense } from "react";
import { sair } from "@/app/acoes";
import {
  buscarMeuSalao,
  dataHoraBrasil,
  descreverAuditoria,
  NOME_PERFIL,
  type RegistroAuditoria,
} from "@/lib/salao";
import { usuarioLogado } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Painel | Sistema do Salão" };

export default function PaginaPainel() {
  return (
    <Suspense fallback={<p className="p-6 text-sm text-stone-500">Carregando...</p>}>
      <Painel />
    </Suspense>
  );
}

async function Painel() {
  const { supabase, userId } = await usuarioLogado();
  if (!userId) redirect("/auth/sair");

  const salao = await buscarMeuSalao(supabase, userId);
  if (!salao) redirect("/novo-salao");

  // Só o dono enxerga a auditoria (a RLS do banco garante isso).
  const { data: auditoria } =
    salao.perfil === "dono"
      ? await supabase
          .from("audit_log")
          .select("id, user_id, acao, entidade, antes, depois, em")
          .eq("salao_id", salao.salaoId)
          .order("em", { ascending: false })
          .limit(20)
      : { data: null };

  return (
    <div className="flex flex-1 flex-col bg-stone-100">
      <header className="border-b border-stone-200 bg-white">
        <div className="mx-auto flex max-w-3xl items-center justify-between gap-4 px-4 py-3">
          <div className="min-w-0">
            <p className="truncate font-semibold text-stone-900">{salao.nome}</p>
            <p className="text-xs text-stone-500">{NOME_PERFIL[salao.perfil]}</p>
          </div>
          <form action={sair}>
            <button className="rounded-lg px-3 py-2 text-sm font-medium text-stone-700 ring-1 ring-stone-300 hover:bg-stone-50">
              Sair
            </button>
          </form>
        </div>
      </header>

      <main className="mx-auto w-full max-w-3xl flex-1 space-y-6 px-4 py-6">
        <section className="rounded-2xl bg-white p-6 shadow-sm ring-1 ring-stone-200">
          <h1 className="text-xl font-semibold text-stone-900">Bem-vindo(a)!</h1>
          <p className="mt-2 text-stone-600">
            O seu salão está cadastrado. Agenda, comanda, comissões e caixa vão aparecer aqui nas próximas etapas.
          </p>
        </section>

        {auditoria && (
          <section className="rounded-2xl bg-white p-6 shadow-sm ring-1 ring-stone-200">
            <h2 className="font-semibold text-stone-900">Registro de atividades</h2>
            <p className="mt-1 text-sm text-stone-500">Quem fez o quê no salão. Só o(a) dono(a) vê esta lista.</p>
            <ul className="mt-4 divide-y divide-stone-100">
              {(auditoria as RegistroAuditoria[]).map((r) => (
                <li key={r.id} className="flex flex-col gap-0.5 py-3 sm:flex-row sm:justify-between sm:gap-4">
                  <span className="text-sm text-stone-800">{descreverAuditoria(r)}</span>
                  <span className="shrink-0 text-xs text-stone-500">
                    {dataHoraBrasil(r.em)} · {r.user_id === userId ? "por você" : "por outra pessoa"}
                  </span>
                </li>
              ))}
            </ul>
          </section>
        )}
      </main>
    </div>
  );
}
