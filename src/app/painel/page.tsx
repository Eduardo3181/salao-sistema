import { TriangleAlert } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { Suspense } from "react";
import { Cabecalho } from "@/components/cabecalho";
import { hojeBrasilia, inicioDoDia } from "@/lib/agenda";
import {
  buscarMeuSalao,
  dataHoraBrasil,
  descreverAuditoria,
  NOME_PERFIL,
  type MembroEquipe,
  type RegistroAuditoria,
} from "@/lib/salao";
import { usuarioLogado } from "@/lib/supabase/server";
import { mudarAcesso } from "./acoes-equipe";
import FormEquipe from "./form-equipe";
import { RemoverPessoa } from "./remover-pessoa";

export const metadata: Metadata = { title: "Painel | Sistema do Salão" };

export default function PaginaPainel() {
  return (
    <Suspense fallback={<p className="p-6 text-sm text-stone-500">Carregando...</p>}>
      <Painel />
    </Suspense>
  );
}

const cartao = "rounded-2xl bg-white p-6 shadow-sm ring-1 ring-stone-200";

async function Painel() {
  const { supabase, userId } = await usuarioLogado();
  if (!userId) redirect("/auth/sair");

  const salao = await buscarMeuSalao(supabase, userId);
  if (!salao) redirect("/novo-salao");
  if (salao.trocarSenha) redirect("/trocar-senha");

  const ehDono = salao.perfil === "dono";

  // Só o dono enxerga equipe e auditoria (o banco garante isso; aqui só evitamos a consulta).
  const [{ data: auditoria }, { data: equipe }] = ehDono
    ? await Promise.all([
        supabase
          .from("audit_log")
          .select("id, user_id, acao, entidade, entidade_id, antes, depois, em")
          .eq("salao_id", salao.salaoId)
          .order("em", { ascending: false })
          .limit(30),
        supabase.rpc("equipe_do_salao", { p_salao_id: salao.salaoId }),
      ])
    : [{ data: null }, { data: null }];

  const membros = (equipe ?? []) as MembroEquipe[];
  // A auditoria de clientes não guarda o nome (LGPD): busca o nome atual de quem aparece no registro.
  const idsClientes = [
    ...new Set(
      ((auditoria ?? []) as RegistroAuditoria[])
        .map((r) =>
          r.entidade === "clientes"
            ? r.entidade_id
            : r.entidade === "consentimentos_whatsapp" || r.entidade === "agendamentos"
              ? ((r.depois?.cliente_id ?? r.antes?.cliente_id) as string | undefined)
              : null,
        )
        .filter((id): id is string => Boolean(id)),
    ),
  ];
  const nomesProfissionais = new Map(
    ehDono
      ? ((await supabase.from("profissionais").select("id, nome").eq("salao_id", salao.salaoId)).data ?? []).map((p) => [
          p.id as string,
          p.nome as string,
        ])
      : [],
  );
  const nomesClientes = new Map(
    idsClientes.length
      ? ((await supabase.from("clientes").select("id, nome").in("id", idsClientes)).data ?? []).map((c) => [c.id as string, c.nome as string])
      : [],
  );
  const temProfissionais = ehDono
    ? ((await supabase.from("profissionais").select("id", { count: "exact", head: true }).eq("salao_id", salao.salaoId))
        .count ?? 0) > 0
    : false;
  const temServicos = ehDono
    ? ((await supabase.from("servicos").select("id", { count: "exact", head: true }).eq("salao_id", salao.salaoId))
        .count ?? 0) > 0
    : false;
  // Aviso: comandas abertas de dias anteriores (a RLS conta só as que a pessoa pode ver).
  const comandasAntigas =
    salao.perfil === "assistente"
      ? 0
      : ((
          await supabase
            .from("comandas")
            .select("id", { count: "exact", head: true })
            .eq("salao_id", salao.salaoId)
            .eq("situacao", "aberta")
            .lt("aberta_em", inicioDoDia(hojeBrasilia()))
        ).count ?? 0);
  // Aviso do caixa (dono e recepção): caixa de hoje não aberto ou caixa de dia anterior esquecido aberto.
  const caixas =
    salao.perfil === "dono" || salao.perfil === "recepcao"
      ? (((
          await supabase
            .from("caixas")
            .select("data, situacao")
            .eq("salao_id", salao.salaoId)
            .or(`data.eq.${hojeBrasilia()},situacao.eq.aberto`)
        ).data ?? []) as { data: string; situacao: string }[])
      : null;
  const caixaHojeAberto = caixas ? caixas.some((c) => c.data === hojeBrasilia()) : true;
  const caixaEsquecido = caixas ? caixas.find((c) => c.data < hojeBrasilia() && c.situacao === "aberto") : undefined;
  // Aviso de contas (só o dono): vencem hoje ou estão atrasadas.
  const contasPendentes = ehDono
    ? (((
        await supabase
          .from("despesas")
          .select("vencimento")
          .eq("salao_id", salao.salaoId)
          .lte("vencimento", hojeBrasilia())
          .is("pago_em", null)
          .is("cancelado_em", null)
          .limit(500)
      ).data ?? []) as { vencimento: string }[])
    : [];
  const contasAtrasadas = contasPendentes.filter((c) => c.vencimento < hojeBrasilia()).length;
  const contasHoje = contasPendentes.length - contasAtrasadas;
  const nomePorUsuario = new Map(membros.map((m) => [m.user_id, m.nome ?? m.email]));
  const autor = (id: string | null) =>
    id === userId ? "por você" : id && nomePorUsuario.get(id) ? `por ${nomePorUsuario.get(id)}` : "pelo sistema";

  return (
    <div className="flex flex-1 flex-col bg-stone-100 pb-20 md:pb-0 md:pl-56">
      <Cabecalho salao={salao} atual="/painel" />

      <main className="mx-auto w-full max-w-3xl flex-1 space-y-6 px-4 py-6">
        {caixaEsquecido && (
          <Link
            href={`/caixa?d=${caixaEsquecido.data}`}
            className="flex items-center gap-3 rounded-2xl bg-amber-50 px-5 py-4 text-amber-900 shadow-sm ring-1 ring-amber-200 hover:bg-amber-100"
          >
            <TriangleAlert aria-hidden className="h-5 w-5 shrink-0" />
            <span className="flex-1 text-sm">
              <strong>O caixa de {caixaEsquecido.data.split("-").reverse().join("/")} ficou aberto.</strong> Feche para conferir o dia.
            </span>
            <span className="text-sm font-semibold">Ver</span>
          </Link>
        )}
        {(contasAtrasadas > 0 || contasHoje > 0) && (
          <Link
            href="/despesas"
            className="flex items-center gap-3 rounded-2xl bg-red-50 px-5 py-4 text-red-900 shadow-sm ring-1 ring-red-200 hover:bg-red-100"
          >
            <TriangleAlert aria-hidden className="h-5 w-5 shrink-0" />
            <span className="flex-1 text-sm">
              <strong>
                {[
                  contasAtrasadas > 0 && (contasAtrasadas === 1 ? "1 conta atrasada" : `${contasAtrasadas} contas atrasadas`),
                  contasHoje > 0 && (contasHoje === 1 ? "1 conta vence hoje" : `${contasHoje} contas vencem hoje`),
                ]
                  .filter(Boolean)
                  .join(" e ")}
                .
              </strong>
            </span>
            <span className="text-sm font-semibold">Ver</span>
          </Link>
        )}
        {!caixaHojeAberto && (
          <Link
            href="/caixa"
            className="flex items-center gap-3 rounded-2xl bg-sky-50 px-5 py-4 text-sky-900 shadow-sm ring-1 ring-sky-200 hover:bg-sky-100"
          >
            <span className="flex-1 text-sm">
              <strong>O caixa de hoje ainda não foi aberto.</strong> Abra com o troco inicial.
            </span>
            <span className="text-sm font-semibold">Abrir</span>
          </Link>
        )}
        {comandasAntigas > 0 && (
          <Link
            href="/comandas"
            className="flex items-center gap-3 rounded-2xl bg-amber-50 px-5 py-4 text-amber-900 shadow-sm ring-1 ring-amber-200 hover:bg-amber-100"
          >
            <TriangleAlert aria-hidden className="h-5 w-5 shrink-0" />
            <span className="flex-1 text-sm">
              <strong>
                {comandasAntigas === 1 ? "1 comanda aberta" : `${comandasAntigas} comandas abertas`} de dias anteriores.
              </strong>{" "}
              Confira se falta receber ou fechar.
            </span>
            <span className="text-sm font-semibold">Ver</span>
          </Link>
        )}
        <section className={cartao}>
          <h1 className="text-xl font-semibold text-stone-900">Bem-vindo(a)!</h1>
          {ehDono ? (
            <>
              <p className="mt-2 text-stone-600">
                Primeiros passos. Nenhum é obrigatório: faça na ordem que quiser e volte quando precisar.
              </p>
              <ol className="mt-4 space-y-2">
                <PassoInicial
                  feito={temServicos}
                  href="/servicos"
                  titulo="Cadastrar os serviços"
                  detalhe="Nome, duração e preço de cada serviço."
                />
                <PassoInicial
                  feito={temProfissionais}
                  href="/profissionais"
                  titulo="Cadastrar quem atende"
                  detalhe="Profissionais e assistentes. Se você atende, cadastre-se também."
                />
                <PassoInicial
                  feito={membros.length > 1}
                  href="#equipe"
                  titulo="Dar acesso à equipe (opcional)"
                  detalhe="Só para quem precisa entrar no sistema, como a recepção."
                />
              </ol>
            </>
          ) : (
            <p className="mt-2 text-stone-600">
              {salao.perfil === "assistente"
                ? "A sua agenda e as suas comissões vão aparecer aqui nas próximas etapas."
                : "Use o menu acima. Agenda, comanda, comissões e caixa vão aparecer aqui nas próximas etapas."}
            </p>
          )}
        </section>

        {ehDono && (
          <section id="equipe" className={`${cartao} scroll-mt-4`}>
            <h2 className="font-semibold text-stone-900">Equipe com acesso ao sistema</h2>
            <p className="mt-1 text-sm text-stone-500">
              Opcional. Adicione só quem precisa entrar no sistema (ex.: recepcionista). Quem só atende
              não precisa de acesso. Salão com uma pessoa só não precisa adicionar ninguém.
            </p>

            <ul className="mt-4 divide-y divide-stone-100">
              {membros.map((m) => (
                <li key={m.id} className="flex flex-wrap items-center justify-between gap-3 py-3">
                  <div className="min-w-0">
                    <p className={`truncate text-sm font-medium ${m.ativo ? "text-stone-900" : "text-stone-400 line-through"}`}>
                      {m.nome ?? (m.user_id === userId ? "Você" : m.email)}
                    </p>
                    <p className="truncate text-xs text-stone-500">
                      {NOME_PERFIL[m.perfil]} · {m.email}
                      {!m.ativo && " · sem acesso"}
                      {m.ativo && m.trocar_senha && " · ainda não entrou"}
                    </p>
                  </div>
                  {m.perfil !== "dono" && (
                    <div className="flex flex-wrap justify-end gap-2">
                      <form action={mudarAcesso}>
                        <input type="hidden" name="membro_id" value={m.id} />
                        <input type="hidden" name="ativo" value={m.ativo ? "false" : "true"} />
                        <button className="shrink-0 rounded-lg px-3 py-1.5 text-xs font-medium text-stone-700 ring-1 ring-stone-300 hover:bg-stone-50">
                          {m.ativo ? "Tirar acesso" : "Devolver acesso"}
                        </button>
                      </form>
                      {!m.ativo && <RemoverPessoa membroId={m.id} nome={m.nome ?? m.email} />}
                    </div>
                  )}
                </li>
              ))}
            </ul>

            <div className="mt-4 border-t border-stone-100 pt-4">
              <FormEquipe />
            </div>
          </section>
        )}

        {auditoria && (
          <section className={cartao}>
            <h2 className="font-semibold text-stone-900">Registro de atividades</h2>
            <p className="mt-1 text-sm text-stone-500">Quem fez o quê no salão. Só o(a) dono(a) vê esta lista.</p>
            <ul className="mt-4 divide-y divide-stone-100">
              {(auditoria as RegistroAuditoria[]).map((r) => (
                <li key={r.id} className="flex flex-col gap-0.5 py-3 sm:flex-row sm:justify-between sm:gap-4">
                  <span className="text-sm text-stone-800">{descreverAuditoria(r, nomesClientes, nomesProfissionais)}</span>
                  <span className="shrink-0 text-xs text-stone-500">
                    {dataHoraBrasil(r.em)} · {autor(r.user_id)}
                  </span>
                </li>
              ))}
            </ul>
          </section>
        )}
      </main>
    </div>
  );
}

/** Um item da lista de primeiros passos (com link quando já está disponível). */
function PassoInicial({ titulo, detalhe, href, feito }: { titulo: string; detalhe: string; href?: string; feito?: boolean }) {
  const conteudo = (
    <div className="flex items-start gap-3">
      <span
        aria-hidden
        className={`mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-xs font-bold ${
          feito ? "bg-emerald-600 text-white" : "ring-1 ring-stone-300 text-transparent"
        }`}
      >
        ✓
      </span>
      <span className="min-w-0">
        <span className={`block text-sm font-medium ${href ? "text-rose-800" : "text-stone-500"}`}>
          {titulo}
          {feito && <span className="sr-only"> (feito)</span>}
        </span>
        <span className="block text-xs text-stone-500">{detalhe}</span>
      </span>
    </div>
  );
  return (
    <li>
      {href ? (
        <Link href={href} className="block rounded-lg p-2 hover:bg-stone-50">
          {conteudo}
        </Link>
      ) : (
        <div className="p-2">{conteudo}</div>
      )}
    </li>
  );
}
