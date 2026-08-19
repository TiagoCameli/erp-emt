-- =============================================================
-- Remove a carga de historico que estimava o carne
--
-- CONTEXTO. A primeira carga do historico financeiro veio de uma planilha em
-- nivel de LANCAMENTO, sem o valor de cada parcela, e a importacao
-- reconstruia o carne dividindo o total em partes iguais. Resultado, medido
-- contra o export em nivel de parcela do maiscontrole:
--
--   ERP-EMT (carga estimada) .: 7.253 lancamentos, R$ 64.541.696,82
--   maiscontrole (origem) ....: 5.817 lancamentos, R$ 61.432.852,10
--   inflacao .................: R$ 3.108.844,72 e 1.436 lancamentos que nao
--                               existem
--
-- O mecanismo: quando o pagamento de UMA parcela nao casava com o total do
-- lancamento, ele entrava como lancamento avulso pago e a parcela original
-- ficava aberta. O mesmo dinheiro duas vezes, e "sem conta" onde ja estava
-- pago -- que foi como o Tiago percebeu o problema na tela.
--
-- A carga correta, a partir do export em nivel de parcela, ja esta no banco e
-- foi conferida em tres cortes independentes, todos com diferenca zero:
-- 77 meses de vencimento, 5 contas bancarias e 11 centros de custo.
--
-- O CORTE POR DATA DE CRIACAO. Tudo que foi criado ate 10/08/2026 18:28:17
-- (23:28:17 UTC) e da carga estimada; a carga boa e posterior. Conferido no
-- audit_log que ninguem editou nenhum desses 7.253 registros depois da carga,
-- entao nao existe trabalho do usuario sendo descartado aqui.
--
-- DELETE e nao soft delete de proposito: isto nao e o usuario excluindo um
-- lancamento (que vai para a lixeira e e restauravel), e a remocao de uma
-- carga tecnica errada. Mandar 7.253 registros invalidos para a lixeira
-- entupiria justamente a tela que serve para recuperar exclusao legitima.
-- =============================================================

do $$
declare
  v_corte timestamptz := '2026-08-10 23:28:17.222627+00';
  v_lanc int; v_parc int; v_rat int; v_restantes int;
begin
  select count(*) into v_lanc from public.lancamentos where created_at <= v_corte;

  -- Guarda: se a carga boa nao estiver aqui, nao apaga a antiga. Sem isso, um
  -- replay desta migration num banco sem a carga nova esvaziaria o financeiro.
  select count(*) into v_restantes from public.lancamentos where created_at > v_corte;
  if v_restantes = 0 then
    raise notice 'Nada a fazer: nao existe carga posterior ao corte. Nenhum registro removido.';
    return;
  end if;

  delete from public.lancamento_rateios
  where lancamento_id in (select id from public.lancamentos where created_at <= v_corte);
  get diagnostics v_rat = row_count;

  delete from public.lancamento_parcelas
  where lancamento_id in (select id from public.lancamentos where created_at <= v_corte);
  get diagnostics v_parc = row_count;

  delete from public.lancamentos where created_at <= v_corte;
  get diagnostics v_lanc = row_count;

  raise notice 'Removidos: % lancamentos, % parcelas, % rateios. Restaram % lancamentos.',
    v_lanc, v_parc, v_rat, v_restantes;
end $$;
