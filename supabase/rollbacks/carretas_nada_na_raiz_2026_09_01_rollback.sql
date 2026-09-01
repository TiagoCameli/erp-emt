-- Desfaz `carga/carretas_nada_na_raiz_2026_09_01.sql`: devolve os R$ 638,00 para
-- a RAIZ de "001 - Carretas EMT".
--
-- NAO aplicar. Fica versionado para emergencia.
--
-- Desfaz nesta ordem, que e a inversa do fix:
--   1. apaga as DUAS fatias novas da 5037 (as das carretas 04 e 05);
--   2. devolve a linha da 5037 para a raiz com os R$ 428,00 inteiros;
--   3. devolve a linha da 6649 para a raiz.
--
-- O passo 1 vem antes do 2 de proposito: o `trg_valida_soma_do_rateio` e
-- DEFERIDO, entao ele so confere no COMMIT -- a soma pode ficar quebrada no meio
-- da transacao, mas tem que fechar no fim. Se o passo 2 viesse primeiro, o
-- lancamento teria 428,00 + 142,67 + 142,66 dentro da transacao, e fecharia
-- errado se algum passo falhasse depois.
--
-- As duas fatias novas sao achadas pelo PAR (lancamento, centro), nao por id:
-- o id nasceu do `gen_random_uuid()` na aplicacao do fix e nao esta escrito aqui.

do $desfaz$
declare
  RAIZ uuid := 'a39e45c0-aea5-4d98-aebd-814616b8551c';
  C03  uuid := 'f41ceac0-89a2-4330-ab8a-0111ed55aaee';
  C04  uuid := '8301d9f6-911e-42b8-af64-072d86266c9d';
  C05  uuid := '728cb732-113c-4f39-a5db-a287abae20fe';

  R_5037 uuid := '34b394b1-64da-41ed-b238-6d2f7bb2dab4';
  R_6649 uuid := '434ca83d-a100-48ad-bb66-5ee787e56277';

  v_lanc_5037 uuid;
  v_n int;
  v_raiz numeric;
begin
  select lancamento_id into v_lanc_5037
  from public.lancamento_rateios where id = R_5037;
  if v_lanc_5037 is null then
    raise exception 'O rateio original do LAN-2026-5037 nao existe mais.';
  end if;

  -- 1. as duas fatias novas
  delete from public.lancamento_rateios
  where lancamento_id = v_lanc_5037
    and centro_custo_id in (C04, C05)
    and id <> R_5037;
  get diagnostics v_n = row_count;
  if v_n <> 2 then
    raise exception 'Esperava apagar 2 fatias da 5037, apaguei %.', v_n;
  end if;

  -- 2. a 5037 volta inteira para a raiz
  update public.lancamento_rateios
  set centro_custo_id = RAIZ, valor = 428.00
  where id = R_5037;

  -- 3. a 6649 volta para a raiz
  update public.lancamento_rateios
  set centro_custo_id = RAIZ
  where id = R_6649 and centro_custo_id = C03;
  get diagnostics v_n = row_count;
  if v_n <> 1 then
    raise exception 'A 6649 nao voltou para a raiz (% linhas).', v_n;
  end if;

  select coalesce(sum(valor),0) into v_raiz
  from public.lancamento_rateios where centro_custo_id = RAIZ;
  if round(v_raiz,2) <> 638.00 then
    raise exception 'A raiz voltou com R$ % em vez de 638,00.', v_raiz;
  end if;

  raise notice 'OK: raiz das Carretas de volta com R$ %.', v_raiz;
end $desfaz$;
