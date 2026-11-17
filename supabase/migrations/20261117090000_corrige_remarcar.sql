-- Correção de segurança (achada pelo teste de isolamento antes de ir para o ar):
-- em remarcar_item, quem não é do salão tinha perfil nulo; a comparação com nulo
-- não dava "verdadeiro" nem "falso" e a trava deixava passar. Agora nulo = proibido.

create or replace function public.remarcar_item(
  p_item_id uuid, p_inicio timestamptz, p_profissional_id uuid default null, p_duracao_min integer default null
)
returns void
language plpgsql security definer set search_path = ''
as $$
declare
  v_item     public.agendamento_itens;
  v_perfil   public.perfil_usuario;
  v_situacao public.situacao_agendamento;
  v_prof     uuid;
  v_duracao  integer;
  v_pode     boolean;
begin
  select * into v_item from public.agendamento_itens where id = p_item_id;
  if v_item.id is null then
    raise exception 'Horário não encontrado.' using errcode = '22023';
  end if;
  v_perfil := privado.perfil_no_salao(v_item.salao_id);
  v_prof := coalesce(p_profissional_id, v_item.profissional_id);

  v_pode := coalesce(
    v_perfil in ('dono', 'recepcao')
    or (v_perfil = 'profissional'
        and v_item.profissional_id = privado.meu_profissional_id(v_item.salao_id)
        and v_prof = v_item.profissional_id),
    false);
  if not v_pode then
    raise exception 'Você não pode remarcar este horário.' using errcode = '42501';
  end if;

  select situacao into v_situacao from public.agendamentos where id = v_item.agendamento_id;
  if v_situacao in ('cancelado', 'concluido', 'faltou') then
    raise exception 'Este agendamento já foi encerrado e não pode ser remarcado.' using errcode = '22023';
  end if;
  if p_inicio < now() - interval '5 minutes' and v_perfil = 'profissional' then
    raise exception 'Horário no passado só pode ser marcado pela recepção ou pelo dono.' using errcode = '42501';
  end if;
  if not exists (
    select 1 from public.profissionais p
    where p.id = v_prof and p.salao_id = v_item.salao_id and p.ativo and p.tipo = 'profissional'
  ) then
    raise exception 'Profissional não encontrada neste salão.' using errcode = '22023';
  end if;

  v_duracao := coalesce(p_duracao_min, (extract(epoch from v_item.fim - v_item.inicio) / 60)::integer);
  if v_duracao not between 5 and 720 then
    raise exception 'Duração inválida.' using errcode = '22023';
  end if;

  update public.agendamento_itens
  set inicio = p_inicio, fim = p_inicio + make_interval(mins => v_duracao), profissional_id = v_prof
  where id = p_item_id;
end;
$$;
