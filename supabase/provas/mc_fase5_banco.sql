-- Prova da Fase 5a da Medição de Contratos (ciclo da medição e alertas). Migration mc_fase5a_ciclo.
-- NÃO GRAVA: termina em raise exception com os resultados, e o bloco de aborto garante o rollback.
-- Rodar inteira pelo MCP execute_sql ou por `supabase db query --linked -f supabase/provas/mc_fase5_banco.sql`
-- (a CLI sai com erro e mostra o jsonb dentro da mensagem: é o esperado). Cada caso vira uma chave em r:
-- "OK" quando bate com o esperado, {"DIFERENTE": obtido, "esperado": ...} quando não bate; "recusou: ..."
-- é o esperado nos casos de trava; "PASSOU (errado)" é falha. O controle 5z tem de sair "DIFERENTE (esperado)".
--
-- As RPCs são chamadas como usuário (set local role authenticated + request.jwt.claims). O Tiago ainda
-- não tem medicao.medicoes editar/aprovar/desaprovar nem medicao.alertas ver em produção (o backfill é a
-- Task 2): a prova insere essas permissões dele dentro da própria transação.
--
-- Números esperados, feitos à mão. Contrato K5 (texto, item_por_medicao, valor 999, assinatura
-- 2025-12-01, 12 meses, Tiago na lista), v0 vigente desde 2025-12-01: 01 título | 01.01 serviço, preço 10,
-- previsto 100 | 01.02 serviço, preço 5, previsto 10 (total previsto 1.050,00).
--   5a 1ª (jan/2026) lança 01.01 30; enviar e aprovar medição aberta recusam.
--   5b fechar: em conferência, mesma versão (v0), sem evento versao; lançar em conferência recusa.
--   5c reabrir sem motivo recusa; com motivo volta a aberta e aceita lançamento (01.01 1 em 01-11, que
--      é excluído em seguida para voltar a 30); fecha de novo.
--   5d ajuste quantidade 0 e sem motivo recusam; ajuste -2 grava na REV00.
--   5e enviar: REV00 enviada com 01.01 congelado 28, medição enviada; enviar de novo recusa.
--   5f aprovar com item fora da revisão (01.02) recusa; com quantidade negativa recusa.
--   5g nova revisão sem motivo recusa; "DNIT devolveu": REV00 substituída, REV01 em aberto, medição em conferência.
--   5h ajuste +1, enviar (REV01 congela 29), aprovar 27: medida 29, aprovada 27, glosa 2, valor 270,00, aprovada.
--      Aprovar de novo recusa.
--   5i revisar aprovada "erro de digitação" (REV02 pós em aberto, medição continua aprovada); de novo recusa
--      (pendente); ajuste +1: a medição continua 29 / 27 / 2 / 270,00 (pendente não mexe).
--   5j enviar + aprovar tudo como medido: 30 / 30 / 0 / 300,00; REV00 e REV01 substituídas, REV02 aprovada (pós).
--   5k 2ª (fev/2026) lança 01.01 5 e 01.02 2; aditivo 1 com v1 vigente desde 2026-02-15 (01.01 preço 12,
--      previsto 30; 01.02 fora). Fechar passa para a v1: 01.01 5 x 12 = 60,00; 01.02 2 x 5 (preço da v0) =
--      10,00; total 70,00; eventos abrir, fechar, versao ("Passou da planilha v0 para a v1, vigente em 28/02/2026").
--   5l alertas de K5: acumulado acima (01.01 35 > 30, sem motivo), prazo (fim 2026-12-01, dias = fim - hoje,
--      referência 90), valor (370 / 360 = 102,78% >= 90), valor do contrato (999 x 1.050).
--   5m K6 (01.01 preço 1, previsto 100), 1ª e 2ª abertas: update direto como dono aberta -> aprovada recusa
--      pela trava; as duas fechadas e enviadas: aprovar a 2ª antes da 1ª recusa.
--   5n usuário zero na lista de K6 só com editar: aprovar recusa (sem permissão); com aprovar e fora da
--      lista: "Contrato não encontrado"; fechar fora da lista também.
--   5o L09 e L10: boletim (L09 acumulado 36.541.661,77, 10ª 680.738,27; L10 11.103.466,25) e a view de
--      itens das medições de carga (hash das linhas antes da migration) iguais.
--   5p alertas reais: só valor_contrato_diferente de L09 (243.927.498,02 x 243.927.483,49) e de L10
--      (121.590.621,00 x 121.573.053,78).
--   5q nada fora do módulo mudou (obras, centros_custo, lancamentos).
--   5r grants: as 7 RPCs sem anon e com authenticated; as 2 internas sem authenticated; a view de alertas
--      só select para authenticated; todas security definer com search_path vazio.
--   5z controle: a glosa da 1ª depois de 5h (2) comparada com 3 tem de dar DIFERENTE.

begin;
create function public.fn_mc_prova_planilha(p_contrato uuid, p_numero int, p_aditivo uuid, p_desde date, p_linhas jsonb)
returns uuid language plpgsql set search_path to '' as $$
declare v_versao uuid; l jsonb; v_item uuid; v_pai uuid;
begin
  insert into public.mc_planilha_versoes (contrato_id, numero, aditivo_id, vigente_desde)
  values (p_contrato, p_numero, p_aditivo, p_desde) returning id into v_versao;
  for l in select * from jsonb_array_elements(p_linhas) loop
    v_item := nullif(l ->> 'item_id', '')::uuid;
    if v_item is null then insert into public.mc_itens (contrato_id) values (p_contrato) returning id into v_item; end if;
    select id into v_pai from public.mc_planilha_itens where versao_id = v_versao and ordem = (l ->> 'pai')::int;
    insert into public.mc_planilha_itens (versao_id, contrato_id, item_id, ordem, codigo, pai_id, descricao, unidade, tipo, preco_unitario, quantidade_prevista)
    values (v_versao, p_contrato, v_item, (l ->> 'ordem')::int, l ->> 'codigo', v_pai, l ->> 'descricao', l ->> 'unidade', l ->> 'tipo',
            (l ->> 'preco')::numeric, (l ->> 'qtd')::numeric);
  end loop;
  update public.mc_planilha_versoes set status = 'vigente' where id = v_versao;
  return v_versao;
end $$;
create function public.fn_mc_prova_confere(p_obtido jsonb, p_esperado jsonb) returns jsonb language sql immutable set search_path to '' as $$
  select case when p_obtido = p_esperado then to_jsonb('OK'::text)
              else jsonb_build_object('DIFERENTE', p_obtido, 'esperado', p_esperado) end;
$$;
-- Item de um código na versão vigente do contrato.
create function public.fn_mc_prova_item(p_contrato uuid, p_codigo text) returns uuid language sql stable set search_path to '' as $$
  select i.item_id from public.mc_planilha_itens i join public.mc_planilha_versoes v on v.id = i.versao_id
  where i.contrato_id = p_contrato and i.codigo = p_codigo and v.status = 'vigente' order by v.numero desc limit 1;
$$;
-- Linha da medição na view de itens (números como jsonb numérico: 29.0000 = 29).
create function public.fn_mc_prova_linha(p_medicao uuid, p_item uuid) returns jsonb language plpgsql stable set search_path to '' as $$
begin
  return (select jsonb_build_object('medida', qtd_medida, 'aprovada', qtd_aprovada, 'glosa', glosa, 'valor', valor_medicao)
            from public.mc_v_medicao_itens where medicao_id = p_medicao and item_id = p_item);
end $$;
-- Hash das linhas da view de itens de um contrato (para provar que a carga não mudou).
create function public.fn_mc_prova_hash(p_contrato uuid) returns text language sql stable set search_path to '' as $$
  select md5(string_agg(concat_ws('/', m.medicao_id, m.item_id, qtd_medida, qtd_aprovada, valor_medicao, preco_unitario, planilha_item_id, qtd_acumulada),
                        ',' order by m.medicao_id, m.item_id))
  from public.mc_v_medicao_itens m where m.contrato_id = p_contrato;
$$;
-- Contagem das tabelas dos outros módulos que o módulo não pode tocar.
create function public.fn_mc_prova_fora() returns jsonb language sql stable set search_path to '' as $$
  select jsonb_build_object('obras', (select count(*) from public.obras), 'centros_custo', (select count(*) from public.centros_custo),
    'lancamentos', (select count(*) from public.lancamentos));
$$;
grant execute on function public.fn_mc_prova_item(uuid, text) to authenticated;
grant execute on function public.fn_mc_prova_confere(jsonb, jsonb) to authenticated;
grant execute on function public.fn_mc_prova_linha(uuid, uuid) to authenticated;

do $prova$
declare
  v_tiago constant uuid := 'c66fca9f-5428-4fb9-855f-dcff548764df';
  v_zero constant uuid := 'f155865b-1d4b-4b25-bf3d-54d8de9176b0';
  v_l09 constant uuid := 'c4109738-9af7-4ddb-8982-3b2c79fe6e43';
  v_l10 constant uuid := 'e0e21c04-1128-4cc3-8d2e-5f8e27a8fad1';
  v_k uuid; v_v0 uuid; v_v1 uuid; v_ad uuid; v_i01 uuid; v_i1 uuid; v_i2 uuid; v_m1 uuid; v_m2 uuid; v_l uuid;
  v_k6 uuid; v_i6 uuid; v_m61 uuid; v_m62 uuid;
  v_txt text; v_fora0 jsonb; v_glosa numeric; v_hoje date := current_date;
  r jsonb := '{}'::jsonb;
begin
  -- Dados, montados como dono.
  insert into public.mc_contratos (codigo, nome_obra, objeto, numero_contrato, contratante_nome, contratante_tipo,
    valor_inicial, data_assinatura, prazo_meses, regra_arredondamento, tipo_localizacao, created_by)
  values ('PROVA-K5', 'Prova K5', 'Prova', 'K5', 'Contratante prova', 'privado', 999, '2025-12-01', 12, 'item_por_medicao', 'texto', v_tiago)
  returning id into v_k;
  insert into public.mc_contrato_usuarios (contrato_id, usuario_id) values (v_k, v_tiago);
  v_v0 := public.fn_mc_prova_planilha(v_k, 0, null, '2025-12-01', jsonb_build_array(
    jsonb_build_object('ordem', 1, 'codigo', '01', 'descricao', 'Grupo', 'tipo', 'titulo'),
    jsonb_build_object('ordem', 2, 'codigo', '01.01', 'pai', 1, 'descricao', 'Serviço 1', 'unidade', 'm3', 'tipo', 'servico', 'preco', '10', 'qtd', '100'),
    jsonb_build_object('ordem', 3, 'codigo', '01.02', 'pai', 1, 'descricao', 'Serviço 2', 'unidade', 't', 'tipo', 'servico', 'preco', '5', 'qtd', '10')));
  v_i01 := public.fn_mc_prova_item(v_k, '01');
  v_i1 := public.fn_mc_prova_item(v_k, '01.01');
  v_i2 := public.fn_mc_prova_item(v_k, '01.02');

  insert into public.mc_contratos (codigo, nome_obra, objeto, numero_contrato, contratante_nome, contratante_tipo,
    valor_inicial, data_assinatura, prazo_meses, regra_arredondamento, tipo_localizacao, created_by)
  values ('PROVA-K6', 'Prova K6', 'Prova', 'K6', 'Contratante prova', 'privado', 100, '2026-01-01', 24, 'item_por_medicao', 'texto', v_tiago)
  returning id into v_k6;
  insert into public.mc_contrato_usuarios (contrato_id, usuario_id) values (v_k6, v_tiago);
  perform public.fn_mc_prova_planilha(v_k6, 0, null, '2026-01-01', jsonb_build_array(
    jsonb_build_object('ordem', 1, 'codigo', '01.01', 'descricao', 'Serviço', 'unidade', 'm3', 'tipo', 'servico', 'preco', '1', 'qtd', '100')));
  v_i6 := public.fn_mc_prova_item(v_k6, '01.01');

  -- Permissões da fase, só nesta transação.
  insert into public.usuario_permissoes (usuario_id, recurso, acao)
  values (v_tiago, 'medicao.medicoes', 'editar'), (v_tiago, 'medicao.medicoes', 'aprovar'),
         (v_tiago, 'medicao.medicoes', 'desaprovar'), (v_tiago, 'medicao.alertas', 'ver')
  on conflict do nothing;

  v_fora0 := public.fn_mc_prova_fora();

  perform set_config('request.jwt.claims', json_build_object('sub', v_tiago, 'role', 'authenticated')::text, true);
  set local role authenticated;

  -- 5a. 1ª aberta com 01.01 30; enviar e aprovar aberta recusam
  v_m1 := public.fn_mc_medicao_abrir(v_k, '2026-01-01', '2026-01-31');
  perform public.fn_mc_lancamento_salvar(v_k, jsonb_build_object('item_id', v_i1, 'data', '2026-01-10', 'quantidade', '30'));
  begin perform public.fn_mc_medicao_enviar(v_m1);
    v_txt := 'PASSOU (errado)'; exception when others then v_txt := 'recusou: ' || sqlerrm; end;
  r := r || jsonb_build_object('5a1_enviar_aberta', v_txt);
  begin perform public.fn_mc_medicao_aprovar(v_m1, null, true);
    v_txt := 'PASSOU (errado)'; exception when others then v_txt := 'recusou: ' || sqlerrm; end;
  r := r || jsonb_build_object('5a2_aprovar_aberta', v_txt);

  -- 5b. Fechar: em conferência, v0, sem evento versao; lançar nela recusa
  perform public.fn_mc_medicao_fechar(v_m1);
  r := r || jsonb_build_object('5b1_fechar', public.fn_mc_prova_confere(jsonb_build_object(
      'status', (select status from public.mc_medicoes where id = v_m1),
      'versao', (select v.numero from public.mc_medicoes m join public.mc_planilha_versoes v on v.id = m.versao_id where m.id = v_m1),
      'eventos', (select jsonb_agg(jsonb_build_array(evento, de_status, para_status) order by evento) from public.mc_medicao_eventos where medicao_id = v_m1)),
    jsonb_build_object('status', 'em_conferencia', 'versao', 0, 'eventos', jsonb_build_array(
      jsonb_build_array('abrir', null, 'aberta'), jsonb_build_array('fechar', 'aberta', 'em_conferencia')))));
  begin perform public.fn_mc_lancamento_salvar(v_k, jsonb_build_object('item_id', v_i1, 'data', '2026-01-11', 'quantidade', '1'));
    v_txt := 'PASSOU (errado)'; exception when others then v_txt := 'recusou: ' || sqlerrm; end;
  r := r || jsonb_build_object('5b2_lancar_em_conferencia', v_txt);

  -- 5c. Reabrir: sem motivo recusa; com motivo volta a aberta e aceita lançamento
  begin perform public.fn_mc_medicao_reabrir(v_m1, 'ab');
    v_txt := 'PASSOU (errado)'; exception when others then v_txt := 'recusou: ' || sqlerrm; end;
  r := r || jsonb_build_object('5c1_reabrir_sem_motivo', v_txt);
  perform public.fn_mc_medicao_reabrir(v_m1, '  faltou lançar  ');
  v_l := public.fn_mc_lancamento_salvar(v_k, jsonb_build_object('item_id', v_i1, 'data', '2026-01-11', 'quantidade', '1'));
  r := r || jsonb_build_object('5c2_reabrir_com_motivo', public.fn_mc_prova_confere(jsonb_build_object(
      'status', (select status from public.mc_medicoes where id = v_m1),
      'evento', (select jsonb_build_array(de_status, para_status, motivo) from public.mc_medicao_eventos where medicao_id = v_m1 and evento = 'reabrir'),
      'lancado', (select qtd_lancada from public.mc_v_medicao_qtd where medicao_id = v_m1 and item_id = v_i1)),
    jsonb_build_object('status', 'aberta', 'evento', jsonb_build_array('em_conferencia', 'aberta', 'faltou lançar'), 'lancado', 31)));
  perform public.fn_mc_lancamento_excluir(v_l, 'lançado para a prova');
  perform public.fn_mc_medicao_fechar(v_m1);

  -- 5d. Ajuste: quantidade 0 e sem motivo recusam; -2 grava na REV00
  begin perform public.fn_mc_ajuste_lancar(v_m1, v_i1, '0', 'motivo qualquer');
    v_txt := 'PASSOU (errado)'; exception when others then v_txt := 'recusou: ' || sqlerrm; end;
  r := r || jsonb_build_object('5d1_ajuste_zero', v_txt);
  begin perform public.fn_mc_ajuste_lancar(v_m1, v_i1, '-2', ' ');
    v_txt := 'PASSOU (errado)'; exception when others then v_txt := 'recusou: ' || sqlerrm; end;
  r := r || jsonb_build_object('5d2_ajuste_sem_motivo', v_txt);
  perform public.fn_mc_ajuste_lancar(v_m1, v_i1, '-2', 'medido a mais');
  r := r || jsonb_build_object('5d3_ajuste', public.fn_mc_prova_confere(
    (select jsonb_build_object('rev', rv.numero, 'qtd', a.quantidade, 'motivo', a.motivo, 'tipo', a.tipo)
       from public.mc_ajustes a join public.mc_medicao_revisoes rv on rv.id = a.revisao_id where a.medicao_id = v_m1),
    jsonb_build_object('rev', 0, 'qtd', -2, 'motivo', 'medido a mais', 'tipo', 'manual')));

  -- 5e. Enviar: REV00 congela 28, medição enviada; enviar de novo recusa
  perform public.fn_mc_medicao_enviar(v_m1);
  r := r || jsonb_build_object('5e1_enviar', public.fn_mc_prova_confere(jsonb_build_object(
      'status', (select status from public.mc_medicoes where id = v_m1),
      'rev00', (select status from public.mc_medicao_revisoes where medicao_id = v_m1 and numero = 0),
      'congelado', (select jsonb_agg(jsonb_build_array(ri.item_id = v_i1, ri.quantidade)) from public.mc_revisao_itens ri
                      join public.mc_medicao_revisoes rv on rv.id = ri.revisao_id where rv.medicao_id = v_m1 and rv.numero = 0)),
    jsonb_build_object('status', 'enviada', 'rev00', 'enviada', 'congelado', jsonb_build_array(jsonb_build_array(true, 28)))));
  begin perform public.fn_mc_medicao_enviar(v_m1);
    v_txt := 'PASSOU (errado)'; exception when others then v_txt := 'recusou: ' || sqlerrm; end;
  r := r || jsonb_build_object('5e2_enviar_de_novo', v_txt);

  -- 5f. Aprovar: item fora da revisão e quantidade negativa recusam
  begin perform public.fn_mc_medicao_aprovar(v_m1, jsonb_build_array(jsonb_build_object('item_id', v_i2, 'quantidade', '1')), false);
    v_txt := 'PASSOU (errado)'; exception when others then v_txt := 'recusou: ' || sqlerrm; end;
  r := r || jsonb_build_object('5f1_aprovar_item_fora_da_revisao', v_txt);
  begin perform public.fn_mc_medicao_aprovar(v_m1, jsonb_build_array(jsonb_build_object('item_id', v_i1, 'quantidade', '-1')), false);
    v_txt := 'PASSOU (errado)'; exception when others then v_txt := 'recusou: ' || sqlerrm; end;
  r := r || jsonb_build_object('5f2_aprovar_negativo', v_txt);

  -- 5g. Nova revisão: sem motivo recusa; com motivo substitui a REV00 e volta a medição para conferência
  begin perform public.fn_mc_medicao_nova_revisao(v_m1, '');
    v_txt := 'PASSOU (errado)'; exception when others then v_txt := 'recusou: ' || sqlerrm; end;
  r := r || jsonb_build_object('5g1_nova_revisao_sem_motivo', v_txt);
  perform public.fn_mc_medicao_nova_revisao(v_m1, 'DNIT devolveu');
  r := r || jsonb_build_object('5g2_nova_revisao', public.fn_mc_prova_confere(jsonb_build_object(
      'status', (select status from public.mc_medicoes where id = v_m1),
      'revs', (select jsonb_agg(jsonb_build_array(numero, status, fase, motivo) order by numero) from public.mc_medicao_revisoes where medicao_id = v_m1)),
    jsonb_build_object('status', 'em_conferencia', 'revs', jsonb_build_array(
      jsonb_build_array(0, 'substituida', 'antes_aprovacao', null), jsonb_build_array(1, 'em_aberto', 'antes_aprovacao', 'DNIT devolveu')))));

  -- 5h. Ajuste +1, enviar (29), aprovar 27: glosa 2, valor 270,00
  perform public.fn_mc_ajuste_lancar(v_m1, v_i1, '1', 'acerto do DNIT');
  perform public.fn_mc_medicao_enviar(v_m1);
  perform public.fn_mc_medicao_aprovar(v_m1, jsonb_build_array(jsonb_build_object('item_id', v_i1, 'quantidade', '27')), false);
  v_glosa := (select glosa from public.mc_v_medicao_itens where medicao_id = v_m1 and item_id = v_i1);
  r := r || jsonb_build_object('5h1_aprovar_com_glosa', public.fn_mc_prova_confere(jsonb_build_object(
      'linha', public.fn_mc_prova_linha(v_m1, v_i1),
      'medicao', (select jsonb_build_array(status, aprovada_por = v_tiago, aprovada_em is not null) from public.mc_medicoes where id = v_m1),
      'rev01', (select jsonb_build_array(status, (select jsonb_agg(ri.quantidade) from public.mc_revisao_itens ri where ri.revisao_id = rv.id))
                  from public.mc_medicao_revisoes rv where medicao_id = v_m1 and numero = 1),
      'total', (select valor from public.mc_v_medicao_totais where medicao_id = v_m1)),
    jsonb_build_object('linha', jsonb_build_object('medida', 29, 'aprovada', 27, 'glosa', 2, 'valor', 270),
      'medicao', jsonb_build_array('aprovada', true, true), 'rev01', jsonb_build_array('aprovada', jsonb_build_array(29)), 'total', 270)));
  begin perform public.fn_mc_medicao_aprovar(v_m1, null, true);
    v_txt := 'PASSOU (errado)'; exception when others then v_txt := 'recusou: ' || sqlerrm; end;
  r := r || jsonb_build_object('5h2_aprovar_de_novo', v_txt);

  -- 5i. Revisão pós-aprovação: uma pendente por vez; pendente não mexe no medido, aprovado nem glosa
  perform public.fn_mc_medicao_revisar_aprovada(v_m1, 'erro de digitação');
  begin perform public.fn_mc_medicao_revisar_aprovada(v_m1, 'outra revisão');
    v_txt := 'PASSOU (errado)'; exception when others then v_txt := 'recusou: ' || sqlerrm; end;
  r := r || jsonb_build_object('5i1_revisar_com_pendente', v_txt);
  perform public.fn_mc_ajuste_lancar(v_m1, v_i1, '1', 'acerto pós-aprovação');
  r := r || jsonb_build_object('5i2_pendente_nao_mexe', public.fn_mc_prova_confere(jsonb_build_object(
      'linha', public.fn_mc_prova_linha(v_m1, v_i1),
      'status', (select status from public.mc_medicoes where id = v_m1),
      'rev02', (select jsonb_build_array(status, fase) from public.mc_medicao_revisoes where medicao_id = v_m1 and numero = 2),
      'total', (select valor from public.mc_v_medicao_totais where medicao_id = v_m1)),
    jsonb_build_object('linha', jsonb_build_object('medida', 29, 'aprovada', 27, 'glosa', 2, 'valor', 270),
      'status', 'aprovada', 'rev02', jsonb_build_array('em_aberto', 'pos_aprovacao'), 'total', 270)));

  -- 5j. Enviar e aprovar tudo como medido: 30 / 30 / 0 / 300,00 e a REV02 substitui a REV01
  perform public.fn_mc_medicao_enviar(v_m1);
  perform public.fn_mc_medicao_aprovar(v_m1, null, true);
  r := r || jsonb_build_object('5j_pos_aprovada', public.fn_mc_prova_confere(jsonb_build_object(
      'linha', public.fn_mc_prova_linha(v_m1, v_i1),
      'status', (select status from public.mc_medicoes where id = v_m1),
      'revs', (select jsonb_agg(jsonb_build_array(numero, status, fase) order by numero) from public.mc_medicao_revisoes where medicao_id = v_m1),
      'eventos', (select jsonb_agg(evento order by evento) from public.mc_medicao_eventos where medicao_id = v_m1)),
    jsonb_build_object('linha', jsonb_build_object('medida', 30, 'aprovada', 30, 'glosa', 0, 'valor', 300), 'status', 'aprovada',
      'revs', jsonb_build_array(jsonb_build_array(0, 'substituida', 'antes_aprovacao'), jsonb_build_array(1, 'substituida', 'antes_aprovacao'),
                                jsonb_build_array(2, 'aprovada', 'pos_aprovacao')),
      'eventos', jsonb_build_array('abrir', 'aprovar', 'aprovar_revisao', 'enviar', 'enviar', 'enviar', 'fechar', 'fechar',
                                   'nova_revisao', 'reabrir', 'revisao_pos'))));

  -- 5k. 2ª: fechar troca para a versão vigente no fim do período
  v_m2 := public.fn_mc_medicao_abrir(v_k, '2026-02-01', '2026-02-28');
  perform public.fn_mc_lancamento_salvar(v_k, jsonb_build_object('item_id', v_i1, 'data', '2026-02-05', 'quantidade', '5'));
  perform public.fn_mc_lancamento_salvar(v_k, jsonb_build_object('item_id', v_i2, 'data', '2026-02-06', 'quantidade', '2'));
  reset role;
  insert into public.mc_aditivos (contrato_id, numero, data_assinatura, data_vigencia, tipos, motivo)
  values (v_k, 1, '2026-02-14', '2026-02-15', array['quantidade', 'valor'], 'Prova') returning id into v_ad;
  v_v1 := public.fn_mc_prova_planilha(v_k, 1, v_ad, '2026-02-15', jsonb_build_array(
    jsonb_build_object('ordem', 1, 'item_id', v_i01, 'codigo', '01', 'descricao', 'Grupo', 'tipo', 'titulo'),
    jsonb_build_object('ordem', 2, 'item_id', v_i1, 'codigo', '01.01', 'pai', 1, 'descricao', 'Serviço 1', 'unidade', 'm3', 'tipo', 'servico', 'preco', '12', 'qtd', '30')));
  set local role authenticated;
  perform public.fn_mc_medicao_fechar(v_m2);
  r := r || jsonb_build_object('5k_fechar_troca_versao', public.fn_mc_prova_confere(jsonb_build_object(
      'versao', (select v.numero from public.mc_medicoes m join public.mc_planilha_versoes v on v.id = m.versao_id where m.id = v_m2),
      'i1', (select jsonb_build_array(preco_unitario, valor_medicao) from public.mc_v_medicao_itens where medicao_id = v_m2 and item_id = v_i1),
      'i2', (select jsonb_build_array(preco_unitario, valor_medicao) from public.mc_v_medicao_itens where medicao_id = v_m2 and item_id = v_i2),
      'total', (select valor from public.mc_v_medicao_totais where medicao_id = v_m2),
      'eventos', (select jsonb_agg(evento order by evento) from public.mc_medicao_eventos where medicao_id = v_m2),
      'motivo_versao', (select motivo from public.mc_medicao_eventos where medicao_id = v_m2 and evento = 'versao')),
    jsonb_build_object('versao', 1, 'i1', jsonb_build_array(12, 60), 'i2', jsonb_build_array(5, 10), 'total', 70,
      'eventos', jsonb_build_array('abrir', 'fechar', 'versao'),
      'motivo_versao', 'Passou da planilha v0 para a v1, vigente em 28/02/2026 (fim do período)')));

  -- 5l. Alertas de K5 (lidos como o Tiago)
  r := r || jsonb_build_object('5l_alertas_k5', public.fn_mc_prova_confere(
    (select jsonb_agg(jsonb_build_object('tipo', tipo, 'gravidade', gravidade, 'item', item_id = v_i1, 'codigo', item_codigo, 'unidade', unidade,
                                         'valor', valor::numeric, 'referencia', referencia::numeric, 'data', data, 'com_motivo', com_motivo) order by tipo)
       from public.mc_v_alertas where contrato_id = v_k),
    jsonb_build_array(
      jsonb_build_object('tipo', 'acumulado_acima_previsto', 'gravidade', 'alta', 'item', true, 'codigo', '01.01', 'unidade', 'm3',
                         'valor', 35, 'referencia', 30, 'data', null, 'com_motivo', false),
      jsonb_build_object('tipo', 'prazo_perto_do_fim', 'gravidade', 'media', 'item', null, 'codigo', null, 'unidade', null,
                         'valor', '2026-12-01'::date - v_hoje, 'referencia', 90, 'data', '2026-12-01', 'com_motivo', false),
      jsonb_build_object('tipo', 'valor_contrato_diferente', 'gravidade', 'baixa', 'item', null, 'codigo', null, 'unidade', null,
                         'valor', 999, 'referencia', 1050, 'data', null, 'com_motivo', false),
      jsonb_build_object('tipo', 'valor_perto_do_previsto', 'gravidade', 'media', 'item', null, 'codigo', null, 'unidade', null,
                         'valor', 102.78, 'referencia', 90, 'data', null, 'com_motivo', false))));

  -- 5m. K6: transição direta recusada pela trava; aprovar a 2ª antes da 1ª recusa
  v_m61 := public.fn_mc_medicao_abrir(v_k6, '2026-01-01', '2026-01-31');
  v_m62 := public.fn_mc_medicao_abrir(v_k6, '2026-02-01', '2026-02-28');
  perform public.fn_mc_lancamento_salvar(v_k6, jsonb_build_object('item_id', v_i6, 'data', '2026-01-10', 'quantidade', '1'));
  perform public.fn_mc_lancamento_salvar(v_k6, jsonb_build_object('item_id', v_i6, 'data', '2026-02-10', 'quantidade', '1'));
  reset role;
  begin update public.mc_medicoes set status = 'aprovada' where id = v_m61;
    v_txt := 'PASSOU (errado)'; exception when others then v_txt := 'recusou: ' || sqlerrm; end;
  r := r || jsonb_build_object('5m1_transicao_direta', v_txt);
  set local role authenticated;
  perform public.fn_mc_medicao_fechar(v_m61);
  perform public.fn_mc_medicao_fechar(v_m62);
  perform public.fn_mc_medicao_enviar(v_m61);
  perform public.fn_mc_medicao_enviar(v_m62);
  begin perform public.fn_mc_medicao_aprovar(v_m62, null, true);
    v_txt := 'PASSOU (errado)'; exception when others then v_txt := 'recusou: ' || sqlerrm; end;
  r := r || jsonb_build_object('5m2_aprovar_2a_antes_da_1a', v_txt);
  reset role;

  -- 5n. Usuário zero: na lista só com editar (aprovar recusa); com aprovar e fora da lista recusa
  insert into public.usuario_permissoes (usuario_id, recurso, acao)
  values (v_zero, 'medicao.medicoes', 'ver'), (v_zero, 'medicao.medicoes', 'editar') on conflict do nothing;
  insert into public.mc_contrato_usuarios (contrato_id, usuario_id) values (v_k6, v_zero);
  perform set_config('request.jwt.claims', json_build_object('sub', v_zero, 'role', 'authenticated')::text, true);
  set local role authenticated;
  begin perform public.fn_mc_medicao_aprovar(v_m61, null, true);
    v_txt := 'PASSOU (errado)'; exception when others then v_txt := 'recusou: ' || sqlerrm; end;
  r := r || jsonb_build_object('5n1_sem_aprovar', v_txt);
  reset role;
  delete from public.mc_contrato_usuarios where contrato_id = v_k6 and usuario_id = v_zero;
  insert into public.usuario_permissoes (usuario_id, recurso, acao) values (v_zero, 'medicao.medicoes', 'aprovar') on conflict do nothing;
  set local role authenticated;
  begin perform public.fn_mc_medicao_aprovar(v_m61, null, true);
    v_txt := 'PASSOU (errado)'; exception when others then v_txt := 'recusou: ' || sqlerrm; end;
  r := r || jsonb_build_object('5n2_aprovar_fora_da_lista', v_txt);
  begin perform public.fn_mc_medicao_reabrir(v_m61, 'motivo qualquer');
    v_txt := 'PASSOU (errado)'; exception when others then v_txt := 'recusou: ' || sqlerrm; end;
  r := r || jsonb_build_object('5n3_reabrir_fora_da_lista', v_txt);
  reset role;
  r := r || jsonb_build_object('5n4_k6_intacta', public.fn_mc_prova_confere(
    (select jsonb_agg(jsonb_build_array(numero, status) order by numero) from public.mc_medicoes where contrato_id = v_k6),
    jsonb_build_array(jsonb_build_array(1, 'enviada'), jsonb_build_array(2, 'enviada'))));

  -- 5o. L09 e L10: boletim e view de itens da carga iguais aos de antes da migration
  perform set_config('request.jwt.claims', json_build_object('sub', v_tiago, 'role', 'authenticated')::text, true);
  set local role authenticated;
  r := r || jsonb_build_object('5o1_boletins', public.fn_mc_prova_confere(jsonb_build_object(
      'l09', (public.fn_mc_boletim(v_l09) -> 'total' ->> 'acumulado')::numeric,
      'l10', (public.fn_mc_boletim(v_l10) -> 'total' ->> 'acumulado')::numeric),
    jsonb_build_object('l09', 36541661.77, 'l10', 11103466.25)));
  reset role;
  r := r || jsonb_build_object('5o2_carga_igual', public.fn_mc_prova_confere(jsonb_build_object(
      'l09_10a', (select t.valor from public.mc_v_medicao_totais t join public.mc_medicoes m on m.id = t.medicao_id where m.contrato_id = v_l09 and m.numero = 10),
      'l09_hash', public.fn_mc_prova_hash(v_l09), 'l10_hash', public.fn_mc_prova_hash(v_l10),
      'carga_medida_igual_aprovada', (select bool_and(qtd_medida = qtd_aprovada) from public.mc_v_medicao_itens where contrato_id in (v_l09, v_l10) and status = 'aprovada')),
    jsonb_build_object('l09_10a', 680738.27, 'l09_hash', 'e494e5b27f249ca93e8b6fcb821604ee', 'l10_hash', '55747138b02e631473d53a9f5b0eb3f2',
      'carga_medida_igual_aprovada', true)));

  -- 5p. Alertas reais (como dono): só valor do contrato diferente de L09 e L10
  r := r || jsonb_build_object('5p_alertas_reais', public.fn_mc_prova_confere(
    (select jsonb_agg(jsonb_build_array(a.codigo, a.tipo, a.valor::numeric, a.referencia::numeric) order by a.codigo, a.tipo)
       from public.mc_v_alertas a where a.codigo not like 'PROVA-%'),
    jsonb_build_array(
      jsonb_build_array('L09-BR364', 'valor_contrato_diferente', 243927498.02, 243927483.49),
      jsonb_build_array('L10-BR364', 'valor_contrato_diferente', 121590621.00, 121573053.78))));

  -- 5q. Nada fora do módulo
  r := r || jsonb_build_object('5q_nada_fora', public.fn_mc_prova_confere(public.fn_mc_prova_fora(), v_fora0));

  -- 5r. Grants e segurança das funções
  r := r || jsonb_build_object('5r_grants', public.fn_mc_prova_confere(jsonb_build_object(
      'anon', (select jsonb_agg(has_function_privilege('anon', f, 'EXECUTE') order by f) from unnest(array[
          'public.fn_mc_medicao_fechar(uuid)', 'public.fn_mc_medicao_reabrir(uuid, text)', 'public.fn_mc_ajuste_lancar(uuid, uuid, text, text)',
          'public.fn_mc_medicao_enviar(uuid)', 'public.fn_mc_medicao_nova_revisao(uuid, text)', 'public.fn_mc_medicao_aprovar(uuid, jsonb, boolean)',
          'public.fn_mc_medicao_revisar_aprovada(uuid, text)', 'public.fn_mc_medicao_para(uuid, text, text)', 'public.fn_mc_revisao_corrente(uuid)']) f),
      'authenticated', (select jsonb_agg(jsonb_build_array(f, has_function_privilege('authenticated', f, 'EXECUTE')) order by f) from unnest(array[
          'public.fn_mc_medicao_fechar(uuid)', 'public.fn_mc_medicao_reabrir(uuid, text)', 'public.fn_mc_ajuste_lancar(uuid, uuid, text, text)',
          'public.fn_mc_medicao_enviar(uuid)', 'public.fn_mc_medicao_nova_revisao(uuid, text)', 'public.fn_mc_medicao_aprovar(uuid, jsonb, boolean)',
          'public.fn_mc_medicao_revisar_aprovada(uuid, text)', 'public.fn_mc_medicao_para(uuid, text, text)', 'public.fn_mc_revisao_corrente(uuid)']) f),
      'definer_search_path', (select bool_and(p.prosecdef and p.proconfig = array['search_path=""']) from pg_proc p
          where p.pronamespace = 'public'::regnamespace and p.proname in ('fn_mc_medicao_fechar', 'fn_mc_medicao_reabrir', 'fn_mc_ajuste_lancar',
            'fn_mc_medicao_enviar', 'fn_mc_medicao_nova_revisao', 'fn_mc_medicao_aprovar', 'fn_mc_medicao_revisar_aprovada', 'fn_mc_medicao_para',
            'fn_mc_revisao_corrente')),
      'view', (select jsonb_object_agg(grantee, privs) from (select grantee, string_agg(privilege_type, ',' order by privilege_type) privs
               from information_schema.role_table_grants where table_schema = 'public' and table_name = 'mc_v_alertas'
                 and grantee in ('anon', 'authenticated') group by grantee) g)),
    jsonb_build_object(
      'anon', jsonb_build_array(false, false, false, false, false, false, false, false, false),
      'authenticated', (select jsonb_agg(jsonb_build_array(f, f not in ('public.fn_mc_medicao_para(uuid, text, text)', 'public.fn_mc_revisao_corrente(uuid)')) order by f)
                        from unnest(array[
          'public.fn_mc_medicao_fechar(uuid)', 'public.fn_mc_medicao_reabrir(uuid, text)', 'public.fn_mc_ajuste_lancar(uuid, uuid, text, text)',
          'public.fn_mc_medicao_enviar(uuid)', 'public.fn_mc_medicao_nova_revisao(uuid, text)', 'public.fn_mc_medicao_aprovar(uuid, jsonb, boolean)',
          'public.fn_mc_medicao_revisar_aprovada(uuid, text)', 'public.fn_mc_medicao_para(uuid, text, text)', 'public.fn_mc_revisao_corrente(uuid)']) f),
      'definer_search_path', true,
      'view', jsonb_build_object('authenticated', 'SELECT'))));

  -- 5z. Controle: a glosa da 1ª depois de 5h (2) contra 3 tem de dar DIFERENTE
  r := r || jsonb_build_object('5z_controle', case when v_glosa = 3 then 'IGUAL (errado)' else 'DIFERENTE (esperado)' end);

  raise exception 'PROVA %', r;
end $prova$;
do $aborto$ begin raise exception 'ABORTO GARANTIDO'; end $aborto$;
rollback;
