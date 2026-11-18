"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Mensagem } from "@/components/ui";
import { NOME_FORMA_DESPESA, type FormaDespesa } from "@/lib/despesas";
import {
  ativarCategoria,
  cancelarDespesa,
  criarCategoria,
  criarDespesa,
  criarDespesaFixa,
  desfazerPagamento,
  encerrarDespesaFixa,
  pagarDespesa,
} from "./acoes";

const campo =
  "block w-full rounded-lg border border-stone-300 bg-white px-3 py-2.5 text-base text-stone-900 outline-none focus:border-rose-600 focus:ring-2 focus:ring-rose-200";
const botao = "rounded-lg bg-rose-700 px-4 py-2.5 text-sm font-semibold text-white hover:bg-rose-800 disabled:opacity-50";
const botaoSecundario = "rounded-lg px-3 py-2 text-sm font-medium text-stone-700 ring-1 ring-stone-300 hover:bg-white";
const FORMAS = Object.keys(NOME_FORMA_DESPESA) as FormaDespesa[];

type Categoria = { id: string; nome: string };

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

function SelectForma({ valor, mudar }: { valor: FormaDespesa; mudar: (f: FormaDespesa) => void }) {
  return (
    <select value={valor} onChange={(e) => mudar(e.target.value as FormaDespesa)} className={`${campo} mt-1`}>
      {FORMAS.map((f) => (
        <option key={f} value={f}>
          {NOME_FORMA_DESPESA[f]}
        </option>
      ))}
    </select>
  );
}

export function NovaDespesa({ categorias, hoje }: { categorias: Categoria[]; hoje: string }) {
  const [aberto, setAberto] = useState(false);
  const [categoriaId, setCategoriaId] = useState("");
  const [descricao, setDescricao] = useState("");
  const [valor, setValor] = useState("");
  const [vencimento, setVencimento] = useState(hoje);
  const [paga, setPaga] = useState(false);
  const [pagoEm, setPagoEm] = useState(hoje);
  const [forma, setForma] = useState<FormaDespesa>("pix");
  const [observacao, setObservacao] = useState("");
  const { erro, enviando, rodar } = useAcao();

  if (!aberto)
    return (
      <button type="button" onClick={() => setAberto(true)} className={botao}>
        + Nova despesa
      </button>
    );
  return (
    <section className="space-y-3 rounded-2xl bg-white p-5 shadow-sm ring-1 ring-stone-200">
      <h2 className="font-semibold text-stone-900">Nova despesa</h2>
      {erro && <Mensagem tipo="erro">{erro}</Mensagem>}
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="block sm:col-span-2">
          <span className="text-sm text-stone-700">Descrição</span>
          <input value={descricao} maxLength={120} onChange={(e) => setDescricao(e.target.value)} placeholder="Ex.: conta de luz" className={`${campo} mt-1`} />
        </label>
        <label className="block">
          <span className="text-sm text-stone-700">Categoria</span>
          <select value={categoriaId} onChange={(e) => setCategoriaId(e.target.value)} className={`${campo} mt-1`}>
            <option value="">Escolha</option>
            {categorias.map((c) => (
              <option key={c.id} value={c.id}>
                {c.nome}
              </option>
            ))}
          </select>
        </label>
        <label className="block">
          <span className="text-sm text-stone-700">Valor (R$)</span>
          <input inputMode="decimal" value={valor} onChange={(e) => setValor(e.target.value)} placeholder="Ex.: 180,50" className={`${campo} mt-1`} />
        </label>
        <label className="block">
          <span className="text-sm text-stone-700">Vencimento</span>
          <input type="date" value={vencimento} onChange={(e) => setVencimento(e.target.value)} className={`${campo} mt-1`} />
        </label>
      </div>
      <label className="flex items-center gap-3">
        <input type="checkbox" checked={paga} onChange={(e) => setPaga(e.target.checked)} className="h-5 w-5 accent-rose-700" />
        <span className="text-sm text-stone-800">Já está paga</span>
      </label>
      {paga && (
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="block">
            <span className="text-sm text-stone-700">Pago em</span>
            <input type="date" value={pagoEm} max={hoje} onChange={(e) => setPagoEm(e.target.value)} className={`${campo} mt-1`} />
          </label>
          <label className="block">
            <span className="text-sm text-stone-700">Como foi pago</span>
            <SelectForma valor={forma} mudar={setForma} />
          </label>
        </div>
      )}
      <label className="block">
        <span className="text-sm text-stone-700">Observação (opcional)</span>
        <input value={observacao} maxLength={200} onChange={(e) => setObservacao(e.target.value)} className={`${campo} mt-1`} />
      </label>
      <div className="flex gap-2">
        <button type="button" onClick={() => setAberto(false)} className={botaoSecundario}>Voltar</button>
        <button
          type="button"
          disabled={enviando || !categoriaId || descricao.trim().length < 2 || !valor.trim()}
          onClick={() =>
            rodar(
              () => criarDespesa({ categoriaId, descricao, valor, vencimento, paga, pagoEm, forma, observacao }),
              () => {
                setDescricao("");
                setValor("");
                setObservacao("");
                setPaga(false);
                setAberto(false);
              },
            )
          }
          className={botao}
        >
          {enviando ? "Salvando..." : "Salvar despesa"}
        </button>
      </div>
    </section>
  );
}

export function AcoesDespesa({ despesaId, paga, hoje }: { despesaId: string; paga: boolean; hoje: string }) {
  const [modo, setModo] = useState<null | "pagar" | "cancelar" | "desfazer">(null);
  const [pagoEm, setPagoEm] = useState(hoje);
  const [forma, setForma] = useState<FormaDespesa>("pix");
  const [motivo, setMotivo] = useState("");
  const { erro, enviando, rodar } = useAcao();
  const fechar = () => {
    setModo(null);
    setMotivo("");
  };

  if (!modo)
    return (
      <div className="flex gap-3 text-xs font-semibold">
        {!paga && (
          <button type="button" onClick={() => setModo("pagar")} className="text-emerald-700 hover:underline">Marcar como paga</button>
        )}
        {!paga && (
          <button type="button" onClick={() => setModo("cancelar")} className="text-red-700 hover:underline">Cancelar</button>
        )}
        {paga && (
          <button type="button" onClick={() => setModo("desfazer")} className="text-stone-600 hover:underline">Desfazer pagamento</button>
        )}
      </div>
    );

  return (
    <div className="space-y-2 rounded-xl bg-stone-50 p-3 ring-1 ring-stone-200">
      {erro && <Mensagem tipo="erro">{erro}</Mensagem>}
      {modo === "pagar" ? (
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="block">
            <span className="text-sm text-stone-700">Pago em</span>
            <input type="date" value={pagoEm} max={hoje} onChange={(e) => setPagoEm(e.target.value)} className={`${campo} mt-1`} />
          </label>
          <label className="block">
            <span className="text-sm text-stone-700">Como foi pago</span>
            <SelectForma valor={forma} mudar={setForma} />
          </label>
        </div>
      ) : (
        <input
          value={motivo}
          maxLength={200}
          onChange={(e) => setMotivo(e.target.value)}
          placeholder={modo === "cancelar" ? "Motivo do cancelamento (ex.: lancei em dobro)" : "Motivo (ex.: marquei a conta errada)"}
          className={campo}
        />
      )}
      <div className="flex gap-2">
        <button type="button" onClick={fechar} className={botaoSecundario}>Voltar</button>
        <button
          type="button"
          disabled={enviando || (modo !== "pagar" && motivo.trim().length < 3)}
          onClick={() =>
            rodar(
              () =>
                modo === "pagar"
                  ? pagarDespesa(despesaId, pagoEm, forma)
                  : modo === "cancelar"
                    ? cancelarDespesa(despesaId, motivo)
                    : desfazerPagamento(despesaId, motivo),
              fechar,
            )
          }
          className={modo === "cancelar" ? "rounded-lg bg-red-700 px-4 py-2 text-sm font-semibold text-white hover:bg-red-800 disabled:opacity-50" : botao}
        >
          {enviando ? "Salvando..." : modo === "pagar" ? "Confirmar pagamento" : modo === "cancelar" ? "Cancelar despesa" : "Desfazer pagamento"}
        </button>
      </div>
    </div>
  );
}

export function NovaFixa({ categorias, mesAtual }: { categorias: Categoria[]; mesAtual: string }) {
  const [aberto, setAberto] = useState(false);
  const [categoriaId, setCategoriaId] = useState("");
  const [descricao, setDescricao] = useState("");
  const [valor, setValor] = useState("");
  const [dia, setDia] = useState("10");
  const [inicio, setInicio] = useState(mesAtual);
  const { erro, enviando, rodar } = useAcao();

  if (!aberto)
    return (
      <button type="button" onClick={() => setAberto(true)} className="text-sm font-semibold text-rose-700 hover:underline">
        + Nova despesa fixa
      </button>
    );
  return (
    <div className="space-y-3 rounded-xl bg-stone-50 p-4 ring-1 ring-stone-200">
      {erro && <Mensagem tipo="erro">{erro}</Mensagem>}
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="block sm:col-span-2">
          <span className="text-sm text-stone-700">Descrição</span>
          <input value={descricao} maxLength={120} onChange={(e) => setDescricao(e.target.value)} placeholder="Ex.: aluguel" className={`${campo} mt-1`} />
        </label>
        <label className="block">
          <span className="text-sm text-stone-700">Categoria</span>
          <select value={categoriaId} onChange={(e) => setCategoriaId(e.target.value)} className={`${campo} mt-1`}>
            <option value="">Escolha</option>
            {categorias.map((c) => (
              <option key={c.id} value={c.id}>
                {c.nome}
              </option>
            ))}
          </select>
        </label>
        <label className="block">
          <span className="text-sm text-stone-700">Valor (R$)</span>
          <input inputMode="decimal" value={valor} onChange={(e) => setValor(e.target.value)} className={`${campo} mt-1`} />
        </label>
        <label className="block">
          <span className="text-sm text-stone-700">Vence todo dia</span>
          <input inputMode="numeric" value={dia} onChange={(e) => setDia(e.target.value)} className={`${campo} mt-1`} />
        </label>
        <label className="block">
          <span className="text-sm text-stone-700">A partir de</span>
          <input type="month" value={inicio} onChange={(e) => setInicio(e.target.value)} className={`${campo} mt-1`} />
        </label>
      </div>
      <p className="text-xs text-stone-500">Se o dia não existir no mês (ex.: 31 em fevereiro), vence no último dia.</p>
      <div className="flex gap-2">
        <button type="button" onClick={() => setAberto(false)} className={botaoSecundario}>Voltar</button>
        <button
          type="button"
          disabled={enviando || !categoriaId || descricao.trim().length < 2 || !valor.trim()}
          onClick={() =>
            rodar(
              () => criarDespesaFixa({ categoriaId, descricao, valor, dia, inicio }),
              () => {
                setDescricao("");
                setValor("");
                setAberto(false);
              },
            )
          }
          className={botao}
        >
          {enviando ? "Salvando..." : "Salvar despesa fixa"}
        </button>
      </div>
    </div>
  );
}

export function EncerrarFixa({ fixaId }: { fixaId: string }) {
  const [confirmar, setConfirmar] = useState(false);
  const { erro, enviando, rodar } = useAcao();
  if (!confirmar)
    return (
      <button type="button" onClick={() => setConfirmar(true)} className="text-xs font-semibold text-red-700 hover:underline">
        Encerrar
      </button>
    );
  return (
    <span className="flex items-center gap-2 text-xs">
      {erro && <span className="text-red-700">{erro}</span>}
      <span className="text-stone-600">Parar de gerar nos próximos meses?</span>
      <button type="button" onClick={() => setConfirmar(false)} className="font-semibold text-stone-600 hover:underline">Não</button>
      <button type="button" disabled={enviando} onClick={() => rodar(() => encerrarDespesaFixa(fixaId))} className="font-semibold text-red-700 hover:underline">
        Sim, encerrar
      </button>
    </span>
  );
}

export function Categorias({ categorias }: { categorias: { id: string; nome: string; ativo: boolean }[] }) {
  const [nome, setNome] = useState("");
  const { erro, enviando, rodar } = useAcao();
  return (
    <section className="space-y-3 rounded-2xl bg-white p-5 shadow-sm ring-1 ring-stone-200">
      <h2 className="font-semibold text-stone-900">Categorias</h2>
      {erro && <Mensagem tipo="erro">{erro}</Mensagem>}
      <ul className="flex flex-wrap gap-2 text-sm">
        {categorias.map((c) => (
          <li key={c.id} className={`flex items-center gap-2 rounded-full px-3 py-1 ring-1 ${c.ativo ? "ring-stone-300 text-stone-800" : "ring-stone-200 text-stone-400"}`}>
            {c.nome}
            <button
              type="button"
              disabled={enviando}
              onClick={() => rodar(() => ativarCategoria(c.id, !c.ativo))}
              className="text-xs font-semibold text-rose-700 hover:underline"
            >
              {c.ativo ? "desativar" : "reativar"}
            </button>
          </li>
        ))}
      </ul>
      <div className="flex flex-wrap items-end gap-2">
        <label className="block">
          <span className="text-sm text-stone-700">Nova categoria</span>
          <input value={nome} maxLength={60} onChange={(e) => setNome(e.target.value)} className={`${campo} mt-1`} />
        </label>
        <button type="button" disabled={enviando || nome.trim().length < 2} onClick={() => rodar(() => criarCategoria(nome), () => setNome(""))} className={botao}>
          Criar
        </button>
      </div>
    </section>
  );
}
