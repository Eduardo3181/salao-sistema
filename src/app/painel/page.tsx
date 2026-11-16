import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { Suspense } from "react";
import { sair } from "@/app/acoes";
import {
  buscarMeuSalao,
  dataHoraBrasil,
  descreverAuditoria,
  NOME_PERFIL,
  type MembroEquipe,
  type RegistroAuditoria,
} from "@/lib/salao";
import { usuarioLogado } from "@/lib/supabase/server";
import { mudarAcesso } from "./acoes-equipe";
import FormEquipe from "./form-equipe";

export const metadata: Metadata = { title: "Painel | Sistema do Salão" };

export default function PaginaPainel() {
  return (
    <Suspense fallback={<p className="p-6 text-sm text-stone-500">Carregando...</p>}>
      <Painel />
    </Suspense>
  );
}

const cartao = "rounded-2xl bg-white p-6 shadow-sm ring-1 ring-stone-200";

async function Painel() {
  const { supabase, userId } = await usuarioLogado();
  if (!userId) redirect("/auth/sair");

  const salao = await buscarMeuSalao(supabase, userId);
  if (!salao) redirect("/novo-salao");
  if (salao.trocarSenha) redirect("/trocar-senha");

  const ehDono = salao.perfil === "dono";

  // Só o dono enxerga equipe e auditoria (o banco garante isso; aqui só evitamos a consulta).
  const [{ data: auditoria }, { data: equipe }] = ehDono
    ? await Promise.all([
        supabase
          .from("audit_log")
          .select("id, user_id, acao, entidade, antes, depois, em")
          .eq("salao_id", salao.salaoId)
          .order("em", { ascending: false })
          .limit(30),
        supabase.rpc("equipe_do_salao", { p_salao_id: salao.salaoId }),
      ])
    : [{ data: null }, { data: null }];

  const membros = (equipe ?? []) as MembroEquipe[];
  const nomePorUsuario = new Map(membros.map((m) => [m.user_id, m.nome ?? m.email]));
  const autor = (id: string | null) =>
    id === userId ? "por você" : id && nomePorUsuario.get(id) ? `por ${nomePorUsuario.get(id)}` : "pelo sistema";

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
        <section className={cartao}>
          <h1 className="text-xl font-semibold text-stone-900">Bem-vindo(a)!</h1>
          <p className="mt-2 text-stone-600">
            Agenda, comanda, comissões e caixa vão aparecer aqui nas próximas etapas.
          </p>
        </section>

        {ehDono && (
          <section className={cartao}>
            <h2 className="font-semibold text-stone-900">Equipe</h2>
            <p className="mt-1 text-sm text-stone-500">Quem tem acesso ao sistema do salão.</p>

            <ul className="mt-4 divide-y divide-stone-100">
              {membros.map((m) => (
                <li key={m.id} className="flex items-center justify-between gap-3 py-3">
                  <div className="min-w-0">
                    <p className={`truncate text-sm font-medium ${m.ativo ? "text-stone-900" : "text-stone-400 line-through"}`}>
                      {m.nome ?? (m.user_id === userId ? "Você" : m.email)}
                    </p>
                    <p className="truncate text-xs text-stone-500">
                      {NOME_PERFIL[m.perfil]} · {m.email}
                      {!m.ativo && " · sem acesso"}
                      {m.ativo && m.trocar_senha && " · ainda não entrou"}
                    </p>
                  </div>
                  {m.perfil !== "dono" && (
                    <form action={mudarAcesso}>
                      <input type="hidden" name="membro_id" value={m.id} />
                      <input type="hidden" name="ativo" value={m.ativo ? "false" : "true"} />
                      <button className="shrink-0 rounded-lg px-3 py-1.5 text-xs font-medium text-stone-700 ring-1 ring-stone-300 hover:bg-stone-50">
                        {m.ativo ? "Tirar acesso" : "Devolver acesso"}
                      </button>
                    </form>
                  )}
                </li>
              ))}
            </ul>

            <div className="mt-6 border-t border-stone-100 pt-5">
              <h3 className="mb-3 text-sm font-semibold text-stone-900">Adicionar pessoa</h3>
              <FormEquipe />
            </div>
          </section>
        )}

        {auditoria && (
          <section className={cartao}>
            <h2 className="font-semibold text-stone-900">Registro de atividades</h2>
            <p className="mt-1 text-sm text-stone-500">Quem fez o quê no salão. Só o(a) dono(a) vê esta lista.</p>
            <ul className="mt-4 divide-y divide-stone-100">
              {(auditoria as RegistroAuditoria[]).map((r) => (
                <li key={r.id} className="flex flex-col gap-0.5 py-3 sm:flex-row sm:justify-between sm:gap-4">
                  <span className="text-sm text-stone-800">{descreverAuditoria(r)}</span>
                  <span className="shrink-0 text-xs text-stone-500">
                    {dataHoraBrasil(r.em)} · {autor(r.user_id)}
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
