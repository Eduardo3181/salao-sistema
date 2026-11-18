-- Etapa 5, parte 4: extrato de comissões por período.
-- Decisões (docs/02-decisoes.md, 17/11/2026):
--  * o dono vê o extrato de qualquer profissional/assistente do salão;
--  * cada pessoa vê só o próprio extrato (a recepção não tem extrato, a não ser o próprio);
--  * detalhe de cada serviço: valor, %, taxa descontada e parte do assistente;
--  * o lançamento entra no período pela data em que foi gravado. Um estorno (comanda reaberta)
--    entra na data da reabertura, como ajuste.
--  * o assistente não vê o nome da cliente (não acessa clientes).

create function public.extrato_comissoes(
  p_salao_id uuid,
  p_profissional_id uuid,
  p_de timestamptz,
  p_ate timestamptz
)
returns table (
  id                  uuid,
  criado_em           timestamptz,
  comanda_id          uuid,
  estorno             boolean,
  papel               public.papel_comissao,
  item_nome           text,
  cliente_nome        text,
  valor_item_centavos bigint,
  percentual          integer,
  taxa_centavos       bigint,
  parte_assistente_centavos bigint,
  valor_centavos      bigint
)
language plpgsql stable security definer set search_path = ''
as $$
declare
  v_perfil text := privado.perfil_no_salao(p_salao_id);
begin
  if v_perfil is null
     or not coalesce(v_perfil = 'dono' or p_profissional_id = privado.meu_profissional_id(p_salao_id), false) then
    raise exception 'Você só pode ver o próprio extrato.' using errcode = '42501';
  end if;
  if p_de is null or p_ate is null or p_ate <= p_de or p_ate - p_de > interval '400 days' then
    raise exception 'Escolha um período de até 400 dias.' using errcode = '22023';
  end if;

  return query
  select
    c.id,
    c.criado_em,
    c.comanda_id,
    c.estorno_de is not null,
    c.papel,
    coalesce(s.nome, pr.nome, 'Item'),
    case when v_perfil <> 'assistente' then cl.nome end,
    (c.snapshot ->> 'valorCentavos')::bigint,
    (c.snapshot ->> 'percentual')::integer,
    (c.snapshot -> 'resultado' ->> 'taxaDescontadaCentavos')::bigint,
    case when c.papel = 'profissional' then (c.snapshot -> 'resultado' ->> 'repasseProfissionalCentavos')::bigint end,
    c.valor_centavos
  from public.comissoes c
  join public.comanda_itens i on i.id = c.item_id
  join public.comandas co on co.id = c.comanda_id
  left join public.servicos s on s.id = i.servico_id
  left join public.produtos pr on pr.id = i.produto_id
  left join public.clientes cl on cl.id = co.cliente_id
  where c.salao_id = p_salao_id
    and c.profissional_id = p_profissional_id
    and c.criado_em >= p_de and c.criado_em < p_ate
  order by c.criado_em, c.estorno_de nulls first;
end;
$$;
revoke all on function public.extrato_comissoes(uuid, uuid, timestamptz, timestamptz) from public, anon;
grant execute on function public.extrato_comissoes(uuid, uuid, timestamptz, timestamptz) to authenticated;
