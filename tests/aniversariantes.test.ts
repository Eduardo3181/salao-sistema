/**
 * Aniversariantes do mês: isolamento, perfis (telefone só para dono e recepção) e regras de data.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { novaConexao } from "./apoio/banco";

const { db, como, comoAdmin, deveFalhar, criarUsuario, criarSalao, colocarNaEquipe } = novaConexao();

let donoA = "", donoB = "", recepcaoA = "", profissionalA = "", assistenteA = "";
let salaoA = "", salaoB = "";
const lista = "select nome, dia, telefone, aceitou_whatsapp from public.aniversariantes_do_mes($1, $2)";

beforeAll(async () => {
  await db.connect();
  await db.query("begin");
  donoA = await criarUsuario();
  donoB = await criarUsuario();
  recepcaoA = await criarUsuario();
  profissionalA = await criarUsuario();
  assistenteA = await criarUsuario();
  salaoA = await criarSalao(donoA, "Salão A");
  salaoB = await criarSalao(donoB, "Salão B");
  await colocarNaEquipe(salaoA, recepcaoA, "recepcao");
  await colocarNaEquipe(salaoA, profissionalA, "profissional");
  await comoAdmin();
  await db.query("insert into public.usuarios_salao (salao_id, user_id, perfil) values ($1, $2, 'assistente')", [salaoA, assistenteA]);

  const cliente = async (salao: string, nome: string, nascimento: string | null, telefone: string | null, ativo = true) =>
    (await db.query("insert into public.clientes (salao_id, nome, nascimento, telefone, ativo) values ($1, $2, $3, $4, $5) returning id", [salao, nome, nascimento, telefone, ativo])).rows[0].id;
  const maria = await cliente(salaoA, "Maria", "1990-11-20", "11987654321");
  await cliente(salaoA, "Ana", "1985-11-03", null);
  await cliente(salaoA, "Bia Inativa", "1992-11-05", null, false);
  await cliente(salaoA, "Carla Sem Data", null, null);
  await cliente(salaoA, "Dani Fevereiro", "2000-02-29", null);
  await cliente(salaoB, "Outra do B", "1990-11-10", "11911112222");
  await db.query("insert into public.consentimentos_whatsapp (salao_id, cliente_id, aceitou, registrado_por) values ($1, $2, true, $3)", [salaoA, maria, recepcaoA]);
});

afterAll(async () => {
  await db.query("rollback");
  await db.end();
});

describe("Aniversariantes do mês", () => {
  it("a recepção vê as do mês, em ordem de dia, com telefone e aceite; sem inativas e sem data", async () => {
    await como(recepcaoA);
    const { rows } = await db.query(lista, [salaoA, 11]);
    expect(rows).toEqual([
      { nome: "Ana", dia: 3, telefone: null, aceitou_whatsapp: null },
      { nome: "Maria", dia: 20, telefone: "11987654321", aceitou_whatsapp: true },
    ]);
  });

  it("a profissional vê os nomes, mas sem telefone e sem aceite", async () => {
    await como(profissionalA);
    const { rows } = await db.query(lista, [salaoA, 11]);
    expect(rows.map((r) => [r.nome, r.telefone, r.aceitou_whatsapp])).toEqual([
      ["Ana", null, null],
      ["Maria", null, null],
    ]);
  });

  it("a assistente não vê ninguém", async () => {
    await como(assistenteA);
    expect((await db.query(lista, [salaoA, 11])).rows).toEqual([]);
  });

  it("o Salão B não vê as do Salão A, só as dele", async () => {
    await como(donoB);
    expect((await db.query(lista, [salaoA, 11])).rows).toEqual([]);
    expect((await db.query(lista, [salaoB, 11])).rows.map((r) => r.nome)).toEqual(["Outra do B"]);
  });

  it("quem nasceu em 29/02 aparece em fevereiro, dia 29", async () => {
    await como(donoA);
    expect((await db.query(lista, [salaoA, 2])).rows.map((r) => [r.nome, r.dia])).toEqual([["Dani Fevereiro", 29]]);
  });

  it("mês inválido não devolve nada; visitante sem login não acessa", async () => {
    await como(donoA);
    expect((await db.query(lista, [salaoA, 13])).rows).toEqual([]);
    await como(null);
    await deveFalhar(lista, [salaoA, 11]);
  });
});
