-- Prova de aceite das três datas (criação, compra, mês de referência).
--
-- Roda contra o banco vivo, cria a própria massa ([PROVA-DATAS] nas
-- observações), verifica cada regra e apaga o que criou. Pode rodar quantas
-- vezes quiser. Cobre:
--
--   1. data de criação é imutável (UPDATE é ignorado, não estoura)
--   2. mês de referência normalizado no dia 1 e check recusando outro dia
--   3. lançamento de OC herda data da compra E mês de referência
--   4. lançamento avulso exige as duas datas
--   5. alterar o mês no lançamento reflete na OC (e vice-versa)
--   6. mês travado depois do pagamento aprovado (manda desaprovar)
--   7. mês travado depois do pagamento pago (manda estornar)
--   8. parcela não pode vencer antes da DATA DA COMPRA
--   9. DRE agrupa pelo mês de referência, não pela data de criação
--
-- IMPORTANTE: as funções checam tem_permissao(), que depende de auth.uid().
-- Rodando fora de uma sessão autenticada (SQL editor, MCP), o bloco abaixo
-- assume o primeiro usuário ativo com compras.ordens:aprovar.

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

create temp table if not exists prova_datas (
  ordem int generated always as identity,
  caso text,
  esperado text,
  obtido text,
  passou boolean
);
truncate prova_datas;

do $prova$
declare
  v_forn uuid; v_ins uuid; v_cc uuid; v_cond uuid;
  v_pix uuid; v_dinheiro uuid;
  v_oc uuid; v_oc_din uuid;
  v_lanc uuid; v_lanc_din uuid; v_lanc_avulso uuid;
  v_parcela uuid;
  v_criado_em timestamptz; v_criado_depois timestamptz;
  v_base_out numeric; v_base_jul numeric;
  v_txt text; v_data date; v_num numeric; v_int int;
begin
  select id into v_forn from public.fornecedores where ativo order by razao_social limit 1;
  select id into v_ins from public.insumos where ativo order by nome limit 1;
  select id into v_cc from public.centros_custo where ativo order by codigo nulls last limit 1;
  select id into v_cond from public.condicoes_pagamento where ativo order by descricao limit 1;
  select id into v_pix from public.formas_pagamento where tipo = 'bancario' and ativo order by nome limit 1;
  select id into v_dinheiro from public.formas_pagamento where tipo = 'dinheiro' and ativo order by nome limit 1;

  if v_forn is null or v_ins is null or v_cc is null or v_cond is null
     or v_pix is null or v_dinheiro is null then
    raise exception 'Massa base insuficiente para a prova';
  end if;

  -- Base da DRE ANTES da massa: o banco pode ter lancamento real nesses meses,
  -- entao a prova mede a DIFERENCA que ela mesma provocou.
  select coalesce(sum(total), 0) into v_base_out
  from public.fn_rel_dre('2026-10-01', '2026-11-01') where tipo = 'a_pagar';
  select coalesce(sum(total), 0) into v_base_jul
  from public.fn_rel_dre('2026-07-01', '2026-08-01') where tipo = 'a_pagar';

  -- Compra em 31/07 usada em agosto: o caso real que motivou separar as datas.
  v_oc := public.fn_criar_ordem_compra(
    jsonb_build_object(
      'fornecedor_id', v_forn,
      'condicao_pagamento_id', v_cond,
      'forma_pagamento_id', v_pix,
      'data_compra', '2026-07-31',
      'mes_competencia', '2026-08-01',
      'observacoes', '[PROVA-DATAS] bancario'
    ),
    jsonb_build_array(jsonb_build_object(
      'insumo_id', v_ins, 'quantidade', 100, 'preco_unitario', 10.00,
      'centro_custo_id', v_cc
    ))
  );

  -- ---------------------------------------------------------------------
  -- 1. data de criação é imutável
  -- ---------------------------------------------------------------------
  select created_at into v_criado_em from public.ordens_compra where id = v_oc;
  update public.ordens_compra set created_at = '2020-01-01' where id = v_oc;
  select created_at into v_criado_depois from public.ordens_compra where id = v_oc;

  insert into prova_datas (caso, esperado, obtido, passou)
  values ('1. UPDATE em created_at da OC e ignorado',
          v_criado_em::text, v_criado_depois::text, v_criado_em = v_criado_depois);

  -- ---------------------------------------------------------------------
  -- 2. mês de referência normalizado e com check
  -- ---------------------------------------------------------------------
  select mes_competencia into v_data from public.ordens_compra where id = v_oc;
  insert into prova_datas (caso, esperado, obtido, passou)
  values ('2. mes de referencia guardado no dia 1', '2026-08-01', v_data::text, v_data = '2026-08-01');

  begin
    update public.ordens_compra set mes_competencia = '2026-08-15' where id = v_oc;
    insert into prova_datas (caso, esperado, obtido, passou)
    values ('2b. check recusa mes fora do dia 1', 'recusado', 'aceitou', false);
  exception when others then
    insert into prova_datas (caso, esperado, obtido, passou)
    values ('2b. check recusa mes fora do dia 1', 'recusado', left(sqlerrm, 40), true);
  end;

  -- ---------------------------------------------------------------------
  -- 8. parcela não pode vencer antes da data da compra
  -- ---------------------------------------------------------------------
  begin
    perform public.fn_salvar_parcelas_oc(
      v_oc, '[{"data_vencimento":"2026-07-30","valor":1000.00}]'::jsonb
    );
    insert into prova_datas (caso, esperado, obtido, passou)
    values ('8. vencimento antes da data da compra', 'recusado', 'aceitou', false);
  exception when others then
    insert into prova_datas (caso, esperado, obtido, passou)
    values ('8. vencimento antes da data da compra', 'recusado', left(sqlerrm, 45), true);
  end;

  perform public.fn_salvar_parcelas_oc(
    v_oc,
    '[{"data_vencimento":"2026-08-15","valor":500.00},{"data_vencimento":"2026-09-15","valor":500.00}]'::jsonb
  );

  -- ---------------------------------------------------------------------
  -- 3. lançamento herda as duas datas da OC
  -- ---------------------------------------------------------------------
  update public.ordens_compra set status = 'pendente_aprovacao' where id = v_oc;
  perform public.fn_aprovar_ordem_compra(v_oc);
  select id into v_lanc from public.lancamentos where origem_id = v_oc and origem = 'oc';

  select data_compra::text || ' / ' || mes_competencia::text into v_txt
  from public.lancamentos where id = v_lanc;
  insert into prova_datas (caso, esperado, obtido, passou)
  values ('3. lancamento herda compra e mes da OC',
          '2026-07-31 / 2026-08-01', v_txt, v_txt = '2026-07-31 / 2026-08-01');

  -- A data de criação do lançamento é dele, não da OC.
  select (l.created_at::date = (now() at time zone 'America/Rio_Branco')::date)
  into v_txt from public.lancamentos l where l.id = v_lanc;
  insert into prova_datas (caso, esperado, obtido, passou)
  values ('3b. criacao do lancamento e do proprio lancamento', 'true', v_txt, v_txt = 'true');

  -- ---------------------------------------------------------------------
  -- 4. lançamento avulso exige as duas datas
  -- ---------------------------------------------------------------------
  begin
    perform public.fn_salvar_lancamento(
      null,
      jsonb_build_object('tipo','a_pagar','descricao','[PROVA-DATAS] sem data','valor',100),
      '[{"numero_parcela":1,"valor":100,"data_vencimento":"2026-09-10"}]'::jsonb,
      '[]'::jsonb
    );
    insert into prova_datas (caso, esperado, obtido, passou)
    values ('4. avulso sem data da compra', 'recusado', 'aceitou', false);
  exception when others then
    insert into prova_datas (caso, esperado, obtido, passou)
    values ('4. avulso sem data da compra', 'recusado', left(sqlerrm, 45), true);
  end;

  v_lanc_avulso := public.fn_salvar_lancamento(
    null,
    jsonb_build_object(
      'tipo','a_pagar','descricao','[PROVA-DATAS] avulso','valor',300,
      'data_compra','2026-07-31','mes_competencia','2026-08-01',
      'forma_pagamento_id', v_pix
    ),
    '[{"numero_parcela":1,"valor":300,"data_vencimento":"2026-09-10"}]'::jsonb,
    jsonb_build_array(jsonb_build_object('centro_custo_id', v_cc, 'valor', 300))
  );

  select data_compra::text || ' / ' || mes_competencia::text into v_txt
  from public.lancamentos where id = v_lanc_avulso;
  insert into prova_datas (caso, esperado, obtido, passou)
  values ('4b. avulso guarda as duas datas',
          '2026-07-31 / 2026-08-01', v_txt, v_txt = '2026-07-31 / 2026-08-01');

  -- Mês solto (sem dia) é normalizado no dia 1 pela própria função.
  perform public.fn_salvar_lancamento(
    v_lanc_avulso,
    jsonb_build_object(
      'tipo','a_pagar','descricao','[PROVA-DATAS] avulso','valor',300,
      'data_compra','2026-07-31','mes_competencia','2026-09-20',
      'forma_pagamento_id', v_pix
    ),
    '[{"numero_parcela":1,"valor":300,"data_vencimento":"2026-10-10"}]'::jsonb,
    jsonb_build_array(jsonb_build_object('centro_custo_id', v_cc, 'valor', 300))
  );
  select mes_competencia into v_data from public.lancamentos where id = v_lanc_avulso;
  insert into prova_datas (caso, esperado, obtido, passou)
  values ('4c. mes informado no meio do mes e normalizado', '2026-09-01', v_data::text, v_data = '2026-09-01');

  -- ---------------------------------------------------------------------
  -- 5. alterar o mês nos dois sentidos
  -- ---------------------------------------------------------------------
  perform public.fn_alterar_mes_competencia('lancamento', v_lanc, '2026-09-01');
  select oc.mes_competencia::text || ' / ' || l.mes_competencia::text into v_txt
  from public.ordens_compra oc join public.lancamentos l on l.id = v_lanc
  where oc.id = v_oc;
  insert into prova_datas (caso, esperado, obtido, passou)
  values ('5. mudar no lancamento reflete na OC',
          '2026-09-01 / 2026-09-01', v_txt, v_txt = '2026-09-01 / 2026-09-01');

  perform public.fn_alterar_mes_competencia('ordem_compra', v_oc, '2026-08-01');
  select oc.mes_competencia::text || ' / ' || l.mes_competencia::text into v_txt
  from public.ordens_compra oc join public.lancamentos l on l.id = v_lanc
  where oc.id = v_oc;
  insert into prova_datas (caso, esperado, obtido, passou)
  values ('5b. mudar na OC reflete no lancamento',
          '2026-08-01 / 2026-08-01', v_txt, v_txt = '2026-08-01 / 2026-08-01');

  -- ---------------------------------------------------------------------
  -- 6. travado depois do pagamento aprovado
  -- ---------------------------------------------------------------------
  select id into v_parcela from public.lancamento_parcelas
  where lancamento_id = v_lanc order by numero_parcela limit 1;
  perform public.fn_aprovar_parcela(v_parcela);

  begin
    perform public.fn_alterar_mes_competencia('lancamento', v_lanc, '2026-10-01');
    insert into prova_datas (caso, esperado, obtido, passou)
    values ('6. alterar mes com pagamento aprovado', 'recusado', 'aceitou', false);
  exception when others then
    insert into prova_datas (caso, esperado, obtido, passou)
    values ('6. alterar mes com pagamento aprovado', 'recusado (desaprove)', left(sqlerrm, 45),
            sqlerrm ilike '%esaprove%');
  end;

  -- Desaprovando, volta a poder.
  perform public.fn_desaprovar_parcela(v_parcela, 'prova: liberar mes');
  perform public.fn_alterar_mes_competencia('lancamento', v_lanc, '2026-10-01');
  select mes_competencia into v_data from public.lancamentos where id = v_lanc;
  insert into prova_datas (caso, esperado, obtido, passou)
  values ('6b. desaprovado, o mes volta a mudar', '2026-10-01', v_data::text, v_data = '2026-10-01');

  -- ---------------------------------------------------------------------
  -- 7. travado depois do pagamento pago (dinheiro: nasce aprovado)
  -- ---------------------------------------------------------------------
  v_oc_din := public.fn_criar_ordem_compra(
    jsonb_build_object(
      'fornecedor_id', v_forn,
      'condicao_pagamento_id', v_cond,
      'forma_pagamento_id', v_dinheiro,
      'data_compra', '2026-07-31',
      'mes_competencia', '2026-07-01',
      'observacoes', '[PROVA-DATAS] dinheiro'
    ),
    jsonb_build_array(jsonb_build_object(
      'insumo_id', v_ins, 'quantidade', 10, 'preco_unitario', 10.00,
      'centro_custo_id', v_cc
    ))
  );
  perform public.fn_salvar_parcelas_oc(
    v_oc_din, '[{"data_vencimento":"2026-08-10","valor":100.00}]'::jsonb
  );
  update public.ordens_compra set status = 'pendente_aprovacao' where id = v_oc_din;
  perform public.fn_aprovar_ordem_compra(v_oc_din);
  select id into v_lanc_din from public.lancamentos where origem_id = v_oc_din and origem = 'oc';

  begin
    perform public.fn_alterar_mes_competencia('lancamento', v_lanc_din, '2026-09-01');
    insert into prova_datas (caso, esperado, obtido, passou)
    values ('7. dinheiro nasce aprovado: mes travado', 'recusado', 'aceitou', false);
  exception when others then
    insert into prova_datas (caso, esperado, obtido, passou)
    values ('7. dinheiro nasce aprovado: mes travado', 'recusado (desaprove)', left(sqlerrm, 45),
            sqlerrm ilike '%esaprove%');
  end;

  -- Paga a parcela e confirma que a mensagem passa a mandar estornar.
  select id into v_parcela from public.lancamento_parcelas
  where lancamento_id = v_lanc_din limit 1;
  update public.lancamento_parcelas set status = 'pago',
    data_pagamento = '2026-08-10', pago_em = now()
  where id = v_parcela;

  begin
    perform public.fn_alterar_mes_competencia('lancamento', v_lanc_din, '2026-09-01');
    insert into prova_datas (caso, esperado, obtido, passou)
    values ('7b. pago: mes travado mandando estornar', 'recusado', 'aceitou', false);
  exception when others then
    insert into prova_datas (caso, esperado, obtido, passou)
    values ('7b. pago: mes travado mandando estornar', 'recusado (estorne)', left(sqlerrm, 45),
            sqlerrm ilike '%storne%');
  end;

  -- ---------------------------------------------------------------------
  -- 9. DRE agrupa pelo mês de referência
  -- ---------------------------------------------------------------------
  -- O lançamento bancário está em 10/2026 e o avulso em 09/2026, os dois
  -- criados hoje (07/2026): a DRE de outubro tem que ver só o primeiro.
  select coalesce(sum(total), 0) - v_base_out into v_num
  from public.fn_rel_dre('2026-10-01', '2026-11-01')
  where tipo = 'a_pagar';
  insert into prova_datas (caso, esperado, obtido, passou)
  values ('9. DRE de 10/2026 pelo mes de referencia (delta)', '1000.00', v_num::text, v_num = 1000.00);

  select coalesce(sum(total), 0) - v_base_jul into v_num
  from public.fn_rel_dre('2026-07-01', '2026-08-01')
  where tipo = 'a_pagar';
  insert into prova_datas (caso, esperado, obtido, passou)
  values ('9b. DRE do mes da criacao ve so o de 07/2026 (delta)', '100.00', v_num::text, v_num = 100.00);

  -- ---------------------------------------------------------------------
  -- limpeza
  -- ---------------------------------------------------------------------
  delete from public.anexo_vinculos where entidade_id in (
    select id from public.lancamento_parcelas
    where lancamento_id in (v_lanc, v_lanc_din, v_lanc_avulso)
  );
  delete from public.lancamento_parcelas where lancamento_id in (v_lanc, v_lanc_din, v_lanc_avulso);
  delete from public.lancamento_rateios where lancamento_id in (v_lanc, v_lanc_din, v_lanc_avulso);
  delete from public.anexo_vinculos where entidade_id in (v_lanc, v_lanc_din, v_lanc_avulso);
  delete from public.lancamentos where id in (v_lanc, v_lanc_din, v_lanc_avulso);
  delete from public.oc_parcelas where ordem_compra_id in (v_oc, v_oc_din);
  delete from public.oc_itens where ordem_compra_id in (v_oc, v_oc_din);
  delete from public.anexo_vinculos where entidade_id in (v_oc, v_oc_din);
  delete from public.ordens_compra where id in (v_oc, v_oc_din);
end $prova$;

select
  caso,
  esperado,
  obtido,
  case when passou then 'PASSOU' else 'FALHOU' end as resultado
from prova_datas
order by ordem;
