-- Aplicacoes: rendimento esperado pelo CDI na simulacao da posicao e
-- confirmacao com motivo para gravar fora do CDI (PR 4 do controle total,
-- 12/10/2026, frente E). As duas mudam o retorno/assinatura: drop e create.

drop function public.fn_simular_posicao_aplicacao(uuid, date, numeric);
drop function public.fn_salvar_posicao_aplicacao(uuid, date, numeric, numeric, numeric, numeric, text);

CREATE OR REPLACE FUNCTION public.fn_simular_posicao_aplicacao(p_aplicacao_id uuid, p_data date, p_saldo_liquido numeric)
 RETURNS TABLE(data_anterior date, saldo_anterior numeric, aplicado numeric, resgatado numeric, rendimento numeric, e_abertura boolean,
   rendimento_esperado numeric, fora_do_cdi boolean)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare v_conta uuid; v_etapa uuid; v_pct numeric;
  v_cdi_ate date := (select max(c.data) from public.cdi_diario c);
begin
  if not public.tem_permissao('financeiro.aplicacoes', 'ver') then
    raise exception 'Sem permissao para ver aplicacoes';
  end if;
  select a.conta_bancaria_id, a.centro_custo_id,
    case when a.indexador = 'cdi' then coalesce(a.taxa_percentual, 100) end into v_conta, v_etapa, v_pct
  from public.aplicacoes a where a.id = p_aplicacao_id;
  if v_conta is null or not public.fn_pode_ver_saldo(v_conta) then
    return;
  end if;

  return query
  with ant as (
    select x.data, x.saldo as saldo_liquido, x.ordem = 1 as gravada
    from (
      select p.data, p.saldo_liquido as saldo, 1 as ordem
      from public.aplicacao_posicoes p
      where p.aplicacao_id = p_aplicacao_id and p.excluido_em is null and p.data < p_data
      union all
      select ab.data, ab.saldo, 0
      from public.fn_aplicacao_abertura(p_aplicacao_id) ab
      where ab.data <= p_data
    ) x
    order by x.data desc, x.ordem desc
    limit 1
  ),
  fl as (
    select
      coalesce(sum(t.valor) filter (where t.conta_destino_id = v_conta), 0)::numeric as apl,
      coalesce(sum(t.valor + t.tarifa) filter (where t.conta_origem_id = v_conta), 0)::numeric as res
    from public.transferencias_contas t
    where t.centro_custo_id = v_etapa
      and v_conta in (t.conta_origem_id, t.conta_destino_id)
      and t.data_transferencia <= p_data
      and (not exists (select 1 from ant) or t.data_transferencia > (select ant.data from ant))
  ),
  -- Esperado pelo CDI (mesma conta do relatorio de aplicacoes): base ponderada
  -- pelo tempo x (fator do CDI diario no periodo - 1) x % contratado. Nulo sem
  -- posicao anterior, sem CDI diario cobrindo o periodo ou fora do CDI.
  esp as (
    select case
      when v_pct is null or ant.data is null or ant.data >= p_data or v_cdi_ate is null or v_cdi_ate < p_data - 5 then null
      else (
        ant.saldo_liquido + coalesce((
          select sum(
            case when t.conta_destino_id = v_conta then t.valor else -(t.valor + t.tarifa) end
            * (p_data - t.data_transferencia)::numeric / (p_data - ant.data))
          from public.transferencias_contas t
          where t.centro_custo_id = v_etapa
            and v_conta in (t.conta_origem_id, t.conta_destino_id)
            and t.data_transferencia > ant.data and t.data_transferencia <= p_data
        ), 0)
      ) * (
        select coalesce(exp(sum(ln(1 + c.taxa / 100))), 1) - 1
        from public.cdi_diario c where c.data >= ant.data and c.data < p_data
      ) * v_pct / 100
    end as valor
    from ant
  ),
  r as (
    select
      (select ant.data from ant) as d_ant,
      (select ant.saldo_liquido from ant)::numeric as s_ant,
      fl.apl, fl.res,
      (p_saldo_liquido - coalesce((select ant.saldo_liquido from ant), 0) - fl.apl + fl.res)::numeric as rend,
      coalesce((
        select p.e_abertura from public.aplicacao_posicoes p
        where p.aplicacao_id = p_aplicacao_id and p.data = p_data and p.excluido_em is null
      ), false) as abertura,
      round((select esp.valor from esp), 2) as esperado,
      coalesce((select ant.gravada from ant), false) as ant_gravada
    from fl
  )
  select r.d_ant, r.s_ant, r.apl, r.res, r.rend, r.abertura, r.esperado,
    -- Sem alerta contra a abertura virtual (saldo inicial de corte): o primeiro
    -- periodo e calibragem, nao rendimento de CDI.
    coalesce(r.ant_gravada and not r.abertura and (
      r.rend < 0
      or (r.esperado > 100 and (r.rend < r.esperado * 0.5 or r.rend > r.esperado * 1.5))
    ), false)
  from r;
end;
$function$;

CREATE OR REPLACE FUNCTION public.fn_salvar_posicao_aplicacao(p_aplicacao_id uuid, p_data date, p_saldo_liquido numeric, p_saldo_bruto numeric DEFAULT NULL::numeric, p_ir numeric DEFAULT NULL::numeric, p_iof numeric DEFAULT NULL::numeric, p_observacoes text DEFAULT NULL::text,
  p_confirmar boolean DEFAULT false, p_motivo text DEFAULT NULL::text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_conta uuid; v_id uuid; v_abertura date; v_obs text := nullif(btrim(p_observacoes), '');
  v_sim record;
  v_hoje date := (now() at time zone 'America/Rio_Branco')::date;
begin
  if not public.tem_permissao('financeiro.aplicacoes', 'editar') then
    raise exception 'Sem permissao para gravar posicao de aplicacao';
  end if;

  select a.conta_bancaria_id into v_conta
  from public.aplicacoes a where a.id = p_aplicacao_id for update;
  if v_conta is null then
    raise exception 'Aplicacao nao encontrada';
  end if;
  if not public.fn_pode_ver_saldo(v_conta) then
    raise exception 'Sem permissao para ver o saldo desta conta';
  end if;

  if p_data is null then raise exception 'Informe a data da posicao'; end if;
  if p_data > v_hoje then raise exception 'A posicao nao pode ter data futura'; end if;
  perform public.fn_conciliacao_exigir_data_aberta(v_conta, p_data);
  if p_saldo_liquido is null or p_saldo_liquido < 0 then
    raise exception 'Informe o saldo liquido da posicao';
  end if;
  if round(p_saldo_liquido, 2) <> p_saldo_liquido then
    raise exception 'Saldo liquido com mais de duas casas';
  end if;

  select p.data into v_abertura
  from public.aplicacao_posicoes p
  where p.aplicacao_id = p_aplicacao_id and p.e_abertura and p.excluido_em is null;
  if v_abertura is not null and p_data < v_abertura then
    raise exception 'A posicao nao pode ser anterior a abertura (%)', to_char(v_abertura, 'DD/MM/YYYY');
  end if;

  -- Rendimento negativo ou fora de 50%-150% do esperado pelo CDI: so grava com
  -- confirmacao e motivo, que fica nas observacoes da posicao. A linha antiga do
  -- motivo sai a cada gravacao (nao acumula e nao fica depois de corrigido).
  v_obs := nullif(btrim(regexp_replace(coalesce(v_obs, ''), '^(\[Fora do CDI\][^\n]*(\n|$))+', '')), '');
  select s.rendimento, s.rendimento_esperado, s.fora_do_cdi into v_sim
  from public.fn_simular_posicao_aplicacao(p_aplicacao_id, p_data, p_saldo_liquido) s;
  if coalesce(v_sim.fora_do_cdi, false) then
    if not coalesce(p_confirmar, false) then
      raise exception 'Posicao fora do CDI: rendimento de R$ % (esperado R$ %). Confirme com o motivo',
        public.fn_conciliacao_brl(v_sim.rendimento), coalesce(public.fn_conciliacao_brl(v_sim.rendimento_esperado), '-');
    end if;
    if nullif(btrim(p_motivo), '') is null then
      raise exception 'Informe o motivo para gravar a posicao fora do CDI';
    end if;
    v_obs := '[Fora do CDI] ' || btrim(p_motivo) || coalesce(E'\n' || v_obs, '');
  end if;

  select p.id into v_id
  from public.aplicacao_posicoes p
  where p.aplicacao_id = p_aplicacao_id and p.data = p_data and p.excluido_em is null;

  if v_id is null then
    insert into public.aplicacao_posicoes
      (aplicacao_id, data, saldo_liquido, saldo_bruto, ir, iof, observacoes)
    values
      (p_aplicacao_id, p_data, p_saldo_liquido, p_saldo_bruto, p_ir, p_iof, v_obs)
    returning id into v_id;
  else
    update public.aplicacao_posicoes
       set saldo_liquido = p_saldo_liquido, saldo_bruto = p_saldo_bruto, ir = p_ir, iof = p_iof,
           observacoes = v_obs
     where id = v_id;
  end if;

  perform public.fn_aplicacao_recalcular(p_aplicacao_id, p_data);
  return v_id;
end;
$function$;

revoke all on function public.fn_simular_posicao_aplicacao(uuid, date, numeric) from public, anon;
grant execute on function public.fn_simular_posicao_aplicacao(uuid, date, numeric) to authenticated;
revoke all on function public.fn_salvar_posicao_aplicacao(uuid, date, numeric, numeric, numeric, numeric, text, boolean, text) from public, anon;
grant execute on function public.fn_salvar_posicao_aplicacao(uuid, date, numeric, numeric, numeric, numeric, text, boolean, text) to authenticated;
