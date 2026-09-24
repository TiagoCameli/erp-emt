-- Virada do Combustível e do Frete (Fases 3 e 4): congela os dois módulos no GESTÃO OBRAS
-- (gunyitwrbxbmnezokgjq). Aplicar pelo apply_migration no projeto de ORIGEM, com o ok do
-- Tiago, e copiar este arquivo para Gestao_Obras/supabase/migrations/ no mesmo commit que
-- tira as telas de escrita (ou avisa na tela). Desfazer: origem_descongelar_combustivel_frete.sql.
--
-- Gatilho BEFORE, e não revoke: pega também as funções SECURITY DEFINER da origem
-- (registrar_saida_combustivel_fifo, os gatilhos de conta corrente e de FIFO), que passam por
-- cima de grant. A leitura continua igual (plano, Fase 5: a origem fica de referência).
--
-- Tabelas: tudo que o Combustível e o Frete escrevem, inclusive o derivado (consumos_lote,
-- saidas_sem_suprimento, transportadora_movimentos, nível em depositos), para nada mudar o
-- retrato depois do congelamento.
--
-- FICA ABERTO de propósito: medicoes_equipamento. Na 2d ficou aberto porque o abastecimento
-- grava o horímetro ali; com o abastecimento congelado ninguém do Combustível grava mais, mas
-- quem mais usa a tabela na origem (frota, apontamento) não foi levantado: é decisão do Tiago
-- fechar depois. Também ficam abertos os cadastros compartilhados (fornecedores, insumos,
-- equipamentos, obras, etapas_obra), que outros módulos da origem ainda usam.

create or replace function public.fn_combustivel_frete_migrou_para_o_erp()
returns trigger
language plpgsql
set search_path to ''
as $$
begin
  raise exception 'O Combustível e o Frete passaram para o ERP-EMT. Lance abastecimento, entrada, frete e pagamento lá (menus Combustível e Frete).'
    using errcode = 'P0001';
end $$;

do $$
declare t text;
begin
  foreach t in array array[
    -- Combustível
    'depositos', 'entradas_combustivel', 'saidas_combustivel', 'transferencias_combustivel', 'esvaziamentos_tanque',
    'consumos_lote', 'saidas_sem_suprimento', 'anomalias_checks',
    -- Frete
    'fretes', 'pagamentos_frete', 'transportadora_movimentos', 'pedidos_material', 'localidades',
    'frete_dashboard_cards_config', 'anomalias_frete_checks'] loop
    execute format('drop trigger if exists trg_combustivel_frete_no_erp on public.%I', t);
    execute format('create trigger trg_combustivel_frete_no_erp before insert or update or delete on public.%I
                    for each row execute function public.fn_combustivel_frete_migrou_para_o_erp()', t);
  end loop;
end $$;
