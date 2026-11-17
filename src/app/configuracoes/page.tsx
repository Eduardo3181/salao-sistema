import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { Suspense } from "react";
import { salvarConfiguracao } from "@/app/clientes/acoes";
import { Cabecalho } from "@/components/cabecalho";
import { Mensagem } from "@/components/ui";
import FormHorarios from "@/components/form-horarios";
import { buscarConfiguracao } from "@/lib/clientes";
import { resumirHorarios, type HorarioDia } from "@/lib/horarios";
import { exigirSalao } from "@/lib/sessao";

export const metadata: Metadata = { title: "Configurações | Sistema do Salão" };

export default function PaginaConfiguracoes({ searchParams }: PageProps<"/configuracoes">) {
  return (
    <Suspense fallback={<p className="p-6 text-sm text-stone-500">Carregando...</p>}>
      <Configuracoes searchParams={searchParams} />
    </Suspense>
  );
}

async function Configuracoes({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const sp = await searchParams;
  const { supabase, salao, ehDono } = await exigirSalao();
  if (!ehDono) redirect("/painel");
  const [config, { data: horarios }] = await Promise.all([
    buscarConfiguracao(supabase, salao.salaoId),
    supabase
      .from("horarios_funcionamento")
      .select("dia_semana, abre, fecha")
      .eq("salao_id", salao.salaoId)
      .is("profissional_id", null),
  ]);
  const dias = (horarios ?? []) as HorarioDia[];

  return (
    <div className="flex flex-1 flex-col bg-stone-100">
      <Cabecalho salao={salao} atual="/configuracoes" />

      <main className="mx-auto w-full max-w-3xl flex-1 space-y-6 px-4 py-6">
        <h1 className="text-xl font-semibold text-stone-900">Configurações</h1>
        {sp.salvo === "1" && <Mensagem tipo="aviso">Configuração salva. Vale a partir de agora.</Mensagem>}

        <section className="rounded-2xl bg-white p-6 shadow-sm ring-1 ring-stone-200">
          <h2 className="font-semibold text-stone-900">Horário de funcionamento do salão</h2>
          <p className="mt-1 text-sm text-stone-500">Agora: {resumirHorarios(dias)}. A agenda usa estes horários, em blocos de 30 minutos.</p>
          <div className="mt-4">
            <FormHorarios dias={dias} />
          </div>
        </section>

        <form action={salvarConfiguracao} className="rounded-2xl bg-white p-6 shadow-sm ring-1 ring-stone-200">
          <h2 className="font-semibold text-stone-900">Permissões</h2>
          <label className="mt-4 flex items-start gap-3">
            <input
              type="checkbox"
              name="profissionais_editam_clientes"
              defaultChecked={config.profissionaisEditamClientes}
              className="mt-1 h-5 w-5 shrink-0 accent-rose-700"
            />
            <span>
              <span className="block text-sm font-medium text-stone-900">Profissionais podem cadastrar e alterar clientes</span>
              <span className="block text-xs text-stone-500">
                Começa ligado. Dono e recepção sempre podem. Desligado: profissionais só consultam a ficha. Profissionais nunca veem o telefone das clientes; assistentes não acessam clientes.
              </span>
            </span>
          </label>
          <label className="mt-4 flex items-start gap-3">
            <input
              type="checkbox"
              name="exigir_motivo_cancelamento"
              defaultChecked={config.exigirMotivoCancelamento}
              className="mt-1 h-5 w-5 shrink-0 accent-rose-700"
            />
            <span>
              <span className="block text-sm font-medium text-stone-900">Exigir motivo ao cancelar um horário</span>
              <span className="block text-xs text-stone-500">
                Começa ligado. Ligado: quem cancela escolhe o motivo (cliente desmarcou, salão desmarcou, outro).
              </span>
            </span>
          </label>
          <button className="mt-5 rounded-lg bg-rose-700 px-4 py-2.5 text-sm font-semibold text-white hover:bg-rose-800">
            Salvar
          </button>
          <p className="mt-2 text-xs text-stone-500">Toda mudança aqui fica anotada no registro de atividades.</p>
        </form>

        <section className="rounded-2xl bg-white p-6 shadow-sm ring-1 ring-stone-200">
          <h2 className="font-semibold text-stone-900">Importar planilha</h2>
          <p className="mt-1 text-sm text-stone-500">Traga clientes ou serviços de uma planilha do Excel ou de outro sistema.</p>
          <Link href="/importar" className="mt-4 inline-block rounded-lg px-4 py-2 text-sm font-semibold text-rose-700 ring-1 ring-rose-200 hover:bg-rose-50">
            Importar planilha
          </Link>
        </section>
      </main>
    </div>
  );
}
