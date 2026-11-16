import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { Suspense } from "react";
import { Cabecalho } from "@/components/cabecalho";
import { formatarDuracao, formatarReais } from "@/lib/dinheiro";
import { buscarCatalogo } from "@/lib/servicos";
import { exigirSalao } from "@/lib/sessao";
import { alternarCategoria, alternarServico } from "./acoes";
import FormCategoria from "./form-categoria";

export const metadata: Metadata = { title: "Serviços | Sistema do Salão" };

export default function PaginaServicos() {
  return (
    <Suspense fallback={<p className="p-6 text-sm text-stone-500">Carregando...</p>}>
      <Servicos />
    </Suspense>
  );
}

const cartao = "rounded-2xl bg-white p-6 shadow-sm ring-1 ring-stone-200";
const botaoPequeno =
  "shrink-0 rounded-lg px-3 py-1.5 text-xs font-medium text-stone-700 ring-1 ring-stone-300 hover:bg-stone-50";

async function Servicos() {
  const { supabase, salao, ehDono } = await exigirSalao();
  if (salao.perfil === "assistente") redirect("/painel");
  const { categorias, servicos } = await buscarCatalogo(supabase, salao.salaoId);

  // Quem não é dono vê só o que está ativo.
  const visiveis = ehDono ? servicos : servicos.filter((s) => s.ativo);
  const grupos = categorias
    .filter((c) => ehDono || c.ativo)
    .map((c) => ({ categoria: c, itens: visiveis.filter((s) => s.categoria_id === c.id) }))
    .filter((g) => ehDono || g.itens.length > 0);

  return (
    <div className="flex flex-1 flex-col bg-stone-100">
      <Cabecalho salao={salao} atual="/servicos" />

      <main className="mx-auto w-full max-w-3xl flex-1 space-y-6 px-4 py-6">
        <div className="flex items-center justify-between gap-4">
          <h1 className="text-xl font-semibold text-stone-900">Serviços</h1>
          {ehDono && categorias.some((c) => c.ativo) && (
            <Link href="/servicos/novo" className="rounded-lg bg-rose-700 px-4 py-2 text-sm font-semibold text-white hover:bg-rose-800">
              + Novo serviço
            </Link>
          )}
        </div>

        {grupos.length === 0 && (
          <section className={cartao}>
            <p className="text-stone-600">
              {ehDono
                ? "Comece criando uma categoria (ex.: Cabelo, Unhas) no fim desta página. Depois cadastre os serviços."
                : "Ainda não há serviços cadastrados."}
            </p>
          </section>
        )}

        {grupos.map(({ categoria, itens }) => (
          <section key={categoria.id} className={cartao}>
            <h2 className={`font-semibold ${categoria.ativo ? "text-stone-900" : "text-stone-400"}`}>
              {categoria.nome}
              {!categoria.ativo && <span className="ml-2 text-xs font-normal">(categoria desativada)</span>}
            </h2>
            {itens.length === 0 ? (
              <p className="mt-2 text-sm text-stone-500">Nenhum serviço nesta categoria.</p>
            ) : (
              <ul className="mt-3 divide-y divide-stone-100">
                {itens.map((s) => (
                  <li key={s.id} className="flex items-center justify-between gap-3 py-3">
                    <div className="min-w-0">
                      <p className={`truncate text-sm font-medium ${s.ativo ? "text-stone-900" : "text-stone-400 line-through"}`}>
                        {s.nome}
                      </p>
                      <p className="text-xs text-stone-500">
                        {formatarDuracao(s.duracao_min)} · {formatarReais(s.preco_centavos)}
                        {!s.ativo && " · desativado"}
                      </p>
                    </div>
                    {ehDono && (
                      <div className="flex shrink-0 gap-2">
                        <Link href={`/servicos/${s.id}`} className={botaoPequeno}>
                          Editar
                        </Link>
                        <form action={alternarServico}>
                          <input type="hidden" name="id" value={s.id} />
                          <input type="hidden" name="ativo" value={s.ativo ? "false" : "true"} />
                          <button className={botaoPequeno}>{s.ativo ? "Desativar" : "Reativar"}</button>
                        </form>
                      </div>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </section>
        ))}

        {ehDono && (
          <section className={cartao}>
            <h2 className="font-semibold text-stone-900">Categorias</h2>
            <p className="mt-1 text-sm text-stone-500">Agrupam os serviços. Desativar esconde a categoria da equipe.</p>
            {categorias.length > 0 && (
              <ul className="mt-3 divide-y divide-stone-100">
                {categorias.map((c) => (
                  <li key={c.id} className="flex items-center justify-between gap-3 py-2.5">
                    <span className={`text-sm ${c.ativo ? "text-stone-900" : "text-stone-400 line-through"}`}>{c.nome}</span>
                    <form action={alternarCategoria}>
                      <input type="hidden" name="id" value={c.id} />
                      <input type="hidden" name="ativo" value={c.ativo ? "false" : "true"} />
                      <button className={botaoPequeno}>{c.ativo ? "Desativar" : "Reativar"}</button>
                    </form>
                  </li>
                ))}
              </ul>
            )}
            <div className="mt-4 border-t border-stone-100 pt-4">
              <FormCategoria />
            </div>
          </section>
        )}
      </main>
    </div>
  );
}
