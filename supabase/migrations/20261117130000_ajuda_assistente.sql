-- Porta para o dono escolher quais profissionais cada assistente ajuda.
-- Substitui a lista inteira de uma vez (marca/desmarca na tela e salva).
-- Regras: só o dono; o cadastro precisa ser do tipo assistente; cada escolhida
-- precisa ser profissional (não assistente) do mesmo salão.
-- A auditoria já registra cada inclusão/remoção (gatilho auditar_assistentes_profissionais).
create function public.definir_ajuda_assistente(p_assistente_id uuid, p_profissionais uuid[])
returns void
language plpgsql security definer set search_path = ''
as $$
declare
  v_salao uuid;
begin
  select a.salao_id into v_salao
  from public.profissionais a
  where a.id = p_assistente_id and a.tipo = 'assistente';

  if v_salao is null or coalesce(privado.perfil_no_salao(v_salao) = 'dono', false) is not true then
    raise exception 'Só o dono escolhe quem a assistente ajuda.' using errcode = '42501';
  end if;

  if exists (
    select 1 from unnest(coalesce(p_profissionais, '{}')) as x(id)
    where not exists (
      select 1 from public.profissionais p
      where p.id = x.id and p.salao_id = v_salao and p.tipo = 'profissional')
  ) then
    raise exception 'Escolha apenas profissionais deste salão.' using errcode = '22023';
  end if;

  delete from public.assistentes_profissionais ap
  where ap.salao_id = v_salao and ap.assistente_id = p_assistente_id
    and not (ap.profissional_id = any (coalesce(p_profissionais, '{}')));

  insert into public.assistentes_profissionais (salao_id, assistente_id, profissional_id)
  select distinct v_salao, p_assistente_id, x.id
  from unnest(coalesce(p_profissionais, '{}')) as x(id)
  on conflict do nothing;
end;
$$;
revoke all on function public.definir_ajuda_assistente(uuid, uuid[]) from public, anon;
grant execute on function public.definir_ajuda_assistente(uuid, uuid[]) to authenticated;
