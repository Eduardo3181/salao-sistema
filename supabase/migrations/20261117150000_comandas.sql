-- Etapa 4, parte 2a: base da comanda (sem pagamentos; esses vêm na parte 2b).
-- Regras (decisões da dona em docs/02-decisoes.md, 17/11/2026):
--  * dono e recepção veem e mexem em todas as comandas;
--  * profissional vê as comandas em que atende (ou que ela abriu) e, dentro delas, só os próprios itens;
--    lança serviços/produtos só em nome dela;
--  * mudar preço ou dar desconto: dono e recepção sempre; profissional só se o dono ligar a chave
--    "profissionais_alteram_preco" (começa desligada);
--  * excluir item: só dono e recepção, com motivo (o item não some: fica marcado como removido);
--  * assistente não vê comandas nesta etapa (a comissão dela vem na Etapa 5).
-- Dinheiro sempre em centavos (bigint). Gravações só pelas funções (portas) abaixo.

create type public.situacao_comanda as enum ('aberta', 'fechada', 'cancelada');
create type public.tipo_item_comanda as enum ('servico', 'produto');

alter table public.configuracao_salao
  add column profissionais_alteram_preco boolean not null default false;
grant insert (profissionais_alteram_preco) on public.configuracao_salao to authenticated;
grant update (profissionais_alteram_preco) on public.configuracao_salao to authenticated;

alter table public.agendamento_itens add constraint agendamento_itens_salao_id_unico unique (salao_id, id);

-- ---------------------------------------------------------------------------
-- Tabelas
-- ---------------------------------------------------------------------------
create table public.comandas (
  id                   uuid primary key default gen_random_uuid(),
  salao_id             uuid not null references public.saloes (id),
  cliente_id           uuid not null,
  agendamento_id       uuid,
  situacao             public.situacao_comanda not null default 'aberta',
  desconto_centavos    bigint not null default 0 check (desconto_centavos between 0 and 100000000),
  aberta_por           uuid default auth.uid(),
  aberta_em            timestamptz not null default now(),
  fechada_em           timestamptz,
  cancelada_em         timestamptz,
  motivo_cancelamento  text check (char_length(motivo_cancelamento) <= 200),
  atualizado_em        timestamptz not null default now(),
  unique (salao_id, id),
  foreign key (salao_id, cliente_id) references public.clientes (salao_id, id),
  foreign key (salao_id, agendamento_id) references public.agendamentos (salao_id, id),
  check ((situacao = 'fechada') = (fechada_em is not null)),
  check ((situacao = 'cancelada') = (cancelada_em is not null))
);
-- Um agendamento tem no máximo uma comanda ativa (a cancelada não conta).
create unique index comandas_um_por_agendamento on public.comandas (agendamento_id)
  where agendamento_id is not null and situacao <> 'cancelada';
create index comandas_situacao_idx on public.comandas (salao_id, situacao, aberta_em);
comment on table public.comandas is 'A conta de um atendimento: itens em comanda_itens; pagamentos na parte 2b.';

create table public.comanda_itens (
  id                       uuid primary key default gen_random_uuid(),
  salao_id                 uuid not null references public.saloes (id),
  comanda_id               uuid not null,
  tipo                     public.tipo_item_comanda not null,
  servico_id               uuid,
  produto_id               uuid,
  profissional_id          uuid, -- obrigatório no serviço; no produto, quem vendeu (opcional)
  agendamento_item_id      uuid unique,
  quantidade               integer not null default 1 check (quantidade between 1 and 999),
  preco_tabela_centavos    bigint not null check (preco_tabela_centavos between 0 and 100000000),   -- preço do cadastro no dia
  preco_unitario_centavos  bigint not null check (preco_unitario_centavos between 0 and 100000000), -- preço cobrado
  desconto_centavos        bigint not null default 0 check (desconto_centavos >= 0),
  total_centavos           bigint generated always as (quantidade * preco_unitario_centavos - desconto_centavos) stored,
  regra_snapshot           jsonb, -- regra de comissão usada (preenchida na Etapa 5)
  criado_por               uuid default auth.uid(),
  criado_em                timestamptz not null default now(),
  removido_em              timestamptz,
  removido_por             uuid,
  motivo_remocao           text check (char_length(motivo_remocao) <= 200),
  unique (salao_id, id),
  foreign key (salao_id, comanda_id) references public.comandas (salao_id, id),
  foreign key (salao_id, servico_id) references public.servicos (salao_id, id),
  foreign key (salao_id, produto_id) references public.produtos (salao_id, id),
  foreign key (salao_id, profissional_id) references public.profissionais (salao_id, id),
  foreign key (salao_id, agendamento_item_id) references public.agendamento_itens (salao_id, id),
  check (quantidade * preco_unitario_centavos - desconto_centavos >= 0),
  check (
    (tipo = 'servico' and servico_id is not null and produto_id is null and profissional_id is not null and quantidade = 1)
    or (tipo = 'produto' and produto_id is not null and servico_id is null and agendamento_item_id is null)
  ),
  check ((removido_em is null) = (motivo_remocao is null))
);
create index comanda_itens_comanda_idx on public.comanda_itens (comanda_id);
create index comanda_itens_profissional_idx on public.comanda_itens (salao_id, profissional_id);
comment on table public.comanda_itens is 'Serviços e produtos da comanda. Item excluído fica marcado (removido_em + motivo).';

create table public.comanda_item_assistentes (
  salao_id         uuid not null references public.saloes (id),
  item_id          uuid not null,
  assistente_id    uuid not null,
  regra_snapshot   jsonb,  -- Etapa 5
  valor_centavos   bigint, -- Etapa 5
  criado_em        timestamptz not null default now(),
  primary key (item_id, assistente_id),
  foreign key (salao_id, item_id) references public.comanda_itens (salao_id, id),
  foreign key (salao_id, assistente_id) references public.profissionais (salao_id, id)
);
comment on table public.comanda_item_assistentes is 'Assistentes que ajudaram em um serviço da comanda.';

-- ---------------------------------------------------------------------------
-- Quem vê e quem mexe
-- ---------------------------------------------------------------------------
-- Vê a comanda: dono/recepção sempre; profissional se abriu ou atende nela.
create function privado.pode_ver_comanda(p_comanda_id uuid)
returns boolean
language sql stable security definer set search_path = ''
as $$
  select coalesce((
    select case privado.perfil_no_salao(c.salao_id)
      when 'dono' then true
      when 'recepcao' then true
      when 'profissional' then
        c.aberta_por = (select auth.uid())
        or exists (
          select 1 from public.comanda_itens i
          where i.comanda_id = c.id and i.profissional_id = privado.meu_profissional_id(c.salao_id))
      else false
    end
    from public.comandas c where c.id = p_comanda_id), false);
$$;

-- Mexe na comanda inteira (desconto geral; e, na parte 2b, pagar e fechar):
-- dono/recepção sempre; profissional só se pode ver e TODOS os itens ativos forem dela.
create function privado.pode_mexer_comanda(p_comanda_id uuid)
returns boolean
language sql stable security definer set search_path = ''
as $$
  select coalesce((
    select case privado.perfil_no_salao(c.salao_id)
      when 'dono' then true
      when 'recepcao' then true
      when 'profissional' then
        privado.pode_ver_comanda(c.id)
        and not exists (
          select 1 from public.comanda_itens i
          where i.comanda_id = c.id and i.removido_em is null
            and i.profissional_id is distinct from privado.meu_profissional_id(c.salao_id))
      else false
    end
    from public.comandas c where c.id = p_comanda_id), false);
$$;

-- Pode mudar preço/desconto? dono/recepção sempre; profissional se a chave estiver ligada.
create function privado.pode_alterar_preco(p_salao_id uuid)
returns boolean
language sql stable security definer set search_path = ''
as $$
  select case privado.perfil_no_salao(p_salao_id)
    when 'dono' then true
    when 'recepcao' then true
    when 'profissional' then coalesce(
      (select c.profissionais_alteram_preco from public.configuracao_salao c where c.salao_id = p_salao_id), false)
    else false
  end;
$$;

revoke all on function privado.pode_ver_comanda(uuid) from public;
revoke all on function privado.pode_mexer_comanda(uuid) from public;
revoke all on function privado.pode_alterar_preco(uuid) from public;
grant execute on function privado.pode_ver_comanda(uuid) to authenticated;
grant execute on function privado.pode_mexer_comanda(uuid) to authenticated;
grant execute on function privado.pode_alterar_preco(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- Auditoria e hora de alteração
-- ---------------------------------------------------------------------------
create trigger auditar_comandas after insert or update on public.comandas
  for each row execute function privado.auditar('salao_id');
create trigger auditar_comanda_itens after insert or update on public.comanda_itens
  for each row execute function privado.auditar('salao_id');
create trigger auditar_comanda_item_assistentes after insert or delete on public.comanda_item_assistentes
  for each row execute function privado.auditar('salao_id');
create trigger tocar_atualizado_em before update on public.comandas
  for each row execute function privado.tocar_atualizado_em();

-- ---------------------------------------------------------------------------
-- RLS: só leitura para o site; gravação pelas portas
-- ---------------------------------------------------------------------------
alter table public.comandas enable row level security;
alter table public.comanda_itens enable row level security;
alter table public.comanda_item_assistentes enable row level security;

revoke all on public.comandas, public.comanda_itens, public.comanda_item_assistentes from anon, authenticated;
grant select on public.comandas, public.comanda_itens, public.comanda_item_assistentes to authenticated;

create policy "vê as comandas que pode" on public.comandas
  for select to authenticated
  using (salao_id in (select privado.saloes_do_usuario()) and privado.pode_ver_comanda(id));

-- Itens: dono/recepção veem todos; profissional só os próprios (de comandas que ela vê).
create policy "vê os itens que pode" on public.comanda_itens
  for select to authenticated
  using (
    salao_id in (select privado.saloes_do_usuario())
    and (
      privado.perfil_no_salao(salao_id) in ('dono', 'recepcao')
      or (privado.perfil_no_salao(salao_id) = 'profissional'
          and profissional_id = privado.meu_profissional_id(salao_id))
    )
  );

create policy "vê as assistentes dos itens que pode" on public.comanda_item_assistentes
  for select to authenticated
  using (
    salao_id in (select privado.saloes_do_usuario())
    and exists (select 1 from public.comanda_itens i where i.id = item_id) -- a RLS dos itens decide
  );

-- ---------------------------------------------------------------------------
-- Funções de apoio
-- ---------------------------------------------------------------------------
-- Total da comanda (itens ativos menos o desconto geral), nunca abaixo de zero.
create function privado.total_comanda(p_comanda_id uuid)
returns bigint
language sql stable security definer set search_path = ''
as $$
  select greatest(
    coalesce((select sum(i.total_centavos) from public.comanda_itens i
              where i.comanda_id = p_comanda_id and i.removido_em is null), 0)
    - (select c.desconto_centavos from public.comandas c where c.id = p_comanda_id),
    0)::bigint;
$$;
revoke all on function privado.total_comanda(uuid) from public;
grant execute on function privado.total_comanda(uuid) to authenticated;

-- Confere se a comanda existe, está aberta e devolve o salão.
create function privado.comanda_aberta(p_comanda_id uuid)
returns uuid
language plpgsql stable security definer set search_path = ''
as $$
declare
  v public.comandas;
begin
  select * into v from public.comandas where id = p_comanda_id;
  if v.id is null or not privado.pode_ver_comanda(v.id) then
    raise exception 'Comanda não encontrada.' using errcode = '42501';
  end if;
  if v.situacao <> 'aberta' then
    raise exception 'Esta comanda não está aberta.' using errcode = '22023';
  end if;
  return v.salao_id;
end;
$$;
revoke all on function privado.comanda_aberta(uuid) from public;

-- ---------------------------------------------------------------------------
-- Porta: abrir comanda (avulsa ou a partir de um agendamento)
-- Se o agendamento já tem comanda ativa, devolve a mesma (para abrir sozinha ao concluir).
-- ---------------------------------------------------------------------------
create function public.abrir_comanda(p_salao_id uuid, p_cliente_id uuid, p_agendamento_id uuid default null)
returns uuid
language plpgsql security definer set search_path = ''
as $$
declare
  v_perfil  public.perfil_usuario := privado.perfil_no_salao(p_salao_id);
  v_ag      public.agendamentos;
  v_id      uuid;
begin
  if v_perfil is null or v_perfil not in ('dono', 'recepcao', 'profissional') then
    raise exception 'Você não pode abrir comandas neste salão.' using errcode = '42501';
  end if;
  if v_perfil = 'profissional' and privado.meu_profissional_id(p_salao_id) is null then
    raise exception 'Sua conta não está ligada a um cadastro em Quem atende.' using errcode = '42501';
  end if;
  if not exists (select 1 from public.clientes c where c.id = p_cliente_id and c.salao_id = p_salao_id and c.ativo) then
    raise exception 'Cliente não encontrada neste salão.' using errcode = '22023';
  end if;

  if p_agendamento_id is not null then
    select * into v_ag from public.agendamentos where id = p_agendamento_id;
    if v_ag.id is null or v_ag.salao_id <> p_salao_id or v_ag.cliente_id <> p_cliente_id then
      raise exception 'Agendamento não encontrado para esta cliente.' using errcode = '22023';
    end if;
    if not coalesce(privado.pode_mexer_agendamento(v_ag.id), false) then
      raise exception 'Este agendamento tem serviço de outra profissional; a comanda fica com a recepção ou o dono.' using errcode = '42501';
    end if;
    if v_ag.situacao in ('cancelado', 'faltou') then
      raise exception 'Agendamento cancelado ou com falta não gera comanda.' using errcode = '22023';
    end if;
    select c.id into v_id from public.comandas c where c.agendamento_id = v_ag.id and c.situacao <> 'cancelada';
    if v_id is not null then
      return v_id;
    end if;
  end if;

  insert into public.comandas (salao_id, cliente_id, agendamento_id)
  values (p_salao_id, p_cliente_id, p_agendamento_id)
  returning id into v_id;

  if p_agendamento_id is not null then
    insert into public.comanda_itens (
      salao_id, comanda_id, tipo, servico_id, profissional_id, agendamento_item_id,
      preco_tabela_centavos, preco_unitario_centavos)
    select p_salao_id, v_id, 'servico', i.servico_id, i.profissional_id, i.id, i.preco_centavos, i.preco_centavos
    from public.agendamento_itens i
    where i.agendamento_id = p_agendamento_id
    order by i.inicio;
  end if;

  return v_id;
end;
$$;

-- ---------------------------------------------------------------------------
-- Porta: lançar serviço ou produto
-- p_preco_unitario nulo = preço do cadastro. Mudar o preço ou dar desconto segue pode_alterar_preco.
-- ---------------------------------------------------------------------------
create function public.lancar_item_comanda(
  p_comanda_id uuid,
  p_tipo public.tipo_item_comanda,
  p_ref_id uuid,
  p_profissional_id uuid default null,
  p_quantidade integer default 1,
  p_preco_unitario bigint default null,
  p_desconto bigint default 0
)
returns uuid
language plpgsql security definer set search_path = ''
as $$
declare
  v_salao   uuid := privado.comanda_aberta(p_comanda_id);
  v_perfil  public.perfil_usuario := privado.perfil_no_salao(v_salao);
  v_eu      uuid := privado.meu_profissional_id(v_salao);
  v_prof    uuid := p_profissional_id;
  v_tabela  bigint;
  v_id      uuid;
begin
  if v_perfil is null or v_perfil not in ('dono', 'recepcao', 'profissional') then
    raise exception 'Você não pode lançar itens nesta comanda.' using errcode = '42501';
  end if;
  -- A profissional lança sempre em nome dela.
  if v_perfil = 'profissional' then
    if v_prof is not null and v_prof is distinct from v_eu then
      raise exception 'Você só pode lançar itens em seu nome.' using errcode = '42501';
    end if;
    v_prof := v_eu;
  end if;

  if p_tipo = 'servico' then
    select s.preco_centavos into v_tabela from public.servicos s where s.id = p_ref_id and s.salao_id = v_salao and s.ativo;
    if v_tabela is null then
      raise exception 'Serviço não encontrado neste salão.' using errcode = '22023';
    end if;
    if p_quantidade <> 1 then
      raise exception 'Serviço é lançado um de cada vez.' using errcode = '22023';
    end if;
    if v_prof is null then
      raise exception 'Escolha a profissional do serviço.' using errcode = '22023';
    end if;
  else
    select p.preco_centavos into v_tabela from public.produtos p where p.id = p_ref_id and p.salao_id = v_salao and p.ativo;
    if v_tabela is null then
      raise exception 'Produto não encontrado neste salão.' using errcode = '22023';
    end if;
  end if;

  if v_prof is not null and not exists (
    select 1 from public.profissionais p
    where p.id = v_prof and p.salao_id = v_salao and p.ativo and p.tipo = 'profissional'
  ) then
    raise exception 'Profissional não encontrada neste salão.' using errcode = '22023';
  end if;

  if (coalesce(p_preco_unitario, v_tabela) <> v_tabela or coalesce(p_desconto, 0) <> 0)
     and not coalesce(privado.pode_alterar_preco(v_salao), false) then
    raise exception 'Você não pode mudar o preço nem dar desconto. Peça à recepção ou ao dono.' using errcode = '42501';
  end if;
  if coalesce(p_desconto, 0) < 0 or coalesce(p_desconto, 0) > p_quantidade * coalesce(p_preco_unitario, v_tabela) then
    raise exception 'O desconto não pode ser maior que o valor do item.' using errcode = '22023';
  end if;

  insert into public.comanda_itens (
    salao_id, comanda_id, tipo, servico_id, produto_id, profissional_id, quantidade,
    preco_tabela_centavos, preco_unitario_centavos, desconto_centavos)
  values (
    v_salao, p_comanda_id, p_tipo,
    case when p_tipo = 'servico' then p_ref_id end,
    case when p_tipo = 'produto' then p_ref_id end,
    v_prof, p_quantidade, v_tabela, coalesce(p_preco_unitario, v_tabela), coalesce(p_desconto, 0))
  returning id into v_id;
  return v_id;
end;
$$;

-- ---------------------------------------------------------------------------
-- Porta: alterar quantidade, preço ou desconto de um item
-- ---------------------------------------------------------------------------
create function public.alterar_item_comanda(
  p_item_id uuid, p_quantidade integer, p_preco_unitario bigint, p_desconto bigint
)
returns void
language plpgsql security definer set search_path = ''
as $$
declare
  v_item    public.comanda_itens;
  v_salao   uuid;
  v_perfil  public.perfil_usuario;
begin
  select * into v_item from public.comanda_itens where id = p_item_id and removido_em is null;
  if v_item.id is null then
    raise exception 'Item não encontrado.' using errcode = '22023';
  end if;
  v_salao := privado.comanda_aberta(v_item.comanda_id);
  v_perfil := privado.perfil_no_salao(v_salao);

  if not coalesce(v_perfil in ('dono', 'recepcao')
          or (v_perfil = 'profissional' and v_item.profissional_id = privado.meu_profissional_id(v_salao)), false) then
    raise exception 'Você não pode alterar este item.' using errcode = '42501';
  end if;
  if (p_preco_unitario <> v_item.preco_unitario_centavos or p_desconto <> v_item.desconto_centavos)
     and not coalesce(privado.pode_alterar_preco(v_salao), false) then
    raise exception 'Você não pode mudar o preço nem dar desconto. Peça à recepção ou ao dono.' using errcode = '42501';
  end if;
  if v_item.tipo = 'servico' and p_quantidade <> 1 then
    raise exception 'Serviço é lançado um de cada vez.' using errcode = '22023';
  end if;
  if p_desconto < 0 or p_desconto > p_quantidade * p_preco_unitario then
    raise exception 'O desconto não pode ser maior que o valor do item.' using errcode = '22023';
  end if;

  update public.comanda_itens
  set quantidade = p_quantidade, preco_unitario_centavos = p_preco_unitario, desconto_centavos = p_desconto
  where id = p_item_id;
end;
$$;

-- ---------------------------------------------------------------------------
-- Porta: excluir item (dono/recepção, com motivo). O item fica marcado, não some.
-- ---------------------------------------------------------------------------
create function public.remover_item_comanda(p_item_id uuid, p_motivo text)
returns void
language plpgsql security definer set search_path = ''
as $$
declare
  v_item   public.comanda_itens;
  v_salao  uuid;
begin
  select * into v_item from public.comanda_itens where id = p_item_id and removido_em is null;
  if v_item.id is null then
    raise exception 'Item não encontrado.' using errcode = '22023';
  end if;
  v_salao := privado.comanda_aberta(v_item.comanda_id);
  if coalesce(privado.perfil_no_salao(v_salao) in ('dono', 'recepcao'), false) is not true then
    raise exception 'Só a recepção ou o dono podem excluir itens da comanda.' using errcode = '42501';
  end if;
  if char_length(btrim(coalesce(p_motivo, ''))) not between 3 and 200 then
    raise exception 'Escreva o motivo da exclusão (3 a 200 letras).' using errcode = '22023';
  end if;

  update public.comanda_itens
  set removido_em = now(), removido_por = auth.uid(), motivo_remocao = btrim(p_motivo)
  where id = p_item_id;
end;
$$;

-- ---------------------------------------------------------------------------
-- Porta: escolher as assistentes de um serviço (substitui a lista)
-- ---------------------------------------------------------------------------
create function public.definir_assistentes_item(p_item_id uuid, p_assistentes uuid[])
returns void
language plpgsql security definer set search_path = ''
as $$
declare
  v_item    public.comanda_itens;
  v_salao   uuid;
  v_perfil  public.perfil_usuario;
begin
  select * into v_item from public.comanda_itens where id = p_item_id and removido_em is null;
  if v_item.id is null then
    raise exception 'Item não encontrado.' using errcode = '22023';
  end if;
  v_salao := privado.comanda_aberta(v_item.comanda_id);
  v_perfil := privado.perfil_no_salao(v_salao);
  if not coalesce(v_perfil in ('dono', 'recepcao')
          or (v_perfil = 'profissional' and v_item.profissional_id = privado.meu_profissional_id(v_salao)), false) then
    raise exception 'Você não pode escolher assistentes para este item.' using errcode = '42501';
  end if;
  if v_item.tipo <> 'servico' then
    raise exception 'Assistente só em serviço.' using errcode = '22023';
  end if;
  if coalesce(array_length(p_assistentes, 1), 0) > 5 then
    raise exception 'No máximo 5 assistentes por serviço.' using errcode = '22023';
  end if;
  if exists (
    select 1 from unnest(coalesce(p_assistentes, '{}')) as x(id)
    where not exists (
      select 1 from public.profissionais p
      where p.id = x.id and p.salao_id = v_salao and p.tipo = 'assistente' and p.ativo)
  ) then
    raise exception 'Escolha apenas assistentes ativas deste salão.' using errcode = '22023';
  end if;

  delete from public.comanda_item_assistentes a
  where a.item_id = p_item_id and not (a.assistente_id = any (coalesce(p_assistentes, '{}')));
  insert into public.comanda_item_assistentes (salao_id, item_id, assistente_id)
  select distinct v_salao, p_item_id, x.id from unnest(coalesce(p_assistentes, '{}')) as x(id)
  on conflict do nothing;
end;
$$;

-- ---------------------------------------------------------------------------
-- Porta: desconto no total da comanda
-- ---------------------------------------------------------------------------
create function public.definir_desconto_comanda(p_comanda_id uuid, p_desconto bigint)
returns void
language plpgsql security definer set search_path = ''
as $$
declare
  v_salao  uuid := privado.comanda_aberta(p_comanda_id);
  v_soma   bigint;
begin
  if not privado.pode_mexer_comanda(p_comanda_id) or not coalesce(privado.pode_alterar_preco(v_salao), false) then
    raise exception 'Você não pode dar desconto nesta comanda.' using errcode = '42501';
  end if;
  select coalesce(sum(i.total_centavos), 0) into v_soma
  from public.comanda_itens i where i.comanda_id = p_comanda_id and i.removido_em is null;
  if p_desconto < 0 or p_desconto > v_soma then
    raise exception 'O desconto não pode ser maior que o total dos itens.' using errcode = '22023';
  end if;
  update public.comandas set desconto_centavos = p_desconto where id = p_comanda_id;
end;
$$;

-- ---------------------------------------------------------------------------
-- Porta: cancelar comanda aberta (dono/recepção, com motivo)
-- ---------------------------------------------------------------------------
create function public.cancelar_comanda(p_comanda_id uuid, p_motivo text)
returns void
language plpgsql security definer set search_path = ''
as $$
declare
  v_salao uuid := privado.comanda_aberta(p_comanda_id);
begin
  if coalesce(privado.perfil_no_salao(v_salao) in ('dono', 'recepcao'), false) is not true then
    raise exception 'Só a recepção ou o dono podem cancelar comandas.' using errcode = '42501';
  end if;
  if char_length(btrim(coalesce(p_motivo, ''))) not between 3 and 200 then
    raise exception 'Escreva o motivo do cancelamento (3 a 200 letras).' using errcode = '22023';
  end if;
  update public.comandas
  set situacao = 'cancelada', cancelada_em = now(), motivo_cancelamento = btrim(p_motivo)
  where id = p_comanda_id;
end;
$$;

-- ---------------------------------------------------------------------------
-- Consulta: total da comanda e se a pessoa pode mexer nela (para a tela)
-- ---------------------------------------------------------------------------
create function public.resumo_comanda(p_comanda_id uuid)
returns jsonb
language sql stable security definer set search_path = ''
as $$
  select case when privado.pode_ver_comanda(p_comanda_id) then jsonb_build_object(
    'total_centavos', privado.total_comanda(p_comanda_id),
    'pode_mexer', privado.pode_mexer_comanda(p_comanda_id),
    'pode_alterar_preco', privado.pode_alterar_preco((select c.salao_id from public.comandas c where c.id = p_comanda_id))
  ) end;
$$;

revoke all on function public.abrir_comanda(uuid, uuid, uuid) from public, anon;
revoke all on function public.lancar_item_comanda(uuid, public.tipo_item_comanda, uuid, uuid, integer, bigint, bigint) from public, anon;
revoke all on function public.alterar_item_comanda(uuid, integer, bigint, bigint) from public, anon;
revoke all on function public.remover_item_comanda(uuid, text) from public, anon;
revoke all on function public.definir_assistentes_item(uuid, uuid[]) from public, anon;
revoke all on function public.definir_desconto_comanda(uuid, bigint) from public, anon;
revoke all on function public.cancelar_comanda(uuid, text) from public, anon;
revoke all on function public.resumo_comanda(uuid) from public, anon;
grant execute on function public.abrir_comanda(uuid, uuid, uuid) to authenticated;
grant execute on function public.lancar_item_comanda(uuid, public.tipo_item_comanda, uuid, uuid, integer, bigint, bigint) to authenticated;
grant execute on function public.alterar_item_comanda(uuid, integer, bigint, bigint) to authenticated;
grant execute on function public.remover_item_comanda(uuid, text) to authenticated;
grant execute on function public.definir_assistentes_item(uuid, uuid[]) to authenticated;
grant execute on function public.definir_desconto_comanda(uuid, bigint) to authenticated;
grant execute on function public.cancelar_comanda(uuid, text) to authenticated;
grant execute on function public.resumo_comanda(uuid) to authenticated;
