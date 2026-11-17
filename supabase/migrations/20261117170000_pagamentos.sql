-- Etapa 4, parte 2b: pagamentos da comanda e taxas do cartão.
-- Decisões da dona (docs/02-decisoes.md, 17/11/2026):
--  * formas: Dinheiro, Pix, Débito, Crédito à vista e Crédito parcelado;
--  * taxa do cartão por tipo; no crédito parcelado, uma taxa para cada número de parcelas;
--  * a comanda fecha sozinha ao receber o valor total;
--  * quem recebe: dono e recepção sempre; profissional só se o dono ligar a chave
--    "profissionais_recebem_pagamento" (começa desligada) e só em comanda toda dela.
-- Taxas em centésimos de ponto percentual (2,99% = 299), sem números quebrados.
-- Valores em centavos (bigint).

create type public.forma_pagamento as enum ('dinheiro', 'pix', 'debito', 'credito_vista', 'credito_parcelado');

alter table public.configuracao_salao
  add column profissionais_recebem_pagamento boolean not null default false;
grant insert (profissionais_recebem_pagamento) on public.configuracao_salao to authenticated;
grant update (profissionais_recebem_pagamento) on public.configuracao_salao to authenticated;

-- ---------------------------------------------------------------------------
-- Taxas do cartão (o dono configura)
-- ---------------------------------------------------------------------------
create table public.taxas_cartao (
  salao_id          uuid not null references public.saloes (id),
  forma             public.forma_pagamento not null,
  parcelas          integer not null default 1,
  taxa_centesimos   integer not null check (taxa_centesimos between 0 and 10000), -- 299 = 2,99%
  atualizado_em     timestamptz not null default now(),
  primary key (salao_id, forma, parcelas),
  check (
    (forma in ('debito', 'credito_vista') and parcelas = 1)
    or (forma = 'credito_parcelado' and parcelas between 2 and 24)
  )
);
comment on table public.taxas_cartao is 'Taxa da maquininha por forma (e por número de parcelas no crédito parcelado).';

create trigger auditar_taxas_cartao after insert or update or delete on public.taxas_cartao
  for each row execute function privado.auditar('salao_id');
create trigger tocar_atualizado_em before update on public.taxas_cartao
  for each row execute function privado.tocar_atualizado_em();

alter table public.taxas_cartao enable row level security;
revoke all on public.taxas_cartao from anon, authenticated;
grant select on public.taxas_cartao to authenticated;
grant insert (salao_id, forma, parcelas, taxa_centesimos) on public.taxas_cartao to authenticated;
grant update (taxa_centesimos) on public.taxas_cartao to authenticated;
grant delete on public.taxas_cartao to authenticated;

create policy "dono e recepção veem as taxas" on public.taxas_cartao
  for select to authenticated
  using (privado.perfil_no_salao(salao_id) in ('dono', 'recepcao'));
create policy "dono cria taxas" on public.taxas_cartao
  for insert to authenticated with check (privado.perfil_no_salao(salao_id) = 'dono');
create policy "dono altera taxas" on public.taxas_cartao
  for update to authenticated
  using (privado.perfil_no_salao(salao_id) = 'dono') with check (privado.perfil_no_salao(salao_id) = 'dono');
create policy "dono apaga taxas" on public.taxas_cartao
  for delete to authenticated using (privado.perfil_no_salao(salao_id) = 'dono');

-- ---------------------------------------------------------------------------
-- Pagamentos
-- ---------------------------------------------------------------------------
create table public.pagamentos (
  id                uuid primary key default gen_random_uuid(),
  salao_id          uuid not null references public.saloes (id),
  comanda_id        uuid not null,
  forma             public.forma_pagamento not null,
  valor_centavos    bigint not null check (valor_centavos between 1 and 100000000), -- quanto abate da comanda
  parcelas          integer not null default 1,
  recebido_centavos bigint, -- só no dinheiro: quanto a cliente entregou
  troco_centavos    bigint generated always as (coalesce(recebido_centavos, valor_centavos) - valor_centavos) stored,
  taxa_centesimos   integer not null default 0 check (taxa_centesimos between 0 and 10000), -- a taxa do dia (registro)
  taxa_centavos     bigint not null default 0 check (taxa_centavos >= 0),
  criado_por        uuid default auth.uid(),
  criado_em         timestamptz not null default now(),
  removido_em       timestamptz,
  removido_por      uuid,
  motivo_remocao    text check (char_length(motivo_remocao) <= 200),
  foreign key (salao_id, comanda_id) references public.comandas (salao_id, id),
  check ((forma = 'credito_parcelado') = (parcelas between 2 and 24)),
  check (forma = 'credito_parcelado' or parcelas = 1),
  check ((forma = 'dinheiro') or recebido_centavos is null),
  check (recebido_centavos is null or recebido_centavos >= valor_centavos),
  check ((removido_em is null) = (motivo_remocao is null))
);
create index pagamentos_comanda_idx on public.pagamentos (comanda_id);
create index pagamentos_dia_idx on public.pagamentos (salao_id, criado_em);
comment on table public.pagamentos is 'Formas de pagamento de uma comanda. Pagamento removido fica marcado com motivo.';

create trigger auditar_pagamentos after insert or update on public.pagamentos
  for each row execute function privado.auditar('salao_id');

alter table public.pagamentos enable row level security;
revoke all on public.pagamentos from anon, authenticated;
grant select on public.pagamentos to authenticated;

-- Vê os pagamentos de quem pode mexer na comanda inteira (dono/recepção; profissional em comanda toda dela).
create policy "vê os pagamentos das comandas que mexe" on public.pagamentos
  for select to authenticated
  using (salao_id in (select privado.saloes_do_usuario()) and privado.pode_mexer_comanda(comanda_id));

-- ---------------------------------------------------------------------------
-- Apoio
-- ---------------------------------------------------------------------------
create function privado.pago_comanda(p_comanda_id uuid)
returns bigint
language sql stable security definer set search_path = ''
as $$
  select coalesce(sum(p.valor_centavos), 0)::bigint
  from public.pagamentos p where p.comanda_id = p_comanda_id and p.removido_em is null;
$$;
revoke all on function privado.pago_comanda(uuid) from public;

-- Recebe pagamento? dono/recepção; profissional se a chave estiver ligada e a comanda for toda dela.
create function privado.pode_receber_comanda(p_comanda_id uuid)
returns boolean
language sql stable security definer set search_path = ''
as $$
  select coalesce((
    select case privado.perfil_no_salao(c.salao_id)
      when 'dono' then true
      when 'recepcao' then true
      when 'profissional' then
        privado.pode_mexer_comanda(c.id)
        and coalesce((select s.profissionais_recebem_pagamento from public.configuracao_salao s where s.salao_id = c.salao_id), false)
      else false
    end
    from public.comandas c where c.id = p_comanda_id), false);
$$;
revoke all on function privado.pode_receber_comanda(uuid) from public;

-- ---------------------------------------------------------------------------
-- Porta: registrar pagamento. Fecha a comanda sozinha quando o total é pago.
-- ---------------------------------------------------------------------------
create function public.registrar_pagamento(
  p_comanda_id uuid,
  p_forma public.forma_pagamento,
  p_valor bigint,
  p_parcelas integer default 1,
  p_recebido bigint default null
)
returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare
  v_salao     uuid := privado.comanda_aberta(p_comanda_id);
  v_total     bigint;
  v_pago      bigint;
  v_taxa      integer;
  v_fechou    boolean := false;
begin
  if not privado.pode_receber_comanda(p_comanda_id) then
    raise exception 'Você não pode receber pagamentos nesta comanda.' using errcode = '42501';
  end if;
  if not exists (select 1 from public.comanda_itens i where i.comanda_id = p_comanda_id and i.removido_em is null) then
    raise exception 'Lance pelo menos um item antes de receber.' using errcode = '22023';
  end if;

  -- Trava a comanda para dois pagamentos ao mesmo tempo não passarem do total.
  perform 1 from public.comandas where id = p_comanda_id for update;
  v_total := privado.total_comanda(p_comanda_id);
  v_pago := privado.pago_comanda(p_comanda_id);

  if p_valor is null or p_valor < 1 then
    raise exception 'Informe o valor.' using errcode = '22023';
  end if;
  if p_valor > v_total - v_pago then
    raise exception 'O valor é maior do que falta pagar. No dinheiro, informe quanto a cliente entregou para calcular o troco.' using errcode = '22023';
  end if;
  if p_forma <> 'dinheiro' and p_recebido is not null then
    raise exception 'Troco só no dinheiro.' using errcode = '22023';
  end if;
  if p_forma = 'credito_parcelado' and (p_parcelas is null or p_parcelas not between 2 and 24) then
    raise exception 'Escolha de 2 a 24 parcelas.' using errcode = '22023';
  end if;
  if p_forma <> 'credito_parcelado' and coalesce(p_parcelas, 1) <> 1 then
    raise exception 'Parcelas só no crédito parcelado.' using errcode = '22023';
  end if;

  select t.taxa_centesimos into v_taxa
  from public.taxas_cartao t
  where t.salao_id = v_salao and t.forma = p_forma and t.parcelas = coalesce(p_parcelas, 1);
  v_taxa := coalesce(v_taxa, 0);

  insert into public.pagamentos (
    salao_id, comanda_id, forma, valor_centavos, parcelas, recebido_centavos, taxa_centesimos, taxa_centavos)
  values (
    v_salao, p_comanda_id, p_forma, p_valor, coalesce(p_parcelas, 1), p_recebido, v_taxa,
    -- arredonda para o centavo mais próximo, só com números inteiros
    (p_valor * v_taxa + 5000) / 10000);

  if v_pago + p_valor >= v_total then
    update public.comandas set situacao = 'fechada', fechada_em = now() where id = p_comanda_id;
    v_fechou := true;
  end if;

  return jsonb_build_object('fechou', v_fechou, 'falta_centavos', greatest(v_total - v_pago - p_valor, 0));
end;
$$;

-- ---------------------------------------------------------------------------
-- Porta: fechar comanda que já não deve nada (ex.: tudo com desconto, total zero)
-- ---------------------------------------------------------------------------
create function public.fechar_comanda(p_comanda_id uuid)
returns void
language plpgsql security definer set search_path = ''
as $$
begin
  perform privado.comanda_aberta(p_comanda_id);
  if not privado.pode_receber_comanda(p_comanda_id) then
    raise exception 'Você não pode fechar esta comanda.' using errcode = '42501';
  end if;
  if not exists (select 1 from public.comanda_itens i where i.comanda_id = p_comanda_id and i.removido_em is null) then
    raise exception 'Comanda sem itens: cancele em vez de fechar.' using errcode = '22023';
  end if;
  if privado.pago_comanda(p_comanda_id) < privado.total_comanda(p_comanda_id) then
    raise exception 'Ainda falta receber parte do valor.' using errcode = '22023';
  end if;
  update public.comandas set situacao = 'fechada', fechada_em = now() where id = p_comanda_id;
end;
$$;

-- ---------------------------------------------------------------------------
-- Porta: remover pagamento lançado errado (comanda aberta; dono/recepção, com motivo)
-- ---------------------------------------------------------------------------
create function public.remover_pagamento(p_pagamento_id uuid, p_motivo text)
returns void
language plpgsql security definer set search_path = ''
as $$
declare
  v_pag    public.pagamentos;
  v_salao  uuid;
begin
  select * into v_pag from public.pagamentos where id = p_pagamento_id and removido_em is null;
  if v_pag.id is null then
    raise exception 'Pagamento não encontrado.' using errcode = '22023';
  end if;
  v_salao := privado.comanda_aberta(v_pag.comanda_id);
  if coalesce(privado.perfil_no_salao(v_salao) in ('dono', 'recepcao'), false) is not true then
    raise exception 'Só a recepção ou o dono podem remover pagamentos.' using errcode = '42501';
  end if;
  if char_length(btrim(coalesce(p_motivo, ''))) not between 3 and 200 then
    raise exception 'Escreva o motivo (3 a 200 letras).' using errcode = '22023';
  end if;
  update public.pagamentos
  set removido_em = now(), removido_por = auth.uid(), motivo_remocao = btrim(p_motivo)
  where id = p_pagamento_id;
end;
$$;

-- ---------------------------------------------------------------------------
-- Cancelar comanda agora exige que não haja pagamento ativo
-- ---------------------------------------------------------------------------
create or replace function public.cancelar_comanda(p_comanda_id uuid, p_motivo text)
returns void
language plpgsql security definer set search_path = ''
as $$
declare
  v_salao uuid := privado.comanda_aberta(p_comanda_id);
begin
  if coalesce(privado.perfil_no_salao(v_salao) in ('dono', 'recepcao'), false) is not true then
    raise exception 'Só a recepção ou o dono podem cancelar comandas.' using errcode = '42501';
  end if;
  if char_length(btrim(coalesce(p_motivo, ''))) not between 3 and 200 then
    raise exception 'Escreva o motivo do cancelamento (3 a 200 letras).' using errcode = '22023';
  end if;
  if privado.pago_comanda(p_comanda_id) > 0 then
    raise exception 'Esta comanda já tem pagamento. Remova os pagamentos antes de cancelar.' using errcode = '22023';
  end if;
  update public.comandas
  set situacao = 'cancelada', cancelada_em = now(), motivo_cancelamento = btrim(p_motivo)
  where id = p_comanda_id;
end;
$$;

-- ---------------------------------------------------------------------------
-- Resumo para a tela: total, pago, falta e o que a pessoa pode fazer
-- ---------------------------------------------------------------------------
create or replace function public.resumo_comanda(p_comanda_id uuid)
returns jsonb
language sql stable security definer set search_path = ''
as $$
  select case when privado.pode_ver_comanda(p_comanda_id) then jsonb_build_object(
    'total_centavos', privado.total_comanda(p_comanda_id),
    'pago_centavos', case when privado.pode_mexer_comanda(p_comanda_id) then privado.pago_comanda(p_comanda_id) end,
    'falta_centavos', case when privado.pode_mexer_comanda(p_comanda_id)
      then greatest(privado.total_comanda(p_comanda_id) - privado.pago_comanda(p_comanda_id), 0) end,
    'pode_mexer', privado.pode_mexer_comanda(p_comanda_id),
    'pode_receber', privado.pode_receber_comanda(p_comanda_id),
    'pode_alterar_preco', privado.pode_alterar_preco((select c.salao_id from public.comandas c where c.id = p_comanda_id))
  ) end;
$$;

revoke all on function public.registrar_pagamento(uuid, public.forma_pagamento, bigint, integer, bigint) from public, anon;
revoke all on function public.fechar_comanda(uuid) from public, anon;
revoke all on function public.remover_pagamento(uuid, text) from public, anon;
grant execute on function public.registrar_pagamento(uuid, public.forma_pagamento, bigint, integer, bigint) to authenticated;
grant execute on function public.fechar_comanda(uuid) to authenticated;
grant execute on function public.remover_pagamento(uuid, text) to authenticated;
