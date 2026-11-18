"use client";

import { Banknote, CheckCircle2, CreditCard, QrCode, RotateCcw, Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Mensagem } from "@/components/ui";
import { NOME_FORMA, type FormaPagamento } from "@/lib/comandas";
import { centavosParaTexto, formatarReais, reaisParaCentavos } from "@/lib/dinheiro";
import { calcularComissaoPendente, fecharComanda, reabrirComanda, receberPagamento, removerPagamento } from "../acoes";

const campo =
  "block w-full rounded-lg border border-stone-300 bg-white px-3 py-2.5 text-base text-stone-900 outline-none focus:border-rose-600 focus:ring-2 focus:ring-rose-200";
const botaoPrincipal = "rounded-lg bg-rose-700 px-4 py-3 text-base font-semibold text-white hover:bg-rose-800 disabled:opacity-50";
const botaoSecundario = "rounded-lg px-4 py-2.5 text-sm font-medium text-stone-700 ring-1 ring-stone-300 hover:bg-stone-50";

const FORMAS: { valor: FormaPagamento; Icone: typeof Banknote }[] = [
  { valor: "dinheiro", Icone: Banknote },
  { valor: "pix", Icone: QrCode },
  { valor: "debito", Icone: CreditCard },
  { valor: "credito_vista", Icone: CreditCard },
  { valor: "credito_parcelado", Icone: CreditCard },
];

/** Receber um pagamento (pode ser parte do total; repete até completar). */
export function Receber({ comandaId, falta }: { comandaId: string; falta: number }) {
  const router = useRouter();
  const [forma, setForma] = useState<FormaPagamento | null>(null);
  const [valor, setValor] = useState(centavosParaTexto(falta));
  const [parcelas, setParcelas] = useState(2);
  const [entregue, setEntregue] = useState("");
  const [erro, setErro] = useState<string | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);
  const [enviando, iniciar] = useTransition();

  const valorC = reaisParaCentavos(valor);
  const entregueC = reaisParaCentavos(entregue);
  const troco = forma === "dinheiro" && valorC !== null && entregueC !== null && entregueC >= valorC ? entregueC - valorC : null;

  return (
    <section className="space-y-4 rounded-2xl bg-white p-5 shadow-sm ring-1 ring-stone-200">
      <div className="flex items-baseline justify-between gap-3">
        <h2 className="font-semibold text-stone-900">Receber</h2>
        <span className="text-sm text-stone-600">Falta {formatarReais(falta)}</span>
      </div>
      {erro && <Mensagem tipo="erro">{erro}</Mensagem>}
      {aviso && <p className="rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-900 ring-1 ring-emerald-200">{aviso}</p>}

      <fieldset className="grid grid-cols-2 gap-2 sm:grid-cols-3">
        <legend className="sr-only">Forma de pagamento</legend>
        {FORMAS.map(({ valor: f, Icone }) => (
          <button
            key={f}
            type="button"
            aria-pressed={forma === f}
            onClick={() => {
              setForma(f);
              setErro(null);
              setAviso(null);
            }}
            className={`flex items-center gap-2 rounded-lg px-3 py-3 text-sm font-medium ring-1 ${
              forma === f ? "bg-rose-50 text-rose-900 ring-2 ring-rose-600" : "bg-white text-stone-700 ring-stone-300 hover:bg-stone-50"
            }`}
          >
            <Icone aria-hidden className="h-4 w-4" /> {NOME_FORMA[f]}
          </button>
        ))}
      </fieldset>

      {forma && (
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <label className="block">
              <span className="text-sm text-stone-700">Valor a pagar (R$)</span>
              <input inputMode="decimal" value={valor} onChange={(e) => setValor(e.target.value)} className={`${campo} mt-1`} />
            </label>
            {forma === "credito_parcelado" && (
              <label className="block">
                <span className="text-sm text-stone-700">Parcelas</span>
                <select value={parcelas} onChange={(e) => setParcelas(Number(e.target.value))} className={`${campo} mt-1`}>
                  {Array.from({ length: 11 }, (_, i) => i + 2).map((n) => (
                    <option key={n} value={n}>{n}x</option>
                  ))}
                </select>
              </label>
            )}
            {forma === "dinheiro" && (
              <label className="block">
                <span className="text-sm text-stone-700">Cliente entregou (R$)</span>
                <input inputMode="decimal" value={entregue} placeholder="opcional" onChange={(e) => setEntregue(e.target.value)} className={`${campo} mt-1`} />
              </label>
            )}
          </div>
          {valorC !== null && valorC < falta && <p className="text-sm text-stone-600">Pagamento de parte do valor: depois receba o restante em outra forma.</p>}
          {troco !== null && troco > 0 && <p className="text-base font-semibold text-emerald-800">Troco: {formatarReais(troco)}</p>}

          <button
            type="button"
            disabled={enviando}
            onClick={() =>
              iniciar(async () => {
                setErro(null);
                const r = await receberPagamento(comandaId, forma, valor, parcelas, entregue);
                if (!r.ok) return setErro(r.erro);
                setAviso(
                  r.dados.fechou
                    ? `Pagamento registrado. Comanda fechada.${r.dados.troco > 0 ? ` Troco: ${formatarReais(r.dados.troco)}.` : ""}`
                    : `Pagamento registrado.${r.dados.troco > 0 ? ` Troco: ${formatarReais(r.dados.troco)}.` : ""} Falta receber o restante.`,
                );
                setForma(null);
                setEntregue("");
                router.refresh();
              })
            }
            className={`w-full ${botaoPrincipal}`}
          >
            {enviando ? "Registrando..." : `Receber ${valorC !== null ? formatarReais(valorC) : ""} no ${NOME_FORMA[forma]}`}
          </button>
        </div>
      )}
    </section>
  );
}

/** Comanda que já não deve nada (ex.: tudo com desconto): fechar sem receber. */
export function FecharSemValor({ comandaId }: { comandaId: string }) {
  const router = useRouter();
  const [erro, setErro] = useState<string | null>(null);
  const [enviando, iniciar] = useTransition();
  return (
    <div className="space-y-2">
      {erro && <Mensagem tipo="erro">{erro}</Mensagem>}
      <button
        type="button"
        disabled={enviando}
        onClick={() =>
          iniciar(async () => {
            const r = await fecharComanda(comandaId);
            if (!r.ok) return setErro(r.erro);
            router.refresh();
          })
        }
        className={`flex w-full items-center justify-center gap-2 ${botaoPrincipal}`}
      >
        <CheckCircle2 aria-hidden className="h-5 w-5" /> Fechar comanda
      </button>
    </div>
  );
}

/** Remover um pagamento lançado errado (recepção/dono, com motivo). */
export function RemoverPagamento({ comandaId, pagamentoId }: { comandaId: string; pagamentoId: string }) {
  const router = useRouter();
  const [aberto, setAberto] = useState(false);
  const [motivo, setMotivo] = useState("");
  const [erro, setErro] = useState<string | null>(null);
  const [enviando, iniciar] = useTransition();

  if (!aberto)
    return (
      <button type="button" onClick={() => setAberto(true)} className="flex items-center gap-1 text-xs font-semibold text-red-700 hover:underline">
        <Trash2 aria-hidden className="h-3.5 w-3.5" /> Remover
      </button>
    );
  return (
    <div className="mt-2 w-full space-y-2 rounded-lg bg-red-50 p-3 ring-1 ring-red-200">
      {erro && <Mensagem tipo="erro">{erro}</Mensagem>}
      <label className="block">
        <span className="text-xs text-red-900">Por que remover? (fica registrado)</span>
        <input value={motivo} maxLength={200} placeholder="Ex.: passou no cartão errado" onChange={(e) => setMotivo(e.target.value)} className={`${campo} mt-1`} />
      </label>
      <div className="flex gap-2">
        <button type="button" onClick={() => setAberto(false)} className={botaoSecundario}>Voltar</button>
        <button
          type="button"
          disabled={enviando || motivo.trim().length < 3}
          onClick={() =>
            iniciar(async () => {
              const r = await removerPagamento(comandaId, pagamentoId, motivo);
              if (!r.ok) return setErro(r.erro);
              router.refresh();
            })
          }
          className="rounded-lg bg-red-700 px-4 py-2.5 text-sm font-semibold text-white hover:bg-red-800 disabled:opacity-50"
        >
          Remover pagamento
        </button>
      </div>
    </div>
  );
}

/** Reabrir comanda fechada (recepção/dono, com motivo). */
export function ReabrirComanda({ comandaId }: { comandaId: string }) {
  const router = useRouter();
  const [aberto, setAberto] = useState(false);
  const [motivo, setMotivo] = useState("");
  const [erro, setErro] = useState<string | null>(null);
  const [enviando, iniciar] = useTransition();

  if (!aberto)
    return (
      <button type="button" onClick={() => setAberto(true)} className="flex items-center gap-1.5 text-sm font-semibold text-rose-700 hover:underline">
        <RotateCcw aria-hidden className="h-4 w-4" /> Reabrir comanda
      </button>
    );
  return (
    <div className="space-y-3 rounded-xl bg-amber-50 p-4 ring-1 ring-amber-200">
      <p className="font-semibold text-amber-900">Reabrir esta comanda?</p>
      <p className="text-sm text-amber-900">Os pagamentos já recebidos continuam. As comissões desta comanda são desfeitas e calculadas de novo quando ela fechar. Depois de ajustar, receba a diferença (se houver).</p>
      {erro && <Mensagem tipo="erro">{erro}</Mensagem>}
      <label className="block">
        <span className="text-sm text-amber-900">Motivo (fica registrado)</span>
        <input value={motivo} maxLength={200} placeholder="Ex.: faltou lançar um produto" onChange={(e) => setMotivo(e.target.value)} className={`${campo} mt-1`} />
      </label>
      <div className="flex gap-2">
        <button type="button" onClick={() => setAberto(false)} className={botaoSecundario}>Voltar</button>
        <button
          type="button"
          disabled={enviando || motivo.trim().length < 3}
          onClick={() =>
            iniciar(async () => {
              const r = await reabrirComanda(comandaId, motivo);
              if (!r.ok) return setErro(r.erro);
              setAberto(false);
              router.refresh();
            })
          }
          className="rounded-lg bg-amber-700 px-4 py-2.5 text-sm font-semibold text-white hover:bg-amber-800 disabled:opacity-50"
        >
          {enviando ? "Reabrindo..." : "Reabrir comanda"}
        </button>
      </div>
    </div>
  );
}

/** Comissão que não foi calculada no fechamento (ex.: regra de assistente faltando). */
export function CalcularComissao({ comandaId }: { comandaId: string }) {
  const router = useRouter();
  const [erro, setErro] = useState<string | null>(null);
  const [enviando, iniciar] = useTransition();
  return (
    <div className="space-y-3 rounded-xl bg-amber-50 p-4 ring-1 ring-amber-200">
      <p className="text-sm text-amber-900">A comissão desta comanda ainda não foi calculada.</p>
      {erro && <Mensagem tipo="erro">{erro}</Mensagem>}
      <button
        type="button"
        disabled={enviando}
        onClick={() =>
          iniciar(async () => {
            setErro(null);
            const r = await calcularComissaoPendente(comandaId);
            if (!r.ok) return setErro(r.erro);
            router.refresh();
          })
        }
        className="rounded-lg bg-amber-700 px-4 py-2.5 text-sm font-semibold text-white hover:bg-amber-800 disabled:opacity-50"
      >
        {enviando ? "Calculando..." : "Calcular comissão agora"}
      </button>
    </div>
  );
}
