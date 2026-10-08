-- Prova de aceite: editar e excluir diária, inclusive a já fechada.
--
-- ESCREVE no banco, e por isso o bloco termina em `raise`: tudo é desfeito. As
-- medições viajam no TEXTO da exceção. Impersona um Admin porque as funções
-- chamam `tem_permissao`, que lê `auth.uid()`.
--
-- Cobre:
--   1. editar diária fechada (parcela pendente) acerta lançamento, parcela e rateio
--   2. excluir uma de duas diárias do lançamento deixa o lançamento com a outra
--   3. excluir a última diária apaga o lançamento
--   4. editar diária aberta continua funcionando
--   5. CONTROLE: parcela aprovada RECUSA editar e excluir
--   6. CONTROLE: diária fechada não troca de mês
--   7. CONTROLE: diária fechada não troca de diarista
--   8. CONTROLE: lançamento repartido no Financeiro (2 parcelas) RECUSA
--   9. CONTROLE: diária paga pela folha RECUSA
--  10. fn_diarias_status_parcelas devolve o status das parcelas do lançamento

do $prova$
declare
  v_log text := E'\n';
  v_diarista uuid; v_outro uuid; v_forma uuid; v_folha uuid;
  v_comp date := date_trunc('month', (now() at time zone 'America/Rio_Branco')::date)::date;
  v_d1 uuid; v_d2 uuid; v_lanc uuid;
  v_lv numeric; v_pv numeric; v_rv numeric; v_existe boolean;
  v_erro text;
begin
  perform set_config('request.jwt.claims',
    json_build_object('sub', 'c66fca9f-5428-4fb9-855f-dcff548764df',
                      'role', 'authenticated')::text, true);

  select c.id into v_diarista from public.colaboradores c
  where c.vinculo = 'diarista' and c.ativo and c.centro_custo_id is not null order by c.nome limit 1;
  select c.id into v_outro from public.colaboradores c
  where c.vinculo = 'diarista' and c.ativo and c.id <> v_diarista limit 1;
  select f.id into v_forma from public.formas_pagamento f where f.nome = 'PIX' and f.ativo;
  select id into v_folha from public.folhas limit 1;

  -- ===== 1. editar diária fechada =====
  insert into public.rh_diarias (colaborador_id, data, competencia, valor)
  values (v_diarista, v_comp + 1, v_comp, 100) returning id into v_d1;
  insert into public.rh_diarias (colaborador_id, data, competencia, valor)
  values (v_diarista, v_comp + 2, v_comp, 50) returning id into v_d2;
  v_lanc := public.fn_fechar_diarias(v_diarista, v_comp, v_comp + 20, v_forma);

  perform public.fn_editar_diaria(v_d1, v_diarista, null, v_comp + 3, 120, 'ajuste');
  select l.valor, (select valor from public.lancamento_parcelas where lancamento_id = l.id),
         (select valor from public.lancamento_rateios where lancamento_id = l.id)
    into v_lv, v_pv, v_rv from public.lancamentos l where l.id = v_lanc;
  v_log := v_log || format('1. editar fechada ........ %s | lanc=%s parc=%s rat=%s (esperado 170)',
    case when v_lv = 170 and v_pv = 170 and v_rv = 170 then 'PASSOU' else 'FALHOU' end, v_lv, v_pv, v_rv) || E'\n';

  -- ===== 6. CONTROLE: não troca de mês =====
  begin
    perform public.fn_editar_diaria(v_d1, v_diarista, null, (v_comp + interval '1 month')::date, 120, null);
    v_log := v_log || '6. CONTROLE troca mes .... FALHOU | aceitou' || E'\n';
  exception when others then
    v_erro := sqlerrm;
    v_log := v_log || format('6. CONTROLE troca mes .... %s | %s',
      case when v_erro like '%nao troca de mes%' then 'PASSOU' else 'FALHOU' end, v_erro) || E'\n';
  end;

  -- ===== 7. CONTROLE: não troca de diarista =====
  begin
    perform public.fn_editar_diaria(v_d1, v_outro, null, v_comp + 3, 120, null);
    v_log := v_log || '7. CONTROLE troca pessoa . FALHOU | aceitou' || E'\n';
  exception when others then
    v_erro := sqlerrm;
    v_log := v_log || format('7. CONTROLE troca pessoa . %s | %s',
      case when v_erro like '%nao troca de diarista%' then 'PASSOU' else 'FALHOU' end, v_erro) || E'\n';
  end;

  -- ===== 5. CONTROLE: parcela aprovada recusa =====
  update public.lancamento_parcelas set status = 'aprovado', data_programada = v_comp + 20 where lancamento_id = v_lanc;
  begin
    perform public.fn_excluir_diaria(v_d1);
    v_log := v_log || '5. CONTROLE aprovada ..... FALHOU | aceitou excluir' || E'\n';
  exception when others then
    v_erro := sqlerrm;
    v_log := v_log || format('5. CONTROLE aprovada ..... %s | %s',
      case when v_erro like '%aprovado, pago ou conciliado%' then 'PASSOU' else 'FALHOU' end, v_erro) || E'\n';
  end;
  update public.lancamento_parcelas set status = 'pendente', data_programada = null where lancamento_id = v_lanc;

  -- ===== 2. excluir uma de duas =====
  perform public.fn_excluir_diaria(v_d2);
  select l.valor, (select valor from public.lancamento_parcelas where lancamento_id = l.id)
    into v_lv, v_pv from public.lancamentos l where l.id = v_lanc;
  v_log := v_log || format('2. excluir uma de duas ... %s | lanc=%s parc=%s (esperado 120)',
    case when v_lv = 120 and v_pv = 120 then 'PASSOU' else 'FALHOU' end, v_lv, v_pv) || E'\n';

  -- ===== 3. excluir a última apaga o lançamento =====
  perform public.fn_excluir_diaria(v_d1);
  select exists (select 1 from public.lancamentos where id = v_lanc) into v_existe;
  v_log := v_log || format('3. excluir a ultima ...... %s | lancamento existe=%s',
    case when not v_existe then 'PASSOU' else 'FALHOU' end, v_existe) || E'\n';

  -- ===== 4. editar diária aberta =====
  insert into public.rh_diarias (colaborador_id, data, competencia, valor)
  values (v_diarista, v_comp + 1, v_comp, 80) returning id into v_d1;
  perform public.fn_editar_diaria(v_d1, v_outro, null, (v_comp + interval '1 month')::date, 90, null);
  select valor into v_lv from public.rh_diarias
  where id = v_d1 and colaborador_id = v_outro and competencia = (v_comp + interval '1 month')::date;
  v_log := v_log || format('4. editar aberta ......... %s | valor=%s',
    case when v_lv = 90 then 'PASSOU' else 'FALHOU' end, v_lv) || E'\n';
  delete from public.rh_diarias where id = v_d1;

  -- Força as constraints adiadas (soma do rateio, parcelas da forma) sobre o
  -- que os casos 1 a 4 gravaram: num rollback elas nunca disparariam.
  set constraints all immediate;
  v_log := v_log || '   constraints adiadas ... PASSOU' || E'\n';
  set constraints all deferred;

  -- ===== 8. CONTROLE: lançamento repartido =====
  insert into public.rh_diarias (colaborador_id, data, competencia, valor)
  values (v_diarista, v_comp + 1, v_comp, 100) returning id into v_d1;
  v_lanc := public.fn_fechar_diarias(v_diarista, v_comp, v_comp + 20, v_forma);
  update public.lancamento_parcelas set valor = 60 where lancamento_id = v_lanc;
  insert into public.lancamento_parcelas (lancamento_id, numero_parcela, valor, data_vencimento, status)
  values (v_lanc, 2, 40, v_comp + 50, 'pendente');
  begin
    perform public.fn_editar_diaria(v_d1, v_diarista, null, v_comp + 1, 110, null);
    v_log := v_log || '8. CONTROLE repartido .... FALHOU | aceitou' || E'\n';
  exception when others then
    v_erro := sqlerrm;
    v_log := v_log || format('8. CONTROLE repartido .... %s | %s',
      case when v_erro like '%repartido no Financeiro%' then 'PASSOU' else 'FALHOU' end, v_erro) || E'\n';
  end;

  -- ===== 9. CONTROLE: paga pela folha =====
  insert into public.rh_diarias (colaborador_id, data, competencia, valor, folha_id)
  values (v_diarista, v_comp + 1, v_comp, 100, v_folha) returning id into v_d2;
  begin
    perform public.fn_excluir_diaria(v_d2);
    v_log := v_log || '9. CONTROLE folha ........ FALHOU | aceitou' || E'\n';
  exception when others then
    v_erro := sqlerrm;
    v_log := v_log || format('9. CONTROLE folha ........ %s | %s',
      case when v_erro like '%paga pela folha%' then 'PASSOU' else 'FALHOU' end, v_erro) || E'\n';
  end;

  -- ===== 10. status das parcelas para a tela =====
  select array_to_string(status, ',') into v_erro
  from public.fn_diarias_status_parcelas() where lancamento_id = v_lanc;
  v_log := v_log || format('10. status para a tela ... %s | %s',
    case when v_erro = 'pendente,pendente' then 'PASSOU' else 'FALHOU' end, v_erro) || E'\n';

  raise exception 'RESULTADO (tudo desfeito):%', v_log;
end;
$prova$;
