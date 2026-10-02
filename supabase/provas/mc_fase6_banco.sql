-- Prova da Fase 6a da Medição de Contratos (reajuste do DNIT registrado). Migration mc_fase6a_reajuste.
-- NÃO GRAVA: termina em raise exception com os resultados, e o bloco de aborto garante o rollback.
-- Rodar inteira pelo MCP execute_sql ou por `supabase db query --linked -f supabase/provas/mc_fase6_banco.sql`
-- (a CLI sai com erro e mostra o jsonb dentro da mensagem: é o esperado). Cada caso vira uma chave em r:
-- "OK" quando bate com o esperado, {"DIFERENTE": obtido, "esperado": ...} quando não bate; "ERRO: ..." é falha
-- inesperada de um bloco. O controle 6z tem de sair "DIFERENTE (esperado)".
--
-- As RPCs são chamadas como usuário (set local role authenticated + request.jwt.claims). O Tiago ainda não
-- tem medicao.reajuste ver/editar em produção (o backfill é a Task 2): a prova insere essas permissões dele
-- dentro da própria transação, com on conflict do nothing (continua verde depois do backfill). Os payloads
-- são montados como dono, antes do set local role.
--
-- Números esperados, feitos à mão.
--   6m antes de tudo: alertas reais só valor_contrato_diferente de L09 (243.927.498,02 x 243.927.483,49) e
--      L10 (121.590.621,00 x 121.573.053,78); hash de mc_v_medicao_itens L09 e494e5b27f249ca93e8b6fcb821604ee,
--      L10 55747138b02e631473d53a9f5b0eb3f2 (02/10/2026). 6m2 no fim: os mesmos hashes.
--   6f fn_mc_ratear: 1,00 em [1,1,1] = 0,34/0,33/0,33; -0,05 em [1,1] = -0,03/-0,02; 10,01 em [300,100] =
--      7,51/2,50; 5,00 em [0,0] = 5,00/0,00; 1,00 em [-5,5] = 0,00/1,00; -95.030,34 em [539028,266...] = -95.030,34.
--   6g L09: config (tem reajuste, data-base 2025-01, 12 meses) -> 8 alertas medicao_sem_reajuste (3ª a 10ª,
--      aniversário 2026-01-01). Prévia da 4ª real (34 linhas lidas do PDF): 0 pendências, total -40.021,28,
--      valor a PI 2.616.306,26, nossa 4ª 2.615.053,13; 4,0/60112 valor nosso 539.028,27; 2,2/51269 só no
--      02.07.05 (valor 0 na 4ª) com 1,26. Gravar: rateio -40.021,28 em 34 linhas; 02.07.07.02 = -1.082,16;
--      04.03.02 = -95.030,34; 02.07.05 = 1,26; 08.01 = 3.268,58; 34 de-para; 2 índices. Alertas sem reajuste
--      de L09: 7 (3ª, 5ª a 10ª); nenhum reajuste_provisorio de L09.
--   6h boletim L09 até a 4ª: reajuste na medição e acumulado -40.021,28; grupos 01 = 211,80; 02 = 5.062,81;
--      03 = 250,50; 04 = -48.781,32; 07 = -33,65; 08 = 3.268,58; 02.07.05 = 1,26; 4ª com reajuste -40.021,28
--      definitivo. Até a 10ª: na medição 0, acumulado -40.021,28, executado 36.541.661,77. Painel: L09
--      -40.021,28, L10 0, total -40.021,28.
--   6a K9 (00999/2026, item_por_medicao, v0: 01 título | 01.01 m³ 10 x 100 | 01.02 m³ 10 x 100 | 01.03 t 5 x 20
--      | 01.04 t 5 x 20): 1ª jan/2026 01.01 30 (300,00) e 01.02 10 (100,00), enviada; 2ª fev aberta: importar recusa.
--   6b prévia provisória da 1ª (1,0/111 reajuste 10,01 em 01.01+01.02; 1,0/222 -5,00 em 01.03+01.04, sem valor):
--      1 pendência; 111 = 7,51/2,50; valor nosso 400,00; nada gravado. Gravar recusa; com destino 01.04 grava
--      7,51/2,50/-5,00, sequência 1, provisório, evento "Relatório SIAC 1, índices provisórios: R$ 5,01", 4 de-para.
--   6c definitivo (12,00 e -4,00, total 8,00): anterior 5,01, diferença 2,99; view definitivo 8,00 / 5,01 /
--      2,99 / 2 relatórios; rateio 9,00/3,00/-4,00. Excluir sem motivo recusa; com motivo volta o provisório
--      (5,01, sem diferença); de novo recusa; como dono update, delete e update de linha recusam.
--   6d recusas na prévia (mensagens exatas). 6e usuário zero sem permissão e fora da lista.
--   6i O012 manual 1.234,56 provisório na 1ª (mar/2026) enviada. 6j anexos. 6k configuração. 6n fora.
--   6p (mc_fase6a2_reajuste_trava) faxina apaga o PDF do relatório excluído: arquivo_id nulo, resto igual;
--      qualquer outra mudança continua recusada.
--   6o grants. 6z controle: total da 4ª do L09 contra -40.021,27 = DIFERENTE (esperado).

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
-- Código de um item (última versão em que aparece).
create function public.fn_mc_prova_cod(p_item uuid) returns text language sql stable set search_path to '' as $$
  select i.codigo from public.mc_planilha_itens i join public.mc_planilha_versoes v on v.id = i.versao_id
  where i.item_id = p_item order by v.numero desc limit 1;
$$;
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
-- Arquivo + vínculo 'mc_reajuste' na medição (como dono), para a RPC aceitar o PDF.
create function public.fn_mc_prova_anexo(p_medicao uuid, p_nome text) returns uuid language plpgsql set search_path to '' as $$
declare v uuid;
begin
  insert into public.arquivos (path_storage, nome_original, tipo_mime, tamanho_bytes, hash_sha256)
  values ('prova/' || p_nome, p_nome, 'application/pdf', 1, md5(p_nome)) returning id into v;
  insert into public.anexo_vinculos (arquivo_id, entidade_tipo, entidade_id, origem) values (v, 'mc_reajuste', p_medicao, 'upload_direto');
  return v;
end $$;
-- p_relatorio a partir de linhas compactas [grupo, codigo, unidade, preco, valor_pi, fator, reajuste, código do nosso item]
-- e grupos [grupo, valor_pi, reajuste]; o item sai do código na versão vigente (fn_mc_prova_item). O 8º campo pode
-- ser uma lista de códigos (linha casada com mais de um item).
create function public.fn_mc_prova_siac(p_contrato uuid, p_cab jsonb, p_linhas jsonb, p_grupos jsonb) returns jsonb
language sql stable set search_path to '' as $$
  select p_cab || jsonb_build_object(
    'indices', coalesce(p_cab -> 'indices', '[]'::jsonb),
    'linhas', (select jsonb_agg(jsonb_build_object('grupo', e ->> 0, 'codigo', e ->> 1, 'descricao', 'SICRO ' || (e ->> 1),
                 'unidade', e ->> 2, 'preco_unitario', e ->> 3, 'valor_pi', e ->> 4, 'fator', e ->> 5, 'reajuste', e ->> 6,
                 'itens', case when e ->> 7 is null then '[]'::jsonb
                               when jsonb_typeof(e -> 7) = 'array' then
                                 (select jsonb_agg(public.fn_mc_prova_item(p_contrato, k.c) order by k.co)
                                    from jsonb_array_elements_text(e -> 7) with ordinality as k(c, co))
                               else jsonb_build_array(public.fn_mc_prova_item(p_contrato, e ->> 7)) end)
                 order by o) from jsonb_array_elements(p_linhas) with ordinality as t(e, o)),
    'grupos', (select jsonb_agg(jsonb_build_object('grupo', g ->> 0, 'valor_pi', g ->> 1, 'reajuste', g ->> 2)) from jsonb_array_elements(p_grupos) g));
$$;
grant execute on function public.fn_mc_prova_item(uuid, text) to authenticated;
grant execute on function public.fn_mc_prova_cod(uuid) to authenticated;
grant execute on function public.fn_mc_prova_confere(jsonb, jsonb) to authenticated;

do $prova$
declare
  v_tiago constant uuid := 'c66fca9f-5428-4fb9-855f-dcff548764df';
  v_zero constant uuid := 'f155865b-1d4b-4b25-bf3d-54d8de9176b0';
  v_l09 constant uuid := 'c4109738-9af7-4ddb-8982-3b2c79fe6e43';
  v_l10 constant uuid := 'e0e21c04-1128-4cc3-8d2e-5f8e27a8fad1';
  v_o12 constant uuid := '4df35cb4-0334-4376-b912-7add4c7d3d51';
  -- [grupo, código SICRO, unidade, preço, valor a PI líquido, fator, reajuste, nosso item]
  v_l09_linhas jsonb := '[
["1,0","55072","MES","21154.5250","4759.76","0.0445","211.80","01.01"],
["2,2","29083","T","3771.4474","320.57","-0.1487","-47.66","02.07.06.01"],
["2,2","51269","M²","0.4516","85.46","0.0148","1.26","02.07.05"],
["2,2","60112","T","5641.7149","6138.18","-0.1763","-1082.16","02.07.07.02"],
["2,2","86522","M³","14.4634","136.85","0.0148","2.02","02.07.01"],
["2,2","90224","M³","7.7817","1202.56","0.0073","8.77","02.07.02"],
["2,2","93793","M³","460.1313","7100.28","0.0073","51.83","02.07.09"],
["2,2","200134","T","2489.9519","211.64","0.0148","3.13","02.07.06.02"],
["2,2","201005","T","2496.5651","2716.26","0.0148","40.20","02.07.07.03"],
["2,2","290300","M³","212.3887","2954.53","0.0148","43.72","02.07.03"],
["2,2","322022","M²","0.3358","63.54","0.0148","0.94","02.07.06"],
["2,2","517556","T","338.2865","7669.29","0.0148","113.50","02.07.07"],
["2,2","517557","M³","580.8643","21984.55","0.0148","325.37","02.07.04"],
["2,2","517560","M³","465.5160","47137.21","0.0073","344.10","02.07.08"],
["2,2","6011205","L","44.3672","25.15","0.0148","0.37","02.07.07.01"],
["2,5","49299","T/KM","1.0190","2419.26","0.0445","107.65","02.10.02"],
["2,5","49401","T/KM","0.9958","170.04","0.0445","7.56","02.10.01"],
["2,5","517573","T/KM","0.7063","115555.33","0.0445","5142.21","02.10.03"],
["3,5","49321","H","23.1600","5928.96","0.0155","91.89","03.15.08"],
["3,5","91396","UN/DIA","4.6204","147.85","0.0155","2.29","03.15.03"],
["3,5","91826","UN/DIA","0.9032","289.02","0.0155","4.47","03.15.05"],
["3,5","517521","M²","510.2727","9797.23","0.0155","151.85","03.15.13"],
["4,0","29083","T","3771.4474","28278.31","-0.1487","-4204.98","04.04.01"],
["4,0","55025","M³","129.2675","107705.68","0.0445","4792.90","04.02"],
["4,0","60112","T","5641.7149","539026.36","-0.1763","-95030.34","04.03.02"],
["4,0","200134","T","2489.9519","18669.65","0.0148","276.31","04.04.02"],
["4,0","201005","T","2496.5651","238529.31","0.0148","3530.23","04.03.03"],
["4,0","322022","M²","0.3358","5595.77","0.0148","82.81","04.04"],
["4,0","517555","T","326.4402","648424.49","0.0148","9596.68","04.03"],
["4,0","6011205","L","44.3672","2119.46","0.0148","31.36","04.03.01"],
["4,1","49299","T/KM","1.0190","45666.57","0.0445","2032.16","04.05.01"],
["4,1","517573","T/KM","0.7063","676664.24","0.0445","30111.55","04.05.02"],
["7,0","52482","UND","659996.6468","3959.97","-0.0085","-33.65","07.02"],
["8,0","49408","%","6083764.60","64852.93","0.0504","3268.58","08.01"]
]';
  v_l09_grupos jsonb := '[["1,0","4759.76","211.80"],["2,2","97746.07","-194.61"],["2,5","118144.63","5257.42"],["3,3","0.00","0.00"],["3,5","16163.06","250.50"],["3,6","0.00","0.00"],["3,7","0.00","0.00"],["4,0","1588349.03","-80925.03"],["4,1","722330.81","32143.71"],["7,0","3959.97","-33.65"],["7,1","0.00","0.00"],["8,0","64852.93","3268.58"]]';
  v_l09_cab jsonb := '{"contrato_texto": "24 00615/2025 - CONSÓRCIO EMT-COLORADO I", "medicao_numero": "4", "medicao_tipo": "PROVISÓRIA",
    "situacao": "definitivo", "periodo_inicio": "2026-02-01", "periodo_fim": "2026-02-28", "data_base": "2025-01-01",
    "processado_em": "2026-03-19", "valor_pi": "2616306.26", "total": "-40021.28",
    "indices": [{"sigla": "CAPT", "i0": "1086.06", "i1": "894.632", "k": "-0.1763"}, {"sigla": "PAVIM", "i0": "584.512", "i1": "593.167", "k": "0.0148"}]}';
  v_k9_cab jsonb := '{"contrato_texto": "24 00999/2026 - CONSÓRCIO PROVA K9", "medicao_numero": "1", "medicao_tipo": "PROVISÓRIA",
    "periodo_inicio": "2026-01-01", "periodo_fim": "2026-01-31", "data_base": "2025-12-01", "processado_em": "2026-02-10",
    "valor_pi": "450.00", "indices": [{"sigla": "PAVIM", "i0": "100", "i1": "102.5", "k": "0.025"}]}';
  v_k9 uuid; v_i94 uuid; v_m91 uuid; v_m92 uuid; v_m4 uuid; v_mo1 uuid;
  v_arq_prov uuid; v_arq_def uuid; v_arq_outra uuid; v_arq_l09 uuid; v_rel1 uuid; v_rel2 uuid;
  v_p_prov jsonb; v_p_def jsonb; v_p_l09 jsonb; v_res jsonb; v_b4 jsonb; v_b10 jsonb; v_pn jsonb; v_bo jsonb;
  v_txt text; v_fora0 jsonb;
  r jsonb := '{}'::jsonb;
begin
  -- 6m. Antes de tudo: alertas reais e hashes da carga
  r := r || jsonb_build_object('6m1_alertas_reais', public.fn_mc_prova_confere(
    (select jsonb_agg(jsonb_build_array(a.codigo, a.tipo, a.valor::numeric, a.referencia::numeric) order by a.codigo, a.tipo)
       from public.mc_v_alertas a where a.codigo not like 'PROVA-%'),
    jsonb_build_array(
      jsonb_build_array('L09-BR364', 'valor_contrato_diferente', 243927498.02, 243927483.49),
      jsonb_build_array('L10-BR364', 'valor_contrato_diferente', 121590621.00, 121573053.78))));
  r := r || jsonb_build_object('6m1_hashes', public.fn_mc_prova_confere(
    jsonb_build_object('l09', public.fn_mc_prova_hash(v_l09), 'l10', public.fn_mc_prova_hash(v_l10)),
    jsonb_build_object('l09', 'e494e5b27f249ca93e8b6fcb821604ee', 'l10', '55747138b02e631473d53a9f5b0eb3f2')));

  -- Dados, montados como dono.
  insert into public.mc_contratos (codigo, nome_obra, objeto, numero_contrato, contratante_nome, contratante_tipo,
    valor_inicial, data_assinatura, prazo_meses, regra_arredondamento, tipo_localizacao, created_by)
  values ('PROVA-K9', 'Prova K9', 'Prova', '00999/2026', 'Contratante prova', 'privado', 2200, '2025-12-01', 12, 'item_por_medicao', 'texto', v_tiago)
  returning id into v_k9;
  insert into public.mc_contrato_usuarios (contrato_id, usuario_id) values (v_k9, v_tiago);
  perform public.fn_mc_prova_planilha(v_k9, 0, null, '2025-12-01', jsonb_build_array(
    jsonb_build_object('ordem', 1, 'codigo', '01', 'descricao', 'Grupo', 'tipo', 'titulo'),
    jsonb_build_object('ordem', 2, 'codigo', '01.01', 'pai', 1, 'descricao', 'Serviço 1', 'unidade', 'm³', 'tipo', 'servico', 'preco', '10', 'qtd', '100'),
    jsonb_build_object('ordem', 3, 'codigo', '01.02', 'pai', 1, 'descricao', 'Serviço 2', 'unidade', 'm³', 'tipo', 'servico', 'preco', '10', 'qtd', '100'),
    jsonb_build_object('ordem', 4, 'codigo', '01.03', 'pai', 1, 'descricao', 'Serviço 3', 'unidade', 't', 'tipo', 'servico', 'preco', '5', 'qtd', '20'),
    jsonb_build_object('ordem', 5, 'codigo', '01.04', 'pai', 1, 'descricao', 'Serviço 4', 'unidade', 't', 'tipo', 'servico', 'preco', '5', 'qtd', '20')));
  v_i94 := public.fn_mc_prova_item(v_k9, '01.04');
  v_m4 := (select id from public.mc_medicoes where contrato_id = v_l09 and numero = 4);

  -- Permissões da fase, só nesta transação.
  insert into public.usuario_permissoes (usuario_id, recurso, acao)
  values (v_tiago, 'medicao.reajuste', 'ver'), (v_tiago, 'medicao.reajuste', 'editar')
  on conflict do nothing;

  v_fora0 := public.fn_mc_prova_fora();
  perform set_config('request.jwt.claims', json_build_object('sub', v_tiago, 'role', 'authenticated')::text, true);

  -- 6f. fn_mc_ratear (como dono)
  begin
    r := r || jsonb_build_object('6f_ratear', public.fn_mc_prova_confere(jsonb_build_object(
        'a', (select jsonb_agg(x.valor order by x.ord) from public.fn_mc_ratear(1.00, array[gen_random_uuid(), gen_random_uuid(), gen_random_uuid()], array[1, 1, 1]::numeric[]) x),
        'b', (select jsonb_agg(x.valor order by x.ord) from public.fn_mc_ratear(-0.05, array[gen_random_uuid(), gen_random_uuid()], array[1, 1]::numeric[]) x),
        'c', (select jsonb_agg(x.valor order by x.ord) from public.fn_mc_ratear(10.01, array[gen_random_uuid(), gen_random_uuid()], array[300, 100]::numeric[]) x),
        'd', (select jsonb_agg(x.valor order by x.ord) from public.fn_mc_ratear(5.00, array[gen_random_uuid(), gen_random_uuid()], array[0, 0]::numeric[]) x),
        'e', (select jsonb_agg(x.valor order by x.ord) from public.fn_mc_ratear(1.00, array[gen_random_uuid(), gen_random_uuid()], array[-5, 5]::numeric[]) x),
        'f', (select jsonb_agg(x.valor order by x.ord) from public.fn_mc_ratear(-95030.34, array[gen_random_uuid()], array[539028.266066112320575723]::numeric[]) x)),
      jsonb_build_object('a', '[0.34, 0.33, 0.33]'::jsonb, 'b', '[-0.03, -0.02]'::jsonb, 'c', '[7.51, 2.50]'::jsonb,
        'd', '[5.00, 0.00]'::jsonb, 'e', '[0.00, 1.00]'::jsonb, 'f', '[-95030.34]'::jsonb)));
  exception when others then r := r || jsonb_build_object('6f_ratear', 'ERRO: ' || sqlerrm);
  end;

  -- 6g. L09 real: configuração, prévia e gravação da 4ª
  begin
    v_arq_l09 := public.fn_mc_prova_anexo(v_m4, 'l09-4a-siac.pdf');
    v_p_l09 := public.fn_mc_prova_siac(v_l09, v_l09_cab || jsonb_build_object('arquivo_id', v_arq_l09), v_l09_linhas, v_l09_grupos);
    set local role authenticated;
    perform public.fn_mc_reajuste_config_salvar(v_l09, jsonb_build_object('tem_reajuste', true, 'data_base', '2025-01',
      'periodicidade_meses', '12', 'indice_descricao', 'Índices FGV/DNIT do setor rodoviário'));
    reset role;
    r := r || jsonb_build_object('6g1_sem_reajuste_8', public.fn_mc_prova_confere(jsonb_build_object(
        'numeros', (select jsonb_agg(a.valor::int order by a.valor::int) from public.mc_v_alertas a where a.contrato_id = v_l09 and a.tipo = 'medicao_sem_reajuste'),
        'referencia', (select jsonb_agg(distinct a.referencia) from public.mc_v_alertas a where a.contrato_id = v_l09 and a.tipo = 'medicao_sem_reajuste'),
        'gravidade', (select jsonb_agg(distinct a.gravidade) from public.mc_v_alertas a where a.contrato_id = v_l09 and a.tipo = 'medicao_sem_reajuste')),
      jsonb_build_object('numeros', '[3, 4, 5, 6, 7, 8, 9, 10]'::jsonb, 'referencia', '["2026-01-01"]'::jsonb, 'gravidade', '["media"]'::jsonb)));
    set local role authenticated;
    v_res := public.fn_mc_reajuste_importar(v_m4, v_p_l09, false);
    reset role;
    r := r || jsonb_build_object('6g2_previa_l09', public.fn_mc_prova_confere(jsonb_build_object(
        'linhas', jsonb_array_length(v_res -> 'linhas'), 'pendencias', v_res -> 'pendencias', 'total', v_res ->> 'total',
        'valor_pi', v_res ->> 'valor_pi', 'medicao_valor', (v_res ->> 'medicao_valor')::numeric,
        'nosso_60112', (select y ->> 'valor_nosso' from jsonb_array_elements(v_res -> 'linhas') y where y ->> 'grupo' = '4,0' and y ->> 'codigo' = '60112'),
        'rateio_51269', (select jsonb_agg(jsonb_build_array(public.fn_mc_prova_cod((z ->> 'item_id')::uuid), (z ->> 'valor_base')::numeric, (z ->> 'valor')::numeric))
                           from jsonb_array_elements(v_res -> 'linhas') y cross join jsonb_array_elements(y -> 'rateio') z
                          where y ->> 'grupo' = '2,2' and y ->> 'codigo' = '51269'),
        'gravados', (select count(*) from public.mc_reajuste_relatorios where contrato_id = v_l09)),
      jsonb_build_object('linhas', 34, 'pendencias', 0, 'total', '-40021.28', 'valor_pi', '2616306.26', 'medicao_valor', 2615053.13,
        'nosso_60112', '539028.27', 'rateio_51269', '[["02.07.05", 0, 1.26]]'::jsonb, 'gravados', 0)));
    set local role authenticated;
    v_res := public.fn_mc_reajuste_importar(v_m4, v_p_l09, true);
    reset role;
    r := r || jsonb_build_object('6g3_gravar_l09', public.fn_mc_prova_confere(jsonb_build_object(
        'sequencia', v_res -> 'sequencia',
        'soma', (select sum(valor) from public.mc_reajuste_rateio where relatorio_id = (v_res ->> 'relatorio_id')::uuid),
        'linhas_rateio', (select count(*) from public.mc_reajuste_rateio where relatorio_id = (v_res ->> 'relatorio_id')::uuid),
        'linhas', (select count(*) from public.mc_reajuste_linhas where relatorio_id = (v_res ->> 'relatorio_id')::uuid),
        'itens', (select jsonb_object_agg(public.fn_mc_prova_cod(ri.item_id), ri.valor) from public.mc_v_reajuste_itens ri
                   where ri.medicao_id = v_m4 and public.fn_mc_prova_cod(ri.item_id) in ('02.07.07.02', '04.03.02', '02.07.05', '08.01')),
        'de_para', (select count(*) from public.mc_reajuste_de_para where contrato_id = v_l09),
        'indices', (select count(*) from public.mc_reajuste_relatorio_indices where relatorio_id = (v_res ->> 'relatorio_id')::uuid),
        'view', (select jsonb_build_array(origem, situacao, total, anterior_id, relatorios) from public.mc_v_reajuste_medicao where medicao_id = v_m4),
        'evento', (select motivo from public.mc_medicao_eventos where medicao_id = v_m4 and evento = 'reajuste')),
      jsonb_build_object('sequencia', 1, 'soma', -40021.28, 'linhas_rateio', 34, 'linhas', 34,
        'itens', jsonb_build_object('02.07.07.02', -1082.16, '04.03.02', -95030.34, '02.07.05', 1.26, '08.01', 3268.58),
        'de_para', 34, 'indices', 2, 'view', jsonb_build_array('siac', 'definitivo', -40021.28, null, 1),
        'evento', 'Relatório SIAC 1, índices definitivos: R$ -40.021,28')));
    r := r || jsonb_build_object('6g4_alertas_depois', public.fn_mc_prova_confere(jsonb_build_object(
        'sem_reajuste', (select jsonb_agg(a.valor::int order by a.valor::int) from public.mc_v_alertas a where a.contrato_id = v_l09 and a.tipo = 'medicao_sem_reajuste'),
        'provisorio', (select count(*) from public.mc_v_alertas a where a.contrato_id = v_l09 and a.tipo = 'reajuste_provisorio')),
      jsonb_build_object('sem_reajuste', '[3, 5, 6, 7, 8, 9, 10]'::jsonb, 'provisorio', 0)));
  exception when others then r := r || jsonb_build_object('6g_l09', 'ERRO: ' || sqlerrm);
  end;

  -- 6h. Boletim e painel do L09 (como Tiago)
  begin
    set local role authenticated;
    v_b4 := public.fn_mc_boletim(v_l09, 4);
    v_b10 := public.fn_mc_boletim(v_l09, 10);
    v_pn := public.fn_mc_painel();
    reset role;
    r := r || jsonb_build_object('6h1_boletim_4a', public.fn_mc_prova_confere(jsonb_build_object(
        'total', jsonb_build_array((v_b4 -> 'total' ->> 'reajuste_medicao')::numeric, (v_b4 -> 'total' ->> 'reajuste_acumulado')::numeric),
        'linhas', (select jsonb_object_agg(x ->> 'codigo', jsonb_build_array((x ->> 'reajuste_medicao')::numeric, (x ->> 'reajuste_acumulado')::numeric))
                     from jsonb_array_elements(v_b4 -> 'linhas') x where x ->> 'codigo' in ('01', '02', '03', '04', '07', '08', '02.07.05')),
        'medicao_4', jsonb_build_array((v_b4 -> 'medicoes' -> 3 ->> 'numero')::int, (v_b4 -> 'medicoes' -> 3 ->> 'reajuste')::numeric,
                                       v_b4 -> 'medicoes' -> 3 ->> 'reajuste_situacao')),
      jsonb_build_object('total', '[-40021.28, -40021.28]'::jsonb,
        'linhas', jsonb_build_object('01', '[211.80, 211.80]'::jsonb, '02', '[5062.81, 5062.81]'::jsonb, '03', '[250.50, 250.50]'::jsonb,
          '04', '[-48781.32, -48781.32]'::jsonb, '07', '[-33.65, -33.65]'::jsonb, '08', '[3268.58, 3268.58]'::jsonb, '02.07.05', '[1.26, 1.26]'::jsonb),
        'medicao_4', jsonb_build_array(4, -40021.28, 'definitivo'))));
    r := r || jsonb_build_object('6h2_boletim_10a', public.fn_mc_prova_confere(jsonb_build_object(
        'reajuste_medicao', (v_b10 -> 'total' ->> 'reajuste_medicao')::numeric, 'reajuste_acumulado', (v_b10 -> 'total' ->> 'reajuste_acumulado')::numeric,
        'acumulado', (v_b10 -> 'total' ->> 'acumulado')::numeric,
        'linhas_sem_chave', (select count(*) from jsonb_array_elements(v_b10 -> 'linhas') x where not (x ? 'reajuste_medicao' and x ? 'reajuste_acumulado'))),
      jsonb_build_object('reajuste_medicao', 0, 'reajuste_acumulado', -40021.28, 'acumulado', 36541661.77, 'linhas_sem_chave', 0)));
    r := r || jsonb_build_object('6h3_painel', public.fn_mc_prova_confere(jsonb_build_object(
        'l09', (select (x ->> 'reajuste_acumulado')::numeric from jsonb_array_elements(v_pn -> 'contratos') x where x ->> 'codigo' = 'L09-BR364'),
        'l10', (select (x ->> 'reajuste_acumulado')::numeric from jsonb_array_elements(v_pn -> 'contratos') x where x ->> 'codigo' = 'L10-BR364'),
        'total', (v_pn -> 'total' ->> 'reajuste_acumulado')::numeric),
      jsonb_build_object('l09', -40021.28, 'l10', 0, 'total', -40021.28)));
  exception when others then r := r || jsonb_build_object('6h_boletim_painel', 'ERRO: ' || sqlerrm);
  end;

  -- 6a. K9: 1ª enviada (01.01 30, 01.02 10); 2ª aberta: importar recusa
  begin
    set local role authenticated;
    v_m91 := public.fn_mc_medicao_abrir(v_k9, '2026-01-01', '2026-01-31');
    perform public.fn_mc_lancamento_salvar(v_k9, jsonb_build_object('item_id', public.fn_mc_prova_item(v_k9, '01.01'), 'data', '2026-01-10', 'quantidade', '30'));
    perform public.fn_mc_lancamento_salvar(v_k9, jsonb_build_object('item_id', public.fn_mc_prova_item(v_k9, '01.02'), 'data', '2026-01-12', 'quantidade', '10'));
    perform public.fn_mc_medicao_fechar(v_m91);
    perform public.fn_mc_medicao_enviar(v_m91);
    v_m92 := public.fn_mc_medicao_abrir(v_k9, '2026-02-01', '2026-02-28');
    reset role;
    v_arq_prov := public.fn_mc_prova_anexo(v_m91, 'k9-prov.pdf');
    v_arq_def := public.fn_mc_prova_anexo(v_m91, 'k9-def.pdf');
    v_arq_outra := public.fn_mc_prova_anexo(v_m92, 'k9-outra.pdf');
    v_p_prov := public.fn_mc_prova_siac(v_k9, v_k9_cab || jsonb_build_object('situacao', 'provisorio', 'total', '5.01', 'arquivo_id', v_arq_prov),
      '[["1,0","111","M³","10.0000","400.00","0.0250","10.01",["01.01","01.02"]],["1,0","222","T","5.0000","50.00","-0.1000","-5.00",["01.03","01.04"]]]',
      '[["1,0","450.00","5.01"]]');
    v_p_def := jsonb_set(public.fn_mc_prova_siac(v_k9, v_k9_cab || jsonb_build_object('situacao', 'definitivo', 'total', '8.00', 'arquivo_id', v_arq_def),
      '[["1,0","111","M³","10.0000","400.00","0.0300","12.00",["01.01","01.02"]],["1,0","222","T","5.0000","50.00","-0.0800","-4.00",["01.03","01.04"]]]',
      '[["1,0","450.00","8.00"]]'), '{linhas,1,destino}', to_jsonb(v_i94));
    r := r || jsonb_build_object('6a1_k9_1a', public.fn_mc_prova_confere(jsonb_build_object(
        'status', (select jsonb_agg(jsonb_build_array(numero, status) order by numero) from public.mc_medicoes where contrato_id = v_k9),
        'valor', (select valor from public.mc_v_medicao_totais where medicao_id = v_m91)),
      jsonb_build_object('status', '[[1, "enviada"], [2, "aberta"]]'::jsonb, 'valor', 400)));
    set local role authenticated;
    begin perform public.fn_mc_reajuste_importar(v_m92, v_p_prov || '{"medicao_numero": "2"}'::jsonb, false);
      v_txt := 'PASSOU (errado)'; exception when others then v_txt := 'recusou: ' || sqlerrm; end;
    reset role;
    r := r || jsonb_build_object('6a2_importar_aberta', public.fn_mc_prova_confere(to_jsonb(v_txt),
      to_jsonb('recusou: A 2ª medição está aberta: o reajuste entra só em medição enviada ou aprovada'::text)));
  exception when others then r := r || jsonb_build_object('6a_k9', 'ERRO: ' || sqlerrm);
  end;

  -- 6b. Prévia provisória da 1ª; gravar com pendência recusa; com destino 01.04 grava
  begin
    set local role authenticated;
    v_res := public.fn_mc_reajuste_importar(v_m91, v_p_prov, false);
    reset role;
    r := r || jsonb_build_object('6b1_previa', public.fn_mc_prova_confere(jsonb_build_object(
        'pendencias', v_res -> 'pendencias',
        'rateio_111', (select jsonb_agg((z ->> 'valor')::numeric order by o) from jsonb_array_elements(v_res -> 'linhas' -> 0 -> 'rateio') with ordinality as t(z, o)),
        'valor_nosso', v_res -> 'linhas' -> 0 ->> 'valor_nosso',
        'pendencia_222', v_res -> 'linhas' -> 1 ->> 'pendencia',
        'anterior', v_res -> 'anterior', 'medicao_valor', (v_res ->> 'medicao_valor')::numeric,
        'gravados', (select count(*) from public.mc_reajuste_relatorios where contrato_id = v_k9)),
      jsonb_build_object('pendencias', 1, 'rateio_111', '[7.51, 2.50]'::jsonb, 'valor_nosso', '400.00',
        'pendencia_222', 'Os itens casados não têm valor nesta medição: escolha o item que recebe a linha',
        'anterior', 'null'::jsonb, 'medicao_valor', 400, 'gravados', 0)));
    set local role authenticated;
    begin perform public.fn_mc_reajuste_importar(v_m91, v_p_prov, true);
      v_txt := 'PASSOU (errado)'; exception when others then v_txt := 'recusou: ' || sqlerrm; end;
    r := r || jsonb_build_object('6b2_gravar_com_pendencia', public.fn_mc_prova_confere(to_jsonb(v_txt),
      to_jsonb('recusou: Escolha os itens que recebem o reajuste das linhas: 1,0 222'::text)));
    v_res := public.fn_mc_reajuste_importar(v_m91, jsonb_set(v_p_prov, '{linhas,1,destino}', to_jsonb(v_i94)), true);
    reset role;
    v_rel1 := (v_res ->> 'relatorio_id')::uuid;
    r := r || jsonb_build_object('6b3_gravar', public.fn_mc_prova_confere(jsonb_build_object(
        'rel', (select jsonb_build_array(sequencia, origem, situacao, total, valor_pi, arquivo_id = v_arq_prov, arquivo_hash = md5('k9-prov.pdf'))
                  from public.mc_reajuste_relatorios where id = v_rel1),
        'rateio', (select jsonb_agg(jsonb_build_array(public.fn_mc_prova_cod(item_id), valor) order by public.fn_mc_prova_cod(item_id))
                     from public.mc_reajuste_rateio where relatorio_id = v_rel1),
        'evento', (select jsonb_agg(motivo) from public.mc_medicao_eventos where medicao_id = v_m91 and evento = 'reajuste'),
        'de_para', (select jsonb_agg(jsonb_build_array(grupo, codigo, public.fn_mc_prova_cod(item_id)) order by codigo, public.fn_mc_prova_cod(item_id))
                      from public.mc_reajuste_de_para where contrato_id = v_k9),
        'view', (select jsonb_build_array(origem, situacao, total, anterior_total, diferenca, relatorios) from public.mc_v_reajuste_medicao where medicao_id = v_m91)),
      jsonb_build_object('rel', jsonb_build_array(1, 'siac', 'provisorio', 5.01, 450.00, true, true),
        'rateio', '[["01.01", 7.51], ["01.02", 2.50], ["01.04", -5.00]]'::jsonb,
        'evento', '["Relatório SIAC 1, índices provisórios: R$ 5,01"]'::jsonb,
        'de_para', '[["1,0", "111", "01.01"], ["1,0", "111", "01.02"], ["1,0", "222", "01.03"], ["1,0", "222", "01.04"]]'::jsonb,
        'view', jsonb_build_array('siac', 'provisorio', 5.01, null, null, 1))));
  exception when others then r := r || jsonb_build_object('6b_provisorio', 'ERRO: ' || sqlerrm);
  end;

  -- 6c. Definitivo: diferença 2,99; excluir volta o provisório; travas
  begin
    set local role authenticated;
    v_res := public.fn_mc_reajuste_importar(v_m91, v_p_def, true);
    reset role;
    v_rel2 := (v_res ->> 'relatorio_id')::uuid;
    r := r || jsonb_build_object('6c1_definitivo', public.fn_mc_prova_confere(jsonb_build_object(
        'retorno', jsonb_build_array(v_res -> 'sequencia', v_res -> 'anterior' ->> 'total', v_res -> 'anterior' ->> 'situacao', v_res ->> 'diferenca'),
        'view', (select jsonb_build_array(situacao, total, anterior_id = v_rel1, anterior_total, diferenca, relatorios) from public.mc_v_reajuste_medicao where medicao_id = v_m91),
        'itens', (select jsonb_agg(jsonb_build_array(public.fn_mc_prova_cod(item_id), valor) order by public.fn_mc_prova_cod(item_id))
                    from public.mc_v_reajuste_itens where medicao_id = v_m91),
        'de_para', (select count(*) from public.mc_reajuste_de_para where contrato_id = v_k9)),
      jsonb_build_object('retorno', '[2, "5.01", "provisorio", "2.99"]'::jsonb,
        'view', jsonb_build_array('definitivo', 8.00, true, 5.01, 2.99, 2),
        'itens', '[["01.01", 9.00], ["01.02", 3.00], ["01.04", -4.00]]'::jsonb, 'de_para', 4)));
    set local role authenticated;
    begin perform public.fn_mc_reajuste_excluir(v_rel2, '  ');
      v_txt := 'PASSOU (errado)'; exception when others then v_txt := 'recusou: ' || sqlerrm; end;
    r := r || jsonb_build_object('6c2_excluir_sem_motivo', public.fn_mc_prova_confere(to_jsonb(v_txt),
      to_jsonb('recusou: Informe o motivo da exclusão'::text)));
    perform public.fn_mc_reajuste_excluir(v_rel2, 'definitivo lançado errado');
    begin perform public.fn_mc_reajuste_excluir(v_rel2, 'de novo');
      v_txt := 'PASSOU (errado)'; exception when others then v_txt := 'recusou: ' || sqlerrm; end;
    reset role;
    r := r || jsonb_build_object('6c3_excluido', public.fn_mc_prova_confere(jsonb_build_object(
        'view', (select jsonb_build_array(relatorio_id = v_rel1, situacao, total, anterior_id, diferenca, relatorios) from public.mc_v_reajuste_medicao where medicao_id = v_m91),
        'itens', (select jsonb_agg(jsonb_build_array(public.fn_mc_prova_cod(item_id), valor) order by public.fn_mc_prova_cod(item_id))
                    from public.mc_v_reajuste_itens where medicao_id = v_m91),
        'rel2', (select jsonb_build_array(excluido_em is not null, excluido_por = v_tiago, motivo_exclusao) from public.mc_reajuste_relatorios where id = v_rel2),
        'evento', (select motivo from public.mc_medicao_eventos where medicao_id = v_m91 and evento = 'reajuste_excluido'),
        'de_novo', v_txt),
      jsonb_build_object('view', jsonb_build_array(true, 'provisorio', 5.01, null, null, 1),
        'itens', '[["01.01", 7.51], ["01.02", 2.50], ["01.04", -5.00]]'::jsonb,
        'rel2', jsonb_build_array(true, true, 'definitivo lançado errado'),
        'evento', 'Relatório 2 (R$ 8,00) excluído: definitivo lançado errado',
        'de_novo', 'recusou: O relatório de reajuste 2 já foi excluído')));
    begin update public.mc_reajuste_relatorios set total = 6 where id = v_rel1;
      v_txt := 'PASSOU (errado)'; exception when others then v_txt := 'recusou: ' || sqlerrm; end;
    r := r || jsonb_build_object('6c4_trava_update', public.fn_mc_prova_confere(to_jsonb(v_txt),
      to_jsonb('recusou: O relatório de reajuste é imutável. Para corrigir, importe de novo; para tirar, exclua com motivo'::text)));
    begin delete from public.mc_reajuste_relatorios where id = v_rel1;
      v_txt := 'PASSOU (errado)'; exception when others then v_txt := 'recusou: ' || sqlerrm; end;
    r := r || jsonb_build_object('6c5_trava_delete', public.fn_mc_prova_confere(to_jsonb(v_txt),
      to_jsonb('recusou: Relatório de reajuste não se apaga: exclua com motivo'::text)));
    begin update public.mc_reajuste_linhas set reajuste = 1 where relatorio_id = v_rel1 and ordem = 1;
      v_txt := 'PASSOU (errado)'; exception when others then v_txt := 'recusou: ' || sqlerrm; end;
    r := r || jsonb_build_object('6c6_trava_linha', public.fn_mc_prova_confere(to_jsonb(v_txt),
      to_jsonb('recusou: Linhas, índices e rateio de um relatório de reajuste não mudam depois de gravados'::text)));
    begin update public.mc_reajuste_relatorios set excluido_em = now(), motivo_exclusao = 'outro' where id = v_rel2;
      v_txt := 'PASSOU (errado)'; exception when others then v_txt := 'recusou: ' || sqlerrm; end;
    r := r || jsonb_build_object('6c7_trava_excluido', public.fn_mc_prova_confere(to_jsonb(v_txt),
      to_jsonb('recusou: O relatório de reajuste 2 já foi excluído'::text)));
  exception when others then r := r || jsonb_build_object('6c_definitivo', 'ERRO: ' || sqlerrm);
  end;

  -- 6d. Recusas na prévia da 1ª (mensagens exatas)
  begin
    set local role authenticated;
    begin perform public.fn_mc_reajuste_importar(v_m91, v_p_def || '{"contrato_texto": "24 00184/2026 - CONSÓRCIO"}'::jsonb, false);
      v_txt := 'PASSOU (errado)'; exception when others then v_txt := 'recusou: ' || sqlerrm; end;
    r := r || jsonb_build_object('6d1_contrato', public.fn_mc_prova_confere(to_jsonb(v_txt),
      to_jsonb('recusou: O relatório é do contrato "24 00184/2026 - CONSÓRCIO", não do PROVA-K9 (contrato 00999/2026)'::text)));
    begin perform public.fn_mc_reajuste_importar(v_m91, v_p_def || '{"medicao_numero": "2"}'::jsonb, false);
      v_txt := 'PASSOU (errado)'; exception when others then v_txt := 'recusou: ' || sqlerrm; end;
    r := r || jsonb_build_object('6d2_medicao', public.fn_mc_prova_confere(to_jsonb(v_txt),
      to_jsonb('recusou: O relatório é da 2ª medição, não da 1ª'::text)));
    begin perform public.fn_mc_reajuste_importar(v_m91, v_p_def || '{"grupos": [{"grupo": "1,0", "valor_pi": "450.00", "reajuste": "8.01"}]}'::jsonb, false);
      v_txt := 'PASSOU (errado)'; exception when others then v_txt := 'recusou: ' || sqlerrm; end;
    r := r || jsonb_build_object('6d3_subtotal', public.fn_mc_prova_confere(to_jsonb(v_txt),
      to_jsonb('recusou: As linhas não somam o SUBTOTAL do grupo: 1,0 (valor a PI 450,00 e SUBTOTAL 450,00; reajuste 8,00 e SUBTOTAL 8,01)'::text)));
    begin perform public.fn_mc_reajuste_importar(v_m91, v_p_def || '{"total": "8.02"}'::jsonb, false);
      v_txt := 'PASSOU (errado)'; exception when others then v_txt := 'recusou: ' || sqlerrm; end;
    r := r || jsonb_build_object('6d4_soma', public.fn_mc_prova_confere(to_jsonb(v_txt),
      to_jsonb('recusou: Os SUBTOTAIS não somam a SOMA do relatório: reajuste 8,00 e SOMA 8,02'::text)));
    begin perform public.fn_mc_reajuste_importar(v_m91, jsonb_set(v_p_def, '{linhas,1,valor_pi}', '"0.00"'), false);
      v_txt := 'PASSOU (errado)'; exception when others then v_txt := 'recusou: ' || sqlerrm; end;
    r := r || jsonb_build_object('6d5_valor_pi_zero', public.fn_mc_prova_confere(to_jsonb(v_txt),
      to_jsonb('recusou: Linha 2 (1,0 222): linha com valor a PI zero não entra no import'::text)));
    begin perform public.fn_mc_reajuste_importar(v_m91, jsonb_set(v_p_def, '{linhas,0,reajuste}', '"abc"'), false);
      v_txt := 'PASSOU (errado)'; exception when others then v_txt := 'recusou: ' || sqlerrm; end;
    r := r || jsonb_build_object('6d6_reajuste_abc', public.fn_mc_prova_confere(to_jsonb(v_txt),
      to_jsonb('recusou: Linha 1 (1,0 111): reajuste inválido: abc'::text)));
    begin perform public.fn_mc_reajuste_importar(v_m91, jsonb_set(v_p_def, '{linhas,0,itens}', jsonb_build_array(public.fn_mc_prova_item(v_l09, '01.01'))), false);
      v_txt := 'PASSOU (errado)'; exception when others then v_txt := 'recusou: ' || sqlerrm; end;
    r := r || jsonb_build_object('6d7_item_de_outro_contrato', public.fn_mc_prova_confere(to_jsonb(v_txt),
      to_jsonb('recusou: Linha 1 (1,0 111): item casado que não é serviço deste contrato'::text)));
    begin perform public.fn_mc_reajuste_importar(v_m91, jsonb_set(v_p_def, '{linhas,1,destino}', to_jsonb(public.fn_mc_prova_item(v_k9, '01.01'))), false);
      v_txt := 'PASSOU (errado)'; exception when others then v_txt := 'recusou: ' || sqlerrm; end;
    r := r || jsonb_build_object('6d8_destino_fora', public.fn_mc_prova_confere(to_jsonb(v_txt),
      to_jsonb('recusou: Linha 2 (1,0 222): o item que recebe a linha tem de estar entre os casados'::text)));
    begin perform public.fn_mc_reajuste_importar(v_m91, v_p_def || jsonb_build_object('arquivo_id', v_arq_outra), true);
      v_txt := 'PASSOU (errado)'; exception when others then v_txt := 'recusou: ' || sqlerrm; end;
    r := r || jsonb_build_object('6d9_pdf_de_outra_medicao', public.fn_mc_prova_confere(to_jsonb(v_txt),
      to_jsonb('recusou: Anexe o PDF do relatório SIAC nesta medição antes de gravar'::text)));
    reset role;
    r := r || jsonb_build_object('6d10_nada_gravado', public.fn_mc_prova_confere(
      (select to_jsonb(count(*)) from public.mc_reajuste_relatorios where contrato_id = v_k9), to_jsonb(2)));
  exception when others then r := r || jsonb_build_object('6d_recusas', 'ERRO: ' || sqlerrm);
  end;

  -- 6e. Usuário zero: sem medicao.reajuste/editar; depois com editar e fora da lista de K9
  begin
    perform set_config('request.jwt.claims', json_build_object('sub', v_zero, 'role', 'authenticated')::text, true);
    set local role authenticated;
    begin perform public.fn_mc_reajuste_importar(v_m91, v_p_prov, false);
      v_txt := 'PASSOU (errado)'; exception when others then v_txt := 'recusou: ' || sqlerrm; end;
    r := r || jsonb_build_object('6e1_importar', public.fn_mc_prova_confere(to_jsonb(v_txt), to_jsonb('recusou: Sem permissão para importar reajuste'::text)));
    begin perform public.fn_mc_reajuste_manual(v_m91, '{"total": "1.00", "situacao": "provisorio"}'::jsonb);
      v_txt := 'PASSOU (errado)'; exception when others then v_txt := 'recusou: ' || sqlerrm; end;
    r := r || jsonb_build_object('6e2_manual', public.fn_mc_prova_confere(to_jsonb(v_txt), to_jsonb('recusou: Sem permissão para lançar reajuste'::text)));
    begin perform public.fn_mc_reajuste_excluir(v_rel1, 'motivo qualquer');
      v_txt := 'PASSOU (errado)'; exception when others then v_txt := 'recusou: ' || sqlerrm; end;
    r := r || jsonb_build_object('6e3_excluir', public.fn_mc_prova_confere(to_jsonb(v_txt), to_jsonb('recusou: Sem permissão para excluir reajuste'::text)));
    reset role;
    insert into public.usuario_permissoes (usuario_id, recurso, acao) values (v_zero, 'medicao.reajuste', 'editar') on conflict do nothing;
    set local role authenticated;
    begin perform public.fn_mc_reajuste_importar(v_m91, v_p_prov, false);
      v_txt := 'PASSOU (errado)'; exception when others then v_txt := 'recusou: ' || sqlerrm; end;
    r := r || jsonb_build_object('6e4_importar_fora_da_lista', public.fn_mc_prova_confere(to_jsonb(v_txt), to_jsonb('recusou: Contrato não encontrado'::text)));
    begin perform public.fn_mc_reajuste_manual(v_m91, '{"total": "1.00", "situacao": "provisorio"}'::jsonb);
      v_txt := 'PASSOU (errado)'; exception when others then v_txt := 'recusou: ' || sqlerrm; end;
    r := r || jsonb_build_object('6e5_manual_fora_da_lista', public.fn_mc_prova_confere(to_jsonb(v_txt), to_jsonb('recusou: Contrato não encontrado'::text)));
    begin perform public.fn_mc_reajuste_excluir(v_rel1, 'motivo qualquer');
      v_txt := 'PASSOU (errado)'; exception when others then v_txt := 'recusou: ' || sqlerrm; end;
    r := r || jsonb_build_object('6e6_excluir_fora_da_lista', public.fn_mc_prova_confere(to_jsonb(v_txt), to_jsonb('recusou: Contrato não encontrado'::text)));
    begin perform public.fn_mc_reajuste_config_salvar(v_k9, '{"tem_reajuste": false}'::jsonb);
      v_txt := 'PASSOU (errado)'; exception when others then v_txt := 'recusou: ' || sqlerrm; end;
    r := r || jsonb_build_object('6e7_config_fora_da_lista', public.fn_mc_prova_confere(to_jsonb(v_txt), to_jsonb('recusou: Contrato não encontrado'::text)));
    reset role;
    perform set_config('request.jwt.claims', json_build_object('sub', v_tiago, 'role', 'authenticated')::text, true);
  exception when others then r := r || jsonb_build_object('6e_usuario_zero', 'ERRO: ' || sqlerrm);
  end;

  -- 6i. O012: lançamento manual
  begin
    set local role authenticated;
    v_mo1 := public.fn_mc_medicao_abrir(v_o12, '2026-03-01', '2026-03-31');
    begin perform public.fn_mc_reajuste_manual(v_mo1, '{"total": "1234.56", "situacao": "provisorio"}'::jsonb);
      v_txt := 'PASSOU (errado)'; exception when others then v_txt := 'recusou: ' || sqlerrm; end;
    r := r || jsonb_build_object('6i1_manual_aberta', public.fn_mc_prova_confere(to_jsonb(v_txt),
      to_jsonb('recusou: A 1ª medição está aberta: o reajuste entra só em medição enviada ou aprovada'::text)));
    perform public.fn_mc_medicao_fechar(v_mo1);
    perform public.fn_mc_medicao_enviar(v_mo1);
    begin perform public.fn_mc_reajuste_manual(v_mo1, '{"total": "12.345", "situacao": "provisorio"}'::jsonb);
      v_txt := 'PASSOU (errado)'; exception when others then v_txt := 'recusou: ' || sqlerrm; end;
    r := r || jsonb_build_object('6i2_tres_casas', public.fn_mc_prova_confere(to_jsonb(v_txt),
      to_jsonb('recusou: Informe o total do reajuste com até 2 casas'::text)));
    perform public.fn_mc_reajuste_manual(v_mo1, '{"total": "1234.56", "situacao": "provisorio", "observacao": "INCC da Prefeitura, mar/2026"}'::jsonb);
    v_bo := public.fn_mc_boletim(v_o12, 1);
    reset role;
    r := r || jsonb_build_object('6i3_manual', public.fn_mc_prova_confere(jsonb_build_object(
        'view', (select jsonb_build_array(origem, situacao, total, relatorios) from public.mc_v_reajuste_medicao where medicao_id = v_mo1),
        'rel', (select jsonb_build_array(valor_pi, arquivo_id, observacao) from public.mc_reajuste_relatorios where medicao_id = v_mo1),
        'boletim_total', (v_bo -> 'total' ->> 'reajuste_medicao')::numeric,
        'boletim_linhas_zero', (select bool_and((x ->> 'reajuste_medicao')::numeric = 0 and (x ->> 'reajuste_acumulado')::numeric = 0) from jsonb_array_elements(v_bo -> 'linhas') x),
        'alerta', (select jsonb_agg(jsonb_build_array(gravidade, valor, referencia, data)) from public.mc_v_alertas where contrato_id = v_o12 and tipo = 'reajuste_provisorio'),
        'evento', (select motivo from public.mc_medicao_eventos where medicao_id = v_mo1 and evento = 'reajuste')),
      jsonb_build_object('view', jsonb_build_array('manual', 'provisorio', 1234.56, 1),
        'rel', jsonb_build_array(null, null, 'INCC da Prefeitura, mar/2026'),
        'boletim_total', 1234.56, 'boletim_linhas_zero', true,
        'alerta', '[["baixa", "1", "1234.56", "2026-03-01"]]'::jsonb,
        'evento', 'Lançamento manual 1, índices provisórios: R$ 1.234,56')));
  exception when others then r := r || jsonb_build_object('6i_o012', 'ERRO: ' || sqlerrm);
  end;

  -- 6j. Anexos: recurso, contrato da entidade, desvincular
  begin
    r := r || jsonb_build_object('6j1_entidade', public.fn_mc_prova_confere(jsonb_build_object(
        'recurso', public.fn_recurso_da_entidade('mc_reajuste'),
        'contrato', public.fn_mc_contrato_da_entidade('mc_reajuste', v_m4) = v_l09),
      jsonb_build_object('recurso', 'medicao.reajuste', 'contrato', true)));
    set local role authenticated;
    begin perform public.fn_desvincular_arquivo((select id from public.anexo_vinculos where arquivo_id = v_arq_l09 and entidade_tipo = 'mc_reajuste'));
      v_txt := 'PASSOU (errado)'; exception when others then v_txt := 'recusou: ' || sqlerrm; end;
    r := r || jsonb_build_object('6j2_pdf_em_uso', public.fn_mc_prova_confere(to_jsonb(v_txt),
      to_jsonb('recusou: O PDF é de um relatório de reajuste em uso. Exclua o relatório antes de tirar o anexo'::text)));
    perform public.fn_desvincular_arquivo((select id from public.anexo_vinculos where arquivo_id = v_arq_def and entidade_tipo = 'mc_reajuste'));
    reset role;
    r := r || jsonb_build_object('6j3_pdf_do_excluido_sai', public.fn_mc_prova_confere(jsonb_build_object(
        'def', (select count(*) from public.anexo_vinculos where arquivo_id = v_arq_def),
        'l09', (select count(*) from public.anexo_vinculos where arquivo_id = v_arq_l09),
        'prov', (select count(*) from public.anexo_vinculos where arquivo_id = v_arq_prov)),
      jsonb_build_object('def', 0, 'l09', 1, 'prov', 1)));
  exception when others then r := r || jsonb_build_object('6j_anexos', 'ERRO: ' || sqlerrm);
  end;

  -- 6p (mc_fase6a2_reajuste_trava). O PDF do definitivo excluído, já desvinculado no 6j3, é apagado pela
  --    faxina (fn_apagar_arquivo_orfao, sem carência): a FK põe arquivo_id nulo no relatório 2, que continua
  --    excluído e com o resto igual. Controles: no excluído, mudar outra coluna recusa ("já foi excluído");
  --    no que vale, mudar outra coluna ou trocar o arquivo por outro recusa (imutável).
  begin
    select to_jsonb(r2) - 'arquivo_id' into v_res from public.mc_reajuste_relatorios r2 where r2.id = v_rel2;
    v_txt := public.fn_apagar_arquivo_orfao(v_arq_def, -1)::text;
    r := r || jsonb_build_object('6p1_faxina_apaga_pdf', public.fn_mc_prova_confere(jsonb_build_object(
        'apagou', v_txt::boolean,
        'arquivo', (select count(*) from public.arquivos where id = v_arq_def),
        'rel2', (select jsonb_build_array(arquivo_id, excluido_em is not null, motivo_exclusao, arquivo_hash = md5('k9-def.pdf'))
                   from public.mc_reajuste_relatorios where id = v_rel2),
        'resto_igual', (select (to_jsonb(r2) - 'arquivo_id') = v_res from public.mc_reajuste_relatorios r2 where r2.id = v_rel2),
        'vale', (select jsonb_build_array(relatorio_id = v_rel1, total) from public.mc_v_reajuste_medicao where medicao_id = v_m91)),
      jsonb_build_object('apagou', true, 'arquivo', 0, 'rel2', jsonb_build_array(null, true, 'definitivo lançado errado', true),
        'resto_igual', true, 'vale', jsonb_build_array(true, 5.01))));
    begin update public.mc_reajuste_relatorios set observacao = 'outra' where id = v_rel2;
      v_txt := 'PASSOU (errado)'; exception when others then v_txt := 'recusou: ' || sqlerrm; end;
    r := r || jsonb_build_object('6p2_excluido_outra_coluna', public.fn_mc_prova_confere(to_jsonb(v_txt),
      to_jsonb('recusou: O relatório de reajuste 2 já foi excluído'::text)));
    begin update public.mc_reajuste_relatorios set arquivo_hash = 'outro' where id = v_rel1;
      v_txt := 'PASSOU (errado)'; exception when others then v_txt := 'recusou: ' || sqlerrm; end;
    r := r || jsonb_build_object('6p3_vale_outra_coluna', public.fn_mc_prova_confere(to_jsonb(v_txt),
      to_jsonb('recusou: O relatório de reajuste é imutável. Para corrigir, importe de novo; para tirar, exclua com motivo'::text)));
    begin update public.mc_reajuste_relatorios set arquivo_id = v_arq_outra where id = v_rel1;
      v_txt := 'PASSOU (errado)'; exception when others then v_txt := 'recusou: ' || sqlerrm; end;
    r := r || jsonb_build_object('6p4_trocar_arquivo', public.fn_mc_prova_confere(to_jsonb(v_txt),
      to_jsonb('recusou: O relatório de reajuste é imutável. Para corrigir, importe de novo; para tirar, exclua com motivo'::text)));
    begin update public.mc_reajuste_relatorios set arquivo_id = null, observacao = 'junto' where id = v_rel1;
      v_txt := 'PASSOU (errado)'; exception when others then v_txt := 'recusou: ' || sqlerrm; end;
    r := r || jsonb_build_object('6p5_nulo_com_outra_coluna', public.fn_mc_prova_confere(to_jsonb(v_txt),
      to_jsonb('recusou: O relatório de reajuste é imutável. Para corrigir, importe de novo; para tirar, exclua com motivo'::text)));
  exception when others then r := r || jsonb_build_object('6p_faxina', 'ERRO: ' || sqlerrm);
  end;

  -- 6k. Configuração: recusas e a do L09 lida de volta
  begin
    set local role authenticated;
    begin perform public.fn_mc_reajuste_config_salvar(v_l09, '{"tem_reajuste": true, "data_base": "2025-13"}'::jsonb);
      v_txt := 'PASSOU (errado)'; exception when others then v_txt := 'recusou: ' || sqlerrm; end;
    r := r || jsonb_build_object('6k1_data_invalida', public.fn_mc_prova_confere(to_jsonb(v_txt), to_jsonb('recusou: Data-base inválida: informe mês e ano'::text)));
    begin perform public.fn_mc_reajuste_config_salvar(v_l09, '{"tem_reajuste": true, "periodicidade_meses": "12"}'::jsonb);
      v_txt := 'PASSOU (errado)'; exception when others then v_txt := 'recusou: ' || sqlerrm; end;
    r := r || jsonb_build_object('6k2_sem_data', public.fn_mc_prova_confere(to_jsonb(v_txt), to_jsonb('recusou: Informe o mês da data-base do reajuste'::text)));
    begin perform public.fn_mc_reajuste_config_salvar(v_l09, '{"tem_reajuste": true, "data_base": "2025-01", "periodicidade_meses": "0"}'::jsonb);
      v_txt := 'PASSOU (errado)'; exception when others then v_txt := 'recusou: ' || sqlerrm; end;
    r := r || jsonb_build_object('6k3_periodicidade', public.fn_mc_prova_confere(to_jsonb(v_txt), to_jsonb('recusou: Periodicidade inválida: de 1 a 120 meses'::text)));
    reset role;
    r := r || jsonb_build_object('6k4_l09_lida', public.fn_mc_prova_confere(
      (select jsonb_build_array(tem_reajuste, data_base, periodicidade_meses, indice_descricao) from public.mc_reajuste_config where contrato_id = v_l09),
      jsonb_build_array(true, '2025-01-01', 12, 'Índices FGV/DNIT do setor rodoviário')));
  exception when others then r := r || jsonb_build_object('6k_config', 'ERRO: ' || sqlerrm);
  end;

  -- 6m2. A carga continua igual depois de tudo
  r := r || jsonb_build_object('6m2_hashes_no_fim', public.fn_mc_prova_confere(
    jsonb_build_object('l09', public.fn_mc_prova_hash(v_l09), 'l10', public.fn_mc_prova_hash(v_l10)),
    jsonb_build_object('l09', 'e494e5b27f249ca93e8b6fcb821604ee', 'l10', '55747138b02e631473d53a9f5b0eb3f2')));

  -- 6n. Nada fora do módulo
  r := r || jsonb_build_object('6n_nada_fora', public.fn_mc_prova_confere(public.fn_mc_prova_fora(), v_fora0));

  -- 6o. Grants, security definer e RLS
  r := r || jsonb_build_object('6o_grants', public.fn_mc_prova_confere(jsonb_build_object(
      'anon', (select jsonb_agg(has_function_privilege('anon', f, 'EXECUTE') order by f) from unnest(array[
          'public.fn_mc_reajuste_importar(uuid, jsonb, boolean)', 'public.fn_mc_reajuste_manual(uuid, jsonb)', 'public.fn_mc_reajuste_excluir(uuid, text)',
          'public.fn_mc_reajuste_config_salvar(uuid, jsonb)', 'public.fn_mc_ratear(numeric, uuid[], numeric[])', 'public.fn_mc_brl(numeric)']) f),
      'authenticated', (select jsonb_object_agg(f, has_function_privilege('authenticated', f, 'EXECUTE')) from unnest(array[
          'public.fn_mc_reajuste_importar(uuid, jsonb, boolean)', 'public.fn_mc_reajuste_manual(uuid, jsonb)', 'public.fn_mc_reajuste_excluir(uuid, text)',
          'public.fn_mc_reajuste_config_salvar(uuid, jsonb)', 'public.fn_mc_ratear(numeric, uuid[], numeric[])', 'public.fn_mc_brl(numeric)']) f),
      'definer_search_path', (select bool_and(p.prosecdef and p.proconfig = array['search_path=""']) from pg_proc p
          where p.pronamespace = 'public'::regnamespace and p.proname in ('fn_mc_reajuste_importar', 'fn_mc_reajuste_manual',
            'fn_mc_reajuste_excluir', 'fn_mc_reajuste_config_salvar')),
      'views', (select jsonb_object_agg(table_name || ':' || grantee, privs) from (select table_name, grantee, string_agg(privilege_type, ',' order by privilege_type) privs
               from information_schema.role_table_grants where table_schema = 'public' and table_name in ('mc_v_reajuste_medicao', 'mc_v_reajuste_itens')
                 and grantee in ('anon', 'authenticated') group by table_name, grantee) g),
      'rls', (select jsonb_object_agg(relname, relrowsecurity) from pg_class where relnamespace = 'public'::regnamespace and relkind = 'r'
               and relname in ('mc_reajuste_relatorios', 'mc_reajuste_relatorio_indices', 'mc_reajuste_linhas', 'mc_reajuste_rateio', 'mc_reajuste_de_para'))),
    jsonb_build_object(
      'anon', '[false, false, false, false, false, false]'::jsonb,
      'authenticated', jsonb_build_object('public.fn_mc_reajuste_importar(uuid, jsonb, boolean)', true, 'public.fn_mc_reajuste_manual(uuid, jsonb)', true,
        'public.fn_mc_reajuste_excluir(uuid, text)', true, 'public.fn_mc_reajuste_config_salvar(uuid, jsonb)', true,
        'public.fn_mc_ratear(numeric, uuid[], numeric[])', false, 'public.fn_mc_brl(numeric)', false),
      'definer_search_path', true,
      'views', jsonb_build_object('mc_v_reajuste_medicao:authenticated', 'SELECT', 'mc_v_reajuste_itens:authenticated', 'SELECT'),
      'rls', jsonb_build_object('mc_reajuste_relatorios', true, 'mc_reajuste_relatorio_indices', true, 'mc_reajuste_linhas', true,
        'mc_reajuste_rateio', true, 'mc_reajuste_de_para', true))));

  -- 6z. Controle: o total da 4ª do L09 contra -40.021,27 tem de dar DIFERENTE
  r := r || jsonb_build_object('6z_controle', case when (select total from public.mc_v_reajuste_medicao where medicao_id = v_m4) = -40021.27
                                                   then 'IGUAL (errado)' else 'DIFERENTE (esperado)' end);

  raise exception 'PROVA %', r;
end $prova$;
do $aborto$ begin raise exception 'ABORTO GARANTIDO'; end $aborto$;
rollback;
