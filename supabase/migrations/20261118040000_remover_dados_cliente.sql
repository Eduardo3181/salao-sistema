-- Excluir pessoa (LGPD), parte 1: apagar os dados pessoais de um cliente, mantendo atendimentos e valores.
-- Decisão da dona (18/11/2026): nome vira "Cliente removido"; telefone, nascimento e observações somem.
-- Só o dono. Não tem volta. Fica no histórico (que já não guarda dados pessoais de clientes).

alter table public.clientes add column removido_em timestamptz;
comment on column public.clientes.removido_em is 'Quando os dados pessoais foram apagados a pedido do cliente (LGPD). Depois disso a ficha não muda mais.';

-- Ficha removida não pode ser editada nem reativada (nem por quem tem permissão de editar clientes).
create function privado.bloquear_cliente_removido()
returns trigger
language plpgsql set search_path = ''
as $$
begin
  if old.removido_em is not null then
    raise exception 'Os dados deste cliente foram apagados a pedido dele. A ficha não pode mais ser alterada.' using errcode = '42501';
  end if;
  return new;
end;
$$;
revoke all on function privado.bloquear_cliente_removido() from public;

create trigger bloquear_cliente_removido
  before update on public.clientes
  for each row execute function privado.bloquear_cliente_removido();

create function public.remover_dados_cliente(p_salao_id uuid, p_cliente_id uuid)
returns void
language plpgsql security definer set search_path = ''
as $$
begin
  if coalesce(privado.perfil_no_salao(p_salao_id) = 'dono', false) is not true then
    raise exception 'Só o dono pode apagar os dados de um cliente.' using errcode = '42501';
  end if;
  if not exists (select 1 from public.clientes where id = p_cliente_id and salao_id = p_salao_id) then
    raise exception 'Cliente não encontrado.' using errcode = '22023';
  end if;
  if exists (select 1 from public.clientes where id = p_cliente_id and removido_em is not null) then
    raise exception 'Os dados deste cliente já foram apagados.' using errcode = '22023';
  end if;

  update public.clientes
     set nome = 'Cliente removido',
         telefone = null,
         nascimento = null,
         observacoes = null,
         ativo = false,
         removido_em = now(),
         atualizado_em = now()
   where id = p_cliente_id and salao_id = p_salao_id;
end;
$$;
revoke all on function public.remover_dados_cliente(uuid, uuid) from public, anon;
grant execute on function public.remover_dados_cliente(uuid, uuid) to authenticated;

-- A lista e a ficha passam a dizer se os dados foram apagados.
drop function public.clientes_do_salao(uuid, text, boolean, uuid);
create function public.clientes_do_salao(
  p_salao_id uuid,
  p_busca text default null,
  p_incluir_inativas boolean default false,
  p_id uuid default null
)
returns table (
  id uuid, nome text, telefone text, nascimento date, observacoes text, ativo boolean, removido_em timestamptz
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
         c.nascimento, c.observacoes, c.ativo, c.removido_em
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
