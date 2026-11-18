/**
 * Monta os documentos para baixar a partir dos dados das telas (módulo puro, testado).
 */
import { NOME_FORMA, type FormaPagamento } from "@/lib/comandas";
import { NOME_FORMA_DESPESA, NOME_SITUACAO_DESPESA, situacaoDespesa, type FormaDespesa } from "@/lib/despesas";
import { dataBr, n, r, reaisTexto, t, type Celula, type Documento } from "./documento";

const soma = (xs: (number | string)[]) => xs.reduce<number>((s, x) => s + Number(x), 0);

/** "Gerado em 18/11/2026 às 14:05 (horário de Brasília)" */
export function rodapeGerado(agora: Date = new Date()): string {
  const f = new Intl.DateTimeFormat("pt-BR", {
    timeZone: "America/Sao_Paulo",
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(agora);
  const v = (k: string) => f.find((p) => p.type === k)?.value ?? "";
  return `Gerado em ${v("day")}/${v("month")}/${v("year")} às ${v("hour")}:${v("minute")} (horário de Brasília)`;
}

// ---------------------------------------------------------------------------
// Relatório do período
// ---------------------------------------------------------------------------
export type DadosRelatorio = {
  resultado: { entradas: number; taxas_cartao: number; comissoes_pagas: number; vales: number; despesas: number; resultado: number };
  por_forma: { forma: FormaPagamento; total: number; quantidade: number; taxas: number }[];
  por_profissional: { nome: string; servicos: number; produtos: number; total: number }[];
  por_item: { tipo: "servico" | "produto"; nome: string; quantidade: number; total: number }[];
  por_categoria: { nome: string; total: number; quantidade: number }[];
  descontos_comanda: number;
  comandas_fechadas: number;
  comissoes_a_pagar: number;
};

export function documentoRelatorio(d: DadosRelatorio, salao: string, de: string, ate: string, rodape: string): Documento {
  const res = d.resultado;
  return {
    titulo: "Relatório do período",
    salao,
    periodo: `${dataBr(de)} a ${dataBr(ate)}`,
    rodape,
    secoes: [
      {
        titulo: "Resultado (dinheiro que entrou e saiu)",
        nota: Number(d.comissoes_a_pagar) > 0 ? `Comissões deste período ainda não pagas (fora do resultado): ${reais(d.comissoes_a_pagar)}.` : undefined,
        colunas: ["Item", "Valor"],
        linhas: [
          [t("Entrou (pagamentos das comandas)"), r(res.entradas)],
          [t("- Taxas do cartão"), r(res.taxas_cartao)],
          [t("- Comissões pagas"), r(res.comissoes_pagas)],
          [t("- Vales dados"), r(res.vales)],
          [t("- Despesas pagas"), r(res.despesas)],
        ],
        total: [t("Resultado"), r(res.resultado)],
      },
      {
        titulo: "Recebido por forma de pagamento",
        colunas: ["Forma", "Pagamentos", "Taxas", "Total"],
        linhas: d.por_forma.map((f) => [t(NOME_FORMA[f.forma] ?? f.forma), n(f.quantidade), r(f.taxas), r(f.total)]),
        total: d.por_forma.length ? [t("Total"), n(soma(d.por_forma.map((f) => f.quantidade))), r(soma(d.por_forma.map((f) => f.taxas))), r(soma(d.por_forma.map((f) => f.total)))] : undefined,
      },
      {
        titulo: "Vendas por profissional",
        nota: `Comandas fechadas no período: ${Number(d.comandas_fechadas)}. Valor de cada item; descontos no total das comandas: ${reais(d.descontos_comanda)}.`,
        colunas: ["Profissional", "Serviços", "Produtos", "Total"],
        linhas: d.por_profissional.map((p) => [t(p.nome), r(p.servicos), r(p.produtos), r(p.total)]),
        total: d.por_profissional.length
          ? [t("Total"), r(soma(d.por_profissional.map((p) => p.servicos))), r(soma(d.por_profissional.map((p) => p.produtos))), r(soma(d.por_profissional.map((p) => p.total)))]
          : undefined,
      },
      {
        titulo: "Vendas por serviço e produto",
        colunas: ["Item", "Tipo", "Quantidade", "Total"],
        linhas: d.por_item.map((i) => [t(i.nome), t(i.tipo === "servico" ? "Serviço" : "Produto"), n(i.quantidade), r(i.total)]),
      },
      {
        titulo: "Despesas pagas por categoria",
        colunas: ["Categoria", "Contas", "Total"],
        linhas: d.por_categoria.map((c) => [t(c.nome), n(c.quantidade), r(c.total)]),
        total: d.por_categoria.length ? [t("Total"), n(soma(d.por_categoria.map((c) => c.quantidade))), r(soma(d.por_categoria.map((c) => c.total)))] : undefined,
      },
    ],
  };
}

// ---------------------------------------------------------------------------
// Extrato de comissões
// ---------------------------------------------------------------------------
export type LinhaExtrato = {
  criado_em: string;
  estorno: boolean;
  papel: "profissional" | "assistente";
  item_nome: string;
  cliente_nome: string | null;
  valor_item_centavos: number | null;
  percentual: number | null;
  taxa_centavos: number | null;
  parte_assistente_centavos: number | null;
  valor_centavos: number;
  pago_em: string | null;
};

export function documentoExtrato(linhas: LinhaExtrato[], pessoa: string, salao: string, de: string, ate: string, rodape: string): Documento {
  const pct = (c: number | null) => (c === null ? "" : `${Math.floor(c / 100)}${c % 100 ? "," + String(c % 100).padStart(2, "0") : ""}%`);
  const comCliente = linhas.some((l) => l.cliente_nome);
  return {
    titulo: `Extrato de comissões - ${pessoa}`,
    salao,
    periodo: `${dataBr(de)} a ${dataBr(ate)}`,
    rodape,
    secoes: [
      {
        titulo: "Lançamentos",
        nota: "Estorno = comanda reaberta (entra na data da reabertura, como ajuste).",
        colunas: ["Data", "Serviço ou produto", ...(comCliente ? ["Cliente"] : []), "Valor do item", "%", "Taxa", "Parte do assistente", "Situação", "Comissão"],
        linhas: linhas.map((l) => {
          const linha: Celula[] = [
            t(dataHora(l.criado_em)),
            t(l.item_nome + (l.estorno ? " (estorno)" : "") + (l.papel === "assistente" ? " - como assistente" : "")),
            ...(comCliente ? [t(l.cliente_nome)] : []),
            l.valor_item_centavos === null ? t("") : r(l.valor_item_centavos),
            t(l.papel === "profissional" ? pct(l.percentual) : ""),
            l.taxa_centavos ? r(l.taxa_centavos) : t(""),
            l.parte_assistente_centavos ? r(l.parte_assistente_centavos) : t(""),
            t(l.pago_em ? `Pago em ${dataBr(l.pago_em)}` : "A pagar"),
            r(l.valor_centavos),
          ];
          return linha;
        }),
        total: [t("Total"), ...Array(comCliente ? 7 : 6).fill(t("")), r(soma(linhas.map((l) => l.valor_centavos)))],
      },
    ],
  };
}

// ---------------------------------------------------------------------------
// Despesas do mês
// ---------------------------------------------------------------------------
export type LinhaDespesa = {
  descricao: string;
  categoria: string;
  valor_centavos: number;
  vencimento: string;
  pago_em: string | null;
  forma: FormaDespesa | null;
  cancelado_em: string | null;
  motivo_cancelamento: string | null;
};

export function documentoDespesas(itens: LinhaDespesa[], salao: string, nomeMes: string, hoje: string, rodape: string): Documento {
  const validas = itens.filter((d) => !d.cancelado_em);
  const pagas = validas.filter((d) => d.pago_em);
  return {
    titulo: `Despesas - ${nomeMes}`,
    salao,
    periodo: nomeMes,
    rodape,
    secoes: [
      {
        titulo: "Contas do mês",
        nota: `Total ${reais(soma(validas.map((d) => d.valor_centavos)))} · pago ${reais(soma(pagas.map((d) => d.valor_centavos)))} · falta pagar ${reais(soma(validas.filter((d) => !d.pago_em).map((d) => d.valor_centavos)))}. Canceladas não entram no total.`,
        colunas: ["Descrição", "Categoria", "Vencimento", "Situação", "Pago em", "Forma", "Valor"],
        linhas: itens.map((d) => [
          t(d.descricao + (d.cancelado_em ? ` (cancelada: ${d.motivo_cancelamento ?? ""})` : "")),
          t(d.categoria),
          t(dataBr(d.vencimento)),
          t(NOME_SITUACAO_DESPESA[situacaoDespesa(d, hoje)]),
          t(d.pago_em ? dataBr(d.pago_em) : ""),
          t(d.forma ? NOME_FORMA_DESPESA[d.forma].replace(" (sai do caixa)", "") : ""),
          r(d.valor_centavos),
        ]),
        total: [t("Total (sem canceladas)"), t(""), t(""), t(""), t(""), t(""), r(soma(validas.map((d) => d.valor_centavos)))],
      },
    ],
  };
}

// ---------------------------------------------------------------------------
// Caixa do dia
// ---------------------------------------------------------------------------
export type DadosCaixa = {
  data: string;
  troco_inicial: number;
  entradas_por_forma: Partial<Record<FormaPagamento, number>>;
  dinheiro_recebido: number;
  reforcos: number;
  retiradas: number;
  comissoes_dinheiro: number;
  vales_dinheiro: number;
  despesas_dinheiro: number;
  esperado_dinheiro: number;
  caixa: null | {
    situacao: "aberto" | "fechado";
    fechado_em: string | null;
    contado_centavos: number | null;
    esperado_centavos: number | null;
    motivo_diferenca: string | null;
    conferido_pix: boolean;
    conferido_cartao: boolean;
  };
  movimentos: { tipo: "retirada" | "reforco"; valor_centavos: number; motivo: string; criado_em: string; cancelado_em: string | null }[];
};

const FORMAS: FormaPagamento[] = ["dinheiro", "pix", "debito", "credito_vista", "credito_parcelado"];

export function documentoCaixa(c: DadosCaixa, salao: string, rodape: string): Documento {
  const situacao = !c.caixa ? "Não aberto" : c.caixa.situacao === "aberto" ? "Aberto" : `Fechado em ${dataHora(c.caixa.fechado_em!)}`;
  const secoes: Documento["secoes"] = [
    {
      titulo: "Entradas das comandas",
      colunas: ["Forma", "Total"],
      linhas: FORMAS.map((f) => [t(NOME_FORMA[f]), r(c.entradas_por_forma[f] ?? 0)]),
      total: [t("Total recebido"), r(soma(FORMAS.map((f) => c.entradas_por_forma[f] ?? 0)))],
    },
    {
      titulo: "Dinheiro na gaveta",
      colunas: ["Item", "Valor"],
      linhas: [
        [t("Troco inicial"), r(c.troco_inicial)],
        [t("+ Recebido em dinheiro"), r(c.dinheiro_recebido)],
        [t("+ Reforços"), r(c.reforcos)],
        [t("- Retiradas"), r(c.retiradas)],
        [t("- Comissões pagas em dinheiro"), r(c.comissoes_dinheiro)],
        [t("- Vales dados em dinheiro"), r(c.vales_dinheiro)],
        [t("- Despesas pagas em dinheiro"), r(c.despesas_dinheiro)],
      ],
      total: [t("Deve ter na gaveta"), r(c.esperado_dinheiro)],
    },
  ];
  if (c.movimentos.length)
    secoes.push({
      titulo: "Retiradas e reforços",
      colunas: ["Hora", "Tipo", "Motivo", "Valor"],
      linhas: c.movimentos.map((m) => [
        t(dataHora(m.criado_em)),
        t((m.tipo === "retirada" ? "Retirada" : "Reforço") + (m.cancelado_em ? " (cancelado)" : "")),
        t(m.motivo),
        r(m.valor_centavos),
      ]),
    });
  if (c.caixa?.situacao === "fechado")
    secoes.push({
      titulo: "Fechamento",
      nota: c.caixa.motivo_diferenca ? `Motivo da diferença: ${c.caixa.motivo_diferenca}` : undefined,
      colunas: ["Item", "Valor"],
      linhas: [
        [t("Deveria ter"), r(c.caixa.esperado_centavos)],
        [t("Contado"), r(c.caixa.contado_centavos)],
        [t("Pix conferido"), t(c.caixa.conferido_pix ? "Sim" : "Não")],
        [t("Cartão conferido"), t(c.caixa.conferido_cartao ? "Sim" : "Não")],
      ],
      total: [t("Diferença"), r(Number(c.caixa.contado_centavos ?? 0) - Number(c.caixa.esperado_centavos ?? 0))],
    });
  return { titulo: `Caixa de ${dataBr(c.data)}`, salao, periodo: situacao, rodape, secoes };
}

// ---------------------------------------------------------------------------
const reais = (centavos: number | string) => reaisTexto(Number(centavos));

/** "18/11 14:05" no horário de Brasília */
function dataHora(iso: string): string {
  const f = new Intl.DateTimeFormat("pt-BR", { timeZone: "America/Sao_Paulo", day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).formatToParts(new Date(iso));
  const v = (k: string) => f.find((p) => p.type === k)?.value ?? "";
  return `${v("day")}/${v("month")} ${v("hour")}:${v("minute")}`;
}
