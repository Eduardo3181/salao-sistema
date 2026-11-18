"use client";

import { Printer } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Mensagem } from "@/components/ui";
import { cancelarPagamento } from "../../acoes";

/** Abre a impressão do navegador; nela dá para escolher "Salvar como PDF". */
export function BotaoImprimir() {
  return (
    <button
      type="button"
      onClick={() => window.print()}
      className="flex items-center gap-1.5 rounded-lg bg-rose-700 px-4 py-2 text-sm font-semibold text-white hover:bg-rose-800"
    >
      <Printer aria-hidden className="h-4 w-4" /> Imprimir ou salvar PDF
    </button>
  );
}

export function CancelarPagamento({ pagamentoId }: { pagamentoId: string }) {
  const router = useRouter();
  const [aberto, setAberto] = useState(false);
  const [motivo, setMotivo] = useState("");
  const [erro, setErro] = useState<string | null>(null);
  const [enviando, iniciar] = useTransition();

  if (!aberto)
    return (
      <button type="button" onClick={() => setAberto(true)} className="text-sm font-semibold text-red-700 hover:underline">
        Cancelar este pagamento
      </button>
    );
  return (
    <div className="space-y-3 rounded-xl bg-red-50 p-4 ring-1 ring-red-200">
      <p className="font-semibold text-red-900">Cancelar este pagamento?</p>
      <p className="text-sm text-red-900">
        Use quando o registro foi feito errado. Nada é apagado: o pagamento fica marcado como cancelado e as comissões voltam a ficar a pagar.
      </p>
      {erro && <Mensagem tipo="erro">{erro}</Mensagem>}
      <label className="block">
        <span className="text-sm text-red-900">Motivo (fica registrado)</span>
        <input
          value={motivo}
          maxLength={200}
          placeholder="Ex.: registrei a pessoa errada"
          onChange={(e) => setMotivo(e.target.value)}
          className="mt-1 block w-full rounded-lg border border-stone-300 bg-white px-3 py-2.5 text-base text-stone-900 outline-none focus:border-rose-600 focus:ring-2 focus:ring-rose-200"
        />
      </label>
      <div className="flex gap-2">
        <button type="button" onClick={() => setAberto(false)} className="rounded-lg px-4 py-2.5 text-sm font-medium text-stone-700 ring-1 ring-stone-300 hover:bg-white">
          Voltar
        </button>
        <button
          type="button"
          disabled={enviando || motivo.trim().length < 3}
          onClick={() =>
            iniciar(async () => {
              const r = await cancelarPagamento(pagamentoId, motivo);
              if (!r.ok) return setErro(r.erro);
              setAberto(false);
              router.refresh();
            })
          }
          className="rounded-lg bg-red-700 px-4 py-2.5 text-sm font-semibold text-white hover:bg-red-800 disabled:opacity-50"
        >
          {enviando ? "Cancelando..." : "Cancelar pagamento"}
        </button>
      </div>
    </div>
  );
}
