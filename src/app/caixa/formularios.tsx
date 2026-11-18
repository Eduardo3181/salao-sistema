"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Mensagem } from "@/components/ui";
import { formatarReais, reaisParaCentavos } from "@/lib/dinheiro";
import { abrirCaixa, cancelarMovimento, fecharCaixa, reabrirCaixa, registrarMovimento } from "./acoes";

const campo =
  "block w-full rounded-lg border border-stone-300 bg-white px-3 py-2.5 text-base text-stone-900 outline-none focus:border-rose-600 focus:ring-2 focus:ring-rose-200";
const botao = "rounded-lg bg-rose-700 px-4 py-2.5 text-sm font-semibold text-white hover:bg-rose-800 disabled:opacity-50";
const botaoSecundario = "rounded-lg px-4 py-2.5 text-sm font-medium text-stone-700 ring-1 ring-stone-300 hover:bg-white";

/** Ação com mensagem de erro e atualização da tela no sucesso. */
function useAcao() {
  const router = useRouter();
  const [erro, setErro] = useState<string | null>(null);
  const [enviando, iniciar] = useTransition();
  const rodar = (f: () => Promise<{ ok: true } | { ok: false; erro: string }>, depois?: () => void) =>
    iniciar(async () => {
      setErro(null);
      const r = await f();
      if (!r.ok) return setErro(r.erro);
      depois?.();
      router.refresh();
    });
  return { erro, enviando, rodar };
}

export function AbrirCaixa() {
  const [troco, setTroco] = useState("");
  const { erro, enviando, rodar } = useAcao();
  return (
    <section className="space-y-3 rounded-2xl bg-white p-5 shadow-sm ring-1 ring-stone-200">
      <h2 className="font-semibold text-stone-900">Abrir o caixa de hoje</h2>
      <p className="text-sm text-stone-500">Quanto dinheiro tem na gaveta para troco? Se não tiver nada, deixe 0.</p>
      {erro && <Mensagem tipo="erro">{erro}</Mensagem>}
      <div className="flex flex-wrap items-end gap-3">
        <label className="block">
          <span className="text-sm text-stone-700">Troco inicial (R$)</span>
          <input inputMode="decimal" value={troco} onChange={(e) => setTroco(e.target.value)} placeholder="0" className={`${campo} mt-1 w-40`} />
        </label>
        <button type="button" disabled={enviando} onClick={() => rodar(() => abrirCaixa(troco))} className={botao}>
          {enviando ? "Abrindo..." : "Abrir caixa"}
        </button>
      </div>
      <p className="text-xs text-stone-500">Receber nas comandas funciona mesmo com o caixa fechado; o caixa serve para conferir o dia.</p>
    </section>
  );
}

export function Movimento() {
  const [tipo, setTipo] = useState<"retirada" | "reforco">("retirada");
  const [valor, setValor] = useState("");
  const [motivo, setMotivo] = useState("");
  const { erro, enviando, rodar } = useAcao();
  return (
    <div className="space-y-3 rounded-xl bg-stone-50 p-4 ring-1 ring-stone-200">
      <div className="flex gap-2">
        {(["retirada", "reforco"] as const).map((t) => (
          <button
            key={t}
            type="button"
            aria-pressed={tipo === t}
            onClick={() => setTipo(t)}
            className={`rounded-lg px-3 py-2 text-sm font-medium ring-1 ${tipo === t ? "bg-rose-50 text-rose-800 ring-rose-300" : "text-stone-700 ring-stone-300 hover:bg-white"}`}
          >
            {t === "retirada" ? "Retirada (tirar dinheiro)" : "Reforço (colocar dinheiro)"}
          </button>
        ))}
      </div>
      {erro && <Mensagem tipo="erro">{erro}</Mensagem>}
      <div className="grid gap-3 sm:grid-cols-[10rem_1fr]">
        <label className="block">
          <span className="text-sm text-stone-700">Valor (R$)</span>
          <input inputMode="decimal" value={valor} onChange={(e) => setValor(e.target.value)} className={`${campo} mt-1`} />
        </label>
        <label className="block">
          <span className="text-sm text-stone-700">Motivo</span>
          <input
            value={motivo}
            maxLength={200}
            onChange={(e) => setMotivo(e.target.value)}
            placeholder={tipo === "retirada" ? "Ex.: depósito no banco" : "Ex.: troco extra"}
            className={`${campo} mt-1`}
          />
        </label>
      </div>
      <button
        type="button"
        disabled={enviando || !valor.trim() || motivo.trim().length < 3}
        onClick={() =>
          rodar(
            () => registrarMovimento(tipo, valor, motivo),
            () => {
              setValor("");
              setMotivo("");
            },
          )
        }
        className={botao}
      >
        {enviando ? "Registrando..." : tipo === "retirada" ? "Registrar retirada" : "Registrar reforço"}
      </button>
    </div>
  );
}

export function CancelarMovimento({ movimentoId }: { movimentoId: string }) {
  const [aberto, setAberto] = useState(false);
  const [motivo, setMotivo] = useState("");
  const { erro, enviando, rodar } = useAcao();
  if (!aberto)
    return (
      <button type="button" onClick={() => setAberto(true)} className="text-xs font-semibold text-red-700 hover:underline">
        Cancelar
      </button>
    );
  return (
    <div className="space-y-2 rounded-lg bg-red-50 p-3 ring-1 ring-red-200">
      {erro && <Mensagem tipo="erro">{erro}</Mensagem>}
      <input value={motivo} maxLength={200} placeholder="Motivo (ex.: lancei o valor errado)" onChange={(e) => setMotivo(e.target.value)} className={campo} />
      <div className="flex gap-2">
        <button type="button" onClick={() => setAberto(false)} className={botaoSecundario}>Voltar</button>
        <button
          type="button"
          disabled={enviando || motivo.trim().length < 3}
          onClick={() => rodar(() => cancelarMovimento(movimentoId, motivo))}
          className="rounded-lg bg-red-700 px-4 py-2.5 text-sm font-semibold text-white hover:bg-red-800 disabled:opacity-50"
        >
          {enviando ? "Cancelando..." : "Cancelar movimento"}
        </button>
      </div>
    </div>
  );
}

export function FecharCaixa({ caixaId, esperado, temPix, temCartao }: { caixaId: string; esperado: number; temPix: boolean; temCartao: boolean }) {
  const [contado, setContado] = useState("");
  const [pix, setPix] = useState(false);
  const [cartao, setCartao] = useState(false);
  const [motivo, setMotivo] = useState("");
  const { erro, enviando, rodar } = useAcao();
  const valor = contado.trim() ? reaisParaCentavos(contado) : null;
  const diferenca = valor === null ? null : valor - esperado;

  return (
    <section className="space-y-3 rounded-2xl bg-white p-5 shadow-sm ring-1 ring-stone-200">
      <h2 className="font-semibold text-stone-900">Fechar o caixa</h2>
      <p className="text-sm text-stone-500">Conte o dinheiro da gaveta e digite o total. O sistema compara com o que deveria ter.</p>
      {erro && <Mensagem tipo="erro">{erro}</Mensagem>}
      <label className="block">
        <span className="text-sm text-stone-700">Dinheiro contado (R$)</span>
        <input inputMode="decimal" value={contado} onChange={(e) => setContado(e.target.value)} className={`${campo} mt-1 w-40`} />
      </label>
      {contado.trim() && valor === null && <p className="text-sm text-red-700">Valor inválido. Exemplos: 120 ou 120,50.</p>}
      {diferenca !== null && (
        <p className={`text-sm font-medium ${diferenca === 0 ? "text-emerald-700" : "text-amber-800"}`}>
          {diferenca === 0 ? "Bateu certinho." : diferenca > 0 ? `Sobrou ${formatarReais(diferenca)}.` : `Faltou ${formatarReais(-diferenca)}.`}
        </p>
      )}
      {diferenca !== null && diferenca !== 0 && (
        <label className="block">
          <span className="text-sm text-stone-700">Motivo da diferença (obrigatório)</span>
          <input value={motivo} maxLength={200} onChange={(e) => setMotivo(e.target.value)} placeholder="Ex.: troco dado a mais" className={`${campo} mt-1`} />
        </label>
      )}
      {temPix && (
        <label className="flex items-start gap-3">
          <input type="checkbox" checked={pix} onChange={(e) => setPix(e.target.checked)} className="mt-1 h-5 w-5 shrink-0 accent-rose-700" />
          <span className="text-sm text-stone-800">Conferi os Pix no extrato do banco</span>
        </label>
      )}
      {temCartao && (
        <label className="flex items-start gap-3">
          <input type="checkbox" checked={cartao} onChange={(e) => setCartao(e.target.checked)} className="mt-1 h-5 w-5 shrink-0 accent-rose-700" />
          <span className="text-sm text-stone-800">Conferi os cartões no relatório da maquininha</span>
        </label>
      )}
      <button
        type="button"
        disabled={enviando || valor === null || (diferenca !== 0 && motivo.trim().length < 3)}
        onClick={() => rodar(() => fecharCaixa(caixaId, contado, pix, cartao, diferenca === 0 ? "" : motivo))}
        className={botao}
      >
        {enviando ? "Fechando..." : "Fechar caixa"}
      </button>
    </section>
  );
}

export function ReabrirCaixa({ caixaId }: { caixaId: string }) {
  const [aberto, setAberto] = useState(false);
  const [motivo, setMotivo] = useState("");
  const { erro, enviando, rodar } = useAcao();
  if (!aberto)
    return (
      <button type="button" onClick={() => setAberto(true)} className="text-sm font-semibold text-rose-700 hover:underline">
        Reabrir caixa
      </button>
    );
  return (
    <div className="space-y-2 rounded-xl bg-amber-50 p-4 ring-1 ring-amber-200">
      <p className="text-sm text-amber-900">Reabrir o caixa? O fechamento atual fica no histórico de atividades.</p>
      {erro && <Mensagem tipo="erro">{erro}</Mensagem>}
      <input value={motivo} maxLength={200} placeholder="Motivo (ex.: contei errado)" onChange={(e) => setMotivo(e.target.value)} className={campo} />
      <div className="flex gap-2">
        <button type="button" onClick={() => setAberto(false)} className={botaoSecundario}>Voltar</button>
        <button
          type="button"
          disabled={enviando || motivo.trim().length < 3}
          onClick={() => rodar(() => reabrirCaixa(caixaId, motivo))}
          className="rounded-lg bg-amber-700 px-4 py-2.5 text-sm font-semibold text-white hover:bg-amber-800 disabled:opacity-50"
        >
          {enviando ? "Reabrindo..." : "Reabrir caixa"}
        </button>
      </div>
    </div>
  );
}
