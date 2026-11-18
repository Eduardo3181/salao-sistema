-- As 10 categorias prontas que o sistema cria com o salão não precisam entrar no histórico de
-- atividades (poluíam a lista do dono). Categorias criadas ou alteradas pelo dono continuam lá.

alter table public.categorias_despesa add column padrao boolean not null default false;

create or replace function privado.criar_categorias_despesa_padrao(p_salao_id uuid)
returns void
language sql security definer set search_path = ''
as $$
  insert into public.categorias_despesa (salao_id, nome, padrao)
  select p_salao_id, n, true
  from unnest(array['Aluguel', 'Água', 'Luz', 'Internet', 'Produtos', 'Salários', 'Impostos', 'Manutenção', 'Marketing', 'Outros']) as n
  on conflict do nothing;
$$;

drop trigger auditar_categorias_despesa on public.categorias_despesa;
create trigger auditar_categorias_despesa_insert after insert on public.categorias_despesa
  for each row when (not new.padrao) execute function privado.auditar('salao_id');
create trigger auditar_categorias_despesa_update after update on public.categorias_despesa
  for each row execute function privado.auditar('salao_id');
