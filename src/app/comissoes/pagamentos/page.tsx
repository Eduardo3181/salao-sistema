import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { Cabecalho } from "@/components/cabecalho";
import { formatarReais } from "@/lib/dinheiro";
import { NOME_MEIO } from "@/lib/pagamento-comissoes";
import { dataCurta } from "@/lib/periodos";
import { buscarProfissionais } from "@/lib/profissionais";
import { exigirSalao } from "@/lib/sessao";

export const metadata: Metadata = { title: "Pagamentos de comissão | Sistema do Salão" };

export default function PaginaPagamentos() {
  return (
    <Suspense fallback={<p className="p-6 text-sm text-stone-500">Carregando...</p>}>
      <Pagamentos />
    </Suspense>
  );
}

type Linha = {
  id: string;
  profissional_id: string;
  valor_centavos: number;
  meio: keyof typeof NOME_MEIO;
  pago_em: string;
  ate: string;
  primeiro_lancamento: string;
  cancelado_em: string | null;
};

async function Pagamentos() {
  const { supabase, salao, ehDono } = await exigirSalao();
  // A RLS devolve todos para o dono e só os próprios para os demais.
  const [{ data, error }, equipe] = await Promise.all([
    supabase
      .from("pagamentos_comissao")
      .select("id, profissional_id, valor_centavos, meio, pago_em, ate, primeiro_lancamento, cancelado_em")
      .eq("salao_id", salao.salaoId)
      .order("criado_em", { ascending: false })
      .limit(200),
    buscarProfissionais(supabase, salao.salaoId),
  ]);
  if (error) console.error("pagamentos de comissão (leitura) falhou:", error.code);
  const linhas = (data ?? []) as Linha[];
  const nomeDe = new Map(equipe.map((p) => [p.id, p.nome]));

  return (
    <div className="flex flex-1 flex-col bg-stone-100 pb-20 md:pb-0 md:pl-56">
      <Cabecalho salao={salao} atual="/comissoes" />
      <main className="mx-auto w-full max-w-3xl flex-1 space-y-4 px-4 py-5">
        <Link href="/comissoes" className="text-sm font-medium text-stone-600 hover:underline">
          ‹ Voltar para o extrato
        </Link>
        <div className="flex items-center justify-between gap-4">
          <h1 className="text-xl font-semibold text-stone-900">{ehDono ? "Pagamentos de comissão" : "Meus pagamentos"}</h1>
          {ehDono && (
            <Link href="/comissoes/pagar" className="rounded-lg bg-rose-700 px-4 py-2 text-sm font-semibold text-white hover:bg-rose-800">
              Pagar comissões
            </Link>
          )}
        </div>
        {linhas.length === 0 ? (
          <p className="px-1 text-sm text-stone-500">{error ? "Não foi possível carregar. Tente de novo." : "Nenhum pagamento registrado ainda."}</p>
        ) : (
          <ul className="divide-y divide-stone-100 rounded-2xl bg-white shadow-sm ring-1 ring-stone-200">
            {linhas.map((p) => (
              <li key={p.id}>
                <Link href={`/comissoes/pagamentos/${p.id}`} className="flex justify-between gap-3 px-4 py-3 text-sm hover:bg-stone-50">
                  <span className="min-w-0">
                    <span className={`block font-medium ${p.cancelado_em ? "text-stone-400 line-through" : "text-stone-900"}`}>
                      {nomeDe.get(p.profissional_id) ?? "Profissional"}
                    </span>
                    <span className="block text-xs text-stone-500">
                      Pago em {dataCurta(p.pago_em)} · {NOME_MEIO[p.meio]} · de {dataCurta(p.primeiro_lancamento)} a {dataCurta(p.ate)}
                      {p.cancelado_em && " · cancelado"}
                    </span>
                  </span>
                  <span className={`shrink-0 font-semibold ${p.cancelado_em ? "text-stone-400 line-through" : "text-stone-900"}`}>
                    {formatarReais(Number(p.valor_centavos))}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </main>
    </div>
  );
}
