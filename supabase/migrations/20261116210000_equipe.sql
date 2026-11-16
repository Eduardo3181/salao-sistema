-- Etapa 1: equipe do salão (acesso com senha provisória)
-- O dono adiciona recepção e profissionais; a pessoa troca a senha no primeiro acesso.

alter table public.usuarios_salao
  add column nome text check (nome is null or char_length(btrim(nome)) between 2 and 120),
  add column trocar_senha boolean not null default false;

comment on column public.usuarios_salao.nome is 'Nome da pessoa, para o dono reconhecer na lista da equipe.';
comment on column public.usuarios_salao.trocar_senha is 'Verdadeiro enquanto a pessoa ainda usa a senha provisória.';

-- ---------------------------------------------------------------------------
-- Lista da equipe com e-mail (o e-mail fica em auth.users, que a API não expõe).
-- Só o dono do salão recebe a lista; qualquer outra pessoa recebe lista vazia.
-- ---------------------------------------------------------------------------
create function public.equipe_do_salao(p_salao_id uuid)
returns table (
  id uuid, user_id uuid, nome text, email text,
  perfil public.perfil_usuario, ativo boolean, trocar_senha boolean, criado_em timestamptz
)
language sql stable security definer set search_path = ''
as $$
  select us.id, us.user_id, us.nome, u.email::text, us.perfil, us.ativo, us.trocar_senha, us.criado_em
  from public.usuarios_salao us
  join auth.users u on u.id = us.user_id
  where us.salao_id = p_salao_id
    and privado.perfil_no_salao(p_salao_id) = 'dono'
  order by us.ativo desc, us.perfil, us.nome;
$$;
revoke all on function public.equipe_do_salao(uuid) from public, anon;
grant execute on function public.equipe_do_salao(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- Dono adiciona alguém à equipe (recepção ou profissional).
-- A conta da pessoa é criada antes, pelo servidor; aqui só se liga ao salão.
-- Roda como o dono, então a auditoria registra quem adicionou.
-- ---------------------------------------------------------------------------
create function public.adicionar_membro(
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
    raise exception 'Por enquanto só é possível adicionar recepção ou profissional.' using errcode = '22023';
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
revoke all on function public.adicionar_membro(uuid, uuid, public.perfil_usuario, text, boolean) from public, anon;
grant execute on function public.adicionar_membro(uuid, uuid, public.perfil_usuario, text, boolean) to authenticated;

-- ---------------------------------------------------------------------------
-- Dono tira ou devolve o acesso de alguém (ex.: pessoa saiu do salão).
-- Não apaga nada: só marca como inativo. O dono não pode tirar o próprio acesso.
-- ---------------------------------------------------------------------------
create function public.definir_acesso_membro(p_membro_id uuid, p_ativo boolean)
returns void
language plpgsql security definer set search_path = ''
as $$
declare
  v_salao  uuid;
  v_perfil public.perfil_usuario;
begin
  select salao_id, perfil into v_salao, v_perfil from public.usuarios_salao where id = p_membro_id;

  if v_salao is null or privado.perfil_no_salao(v_salao) is distinct from 'dono' then
    raise exception 'Só o dono pode mudar o acesso da equipe.' using errcode = '42501';
  end if;
  if v_perfil = 'dono' then
    raise exception 'O acesso do dono não pode ser tirado por aqui.' using errcode = '22023';
  end if;

  update public.usuarios_salao set ativo = p_ativo where id = p_membro_id;
end;
$$;
revoke all on function public.definir_acesso_membro(uuid, boolean) from public, anon;
grant execute on function public.definir_acesso_membro(uuid, boolean) to authenticated;

-- ---------------------------------------------------------------------------
-- A própria pessoa avisa que já trocou a senha provisória.
-- ---------------------------------------------------------------------------
create function public.concluir_troca_senha()
returns void
language sql security definer set search_path = ''
as $$
  update public.usuarios_salao set trocar_senha = false
  where user_id = (select auth.uid()) and trocar_senha;
$$;
revoke all on function public.concluir_troca_senha() from public, anon;
grant execute on function public.concluir_troca_senha() to authenticated;

-- ---------------------------------------------------------------------------
-- Uso exclusivo do servidor (chave secreta): descobrir se um e-mail já tem conta.
-- Nenhum usuário do site pode chamar.
-- ---------------------------------------------------------------------------
create function public.id_usuario_por_email(p_email text)
returns uuid
language sql stable security definer set search_path = ''
as $$
  select id from auth.users where lower(email) = lower(btrim(p_email)) limit 1;
$$;
revoke all on function public.id_usuario_por_email(text) from public, anon, authenticated;
grant execute on function public.id_usuario_por_email(text) to service_role;
