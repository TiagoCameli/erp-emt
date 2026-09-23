-- Virada da Manutenção (Fase 2d): congela a Manutenção no GESTÃO OBRAS (gunyitwrbxbmnezokgjq).
-- Aplicar pelo apply_migration no projeto de ORIGEM, com o ok do Tiago, e copiar este arquivo
-- para Gestao_Obras/supabase/migrations/ no mesmo commit do redirecionamento do QR.
-- Desfazer: origem_descongelar_manutencao.sql.
--
-- Gatilho BEFORE, e não revoke: pega também as RPCs SECURITY DEFINER do app (numeração de
-- OS, baixa de peça), que passam por cima de grant. A leitura continua igual (plano, Fase 5:
-- a origem fica de referência).
--
-- FICAM ABERTOS de propósito: medicoes_equipamento (o abastecimento do Combustível grava o
-- horímetro ali, e o Combustível só vira na Fase 3), historico_status_equipamento e
-- equipamentos (a frota ainda usa), insumos (catálogo compartilhado), e o depósito que não é
-- almoxarifado de peças (o Silo).

create or replace function public.fn_manutencao_migrou_para_o_erp()
returns trigger
language plpgsql
set search_path to ''
as $$
begin
  if tg_table_name in ('entradas_material', 'depositos_material') then
    if not coalesce((select d.eh_almoxarifado_pecas from public.depositos_material d
                      where d.id = case tg_table_name
                                     when 'entradas_material' then coalesce(new.deposito_material_id, old.deposito_material_id)
                                     else coalesce(new.id, old.id) end), false) then
      return coalesce(new, old);
    end if;
  end if;
  raise exception 'A Manutenção passou para o ERP-EMT. Lance OS, peças, óleo e horímetro lá (menu Manutenção, ou pelo QR da máquina).'
    using errcode = 'P0001';
end $$;

do $$
declare t text;
begin
  foreach t in array array['ordens_servico', 'os_pecas', 'os_oleos', 'os_terceiros', 'tipos_oleo',
                           'especificacoes_equipamento', 'documentos_equipamento', 'entradas_material', 'depositos_material'] loop
    execute format('drop trigger if exists trg_manutencao_no_erp on public.%I', t);
    execute format('create trigger trg_manutencao_no_erp before insert or update or delete on public.%I
                    for each row execute function public.fn_manutencao_migrou_para_o_erp()', t);
  end loop;
end $$;
