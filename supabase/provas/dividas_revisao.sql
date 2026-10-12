-- Prova (PR 5, correcoes da revisao): eventos no mesmo dia, evento antes de
-- parcela paga ou com parcela vencida em aberto, juros da quitacao no DRE,
-- lancamento ligado duas vezes, termos do contrato.
-- Rodar em begin/rollback depois das migrations; termina com raise 'PROVA OK'.

select set_config('request.jwt.claims', '{"sub":"c66fca9f-5428-4fb9-855f-dcff548764df","role":"authenticated"}', true);

do $prova$
declare
  v_raiz uuid; v_etapa uuid; v_c uuid; v_l uuid; v_msg text; v_s numeric; v_v int; v_dados jsonb; v_fin numeric; v_fin2 numeric; v_tot numeric;
begin
  select id into v_raiz from public.centros_custo where nivel = 1 and tipo = 'financeiro' limit 1;
  insert into public.centros_custo (nome, nivel, pai_id, ativo) values ('PROVA rev', 2, v_raiz, true) returning id into v_etapa;
  v_dados := jsonb_build_object('credor', 'Banco Prova', 'numero', 'R-1', 'tipo', 'capital_giro', 'centroCustoId', v_etapa,
    'valorContratado', 100000, 'valorLiberado', 100000, 'dataLiberacao', '2026-01-05', 'taxaAm', 2, 'sistema', 'price',
    'parcelas', 12, 'primeiroVencimento', '2027-02-05');
  v_c := public.fn_salvar_contrato_divida(null, v_dados);
  perform public.fn_gerar_cronograma_contrato(v_c);

  -- 2. Termos mudam sem parcela paga: gera de novo.
  v_v := public.fn_contrato_versao_atual(v_c);
  perform public.fn_salvar_contrato_divida(v_c, v_dados || '{"taxaAm": 1.5}');
  if public.fn_contrato_versao_atual(v_c) <= v_v then raise exception 'FALHOU 2: nao gerou de novo'; end if;

  -- 1. Duas amortizacoes no mesmo dia: o saldo cai as duas vezes.
  perform public.fn_registrar_evento_contrato(v_c, 'amortizacao', date '2026-06-10', 10000, 'a1');
  perform public.fn_registrar_evento_contrato(v_c, 'amortizacao', date '2026-06-10', 10000, 'a2');
  v_s := public.fn_contrato_saldo_devedor(v_c, date '2026-06-10');
  if v_s <> 80000 then raise exception 'FALHOU 1: saldo %', v_s; end if;
  if (select sum(principal) from public.contrato_divida_cronograma where contrato_id = v_c and substituida_em is null) <> 100000 then
    raise exception 'FALHOU 1b: principal da versao';
  end if;
  v_msg := 'FALHOU 1c: troca livre apagou evento';
  begin perform public.fn_gerar_cronograma_contrato(v_c, 'x');
  exception when others then if sqlerrm ilike '%amortizacao ou renegociacao%' then v_msg := null; else v_msg := 'FALHOU 1c: ' || sqlerrm; end if; end;
  if v_msg is not null then raise exception '%', v_msg; end if;


  -- Contrato ligado ao GiroCaixa (60 parcelas, 2 pagas: 20/08 e 20/09 no cronograma).
  select id into v_l from public.lancamentos where numero = 'LAN-2026-6722';
  insert into public.centros_custo (nome, nivel, pai_id, ativo) values ('PROVA rev 2', 2, v_raiz, true) returning id into v_etapa;
  v_dados := v_dados || jsonb_build_object('numero', 'R-2', 'centroCustoId', v_etapa, 'lancamentoId', v_l, 'valorLiberado', 2298000,
    'valorContratado', 2298000, 'dataLiberacao', '2026-07-09', 'taxaAm', 1.5, 'parcelas', 60, 'primeiroVencimento', '2026-08-20');
  v_c := public.fn_salvar_contrato_divida(null, v_dados);
  perform public.fn_gerar_cronograma_contrato(v_c);

  -- 3. Evento antes de parcela paga recusa.
  v_msg := 'FALHOU 3: reescreveu parcela paga';
  begin perform public.fn_registrar_evento_contrato(v_c, 'amortizacao', date '2026-08-25', 1000, 'x');
  exception when others then if sqlerrm ilike '%parcela paga%' then v_msg := null; else v_msg := 'FALHOU 3: ' || sqlerrm; end if; end;
  if v_msg is not null then raise exception '%', v_msg; end if;

  -- 4. Evento com parcela vencida em aberto antes dele recusa.
  v_msg := 'FALHOU 4: passou por parcela vencida';
  begin perform public.fn_registrar_evento_contrato(v_c, 'amortizacao', date '2026-10-25', 1000, 'x');
  exception when others then if sqlerrm ilike '%vencida%' then v_msg := null; else v_msg := 'FALHOU 4: ' || sqlerrm; end if; end;
  if v_msg is not null then raise exception '%', v_msg; end if;

  -- 5. Termos com parcela paga recusam.
  v_msg := 'FALHOU 5: mudou termos com parcela paga';
  begin perform public.fn_salvar_contrato_divida(v_c, v_dados || '{"taxaAm": 1.2}');
  exception when others then if sqlerrm ilike '%parcela paga%' then v_msg := null; else v_msg := 'FALHOU 5: ' || sqlerrm; end if; end;
  if v_msg is not null then raise exception '%', v_msg; end if;

  -- 6. Quitacao em 25/09 com R$ 1.000 acima do saldo: os 1.000 entram no financeiro de setembro; total igual.
  select sum(total) into v_tot from public.fn_rel_dre('2025-01-01', '2032-01-01');
  select coalesce(sum(total), 0) into v_fin from public.fn_rel_dre('2026-09-01', '2026-10-01') where natureza = 'financeira';
  v_s := public.fn_contrato_saldo_devedor(v_c, date '2026-09-25');
  perform public.fn_registrar_evento_contrato(v_c, 'quitacao', date '2026-09-25', v_s + 1000, 'quitou');
  select coalesce(sum(total), 0) into v_fin2 from public.fn_rel_dre('2026-09-01', '2026-10-01') where natureza = 'financeira';
  if v_fin2 - v_fin <> 1000 then raise exception 'FALHOU 6: financeiro +%', v_fin2 - v_fin; end if;
  if (select sum(total) from public.fn_rel_dre('2025-01-01', '2032-01-01')) <> v_tot then raise exception 'FALHOU 6b: total mudou'; end if;
  if (select saldo_devedor from public.fn_rel_dividas_contratos(date '2026-10-12') where contrato_id = v_c) <> 0 then
    raise exception 'FALHOU 6c: quitado com saldo';
  end if;

  -- 7. Quitado nao troca cronograma.
  v_msg := 'FALHOU 7: trocou quitado';
  begin perform public.fn_gerar_cronograma_contrato(v_c, 'x');
  exception when others then if sqlerrm ilike '%quitado%' then v_msg := null; else v_msg := 'FALHOU 7: ' || sqlerrm; end if; end;
  if v_msg is not null then raise exception '%', v_msg; end if;

  -- 8. O mesmo lancamento numa cota recusa.
  v_msg := 'FALHOU 8: ligou duas vezes';
  begin perform public.fn_salvar_consorcio_cota(null, jsonb_build_object('administradora', 'P', 'grupo', 'G', 'cota', '1', 'bem', 'B',
      'lancamentoId', v_l, 'valorCredito', 1000, 'prazo', 10, 'taxaAdmPct', 10, 'primeiroVencimento', '2026-08-10'));
  exception when others then if sqlerrm ilike '%contrato de divida%' then v_msg := null; else v_msg := 'FALHOU 8: ' || sqlerrm; end if; end;
  if v_msg is not null then raise exception '%', v_msg; end if;

  -- 9. Vencimento repetido no cronograma do banco recusa.
  insert into public.centros_custo (nome, nivel, pai_id, ativo) values ('PROVA rev 3', 2, v_raiz, true) returning id into v_etapa;
  v_c := public.fn_salvar_contrato_divida(null, jsonb_build_object('credor', 'B', 'numero', 'R-3', 'tipo', 'finame', 'centroCustoId', v_etapa,
    'valorContratado', 100, 'valorLiberado', 100, 'dataLiberacao', '2026-01-05', 'taxaAm', 1, 'sistema', 'banco', 'parcelas', 2,
    'primeiroVencimento', '2026-02-05'));
  v_msg := 'FALHOU 9: aceitou vencimento repetido';
  begin perform public.fn_salvar_cronograma_contrato(v_c, '[{"vencimento":"2026-02-05","principal":50},{"vencimento":"2026-02-05","principal":50}]');
  exception when others then if sqlerrm ilike '%mesmo vencimento%' then v_msg := null; else v_msg := 'FALHOU 9: ' || sqlerrm; end if; end;
  if v_msg is not null then raise exception '%', v_msg; end if;

  raise exception 'PROVA OK';
end
$prova$;
