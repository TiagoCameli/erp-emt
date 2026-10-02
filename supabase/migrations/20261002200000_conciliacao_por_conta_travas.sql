-- =============================================================
-- Conciliacao por conta: travas que a revisao pediu (02/10/2026)
--
-- 1. Excluir pela conciliacao so apaga lancamento de UMA parcela. Com varias,
--    apagar levaria junto parcelas pendentes, aprovadas ou pagas em outras
--    contas. O arquivo morto passa a guardar formas e eventos tambem.
-- 2. Dar baixa pela conciliacao em parcela A PAGAR exige que ela esteja
--    aprovada, como em fn_pagar_parcela: a conciliacao nao e atalho da fila
--    de aprovacao. Recebimento segue aceitando pendente ou aprovado.
-- 3. Mudar a conta ou o valor de parcela JA PAGA pede, alem da Conciliacao,
--    a permissao de quem paga (pagamentos/criar) ou recebe
--    (recebimentos/editar), e respeita a competencia fechada.
-- 4. Diferenca de valor ajustavel limitada a R$ 1,00 (centavo de boleto,
--    arredondamento). Mais que isso nao e o mesmo pagamento.
-- 5. O painel oferece parcela em aberto ou paga em outra conta com ate
--    R$ 1,00 de diferenca (antes so valor exato, e o ajuste nunca aparecia),
--    e filtra cedo em vez de varrer todas as parcelas do banco.
-- 6. fn_conciliacao_lancar grava created_by e confere o tipo da categoria.
-- =============================================================

-- -------------------------------------------------------------
-- Permissao de mexer em parcela paga, pelo tipo do lancamento
-- -------------------------------------------------------------
create or replace function public.fn_conciliacao_pode_mexer_no_pago(p_tipo text)
returns boolean
language sql
stable
security definer
set search_path to ''
as $function$
  select case
    when p_tipo = 'a_receber' then public.tem_permissao('financeiro.recebimentos', 'editar')
    else public.tem_permissao('financeiro.pagamentos', 'criar')
  end;
$function$;

revoke all on function public.fn_conciliacao_pode_mexer_no_pago(text) from public, anon, authenticated;

-- -------------------------------------------------------------
-- Painel
-- -------------------------------------------------------------
create or replace function public.fn_conciliacao_painel(
  p_conta_id uuid,
  p_inicio date,
  p_fim date
)
returns jsonb
language plpgsql
stable
security definer
set search_path to ''
as $function$
declare
  v_folga_paga int := 5;
  v_folga_aberta int := 45;
  v_tolerancia numeric := 1.00;
  v_valores numeric[];
  v_resultado jsonb;
begin
  if not public.tem_permissao('financeiro.conciliacao', 'ver') then
    raise exception 'Sem permissao para ver a conciliacao';
  end if;
  if p_conta_id is null or p_inicio is null or p_fim is null then
    raise exception 'Informe a conta e o periodo';
  end if;
  if p_inicio > p_fim then
    raise exception 'O periodo comeca depois de terminar';
  end if;

  select coalesce(array_agg(distinct round(abs(t.valor), 2)), '{}')
    into v_valores
  from public.extrato_transacoes t
  where t.conta_bancaria_id = p_conta_id
    and t.data_movimento between p_inicio and p_fim
    and not t.conciliada;

  with base as (
    -- So o que pode interessar: pagas na janela, abertas na janela maior, e
    -- as ja vinculadas a movimentos deste periodo. Antes a CTE varria todas
    -- as parcelas do banco.
    select p.*
    from public.lancamento_parcelas p
    where (p.status = 'pago'
           and p.data_pagamento between p_inicio - v_folga_paga and p_fim + v_folga_paga)
       or (p.status in ('pendente', 'aprovado')
           and coalesce(p.data_programada, p.data_vencimento)
               between p_inicio - v_folga_aberta and p_fim + v_folga_aberta)
       or p.id in (
           select t.parcela_id from public.extrato_transacoes t
           where t.conta_bancaria_id = p_conta_id
             and t.data_movimento between p_inicio and p_fim
             and t.parcela_id is not null)
  ),
  parcela_info as (
    select
      p.id, p.lancamento_id, p.numero_parcela, p.status, p.valor, p.desconto,
      p.juros, p.outras_despesas, p.valor_liquido, p.data_pagamento,
      p.data_vencimento, p.data_programada, p.conta_bancaria_id,
      l.numero as lancamento_numero, l.descricao, l.tipo, l.origem,
      l.numero_documento,
      coalesce(f.nome_fantasia, f.razao_social, cl.nome_fantasia, cl.nome, co.nome) as nome,
      f.razao_social as razao_social,
      cb.nome as conta_nome,
      q.qtd as qtd_parcelas,
      exists (select 1 from public.extrato_transacoes e where e.parcela_id = p.id) as vinculada
    from base p
    join public.lancamentos l on l.id = p.lancamento_id
    left join public.fornecedores f on f.id = l.fornecedor_id
    left join public.clientes cl on cl.id = l.cliente_id
    left join public.colaboradores co on co.id = l.colaborador_id
    left join public.contas_bancarias cb on cb.id = p.conta_bancaria_id
    left join lateral (
      select count(*) as qtd from public.lancamento_parcelas p2 where p2.lancamento_id = p.lancamento_id
    ) q on true
    where l.status <> 'cancelado'
  ),
  livres as (
    select pi.* from parcela_info pi where not pi.vinculada
  ),
  -- Perto de algum movimento sem par (ate a tolerancia).
  perto as (
    select lv.* from livres lv
    where exists (
      select 1 from unnest(v_valores) v
      where abs(v - round(lv.valor_liquido, 2)) <= v_tolerancia
    )
  ),
  transf as (
    select
      tr.id, tr.numero, tr.descricao, tr.data_transferencia, tr.valor,
      tr.conta_origem_id, tr.conta_destino_id,
      o.nome as origem_nome, d.nome as destino_nome,
      case when tr.conta_origem_id = p_conta_id then 'saida' else 'entrada' end as lado
    from public.transferencias_contas tr
    join public.contas_bancarias o on o.id = tr.conta_origem_id
    join public.contas_bancarias d on d.id = tr.conta_destino_id
    where p_conta_id in (tr.conta_origem_id, tr.conta_destino_id)
  )
  select jsonb_build_object(
    'transacoes', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', t.id,
        'extratoId', t.extrato_id,
        'dataMovimento', t.data_movimento,
        'valor', t.valor,
        'tipo', t.tipo,
        'memo', t.memo,
        'conciliada', t.conciliada,
        'automatica', t.conciliacao_automatica,
        'parcela', case when pi.id is null then null else jsonb_build_object(
          'id', pi.id, 'lancamentoId', pi.lancamento_id, 'lancamentoNumero', pi.lancamento_numero,
          'descricao', pi.descricao, 'nome', pi.nome, 'numeroParcela', pi.numero_parcela,
          'valorLiquido', pi.valor_liquido, 'dataPagamento', pi.data_pagamento) end,
        'transferencia', case when tf.id is null then null else jsonb_build_object(
          'id', tf.id, 'numero', tf.numero, 'descricao', tf.descricao,
          'origemNome', tf.origem_nome, 'destinoNome', tf.destino_nome,
          'data', tf.data_transferencia) end
      ) order by t.data_movimento, t.created_at)
      from public.extrato_transacoes t
      left join parcela_info pi on pi.id = t.parcela_id
      left join transf tf on tf.id = t.transferencia_id
      where t.conta_bancaria_id = p_conta_id
        and t.data_movimento between p_inicio and p_fim
    ), '[]'::jsonb),

    'pagasNaConta', coalesce((
      select jsonb_agg(to_jsonb(lv) order by lv."dataPagamento")
      from (
        select id, lancamento_id as "lancamentoId", lancamento_numero as "lancamentoNumero",
               descricao, nome, razao_social as "razaoSocial", tipo, origem,
               numero_parcela as "numeroParcela", qtd_parcelas as "qtdParcelas",
               valor, valor_liquido as "valorLiquido", data_pagamento as "dataPagamento",
               numero_documento as "numeroDocumento", status, conta_nome as "contaNome",
               conta_bancaria_id as "contaId"
        from livres
        where status = 'pago'
          and conta_bancaria_id = p_conta_id
      ) lv
    ), '[]'::jsonb),

    'pagasEmOutraConta', coalesce((
      select jsonb_agg(to_jsonb(lv) order by lv."dataPagamento")
      from (
        select id, lancamento_id as "lancamentoId", lancamento_numero as "lancamentoNumero",
               descricao, nome, razao_social as "razaoSocial", tipo, origem,
               numero_parcela as "numeroParcela", qtd_parcelas as "qtdParcelas",
               valor, valor_liquido as "valorLiquido", data_pagamento as "dataPagamento",
               numero_documento as "numeroDocumento", status, conta_nome as "contaNome",
               conta_bancaria_id as "contaId"
        from perto
        where status = 'pago'
          and conta_bancaria_id is distinct from p_conta_id
      ) lv
    ), '[]'::jsonb),

    'abertas', coalesce((
      select jsonb_agg(to_jsonb(lv) order by lv."dataVencimento")
      from (
        select id, lancamento_id as "lancamentoId", lancamento_numero as "lancamentoNumero",
               descricao, nome, razao_social as "razaoSocial", tipo, origem,
               numero_parcela as "numeroParcela", qtd_parcelas as "qtdParcelas",
               valor, valor_liquido as "valorLiquido",
               coalesce(data_programada, data_vencimento) as "dataVencimento",
               numero_documento as "numeroDocumento", status, conta_nome as "contaNome",
               conta_bancaria_id as "contaId"
        from perto
        where status in ('pendente', 'aprovado')
      ) lv
    ), '[]'::jsonb),

    'transferencias', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', tf.id, 'numero', tf.numero, 'descricao', tf.descricao,
        'data', tf.data_transferencia, 'valor', tf.valor, 'lado', tf.lado,
        'origemNome', tf.origem_nome, 'destinoNome', tf.destino_nome
      ) order by tf.data_transferencia)
      from transf tf
      where tf.data_transferencia between p_inicio - v_folga_paga and p_fim + v_folga_paga
        and not exists (
          select 1 from public.extrato_transacoes e
          where e.transferencia_id = tf.id
            and e.tipo = case when tf.lado = 'saida' then 'debito' else 'credito' end
        )
    ), '[]'::jsonb)
  ) into v_resultado;

  return v_resultado;
end;
$function$;

-- -------------------------------------------------------------
-- Casar
-- -------------------------------------------------------------
create or replace function public.fn_conciliacao_casar(
  p_transacao_id uuid,
  p_especie text,
  p_alvo_id uuid,
  p_automatica boolean default false,
  p_ajustar boolean default false
)
returns void
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_t public.extrato_transacoes;
  v_p public.lancamento_parcelas;
  v_tipo_lanc text;
  v_status_lanc text;
  v_mes_lanc date;
  v_conta_antiga text;
  v_conta_nova text;
  v_banco numeric(14, 2);
  v_diferenca numeric(14, 2);
  v_juros numeric(14, 2);
  v_desconto numeric(14, 2);
  v_partes text[] := '{}';
  v_muda_pago boolean;
begin
  if not public.tem_permissao('financeiro.conciliacao', 'editar') then
    raise exception 'Sem permissao para conciliar';
  end if;

  select * into v_t from public.extrato_transacoes where id = p_transacao_id for update;
  if v_t.id is null then raise exception 'Movimento do extrato nao encontrado'; end if;
  if v_t.conciliada then raise exception 'Este movimento ja esta conciliado'; end if;

  if p_especie = 'transferencia' then
    perform public.fn_conciliar_transferencia(p_transacao_id, p_alvo_id);
    update public.extrato_transacoes
       set conciliacao_automatica = coalesce(p_automatica, false)
     where id = p_transacao_id;
    return;
  end if;

  if p_especie is distinct from 'parcela' then
    raise exception 'Tipo de vinculo invalido';
  end if;

  select * into v_p from public.lancamento_parcelas where id = p_alvo_id for update;
  if v_p.id is null then raise exception 'Parcela nao encontrada'; end if;

  select l.tipo, l.status, l.mes_competencia into v_tipo_lanc, v_status_lanc, v_mes_lanc
  from public.lancamentos l where l.id = v_p.lancamento_id;
  if v_status_lanc = 'cancelado' then
    raise exception 'O lancamento desta parcela esta cancelado';
  end if;

  if (v_t.tipo = 'credito') <> (v_tipo_lanc = 'a_receber') then
    raise exception 'Credito so casa com recebimento, e debito so com pagamento';
  end if;

  if exists (select 1 from public.extrato_transacoes e where e.parcela_id = v_p.id) then
    raise exception 'Esta parcela ja esta conciliada com outro movimento';
  end if;

  if coalesce(p_automatica, false) and (
       p_ajustar
       or v_p.status <> 'pago'
       or v_p.conta_bancaria_id is distinct from v_t.conta_bancaria_id
       or round(v_p.valor_liquido, 2) <> round(abs(v_t.valor), 2)
     ) then
    raise exception 'O casamento automatico so vincula parcela paga nesta conta com o valor exato';
  end if;

  v_banco := round(abs(v_t.valor), 2);
  v_diferenca := v_banco - round(v_p.valor_liquido, 2);

  if abs(v_diferenca) > 1 then
    raise exception 'O valor do extrato (R$ %) difere da parcela (R$ %) em mais de R$ 1,00: nao e o mesmo pagamento',
      v_banco, round(v_p.valor_liquido, 2);
  end if;
  if v_diferenca <> 0 and not coalesce(p_ajustar, false) then
    raise exception 'O valor do extrato (R$ %) difere da parcela (R$ %)', v_banco, round(v_p.valor_liquido, 2);
  end if;

  -- Mexer em parcela paga (conta ou valor) e coisa de quem paga/recebe, e nao
  -- se faz em competencia fechada.
  v_muda_pago := v_p.status = 'pago'
    and (v_p.conta_bancaria_id is distinct from v_t.conta_bancaria_id or v_diferenca <> 0);
  if v_muda_pago then
    if not public.fn_conciliacao_pode_mexer_no_pago(v_tipo_lanc) then
      raise exception 'Sem permissao para alterar um pagamento ja registrado';
    end if;
    perform public.fn_exigir_competencia_aberta(v_mes_lanc, 'lancamento', v_p.lancamento_id);
  end if;

  if v_p.status = 'pago' then
    if v_p.conta_bancaria_id is distinct from v_t.conta_bancaria_id then
      select nome into v_conta_antiga from public.contas_bancarias where id = v_p.conta_bancaria_id;
      select nome into v_conta_nova from public.contas_bancarias where id = v_t.conta_bancaria_id;
      update public.lancamento_parcelas
         set conta_bancaria_id = v_t.conta_bancaria_id
       where id = v_p.id;
      v_partes := v_partes || format('conta trocada de %s para %s',
        coalesce(v_conta_antiga, 'nenhuma'), v_conta_nova);
    end if;
  elsif v_tipo_lanc = 'a_pagar' and v_p.status = 'aprovado' then
    if not public.tem_permissao('financeiro.pagamentos', 'criar') then
      raise exception 'Sem permissao para registrar pagamentos';
    end if;
  elsif v_tipo_lanc = 'a_pagar' then
    raise exception 'Esta parcela ainda nao foi aprovada para pagamento: aprove em Aprovacao de pagamentos antes de casar';
  elsif v_status_lanc is not null and v_p.status in ('pendente', 'aprovado') then
    if not public.tem_permissao('financeiro.recebimentos', 'editar') then
      raise exception 'Sem permissao para dar recebimento como recebido';
    end if;
  else
    raise exception 'Esta parcela nao pode ser conciliada (situacao: %)', v_p.status;
  end if;

  if v_p.status <> 'pago' then
    update public.lancamento_parcelas
       set status = 'pago',
           conta_bancaria_id = v_t.conta_bancaria_id,
           data_pagamento = v_t.data_movimento,
           pago_por = (select auth.uid()),
           pago_em = now()
     where id = v_p.id;
    v_partes := v_partes || format('baixa em %s pelo extrato',
      to_char(v_t.data_movimento, 'DD/MM/YYYY'));
  end if;

  if v_diferenca <> 0 then
    v_juros := coalesce(v_p.juros, 0);
    v_desconto := coalesce(v_p.desconto, 0);
    if v_diferenca > 0 then
      if v_desconto >= v_diferenca then
        v_desconto := v_desconto - v_diferenca;
      else
        v_juros := v_juros + (v_diferenca - v_desconto);
        v_desconto := 0;
      end if;
    else
      if v_juros >= -v_diferenca then
        v_juros := v_juros + v_diferenca;
      else
        v_desconto := v_desconto + (-v_diferenca - v_juros);
        v_juros := 0;
      end if;
    end if;

    if v_desconto > v_p.valor then
      raise exception 'A diferenca e maior que a propria parcela: confira o movimento';
    end if;

    update public.lancamento_parcelas
       set juros = v_juros, desconto = v_desconto
     where id = v_p.id;
    v_partes := v_partes || format('valor ajustado de R$ %s para R$ %s',
      to_char(round(v_p.valor_liquido, 2), 'FM999G999G990D00'),
      to_char(v_banco, 'FM999G999G990D00'));
  end if;

  if array_length(v_partes, 1) > 0 then
    insert into public.parcela_eventos (parcela_id, tipo, motivo, valor_de, valor_para, created_by)
    values (
      v_p.id, 'alterou',
      'Conciliacao do extrato: ' || array_to_string(v_partes, '; '),
      case when v_diferenca <> 0 then round(v_p.valor_liquido, 2) end,
      case when v_diferenca <> 0 then v_banco end,
      (select auth.uid())
    );
    perform public.fn_recalcular_status_lancamento(v_p.lancamento_id);
  end if;

  if v_p.status <> 'pago' then
    perform public.fn_propagar_anexos('lancamento', v_p.lancamento_id, 'pagamento', v_p.id);
  end if;

  perform public.fn_conciliar_transacao(p_transacao_id, v_p.id);
  update public.extrato_transacoes
     set conciliacao_automatica = coalesce(p_automatica, false)
   where id = p_transacao_id;
end;
$function$;

-- -------------------------------------------------------------
-- Lancar: created_by e tipo da categoria
-- -------------------------------------------------------------
create or replace function public.fn_conciliacao_lancar(
  p_transacao_id uuid,
  p_dados jsonb
)
returns uuid
language plpgsql
security definer
set search_path to ''
as $function$
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
  update public.extrato_transacoes set conciliacao_automatica = false where id = p_transacao_id;

  return v_lanc;
end;
$function$;

-- -------------------------------------------------------------
-- Trocar conta: permissao de quem paga e competencia
-- -------------------------------------------------------------
create or replace function public.fn_conciliacao_trocar_conta(
  p_parcela_id uuid,
  p_conta_id uuid,
  p_motivo text
)
returns void
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_p public.lancamento_parcelas;
  v_tipo text;
  v_mes date;
  v_antiga text;
  v_nova text;
  v_ativa boolean;
begin
  if not public.tem_permissao('financeiro.conciliacao', 'editar') then
    raise exception 'Sem permissao para conciliar';
  end if;
  if coalesce(btrim(p_motivo), '') = '' then
    raise exception 'Informe o motivo da troca de conta';
  end if;

  select * into v_p from public.lancamento_parcelas where id = p_parcela_id for update;
  if v_p.id is null then raise exception 'Parcela nao encontrada'; end if;
  if v_p.status <> 'pago' then raise exception 'So parcela paga muda de conta por aqui'; end if;
  if exists (select 1 from public.extrato_transacoes e where e.parcela_id = v_p.id) then
    raise exception 'Esta parcela esta conciliada: desfaca a conciliacao primeiro';
  end if;

  select l.tipo, l.mes_competencia into v_tipo, v_mes from public.lancamentos l where l.id = v_p.lancamento_id;
  if not public.fn_conciliacao_pode_mexer_no_pago(v_tipo) then
    raise exception 'Sem permissao para alterar um pagamento ja registrado';
  end if;
  perform public.fn_exigir_competencia_aberta(v_mes, 'lancamento', v_p.lancamento_id);

  select nome, ativo into v_nova, v_ativa from public.contas_bancarias where id = p_conta_id;
  if v_nova is null then raise exception 'Conta bancaria nao encontrada'; end if;
  if not v_ativa then raise exception 'Conta bancaria inativa'; end if;
  if v_p.conta_bancaria_id = p_conta_id then raise exception 'A parcela ja esta nesta conta'; end if;

  select nome into v_antiga from public.contas_bancarias where id = v_p.conta_bancaria_id;

  update public.lancamento_parcelas set conta_bancaria_id = p_conta_id where id = v_p.id;

  insert into public.parcela_eventos (parcela_id, tipo, motivo, created_by)
  values (
    v_p.id, 'alterou',
    format('Conciliacao do extrato: conta trocada de %s para %s. %s',
      coalesce(v_antiga, 'nenhuma'), v_nova, btrim(p_motivo)),
    (select auth.uid())
  );
end;
$function$;

-- -------------------------------------------------------------
-- Excluir: so lancamento de uma parcela, arquivo morto completo
-- -------------------------------------------------------------
alter table arquivo_morto.lancamentos_excluidos_conciliacao
  add column if not exists formas jsonb not null default '[]',
  add column if not exists eventos jsonb not null default '[]';

create or replace function public.fn_conciliacao_excluir_lancamento(
  p_parcela_id uuid,
  p_motivo text
)
returns void
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_lanc public.lancamentos;
  v_qtd int;
begin
  if not public.tem_permissao('financeiro.conciliacao', 'editar') then
    raise exception 'Sem permissao para conciliar';
  end if;
  if not public.tem_permissao('financeiro.lancamentos', 'excluir') then
    raise exception 'Sem permissao para excluir lancamentos';
  end if;
  if coalesce(btrim(p_motivo), '') = '' then
    raise exception 'Informe o motivo da exclusao';
  end if;

  select l.* into v_lanc
  from public.lancamentos l
  join public.lancamento_parcelas p on p.lancamento_id = l.id
  where p.id = p_parcela_id
  for update of l;
  if v_lanc.id is null then raise exception 'Parcela nao encontrada'; end if;

  if v_lanc.origem <> 'manual' then
    raise exception 'Este lancamento veio de outro modulo (%): corrija na origem', v_lanc.origem;
  end if;

  select count(*) into v_qtd from public.lancamento_parcelas where lancamento_id = v_lanc.id;
  if v_qtd > 1 then
    raise exception 'Este lancamento tem % parcelas: excluir aqui apagaria todas. Estorne esta parcela em Pagamentos ou corrija o lancamento em Lancamentos', v_qtd;
  end if;

  if exists (
    select 1 from public.extrato_transacoes e
    join public.lancamento_parcelas p on p.id = e.parcela_id
    where p.lancamento_id = v_lanc.id
  ) then
    raise exception 'Uma parcela deste lancamento esta conciliada: desfaca a conciliacao primeiro';
  end if;

  perform public.fn_exigir_competencia_aberta(v_lanc.mes_competencia, 'lancamento', v_lanc.id);

  insert into arquivo_morto.lancamentos_excluidos_conciliacao
    (lancamento_id, motivo, excluido_por, lancamento, parcelas, rateios, formas, eventos)
  values (
    v_lanc.id, btrim(p_motivo), (select auth.uid()), to_jsonb(v_lanc),
    coalesce((select jsonb_agg(to_jsonb(p)) from public.lancamento_parcelas p where p.lancamento_id = v_lanc.id), '[]'),
    coalesce((select jsonb_agg(to_jsonb(r)) from public.lancamento_rateios r where r.lancamento_id = v_lanc.id), '[]'),
    coalesce((select jsonb_agg(to_jsonb(f)) from public.lancamento_formas f where f.lancamento_id = v_lanc.id), '[]'),
    coalesce((select jsonb_agg(to_jsonb(e)) from public.parcela_eventos e
              join public.lancamento_parcelas p on p.id = e.parcela_id
              where p.lancamento_id = v_lanc.id), '[]')
  );

  delete from public.lancamentos where id = v_lanc.id;
end;
$function$;
