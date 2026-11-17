import { describe, expect, it } from "vitest";
import { centavosParaTexto, formatarDuracao, formatarReais, reaisParaCentavos } from "@/lib/dinheiro";
import { centesimosParaTexto, percentualParaCentesimos } from "@/lib/dinheiro";

describe("Reais digitados para centavos", () => {
  it.each([
    ["80", 8000],
    ["80,5", 8050],
    ["80,50", 8050],
    ["0,99", 99],
    ["1.234,56", 123456],
    ["R$ 1.234,56", 123456],
    ["  45,00 ", 4500],
    ["80.50", 8050],
    ["0", 0],
  ])("%s vira %i centavos", (texto, esperado) => {
    expect(reaisParaCentavos(texto)).toBe(esperado);
  });

  it.each(["", "abc", "80,555", "-10", "1,2,3", "12.34.56", "1.23,45", "80.555"])("recusa %j", (texto) => {
    expect(reaisParaCentavos(texto)).toBeNull();
  });

  it("não perde centavo com valores que dão erro em número quebrado", () => {
    // 0,1 + 0,2 em número quebrado vira 0,30000000000000004; em centavos não.
    expect(reaisParaCentavos("0,10")! + reaisParaCentavos("0,20")!).toBe(30);
    expect(reaisParaCentavos("19,99")).toBe(1999);
  });
});

describe("Exibição", () => {
  it("formata reais no padrão brasileiro", () => {
    expect(formatarReais(8000)).toBe("R$ 80,00");
    expect(formatarReais(123456)).toBe("R$ 1.234,56");
    expect(formatarReais(5)).toBe("R$ 0,05");
  });

  it("preenche o campo de edição sem o R$", () => {
    expect(centavosParaTexto(8050)).toBe("80,50");
    expect(centavosParaTexto(5)).toBe("0,05");
  });

  it("formata a duração", () => {
    expect(formatarDuracao(45)).toBe("45min");
    expect(formatarDuracao(90)).toBe("1h30");
    expect(formatarDuracao(120)).toBe("2h");
    expect(formatarDuracao(65)).toBe("1h05");
  });
});

describe("Taxa do cartão em %", () => {
  it("converte o que a pessoa digita em centésimos, sem número quebrado", () => {
    expect(percentualParaCentesimos("2,99")).toBe(299);
    expect(percentualParaCentesimos("3")).toBe(300);
    expect(percentualParaCentesimos("5.25")).toBe(525);
    expect(percentualParaCentesimos("0,5")).toBe(50);
    expect(percentualParaCentesimos("4,1 %")).toBe(410);
    expect(percentualParaCentesimos("100")).toBe(10000);
  });
  it("recusa valores inválidos", () => {
    for (const t of ["", "abc", "-1", "100,01", "2,999", "1.000"]) expect(percentualParaCentesimos(t)).toBeNull();
  });
  it("mostra de volta com vírgula", () => {
    expect(centesimosParaTexto(299)).toBe("2,99");
    expect(centesimosParaTexto(50)).toBe("0,50");
  });
});
