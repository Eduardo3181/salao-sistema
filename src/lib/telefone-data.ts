/**
 * Telefone e data de nascimento das clientes.
 * Telefone é guardado só com números e DDD (10 ou 11 dígitos), sem o +55.
 */

/** "(11) 98765-4321", "+55 11 98765-4321", "11987654321" -> "11987654321". Vazio -> "". Inválido -> null. */
export function normalizarTelefone(texto: string): string | null {
  let n = texto.replace(/\D/g, "");
  if (n === "") return "";
  if ((n.length === 12 || n.length === 13) && n.startsWith("55")) n = n.slice(2); // tira o +55
  if (n.length === 11 && n.startsWith("0")) return null;
  if (n.length !== 10 && n.length !== 11) return null;
  if (n.startsWith("0")) return null; // DDD não começa com 0
  return n;
}

/** "11987654321" -> "(11) 98765-4321"; "1133334444" -> "(11) 3333-4444" */
export function formatarTelefone(n: string | null | undefined): string {
  if (!n) return "";
  if (n.length === 11) return `(${n.slice(0, 2)}) ${n.slice(2, 7)}-${n.slice(7)}`;
  if (n.length === 10) return `(${n.slice(0, 2)}) ${n.slice(2, 6)}-${n.slice(6)}`;
  return n;
}

/** Link para abrir conversa no WhatsApp (celular com 11 dígitos). */
export function linkWhatsApp(n: string | null | undefined): string | null {
  if (!n || n.length !== 11) return null;
  return `https://wa.me/55${n}`;
}

/**
 * Valida a data de nascimento vinda do campo de data ("AAAA-MM-DD").
 * Vazio -> "". Inválida, antes de 1900 ou no futuro -> null.
 * "hoje" é a data atual no horário de Brasília, também em "AAAA-MM-DD".
 */
export function validarNascimento(texto: string, hoje: string): string | null {
  const t = texto.trim();
  if (t === "") return "";
  if (!/^\d{4}-\d{2}-\d{2}$/.test(t)) return null;
  const [a, m, d] = t.split("-").map(Number);
  const data = new Date(Date.UTC(a, m - 1, d));
  if (data.getUTCFullYear() !== a || data.getUTCMonth() !== m - 1 || data.getUTCDate() !== d) return null; // ex.: 31/02
  if (t < "1900-01-01" || t > hoje) return null;
  return t;
}

/** Data de hoje no horário de Brasília, "AAAA-MM-DD". */
export function hojeEmBrasilia(agora: Date = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo" }).format(agora);
}

/** "1990-05-10" -> "10/05" (dia e mês, para lembrar o aniversário). */
export function formatarAniversario(iso: string | null | undefined): string {
  if (!iso) return "";
  const [, m, d] = iso.split("-");
  return `${d}/${m}`;
}
