-- =============================================================
-- Conciliacao: estorno casa movimento com movimento
--
-- Pedido do Tiago (05/10/2026): PIX rejeitado, TED devolvida e boleto
-- devolvido nao sao lancamento. O banco tirou e devolveu; o certo e casar
-- o envio com a devolucao no proprio extrato, sem nada no financeiro.
--
-- 1. extrato_transacoes.estorno_par_id: o outro movimento do par. Os dois
--    ficam conciliados, um apontando para o outro. A trava de vinculo unico
--    passa a contar o estorno: um movimento casa com parcela, transferencia
--    OU outro movimento.
-- 2. fn_conciliacao_casar_estorno(a, b, automatica): mesma conta, sentidos
--    opostos, mesmo valor, ate 10 dias de distancia, os dois sem par e com
--    o mes aberto.
-- 3. fn_desconciliar_transacao solta os dois lados do estorno.
-- 4. fn_conciliacao_casar_lote aceita a especie 'estorno'.
-- 5. fn_conciliacao_painel devolve o par de cada movimento e os movimentos
--    sem par ate 10 dias antes e depois do periodo ('vizinhos').
--
-- Nada e removido e nenhuma assinatura em uso muda.
-- =============================================================

alter table public.extrato_transacoes
  add column if not exists estorno_par_id uuid references public.extrato_transacoes(id) on delete set null;

create index if not exists extrato_transacoes_estorno_par_idx
  on public.extrato_transacoes (estorno_par_id) where estorno_par_id is not null;

alter table public.extrato_transacoes drop constraint if exists extrato_transacoes_um_vinculo;
alter table public.extrato_transacoes add constraint extrato_transacoes_um_vinculo
  check (num_nonnulls(parcela_id, transferencia_id, estorno_par_id) <= 1);

create or replace function public.fn_conciliacao_casar_estorno(
  p_transacao_id uuid,
  p_par_id uuid,
  p_automatica boolean default false
)
returns void
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_a public.extrato_transacoes;
  v_b public.extrato_transacoes;
  v_quem uuid := (select auth.uid());
begin
  if not public.tem_permissao('financeiro.conciliacao', 'editar') then
    raise exception 'Sem permissao para conciliar';
  end if;
  if p_transacao_id is null or p_par_id is null or p_transacao_id = p_par_id then
    raise exception 'Escolha os dois movimentos do estorno';
  end if;

  -- Trava na mesma ordem sempre, para dois casamentos ao mesmo tempo nao
  -- se travarem.
  perform 1 from public.extrato_transacoes
   where id in (p_transacao_id, p_par_id) order by id for update;
  select * into v_a from public.extrato_transacoes where id = p_transacao_id;
  select * into v_b from public.extrato_transacoes where id = p_par_id;
  if v_a.id is null or v_b.id is null then raise exception 'Movimento do extrato nao encontrado'; end if;
  if v_a.conta_bancaria_id <> v_b.conta_bancaria_id then
    raise exception 'O estorno precisa ser da mesma conta';
  end if;
  if v_a.conciliada or v_b.conciliada then raise exception 'Um dos movimentos ja esta conciliado'; end if;
  if v_a.tipo = v_b.tipo then raise exception 'O estorno precisa de uma saida e uma entrada'; end if;
  if abs(v_a.valor) <> abs(v_b.valor) then
    raise exception 'O estorno precisa ter o mesmo valor: % e %',
      public.fn_conciliacao_brl(abs(v_a.valor)), public.fn_conciliacao_brl(abs(v_b.valor));
  end if;
  if abs(v_a.data_movimento - v_b.data_movimento) > 10 then
    raise exception 'O estorno precisa estar a ate 10 dias do envio';
  end if;
  perform public.fn_conciliacao_exigir_mes_aberto(v_a.conta_bancaria_id, v_a.data_movimento);
  perform public.fn_conciliacao_exigir_mes_aberto(v_b.conta_bancaria_id, v_b.data_movimento);

  update public.extrato_transacoes
     set conciliada = true,
         estorno_par_id = case when id = v_a.id then v_b.id else v_a.id end,
         conciliado_por = v_quem, conciliado_em = now(),
         conciliacao_automatica = coalesce(p_automatica, false)
   where id in (v_a.id, v_b.id);
end;
$function$;

revoke all on function public.fn_conciliacao_casar_estorno(uuid, uuid, boolean) from public, anon;
grant execute on function public.fn_conciliacao_casar_estorno(uuid, uuid, boolean) to authenticated;

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
begin
  if not public.tem_permissao('financeiro.conciliacao', 'editar') then raise exception 'Sem permissao para conciliar'; end if;
  select conta_bancaria_id, data_movimento, estorno_par_id into v_conta, v_data, v_par
  from public.extrato_transacoes where id = p_transacao_id;
  perform public.fn_conciliacao_exigir_mes_aberto(v_conta, v_data);
  -- Estorno: os dois lados saem juntos, e o mes do outro lado tambem
  -- precisa estar aberto.
  if v_par is not null then
    select data_movimento into v_par_data from public.extrato_transacoes where id = v_par;
    perform public.fn_conciliacao_exigir_mes_aberto(v_conta, v_par_data);
  end if;
  update public.extrato_transacoes
  set conciliada = false, parcela_id = null, transferencia_id = null, estorno_par_id = null,
      conciliado_por = null, conciliado_em = null, conciliacao_automatica = false
  where id = p_transacao_id or (v_par is not null and id = v_par);
end
$function$;

create or replace function public.fn_conciliacao_casar_lote(p_pares jsonb, p_automatica boolean)
returns jsonb
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_par jsonb;
  v_casadas int := 0;
  v_falhas jsonb := '[]'::jsonb;
begin
  if not public.tem_permissao('financeiro.conciliacao', 'editar') then
    raise exception 'Sem permissao para conciliar';
  end if;
  if jsonb_typeof(p_pares) is distinct from 'array' then
    raise exception 'Lista de pares invalida';
  end if;

  for v_par in select * from jsonb_array_elements(p_pares) loop
    begin
      if v_par->>'especie' = 'estorno' then
        perform public.fn_conciliacao_casar_estorno(
          (v_par->>'transacao')::uuid, (v_par->>'alvo')::uuid, coalesce(p_automatica, true));
      else
        perform public.fn_conciliacao_casar(
          (v_par->>'transacao')::uuid,
          v_par->>'especie',
          (v_par->>'alvo')::uuid,
          coalesce(p_automatica, true),
          null::text
        );
      end if;
      v_casadas := v_casadas + 1;
    exception when others then
      v_falhas := v_falhas || jsonb_build_object(
        'transacao', v_par->>'transacao', 'erro', sqlerrm);
    end;
  end loop;

  return jsonb_build_object('casadas', v_casadas, 'falhas', v_falhas);
end;
$function$;

create or replace function public.fn_conciliacao_painel(p_conta_id uuid, p_inicio date, p_fim date)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
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
          'data', tf.data_transferencia) end,
        'estorno', case when ep.id is null then null else jsonb_build_object(
          'id', ep.id, 'dataMovimento', ep.data_movimento, 'valor', ep.valor,
          'memo', ep.memo) end
      ) order by t.data_movimento, t.created_at)
      from public.extrato_transacoes t
      left join parcela_info pi on pi.id = t.parcela_id
      left join transf tf on tf.id = t.transferencia_id
      left join public.extrato_transacoes ep on ep.id = t.estorno_par_id
      where t.conta_bancaria_id = p_conta_id
        and t.data_movimento between p_inicio and p_fim
    ), '[]'::jsonb),

    -- Movimentos sem par logo antes e logo depois do periodo: o envio de
    -- uma TED devolvida no comeco do mes pode ter saido no mes anterior.
    'vizinhos', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', v.id, 'dataMovimento', v.data_movimento, 'valor', v.valor,
        'tipo', v.tipo, 'memo', v.memo) order by v.data_movimento)
      from public.extrato_transacoes v
      where v.conta_bancaria_id = p_conta_id
        and not v.conciliada
        and (v.data_movimento between p_inicio - 10 and p_inicio - 1
             or v.data_movimento between p_fim + 1 and p_fim + 10)
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
