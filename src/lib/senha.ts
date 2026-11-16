import { randomInt } from "node:crypto";

// Sem letras e números que se confundem (0/O, 1/l/I), para ditar ou mandar por WhatsApp.
const LETRAS = "abcdefghjkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ";
const NUMEROS = "23456789";

/** Senha provisória fácil de ler: 3 blocos, ex.: "kTm4-Qwz7-HpR2". */
export function gerarSenhaProvisoria(): string {
  const bloco = () =>
    Array.from({ length: 3 }, () => LETRAS[randomInt(LETRAS.length)]).join("") + NUMEROS[randomInt(NUMEROS.length)];
  return [bloco(), bloco(), bloco()].join("-");
}
