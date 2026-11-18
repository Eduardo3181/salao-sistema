-- Etapa 5, parte 5 (ajustes da revisão de código, 17/11/2026):
--  * a tela de pagar soma os saldos no banco (a API devolve no máximo 1000 linhas por consulta);
--  * o extrato devolve o total e a quantidade do período inteiros em cada linha, mesmo que a lista venha cortada;
--  * a data do pagamento não pode ser antes das comissões que ele quita.

-- Saldo a pagar por pessoa até um dia (só o dono).
create function public.saldos_comissao_a_pagar(p_salao_id uuid, p_ate date)
returns table (profissional_id uuid, total_centavos bigint, quantidade bigint, mais_antigo timestamptz)
language plpgsql stable security definer set search_path = ''
as $$
begin
  if coalesce(privado.perfil_no_salao(p_salao_id) = 'dono', false) is not true then
    raise exception 'Só o dono vê os valores a pagar.' using errcode = '42501';
  end if;
  return query
  select c.profissional_id, sum(c.valor_centavos)::bigint, count(*), min(c.criado_em)
  from public.comissoes c
  where c.salao_id = p_salao_id
    and c.pagamento_id is null
    and c.criado_em < ((p_ate + 1)::timestamp at time zone 'America/Sao_Paulo')
  group by c.profissional_id;
end;
$$;
revoke all on function public.saldos_comissao_a_pagar(uuid, date) from public, anon;
grant execute on function public.saldos_comissao_a_pagar(uuid, date) to authenticated;

create or replace function public.registrar_pagamento_comissao(
  p_salao_id uuid,
  p_profissional_id uuid,
  p_ate date,
  p_valor_conferido bigint,
  p_meio public.meio_pagamento_comissao,
  p_pago_em date,
  p_observacao text default null
)
returns uuid
language plpgsql security definer set search_path = ''
as $$
declare
  v_ids    uuid[];
  v_total  bigint;
  v_menor  timestamptz;
  v_id     uuid;
  v_hoje   date := (now() at time zone 'America/Sao_Paulo')::date;
begin
  if coalesce(privado.perfil_no_salao(p_salao_id) = 'dono', false) is not true then
    raise exception 'Só o dono registra pagamento de comissões.' using errcode = '42501';
  end if;
  if not exists (select 1 from public.profissionais p where p.id = p_profissional_id and p.salao_id = p_salao_id) then
    raise exception 'Pessoa não encontrada.' using errcode = '22023';
  end if;
  if p_ate is null or p_ate > v_hoje then
    raise exception 'A data final não pode ser depois de hoje.' using errcode = '22023';
  end if;
  if p_pago_em is null or p_pago_em > v_hoje or p_pago_em < v_hoje - 366 then
    raise exception 'Data do pagamento inválida.' using errcode = '22023';
  end if;
  if char_length(coalesce(p_observacao, '')) > 200 then
    raise exception 'Observação com mais de 200 letras.' using errcode = '22023';
  end if;

  -- Trava os lançamentos a pagar desta pessoa (dois pagamentos ao mesmo tempo não quitam o mesmo).
  perform 1 from public.comissoes c
  where c.salao_id = p_salao_id and c.profissional_id = p_profissional_id and c.pagamento_id is null
  for update;

  select array_agg(c.id order by c.criado_em), coalesce(sum(c.valor_centavos), 0), min(c.criado_em)
  into v_ids, v_total, v_menor
  from public.comissoes c
  where c.salao_id = p_salao_id
    and c.profissional_id = p_profissional_id
    and c.pagamento_id is null
    and c.criado_em < ((p_ate + 1)::timestamp at time zone 'America/Sao_Paulo');

  if v_total <> coalesce(p_valor_conferido, -1) then
    raise exception 'Os valores mudaram desde que a tela foi aberta. Confira de novo antes de pagar.' using errcode = '22023';
  end if;
  if p_pago_em < (select max((c.criado_em at time zone 'America/Sao_Paulo')::date) from public.comissoes c where c.id = any (v_ids)) then
    raise exception 'A data do pagamento não pode ser antes das comissões que ele quita.' using errcode = '22023';
  end if;
  if v_total <= 0 then
    raise exception 'Não há valor a pagar para esta pessoa no período.' using errcode = '22023';
  end if;

  insert into public.pagamentos_comissao (
    salao_id, profissional_id, ate, primeiro_lancamento, valor_centavos, quantidade, lancamentos, meio, pago_em, observacao)
  values (
    p_salao_id, p_profissional_id, p_ate, (v_menor at time zone 'America/Sao_Paulo')::date, v_total,
    cardinality(v_ids), v_ids, p_meio, p_pago_em, nullif(btrim(coalesce(p_observacao, '')), ''))
  returning id into v_id;

  update public.comissoes set pagamento_id = v_id where id = any (v_ids);
  return v_id;
end;
$$;

drop function public.extrato_comissoes(uuid, uuid, timestamptz, timestamptz);
create function public.extrato_comissoes(
  p_salao_id uuid,
  p_profissional_id uuid,
  p_de timestamptz,
  p_ate timestamptz
)
returns table (
  id                  uuid,
  criado_em           timestamptz,
  comanda_id          uuid,
  estorno             boolean,
  papel               public.papel_comissao,
  item_nome           text,
  cliente_nome        text,
  valor_item_centavos bigint,
  percentual          integer,
  taxa_centavos       bigint,
  parte_assistente_centavos bigint,
  valor_centavos      bigint,
  pago_em             date,
  total_periodo_centavos bigint,
  quantidade_periodo  bigint
)
language plpgsql stable security definer set search_path = ''
as $$
declare
  v_perfil text := privado.perfil_no_salao(p_salao_id);
begin
  if v_perfil is null
     or not coalesce(v_perfil = 'dono' or p_profissional_id = privado.meu_profissional_id(p_salao_id), false) then
    raise exception 'Você só pode ver o próprio extrato.' using errcode = '42501';
  end if;
  if p_de is null or p_ate is null or p_ate <= p_de or p_ate - p_de > interval '400 days' then
    raise exception 'Escolha um período de até 400 dias.' using errcode = '22023';
  end if;

  return query
  select
    c.id,
    c.criado_em,
    c.comanda_id,
    c.estorno_de is not null,
    c.papel,
    coalesce(s.nome, pr.nome, 'Item'),
    case when v_perfil <> 'assistente' then cl.nome end,
    (c.snapshot ->> 'valorCentavos')::bigint,
    (c.snapshot ->> 'percentual')::integer,
    (c.snapshot -> 'resultado' ->> 'taxaDescontadaCentavos')::bigint,
    case when c.papel = 'profissional' then (c.snapshot -> 'resultado' ->> 'repasseProfissionalCentavos')::bigint end,
    c.valor_centavos,
    pg.pago_em,
    sum(c.valor_centavos) over ()::bigint,
    count(*) over ()
  from public.comissoes c
  join public.comanda_itens i on i.id = c.item_id
  join public.comandas co on co.id = c.comanda_id
  left join public.servicos s on s.id = i.servico_id
  left join public.produtos pr on pr.id = i.produto_id
  left join public.clientes cl on cl.id = co.cliente_id
  left join public.pagamentos_comissao pg on pg.id = c.pagamento_id
  where c.salao_id = p_salao_id
    and c.profissional_id = p_profissional_id
    and c.criado_em >= p_de and c.criado_em < p_ate
  order by c.criado_em, c.estorno_de nulls first;
end;
$$;
revoke all on function public.extrato_comissoes(uuid, uuid, timestamptz, timestamptz) from public, anon;
grant execute on function public.extrato_comissoes(uuid, uuid, timestamptz, timestamptz) to authenticated;
