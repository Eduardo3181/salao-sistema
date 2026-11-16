import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { Suspense } from "react";
import { Cabecalho } from "@/components/cabecalho";
import { Mensagem } from "@/components/ui";
import { buscarCliente, buscarConfiguracao, podeEditarClientes, podeVerClientes, podeVerTelefone } from "@/lib/clientes";
import { exigirSalao } from "@/lib/sessao";
import { formatarTelefone, hojeEmBrasilia, linkWhatsApp } from "@/lib/telefone-data";
import { alternarCliente } from "../acoes";
import FormCliente from "../form-cliente";

export const metadata: Metadata = { title: "Cliente | Sistema do Salão" };

export default function PaginaCliente({ params, searchParams }: PageProps<"/clientes/[id]">) {
  return (
    <Suspense fallback={<p className="p-6 text-sm text-stone-500">Carregando...</p>}>
      <Ficha params={params} searchParams={searchParams} />
    </Suspense>
  );
}

const cartao = "rounded-2xl bg-white p-6 shadow-sm ring-1 ring-stone-200";

async function Ficha({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const [{ id }, sp] = await Promise.all([params, searchParams]);
  const { supabase, salao } = await exigirSalao();
  if (!podeVerClientes(salao.perfil)) redirect("/painel");
  const veTelefone = podeVerTelefone(salao.perfil);
  const [cliente, config] = await Promise.all([
    buscarCliente(supabase, salao.salaoId, id),
    buscarConfiguracao(supabase, salao.salaoId),
  ]);
  if (!cliente) notFound();
  const pode = podeEditarClientes(salao.perfil, config.profissionaisEditamClientes);
  const whats = linkWhatsApp(cliente.telefone);

  return (
    <div className="flex flex-1 flex-col bg-stone-100">
      <Cabecalho salao={salao} atual="/clientes" />

      <main className="mx-auto w-full max-w-3xl flex-1 space-y-6 px-4 py-6">
        <Link href="/clientes" className="text-sm font-medium text-stone-600 hover:underline">
          ‹ Voltar para clientes
        </Link>

        <section className={cartao}>
          <div className="flex items-start justify-between gap-3">
            <h1 className={`text-xl font-semibold ${cliente.ativo ? "text-stone-900" : "text-stone-400 line-through"}`}>
              {cliente.nome}
            </h1>
            {whats && (
              <a
                href={whats}
                target="_blank"
                rel="noopener noreferrer"
                className="shrink-0 rounded-lg px-3 py-1.5 text-xs font-semibold text-emerald-800 ring-1 ring-emerald-300 hover:bg-emerald-50"
              >
                WhatsApp
              </a>
            )}
          </div>
          {!cliente.ativo && <p className="mt-1 text-sm text-stone-500">Cliente desativada.</p>}
          {sp.salvo === "1" && (
            <div className="mt-3">
              <Mensagem tipo="aviso">Alterações salvas.</Mensagem>
            </div>
          )}

          {pode ? (
            <div className="mt-5">
              <FormCliente cliente={cliente} hoje={hojeEmBrasilia()} veTelefone={veTelefone} />
            </div>
          ) : (
            <dl className="mt-4 space-y-3 text-sm">
              {veTelefone && (
                <div>
                  <dt className="text-stone-500">Telefone</dt>
                  <dd className="text-stone-900">{formatarTelefone(cliente.telefone) || "—"}</dd>
                </div>
              )}
              <div>
                <dt className="text-stone-500">Nascimento</dt>
                <dd className="text-stone-900">
                  {cliente.nascimento ? cliente.nascimento.split("-").reverse().join("/") : "—"}
                </dd>
              </div>
              <div>
                <dt className="text-stone-500">Observações</dt>
                <dd className="whitespace-pre-wrap text-stone-900">{cliente.observacoes || "—"}</dd>
              </div>
            </dl>
          )}
        </section>

        {pode && (
          <form action={alternarCliente} className="text-center">
            <input type="hidden" name="id" value={cliente.id} />
            <input type="hidden" name="ativo" value={cliente.ativo ? "false" : "true"} />
            <button className="rounded-lg px-4 py-2 text-sm font-medium text-stone-700 ring-1 ring-stone-300 hover:bg-white">
              {cliente.ativo ? "Desativar cliente" : "Reativar cliente"}
            </button>
            <p className="mt-2 text-xs text-stone-500">
              Desativar esconde a cliente da lista, sem apagar o histórico.
            </p>
          </form>
        )}
      </main>
    </div>
  );
}
