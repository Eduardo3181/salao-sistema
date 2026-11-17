/**
 * Cálculos da grade da agenda (módulo puro, testado em tests/agenda-grade.test.ts).
 * Datas do dia sempre no horário de Brasília.
 * Observação: o Brasil não tem horário de verão desde 2019, então Brasília é sempre UTC-3.
 * Se o horário de verão voltar, este é o único lugar a ajustar.
 */

export const DESLOCAMENTO_BRASILIA = "-03:00";
export const PASSO_GRADE_MIN = 30;

/** Data de hoje em Brasília, "AAAA-MM-DD". */
export function hojeBrasilia(agora: Date = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo" }).format(agora);
}

export function dataValida(texto: string | undefined | null): texto is string {
  if (!texto || !/^\d{4}-\d{2}-\d{2}$/.test(texto)) return false;
  const [a, m, d] = texto.split("-").map(Number);
  const dt = new Date(Date.UTC(a, m - 1, d));
  return dt.getUTCFullYear() === a && dt.getUTCMonth() === m - 1 && dt.getUTCDate() === d;
}

/** Início do dia (00:00 de Brasília) como texto com fuso, para consultas. */
export const inicioDoDia = (data: string) => `${data}T00:00:00${DESLOCAMENTO_BRASILIA}`;

export function somarDias(data: string, dias: number): string {
  const [a, m, d] = data.split("-").map(Number);
  return new Date(Date.UTC(a, m - 1, d + dias)).toISOString().slice(0, 10);
}

/** 0 = domingo ... 6 = sábado */
export function diaDaSemana(data: string): number {
  const [a, m, d] = data.split("-").map(Number);
  return new Date(Date.UTC(a, m - 1, d)).getUTCDay();
}

/** Minutos desde a meia-noite (Brasília) do dia informado. Pode ser negativo ou passar de 1440. */
export function minutosNoDia(iso: string, data: string): number {
  return Math.round((new Date(iso).getTime() - new Date(inicioDoDia(data)).getTime()) / 60000);
}

/** "09:00:00" -> 540 */
export const horaParaMinutos = (hora: string) => {
  const [h, m] = hora.split(":").map(Number);
  return h * 60 + m;
};

/** 570 -> "09:30" */
export const minutosParaHora = (min: number) =>
  `${String(Math.floor(min / 60)).padStart(2, "0")}:${String(min % 60).padStart(2, "0")}`;

/** Monta o horário com fuso de Brasília: ("2026-11-18", 570) -> "2026-11-18T09:30:00-03:00" */
export const horarioComFuso = (data: string, minutos: number) =>
  `${data}T${minutosParaHora(minutos)}:00${DESLOCAMENTO_BRASILIA}`;

/**
 * Faixa de horas que a grade mostra: do menor "abre" ao maior "fecha" das colunas,
 * esticada para caber qualquer horário marcado fora do expediente.
 * Sem nada: 08:00 às 20:00. Sempre em blocos de 30 minutos.
 */
export function faixaDaGrade(expedientes: { abre: number; fecha: number }[], ocupados: { inicio: number; fim: number }[]) {
  const inicios = [...expedientes.map((e) => e.abre), ...ocupados.map((o) => o.inicio)];
  const fins = [...expedientes.map((e) => e.fecha), ...ocupados.map((o) => o.fim)];
  if (inicios.length === 0) return { inicio: 8 * 60, fim: 20 * 60 };
  const inicio = Math.max(0, Math.floor(Math.min(...inicios) / PASSO_GRADE_MIN) * PASSO_GRADE_MIN);
  const fim = Math.min(24 * 60, Math.ceil(Math.max(...fins) / PASSO_GRADE_MIN) * PASSO_GRADE_MIN);
  return { inicio, fim: Math.max(fim, inicio + PASSO_GRADE_MIN) };
}

/**
 * Encaixes: horários que se sobrepõem na mesma coluna ficam lado a lado.
 * Devolve, para cada id, a faixa (0, 1, ...) e quantas faixas o grupo usa.
 */
export function distribuirLadoALado<T extends { id: string; inicio: number; fim: number }>(itens: T[]) {
  const ordenados = [...itens].sort((a, b) => a.inicio - b.inicio || b.fim - a.fim);
  const resultado = new Map<string, { faixa: number; faixas: number }>();
  let grupo: T[] = [];
  let fimDoGrupo = -Infinity;
  let faixasFim: number[] = [];

  const fecharGrupo = () => {
    for (const i of grupo) resultado.get(i.id)!.faixas = faixasFim.length;
    grupo = [];
    faixasFim = [];
  };

  for (const item of ordenados) {
    if (item.inicio >= fimDoGrupo) fecharGrupo();
    let faixa = faixasFim.findIndex((fim) => fim <= item.inicio);
    if (faixa === -1) {
      faixa = faixasFim.length;
      faixasFim.push(item.fim);
    } else faixasFim[faixa] = item.fim;
    resultado.set(item.id, { faixa, faixas: 0 });
    grupo.push(item);
    fimDoGrupo = Math.max(fimDoGrupo, item.fim);
  }
  fecharGrupo();
  return resultado;
}

export const NOME_SITUACAO: Record<string, string> = {
  agendado: "Agendado",
  confirmado: "Confirmado",
  chegou: "Cliente chegou",
  concluido: "Concluído",
  faltou: "Faltou",
  cancelado: "Cancelado",
};

/** "2026-11-18" -> "quarta-feira, 18 de novembro" */
export function dataPorExtenso(data: string): string {
  const [a, m, d] = data.split("-").map(Number);
  return new Intl.DateTimeFormat("pt-BR", { timeZone: "UTC", weekday: "long", day: "numeric", month: "long" }).format(
    new Date(Date.UTC(a, m - 1, d)),
  );
}

/**
 * Serviços em sequência: o primeiro começa no horário escolhido e cada um
 * começa quando o anterior termina. Devolve o início (em minutos no dia) de cada um.
 */
export function horariosEmSequencia(inicio: number, duracoes: number[]): number[] {
  const inicios: number[] = [];
  let atual = inicio;
  for (const d of duracoes) {
    inicios.push(atual);
    atual += d;
  }
  return inicios;
}

/** Próximo horário "redondo" de 30 em 30 minutos a partir de agora (para sugerir no botão +). */
export function proximoHorarioRedondo(agoraMin: number): number {
  return Math.ceil(agoraMin / PASSO_GRADE_MIN) * PASSO_GRADE_MIN;
}

/** "09:30" -> 570; devolve null se não for um horário válido. */
export function lerHora(texto: string | null | undefined): number | null {
  if (!texto || !/^\d{2}:\d{2}$/.test(texto)) return null;
  const [h, m] = texto.split(":").map(Number);
  return h < 24 && m < 60 ? h * 60 + m : null;
}
