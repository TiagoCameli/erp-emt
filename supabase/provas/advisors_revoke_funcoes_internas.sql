-- Prova da migration 20261013214158 (revoke das funcoes internas).
--
--   A) nenhuma das 21 executa como anon nem como authenticated;
--   B) a RPC que o app chama continua funcionando por dentro: fn_obras_bloqueios
--      (definer, chamada pela tela de Obras) usa a fn_obra_bloqueio revogada;
--   C) chamar a revogada direto pela API, como usuario logado, e recusado;
--   D) as policies continuam lendo: fn_ve_medicao segue com EXECUTE.

do $prova$
declare
  v_tiago uuid := 'c66fca9f-5428-4fb9-855f-dcff548764df';  -- Admin
  v_nome text; v_abertas text := '';
  v_obra uuid; b_qtd int;
  c_erro text := '(NAO RECUSOU)';
begin
  -- A)
  for v_nome in
    select p.oid::regprocedure::text from pg_proc p
     where p.pronamespace = 'public'::regnamespace
       and p.proname = any (string_to_array(
         'fn_aprovar_decimo_terceiro fn_aprovar_recibo_ferias fn_cdi_mensal_manual fn_centro_custo_dependencias fn_competencia_fechada fn_conciliacao_exigir_data_aberta fn_conciliacao_exigir_mes_aberto fn_conciliacao_fechar_mes fn_conciliacao_saldo_app fn_conciliacao_saldo_banco fn_conciliar_transferencia fn_janela_pagamento fn_mc_exigir fn_obra_bloqueio fn_obra_dependencias fn_rateios_da_linha fn_reclassificar_rateios_lote fn_salvar_aplicacao fn_trava_saldo_inicial nomes_usuarios_compras salvar_condicao_parcelas', ' '))
       and (has_function_privilege('authenticated', p.oid, 'execute')
         or has_function_privilege('anon', p.oid, 'execute'))
  loop
    v_abertas := v_abertas || v_nome || ' ';
  end loop;
  if v_abertas <> '' then raise exception 'FALHOU A: ainda abertas: %', v_abertas; end if;
  if (select count(*) from pg_proc p where p.pronamespace = 'public'::regnamespace
        and p.proname in ('fn_obra_bloqueio','fn_trava_saldo_inicial','fn_aprovar_recibo_ferias')) <> 3 then
    raise exception 'FALHOU A: funcao conferida nao existe (nome mudou?)';
  end if;

  -- B)
  select id into v_obra from public.obras limit 1;
  perform set_config('request.jwt.claims', json_build_object('sub', v_tiago, 'role','authenticated')::text, true);
  execute 'set local role authenticated';
  select count(*) into b_qtd from public.fn_obras_bloqueios(array[v_obra]);
  if b_qtd is null then raise exception 'FALHOU B: fn_obras_bloqueios nao respondeu'; end if;

  -- C)
  begin
    perform public.fn_obra_bloqueio(v_obra);
  exception when insufficient_privilege then c_erro := sqlerrm; end;
  if c_erro = '(NAO RECUSOU)' then raise exception 'FALHOU C: authenticated executou fn_obra_bloqueio'; end if;
  reset role;

  -- D)
  if not has_function_privilege('authenticated', 'public.fn_ve_medicao()', 'execute') then
    raise exception 'FALHOU D: fn_ve_medicao perdeu o EXECUTE (policies quebram)';
  end if;

  raise notice 'OK: advisors_revoke_funcoes_internas (A, B, C, D)';
end
$prova$;
