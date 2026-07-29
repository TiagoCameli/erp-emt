-- Prova de aceite das parcelas manuais da ordem de compra.
--
-- Roda contra o banco vivo, cria a própria massa de teste (marcada com
-- [PROVA-PARCELAS] nas observações), verifica cada regra e apaga o que criou.
-- Pode rodar quantas vezes quiser. Cobre a lista de aceite:
--
--   1. 30/60/90 gera 3 parcelas e o arredondamento fecha (100/3)
--   2. OC com parcelas: o lançamento herda datas e valores exatos
--   3. OC sem parcelas: o lançamento nasce sem parcela nenhuma
--   4. lançamento sem parcela não aparece na fila de aprovação
--   5. parcela de lançamento previsto não pode ser aprovada
--   6. soma divergente é recusada ao definir parcelas no lançamento
--   7. definir parcelas certas funciona
--   8. NF divergente joga a diferença na última parcela em aberto
--   9. parcela aprovada ou paga torna as parcelas imutáveis
--  10. parcelas de OC aprovada não podem ser alteradas na OC
--  11. vencimento antes da emissão é recusado
--  12. rateio por centro de custo continua igual nos dois caminhos
--
-- IMPORTANTE: as funções checam tem_permissao(), que depende de auth.uid().
-- Rodando fora de uma sessão autenticada (SQL editor, MCP), assuma um usuário
-- ativo com as permissões necessárias antes de executar. O bloco abaixo pega o
-- primeiro usuário ativo que tenha compras.ordens:aprovar.
--
-- Sobra no banco depois da prova: só as linhas de audit_log das operações
-- (append-only por definição). As linhas de negócio são apagadas.

do $prova$
declare
  v_usuario uuid;
begin
  select u.id into v_usuario
  from public.usuarios u
  join public.usuario_permissoes up on up.usuario_id = u.id
  where u.ativo
    and up.recurso = 'compras.ordens'
    and up.acao = 'aprovar'
  limit 1;

  if v_usuario is null then
    raise exception 'Nenhum usuario ativo com compras.ordens:aprovar para rodar a prova';
  end if;

  perform set_config('request.jwt.claims', json_build_object('sub', v_usuario)::text, false);
end $prova$;

create temp table if not exists prova_parcelas (
  ordem int generated always as identity,
  caso text,
  esperado text,
  obtido text,
  passou boolean
);
truncate prova_parcelas;

do $prova$
declare
  v_forn uuid; v_ins uuid; v_cc uuid; v_cc2 uuid; v_cond3 uuid;
  v_oc_com uuid; v_oc_sem uuid;
  v_lanc_com uuid; v_lanc_sem uuid;
  v_parcela uuid;
  v_txt text; v_num numeric; v_int int;
begin
  select id into v_forn from public.fornecedores where ativo order by razao_social limit 1;
  select id into v_ins from public.insumos where ativo order by nome limit 1;
  select id into v_cc from public.centros_custo where ativo order by codigo nulls last limit 1;
  select id into v_cc2 from public.centros_custo where ativo and id <> v_cc order by codigo nulls last limit 1;

  -- condição com 3 parcelas (30/60/90 ou equivalente)
  select cp.condicao_id into v_cond3
  from public.condicao_parcelas cp
  group by cp.condicao_id
  having count(*) = 3 and round(sum(cp.percentual), 2) = 100.00
  limit 1;

  if v_forn is null or v_ins is null or v_cc is null or v_cond3 is null then
    raise exception 'Massa base insuficiente (fornecedor, insumo, centro de custo ou condicao de 3 parcelas)';
  end if;

  -- ---------------------------------------------------------------------
  -- 1. divisão e arredondamento: 100,00 em 3 parcelas
  -- ---------------------------------------------------------------------
  select string_agg(valor::text, ' + ' order by numero_parcela)
  into v_txt
  from public.fn_parcelas_da_condicao(v_cond3, 100.00, '2026-01-10');

  insert into prova_parcelas (caso, esperado, obtido, passou)
  values ('1. 100,00 em 3 parcelas (arredondamento)',
          '33.33 + 33.33 + 33.34', v_txt, v_txt = '33.33 + 33.33 + 33.34');

  select count(*), round(sum(valor), 2) into v_int, v_num
  from public.fn_parcelas_da_condicao(v_cond3, 100.00, '2026-01-10');

  insert into prova_parcelas (caso, esperado, obtido, passou)
  values ('1b. soma das 3 fecha com o total',
          '3 parcelas somando 100.00',
          v_int || ' parcelas somando ' || v_num,
          v_int = 3 and v_num = 100.00);

  -- ---------------------------------------------------------------------
  -- massa: duas OCs de R$ 100,00 (10 x 10,00), em dois centros de custo
  -- ---------------------------------------------------------------------
  insert into public.ordens_compra (fornecedor_id, condicao_pagamento_id, status, data_emissao, observacoes, created_by)
  values (v_forn, v_cond3, 'rascunho', '2026-01-10', '[PROVA-PARCELAS] com parcelas', (select auth.uid()))
  returning id into v_oc_com;

  insert into public.oc_itens (ordem_compra_id, insumo_id, quantidade, preco_unitario, centro_custo_id)
  values (v_oc_com, v_ins, 6, 10.00, v_cc);
  insert into public.oc_itens (ordem_compra_id, insumo_id, quantidade, preco_unitario, centro_custo_id)
  values (v_oc_com, v_ins, 4, 10.00, coalesce(v_cc2, v_cc));

  insert into public.ordens_compra (fornecedor_id, condicao_pagamento_id, status, data_emissao, observacoes, created_by)
  values (v_forn, v_cond3, 'rascunho', '2026-01-10', '[PROVA-PARCELAS] sem parcelas', (select auth.uid()))
  returning id into v_oc_sem;

  insert into public.oc_itens (ordem_compra_id, insumo_id, quantidade, preco_unitario, centro_custo_id)
  values (v_oc_sem, v_ins, 10, 10.00, v_cc);

  -- ---------------------------------------------------------------------
  -- 11. vencimento antes da emissão é recusado
  -- ---------------------------------------------------------------------
  begin
    perform public.fn_salvar_parcelas_oc(v_oc_com, '[{"data_vencimento":"2025-12-01","valor":100.00}]'::jsonb);
    insert into prova_parcelas (caso, esperado, obtido, passou)
    values ('11. vencimento antes da emissao', 'recusado', 'aceitou', false);
  exception when others then
    insert into prova_parcelas (caso, esperado, obtido, passou)
    values ('11. vencimento antes da emissao', 'recusado', left(sqlerrm, 60), true);
  end;

  -- soma divergente na OC também é recusada
  begin
    perform public.fn_salvar_parcelas_oc(v_oc_com, '[{"data_vencimento":"2026-02-10","valor":90.00}]'::jsonb);
    insert into prova_parcelas (caso, esperado, obtido, passou)
    values ('11b. soma divergente na OC', 'recusado', 'aceitou', false);
  exception when others then
    insert into prova_parcelas (caso, esperado, obtido, passou)
    values ('11b. soma divergente na OC', 'recusado', left(sqlerrm, 60), true);
  end;

  -- parcelas válidas: a sugestão da condição
  perform public.fn_salvar_parcelas_oc(
    v_oc_com,
    (select jsonb_agg(jsonb_build_object('data_vencimento', data_vencimento, 'valor', valor))
     from public.fn_parcelas_da_condicao(v_cond3, 100.00, '2026-01-10'))
  );

  select string_agg(numero_parcela || ':' || valor || '@' || data_vencimento, ' ' order by numero_parcela)
  into v_txt from public.oc_parcelas where ordem_compra_id = v_oc_com;

  insert into prova_parcelas (caso, esperado, obtido, passou)
  values ('1c. parcelas gravadas na OC',
          '3 parcelas numeradas por vencimento', v_txt,
          (select count(*) = 3 from public.oc_parcelas where ordem_compra_id = v_oc_com));

  -- ---------------------------------------------------------------------
  -- 2 e 3. aprovação: com parcelas herda, sem parcelas não cria
  -- ---------------------------------------------------------------------
  update public.ordens_compra set status = 'pendente_aprovacao' where id in (v_oc_com, v_oc_sem);
  perform public.fn_aprovar_ordem_compra(v_oc_com);
  perform public.fn_aprovar_ordem_compra(v_oc_sem);

  select id into v_lanc_com from public.lancamentos where origem = 'oc' and origem_id = v_oc_com;
  select id into v_lanc_sem from public.lancamentos where origem = 'oc' and origem_id = v_oc_sem;

  select string_agg(lp.numero_parcela || ':' || lp.valor || '@' || lp.data_vencimento, ' ' order by lp.numero_parcela)
  into v_txt from public.lancamento_parcelas lp where lp.lancamento_id = v_lanc_com;

  insert into prova_parcelas (caso, esperado, obtido, passou)
  values ('2. lancamento herda as parcelas da OC',
          (select string_agg(p.numero_parcela || ':' || p.valor || '@' || p.data_vencimento, ' ' order by p.numero_parcela)
           from public.oc_parcelas p where p.ordem_compra_id = v_oc_com),
          v_txt,
          v_txt = (select string_agg(p.numero_parcela || ':' || p.valor || '@' || p.data_vencimento, ' ' order by p.numero_parcela)
                   from public.oc_parcelas p where p.ordem_compra_id = v_oc_com));

  select count(*) into v_int from public.lancamento_parcelas where lancamento_id = v_lanc_sem;
  insert into prova_parcelas (caso, esperado, obtido, passou)
  values ('3. OC sem parcelas gera lancamento sem parcela',
          '0 parcelas', v_int || ' parcelas', v_int = 0);

  -- ---------------------------------------------------------------------
  -- 12. rateio preservado nos dois caminhos
  -- ---------------------------------------------------------------------
  select count(*) || ' centros somando ' || round(sum(valor), 2)
  into v_txt from public.lancamento_rateios where lancamento_id = v_lanc_com;
  insert into prova_parcelas (caso, esperado, obtido, passou)
  values ('12. rateio da OC com parcelas',
          (case when v_cc2 is null then '1' else '2' end) || ' centros somando 100.00',
          v_txt,
          v_txt = (case when v_cc2 is null then '1' else '2' end) || ' centros somando 100.00');

  select count(*) || ' centros somando ' || round(sum(valor), 2)
  into v_txt from public.lancamento_rateios where lancamento_id = v_lanc_sem;
  insert into prova_parcelas (caso, esperado, obtido, passou)
  values ('12b. rateio da OC sem parcelas',
          '1 centros somando 100.00', v_txt, v_txt = '1 centros somando 100.00');

  -- ---------------------------------------------------------------------
  -- 4. lançamento sem parcela não aparece na fila de aprovação
  -- ---------------------------------------------------------------------
  select count(*) into v_int
  from public.lancamento_parcelas lp
  join public.lancamentos l on l.id = lp.lancamento_id
  where l.id in (v_lanc_com, v_lanc_sem)
    and lp.status = 'pendente'
    and l.tipo = 'a_pagar'
    and l.status not in ('cancelado', 'previsto');

  insert into prova_parcelas (caso, esperado, obtido, passou)
  values ('4. fila de aprovacao ignora lancamento previsto',
          '0 parcelas na fila', v_int || ' parcelas na fila', v_int = 0);

  -- ---------------------------------------------------------------------
  -- 5. parcela de lançamento previsto não pode ser aprovada
  -- ---------------------------------------------------------------------
  select id into v_parcela from public.lancamento_parcelas
  where lancamento_id = v_lanc_com order by numero_parcela limit 1;

  begin
    perform public.fn_aprovar_parcela(v_parcela);
    insert into prova_parcelas (caso, esperado, obtido, passou)
    values ('5. aprovar parcela de lancamento previsto', 'recusado', 'aprovou', false);
  exception when others then
    insert into prova_parcelas (caso, esperado, obtido, passou)
    values ('5. aprovar parcela de lancamento previsto', 'recusado', left(sqlerrm, 60), true);
  end;

  -- ---------------------------------------------------------------------
  -- 10. parcelas de OC aprovada são imutáveis na OC
  -- ---------------------------------------------------------------------
  begin
    perform public.fn_salvar_parcelas_oc(v_oc_com, '[{"data_vencimento":"2026-03-10","valor":100.00}]'::jsonb);
    insert into prova_parcelas (caso, esperado, obtido, passou)
    values ('10. mexer nas parcelas de OC aprovada', 'recusado', 'aceitou', false);
  exception when others then
    insert into prova_parcelas (caso, esperado, obtido, passou)
    values ('10. mexer nas parcelas de OC aprovada', 'recusado', left(sqlerrm, 60), true);
  end;

  -- ---------------------------------------------------------------------
  -- 6 e 7. definir parcelas no lançamento que nasceu sem elas
  -- ---------------------------------------------------------------------
  begin
    perform public.fn_definir_parcelas_lancamento(v_lanc_sem, '[{"data_vencimento":"2026-02-10","valor":80.00}]'::jsonb);
    insert into prova_parcelas (caso, esperado, obtido, passou)
    values ('6. soma divergente no lancamento', 'recusado', 'aceitou', false);
  exception when others then
    insert into prova_parcelas (caso, esperado, obtido, passou)
    values ('6. soma divergente no lancamento', 'recusado', left(sqlerrm, 60), true);
  end;

  perform public.fn_definir_parcelas_lancamento(
    v_lanc_sem,
    (select jsonb_agg(jsonb_build_object('data_vencimento', data_vencimento, 'valor', valor))
     from public.fn_parcelas_da_condicao(v_cond3, 100.00, '2026-01-10'))
  );

  select count(*) || ' parcelas somando ' || round(sum(valor), 2)
  into v_txt from public.lancamento_parcelas where lancamento_id = v_lanc_sem;
  insert into prova_parcelas (caso, esperado, obtido, passou)
  values ('7. definir parcelas no lancamento',
          '3 parcelas somando 100.00', v_txt, v_txt = '3 parcelas somando 100.00');

  select data_vencimento::text into v_txt from public.lancamentos where id = v_lanc_sem;
  insert into prova_parcelas (caso, esperado, obtido, passou)
  values ('7b. vencimento do lancamento vira o menor das parcelas',
          (select min(data_vencimento)::text from public.lancamento_parcelas where lancamento_id = v_lanc_sem),
          v_txt,
          v_txt = (select min(data_vencimento)::text from public.lancamento_parcelas where lancamento_id = v_lanc_sem));

  select status into v_txt from public.lancamentos where id = v_lanc_sem;
  insert into prova_parcelas (caso, esperado, obtido, passou)
  values ('7c. definir parcelas NAO torna previsto em a_pagar',
          'previsto', v_txt, v_txt = 'previsto');

  -- ---------------------------------------------------------------------
  -- 8. recebimento com NF divergente: diferença na última em aberto
  -- ---------------------------------------------------------------------
  -- Tolerância vem de configuracoes; usamos +0,01 para caber em qualquer valor.
  perform public.fn_registrar_recebimento(v_oc_com, 'PROVA-NF-1', 100.01, '2026-01-20');

  select string_agg(valor::text, ' + ' order by numero_parcela) || ' = ' || round(sum(valor), 2)
  into v_txt from public.lancamento_parcelas where lancamento_id = v_lanc_com;
  insert into prova_parcelas (caso, esperado, obtido, passou)
  values ('8. NF 0,01 acima cai na ultima parcela',
          '33.33 + 33.33 + 33.35 = 100.01', v_txt,
          v_txt = '33.33 + 33.33 + 33.35 = 100.01');

  select round(valor, 2) into v_num from public.lancamentos where id = v_lanc_com;
  insert into prova_parcelas (caso, esperado, obtido, passou)
  values ('8b. valor do lancamento = valor da NF',
          '100.01', v_num::text, v_num = 100.01);

  -- ---------------------------------------------------------------------
  -- 9. parcela aprovada trava as parcelas
  -- ---------------------------------------------------------------------
  select id into v_parcela from public.lancamento_parcelas
  where lancamento_id = v_lanc_com order by numero_parcela limit 1;

  perform public.fn_aprovar_parcela(v_parcela);
  select status into v_txt from public.lancamento_parcelas where id = v_parcela;
  insert into prova_parcelas (caso, esperado, obtido, passou)
  values ('9. aprovar parcela apos recebimento', 'aprovado', v_txt, v_txt = 'aprovado');

  begin
    perform public.fn_definir_parcelas_lancamento(v_lanc_com, '[{"data_vencimento":"2026-04-10","valor":100.01}]'::jsonb);
    insert into prova_parcelas (caso, esperado, obtido, passou)
    values ('9b. trocar parcelas com uma aprovada', 'recusado', 'aceitou', false);
  exception when others then
    insert into prova_parcelas (caso, esperado, obtido, passou)
    values ('9b. trocar parcelas com uma aprovada', 'recusado', left(sqlerrm, 60), true);
  end;

  update public.lancamento_parcelas set status = 'pago' where id = v_parcela;
  begin
    perform public.fn_definir_parcelas_lancamento(v_lanc_com, '[{"data_vencimento":"2026-04-10","valor":100.01}]'::jsonb);
    insert into prova_parcelas (caso, esperado, obtido, passou)
    values ('9c. trocar parcelas com uma paga', 'recusado', 'aceitou', false);
  exception when others then
    insert into prova_parcelas (caso, esperado, obtido, passou)
    values ('9c. trocar parcelas com uma paga', 'recusado', left(sqlerrm, 60), true);
  end;

  -- ---------------------------------------------------------------------
  -- limpeza: apaga a massa criada (audit_log é append-only e fica)
  -- ---------------------------------------------------------------------
  delete from public.recebimentos where ordem_compra_id in (v_oc_com, v_oc_sem);
  delete from public.lancamento_parcelas where lancamento_id in (v_lanc_com, v_lanc_sem);
  delete from public.lancamento_rateios where lancamento_id in (v_lanc_com, v_lanc_sem);
  delete from public.lancamentos where id in (v_lanc_com, v_lanc_sem);
  delete from public.oc_parcelas where ordem_compra_id in (v_oc_com, v_oc_sem);
  delete from public.oc_itens where ordem_compra_id in (v_oc_com, v_oc_sem);
  delete from public.ordens_compra where id in (v_oc_com, v_oc_sem);
end $prova$;

select
  caso,
  esperado,
  obtido,
  case when passou then 'PASSOU' else 'FALHOU' end as resultado
from prova_parcelas
order by ordem;
