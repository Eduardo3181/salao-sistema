import type { SupabaseClient } from "@supabase/supabase-js";
import { formatarDuracao, formatarReais } from "@/lib/dinheiro";

export type Perfil = "dono" | "recepcao" | "profissional" | "assistente";

export const NOME_PERFIL: Record<Perfil, string> = {
  dono: "Dono(a)",
  recepcao: "Recepção",
  profissional: "Profissional",
  assistente: "Assistente",
};

export type MeuSalao = { salaoId: string; nome: string; perfil: Perfil; trocarSenha: boolean };

export type MembroEquipe = {
  id: string;
  user_id: string;
  nome: string | null;
  email: string;
  perfil: Perfil;
  ativo: boolean;
  trocar_senha: boolean;
};

/**
 * Salão do usuário logado. A RLS garante que só vêm salões dele.
 * Por enquanto usa o primeiro salão (troca de salão fica para depois).
 */
export async function buscarMeuSalao(supabase: SupabaseClient, userId: string): Promise<MeuSalao | null> {
  const { data } = await supabase
    .from("usuarios_salao")
    .select("salao_id, perfil, trocar_senha, criado_em, saloes(nome)")
    .eq("user_id", userId)
    .eq("ativo", true)
    .order("criado_em", { ascending: true })
    .limit(1)
    .maybeSingle();

  if (!data) return null;
  const salao = data.saloes as unknown as { nome: string } | null;
  return {
    salaoId: data.salao_id,
    nome: salao?.nome ?? "",
    perfil: data.perfil as Perfil,
    trocarSenha: Boolean(data.trocar_senha),
  };
}

export type RegistroAuditoria = {
  id: number;
  entidade_id?: string | null;
  user_id: string | null;
  acao: string;
  entidade: string;
  antes: Record<string, unknown> | null;
  depois: Record<string, unknown> | null;
  em: string;
};

/**
 * Frase em português para um registro da auditoria.
 * nomesClientes: nome ATUAL de cada cliente (a auditoria de clientes não guarda dados pessoais).
 * nomesProfissionais: nome de cada profissional (para a agenda e os bloqueios).
 */
export function descreverAuditoria(
  r: RegistroAuditoria,
  nomesClientes?: Map<string, string>,
  nomesProfissionais?: Map<string, string>,
): string {
  const agenda = descreverAgenda(r, nomesClientes, nomesProfissionais);
  if (agenda) return agenda;
  if (r.entidade === "saloes" && r.acao === "insert") return `Salão criado: "${r.depois?.nome}"`;
  if (r.entidade === "saloes" && r.acao === "update") {
    if (r.antes?.nome !== r.depois?.nome) return `Nome do salão alterado de "${r.antes?.nome}" para "${r.depois?.nome}"`;
    return "Dados do salão alterados";
  }
  if (r.entidade === "usuarios_salao") {
    const perfil = NOME_PERFIL[(r.depois?.perfil ?? r.antes?.perfil) as Perfil] ?? "";
    const nome = (r.depois?.nome ?? r.antes?.nome) as string | null | undefined;
    const quem = nome ? nome : "uma pessoa";
    if (r.acao === "insert" && !nome && (r.depois?.perfil as string) === "dono") return "Dono(a) do salão cadastrado(a)";
    if (r.acao === "insert" && !nome) return `Pessoa adicionada à equipe como ${perfil}`;
    if (r.acao === "insert") return `${quem} adicionado(a) à equipe como ${perfil}`;
    if (r.acao === "delete") return `${quem} removido(a) da equipe (era ${perfil})`;
    if (r.antes?.ativo === true && r.depois?.ativo === false) return `Acesso de ${quem} retirado`;
    if (r.antes?.ativo === false && r.depois?.ativo === true) return `Acesso de ${quem} devolvido`;
    if (r.antes?.trocar_senha === true && r.depois?.trocar_senha === false)
      return `${quem} trocou a senha provisória`;
    return `Acesso de ${quem} alterado (${perfil})`;
  }
  if (r.entidade === "categorias_servico") {
    const nome = r.depois?.nome ?? r.antes?.nome;
    if (r.acao === "insert") return `Categoria criada: "${nome}"`;
    if (r.antes?.ativo === true && r.depois?.ativo === false) return `Categoria "${nome}" desativada`;
    if (r.antes?.ativo === false && r.depois?.ativo === true) return `Categoria "${nome}" reativada`;
    if (r.antes?.nome !== r.depois?.nome) return `Categoria renomeada de "${r.antes?.nome}" para "${r.depois?.nome}"`;
    return `Categoria "${nome}" alterada`;
  }
  if (r.entidade === "servicos") {
    const nome = r.depois?.nome ?? r.antes?.nome;
    const preco = (v: unknown) => formatarReais(Number(v));
    if (r.acao === "insert")
      return `Serviço criado: "${nome}" (${formatarDuracao(Number(r.depois?.duracao_min))}, ${preco(r.depois?.preco_centavos)})`;
    if (r.antes?.ativo === true && r.depois?.ativo === false) return `Serviço "${nome}" desativado`;
    if (r.antes?.ativo === false && r.depois?.ativo === true) return `Serviço "${nome}" reativado`;
    const mudancas: string[] = [];
    if (r.antes?.nome !== r.depois?.nome) mudancas.push(`nome de "${r.antes?.nome}" para "${r.depois?.nome}"`);
    if (Number(r.antes?.preco_centavos) !== Number(r.depois?.preco_centavos))
      mudancas.push(`preço de ${preco(r.antes?.preco_centavos)} para ${preco(r.depois?.preco_centavos)}`);
    if (Number(r.antes?.duracao_min) !== Number(r.depois?.duracao_min))
      mudancas.push(
        `duração de ${formatarDuracao(Number(r.antes?.duracao_min))} para ${formatarDuracao(Number(r.depois?.duracao_min))}`,
      );
    if (r.antes?.categoria_id !== r.depois?.categoria_id) mudancas.push("categoria");
    return mudancas.length ? `Serviço "${nome}": ${mudancas.join(", ")}` : `Serviço "${nome}" alterado`;
  }
  if (r.entidade === "produtos") {
    const nome = r.depois?.nome ?? r.antes?.nome;
    const valor = (v: unknown) => (v === null || v === undefined ? "sem custo" : formatarReais(Number(v)));
    if (r.acao === "insert") return `Produto criado: "${nome}" (${valor(r.depois?.preco_centavos)})`;
    if (r.antes?.ativo === true && r.depois?.ativo === false) return `Produto "${nome}" desativado`;
    if (r.antes?.ativo === false && r.depois?.ativo === true) return `Produto "${nome}" reativado`;
    const mudancas: string[] = [];
    if (r.antes?.nome !== r.depois?.nome) mudancas.push(`nome de "${r.antes?.nome}" para "${r.depois?.nome}"`);
    if (Number(r.antes?.preco_centavos) !== Number(r.depois?.preco_centavos))
      mudancas.push(`preço de ${valor(r.antes?.preco_centavos)} para ${valor(r.depois?.preco_centavos)}`);
    if ((r.antes?.custo_centavos ?? null) !== (r.depois?.custo_centavos ?? null))
      mudancas.push(`custo de ${valor(r.antes?.custo_centavos)} para ${valor(r.depois?.custo_centavos)}`);
    return mudancas.length ? `Produto "${nome}": ${mudancas.join(", ")}` : `Produto "${nome}" alterado`;
  }
  if (r.entidade === "profissionais") {
    const nome = r.depois?.nome ?? r.antes?.nome;
    const tipo = (t: unknown) => (t === "assistente" ? "assistente" : "profissional");
    if (r.acao === "insert") return `${nome} cadastrado(a) como ${tipo(r.depois?.tipo)}`;
    if (r.antes?.ativo === true && r.depois?.ativo === false) return `${nome} desativado(a)`;
    if (r.antes?.ativo === false && r.depois?.ativo === true) return `${nome} reativado(a)`;
    const mudancas: string[] = [];
    if (r.antes?.nome !== r.depois?.nome) mudancas.push(`nome de "${r.antes?.nome}" para "${r.depois?.nome}"`);
    if (r.antes?.tipo !== r.depois?.tipo) mudancas.push(`passou a ${tipo(r.depois?.tipo)}`);
    if (r.antes?.user_id !== r.depois?.user_id) mudancas.push(r.depois?.user_id ? "ligado(a) a uma conta" : "desligado(a) da conta");
    return mudancas.length ? `${nome}: ${mudancas.join(", ")}` : `${nome} alterado(a)`;
  }
  if (r.entidade === "clientes") {
    const nome = (r.entidade_id && nomesClientes?.get(r.entidade_id)) || "cliente removida";
    if (r.acao === "insert") return `Cliente cadastrada: ${nome}`;
    if (r.antes?.ativo === true && r.depois?.ativo === false) return `Cliente desativada: ${nome}`;
    if (r.antes?.ativo === false && r.depois?.ativo === true) return `Cliente reativada: ${nome}`;
    const campos = ((r.depois?.campos_alterados as string[] | undefined) ?? []).map((c) => NOME_CAMPO_CLIENTE[c] ?? c);
    return campos.length ? `Ficha de ${nome} alterada (${campos.join(", ")})` : `Ficha de ${nome} alterada`;
  }
  if (r.entidade === "configuracao_salao") {
    const frases: string[] = [];
    const mudou = (c: string) => r.acao === "insert" || r.antes?.[c] !== r.depois?.[c];
    if (mudou("profissionais_editam_clientes"))
      frases.push(`profissionais ${r.depois?.profissionais_editam_clientes ? "agora podem" : "não podem mais"} cadastrar e alterar clientes`);
    if (mudou("exigir_motivo_cancelamento") && r.depois?.exigir_motivo_cancelamento !== undefined)
      frases.push(`motivo ao cancelar ${r.depois?.exigir_motivo_cancelamento ? "passa a ser exigido" : "deixa de ser exigido"}`);
    if (mudou("profissionais_alteram_preco") && r.depois?.profissionais_alteram_preco !== undefined)
      frases.push(`profissionais ${r.depois?.profissionais_alteram_preco ? "agora podem" : "não podem mais"} mudar preço e dar desconto na comanda`);
    if (mudou("profissionais_recebem_pagamento") && r.depois?.profissionais_recebem_pagamento !== undefined)
      frases.push(`profissionais ${r.depois?.profissionais_recebem_pagamento ? "agora podem" : "não podem mais"} receber pagamentos`);
    return frases.length ? `Configuração: ${frases.join("; ")}` : "Configurações do salão alteradas";
  }
  if (r.entidade === "configuracao_comissao") {
    const pct = (v: unknown) => `${Math.floor(Number(v) / 100)},${String(Number(v) % 100).padStart(2, "0")}%`.replace(",00%", "%");
    if (r.acao === "insert") return `Comissões configuradas: padrão do salão ${pct(r.depois?.percentual_padrao)}`;
    const m: string[] = [];
    if (r.antes?.percentual_padrao !== r.depois?.percentual_padrao)
      m.push(`padrão de ${pct(r.antes?.percentual_padrao)} para ${pct(r.depois?.percentual_padrao)}`);
    if (r.antes?.descontar_taxa_cartao !== r.depois?.descontar_taxa_cartao)
      m.push(r.depois?.descontar_taxa_cartao ? "passa a descontar a taxa do cartão" : "deixa de descontar a taxa do cartão");
    if (r.antes?.comissao_produtos !== r.depois?.comissao_produtos || r.antes?.percentual_produtos !== r.depois?.percentual_produtos)
      m.push(r.depois?.comissao_produtos ? `produtos com ${pct(r.depois?.percentual_produtos)}` : "produtos sem comissão");
    if (
      r.antes?.assistente_base !== r.depois?.assistente_base ||
      r.antes?.assistente_valor !== r.depois?.assistente_valor ||
      r.antes?.assistente_quem_paga !== r.depois?.assistente_quem_paga ||
      r.antes?.assistente_percentual_profissional !== r.depois?.assistente_percentual_profissional
    )
      m.push(r.depois?.assistente_base ? "regra dos assistentes alterada" : "sem regra de assistentes");
    return m.length ? `Comissões: ${m.join("; ")}` : "Comissões: configuração salva";
  }
  if (r.entidade === "regras_comissao") {
    const x = r.depois ?? r.antes;
    const pct = (v: unknown) => `${Math.floor(Number(v) / 100)},${String(Number(v) % 100).padStart(2, "0")}%`.replace(",00%", "%");
    const alvo = x?.profissional_id && x?.servico_id ? "profissional em um serviço" : x?.profissional_id ? "profissional" : "serviço";
    if (r.acao === "delete") return `Exceção de comissão (${alvo}) removida`;
    if (r.acao === "insert") return `Exceção de comissão (${alvo}): ${pct(r.depois?.percentual)}`;
    return `Exceção de comissão (${alvo}): de ${pct(r.antes?.percentual)} para ${pct(r.depois?.percentual)}`;
  }
  if (r.entidade === "pagamentos_comissao") {
    const x = r.depois ?? r.antes;
    const valor = formatarReais(Number(x?.valor_centavos ?? 0));
    if (r.acao === "insert")
      return Number(x?.desconto_vales_centavos ?? 0) > 0
        ? `Pagamento de comissão registrado: ${valor} (vale descontado ${formatarReais(Number(x?.desconto_vales_centavos))})`
        : `Pagamento de comissão registrado: ${valor}`;
    if (!r.antes?.cancelado_em && r.depois?.cancelado_em) return `Pagamento de comissão cancelado (${valor}): ${r.depois?.motivo_cancelamento ?? ""}`;
    return `Pagamento de comissão alterado (${valor})`;
  }
  if (r.entidade === "vales") {
    const x = r.depois ?? r.antes;
    const valor = formatarReais(Number(x?.valor_centavos ?? 0));
    if (r.acao === "insert") return `Vale registrado: ${valor}`;
    if (!r.antes?.cancelado_em && r.depois?.cancelado_em) return `Vale cancelado (${valor}): ${r.depois?.motivo_cancelamento ?? ""}`;
    return `Vale alterado (${valor})`;
  }
  if (r.entidade === "taxas_cartao") {
    const t = r.depois ?? r.antes;
    const nome = t?.forma === "debito" ? "débito" : t?.forma === "credito_vista" ? "crédito à vista" : `crédito ${t?.parcelas}x`;
    const pct = (v: unknown) => `${Math.floor(Number(v) / 100)},${String(Number(v) % 100).padStart(2, "0")}%`;
    if (r.acao === "delete") return `Taxa do ${nome} removida`;
    if (r.acao === "insert") return `Taxa do ${nome}: ${pct(r.depois?.taxa_centesimos)}`;
    return `Taxa do ${nome}: de ${pct(r.antes?.taxa_centesimos)} para ${pct(r.depois?.taxa_centesimos)}`;
  }
  if (r.entidade === "horarios_funcionamento") {
    const linha = r.depois ?? r.antes;
    const dia = DIAS_SEMANA_REGISTRO[Number(linha?.dia_semana)] ?? "";
    const quem = linha?.profissional_id ? "Horário de trabalho de uma profissional" : "Horário do salão";
    if (r.acao === "delete") return `${quem}: ${dia} fechado`;
    return `${quem}: ${dia} ${String(r.depois?.abre).slice(0, 5)}–${String(r.depois?.fecha).slice(0, 5)}`;
  }
  if (r.entidade === "consentimentos_whatsapp") {
    const id = r.depois?.cliente_id as string | undefined;
    const nome = (id && nomesClientes?.get(id)) || "cliente removida";
    return `WhatsApp: ${nome} ${r.depois?.aceitou ? "aceitou receber mensagens" : "não aceitou receber mensagens"}`;
  }
  return `${r.acao} em ${r.entidade}`;
}

const DIAS_SEMANA_REGISTRO = ["domingo", "segunda", "terça", "quarta", "quinta", "sexta", "sábado"];

const NOME_CAMPO_CLIENTE: Record<string, string> = {
  nome: "nome",
  telefone: "telefone",
  nascimento: "nascimento",
  observacoes: "observações",
  ativo: "situação",
};

/** Data e hora no horário de Brasília. */
export function dataHoraBrasil(iso: string): string {
  return new Intl.DateTimeFormat("pt-BR", {
    timeZone: "America/Sao_Paulo",
    dateStyle: "short",
    timeStyle: "short",
  }).format(new Date(iso));
}

const SITUACAO: Record<string, string> = {
  agendado: "agendado",
  confirmado: "confirmado",
  chegou: "cliente chegou",
  concluido: "concluído",
  faltou: "faltou",
  cancelado: "cancelado",
};
const MOTIVO: Record<string, string> = {
  cliente_desmarcou: "cliente desmarcou",
  salao_desmarcou: "salão desmarcou",
  outro: "outro motivo",
};

/** "2026-11-18T13:00:00+00:00" -> "18/11 às 10:00" (horário de Brasília). */
function quando(iso: unknown): string {
  if (typeof iso !== "string") return "";
  const d = new Date(iso);
  const dia = new Intl.DateTimeFormat("pt-BR", { timeZone: "America/Sao_Paulo", day: "2-digit", month: "2-digit" }).format(d);
  const hora = new Intl.DateTimeFormat("pt-BR", { timeZone: "America/Sao_Paulo", hour: "2-digit", minute: "2-digit" }).format(d);
  return `${dia} às ${hora}`;
}

/** Frases da agenda (agendamentos, serviços marcados, bloqueios). Devolve null se não for da agenda. */
function descreverAgenda(
  r: RegistroAuditoria,
  nomesClientes?: Map<string, string>,
  nomesProfissionais?: Map<string, string>,
): string | null {
  const cliente = (id: unknown) => (typeof id === "string" && nomesClientes?.get(id)) || "cliente removida";
  const prof = (id: unknown) => (typeof id === "string" && nomesProfissionais?.get(id)) || "profissional";

  if (r.entidade === "agendamentos") {
    const nome = cliente(r.depois?.cliente_id ?? r.antes?.cliente_id);
    if (r.acao === "insert") return `Agendamento criado para ${nome}`;
    const s = String(r.depois?.situacao);
    if (r.antes?.situacao !== r.depois?.situacao) {
      const motivo = s === "cancelado" && r.depois?.motivo_cancelamento ? ` (${MOTIVO[String(r.depois.motivo_cancelamento)]})` : "";
      return `Agendamento de ${nome}: ${SITUACAO[s] ?? s}${motivo}`;
    }
    return `Agendamento de ${nome} alterado`;
  }
  if (r.entidade === "agendamento_itens") {
    if (r.acao === "insert") return `Horário marcado com ${prof(r.depois?.profissional_id)}: ${quando(r.depois?.inicio)}`;
    if (r.acao === "delete") return `Horário removido: ${quando(r.antes?.inicio)}`;
    const trocou = r.antes?.profissional_id !== r.depois?.profissional_id;
    return `Horário remarcado de ${quando(r.antes?.inicio)} para ${quando(r.depois?.inicio)}${
      trocou ? `, agora com ${prof(r.depois?.profissional_id)}` : ""
    }`;
  }
  if (r.entidade === "bloqueios") {
    const b = r.depois ?? r.antes;
    const alvo = b?.profissional_id ? `agenda de ${prof(b.profissional_id)}` : "salão inteiro";
    const motivo = b?.motivo ? ` (${b.motivo})` : "";
    const periodo = `${quando(b?.inicio)} até ${quando(b?.fim)}`;
    return r.acao === "delete" ? `Bloqueio removido: ${alvo}, ${periodo}` : `Bloqueio: ${alvo}, ${periodo}${motivo}`;
  }
  if (r.entidade === "assistentes_profissionais") {
    const a = r.depois ?? r.antes;
    return r.acao === "delete"
      ? `${prof(a?.assistente_id)} não ajuda mais ${prof(a?.profissional_id)}`
      : `${prof(a?.assistente_id)} passa a ajudar ${prof(a?.profissional_id)}`;
  }
  return null;
}
