"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Mensagem } from "@/components/ui";
import { avisosDoBloqueio, criarBloqueio, type NovoBloqueio } from "./acoes";

const campo =
  "block w-full rounded-lg border border-stone-300 bg-white px-3 py-2.5 text-base text-stone-900 outline-none focus:border-rose-600 focus:ring-2 focus:ring-rose-200 disabled:bg-stone-100";

const SALAO = "salao";

export default function Formulario({
  profissionais,
  podeFeriado,
  podeEscolher,
  dataInicial,
  profInicial,
}: {
  profissionais: { id: string; nome: string }[];
  podeFeriado: boolean;
  podeEscolher: boolean;
  dataInicial: string;
  profInicial: string;
}) {
  const router = useRouter();
  const [quem, setQuem] = useState(profInicial || (podeFeriado ? SALAO : ""));
  const [diaInteiro, setDiaInteiro] = useState(true);
  const [de, setDe] = useState(dataInicial);
  const [ate, setAte] = useState(dataInicial);
  const [horaDe, setHoraDe] = useState("12:00");
  const [horaAte, setHoraAte] = useState("13:00");
  const [motivo, setMotivo] = useState("");
  const [avisos, setAvisos] = useState<string[] | null>(null);
  const [ciente, setCiente] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [salvo, setSalvo] = useState(false);
  const [enviando, iniciar] = useTransition();

  /** Qualquer mudança no formulário obriga a conferir os avisos de novo. */
  const mudou = (f: () => void) => {
    f();
    setAvisos(null);
    setCiente(false);
    setErro(null);
    setSalvo(false);
  };

  const dados = (): NovoBloqueio => ({ profissionalId: quem === SALAO ? null : quem, diaInteiro, de, ate, horaDe, horaAte, motivo });

  const salvar = () =>
    iniciar(async () => {
      setErro(null);
      if (!quem) return setErro("Escolha de quem é o bloqueio.");
      if (avisos === null) {
        const r = await avisosDoBloqueio(dados());
        if (!r.ok) return setErro(r.erro);
        setAvisos(r.dados);
        if (r.dados.length > 0) return; // mostra os avisos e espera o "Entendi"
      }
      const r = await criarBloqueio(dados());
      if (!r.ok) return setErro(r.erro);
      setMotivo("");
      setAvisos(null);
      setCiente(false);
      setSalvo(true);
      router.refresh();
    });

  return (
    <section className="space-y-4 rounded-2xl bg-white p-5 shadow-sm ring-1 ring-stone-200">
      <h2 className="font-semibold text-stone-900">Novo bloqueio</h2>
      {erro && <Mensagem tipo="erro">{erro}</Mensagem>}
      {salvo && <p className="rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-900 ring-1 ring-emerald-200">Bloqueio salvo. Ele já aparece na agenda.</p>}

      <label className="block">
        <span className="text-sm text-stone-700">De quem</span>
        <select value={quem} disabled={!podeEscolher} onChange={(e) => mudou(() => setQuem(e.target.value))} className={`${campo} mt-1`}>
          {!quem && <option value="">Escolha...</option>}
          {profissionais.map((p) => (
            <option key={p.id} value={p.id}>{p.nome}</option>
          ))}
          {podeFeriado && <option value={SALAO}>Salão inteiro (feriado)</option>}
        </select>
      </label>

      <fieldset className="flex flex-wrap gap-4 text-sm text-stone-800">
        <legend className="sr-only">Duração</legend>
        <label className="flex items-center gap-2">
          <input type="radio" name="tipo" checked={diaInteiro} onChange={() => mudou(() => setDiaInteiro(true))} className="h-4 w-4 accent-rose-700" />
          Dia inteiro
        </label>
        <label className="flex items-center gap-2">
          <input type="radio" name="tipo" checked={!diaInteiro} onChange={() => mudou(() => setDiaInteiro(false))} className="h-4 w-4 accent-rose-700" />
          Algumas horas
        </label>
      </fieldset>

      <div className="grid gap-3 sm:grid-cols-2">
        <label className="block">
          <span className="text-sm text-stone-700">{diaInteiro ? "Do dia" : "Dia"}</span>
          <input
            type="date"
            value={de}
            onChange={(e) =>
              mudou(() => {
                setDe(e.target.value);
                if (ate < e.target.value) setAte(e.target.value);
              })
            }
            className={`${campo} mt-1`}
          />
        </label>
        {diaInteiro ? (
          <label className="block">
            <span className="text-sm text-stone-700">Até o dia</span>
            <input type="date" value={ate} min={de} onChange={(e) => mudou(() => setAte(e.target.value))} className={`${campo} mt-1`} />
          </label>
        ) : (
          <div className="grid grid-cols-2 gap-3">
            <label className="block">
              <span className="text-sm text-stone-700">Das</span>
              <input type="time" step={300} value={horaDe} onChange={(e) => mudou(() => setHoraDe(e.target.value))} className={`${campo} mt-1`} />
            </label>
            <label className="block">
              <span className="text-sm text-stone-700">Até</span>
              <input type="time" step={300} value={horaAte} onChange={(e) => mudou(() => setHoraAte(e.target.value))} className={`${campo} mt-1`} />
            </label>
          </div>
        )}
      </div>

      <label className="block">
        <span className="text-sm text-stone-700">Motivo (opcional)</span>
        <input
          type="text"
          maxLength={120}
          value={motivo}
          placeholder="Ex.: folga, médico, curso, Natal"
          onChange={(e) => {
            setMotivo(e.target.value);
            setSalvo(false);
          }}
          className={`${campo} mt-1`}
        />
      </label>

      {avisos && avisos.length > 0 && (
        <div className="space-y-2 rounded-lg bg-amber-50 p-3 text-sm text-amber-900 ring-1 ring-amber-200">
          <ul className="list-disc space-y-1 pl-5">{avisos.map((a) => <li key={a}>{a}</li>)}</ul>
          <p>O bloqueio não cancela esses atendimentos: depois, remarque ou cancele cada um pela agenda.</p>
          <label className="flex items-center gap-2 font-medium">
            <input type="checkbox" checked={ciente} onChange={(e) => setCiente(e.target.checked)} className="h-5 w-5 accent-rose-700" />
            Entendi, bloquear mesmo assim
          </label>
        </div>
      )}

      <button
        type="button"
        onClick={salvar}
        disabled={enviando || (avisos !== null && avisos.length > 0 && !ciente)}
        className="w-full rounded-lg bg-rose-700 px-4 py-3 text-base font-semibold text-white hover:bg-rose-800 disabled:opacity-50 sm:w-auto"
      >
        {enviando ? "Salvando..." : "Salvar bloqueio"}
      </button>
    </section>
  );
}
