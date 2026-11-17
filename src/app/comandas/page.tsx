import { ChevronRight, Plus } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { Suspense } from "react";
import { Cabecalho } from "@/components/cabecalho";
import { hojeBrasilia, inicioDoDia } from "@/lib/agenda";
import { quandoBrasilia } from "@/lib/comandas";
import { formatarReais } from "@/lib/dinheiro";
import { exigirSalao } from "@/lib/sessao";

export const metadata: Metadata = { title: "Comandas | Sistema do Salão" };

export default function PaginaComandas({ searchParams }: PageProps<"/comandas">) {
  return (
    <Suspense fallback={<p className="p-6 text-sm text-stone-500">Carregando...</p>}>
      <Comandas searchParams={searchParams} />
    </Suspense>
  );
}

type Linha = {
  id: string;
  situacao: "aberta" | "fechada" | "cancelada";
  aberta_em: string;
  fechada_em: string | null;
  desconto_centavos: number;
  clientes: { nome: string } | null;
  comanda_itens: { total_centavos: number; removido_em: string | null; profissionais: { nome: string } | null }[];
};

async function Comandas({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const sp = await searchParams;
  const { supabase, salao } = await exigirSalao();
  if (salao.perfil === "assistente") redirect("/painel");
  const aba = sp.aba === "fechadas" ? "fechadas" : "abertas";
  const souProfissional = salao.perfil === "profissional";

  // A RLS só devolve as comandas (e os itens) que a pessoa pode ver.
  let consulta = supabase
    .from("comandas")
    .select("id, situacao, aberta_em, fechada_em, desconto_centavos, clientes(nome), comanda_itens(total_centavos, removido_em, profissionais(nome))")
    .eq("salao_id", salao.salaoId);
  consulta =
    aba === "abertas"
      ? consulta.eq("situacao", "aberta").order("aberta_em")
      : consulta.eq("situacao", "fechada").gte("fechada_em", inicioDoDia(hojeBrasilia())).order("fechada_em", { ascending: false });
  const { data } = await consulta.limit(200);
  const comandas = (data ?? []) as unknown as Linha[];

  const resumo = (c: Linha) => {
    const ativos = c.comanda_itens.filter((i) => !i.removido_em);
    const soma = ativos.reduce((s, i) => s + Number(i.total_centavos), 0);
    const nomes = [...new Set(ativos.map((i) => i.profissionais?.nome).filter(Boolean))].join(", ");
    // A profissional vê só os próprios itens: mostra o valor deles, sem o desconto geral.
    const valor = souProfissional ? soma : Math.max(soma - Number(c.desconto_centavos), 0);
    return { valor, nomes, qtd: ativos.length };
  };

  const abaClasse = (ativa: boolean) =>
    `rounded-lg px-4 py-2 text-sm font-medium ${ativa ? "bg-white text-stone-900 shadow-sm ring-1 ring-stone-200" : "text-stone-600 hover:bg-white"}`;

  return (
    <div className="flex flex-1 flex-col bg-stone-100 pb-20 md:pb-0 md:pl-56">
      <Cabecalho salao={salao} atual="/comandas" />
      <main className="mx-auto w-full max-w-3xl flex-1 space-y-4 px-4 py-5">
        <div className="flex items-center justify-between gap-4">
          <h1 className="text-xl font-semibold text-stone-900">Comandas</h1>
          <Link href="/comandas/nova" className="flex items-center gap-1.5 rounded-lg bg-rose-700 px-4 py-2 text-sm font-semibold text-white hover:bg-rose-800">
            <Plus aria-hidden className="h-4 w-4" /> Nova comanda
          </Link>
        </div>

        <nav className="flex gap-2" aria-label="Abas">
          <Link href="/comandas" className={abaClasse(aba === "abertas")}>Abertas</Link>
          <Link href="/comandas?aba=fechadas" className={abaClasse(aba === "fechadas")}>Fechadas hoje</Link>
        </nav>

        <section className="rounded-2xl bg-white shadow-sm ring-1 ring-stone-200">
          {comandas.length === 0 ? (
            <p className="p-5 text-sm text-stone-500">
              {aba === "abertas"
                ? "Nenhuma comanda aberta. Ela abre sozinha quando um horário é marcado como Concluído na agenda, ou pelo botão Nova comanda."
                : "Nenhuma comanda fechada hoje."}
            </p>
          ) : (
            <ul className="divide-y divide-stone-100">
              {comandas.map((c) => {
                const r = resumo(c);
                return (
                  <li key={c.id}>
                    <Link href={`/comandas/${c.id}`} className="flex items-center gap-3 px-5 py-4 hover:bg-stone-50">
                      <span className="min-w-0 flex-1">
                        <span className="block truncate font-semibold text-stone-900">{c.clientes?.nome ?? "Cliente"}</span>
                        <span className="block truncate text-sm text-stone-500">
                          {aba === "abertas" ? `Aberta ${quandoBrasilia(c.aberta_em)}` : `Fechada ${quandoBrasilia(c.fechada_em!)}`}
                          {r.nomes ? ` · ${r.nomes}` : r.qtd === 0 ? " · sem itens" : ""}
                        </span>
                      </span>
                      <span className="shrink-0 text-right font-semibold text-stone-900">{formatarReais(r.valor)}</span>
                      <ChevronRight aria-hidden className="h-4 w-4 shrink-0 text-stone-400" />
                    </Link>
                  </li>
                );
              })}
            </ul>
          )}
        </section>
        {souProfissional && <p className="text-xs text-stone-500">Você vê só as comandas em que atende, e o valor dos seus itens.</p>}
      </main>
    </div>
  );
}
