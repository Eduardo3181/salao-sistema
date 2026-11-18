import { describe, expect, it } from "vitest";
import { atalhosDePeriodo, diasNoPeriodo, lerPeriodo, limitesDoPeriodo } from "@/lib/periodos";

const atalho = (hoje: string, id: string) => atalhosDePeriodo(hoje).find((a) => a.id === id)!.periodo;

describe("Períodos", () => {
  it("semana vai de segunda a domingo", () => {
    expect(atalho("2026-11-17", "semana")).toEqual({ de: "2026-11-16", ate: "2026-11-22" }); // terça
    expect(atalho("2026-11-22", "semana")).toEqual({ de: "2026-11-16", ate: "2026-11-22" }); // domingo
    expect(atalho("2026-11-16", "semana")).toEqual({ de: "2026-11-16", ate: "2026-11-22" }); // segunda
  });

  it("quinzena: 1 a 15 ou 16 até o fim do mês (fevereiro e ano bissexto)", () => {
    expect(atalho("2026-11-15", "quinzena")).toEqual({ de: "2026-11-01", ate: "2026-11-15" });
    expect(atalho("2026-11-16", "quinzena")).toEqual({ de: "2026-11-16", ate: "2026-11-30" });
    expect(atalho("2026-02-20", "quinzena")).toEqual({ de: "2026-02-16", ate: "2026-02-28" });
    expect(atalho("2028-02-20", "quinzena")).toEqual({ de: "2028-02-16", ate: "2028-02-29" });
  });

  it("mês e mês passado (virada de ano)", () => {
    expect(atalho("2026-12-05", "mes")).toEqual({ de: "2026-12-01", ate: "2026-12-31" });
    expect(atalho("2027-01-10", "mes_passado")).toEqual({ de: "2026-12-01", ate: "2026-12-31" });
  });

  it("lê o período digitado e recusa datas erradas", () => {
    expect(lerPeriodo("2026-11-01", "2026-11-10", "2026-11-17")).toEqual({ periodo: { de: "2026-11-01", ate: "2026-11-10" }, erro: null });
    expect(lerPeriodo(undefined, undefined, "2026-11-17").periodo).toEqual({ de: "2026-11-01", ate: "2026-11-30" });
    expect(lerPeriodo("2026-11-10", "2026-11-01", "2026-11-17").erro).toMatch(/antes/);
    expect(lerPeriodo("2026-02-30", "2026-03-01", "2026-11-17").erro).toMatch(/inválida/);
    expect(lerPeriodo("2025-01-01", "2026-11-01", "2026-11-17").erro).toMatch(/400/);
  });

  it("limites incluem o último dia inteiro, no horário de Brasília", () => {
    expect(limitesDoPeriodo({ de: "2026-11-01", ate: "2026-11-15" })).toEqual({ de: "2026-11-01T00:00:00-03:00", ate: "2026-11-16T00:00:00-03:00" });
    expect(diasNoPeriodo({ de: "2026-11-01", ate: "2026-11-15" })).toBe(15);
  });
});
