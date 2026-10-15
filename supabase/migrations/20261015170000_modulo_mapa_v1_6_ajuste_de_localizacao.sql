-- Módulo Mapa v1.6: ajuste de localização não é transferência
--
-- Pedido do Tiago (15/10/2026): nem toda mudança de lugar é transferência; às vezes é só corrigir
-- o ponto no mapa. fn_mapa_mover_equipamentos passa a aceitar `ajuste: true` no p_destino (sem
-- mudar a assinatura):
--   - ajuste: atualiza só a geografia (posição, trecho, área, local, km). Estado, "desde", obra e
--     frente ficam como estavam. Não pede estado nem quando cai fora de qualquer zona. Só vale
--     para máquina que já tem posição. Registra tipo 'posicao' (já previsto no CHECK).
--   - sem ajuste: igual a antes, mas a primeira colocação no mapa (sem posição anterior) também
--     registra 'posicao'; 'transferencia' fica só para mudança de lugar de quem já estava no mapa.
--
-- Alterada a partir da definição viva, trocando quatro trechos que precisam aparecer uma vez só;
-- CREATE OR REPLACE mantém os grants.

do $migracao$
declare
  v_def text := pg_get_functiondef('public.fn_mapa_mover_equipamentos(uuid[], jsonb, date, text)'::regprocedure);
  v_trocas text[][] := array[
    [
      $t$v_dest jsonb; v_estado text;$t$,
      $t$v_dest jsonb; v_ajuste boolean := coalesce((p_destino->>'ajuste')::boolean, false); v_estado text;$t$
    ],
    [
      $t$if v_estado is null then raise exception 'Fora de qualquer zona: informe o estado (operando, parado ou em_rota)'; end if;
  if v_estado not in$t$,
      $t$if v_estado is null and not v_ajuste then raise exception 'Fora de qualquer zona: informe o estado (operando, parado ou em_rota)'; end if;
  if v_estado is not null and v_estado not in$t$
    ],
    [
      $t$    update public.mapa_equipamentos m set
      no_mapa = true,$t$,
      $t$    if v_ajuste then
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
    update public.mapa_equipamentos m set
      no_mapa = true,$t$
    ],
    [
      $t$    values ('transferencia', 'equipamento', v_id,$t$,
      $t$    values (case when (v_antes->>'posicao') is null then 'posicao' else 'transferencia' end, 'equipamento', v_id,$t$
    ]
  ];
  i int;
begin
  for i in 1 .. array_length(v_trocas, 1) loop
    if (length(v_def) - length(replace(v_def, v_trocas[i][1], ''))) / length(v_trocas[i][1]) <> 1 then
      raise exception 'Trecho % não aparece uma vez só em fn_mapa_mover_equipamentos; nada alterado', i;
    end if;
    v_def := replace(v_def, v_trocas[i][1], v_trocas[i][2]);
  end loop;
  execute v_def;
end
$migracao$;
