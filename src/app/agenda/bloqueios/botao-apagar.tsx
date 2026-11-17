"use client";

import { Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { apagarBloqueio } from "./acoes";

export default function BotaoApagar({ id }: { id: string }) {
  const router = useRouter();
  const [confirmando, setConfirmando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [enviando, iniciar] = useTransition();

  if (!confirmando)
    return (
      <button type="button" onClick={() => setConfirmando(true)} className="flex shrink-0 items-center gap-1 text-xs font-semibold text-red-700 hover:underline">
        <Trash2 aria-hidden className="h-3.5 w-3.5" /> Apagar
      </button>
    );

  return (
    <span className="flex shrink-0 flex-col items-end gap-1">
      <span className="text-xs text-stone-700">Apagar este bloqueio?</span>
      <span className="flex gap-2">
        <button type="button" onClick={() => setConfirmando(false)} className="rounded-md px-2 py-1 text-xs font-medium ring-1 ring-stone-300 hover:bg-stone-50">
          Não
        </button>
        <button
          type="button"
          disabled={enviando}
          onClick={() =>
            iniciar(async () => {
              const r = await apagarBloqueio(id);
              if (!r.ok) return setErro(r.erro);
              router.refresh();
            })
          }
          className="rounded-md bg-red-700 px-2 py-1 text-xs font-semibold text-white hover:bg-red-800 disabled:opacity-50"
        >
          Sim, apagar
        </button>
      </span>
      {erro && <span className="text-xs text-red-700">{erro}</span>}
    </span>
  );
}
