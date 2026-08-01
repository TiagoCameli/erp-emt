-- Prova de aceite: "Revisar" no lugar de "Rejeitar" e a janela de pagamento.
--
-- Roda em transacao e termina em ROLLBACK: nada do que ela cria sobrevive.
-- O lancamento e as parcelas sao criados aqui dentro porque o banco nao tem
-- parcela viva de a_pagar (as que existem estao todas em lancamento cancelado).
--
-- As RPCs sao SECURITY DEFINER e checam permissao por tem_permissao(), que le
-- auth.uid() de request.jwt.claims. Por isso a prova seta as claims do usuario
-- em vez de trocar de role: o que se prova aqui e' a REGRA. O grant de execute
-- para authenticated e' conferido a parte, por has_function_privilege.

begin;

select set_config(
  'request.jwt.claims',
  json_build_object(
    'sub', 'c66fca9f-5428-4fb9-855f-dcff548764df',
    'role', 'authenticated'
  )::text,
  true
);

create temp table prova_log (passo text, detalhe text) on commit drop;

do $$
declare
  v_lanc uuid;
  v_p1 uuid;   -- parcela do fluxo de aprovacao e pagamento
  v_p2 uuid;   -- parcela do fluxo de revisao
  v_conta uuid := '40fb6875-ad20-45ed-9346-d1b59e7d9723';
  v_venc date := (now() at time zone 'America/Rio_Branco')::date + 10;
  v_hoje date := (now() at time zone 'America/Rio_Branco')::date;
  v_escolhida date := (now() at time zone 'America/Rio_Branco')::date;
  v_data date;
  v_origem text;
  v_status text;
  v_msg text;
  v_n int;
  v_de date;
  v_para date;
  v_aging_antes numeric;
  v_aging_depois numeric;

  procedure_falhou boolean;
begin
  -- ---------------------------------------------------------------
  -- Cenario
  -- ---------------------------------------------------------------
  insert into public.lancamentos
    (tipo, origem, descricao, valor, status, fornecedor_id, categoria_id,
     forma_pagamento_id, data_vencimento, mes_competencia, data_compra)
  values
    ('a_pagar', 'manual', 'PROVA janela de pagamento', 300.00, 'a_pagar',
     '9d34a92c-9529-4889-837d-e388061c43ca',
     '5ea885cd-d43c-49b2-a456-90d910ca69f1',
     '3b51be5a-0f79-4868-b88d-115f794dd3e3',
     v_venc, date_trunc('month', v_hoje)::date, v_hoje)
  returning id into v_lanc;

  insert into public.lancamento_parcelas
    (lancamento_id, numero_parcela, valor, data_vencimento, status)
  values (v_lanc, 1, 200.00, v_venc, 'pendente')
  returning id into v_p1;

  insert into public.lancamento_parcelas
    (lancamento_id, numero_parcela, valor, data_vencimento, status)
  values (v_lanc, 2, 100.00, v_venc, 'pendente')
  returning id into v_p2;

  -- Saldo para o pagamento passar da checagem de saldo e chegar na de janela.
  update public.contas_bancarias set saldo_inicial = 10000 where id = v_conta;

  -- ---------------------------------------------------------------
  -- 1. Aprovar SEM data: cai no vencimento, e a origem diz isso
  -- ---------------------------------------------------------------
  perform public.fn_aprovar_parcela(v_p1);

  select data_programada, data_programada_origem, status
  into v_data, v_origem, v_status
  from public.lancamento_parcelas where id = v_p1;

  if v_status <> 'aprovado' then
    raise exception 'PROVA 1: status deveria ser aprovado, veio %', v_status;
  end if;
  if v_data <> v_venc then
    raise exception 'PROVA 1: data programada deveria cair no vencimento % , veio %', v_venc, v_data;
  end if;
  if v_origem <> 'vencimento' then
    raise exception 'PROVA 1: origem deveria ser vencimento, veio %', v_origem;
  end if;
  insert into prova_log values ('1. aprovar sem data', 'data=' || v_data || ' origem=' || v_origem);

  -- ---------------------------------------------------------------
  -- 2. A aprovacao deixa rastro na trilha
  -- ---------------------------------------------------------------
  select count(*) into v_n
  from public.parcela_eventos
  where parcela_id = v_p1 and tipo = 'aprovou' and data_para = v_venc;
  if v_n <> 1 then
    raise exception 'PROVA 2: esperava 1 evento aprovou com a data, veio %', v_n;
  end if;
  insert into prova_log values ('2. trilha da aprovacao', '1 evento aprovou com data_para');

  -- ---------------------------------------------------------------
  -- 3. Pagar ANTES da data autorizada: recusado no banco
  -- ---------------------------------------------------------------
  procedure_falhou := false;
  begin
    perform public.fn_pagar_parcela(v_p1, v_conta, v_hoje);
  exception when others then
    procedure_falhou := true;
    v_msg := sqlerrm;
  end;
  if not procedure_falhou then
    raise exception 'PROVA 3: pagar antes da data deveria ser recusado e passou';
  end if;
  if v_msg not like 'Pagamento autorizado para%' then
    raise exception 'PROVA 3: mensagem errada: %', v_msg;
  end if;
  insert into prova_log values ('3. pagar antes da data', v_msg);

  -- ---------------------------------------------------------------
  -- 4. Desaprovar exige motivo
  -- ---------------------------------------------------------------
  procedure_falhou := false;
  begin
    perform public.fn_desaprovar_parcela(v_p1, '   ');
  exception when others then
    procedure_falhou := true; v_msg := sqlerrm;
  end;
  if not procedure_falhou then
    raise exception 'PROVA 4: desaprovar sem motivo deveria ser recusado';
  end if;
  insert into prova_log values ('4. desaprovar sem motivo', v_msg);

  -- ---------------------------------------------------------------
  -- 5. Desaprovar zera a data autorizada e grava o motivo
  -- ---------------------------------------------------------------
  perform public.fn_desaprovar_parcela(v_p1, 'valor divergente da NF');

  select status, data_programada, data_programada_origem
  into v_status, v_data, v_origem
  from public.lancamento_parcelas where id = v_p1;

  if v_status <> 'pendente' or v_data is not null or v_origem is not null then
    raise exception 'PROVA 5: esperava pendente sem data, veio % / % / %', v_status, v_data, v_origem;
  end if;
  select count(*) into v_n from public.parcela_eventos
  where parcela_id = v_p1 and tipo = 'desaprovou' and motivo = 'valor divergente da NF';
  if v_n <> 1 then
    raise exception 'PROVA 5: motivo da desaprovacao nao ficou na trilha (%)', v_n;
  end if;
  insert into prova_log values ('5. desaprovar zera data e grava motivo', 'ok');

  -- ---------------------------------------------------------------
  -- 6. Aprovar COM data escolhida: origem = aprovacao
  -- ---------------------------------------------------------------
  perform public.fn_aprovar_parcela(v_p1, v_escolhida);

  select data_programada, data_programada_origem
  into v_data, v_origem
  from public.lancamento_parcelas where id = v_p1;

  if v_data <> v_escolhida or v_origem <> 'aprovacao' then
    raise exception 'PROVA 6: esperava % / aprovacao, veio % / %', v_escolhida, v_data, v_origem;
  end if;
  insert into prova_log values ('6. aprovar com data escolhida', 'data=' || v_data || ' origem=' || v_origem);

  -- ---------------------------------------------------------------
  -- 7. Pagar NA data autorizada: passa
  -- ---------------------------------------------------------------
  perform public.fn_pagar_parcela(v_p1, v_conta, v_escolhida);
  select status into v_status from public.lancamento_parcelas where id = v_p1;
  if v_status <> 'pago' then
    raise exception 'PROVA 7: deveria estar pago, veio %', v_status;
  end if;
  insert into prova_log values ('7. pagar na data autorizada', 'pago');

  -- ---------------------------------------------------------------
  -- 8. Parcela paga nao muda mais de data
  -- ---------------------------------------------------------------
  procedure_falhou := false;
  begin
    perform public.fn_reprogramar_parcela(v_p1, v_hoje + 5, 'tentativa indevida');
  exception when others then
    procedure_falhou := true; v_msg := sqlerrm;
  end;
  if not procedure_falhou then
    raise exception 'PROVA 8: reprogramar parcela paga deveria ser recusado';
  end if;
  insert into prova_log values ('8. parcela paga nao reprograma', v_msg);

  -- ---------------------------------------------------------------
  -- 9. Revisar exige motivo
  -- ---------------------------------------------------------------
  procedure_falhou := false;
  begin
    perform public.fn_revisar_parcela(v_p2, '');
  exception when others then
    procedure_falhou := true; v_msg := sqlerrm;
  end;
  if not procedure_falhou then
    raise exception 'PROVA 9: revisar sem motivo deveria ser recusado';
  end if;
  insert into prova_log values ('9. revisar sem motivo', v_msg);

  -- ---------------------------------------------------------------
  -- 10. Revisar tira da fila sem cancelar nada, com motivo na trilha
  -- ---------------------------------------------------------------
  -- Total do aging ANTES de revisar, para o passo 12 comparar.
  select coalesce(sum(a.total), 0) into v_aging_antes
  from public.fn_rel_aging() a where a.tipo = 'a_pagar';

  perform public.fn_revisar_parcela(v_p2, 'falta anexo da nota');

  select status into v_status from public.lancamento_parcelas where id = v_p2;
  if v_status <> 'em_revisao' then
    raise exception 'PROVA 10: esperava em_revisao, veio %', v_status;
  end if;
  select count(*) into v_n from public.parcela_eventos
  where parcela_id = v_p2 and tipo = 'revisou' and motivo = 'falta anexo da nota';
  if v_n <> 1 then
    raise exception 'PROVA 10: motivo da revisao nao ficou na trilha (%)', v_n;
  end if;
  -- O lancamento continua vivo: revisar nao cancela.
  select status into v_status from public.lancamentos where id = v_lanc;
  if v_status = 'cancelado' then
    raise exception 'PROVA 10: revisar nao pode cancelar o lancamento';
  end if;
  insert into prova_log values ('10. revisar', 'em_revisao, motivo na trilha, lancamento ' || v_status);

  -- ---------------------------------------------------------------
  -- 11. Parcela em revisao nao pode ser aprovada direto nem paga
  -- ---------------------------------------------------------------
  procedure_falhou := false;
  begin
    perform public.fn_aprovar_parcela(v_p2);
  exception when others then
    procedure_falhou := true; v_msg := sqlerrm;
  end;
  if not procedure_falhou then
    raise exception 'PROVA 11: aprovar parcela em revisao deveria ser recusado';
  end if;
  insert into prova_log values ('11. aprovar em revisao', v_msg);

  -- ---------------------------------------------------------------
  -- 12. Em revisao continua contando no aging (nao sai da previsao)
  -- ---------------------------------------------------------------
  -- Desde 01/08/2026 fn_rel_aging agrega por FAIXA, nao por data (migration
  -- 20260801160001), entao nao da mais para procurar a linha do v_venc. A
  -- pergunta continua a mesma e a resposta ficou mais forte: o total a pagar
  -- nao pode ter caido ao revisar. Se em_revisao saisse do aging, sumiriam os
  -- R$ 100,00 da p2.
  select coalesce(sum(a.total), 0) into v_aging_depois
  from public.fn_rel_aging() a where a.tipo = 'a_pagar';
  if v_aging_depois <> v_aging_antes then
    raise exception 'PROVA 12: revisar mexeu no aging (antes %, depois %)',
      v_aging_antes, v_aging_depois;
  end if;
  insert into prova_log values ('12. em revisao no aging',
    'total a pagar inalterado: ' || v_aging_depois);

  -- ---------------------------------------------------------------
  -- 13. Reenviar devolve para a fila
  -- ---------------------------------------------------------------
  perform public.fn_reenviar_parcela(v_p2, 'anexo incluido');
  select status into v_status from public.lancamento_parcelas where id = v_p2;
  if v_status <> 'pendente' then
    raise exception 'PROVA 13: reenviar deveria voltar para pendente, veio %', v_status;
  end if;
  select count(*) into v_n from public.parcela_eventos
  where parcela_id = v_p2 and tipo = 'reenviou';
  if v_n <> 1 then
    raise exception 'PROVA 13: reenvio nao ficou na trilha (%)', v_n;
  end if;
  insert into prova_log values ('13. reenviar para aprovacao', 'volta para pendente');

  -- ---------------------------------------------------------------
  -- 14. Programacao vencida: data autorizada passou, pagamento travado
  -- ---------------------------------------------------------------
  perform public.fn_aprovar_parcela(v_p2, v_hoje - 1);

  procedure_falhou := false;
  begin
    perform public.fn_pagar_parcela(v_p2, v_conta, v_hoje);
  exception when others then
    procedure_falhou := true; v_msg := sqlerrm;
  end;
  if not procedure_falhou then
    raise exception 'PROVA 14: pagar com programacao vencida deveria ser recusado';
  end if;
  if v_msg not like '%passou: reprograme%' then
    raise exception 'PROVA 14: mensagem errada: %', v_msg;
  end if;
  insert into prova_log values ('14. programacao vencida', v_msg);

  -- ---------------------------------------------------------------
  -- 15. Reprogramar exige motivo
  -- ---------------------------------------------------------------
  procedure_falhou := false;
  begin
    perform public.fn_reprogramar_parcela(v_p2, v_hoje, '');
  exception when others then
    procedure_falhou := true; v_msg := sqlerrm;
  end;
  if not procedure_falhou then
    raise exception 'PROVA 15: reprogramar sem motivo deveria ser recusado';
  end if;
  insert into prova_log values ('15. reprogramar sem motivo', v_msg);

  -- ---------------------------------------------------------------
  -- 16. Reprogramar com motivo: grava de/para na trilha e libera o pagamento
  -- ---------------------------------------------------------------
  perform public.fn_reprogramar_parcela(v_p2, v_hoje, 'fornecedor pediu prorrogacao');

  select data_de, data_para into v_de, v_para
  from public.parcela_eventos
  where parcela_id = v_p2 and tipo = 'reprogramou'
  order by created_at desc limit 1;

  if v_de <> v_hoje - 1 or v_para <> v_hoje then
    raise exception 'PROVA 16: de/para errado: % -> %', v_de, v_para;
  end if;

  select data_programada_origem into v_origem
  from public.lancamento_parcelas where id = v_p2;
  if v_origem <> 'reprogramacao' then
    raise exception 'PROVA 16: origem deveria ser reprogramacao, veio %', v_origem;
  end if;

  perform public.fn_pagar_parcela(v_p2, v_conta, v_hoje);
  select status into v_status from public.lancamento_parcelas where id = v_p2;
  if v_status <> 'pago' then
    raise exception 'PROVA 16: depois de reprogramar deveria pagar, veio %', v_status;
  end if;
  insert into prova_log values ('16. reprogramar e pagar', v_de || ' -> ' || v_para);

  -- ---------------------------------------------------------------
  -- 17. Invariante: parcela aprovada nao pode ficar sem data autorizada
  -- ---------------------------------------------------------------
  procedure_falhou := false;
  begin
    update public.lancamento_parcelas
    set status = 'aprovado', data_programada = null
    where id = v_p2;
  exception when others then
    procedure_falhou := true; v_msg := sqlerrm;
  end;
  if not procedure_falhou then
    raise exception 'PROVA 17: o check deveria barrar aprovada sem data programada';
  end if;
  insert into prova_log values ('17. invariante no banco', 'check barrou aprovada sem data');
end;
$$;

-- ---------------------------------------------------------------
-- 18. Modo "a partir da data": data que passou continua liberada
-- ---------------------------------------------------------------
update public.configuracoes set valor = '"a_partir"'::jsonb
where chave = 'pagamento_janela';

do $$
declare
  v_lanc uuid; v_p uuid; v_status text;
  v_conta uuid := '40fb6875-ad20-45ed-9346-d1b59e7d9723';
  v_hoje date := (now() at time zone 'America/Rio_Branco')::date;
begin
  if public.fn_janela_pagamento() <> 'a_partir' then
    raise exception 'PROVA 18: a configuracao nao chegou na funcao';
  end if;

  insert into public.lancamentos
    (tipo, origem, descricao, valor, status, fornecedor_id, categoria_id,
     forma_pagamento_id, data_vencimento, mes_competencia, data_compra)
  values
    ('a_pagar', 'manual', 'PROVA janela a partir', 50.00, 'a_pagar',
     '9d34a92c-9529-4889-837d-e388061c43ca',
     '5ea885cd-d43c-49b2-a456-90d910ca69f1',
     '3b51be5a-0f79-4868-b88d-115f794dd3e3',
     v_hoje, date_trunc('month', v_hoje)::date, v_hoje)
  returning id into v_lanc;

  insert into public.lancamento_parcelas
    (lancamento_id, numero_parcela, valor, data_vencimento, status)
  values (v_lanc, 1, 50.00, v_hoje - 3, 'pendente')
  returning id into v_p;

  perform public.fn_aprovar_parcela(v_p);            -- autoriza para 3 dias atras
  perform public.fn_pagar_parcela(v_p, v_conta, v_hoje);

  select status into v_status from public.lancamento_parcelas where id = v_p;
  if v_status <> 'pago' then
    raise exception 'PROVA 18: no modo a_partir o pagamento de hoje deveria passar, veio %', v_status;
  end if;

  insert into prova_log values ('18. modo a partir da data', 'pagou depois da data autorizada');
end;
$$;

select passo, detalhe from prova_log order by passo;

rollback;

-- ---------------------------------------------------------------
-- 19 a 22. Os dois furos achados no teste ponta a ponta em producao
-- ---------------------------------------------------------------
-- 19. Digitar a data autorizada para pagar hoje uma parcela liberada para o mes
--     que vem (a janela era conferida contra a data DIGITADA, nao contra hoje).
-- 20. Pagar hoje, antes da data autorizada.
-- 21. Reprogramar para hoje e pagar.
-- 22. Pagar parcela de lancamento CANCELADO.
--
-- Resultado (rodado em 30/07/2026 contra o banco de producao, em transacao com
-- rollback):
--   19: "A data do pagamento nao pode ser no futuro (hoje e 30/07/2026)."
--   20: "Pagamento autorizado para 27/08/2026."
--   21: pago
--   22: "Este lancamento esta cancelado: nao da para pagar esta parcela"
