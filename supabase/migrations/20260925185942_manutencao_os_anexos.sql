-- Anexos da OS da Manutenção: fotos e documentos do serviço executado.
-- Alterada a partir da definição viva (25/09): só acrescenta 'manutencao_os', que segue o
-- recurso do caderno de serviços. A RLS de anexo_vinculos e arquivos já deriva a permissão
-- por esta função, então nada mais muda no banco.
create or replace function public.fn_recurso_da_entidade(p_tipo text)
 returns text language sql immutable set search_path to ''
as $function$
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
    else null
  end;
$function$;
