"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Mensagem } from "@/components/ui";
import { centavosParaTexto, formatarReais, reaisParaCentavos } from "@/lib/dinheiro";
import { NOME_MEIO } from "@/lib/pagamento-comissoes";
import { dataCurta } from "@/lib/periodos";
import { registrarPagamentos, type Meio } from "../acoes";

type Saldo = { profissionalId: string; nome: string; totalCentavos: number; quantidade: number; desde: string; valesCentavos: number };
type Resultado = ({ profissionalId: string; ok: true; pagamentoId: string } | { profissionalId: string; ok: false; erro: string }) & { nome: string };

const campo =
  "block w-full rounded-lg border border-stone-300 bg-white px-3 py-2.5 text-base text-stone-900 outline-none focus:border-rose-600 focus:ring-2 focus:ring-rose-200";

export default function FormPagar({ ate, hoje, saldos }: { ate: string; hoje: string; saldos: Saldo[] }) {
  const router = useRouter();
  const pagaveis = saldos.filter((s) => s.totalCentavos > 0);
  const [marcados, setMarcados] = useState<Set<string>>(new Set(pagaveis.map((s) => s.profissionalId)));
  const [meio, setMeio] = useState<Meio>("pix");
  const [pagoEm, setPagoEm] = useState(hoje);
  const [obs, setObs] = useState("");
  const [conferindo, setConferindo] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [resultados, setResultados] = useState<Resultado[] | null>(null);
  const [enviando, iniciar] = useTransition();
  // Vale a descontar de cada pessoa (o dono escolhe: tudo, uma parte ou nada). Começa com tudo o que cabe.
  const maxVale = (s: Saldo) => Math.max(0, Math.min(s.valesCentavos, s.totalCentavos));
  const [vales, setVales] = useState<Record<string, string>>(() =>
    Object.fromEntries(pagaveis.filter((s) => maxVale(s) > 0).map((s) => [s.profissionalId, centavosParaTexto(maxVale(s))])),
  );
  const descontoDe = (s: Saldo): number | null => {
    const t = (vales[s.profissionalId] ?? "").trim();
    if (!t) return 0;
    const v = reaisParaCentavos(t);
    return v === null || v < 0 || v > maxVale(s) ? null : v;
  };

  const escolhidos = pagaveis.filter((s) => marcados.has(s.profissionalId));
  const total = escolhidos.reduce((t, s) => t + s.totalCentavos - (descontoDe(s) ?? 0), 0);
  const valeInvalido = escolhidos.find((s) => descontoDe(s) === null);

  const alternar = (id: string) =>
    setMarcados((m) => {
      const n = new Set(m);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });

  if (resultados)
    return (
      <section className="space-y-3 rounded-2xl bg-white p-5 shadow-sm ring-1 ring-stone-200">
        <h2 className="font-semibold text-stone-900">Resultado</h2>
        <ul className="space-y-2 text-sm">
          {resultados.map((r) => (
            <li key={r.profissionalId} className="flex flex-wrap justify-between gap-2">
              <span className="text-stone-800">{r.nome}</span>
              {r.ok ? (
                <Link href={`/comissoes/pagamentos/${r.pagamentoId}`} className="font-semibold text-rose-700 hover:underline">
                  Registrado · ver comprovante
                </Link>
              ) : (
                <span className="text-red-700">Não registrado: {r.erro}</span>
              )}
            </li>
          ))}
        </ul>
        <button type="button" onClick={() => { setResultados(null); setConferindo(false); router.refresh(); }} className="text-sm font-medium text-stone-600 hover:underline">
          Voltar para a lista
        </button>
      </section>
    );

  if (saldos.length === 0) return <p className="px-1 text-sm text-stone-500">Nenhuma comissão a pagar até {dataCurta(ate)}.</p>;

  return (
    <section className="space-y-4 rounded-2xl bg-white p-5 shadow-sm ring-1 ring-stone-200">
      <ul className="divide-y divide-stone-100 rounded-xl ring-1 ring-stone-200">
        {saldos.map((s) => {
          const pode = s.totalCentavos > 0;
          return (
            <li key={s.profissionalId}>
              <label className={`flex items-start gap-3 px-4 py-3 ${pode ? "cursor-pointer" : "opacity-70"}`}>
                <input
                  type="checkbox"
                  disabled={!pode || conferindo}
                  checked={pode && marcados.has(s.profissionalId)}
                  onChange={() => alternar(s.profissionalId)}
                  className="mt-1 h-5 w-5 shrink-0 accent-rose-700"
                />
                <span className="min-w-0 flex-1">
                  <span className="block font-medium text-stone-900">{s.nome}</span>
                  <span className="block text-xs text-stone-500">
                    {s.quantidade} {s.quantidade === 1 ? "lançamento" : "lançamentos"} desde {s.desde}
                    {!pode && " · saldo zero ou negativo: fica para o próximo pagamento"}
                  </span>
                </span>
                <span className={`shrink-0 font-semibold ${s.totalCentavos < 0 ? "text-amber-800" : "text-stone-900"}`}>{formatarReais(s.totalCentavos)}</span>
              </label>
              {pode && maxVale(s) > 0 && (
                <div className="mb-3 ml-12 mr-4 space-y-2 rounded-lg bg-amber-50 p-3 text-sm text-amber-900 ring-1 ring-amber-200">
                  <p>
                    Vale em aberto: <strong>{formatarReais(s.valesCentavos)}</strong>. Quanto descontar agora?
                  </p>
                  <div className="flex flex-wrap items-center gap-2">
                    <input
                      inputMode="decimal"
                      aria-label={`Vale a descontar de ${s.nome}`}
                      disabled={conferindo}
                      value={vales[s.profissionalId] ?? ""}
                      onChange={(e) => setVales((v) => ({ ...v, [s.profissionalId]: e.target.value }))}
                      className="w-28 rounded-lg border border-stone-300 bg-white px-3 py-1.5 text-base text-stone-900 outline-none focus:border-rose-600 focus:ring-2 focus:ring-rose-200"
                    />
                    <button type="button" disabled={conferindo} onClick={() => setVales((v) => ({ ...v, [s.profissionalId]: centavosParaTexto(maxVale(s)) }))} className="rounded-lg px-3 py-1.5 font-medium ring-1 ring-amber-300 hover:bg-white">
                      Tudo
                    </button>
                    <button type="button" disabled={conferindo} onClick={() => setVales((v) => ({ ...v, [s.profissionalId]: "" }))} className="rounded-lg px-3 py-1.5 font-medium ring-1 ring-amber-300 hover:bg-white">
                      Nada
                    </button>
                  </div>
                  {descontoDe(s) === null ? (
                    <p className="text-red-700">Use um valor de 0 até {formatarReais(maxVale(s))}.</p>
                  ) : (
                    <p>Valor a entregar: <strong>{formatarReais(s.totalCentavos - (descontoDe(s) ?? 0))}</strong></p>
                  )}
                </div>
              )}
            </li>
          );
        })}
      </ul>

      {pagaveis.length > 0 && (
        <>
          <fieldset disabled={conferindo} className="space-y-3">
            <div>
              <span className="text-sm text-stone-700">Como foi pago</span>
              <div className="mt-1 flex flex-wrap gap-2">
                {(Object.keys(NOME_MEIO) as Meio[]).map((m) => (
                  <button
                    key={m}
                    type="button"
                    onClick={() => setMeio(m)}
                    aria-pressed={meio === m}
                    className={`rounded-lg px-3 py-2 text-sm font-medium ring-1 ${meio === m ? "bg-rose-50 text-rose-800 ring-rose-300" : "text-stone-700 ring-stone-300 hover:bg-stone-50"}`}
                  >
                    {NOME_MEIO[m]}
                  </button>
                ))}
              </div>
            </div>
            <label className="block">
              <span className="text-sm text-stone-700">Data do pagamento</span>
              <input type="date" value={pagoEm} max={hoje} onChange={(e) => setPagoEm(e.target.value)} className={`${campo} mt-1 max-w-48`} />
            </label>
            <label className="block">
              <span className="text-sm text-stone-700">Observação (opcional)</span>
              <input value={obs} maxLength={200} onChange={(e) => setObs(e.target.value)} placeholder="Ex.: pago na conta de sempre" className={`${campo} mt-1`} />
            </label>
          </fieldset>

          {erro && <Mensagem tipo="erro">{erro}</Mensagem>}

          {!conferindo ? (
            <button
              type="button"
              disabled={escolhidos.length === 0 || !pagoEm || Boolean(valeInvalido)}
              onClick={() => { setErro(null); setConferindo(true); }}
              className="w-full rounded-lg bg-rose-700 px-4 py-3 text-base font-semibold text-white hover:bg-rose-800 disabled:opacity-50"
            >
              Conferir pagamento de {formatarReais(total)}
            </button>
          ) : (
            <div className="space-y-3 rounded-xl bg-amber-50 p-4 ring-1 ring-amber-200">
              <p className="font-semibold text-amber-900">Confira antes de registrar</p>
              <ul className="text-sm text-amber-900">
                {escolhidos.map((s) => {
                  const d = descontoDe(s) ?? 0;
                  return (
                    <li key={s.profissionalId}>
                      {s.nome}: <strong>{formatarReais(s.totalCentavos - d)}</strong>
                      {d > 0 && ` (comissão ${formatarReais(s.totalCentavos)} − vale ${formatarReais(d)})`}
                    </li>
                  );
                })}
              </ul>
              <p className="text-sm text-amber-900">
                Total a entregar {formatarReais(total)} · {NOME_MEIO[meio]} · pago em {dataCurta(pagoEm)} · quita o que estava a pagar até {dataCurta(ate)}.
              </p>
              <p className="text-xs text-amber-900">Só registra. Se algo estiver errado depois, dá para cancelar com motivo (nada é apagado).</p>
              <div className="flex gap-2">
                <button type="button" onClick={() => setConferindo(false)} className="rounded-lg px-4 py-2.5 text-sm font-medium text-stone-700 ring-1 ring-stone-300 hover:bg-white">
                  Voltar
                </button>
                <button
                  type="button"
                  disabled={enviando}
                  onClick={() =>
                    iniciar(async () => {
                      // Guarda os nomes agora: depois de registrar, a lista se atualiza e eles somem dela.
                      const nomes = new Map(escolhidos.map((s) => [s.profissionalId, s.nome]));
                      const r = await registrarPagamentos(
                        ate,
                        escolhidos.map((s) => ({ profissionalId: s.profissionalId, valorConferido: s.totalCentavos, descontoVales: descontoDe(s) ?? 0 })),
                        meio,
                        pagoEm,
                        obs,
                      );
                      if (!r.ok) {
                        setErro(r.erro);
                        setConferindo(false);
                        return;
                      }
                      setResultados(r.resultados.map((x) => ({ ...x, nome: nomes.get(x.profissionalId) ?? "Profissional" })));
                    })
                  }
                  className="rounded-lg bg-amber-700 px-4 py-2.5 text-sm font-semibold text-white hover:bg-amber-800 disabled:opacity-50"
                >
                  {enviando ? "Registrando..." : "Registrar pagamento"}
                </button>
              </div>
            </div>
          )}
        </>
      )}
    </section>
  );
}
