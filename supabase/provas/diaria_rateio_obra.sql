-- Prova do rateio da diária por obra (17/10/2026). Roda DEPOIS da migration
-- 20261017150001_diaria_rateio_obra e do backfill (diaria_rateio_backfill.sql),
-- dentro de uma transação que termina em ROLLBACK quando é só ensaio.
-- Não chama fn_fechar_diarias: o lançamento queimaria número da sequência
-- mesmo desfeito. O rateio do lançamento é provado pela
-- fn_diaria_refazer_rateio_lancamento, que é o que o fechamento chama.

select set_config('request.jwt.claims', '{"sub":"c66fca9f-5428-4fb9-855f-dcff548764df","role":"authenticated"}', true);

do $$
declare
  c003 constant uuid := 'ad8061a7-4b7b-4881-8b45-161c8c2881e8';
  c007 constant uuid := 'b2607766-d4eb-4b5e-993a-442ae8de18a9';
  c009 constant uuid := 'fbfb8cad-6ecb-40f0-984c-f4f0e87dc2c0';
  cman constant uuid := 'fbd2556a-3e96-474b-818f-ff536a288dff';
  o007 constant uuid := 'a03889e9-9731-4def-a1f1-6e8466ec498f';
  o009 constant uuid := 'b4e8f851-8301-48e5-be82-653ddbffe725';
  v_colab uuid; v_cc_cadastro uuid; v_funcao uuid;
  v_d uuid; v_d2 uuid; v_n int; v_txt text; v_j jsonb; v_atual jsonb; v_ok boolean;
begin
  -- ===== Pós-backfill: nenhuma diária sem rateio, e todas somam 100 =====
  select count(*) into v_n from public.rh_diarias d
  where not exists (select 1 from public.rh_diaria_rateios r where r.diaria_id = d.id);
  if v_n <> 0 then raise exception 'FALHA A1: % diarias sem rateio', v_n; end if;

  select count(*) into v_n from (
    select diaria_id from public.rh_diaria_rateios group by diaria_id having sum(percentual) <> 100) x;
  if v_n <> 0 then raise exception 'FALHA A2: % diarias com rateio <> 100', v_n; end if;

  -- obra_id derivado: só o Luiz Felipe (Manutenção) fica sem obra.
  select count(*), string_agg(c.nome, ',') into v_n, v_txt
  from public.rh_diarias d join public.colaboradores c on c.id = d.colaborador_id where d.obra_id is null;
  if v_n <> 1 or v_txt not ilike 'LUIZ FELIPE%' then
    raise exception 'FALHA A3: diarias sem obra = % (%)', v_n, v_txt;
  end if;

  -- Todo lançamento de diária fecha a soma do rateio com o valor.
  select count(*) into v_n from public.lancamentos l
  where l.origem = 'diaria'
    and l.valor <> (select coalesce(sum(r.valor), 0) from public.lancamento_rateios r where r.lancamento_id = l.id);
  if v_n <> 0 then raise exception 'FALHA A4: % lancamentos de diaria com rateio que nao fecha', v_n; end if;

  -- Os quatro lançamentos corrigidos, centro a centro.
  for v_txt, v_j in
    select * from (values
      ('LAN-2026-7381', jsonb_build_object(c007::text, 1400.00)),
      ('LAN-2026-7382', jsonb_build_object(c007::text, 600.00, c009::text, 500.00)),
      ('LAN-2026-6746', jsonb_build_object(c003::text, 2450.00, c009::text, 1400.00)),
      ('LAN-2026-6666', jsonb_build_object(cman::text, 1583.33)),
      ('LAN-2026-6734', jsonb_build_object(c009::text, 50.00))
    ) t(numero, esperado)
  loop
    select jsonb_object_agg(r.centro_custo_id::text, r.valor) into v_atual
    from public.lancamentos l join public.lancamento_rateios r on r.lancamento_id = l.id
    where l.numero = v_txt;
    if v_atual is distinct from v_j then
      raise exception 'FALHA A5: rateio de % = % (esperado %)', v_txt, v_atual, v_j;
    end if;
  end loop;

  -- Júlio César (480, AC 405) estava no 009: tem que estar no 007.
  select count(*) into v_n
  from public.rh_diarias d join public.lancamento_rateios r on r.lancamento_id = d.lancamento_id
  where left(d.id::text, 8) = '810f6135' and r.centro_custo_id = c007 and r.valor = 480;
  if v_n <> 1 then raise exception 'FALHA A6: Julio Cesar nao foi para o 007'; end if;

  -- Centro principal do lançamento segue o maior valor.
  select count(*) into v_n from public.lancamentos where numero = 'LAN-2026-6746' and centro_custo_id = c003;
  if v_n <> 1 then raise exception 'FALHA A7: centro principal do LAN-2026-6746 nao virou 003'; end if;

  -- Trilha: exatamente os 4 lançamentos que mudaram.
  select count(*) into v_n from public.rateio_eventos where motivo like 'Correcao 17/10/2026:%';
  if v_n <> 4 then raise exception 'FALHA A8: % eventos de rateio (esperado 4)', v_n; end if;

  -- ===== Unidade: divisão em centavos =====
  select d.colaborador_id, c.centro_custo_id into v_colab, v_cc_cadastro
  from public.rh_diarias d join public.colaboradores c on c.id = d.colaborador_id
  where c.centro_custo_id is not null limit 1;
  select id into v_funcao from public.funcoes where ativo limit 1;

  insert into public.rh_diarias (colaborador_id, data, competencia, valor)
  values (v_colab, '2026-10-17', '2026-10-01', 100) returning id into v_d;

  -- Controle: sem rateio, cai inteira no centro do cadastro.
  select count(*) into v_n from public.fn_diaria_valor_por_centro(v_d)
  where centro_custo_id = v_cc_cadastro and valor = 100;
  if v_n <> 1 then raise exception 'FALHA U1: diaria sem rateio nao caiu no cadastro'; end if;

  -- Terços: 33,3334 + 33,3333 + 33,3333 = 100 -> 33,34 + 33,33 + 33,33.
  perform public.fn_diaria_gravar_rateio(v_d, jsonb_build_array(
    jsonb_build_object('centro_custo_id', c007, 'percentual', 33.3334),
    jsonb_build_object('centro_custo_id', c009, 'percentual', 33.3333),
    jsonb_build_object('centro_custo_id', c003, 'percentual', 33.3333)));
  select jsonb_object_agg(centro_custo_id::text, valor) into v_j from public.fn_diaria_valor_por_centro(v_d);
  if v_j <> jsonb_build_object(c007::text, 33.34, c009::text, 33.33, c003::text, 33.33) then
    raise exception 'FALHA U2: tercos = %', v_j;
  end if;
  if (select obra_id from public.rh_diarias where id = v_d) <> o007 then
    raise exception 'FALHA U3: obra_id derivado nao e a obra da maior linha';
  end if;

  -- Recusas.
  for v_txt, v_j in select * from (values
      ('soma 99,9999', jsonb_build_array(
         jsonb_build_object('centro_custo_id', c007, 'percentual', 33.3333),
         jsonb_build_object('centro_custo_id', c009, 'percentual', 33.3333),
         jsonb_build_object('centro_custo_id', c003, 'percentual', 33.3333))),
      ('vazio', '[]'::jsonb),
      ('repetido', jsonb_build_array(
         jsonb_build_object('centro_custo_id', c007, 'percentual', 50),
         jsonb_build_object('centro_custo_id', c007, 'percentual', 50))),
      ('5 casas', jsonb_build_array(
         jsonb_build_object('centro_custo_id', c007, 'percentual', 50.00001),
         jsonb_build_object('centro_custo_id', c009, 'percentual', 49.99999))),
      ('centro de socio', jsonb_build_array(
         jsonb_build_object('centro_custo_id', 'e892aee6-fab2-4931-9582-640ce7be3967', 'percentual', 100))),
      ('zero', jsonb_build_array(
         jsonb_build_object('centro_custo_id', c007, 'percentual', 100),
         jsonb_build_object('centro_custo_id', c009, 'percentual', 0)))
    ) t(caso, rateio)
  loop
    v_ok := false;
    begin
      perform public.fn_diaria_gravar_rateio(v_d, v_j);
    exception when others then v_ok := true;
    end;
    if not v_ok then raise exception 'FALHA U4: aceitou rateio invalido (%)', v_txt; end if;
  end loop;

  -- ===== fn_salvar_diaria =====
  -- Sem obra: recusa.
  v_ok := false;
  begin
    perform public.fn_salvar_diaria(null, v_colab, v_funcao, null, '2026-10-13', '2026-10-14', '{}', '{}', 150, '', null);
  exception when others then
    v_ok := sqlerrm ilike 'Escolha a obra%';
  end;
  if not v_ok then raise exception 'FALHA S1: salvou diaria sem obra'; end if;

  -- Cliente antigo (sem p_rateio): obra vira 100%.
  v_d2 := public.fn_salvar_diaria(p_id => null, p_colaborador => v_colab, p_funcao => v_funcao,
    p_obra => o009, p_inicio => '2026-10-13', p_fim => '2026-10-14', p_meias => '{}'::date[],
    p_faltas => '{}'::date[], p_valor_diaria => 150, p_observacao => '');
  select count(*) into v_n from public.rh_diaria_rateios where diaria_id = v_d2 and centro_custo_id = c009 and percentual = 100;
  if v_n <> 1 or (select obra_id from public.rh_diarias where id = v_d2) <> o009 then
    raise exception 'FALHA S2: cliente antigo nao virou 100%% na obra';
  end if;

  -- Cliente novo: 70/30 entre 007 e Manutenção, edição troca o rateio.
  perform public.fn_salvar_diaria(v_d2, v_colab, v_funcao, null, '2026-10-13', '2026-10-14', '{}', '{}', 150, '',
    jsonb_build_array(jsonb_build_object('centro_custo_id', cman, 'percentual', 30),
                      jsonb_build_object('centro_custo_id', c007, 'percentual', 70)));
  select jsonb_object_agg(centro_custo_id::text, valor) into v_j from public.fn_diaria_valor_por_centro(v_d2);
  if v_j <> jsonb_build_object(c007::text, 210.00, cman::text, 90.00) then
    raise exception 'FALHA S3: 70/30 de 300 = %', v_j;
  end if;
  if (select obra_id from public.rh_diarias where id = v_d2) <> o007 then
    raise exception 'FALHA S4: obra_id nao seguiu a linha de 70%%';
  end if;

  raise notice 'PROVA OK: A1-A8, U1-U4, S1-S4';
end $$;

select 'PROVA OK' as resultado;
