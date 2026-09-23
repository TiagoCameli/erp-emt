-- Desfaz origem_congelar_manutencao.sql no GESTÃO OBRAS (gunyitwrbxbmnezokgjq): a Manutenção
-- volta a gravar lá. Usar só se a virada for revertida (e aí o que foi lançado no ERP depois
-- da virada precisa ser trazido de volta à mão: a carga não é bidirecional).

do $$
declare t text;
begin
  foreach t in array array['ordens_servico', 'os_pecas', 'os_oleos', 'os_terceiros', 'tipos_oleo',
                           'especificacoes_equipamento', 'documentos_equipamento', 'entradas_material', 'depositos_material'] loop
    execute format('drop trigger if exists trg_manutencao_no_erp on public.%I', t);
  end loop;
end $$;
drop function if exists public.fn_manutencao_migrou_para_o_erp();
