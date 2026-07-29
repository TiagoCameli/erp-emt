-- BUG que eu causei hoje: desaprovar OC deixava o lancamento vivo, e reaprovar
-- criava um SEGUNDO lancamento. O custo da compra passava a contar duas vezes.
--
-- Por que apareceu agora: a funcao cancelava o lancamento so quando ele estava
-- 'previsto'. Antes do "pagamento por forma" (20260729140001) todo lancamento de
-- OC nascia previsto e ficava assim ate a nota, entao o filtro sempre pegava.
-- Com a regra nova, lancamento de forma bancaria com parcelas nasce 'a_pagar', e
-- o filtro passou a nao pegar nada. A OC-2026-0032 ficou com 2 lancamentos vivos
-- e R$ 1,00 de compra virou R$ 2,00 de custo, com parcelas duplicadas na fila de
-- aprovacao de pagamento.
--
-- Agora: desaprovar cancela o lancamento da OC em qualquer status e cancela as
-- parcelas pendentes dele. E recusa desaprovar quando ja existe parcela aprovada
-- ou paga: dinheiro em movimento se estorna antes, nao se cancela por baixo.

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
      and l.status <> 'cancelado'
      and p.status in ('aprovado', 'pago')
  ) then
    raise exception 'Esta ordem ja tem pagamento aprovado ou pago. Desaprove ou estorne o pagamento antes de desaprovar a ordem.';
  end if;

  update public.ordens_compra
  set status = 'pendente_aprovacao', aprovado_por = null, aprovado_em = null
  where id = p_oc_id;

  update public.lancamento_parcelas p
  set status = 'cancelado'
  from public.lancamentos l
  where l.id = p.lancamento_id
    and l.origem = 'oc' and l.origem_id = p_oc_id
    and l.status <> 'cancelado'
    and p.status = 'pendente';

  update public.lancamentos
  set status = 'cancelado'
  where origem = 'oc' and origem_id = p_oc_id and status <> 'cancelado';
end;
$$;

-- Limpeza do estrago: por OC, mantem o lancamento vivo mais recente e cancela os
-- anteriores (com as parcelas pendentes deles).
with vivos as (
  select l.id, l.origem_id,
         row_number() over (partition by l.origem_id order by l.created_at desc) as posicao
  from public.lancamentos l
  where l.origem = 'oc' and l.status <> 'cancelado'
)
update public.lancamento_parcelas p
set status = 'cancelado'
from vivos v
where p.lancamento_id = v.id and v.posicao > 1 and p.status = 'pendente';

with vivos as (
  select l.id, l.origem_id,
         row_number() over (partition by l.origem_id order by l.created_at desc) as posicao
  from public.lancamentos l
  where l.origem = 'oc' and l.status <> 'cancelado'
)
update public.lancamentos l
set status = 'cancelado'
from vivos v
where l.id = v.id and v.posicao > 1;
