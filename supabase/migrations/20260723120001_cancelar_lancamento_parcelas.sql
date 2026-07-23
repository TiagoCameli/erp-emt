-- Bug #4 do QA: ao cancelar a OC, o app só marcava ordens_compra.status como
-- 'cancelado'. Nada cancelava o lançamento vinculado (origem='oc') nem suas
-- parcelas: nem a Server Action `cancelarOrdem` (update inline só na tabela
-- ordens_compra) nem nenhuma trigger/fn existente tocava `lancamentos` ou
-- `lancamento_parcelas` nesse fluxo. Como `lancamentos`/`lancamento_parcelas`
-- não têm policy nem grant de UPDATE para `authenticated` (só SELECT — todo
-- write nessas tabelas passa por RPC security definer), a única forma de
-- fechar o gap é criar uma função e trocar o update inline da Server Action
-- por uma chamada RPC (mesmo padrão de `fn_desaprovar_ordem_compra`).
-- Confirmado no banco vivo: LAN-2026-0001 (origem='oc', origem_id da
-- OC-2026-0001, já cancelada) ficou com o cabeçalho em 'cancelado' (ajuste
-- manual de QA para reproduzir o estado-alvo) mas a parcela 1 em 'pendente'
-- — a fila de aprovação de pagamentos lê `lancamento_parcelas` e mostrava
-- essa parcela órfã, inflando o "Total a aprovar".
--
-- Fix: nova função `fn_cancelar_ordem_compra`, replicando exatamente as
-- checagens que hoje vivem em `cancelarOrdem` (permissão, motivo obrigatório,
-- OC não encontrada, já cancelada, aprovada exige desaprovar antes) e, ao
-- cancelar a OC, cascateando:
--   1) `lancamentos` do origem='oc'/origem_id=OC que ainda não estão
--      'cancelado'/'pago' -> 'cancelado' (nunca mexe em lançamento já pago);
--   2) `lancamento_parcelas` desses lançamentos que estão 'pendente'/
--      'aprovado' -> 'cancelado' (nunca mexe em parcela 'pago', dinheiro já
--      saiu).
-- A Server Action passa a chamar essa RPC em vez do update direto (ver
-- src/modules/compras/ordens/actions.ts, cancelarOrdem).
--
-- Rollback: `drop function if exists public.fn_cancelar_ordem_compra(uuid, text);`
-- e reverter a Server Action para o update inline em ordens_compra (git
-- revert desta migration + do commit da action). Os dados cancelados por
-- esta função (lancamentos/lancamento_parcelas) não voltam sozinhos: se for
-- necessário desfazer, reverter manualmente por id.

create or replace function public.fn_cancelar_ordem_compra(p_oc_id uuid, p_motivo text)
returns void
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_status text;
  v_motivo text;
begin
  if not public.tem_permissao('compras.ordens', 'editar') then
    raise exception 'Sem permissao para cancelar ordens de compra';
  end if;

  v_motivo := btrim(p_motivo);
  if coalesce(v_motivo, '') = '' then
    raise exception 'Informe o motivo do cancelamento';
  end if;

  select status into v_status from public.ordens_compra where id = p_oc_id;
  if v_status is null then
    raise exception 'Ordem de compra nao encontrada';
  end if;
  if v_status = 'cancelado' then
    raise exception 'A ordem ja esta cancelada';
  end if;
  if v_status = 'aprovado' then
    raise exception 'Desaprove a ordem antes de cancelar';
  end if;

  update public.ordens_compra
  set status = 'cancelado', motivo_rejeicao = v_motivo
  where id = p_oc_id;

  -- Cascata do cabeçalho do lançamento: só avança se ainda não está
  -- cancelado/pago (lançamento pago = dinheiro já saiu, não se mexe).
  update public.lancamentos
  set status = 'cancelado'
  where origem = 'oc'
    and origem_id = p_oc_id
    and status not in ('cancelado', 'pago');

  -- Cascata das parcelas do(s) lançamento(s) da OC: só as ainda não pagas.
  update public.lancamento_parcelas
  set status = 'cancelado'
  where status not in ('cancelado', 'pago')
    and lancamento_id in (
      select id from public.lancamentos
      where origem = 'oc' and origem_id = p_oc_id
    );
end;
$function$;

revoke all on function public.fn_cancelar_ordem_compra(uuid, text) from public, anon;
grant execute on function public.fn_cancelar_ordem_compra(uuid, text) to authenticated;

-- Corrige o dado já órfão hoje: LAN-2026-0001 (cabeçalho cancelado desde
-- antes desta migration, parcela 1 ainda pendente por falta da cascata).
update public.lancamento_parcelas
set status = 'cancelado'
where status <> 'pago'
  and lancamento_id = (select id from public.lancamentos where numero = 'LAN-2026-0001');
