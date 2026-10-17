-- Mapa: só funcionário ativo no RH (Tiago, 17/10/2026: "os funcionarios que o modulo do mapa
-- puxa do RH e somente os funcionarios que estao ativos").
--
-- Ativo = `colaboradores.ativo and data_demissao is null`, a mesma regra que fn_mapa_estado,
-- fn_colab_dias_calcular e fn_mapa_marcar_estado_pessoa já usam. A lista da tela já respeitava;
-- faltavam as portas de escrita e o operador de máquina:
--
-- 1. fn_mapa_assinalar_operador e fn_mapa_mover_colaboradores recusam quem não está ativo
--    (antes um id de desligado era aceito e voltava como operador da máquina).
-- 2. Trigger em colaboradores: desligar no RH (ativo → false ou data_demissao preenchida) tira a
--    pessoa da máquina que ela operava no mapa. Sem isso o nome do desligado continuava como
--    operador, porque v_mapa_equipamentos junta o colaborador sem olhar o status.
-- 3. Limpa quem já estiver nessa situação (em 17/10 não havia ninguém).
--
-- Funções alteradas a partir da definição viva; única mudança é a guarda.
-- Rollback: reaplicar as duas funções sem o bloco "if not exists ... ativo" e
--   drop trigger trg_mapa_colaborador_desligado on public.colaboradores;
--   drop function public.fn_mapa_trg_colaborador_desligado();

begin;

create or replace function public.fn_mapa_colaborador_ativo(p_id uuid)
returns boolean
language sql
stable
security definer
set search_path to ''
as $$
  select exists (select 1 from public.colaboradores c where c.id = p_id and c.ativo and c.data_demissao is null)
$$;

revoke all on function public.fn_mapa_colaborador_ativo(uuid) from public, anon, authenticated;

CREATE OR REPLACE FUNCTION public.fn_mapa_assinalar_operador(p_equipamento uuid, p_colaborador uuid, p_motivo text DEFAULT NULL::text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare v_antes uuid;
begin
  perform public.fn_mapa_exigir('editar');
  if p_colaborador is not null and not public.fn_mapa_colaborador_ativo(p_colaborador) then
    raise exception 'Funcionário inativo no RH não entra no Mapa.' using errcode = 'P0001';
  end if;
  insert into public.mapa_equipamentos (equipamento_id) values (p_equipamento) on conflict (equipamento_id) do nothing;
  select operador_colaborador_id into v_antes from public.mapa_equipamentos where equipamento_id = p_equipamento;
  update public.mapa_equipamentos set operador_colaborador_id = p_colaborador, updated_by = auth.uid() where equipamento_id = p_equipamento;
  if p_colaborador is not null then
    insert into public.mapa_colaboradores (colaborador_id) values (p_colaborador) on conflict (colaborador_id) do nothing;
    update public.mapa_equipamentos set operador_colaborador_id = null where operador_colaborador_id = p_colaborador and equipamento_id <> p_equipamento;
    update public.mapa_colaboradores c set equipamento_id = p_equipamento,
      obra_id = coalesce(m.obra_id, c.obra_id), frente_id = coalesce(m.frente_id, c.frente_id), updated_by = auth.uid()
    from public.mapa_equipamentos m where m.equipamento_id = p_equipamento and c.colaborador_id = p_colaborador;
  end if;
  if v_antes is not null and v_antes is distinct from p_colaborador then
    update public.mapa_colaboradores set equipamento_id = null where colaborador_id = v_antes and equipamento_id = p_equipamento;
  end if;
  insert into public.mapa_movimentacoes (tipo, alvo, alvo_id, de, para, motivo)
  values ('operador', 'equipamento', p_equipamento, jsonb_build_object('colaborador_id', v_antes), jsonb_build_object('colaborador_id', p_colaborador), p_motivo);
end $function$;

CREATE OR REPLACE FUNCTION public.fn_mapa_mover_colaboradores(p_ids uuid[], p_destino jsonb, p_data date, p_motivo text)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare v_id uuid; v_n int := 0; v_antes jsonb; v_obra uuid; v_frente uuid; v_equipe uuid;
begin
  perform public.fn_mapa_exigir('editar');
  if exists (select 1 from unnest(p_ids) i where not public.fn_mapa_colaborador_ativo(i)) then
    raise exception 'Funcionário inativo no RH não entra no Mapa.' using errcode = 'P0001';
  end if;
  if p_destino ? 'equipamento_id' and (p_destino->>'equipamento_id') is not null then
    foreach v_id in array p_ids loop
      perform public.fn_mapa_assinalar_operador((p_destino->>'equipamento_id')::uuid, v_id, p_motivo);
      v_n := v_n + 1;
    end loop;
    return v_n;
  end if;
  v_frente := (p_destino->>'frente_id')::uuid;
  v_equipe := (p_destino->>'equipe_id')::uuid;
  v_obra   := (p_destino->>'obra_id')::uuid;
  if v_obra is null and v_frente is not null then select obra_id into v_obra from public.mapa_frentes where id = v_frente; end if;
  if v_obra is null and v_equipe is not null then select obra_id into v_obra from public.mapa_equipes where id = v_equipe; end if;
  if v_frente is null and v_equipe is not null then select frente_id into v_frente from public.mapa_equipes where id = v_equipe; end if;
  foreach v_id in array p_ids loop
    insert into public.mapa_colaboradores (colaborador_id) values (v_id) on conflict (colaborador_id) do nothing;
    select to_jsonb(c) into v_antes from public.mapa_colaboradores c where c.colaborador_id = v_id;
    update public.mapa_colaboradores c set
      obra_id = coalesce(v_obra, c.obra_id), frente_id = v_frente, equipe_id = coalesce(v_equipe, c.equipe_id),
      area_id = (p_destino->>'area_id')::uuid, localidade_id = (p_destino->>'localidade_id')::uuid,
      equipamento_id = null,
      posicao_manual = case when p_destino->>'lng' is not null
        then extensions.st_setsrid(extensions.st_makepoint((p_destino->>'lng')::double precision, (p_destino->>'lat')::double precision), 4326) end,
      updated_by = auth.uid()
    where c.colaborador_id = v_id;
    update public.mapa_equipamentos set operador_colaborador_id = null where operador_colaborador_id = v_id;
    insert into public.mapa_movimentacoes (tipo, alvo, alvo_id, de, para, motivo, data_efetiva)
    values ('transferencia', 'colaborador', v_id,
            jsonb_build_object('obra_id', v_antes->'obra_id', 'frente_id', v_antes->'frente_id', 'equipe_id', v_antes->'equipe_id', 'equipamento_id', v_antes->'equipamento_id'),
            jsonb_build_object('obra_id', v_obra, 'frente_id', v_frente, 'equipe_id', v_equipe),
            p_motivo, coalesce(p_data, (now() at time zone 'America/Rio_Branco')::date));
    v_n := v_n + 1;
  end loop;
  return v_n;
end $function$;

-- Desligou no RH: sai da máquina que operava no mapa.
create or replace function public.fn_mapa_trg_colaborador_desligado()
returns trigger
language plpgsql
security definer
set search_path to ''
as $$
begin
  if (old.ativo and old.data_demissao is null) and not (new.ativo and new.data_demissao is null) then
    update public.mapa_equipamentos set operador_colaborador_id = null where operador_colaborador_id = new.id;
    update public.mapa_colaboradores set equipamento_id = null where colaborador_id = new.id and equipamento_id is not null;
  end if;
  return null;
end $$;

revoke all on function public.fn_mapa_trg_colaborador_desligado() from public, anon, authenticated;

drop trigger if exists trg_mapa_colaborador_desligado on public.colaboradores;
create trigger trg_mapa_colaborador_desligado
  after update of ativo, data_demissao on public.colaboradores
  for each row execute function public.fn_mapa_trg_colaborador_desligado();

update public.mapa_equipamentos m set operador_colaborador_id = null
where m.operador_colaborador_id is not null and not public.fn_mapa_colaborador_ativo(m.operador_colaborador_id);
update public.mapa_colaboradores mc set equipamento_id = null
where mc.equipamento_id is not null and not public.fn_mapa_colaborador_ativo(mc.colaborador_id);

commit;
