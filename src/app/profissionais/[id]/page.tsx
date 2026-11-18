import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { Suspense } from "react";
import { CartaoAcesso } from "@/components/ui";
import { buscarProfissionais, opcoesDeVinculo } from "@/lib/profissionais";
import type { MembroEquipe } from "@/lib/salao";
import { exigirSalao } from "@/lib/sessao";
import FormProfissional from "../form-profissional";
import FormAjuda from "./form-ajuda";
import FormHorarios from "@/components/form-horarios";
import { resumirHorarios, type HorarioDia } from "@/lib/horarios";

export const metadata: Metadata = { title: "Editar quem atende | Sistema do Salão" };

export default function PaginaEditarProfissional({ params }: PageProps<"/profissionais/[id]">) {
  return (
    <CartaoAcesso titulo="Editar quem atende">
      <Suspense fallback={<p className="text-sm text-stone-500">Carregando...</p>}>
        <Conteudo params={params} />
      </Suspense>
    </CartaoAcesso>
  );
}

async function Conteudo({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { supabase, userId, salao, ehDono } = await exigirSalao();
  if (!ehDono) redirect("/profissionais");

  const [profissionais, equipe, horarios] = await Promise.all([
    buscarProfissionais(supabase, salao.salaoId),
    supabase.rpc("equipe_do_salao", { p_salao_id: salao.salaoId }).then((r) => (r.data ?? []) as MembroEquipe[]),
    supabase
      .from("horarios_funcionamento")
      .select("dia_semana, abre, fecha")
      .eq("salao_id", salao.salaoId)
      .eq("profissional_id", id)
      .then((r) => (r.data ?? []) as HorarioDia[]),
  ]);
  const profissional = profissionais.find((p) => p.id === id);
  if (!profissional) notFound();

  const ehAssistente = profissional.tipo === "assistente";
  const marcadas = ehAssistente
    ? await supabase
        .from("assistentes_profissionais")
        .select("profissional_id")
        .eq("salao_id", salao.salaoId)
        .eq("assistente_id", id)
        .then((r) => ((r.data ?? []) as { profissional_id: string }[]).map((x) => x.profissional_id))
    : [];
  // Ativas aparecem para escolher; uma inativa já marcada continua na lista para poder ser desmarcada.
  const paraEscolher = profissionais.filter((p) => p.tipo === "profissional" && (p.ativo || marcadas.includes(p.id)));

  return (
    <div className="space-y-8">
      <FormProfissional profissional={profissional} vinculos={opcoesDeVinculo(equipe, profissionais, userId, id)} />
      {ehAssistente && (
        <div className="border-t border-stone-200 pt-6">
          <h2 className="font-semibold text-stone-900">Quem ela ajuda</h2>
          <p className="mt-1 mb-4 text-sm text-stone-500">
            Vê no app só a agenda dos profissionais marcados, sem telefone nem ficha das clientes, e não altera nada.
            {profissional.user_id ? "" : " Para entrar no app, ela precisa ter acesso (perfil Assistente na Equipe) e estar ligada a este cadastro acima."}
          </p>
          <FormAjuda assistenteId={id} profissionais={paraEscolher} marcadas={marcadas} />
        </div>
      )}
      <div className="border-t border-stone-200 pt-6">
        <h2 className="font-semibold text-stone-900">Horário de trabalho</h2>
        <p className="mt-1 mb-4 text-sm text-stone-500">
          {horarios.length ? resumirHorarios(horarios) : "Segue o horário do salão."} Folgas e saídas pontuais vão como bloqueio na agenda.
        </p>
        <FormHorarios dias={horarios} profissionalId={id} />
      </div>
    </div>
  );
}
