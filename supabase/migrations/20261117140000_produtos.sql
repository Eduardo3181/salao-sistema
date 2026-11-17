-- Produtos à venda no salão (Etapa 4, fatia 1). Sem estoque por enquanto (decisão da dona, 17/11/2026).
-- Preço e custo em centavos. O CUSTO só o dono vê (a coluna não pode ser lida diretamente;
-- o dono lê pela função custos_dos_produtos).
create table public.produtos (
  id              uuid primary key default gen_random_uuid(),
  salao_id        uuid not null references public.saloes (id),
  nome            text not null check (char_length(btrim(nome)) between 2 and 120),
  preco_centavos  bigint not null check (preco_centavos between 0 and 100000000), -- até R$ 1 milhão
  custo_centavos  bigint check (custo_centavos between 0 and 100000000),           -- opcional
  ativo           boolean not null default true,
  criado_em       timestamptz not null default now(),
  atualizado_em   timestamptz not null default now(),
  unique (salao_id, id)
);
create unique index produtos_nome_unico on public.produtos (salao_id, lower(btrim(nome)));
comment on table public.produtos is 'Produtos à venda, com preço e custo (opcional) em centavos.';

create trigger auditar_produtos after insert or update on public.produtos
  for each row execute function privado.auditar('salao_id');
create trigger tocar_atualizado_em before update on public.produtos
  for each row execute function privado.tocar_atualizado_em();

alter table public.produtos enable row level security;
revoke all on public.produtos from anon, authenticated;
-- Todas as colunas, menos o custo
grant select (id, salao_id, nome, preco_centavos, ativo, criado_em, atualizado_em) on public.produtos to authenticated;
grant insert (salao_id, nome, preco_centavos, custo_centavos) on public.produtos to authenticated;
grant update (nome, preco_centavos, custo_centavos, ativo) on public.produtos to authenticated;

create policy "equipe vê os produtos" on public.produtos
  for select to authenticated
  using (salao_id in (select privado.saloes_do_usuario()));

create policy "dono cria produtos" on public.produtos
  for insert to authenticated
  with check (privado.perfil_no_salao(salao_id) = 'dono');

create policy "dono altera produtos" on public.produtos
  for update to authenticated
  using (privado.perfil_no_salao(salao_id) = 'dono')
  with check (privado.perfil_no_salao(salao_id) = 'dono');

-- O dono lê o custo por aqui; para os outros perfis volta vazio.
create function public.custos_dos_produtos(p_salao_id uuid)
returns table (id uuid, custo_centavos bigint)
language sql stable security definer set search_path = ''
as $$
  select p.id, p.custo_centavos
  from public.produtos p
  where p.salao_id = p_salao_id
    and coalesce(privado.perfil_no_salao(p_salao_id) = 'dono', false);
$$;
revoke all on function public.custos_dos_produtos(uuid) from public, anon;
grant execute on function public.custos_dos_produtos(uuid) to authenticated;
