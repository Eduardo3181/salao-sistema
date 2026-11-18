/**
 * Cálculo das comissões de uma comanda inteira (módulo puro): serviços, produtos,
 * assistentes, rateio da taxa do cartão e salão sem configuração.
 */
import { describe, expect, it } from "vitest";
import { ErroComissao } from "@/lib/comissoes";
import { calcularComanda, type ItemParaCalculo } from "@/lib/comissoes-comanda";
import { CONFIG_VAZIA, type LinhaConfigComissao } from "@/lib/comissoes-config";

const config: LinhaConfigComissao = { ...CONFIG_VAZIA, percentual_padrao: 5000 };
const servico = (id: string, prof: string, total: number, assistentes: string[] = []): ItemParaCalculo => ({
  id,
  tipo: "servico",
  servicoId: "corte",
  profissionalId: prof,
  totalCentavos: total,
  assistentes,
});
const produto = (id: string, prof: string | null, total: number): ItemParaCalculo => ({
  id,
  tipo: "produto",
  servicoId: null,
  profissionalId: prof,
  totalCentavos: total,
  assistentes: [],
});

describe("Comissões da comanda", () => {
  it("serviço com o padrão do salão; produto sem comissão quando desligado", () => {
    const r = calcularComanda({ itens: [servico("i1", "ana", 10000), produto("i2", "ana", 4590)], taxaTotalCentavos: 0, config, regras: [] });
    expect(r.lancamentos).toEqual([{ item_id: "i1", profissional_id: "ana", papel: "profissional", valor_centavos: 5000 }]);
    expect(r.itens.map((i) => i.snapshot.origem)).toEqual(["padrao_salao", "sem_comissao"]);
    expect(r.itens).toHaveLength(2); // todo item ganha snapshot, mesmo sem comissão
  });

  it("produto com comissão ligada, só se alguém vendeu", () => {
    const c = { ...config, comissao_produtos: true, percentual_produtos: 1000 };
    const r = calcularComanda({ itens: [produto("p1", "bia", 4590), produto("p2", null, 4590)], taxaTotalCentavos: 0, config: c, regras: [] });
    expect(r.lancamentos).toEqual([{ item_id: "p1", profissional_id: "bia", papel: "profissional", valor_centavos: 459 }]);
  });

  it("exceção por serviço vence o padrão e fica no snapshot", () => {
    const r = calcularComanda({
      itens: [servico("i1", "ana", 20000)],
      taxaTotalCentavos: 0,
      config,
      regras: [{ profissional_id: null, servico_id: "corte", percentual: 3000 }],
    });
    expect(r.lancamentos[0].valor_centavos).toBe(6000);
    expect(r.itens[0].snapshot).toMatchObject({ percentual: 3000, origem: "servico" });
  });

  it("taxa do cartão rateada entre os itens e descontada quando configurado", () => {
    const c = { ...config, descontar_taxa_cartao: true };
    // taxa de R$ 3,00 sobre itens de R$ 100 e R$ 50: R$ 2,00 e R$ 1,00
    const r = calcularComanda({ itens: [servico("i1", "ana", 10000), servico("i2", "bia", 5000)], taxaTotalCentavos: 300, config: c, regras: [] });
    expect(r.itens.map((i) => i.snapshot.taxaCentavos)).toEqual([200, 100]);
    expect(r.lancamentos.map((l) => l.valor_centavos)).toEqual([4900, 2450]);
  });

  it("assistente (modelo 2): sai da comissão do profissional", () => {
    const c: LinhaConfigComissao = { ...config, assistente_base: "percentual_comissao", assistente_valor: 2000, assistente_quem_paga: "profissional" };
    const r = calcularComanda({ itens: [servico("i1", "ana", 20000, ["carla"])], taxaTotalCentavos: 0, config: c, regras: [] });
    expect(r.lancamentos).toEqual([
      { item_id: "i1", profissional_id: "ana", papel: "profissional", valor_centavos: 8000 },
      { item_id: "i1", profissional_id: "carla", papel: "assistente", valor_centavos: 2000 },
    ]);
    expect(r.assistentes).toEqual([{ item_id: "i1", assistente_id: "carla", valor_centavos: 2000 }]);
  });

  it("conta conferida à mão (17/11/2026): Coloração R$ 200 + Corte R$ 80 no débito a 1,99%", () => {
    // Taxa: 1,99% de R$ 280 = R$ 5,572 → R$ 5,57 (557). Rateio: R$ 3,98 na coloração e R$ 1,59 no corte.
    // Coloração: (200,00 − 3,98) × 50% = 98,01; assistente 20% de 98,01 = 19,602 → 19,60; Ana 98,01 − 19,60 = 78,41.
    // Corte: (80,00 − 1,59) × 50% = 39,205 → 39,21 (meio centavo sobe).
    const c: LinhaConfigComissao = {
      ...config,
      descontar_taxa_cartao: true,
      assistente_base: "percentual_comissao",
      assistente_valor: 2000,
      assistente_quem_paga: "profissional",
    };
    const taxa = Math.floor((28000 * 199 + 5000) / 10000); // como o banco calcula a taxa do pagamento
    expect(taxa).toBe(557);
    const r = calcularComanda({
      itens: [servico("color", "ana", 20000, ["carla"]), servico("corte", "ana", 8000)],
      taxaTotalCentavos: taxa,
      config: c,
      regras: [],
    });
    expect(r.itens.map((i) => i.snapshot.taxaCentavos)).toEqual([398, 159]);
    expect(r.lancamentos.map((l) => [l.item_id, l.profissional_id, l.valor_centavos])).toEqual([
      ["color", "ana", 7841],
      ["color", "carla", 1960],
      ["corte", "ana", 3921],
    ]);
  });

  it("assistente sem regra configurada: o cálculo para com aviso claro", () => {
    expect(() => calcularComanda({ itens: [servico("i1", "ana", 20000, ["carla"])], taxaTotalCentavos: 0, config, regras: [] })).toThrow(ErroComissao);
  });

  it("salão sem configuração: nenhuma comissão, mas os snapshots são gravados", () => {
    const r = calcularComanda({ itens: [servico("i1", "ana", 10000)], taxaTotalCentavos: 0, config: CONFIG_VAZIA, regras: [] });
    expect(r.lancamentos).toEqual([]);
    expect(r.itens[0].snapshot.percentual).toBe(0);
  });
});
