-- Prova de aceite: condicao de pagamento e observacoes no lancamento.
--
-- Cobre as migrations 20260731120001 (condicao_pagamento_id) e 20260731120002
-- (observacoes), as duas recriando fn_salvar_lancamento inteira.
--
-- Roda contra o banco vivo dentro de BEGIN ... ROLLBACK: nada do que ela cria
-- fica, nem as linhas de audit_log (o trigger grava na mesma transacao, entao o
-- rollback leva tudo).
--
-- Rodada em 31/07/2026 contra o banco de producao: 9 casos, 9 passaram.
--   1a. valores  33.33 | 33.33 | 33.34 (soma 100.00)                      ok
--   1b. datas    2026-08-09 | 2026-09-08 | 2026-10-08                     ok
--   2.  criar com condicao -> "30/60/90 dias" gravada                     ok
--   3.  criar com observacoes -> "Acerto combinado por telefone."         ok
--       (entrou com espacos nas pontas, o btrim limpou)
--   3b. as 3 parcelas continuaram sendo gravadas                          ok
--   4.  editar trocou a condicao para "15 dias"                           ok
--   5.  editar trocou as observacoes                                      ok
--   6.  editar com os dois campos em branco -> null / null                ok
--   7.  criar sem as chaves no jsonb -> criado, null / null               ok
--
-- Depois do ROLLBACK: 0 lancamentos [PROVA-CONDICAO], 0 linhas de audit_log da
-- prova, tabela temporaria inexistente, e nenhum lancamento do banco com
-- condicao_pagamento_id ou observacoes preenchidos (as duas colunas nasceram
-- vazias e continuam vazias).
--
-- Lista de aceite:
--   1. fn_parcelas_da_condicao divide certo numa condicao de 3 parcelas
--      (30/60/90 dias sobre R$ 100,00: 33,33 + 33,33 + 33,34 e as datas
--      contadas a partir da data da COMPRA)
--   2. criar lancamento avulso com condicao grava condicao_pagamento_id
--   3. criar lancamento avulso com observacoes grava observacoes (com btrim)
--   4. editar troca a condicao de pagamento
--   5. editar troca as observacoes
--   6. editar limpando os dois campos volta as duas colunas para null
--   7. lancamento sem condicao e sem observacao continua salvando (colunas null)
--
-- IMPORTANTE: fn_salvar_lancamento e SECURITY DEFINER e checa tem_permissao(),
-- que le auth.uid() de request.jwt.claims. Rodando fora de sessao autenticada
-- (SQL editor, MCP), o primeiro bloco assume um usuario ativo que tenha
-- financeiro.lancamentos:criar e :editar. As claims sao setadas com is_local =
-- true, para nao vazarem da transacao.

begin;

do $prova$
declare
  v_usuario uuid;
begin
  select u.id into v_usuario
  from public.usuarios u
  where u.ativo
    and exists (
      select 1 from public.usuario_permissoes up
      where up.usuario_id = u.id
        and up.recurso = 'financeiro.lancamentos' and up.acao = 'criar'
    )
    and exists (
      select 1 from public.usuario_permissoes up
      where up.usuario_id = u.id
        and up.recurso = 'financeiro.lancamentos' and up.acao = 'editar'
    )
  limit 1;

  if v_usuario is null then
    raise exception 'Nenhum usuario ativo com financeiro.lancamentos criar+editar para rodar a prova';
  end if;

  perform set_config('request.jwt.claims', json_build_object('sub', v_usuario)::text, true);
end $prova$;

create temp table prova_condicao (
  ordem int generated always as identity,
  caso text,
  esperado text,
  obtido text,
  passou boolean
) on commit drop;

do $prova$
declare
  v_cond3 uuid; v_cond_outra uuid; v_forn uuid;
  v_lanc uuid; v_lanc_sem uuid;
  v_uuid uuid; v_txt text; v_int int;
  v_datas text; v_valores text; v_soma numeric;
begin
  select id into v_cond3
  from public.condicoes_pagamento
  where ativo and descricao = '30/60/90 dias'
  limit 1;
  if v_cond3 is null then
    raise exception 'Condicao "30/60/90 dias" nao encontrada: ajuste a prova';
  end if;

  select id into v_cond_outra
  from public.condicoes_pagamento
  where ativo and id <> v_cond3
  order by descricao
  limit 1;

  select id into v_forn
  from public.fornecedores where ativo order by razao_social limit 1;

  -- ------------------------------------------------------------------
  -- 1. a divisao da condicao, a partir da data da compra
  -- ------------------------------------------------------------------
  select
    string_agg(p.data_vencimento::text, ' | ' order by p.numero_parcela),
    string_agg(p.valor::text, ' | ' order by p.numero_parcela),
    sum(p.valor)
  into v_datas, v_valores, v_soma
  from public.fn_parcelas_da_condicao(v_cond3, 100.00, '2026-07-10'::date) p;

  insert into prova_condicao (caso, esperado, obtido, passou)
  values (
    '1a. fn_parcelas_da_condicao 30/60/90 sobre R$ 100,00: valores',
    '33.33 | 33.33 | 33.34 (soma 100.00)',
    v_valores || ' (soma ' || v_soma::text || ')',
    v_valores = '33.33 | 33.33 | 33.34' and v_soma = 100.00
  );

  insert into prova_condicao (caso, esperado, obtido, passou)
  values (
    '1b. vencimentos contados da data da compra (2026-07-10)',
    '2026-08-09 | 2026-09-08 | 2026-10-08',
    v_datas,
    v_datas = '2026-08-09 | 2026-09-08 | 2026-10-08'
  );

  -- ------------------------------------------------------------------
  -- 2 e 3. criar avulso com condicao e com observacoes
  -- ------------------------------------------------------------------
  v_lanc := public.fn_salvar_lancamento(
    null,
    jsonb_build_object(
      'tipo', 'a_pagar',
      'fornecedor_id', coalesce(v_forn::text, ''),
      'categoria_id', '',
      'forma_pagamento_id', '',
      'condicao_pagamento_id', v_cond3::text,
      'descricao', '[PROVA-CONDICAO] avulso com condicao',
      -- espacos nas pontas de proposito: o btrim tem que limpar
      'observacoes', '   Acerto combinado por telefone.   ',
      'valor', 100.00,
      'data_compra', '2026-07-10',
      'mes_competencia', '2026-07-01',
      'data_vencimento', ''
    ),
    jsonb_build_array(
      jsonb_build_object('numero_parcela', 1, 'valor', 33.33, 'data_vencimento', '2026-08-09'),
      jsonb_build_object('numero_parcela', 2, 'valor', 33.33, 'data_vencimento', '2026-09-08'),
      jsonb_build_object('numero_parcela', 3, 'valor', 33.34, 'data_vencimento', '2026-10-08')
    ),
    '[]'::jsonb
  );

  select condicao_pagamento_id, observacoes into v_uuid, v_txt
  from public.lancamentos where id = v_lanc;

  insert into prova_condicao (caso, esperado, obtido, passou)
  values (
    '2. criar avulso com condicao grava condicao_pagamento_id',
    'condicao 30/60/90',
    coalesce((select descricao from public.condicoes_pagamento where id = v_uuid), 'null'),
    v_uuid = v_cond3
  );

  insert into prova_condicao (caso, esperado, obtido, passou)
  values (
    '3. criar avulso grava observacoes sem espaco nas pontas',
    'Acerto combinado por telefone.',
    coalesce(v_txt, 'null'),
    v_txt = 'Acerto combinado por telefone.'
  );

  -- as parcelas continuam gravadas como antes (nada quebrou no caminho)
  select count(*) into v_int
  from public.lancamento_parcelas where lancamento_id = v_lanc;

  insert into prova_condicao (caso, esperado, obtido, passou)
  values (
    '3b. as 3 parcelas continuam sendo gravadas',
    '3',
    v_int::text,
    v_int = 3
  );

  -- ------------------------------------------------------------------
  -- 4 e 5. editar troca condicao e observacoes
  -- ------------------------------------------------------------------
  perform public.fn_salvar_lancamento(
    v_lanc,
    jsonb_build_object(
      'tipo', 'a_pagar',
      'fornecedor_id', coalesce(v_forn::text, ''),
      'categoria_id', '',
      'forma_pagamento_id', '',
      'condicao_pagamento_id', v_cond_outra::text,
      'descricao', '[PROVA-CONDICAO] avulso com condicao trocada',
      'observacoes', 'Observacao trocada na edicao.',
      'valor', 100.00,
      'data_compra', '2026-07-10',
      'mes_competencia', '2026-07-01',
      'data_vencimento', ''
    ),
    jsonb_build_array(
      jsonb_build_object('numero_parcela', 1, 'valor', 100.00, 'data_vencimento', '2026-08-10')
    ),
    '[]'::jsonb
  );

  select condicao_pagamento_id, observacoes into v_uuid, v_txt
  from public.lancamentos where id = v_lanc;

  insert into prova_condicao (caso, esperado, obtido, passou)
  values (
    '4. editar troca a condicao de pagamento',
    coalesce((select descricao from public.condicoes_pagamento where id = v_cond_outra), 'outra condicao'),
    coalesce((select descricao from public.condicoes_pagamento where id = v_uuid), 'null'),
    v_uuid = v_cond_outra
  );

  insert into prova_condicao (caso, esperado, obtido, passou)
  values (
    '5. editar troca as observacoes',
    'Observacao trocada na edicao.',
    coalesce(v_txt, 'null'),
    v_txt = 'Observacao trocada na edicao.'
  );

  -- ------------------------------------------------------------------
  -- 6. editar limpando os dois campos volta para null
  -- ------------------------------------------------------------------
  perform public.fn_salvar_lancamento(
    v_lanc,
    jsonb_build_object(
      'tipo', 'a_pagar',
      'fornecedor_id', coalesce(v_forn::text, ''),
      'categoria_id', '',
      'forma_pagamento_id', '',
      'condicao_pagamento_id', '',
      'descricao', '[PROVA-CONDICAO] avulso sem condicao',
      -- só espacos: btrim + nullif tem que virar null, nao string em branco
      'observacoes', '    ',
      'valor', 100.00,
      'data_compra', '2026-07-10',
      'mes_competencia', '2026-07-01',
      'data_vencimento', ''
    ),
    jsonb_build_array(
      jsonb_build_object('numero_parcela', 1, 'valor', 100.00, 'data_vencimento', '2026-08-10')
    ),
    '[]'::jsonb
  );

  select condicao_pagamento_id, observacoes into v_uuid, v_txt
  from public.lancamentos where id = v_lanc;

  insert into prova_condicao (caso, esperado, obtido, passou)
  values (
    '6. editar limpando volta condicao e observacoes para null',
    'null / null',
    coalesce(v_uuid::text, 'null') || ' / ' || coalesce('"' || v_txt || '"', 'null'),
    v_uuid is null and v_txt is null
  );

  -- ------------------------------------------------------------------
  -- 7. lancamento sem condicao e sem observacao continua salvando
  -- ------------------------------------------------------------------
  v_lanc_sem := public.fn_salvar_lancamento(
    null,
    jsonb_build_object(
      'tipo', 'a_pagar',
      'fornecedor_id', coalesce(v_forn::text, ''),
      'categoria_id', '',
      'forma_pagamento_id', '',
      'descricao', '[PROVA-CONDICAO] avulso sem condicao nenhuma',
      'valor', 50.00,
      'data_compra', '2026-07-11',
      'mes_competencia', '2026-07-01',
      'data_vencimento', ''
    ),
    jsonb_build_array(
      jsonb_build_object('numero_parcela', 1, 'valor', 50.00, 'data_vencimento', '2026-08-11')
    ),
    '[]'::jsonb
  );

  select condicao_pagamento_id, observacoes into v_uuid, v_txt
  from public.lancamentos where id = v_lanc_sem;

  insert into prova_condicao (caso, esperado, obtido, passou)
  values (
    '7. sem as chaves no jsonb o lancamento salva com as colunas null',
    'lancamento criado, null / null',
    case when v_lanc_sem is null then 'nao criou'
         else 'criado, ' || coalesce(v_uuid::text, 'null') || ' / ' || coalesce(v_txt, 'null')
    end,
    v_lanc_sem is not null and v_uuid is null and v_txt is null
  );
end $prova$;

select ordem, caso, esperado, obtido, passou from prova_condicao order by ordem;

rollback;
