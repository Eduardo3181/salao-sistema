-- Etapa 6, parte 1: caixa do dia.
-- Decisões da dona (docs/02-decisoes.md, 17/11/2026):
--  * um caixa do salão por dia, aberto com troco inicial (pode ser zero);
--  * entram sozinhos os pagamentos das comandas do dia; saem sozinhos comissões e vales pagos em dinheiro;
--  * retirada (banco, cofre) e reforço com motivo; nada é apagado (cancelamento com motivo);
--  * fechamento: conta o dinheiro; Pix e cartão são marcados como conferidos; sobra/falta exige motivo;
--  * abrir e fechar: dono e recepção; reabrir: só o dono, com motivo;
--  * quem vê: dono e recepção (a recepção só o caixa de hoje ou um caixa que ficou aberto).
-- Receber pagamento NÃO depende do caixa aberto (não trava o atendimento).
-- Dinheiro em centavos (bigint). Dia do caixa = data no horário de Brasília.

create type public.situacao_caixa as enum ('aberto', 'fechado');
create type public.tipo_movimento_caixa as enum ('retirada', 'reforco');

create table public.caixas (
  id                      uuid primary key default gen_random_uuid(),
  salao_id                uuid not null references public.saloes (id),
  data                    date not null,
  situacao                public.situacao_caixa not null default 'aberto',
  troco_inicial_centavos  bigint not null check (troco_inicial_centavos between 0 and 100000000),
  aberto_por              uuid default auth.uid(),
  aberto_em               timestamptz not null default now(),
  fechado_em              timestamptz,
  fechado_por             uuid,
  contado_centavos        bigint check (contado_centavos between 0 and 100000000),
  esperado_centavos       bigint,  -- o que o sistema calculou no momento do fechamento
  motivo_diferenca        text check (char_length(motivo_diferenca) <= 200),
  conferido_pix           boolean not null default false,
  conferido_cartao        boolean not null default false,
  reaberto_em             timestamptz,
  motivo_reabertura       text check (char_length(motivo_reabertura) <= 200),
  atualizado_em           timestamptz not null default now(),
  unique (salao_id, data),
  unique (salao_id, id),
  check ((situacao = 'fechado') = (fechado_em is not null)),
  check (situacao = 'aberto' or (contado_centavos is not null and esperado_centavos is not null))
);
comment on table public.caixas is 'Caixa do dia (um por salão por dia). Valores do fechamento ficam guardados.';

create table public.caixa_movimentos (
  id                   uuid primary key default gen_random_uuid(),
  salao_id             uuid not null references public.saloes (id),
  data                 date not null,
  tipo                 public.tipo_movimento_caixa not null,
  valor_centavos       bigint not null check (valor_centavos between 1 and 100000000),
  motivo               text not null check (char_length(btrim(motivo)) between 3 and 200),
  criado_por           uuid default auth.uid(),
  criado_em            timestamptz not null default now(),
  cancelado_em         timestamptz,
  cancelado_por        uuid,
  motivo_cancelamento  text check (char_length(motivo_cancelamento) <= 200),
  check ((cancelado_em is null) = (motivo_cancelamento is null))
);
create index caixa_movimentos_dia_idx on public.caixa_movimentos (salao_id, data);
comment on table public.caixa_movimentos is 'Retiradas e reforços de dinheiro no caixa. Cancelado fica marcado com motivo.';

create trigger auditar_caixas after insert or update on public.caixas
  for each row execute function privado.auditar('salao_id');
create trigger tocar_atualizado_em before update on public.caixas
  for each row execute function privado.tocar_atualizado_em();
create trigger auditar_caixa_movimentos after insert or update on public.caixa_movimentos
  for each row execute function privado.auditar('salao_id');

alter table public.caixas enable row level security;
alter table public.caixa_movimentos enable row level security;
revoke all on public.caixas, public.caixa_movimentos from anon, authenticated;
grant select on public.caixas, public.caixa_movimentos to authenticated;

create policy "dono e recepção veem os caixas" on public.caixas
  for select to authenticated
  using (privado.perfil_no_salao(salao_id) in ('dono', 'recepcao'));
create policy "dono e recepção veem os movimentos" on public.caixa_movimentos
  for select to authenticated
  using (privado.perfil_no_salao(salao_id) in ('dono', 'recepcao'));

-- ---------------------------------------------------------------------------
-- Apoio
-- ---------------------------------------------------------------------------
create function privado.hoje_brasilia()
returns date
language sql stable set search_path = ''
as $$ select (now() at time zone 'America/Sao_Paulo')::date; $$;

create function privado.inicio_dia(p_data date)
returns timestamptz
language sql immutable set search_path = ''
as $$ select (p_data::timestamp at time zone 'America/Sao_Paulo'); $$;

-- Números do caixa de um dia (sem conferir permissão: uso interno).
create function privado.numeros_caixa(p_salao_id uuid, p_data date)
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

  return jsonb_build_object(
    'troco_inicial', coalesce(v_troco, 0),
    'entradas_por_forma', v_formas,
    'dinheiro_recebido', v_dinheiro,
    'reforcos', v_reforcos,
    'retiradas', v_retiradas,
    'comissoes_dinheiro', v_comissoes,
    'vales_dinheiro', v_vales,
    'esperado_dinheiro', coalesce(v_troco, 0) + v_dinheiro + v_reforcos - v_retiradas - v_comissoes - v_vales
  );
end;
$$;
revoke all on function privado.numeros_caixa(uuid, date) from public;

create function privado.pode_mexer_caixa(p_salao_id uuid)
returns boolean
language sql stable security definer set search_path = ''
as $$ select coalesce(privado.perfil_no_salao(p_salao_id) in ('dono', 'recepcao'), false); $$;
revoke all on function privado.pode_mexer_caixa(uuid) from public;

-- ---------------------------------------------------------------------------
-- Consulta para a tela
-- ---------------------------------------------------------------------------
create function public.resumo_caixa(p_salao_id uuid, p_data date)
returns jsonb
language plpgsql stable security definer set search_path = ''
as $$
declare
  v_perfil text := privado.perfil_no_salao(p_salao_id);
  v_caixa  public.caixas;
begin
  select * into v_caixa from public.caixas c where c.salao_id = p_salao_id and c.data = p_data;
  if v_perfil = 'dono' then
    null;
  elsif v_perfil = 'recepcao' then
    -- A recepção vê o caixa de hoje e um caixa que ficou aberto (para poder fechar).
    if p_data <> privado.hoje_brasilia() and coalesce(v_caixa.situacao <> 'aberto', true) then
      raise exception 'A recepção vê só o caixa de hoje.' using errcode = '42501';
    end if;
  else
    raise exception 'Você não tem acesso ao caixa.' using errcode = '42501';
  end if;

  return privado.numeros_caixa(p_salao_id, p_data) || jsonb_build_object(
    'data', p_data,
    'hoje', privado.hoje_brasilia(),
    'caixa', case when v_caixa.id is null then null else to_jsonb(v_caixa) end,
    'movimentos', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', m.id, 'tipo', m.tipo, 'valor_centavos', m.valor_centavos, 'motivo', m.motivo,
        'criado_em', m.criado_em, 'cancelado_em', m.cancelado_em, 'motivo_cancelamento', m.motivo_cancelamento)
        order by m.criado_em)
      from public.caixa_movimentos m where m.salao_id = p_salao_id and m.data = p_data), '[]'::jsonb),
    'caixas_abertos_antes', coalesce((
      select jsonb_agg(c.data order by c.data)
      from public.caixas c where c.salao_id = p_salao_id and c.situacao = 'aberto' and c.data < privado.hoje_brasilia()), '[]'::jsonb)
  );
end;
$$;

-- ---------------------------------------------------------------------------
-- Portas
-- ---------------------------------------------------------------------------
create function public.abrir_caixa(p_salao_id uuid, p_troco bigint)
returns uuid
language plpgsql security definer set search_path = ''
as $$
declare
  v_hoje date := privado.hoje_brasilia();
  v_existente public.caixas;
  v_id uuid;
begin
  if not privado.pode_mexer_caixa(p_salao_id) then
    raise exception 'Só o dono ou a recepção abrem o caixa.' using errcode = '42501';
  end if;
  if p_troco is null or p_troco < 0 or p_troco > 100000000 then
    raise exception 'Informe o troco inicial (pode ser zero).' using errcode = '22023';
  end if;
  select * into v_existente from public.caixas c where c.salao_id = p_salao_id and c.data = v_hoje;
  if v_existente.id is not null then
    raise exception '%', case when v_existente.situacao = 'aberto' then 'O caixa de hoje já está aberto.'
      else 'O caixa de hoje já foi fechado. Só o dono pode reabrir.' end using errcode = '22023';
  end if;
  insert into public.caixas (salao_id, data, troco_inicial_centavos) values (p_salao_id, v_hoje, p_troco)
  returning id into v_id;
  return v_id;
end;
$$;

create function public.registrar_movimento_caixa(
  p_salao_id uuid, p_tipo public.tipo_movimento_caixa, p_valor bigint, p_motivo text)
returns uuid
language plpgsql security definer set search_path = ''
as $$
declare
  v_hoje date := privado.hoje_brasilia();
  v_id uuid;
begin
  if not privado.pode_mexer_caixa(p_salao_id) then
    raise exception 'Só o dono ou a recepção mexem no caixa.' using errcode = '42501';
  end if;
  perform 1 from public.caixas c where c.salao_id = p_salao_id and c.data = v_hoje and c.situacao = 'aberto' for update;
  if not found then
    raise exception 'Abra o caixa de hoje antes.' using errcode = '22023';
  end if;
  if p_valor is null or p_valor < 1 or p_valor > 100000000 then
    raise exception 'Informe o valor.' using errcode = '22023';
  end if;
  if char_length(btrim(coalesce(p_motivo, ''))) not between 3 and 200 then
    raise exception 'Escreva o motivo (3 a 200 letras).' using errcode = '22023';
  end if;
  if p_tipo = 'retirada' and p_valor > (privado.numeros_caixa(p_salao_id, v_hoje) ->> 'esperado_dinheiro')::bigint then
    raise exception 'Não há esse valor em dinheiro no caixa.' using errcode = '22023';
  end if;
  insert into public.caixa_movimentos (salao_id, data, tipo, valor_centavos, motivo)
  values (p_salao_id, v_hoje, p_tipo, p_valor, btrim(p_motivo))
  returning id into v_id;
  return v_id;
end;
$$;

create function public.cancelar_movimento_caixa(p_movimento_id uuid, p_motivo text)
returns void
language plpgsql security definer set search_path = ''
as $$
declare
  v public.caixa_movimentos;
begin
  select * into v from public.caixa_movimentos where id = p_movimento_id for update;
  if v.id is null or not privado.pode_mexer_caixa(v.salao_id) then
    raise exception 'Só o dono ou a recepção mexem no caixa.' using errcode = '42501';
  end if;
  if v.cancelado_em is not null then
    raise exception 'Este movimento já foi cancelado.' using errcode = '22023';
  end if;
  if not exists (select 1 from public.caixas c where c.salao_id = v.salao_id and c.data = v.data and c.situacao = 'aberto') then
    raise exception 'O caixa deste dia está fechado.' using errcode = '22023';
  end if;
  if char_length(btrim(coalesce(p_motivo, ''))) not between 3 and 200 then
    raise exception 'Escreva o motivo do cancelamento (3 a 200 letras).' using errcode = '22023';
  end if;
  update public.caixa_movimentos
  set cancelado_em = now(), cancelado_por = auth.uid(), motivo_cancelamento = btrim(p_motivo)
  where id = p_movimento_id;
end;
$$;

create function public.fechar_caixa(
  p_caixa_id uuid, p_contado bigint, p_conferido_pix boolean, p_conferido_cartao boolean, p_motivo text default null)
returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare
  v public.caixas;
  v_esperado bigint;
begin
  select * into v from public.caixas where id = p_caixa_id for update;
  if v.id is null or not privado.pode_mexer_caixa(v.salao_id) then
    raise exception 'Só o dono ou a recepção fecham o caixa.' using errcode = '42501';
  end if;
  if v.situacao <> 'aberto' then
    raise exception 'Este caixa já está fechado.' using errcode = '22023';
  end if;
  if p_contado is null or p_contado < 0 or p_contado > 100000000 then
    raise exception 'Informe quanto dinheiro foi contado.' using errcode = '22023';
  end if;
  v_esperado := (privado.numeros_caixa(v.salao_id, v.data) ->> 'esperado_dinheiro')::bigint;
  if p_contado <> v_esperado and char_length(btrim(coalesce(p_motivo, ''))) not between 3 and 200 then
    raise exception 'O dinheiro contado é diferente do esperado. Escreva o motivo da diferença (3 a 200 letras).' using errcode = '22023';
  end if;
  update public.caixas
  set situacao = 'fechado', fechado_em = now(), fechado_por = auth.uid(),
      contado_centavos = p_contado, esperado_centavos = v_esperado,
      motivo_diferenca = case when p_contado <> v_esperado then btrim(p_motivo) end,
      conferido_pix = coalesce(p_conferido_pix, false), conferido_cartao = coalesce(p_conferido_cartao, false)
  where id = p_caixa_id;
  return jsonb_build_object('esperado_centavos', v_esperado, 'diferenca_centavos', p_contado - v_esperado);
end;
$$;

create function public.reabrir_caixa(p_caixa_id uuid, p_motivo text)
returns void
language plpgsql security definer set search_path = ''
as $$
declare
  v public.caixas;
begin
  select * into v from public.caixas where id = p_caixa_id for update;
  if v.id is null or coalesce(privado.perfil_no_salao(v.salao_id) = 'dono', false) is not true then
    raise exception 'Só o dono reabre o caixa.' using errcode = '42501';
  end if;
  if v.situacao <> 'fechado' then
    raise exception 'Este caixa não está fechado.' using errcode = '22023';
  end if;
  if char_length(btrim(coalesce(p_motivo, ''))) not between 3 and 200 then
    raise exception 'Escreva o motivo da reabertura (3 a 200 letras).' using errcode = '22023';
  end if;
  -- O fechamento anterior fica no histórico de atividades (auditoria guarda o antes e o depois).
  update public.caixas
  set situacao = 'aberto', fechado_em = null, fechado_por = null, contado_centavos = null, esperado_centavos = null,
      motivo_diferenca = null, conferido_pix = false, conferido_cartao = false,
      reaberto_em = now(), motivo_reabertura = btrim(p_motivo)
  where id = p_caixa_id;
end;
$$;

revoke all on function public.resumo_caixa(uuid, date) from public, anon;
revoke all on function public.abrir_caixa(uuid, bigint) from public, anon;
revoke all on function public.registrar_movimento_caixa(uuid, public.tipo_movimento_caixa, bigint, text) from public, anon;
revoke all on function public.cancelar_movimento_caixa(uuid, text) from public, anon;
revoke all on function public.fechar_caixa(uuid, bigint, boolean, boolean, text) from public, anon;
revoke all on function public.reabrir_caixa(uuid, text) from public, anon;
grant execute on function public.resumo_caixa(uuid, date) to authenticated;
grant execute on function public.abrir_caixa(uuid, bigint) to authenticated;
grant execute on function public.registrar_movimento_caixa(uuid, public.tipo_movimento_caixa, bigint, text) to authenticated;
grant execute on function public.cancelar_movimento_caixa(uuid, text) to authenticated;
grant execute on function public.fechar_caixa(uuid, bigint, boolean, boolean, text) to authenticated;
grant execute on function public.reabrir_caixa(uuid, text) to authenticated;
