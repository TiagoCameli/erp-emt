-- Dividas: a lista passa a mostrar quanto falta pagar, o total no prazo e
-- quanto custa quitar hoje. As duas primeiras saem do que ja vinha
-- (saldo_devedor + juros_a_pagar, e o pago); a terceira precisa de TODAS as
-- parcelas em aberto com o vencimento (proximas so traz 12), entao a funcao
-- ganha a coluna `restantes`. O valor presente e feito no TS (calculo.ts),
-- junto com o CET, pela mesma conta de meses.
--
-- Mudou o tipo de retorno: drop + create, com os mesmos grants.

drop function if exists public.fn_rel_dividas_contratos(date);

create or replace function public.fn_rel_dividas_contratos(p_data date)
returns table (
  contrato_id uuid, credor text, numero text, tipo text, status text, centro_custo_id uuid, centro text,
  valor_liberado numeric, data_liberacao date, taxa_am numeric, sistema text, tem_cronograma boolean,
  principal_pago numeric, saldo_devedor numeric, juros_pagos numeric, juros_a_pagar numeric,
  proximas jsonb, fluxo jsonb, restantes jsonb)
language sql
stable
security definer
set search_path to ''
as $function$
  with linhas as (
    select cr.*, d.lancamento_id,
      case
        when cr.tipo <> 'parcela' then cr.vencimento <= p_data
        when d.lancamento_id is null then cr.vencimento <= p_data
        else exists (select 1 from public.lancamento_parcelas p
                      where p.lancamento_id = d.lancamento_id and p.numero_parcela = cr.numero and p.status = 'pago')
      end as pago
    from public.contrato_divida_cronograma cr
    join public.contratos_divida d on d.id = cr.contrato_id
    where cr.substituida_em is null
  )
  select d.id, d.credor, d.numero, d.tipo, d.status, d.centro_custo_id, cc.nome,
    d.valor_liberado, d.data_liberacao, d.taxa_am, d.sistema,
    exists (select 1 from linhas l where l.contrato_id = d.id),
    coalesce((select sum(l.principal) from linhas l where l.contrato_id = d.id and l.pago), 0),
    coalesce((select sum(l.principal) from linhas l where l.contrato_id = d.id and not l.pago),
             case when exists (select 1 from linhas l where l.contrato_id = d.id) then 0 else d.valor_liberado end),
    -- Encargo capitalizado na renegociacao vira principal: nao e juros pago.
    coalesce((select sum(l.juros + l.encargos) from linhas l where l.contrato_id = d.id and l.pago and l.tipo <> 'renegociacao'), 0),
    coalesce((select sum(l.juros + l.encargos) from linhas l where l.contrato_id = d.id and not l.pago and l.tipo <> 'renegociacao'), 0),
    coalesce((select jsonb_agg(jsonb_build_object('numero', x.numero, 'vencimento', x.vencimento, 'principal', x.principal,
                'juros', x.juros, 'encargos', x.encargos, 'total', x.principal + x.juros + x.encargos) order by x.vencimento)
              from (select * from linhas l where l.contrato_id = d.id and not l.pago order by l.vencimento limit 12) x), '[]'::jsonb),
    jsonb_build_array(jsonb_build_object('data', d.data_liberacao, 'valor', d.valor_liberado))
      || coalesce((select jsonb_agg(jsonb_build_object('data', l.vencimento, 'valor', -(l.principal + l.juros + l.encargos))
                     order by l.vencimento) from linhas l where l.contrato_id = d.id and l.tipo <> 'renegociacao'), '[]'::jsonb),
    -- Todas as parcelas em aberto (sem a linha de renegociacao, que nao e
    -- saida de caixa): base do "quitar hoje".
    coalesce((select jsonb_agg(jsonb_build_object('data', l.vencimento, 'valor', l.principal + l.juros + l.encargos)
                     order by l.vencimento) from linhas l
               where l.contrato_id = d.id and not l.pago and l.tipo <> 'renegociacao'), '[]'::jsonb)
  from public.contratos_divida d
  left join public.centros_custo cc on cc.id = d.centro_custo_id
  where public.tem_permissao('financeiro.relatorios', 'ver') or public.tem_permissao('financeiro.dividas', 'ver')
  order by d.status, d.credor, d.numero;
$function$;

revoke all on function public.fn_rel_dividas_contratos(date) from public, anon;
grant execute on function public.fn_rel_dividas_contratos(date) to authenticated;
