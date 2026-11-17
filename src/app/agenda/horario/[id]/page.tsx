import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { Cabecalho } from "@/components/cabecalho";
import { dataValida, minutosNoDia } from "@/lib/agenda";
import { buscarConfiguracao, podeVerClientes, podeVerTelefone } from "@/lib/clientes";
import { exigirSalao } from "@/lib/sessao";
import { linkWhatsApp } from "@/lib/telefone-data";
import Detalhe from "./detalhe";

export const metadata: Metadata = { title: "Horário | Sistema do Salão" };

export default function PaginaHorario({ params, searchParams }: PageProps<"/agenda/horario/[id]">) {
  return (
    <Suspense fallback={<p className="p-6 text-sm text-stone-500">Carregando...</p>}>
      <Horario params={params} searchParams={searchParams} />
    </Suspense>
  );
}

type ItemLinha = {
  id: string;
  profissional_id: string;
  inicio: string;
  fim: string;
  preco_centavos: number;
  servicos: { nome: string } | null;
  profissionais: { nome: string } | null;
};

async function Horario({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const [{ id }, sp] = await Promise.all([params, searchParams]);
  const { supabase, salao } = await exigirSalao();

  // A RLS só devolve o agendamento e os serviços que a pessoa pode ver.
  const [{ data: ag }, { data: itensR }, { data: pode }, { data: colunas }, config] = await Promise.all([
    supabase.from("agendamentos").select("id, situacao, motivo_cancelamento, cliente_id, clientes(nome)").eq("id", id).maybeSingle(),
    supabase
      .from("agendamento_itens")
      .select("id, profissional_id, inicio, fim, preco_centavos, servicos(nome), profissionais(nome)")
      .eq("agendamento_id", id)
      .order("inicio"),
    supabase.rpc("pode_mexer_agendamento", { p_agendamento_id: id }),
    supabase.rpc("minhas_agendas", { p_salao_id: salao.salaoId }),
    buscarConfiguracao(supabase, salao.salaoId),
  ]);
  const itens = (itensR ?? []) as unknown as ItemLinha[];
  if (!ag || itens.length === 0) notFound();

  const dataDoItem = (iso: string) => new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo" }).format(new Date(iso));
  const voltarData = typeof sp.data === "string" && dataValida(sp.data) ? sp.data : dataDoItem(itens[0].inicio);

  const cliente = (ag as unknown as { clientes: { nome: string } | null }).clientes;
  let whatsapp: string | null = null;
  if (podeVerTelefone(salao.perfil)) {
    const { data: c } = await supabase.rpc("clientes_do_salao", { p_salao_id: salao.salaoId, p_id: ag.cliente_id });
    whatsapp = linkWhatsApp(((c ?? []) as { telefone: string | null }[])[0]?.telefone);
  }

  const podeRemarcar = salao.perfil === "dono" || salao.perfil === "recepcao" || salao.perfil === "profissional";

  return (
    <div className="flex flex-1 flex-col bg-stone-100 pb-20 md:pb-0 md:pl-56">
      <Cabecalho salao={salao} atual="/agenda" />
      <main className="mx-auto w-full max-w-2xl flex-1 space-y-4 px-4 py-5">
        <Link href={`/agenda?data=${voltarData}`} className="text-sm font-medium text-stone-600 hover:underline">
          ‹ Voltar para a agenda
        </Link>
        <Detalhe
          agendamentoId={ag.id}
          situacao={ag.situacao}
          motivo={ag.motivo_cancelamento}
          cliente={cliente?.nome ?? "Cliente"}
          clienteHref={podeVerClientes(salao.perfil) ? `/clientes/${ag.cliente_id}` : null}
          whatsapp={whatsapp}
          itens={itens.map((i) => {
            const data = dataDoItem(i.inicio);
            return {
              id: i.id,
              servico: i.servicos?.nome ?? "Serviço",
              profissionalId: i.profissional_id,
              profissional: i.profissionais?.nome ?? "",
              data,
              inicio: minutosNoDia(i.inicio, data),
              duracao: Math.round((new Date(i.fim).getTime() - new Date(i.inicio).getTime()) / 60000),
              precoCentavos: Number(i.preco_centavos),
            };
          })}
          podeMexer={Boolean(pode)}
          podeRemarcar={podeRemarcar}
          podeTrocarProfissional={salao.perfil === "dono" || salao.perfil === "recepcao"}
          profissionais={(colunas ?? []) as { id: string; nome: string }[]}
          exigirMotivo={config.exigirMotivoCancelamento}
          voltarData={voltarData}
        />
      </main>
    </div>
  );
}
