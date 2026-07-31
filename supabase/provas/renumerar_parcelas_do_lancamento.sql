-- Prova de aceite: parcela 1 do lancamento e sempre a de vencimento mais
-- proximo (migration 20260731130001_renumerar_parcelas_do_lancamento).
--
-- Roda contra o banco vivo dentro de BEGIN ... ROLLBACK: nada do que ela cria
-- fica, nem as linhas de audit_log (o trigger grava na mesma transacao, entao o
-- rollback leva tudo).
--
-- Lista de aceite:
--   1. criar com 3 parcelas digitadas FORA de ordem de vencimento numera pela
--      data, nao pela posicao da linha no formulario
--   2. o numero_parcela que vier no jsonb e ignorado (o banco manda, nao o app)
--   3. editar reordenando renumera de novo
--   4. duas parcelas no MESMO vencimento desempatam por valor, com o resultado
--      identico ao de fn_salvar_parcelas_oc rodando o mesmo array
--   5. parcela sem vencimento cai no FIM (nulls last), sem roubar o numero 1,
--      tanto com data_vencimento null quanto com string vazia
--   6. as guardas continuam de pe: soma das parcelas que nao fecha com o valor
--      e recusada, e lancamento de origem 'oc' continua recusado nesta funcao
--
-- Rodada em 31/07/2026 contra o banco de producao: 10 casos, 10 passaram.
--   1.  digitado 30/09, 30/07, 30/08 -> 1=2026-07-30 | 2=2026-08-30
--       | 3=2026-09-30                                                     ok
--   1b. valor acompanhou a data: 1=100.00 | 2=200.00 | 3=300.00            ok
--   2.  numero_parcela 1 mandado na de 30/09 foi ignorado (virou 3)         ok
--   3.  editar reordenando -> 1=2026-08-20 | 2=2026-09-05 | 3=2026-10-15   ok
--   4a. mesmo vencimento (2026-08-30), 500.00 e 90.00 -> 1=500.00
--       | 2=90.00                                                          ok
--   4b. fn_salvar_parcelas_oc no MESMO array deu a MESMA numeracao          ok
--   5a. sem vencimento vai para o fim: 1=2026-08-30 | 2=2026-09-30
--       | 3=sem data | 4=sem data                                          ok
--   5b. as duas sem data desempataram por valor: 3=25.00 | 4=50.00          ok
--   6a. soma das parcelas 599.00 contra valor 600.00 -> recusado            ok
--   6b. lancamento de origem 'oc' -> recusado ("somente-leitura aqui")      ok
--
-- Depois do ROLLBACK: 1 lancamento no banco (o de origem 'oc' que ja existia,
-- com as 3 parcelas dele intactas e numeradas 1,2,3), 0 lancamentos
-- [PROVA-RENUM], 0 ordens de compra [PROVA-RENUM], 0 linhas de audit_log da
-- prova, tabela temporaria inexistente.
--
-- IMPORTANTE: fn_salvar_lancamento e fn_salvar_parcelas_oc sao SECURITY DEFINER
-- e checam tem_permissao(), que le auth.uid() de request.jwt.claims. Rodando
-- fora de sessao autenticada (SQL editor, MCP), o primeiro bloco assume um
-- usuario ativo com financeiro.lancamentos criar+editar e compras.ordens
-- criar/editar. As claims sao setadas com is_local = true, para nao vazarem da
-- transacao.
--
-- OBSERVACAO sobre o desempate (caso 4a): o `order by data_vencimento, valor`
-- das tres funcoes ordena o valor como TEXTO (x->>'valor'), entao no mesmo
-- vencimento R$ 500,00 vem antes de R$ 90,00 ('5' < '9'). E uma esquisitice
-- herdada de fn_salvar_parcelas_oc, copiada de proposito: o objetivo aqui e ter
-- UM criterio nos tres caminhos, e o desempate so decide a ordem entre parcelas
-- que vencem no mesmo dia. Trocar para ordenacao numerica e uma mudanca das
-- TRES funcoes de uma vez, nao desta.

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
    and exists (
      select 1 from public.usuario_permissoes up
      where up.usuario_id = u.id
        and up.recurso = 'compras.ordens' and up.acao in ('criar', 'editar')
    )
  limit 1;

  if v_usuario is null then
    raise exception 'Nenhum usuario ativo com financeiro.lancamentos criar+editar e compras.ordens para rodar a prova';
  end if;

  perform set_config('request.jwt.claims', json_build_object('sub', v_usuario)::text, true);
end $prova$;

create temp table prova_renum (
  ordem int generated always as identity,
  caso text,
  esperado text,
  obtido text,
  passou boolean
) on commit drop;

do $prova$
declare
  v_forn uuid; v_cond uuid; v_oc uuid;
  v_lanc uuid; v_lanc_oc uuid;
  v_numeracao text; v_valores text; v_numero_da_ultima int;
  v_numeracao_oc text; v_erro text;
  -- as duas parcelas do caso 4, guardadas para rodar o mesmo array na OC
  v_empate jsonb := jsonb_build_array(
    jsonb_build_object('valor', 500.00, 'data_vencimento', '2026-08-30'),
    jsonb_build_object('valor', 90.00, 'data_vencimento', '2026-08-30')
  );
begin
  select id into v_forn from public.fornecedores where ativo order by razao_social limit 1;
  select id into v_cond from public.condicoes_pagamento where ativo order by descricao limit 1;

  -- ------------------------------------------------------------------
  -- 1 e 2. criar com as parcelas digitadas fora de ordem de vencimento
  --
  -- A ordem do array e a ordem das linhas no formulario: 30/09 na primeira
  -- linha. O numero_parcela vai de proposito na ordem digitada (1, 2, 3), que e
  -- o que o app mandava antes, para provar que o banco ignora.
  -- ------------------------------------------------------------------
  v_lanc := public.fn_salvar_lancamento(
    null,
    jsonb_build_object(
      'tipo', 'a_pagar',
      'fornecedor_id', coalesce(v_forn::text, ''),
      'categoria_id', '',
      'forma_pagamento_id', '',
      'condicao_pagamento_id', '',
      'descricao', '[PROVA-RENUM] parcelas digitadas fora de ordem',
      'valor', 600.00,
      'data_compra', '2026-07-10',
      'mes_competencia', '2026-07-01',
      'data_vencimento', ''
    ),
    jsonb_build_array(
      jsonb_build_object('numero_parcela', 1, 'valor', 300.00, 'data_vencimento', '2026-09-30'),
      jsonb_build_object('numero_parcela', 2, 'valor', 100.00, 'data_vencimento', '2026-07-30'),
      jsonb_build_object('numero_parcela', 3, 'valor', 200.00, 'data_vencimento', '2026-08-30')
    ),
    '[]'::jsonb
  );

  select
    string_agg(p.numero_parcela || '=' || p.data_vencimento::text, ' | ' order by p.numero_parcela),
    string_agg(p.numero_parcela || '=' || p.valor::text, ' | ' order by p.numero_parcela)
  into v_numeracao, v_valores
  from public.lancamento_parcelas p
  where p.lancamento_id = v_lanc;

  insert into prova_renum (caso, esperado, obtido, passou)
  values (
    '1. criar digitando 30/09, 30/07, 30/08: numera pela data',
    '1=2026-07-30 | 2=2026-08-30 | 3=2026-09-30',
    coalesce(v_numeracao, 'nenhuma parcela'),
    v_numeracao = '1=2026-07-30 | 2=2026-08-30 | 3=2026-09-30'
  );

  insert into prova_renum (caso, esperado, obtido, passou)
  values (
    '1b. o valor acompanhou a data certa',
    '1=100.00 | 2=200.00 | 3=300.00',
    coalesce(v_valores, 'nenhuma parcela'),
    v_valores = '1=100.00 | 2=200.00 | 3=300.00'
  );

  -- a de 30/09 foi mandada com numero_parcela = 1 e tem que ter virado 3
  select p.numero_parcela into v_numero_da_ultima
  from public.lancamento_parcelas p
  where p.lancamento_id = v_lanc and p.data_vencimento = '2026-09-30';

  insert into prova_renum (caso, esperado, obtido, passou)
  values (
    '2. numero_parcela=1 mandado na parcela de 30/09 foi ignorado',
    '3',
    coalesce(v_numero_da_ultima::text, 'null'),
    v_numero_da_ultima = 3
  );

  -- ------------------------------------------------------------------
  -- 3. editar reordenando: renumera de novo
  -- ------------------------------------------------------------------
  perform public.fn_salvar_lancamento(
    v_lanc,
    jsonb_build_object(
      'tipo', 'a_pagar',
      'fornecedor_id', coalesce(v_forn::text, ''),
      'categoria_id', '',
      'forma_pagamento_id', '',
      'condicao_pagamento_id', '',
      'descricao', '[PROVA-RENUM] parcelas reordenadas na edicao',
      'valor', 600.00,
      'data_compra', '2026-07-10',
      'mes_competencia', '2026-07-01',
      'data_vencimento', ''
    ),
    jsonb_build_array(
      jsonb_build_object('numero_parcela', 1, 'valor', 400.00, 'data_vencimento', '2026-10-15'),
      jsonb_build_object('numero_parcela', 2, 'valor', 100.00, 'data_vencimento', '2026-08-20'),
      jsonb_build_object('numero_parcela', 3, 'valor', 100.00, 'data_vencimento', '2026-09-05')
    ),
    '[]'::jsonb
  );

  select string_agg(p.numero_parcela || '=' || p.data_vencimento::text, ' | ' order by p.numero_parcela)
  into v_numeracao
  from public.lancamento_parcelas p
  where p.lancamento_id = v_lanc;

  insert into prova_renum (caso, esperado, obtido, passou)
  values (
    '3. editar reordenando renumera de novo',
    '1=2026-08-20 | 2=2026-09-05 | 3=2026-10-15',
    coalesce(v_numeracao, 'nenhuma parcela'),
    v_numeracao = '1=2026-08-20 | 2=2026-09-05 | 3=2026-10-15'
  );

  -- ------------------------------------------------------------------
  -- 4. mesmo vencimento, valores diferentes: desempate igual ao da OC
  --
  -- O mesmo array vai para fn_salvar_lancamento e para fn_salvar_parcelas_oc.
  -- As duas numeracoes tem que sair identicas: e isso que significa "alinhado
  -- com a OC".
  -- ------------------------------------------------------------------
  perform public.fn_salvar_lancamento(
    v_lanc,
    jsonb_build_object(
      'tipo', 'a_pagar',
      'fornecedor_id', coalesce(v_forn::text, ''),
      'categoria_id', '',
      'forma_pagamento_id', '',
      'condicao_pagamento_id', '',
      'descricao', '[PROVA-RENUM] empate de vencimento',
      'valor', 590.00,
      'data_compra', '2026-07-10',
      'mes_competencia', '2026-07-01',
      'data_vencimento', ''
    ),
    v_empate,
    '[]'::jsonb
  );

  select string_agg(p.numero_parcela || '=' || p.valor::text, ' | ' order by p.numero_parcela)
  into v_numeracao
  from public.lancamento_parcelas p
  where p.lancamento_id = v_lanc;

  insert into prova_renum (caso, esperado, obtido, passou)
  values (
    '4a. mesmo vencimento 2026-08-30: desempate por valor',
    '1=500.00 | 2=90.00',
    coalesce(v_numeracao, 'nenhuma parcela'),
    v_numeracao = '1=500.00 | 2=90.00'
  );

  -- a mesma coisa pela OC, para comparar
  insert into public.ordens_compra (
    fornecedor_id, condicao_pagamento_id, valor_total, status, data_compra,
    mes_competencia, observacoes, created_by
  )
  values (
    v_forn, v_cond, 590.00, 'rascunho', '2026-07-10',
    '2026-07-01', '[PROVA-RENUM] ordem so para comparar a numeracao', (select auth.uid())
  )
  returning id into v_oc;

  perform public.fn_salvar_parcelas_oc(v_oc, v_empate);

  select string_agg(p.numero_parcela || '=' || p.valor::text, ' | ' order by p.numero_parcela)
  into v_numeracao_oc
  from public.oc_parcelas p
  where p.ordem_compra_id = v_oc;

  insert into prova_renum (caso, esperado, obtido, passou)
  values (
    '4b. fn_salvar_parcelas_oc no mesmo array da a mesma numeracao',
    'lancamento e OC iguais: ' || coalesce(v_numeracao, 'null'),
    'OC: ' || coalesce(v_numeracao_oc, 'nenhuma parcela'),
    v_numeracao_oc is not null and v_numeracao_oc = v_numeracao
  );

  -- ------------------------------------------------------------------
  -- 5. parcela sem vencimento cai no fim (nulls last)
  --
  -- Duas formas de "sem data" que chegam do app: null no jsonb (o que o
  -- formulario manda com o campo em branco) e string vazia.
  -- ------------------------------------------------------------------
  perform public.fn_salvar_lancamento(
    v_lanc,
    jsonb_build_object(
      'tipo', 'a_pagar',
      'fornecedor_id', coalesce(v_forn::text, ''),
      'categoria_id', '',
      'forma_pagamento_id', '',
      'condicao_pagamento_id', '',
      'descricao', '[PROVA-RENUM] parcela sem vencimento',
      'valor', 475.00,
      'data_compra', '2026-07-10',
      'mes_competencia', '2026-07-01',
      'data_vencimento', ''
    ),
    jsonb_build_array(
      jsonb_build_object('numero_parcela', 1, 'valor', 300.00, 'data_vencimento', '2026-09-30'),
      jsonb_build_object('numero_parcela', 2, 'valor', 50.00, 'data_vencimento', null),
      jsonb_build_object('numero_parcela', 3, 'valor', 25.00, 'data_vencimento', ''),
      jsonb_build_object('numero_parcela', 4, 'valor', 100.00, 'data_vencimento', '2026-08-30')
    ),
    '[]'::jsonb
  );

  select
    string_agg(p.numero_parcela || '=' || coalesce(p.data_vencimento::text, 'sem data'), ' | ' order by p.numero_parcela),
    string_agg(p.numero_parcela || '=' || p.valor::text, ' | ' order by p.numero_parcela)
  into v_numeracao, v_valores
  from public.lancamento_parcelas p
  where p.lancamento_id = v_lanc;

  insert into prova_renum (caso, esperado, obtido, passou)
  values (
    '5a. parcela sem vencimento vai para o fim da numeracao',
    '1=2026-08-30 | 2=2026-09-30 | 3=sem data | 4=sem data',
    coalesce(v_numeracao, 'nenhuma parcela'),
    v_numeracao = '1=2026-08-30 | 2=2026-09-30 | 3=sem data | 4=sem data'
  );

  insert into prova_renum (caso, esperado, obtido, passou)
  values (
    '5b. entre as duas sem data o desempate e por valor',
    '1=100.00 | 2=300.00 | 3=25.00 | 4=50.00',
    coalesce(v_valores, 'nenhuma parcela'),
    v_valores = '1=100.00 | 2=300.00 | 3=25.00 | 4=50.00'
  );

  -- ------------------------------------------------------------------
  -- 6a. guarda da soma das parcelas contra o valor do lancamento
  -- ------------------------------------------------------------------
  v_erro := null;
  begin
    perform public.fn_salvar_lancamento(
      null,
      jsonb_build_object(
        'tipo', 'a_pagar',
        'fornecedor_id', coalesce(v_forn::text, ''),
        'categoria_id', '',
        'forma_pagamento_id', '',
        'condicao_pagamento_id', '',
        'descricao', '[PROVA-RENUM] soma das parcelas errada',
        'valor', 600.00,
        'data_compra', '2026-07-10',
        'mes_competencia', '2026-07-01',
        'data_vencimento', ''
      ),
      jsonb_build_array(
        jsonb_build_object('valor', 499.00, 'data_vencimento', '2026-08-30'),
        jsonb_build_object('valor', 100.00, 'data_vencimento', '2026-07-30')
      ),
      '[]'::jsonb
    );
  exception when others then
    v_erro := sqlerrm;
  end;

  insert into prova_renum (caso, esperado, obtido, passou)
  values (
    '6a. soma das parcelas 599.00 contra valor 600.00 e recusada',
    'excecao "A soma das parcelas ... deve ser igual ao valor"',
    coalesce(v_erro, 'nenhuma excecao (passou batido)'),
    v_erro like 'A soma das parcelas%'
  );

  -- ------------------------------------------------------------------
  -- 6b. guarda de origem: lancamento de OC e somente-leitura aqui
  -- ------------------------------------------------------------------
  select id into v_lanc_oc
  from public.lancamentos
  where origem = 'oc'
  order by created_at
  limit 1;

  if v_lanc_oc is null then
    insert into prova_renum (caso, esperado, obtido, passou)
    values (
      '6b. lancamento de origem oc e recusado',
      'excecao "somente-leitura aqui"',
      'nenhum lancamento de origem oc no banco para testar',
      false
    );
  else
    v_erro := null;
    begin
      perform public.fn_salvar_lancamento(
        v_lanc_oc,
        jsonb_build_object(
          'tipo', 'a_pagar',
          'descricao', '[PROVA-RENUM] tentando editar lancamento de OC',
          'valor', 100.00,
          'data_compra', '2026-07-10',
          'mes_competencia', '2026-07-01',
          'data_vencimento', ''
        ),
        jsonb_build_array(
          jsonb_build_object('valor', 100.00, 'data_vencimento', '2026-08-30')
        ),
        '[]'::jsonb
      );
    exception when others then
      v_erro := sqlerrm;
    end;

    insert into prova_renum (caso, esperado, obtido, passou)
    values (
      '6b. lancamento de origem oc continua recusado nesta funcao',
      'excecao "Lancamento de origem oc e somente-leitura aqui"',
      coalesce(v_erro, 'nenhuma excecao (passou batido)'),
      v_erro like 'Lancamento de origem oc e somente-leitura aqui%'
    );
  end if;
end $prova$;

select ordem, caso, esperado, obtido, passou from prova_renum order by ordem;

rollback;
