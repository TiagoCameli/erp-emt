-- Bug #5 (QA): a OC fica "Recebida" pra sempre, mesmo depois de o lançamento
-- de origem 'oc' ficar totalmente pago. Fecha o ciclo: quando a última
-- parcela pendente de um lançamento 'oc' é paga (fn_recalcular_status_lancamento
-- decide que o lançamento virou 'pago'), a OC vinculada (origem_id) também vai
-- pra 'pago'. Só cascateia de 'recebido' -> 'pago' (nunca mexe em OC
-- cancelada/rejeitada/etc).

-- (a) Novo valor no check de status da OC, preservando todos os atuais.
alter table public.ordens_compra
  drop constraint ordens_compra_status_check;

alter table public.ordens_compra
  add constraint ordens_compra_status_check
  check (status = any (array[
    'rascunho'::text,
    'pendente_aprovacao'::text,
    'aprovado'::text,
    'rejeitado'::text,
    'cancelado'::text,
    'recebido'::text,
    'pago'::text
  ]));

-- (b) fn_recalcular_status_lancamento é o único lugar que decide que um
-- lancamento virou 'pago' (hoje chamado só por fn_pagar_parcela, mas é o
-- ponto certo: qualquer futuro caller ganha a cascata de graça, sem duplicar
-- a lógica de "todas as parcelas pagas/canceladas"). Cascateia pra OC só
-- quando origem = 'oc' e a OC ainda está 'recebido' (idempotente e não
-- mexe em OC já cancelada/paga).
create or replace function public.fn_recalcular_status_lancamento(p_lanc_id uuid)
 returns void
 language plpgsql
 security definer
 set search_path to ''
as $function$
declare v_total int; v_pagas int; v_canceladas int;
begin
  select count(*), count(*) filter (where status = 'pago'), count(*) filter (where status = 'cancelado')
  into v_total, v_pagas, v_canceladas
  from public.lancamento_parcelas where lancamento_id = p_lanc_id;
  if v_total = 0 then return; end if;
  if v_pagas + v_canceladas = v_total and v_pagas > 0 then
    update public.lancamentos set status = 'pago' where id = p_lanc_id and status <> 'cancelado';
    -- Bug #5: lançamento de OC que quitou todas as parcelas fecha o ciclo
    -- da ordem de compra também.
    update public.ordens_compra oc
    set status = 'pago'
    from public.lancamentos l
    where l.id = p_lanc_id
      and l.origem = 'oc'
      and oc.id = l.origem_id
      and oc.status = 'recebido';
  elsif v_canceladas = v_total then
    update public.lancamentos set status = 'cancelado' where id = p_lanc_id;
  else
    update public.lancamentos set status = 'a_pagar' where id = p_lanc_id and status in ('previsto', 'pago');
  end if;
end $function$;
