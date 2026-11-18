import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { Cabecalho } from "@/components/cabecalho";
import { quandoBrasilia } from "@/lib/comandas";
import { formatarReais } from "@/lib/dinheiro";
import { NOME_MEIO } from "@/lib/pagamento-comissoes";
import { dataCurta } from "@/lib/periodos";
import { exigirSalao } from "@/lib/sessao";
import { BotaoImprimir, CancelarPagamento } from "./acoes-comprovante";

export const metadata: Metadata = { title: "Comprovante de comissão | Sistema do Salão" };

export default function PaginaComprovante({ params }: PageProps<"/comissoes/pagamentos/[id]">) {
  return (
    <Suspense fallback={<p className="p-6 text-sm text-stone-500">Carregando...</p>}>
      <Comprovante params={params} />
    </Suspense>
  );
}

type Item = { criado_em: string; item_nome: string; estorno: boolean; valor_centavos: number };

async function Comprovante({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { supabase, salao, ehDono } = await exigirSalao();
  const [{ data: p }, { data: itensR }, { data: valesR }] = await Promise.all([
    supabase
      .from("pagamentos_comissao")
      .select("id, profissional_id, valor_centavos, desconto_vales_centavos, quantidade, meio, pago_em, ate, primeiro_lancamento, observacao, criado_em, cancelado_em, motivo_cancelamento, profissionais(nome)")
      .eq("id", id)
      .eq("salao_id", salao.salaoId)
      .maybeSingle(),
    supabase.rpc("itens_pagamento_comissao", { p_pagamento_id: id }),
    supabase.from("vale_descontos").select("valor_centavos, vales(dado_em)").eq("pagamento_id", id),
  ]);
  if (!p) notFound();
  const nome = (p as unknown as { profissionais: { nome: string } | null }).profissionais?.nome ?? "Profissional";
  const itens = (itensR ?? []) as Item[];
  const valesDescontados = (valesR ?? []) as unknown as { valor_centavos: number; vales: { dado_em: string } | null }[];
  const desconto = Number(p.desconto_vales_centavos);
  const entregue = Number(p.valor_centavos) - desconto;

  return (
    <div className="flex flex-1 flex-col bg-stone-100 pb-20 md:pb-0 md:pl-56 print:bg-white print:pb-0 print:pl-0">
      <div className="print:hidden">
        <Cabecalho salao={salao} atual="/comissoes" />
      </div>
      <main className="mx-auto w-full max-w-3xl flex-1 space-y-4 px-4 py-5 print:max-w-none print:px-0 print:py-0">
        <div className="flex flex-wrap items-center justify-between gap-3 print:hidden">
          <Link href="/comissoes/pagamentos" className="text-sm font-medium text-stone-600 hover:underline">
            ‹ Voltar para os pagamentos
          </Link>
          {!p.cancelado_em && <BotaoImprimir />}
        </div>

        {p.cancelado_em && (
          <div className="rounded-xl bg-red-50 p-4 text-sm text-red-900 ring-1 ring-red-200">
            <p className="font-semibold">Pagamento cancelado em {quandoBrasilia(p.cancelado_em)}</p>
            <p>Motivo: {p.motivo_cancelamento}</p>
            <p className="mt-1 text-xs">Os lançamentos voltaram a ficar a pagar.</p>
          </div>
        )}

        <article className="space-y-4 rounded-2xl bg-white p-6 shadow-sm ring-1 ring-stone-200 print:rounded-none print:shadow-none print:ring-0">
          <header className="border-b border-stone-200 pb-3">
            <p className="text-sm text-stone-500">{salao.nome}</p>
            <h1 className="text-xl font-semibold text-stone-900">Comprovante de pagamento de comissão</h1>
            {p.cancelado_em && (
              <p className="mt-2 text-lg font-bold tracking-wide text-red-700">CANCELADO: este pagamento não vale. Motivo: {p.motivo_cancelamento}</p>
            )}
          </header>

          <dl className="grid grid-cols-1 gap-x-6 gap-y-2 text-sm sm:grid-cols-2">
            <div><dt className="text-stone-500">Recebido por</dt><dd className="font-medium text-stone-900">{nome}</dd></div>
            <div><dt className="text-stone-500">Valor entregue</dt><dd className="text-lg font-semibold text-stone-900">{formatarReais(entregue)}</dd></div>
            <div><dt className="text-stone-500">Período</dt><dd className="text-stone-900">{dataCurta(p.primeiro_lancamento)} a {dataCurta(p.ate)}</dd></div>
            <div><dt className="text-stone-500">Pago em</dt><dd className="text-stone-900">{dataCurta(p.pago_em)} · {NOME_MEIO[p.meio as keyof typeof NOME_MEIO]}</dd></div>
            {p.observacao && <div className="sm:col-span-2"><dt className="text-stone-500">Observação</dt><dd className="text-stone-900">{p.observacao}</dd></div>}
          </dl>

          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-stone-200 text-left text-stone-500">
                <th className="py-2 font-medium">Data</th>
                <th className="py-2 font-medium">Serviço ou produto</th>
                <th className="py-2 text-right font-medium">Comissão</th>
              </tr>
            </thead>
            <tbody>
              {itens.map((i, n) => (
                <tr key={n} className="border-b border-stone-100">
                  <td className="py-1.5 pr-2 whitespace-nowrap text-stone-600">{quandoBrasilia(i.criado_em).slice(0, 5)}</td>
                  <td className="py-1.5 pr-2 text-stone-900">{i.item_nome}{i.estorno ? " (estorno: comanda reaberta)" : ""}</td>
                  <td className="py-1.5 text-right whitespace-nowrap text-stone-900">{formatarReais(Number(i.valor_centavos))}</td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr>
                <td colSpan={2} className="pt-2 font-semibold text-stone-900">Total de comissões ({p.quantidade} {p.quantidade === 1 ? "lançamento" : "lançamentos"})</td>
                <td className="pt-2 text-right font-semibold text-stone-900">{formatarReais(Number(p.valor_centavos))}</td>
              </tr>
              {desconto > 0 && (
                <tr>
                  <td colSpan={2} className="pt-1 text-stone-700">
                    Vale descontado
                    {valesDescontados.length > 0 && ` (${valesDescontados.map((v) => `${formatarReais(Number(v.valor_centavos))} do vale de ${v.vales ? dataCurta(v.vales.dado_em) : "?"}`).join("; ")})`}
                  </td>
                  <td className="pt-1 text-right text-stone-700">− {formatarReais(desconto)}</td>
                </tr>
              )}
              {desconto > 0 && (
                <tr>
                  <td colSpan={2} className="pt-1 font-semibold text-stone-900">Valor entregue</td>
                  <td className="pt-1 text-right font-semibold text-stone-900">{formatarReais(entregue)}</td>
                </tr>
              )}
            </tfoot>
          </table>

          {itens.length < p.quantidade && (
            <p className="text-xs text-amber-800">A lista mostra {itens.length} de {p.quantidade} lançamentos; o total acima está completo.</p>
          )}
          {!p.cancelado_em && (
            <div className="pt-10">
              <div className="w-full max-w-sm border-t border-stone-400 pt-1 text-sm text-stone-600">Assinatura de {nome}</div>
            </div>
          )}
          <p className="text-xs text-stone-500">
            Recibo simples para conferência e assinatura à mão. Registrado no sistema em {quandoBrasilia(p.criado_em)}. Não é assinatura digital.
          </p>
        </article>

        {ehDono && !p.cancelado_em && (
          <div className="px-1 print:hidden">
            <CancelarPagamento pagamentoId={p.id} />
          </div>
        )}
      </main>
    </div>
  );
}
