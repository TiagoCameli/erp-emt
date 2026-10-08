-- =============================================================
-- ROLLBACK de 20261007120000_saldo_inicial_por_aplicacao
--
-- Volta ao saldo inicial da subconta como UM numero. O saldo inicial das
-- subcontas fica com o valor que tinha (a soma das aplicacoes, que e o mesmo
-- numero de antes na Caixa e na BB 102.124-9), so deixa de ser derivado.
--
-- ANTES de rodar: o deploy tem que estar no codigo anterior (sem o drawer
-- "Saldo inicial por aplicacao" e sem a escolha de conta no cadastro da etapa),
-- senao as telas chamam funcao que nao existe mais.
--
-- O cadastro do BB Rende Facil sai junto, e so sai se nao tiver posicao
-- gravada: com posicao, o rollback aborta e a decisao e manual.
-- =============================================================

-- ---------- 1. o que a migration criou ----------
drop trigger if exists trg_aplicacao_soma_saldo_inicial on public.aplicacoes;
drop function if exists public.fn_aplicacao_soma_saldo_inicial();
drop function if exists public.fn_subconta_soma_saldo_inicial(uuid);
drop function if exists public.fn_saldo_inicial_da_subconta(uuid);
drop function if exists public.fn_salvar_saldo_inicial_subconta(uuid, date, jsonb);
drop function if exists public.fn_criar_etapa_de_investimento(uuid, text, numeric, uuid, text);
drop function if exists public.fn_vincular_aplicacao_da_etapa(uuid, uuid, text);
drop function if exists public.fn_aplicacoes_das_etapas();
drop function if exists public.fn_subconta_da_conta(uuid);
drop function if exists public.fn_aplicacao_padroes(text);

-- ---------- 2. o cadastro do BB Rende Facil ----------
do $rende$
declare v_id uuid;
begin
  select a.id into v_id
  from public.aplicacoes a
  join public.centros_custo e on e.id = a.centro_custo_id
  where e.nome = 'Banco do Brasil - Rende Fácil';
  if v_id is null then return; end if;
  if exists (select 1 from public.aplicacao_posicoes p where p.aplicacao_id = v_id) then
    raise exception 'O Rende Facil ja tem posicao gravada: decidir na mao antes do rollback';
  end if;
  delete from public.aplicacoes where id = v_id;
end $rende$;

-- ---------- 3. o motor e a aba voltam a 25/09 (sem a ancora) ----------
drop function public.fn_aba_aplicacoes(date, date);

create or replace function public.fn_aplicacao_sincronizar_posicao(p_posicao uuid)
returns void
language plpgsql
security definer
set search_path to ''
as $function$
declare
  c_juros constant uuid := 'ad676dc2-eb07-49ec-9005-ed85f98f9dbe';
  c_negativo constant uuid := 'd0157304-467a-4def-81fd-09660a0e02af';
  c_abertura constant uuid := '9feb495d-3d71-48b6-b509-2c798cb45e19';
  v_aplicacao uuid; v_data date; v_saldo numeric(14, 2); v_abertura boolean; v_excluida boolean;
  v_etapa uuid; v_etapa_nome text; v_conta uuid;
  v_data_ant date; v_saldo_ant numeric(14, 2);
  v_aplicado numeric(14, 2); v_resgatado numeric(14, 2); v_rend numeric(14, 2);
  v_valor numeric(14, 2); v_tipo text; v_categoria uuid; v_descricao text; v_mes date;
  v_lanc uuid; v_lanc_tipo text; v_lanc_cat uuid; v_lanc_valor numeric(14, 2);
  v_lanc_mes date; v_lanc_data date;
begin
  select p.aplicacao_id, p.data, p.saldo_liquido, p.e_abertura, p.excluido_em is not null
    into v_aplicacao, v_data, v_saldo, v_abertura, v_excluida
  from public.aplicacao_posicoes p where p.id = p_posicao;
  if v_aplicacao is null then
    raise exception 'Posicao nao encontrada';
  end if;

  select a.centro_custo_id, cc.nome, a.conta_bancaria_id
    into v_etapa, v_etapa_nome, v_conta
  from public.aplicacoes a join public.centros_custo cc on cc.id = a.centro_custo_id
  where a.id = v_aplicacao;

  select l.id, l.tipo, l.categoria_id, l.valor, l.mes_competencia, l.data_compra
    into v_lanc, v_lanc_tipo, v_lanc_cat, v_lanc_valor, v_lanc_mes, v_lanc_data
  from public.lancamentos l
  where l.origem = 'aplicacao' and l.origem_id = p_posicao;

  if v_lanc is not null and exists (
    select 1 from public.extrato_transacoes t
    join public.lancamento_parcelas lp on lp.id = t.parcela_id
    where lp.lancamento_id = v_lanc
  ) then
    raise exception 'O rendimento desta posicao esta conciliado com o extrato. Desfaca a conciliacao primeiro';
  end if;

  if not v_excluida then
    select p.data, p.saldo_liquido into v_data_ant, v_saldo_ant
    from public.aplicacao_posicoes p
    where p.aplicacao_id = v_aplicacao and p.excluido_em is null and p.data < v_data
    order by p.data desc limit 1;

    -- Resgate sai da subconta com a tarifa: e isso que o saldo dela perde.
    select
      coalesce(sum(t.valor) filter (where t.conta_destino_id = v_conta), 0),
      coalesce(sum(t.valor + t.tarifa) filter (where t.conta_origem_id = v_conta), 0)
      into v_aplicado, v_resgatado
    from public.transferencias_contas t
    where t.centro_custo_id = v_etapa
      and v_conta in (t.conta_origem_id, t.conta_destino_id)
      and t.data_transferencia <= v_data
      and (v_data_ant is null or t.data_transferencia > v_data_ant);

    v_rend := v_saldo - coalesce(v_saldo_ant, 0) - v_aplicado + v_resgatado;
  else
    v_rend := 0;
  end if;

  v_valor := abs(v_rend);
  v_mes := date_trunc('month', v_data)::date;
  if v_abertura then
    v_categoria := c_abertura;
    v_tipo := case when v_rend >= 0 then 'a_receber' else 'a_pagar' end;
    v_descricao := 'Ajuste de abertura · ' || v_etapa_nome;
  elsif v_rend >= 0 then
    v_categoria := c_juros;
    v_tipo := 'a_receber';
    v_descricao := 'Rendimento · ' || v_etapa_nome;
  else
    v_categoria := c_negativo;
    v_tipo := 'a_pagar';
    v_descricao := 'Rendimento negativo · ' || v_etapa_nome;
  end if;

  -- Excluida, ou rendimento zero: nao ha lancamento.
  if v_valor = 0 then
    if v_lanc is not null then
      perform public.fn_exigir_competencia_aberta(v_lanc_mes, 'aplicacao_posicao', p_posicao);
      delete from public.lancamentos where id = v_lanc;
    end if;
    return;
  end if;

  if v_lanc is not null then
    if v_lanc_tipo = v_tipo and v_lanc_cat = v_categoria
       and v_lanc_valor = v_valor and v_lanc_data = v_data then
      return;  -- nada mudou: nao gera trilha de auditoria a toa
    end if;
    perform public.fn_exigir_competencia_aberta(v_lanc_mes, 'aplicacao_posicao', p_posicao);
    perform public.fn_exigir_competencia_aberta(v_mes, 'aplicacao_posicao', p_posicao);

    update public.lancamentos
       set tipo = v_tipo, categoria_id = v_categoria, valor = v_valor,
           descricao = v_descricao, data_compra = v_data, data_vencimento = v_data,
           mes_competencia = v_mes, status = 'pago', centro_custo_id = v_etapa
     where id = v_lanc;
    update public.lancamento_parcelas
       set valor = v_valor, data_vencimento = v_data, data_pagamento = v_data,
           conta_bancaria_id = v_conta, status = 'pago'
     where lancamento_id = v_lanc;
    delete from public.lancamento_rateios where lancamento_id = v_lanc;
    insert into public.lancamento_rateios (lancamento_id, centro_custo_id, valor, categoria_id)
    values (v_lanc, v_etapa, v_valor, v_categoria);
    return;
  end if;

  perform public.fn_exigir_competencia_aberta(v_mes, 'aplicacao_posicao', p_posicao);

  insert into public.lancamentos (
    tipo, origem, origem_id, centro_custo_id, categoria_id, descricao, valor, status,
    data_compra, mes_competencia, data_vencimento, observacoes
  ) values (
    v_tipo, 'aplicacao', p_posicao, v_etapa, v_categoria, v_descricao, v_valor, 'pago',
    v_data, v_mes, v_data,
    'Gerado pela posicao de ' || to_char(v_data, 'DD/MM/YYYY')
      || '. Nao se edita aqui: regrave ou exclua a posicao em Financeiro > Aplicacoes.'
  ) returning id into v_lanc;

  insert into public.lancamento_parcelas (
    lancamento_id, numero_parcela, valor, data_vencimento, status,
    conta_bancaria_id, data_pagamento, pago_por, pago_em
  ) values (
    v_lanc, 1, v_valor, v_data, 'pago', v_conta, v_data, (select auth.uid()), now()
  );

  insert into public.lancamento_rateios (lancamento_id, centro_custo_id, valor, categoria_id)
  values (v_lanc, v_etapa, v_valor, v_categoria);
end;
$function$;

revoke all on function public.fn_aplicacao_sincronizar_posicao(uuid) from public, anon, authenticated;

create or replace function public.fn_simular_posicao_aplicacao(
  p_aplicacao_id uuid, p_data date, p_saldo_liquido numeric
)
returns table(data_anterior date, saldo_anterior numeric, aplicado numeric, resgatado numeric, rendimento numeric, e_abertura boolean)
language plpgsql
stable
security definer
set search_path to ''
as $function$
declare v_conta uuid; v_etapa uuid;
begin
  if not public.tem_permissao('financeiro.aplicacoes', 'ver') then
    raise exception 'Sem permissao para ver aplicacoes';
  end if;
  select a.conta_bancaria_id, a.centro_custo_id into v_conta, v_etapa
  from public.aplicacoes a where a.id = p_aplicacao_id;
  if v_conta is null or not public.fn_pode_ver_saldo(v_conta) then
    return;
  end if;

  return query
  with ant as (
    select p.data, p.saldo_liquido from public.aplicacao_posicoes p
    where p.aplicacao_id = p_aplicacao_id and p.excluido_em is null and p.data < p_data
    order by p.data desc limit 1
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
  )
  select
    (select ant.data from ant),
    (select ant.saldo_liquido from ant)::numeric,
    fl.apl, fl.res,
    (p_saldo_liquido - coalesce((select ant.saldo_liquido from ant), 0) - fl.apl + fl.res)::numeric,
    coalesce((
      select p.e_abertura from public.aplicacao_posicoes p
      where p.aplicacao_id = p_aplicacao_id and p.data = p_data and p.excluido_em is null
    ), false)
  from fl;
end;
$function$;

revoke all on function public.fn_simular_posicao_aplicacao(uuid, date, numeric) from public, anon;
grant execute on function public.fn_simular_posicao_aplicacao(uuid, date, numeric) to authenticated;

create or replace function public.fn_aba_aplicacoes(p_inicio date default null, p_fim date default null)
returns table(
  aplicacao_id uuid, mes date, posicao_inicial numeric, aplicado numeric, resgatado numeric,
  rendimento numeric, ajuste_abertura numeric, posicao_final numeric,
  rendimento_pct numeric, cdi_pct numeric, pct_cdi numeric, ultima_posicao date
)
language plpgsql
stable
security definer
set search_path to ''
as $function$
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
  pos as (
    select p.aplicacao_id as apl_id, p.data, p.saldo_liquido, p.e_abertura,
      lag(p.data) over w as data_ant, lag(p.saldo_liquido) over w as saldo_ant
    from public.aplicacao_posicoes p
    join apl on apl.id = p.aplicacao_id
    where p.excluido_em is null
    window w as (partition by p.aplicacao_id order by p.data)
  ),
  pos_calc as (
    select pos.*, f.ap, f.rs, f.base,
      pos.saldo_liquido - coalesce(pos.saldo_ant, 0) - f.ap + f.rs as rend,
      case
        when pos.data_ant is null then null
        when v_cdi_ate is null or v_cdi_ate < pos.data - 5 then
          -- diaria nao cobre: 4391 so se o periodo for o mes cheio
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
      (select case when count(*) = 0 or bool_or(pc.base <= 0 or pc.data_ant is null
                     or 1 + pc.rend / nullif(pc.base, 0) <= 0) then null
                   else exp(sum(ln(1 + pc.rend / pc.base))) - 1 end
        from pos_calc pc
        where pc.apl_id = ms.apl_id and pc.data between ms.mes and ms.fim and not pc.e_abertura) as rent,
      (select case when count(*) = 0 or bool_or(pc.cdi_per is null) then null
                   else exp(sum(ln(1 + pc.cdi_per))) - 1 end
        from pos_calc pc
        where pc.apl_id = ms.apl_id and pc.data between ms.mes and ms.fim and not pc.e_abertura) as cdi,
      ult.data as ult_data,
      coalesce(ult.saldo_liquido, 0) + (
        select coalesce(sum(m.ap - m.rs), 0) from mov m
        where m.apl_id = ms.apl_id and m.data <= ms.fim
          and (ult.data is null or m.data > ult.data)
      ) as final
    from meses ms
    left join lateral (
      select p.data, p.saldo_liquido from pos p
      where p.apl_id = ms.apl_id and p.data <= ms.fim
      order by p.data desc limit 1
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
    ci.ult_data
  from com_inicial ci
  where p_inicio is null or ci.mes >= date_trunc('month', p_inicio)::date
  order by ci.apl_id, ci.mes;
end;
$function$;

revoke all on function public.fn_aba_aplicacoes(date, date) from public, anon;
grant execute on function public.fn_aba_aplicacoes(date, date) to authenticated;


drop function if exists public.fn_aplicacao_abertura(uuid);

-- ---------- 4. a coluna ----------
alter table public.aplicacoes drop column saldo_inicial;
grant select on table public.aplicacoes to authenticated;

-- Os rendimentos refeitos sem a ancora (na Caixa da o mesmo valor: a ancora
-- era exatamente o que as transferencias ja somavam).
do $refaz$
declare v_apl uuid;
begin
  for v_apl in select a.id from public.aplicacoes a loop
    perform public.fn_aplicacao_recalcular(v_apl, '2000-01-01');
  end loop;
end $refaz$;
