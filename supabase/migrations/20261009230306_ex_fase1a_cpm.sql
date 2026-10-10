-- Execução de Obras, Fase 1a: motor CPM. A ÚNICA fonte de datas, folgas e caminho crítico do módulo (D16).
-- Regras no plano (Task 3) e no guia para agentes. Tempo em dias úteis do calendário do cronograma:
-- ES = início (inclusivo), EF = ES + duração = fim EXCLUSIVO. Data de início = dia útil ES, data de fim = dia útil EF - 1.

create or replace function public.fn_ex_cpm_calcular(p_cronograma uuid, p_cenario jsonb default null)
returns table (atividade_id uuid, inicio_cedo date, fim_cedo date, inicio_tarde date, fim_tarde date,
               folga_total integer, folga_livre integer, critica boolean)
language plpgsql stable security definer set search_path to '' as $$
#variable_conflict use_column
declare
  v_cal uuid; v_inicio date; v_corte date; v_origem date; v_ate date;
  v_dias date[]; v_preciso int;
  v_id uuid[]; v_dur int[]; v_esmin int[]; v_lfmax int[]; v_fixes int[]; v_fixef int[]; v_cod text[]; v_n int;
  l_pred int[]; l_succ int[]; v_lp_id uuid[]; v_lsuc_id uuid[]; v_ord_id uuid[]; v_ord_i int[]; v_perm int[]; l_tipo text[]; l_lag int[]; v_m int;
  in_ini int[]; in_qtd int[]; out_lnk int[]; out_ini int[]; out_qtd int[];
  v_grau int[]; v_fila int[]; v_cab int := 1; v_cauda int := 0;
  v_es int[]; v_ef int[]; v_ls int[]; v_lf int[]; v_tf int[]; v_ff int[];
  v_pf int := 0; i int; j int; k int; u int; s int; x int; v_lim int; v_inicio_idx int; v_corte_idx int; v_resto text;
begin
  select c.calendario_id, c.data_inicio, c.data_corte into v_cal, v_inicio, v_corte
  from public.ex_cronogramas c where c.id = p_cronograma and c.excluido_em is null;
  if v_cal is null then raise exception 'Cronograma não encontrado' using errcode = 'P0001'; end if;

  -- Dias úteis da origem até depois da última data fixa (real, restrição, corte). Cresce no fim se precisar.
  select least(v_inicio, min(a.inicio_real)),
         greatest(v_inicio, coalesce(v_corte, v_inicio), max(a.inicio_real), max(a.fim_real), max(a.restricao_data_em)) + 30
    into v_origem, v_ate
  from public.ex_atividades a where a.cronograma_id = p_cronograma and a.excluido_em is null;
  v_origem := coalesce(v_origem, v_inicio);
  v_ate := coalesce(v_ate, v_inicio + 30);
  v_dias := array(select d.data from public.fn_ex_dias_uteis(v_cal, v_origem, v_ate) d);
  v_inicio_idx := (select count(*) from unnest(v_dias) w where w < v_inicio);
  v_corte_idx := case when v_corte is null then 0 else (select count(*) from unnest(v_dias) w where w < v_corte) end;

  -- Atividades e marcos (resumo não entra no cálculo), numerados 1..n.
  with a as (
    select a.id, a.codigo, row_number() over (order by a.ordem, a.id)::int as i,
           coalesce((p_cenario -> 'duracoes' ->> a.id::text)::int, a.duracao_dias) as dur,
           a.inicio_real, a.fim_real, a.restricao_data, a.restricao_data_em
    from public.ex_atividades a
    where a.cronograma_id = p_cronograma and a.excluido_em is null and a.tipo <> 'resumo')
  select array_agg(a.id order by a.i), array_agg(a.codigo order by a.i), array_agg(a.dur order by a.i),
         array_agg(greatest(v_inicio_idx,
                            case when a.inicio_real is null then v_corte_idx else 0 end,
                            case when a.restricao_data = 'inicio_nao_antes'
                                 then (select count(*) from unnest(v_dias) w where w < a.restricao_data_em)::int else 0 end) order by a.i),
         array_agg(case when a.restricao_data = 'fim_nao_depois'
                        then (select count(*) from unnest(v_dias) w where w <= a.restricao_data_em)::int end order by a.i),
         array_agg(case when a.inicio_real is not null then (select count(*) from unnest(v_dias) w where w < a.inicio_real)::int end order by a.i),
         array_agg(case when a.fim_real is not null then (select count(*) from unnest(v_dias) w where w <= a.fim_real)::int end order by a.i)
    into v_id, v_cod, v_dur, v_esmin, v_lfmax, v_fixes, v_fixef
  from a;
  v_n := coalesce(cardinality(v_id), 0);
  if v_n = 0 then return; end if;

  -- Vínculos entre atividades vivas, ordenados pela sucessora. Sem junção em SQL: logo depois de um lote
  -- grande as estatísticas estão velhas e o plano vira laço aninhado sem índice (3.000 x 4.500 = segundos).
  -- Os vínculos saem pelo índice do cronograma e o id vira posição por intercalação de listas ordenadas.
  select coalesce(array_agg(d.predecessora_id order by d.predecessora_id, d.id), '{}'),
         coalesce(array_agg(d.sucessora_id order by d.predecessora_id, d.id), '{}'),
         coalesce(array_agg(d.tipo order by d.predecessora_id, d.id), '{}'),
         coalesce(array_agg(d.atraso_dias order by d.predecessora_id, d.id), '{}')
    into v_lp_id, v_lsuc_id, l_tipo, l_lag
  from public.ex_dependencias d where d.cronograma_id = p_cronograma;
  v_m := cardinality(v_lp_id);
  select array_agg(t.id order by t.id), array_agg(t.i::int order by t.id) into v_ord_id, v_ord_i
  from unnest(v_id) with ordinality as t(id, i);
  l_pred := array_fill(0, array[greatest(v_m, 1)]); l_succ := array_fill(0, array[greatest(v_m, 1)]);
  j := 1;
  for k in 1 .. v_m loop
    while j <= v_n and v_ord_id[j] < v_lp_id[k] loop j := j + 1; end loop;
    if j <= v_n and v_ord_id[j] = v_lp_id[k] then l_pred[k] := v_ord_i[j]; end if;
  end loop;
  v_perm := coalesce((select array_agg(t.k order by t.s, t.k) from unnest(v_lsuc_id) with ordinality as t(s, k)), '{}');
  j := 1;
  for x in 1 .. v_m loop
    k := v_perm[x];
    while j <= v_n and v_ord_id[j] < v_lsuc_id[k] loop j := j + 1; end loop;
    if j <= v_n and v_ord_id[j] = v_lsuc_id[k] then l_succ[k] := v_ord_i[j]; end if;
  end loop;
  -- Fica só o vínculo com as duas pontas vivas e fora de resumo.
  select coalesce(array_agg(t.p order by t.s, t.p), '{}'), coalesce(array_agg(t.s order by t.s, t.p), '{}'),
         coalesce(array_agg(t.tipo order by t.s, t.p), '{}'), coalesce(array_agg(t.lag order by t.s, t.p), '{}')
    into l_pred, l_succ, l_tipo, l_lag
  from unnest(l_pred[1:v_m], l_succ[1:v_m], l_tipo, l_lag) as t(p, s, tipo, lag)
  where t.p > 0 and t.s > 0;
  v_m := cardinality(l_pred);

  in_ini := array_fill(0, array[v_n]); in_qtd := array_fill(0, array[v_n]);
  out_ini := array_fill(0, array[v_n]); out_qtd := array_fill(0, array[v_n]);
  for k in 1 .. v_m loop
    s := l_succ[k];
    if in_qtd[s] = 0 then in_ini[s] := k; end if;
    in_qtd[s] := in_qtd[s] + 1;
  end loop;
  out_lnk := coalesce((select array_agg(t.k order by t.p, t.k) from unnest(l_pred) with ordinality as t(p, k)), '{}');
  for j in 1 .. v_m loop
    u := l_pred[out_lnk[j]];
    if out_qtd[u] = 0 then out_ini[u] := j; end if;
    out_qtd[u] := out_qtd[u] + 1;
  end loop;

  -- Ordem topológica (Kahn).
  v_grau := in_qtd; v_fila := array_fill(0, array[v_n]);
  for i in 1 .. v_n loop
    if v_grau[i] = 0 then v_cauda := v_cauda + 1; v_fila[v_cauda] := i; end if;
  end loop;
  while v_cab <= v_cauda loop
    u := v_fila[v_cab]; v_cab := v_cab + 1;
    for j in out_ini[u] .. out_ini[u] + out_qtd[u] - 1 loop
      continue when out_qtd[u] = 0;
      s := l_succ[out_lnk[j]];
      v_grau[s] := v_grau[s] - 1;
      if v_grau[s] = 0 then v_cauda := v_cauda + 1; v_fila[v_cauda] := s; end if;
    end loop;
  end loop;
  if v_cauda < v_n then
    select string_agg(v_cod[t.i], ', ' order by v_cod[t.i]) into v_resto
    from (select g.i from generate_series(1, v_n) g(i) where v_grau[g.i] > 0 order by g.i limit 10) t;
    raise exception 'Dependência em ciclo: as linhas % não têm ordem possível', v_resto using errcode = 'P0001';
  end if;

  -- Ida: datas mais cedo.
  v_es := array_fill(0, array[v_n]); v_ef := array_fill(0, array[v_n]);
  for x in 1 .. v_n loop
    u := v_fila[x];
    if v_fixes[u] is not null then
      v_es[u] := v_fixes[u];
    else
      v_es[u] := v_esmin[u];
      for k in in_ini[u] .. in_ini[u] + in_qtd[u] - 1 loop
        continue when in_qtd[u] = 0;
        i := l_pred[k];
        v_es[u] := greatest(v_es[u], case l_tipo[k]
          when 'TI' then v_ef[i] + l_lag[k]
          when 'II' then v_es[i] + l_lag[k]
          when 'TT' then v_ef[i] + l_lag[k] - v_dur[u]
          else v_es[i] + l_lag[k] - v_dur[u] end);
      end loop;
    end if;
    v_ef[u] := coalesce(v_fixef[u], v_es[u] + v_dur[u]);
    v_pf := greatest(v_pf, v_ef[u]);
  end loop;

  -- Volta: datas mais tarde e folgas.
  v_ls := array_fill(0, array[v_n]); v_lf := array_fill(0, array[v_n]);
  v_tf := array_fill(0, array[v_n]); v_ff := array_fill(0, array[v_n]);
  for x in reverse v_n .. 1 loop
    u := v_fila[x];
    v_lim := least(v_pf, coalesce(v_lfmax[u], v_pf));
    v_ff[u] := v_pf - v_ef[u];
    for j in out_ini[u] .. out_ini[u] + out_qtd[u] - 1 loop
      continue when out_qtd[u] = 0;
      k := out_lnk[j]; s := l_succ[k];
      v_lim := least(v_lim, case l_tipo[k]
        when 'TI' then v_ls[s] - l_lag[k]
        when 'II' then v_ls[s] - l_lag[k] + v_dur[u]
        when 'TT' then v_lf[s] - l_lag[k]
        else v_lf[s] - l_lag[k] + v_dur[u] end);
      v_ff[u] := least(v_ff[u], case l_tipo[k]
        when 'TI' then v_es[s] - (v_ef[u] + l_lag[k])
        when 'II' then v_es[s] - (v_es[u] + l_lag[k])
        when 'TT' then v_ef[s] - (v_ef[u] + l_lag[k])
        else v_ef[s] - (v_es[u] + l_lag[k]) end);
    end loop;
    v_lf[u] := v_lim; v_ls[u] := v_lim - v_dur[u];
    v_tf[u] := v_ls[u] - v_es[u];
    if v_fixef[u] is not null then v_tf[u] := 0; v_ff[u] := 0; end if;
  end loop;

  -- Garante dias úteis suficientes para converter os índices em data.
  v_preciso := greatest((select max(e) from unnest(v_ef) e), (select max(e) from unnest(v_lf) e)) + 2;
  while cardinality(v_dias) < v_preciso loop
    if v_ate > v_origem + 36500 then
      raise exception 'O cronograma passa de 100 anos: confira as durações e o calendário' using errcode = 'P0001';
    end if;
    v_ate := v_ate + greatest(60, (v_preciso - cardinality(v_dias)) * 2);
    v_dias := array(select d.data from public.fn_ex_dias_uteis(v_cal, v_origem, v_ate) d);
  end loop;

  return query
  with recursive base as (
    select v_id[g.i] as id, v_dur[g.i] as dur, v_es[g.i] as es, v_ef[g.i] as ef, v_ls[g.i] as ls, v_lf[g.i] as lf,
           v_tf[g.i] as tf, v_ff[g.i] as ff, (v_tf[g.i] <= 0 and v_fixef[g.i] is null) as crit
    from generate_series(1, v_n) g(i)),
  folhas as (
    select b.id,
           case when b.dur > 0 then v_dias[b.es + 1] else v_dias[greatest(b.es, 1)] end as ic,
           case when b.dur > 0 then v_dias[b.ef] else v_dias[greatest(b.es, 1)] end as fc,
           -- Folga negativa (restrição "fim não depois de" impossível) daria índice < 0: a data mais tarde
           -- fica no primeiro dia útil e a folga negativa continua em folga_total.
           case when b.dur > 0 then v_dias[greatest(b.ls, 0) + 1] else v_dias[greatest(b.ls, 1)] end as it,
           case when b.dur > 0 then v_dias[greatest(b.lf, 1)] else v_dias[greatest(b.ls, 1)] end as ft,
           b.tf, b.ff, b.crit
    from base b),
  arvore as (
    -- Cada resumo ligado a todas as folhas descendentes.
    select r.id as resumo_id, r.id as no_id
    from public.ex_atividades r where r.cronograma_id = p_cronograma and r.excluido_em is null and r.tipo = 'resumo'
    union all
    select t.resumo_id, f.id
    from arvore t join public.ex_atividades f on f.pai_id = t.no_id and f.excluido_em is null)
  select f.id, f.ic, f.fc, f.it, f.ft, f.tf, f.ff, f.crit from folhas f
  union all
  select t.resumo_id, min(f.ic), max(f.fc), min(f.it), max(f.ft), min(f.tf), 0, bool_or(f.crit)
  from arvore t join folhas f on f.id = t.no_id
  group by t.resumo_id;
end $$;

-- Interna: só as RPCs fn_ex_* (security definer) chamam. Nenhum grant para authenticated.
revoke all on function public.fn_ex_cpm_calcular(uuid, jsonb) from public, anon, authenticated;
