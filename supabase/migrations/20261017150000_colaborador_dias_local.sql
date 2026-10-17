-- Local de trabalho no registro diário da pessoa e "desde quando" na ficha (17/10/2026).
--
-- Pedido do Tiago: na ficha da pessoa "deve aparecer em qual centro de custo a pessoa esta
-- trabalhando e anotar o dia que comecou a trabalhar em qual centro de custo, se houver mudanca de
-- cc anotar a data da mudanca, a mesma coisa deve ser feita com o local de trabalho."
--
-- 1. colaborador_dias_centro.localidade_id: o local onde a pessoa terminou o dia. Os dias já
--    fechados (14 a 16/10) se preenchem pela auditoria de mapa_colaboradores, que tem toda mudança
--    desde a primeira (16/10); antes disso ninguém tinha local. O reparo de dia perdido usa a mesma
--    leitura.
-- 2. fn_mapa_centros_colaborador ganha centro_atual e local_atual (com o dia em que começou) e as
--    listas de mudanças com a data. "Mudou de centro" olha só o centro, não o motivo.

-- 1. Local no dia ----------------------------------------------------------------------------
alter table public.colaborador_dias_centro
  add column if not exists localidade_id uuid references public.localidades(id) on delete set null;

-- Local da pessoa no fim do dia, pela auditoria (última gravação de mapa_colaboradores até a
-- meia-noite de Rio Branco). Sem gravação até lá: sem local.
create or replace function public.fn_colab_local_no_dia(p_colaborador uuid, p_dia date)
 returns uuid
 language sql
 stable
 security definer
 set search_path to ''
as $function$
  select l.id
  from (
    select (a.dados_depois->>'localidade_id')::uuid as localidade_id
    from public.audit_log a
    where a.tabela = 'mapa_colaboradores'
      and a.acao in ('INSERT', 'UPDATE')
      and a.dados_depois->>'colaborador_id' = p_colaborador::text
      and a.criado_em < ((p_dia + 1)::timestamp at time zone 'America/Rio_Branco')
    order by a.criado_em desc, a.id desc
    limit 1
  ) u
  join public.localidades l on l.id = u.localidade_id;
$function$;

update public.colaborador_dias_centro d
   set localidade_id = public.fn_colab_local_no_dia(d.colaborador_id, d.dia)
 where d.dia < (now() at time zone 'America/Rio_Branco')::date
   and d.localidade_id is null;

-- Fechar hoje grava também o local de agora.
create or replace function public.fn_colab_dias_fechar(p_data date default null)
 returns integer
 language plpgsql
 security definer
 set search_path to ''
as $function$
declare
  v_hoje date := (now() at time zone 'America/Rio_Branco')::date;
  v_data date := coalesce(p_data, v_hoje);
  v_n integer;
begin
  if auth.uid() is not null then perform public.fn_mapa_exigir('editar'); end if;  -- cron roda sem usuário
  if v_data <> v_hoje then
    raise exception 'Só o dia de hoje pode ser fechado: o dia fica com o estado do mapa agora';
  end if;
  delete from public.colaborador_dias_centro where dia = v_data;
  insert into public.colaborador_dias_centro (dia, colaborador_id, centro_custo_id, motivo, estado, obra_id, equipamento_id, localidade_id)
  select v_data, c.colaborador_id, c.centro_custo_id, c.motivo, c.estado, c.obra_id, c.equipamento_id, mc.localidade_id
  from public.fn_colab_dias_calcular() c
  left join public.mapa_colaboradores mc on mc.colaborador_id = c.colaborador_id;
  get diagnostics v_n = row_count;
  return v_n;
end $function$;

-- Reparo: igual ao anterior, mais o local do dia pela auditoria.
create or replace function public.fn_colab_dias_reparar(p_data date)
 returns integer
 language plpgsql
 security definer
 set search_path to ''
as $function$
declare
  v_hoje date := (now() at time zone 'America/Rio_Branco')::date;
  v_n integer := 0;
begin
  if p_data is null or p_data >= v_hoje then
    raise exception 'Só dia passado se repara; o de hoje se fecha';
  end if;
  if exists (select 1 from public.colaborador_dias_centro where dia = p_data) then return 0; end if;

  insert into public.colaborador_dias_centro (dia, colaborador_id, centro_custo_id, motivo, estado, obra_id, equipamento_id, localidade_id)
  select s.data, x.colaborador_id, r.centro_custo_id, r.motivo, x.estado, x.obra_id, x.equipamento_id,
         public.fn_colab_local_no_dia(x.colaborador_id, s.data)
  from public.mapa_snapshots s
  cross join lateral jsonb_array_elements(s.estado->'pessoas') p
  cross join lateral (
    select (p->>'colaborador_id')::uuid as colaborador_id,
           (select q.id from public.equipamentos q where q.id = (p->>'equipamento_id')::uuid) as equipamento_id,
           coalesce((select mc.estado from public.mapa_colaboradores mc where mc.colaborador_id = (p->>'colaborador_id')::uuid),
                    'trabalhando') as estado,
           (select mc.centro_custo_id from public.mapa_colaboradores mc where mc.colaborador_id = (p->>'colaborador_id')::uuid) as centro,
           (select o.id from public.obras o
             where o.id = coalesce(
               (select (e->>'obra_id')::uuid from jsonb_array_elements(s.estado->'equipamentos') e
                 where e->>'equipamento_id' = p->>'equipamento_id' limit 1),
               (p->>'obra_id')::uuid)) as obra_id
  ) x
  cross join lateral public.fn_colab_centro_regra(x.estado, x.obra_id, x.centro) r
  where s.data = p_data
    and exists (select 1 from public.colaboradores c where c.id = x.colaborador_id)
  on conflict (dia, colaborador_id) do nothing;
  get diagnostics v_n = row_count;
  return v_n;
end $function$;

-- 2. Ficha -----------------------------------------------------------------------------------
-- Partiu da definição de 20261017010000 (a viva). Acrescenta centro_atual, local_atual,
-- mudancas_centro e mudancas_local, sobre o histórico inteiro da pessoa (não só 90 dias).
create or replace function public.fn_mapa_centros_colaborador(p_id uuid)
 returns jsonb
 language plpgsql
 stable
 security definer
 set search_path to ''
as $function$
declare
  v_hoje date := (now() at time zone 'America/Rio_Branco')::date;
  v_mes date := date_trunc('month', (now() at time zone 'America/Rio_Branco'))::date;
  v jsonb;
begin
  perform public.fn_mapa_exigir('ver');
  with todos as (
    select d.dia, d.centro_custo_id, d.motivo, d.estado, d.localidade_id from public.colaborador_dias_centro d
    where d.colaborador_id = p_id and d.dia < v_hoje
    union all
    select v_hoje, c.centro_custo_id, c.motivo, c.estado,
           (select mc.localidade_id from public.mapa_colaboradores mc where mc.colaborador_id = p_id)
    from public.fn_colab_dias_calcular() c where c.colaborador_id = p_id
  ), dias as (
    select * from todos where dia >= v_hoje - 90
  ), ilhas as (
    select dias.*, dia - (row_number() over (partition by centro_custo_id, motivo order by dia))::int as grupo from dias
  ), periodos as (
    select i.centro_custo_id, i.motivo, min(i.dia) as de, max(i.dia) as ate, count(*)::int as dias
    from ilhas i group by i.centro_custo_id, i.motivo, i.grupo
  ), seq as (
    select t.dia, t.centro_custo_id, t.localidade_id,
           lag(t.centro_custo_id) over (order by t.dia) as centro_antes,
           lag(t.localidade_id) over (order by t.dia) as local_antes,
           row_number() over (order by t.dia) as n
    from todos t
  ), mud_centro as (
    select s.dia, s.centro_custo_id, s.centro_antes from seq s
    where s.n = 1 or s.centro_custo_id is distinct from s.centro_antes
  ), mud_local as (
    select s.dia, s.localidade_id, s.local_antes from seq s
    where s.n = 1 or s.localidade_id is distinct from s.local_antes
  )
  select jsonb_build_object(
    'estado', coalesce((select m.estado from public.mapa_colaboradores m where m.colaborador_id = p_id), 'trabalhando'),
    'atual', (select jsonb_build_object('centro_id', p.centro_custo_id, 'centro_nome', cc.nome, 'motivo', p.motivo, 'desde', p.de)
              from periodos p join public.centros_custo cc on cc.id = p.centro_custo_id where p.ate = v_hoje limit 1),
    'centro_atual', (select jsonb_build_object('centro_id', m.centro_custo_id, 'centro_nome', cc.nome, 'desde', m.dia)
                     from mud_centro m join public.centros_custo cc on cc.id = m.centro_custo_id
                     order by m.dia desc limit 1),
    'local_atual', (select jsonb_build_object('localidade_id', m.localidade_id, 'nome', l.nome, 'desde', m.dia)
                    from mud_local m left join public.localidades l on l.id = m.localidade_id
                    order by m.dia desc limit 1),
    'mudancas_centro', coalesce((select jsonb_agg(jsonb_build_object('data', m.dia, 'centro_nome', cc.nome, 'antes_nome', ca.nome) order by m.dia desc)
                                 from mud_centro m
                                 join public.centros_custo cc on cc.id = m.centro_custo_id
                                 left join public.centros_custo ca on ca.id = m.centro_antes), '[]'::jsonb),
    'mudancas_local', coalesce((select jsonb_agg(jsonb_build_object('data', m.dia, 'nome', l.nome, 'antes_nome', la.nome) order by m.dia desc)
                                from mud_local m
                                left join public.localidades l on l.id = m.localidade_id
                                left join public.localidades la on la.id = m.local_antes), '[]'::jsonb),
    'trabalhados', (select count(*)::int from dias d where d.dia >= v_mes and d.estado = 'trabalhando'),
    'parados', (select count(*)::int from dias d where d.dia >= v_mes and d.estado = 'parado'),
    'mes', coalesce((select jsonb_agg(jsonb_build_object('centro_id', x.centro_custo_id, 'centro_nome', cc.nome, 'dias', x.dias) order by x.dias desc, cc.nome)
                     from (select d.centro_custo_id, count(*)::int as dias from dias d where d.dia >= v_mes group by 1) x
                     join public.centros_custo cc on cc.id = x.centro_custo_id), '[]'::jsonb),
    'periodos', coalesce((select jsonb_agg(jsonb_build_object('centro_id', p.centro_custo_id, 'centro_nome', cc.nome, 'motivo', p.motivo,
                                                              'de', p.de, 'ate', p.ate, 'dias', p.dias) order by p.de desc)
                          from periodos p join public.centros_custo cc on cc.id = p.centro_custo_id), '[]'::jsonb)
  ) into v;
  return v;
end $function$;

revoke all on function public.fn_colab_local_no_dia(uuid, date) from public, anon, authenticated;
revoke all on function public.fn_colab_dias_fechar(date) from public, anon, authenticated;
revoke all on function public.fn_colab_dias_reparar(date) from public, anon, authenticated;
revoke all on function public.fn_mapa_centros_colaborador(uuid) from public, anon;
grant execute on function public.fn_mapa_centros_colaborador(uuid) to authenticated;
