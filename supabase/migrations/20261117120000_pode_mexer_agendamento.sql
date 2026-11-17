-- Para a tela saber se mostra os botões de situação/cancelar de um agendamento.
-- Mesma regra da porta mudar_situacao_agendamento: dono/recepção sempre;
-- profissional só se todos os serviços forem dela; os demais, não.
create function public.pode_mexer_agendamento(p_agendamento_id uuid)
returns boolean
language sql stable security definer set search_path = ''
as $$
  select coalesce(privado.pode_mexer_agendamento(p_agendamento_id), false);
$$;
revoke all on function public.pode_mexer_agendamento(uuid) from public, anon;
grant execute on function public.pode_mexer_agendamento(uuid) to authenticated;
