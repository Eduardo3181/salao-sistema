-- Etapa 5, parte 6: vales (adiantamentos).
-- Decisões da dona (docs/02-decisoes.md, 17/11/2026):
--  * o dono registra o vale (quanto, quando, como foi dado). O sistema só anota; o dinheiro sai fora dele;
--  * na hora de pagar a comissão, o dono escolhe quanto descontar: tudo, uma parte ou nada;
--  * o desconto nunca passa dos vales em aberto nem do valor a pagar;
--  * nada é apagado: vale errado é cancelado com motivo (só se ainda não foi descontado);
--    pagamento cancelado devolve o desconto ao vale;
--  * quem vê: o dono vê todos; cada profissional vê os próprios.

create table public.vales (
  id                   uuid primary key default gen_random_uuid(),
  salao_id             uuid not null references public.saloes (id),
  profissional_id      uuid not null,
  valor_centavos       bigint not null check (valor_centavos between 1 and 100000000),
  dado_em              date not null,
  meio                 public.meio_pagamento_comissao not null,
  observacao           text check (char_length(observacao) <= 200),
  criado_por           uuid default auth.uid(),
  criado_em            timestamptz not null default now(),
  cancelado_em         timestamptz,
  cancelado_por        uuid,
  motivo_cancelamento  text check (char_length(motivo_cancelamento) <= 200),
  unique (salao_id, id),
  foreign key (salao_id, profissional_id) references public.profissionais (salao_id, id),
  check ((cancelado_em is null) = (motivo_cancelamento is null))
);
create index vales_prof_idx on public.vales (salao_id, profissional_id, dado_em);
comment on table public.vales is 'Vales (adiantamentos). Descontados no pagamento da comissão, à escolha do dono.';

-- Quanto de cada vale foi descontado em cada pagamento.
create table public.vale_descontos (
  id              uuid primary key default gen_random_uuid(),
  salao_id        uuid not null references public.saloes (id),
  vale_id         uuid not null,
  pagamento_id    uuid not null,
  valor_centavos  bigint not null check (valor_centavos >= 1),
  criado_em       timestamptz not null default now(),
  foreign key (salao_id, vale_id) references public.vales (salao_id, id),
  foreign key (salao_id, pagamento_id) references public.pagamentos_comissao (salao_id, id)
);
create index vale_descontos_vale_idx on public.vale_descontos (vale_id);
create index vale_descontos_pag_idx on public.vale_descontos (pagamento_id);

alter table public.pagamentos_comissao
  add column desconto_vales_centavos bigint not null default 0;
alter table public.pagamentos_comissao
  add constraint desconto_vales_valido check (desconto_vales_centavos between 0 and valor_centavos);
comment on column public.pagamentos_comissao.desconto_vales_centavos is
  'Quanto de vale foi descontado. Valor entregue = valor_centavos - desconto_vales_centavos.';

create trigger auditar_vales after insert or update on public.vales
  for each row execute function privado.auditar('salao_id');

alter table public.vales enable row level security;
alter table public.vale_descontos enable row level security;
revoke all on public.vales, public.vale_descontos from anon, authenticated;
grant select on public.vales, public.vale_descontos to authenticated;

create policy "dono vê todos; cada um vê os seus" on public.vales
  for select to authenticated
  using (
    salao_id in (select privado.saloes_do_usuario())
    and (privado.perfil_no_salao(salao_id) = 'dono' or profissional_id = privado.meu_profissional_id(salao_id))
  );
create policy "vê os descontos dos vales que vê" on public.vale_descontos
  for select to authenticated
  using (
    salao_id in (select privado.saloes_do_usuario())
    and exists (select 1 from public.vales v where v.id = vale_id) -- a RLS dos vales decide
  );

-- Quanto falta descontar de um vale (descontos de pagamentos cancelados não contam).
create function privado.saldo_vale(p_vale_id uuid)
returns bigint
language sql stable security definer set search_path = ''
as $$
  select v.valor_centavos - coalesce((
    select sum(d.valor_centavos)
    from public.vale_descontos d
    join public.pagamentos_comissao p on p.id = d.pagamento_id
    where d.vale_id = v.id and p.cancelado_em is null), 0)
  from public.vales v where v.id = p_vale_id;
$$;
revoke all on function privado.saldo_vale(uuid) from public;

-- Saldo de um vale para a tela (quem vê o vale vê o saldo).
create function public.saldo_vale(p_vale_id uuid)
returns bigint
language sql stable security definer set search_path = ''
as $$
  select privado.saldo_vale(v.id) from public.vales v
  where v.id = p_vale_id
    and v.salao_id in (select privado.saloes_do_usuario())
    and coalesce(privado.perfil_no_salao(v.salao_id) = 'dono' or v.profissional_id = privado.meu_profissional_id(v.salao_id), false);
$$;
revoke all on function public.saldo_vale(uuid) from public, anon;
grant execute on function public.saldo_vale(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- Portas: registrar e cancelar vale (só o dono)
-- ---------------------------------------------------------------------------
create function public.registrar_vale(
  p_salao_id uuid, p_profissional_id uuid, p_valor bigint, p_dado_em date,
  p_meio public.meio_pagamento_comissao, p_observacao text default null)
returns uuid
language plpgsql security definer set search_path = ''
as $$
declare
  v_id   uuid;
  v_hoje date := (now() at time zone 'America/Sao_Paulo')::date;
begin
  if coalesce(privado.perfil_no_salao(p_salao_id) = 'dono', false) is not true then
    raise exception 'Só o dono registra vales.' using errcode = '42501';
  end if;
  if not exists (select 1 from public.profissionais p where p.id = p_profissional_id and p.salao_id = p_salao_id) then
    raise exception 'Pessoa não encontrada.' using errcode = '22023';
  end if;
  if p_valor is null or p_valor < 1 or p_valor > 100000000 then
    raise exception 'Informe o valor do vale.' using errcode = '22023';
  end if;
  if p_dado_em is null or p_dado_em > v_hoje or p_dado_em < v_hoje - 366 then
    raise exception 'Data do vale inválida.' using errcode = '22023';
  end if;
  if char_length(coalesce(p_observacao, '')) > 200 then
    raise exception 'Observação com mais de 200 letras.' using errcode = '22023';
  end if;
  insert into public.vales (salao_id, profissional_id, valor_centavos, dado_em, meio, observacao)
  values (p_salao_id, p_profissional_id, p_valor, p_dado_em, p_meio, nullif(btrim(coalesce(p_observacao, '')), ''))
  returning id into v_id;
  return v_id;
end;
$$;

create function public.cancelar_vale(p_vale_id uuid, p_motivo text)
returns void
language plpgsql security definer set search_path = ''
as $$
declare
  v public.vales;
begin
  select * into v from public.vales where id = p_vale_id for update;
  if v.id is null or coalesce(privado.perfil_no_salao(v.salao_id) = 'dono', false) is not true then
    raise exception 'Só o dono cancela vales.' using errcode = '42501';
  end if;
  if v.cancelado_em is not null then
    raise exception 'Este vale já foi cancelado.' using errcode = '22023';
  end if;
  if privado.saldo_vale(v.id) <> v.valor_centavos then
    raise exception 'Este vale já foi descontado em um pagamento. Cancele o pagamento antes.' using errcode = '22023';
  end if;
  if char_length(btrim(coalesce(p_motivo, ''))) not between 3 and 200 then
    raise exception 'Escreva o motivo do cancelamento (3 a 200 letras).' using errcode = '22023';
  end if;
  update public.vales set cancelado_em = now(), cancelado_por = auth.uid(), motivo_cancelamento = btrim(p_motivo)
  where id = p_vale_id;
end;
$$;

revoke all on function public.registrar_vale(uuid, uuid, bigint, date, public.meio_pagamento_comissao, text) from public, anon;
revoke all on function public.cancelar_vale(uuid, text) from public, anon;
grant execute on function public.registrar_vale(uuid, uuid, bigint, date, public.meio_pagamento_comissao, text) to authenticated;
grant execute on function public.cancelar_vale(uuid, text) to authenticated;

-- ---------------------------------------------------------------------------
-- Pagamento de comissão passa a aceitar desconto de vale (o resto igual à versão anterior)
-- ---------------------------------------------------------------------------
drop function public.registrar_pagamento_comissao(uuid, uuid, date, bigint, public.meio_pagamento_comissao, date, text);
create function public.registrar_pagamento_comissao(
  p_salao_id uuid,
  p_profissional_id uuid,
  p_ate date,
  p_valor_conferido bigint,
  p_meio public.meio_pagamento_comissao,
  p_pago_em date,
  p_observacao text default null,
  p_desconto_vales bigint default 0
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
  v_vales  bigint;
  v_resta  bigint;
  v_vale   record;
  v_parte  bigint;
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
  if p_desconto_vales is null or p_desconto_vales < 0 then
    raise exception 'Desconto de vale inválido.' using errcode = '22023';
  end if;

  -- Trava os lançamentos a pagar e os vales desta pessoa (dois pagamentos ao mesmo tempo não usam os mesmos).
  perform 1 from public.comissoes c
  where c.salao_id = p_salao_id and c.profissional_id = p_profissional_id and c.pagamento_id is null
  for update;
  perform 1 from public.vales v
  where v.salao_id = p_salao_id and v.profissional_id = p_profissional_id and v.cancelado_em is null
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

  -- Vales: nunca descontar mais do que está em aberto, nem mais do que o valor a pagar.
  select coalesce(sum(privado.saldo_vale(v.id)), 0) into v_vales
  from public.vales v
  where v.salao_id = p_salao_id and v.profissional_id = p_profissional_id and v.cancelado_em is null;
  if p_desconto_vales > v_vales then
    raise exception 'O desconto é maior que os vales em aberto desta pessoa.' using errcode = '22023';
  end if;
  if p_desconto_vales > v_total then
    raise exception 'O desconto de vale não pode passar do valor a pagar.' using errcode = '22023';
  end if;

  insert into public.pagamentos_comissao (
    salao_id, profissional_id, ate, primeiro_lancamento, valor_centavos, quantidade, lancamentos, meio, pago_em, observacao,
    desconto_vales_centavos)
  values (
    p_salao_id, p_profissional_id, p_ate, (v_menor at time zone 'America/Sao_Paulo')::date, v_total,
    cardinality(v_ids), v_ids, p_meio, p_pago_em, nullif(btrim(coalesce(p_observacao, '')), ''),
    p_desconto_vales)
  returning id into v_id;

  update public.comissoes set pagamento_id = v_id where id = any (v_ids);

  -- Distribui o desconto pelos vales, do mais antigo para o mais novo.
  v_resta := p_desconto_vales;
  for v_vale in
    select v.id, privado.saldo_vale(v.id) as saldo from public.vales v
    where v.salao_id = p_salao_id and v.profissional_id = p_profissional_id and v.cancelado_em is null
    order by v.dado_em, v.criado_em
  loop
    exit when v_resta <= 0;
    continue when v_vale.saldo <= 0;
    v_parte := least(v_vale.saldo, v_resta);
    insert into public.vale_descontos (salao_id, vale_id, pagamento_id, valor_centavos)
    values (p_salao_id, v_vale.id, v_id, v_parte);
    v_resta := v_resta - v_parte;
  end loop;
  return v_id;
end;
$$;
revoke all on function public.registrar_pagamento_comissao(uuid, uuid, date, bigint, public.meio_pagamento_comissao, date, text, bigint) from public, anon;
grant execute on function public.registrar_pagamento_comissao(uuid, uuid, date, bigint, public.meio_pagamento_comissao, date, text, bigint) to authenticated;

-- Saldos a pagar agora trazem os vales em aberto de cada pessoa.
drop function public.saldos_comissao_a_pagar(uuid, date);
create function public.saldos_comissao_a_pagar(p_salao_id uuid, p_ate date)
returns table (profissional_id uuid, total_centavos bigint, quantidade bigint, mais_antigo timestamptz, vales_centavos bigint)
language plpgsql stable security definer set search_path = ''
as $$
begin
  if coalesce(privado.perfil_no_salao(p_salao_id) = 'dono', false) is not true then
    raise exception 'Só o dono vê os valores a pagar.' using errcode = '42501';
  end if;
  return query
  select c.profissional_id, sum(c.valor_centavos)::bigint, count(*), min(c.criado_em),
    coalesce((select sum(privado.saldo_vale(v.id)) from public.vales v
              where v.salao_id = p_salao_id and v.profissional_id = c.profissional_id and v.cancelado_em is null), 0)::bigint
  from public.comissoes c
  where c.salao_id = p_salao_id
    and c.pagamento_id is null
    and c.criado_em < ((p_ate + 1)::timestamp at time zone 'America/Sao_Paulo')
  group by c.profissional_id;
end;
$$;
revoke all on function public.saldos_comissao_a_pagar(uuid, date) from public, anon;
grant execute on function public.saldos_comissao_a_pagar(uuid, date) to authenticated;
