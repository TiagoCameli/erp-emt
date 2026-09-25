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
  v_obras0 bigint; v_cc0 bigint; v_lanc0 bigint;
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

  -- 9. O módulo não escreveu em outro módulo
  r := r || jsonb_build_object('9_outros_modulos_intactos',
    (select count(*) from public.obras) = v_obras0 and (select count(*) from public.centros_custo) = v_cc0
    and (select count(*) from public.lancamentos) = v_lanc0);

  raise exception 'PROVA %', r;
end $prova$;
do $aborto$ begin raise exception 'ABORTO GARANTIDO'; end $aborto$;
rollback;
