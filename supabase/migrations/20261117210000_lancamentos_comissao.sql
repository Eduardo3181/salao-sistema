-- Etapa 5, parte 3: comissões calculadas ao fechar a comanda.
-- Decisões (docs/04 e docs/02, 17/11/2026; caminho A aprovado pela dona):
--  * o cálculo é feito no servidor do sistema, pelo motor testado (src/lib/comissoes.ts);
--  * só o servidor grava comissões (chave secreta, nunca no navegador): ninguém da equipe
--    consegue criar ou alterar comissão "na mão";
--  * cada item guarda a regra usada (snapshot); mudar a configuração não altera o passado;
--  * comanda reaberta desfaz o cálculo com lançamentos de estorno (nada é apagado). Se a
--    comissão já tiver sido paga (parte 5), o estorno vira ajuste no próximo pagamento;
--  * quem vê: o dono vê todas; cada profissional/assistente vê só as próprias.
-- Valores em centavos (bigint).

create type public.papel_comissao as enum ('profissional', 'assistente');

alter table public.comandas add column comissao_calculada_em timestamptz;
comment on column public.comandas.comissao_calculada_em is
  'Quando as comissões desta comanda foram gravadas. Fechada e nulo = cálculo pendente.';

create table public.comissoes (
  id               uuid primary key default gen_random_uuid(),
  salao_id         uuid not null references public.saloes (id),
  comanda_id       uuid not null,
  item_id          uuid not null,
  profissional_id  uuid not null, -- quem recebe (profissional ou assistente)
  papel            public.papel_comissao not null,
  valor_centavos   bigint not null check (valor_centavos <> 0 and abs(valor_centavos) <= 100000000),
  estorno_de       uuid unique references public.comissoes (id), -- preenchido só no estorno
  snapshot         jsonb,
  criado_em        timestamptz not null default now(),
  foreign key (salao_id, comanda_id) references public.comandas (salao_id, id),
  foreign key (salao_id, item_id) references public.comanda_itens (salao_id, id),
  foreign key (salao_id, profissional_id) references public.profissionais (salao_id, id),
  check ((estorno_de is null) = (valor_centavos > 0))
);
create index comissoes_profissional_idx on public.comissoes (salao_id, profissional_id, criado_em);
create index comissoes_comanda_idx on public.comissoes (comanda_id);
comment on table public.comissoes is
  'Lançamentos de comissão (só o servidor grava). Estorno = linha negativa que aponta para a original.';

alter table public.comissoes enable row level security;
revoke all on public.comissoes from anon, authenticated;
grant select on public.comissoes to authenticated;

create policy "dono vê todas; cada um vê as suas" on public.comissoes
  for select to authenticated
  using (
    salao_id in (select privado.saloes_do_usuario())
    and (
      privado.perfil_no_salao(salao_id) = 'dono'
      or profissional_id = privado.meu_profissional_id(salao_id)
    )
  );

-- ---------------------------------------------------------------------------
-- Gravação do cálculo (só o servidor, com a chave secreta)
-- p_itens:       [{item_id, snapshot}]                         (todos os itens ativos)
-- p_assistentes: [{item_id, assistente_id, valor_centavos}]
-- p_lancamentos: [{item_id, profissional_id, papel, valor_centavos}]
-- p_fechada_em: o fechamento que o servidor leu (se a comanda foi reaberta no meio, nada é gravado).
-- ---------------------------------------------------------------------------
create function public.gravar_comissoes(
  p_comanda_id uuid,
  p_fechada_em timestamptz,
  p_itens jsonb,
  p_assistentes jsonb,
  p_lancamentos jsonb
)
returns boolean
language plpgsql security definer set search_path = ''
as $$
declare
  v public.comandas;
  x jsonb;
  v_item public.comanda_itens;
begin
  select * into v from public.comandas where id = p_comanda_id for update;
  if v.id is null or v.situacao <> 'fechada' or v.fechada_em is distinct from p_fechada_em then
    return false; -- mudou enquanto calculava: quem chamou tenta de novo
  end if;
  if v.comissao_calculada_em is not null then
    return true; -- já calculada (dois cliques ao mesmo tempo)
  end if;

  -- Todos os itens ativos precisam vir com snapshot, e só eles.
  if (select count(*) from public.comanda_itens i where i.comanda_id = p_comanda_id and i.removido_em is null)
     <> jsonb_array_length(coalesce(p_itens, '[]'::jsonb)) then
    raise exception 'Itens do cálculo não conferem com a comanda.' using errcode = '22023';
  end if;
  for x in select * from jsonb_array_elements(coalesce(p_itens, '[]'::jsonb)) loop
    update public.comanda_itens set regra_snapshot = x -> 'snapshot'
    where id = (x ->> 'item_id')::uuid and comanda_id = p_comanda_id and removido_em is null;
    if not found then
      raise exception 'Item do cálculo não pertence à comanda.' using errcode = '22023';
    end if;
  end loop;

  for x in select * from jsonb_array_elements(coalesce(p_assistentes, '[]'::jsonb)) loop
    update public.comanda_item_assistentes a
    set valor_centavos = (x ->> 'valor_centavos')::bigint, regra_snapshot = x -> 'snapshot'
    from public.comanda_itens i
    where a.item_id = (x ->> 'item_id')::uuid and a.assistente_id = (x ->> 'assistente_id')::uuid
      and i.id = a.item_id and i.comanda_id = p_comanda_id;
    if not found then
      raise exception 'Assistente do cálculo não está no item.' using errcode = '22023';
    end if;
  end loop;

  for x in select * from jsonb_array_elements(coalesce(p_lancamentos, '[]'::jsonb)) loop
    select * into v_item from public.comanda_itens
    where id = (x ->> 'item_id')::uuid and comanda_id = p_comanda_id and removido_em is null;
    if v_item.id is null then
      raise exception 'Lançamento de item que não está na comanda.' using errcode = '22023';
    end if;
    if (x ->> 'papel') = 'profissional' and v_item.profissional_id is distinct from (x ->> 'profissional_id')::uuid then
      raise exception 'Comissão para quem não fez o item.' using errcode = '22023';
    end if;
    if (x ->> 'papel') = 'assistente' and not exists (
      select 1 from public.comanda_item_assistentes a
      where a.item_id = v_item.id and a.assistente_id = (x ->> 'profissional_id')::uuid) then
      raise exception 'Comissão para assistente que não está no item.' using errcode = '22023';
    end if;
    insert into public.comissoes (salao_id, comanda_id, item_id, profissional_id, papel, valor_centavos, snapshot)
    values (v.salao_id, p_comanda_id, v_item.id, (x ->> 'profissional_id')::uuid,
            (x ->> 'papel')::public.papel_comissao, (x ->> 'valor_centavos')::bigint, v_item.regra_snapshot);
  end loop;

  update public.comandas set comissao_calculada_em = now() where id = p_comanda_id;
  return true;
end;
$$;
revoke all on function public.gravar_comissoes(uuid, timestamptz, jsonb, jsonb, jsonb) from public, anon, authenticated;
grant execute on function public.gravar_comissoes(uuid, timestamptz, jsonb, jsonb, jsonb) to service_role;

-- ---------------------------------------------------------------------------
-- Desfaz as comissões ativas da comanda (estorno: linha negativa para cada uma).
-- ---------------------------------------------------------------------------
create function privado.estornar_comissoes(p_comanda_id uuid)
returns void
language sql security definer set search_path = ''
as $$
  insert into public.comissoes (salao_id, comanda_id, item_id, profissional_id, papel, valor_centavos, estorno_de, snapshot)
  select c.salao_id, c.comanda_id, c.item_id, c.profissional_id, c.papel, -c.valor_centavos, c.id, c.snapshot
  from public.comissoes c
  where c.comanda_id = p_comanda_id
    and c.estorno_de is null
    and not exists (select 1 from public.comissoes e where e.estorno_de = c.id);
  update public.comandas set comissao_calculada_em = null where id = p_comanda_id;
$$;
revoke all on function privado.estornar_comissoes(uuid) from public;

-- Reabrir agora desfaz as comissões (o resto igual à versão anterior).
create or replace function public.reabrir_comanda(p_comanda_id uuid, p_motivo text)
returns void
language plpgsql security definer set search_path = ''
as $$
declare
  v public.comandas;
begin
  select * into v from public.comandas where id = p_comanda_id for update;
  if v.id is null or coalesce(privado.perfil_no_salao(v.salao_id) in ('dono', 'recepcao'), false) is not true then
    raise exception 'Só a recepção ou o dono podem reabrir comandas.' using errcode = '42501';
  end if;
  if v.situacao <> 'fechada' then
    raise exception 'Só comanda fechada pode ser reaberta.' using errcode = '22023';
  end if;
  if char_length(btrim(coalesce(p_motivo, ''))) not between 3 and 200 then
    raise exception 'Escreva o motivo da reabertura (3 a 200 letras).' using errcode = '22023';
  end if;
  perform privado.estornar_comissoes(p_comanda_id);
  update public.comandas
  set situacao = 'aberta', fechada_em = null, reaberta_em = now(), motivo_reabertura = btrim(p_motivo)
  where id = p_comanda_id;
end;
$$;
