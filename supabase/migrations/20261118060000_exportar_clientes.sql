-- Exportar dados de clientes (LGPD e portabilidade). Decisão da dona (18/11/2026): fazer as duas.
-- 1) exportar_dados_cliente: tudo o que o salão guarda sobre UM cliente, para entregar a ele quando pedir.
--    Fica de fora o que é interno do salão (comissões, taxas do cartão, quem lançou).
-- 2) exportar_clientes: a lista completa de clientes do salão, para guardar uma cópia ou levar para outro sistema.
-- Só o dono. Cada exportação fica no histórico (sem dados pessoais: só quem, quando e de qual cliente).

create function public.exportar_dados_cliente(p_salao_id uuid, p_cliente_id uuid)
returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare
  v jsonb;
begin
  if coalesce(privado.perfil_no_salao(p_salao_id) = 'dono', false) is not true then
    raise exception 'Só o dono pode baixar os dados de um cliente.' using errcode = '42501';
  end if;
  if not exists (select 1 from public.clientes where id = p_cliente_id and salao_id = p_salao_id) then
    raise exception 'Cliente não encontrado.' using errcode = '22023';
  end if;
  if exists (select 1 from public.clientes where id = p_cliente_id and removido_em is not null) then
    raise exception 'Os dados pessoais deste cliente já foram apagados.' using errcode = '22023';
  end if;

  select jsonb_build_object(
    'cliente', (
      select jsonb_build_object(
        'nome', c.nome, 'telefone', c.telefone, 'nascimento', c.nascimento, 'observacoes', c.observacoes,
        'ativo', c.ativo, 'cadastrado_em', c.criado_em)
      from public.clientes c
      where c.id = p_cliente_id and c.salao_id = p_salao_id
    ),
    'aceites', coalesce((
      select jsonb_agg(jsonb_build_object('aceitou', a.aceitou, 'origem', a.origem, 'registrado_em', a.registrado_em)
                       order by a.registrado_em)
      from public.consentimentos_whatsapp a
      where a.salao_id = p_salao_id and a.cliente_id = p_cliente_id
    ), '[]'::jsonb),
    'horarios', coalesce((
      select jsonb_agg(jsonb_build_object(
               'inicio', i.inicio, 'servico', s.nome, 'profissional', p.nome,
               'situacao', ag.situacao, 'valor', i.preco_centavos)
             order by i.inicio)
      from public.agendamentos ag
      join public.agendamento_itens i on i.agendamento_id = ag.id and i.salao_id = ag.salao_id
      join public.servicos s on s.id = i.servico_id and s.salao_id = ag.salao_id
      join public.profissionais p on p.id = i.profissional_id and p.salao_id = ag.salao_id
      where ag.salao_id = p_salao_id and ag.cliente_id = p_cliente_id
    ), '[]'::jsonb),
    'consumo', coalesce((
      select jsonb_agg(x.linha order by x.quando, x.ordem)
      from (
        select cm.aberta_em as quando, it.criado_em as ordem,
               jsonb_build_object(
                 'data', cm.aberta_em, 'situacao', cm.situacao,
                 'item', coalesce(s.nome, pr.nome), 'profissional', p.nome,
                 'quantidade', it.quantidade, 'total', it.total_centavos) as linha
        from public.comandas cm
        join public.comanda_itens it on it.comanda_id = cm.id and it.salao_id = cm.salao_id and it.removido_em is null
        left join public.servicos s on s.id = it.servico_id and s.salao_id = cm.salao_id
        left join public.produtos pr on pr.id = it.produto_id and pr.salao_id = cm.salao_id
        left join public.profissionais p on p.id = it.profissional_id and p.salao_id = cm.salao_id
        where cm.salao_id = p_salao_id and cm.cliente_id = p_cliente_id
        union all
        select cm.aberta_em, 'infinity'::timestamptz,
               jsonb_build_object(
                 'data', cm.aberta_em, 'situacao', cm.situacao,
                 'item', 'Desconto na comanda', 'profissional', null,
                 'quantidade', 1, 'total', -cm.desconto_centavos)
        from public.comandas cm
        where cm.salao_id = p_salao_id and cm.cliente_id = p_cliente_id and cm.desconto_centavos > 0
      ) x
    ), '[]'::jsonb),
    'pagamentos', coalesce((
      select jsonb_agg(jsonb_build_object(
               'data', pg.criado_em, 'forma', pg.forma, 'parcelas', pg.parcelas, 'valor', pg.valor_centavos)
             order by pg.criado_em)
      from public.pagamentos pg
      join public.comandas cm on cm.id = pg.comanda_id and cm.salao_id = pg.salao_id
      where pg.salao_id = p_salao_id and cm.cliente_id = p_cliente_id and pg.removido_em is null
    ), '[]'::jsonb)
  ) into v;

  insert into public.audit_log (salao_id, user_id, acao, entidade, entidade_id, antes, depois)
  values (p_salao_id, auth.uid(), 'exportar', 'clientes', p_cliente_id, null, null);

  return v;
end;
$$;
revoke all on function public.exportar_dados_cliente(uuid, uuid) from public, anon;
grant execute on function public.exportar_dados_cliente(uuid, uuid) to authenticated;

create function public.exportar_clientes(p_salao_id uuid)
returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare
  v jsonb;
begin
  if coalesce(privado.perfil_no_salao(p_salao_id) = 'dono', false) is not true then
    raise exception 'Só o dono pode baixar a lista de clientes.' using errcode = '42501';
  end if;

  select coalesce(jsonb_agg(jsonb_build_object(
           'nome', c.nome, 'telefone', c.telefone, 'nascimento', c.nascimento, 'observacoes', c.observacoes,
           'ativo', c.ativo, 'cadastrado_em', c.criado_em,
           'whatsapp', (select a.aceitou from public.consentimentos_whatsapp a
                        where a.salao_id = c.salao_id and a.cliente_id = c.id
                        order by a.registrado_em desc limit 1),
           'ultima_visita', (select max(cm.fechada_em) from public.comandas cm
                             where cm.salao_id = c.salao_id and cm.cliente_id = c.id and cm.situacao = 'fechada'))
         order by lower(c.nome)), '[]'::jsonb)
    into v
  from public.clientes c
  where c.salao_id = p_salao_id and c.removido_em is null;

  insert into public.audit_log (salao_id, user_id, acao, entidade, entidade_id, antes, depois)
  values (p_salao_id, auth.uid(), 'exportar', 'clientes', null, null, jsonb_build_object('quantidade', jsonb_array_length(v)));

  return v;
end;
$$;
revoke all on function public.exportar_clientes(uuid) from public, anon;
grant execute on function public.exportar_clientes(uuid) to authenticated;
