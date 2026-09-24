-- Desfaz origem_congelar_combustivel_frete.sql no GESTÃO OBRAS (gunyitwrbxbmnezokgjq): o
-- Combustível e o Frete voltam a gravar lá. Usar só se a virada for revertida (e aí o que foi
-- lançado no ERP depois da virada precisa ser trazido de volta à mão: a carga não é bidirecional).

do $$
declare t text;
begin
  foreach t in array array[
    'depositos', 'entradas_combustivel', 'saidas_combustivel', 'transferencias_combustivel', 'esvaziamentos_tanque',
    'consumos_lote', 'saidas_sem_suprimento', 'anomalias_checks',
    'fretes', 'pagamentos_frete', 'transportadora_movimentos', 'pedidos_material', 'localidades',
    'frete_dashboard_cards_config', 'anomalias_frete_checks'] loop
    execute format('drop trigger if exists trg_combustivel_frete_no_erp on public.%I', t);
  end loop;
end $$;
drop function if exists public.fn_combustivel_frete_migrou_para_o_erp();
