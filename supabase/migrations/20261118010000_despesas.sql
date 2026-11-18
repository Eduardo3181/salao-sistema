-- Etapa 6, parte 2: despesas (contas a pagar).
-- Decisões da dona (docs/02-decisoes.md, 17/11/2026):
--  * contas a pagar com vencimento e aviso de "vence hoje / atrasada";
--  * despesas fixas (aluguel, internet...) se repetem sozinhas todo mês;
--  * categorias prontas (aluguel, água, luz, internet, produtos, salários, impostos, manutenção,
--    marketing, outros) que o dono pode mudar;
--  * só o dono vê e mexe em despesas;
--  * despesa paga em dinheiro sai do caixa do dia do pagamento;
--  * nada é apagado: cancelamento e desfazer pagamento pedem motivo.
-- Dinheiro em centavos (bigint).

create type public.forma_despesa as enum ('dinheiro', 'pix', 'transferencia', 'boleto', 'cartao', 'debito_automatico', 'outro');

-- ---------------------------------------------------------------------------
-- Categorias
-- ---------------------------------------------------------------------------
create table public.categorias_despesa (
  id         uuid primary key default gen_random_uuid(),
  salao_id   uuid not null references public.saloes (id),
  nome       text not null check (char_length(btrim(nome)) between 2 and 60),
  ativo      boolean not null default true,
  criado_em  timestamptz not null default now(),
  unique (salao_id, id)
);
create unique index categorias_despesa_nome_idx on public.categorias_despesa (salao_id, lower(btrim(nome)));

create function privado.criar_categorias_despesa_padrao(p_salao_id uuid)
returns void
language sql security definer set search_path = ''
as $$
  insert into public.categorias_despesa (salao_id, nome)
  select p_salao_id, n
  from unnest(array['Aluguel', 'Água', 'Luz', 'Internet', 'Produtos', 'Salários', 'Impostos', 'Manutenção', 'Marketing', 'Outros']) as n
  on conflict do nothing;
$$;
revoke all on function privado.criar_categorias_despesa_padrao(uuid) from public;

-- Salão novo já nasce com as categorias prontas.
create function privado.categorias_ao_criar_salao()
returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  perform privado.criar_categorias_despesa_padrao(new.id);
  return null;
end;
$$;
create trigger categorias_despesa_padrao after insert on public.saloes
  for each row execute function privado.categorias_ao_criar_salao();

-- Salões que já existem.
select privado.criar_categorias_despesa_padrao(s.id) from public.saloes s;

-- ---------------------------------------------------------------------------
-- Despesas fixas (modelo que gera uma conta por mês)
-- ---------------------------------------------------------------------------
create table public.despesas_fixas (
  id               uuid primary key default gen_random_uuid(),
  salao_id         uuid not null references public.saloes (id),
  categoria_id     uuid not null,
  descricao        text not null check (char_length(btrim(descricao)) between 2 and 120),
  valor_centavos   bigint not null check (valor_centavos between 1 and 100000000),
  dia_vencimento   integer not null check (dia_vencimento between 1 and 31),
  inicio           date not null, -- primeiro mês (dia 1)
  ativa            boolean not null default true,
  encerrada_em     timestamptz,
  criado_por       uuid default auth.uid(),
  criado_em        timestamptz not null default now(),
  unique (salao_id, id),
  foreign key (salao_id, categoria_id) references public.categorias_despesa (salao_id, id),
  check (extract(day from inicio) = 1),
  check (ativa = (encerrada_em is null))
);

-- ---------------------------------------------------------------------------
-- Despesas (contas)
-- ---------------------------------------------------------------------------
create table public.despesas (
  id                   uuid primary key default gen_random_uuid(),
  salao_id             uuid not null references public.saloes (id),
  categoria_id         uuid not null,
  descricao            text not null check (char_length(btrim(descricao)) between 2 and 120),
  valor_centavos       bigint not null check (valor_centavos between 1 and 100000000),
  vencimento           date not null,
  pago_em              date,
  forma                public.forma_despesa,
  observacao           text check (char_length(observacao) <= 200),
  fixa_id              uuid,
  competencia          date, -- mês da despesa fixa (dia 1)
  criado_por           uuid default auth.uid(),
  criado_em            timestamptz not null default now(),
  cancelado_em         timestamptz,
  cancelado_por        uuid,
  motivo_cancelamento  text check (char_length(motivo_cancelamento) <= 200),
  unique (salao_id, id),
  foreign key (salao_id, categoria_id) references public.categorias_despesa (salao_id, id),
  foreign key (salao_id, fixa_id) references public.despesas_fixas (salao_id, id),
  check ((pago_em is null) = (forma is null)),
  check ((fixa_id is null) = (competencia is null)),
  check ((cancelado_em is null) = (motivo_cancelamento is null))
);
-- Uma conta por mês para cada despesa fixa.
create unique index despesas_fixa_mes_idx on public.despesas (fixa_id, competencia) where fixa_id is not null;
create index despesas_vencimento_idx on public.despesas (salao_id, vencimento);
create index despesas_pago_idx on public.despesas (salao_id, pago_em) where pago_em is not null;

create trigger auditar_categorias_despesa after insert or update on public.categorias_despesa
  for each row execute function privado.auditar('salao_id');
create trigger auditar_despesas_fixas after insert or update on public.despesas_fixas
  for each row execute function privado.auditar('salao_id');
create trigger auditar_despesas after insert or update on public.despesas
  for each row execute function privado.auditar('salao_id');

alter table public.categorias_despesa enable row level security;
alter table public.despesas_fixas enable row level security;
alter table public.despesas enable row level security;
revoke all on public.categorias_despesa, public.despesas_fixas, public.despesas from anon, authenticated;
grant select on public.categorias_despesa, public.despesas_fixas, public.despesas to authenticated;

create policy "dono vê as categorias" on public.categorias_despesa
  for select to authenticated using (privado.perfil_no_salao(salao_id) = 'dono');
create policy "dono vê as despesas fixas" on public.despesas_fixas
  for select to authenticated using (privado.perfil_no_salao(salao_id) = 'dono');
create policy "dono vê as despesas" on public.despesas
  for select to authenticated using (privado.perfil_no_salao(salao_id) = 'dono');

create function privado.exigir_dono(p_salao_id uuid)
returns void
language plpgsql stable security definer set search_path = ''
as $$
begin
  if coalesce(privado.perfil_no_salao(p_salao_id) = 'dono', false) is not true then
    raise exception 'Só o dono mexe em despesas.' using errcode = '42501';
  end if;
end;
$$;
revoke all on function privado.exigir_dono(uuid) from public;

create function privado.conferir_texto(p_texto text, p_min integer, p_max integer, p_rotulo text)
returns text
language plpgsql immutable set search_path = ''
as $$
begin
  if char_length(btrim(coalesce(p_texto, ''))) not between p_min and p_max then
    raise exception '% (% a % letras).', p_rotulo, p_min, p_max using errcode = '22023';
  end if;
  return btrim(p_texto);
end;
$$;

-- ---------------------------------------------------------------------------
-- Portas: categorias
-- ---------------------------------------------------------------------------
create function public.criar_categoria_despesa(p_salao_id uuid, p_nome text)
returns uuid
language plpgsql security definer set search_path = ''
as $$
declare v_id uuid;
begin
  perform privado.exigir_dono(p_salao_id);
  insert into public.categorias_despesa (salao_id, nome)
  values (p_salao_id, privado.conferir_texto(p_nome, 2, 60, 'Escreva o nome da categoria'))
  returning id into v_id;
  return v_id;
exception when unique_violation then
  raise exception 'Já existe uma categoria com esse nome.' using errcode = '22023';
end;
$$;

create function public.ativar_categoria_despesa(p_categoria_id uuid, p_ativo boolean)
returns void
language plpgsql security definer set search_path = ''
as $$
declare v public.categorias_despesa;
begin
  select * into v from public.categorias_despesa where id = p_categoria_id;
  if v.id is null then
    raise exception 'Categoria não encontrada.' using errcode = '22023';
  end if;
  perform privado.exigir_dono(v.salao_id);
  update public.categorias_despesa set ativo = coalesce(p_ativo, true) where id = p_categoria_id;
end;
$$;

-- ---------------------------------------------------------------------------
-- Portas: despesas
-- ---------------------------------------------------------------------------
create function public.criar_despesa(
  p_salao_id uuid, p_categoria_id uuid, p_descricao text, p_valor bigint, p_vencimento date,
  p_pago_em date default null, p_forma public.forma_despesa default null, p_observacao text default null)
returns uuid
language plpgsql security definer set search_path = ''
as $$
declare v_id uuid;
begin
  perform privado.exigir_dono(p_salao_id);
  if not exists (select 1 from public.categorias_despesa c where c.id = p_categoria_id and c.salao_id = p_salao_id and c.ativo) then
    raise exception 'Escolha uma categoria.' using errcode = '22023';
  end if;
  if p_valor is null or p_valor < 1 or p_valor > 100000000 then
    raise exception 'Informe o valor.' using errcode = '22023';
  end if;
  if p_vencimento is null or p_vencimento < privado.hoje_brasilia() - 3660 or p_vencimento > privado.hoje_brasilia() + 3660 then
    raise exception 'Data de vencimento inválida.' using errcode = '22023';
  end if;
  if (p_pago_em is null) <> (p_forma is null) then
    raise exception 'Para marcar como paga, informe a data e a forma de pagamento.' using errcode = '22023';
  end if;
  if p_pago_em is not null and (p_pago_em > privado.hoje_brasilia() or p_pago_em < privado.hoje_brasilia() - 366) then
    raise exception 'Data do pagamento inválida.' using errcode = '22023';
  end if;
  if char_length(coalesce(p_observacao, '')) > 200 then
    raise exception 'Observação com mais de 200 letras.' using errcode = '22023';
  end if;
  insert into public.despesas (salao_id, categoria_id, descricao, valor_centavos, vencimento, pago_em, forma, observacao)
  values (p_salao_id, p_categoria_id, privado.conferir_texto(p_descricao, 2, 120, 'Escreva a descrição'),
          p_valor, p_vencimento, p_pago_em, p_forma, nullif(btrim(coalesce(p_observacao, '')), ''))
  returning id into v_id;
  return v_id;
end;
$$;

create function public.pagar_despesa(p_despesa_id uuid, p_pago_em date, p_forma public.forma_despesa)
returns void
language plpgsql security definer set search_path = ''
as $$
declare v public.despesas;
begin
  select * into v from public.despesas where id = p_despesa_id for update;
  if v.id is null then
    raise exception 'Despesa não encontrada.' using errcode = '22023';
  end if;
  perform privado.exigir_dono(v.salao_id);
  if v.cancelado_em is not null then
    raise exception 'Esta despesa foi cancelada.' using errcode = '22023';
  end if;
  if v.pago_em is not null then
    raise exception 'Esta despesa já está paga.' using errcode = '22023';
  end if;
  if p_forma is null or p_pago_em is null or p_pago_em > privado.hoje_brasilia() or p_pago_em < privado.hoje_brasilia() - 366 then
    raise exception 'Informe a data e a forma do pagamento.' using errcode = '22023';
  end if;
  update public.despesas set pago_em = p_pago_em, forma = p_forma where id = p_despesa_id;
end;
$$;

-- Desfazer pagamento marcado errado (o histórico guarda o antes e o depois).
create function public.desfazer_pagamento_despesa(p_despesa_id uuid, p_motivo text)
returns void
language plpgsql security definer set search_path = ''
as $$
declare v public.despesas;
begin
  select * into v from public.despesas where id = p_despesa_id for update;
  if v.id is null then
    raise exception 'Despesa não encontrada.' using errcode = '22023';
  end if;
  perform privado.exigir_dono(v.salao_id);
  if v.pago_em is null then
    raise exception 'Esta despesa não está paga.' using errcode = '22023';
  end if;
  perform privado.conferir_texto(p_motivo, 3, 200, 'Escreva o motivo');
  update public.despesas
  set pago_em = null, forma = null,
      observacao = left(concat_ws(' · ', observacao, 'Pagamento desfeito: ' || btrim(p_motivo)), 200)
  where id = p_despesa_id;
end;
$$;

create function public.cancelar_despesa(p_despesa_id uuid, p_motivo text)
returns void
language plpgsql security definer set search_path = ''
as $$
declare v public.despesas;
begin
  select * into v from public.despesas where id = p_despesa_id for update;
  if v.id is null then
    raise exception 'Despesa não encontrada.' using errcode = '22023';
  end if;
  perform privado.exigir_dono(v.salao_id);
  if v.cancelado_em is not null then
    raise exception 'Esta despesa já foi cancelada.' using errcode = '22023';
  end if;
  if v.pago_em is not null then
    raise exception 'Esta despesa está paga. Desfaça o pagamento antes de cancelar.' using errcode = '22023';
  end if;
  update public.despesas
  set cancelado_em = now(), cancelado_por = auth.uid(),
      motivo_cancelamento = privado.conferir_texto(p_motivo, 3, 200, 'Escreva o motivo do cancelamento')
  where id = p_despesa_id;
end;
$$;

-- ---------------------------------------------------------------------------
-- Portas: despesas fixas
-- ---------------------------------------------------------------------------
-- Cria as contas do mês que faltam (do início da fixa até o mês de hoje). Pode ser chamada à vontade.
create function public.gerar_despesas_fixas(p_salao_id uuid)
returns integer
language plpgsql security definer set search_path = ''
as $$
declare
  v_mes_atual date := date_trunc('month', privado.hoje_brasilia())::date;
  v_n integer;
begin
  perform privado.exigir_dono(p_salao_id);
  insert into public.despesas (salao_id, categoria_id, descricao, valor_centavos, vencimento, fixa_id, competencia, criado_por)
  select f.salao_id, f.categoria_id, f.descricao, f.valor_centavos,
         -- dia do vencimento, sem passar do último dia do mês (ex.: 31 em fevereiro vira 28/29)
         least(m.mes + (f.dia_vencimento - 1), (m.mes + interval '1 month' - interval '1 day')::date),
         f.id, m.mes, f.criado_por
  from public.despesas_fixas f
  cross join lateral (
    select g::date as mes from generate_series(f.inicio, v_mes_atual, interval '1 month') g
  ) m
  where f.salao_id = p_salao_id and f.ativa
  on conflict (fixa_id, competencia) where fixa_id is not null do nothing;
  get diagnostics v_n = row_count;
  return v_n;
end;
$$;

create function public.criar_despesa_fixa(
  p_salao_id uuid, p_categoria_id uuid, p_descricao text, p_valor bigint, p_dia integer, p_inicio date)
returns uuid
language plpgsql security definer set search_path = ''
as $$
declare v_id uuid;
begin
  perform privado.exigir_dono(p_salao_id);
  if not exists (select 1 from public.categorias_despesa c where c.id = p_categoria_id and c.salao_id = p_salao_id and c.ativo) then
    raise exception 'Escolha uma categoria.' using errcode = '22023';
  end if;
  if p_valor is null or p_valor < 1 or p_valor > 100000000 then
    raise exception 'Informe o valor.' using errcode = '22023';
  end if;
  if p_dia is null or p_dia not between 1 and 31 then
    raise exception 'O dia do vencimento vai de 1 a 31.' using errcode = '22023';
  end if;
  if p_inicio is null
     or date_trunc('month', p_inicio)::date < date_trunc('month', privado.hoje_brasilia())::date - interval '12 months'
     or p_inicio > privado.hoje_brasilia() + 366 then
    raise exception 'Mês de início inválido (até 12 meses para trás).' using errcode = '22023';
  end if;
  insert into public.despesas_fixas (salao_id, categoria_id, descricao, valor_centavos, dia_vencimento, inicio)
  values (p_salao_id, p_categoria_id, privado.conferir_texto(p_descricao, 2, 120, 'Escreva a descrição'),
          p_valor, p_dia, date_trunc('month', p_inicio)::date)
  returning id into v_id;
  perform public.gerar_despesas_fixas(p_salao_id);
  return v_id;
end;
$$;

-- Encerrar: para de gerar contas novas (as já geradas continuam).
create function public.encerrar_despesa_fixa(p_fixa_id uuid)
returns void
language plpgsql security definer set search_path = ''
as $$
declare v public.despesas_fixas;
begin
  select * into v from public.despesas_fixas where id = p_fixa_id for update;
  if v.id is null then
    raise exception 'Despesa fixa não encontrada.' using errcode = '22023';
  end if;
  perform privado.exigir_dono(v.salao_id);
  if not v.ativa then
    raise exception 'Esta despesa fixa já foi encerrada.' using errcode = '22023';
  end if;
  update public.despesas_fixas set ativa = false, encerrada_em = now() where id = p_fixa_id;
end;
$$;

-- ---------------------------------------------------------------------------
-- Caixa: despesa paga em dinheiro sai da gaveta no dia do pagamento
-- ---------------------------------------------------------------------------
create or replace function privado.numeros_caixa(p_salao_id uuid, p_data date)
returns jsonb
language plpgsql stable security definer set search_path = ''
as $$
declare
  v_de   timestamptz := privado.inicio_dia(p_data);
  v_ate  timestamptz := privado.inicio_dia(p_data + 1);
  v_troco bigint;
  v_formas jsonb;
  v_dinheiro bigint;
  v_retiradas bigint;
  v_reforcos bigint;
  v_comissoes bigint;
  v_vales bigint;
  v_despesas bigint;
begin
  select c.troco_inicial_centavos into v_troco from public.caixas c where c.salao_id = p_salao_id and c.data = p_data;

  select coalesce(jsonb_object_agg(f.forma, f.total), '{}'::jsonb) into v_formas
  from (
    select p.forma, sum(p.valor_centavos)::bigint as total
    from public.pagamentos p
    where p.salao_id = p_salao_id and p.removido_em is null and p.criado_em >= v_de and p.criado_em < v_ate
    group by p.forma
  ) f;
  v_dinheiro := coalesce((v_formas ->> 'dinheiro')::bigint, 0);

  select coalesce(sum(m.valor_centavos) filter (where m.tipo = 'retirada'), 0),
         coalesce(sum(m.valor_centavos) filter (where m.tipo = 'reforco'), 0)
  into v_retiradas, v_reforcos
  from public.caixa_movimentos m
  where m.salao_id = p_salao_id and m.data = p_data and m.cancelado_em is null;

  select coalesce(sum(pc.valor_centavos - pc.desconto_vales_centavos), 0) into v_comissoes
  from public.pagamentos_comissao pc
  where pc.salao_id = p_salao_id and pc.meio = 'dinheiro' and pc.pago_em = p_data and pc.cancelado_em is null;

  select coalesce(sum(v.valor_centavos), 0) into v_vales
  from public.vales v
  where v.salao_id = p_salao_id and v.meio = 'dinheiro' and v.dado_em = p_data and v.cancelado_em is null;

  select coalesce(sum(d.valor_centavos), 0) into v_despesas
  from public.despesas d
  where d.salao_id = p_salao_id and d.forma = 'dinheiro' and d.pago_em = p_data and d.cancelado_em is null;

  return jsonb_build_object(
    'troco_inicial', coalesce(v_troco, 0),
    'entradas_por_forma', v_formas,
    'dinheiro_recebido', v_dinheiro,
    'reforcos', v_reforcos,
    'retiradas', v_retiradas,
    'comissoes_dinheiro', v_comissoes,
    'vales_dinheiro', v_vales,
    'despesas_dinheiro', v_despesas,
    'esperado_dinheiro', coalesce(v_troco, 0) + v_dinheiro + v_reforcos - v_retiradas - v_comissoes - v_vales - v_despesas
  );
end;
$$;

revoke all on function public.criar_categoria_despesa(uuid, text) from public, anon;
revoke all on function public.ativar_categoria_despesa(uuid, boolean) from public, anon;
revoke all on function public.criar_despesa(uuid, uuid, text, bigint, date, date, public.forma_despesa, text) from public, anon;
revoke all on function public.pagar_despesa(uuid, date, public.forma_despesa) from public, anon;
revoke all on function public.desfazer_pagamento_despesa(uuid, text) from public, anon;
revoke all on function public.cancelar_despesa(uuid, text) from public, anon;
revoke all on function public.gerar_despesas_fixas(uuid) from public, anon;
revoke all on function public.criar_despesa_fixa(uuid, uuid, text, bigint, integer, date) from public, anon;
revoke all on function public.encerrar_despesa_fixa(uuid) from public, anon;
grant execute on function public.criar_categoria_despesa(uuid, text) to authenticated;
grant execute on function public.ativar_categoria_despesa(uuid, boolean) to authenticated;
grant execute on function public.criar_despesa(uuid, uuid, text, bigint, date, date, public.forma_despesa, text) to authenticated;
grant execute on function public.pagar_despesa(uuid, date, public.forma_despesa) to authenticated;
grant execute on function public.desfazer_pagamento_despesa(uuid, text) to authenticated;
grant execute on function public.cancelar_despesa(uuid, text) to authenticated;
grant execute on function public.gerar_despesas_fixas(uuid) to authenticated;
grant execute on function public.criar_despesa_fixa(uuid, uuid, text, bigint, integer, date) to authenticated;
grant execute on function public.encerrar_despesa_fixa(uuid) to authenticated;
