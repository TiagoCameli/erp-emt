-- Prova de aceite: editar lancamento com pagamento aprovado e recusado
-- (migration 20260731150001_editar_lancamento_aprovado_recusado).
--
-- Roda contra o banco vivo dentro de BEGIN ... ROLLBACK: nada do que ela cria
-- fica, nem as linhas de audit_log e de parcela_eventos (os triggers e as funcoes
-- gravam na mesma transacao, entao o rollback leva tudo). O caso 6 recria a
-- versao ANTIGA da funcao dentro da transacao para demonstrar o furo, e restaura
-- a versao corrigida no fim do proprio bloco: DDL no Postgres e transacional, e
-- o rollback e a segunda garantia.
--
-- Lista de aceite:
--   1. editar lancamento com parcela 'aprovado' e o MESMO mes de referencia e
--      recusado (era exatamente o furo: com o mes inalterado a edicao passava)
--   2. a edicao recusada nao deixa efeito colateral: a parcela segue 'aprovado',
--      com data_programada, conta_bancaria_id e aprovado_em intactos, e o
--      cabecalho segue com a descricao e o valor de antes
--   3. editar com parcela 'pago' continua recusado
--   4. editar lancamento com parcelas so 'pendente' continua funcionando, e a
--      renumeracao por vencimento continua valendo
--   5. desaprovar a parcela (fn_desaprovar_parcela) e depois editar passa: o
--      caminho "desaprova, edita, reaprova" existe de verdade
--   6. o furo existia: com a guarda nova REMOVIDA da definicao viva, a mesma
--      edicao passa e apaga a aprovacao (status volta a 'pendente',
--      aprovado_em, data_programada e conta_bancaria_id viram null)
--
-- Rodada em 31/07/2026 contra o banco de producao: 9 casos, 9 passaram.
--   1.  editar com parcela aprovada e mes inalterado -> recusado
--       ("Nao da para editar um lancamento com pagamento aprovado.
--       Desaprove o pagamento em Financeiro > Aprovacao de pagamentos,
--       edite e aprove de novo.")                                        ok
--   2a. parcela intacta depois da recusa: aprovado | prog=2026-08-10
--       | conta=definida | aprovado_em=gravado                           ok
--   2b. cabecalho intacto: descricao "[PROVA-APROV] com parcela aprovada"
--       | valor 900.00                                                   ok
--   2c. as 2 parcelas continuam sendo as mesmas (nenhuma foi recriada)    ok
--   3.  editar com parcela paga -> recusado ("parcela ja paga")           ok
--   4a. so pendente: editar passa e renumera por vencimento
--       1=2026-08-05 | 2=2026-09-15 | 3=2026-10-01                       ok
--   4b. todas as parcelas nasceram 'pendente' na regravacao               ok
--   5.  desaprovou e editou: passou, 2 parcelas pendentes
--       1=2026-08-20 | 2=2026-09-20                                      ok
--   6.  com a guarda removida a edicao passou e apagou a aprovacao:
--       pendente | prog=null | conta=null | aprovado_em=null              ok
--
-- Depois do ROLLBACK: 1 lancamento no banco (o de origem 'oc' que ja existia),
-- 0 lancamentos [PROVA-APROV], 0 parcela_eventos da prova, 0 linhas de audit_log
-- da prova, tabela temporaria inexistente, e md5(prosrc) de fn_salvar_lancamento
-- de volta em d6913516ee12b0519773a654240efdb9 (a versao corrigida).
--
-- IMPORTANTE: as funcoes sao SECURITY DEFINER e checam tem_permissao(), que le
-- auth.uid() de request.jwt.claims. Rodando fora de sessao autenticada (SQL
-- editor, MCP), o primeiro bloco assume um usuario ativo com
-- financeiro.lancamentos criar+editar e financeiro.aprovacao-pagamentos
-- aprovar+desaprovar. As claims sao setadas com is_local = true, para nao
-- vazarem da transacao.
--
-- OBSERVACAO sobre o caso 3: a parcela e marcada 'pago' com um UPDATE direto, em
-- vez de fn_pagar_parcela. Nao e atalho por preguica: fn_pagar_parcela exige
-- janela de pagamento (data programada = hoje), saldo suficiente na conta e
-- permissao de financeiro.pagamentos, e nada disso e o assunto desta prova, que
-- e a guarda da EDICAO. O que importa aqui e o status da parcela.

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
        and up.recurso = 'financeiro.aprovacao-pagamentos' and up.acao = 'aprovar'
    )
    and exists (
      select 1 from public.usuario_permissoes up
      where up.usuario_id = u.id
        and up.recurso = 'financeiro.aprovacao-pagamentos' and up.acao = 'desaprovar'
    )
  limit 1;

  if v_usuario is null then
    raise exception 'Nenhum usuario ativo com financeiro.lancamentos criar+editar e aprovacao-pagamentos aprovar+desaprovar para rodar a prova';
  end if;

  perform set_config('request.jwt.claims', json_build_object('sub', v_usuario)::text, true);
end $prova$;

create temp table prova_aprov (
  ordem int generated always as identity,
  caso text,
  esperado text,
  obtido text,
  passou boolean
) on commit drop;

do $prova$
declare
  v_forn uuid; v_conta uuid;
  v_lanc uuid; v_lanc_pago uuid; v_lanc_pend uuid;
  v_p1 uuid; v_ids_antes text; v_ids_depois text;
  v_estado_antes text; v_estado_depois text;
  v_cabecalho_antes text; v_cabecalho_depois text;
  v_erro text; v_numeracao text; v_status_todas text;
begin
  select id into v_forn from public.fornecedores where ativo order by razao_social limit 1;
  select id into v_conta from public.contas_bancarias where ativo order by nome limit 1;

  -- ------------------------------------------------------------------
  -- 1 e 2. lancamento com parcela APROVADA e o mes de referencia INALTERADO
  --
  -- Este e o furo: a guarda antiga so recusava 'pago', e a de mudanca de mes so
  -- disparava se o mes mudasse. Com o mes igual, a edicao passava e o
  -- delete/insert das parcelas apagava a aprovacao.
  -- ------------------------------------------------------------------
  v_lanc := public.fn_salvar_lancamento(
    null,
    jsonb_build_object(
      'tipo', 'a_pagar',
      'fornecedor_id', coalesce(v_forn::text, ''),
      'categoria_id', '',
      'forma_pagamento_id', '',
      'condicao_pagamento_id', '',
      'descricao', '[PROVA-APROV] com parcela aprovada',
      'valor', 900.00,
      'data_compra', '2026-07-10',
      'mes_competencia', '2026-07-01',
      'data_vencimento', ''
    ),
    jsonb_build_array(
      jsonb_build_object('valor', 400.00, 'data_vencimento', '2026-08-10'),
      jsonb_build_object('valor', 500.00, 'data_vencimento', '2026-09-10')
    ),
    '[]'::jsonb
  );

  select id into v_p1
  from public.lancamento_parcelas
  where lancamento_id = v_lanc and numero_parcela = 1;

  perform public.fn_aprovar_parcela(v_p1, '2026-08-10'::date, v_conta);

  select
    p.status
    || ' | prog=' || coalesce(p.data_programada::text, 'null')
    || ' | conta=' || case when p.conta_bancaria_id is null then 'null' else 'definida' end
    || ' | aprovado_em=' || case when p.aprovado_em is null then 'null' else 'gravado' end
  into v_estado_antes
  from public.lancamento_parcelas p where p.id = v_p1;

  select l.descricao || ' | ' || l.valor::text
  into v_cabecalho_antes
  from public.lancamentos l where l.id = v_lanc;

  select string_agg(p.id::text, ',' order by p.id)
  into v_ids_antes
  from public.lancamento_parcelas p where p.lancamento_id = v_lanc;

  v_erro := null;
  begin
    perform public.fn_salvar_lancamento(
      v_lanc,
      jsonb_build_object(
        'tipo', 'a_pagar',
        'fornecedor_id', coalesce(v_forn::text, ''),
        'categoria_id', '',
        'forma_pagamento_id', '',
        'condicao_pagamento_id', '',
        'descricao', '[PROVA-APROV] tentativa de edicao com aprovado',
        'valor', 900.00,
        'data_compra', '2026-07-12',
        'mes_competencia', '2026-07-01',
        'data_vencimento', ''
      ),
      jsonb_build_array(
        jsonb_build_object('valor', 300.00, 'data_vencimento', '2026-08-25'),
        jsonb_build_object('valor', 600.00, 'data_vencimento', '2026-09-25')
      ),
      '[]'::jsonb
    );
  exception when others then
    v_erro := sqlerrm;
  end;

  insert into prova_aprov (caso, esperado, obtido, passou)
  values (
    '1. editar com parcela aprovada e MESMO mes de referencia e recusado',
    'excecao "Nao da para editar um lancamento com pagamento aprovado. Desaprove o pagamento..."',
    coalesce(v_erro, 'nenhuma excecao (passou batido)'),
    v_erro like 'Nao da para editar um lancamento com pagamento aprovado. Desaprove o pagamento em Financeiro > Aprovacao de pagamentos, edite e aprove de novo.%'
  );

  select
    p.status
    || ' | prog=' || coalesce(p.data_programada::text, 'null')
    || ' | conta=' || case when p.conta_bancaria_id is null then 'null' else 'definida' end
    || ' | aprovado_em=' || case when p.aprovado_em is null then 'null' else 'gravado' end
  into v_estado_depois
  from public.lancamento_parcelas p where p.id = v_p1;

  insert into prova_aprov (caso, esperado, obtido, passou)
  values (
    '2a. a recusa nao mexeu na parcela aprovada',
    coalesce(v_estado_antes, 'parcela sumiu'),
    coalesce(v_estado_depois, 'parcela sumiu'),
    v_estado_depois is not null
      and v_estado_depois = v_estado_antes
      and v_estado_depois like 'aprovado | prog=2026-08-10 | conta=definida | aprovado_em=gravado%'
  );

  select l.descricao || ' | ' || l.valor::text
  into v_cabecalho_depois
  from public.lancamentos l where l.id = v_lanc;

  insert into prova_aprov (caso, esperado, obtido, passou)
  values (
    '2b. a recusa nao mexeu no cabecalho (descricao e valor de antes)',
    coalesce(v_cabecalho_antes, 'lancamento sumiu'),
    coalesce(v_cabecalho_depois, 'lancamento sumiu'),
    v_cabecalho_depois is not null and v_cabecalho_depois = v_cabecalho_antes
  );

  select string_agg(p.id::text, ',' order by p.id)
  into v_ids_depois
  from public.lancamento_parcelas p where p.lancamento_id = v_lanc;

  insert into prova_aprov (caso, esperado, obtido, passou)
  values (
    '2c. as parcelas sao as mesmas linhas (nenhuma foi apagada e recriada)',
    'os 2 ids de antes',
    case when v_ids_depois = v_ids_antes then 'os mesmos 2 ids' else coalesce(v_ids_depois, 'nenhuma parcela') end,
    v_ids_depois is not null and v_ids_depois = v_ids_antes
  );

  -- ------------------------------------------------------------------
  -- 3. parcela PAGA continua recusada (guarda que ja existia)
  -- ------------------------------------------------------------------
  v_lanc_pago := public.fn_salvar_lancamento(
    null,
    jsonb_build_object(
      'tipo', 'a_pagar',
      'fornecedor_id', coalesce(v_forn::text, ''),
      'categoria_id', '',
      'forma_pagamento_id', '',
      'condicao_pagamento_id', '',
      'descricao', '[PROVA-APROV] com parcela paga',
      'valor', 250.00,
      'data_compra', '2026-07-10',
      'mes_competencia', '2026-07-01',
      'data_vencimento', ''
    ),
    jsonb_build_array(
      jsonb_build_object('valor', 250.00, 'data_vencimento', '2026-08-15')
    ),
    '[]'::jsonb
  );

  update public.lancamento_parcelas
  set status = 'pago',
      conta_bancaria_id = v_conta,
      data_pagamento = '2026-07-15',
      pago_em = now()
  where lancamento_id = v_lanc_pago;

  v_erro := null;
  begin
    perform public.fn_salvar_lancamento(
      v_lanc_pago,
      jsonb_build_object(
        'tipo', 'a_pagar',
        'fornecedor_id', coalesce(v_forn::text, ''),
        'categoria_id', '',
        'forma_pagamento_id', '',
        'condicao_pagamento_id', '',
        'descricao', '[PROVA-APROV] tentativa de edicao com pago',
        'valor', 250.00,
        'data_compra', '2026-07-10',
        'mes_competencia', '2026-07-01',
        'data_vencimento', ''
      ),
      jsonb_build_array(
        jsonb_build_object('valor', 250.00, 'data_vencimento', '2026-09-15')
      ),
      '[]'::jsonb
    );
  exception when others then
    v_erro := sqlerrm;
  end;

  insert into prova_aprov (caso, esperado, obtido, passou)
  values (
    '3. editar com parcela paga continua recusado',
    'excecao "Nao da para editar um lancamento com parcela ja paga"',
    coalesce(v_erro, 'nenhuma excecao (passou batido)'),
    v_erro like 'Nao da para editar um lancamento com parcela ja paga%'
  );

  -- ------------------------------------------------------------------
  -- 4. so 'pendente': a edicao continua funcionando e renumerando por
  --    vencimento (a guarda nova nao pode ter estreitado o caminho normal)
  -- ------------------------------------------------------------------
  v_lanc_pend := public.fn_salvar_lancamento(
    null,
    jsonb_build_object(
      'tipo', 'a_pagar',
      'fornecedor_id', coalesce(v_forn::text, ''),
      'categoria_id', '',
      'forma_pagamento_id', '',
      'condicao_pagamento_id', '',
      'descricao', '[PROVA-APROV] so pendente',
      'valor', 300.00,
      'data_compra', '2026-07-10',
      'mes_competencia', '2026-07-01',
      'data_vencimento', ''
    ),
    jsonb_build_array(
      jsonb_build_object('valor', 300.00, 'data_vencimento', '2026-08-05')
    ),
    '[]'::jsonb
  );

  perform public.fn_salvar_lancamento(
    v_lanc_pend,
    jsonb_build_object(
      'tipo', 'a_pagar',
      'fornecedor_id', coalesce(v_forn::text, ''),
      'categoria_id', '',
      'forma_pagamento_id', '',
      'condicao_pagamento_id', '',
      'descricao', '[PROVA-APROV] so pendente, editado',
      'valor', 600.00,
      'data_compra', '2026-07-10',
      'mes_competencia', '2026-07-01',
      'data_vencimento', ''
    ),
    jsonb_build_array(
      jsonb_build_object('valor', 100.00, 'data_vencimento', '2026-10-01'),
      jsonb_build_object('valor', 200.00, 'data_vencimento', '2026-08-05'),
      jsonb_build_object('valor', 300.00, 'data_vencimento', '2026-09-15')
    ),
    '[]'::jsonb
  );

  select
    string_agg(p.numero_parcela || '=' || p.data_vencimento::text, ' | ' order by p.numero_parcela),
    string_agg(distinct p.status, ',')
  into v_numeracao, v_status_todas
  from public.lancamento_parcelas p
  where p.lancamento_id = v_lanc_pend;

  insert into prova_aprov (caso, esperado, obtido, passou)
  values (
    '4a. so pendente: editar passa e renumera por vencimento',
    '1=2026-08-05 | 2=2026-09-15 | 3=2026-10-01',
    coalesce(v_numeracao, 'nenhuma parcela'),
    v_numeracao = '1=2026-08-05 | 2=2026-09-15 | 3=2026-10-01'
  );

  insert into prova_aprov (caso, esperado, obtido, passou)
  values (
    '4b. as parcelas regravadas nasceram pendentes',
    'pendente',
    coalesce(v_status_todas, 'nenhuma parcela'),
    v_status_todas = 'pendente'
  );

  -- ------------------------------------------------------------------
  -- 5. desaprova, edita, reaprova: o caminho de volta existe
  --
  -- Mesmo lancamento do caso 1, agora pelo caminho certo.
  -- ------------------------------------------------------------------
  perform public.fn_desaprovar_parcela(v_p1, 'Prova: desaprovando para poder editar');

  v_erro := null;
  begin
    perform public.fn_salvar_lancamento(
      v_lanc,
      jsonb_build_object(
        'tipo', 'a_pagar',
        'fornecedor_id', coalesce(v_forn::text, ''),
        'categoria_id', '',
        'forma_pagamento_id', '',
        'condicao_pagamento_id', '',
        'descricao', '[PROVA-APROV] editado depois de desaprovar',
        'valor', 900.00,
        'data_compra', '2026-07-12',
        'mes_competencia', '2026-07-01',
        'data_vencimento', ''
      ),
      jsonb_build_array(
        jsonb_build_object('valor', 300.00, 'data_vencimento', '2026-08-20'),
        jsonb_build_object('valor', 600.00, 'data_vencimento', '2026-09-20')
      ),
      '[]'::jsonb
    );
  exception when others then
    v_erro := sqlerrm;
  end;

  select
    string_agg(p.numero_parcela || '=' || p.data_vencimento::text, ' | ' order by p.numero_parcela),
    string_agg(distinct p.status, ',')
  into v_numeracao, v_status_todas
  from public.lancamento_parcelas p
  where p.lancamento_id = v_lanc;

  insert into prova_aprov (caso, esperado, obtido, passou)
  values (
    '5. desaprovar e depois editar passa (desaprova, edita, reaprova)',
    'sem excecao, 2 parcelas pendentes 1=2026-08-20 | 2=2026-09-20',
    coalesce(v_erro, 'sem excecao') || ', ' || coalesce(v_status_todas, 'sem parcela')
      || ' ' || coalesce(v_numeracao, ''),
    v_erro is null
      and v_status_todas = 'pendente'
      and v_numeracao = '1=2026-08-20 | 2=2026-09-20'
  );
end $prova$;

-- ------------------------------------------------------------------
-- 6. o furo existia mesmo
--
-- Em vez de colar de novo o corpo antigo da funcao (que sairia de sincronia com
-- o repositorio na primeira mudanca seguinte), a versao antiga e RECONSTRUIDA a
-- partir da definicao viva, removendo exatamente o bloco da guarda nova. Se o
-- bloco nao for encontrado, o caso falha alto em vez de passar por engano.
--
-- No fim do bloco a versao corrigida e restaurada, e o ROLLBACK e a segunda
-- garantia.
-- ------------------------------------------------------------------
do $prova$
declare
  v_forn uuid; v_conta uuid; v_lanc uuid; v_p1 uuid;
  v_def_corrigida text; v_def_antiga text;
  v_erro text; v_estado text;
begin
  select id into v_forn from public.fornecedores where ativo order by razao_social limit 1;
  select id into v_conta from public.contas_bancarias where ativo order by nome limit 1;

  select pg_get_functiondef(p.oid) into v_def_corrigida
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public' and p.proname = 'fn_salvar_lancamento';

  v_def_antiga := regexp_replace(
    v_def_corrigida,
    E'    -- Editar aprovado e proibido.*?\n    end if;\n',
    ''
  );

  if v_def_antiga = v_def_corrigida
     or v_def_antiga like '%Editar aprovado e proibido%' then
    insert into prova_aprov (caso, esperado, obtido, passou)
    values (
      '6. o furo existia (guarda removida da definicao viva)',
      'a guarda nova encontrada e removida para o teste',
      'nao achei o bloco da guarda na definicao viva: prova inconclusiva',
      false
    );
    return;
  end if;

  execute v_def_antiga;

  v_lanc := public.fn_salvar_lancamento(
    null,
    jsonb_build_object(
      'tipo', 'a_pagar',
      'fornecedor_id', coalesce(v_forn::text, ''),
      'categoria_id', '',
      'forma_pagamento_id', '',
      'condicao_pagamento_id', '',
      'descricao', '[PROVA-APROV] furo da versao antiga',
      'valor', 900.00,
      'data_compra', '2026-07-10',
      'mes_competencia', '2026-07-01',
      'data_vencimento', ''
    ),
    jsonb_build_array(
      jsonb_build_object('valor', 400.00, 'data_vencimento', '2026-08-10'),
      jsonb_build_object('valor', 500.00, 'data_vencimento', '2026-09-10')
    ),
    '[]'::jsonb
  );

  select id into v_p1
  from public.lancamento_parcelas
  where lancamento_id = v_lanc and numero_parcela = 1;

  perform public.fn_aprovar_parcela(v_p1, '2026-08-10'::date, v_conta);

  v_erro := null;
  begin
    perform public.fn_salvar_lancamento(
      v_lanc,
      jsonb_build_object(
        'tipo', 'a_pagar',
        'fornecedor_id', coalesce(v_forn::text, ''),
        'categoria_id', '',
        'forma_pagamento_id', '',
        'condicao_pagamento_id', '',
        'descricao', '[PROVA-APROV] furo: edicao que apagava a aprovacao',
        'valor', 900.00,
        'data_compra', '2026-07-12',
        'mes_competencia', '2026-07-01',
        'data_vencimento', ''
      ),
      jsonb_build_array(
        jsonb_build_object('valor', 300.00, 'data_vencimento', '2026-08-25'),
        jsonb_build_object('valor', 600.00, 'data_vencimento', '2026-09-25')
      ),
      '[]'::jsonb
    );
  exception when others then
    v_erro := sqlerrm;
  end;

  select
    p.status
    || ' | prog=' || coalesce(p.data_programada::text, 'null')
    || ' | conta=' || case when p.conta_bancaria_id is null then 'null' else 'definida' end
    || ' | aprovado_em=' || case when p.aprovado_em is null then 'null' else 'gravado' end
  into v_estado
  from public.lancamento_parcelas p
  where p.lancamento_id = v_lanc and p.numero_parcela = 1;

  insert into prova_aprov (caso, esperado, obtido, passou)
  values (
    '6. sem a guarda a edicao passava e apagava a aprovacao',
    'sem excecao e parcela 1 = pendente | prog=null | conta=null | aprovado_em=null',
    coalesce(v_erro, 'sem excecao') || ', ' || coalesce(v_estado, 'parcela sumiu'),
    v_erro is null
      and v_estado = 'pendente | prog=null | conta=null | aprovado_em=null'
  );

  -- volta a versao corrigida antes de qualquer outra coisa rodar
  execute v_def_corrigida;
end $prova$;

select ordem, caso, esperado, obtido, passou from prova_aprov order by ordem;

rollback;
