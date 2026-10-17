-- Dias de pessoa por centro de custo (17/10/2026).
--
-- Pedido do Tiago: "esse modulo de mapa nao se conecta com o rh, ele vai gravar em quais centros
-- de custo cada funcionario ficou durante o mes e ai gerar um relatorio no final do mes mostrando
-- quantos dias trabalhados e quantos dias estiveram parado." Mesmo molde dos dias de equipamento
-- (20261016203100 e 20261016205100). Decisões dele:
-- * trabalhando/parado é MARCADO na ficha da pessoa (não sai da máquina nem da obra);
-- * dia parado vai sempre para o centro novo "Pessoal Sem Alocação".
-- Dia trabalhando vai para o centro escolhido na ficha (mapa_colaboradores.centro_custo_id, da v1.26
-- "centro de custo da pessoa"); sem centro escolhido, para a raiz da obra onde a pessoa está no mapa.
-- Decisões do desenho: pessoa sem marca está trabalhando; trabalhando sem centro escolhido e sem obra
-- (ou obra sem centro) vai para Pessoal Sem Alocação. A obra da pessoa é a do MAPA: a da máquina que
-- ela opera, senão a marcada nela, a do local ou a da frente/equipe. Nunca colaboradores.obra_id nem
-- colaboradores.centro_custo_id (cadastro do RH, que a folha usa).
--
-- 1. Centro "Pessoal Sem Alocação": raiz, de sistema, 'indireto', tipo próprio 'pessoal' (NUNCA
--    'escritorio': a folha acha o Escritório Central por tipo 'escritorio' + 'indireto'; nem
--    'equipamento', que é como o Equipamento Sem Alocação é achado).
-- 2. mapa_colaboradores.estado.
-- 3. fn_colab_centro_regra.
-- 4. colaborador_dias_centro (dia, colaborador), fechada às 23:55 junto com a das máquinas
--    (fn_colab_dias_cron, job próprio). Dia perdido se refaz pela foto (mapa_snapshots.pessoas),
--    com o estado de agora (a foto não guarda o estado).
-- 5. RPCs: fn_mapa_marcar_estado_pessoa, fn_mapa_centros_colaborador (ficha) e
--    fn_mapa_rel_dias_pessoa (relatório). O dia de hoje entra ao vivo.

-- 1. Centro novo ---------------------------------------------------------------------------
alter table public.centros_custo drop constraint if exists centros_custo_tipo_check;
alter table public.centros_custo add constraint centros_custo_tipo_check
  check (tipo = any (array['obra', 'escritorio', 'manutencao', 'financeiro', 'investimento', 'socio',
                           'empresa_ligada', 'imobilizado', 'equipamento', 'pessoal']));

do $centro$
declare v_id uuid;
begin
  select id into v_id from public.centros_custo where pai_id is null and tipo = 'pessoal' limit 1;
  if v_id is null then
    insert into public.centros_custo (nome, nivel, tipo, sistema, papel_rateio)
    values ('Pessoal Sem Alocação', 1, 'pessoal', true, 'indireto')
    returning id into v_id;
  end if;
  insert into public.configuracoes (chave, valor, descricao)
  values ('mapa.centro_pessoal_sem_alocacao', to_jsonb(v_id::text),
          'Centro "Pessoal Sem Alocação": dias de pessoa parada ou sem obra no mapa')
  on conflict (chave) do nothing;
end
$centro$;

create or replace function public.fn_mapa_centro_pessoal_sem_alocacao()
 returns uuid
 language sql
 stable
 set search_path to ''
as $function$
  select nullif(valor #>> '{}', '')::uuid from public.configuracoes where chave = 'mapa.centro_pessoal_sem_alocacao';
$function$;

-- 2. Estado da pessoa ----------------------------------------------------------------------
alter table public.mapa_colaboradores add column if not exists estado text not null default 'trabalhando';
alter table public.mapa_colaboradores drop constraint if exists mapa_colaboradores_estado_check;
alter table public.mapa_colaboradores add constraint mapa_colaboradores_estado_check
  check (estado = any (array['trabalhando', 'parado']));
comment on column public.mapa_colaboradores.estado is
  'Marcado na ficha da pessoa no Mapa. Parado: os dias vão para Pessoal Sem Alocação.';

-- 3. A regra -------------------------------------------------------------------------------
create or replace function public.fn_colab_centro_regra(p_estado text, p_obra uuid, p_centro uuid)
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
      public.fn_mapa_centro_pessoal_sem_alocacao() as sem,
      (select r.id from public.centros_custo r where r.id = p_centro and r.ativo) as escolhido
  )
  select x.centro, x.motivo
  from c,
  lateral (select
    case
      when p_estado = 'parado' then c.sem
      when c.escolhido is not null then c.escolhido
      when p_obra is null then c.sem
      when c.obra_raiz is null then c.sem
      else c.obra_raiz
    end as centro,
    case
      when p_estado = 'parado' then 'parado'
      when c.escolhido is not null then 'escolhido'
      when p_obra is null then 'sem_obra'
      when c.obra_raiz is null then 'obra_sem_centro'
      else 'obra'
    end as motivo) x
  where x.centro is not null;
$function$;

-- 4. Os dias -------------------------------------------------------------------------------
create table if not exists public.colaborador_dias_centro (
  dia             date not null,
  colaborador_id  uuid not null references public.colaboradores(id) on delete cascade,
  centro_custo_id uuid not null references public.centros_custo(id),
  motivo          text not null,
  estado          text not null check (estado = any (array['trabalhando', 'parado'])),
  obra_id         uuid references public.obras(id) on delete set null,
  equipamento_id  uuid references public.equipamentos(id) on delete set null,
  fechado_em      timestamptz not null default now(),
  primary key (dia, colaborador_id)
);
comment on table public.colaborador_dias_centro is
  'Em que centro de custo cada pessoa do mapa terminou cada dia (23:55 de Rio Branco) e se estava trabalhando ou parada. Não lê nem escreve o RH. Escrita só por fn_colab_dias_fechar/fn_colab_dias_reparar.';
create index if not exists colaborador_dias_centro_centro_idx on public.colaborador_dias_centro (centro_custo_id, dia);
create index if not exists colaborador_dias_centro_colab_idx on public.colaborador_dias_centro (colaborador_id, dia);

alter table public.colaborador_dias_centro enable row level security;
drop policy if exists colaborador_dias_centro_select on public.colaborador_dias_centro;
create policy colaborador_dias_centro_select on public.colaborador_dias_centro for select to authenticated
  using (public.tem_permissao('mapa.mapa', 'ver') or public.tem_permissao('mapa.historico', 'ver'));
revoke all on public.colaborador_dias_centro from public, anon, authenticated;
grant select on public.colaborador_dias_centro to authenticated;

-- O centro de cada pessoa AGORA (o dia de hoje ao vivo). Todo colaborador ativo do mapa conta,
-- com ou sem posição (os mesmos de fn_mapa_estado).
create or replace function public.fn_colab_dias_calcular()
 returns table(colaborador_id uuid, centro_custo_id uuid, motivo text, estado text, obra_id uuid, equipamento_id uuid)
 language sql
 stable
 security definer
 set search_path to ''
as $function$
  with base as (
    select c.id, coalesce(mc.estado, 'trabalhando') as estado, ve.equipamento_id, mc.centro_custo_id as centro,
           coalesce(ve.obra_id, mc.obra_id, l.obra_id, fr.obra_id, eq.obra_id) as obra_id
    from public.colaboradores c
    left join public.mapa_colaboradores mc on mc.colaborador_id = c.id
    left join public.v_mapa_equipamentos ve on ve.equipamento_id = mc.equipamento_id and ve.no_mapa and ve.ativo
    left join public.localidades l on l.id = mc.localidade_id
    left join public.mapa_frentes fr on fr.id = mc.frente_id
    left join public.mapa_equipes eq on eq.id = mc.equipe_id
    where c.ativo and c.data_demissao is null
  )
  select b.id, r.centro_custo_id, r.motivo, b.estado, b.obra_id, b.equipamento_id
  from base b
  cross join lateral public.fn_colab_centro_regra(b.estado, b.obra_id, b.centro) r;
$function$;

-- Fecha o dia de hoje: refaz as linhas do dia a partir do estado agora. Idempotente.
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
  insert into public.colaborador_dias_centro (dia, colaborador_id, centro_custo_id, motivo, estado, obra_id, equipamento_id)
  select v_data, c.colaborador_id, c.centro_custo_id, c.motivo, c.estado, c.obra_id, c.equipamento_id
  from public.fn_colab_dias_calcular() c;
  get diagnostics v_n = row_count;
  return v_n;
end $function$;

-- Refaz um dia PASSADO sem linha nenhuma pela foto do mapa daquele dia. A obra é a da foto (a da
-- máquina que a pessoa operava na mesma foto, senão a dela); o estado e o centro escolhido são os de
-- agora (a foto não os guarda). Dia que já tem linha não é tocado.
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

  insert into public.colaborador_dias_centro (dia, colaborador_id, centro_custo_id, motivo, estado, obra_id, equipamento_id)
  select s.data, x.colaborador_id, r.centro_custo_id, r.motivo, x.estado, x.obra_id, x.equipamento_id
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

create or replace function public.fn_colab_dias_cron()
 returns integer
 language plpgsql
 security definer
 set search_path to ''
as $function$
begin
  perform public.fn_colab_dias_reparar(((now() at time zone 'America/Rio_Branco')::date) - 1);
  return public.fn_colab_dias_fechar();
end $function$;

do $cron$
begin
  if exists (select 1 from cron.job where jobname = 'colab_dias_centro_diario') then
    perform cron.unschedule('colab_dias_centro_diario');
  end if;
  perform cron.schedule('colab_dias_centro_diario', '55 4 * * *', $c$select public.fn_colab_dias_cron()$c$);  -- 23:55 Acre
end
$cron$;

-- 5. RPCs ----------------------------------------------------------------------------------
create or replace function public.fn_mapa_marcar_estado_pessoa(p_id uuid, p_estado text, p_motivo text default null)
 returns void
 language plpgsql
 security definer
 set search_path to ''
as $function$
declare v_antes text;
begin
  perform public.fn_mapa_exigir('editar');
  if p_estado is null or p_estado not in ('trabalhando', 'parado') then
    raise exception 'Estado inválido: use trabalhando ou parado';
  end if;
  if not exists (select 1 from public.colaboradores c where c.id = p_id and c.ativo and c.data_demissao is null) then
    raise exception 'Pessoa não encontrada no mapa';
  end if;
  insert into public.mapa_colaboradores (colaborador_id) values (p_id) on conflict (colaborador_id) do nothing;
  select estado into v_antes from public.mapa_colaboradores where colaborador_id = p_id for update;
  if v_antes = p_estado then return; end if;
  update public.mapa_colaboradores set estado = p_estado, updated_by = auth.uid() where colaborador_id = p_id;
  insert into public.mapa_movimentacoes (tipo, alvo, alvo_id, de, para, motivo, data_efetiva)
  values ('estado', 'colaborador', p_id,
          jsonb_build_object('estado', v_antes), jsonb_build_object('estado', p_estado),
          coalesce(nullif(btrim(p_motivo), ''), case when p_estado = 'parado' then 'Parado' else 'Trabalhando' end),
          (now() at time zone 'America/Rio_Branco')::date);
end $function$;

-- Ficha: estado, centro de agora, dias do mês por centro, trabalhados/parados do mês e períodos dos
-- últimos 90 dias. Hoje entra ao vivo.
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
  with dias as (
    select d.dia, d.centro_custo_id, d.motivo, d.estado from public.colaborador_dias_centro d
    where d.colaborador_id = p_id and d.dia >= v_hoje - 90 and d.dia < v_hoje
    union all
    select v_hoje, c.centro_custo_id, c.motivo, c.estado from public.fn_colab_dias_calcular() c where c.colaborador_id = p_id
  ), ilhas as (
    select dias.*, dia - (row_number() over (partition by centro_custo_id, motivo order by dia))::int as grupo from dias
  ), periodos as (
    select i.centro_custo_id, i.motivo, min(i.dia) as de, max(i.dia) as ate, count(*)::int as dias
    from ilhas i group by i.centro_custo_id, i.motivo, i.grupo
  )
  select jsonb_build_object(
    'estado', coalesce((select m.estado from public.mapa_colaboradores m where m.colaborador_id = p_id), 'trabalhando'),
    'atual', (select jsonb_build_object('centro_id', p.centro_custo_id, 'centro_nome', cc.nome, 'motivo', p.motivo, 'desde', p.de)
              from periodos p join public.centros_custo cc on cc.id = p.centro_custo_id where p.ate = v_hoje limit 1),
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

-- Relatório mensal: dias por pessoa, centro e estado. Se o mês contém hoje, hoje entra ao vivo.
create or replace function public.fn_mapa_rel_dias_pessoa(p_mes date)
 returns table(colaborador_id uuid, nome text, funcao text, centro_custo_id uuid, centro_nome text, estado text, dias integer)
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
    select x.colaborador_id, x.centro_custo_id, x.estado from public.colaborador_dias_centro x
    where x.dia >= v_ini and x.dia < v_fim and x.dia <> v_hoje
    union all
    select c.colaborador_id, c.centro_custo_id, c.estado from public.fn_colab_dias_calcular() c
    where v_hoje >= v_ini and v_hoje < v_fim
  )
  select c.id, c.nome, f.nome, cc.id, cc.nome, d.estado, count(*)::int
  from d
  join public.colaboradores c on c.id = d.colaborador_id
  left join public.funcoes f on f.id = c.funcao_id
  join public.centros_custo cc on cc.id = d.centro_custo_id
  group by c.id, c.nome, f.nome, cc.id, cc.nome, d.estado
  order by c.nome, 7 desc;
end $function$;

-- Grants -----------------------------------------------------------------------------------
revoke all on function public.fn_mapa_centro_pessoal_sem_alocacao() from public, anon;
revoke all on function public.fn_colab_centro_regra(text, uuid, uuid) from public, anon;
revoke all on function public.fn_colab_dias_calcular() from public, anon, authenticated;
revoke all on function public.fn_colab_dias_fechar(date) from public, anon, authenticated;
revoke all on function public.fn_colab_dias_reparar(date) from public, anon, authenticated;
revoke all on function public.fn_colab_dias_cron() from public, anon, authenticated;
revoke all on function public.fn_mapa_marcar_estado_pessoa(uuid, text, text) from public, anon;
revoke all on function public.fn_mapa_centros_colaborador(uuid) from public, anon;
revoke all on function public.fn_mapa_rel_dias_pessoa(date) from public, anon;
grant execute on function public.fn_mapa_centro_pessoal_sem_alocacao() to authenticated;
grant execute on function public.fn_colab_centro_regra(text, uuid, uuid) to authenticated;
grant execute on function public.fn_mapa_marcar_estado_pessoa(uuid, text, text) to authenticated;
grant execute on function public.fn_mapa_centros_colaborador(uuid) to authenticated;
grant execute on function public.fn_mapa_rel_dias_pessoa(date) to authenticated;
