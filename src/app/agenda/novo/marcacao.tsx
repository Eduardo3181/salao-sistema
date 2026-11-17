"use client";

import { Check, Search } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState, useTransition } from "react";
import EscolherCliente from "@/components/escolher-cliente";
import { Mensagem } from "@/components/ui";
import { horariosEmSequencia, lerHora, minutosParaHora } from "@/lib/agenda";
import { formatarDuracao, formatarReais } from "@/lib/dinheiro";
import type { Categoria, Servico } from "@/lib/servicos";
import {
  avisosDaMarcacao,
  cadastrarServicoRapido,
  marcarHorario,
  type ItemMarcacao,
} from "../acoes";

type Props = {
  dataInicial: string;
  horaInicial: number;
  profissionalInicial: string;
  profissionais: { id: string; nome: string }[];
  categorias: Categoria[];
  servicos: Servico[];
  podeCadastrarCliente: boolean;
  podeCadastrarServico: boolean;
  podeEscolherProfissional: boolean;
};

const campo =
  "block w-full rounded-lg border border-stone-300 bg-white px-3 py-2.5 text-base text-stone-900 outline-none focus:border-rose-600 focus:ring-2 focus:ring-rose-200";
const botaoPrincipal = "rounded-lg bg-rose-700 px-5 py-3 text-base font-semibold text-white hover:bg-rose-800 disabled:opacity-50";
const botaoSecundario = "rounded-lg px-4 py-3 text-base font-medium text-stone-700 ring-1 ring-stone-300 hover:bg-stone-50";
const PASSOS = ["Cliente", "Serviços", "Horário", "Confirmar"];

export default function Marcacao(p: Props) {
  const router = useRouter();
  const [passo, setPasso] = useState(0);
  const [cliente, setCliente] = useState<{ id: string; nome: string } | null>(null);
  const [servicos, setServicos] = useState(p.servicos);
  const [categorias, setCategorias] = useState(p.categorias);
  const [escolhidos, setEscolhidos] = useState<string[]>([]);
  const [data, setData] = useState(p.dataInicial);
  const [itens, setItens] = useState<ItemMarcacao[]>([]);
  const [emSequencia, setEmSequencia] = useState(true);
  const [avisos, setAvisos] = useState<string[] | null>(null);
  const [ciente, setCiente] = useState(false);
  const [erro, setErro] = useState("");
  const [enviando, iniciar] = useTransition();

  // Monta os horários quando os serviços escolhidos mudam (um na sequência do outro).
  function montarItens(ids: string[]) {
    const lista = ids.map((id) => servicos.find((s) => s.id === id)!).filter(Boolean);
    const inicios = horariosEmSequencia(itens[0]?.inicio ?? p.horaInicial, lista.map((s) => s.duracao_min));
    setItens(
      lista.map((s, i) => ({
        servicoId: s.id,
        profissionalId: itens.find((x) => x.servicoId === s.id)?.profissionalId ?? itens[0]?.profissionalId ?? p.profissionalInicial,
        inicio: inicios[i],
        duracao: s.duracao_min,
      })),
    );
  }

  function alterarItem(i: number, mudanca: Partial<ItemMarcacao>) {
    setItens((atuais) => {
      const novos = atuais.map((it, k) => (k === i ? { ...it, ...mudanca } : it));
      if (!emSequencia) return novos;
      const inicios = horariosEmSequencia(novos[0].inicio, novos.map((x) => x.duracao));
      return novos.map((x, k) => ({ ...x, inicio: inicios[k] }));
    });
  }

  function irPara(n: number) {
    setErro("");
    if (n === 3) {
      setAvisos(null);
      setCiente(false);
      avisosDaMarcacao(data, itens).then(setAvisos);
    }
    setPasso(n);
  }

  function confirmar() {
    if (!cliente) return;
    iniciar(async () => {
      const r = await marcarHorario(cliente.id, data, itens);
      if (!r.ok) return setErro(r.erro);
      router.push(`/agenda?data=${data}&prof=${itens[0].profissionalId}`);
      router.refresh();
    });
  }

  const nomeServico = (id: string) => servicos.find((s) => s.id === id)?.nome ?? "";
  const nomeProf = (id: string) => p.profissionais.find((x) => x.id === id)?.nome ?? "";
  const total = itens.reduce((t, it) => t + (servicos.find((s) => s.id === it.servicoId)?.preco_centavos ?? 0), 0);

  return (
    <div className="space-y-4">
      {/* Etapas */}
      <ol className="flex gap-1 text-xs font-medium">
        {PASSOS.map((nome, i) => (
          <li key={nome} className={`flex-1 rounded-full px-2 py-1.5 text-center ${i === passo ? "bg-rose-700 text-white" : i < passo ? "bg-rose-100 text-rose-800" : "bg-white text-stone-500 ring-1 ring-stone-200"}`}>
            {i + 1}. {nome}
          </li>
        ))}
      </ol>

      <section className="space-y-4 rounded-2xl bg-white p-5 shadow-sm ring-1 ring-stone-200">
        {erro && <Mensagem tipo="erro">{erro}</Mensagem>}

        {passo === 0 && (
          <EscolherCliente
            podeCadastrar={p.podeCadastrarCliente}
            escolhido={cliente}
            aoEscolher={(c) => {
              setCliente(c);
              irPara(1);
            }}
          />
        )}

        {passo === 1 && (
          <PassoServicos
            categorias={categorias}
            servicos={servicos}
            escolhidos={escolhidos}
            podeCadastrar={p.podeCadastrarServico}
            aoMarcar={(id) => {
              const novos = escolhidos.includes(id) ? escolhidos.filter((x) => x !== id) : [...escolhidos, id];
              setEscolhidos(novos);
              montarItens(novos);
            }}
            aoCriar={(s, cat) => {
              setServicos((l) => [...l, s]);
              if (cat) setCategorias((l) => [...l, cat]);
              const novos = [...escolhidos, s.id];
              setEscolhidos(novos);
              setItens((atuais) => {
                const inicio = atuais.length ? atuais.at(-1)!.inicio + atuais.at(-1)!.duracao : p.horaInicial;
                return [...atuais, { servicoId: s.id, profissionalId: atuais[0]?.profissionalId ?? p.profissionalInicial, inicio, duracao: s.duracao_min }];
              });
            }}
          />
        )}

        {passo === 2 && (
          <div className="space-y-4">
            <label className="block">
              <span className="text-sm font-medium text-stone-700">Dia</span>
              <input type="date" value={data} onChange={(e) => e.target.value && setData(e.target.value)} className={`${campo} mt-1`} />
            </label>
            {itens.map((it, i) => (
              <div key={it.servicoId} className="space-y-3 rounded-xl bg-stone-50 p-4 ring-1 ring-stone-200">
                <p className="font-semibold text-stone-900">{nomeServico(it.servicoId)}</p>
                <div className="grid gap-3 sm:grid-cols-3">
                  <label className="block sm:col-span-1">
                    <span className="text-sm text-stone-700">Profissional</span>
                    <select
                      value={it.profissionalId}
                      disabled={!p.podeEscolherProfissional}
                      onChange={(e) => alterarItem(i, { profissionalId: e.target.value })}
                      className={`${campo} mt-1 disabled:bg-stone-100`}
                    >
                      {p.profissionais.map((x) => (
                        <option key={x.id} value={x.id}>{x.nome}</option>
                      ))}
                    </select>
                  </label>
                  <label className="block">
                    <span className="text-sm text-stone-700">Começa às</span>
                    <input
                      type="time"
                      step={300}
                      value={minutosParaHora(it.inicio)}
                      disabled={emSequencia && i > 0}
                      onChange={(e) => {
                        const m = lerHora(e.target.value);
                        if (m !== null) alterarItem(i, { inicio: m });
                      }}
                      className={`${campo} mt-1 disabled:bg-stone-100`}
                    />
                  </label>
                  <label className="block">
                    <span className="text-sm text-stone-700">Duração (min)</span>
                    <input
                      type="number"
                      min={5}
                      max={720}
                      step={5}
                      value={it.duracao}
                      onChange={(e) => {
                        const d = Number(e.target.value);
                        if (Number.isInteger(d) && d >= 5 && d <= 720) alterarItem(i, { duracao: d });
                      }}
                      className={`${campo} mt-1`}
                    />
                  </label>
                </div>
                <p className="text-sm text-stone-500">
                  {minutosParaHora(it.inicio)} às {minutosParaHora(it.inicio + it.duracao)}
                </p>
              </div>
            ))}
            {itens.length > 1 && (
              <label className="flex items-center gap-2 text-sm text-stone-700">
                <input
                  type="checkbox"
                  checked={emSequencia}
                  onChange={(e) => {
                    setEmSequencia(e.target.checked);
                    if (e.target.checked) alterarItem(0, {});
                  }}
                  className="h-5 w-5 accent-rose-700"
                />
                Um serviço logo depois do outro
              </label>
            )}
          </div>
        )}

        {passo === 3 && cliente && (
          <div className="space-y-4">
            <dl className="space-y-1 text-sm">
              <div className="flex justify-between gap-3"><dt className="text-stone-500">Cliente</dt><dd className="font-medium text-stone-900">{cliente.nome}</dd></div>
              <div className="flex justify-between gap-3"><dt className="text-stone-500">Dia</dt><dd className="font-medium text-stone-900">{data.split("-").reverse().join("/")}</dd></div>
            </dl>
            <ul className="divide-y divide-stone-100 rounded-xl ring-1 ring-stone-200">
              {itens.map((it) => (
                <li key={it.servicoId} className="flex justify-between gap-3 px-4 py-3 text-sm">
                  <span>
                    <span className="font-medium text-stone-900">{minutosParaHora(it.inicio)}–{minutosParaHora(it.inicio + it.duracao)}</span>{" "}
                    {nomeServico(it.servicoId)}
                    <span className="block text-stone-500">com {nomeProf(it.profissionalId)}</span>
                  </span>
                  <span className="shrink-0 text-stone-700">{formatarReais(servicos.find((s) => s.id === it.servicoId)?.preco_centavos ?? 0)}</span>
                </li>
              ))}
              <li className="flex justify-between px-4 py-3 text-sm font-semibold"><span>Total previsto</span><span>{formatarReais(total)}</span></li>
            </ul>

            {avisos === null ? (
              <p className="text-sm text-stone-500">Conferindo a agenda...</p>
            ) : avisos.length > 0 ? (
              <div className="space-y-2 rounded-xl bg-amber-50 p-4 text-sm text-amber-900 ring-1 ring-amber-200">
                <p className="font-semibold">Atenção</p>
                <ul className="list-disc space-y-1 pl-5">
                  {avisos.map((a) => <li key={a}>{a}</li>)}
                </ul>
                <label className="flex items-center gap-2 pt-1 font-medium">
                  <input type="checkbox" checked={ciente} onChange={(e) => setCiente(e.target.checked)} className="h-5 w-5 accent-rose-700" />
                  Entendi, marcar mesmo assim
                </label>
              </div>
            ) : (
              <p className="flex items-center gap-2 text-sm text-emerald-800"><Check aria-hidden className="h-4 w-4" /> Horário livre na agenda.</p>
            )}
          </div>
        )}
      </section>

      {/* Navegação */}
      <div className="flex justify-between gap-3">
        {passo === 0 ? (
          <Link href={`/agenda?data=${data}`} className={botaoSecundario}>Cancelar</Link>
        ) : (
          <button type="button" onClick={() => irPara(passo - 1)} className={botaoSecundario}>Voltar</button>
        )}
        {passo === 1 && (
          <button type="button" disabled={itens.length === 0} onClick={() => irPara(2)} className={botaoPrincipal}>Continuar</button>
        )}
        {passo === 2 && (
          <button type="button" onClick={() => irPara(3)} className={botaoPrincipal}>Continuar</button>
        )}
        {passo === 3 && (
          <button
            type="button"
            disabled={enviando || avisos === null || (avisos.length > 0 && !ciente)}
            onClick={confirmar}
            className={botaoPrincipal}
          >
            {enviando ? "Marcando..." : "Marcar horário"}
          </button>
        )}
      </div>
    </div>
  );
}


function PassoServicos({
  categorias,
  servicos,
  escolhidos,
  podeCadastrar,
  aoMarcar,
  aoCriar,
}: {
  categorias: Categoria[];
  servicos: Servico[];
  escolhidos: string[];
  podeCadastrar: boolean;
  aoMarcar: (id: string) => void;
  aoCriar: (s: Servico, novaCategoria: Categoria | null) => void;
}) {
  const [busca, setBusca] = useState("");
  const [novo, setNovo] = useState(false);
  const [form, setForm] = useState({ nome: "", categoriaId: categorias[0]?.id ?? "", novaCategoria: "", duracao: 30, preco: "" });
  const [erro, setErro] = useState("");
  const [salvando, iniciar] = useTransition();

  const grupos = useMemo(() => {
    const q = busca.trim().toLowerCase();
    return categorias
      .map((c) => ({ c, itens: servicos.filter((s) => s.categoria_id === c.id && (!q || s.nome.toLowerCase().includes(q))) }))
      .filter((g) => g.itens.length > 0);
  }, [busca, categorias, servicos]);

  if (novo) {
    return (
      <div className="space-y-3">
        <p className="font-semibold text-stone-900">Serviço novo</p>
        {erro && <Mensagem tipo="erro">{erro}</Mensagem>}
        <input autoFocus value={form.nome} onChange={(e) => setForm({ ...form, nome: e.target.value })} placeholder="Nome do serviço" className={campo} />
        <select value={form.categoriaId} onChange={(e) => setForm({ ...form, categoriaId: e.target.value })} className={campo}>
          {categorias.map((c) => <option key={c.id} value={c.id}>{c.nome}</option>)}
          <option value="">Nova categoria...</option>
        </select>
        {!form.categoriaId && (
          <input value={form.novaCategoria} onChange={(e) => setForm({ ...form, novaCategoria: e.target.value })} placeholder="Nome da nova categoria" className={campo} />
        )}
        <div className="grid grid-cols-2 gap-3">
          <input type="number" min={5} max={720} step={5} value={form.duracao} onChange={(e) => setForm({ ...form, duracao: Number(e.target.value) })} aria-label="Duração em minutos" className={campo} />
          <input value={form.preco} onChange={(e) => setForm({ ...form, preco: e.target.value })} placeholder="Preço (ex.: 80,00)" inputMode="decimal" className={campo} />
        </div>
        <div className="flex gap-2">
          <button type="button" onClick={() => setNovo(false)} className={botaoSecundario}>Voltar à lista</button>
          <button
            type="button"
            disabled={salvando}
            className={botaoPrincipal}
            onClick={() =>
              iniciar(async () => {
                const r = await cadastrarServicoRapido(form);
                if (!r.ok) return setErro(r.erro);
                const s: Servico = {
                  id: r.dados.id,
                  categoria_id: r.dados.categoriaId,
                  nome: r.dados.nome,
                  duracao_min: r.dados.duracao,
                  preco_centavos: r.dados.precoCentavos,
                  ativo: true,
                };
                aoCriar(s, r.dados.categoriaNome ? { id: r.dados.categoriaId, nome: r.dados.categoriaNome, ativo: true } : null);
                setNovo(false);
              })
            }
          >
            {salvando ? "Salvando..." : "Cadastrar serviço"}
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <label className="relative block">
        <span className="sr-only">Buscar serviço</span>
        <Search aria-hidden className="absolute left-3 top-3.5 h-4 w-4 text-stone-400" />
        <input value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="Buscar serviço" className={`${campo} pl-9`} />
      </label>
      <div className="max-h-96 space-y-3 overflow-y-auto">
        {grupos.length === 0 && <p className="text-sm text-stone-500">Nenhum serviço encontrado.</p>}
        {grupos.map(({ c, itens }) => (
          <div key={c.id}>
            <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-stone-500">{c.nome}</p>
            <ul className="divide-y divide-stone-100 rounded-xl ring-1 ring-stone-200">
              {itens.map((s) => {
                const marcado = escolhidos.includes(s.id);
                return (
                  <li key={s.id}>
                    <label className={`flex cursor-pointer items-center gap-3 px-4 py-3 ${marcado ? "bg-rose-50" : "hover:bg-stone-50"}`}>
                      <input type="checkbox" checked={marcado} onChange={() => aoMarcar(s.id)} className="h-5 w-5 accent-rose-700" />
                      <span className="flex-1 text-base text-stone-900">{s.nome}</span>
                      <span className="text-sm text-stone-500">{formatarDuracao(s.duracao_min)} · {formatarReais(s.preco_centavos)}</span>
                    </label>
                  </li>
                );
              })}
            </ul>
          </div>
        ))}
      </div>
      {podeCadastrar && (
        <button type="button" onClick={() => { setForm((f) => ({ ...f, nome: busca })); setNovo(true); }} className="text-sm font-semibold text-rose-700 hover:underline">
          + Cadastrar serviço novo
        </button>
      )}
    </div>
  );
}
