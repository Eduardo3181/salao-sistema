import { describe, expect, it } from "vitest";
import { limitesDoMes, nomeDoMes, situacaoDespesa, somarMeses } from "@/lib/despesas";

const hoje = "2026-11-18";
const conta = (vencimento: string, pago_em: string | null = null, cancelado_em: string | null = null) => ({ vencimento, pago_em, cancelado_em });

describe("Situação da despesa", () => {
  it("cancelada e paga vencem qualquer data", () => {
    expect(situacaoDespesa(conta("2026-01-01", null, "2026-01-02T10:00:00Z"), hoje)).toBe("cancelada");
    expect(situacaoDespesa(conta("2026-01-01", "2026-01-05"), hoje)).toBe("paga");
  });
  it("atrasada, vence hoje e a pagar", () => {
    expect(situacaoDespesa(conta("2026-11-17"), hoje)).toBe("atrasada");
    expect(situacaoDespesa(conta("2026-11-18"), hoje)).toBe("vence_hoje");
    expect(situacaoDespesa(conta("2026-11-19"), hoje)).toBe("a_pagar");
  });
});

describe("Meses", () => {
  it("limites do mês, inclusive fevereiro de ano bissexto; mês inválido é recusado", () => {
    expect(limitesDoMes("2026-11")).toEqual({ de: "2026-11-01", ate: "2026-11-30" });
    expect(limitesDoMes("2028-02")).toEqual({ de: "2028-02-01", ate: "2028-02-29" });
    expect(limitesDoMes("2026-13")).toBeNull();
    expect(limitesDoMes("abc")).toBeNull();
  });
  it("anterior e seguinte atravessam o ano; nome em português", () => {
    expect(somarMeses("2026-01", -1)).toBe("2025-12");
    expect(somarMeses("2026-12", 1)).toBe("2027-01");
    expect(nomeDoMes("2026-03")).toBe("março de 2026");
  });
});
