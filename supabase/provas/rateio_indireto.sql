-- Prova do rateio do custo indireto (PR 3 do controle total). Rodar em
-- begin/rollback depois da migration; termina com raise 'PROVA OK'.

select set_config('request.jwt.claims', '{"sub":"c66fca9f-5428-4fb9-855f-dcff548764df","role":"authenticated"}', true);

do $prova$
declare
  v_mes date := date '2026-04-01';
  v_custo_ind numeric; v_rateado numeric; v_nao numeric; v_pct numeric; v_n int; v_msg text;
  v_a uuid; v_b uuid; v_ind_a numeric; v_status text; v_per numeric; v_mar numeric; v_abr numeric;
begin
  -- 1. Custo dos indiretos no mes = o que o relatorio de custo mostra para os 3 centros.
  select coalesce(sum(total), 0) into v_custo_ind
    from public.fn_rel_custo_receita(array[v_mes]) r
   where r.tipo = 'a_pagar' and r.centro_custo_id in (
     select id from public.centros_custo where papel_rateio = 'indireto');
  select coalesce(sum(indireto), 0), max(nao_rateado) into v_rateado, v_nao from public.fn_rateio_indireto_mes(v_mes);
  if v_custo_ind <= 0 then raise exception 'FALHOU 0: sem custo indireto em abril'; end if;
  if v_rateado + coalesce(v_nao, 0) <> v_custo_ind then
    raise exception 'FALHOU 1: rateado % + nao rateado % <> indireto %', v_rateado, v_nao, v_custo_ind;
  end if;

  -- 2. Carretas e os proprios indiretos nao recebem; sugerido soma 100.
  select count(*) into v_n from public.fn_rateio_indireto_mes(v_mes) m
    join public.centros_custo c on c.id = m.centro_id where c.papel_rateio is not null;
  if v_n <> 0 then raise exception 'FALHOU 2: % centro(s) com papel recebendo rateio', v_n; end if;
  select sum(pct_sugerido) into v_pct from public.fn_rateio_indireto_mes(v_mes);
  if round(v_pct, 4) <> 100 then raise exception 'FALHOU 3: sugerido soma %', v_pct; end if;

  -- 3. Ajuste 60/40 entre as duas maiores obras: vale, e grava ajustado.
  select centro_id into v_a from public.fn_rateio_indireto_mes(v_mes) order by custo_direto desc limit 1;
  select centro_id into v_b from public.fn_rateio_indireto_mes(v_mes) order by custo_direto desc offset 1 limit 1;
  perform public.fn_rateio_indireto_salvar(v_mes,
    jsonb_build_array(jsonb_build_object('centroId', v_a, 'percentual', 60), jsonb_build_object('centroId', v_b, 'percentual', 40)),
    'prova', false);
  select indireto, status into v_ind_a, v_status from public.fn_rateio_indireto_mes(v_mes) where centro_id = v_a;
  if v_status <> 'ajustado' then raise exception 'FALHOU 4: status %', v_status; end if;
  if v_ind_a <> round(v_custo_ind * 0.6, 2) and abs(v_ind_a - round(v_custo_ind * 0.6, 2)) > 0.01 then
    raise exception 'FALHOU 5: obra A recebeu % (esperado ~%)', v_ind_a, round(v_custo_ind * 0.6, 2);
  end if;
  select sum(indireto) into v_rateado from public.fn_rateio_indireto_mes(v_mes);
  if v_rateado <> v_custo_ind then raise exception 'FALHOU 6: ajustado nao fecha (% x %)', v_rateado, v_custo_ind; end if;

  -- 4. Soma diferente de 100: recusa.
  begin
    perform public.fn_rateio_indireto_salvar(v_mes, jsonb_build_array(jsonb_build_object('centroId', v_a, 'percentual', 70)), 'prova', false);
    v_msg := 'FALHOU 7: aceitou soma 70';
  exception when others then
    get stacked diagnostics v_msg = message_text;
    if v_msg not like '%100%' then raise exception 'FALHOU 7: %', v_msg; end if;
  end;
  if v_msg like 'FALHOU%' then raise exception '%', v_msg; end if;

  -- 5. Confirmar grava confirmado.
  perform public.fn_rateio_indireto_salvar(v_mes,
    jsonb_build_array(jsonb_build_object('centroId', v_a, 'percentual', 60), jsonb_build_object('centroId', v_b, 'percentual', 40)),
    'prova', true);
  select status into v_status from public.fn_rateio_indireto_mes(v_mes) limit 1;
  if v_status <> 'confirmado' then raise exception 'FALHOU 8: status %', v_status; end if;

  -- 6. Voltar ao automatico com motivo apaga o ajuste.
  perform public.fn_rateio_indireto_automatico(v_mes, 'prova');
  select status into v_status from public.fn_rateio_indireto_mes(v_mes) limit 1;
  if v_status <> 'automatico' then raise exception 'FALHOU 9: status %', v_status; end if;

  -- 7. Periodo = soma mes a mes.
  select coalesce(sum(indireto), 0) into v_per from public.fn_rateio_indireto_periodo(date '2026-03-01', date '2026-05-01');
  select coalesce(sum(indireto), 0) into v_mar from public.fn_rateio_indireto_mes(date '2026-03-01');
  select coalesce(sum(indireto), 0) into v_abr from public.fn_rateio_indireto_mes(date '2026-04-01');
  if v_per <> v_mar + v_abr then raise exception 'FALHOU 10: periodo % x % + %', v_per, v_mar, v_abr; end if;

  -- 7b. Percentuais que somam 100,0001 (dentro da tolerancia): fecha ao centavo,
  --     sem nao rateado negativo (revisao do PR 3).
  perform public.fn_rateio_indireto_salvar(date '2026-08-01',
    jsonb_build_array(jsonb_build_object('centroId', v_a, 'percentual', 50.00005), jsonb_build_object('centroId', v_b, 'percentual', 50.00005)),
    'prova', false);
  select sum(indireto), max(nao_rateado), max(custo_indireto_mes) into v_rateado, v_nao, v_custo_ind from public.fn_rateio_indireto_mes(date '2026-08-01');
  if v_rateado <> v_custo_ind or v_nao <> 0 then
    raise exception 'FALHOU 10b: soma 100,0001 rateou % de %, nao rateado %', v_rateado, v_custo_ind, v_nao;
  end if;
  perform public.fn_rateio_indireto_salvar(date '2026-08-01',
    jsonb_build_array(jsonb_build_object('centroId', v_a, 'percentual', 49.99995), jsonb_build_object('centroId', v_b, 'percentual', 50)),
    'prova', false);
  select sum(indireto), max(nao_rateado) into v_rateado, v_nao from public.fn_rateio_indireto_mes(date '2026-08-01');
  if v_rateado <> v_custo_ind or v_nao <> 0 then
    raise exception 'FALHOU 10c: soma 99,99995 rateou % de %, nao rateado %', v_rateado, v_custo_ind, v_nao;
  end if;

  -- 8. Sem permissao de fechar mes: recusa.
  perform set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-000000000000","role":"authenticated"}', true);
  begin
    perform public.fn_rateio_indireto_salvar(v_mes, jsonb_build_array(jsonb_build_object('centroId', v_a, 'percentual', 100)), 'prova', false);
    v_msg := 'FALHOU 11: sem permissao salvou';
  exception when others then
    get stacked diagnostics v_msg = message_text;
    if v_msg not ilike '%permissao%' then raise exception 'FALHOU 11: %', v_msg; end if;
  end;
  if v_msg like 'FALHOU%' then raise exception '%', v_msg; end if;

  raise exception 'PROVA OK';
end
$prova$;
