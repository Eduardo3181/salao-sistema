import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { Cabecalho } from "@/components/cabecalho";
import { hojeBrasilia } from "@/lib/agenda";
import { formatarReais } from "@/lib/dinheiro";
import { NOME_MEIO } from "@/lib/pagamento-comissoes";
import { dataCurta } from "@/lib/periodos";
import { buscarProfissionais } from "@/lib/profissionais";
import { exigirSalao } from "@/lib/sessao";
import { CancelarVale, NovoVale } from "./form-vale";

export const metadata: Metadata = { title: "Vales | Sistema do Salão" };

export default function PaginaVales() {
  return (
    <Suspense fallback={<p className="p-6 text-sm text-stone-500">Carregando...</p>}>
      <Vales />
    </Suspense>
  );
}

type Linha = {
  id: string;
  profissional_id: string;
  valor_centavos: number;
  dado_em: string;
  meio: keyof typeof NOME_MEIO;
  observacao: string | null;
  cancelado_em: string | null;
  motivo_cancelamento: string | null;
  vale_descontos: { valor_centavos: number; pagamentos_comissao: { cancelado_em: string | null; pago_em: string } | null }[];
};

async function Vales() {
  const { supabase, salao, ehDono } = await exigirSalao();
  // A RLS devolve todos para o dono e só os próprios para os demais.
  const [{ data, error }, equipe] = await Promise.all([
    supabase
      .from("vales")
      .select("id, profissional_id, valor_centavos, dado_em, meio, observacao, cancelado_em, motivo_cancelamento, vale_descontos(valor_centavos, pagamentos_comissao(cancelado_em, pago_em))")
      .eq("salao_id", salao.salaoId)
      .order("dado_em", { ascending: false })
      .order("criado_em", { ascending: false })
      .limit(300),
    buscarProfissionais(supabase, salao.salaoId),
  ]);
  if (error) console.error("vales (leitura) falhou:", error.code);
  const nomeDe = new Map(equipe.map((p) => [p.id, p.nome]));
  const vales = ((data ?? []) as unknown as Linha[]).map((v) => {
    // Descontos de pagamentos cancelados não contam (o vale volta a ficar em aberto).
    const descontos = v.vale_descontos.filter((d) => d.pagamentos_comissao && !d.pagamentos_comissao.cancelado_em);
    const descontado = descontos.reduce((s, d) => s + Number(d.valor_centavos), 0);
    return { ...v, valor: Number(v.valor_centavos), saldo: Number(v.valor_centavos) - descontado, descontos };
  });
  const emAberto = vales.filter((v) => !v.cancelado_em).reduce((s, v) => s + v.saldo, 0);

  return (
    <div className="flex flex-1 flex-col bg-stone-100 pb-20 md:pb-0 md:pl-56">
      <Cabecalho salao={salao} atual="/comissoes" />
      <main className="mx-auto w-full max-w-3xl flex-1 space-y-4 px-4 py-5">
        <Link href="/comissoes" className="text-sm font-medium text-stone-600 hover:underline">
          ‹ Voltar para o extrato
        </Link>
        <div>
          <h1 className="text-xl font-semibold text-stone-900">{ehDono ? "Vales" : "Meus vales"}</h1>
          <p className="text-sm text-stone-500">
            Adiantamentos de comissão. {ehDono ? "Na hora de pagar a comissão, você escolhe quanto descontar: tudo, uma parte ou nada." : "O dono desconta no pagamento da comissão."}
          </p>
        </div>

        {ehDono && (
          <NovoVale
            hoje={hojeBrasilia()}
            pessoas={equipe.filter((p) => p.ativo).map((p) => ({ id: p.id, nome: p.nome + (p.tipo === "assistente" ? " (assistente)" : "") }))}
          />
        )}

        <section className="rounded-2xl bg-white p-5 shadow-sm ring-1 ring-stone-200">
          <p className="text-sm text-stone-500">Em aberto (ainda não descontado)</p>
          <p className="mt-1 text-2xl font-semibold text-stone-900">{formatarReais(emAberto)}</p>
        </section>

        {vales.length === 0 ? (
          <p className="px-1 text-sm text-stone-500">{error ? "Não foi possível carregar. Tente de novo." : "Nenhum vale registrado."}</p>
        ) : (
          <ul className="divide-y divide-stone-100 rounded-2xl bg-white shadow-sm ring-1 ring-stone-200">
            {vales.map((v) => (
              <li key={v.id} className="space-y-1 px-4 py-3 text-sm">
                <div className="flex justify-between gap-3">
                  <span className="min-w-0">
                    <span className={`block font-medium ${v.cancelado_em ? "text-stone-400 line-through" : "text-stone-900"}`}>
                      {nomeDe.get(v.profissional_id) ?? "Profissional"}
                    </span>
                    <span className="block text-xs text-stone-500">
                      {dataCurta(v.dado_em)} · {NOME_MEIO[v.meio]}
                      {v.observacao ? ` · ${v.observacao}` : ""}
                    </span>
                  </span>
                  <span className={`shrink-0 font-semibold ${v.cancelado_em ? "text-stone-400 line-through" : "text-stone-900"}`}>{formatarReais(v.valor)}</span>
                </div>
                <p className="text-xs">
                  {v.cancelado_em ? (
                    <span className="text-red-700">Cancelado: {v.motivo_cancelamento}</span>
                  ) : v.saldo === 0 ? (
                    <span className="text-emerald-700">Descontado</span>
                  ) : v.saldo < v.valor ? (
                    <span className="text-amber-800">Falta descontar {formatarReais(v.saldo)}</span>
                  ) : (
                    <span className="text-amber-800">Em aberto</span>
                  )}
                  {v.descontos.length > 0 &&
                    ` · descontado: ${v.descontos.map((d) => `${formatarReais(Number(d.valor_centavos))} em ${dataCurta(d.pagamentos_comissao!.pago_em)}`).join(", ")}`}
                </p>
                {ehDono && !v.cancelado_em && v.saldo === v.valor && <CancelarVale valeId={v.id} />}
              </li>
            ))}
          </ul>
        )}
      </main>
    </div>
  );
}
