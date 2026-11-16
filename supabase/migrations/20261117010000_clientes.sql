-- Etapa 2, parte 3: clientes e configurações do salão
-- Ficha mínima (LGPD): nome, telefone, nascimento e observações. Sem CPF e sem endereço.
-- Dono e recepção sempre editam clientes; profissionais só se o dono ligar a chave.

-- ---------------------------------------------------------------------------
-- Configurações do salão (permissões). Uma linha por salão; sem linha = padrão.
-- (A configuração de comissões, com versões, virá na Etapa 5 em tabela própria.)
-- ---------------------------------------------------------------------------
create table public.configuracao_salao (
  salao_id                         uuid primary key references public.saloes (id),
  profissionais_editam_clientes    boolean not null default false,
  atualizado_em                    timestamptz not null default now()
);
comment on table public.configuracao_salao is 'Chaves de permissão que cada salão decide. Mudanças vão para a auditoria.';

create trigger auditar_configuracao_salao
  after insert or update on public.configuracao_salao
  for each row execute function privado.auditar('salao_id');

alter table public.configuracao_salao enable row level security;
revoke all on public.configuracao_salao from anon, authenticated;
grant select on public.configuracao_salao to authenticated;
grant insert (salao_id, profissionais_editam_clientes) on public.configuracao_salao to authenticated;
grant update (profissionais_editam_clientes, atualizado_em) on public.configuracao_salao to authenticated;

create policy "equipe vê as configurações" on public.configuracao_salao
  for select to authenticated
  using (salao_id in (select privado.saloes_do_usuario()));

create policy "dono cria as configurações" on public.configuracao_salao
  for insert to authenticated
  with check (privado.perfil_no_salao(salao_id) = 'dono');

create policy "dono altera as configurações" on public.configuracao_salao
  for update to authenticated
  using (privado.perfil_no_salao(salao_id) = 'dono')
  with check (privado.perfil_no_salao(salao_id) = 'dono');

-- Quem pode cadastrar e alterar clientes neste salão?
create function privado.pode_editar_clientes(p_salao_id uuid)
returns boolean
language sql stable security definer set search_path = ''
as $$
  select case privado.perfil_no_salao(p_salao_id)
    when 'dono' then true
    when 'recepcao' then true
    when 'profissional' then coalesce(
      (select c.profissionais_editam_clientes from public.configuracao_salao c where c.salao_id = p_salao_id),
      false)
    else false
  end;
$$;
revoke all on function privado.pode_editar_clientes(uuid) from public;
grant execute on function privado.pode_editar_clientes(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- Clientes
-- ---------------------------------------------------------------------------
create table public.clientes (
  id             uuid primary key default gen_random_uuid(),
  salao_id       uuid not null references public.saloes (id),
  nome           text not null check (char_length(btrim(nome)) between 2 and 120),
  telefone       text check (telefone ~ '^[0-9]{10,11}$'), -- só números, com DDD
  nascimento     date check (nascimento >= date '1900-01-01'), -- data futura é barrada na tela
  observacoes    text check (char_length(observacoes) <= 1000),
  ativo          boolean not null default true,
  criado_em      timestamptz not null default now(),
  atualizado_em  timestamptz not null default now(),
  unique (salao_id, id)
);
create index clientes_salao_nome_idx on public.clientes (salao_id, lower(nome));
create index clientes_salao_telefone_idx on public.clientes (salao_id, telefone);
comment on table public.clientes is 'Clientes do salão. Ficha mínima (LGPD).';

-- ---------------------------------------------------------------------------
-- Auditoria SEM dados pessoais: guarda só quais campos mudaram e o estado ativo.
-- ---------------------------------------------------------------------------
create function privado.auditar_sem_dados_pessoais()
returns trigger
language plpgsql security definer set search_path = ''
as $$
declare
  v_antes   jsonb := case when tg_op <> 'INSERT' then to_jsonb(old) end;
  v_depois  jsonb := case when tg_op <> 'DELETE' then to_jsonb(new) end;
  v_linha   jsonb := coalesce(v_depois, v_antes);
  v_campos  text[];
begin
  if tg_op = 'UPDATE' then
    select array_agg(k order by k) into v_campos
    from jsonb_object_keys(v_depois) k
    where k not in ('atualizado_em') and v_antes -> k is distinct from v_depois -> k;
    if v_campos is null then
      return null; -- nada mudou de verdade
    end if;
  end if;

  insert into public.audit_log (salao_id, user_id, acao, entidade, entidade_id, antes, depois)
  values (
    (v_linha ->> 'salao_id')::uuid,
    auth.uid(),
    lower(tg_op),
    tg_table_name,
    (v_linha ->> 'id')::uuid,
    case when v_antes is not null then jsonb_build_object('ativo', v_antes -> 'ativo') end,
    case when v_depois is not null
      then jsonb_build_object('ativo', v_depois -> 'ativo', 'campos_alterados', to_jsonb(coalesce(v_campos, '{}'::text[])))
    end
  );
  return null;
end;
$$;
revoke all on function privado.auditar_sem_dados_pessoais() from public;

create trigger auditar_clientes
  after insert or update on public.clientes
  for each row execute function privado.auditar_sem_dados_pessoais();

-- ---------------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------------
alter table public.clientes enable row level security;

revoke all on public.clientes from anon, authenticated;
grant select on public.clientes to authenticated;
grant insert (salao_id, nome, telefone, nascimento, observacoes) on public.clientes to authenticated;
grant update (nome, telefone, nascimento, observacoes, ativo, atualizado_em) on public.clientes to authenticated;

create policy "equipe vê as clientes" on public.clientes
  for select to authenticated
  using (salao_id in (select privado.saloes_do_usuario()));

create policy "quem tem permissão cadastra clientes" on public.clientes
  for insert to authenticated
  with check (privado.pode_editar_clientes(salao_id));

create policy "quem tem permissão altera clientes" on public.clientes
  for update to authenticated
  using (privado.pode_editar_clientes(salao_id))
  with check (privado.pode_editar_clientes(salao_id));
