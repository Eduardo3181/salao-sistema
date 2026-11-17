/**
 * Leitura de planilhas para importar clientes e serviços.
 * Módulo puro (sem tela e sem banco), com testes em tests/importacao.test.ts.
 * Recebe as linhas já lidas do arquivo (a 1ª linha é o cabeçalho) e devolve
 * as linhas válidas e os erros, com o número da linha como aparece no Excel.
 */
import { reaisParaCentavos } from "@/lib/dinheiro";
import { normalizarTelefone, validarNascimento } from "@/lib/telefone-data";

export type Celula = string | number | boolean | Date | null | undefined;
export type TipoImportacao = "clientes" | "servicos";

export const LIMITE_LINHAS = 2000;

export type ClienteImportado = { nome: string; telefone: string | null; nascimento: string | null; observacoes: string | null };
export type ServicoImportado = { nome: string; categoria: string; duracao_min: number; preco_centavos: number };

export type ResultadoLeitura<T> = {
  validas: (T & { linha: number })[];
  erros: { linha: number; motivo: string }[];
  colunas: Record<string, string>; // campo -> título da coluna encontrada
  faltando: string[]; // campos obrigatórios sem coluna
};

/** "Data de Nascimento" -> "datadenascimento" (sem acento, sem espaço, minúsculo). */
export function normalizarCabecalho(texto: unknown): string {
  return String(texto ?? "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");
}

const SINONIMOS: Record<TipoImportacao, Record<string, string[]>> = {
  clientes: {
    nome: ["nome", "cliente", "nomecompleto", "nomedocliente", "nomedacliente", "nomecliente"],
    telefone: ["telefone", "celular", "whatsapp", "whats", "fone", "tel", "telefonecelular", "contato"],
    nascimento: ["nascimento", "datadenascimento", "datanascimento", "aniversario", "dtnasc", "datanasc"],
    observacoes: ["observacoes", "observacao", "obs", "anotacoes", "notas"],
  },
  servicos: {
    nome: ["servico", "nomedoservico", "nomeservico", "nome", "descricao"],
    categoria: ["categoria", "grupo", "tipo", "area"],
    duracao: ["duracao", "tempo", "duracaomin", "minutos", "duracaominutos"],
    preco: ["preco", "valor", "precovenda", "valorcobrado", "precoreais"],
  },
};

const OBRIGATORIOS: Record<TipoImportacao, string[]> = {
  clientes: ["nome"],
  servicos: ["nome", "categoria", "duracao", "preco"],
};

export const NOME_CAMPO: Record<string, string> = {
  nome: "Nome",
  telefone: "Telefone",
  nascimento: "Nascimento",
  observacoes: "Observações",
  categoria: "Categoria",
  duracao: "Duração",
  preco: "Preço",
};

/** Descobre em que coluna está cada campo (a ordem dos sinônimos define a preferência). */
export function encontrarColunas(cabecalho: Celula[], tipo: TipoImportacao) {
  const normalizado = cabecalho.map(normalizarCabecalho);
  const indices: Record<string, number> = {};
  const usados = new Set<number>();
  for (const [campo, sinonimos] of Object.entries(SINONIMOS[tipo])) {
    for (const s of sinonimos) {
      const i = normalizado.findIndex((c, idx) => c === s && !usados.has(idx));
      if (i >= 0) {
        indices[campo] = i;
        usados.add(i);
        break;
      }
    }
  }
  return indices;
}

const texto = (c: Celula) => (c === null || c === undefined ? "" : c instanceof Date ? "" : String(c).trim());

/** Converte a célula de data (Date, número do Excel, "10/05/1990", "1990-05-10") para "AAAA-MM-DD". */
export function converterData(c: Celula, hoje: string): string | null {
  if (c === null || c === undefined || c === "") return "";
  let iso = "";
  if (c instanceof Date) {
    if (Number.isNaN(c.getTime())) return null;
    iso = c.toISOString().slice(0, 10);
  } else if (typeof c === "number") {
    if (c < 1 || c > 80000) return null;
    iso = new Date(Date.UTC(1899, 11, 30) + Math.round(c) * 86400000).toISOString().slice(0, 10); // número de série do Excel
  } else {
    const t = String(c).trim();
    let m: RegExpMatchArray | null;
    if ((m = t.match(/^(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})$/))) iso = `${m[3]}-${m[2].padStart(2, "0")}-${m[1].padStart(2, "0")}`;
    else if ((m = t.match(/^(\d{4})-(\d{2})-(\d{2})/))) iso = `${m[1]}-${m[2]}-${m[3]}`;
    else if (t === "") return "";
    else return null;
  }
  return validarNascimento(iso, hoje);
}

/** Preço: número (80.5) ou texto ("R$ 80,50"). Devolve centavos ou null. */
export function converterPreco(c: Celula): number | null {
  if (typeof c === "number") {
    if (!Number.isFinite(c) || c < 0) return null;
    return reaisParaCentavos(c.toFixed(2)); // evita erro de número quebrado (19.99 * 100)
  }
  return reaisParaCentavos(texto(c));
}

/** Duração em minutos: 45, "45", "45min", "1h30", "1h", "01:30", ou fração de dia do Excel (0,0625 = 1h30). */
export function converterDuracao(c: Celula): number | null {
  let min: number;
  if (typeof c === "number") {
    min = c > 0 && c < 1 ? Math.round(c * 1440) : c;
  } else {
    const t = texto(c).toLowerCase().replace(/\s/g, "");
    let m: RegExpMatchArray | null;
    if ((m = t.match(/^(\d+)(min|m|minutos)?$/))) min = Number(m[1]);
    else if ((m = t.match(/^(\d+)h(\d{1,2})?(min|m)?$/))) min = Number(m[1]) * 60 + Number(m[2] ?? 0);
    else if ((m = t.match(/^(\d{1,2}):(\d{2})$/))) min = Number(m[1]) * 60 + Number(m[2]);
    else return null;
  }
  return Number.isInteger(min) && min >= 5 && min <= 720 ? min : null;
}

function telefoneDaCelula(c: Celula): string | null {
  if (typeof c === "number") return normalizarTelefone(String(Math.round(c)));
  return normalizarTelefone(texto(c));
}

/** Lê as linhas da planilha. A linha 1 é o cabeçalho; os números de linha seguem o Excel. */
export function lerPlanilha(
  linhas: Celula[][],
  tipo: "clientes",
  hoje: string,
): ResultadoLeitura<ClienteImportado>;
export function lerPlanilha(linhas: Celula[][], tipo: "servicos", hoje: string): ResultadoLeitura<ServicoImportado>;
export function lerPlanilha(linhas: Celula[][], tipo: TipoImportacao, hoje: string) {
  const [cabecalho = [], ...corpo] = linhas;
  const col = encontrarColunas(cabecalho, tipo);
  const colunas = Object.fromEntries(Object.entries(col).map(([campo, i]) => [campo, String(cabecalho[i] ?? "")]));
  const faltando = OBRIGATORIOS[tipo].filter((c) => col[c] === undefined);
  const resultado = { validas: [] as Record<string, unknown>[], erros: [] as { linha: number; motivo: string }[], colunas, faltando };
  if (faltando.length) return resultado;

  const vistos = new Map<string, number>(); // chave de repetição -> linha
  corpo.slice(0, LIMITE_LINHAS).forEach((celulas, i) => {
    const linha = i + 2;
    const pega = (campo: string) => (col[campo] === undefined ? null : celulas[col[campo]]);
    if (celulas.every((c) => texto(c) === "" && !(c instanceof Date))) return; // linha em branco: ignora

    const nome = texto(pega("nome")).replace(/\s+/g, " ");
    if (nome.length < 2 || nome.length > 120) return resultado.erros.push({ linha, motivo: "nome vazio ou curto demais" });

    if (tipo === "clientes") {
      const telefone = telefoneDaCelula(pega("telefone"));
      if (telefone === null) return resultado.erros.push({ linha, motivo: "telefone inválido (use DDD + número)" });
      const nascimento = converterData(pega("nascimento"), hoje);
      if (nascimento === null) return resultado.erros.push({ linha, motivo: "data de nascimento inválida" });
      const observacoes = texto(pega("observacoes")).slice(0, 1000);

      const chave = telefone ? `tel:${telefone}` : `nome:${nome.toLowerCase()}`;
      if (vistos.has(chave)) return resultado.erros.push({ linha, motivo: `repetida na planilha (igual à linha ${vistos.get(chave)})` });
      vistos.set(chave, linha);
      resultado.validas.push({ linha, nome, telefone: telefone || null, nascimento: nascimento || null, observacoes: observacoes || null });
    } else {
      const categoria = texto(pega("categoria")).replace(/\s+/g, " ");
      if (categoria.length < 2 || categoria.length > 60) return resultado.erros.push({ linha, motivo: "categoria vazia" });
      const duracao = converterDuracao(pega("duracao"));
      if (duracao === null) return resultado.erros.push({ linha, motivo: "duração inválida (ex.: 45 ou 1h30)" });
      const preco = converterPreco(pega("preco"));
      if (preco === null) return resultado.erros.push({ linha, motivo: "preço inválido (ex.: 80 ou 80,50)" });

      const chave = nome.toLowerCase();
      if (vistos.has(chave)) return resultado.erros.push({ linha, motivo: `repetido na planilha (igual à linha ${vistos.get(chave)})` });
      vistos.set(chave, linha);
      resultado.validas.push({ linha, nome, categoria, duracao_min: duracao, preco_centavos: preco });
    }
  });
  if (corpo.length > LIMITE_LINHAS)
    resultado.erros.push({ linha: LIMITE_LINHAS + 2, motivo: `a planilha passa de ${LIMITE_LINHAS} linhas; o resto foi ignorado` });
  return resultado;
}

/** Lê um arquivo .csv (aceita ponto e vírgula, vírgula ou tabulação, e campos entre aspas). */
export function lerCsv(conteudo: string): string[][] {
  const textoLimpo = conteudo.replace(/^﻿/, "");
  const primeira = textoLimpo.split(/\r?\n/, 1)[0] ?? "";
  const separador = [";", "\t", ","].reduce((melhor, s) =>
    primeira.split(s).length > primeira.split(melhor).length ? s : melhor,
  );

  const linhas: string[][] = [];
  let linha: string[] = [];
  let campo = "";
  let aspas = false;
  for (let i = 0; i < textoLimpo.length; i++) {
    const ch = textoLimpo[i];
    if (aspas) {
      if (ch === '"' && textoLimpo[i + 1] === '"') {
        campo += '"';
        i++;
      } else if (ch === '"') aspas = false;
      else campo += ch;
    } else if (ch === '"') aspas = true;
    else if (ch === separador) {
      linha.push(campo);
      campo = "";
    } else if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && textoLimpo[i + 1] === "\n") i++;
      linha.push(campo);
      linhas.push(linha);
      linha = [];
      campo = "";
    } else campo += ch;
  }
  if (campo !== "" || linha.length) {
    linha.push(campo);
    linhas.push(linha);
  }
  return linhas;
}
