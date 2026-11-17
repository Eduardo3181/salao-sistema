import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { Suspense } from "react";
import { Cabecalho } from "@/components/cabecalho";
import { CONFIG_VAZIA, type LinhaConfigComissao, type LinhaRegraComissao } from "@/lib/comissoes-config";
import { buscarProfissionais } from "@/lib/profissionais";
import { buscarCatalogo } from "@/lib/servicos";
import { exigirSalao } from "@/lib/sessao";
import FormComissoes from "./form-comissoes";

export const metadata: Metadata = { title: "Comissões | Sistema do Salão" };

export default function PaginaComissoes() {
  return (
    <Suspense fallback={<p className="p-6 text-sm text-stone-500">Carregando...</p>}>
      <Conteudo />
    </Suspense>
  );
}

async function Conteudo() {
  const { supabase, salao, ehDono } = await exigirSalao();
  if (!ehDono) redirect("/painel");

  const [{ data: config }, { data: regras }, equipe, catalogo, { data: taxas }] = await Promise.all([
    supabase.from("configuracao_comissao").select("*").eq("salao_id", salao.salaoId).maybeSingle(),
    supabase.from("regras_comissao").select("profissional_id, servico_id, percentual").eq("salao_id", salao.salaoId),
    buscarProfissionais(supabase, salao.salaoId),
    buscarCatalogo(supabase, salao.salaoId),
    supabase.from("taxas_cartao").select("forma, parcelas, taxa_centesimos").eq("salao_id", salao.salaoId),
  ]);

  return (
    <div className="flex flex-1 flex-col bg-stone-100 pb-20 md:pb-0 md:pl-56">
      <Cabecalho salao={salao} atual="/configuracoes" />
      <main className="mx-auto w-full max-w-3xl flex-1 space-y-5 px-4 py-6">
        <Link href="/configuracoes" className="text-sm font-medium text-stone-600 hover:underline">
          ‹ Voltar para Configurações
        </Link>
        <div>
          <h1 className="text-xl font-semibold text-stone-900">Comissões</h1>
          <p className="text-sm text-stone-500">
            Como o salão paga profissionais e assistentes. Mudanças valem para as próximas comandas; as já fechadas guardam a regra do dia.
          </p>
        </div>
        <FormComissoes
          config={(config as LinhaConfigComissao | null) ?? CONFIG_VAZIA}
          regras={(regras ?? []) as LinhaRegraComissao[]}
          profissionais={equipe.filter((p) => p.ativo && p.tipo === "profissional").map((p) => ({ id: p.id, nome: p.nome }))}
          temAssistentes={equipe.some((p) => p.ativo && p.tipo === "assistente")}
          servicos={catalogo.servicos.filter((s) => s.ativo).map((s) => ({ id: s.id, nome: s.nome, preco: Number(s.preco_centavos) }))}
          taxas={(taxas ?? []) as { forma: string; parcelas: number; taxa_centesimos: number }[]}
        />
      </main>
    </div>
  );
}
