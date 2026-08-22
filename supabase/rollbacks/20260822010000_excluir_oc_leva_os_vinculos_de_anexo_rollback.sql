-- Rollback de 20260822010000: `fn_excluir_ordem_compra` volta a NÃO apagar os
-- vínculos de anexo.
--
-- Cópia literal do que `pg_get_functiondef` devolvia em 21/08/2026 (md5
-- 2a45070d94ab834ee613351941800314), INCLUSIVE o defeito: cada exclusão volta a
-- deixar vínculo apontando para OC, lançamento e parcela que não existem mais.
--
-- O REPARO DE DADO NÃO É DESFEITO. Os 11 vínculos apagados (4 de ordem_compra, 7
-- de lançamento) apontavam para documentos que já não existiam: recriá-los seria
-- inventar lixo, não voltar atrás. Os arquivos deles seguem na tabela, marcados
-- por `trg_marcar_arquivo_orfao`.

create or replace function public.fn_excluir_ordem_compra(p_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
begin
  if not public.tem_permissao('compras.ordens', 'excluir') then
    raise exception 'Sem permissao para excluir ordens de compra';
  end if;

  if exists (select 1 from public.recebimentos r where r.ordem_compra_id = p_id) then
    raise exception 'Nao da para excluir: esta ordem de compra ja tem recebimento registrado';
  end if;

  if exists (
    select 1
    from public.lancamentos l
    join public.lancamento_parcelas p on p.lancamento_id = l.id
    where l.origem = 'oc' and l.origem_id = p_id
      and p.status in ('aprovado', 'pago')
  ) then
    raise exception 'Nao da para excluir: o pagamento desta ordem ja foi aprovado ou pago. Desaprove ou estorne o pagamento antes';
  end if;

  if exists (
    select 1
    from public.extrato_transacoes t
    join public.lancamento_parcelas p on p.id = t.parcela_id
    join public.lancamentos l on l.id = p.lancamento_id
    where l.origem = 'oc' and l.origem_id = p_id
  ) then
    raise exception 'Nao da para excluir: esta ordem tem parcela conciliada';
  end if;

  delete from public.lancamentos
  where origem = 'oc' and origem_id = p_id;

  delete from public.ordens_compra where id = p_id;
end;
$function$;

revoke all on function public.fn_excluir_ordem_compra(uuid) from public;
grant execute on function public.fn_excluir_ordem_compra(uuid) to authenticated;
