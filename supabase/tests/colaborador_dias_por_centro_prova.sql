-- Prova de 20261017010000_colaborador_dias_por_centro, rodada DEPOIS da migration na mesma
-- transação (ver o fim): termina com raise exception, então nada fica gravado.
-- Controle: o ramo "obra" e o ramo "escolhido" só são provados forçando uma pessoa numa obra e um
-- centro escolhido (hoje todo mundo está no Silo, sem obra).
do $prova$
declare
  v_tiago uuid := 'c66fca9f-5428-4fb9-855f-dcff548764df';
  v_andreia uuid := '20102254-a5a7-4d66-bf31-d4b4dc61ff79';
  v_obra uuid := 'b4e8f851-8301-48e5-be82-653ddbffe725';       -- 009
  v_raiz uuid := 'fbfb8cad-6ecb-40f0-984c-f4f0e87dc2c0';       -- raiz da 009
  v_sem uuid := public.fn_mapa_centro_pessoal_sem_alocacao();
  v_outro uuid;
  v_outra_pessoa uuid;
  v_ativos int;
  v_n int;
  r record;
  v_json jsonb;
begin
  if v_sem is null then raise exception 'FALHA: centro Pessoal Sem Alocação não criado'; end if;
  if exists (select 1 from public.centros_custo where id = v_sem and (tipo <> 'pessoal' or papel_rateio <> 'indireto' or pai_id is not null)) then
    raise exception 'FALHA: Pessoal Sem Alocação com tipo/rateio/nível errados';
  end if;
  if exists (select 1 from public.centros_custo where id = v_sem and tipo = 'escritorio') then
    raise exception 'FALHA: centro novo com tipo escritorio confundiria a folha';
  end if;

  -- 1. Uma linha por colaborador ativo, sem repetir.
  select count(*) into v_ativos from public.colaboradores where ativo and data_demissao is null;
  select count(*) into v_n from public.fn_colab_dias_calcular();
  if v_n <> v_ativos then raise exception 'FALHA: calcular deu % linhas para % ativos', v_n, v_ativos; end if;
  select count(distinct colaborador_id) into v_n from public.fn_colab_dias_calcular();
  if v_n <> v_ativos then raise exception 'FALHA: calcular repetiu pessoa'; end if;

  -- 2. Andreia (no Silo, sem obra, sem centro escolhido): Sem Alocação, sem_obra, trabalhando.
  select * into r from public.fn_colab_dias_calcular() where colaborador_id = v_andreia;
  if r.centro_custo_id <> v_sem or r.motivo <> 'sem_obra' or r.estado <> 'trabalhando' then
    raise exception 'FALHA: Andreia deu % / % / %', r.centro_custo_id, r.motivo, r.estado;
  end if;

  -- 3. Controle do ramo obra: põe a Andreia na 009.
  update public.mapa_colaboradores set obra_id = v_obra, localidade_id = null where colaborador_id = v_andreia;
  select * into r from public.fn_colab_dias_calcular() where colaborador_id = v_andreia;
  if r.centro_custo_id <> v_raiz or r.motivo <> 'obra' then
    raise exception 'FALHA: Andreia na 009 deu % / %', r.centro_custo_id, r.motivo;
  end if;

  -- 4. Centro escolhido na ficha (v1.26) ganha da obra.
  select id into v_outro from public.centros_custo where ativo and id not in (v_raiz, v_sem) and pai_id is null limit 1;
  update public.mapa_colaboradores set centro_custo_id = v_outro where colaborador_id = v_andreia;
  select * into r from public.fn_colab_dias_calcular() where colaborador_id = v_andreia;
  if r.centro_custo_id <> v_outro or r.motivo <> 'escolhido' then
    raise exception 'FALHA: centro escolhido deu % / %', r.centro_custo_id, r.motivo;
  end if;

  -- 5. Marcar parado pela RPC (como o Tiago): vai para Sem Alocação mesmo com centro escolhido, e
  --    deixa a trilha no histórico.
  perform set_config('request.jwt.claims', json_build_object('sub', v_tiago, 'role', 'authenticated')::text, true);
  perform public.fn_mapa_marcar_estado_pessoa(v_andreia, 'parado', null);
  select * into r from public.fn_colab_dias_calcular() where colaborador_id = v_andreia;
  if r.centro_custo_id <> v_sem or r.motivo <> 'parado' or r.estado <> 'parado' then
    raise exception 'FALHA: parado deu % / % / %', r.centro_custo_id, r.motivo, r.estado;
  end if;
  if not exists (select 1 from public.mapa_movimentacoes where alvo = 'colaborador' and alvo_id = v_andreia
                 and tipo = 'estado' and para->>'estado' = 'parado' and usuario_id = v_tiago) then
    raise exception 'FALHA: marcar parado não gravou a movimentação';
  end if;
  -- Marcar de novo o mesmo estado não gera outra linha.
  select count(*) into v_n from public.mapa_movimentacoes where alvo_id = v_andreia and tipo = 'estado';
  perform public.fn_mapa_marcar_estado_pessoa(v_andreia, 'parado', null);
  if (select count(*) from public.mapa_movimentacoes where alvo_id = v_andreia and tipo = 'estado') <> v_n then
    raise exception 'FALHA: marcar o mesmo estado duplicou a trilha';
  end if;
  begin
    perform public.fn_mapa_marcar_estado_pessoa(v_andreia, 'folga', null);
    raise exception 'FALHA: aceitou estado inválido';
  exception when others then
    if sqlerrm like 'FALHA%' then raise; end if;
  end;

  -- Pessoa que nunca teve linha em mapa_colaboradores também pode ser marcada.
  select c.id into v_outra_pessoa from public.colaboradores c
  where c.ativo and c.data_demissao is null
    and not exists (select 1 from public.mapa_colaboradores m where m.colaborador_id = c.id) limit 1;
  if v_outra_pessoa is not null then
    perform public.fn_mapa_marcar_estado_pessoa(v_outra_pessoa, 'parado', 'teste');
    if (select estado from public.mapa_colaboradores where colaborador_id = v_outra_pessoa) <> 'parado' then
      raise exception 'FALHA: pessoa sem linha no mapa não ficou parada';
    end if;
  end if;

  -- 6. Fechar hoje (sem usuário, como o cron) e de novo: idempotente.
  perform set_config('request.jwt.claims', '', true);
  v_n := public.fn_colab_dias_fechar();
  if v_n <> v_ativos then raise exception 'FALHA: fechar gravou % de %', v_n, v_ativos; end if;
  v_n := public.fn_colab_dias_fechar();
  if (select count(*) from public.colaborador_dias_centro where dia = (now() at time zone 'America/Rio_Branco')::date) <> v_ativos then
    raise exception 'FALHA: fechar duas vezes não é idempotente';
  end if;
  begin
    perform public.fn_colab_dias_fechar(((now() at time zone 'America/Rio_Branco')::date) - 1);
    raise exception 'FALHA: fechou dia passado';
  exception when others then
    if sqlerrm like 'FALHA%' then raise; end if;
  end;

  -- 7. Reparar o dia da foto de 16/10: uma linha por pessoa da foto; repetir não duplica.
  v_n := public.fn_colab_dias_reparar('2026-10-16');
  if v_n <> (select count(*) from public.mapa_snapshots s, jsonb_array_elements(s.estado->'pessoas') p
             where s.data = '2026-10-16' and exists (select 1 from public.colaboradores c where c.id = (p->>'colaborador_id')::uuid)) then
    raise exception 'FALHA: reparo gravou %', v_n;
  end if;
  if public.fn_colab_dias_reparar('2026-10-16') <> 0 then raise exception 'FALHA: reparo duplicou'; end if;

  -- 8. Relatório do mês (como o Tiago): soma = dias fechados do mês + hoje ao vivo.
  perform set_config('request.jwt.claims', json_build_object('sub', v_tiago, 'role', 'authenticated')::text, true);
  select sum(dias) into v_n from public.fn_mapa_rel_dias_pessoa(date_trunc('month', now())::date);
  if v_n <> 2 * v_ativos then raise exception 'FALHA: relatório somou % (esperado %)', v_n, 2 * v_ativos; end if;
  if not exists (select 1 from public.fn_mapa_rel_dias_pessoa(date_trunc('month', now())::date)
                 where colaborador_id = v_andreia and estado = 'parado' and centro_custo_id = v_sem) then
    raise exception 'FALHA: relatório sem o dia parado da Andreia';
  end if;

  -- 9. Ficha.
  v_json := public.fn_mapa_centros_colaborador(v_andreia);
  if v_json->>'estado' <> 'parado' or (v_json->>'parados')::int < 1 or (v_json->'atual'->>'centro_id')::uuid <> v_sem then
    raise exception 'FALHA: ficha %', v_json;
  end if;

  -- 10. Cron agendado às 23:55 Acre.
  if not exists (select 1 from cron.job where jobname = 'colab_dias_centro_diario' and schedule = '55 4 * * *') then
    raise exception 'FALHA: cron não agendado';
  end if;

  raise exception 'PROVA OK: % ativos, ficha %', v_ativos, v_json->'atual';
end
$prova$;
