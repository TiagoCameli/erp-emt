-- Desaprovar OC apaga o lancamento em vez de deixar ele cancelado.
--
-- O que o Tiago viu: LAN-2026-0030 (cancelado) e LAN-2026-0031 (a pagar), os dois
-- da OC-2026-0043. Desaprovar e reaprovar a ordem deixava o lancamento velho
-- cancelado na lista, sujando a tela e a leitura ("tenho dois lancamentos dessa
-- compra?"). Lancamento de ordem desaprovada nao e' historico: a ordem voltou
-- para aprovacao e o lancamento sera gerado de novo quando ela for aprovada.
--
-- A trava que ele lembrou JA existia (conserto de 29/07): a ordem so desaprova se
-- o pagamento nao estiver aprovado nem pago. Fica mantida, e agora tambem barra
-- parcela conciliada, pelo mesmo motivo que as outras exclusoes barram.

create or replace function public.fn_desaprovar_ordem_compra(p_oc_id uuid, p_motivo text)
returns void
language plpgsql
security definer
set search_path to ''
as $$
declare v_status text;
begin
  if not public.tem_permissao('compras.ordens', 'desaprovar') then
    raise exception 'Sem permissao para desaprovar ordens de compra';
  end if;
  if coalesce(btrim(p_motivo), '') = '' then
    raise exception 'Informe o motivo da desaprovacao';
  end if;

  select status into v_status from public.ordens_compra where id = p_oc_id;
  if v_status is null then
    raise exception 'Ordem de compra nao encontrada';
  end if;
  if v_status <> 'aprovado' then
    raise exception 'So da para desaprovar uma OC aprovada e ainda sem recebimento';
  end if;

  if exists (
    select 1
    from public.lancamento_parcelas p
    join public.lancamentos l on l.id = p.lancamento_id
    where l.origem = 'oc' and l.origem_id = p_oc_id
      and p.status in ('aprovado', 'pago')
  ) then
    raise exception 'Esta ordem ja tem pagamento aprovado ou pago. Desaprove ou estorne o pagamento antes de desaprovar a ordem.';
  end if;

  if exists (
    select 1
    from public.extrato_transacoes t
    join public.lancamento_parcelas p on p.id = t.parcela_id
    join public.lancamentos l on l.id = p.lancamento_id
    where l.origem = 'oc' and l.origem_id = p_oc_id
  ) then
    raise exception 'Esta ordem tem parcela conciliada: nao da para desaprovar.';
  end if;

  update public.ordens_compra
  set status = 'pendente_aprovacao', aprovado_por = null, aprovado_em = null
  where id = p_oc_id;

  -- Apaga, nao cancela. As parcelas vao na cascata da FK.
  delete from public.lancamentos
  where origem = 'oc' and origem_id = p_oc_id;
end;
$$;

revoke all on function public.fn_desaprovar_ordem_compra(uuid, text) from public;
grant execute on function public.fn_desaprovar_ordem_compra(uuid, text) to authenticated;

-- Limpeza do que a versao antiga deixou cancelado. So o que nao tem pagamento
-- aprovado nem pago e nao esta conciliado: o resto e' historico de verdade.
delete from public.lancamentos l
where l.origem = 'oc'
  and l.status = 'cancelado'
  and not exists (
    select 1 from public.lancamento_parcelas p
    where p.lancamento_id = l.id and p.status in ('aprovado', 'pago')
  )
  and not exists (
    select 1 from public.extrato_transacoes t
    join public.lancamento_parcelas p on p.id = t.parcela_id
    where p.lancamento_id = l.id
  );

notify pgrst, 'reload schema';
