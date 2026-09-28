-- Medição de Contratos, Fase 4b: anexo (foto) do lançamento diário. Recriado a partir da
-- definição viva (conferida por pg_get_functiondef), acrescentando só o ramo mc_lancamento.
-- CREATE OR REPLACE com a mesma assinatura mantém os grants existentes (decisoes.md).

CREATE OR REPLACE FUNCTION public.fn_recurso_da_entidade(p_tipo text)
 RETURNS text
 LANGUAGE sql
 IMMUTABLE
 SET search_path TO ''
AS $function$
  select case p_tipo
    when 'cotacao'        then 'compras.cotacoes'
    when 'ordem_compra'   then 'compras.ordens'
    when 'lancamento'     then 'financeiro.lancamentos'
    when 'pagamento'      then 'financeiro.pagamentos'
    when 'rh_documento'   then 'rh.documentos'
    when 'rh_epi'         then 'rh.epis'
    when 'rh_ocorrencia'  then 'rh.ocorrencias'
    when 'equipamento_documento' then 'cadastros.equipamentos'
    when 'frete'          then 'frete.fretes'
    when 'frete_chegada'  then 'frete.fretes'
    when 'frete_pagamento' then 'frete.pagamentos'
    when 'pedido_material' then 'frete.pedidos-material'
    when 'combustivel_entrada' then 'combustivel.entradas'
    when 'combustivel_saida' then 'combustivel.saidas'
    when 'combustivel_transferencia' then 'combustivel.transferencias'
    when 'manutencao_os'  then 'manutencao.servicos'
    when 'aplicacao_posicao' then 'financeiro.aplicacoes'
    when 'mc_contrato'    then 'medicao.contratos'
    when 'mc_aditivo'     then 'medicao.contratos'
    when 'mc_planilha_versao' then 'medicao.planilha'
    when 'mc_lancamento'  then 'medicao.lancamentos'
    else null
  end;
$function$
;

CREATE OR REPLACE FUNCTION public.fn_mc_contrato_da_entidade(p_tipo text, p_id uuid)
 RETURNS uuid
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  select case p_tipo
    when 'mc_contrato' then (select id from public.mc_contratos where id = p_id)
    when 'mc_aditivo' then (select contrato_id from public.mc_aditivos where id = p_id)
    when 'mc_planilha_versao' then (select contrato_id from public.mc_planilha_versoes where id = p_id)
    when 'mc_lancamento' then (select contrato_id from public.mc_lancamentos where id = p_id)
  end;
$function$
;
