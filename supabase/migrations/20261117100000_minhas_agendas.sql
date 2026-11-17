-- Quais colunas (profissionais) a pessoa logada enxerga na agenda.
-- Dono/recepção: todas as profissionais ativas; profissional: só a própria; assistente: quem ela ajuda.
create function public.minhas_agendas(p_salao_id uuid)
returns table (id uuid, nome text)
language sql stable security definer set search_path = ''
as $$
  select p.id, p.nome
  from public.profissionais p
  where p.salao_id = p_salao_id
    and p.ativo
    and p.tipo = 'profissional'
    and p.id in (select privado.profissionais_visiveis(p_salao_id))
  order by lower(p.nome);
$$;
revoke all on function public.minhas_agendas(uuid) from public, anon;
grant execute on function public.minhas_agendas(uuid) to authenticated;
