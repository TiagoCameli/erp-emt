-- Módulo Mapa v1.29 (17/10/2026): trava nas gravações e avisos na tela.
--
-- 1. fn_mapa_mover_equipamentos e fn_mapa_mover_colaboradores leem o "antes" com FOR UPDATE. Sem a trava, dois arrastes da mesma máquina ao mesmo tempo gravavam
--    um "de" velho em mapa_movimentacoes, e o Desfazer (que restaura pelo "de") voltava para o
--    lugar errado. O corpo vai INTEIRO aqui (CREATE OR REPLACE), copiado do banco vivo em
--    17/10/2026 (md5 conferido antes de editar; reconferido no rebase: o vivo ganhou a trava de
--    funcionário inativo no RH e a do diarista fora do mapa, 20261017230000, que seguem aqui; por
--    isso a versão vem depois dela): a versão vigente passa a estar no repositório,
--    em vez de remendada por troca de texto (v1.19 a v1.27). fn_mapa_marcar_estado e
--    fn_mapa_marcar_estado_na_data ficam como a v1.28 (data efetiva) deixou: a trava nelas vai
--    junto da próxima mudança dessas funções.
-- 2. fn_mapa_avisos(): alertas abertos que ainda valem (mapa_alertas, recalculado de hora em hora
--    pelo cron) e as movimentações de hoje, para a faixa de alertas e o realce "Mudou hoje".
--    As tabelas mapa_* não têm grant para authenticated (tudo passa por RPC), por isso a leitura
--    é por função SECURITY DEFINER que cobra mapa.mapa/ver.
--
-- Idempotente (só CREATE OR REPLACE). Sem mudança de tabela.

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
  if exists (select 1 from unnest(p_ids) i where not public.fn_mapa_colaborador_no_mapa(i)) then
    raise exception 'Diarista fora do mapa: entra por "Adicionar diarista".' using errcode = 'P0001';
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
    -- v1.29: trava a linha da pessoa até o fim da transação.
    select to_jsonb(c) into v_antes from public.mapa_colaboradores c where c.colaborador_id = v_id for update;
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

CREATE OR REPLACE FUNCTION public.fn_mapa_mover_equipamentos(p_ids uuid[], p_destino jsonb, p_data date, p_motivo text)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_id uuid; v_n int := 0; v_bloqueio text;
  v_dest jsonb; v_ajuste boolean := coalesce((p_destino->>'ajuste')::boolean, false); v_estado text; v_antes jsonb; v_pos extensions.geometry; v_km numeric;
  v_frente uuid; v_trecho uuid; v_area uuid; v_local uuid; v_obra uuid;
begin
  perform public.fn_mapa_exigir('editar');
  if p_ids is null or array_length(p_ids, 1) is null then raise exception 'Nenhum equipamento informado'; end if;
  if p_destino->>'lng' is null or p_destino->>'lat' is null then raise exception 'Destino sem coordenada'; end if;

  v_dest := public.fn_mapa_resolver_destino((p_destino->>'lng')::double precision, (p_destino->>'lat')::double precision);
  v_trecho := coalesce((p_destino->>'trecho_id')::uuid, (v_dest->>'trecho_id')::uuid);
  v_area   := coalesce((p_destino->>'area_id')::uuid, (v_dest->>'area_id')::uuid);
  v_local  := coalesce((p_destino->>'localidade_id')::uuid, (v_dest->>'localidade_id')::uuid);
  v_obra   := coalesce((p_destino->>'obra_id')::uuid, (v_dest->>'obra_id')::uuid);
  v_frente := (p_destino->>'frente_id')::uuid;
  v_estado := coalesce(p_destino->>'estado', v_dest->>'estado');
  if v_estado is not null and v_estado not in ('operando','parado','em_rota','quebrado_obra','esperando_conserto','conserto') then raise exception 'Estado inválido: %', v_estado; end if;
  v_pos := extensions.st_setsrid(extensions.st_makepoint((p_destino->>'lng')::double precision,
                                                         (p_destino->>'lat')::double precision), 4326);
  v_km := (v_dest->>'km')::numeric;

  if v_frente is null and v_trecho is not null then
    select f.id into v_frente from public.mapa_frentes f
    where f.trecho_id = v_trecho and f.data = coalesce(p_data, (now() at time zone 'America/Rio_Branco')::date)
      and (v_km is null or f.km_inicial is null or f.km_final is null or v_km between least(f.km_inicial, f.km_final) and greatest(f.km_inicial, f.km_final))
    order by f.created_at desc limit 1;
  end if;
  if v_obra is null and v_frente is not null then select obra_id into v_obra from public.mapa_frentes where id = v_frente; end if;
  -- v1.21: "Sem obra" escolhido de propósito vence a obra da zona.
  if coalesce((p_destino->>'sem_obra')::boolean, false) then v_obra := null; end if;

  foreach v_id in array p_ids loop
    v_bloqueio := public.fn_mapa_motivo_fora_do_mapa(v_id);
    if v_bloqueio is not null then raise exception '%', v_bloqueio; end if;
    -- v1.29: trava a linha da máquina até o fim da transação: dois arrastes da mesma máquina ao
    -- mesmo tempo esperam um pelo outro, e o "de" da trilha (base do Desfazer) é sempre o real.
    select to_jsonb(m) into v_antes from public.mapa_equipamentos m where m.equipamento_id = v_id for update;
    if v_antes is null then
      insert into public.mapa_equipamentos (equipamento_id) values (v_id);
      v_antes := '{}'::jsonb;
    end if;
    if (v_antes->>'fonte_posicao') = 'gps' then
      raise exception 'Equipamento % tem posição por GPS: não pode ser arrastado', v_id;
    end if;
    if v_ajuste then
      if (v_antes->>'posicao') is null then
        raise exception 'Equipamento % ainda não tem posição: use Posicionar', v_id;
      end if;
      update public.mapa_equipamentos m set
        posicao = v_pos, trecho_id = v_trecho, area_id = v_area, localidade_id = v_local, km_atual = v_km,
        updated_by = auth.uid()
      where m.equipamento_id = v_id;
      insert into public.mapa_movimentacoes (tipo, alvo, alvo_id, de, para, motivo, data_efetiva)
      values ('posicao', 'equipamento', v_id,
              jsonb_build_object('posicao', v_antes->'posicao', 'trecho_id', v_antes->'trecho_id', 'area_id', v_antes->'area_id',
                                 'localidade_id', v_antes->'localidade_id', 'km', v_antes->'km_atual'),
              jsonb_build_object('lng', (p_destino->>'lng')::double precision, 'lat', (p_destino->>'lat')::double precision,
                                 'trecho_id', v_trecho, 'area_id', v_area, 'localidade_id', v_local, 'km', v_km),
              p_motivo, coalesce(p_data, (now() at time zone 'America/Rio_Branco')::date));
      v_n := v_n + 1;
      continue;
    end if;
    -- v1.27: transferir não muda o estado. O pedido explícito vence; quem já está no mapa fica
    -- com o estado que tem; o da zona só vale na primeira entrada.
    v_estado := coalesce(p_destino->>'estado',
                         case when (v_antes->>'posicao') is not null then v_antes->>'estado' end,
                         v_dest->>'estado');
    if v_estado is null then
      raise exception 'Fora de qualquer zona: informe o estado (operando, parado ou em_rota)';
    end if;
    -- v1.21: não perde a obra calado. Tinha obra e o ponto não é de nenhuma: a pessoa escolhe.
    if v_obra is null and (v_antes->>'obra_id') is not null
       and not coalesce((p_destino->>'sem_obra')::boolean, false) then
      raise exception '% sairia da obra: o ponto não é de nenhuma obra. Escolha a obra de destino, ou "Sem obra"',
        coalesce((select e.codigo from public.equipamentos e where e.id = v_id), 'O equipamento');
    end if;
    update public.mapa_equipamentos m set
      no_mapa = true,
      posicao = v_pos, estado = v_estado,
      estado_desde = case when m.estado is distinct from v_estado then now() else m.estado_desde end,
      obra_id = v_obra, trecho_id = v_trecho, frente_id = v_frente, area_id = v_area, localidade_id = v_local,
      km_atual = v_km, quebra_descricao = case when v_estado in ('quebrado_obra','esperando_conserto') then m.quebra_descricao end,
      deslocamento = case when v_estado = 'em_rota' then coalesce(p_destino->'deslocamento', m.deslocamento) end,
      conserto_motivo   = case when v_estado = 'conserto' then coalesce(p_destino->>'conserto_motivo', m.conserto_motivo, p_motivo) end,
      conserto_entrada  = case when v_estado = 'conserto' then coalesce(m.conserto_entrada, p_data, (now() at time zone 'America/Rio_Branco')::date) end,
      conserto_previsao = case when v_estado = 'conserto' then coalesce((p_destino->>'conserto_previsao')::date, m.conserto_previsao) end,
      updated_by = auth.uid()
    where m.equipamento_id = v_id;
    insert into public.mapa_movimentacoes (tipo, alvo, alvo_id, de, para, motivo, data_efetiva)
    values (case when (v_antes->>'posicao') is null then 'posicao' else 'transferencia' end, 'equipamento', v_id,
            jsonb_build_object('obra_id', v_antes->'obra_id', 'trecho_id', v_antes->'trecho_id', 'frente_id', v_antes->'frente_id',
                               'area_id', v_antes->'area_id', 'localidade_id', v_antes->'localidade_id', 'estado', v_antes->'estado', 'km', v_antes->'km_atual'),
            v_dest || jsonb_build_object('obra_id', v_obra, 'trecho_id', v_trecho, 'frente_id', v_frente, 'area_id', v_area,
                                         'localidade_id', v_local, 'estado', v_estado, 'km', v_km),
            p_motivo, coalesce(p_data, (now() at time zone 'America/Rio_Branco')::date));
    v_n := v_n + 1;
  end loop;
  return v_n;
end $function$;

create or replace function public.fn_mapa_avisos()
returns jsonb
language plpgsql
stable
security definer
set search_path to ''
as $function$
declare
  v_hoje date := (now() at time zone 'America/Rio_Branco')::date;
begin
  perform public.fn_mapa_exigir('ver');
  return jsonb_build_object(
    'hoje', v_hoje,
    -- Alertas abertos que ainda valem agora: o cron recalcula de hora em hora, e o alerta de uma
    -- máquina que já saiu daquele estado (ou do frete que já chegou) não aparece na tela.
    'alertas', coalesce((
      select jsonb_agg(jsonb_build_object(
               'id', a.id, 'tipo', a.tipo, 'alvo', a.alvo, 'alvo_id', a.alvo_id,
               'mensagem', a.mensagem, 'criado_em', a.criado_em)
             order by a.criado_em desc)
      from public.mapa_alertas a
      where a.resolvido_em is null
        and case
              when a.alvo = 'equipamento'
                   and a.tipo in ('parado_patio', 'quebrado_obra', 'esperando_conserto', 'conserto_atrasado') then
                exists (
                  select 1 from public.v_mapa_equipamentos v
                  where v.equipamento_id = a.alvo_id and v.ativo and v.no_mapa
                    and v.estado_efetivo = case a.tipo
                                             when 'parado_patio' then 'parado'
                                             when 'conserto_atrasado' then 'conserto'
                                             else a.tipo
                                           end)
              when a.alvo = 'frete' then
                exists (
                  select 1 from public.fretes f
                  where f.id = a.alvo_id and f.data_chegada is null and f.excluido_em is null)
              else true
            end
    ), '[]'::jsonb),
    -- O que mudou hoje (desde 0h no Acre), sem o que foi desfeito: realça no mapa.
    'mudancas_hoje', coalesce((
      select jsonb_agg(jsonb_build_object(
               'alvo', m.alvo, 'alvo_id', m.alvo_id, 'tipo', m.tipo, 'criado_em', m.criado_em)
             order by m.criado_em desc)
      from public.mapa_movimentacoes m
      where m.criado_em >= (v_hoje::timestamp at time zone 'America/Rio_Branco')
        and m.desfeita_em is null
    ), '[]'::jsonb)
  );
end $function$;

revoke all on function public.fn_mapa_avisos() from public, anon;
grant execute on function public.fn_mapa_avisos() to authenticated;
