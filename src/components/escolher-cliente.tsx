"use client";

import { Check, Search, UserPlus } from "lucide-react";
import { useEffect, useState, useTransition } from "react";
import { buscarClientesAgenda, cadastrarClienteRapido } from "@/app/agenda/acoes";
import { Mensagem } from "@/components/ui";

const campo =
  "block w-full rounded-lg border border-stone-300 bg-white px-3 py-2.5 text-base text-stone-900 outline-none focus:border-rose-600 focus:ring-2 focus:ring-rose-200";
const botaoPrincipal = "rounded-lg bg-rose-700 px-5 py-3 text-base font-semibold text-white hover:bg-rose-800 disabled:opacity-50";
const botaoSecundario = "rounded-lg px-4 py-3 text-base font-medium text-stone-700 ring-1 ring-stone-300 hover:bg-stone-50";

/** Busca de cliente pelo nome, com cadastro rápido (usado na marcação e na comanda). */
export default function EscolherCliente({
  podeCadastrar,
  escolhido,
  aoEscolher,
}: {
  podeCadastrar: boolean;
  escolhido: { id: string; nome: string } | null;
  aoEscolher: (c: { id: string; nome: string }) => void;
}) {
  const [busca, setBusca] = useState("");
  const [resultado, setResultado] = useState<{ id: string; nome: string }[]>([]);
  const [novo, setNovo] = useState(false);
  const [nome, setNome] = useState("");
  const [telefone, setTelefone] = useState("");
  const [erro, setErro] = useState("");
  const [salvando, iniciar] = useTransition();

  useEffect(() => {
    const t = setTimeout(() => buscarClientesAgenda(busca).then(setResultado), 250);
    return () => clearTimeout(t);
  }, [busca]);

  if (novo) {
    return (
      <div className="space-y-3">
        <p className="font-semibold text-stone-900">Cliente nova</p>
        {erro && <Mensagem tipo="erro">{erro}</Mensagem>}
        <input autoFocus value={nome} onChange={(e) => setNome(e.target.value)} placeholder="Nome" className={campo} />
        <input value={telefone} onChange={(e) => setTelefone(e.target.value)} placeholder="Telefone com DDD (opcional)" inputMode="tel" className={campo} />
        <div className="flex gap-2">
          <button type="button" onClick={() => setNovo(false)} className={botaoSecundario}>Voltar à busca</button>
          <button
            type="button"
            disabled={salvando}
            className={botaoPrincipal}
            onClick={() =>
              iniciar(async () => {
                const r = await cadastrarClienteRapido(nome, telefone);
                if (!r.ok) return setErro(r.erro);
                aoEscolher(r.dados);
              })
            }
          >
            {salvando ? "Salvando..." : "Cadastrar e continuar"}
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <label className="relative block">
        <span className="sr-only">Buscar cliente</span>
        <Search aria-hidden className="absolute left-3 top-3.5 h-4 w-4 text-stone-400" />
        <input autoFocus value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="Buscar cliente pelo nome" className={`${campo} pl-9`} />
      </label>
      <ul className="max-h-80 divide-y divide-stone-100 overflow-y-auto rounded-xl ring-1 ring-stone-200">
        {resultado.length === 0 && <li className="px-4 py-3 text-sm text-stone-500">Nenhuma cliente encontrada.</li>}
        {resultado.map((c) => (
          <li key={c.id}>
            <button type="button" onClick={() => aoEscolher(c)} className={`flex w-full items-center justify-between px-4 py-3 text-left text-base hover:bg-stone-50 ${escolhido?.id === c.id ? "bg-rose-50" : ""}`}>
              {c.nome}
              {escolhido?.id === c.id && <Check aria-hidden className="h-4 w-4 text-rose-700" />}
            </button>
          </li>
        ))}
      </ul>
      {podeCadastrar && (
        <button type="button" onClick={() => { setNome(busca); setNovo(true); }} className="flex items-center gap-2 text-sm font-semibold text-rose-700 hover:underline">
          <UserPlus aria-hidden className="h-4 w-4" /> Cadastrar cliente nova
        </button>
      )}
    </div>
  );
}
