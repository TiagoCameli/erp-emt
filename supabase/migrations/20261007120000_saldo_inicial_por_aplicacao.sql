-- =============================================================
-- Saldo inicial da subconta DIVIDIDO por aplicacao, e o BB Rende Facil
-- cadastrado como aplicacao
--
-- PEDIDO DO TIAGO (07/10/2026): "nas subcontas eu quero poder colocar o saldo
-- inicial da conta dividido em cada um dos tipos de aplicacoes de cada conta,
-- tambem tem que adicionar a aplicacao do bb rende facil no relatorio das
-- aplicacoes".
--
-- ============================================================
-- O PROBLEMA
-- ============================================================
-- O saldo inicial da subconta era UM numero (contas_bancarias.saldo_inicial).
-- A aba Aplicacoes calcula a posicao de cada aplicacao pelas transferencias, e
-- so funcionava na Caixa porque la o historico inteiro esta lancado desde
-- abril (4.263.212,36 do CDB + 266.197,08 do Fundo = os 4.529.409,44 do saldo
-- inicial, ao centavo). Na BB 102.124-9 o saldo inicial (178.326,66 em 31/08)
-- nao tem historico por tras: o Rende Facil apareceria com -8.103,20, so as
-- transferencias de setembro. E ele nem aparecia, porque nao tinha cadastro.
--
-- ============================================================
-- A REGRA
-- ============================================================
-- aplicacoes.saldo_inicial: quanto desta aplicacao estava na subconta na data
-- de corte DELA (contas_bancarias.saldo_inicial_data da subconta).
--
--   saldo_inicial da subconta = soma do saldo_inicial das aplicacoes dela
--
-- Derivado, entao e trigger (trg_aplicacao_soma_saldo_inicial), nao parametro.
-- Assim o saldo da subconta e a soma das aplicacoes nunca divergem.
--
-- No calculo da aplicacao o saldo inicial vira uma ANCORA na data de corte,
-- como uma posicao do extrato que nao gera lancamento: o rendimento da primeira
-- posicao depois do corte e medido contra ela, e o movimento anterior ao corte
-- (que ja esta dentro do saldo inicial) fica so como historico mes a mes. Na
-- Caixa a ancora e exatamente o que as transferencias ja somavam, entao nada
-- muda la: a migration confere.
--
-- Empate na mesma data: a ancora vem ANTES da posicao real do dia (a posicao
-- de quem mediu no extrato e a mais nova).
--
-- fn_aba_aplicacoes ganha a coluna saldo_inicial: no mes do corte, o quanto o
-- saldo inicial acrescenta ao que as transferencias anteriores ja somavam
-- (zero na Caixa, 178.326,66 no Rende Facil). Com ela a identidade continua
-- fechando: final = inicial + aplicado - resgatado + rendimento + ajuste +
-- saldo_inicial.
--
-- Rollback: 20261007120000_saldo_inicial_por_aplicacao.rollback.sql
-- =============================================================

-- ---------- 1. a coluna ----------
alter table public.aplicacoes
  add column saldo_inicial numeric(14, 2) not null default 0
  constraint aplicacoes_saldo_inicial_nao_negativo check (saldo_inicial >= 0);

comment on column public.aplicacoes.saldo_inicial is
  'Parte desta aplicacao no saldo inicial da subconta, na data de corte da subconta. A soma das aplicacoes E o saldo_inicial da subconta (trigger).';

-- E saldo: o authenticated nao le direto (mesma regra de
-- contas_bancarias.saldo_inicial, 27/08/2026). Sai por fn_saldo_inicial_da_subconta,
-- filtrada por fn_pode_ver_saldo. Grant de tabela nao se reduz por coluna:
-- revoga a tabela e devolve coluna a coluna.
revoke select on table public.aplicacoes from authenticated;
grant select (
  id, centro_custo_id, conta_bancaria_id, produto, indexador, taxa_percentual,
  liquidez, liquidez_dias, carencia_ate, vencimento, tipo_ir, ativa, observacoes,
  created_at, updated_at, created_by
) on public.aplicacoes to authenticated;

-- ---------- 2. a abertura da Caixa, ao centavo do que ja estava ----------
-- O saldo inicial de cada aplicacao da Caixa e o que as transferencias dela
-- somavam ate o corte. Aborta se a soma nao for o saldo inicial da subconta.
do $caixa$
declare
  v_sub public.contas_bancarias;
  v_soma numeric(14, 2);
begin
  update public.aplicacoes a
     set saldo_inicial = coalesce((
       select sum(case when t.conta_destino_id = a.conta_bancaria_id
                       then t.valor else -(t.valor + t.tarifa) end)
       from public.transferencias_contas t
       join public.contas_bancarias s on s.id = a.conta_bancaria_id
       where t.centro_custo_id = a.centro_custo_id
         and a.conta_bancaria_id in (t.conta_origem_id, t.conta_destino_id)
         and t.data_transferencia <= s.saldo_inicial_data
     ), 0);

  for v_sub in
    select s.* from public.contas_bancarias s
    where exists (select 1 from public.aplicacoes a where a.conta_bancaria_id = s.id)
  loop
    select sum(a.saldo_inicial) into v_soma
    from public.aplicacoes a where a.conta_bancaria_id = v_sub.id;
    if v_soma <> v_sub.saldo_inicial then
      raise exception 'As aplicacoes de % somam R$ % no corte e o saldo inicial e R$ %',
        v_sub.nome, v_soma, v_sub.saldo_inicial;
    end if;
  end loop;
end $caixa$;

-- ---------- 3. a subconta passa a ser a soma ----------
create function public.fn_subconta_soma_saldo_inicial(p_conta uuid)
returns void
language sql
security definer
set search_path to ''
as $function$
  update public.contas_bancarias c
     set saldo_inicial = x.soma
    from (
      select coalesce(sum(a.saldo_inicial), 0) as soma
      from public.aplicacoes a where a.conta_bancaria_id = p_conta
    ) x
   where c.id = p_conta and c.saldo_inicial is distinct from x.soma;
$function$;

create function public.fn_aplicacao_soma_saldo_inicial()
returns trigger
language plpgsql
security definer
set search_path to ''
as $function$
begin
  if tg_op in ('UPDATE', 'DELETE') then
    perform public.fn_subconta_soma_saldo_inicial(old.conta_bancaria_id);
  end if;
  if tg_op in ('INSERT', 'UPDATE') then
    perform public.fn_subconta_soma_saldo_inicial(new.conta_bancaria_id);
  end if;
  return null;
end $function$;

revoke all on function public.fn_subconta_soma_saldo_inicial(uuid) from public, anon, authenticated;
revoke all on function public.fn_aplicacao_soma_saldo_inicial() from public, anon, authenticated;

create trigger trg_aplicacao_soma_saldo_inicial
  after insert or delete or update of saldo_inicial, conta_bancaria_id on public.aplicacoes
  for each row execute function public.fn_aplicacao_soma_saldo_inicial();

-- ---------- 4. a ancora ----------
-- A data de corte da subconta e o saldo inicial da aplicacao. Sem data de corte
-- nao ha ancora (a subconta soma tudo, e a aplicacao tambem).
create function public.fn_aplicacao_abertura(p_aplicacao uuid)
returns table(data date, saldo numeric)
language sql
stable security definer
set search_path to ''
as $function$
  select s.saldo_inicial_data, a.saldo_inicial
  from public.aplicacoes a
  join public.contas_bancarias s on s.id = a.conta_bancaria_id
  where a.id = p_aplicacao and s.saldo_inicial_data is not null;
$function$;

revoke all on function public.fn_aplicacao_abertura(uuid) from public, anon, authenticated;

-- ---------- 5. o motor do rendimento usa a ancora ----------
-- Igual a versao viva, so muda a busca da posicao anterior.
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
    -- A anterior: a posicao real mais recente antes desta, ou o saldo inicial
    -- na data de corte, o que vier depois. Empate: a posicao real ganha.
    select x.data, x.saldo into v_data_ant, v_saldo_ant
    from (
      select p.data, p.saldo_liquido as saldo, 1 as ordem
      from public.aplicacao_posicoes p
      where p.aplicacao_id = v_aplicacao and p.excluido_em is null and p.data < v_data
      union all
      select ab.data, ab.saldo, 0
      from public.fn_aplicacao_abertura(v_aplicacao) ab
      where ab.data <= v_data
    ) x
    order by x.data desc, x.ordem desc
    limit 1;

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
      return;
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

-- A simulacao do formulario de posicao: mesma ancora, mesma conta.
create or replace function public.fn_simular_posicao_aplicacao(p_aplicacao_id uuid, p_data date, p_saldo_liquido numeric)
 returns table(data_anterior date, saldo_anterior numeric, aplicado numeric, resgatado numeric, rendimento numeric, e_abertura boolean)
 language plpgsql
 stable security definer
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
    select x.data, x.saldo as saldo_liquido
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

-- ---------- 6. a aba, com a coluna saldo_inicial ----------
-- Tipo de retorno muda: DROP + CREATE (CREATE OR REPLACE recusa).
drop function public.fn_aba_aplicacoes(date, date);

create function public.fn_aba_aplicacoes(p_inicio date default null, p_fim date default null)
 returns table(
   aplicacao_id uuid, mes date, posicao_inicial numeric, aplicado numeric, resgatado numeric,
   rendimento numeric, ajuste_abertura numeric, posicao_final numeric, rendimento_pct numeric,
   cdi_pct numeric, pct_cdi numeric, ultima_posicao date, saldo_inicial numeric
 )
 language plpgsql
 stable security definer
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
                   else exp(sum(ln(1 + pc.rend / pc.base))) - 1 end
        from pos_calc pc
        where pc.apl_id = ms.apl_id and pc.data between ms.mes and ms.fim and not pc.e_abertura) as rent,
      (select case when count(*) = 0 or bool_or(pc.cdi_per is null) then null
                   else exp(sum(ln(1 + pc.cdi_per))) - 1 end
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

revoke all on function public.fn_aba_aplicacoes(date, date) from public, anon;
grant execute on function public.fn_aba_aplicacoes(date, date) to authenticated;

-- ---------- 7. ler e gravar o saldo inicial por aplicacao ----------
create function public.fn_saldo_inicial_da_subconta(p_subconta uuid)
returns table(aplicacao_id uuid, nome text, produto text, ativa boolean, saldo_inicial numeric)
language sql
stable security definer
set search_path to ''
as $function$
  select a.id, cc.nome, a.produto, a.ativa, a.saldo_inicial
  from public.aplicacoes a
  join public.centros_custo cc on cc.id = a.centro_custo_id
  where a.conta_bancaria_id = p_subconta
    and (select public.tem_permissao('financeiro.contas-bancarias', 'ver'))
    and public.fn_pode_ver_saldo(p_subconta)
  order by cc.nome;
$function$;

revoke all on function public.fn_saldo_inicial_da_subconta(uuid) from public, anon;
grant execute on function public.fn_saldo_inicial_da_subconta(uuid) to authenticated;

-- p_saldos: [{"aplicacaoId": uuid, "valor": numero}], uma entrada por
-- aplicacao da subconta, nem mais nem menos.
create function public.fn_salvar_saldo_inicial_subconta(p_subconta uuid, p_data date, p_saldos jsonb)
returns void
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_sub public.contas_bancarias;
  v_hoje date := (now() at time zone 'America/Rio_Branco')::date;
  v_desde date;
  v_apl uuid;
begin
  if not public.tem_permissao('financeiro.contas-bancarias', 'editar') then
    raise exception 'Sem permissao para editar contas bancarias';
  end if;

  select * into v_sub from public.contas_bancarias where id = p_subconta for update;
  if v_sub.id is null or v_sub.tipo <> 'investimento' then
    raise exception 'Escolha uma subconta de investimentos';
  end if;
  if not public.fn_pode_ver_saldo(p_subconta) then
    raise exception 'Sem permissao para ver o saldo desta conta';
  end if;
  if p_data is null then
    raise exception 'Informe a data do extrato de onde o saldo inicial foi lido';
  end if;
  if p_data > v_hoje then
    raise exception 'A data do saldo inicial nao pode ser futura';
  end if;
  if jsonb_typeof(p_saldos) is distinct from 'array' then
    raise exception 'Saldos invalidos';
  end if;

  if exists (
    select 1 from jsonb_array_elements(p_saldos) e
    where jsonb_typeof(e->'valor') is distinct from 'number'
       or (e->>'valor')::numeric < 0
       or round((e->>'valor')::numeric, 2) <> (e->>'valor')::numeric
  ) then
    raise exception 'Cada saldo precisa ser um valor maior ou igual a zero, com ate duas casas';
  end if;

  -- Toda aplicacao da subconta, uma vez cada, e nenhuma de fora.
  if (select count(*) from jsonb_array_elements(p_saldos))
       <> (select count(distinct e->>'aplicacaoId') from jsonb_array_elements(p_saldos) e)
     or exists (
       select 1 from jsonb_array_elements(p_saldos) e
       where not exists (
         select 1 from public.aplicacoes a
         where a.id::text = e->>'aplicacaoId' and a.conta_bancaria_id = p_subconta
       )
     )
     or exists (
       select 1 from public.aplicacoes a
       where a.conta_bancaria_id = p_subconta
         and not exists (
           select 1 from jsonb_array_elements(p_saldos) e where e->>'aplicacaoId' = a.id::text
         )
     ) then
    raise exception 'Informe o saldo de cada aplicacao desta subconta, uma vez cada';
  end if;

  if not exists (select 1 from public.aplicacoes a where a.conta_bancaria_id = p_subconta) then
    raise exception 'Esta subconta nao tem aplicacao cadastrada para dividir o saldo';
  end if;

  update public.aplicacoes a
     set saldo_inicial = (e->>'valor')::numeric
    from jsonb_array_elements(p_saldos) e
   where a.id::text = e->>'aplicacaoId'
     and a.saldo_inicial is distinct from (e->>'valor')::numeric;

  update public.contas_bancarias
     set saldo_inicial_data = p_data
   where id = p_subconta and saldo_inicial_data is distinct from p_data;

  -- As posicoes a partir do corte (o antigo ou o novo) refazem o rendimento.
  v_desde := least(coalesce(v_sub.saldo_inicial_data, p_data), p_data);
  for v_apl in select a.id from public.aplicacoes a where a.conta_bancaria_id = p_subconta loop
    perform public.fn_aplicacao_recalcular(v_apl, v_desde);
  end loop;
end;
$function$;

revoke all on function public.fn_salvar_saldo_inicial_subconta(uuid, date, jsonb) from public, anon;
grant execute on function public.fn_salvar_saldo_inicial_subconta(uuid, date, jsonb) to authenticated;

-- ---------- 8. o BB Rende Facil vira aplicacao ----------
-- A etapa ja existe (a regra de conciliacao "BB Rende Facil" lanca as
-- transferencias com ela desde 05/10). Faltava o cadastro, sem o qual a aba nao
-- a mostra. Aplicacao automatica do BB, liquidez diaria, IR regressivo de CDB;
-- a taxa varia por faixa de saldo, entao fica sem taxa.
-- O saldo inicial dela e o da subconta inteira (e a unica aplicacao la).
do $rende$
declare
  v_etapa uuid;
  v_sub public.contas_bancarias;
  v_saldo_antes numeric(14, 2);
begin
  select e.id into v_etapa
  from public.centros_custo e
  join public.centros_custo raiz on raiz.id = e.pai_id
  where raiz.tipo = 'investimento' and e.nome = 'Banco do Brasil - Rende Fácil';

  select s.* into v_sub
  from public.contas_bancarias s
  join public.contas_bancarias c on c.id = s.conta_pai_id
  where c.nome = 'BANCO DO BRASIL 102.124-9';

  if v_etapa is null or v_sub.id is null then
    raise exception 'Faltou a etapa do Rende Facil (%) ou a subconta da BB 102.124-9 (%)', v_etapa, v_sub.id;
  end if;
  if exists (select 1 from public.aplicacoes a where a.conta_bancaria_id = v_sub.id) then
    raise exception 'A subconta da BB 102.124-9 ja tem aplicacao: conferir antes de dividir o saldo';
  end if;
  if exists (
    select 1 from public.transferencias_contas t
    where t.centro_custo_id = v_etapa and t.data_transferencia <= v_sub.saldo_inicial_data
  ) then
    raise exception 'Ha transferencia do Rende Facil antes do corte: o saldo inicial nao e so a abertura';
  end if;

  v_saldo_antes := public.fn_saldo_conta(v_sub.id);

  insert into public.aplicacoes (
    centro_custo_id, conta_bancaria_id, produto, indexador, taxa_percentual,
    liquidez, tipo_ir, ativa, saldo_inicial, observacoes
  ) values (
    v_etapa, v_sub.id, 'cdb', 'cdi', null, 'diaria', 'regressivo', true, v_sub.saldo_inicial,
    'Aplicacao automatica do BB: aplica o saldo da conta corrente e resgata quando falta. A taxa varia por faixa de saldo.'
  );

  if public.fn_saldo_conta(v_sub.id) <> v_saldo_antes then
    raise exception 'O saldo da subconta mudou de R$ % para R$ %', v_saldo_antes, public.fn_saldo_conta(v_sub.id);
  end if;
end $rende$;

-- ---------- 9. nada mudou de dinheiro ----------
-- Os lancamentos de rendimento existentes refeitos com a ancora: tem que dar o
-- mesmo valor, o mesmo tipo e a mesma categoria.
do $confere$
declare
  v_antes text;
  v_depois text;
  v_apl uuid;
begin
  select string_agg(l.id || ':' || l.tipo || ':' || l.categoria_id || ':' || l.valor, ',' order by l.id)
    into v_antes
  from public.lancamentos l where l.origem = 'aplicacao';

  for v_apl in select a.id from public.aplicacoes a loop
    perform public.fn_aplicacao_recalcular(v_apl, '2000-01-01');
  end loop;

  select string_agg(l.id || ':' || l.tipo || ':' || l.categoria_id || ':' || l.valor, ',' order by l.id)
    into v_depois
  from public.lancamentos l where l.origem = 'aplicacao';

  if v_antes is distinct from v_depois then
    raise exception 'O rendimento mudou com a ancora. Antes: %. Depois: %', v_antes, v_depois;
  end if;

  if exists (
    select 1 from public.contas_bancarias s
    where s.tipo = 'investimento'
      and exists (select 1 from public.aplicacoes a where a.conta_bancaria_id = s.id)
      and s.saldo_inicial <> (select sum(a.saldo_inicial) from public.aplicacoes a where a.conta_bancaria_id = s.id)
  ) then
    raise exception 'Ha subconta cujo saldo inicial nao e a soma das aplicacoes';
  end if;
end $confere$;

-- ---------- 10. a conta da aplicacao se escolhe no cadastro da etapa ----------
-- PEDIDO DO TIAGO (07/10/2026): "eu cadastro as aplicacoes no centro de custo
-- Investimentos mas la nao tem a que conta a aplicacao esta atrelada".
--
-- Etapa de Investimentos E a aplicacao. Criar a etapa ali passa a pedir a
-- conta e o tipo, e grava as duas coisas juntas (etapa sem aplicacao nao
-- aparece em Aplicacoes nem divide saldo). A pessoa escolhe a CONTA CORRENTE;
-- o dinheiro mora na subconta de investimentos dela, que o banco resolve.
--
-- Trocar a conta de uma aplicacao que ja tem movimento, posicao ou saldo
-- inicial e recusado: as transferencias dela apontam para a subconta antiga e o
-- saldo inicial pularia de uma subconta para a outra calado.

-- Padroes do cadastro por tipo. O resto (taxa, liquidez, vencimento) segue
-- editavel pelo fn_salvar_aplicacao.
create function public.fn_aplicacao_padroes(p_produto text, out indexador text, out tipo_ir text)
language sql
immutable
set search_path to ''
as $function$
  select
    case when p_produto in ('tesouro', 'outro') then 'outro' else 'cdi' end,
    case when p_produto = 'fundo' then 'come_cotas'
         when p_produto in ('lca', 'lci') then 'isento'
         else 'regressivo' end;
$function$;

revoke all on function public.fn_aplicacao_padroes(text) from public, anon, authenticated;

-- A subconta de investimentos de uma conta corrente ou poupanca ativa.
create function public.fn_subconta_da_conta(p_conta uuid)
returns uuid
language plpgsql
stable security definer
set search_path to ''
as $function$
declare v_sub uuid;
begin
  if not exists (
    select 1 from public.contas_bancarias c
    where c.id = p_conta and c.tipo in ('corrente', 'poupanca') and c.ativo
  ) then
    raise exception 'Escolha uma conta corrente ou poupanca ativa';
  end if;
  select s.id into v_sub from public.contas_bancarias s where s.conta_pai_id = p_conta;
  if v_sub is null then
    raise exception 'Esta conta nao tem subconta de investimentos';
  end if;
  return v_sub;
end $function$;

revoke all on function public.fn_subconta_da_conta(uuid) from public, anon, authenticated;

-- Vincula (ou revincula) a etapa de Investimentos a uma conta e um tipo.
create function public.fn_vincular_aplicacao_da_etapa(p_etapa uuid, p_conta uuid, p_produto text)
returns uuid
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_sub uuid;
  v_apl public.aplicacoes;
  v_padrao record;
  v_novo uuid;
begin
  if not public.tem_permissao('cadastros.centros-custo', 'editar')
     and not public.tem_permissao('cadastros.centros-custo', 'criar') then
    raise exception 'Sem permissao para editar centros de custo';
  end if;
  if not exists (
    select 1 from public.centros_custo e
    join public.centros_custo r on r.id = e.pai_id
    where e.id = p_etapa and e.nivel = 2 and r.tipo = 'investimento'
  ) then
    raise exception 'A conta da aplicacao so existe nas etapas do centro Investimentos';
  end if;
  if p_produto is null or p_produto not in ('cdb', 'fundo', 'lca', 'lci', 'tesouro', 'outro') then
    raise exception 'Escolha o tipo da aplicacao';
  end if;

  v_sub := public.fn_subconta_da_conta(p_conta);
  select * into v_apl from public.aplicacoes a where a.centro_custo_id = p_etapa for update;
  select * into v_padrao from public.fn_aplicacao_padroes(p_produto);

  if v_apl.id is null then
    insert into public.aplicacoes (
      centro_custo_id, conta_bancaria_id, produto, indexador, liquidez, tipo_ir, ativa
    ) values (
      p_etapa, v_sub, p_produto, v_padrao.indexador, 'diaria', v_padrao.tipo_ir, true
    ) returning id into v_novo;
    return v_novo;
  end if;

  if v_apl.conta_bancaria_id <> v_sub and (
       v_apl.saldo_inicial <> 0
       or exists (select 1 from public.aplicacao_posicoes p where p.aplicacao_id = v_apl.id and p.excluido_em is null)
       or exists (select 1 from public.transferencias_contas t where t.centro_custo_id = p_etapa)
     ) then
    raise exception 'Esta aplicacao ja tem movimento, posicao ou saldo inicial na conta atual: a conta nao muda mais';
  end if;

  update public.aplicacoes
     set conta_bancaria_id = v_sub,
         produto = p_produto,
         tipo_ir = case when produto = p_produto then tipo_ir else v_padrao.tipo_ir end,
         indexador = case when produto = p_produto then indexador else v_padrao.indexador end
   where id = v_apl.id
     and (conta_bancaria_id <> v_sub or produto <> p_produto);
  return v_apl.id;
end $function$;

revoke all on function public.fn_vincular_aplicacao_da_etapa(uuid, uuid, text) from public, anon;
grant execute on function public.fn_vincular_aplicacao_da_etapa(uuid, uuid, text) to authenticated;

-- Cria a etapa de Investimentos JA com a aplicacao, numa transacao so.
create function public.fn_criar_etapa_de_investimento(
  p_pai uuid, p_nome text, p_orcamento numeric, p_conta uuid, p_produto text
)
returns uuid
language plpgsql
security definer
set search_path to ''
as $function$
declare v_etapa uuid;
begin
  if not public.tem_permissao('cadastros.centros-custo', 'criar') then
    raise exception 'Sem permissao para criar centros de custo';
  end if;
  if not exists (
    select 1 from public.centros_custo r where r.id = p_pai and r.nivel = 1 and r.tipo = 'investimento'
  ) then
    raise exception 'O centro escolhido nao e o de Investimentos';
  end if;
  if coalesce(length(btrim(p_nome)), 0) < 2 then
    raise exception 'O nome precisa ter pelo menos 2 caracteres';
  end if;

  insert into public.centros_custo (nome, pai_id, nivel, tipo, sistema, orcamento, ativo)
  values (btrim(p_nome), p_pai, 2, null, false, p_orcamento, true)
  returning id into v_etapa;

  perform public.fn_vincular_aplicacao_da_etapa(v_etapa, p_conta, p_produto);
  return v_etapa;
end $function$;

revoke all on function public.fn_criar_etapa_de_investimento(uuid, text, numeric, uuid, text) from public, anon;
grant execute on function public.fn_criar_etapa_de_investimento(uuid, text, numeric, uuid, text) to authenticated;

-- O que a arvore mostra: a conta (corrente) e o tipo de cada etapa de
-- Investimentos. Nao e saldo, entao basta ver centros de custo.
create function public.fn_aplicacoes_das_etapas()
returns table(centro_custo_id uuid, conta_id uuid, conta_nome text, produto text)
language sql
stable security definer
set search_path to ''
as $function$
  select a.centro_custo_id, c.id, c.nome, a.produto
  from public.aplicacoes a
  join public.contas_bancarias s on s.id = a.conta_bancaria_id
  join public.contas_bancarias c on c.id = s.conta_pai_id
  where (select public.tem_permissao('cadastros.centros-custo', 'ver'));
$function$;

revoke all on function public.fn_aplicacoes_das_etapas() from public, anon;
grant execute on function public.fn_aplicacoes_das_etapas() to authenticated;
