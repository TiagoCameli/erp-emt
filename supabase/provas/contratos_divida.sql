-- Prova (PR 5 do controle total): contratos de divida, cronograma Price/SAC,
-- cronograma do banco, troca com parcela paga e eventos.
-- Rodar em begin/rollback depois da migration; termina com raise 'PROVA OK'.

select set_config('request.jwt.claims', '{"sub":"c66fca9f-5428-4fb9-855f-dcff548764df","role":"authenticated"}', true);

do $prova$
declare
  v_raiz uuid; v_etapa uuid; v_c uuid; v_v int; v_msg text; v_n numeric; v_s numeric; v_x numeric;
  v_dados jsonb;
begin
  select id into v_raiz from public.centros_custo where nivel = 1 and tipo = 'financeiro' limit 1;
  insert into public.centros_custo (nome, nivel, pai_id, ativo) values ('PROVA contrato', 2, v_raiz, true) returning id into v_etapa;
  v_dados := jsonb_build_object('credor', 'Banco Prova', 'numero', 'P-1', 'tipo', 'capital_giro', 'centroCustoId', v_etapa,
    'valorContratado', 100000, 'valorLiberado', 100000, 'dataLiberacao', '2026-01-05', 'taxaAm', 2, 'sistema', 'price',
    'parcelas', 12, 'primeiroVencimento', '2026-02-05');
  v_c := public.fn_salvar_contrato_divida(null, v_dados);

  -- 1. Price: PMT 9.455,96; principal fecha 100.000; saldo final 0.
  v_v := public.fn_gerar_cronograma_contrato(v_c);
  select sum(principal), min(principal + juros) filter (where numero = 1) into v_s, v_n
    from public.contrato_divida_cronograma where contrato_id = v_c and versao = v_v;
  if v_s <> 100000 or v_n <> 9455.96 then raise exception 'FALHOU 1: principal %, primeira %', v_s, v_n; end if;
  if (select saldo_apos from public.contrato_divida_cronograma where contrato_id = v_c and versao = v_v and numero = 12) <> 0 then
    raise exception 'FALHOU 1b: saldo final';
  end if;

  -- 2. Trocar sem motivo recusa; com motivo vira versao 2 e a 1 fica substituida.
  v_msg := 'FALHOU 2: trocou sem motivo';
  begin perform public.fn_gerar_cronograma_contrato(v_c);
  exception when others then if sqlerrm ilike '%motivo%' then v_msg := null; else v_msg := 'FALHOU 2: ' || sqlerrm; end if; end;
  if v_msg is not null then raise exception '%', v_msg; end if;
  update public.contratos_divida set sistema = 'sac', carencia_meses = 2 where id = v_c;
  v_v := public.fn_gerar_cronograma_contrato(v_c, 'SAC com carencia');
  if v_v <> 2 or exists (select 1 from public.contrato_divida_cronograma where contrato_id = v_c and versao = 1 and substituida_em is null) then
    raise exception 'FALHOU 2b: versao %', v_v;
  end if;

  -- 3. SAC com 2 de carencia: so juros nas duas primeiras; 10 x 10.000.
  select max(principal) filter (where numero <= 2), min(juros) filter (where numero = 1), sum(principal),
         count(*) filter (where numero > 2 and principal = 10000)
    into v_n, v_x, v_s, v_v
    from public.contrato_divida_cronograma where contrato_id = v_c and substituida_em is null;
  if v_n <> 0 or v_x <> 2000 or v_s <> 100000 or v_v <> 10 then raise exception 'FALHOU 3: % % % %', v_n, v_x, v_s, v_v; end if;

  -- 4. Cronograma do banco com soma errada recusa.
  v_msg := 'FALHOU 4: aceitou soma errada';
  begin
    perform public.fn_salvar_cronograma_contrato(v_c, '[{"vencimento":"2026-02-05","principal":50000,"juros":2000},{"vencimento":"2026-03-05","principal":40000,"juros":1000}]', 'banco');
  exception when others then if sqlerrm ilike '%soma%' then v_msg := null; else v_msg := 'FALHOU 4: ' || sqlerrm; end if; end;
  if v_msg is not null then raise exception '%', v_msg; end if;
  v_v := public.fn_salvar_cronograma_contrato(v_c, '[{"vencimento":"2026-03-05","principal":40000,"juros":1000},{"vencimento":"2026-02-05","principal":60000,"juros":2000,"encargos":15.5}]', 'banco');
  if (select string_agg(numero || ':' || saldo_apos, ',' order by numero) from public.contrato_divida_cronograma where contrato_id = v_c and versao = v_v) <> '1:40000.00,2:0.00' then
    raise exception 'FALHOU 4b: ordem/saldo do cronograma do banco';
  end if;

  -- 5. Amortizacao em 15/02 (Price de novo): saldo cai, resto recalculado no mesmo numero de parcelas.
  update public.contratos_divida set sistema = 'price', carencia_meses = 0 where id = v_c;
  perform public.fn_gerar_cronograma_contrato(v_c, 'Price');
  v_x := public.fn_contrato_saldo_devedor(v_c, date '2026-02-15');
  v_v := public.fn_registrar_evento_contrato(v_c, 'amortizacao', date '2026-02-15', 20000, 'antecipacao');
  select count(*) filter (where tipo = 'parcela' and vencimento > '2026-02-15'), sum(principal) filter (where vencimento > '2026-02-15')
    into v_n, v_s from public.contrato_divida_cronograma where contrato_id = v_c and versao = v_v;
  if v_n <> 11 or v_s <> v_x - 20000 or public.fn_contrato_saldo_devedor(v_c, date '2026-02-15') <> v_x - 20000 then
    raise exception 'FALHOU 5: % parcelas, principal %, saldo antes %', v_n, v_s, v_x;
  end if;
  if (select sum(principal) from public.contrato_divida_cronograma where contrato_id = v_c and versao = v_v) <> 100000 then
    raise exception 'FALHOU 5b: principal total da versao';
  end if;

  -- 6. Renegociacao sem cronograma novo recusa.
  v_msg := 'FALHOU 6: renegociou sem cronograma';
  begin perform public.fn_registrar_evento_contrato(v_c, 'renegociacao', date '2026-04-10', null, 'reneg');
  exception when others then if sqlerrm ilike '%renegociado%' then v_msg := null; else v_msg := 'FALHOU 6: ' || sqlerrm; end if; end;
  if v_msg is not null then raise exception '%', v_msg; end if;

  -- 7. Quitacao: o que passa do saldo vira juros; status quitado; saldo zero.
  v_x := public.fn_contrato_saldo_devedor(v_c, date '2026-05-20');
  v_v := public.fn_registrar_evento_contrato(v_c, 'quitacao', date '2026-05-20', v_x + 500, 'quitou');
  if (select status from public.contratos_divida where id = v_c) <> 'quitado'
     or public.fn_contrato_saldo_devedor(v_c, date '2026-12-31') <> 0
     or (select juros from public.contrato_divida_cronograma where contrato_id = v_c and versao = v_v and tipo = 'quitacao') <> 500
     or exists (select 1 from public.contrato_divida_cronograma where contrato_id = v_c and versao = v_v and vencimento > '2026-05-20') then
    raise exception 'FALHOU 7: quitacao';
  end if;

  -- 8. Parcela paga no lancamento trava a troca livre do cronograma.
  v_dados := v_dados || jsonb_build_object('numero', 'P-2', 'centroCustoId', (select id from public.centros_custo where nome = 'PROVA contrato'),
    'lancamentoId', (select id from public.lancamentos where numero = 'LAN-2026-6866'));
  insert into public.centros_custo (nome, nivel, pai_id, ativo) values ('PROVA contrato 2', 2, v_raiz, true) returning id into v_etapa;
  v_c := public.fn_salvar_contrato_divida(null, v_dados || jsonb_build_object('centroCustoId', v_etapa));
  perform public.fn_gerar_cronograma_contrato(v_c);
  v_msg := 'FALHOU 8: trocou com parcela paga';
  begin perform public.fn_gerar_cronograma_contrato(v_c, 'troca');
  exception when others then if sqlerrm ilike '%parcela paga%' then v_msg := null; else v_msg := 'FALHOU 8: ' || sqlerrm; end if; end;
  if v_msg is not null then raise exception '%', v_msg; end if;

  -- 9. Etapa fora de Emprestimos/imobilizado recusa.
  v_msg := 'FALHOU 9: aceitou etapa de obra';
  begin perform public.fn_salvar_contrato_divida(null, v_dados || jsonb_build_object('lancamentoId', null, 'centroCustoId',
      (select e.id from public.centros_custo e join public.centros_custo r on r.id = e.pai_id where r.tipo = 'obra' and e.ativo and e.nivel = 2 limit 1)));
  exception when others then if sqlerrm ilike '%etapa%' then v_msg := null; else v_msg := 'FALHOU 9: ' || sqlerrm; end if; end;
  if v_msg is not null then raise exception '%', v_msg; end if;

  -- 10. Sem a permissao recusa.
  perform set_config('request.jwt.claims', '{"sub":"a7324fb8-8311-4986-b975-8a8141ec7efc","role":"authenticated"}', true);
  v_msg := 'FALHOU 10: salvou sem permissao';
  begin perform public.fn_salvar_contrato_divida(null, v_dados);
  exception when others then if sqlerrm ilike '%permissao%' then v_msg := null; else v_msg := 'FALHOU 10: ' || sqlerrm; end if; end;
  if v_msg is not null then raise exception '%', v_msg; end if;

  raise exception 'PROVA OK';
end
$prova$;
