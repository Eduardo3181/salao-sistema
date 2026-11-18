/**
 * Excluir pessoa (LGPD), parte 2: apagar o acesso de quem saiu da equipe.
 * Só o dono; só de quem já está sem acesso; o nome continua no cadastro de quem atende
 * (comissões e comprovantes); avisa se a pessoa ainda faz parte de outro salão; isolamento entre salões.
 * Roda no banco de TESTE dentro de uma transação desfeita no final.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { novaConexao } from "./apoio/banco";

const { db, como, comoAdmin, deveFalhar, criarUsuario, criarSalao, colocarNaEquipe } = novaConexao();

let donoA = "", donoB = "", recepcaoA = "", anaUser = "";
let salaoA = "", salaoB = "";
let ana = "", membroAna = "", membroRecepcao = "", membroDono = "";
const remover = "select public.remover_membro($1) as r";
const membro = async (salao: string, user: string) =>
  (await db.query("select id from public.usuarios_salao where salao_id = $1 and user_id = $2", [salao, user])).rows[0]?.id as string | undefined;

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
  ana = (await db.query("insert into public.profissionais (salao_id, nome, tipo, user_id) values ($1, 'Ana Fictícia', 'profissional', $2) returning id", [salaoA, anaUser])).rows[0].id;
  membroAna = (await membro(salaoA, anaUser))!;
  membroRecepcao = (await membro(salaoA, recepcaoA))!;
  membroDono = (await membro(salaoA, donoA))!;
});

afterAll(async () => {
  await db.query("rollback");
  await db.end();
});

describe("Apagar o acesso de alguém da equipe", () => {
  it("quem ainda tem acesso não pode ser apagado (primeiro tira o acesso)", async () => {
    await como(donoA);
    await deveFalhar(remover, [membroAna]);
  });

  it("recepção, dono de outro salão e quem não está logado não conseguem; o dono não se apaga", async () => {
    await como(donoA);
    await db.query("select public.definir_acesso_membro($1, false)", [membroAna]);
    for (const quem of [recepcaoA, donoB, anaUser, null]) {
      await como(quem);
      await deveFalhar(remover, [membroAna]);
    }
    await como(donoA);
    await deveFalhar(remover, [membroDono]);
    await comoAdmin();
    expect(await membro(salaoA, anaUser)).toBe(membroAna);
  });

  it("o dono apaga: sai da equipe, o nome continua em quem atende, sem ligação ao login", async () => {
    await como(donoA);
    const r = (await db.query(remover, [membroAna])).rows[0].r;
    expect(r).toEqual({ user_id: anaUser, em_outro_salao: false });
    await comoAdmin();
    expect(await membro(salaoA, anaUser)).toBeUndefined();
    const p = (await db.query("select nome, user_id from public.profissionais where id = $1", [ana])).rows[0];
    expect(p).toEqual({ nome: "Ana Fictícia", user_id: null });
    const log = (await db.query("select acao from public.audit_log where entidade = 'usuarios_salao' and entidade_id = $1 order by id desc limit 1", [membroAna])).rows[0];
    expect(log.acao).toBe("delete");
  });

  it("avisa quando a pessoa ainda faz parte de outro salão (a conta de login não pode ser apagada)", async () => {
    await colocarNaEquipe(salaoB, recepcaoA, "recepcao");
    await como(donoA);
    await db.query("select public.definir_acesso_membro($1, false)", [membroRecepcao]);
    const r = (await db.query(remover, [membroRecepcao])).rows[0].r;
    expect(r).toEqual({ user_id: recepcaoA, em_outro_salao: true });
    await comoAdmin();
    expect(await membro(salaoB, recepcaoA)).toBeDefined();
  });
});
