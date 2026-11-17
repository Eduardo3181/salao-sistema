"use client";

import { Plus, Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useMemo, useState, useTransition } from "react";
import { Mensagem } from "@/components/ui";
import { calcularComissaoItem, ErroComissao, resolverPercentual, type RegraAssistente } from "@/lib/comissoes";
import { MODELOS_ASSISTENTE, montarRegras, type LinhaConfigComissao, type LinhaRegraComissao } from "@/lib/comissoes-config";
import { centavosParaTexto, centesimosParaTexto, formatarReais, percentualParaCentesimos, reaisParaCentavos } from "@/lib/dinheiro";
import { salvarComissoes, type FormComissoes as Dados } from "./acoes";

const campo =
  "block w-full rounded-lg border border-stone-300 bg-white px-3 py-2 text-base text-stone-900 outline-none focus:border-rose-600 focus:ring-2 focus:ring-rose-200";
const cartao = "space-y-4 rounded-2xl bg-white p-5 shadow-sm ring-1 ring-stone-200";
const pctTexto = (c: number | null | undefined) => (c === null || c === undefined ? "" : centesimosParaTexto(c).replace(/,00$/, ""));

type Opcao = { id: string; nome: string };

export default function FormComissoes({
  config,
  regras,
  profissionais,
  temAssistentes,
  servicos,
  taxas,
}: {
  config: LinhaConfigComissao;
  regras: LinhaRegraComissao[];
  profissionais: Opcao[];
  temAssistentes: boolean;
  servicos: (Opcao & { preco: number })[];
  taxas: { forma: string; parcelas: number; taxa_centesimos: number }[];
}) {
  const router = useRouter();
  const [salvando, iniciar] = useTransition();
  const [erro, setErro] = useState<string | null>(null);
  const [ok, setOk] = useState(false);

  // ---- estado do formulário (como a pessoa digita) ----
  const [padrao, setPadrao] = useState(pctTexto(config.percentual_padrao));
  const [descontarTaxa, setDescontarTaxa] = useState(config.descontar_taxa_cartao);
  const [produtos, setProdutos] = useState(config.comissao_produtos);
  const [percProdutos, setPercProdutos] = useState(pctTexto(config.percentual_produtos));
  const [temAssist, setTemAssist] = useState(config.assistente_base !== null);
  const [base, setBase] = useState<RegraAssistente["base"]>(config.assistente_base ?? "percentual_comissao");
  const [valorAssist, setValorAssist] = useState(
    config.assistente_valor === null ? "20" : config.assistente_base === "valor_fixo" ? centavosParaTexto(Number(config.assistente_valor)) : pctTexto(Number(config.assistente_valor)),
  );
  const [quemPaga, setQuemPaga] = useState<RegraAssistente["quemPaga"]>(config.assistente_quem_paga ?? "profissional");
  const [percDaProf, setPercDaProf] = useState(pctTexto(config.assistente_percentual_profissional ?? 5000));
  const [porProf, setPorProf] = useState<Record<string, string>>(
    Object.fromEntries(regras.filter((r) => r.profissional_id && !r.servico_id).map((r) => [r.profissional_id!, pctTexto(r.percentual)])),
  );
  const [porServ, setPorServ] = useState<Record<string, string>>(
    Object.fromEntries(regras.filter((r) => !r.profissional_id && r.servico_id).map((r) => [r.servico_id!, pctTexto(r.percentual)])),
  );
  const [porProfServ, setPorProfServ] = useState(
    regras
      .filter((r) => r.profissional_id && r.servico_id)
      .map((r) => ({ profissionalId: r.profissional_id!, servicoId: r.servico_id!, percentual: pctTexto(r.percentual) })),
  );
  const mudou = <T,>(f: (v: T) => void) => (v: T) => {
    f(v);
    setOk(false);
  };

  const aplicarModelo = (id: string) => {
    const m = MODELOS_ASSISTENTE.find((x) => x.id === id);
    setOk(false);
    if (!m?.regra) return setTemAssist(false);
    setTemAssist(true);
    setBase(m.regra.base);
    setQuemPaga(m.regra.quemPaga);
    setValorAssist(m.regra.base === "valor_fixo" ? centavosParaTexto(m.regra.valor) : pctTexto(m.regra.valor));
  };

  // ---- simulação (usa os valores ainda não salvos) ----
  const [simProf, setSimProf] = useState(profissionais[0]?.id ?? "");
  const [simServ, setSimServ] = useState(servicos[0]?.id ?? "");
  const [simValor, setSimValor] = useState(servicos[0] ? centavosParaTexto(servicos[0].preco) : "200,00");
  const [simForma, setSimForma] = useState("pix");
  const [simAssist, setSimAssist] = useState(0);

  const simulacao = useMemo(() => {
    try {
      const p = (t: string) => {
        const v = percentualParaCentesimos(t);
        if (v === null) throw new ErroComissao("Confira as porcentagens digitadas.");
        return v;
      };
      const linhas: LinhaRegraComissao[] = [
        ...Object.entries(porProf).filter(([, t]) => t.trim()).map(([id, t]) => ({ profissional_id: id, servico_id: null, percentual: p(t) })),
        ...Object.entries(porServ).filter(([, t]) => t.trim()).map(([id, t]) => ({ profissional_id: null, servico_id: id, percentual: p(t) })),
        ...porProfServ.filter((x) => x.profissionalId && x.servicoId && x.percentual.trim()).map((x) => ({ profissional_id: x.profissionalId, servico_id: x.servicoId, percentual: p(x.percentual) })),
      ];
      const regrasMotor = montarRegras({ percentual_padrao: p(padrao || "0") } as LinhaConfigComissao, linhas);
      const { percentual, origem } = resolverPercentual(regrasMotor, simProf, simServ);
      const valor = reaisParaCentavos(simValor);
      if (valor === null) throw new ErroComissao("Valor do serviço inválido.");
      const [forma, parcelas] = simForma.split(":");
      const taxaPct = taxas.find((t) => t.forma === forma && t.parcelas === Number(parcelas ?? 1))?.taxa_centesimos ?? 0;
      const taxa = Math.floor((valor * taxaPct + 5000) / 10000);
      let regraAssistente: RegraAssistente | null = null;
      if (temAssist) {
        const v = base === "valor_fixo" ? reaisParaCentavos(valorAssist) : percentualParaCentesimos(valorAssist);
        if (v === null) throw new ErroComissao("Confira o valor da assistente.");
        regraAssistente = { base, valor: v, quemPaga, percentualDaProfissional: quemPaga === "dividido" ? p(percDaProf) : undefined };
      }
      const r = calcularComissaoItem({
        valorCentavos: valor,
        taxaCentavos: Math.min(taxa, valor),
        percentual,
        descontarTaxa,
        assistentes: Array.from({ length: temAssist ? simAssist : 0 }, (_, i) => `a${i}`),
        regraAssistente,
      });
      return { ok: true as const, r, percentual, origem, valor, taxa };
    } catch (e) {
      return { ok: false as const, erro: e instanceof ErroComissao ? e.message : "Confira os valores." };
    }
  }, [padrao, porProf, porServ, porProfServ, simProf, simServ, simValor, simForma, simAssist, temAssist, base, valorAssist, quemPaga, percDaProf, descontarTaxa, taxas]);

  const ORIGEM: Record<string, string> = {
    profissional_servico: "exceção desta profissional neste serviço",
    servico: "exceção do serviço",
    profissional: "% da profissional",
    padrao_salao: "padrão do salão",
  };

  const salvar = () =>
    iniciar(async () => {
      setErro(null);
      const dados: Dados = {
        padrao: padrao || "0",
        descontarTaxa,
        produtos,
        percentualProdutos: percProdutos || "0",
        assistente: temAssist ? { base, valor: valorAssist, quemPaga, percentualDaProfissional: percDaProf } : null,
        porProfissional: porProf,
        porServico: porServ,
        porProfissionalServico: porProfServ,
      };
      const r = await salvarComissoes(dados);
      if (!r.ok) return setErro(r.erro);
      setOk(true);
      router.refresh();
    });

  return (
    <div className="space-y-5">
      {/* Geral */}
      <section className={cartao}>
        <h2 className="font-semibold text-stone-900">Comissão das profissionais</h2>
        <label className="block max-w-xs">
          <span className="text-sm text-stone-700">Padrão do salão (%)</span>
          <input inputMode="decimal" value={padrao} placeholder="ex.: 50" onChange={(e) => mudou(setPadrao)(e.target.value)} className={`${campo} mt-1`} />
          <span className="mt-1 block text-xs text-stone-500">Vale para quem não tiver % própria abaixo.</span>
        </label>

        {profissionais.length > 0 && (
          <div>
            <p className="text-sm font-medium text-stone-800">% de cada profissional (vazio = padrão do salão)</p>
            <div className="mt-2 grid grid-cols-2 gap-3 sm:grid-cols-3">
              {profissionais.map((p) => (
                <label key={p.id} className="block">
                  <span className="text-sm text-stone-700">{p.nome}</span>
                  <input
                    inputMode="decimal"
                    value={porProf[p.id] ?? ""}
                    placeholder={padrao || "0"}
                    onChange={(e) => mudou(setPorProf)({ ...porProf, [p.id]: e.target.value })}
                    className={`${campo} mt-1`}
                  />
                </label>
              ))}
            </div>
          </div>
        )}

        <label className="flex items-start gap-3">
          <input type="checkbox" checked={descontarTaxa} onChange={(e) => mudou(setDescontarTaxa)(e.target.checked)} className="mt-1 h-5 w-5 shrink-0 accent-rose-700" />
          <span>
            <span className="block text-sm font-medium text-stone-900">Descontar a taxa do cartão antes de calcular a comissão</span>
            <span className="block text-xs text-stone-500">Desligado: o salão paga a taxa sozinho. Ligado: a comissão é sobre o valor menos a taxa (vale também para a assistente).</span>
          </span>
        </label>

        <div className="flex flex-wrap items-end gap-3">
          <label className="flex items-start gap-3">
            <input type="checkbox" checked={produtos} onChange={(e) => mudou(setProdutos)(e.target.checked)} className="mt-1 h-5 w-5 shrink-0 accent-rose-700" />
            <span>
              <span className="block text-sm font-medium text-stone-900">Produto vendido gera comissão para quem vendeu</span>
              <span className="block text-xs text-stone-500">Só quando a comanda indica quem vendeu.</span>
            </span>
          </label>
          {produtos && (
            <label className="block w-32">
              <span className="text-sm text-stone-700">% de produtos</span>
              <input inputMode="decimal" value={percProdutos} onChange={(e) => mudou(setPercProdutos)(e.target.value)} className={`${campo} mt-1`} />
            </label>
          )}
        </div>
      </section>

      {/* Exceções por serviço */}
      <section className={cartao}>
        <h2 className="font-semibold text-stone-900">Exceções por serviço</h2>
        <p className="text-sm text-stone-500">
          Um serviço pode ter % diferente (ex.: coloração 30%). A regra mais específica vence: profissional + serviço, depois serviço, depois a % da profissional, depois o padrão.
        </p>
        <details className="rounded-lg ring-1 ring-stone-200" open={Object.values(porServ).some((v) => v)}>
          <summary className="cursor-pointer px-3 py-2.5 text-sm font-medium text-stone-800">% por serviço ({servicos.length} serviços)</summary>
          <div className="grid grid-cols-2 gap-3 p-3 sm:grid-cols-3">
            {servicos.map((s) => (
              <label key={s.id} className="block">
                <span className="block truncate text-sm text-stone-700">{s.nome}</span>
                <input inputMode="decimal" value={porServ[s.id] ?? ""} placeholder="—" onChange={(e) => mudou(setPorServ)({ ...porServ, [s.id]: e.target.value })} className={`${campo} mt-1`} />
              </label>
            ))}
          </div>
        </details>

        <div className="space-y-2">
          <p className="text-sm font-medium text-stone-800">Exceção de uma profissional em um serviço</p>
          {porProfServ.map((x, i) => (
            <div key={i} className="flex flex-wrap items-end gap-2">
              <select value={x.profissionalId} onChange={(e) => mudou(setPorProfServ)(porProfServ.map((y, j) => (j === i ? { ...y, profissionalId: e.target.value } : y)))} className={`${campo} w-auto`}>
                <option value="">Profissional...</option>
                {profissionais.map((p) => <option key={p.id} value={p.id}>{p.nome}</option>)}
              </select>
              <select value={x.servicoId} onChange={(e) => mudou(setPorProfServ)(porProfServ.map((y, j) => (j === i ? { ...y, servicoId: e.target.value } : y)))} className={`${campo} w-auto`}>
                <option value="">Serviço...</option>
                {servicos.map((s) => <option key={s.id} value={s.id}>{s.nome}</option>)}
              </select>
              <input inputMode="decimal" value={x.percentual} placeholder="%" onChange={(e) => mudou(setPorProfServ)(porProfServ.map((y, j) => (j === i ? { ...y, percentual: e.target.value } : y)))} className={`${campo} w-20`} />
              <button type="button" aria-label="Remover exceção" onClick={() => mudou(setPorProfServ)(porProfServ.filter((_, j) => j !== i))} className="rounded-lg p-2 text-red-700 hover:bg-red-50">
                <Trash2 aria-hidden className="h-4 w-4" />
              </button>
            </div>
          ))}
          <button type="button" onClick={() => mudou(setPorProfServ)([...porProfServ, { profissionalId: "", servicoId: "", percentual: "" }])} className="flex items-center gap-1 text-sm font-semibold text-rose-700 hover:underline">
            <Plus aria-hidden className="h-4 w-4" /> Adicionar exceção
          </button>
        </div>
      </section>

      {/* Assistentes */}
      <section className={cartao}>
        <h2 className="font-semibold text-stone-900">Assistentes</h2>
        {!temAssistentes && <p className="text-sm text-stone-500">Nenhuma assistente cadastrada em Quem atende. Pode deixar em &quot;Sem assistentes&quot;.</p>}
        <div className="grid gap-2 sm:grid-cols-2">
          {MODELOS_ASSISTENTE.map((m) => {
            const ativo = m.regra ? temAssist && base === m.regra.base && quemPaga === m.regra.quemPaga : !temAssist;
            return (
              <button key={m.id} type="button" onClick={() => aplicarModelo(m.id)} className={`rounded-xl p-3 text-left ring-1 ${ativo ? "bg-rose-50 ring-2 ring-rose-600" : "ring-stone-300 hover:bg-stone-50"}`}>
                <span className="block text-sm font-semibold text-stone-900">{m.nome}</span>
                <span className="block text-xs text-stone-600">{m.descricao}</span>
              </button>
            );
          })}
        </div>

        {temAssist && (
          <div className="grid gap-3 rounded-xl bg-stone-50 p-4 ring-1 ring-stone-200 sm:grid-cols-2">
            <label className="block">
              <span className="text-sm text-stone-700">A parte da assistente é</span>
              <select value={base} onChange={(e) => mudou(setBase)(e.target.value as RegraAssistente["base"])} className={`${campo} mt-1`}>
                <option value="percentual_comissao">% da comissão da profissional</option>
                <option value="percentual_servico">% do valor do serviço</option>
                <option value="valor_fixo">Valor fixo por serviço (R$)</option>
              </select>
            </label>
            <label className="block">
              <span className="text-sm text-stone-700">{base === "valor_fixo" ? "Valor (R$)" : "Porcentagem (%)"}</span>
              <input inputMode="decimal" value={valorAssist} onChange={(e) => mudou(setValorAssist)(e.target.value)} className={`${campo} mt-1`} />
            </label>
            <label className="block">
              <span className="text-sm text-stone-700">Quem paga</span>
              <select value={quemPaga} onChange={(e) => mudou(setQuemPaga)(e.target.value as RegraAssistente["quemPaga"])} className={`${campo} mt-1`}>
                <option value="profissional">Sai da comissão da profissional</option>
                <option value="salao">O salão paga por fora</option>
                <option value="dividido">Dividido entre os dois</option>
              </select>
            </label>
            {quemPaga === "dividido" && (
              <label className="block">
                <span className="text-sm text-stone-700">Parte que sai da profissional (%)</span>
                <input inputMode="decimal" value={percDaProf} onChange={(e) => mudou(setPercDaProf)(e.target.value)} className={`${campo} mt-1`} />
              </label>
            )}
            <p className="text-xs text-stone-500 sm:col-span-2">
              Com mais de uma assistente no serviço, essa parte é dividida igualmente entre elas. O fixo mensal (se houver) é combinado à parte; o sistema não calcula encargos trabalhistas: confira com o contador.
            </p>
          </div>
        )}
      </section>

      {/* Simulação */}
      <section className={`${cartao} ring-rose-200`}>
        <h2 className="font-semibold text-stone-900">Simulação</h2>
        <p className="text-sm text-stone-500">Confira quanto cada uma recebe com as regras acima, antes de salvar.</p>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          <label className="block">
            <span className="text-sm text-stone-700">Profissional</span>
            <select value={simProf} onChange={(e) => setSimProf(e.target.value)} className={`${campo} mt-1`}>
              {profissionais.length === 0 && <option value="">(nenhuma)</option>}
              {profissionais.map((p) => <option key={p.id} value={p.id}>{p.nome}</option>)}
            </select>
          </label>
          <label className="block">
            <span className="text-sm text-stone-700">Serviço</span>
            <select
              value={simServ}
              onChange={(e) => {
                setSimServ(e.target.value);
                const s = servicos.find((x) => x.id === e.target.value);
                if (s) setSimValor(centavosParaTexto(s.preco));
              }}
              className={`${campo} mt-1`}
            >
              {servicos.length === 0 && <option value="">(nenhum)</option>}
              {servicos.map((s) => <option key={s.id} value={s.id}>{s.nome}</option>)}
            </select>
          </label>
          <label className="block">
            <span className="text-sm text-stone-700">Valor (R$)</span>
            <input inputMode="decimal" value={simValor} onChange={(e) => setSimValor(e.target.value)} className={`${campo} mt-1`} />
          </label>
          <label className="block">
            <span className="text-sm text-stone-700">Pagamento</span>
            <select value={simForma} onChange={(e) => setSimForma(e.target.value)} className={`${campo} mt-1`}>
              <option value="pix">Pix ou dinheiro (sem taxa)</option>
              <option value="debito">Débito</option>
              <option value="credito_vista">Crédito à vista</option>
              {Array.from({ length: 11 }, (_, i) => i + 2).map((n) => <option key={n} value={`credito_parcelado:${n}`}>Crédito {n}x</option>)}
            </select>
          </label>
          {temAssist && (
            <label className="block">
              <span className="text-sm text-stone-700">Assistentes no serviço</span>
              <select value={simAssist} onChange={(e) => setSimAssist(Number(e.target.value))} className={`${campo} mt-1`}>
                {[0, 1, 2, 3].map((n) => <option key={n} value={n}>{n}</option>)}
              </select>
            </label>
          )}
        </div>

        {simulacao.ok ? (
          <dl className="space-y-1 rounded-xl bg-rose-50 p-4 text-sm text-stone-800">
            <div className="flex justify-between"><dt>Valor do serviço</dt><dd>{formatarReais(simulacao.valor)}</dd></div>
            {simulacao.r.taxaDescontadaCentavos > 0 && (
              <div className="flex justify-between"><dt>Taxa do cartão descontada</dt><dd>− {formatarReais(simulacao.r.taxaDescontadaCentavos)}</dd></div>
            )}
            <div className="flex justify-between"><dt>Comissão ({pctTexto(simulacao.percentual)}%, {ORIGEM[simulacao.origem]})</dt><dd>{formatarReais(simulacao.r.comissaoBrutaCentavos)}</dd></div>
            {simulacao.r.assistentes.map((a, i) => (
              <div key={a.id} className="flex justify-between"><dt>Assistente {i + 1}</dt><dd>{formatarReais(a.valorCentavos)}</dd></div>
            ))}
            <div className="flex justify-between border-t border-rose-200 pt-1 font-semibold"><dt>Profissional recebe</dt><dd>{formatarReais(simulacao.r.comissaoProfissionalCentavos)}</dd></div>
            {simulacao.r.repasseSalaoCentavos > 0 && (
              <div className="flex justify-between text-stone-600"><dt>Salão paga às assistentes por fora</dt><dd>{formatarReais(simulacao.r.repasseSalaoCentavos)}</dd></div>
            )}
          </dl>
        ) : (
          <Mensagem tipo="erro">{simulacao.erro}</Mensagem>
        )}
      </section>

      {erro && <Mensagem tipo="erro">{erro}</Mensagem>}
      {ok && <Mensagem tipo="aviso">Comissões salvas. Valem para as próximas comandas.</Mensagem>}
      <button type="button" disabled={salvando} onClick={salvar} className="w-full rounded-lg bg-rose-700 px-4 py-3 text-base font-semibold text-white hover:bg-rose-800 disabled:opacity-50">
        {salvando ? "Salvando..." : "Salvar comissões"}
      </button>
      <p className="text-xs text-stone-500">Toda mudança fica anotada no registro de atividades.</p>
    </div>
  );
}
