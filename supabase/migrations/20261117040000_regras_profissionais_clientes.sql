-- Decisões da dona (17/11/2026):
-- 1) Chave "profissionais podem cadastrar e alterar clientes" continua, mas começa LIGADA.
-- 2) Profissional busca cliente só pelo nome e NÃO vê o telefone
--    (na Etapa 4: verá o telefone das clientes com comanda aberta com ela).
-- 3) Assistente só tem acesso se o dono der; e só vê agenda e comissão: nada de clientes.

-- ---------------------------------------------------------------------------
-- 1) Chave começa ligada
-- ---------------------------------------------------------------------------
alter table public.configuracao_salao alter column profissionais_editam_clientes set default true;

create or replace function privado.pode_editar_clientes(p_salao_id uuid)
returns boolean
language sql stable security definer set search_path = ''
as $$
  select case privado.perfil_no_salao(p_salao_id)
    when 'dono' then true
    when 'recepcao' then true
    when 'profissional' then coalesce(
      (select c.profissionais_editam_clientes from public.configuracao_salao c where c.salao_id = p_salao_id),
      true) -- sem configuração salva = padrão ligado
    else false -- assistente e qualquer outro: não
  end;
$$;

-- Quem pode ver o telefone das clientes (por enquanto: dono e recepção).
create function privado.ve_telefone_clientes(p_salao_id uuid)
returns boolean
language sql stable security definer set search_path = ''
as $$
  select privado.perfil_no_salao(p_salao_id) in ('dono', 'recepcao');
$$;
revoke all on function privado.ve_telefone_clientes(uuid) from public;
grant execute on function privado.ve_telefone_clientes(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- 3) Assistente não vê clientes
-- ---------------------------------------------------------------------------
drop policy "equipe vê as clientes" on public.clientes;
create policy "equipe vê as clientes (menos assistente)" on public.clientes
  for select to authenticated
  using (
    salao_id in (select privado.saloes_do_usuario())
    and privado.perfil_no_salao(salao_id) <> 'assistente'
  );

-- ---------------------------------------------------------------------------
-- 2) Telefone protegido: ninguém lê a coluna direto.
--    A leitura passa pela função abaixo, que só devolve o telefone a quem pode.
-- ---------------------------------------------------------------------------
revoke select on public.clientes from authenticated;
grant select (id, salao_id, nome, nascimento, observacoes, ativo, criado_em, atualizado_em)
  on public.clientes to authenticated;

create function public.clientes_do_salao(
  p_salao_id uuid,
  p_busca text default null,
  p_incluir_inativas boolean default false,
  p_id uuid default null
)
returns table (
  id uuid, nome text, telefone text, nascimento date, observacoes text, ativo boolean
)
language sql stable security definer set search_path = ''
as $$
  with permissao as (
    select
      p_salao_id in (select privado.saloes_do_usuario())
        and privado.perfil_no_salao(p_salao_id) <> 'assistente' as pode_ver,
      privado.ve_telefone_clientes(p_salao_id) as ve_telefone
  ),
  busca as (
    select
      nullif(btrim(coalesce(p_busca, '')), '') as texto,
      nullif(regexp_replace(coalesce(p_busca, ''), '\D', '', 'g'), '') as numeros
  )
  select c.id, c.nome,
         case when p.ve_telefone then c.telefone end as telefone,
         c.nascimento, c.observacoes, c.ativo
  from public.clientes c, permissao p, busca b
  where p.pode_ver
    and c.salao_id = p_salao_id
    and (p_id is null or c.id = p_id)
    and (p_incluir_inativas or c.ativo or p_id is not null)
    and (
      b.texto is null
      or c.nome ilike '%' || b.texto || '%'
      -- busca por telefone só para quem pode ver telefone
      or (p.ve_telefone and length(b.numeros) >= 4 and c.telefone like '%' || b.numeros || '%')
    )
  order by lower(c.nome)
  limit 100;
$$;
revoke all on function public.clientes_do_salao(uuid, text, boolean, uuid) from public, anon;
grant execute on function public.clientes_do_salao(uuid, text, boolean, uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- 3) Dono pode dar acesso a assistentes (Equipe)
-- ---------------------------------------------------------------------------
create or replace function public.adicionar_membro(
  p_salao_id uuid, p_user_id uuid, p_perfil public.perfil_usuario, p_nome text, p_senha_provisoria boolean
)
returns uuid
language plpgsql security definer set search_path = ''
as $$
declare
  v_nome text := btrim(p_nome);
  v_id   uuid;
begin
  if privado.perfil_no_salao(p_salao_id) is distinct from 'dono' then
    raise exception 'Só o dono pode adicionar pessoas à equipe.' using errcode = '42501';
  end if;
  if p_perfil = 'dono' then
    raise exception 'Por enquanto não é possível adicionar outro dono.' using errcode = '22023';
  end if;
  if v_nome is null or char_length(v_nome) not between 2 and 120 then
    raise exception 'O nome deve ter entre 2 e 120 letras.' using errcode = '22023';
  end if;
  if exists (select 1 from public.usuarios_salao where salao_id = p_salao_id and user_id = p_user_id) then
    raise exception 'Esta pessoa já faz parte da equipe.' using errcode = '23505';
  end if;

  insert into public.usuarios_salao (salao_id, user_id, perfil, nome, trocar_senha)
  values (p_salao_id, p_user_id, p_perfil, v_nome, coalesce(p_senha_provisoria, false))
  returning id into v_id;
  return v_id;
end;
$$;
