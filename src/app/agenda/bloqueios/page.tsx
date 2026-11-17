import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { Cabecalho } from "@/components/cabecalho";
import { dataValida, hojeBrasilia } from "@/lib/agenda";
import { exigirSalao } from "@/lib/sessao";
import Formulario from "./formulario";
import BotaoApagar from "./botao-apagar";

export const metadata: Metadata = { title: "Bloqueios | Sistema do Salão" };

export default function PaginaBloqueios({ searchParams }: PageProps<"/agenda/bloqueios">) {
  return (
    <Suspense fallback={<p className="p-6 text-sm text-stone-500">Carregando...</p>}>
      <Bloqueios searchParams={searchParams} />
    </Suspense>
  );
}

type Linha = { id: string; profissional_id: string | null; inicio: string; fim: string; motivo: string | null; profissionais: { nome: string } | null };

const partes = (iso: string) => {
  const f = new Intl.DateTimeFormat("pt-BR", {
    timeZone: "America/Sao_Paulo",
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(new Date(iso));
  const v = (t: string) => f.find((p) => p.type === t)?.value ?? "";
  return { dia: `${v("day")}/${v("month")}`, hora: `${v("hour")}:${v("minute")}` };
};

/** "24/12 (dia inteiro)", "24/12 a 26/12 (dias inteiros)", "24/12 · 12:00–13:30" ou "24/12 12:00 até 26/12 18:00". */
function periodoPorExtenso(inicio: string, fim: string): string {
  const a = partes(inicio);
  const b = partes(fim);
  if (a.hora === "00:00" && b.hora === "00:00") {
    const ultimo = partes(new Date(new Date(fim).getTime() - 86400000).toISOString()).dia;
    return ultimo === a.dia ? `${a.dia} (dia inteiro)` : `${a.dia} a ${ultimo} (dias inteiros)`;
  }
  return a.dia === b.dia ? `${a.dia} · ${a.hora}–${b.hora}` : `${a.dia} ${a.hora} até ${b.dia} ${b.hora}`;
}

async function Bloqueios({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const sp = await searchParams;
  const { supabase, salao } = await exigirSalao();

  // A RLS só devolve os bloqueios das agendas que a pessoa vê (e os feriados).
  const [{ data: linhas }, { data: colunasR }] = await Promise.all([
    supabase
      .from("bloqueios")
      .select("id, profissional_id, inicio, fim, motivo, profissionais(nome)")
      .eq("salao_id", salao.salaoId)
      .gt("fim", new Date().toISOString())
      .order("inicio")
      .limit(200),
    supabase.rpc("minhas_agendas", { p_salao_id: salao.salaoId }),
  ]);
  const bloqueios = (linhas ?? []) as unknown as Linha[];
  const colunas = (colunasR ?? []) as { id: string; nome: string }[];
  const minhasIds = new Set(colunas.map((c) => c.id));

  const perfil = salao.perfil;
  const podeCriar = perfil === "dono" || perfil === "recepcao" || (perfil === "profissional" && colunas.length > 0);
  const podeApagar = (b: Linha) =>
    perfil === "dono" ||
    (b.profissional_id !== null && (perfil === "recepcao" || (perfil === "profissional" && minhasIds.has(b.profissional_id))));

  const data = typeof sp.data === "string" && dataValida(sp.data) && sp.data >= hojeBrasilia() ? sp.data : hojeBrasilia();
  const prof = typeof sp.prof === "string" && minhasIds.has(sp.prof) ? sp.prof : (colunas[0]?.id ?? "");

  return (
    <div className="flex flex-1 flex-col bg-stone-100 pb-20 md:pb-0 md:pl-56">
      <Cabecalho salao={salao} atual="/agenda" />
      <main className="mx-auto w-full max-w-2xl flex-1 space-y-4 px-4 py-5">
        <Link href={`/agenda?data=${data}`} className="text-sm font-medium text-stone-600 hover:underline">
          ‹ Voltar para a agenda
        </Link>
        <div>
          <h1 className="text-xl font-semibold text-stone-900">Bloqueios e feriados</h1>
          <p className="text-sm text-stone-500">Folga, médico, curso ou feriado: o horário fica fechado na agenda.</p>
        </div>

        {podeCriar ? (
          <Formulario
            profissionais={colunas}
            podeFeriado={perfil === "dono"}
            podeEscolher={perfil !== "profissional"}
            dataInicial={data}
            profInicial={prof}
          />
        ) : (
          <p className="rounded-2xl bg-white p-5 text-sm text-stone-600 shadow-sm ring-1 ring-stone-200">
            Quem cria bloqueios é a profissional (na própria agenda), a recepção ou o dono.
          </p>
        )}

        <section className="space-y-3 rounded-2xl bg-white p-5 shadow-sm ring-1 ring-stone-200">
          <h2 className="font-semibold text-stone-900">Próximos bloqueios</h2>
          {bloqueios.length === 0 ? (
            <p className="text-sm text-stone-500">Nenhum bloqueio daqui para frente.</p>
          ) : (
            <ul className="divide-y divide-stone-100 rounded-xl ring-1 ring-stone-200">
              {bloqueios.map((b) => (
                <li key={b.id} className="flex items-start justify-between gap-3 px-4 py-3 text-sm">
                  <span>
                    <span className="block font-semibold text-stone-900">{periodoPorExtenso(b.inicio, b.fim)}</span>
                    <span className="block text-stone-700">
                      {b.profissional_id === null ? "Salão inteiro (feriado)" : (b.profissionais?.nome ?? "Profissional")}
                    </span>
                    {b.motivo && <span className="block text-stone-500">{b.motivo}</span>}
                  </span>
                  {podeApagar(b) && <BotaoApagar id={b.id} />}
                </li>
              ))}
            </ul>
          )}
        </section>
      </main>
    </div>
  );
}
