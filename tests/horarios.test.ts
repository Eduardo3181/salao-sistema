import { describe, expect, it } from "vitest";
import { lerHorariosDoFormulario, OPCOES_HORA, resumirHorarios } from "@/lib/horarios";

const formulario = (campos: Record<string, string>) => {
  const f = new FormData();
  for (const [k, v] of Object.entries(campos)) f.set(k, v);
  return f;
};

describe("Grade de 30 minutos", () => {
  it("vai das 05:00 às 23:30, de meia em meia hora", () => {
    expect(OPCOES_HORA[0]).toBe("05:00");
    expect(OPCOES_HORA[1]).toBe("05:30");
    expect(OPCOES_HORA.at(-1)).toBe("23:30");
    expect(OPCOES_HORA).not.toContain("09:15");
  });
});

describe("Formulário de horários", () => {
  it("lê só os dias marcados como abertos", () => {
    const r = lerHorariosDoFormulario(
      formulario({ aberto_2: "on", abre_2: "09:00", fecha_2: "19:00", abre_3: "09:00", fecha_3: "19:00" }),
    );
    expect(r).toEqual({ dias: [{ dia_semana: 2, abre: "09:00", fecha: "19:00" }] });
  });

  it("recusa fechar antes de abrir, com o nome do dia", () => {
    const r = lerHorariosDoFormulario(formulario({ aberto_6: "on", abre_6: "14:00", fecha_6: "08:00" }));
    expect(r).toEqual({ erro: "Sábado: o horário de fechar tem que ser depois do de abrir." });
  });

  it("recusa horário fora da grade", () => {
    const r = lerHorariosDoFormulario(formulario({ aberto_1: "on", abre_1: "09:15", fecha_1: "18:00" }));
    expect("erro" in r).toBe(true);
  });
});

describe("Resumo", () => {
  it("agrupa dias seguidos com o mesmo horário", () => {
    expect(
      resumirHorarios([
        { dia_semana: 2, abre: "09:00:00", fecha: "19:00:00" },
        { dia_semana: 3, abre: "09:00:00", fecha: "19:00:00" },
        { dia_semana: 4, abre: "09:00:00", fecha: "19:00:00" },
        { dia_semana: 5, abre: "09:00:00", fecha: "19:00:00" },
        { dia_semana: 6, abre: "08:00:00", fecha: "14:00:00" },
      ]),
    ).toBe("Ter a Sex 09:00–19:00 · Sáb 08:00–14:00");
    expect(resumirHorarios([])).toBe("Fechado todos os dias");
  });
});
