-- Etapa 3, parte 2: base da agenda.
-- Regras (decisões da dona em docs/02-decisoes.md):
--  * dono e recepção veem e mexem em todas as agendas;
--  * profissional vê e mexe só na própria agenda (marca horário para cliente, remarca, muda situação);
--  * assistente (se o dono der acesso) só VÊ a agenda das profissionais que ela ajuda;
--  * encaixe é permitido (a tela avisa); horário no passado só dono e recepção;
--  * cancelar exige motivo quando o salão configurou assim.
-- Gravações passam por funções (portas) que conferem tudo de uma vez; as tabelas são só leitura para o site.

create type public.situacao_agendamento as enum ('agendado', 'confirmado', 'chegou', 'concluido', 'faltou', 'cancelado');
create type public.motivo_cancelamento as enum ('cliente_desmarcou', 'salao_desmarcou', 'outro');

-- ---------------------------------------------------------------------------
-- Tabelas
-- ---------------------------------------------------------------------------
create table public.agendamentos (
  id                   uuid primary key default gen_random_uuid(),
  salao_id             uuid not null references public.saloes (id),
  cliente_id           uuid not null,
  situacao             public.situacao_agendamento not null default 'agendado',
  motivo_cancelamento  public.motivo_cancelamento,
  cancelado_em         timestamptz,
  criado_por           uuid default auth.uid(),
  criado_em            timestamptz not null default now(),
  atualizado_em        timestamptz not null default now(),
  unique (salao_id, id),
  foreign key (salao_id, cliente_id) references public.clientes (salao_id, id),
  check ((situacao = 'cancelado') = (cancelado_em is not null))
);
comment on table public.agendamentos is 'Um agendamento de uma cliente; os serviços ficam em agendamento_itens.';

create table public.agendamento_itens (
  id               uuid primary key default gen_random_uuid(),
  salao_id         uuid not null references public.saloes (id),
  agendamento_id   uuid not null,
  servico_id       uuid not null,
  profissional_id  uuid not null,
  inicio           timestamptz not null,
  fim              timestamptz not null,
  preco_centavos   bigint not null check (preco_centavos >= 0), -- preço do serviço no dia em que foi marcado
  criado_em        timestamptz not null default now(),
  check (fim > inicio and fim - inicio <= interval '12 hours'),
  check (extract(minute from inicio at time zone 'America/Sao_Paulo')::int % 5 = 0),
  foreign key (salao_id, agendamento_id) references public.agendamentos (salao_id, id) on delete cascade,
  foreign key (salao_id, profissional_id) references public.profissionais (salao_id, id)
);
-- a categoria/serviço também precisa ser do mesmo salão
alter table public.servicos add constraint servicos_salao_id_unico unique (salao_id, id);
alter table public.agendamento_itens
  add foreign key (salao_id, servico_id) references public.servicos (salao_id, id);
create index agendamento_itens_agenda_idx on public.agendamento_itens (salao_id, profissional_id, inicio);
create index agendamento_itens_agendamento_idx on public.agendamento_itens (agendamento_id);
comment on table public.agendamento_itens is 'Cada serviço de um agendamento, com profissional, horário e preço do dia.';

create table public.bloqueios (
  id               uuid primary key default gen_random_uuid(),
  salao_id         uuid not null references public.saloes (id),
  profissional_id  uuid, -- nulo = salão inteiro (feriado)
  inicio           timestamptz not null,
  fim              timestamptz not null,
  motivo           text check (char_length(motivo) <= 120),
  criado_por       uuid default auth.uid(),
  criado_em        timestamptz not null default now(),
  check (fim > inicio and fim - inicio <= interval '62 days'),
  foreign key (salao_id, profissional_id) references public.profissionais (salao_id, id)
);
create index bloqueios_agenda_idx on public.bloqueios (salao_id, profissional_id, inicio);
comment on table public.bloqueios is 'Folga, médico, almoço (de uma profissional) ou feriado (salão inteiro).';

-- Quais profissionais cada assistente ajuda (o dono escolhe; tela na parte 6).
create table public.assistentes_profissionais (
  salao_id         uuid not null references public.saloes (id),
  assistente_id    uuid not null,
  profissional_id  uuid not null,
  criado_em        timestamptz not null default now(),
  primary key (salao_id, assistente_id, profissional_id),
  foreign key (salao_id, assistente_id) references public.profissionais (salao_id, id),
  foreign key (salao_id, profissional_id) references public.profissionais (salao_id, id),
  check (assistente_id <> profissional_id)
);

-- ---------------------------------------------------------------------------
-- Quem é "eu" na agenda e quais agendas eu enxergo
-- ---------------------------------------------------------------------------
create function privado.meu_profissional_id(p_salao_id uuid)
returns uuid
language sql stable security definer set search_path = ''
as $$
  select p.id from public.profissionais p
  where p.salao_id = p_salao_id and p.user_id = (select auth.uid()) and p.ativo
  limit 1;
$$;

create function privado.profissionais_visiveis(p_salao_id uuid)
returns setof uuid
language sql stable security definer set search_path = ''
as $$
  select p.id from public.profissionais p
  where p.salao_id = p_salao_id
    and (
      privado.perfil_no_salao(p_salao_id) in ('dono', 'recepcao')
      or (privado.perfil_no_salao(p_salao_id) = 'profissional' and p.id = privado.meu_profissional_id(p_salao_id))
      or (privado.perfil_no_salao(p_salao_id) = 'assistente' and p.id in (
            select ap.profissional_id from public.assistentes_profissionais ap
            where ap.salao_id = p_salao_id and ap.assistente_id = privado.meu_profissional_id(p_salao_id)))
    );
$$;

-- Pode mexer neste agendamento? Dono/recepção sempre; profissional só se TODOS os serviços forem dela.
create function privado.pode_mexer_agendamento(p_agendamento_id uuid)
returns boolean
language sql stable security definer set search_path = ''
as $$
  select case privado.perfil_no_salao(a.salao_id)
    when 'dono' then true
    when 'recepcao' then true
    when 'profissional' then not exists (
      select 1 from public.agendamento_itens i
      where i.agendamento_id = a.id and i.profissional_id is distinct from privado.meu_profissional_id(a.salao_id))
    else false
  end
  from public.agendamentos a where a.id = p_agendamento_id;
$$;

revoke all on function privado.meu_profissional_id(uuid) from public;
revoke all on function privado.profissionais_visiveis(uuid) from public;
revoke all on function privado.pode_mexer_agendamento(uuid) from public;
grant execute on function privado.meu_profissional_id(uuid) to authenticated;
grant execute on function privado.profissionais_visiveis(uuid) to authenticated;
grant execute on function privado.pode_mexer_agendamento(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- Auditoria e hora de alteração
-- ---------------------------------------------------------------------------
create trigger auditar_agendamentos after insert or update on public.agendamentos
  for each row execute function privado.auditar('salao_id');
create trigger auditar_agendamento_itens after insert or update or delete on public.agendamento_itens
  for each row execute function privado.auditar('salao_id');
create trigger auditar_bloqueios after insert or update or delete on public.bloqueios
  for each row execute function privado.auditar('salao_id');
create trigger auditar_assistentes_profissionais after insert or delete on public.assistentes_profissionais
  for each row execute function privado.auditar('salao_id');
create trigger tocar_atualizado_em before update on public.agendamentos
  for each row execute function privado.tocar_atualizado_em();

-- ---------------------------------------------------------------------------
-- RLS: leitura conforme o perfil; gravação de agendamentos só pelas funções abaixo
-- ---------------------------------------------------------------------------
alter table public.agendamentos enable row level security;
alter table public.agendamento_itens enable row level security;
alter table public.bloqueios enable row level security;
alter table public.assistentes_profissionais enable row level security;

revoke all on public.agendamentos, public.agendamento_itens, public.bloqueios, public.assistentes_profissionais
  from anon, authenticated;
grant select on public.agendamentos, public.agendamento_itens, public.bloqueios, public.assistentes_profissionais
  to authenticated;

create policy "vê itens das agendas que pode ver" on public.agendamento_itens
  for select to authenticated
  using (profissional_id in (select privado.profissionais_visiveis(salao_id)));

create policy "vê agendamentos com algum item visível" on public.agendamentos
  for select to authenticated
  using (
    privado.perfil_no_salao(salao_id) in ('dono', 'recepcao')
    or exists (
      select 1 from public.agendamento_itens i
      where i.agendamento_id = agendamentos.id
        and i.profissional_id in (select privado.profissionais_visiveis(agendamentos.salao_id))
    )
  );

-- Bloqueios: quem vê a agenda vê o bloqueio; feriado (sem profissional) toda a equipe vê.
create policy "vê bloqueios" on public.bloqueios
  for select to authenticated
  using (
    salao_id in (select privado.saloes_do_usuario())
    and (profissional_id is null or profissional_id in (select privado.profissionais_visiveis(salao_id)))
  );

grant insert (salao_id, profissional_id, inicio, fim, motivo) on public.bloqueios to authenticated;
grant delete on public.bloqueios to authenticated;

-- Dono e recepção bloqueiam qualquer agenda; profissional só a própria; feriado só o dono.
create policy "cria bloqueios conforme o perfil" on public.bloqueios
  for insert to authenticated
  with check (
    case
      when profissional_id is null then privado.perfil_no_salao(salao_id) = 'dono'
      else privado.perfil_no_salao(salao_id) in ('dono', 'recepcao')
        or (privado.perfil_no_salao(salao_id) = 'profissional' and profissional_id = privado.meu_profissional_id(salao_id))
    end
  );

create policy "apaga bloqueios conforme o perfil" on public.bloqueios
  for delete to authenticated
  using (
    case
      when profissional_id is null then privado.perfil_no_salao(salao_id) = 'dono'
      else privado.perfil_no_salao(salao_id) in ('dono', 'recepcao')
        or (privado.perfil_no_salao(salao_id) = 'profissional' and profissional_id = privado.meu_profissional_id(salao_id))
    end
  );

create policy "dono e recepção veem quem a assistente ajuda" on public.assistentes_profissionais
  for select to authenticated
  using (privado.perfil_no_salao(salao_id) in ('dono', 'recepcao'));

-- ---------------------------------------------------------------------------
-- Porta: marcar horário
-- p_itens: [{ "servico_id", "profissional_id", "inicio" (com fuso), "duracao_min" (opcional) }]
-- ---------------------------------------------------------------------------
create function public.criar_agendamento(p_salao_id uuid, p_cliente_id uuid, p_itens jsonb)
returns uuid
language plpgsql security definer set search_path = ''
as $$
declare
  v_perfil   public.perfil_usuario := privado.perfil_no_salao(p_salao_id);
  v_eu       uuid := privado.meu_profissional_id(p_salao_id);
  v_id       uuid;
  v_item     jsonb;
  v_servico  record;
  v_inicio   timestamptz;
  v_duracao  integer;
begin
  if v_perfil is null or v_perfil not in ('dono', 'recepcao', 'profissional') then
    raise exception 'Você não pode marcar horários neste salão.' using errcode = '42501';
  end if;
  if jsonb_typeof(p_itens) <> 'array' or jsonb_array_length(p_itens) not between 1 and 10 then
    raise exception 'Escolha de 1 a 10 serviços.' using errcode = '22023';
  end if;
  if not exists (select 1 from public.clientes c where c.id = p_cliente_id and c.salao_id = p_salao_id and c.ativo) then
    raise exception 'Cliente não encontrada neste salão.' using errcode = '22023';
  end if;

  insert into public.agendamentos (salao_id, cliente_id) values (p_salao_id, p_cliente_id) returning id into v_id;

  for v_item in select * from jsonb_array_elements(p_itens) loop
    select s.id, s.duracao_min, s.preco_centavos into v_servico
    from public.servicos s where s.id = (v_item ->> 'servico_id')::uuid and s.salao_id = p_salao_id and s.ativo;
    if v_servico.id is null then
      raise exception 'Serviço não encontrado neste salão.' using errcode = '22023';
    end if;

    if not exists (
      select 1 from public.profissionais p
      where p.id = (v_item ->> 'profissional_id')::uuid and p.salao_id = p_salao_id and p.ativo and p.tipo = 'profissional'
    ) then
      raise exception 'Profissional não encontrada neste salão.' using errcode = '22023';
    end if;
    if v_perfil = 'profissional' and (v_item ->> 'profissional_id')::uuid is distinct from v_eu then
      raise exception 'Você só pode marcar horários na sua própria agenda.' using errcode = '42501';
    end if;

    v_inicio := (v_item ->> 'inicio')::timestamptz;
    if v_inicio < now() - interval '5 minutes' and v_perfil = 'profissional' then
      raise exception 'Horário no passado só pode ser marcado pela recepção ou pelo dono.' using errcode = '42501';
    end if;
    v_duracao := coalesce((v_item ->> 'duracao_min')::integer, v_servico.duracao_min);
    if v_duracao not between 5 and 720 then
      raise exception 'Duração inválida.' using errcode = '22023';
    end if;

    insert into public.agendamento_itens (salao_id, agendamento_id, servico_id, profissional_id, inicio, fim, preco_centavos)
    values (
      p_salao_id, v_id, v_servico.id, (v_item ->> 'profissional_id')::uuid,
      v_inicio, v_inicio + make_interval(mins => v_duracao), v_servico.preco_centavos
    );
  end loop;

  return v_id;
end;
$$;

-- ---------------------------------------------------------------------------
-- Porta: mudar a situação (inclui cancelar)
-- ---------------------------------------------------------------------------
create function public.mudar_situacao_agendamento(
  p_agendamento_id uuid, p_situacao public.situacao_agendamento, p_motivo public.motivo_cancelamento default null
)
returns void
language plpgsql security definer set search_path = ''
as $$
declare
  v_salao   uuid;
  v_exigir  boolean;
begin
  select salao_id into v_salao from public.agendamentos where id = p_agendamento_id;
  if v_salao is null or not coalesce(privado.pode_mexer_agendamento(p_agendamento_id), false) then
    raise exception 'Você não pode alterar este agendamento.' using errcode = '42501';
  end if;

  if p_situacao = 'cancelado' then
    select coalesce((select c.exigir_motivo_cancelamento from public.configuracao_salao c where c.salao_id = v_salao), true)
      into v_exigir;
    if v_exigir and p_motivo is null then
      raise exception 'Escolha o motivo do cancelamento.' using errcode = '22023';
    end if;
  end if;

  update public.agendamentos set
    situacao = p_situacao,
    motivo_cancelamento = case when p_situacao = 'cancelado' then p_motivo end,
    cancelado_em = case when p_situacao = 'cancelado' then coalesce(cancelado_em, now()) end
  where id = p_agendamento_id;
end;
$$;

-- ---------------------------------------------------------------------------
-- Porta: remarcar um serviço (horário, duração e/ou profissional)
-- ---------------------------------------------------------------------------
create function public.remarcar_item(
  p_item_id uuid, p_inicio timestamptz, p_profissional_id uuid default null, p_duracao_min integer default null
)
returns void
language plpgsql security definer set search_path = ''
as $$
declare
  v_item     public.agendamento_itens;
  v_perfil   public.perfil_usuario;
  v_situacao public.situacao_agendamento;
  v_prof     uuid;
  v_duracao  integer;
begin
  select * into v_item from public.agendamento_itens where id = p_item_id;
  if v_item.id is null then
    raise exception 'Horário não encontrado.' using errcode = '22023';
  end if;
  v_perfil := privado.perfil_no_salao(v_item.salao_id);
  v_prof := coalesce(p_profissional_id, v_item.profissional_id);

  if not (
    v_perfil in ('dono', 'recepcao')
    or (v_perfil = 'profissional'
        and v_item.profissional_id = privado.meu_profissional_id(v_item.salao_id)
        and v_prof = v_item.profissional_id)
  ) then
    raise exception 'Você não pode remarcar este horário.' using errcode = '42501';
  end if;

  select situacao into v_situacao from public.agendamentos where id = v_item.agendamento_id;
  if v_situacao in ('cancelado', 'concluido', 'faltou') then
    raise exception 'Este agendamento já foi encerrado e não pode ser remarcado.' using errcode = '22023';
  end if;
  if p_inicio < now() - interval '5 minutes' and v_perfil = 'profissional' then
    raise exception 'Horário no passado só pode ser marcado pela recepção ou pelo dono.' using errcode = '42501';
  end if;
  if not exists (
    select 1 from public.profissionais p
    where p.id = v_prof and p.salao_id = v_item.salao_id and p.ativo and p.tipo = 'profissional'
  ) then
    raise exception 'Profissional não encontrada neste salão.' using errcode = '22023';
  end if;

  v_duracao := coalesce(p_duracao_min, (extract(epoch from v_item.fim - v_item.inicio) / 60)::integer);
  if v_duracao not between 5 and 720 then
    raise exception 'Duração inválida.' using errcode = '22023';
  end if;

  update public.agendamento_itens
  set inicio = p_inicio, fim = p_inicio + make_interval(mins => v_duracao), profissional_id = v_prof
  where id = p_item_id;
end;
$$;

-- ---------------------------------------------------------------------------
-- Consulta: o horário bate com outro atendimento ou bloqueio? (para o aviso de encaixe)
-- Só conta o que a pessoa pode ver.
-- ---------------------------------------------------------------------------
create function public.conflitos_agenda(
  p_salao_id uuid, p_profissional_id uuid, p_inicio timestamptz, p_fim timestamptz, p_ignorar_item uuid default null
)
returns jsonb
language sql stable security definer set search_path = ''
as $$
  select case
    when p_profissional_id not in (select privado.profissionais_visiveis(p_salao_id)) then null
    else jsonb_build_object(
      'atendimentos', (
        select count(*) from public.agendamento_itens i
        join public.agendamentos a on a.id = i.agendamento_id
        where i.salao_id = p_salao_id and i.profissional_id = p_profissional_id
          and a.situacao not in ('cancelado', 'faltou')
          and i.inicio < p_fim and i.fim > p_inicio
          and i.id is distinct from p_ignorar_item),
      'bloqueios', (
        select count(*) from public.bloqueios b
        where b.salao_id = p_salao_id
          and (b.profissional_id is null or b.profissional_id = p_profissional_id)
          and b.inicio < p_fim and b.fim > p_inicio)
    )
  end;
$$;

revoke all on function public.criar_agendamento(uuid, uuid, jsonb) from public, anon;
revoke all on function public.mudar_situacao_agendamento(uuid, public.situacao_agendamento, public.motivo_cancelamento) from public, anon;
revoke all on function public.remarcar_item(uuid, timestamptz, uuid, integer) from public, anon;
revoke all on function public.conflitos_agenda(uuid, uuid, timestamptz, timestamptz, uuid) from public, anon;
grant execute on function public.criar_agendamento(uuid, uuid, jsonb) to authenticated;
grant execute on function public.mudar_situacao_agendamento(uuid, public.situacao_agendamento, public.motivo_cancelamento) to authenticated;
grant execute on function public.remarcar_item(uuid, timestamptz, uuid, integer) to authenticated;
grant execute on function public.conflitos_agenda(uuid, uuid, timestamptz, timestamptz, uuid) to authenticated;
