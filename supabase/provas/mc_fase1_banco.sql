-- Prova da Fase 1 da Medição de Contratos. Migrations 20261001100000 a 20261001150000.
-- NÃO GRAVA: termina em raise exception com as medições, e o bloco de aborto garante o rollback.
-- Rodar inteira pelo MCP execute_sql. Cada caso vira uma chave em r; "recusou: ..." é o esperado
-- nos casos de trava; "PASSOU (errado)" é falha.
--
-- Números esperados, feitos à mão (seção 11 da spec):
--   K1 v0: 01 título | 01.01 3 x 0,335 = 1,005 | 01.02 3 x 0,335 = 1,005 | 01.02.01 2 x 10,004 = 20,008
--          02 título | 02.01 1 x 100,005 = 100,005 | 02.01 (código repetido) 1 x 1 = 1
--     item_por_medicao / item_por_acumulado: linhas 1,01 1,01 20,01 100,01 1; 01.02 subárvore 21,02;
--       grupo 01 = 22,03; grupo 02 = 101,01; total 123,04
--     sem_arredondar: 01.02 subárvore round(21,013) = 21,01; grupo 01 round(22,018) = 22,02;
--       grupo 02 round(101,005) = 101,01; total round(123,023) = 123,02   (o centavo do Lote 09:
--       grupo 01 + grupo 02 = 22,02 + 101,01 = 123,03, diferente do total 123,02)
--     regra nula: todo valor previsto e todo total (linha, subárvore, grupo, versão) sai nulo.
--   K1 medições (01.01): 1ª lança 1 + 0,5 = 1,5; 2ª lança 1,5
--     item_por_medicao: 1ª 0,50; 2ª 0,50; acumulado 1,00
--     item_por_acumulado: 1ª round(0,5025) = 0,50; 2ª round(1,005) - 0,50 = 0,51; acumulado 1,01
--     sem_arredondar: 1ª 0,5025; 2ª 0,5025; acumulado round(1,005) = 1,01
--     regra nula: med1, med2, acumulado e total_med2 saem nulos (caso ainda não roda de fato: falta
--       o gatilho de roteamento da Task 3, que preenche o medicao_id do lançamento).
--   K2 v0: 01 título | 01.01 10 x 0,335 = 3,35. 1ª medição lança 1,5, aprovada 1,2: glosa 0,3,
--     valor round(0,402) = 0,40. Aditivo 1 + v1 (a partir de 01/02): 01.01 12 x 0,4 = 4,80 e
--     01.02 novo 5 x 2 = 10,00, total v1 14,80. 2ª medição (v1) lança 1,5: valor 0,60;
--     acumulado do 01.01: quantidade 2,7, valor 1,00.

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

do $prova$
declare
  v_tiago constant uuid := 'c66fca9f-5428-4fb9-855f-dcff548764df';
  v_zero constant uuid := 'f155865b-1d4b-4b25-bf3d-54d8de9176b0';
  v_k1 uuid; v_k2 uuid; v_k3 uuid; v_n bigint; v_txt text; v_regra text; v_j jsonb; v_acc jsonb; r jsonb := '{}'::jsonb;
  v_obras0 bigint; v_cc0 bigint; v_lanc0 bigint; v_versao_rascunho uuid;
  v_versao_k3 uuid; v_med_k3 uuid; v_rev00_k3 uuid; v_rev01_k3 uuid; v_rev01_k2 uuid;
  v_k4 uuid; v_aditivo_prazo uuid; v_aditivo2 uuid; v_aditivo3 uuid;
begin
  select count(*) into v_obras0 from public.obras;
  select count(*) into v_cc0 from public.centros_custo;
  select count(*) into v_lanc0 from public.lancamentos;

  -- 1. Estrutura: as tabelas existem com RLS ligada e sem grant de escrita
  select count(*) into v_n from pg_class c join pg_namespace n on n.oid = c.relnamespace
   where n.nspname = 'public' and c.relkind = 'r' and c.relname like 'mc\_%' and c.relrowsecurity;
  r := r || jsonb_build_object('1a_tabelas_com_rls', v_n);
  select count(*) into v_n from information_schema.role_table_grants
   where table_schema = 'public' and table_name like 'mc\_%' and grantee in ('authenticated', 'anon')
     and privilege_type in ('INSERT', 'UPDATE', 'DELETE');
  r := r || jsonb_build_object('1b_grants_de_escrita', v_n);
  select count(*) into v_n from pg_trigger t join pg_class c on c.oid = t.tgrelid
   where c.relname like 'mc\_%' and t.tgname like 'trg_audit_%';
  r := r || jsonb_build_object('1c_tabelas_auditadas', v_n);

  -- 7. Backfill: os 4 Admins, 9 permissões cada. Lido logo depois do caso 1, antes do caso 4
  -- inserir as permissões avulsas do Tiago na transação. A migration do backfill (Task 5) fica
  -- pendente até o deploy das telas (Task 13): até lá, esta prova commitada le {"admins": 0,
  -- "linhas": 0} aqui, porque produção ainda não tem nenhuma linha usuario_permissoes com
  -- recurso like 'medicao.%'. Isso é esperado.
  select jsonb_build_object('admins', count(distinct usuario_id), 'linhas', count(*)) into v_txt
  from public.usuario_permissoes where recurso like 'medicao.%';
  r := r || jsonb_build_object('7_backfill', v_txt::jsonb);

  -- Dados de K1 (cálculo) e K2 (versões e travas), montados como dono.
  insert into public.mc_contratos (codigo, nome_obra, objeto, numero_contrato, contratante_nome, contratante_tipo,
    valor_inicial, data_assinatura, prazo_meses, regra_arredondamento, created_by)
  values ('PROVA-K1', 'Prova K1', 'Prova', 'K1', 'Contratante prova', 'privado', 123.04, '2025-12-01', 12, 'item_por_medicao', v_tiago)
  returning id into v_k1;
  insert into public.mc_contrato_usuarios (contrato_id, usuario_id) values (v_k1, v_tiago);
  perform public.fn_mc_prova_planilha(v_k1, 0, null, '2025-12-01', jsonb_build_array(
    jsonb_build_object('ordem', 1, 'codigo', '01', 'descricao', 'Grupo A', 'tipo', 'titulo'),
    jsonb_build_object('ordem', 2, 'codigo', '01.01', 'pai', 1, 'descricao', 'Serviço 1', 'unidade', 'un', 'tipo', 'servico', 'preco', '0.335', 'qtd', '3'),
    jsonb_build_object('ordem', 3, 'codigo', '01.02', 'pai', 1, 'descricao', 'Serviço 2', 'unidade', 'm2', 'tipo', 'servico', 'preco', '0.335', 'qtd', '3'),
    jsonb_build_object('ordem', 4, 'codigo', '01.02.01', 'pai', 3, 'descricao', 'Filho com preço', 'unidade', 't', 'tipo', 'servico', 'preco', '10.004', 'qtd', '2'),
    jsonb_build_object('ordem', 5, 'codigo', '02', 'descricao', 'Grupo B', 'tipo', 'titulo'),
    jsonb_build_object('ordem', 6, 'codigo', '02.01', 'pai', 5, 'descricao', 'Serviço 3', 'unidade', 'un', 'tipo', 'servico', 'preco', '100.005', 'qtd', '1'),
    jsonb_build_object('ordem', 7, 'codigo', '02.01', 'pai', 5, 'descricao', 'Código repetido', 'unidade', 'un', 'tipo', 'servico', 'preco', '1', 'qtd', '1')));

  -- 2. Previsto por linha, subárvore, grupo e total, nas três regras. Um comando por regra: dentro
  --    de um SELECT só, o update da regra não seria visto pelas views (snapshot do comando).
  v_acc := '{}'::jsonb;
  foreach v_regra in array array['item_por_medicao', 'item_por_acumulado', 'sem_arredondar', null] loop
    update public.mc_contratos set regra_arredondamento = v_regra where id = v_k1;
    select jsonb_build_object(
      'linha_01_01', (select valor_previsto from public.mc_v_planilha_linhas where contrato_id = v_k1 and ordem = 2),
      'subarvore_01_02', (select t.total_previsto from public.mc_v_planilha_totais t join public.mc_planilha_itens i on i.id = t.id where i.contrato_id = v_k1 and i.ordem = 3),
      'grupo_01', (select t.total_previsto from public.mc_v_planilha_totais t join public.mc_planilha_itens i on i.id = t.id where i.contrato_id = v_k1 and i.ordem = 1),
      'grupo_02', (select t.total_previsto from public.mc_v_planilha_totais t join public.mc_planilha_itens i on i.id = t.id where i.contrato_id = v_k1 and i.ordem = 5),
      'total', (select total_previsto from public.mc_v_versao_totais where contrato_id = v_k1)) into v_j;
    v_acc := v_acc || jsonb_build_object(coalesce(v_regra, 'nula'), v_j);
  end loop;
  update public.mc_contratos set regra_arredondamento = 'sem_arredondar' where id = v_k1;
  r := r || jsonb_build_object('2_previsto', v_acc);

  -- 3. Medições de K1: 1ª (jan) lança 1 + 0,5; 2ª (fev) lança 1,5, as duas abertas
  perform public.fn_mc_prova_medicao(v_k1, '2026-01-01', '2026-01-31');
  perform public.fn_mc_prova_medicao(v_k1, '2026-02-01', '2026-02-28');
  insert into public.mc_lancamentos (contrato_id, item_id, medicao_id, data, quantidade)
  select v_k1, i.item_id, '00000000-0000-0000-0000-000000000000', d.data, d.qtd
  from public.mc_planilha_itens i, (values ('2026-01-10'::date, 1::numeric), ('2026-01-20', 0.5), ('2026-02-05', 1.5)) d(data, qtd)
  where i.contrato_id = v_k1 and i.ordem = 2;
  v_acc := '{}'::jsonb;
  foreach v_regra in array array['item_por_medicao', 'item_por_acumulado', 'sem_arredondar', null] loop
    update public.mc_contratos set regra_arredondamento = v_regra where id = v_k1;
    select jsonb_build_object(
      'med1', (select valor_medicao from public.mc_v_medicao_itens where contrato_id = v_k1 and numero = 1),
      'med2', (select valor_medicao from public.mc_v_medicao_itens where contrato_id = v_k1 and numero = 2),
      'acumulado', (select valor_acumulado from public.mc_v_item_acumulado where contrato_id = v_k1),
      'total_med2', (select valor from public.mc_v_medicao_totais t join public.mc_medicoes m on m.id = t.medicao_id where m.contrato_id = v_k1 and m.numero = 2)) into v_j;
    v_acc := v_acc || jsonb_build_object(coalesce(v_regra, 'nula'), v_j);
  end loop;
  update public.mc_contratos set regra_arredondamento = 'sem_arredondar' where id = v_k1;
  r := r || jsonb_build_object('3_medicoes', v_acc);

  -- K2: versões, glosa, travas
  insert into public.mc_contratos (codigo, nome_obra, objeto, numero_contrato, contratante_nome, contratante_tipo,
    valor_inicial, data_assinatura, prazo_meses, regra_arredondamento, created_by)
  values ('PROVA-K2', 'Prova K2', 'Prova', 'K2', 'Contratante prova', 'municipal', 3.35, '2025-12-01', 12, 'item_por_medicao', v_tiago)
  returning id into v_k2;
  insert into public.mc_contrato_usuarios (contrato_id, usuario_id) values (v_k2, v_tiago);
  perform public.fn_mc_prova_planilha(v_k2, 0, null, '2025-12-01', jsonb_build_array(
    jsonb_build_object('ordem', 1, 'codigo', '01', 'descricao', 'Grupo', 'tipo', 'titulo'),
    jsonb_build_object('ordem', 2, 'codigo', '01.01', 'pai', 1, 'descricao', 'Serviço', 'unidade', 'un', 'tipo', 'servico', 'preco', '0.335', 'qtd', '10')));
  perform public.fn_mc_prova_medicao(v_k2, '2026-01-01', '2026-01-31');
  insert into public.mc_lancamentos (contrato_id, item_id, medicao_id, data, quantidade)
  select v_k2, item_id, '00000000-0000-0000-0000-000000000000', '2026-01-15', 1.5 from public.mc_planilha_itens where contrato_id = v_k2 and ordem = 2;

  -- 4a. Lançamento caiu na medição do período
  select numero::text into v_txt from public.mc_lancamentos l join public.mc_medicoes m on m.id = l.medicao_id where l.contrato_id = v_k2;
  r := r || jsonb_build_object('4a_lancamento_na_1a', v_txt);

  -- Aprova a 1ª de K2 com 1,2 (medida 1,5): glosa 0,3, valor 0,40
  insert into public.mc_medicao_revisoes (medicao_id, contrato_id, numero) select id, v_k2, 0 from public.mc_medicoes where contrato_id = v_k2 and numero = 1;
  insert into public.mc_aprovacoes_item (revisao_id, item_id, contrato_id, quantidade_aprovada)
  select r2.id, i.item_id, v_k2, 1.2 from public.mc_medicao_revisoes r2, public.mc_planilha_itens i where r2.contrato_id = v_k2 and i.contrato_id = v_k2 and i.ordem = 2;
  update public.mc_medicao_revisoes set status = 'aprovada' where contrato_id = v_k2;
  update public.mc_medicoes set status = 'aprovada', aprovada_em = now() where contrato_id = v_k2 and numero = 1;
  select jsonb_build_object('glosa', glosa, 'valor', valor_medicao) into strict v_txt from public.mc_v_medicao_itens where contrato_id = v_k2 and numero = 1;
  r := r || jsonb_build_object('4b_aprovada_glosa', v_txt::jsonb);

  -- 4c. Aditivo 1 + v1 a partir de 01/02: 01.01 muda para 12 x 0,4; entra 01.02 (5 x 2)
  insert into public.mc_aditivos (contrato_id, numero, data_assinatura, data_vigencia, tipos, motivo)
  values (v_k2, 1, '2026-01-25', '2026-02-01', array['quantidade', 'valor', 'inclusao_item'], 'Prova');
  perform public.fn_mc_prova_planilha(v_k2, 1, (select id from public.mc_aditivos where contrato_id = v_k2), '2026-02-01', jsonb_build_array(
    jsonb_build_object('ordem', 1, 'codigo', '01', 'descricao', 'Grupo', 'tipo', 'titulo',
                       'item_id', (select item_id from public.mc_planilha_itens where contrato_id = v_k2 and ordem = 1 limit 1)),
    jsonb_build_object('ordem', 2, 'codigo', '01.01', 'pai', 1, 'descricao', 'Serviço', 'unidade', 'un', 'tipo', 'servico', 'preco', '0.4', 'qtd', '12',
                       'item_id', (select item_id from public.mc_planilha_itens where contrato_id = v_k2 and ordem = 2 limit 1)),
    jsonb_build_object('ordem', 3, 'codigo', '01.02', 'pai', 1, 'descricao', 'Novo', 'unidade', 'm', 'tipo', 'servico', 'preco', '2', 'qtd', '5')));
  perform public.fn_mc_prova_medicao(v_k2, '2026-02-01', '2026-02-28');
  insert into public.mc_lancamentos (contrato_id, item_id, medicao_id, data, quantidade)
  select v_k2, item_id, '00000000-0000-0000-0000-000000000000', '2026-02-10', 1.5 from public.mc_planilha_itens where contrato_id = v_k2 and ordem = 2 limit 1;
  select jsonb_build_object(
    'total_v1', (select total_previsto from public.mc_v_versao_totais t join public.mc_planilha_versoes v on v.id = t.versao_id where v.contrato_id = v_k2 and v.numero = 1),
    'valor_med2', (select valor_medicao from public.mc_v_medicao_itens where contrato_id = v_k2 and numero = 2),
    'qtd_acum', (select qtd_acumulada from public.mc_v_item_acumulado where contrato_id = v_k2),
    'valor_acum', (select valor_acumulado from public.mc_v_item_acumulado where contrato_id = v_k2)) into v_txt;
  r := r || jsonb_build_object('4c_versoes', v_txt::jsonb);

  -- 5. Travas: cada uma tem de recusar
  begin insert into public.mc_lancamentos (contrato_id, item_id, medicao_id, data, quantidade)
    select v_k2, item_id, '00000000-0000-0000-0000-000000000000', '2025-12-31', 1 from public.mc_planilha_itens where contrato_id = v_k2 and ordem = 2 limit 1;
    v_txt := 'PASSOU (errado)'; exception when others then v_txt := 'recusou: ' || sqlerrm; end;
  r := r || jsonb_build_object('5a_sem_medicao', v_txt);
  begin insert into public.mc_lancamentos (contrato_id, item_id, medicao_id, data, quantidade)
    select v_k2, item_id, '00000000-0000-0000-0000-000000000000', '2026-02-11', 1 from public.mc_planilha_itens where contrato_id = v_k2 and ordem = 1 limit 1;
    v_txt := 'PASSOU (errado)'; exception when others then v_txt := 'recusou: ' || sqlerrm; end;
  r := r || jsonb_build_object('5b_titulo', v_txt);
  begin perform public.fn_mc_prova_medicao(v_k2, '2026-02-20', '2026-03-10');
    v_txt := 'PASSOU (errado)'; exception when others then v_txt := 'recusou: ' || sqlerrm; end;
  r := r || jsonb_build_object('5c_sobreposicao', v_txt);
  update public.mc_medicoes set status = 'em_conferencia' where contrato_id = v_k2 and numero = 2;
  begin insert into public.mc_lancamentos (contrato_id, item_id, medicao_id, data, quantidade)
    select v_k2, item_id, '00000000-0000-0000-0000-000000000000', '2026-02-12', 1 from public.mc_planilha_itens where contrato_id = v_k2 and ordem = 2 limit 1;
    v_txt := 'PASSOU (errado)'; exception when others then v_txt := 'recusou: ' || sqlerrm; end;
  r := r || jsonb_build_object('5d_em_conferencia', v_txt);
  begin update public.mc_medicoes set periodo_fim = '2026-01-30' where contrato_id = v_k2 and numero = 1;
    v_txt := 'PASSOU (errado)'; exception when others then v_txt := 'recusou: ' || sqlerrm; end;
  r := r || jsonb_build_object('5e1_aprovada_update', v_txt);
  begin delete from public.mc_medicoes where contrato_id = v_k2 and numero = 1;
    v_txt := 'PASSOU (errado)'; exception when others then v_txt := 'recusou: ' || sqlerrm; end;
  r := r || jsonb_build_object('5e2_aprovada_delete', v_txt);
  begin insert into public.mc_ajustes (medicao_id, contrato_id, revisao_id, item_id, quantidade, motivo)
    select m.id, v_k2, rv.id, i.item_id, 1, 'Tentativa' from public.mc_medicoes m join public.mc_medicao_revisoes rv on rv.medicao_id = m.id
    join public.mc_planilha_itens i on i.versao_id = m.versao_id and i.ordem = 2 where m.contrato_id = v_k2 and m.numero = 1;
    v_txt := 'PASSOU (errado)'; exception when others then v_txt := 'recusou: ' || sqlerrm; end;
  r := r || jsonb_build_object('5e3_ajuste_em_aprovada', v_txt);
  begin update public.mc_lancamentos set excluido_em = now(), motivo_exclusao = 'x' where contrato_id = v_k2 and data = '2026-01-15';
    v_txt := 'PASSOU (errado)'; exception when others then v_txt := 'recusou: ' || sqlerrm; end;
  r := r || jsonb_build_object('5e4_lancamento_de_aprovada', v_txt);
  begin update public.mc_aprovacoes_item set quantidade_aprovada = 1.5 where contrato_id = v_k2;
    v_txt := 'PASSOU (errado)'; exception when others then v_txt := 'recusou: ' || sqlerrm; end;
  r := r || jsonb_build_object('5e5_aprovacao_alterada', v_txt);
  begin update public.mc_planilha_itens set preco_unitario = 1 where contrato_id = v_k2 and ordem = 2;
    v_txt := 'PASSOU (errado)'; exception when others then v_txt := 'recusou: ' || sqlerrm; end;
  r := r || jsonb_build_object('5f_versao_vigente', v_txt);
  begin update public.mc_contratos set regra_arredondamento = 'sem_arredondar' where id = v_k2;
    v_txt := 'PASSOU (errado)'; exception when others then v_txt := 'recusou: ' || sqlerrm; end;
  r := r || jsonb_build_object('5g_regra_com_aprovada', v_txt);
  begin insert into public.mc_medicoes (contrato_id, numero, periodo_inicio, periodo_fim, versao_id)
    select v_k2, 5, '2026-04-01', '2026-04-30', versao_id from public.mc_medicoes where contrato_id = v_k2 and numero = 2;
    v_txt := 'PASSOU (errado)'; exception when others then v_txt := 'recusou: ' || sqlerrm; end;
  r := r || jsonb_build_object('5h_numero_fora_de_ordem', v_txt);
  insert into public.mc_medicao_revisoes (medicao_id, contrato_id, numero) select id, v_k1, 0 from public.mc_medicoes where contrato_id = v_k1 and numero = 1;
  insert into public.mc_ajustes (medicao_id, contrato_id, revisao_id, item_id, quantidade, motivo)
  select m.id, v_k1, rv.id, i.item_id, 0.1, 'Ajuste de prova' from public.mc_medicoes m
    join public.mc_medicao_revisoes rv on rv.medicao_id = m.id join public.mc_planilha_itens i on i.versao_id = m.versao_id and i.ordem = 2
    where m.contrato_id = v_k1 and m.numero = 1;
  begin update public.mc_ajustes set quantidade = 0.2 where contrato_id = v_k1;
    v_txt := 'PASSOU (errado)'; exception when others then v_txt := 'recusou: ' || sqlerrm; end;
  r := r || jsonb_build_object('5i_ajuste_alterado', v_txt);

  -- 5j. Reponte da aprovação de REV00 (K2, aprovada) para uma revisão em aberto (K1 REV0)
  begin update public.mc_aprovacoes_item set revisao_id = (select id from public.mc_medicao_revisoes where contrato_id = v_k1 and numero = 0)
      where contrato_id = v_k2 and revisao_id = (select id from public.mc_medicao_revisoes where contrato_id = v_k2 and numero = 0);
    v_txt := 'PASSOU (errado)'; exception when others then v_txt := 'recusou: ' || sqlerrm; end;
  r := r || jsonb_build_object('5j_aprovacao_repontada', v_txt);

  -- 5k. Mover linha da versão vigente (K2 v0) para uma versão rascunho nova
  insert into public.mc_planilha_versoes (contrato_id, numero, aditivo_id, vigente_desde, status)
  values (v_k2, 2, (select id from public.mc_aditivos where contrato_id = v_k2 limit 1), '2026-03-01', 'rascunho')
  returning id into v_versao_rascunho;
  begin update public.mc_planilha_itens set versao_id = v_versao_rascunho, pai_id = null
      where contrato_id = v_k2 and ordem = 2 and versao_id = (select id from public.mc_planilha_versoes where contrato_id = v_k2 and numero = 0);
    v_txt := 'PASSOU (errado)'; exception when others then v_txt := 'recusou: ' || sqlerrm; end;
  r := r || jsonb_build_object('5k_linha_movida_de_versao', v_txt);

  -- 5l. Revisão nasce aprovada, direto na 1ª medição de K2 (já aprovada), fora de carga
  begin insert into public.mc_medicao_revisoes (medicao_id, contrato_id, numero, status, motivo)
      select id, v_k2, 9, 'aprovada', 'Tentativa' from public.mc_medicoes where contrato_id = v_k2 and numero = 1;
    v_txt := 'PASSOU (errado)'; exception when others then v_txt := 'recusou: ' || sqlerrm; end;
  r := r || jsonb_build_object('5l_revisao_nasce_aprovada', v_txt);

  -- 5m. Repontar a REV0 em aberto de K1 para a 1ª medição de K2, já aprovando-a no mesmo update
  begin update public.mc_medicao_revisoes set medicao_id = (select id from public.mc_medicoes where contrato_id = v_k2 and numero = 1),
         contrato_id = v_k2, numero = 1, motivo = 'Reponte de teste', status = 'aprovada'
      where contrato_id = v_k1 and numero = 0;
    v_txt := 'PASSOU (errado)'; exception when others then v_txt := 'recusou: ' || sqlerrm; end;
  r := r || jsonb_build_object('5m_revisao_repontada_aprovada', v_txt);

  -- 5n. Renumerar a 2ª medição de K1 (aberta)
  begin update public.mc_medicoes set numero = 9 where contrato_id = v_k1 and numero = 2;
    v_txt := 'PASSOU (errado)'; exception when others then v_txt := 'recusou: ' || sqlerrm; end;
  r := r || jsonb_build_object('5n_medicao_renumerada', v_txt);

  -- 5o. Aprovar a 2ª medição de K1 com a 1ª ainda aberta
  begin update public.mc_medicoes set status = 'aprovada', aprovada_em = now() where contrato_id = v_k1 and numero = 2;
    v_txt := 'PASSOU (errado)'; exception when others then v_txt := 'recusou: ' || sqlerrm; end;
  r := r || jsonb_build_object('5o_aprovacao_fora_de_ordem', v_txt);

  -- 5p. Carga deixa REV01 (antes_aprovacao, em_aberto) pendurada numa medição já aprovada (K3);
  -- fora da carga, inserir aprovação nela tem de recusar
  insert into public.mc_contratos (codigo, nome_obra, objeto, numero_contrato, contratante_nome, contratante_tipo,
    valor_inicial, data_assinatura, prazo_meses, regra_arredondamento, created_by)
  values ('PROVA-K3', 'Prova K3', 'Prova', 'K3', 'Contratante prova', 'privado', 1, '2025-12-01', 12, 'item_por_medicao', v_tiago)
  returning id into v_k3;
  insert into public.mc_contrato_usuarios (contrato_id, usuario_id) values (v_k3, v_tiago);
  perform public.fn_mc_prova_planilha(v_k3, 0, null, '2025-12-01', jsonb_build_array(
    jsonb_build_object('ordem', 1, 'codigo', '01', 'descricao', 'Serviço único', 'unidade', 'un', 'tipo', 'servico', 'preco', '1', 'qtd', '1')));
  select id into v_versao_k3 from public.mc_planilha_versoes where contrato_id = v_k3 and numero = 0;
  perform set_config('app.mc_carga', '1', true);
  insert into public.mc_medicoes (contrato_id, numero, periodo_inicio, periodo_fim, versao_id, status, origem)
  values (v_k3, 1, '2026-01-01', '2026-01-31', v_versao_k3, 'aprovada', 'carga')
  returning id into v_med_k3;
  insert into public.mc_medicao_revisoes (medicao_id, contrato_id, numero, status)
  values (v_med_k3, v_k3, 0, 'aprovada') returning id into v_rev00_k3;
  insert into public.mc_medicao_revisoes (medicao_id, contrato_id, numero, status, motivo)
  values (v_med_k3, v_k3, 1, 'em_aberto', 'Carga: revisão extra deixada aberta') returning id into v_rev01_k3;
  perform set_config('app.mc_carga', '0', true);
  begin insert into public.mc_aprovacoes_item (revisao_id, item_id, contrato_id, quantidade_aprovada)
      select v_rev01_k3, item_id, v_k3, 1 from public.mc_planilha_itens where contrato_id = v_k3 and ordem = 1;
    v_txt := 'PASSOU (errado)'; exception when others then v_txt := 'recusou: ' || sqlerrm; end;
  r := r || jsonb_build_object('5p_revisao_antes_aprovacao_em_medicao_aprovada', v_txt);

  -- 5q. Aprovar K1 med1 com a REV00 ainda em aberto (de 5i)
  begin update public.mc_medicoes set status = 'aprovada', aprovada_em = now() where contrato_id = v_k1 and numero = 1;
    v_txt := 'PASSOU (errado)'; exception when others then v_txt := 'recusou: ' || sqlerrm; end;
  r := r || jsonb_build_object('5q_aprovacao_sem_revisao_fechada', v_txt);

  -- 5r. Uma segunda revisão de K2 med1 (pós-aprovação) tentando virar aprovada com a REV00 já aprovada
  insert into public.mc_medicao_revisoes (medicao_id, contrato_id, numero, fase, motivo)
  select id, v_k2, 1, 'pos_aprovacao', 'Correção pós-aprovação de prova' from public.mc_medicoes where contrato_id = v_k2 and numero = 1
  returning id into v_rev01_k2;
  begin update public.mc_medicao_revisoes set status = 'aprovada' where id = v_rev01_k2;
    v_txt := 'PASSOU (errado)'; exception when others then v_txt := 'recusou: ' || sqlerrm; end;
  r := r || jsonb_build_object('5r_duas_aprovadas', v_txt);

  -- 5s. Revisão fora de ordem (REV09 direto, sem as anteriores)
  begin insert into public.mc_medicao_revisoes (medicao_id, contrato_id, numero, motivo)
      select id, v_k1, 9, 'Fora de ordem' from public.mc_medicoes where contrato_id = v_k1 and numero = 2;
    v_txt := 'PASSOU (errado)'; exception when others then v_txt := 'recusou: ' || sqlerrm; end;
  r := r || jsonb_build_object('5s_revisao_fora_de_ordem', v_txt);

  -- 5t. Medição nascendo aprovada fora da carga
  begin insert into public.mc_medicoes (contrato_id, numero, periodo_inicio, periodo_fim, versao_id, status)
      select v_k1, 3, '2026-03-01', '2026-03-31', versao_id, 'aprovada' from public.mc_medicoes where contrato_id = v_k1 and numero = 2;
    v_txt := 'PASSOU (errado)'; exception when others then v_txt := 'recusou: ' || sqlerrm; end;
  r := r || jsonb_build_object('5t_medicao_nasce_aprovada_fora_carga', v_txt);

  -- 5u. Aprovar K2 med2 com a REV01 (pós-aprovação) de K2 med1 ainda em aberto
  begin update public.mc_medicoes set status = 'aprovada', aprovada_em = now() where contrato_id = v_k2 and numero = 2;
    v_txt := 'PASSOU (errado)'; exception when others then v_txt := 'recusou: ' || sqlerrm; end;
  r := r || jsonb_build_object('5u_pos_aprovacao_pendente', v_txt);

  -- 6. Truncate nas tabelas transacionais do módulo tem gatilho de recusa (não roda o truncate)
  select count(*) into v_n from pg_trigger t join pg_class c on c.oid = t.tgrelid
   where c.relname = any(array['mc_lancamentos', 'mc_ajustes', 'mc_aprovacoes_item', 'mc_revisao_itens',
                               'mc_medicao_revisoes', 'mc_medicoes', 'mc_planilha_itens', 'mc_planilha_versoes'])
     and t.tgname = 'trg_mc_trava_truncate';
  r := r || jsonb_build_object('6_truncate_travas', v_n);

  -- 4d/4e. Rascunho pela RPC: gravar duas vezes substitui; segundo rascunho é recusado
  perform set_config('request.jwt.claims', json_build_object('sub', v_tiago, 'role', 'authenticated')::text, true);
  insert into public.usuario_permissoes (usuario_id, recurso, acao)
  select v_tiago, x.recurso, x.acao from (values ('medicao.contratos', 'ver'), ('medicao.contratos', 'criar'), ('medicao.contratos', 'editar'),
    ('medicao.contratos', 'excluir'), ('administracao.lixeira', 'editar'),
    ('medicao.planilha', 'ver'), ('medicao.planilha', 'criar'), ('medicao.planilha', 'aprovar')) x(recurso, acao)
  on conflict do nothing;
  set local role authenticated;
  v_k3 := public.fn_mc_contrato_salvar(jsonb_build_object('codigo', 'prova-rpc', 'nome_obra', 'Prova K3', 'objeto', 'Prova',
    'numero_contrato', 'K3', 'contratante_nome', 'Prova', 'contratante_tipo', 'estadual', 'valor_inicial', '10',
    'data_assinatura', '2026-01-01', 'prazo_meses', 12));
  perform public.fn_mc_planilha_criar_rascunho(v_k3, jsonb_build_object('vigente_desde', '2026-01-01'));
  for v_n in 1..2 loop
    perform public.fn_mc_planilha_gravar_linhas(
      (select id from public.mc_planilha_versoes where contrato_id = v_k3), jsonb_build_array(
        jsonb_build_object('ordem', 1, 'codigo', '01', 'pai_ordem', null, 'descricao', 'Grupo', 'unidade', null, 'tipo', 'titulo',
                           'preco_unitario', null, 'quantidade_prevista', null, 'linha_origem', 5, 'item_id', null),
        jsonb_build_object('ordem', 2, 'codigo', '01.01', 'pai_ordem', 1, 'descricao', 'Serviço', 'unidade', 'un', 'tipo', 'servico',
                           'preco_unitario', '580.86429961', 'quantidade_prevista', '17057.717', 'linha_origem', 6, 'item_id', null)),
      'planilha.xlsx', 'abc');
  end loop;
  select jsonb_build_object('linhas', (select count(*) from public.mc_planilha_itens where contrato_id = v_k3),
    'preco_cheio', (select preco_unitario::text from public.mc_planilha_itens where contrato_id = v_k3 and ordem = 2),
    'codigo_maiusculo', (select codigo from public.mc_contratos where id = v_k3),
    'criador_na_lista', exists (select 1 from public.mc_contrato_usuarios where contrato_id = v_k3 and usuario_id = v_tiago)) into v_txt;
  r := r || jsonb_build_object('4d_gravar_duas_vezes', v_txt::jsonb);
  begin perform public.fn_mc_planilha_criar_rascunho(v_k3, jsonb_build_object('vigente_desde', '2026-01-01'));
    v_txt := 'PASSOU (errado)'; exception when others then v_txt := 'recusou: ' || sqlerrm; end;
  r := r || jsonb_build_object('4e_segundo_rascunho', v_txt);
  perform public.fn_mc_planilha_aprovar((select id from public.mc_planilha_versoes where contrato_id = v_k3));
  r := r || jsonb_build_object('4f_aprovada', (select status from public.mc_planilha_versoes where contrato_id = v_k3));

  -- 4g/4h/4i. Contrato excluído recusa RPCs de escrita na árvore; restaurar funciona
  v_k4 := public.fn_mc_contrato_salvar(jsonb_build_object('codigo', 'prova-k4', 'nome_obra', 'Prova K4', 'objeto', 'Prova',
    'numero_contrato', 'K4', 'contratante_nome', 'Prova', 'contratante_tipo', 'estadual', 'valor_inicial', '10',
    'data_assinatura', '2026-01-01', 'prazo_meses', 12));
  perform public.fn_mc_excluir('mc_contratos', v_k4, 'Prova de exclusão');
  begin perform public.fn_mc_aditivo_salvar(v_k4, jsonb_build_object('data_assinatura', '2026-02-01', 'data_vigencia', '2026-03-01',
      'tipos', jsonb_build_array('prazo'), 'prazo_acrescido_meses', 1, 'motivo', 'Prova'));
    v_txt := 'PASSOU (errado)'; exception when others then v_txt := 'recusou: ' || sqlerrm; end;
  r := r || jsonb_build_object('4g_aditivo_em_contrato_excluido', v_txt);
  begin perform public.fn_mc_planilha_criar_rascunho(v_k4, jsonb_build_object('vigente_desde', '2026-01-01'));
    v_txt := 'PASSOU (errado)'; exception when others then v_txt := 'recusou: ' || sqlerrm; end;
  r := r || jsonb_build_object('4h_rascunho_em_contrato_excluido', v_txt);
  perform public.fn_mc_restaurar('mc_contratos', v_k4);
  r := r || jsonb_build_object('4i_restaurado', (select excluido_em is null from public.mc_contratos where id = v_k4));

  -- 4j. Aditivo só de prazo não libera nova versão da planilha
  v_aditivo_prazo := public.fn_mc_aditivo_salvar(v_k3, jsonb_build_object('data_assinatura', '2026-02-01', 'data_vigencia', '2026-03-01',
    'tipos', jsonb_build_array('prazo'), 'prazo_acrescido_meses', 2, 'motivo', 'Prova prazo'));
  begin perform public.fn_mc_planilha_criar_rascunho(v_k3, jsonb_build_object('aditivo_id', v_aditivo_prazo, 'vigente_desde', '2026-02-01'));
    v_txt := 'PASSOU (errado)'; exception when others then v_txt := 'recusou: ' || sqlerrm; end;
  r := r || jsonb_build_object('4j_aditivo_so_prazo', v_txt);

  -- 4k. Linha citando item de outro contrato é recusada
  v_aditivo2 := public.fn_mc_aditivo_salvar(v_k3, jsonb_build_object('data_assinatura', '2026-02-01', 'data_vigencia', '2026-03-01',
    'tipos', jsonb_build_array('quantidade'), 'motivo', 'Prova quantidade'));
  perform public.fn_mc_planilha_criar_rascunho(v_k3, jsonb_build_object('aditivo_id', v_aditivo2, 'vigente_desde', '2026-02-01'));
  begin perform public.fn_mc_planilha_gravar_linhas(
      (select id from public.mc_planilha_versoes where contrato_id = v_k3 and status = 'rascunho'), jsonb_build_array(
        jsonb_build_object('ordem', 1, 'codigo', '01', 'pai_ordem', null, 'descricao', 'Serviço de outro contrato', 'unidade', 'un',
                           'tipo', 'servico', 'preco_unitario', '1', 'quantidade_prevista', '1', 'linha_origem', null,
                           'item_id', (select item_id from public.mc_planilha_itens where contrato_id = v_k1 and ordem = 2 limit 1))),
      'planilha2.xlsx', 'def');
    v_txt := 'PASSOU (errado)'; exception when others then v_txt := 'recusou: ' || sqlerrm; end;
  r := r || jsonb_build_object('4k_item_de_outro_contrato', v_txt);

  -- 4l. vigente_desde ausente é recusado com mensagem de negócio (não o not null cru da coluna)
  begin perform public.fn_mc_planilha_criar_rascunho(v_k4, jsonb_build_object());
    v_txt := 'PASSOU (errado)'; exception when others then v_txt := 'recusou: ' || sqlerrm; end;
  r := r || jsonb_build_object('4l_vigente_desde_ausente', v_txt);

  -- 4o. vigente_desde com texto que não é data nenhuma (não o erro cru do Postgres)
  begin perform public.fn_mc_planilha_criar_rascunho(v_k4, jsonb_build_object('vigente_desde', 'abc'));
    v_txt := 'PASSOU (errado)'; exception when others then v_txt := 'recusou: ' || sqlerrm; end;
  r := r || jsonb_build_object('4o_vigente_desde_nao_e_data', v_txt);

  -- 4p. vigente_desde com data que não existe no calendário (29/02 fora de ano bissexto etc.)
  begin perform public.fn_mc_planilha_criar_rascunho(v_k4, jsonb_build_object('vigente_desde', '2026-02-30'));
    v_txt := 'PASSOU (errado)'; exception when others then v_txt := 'recusou: ' || sqlerrm; end;
  r := r || jsonb_build_object('4p_vigente_desde_dia_inexistente', v_txt);

  -- 4m. Restaurar um filho (aditivo) cujo contrato pai ainda está na lixeira é recusado
  v_aditivo3 := public.fn_mc_aditivo_salvar(v_k4, jsonb_build_object('data_assinatura', '2026-02-01', 'data_vigencia', '2026-03-01',
    'tipos', jsonb_build_array('valor'), 'motivo', 'Prova restaurar'));
  perform public.fn_mc_excluir('mc_aditivos', v_aditivo3, 'Prova exclusão do aditivo');
  perform public.fn_mc_excluir('mc_contratos', v_k4, 'Prova exclusão do contrato de novo');
  begin perform public.fn_mc_restaurar('mc_aditivos', v_aditivo3);
    v_txt := 'PASSOU (errado)'; exception when others then v_txt := 'recusou: ' || sqlerrm; end;
  r := r || jsonb_build_object('4m_restaurar_filho_contrato_excluido', v_txt);
  perform public.fn_mc_restaurar('mc_contratos', v_k4);
  perform public.fn_mc_restaurar('mc_aditivos', v_aditivo3);

  -- 4n. Tipos vazio é recusado
  begin perform public.fn_mc_aditivo_salvar(v_k4, jsonb_build_object('data_assinatura', '2026-02-01', 'data_vigencia', '2026-03-01',
      'tipos', jsonb_build_array(), 'motivo', 'Prova tipos vazio'));
    v_txt := 'PASSOU (errado)'; exception when others then v_txt := 'recusou: ' || sqlerrm; end;
  r := r || jsonb_build_object('4n_tipos_vazio', v_txt);
  reset role;

  -- 6. Acesso por contrato
  insert into public.usuario_permissoes (usuario_id, recurso, acao)
  values (v_zero, 'medicao.contratos', 'ver'), (v_zero, 'medicao.planilha', 'ver') on conflict do nothing;
  perform set_config('request.jwt.claims', json_build_object('sub', v_zero, 'role', 'authenticated')::text, true);
  set local role authenticated;
  r := r || jsonb_build_object('6a_fora_da_lista',
    jsonb_build_object('contratos', (select count(*) from public.mc_contratos where codigo like 'PROVA-%'),
                       'linhas', (select count(*) from public.mc_planilha_itens where contrato_id in (v_k1, v_k2, v_k3)),
                       'views', (select count(*) from public.mc_v_planilha_linhas where contrato_id in (v_k1, v_k2, v_k3))));
  begin perform public.fn_mc_contrato_salvar(jsonb_build_object('codigo', 'X1', 'nome_obra', 'XX', 'objeto', 'X', 'numero_contrato', 'X',
      'contratante_nome', 'X', 'contratante_tipo', 'privado', 'valor_inicial', '1', 'data_assinatura', '2026-01-01', 'prazo_meses', 1));
    v_txt := 'PASSOU (errado)'; exception when others then v_txt := 'recusou: ' || sqlerrm; end;
  r := r || jsonb_build_object('6b_sem_criar', v_txt);
  reset role;
  perform set_config('request.jwt.claims', json_build_object('sub', v_tiago, 'role', 'authenticated')::text, true);
  set local role authenticated;
  perform public.fn_mc_acesso_definir(v_k2, v_zero, true);
  begin perform public.fn_mc_acesso_definir(v_k3, v_tiago, false);
    v_txt := 'PASSOU (errado)'; exception when others then v_txt := 'recusou: ' || sqlerrm; end;
  r := r || jsonb_build_object('6c_ultimo_da_lista', v_txt);
  r := r || jsonb_build_object('6d_controle_tiago', (select count(*) from public.mc_contratos where codigo like 'PROVA-%'));
  reset role;
  perform set_config('request.jwt.claims', json_build_object('sub', v_zero, 'role', 'authenticated')::text, true);
  set local role authenticated;
  r := r || jsonb_build_object('6e_na_lista_de_k2', (select array_agg(codigo) from public.mc_contratos where codigo like 'PROVA-%'));
  reset role;
  update public.usuarios set ativo = false where id = v_zero;
  set local role authenticated;
  r := r || jsonb_build_object('6f_desativado', (select count(*) from public.mc_contratos where codigo like 'PROVA-%'));
  reset role;
  update public.usuarios set ativo = true where id = v_zero;

  -- 9. O módulo não escreveu em outro módulo
  r := r || jsonb_build_object('9_outros_modulos_intactos',
    (select count(*) from public.obras) = v_obras0 and (select count(*) from public.centros_custo) = v_cc0
    and (select count(*) from public.lancamentos) = v_lanc0);

  raise exception 'PROVA %', r;
end $prova$;
do $aborto$ begin raise exception 'ABORTO GARANTIDO'; end $aborto$;
rollback;
