import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { BotoesBaixar } from "@/components/botoes-baixar";
import { Cabecalho } from "@/components/cabecalho";
import { redirect } from "next/navigation";
import { buscarClientes, buscarConfiguracao, podeEditarClientes, podeVerClientes, podeVerTelefone } from "@/lib/clientes";
import { exigirSalao } from "@/lib/sessao";
import { formatarAniversario, formatarTelefone, hojeEmBrasilia } from "@/lib/telefone-data";
import FormCliente from "./form-cliente";

export const metadata: Metadata = { title: "Clientes | Sistema do Salão" };

export default function PaginaClientes({ searchParams }: PageProps<"/clientes">) {
  return (
    <Suspense fallback={<p className="p-6 text-sm text-stone-500">Carregando...</p>}>
      <Clientes searchParams={searchParams} />
    </Suspense>
  );
}

const cartao = "rounded-2xl bg-white p-6 shadow-sm ring-1 ring-stone-200";

async function Clientes({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const params = await searchParams;
  const busca = typeof params.q === "string" ? params.q : "";
  const verInativas = params.inativas === "1";

  const { supabase, salao } = await exigirSalao();
  if (!podeVerClientes(salao.perfil)) redirect("/painel");
  const veTelefone = podeVerTelefone(salao.perfil);
  const [config, clientes] = await Promise.all([
    buscarConfiguracao(supabase, salao.salaoId),
    buscarClientes(supabase, salao.salaoId, busca, verInativas),
  ]);
  const pode = podeEditarClientes(salao.perfil, config.profissionaisEditamClientes);

  return (
    <div className="flex flex-1 flex-col bg-stone-100 pb-20 md:pb-0 md:pl-56">
      <Cabecalho salao={salao} atual="/clientes" />

      <main className="mx-auto w-full max-w-3xl flex-1 space-y-6 px-4 py-6">
        <div className="flex items-center justify-between gap-4">
          <h1 className="text-xl font-semibold text-stone-900">Clientes</h1>
          <div className="flex flex-wrap justify-end gap-x-4 gap-y-1">
            <Link href="/aniversarios" className="text-sm font-semibold text-rose-700 hover:underline">
              Aniversariantes do mês
            </Link>
            {salao.perfil === "dono" && (
              <Link href="/importar" className="text-sm font-semibold text-rose-700 hover:underline">
                Importar planilha
              </Link>
            )}
          </div>
        </div>

        {pode && (
          <section className={cartao}>
            <FormCliente hoje={hojeEmBrasilia()} veTelefone={veTelefone} />
          </section>
        )}

        <section className={cartao}>
          <form className="flex gap-2" role="search">
            <label className="flex-1">
              <span className="sr-only">Buscar por nome ou telefone</span>
              <input
                name="q"
                type="search"
                defaultValue={busca}
                placeholder={veTelefone ? "Buscar por nome ou telefone" : "Buscar pelo nome"}
                className="block w-full rounded-lg border border-stone-300 bg-white px-3 py-2.5 text-base text-stone-900 outline-none focus:border-rose-600 focus:ring-2 focus:ring-rose-200"
              />
            </label>
            {verInativas && <input type="hidden" name="inativas" value="1" />}
            <button className="shrink-0 rounded-lg px-4 py-2.5 text-sm font-semibold text-stone-700 ring-1 ring-stone-300 hover:bg-stone-50">
              Buscar
            </button>
          </form>

          {clientes.length === 0 ? (
            <p className="mt-4 text-sm text-stone-500">
              {busca ? "Nenhuma cliente encontrada com essa busca." : "Nenhuma cliente cadastrada ainda."}
            </p>
          ) : (
            <ul className="mt-4 divide-y divide-stone-100">
              {clientes.map((c) => (
                <li key={c.id}>
                  <Link href={`/clientes/${c.id}`} className="flex items-center justify-between gap-3 rounded-lg px-2 py-3 hover:bg-stone-50">
                    <div className="min-w-0">
                      <p className={`truncate text-sm font-medium ${c.ativo ? "text-stone-900" : "text-stone-400 line-through"}`}>
                        {c.nome}
                      </p>
                      <p className="truncate text-xs text-stone-500">
                        {[formatarTelefone(c.telefone), c.nascimento && `aniversário ${formatarAniversario(c.nascimento)}`]
                          .filter(Boolean)
                          .join(" · ") || (veTelefone ? "sem telefone" : "")}
                        {!c.ativo && " · desativada"}
                      </p>
                    </div>
                    <span aria-hidden className="text-stone-400">›</span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
          {clientes.length === 100 && (
            <p className="mt-3 text-xs text-stone-500">Mostrando as 100 primeiras. Use a busca para encontrar outras.</p>
          )}
          <p className="mt-4 text-right text-xs">
            <Link
              href={verInativas ? `/clientes${busca ? `?q=${encodeURIComponent(busca)}` : ""}` : `/clientes?inativas=1${busca ? `&q=${encodeURIComponent(busca)}` : ""}`}
              className="font-medium text-stone-500 hover:underline"
            >
              {verInativas ? "Esconder desativadas" : "Mostrar desativadas também"}
            </Link>
          </p>
        </section>

        {salao.perfil === "dono" && (
          <section className={cartao}>
            <h2 className="font-semibold text-stone-900">Baixar todos os clientes</h2>
            <p className="mt-1 text-sm text-stone-700">
              Uma planilha com todos os clientes (ativos e desativados), para guardar uma cópia ou levar para outro sistema.
              Os dados são do salão. As colunas Nome, Telefone, Nascimento e Observações são as mesmas da importação.
            </p>
            <div className="mt-4">
              <BotoesBaixar href="/clientes/baixar" />
            </div>
          </section>
        )}
      </main>
    </div>
  );
}
