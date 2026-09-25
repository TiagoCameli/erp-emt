-- =============================================================
-- Abertura das aplicacoes: posicao liquida para resgate de 25/09/2026
--
-- Numeros do Tiago (extrato da Caixa, 25/09/2026):
--   CDB 95  5.016.513,57   (app 4.926.139,39, diferenca 90.374,18)
--   Fundo   1.000.971,18   (app   987.047,40, diferenca 13.923,78)
--   Total   6.017.484,75   (app 5.913.186,79, diferenca 104.297,96)
--
-- A diferenca e saldo anterior a abril mais rendimento passado. Entra como
-- AJUSTE DE ABERTURA (categoria de movimentacao, fora do DRE e do fluxo),
-- mecanismo aprovado pelo Tiago em 25/09/2026. O lancamento sai do mesmo motor
-- que todo rendimento usa (fn_aplicacao_recalcular), marcado por e_abertura.
--
-- Aborta se a subconta nao fechar em 6.017.484,75 no centavo, ou se cada
-- aplicacao nao tiver exatamente o seu ajuste.
-- Prova: supabase/provas/aplicacoes_financeiras.sql
-- =============================================================
do $abertura$
declare
  c_sub constant uuid := '37ca9c33-859d-42d7-8c14-78a6119d0258';
  v_cdb uuid := (select id from public.aplicacoes where centro_custo_id = 'aacc7055-2fcb-48f9-bbcd-0e2ef4125fbb');
  v_fundo uuid := (select id from public.aplicacoes where centro_custo_id = '29378afd-5b44-4935-b0d6-7e99979e955a');
  v_antes numeric := public.fn_saldo_conta(c_sub);
  v_depois numeric;
  v_ajustes text;
begin
  if v_antes <> 5913186.79 then
    raise exception 'Subconta antes da abertura em %, esperado 5913186.79: algo mudou, conferir antes de abrir', v_antes;
  end if;
  if exists (select 1 from public.aplicacao_posicoes) then
    raise exception 'Ja existe posicao gravada: a abertura roda uma vez so';
  end if;

  insert into public.aplicacao_posicoes (aplicacao_id, data, saldo_liquido, e_abertura, observacoes)
  values
    (v_cdb, '2026-09-25', 5016513.57, true, 'Abertura: posicao liquida para resgate em 25/09/2026, informada pelo Tiago'),
    (v_fundo, '2026-09-25', 1000971.18, true, 'Abertura: posicao liquida para resgate em 25/09/2026, informada pelo Tiago');

  perform public.fn_aplicacao_recalcular(v_cdb, '2026-09-25');
  perform public.fn_aplicacao_recalcular(v_fundo, '2026-09-25');

  v_depois := public.fn_saldo_conta(c_sub);
  select string_agg(l.valor::text, ',' order by l.valor) into v_ajustes
  from public.lancamentos l
  where l.origem = 'aplicacao' and l.categoria_id = '9feb495d-3d71-48b6-b509-2c798cb45e19'
    and l.tipo = 'a_receber';

  if v_depois <> 6017484.75 or v_ajustes is distinct from '13923.78,90374.18' then
    raise exception 'Abertura nao fechou: subconta %, ajustes %', v_depois, v_ajustes;
  end if;
end $abertura$;
