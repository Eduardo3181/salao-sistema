import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { Suspense } from "react";
import { Cabecalho } from "@/components/cabecalho";
import { hojeBrasilia } from "@/lib/agenda";
import { podeVerClientes, podeVerTelefone } from "@/lib/clientes";
import { exigirSalao } from "@/lib/sessao";
import { formatarTelefone, linkWhatsApp } from "@/lib/telefone-data";

export const metadata: Metadata = { title: "Aniversariantes | Sistema do Salão" };

const MESES = ["janeiro", "fevereiro", "março", "abril", "maio", "junho", "julho", "agosto", "setembro", "outubro", "novembro", "dezembro"];

export default function PaginaAniversarios({ searchParams }: PageProps<"/aniversarios">) {
  return (
    <Suspense fallback={<p className="p-6 text-sm text-stone-500">Carregando...</p>}>
      <Aniversarios searchParams={searchParams} />
    </Suspense>
  );
}

type Aniversariante = { id: string; nome: string; dia: number; telefone: string | null; aceitou_whatsapp: boolean | null };

async function Aniversarios({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const sp = await searchParams;
  const { supabase, salao } = await exigirSalao();
  if (!podeVerClientes(salao.perfil)) redirect("/painel");
  const veTelefone = podeVerTelefone(salao.perfil);

  const hoje = hojeBrasilia();
  const mesAtual = Number(hoje.slice(5, 7));
  const pedido = Number(typeof sp.mes === "string" ? sp.mes : NaN);
  const mes = Number.isInteger(pedido) && pedido >= 1 && pedido <= 12 ? pedido : mesAtual;
  const anterior = mes === 1 ? 12 : mes - 1;
  const proximo = mes === 12 ? 1 : mes + 1;

  const { data, error } = await supabase.rpc("aniversariantes_do_mes", { p_salao_id: salao.salaoId, p_mes: mes });
  if (error) console.error("aniversariantes falhou:", error.code);
  const pessoas = (data ?? []) as Aniversariante[];
  const diaHoje = mes === mesAtual ? Number(hoje.slice(8, 10)) : null;

  return (
    <div className="flex flex-1 flex-col bg-stone-100 pb-20 md:pb-0 md:pl-56">
      <Cabecalho salao={salao} atual="/clientes" />
      <main className="mx-auto w-full max-w-3xl flex-1 space-y-6 px-4 py-6">
        <Link href="/clientes" className="text-sm font-medium text-stone-600 hover:underline">
          ‹ Voltar para clientes
        </Link>

        <div className="flex items-center justify-between gap-3">
          <h1 className="text-xl font-semibold text-stone-900">Aniversariantes de {MESES[mes - 1]}</h1>
          <div className="flex gap-2">
            <Link href={`/aniversarios?mes=${anterior}`} aria-label="Mês anterior" className="rounded-lg px-3 py-2 text-sm ring-1 ring-stone-300 hover:bg-white">‹</Link>
            {mes !== mesAtual && (
              <Link href="/aniversarios" className="rounded-lg px-3 py-2 text-sm ring-1 ring-stone-300 hover:bg-white">Este mês</Link>
            )}
            <Link href={`/aniversarios?mes=${proximo}`} aria-label="Próximo mês" className="rounded-lg px-3 py-2 text-sm ring-1 ring-stone-300 hover:bg-white">›</Link>
          </div>
        </div>

        <section className="rounded-2xl bg-white p-6 shadow-sm ring-1 ring-stone-200">
          {pessoas.length === 0 ? (
            <p className="text-stone-600">
              Ninguém faz aniversário em {MESES[mes - 1]}. A data de nascimento é preenchida na ficha de cada cliente.
            </p>
          ) : (
            <ul className="divide-y divide-stone-100">
              {pessoas.map((p) => {
                const whats = veTelefone ? linkWhatsApp(p.telefone) : null;
                const ehHoje = diaHoje === p.dia;
                return (
                  <li key={p.id} className="flex items-center justify-between gap-3 py-3">
                    <div className="flex min-w-0 items-center gap-3">
                      <span
                        className={`flex h-10 w-10 shrink-0 flex-col items-center justify-center rounded-lg text-sm font-semibold ${
                          ehHoje ? "bg-rose-700 text-white" : "bg-rose-50 text-rose-800"
                        }`}
                      >
                        {String(p.dia).padStart(2, "0")}
                      </span>
                      <div className="min-w-0">
                        <Link href={`/clientes/${p.id}`} className="block truncate text-sm font-medium text-stone-900 hover:underline">
                          {p.nome}
                          {ehHoje && <span className="ml-2 text-xs font-semibold text-rose-700">hoje</span>}
                        </Link>
                        {veTelefone && (
                          <p className="truncate text-xs text-stone-500">
                            {formatarTelefone(p.telefone) || "sem telefone"}
                            {p.aceitou_whatsapp === true && " · aceita WhatsApp"}
                            {p.aceitou_whatsapp === false && " · não aceita WhatsApp"}
                          </p>
                        )}
                      </div>
                    </div>
                    {whats && p.aceitou_whatsapp !== false && (
                      <a
                        href={whats}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="shrink-0 rounded-lg px-3 py-1.5 text-xs font-semibold text-emerald-800 ring-1 ring-emerald-300 hover:bg-emerald-50"
                      >
                        WhatsApp
                      </a>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </section>
        <p className="text-xs text-stone-500">Mostramos só o dia, sem o ano, para não expor a idade de ninguém.</p>
      </main>
    </div>
  );
}
