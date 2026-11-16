import { describe, expect, it } from "vitest";
import { dataHoraBrasil, descreverAuditoria, type RegistroAuditoria } from "@/lib/salao";

const base: RegistroAuditoria = { id: 1, user_id: null, acao: "insert", entidade: "saloes", antes: null, depois: null, em: "" };

describe("Registro de atividades em português", () => {
  it("descreve a criação do salão", () => {
    expect(descreverAuditoria({ ...base, depois: { nome: "Salão A" } })).toBe('Salão criado: "Salão A"');
  });

  it("descreve a troca de nome", () => {
    expect(
      descreverAuditoria({ ...base, acao: "update", antes: { nome: "A" }, depois: { nome: "B" } }),
    ).toBe('Nome do salão alterado de "A" para "B"');
  });

  it("descreve a entrada de alguém na equipe com o perfil", () => {
    expect(
      descreverAuditoria({ ...base, entidade: "usuarios_salao", depois: { perfil: "recepcao" } }),
    ).toBe("Pessoa adicionada à equipe como Recepção");
  });
});

describe("Horário de Brasília", () => {
  it("mostra 15/01/2027 às 09:30 para 12:30 UTC", () => {
    expect(dataHoraBrasil("2027-01-15T12:30:00Z")).toBe("15/01/2027, 09:30");
  });
});
