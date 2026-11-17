import { ChevronLeft, ChevronRight, Plus } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { Cabecalho } from "@/components/cabecalho";
import {
  dataPorExtenso,
  dataValida,
  distribuirLadoALado,
  faixaDaGrade,
  hojeBrasilia,
  minutosNoDia,
  minutosParaHora,
  NOME_SITUACAO,
  PASSO_GRADE_MIN,
  somarDias,
} from "@/lib/agenda";
import { buscarAgendaDoDia, type BloqueioAgenda, type Coluna, type ItemAgenda } from "@/lib/agenda-dados";
import { exigirSalao } from "@/lib/sessao";
import SeletorData from "./seletor-data";

export const metadata: Metadata = { title: "Agenda | Sistema do Salão" };

export default function PaginaAgenda({ searchParams }: PageProps<"/agenda">) {
  return (
    <Suspense fallback={<p className="p-6 text-sm text-stone-500">Carregando...</p>}>
      <Agenda searchParams={searchParams} />
    </Suspense>
  );
}

const ALTURA_BLOCO = 48; // pixels por bloco de 30 minutos
const PX_POR_MIN = ALTURA_BLOCO / PASSO_GRADE_MIN;

/** Cores por situação (fundo claro + faixa à esquerda), com a legenda na tela. */
const COR: Record<string, { fundo: string; faixa: string; texto: string }> = {
  agendado: { fundo: "bg-sky-50", faixa: "border-sky-500", texto: "text-sky-900" },
  confirmado: { fundo: "bg-emerald-50", faixa: "border-emerald-500", texto: "text-emerald-900" },
  chegou: { fundo: "bg-amber-50", faixa: "border-amber-500", texto: "text-amber-900" },
  concluido: { fundo: "bg-stone-100", faixa: "border-stone-400", texto: "text-stone-700" },
  faltou: { fundo: "bg-red-50", faixa: "border-red-400", texto: "text-red-900" },
};
const AVATAR = ["bg-rose-100 text-rose-800", "bg-teal-100 text-teal-800", "bg-violet-100 text-violet-800", "bg-amber-100 text-amber-800", "bg-sky-100 text-sky-800"];

async function Agenda({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const sp = await searchParams;
  const { supabase, salao } = await exigirSalao();

  const hoje = hojeBrasilia();
  const data = typeof sp.data === "string" && dataValida(sp.data) ? sp.data : hoje;
  const { colunas, itens, bloqueios, salaoFechado } = await buscarAgendaDoDia(supabase, salao.salaoId, data);

  const agora = data === hoje ? minutosNoDia(new Date().toISOString(), data) : null;
  const faixa = faixaDaGrade(
    colunas.flatMap((c) => (c.expediente ? [c.expediente] : [])),
    [...itens, ...bloqueios.filter((b) => b.profissionalId)].map((x) => ({ inicio: x.inicio, fim: x.fim })),
  );
  const escolhida = colunas.find((c) => c.id === sp.prof) ?? colunas[0];
  const podeMarcar = salao.perfil !== "assistente" && colunas.length > 0;
  const extraProf = escolhida && colunas.length > 1 ? `&prof=${escolhida.id}` : "";

  return (
    <div className="flex flex-1 flex-col bg-stone-100 pb-20 md:pb-0 md:pl-56">
      <Cabecalho salao={salao} atual="/agenda" />

      <main className="flex-1 space-y-4 px-4 py-5 md:px-6">
        {/* Barra do dia */}
        <div className="flex flex-wrap items-center gap-2">
          <Link href={`/agenda?data=${somarDias(data, -1)}${extraProf}`} aria-label="Dia anterior" className="rounded-lg p-2 ring-1 ring-stone-300 hover:bg-white">
            <ChevronLeft aria-hidden className="h-4 w-4" />
          </Link>
          <h1 className="min-w-0 px-1 text-lg font-semibold text-stone-900">{maiusculaInicial(dataPorExtenso(data))}</h1>
          <Link href={`/agenda?data=${somarDias(data, 1)}${extraProf}`} aria-label="Próximo dia" className="rounded-lg p-2 ring-1 ring-stone-300 hover:bg-white">
            <ChevronRight aria-hidden className="h-4 w-4" />
          </Link>
          <span className="flex-1" />
          {data !== hoje && (
            <Link href={`/agenda${extraProf ? `?${extraProf.slice(1)}` : ""}`} className="rounded-lg px-3 py-2 text-sm font-medium ring-1 ring-stone-300 hover:bg-white">
              Hoje
            </Link>
          )}
          <SeletorData data={data} extra={extraProf} />
          {podeMarcar && (
            <Link
              href={`/agenda/novo?data=${data}${escolhida ? `&prof=${escolhida.id}` : ""}`}
              className="hidden items-center gap-1.5 rounded-lg bg-rose-700 px-4 py-2 text-sm font-semibold text-white hover:bg-rose-800 md:flex"
            >
              <Plus aria-hidden className="h-4 w-4" /> Novo horário
            </Link>
          )}
        </div>

        {/* Legenda */}
        <ul className="flex flex-wrap gap-2 text-xs" aria-label="Legenda das cores">
          {Object.entries(COR).map(([s, c]) => (
            <li key={s} className={`rounded-md border-l-4 px-2 py-1 ${c.fundo} ${c.faixa} ${c.texto}`}>
              {NOME_SITUACAO[s]}
            </li>
          ))}
        </ul>

        {colunas.length === 0 ? (
          <SemColunas perfil={salao.perfil} />
        ) : (
          <>
            {salaoFechado && colunas.every((c) => !c.expediente) && (
              <p className="rounded-lg bg-white px-4 py-3 text-sm text-stone-600 ring-1 ring-stone-200">
                O salão está fechado neste dia. Os horários de funcionamento ficam em Configurações.
              </p>
            )}
            <GradeComputador colunas={colunas} itens={itens} bloqueios={bloqueios} faixa={faixa} agora={agora} data={data} podeMarcar={podeMarcar} />
            <ListaCelular colunas={colunas} escolhida={escolhida} itens={itens} bloqueios={bloqueios} agora={agora} data={data} />
            {podeMarcar && (
              <Link
                href={`/agenda/novo?data=${data}${escolhida ? `&prof=${escolhida.id}` : ""}`}
                aria-label="Novo horário"
                className="fixed bottom-20 right-4 z-30 flex h-14 w-14 items-center justify-center rounded-full bg-rose-700 text-white shadow-lg hover:bg-rose-800 md:hidden"
              >
                <Plus aria-hidden className="h-7 w-7" />
              </Link>
            )}
          </>
        )}
      </main>
    </div>
  );
}

function SemColunas({ perfil }: { perfil: string }) {
  return (
    <section className="rounded-2xl bg-white p-6 text-stone-600 shadow-sm ring-1 ring-stone-200">
      {perfil === "dono"
        ? "Ninguém cadastrado em Quem atende ainda. Cadastre as profissionais (e você, se atende) para a agenda ganhar as colunas."
        : perfil === "profissional"
          ? "Sua conta ainda não está ligada a um cadastro em Quem atende. Peça ao dono do salão para fazer essa ligação."
          : perfil === "assistente"
            ? "O dono do salão ainda não escolheu quais profissionais você ajuda."
            : "Ninguém cadastrado em Quem atende ainda."}
    </section>
  );
}

const iniciais = (nome: string) =>
  nome
    .split(/\s+/)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase() ?? "")
    .join("");

/** Modelo A: colunas por profissional, grade de 30 minutos. */
function GradeComputador({
  colunas,
  itens,
  bloqueios,
  faixa,
  agora,
  data,
  podeMarcar,
}: {
  colunas: Coluna[];
  itens: ItemAgenda[];
  bloqueios: BloqueioAgenda[];
  faixa: { inicio: number; fim: number };
  agora: number | null;
  data: string;
  podeMarcar: boolean;
}) {
  const linhas = Array.from({ length: (faixa.fim - faixa.inicio) / PASSO_GRADE_MIN }, (_, i) => faixa.inicio + i * PASSO_GRADE_MIN);
  const altura = linhas.length * ALTURA_BLOCO;
  const topo = (min: number) => (Math.max(min, faixa.inicio) - faixa.inicio) * PX_POR_MIN;
  const tamanho = (ini: number, fim: number) => Math.max(14, (Math.min(fim, faixa.fim) - Math.max(ini, faixa.inicio)) * PX_POR_MIN);

  return (
    <section className="hidden overflow-x-auto rounded-2xl bg-white shadow-sm ring-1 ring-stone-200 md:block">
      <div className="min-w-max" style={{ display: "grid", gridTemplateColumns: `3.5rem repeat(${colunas.length}, minmax(11rem, 1fr))` }}>
        {/* cabeçalho das colunas */}
        <div className="sticky left-0 z-10 border-b border-stone-200 bg-white" />
        {colunas.map((c, i) => (
          <div key={c.id} className="flex items-center gap-2 border-b border-l border-stone-200 px-3 py-2.5">
            <span className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-xs font-semibold ${AVATAR[i % AVATAR.length]}`}>
              {iniciais(c.nome)}
            </span>
            <span className="min-w-0">
              <span className="block truncate text-sm font-medium text-stone-900">{c.nome}</span>
              <span className="block text-xs text-stone-500">
                {c.expediente ? `${minutosParaHora(c.expediente.abre)}–${minutosParaHora(c.expediente.fecha)}` : "Folga"}
              </span>
            </span>
          </div>
        ))}

        {/* horários */}
        <div className="sticky left-0 z-10 bg-white" style={{ height: altura }}>
          {linhas.map((m) => (
            <div key={m} className="border-t border-stone-100 pr-2 text-right text-[11px] text-stone-400" style={{ height: ALTURA_BLOCO }}>
              {m % 60 === 0 ? minutosParaHora(m) : ""}
            </div>
          ))}
        </div>

        {/* colunas */}
        {colunas.map((c) => {
          const meus = itens.filter((i) => i.profissionalId === c.id);
          const lado = distribuirLadoALado(meus);
          const meusBloqueios = bloqueios.filter((b) => b.profissionalId === c.id || b.profissionalId === null);
          return (
            <div key={c.id} className="relative border-l border-stone-200" style={{ height: altura }}>
              {linhas.map((m) =>
                podeMarcar ? (
                  <Link
                    key={m}
                    href={`/agenda/novo?data=${data}&prof=${c.id}&hora=${minutosParaHora(m)}`}
                    aria-label={`Marcar com ${c.nome} às ${minutosParaHora(m)}`}
                    className={`group block border-t ${m % 60 === 0 ? "border-stone-200" : "border-stone-100"} hover:bg-rose-50`}
                    style={{ height: ALTURA_BLOCO }}
                  >
                    <span className="hidden px-2 pt-1 text-[11px] font-medium text-rose-700 group-hover:block">+ {minutosParaHora(m)}</span>
                  </Link>
                ) : (
                  <div key={m} className={`border-t ${m % 60 === 0 ? "border-stone-200" : "border-stone-100"}`} style={{ height: ALTURA_BLOCO }} />
                ),
              )}

              {/* fora do expediente */}
              {(c.expediente ? [[faixa.inicio, c.expediente.abre], [c.expediente.fecha, faixa.fim]] : [[faixa.inicio, faixa.fim]])
                .filter(([a, b]) => b > a)
                .map(([a, b]) => (
                  <div key={`fora-${a}`} aria-hidden className="pointer-events-none absolute inset-x-0 bg-stone-100/70" style={{ top: topo(a), height: tamanho(a, b) }} />
                ))}

              {/* bloqueios */}
              {meusBloqueios.map((b) => (
                <div
                  key={b.id}
                  className="absolute inset-x-1 overflow-hidden rounded-md px-2 py-1 text-[11px] text-stone-600 ring-1 ring-stone-300"
                  style={{
                    top: topo(b.inicio),
                    height: tamanho(b.inicio, b.fim),
                    backgroundImage: "repeating-linear-gradient(45deg, #f5f5f4 0 6px, #ffffff 6px 12px)",
                  }}
                >
                  {b.profissionalId === null ? "Feriado" : "Bloqueado"}
                  {b.motivo ? ` · ${b.motivo}` : ""}
                </div>
              ))}

              {/* horários marcados */}
              {meus.map((i) => {
                const pos = lado.get(i.id)!;
                const cor = COR[i.situacao] ?? COR.agendado;
                const largura = 100 / pos.faixas;
                return (
                  <Link
                    key={i.id}
                    href={`/agenda/horario/${i.agendamentoId}?data=${data}`}
                    title={`${minutosParaHora(i.inicio)}–${minutosParaHora(i.fim)} · ${i.cliente ?? "Cliente"} · ${i.servico} · ${NOME_SITUACAO[i.situacao]}`}
                    className={`absolute z-[5] block overflow-hidden border-l-4 px-2 py-1 text-xs leading-snug hover:brightness-95 ${cor.fundo} ${cor.faixa} ${cor.texto}`}
                    style={{
                      top: topo(i.inicio) + 1,
                      height: tamanho(i.inicio, i.fim) - 2,
                      left: `calc(${pos.faixa * largura}% + 2px)`,
                      width: `calc(${largura}% - 4px)`,
                    }}
                  >
                    <span className="font-semibold">{minutosParaHora(i.inicio)}</span> {i.cliente ?? "Cliente"}
                    <span className="block truncate opacity-80">{i.servico}</span>
                  </Link>
                );
              })}

              {/* agora */}
              {agora !== null && agora >= faixa.inicio && agora <= faixa.fim && (
                <div aria-hidden className="absolute inset-x-0 z-10 border-t-2 border-red-500" style={{ top: topo(agora) }} />
              )}
            </div>
          );
        })}
      </div>
    </section>
  );
}

/** Modelo C: no celular, uma profissional por vez, em lista. */
function ListaCelular({
  colunas,
  escolhida,
  itens,
  bloqueios,
  agora,
  data,
}: {
  colunas: Coluna[];
  escolhida: Coluna | undefined;
  itens: ItemAgenda[];
  bloqueios: BloqueioAgenda[];
  agora: number | null;
  data: string;
}) {
  if (!escolhida) return null;
  type Linha = { min: number; tipo: "item"; item: ItemAgenda } | { min: number; tipo: "bloqueio"; bloqueio: BloqueioAgenda } | { min: number; tipo: "agora" };
  const linhas: Linha[] = [
    ...itens.filter((i) => i.profissionalId === escolhida.id).map((i) => ({ min: i.inicio, tipo: "item" as const, item: i })),
    ...bloqueios
      .filter((b) => b.profissionalId === escolhida.id || b.profissionalId === null)
      .map((b) => ({ min: b.inicio, tipo: "bloqueio" as const, bloqueio: b })),
    ...(agora !== null ? [{ min: agora, tipo: "agora" as const }] : []),
  ].sort((a, b) => a.min - b.min);

  return (
    <section className="space-y-3 md:hidden">
      {colunas.length > 1 && (
        <div className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1">
          {colunas.map((c) => (
            <Link
              key={c.id}
              href={`/agenda?data=${data}&prof=${c.id}`}
              aria-current={c.id === escolhida.id ? "true" : undefined}
              className={`shrink-0 rounded-full px-4 py-2 text-sm font-medium ${
                c.id === escolhida.id ? "bg-rose-700 text-white" : "bg-white text-stone-700 ring-1 ring-stone-300"
              }`}
            >
              {c.nome}
            </Link>
          ))}
        </div>
      )}
      <p className="text-xs text-stone-500">
        {escolhida.expediente
          ? `Expediente de ${escolhida.nome}: ${minutosParaHora(escolhida.expediente.abre)} às ${minutosParaHora(escolhida.expediente.fecha)}`
          : `${escolhida.nome} não trabalha neste dia.`}
      </p>
      {linhas.filter((l) => l.tipo !== "agora").length === 0 ? (
        <p className="rounded-2xl bg-white px-4 py-6 text-center text-sm text-stone-500 ring-1 ring-stone-200">Nenhum horário marcado.</p>
      ) : (
        <ul className="space-y-2">
          {linhas.map((l) =>
            l.tipo === "agora" ? (
              <li key="agora" className="flex items-center gap-3" aria-label="Agora">
                <span className="w-12 text-right text-xs font-semibold text-red-600">{minutosParaHora(l.min)}</span>
                <span className="flex-1 border-t-2 border-red-500" />
              </li>
            ) : l.tipo === "bloqueio" ? (
              <li key={l.bloqueio.id} className="flex gap-3">
                <span className="w-12 pt-3 text-right text-xs text-stone-400">{minutosParaHora(l.min)}</span>
                <div className="flex-1 rounded-xl bg-white px-4 py-3 text-sm text-stone-500 border border-dashed border-stone-300">
                  {l.bloqueio.profissionalId === null ? "Feriado" : "Bloqueado"} até {minutosParaHora(l.bloqueio.fim)}
                  {l.bloqueio.motivo ? ` · ${l.bloqueio.motivo}` : ""}
                </div>
              </li>
            ) : (
              <li key={l.item.id} className="flex gap-3">
                <span className="w-12 pt-3 text-right text-xs text-stone-400">{minutosParaHora(l.min)}</span>
                <Link
                  href={`/agenda/horario/${l.item.agendamentoId}?data=${data}`}
                  className={`block flex-1 rounded-xl border-l-4 px-4 py-3 ${COR[l.item.situacao]?.fundo} ${COR[l.item.situacao]?.faixa} ${COR[l.item.situacao]?.texto}`}
                >
                  <p className="text-sm font-semibold">{l.item.cliente ?? "Cliente"}</p>
                  <p className="text-sm opacity-80">
                    {l.item.servico} · até {minutosParaHora(l.item.fim)}
                  </p>
                  <p className="mt-1 text-xs font-medium">{NOME_SITUACAO[l.item.situacao]}</p>
                </Link>
              </li>
            ),
          )}
        </ul>
      )}
    </section>
  );
}

const maiusculaInicial = (t: string) => t.charAt(0).toUpperCase() + t.slice(1);
