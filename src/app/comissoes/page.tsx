import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { Cabecalho } from "@/components/cabecalho";
import { Mensagem } from "@/components/ui";
import { hojeBrasilia } from "@/lib/agenda";
import { quandoBrasilia } from "@/lib/comandas";
import { centesimosParaTexto, formatarReais } from "@/lib/dinheiro";
import { atalhosDePeriodo, dataCurta, lerPeriodo, limitesDoPeriodo } from "@/lib/periodos";
import { buscarProfissionais } from "@/lib/profissionais";
import { exigirSalao } from "@/lib/sessao";

export const metadata: Metadata = { title: "Comissões | Sistema do Salão" };

export default function PaginaExtrato({ searchParams }: PageProps<"/comissoes">) {
  return (
    <Suspense fallback={<p className="p-6 text-sm text-stone-500">Carregando...</p>}>
      <Extrato searchParams={searchParams} />
    </Suspense>
  );
}

type Linha = {
  id: string;
  criado_em: string;
  comanda_id: string;
  estorno: boolean;
  papel: "profissional" | "assistente";
  item_nome: string;
  cliente_nome: string | null;
  valor_item_centavos: number | null;
  percentual: number | null;
  taxa_centavos: number | null;
  parte_assistente_centavos: number | null;
  valor_centavos: number;
  pago_em: string | null;
  total_periodo_centavos: number;
  quantidade_periodo: number;
};

const campo = "rounded-lg border border-stone-300 bg-white px-3 py-2 text-base text-stone-900 outline-none focus:border-rose-600 focus:ring-2 focus:ring-rose-200";

async function Extrato({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const sp = await searchParams;
  const { supabase, userId, salao, ehDono } = await exigirSalao();
  const hoje = hojeBrasilia();
  const { periodo, erro: erroPeriodo } = lerPeriodo(sp.de, sp.ate, hoje);

  const equipe = await buscarProfissionais(supabase, salao.salaoId);
  const meu = equipe.find((p) => p.user_id === userId) ?? null;
  // O dono escolhe de quem ver; os demais veem só o próprio extrato.
  const opcoes = ehDono ? equipe : meu ? [meu] : [];
  const escolhido = opcoes.find((p) => p.id === sp.p) ?? (ehDono ? (meu ?? opcoes[0]) : meu) ?? null;

  const lim = limitesDoPeriodo(periodo);
  const { data, error } = escolhido
    ? await supabase.rpc("extrato_comissoes", { p_salao_id: salao.salaoId, p_profissional_id: escolhido.id, p_de: lim.de, p_ate: lim.ate })
    : { data: [], error: null };
  if (error) console.error("extrato falhou:", error.code);
  const linhas = ((data ?? []) as Linha[]).map((l) => ({ ...l, valor_centavos: Number(l.valor_centavos) }));
  // Total e quantidade vêm do banco (a lista pode vir cortada em 1000 linhas; o total não).
  const total = linhas.length ? Number(linhas[0].total_periodo_centavos) : 0;
  const quantidadeTotal = linhas.length ? Number(linhas[0].quantidade_periodo) : 0;
  const estornos = linhas.filter((l) => l.estorno);

  const link = (de: string, ate: string) => `/comissoes?de=${de}&ate=${ate}${escolhido && ehDono ? `&p=${escolhido.id}` : ""}`;
  const atalhoAtivo = (de: string, ate: string) => de === periodo.de && ate === periodo.ate;

  return (
    <div className="flex flex-1 flex-col bg-stone-100 pb-20 md:pb-0 md:pl-56">
      <Cabecalho salao={salao} atual="/comissoes" />
      <main className="mx-auto w-full max-w-3xl flex-1 space-y-4 px-4 py-5">
        <div className="flex flex-wrap gap-2">
          {ehDono && (
            <Link href="/comissoes/pagar" className="rounded-lg bg-rose-700 px-4 py-2 text-sm font-semibold text-white hover:bg-rose-800">
              Pagar comissões
            </Link>
          )}
          <Link href="/comissoes/pagamentos" className="rounded-lg px-4 py-2 text-sm font-semibold text-rose-700 ring-1 ring-rose-200 hover:bg-rose-50">
            {ehDono ? "Pagamentos registrados" : "Meus pagamentos"}
          </Link>
        </div>
        <div>
          <h1 className="text-xl font-semibold text-stone-900">{ehDono ? "Extrato de comissões" : "Minhas comissões"}</h1>
          <p className="text-sm text-stone-500">Comissões gravadas no fechamento das comandas. Comanda reaberta aparece como estorno na data da reabertura.</p>
        </div>

        {!escolhido ? (
          <Mensagem tipo="aviso">
            {ehDono
              ? "Cadastre os profissionais em Quem atende para ver o extrato."
              : "Seu acesso não está ligado a um cadastro em Quem atende. Peça ao dono para ligar."}
          </Mensagem>
        ) : (
          <>
            <section className="space-y-3 rounded-2xl bg-white p-4 shadow-sm ring-1 ring-stone-200">
              <nav className="flex flex-wrap gap-2" aria-label="Períodos">
                {atalhosDePeriodo(hoje).map((a) => (
                  <Link
                    key={a.id}
                    href={link(a.periodo.de, a.periodo.ate)}
                    className={`rounded-lg px-3 py-1.5 text-sm font-medium ring-1 ${
                      atalhoAtivo(a.periodo.de, a.periodo.ate) ? "bg-rose-50 text-rose-800 ring-rose-200" : "text-stone-700 ring-stone-300 hover:bg-stone-50"
                    }`}
                  >
                    {a.rotulo}
                  </Link>
                ))}
              </nav>
              <form className="flex flex-wrap items-end gap-3" action="/comissoes">
                {ehDono && (
                  <label className="block">
                    <span className="text-sm text-stone-700">Quem</span>
                    <select name="p" defaultValue={escolhido.id} className={`${campo} mt-1 block`}>
                      {opcoes.map((p) => (
                        <option key={p.id} value={p.id}>
                          {p.nome}
                          {p.tipo === "assistente" ? " (assistente)" : ""}
                          {p.ativo ? "" : " (inativo)"}
                        </option>
                      ))}
                    </select>
                  </label>
                )}
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

            <section className="rounded-2xl bg-white p-5 shadow-sm ring-1 ring-stone-200">
              <p className="text-sm text-stone-500">
                {escolhido.nome} · {dataCurta(periodo.de)} a {dataCurta(periodo.ate)}
              </p>
              <p className="mt-1 text-3xl font-semibold text-stone-900">{formatarReais(total)}</p>
              <p className="text-sm text-stone-500">
                {quantidadeTotal} {quantidadeTotal === 1 ? "lançamento" : "lançamentos"}
                {estornos.length > 0 && " (inclui estornos)"}
              </p>
              {error && <Mensagem tipo="erro">Não foi possível carregar o extrato. Tente de novo.</Mensagem>}
              {quantidadeTotal > linhas.length && (
                <Mensagem tipo="aviso">
                  O total está completo, mas a lista mostra só {linhas.length} de {quantidadeTotal} lançamentos. Escolha um período menor para ver todos.
                </Mensagem>
              )}
            </section>

            {linhas.length > 0 && (
              <ul className="divide-y divide-stone-100 rounded-2xl bg-white shadow-sm ring-1 ring-stone-200">
                {linhas.map((l) => (
                  <li key={l.id} className="flex justify-between gap-3 px-4 py-3 text-sm">
                    <div className="min-w-0">
                      <p className="font-medium text-stone-900">
                        {l.item_nome}
                        {l.estorno && <span className="ml-2 rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-900">estorno: comanda reaberta</span>}
                      </p>
                      <p className="text-xs text-stone-500">
                        {quandoBrasilia(l.criado_em)}
                        {l.cliente_nome ? ` · ${l.cliente_nome}` : ""}
                      </p>
                      <p className="text-xs text-stone-500">{detalhe(l)}</p>
                      <p className={`text-xs font-medium ${l.pago_em ? "text-emerald-700" : "text-stone-500"}`}>{l.pago_em ? `Pago em ${dataCurta(l.pago_em)}` : "A pagar"}</p>
                      {ehDono && (
                        <Link href={`/comandas/${l.comanda_id}`} className="text-xs font-medium text-rose-700 hover:underline">
                          Ver comanda
                        </Link>
                      )}
                    </div>
                    <span className={`shrink-0 font-semibold ${l.valor_centavos < 0 ? "text-amber-800" : "text-stone-900"}`}>{formatarReais(l.valor_centavos)}</span>
                  </li>
                ))}
              </ul>
            )}
            {linhas.length === 0 && !error && <p className="px-1 text-sm text-stone-500">Nenhuma comissão neste período.</p>}
          </>
        )}
      </main>
    </div>
  );
}

/** "Valor R$ 200,00 · 50% · taxa R$ 3,98 · assistente R$ 19,60" */
function detalhe(l: Linha): string {
  const partes: string[] = [];
  if (l.valor_item_centavos !== null) partes.push(`${l.papel === "assistente" ? "Ajudou em serviço de" : "Valor"} ${formatarReais(Number(l.valor_item_centavos))}`);
  if (l.papel === "profissional" && l.percentual !== null) partes.push(`${centesimosParaTexto(l.percentual).replace(/,00$/, "")}%`);
  if (l.taxa_centavos) partes.push(`taxa do cartão ${formatarReais(Number(l.taxa_centavos))}`);
  if (l.parte_assistente_centavos) partes.push(`parte do assistente ${formatarReais(Number(l.parte_assistente_centavos))}`);
  return partes.join(" · ");
}
