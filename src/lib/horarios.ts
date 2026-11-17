/**
 * Horário de funcionamento: dias da semana, opções da grade de 30 minutos
 * e leitura do formulário. Módulo puro, testado em tests/horarios.test.ts.
 */

export const DIAS_SEMANA = ["Domingo", "Segunda", "Terça", "Quarta", "Quinta", "Sexta", "Sábado"] as const;

/** Horários possíveis na grade de 30 minutos (05:00 até 23:30). */
export const OPCOES_HORA: string[] = Array.from({ length: (24 - 5) * 2 }, (_, i) => {
  const minutos = 5 * 60 + i * 30;
  return `${String(Math.floor(minutos / 60)).padStart(2, "0")}:${minutos % 60 === 0 ? "00" : "30"}`;
});

export type HorarioDia = { dia_semana: number; abre: string; fecha: string };

/** "09:00:00" (como vem do banco) -> "09:00" */
export const horaCurta = (t: string) => t.slice(0, 5);

/**
 * Lê o formulário de horários (campos aberto_N, abre_N, fecha_N, com N = 0..6).
 * Devolve os dias abertos ou o primeiro erro encontrado.
 */
export function lerHorariosDoFormulario(form: FormData): { dias: HorarioDia[] } | { erro: string } {
  const dias: HorarioDia[] = [];
  for (let d = 0; d < 7; d++) {
    if (form.get(`aberto_${d}`) !== "on") continue;
    const abre = String(form.get(`abre_${d}`) ?? "");
    const fecha = String(form.get(`fecha_${d}`) ?? "");
    if (!OPCOES_HORA.includes(abre) || !OPCOES_HORA.includes(fecha))
      return { erro: `${DIAS_SEMANA[d]}: escolha os horários da lista.` };
    if (abre >= fecha) return { erro: `${DIAS_SEMANA[d]}: o horário de fechar tem que ser depois do de abrir.` };
    dias.push({ dia_semana: d, abre, fecha });
  }
  return { dias };
}

/** Resumo legível: "Ter a Sex 09:00–19:00 · Sáb 08:00–14:00" (dias seguidos com o mesmo horário são agrupados). */
export function resumirHorarios(dias: HorarioDia[]): string {
  if (dias.length === 0) return "Fechado todos os dias";
  const curto = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"];
  const ordenados = [...dias].sort((a, b) => a.dia_semana - b.dia_semana);
  const grupos: { de: number; ate: number; faixa: string }[] = [];
  for (const d of ordenados) {
    const faixa = `${horaCurta(d.abre)}–${horaCurta(d.fecha)}`;
    const ultimo = grupos.at(-1);
    if (ultimo && ultimo.faixa === faixa && ultimo.ate === d.dia_semana - 1) ultimo.ate = d.dia_semana;
    else grupos.push({ de: d.dia_semana, ate: d.dia_semana, faixa });
  }
  return grupos
    .map((g) => `${g.de === g.ate ? curto[g.de] : `${curto[g.de]} a ${curto[g.ate]}`} ${g.faixa}`)
    .join(" · ");
}
