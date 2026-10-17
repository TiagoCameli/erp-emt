-- Prova de 20261017150000_colaborador_dias_local, rodada DEPOIS da migration na mesma transação:
-- termina com raise exception, então nada fica gravado.
do $prova$
declare
  v_tiago uuid := 'c66fca9f-5428-4fb9-855f-dcff548764df';
  v_andreia uuid := '20102254-a5a7-4d66-bf31-d4b4dc61ff79';
  v_silo uuid := '4a860337-90c4-462c-b95c-62539382717b';
  v_hoje date := (now() at time zone 'America/Rio_Branco')::date;
  v_outro uuid;
  v_json jsonb;
begin
  -- 1. Dias fechados ganharam o local pela auditoria: Andreia foi para o Silo na noite de 16/10.
  if (select localidade_id from public.colaborador_dias_centro where dia = '2026-10-16' and colaborador_id = v_andreia) is distinct from v_silo then
    raise exception 'FALHA: 16/10 da Andreia sem o Silo';
  end if;
  if (select localidade_id from public.colaborador_dias_centro where dia = '2026-10-15' and colaborador_id = v_andreia) is not null then
    raise exception 'FALHA: 15/10 da Andreia com local (ela não tinha)';
  end if;

  -- 2. Ficha: local desde 16/10, centro desde o primeiro dia, mudanças com data.
  perform set_config('request.jwt.claims', json_build_object('sub', v_tiago, 'role', 'authenticated')::text, true);
  v_json := public.fn_mapa_centros_colaborador(v_andreia);
  if v_json->'local_atual'->>'nome' <> 'Silo' or v_json->'local_atual'->>'desde' <> '2026-10-16' then
    raise exception 'FALHA: local_atual %', v_json->'local_atual';
  end if;
  if v_json->'centro_atual'->>'desde' <> '2026-10-14' or v_json->'centro_atual'->>'centro_nome' <> 'Pessoal Sem Alocação' then
    raise exception 'FALHA: centro_atual %', v_json->'centro_atual';
  end if;
  if jsonb_array_length(v_json->'mudancas_local') <> 2 or v_json->'mudancas_local'->0->>'data' <> '2026-10-16'
     or v_json->'mudancas_local'->1->>'nome' is not null then
    raise exception 'FALHA: mudancas_local %', v_json->'mudancas_local';
  end if;
  if jsonb_array_length(v_json->'mudancas_centro') <> 1 then
    raise exception 'FALHA: mudancas_centro %', v_json->'mudancas_centro';
  end if;

  -- 3. Controle: troca o local e põe numa obra hoje -> mudança de local E de centro com a data de hoje.
  select id into v_outro from public.localidades where ativo and id <> v_silo limit 1;
  update public.mapa_colaboradores
     set localidade_id = v_outro, obra_id = 'b4e8f851-8301-48e5-be82-653ddbffe725'
   where colaborador_id = v_andreia;
  v_json := public.fn_mapa_centros_colaborador(v_andreia);
  if (v_json->'local_atual'->>'localidade_id')::uuid <> v_outro or (v_json->'local_atual'->>'desde')::date <> v_hoje then
    raise exception 'FALHA: troca de local %', v_json->'local_atual';
  end if;
  if (v_json->'mudancas_local'->0->>'antes_nome') <> 'Silo' then
    raise exception 'FALHA: mudança de local sem o antes %', v_json->'mudancas_local'->0;
  end if;
  if (v_json->'centro_atual'->>'desde')::date <> v_hoje
     or v_json->'mudancas_centro'->0->>'antes_nome' <> 'Pessoal Sem Alocação' then
    raise exception 'FALHA: troca de centro %', v_json->'mudancas_centro';
  end if;

  -- 4. Fechar hoje grava o local de agora.
  perform set_config('request.jwt.claims', '', true);
  perform public.fn_colab_dias_fechar();
  if (select localidade_id from public.colaborador_dias_centro where dia = v_hoje and colaborador_id = v_andreia) <> v_outro then
    raise exception 'FALHA: fechar não gravou o local';
  end if;

  -- 5. Reparo de um dia sem linha usa o local da auditoria.
  delete from public.colaborador_dias_centro where dia = '2026-10-16';
  perform public.fn_colab_dias_reparar('2026-10-16');
  if (select localidade_id from public.colaborador_dias_centro where dia = '2026-10-16' and colaborador_id = v_andreia) is distinct from v_silo then
    raise exception 'FALHA: reparo sem o local';
  end if;

  raise exception 'PROVA OK: local %, centro %', v_json->'local_atual', v_json->'centro_atual';
end
$prova$;
