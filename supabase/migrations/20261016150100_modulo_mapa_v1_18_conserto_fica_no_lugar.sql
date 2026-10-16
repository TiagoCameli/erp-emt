-- Mapa v1.18: marcar "Em conserto" não move a máquina (Tiago, 16/10/2026).
-- Antes, o conserto levava a máquina para a zona da oficina ou, sem zona, para o local
-- oficina/pátio (Colorado primeiro) e tirava trecho, frente e km. Agora só muda o estado e
-- os dados do conserto; posição, área, local, trecho, frente e km ficam como estavam. Mudar
-- de lugar é só pela transferência (ou pelo arraste).
-- Partindo da definição viva (pg_get_functiondef em 16/10), sem mudar assinatura nem grants.

create or replace function public.fn_mapa_marcar_estado(p_id uuid, p_estado text, p_motivo text, p_descricao text default null, p_deslocamento jsonb default null, p_previsao date default null)
 returns void
 language plpgsql
 security definer
 set search_path to ''
as $function$
declare v_antes jsonb; v_bloqueio text;
begin
  perform public.fn_mapa_exigir('editar');
  if p_estado not in ('operando','parado','em_rota','quebrado_obra','conserto') then
    raise exception 'Estado inválido: %', p_estado;
  end if;
  v_bloqueio := public.fn_mapa_motivo_fora_do_mapa(p_id);
  if v_bloqueio is not null then raise exception '%', v_bloqueio; end if;
  select to_jsonb(m) into v_antes from public.mapa_equipamentos m where m.equipamento_id = p_id;
  if v_antes is null then
    insert into public.mapa_equipamentos (equipamento_id) values (p_id);
    v_antes := '{}'::jsonb;
  end if;
  update public.mapa_equipamentos m set
    estado = p_estado,
    estado_desde = case when m.estado is distinct from p_estado then now() else m.estado_desde end,
    quebra_descricao = case when p_estado = 'quebrado_obra' then p_descricao end,
    deslocamento = case when p_estado = 'em_rota' then coalesce(p_deslocamento, m.deslocamento) end,
    conserto_motivo   = case when p_estado = 'conserto' then coalesce(p_descricao, p_motivo) end,
    conserto_entrada  = case when p_estado = 'conserto' then coalesce(case when m.estado = 'conserto' then m.conserto_entrada end, (now() at time zone 'America/Rio_Branco')::date) end,
    conserto_previsao = case when p_estado = 'conserto' then coalesce(p_previsao, case when m.estado = 'conserto' then m.conserto_previsao end) end,
    updated_by = auth.uid()
  where m.equipamento_id = p_id;
  insert into public.mapa_movimentacoes (tipo, alvo, alvo_id, de, para, motivo)
  values ('estado', 'equipamento', p_id, jsonb_build_object('estado', v_antes->'estado'),
          jsonb_build_object('estado', p_estado, 'descricao', p_descricao, 'previsao', p_previsao, 'deslocamento', p_deslocamento), p_motivo);
end $function$;
