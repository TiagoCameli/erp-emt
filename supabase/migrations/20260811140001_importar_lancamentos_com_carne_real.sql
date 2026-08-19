-- =============================================================
-- Importacao de lancamentos: o carne de verdade, e nao a estimativa
--
-- POR QUE. A primeira carga do historico veio de uma planilha em nivel de
-- LANCAMENTO, sem o valor de cada parcela. A funcao reconstruia as parcelas
-- dividindo o total em partes iguais pelas datas de vencimento. Isso e uma
-- estimativa, e o resultado foi que o ERP ficou com R$ 3,1 milhoes a mais
-- que a origem e com 1.436 lancamentos que nao existem: o pagamento de uma
-- parcela, quando nao casava com o total do lancamento, entrava como um
-- lancamento avulso pago, enquanto a parcela original ficava aberta. Duas
-- vezes o mesmo dinheiro, e "sem conta" onde ja estava pago.
--
-- O export em nivel de PARCELA do maiscontrole traz "11/57 parcelas" com o
-- vencimento e o valor de cada uma. Esta migration ensina a importacao a
-- receber isso.
--
-- O QUE MUDA
--
-- 1. valores_parcelas: o valor de cada parcela. Quando vem, manda; quando
--    nao vem, continua a divisao em partes iguais (planilha escrita a mao
--    segue funcionando exatamente como antes).
--
-- 2. pagamentos POSICIONAIS. Antes era "as k primeiras parcelas pagas".
--    Existe carne com a parcela 3 paga e a 2 em aberto, e ali alinhar por
--    contagem marcava a parcela errada como paga. Agora null na posicao k
--    significa "parcela k em aberto".
--
-- 3. contas_parcelas: carne pago de contas diferentes ao longo do tempo. Sao
--    77 lancamentos no historico real.
--
-- 4. centros_rateio / valores_rateio: lancamento dividido entre obras. Sao
--    141 lancamentos, R$ 2,2 milhoes. Centro de custo e a espinha dorsal do
--    ERP: colapsar uma nota dividida entre duas obras numa obra so apaga
--    custo de uma e infla o da outra.
--
-- 5. A parcela a marcar como paga e achada por (vencimento, valor), e nao por
--    numero_parcela. fn_salvar_lancamento numera as parcelas pela ordem de
--    VENCIMENTO, que nao e necessariamente a ordem em que a planilha listou;
--    casar pelo par nao depende dessa ordem. E o "status <> pago" garante que
--    duas parcelas identicas nao recebam o mesmo pagamento duas vezes. Se nao
--    achar a parcela, levanta excecao em vez de deixar pagamento no chao.
-- =============================================================

-- Rateio de uma linha. Separado da funcao principal so para manter o corpo
-- dela legivel.
create or replace function public.fn_rateios_da_linha(
  p_linha jsonb, p_valor numeric, p_centro_padrao uuid
) returns jsonb
language plpgsql stable security definer set search_path = ''
as $$
declare
  v_centros text[]; v_valores numeric(14,2)[]; v_out jsonb := '[]'::jsonb;
  v_k int; v_id uuid;
begin
  if jsonb_typeof(p_linha->'centros_rateio') <> 'array'
     or jsonb_typeof(p_linha->'valores_rateio') <> 'array' then
    return jsonb_build_array(jsonb_build_object('centro_custo_id', p_centro_padrao, 'valor', p_valor));
  end if;

  select array_agg(nullif(btrim(coalesce(x,'')),'') order by ordinality) into v_centros
    from jsonb_array_elements_text(p_linha->'centros_rateio') with ordinality as t(x, ordinality);
  select array_agg(round((x)::numeric,2) order by ordinality) into v_valores
    from jsonb_array_elements_text(p_linha->'valores_rateio') with ordinality as t(x, ordinality);

  for v_k in 1 .. coalesce(array_length(v_centros,1),0) loop
    select id into v_id from public.centros_custo
    where public.fn_chave_nome(nome) = public.fn_chave_nome(v_centros[v_k])
    order by nivel limit 1;
    if v_id is null then
      raise exception 'Centro de custo do rateio "%" nao cadastrado', v_centros[v_k];
    end if;
    v_out := v_out || jsonb_build_object('centro_custo_id', v_id, 'valor', v_valores[v_k]);
  end loop;
  return v_out;
end $$;

revoke all on function public.fn_rateios_da_linha(jsonb, numeric, uuid) from public, anon;
grant execute on function public.fn_rateios_da_linha(jsonb, numeric, uuid) to authenticated;

create or replace function public.fn_importar_lancamentos(p_linhas jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_usuario uuid := (select auth.uid());
  v_linha jsonb;
  v_erros jsonb := '[]'::jsonb;
  v_forn uuid; v_cat uuid; v_forma uuid; v_cc uuid; v_conta uuid; v_conta_k uuid;
  v_doc text; v_nome text; v_txt text; v_conta_txt text;
  v_venc date[]; v_pgto date[]; v_valor numeric(14,2);
  v_val numeric(14,2)[]; v_contas text[];
  v_lanc uuid; v_criados int := 0; v_parc_pagas int := 0;
  v_dados jsonb; v_parcelas jsonb; v_rateios jsonb;
  v_n int; v_k int; v_resto numeric(14,2); v_base numeric(14,2);
  v_obs text; v_parcela_id uuid; v_soma numeric(14,2);
begin
  if not public.tem_permissao('financeiro.lancamentos', 'criar') then
    raise exception 'Sem permissao para criar lancamentos';
  end if;
  if v_usuario is null then
    raise exception 'Importacao exige usuario autenticado';
  end if;
  if jsonb_typeof(p_linhas) <> 'array' then
    raise exception 'p_linhas deve ser um array';
  end if;

  -- ---------------------------------------------------------------
  -- FASE 1: resolver e validar tudo, sem gravar nada
  -- ---------------------------------------------------------------
  for v_linha in select * from jsonb_array_elements(p_linhas) loop
    v_txt := null;

    v_valor := round((v_linha->>'valor')::numeric, 2);
    if v_valor is null or v_valor <= 0 then
      v_txt := 'Valor deve ser maior que zero';
    end if;

    if nullif(btrim(coalesce(v_linha->>'data_lancamento','')), '') is null then
      v_txt := coalesce(v_txt || '; ', '') || 'Informe a data do lancamento';
    end if;

    v_doc := nullif(regexp_replace(coalesce(v_linha->>'documento_fornecedor',''), '\D', '', 'g'), '');
    v_nome := btrim(coalesce(v_linha->>'fornecedor',''));
    v_forn := null;
    if v_doc is not null then
      select id into v_forn from public.fornecedores
      where regexp_replace(coalesce(cnpj_cpf,''), '\D', '', 'g') = v_doc limit 1;
    end if;
    if v_forn is null and v_nome <> '' then
      select id into v_forn from public.fornecedores
      where public.fn_chave_nome(razao_social) = public.fn_chave_nome(v_nome)
         or public.fn_chave_nome(coalesce(nome_fantasia,'')) = public.fn_chave_nome(v_nome)
      order by created_at limit 1;
    end if;
    if v_forn is null then
      v_txt := coalesce(v_txt || '; ', '') || format('Fornecedor "%s" nao cadastrado', v_nome);
    end if;

    select id into v_cat from public.categorias_financeiras
    where public.fn_chave_nome(nome) = public.fn_chave_nome(coalesce(v_linha->>'categoria',''))
    limit 1;
    if v_cat is null then
      v_txt := coalesce(v_txt || '; ', '') || format('Categoria "%s" nao cadastrada', v_linha->>'categoria');
    end if;

    select id into v_cc from public.centros_custo
    where public.fn_chave_nome(nome) = public.fn_chave_nome(coalesce(v_linha->>'centro_custo',''))
    order by nivel limit 1;
    if v_cc is null then
      v_txt := coalesce(v_txt || '; ', '') || format('Centro de custo "%s" nao cadastrado', v_linha->>'centro_custo');
    end if;

    v_forma := null;
    if coalesce(v_linha->>'forma_pagamento','') <> '' then
      select id into v_forma from public.formas_pagamento
      where public.fn_chave_nome(nome) = public.fn_chave_nome(v_linha->>'forma_pagamento') limit 1;
      if v_forma is null then
        v_txt := coalesce(v_txt || '; ', '') || format('Forma de pagamento "%s" nao cadastrada', v_linha->>'forma_pagamento');
      end if;
    end if;

    v_conta := null;
    if coalesce(v_linha->>'conta','') <> '' then
      select id into v_conta from public.contas_bancarias
      where public.fn_chave_nome(nome) = public.fn_chave_nome(v_linha->>'conta') limit 1;
      if v_conta is null then
        v_txt := coalesce(v_txt || '; ', '') || format('Conta "%s" nao cadastrada', v_linha->>'conta');
      end if;
    end if;

    select array_agg((x)::date order by ordinality) into v_venc
      from jsonb_array_elements_text(public.fn_jsonb_lista(v_linha->'vencimentos')) with ordinality as t(x, ordinality);
    if v_venc is null or array_length(v_venc, 1) is null then
      v_txt := coalesce(v_txt || '; ', '') || 'Informe pelo menos um vencimento';
    end if;

    -- Carne explicito: o valor de cada parcela tem que somar o valor do
    -- lancamento. E esta conferencia que impede repetir o erro da primeira
    -- carga, onde a parcela era estimada e nao fechava com a origem.
    v_val := null;
    if jsonb_typeof(v_linha->'valores_parcelas') = 'array' then
      select array_agg(round((x)::numeric, 2) order by ordinality) into v_val
        from jsonb_array_elements_text(v_linha->'valores_parcelas') with ordinality as t(x, ordinality);
      if coalesce(array_length(v_val,1),0) <> coalesce(array_length(v_venc,1),0) then
        v_txt := coalesce(v_txt || '; ', '') || format('%s valores de parcela para %s vencimentos',
          coalesce(array_length(v_val,1),0), coalesce(array_length(v_venc,1),0));
      else
        select coalesce(sum(v), 0) into v_soma from unnest(v_val) v;
        if v_soma <> v_valor then
          v_txt := coalesce(v_txt || '; ', '') || format('Soma das parcelas (%s) diferente do valor (%s)', v_soma, v_valor);
        end if;
      end if;
    end if;

    -- Pagamentos POSICIONAIS: null na posicao k = parcela k em aberto.
    select array_agg(case when x is null or x = '' then null else (x)::date end order by ordinality)
      into v_pgto
      from jsonb_array_elements_text(public.fn_jsonb_lista(v_linha->'pagamentos')) with ordinality as t(x, ordinality);
    if v_pgto is not null and array_length(v_pgto,1) > coalesce(array_length(v_venc,1), 0) then
      v_txt := coalesce(v_txt || '; ', '') || 'Mais datas de pagamento que de vencimento';
    end if;

    v_contas := null;
    if jsonb_typeof(v_linha->'contas_parcelas') = 'array' then
      select array_agg(nullif(btrim(coalesce(x,'')), '') order by ordinality) into v_contas
        from jsonb_array_elements_text(v_linha->'contas_parcelas') with ordinality as t(x, ordinality);
      for v_k in 1 .. coalesce(array_length(v_contas,1), 0) loop
        if v_contas[v_k] is not null and not exists (
          select 1 from public.contas_bancarias
          where public.fn_chave_nome(nome) = public.fn_chave_nome(v_contas[v_k])
        ) then
          v_txt := coalesce(v_txt || '; ', '') || format('Conta "%s" nao cadastrada', v_contas[v_k]);
        end if;
      end loop;
    end if;

    -- Toda parcela paga precisa de conta: a da posicao, ou a da linha.
    for v_k in 1 .. coalesce(array_length(v_pgto,1), 0) loop
      if v_pgto[v_k] is not null
         and coalesce(v_contas[v_k], v_linha->>'conta', '') = '' then
        v_txt := coalesce(v_txt || '; ', '') || format('Parcela %s paga sem conta bancaria', v_k);
      end if;
    end loop;

    if v_txt is not null then
      v_erros := v_erros || jsonb_build_object('linha', (v_linha->>'linha')::int, 'erro', v_txt);
    end if;
  end loop;

  if jsonb_array_length(v_erros) > 0 then
    return jsonb_build_object(
      'ok', false, 'criados', 0, 'erros', v_erros,
      'mensagem', format('%s linha(s) com problema. Nada foi gravado.', jsonb_array_length(v_erros))
    );
  end if;

  -- ---------------------------------------------------------------
  -- FASE 2: gravar
  -- ---------------------------------------------------------------
  for v_linha in select * from jsonb_array_elements(p_linhas) loop
    v_valor := round((v_linha->>'valor')::numeric, 2);

    v_doc := nullif(regexp_replace(coalesce(v_linha->>'documento_fornecedor',''), '\D', '', 'g'), '');
    v_nome := btrim(coalesce(v_linha->>'fornecedor',''));
    v_forn := null;
    if v_doc is not null then
      select id into v_forn from public.fornecedores
      where regexp_replace(coalesce(cnpj_cpf,''), '\D', '', 'g') = v_doc limit 1;
    end if;
    if v_forn is null then
      select id into v_forn from public.fornecedores
      where public.fn_chave_nome(razao_social) = public.fn_chave_nome(v_nome)
         or public.fn_chave_nome(coalesce(nome_fantasia,'')) = public.fn_chave_nome(v_nome)
      order by created_at limit 1;
    end if;

    select id into v_cat from public.categorias_financeiras
    where public.fn_chave_nome(nome) = public.fn_chave_nome(coalesce(v_linha->>'categoria','')) limit 1;
    select id into v_cc from public.centros_custo
    where public.fn_chave_nome(nome) = public.fn_chave_nome(coalesce(v_linha->>'centro_custo','')) order by nivel limit 1;
    v_forma := null;
    if coalesce(v_linha->>'forma_pagamento','') <> '' then
      select id into v_forma from public.formas_pagamento
      where public.fn_chave_nome(nome) = public.fn_chave_nome(v_linha->>'forma_pagamento') limit 1;
    end if;
    v_conta := null;
    if coalesce(v_linha->>'conta','') <> '' then
      select id into v_conta from public.contas_bancarias
      where public.fn_chave_nome(nome) = public.fn_chave_nome(v_linha->>'conta') limit 1;
    end if;

    select array_agg((x)::date order by ordinality) into v_venc
      from jsonb_array_elements_text(public.fn_jsonb_lista(v_linha->'vencimentos')) with ordinality as t(x, ordinality);
    select array_agg(case when x is null or x = '' then null else (x)::date end order by ordinality)
      into v_pgto
      from jsonb_array_elements_text(public.fn_jsonb_lista(v_linha->'pagamentos')) with ordinality as t(x, ordinality);

    v_val := null;
    if jsonb_typeof(v_linha->'valores_parcelas') = 'array' then
      select array_agg(round((x)::numeric, 2) order by ordinality) into v_val
        from jsonb_array_elements_text(v_linha->'valores_parcelas') with ordinality as t(x, ordinality);
    end if;
    v_contas := null;
    if jsonb_typeof(v_linha->'contas_parcelas') = 'array' then
      select array_agg(nullif(btrim(coalesce(x,'')), '') order by ordinality) into v_contas
        from jsonb_array_elements_text(v_linha->'contas_parcelas') with ordinality as t(x, ordinality);
    end if;

    v_n := array_length(v_venc, 1);
    v_parcelas := '[]'::jsonb;
    if v_val is not null then
      for v_k in 1 .. v_n loop
        v_parcelas := v_parcelas || jsonb_build_object(
          'valor', v_val[v_k],
          'data_vencimento', to_char(v_venc[v_k], 'YYYY-MM-DD'));
      end loop;
    else
      -- Sem carne: divide igual, sobra na primeira. E estimativa, e esta aqui
      -- so para a planilha escrita a mao continuar funcionando.
      v_base := trunc(v_valor / v_n, 2);
      v_resto := v_valor - (v_base * v_n);
      for v_k in 1 .. v_n loop
        v_parcelas := v_parcelas || jsonb_build_object(
          'valor', (v_base + case when v_k = 1 then v_resto else 0 end),
          'data_vencimento', to_char(v_venc[v_k], 'YYYY-MM-DD'));
      end loop;
    end if;

    v_rateios := public.fn_rateios_da_linha(v_linha, v_valor, v_cc);

    v_obs := nullif(concat_ws(E'\n',
      nullif(btrim(coalesce(v_linha->>'observacoes','')), ''),
      case when coalesce(v_linha->>'quem_paga','') <> ''
             and public.fn_chave_nome(v_linha->>'quem_paga') <> 'empresa'
           then 'Pago pelo cliente' end,
      case when coalesce(btrim(v_linha->>'numero_documento'),'') <> ''
           then 'Documento: ' || btrim(v_linha->>'numero_documento') end,
      case when coalesce(v_linha->>'plano_contas','') <> ''
           then 'Plano de contas: ' || (v_linha->>'plano_contas') end,
      case when coalesce(v_linha->>'ordem_compra','') <> ''
           then 'OC da planilha: ' || (v_linha->>'ordem_compra') end
    ), '');

    v_dados := jsonb_build_object(
      'tipo', coalesce(nullif(v_linha->>'tipo',''), 'a_pagar'),
      'fornecedor_id', v_forn, 'categoria_id', v_cat,
      'forma_pagamento_id', v_forma, 'condicao_pagamento_id', null,
      'descricao', coalesce(nullif(btrim(v_linha->>'descricao'),''), 'Importado da planilha'),
      'valor', v_valor,
      'data_compra', v_linha->>'data_lancamento',
      'mes_competencia', v_linha->>'competencia',
      'data_vencimento', to_char(v_venc[1], 'YYYY-MM-DD'),
      'observacoes', v_obs
    );

    v_lanc := public.fn_salvar_lancamento(null, v_dados, v_parcelas, v_rateios);
    v_criados := v_criados + 1;

    for v_k in 1 .. coalesce(array_length(v_pgto,1), 0) loop
      if v_pgto[v_k] is null then continue; end if;

      v_conta_txt := v_contas[v_k];
      if v_conta_txt is null then
        v_conta_k := v_conta;
      else
        select id into v_conta_k from public.contas_bancarias
        where public.fn_chave_nome(nome) = public.fn_chave_nome(v_conta_txt) limit 1;
      end if;

      select p.id into v_parcela_id
      from public.lancamento_parcelas p
      where p.lancamento_id = v_lanc
        and p.data_vencimento = v_venc[v_k]
        and p.valor = coalesce(v_val[v_k], p.valor)
        and p.status <> 'pago'
      order by p.numero_parcela
      limit 1;

      if v_parcela_id is null then
        raise exception 'Linha %: nao achei a parcela de % em % para marcar como paga',
          v_linha->>'linha', coalesce(v_val[v_k], v_valor), v_venc[v_k];
      end if;

      update public.lancamento_parcelas p
      set status = 'pago',
          conta_bancaria_id = v_conta_k,
          data_programada = coalesce(p.data_programada, p.data_vencimento),
          data_programada_origem = coalesce(p.data_programada_origem, 'vencimento'),
          data_pagamento = v_pgto[v_k],
          desconto = 0,
          aprovado_por = v_usuario, aprovado_em = now(),
          conferido_por = v_usuario, conferido_em = now(),
          pago_por = v_usuario, pago_em = now()
      where p.id = v_parcela_id;
      v_parc_pagas := v_parc_pagas + 1;
    end loop;

    update public.lancamentos l
    set status = case
          when not exists (select 1 from public.lancamento_parcelas x
                           where x.lancamento_id = l.id and x.status <> 'pago')
          then 'pago'
          when exists (select 1 from public.lancamento_parcelas x
                       where x.lancamento_id = l.id and x.status = 'pago')
          then 'aprovado'
          else l.status end
    where l.id = v_lanc;
  end loop;

  insert into public.audit_log (tabela, registro_id, acao, usuario_id, dados_depois)
  values ('importacao_lancamentos', gen_random_uuid()::text, 'INSERT', v_usuario,
          jsonb_build_object('linhas', jsonb_array_length(p_linhas),
                             'lancamentos_criados', v_criados,
                             'parcelas_pagas', v_parc_pagas));

  return jsonb_build_object('ok', true, 'criados', v_criados,
    'parcelas_pagas', v_parc_pagas, 'erros', '[]'::jsonb,
    'mensagem', format('%s lancamento(s) importado(s), %s parcela(s) marcada(s) como paga(s).', v_criados, v_parc_pagas));
end $$;

revoke all on function public.fn_importar_lancamentos(jsonb) from public, anon;
grant execute on function public.fn_importar_lancamentos(jsonb) to authenticated;

-- Carga em lote precisa de mais tempo que consulta de tela. O CREATE OR REPLACE
-- nao preserva o SET da funcao, entao reaplica.
alter function public.fn_importar_lancamentos(jsonb) set statement_timeout = '10min';

comment on function public.fn_importar_lancamentos(jsonb) is
  'Importa lancamentos de planilha. Aceita o carne explicito (valores_parcelas, contas_parcelas), rateio explicito (centros_rateio, valores_rateio) e datas de pagamento POSICIONAIS (null = parcela em aberto). Sem valores_parcelas, divide o valor em partes iguais pelos vencimentos, que e apenas estimativa. Valida tudo antes de gravar nada.';
