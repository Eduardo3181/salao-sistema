"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Mensagem } from "@/components/ui";
import { NOME_MEIO } from "@/lib/pagamento-comissoes";
import { cancelarVale, registrarVale, type Meio } from "../acoes";

const campo =
  "block w-full rounded-lg border border-stone-300 bg-white px-3 py-2.5 text-base text-stone-900 outline-none focus:border-rose-600 focus:ring-2 focus:ring-rose-200";

export function NovoVale({ hoje, pessoas }: { hoje: string; pessoas: { id: string; nome: string }[] }) {
  const router = useRouter();
  const [pessoa, setPessoa] = useState("");
  const [valor, setValor] = useState("");
  const [dadoEm, setDadoEm] = useState(hoje);
  const [meio, setMeio] = useState<Meio>("dinheiro");
  const [obs, setObs] = useState("");
  const [erro, setErro] = useState<string | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);
  const [enviando, iniciar] = useTransition();

  return (
    <section className="space-y-3 rounded-2xl bg-white p-5 shadow-sm ring-1 ring-stone-200">
      <h2 className="font-semibold text-stone-900">Registrar vale</h2>
      <p className="text-xs text-stone-500">O sistema só anota. O dinheiro você entrega fora do sistema.</p>
      {erro && <Mensagem tipo="erro">{erro}</Mensagem>}
      {aviso && <Mensagem tipo="aviso">{aviso}</Mensagem>}
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="block">
          <span className="text-sm text-stone-700">Para quem</span>
          <select value={pessoa} onChange={(e) => setPessoa(e.target.value)} className={`${campo} mt-1`}>
            <option value="">Escolha</option>
            {pessoas.map((p) => (
              <option key={p.id} value={p.id}>
                {p.nome}
              </option>
            ))}
          </select>
        </label>
        <label className="block">
          <span className="text-sm text-stone-700">Valor (R$)</span>
          <input inputMode="decimal" value={valor} onChange={(e) => setValor(e.target.value)} placeholder="Ex.: 100" className={`${campo} mt-1`} />
        </label>
        <label className="block">
          <span className="text-sm text-stone-700">Data</span>
          <input type="date" value={dadoEm} max={hoje} onChange={(e) => setDadoEm(e.target.value)} className={`${campo} mt-1`} />
        </label>
        <label className="block">
          <span className="text-sm text-stone-700">Como foi dado</span>
          <select value={meio} onChange={(e) => setMeio(e.target.value as Meio)} className={`${campo} mt-1`}>
            {(Object.keys(NOME_MEIO) as Meio[]).map((m) => (
              <option key={m} value={m}>
                {NOME_MEIO[m]}
              </option>
            ))}
          </select>
        </label>
      </div>
      <label className="block">
        <span className="text-sm text-stone-700">Observação (opcional; não coloque CPF nem dados pessoais)</span>
        <input value={obs} maxLength={200} onChange={(e) => setObs(e.target.value)} className={`${campo} mt-1`} />
      </label>
      <button
        type="button"
        disabled={enviando || !pessoa || !valor.trim() || !dadoEm}
        onClick={() =>
          iniciar(async () => {
            setErro(null);
            setAviso(null);
            const r = await registrarVale(pessoa, valor, dadoEm, meio, obs);
            if (!r.ok) return setErro(r.erro);
            setAviso("Vale registrado.");
            setValor("");
            setObs("");
            router.refresh();
          })
        }
        className="rounded-lg bg-rose-700 px-4 py-2.5 text-sm font-semibold text-white hover:bg-rose-800 disabled:opacity-50"
      >
        {enviando ? "Registrando..." : "Registrar vale"}
      </button>
    </section>
  );
}

export function CancelarVale({ valeId }: { valeId: string }) {
  const router = useRouter();
  const [aberto, setAberto] = useState(false);
  const [motivo, setMotivo] = useState("");
  const [erro, setErro] = useState<string | null>(null);
  const [enviando, iniciar] = useTransition();

  if (!aberto)
    return (
      <button type="button" onClick={() => setAberto(true)} className="text-xs font-semibold text-red-700 hover:underline">
        Cancelar vale
      </button>
    );
  return (
    <div className="mt-2 space-y-2 rounded-xl bg-red-50 p-3 ring-1 ring-red-200">
      <p className="text-sm text-red-900">Cancelar este vale? Nada é apagado: ele fica marcado como cancelado.</p>
      {erro && <Mensagem tipo="erro">{erro}</Mensagem>}
      <input value={motivo} maxLength={200} placeholder="Motivo (ex.: lancei o valor errado)" onChange={(e) => setMotivo(e.target.value)} className={campo} />
      <div className="flex gap-2">
        <button type="button" onClick={() => setAberto(false)} className="rounded-lg px-3 py-2 text-sm font-medium text-stone-700 ring-1 ring-stone-300 hover:bg-white">
          Voltar
        </button>
        <button
          type="button"
          disabled={enviando || motivo.trim().length < 3}
          onClick={() =>
            iniciar(async () => {
              const r = await cancelarVale(valeId, motivo);
              if (!r.ok) return setErro(r.erro);
              setAberto(false);
              router.refresh();
            })
          }
          className="rounded-lg bg-red-700 px-3 py-2 text-sm font-semibold text-white hover:bg-red-800 disabled:opacity-50"
        >
          {enviando ? "Cancelando..." : "Cancelar vale"}
        </button>
      </div>
    </div>
  );
}
