-- Lista de aniversariantes do mês (só consulta; envio de mensagens fica para docs/07).
-- Mesmas travas da lista de clientes:
--  * só clientes ativas do próprio salão;
--  * assistente não vê;
--  * telefone e aceite de WhatsApp só para dono e recepção.
-- Mostra o dia do aniversário, não o ano (não expõe a idade).
create function public.aniversariantes_do_mes(p_salao_id uuid, p_mes integer)
returns table (id uuid, nome text, dia integer, telefone text, aceitou_whatsapp boolean)
language sql stable security definer set search_path = ''
as $$
  with permissao as (
    select
      coalesce(p_salao_id in (select privado.saloes_do_usuario())
        and privado.perfil_no_salao(p_salao_id) <> 'assistente', false) as pode_ver,
      coalesce(privado.ve_telefone_clientes(p_salao_id), false) as ve_telefone
  )
  select
    c.id,
    c.nome,
    extract(day from c.nascimento)::integer as dia,
    case when p.ve_telefone then c.telefone end as telefone,
    case when p.ve_telefone then (
      select cw.aceitou from public.consentimentos_whatsapp cw
      where cw.cliente_id = c.id
      order by cw.registrado_em desc, cw.id desc
      limit 1
    ) end as aceitou_whatsapp
  from public.clientes c, permissao p
  where p.pode_ver
    and p_mes between 1 and 12
    and c.salao_id = p_salao_id
    and c.ativo
    and c.nascimento is not null
    and extract(month from c.nascimento)::integer = p_mes
  order by extract(day from c.nascimento), lower(c.nome);
$$;
revoke all on function public.aniversariantes_do_mes(uuid, integer) from public, anon;
grant execute on function public.aniversariantes_do_mes(uuid, integer) to authenticated;
