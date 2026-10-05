-- Caixa com um predicado so (decisao D1 do Tiago, 03/10/2026).
--
-- A natureza `movimentacao` (emprestimo, financiamento, aplicacao, resgate)
-- respondia "nao" a tres perguntas diferentes: entra no caixa, entra no
-- resultado, e divida. Para o caixa a resposta certa e "sim": a prestacao do
-- emprestimo paga pela conta BB sai da conta BB. Medido em 03/10/2026: 11
-- prestacoes pagas em setembro, R$ 622.301,19, estavam fora do saldo, do
-- extrato e do fluxo de caixa.
--
-- `vw_parcelas_caixa` e a unica fonte das funcoes de caixa. Ela nao filtra
-- natureza. Duas colunas carregam a regra:
--   no_saldo        parcela paga, com conta, depois do corte do saldo inicial
--                   (ou sem data de pagamento, como sempre foi). E o predicado
--                   de "entra no saldo" que saldo, extrato, conciliacao e o
--                   drill de conta usam.
--   serie_fluxo     a serie do fluxo de caixa: a_pagar, a_receber,
--                   emprestimo_tomado (entrada de movimentacao rateada no
--                   centro de Emprestimos, raiz `financeiro`, o mesmo "tomado"
--                   do relatorio de Creditos) e amortizacao (saida de
--                   movimentacao). Nulo para o lancamento `origem = aplicacao`
--                   de movimentacao, que e ajuste dentro da subconta e fica
--                   fora do fluxo como antes.
-- O corte do saldo inicial NAO e filtro da view: o fluxo de caixa mostra o
-- realizado historico (o financiamento de jul/2026 e anterior ao corte de
-- 21/08/2026), entao cada funcao escolhe se usa `no_saldo`.
--
-- Assinaturas, SECURITY DEFINER e search_path das funcoes ficam como estavam.

create or replace view public.vw_parcelas_caixa
with (security_invoker = true) as
select
  p.id as parcela_id,
  p.lancamento_id,
  p.numero_parcela,
  p.conta_bancaria_id,
  l.tipo,
  p.data_pagamento,
  p.data_vencimento,
  p.mes_fluxo,
  p.valor,
  p.valor_liquido,
  p.status,
  l.origem,
  l.categoria_id,
  coalesce(cf.natureza, 'operacional') as natureza,
  (
    p.status = 'pago'
    and p.conta_bancaria_id is not null
    and (
      c.saldo_inicial_data is null
      or p.data_pagamento is null
      or p.data_pagamento > c.saldo_inicial_data
    )
  ) as no_saldo,
  (
    p.status = 'pago'
    and c.saldo_inicial_data is not null
    and p.data_pagamento is not null
    and p.data_pagamento <= c.saldo_inicial_data
  ) as antes_do_corte,
  case
    when l.origem = 'aplicacao'
         and coalesce(cf.natureza, 'operacional') = 'movimentacao' then null
    when coalesce(cf.natureza, 'operacional') <> 'movimentacao' then l.tipo
    when l.tipo = 'a_pagar' then 'amortizacao'
    when exists (
      with recursive subida as (
        select cc.id, cc.pai_id, cc.tipo
        from public.lancamento_rateios r
        join public.centros_custo cc on cc.id = r.centro_custo_id
        where r.lancamento_id = l.id
        union
        select pai.id, pai.pai_id, pai.tipo
        from public.centros_custo pai
        join subida s on pai.id = s.pai_id
      )
      select 1 from subida s where s.pai_id is null and s.tipo = 'financeiro'
    ) then 'emprestimo_tomado'
    else 'a_receber'
  end as serie_fluxo
from public.lancamento_parcelas p
join public.lancamentos l on l.id = p.lancamento_id
left join public.categorias_financeiras cf on cf.id = l.categoria_id
left join public.contas_bancarias c on c.id = p.conta_bancaria_id
where p.status <> 'cancelado'
  and l.status <> 'cancelado';

comment on view public.vw_parcelas_caixa is
  'Parcelas que contam para o caixa (D1, 03/10/2026). Sem filtro de natureza. '
  'no_saldo = paga, com conta, depois do corte. serie_fluxo = serie do fluxo de caixa.';

revoke all on public.vw_parcelas_caixa from public, anon;
grant select on public.vw_parcelas_caixa to authenticated;

-- Saldo por conta. fn_saldo_conta e fn_saldos_das_contas leem daqui.
create or replace function public.fn_rel_posicao_bancaria()
 returns table(conta_bancaria_id uuid, tipo text, total numeric)
 language sql
 stable
 set search_path to ''
as $function$
  select v.conta_bancaria_id, v.tipo, sum(v.valor_liquido) as total
  from public.vw_parcelas_caixa v
  where v.no_saldo
  group by v.conta_bancaria_id, v.tipo

  union all

  select t.conta_destino_id, 'transferencia_entrada', sum(t.valor)
  from public.transferencias_contas t
  join public.contas_bancarias c on c.id = t.conta_destino_id
  where c.saldo_inicial_data is null
     or t.data_transferencia > c.saldo_inicial_data
  group by t.conta_destino_id

  union all

  select t.conta_origem_id, 'transferencia_saida', sum(t.valor + t.tarifa)
  from public.transferencias_contas t
  join public.contas_bancarias c on c.id = t.conta_origem_id
  where c.saldo_inicial_data is null
     or t.data_transferencia > c.saldo_inicial_data
  group by t.conta_origem_id
$function$;

create or replace function public.fn_rel_movimento_antes_do_corte()
 returns table(conta_bancaria_id uuid, corte date, parcelas integer, recebido numeric, pago numeric)
 language sql
 stable
 set search_path to ''
as $function$
  select
    c.id,
    c.saldo_inicial_data,
    count(v.parcela_id)::int,
    coalesce(sum(v.valor_liquido) filter (where v.tipo = 'a_receber'), 0),
    coalesce(sum(v.valor_liquido) filter (where v.tipo = 'a_pagar'), 0)
  from public.contas_bancarias c
  join public.vw_parcelas_caixa v on v.conta_bancaria_id = c.id
  where v.antes_do_corte
  group by c.id, c.saldo_inicial_data
$function$;

create or replace function public.fn_extrato_conta(p_conta uuid, p_incluir_anteriores boolean default false)
 returns table(chave text, tipo_movimento text, lancamento_id uuid, data_movimento date, sentido text, valor numeric, no_saldo boolean, numero text, numero_documento text, descricao text, categoria_nome text, contraparte text, parcela text)
 language sql
 stable
 set search_path to ''
as $function$
  with conta as (
    select c.id, c.saldo_inicial_data
    from public.contas_bancarias c
    where c.id = p_conta
  ),
  movimentos as (
    select
      'parcela:' || v.parcela_id::text as chave,
      'parcela'::text as tipo_movimento,
      l.id as lancamento_id,
      v.data_pagamento as data_movimento,
      case when v.tipo = 'a_receber' then 'entrada' else 'saida' end as sentido,
      v.valor_liquido as valor,
      v.no_saldo,
      l.numero as numero,
      l.numero_documento as numero_documento,
      l.descricao as descricao,
      cf.nome as categoria_nome,
      coalesce(
        f.nome_fantasia,
        f.razao_social,
        cl.nome_fantasia,
        cl.nome,
        col.nome
      ) as contraparte,
      case
        when (
          select count(*)
          from public.lancamento_parcelas p2
          where p2.lancamento_id = l.id
        ) > 1
        then v.numero_parcela::text || '/' || (
          select count(*)
          from public.lancamento_parcelas p2
          where p2.lancamento_id = l.id
        )::text
      end as parcela
    from conta co
    join public.vw_parcelas_caixa v on v.conta_bancaria_id = co.id
    join public.lancamentos l on l.id = v.lancamento_id
    left join public.categorias_financeiras cf on cf.id = l.categoria_id
    left join public.fornecedores f on f.id = l.fornecedor_id
    left join public.clientes cl on cl.id = l.cliente_id
    left join public.colaboradores col on col.id = l.colaborador_id
    where v.status = 'pago'
      and (p_incluir_anteriores or v.no_saldo)

    union all

    select
      'transferencia-entrada:' || t.id::text,
      'transferencia'::text,
      null::uuid,
      t.data_transferencia,
      'entrada'::text,
      t.valor,
      (
        co.saldo_inicial_data is null
        or t.data_transferencia > co.saldo_inicial_data
      ),
      t.numero,
      null::text,
      coalesce(t.descricao, 'Transferência recebida'),
      null::text,
      o.nome,
      null::text
    from conta co
    join public.transferencias_contas t on t.conta_destino_id = co.id
    join public.contas_bancarias o on o.id = t.conta_origem_id
    where p_incluir_anteriores
      or co.saldo_inicial_data is null
      or t.data_transferencia > co.saldo_inicial_data

    union all

    select
      'transferencia-saida:' || t.id::text,
      'transferencia'::text,
      null::uuid,
      t.data_transferencia,
      'saida'::text,
      t.valor,
      (
        co.saldo_inicial_data is null
        or t.data_transferencia > co.saldo_inicial_data
      ),
      t.numero,
      null::text,
      coalesce(t.descricao, 'Transferência enviada'),
      null::text,
      d.nome,
      null::text
    from conta co
    join public.transferencias_contas t on t.conta_origem_id = co.id
    join public.contas_bancarias d on d.id = t.conta_destino_id
    where p_incluir_anteriores
      or co.saldo_inicial_data is null
      or t.data_transferencia > co.saldo_inicial_data

    union all

    select
      'transferencia-tarifa:' || t.id::text,
      'tarifa'::text,
      null::uuid,
      t.data_transferencia,
      'saida'::text,
      t.tarifa,
      (
        co.saldo_inicial_data is null
        or t.data_transferencia > co.saldo_inicial_data
      ),
      t.numero,
      null::text,
      'Tarifa da transferência',
      null::text,
      d.nome,
      null::text
    from conta co
    join public.transferencias_contas t on t.conta_origem_id = co.id
    join public.contas_bancarias d on d.id = t.conta_destino_id
    where t.tarifa > 0
      and (
        p_incluir_anteriores
        or co.saldo_inicial_data is null
        or t.data_transferencia > co.saldo_inicial_data
      )
  )
  select
    m.chave,
    m.tipo_movimento,
    m.lancamento_id,
    m.data_movimento,
    m.sentido,
    m.valor,
    m.no_saldo,
    m.numero,
    m.numero_documento,
    m.descricao,
    m.categoria_nome,
    m.contraparte,
    m.parcela
  from movimentos m
  order by m.data_movimento nulls first, m.chave
$function$;

-- Saldo do app numa data, que a conciliacao compara com o LEDGERBAL do OFX.
-- Parte da versao de 20261003260000 (saldo para tras antes do corte) e so troca
-- a fonte das parcelas pela view: sem o filtro de natureza, a prestacao de
-- emprestimo paga na conta entra no saldo, como no extrato.
create or replace function public.fn_conciliacao_saldo_app_interno(p_conta_id uuid, p_data date)
returns numeric
language plpgsql
stable
security definer
set search_path to ''
as $function$
declare
  v_inicial numeric;
  v_corte date;
  v_total numeric;
begin
  select saldo_inicial, saldo_inicial_data into v_inicial, v_corte
  from public.contas_bancarias where id = p_conta_id;

  if v_corte is null or p_data >= v_corte then
    -- Para frente: saldo inicial + o que veio depois do corte ate a data.
    select coalesce(sum(m.v), 0) into v_total from (
      select case when v.tipo = 'a_receber' then v.valor_liquido else -v.valor_liquido end as v
      from public.vw_parcelas_caixa v
      where v.conta_bancaria_id = p_conta_id
        and v.no_saldo
        and (v.data_pagamento is null or v.data_pagamento <= p_data)
      union all
      select t.valor from public.transferencias_contas t
      where t.conta_destino_id = p_conta_id
        and (v_corte is null or t.data_transferencia > v_corte) and t.data_transferencia <= p_data
      union all
      select -(t.valor + t.tarifa) from public.transferencias_contas t
      where t.conta_origem_id = p_conta_id
        and (v_corte is null or t.data_transferencia > v_corte) and t.data_transferencia <= p_data
    ) m;
    return round(v_inicial + v_total, 2);
  end if;

  -- Para tras: saldo inicial - o que aconteceu depois da data ate o corte.
  select coalesce(sum(m.v), 0) into v_total from (
    select case when v.tipo = 'a_receber' then v.valor_liquido else -v.valor_liquido end as v
    from public.vw_parcelas_caixa v
    where v.conta_bancaria_id = p_conta_id
      and v.status = 'pago'
      and v.data_pagamento > p_data and v.data_pagamento <= v_corte
    union all
    select t.valor from public.transferencias_contas t
    where t.conta_destino_id = p_conta_id and t.data_transferencia > p_data and t.data_transferencia <= v_corte
    union all
    select -(t.valor + t.tarifa) from public.transferencias_contas t
    where t.conta_origem_id = p_conta_id and t.data_transferencia > p_data and t.data_transferencia <= v_corte
  ) m;
  return round(v_inicial - v_total, 2);
end;
$function$;

revoke all on function public.fn_conciliacao_saldo_app_interno(uuid, date) from public, anon, authenticated;

-- Fluxo de caixa com quatro series. `tipo` devolve a serie: a_pagar, a_receber,
-- emprestimo_tomado, amortizacao. O corte por centro continua pelo tipo do
-- lancamento (saida pelo centro de custo, entrada pelo centro de receita).
create or replace function public.fn_rel_fluxo_caixa(p_centros_custo uuid[] default null::uuid[], p_centros_receita uuid[] default null::uuid[])
 returns table(mes text, tipo text, realizado boolean, total numeric)
 language sql
 stable
 set search_path to ''
as $function$
  with alvo_custo as (
    select distinct s.id as centro_id
    from unnest(coalesce(p_centros_custo, '{}'::uuid[])) as escolhido(id)
    cross join lateral public.fn_centro_custo_subarvore(escolhido.id) s
  ),
  alvo_receita as (
    select distinct s.id as centro_id
    from unnest(coalesce(p_centros_receita, '{}'::uuid[])) as escolhido(id)
    cross join lateral public.fn_centro_custo_subarvore(escolhido.id) s
  ),
  fatia as (
    select
      r.lancamento_id,
      sum(r.valor) as rateio_total,
      sum(case
            when l.tipo = 'a_pagar'   and ac.centro_id is not null then r.valor
            when l.tipo = 'a_receber' and ar.centro_id is not null then r.valor
            else 0
          end) as rateio_escolhido
    from public.lancamento_rateios r
    join public.lancamentos l on l.id = r.lancamento_id
    left join alvo_custo ac on ac.centro_id = r.centro_custo_id
    left join alvo_receita ar on ar.centro_id = r.centro_custo_id
    where l.status <> 'cancelado'
    group by r.lancamento_id
  ),
  parcela as (
    select
      to_char(v.mes_fluxo, 'YYYY-MM') as mes,
      v.lancamento_id,
      v.serie_fluxo as serie,
      (v.status = 'pago') as realizado,
      v.valor_liquido as valor,
      case
        when v.tipo = 'a_pagar'
          then coalesce(cardinality(p_centros_custo), 0) > 0
        else coalesce(cardinality(p_centros_receita), 0) > 0
      end as tem_corte
    from public.vw_parcelas_caixa v
    where v.serie_fluxo is not null
  )
  select t.mes, t.serie, t.realizado, round(sum(t.valor), 2) as total
  from (
    select
      pa.mes,
      pa.serie,
      pa.realizado,
      case
        when pa.tem_corte
          then pa.valor * f.rateio_escolhido / nullif(f.rateio_total, 0)
        else pa.valor
      end as valor
    from parcela pa
    left join fatia f on f.lancamento_id = pa.lancamento_id
    where pa.mes is not null
      and (not pa.tem_corte or coalesce(f.rateio_escolhido, 0) <> 0)
  ) t
  group by t.mes, t.serie, t.realizado
$function$;

-- Drill dos relatorios de caixa. No ramo `fluxo`, `p_tipo_lancamento` passa a
-- aceitar a serie (a_pagar, a_receber, emprestimo_tomado, amortizacao); nulo
-- traz todas, como antes. No `aging` continua sendo o tipo do lancamento.
create or replace function public.fn_lancamentos_do_recorte(p_tipo_recorte text, p_faixa text default null::text, p_tipo_lancamento text default null::text, p_mes text default null::text, p_realizado boolean default null::boolean, p_conta uuid default null::uuid, p_hoje date default null::date)
 returns table(lancamento_id uuid, valor_no_recorte numeric)
 language sql
 stable
 set search_path to ''
as $function$
  with corte as (
    select coalesce(p_hoje, (now() at time zone 'America/Rio_Branco')::date) as hoje
  ),
  parcela as (
    select
      v.lancamento_id,
      v.tipo as tipo_lancamento,
      v.serie_fluxo,
      v.status,
      v.valor,
      coalesce(v.valor_liquido, v.valor) as liquido,
      v.conta_bancaria_id,
      v.no_saldo,
      v.data_vencimento - c.hoje as dias,
      to_char(v.mes_fluxo, 'YYYY-MM') as mes_fluxo
    from public.vw_parcelas_caixa v
    cross join corte c
  ),
  aging as (
    select f.lancamento_id, sum(f.valor) as total
    from (
      select b.lancamento_id, b.valor,
        case
          when b.dias is null  then 'a_vencer'
          when b.dias >= 0     then 'a_vencer'
          when b.dias >= -7    then 'v_1_7'
          when b.dias >= -15   then 'v_8_15'
          when b.dias >= -30   then 'v_16_30'
          when b.dias >= -60   then 'v_31_60'
          else                      'v_60_mais'
        end as faixa
      from parcela b
      where b.status in ('pendente', 'em_revisao', 'aprovado')
        and b.tipo_lancamento = p_tipo_lancamento
    ) f
    where p_tipo_recorte = 'aging' and f.faixa = p_faixa
    group by f.lancamento_id
  ),
  fluxo as (
    select lancamento_id, sum(liquido) as total
    from parcela
    where p_tipo_recorte = 'fluxo'
      and serie_fluxo is not null
      and (p_tipo_lancamento is null or serie_fluxo = p_tipo_lancamento)
      and mes_fluxo = p_mes
      and (status = 'pago') = p_realizado
    group by lancamento_id
  ),
  conta_paga as (
    select b.lancamento_id, sum(b.liquido) as total
    from parcela b
    where p_tipo_recorte = 'conta_paga'
      and b.no_saldo
      and (p_conta is null or b.conta_bancaria_id = p_conta)
    group by b.lancamento_id
  )
  select lancamento_id, total from aging
  union all
  select lancamento_id, total from fluxo
  union all
  select lancamento_id, total from conta_paga
$function$;

-- Painel de Gestao: os tres cards de pagar contam o mesmo conjunto que a fila
-- de Pagamentos, que nunca filtrou natureza.
create or replace function public.fn_rel_gestao_financeiro_resumo(p_hoje date default null::date)
 returns table(a_pagar_contagem integer, a_pagar_vencidas integer, a_pagar_valor numeric, a_aprovar_contagem integer, a_aprovar_valor numeric, pago_mes_contagem integer, pago_mes_valor numeric)
 language sql
 stable
 set search_path to ''
as $function$
  with janela as (
    select
      d.hoje,
      d.hoje + 7 as limite7,
      date_trunc('month', d.hoje)::date as inicio_mes,
      (date_trunc('month', d.hoje) + interval '1 month')::date as proximo_mes
    from (
      select coalesce(
        p_hoje,
        (now() at time zone 'America/Rio_Branco')::date
      ) as hoje
    ) d
  ),
  base as (
    select v.status, v.valor, v.valor_liquido, v.data_vencimento, v.data_pagamento
    from public.vw_parcelas_caixa v
    where v.tipo = 'a_pagar'
  )
  select
    count(*) filter (
      where b.status = 'aprovado' and b.data_vencimento <= j.limite7
    )::int,
    count(*) filter (
      where b.status = 'aprovado'
        and b.data_vencimento <= j.limite7
        and b.data_vencimento < j.hoje
    )::int,
    coalesce(sum(b.valor) filter (
      where b.status = 'aprovado' and b.data_vencimento <= j.limite7
    ), 0),
    count(*) filter (where b.status = 'pendente')::int,
    coalesce(sum(b.valor) filter (where b.status = 'pendente'), 0),
    count(*) filter (
      where b.status = 'pago'
        and b.data_pagamento >= j.inicio_mes
        and b.data_pagamento < j.proximo_mes
    )::int,
    coalesce(sum(b.valor_liquido) filter (
      where b.status = 'pago'
        and b.data_pagamento >= j.inicio_mes
        and b.data_pagamento < j.proximo_mes
    ), 0)
  from janela j
  left join base b on true
$function$;

create or replace function public.fn_rel_aging(p_hoje date default null::date)
 returns table(tipo text, faixa_prazo text, faixa_aging text, total numeric)
 language sql
 stable
 set search_path to ''
as $function$
  with corte as (
    select coalesce(p_hoje, (now() at time zone 'America/Rio_Branco')::date) as hoje
  ),
  parcela as (
    select
      v.tipo as tipo,
      v.valor as valor,
      v.data_vencimento - c.hoje as dias
    from public.vw_parcelas_caixa v
    cross join corte c
    where v.status in ('pendente', 'em_revisao', 'aprovado')
  )
  select
    b.tipo,
    case
      when b.dias is null then 'sem_data'
      when b.dias < 0     then 'vencido'
      when b.dias <= 7    then 'ate_7'
      when b.dias <= 15   then 'd_8_15'
      when b.dias <= 30   then 'd_16_30'
      when b.dias <= 60   then 'd_31_60'
      else                     'acima_60'
    end,
    case
      when b.dias is null  then 'a_vencer'
      when b.dias >= 0     then 'a_vencer'
      when b.dias >= -7    then 'v_1_7'
      when b.dias >= -15   then 'v_8_15'
      when b.dias >= -30   then 'v_16_30'
      when b.dias >= -60   then 'v_31_60'
      else                      'v_60_mais'
    end,
    sum(b.valor)
  from parcela b
  group by 1, 2, 3
$function$;

-- Creditos (A6). Parcela em aberto e pendente, em revisao ou aprovada: a
-- cancelada deixava de ser "paga" e entrava como divida.
create or replace function public.fn_rel_creditos()
 returns table(lancamento_id uuid, numero text, credor text, descricao text, categoria text, valor_contratado numeric, total_pago numeric, saldo_devedor numeric, parcelas integer, parcelas_pagas integer, proximo_vencimento date)
 language sql
 stable
 set search_path to ''
as $function$
  select
    l.id,
    l.numero,
    coalesce(f.nome_fantasia, f.razao_social, '(sem credor)') as credor,
    l.descricao,
    coalesce(cf.nome, '(sem categoria)') as categoria,
    l.valor as valor_contratado,
    coalesce(sum(p.valor_liquido) filter (where p.status = 'pago'), 0) as total_pago,
    coalesce(sum(p.valor) filter (
      where p.status in ('pendente', 'em_revisao', 'aprovado')), 0) as saldo_devedor,
    count(p.id)::int as parcelas,
    count(p.id) filter (where p.status = 'pago')::int as parcelas_pagas,
    min(p.data_vencimento) filter (
      where p.status in ('pendente', 'em_revisao', 'aprovado')) as proximo_vencimento
  from public.lancamentos l
  left join public.lancamento_parcelas p on p.lancamento_id = l.id
  left join public.fornecedores f on f.id = l.fornecedor_id
  left join public.categorias_financeiras cf on cf.id = l.categoria_id
  where l.e_divida
    -- SO o lado que a empresa DEVE (ver 26/08/2026).
    and l.tipo = 'a_pagar'
    and l.status <> 'cancelado'
  group by l.id, l.numero, f.nome_fantasia, f.razao_social, l.descricao, cf.nome, l.valor
$function$;

create or replace function public.fn_rel_creditos_por_mes(p_meses integer default 12)
 returns table(mes date, valor numeric, parcelas integer)
 language sql
 stable
 set search_path to ''
as $function$
  with limite as (
    select (date_trunc('month', (now() at time zone 'America/Rio_Branco')::date)
            + (greatest(coalesce(p_meses, 12), 1) || ' months')::interval)::date as fim,
           date_trunc('month', (now() at time zone 'America/Rio_Branco')::date)::date as inicio
  )
  select
    greatest(date_trunc('month', p.data_vencimento)::date, limite.inicio) as mes,
    sum(p.valor) as valor,
    count(*)::int as parcelas
  from public.lancamento_parcelas p
  join public.lancamentos l on l.id = p.lancamento_id
  cross join limite
  where l.e_divida
    and l.tipo = 'a_pagar'
    and l.status <> 'cancelado'
    and p.status in ('pendente', 'em_revisao', 'aprovado')
    and p.data_vencimento is not null
    and p.data_vencimento < limite.fim
  group by 1
  order by 1
$function$;

-- Por contrato: o lancamento entra UMA vez por etapa (dois rateios na mesma
-- etapa multiplicavam as parcelas), e a coluna nova `juros_embutidos` e o que
-- as prestacoes somam acima do que foi tomado (D2).
drop function public.fn_rel_emprestimos_por_contrato();

create function public.fn_rel_emprestimos_por_contrato()
 returns table(centro_custo_id uuid, contrato text, tomado numeric, pago numeric, a_pagar numeric, juros_embutidos numeric, parcelas integer, parcelas_pagas integer, proximo_vencimento date)
 language sql
 stable
 set search_path to ''
as $function$
  with etapas as (
    select e.id, e.nome
    from public.centros_custo e
    join public.centros_custo raiz on raiz.id = e.pai_id
    -- 17/09/2026: etapa inativa sai da tabela.
    where raiz.tipo = 'financeiro' and e.ativo
  ),
  entradas as (
    select et.id as etapa_id, coalesce(sum(r.valor), 0) as tomado
    from etapas et
    join public.lancamento_rateios r on r.centro_custo_id = et.id
    join public.lancamentos l on l.id = r.lancamento_id
    where l.tipo = 'a_receber' and l.status <> 'cancelado'
    group by et.id
  ),
  lancamentos_da_etapa as (
    select distinct et.id as etapa_id, l.id as lancamento_id
    from etapas et
    join public.lancamento_rateios r on r.centro_custo_id = et.id
    join public.lancamentos l on l.id = r.lancamento_id
    where l.tipo = 'a_pagar' and l.status <> 'cancelado'
  ),
  parcelas_da_etapa as (
    select
      le.etapa_id,
      count(p.id) filter (where p.status <> 'cancelado')::int as parcelas,
      count(p.id) filter (where p.status = 'pago')::int as parcelas_pagas,
      coalesce(sum(p.valor_liquido) filter (where p.status = 'pago'), 0) as pago,
      coalesce(sum(p.valor) filter (
        where p.status in ('pendente', 'em_revisao', 'aprovado')), 0) as a_pagar,
      min(p.data_vencimento) filter (
        where p.status in ('pendente', 'em_revisao', 'aprovado')) as proximo
    from lancamentos_da_etapa le
    join public.lancamento_parcelas p on p.lancamento_id = le.lancamento_id
    group by le.etapa_id
  )
  select
    et.id, et.nome,
    coalesce(e.tomado, 0), coalesce(pe.pago, 0), coalesce(pe.a_pagar, 0),
    coalesce(pe.pago, 0) + coalesce(pe.a_pagar, 0) - coalesce(e.tomado, 0),
    coalesce(pe.parcelas, 0), coalesce(pe.parcelas_pagas, 0), pe.proximo
  from etapas et
  left join entradas e on e.etapa_id = et.id
  left join parcelas_da_etapa pe on pe.etapa_id = et.id
  order by et.nome
$function$;

revoke all on function public.fn_rel_emprestimos_por_contrato() from public, anon;
grant execute on function public.fn_rel_emprestimos_por_contrato() to authenticated;
