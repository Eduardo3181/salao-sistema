/**
 * Motor de comissões (src/lib/comissoes.ts): função pura, sem banco.
 * Exemplos das decisões da dona em docs/04-comissoes-e-assistentes.md e docs/02-decisoes.md.
 */
import { describe, expect, it } from "vitest";
import {
  calcularComissaoItem,
  ErroComissao,
  porcentagem,
  ratearProporcional,
  ratearTaxaEntreItens,
  resolverPercentual,
  type EntradaItem,
  type RegraAssistente,
} from "@/lib/comissoes";

const item = (e: Partial<EntradaItem>): EntradaItem => ({
  valorCentavos: 20000,
  taxaCentavos: 0,
  percentual: 5000,
  descontarTaxa: false,
  assistentes: [],
  regraAssistente: null,
  ...e,
});
const modelo2: RegraAssistente = { base: "percentual_comissao", valor: 2000, quemPaga: "profissional" };

describe("Porcentagem e rateio (sem número quebrado)", () => {
  it("arredonda ao centavo mais próximo, meio centavo sobe", () => {
    expect(porcentagem(20000, 5000)).toBe(10000);
    expect(porcentagem(999, 5000)).toBe(500); // 4,995 -> 5,00
    expect(porcentagem(997, 5000)).toBe(499); // 4,985 -> 4,99 (meio centavo de 4,985 sobe para 4,99)
    expect(porcentagem(1, 4999)).toBe(0);
    expect(porcentagem(0, 5000)).toBe(0);
    expect(porcentagem(100000000, 10000)).toBe(100000000);
  });

  it("rateio proporcional nunca perde nem cria centavo", () => {
    expect(ratearProporcional(1000, [1, 1, 1])).toEqual([334, 333, 333]);
    expect(ratearProporcional(100, [8000, 4590])).toEqual([64, 36]);
    expect(ratearProporcional(0, [5, 5])).toEqual([0, 0]);
    expect(ratearProporcional(7, [0, 0])).toEqual([0, 0]);
    for (const [total, pesos] of [
      [503, [8000, 4590, 1]],
      [1, [3, 3, 3]],
      [99999, [123, 456, 789, 1011]],
      [100000000, [100000000, 99999999]],
    ] as [number, number[]][]) {
      expect(ratearProporcional(total, pesos).reduce((a, b) => a + b, 0)).toBe(total);
    }
  });

  it("taxa rateada entre itens proporcional ao valor (e nunca maior que o item)", () => {
    expect(ratearTaxaEntreItens(503, [8000, 1590])).toEqual([420, 83]);
    expect(ratearTaxaEntreItens(10, [5, 0])).toEqual([5, 0]);
  });
});

describe("Qual porcentagem vale (a mais específica vence)", () => {
  const regras = {
    padraoSalao: 4000,
    porProfissional: { ana: 5000, bia: 4500 },
    porServico: { coloracao: 3000 },
    porProfissionalServico: { "ana:coloracao": 3500 },
  };
  it("profissional + serviço > serviço > profissional > padrão do salão", () => {
    expect(resolverPercentual(regras, "ana", "coloracao")).toEqual({ percentual: 3500, origem: "profissional_servico" });
    expect(resolverPercentual(regras, "bia", "coloracao")).toEqual({ percentual: 3000, origem: "servico" });
    expect(resolverPercentual(regras, "ana", "corte")).toEqual({ percentual: 5000, origem: "profissional" });
    expect(resolverPercentual(regras, "carla", "corte")).toEqual({ percentual: 4000, origem: "padrao_salao" });
  });
  it("zero na exceção vale (serviço sem comissão)", () => {
    expect(resolverPercentual({ ...regras, porServico: { cortesia: 0 } }, "ana", "cortesia").percentual).toBe(0);
  });
});

describe("Comissão da profissional sem assistente", () => {
  it("50% de R$ 200 = R$ 100", () => {
    const r = calcularComissaoItem(item({}));
    expect([r.baseCentavos, r.comissaoBrutaCentavos, r.comissaoProfissionalCentavos]).toEqual([20000, 10000, 10000]);
    expect(r.assistentes).toEqual([]);
  });

  it("taxa do cartão: se o salão escolheu descontar, a comissão é sobre o valor menos a taxa", () => {
    const com = calcularComissaoItem(item({ taxaCentavos: 698, descontarTaxa: true })); // 3,49% de 200
    expect([com.baseCentavos, com.taxaDescontadaCentavos, com.comissaoProfissionalCentavos]).toEqual([19302, 698, 9651]);
    const sem = calcularComissaoItem(item({ taxaCentavos: 698, descontarTaxa: false }));
    expect([sem.taxaDescontadaCentavos, sem.comissaoProfissionalCentavos]).toEqual([0, 10000]);
  });

  it("item com desconto: a comissão é sobre o valor cobrado no item", () => {
    expect(calcularComissaoItem(item({ valorCentavos: 7000 })).comissaoProfissionalCentavos).toBe(3500);
  });

  it("serviço sem comissão (0%) e item de valor zero", () => {
    expect(calcularComissaoItem(item({ percentual: 0 })).comissaoProfissionalCentavos).toBe(0);
    expect(calcularComissaoItem(item({ valorCentavos: 0 })).comissaoProfissionalCentavos).toBe(0);
  });
});

describe("Assistentes (modelos de docs/04)", () => {
  it("modelo 2 (exemplo do documento): R$ 200, 50%, assistente com 20% da comissão -> profissional R$ 80, assistente R$ 20", () => {
    const r = calcularComissaoItem(item({ assistentes: ["dani"], regraAssistente: modelo2 }));
    expect(r.comissaoBrutaCentavos).toBe(10000);
    expect(r.comissaoProfissionalCentavos).toBe(8000);
    expect(r.assistentes).toEqual([{ id: "dani", valorCentavos: 2000 }]);
    expect([r.repasseProfissionalCentavos, r.repasseSalaoCentavos]).toEqual([2000, 0]);
  });

  it("modelo 3: o salão paga a assistente por fora (profissional fica com tudo)", () => {
    const r = calcularComissaoItem(item({ assistentes: ["dani"], regraAssistente: { base: "percentual_servico", valor: 1000, quemPaga: "salao" } }));
    expect(r.comissaoProfissionalCentavos).toBe(10000);
    expect(r.assistentes).toEqual([{ id: "dani", valorCentavos: 2000 }]);
    expect([r.repasseProfissionalCentavos, r.repasseSalaoCentavos]).toEqual([0, 2000]);
  });

  it("modelo 4: valor fixo por serviço (R$ 15), saindo da profissional", () => {
    const r = calcularComissaoItem(item({ assistentes: ["dani"], regraAssistente: { base: "valor_fixo", valor: 1500, quemPaga: "profissional" } }));
    expect(r.comissaoProfissionalCentavos).toBe(8500);
    expect(r.assistentes[0].valorCentavos).toBe(1500);
  });

  it("dividido: 30% da parte da assistente sai da profissional, o resto o salão paga", () => {
    const r = calcularComissaoItem(
      item({ assistentes: ["dani"], regraAssistente: { base: "valor_fixo", valor: 2000, quemPaga: "dividido", percentualDaProfissional: 3000 } }),
    );
    expect([r.repasseProfissionalCentavos, r.repasseSalaoCentavos, r.comissaoProfissionalCentavos]).toEqual([600, 1400, 9400]);
  });

  it("duas assistentes: a parte é calculada uma vez e dividida igualmente", () => {
    const r = calcularComissaoItem(item({ assistentes: ["dani", "eva"], regraAssistente: modelo2 }));
    expect(r.assistentes).toEqual([
      { id: "dani", valorCentavos: 1000 },
      { id: "eva", valorCentavos: 1000 },
    ]);
    expect(r.comissaoProfissionalCentavos).toBe(8000);
  });

  it("sobra de centavo na divisão volta para quem paga (aqui, a profissional)", () => {
    // parte das assistentes = R$ 10,00 entre 3 -> R$ 3,33 cada; R$ 0,01 fica com a profissional
    const r = calcularComissaoItem(item({ assistentes: ["a", "b", "c"], regraAssistente: { base: "valor_fixo", valor: 1000, quemPaga: "profissional" } }));
    expect(r.assistentes.map((a) => a.valorCentavos)).toEqual([333, 333, 333]);
    expect(r.repasseProfissionalCentavos).toBe(999);
    expect(r.comissaoProfissionalCentavos).toBe(10000 - 999);
  });

  it("taxa descontada vale para profissional e assistente (proporcional)", () => {
    const r = calcularComissaoItem(item({ taxaCentavos: 698, descontarTaxa: true, assistentes: ["dani"], regraAssistente: modelo2 }));
    // comissão bruta 96,51; assistente 20% = 19,30; profissional 77,21
    expect([r.comissaoBrutaCentavos, r.assistentes[0].valorCentavos, r.comissaoProfissionalCentavos]).toEqual([9651, 1930, 7721]);
  });

  it("a mesma assistente marcada duas vezes conta uma vez só", () => {
    expect(calcularComissaoItem(item({ assistentes: ["dani", "dani"], regraAssistente: modelo2 })).assistentes).toHaveLength(1);
  });

  it("a soma de tudo nunca passa do valor do item", () => {
    for (const valor of [1, 99, 1000, 12345, 20000, 99999999]) {
      for (const pct of [0, 1, 3333, 5000, 10000]) {
        const r = calcularComissaoItem(item({ valorCentavos: valor, percentual: pct, assistentes: ["a", "b", "c"], regraAssistente: modelo2 }));
        const soma = r.comissaoProfissionalCentavos + r.assistentes.reduce((s, a) => s + a.valorCentavos, 0) - r.repasseSalaoCentavos;
        expect(soma).toBeLessThanOrEqual(valor);
        expect(r.comissaoProfissionalCentavos).toBeGreaterThanOrEqual(0);
      }
    }
  });
});

describe("Bloqueios (combinações inválidas)", () => {
  it("parte da assistente maior que a comissão da profissional é barrada", () => {
    expect(() =>
      calcularComissaoItem(item({ percentual: 1000, assistentes: ["dani"], regraAssistente: { base: "valor_fixo", valor: 5000, quemPaga: "profissional" } })),
    ).toThrow(ErroComissao);
  });

  it("assistente no serviço sem regra configurada é barrada", () => {
    expect(() => calcularComissaoItem(item({ assistentes: ["dani"], regraAssistente: null }))).toThrow(ErroComissao);
  });

  it("valores inválidos são barrados", () => {
    expect(() => calcularComissaoItem(item({ percentual: 10001 }))).toThrow(ErroComissao);
    expect(() => calcularComissaoItem(item({ valorCentavos: -1 }))).toThrow(ErroComissao);
    expect(() => calcularComissaoItem(item({ valorCentavos: 10.5 }))).toThrow(ErroComissao);
    expect(() => calcularComissaoItem(item({ taxaCentavos: 30000 }))).toThrow(ErroComissao);
    expect(() =>
      calcularComissaoItem(item({ assistentes: ["d"], regraAssistente: { base: "percentual_comissao", valor: 10001, quemPaga: "profissional" } })),
    ).toThrow(ErroComissao);
    expect(() =>
      calcularComissaoItem(item({ assistentes: ["d"], regraAssistente: { base: "valor_fixo", valor: 100, quemPaga: "dividido", percentualDaProfissional: 20000 } })),
    ).toThrow(ErroComissao);
  });
});

describe("Configuração salva -> formato do motor", () => {
  it("monta as regras por nível e a regra da assistente", async () => {
    const { montarRegras, montarRegraAssistente, CONFIG_VAZIA } = await import("@/lib/comissoes-config");
    const regras = montarRegras({ ...CONFIG_VAZIA, percentual_padrao: 4000 }, [
      { profissional_id: "ana", servico_id: null, percentual: 5000 },
      { profissional_id: null, servico_id: "corte", percentual: 4500 },
      { profissional_id: "ana", servico_id: "corte", percentual: 3500 },
    ]);
    expect(resolverPercentual(regras, "ana", "corte").percentual).toBe(3500);
    expect(resolverPercentual(regras, "bia", "corte").percentual).toBe(4500);
    expect(resolverPercentual(regras, "ana", "escova").percentual).toBe(5000);
    expect(resolverPercentual(regras, "bia", "escova").percentual).toBe(4000);
    expect(montarRegraAssistente(CONFIG_VAZIA)).toBeNull();
    expect(
      montarRegraAssistente({ ...CONFIG_VAZIA, assistente_base: "valor_fixo", assistente_valor: 1500, assistente_quem_paga: "profissional" }),
    ).toEqual({ base: "valor_fixo", valor: 1500, quemPaga: "profissional", percentualDaProfissional: undefined });
  });
});
