-- Prova de aceite, Bloco C (03/10/2026): nenhum movimento some na importacao.
-- Roda em transacao e termina em ROLLBACK, numa conta de controle criada aqui.
--
-- Dois movimentos IDENTICOS sem FITID (mesma data, valor e historico), com
-- n = 1 e n = 2 como o app manda:
--   1a importacao: 2 inseridos, 0 ignorados (antes: 1 inserido, 1 "ignorado")
--   2a importacao do mesmo arquivo: 0 inseridos, 2 ignorados, listados.
-- Controle: arquivo com periodo declarado e nenhum movimento dentro e recusado.

begin;

do $prova$
declare
  v_tiago uuid := 'c66fca9f-5428-4fb9-855f-dcff548764df';
  v_conta uuid;
  v_arquivo jsonb;
  v_r jsonb;
begin
  insert into public.contas_bancarias (nome, banco, tipo, conta, ativo, saldo_inicial)
  values ('PROVA IMPORTACAO', 'outro', 'corrente', '888.888-8', true, 0)
  returning id into v_conta;

  perform set_config('request.jwt.claims',
    json_build_object('sub', v_tiago, 'role', 'authenticated')::text, true);

  v_arquivo := jsonb_build_array(
    jsonb_build_object('data', '2026-09-02', 'valor', -150, 'memo', 'PIX DIARIA FULANO', 'fitid', null, 'n', 1),
    jsonb_build_object('data', '2026-09-02', 'valor', -150, 'memo', 'PIX DIARIA FULANO', 'fitid', null, 'n', 2));

  v_r := public.fn_conciliacao_importar(v_conta, 'PROVA-1.ofx', date '2026-09-01', date '2026-09-30', null, null, v_arquivo);
  if (v_r->>'inseridas')::int <> 2 or (v_r->>'ignoradas')::int <> 0 then
    raise exception 'FALHA 1: primeira importacao %', v_r;
  end if;
  raise notice 'OK 1 duas diarias iguais: 2 inseridas';

  v_r := public.fn_conciliacao_importar(v_conta, 'PROVA-1.ofx', date '2026-09-01', date '2026-09-30', null, null, v_arquivo);
  if (v_r->>'inseridas')::int <> 0 or (v_r->>'ignoradas')::int <> 2
     or jsonb_array_length(v_r->'ignorados') <> 2
     or (v_r->'ignorados'->0->>'memo') <> 'PIX DIARIA FULANO' then
    raise exception 'FALHA 2: reimportacao %', v_r;
  end if;
  if (select count(*) from public.extrato_transacoes where conta_bancaria_id = v_conta) <> 2 then
    raise exception 'FALHA 2: a conta ficou com movimentos diferentes de 2';
  end if;
  raise notice 'OK 2 reimportacao: 0 inseridas, 2 ignoradas e listadas';

  begin
    perform public.fn_conciliacao_importar(v_conta, 'PROVA-2.ofx', date '2026-10-01', date '2026-10-31', null, null, v_arquivo);
    raise exception 'FALHA 3: aceitou arquivo sem movimento no periodo declarado';
  exception when others then
    if sqlerrm like 'FALHA%' then raise; end if;
  end;
  raise notice 'OK 3 periodo declarado sem movimento: recusado';
end;
$prova$;

select 'PROVA OK' as resultado;

rollback;
