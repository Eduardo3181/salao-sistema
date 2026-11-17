"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import EscolherCliente from "@/components/escolher-cliente";
import { Mensagem } from "@/components/ui";
import { abrirComanda } from "../acoes";

export default function Nova({ podeCadastrar }: { podeCadastrar: boolean }) {
  const router = useRouter();
  const [erro, setErro] = useState<string | null>(null);
  const [abrindo, iniciar] = useTransition();

  return (
    <div className="space-y-3">
      {erro && <Mensagem tipo="erro">{erro}</Mensagem>}
      {abrindo ? (
        <p className="text-sm text-stone-500">Abrindo a comanda...</p>
      ) : (
        <EscolherCliente
          podeCadastrar={podeCadastrar}
          escolhido={null}
          aoEscolher={(c) =>
            iniciar(async () => {
              const r = await abrirComanda(c.id);
              if (!r.ok) return setErro(r.erro);
              router.push(`/comandas/${r.dados}`);
            })
          }
        />
      )}
    </div>
  );
}
