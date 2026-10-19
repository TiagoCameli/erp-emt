-- Prova de 20261017233100_modulo_mapa_v1_30_alocacao, rodada DEPOIS da migration na mesma
-- transação: termina com raise exception, então nada fica gravado. Acha as máquinas e as pessoas
-- no banco vivo (não fixa id): M1 e M3 com operador, M2 sem, P livre, L um local.
do $prova$
declare
  v_tiago uuid := 'c66fca9f-5428-4fb9-855f-dcff548764df';
  m1 uuid; x1 uuid; m2 uuid; m3 uuid; x3 uuid; p uuid; l uuid; o2 uuid; cc uuid;
  v_obra_m3 uuid; v_obra_x3 uuid; v_mov bigint; v_n int; v_pos jsonb; v_falhou boolean; v_falhou_id uuid;
begin
  perform set_config('request.jwt.claims', json_build_object('sub', v_tiago, 'role', 'authenticated')::text, true);

  select m.equipamento_id, m.operador_colaborador_id into m1, x1
  from public.mapa_equipamentos m
  where m.operador_colaborador_id is not null and m.no_mapa and public.fn_mapa_colaborador_no_mapa(m.operador_colaborador_id)
  order by m.equipamento_id limit 1;
  select m.equipamento_id, m.operador_colaborador_id, m.obra_id into m3, x3, v_obra_m3
  from public.mapa_equipamentos m
  where m.operador_colaborador_id is not null and m.no_mapa and m.posicao is not null
    and m.fonte_posicao = 'manual' and m.equipamento_id <> m1 and m.estado not in ('fora_funcionamento')
    and public.fn_mapa_motivo_fora_do_mapa(m.equipamento_id) is null
    and public.fn_mapa_colaborador_no_mapa(m.operador_colaborador_id)
  order by m.equipamento_id limit 1;
  select m.equipamento_id into m2 from public.mapa_equipamentos m
  where m.operador_colaborador_id is null and m.no_mapa and m.equipamento_id not in (m1, m3)
  order by m.equipamento_id limit 1;
  select c.id into p from public.colaboradores c
  where public.fn_mapa_colaborador_no_mapa(c.id)
    and not exists (select 1 from public.mapa_equipamentos m where m.operador_colaborador_id = c.id)
  order by c.id limit 1;
  select id into l from public.localidades where ativo order by id limit 1;
  select id into o2 from public.obras where id is distinct from v_obra_m3 order by id limit 1;
  select id into cc from public.centros_custo where ativo order by id limit 1;
  if m1 is null or m2 is null or m3 is null or p is null or l is null then
    raise exception 'FALHA: faltou dado para a prova (m1 %, m2 %, m3 %, p %, l %)', m1, m2, m3, p, l;
  end if;
  select obra_id into v_obra_x3 from public.mapa_colaboradores where colaborador_id = x3;

  -- 1. Pessoa em duas máquinas é impossível.
  perform public.fn_mapa_assinalar_operador(m2, x1, 'prova');
  if (select operador_colaborador_id from public.mapa_equipamentos where equipamento_id = m1) is not null then
    raise exception 'FALHA 1a: x1 continuou na m1';
  end if;
  if (select equipamento_id from public.mapa_colaboradores where colaborador_id = x1) is distinct from m2 then
    raise exception 'FALHA 1b: o lado da pessoa não foi para a m2';
  end if;
  v_falhou := false;
  begin
    perform set_config('app.mapa_espelho', '1', true); -- sem o espelho, só a trava única segura
    update public.mapa_equipamentos set operador_colaborador_id = x1 where equipamento_id = m1;
  exception when unique_violation then v_falhou := true;
  end;
  if not v_falhou then raise exception 'FALHA 1c: o índice único deixou x1 em duas máquinas'; end if;

  -- 2. Pelos dois lados dá o mesmo resultado.
  insert into public.mapa_colaboradores (colaborador_id) values (p) on conflict (colaborador_id) do nothing;
  update public.mapa_colaboradores set equipamento_id = m1 where colaborador_id = p; -- lado da pessoa
  if (select operador_colaborador_id from public.mapa_equipamentos where equipamento_id = m1) is distinct from p then
    raise exception 'FALHA 2a: pela pessoa, a máquina não ganhou o operador';
  end if;
  perform public.fn_mapa_assinalar_operador(m1, x1, 'prova'); -- lado da máquina, x1 vem da m2
  if (select equipamento_id from public.mapa_colaboradores where colaborador_id = p) is not null
     or (select operador_colaborador_id from public.mapa_equipamentos where equipamento_id = m2) is not null
     or (select equipamento_id from public.mapa_colaboradores where colaborador_id = x1) is distinct from m1 then
    raise exception 'FALHA 2b: trocar pela máquina não soltou p, nem tirou x1 da m2';
  end if;
  if exists (select 1 from public.mapa_equipamentos m left join public.mapa_colaboradores c on c.colaborador_id = m.operador_colaborador_id
             where m.operador_colaborador_id is not null and c.equipamento_id is distinct from m.equipamento_id)
     or exists (select 1 from public.mapa_colaboradores c left join public.mapa_equipamentos m on m.equipamento_id = c.equipamento_id
                where c.equipamento_id is not null and m.operador_colaborador_id is distinct from c.colaborador_id) then
    raise exception 'FALHA 2c: espelho quebrado em alguma linha';
  end if;
  -- trilha: uma linha 'operador' por troca, nenhuma pelo trigger
  select count(*) into v_n from public.mapa_movimentacoes
  where tipo = 'operador' and criado_em = now() and alvo_id in (m1, m2);
  if v_n <> 2 then raise exception 'FALHA 2d: % linhas de operador (esperado 2: as duas assinaladas)', v_n; end if;

  -- 3. Transferir a pessoa solta a máquina.
  perform public.fn_mapa_mover_colaboradores(array[x1], jsonb_build_object('localidade_id', l), null, 'prova');
  if (select operador_colaborador_id from public.mapa_equipamentos where equipamento_id = m1) is not null then
    raise exception 'FALHA 3: x1 foi para o local e a m1 seguiu com ele';
  end if;

  -- 4. Lote: aplica, null explícito limpa, e é tudo ou nada.
  v_n := public.fn_mapa_alocar(jsonb_build_array(
           jsonb_build_object('colaborador_id', p, 'equipamento_id', m2, 'centro_custo_id', cc),
           jsonb_build_object('colaborador_id', x1, 'localidade_id', l)), null, 'prova');
  if v_n <> 2 or (select operador_colaborador_id from public.mapa_equipamentos where equipamento_id = m2) is distinct from p
     or (select centro_custo_id from public.mapa_colaboradores where colaborador_id = p) is distinct from cc then
    raise exception 'FALHA 4a: lote devolveu % (esperado 2: máquina e centro; local de x1 já era l)', v_n;
  end if;
  v_falhou := false;
  begin
    perform public.fn_mapa_alocar(jsonb_build_array(
              jsonb_build_object('colaborador_id', x1, 'equipamento_id', m1),
              jsonb_build_object('colaborador_id', p, 'centro_custo_id', gen_random_uuid())), null, 'prova');
  exception when others then v_falhou := true;
  end;
  if not v_falhou or (select operador_colaborador_id from public.mapa_equipamentos where equipamento_id = m1) is not null then
    raise exception 'FALHA 4b: o lote com um item ruim gravou o item bom';
  end if;
  perform public.fn_mapa_alocar(jsonb_build_array(jsonb_build_object('colaborador_id', p, 'equipamento_id', null)), null, 'prova');
  if (select operador_colaborador_id from public.mapa_equipamentos where equipamento_id = m2) is not null then
    raise exception 'FALHA 4c: equipamento_id null não tirou p da m2';
  end if;
  v_falhou := false;
  begin
    perform public.fn_mapa_alocar(jsonb_build_array(
              jsonb_build_object('colaborador_id', x1, 'equipamento_id', m1),
              jsonb_build_object('colaborador_id', p, 'equipamento_id', m1)), null, 'prova');
  exception when others then v_falhou := true;
  end;
  if not v_falhou then raise exception 'FALHA 4d: a mesma máquina para duas pessoas passou'; end if;

  -- 5. Máquina transferida leva o operador; desfazer volta os dois.
  -- ponto a ~40 km, fora de local e área: no ponto atual a jazida devolve a obra de antes
  select jsonb_build_object('lng', extensions.st_x(posicao) + 0.3, 'lat', extensions.st_y(posicao) + 0.3) into v_pos
  from public.mapa_equipamentos where equipamento_id = m3;
  perform public.fn_mapa_mover_equipamentos(array[m3], v_pos || jsonb_build_object('obra_id', o2), null, 'prova');
  -- controle: a máquina mudou mesmo de obra (senão o 5a passaria sem o trigger)
  if (select obra_id from public.mapa_equipamentos where equipamento_id = m3) is not distinct from v_obra_m3 then
    raise exception 'FALHA 5-controle: a máquina não mudou de obra (%), escolha outro destino', v_obra_m3;
  end if;
  if (select obra_id from public.mapa_colaboradores where colaborador_id = x3) is not distinct from v_obra_x3 then
    raise exception 'FALHA 5a: a máquina mudou de obra e o operador ficou na % de antes', v_obra_x3;
  end if;
  if (select obra_id from public.mapa_colaboradores where colaborador_id = x3)
     is distinct from (select obra_id from public.mapa_equipamentos where equipamento_id = m3) then
    raise exception 'FALHA 5a: a máquina foi para a obra % e o operador ficou em %',
      (select obra_id from public.mapa_equipamentos where equipamento_id = m3),
      (select obra_id from public.mapa_colaboradores where colaborador_id = x3);
  end if;
  select id into v_mov from public.mapa_movimentacoes
  where alvo = 'equipamento' and alvo_id = m3 and criado_em = now() order by id desc limit 1;
  perform public.fn_mapa_desfazer_movimentacao(v_mov, 'prova');
  if (select obra_id from public.mapa_equipamentos where equipamento_id = m3) is distinct from v_obra_m3 then
    raise exception 'FALHA 5b: desfazer não devolveu a obra da máquina';
  end if;
  if (select obra_id from public.mapa_colaboradores where colaborador_id = x3) is distinct from v_obra_m3
     and (select obra_id from public.mapa_colaboradores where colaborador_id = x3) is distinct from v_obra_x3 then
    raise exception 'FALHA 5c: desfazer não levou o operador de volta';
  end if;
  if (select operador_colaborador_id from public.mapa_equipamentos where equipamento_id = m3) is distinct from x3 then
    raise exception 'FALHA 5d: o operador saiu da máquina no caminho';
  end if;

  -- 6. Acesso: authenticated executa o lote, anon não; trigger não é chamável.
  if not has_function_privilege('authenticated', 'public.fn_mapa_alocar(jsonb, date, text)', 'execute')
     or has_function_privilege('anon', 'public.fn_mapa_alocar(jsonb, date, text)', 'execute')
     or has_function_privilege('authenticated', 'public.fn_mapa_trg_espelho_operador_maquina()', 'execute') then
    raise exception 'FALHA 6: grants';
  end if;

  -- 7. Diarista fora do mapa não entra pelo lote (entra por "Adicionar diarista").
  select c.id into v_falhou_id from public.colaboradores c
  where c.ativo and c.data_demissao is null and not public.fn_mapa_colaborador_no_mapa(c.id) limit 1;
  if v_falhou_id is not null then
    v_falhou := false;
    begin
      perform public.fn_mapa_alocar(jsonb_build_array(jsonb_build_object('colaborador_id', v_falhou_id, 'localidade_id', l)), null, 'prova');
    exception when others then v_falhou := true;
    end;
    if not v_falhou then raise exception 'FALHA 7: diarista fora do mapa entrou pelo lote'; end if;
  end if;

  raise exception 'PROVA OK v1.30: m1 %, m2 %, m3 % (obra % -> % e de volta), x1 %, x3 %, p %',
    m1, m2, m3, v_obra_m3, o2, x1, x3, p;
end $prova$;
