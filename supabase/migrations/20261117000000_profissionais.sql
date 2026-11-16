-- Etapa 2, parte 2: profissionais e assistentes (quem atende)
-- Não exige e-mail nem acesso ao sistema. Pode ser ligado a alguém da equipe (ex.: "Sou eu").
-- Remuneração (fixo e comissão) fica para a Etapa 5, em tabela separada que só o dono vê.

create type public.tipo_profissional as enum ('profissional', 'assistente');

create table public.profissionais (
  id         uuid primary key default gen_random_uuid(),
  salao_id   uuid not null references public.saloes (id),
  nome       text not null check (char_length(btrim(nome)) between 2 and 80),
  tipo       public.tipo_profissional not null default 'profissional',
  user_id    uuid references auth.users (id) on delete set null, -- opcional: quem tem acesso ao sistema
  ativo      boolean not null default true,
  criado_em  timestamptz not null default now(),
  unique (salao_id, id)
);
create unique index profissionais_nome_unico on public.profissionais (salao_id, lower(btrim(nome)));
create unique index profissionais_usuario_unico on public.profissionais (salao_id, user_id) where user_id is not null;
comment on table public.profissionais is 'Quem atende no salão (profissionais e assistentes). Não exige conta no sistema.';

-- ---------------------------------------------------------------------------
-- O vínculo com uma conta só vale se a pessoa for da equipe do MESMO salão.
-- ---------------------------------------------------------------------------
create function privado.validar_vinculo_profissional()
returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  if new.user_id is not null and not exists (
    select 1 from public.usuarios_salao us
    where us.salao_id = new.salao_id and us.user_id = new.user_id
  ) then
    raise exception 'Só é possível ligar a alguém da equipe deste salão.' using errcode = '23514';
  end if;
  return new;
end;
$$;
revoke all on function privado.validar_vinculo_profissional() from public;

create trigger validar_vinculo_profissional
  before insert or update of user_id, salao_id on public.profissionais
  for each row execute function privado.validar_vinculo_profissional();

create trigger auditar_profissionais
  after insert or update on public.profissionais
  for each row execute function privado.auditar('salao_id');

-- ---------------------------------------------------------------------------
-- RLS: equipe do salão vê; só o dono cria e altera; ninguém apaga.
-- ---------------------------------------------------------------------------
alter table public.profissionais enable row level security;

revoke all on public.profissionais from anon, authenticated;
grant select on public.profissionais to authenticated;
grant insert (salao_id, nome, tipo, user_id) on public.profissionais to authenticated;
grant update (nome, tipo, user_id, ativo)    on public.profissionais to authenticated;

create policy "equipe vê quem atende" on public.profissionais
  for select to authenticated
  using (salao_id in (select privado.saloes_do_usuario()));

create policy "dono cadastra quem atende" on public.profissionais
  for insert to authenticated
  with check (privado.perfil_no_salao(salao_id) = 'dono');

create policy "dono altera quem atende" on public.profissionais
  for update to authenticated
  using (privado.perfil_no_salao(salao_id) = 'dono')
  with check (privado.perfil_no_salao(salao_id) = 'dono');
