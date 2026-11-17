"use server";

import { revalidatePath } from "next/cache";
import { horaCurta, lerHorariosDoFormulario } from "@/lib/horarios";
import { exigirSalao } from "@/lib/sessao";

export type EstadoHorarios = { erro?: string; ok?: string } | undefined;

/**
 * Salva o horário de funcionamento do salão (sem profissional_id) ou de uma profissional.
 * Para a profissional, "segue o salão" apaga o horário próprio dela.
 */
export async function salvarHorarios(_: EstadoHorarios, form: FormData): Promise<EstadoHorarios> {
  const { supabase, salao, ehDono } = await exigirSalao();
  if (!ehDono) return { erro: "Só o dono altera horários." };

  const profissionalId = String(form.get("profissional_id") ?? "") || null;
  const segueSalao = profissionalId !== null && form.get("segue_salao") === "on";

  const lido = segueSalao ? { dias: [] } : lerHorariosDoFormulario(form);
  if ("erro" in lido) return { erro: lido.erro };
  if (!segueSalao && profissionalId && lido.dias.length === 0)
    return { erro: "Marque pelo menos um dia, ou escolha seguir o horário do salão." };

  let consulta = supabase.from("horarios_funcionamento").select("id, dia_semana, abre, fecha").eq("salao_id", salao.salaoId);
  consulta = profissionalId ? consulta.eq("profissional_id", profissionalId) : consulta.is("profissional_id", null);
  const { data: atuais, error: erroBusca } = await consulta;
  if (erroBusca) return { erro: "Não foi possível carregar os horários. Tente de novo." };

  const porDia = new Map((atuais ?? []).map((h) => [h.dia_semana as number, h]));
  const desejado = new Map(lido.dias.map((d) => [d.dia_semana, d]));

  for (let dia = 0; dia < 7; dia++) {
    const atual = porDia.get(dia);
    const novo = desejado.get(dia);
    let error = null;
    if (atual && !novo) {
      ({ error } = await supabase.from("horarios_funcionamento").delete().eq("id", atual.id));
    } else if (!atual && novo) {
      ({ error } = await supabase
        .from("horarios_funcionamento")
        .insert({ salao_id: salao.salaoId, profissional_id: profissionalId, ...novo }));
    } else if (atual && novo && (horaCurta(atual.abre) !== novo.abre || horaCurta(atual.fecha) !== novo.fecha)) {
      ({ error } = await supabase.from("horarios_funcionamento").update({ abre: novo.abre, fecha: novo.fecha }).eq("id", atual.id));
    }
    if (error) {
      console.error("salvarHorarios falhou:", error.code);
      return { erro: "Não foi possível salvar todos os dias. Confira e tente de novo." };
    }
  }

  revalidatePath("/configuracoes");
  if (profissionalId) revalidatePath(`/profissionais/${profissionalId}`);
  return { ok: segueSalao ? "Agora ela segue o horário do salão." : "Horários salvos." };
}
