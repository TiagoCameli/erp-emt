-- Módulo Mapa v1.25 (16/10/2026), pedido do Tiago: "acrescente um status quebrado esperando
-- conserto".
--
-- Estado novo da máquina, 'esperando_conserto' ("Quebrado esperando conserto"): quebrada e
-- parada, esperando a vez na oficina ou a peça. Diferente de 'quebrado_obra' (quebrou na frente)
-- e de 'conserto' (já está sendo consertada, com previsão). Pede o defeito, como o quebrado na
-- obra (mapa_equipamentos.quebra_descricao), e fica onde está.
--
-- 1. mapa_equipamentos.estado aceita o valor novo (CHECK refeito com a lista inteira).
-- 2. fn_mapa_marcar_estado e fn_mapa_mover_equipamentos: aceitam o estado e guardam o defeito
--    para ele também.
-- 3. fn_mapa_alertas_recalcular: alerta "quebrado esperando conserto", ao lado do "quebrado na
--    obra".
--
-- A v_mapa_equipamentos repassa m.estado e a fn_equip_centro_regra manda todo estado que não é
-- operando para "Equipamento Sem Alocação" (motivo = o próprio estado): nada a mudar nelas.
--
-- As funções são editadas a partir da definição VIVA (pg_get_functiondef + âncoras conferidas,
-- uma vez cada), para não desfazer o que outras frentes do Mapa aplicaram. Idempotente.

begin;

alter table public.mapa_equipamentos drop constraint if exists mapa_equipamentos_estado_check;
alter table public.mapa_equipamentos add constraint mapa_equipamentos_estado_check
  check (estado in ('operando','parado','em_rota','quebrado_obra','esperando_conserto','conserto','fora_funcionamento'));

do $migracao$
declare
  v_def text;
  v_fn text;
  v_ancoras text[];
  v_novas text[];
  i int;
begin
  foreach v_fn in array array['fn_mapa_marcar_estado', 'fn_mapa_mover_equipamentos', 'fn_mapa_alertas_recalcular'] loop
    select pg_get_functiondef(p.oid) into v_def
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname = v_fn;
    if v_def is null then raise exception '% não encontrada', v_fn; end if;

    if position('esperando_conserto' in v_def) > 0 then
      raise notice 'v1.25 já aplicada em %', v_fn;
      continue;
    end if;

    if v_fn = 'fn_mapa_marcar_estado' then
      v_ancoras := array[
        $a$'quebrado_obra','conserto','fora_funcionamento')$a$,
        $a$quebra_descricao = case when p_estado = 'quebrado_obra' then p_descricao end$a$];
      v_novas := array[
        $a$'quebrado_obra','esperando_conserto','conserto','fora_funcionamento')$a$,
        $a$quebra_descricao = case when p_estado in ('quebrado_obra','esperando_conserto') then p_descricao end$a$];
    elsif v_fn = 'fn_mapa_mover_equipamentos' then
      v_ancoras := array[
        $a$('operando','parado','em_rota','quebrado_obra','conserto')$a$,
        $a$quebra_descricao = case when v_estado = 'quebrado_obra' then m.quebra_descricao end$a$];
      v_novas := array[
        $a$('operando','parado','em_rota','quebrado_obra','esperando_conserto','conserto')$a$,
        $a$quebra_descricao = case when v_estado in ('quebrado_obra','esperando_conserto') then m.quebra_descricao end$a$];
    else
      v_ancoras := array[
        $a$v.estado_efetivo = 'quebrado_obra'
  union all
$a$];
      v_novas := array[
        $a$v.estado_efetivo = 'quebrado_obra'
  union all
  select 'esperando_conserto', 'equipamento', v.equipamento_id, format('%s quebrado esperando conserto', coalesce(v.codigo, v.descricao)), '{}'::jsonb
  from public.v_mapa_equipamentos v where v.ativo and v.no_mapa and v.estado_efetivo = 'esperando_conserto'
  union all
$a$];
    end if;

    for i in 1 .. array_length(v_ancoras, 1) loop
      if (length(v_def) - length(replace(v_def, v_ancoras[i], ''))) / length(v_ancoras[i]) <> 1 then
        raise exception '%: âncora % não encontrada uma vez só', v_fn, i;
      end if;
      v_def := replace(v_def, v_ancoras[i], v_novas[i]);
    end loop;

    execute v_def;
  end loop;
end
$migracao$;

commit;
