"use client";

import { CalendarClock, MessageCircle, X } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Mensagem } from "@/components/ui";
import { lerHora, minutosParaHora, NOME_SITUACAO } from "@/lib/agenda";
import { formatarReais } from "@/lib/dinheiro";
import { avisosDaMarcacao, mudarSituacao, remarcar, type MotivoCancelamento, type Situacao } from "../../acoes";

type ItemDetalhe = {
  id: string;
  servico: string;
  profissionalId: string;
  profissional: string;
  data: string;
  inicio: number;
  duracao: number;
  precoCentavos: number;
};

type Props = {
  agendamentoId: string;
  situacao: string;
  motivo: string | null;
  cliente: string;
  clienteHref: string | null;
  whatsapp: string | null;
  itens: ItemDetalhe[];
  podeMexer: boolean;
  podeRemarcar: boolean;
  podeTrocarProfissional: boolean;
  profissionais: { id: string; nome: string }[];
  exigirMotivo: boolean;
  voltarData: string;
};

const SITUACOES: { valor: Situacao; cor: string }[] = [
  { valor: "agendado", cor: "bg-sky-50 text-sky-900 ring-sky-300" },
  { valor: "confirmado", cor: "bg-emerald-50 text-emerald-900 ring-emerald-300" },
  { valor: "chegou", cor: "bg-amber-50 text-amber-900 ring-amber-300" },
  { valor: "concluido", cor: "bg-stone-100 text-stone-800 ring-stone-300" },
  { valor: "faltou", cor: "bg-red-50 text-red-900 ring-red-300" },
];
const MOTIVOS: { valor: MotivoCancelamento; rotulo: string }[] = [
  { valor: "cliente_desmarcou", rotulo: "Cliente desmarcou" },
  { valor: "salao_desmarcou", rotulo: "Salão desmarcou" },
  { valor: "outro", rotulo: "Outro motivo" },
];
const campo =
  "block w-full rounded-lg border border-stone-300 bg-white px-3 py-2.5 text-base text-stone-900 outline-none focus:border-rose-600 focus:ring-2 focus:ring-rose-200";

export default function Detalhe(p: Props) {
  const router = useRouter();
  const [erro, setErro] = useState("");
  const [cancelando, setCancelando] = useState(false);
  const [motivo, setMotivo] = useState<MotivoCancelamento | null>(null);
  const [remarcando, setRemarcando] = useState<string | null>(null);
  const [enviando, iniciar] = useTransition();
  const cancelado = p.situacao === "cancelado";
  const encerrado = cancelado || p.situacao === "concluido" || p.situacao === "faltou";

  function trocarSituacao(s: Situacao, m: MotivoCancelamento | null = null) {
    setErro("");
    iniciar(async () => {
      const r = await mudarSituacao(p.agendamentoId, s, m);
      if (!r.ok) return setErro(r.erro);
      if (s === "cancelado") router.push(`/agenda?data=${p.voltarData}`);
      router.refresh();
    });
  }

  return (
    <div className="space-y-4">
      <section className="space-y-3 rounded-2xl bg-white p-5 shadow-sm ring-1 ring-stone-200">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h1 className="text-xl font-semibold text-stone-900">
              {p.clienteHref ? <Link href={p.clienteHref} className="hover:underline">{p.cliente}</Link> : p.cliente}
            </h1>
            <p className="text-sm text-stone-500">
              {NOME_SITUACAO[p.situacao]}
              {cancelado && p.motivo && ` · ${MOTIVOS.find((m) => m.valor === p.motivo)?.rotulo.toLowerCase()}`}
            </p>
          </div>
          {p.whatsapp && (
            <a href={p.whatsapp} target="_blank" rel="noopener noreferrer" className="flex shrink-0 items-center gap-1.5 rounded-lg px-3 py-2 text-sm font-semibold text-emerald-800 ring-1 ring-emerald-300 hover:bg-emerald-50">
              <MessageCircle aria-hidden className="h-4 w-4" /> WhatsApp
            </a>
          )}
        </div>
        {erro && <Mensagem tipo="erro">{erro}</Mensagem>}

        <ul className="divide-y divide-stone-100 rounded-xl ring-1 ring-stone-200">
          {p.itens.map((it) => (
            <li key={it.id} className="space-y-3 px-4 py-3">
              <div className="flex items-start justify-between gap-3 text-sm">
                <span>
                  <span className="font-semibold text-stone-900">
                    {it.data.split("-").reverse().slice(0, 2).join("/")} · {minutosParaHora(it.inicio)}–{minutosParaHora(it.inicio + it.duracao)}
                  </span>
                  <span className="block text-stone-800">{it.servico}</span>
                  <span className="block text-stone-500">com {it.profissional}</span>
                </span>
                <span className="flex shrink-0 flex-col items-end gap-2">
                  <span className="text-stone-700">{formatarReais(it.precoCentavos)}</span>
                  {p.podeRemarcar && !encerrado && remarcando !== it.id && (
                    <button type="button" onClick={() => setRemarcando(it.id)} className="flex items-center gap-1 text-xs font-semibold text-rose-700 hover:underline">
                      <CalendarClock aria-hidden className="h-3.5 w-3.5" /> Remarcar
                    </button>
                  )}
                </span>
              </div>
              {remarcando === it.id && (
                <Remarcar
                  item={it}
                  profissionais={p.profissionais}
                  podeTrocarProfissional={p.podeTrocarProfissional}
                  aoFechar={() => setRemarcando(null)}
                  aoSalvar={(data) => {
                    setRemarcando(null);
                    router.push(`/agenda/horario/${p.agendamentoId}?data=${data}`);
                    router.refresh();
                  }}
                />
              )}
            </li>
          ))}
        </ul>
      </section>

      {p.podeMexer && (
        <section className="space-y-3 rounded-2xl bg-white p-5 shadow-sm ring-1 ring-stone-200">
          <h2 className="font-semibold text-stone-900">Situação</h2>
          <div className="flex flex-wrap gap-2">
            {SITUACOES.map((s) => {
              const atual = p.situacao === s.valor;
              return (
                <button
                  key={s.valor}
                  type="button"
                  disabled={enviando || atual}
                  aria-pressed={atual}
                  onClick={() => trocarSituacao(s.valor)}
                  className={`rounded-lg px-4 py-2.5 text-sm font-medium ring-1 ${atual ? `${s.cor} ring-2` : "bg-white text-stone-700 ring-stone-300 hover:bg-stone-50"}`}
                >
                  {NOME_SITUACAO[s.valor]}
                </button>
              );
            })}
          </div>
          {cancelado && <p className="text-sm text-stone-500">Para desfazer o cancelamento, escolha outra situação acima.</p>}

          {!cancelado &&
            (cancelando ? (
              <div className="space-y-3 rounded-xl bg-red-50 p-4 ring-1 ring-red-200">
                <p className="font-semibold text-red-900">Cancelar este horário?</p>
                <fieldset className="space-y-2">
                  <legend className="text-sm text-red-900">{p.exigirMotivo ? "Motivo (obrigatório)" : "Motivo (opcional)"}</legend>
                  {MOTIVOS.map((m) => (
                    <label key={m.valor} className="flex items-center gap-2 text-sm text-stone-800">
                      <input type="radio" name="motivo" checked={motivo === m.valor} onChange={() => setMotivo(m.valor)} className="h-4 w-4 accent-rose-700" />
                      {m.rotulo}
                    </label>
                  ))}
                </fieldset>
                <div className="flex gap-2">
                  <button type="button" onClick={() => setCancelando(false)} className="rounded-lg px-4 py-2.5 text-sm font-medium text-stone-700 ring-1 ring-stone-300 hover:bg-white">
                    Voltar
                  </button>
                  <button
                    type="button"
                    disabled={enviando || (p.exigirMotivo && !motivo)}
                    onClick={() => trocarSituacao("cancelado", motivo)}
                    className="rounded-lg bg-red-700 px-4 py-2.5 text-sm font-semibold text-white hover:bg-red-800 disabled:opacity-50"
                  >
                    {enviando ? "Cancelando..." : "Cancelar horário"}
                  </button>
                </div>
              </div>
            ) : (
              <button type="button" onClick={() => setCancelando(true)} className="flex items-center gap-1.5 text-sm font-semibold text-red-700 hover:underline">
                <X aria-hidden className="h-4 w-4" /> Cancelar horário
              </button>
            ))}
        </section>
      )}
      {!p.podeMexer && p.podeRemarcar && (
        <p className="text-sm text-stone-500">
          Este agendamento tem serviço com outra profissional. A situação e o cancelamento ficam com a recepção ou o dono.
        </p>
      )}
    </div>
  );
}

function Remarcar({
  item,
  profissionais,
  podeTrocarProfissional,
  aoFechar,
  aoSalvar,
}: {
  item: ItemDetalhe;
  profissionais: { id: string; nome: string }[];
  podeTrocarProfissional: boolean;
  aoFechar: () => void;
  aoSalvar: (data: string) => void;
}) {
  const [data, setData] = useState(item.data);
  const [inicio, setInicio] = useState(item.inicio);
  const [duracao, setDuracao] = useState(item.duracao);
  const [prof, setProf] = useState(item.profissionalId);
  const [avisos, setAvisos] = useState<string[] | null>(null);
  const [ciente, setCiente] = useState(false);
  const [erro, setErro] = useState("");
  const [enviando, iniciar] = useTransition();

  // Qualquer mudança no formulário pede nova conferência da agenda.
  const mudou = (f: () => void) => {
    f();
    setAvisos(null);
    setCiente(false);
  };

  return (
    <div className="space-y-3 rounded-xl bg-stone-50 p-4 ring-1 ring-stone-200">
      {erro && <Mensagem tipo="erro">{erro}</Mensagem>}
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="block">
          <span className="text-sm text-stone-700">Dia</span>
          <input type="date" value={data} onChange={(e) => e.target.value && mudou(() => setData(e.target.value))} className={`${campo} mt-1`} />
        </label>
        <label className="block">
          <span className="text-sm text-stone-700">Começa às</span>
          <input
            type="time"
            step={300}
            value={minutosParaHora(inicio)}
            onChange={(e) => {
              const m = lerHora(e.target.value);
              if (m !== null) mudou(() => setInicio(m));
            }}
            className={`${campo} mt-1`}
          />
        </label>
        <label className="block">
          <span className="text-sm text-stone-700">Duração (min)</span>
          <input
            type="number"
            min={5}
            max={720}
            step={5}
            value={duracao}
            onChange={(e) => {
              const d = Number(e.target.value);
              if (Number.isInteger(d) && d >= 5 && d <= 720) mudou(() => setDuracao(d));
            }}
            className={`${campo} mt-1`}
          />
        </label>
        <label className="block">
          <span className="text-sm text-stone-700">Profissional</span>
          <select value={prof} disabled={!podeTrocarProfissional} onChange={(e) => mudou(() => setProf(e.target.value))} className={`${campo} mt-1 disabled:bg-stone-100`}>
            {(profissionais.some((x) => x.id === prof) ? profissionais : [{ id: prof, nome: item.profissional }, ...profissionais]).map((x) => (
              <option key={x.id} value={x.id}>{x.nome}</option>
            ))}
          </select>
        </label>
      </div>

      {avisos && avisos.length > 0 && (
        <div className="space-y-2 rounded-lg bg-amber-50 p-3 text-sm text-amber-900 ring-1 ring-amber-200">
          <ul className="list-disc space-y-1 pl-5">{avisos.map((a) => <li key={a}>{a}</li>)}</ul>
          <label className="flex items-center gap-2 font-medium">
            <input type="checkbox" checked={ciente} onChange={(e) => setCiente(e.target.checked)} className="h-5 w-5 accent-rose-700" />
            Entendi, remarcar mesmo assim
          </label>
        </div>
      )}

      <div className="flex gap-2">
        <button type="button" onClick={aoFechar} className="rounded-lg px-4 py-2.5 text-sm font-medium text-stone-700 ring-1 ring-stone-300 hover:bg-white">
          Fechar
        </button>
        <button
          type="button"
          disabled={enviando || (avisos !== null && avisos.length > 0 && !ciente)}
          onClick={() =>
            iniciar(async () => {
              setErro("");
              // 1º clique: confere a agenda; se houver aviso, pede confirmação.
              if (avisos === null) {
                const a = await avisosDaMarcacao(data, [{ servicoId: "", profissionalId: prof, inicio, duracao, ignorarItemId: item.id }]);
                setAvisos(a);
                if (a.length > 0) return;
              }
              const r = await remarcar(item.id, data, inicio, duracao, prof);
              if (!r.ok) return setErro(r.erro);
              aoSalvar(data);
            })
          }
          className="rounded-lg bg-rose-700 px-4 py-2.5 text-sm font-semibold text-white hover:bg-rose-800 disabled:opacity-50"
        >
          {enviando ? "Salvando..." : "Salvar novo horário"}
        </button>
      </div>
    </div>
  );
}
