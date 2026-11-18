-- Etapa 5, parte 5: pagamento das comissões.
-- Regras (decisões da dona, docs/02-decisoes.md, 17/11/2026):
--  * o sistema só REGISTRA o pagamento (meio e data). O Pix, a transferência ou o dinheiro
--    são feitos pelo dono fora do sistema;
--  * só o dono registra e cancela; cada profissional vê os próprios pagamentos;
--  * o pagamento quita TODOS os lançamentos ainda não pagos da pessoa até a data escolhida
--    (inclui estornos de comandas reabertas, que entram como ajuste). O valor é sempre a soma
--    desses lançamentos: nunca passa do extrato. Saldo zero ou negativo não é pago (fica para o próximo);
--  * nada é apagado: pagamento errado é cancelado com motivo, e os lançamentos voltam a ficar a pagar;
--  * o comprovante é um recibo para imprimir e assinar à mão (não é assinatura digital).

create type public.meio_pagamento_comissao as enum ('pix', 'dinheiro', 'transferencia', 'outro');

create table public.pagamentos_comissao (
  id                   uuid primary key default gen_random_uuid(),
  salao_id             uuid not null references public.saloes (id),
  profissional_id      uuid not null,
  ate                  date not null,              -- quita o que estava a pagar até este dia
  primeiro_lancamento  date not null,              -- dia do lançamento mais antigo quitado
  valor_centavos       bigint not null check (valor_centavos between 1 and 100000000),
  quantidade           integer not null check (quantidade >= 1),
  lancamentos          uuid[] not null,            -- registro de quais lançamentos foram quitados
  meio                 public.meio_pagamento_comissao not null,
  pago_em              date not null,
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
create index pagamentos_comissao_prof_idx on public.pagamentos_comissao (salao_id, profissional_id, criado_em);
comment on table public.pagamentos_comissao is
  'Registro de pagamento de comissões (o dinheiro sai fora do sistema). Cancelado fica marcado com motivo.';

create trigger auditar_pagamentos_comissao after insert or update on public.pagamentos_comissao
  for each row execute function privado.auditar('salao_id');

alter table public.pagamentos_comissao enable row level security;
revoke all on public.pagamentos_comissao from anon, authenticated;
grant select on public.pagamentos_comissao to authenticated;

create policy "dono vê todos; cada um vê os seus" on public.pagamentos_comissao
  for select to authenticated
  using (
    salao_id in (select privado.saloes_do_usuario())
    and (
      privado.perfil_no_salao(salao_id) = 'dono'
      or profissional_id = privado.meu_profissional_id(salao_id)
    )
  );

-- Lançamento quitado aponta para o pagamento.
alter table public.comissoes add column pagamento_id uuid;
alter table public.comissoes
  add constraint comissoes_pagamento_fk foreign key (salao_id, pagamento_id) references public.pagamentos_comissao (salao_id, id);
create index comissoes_a_pagar_idx on public.comissoes (salao_id, profissional_id) where pagamento_id is null;

-- ---------------------------------------------------------------------------
-- Porta: registrar pagamento (só o dono)
-- p_valor_conferido: o total que o dono viu na tela. Se os lançamentos mudaram
-- no meio do caminho (ex.: comanda reaberta), nada é gravado.
-- ---------------------------------------------------------------------------
create function public.registrar_pagamento_comissao(
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

-- ---------------------------------------------------------------------------
-- Porta: cancelar pagamento lançado errado (só o dono, com motivo).
-- Os lançamentos voltam a ficar a pagar; o registro do pagamento continua, marcado.
-- ---------------------------------------------------------------------------
create function public.cancelar_pagamento_comissao(p_pagamento_id uuid, p_motivo text)
returns void
language plpgsql security definer set search_path = ''
as $$
declare
  v public.pagamentos_comissao;
begin
  select * into v from public.pagamentos_comissao where id = p_pagamento_id for update;
  if v.id is null or coalesce(privado.perfil_no_salao(v.salao_id) = 'dono', false) is not true then
    raise exception 'Só o dono cancela pagamento de comissões.' using errcode = '42501';
  end if;
  if v.cancelado_em is not null then
    raise exception 'Este pagamento já foi cancelado.' using errcode = '22023';
  end if;
  if char_length(btrim(coalesce(p_motivo, ''))) not between 3 and 200 then
    raise exception 'Escreva o motivo do cancelamento (3 a 200 letras).' using errcode = '22023';
  end if;
  update public.comissoes set pagamento_id = null where pagamento_id = p_pagamento_id;
  update public.pagamentos_comissao
  set cancelado_em = now(), cancelado_por = auth.uid(), motivo_cancelamento = btrim(p_motivo)
  where id = p_pagamento_id;
end;
$$;

revoke all on function public.registrar_pagamento_comissao(uuid, uuid, date, bigint, public.meio_pagamento_comissao, date, text) from public, anon;
revoke all on function public.cancelar_pagamento_comissao(uuid, text) from public, anon;
grant execute on function public.registrar_pagamento_comissao(uuid, uuid, date, bigint, public.meio_pagamento_comissao, date, text) to authenticated;
grant execute on function public.cancelar_pagamento_comissao(uuid, text) to authenticated;

-- ---------------------------------------------------------------------------
-- Extrato passa a mostrar se o lançamento já foi pago (e quando).
-- ---------------------------------------------------------------------------
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
  pago_em             date
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
    pg.pago_em
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

-- ---------------------------------------------------------------------------
-- Itens do comprovante: quem vê o pagamento vê a lista (sem nome de cliente).
-- ---------------------------------------------------------------------------
create function public.itens_pagamento_comissao(p_pagamento_id uuid)
returns table (criado_em timestamptz, item_nome text, estorno boolean, valor_centavos bigint)
language sql stable security definer set search_path = ''
as $$
  select c.criado_em, coalesce(s.nome, pr.nome, 'Item'), c.estorno_de is not null, c.valor_centavos
  from public.pagamentos_comissao pg
  join public.comissoes c on c.id = any (pg.lancamentos)
  join public.comanda_itens i on i.id = c.item_id
  left join public.servicos s on s.id = i.servico_id
  left join public.produtos pr on pr.id = i.produto_id
  where pg.id = p_pagamento_id
    and pg.salao_id in (select privado.saloes_do_usuario())
    and coalesce(
      privado.perfil_no_salao(pg.salao_id) = 'dono'
      or pg.profissional_id = privado.meu_profissional_id(pg.salao_id), false)
  order by c.criado_em, c.estorno_de nulls first;
$$;
revoke all on function public.itens_pagamento_comissao(uuid) from public, anon;
grant execute on function public.itens_pagamento_comissao(uuid) to authenticated;
