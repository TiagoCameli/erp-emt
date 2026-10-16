-- Módulo Mapa v1.22: carretas da EMT Transportes
--
-- Pedido do Tiago (16/10/2026): "o centro de custo das carretas da EMT deve ser sempre Carretas
-- EMT; essas regras que você está colocando só devem servir para as carretas da EMT Transportes."
--
-- Carreta da EMT Transportes = equipamento cujo centro de custo (a etapa criada pela
-- trg_equipamento_cria_etapa) está sob o centro da obra "001 - Carretas EMT". Em 16/10: CS-002
-- (SQS 7E01), CS-003 (SQU 9C94), CS-004 (SQU 9D04) e CS-005 (SQU 9D14), as quatro placas com
-- frete da EMT TRANSPORTES. CS-001 e CS-006 estão sob Manutenção e ficam de fora.
--
-- 1. configuracoes 'mapa.obra_carretas_emt' (a obra) e 'mapa.transportadora_emt' (o fornecedor
--    EMT TRANSPORTES).
-- 2. fn_mapa_carreta_emt(equipamento): a regra acima.
-- 3. A obra da carreta no mapa é sempre "001 - Carretas EMT": trigger em mapa_equipamentos, que
--    roda depois da obra da jazida (ordem alfabética), vale para transferência, arraste e o que
--    vier. As quatro carretas passam para a obra agora.
-- 4. fn_mapa_estado (a partir da definição viva): 'em frete' e 'em deslocamento' só com frete da
--    EMT TRANSPORTES (frete de terceiro sai do mapa); cada máquina diz se é carreta EMT
--    ('carreta_emt'); a config leva a obra das carretas.
-- O centro de custo do FRETE (a obra que recebe o material) não muda: é custo da obra no Frete.

insert into public.configuracoes (chave, valor, descricao) values
  ('mapa.obra_carretas_emt', to_jsonb('ba9a2017-ab9c-486b-8928-b4dbac372368'::text),
   'Obra "001 - Carretas EMT": centro das carretas da EMT Transportes e obra fixa delas no mapa'),
  ('mapa.transportadora_emt', to_jsonb('c52b7dd3-1e61-46e7-b7f5-05c402474aea'::text),
   'Fornecedor EMT TRANSPORTES: só frete dele põe carreta em frete ou em deslocamento no mapa')
on conflict (chave) do nothing;

create or replace function public.fn_mapa_obra_carretas_emt()
 returns uuid
 language sql
 stable
 set search_path to ''
as $function$
  select nullif(valor #>> '{}', '')::uuid from public.configuracoes where chave = 'mapa.obra_carretas_emt';
$function$;

create or replace function public.fn_mapa_transportadora_emt()
 returns uuid
 language sql
 stable
 set search_path to ''
as $function$
  select nullif(valor #>> '{}', '')::uuid from public.configuracoes where chave = 'mapa.transportadora_emt';
$function$;

-- Sobe do centro do equipamento até a raiz; carreta EMT se algum ancestral é da obra das carretas.
create or replace function public.fn_mapa_carreta_emt(p_equipamento uuid)
 returns boolean
 language sql
 stable
 set search_path to ''
as $function$
  with recursive acima as (
    select c.id, c.pai_id, c.obra_id from public.centros_custo c where c.equipamento_id = p_equipamento
    union all
    select p.id, p.pai_id, p.obra_id from public.centros_custo p join acima a on p.id = a.pai_id
  )
  select coalesce(bool_or(acima.obra_id = public.fn_mapa_obra_carretas_emt()), false) from acima;
$function$;

revoke all on function public.fn_mapa_obra_carretas_emt() from public, anon;
revoke all on function public.fn_mapa_transportadora_emt() from public, anon;
revoke all on function public.fn_mapa_carreta_emt(uuid) from public, anon;
grant execute on function public.fn_mapa_obra_carretas_emt() to authenticated;
grant execute on function public.fn_mapa_transportadora_emt() to authenticated;
grant execute on function public.fn_mapa_carreta_emt(uuid) to authenticated;

create or replace function public.fn_mapa_trg_obra_fixa_carreta()
 returns trigger
 language plpgsql
 set search_path to ''
as $function$
declare v_obra uuid := public.fn_mapa_obra_carretas_emt();
begin
  if v_obra is not null and public.fn_mapa_carreta_emt(new.equipamento_id) then
    new.obra_id := v_obra;
  end if;
  return new;
end $function$;

drop trigger if exists trg_mapa_equipamentos_obra_fixa_carreta on public.mapa_equipamentos;
create trigger trg_mapa_equipamentos_obra_fixa_carreta
  before insert or update of localidade_id, area_id, obra_id, equipamento_id on public.mapa_equipamentos
  for each row execute function public.fn_mapa_trg_obra_fixa_carreta();

update public.mapa_equipamentos m set obra_id = public.fn_mapa_obra_carretas_emt()
where public.fn_mapa_carreta_emt(m.equipamento_id)
  and m.obra_id is distinct from public.fn_mapa_obra_carretas_emt();

do $migracao$
declare
  v_def text := pg_get_functiondef('public.fn_mapa_estado()'::regprocedure);
  v_marcado text := $t$'estado', v.estado_efetivo, 'estado_mapa', v.estado_mapa,$t$;
  v_rota text := $t$where f.excluido_em is null and f.data_chegada is null$t$;
  v_volta text := $t$where f.excluido_em is null and f.data >= v_hoje - 60)$t$;
  v_cfg text := $t$'tipos_fora_do_mapa', (select valor from public.configuracoes where chave = 'mapa.tipos_fora_do_mapa'))$t$;
  v_ancora text;
begin
  if position('carreta_emt' in v_def) > 0 then
    raise notice 'fn_mapa_estado já tem carreta_emt; nada a fazer';
    return;
  end if;
  foreach v_ancora in array array[v_marcado, v_rota, v_volta, v_cfg] loop
    if (length(v_def) - length(replace(v_def, v_ancora, ''))) / length(v_ancora) <> 1 then
      raise exception 'fn_mapa_estado sem a âncora esperada (%); nada alterado', left(v_ancora, 40);
    end if;
  end loop;

  v_def := replace(v_def, v_marcado, v_marcado || $t$
      'carreta_emt', public.fn_mapa_carreta_emt(v.equipamento_id),$t$);
  v_def := replace(v_def, v_rota, v_rota || $t$
        and f.transportadora_id = public.fn_mapa_transportadora_emt()$t$);
  v_def := replace(v_def, v_volta,
    $t$where f.excluido_em is null and f.data >= v_hoje - 60
          and f.transportadora_id = public.fn_mapa_transportadora_emt())$t$);
  v_def := replace(v_def, v_cfg,
    $t$'tipos_fora_do_mapa', (select valor from public.configuracoes where chave = 'mapa.tipos_fora_do_mapa'),
      'obra_carretas_emt', public.fn_mapa_obra_carretas_emt())$t$);
  execute v_def;
end
$migracao$;

revoke all on function public.fn_mapa_estado() from public, anon;
grant execute on function public.fn_mapa_estado() to authenticated;
