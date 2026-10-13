-- Rollback de 20261013171259_folha_cc_cadastro_e_13_ferias_indireto.
-- Devolve os relatorios a lancamento_rateios e apaga a view e o gatilho.
-- A carga do cadastro (13 colaboradores) nao volta sozinha: ver audit_log.
do $volta$
declare v_t record; v_oid oid; v_def text; v_novo text;
begin
  for v_t in
    select * from (values
      (1, 'fn_rel_dre', 'join public.vw_custo_rateios r on r.lancamento_id = l.id
   and r.mes_competencia >= date_trunc(''month'', p_inicio)::date
   and r.mes_competencia < p_fim', 'join public.lancamento_rateios r on r.lancamento_id = l.id'),
      (2, 'fn_rel_dre', 'l.mes_competencia < (p_fim + interval ''11 months'')::date', 'l.mes_competencia < p_fim'),
      (3, 'fn_rel_dre', 'l.mes_competencia >= (date_trunc(''month'', p_inicio) - interval ''11 months'')::date',
          'l.mes_competencia >= date_trunc(''month'', p_inicio)::date'),
      (4, 'fn_rel_custo_centro_custo', 'r.mes_competencia', 'l.mes_competencia'),
      (5, 'fn_rel_custo_centro_serie', 'r.mes_competencia', 'l.mes_competencia'),
      (6, 'fn_rel_custo_centro_vida', 'r.mes_competencia', 'l.mes_competencia'),
      (7, 'fn_rel_custo_por_mes', 'r.mes_competencia', 'l.mes_competencia'),
      (8, 'fn_rel_custo_receita', 'r.mes_competencia', 'l.mes_competencia'),
      (9, 'fn_rel_custos_indiretos', 'r.mes_competencia', 'l.mes_competencia'),
      (10, 'fn_rel_gestao_maiores_custos', 'r.mes_competencia', 'l.mes_competencia')
    ) as t(ordem, fn, de, para) order by ordem
  loop
    select p.oid into strict v_oid from pg_proc p where p.pronamespace = 'public'::regnamespace and p.proname = v_t.fn;
    v_def := pg_get_functiondef(v_oid);
    v_novo := replace(replace(v_def, v_t.de, v_t.para), 'public.vw_custo_rateios r', 'public.lancamento_rateios r');
    if v_novo = v_def then raise exception 'Volta % nao achou nada em %', v_t.ordem, v_t.fn; end if;
    execute v_novo;
  end loop;
end
$volta$;
drop view public.vw_custo_rateios;
drop trigger trg_folha_item_cc_no_cadastro on public.folha_itens;
drop function public.fn_folha_item_cc_no_cadastro();
