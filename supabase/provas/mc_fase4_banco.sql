-- Prova da Fase 4a da Medição de Contratos (abrir medição e lançamento diário). Migration mc_fase4a_lancamentos.
-- NÃO GRAVA: termina em raise exception com os resultados, e o bloco de aborto garante o rollback.
-- Rodar inteira pelo MCP execute_sql ou por `supabase db query --linked -f supabase/provas/mc_fase4_banco.sql`
-- (a CLI sai com erro e mostra o jsonb dentro da mensagem: é o esperado). Cada caso vira uma chave em r:
-- "OK" quando bate com o esperado, {"DIFERENTE": obtido, "esperado": ...} quando não bate; "recusou: ..."
-- é o esperado nos casos de trava; "PASSOU (errado)" é falha. O controle 4q tem de sair "DIFERENTE (esperado)".
--
-- As RPCs são chamadas como usuário (set local role authenticated + request.jwt.claims). O Tiago ainda
-- não tem medicao.medicoes nem medicao.lancamentos em produção (o backfill é a Task 3): a prova insere
-- essas permissões dele dentro da própria transação.
--
-- Números esperados, feitos à mão. Contrato KL (rodovia, item_por_medicao, dia_inicio_periodo 26,
-- assinatura 2026-06-10, Tiago na lista), v0 vigente: 01 título | 01.01 serviço, preço 2, previsto 10 |
-- 01.02 serviço, preço 3, previsto 5. KT (texto, mesmas linhas, dia 1, assinatura 2026-06-01).
-- KS (sem versão vigente).
--   4a sugestão de KL sem medição: {1, 2026-06-10, 2026-06-25, versão 0, depois_de nulo}.
--   4b abrir a 1ª (06-10 a 06-25): aberta, REV00 em_aberto antes_aprovacao, evento abrir para aberta, origem app.
--   4c sugestão da 2ª {2, 06-26, 07-25}; 06-20 a 07-25 recusa; 06-26 a 07-25 abre (duas abertas).
--   4d fim antes do início recusa; KS sem versão vigente recusa.
--   4e 01.01 4 em 06-20 (km 1 a 2) cai na 1ª; 01.01 3 em 07-01 (km 2 a 1) cai na 2ª.
--   4f recusas: sem km, km negativo, quantidade 0, 5 casas, data futura, título, sem medição, item de outro contrato.
--   4g 01.01 4 em 07-02: acumulado 4 + 3 + 4 = 11 > 10 sem motivo: MCEXC; com motivo grava e guarda o motivo.
--   4h colar prévia [01.02 3 em 07-03, 01.02 3 em 07-04]: validas 1, erros [{linha 2, excesso}], nada gravado.
--   4i colar gravar a mesma lista: recusa "Nada foi gravado: 1 linha(s) com erro"; [3, 2]: gravadas 2 (5 = previsto).
--   4j editar o de 06-20 para 2; data para 07-05 vai para a 2ª; volta para 06-20 volta para a 1ª.
--   4k 01.01 1 em 06-21 (acumulado 2 + 3 + 4 + 1 = 10, não passa); excluir com "ab" recusa, "lançado errado" ok.
--   4l 1ª em_conferencia: editar e excluir lançamento dela recusam; lançar em 06-15 recusa.
--   4m usuário zero: sem permissão recusa; com permissão e fora da lista "Contrato não encontrado"; abrir recusa.
--   4n update direto trocando contrato_id recusa.
--   4o KT: lançar sem km grava.
--   4p boletim de KL: 1ª = 01.01 2 x 2 = 4,00; 2ª = 01.01 (3 + 4) x 2 = 14,00 + 01.02 (3 + 2) x 3 = 15,00 = 29,00.
--   4q controle: a 2ª contra 29,01 tem de dar DIFERENTE.
--   4r nada fora: obras, centros_custo, lancamentos com a mesma contagem; L09 com 10 medições e nenhum lançamento.
--   4s grants: view só select para authenticated (nada para anon); RPCs sem anon; a interna sem authenticated.
--   4t anexo mc_lancamento: vincular um arquivo a um lançamento de KL (na lista) passa; a um lançamento de
--     um contrato fora da lista do Tiago (KZ) recusa "Sem acesso a este contrato".

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
-- p_dados de um lançamento (chaves nulas saem).
create function public.fn_mc_prova_dados(p_item uuid, p_data text, p_qtd text, p_km_i text, p_km_f text)
returns jsonb language sql immutable set search_path to '' as $$
  select jsonb_strip_nulls(jsonb_build_object('item_id', p_item, 'data', p_data, 'quantidade', p_qtd,
    'km_inicial', p_km_i, 'km_final', p_km_f));
$$;
-- Item de um código na versão vigente do contrato.
create function public.fn_mc_prova_item(p_contrato uuid, p_codigo text) returns uuid language sql stable set search_path to '' as $$
  select i.item_id from public.mc_planilha_itens i join public.mc_planilha_versoes v on v.id = i.versao_id
  where i.contrato_id = p_contrato and i.codigo = p_codigo and v.status = 'vigente' order by v.numero desc limit 1;
$$;
-- Número da medição do lançamento, lido pela view nova (como quem chama).
create function public.fn_mc_prova_med(p_lanc uuid) returns int language plpgsql stable set search_path to '' as $$
begin
  return (select medicao_numero from public.mc_v_lancamentos where id = p_lanc);
end $$;
-- Contagem das tabelas dos outros módulos que o módulo não pode tocar.
create function public.fn_mc_prova_fora() returns jsonb language sql stable set search_path to '' as $$
  select jsonb_build_object('obras', (select count(*) from public.obras), 'centros_custo', (select count(*) from public.centros_custo),
    'lancamentos', (select count(*) from public.lancamentos));
$$;
grant execute on function public.fn_mc_prova_med(uuid) to authenticated;
grant execute on function public.fn_mc_prova_dados(uuid, text, text, text, text) to authenticated;
grant execute on function public.fn_mc_prova_item(uuid, text) to authenticated;
grant execute on function public.fn_mc_prova_confere(jsonb, jsonb) to authenticated;

do $prova$
declare
  v_tiago constant uuid := 'c66fca9f-5428-4fb9-855f-dcff548764df';
  v_zero constant uuid := 'f155865b-1d4b-4b25-bf3d-54d8de9176b0';
  v_l09 constant uuid := 'c4109738-9af7-4ddb-8982-3b2c79fe6e43';
  v_kl uuid; v_kt uuid; v_ks uuid; v_kz uuid; v_m1 uuid; v_m2 uuid; v_mt uuid; v_mt2 uuid;
  v_i01 uuid; v_i0101 uuid; v_i0102 uuid; v_it0101 uuid;
  v_l1 uuid; v_l2 uuid; v_l3 uuid; v_l5 uuid; v_lt uuid;
  v_vkz uuid; v_ikz uuid; v_mkz uuid; v_lkz uuid; v_arq uuid; v_vinc uuid;
  v_j jsonb; v_b jsonb; v_txt text; v_det text; v_n bigint; v_n2 bigint; v_hoje date; v_fora0 jsonb;
  r jsonb := '{}'::jsonb;
begin
  -- Dados, montados como dono.
  insert into public.mc_contratos (codigo, nome_obra, objeto, numero_contrato, contratante_nome, contratante_tipo,
    valor_inicial, data_assinatura, prazo_meses, regra_arredondamento, dia_inicio_periodo, tipo_localizacao, created_by)
  values ('PROVA-KL', 'Prova KL', 'Prova', 'KL', 'Contratante prova', 'federal', 35, '2026-06-10', 12, 'item_por_medicao', 26, 'rodovia', v_tiago)
  returning id into v_kl;
  insert into public.mc_contrato_usuarios (contrato_id, usuario_id) values (v_kl, v_tiago);
  perform public.fn_mc_prova_planilha(v_kl, 0, null, '2026-06-10', jsonb_build_array(
    jsonb_build_object('ordem', 1, 'codigo', '01', 'descricao', 'Grupo', 'tipo', 'titulo'),
    jsonb_build_object('ordem', 2, 'codigo', '01.01', 'pai', 1, 'descricao', 'Serviço 1', 'unidade', 'm3', 'tipo', 'servico', 'preco', '2', 'qtd', '10'),
    jsonb_build_object('ordem', 3, 'codigo', '01.02', 'pai', 1, 'descricao', 'Serviço 2', 'unidade', 't', 'tipo', 'servico', 'preco', '3', 'qtd', '5')));
  v_i01 := public.fn_mc_prova_item(v_kl, '01');
  v_i0101 := public.fn_mc_prova_item(v_kl, '01.01');
  v_i0102 := public.fn_mc_prova_item(v_kl, '01.02');

  insert into public.mc_contratos (codigo, nome_obra, objeto, numero_contrato, contratante_nome, contratante_tipo,
    valor_inicial, data_assinatura, prazo_meses, regra_arredondamento, dia_inicio_periodo, tipo_localizacao, created_by)
  values ('PROVA-KT', 'Prova KT', 'Prova', 'KT', 'Contratante prova', 'municipal', 35, '2026-06-01', 12, 'item_por_medicao', 1, 'texto', v_tiago)
  returning id into v_kt;
  insert into public.mc_contrato_usuarios (contrato_id, usuario_id) values (v_kt, v_tiago);
  perform public.fn_mc_prova_planilha(v_kt, 0, null, '2026-06-01', jsonb_build_array(
    jsonb_build_object('ordem', 1, 'codigo', '01', 'descricao', 'Grupo', 'tipo', 'titulo'),
    jsonb_build_object('ordem', 2, 'codigo', '01.01', 'pai', 1, 'descricao', 'Serviço 1', 'unidade', 'm3', 'tipo', 'servico', 'preco', '2', 'qtd', '10'),
    jsonb_build_object('ordem', 3, 'codigo', '01.02', 'pai', 1, 'descricao', 'Serviço 2', 'unidade', 't', 'tipo', 'servico', 'preco', '3', 'qtd', '5')));
  v_it0101 := public.fn_mc_prova_item(v_kt, '01.01');

  insert into public.mc_contratos (codigo, nome_obra, objeto, numero_contrato, contratante_nome, contratante_tipo,
    valor_inicial, data_assinatura, prazo_meses, regra_arredondamento, created_by)
  values ('PROVA-KS', 'Prova KS', 'Prova', 'KS', 'Contratante prova', 'estadual', 1, '2026-06-01', 12, 'item_por_medicao', v_tiago)
  returning id into v_ks;
  insert into public.mc_contrato_usuarios (contrato_id, usuario_id) values (v_ks, v_tiago);

  -- Permissões da fase, só nesta transação.
  insert into public.usuario_permissoes (usuario_id, recurso, acao)
  values (v_tiago, 'medicao.medicoes', 'ver'), (v_tiago, 'medicao.medicoes', 'criar'),
         (v_tiago, 'medicao.lancamentos', 'ver'), (v_tiago, 'medicao.lancamentos', 'criar'),
         (v_tiago, 'medicao.lancamentos', 'editar'), (v_tiago, 'medicao.lancamentos', 'excluir')
  on conflict do nothing;

  v_fora0 := public.fn_mc_prova_fora();
  v_hoje := (now() at time zone 'America/Rio_Branco')::date;

  perform set_config('request.jwt.claims', json_build_object('sub', v_tiago, 'role', 'authenticated')::text, true);
  set local role authenticated;

  -- 4a. Sugestão sem medição: da assinatura até a véspera do dia 26
  r := r || jsonb_build_object('4a_sugestao_1a', public.fn_mc_prova_confere(public.fn_mc_medicao_sugestao(v_kl),
    jsonb_build_object('numero', 1, 'periodo_inicio', '2026-06-10', 'periodo_fim', '2026-06-25', 'versao_numero', 0, 'depois_de', null, 'periodo_manual', false)));

  -- 4b. Abrir a 1ª: aberta, REV00 em aberto e evento abrir
  v_m1 := public.fn_mc_medicao_abrir(v_kl, '2026-06-10', '2026-06-25');
  reset role;
  r := r || jsonb_build_object('4b_abrir_1a', public.fn_mc_prova_confere(jsonb_build_object(
      'medicao', (select jsonb_build_object('numero', numero, 'status', status, 'origem', origem, 'ini', periodo_inicio, 'fim', periodo_fim,
                    'versao', (select numero from public.mc_planilha_versoes v where v.id = m.versao_id), 'por_tiago', created_by = v_tiago)
                  from public.mc_medicoes m where id = v_m1),
      'revisoes', (select jsonb_agg(jsonb_build_object('numero', numero, 'status', status, 'fase', fase)) from public.mc_medicao_revisoes where medicao_id = v_m1),
      'eventos', (select jsonb_agg(jsonb_build_object('evento', evento, 'de', de_status, 'para', para_status, 'por_tiago', usuario_id = v_tiago))
                  from public.mc_medicao_eventos where medicao_id = v_m1)),
    jsonb_build_object(
      'medicao', jsonb_build_object('numero', 1, 'status', 'aberta', 'origem', 'app', 'ini', '2026-06-10', 'fim', '2026-06-25', 'versao', 0, 'por_tiago', true),
      'revisoes', jsonb_build_array(jsonb_build_object('numero', 0, 'status', 'em_aberto', 'fase', 'antes_aprovacao')),
      'eventos', jsonb_build_array(jsonb_build_object('evento', 'abrir', 'de', null, 'para', 'aberta', 'por_tiago', true)))));
  set local role authenticated;

  -- 4c. Sugestão da 2ª, sobreposição recusada, 2ª aberta (duas abertas)
  r := r || jsonb_build_object('4c1_sugestao_2a', public.fn_mc_prova_confere(public.fn_mc_medicao_sugestao(v_kl),
    jsonb_build_object('numero', 2, 'periodo_inicio', '2026-06-26', 'periodo_fim', '2026-07-25', 'versao_numero', 0, 'depois_de', '2026-06-25', 'periodo_manual', false)));
  begin perform public.fn_mc_medicao_abrir(v_kl, '2026-06-20', '2026-07-25');
    v_txt := 'PASSOU (errado)'; exception when others then v_txt := 'recusou: ' || sqlerrm; end;
  r := r || jsonb_build_object('4c2_sobreposicao', v_txt);
  v_m2 := public.fn_mc_medicao_abrir(v_kl, '2026-06-26', '2026-07-25');
  r := r || jsonb_build_object('4c3_abrir_2a', public.fn_mc_prova_confere(
    (select jsonb_agg(jsonb_build_object('numero', numero, 'status', status) order by numero) from public.mc_medicoes where contrato_id = v_kl),
    jsonb_build_array(jsonb_build_object('numero', 1, 'status', 'aberta'), jsonb_build_object('numero', 2, 'status', 'aberta'))));

  -- 4d. Período invertido e contrato sem planilha vigente
  begin perform public.fn_mc_medicao_abrir(v_kl, '2026-08-10', '2026-08-01');
    v_txt := 'PASSOU (errado)'; exception when others then v_txt := 'recusou: ' || sqlerrm; end;
  r := r || jsonb_build_object('4d1_fim_antes_do_inicio', v_txt);
  begin perform public.fn_mc_medicao_abrir(v_ks, '2026-06-01', '2026-06-30');
    v_txt := 'PASSOU (errado)'; exception when others then v_txt := 'recusou: ' || sqlerrm; end;
  r := r || jsonb_build_object('4d2_sem_versao_vigente', v_txt);

  -- 4e. Lançamento cai na medição que contém a data
  v_l1 := public.fn_mc_lancamento_salvar(v_kl, public.fn_mc_prova_dados(v_i0101, '2026-06-20', '4', '1', '2'));
  v_l2 := public.fn_mc_lancamento_salvar(v_kl, public.fn_mc_prova_dados(v_i0101, '2026-07-01', '3', '2', '1'));
  r := r || jsonb_build_object('4e_medicao_pela_data', public.fn_mc_prova_confere(
    jsonb_build_object('l1', public.fn_mc_prova_med(v_l1), 'l2', public.fn_mc_prova_med(v_l2),
      'l2_km', (select jsonb_build_array(km_inicial::text, km_final::text, codigo, unidade) from public.mc_v_lancamentos where id = v_l2)),
    jsonb_build_object('l1', 1, 'l2', 2, 'l2_km', jsonb_build_array('2.000', '1.000', '01.01', 'm3'))));

  -- Medições de KT usadas nas provas 4f5 (data futura) e 4o (texto sem km): a 1ª cobre um período fixo no
  -- passado; a 2ª cobre hoje até hoje + 30, para testar "ainda não chegou" com uma medição aberta que já
  -- cobre a data (prova que quem recusa é o check de data futura, não "Não há medição para a data").
  v_mt := public.fn_mc_medicao_abrir(v_kt, '2026-06-01', '2026-06-30');
  v_mt2 := public.fn_mc_medicao_abrir(v_kt, v_hoje, v_hoje + 30);

  -- 4f. Recusas do lançamento
  begin perform public.fn_mc_lancamento_salvar(v_kl, public.fn_mc_prova_dados(v_i0101, '2026-06-22', '1', null, null));
    v_txt := 'PASSOU (errado)'; exception when others then v_txt := 'recusou: ' || sqlerrm; end;
  r := r || jsonb_build_object('4f1_sem_km', v_txt);
  begin perform public.fn_mc_lancamento_salvar(v_kl, public.fn_mc_prova_dados(v_i0101, '2026-06-22', '1', '-1', '2'));
    v_txt := 'PASSOU (errado)'; exception when others then v_txt := 'recusou: ' || sqlerrm; end;
  r := r || jsonb_build_object('4f2_km_negativo', v_txt);
  begin perform public.fn_mc_lancamento_salvar(v_kl, public.fn_mc_prova_dados(v_i0101, '2026-06-22', '0', '1', '2'));
    v_txt := 'PASSOU (errado)'; exception when others then v_txt := 'recusou: ' || sqlerrm; end;
  r := r || jsonb_build_object('4f3_quantidade_zero', v_txt);
  begin perform public.fn_mc_lancamento_salvar(v_kl, public.fn_mc_prova_dados(v_i0101, '2026-06-22', '1.00001', '1', '2'));
    v_txt := 'PASSOU (errado)'; exception when others then v_txt := 'recusou: ' || sqlerrm; end;
  r := r || jsonb_build_object('4f4_cinco_casas', v_txt);
  begin perform public.fn_mc_lancamento_salvar(v_kt, public.fn_mc_prova_dados(v_it0101, (v_hoje + 1)::text, '1', null, null));
    v_txt := 'PASSOU (errado)'; exception when others then v_txt := 'recusou: ' || sqlerrm; end;
  r := r || jsonb_build_object('4f5_data_futura', v_txt);
  r := r || jsonb_build_object('4f5_prova_ainda_nao_chegou', public.fn_mc_prova_confere(
    to_jsonb(v_txt like '%ainda não chegou%'), to_jsonb(true)));
  begin perform public.fn_mc_lancamento_salvar(v_kl, public.fn_mc_prova_dados(v_i01, '2026-06-22', '1', '1', '2'));
    v_txt := 'PASSOU (errado)'; exception when others then v_txt := 'recusou: ' || sqlerrm; end;
  r := r || jsonb_build_object('4f6_titulo', v_txt);
  begin perform public.fn_mc_lancamento_salvar(v_kl, public.fn_mc_prova_dados(v_i0101, '2026-05-01', '1', '1', '2'));
    v_txt := 'PASSOU (errado)'; exception when others then v_txt := 'recusou: ' || sqlerrm; end;
  r := r || jsonb_build_object('4f7_sem_medicao', v_txt);
  -- 4f8: o item de outro contrato nem chega à checagem de FK (item_id, contrato_id): o trigger recusa
  -- antes, pelo MESMO check do título (4f6) - o item não tem linha na planilha da versão desta medição,
  -- então "não é serviço" acusa. Não existe mensagem própria de "item de outro contrato".
  begin perform public.fn_mc_lancamento_salvar(v_kl, public.fn_mc_prova_dados(v_it0101, '2026-06-22', '1', '1', '2'));
    v_txt := 'PASSOU (errado)'; exception when others then v_txt := 'recusou: ' || sqlerrm; end;
  r := r || jsonb_build_object('4f8_item_de_outro_contrato', v_txt);
  r := r || jsonb_build_object('4f8_prova_nao_e_servico', public.fn_mc_prova_confere(
    to_jsonb(v_txt like '%não é serviço%'), to_jsonb(true)));

  -- 4g. Excesso: 4 + 3 + 4 = 11 > 10
  begin perform public.fn_mc_lancamento_salvar(v_kl, public.fn_mc_prova_dados(v_i0101, '2026-07-02', '4', '3', '4'));
    v_txt := 'PASSOU (errado)'; exception when others then v_txt := 'recusou [' || sqlstate || ']: ' || sqlerrm; end;
  r := r || jsonb_build_object('4g1_excesso_sem_motivo', v_txt);
  v_l3 := public.fn_mc_lancamento_salvar(v_kl, public.fn_mc_prova_dados(v_i0101, '2026-07-02', '4', '3', '4')
                                               || jsonb_build_object('motivo_excesso', 'aditivo em análise'));
  r := r || jsonb_build_object('4g2_excesso_com_motivo', public.fn_mc_prova_confere(
    (select jsonb_build_object('medicao', medicao_numero, 'motivo', motivo_excesso, 'qtd', quantidade::text) from public.mc_v_lancamentos where id = v_l3),
    jsonb_build_object('medicao', 2, 'motivo', 'aditivo em análise', 'qtd', '4')));

  -- 4h. Colar só conferindo: a 2ª linha passa do previsto (3 + 3 = 6 > 5), nada grava
  select count(*) into v_n from public.mc_lancamentos where contrato_id = v_kl;
  v_j := public.fn_mc_lancamentos_colar(v_kl, jsonb_build_array(
    public.fn_mc_prova_dados(v_i0102, '2026-07-03', '3', '5', '6') || '{"linha": 1}',
    public.fn_mc_prova_dados(v_i0102, '2026-07-04', '3', '6', '7') || '{"linha": 2}'), false);
  select count(*) into v_n2 from public.mc_lancamentos where contrato_id = v_kl;
  r := r || jsonb_build_object('4h_colar_previa', public.fn_mc_prova_confere(jsonb_build_object(
      'gravadas', v_j -> 'gravadas', 'validas', v_j -> 'validas',
      'erros', (select jsonb_agg(e - 'erro') from jsonb_array_elements(v_j -> 'erros') e), 'novas', v_n2 - v_n),
    jsonb_build_object('gravadas', 0, 'validas', 1, 'erros', jsonb_build_array(jsonb_build_object('linha', 2, 'excesso', true)), 'novas', 0)));
  r := r || jsonb_build_object('4h_colar_previa_erro', v_j #>> '{erros,0,erro}');

  -- 4i. Colar gravando: tudo ou nada
  begin perform public.fn_mc_lancamentos_colar(v_kl, jsonb_build_array(
      public.fn_mc_prova_dados(v_i0102, '2026-07-03', '3', '5', '6') || '{"linha": 1}',
      public.fn_mc_prova_dados(v_i0102, '2026-07-04', '3', '6', '7') || '{"linha": 2}'), true);
    v_txt := 'PASSOU (errado)'; v_det := null;
  exception when others then
    get stacked diagnostics v_det = pg_exception_detail;
    v_txt := 'recusou [' || sqlstate || ']: ' || sqlerrm;
  end;
  select count(*) into v_n2 from public.mc_lancamentos where contrato_id = v_kl;
  r := r || jsonb_build_object('4i1_colar_com_erro', v_txt);
  r := r || jsonb_build_object('4i1_detalhe_e_contagem', public.fn_mc_prova_confere(jsonb_build_object(
      'detalhe', (select jsonb_agg(e - 'erro') from jsonb_array_elements(v_det::jsonb) e), 'novas', v_n2 - v_n),
    jsonb_build_object('detalhe', jsonb_build_array(jsonb_build_object('linha', 2, 'excesso', true)), 'novas', 0)));
  v_j := public.fn_mc_lancamentos_colar(v_kl, jsonb_build_array(
    public.fn_mc_prova_dados(v_i0102, '2026-07-03', '3', '5', '6') || '{"linha": 1}',
    public.fn_mc_prova_dados(v_i0102, '2026-07-04', '2', '6', '7') || '{"linha": 2}'), true);
  select count(*) into v_n2 from public.mc_lancamentos where contrato_id = v_kl;
  r := r || jsonb_build_object('4i2_colar_grava', public.fn_mc_prova_confere(
    v_j || jsonb_build_object('novas', v_n2 - v_n),
    jsonb_build_object('gravadas', 2, 'validas', 2, 'erros', '[]'::jsonb, 'novas', 2)));

  -- 4j. Editar: quantidade; data que muda de medição e volta
  perform public.fn_mc_lancamento_salvar(v_kl, public.fn_mc_prova_dados(v_i0101, '2026-06-20', '2', '1', '2'), v_l1);
  v_j := jsonb_build_object('qtd', (select quantidade::text from public.mc_v_lancamentos where id = v_l1), 'med', public.fn_mc_prova_med(v_l1));
  perform public.fn_mc_lancamento_salvar(v_kl, public.fn_mc_prova_dados(v_i0101, '2026-07-05', '2', '1', '2'), v_l1);
  v_j := v_j || jsonb_build_object('med_0705', public.fn_mc_prova_med(v_l1));
  perform public.fn_mc_lancamento_salvar(v_kl, public.fn_mc_prova_dados(v_i0101, '2026-06-20', '2', '1', '2'), v_l1);
  v_j := v_j || jsonb_build_object('med_volta', public.fn_mc_prova_med(v_l1));
  r := r || jsonb_build_object('4j_editar', public.fn_mc_prova_confere(v_j,
    jsonb_build_object('qtd', '2', 'med', 1, 'med_0705', 2, 'med_volta', 1)));

  -- 4k. Acumulado igual ao previsto passa; excluir exige motivo
  v_l5 := public.fn_mc_lancamento_salvar(v_kl, public.fn_mc_prova_dados(v_i0101, '2026-06-21', '1', '3', '4'));
  r := r || jsonb_build_object('4k1_acumulado_igual_previsto', public.fn_mc_prova_confere(to_jsonb(public.fn_mc_prova_med(v_l5)), to_jsonb(1)));
  begin perform public.fn_mc_lancamento_excluir(v_l5, 'ab');
    v_txt := 'PASSOU (errado)'; exception when others then v_txt := 'recusou: ' || sqlerrm; end;
  r := r || jsonb_build_object('4k2_excluir_motivo_curto', v_txt);
  perform public.fn_mc_lancamento_excluir(v_l5, 'lançado errado');
  r := r || jsonb_build_object('4k3_excluir', public.fn_mc_prova_confere(jsonb_build_object(
      'linha', (select jsonb_build_object('excluido', excluido_em is not null, 'por_tiago', excluido_por = v_tiago, 'motivo', motivo_exclusao)
                from public.mc_v_lancamentos where id = v_l5),
      'qtd_1a', (select qtd_lancada::text from public.mc_v_medicao_qtd where medicao_id = v_m1 and item_id = v_i0101)),
    jsonb_build_object('linha', jsonb_build_object('excluido', true, 'por_tiago', true, 'motivo', 'lançado errado'), 'qtd_1a', '2')));
  begin perform public.fn_mc_lancamento_excluir(v_l5, 'de novo');
    v_txt := 'PASSOU (errado)'; exception when others then v_txt := 'recusou: ' || sqlerrm; end;
  r := r || jsonb_build_object('4k4_excluir_ja_excluido', v_txt);

  -- 4l. 1ª em conferência: lançamento dela não muda nem sai, e não entra lançamento novo nela
  reset role;
  update public.mc_medicoes set status = 'em_conferencia' where id = v_m1;
  set local role authenticated;
  begin perform public.fn_mc_lancamento_salvar(v_kl, public.fn_mc_prova_dados(v_i0101, '2026-06-20', '1', '1', '2'), v_l1);
    v_txt := 'PASSOU (errado)'; exception when others then v_txt := 'recusou: ' || sqlerrm; end;
  r := r || jsonb_build_object('4l1_editar_em_conferencia', v_txt);
  begin perform public.fn_mc_lancamento_excluir(v_l1, 'motivo qualquer');
    v_txt := 'PASSOU (errado)'; exception when others then v_txt := 'recusou: ' || sqlerrm; end;
  r := r || jsonb_build_object('4l2_excluir_em_conferencia', v_txt);
  begin perform public.fn_mc_lancamento_salvar(v_kl, public.fn_mc_prova_dados(v_i0101, '2026-06-15', '1', '1', '2'));
    v_txt := 'PASSOU (errado)'; exception when others then v_txt := 'recusou: ' || sqlerrm; end;
  r := r || jsonb_build_object('4l3_lancar_em_conferencia', v_txt);

  -- 4o. KT (texto): lançar sem km grava (a 1ª medição de KT já foi aberta antes do grupo 4f)
  v_lt := public.fn_mc_lancamento_salvar(v_kt, public.fn_mc_prova_dados(v_it0101, '2026-06-10', '1', null, null)
                                               || jsonb_build_object('local_texto', '  Rua A  ', 'observacao', ''));
  r := r || jsonb_build_object('4o_texto_sem_km', public.fn_mc_prova_confere(
    (select jsonb_build_object('medicao', medicao_numero, 'km', jsonb_build_array(km_inicial, km_final), 'local', local_texto, 'obs', observacao)
     from public.mc_v_lancamentos where id = v_lt),
    jsonb_build_object('medicao', 1, 'km', jsonb_build_array(null, null), 'local', 'Rua A', 'obs', null)));

  -- 4p. Boletim de KL depois de 4e..4l
  v_b := public.fn_mc_boletim(v_kl);
  v_j := (select jsonb_agg(jsonb_build_object('numero', m -> 'numero', 'status', m -> 'status', 'valor', m -> 'valor') order by (m ->> 'numero')::int)
          from jsonb_array_elements(v_b -> 'medicoes') m);
  r := r || jsonb_build_object('4p_boletim', public.fn_mc_prova_confere(v_j, jsonb_build_array(
    jsonb_build_object('numero', 1, 'status', 'em_conferencia', 'valor', '4.00'),
    jsonb_build_object('numero', 2, 'status', 'aberta', 'valor', '29.00'))));

  -- 4q. Controle: a 2ª contra um alvo desviado em R$ 0,01 tem de dar DIFERENTE
  r := r || jsonb_build_object('4q_controle', case when v_j #>> '{1,valor}' = '29.01' then 'IGUAL (errado)' else 'DIFERENTE (esperado)' end);
  reset role;

  -- 4n. Update direto como dono trocando o contrato do lançamento. No trigger (UPDATE), o check do
  -- contrato é o PRIMEIRO depois da trava de status da medição atual: fire antes de olhar a medição do
  -- contrato novo, então recusa mesmo o destino (KT) não tendo medição aberta cobrindo a data do lançamento.
  begin update public.mc_lancamentos set contrato_id = v_kt where id = v_l2;
    v_txt := 'PASSOU (errado)'; exception when others then v_txt := 'recusou: ' || sqlerrm; end;
  r := r || jsonb_build_object('4n_contrato_nao_muda', v_txt);
  r := r || jsonb_build_object('4n_prova_contrato_nao_muda', public.fn_mc_prova_confere(
    to_jsonb(v_txt like '%contrato do lançamento não muda%'), to_jsonb(true)));

  -- 4m. Usuário zero: sem permissão; com permissão e fora da lista; sem medicao.medicoes/criar
  perform set_config('request.jwt.claims', json_build_object('sub', v_zero, 'role', 'authenticated')::text, true);
  set local role authenticated;
  begin perform public.fn_mc_lancamento_salvar(v_kl, public.fn_mc_prova_dados(v_i0101, '2026-07-06', '1', '1', '2'));
    v_txt := 'PASSOU (errado)'; exception when others then v_txt := 'recusou: ' || sqlerrm; end;
  r := r || jsonb_build_object('4m1_sem_permissao', v_txt);
  begin perform public.fn_mc_lancamentos_colar(v_kl, jsonb_build_array(
      public.fn_mc_prova_dados(v_i0101, '2026-07-06', '1', '1', '2') || '{"linha": 1}'), false);
    v_txt := 'PASSOU (errado)'; exception when others then v_txt := 'recusou: ' || sqlerrm; end;
  r := r || jsonb_build_object('4m2_colar_sem_permissao', v_txt);
  begin perform public.fn_mc_medicao_abrir(v_kl, '2026-07-26', '2026-08-25');
    v_txt := 'PASSOU (errado)'; exception when others then v_txt := 'recusou: ' || sqlerrm; end;
  r := r || jsonb_build_object('4m3_abrir_sem_permissao', v_txt);
  begin perform public.fn_mc_medicao_sugestao(v_kl);
    v_txt := 'PASSOU (errado)'; exception when others then v_txt := 'recusou: ' || sqlerrm; end;
  r := r || jsonb_build_object('4m4_sugestao_sem_permissao', v_txt);
  reset role;
  insert into public.usuario_permissoes (usuario_id, recurso, acao)
  values (v_zero, 'medicao.lancamentos', 'criar'), (v_zero, 'medicao.lancamentos', 'excluir') on conflict do nothing;
  set local role authenticated;
  begin perform public.fn_mc_lancamento_salvar(v_kl, public.fn_mc_prova_dados(v_i0101, '2026-07-06', '1', '1', '2'));
    v_txt := 'PASSOU (errado)'; exception when others then v_txt := 'recusou: ' || sqlerrm; end;
  r := r || jsonb_build_object('4m5_fora_da_lista', v_txt);
  begin perform public.fn_mc_lancamento_excluir(v_l2, 'motivo qualquer');
    v_txt := 'PASSOU (errado)'; exception when others then v_txt := 'recusou: ' || sqlerrm; end;
  r := r || jsonb_build_object('4m6_excluir_fora_da_lista', v_txt);
  reset role;

  -- 4r. Nada fora do módulo; o Lote 09 intacto
  r := r || jsonb_build_object('4r_nada_fora', public.fn_mc_prova_confere(jsonb_build_object('fora', public.fn_mc_prova_fora(),
      'l09_medicoes', (select count(*) from public.mc_medicoes where contrato_id = v_l09),
      'l09_lancamentos', (select count(*) from public.mc_lancamentos where contrato_id = v_l09)),
    jsonb_build_object('fora', v_fora0, 'l09_medicoes', 10, 'l09_lancamentos', 0)));

  -- 4s. Grants: a view só com select para authenticated; as RPCs sem anon; a interna sem authenticated
  r := r || jsonb_build_object('4s_grants', public.fn_mc_prova_confere(jsonb_build_object(
      'view', (select jsonb_object_agg(grantee, privs) from (select grantee, string_agg(privilege_type, ',' order by privilege_type) privs
               from information_schema.role_table_grants where table_schema = 'public' and table_name = 'mc_v_lancamentos'
                 and grantee in ('anon', 'authenticated') group by grantee) g),
      'view_maintain_anon', has_table_privilege('anon', 'public.mc_v_lancamentos', 'MAINTAIN'),
      'anon', (select jsonb_agg(has_function_privilege('anon', f, 'EXECUTE') order by f) from unnest(array[
          'public.fn_mc_medicao_sugestao(uuid)', 'public.fn_mc_medicao_abrir(uuid, date, date)', 'public.fn_mc_lancamento_salvar(uuid, jsonb, uuid)',
          'public.fn_mc_lancamento_excluir(uuid, text)', 'public.fn_mc_lancamentos_colar(uuid, jsonb, boolean)', 'public.fn_mc_lancamento_gravar(uuid, jsonb, uuid)']) f),
      'authenticated', (select jsonb_agg(has_function_privilege('authenticated', f, 'EXECUTE') order by f) from unnest(array[
          'public.fn_mc_medicao_sugestao(uuid)', 'public.fn_mc_medicao_abrir(uuid, date, date)', 'public.fn_mc_lancamento_salvar(uuid, jsonb, uuid)',
          'public.fn_mc_lancamento_excluir(uuid, text)', 'public.fn_mc_lancamentos_colar(uuid, jsonb, boolean)', 'public.fn_mc_lancamento_gravar(uuid, jsonb, uuid)']) f)),
    jsonb_build_object('view', jsonb_build_object('authenticated', 'SELECT'), 'view_maintain_anon', false,
      'anon', jsonb_build_array(false, false, false, false, false, false),
      'authenticated', (select jsonb_agg(f <> 'public.fn_mc_lancamento_gravar(uuid, jsonb, uuid)' order by f) from unnest(array[
          'public.fn_mc_medicao_sugestao(uuid)', 'public.fn_mc_medicao_abrir(uuid, date, date)', 'public.fn_mc_lancamento_salvar(uuid, jsonb, uuid)',
          'public.fn_mc_lancamento_excluir(uuid, text)', 'public.fn_mc_lancamentos_colar(uuid, jsonb, boolean)', 'public.fn_mc_lancamento_gravar(uuid, jsonb, uuid)']) f))));

  -- 4t. Anexo mc_lancamento: vincular passa dentro da lista (KL) e recusa fora dela. KZ nasce sem o Tiago
  -- na lista, para ficar "fora da lista" mesmo com ele sendo o dono (created_by).
  insert into public.mc_contratos (codigo, nome_obra, objeto, numero_contrato, contratante_nome, contratante_tipo,
    valor_inicial, data_assinatura, prazo_meses, regra_arredondamento, created_by)
  values ('PROVA-KZ', 'Prova KZ', 'Prova', 'KZ', 'Contratante prova', 'estadual', 1, '2026-06-01', 12, 'item_por_medicao', v_tiago)
  returning id into v_kz;
  v_vkz := public.fn_mc_prova_planilha(v_kz, 0, null, '2026-06-01', jsonb_build_array(
    jsonb_build_object('ordem', 1, 'codigo', '01.01', 'descricao', 'Serviço', 'unidade', 'm3', 'tipo', 'servico', 'preco', '1', 'qtd', '10')));
  v_ikz := public.fn_mc_prova_item(v_kz, '01.01');
  insert into public.mc_medicoes (contrato_id, numero, periodo_inicio, periodo_fim, status, versao_id, origem, created_by)
  values (v_kz, 1, '2026-06-01', '2026-06-30', 'aberta', v_vkz, 'app', v_tiago) returning id into v_mkz;
  insert into public.mc_lancamentos (contrato_id, item_id, medicao_id, data, quantidade, created_by)
  values (v_kz, v_ikz, v_mkz, '2026-06-10', 1, v_tiago) returning id into v_lkz;
  insert into public.arquivos (path_storage, nome_original, tamanho_bytes, created_by)
  values ('prova/anexo-mc-lancamento.jpg', 'anexo-mc-lancamento.jpg', 100, v_tiago) returning id into v_arq;

  perform set_config('request.jwt.claims', json_build_object('sub', v_tiago, 'role', 'authenticated')::text, true);
  set local role authenticated;
  begin v_vinc := public.fn_vincular_arquivo(v_arq, 'mc_lancamento', v_l1); v_txt := 'ok'; exception when others then v_txt := 'recusou: ' || sqlerrm; end;
  r := r || jsonb_build_object('4t1_anexo_na_lista', public.fn_mc_prova_confere(to_jsonb(v_txt = 'ok' and v_vinc is not null), to_jsonb(true)));
  begin perform public.fn_vincular_arquivo(v_arq, 'mc_lancamento', v_lkz);
    v_txt := 'PASSOU (errado)'; exception when others then v_txt := 'recusou: ' || sqlerrm; end;
  r := r || jsonb_build_object('4t2_anexo_fora_da_lista', v_txt);
  reset role;

  raise exception 'PROVA %', r;
end $prova$;
do $aborto$ begin raise exception 'ABORTO GARANTIDO'; end $aborto$;
rollback;
