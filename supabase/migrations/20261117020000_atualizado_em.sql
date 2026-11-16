-- O próprio banco anota a hora da última alteração (o site não precisa nem consegue mentir sobre isso).

create function privado.tocar_atualizado_em()
returns trigger
language plpgsql set search_path = ''
as $$
begin
  new.atualizado_em := now();
  return new;
end;
$$;
revoke all on function privado.tocar_atualizado_em() from public;

create trigger tocar_atualizado_em
  before update on public.clientes
  for each row execute function privado.tocar_atualizado_em();

create trigger tocar_atualizado_em
  before update on public.configuracao_salao
  for each row execute function privado.tocar_atualizado_em();

-- O site não informa mais essa coluna.
revoke update (atualizado_em) on public.clientes from authenticated;
revoke update (atualizado_em) on public.configuracao_salao from authenticated;
