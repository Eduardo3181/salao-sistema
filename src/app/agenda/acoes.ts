"use server";

import { revalidatePath } from "next/cache";
import { dataValida, diaDaSemana, hojeBrasilia, horaParaMinutos, horarioComFuso, minutosNoDia, minutosParaHora } from "@/lib/agenda";
import { buscarConfiguracao, podeEditarClientes } from "@/lib/clientes";
import { reaisParaCentavos } from "@/lib/dinheiro";
import { exigirSalao } from "@/lib/sessao";
import { normalizarTelefone } from "@/lib/telefone-data";

export type ItemMarcacao = { servicoId: string; profissionalId: string; inicio: number; duracao: number };
type Resposta<T> = { ok: true; dados: T } | { ok: false; erro: string };

/** Busca clientes pelo nome (ou telefone, para quem pode ver telefone). A função do banco aplica as regras. */
export async function buscarClientesAgenda(busca: string): Promise<{ id: string; nome: string }[]> {
  const { supabase, salao } = await exigirSalao();
  const { data, error } = await supabase.rpc("clientes_do_salao", { p_salao_id: salao.salaoId, p_busca: busca.slice(0, 60) || null });
  if (error) console.error("buscarClientesAgenda falhou:", error.code);
  return ((data ?? []) as { id: string; nome: string }[]).slice(0, 20).map(({ id, nome }) => ({ id, nome }));
}

/** Cadastro rápido de cliente, sem sair da marcação. */
export async function cadastrarClienteRapido(nome: string, telefone: string): Promise<Resposta<{ id: string; nome: string }>> {
  const { supabase, salao } = await exigirSalao();
  const config = await buscarConfiguracao(supabase, salao.salaoId);
  if (!podeEditarClientes(salao.perfil, config.profissionaisEditamClientes))
    return { ok: false, erro: "Você não tem permissão para cadastrar clientes." };

  const n = nome.trim();
  if (n.length < 2 || n.length > 120) return { ok: false, erro: "Digite o nome da cliente (2 a 120 letras)." };
  const tel = normalizarTelefone(telefone);
  if (tel === null) return { ok: false, erro: "Telefone inválido. Use o DDD, por exemplo: (11) 98765-4321." };

  const { data, error } = await supabase
    .from("clientes")
    .insert({ salao_id: salao.salaoId, nome: n, telefone: tel || null })
    .select("id")
    .single();
  if (error || !data) {
    console.error("cadastrarClienteRapido falhou:", error?.code);
    return { ok: false, erro: "Não foi possível cadastrar. Tente de novo." };
  }
  revalidatePath("/clientes");
  return { ok: true, dados: { id: data.id as string, nome: n } };
}

/** Cadastro rápido de serviço (só o dono, como no cadastro normal). */
export async function cadastrarServicoRapido(entrada: {
  nome: string;
  categoriaId: string;
  novaCategoria: string;
  duracao: number;
  preco: string;
}): Promise<Resposta<{ id: string; nome: string; duracao: number; precoCentavos: number; categoriaId: string; categoriaNome: string }>> {
  const { supabase, salao, ehDono } = await exigirSalao();
  if (!ehDono) return { ok: false, erro: "Só o dono cadastra serviços." };

  const nome = entrada.nome.trim();
  const preco = reaisParaCentavos(entrada.preco);
  if (nome.length < 2 || nome.length > 120) return { ok: false, erro: "Digite o nome do serviço." };
  if (!Number.isInteger(entrada.duracao) || entrada.duracao < 5 || entrada.duracao > 720)
    return { ok: false, erro: "A duração deve ser em minutos, entre 5 e 720." };
  if (preco === null) return { ok: false, erro: "Preço inválido. Exemplos: 80 ou 80,50." };

  let categoriaId = entrada.categoriaId;
  let categoriaNome = "";
  if (!categoriaId) {
    const nova = entrada.novaCategoria.trim();
    if (nova.length < 2) return { ok: false, erro: "Escolha ou digite a categoria." };
    const { data, error } = await supabase.from("categorias_servico").insert({ salao_id: salao.salaoId, nome: nova }).select("id").single();
    if (error || !data) return { ok: false, erro: error?.code === "23505" ? "Já existe uma categoria com esse nome." : "Não foi possível criar a categoria." };
    categoriaId = data.id as string;
    categoriaNome = nova;
  }

  const { data, error } = await supabase
    .from("servicos")
    .insert({ salao_id: salao.salaoId, categoria_id: categoriaId, nome, duracao_min: entrada.duracao, preco_centavos: preco })
    .select("id")
    .single();
  if (error || !data) return { ok: false, erro: error?.code === "23505" ? "Já existe um serviço com esse nome." : "Não foi possível cadastrar o serviço." };
  revalidatePath("/servicos");
  return { ok: true, dados: { id: data.id as string, nome, duracao: entrada.duracao, precoCentavos: preco, categoriaId, categoriaNome } };
}

/**
 * Avisos antes de marcar: encaixe, bloqueio, fora do expediente e horário no passado.
 * Nada aqui impede a marcação (as regras de verdade estão no banco); é só para a pessoa decidir.
 */
export async function avisosDaMarcacao(data: string, itens: ItemMarcacao[]): Promise<string[]> {
  const { supabase, salao } = await exigirSalao();
  if (!dataValida(data) || itens.length === 0) return [];

  const [{ data: colunas }, { data: horarios }] = await Promise.all([
    supabase.rpc("minhas_agendas", { p_salao_id: salao.salaoId }),
    supabase.from("horarios_funcionamento").select("profissional_id, dia_semana, abre, fecha").eq("salao_id", salao.salaoId),
  ]);
  const nomes = new Map(((colunas ?? []) as { id: string; nome: string }[]).map((c) => [c.id, c.nome]));
  const hs = (horarios ?? []) as { profissional_id: string | null; dia_semana: number; abre: string; fecha: string }[];
  const dia = diaDaSemana(data);
  const temProprio = new Set(hs.filter((h) => h.profissional_id).map((h) => h.profissional_id));

  const avisos: string[] = [];
  const agora = data === hojeBrasilia() ? minutosNoDia(new Date().toISOString(), data) : data < hojeBrasilia() ? 24 * 60 : -1;

  for (const it of itens) {
    const nome = nomes.get(it.profissionalId) ?? "A profissional";
    const fim = it.inicio + it.duracao;
    const faixa = `${minutosParaHora(it.inicio)}–${minutosParaHora(fim)}`;

    const { data: c } = await supabase.rpc("conflitos_agenda", {
      p_salao_id: salao.salaoId,
      p_profissional_id: it.profissionalId,
      p_inicio: horarioComFuso(data, it.inicio),
      p_fim: horarioComFuso(data, fim),
    });
    const conflitos = c as { atendimentos: number; bloqueios: number } | null;
    if (conflitos?.atendimentos) avisos.push(`${nome} já tem horário marcado entre ${faixa} (encaixe).`);
    if (conflitos?.bloqueios) avisos.push(`${nome} tem um bloqueio (folga, almoço ou feriado) entre ${faixa}.`);

    const exp = temProprio.has(it.profissionalId)
      ? hs.find((h) => h.profissional_id === it.profissionalId && h.dia_semana === dia)
      : hs.find((h) => h.profissional_id === null && h.dia_semana === dia);
    if (!exp) avisos.push(`${nome} não trabalha neste dia.`);
    else if (it.inicio < horaParaMinutos(exp.abre) || fim > horaParaMinutos(exp.fecha))
      avisos.push(`${faixa} fica fora do expediente de ${nome} (${exp.abre.slice(0, 5)}–${exp.fecha.slice(0, 5)}).`);

    if (it.inicio < agora) avisos.push(`${faixa} é um horário que já passou.`);
  }
  return [...new Set(avisos)];
}

/** Marca o horário pela porta do banco (que confere perfil, salão e horário no passado). */
export async function marcarHorario(clienteId: string, data: string, itens: ItemMarcacao[]): Promise<Resposta<{ data: string }>> {
  const { supabase, salao } = await exigirSalao();
  if (!dataValida(data)) return { ok: false, erro: "Data inválida." };
  if (!clienteId) return { ok: false, erro: "Escolha a cliente." };
  if (itens.length === 0) return { ok: false, erro: "Escolha pelo menos um serviço." };

  const { error } = await supabase.rpc("criar_agendamento", {
    p_salao_id: salao.salaoId,
    p_cliente_id: clienteId,
    p_itens: itens.map((i) => ({
      servico_id: i.servicoId,
      profissional_id: i.profissionalId,
      inicio: horarioComFuso(data, i.inicio),
      duracao_min: i.duracao,
    })),
  });
  if (error) {
    console.error("marcarHorario falhou:", error.code);
    // As mensagens das portas do banco já são em português e não têm dados pessoais.
    return { ok: false, erro: error.code === "42501" || error.code === "22023" ? error.message : "Não foi possível marcar. Tente de novo." };
  }
  revalidatePath("/agenda");
  return { ok: true, dados: { data } };
}
