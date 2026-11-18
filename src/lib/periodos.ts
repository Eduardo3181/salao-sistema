/**
 * Períodos para extratos e pagamentos (módulo puro). Datas "AAAA-MM-DD" no horário de Brasília,
 * com início e fim INCLUSIVOS (de 01/11 até 15/11 inclui o dia 15 inteiro).
 */
import { dataValida, diaDaSemana, inicioDoDia, somarDias } from "@/lib/agenda";

export type Periodo = { de: string; ate: string };
export const MAX_DIAS_PERIODO = 400;

const ultimoDiaDoMes = (ano: number, mes: number) => new Date(Date.UTC(ano, mes, 0)).getUTCDate(); // mes 1-12
const doisDigitos = (n: number) => String(n).padStart(2, "0");

/** Atalhos a partir de hoje: semana (segunda a domingo), quinzena (1–15 ou 16–fim), mês e mês passado. */
export function atalhosDePeriodo(hoje: string): { id: string; rotulo: string; periodo: Periodo }[] {
  const [a, m, d] = hoje.split("-").map(Number);
  const segunda = somarDias(hoje, -((diaDaSemana(hoje) + 6) % 7));
  const mes = `${a}-${doisDigitos(m)}`;
  const fimMes = `${mes}-${doisDigitos(ultimoDiaDoMes(a, m))}`;
  const quinzena: Periodo = d <= 15 ? { de: `${mes}-01`, ate: `${mes}-15` } : { de: `${mes}-16`, ate: fimMes };
  const [ap, mp] = m === 1 ? [a - 1, 12] : [a, m - 1];
  const mesPassado = `${ap}-${doisDigitos(mp)}`;
  return [
    { id: "semana", rotulo: "Esta semana", periodo: { de: segunda, ate: somarDias(segunda, 6) } },
    { id: "quinzena", rotulo: "Esta quinzena", periodo: quinzena },
    { id: "mes", rotulo: "Este mês", periodo: { de: `${mes}-01`, ate: fimMes } },
    { id: "mes_passado", rotulo: "Mês passado", periodo: { de: `${mesPassado}-01`, ate: `${mesPassado}-${doisDigitos(ultimoDiaDoMes(ap, mp))}` } },
  ];
}

/** Quantos dias o período tem (contando o primeiro e o último). */
export function diasNoPeriodo(p: Periodo): number {
  return Math.round((Date.parse(`${p.ate}T00:00:00Z`) - Date.parse(`${p.de}T00:00:00Z`)) / 86400000) + 1;
}

/** Lê o período da barra de endereço; se faltar ou estiver errado, usa este mês. */
export function lerPeriodo(de: unknown, ate: unknown, hoje: string): { periodo: Periodo; erro: string | null } {
  const padrao = atalhosDePeriodo(hoje).find((x) => x.id === "mes")!.periodo;
  if (de === undefined && ate === undefined) return { periodo: padrao, erro: null };
  if (typeof de !== "string" || typeof ate !== "string" || !dataValida(de) || !dataValida(ate))
    return { periodo: padrao, erro: "Data inválida. Mostrando este mês." };
  if (ate < de) return { periodo: padrao, erro: "A data final é antes da inicial. Mostrando este mês." };
  if (diasNoPeriodo({ de, ate }) > MAX_DIAS_PERIODO) return { periodo: padrao, erro: `Escolha até ${MAX_DIAS_PERIODO} dias. Mostrando este mês.` };
  return { periodo: { de, ate }, erro: null };
}

/** Limites para a consulta: do início do primeiro dia até o início do dia seguinte ao último. */
export function limitesDoPeriodo(p: Periodo): { de: string; ate: string } {
  return { de: inicioDoDia(p.de), ate: inicioDoDia(somarDias(p.ate, 1)) };
}

/** "01/11/2026" */
export const dataCurta = (data: string) => data.split("-").reverse().join("/");
