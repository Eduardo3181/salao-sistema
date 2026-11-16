import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { Cabecalho } from "@/components/cabecalho";
import { buscarProfissionais, NOME_TIPO, opcoesDeVinculo, type Profissional } from "@/lib/profissionais";
import type { MembroEquipe } from "@/lib/salao";
import { exigirSalao } from "@/lib/sessao";
import { alternarProfissional } from "./acoes";
import FormProfissional from "./form-profissional";

export const metadata: Metadata = { title: "Quem atende | Sistema do Salão" };

export default function PaginaProfissionais() {
  return (
    <Suspense fallback={<p className="p-6 text-sm text-stone-500">Carregando...</p>}>
      <Profissionais />
    </Suspense>
  );
}

const cartao = "rounded-2xl bg-white p-6 shadow-sm ring-1 ring-stone-200";
const botaoPequeno =
  "shrink-0 rounded-lg px-3 py-1.5 text-xs font-medium text-stone-700 ring-1 ring-stone-300 hover:bg-stone-50";

async function Profissionais() {
  const { supabase, userId, salao, ehDono } = await exigirSalao();
  const [profissionais, equipe] = await Promise.all([
    buscarProfissionais(supabase, salao.salaoId),
    ehDono
      ? supabase.rpc("equipe_do_salao", { p_salao_id: salao.salaoId }).then((r) => (r.data ?? []) as MembroEquipe[])
      : Promise.resolve([] as MembroEquipe[]),
  ]);

  const visiveis = ehDono ? profissionais : profissionais.filter((p) => p.ativo);
  const grupos: { titulo: string; itens: Profissional[] }[] = [
    { titulo: "Profissionais", itens: visiveis.filter((p) => p.tipo === "profissional") },
    { titulo: "Assistentes", itens: visiveis.filter((p) => p.tipo === "assistente") },
  ];
  const nomeDaConta = new Map(equipe.map((m) => [m.user_id, m.nome ?? m.email]));

  return (
    <div className="flex flex-1 flex-col bg-stone-100">
      <Cabecalho salao={salao} atual="/profissionais" />

      <main className="mx-auto w-full max-w-3xl flex-1 space-y-6 px-4 py-6">
        <div>
          <h1 className="text-xl font-semibold text-stone-900">Quem atende</h1>
          <p className="mt-1 text-sm text-stone-500">
            Profissionais e assistentes que aparecem na agenda e nas comissões. Não precisam de e-mail nem de acesso ao
            sistema.
          </p>
        </div>

        {ehDono && (
          <section className={cartao}>
            <FormProfissional vinculos={opcoesDeVinculo(equipe, profissionais, userId)} />
          </section>
        )}

        {visiveis.length === 0 ? (
          <section className={cartao}>
            <p className="text-stone-600">
              {ehDono
                ? "Ninguém cadastrado ainda. Se você também atende, cadastre-se e escolha \"Eu\" na ligação com a conta."
                : "Ninguém cadastrado ainda."}
            </p>
          </section>
        ) : (
          grupos
            .filter((g) => g.itens.length > 0)
            .map((g) => (
              <section key={g.titulo} className={cartao}>
                <h2 className="font-semibold text-stone-900">{g.titulo}</h2>
                <ul className="mt-3 divide-y divide-stone-100">
                  {g.itens.map((p) => (
                    <li key={p.id} className="flex items-center justify-between gap-3 py-3">
                      <div className="min-w-0">
                        <p className={`truncate text-sm font-medium ${p.ativo ? "text-stone-900" : "text-stone-400 line-through"}`}>
                          {p.nome}
                        </p>
                        <p className="truncate text-xs text-stone-500">
                          {NOME_TIPO[p.tipo]}
                          {p.user_id === userId
                            ? " · é você"
                            : p.user_id && nomeDaConta.get(p.user_id) && ` · ligada à conta de ${nomeDaConta.get(p.user_id)}`}
                          {!p.ativo && " · desativada"}
                        </p>
                      </div>
                      {ehDono && (
                        <div className="flex shrink-0 gap-2">
                          <Link href={`/profissionais/${p.id}`} className={botaoPequeno}>
                            Editar
                          </Link>
                          <form action={alternarProfissional}>
                            <input type="hidden" name="id" value={p.id} />
                            <input type="hidden" name="ativo" value={p.ativo ? "false" : "true"} />
                            <button className={botaoPequeno}>{p.ativo ? "Desativar" : "Reativar"}</button>
                          </form>
                        </div>
                      )}
                    </li>
                  ))}
                </ul>
              </section>
            ))
        )}
      </main>
    </div>
  );
}
