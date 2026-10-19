-- Motorista de carreta EMT conta na carreta dele, não na raiz (Tiago, 19/10/2026: "vai direto
-- para o carreta do motorista e nao para a raiz").
--
-- Antes: quem opera uma máquina herdava só a OBRA dela, e a carreta EMT tem a obra fixa em
-- "001 - Carretas EMT"; o dia caía na raiz. Cada carreta é uma etapa própria (a SQU 9D14 é do
-- Rosildo, e "o custo é do motorista, e o motorista é da carreta", 28/08 e 01/09/2026).
--
-- Agora, para a pessoa que opera uma carreta EMT:
--   parado            -> Pessoal Sem Alocação (como antes; marcado na ficha vale mais)
--   centro escolhido  -> o escolhido (como antes)
--   senão             -> a etapa da carreta, motivo 'carreta_emt'
-- Quem não opera carreta EMT segue fn_colab_centro_regra sem mudança. O lado das MÁQUINAS
-- (fn_equip_centro_regra) não muda.
--
-- 1. fn_mapa_centro_da_carreta: a etapa (ativa) da carreta, achada subindo a árvore até a obra
--    das carretas, do mesmo jeito que fn_mapa_carreta_emt decide se é carreta.
-- 2. fn_colab_centro_da_pessoa: a regra acima, por cima de fn_colab_centro_regra.
-- 3. fn_colab_dias_calcular e fn_colab_dias_reparar: definições vivas (com o filtro do diarista
--    do #543), trocando só a chamada da regra.
-- 4. Dias já fechados com a carreta gravada e caídos pela obra/sem obra vão para a carreta.

create or replace function public.fn_mapa_centro_da_carreta(p_equipamento uuid)
returns uuid
language sql
stable
set search_path to ''
as $$
  with recursive acima as (
    select c.id as centro, c.id as no from public.centros_custo c
    where c.equipamento_id = p_equipamento and c.ativo
    union all
    select a.centro, r.pai_id from acima a join public.centros_custo r on r.id = a.no
    where r.pai_id is not null
  )
  select a.centro from acima a join public.centros_custo n on n.id = a.no
  where n.obra_id = public.fn_mapa_obra_carretas_emt()
  order by a.centro limit 1;
$$;

revoke all on function public.fn_mapa_centro_da_carreta(uuid) from public, anon;
grant execute on function public.fn_mapa_centro_da_carreta(uuid) to authenticated;

create or replace function public.fn_colab_centro_da_pessoa(p_estado text, p_obra uuid, p_centro uuid, p_equipamento uuid)
returns table(centro_custo_id uuid, motivo text)
language sql
stable
set search_path to ''
as $$
  with k as (
    select public.fn_mapa_centro_da_carreta(p_equipamento) as carreta,
           (select r.id from public.centros_custo r where r.id = p_centro and r.ativo) as escolhido
  ),
  v as (
    select k.*, (p_estado is distinct from 'parado' and k.escolhido is null and k.carreta is not null) as na_carreta
    from k
  )
  select v.carreta, 'carreta_emt'::text from v where v.na_carreta
  union all
  select r.centro_custo_id, r.motivo
  from v cross join lateral public.fn_colab_centro_regra(p_estado, p_obra, p_centro) r
  where not v.na_carreta;
$$;

revoke all on function public.fn_colab_centro_da_pessoa(text, uuid, uuid, uuid) from public, anon;
grant execute on function public.fn_colab_centro_da_pessoa(text, uuid, uuid, uuid) to authenticated;

CREATE OR REPLACE FUNCTION public.fn_colab_dias_calcular()
 RETURNS TABLE(colaborador_id uuid, centro_custo_id uuid, motivo text, estado text, obra_id uuid, equipamento_id uuid)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
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
      and (c.vinculo is distinct from 'diarista' or coalesce(mc.diarista_no_mapa, false))
  )
  select b.id, r.centro_custo_id, r.motivo, b.estado, b.obra_id, b.equipamento_id
  from base b
  cross join lateral public.fn_colab_centro_da_pessoa(b.estado, b.obra_id, b.centro, b.equipamento_id) r;
$function$;

CREATE OR REPLACE FUNCTION public.fn_colab_dias_reparar(p_data date)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
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
  cross join lateral public.fn_colab_centro_da_pessoa(x.estado, x.obra_id, x.centro, x.equipamento_id) r
  where s.data = p_data
    and exists (select 1 from public.colaboradores c where c.id = x.colaborador_id)
  on conflict (dia, colaborador_id) do nothing;
  get diagnostics v_n = row_count;
  return v_n;
end $function$;

update public.colaborador_dias_centro d
set centro_custo_id = public.fn_mapa_centro_da_carreta(d.equipamento_id),
    motivo = 'carreta_emt'
where d.estado = 'trabalhando'
  and d.motivo in ('obra', 'sem_obra', 'obra_sem_centro', 'obra_inativa')
  and public.fn_mapa_centro_da_carreta(d.equipamento_id) is not null;
