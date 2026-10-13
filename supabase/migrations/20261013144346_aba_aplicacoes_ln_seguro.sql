-- Aplicacoes: a aba nao cai quando uma posicao rende -100% ou mais.
--
-- 13/10/2026: a conciliacao casou uma aplicacao de R$ 114.727,86 numa Rende
-- Facil do BB cuja posicao do extrato nao subiu. O rendimento do periodo ficou
-- -114.727,86 sobre base de 43 mil (fator 1 + rend/base = -1,64) e a tela
-- inteira deu erro: "cannot take logarithm of a negative number".
--
-- O CASE ja devolvia null nesse caso, mas no Postgres o CASE nao impede o
-- calculo de um agregado que esta dentro dele: sum(ln(...)) roda para todas as
-- linhas antes. A trava vai para dentro do ln (fator <= 0 ou base zero viram
-- null e o sum ignora); o bool_or de fora continua anulando a rentabilidade
-- do mes. Mesmo cuidado no CDI. Resto da funcao igual ao que esta no ar.

create or replace function public.fn_aba_aplicacoes(p_inicio date DEFAULT NULL::date, p_fim date DEFAULT NULL::date)
 RETURNS TABLE(aplicacao_id uuid, mes date, posicao_inicial numeric, aplicado numeric, resgatado numeric, rendimento numeric, ajuste_abertura numeric, posicao_final numeric, rendimento_pct numeric, cdi_pct numeric, pct_cdi numeric, ultima_posicao date, saldo_inicial numeric)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_fim date := date_trunc('month', coalesce(p_fim, (now() at time zone 'America/Rio_Branco')::date))::date;
  v_cdi_ate date := (select max(c.data) from public.cdi_diario c);
begin
  if not public.tem_permissao('financeiro.aplicacoes', 'ver') then
    raise exception 'Sem permissao para ver aplicacoes';
  end if;

  return query
  with apl as (
    select a.id, a.centro_custo_id, a.conta_bancaria_id
    from public.aplicacoes a
    where public.fn_pode_ver_saldo(a.conta_bancaria_id)
  ),
  mov as (
    select apl.id as apl_id, t.data_transferencia as data,
      case when t.conta_destino_id = apl.conta_bancaria_id then t.valor else 0 end::numeric as ap,
      case when t.conta_origem_id = apl.conta_bancaria_id then t.valor + t.tarifa else 0 end::numeric as rs
    from apl
    join public.transferencias_contas t
      on t.centro_custo_id = apl.centro_custo_id
     and apl.conta_bancaria_id in (t.conta_origem_id, t.conta_destino_id)
  ),
  -- O saldo inicial na data de corte, e o quanto ele acrescenta ao que as
  -- transferencias ate o corte ja somavam (zero quando o historico esta todo
  -- lancado, como na Caixa).
  abertura as (
    select apl.id as apl_id, ab.data, ab.saldo,
      ab.saldo - coalesce((
        select sum(m.ap - m.rs) from mov m where m.apl_id = apl.id and m.data <= ab.data
      ), 0) as acrescimo
    from apl
    cross join lateral public.fn_aplicacao_abertura(apl.id) ab
  ),
  ancoras as (
    select p.aplicacao_id as apl_id, p.data, p.saldo_liquido, p.e_abertura, false as virtual
    from public.aplicacao_posicoes p
    join apl on apl.id = p.aplicacao_id
    where p.excluido_em is null
    union all
    select ab.apl_id, ab.data, ab.saldo, false, true
    from abertura ab
  ),
  pos as (
    select an.apl_id, an.data, an.saldo_liquido, an.e_abertura, an.virtual,
      lag(an.data) over w as data_ant, lag(an.saldo_liquido) over w as saldo_ant
    from ancoras an
    window w as (partition by an.apl_id order by an.data, an.virtual desc)
  ),
  pos_calc as (
    select pos.*, f.ap, f.rs, f.base,
      pos.saldo_liquido - coalesce(pos.saldo_ant, 0) - f.ap + f.rs as rend,
      case
        when pos.data_ant is null then null
        when v_cdi_ate is null or v_cdi_ate < pos.data - 5 then
          case when pos.data_ant = (date_trunc('month', pos.data) - interval '1 day')::date
                and pos.data = (date_trunc('month', pos.data) + interval '1 month' - interval '1 day')::date
               then (select cm.taxa / 100 from public.cdi_mensal cm
                     where cm.mes = date_trunc('month', pos.data)::date and not cm.parcial)
          end
        else (
          select exp(sum(ln(1 + c.taxa / 100))) - 1
          from public.cdi_diario c
          where c.data >= pos.data_ant and c.data < pos.data
        )
      end as cdi_per
    from pos
    cross join lateral (
      select
        coalesce(sum(m.ap), 0) as ap,
        coalesce(sum(m.rs), 0) as rs,
        coalesce(pos.saldo_ant, 0) + coalesce(sum(
          (m.ap - m.rs) * (pos.data - m.data)::numeric / nullif(pos.data - pos.data_ant, 0)
        ), 0) as base
      from mov m
      where m.apl_id = pos.apl_id
        and m.data <= pos.data
        and (pos.data_ant is null or m.data > pos.data_ant)
    ) f
    where not pos.virtual
  ),
  inicio as (
    select apl.id as apl_id, date_trunc('month', least(
      (select min(m.data) from mov m where m.apl_id = apl.id),
      (select min(p.data) from pos p where p.apl_id = apl.id)
    ))::date as m0
    from apl
  ),
  meses as (
    select i.apl_id, g::date as mes,
      (g + interval '1 month' - interval '1 day')::date as fim
    from inicio i
    cross join lateral generate_series(i.m0, v_fim, interval '1 month') g
    where i.m0 is not null
  ),
  por_mes as (
    select ms.apl_id, ms.mes,
      (select coalesce(sum(m.ap), 0) from mov m
        where m.apl_id = ms.apl_id and m.data between ms.mes and ms.fim) as ap,
      (select coalesce(sum(m.rs), 0) from mov m
        where m.apl_id = ms.apl_id and m.data between ms.mes and ms.fim) as rs,
      (select sum(pc.rend) from pos_calc pc
        where pc.apl_id = ms.apl_id and pc.data between ms.mes and ms.fim and not pc.e_abertura) as rend,
      (select sum(pc.rend) from pos_calc pc
        where pc.apl_id = ms.apl_id and pc.data between ms.mes and ms.fim and pc.e_abertura) as ajuste,
      (select coalesce(sum(ab.acrescimo), 0) from abertura ab
        where ab.apl_id = ms.apl_id and ab.data between ms.mes and ms.fim) as abert,
      (select case when count(*) = 0 or bool_or(pc.base <= 0 or pc.data_ant is null
                     or 1 + pc.rend / nullif(pc.base, 0) <= 0) then null
                   else exp(sum(ln(case when 1 + pc.rend / nullif(pc.base, 0) > 0
                                      then 1 + pc.rend / nullif(pc.base, 0) end))) - 1 end
        from pos_calc pc
        where pc.apl_id = ms.apl_id and pc.data between ms.mes and ms.fim and not pc.e_abertura) as rent,
      (select case when count(*) = 0 or bool_or(pc.cdi_per is null) then null
                   else exp(sum(ln(case when 1 + pc.cdi_per > 0 then 1 + pc.cdi_per end))) - 1 end
        from pos_calc pc
        where pc.apl_id = ms.apl_id and pc.data between ms.mes and ms.fim and not pc.e_abertura) as cdi,
      -- "Ultima posicao" e a do EXTRATO: o saldo inicial nao conta, senao
      -- esconderia o aviso de posicao velha.
      (select max(p.data) from pos p
        where p.apl_id = ms.apl_id and p.data <= ms.fim and not p.virtual) as ult_data,
      coalesce(ult.saldo_liquido, 0) + (
        select coalesce(sum(m.ap - m.rs), 0) from mov m
        where m.apl_id = ms.apl_id and m.data <= ms.fim
          and (ult.data is null or m.data > ult.data)
      ) as final
    from meses ms
    left join lateral (
      select p.data, p.saldo_liquido from pos p
      where p.apl_id = ms.apl_id and p.data <= ms.fim
      order by p.data desc, p.virtual asc limit 1
    ) ult on true
  ),
  com_inicial as (
    select pm.*,
      coalesce(lag(pm.final) over (partition by pm.apl_id order by pm.mes), 0) as inicial
    from por_mes pm
  )
  select
    ci.apl_id, ci.mes, round(ci.inicial, 2), round(ci.ap, 2), round(ci.rs, 2),
    round(ci.rend, 2), round(ci.ajuste, 2), round(ci.final, 2),
    round(ci.rent * 100, 6), round(ci.cdi * 100, 6),
    round(ci.rent / nullif(ci.cdi, 0) * 100, 4),
    ci.ult_data,
    round(ci.abert, 2)
  from com_inicial ci
  where p_inicio is null or ci.mes >= date_trunc('month', p_inicio)::date
  order by ci.apl_id, ci.mes;
end;
$function$;
