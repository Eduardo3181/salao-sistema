-- Etapa 4, parte 6 (decisões da dona, 17/11/2026):
--  * reabrir comanda fechada: dono e recepção, com motivo (fica no histórico);
--  * a profissional vê o telefone da cliente só enquanto houver comanda ABERTA com item dela.

alter table public.comandas
  add column reaberta_em timestamptz,
  add column motivo_reabertura text check (char_length(motivo_reabertura) <= 200);

-- ---------------------------------------------------------------------------
-- Porta: reabrir comanda fechada
-- ---------------------------------------------------------------------------
create function public.reabrir_comanda(p_comanda_id uuid, p_motivo text)
returns void
language plpgsql security definer set search_path = ''
as $$
declare
  v public.comandas;
begin
  select * into v from public.comandas where id = p_comanda_id;
  if v.id is null or coalesce(privado.perfil_no_salao(v.salao_id) in ('dono', 'recepcao'), false) is not true then
    raise exception 'Só a recepção ou o dono podem reabrir comandas.' using errcode = '42501';
  end if;
  if v.situacao <> 'fechada' then
    raise exception 'Só comanda fechada pode ser reaberta.' using errcode = '22023';
  end if;
  if char_length(btrim(coalesce(p_motivo, ''))) not between 3 and 200 then
    raise exception 'Escreva o motivo da reabertura (3 a 200 letras).' using errcode = '22023';
  end if;
  update public.comandas
  set situacao = 'aberta', fechada_em = null, reaberta_em = now(), motivo_reabertura = btrim(p_motivo)
  where id = p_comanda_id;
end;
$$;
revoke all on function public.reabrir_comanda(uuid, text) from public, anon;
grant execute on function public.reabrir_comanda(uuid, text) to authenticated;

-- ---------------------------------------------------------------------------
-- Consulta: telefone da cliente desta comanda
-- Dono/recepção: sempre. Profissional: só com a comanda aberta e com item dela.
-- Os demais (e fora dessas condições): nada.
-- ---------------------------------------------------------------------------
create function public.telefone_da_comanda(p_comanda_id uuid)
returns text
language sql stable security definer set search_path = ''
as $$
  select case
    when privado.ve_telefone_clientes(c.salao_id) then cl.telefone
    when privado.perfil_no_salao(c.salao_id) = 'profissional'
         and c.situacao = 'aberta'
         and exists (
           select 1 from public.comanda_itens i
           where i.comanda_id = c.id and i.removido_em is null
             and i.profissional_id = privado.meu_profissional_id(c.salao_id))
      then cl.telefone
  end
  from public.comandas c
  join public.clientes cl on cl.id = c.cliente_id
  where c.id = p_comanda_id
    and c.salao_id in (select privado.saloes_do_usuario());
$$;
revoke all on function public.telefone_da_comanda(uuid) from public, anon;
grant execute on function public.telefone_da_comanda(uuid) to authenticated;
