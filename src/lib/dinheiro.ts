/**
 * Dinheiro sempre em CENTAVOS inteiros (regra do projeto). Nada de número quebrado.
 * Estas funções só convertem entre o que a pessoa digita/vê e os centavos.
 */

/**
 * Converte o que a pessoa digitou em reais para centavos.
 * Aceita "80", "80,5", "80,50", "1.234,56", "R$ 1.234,56", "80.50".
 * Devolve null se não for um valor válido (ou tiver mais de 2 casas decimais).
 */
export function reaisParaCentavos(texto: string): number | null {
  let t = texto.trim().replace(/^R\$\s*/i, "").replace(/\s/g, "");
  if (!t) return null;

  if (t.includes(",")) {
    // padrão brasileiro: ponto separa milhar, vírgula separa centavos
    if (!/^\d{1,3}(\.\d{3})*(,\d{1,2})?$|^\d+(,\d{1,2})?$/.test(t)) return null;
    t = t.replace(/\./g, "").replace(",", ".");
  } else if (!/^\d+(\.\d{1,2})?$/.test(t)) {
    return null;
  }

  const [inteiro, decimal = ""] = t.split(".");
  const centavos = Number(inteiro) * 100 + Number(decimal.padEnd(2, "0"));
  return Number.isSafeInteger(centavos) ? centavos : null;
}

const formatoReais = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });

/** 8000 -> "R$ 80,00" */
export function formatarReais(centavos: number): string {
  return formatoReais.format(centavos / 100).replace(/ /g, " ");
}

/** 8000 -> "80,00" (para preencher campo de edição) */
export function centavosParaTexto(centavos: number): string {
  const reais = Math.floor(centavos / 100);
  const resto = String(centavos % 100).padStart(2, "0");
  return `${reais},${resto}`;
}

/** 45 -> "45min"; 90 -> "1h30"; 120 -> "2h" */
export function formatarDuracao(minutos: number): string {
  const h = Math.floor(minutos / 60);
  const m = minutos % 60;
  if (h === 0) return `${m}min`;
  return m === 0 ? `${h}h` : `${h}h${String(m).padStart(2, "0")}`;
}

/**
 * Taxa em % digitada ("2,99", "3", "5.25") -> centésimos de ponto percentual (299, 300, 525).
 * Aceita de 0 a 100, com até 2 casas. Devolve null se inválida.
 */
export function percentualParaCentesimos(texto: string): number | null {
  const t = texto.trim().replace(/%$/, "").trim().replace(",", ".");
  if (!/^\d{1,3}(\.\d{1,2})?$/.test(t)) return null;
  const [inteiro, decimal = ""] = t.split(".");
  const c = Number(inteiro) * 100 + Number(decimal.padEnd(2, "0"));
  return c <= 10000 ? c : null;
}

/** 299 -> "2,99" */
export function centesimosParaTexto(c: number): string {
  return `${Math.floor(c / 100)},${String(c % 100).padStart(2, "0")}`;
}
