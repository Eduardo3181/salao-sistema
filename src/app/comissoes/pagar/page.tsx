import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { Suspense } from "react";
import { Cabecalho } from "@/components/cabecalho";
import { Mensagem } from "@/components/ui";
import { dataValida, hojeBrasilia } from "@/lib/agenda";
import { quandoBrasilia } from "@/lib/comandas";
import { dataCurta } from "@/lib/periodos";
import { buscarProfissionais } from "@/lib/profissionais";
import { exigirSalao } from "@/lib/sessao";
import FormPagar from "./form-pagar";

export const metadata: Metadata = { title: "Pagar comissões | Sistema do Salão" };

export default function PaginaPagar({ searchParams }: PageProps<"/comissoes/pagar">) {
  return (
    <Suspense fallback={<p className="p-6 text-sm text-stone-500">Carregando...</p>}>
      <Pagar searchParams={searchParams} />
    </Suspense>
  );
}

async function Pagar({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const sp = await searchParams;
  const { supabase, salao, ehDono } = await exigirSalao();
  if (!ehDono) redirect("/comissoes");
  const hoje = hojeBrasilia();
  const ate = typeof sp.ate === "string" && dataValida(sp.ate) && sp.ate <= hoje ? sp.ate : hoje;

  const [equipe, { data, error }] = await Promise.all([
    buscarProfissionais(supabase, salao.salaoId),
    // Somado no banco: a consulta comum viria cortada em 1000 linhas.
    supabase.rpc("saldos_comissao_a_pagar", { p_salao_id: salao.salaoId, p_ate: ate }),
  ]);
  if (error) console.error("pagar comissões (leitura) falhou:", error.code);
  const nomeDe = new Map(equipe.map((p) => [p.id, p.nome]));
  const saldos = ((data ?? []) as { profissional_id: string; total_centavos: number; quantidade: number; mais_antigo: string }[])
    .map((s) => ({
      profissionalId: s.profissional_id,
      totalCentavos: Number(s.total_centavos),
      quantidade: Number(s.quantidade),
      maisAntigo: s.mais_antigo,
    }))
    .map((s) => ({ ...s, nome: nomeDe.get(s.profissionalId) ?? "Profissional", desde: quandoBrasilia(s.maisAntigo).slice(0, 5) }))
    .sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR"));

  return (
    <div className="flex flex-1 flex-col bg-stone-100 pb-20 md:pb-0 md:pl-56">
      <Cabecalho salao={salao} atual="/comissoes" />
      <main className="mx-auto w-full max-w-3xl flex-1 space-y-4 px-4 py-5">
        <Link href="/comissoes" className="text-sm font-medium text-stone-600 hover:underline">
          ‹ Voltar para o extrato
        </Link>
        <div>
          <h1 className="text-xl font-semibold text-stone-900">Pagar comissões</h1>
          <p className="text-sm text-stone-500">
            O sistema só <strong>anota</strong> o pagamento. O Pix, a transferência ou o dinheiro você faz fora do sistema, como sempre.
          </p>
        </div>

        <form className="flex flex-wrap items-end gap-3 rounded-2xl bg-white p-4 shadow-sm ring-1 ring-stone-200" action="/comissoes/pagar">
          <label className="block">
            <span className="text-sm text-stone-700">Quitar o que está a pagar até</span>
            <input
              type="date"
              name="ate"
              max={hoje}
              defaultValue={ate}
              className="mt-1 block rounded-lg border border-stone-300 bg-white px-3 py-2 text-base text-stone-900 outline-none focus:border-rose-600 focus:ring-2 focus:ring-rose-200"
            />
          </label>
          <button className="rounded-lg px-4 py-2.5 text-sm font-semibold text-rose-700 ring-1 ring-rose-200 hover:bg-rose-50">Atualizar</button>
          <p className="w-full text-xs text-stone-500">
            Entra tudo o que ainda não foi pago até {dataCurta(ate)}, inclusive de dias anteriores e estornos de comandas reabertas (como ajuste).
          </p>
        </form>

        {error && <Mensagem tipo="erro">Não foi possível carregar os valores. Tente de novo.</Mensagem>}
        {!error && <FormPagar key={ate} ate={ate} hoje={hoje} saldos={saldos} />}

        <Link href="/comissoes/pagamentos" className="inline-block px-1 text-sm font-medium text-rose-700 hover:underline">
          Ver pagamentos já registrados
        </Link>
      </main>
    </div>
  );
}
