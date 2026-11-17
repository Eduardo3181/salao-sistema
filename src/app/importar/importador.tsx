"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { Mensagem } from "@/components/ui";
import { formatarDuracao, formatarReais } from "@/lib/dinheiro";
import {
  type Celula,
  type ClienteImportado,
  lerCsv,
  lerPlanilha,
  NOME_CAMPO,
  type ResultadoLeitura,
  type ServicoImportado,
  type TipoImportacao,
} from "@/lib/importacao";
import { formatarTelefone } from "@/lib/telefone-data";
import { importar, type ResultadoImportacao } from "./acoes";

const TAMANHO_MAXIMO = 3 * 1024 * 1024; // 3 MB

const MODELOS: Record<TipoImportacao, string> = {
  clientes: "Nome;Telefone;Nascimento;Observações\nMaria Exemplo;(11) 98765-4321;10/05/1990;Prefere manhã\n",
  servicos: "Serviço;Categoria;Duração;Preço\nCorte feminino;Cabelo;45;80,00\nManicure;Unhas;30;25,00\n",
};

type Leitura = ResultadoLeitura<ClienteImportado> | ResultadoLeitura<ServicoImportado>;

export default function Importador({ hoje }: { hoje: string }) {
  const [tipo, setTipo] = useState<TipoImportacao>("clientes");
  const [leitura, setLeitura] = useState<Leitura | null>(null);
  const [nomeArquivo, setNomeArquivo] = useState("");
  const [erroArquivo, setErroArquivo] = useState("");
  const [resultado, setResultado] = useState<ResultadoImportacao | null>(null);
  const [importando, iniciar] = useTransition();

  function recomecar(novoTipo = tipo) {
    setTipo(novoTipo);
    setLeitura(null);
    setNomeArquivo("");
    setErroArquivo("");
    setResultado(null);
  }

  async function aoEscolherArquivo(arquivo: File | undefined) {
    setLeitura(null);
    setResultado(null);
    setErroArquivo("");
    if (!arquivo) return;
    setNomeArquivo(arquivo.name);
    if (arquivo.size > TAMANHO_MAXIMO) return setErroArquivo("Arquivo grande demais (máximo 3 MB).");

    try {
      let linhas: Celula[][];
      if (/\.csv$/i.test(arquivo.name)) {
        linhas = lerCsv(await arquivo.text());
      } else if (/\.xlsx$/i.test(arquivo.name)) {
        const { readSheet } = await import("read-excel-file/browser");
        linhas = (await readSheet(arquivo)) as Celula[][];
      } else {
        return setErroArquivo("Use um arquivo do Excel (.xlsx) ou .csv. Arquivos .xls antigos: abra no Excel e salve como .xlsx.");
      }
      setLeitura(tipo === "clientes" ? lerPlanilha(linhas, "clientes", hoje) : lerPlanilha(linhas, "servicos", hoje));
    } catch {
      setErroArquivo("Não foi possível ler este arquivo. Confira se ele abre no Excel e tente de novo.");
    }
  }

  function baixarModelo() {
    const blob = new Blob(["﻿" + MODELOS[tipo]], { type: "text/csv;charset=utf-8" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `modelo-${tipo}.csv`;
    a.click();
    URL.revokeObjectURL(a.href);
  }

  function confirmar() {
    if (!leitura) return;
    iniciar(async () => setResultado(await importar(tipo, leitura.validas)));
  }

  const cartao = "rounded-2xl bg-white p-6 shadow-sm ring-1 ring-stone-200";

  if (resultado?.mensagem) {
    return (
      <section className={`${cartao} space-y-4`}>
        <Mensagem tipo="aviso">{resultado.mensagem}</Mensagem>
        <div className="flex flex-wrap gap-3">
          <Link href={tipo === "clientes" ? "/clientes" : "/servicos"} className="rounded-lg bg-rose-700 px-4 py-2 text-sm font-semibold text-white hover:bg-rose-800">
            Ver {tipo === "clientes" ? "clientes" : "serviços"}
          </Link>
          <button type="button" onClick={() => recomecar()} className="rounded-lg px-4 py-2 text-sm font-semibold text-stone-700 ring-1 ring-stone-300 hover:bg-stone-50">
            Importar outra planilha
          </button>
        </div>
      </section>
    );
  }

  return (
    <div className="space-y-6">
      <section className={`${cartao} space-y-5`}>
        <fieldset>
          <legend className="text-sm font-medium text-stone-700">O que você vai importar?</legend>
          <div className="mt-2 flex gap-2">
            {(["clientes", "servicos"] as const).map((t) => (
              <label
                key={t}
                className={`cursor-pointer rounded-lg px-4 py-2 text-sm font-semibold ring-1 ${
                  tipo === t ? "bg-rose-700 text-white ring-rose-700" : "text-stone-700 ring-stone-300 hover:bg-stone-50"
                }`}
              >
                <input type="radio" name="tipo" value={t} checked={tipo === t} onChange={() => recomecar(t)} className="sr-only" />
                {t === "clientes" ? "Clientes" : "Serviços"}
              </label>
            ))}
          </div>
        </fieldset>

        <div className="text-sm text-stone-600">
          {tipo === "clientes" ? (
            <p>A planilha precisa de uma coluna <strong>Nome</strong>. Opcionais: Telefone (ou Celular/WhatsApp), Nascimento e Observações.</p>
          ) : (
            <p>A planilha precisa das colunas <strong>Serviço</strong>, <strong>Categoria</strong>, <strong>Duração</strong> (em minutos) e <strong>Preço</strong>.</p>
          )}
          <button type="button" onClick={baixarModelo} className="mt-2 font-semibold text-rose-700 hover:underline">
            Baixar planilha modelo
          </button>
        </div>

        <label className="block">
          <span className="text-sm font-medium text-stone-700">Arquivo (.xlsx ou .csv)</span>
          <input
            key={tipo}
            type="file"
            accept=".xlsx,.csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,text/csv"
            onChange={(e) => aoEscolherArquivo(e.target.files?.[0])}
            className="mt-1 block w-full text-sm text-stone-700 file:mr-3 file:rounded-lg file:border-0 file:bg-stone-100 file:px-4 file:py-2 file:font-semibold file:text-stone-800 hover:file:bg-stone-200"
          />
          <span className="mt-1 block text-xs text-stone-500">
            O arquivo é lido aqui no seu navegador e não fica guardado. Só as linhas que você confirmar são gravadas.
          </span>
        </label>
        {erroArquivo && <Mensagem tipo="erro">{erroArquivo}</Mensagem>}
      </section>

      {leitura && (
        <section className={`${cartao} space-y-4`}>
          <h2 className="font-semibold text-stone-900">Prévia de {nomeArquivo}</h2>

          {leitura.faltando.length > 0 ? (
            <Mensagem tipo="erro">
              Não encontrei a(s) coluna(s): {leitura.faltando.map((c) => NOME_CAMPO[c]).join(", ")}. Confira a primeira linha da
              planilha (os títulos) ou use a planilha modelo.
            </Mensagem>
          ) : (
            <>
              <p className="text-sm text-stone-700">
                Colunas usadas:{" "}
                {Object.entries(leitura.colunas)
                  .map(([campo, titulo]) => `${NOME_CAMPO[campo]} ← "${titulo}"`)
                  .join(" · ")}
              </p>
              <p className="text-sm">
                <strong className="text-emerald-800">{leitura.validas.length} linha(s) prontas</strong>
                {leitura.erros.length > 0 && <strong className="ml-2 text-red-700">· {leitura.erros.length} com problema</strong>}
              </p>

              {leitura.validas.length > 0 && (
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-sm">
                    <thead className="text-xs text-stone-500">
                      <tr>
                        <th className="py-1 pr-3">Linha</th>
                        <th className="py-1 pr-3">Nome</th>
                        {tipo === "clientes" ? (
                          <>
                            <th className="py-1 pr-3">Telefone</th>
                            <th className="py-1 pr-3">Nascimento</th>
                          </>
                        ) : (
                          <>
                            <th className="py-1 pr-3">Categoria</th>
                            <th className="py-1 pr-3">Duração</th>
                            <th className="py-1 pr-3">Preço</th>
                          </>
                        )}
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-stone-100">
                      {leitura.validas.slice(0, 10).map((v) => (
                        <tr key={v.linha}>
                          <td className="py-1.5 pr-3 text-stone-500">{v.linha}</td>
                          <td className="py-1.5 pr-3">{v.nome}</td>
                          {"telefone" in v ? (
                            <>
                              <td className="py-1.5 pr-3">{formatarTelefone(v.telefone)}</td>
                              <td className="py-1.5 pr-3">{v.nascimento?.split("-").reverse().join("/")}</td>
                            </>
                          ) : (
                            <>
                              <td className="py-1.5 pr-3">{v.categoria}</td>
                              <td className="py-1.5 pr-3">{formatarDuracao(v.duracao_min)}</td>
                              <td className="py-1.5 pr-3">{formatarReais(v.preco_centavos)}</td>
                            </>
                          )}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  {leitura.validas.length > 10 && (
                    <p className="mt-1 text-xs text-stone-500">Mostrando 10 de {leitura.validas.length}.</p>
                  )}
                </div>
              )}

              {leitura.erros.length > 0 && (
                <details className="rounded-lg bg-red-50 p-3 text-sm text-red-900 ring-1 ring-red-200">
                  <summary className="cursor-pointer font-medium">Ver linhas com problema (não serão importadas)</summary>
                  <ul className="mt-2 space-y-0.5">
                    {leitura.erros.slice(0, 100).map((e) => (
                      <li key={`${e.linha}-${e.motivo}`}>
                        Linha {e.linha}: {e.motivo}
                      </li>
                    ))}
                  </ul>
                </details>
              )}

              {resultado?.erro && <Mensagem tipo="erro">{resultado.erro}</Mensagem>}

              {leitura.validas.length > 0 && (
                <button
                  type="button"
                  onClick={confirmar}
                  disabled={importando}
                  className="w-full rounded-lg bg-rose-700 px-4 py-3 text-base font-semibold text-white hover:bg-rose-800 disabled:opacity-60"
                >
                  {importando ? "Importando..." : `Importar ${leitura.validas.length} linha(s)`}
                </button>
              )}
              <p className="text-xs text-stone-500">
                {tipo === "clientes"
                  ? "Clientes com o mesmo telefone (ou, sem telefone, o mesmo nome) de alguém já cadastrado são puladas."
                  : "Serviços com o mesmo nome de um já cadastrado são pulados. Categorias que não existem são criadas."}
              </p>
            </>
          )}
        </section>
      )}
    </div>
  );
}
