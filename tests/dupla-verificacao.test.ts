/**
 * Dupla verificação (opcional): quem ligou só enxerga o salão depois de digitar o código.
 * O banco confere pelo "nível" do login (aal1 = só senha, aal2 = senha + código).
 * Roda no banco de TESTE dentro de uma transação desfeita no final.
 */
import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { novaConexao } from "./apoio/banco";

const { db, como, comoAdmin, deveFalhar, criarUsuario, criarSalao } = novaConexao();

let dono = "", semDupla = "";
let salao = "", outroSalao = "", cliente = "";

/** Age como o usuário com um nível de login: "aal1" (só senha) ou "aal2" (senha + código). */
async function comoNivel(userId: string, aal: "aal1" | "aal2") {
  await db.query("reset role");
  await db.query("select set_config('request.jwt.claims', $1, true)", [JSON.stringify({ sub: userId, role: "authenticated", aal })]);
  await db.query("set local role authenticated");
}

async function ligarDupla(userId: string, status: "verified" | "unverified" = "verified") {
  await comoAdmin();
  await db.query(
    "insert into auth.mfa_factors (id, user_id, friendly_name, factor_type, status, created_at, updated_at) values ($1, $2, $3, 'totp', $4, now(), now())",
    [randomUUID(), userId, `Celular ${randomUUID().slice(0, 4)}`, status],
  );
}

beforeAll(async () => {
  await db.connect();
  await db.query("begin");
  dono = await criarUsuario();
  semDupla = await criarUsuario();
  salao = await criarSalao(dono, "Salão com dupla");
  outroSalao = await criarSalao(semDupla, "Salão sem dupla");
  await comoAdmin();
  cliente = (await db.query("insert into public.clientes (salao_id, nome) values ($1, 'Maria Fictícia') returning id", [salao])).rows[0].id;
  await ligarDupla(dono);
});

afterAll(async () => {
  await db.query("rollback");
  await db.end();
});

describe("Dupla verificação", () => {
  it("só com a senha (aal1), quem ligou não vê nem mexe em nada do salão", async () => {
    await comoNivel(dono, "aal1");
    expect((await db.query("select * from public.clientes_do_salao($1)", [salao])).rows).toHaveLength(0);
    expect((await db.query("select * from public.saloes")).rows).toHaveLength(0);
    await deveFalhar("select public.exportar_clientes($1)", [salao]);
    await deveFalhar("select public.abrir_comanda($1, $2, null)", [salao, cliente]);
    await deveFalhar("select public.criar_salao('Salão escondido')");
  });

  it("sem informar o nível (login antigo), também conta como só senha", async () => {
    await como(dono);
    expect((await db.query("select * from public.clientes_do_salao($1)", [salao])).rows).toHaveLength(0);
  });

  it("depois do código (aal2), tudo volta ao normal", async () => {
    await comoNivel(dono, "aal2");
    expect((await db.query("select nome from public.clientes_do_salao($1)", [salao])).rows).toEqual([{ nome: "Maria Fictícia" }]);
    expect((await db.query("select nome from public.saloes")).rows).toEqual([{ nome: "Salão com dupla" }]);
    const lista = (await db.query("select public.exportar_clientes($1) as d", [salao])).rows[0].d;
    expect(lista).toHaveLength(1);
  });

  it("quem não ligou continua entrando só com a senha", async () => {
    await comoNivel(semDupla, "aal1");
    expect((await db.query("select nome from public.saloes")).rows).toEqual([{ nome: "Salão sem dupla" }]);
    // e continua sem ver o salão de quem tem a dupla verificação
    expect((await db.query("select * from public.clientes_do_salao($1)", [salao])).rows).toHaveLength(0);
    expect(outroSalao).toBeTruthy();
  });

  it("começar a ligar sem terminar (código nunca confirmado) não tranca a pessoa", async () => {
    await ligarDupla(semDupla, "unverified");
    await comoNivel(semDupla, "aal1");
    expect((await db.query("select nome from public.saloes")).rows).toEqual([{ nome: "Salão sem dupla" }]);
  });
});
