-- Anexo de pagamento sai com financeiro.pagamentos/criar (13/10/2026).
-- O catálogo de Pagamentos tem só ver, criar e excluir: não existe "editar".
-- fn_desvincular_arquivo pedia editar para todo documento, então ninguém (nem o
-- Admin) conseguia tirar um comprovante errado de uma parcela paga
-- (LAN-2026-6778). Pede "criar", a ação de quem registra o pagamento e anexa o
-- comprovante. Os outros documentos seguem pedindo editar. Espelha
-- acaoParaRemover em src/modules/_shared/anexos/entidades.ts.

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
  if not public.tem_permissao(v_recurso, case when v_tipo = 'pagamento' then 'criar' else 'editar' end) then
    raise exception 'Sem permissao para remover anexo deste documento';
  end if;
  if not public.fn_anexo_entidade_visivel(v_tipo, v_entidade) then raise exception 'Sem acesso a este contrato'; end if; -- mc:
  if v_tipo = 'mc_reajuste' and exists (select 1 from public.mc_reajuste_relatorios r join public.anexo_vinculos v on v.arquivo_id = r.arquivo_id
       where v.id = p_vinculo_id and r.medicao_id = v_entidade and r.excluido_em is null) then
    raise exception 'O PDF é de um relatório de reajuste em uso. Exclua o relatório antes de tirar o anexo'; -- mc: Fase 6
  end if;

  delete from public.anexo_vinculos where id = p_vinculo_id;
end;
$function$;
