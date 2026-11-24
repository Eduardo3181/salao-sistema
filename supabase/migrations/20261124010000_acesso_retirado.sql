-- Aviso para quem perdeu o acesso: em vez de cair direto em "Cadastre o seu salão",
-- a pessoa vê que o acesso ao salão X foi retirado pelo dono.
-- Devolve só o nome dos salões da PRÓPRIA pessoa em que o acesso está desligado (e onde ela não tem outro acesso ativo).
create function public.acessos_retirados()
returns table (salao text)
language sql stable security definer set search_path = ''
as $$
  select s.nome
  from public.usuarios_salao us
  join public.saloes s on s.id = us.salao_id
  where us.user_id = (select auth.uid())
    and not us.ativo
    and not privado.falta_codigo()
  order by us.criado_em;
$$;
revoke all on function public.acessos_retirados() from public, anon;
grant execute on function public.acessos_retirados() to authenticated;
