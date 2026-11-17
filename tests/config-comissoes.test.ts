/**
 * Configuração de comissões: só o dono vê e altera; isolamento entre salões; limites e auditoria.
 * Roda no banco de TESTE dentro de uma transação desfeita no final.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { novaConexao } from "./apoio/banco";

const { db, como, comoAdmin, deveFalhar, criarUsuario, criarSalao, colocarNaEquipe } = novaConexao();

let donoA = "", donoB = "", recepcaoA = "", anaUser = "";
let salaoA = "", salaoB = "";
let ana = "", dani = "", corte = "", anaB = "";

const salvarConfig =
  "insert into public.configuracao_comissao (salao_id, percentual_padrao, descontar_taxa_cartao, assistente_base, assistente_valor, assistente_quem_paga) values ($1, $2, $3, $4, $5, $6)";
const regra = "insert into public.regras_comissao (salao_id, profissional_id, servico_id, percentual) values ($1, $2, $3, $4) returning id";

beforeAll(async () => {
  await db.connect();
  await db.query("begin");
  donoA = await criarUsuario();
  donoB = await criarUsuario();
  recepcaoA = await criarUsuario();
  anaUser = await criarUsuario();
  salaoA = await criarSalao(donoA, "Salão A");
  salaoB = await criarSalao(donoB, "Salão B");
  await colocarNaEquipe(salaoA, recepcaoA, "recepcao");
  await colocarNaEquipe(salaoA, anaUser, "profissional");
  await comoAdmin();
  const prof = async (salao: string, nome: string, tipo: string) =>
    (await db.query("insert into public.profissionais (salao_id, nome, tipo) values ($1, $2, $3) returning id", [salao, nome, tipo])).rows[0].id;
  ana = await prof(salaoA, "Ana", "profissional");
  dani = await prof(salaoA, "Dani", "assistente");
  anaB = await prof(salaoB, "Ana do B", "profissional");
  const cat = (await db.query("insert into public.categorias_servico (salao_id, nome) values ($1, 'Cabelo') returning id", [salaoA])).rows[0].id;
  corte = (await db.query("insert into public.servicos (salao_id, categoria_id, nome, duracao_min, preco_centavos) values ($1, $2, 'Corte', 45, 8000) returning id", [salaoA, cat])).rows[0].id;
});

afterAll(async () => {
  await db.query("rollback");
  await db.end();
});

describe("Configuração do salão", () => {
  it("o dono salva o padrão, a taxa e a regra da assistente (modelo 2)", async () => {
    await como(donoA);
    await db.query(salvarConfig, [salaoA, 5000, true, "percentual_comissao", 2000, "profissional"]);
    const { rows } = await db.query("select percentual_padrao, assistente_valor::int as v from public.configuracao_comissao");
    expect(rows).toEqual([{ percentual_padrao: 5000, v: 2000 }]);
  });

  it("recepção e profissional não veem nem alteram", async () => {
    for (const quem of [recepcaoA, anaUser]) {
      await como(quem);
      expect((await db.query("select salao_id from public.configuracao_comissao")).rows).toEqual([]);
      expect((await db.query("update public.configuracao_comissao set percentual_padrao = 10000")).rowCount).toBe(0);
    }
  });

  it("não aceita combinações inválidas", async () => {
    await como(donoB);
    await deveFalhar(salvarConfig, [salaoB, 10001, false, null, null, null]); // acima de 100%
    await deveFalhar(salvarConfig, [salaoB, 5000, false, "percentual_comissao", 20000, "profissional"]); // assistente > 100%
    await deveFalhar(salvarConfig, [salaoB, 5000, false, "valor_fixo", null, "profissional"]); // regra pela metade
    await deveFalhar(salvarConfig, [salaoB, 5000, false, "valor_fixo", 1000, "dividido"]); // dividido sem a %
  });
});

describe("Regras (exceções)", () => {
  it("o dono cria % por profissional, por serviço e por profissional + serviço", async () => {
    await como(donoA);
    await db.query(regra, [salaoA, ana, null, 4500]);
    await db.query(regra, [salaoA, null, corte, 4000]);
    await db.query(regra, [salaoA, ana, corte, 3500]);
    expect((await db.query("select count(*)::int as n from public.regras_comissao")).rows[0].n).toBe(3);
  });

  it("não deixa duplicar a mesma combinação, nem regra vazia, nem regra para assistente", async () => {
    await como(donoA);
    await deveFalhar(regra, [salaoA, ana, null, 5000]);
    await deveFalhar(regra, [salaoA, null, null, 5000]);
    await deveFalhar(regra, [salaoA, dani, null, 5000]);
  });

  it("recepção e profissional não veem nem criam regras", async () => {
    for (const quem of [recepcaoA, anaUser]) {
      await como(quem);
      expect((await db.query("select id from public.regras_comissao")).rows).toEqual([]);
      await deveFalhar(regra, [salaoA, null, corte, 9000]);
    }
  });
});

describe("Isolamento entre salões", () => {
  it("o Salão B não vê, não altera e não aponta regra para profissional/serviço do Salão A", async () => {
    await como(donoB);
    expect((await db.query("select salao_id from public.configuracao_comissao")).rows).toEqual([]);
    expect((await db.query("select id from public.regras_comissao")).rows).toEqual([]);
    expect((await db.query("update public.regras_comissao set percentual = 0")).rowCount).toBe(0);
    await deveFalhar(regra, [salaoA, anaB, null, 5000]);
    await deveFalhar(regra, [salaoB, ana, null, 5000]);
    await deveFalhar(regra, [salaoB, null, corte, 5000]);
  });

  it("visitante sem login não vê nada", async () => {
    await como(null);
    await deveFalhar("select salao_id from public.configuracao_comissao");
  });
});

describe("Auditoria", () => {
  it("registra a mudança de % com antes e depois", async () => {
    await como(donoA);
    await db.query("update public.regras_comissao set percentual = 5500 where profissional_id = $1 and servico_id is null", [ana]);
    await comoAdmin();
    const { rows } = await db.query(
      "select (antes->>'percentual')::int as antes, (depois->>'percentual')::int as depois from public.audit_log where entidade = 'regras_comissao' and acao = 'update'",
    );
    expect(rows).toEqual([{ antes: 4500, depois: 5500 }]);
  });
});
