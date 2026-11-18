import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { Suspense } from "react";
import { Cabecalho } from "@/components/cabecalho";
import { Mensagem } from "@/components/ui";
import { dataValida, hojeBrasilia, somarDias } from "@/lib/agenda";
import { NOME_FORMA, quandoBrasilia, type FormaPagamento } from "@/lib/comandas";
import { formatarReais } from "@/lib/dinheiro";
import { dataCurta } from "@/lib/periodos";
import { exigirSalao } from "@/lib/sessao";
import { AbrirCaixa, CancelarMovimento, FecharCaixa, Movimento, ReabrirCaixa } from "./formularios";

export const metadata: Metadata = { title: "Caixa | Sistema do Salão" };

export default function PaginaCaixa({ searchParams }: PageProps<"/caixa">) {
  return (
    <Suspense fallback={<p className="p-6 text-sm text-stone-500">Carregando...</p>}>
      <Caixa searchParams={searchParams} />
    </Suspense>
  );
}

type Resumo = {
  data: string;
  hoje: string;
  troco_inicial: number;
  entradas_por_forma: Partial<Record<FormaPagamento, number>>;
  dinheiro_recebido: number;
  reforcos: number;
  retiradas: number;
  comissoes_dinheiro: number;
  vales_dinheiro: number;
  despesas_dinheiro: number;
  esperado_dinheiro: number;
  caixa: null | {
    id: string;
    situacao: "aberto" | "fechado";
    aberto_em: string;
    fechado_em: string | null;
    contado_centavos: number | null;
    esperado_centavos: number | null;
    motivo_diferenca: string | null;
    conferido_pix: boolean;
    conferido_cartao: boolean;
    reaberto_em: string | null;
    motivo_reabertura: string | null;
  };
  movimentos: { id: string; tipo: "retirada" | "reforco"; valor_centavos: number; motivo: string; criado_em: string; cancelado_em: string | null; motivo_cancelamento: string | null }[];
  caixas_abertos_antes: string[];
};

const FORMAS: FormaPagamento[] = ["dinheiro", "pix", "debito", "credito_vista", "credito_parcelado"];

async function Caixa({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const sp = await searchParams;
  const { supabase, salao, ehDono } = await exigirSalao();
  if (salao.perfil !== "dono" && salao.perfil !== "recepcao") redirect("/painel");
  const hoje = hojeBrasilia();
  const data = typeof sp.d === "string" && dataValida(sp.d) && sp.d <= hoje ? sp.d : hoje;

  const { data: r, error } = await supabase.rpc("resumo_caixa", { p_salao_id: salao.salaoId, p_data: data });
  if (error) console.error("resumo_caixa falhou:", error.code);
  const resumo = r as Resumo | null;

  const n = (v: unknown) => Number(v ?? 0);
  const caixa = resumo?.caixa ?? null;
  const ehHoje = data === hoje;
  const totalEntradas = resumo ? FORMAS.reduce((s, f) => s + n(resumo.entradas_por_forma[f]), 0) : 0;
  const temPix = n(resumo?.entradas_por_forma.pix) > 0;
  const temCartao = ["debito", "credito_vista", "credito_parcelado"].some((f) => n(resumo?.entradas_por_forma[f as FormaPagamento]) > 0);
  // Dinheiro que mudou depois do fechamento (pagamento ou comissão registrados mais tarde).
  const mudouDepois = caixa?.situacao === "fechado" && resumo ? n(resumo.esperado_dinheiro) - n(caixa.esperado_centavos) : 0;

  return (
    <div className="flex flex-1 flex-col bg-stone-100 pb-20 md:pb-0 md:pl-56">
      <Cabecalho salao={salao} atual="/caixa" />
      <main className="mx-auto w-full max-w-3xl flex-1 space-y-4 px-4 py-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="text-xl font-semibold text-stone-900">Caixa</h1>
            <p className="text-sm text-stone-500">
              {ehHoje ? "Hoje" : "Dia"}, {dataCurta(data)}
              {caixa ? (caixa.situacao === "aberto" ? " · aberto" : " · fechado") : " · não aberto"}
            </p>
          </div>
          {ehDono && (
            <nav className="flex items-center gap-2 text-sm" aria-label="Dias">
              <Link href={`/caixa?d=${somarDias(data, -1)}`} className="rounded-lg px-3 py-1.5 font-medium text-stone-700 ring-1 ring-stone-300 hover:bg-white">‹ Dia anterior</Link>
              {!ehHoje && (
                <>
                  <Link href={`/caixa?d=${somarDias(data, 1)}`} className="rounded-lg px-3 py-1.5 font-medium text-stone-700 ring-1 ring-stone-300 hover:bg-white">Próximo ›</Link>
                  <Link href="/caixa" className="rounded-lg px-3 py-1.5 font-medium text-rose-700 ring-1 ring-rose-200 hover:bg-rose-50">Hoje</Link>
                </>
              )}
            </nav>
          )}
        </div>

        {error && <Mensagem tipo="erro">{error.code === "42501" ? error.message : "Não foi possível carregar o caixa. Tente de novo."}</Mensagem>}

        {resumo && resumo.caixas_abertos_antes.length > 0 && (
          <Mensagem tipo="aviso">
            Ficou caixa aberto de dia anterior:{" "}
            {resumo.caixas_abertos_antes.map((d, i) => (
              <span key={d}>
                {i > 0 && ", "}
                <Link href={`/caixa?d=${d}`} className="font-semibold underline">{dataCurta(d)}</Link>
              </span>
            ))}
            . Abra e feche para conferir.
          </Mensagem>
        )}

        {resumo && (
          <>
            {!caixa && ehHoje && <AbrirCaixa />}
            {!caixa && !ehHoje && <p className="px-1 text-sm text-stone-500">O caixa não foi aberto neste dia. Os números abaixo mostram o que foi registrado.</p>}

            <section className="space-y-3 rounded-2xl bg-white p-5 shadow-sm ring-1 ring-stone-200">
              <h2 className="font-semibold text-stone-900">Entradas das comandas</h2>
              <ul className="divide-y divide-stone-100 text-sm">
                {FORMAS.map((f) => (
                  <li key={f} className="flex justify-between py-1.5">
                    <span className="text-stone-700">{NOME_FORMA[f]}</span>
                    <span className="font-medium text-stone-900">{formatarReais(n(resumo.entradas_por_forma[f]))}</span>
                  </li>
                ))}
                <li className="flex justify-between py-1.5 font-semibold">
                  <span>Total recebido</span>
                  <span>{formatarReais(totalEntradas)}</span>
                </li>
              </ul>
            </section>

            <section className="space-y-3 rounded-2xl bg-white p-5 shadow-sm ring-1 ring-stone-200">
              <h2 className="font-semibold text-stone-900">Dinheiro na gaveta</h2>
              <ul className="divide-y divide-stone-100 text-sm">
                <Linha rotulo="Troco inicial" valor={n(resumo.troco_inicial)} />
                <Linha rotulo="+ Recebido em dinheiro" valor={n(resumo.dinheiro_recebido)} />
                <Linha rotulo="+ Reforços" valor={n(resumo.reforcos)} />
                <Linha rotulo="− Retiradas" valor={n(resumo.retiradas)} />
                <Linha rotulo="− Comissões pagas em dinheiro" valor={n(resumo.comissoes_dinheiro)} />
                <Linha rotulo="− Vales dados em dinheiro" valor={n(resumo.vales_dinheiro)} />
                <Linha rotulo="− Despesas pagas em dinheiro" valor={n(resumo.despesas_dinheiro)} />
                <li className="flex justify-between py-1.5 font-semibold">
                  <span>Deve ter na gaveta</span>
                  <span>{formatarReais(n(resumo.esperado_dinheiro))}</span>
                </li>
              </ul>
            </section>

            {(resumo.movimentos.length > 0 || (caixa?.situacao === "aberto" && ehHoje)) && (
              <section className="space-y-3 rounded-2xl bg-white p-5 shadow-sm ring-1 ring-stone-200">
                <h2 className="font-semibold text-stone-900">Retiradas e reforços</h2>
                {resumo.movimentos.length > 0 && (
                  <ul className="divide-y divide-stone-100 text-sm">
                    {resumo.movimentos.map((m) => (
                      <li key={m.id} className="space-y-1 py-2">
                        <div className="flex justify-between gap-3">
                          <span className={m.cancelado_em ? "text-stone-400 line-through" : "text-stone-800"}>
                            {m.tipo === "retirada" ? "Retirada" : "Reforço"} · {m.motivo}
                            <span className="block text-xs text-stone-500">{quandoBrasilia(m.criado_em)}</span>
                          </span>
                          <span className={`shrink-0 font-medium ${m.cancelado_em ? "text-stone-400 line-through" : "text-stone-900"}`}>
                            {m.tipo === "retirada" ? "− " : "+ "}
                            {formatarReais(n(m.valor_centavos))}
                          </span>
                        </div>
                        {m.cancelado_em && <p className="text-xs text-red-700">Cancelado: {m.motivo_cancelamento}</p>}
                        {!m.cancelado_em && caixa?.situacao === "aberto" && <CancelarMovimento movimentoId={m.id} />}
                      </li>
                    ))}
                  </ul>
                )}
                {caixa?.situacao === "aberto" && ehHoje && <Movimento />}
              </section>
            )}

            {caixa?.situacao === "aberto" && (
              <FecharCaixa caixaId={caixa.id} esperado={n(resumo.esperado_dinheiro)} temPix={temPix} temCartao={temCartao} />
            )}

            {caixa?.situacao === "fechado" && (
              <section className="space-y-2 rounded-2xl bg-white p-5 text-sm shadow-sm ring-1 ring-stone-200">
                <h2 className="font-semibold text-stone-900">Fechamento</h2>
                <p className="text-stone-600">Fechado {quandoBrasilia(caixa.fechado_em!)}</p>
                <ul className="divide-y divide-stone-100">
                  <Linha rotulo="Deveria ter" valor={n(caixa.esperado_centavos)} />
                  <Linha rotulo="Contado" valor={n(caixa.contado_centavos)} />
                  <li className="flex justify-between py-1.5 font-semibold">
                    <span>Diferença</span>
                    <span className={n(caixa.contado_centavos) - n(caixa.esperado_centavos) === 0 ? "text-emerald-700" : "text-amber-800"}>
                      {formatarReais(n(caixa.contado_centavos) - n(caixa.esperado_centavos))}
                    </span>
                  </li>
                </ul>
                {caixa.motivo_diferenca && <p className="text-stone-700">Motivo: {caixa.motivo_diferenca}</p>}
                {(temPix || temCartao) && (
                  <p className="text-stone-600">
                    {[
                      temPix && `Pix ${caixa.conferido_pix ? "conferido" : "não conferido"}`,
                      temCartao && `Cartão ${caixa.conferido_cartao ? "conferido" : "não conferido"}`,
                    ]
                      .filter(Boolean)
                      .join(" · ")}
                  </p>
                )}
                {mudouDepois !== 0 && (
                  <Mensagem tipo="aviso">
                    Depois do fechamento, o dinheiro deste dia mudou em {formatarReais(mudouDepois)} (pagamento, comissão ou vale registrado mais tarde).
                  </Mensagem>
                )}
                {ehDono && <ReabrirCaixa caixaId={caixa.id} />}
              </section>
            )}

            {caixa?.reaberto_em && (
              <p className="px-1 text-xs text-stone-500">
                Reaberto {quandoBrasilia(caixa.reaberto_em)}: {caixa.motivo_reabertura}
              </p>
            )}
          </>
        )}
      </main>
    </div>
  );
}

function Linha({ rotulo, valor }: { rotulo: string; valor: number }) {
  return (
    <li className="flex justify-between py-1.5">
      <span className="text-stone-700">{rotulo}</span>
      <span className="font-medium text-stone-900">{formatarReais(valor)}</span>
    </li>
  );
}
