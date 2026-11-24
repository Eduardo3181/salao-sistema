/**
 * Aviso para quem perdeu o acesso: a pessoa descobre só o nome do salão onde o acesso foi retirado.
 * Roda no banco de TESTE dentro de uma transação desfeita no final.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { novaConexao } from "./apoio/banco";

const { db, como, comoAdmin, deveFalhar, criarUsuario, criarSalao, colocarNaEquipe } = novaConexao();
const consulta = "select salao from public.acessos_retirados()";

let donoA = "", ana = "", bia = "", salaoA = "";

beforeAll(async () => {
  await db.connect();
  await db.query("begin");
  donoA = await criarUsuario();
  ana = await criarUsuario();
  bia = await criarUsuario();
  salaoA = await criarSalao(donoA, "Salão A");
  await colocarNaEquipe(salaoA, ana, "recepcao");
  await colocarNaEquipe(salaoA, bia, "profissional");
  await comoAdmin();
  await db.query("update public.usuarios_salao set ativo = false where salao_id = $1 and user_id = $2", [salaoA, ana]);
});

afterAll(async () => {
  await db.query("rollback");
  await db.end();
});

describe("Acesso retirado", () => {
  it("quem perdeu o acesso vê o nome do salão", async () => {
    await como(ana);
    expect((await db.query(consulta)).rows).toEqual([{ salao: "Salão A" }]);
  });

  it("quem tem acesso, ou nunca teve, não vê nada", async () => {
    for (const quem of [bia, donoA]) {
      await como(quem);
      expect((await db.query(consulta)).rows).toEqual([]);
    }
    const estranho = await criarUsuario();
    await como(estranho);
    expect((await db.query(consulta)).rows).toEqual([]);
  });

  it("quem não está logado não consegue usar", async () => {
    await como(null);
    await deveFalhar(consulta);
  });

  it("devolvido o acesso, o aviso some", async () => {
    await comoAdmin();
    await db.query("update public.usuarios_salao set ativo = true where salao_id = $1 and user_id = $2", [salaoA, ana]);
    await como(ana);
    expect((await db.query(consulta)).rows).toEqual([]);
  });
});
