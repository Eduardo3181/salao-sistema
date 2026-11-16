-- Quem não pode ver o telefone das clientes também não pode alterá-lo depois de cadastrado
-- (evita apagar ou trocar sem querer um número que a pessoa nem enxerga).
-- Rotinas internas do sistema (sem usuário logado) não são afetadas.

create function privado.proteger_telefone_cliente()
returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  if new.telefone is distinct from old.telefone
     and auth.uid() is not null
     and not privado.ve_telefone_clientes(old.salao_id) then
    raise exception 'Você não tem permissão para alterar o telefone desta cliente.' using errcode = '42501';
  end if;
  return new;
end;
$$;
revoke all on function privado.proteger_telefone_cliente() from public;

create trigger proteger_telefone_cliente
  before update on public.clientes
  for each row execute function privado.proteger_telefone_cliente();
