"use client";

import { Pencil, Plus, Trash2, Users, X } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Mensagem } from "@/components/ui";
import type { ItemComanda } from "@/lib/comandas";
import { centavosParaTexto, formatarReais } from "@/lib/dinheiro";
import { alterarItem, cancelarComanda, definirAssistentes, definirDesconto, lancarItem, removerItem } from "../acoes";

const campo =
  "block w-full rounded-lg border border-stone-300 bg-white px-3 py-2.5 text-base text-stone-900 outline-none focus:border-rose-600 focus:ring-2 focus:ring-rose-200 disabled:bg-stone-100 disabled:text-stone-500";
const botaoPrincipal = "rounded-lg bg-rose-700 px-4 py-2.5 text-sm font-semibold text-white hover:bg-rose-800 disabled:opacity-50";
const botaoSecundario = "rounded-lg px-4 py-2.5 text-sm font-medium text-stone-700 ring-1 ring-stone-300 hover:bg-stone-50";
const botaoLink = "flex items-center gap-1 text-xs font-semibold text-rose-700 hover:underline";

type Opcao = { id: string; nome: string; preco: number };

// ---------------------------------------------------------------------------
// Lançar serviço ou produto
// ---------------------------------------------------------------------------
export function Lancar({
  comandaId,
  servicos,
  produtos,
  profissionais,
  minhaId,
  podeAlterarPreco,
}: {
  comandaId: string;
  servicos: Opcao[];
  produtos: Opcao[];
  profissionais: { id: string; nome: string }[];
  minhaId: string | null; // preenchido quando quem lança é a profissional (lança só em nome dela)
  podeAlterarPreco: boolean;
}) {
  const router = useRouter();
  const [aberto, setAberto] = useState(false);
  const [tipo, setTipo] = useState<"servico" | "produto">("servico");
  const [refId, setRefId] = useState("");
  const [prof, setProf] = useState(minhaId ?? "");
  const [quantidade, setQuantidade] = useState(1);
  const [preco, setPreco] = useState("");
  const [desconto, setDesconto] = useState("");
  const [erro, setErro] = useState<string | null>(null);
  const [enviando, iniciar] = useTransition();
  const lista = tipo === "servico" ? servicos : produtos;

  const limpar = () => {
    setRefId("");
    setQuantidade(1);
    setPreco("");
    setDesconto("");
    setErro(null);
  };

  if (!aberto)
    return (
      <button type="button" onClick={() => setAberto(true)} className={`flex w-full items-center justify-center gap-2 ${botaoPrincipal} py-3 text-base`}>
        <Plus aria-hidden className="h-5 w-5" /> Lançar serviço ou produto
      </button>
    );

  return (
    <div className="space-y-3 rounded-xl bg-stone-50 p-4 ring-1 ring-stone-200">
      {erro && <Mensagem tipo="erro">{erro}</Mensagem>}
      <fieldset className="flex gap-4 text-sm text-stone-800">
        <legend className="sr-only">Tipo</legend>
        {(["servico", "produto"] as const).map((t) => (
          <label key={t} className="flex items-center gap-2">
            <input
              type="radio"
              name="tipo"
              checked={tipo === t}
              onChange={() => {
                setTipo(t);
                limpar();
              }}
              className="h-4 w-4 accent-rose-700"
            />
            {t === "servico" ? "Serviço" : "Produto"}
          </label>
        ))}
      </fieldset>

      <label className="block">
        <span className="text-sm text-stone-700">{tipo === "servico" ? "Serviço" : "Produto"}</span>
        <select
          value={refId}
          onChange={(e) => {
            setRefId(e.target.value);
            const o = lista.find((x) => x.id === e.target.value);
            setPreco(o ? centavosParaTexto(o.preco) : "");
          }}
          className={`${campo} mt-1`}
        >
          <option value="">Escolha...</option>
          {lista.map((o) => (
            <option key={o.id} value={o.id}>
              {o.nome} · {formatarReais(o.preco)}
            </option>
          ))}
        </select>
        {lista.length === 0 && (
          <span className="mt-1 block text-xs text-stone-500">
            Nenhum {tipo === "servico" ? "serviço" : "produto"} ativo cadastrado.
          </span>
        )}
      </label>

      {!minhaId && (
        <label className="block">
          <span className="text-sm text-stone-700">{tipo === "servico" ? "Quem fez" : "Quem vendeu (opcional)"}</span>
          <select value={prof} onChange={(e) => setProf(e.target.value)} className={`${campo} mt-1`}>
            <option value="">{tipo === "servico" ? "Escolha..." : "Ninguém"}</option>
            {profissionais.map((p) => (
              <option key={p.id} value={p.id}>{p.nome}</option>
            ))}
          </select>
        </label>
      )}

      <div className="grid grid-cols-3 gap-3">
        {tipo === "produto" && (
          <label className="block">
            <span className="text-sm text-stone-700">Quantidade</span>
            <input type="number" min={1} max={999} value={quantidade} onChange={(e) => setQuantidade(Number(e.target.value))} className={`${campo} mt-1`} />
          </label>
        )}
        <label className="block">
          <span className="text-sm text-stone-700">Preço (R$)</span>
          <input inputMode="decimal" value={preco} disabled={!podeAlterarPreco} onChange={(e) => setPreco(e.target.value)} className={`${campo} mt-1`} />
        </label>
        {podeAlterarPreco && (
          <label className="block">
            <span className="text-sm text-stone-700">Desconto (R$)</span>
            <input inputMode="decimal" value={desconto} placeholder="0,00" onChange={(e) => setDesconto(e.target.value)} className={`${campo} mt-1`} />
          </label>
        )}
      </div>

      <div className="flex gap-2">
        <button
          type="button"
          onClick={() => {
            limpar();
            setAberto(false);
          }}
          className={botaoSecundario}
        >
          Fechar
        </button>
        <button
          type="button"
          disabled={enviando}
          onClick={() =>
            iniciar(async () => {
              setErro(null);
              const r = await lancarItem(comandaId, {
                tipo,
                refId,
                profissionalId: prof || null,
                quantidade: tipo === "servico" ? 1 : quantidade,
                // sem permissão de mudar preço, manda vazio (vale o preço do cadastro)
                preco: podeAlterarPreco ? preco : "",
                desconto: podeAlterarPreco ? desconto : "",
              });
              if (!r.ok) return setErro(r.erro);
              limpar();
              router.refresh();
            })
          }
          className={botaoPrincipal}
        >
          {enviando ? "Lançando..." : "Lançar"}
        </button>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Ações de um item: editar, assistentes, excluir
// ---------------------------------------------------------------------------
export function AcoesItem({
  comandaId,
  item,
  podeEditar,
  podeAlterarPreco,
  podeExcluir,
  assistentes,
}: {
  comandaId: string;
  item: ItemComanda;
  podeEditar: boolean; // dono/recepção, ou a profissional dona do item
  podeAlterarPreco: boolean;
  podeExcluir: boolean; // dono/recepção
  assistentes: { id: string; nome: string }[];
}) {
  const router = useRouter();
  const [modo, setModo] = useState<null | "editar" | "assistentes" | "excluir">(null);
  const [quantidade, setQuantidade] = useState(item.quantidade);
  const [preco, setPreco] = useState(centavosParaTexto(item.precoUnitario));
  const [desconto, setDesconto] = useState(item.desconto ? centavosParaTexto(item.desconto) : "");
  const [marcadas, setMarcadas] = useState<string[]>(item.assistenteIds);
  const [motivo, setMotivo] = useState("");
  const [erro, setErro] = useState<string | null>(null);
  const [enviando, iniciar] = useTransition();

  // Serviço sem poder mudar preço: não há o que editar (quantidade é sempre 1).
  const temEditar = podeEditar && (podeAlterarPreco || item.tipo === "produto");
  const temAssistentes = podeEditar && item.tipo === "servico" && assistentes.length > 0;
  if (!temEditar && !temAssistentes && !podeExcluir) return null;

  const executar = (f: () => Promise<{ ok: boolean; erro?: string }>) =>
    iniciar(async () => {
      setErro(null);
      const r = await f();
      if (!r.ok) return setErro(r.erro ?? "Erro.");
      setModo(null);
      router.refresh();
    });

  return (
    <div className="mt-2 space-y-2">
      {modo === null && (
        <div className="flex flex-wrap gap-3">
          {temEditar && (
            <button type="button" onClick={() => setModo("editar")} className={botaoLink}>
              <Pencil aria-hidden className="h-3.5 w-3.5" /> Editar
            </button>
          )}
          {temAssistentes && (
            <button type="button" onClick={() => setModo("assistentes")} className={botaoLink}>
              <Users aria-hidden className="h-3.5 w-3.5" /> Assistentes
            </button>
          )}
          {podeExcluir && (
            <button type="button" onClick={() => setModo("excluir")} className="flex items-center gap-1 text-xs font-semibold text-red-700 hover:underline">
              <Trash2 aria-hidden className="h-3.5 w-3.5" /> Excluir
            </button>
          )}
        </div>
      )}

      {modo !== null && (
        <div className="space-y-3 rounded-lg bg-stone-50 p-3 ring-1 ring-stone-200">
          {erro && <Mensagem tipo="erro">{erro}</Mensagem>}

          {modo === "editar" && (
            <div className="grid grid-cols-3 gap-2">
              {item.tipo === "produto" && (
                <label className="block">
                  <span className="text-xs text-stone-700">Quantidade</span>
                  <input type="number" min={1} max={999} value={quantidade} onChange={(e) => setQuantidade(Number(e.target.value))} className={`${campo} mt-1`} />
                </label>
              )}
              <label className="block">
                <span className="text-xs text-stone-700">Preço (R$)</span>
                <input inputMode="decimal" value={preco} disabled={!podeAlterarPreco} onChange={(e) => setPreco(e.target.value)} className={`${campo} mt-1`} />
              </label>
              {podeAlterarPreco && (
                <label className="block">
                  <span className="text-xs text-stone-700">Desconto (R$)</span>
                  <input inputMode="decimal" value={desconto} placeholder="0,00" onChange={(e) => setDesconto(e.target.value)} className={`${campo} mt-1`} />
                </label>
              )}
            </div>
          )}

          {modo === "assistentes" && (
            <fieldset className="space-y-2">
              <legend className="text-xs text-stone-700">Quem ajudou neste serviço</legend>
              {assistentes.map((a) => (
                <label key={a.id} className="flex items-center gap-2 text-sm text-stone-800">
                  <input
                    type="checkbox"
                    checked={marcadas.includes(a.id)}
                    onChange={(e) => setMarcadas(e.target.checked ? [...marcadas, a.id] : marcadas.filter((x) => x !== a.id))}
                    className="h-4 w-4 accent-rose-700"
                  />
                  {a.nome}
                </label>
              ))}
            </fieldset>
          )}

          {modo === "excluir" && (
            <label className="block">
              <span className="text-xs text-red-900">Por que excluir? (fica registrado)</span>
              <input value={motivo} maxLength={200} placeholder="Ex.: lançado por engano" onChange={(e) => setMotivo(e.target.value)} className={`${campo} mt-1`} />
            </label>
          )}

          <div className="flex gap-2">
            <button type="button" onClick={() => setModo(null)} className={botaoSecundario}>
              Voltar
            </button>
            <button
              type="button"
              disabled={enviando || (modo === "excluir" && motivo.trim().length < 3)}
              onClick={() =>
                executar(() =>
                  modo === "editar"
                    ? alterarItem(comandaId, item.id, item.tipo === "produto" ? quantidade : 1, preco, desconto)
                    : modo === "assistentes"
                      ? definirAssistentes(comandaId, item.id, marcadas)
                      : removerItem(comandaId, item.id, motivo),
                )
              }
              className={modo === "excluir" ? "rounded-lg bg-red-700 px-4 py-2.5 text-sm font-semibold text-white hover:bg-red-800 disabled:opacity-50" : botaoPrincipal}
            >
              {enviando ? "Salvando..." : modo === "excluir" ? "Excluir item" : "Salvar"}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Desconto no total da comanda
// ---------------------------------------------------------------------------
export function DescontoGeral({ comandaId, atual }: { comandaId: string; atual: number }) {
  const router = useRouter();
  const [aberto, setAberto] = useState(false);
  const [valor, setValor] = useState(atual ? centavosParaTexto(atual) : "");
  const [erro, setErro] = useState<string | null>(null);
  const [enviando, iniciar] = useTransition();

  if (!aberto)
    return (
      <button type="button" onClick={() => setAberto(true)} className={botaoLink}>
        {atual ? "Mudar desconto na comanda" : "Dar desconto na comanda"}
      </button>
    );
  return (
    <div className="space-y-2 rounded-lg bg-stone-50 p-3 ring-1 ring-stone-200">
      {erro && <Mensagem tipo="erro">{erro}</Mensagem>}
      <label className="block">
        <span className="text-xs text-stone-700">Desconto no total (R$). Deixe vazio para tirar.</span>
        <input inputMode="decimal" value={valor} placeholder="0,00" onChange={(e) => setValor(e.target.value)} className={`${campo} mt-1`} />
      </label>
      <div className="flex gap-2">
        <button type="button" onClick={() => setAberto(false)} className={botaoSecundario}>Voltar</button>
        <button
          type="button"
          disabled={enviando}
          onClick={() =>
            iniciar(async () => {
              setErro(null);
              const r = await definirDesconto(comandaId, valor);
              if (!r.ok) return setErro(r.erro);
              setAberto(false);
              router.refresh();
            })
          }
          className={botaoPrincipal}
        >
          {enviando ? "Salvando..." : "Salvar"}
        </button>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Cancelar a comanda inteira
// ---------------------------------------------------------------------------
export function CancelarComanda({ comandaId }: { comandaId: string }) {
  const router = useRouter();
  const [aberto, setAberto] = useState(false);
  const [motivo, setMotivo] = useState("");
  const [erro, setErro] = useState<string | null>(null);
  const [enviando, iniciar] = useTransition();

  if (!aberto)
    return (
      <button type="button" onClick={() => setAberto(true)} className="flex items-center gap-1.5 text-sm font-semibold text-red-700 hover:underline">
        <X aria-hidden className="h-4 w-4" /> Cancelar comanda
      </button>
    );
  return (
    <div className="space-y-3 rounded-xl bg-red-50 p-4 ring-1 ring-red-200">
      <p className="font-semibold text-red-900">Cancelar esta comanda?</p>
      {erro && <Mensagem tipo="erro">{erro}</Mensagem>}
      <label className="block">
        <span className="text-sm text-red-900">Motivo (fica registrado)</span>
        <input value={motivo} maxLength={200} placeholder="Ex.: cliente desistiu" onChange={(e) => setMotivo(e.target.value)} className={`${campo} mt-1`} />
      </label>
      <div className="flex gap-2">
        <button type="button" onClick={() => setAberto(false)} className={botaoSecundario}>Voltar</button>
        <button
          type="button"
          disabled={enviando || motivo.trim().length < 3}
          onClick={() =>
            iniciar(async () => {
              setErro(null);
              const r = await cancelarComanda(comandaId, motivo);
              if (!r.ok) return setErro(r.erro);
              router.push("/comandas");
              router.refresh();
            })
          }
          className="rounded-lg bg-red-700 px-4 py-2.5 text-sm font-semibold text-white hover:bg-red-800 disabled:opacity-50"
        >
          {enviando ? "Cancelando..." : "Cancelar comanda"}
        </button>
      </div>
    </div>
  );
}
