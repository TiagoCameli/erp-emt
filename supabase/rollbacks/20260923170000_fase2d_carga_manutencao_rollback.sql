-- Desfaz a carga da Manutenção (20260923170000) no ERP. Usa o staging (legado.carga_fase2d)
-- para achar exatamente o que a carga criou, pelos mesmos ids derivados (legado.fn_uid).
-- Vale ANTES de alguém usar o que foi carregado: se já houver OS nova, peça comprada ou
-- insumo novo numa OC, o bloco para em vez de apagar o que não é da carga.
-- Os binários dos anexos ficam no bucket sem linha em arquivos: a faxina diária os apaga.

do $rollback$
declare v_central constant uuid := legado.fn_uid('depositos_material', 'mp8hueeq1ppr2');
begin
  if not exists (select 1 from legado.carga_fase2d where tabela = 'manifesto') then
    raise exception 'Staging vazio: sem ele não dá para saber o que é da carga';
  end if;
  if exists (select 1 from public.ordens_servico where origem <> 'migracao') then
    raise exception 'Já há OS lançada no ERP depois da carga: desfazer à mão';
  end if;
  if exists (select 1 from public.almoxarifado_entradas where origem <> 'migracao' and deposito_id = v_central) then
    raise exception 'Já há entrada lançada no Almoxarifado Central depois da carga: desfazer à mão';
  end if;

  delete from public.anexo_vinculos where entidade_tipo = 'equipamento_documento'
    and entidade_id in (select legado.fn_uid('documentos_equipamento', e ->> 'g') from legado.fn_staging('documento') e);
  delete from public.equipamento_documentos where id in (select legado.fn_uid('documentos_equipamento', e ->> 'g') from legado.fn_staging('documento') e);
  delete from public.arquivos where id in (select legado.fn_uid('arquivos', e ->> 'k') from legado.fn_staging('arquivo') e)
    and not exists (select 1 from public.anexo_vinculos v where v.arquivo_id = arquivos.id);
  delete from public.equipamento_especificacoes where id in (select legado.fn_uid('especificacoes_equipamento', e ->> 'eq') from legado.fn_staging('ficha') e);
  delete from public.equipamento_status_historico where id in (select legado.fn_uid('historico_status_equipamento', e ->> 'g') from legado.fn_staging('historico') e);

  delete from public.os_transicoes where ordem_servico_id in (select id from public.ordens_servico where origem = 'migracao');
  delete from public.os_pecas where ordem_servico_id in (select id from public.ordens_servico where origem = 'migracao');
  delete from public.os_oleos where ordem_servico_id in (select id from public.ordens_servico where origem = 'migracao');
  delete from public.os_terceiros where ordem_servico_id in (select id from public.ordens_servico where origem = 'migracao');
  delete from public.almoxarifado_saidas where ordem_servico_id in (select id from public.ordens_servico where origem = 'migracao');
  delete from public.ordens_servico where origem = 'migracao';
  delete from public.almoxarifado_entradas where origem = 'migracao';
  delete from public.almoxarifado_saldos where deposito_id = v_central;
  delete from public.almoxarifado_itens where insumo_id in (select (e ->> 'i')::uuid from legado.fn_staging('item') e);
  delete from public.almoxarifado_depositos where id = v_central;
  delete from public.tipos_oleo where id in (select legado.fn_uid('tipos_oleo', e ->> 'g') from legado.fn_staging('tipo_oleo') e);
  delete from public.documento_sequencias where tipo = 'OS' and not exists (select 1 from public.ordens_servico);

  -- Só as linhas de peça: os 4 insumos de combustível da Fase 1 têm outros ids de origem (a
  -- carga recusa sobrescrever de-para existente, então tudo do staging é dela).
  delete from legado.de_para_insumos where gestao_obras_id in (select e ->> 'g' from legado.fn_staging('insumo_map') e)
    and gestao_obras_id not in ('mlplpomwf0uod', 'mlvjtpi8o1vmk', 'mmjsjiw2eywmb', 'mlprklw2nm0up');
  -- Insumo e fornecedor novos só saem se ninguém os usou (OC, cotação, lançamento).
  delete from public.insumos i where i.id in (select (e ->> 'id')::uuid from legado.fn_staging('insumo_novo') e)
    and not exists (select 1 from public.oc_itens x where x.insumo_id = i.id)
    and not exists (select 1 from public.cotacao_itens x where x.insumo_id = i.id);
  delete from public.fornecedores f where f.id in (select (e ->> 'id')::uuid from legado.fn_staging('fornecedor_novo') e)
    and not exists (select 1 from public.lancamentos x where x.fornecedor_id = f.id)
    and not exists (select 1 from public.ordens_compra x where x.fornecedor_id = f.id);
end $rollback$;
