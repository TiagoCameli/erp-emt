-- =============================================================
-- Conciliacao: saldo do app em datas ANTES do corte
--
-- Tiago (03/10/2026): "no app o meu saldo no dia 31/12/2025 esta muito maior
-- do que o real". A conta BB 102.124-9 tem saldo inicial de R$ 155.484,34
-- em 21/08/2026 (o corte da migracao), e fn_conciliacao_saldo_app_interno so
-- somava o que vem depois do corte: para qualquer data anterior devolvia o
-- proprio saldo inicial, parado. Errado para conciliar 2025.
--
-- Agora, para data anterior ao corte, o saldo e calculado PARA TRAS:
--   saldo(D) = saldo inicial - movimentos com data em (D, corte]
-- com os mesmos filtros (pagos/recebidos, sem categoria de movimentacao salvo
-- aplicacao, transferencias). Depois do corte nada muda. O painel passa a
-- dizer quando o saldo e anterior ao corte.
--
-- Conferido com os extratos do BB de 2025: janeiro e fevereiro ficam com a
-- MESMA diferenca (R$ 900.437,41), ou seja, o movimento desses meses confere
-- e a diferenca vem de meses posteriores (Rende Facil nao lancado antes do
-- corte e/ou saldo inicial da corrente incluindo o aplicado).
-- =============================================================

create or replace function public.fn_conciliacao_saldo_app_interno(p_conta_id uuid, p_data date)
returns numeric
language plpgsql
stable
security definer
set search_path to ''
as $function$
declare
  v_inicial numeric;
  v_corte date;
  v_total numeric;
begin
  select saldo_inicial, saldo_inicial_data into v_inicial, v_corte
  from public.contas_bancarias where id = p_conta_id;

  if v_corte is null or p_data >= v_corte then
    -- Para frente: saldo inicial + o que veio depois do corte ate a data.
    select coalesce(sum(m.v), 0) into v_total from (
      select case when l.tipo = 'a_receber' then p.valor_liquido else -p.valor_liquido end as v
      from public.lancamento_parcelas p
      join public.lancamentos l on l.id = p.lancamento_id
      left join public.categorias_financeiras cf on cf.id = l.categoria_id
      where p.conta_bancaria_id = p_conta_id and p.status = 'pago' and l.status <> 'cancelado'
        and (coalesce(cf.natureza, 'operacional') <> 'movimentacao' or l.origem = 'aplicacao')
        and (v_corte is null or p.data_pagamento is null or p.data_pagamento > v_corte)
        and (p.data_pagamento is null or p.data_pagamento <= p_data)
      union all
      select t.valor from public.transferencias_contas t
      where t.conta_destino_id = p_conta_id
        and (v_corte is null or t.data_transferencia > v_corte) and t.data_transferencia <= p_data
      union all
      select -(t.valor + t.tarifa) from public.transferencias_contas t
      where t.conta_origem_id = p_conta_id
        and (v_corte is null or t.data_transferencia > v_corte) and t.data_transferencia <= p_data
    ) m;
    return round(v_inicial + v_total, 2);
  end if;

  -- Para tras: saldo inicial - o que aconteceu depois da data ate o corte.
  select coalesce(sum(m.v), 0) into v_total from (
    select case when l.tipo = 'a_receber' then p.valor_liquido else -p.valor_liquido end as v
    from public.lancamento_parcelas p
    join public.lancamentos l on l.id = p.lancamento_id
    left join public.categorias_financeiras cf on cf.id = l.categoria_id
    where p.conta_bancaria_id = p_conta_id and p.status = 'pago' and l.status <> 'cancelado'
      and (coalesce(cf.natureza, 'operacional') <> 'movimentacao' or l.origem = 'aplicacao')
      and p.data_pagamento > p_data and p.data_pagamento <= v_corte
    union all
    select t.valor from public.transferencias_contas t
    where t.conta_destino_id = p_conta_id and t.data_transferencia > p_data and t.data_transferencia <= v_corte
    union all
    select -(t.valor + t.tarifa) from public.transferencias_contas t
    where t.conta_origem_id = p_conta_id and t.data_transferencia > p_data and t.data_transferencia <= v_corte
  ) m;
  return round(v_inicial - v_total, 2);
end;
$function$;

revoke all on function public.fn_conciliacao_saldo_app_interno(uuid, date) from public, anon, authenticated;

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
  v_saldo jsonb;
  v_banco numeric(14, 2);
  v_banco_data date;
  v_tem_extrato boolean := false;
  v_app numeric(14, 2);
  v_pode_ver boolean;
  v_fechamento jsonb;
  v_corte date;
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

  -- Saldo do banco: o do extrato que cobre o ultimo dia do periodo (o mais
  -- recente importado, se houver mais de um). A data e a menor entre o DTASOF
  -- e o fim do periodo: o BB poe no DTASOF o dia da exportacao, mas o saldo e
  -- o do fim do extrato.
  select true, e.saldo_final, least(coalesce(e.saldo_final_data, e.periodo_fim), e.periodo_fim)
    into v_tem_extrato, v_banco, v_banco_data
  from public.extratos_ofx e
  where e.conta_bancaria_id = p_conta_id
    and e.periodo_inicio <= p_fim and e.periodo_fim >= p_fim
  order by e.importado_em desc
  limit 1;

  if coalesce(v_tem_extrato, false) then
    v_pode_ver := public.fn_pode_ver_saldo(p_conta_id);
    select saldo_inicial_data into v_corte from public.contas_bancarias where id = p_conta_id;
    if v_banco is not null then
      v_app := public.fn_conciliacao_saldo_app_interno(p_conta_id, v_banco_data);
    end if;
    -- Quem nao ve saldo recebe so se bateu ou nao, calculado aqui.
    v_saldo := jsonb_build_object(
      'data', v_banco_data,
      'temSaldoNoArquivo', v_banco is not null,
      'podeVer', v_pode_ver,
      'banco', case when v_pode_ver then v_banco end,
      'app', case when v_pode_ver then v_app end,
      'diferenca', case when v_pode_ver and v_banco is not null then v_banco - v_app end,
      'bate', case when v_banco is null then null else v_banco = v_app end,
      -- Antes do corte o saldo do app e calculado para tras a partir do
      -- saldo inicial: a tela diz isso, porque a diferenca pode vir de
      -- qualquer mes entre a data e o corte.
      'corte', v_corte,
      'antesDoCorte', v_corte is not null and v_banco_data < v_corte
    );
  end if;

  select jsonb_build_object(
           'fechadoEm', f.fechado_em,
           'fechadoPor', u.nome,
           'saldoBanco', case when public.fn_pode_ver_saldo(p_conta_id) then f.saldo_banco end)
    into v_fechamento
  from public.conciliacao_fechamentos f
  left join public.usuarios u on u.id = f.fechado_por
  where f.conta_bancaria_id = p_conta_id
    and f.mes = date_trunc('month', p_inicio)::date
    and f.reaberto_em is null;

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
    'saldo', v_saldo,
    'fechamento', v_fechamento,
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
