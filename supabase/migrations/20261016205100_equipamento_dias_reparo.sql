-- Dias de equipamento por centro: reparo do dia perdido (16/10/2026, revisão da entrega).
--
-- O fechamento só aceita o dia de hoje. Se o cron das 23:59 atrasa para depois da meia-noite
-- (aí "hoje" já é o dia seguinte) ou não roda, o dia fica sem linha e o relatório mostra menos
-- dias do que a máquina ficou no mapa. Duas correções:
-- 1. fn_equip_dias_reparar(p_data): refaz um dia PASSADO que não tem linha nenhuma, a partir da
--    foto do mapa daquele dia (mapa_snapshots, mesma regra da carga inicial). A marca "vários
--    centros" e o acoplamento de implemento usam o valor de agora (a foto não os guarda). Dia que já
--    tem linha não é tocado.
-- 2. O cron passa a rodar às 23:55 (04:55 UTC), longe da meia-noite, e antes de fechar hoje repara
--    ontem (fn_equip_dias_cron).

create or replace function public.fn_equip_dias_reparar(p_data date)
 returns integer
 language plpgsql
 security definer
 set search_path to ''
as $function$
declare
  v_hoje date := (now() at time zone 'America/Rio_Branco')::date;
  v_n integer := 0;
  v_imp integer := 0;
begin
  if p_data is null or p_data >= v_hoje then
    raise exception 'Só dia passado se repara; o de hoje se fecha';
  end if;
  if exists (select 1 from public.equipamento_dias_centro where dia = p_data) then return 0; end if;

  insert into public.equipamento_dias_centro (dia, equipamento_id, centro_custo_id, motivo, estado, obra_id)
  select s.data, (e->>'equipamento_id')::uuid, r.centro_custo_id, r.motivo, e->>'estado_efetivo',
         (select o.id from public.obras o where o.id = (e->>'obra_id')::uuid)
  from public.mapa_snapshots s
  cross join lateral jsonb_array_elements(s.estado->'equipamentos') e
  cross join lateral public.fn_equip_centro_regra(
    e->>'estado_efetivo', (e->>'obra_id')::uuid,
    coalesce((select m.varios_centros from public.mapa_equipamentos m where m.equipamento_id = (e->>'equipamento_id')::uuid), false),
    public.fn_mapa_carreta_emt((e->>'equipamento_id')::uuid)) r
  where s.data = p_data
    and exists (select 1 from public.equipamentos q where q.id = (e->>'equipamento_id')::uuid)
  on conflict (dia, equipamento_id) do nothing;
  get diagnostics v_n = row_count;

  insert into public.equipamento_dias_centro (dia, equipamento_id, centro_custo_id, motivo, estado, obra_id, acoplado_em)
  select p_data, i.id, h.centro_custo_id, 'acoplado', h.estado, h.obra_id, i.acoplado_em
  from public.equipamentos i
  join public.equipamento_dias_centro h on h.dia = p_data and h.equipamento_id = i.acoplado_em
  where i.ativo and i.tipo = 'Implementos'
  on conflict (dia, equipamento_id) do nothing;
  get diagnostics v_imp = row_count;

  return v_n + v_imp;
end $function$;

create or replace function public.fn_equip_dias_cron()
 returns integer
 language plpgsql
 security definer
 set search_path to ''
as $function$
begin
  perform public.fn_equip_dias_reparar(((now() at time zone 'America/Rio_Branco')::date) - 1);
  return public.fn_equip_dias_fechar();
end $function$;

revoke all on function public.fn_equip_dias_reparar(date) from public, anon, authenticated;
revoke all on function public.fn_equip_dias_cron() from public, anon, authenticated;

do $cron$
begin
  if exists (select 1 from cron.job where jobname = 'equip_dias_centro_diario') then
    perform cron.unschedule('equip_dias_centro_diario');
  end if;
  perform cron.schedule('equip_dias_centro_diario', '55 4 * * *', $c$select public.fn_equip_dias_cron()$c$);  -- 23:55 Acre
end
$cron$;
