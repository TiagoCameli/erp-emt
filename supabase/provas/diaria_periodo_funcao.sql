-- Prova de aceite: diária por período, com função e tabela de valores.
--
-- ESCREVE no banco e termina em `raise`: tudo é desfeito. Impersona um Admin
-- (tem_permissao lê auth.uid()).
--
-- Cobre:
--   1. fn_diaria_calcular: 10 dias, 2 meias, 1 falta = 8,0
--   2. criar: qtd, total e valor da função gravados
--   3. diária mais nova da função atualiza o valor
--   4. editar diária mais velha recalcula ela, mas NÃO derruba o valor da função
--   5. criar função pelo formulário: nome normalizado e repetido reaproveita
--   6. fn_diaria_funcoes devolve a função criada com o valor
--   7. editar diária fechada acerta o lançamento
--   8. CONTROLE: período que cruza o mês RECUSA
--   9. CONTROLE: dia marcado fora do período RECUSA
--  10. CONTROLE: mesmo dia meia e falta RECUSA
--  11. CONTROLE: nenhum dia trabalhado RECUSA
--  12. CONTROLE: insert direto cruzando o mês barra na constraint

do $prova$
declare
  v_log text := E'\n';
  v_diarista uuid; v_funcao uuid; v_forma uuid;
  v_comp date := date_trunc('month', (now() at time zone 'America/Rio_Branco')::date)::date;
  v_d1 uuid; v_d2 uuid; v_f1 uuid; v_f2 uuid; v_lanc uuid;
  v_qtd numeric; v_total numeric; v_valor numeric; v_diaria uuid; v_nome text;
  v_erro text;
begin
  perform set_config('request.jwt.claims',
    json_build_object('sub', 'c66fca9f-5428-4fb9-855f-dcff548764df',
                      'role', 'authenticated')::text, true);

  select c.id into v_diarista from public.colaboradores c
  where c.vinculo = 'diarista' and c.ativo and c.centro_custo_id is not null order by c.nome limit 1;
  select id into v_funcao from public.funcoes where ativo order by nome limit 1;
  select f.id into v_forma from public.formas_pagamento f where f.nome = 'PIX' and f.ativo;
  -- A prova não pode depender de diárias reais da função escolhida.
  update public.rh_diarias set funcao_id = null where funcao_id = v_funcao;
  delete from public.rh_diaria_valores where funcao_id = v_funcao;

  -- ===== 1. cálculo =====
  v_qtd := public.fn_diaria_calcular(v_comp, v_comp + 9, array[v_comp + 1, v_comp + 2], array[v_comp + 5]);
  v_log := v_log || format('1. calcular .............. %s | qtd=%s (esperado 8.0)',
    case when v_qtd = 8 then 'PASSOU' else 'FALHOU' end, v_qtd) || E'\n';

  -- ===== 2. criar =====
  v_d1 := public.fn_salvar_diaria(null, v_diarista, v_funcao, null, v_comp, v_comp + 9,
    array[v_comp + 1, v_comp + 2], array[v_comp + 5], 120, 'prova');
  select qtd_diarias, valor into v_qtd, v_total from public.rh_diarias where id = v_d1;
  select valor, diaria_id into v_valor, v_diaria from public.rh_diaria_valores where funcao_id = v_funcao;
  v_log := v_log || format('2. criar ................. %s | qtd=%s total=%s valor_funcao=%s',
    case when v_qtd = 8 and v_total = 960 and v_valor = 120 and v_diaria = v_d1 then 'PASSOU' else 'FALHOU' end,
    v_qtd, v_total, v_valor) || E'\n';

  -- ===== 3. diária mais nova atualiza o valor =====
  v_d2 := public.fn_salvar_diaria(null, v_diarista, v_funcao, null, v_comp + 10, v_comp + 14,
    null, null, 130, null);
  select valor, diaria_id into v_valor, v_diaria from public.rh_diaria_valores where funcao_id = v_funcao;
  v_log := v_log || format('3. mais nova atualiza .... %s | valor_funcao=%s',
    case when v_valor = 130 and v_diaria = v_d2 then 'PASSOU' else 'FALHOU' end, v_valor) || E'\n';

  -- ===== 4. editar a mais velha não derruba =====
  perform public.fn_salvar_diaria(v_d1, v_diarista, v_funcao, null, v_comp, v_comp + 9,
    array[v_comp + 1, v_comp + 2], array[v_comp + 5], 125, 'prova');
  select valor into v_total from public.rh_diarias where id = v_d1;
  select valor into v_valor from public.rh_diaria_valores where funcao_id = v_funcao;
  v_log := v_log || format('4. editar a mais velha ... %s | total=%s (esperado 1000) valor_funcao=%s (esperado 130)',
    case when v_total = 1000 and v_valor = 130 then 'PASSOU' else 'FALHOU' end, v_total, v_valor) || E'\n';

  -- ===== 5. criar função =====
  v_f1 := public.fn_criar_funcao_diaria('  operador   de prova xyz ', 150);
  v_f2 := public.fn_criar_funcao_diaria('OPERADOR DE PROVA XYZ', 155);
  select nome into v_nome from public.funcoes where id = v_f1;
  select valor into v_valor from public.rh_diaria_valores where funcao_id = v_f1;
  v_log := v_log || format('5. criar funcao .......... %s | nome=%s mesma=%s valor=%s',
    case when v_nome = 'OPERADOR DE PROVA XYZ' and v_f1 = v_f2 and v_valor = 155 then 'PASSOU' else 'FALHOU' end,
    v_nome, v_f1 = v_f2, v_valor) || E'\n';

  -- ===== 6. fn_diaria_funcoes =====
  select valor into v_valor from public.fn_diaria_funcoes() where id = v_f1;
  v_log := v_log || format('6. lista de funcoes ...... %s | valor=%s',
    case when v_valor = 155 then 'PASSOU' else 'FALHOU' end, v_valor) || E'\n';

  -- ===== 7. editar diária fechada =====
  v_lanc := public.fn_fechar_diarias(v_diarista, v_comp, v_comp + 20, v_forma);
  perform public.fn_salvar_diaria(v_d2, v_diarista, v_funcao, null, v_comp + 10, v_comp + 14,
    array[v_comp + 14], null, 130, null);
  select valor into v_total from public.lancamentos where id = v_lanc;
  v_log := v_log || format('7. editar fechada ........ %s | lancamento=%s (esperado 1000 + 4,5*130 = 1585)',
    case when v_total = 1585 then 'PASSOU' else 'FALHOU' end, v_total) || E'\n';

  set constraints all immediate;
  v_log := v_log || '   constraints adiadas ... PASSOU' || E'\n';
  set constraints all deferred;

  -- ===== 8. cruza o mês =====
  begin
    perform public.fn_salvar_diaria(null, v_diarista, v_funcao, null, v_comp + 20,
      (v_comp + interval '1 month' + interval '2 days')::date, null, null, 100, null);
    v_log := v_log || '8. CONTROLE cruza mes .... FALHOU | aceitou' || E'\n';
  exception when others then
    v_erro := sqlerrm;
    v_log := v_log || format('8. CONTROLE cruza mes .... %s | %s',
      case when v_erro like '%cruza o mes%' then 'PASSOU' else 'FALHOU' end, v_erro) || E'\n';
  end;

  -- ===== 9. dia fora do período =====
  begin
    perform public.fn_salvar_diaria(null, v_diarista, v_funcao, null, v_comp, v_comp + 3,
      array[v_comp + 7], null, 100, null);
    v_log := v_log || '9. CONTROLE fora periodo . FALHOU | aceitou' || E'\n';
  exception when others then
    v_erro := sqlerrm;
    v_log := v_log || format('9. CONTROLE fora periodo . %s | %s',
      case when v_erro like '%fora do periodo%' then 'PASSOU' else 'FALHOU' end, v_erro) || E'\n';
  end;

  -- ===== 10. meia e falta no mesmo dia =====
  begin
    perform public.fn_salvar_diaria(null, v_diarista, v_funcao, null, v_comp, v_comp + 3,
      array[v_comp + 1], array[v_comp + 1], 100, null);
    v_log := v_log || '10. CONTROLE meia+falta .. FALHOU | aceitou' || E'\n';
  exception when others then
    v_erro := sqlerrm;
    v_log := v_log || format('10. CONTROLE meia+falta .. %s | %s',
      case when v_erro like '%meia diaria e falta%' then 'PASSOU' else 'FALHOU' end, v_erro) || E'\n';
  end;

  -- ===== 11. nenhum dia trabalhado =====
  begin
    perform public.fn_salvar_diaria(null, v_diarista, v_funcao, null, v_comp, v_comp + 1,
      null, array[v_comp, v_comp + 1], 100, null);
    v_log := v_log || '11. CONTROLE sem trabalho  FALHOU | aceitou' || E'\n';
  exception when others then
    v_erro := sqlerrm;
    v_log := v_log || format('11. CONTROLE sem trabalho  %s | %s',
      case when v_erro like '%Nenhum dia trabalhado%' then 'PASSOU' else 'FALHOU' end, v_erro) || E'\n';
  end;

  -- ===== 12. constraint =====
  begin
    insert into public.rh_diarias (colaborador_id, data, data_fim, competencia, valor)
    values (v_diarista, v_comp + 20, (v_comp + interval '1 month')::date, v_comp, 10);
    v_log := v_log || '12. CONTROLE constraint .. FALHOU | aceitou' || E'\n';
  exception when others then
    v_erro := sqlerrm;
    v_log := v_log || format('12. CONTROLE constraint .. %s | %s',
      case when v_erro like '%rh_diarias_periodo_no_mes%' then 'PASSOU' else 'FALHOU' end, v_erro) || E'\n';
  end;

  raise exception 'RESULTADO (tudo desfeito):%', v_log;
end;
$prova$;
