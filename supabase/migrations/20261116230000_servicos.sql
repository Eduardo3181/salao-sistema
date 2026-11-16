-- Etapa 2, parte 1: categorias de serviço e serviços
-- Só o dono cadastra e altera; toda a equipe do salão consulta.
-- Nada é apagado: itens ficam inativos (ativo = false).

-- ---------------------------------------------------------------------------
-- Tabelas
-- ---------------------------------------------------------------------------
create table public.categorias_servico (
  id         uuid primary key default gen_random_uuid(),
  salao_id   uuid not null references public.saloes (id),
  nome       text not null check (char_length(btrim(nome)) between 2 and 60),
  ativo      boolean not null default true,
  criado_em  timestamptz not null default now(),
  unique (salao_id, id) -- permite que serviços apontem para (salao_id, id)
);
create unique index categorias_servico_nome_unico on public.categorias_servico (salao_id, lower(btrim(nome)));
comment on table public.categorias_servico is 'Agrupa os serviços do salão (ex.: Cabelo, Unhas).';

create table public.servicos (
  id              uuid primary key default gen_random_uuid(),
  salao_id        uuid not null references public.saloes (id),
  categoria_id    uuid not null,
  nome            text not null check (char_length(btrim(nome)) between 2 and 120),
  duracao_min     integer not null check (duracao_min between 5 and 720),
  preco_centavos  bigint not null check (preco_centavos between 0 and 100000000), -- até R$ 1 milhão
  ativo           boolean not null default true,
  criado_em       timestamptz not null default now(),
  -- a categoria precisa ser do MESMO salão
  foreign key (salao_id, categoria_id) references public.categorias_servico (salao_id, id)
);
create unique index servicos_nome_unico on public.servicos (salao_id, lower(btrim(nome)));
create index servicos_categoria_idx on public.servicos (salao_id, categoria_id);
comment on table public.servicos is 'Serviços do salão, com duração em minutos e preço em centavos.';

-- ---------------------------------------------------------------------------
-- Auditoria
-- ---------------------------------------------------------------------------
create trigger auditar_categorias_servico
  after insert or update on public.categorias_servico
  for each row execute function privado.auditar('salao_id');

create trigger auditar_servicos
  after insert or update on public.servicos
  for each row execute function privado.auditar('salao_id');

-- ---------------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------------
alter table public.categorias_servico enable row level security;
alter table public.servicos           enable row level security;

revoke all on public.categorias_servico, public.servicos from anon, authenticated;
grant select on public.categorias_servico, public.servicos to authenticated;
grant insert (salao_id, nome) on public.categorias_servico to authenticated;
grant update (nome, ativo)    on public.categorias_servico to authenticated;
grant insert (salao_id, categoria_id, nome, duracao_min, preco_centavos) on public.servicos to authenticated;
grant update (categoria_id, nome, duracao_min, preco_centavos, ativo)    on public.servicos to authenticated;

-- Toda a equipe ativa do salão consulta
create policy "equipe vê as categorias" on public.categorias_servico
  for select to authenticated
  using (salao_id in (select privado.saloes_do_usuario()));

create policy "equipe vê os serviços" on public.servicos
  for select to authenticated
  using (salao_id in (select privado.saloes_do_usuario()));

-- Só o dono cria e altera
create policy "dono cria categorias" on public.categorias_servico
  for insert to authenticated
  with check (privado.perfil_no_salao(salao_id) = 'dono');

create policy "dono altera categorias" on public.categorias_servico
  for update to authenticated
  using (privado.perfil_no_salao(salao_id) = 'dono')
  with check (privado.perfil_no_salao(salao_id) = 'dono');

create policy "dono cria serviços" on public.servicos
  for insert to authenticated
  with check (privado.perfil_no_salao(salao_id) = 'dono');

create policy "dono altera serviços" on public.servicos
  for update to authenticated
  using (privado.perfil_no_salao(salao_id) = 'dono')
  with check (privado.perfil_no_salao(salao_id) = 'dono');
