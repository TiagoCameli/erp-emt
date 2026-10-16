-- Dias de equipamento por centro de custo (16/10/2026).
-- Desenho: docs/superpowers/specs/2026-10-16-equipamento-dias-por-centro-design.md
--
-- Pedido do Tiago: todo equipamento do mapa tem, em cada dia, um centro de custo, e fica
-- registrado quantos dias ele passou em cada um. Mais tarde a depreciação por hora (próprio) ou o
-- aluguel (alugado) é rateado por esses dias; por agora é só o registro dos dias.
--
-- 1. Centro "Equipamento Sem Alocação": raiz, de sistema, papel_rateio 'indireto' (entra no rateio
--    indireto como o Escritório Central) e tipo próprio 'equipamento'. NUNCA 'escritorio': a folha
--    acha o Escritório Central por tipo 'escritorio' + 'indireto'.
-- 2. mapa_equipamentos.varios_centros: a máquina operando que atende vários centros ao mesmo
--    tempo vai para Sem Alocação. Única coisa nova que o pessoal do Mapa marca.
-- 3. fn_equip_centro_regra: a regra do centro a partir do estado efetivo, da obra, da marca e de
--    ser carreta da EMT (v1.22: "o centro das carretas da EMT deve ser sempre Carretas EMT").
-- 4. equipamento_dias_centro: uma linha por (dia, equipamento). Fechada às 23:59 de Rio Branco
--    pelo cron, no mesmo horário da foto do mapa. O dia vai para onde a máquina terminou o dia.
--    Fechamento diário e não período por trigger porque o estado efetivo não é coluna: a view
--    junta equipamentos.status, OS em execução e posição.
-- 5. Os dias que já têm foto (mapa_snapshots) entram pela mesma regra.
-- 6. RPCs da ficha (fn_mapa_centros_equipamento, fn_mapa_marcar_varios_centros) e do relatório
--    mensal (fn_mapa_rel_dias_centro). O dia de hoje é calculado ao vivo.

-- 1. Centro novo ---------------------------------------------------------------------------
alter table public.centros_custo drop constraint if exists centros_custo_tipo_check;
alter table public.centros_custo add constraint centros_custo_tipo_check
  check (tipo = any (array['obra', 'escritorio', 'manutencao', 'financeiro', 'investimento', 'socio',
                           'empresa_ligada', 'imobilizado', 'equipamento']));

do $centro$
declare v_id uuid;
begin
  select id into v_id from public.centros_custo where pai_id is null and tipo = 'equipamento' limit 1;
  if v_id is null then
    insert into public.centros_custo (nome, nivel, tipo, sistema, papel_rateio)
    values ('Equipamento Sem Alocação', 1, 'equipamento', true, 'indireto')
    returning id into v_id;
  end if;
  insert into public.configuracoes (chave, valor, descricao)
  values ('mapa.centro_sem_alocacao', to_jsonb(v_id::text),
          'Centro "Equipamento Sem Alocação": dias de máquina parada, sem obra ou que atende vários centros')
  on conflict (chave) do nothing;
end
$centro$;

create or replace function public.fn_mapa_centro_sem_alocacao()
 returns uuid
 language sql
 stable
 set search_path to ''
as $function$
  select nullif(valor #>> '{}', '')::uuid from public.configuracoes where chave = 'mapa.centro_sem_alocacao';
$function$;

-- 2. Marca "atende vários centros" ---------------------------------------------------------
alter table public.mapa_equipamentos add column if not exists varios_centros boolean not null default false;
comment on column public.mapa_equipamentos.varios_centros is
  'Máquina operando que atende vários centros ao mesmo tempo: os dias dela vão para Equipamento Sem Alocação.';

alter table public.mapa_movimentacoes drop constraint if exists mapa_movimentacoes_tipo_check;
alter table public.mapa_movimentacoes add constraint mapa_movimentacoes_tipo_check
  check (tipo = any (array['transferencia', 'estado', 'operador', 'frente', 'equipe', 'posicao', 'locacao',
                           'acoplamento', 'centro']));

-- 3. A regra -------------------------------------------------------------------------------
-- fora_funcionamento não conta (nenhuma linha). Carreta EMT: sempre a raiz de 001. Operando: a raiz
-- da obra, a não ser que atenda vários centros, esteja sem obra ou a obra não tenha centro. Qualquer
-- outro estado: Sem Alocação, com o próprio estado como motivo.
create or replace function public.fn_equip_centro_regra(p_estado text, p_obra uuid, p_varios boolean, p_carreta boolean)
 returns table(centro_custo_id uuid, motivo text)
 language sql
 stable
 set search_path to ''
as $function$
  with c as (
    select
      (select r.id from public.centros_custo r
        where r.obra_id = p_obra and r.pai_id is null and r.nivel = 1
        order by r.ativo desc, r.created_at limit 1) as obra_raiz,
      (select r.id from public.centros_custo r
        where r.obra_id = public.fn_mapa_obra_carretas_emt() and r.pai_id is null and r.nivel = 1
        order by r.ativo desc, r.created_at limit 1) as carretas_raiz,
      public.fn_mapa_centro_sem_alocacao() as sem
  )
  select x.centro, x.motivo
  from c,
  lateral (select
    case
      when coalesce(p_carreta, false) and c.carretas_raiz is not null then c.carretas_raiz
      when p_estado = 'operando' and coalesce(p_varios, false) then c.sem
      when p_estado = 'operando' and p_obra is null then c.sem
      when p_estado = 'operando' and c.obra_raiz is null then c.sem
      when p_estado = 'operando' then c.obra_raiz
      else c.sem
    end as centro,
    case
      when coalesce(p_carreta, false) and c.carretas_raiz is not null then 'carreta_emt'
      when p_estado = 'operando' and coalesce(p_varios, false) then 'varios_centros'
      when p_estado = 'operando' and p_obra is null then 'sem_obra'
      when p_estado = 'operando' and c.obra_raiz is null then 'obra_sem_centro'
      when p_estado = 'operando' then 'obra'
      else coalesce(p_estado, 'sem_estado')
    end as motivo) x
  where p_estado is distinct from 'fora_funcionamento'
    and x.centro is not null;
$function$;

-- 4. Os dias -------------------------------------------------------------------------------
create table if not exists public.equipamento_dias_centro (
  dia             date not null,
  equipamento_id  uuid not null references public.equipamentos(id) on delete cascade,
  centro_custo_id uuid not null references public.centros_custo(id),
  motivo          text not null,
  estado          text,
  obra_id         uuid references public.obras(id) on delete set null,
  acoplado_em     uuid references public.equipamentos(id) on delete set null,
  fechado_em      timestamptz not null default now(),
  primary key (dia, equipamento_id)
);
comment on table public.equipamento_dias_centro is
  'Em que centro de custo cada equipamento do mapa terminou cada dia (23:59 de Rio Branco). Base do rateio futuro de depreciação/aluguel. Escrita só por fn_equip_dias_fechar.';
create index if not exists equipamento_dias_centro_centro_idx on public.equipamento_dias_centro (centro_custo_id, dia);
create index if not exists equipamento_dias_centro_equip_idx on public.equipamento_dias_centro (equipamento_id, dia);

alter table public.equipamento_dias_centro enable row level security;
drop policy if exists equipamento_dias_centro_select on public.equipamento_dias_centro;
create policy equipamento_dias_centro_select on public.equipamento_dias_centro for select to authenticated
  using (public.tem_permissao('mapa.mapa', 'ver') or public.tem_permissao('mapa.historico', 'ver'));
revoke all on public.equipamento_dias_centro from public, anon, authenticated;
grant select on public.equipamento_dias_centro to authenticated;

-- O centro de cada máquina AGORA (o dia de hoje ao vivo). Implemento acoplado herda da hospedeira.
create or replace function public.fn_equip_dias_calcular()
 returns table(equipamento_id uuid, centro_custo_id uuid, motivo text, estado text, obra_id uuid, acoplado_em uuid)
 language sql
 stable
 security definer
 set search_path to ''
as $function$
  with base as (
    select v.equipamento_id, v.estado_efetivo, v.obra_id, coalesce(m.varios_centros, false) as varios,
           public.fn_mapa_carreta_emt(v.equipamento_id) as carreta
    from public.v_mapa_equipamentos v
    left join public.mapa_equipamentos m on m.equipamento_id = v.equipamento_id
    where v.ativo and v.no_mapa
  ), maq as (
    select b.equipamento_id, r.centro_custo_id, r.motivo, b.estado_efetivo as estado, b.obra_id, null::uuid as acoplado_em
    from base b
    cross join lateral public.fn_equip_centro_regra(b.estado_efetivo, b.obra_id, b.varios, b.carreta) r
  )
  select * from maq
  union all
  select i.id, h.centro_custo_id, 'acoplado', h.estado, h.obra_id, i.acoplado_em
  from public.equipamentos i
  join maq h on h.equipamento_id = i.acoplado_em
  where i.ativo and i.tipo = 'Implementos'
    and not exists (select 1 from maq x where x.equipamento_id = i.id);
$function$;

-- Fecha o dia de hoje: refaz as linhas do dia a partir do estado agora. Idempotente.
create or replace function public.fn_equip_dias_fechar(p_data date default null)
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
  delete from public.equipamento_dias_centro where dia = v_data;
  insert into public.equipamento_dias_centro (dia, equipamento_id, centro_custo_id, motivo, estado, obra_id, acoplado_em)
  select v_data, c.equipamento_id, c.centro_custo_id, c.motivo, c.estado, c.obra_id, c.acoplado_em
  from public.fn_equip_dias_calcular() c;
  get diagnostics v_n = row_count;
  return v_n;
end $function$;

-- 5. Os dias que já têm foto do mapa (a marca de vários centros ainda não existia) -----------
insert into public.equipamento_dias_centro (dia, equipamento_id, centro_custo_id, motivo, estado, obra_id)
select s.data, (e->>'equipamento_id')::uuid, r.centro_custo_id, r.motivo, e->>'estado_efetivo',
       (select o.id from public.obras o where o.id = (e->>'obra_id')::uuid)
from public.mapa_snapshots s
cross join lateral jsonb_array_elements(s.estado->'equipamentos') e
cross join lateral public.fn_equip_centro_regra(e->>'estado_efetivo', (e->>'obra_id')::uuid, false,
                                                public.fn_mapa_carreta_emt((e->>'equipamento_id')::uuid)) r
where s.data < (now() at time zone 'America/Rio_Branco')::date
  and exists (select 1 from public.equipamentos q where q.id = (e->>'equipamento_id')::uuid)
on conflict (dia, equipamento_id) do nothing;

do $cron$
begin
  if not exists (select 1 from cron.job where jobname = 'equip_dias_centro_diario') then
    perform cron.schedule('equip_dias_centro_diario', '59 4 * * *', $c$select public.fn_equip_dias_fechar()$c$);  -- 23:59 Acre
  end if;
end
$cron$;

-- 6. RPCs ----------------------------------------------------------------------------------
create or replace function public.fn_mapa_marcar_varios_centros(p_id uuid, p_valor boolean)
 returns void
 language plpgsql
 security definer
 set search_path to ''
as $function$
declare v_antes boolean;
begin
  perform public.fn_mapa_exigir('editar');
  if p_valor is null then raise exception 'Informe se a máquina atende vários centros'; end if;
  select varios_centros into v_antes from public.mapa_equipamentos where equipamento_id = p_id for update;
  if not found then raise exception 'Máquina não está no mapa'; end if;
  if v_antes = p_valor then return; end if;
  update public.mapa_equipamentos set varios_centros = p_valor where equipamento_id = p_id;
  insert into public.mapa_movimentacoes (tipo, alvo, alvo_id, de, para, motivo)
  values ('centro', 'equipamento', p_id,
          jsonb_build_object('varios_centros', v_antes), jsonb_build_object('varios_centros', p_valor),
          case when p_valor then 'Atende vários centros: ligado' else 'Atende vários centros: desligado' end);
end $function$;

-- Ficha: centro de agora, dias do mês por centro e períodos (dias seguidos no mesmo centro e
-- motivo) dos últimos 90 dias. Hoje entra ao vivo.
create or replace function public.fn_mapa_centros_equipamento(p_id uuid)
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
  with dias as (
    select d.dia, d.centro_custo_id, d.motivo from public.equipamento_dias_centro d
    where d.equipamento_id = p_id and d.dia >= v_hoje - 90 and d.dia < v_hoje
    union all
    select v_hoje, c.centro_custo_id, c.motivo from public.fn_equip_dias_calcular() c where c.equipamento_id = p_id
  ), ilhas as (
    select dias.*, dia - (row_number() over (partition by centro_custo_id, motivo order by dia))::int as grupo from dias
  ), periodos as (
    select i.centro_custo_id, i.motivo, min(i.dia) as de, max(i.dia) as ate, count(*)::int as dias
    from ilhas i group by i.centro_custo_id, i.motivo, i.grupo
  )
  select jsonb_build_object(
    'varios_centros', coalesce((select m.varios_centros from public.mapa_equipamentos m where m.equipamento_id = p_id), false),
    'atual', (select jsonb_build_object('centro_id', p.centro_custo_id, 'centro_nome', cc.nome, 'motivo', p.motivo, 'desde', p.de)
              from periodos p join public.centros_custo cc on cc.id = p.centro_custo_id where p.ate = v_hoje limit 1),
    'mes', coalesce((select jsonb_agg(jsonb_build_object('centro_id', x.centro_custo_id, 'centro_nome', cc.nome, 'dias', x.dias) order by x.dias desc, cc.nome)
                     from (select d.centro_custo_id, count(*)::int as dias from dias d where d.dia >= v_mes group by 1) x
                     join public.centros_custo cc on cc.id = x.centro_custo_id), '[]'::jsonb),
    'periodos', coalesce((select jsonb_agg(jsonb_build_object('centro_id', p.centro_custo_id, 'centro_nome', cc.nome, 'motivo', p.motivo,
                                                              'de', p.de, 'ate', p.ate, 'dias', p.dias) order by p.de desc)
                          from periodos p join public.centros_custo cc on cc.id = p.centro_custo_id), '[]'::jsonb)
  ) into v;
  return v;
end $function$;

-- Relatório mensal: dias por equipamento e centro. Se o mês contém hoje, hoje entra ao vivo.
create or replace function public.fn_mapa_rel_dias_centro(p_mes date)
 returns table(equipamento_id uuid, codigo text, descricao text, propriedade text, centro_custo_id uuid, centro_nome text, dias integer)
 language plpgsql
 stable
 security definer
 set search_path to ''
as $function$
declare
  v_hoje date := (now() at time zone 'America/Rio_Branco')::date;
  v_ini date := date_trunc('month', p_mes)::date;
  v_fim date := (date_trunc('month', p_mes) + interval '1 month')::date;
begin
  if not public.tem_permissao('mapa.historico', 'ver') then
    raise exception 'Sem permissão para ver os relatórios do Mapa' using errcode = '42501';
  end if;
  if p_mes is null then raise exception 'Informe o mês'; end if;
  return query
  with d as (
    select x.equipamento_id, x.centro_custo_id from public.equipamento_dias_centro x
    where x.dia >= v_ini and x.dia < v_fim and x.dia <> v_hoje
    union all
    select c.equipamento_id, c.centro_custo_id from public.fn_equip_dias_calcular() c
    where v_hoje >= v_ini and v_hoje < v_fim
  )
  select e.id, e.codigo, e.descricao, e.propriedade, cc.id, cc.nome, count(*)::int
  from d
  join public.equipamentos e on e.id = d.equipamento_id
  join public.centros_custo cc on cc.id = d.centro_custo_id
  group by e.id, e.codigo, e.descricao, e.propriedade, cc.id, cc.nome
  order by e.codigo, 7 desc;
end $function$;

-- Grants -----------------------------------------------------------------------------------
revoke all on function public.fn_mapa_centro_sem_alocacao() from public, anon;
revoke all on function public.fn_equip_centro_regra(text, uuid, boolean, boolean) from public, anon;
revoke all on function public.fn_equip_dias_calcular() from public, anon, authenticated;
revoke all on function public.fn_equip_dias_fechar(date) from public, anon, authenticated;
revoke all on function public.fn_mapa_marcar_varios_centros(uuid, boolean) from public, anon;
revoke all on function public.fn_mapa_centros_equipamento(uuid) from public, anon;
revoke all on function public.fn_mapa_rel_dias_centro(date) from public, anon;
grant execute on function public.fn_mapa_centro_sem_alocacao() to authenticated;
grant execute on function public.fn_equip_centro_regra(text, uuid, boolean, boolean) to authenticated;
grant execute on function public.fn_mapa_marcar_varios_centros(uuid, boolean) to authenticated;
grant execute on function public.fn_mapa_centros_equipamento(uuid) to authenticated;
grant execute on function public.fn_mapa_rel_dias_centro(date) to authenticated;
