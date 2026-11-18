import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { Suspense } from "react";
import { Cabecalho } from "@/components/cabecalho";
import { Mensagem } from "@/components/ui";
import { hojeBrasilia } from "@/lib/agenda";
import { formatarReais } from "@/lib/dinheiro";
import {
  limitesDoMes,
  NOME_FORMA_DESPESA,
  NOME_SITUACAO_DESPESA,
  nomeDoMes,
  situacaoDespesa,
  somarMeses,
  type FormaDespesa,
  type SituacaoDespesa,
} from "@/lib/despesas";
import { dataCurta } from "@/lib/periodos";
import { exigirSalao } from "@/lib/sessao";
import { AcoesDespesa, Categorias, EncerrarFixa, NovaDespesa, NovaFixa } from "./formularios";

export const metadata: Metadata = { title: "Despesas | Sistema do Salão" };

export default function PaginaDespesas({ searchParams }: PageProps<"/despesas">) {
  return (
    <Suspense fallback={<p className="p-6 text-sm text-stone-500">Carregando...</p>}>
      <Despesas searchParams={searchParams} />
    </Suspense>
  );
}

type Despesa = {
  id: string;
  categoria_id: string;
  descricao: string;
  valor_centavos: number;
  vencimento: string;
  pago_em: string | null;
  forma: FormaDespesa | null;
  observacao: string | null;
  fixa_id: string | null;
  cancelado_em: string | null;
  motivo_cancelamento: string | null;
};

const COR: Record<SituacaoDespesa, string> = {
  cancelada: "bg-stone-100 text-stone-500",
  paga: "bg-emerald-50 text-emerald-800",
  atrasada: "bg-red-50 text-red-800",
  vence_hoje: "bg-amber-50 text-amber-900",
  a_pagar: "bg-sky-50 text-sky-900",
};

const CAMPOS = "id, categoria_id, descricao, valor_centavos, vencimento, pago_em, forma, observacao, fixa_id, cancelado_em, motivo_cancelamento";

async function Despesas({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const sp = await searchParams;
  const { supabase, salao, ehDono } = await exigirSalao();
  if (!ehDono) redirect("/painel");
  const hoje = hojeBrasilia();
  const mesAtual = hoje.slice(0, 7);
  const mes = typeof sp.mes === "string" && limitesDoMes(sp.mes) ? sp.mes : mesAtual;
  const lim = limitesDoMes(mes)!;

  // Gera as contas das despesas fixas que faltam (até o mês de hoje). Pode rodar sempre: não duplica.
  const { error: erroFixas } = await supabase.rpc("gerar_despesas_fixas", { p_salao_id: salao.salaoId });
  if (erroFixas) console.error("gerar_despesas_fixas falhou:", erroFixas.code);

  const [{ data: doMesR, error }, { data: atrasadasR }, { data: categoriasR }, { data: fixasR }] = await Promise.all([
    supabase.from("despesas").select(CAMPOS).eq("salao_id", salao.salaoId).gte("vencimento", lim.de).lte("vencimento", lim.ate).order("vencimento").order("descricao"),
    // Atrasadas de meses anteriores (não pagas e não canceladas).
    supabase.from("despesas").select(CAMPOS).eq("salao_id", salao.salaoId).lt("vencimento", lim.de).lt("vencimento", hoje).is("pago_em", null).is("cancelado_em", null).order("vencimento").limit(200),
    supabase.from("categorias_despesa").select("id, nome, ativo").eq("salao_id", salao.salaoId).order("nome"),
    supabase.from("despesas_fixas").select("id, categoria_id, descricao, valor_centavos, dia_vencimento, inicio, ativa").eq("salao_id", salao.salaoId).order("ativa", { ascending: false }).order("descricao"),
  ]);
  if (error) console.error("despesas (leitura) falhou:", error.code);
  const doMes = (doMesR ?? []) as Despesa[];
  const atrasadasAntes = (atrasadasR ?? []) as Despesa[];
  const categorias = (categoriasR ?? []) as { id: string; nome: string; ativo: boolean }[];
  const fixas = (fixasR ?? []) as { id: string; categoria_id: string; descricao: string; valor_centavos: number; dia_vencimento: number; inicio: string; ativa: boolean }[];
  const nomeCategoria = new Map(categorias.map((c) => [c.id, c.nome]));
  const ativas = categorias.filter((c) => c.ativo).map((c) => ({ id: c.id, nome: c.nome }));

  const validas = doMes.filter((d) => !d.cancelado_em);
  const totalMes = validas.reduce((s, d) => s + Number(d.valor_centavos), 0);
  const pagoMes = validas.filter((d) => d.pago_em).reduce((s, d) => s + Number(d.valor_centavos), 0);

  const lista = (itens: Despesa[]) => (
    <ul className="divide-y divide-stone-100 rounded-2xl bg-white shadow-sm ring-1 ring-stone-200">
      {itens.map((d) => {
        const sit = situacaoDespesa(d, hoje);
        return (
          <li key={d.id} className="space-y-1 px-4 py-3 text-sm">
            <div className="flex justify-between gap-3">
              <span className="min-w-0">
                <span className={`block font-medium ${d.cancelado_em ? "text-stone-400 line-through" : "text-stone-900"}`}>
                  {d.descricao}
                  {d.fixa_id && <span className="ml-1 text-xs font-normal text-stone-500">(fixa)</span>}
                </span>
                <span className="block text-xs text-stone-500">
                  {nomeCategoria.get(d.categoria_id) ?? "Categoria"} · vence {dataCurta(d.vencimento)}
                  {d.pago_em && ` · paga em ${dataCurta(d.pago_em)} (${NOME_FORMA_DESPESA[d.forma!].replace(" (sai do caixa)", "")})`}
                </span>
                {d.observacao && <span className="block text-xs text-stone-500">{d.observacao}</span>}
                {d.cancelado_em && <span className="block text-xs text-red-700">Cancelada: {d.motivo_cancelamento}</span>}
              </span>
              <span className="shrink-0 text-right">
                <span className={`block font-semibold ${d.cancelado_em ? "text-stone-400 line-through" : "text-stone-900"}`}>{formatarReais(Number(d.valor_centavos))}</span>
                <span className={`mt-1 inline-block rounded-full px-2 py-0.5 text-xs font-medium ${COR[sit]}`}>{NOME_SITUACAO_DESPESA[sit]}</span>
              </span>
            </div>
            {!d.cancelado_em && <AcoesDespesa despesaId={d.id} paga={Boolean(d.pago_em)} hoje={hoje} />}
          </li>
        );
      })}
    </ul>
  );

  return (
    <div className="flex flex-1 flex-col bg-stone-100 pb-20 md:pb-0 md:pl-56">
      <Cabecalho salao={salao} atual="/despesas" />
      <main className="mx-auto w-full max-w-3xl flex-1 space-y-4 px-4 py-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="text-xl font-semibold text-stone-900">Despesas</h1>
            <p className="text-sm text-stone-500">Contas do salão. O sistema só anota; o pagamento você faz como sempre.</p>
          </div>
          <nav className="flex items-center gap-2 text-sm" aria-label="Meses">
            <Link href={`/despesas?mes=${somarMeses(mes, -1)}`} className="rounded-lg px-3 py-1.5 font-medium text-stone-700 ring-1 ring-stone-300 hover:bg-white">‹</Link>
            <span className="font-medium text-stone-800">{nomeDoMes(mes)}</span>
            <Link href={`/despesas?mes=${somarMeses(mes, 1)}`} className="rounded-lg px-3 py-1.5 font-medium text-stone-700 ring-1 ring-stone-300 hover:bg-white">›</Link>
            {mes !== mesAtual && (
              <Link href="/despesas" className="rounded-lg px-3 py-1.5 font-medium text-rose-700 ring-1 ring-rose-200 hover:bg-rose-50">Este mês</Link>
            )}
          </nav>
        </div>

        {error && <Mensagem tipo="erro">Não foi possível carregar as despesas. Tente de novo.</Mensagem>}

        <section className="grid grid-cols-3 gap-3 rounded-2xl bg-white p-5 text-sm shadow-sm ring-1 ring-stone-200">
          <div><p className="text-stone-500">Total do mês</p><p className="text-lg font-semibold text-stone-900">{formatarReais(totalMes)}</p></div>
          <div><p className="text-stone-500">Pago</p><p className="text-lg font-semibold text-emerald-700">{formatarReais(pagoMes)}</p></div>
          <div><p className="text-stone-500">Falta pagar</p><p className="text-lg font-semibold text-amber-800">{formatarReais(totalMes - pagoMes)}</p></div>
        </section>

        <NovaDespesa categorias={ativas} hoje={hoje} />

        {atrasadasAntes.length > 0 && (
          <>
            <h2 className="px-1 font-semibold text-red-800">Atrasadas de meses anteriores</h2>
            {lista(atrasadasAntes)}
          </>
        )}

        <h2 className="px-1 font-semibold text-stone-900">Contas de {nomeDoMes(mes)}</h2>
        {doMes.length ? lista(doMes) : <p className="px-1 text-sm text-stone-500">Nenhuma conta com vencimento neste mês.</p>}

        <section className="space-y-3 rounded-2xl bg-white p-5 shadow-sm ring-1 ring-stone-200">
          <h2 className="font-semibold text-stone-900">Despesas fixas (todo mês)</h2>
          <p className="text-sm text-stone-500">Aluguel, internet, etc. A conta de cada mês aparece sozinha. Para mudar o valor, encerre e crie de novo.</p>
          {fixas.length > 0 && (
            <ul className="divide-y divide-stone-100 text-sm">
              {fixas.map((f) => (
                <li key={f.id} className="flex flex-wrap items-center justify-between gap-2 py-2">
                  <span className={f.ativa ? "text-stone-800" : "text-stone-400 line-through"}>
                    {f.descricao} · {nomeCategoria.get(f.categoria_id) ?? "Categoria"} · todo dia {f.dia_vencimento}
                    <span className="block text-xs text-stone-500">desde {nomeDoMes(f.inicio.slice(0, 7))}{f.ativa ? "" : " · encerrada"}</span>
                  </span>
                  <span className="flex items-center gap-3">
                    <span className="font-medium text-stone-900">{formatarReais(Number(f.valor_centavos))}</span>
                    {f.ativa && <EncerrarFixa fixaId={f.id} />}
                  </span>
                </li>
              ))}
            </ul>
          )}
          <NovaFixa categorias={ativas} mesAtual={mesAtual} />
        </section>

        <Categorias categorias={categorias} />
      </main>
    </div>
  );
}
