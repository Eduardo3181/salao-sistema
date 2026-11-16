-- Etapa 1: fundação
-- Salões, usuários de cada salão (com perfil) e registro de auditoria.
-- Regra de ouro: toda tabela tem RLS; um salão nunca enxerga dados de outro.

-- ---------------------------------------------------------------------------
-- Schema "privado": funções auxiliares que NÃO ficam expostas na API pública.
-- ---------------------------------------------------------------------------
create schema if not exists privado;
revoke all on schema privado from public;
grant usage on schema privado to authenticated;

-- ---------------------------------------------------------------------------
-- Tipos
-- ---------------------------------------------------------------------------
create type public.perfil_usuario as enum ('dono', 'recepcao', 'profissional');

-- ---------------------------------------------------------------------------
-- Tabelas
-- ---------------------------------------------------------------------------
create table public.saloes (
  id         uuid primary key default gen_random_uuid(),
  nome       text not null check (char_length(btrim(nome)) between 2 and 120),
  plano      text not null default 'piloto',
  status     text not null default 'ativo' check (status in ('ativo', 'suspenso', 'cancelado')),
  criado_em  timestamptz not null default now()
);
comment on table public.saloes is 'Cada salão cliente do sistema.';

create table public.usuarios_salao (
  id         uuid primary key default gen_random_uuid(),
  salao_id   uuid not null references public.saloes (id) on delete cascade,
  user_id    uuid not null references auth.users (id) on delete cascade,
  perfil     public.perfil_usuario not null,
  ativo      boolean not null default true,
  criado_em  timestamptz not null default now(),
  unique (salao_id, user_id)
);
comment on table public.usuarios_salao is 'Quem acessa cada salão e com qual perfil.';
create index usuarios_salao_user_id_idx on public.usuarios_salao (user_id);

create table public.audit_log (
  id           bigint generated always as identity primary key,
  salao_id     uuid not null references public.saloes (id),
  user_id      uuid,          -- sem chave estrangeira: o registro sobrevive se o usuário for apagado
  acao         text not null, -- insert, update, delete
  entidade     text not null, -- nome da tabela
  entidade_id  uuid,
  antes        jsonb,
  depois       jsonb,
  em           timestamptz not null default now()
);
comment on table public.audit_log is 'Quem fez o quê. Só leitura para o dono; escrito apenas por gatilhos do banco.';
create index audit_log_salao_em_idx on public.audit_log (salao_id, em desc);

-- ---------------------------------------------------------------------------
-- Funções auxiliares usadas pelas regras de acesso (RLS)
-- security definer + search_path vazio: evitam recursão e sequestro de nomes.
-- ---------------------------------------------------------------------------
create function privado.saloes_do_usuario()
returns setof uuid
language sql stable security definer set search_path = ''
as $$
  select us.salao_id
  from public.usuarios_salao us
  where us.user_id = (select auth.uid()) and us.ativo;
$$;

create function privado.perfil_no_salao(p_salao_id uuid)
returns public.perfil_usuario
language sql stable security definer set search_path = ''
as $$
  select us.perfil
  from public.usuarios_salao us
  where us.salao_id = p_salao_id and us.user_id = (select auth.uid()) and us.ativo;
$$;

revoke all on function privado.saloes_do_usuario() from public;
revoke all on function privado.perfil_no_salao(uuid) from public;
grant execute on function privado.saloes_do_usuario() to authenticated;
grant execute on function privado.perfil_no_salao(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- Auditoria automática (gatilho)
-- tg_argv[0] = nome da coluna que guarda o id do salão ('id' em saloes).
-- ---------------------------------------------------------------------------
create function privado.auditar()
returns trigger
language plpgsql security definer set search_path = ''
as $$
declare
  v_antes  jsonb := case when tg_op <> 'INSERT' then to_jsonb(old) end;
  v_depois jsonb := case when tg_op <> 'DELETE' then to_jsonb(new) end;
  v_linha  jsonb := coalesce(v_depois, v_antes);
begin
  if tg_op = 'UPDATE' and v_antes = v_depois then
    return null; -- nada mudou de verdade
  end if;

  insert into public.audit_log (salao_id, user_id, acao, entidade, entidade_id, antes, depois)
  values (
    (v_linha ->> tg_argv[0])::uuid,
    auth.uid(),
    lower(tg_op),
    tg_table_name,
    (v_linha ->> 'id')::uuid,
    v_antes,
    v_depois
  );
  return null;
end;
$$;
revoke all on function privado.auditar() from public;

create trigger auditar_saloes
  after insert or update on public.saloes
  for each row execute function privado.auditar('id');

create trigger auditar_usuarios_salao
  after insert or update or delete on public.usuarios_salao
  for each row execute function privado.auditar('salao_id');

-- ---------------------------------------------------------------------------
-- RLS: ligada em todas as tabelas
-- ---------------------------------------------------------------------------
alter table public.saloes         enable row level security;
alter table public.usuarios_salao enable row level security;
alter table public.audit_log      enable row level security;

-- Visitante sem login não acessa nada.
revoke all on public.saloes, public.usuarios_salao, public.audit_log from anon;

-- Usuário logado: só o que as regras abaixo permitem.
revoke all on public.saloes, public.usuarios_salao, public.audit_log from authenticated;
grant select on public.saloes, public.usuarios_salao, public.audit_log to authenticated;
grant update (nome) on public.saloes to authenticated; -- plano e status só o sistema altera

-- saloes
create policy "ver os próprios salões" on public.saloes
  for select to authenticated
  using (id in (select privado.saloes_do_usuario()));

create policy "dono altera o nome do salão" on public.saloes
  for update to authenticated
  using (privado.perfil_no_salao(id) = 'dono')
  with check (privado.perfil_no_salao(id) = 'dono');

-- usuarios_salao (convites e mudança de perfil virão na próxima fatia)
create policy "ver a equipe do próprio salão" on public.usuarios_salao
  for select to authenticated
  using (salao_id in (select privado.saloes_do_usuario()));

-- audit_log: só o dono lê; ninguém altera nem apaga
create policy "dono vê a auditoria do salão" on public.audit_log
  for select to authenticated
  using (privado.perfil_no_salao(salao_id) = 'dono');

-- ---------------------------------------------------------------------------
-- Criar salão: quem está logado cria um salão e vira dono dele.
-- ---------------------------------------------------------------------------
create function public.criar_salao(p_nome text)
returns uuid
language plpgsql security definer set search_path = ''
as $$
declare
  v_user uuid := auth.uid();
  v_nome text := btrim(p_nome);
  v_id   uuid;
begin
  if v_user is null then
    raise exception 'É preciso estar logado para criar um salão.' using errcode = '42501';
  end if;
  if v_nome is null or char_length(v_nome) not between 2 and 120 then
    raise exception 'O nome do salão deve ter entre 2 e 120 letras.' using errcode = '22023';
  end if;

  insert into public.saloes (nome) values (v_nome) returning id into v_id;
  insert into public.usuarios_salao (salao_id, user_id, perfil) values (v_id, v_user, 'dono');
  return v_id;
end;
$$;
revoke all on function public.criar_salao(text) from public, anon;
grant execute on function public.criar_salao(text) to authenticated;
