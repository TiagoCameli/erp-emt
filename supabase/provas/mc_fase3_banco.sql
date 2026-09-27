-- Prova da Fase 3a da Medição de Contratos (boletim e painel). Migration mc_fase3a_boletim_painel.
-- NÃO GRAVA: termina em raise exception com os resultados, e o bloco de aborto garante o rollback.
-- Rodar inteira pelo MCP execute_sql. Cada caso vira uma chave em r: "OK" quando bate com o esperado,
-- {"DIFERENTE": obtido, "esperado": ...} quando não bate; "recusou: ..." é o esperado nos casos de
-- trava; "PASSOU (errado)" é falha. O controle 3k tem de sair "DIFERENTE (esperado)".
--
-- As RPCs são chamadas como usuário (set local role authenticated + request.jwt.claims). O Tiago
-- ainda não tem medicao.boletim/ver nem medicao.painel/ver em produção (o backfill é a Task 4):
-- a prova insere as duas para ele dentro da própria transação.
--
-- Números esperados, feitos à mão (contrato K, sem_arredondar, as linhas do K1 da prova da Fase 1):
--   01 título | 01.01 3 x 0,335 | 01.02 3 x 0,335 | 01.02.01 (filho de 01.02) 2 x 10,004
--   02 título | 02.01 1 x 100,005 | 02.01 (repetido) 1 x 1
--   1ª (jan) lança 01.01 1,5 e 02.01 (ordem 6) 0,5; 2ª (fev) lança 01.01 1,5 e 01.02.01 1. Ambas abertas.
--   Até a 2ª (padrão), previsto / valor na 2ª / acumulado / saldo / % executada:
--     01.01     1,01 / round(0,5025) = 0,50 / round(1,005) = 1,01 / 0,00 / 1
--     01.02     1,01 / 0,00 / 0,00 / 1,01 / 0   (serviço com filho mostra só os dele)
--     01.02.01  20,01 / 10,00 / 10,00 / 10,01 / 10/20,01
--     01        round(22,018) = 22,02 / round(10,5065) = 10,51 / round(11,009) = 11,01 / 11,01 / 0,5
--     02.01 (6) 100,01 / 0,00 / round(50,0025) = 50,00 / 50,01 / 50/100,01
--     02        101,01 / 0,00 / 50,00 / 51,01 / 50/101,01
--     02.01 (7) 1,00 / 0,00 / 0,00 / 1,00 / 0
--     total     123,02 / 10,51 / round(61,0115) = 61,01 / 62,01 / 61,01/123,02 = 0,495936
--     medições  1ª round(50,505) = 50,51; 2ª 10,51
--   Até a 1ª: total valor 50,51, acumulado round(50,505) = 50,51 (grupos 0,50 + 50,00 = 50,50: o
--     centavo), saldo 72,51; 01.01 qtds só {1: 1.5}.
--   Regra nula: toda chave de dinheiro e % nula, qtds iguais.
--   Fora da versão (K3): v0 01 título, 01.01 1 x 10, 01.02 1 x 5; 1ª lança 01.02 0,5 (2,50); aditivo +
--     v1 a partir de fevereiro só com 01 e 01.01. Boletim: linhas de v1 (previsto 10,00), fora_da_versao
--     com 01.02 acumulado 2,50, total acumulado 2,50, saldo 7,50.
--   Sem medição (KV): 01 título, 01.01 2 x 3,5 = 7,00; ate nulo, valores zero, saldo 7,00.
--   Painel filtrado privado: só K, previsto 123,02, acumulado 61,01, saldo 62,01, corrente 2ª 10,51.
--   Lote 09 vivo: total previsto 243927483.49, acumulado 36541661.77, valor da 10ª 680738.27,
--     saldo 207385821.72; 8 grupos; 265 linhas; 02.07.04 preço 580.8643.

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
create function public.fn_mc_prova_medicao(p_contrato uuid, p_ini date, p_fim date) returns uuid language sql set search_path to '' as $$
  insert into public.mc_medicoes (contrato_id, numero, periodo_inicio, periodo_fim, versao_id)
  select p_contrato, coalesce((select max(numero) from public.mc_medicoes where contrato_id = p_contrato), 0) + 1, p_ini, p_fim,
         (select id from public.mc_planilha_versoes where contrato_id = p_contrato and status = 'vigente' order by numero desc limit 1)
  returning id;
$$;
-- Lança a quantidade no item da linha de ordem p_ordem da versão vigente; o gatilho acha a medição pela data.
create function public.fn_mc_prova_lancar(p_contrato uuid, p_ordem int, p_data date, p_qtd numeric) returns void language sql set search_path to '' as $$
  insert into public.mc_lancamentos (contrato_id, item_id, medicao_id, data, quantidade)
  select p_contrato, i.item_id, '00000000-0000-0000-0000-000000000000', p_data, p_qtd
  from public.mc_planilha_itens i join public.mc_planilha_versoes v on v.id = i.versao_id
  where i.contrato_id = p_contrato and i.ordem = p_ordem and v.status = 'vigente'
  order by v.numero desc limit 1;
$$;
-- Uma linha do boletim, só as chaves conferidas (% com 6 casas).
create function public.fn_mc_prova_linha(p_boletim jsonb, p_ordem int) returns jsonb language sql immutable set search_path to '' as $$
  select jsonb_build_object('qtds', l -> 'qtds', 'previsto', l ->> 'previsto', 'valor', l ->> 'valor_medicao',
    'acumulado', l ->> 'acumulado', 'saldo', l ->> 'saldo', 'pct', round((l ->> 'pct_executado')::numeric, 6)::text)
  from jsonb_array_elements(p_boletim -> 'linhas') l where (l ->> 'ordem')::int = p_ordem;
$$;
create function public.fn_mc_prova_total(p_boletim jsonb) returns jsonb language sql immutable set search_path to '' as $$
  select jsonb_build_object('previsto', t ->> 'previsto', 'valor', t ->> 'valor_medicao', 'acumulado', t ->> 'acumulado',
    'saldo', t ->> 'saldo', 'pct', round((t ->> 'pct_executado')::numeric, 6)::text)
  from (select p_boletim -> 'total' as t) x;
$$;
create function public.fn_mc_prova_confere(p_obtido jsonb, p_esperado jsonb) returns jsonb language sql immutable set search_path to '' as $$
  select case when p_obtido = p_esperado then to_jsonb('OK'::text)
              else jsonb_build_object('DIFERENTE', p_obtido, 'esperado', p_esperado) end;
$$;
-- Contagem de linhas de toda tabela mc_* e das tabelas dos outros módulos que o módulo não pode tocar.
create function public.fn_mc_prova_contagens() returns jsonb language plpgsql set search_path to '' as $$
declare t text; v_n bigint; v_res jsonb := '{}'::jsonb;
begin
  for t in select c.relname from pg_class c join pg_namespace n on n.oid = c.relnamespace
           where n.nspname = 'public' and c.relkind = 'r' and (c.relname like 'mc\_%' or c.relname in ('obras', 'centros_custo', 'lancamentos'))
           order by c.relname loop
    execute format('select count(*) from public.%I', t) into v_n;
    v_res := v_res || jsonb_build_object(t, v_n);
  end loop;
  return v_res;
end $$;

do $prova$
declare
  v_tiago constant uuid := 'c66fca9f-5428-4fb9-855f-dcff548764df';
  v_zero constant uuid := 'f155865b-1d4b-4b25-bf3d-54d8de9176b0';
  v_l09 constant uuid := 'c4109738-9af7-4ddb-8982-3b2c79fe6e43';
  v_k uuid; v_k3 uuid; v_kv uuid; v_b jsonb; v_b2 jsonb; v_p jsonb; v_j jsonb; v_txt text; v_n bigint;
  v_cont0 jsonb; v_t0 timestamptz; v_ms numeric; r jsonb := '{}'::jsonb;
begin
  -- Dados, montados como dono. K: cálculo; K3: fora da versão; KV: sem medição.
  insert into public.mc_contratos (codigo, nome_obra, objeto, numero_contrato, contratante_nome, contratante_tipo,
    valor_inicial, data_assinatura, prazo_meses, regra_arredondamento, created_by)
  values ('PROVA-K', 'Prova K', 'Prova', 'K', 'Contratante prova', 'privado', 123.02, '2025-12-01', 12, 'sem_arredondar', v_tiago)
  returning id into v_k;
  insert into public.mc_contrato_usuarios (contrato_id, usuario_id) values (v_k, v_tiago);
  perform public.fn_mc_prova_planilha(v_k, 0, null, '2025-12-01', jsonb_build_array(
    jsonb_build_object('ordem', 1, 'codigo', '01', 'descricao', 'Grupo A', 'tipo', 'titulo'),
    jsonb_build_object('ordem', 2, 'codigo', '01.01', 'pai', 1, 'descricao', 'Serviço 1', 'unidade', 'un', 'tipo', 'servico', 'preco', '0.335', 'qtd', '3'),
    jsonb_build_object('ordem', 3, 'codigo', '01.02', 'pai', 1, 'descricao', 'Serviço 2', 'unidade', 'm2', 'tipo', 'servico', 'preco', '0.335', 'qtd', '3'),
    jsonb_build_object('ordem', 4, 'codigo', '01.02.01', 'pai', 3, 'descricao', 'Filho com preço', 'unidade', 't', 'tipo', 'servico', 'preco', '10.004', 'qtd', '2'),
    jsonb_build_object('ordem', 5, 'codigo', '02', 'descricao', 'Grupo B', 'tipo', 'titulo'),
    jsonb_build_object('ordem', 6, 'codigo', '02.01', 'pai', 5, 'descricao', 'Serviço 3', 'unidade', 'un', 'tipo', 'servico', 'preco', '100.005', 'qtd', '1'),
    jsonb_build_object('ordem', 7, 'codigo', '02.01', 'pai', 5, 'descricao', 'Código repetido', 'unidade', 'un', 'tipo', 'servico', 'preco', '1', 'qtd', '1')));
  perform public.fn_mc_prova_medicao(v_k, '2026-01-01', '2026-01-31');
  perform public.fn_mc_prova_medicao(v_k, '2026-02-01', '2026-02-28');
  perform public.fn_mc_prova_lancar(v_k, 2, '2026-01-10', 1.5);
  perform public.fn_mc_prova_lancar(v_k, 6, '2026-01-15', 0.5);
  perform public.fn_mc_prova_lancar(v_k, 2, '2026-02-05', 1.5);
  perform public.fn_mc_prova_lancar(v_k, 4, '2026-02-10', 1);

  insert into public.mc_contratos (codigo, nome_obra, objeto, numero_contrato, contratante_nome, contratante_tipo,
    valor_inicial, data_assinatura, prazo_meses, regra_arredondamento, created_by)
  values ('PROVA-K3', 'Prova K3', 'Prova', 'K3', 'Contratante prova', 'municipal', 15, '2025-12-01', 12, 'sem_arredondar', v_tiago)
  returning id into v_k3;
  insert into public.mc_contrato_usuarios (contrato_id, usuario_id) values (v_k3, v_tiago);
  perform public.fn_mc_prova_planilha(v_k3, 0, null, '2025-12-01', jsonb_build_array(
    jsonb_build_object('ordem', 1, 'codigo', '01', 'descricao', 'Grupo', 'tipo', 'titulo'),
    jsonb_build_object('ordem', 2, 'codigo', '01.01', 'pai', 1, 'descricao', 'Fica', 'unidade', 'un', 'tipo', 'servico', 'preco', '10', 'qtd', '1'),
    jsonb_build_object('ordem', 3, 'codigo', '01.02', 'pai', 1, 'descricao', 'Sai no aditivo', 'unidade', 'm', 'tipo', 'servico', 'preco', '5', 'qtd', '1')));
  perform public.fn_mc_prova_medicao(v_k3, '2026-01-01', '2026-01-31');
  perform public.fn_mc_prova_lancar(v_k3, 3, '2026-01-20', 0.5);
  insert into public.mc_aditivos (contrato_id, numero, data_assinatura, data_vigencia, tipos, motivo)
  values (v_k3, 1, '2026-01-25', '2026-02-01', array['quantidade', 'valor'], 'Prova: 01.02 sai');
  perform public.fn_mc_prova_planilha(v_k3, 1, (select id from public.mc_aditivos where contrato_id = v_k3), '2026-02-01', jsonb_build_array(
    jsonb_build_object('ordem', 1, 'codigo', '01', 'descricao', 'Grupo', 'tipo', 'titulo',
                       'item_id', (select item_id from public.mc_planilha_itens where contrato_id = v_k3 and ordem = 1 limit 1)),
    jsonb_build_object('ordem', 2, 'codigo', '01.01', 'pai', 1, 'descricao', 'Fica', 'unidade', 'un', 'tipo', 'servico', 'preco', '10', 'qtd', '1',
                       'item_id', (select item_id from public.mc_planilha_itens where contrato_id = v_k3 and ordem = 2 limit 1))));

  insert into public.mc_contratos (codigo, nome_obra, objeto, numero_contrato, contratante_nome, contratante_tipo,
    valor_inicial, data_assinatura, prazo_meses, regra_arredondamento, created_by)
  values ('PROVA-KV', 'Prova KV', 'Prova', 'KV', 'Contratante prova', 'estadual', 7, '2025-12-01', 12, 'sem_arredondar', v_tiago)
  returning id into v_kv;
  insert into public.mc_contrato_usuarios (contrato_id, usuario_id) values (v_kv, v_tiago);
  perform public.fn_mc_prova_planilha(v_kv, 0, null, '2025-12-01', jsonb_build_array(
    jsonb_build_object('ordem', 1, 'codigo', '01', 'descricao', 'Grupo', 'tipo', 'titulo'),
    jsonb_build_object('ordem', 2, 'codigo', '01.01', 'pai', 1, 'descricao', 'Serviço', 'unidade', 'un', 'tipo', 'servico', 'preco', '3.5', 'qtd', '2')));

  -- Permissões da fase, só nesta transação: Tiago com as duas; v_zero com as duas, fora da lista de K.
  insert into public.usuario_permissoes (usuario_id, recurso, acao)
  values (v_tiago, 'medicao.boletim', 'ver'), (v_tiago, 'medicao.painel', 'ver'),
         (v_zero, 'medicao.boletim', 'ver'), (v_zero, 'medicao.painel', 'ver') on conflict do nothing;

  -- Contagem antes das RPCs (caso 3l)
  v_cont0 := public.fn_mc_prova_contagens();

  perform set_config('request.jwt.claims', json_build_object('sub', v_tiago, 'role', 'authenticated')::text, true);
  set local role authenticated;

  -- 3a. Boletim de K até a 2ª (padrão: última medição)
  v_b := public.fn_mc_boletim(v_k);
  r := r || jsonb_build_object('3a_boletim_ate_2a', public.fn_mc_prova_confere(jsonb_build_object(
      'ate', v_b -> 'ate', 'versao', v_b #> '{versao,numero}', 'fora', jsonb_array_length(v_b -> 'fora_da_versao'),
      '01', public.fn_mc_prova_linha(v_b, 1), '01.01', public.fn_mc_prova_linha(v_b, 2),
      '01.02', public.fn_mc_prova_linha(v_b, 3), '01.02.01', public.fn_mc_prova_linha(v_b, 4),
      '02', public.fn_mc_prova_linha(v_b, 5), '02.01_6', public.fn_mc_prova_linha(v_b, 6), '02.01_7', public.fn_mc_prova_linha(v_b, 7),
      'total', public.fn_mc_prova_total(v_b),
      'medicoes', (select jsonb_agg(m -> 'valor' order by (m ->> 'numero')::int) from jsonb_array_elements(v_b -> 'medicoes') m)),
    jsonb_build_object('ate', 2, 'versao', 0, 'fora', 0,
      '01', jsonb_build_object('qtds', '{}'::jsonb, 'previsto', '22.02', 'valor', '10.51', 'acumulado', '11.01', 'saldo', '11.01', 'pct', '0.500000'),
      '01.01', jsonb_build_object('qtds', jsonb_build_object('1', '1.5', '2', '1.5'), 'previsto', '1.01', 'valor', '0.50', 'acumulado', '1.01', 'saldo', '0.00', 'pct', '1.000000'),
      '01.02', jsonb_build_object('qtds', '{}'::jsonb, 'previsto', '1.01', 'valor', '0.00', 'acumulado', '0.00', 'saldo', '1.01', 'pct', '0.000000'),
      '01.02.01', jsonb_build_object('qtds', jsonb_build_object('2', '1'), 'previsto', '20.01', 'valor', '10.00', 'acumulado', '10.00', 'saldo', '10.01', 'pct', '0.499750'),
      '02', jsonb_build_object('qtds', '{}'::jsonb, 'previsto', '101.01', 'valor', '0.00', 'acumulado', '50.00', 'saldo', '51.01', 'pct', '0.495000'),
      '02.01_6', jsonb_build_object('qtds', jsonb_build_object('1', '0.5'), 'previsto', '100.01', 'valor', '0.00', 'acumulado', '50.00', 'saldo', '50.01', 'pct', '0.499950'),
      '02.01_7', jsonb_build_object('qtds', '{}'::jsonb, 'previsto', '1.00', 'valor', '0.00', 'acumulado', '0.00', 'saldo', '1.00', 'pct', '0.000000'),
      'total', jsonb_build_object('previsto', '123.02', 'valor', '10.51', 'acumulado', '61.01', 'saldo', '62.01', 'pct', '0.495936'),
      'medicoes', jsonb_build_array('50.51', '10.51'))));

  -- 3b. Até a 1ª: o centavo (grupos 0,50 + 50,00 = 50,50; total 50,51)
  v_b2 := public.fn_mc_boletim(v_k, 1);
  r := r || jsonb_build_object('3b_boletim_ate_1a', public.fn_mc_prova_confere(jsonb_build_object(
      'ate', v_b2 -> 'ate', '01.01', public.fn_mc_prova_linha(v_b2, 2),
      'grupo_01', public.fn_mc_prova_linha(v_b2, 1) - 'qtds' - 'pct', 'grupo_02', public.fn_mc_prova_linha(v_b2, 5) - 'qtds' - 'pct',
      'total', public.fn_mc_prova_total(v_b2) - 'pct'),
    jsonb_build_object('ate', 1,
      '01.01', jsonb_build_object('qtds', jsonb_build_object('1', '1.5'), 'previsto', '1.01', 'valor', '0.50', 'acumulado', '0.50', 'saldo', '0.51', 'pct', '0.495050'),
      'grupo_01', jsonb_build_object('previsto', '22.02', 'valor', '0.50', 'acumulado', '0.50', 'saldo', '21.52'),
      'grupo_02', jsonb_build_object('previsto', '101.01', 'valor', '50.00', 'acumulado', '50.00', 'saldo', '51.01'),
      'total', jsonb_build_object('previsto', '123.02', 'valor', '50.51', 'acumulado', '50.51', 'saldo', '72.51'))));

  -- 3c. Regra nula: toda chave de dinheiro e % nula, qtds iguais às de 3a
  reset role;
  update public.mc_contratos set regra_arredondamento = null where id = v_k;
  set local role authenticated;
  v_b2 := public.fn_mc_boletim(v_k);
  r := r || jsonb_build_object('3c_regra_nula', public.fn_mc_prova_confere(jsonb_build_object(
      'dinheiro_nao_nulo_linhas', (select count(*) from jsonb_array_elements(v_b2 -> 'linhas') l,
          unnest(array['previsto', 'valor_medicao', 'acumulado', 'saldo', 'pct_executado', 'pct_a_medir']) k where l ->> k is not null),
      'dinheiro_nao_nulo_total', (select count(*) from jsonb_each(v_b2 -> 'total') e where e.value <> 'null'::jsonb),
      'dinheiro_nao_nulo_medicoes', (select count(*) from jsonb_array_elements(v_b2 -> 'medicoes') m where m ->> 'valor' is not null),
      'qtds_iguais', (select jsonb_agg(l -> 'qtds' order by (l ->> 'ordem')::int) from jsonb_array_elements(v_b2 -> 'linhas') l)
                   = (select jsonb_agg(l -> 'qtds' order by (l ->> 'ordem')::int) from jsonb_array_elements(v_b -> 'linhas') l),
      'linhas', jsonb_array_length(v_b2 -> 'linhas')),
    jsonb_build_object('dinheiro_nao_nulo_linhas', 0, 'dinheiro_nao_nulo_total', 0, 'dinheiro_nao_nulo_medicoes', 0,
      'qtds_iguais', true, 'linhas', 7)));
  reset role;
  update public.mc_contratos set regra_arredondamento = 'sem_arredondar' where id = v_k;
  set local role authenticated;

  -- 3d. Fora da versão (K3): 01.02 saiu no aditivo e continua no acumulado do total
  v_b2 := public.fn_mc_boletim(v_k3);
  r := r || jsonb_build_object('3d_fora_da_versao', public.fn_mc_prova_confere(jsonb_build_object(
      'versao', v_b2 #> '{versao,numero}', 'linhas', (select jsonb_agg(l ->> 'codigo' order by (l ->> 'ordem')::int) from jsonb_array_elements(v_b2 -> 'linhas') l),
      '01.01', public.fn_mc_prova_linha(v_b2, 2) - 'pct',
      'fora', (select jsonb_agg(f - 'item_id' - 'descricao' - 'unidade') from jsonb_array_elements(v_b2 -> 'fora_da_versao') f),
      'total', public.fn_mc_prova_total(v_b2) - 'pct'),
    jsonb_build_object('versao', 1, 'linhas', jsonb_build_array('01', '01.01'),
      '01.01', jsonb_build_object('qtds', '{}'::jsonb, 'previsto', '10.00', 'valor', '0.00', 'acumulado', '0.00', 'saldo', '10.00'),
      'fora', jsonb_build_array(jsonb_build_object('codigo', '01.02', 'qtds', jsonb_build_object('1', '0.5'), 'valor_medicao', '2.50', 'acumulado', '2.50')),
      'total', jsonb_build_object('previsto', '10.00', 'valor', '2.50', 'acumulado', '2.50', 'saldo', '7.50'))));

  -- 3g. p_ate fora de 1..última: recusa citando a medição (não boletim vazio)
  begin perform public.fn_mc_boletim(v_k, 0);
    v_txt := 'PASSOU (errado)'; exception when others then v_txt := 'recusou: ' || sqlerrm; end;
  r := r || jsonb_build_object('3g1_ate_0', v_txt);
  begin perform public.fn_mc_boletim(v_k, 3);
    v_txt := 'PASSOU (errado)'; exception when others then v_txt := 'recusou: ' || sqlerrm; end;
  r := r || jsonb_build_object('3g2_ate_3', v_txt);
  begin perform public.fn_mc_boletim(v_l09, 11);
    v_txt := 'PASSOU (errado)'; exception when others then v_txt := 'recusou: ' || sqlerrm; end;
  r := r || jsonb_build_object('3g3_l09_ate_11', v_txt);
  begin perform public.fn_mc_boletim(v_kv, 1);
    v_txt := 'PASSOU (errado)'; exception when others then v_txt := 'recusou: ' || sqlerrm; end;
  r := r || jsonb_build_object('3g4_sem_medicao_ate_1', v_txt);

  -- 3h. Contrato sem medição: ate nulo, só o previsto
  v_b2 := public.fn_mc_boletim(v_kv);
  r := r || jsonb_build_object('3h_sem_medicao', public.fn_mc_prova_confere(jsonb_build_object(
      'ate', v_b2 -> 'ate', 'medicoes', v_b2 -> 'medicoes',
      '01', public.fn_mc_prova_linha(v_b2, 1), '01.01', public.fn_mc_prova_linha(v_b2, 2), 'total', public.fn_mc_prova_total(v_b2)),
    jsonb_build_object('ate', null, 'medicoes', '[]'::jsonb,
      '01', jsonb_build_object('qtds', '{}'::jsonb, 'previsto', '7.00', 'valor', '0.00', 'acumulado', '0.00', 'saldo', '7.00', 'pct', '0.000000'),
      '01.01', jsonb_build_object('qtds', '{}'::jsonb, 'previsto', '7.00', 'valor', '0.00', 'acumulado', '0.00', 'saldo', '7.00', 'pct', '0.000000'),
      'total', jsonb_build_object('previsto', '7.00', 'valor', '0.00', 'acumulado', '0.00', 'saldo', '7.00', 'pct', '0.000000'))));

  -- 3i. Painel filtrado privado: só K (K3 é municipal, KV estadual, o L09 federal)
  v_p := public.fn_mc_painel(null, array['privado']);
  r := r || jsonb_build_object('3i_painel_privado', public.fn_mc_prova_confere(jsonb_build_object(
      'contratos', (select jsonb_agg(jsonb_build_object('codigo', c ->> 'codigo', 'previsto', c ->> 'previsto', 'acumulado', c ->> 'acumulado',
          'saldo', c ->> 'saldo', 'pct', round((c ->> 'pct_executado')::numeric, 6)::text, 'medicoes', c -> 'medicoes',
          'versao', c -> 'versao_numero', 'corrente', jsonb_build_object('numero', c #> '{corrente,numero}', 'valor', c #>> '{corrente,valor}')))
        from jsonb_array_elements(v_p -> 'contratos') c),
      'total', jsonb_build_object('previsto', v_p #>> '{total,previsto}', 'acumulado', v_p #>> '{total,acumulado}',
          'saldo', v_p #>> '{total,saldo}', 'pct', round((v_p #>> '{total,pct_executado}')::numeric, 6)::text, 'corrente', v_p #>> '{total,corrente}')),
    jsonb_build_object(
      'contratos', jsonb_build_array(jsonb_build_object('codigo', 'PROVA-K', 'previsto', '123.02', 'acumulado', '61.01', 'saldo', '62.01',
          'pct', '0.495936', 'medicoes', 2, 'versao', 0, 'corrente', jsonb_build_object('numero', 2, 'valor', '10.51'))),
      'total', jsonb_build_object('previsto', '123.02', 'acumulado', '61.01', 'saldo', '62.01', 'pct', '0.495936', 'corrente', '10.51'))));
  -- 3i2. Painel sem filtro: os quatro da lista do Tiago, por código
  v_p := public.fn_mc_painel();
  r := r || jsonb_build_object('3i2_painel_sem_filtro', public.fn_mc_prova_confere(
    (select jsonb_agg(c ->> 'codigo' order by ord) from jsonb_array_elements(v_p -> 'contratos') with ordinality x(c, ord)),
    jsonb_build_array('L09-BR364', 'PROVA-K', 'PROVA-K3', 'PROVA-KV')));

  -- 3j. Lote 09 vivo, impersonando o Tiago
  v_t0 := clock_timestamp();
  v_b2 := public.fn_mc_boletim(v_l09);
  v_ms := round(extract(epoch from clock_timestamp() - v_t0) * 1000);
  v_p := public.fn_mc_painel(null, array['federal']);
  v_j := jsonb_build_object(
      'ate', v_b2 -> 'ate', 'linhas', jsonb_array_length(v_b2 -> 'linhas'),
      'preco_02_07_04', (select l ->> 'preco_unitario' from jsonb_array_elements(v_b2 -> 'linhas') l where l ->> 'codigo' = '02.07.04'),
      'total', public.fn_mc_prova_total(v_b2) - 'pct',
      'grupos', (select jsonb_object_agg(l ->> 'codigo', jsonb_build_array(l ->> 'previsto', l ->> 'acumulado', l ->> 'valor_medicao'))
                 from jsonb_array_elements(v_b2 -> 'linhas') l where l ->> 'pai_id' is null),
      'painel', (select jsonb_build_object('previsto', c ->> 'previsto', 'acumulado', c ->> 'acumulado', 'saldo', c ->> 'saldo',
                   'corrente', jsonb_build_object('numero', c #> '{corrente,numero}', 'valor', c #>> '{corrente,valor}'))
                 from jsonb_array_elements(v_p -> 'contratos') c));
  r := r || jsonb_build_object('3j_lote09', public.fn_mc_prova_confere(v_j,
    jsonb_build_object('ate', 10, 'linhas', 265, 'preco_02_07_04', '580.8643',
      'total', jsonb_build_object('previsto', '243927483.49', 'valor', '680738.27', 'acumulado', '36541661.77', 'saldo', '207385821.72'),
      'grupos', jsonb_build_object(
        '01', jsonb_build_array('761566.89', '117937.01', '0.00'),
        '02', jsonb_build_array('91142410.02', '18657438.30', '3312.02'),
        '03', jsonb_build_array('15650687.43', '139520.48', '0.00'),
        '04', jsonb_build_array('74015072.36', '15662616.12', '660861.19'),
        '05', jsonb_build_array('4104431.62', '0.00', '0.00'),
        '06', jsonb_build_array('50465073.89', '0.00', '0.00'),
        '07', jsonb_build_array('1704476.68', '1070413.54', '0.00'),
        '08', jsonb_build_array('6083764.60', '893736.31', '16565.06')),
      'painel', jsonb_build_object('previsto', '243927483.49', 'acumulado', '36541661.77', 'saldo', '207385821.72',
        'corrente', jsonb_build_object('numero', 10, 'valor', '680738.27')))));
  r := r || jsonb_build_object('3j_lote09_ms', v_ms);

  -- 3k. Controle: o mesmo total do Lote 09 contra um alvo desviado em R$ 0,01 tem de dar DIFERENTE
  r := r || jsonb_build_object('3k_controle', case when v_j #>> '{total,acumulado}' = '36541661.78'
    then 'IGUAL (errado)' else 'DIFERENTE (esperado)' end);
  reset role;

  -- 3e. v_zero tem medicao.boletim/ver, mas está fora da lista de K: recusa, não árvore vazia
  perform set_config('request.jwt.claims', json_build_object('sub', v_zero, 'role', 'authenticated')::text, true);
  set local role authenticated;
  begin perform public.fn_mc_boletim(v_k);
    v_txt := 'PASSOU (errado)'; exception when others then v_txt := 'recusou: ' || sqlerrm; end;
  r := r || jsonb_build_object('3e_fora_da_lista', v_txt);
  r := r || jsonb_build_object('3e2_painel_fora_da_lista', public.fn_mc_prova_confere(
    jsonb_build_object('contratos', jsonb_array_length(public.fn_mc_painel() -> 'contratos')), jsonb_build_object('contratos', 0)));
  reset role;

  -- 3f. Tiago sem medicao.boletim/ver e sem medicao.painel/ver: as duas recusam
  delete from public.usuario_permissoes where usuario_id = v_tiago and recurso in ('medicao.boletim', 'medicao.painel') and acao = 'ver';
  perform set_config('request.jwt.claims', json_build_object('sub', v_tiago, 'role', 'authenticated')::text, true);
  set local role authenticated;
  begin perform public.fn_mc_boletim(v_k);
    v_txt := 'PASSOU (errado)'; exception when others then v_txt := 'recusou: ' || sqlerrm; end;
  r := r || jsonb_build_object('3f1_sem_boletim_ver', v_txt);
  begin perform public.fn_mc_painel();
    v_txt := 'PASSOU (errado)'; exception when others then v_txt := 'recusou: ' || sqlerrm; end;
  r := r || jsonb_build_object('3f2_sem_painel_ver', v_txt);
  reset role;

  -- 3l. Nenhuma escrita: mc_* e obras, centros_custo, lancamentos com a mesma contagem de antes das RPCs
  r := r || jsonb_build_object('3l_nenhuma_escrita', public.fn_mc_prova_confere(public.fn_mc_prova_contagens(), v_cont0));

  raise exception 'PROVA %', r;
end $prova$;
do $aborto$ begin raise exception 'ABORTO GARANTIDO'; end $aborto$;
rollback;
