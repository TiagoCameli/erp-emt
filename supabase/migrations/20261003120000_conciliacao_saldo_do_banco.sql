-- =============================================================
-- Conciliacao 100% precisa, Bloco B: o mes so fecha com o saldo do banco
--
-- Pedido do Tiago (03/10/2026): "fechado" significava as duas listas zeradas,
-- o que nao pega dois lancamentos trocados de mesmo valor nem casamento
-- errado. O saldo e a prova.
--
-- 1. extratos_ofx ganha saldo_final e saldo_final_data (LEDGERBAL do OFX).
-- 2. fn_conciliacao_importar: importacao nova, que grava o saldo. Nao mexo na
--    assinatura de fn_importar_extrato (o codigo no ar chama ela; outra
--    sobrecarga com parametros a mais ficaria ambigua no PostgREST). A antiga
--    sai quando o Tiago autorizar, depois do deploy.
-- 3. fn_conciliacao_saldo_app(conta, data): saldo da conta no app no fim do
--    dia, mesma base de fn_saldo_conta/fn_rel_posicao_bancaria (saldo inicial
--    + pagos e recebidos depois do corte, sem categoria de movimentacao salvo
--    aplicacao, + transferencias). Nao altera fn_rel_posicao_bancaria nem nada
--    que fn_pagar_parcela use. Quem nao ve saldo da conta recebe null.
-- 4. fn_conciliacao_painel devolve 'saldo' (banco, app, diferenca, bate). O
--    'bate' sai mesmo para quem nao ve valores: o status do mes e do servidor.
-- =============================================================

alter table public.extratos_ofx
  add column if not exists saldo_final numeric(14, 2),
  add column if not exists saldo_final_data date;

comment on column public.extratos_ofx.saldo_final is
  'Saldo final do extrato (LEDGERBAL/BALAMT do OFX). Null quando o arquivo nao traz.';

-- -------------------------------------------------------------
-- Saldo do app numa data
-- -------------------------------------------------------------
create or replace function public.fn_conciliacao_saldo_app_interno(p_conta_id uuid, p_data date)
returns numeric
language sql
stable
security definer
set search_path to ''
as $function$
  with c as (
    select id, saldo_inicial, saldo_inicial_data from public.contas_bancarias where id = p_conta_id
  ),
  parcelas as (
    select coalesce(sum(case when l.tipo = 'a_receber' then p.valor_liquido else -p.valor_liquido end), 0) as total
    from public.lancamento_parcelas p
    join public.lancamentos l on l.id = p.lancamento_id
    left join public.categorias_financeiras cf on cf.id = l.categoria_id
    join c on c.id = p.conta_bancaria_id
    where p.status = 'pago'
      and l.status <> 'cancelado'
      and (coalesce(cf.natureza, 'operacional') <> 'movimentacao' or l.origem = 'aplicacao')
      and (c.saldo_inicial_data is null or p.data_pagamento is null or p.data_pagamento > c.saldo_inicial_data)
      and (p.data_pagamento is null or p.data_pagamento <= p_data)
  ),
  entradas as (
    select coalesce(sum(t.valor), 0) as total
    from public.transferencias_contas t join c on c.id = t.conta_destino_id
    where (c.saldo_inicial_data is null or t.data_transferencia > c.saldo_inicial_data)
      and t.data_transferencia <= p_data
  ),
  saidas as (
    select coalesce(sum(t.valor + t.tarifa), 0) as total
    from public.transferencias_contas t join c on c.id = t.conta_origem_id
    where (c.saldo_inicial_data is null or t.data_transferencia > c.saldo_inicial_data)
      and t.data_transferencia <= p_data
  )
  select round(c.saldo_inicial + parcelas.total + entradas.total - saidas.total, 2)
  from c, parcelas, entradas, saidas
$function$;

revoke all on function public.fn_conciliacao_saldo_app_interno(uuid, date) from public, anon, authenticated;

create or replace function public.fn_conciliacao_saldo_app(p_conta_id uuid, p_data date)
returns numeric
language plpgsql
stable
security definer
set search_path to ''
as $function$
begin
  if not public.tem_permissao('financeiro.conciliacao', 'ver') then
    raise exception 'Sem permissao para ver a conciliacao';
  end if;
  if not public.fn_pode_ver_saldo(p_conta_id) then
    return null;
  end if;
  return public.fn_conciliacao_saldo_app_interno(p_conta_id, p_data);
end;
$function$;

revoke all on function public.fn_conciliacao_saldo_app(uuid, date) from public, anon;
grant execute on function public.fn_conciliacao_saldo_app(uuid, date) to authenticated;

-- -------------------------------------------------------------
-- Importacao nova, com saldo
-- -------------------------------------------------------------
create or replace function public.fn_conciliacao_importar(
  p_conta_id uuid,
  p_nome text,
  p_periodo_inicio date,
  p_periodo_fim date,
  p_saldo_final numeric,
  p_saldo_final_data date,
  p_transacoes jsonb
)
returns jsonb
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_extrato uuid; v_t jsonb; v_inseridas int := 0; v_ignoradas int := 0; v_tipo text;
  v_conta_ativa boolean; v_fitid text; v_data date; v_valor numeric(14,2); v_memo text; v_chave text;
begin
  if not public.tem_permissao('financeiro.conciliacao', 'criar') then raise exception 'Sem permissao para importar extratos'; end if;
  if p_conta_id is null then raise exception 'Informe a conta bancaria'; end if;
  if p_transacoes is null or jsonb_array_length(p_transacoes) = 0 then raise exception 'O arquivo nao tem transacoes'; end if;

  select ativo into v_conta_ativa from public.contas_bancarias where id = p_conta_id;
  if v_conta_ativa is null then raise exception 'Conta bancaria nao encontrada'; end if;
  if not v_conta_ativa then raise exception 'Conta bancaria inativa'; end if;

  insert into public.extratos_ofx (conta_bancaria_id, nome_arquivo, periodo_inicio, periodo_fim, saldo_final, saldo_final_data, created_by)
  values (p_conta_id, p_nome, p_periodo_inicio, p_periodo_fim, round(p_saldo_final, 2), p_saldo_final_data, (select auth.uid()))
  returning id into v_extrato;

  for v_t in select * from jsonb_array_elements(p_transacoes) loop
    v_fitid := nullif(btrim(v_t->>'fitid'), '');
    v_data := (v_t->>'data')::date;
    v_valor := (v_t->>'valor')::numeric;
    v_memo := v_t->>'memo';
    v_tipo := case when v_valor >= 0 then 'credito' else 'debito' end;
    v_chave := coalesce(v_fitid, 'sd:' || to_char(v_data, 'YYYY-MM-DD') || ':' || to_char(v_valor, 'FM9999999999999990.00') || ':' || coalesce(v_memo, ''));
    begin
      insert into public.extrato_transacoes (extrato_id, conta_bancaria_id, data_movimento, valor, tipo, memo, fitid, chave_dedup)
      values (v_extrato, p_conta_id, v_data, v_valor, v_tipo, v_memo, v_fitid, v_chave);
      v_inseridas := v_inseridas + 1;
    exception when unique_violation then
      v_ignoradas := v_ignoradas + 1;
    end;
  end loop;

  return jsonb_build_object('extrato_id', v_extrato, 'inseridas', v_inseridas, 'ignoradas', v_ignoradas);
end
$function$;

revoke all on function public.fn_conciliacao_importar(uuid, text, date, date, numeric, date, jsonb) from public, anon;
grant execute on function public.fn_conciliacao_importar(uuid, text, date, date, numeric, date, jsonb) to authenticated;

-- -------------------------------------------------------------
-- Painel com saldo
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
  v_saldo jsonb;
  v_banco numeric(14, 2);
  v_banco_data date;
  v_tem_extrato boolean := false;
  v_app numeric(14, 2);
  v_pode_ver boolean;
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
      'bate', case when v_banco is null then null else v_banco = v_app end
    );
  end if;

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
