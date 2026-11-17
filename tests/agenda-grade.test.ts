import { describe, expect, it } from "vitest";
import {
  dataPorExtenso,
  dataValida,
  diaDaSemana,
  distribuirLadoALado,
  faixaDaGrade,
  hojeBrasilia,
  horarioComFuso,
  minutosNoDia,
  periodoDoBloqueio,
  somarDias,
} from "@/lib/agenda";

describe("Datas no horário de Brasília", () => {
  it("hoje em Brasília (às 23h de Brasília ainda é o mesmo dia)", () => {
    expect(hojeBrasilia(new Date("2026-11-19T02:00:00Z"))).toBe("2026-11-18");
  });

  it("valida a data e soma dias, virando o mês e o ano", () => {
    expect(dataValida("2026-02-30")).toBe(false);
    expect(dataValida("2026-11-18")).toBe(true);
    expect(somarDias("2026-11-30", 1)).toBe("2026-12-01");
    expect(somarDias("2026-12-31", 1)).toBe("2027-01-01");
    expect(somarDias("2026-03-01", -1)).toBe("2026-02-28");
  });

  it("dia da semana e data por extenso", () => {
    expect(diaDaSemana("2026-11-18")).toBe(3); // quarta
    expect(dataPorExtenso("2026-11-18")).toBe("quarta-feira, 18 de novembro");
  });

  it("minutos no dia a partir de um horário salvo em UTC", () => {
    expect(minutosNoDia("2026-11-18T13:30:00+00:00", "2026-11-18")).toBe(10 * 60 + 30);
    expect(horarioComFuso("2026-11-18", 570)).toBe("2026-11-18T09:30:00-03:00");
  });
});

describe("Faixa da grade", () => {
  it("vai do menor 'abre' ao maior 'fecha'", () => {
    expect(faixaDaGrade([{ abre: 540, fecha: 1140 }, { abre: 780, fecha: 1140 }], [])).toEqual({ inicio: 540, fim: 1140 });
  });

  it("estica para caber horário marcado fora do expediente, em blocos de 30", () => {
    expect(faixaDaGrade([{ abre: 540, fecha: 1140 }], [{ inicio: 495, fim: 520 }, { inicio: 1150, fim: 1195 }])).toEqual({
      inicio: 480,
      fim: 1200,
    });
  });

  it("sem expediente nem horários: 08:00 às 20:00", () => {
    expect(faixaDaGrade([], [])).toEqual({ inicio: 480, fim: 1200 });
  });
});

describe("Encaixes lado a lado", () => {
  it("horários sem sobreposição ocupam a coluna inteira", () => {
    const r = distribuirLadoALado([
      { id: "a", inicio: 600, fim: 645 },
      { id: "b", inicio: 660, fim: 700 },
    ]);
    expect(r.get("a")).toEqual({ faixa: 0, faixas: 1 });
    expect(r.get("b")).toEqual({ faixa: 0, faixas: 1 });
  });

  it("dois horários que se cruzam ficam lado a lado", () => {
    const r = distribuirLadoALado([
      { id: "a", inicio: 600, fim: 645 },
      { id: "b", inicio: 615, fim: 655 },
      { id: "c", inicio: 700, fim: 730 },
    ]);
    expect(r.get("a")).toEqual({ faixa: 0, faixas: 2 });
    expect(r.get("b")).toEqual({ faixa: 1, faixas: 2 });
    expect(r.get("c")).toEqual({ faixa: 0, faixas: 1 });
  });

  it("reaproveita a faixa que já liberou dentro do mesmo grupo", () => {
    const r = distribuirLadoALado([
      { id: "longo", inicio: 600, fim: 720 },
      { id: "x", inicio: 600, fim: 630 },
      { id: "y", inicio: 640, fim: 670 },
    ]);
    expect(r.get("longo")!.faixas).toBe(2);
    expect(r.get("y")!.faixa).toBe(r.get("x")!.faixa);
  });
});

describe("Marcar horário", () => {
  it("serviços em sequência: cada um começa quando o anterior termina", async () => {
    const { horariosEmSequencia } = await import("@/lib/agenda");
    expect(horariosEmSequencia(600, [45, 40, 30])).toEqual([600, 645, 685]);
  });

  it("sugere o próximo horário redondo de 30 em 30 minutos", async () => {
    const { proximoHorarioRedondo } = await import("@/lib/agenda");
    expect(proximoHorarioRedondo(587)).toBe(600);
    expect(proximoHorarioRedondo(600)).toBe(600);
  });

  it("lê a hora digitada", async () => {
    const { lerHora } = await import("@/lib/agenda");
    expect(lerHora("09:30")).toBe(570);
    expect(lerHora("25:00")).toBeNull();
    expect(lerHora("9h")).toBeNull();
  });
});

describe("Período do bloqueio", () => {
  const base = { diaInteiro: true, de: "2026-12-24", ate: "2026-12-25", horaDe: "", horaAte: "" };

  it("dia inteiro vai da meia-noite do primeiro dia até a meia-noite depois do último", () => {
    expect(periodoDoBloqueio(base)).toEqual({ ok: true, inicio: "2026-12-24T00:00:00-03:00", fim: "2026-12-26T00:00:00-03:00" });
  });

  it("sem data final, vale só o dia escolhido", () => {
    expect(periodoDoBloqueio({ ...base, ate: "" })).toEqual({ ok: true, inicio: "2026-12-24T00:00:00-03:00", fim: "2026-12-25T00:00:00-03:00" });
  });

  it("recusa data final antes da inicial e mais de 62 dias", () => {
    expect(periodoDoBloqueio({ ...base, ate: "2026-12-23" }).ok).toBe(false);
    expect(periodoDoBloqueio({ ...base, ate: "2027-02-23" }).ok).toBe(true); // 62 dias
    expect(periodoDoBloqueio({ ...base, ate: "2027-02-24" }).ok).toBe(false); // 63 dias
  });

  it("algumas horas no mesmo dia", () => {
    const horas = { ...base, diaInteiro: false, horaDe: "12:00", horaAte: "13:30" };
    expect(periodoDoBloqueio(horas)).toEqual({ ok: true, inicio: "2026-12-24T12:00:00-03:00", fim: "2026-12-24T13:30:00-03:00" });
    expect(periodoDoBloqueio({ ...horas, horaAte: "12:00" }).ok).toBe(false);
    expect(periodoDoBloqueio({ ...horas, horaDe: "" }).ok).toBe(false);
  });

  it("recusa data inválida", () => {
    expect(periodoDoBloqueio({ ...base, de: "2026-02-30" }).ok).toBe(false);
  });
});
