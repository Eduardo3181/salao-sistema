import { describe, expect, it } from "vitest";
import {
  formatarAniversario,
  formatarTelefone,
  hojeEmBrasilia,
  linkWhatsApp,
  normalizarTelefone,
  validarNascimento,
} from "@/lib/telefone-data";

describe("Telefone", () => {
  it.each([
    ["(11) 98765-4321", "11987654321"],
    ["+55 11 98765-4321", "11987654321"],
    ["5511987654321", "11987654321"],
    ["11 3333-4444", "1133334444"],
    ["", ""],
    ["   ", ""],
  ])("%j vira %j", (texto, esperado) => {
    expect(normalizarTelefone(texto)).toBe(esperado);
  });

  it.each(["98765-4321", "123", "(01) 98765-4321", "119876543210"])("recusa %j", (texto) => {
    expect(normalizarTelefone(texto)).toBeNull();
  });

  it("formata para exibir e monta o link do WhatsApp só para celular", () => {
    expect(formatarTelefone("11987654321")).toBe("(11) 98765-4321");
    expect(formatarTelefone("1133334444")).toBe("(11) 3333-4444");
    expect(linkWhatsApp("11987654321")).toBe("https://wa.me/5511987654321");
    expect(linkWhatsApp("1133334444")).toBeNull();
  });
});

describe("Data de nascimento", () => {
  const hoje = "2026-11-17";
  it("aceita data válida e vazia", () => {
    expect(validarNascimento("1990-05-10", hoje)).toBe("1990-05-10");
    expect(validarNascimento("", hoje)).toBe("");
  });

  it.each(["2026-11-18", "1899-12-31", "2023-02-30", "10/05/1990"])("recusa %j", (texto) => {
    expect(validarNascimento(texto, hoje)).toBeNull();
  });

  it("usa o dia de Brasília (às 22h de Brasília ainda é o mesmo dia)", () => {
    // 01:00 UTC do dia 18 = 22:00 do dia 17 em Brasília
    expect(hojeEmBrasilia(new Date("2026-11-18T01:00:00Z"))).toBe("2026-11-17");
  });

  it("mostra o aniversário como dia/mês", () => {
    expect(formatarAniversario("1990-05-10")).toBe("10/05");
  });
});
