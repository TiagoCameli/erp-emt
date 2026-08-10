-- =============================================================
-- Importacao de lancamentos por planilha
--
-- Regra 10 do CLAUDE.md: todo cadastro tem importacao por planilha.
-- Lancamentos nao tinha, e a carga do historico financeiro da EMT
-- (6.613 lancamentos, 8.608 parcelas, R$ 61,4 milhoes) e o primeiro
-- uso dela.
--
-- DESENHO
--
-- 1. NAO reimplementa regra: chama fn_salvar_lancamento por linha,
--    que ja valida soma das parcelas = valor, soma do rateio = valor,
--    guarda de origem e identidade de conferencia. Importacao que
--    duplica validacao e importacao que aceita o que a tela recusa.
--
-- 2. Duas fases. Resolve e valida TODAS as linhas primeiro; so grava
--    se nao houver erro nenhum. Metade de uma carga de dinheiro
--    gravada e pior que carga nenhuma.
--
-- 3. Casamento por chave sem acento (fn_chave_nome), porque a
--    planilha vem da obra e raramente tem acento. Fornecedor casa
--    primeiro por documento, depois por nome.
--
-- 4. Nao cria cadastro que falta. Categoria, conta, centro de custo,
--    forma e condicao inexistentes viram ERRO com o nome exato, para
--    a pessoa cadastrar e reimportar. Importacao que cria cadastro
--    silenciosamente transforma erro de digitacao em plano de contas
--    novo.
--
-- 5. Pagamento na mesma planilha: se a linha traz data de pagamento,
--    a parcela nasce aprovada e paga. E carga de historico, o
--    pagamento JA aconteceu no mundo real, entao nao passa pela
--    janela de pagamento nem pela guarda de saldo de
--    fn_pagar_parcela (que existem para pagamento ao vivo). O
--    aprovado_por/pago_por fica com o usuario que importou, e a
--    trilha de auditoria registra tudo.
-- =============================================================

-- -------------------------------------------------------------
-- fn_jsonb_lista: devolve o valor quando ele E array, ou array
-- vazio em qualquer outro caso.
--
-- Existe por causa de um erro real: coluna opcional vazia chega da
-- Server Action como JSON `null`, e `v_linha->'chave'` devolve
-- 'null'::jsonb, que NAO e SQL NULL. Entao o coalesce nao pegava e
-- jsonb_array_elements_text recebia um escalar, levantando
-- "cannot extract elements from a scalar" e derrubando a carga
-- inteira. Checar o TIPO e o unico jeito seguro.
-- -------------------------------------------------------------
create or replace function public.fn_jsonb_lista(p_valor jsonb)
returns jsonb
language sql
immutable
set search_path = ''
as $$
  select case when jsonb_typeof(p_valor) = 'array' then p_valor else '[]'::jsonb end;
$$;

revoke all on function public.fn_jsonb_lista(jsonb) from public, anon;
grant execute on function public.fn_jsonb_lista(jsonb) to authenticated;

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
  v_i int;
  -- resolvidos
  v_forn uuid; v_cat uuid; v_forma uuid; v_cond uuid; v_cc uuid; v_conta uuid;
  v_doc text; v_nome text; v_txt text;
  v_venc date[]; v_pgto date[]; v_valor numeric(14,2);
  v_lanc uuid; v_criados int := 0; v_parc_pagas int := 0;
  v_dados jsonb; v_parcelas jsonb; v_rateios jsonb;
  v_n int; v_k int; v_resto numeric(14,2); v_base numeric(14,2);
  v_obs text;
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
  v_i := 0;
  for v_linha in select * from jsonb_array_elements(p_linhas) loop
    v_i := v_i + 1;
    v_txt := null;

    v_valor := round((v_linha->>'valor')::numeric, 2);
    if v_valor is null or v_valor <= 0 then
      v_txt := 'Valor deve ser maior que zero';
    end if;

    -- Fornecedor: documento primeiro, nome depois.
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

    -- Categoria financeira
    select id into v_cat from public.categorias_financeiras
    where public.fn_chave_nome(nome) = public.fn_chave_nome(coalesce(v_linha->>'categoria',''))
    limit 1;
    if v_cat is null then
      v_txt := coalesce(v_txt || '; ', '') || format('Categoria "%s" nao cadastrada', v_linha->>'categoria');
    end if;

    -- Centro de custo
    select id into v_cc from public.centros_custo
    where public.fn_chave_nome(nome) = public.fn_chave_nome(coalesce(v_linha->>'centro_custo',''))
    order by nivel limit 1;
    if v_cc is null then
      v_txt := coalesce(v_txt || '; ', '') || format('Centro de custo "%s" nao cadastrado', v_linha->>'centro_custo');
    end if;

    -- Forma de pagamento (opcional)
    v_forma := null;
    if coalesce(v_linha->>'forma_pagamento','') <> '' then
      select id into v_forma from public.formas_pagamento
      where public.fn_chave_nome(nome) = public.fn_chave_nome(v_linha->>'forma_pagamento') limit 1;
      if v_forma is null then
        v_txt := coalesce(v_txt || '; ', '') || format('Forma de pagamento "%s" nao cadastrada', v_linha->>'forma_pagamento');
      end if;
    end if;

    -- Conta bancaria: obrigatoria so quando a linha tem pagamento
    v_conta := null;
    if coalesce(v_linha->>'conta','') <> '' then
      select id into v_conta from public.contas_bancarias
      where public.fn_chave_nome(nome) = public.fn_chave_nome(v_linha->>'conta') limit 1;
      if v_conta is null then
        v_txt := coalesce(v_txt || '; ', '') || format('Conta "%s" nao cadastrada', v_linha->>'conta');
      end if;
    end if;

    -- Vencimentos e pagamentos
    select array_agg((x)::date order by ordinality)
      into v_venc
      from jsonb_array_elements_text(public.fn_jsonb_lista(v_linha->'vencimentos')) with ordinality as t(x, ordinality);
    if v_venc is null or array_length(v_venc, 1) is null then
      v_txt := coalesce(v_txt || '; ', '') || 'Informe pelo menos um vencimento';
    end if;

    select array_agg((x)::date order by ordinality)
      into v_pgto
      from jsonb_array_elements_text(public.fn_jsonb_lista(v_linha->'pagamentos')) with ordinality as t(x, ordinality);
    if v_pgto is not null and array_length(v_pgto,1) > coalesce(array_length(v_venc,1), 0) then
      v_txt := coalesce(v_txt || '; ', '') || 'Mais datas de pagamento que de vencimento';
    end if;
    if v_pgto is not null and array_length(v_pgto,1) > 0 and v_conta is null then
      v_txt := coalesce(v_txt || '; ', '') || 'Linha com pagamento exige conta bancaria';
    end if;

    if v_txt is not null then
      v_erros := v_erros || jsonb_build_object('linha', (v_linha->>'linha')::int, 'erro', v_txt);
    end if;
  end loop;

  if jsonb_array_length(v_erros) > 0 then
    return jsonb_build_object(
      'ok', false,
      'criados', 0,
      'erros', v_erros,
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
    select array_agg((x)::date order by ordinality) into v_pgto
      from jsonb_array_elements_text(public.fn_jsonb_lista(v_linha->'pagamentos')) with ordinality as t(x, ordinality);

    -- Parcelas: divide igual, sobra na primeira, para a soma fechar no centavo.
    v_n := array_length(v_venc, 1);
    v_base := trunc(v_valor / v_n, 2);
    v_resto := v_valor - (v_base * v_n);
    v_parcelas := '[]'::jsonb;
    for v_k in 1 .. v_n loop
      v_parcelas := v_parcelas || jsonb_build_object(
        'valor', (v_base + case when v_k = 1 then v_resto else 0 end),
        'data_vencimento', to_char(v_venc[v_k], 'YYYY-MM-DD')
      );
    end loop;

    v_rateios := jsonb_build_array(jsonb_build_object('centro_custo_id', v_cc, 'valor', v_valor));

    -- Observacoes: junta o que a planilha traz e nao tem campo proprio.
    v_obs := nullif(concat_ws(E'\n',
      nullif(btrim(coalesce(v_linha->>'observacoes','')), ''),
      case when coalesce(v_linha->>'quem_paga','') <> ''
             and public.fn_chave_nome(v_linha->>'quem_paga') <> 'empresa'
           then 'Pago pelo cliente' end,
      case when coalesce(v_linha->>'plano_contas','') <> ''
           then 'Plano de contas: ' || (v_linha->>'plano_contas') end,
      case when coalesce(v_linha->>'ordem_compra','') <> ''
           then 'OC da planilha: ' || (v_linha->>'ordem_compra') end
    ), '');

    v_dados := jsonb_build_object(
      'tipo', coalesce(nullif(v_linha->>'tipo',''), 'a_pagar'),
      'fornecedor_id', v_forn,
      'categoria_id', v_cat,
      'forma_pagamento_id', v_forma,
      'condicao_pagamento_id', null,
      'descricao', coalesce(nullif(btrim(v_linha->>'descricao'),''), 'Importado da planilha'),
      'valor', v_valor,
      'data_compra', v_linha->>'data_lancamento',
      'mes_competencia', v_linha->>'competencia',
      'data_vencimento', to_char(v_venc[1], 'YYYY-MM-DD'),
      'observacoes', v_obs
    );

    v_lanc := public.fn_salvar_lancamento(null, v_dados, v_parcelas, v_rateios);
    v_criados := v_criados + 1;

    if coalesce(v_linha->>'numero_documento','') <> '' then
      update public.lancamentos set numero = v_linha->>'numero_documento' where id = v_lanc;
    end if;

    -- Pagamento historico: a parcela nasce aprovada e paga.
    if v_pgto is not null and array_length(v_pgto, 1) > 0 then
      for v_k in 1 .. array_length(v_pgto, 1) loop
        update public.lancamento_parcelas p
        set status = 'pago',
            conta_bancaria_id = v_conta,
            data_programada = coalesce(p.data_programada, v_venc[v_k]),
            data_pagamento = v_pgto[v_k],
            -- desconto 0 e valor_liquido e coluna GERADA (valor - desconto):
            -- atribuir valor_liquido levanta 428C9.
            desconto = 0,
            aprovado_por = v_usuario, aprovado_em = now(),
            conferido_por = v_usuario, conferido_em = now(),
            pago_por = v_usuario, pago_em = now()
        where p.lancamento_id = v_lanc and p.numero_parcela = v_k;
        v_parc_pagas := v_parc_pagas + 1;
      end loop;

      update public.lancamentos l
      set status = case
            when not exists (select 1 from public.lancamento_parcelas x
                             where x.lancamento_id = l.id and x.status <> 'pago')
            then 'pago' else 'aprovado' end
      where l.id = v_lanc;
    end if;
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

comment on function public.fn_importar_lancamentos(jsonb) is
  'Importa lancamentos de planilha. Valida tudo antes de gravar nada, reusa fn_salvar_lancamento por linha e marca parcela como paga quando a linha traz data de pagamento (carga de historico).';
