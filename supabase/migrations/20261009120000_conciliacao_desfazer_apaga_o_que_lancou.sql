-- =============================================================
-- Conciliacao: desfazer apaga o que a propria conciliacao lancou
--
-- Defeito (Tiago, 09/10/2026): a regra do Rende Facil (e o "Lancar como
-- transferencia") cria a transferencia ao conciliar, mas o Desfazer so
-- soltava o vinculo. A transferencia ficava no app, sem par no extrato,
-- mexendo no saldo da corrente e da subconta. Conciliar de novo criava
-- outra: em producao eram 42 orfas do Rende Facil de ago/2026, os mesmos
-- 21 movimentos duas vezes (R$ 4.009.270,48). O "Lancar" (lancamento pago)
-- e a devolucao parcial do fornecedor tinham o mesmo defeito.
--
-- 1. extrato_transacoes.lancado_na_conciliacao: o alvo do vinculo (a
--    transferencia ou o lancamento) nasceu deste casamento.
-- 2. Os vinculos de hoje: o alvo criado pela conciliacao nasce na mesma
--    transacao do vinculo, entao created_at = conciliado_em. Em producao
--    isso pega exatamente as 46 transferencias e os 5 lancamentos com a
--    observacao "Lancad* na conciliacao", e nada mais.
-- 3. fn_conciliacao_lancar, fn_conciliacao_lancar_transferencia e o modo
--    parcial de fn_conciliacao_devolucao_fornecedor marcam a coluna (corpo
--    igual ao de producao, so a marca a mais).
-- 4. fn_desconciliar_transacao: com a marca, o que foi lancado vai embora
--    junto, se nenhum outro movimento do extrato ainda aponta para ele:
--    transferencia para a lixeira; lancamento (origem manual) para
--    arquivo_morto.lancamentos_excluidos_conciliacao, como no "Excluir" da
--    conciliacao. Mes fechado na outra conta ou competencia fechada recusa.
--    Transferencia ou lancamento feitos fora da conciliacao nunca saem: alem
--    da marca, o alvo tem de ter nascido no instante do casamento.
-- 5. As 42 orfas vao para a lixeira (ok do Tiago em 09/10/2026).
-- =============================================================

alter table public.extrato_transacoes
  add column if not exists lancado_na_conciliacao boolean not null default false;

comment on column public.extrato_transacoes.lancado_na_conciliacao is
  'O alvo do vinculo (transferencia ou lancamento) foi criado por este casamento; desfazer o apaga.';

update public.extrato_transacoes e
   set lancado_na_conciliacao = true
  from public.transferencias_contas t
 where t.id = e.transferencia_id and t.created_at = e.conciliado_em;

update public.extrato_transacoes e
   set lancado_na_conciliacao = true
  from public.lancamento_parcelas p
  join public.lancamentos l on l.id = p.lancamento_id
 where p.id = e.parcela_id and l.created_at = e.conciliado_em;

CREATE OR REPLACE FUNCTION public.fn_conciliacao_lancar(p_transacao_id uuid, p_dados jsonb)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_t public.extrato_transacoes;
  v_tipo text;
  v_valor numeric(14, 2);
  v_mes date;
  v_centro uuid;
  v_centro_ok boolean;
  v_categoria uuid;
  v_categoria_tipo text;
  v_descricao text;
  v_lanc uuid;
  v_parcela uuid;
  v_quem uuid := (select auth.uid());
begin
  if not public.tem_permissao('financeiro.conciliacao', 'editar') then
    raise exception 'Sem permissao para conciliar';
  end if;

  select * into v_t from public.extrato_transacoes where id = p_transacao_id for update;
  if v_t.id is null then raise exception 'Movimento do extrato nao encontrado'; end if;
  if v_t.conciliada then raise exception 'Este movimento ja esta conciliado'; end if;
  perform public.fn_conciliacao_exigir_mes_aberto(v_t.conta_bancaria_id, v_t.data_movimento);

  v_tipo := case when v_t.tipo = 'credito' then 'a_receber' else 'a_pagar' end;
  if not public.fn_pode_lancar_tipo(v_tipo, 'criar') then
    raise exception 'Sem permissao para criar lancamentos';
  end if;

  v_valor := round(abs(v_t.valor), 2);
  v_descricao := nullif(btrim(coalesce(p_dados->>'descricao', '')), '');
  if v_descricao is null then
    v_descricao := coalesce(nullif(btrim(coalesce(v_t.memo, '')), ''), 'Movimento do extrato');
  end if;
  v_descricao := left(v_descricao, 500);

  begin
    v_mes := (p_dados->>'mesCompetencia')::date;
  exception when others then
    raise exception 'Mes de referencia invalido';
  end;
  if v_mes is null then raise exception 'Informe o mes de referencia'; end if;
  v_mes := date_trunc('month', v_mes)::date;

  begin
    v_centro := (p_dados->>'centroCustoId')::uuid;
    v_categoria := nullif(p_dados->>'categoriaId', '')::uuid;
  exception when others then
    raise exception 'Centro de custo ou categoria invalidos';
  end;
  if v_centro is null then raise exception 'Informe o centro de custo'; end if;
  select c.ativo into v_centro_ok from public.centros_custo c where c.id = v_centro;
  if v_centro_ok is null then raise exception 'Centro de custo nao encontrado'; end if;
  if not v_centro_ok then raise exception 'Centro de custo inativo'; end if;

  if v_categoria is not null then
    select c.tipo into v_categoria_tipo from public.categorias_financeiras c where c.id = v_categoria;
    if v_categoria_tipo is null then raise exception 'Categoria nao encontrada'; end if;
    if v_categoria_tipo <> (case when v_tipo = 'a_receber' then 'receita' else 'despesa' end) then
      raise exception 'A categoria escolhida nao e do tipo deste movimento';
    end if;
  end if;

  v_lanc := gen_random_uuid();
  perform public.fn_exigir_competencia_aberta(v_mes, 'lancamento', v_lanc);

  insert into public.lancamentos (
    id, tipo, origem, fornecedor_id, cliente_id, categoria_id, centro_custo_id,
    descricao, valor, status, data_compra, mes_competencia, data_vencimento,
    numero_documento, observacoes, created_by
  ) values (
    v_lanc, v_tipo, 'manual',
    case when v_tipo = 'a_pagar' then nullif(p_dados->>'fornecedorId', '')::uuid end,
    case when v_tipo = 'a_receber' then nullif(p_dados->>'clienteId', '')::uuid end,
    v_categoria,
    v_centro,
    v_descricao, v_valor, 'pago', v_t.data_movimento, v_mes, v_t.data_movimento,
    nullif(left(btrim(coalesce(p_dados->>'numeroDocumento', '')), 60), ''),
    left(coalesce(nullif(btrim(coalesce(p_dados->>'observacoes', '')), ''),
      'Lancado na conciliacao do extrato: ' || coalesce(v_t.memo, '-')), 2000),
    v_quem
  );

  insert into public.lancamento_parcelas (
    lancamento_id, numero_parcela, valor, data_vencimento, status,
    conta_bancaria_id, data_pagamento, pago_por, pago_em, created_by
  ) values (
    v_lanc, 1, v_valor, v_t.data_movimento, 'pago',
    v_t.conta_bancaria_id, v_t.data_movimento, v_quem, now(), v_quem
  ) returning id into v_parcela;

  insert into public.lancamento_rateios (lancamento_id, centro_custo_id, valor, categoria_id, created_by)
  values (v_lanc, v_centro, v_valor, v_categoria, v_quem);

  perform public.fn_conciliar_transacao(p_transacao_id, v_parcela);
  update public.extrato_transacoes set conciliacao_automatica = false, lancado_na_conciliacao = true where id = p_transacao_id;

  return v_lanc;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.fn_conciliacao_lancar_transferencia(p_transacao_id uuid, p_conta_contraparte_id uuid, p_centro_custo_id uuid DEFAULT NULL::uuid, p_descricao text DEFAULT NULL::text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_t public.extrato_transacoes;
  v_id uuid;
begin
  if not public.tem_permissao('financeiro.conciliacao', 'editar') then
    raise exception 'Sem permissao para conciliar';
  end if;

  select * into v_t from public.extrato_transacoes where id = p_transacao_id for update;
  if v_t.id is null then raise exception 'Movimento do extrato nao encontrado'; end if;
  if v_t.conciliada then raise exception 'Este movimento ja esta conciliado'; end if;
  if p_conta_contraparte_id is null then raise exception 'Escolha a outra conta da transferencia'; end if;
  perform public.fn_conciliacao_exigir_mes_aberto(v_t.conta_bancaria_id, v_t.data_movimento);
  perform public.fn_conciliacao_exigir_mes_aberto(p_conta_contraparte_id, v_t.data_movimento);

  v_id := public.fn_salvar_transferencia(
    null,
    case when v_t.tipo = 'debito' then v_t.conta_bancaria_id else p_conta_contraparte_id end,
    case when v_t.tipo = 'debito' then p_conta_contraparte_id else v_t.conta_bancaria_id end,
    v_t.data_movimento,
    abs(v_t.valor),
    0,
    coalesce(nullif(btrim(coalesce(p_descricao, '')), ''), v_t.memo),
    'Lancada na conciliacao do extrato',
    p_centro_custo_id
  );

  perform public.fn_conciliar_transferencia(p_transacao_id, v_id);
  update public.extrato_transacoes set conciliacao_automatica = false, lancado_na_conciliacao = true where id = p_transacao_id;
  return v_id;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.fn_conciliacao_devolucao_fornecedor(p_credito_id uuid, p_debito_id uuid, p_motivo text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_c public.extrato_transacoes;
  v_d public.extrato_transacoes;
  v_p public.lancamento_parcelas;
  v_l public.lancamentos;
  v_quem uuid := (select auth.uid());
  v_motivo text := nullif(btrim(coalesce(p_motivo, '')), '');
  v_categoria uuid;
  v_centro uuid;
  v_novo uuid;
  v_nova_parcela uuid;
  v_mes date;
begin
  if not public.tem_permissao('financeiro.conciliacao', 'editar') then
    raise exception 'Sem permissao para conciliar';
  end if;
  if v_motivo is null or length(v_motivo) < 3 then
    raise exception 'Informe o motivo da devolucao';
  end if;

  perform 1 from public.extrato_transacoes where id in (p_credito_id, p_debito_id) order by id for update;
  select * into v_c from public.extrato_transacoes where id = p_credito_id;
  select * into v_d from public.extrato_transacoes where id = p_debito_id;
  if v_c.id is null or v_d.id is null then raise exception 'Movimento do extrato nao encontrado'; end if;
  if v_c.tipo <> 'credito' or v_c.conciliada then raise exception 'Escolha um credito ainda sem par'; end if;
  if v_d.tipo <> 'debito' or not v_d.conciliada or v_d.parcela_id is null then
    raise exception 'O pagamento escolhido precisa estar casado com um lancamento';
  end if;
  if v_c.conta_bancaria_id <> v_d.conta_bancaria_id then raise exception 'A devolucao precisa ser da mesma conta'; end if;
  if v_c.valor > abs(v_d.valor) then raise exception 'A devolucao e maior que o pagamento'; end if;
  if v_d.data_movimento > v_c.data_movimento or v_c.data_movimento - v_d.data_movimento > 90 then
    raise exception 'O pagamento precisa ser dos 90 dias antes da devolucao';
  end if;
  perform public.fn_conciliacao_exigir_mes_aberto(v_c.conta_bancaria_id, v_c.data_movimento);
  perform public.fn_conciliacao_exigir_mes_aberto(v_d.conta_bancaria_id, v_d.data_movimento);

  select * into v_p from public.lancamento_parcelas where id = v_d.parcela_id for update;
  select * into v_l from public.lancamentos where id = v_p.lancamento_id;
  if v_l.tipo <> 'a_pagar' then raise exception 'So pagamento tem devolucao de fornecedor'; end if;
  if v_l.origem in ('folha', 'folha_guia', 'adiantamento', 'rescisao', 'decimo_terceiro', 'ferias', 'diaria') then
    raise exception 'Pagamento do RH devolvido se trata pelo RH';
  end if;
  if v_l.origem = 'aplicacao' then
    raise exception 'Lancamento da posicao da aplicacao: trate em Financeiro > Aplicacoes';
  end if;
  if not public.fn_conciliacao_pode_mexer_no_pago('a_pagar') then
    raise exception 'Sem permissao para mexer em pagamento ja feito';
  end if;

  if v_c.valor = abs(v_d.valor) then
    -- Total: o pagamento nao aconteceu. Desfaz o casamento, estorna a
    -- parcela e casa debito e credito como estorno.
    update public.extrato_transacoes set parcela_id = null, conciliada = false where id = v_d.id;
    update public.lancamento_parcelas
       set status = 'aprovado', conta_bancaria_id = null, data_pagamento = null,
           pago_por = null, pago_em = null, desconto = 0, juros = 0, outras_despesas = 0,
           -- Aprovada exige data programada: a que tinha, ou o vencimento.
           data_programada = coalesce(data_programada, data_vencimento),
           data_programada_origem = coalesce(data_programada_origem, 'vencimento')
     where id = v_p.id;
    perform public.fn_recalcular_status_lancamento(v_l.id);
    insert into public.parcela_eventos (parcela_id, tipo, motivo, valor_de, valor_para, created_by)
    values (v_p.id, 'estornou',
      'Devolucao do fornecedor na conciliacao: ' || v_motivo, v_p.valor_liquido, null, v_quem);
    update public.extrato_transacoes
       set conciliada = true,
           estorno_par_id = case when id = v_c.id then v_d.id else v_c.id end,
           conciliado_por = v_quem, conciliado_em = now(), conciliacao_automatica = false,
           confira_confirmado_em = null, confira_confirmado_por = null
     where id in (v_c.id, v_d.id);
    return jsonb_build_object('modo', 'total', 'parcelaId', v_p.id);
  end if;

  -- Parcial: a parcela fica paga; a parte devolvida reduz o custo.
  select id into v_categoria from public.categorias_financeiras
   where nome = 'Devolução de fornecedor' and tipo = 'receita' limit 1;
  v_centro := coalesce(v_l.centro_custo_id,
    (select r.centro_custo_id from public.lancamento_rateios r where r.lancamento_id = v_l.id order by r.valor desc limit 1));
  if v_centro is null then raise exception 'O lancamento original nao tem centro de custo'; end if;
  v_mes := date_trunc('month', v_c.data_movimento)::date;
  v_novo := gen_random_uuid();
  perform public.fn_exigir_competencia_aberta(v_mes, 'lancamento', v_novo);

  insert into public.lancamentos (
    id, tipo, origem, fornecedor_id, categoria_id, centro_custo_id, descricao, valor, status,
    data_compra, mes_competencia, data_vencimento, observacoes, created_by)
  values (
    v_novo, 'a_receber', 'manual', v_l.fornecedor_id, v_categoria, v_centro,
    left('Devolucao parcial do fornecedor: ' || coalesce(v_l.descricao, '-'), 500),
    v_c.valor, 'pago', v_c.data_movimento, v_mes, v_c.data_movimento,
    left('Devolucao de parte do ' || coalesce(v_l.numero, 'lancamento') || '. ' || v_motivo, 2000), v_quem);
  insert into public.lancamento_parcelas (
    lancamento_id, numero_parcela, valor, data_vencimento, status, conta_bancaria_id,
    data_pagamento, pago_por, pago_em, created_by)
  values (v_novo, 1, v_c.valor, v_c.data_movimento, 'pago', v_c.conta_bancaria_id,
    v_c.data_movimento, v_quem, now(), v_quem)
  returning id into v_nova_parcela;
  insert into public.lancamento_rateios (lancamento_id, centro_custo_id, valor, categoria_id, created_by)
  values (v_novo, v_centro, v_c.valor, v_categoria, v_quem);

  perform public.fn_conciliar_transacao(v_c.id, v_nova_parcela);
  update public.extrato_transacoes set conciliacao_automatica = false, lancado_na_conciliacao = true where id = v_c.id;
  return jsonb_build_object('modo', 'parcial', 'lancamentoId', v_novo);
end;
$function$
;

create or replace function public.fn_desconciliar_transacao(p_transacao_id uuid)
returns void
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_conta uuid;
  v_data date;
  v_par uuid;
  v_par_data date;
  v_fatura uuid;
  v_encargos uuid;
  v_lancado boolean;
  v_trf public.transferencias_contas;
  v_parcela uuid;
  v_lanc public.lancamentos;
  v_conciliado_em timestamptz;
  r record;
begin
  if not public.tem_permissao('financeiro.conciliacao', 'editar') then raise exception 'Sem permissao para conciliar'; end if;
  select conta_bancaria_id, data_movimento, estorno_par_id, cartao_fatura_id, lancado_na_conciliacao, parcela_id, conciliado_em
    into v_conta, v_data, v_par, v_fatura, v_lancado, v_parcela, v_conciliado_em
  from public.extrato_transacoes where id = p_transacao_id;
  select t.* into v_trf from public.transferencias_contas t
   where t.id = (select transferencia_id from public.extrato_transacoes where id = p_transacao_id);
  perform public.fn_conciliacao_exigir_mes_aberto(v_conta, v_data);
  if v_par is not null then
    select data_movimento into v_par_data from public.extrato_transacoes where id = v_par;
    perform public.fn_conciliacao_exigir_mes_aberto(v_conta, v_par_data);
  end if;
  update public.extrato_transacoes
  set conciliada = false, parcela_id = null, transferencia_id = null, estorno_par_id = null,
      cartao_fatura_id = null, lancado_na_conciliacao = false,
      conciliado_por = null, conciliado_em = null, conciliacao_automatica = false,
      confira_confirmado_em = null, confira_confirmado_por = null
  where id = p_transacao_id or (v_par is not null and id = v_par);

  if v_fatura is not null then
    -- As compras voltam ao estado de antes; os encargos saem.
    select encargos_lancamento_id into v_encargos from public.cartao_faturas where id = v_fatura;
    for r in select fp.*, lp.lancamento_id from public.cartao_fatura_parcelas fp
             join public.lancamento_parcelas lp on lp.id = fp.parcela_id
             where fp.fatura_id = v_fatura and fp.status_antes <> 'novo' loop
      update public.lancamento_parcelas
         set status = r.status_antes, conta_bancaria_id = r.conta_antes, data_pagamento = r.data_pagamento_antes,
             pago_por = r.pago_por_antes, pago_em = r.pago_em_antes
       where id = r.parcela_id;
      perform public.fn_recalcular_status_lancamento(r.lancamento_id);
    end loop;
    delete from public.cartao_faturas where id = v_fatura;
    if v_encargos is not null then
      delete from public.lancamentos where id = v_encargos;
    end if;
  end if;

  if not coalesce(v_lancado, false) then return; end if;

  -- O que este casamento lancou sai junto, se ninguem mais no extrato o usa
  -- (a transferencia conciliada tambem na outra conta fica). Nasceu no mesmo
  -- instante do casamento: a marca sozinha nao basta se algum caminho soltou
  -- o vinculo sem passar por aqui.
  if v_trf.id is not null and v_trf.created_at = v_conciliado_em
     and not exists (select 1 from public.extrato_transacoes e where e.transferencia_id = v_trf.id) then
    perform public.fn_conciliacao_exigir_mes_aberto(v_trf.conta_origem_id, v_trf.data_transferencia);
    perform public.fn_conciliacao_exigir_mes_aberto(v_trf.conta_destino_id, v_trf.data_transferencia);
    insert into public.lixeira (tabela, registro_id, dados, motivo, excluido_por)
    values ('transferencias_contas', v_trf.id::text, to_jsonb(v_trf),
            'Conciliacao desfeita: a transferencia tinha sido lancada pela conciliacao do extrato',
            (select auth.uid()));
    delete from public.transferencias_contas where id = v_trf.id;
  end if;

  if v_parcela is not null then
    select l.* into v_lanc from public.lancamentos l
      join public.lancamento_parcelas p on p.lancamento_id = l.id
     where p.id = v_parcela
     for update of l;
    if v_lanc.id is not null and v_lanc.origem = 'manual' and v_lanc.created_at = v_conciliado_em
       and not exists (select 1 from public.extrato_transacoes e
                       join public.lancamento_parcelas p on p.id = e.parcela_id
                       where p.lancamento_id = v_lanc.id) then
      perform public.fn_exigir_competencia_aberta(v_lanc.mes_competencia, 'lancamento', v_lanc.id);
      insert into arquivo_morto.lancamentos_excluidos_conciliacao
        (lancamento_id, motivo, excluido_por, lancamento, parcelas, rateios, formas, eventos)
      values (
        v_lanc.id, 'Conciliacao desfeita: o lancamento tinha sido lancado pela conciliacao do extrato',
        (select auth.uid()), to_jsonb(v_lanc),
        coalesce((select jsonb_agg(to_jsonb(p)) from public.lancamento_parcelas p where p.lancamento_id = v_lanc.id), '[]'),
        coalesce((select jsonb_agg(to_jsonb(rr)) from public.lancamento_rateios rr where rr.lancamento_id = v_lanc.id), '[]'),
        coalesce((select jsonb_agg(to_jsonb(f)) from public.lancamento_formas f where f.lancamento_id = v_lanc.id), '[]'),
        coalesce((select jsonb_agg(to_jsonb(ev)) from public.parcela_eventos ev
                  join public.lancamento_parcelas p on p.id = ev.parcela_id
                  where p.lancamento_id = v_lanc.id), '[]')
      );
      delete from public.lancamentos where id = v_lanc.id;
    end if;
  end if;
end
$function$;

-- As orfas de hoje: lancadas pela conciliacao e sem nenhum movimento do
-- extrato apontando. Para a lixeira, restauraveis.
insert into public.lixeira (tabela, registro_id, dados, motivo, excluido_por)
select 'transferencias_contas', t.id::text, to_jsonb(t),
       'Orfa de conciliacao desfeita (o desfazer nao apagava a transferencia lancada pela conciliacao); limpeza de 09/10/2026 a pedido do Tiago',
       'c66fca9f-5428-4fb9-855f-dcff548764df'::uuid
  from public.transferencias_contas t
 where t.observacoes = 'Lancada na conciliacao do extrato'
   and not exists (select 1 from public.extrato_transacoes e where e.transferencia_id = t.id);

delete from public.transferencias_contas t
 where t.observacoes = 'Lancada na conciliacao do extrato'
   and not exists (select 1 from public.extrato_transacoes e where e.transferencia_id = t.id);
