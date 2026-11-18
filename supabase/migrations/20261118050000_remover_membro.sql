-- Excluir pessoa (LGPD), parte 2: apagar o acesso de quem saiu da equipe.
-- Decisão da dona (18/11/2026): apaga o login (e-mail e senha); o nome continua só nas comissões,
-- vales e comprovantes (registros de pagamento). Só o dono, e só de quem já está sem acesso.
-- Esta função tira a pessoa do salão; o servidor apaga a conta de login depois,
-- se ela não fizer parte de nenhum outro salão.

create function public.remover_membro(p_membro_id uuid)
returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare
  v_salao  uuid;
  v_user   uuid;
  v_perfil public.perfil_usuario;
  v_ativo  boolean;
begin
  select salao_id, user_id, perfil, ativo into v_salao, v_user, v_perfil, v_ativo
    from public.usuarios_salao where id = p_membro_id;

  if v_salao is null or coalesce(privado.perfil_no_salao(v_salao) = 'dono', false) is not true then
    raise exception 'Só o dono pode apagar o acesso de alguém da equipe.' using errcode = '42501';
  end if;
  if v_perfil = 'dono' or v_user = (select auth.uid()) then
    raise exception 'O acesso do dono não pode ser apagado por aqui.' using errcode = '22023';
  end if;
  if v_ativo then
    raise exception 'Primeiro tire o acesso da pessoa; depois é possível apagar.' using errcode = '22023';
  end if;

  -- O cadastro de quem atende fica (o nome segue nas comissões), só deixa de estar ligado ao login.
  update public.profissionais set user_id = null where salao_id = v_salao and user_id = v_user;
  delete from public.usuarios_salao where id = p_membro_id;

  return jsonb_build_object(
    'user_id', v_user,
    'em_outro_salao', exists (select 1 from public.usuarios_salao where user_id = v_user)
  );
end;
$$;
revoke all on function public.remover_membro(uuid) from public, anon;
grant execute on function public.remover_membro(uuid) to authenticated;
