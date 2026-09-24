-- Desfaz a carga do Combustível e do Frete (20260925130000) no ERP. Usa o staging
-- (legado.carga_fase34) para achar exatamente o que a carga criou, pelos mesmos ids derivados
-- (legado.fn_uid). Vale ANTES de alguém lançar no ERP: se já houver frete, pagamento, pedido,
-- ajuste, entrada, abastecimento, transferência ou esvaziamento fora da carga, o bloco para
-- em vez de apagar o que não é dela.
-- Os binários dos anexos ficam no bucket sem linha em arquivos: a faxina diária os apaga.

do $rollback$
begin
  if not exists (select 1 from legado.carga_fase34 where tabela = 'manifesto') then
    raise exception 'Staging vazio: sem ele não dá para saber o que é da carga';
  end if;
  if exists (select 1 from public.fretes where origem <> 'migracao')
     or exists (select 1 from public.frete_pagamentos where origem <> 'migracao')
     or exists (select 1 from public.pedidos_material where origem <> 'migracao')
     or exists (select 1 from public.frete_ajustes where origem <> 'migracao')
     or exists (select 1 from public.combustivel_entradas where origem <> 'migracao')
     or exists (select 1 from public.combustivel_saidas where canal <> 'migracao')
     or exists (select 1 from public.combustivel_transferencias where origem <> 'migracao')
     or exists (select 1 from public.combustivel_esvaziamentos where origem <> 'migracao') then
    raise exception 'Já há Frete ou Combustível lançado no ERP depois da carga: desfazer à mão';
  end if;

  perform set_config('app.carga_combustivel', '1', true);
  delete from public.anexo_vinculos where id in (select legado.fn_uid('anexo_vinculos', e ->> 'k') from legado.fn_staging34('vinculo') e);
  delete from public.arquivos a where a.id in (select legado.fn_uid('arquivos', e ->> 'k') from legado.fn_staging34('arquivo') e)
    and not exists (select 1 from public.anexo_vinculos v where v.arquivo_id = a.id);

  delete from public.transportadora_movimentos;  -- só a carga escreveu aqui (trava acima)
  delete from public.frete_ajustes where origem = 'migracao';
  delete from public.frete_anomalias_conferidas where chave in (select e ->> 'k' from legado.fn_staging34('anomalia_frete') e);
  update public.frete_painel_config set fornecedor_ids = '{}', updated_at = now(), updated_by = null where id = 'global';
  delete from public.pedido_material_itens where pedido_id in (select id from public.pedidos_material where origem = 'migracao');
  delete from public.pedidos_material where origem = 'migracao';
  delete from public.frete_pagamentos where origem = 'migracao';
  delete from public.fretes where origem = 'migracao';

  delete from public.combustivel_anomalias_conferidas;  -- só a carga escreveu aqui (o app grava pela RPC, e nada foi lançado)
  delete from public.combustivel_sem_suprimento_revisao where saida_id in (select id from public.combustivel_saidas where canal = 'migracao');
  delete from public.combustivel_sem_suprimento where saida_id in (select id from public.combustivel_saidas where canal = 'migracao');
  delete from public.combustivel_camadas where saida_id in (select id from public.combustivel_saidas where canal = 'migracao');
  delete from public.abastecimento_alocacoes where saida_id in (select id from public.combustivel_saidas where canal = 'migracao');
  delete from public.equipamento_medicoes where combustivel_saida_id in (select id from public.combustivel_saidas where canal = 'migracao');
  delete from public.combustivel_saidas where canal = 'migracao';
  delete from public.combustivel_esvaziamentos where origem = 'migracao';
  delete from public.combustivel_transferencias where origem = 'migracao';
  delete from public.combustivel_entradas where origem = 'migracao';
  delete from public.tanques where id in (select legado.fn_uid('depositos', e ->> 'g') from legado.fn_staging34('tanque') e);
  delete from public.localidades where id in (select legado.fn_uid('localidades', e ->> 'g') from legado.fn_staging34('localidade') e);

  -- Material: o de-para e o insumo novo só saem se ninguém os usou (OC, cotação).
  delete from legado.de_para_insumos where gestao_obras_id in (select e ->> 'g' from legado.fn_staging34('material_map') e);
  delete from public.insumos i where i.id in (select (e ->> 'id')::uuid from legado.fn_staging34('material_novo') e)
    and not exists (select 1 from public.oc_itens x where x.insumo_id = i.id)
    and not exists (select 1 from public.cotacao_itens x where x.insumo_id = i.id);
  perform set_config('app.carga_combustivel', '', true);
end $rollback$;
