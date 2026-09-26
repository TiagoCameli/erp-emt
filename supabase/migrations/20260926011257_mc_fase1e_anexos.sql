-- Medição de Contratos, Fase 1e: anexos. Alterado a partir da definição viva (conferida pelo md5
-- em 26/09/2026, igual à Task 0). Para as entidades mc_* o anexo também exige estar na lista do
-- contrato (spec 4.3); para todas as outras nada muda.

create or replace function public.fn_recurso_da_entidade(p_tipo text)
 returns text
 language sql
 immutable
 set search_path to ''
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
    when 'aplicacao_posicao' then 'financeiro.aplicacoes'
    when 'mc_contrato'    then 'medicao.contratos'
    when 'mc_aditivo'     then 'medicao.contratos'
    when 'mc_planilha_versao' then 'medicao.planilha'
    else null
  end;
$function$;

-- Contrato dono de uma entidade mc_*; nulo para qualquer outro tipo.
create or replace function public.fn_mc_contrato_da_entidade(p_tipo text, p_id uuid)
returns uuid language sql stable security definer set search_path to '' as $$
  select case p_tipo
    when 'mc_contrato' then (select id from public.mc_contratos where id = p_id)
    when 'mc_aditivo' then (select contrato_id from public.mc_aditivos where id = p_id)
    when 'mc_planilha_versao' then (select contrato_id from public.mc_planilha_versoes where id = p_id)
  end;
$$;

create or replace function public.fn_anexo_entidade_visivel(p_tipo text, p_id uuid)
returns boolean language sql stable security definer set search_path to '' as $$
  select case when p_tipo like 'mc\_%'
    then coalesce(public.fn_mc_contrato_da_entidade(p_tipo, p_id) in (select public.fn_mc_meus_contratos()), false)
    else true end;
$$;
revoke all on function public.fn_mc_contrato_da_entidade(text, uuid) from public, anon;
revoke all on function public.fn_anexo_entidade_visivel(text, uuid) from public, anon;
grant execute on function public.fn_anexo_entidade_visivel(text, uuid) to authenticated;

alter policy anexo_vinculos_select on public.anexo_vinculos using (
  (select public.tem_permissao(public.fn_recurso_da_entidade(entidade_tipo), 'ver'))
  and public.fn_anexo_entidade_visivel(entidade_tipo, entidade_id));

alter policy arquivos_select on public.arquivos using (
  exists (
    select 1 from public.anexo_vinculos v
    where v.arquivo_id = arquivos.id
      and (select public.tem_permissao(public.fn_recurso_da_entidade(v.entidade_tipo), 'ver'))
      and public.fn_anexo_entidade_visivel(v.entidade_tipo, v.entidade_id)
  ));

-- fn_vincular_arquivo: texto vivo + a linha marcada.
CREATE OR REPLACE FUNCTION public.fn_vincular_arquivo(p_arquivo_id uuid, p_entidade_tipo text, p_entidade_id uuid, p_nome_exibicao text DEFAULT NULL::text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_recurso text;
  v_vinculo uuid;
begin
  v_recurso := public.fn_recurso_da_entidade(p_entidade_tipo);
  if v_recurso is null then
    raise exception 'Tipo de entidade sem anexos: %', p_entidade_tipo;
  end if;
  if not (
    public.tem_permissao(v_recurso, 'editar')
    or public.tem_permissao(v_recurso, 'criar')
  ) then
    raise exception 'Sem permissao para anexar neste documento';
  end if;
  if not public.fn_anexo_entidade_visivel(p_entidade_tipo, p_entidade_id) then raise exception 'Sem acesso a este contrato'; end if; -- mc:
  if not exists (select 1 from public.arquivos where id = p_arquivo_id) then
    raise exception 'Arquivo nao encontrado';
  end if;

  insert into public.anexo_vinculos (
    arquivo_id, entidade_tipo, entidade_id, origem, nome_exibicao
  )
  values (p_arquivo_id, p_entidade_tipo, p_entidade_id, 'upload_direto', p_nome_exibicao)
  on conflict (arquivo_id, entidade_tipo, entidade_id) do update
    set nome_exibicao = coalesce(excluded.nome_exibicao, public.anexo_vinculos.nome_exibicao)
  returning id into v_vinculo;

  -- Arquivo voltou a ter dono: sai da fila da faxina.
  update public.arquivos set orfao_em = null where id = p_arquivo_id and orfao_em is not null;

  return v_vinculo;
end;
$function$;

-- fn_desvincular_arquivo: texto vivo + o entidade_id/v_entidade para a checagem, + a linha marcada.
CREATE OR REPLACE FUNCTION public.fn_desvincular_arquivo(p_vinculo_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_tipo text;
  v_recurso text;
  v_entidade uuid;
begin
  select entidade_tipo, entidade_id into v_tipo, v_entidade from public.anexo_vinculos where id = p_vinculo_id;
  if v_tipo is null then
    raise exception 'Anexo nao encontrado neste documento';
  end if;

  v_recurso := public.fn_recurso_da_entidade(v_tipo);
  if not public.tem_permissao(v_recurso, 'editar') then
    raise exception 'Sem permissao para remover anexo deste documento';
  end if;
  if not public.fn_anexo_entidade_visivel(v_tipo, v_entidade) then raise exception 'Sem acesso a este contrato'; end if; -- mc:

  delete from public.anexo_vinculos where id = p_vinculo_id;
end;
$function$;

-- create or replace com a mesma assinatura mantém os grants (decisoes.md L2577). Confere:
do $confere$
begin
  if has_function_privilege('anon', 'public.fn_vincular_arquivo(uuid, text, uuid, text)', 'execute') then
    raise exception 'anon ganhou execute em fn_vincular_arquivo';
  end if;
end $confere$;
