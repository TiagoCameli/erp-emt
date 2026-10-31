-- Prova de aceite (30/10/2026): FITID repetido em meses diferentes nao some.
-- Roda em transacao e termina em ROLLBACK, numa conta de controle criada aqui.
--
-- A Caixa repete o FITID do debito automatico todo mes. Caso real da conta
-- 578367973-5: cartao 089429 e seguro 329493 em 28/09 e de novo em 28/10.
--   1. Setembro: 2 inseridos.
--   2. Outubro com os mesmos FITIDs (seguro com o mesmo valor): 2 inseridos
--      (antes: 0 inseridos, 2 "ja importados").
--   3. Reimportar outubro: 0 inseridos, 2 ignorados.

begin;

do $prova$
declare
  v_tiago uuid := 'c66fca9f-5428-4fb9-855f-dcff548764df';
  v_conta uuid;
  v_setembro jsonb;
  v_outubro jsonb;
  v_r jsonb;
begin
  insert into public.contas_bancarias (nome, banco, tipo, conta, ativo, saldo_inicial)
  values ('PROVA FITID REPETIDO', 'outro', 'corrente', '777.777-7', true, 0)
  returning id into v_conta;

  perform set_config('request.jwt.claims',
    json_build_object('sub', v_tiago, 'role', 'authenticated')::text, true);

  v_setembro := jsonb_build_array(
    jsonb_build_object('data', '2026-09-28', 'valor', -30286.47, 'memo', 'CARTAO CX', 'fitid', '089429', 'n', null),
    jsonb_build_object('data', '2026-09-28', 'valor', -1302.02, 'memo', 'SEGURADORA', 'fitid', '329493', 'n', null));
  v_outubro := jsonb_build_array(
    jsonb_build_object('data', '2026-10-28', 'valor', -34763.72, 'memo', 'CARTAO CX', 'fitid', '089429', 'n', null),
    jsonb_build_object('data', '2026-10-28', 'valor', -1302.02, 'memo', 'SEGURADORA', 'fitid', '329493', 'n', null));

  v_r := public.fn_conciliacao_importar(v_conta, 'SET.ofx', date '2026-09-01', date '2026-09-30', null, null, v_setembro);
  if (v_r->>'inseridas')::int <> 2 then
    raise exception 'FALHA 1: setembro %', v_r;
  end if;
  raise notice 'OK 1 setembro: 2 inseridas';

  v_r := public.fn_conciliacao_importar(v_conta, 'OUT.ofx', date '2026-10-01', date '2026-10-31', null, null, v_outubro);
  if (v_r->>'inseridas')::int <> 2 or (v_r->>'ignoradas')::int <> 0 then
    raise exception 'FALHA 2: outubro com FITID repetido %', v_r;
  end if;
  raise notice 'OK 2 outubro com o mesmo FITID: 2 inseridas';

  v_r := public.fn_conciliacao_importar(v_conta, 'OUT.ofx', date '2026-10-01', date '2026-10-31', null, null, v_outubro);
  if (v_r->>'inseridas')::int <> 0 or (v_r->>'ignoradas')::int <> 2 then
    raise exception 'FALHA 3: reimportacao de outubro %', v_r;
  end if;
  if (select count(*) from public.extrato_transacoes where conta_bancaria_id = v_conta) <> 4 then
    raise exception 'FALHA 3: a conta ficou com movimentos diferentes de 4';
  end if;
  raise notice 'OK 3 reimportacao: 0 inseridas, 2 ignoradas';
end;
$prova$;

select 'PROVA OK' as resultado;

rollback;
