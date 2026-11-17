"use client";

import { useActionState, useState } from "react";
import { salvarHorarios } from "@/app/configuracoes/acoes-horarios";
import { Mensagem } from "@/components/ui";
import { DIAS_SEMANA, horaCurta, OPCOES_HORA, type HorarioDia } from "@/lib/horarios";

const estiloSelect =
  "rounded-lg border border-stone-300 bg-white px-2 py-2 text-sm text-stone-900 outline-none focus:border-rose-600 focus:ring-2 focus:ring-rose-200 disabled:bg-stone-100 disabled:text-stone-400";

/**
 * Horário de funcionamento por dia da semana.
 * Sem profissionalId: horário do salão. Com profissionalId: horário próprio da profissional,
 * com a opção "segue o horário do salão".
 */
export default function FormHorarios({ dias, profissionalId }: { dias: HorarioDia[]; profissionalId?: string }) {
  const [estado, acao, carregando] = useActionState(salvarHorarios, undefined);
  const porDia = new Map(dias.map((d) => [d.dia_semana, d]));
  const [segueSalao, setSegueSalao] = useState(Boolean(profissionalId) && dias.length === 0);
  const [abertos, setAbertos] = useState<boolean[]>(DIAS_SEMANA.map((_, d) => porDia.has(d)));

  return (
    <form action={acao} className="space-y-4">
      {estado?.erro && <Mensagem tipo="erro">{estado.erro}</Mensagem>}
      {estado?.ok && <Mensagem tipo="aviso">{estado.ok}</Mensagem>}
      {profissionalId && <input type="hidden" name="profissional_id" value={profissionalId} />}

      {profissionalId && (
        <label className="flex items-center gap-3">
          <input
            type="checkbox"
            name="segue_salao"
            checked={segueSalao}
            onChange={(e) => setSegueSalao(e.target.checked)}
            className="h-5 w-5 accent-rose-700"
          />
          <span className="text-sm font-medium text-stone-900">Segue o horário do salão</span>
        </label>
      )}

      {!segueSalao && (
        <ul className="divide-y divide-stone-100">
          {DIAS_SEMANA.map((nome, d) => {
            const atual = porDia.get(d);
            return (
              <li key={d} className="flex flex-wrap items-center gap-x-3 gap-y-2 py-2.5">
                <label className="flex w-32 items-center gap-2">
                  <input
                    type="checkbox"
                    name={`aberto_${d}`}
                    checked={abertos[d]}
                    onChange={(e) => setAbertos((a) => a.map((v, i) => (i === d ? e.target.checked : v)))}
                    className="h-5 w-5 accent-rose-700"
                  />
                  <span className="text-sm font-medium text-stone-900">{nome}</span>
                </label>
                {abertos[d] ? (
                  <span className="flex items-center gap-2 text-sm text-stone-600">
                    <select name={`abre_${d}`} defaultValue={atual ? horaCurta(atual.abre) : "09:00"} className={estiloSelect} aria-label={`${nome}: abre`}>
                      {OPCOES_HORA.map((h) => <option key={h}>{h}</option>)}
                    </select>
                    às
                    <select name={`fecha_${d}`} defaultValue={atual ? horaCurta(atual.fecha) : "19:00"} className={estiloSelect} aria-label={`${nome}: fecha`}>
                      {OPCOES_HORA.map((h) => <option key={h}>{h}</option>)}
                    </select>
                  </span>
                ) : (
                  <span className="text-sm text-stone-400">Fechado</span>
                )}
              </li>
            );
          })}
        </ul>
      )}

      <button
        disabled={carregando}
        className="rounded-lg bg-rose-700 px-4 py-2.5 text-sm font-semibold text-white hover:bg-rose-800 disabled:opacity-60"
      >
        {carregando ? "Salvando..." : "Salvar horários"}
      </button>
    </form>
  );
}
