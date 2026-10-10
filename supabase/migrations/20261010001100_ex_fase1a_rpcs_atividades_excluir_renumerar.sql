create or replace function public.fn_ex_atividades_excluir(p_cronograma uuid, p_ids uuid[], p_motivo text)
returns integer language plpgsql security definer set search_path to '' as $$
declare v_obra uuid; v_todas uuid[];
begin
  select obra_id into v_obra from public.ex_cronogramas where id = p_cronograma and excluido_em is null;
  if v_obra is null then raise exception 'Cronograma não encontrado' using errcode = 'P0001'; end if;
  perform public.fn_ex_exigir('execucao.cronogramas', 'excluir', v_obra, 'Sem permissão para excluir atividade');
  if btrim(coalesce(p_motivo, '')) = '' then raise exception 'Informe o motivo da exclusão' using errcode = 'P0001'; end if;
  perform pg_advisory_xact_lock(hashtextextended('ex_cronograma:' || p_cronograma::text, 0));
  with recursive d(id) as (
    select a.id from public.ex_atividades a where a.id = any (p_ids) and a.cronograma_id = p_cronograma and a.excluido_em is null
    union
    select f.id from public.ex_atividades f join d on f.pai_id = d.id where f.excluido_em is null)
  select array_agg(id) into v_todas from d;
  if v_todas is null then raise exception 'Nenhuma linha encontrada para excluir' using errcode = 'P0001'; end if;
  delete from public.ex_dependencias where predecessora_id = any (v_todas) or sucessora_id = any (v_todas);
  update public.ex_atividades set excluido_em = now(), excluido_por = (select auth.uid()), motivo_exclusao = btrim(p_motivo)
  where id = any (v_todas);
  perform public.fn_ex_cpm_recalcular(p_cronograma);
  return cardinality(v_todas);
end $$;

create or replace function public.fn_ex_eap_renumerar(p_cronograma uuid)
returns integer language plpgsql security definer set search_path to '' as $$
declare v_obra uuid; v_n int;
begin
  select obra_id into v_obra from public.ex_cronogramas where id = p_cronograma and excluido_em is null;
  if v_obra is null then raise exception 'Cronograma não encontrado' using errcode = 'P0001'; end if;
  perform public.fn_ex_exigir('execucao.cronogramas', 'editar', v_obra, 'Sem permissão para renumerar a EAP');
  perform pg_advisory_xact_lock(hashtextextended('ex_cronograma:' || p_cronograma::text, 0));
  -- Dois passos com a mesma árvore: primeiro um código provisório, depois o final (a troca não colide no índice único).
  with recursive irmas as (
    select a.id, a.pai_id, row_number() over (partition by a.pai_id order by a.ordem, a.id) as pos
    from public.ex_atividades a where a.cronograma_id = p_cronograma and a.excluido_em is null),
  arv(id, cod) as (
    select i.id, i.pos::text from irmas i where i.pai_id is null
    union all
    select i.id, arv.cod || '.' || i.pos from irmas i join arv on i.pai_id = arv.id)
  update public.ex_atividades a set codigo = '#' || a.id::text from arv where arv.id = a.id;
  with recursive irmas as (
    select a.id, a.pai_id, row_number() over (partition by a.pai_id order by a.ordem, a.id) as pos
    from public.ex_atividades a where a.cronograma_id = p_cronograma and a.excluido_em is null),
  arv(id, cod) as (
    select i.id, i.pos::text from irmas i where i.pai_id is null
    union all
    select i.id, arv.cod || '.' || i.pos from irmas i join arv on i.pai_id = arv.id)
  update public.ex_atividades a set codigo = arv.cod from arv where arv.id = a.id;
  get diagnostics v_n = row_count;
  return v_n;
end $$;

do $fn$
declare f text;
begin
  foreach f in array array['fn_ex_atividades_salvar_lote(uuid, jsonb)', 'fn_ex_atividades_excluir(uuid, uuid[], text)',
                           'fn_ex_eap_renumerar(uuid)'] loop
    execute format('revoke all on function public.%s from public, anon', f);
    execute format('grant execute on function public.%s to authenticated', f);
  end loop;
end $fn$;
