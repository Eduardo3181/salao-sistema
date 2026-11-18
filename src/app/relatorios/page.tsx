import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { Suspense } from "react";
import { Cabecalho } from "@/components/cabecalho";
import { Mensagem } from "@/components/ui";
import { hojeBrasilia } from "@/lib/agenda";
import { NOME_FORMA, type FormaPagamento } from "@/lib/comandas";
import { formatarReais } from "@/lib/dinheiro";
import { atalhosDePeriodo, dataCurta, lerPeriodo } from "@/lib/periodos";
import { exigirSalao } from "@/lib/sessao";

export const metadata: Metadata = { title: "Relatórios | Sistema do Salão" };

export default function PaginaRelatorios({ searchParams }: PageProps<"/relatorios">) {
  return (
    <Suspense fallback={<p className="p-6 text-sm text-stone-500">Carregando...</p>}>
      <Relatorios searchParams={searchParams} />
    </Suspense>
  );
}

type Relatorio = {
  resultado: { entradas: number; taxas_cartao: number; comissoes_pagas: number; vales: number; despesas: number; resultado: number };
  por_forma: { forma: FormaPagamento; total: number; quantidade: number; taxas: number }[];
  por_profissional: { nome: string; servicos: number; produtos: number; total: number; quantidade: number }[];
  por_item: { tipo: "servico" | "produto"; nome: string; quantidade: number; total: number }[];
  por_categoria: { nome: string; total: number; quantidade: number }[];
  descontos_comanda: number;
  comandas_fechadas: number;
  comissoes_a_pagar: number;
};

const campo = "rounded-lg border border-stone-300 bg-white px-3 py-2 text-base text-stone-900 outline-none focus:border-rose-600 focus:ring-2 focus:ring-rose-200";
const cartao = "space-y-3 rounded-2xl bg-white p-5 shadow-sm ring-1 ring-stone-200";
const n = (v: unknown) => Number(v ?? 0);

async function Relatorios({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const sp = await searchParams;
  const { supabase, salao, ehDono } = await exigirSalao();
  if (!ehDono) redirect("/painel");
  const hoje = hojeBrasilia();
  const { periodo, erro: erroPeriodo } = lerPeriodo(sp.de, sp.ate, hoje);

  const { data, error } = await supabase.rpc("relatorio_periodo", { p_salao_id: salao.salaoId, p_de: periodo.de, p_ate: periodo.ate });
  if (error) console.error("relatorio_periodo falhou:", error.code);
  const r = data as Relatorio | null;
  const atalhoAtivo = (de: string, ate: string) => de === periodo.de && ate === periodo.ate;
  const totalVendas = r ? r.por_profissional.reduce((s, p) => s + n(p.total), 0) : 0;

  return (
    <div className="flex flex-1 flex-col bg-stone-100 pb-20 md:pb-0 md:pl-56">
      <Cabecalho salao={salao} atual="/relatorios" />
      <main className="mx-auto w-full max-w-3xl flex-1 space-y-4 px-4 py-5">
        <div>
          <h1 className="text-xl font-semibold text-stone-900">Relatórios</h1>
          <p className="text-sm text-stone-500">
            {dataCurta(periodo.de)} a {dataCurta(periodo.ate)}. O resultado conta o dinheiro que de fato entrou e saiu.
          </p>
        </div>

        <section className="space-y-3 rounded-2xl bg-white p-4 shadow-sm ring-1 ring-stone-200">
          <nav className="flex flex-wrap gap-2" aria-label="Períodos">
            {atalhosDePeriodo(hoje).map((a) => (
              <Link
                key={a.id}
                href={`/relatorios?de=${a.periodo.de}&ate=${a.periodo.ate}`}
                className={`rounded-lg px-3 py-1.5 text-sm font-medium ring-1 ${
                  atalhoAtivo(a.periodo.de, a.periodo.ate) ? "bg-rose-50 text-rose-800 ring-rose-200" : "text-stone-700 ring-stone-300 hover:bg-stone-50"
                }`}
              >
                {a.rotulo}
              </Link>
            ))}
          </nav>
          <form className="flex flex-wrap items-end gap-3" action="/relatorios">
            <label className="block">
              <span className="text-sm text-stone-700">De</span>
              <input type="date" name="de" defaultValue={periodo.de} className={`${campo} mt-1 block`} />
            </label>
            <label className="block">
              <span className="text-sm text-stone-700">Até</span>
              <input type="date" name="ate" defaultValue={periodo.ate} className={`${campo} mt-1 block`} />
            </label>
            <button className="rounded-lg bg-rose-700 px-4 py-2.5 text-sm font-semibold text-white hover:bg-rose-800">Ver</button>
          </form>
          {erroPeriodo && <Mensagem tipo="erro">{erroPeriodo}</Mensagem>}
        </section>

        {error && <Mensagem tipo="erro">Não foi possível carregar o relatório. Tente de novo.</Mensagem>}

        {r && (
          <>
            <section className={cartao}>
              <h2 className="font-semibold text-stone-900">Resultado</h2>
              <ul className="divide-y divide-stone-100 text-sm">
                <Linha rotulo="Entrou (pagamentos das comandas)" valor={n(r.resultado.entradas)} />
                <Linha rotulo="− Taxas do cartão" valor={n(r.resultado.taxas_cartao)} />
                <Linha rotulo="− Comissões pagas" valor={n(r.resultado.comissoes_pagas)} />
                <Linha rotulo="− Vales dados" valor={n(r.resultado.vales)} />
                <Linha rotulo="− Despesas pagas" valor={n(r.resultado.despesas)} />
                <li className="flex justify-between py-2 text-base font-semibold">
                  <span>Resultado</span>
                  <span className={n(r.resultado.resultado) >= 0 ? "text-emerald-700" : "text-red-700"}>{formatarReais(n(r.resultado.resultado))}</span>
                </li>
              </ul>
              {n(r.comissoes_a_pagar) > 0 && (
                <p className="text-xs text-amber-800">
                  Atenção: {formatarReais(n(r.comissoes_a_pagar))} de comissões deste período ainda não foram pagas e não entram no resultado.
                </p>
              )}
            </section>

            <section className={cartao}>
              <h2 className="font-semibold text-stone-900">Recebido por forma de pagamento</h2>
              {r.por_forma.length === 0 ? (
                <p className="text-sm text-stone-500">Nada recebido no período.</p>
              ) : (
                <Tabela
                  colunas={["Forma", "Pagamentos", "Taxas", "Total"]}
                  linhas={r.por_forma.map((f) => [NOME_FORMA[f.forma], String(n(f.quantidade)), formatarReais(n(f.taxas)), formatarReais(n(f.total))])}
                />
              )}
            </section>

            <section className={cartao}>
              <h2 className="font-semibold text-stone-900">Vendas por profissional</h2>
              <p className="text-xs text-stone-500">
                Comandas fechadas no período ({n(r.comandas_fechadas)}), pelo valor de cada item.
                {n(r.descontos_comanda) > 0 && ` Descontos no total das comandas: ${formatarReais(n(r.descontos_comanda))}.`}
              </p>
              {r.por_profissional.length === 0 ? (
                <p className="text-sm text-stone-500">Nenhuma comanda fechada no período.</p>
              ) : (
                <Tabela
                  colunas={["Profissional", "Serviços", "Produtos", "Total"]}
                  linhas={r.por_profissional.map((p) => [p.nome, formatarReais(n(p.servicos)), formatarReais(n(p.produtos)), formatarReais(n(p.total))])}
                  rodape={["Total", "", "", formatarReais(totalVendas)]}
                />
              )}
            </section>

            <section className={cartao}>
              <h2 className="font-semibold text-stone-900">Vendas por serviço e produto</h2>
              {r.por_item.length === 0 ? (
                <p className="text-sm text-stone-500">Nenhuma venda no período.</p>
              ) : (
                <Tabela
                  colunas={["Item", "Tipo", "Qtd.", "Total"]}
                  linhas={r.por_item.map((i) => [i.nome, i.tipo === "servico" ? "Serviço" : "Produto", String(n(i.quantidade)), formatarReais(n(i.total))])}
                />
              )}
            </section>

            <section className={cartao}>
              <h2 className="font-semibold text-stone-900">Despesas pagas por categoria</h2>
              {r.por_categoria.length === 0 ? (
                <p className="text-sm text-stone-500">Nenhuma despesa paga no período.</p>
              ) : (
                <Tabela
                  colunas={["Categoria", "Contas", "Total"]}
                  linhas={r.por_categoria.map((c) => [c.nome, String(n(c.quantidade)), formatarReais(n(c.total))])}
                  rodape={["Total", "", formatarReais(n(r.resultado.despesas))]}
                />
              )}
            </section>
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

/** Tabela simples; a última coluna (valores) fica alinhada à direita. */
function Tabela({ colunas, linhas, rodape }: { colunas: string[]; linhas: string[][]; rodape?: string[] }) {
  const alinhar = (i: number) => (i === 0 ? "text-left" : "text-right");
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-stone-200 text-stone-500">
            {colunas.map((c, i) => (
              <th key={c} className={`py-2 font-medium ${alinhar(i)}`}>{c}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {linhas.map((l, k) => (
            <tr key={k} className="border-b border-stone-100">
              {l.map((v, i) => (
                <td key={i} className={`py-1.5 ${i === 0 ? "pr-2 text-stone-900" : "pl-2 whitespace-nowrap text-stone-800"} ${alinhar(i)}`}>{v}</td>
              ))}
            </tr>
          ))}
        </tbody>
        {rodape && (
          <tfoot>
            <tr className="font-semibold text-stone-900">
              {rodape.map((v, i) => (
                <td key={i} className={`pt-2 ${alinhar(i)}`}>{v}</td>
              ))}
            </tr>
          </tfoot>
        )}
      </table>
    </div>
  );
}
