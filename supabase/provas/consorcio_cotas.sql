-- Prova (PR 5 do controle total): cota de consorcio, cronograma e contemplacao.
-- Rodar em begin/rollback depois das migrations; termina com raise 'PROVA OK'.

select set_config('request.jwt.claims', '{"sub":"c66fca9f-5428-4fb9-855f-dcff548764df","role":"authenticated"}', true);

do $prova$
declare v_c uuid; v_msg text; v_fc numeric; v_tx numeric; v_fr numeric; v_n int; v_dados jsonb;
begin
  v_dados := jsonb_build_object('administradora', 'Prova Consorcios', 'grupo', 'G1', 'cota', '7', 'bem', 'Trator',
    'valorCredito', 100000, 'prazo', 72, 'taxaAdmPct', 15, 'fundoReservaPct', 2, 'primeiroVencimento', '2026-03-10');
  v_c := public.fn_salvar_consorcio_cota(null, v_dados);

  -- 1. 72 parcelas; fundo comum fecha 100.000, taxa 15.000, reserva 2.000.
  select count(*), sum(fundo_comum), sum(taxa_adm), sum(fundo_reserva) into v_n, v_fc, v_tx, v_fr
    from public.consorcio_cota_cronograma where cota_id = v_c;
  if v_n <> 72 or v_fc <> 100000 or v_tx <> 15000 or v_fr <> 2000 then raise exception 'FALHOU 1: % % % %', v_n, v_fc, v_tx, v_fr; end if;

  -- 2. Mudar o prazo gera de novo.
  perform public.fn_salvar_consorcio_cota(v_c, v_dados || '{"prazo": 60}');
  if (select count(*) from public.consorcio_cota_cronograma where cota_id = v_c) <> 60 then raise exception 'FALHOU 2'; end if;

  -- 3. Cronograma da administradora com fundo comum errado recusa.
  v_msg := 'FALHOU 3: aceitou';
  begin perform public.fn_salvar_cronograma_consorcio(v_c, '[{"vencimento":"2026-03-10","fundoComum":10,"taxaAdm":1}]');
  exception when others then if sqlerrm ilike '%fundo comum soma%' then v_msg := null; else v_msg := 'FALHOU 3: ' || sqlerrm; end if; end;
  if v_msg is not null then raise exception '%', v_msg; end if;

  -- 4. Contemplar por lance sem valor recusa; com valor grava; de novo recusa.
  v_msg := 'FALHOU 4: lance sem valor';
  begin perform public.fn_contemplar_consorcio(v_c, date '2026-09-10', 'lance', 100000);
  exception when others then if sqlerrm ilike '%lance%' then v_msg := null; else v_msg := 'FALHOU 4: ' || sqlerrm; end if; end;
  if v_msg is not null then raise exception '%', v_msg; end if;
  perform public.fn_contemplar_consorcio(v_c, date '2026-09-10', 'lance', 100000, 25000, null, 'assembleia de setembro');
  if (select status || valor_lance from public.consorcio_cotas where id = v_c) <> 'contemplada25000.00' then raise exception 'FALHOU 4b'; end if;
  v_msg := 'FALHOU 4c: contemplou duas vezes';
  begin perform public.fn_contemplar_consorcio(v_c, date '2026-10-10', 'sorteio', 100000);
  exception when others then if sqlerrm ilike '%ja foi contemplada%' then v_msg := null; else v_msg := 'FALHOU 4c: ' || sqlerrm; end if; end;
  if v_msg is not null then raise exception '%', v_msg; end if;

  -- 5. Cota duplicada recusa.
  v_msg := 'FALHOU 5: duplicou';
  begin perform public.fn_salvar_consorcio_cota(null, v_dados);
  exception when unique_violation then v_msg := null; end;
  if v_msg is not null then raise exception '%', v_msg; end if;

  raise exception 'PROVA OK';
end
$prova$;
