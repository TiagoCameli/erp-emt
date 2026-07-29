-- Prova de aceite do pagamento por forma de pagamento.
--
-- Roda contra o banco vivo, cria a própria massa ([PROVA-FORMA] nas
-- observações), verifica cada caminho e apaga o que criou. Pode rodar quantas
-- vezes quiser. Cobre:
--
--   1. forma bancária: lançamento a_pagar, parcelas pendentes, entra na fila
--   2. dinheiro: parcelas nascem aprovadas, NÃO entram na fila
--   3. cartão de crédito: nasce pago, sem conta bancária, pago na emissão
--   4. OC sem parcelas: lançamento previsto e fora de tudo
--   5. parcela de lançamento previsto (soma que não fecha) não é aprovável
--   6. definir parcelas depois aplica a regra da forma
--   7. forma não informada cai no caminho seguro (fila de aprovação)
--   8. recebimento de OC já paga no cartão não estoura e fecha a OC em 'pago'
--   9. divergência de NF sem parcela em aberto vira registro, não reescrita
--
-- IMPORTANTE: as funções checam tem_permissao(), que depende de auth.uid().
-- Rodando fora de uma sessão autenticada (SQL editor, MCP), o bloco abaixo
-- assume o primeiro usuário ativo com compras.ordens:aprovar.
--
-- Sobra no banco depois da prova: só as linhas de audit_log (append-only).

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

create temp table if not exists prova_forma (
  ordem int generated always as identity,
  caso text,
  esperado text,
  obtido text,
  passou boolean
);
truncate prova_forma;

do $prova$
declare
  v_forn uuid; v_ins uuid; v_cc uuid; v_cond uuid;
  v_pix uuid; v_dinheiro uuid; v_cartao uuid;
  v_oc_pix uuid; v_oc_din uuid; v_oc_cart uuid; v_oc_sem_forma uuid; v_oc_sem_parc uuid;
  v_lanc_pix uuid; v_lanc_din uuid; v_lanc_cart uuid; v_lanc_sem_forma uuid; v_lanc_sem_parc uuid;
  v_parcela uuid;
  v_txt text; v_num numeric; v_int int; v_data date;
begin
  select id into v_forn from public.fornecedores where ativo order by razao_social limit 1;
  select id into v_ins from public.insumos where ativo order by nome limit 1;
  select id into v_cc from public.centros_custo where ativo order by codigo nulls last limit 1;
  select id into v_cond from public.condicoes_pagamento where ativo order by descricao limit 1;

  select id into v_pix from public.formas_pagamento where tipo = 'bancario' and ativo order by nome limit 1;
  select id into v_dinheiro from public.formas_pagamento where tipo = 'dinheiro' and ativo order by nome limit 1;
  select id into v_cartao from public.formas_pagamento where tipo = 'cartao_credito' and ativo order by nome limit 1;

  if v_forn is null or v_ins is null or v_cc is null or v_cond is null then
    raise exception 'Massa base insuficiente (fornecedor, insumo, centro de custo ou condicao)';
  end if;
  if v_pix is null or v_dinheiro is null or v_cartao is null then
    raise exception 'Catalogo de formas de pagamento sem os tres tipos (bancario, dinheiro, cartao_credito)';
  end if;

  -- massa: 5 OCs de R$ 1.000,00, uma por caminho
  insert into public.ordens_compra (fornecedor_id, condicao_pagamento_id, forma_pagamento_id, status, data_emissao, observacoes, created_by)
  values (v_forn, v_cond, v_pix, 'rascunho', '2026-01-10', '[PROVA-FORMA] bancario', (select auth.uid()))
  returning id into v_oc_pix;
  insert into public.ordens_compra (fornecedor_id, condicao_pagamento_id, forma_pagamento_id, status, data_emissao, observacoes, created_by)
  values (v_forn, v_cond, v_dinheiro, 'rascunho', '2026-01-10', '[PROVA-FORMA] dinheiro', (select auth.uid()))
  returning id into v_oc_din;
  insert into public.ordens_compra (fornecedor_id, condicao_pagamento_id, forma_pagamento_id, status, data_emissao, observacoes, created_by)
  values (v_forn, v_cond, v_cartao, 'rascunho', '2026-01-10', '[PROVA-FORMA] cartao', (select auth.uid()))
  returning id into v_oc_cart;
  insert into public.ordens_compra (fornecedor_id, condicao_pagamento_id, status, data_emissao, observacoes, created_by)
  values (v_forn, v_cond, 'rascunho', '2026-01-10', '[PROVA-FORMA] sem forma', (select auth.uid()))
  returning id into v_oc_sem_forma;
  insert into public.ordens_compra (fornecedor_id, condicao_pagamento_id, forma_pagamento_id, status, data_emissao, observacoes, created_by)
  values (v_forn, v_cond, v_dinheiro, 'rascunho', '2026-01-10', '[PROVA-FORMA] sem parcelas', (select auth.uid()))
  returning id into v_oc_sem_parc;

  insert into public.oc_itens (ordem_compra_id, insumo_id, quantidade, preco_unitario, centro_custo_id)
  select id, v_ins, 100, 10.00, v_cc
  from public.ordens_compra
  where id in (v_oc_pix, v_oc_din, v_oc_cart, v_oc_sem_forma, v_oc_sem_parc);

  -- parcelas na OC: 2 x 500,00 (a OC "sem parcelas" fica sem nenhuma)
  perform public.fn_salvar_parcelas_oc(
    v_oc_pix,
    '[{"data_vencimento":"2026-02-10","valor":500.00},{"data_vencimento":"2026-03-10","valor":500.00}]'::jsonb
  );
  perform public.fn_salvar_parcelas_oc(
    v_oc_din,
    '[{"data_vencimento":"2026-02-10","valor":500.00},{"data_vencimento":"2026-03-10","valor":500.00}]'::jsonb
  );
  perform public.fn_salvar_parcelas_oc(
    v_oc_cart,
    '[{"data_vencimento":"2026-02-10","valor":500.00},{"data_vencimento":"2026-03-10","valor":500.00}]'::jsonb
  );
  perform public.fn_salvar_parcelas_oc(
    v_oc_sem_forma,
    '[{"data_vencimento":"2026-02-10","valor":500.00},{"data_vencimento":"2026-03-10","valor":500.00}]'::jsonb
  );

  update public.ordens_compra set status = 'pendente_aprovacao'
  where id in (v_oc_pix, v_oc_din, v_oc_cart, v_oc_sem_forma, v_oc_sem_parc);

  perform public.fn_aprovar_ordem_compra(v_oc_pix);
  perform public.fn_aprovar_ordem_compra(v_oc_din);
  perform public.fn_aprovar_ordem_compra(v_oc_cart);
  perform public.fn_aprovar_ordem_compra(v_oc_sem_forma);
  perform public.fn_aprovar_ordem_compra(v_oc_sem_parc);

  select id into v_lanc_pix from public.lancamentos where origem_id = v_oc_pix;
  select id into v_lanc_din from public.lancamentos where origem_id = v_oc_din;
  select id into v_lanc_cart from public.lancamentos where origem_id = v_oc_cart;
  select id into v_lanc_sem_forma from public.lancamentos where origem_id = v_oc_sem_forma;
  select id into v_lanc_sem_parc from public.lancamentos where origem_id = v_oc_sem_parc;

  -- ---------------------------------------------------------------------
  -- 1. forma bancária: a_pagar com parcelas pendentes, e entra na fila
  -- ---------------------------------------------------------------------
  select status into v_txt from public.lancamentos where id = v_lanc_pix;
  insert into prova_forma (caso, esperado, obtido, passou)
  values ('1. bancario: status do lancamento', 'a_pagar', v_txt, v_txt = 'a_pagar');

  select string_agg(distinct status, ',') into v_txt
  from public.lancamento_parcelas where lancamento_id = v_lanc_pix;
  insert into prova_forma (caso, esperado, obtido, passou)
  values ('1b. bancario: status das parcelas', 'pendente', v_txt, v_txt = 'pendente');

  select count(*) into v_int
  from public.lancamento_parcelas p
  join public.lancamentos l on l.id = p.lancamento_id
  where p.lancamento_id = v_lanc_pix
    and p.status = 'pendente' and l.tipo = 'a_pagar'
    and l.status not in ('cancelado', 'previsto');
  insert into prova_forma (caso, esperado, obtido, passou)
  values ('1c. bancario: parcelas na fila de aprovacao', '2', v_int::text, v_int = 2);

  -- ---------------------------------------------------------------------
  -- 2. dinheiro: nasce aprovado e não passa pela fila
  -- ---------------------------------------------------------------------
  select status into v_txt from public.lancamentos where id = v_lanc_din;
  insert into prova_forma (caso, esperado, obtido, passou)
  values ('2. dinheiro: status do lancamento', 'a_pagar', v_txt, v_txt = 'a_pagar');

  select string_agg(distinct status, ',') into v_txt
  from public.lancamento_parcelas where lancamento_id = v_lanc_din;
  insert into prova_forma (caso, esperado, obtido, passou)
  values ('2b. dinheiro: parcelas nascem aprovadas', 'aprovado', v_txt, v_txt = 'aprovado');

  select count(*) into v_int
  from public.lancamento_parcelas
  where lancamento_id = v_lanc_din and status = 'pendente';
  insert into prova_forma (caso, esperado, obtido, passou)
  values ('2c. dinheiro: nada na fila de aprovacao', '0', v_int::text, v_int = 0);

  select count(*) into v_int
  from public.lancamento_parcelas
  where lancamento_id = v_lanc_din and status = 'aprovado' and aprovado_por is not null;
  insert into prova_forma (caso, esperado, obtido, passou)
  values ('2d. dinheiro: aprovacao tem autor', '2', v_int::text, v_int = 2);

  -- ---------------------------------------------------------------------
  -- 3. cartão de crédito: nasce pago, sem conta, na data de emissão
  -- ---------------------------------------------------------------------
  select status into v_txt from public.lancamentos where id = v_lanc_cart;
  insert into prova_forma (caso, esperado, obtido, passou)
  values ('3. cartao: status do lancamento', 'pago', v_txt, v_txt = 'pago');

  select string_agg(distinct status, ','), count(*) filter (where conta_bancaria_id is not null)
  into v_txt, v_int
  from public.lancamento_parcelas where lancamento_id = v_lanc_cart;
  insert into prova_forma (caso, esperado, obtido, passou)
  values ('3b. cartao: parcelas nascem pagas', 'pago', v_txt, v_txt = 'pago');
  insert into prova_forma (caso, esperado, obtido, passou)
  values ('3c. cartao: sem conta bancaria debitada', '0', v_int::text, v_int = 0);

  select l.data_emissao into v_data from public.lancamentos l where l.id = v_lanc_cart;
  select count(*) into v_int
  from public.lancamento_parcelas
  where lancamento_id = v_lanc_cart and data_pagamento = v_data;
  insert into prova_forma (caso, esperado, obtido, passou)
  values ('3d. cartao: pago na data da compra', '2', v_int::text, v_int = 2);

  select status into v_txt from public.ordens_compra where id = v_oc_cart;
  insert into prova_forma (caso, esperado, obtido, passou)
  values ('3e. cartao: OC segue aprovada (nao recebida)', 'aprovado', v_txt, v_txt = 'aprovado');

  -- ---------------------------------------------------------------------
  -- 4. OC sem parcelas: lançamento previsto e fora de tudo
  -- ---------------------------------------------------------------------
  select status into v_txt from public.lancamentos where id = v_lanc_sem_parc;
  insert into prova_forma (caso, esperado, obtido, passou)
  values ('4. sem parcelas: lancamento previsto', 'previsto', v_txt, v_txt = 'previsto');

  select count(*) into v_int
  from public.lancamento_parcelas where lancamento_id = v_lanc_sem_parc;
  insert into prova_forma (caso, esperado, obtido, passou)
  values ('4b. sem parcelas: nenhuma parcela criada', '0', v_int::text, v_int = 0);

  -- ---------------------------------------------------------------------
  -- 5. previsto por soma que não fecha: parcela não é aprovável
  -- ---------------------------------------------------------------------
  insert into public.lancamento_parcelas (lancamento_id, numero_parcela, valor, data_vencimento, status, created_by)
  values (v_lanc_sem_parc, 1, 100.00, '2026-02-10', 'pendente', (select auth.uid()))
  returning id into v_parcela;
  perform public.fn_aplicar_regra_pagamento(v_lanc_sem_parc);

  select status into v_txt from public.lancamentos where id = v_lanc_sem_parc;
  insert into prova_forma (caso, esperado, obtido, passou)
  values ('5. soma que nao fecha segue previsto', 'previsto', v_txt, v_txt = 'previsto');

  begin
    perform public.fn_aprovar_parcela(v_parcela);
    insert into prova_forma (caso, esperado, obtido, passou)
    values ('5b. aprovar parcela de previsto', 'recusado', 'aceitou', false);
  exception when others then
    insert into prova_forma (caso, esperado, obtido, passou)
    values ('5b. aprovar parcela de previsto', 'recusado', left(sqlerrm, 50), true);
  end;

  delete from public.lancamento_parcelas where id = v_parcela;

  -- ---------------------------------------------------------------------
  -- 6. definir parcelas depois aplica a regra da forma (dinheiro)
  -- ---------------------------------------------------------------------
  perform public.fn_definir_parcelas_lancamento(
    v_lanc_sem_parc,
    '[{"data_vencimento":"2026-02-10","valor":400.00},{"data_vencimento":"2026-03-10","valor":600.00}]'::jsonb
  );

  select status into v_txt from public.lancamentos where id = v_lanc_sem_parc;
  insert into prova_forma (caso, esperado, obtido, passou)
  values ('6. definir parcelas completa o lancamento', 'a_pagar', v_txt, v_txt = 'a_pagar');

  select string_agg(distinct status, ',') into v_txt
  from public.lancamento_parcelas where lancamento_id = v_lanc_sem_parc;
  insert into prova_forma (caso, esperado, obtido, passou)
  values ('6b. definir parcelas em dinheiro nasce aprovado', 'aprovado', v_txt, v_txt = 'aprovado');

  -- ---------------------------------------------------------------------
  -- 7. forma não informada cai no caminho seguro (fila)
  -- ---------------------------------------------------------------------
  select status into v_txt from public.lancamentos where id = v_lanc_sem_forma;
  insert into prova_forma (caso, esperado, obtido, passou)
  values ('7. sem forma: lancamento a_pagar', 'a_pagar', v_txt, v_txt = 'a_pagar');

  select string_agg(distinct status, ',') into v_txt
  from public.lancamento_parcelas where lancamento_id = v_lanc_sem_forma;
  insert into prova_forma (caso, esperado, obtido, passou)
  values ('7b. sem forma: parcelas pendentes (passa pela fila)', 'pendente', v_txt, v_txt = 'pendente');

  -- ---------------------------------------------------------------------
  -- 8 e 9. recebimento da OC paga no cartão: não estoura, fecha em pago,
  -- e a divergência da NF vira registro em vez de reescrever parcela paga
  -- ---------------------------------------------------------------------
  begin
    perform public.fn_registrar_recebimento(v_oc_cart, 'NF-PROVA-FORMA', 1000.10, '2026-02-01');
    insert into prova_forma (caso, esperado, obtido, passou)
    values ('8. recebimento de OC paga no cartao', 'aceito', 'aceito', true);
  exception when others then
    insert into prova_forma (caso, esperado, obtido, passou)
    values ('8. recebimento de OC paga no cartao', 'aceito', left(sqlerrm, 60), false);
  end;

  select status into v_txt from public.ordens_compra where id = v_oc_cart;
  insert into prova_forma (caso, esperado, obtido, passou)
  values ('8b. OC quitada + recebida fecha em pago', 'pago', v_txt, v_txt = 'pago');

  select divergencia_valor into v_num from public.recebimentos where ordem_compra_id = v_oc_cart;
  insert into prova_forma (caso, esperado, obtido, passou)
  values ('9. divergencia registrada no recebimento', '0.10', coalesce(v_num::text, 'nulo'), v_num = 0.10);

  select round(sum(valor), 2) into v_num
  from public.lancamento_parcelas where lancamento_id = v_lanc_cart;
  insert into prova_forma (caso, esperado, obtido, passou)
  values ('9b. parcela paga nao foi reescrita', '1000.00', v_num::text, v_num = 1000.00);

  select status into v_txt from public.lancamentos where id = v_lanc_cart;
  insert into prova_forma (caso, esperado, obtido, passou)
  values ('9c. lancamento pago segue pago', 'pago', v_txt, v_txt = 'pago');

  -- ---------------------------------------------------------------------
  -- limpeza: apaga a massa criada (audit_log é append-only e fica)
  -- ---------------------------------------------------------------------
  delete from public.anexo_vinculos
  where entidade_id in (
    select id from public.lancamento_parcelas
    where lancamento_id in (v_lanc_pix, v_lanc_din, v_lanc_cart, v_lanc_sem_forma, v_lanc_sem_parc)
  );
  delete from public.recebimentos where ordem_compra_id in (v_oc_pix, v_oc_din, v_oc_cart, v_oc_sem_forma, v_oc_sem_parc);
  delete from public.lancamento_parcelas where lancamento_id in (v_lanc_pix, v_lanc_din, v_lanc_cart, v_lanc_sem_forma, v_lanc_sem_parc);
  delete from public.lancamento_rateios where lancamento_id in (v_lanc_pix, v_lanc_din, v_lanc_cart, v_lanc_sem_forma, v_lanc_sem_parc);
  delete from public.anexo_vinculos where entidade_id in (v_lanc_pix, v_lanc_din, v_lanc_cart, v_lanc_sem_forma, v_lanc_sem_parc);
  delete from public.lancamentos where id in (v_lanc_pix, v_lanc_din, v_lanc_cart, v_lanc_sem_forma, v_lanc_sem_parc);
  delete from public.oc_parcelas where ordem_compra_id in (v_oc_pix, v_oc_din, v_oc_cart, v_oc_sem_forma, v_oc_sem_parc);
  delete from public.oc_itens where ordem_compra_id in (v_oc_pix, v_oc_din, v_oc_cart, v_oc_sem_forma, v_oc_sem_parc);
  delete from public.anexo_vinculos where entidade_id in (v_oc_pix, v_oc_din, v_oc_cart, v_oc_sem_forma, v_oc_sem_parc);
  delete from public.ordens_compra where id in (v_oc_pix, v_oc_din, v_oc_cart, v_oc_sem_forma, v_oc_sem_parc);
end $prova$;

select
  caso,
  esperado,
  obtido,
  case when passou then 'PASSOU' else 'FALHOU' end as resultado
from prova_forma
order by ordem;
