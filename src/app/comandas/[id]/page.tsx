import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { Suspense } from "react";
import { Cabecalho } from "@/components/cabecalho";
import { podeVerClientes } from "@/lib/clientes";
import { buscarItensComanda, NOME_FORMA, NOME_SITUACAO_COMANDA, quandoBrasilia, type FormaPagamento, type ResumoComanda, type SituacaoComanda } from "@/lib/comandas";
import { formatarReais } from "@/lib/dinheiro";
import { buscarProdutos } from "@/lib/produtos";
import { buscarProfissionais } from "@/lib/profissionais";
import { buscarCatalogo } from "@/lib/servicos";
import { exigirSalao } from "@/lib/sessao";
import { AcoesItem, CancelarComanda, DescontoGeral, Lancar } from "./editor";

export const metadata: Metadata = { title: "Comanda | Sistema do Salão" };

export default function PaginaComanda({ params }: PageProps<"/comandas/[id]">) {
  return (
    <Suspense fallback={<p className="p-6 text-sm text-stone-500">Carregando...</p>}>
      <Comanda params={params} />
    </Suspense>
  );
}

const COR_SITUACAO: Record<SituacaoComanda, string> = {
  aberta: "bg-sky-50 text-sky-900 ring-sky-200",
  fechada: "bg-emerald-50 text-emerald-900 ring-emerald-200",
  cancelada: "bg-stone-100 text-stone-600 ring-stone-300",
};

type Pagamento = { id: string; forma: FormaPagamento; valor_centavos: number; parcelas: number; troco_centavos: number; removido_em: string | null; motivo_remocao: string | null };

async function Comanda({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { supabase, salao } = await exigirSalao();
  if (salao.perfil === "assistente") redirect("/painel");

  const [{ data: c }, itens, { data: resumoR }, { data: pagR }, catalogo, produtosR, equipe, { data: minhas }] = await Promise.all([
    supabase
      .from("comandas")
      .select("id, situacao, cliente_id, agendamento_id, aberta_em, fechada_em, cancelada_em, motivo_cancelamento, desconto_centavos, clientes(nome)")
      .eq("id", id)
      .maybeSingle(),
    buscarItensComanda(supabase, id),
    supabase.rpc("resumo_comanda", { p_comanda_id: id }),
    supabase.from("pagamentos").select("id, forma, valor_centavos, parcelas, troco_centavos, removido_em, motivo_remocao").eq("comanda_id", id).order("criado_em"),
    buscarCatalogo(supabase, salao.salaoId),
    buscarProdutos(supabase, salao.salaoId, false),
    buscarProfissionais(supabase, salao.salaoId),
    supabase.rpc("minhas_agendas", { p_salao_id: salao.salaoId }),
  ]);
  if (!c || !resumoR) notFound();
  const resumo = resumoR as ResumoComanda;
  const situacao = c.situacao as SituacaoComanda;
  const cliente = (c as unknown as { clientes: { nome: string } | null }).clientes?.nome ?? "Cliente";
  const pagamentos = (pagR ?? []) as Pagamento[];
  const ativos = itens.filter((i) => !i.removido);
  const removidos = itens.filter((i) => i.removido);
  const subtotal = ativos.reduce((s, i) => s + i.total, 0);
  const verTudo = resumo.pode_mexer;

  // O que cada perfil pode fazer na tela (o banco confere tudo de novo).
  const aberta = situacao === "aberta";
  const recepcaoOuDono = salao.perfil === "dono" || salao.perfil === "recepcao";
  const minhaId = salao.perfil === "profissional" ? (((minhas ?? []) as { id: string }[])[0]?.id ?? null) : null;
  const servicos = catalogo.servicos.filter((s) => s.ativo).map((s) => ({ id: s.id, nome: s.nome, preco: Number(s.preco_centavos) }));
  const produtos = produtosR.filter((p) => p.ativo).map((p) => ({ id: p.id, nome: p.nome, preco: p.preco_centavos }));
  const profissionais = equipe.filter((p) => p.ativo && p.tipo === "profissional").map((p) => ({ id: p.id, nome: p.nome }));
  const assistentes = equipe.filter((p) => p.ativo && p.tipo === "assistente").map((p) => ({ id: p.id, nome: p.nome }));
  const podeLancar = aberta && (recepcaoOuDono || minhaId !== null);

  return (
    <div className="flex flex-1 flex-col bg-stone-100 pb-20 md:pb-0 md:pl-56">
      <Cabecalho salao={salao} atual="/comandas" />
      <main className="mx-auto w-full max-w-2xl flex-1 space-y-4 px-4 py-5">
        <Link href="/comandas" className="text-sm font-medium text-stone-600 hover:underline">
          ‹ Voltar para as comandas
        </Link>

        <section className="space-y-1 rounded-2xl bg-white p-5 shadow-sm ring-1 ring-stone-200">
          <div className="flex items-start justify-between gap-3">
            <h1 className="text-xl font-semibold text-stone-900">
              {podeVerClientes(salao.perfil) ? (
                <Link href={`/clientes/${c.cliente_id}`} className="hover:underline">{cliente}</Link>
              ) : (
                cliente
              )}
            </h1>
            <span className={`shrink-0 rounded-full px-3 py-1 text-xs font-semibold ring-1 ${COR_SITUACAO[situacao]}`}>{NOME_SITUACAO_COMANDA[situacao]}</span>
          </div>
          <p className="text-sm text-stone-500">
            Aberta {quandoBrasilia(c.aberta_em)}
            {c.fechada_em && ` · fechada ${quandoBrasilia(c.fechada_em)}`}
            {c.cancelada_em && ` · cancelada ${quandoBrasilia(c.cancelada_em)}`}
            {c.agendamento_id && " · veio da agenda"}
          </p>
          {c.motivo_cancelamento && <p className="text-sm text-stone-600">Motivo do cancelamento: {c.motivo_cancelamento}</p>}
        </section>

        <section className="space-y-3 rounded-2xl bg-white p-5 shadow-sm ring-1 ring-stone-200">
          <h2 className="font-semibold text-stone-900">{verTudo ? "Itens" : "Seus itens"}</h2>
          {ativos.length === 0 ? (
            <p className="text-sm text-stone-500">Nenhum item lançado ainda.</p>
          ) : (
            <ul className="divide-y divide-stone-100 rounded-xl ring-1 ring-stone-200">
              {ativos.map((i) => (
                <li key={i.id} className="flex items-start justify-between gap-3 px-4 py-3 text-sm">
                  <span className="min-w-0 flex-1">
                    <span className="block font-medium text-stone-900">
                      {i.quantidade > 1 ? `${i.quantidade}× ` : ""}
                      {i.nome}
                    </span>
                    <span className="block text-stone-500">
                      {i.tipo === "servico" ? "Serviço" : "Produto"}
                      {i.profissional ? ` · ${i.profissional}` : ""}
                      {i.assistentes.length ? ` · assistente: ${i.assistentes.join(", ")}` : ""}
                    </span>
                    {(i.precoUnitario !== i.precoTabela || i.desconto > 0) && (
                      <span className="block text-xs text-stone-500">
                        Tabela {formatarReais(i.precoTabela)}
                        {i.precoUnitario !== i.precoTabela && ` · cobrado ${formatarReais(i.precoUnitario)}`}
                        {i.desconto > 0 && ` · desconto ${formatarReais(i.desconto)}`}
                      </span>
                    )}
                    {aberta && (
                      <AcoesItem
                        comandaId={id}
                        item={i}
                        podeEditar={recepcaoOuDono || (minhaId !== null && i.profissionalId === minhaId)}
                        podeAlterarPreco={resumo.pode_alterar_preco}
                        podeExcluir={recepcaoOuDono}
                        assistentes={assistentes}
                      />
                    )}
                  </span>
                  <span className="shrink-0 font-medium text-stone-900">{formatarReais(i.total)}</span>
                </li>
              ))}
            </ul>
          )}

          <dl className="space-y-1 border-t border-stone-100 pt-3 text-sm">
            {verTudo && Number(c.desconto_centavos) > 0 && (
              <>
                <div className="flex justify-between text-stone-600"><dt>Soma dos itens</dt><dd>{formatarReais(subtotal)}</dd></div>
                <div className="flex justify-between text-stone-600"><dt>Desconto na comanda</dt><dd>− {formatarReais(Number(c.desconto_centavos))}</dd></div>
              </>
            )}
            <div className="flex justify-between text-base font-semibold text-stone-900">
              <dt>{verTudo ? "Total" : "Total dos seus itens"}</dt>
              <dd>{formatarReais(verTudo ? resumo.total_centavos : subtotal)}</dd>
            </div>
            {verTudo && resumo.pago_centavos !== null && resumo.pago_centavos > 0 && (
              <div className="flex justify-between text-stone-600"><dt>Pago</dt><dd>{formatarReais(resumo.pago_centavos)}</dd></div>
            )}
            {verTudo && situacao === "aberta" && resumo.falta_centavos !== null && (
              <div className="flex justify-between font-semibold text-rose-800"><dt>Falta receber</dt><dd>{formatarReais(resumo.falta_centavos)}</dd></div>
            )}
          </dl>
          {aberta && verTudo && resumo.pode_alterar_preco && ativos.length > 0 && (
            <DescontoGeral comandaId={id} atual={Number(c.desconto_centavos)} />
          )}
          {!verTudo && (
            <p className="text-xs text-stone-500">Esta comanda tem itens de outra profissional. O total e o pagamento ficam com a recepção ou o dono.</p>
          )}
          {podeLancar && (
            <Lancar
              comandaId={id}
              servicos={servicos}
              produtos={produtos}
              profissionais={profissionais}
              minhaId={minhaId}
              podeAlterarPreco={resumo.pode_alterar_preco}
            />
          )}
        </section>

        {verTudo && pagamentos.length > 0 && (
          <section className="space-y-3 rounded-2xl bg-white p-5 shadow-sm ring-1 ring-stone-200">
            <h2 className="font-semibold text-stone-900">Pagamentos</h2>
            <ul className="divide-y divide-stone-100 rounded-xl ring-1 ring-stone-200">
              {pagamentos.map((p) => (
                <li key={p.id} className={`flex justify-between gap-3 px-4 py-3 text-sm ${p.removido_em ? "text-stone-400 line-through" : "text-stone-800"}`}>
                  <span>
                    {NOME_FORMA[p.forma]}
                    {p.forma === "credito_parcelado" ? ` em ${p.parcelas}x` : ""}
                    {Number(p.troco_centavos) > 0 ? ` · troco ${formatarReais(Number(p.troco_centavos))}` : ""}
                    {p.removido_em && <span className="block text-xs no-underline">Removido: {p.motivo_remocao}</span>}
                  </span>
                  <span className="font-medium">{formatarReais(Number(p.valor_centavos))}</span>
                </li>
              ))}
            </ul>
          </section>
        )}

        {aberta && recepcaoOuDono && (
          <div className="px-1">
            <CancelarComanda comandaId={id} />
          </div>
        )}

        {removidos.length > 0 && (
          <section className="space-y-2 rounded-2xl bg-white p-5 shadow-sm ring-1 ring-stone-200">
            <h2 className="text-sm font-semibold text-stone-700">Itens excluídos</h2>
            <ul className="space-y-1 text-sm text-stone-500">
              {removidos.map((i) => (
                <li key={i.id}>
                  <span className="line-through">{i.nome} ({formatarReais(i.total)})</span> · {i.removido!.motivo}
                </li>
              ))}
            </ul>
          </section>
        )}
      </main>
    </div>
  );
}
