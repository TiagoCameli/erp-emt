-- Prova de aceite, Bloco D (03/10/2026): ajuste de centavo como financeiro
-- (juros/desconto) ou custo do fornecedor. Roda em transacao e ROLLBACK.
--
-- Cenarios (parcela de R$ 100,00 paga no BB, movimento com R$ 0,01 de
-- diferenca):
--   1. financeiro, banco a mais  -> juros 0,01, evento "... - juros"
--   2. financeiro, banco a menos -> desconto 0,01, evento "... - desconto"
--   3. custo, banco a mais, rateios 70/30 -> parcela e lancamento 100,01,
--      rateios 70,01 e 30,00 (o ultimo absorve), juros e desconto zero
--   4. custo em lancamento de folha -> recusado com a explicacao
--   5. financeiro de novo (a assinatura antiga com p_ajustar foi removida em 03/10/2026)
-- No fim forca as constraints adiadas (soma do rateio, centro).

begin;

do $prova$
declare
  v_tiago uuid := 'c66fca9f-5428-4fb9-855f-dcff548764df';
  v_bb uuid := '40fb6875-ad20-45ed-9346-d1b59e7d9723';
  v_dia date := date '2026-10-02';
  v_centro uuid;
  v_centro2 uuid;
  v_extrato uuid;
  v_t uuid;
  v_lanc uuid;
  v_parc uuid;
  v_r record;
  v_motivo text;
  v_n int := 0;
begin
  select c.id into v_centro from public.centros_custo c where c.ativo and c.pai_id is null and c.tipo = 'escritorio' limit 1;
  select c.id into v_centro2 from public.centros_custo c where c.ativo and c.pai_id is null and c.tipo = 'obra' limit 1;

  perform set_config('request.jwt.claims', json_build_object('sub', v_tiago, 'role', 'authenticated')::text, true);

  insert into public.extratos_ofx (conta_bancaria_id, nome_arquivo, periodo_inicio, periodo_fim)
  values (v_bb, 'PROVA-D.ofx', v_dia, v_dia) returning id into v_extrato;

  -- fabrica: lancamento pago de 100,00 com os rateios dados, e um movimento
  for v_r in select * from (values
      (1, -100.01, 'manual', 'financeiro'),
      (2,  -99.99, 'manual', 'financeiro'),
      (3, -100.01, 'manual', 'custo'),
      (4, -100.01, 'folha',  'custo'),
      (5, -100.01, 'manual', 'antiga')) as x(caso, mov, origem, ajuste)
  loop
    insert into public.lancamentos (tipo, origem, descricao, valor, status, data_compra, mes_competencia, data_vencimento, centro_custo_id)
    values ('a_pagar', v_r.origem, 'prova D caso ' || v_r.caso, 100, 'pago', v_dia, date '2026-10-01', v_dia, v_centro)
    returning id into v_lanc;
    insert into public.lancamento_parcelas (lancamento_id, numero_parcela, valor, data_vencimento, status, conta_bancaria_id, data_pagamento)
    values (v_lanc, 1, 100, v_dia, 'pago', v_bb, v_dia) returning id into v_parc;
    if v_r.caso = 3 then
      insert into public.lancamento_rateios (lancamento_id, centro_custo_id, valor) values (v_lanc, v_centro, 70);
      insert into public.lancamento_rateios (lancamento_id, centro_custo_id, valor) values (v_lanc, coalesce(v_centro2, v_centro), 30);
    else
      insert into public.lancamento_rateios (lancamento_id, centro_custo_id, valor) values (v_lanc, v_centro, 100);
    end if;
    insert into public.extrato_transacoes (extrato_id, conta_bancaria_id, data_movimento, valor, tipo, memo, chave_dedup)
    values (v_extrato, v_bb, v_dia, v_r.mov, 'debito', 'PROVA D ' || v_r.caso, 'prova-d-' || v_r.caso)
    returning id into v_t;

    if v_r.caso = 4 then
      begin
        perform public.fn_conciliacao_casar(v_t, 'parcela', v_parc, false, 'custo'::text);
        raise exception 'FALHA 4: folha aceitou ajuste como custo';
      exception when others then
        if sqlerrm like 'FALHA%' then raise; end if;
        if sqlerrm not like '%nao aceita ajuste como custo%' then raise exception 'FALHA 4: mensagem %', sqlerrm; end if;
      end;
      raise notice 'OK 4 folha recusa custo';
      continue;
    elsif v_r.caso = 5 then
      perform public.fn_conciliacao_casar(v_t, 'parcela', v_parc, false, 'financeiro'::text);
    else
      perform public.fn_conciliacao_casar(v_t, 'parcela', v_parc, false, v_r.ajuste::text);
    end if;

    select motivo into v_motivo from public.parcela_eventos where parcela_id = v_parc order by created_at desc limit 1;

    if v_r.caso in (1, 5) then
      if (select juros from public.lancamento_parcelas where id = v_parc) <> 0.01
         or v_motivo not like '%de R$ 100,00 para R$ 100,01 - juros' then
        raise exception 'FALHA %: juros/evento: %', v_r.caso, v_motivo;
      end if;
    elsif v_r.caso = 2 then
      if (select desconto from public.lancamento_parcelas where id = v_parc) <> 0.01
         or v_motivo not like '%de R$ 100,00 para R$ 99,99 - desconto' then
        raise exception 'FALHA 2: desconto/evento: %', v_motivo;
      end if;
    elsif v_r.caso = 3 then
      if (select valor from public.lancamento_parcelas where id = v_parc) <> 100.01
         or (select juros + desconto from public.lancamento_parcelas where id = v_parc) <> 0
         or (select valor from public.lancamentos where id = v_lanc) <> 100.01
         or (select array_agg(valor order by created_at, id) from public.lancamento_rateios where lancamento_id = v_lanc) <> array[70.01, 30.00]::numeric[]
         or v_motivo not like '%valor do fornecimento ajustado de R$ 100,00 para R$ 100,01 (diferenca R$ 0,01) - custo' then
        raise exception 'FALHA 3: custo: parcela %, lanc %, rateios %, evento %',
          (select valor from public.lancamento_parcelas where id = v_parc),
          (select valor from public.lancamentos where id = v_lanc),
          (select array_agg(valor order by created_at, id) from public.lancamento_rateios where lancamento_id = v_lanc),
          v_motivo;
      end if;
    end if;
    if not (select conciliada from public.extrato_transacoes where id = v_t) then
      raise exception 'FALHA %: nao conciliou', v_r.caso;
    end if;
    raise notice 'OK % (%)', v_r.caso, v_motivo;
  end loop;
end;
$prova$;

set constraints all immediate;

select 'PROVA OK' as resultado;

rollback;
