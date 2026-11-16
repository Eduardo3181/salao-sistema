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

describe("Registro de atividades da equipe", () => {
  const equipe = { ...base, entidade: "usuarios_salao", acao: "update" };

  it("usa o nome da pessoa ao adicionar", () => {
    expect(
      descreverAuditoria({ ...base, entidade: "usuarios_salao", depois: { perfil: "profissional", nome: "Ana" } }),
    ).toBe("Ana adicionado(a) à equipe como Profissional");
  });

  it("descreve acesso retirado e devolvido", () => {
    expect(descreverAuditoria({ ...equipe, antes: { ativo: true, nome: "Ana" }, depois: { ativo: false, nome: "Ana" } })).toBe(
      "Acesso de Ana retirado",
    );
    expect(descreverAuditoria({ ...equipe, antes: { ativo: false, nome: "Ana" }, depois: { ativo: true, nome: "Ana" } })).toBe(
      "Acesso de Ana devolvido",
    );
  });

  it("descreve a troca da senha provisória", () => {
    expect(
      descreverAuditoria({ ...equipe, antes: { trocar_senha: true, nome: "Ana" }, depois: { trocar_senha: false, nome: "Ana" } }),
    ).toBe("Ana trocou a senha provisória");
  });
});

describe("Senha provisória", () => {
  it("tem 3 blocos fáceis de ler e muda a cada vez", async () => {
    const { gerarSenhaProvisoria } = await import("@/lib/senha");
    const a = gerarSenhaProvisoria();
    const b = gerarSenhaProvisoria();
    expect(a).toMatch(/^[a-zA-Z]{3}[2-9]-[a-zA-Z]{3}[2-9]-[a-zA-Z]{3}[2-9]$/);
    expect(a).not.toMatch(/[0O1lI]/);
    expect(a).not.toBe(b);
  });
});

describe("Registro do dono", () => {
  it("descreve a entrada do dono sem repetir o perfil", () => {
    expect(descreverAuditoria({ ...base, entidade: "usuarios_salao", depois: { perfil: "dono", nome: null } })).toBe(
      "Dono(a) do salão cadastrado(a)",
    );
  });
});

describe("Registro de serviços", () => {
  const serv = { ...base, entidade: "servicos" };
  it("descreve o serviço criado com duração e preço", () => {
    expect(
      descreverAuditoria({ ...serv, depois: { nome: "Corte", duracao_min: 45, preco_centavos: 8000 } }),
    ).toBe('Serviço criado: "Corte" (45min, R$ 80,00)');
  });
  it("descreve a mudança de preço", () => {
    expect(
      descreverAuditoria({
        ...serv,
        acao: "update",
        antes: { nome: "Corte", duracao_min: 45, preco_centavos: 8000, ativo: true },
        depois: { nome: "Corte", duracao_min: 45, preco_centavos: 9000, ativo: true },
      }),
    ).toBe('Serviço "Corte": preço de R$ 80,00 para R$ 90,00');
  });
  it("descreve serviço desativado e categoria criada", () => {
    expect(
      descreverAuditoria({ ...serv, acao: "update", antes: { nome: "Corte", ativo: true }, depois: { nome: "Corte", ativo: false } }),
    ).toBe('Serviço "Corte" desativado');
    expect(descreverAuditoria({ ...base, entidade: "categorias_servico", depois: { nome: "Cabelo" } })).toBe(
      'Categoria criada: "Cabelo"',
    );
  });
});

describe("Registro de quem atende", () => {
  const prof = { ...base, entidade: "profissionais" };
  it("descreve cadastro, troca de tipo e desativação", () => {
    expect(descreverAuditoria({ ...prof, depois: { nome: "Bia", tipo: "assistente" } })).toBe(
      "Bia cadastrado(a) como assistente",
    );
    expect(
      descreverAuditoria({
        ...prof,
        acao: "update",
        antes: { nome: "Bia", tipo: "assistente", ativo: true, user_id: null },
        depois: { nome: "Bia", tipo: "profissional", ativo: true, user_id: null },
      }),
    ).toBe("Bia: passou a profissional");
    expect(
      descreverAuditoria({ ...prof, acao: "update", antes: { nome: "Bia", ativo: true }, depois: { nome: "Bia", ativo: false } }),
    ).toBe("Bia desativado(a)");
  });
});

describe("Registro de clientes (sem dados pessoais guardados)", () => {
  const cli = { ...base, entidade: "clientes", entidade_id: "c1" };
  const nomes = new Map([["c1", "Maria"]]);
  it("usa o nome atual e lista os campos alterados", () => {
    expect(descreverAuditoria({ ...cli, depois: { ativo: true, campos_alterados: [] } }, nomes)).toBe("Cliente cadastrada: Maria");
    expect(
      descreverAuditoria(
        { ...cli, acao: "update", antes: { ativo: true }, depois: { ativo: true, campos_alterados: ["observacoes", "telefone"] } },
        nomes,
      ),
    ).toBe("Ficha de Maria alterada (observações, telefone)");
  });
  it("cliente apagada aparece como 'cliente removida'", () => {
    expect(descreverAuditoria({ ...cli, depois: { ativo: true } }, new Map())).toBe("Cliente cadastrada: cliente removida");
  });
  it("descreve a chave de permissão", () => {
    expect(
      descreverAuditoria({ ...base, entidade: "configuracao_salao", depois: { profissionais_editam_clientes: true } }),
    ).toBe("Configuração: profissionais agora podem cadastrar e alterar clientes");
  });
});
