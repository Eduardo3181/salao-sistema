-- Importação por planilha (clientes e serviços). Só o dono importa.
-- As funções conferem a permissão, pulam o que já existe e devolvem quantas linhas entraram.
-- Cada linha inserida passa pelos mesmos gatilhos de sempre (auditoria, validações).

create function public.importar_clientes(p_salao_id uuid, p_linhas jsonb)
returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare
  v_linha     jsonb;
  v_nome      text;
  v_telefone  text;
  v_inseridas integer := 0;
  v_ja_tinha  integer := 0;
begin
  if privado.perfil_no_salao(p_salao_id) is distinct from 'dono' then
    raise exception 'Só o dono pode importar clientes.' using errcode = '42501';
  end if;
  if jsonb_typeof(p_linhas) <> 'array' or jsonb_array_length(p_linhas) > 2000 then
    raise exception 'Envie no máximo 2000 linhas por vez.' using errcode = '22023';
  end if;

  for v_linha in select * from jsonb_array_elements(p_linhas) loop
    v_nome := btrim(v_linha ->> 'nome');
    v_telefone := nullif(v_linha ->> 'telefone', '');

    -- Já existe? (mesmo telefone; ou, sem telefone, mesmo nome)
    if exists (
      select 1 from public.clientes c
      where c.salao_id = p_salao_id
        and (
          (v_telefone is not null and c.telefone = v_telefone)
          or (v_telefone is null and lower(btrim(c.nome)) = lower(v_nome))
        )
    ) then
      v_ja_tinha := v_ja_tinha + 1;
      continue;
    end if;

    insert into public.clientes (salao_id, nome, telefone, nascimento, observacoes)
    values (
      p_salao_id,
      v_nome,
      v_telefone,
      nullif(v_linha ->> 'nascimento', '')::date,
      nullif(v_linha ->> 'observacoes', '')
    );
    v_inseridas := v_inseridas + 1;
  end loop;

  return jsonb_build_object('inseridas', v_inseridas, 'ja_existiam', v_ja_tinha);
end;
$$;
revoke all on function public.importar_clientes(uuid, jsonb) from public, anon;
grant execute on function public.importar_clientes(uuid, jsonb) to authenticated;

create function public.importar_servicos(p_salao_id uuid, p_linhas jsonb)
returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare
  v_linha      jsonb;
  v_categoria  uuid;
  v_inseridos  integer := 0;
  v_ja_tinha   integer := 0;
  v_categorias integer := 0;
begin
  if privado.perfil_no_salao(p_salao_id) is distinct from 'dono' then
    raise exception 'Só o dono pode importar serviços.' using errcode = '42501';
  end if;
  if jsonb_typeof(p_linhas) <> 'array' or jsonb_array_length(p_linhas) > 2000 then
    raise exception 'Envie no máximo 2000 linhas por vez.' using errcode = '22023';
  end if;

  for v_linha in select * from jsonb_array_elements(p_linhas) loop
    if exists (
      select 1 from public.servicos s
      where s.salao_id = p_salao_id and lower(btrim(s.nome)) = lower(btrim(v_linha ->> 'nome'))
    ) then
      v_ja_tinha := v_ja_tinha + 1;
      continue;
    end if;

    -- Usa a categoria com o mesmo nome; se não existir, cria.
    select id into v_categoria from public.categorias_servico
    where salao_id = p_salao_id and lower(btrim(nome)) = lower(btrim(v_linha ->> 'categoria'));
    if v_categoria is null then
      insert into public.categorias_servico (salao_id, nome)
      values (p_salao_id, btrim(v_linha ->> 'categoria'))
      returning id into v_categoria;
      v_categorias := v_categorias + 1;
    end if;

    insert into public.servicos (salao_id, categoria_id, nome, duracao_min, preco_centavos)
    values (
      p_salao_id,
      v_categoria,
      btrim(v_linha ->> 'nome'),
      (v_linha ->> 'duracao_min')::integer,
      (v_linha ->> 'preco_centavos')::bigint
    );
    v_inseridos := v_inseridos + 1;
  end loop;

  return jsonb_build_object('inseridos', v_inseridos, 'ja_existiam', v_ja_tinha, 'categorias_criadas', v_categorias);
end;
$$;
revoke all on function public.importar_servicos(uuid, jsonb) from public, anon;
grant execute on function public.importar_servicos(uuid, jsonb) to authenticated;
