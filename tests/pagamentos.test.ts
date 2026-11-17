/**
 * Pagamentos da comanda (Etapa 4, parte 2b): valores em centavos, taxa do cartão, troco,
 * fechamento automático, permissões e isolamento entre salões.
 * Roda no banco de TESTE dentro de uma transação desfeita no final.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { novaConexao } from "./apoio/banco";

const { db, como, comoAdmin, deveFalhar, criarUsuario, criarSalao, colocarNaEquipe } = novaConexao();

let donoA = "", donoB = "", recepcaoA = "", anaUser = "", biaUser = "";
let salaoA = "", salaoB = "";
let ana = "", bia = "";
let corte = "", shampoo = "";
let cliente = "";

const pagar = "select public.registrar_pagamento($1, $2, $3, $4, $5) as r";
const abrir = "select public.abrir_comanda($1, $2, null) as id";
const lancar = "select public.lancar_item_comanda($1, $2, $3, $4, 1, null, 0)";
const situacao = async (id: string) => {
  await comoAdmin();
  return (await db.query("select situacao from public.comandas where id = $1", [id])).rows[0].situacao;
};
const novaComanda = async (quem: string, itens: [string, string, string | null][]) => {
  await como(quem);
  const id = (await db.query(abrir, [salaoA, cliente])).rows[0].id;
  for (const [tipo, ref, prof] of itens) await db.query(lancar, [id, tipo, ref, prof]);
  return id as string;
};

beforeAll(async () => {
  await db.connect();
  await db.query("begin");
  donoA = await criarUsuario();
  donoB = await criarUsuario();
  recepcaoA = await criarUsuario();
  anaUser = await criarUsuario();
  biaUser = await criarUsuario();
  salaoA = await criarSalao(donoA, "Salão A");
  salaoB = await criarSalao(donoB, "Salão B");
  await colocarNaEquipe(salaoA, recepcaoA, "recepcao");
  await colocarNaEquipe(salaoA, anaUser, "profissional");
  await colocarNaEquipe(salaoA, biaUser, "profissional");
  await comoAdmin();
  const prof = async (nome: string, user: string) =>
    (await db.query("insert into public.profissionais (salao_id, nome, tipo, user_id) values ($1, $2, 'profissional', $3) returning id", [salaoA, nome, user])).rows[0].id;
  ana = await prof("Ana", anaUser);
  bia = await prof("Bia", biaUser);
  const cat = (await db.query("insert into public.categorias_servico (salao_id, nome) values ($1, 'Cabelo') returning id", [salaoA])).rows[0].id;
  corte = (await db.query("insert into public.servicos (salao_id, categoria_id, nome, duracao_min, preco_centavos) values ($1, $2, 'Corte', 45, 10000) returning id", [salaoA, cat])).rows[0].id;
  shampoo = (await db.query("insert into public.produtos (salao_id, nome, preco_centavos) values ($1, 'Shampoo', 4590) returning id", [salaoA])).rows[0].id;
  cliente = (await db.query("insert into public.clientes (salao_id, nome) values ($1, 'Maria') returning id", [salaoA])).rows[0].id;

  // Taxas do Salão A: débito 1,99%; crédito à vista 3,49%; 3x 5,25%
  await como(donoA);
  const taxa = "insert into public.taxas_cartao (salao_id, forma, parcelas, taxa_centesimos) values ($1, $2, $3, $4)";
  await db.query(taxa, [salaoA, "debito", 1, 199]);
  await db.query(taxa, [salaoA, "credito_vista", 1, 349]);
  await db.query(taxa, [salaoA, "credito_parcelado", 3, 525]);
});

afterAll(async () => {
  await db.query("rollback");
  await db.end();
});

describe("Taxas do cartão", () => {
  it("só o dono configura; recepção vê; profissional e outro salão não veem", async () => {
    await como(recepcaoA);
    expect((await db.query("select forma from public.taxas_cartao")).rows.length).toBe(3);
    await deveFalhar("insert into public.taxas_cartao (salao_id, forma, parcelas, taxa_centesimos) values ($1, 'pix', 1, 0)", [salaoA]);
    for (const quem of [anaUser, donoB]) {
      await como(quem);
      expect((await db.query("select forma from public.taxas_cartao")).rows).toEqual([]);
    }
  });

  it("não aceita parcelas erradas nem taxa acima de 100%", async () => {
    await como(donoA);
    const taxa = "insert into public.taxas_cartao (salao_id, forma, parcelas, taxa_centesimos) values ($1, $2, $3, $4)";
    await deveFalhar(taxa, [salaoA, "debito", 2, 100]);
    await deveFalhar(taxa, [salaoA, "credito_parcelado", 1, 100]);
    await deveFalhar(taxa, [salaoA, "credito_parcelado", 25, 100]);
    await deveFalhar(taxa, [salaoA, "credito_parcelado", 4, 10001]);
  });
});

describe("Receber e fechar", () => {
  it("pagamento em duas formas: fecha sozinha só quando completa o total", async () => {
    const id = await novaComanda(recepcaoA, [["servico", corte, ana], ["produto", shampoo, null]]); // 145,90
    await como(recepcaoA);
    let r = (await db.query(pagar, [id, "pix", 5000, 1, null])).rows[0].r;
    expect(r).toEqual({ fechou: false, falta_centavos: 9590 });
    expect(await situacao(id)).toBe("aberta");
    await como(recepcaoA);
    r = (await db.query(pagar, [id, "credito_parcelado", 9590, 3, null])).rows[0].r;
    expect(r).toEqual({ fechou: true, falta_centavos: 0 });
    expect(await situacao(id)).toBe("fechada");
  });

  it("guarda a taxa do dia, arredondada ao centavo (3x de R$ 95,90 a 5,25% = R$ 5,03)", async () => {
    await comoAdmin();
    const { rows } = await db.query("select taxa_centesimos, taxa_centavos::int as t from public.pagamentos where forma = 'credito_parcelado'");
    expect(rows).toEqual([{ taxa_centesimos: 525, t: 503 }]);
  });

  it("forma sem taxa configurada fica com taxa zero", async () => {
    await comoAdmin();
    const { rows } = await db.query("select taxa_centavos::int as t from public.pagamentos where forma = 'pix'");
    expect(rows).toEqual([{ t: 0 }]);
  });

  it("dinheiro calcula o troco; não aceita valor maior do que falta", async () => {
    const id = await novaComanda(recepcaoA, [["produto", shampoo, null]]); // 45,90
    await como(recepcaoA);
    await deveFalhar(pagar, [id, "dinheiro", 5000, 1, null]);
    await db.query(pagar, [id, "dinheiro", 4590, 1, 5000]);
    await comoAdmin();
    const { rows } = await db.query("select troco_centavos::int as troco from public.pagamentos where comanda_id = $1", [id]);
    expect(rows).toEqual([{ troco: 410 }]);
    expect(await situacao(id)).toBe("fechada");
  });

  it("não aceita: troco fora do dinheiro, entregue menor que o valor, parcelas erradas, comanda vazia", async () => {
    const id = await novaComanda(recepcaoA, [["produto", shampoo, null]]);
    await como(recepcaoA);
    await deveFalhar(pagar, [id, "pix", 1000, 1, 2000]);
    await deveFalhar(pagar, [id, "dinheiro", 1000, 1, 500]);
    await deveFalhar(pagar, [id, "credito_parcelado", 1000, 1, null]);
    await deveFalhar(pagar, [id, "debito", 1000, 2, null]);
    const vazia = (await db.query(abrir, [salaoA, cliente])).rows[0].id;
    await deveFalhar(pagar, [vazia, "pix", 100, 1, null]);
  });

  it("comanda fechada não aceita mais pagamento nem itens", async () => {
    await comoAdmin();
    const id = (await db.query("select id from public.comandas where situacao = 'fechada' limit 1")).rows[0].id;
    await como(recepcaoA);
    await deveFalhar(pagar, [id, "pix", 100, 1, null]);
    await deveFalhar(lancar, [id, "produto", shampoo, null]);
  });

  it("comanda com total zero (tudo com desconto) fecha pelo botão fechar", async () => {
    await como(recepcaoA);
    const id = (await db.query(abrir, [salaoA, cliente])).rows[0].id;
    await db.query("select public.lancar_item_comanda($1, 'servico', $2, $3, 1, 10000, 10000)", [id, corte, ana]);
    await db.query("select public.fechar_comanda($1)", [id]);
    expect(await situacao(id)).toBe("fechada");
  });
});

describe("Quem recebe", () => {
  it("a profissional não recebe com a chave desligada; com a chave ligada, recebe na comanda toda dela", async () => {
    const id = await novaComanda(anaUser, [["servico", corte, null]]);
    await como(anaUser);
    await deveFalhar(pagar, [id, "pix", 10000, 1, null]);
    await como(donoA);
    await db.query(
      "insert into public.configuracao_salao (salao_id, profissionais_recebem_pagamento) values ($1, true) on conflict (salao_id) do update set profissionais_recebem_pagamento = true",
      [salaoA],
    );
    await como(anaUser);
    expect((await db.query(pagar, [id, "pix", 10000, 1, null])).rows[0].r.fechou).toBe(true);
  });

  it("mesmo com a chave ligada, a profissional não recebe em comanda com item de outra", async () => {
    const id = await novaComanda(recepcaoA, [["servico", corte, ana], ["servico", corte, bia]]);
    await como(anaUser);
    await deveFalhar(pagar, [id, "pix", 100, 1, null]);
    expect((await db.query("select id from public.pagamentos where comanda_id = $1", [id])).rows).toEqual([]);
    await como(donoA);
    await db.query("update public.configuracao_salao set profissionais_recebem_pagamento = false where salao_id = $1", [salaoA]);
  });

  it("ninguém grava pagamento direto na tabela", async () => {
    await comoAdmin();
    const id = (await db.query("select id from public.comandas where situacao = 'aberta' limit 1")).rows[0].id;
    await como(donoA);
    await deveFalhar("insert into public.pagamentos (salao_id, comanda_id, forma, valor_centavos) values ($1, $2, 'pix', 100)", [salaoA, id]);
    await deveFalhar("update public.pagamentos set valor_centavos = 1");
  });
});

describe("Remover pagamento e cancelar", () => {
  it("remover pagamento: só recepção/dono, com motivo; volta a faltar o valor", async () => {
    const id = await novaComanda(recepcaoA, [["servico", corte, ana]]);
    await como(recepcaoA);
    await db.query(pagar, [id, "debito", 4000, 1, null]);
    const pag = (await db.query("select id from public.pagamentos where comanda_id = $1", [id])).rows[0].id;
    await deveFalhar("select public.cancelar_comanda($1, 'desistiu')", [id]); // tem pagamento
    await como(anaUser);
    await deveFalhar("select public.remover_pagamento($1, 'errado')", [pag]);
    await como(recepcaoA);
    await deveFalhar("select public.remover_pagamento($1, '')", [pag]);
    await db.query("select public.remover_pagamento($1, 'Passou no cartão errado')", [pag]);
    expect((await db.query("select public.resumo_comanda($1) as r", [id])).rows[0].r.falta_centavos).toBe(10000);
    await db.query("select public.cancelar_comanda($1, 'Cliente desistiu')", [id]);
    expect(await situacao(id)).toBe("cancelada");
  });
});

describe("Isolamento entre salões", () => {
  it("o Salão B não vê pagamentos nem recebe em comanda do Salão A", async () => {
    await comoAdmin();
    const id = (await db.query("select id from public.comandas where salao_id = $1 and situacao = 'aberta' limit 1", [salaoA])).rows[0].id;
    await como(donoB);
    expect((await db.query("select id from public.pagamentos")).rows).toEqual([]);
    await deveFalhar(pagar, [id, "pix", 100, 1, null]);
    await deveFalhar("select public.fechar_comanda($1)", [id]);
  });

  it("visitante sem login não vê pagamentos", async () => {
    await como(null);
    await deveFalhar("select id from public.pagamentos");
  });
});
