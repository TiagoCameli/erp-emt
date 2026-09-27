-- Medição de Contratos, Fase 3a: boletim e painel, só leitura. Todo número sai daqui como texto;
-- a tela e o xlsx só formatam (D7). Regras: plano da Fase 3, seção "Regras de cálculo".
--   Serviço mostra os próprios valores; título soma as linhas de serviço da subárvore.
--   Dinheiro = round(soma exata, 2) em linha, grupo e total (o centavo do Lote 09).
--   Saldo = previsto - acumulado, os dois já arredondados (Tiago, 26/09/2026).
--   Regra de arredondamento nula: dinheiro e % nulos, quantidades continuam.
create or replace function public.fn_mc_boletim(p_contrato uuid, p_ate integer default null)
returns jsonb language plpgsql stable security invoker set search_path to '' as $$
declare
  v_c public.mc_contratos%rowtype;
  v_versao public.mc_planilha_versoes%rowtype;
  v_ultima integer;
  v_ate integer;
  v_valor boolean;
  v_res jsonb;
begin
  if not public.tem_permissao('medicao.boletim', 'ver') then
    raise exception 'Sem permissão para ver o boletim.' using errcode = '42501';
  end if;
  select * into v_c from public.mc_contratos where id = p_contrato and excluido_em is null;
  if not found or not public.fn_mc_acessa_contrato(p_contrato) then
    raise exception 'Contrato não encontrado.' using errcode = 'P0002';
  end if;
  v_valor := v_c.regra_arredondamento is not null;
  select * into v_versao from public.mc_planilha_versoes
   where contrato_id = p_contrato and status = 'vigente' and excluido_em is null
   order by numero desc limit 1;
  select max(numero) into v_ultima from public.mc_medicoes where contrato_id = p_contrato;
  if p_ate is not null and (v_ultima is null or p_ate < 1 or p_ate > v_ultima) then
    raise exception 'A %ª medição não existe no contrato %.', p_ate, v_c.codigo using errcode = 'P0002';
  end if;
  v_ate := coalesce(p_ate, v_ultima);

  with med as (
    select mi.item_id, mi.numero, mi.qtd_efetiva, mi.valor_medicao
    from public.mc_v_medicao_itens mi
    where mi.contrato_id = p_contrato and mi.numero <= coalesce(v_ate, 0)
  ), por_item as (
    select item_id,
           jsonb_object_agg(numero::text, qtd_efetiva::text) as qtds,
           coalesce(sum(valor_medicao) filter (where numero = v_ate), 0) as valor_n,
           coalesce(sum(valor_medicao), 0) as acumulado
    from med group by item_id
  ), linhas as (
    select l.* from public.mc_v_planilha_linhas l where l.versao_id = v_versao.id
  ), sub as (
    select s.ancestral_id as id, sum(l.valor_previsto) as previsto,
           sum(coalesce(p.valor_n, 0)) as valor_n, sum(coalesce(p.acumulado, 0)) as acumulado
    from public.mc_v_planilha_subarvore s
    join linhas l on l.id = s.linha_id and l.tipo = 'servico'
    left join por_item p on p.item_id = l.item_id
    group by s.ancestral_id
  ), valores as (
    select l.*, p.qtds,
           round(case when l.tipo = 'servico' then l.valor_previsto else coalesce(s.previsto, 0) end, 2) as prev,
           round(case when l.tipo = 'servico' then coalesce(p.valor_n, 0) else coalesce(s.valor_n, 0) end, 2) as vn,
           round(case when l.tipo = 'servico' then coalesce(p.acumulado, 0) else coalesce(s.acumulado, 0) end, 2) as ac
    from linhas l
    left join sub s on s.id = l.id
    left join por_item p on p.item_id = l.item_id and l.tipo = 'servico'
  ), fora as (
    select p.*, u.codigo, u.descricao, u.unidade
    from por_item p
    cross join lateral (
      select pi.codigo, pi.descricao, pi.unidade from public.mc_planilha_itens pi
      join public.mc_planilha_versoes v on v.id = pi.versao_id
      where pi.item_id = p.item_id order by v.numero desc limit 1) u
    where not exists (select 1 from linhas l where l.item_id = p.item_id)
  ), tot as (
    select round((select sum(valor_previsto) from linhas where tipo = 'servico'), 2) as prev,
           round(coalesce((select sum(valor_n) from por_item), 0), 2) as vn,
           round(coalesce((select sum(acumulado) from por_item), 0), 2) as ac
  )
  select jsonb_build_object(
    'contrato', jsonb_build_object('id', v_c.id, 'codigo', v_c.codigo, 'nome_obra', v_c.nome_obra,
      'numero_contrato', v_c.numero_contrato, 'contratante_nome', v_c.contratante_nome,
      'regra_arredondamento', v_c.regra_arredondamento),
    'versao', case when v_versao.id is null then null else jsonb_build_object('id', v_versao.id,
      'numero', v_versao.numero, 'vigente_desde', v_versao.vigente_desde) end,
    'ate', v_ate,
    'medicoes', coalesce((select jsonb_agg(jsonb_build_object('id', m.id, 'numero', m.numero,
        'periodo_inicio', m.periodo_inicio, 'periodo_fim', m.periodo_fim, 'status', m.status,
        'valor', t.valor::text) order by m.numero)
      from public.mc_medicoes m join public.mc_v_medicao_totais t on t.medicao_id = m.id
      where m.contrato_id = p_contrato), '[]'::jsonb),
    'linhas', coalesce((select jsonb_agg(jsonb_build_object('id', x.id, 'ordem', x.ordem, 'codigo', x.codigo,
        'pai_id', x.pai_id, 'nivel', x.nivel, 'descricao', x.descricao, 'unidade', x.unidade, 'tipo', x.tipo,
        'item_id', x.item_id, 'preco_unitario', x.preco_unitario::text,
        'quantidade_prevista', x.quantidade_prevista::text, 'qtds', coalesce(x.qtds, '{}'::jsonb),
        'previsto', case when v_valor then x.prev::text end,
        'valor_medicao', case when v_valor then x.vn::text end,
        'acumulado', case when v_valor then x.ac::text end,
        'saldo', case when v_valor then (x.prev - x.ac)::text end,
        'pct_executado', case when v_valor and x.prev <> 0 then (x.ac / x.prev)::text end,
        'pct_a_medir', case when v_valor and x.prev <> 0 then ((x.prev - x.ac) / x.prev)::text end)
        order by x.ordem) from valores x), '[]'::jsonb),
    'fora_da_versao', coalesce((select jsonb_agg(jsonb_build_object('item_id', f.item_id, 'codigo', f.codigo,
        'descricao', f.descricao, 'unidade', f.unidade, 'qtds', f.qtds,
        'valor_medicao', case when v_valor then round(f.valor_n, 2)::text end,
        'acumulado', case when v_valor then round(f.acumulado, 2)::text end) order by f.codigo)
      from fora f), '[]'::jsonb),
    'total', (select jsonb_build_object(
        'previsto', case when v_valor then coalesce(t.prev, 0)::text end,
        'valor_medicao', case when v_valor then t.vn::text end,
        'acumulado', case when v_valor then t.ac::text end,
        'saldo', case when v_valor then (coalesce(t.prev, 0) - t.ac)::text end,
        'pct_executado', case when v_valor and coalesce(t.prev, 0) <> 0 then (t.ac / t.prev)::text end,
        'pct_a_medir', case when v_valor and coalesce(t.prev, 0) <> 0 then ((t.prev - t.ac) / t.prev)::text end)
      from tot t))
  into v_res;
  return v_res;
end $$;

-- Painel: um contrato por linha, da lista do usuário. Total consolidado = soma dos valores já
-- arredondados de cada contrato; contrato com regra nula fica fora das somas.
create or replace function public.fn_mc_painel(p_status text[] default null, p_tipos text[] default null)
returns jsonb language plpgsql stable security invoker set search_path to '' as $$
declare v_res jsonb;
begin
  if not public.tem_permissao('medicao.painel', 'ver') then
    raise exception 'Sem permissão para ver o painel.' using errcode = '42501';
  end if;
  with c as (
    select c.* from public.mc_contratos c
    where c.excluido_em is null and c.id in (select public.fn_mc_meus_contratos())
      and (p_status is null or c.status = any(p_status))
      and (p_tipos is null or c.contratante_tipo = any(p_tipos))
  ), v as (
    select distinct on (pv.contrato_id) pv.contrato_id, pv.id, pv.numero
    from public.mc_planilha_versoes pv join c on c.id = pv.contrato_id
    where pv.status = 'vigente' and pv.excluido_em is null
    order by pv.contrato_id, pv.numero desc
  ), ac as (
    select mi.contrato_id, round(coalesce(sum(mi.valor_medicao), 0), 2) as acumulado
    from public.mc_v_medicao_itens mi join c on c.id = mi.contrato_id group by mi.contrato_id
  ), ult as (
    select distinct on (m.contrato_id) m.contrato_id, m.numero, m.status, m.periodo_inicio, m.periodo_fim, t.valor
    from public.mc_medicoes m join c on c.id = m.contrato_id
    join public.mc_v_medicao_totais t on t.medicao_id = m.id
    order by m.contrato_id, m.numero desc
  ), qtd as (
    select m.contrato_id, count(*) as medicoes from public.mc_medicoes m join c on c.id = m.contrato_id group by m.contrato_id
  ), l as (
    select c.id, c.codigo, c.nome_obra, c.contratante_nome, c.contratante_tipo, c.status, v.numero as versao_numero,
           c.regra_arredondamento is not null as tem_valor,
           case when c.regra_arredondamento is not null then coalesce(vt.total_previsto, 0) end as previsto,
           case when c.regra_arredondamento is not null then coalesce(ac.acumulado, 0) end as acumulado,
           coalesce(qtd.medicoes, 0) as medicoes,
           ult.numero as corrente_numero, ult.status as corrente_status, ult.periodo_inicio, ult.periodo_fim,
           case when c.regra_arredondamento is not null then ult.valor end as corrente_valor
    from c
    left join v on v.contrato_id = c.id
    left join public.mc_v_versao_totais vt on vt.versao_id = v.id
    left join ac on ac.contrato_id = c.id
    left join ult on ult.contrato_id = c.id
    left join qtd on qtd.contrato_id = c.id
  )
  select jsonb_build_object(
    'contratos', coalesce(jsonb_agg(jsonb_build_object('id', l.id, 'codigo', l.codigo, 'nome_obra', l.nome_obra,
        'contratante_nome', l.contratante_nome, 'contratante_tipo', l.contratante_tipo, 'status', l.status,
        'versao_numero', l.versao_numero, 'previsto', l.previsto::text, 'acumulado', l.acumulado::text,
        'saldo', (l.previsto - l.acumulado)::text,
        'pct_executado', case when l.previsto <> 0 then (l.acumulado / l.previsto)::text end,
        'medicoes', l.medicoes,
        'corrente', case when l.corrente_numero is null then null else jsonb_build_object('numero', l.corrente_numero,
          'status', l.corrente_status, 'periodo_inicio', l.periodo_inicio, 'periodo_fim', l.periodo_fim,
          'valor', l.corrente_valor::text) end) order by l.codigo), '[]'::jsonb),
    'total', jsonb_build_object(
        'previsto', coalesce(sum(l.previsto) filter (where l.tem_valor), 0)::text,
        'acumulado', coalesce(sum(l.acumulado) filter (where l.tem_valor), 0)::text,
        'saldo', coalesce(sum(l.previsto - l.acumulado) filter (where l.tem_valor), 0)::text,
        'pct_executado', case when coalesce(sum(l.previsto) filter (where l.tem_valor), 0) <> 0
          then (sum(l.acumulado) filter (where l.tem_valor) / sum(l.previsto) filter (where l.tem_valor))::text end,
        'corrente', coalesce(sum(l.corrente_valor) filter (where l.tem_valor), 0)::text))
  into v_res from l;
  return v_res;
end $$;

revoke all on function public.fn_mc_boletim(uuid, integer) from public, anon;
revoke all on function public.fn_mc_painel(text[], text[]) from public, anon;
grant execute on function public.fn_mc_boletim(uuid, integer) to authenticated;
grant execute on function public.fn_mc_painel(text[], text[]) to authenticated;
