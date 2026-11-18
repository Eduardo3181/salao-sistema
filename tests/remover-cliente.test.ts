/**
 * Excluir pessoa (LGPD), parte 1: apagar os dados pessoais de um cliente.
 * Dados pessoais somem para sempre; atendimentos e valores continuam; só o dono; isolamento entre salões.
 * Roda no banco de TESTE dentro de uma transação desfeita no final.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { novaConexao } from "./apoio/banco";

const { db, como, comoAdmin, deveFalhar, criarUsuario, criarSalao, colocarNaEquipe } = novaConexao();

let donoA = "", donoB = "", recepcaoA = "";
let salaoA = "", salaoB = "";
let cliente = "", comanda = "";
const remover = "select public.remover_dados_cliente($1, $2)";

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
  cliente = (
    await db.query(
      "insert into public.clientes (salao_id, nome, telefone, nascimento, observacoes) values ($1, 'Maria Fictícia', '11999990000', '1990-05-10', 'Alergia a amônia') returning id",
      [salaoA],
    )
  ).rows[0].id;
  await como(donoA);
  comanda = (await db.query("select public.abrir_comanda($1, $2, null) as id", [salaoA, cliente])).rows[0].id;
});

afterAll(async () => {
  await db.query("rollback");
  await db.end();
});

describe("Apagar dados de um cliente", () => {
  it("recepção, dono de outro salão e quem não está logado não conseguem", async () => {
    for (const quem of [recepcaoA, donoB, null]) {
      await como(quem);
      await deveFalhar(remover, [salaoA, cliente]);
    }
    // Dono de outro salão também não consegue passando o próprio salão.
    await como(donoB);
    await deveFalhar(remover, [salaoB, cliente]);
    await comoAdmin();
    const c = (await db.query("select nome, removido_em from public.clientes where id = $1", [cliente])).rows[0];
    expect(c.nome).toBe("Maria Fictícia");
    expect(c.removido_em).toBeNull();
  });

  it("o dono apaga: dados pessoais somem, a comanda continua", async () => {
    await como(donoA);
    await db.query(remover, [salaoA, cliente]);
    await comoAdmin();
    const c = (await db.query("select nome, telefone, nascimento, observacoes, ativo, removido_em from public.clientes where id = $1", [cliente])).rows[0];
    expect(c).toMatchObject({ nome: "Cliente removido", telefone: null, nascimento: null, observacoes: null, ativo: false });
    expect(c.removido_em).not.toBeNull();
    const cm = (await db.query("select cliente_id from public.comandas where id = $1", [comanda])).rows[0];
    expect(cm.cliente_id).toBe(cliente);
  });

  it("depois de apagado, ninguém altera nem reativa a ficha, e não dá para apagar de novo", async () => {
    await como(donoA);
    await deveFalhar("update public.clientes set nome = 'Maria de volta' where id = $1", [cliente]);
    await deveFalhar("update public.clientes set ativo = true where id = $1", [cliente]);
    await deveFalhar(remover, [salaoA, cliente]);
    const lista = (await db.query("select nome, telefone, removido_em from public.clientes_do_salao($1, null, true, $2)", [salaoA, cliente])).rows[0];
    expect(lista.nome).toBe("Cliente removido");
    expect(lista.telefone).toBeNull();
    expect(lista.removido_em).not.toBeNull();
  });

  it("o histórico registra a remoção sem guardar o nome nem o telefone", async () => {
    await comoAdmin();
    const r = (
      await db.query("select antes, depois from public.audit_log where entidade = 'clientes' and entidade_id = $1 order by id desc limit 1", [cliente])
    ).rows[0];
    expect(r.depois.campos_alterados).toContain("removido_em");
    const texto = JSON.stringify(r);
    expect(texto).not.toContain("Maria");
    expect(texto).not.toContain("11999990000");
  });
});
