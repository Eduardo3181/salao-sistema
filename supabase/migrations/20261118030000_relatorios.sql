-- Etapa 6, parte 3: relatórios do período (só o dono).
-- Decisões da dona (docs/02-decisoes.md, 17/11/2026):
--  * resultado pelo dinheiro que de fato entrou e saiu (regime de caixa);
--  * só o dono vê relatórios.
-- Regras usadas:
--  * Entradas: pagamentos das comandas recebidos no período (removidos não contam).
--  * Taxas do cartão: as taxas desses pagamentos.
--  * Pessoal: comissões entregues no período (pagamento − vale descontado) + vales dados no período
--    (o vale já é dinheiro que saiu; quando é descontado depois, não conta de novo).
--  * Despesas: contas pagas no período (canceladas não contam).
--  * Vendas por profissional e por item: itens das comandas FECHADAS no período, pelo valor do item
--    (o desconto no total da comanda aparece numa linha à parte).
-- Tudo somado no banco (sem o limite de 1000 linhas da API). Período de até 400 dias.

create function public.relatorio_periodo(p_salao_id uuid, p_de date, p_ate date)
returns jsonb
language plpgsql stable security definer set search_path = ''
as $$
declare
  v_ini timestamptz;
  v_fim timestamptz;
  v_entradas bigint;
  v_taxas bigint;
  v_comissoes bigint;
  v_vales bigint;
  v_despesas bigint;
begin
  if coalesce(privado.perfil_no_salao(p_salao_id) = 'dono', false) is not true then
    raise exception 'Só o dono vê os relatórios.' using errcode = '42501';
  end if;
  if p_de is null or p_ate is null or p_ate < p_de or p_ate - p_de > 400 then
    raise exception 'Escolha um período de até 400 dias.' using errcode = '22023';
  end if;
  v_ini := privado.inicio_dia(p_de);
  v_fim := privado.inicio_dia(p_ate + 1);

  select coalesce(sum(p.valor_centavos), 0), coalesce(sum(p.taxa_centavos), 0) into v_entradas, v_taxas
  from public.pagamentos p
  where p.salao_id = p_salao_id and p.removido_em is null and p.criado_em >= v_ini and p.criado_em < v_fim;

  select coalesce(sum(pc.valor_centavos - pc.desconto_vales_centavos), 0) into v_comissoes
  from public.pagamentos_comissao pc
  where pc.salao_id = p_salao_id and pc.cancelado_em is null and pc.pago_em between p_de and p_ate;

  select coalesce(sum(v.valor_centavos), 0) into v_vales
  from public.vales v
  where v.salao_id = p_salao_id and v.cancelado_em is null and v.dado_em between p_de and p_ate;

  select coalesce(sum(d.valor_centavos), 0) into v_despesas
  from public.despesas d
  where d.salao_id = p_salao_id and d.cancelado_em is null and d.pago_em between p_de and p_ate;

  return jsonb_build_object(
    'de', p_de,
    'ate', p_ate,
    'resultado', jsonb_build_object(
      'entradas', v_entradas,
      'taxas_cartao', v_taxas,
      'comissoes_pagas', v_comissoes,
      'vales', v_vales,
      'despesas', v_despesas,
      'resultado', v_entradas - v_taxas - v_comissoes - v_vales - v_despesas
    ),
    'por_forma', coalesce((
      select jsonb_agg(jsonb_build_object('forma', f.forma, 'total', f.total, 'quantidade', f.qtd, 'taxas', f.taxas) order by f.total desc)
      from (
        select p.forma, sum(p.valor_centavos)::bigint as total, count(*) as qtd, sum(p.taxa_centavos)::bigint as taxas
        from public.pagamentos p
        where p.salao_id = p_salao_id and p.removido_em is null and p.criado_em >= v_ini and p.criado_em < v_fim
        group by p.forma
      ) f), '[]'::jsonb),
    'por_profissional', coalesce((
      select jsonb_agg(jsonb_build_object('nome', x.nome, 'servicos', x.servicos, 'produtos', x.produtos, 'total', x.total, 'quantidade', x.qtd) order by x.total desc)
      from (
        select coalesce(pr.nome, 'Sem profissional') as nome,
               coalesce(sum(i.total_centavos) filter (where i.tipo = 'servico'), 0)::bigint as servicos,
               coalesce(sum(i.total_centavos) filter (where i.tipo = 'produto'), 0)::bigint as produtos,
               sum(i.total_centavos)::bigint as total,
               count(*) as qtd
        from public.comanda_itens i
        join public.comandas c on c.id = i.comanda_id
        left join public.profissionais pr on pr.id = i.profissional_id
        where c.salao_id = p_salao_id and c.situacao = 'fechada' and c.fechada_em >= v_ini and c.fechada_em < v_fim
          and i.removido_em is null
        group by pr.nome
      ) x), '[]'::jsonb),
    'por_item', coalesce((
      select jsonb_agg(jsonb_build_object('tipo', x.tipo, 'nome', x.nome, 'quantidade', x.qtd, 'total', x.total) order by x.total desc)
      from (
        select i.tipo, coalesce(s.nome, pd.nome, 'Item') as nome, sum(i.quantidade)::bigint as qtd, sum(i.total_centavos)::bigint as total
        from public.comanda_itens i
        join public.comandas c on c.id = i.comanda_id
        left join public.servicos s on s.id = i.servico_id
        left join public.produtos pd on pd.id = i.produto_id
        where c.salao_id = p_salao_id and c.situacao = 'fechada' and c.fechada_em >= v_ini and c.fechada_em < v_fim
          and i.removido_em is null
        group by i.tipo, coalesce(s.nome, pd.nome, 'Item')
      ) x), '[]'::jsonb),
    'descontos_comanda', coalesce((
      select sum(c.desconto_centavos) from public.comandas c
      where c.salao_id = p_salao_id and c.situacao = 'fechada' and c.fechada_em >= v_ini and c.fechada_em < v_fim), 0),
    'comandas_fechadas', (
      select count(*) from public.comandas c
      where c.salao_id = p_salao_id and c.situacao = 'fechada' and c.fechada_em >= v_ini and c.fechada_em < v_fim),
    'por_categoria', coalesce((
      select jsonb_agg(jsonb_build_object('nome', x.nome, 'total', x.total, 'quantidade', x.qtd) order by x.total desc)
      from (
        select cd.nome, sum(d.valor_centavos)::bigint as total, count(*) as qtd
        from public.despesas d
        join public.categorias_despesa cd on cd.id = d.categoria_id
        where d.salao_id = p_salao_id and d.cancelado_em is null and d.pago_em between p_de and p_ate
        group by cd.nome
      ) x), '[]'::jsonb),
    -- Informativo: comissões geradas no período que ainda não foram pagas.
    'comissoes_a_pagar', coalesce((
      select sum(co.valor_centavos) from public.comissoes co
      where co.salao_id = p_salao_id and co.pagamento_id is null and co.criado_em >= v_ini and co.criado_em < v_fim), 0)
  );
end;
$$;
revoke all on function public.relatorio_periodo(uuid, date, date) from public, anon;
grant execute on function public.relatorio_periodo(uuid, date, date) to authenticated;
