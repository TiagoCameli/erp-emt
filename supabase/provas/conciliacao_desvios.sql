-- Prova: fn_conciliacao_desvios acusa mudanca feita por fora das RPCs num mes
-- fechado (PR 1 do controle total). Rodar em begin/rollback; termina com
-- raise 'PROVA OK'. Como owner com claims do Admin (a insercao "por fora" e
-- exatamente o caminho que nao passa pelas travas).

select set_config('request.jwt.claims', '{"sub":"c66fca9f-5428-4fb9-855f-dcff548764df","role":"authenticated"}', true);

do $prova$
declare
  v_bb102 uuid := '40fb6875-ad20-45ed-9346-d1b59e7d9723';
  v_bb308 uuid := 'c766c8cf-54ec-4244-8a54-03b4b687c235';
  v_n int; v_dif numeric;
begin
  select count(*) into v_n from public.fn_conciliacao_desvios(v_bb102);
  if v_n <> 0 then raise exception 'FALHOU 1: ja havia % desvio(s) antes', v_n; end if;

  -- Transferencia de 123,45 em 15/09 da 102 para a 308, gravada direto na
  -- tabela (sem fn_salvar_transferencia, que recusaria).
  insert into public.transferencias_contas
    (numero, conta_origem_id, conta_destino_id, data_transferencia, valor, tarifa, descricao)
  values ('TRF-PROVA', v_bb102, v_bb308, date '2026-09-15', 123.45, 0, 'prova de desvio');

  select count(*), max(diferenca) into v_n, v_dif from public.fn_conciliacao_desvios(v_bb102);
  if v_n <> 1 or v_dif <> -123.45 then raise exception 'FALHOU 2: % desvio(s), diferenca %', v_n, v_dif; end if;

  select count(*), max(diferenca) into v_n, v_dif from public.fn_conciliacao_desvios(v_bb308);
  if v_n <> 1 or v_dif <> 123.45 then raise exception 'FALHOU 3: % desvio(s), diferenca %', v_n, v_dif; end if;

  raise exception 'PROVA OK';
end
$prova$;
