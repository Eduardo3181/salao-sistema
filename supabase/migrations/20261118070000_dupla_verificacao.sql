-- Dupla verificação (senha + código do aplicativo no celular). Decisão da dona (18/11/2026): opcional, para todos.
-- Quem ligou a dupla verificação só enxerga os dados do salão depois de digitar o código.
-- Isso vale no banco (não só nas telas): quem tiver só a senha e tentar falar direto com o banco não vê nada.

-- Verdadeiro quando a pessoa ligou a dupla verificação mas ainda não digitou o código nesta sessão.
create function privado.falta_codigo()
returns boolean
language sql stable security definer set search_path = ''
as $$
  select coalesce((select auth.jwt() ->> 'aal'), 'aal1') <> 'aal2'
     and exists (
       select 1 from auth.mfa_factors f
       where f.user_id = (select auth.uid()) and f.status = 'verified'
     );
$$;
revoke all on function privado.falta_codigo() from public;
grant execute on function privado.falta_codigo() to authenticated;

-- As funções que decidem "de qual salão você é e com que perfil" passam a exigir o código de quem ligou.
-- Todas as regras de acesso (RLS) e funções do sistema usam estas duas (e meu_profissional_id).
create or replace function privado.saloes_do_usuario()
returns setof uuid
language sql stable security definer set search_path = ''
as $$
  select us.salao_id
  from public.usuarios_salao us
  where us.user_id = (select auth.uid()) and us.ativo
    and not privado.falta_codigo();
$$;

create or replace function privado.perfil_no_salao(p_salao_id uuid)
returns public.perfil_usuario
language sql stable security definer set search_path = ''
as $$
  select us.perfil
  from public.usuarios_salao us
  where us.salao_id = p_salao_id and us.user_id = (select auth.uid()) and us.ativo
    and not privado.falta_codigo();
$$;

create or replace function privado.meu_profissional_id(p_salao_id uuid)
returns uuid
language sql stable security definer set search_path = ''
as $$
  select p.id from public.profissionais p
  where p.salao_id = p_salao_id and p.user_id = (select auth.uid()) and p.ativo
    and not privado.falta_codigo()
  limit 1;
$$;

-- Criar salão também pede o código de quem ligou a dupla verificação.
create or replace function public.criar_salao(p_nome text)
returns uuid
language plpgsql security definer set search_path = ''
as $$
declare
  v_user uuid := auth.uid();
  v_nome text := btrim(p_nome);
  v_id   uuid;
begin
  if v_user is null then
    raise exception 'É preciso estar logado para criar um salão.' using errcode = '42501';
  end if;
  if privado.falta_codigo() then
    raise exception 'Digite o código do aplicativo de verificação para continuar.' using errcode = '42501';
  end if;
  if v_nome is null or char_length(v_nome) not between 2 and 120 then
    raise exception 'O nome do salão deve ter entre 2 e 120 letras.' using errcode = '22023';
  end if;

  insert into public.saloes (nome) values (v_nome) returning id into v_id;
  insert into public.usuarios_salao (salao_id, user_id, perfil) values (v_id, v_user, 'dono');
  return v_id;
end;
$$;
