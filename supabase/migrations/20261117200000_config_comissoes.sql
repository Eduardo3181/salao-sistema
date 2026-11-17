-- Etapa 5, parte 2: configuração de comissões (decisões da dona em docs/02-decisoes.md, 17/11/2026).
-- Porcentagens em centésimos de ponto percentual (50% = 5000). Valores em centavos.
-- Só o dono vê e altera. Toda mudança vai para o audit_log.
-- Mudar a configuração não altera comissões já calculadas (cada item guarda a regra usada).

create type public.base_assistente as enum ('percentual_comissao', 'percentual_servico', 'valor_fixo');
create type public.quem_paga_assistente as enum ('profissional', 'salao', 'dividido');

create table public.configuracao_comissao (
  salao_id                         uuid primary key references public.saloes (id),
  percentual_padrao                integer not null default 0 check (percentual_padrao between 0 and 10000),
  descontar_taxa_cartao            boolean not null default false,
  comissao_produtos                boolean not null default false,
  percentual_produtos              integer not null default 0 check (percentual_produtos between 0 and 10000),
  -- Regra das assistentes (nula = salão sem assistentes configuradas)
  assistente_base                  public.base_assistente,
  assistente_valor                 bigint check (assistente_valor between 0 and 100000000),
  assistente_quem_paga             public.quem_paga_assistente,
  assistente_percentual_profissional integer check (assistente_percentual_profissional between 0 and 10000),
  atualizado_em                    timestamptz not null default now(),
  check ((assistente_base is null) = (assistente_valor is null) and (assistente_base is null) = (assistente_quem_paga is null)),
  check (assistente_base is distinct from 'percentual_comissao' or assistente_valor <= 10000),
  check (assistente_base is distinct from 'percentual_servico' or assistente_valor <= 10000),
  check ((assistente_quem_paga = 'dividido') = (assistente_percentual_profissional is not null))
);
comment on table public.configuracao_comissao is 'Como o salão paga comissões: padrão, taxa do cartão, produtos e assistentes.';

-- Exceções: % de uma profissional, de um serviço, ou de uma profissional em um serviço.
create table public.regras_comissao (
  id               uuid primary key default gen_random_uuid(),
  salao_id         uuid not null references public.saloes (id),
  profissional_id  uuid,
  servico_id       uuid,
  percentual       integer not null check (percentual between 0 and 10000),
  atualizado_em    timestamptz not null default now(),
  foreign key (salao_id, profissional_id) references public.profissionais (salao_id, id),
  foreign key (salao_id, servico_id) references public.servicos (salao_id, id),
  check (profissional_id is not null or servico_id is not null)
);
-- Uma regra por combinação (profissional, serviço), tratando "nenhum" como valor.
create unique index regras_comissao_unica on public.regras_comissao (
  salao_id,
  coalesce(profissional_id, '00000000-0000-0000-0000-000000000000'::uuid),
  coalesce(servico_id, '00000000-0000-0000-0000-000000000000'::uuid)
);
comment on table public.regras_comissao is 'Exceções de comissão: por profissional, por serviço ou por profissional + serviço.';

-- A regra de profissional só pode apontar para quem é do tipo profissional.
create function privado.conferir_regra_comissao()
returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  if new.profissional_id is not null and not exists (
    select 1 from public.profissionais p where p.id = new.profissional_id and p.tipo = 'profissional'
  ) then
    raise exception 'A comissão por profissional vale só para profissionais (não para assistentes).' using errcode = '22023';
  end if;
  return new;
end;
$$;
revoke all on function privado.conferir_regra_comissao() from public;

create trigger conferir_regra_comissao before insert or update on public.regras_comissao
  for each row execute function privado.conferir_regra_comissao();

create trigger auditar_configuracao_comissao after insert or update on public.configuracao_comissao
  for each row execute function privado.auditar('salao_id');
create trigger auditar_regras_comissao after insert or update or delete on public.regras_comissao
  for each row execute function privado.auditar('salao_id');
create trigger tocar_atualizado_em before update on public.configuracao_comissao
  for each row execute function privado.tocar_atualizado_em();
create trigger tocar_atualizado_em before update on public.regras_comissao
  for each row execute function privado.tocar_atualizado_em();

-- ---------------------------------------------------------------------------
-- RLS: só o dono
-- ---------------------------------------------------------------------------
alter table public.configuracao_comissao enable row level security;
alter table public.regras_comissao enable row level security;
revoke all on public.configuracao_comissao, public.regras_comissao from anon, authenticated;

grant select on public.configuracao_comissao, public.regras_comissao to authenticated;
grant insert (salao_id, percentual_padrao, descontar_taxa_cartao, comissao_produtos, percentual_produtos,
              assistente_base, assistente_valor, assistente_quem_paga, assistente_percentual_profissional)
  on public.configuracao_comissao to authenticated;
grant update (percentual_padrao, descontar_taxa_cartao, comissao_produtos, percentual_produtos,
              assistente_base, assistente_valor, assistente_quem_paga, assistente_percentual_profissional)
  on public.configuracao_comissao to authenticated;
grant insert (salao_id, profissional_id, servico_id, percentual) on public.regras_comissao to authenticated;
grant update (percentual) on public.regras_comissao to authenticated;
grant delete on public.regras_comissao to authenticated;

create policy "dono vê a configuração de comissão" on public.configuracao_comissao
  for select to authenticated using (privado.perfil_no_salao(salao_id) = 'dono');
create policy "dono cria a configuração de comissão" on public.configuracao_comissao
  for insert to authenticated with check (privado.perfil_no_salao(salao_id) = 'dono');
create policy "dono altera a configuração de comissão" on public.configuracao_comissao
  for update to authenticated
  using (privado.perfil_no_salao(salao_id) = 'dono') with check (privado.perfil_no_salao(salao_id) = 'dono');

create policy "dono vê as regras de comissão" on public.regras_comissao
  for select to authenticated using (privado.perfil_no_salao(salao_id) = 'dono');
create policy "dono cria regras de comissão" on public.regras_comissao
  for insert to authenticated with check (privado.perfil_no_salao(salao_id) = 'dono');
create policy "dono altera regras de comissão" on public.regras_comissao
  for update to authenticated
  using (privado.perfil_no_salao(salao_id) = 'dono') with check (privado.perfil_no_salao(salao_id) = 'dono');
create policy "dono apaga regras de comissão" on public.regras_comissao
  for delete to authenticated using (privado.perfil_no_salao(salao_id) = 'dono');
