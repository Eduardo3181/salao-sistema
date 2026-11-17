import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { Suspense } from "react";
import { Cabecalho } from "@/components/cabecalho";
import { dataValida, hojeBrasilia, lerHora, minutosNoDia, proximoHorarioRedondo } from "@/lib/agenda";
import { buscarConfiguracao, podeEditarClientes } from "@/lib/clientes";
import { buscarCatalogo } from "@/lib/servicos";
import { exigirSalao } from "@/lib/sessao";
import Marcacao from "./marcacao";

export const metadata: Metadata = { title: "Marcar horário | Sistema do Salão" };

export default function PaginaNovoHorario({ searchParams }: PageProps<"/agenda/novo">) {
  return (
    <Suspense fallback={<p className="p-6 text-sm text-stone-500">Carregando...</p>}>
      <NovoHorario searchParams={searchParams} />
    </Suspense>
  );
}

async function NovoHorario({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const sp = await searchParams;
  const { supabase, salao, ehDono } = await exigirSalao();
  if (salao.perfil === "assistente") redirect("/agenda");

  const hoje = hojeBrasilia();
  const data = typeof sp.data === "string" && dataValida(sp.data) ? sp.data : hoje;
  const pedida = lerHora(typeof sp.hora === "string" ? sp.hora : null);
  const sugerida =
    pedida ?? (data === hoje ? Math.min(proximoHorarioRedondo(minutosNoDia(new Date().toISOString(), data)), 23 * 60) : 9 * 60);

  const [{ data: colunas }, catalogo, config] = await Promise.all([
    supabase.rpc("minhas_agendas", { p_salao_id: salao.salaoId }),
    buscarCatalogo(supabase, salao.salaoId),
    buscarConfiguracao(supabase, salao.salaoId),
  ]);
  const profissionais = (colunas ?? []) as { id: string; nome: string }[];
  const prof = profissionais.find((p) => p.id === sp.prof)?.id ?? profissionais[0]?.id ?? "";

  return (
    <div className="flex flex-1 flex-col bg-stone-100 pb-20 md:pb-0 md:pl-56">
      <Cabecalho salao={salao} atual="/agenda" />
      <main className="mx-auto w-full max-w-2xl flex-1 px-4 py-5">
        <h1 className="mb-4 text-xl font-semibold text-stone-900">Marcar horário</h1>
        {profissionais.length === 0 ? (
          <p className="rounded-2xl bg-white p-6 text-stone-600 ring-1 ring-stone-200">
            Não há agenda disponível para você marcar. Cadastre quem atende (ou peça ao dono para ligar sua conta ao seu cadastro).
          </p>
        ) : (
          <Marcacao
            dataInicial={data}
            horaInicial={sugerida}
            profissionalInicial={prof}
            profissionais={profissionais}
            categorias={catalogo.categorias.filter((c) => c.ativo)}
            servicos={catalogo.servicos.filter((s) => s.ativo)}
            podeCadastrarCliente={podeEditarClientes(salao.perfil, config.profissionaisEditamClientes)}
            podeCadastrarServico={ehDono}
            podeEscolherProfissional={salao.perfil !== "profissional"}
          />
        )}
      </main>
    </div>
  );
}
