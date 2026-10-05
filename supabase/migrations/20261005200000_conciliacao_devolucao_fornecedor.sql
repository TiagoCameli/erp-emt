-- =============================================================
-- Conciliacao v2, Bloco L: devolucao do fornecedor
--
-- Caso (Tiago, 05/10/2026): credito sem par cujo historico nao diz
-- devolvido (PIX - RECEBIDO ... JOSIAS O DA SILVA, R$ 28.732,00 em
-- 28/04/2026, mesmo valor de um PIX enviado dias antes). Lancar a receber
-- criaria receita que nao existe.
--
-- 1. parcela_eventos aceita o tipo 'estornou'.
-- 2. Categoria "Devolucao de fornecedor" (receita, operacional): a
--    devolucao parcial reduz o custo no centro de custo, nao e receita
--    financeira.
-- 3. fn_conciliacao_debitos_para_devolucao(credito): os debitos casados com
--    parcela a pagar da conta, de mesmo valor ou maior, nos 90 dias antes.
-- 4. fn_conciliacao_devolucao_fornecedor(credito, debito, motivo):
--    - valor igual: desfaz o casamento do debito, estorna o pagamento da
--      parcela (volta a aprovada, evento 'estornou' com o motivo) e casa
--      debito e credito como par de estorno;
--    - valor menor (parcial): a parcela fica; cria um a receber do mesmo
--      fornecedor, categoria "Devolucao de fornecedor", no centro de custo
--      do lancamento original, ja recebido e casado com o credito;
--    - mes fechado recusa; parcela de origem RH ou aplicacao recusa.
-- =============================================================

alter table public.parcela_eventos drop constraint if exists parcela_eventos_tipo_check;
alter table public.parcela_eventos add constraint parcela_eventos_tipo_check
  check (tipo = any (array['aprovou', 'revisou', 'reenviou', 'desaprovou', 'reprogramou',
                           'pagou_fora_da_janela', 'alterou', 'estornou']));

insert into public.categorias_financeiras (nome, tipo, natureza, ativo)
select 'Devolução de fornecedor', 'receita', 'operacional', true
where not exists (select 1 from public.categorias_financeiras where nome = 'Devolução de fornecedor');

create or replace function public.fn_conciliacao_debitos_para_devolucao(p_credito_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path to ''
as $function$
declare
  v_c public.extrato_transacoes;
begin
  if not public.tem_permissao('financeiro.conciliacao', 'ver') then
    raise exception 'Sem permissao para ver a conciliacao';
  end if;
  select * into v_c from public.extrato_transacoes where id = p_credito_id;
  if v_c.id is null or v_c.tipo <> 'credito' then return '[]'::jsonb; end if;

  return coalesce((
    select jsonb_agg(jsonb_build_object(
      'id', t.id, 'dataMovimento', t.data_movimento, 'valor', t.valor, 'memo', t.memo,
      'parcelaId', p.id, 'lancamentoId', l.id, 'lancamentoNumero', l.numero,
      'descricao', l.descricao, 'origem', l.origem,
      'fornecedor', coalesce(f.nome_fantasia, f.razao_social, co.nome)
    ) order by (abs(t.valor) = v_c.valor) desc, t.data_movimento desc)
    from public.extrato_transacoes t
    join public.lancamento_parcelas p on p.id = t.parcela_id
    join public.lancamentos l on l.id = p.lancamento_id
    left join public.fornecedores f on f.id = l.fornecedor_id
    left join public.colaboradores co on co.id = l.colaborador_id
    where t.conta_bancaria_id = v_c.conta_bancaria_id
      and t.tipo = 'debito' and t.conciliada
      and l.tipo = 'a_pagar'
      and abs(t.valor) >= v_c.valor
      and t.data_movimento between v_c.data_movimento - 90 and v_c.data_movimento
  ), '[]'::jsonb);
end;
$function$;

revoke all on function public.fn_conciliacao_debitos_para_devolucao(uuid) from public, anon;
grant execute on function public.fn_conciliacao_debitos_para_devolucao(uuid) to authenticated;

create or replace function public.fn_conciliacao_devolucao_fornecedor(
  p_credito_id uuid, p_debito_id uuid, p_motivo text
)
returns jsonb
language plpgsql
security definer
set search_path to ''
as $function$
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
  update public.extrato_transacoes set conciliacao_automatica = false where id = v_c.id;
  return jsonb_build_object('modo', 'parcial', 'lancamentoId', v_novo);
end;
$function$;

revoke all on function public.fn_conciliacao_devolucao_fornecedor(uuid, uuid, text) from public, anon;
grant execute on function public.fn_conciliacao_devolucao_fornecedor(uuid, uuid, text) to authenticated;
