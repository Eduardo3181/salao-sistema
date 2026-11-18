/**
 * Exportar dados de clientes (LGPD e portabilidade):
 * - os dados de UM cliente, para entregar a ele;
 * - a lista completa de clientes do salão.
 * Só o dono; isolamento entre salões; cada exportação fica no histórico sem dados pessoais.
 * Roda no banco de TESTE dentro de uma transação desfeita no final.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { novaConexao } from "./apoio/banco";

const { db, como, comoAdmin, deveFalhar, criarUsuario, criarSalao, colocarNaEquipe } = novaConexao();

let donoA = "", donoB = "", recepcaoA = "";
let salaoA = "", salaoB = "";
let maria = "", joana = "", removida = "", deB = "";
const umCliente = "select public.exportar_dados_cliente($1, $2) as d";
const lista = "select public.exportar_clientes($1) as d";

beforeAll(async () => {
  await db.connect();
  await db.query("begin");
  donoA = await criarUsuario();
  donoB = await criarUsuario();
  recepcaoA = await criarUsuario();
  salaoA = await criarSalao(donoA, "Salão A");
  salaoB = await criarSalao(donoB, "Salão B");
  await colocarNaEquipe(salaoA, recepcaoA, "recepcao");

  await comoAdmin();
  const um = async (sql: string, p: unknown[]) => (await db.query(sql, p)).rows[0].id as string;
  maria = await um(
    "insert into public.clientes (salao_id, nome, telefone, nascimento, observacoes) values ($1, 'Maria Fictícia', '11999990000', '1990-05-10', 'Alergia a amônia') returning id",
    [salaoA],
  );
  joana = await um("insert into public.clientes (salao_id, nome, ativo) values ($1, 'Joana Fictícia', false) returning id", [salaoA]);
  removida = await um("insert into public.clientes (salao_id, nome) values ($1, 'Vai Ser Removida') returning id", [salaoA]);
  deB = await um("insert into public.clientes (salao_id, nome, telefone) values ($1, 'Cliente do B', '21988887777') returning id", [salaoB]);
  const ana = await um("insert into public.profissionais (salao_id, nome, tipo) values ($1, 'Ana Fictícia', 'profissional') returning id", [salaoA]);
  const cat = await um("insert into public.categorias_servico (salao_id, nome) values ($1, 'Cabelo') returning id", [salaoA]);
  const corte = await um(
    "insert into public.servicos (salao_id, categoria_id, nome, duracao_min, preco_centavos) values ($1, $2, 'Corte', 45, 10000) returning id",
    [salaoA, cat],
  );
  const amanha10 = (
    await db.query(
      "select ((((now() at time zone 'America/Sao_Paulo')::date + 1) + time '10:00') at time zone 'America/Sao_Paulo')::text as t",
    )
  ).rows[0].t;

  await como(donoA);
  await db.query("insert into public.consentimentos_whatsapp (salao_id, cliente_id, aceitou) values ($1, $2, true)", [salaoA, maria]);
  await db.query("select public.criar_agendamento($1, $2, $3::jsonb)", [
    salaoA,
    maria,
    JSON.stringify([{ servico_id: corte, profissional_id: ana, inicio: amanha10 }]),
  ]);
  const comanda = (await db.query("select public.abrir_comanda($1, $2, null) as id", [salaoA, maria])).rows[0].id;
  await db.query("select public.lancar_item_comanda($1, 'servico', $2, $3, 1, null, 0)", [comanda, corte, ana]);
  await db.query("select public.registrar_pagamento($1, 'pix', 10000, 1, null)", [comanda]);
  await db.query("select public.remover_dados_cliente($1, $2)", [salaoA, removida]);
});

afterAll(async () => {
  await db.query("rollback");
  await db.end();
});

const exportacoes = async () => {
  await comoAdmin();
  return (
    await db.query("select entidade_id, user_id, antes, depois from public.audit_log where salao_id = $1 and acao = 'exportar' order by id", [salaoA])
  ).rows;
};

describe("Exportar os dados de um cliente", () => {
  it("recepção, dono de outro salão e quem não está logado não conseguem", async () => {
    for (const quem of [recepcaoA, donoB, null]) {
      await como(quem);
      await deveFalhar(umCliente, [salaoA, maria]);
    }
    // Dono B passando o próprio salão com cliente do A: "não encontrado".
    await como(donoB);
    await deveFalhar(umCliente, [salaoB, maria]);
    expect(await exportacoes()).toHaveLength(0);
  });

  it("o dono recebe a ficha, os aceites, os horários, o consumo e os pagamentos", async () => {
    await como(donoA);
    const d = (await db.query(umCliente, [salaoA, maria])).rows[0].d;
    expect(d.cliente).toMatchObject({ nome: "Maria Fictícia", telefone: "11999990000", nascimento: "1990-05-10", observacoes: "Alergia a amônia", ativo: true });
    expect(d.aceites).toHaveLength(1);
    expect(d.aceites[0].aceitou).toBe(true);
    expect(d.horarios).toHaveLength(1);
    expect(d.horarios[0]).toMatchObject({ servico: "Corte", profissional: "Ana Fictícia", situacao: "agendado", valor: 10000 });
    expect(d.consumo).toHaveLength(1);
    expect(d.consumo[0]).toMatchObject({ item: "Corte", profissional: "Ana Fictícia", quantidade: 1, total: 10000, situacao: "fechada" });
    expect(d.pagamentos).toHaveLength(1);
    expect(d.pagamentos[0]).toMatchObject({ forma: "pix", valor: 10000 });
    // Nada interno do salão (comissões, taxas) no arquivo.
    const texto = JSON.stringify(d);
    expect(texto).not.toMatch(/comiss|taxa|snapshot/i);
  });

  it("a exportação fica no histórico, sem dados pessoais", async () => {
    const regs = await exportacoes();
    expect(regs).toHaveLength(1);
    expect(regs[0]).toMatchObject({ entidade_id: maria, user_id: donoA, antes: null, depois: null });
  });

  it("cliente que teve os dados apagados não tem o que exportar", async () => {
    await como(donoA);
    await deveFalhar(umCliente, [salaoA, removida]);
  });
});

describe("Baixar a lista completa de clientes", () => {
  it("recepção, dono de outro salão e quem não está logado não conseguem", async () => {
    for (const quem of [recepcaoA, donoB, null]) {
      await como(quem);
      await deveFalhar(lista, [salaoA]);
    }
  });

  it("o dono recebe todos os clientes dele (ativos e desativados), sem os removidos e sem os de outro salão", async () => {
    await como(donoA);
    const d = (await db.query(lista, [salaoA])).rows[0].d as { nome: string; ativo: boolean; whatsapp: boolean | null; ultima_visita: string | null }[];
    expect(d.map((c) => c.nome)).toEqual(["Joana Fictícia", "Maria Fictícia"]);
    const m = d.find((c) => c.nome === "Maria Fictícia")!;
    expect(m.whatsapp).toBe(true);
    expect(m.ultima_visita).not.toBeNull();
    expect(d.find((c) => c.nome === "Joana Fictícia")!.ativo).toBe(false);
    expect(JSON.stringify(d)).not.toContain("Cliente do B");

    await como(donoB);
    const b = (await db.query(lista, [salaoB])).rows[0].d as { nome: string }[];
    expect(b.map((c) => c.nome)).toEqual(["Cliente do B"]);
    expect(deB).toBeTruthy();
  });

  it("a exportação da lista fica no histórico só com a quantidade", async () => {
    const regs = await exportacoes();
    const daLista = regs.filter((r) => r.entidade_id === null);
    expect(daLista).toHaveLength(1);
    expect(daLista[0].depois).toEqual({ quantidade: 2 });
    expect(joana).toBeTruthy();
  });
});
