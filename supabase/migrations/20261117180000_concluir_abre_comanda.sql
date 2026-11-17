-- Etapa 4, parte 3: ao marcar "Concluído" na agenda, a comanda abre sozinha com os serviços
-- (decisão da dona, 17/11/2026). Se o agendamento já tem comanda ativa, nada muda.
-- Se não der para abrir (ex.: cliente desativada), o "Concluído" vale do mesmo jeito
-- e a comanda pode ser aberta depois à mão.
create or replace function public.mudar_situacao_agendamento(
  p_agendamento_id uuid, p_situacao public.situacao_agendamento, p_motivo public.motivo_cancelamento default null
)
returns void
language plpgsql security definer set search_path = ''
as $$
declare
  v_salao    uuid;
  v_cliente  uuid;
  v_exigir   boolean;
begin
  select salao_id, cliente_id into v_salao, v_cliente from public.agendamentos where id = p_agendamento_id;
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

  if p_situacao = 'concluido' then
    begin
      perform public.abrir_comanda(v_salao, v_cliente, p_agendamento_id);
    exception when sqlstate '22023' then
      null; -- não impede concluir; a comanda pode ser aberta depois
    end;
  end if;
end;
$$;
