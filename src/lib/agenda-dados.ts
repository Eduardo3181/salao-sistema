import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { diaDaSemana, horaParaMinutos, inicioDoDia, minutosNoDia, somarDias } from "@/lib/agenda";

export type Coluna = { id: string; nome: string; expediente: { abre: number; fecha: number } | null };
export type ItemAgenda = {
  id: string;
  agendamentoId: string;
  profissionalId: string;
  inicio: number; // minutos no dia (Brasília)
  fim: number;
  inicioIso: string;
  fimIso: string;
  situacao: string;
  servico: string;
  cliente: string | null; // nulo quando a pessoa não pode ver clientes (assistente)
  clienteId: string;
  precoCentavos: number;
};
export type BloqueioAgenda = { id: string; profissionalId: string | null; inicio: number; fim: number; motivo: string | null };

/**
 * Tudo o que a tela da agenda precisa para um dia. A RLS do banco já filtra:
 * cada pessoa só recebe as colunas, horários e bloqueios que pode ver.
 */
export async function buscarAgendaDoDia(supabase: SupabaseClient, salaoId: string, data: string) {
  const de = inicioDoDia(data);
  const ate = inicioDoDia(somarDias(data, 1));
  const dia = diaDaSemana(data);

  const [colunasR, horariosR, itensR, bloqueiosR] = await Promise.all([
    supabase.rpc("minhas_agendas", { p_salao_id: salaoId }),
    supabase.from("horarios_funcionamento").select("profissional_id, dia_semana, abre, fecha").eq("salao_id", salaoId),
    supabase
      .from("agendamento_itens")
      .select("id, agendamento_id, profissional_id, inicio, fim, preco_centavos, servicos(nome), agendamentos(situacao, cliente_id, clientes(nome))")
      .eq("salao_id", salaoId)
      .lt("inicio", ate)
      .gt("fim", de)
      .order("inicio"),
    supabase.from("bloqueios").select("id, profissional_id, inicio, fim, motivo").eq("salao_id", salaoId).lt("inicio", ate).gt("fim", de),
  ]);

  // Expediente de cada coluna: horário próprio da profissional; se ela não tem nenhum, o do salão.
  const horarios = (horariosR.data ?? []) as { profissional_id: string | null; dia_semana: number; abre: string; fecha: string }[];
  const doSalao = horarios.find((h) => h.profissional_id === null && h.dia_semana === dia);
  const temProprio = new Set(horarios.filter((h) => h.profissional_id).map((h) => h.profissional_id));
  const expedienteDe = (profId: string) => {
    const h = temProprio.has(profId)
      ? horarios.find((x) => x.profissional_id === profId && x.dia_semana === dia)
      : doSalao;
    return h ? { abre: horaParaMinutos(h.abre), fecha: horaParaMinutos(h.fecha) } : null;
  };

  const colunas: Coluna[] = ((colunasR.data ?? []) as { id: string; nome: string }[]).map((c) => ({
    ...c,
    expediente: expedienteDe(c.id),
  }));

  type Linha = {
    id: string;
    agendamento_id: string;
    profissional_id: string;
    inicio: string;
    fim: string;
    preco_centavos: number;
    servicos: { nome: string } | null;
    agendamentos: { situacao: string; cliente_id: string; clientes: { nome: string } | null } | null;
  };
  const itens: ItemAgenda[] = ((itensR.data ?? []) as unknown as Linha[])
    .filter((i) => i.agendamentos && i.agendamentos.situacao !== "cancelado") // cancelado libera o horário
    .map((i) => ({
      id: i.id,
      agendamentoId: i.agendamento_id,
      profissionalId: i.profissional_id,
      inicio: Math.max(0, minutosNoDia(i.inicio, data)),
      fim: Math.min(24 * 60, minutosNoDia(i.fim, data)),
      inicioIso: i.inicio,
      fimIso: i.fim,
      situacao: i.agendamentos!.situacao,
      servico: i.servicos?.nome ?? "Serviço",
      cliente: i.agendamentos!.clientes?.nome ?? null,
      clienteId: i.agendamentos!.cliente_id,
      precoCentavos: Number(i.preco_centavos),
    }));

  const bloqueios: BloqueioAgenda[] = (
    (bloqueiosR.data ?? []) as { id: string; profissional_id: string | null; inicio: string; fim: string; motivo: string | null }[]
  ).map((b) => ({
    id: b.id,
    profissionalId: b.profissional_id,
    inicio: Math.max(0, minutosNoDia(b.inicio, data)),
    fim: Math.min(24 * 60, minutosNoDia(b.fim, data)),
    motivo: b.motivo,
  }));

  return { colunas, itens, bloqueios, salaoFechado: !doSalao };
}
