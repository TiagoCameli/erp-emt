-- =============================================================
-- Conciliacao bancaria por conta, com casamento automatico
--
-- PEDIDO DO TIAGO (02/10/2026), com o extrato do BB 102.124-9 de 09/2026:
--   * a conciliacao e feita uma conta por vez;
--   * o app casa sozinho o que bate, e quem concilia pode trocar;
--   * o app mostra o que esta no banco e falta no app, e o que esta no app e
--     nao saiu do banco;
--   * o que falta no app e lancado ali mesmo, com centro de custo (etapa) e
--     mes de referencia;
--   * o que esta no app e nao no banco e corrigido: muda de conta ou sai.
--
-- O QUE O EXTRATO REAL MOSTROU (simulado antes de escrever isto):
--   508 movimentos; 415 casam por valor exato no mesmo dia, mas 67 deles tem
--   mais de uma parcela com o mesmo valor, entao o desempate e pelo nome do
--   favorecido no historico (feito no app, em casamento.ts). Dois boletos
--   divergem em R$ 0,01 da parcela: o casamento manual aceita ajustar a
--   diferenca como juros/desconto, com motivo gravado.
--
-- Leitura por RPC, e nao pelas tabelas: quem tem so financeiro.conciliacao nao
-- le lancamento_parcelas pelo RLS, e afrouxar o RLS das parcelas abriria a
-- tela de pagamentos inteira para quem so concilia. O painel devolve so o que
-- a conciliacao da conta precisa.
--
-- Eventos de parcela usam o tipo 'alterou' que ja existe, com o motivo dizendo
-- o que a conciliacao fez: a trilha do lancamento ja sabe exibir.
-- =============================================================

alter table public.extrato_transacoes
  add column if not exists conciliacao_automatica boolean not null default false;

comment on column public.extrato_transacoes.conciliacao_automatica is
  'true quando o vinculo foi feito pelo casamento automatico (valor exato, mesma conta). Quem concilia pode desfazer ou trocar; ao trocar manualmente volta a false.';

-- -------------------------------------------------------------
-- Painel: tudo que a tela de uma conta num periodo precisa
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

  -- Valores (em modulo) dos movimentos ainda sem par: so eles interessam na
  -- busca em outras contas e nas parcelas em aberto, que sao listas grandes.
  select coalesce(array_agg(distinct round(abs(t.valor), 2)), '{}')
    into v_valores
  from public.extrato_transacoes t
  where t.conta_bancaria_id = p_conta_id
    and t.data_movimento between p_inicio and p_fim
    and not t.conciliada;

  with parcela_info as (
    select
      p.id, p.lancamento_id, p.numero_parcela, p.status, p.valor, p.desconto,
      p.juros, p.outras_despesas, p.valor_liquido, p.data_pagamento,
      p.data_vencimento, p.data_programada, p.conta_bancaria_id,
      l.numero as lancamento_numero, l.descricao, l.tipo, l.origem,
      l.numero_documento,
      coalesce(f.nome_fantasia, f.razao_social, cl.nome_fantasia, cl.nome, co.nome) as nome,
      f.razao_social as razao_social,
      cb.nome as conta_nome,
      (select count(*) from public.lancamento_parcelas p2 where p2.lancamento_id = p.lancamento_id) as qtd_parcelas
    from public.lancamento_parcelas p
    join public.lancamentos l on l.id = p.lancamento_id
    left join public.fornecedores f on f.id = l.fornecedor_id
    left join public.clientes cl on cl.id = l.cliente_id
    left join public.colaboradores co on co.id = l.colaborador_id
    left join public.contas_bancarias cb on cb.id = p.conta_bancaria_id
    where l.status <> 'cancelado'
  ),
  livres as (
    select pi.* from parcela_info pi
    where not exists (select 1 from public.extrato_transacoes e where e.parcela_id = pi.id)
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

    -- Parcelas pagas nesta conta e sem extrato, com folga nas bordas: o que
    -- cai DENTRO do periodo e nao casar e o "no app, fora do banco".
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
          and data_pagamento between p_inicio - v_folga_paga and p_fim + v_folga_paga
      ) lv
    ), '[]'::jsonb),

    -- Pagas em OUTRA conta com o valor de um movimento sem par: e o caso do
    -- pagamento lancado na conta errada.
    'pagasEmOutraConta', coalesce((
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
          and conta_bancaria_id is distinct from p_conta_id
          and data_pagamento between p_inicio - v_folga_paga and p_fim + v_folga_paga
          and round(valor_liquido, 2) = any (v_valores)
      ) lv
    ), '[]'::jsonb),

    -- Parcelas ainda nao pagas com o valor de um movimento sem par: o banco
    -- ja pagou, o app ainda nao deu baixa.
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
        from livres
        where status in ('pendente', 'aprovado')
          and coalesce(data_programada, data_vencimento)
              between p_inicio - v_folga_aberta and p_fim + v_folga_aberta
          and round(valor_liquido, 2) = any (v_valores)
      ) lv
    ), '[]'::jsonb),

    -- Transferencias que passam por esta conta com o lado ainda livre.
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

revoke all on function public.fn_conciliacao_painel(uuid, date, date) from public, anon;
grant execute on function public.fn_conciliacao_painel(uuid, date, date) to authenticated;

-- -------------------------------------------------------------
-- Casar um movimento com uma parcela ou transferencia
-- -------------------------------------------------------------
-- Parcela paga nesta conta: casa direto.
-- Parcela paga em outra conta: muda a conta para a do extrato e casa.
-- Parcela em aberto (pendente/aprovada): da baixa na data do movimento e casa.
-- Diferenca de valor: so com p_ajustar, vira juros (banco saiu mais) ou
-- desconto (banco saiu menos), com motivo no evento da parcela.
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
  v_conta_antiga text;
  v_conta_nova text;
  v_banco numeric(14, 2);
  v_diferenca numeric(14, 2);
  v_juros numeric(14, 2);
  v_desconto numeric(14, 2);
  v_partes text[] := '{}';
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

  select l.tipo, l.status into v_tipo_lanc, v_status_lanc
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

  -- O automatico so casa o que nao muda nada na parcela: paga, nesta conta,
  -- valor exato. Trocar conta, dar baixa ou ajustar centavo e decisao de quem
  -- concilia.
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
  elsif v_p.status in ('pendente', 'aprovado') then
    if v_tipo_lanc = 'a_pagar' and not public.tem_permissao('financeiro.pagamentos', 'criar') then
      raise exception 'Sem permissao para registrar pagamentos';
    end if;
    if v_tipo_lanc = 'a_receber' and not public.tem_permissao('financeiro.recebimentos', 'editar') then
      raise exception 'Sem permissao para dar recebimento como recebido';
    end if;
    update public.lancamento_parcelas
       set status = 'pago',
           conta_bancaria_id = v_t.conta_bancaria_id,
           data_pagamento = v_t.data_movimento,
           pago_por = (select auth.uid()),
           pago_em = now()
     where id = v_p.id;
    v_partes := v_partes || format('baixa em %s pelo extrato',
      to_char(v_t.data_movimento, 'DD/MM/YYYY'));
  else
    raise exception 'Esta parcela nao pode ser conciliada (situacao: %)', v_p.status;
  end if;

  if v_diferenca <> 0 then
    if not coalesce(p_ajustar, false) then
      raise exception 'O valor do extrato (R$ %) difere da parcela (R$ %)', v_banco, round(v_p.valor_liquido, 2);
    end if;

    -- Diferenca para mais: o banco saiu/entrou mais, vira juros. Para menos:
    -- primeiro consome juros que ja havia, depois vira desconto.
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

revoke all on function public.fn_conciliacao_casar(uuid, text, uuid, boolean, boolean) from public, anon;
grant execute on function public.fn_conciliacao_casar(uuid, text, uuid, boolean, boolean) to authenticated;

-- -------------------------------------------------------------
-- Casamento automatico em lote
-- -------------------------------------------------------------
-- Recebe os pares que o app calculou ([{transacao, especie, alvo}]) e casa um
-- a um. Um par que falha (alguem casou antes, valor mudou) nao derruba os
-- outros: vai para a lista de falhas.
create or replace function public.fn_conciliacao_casar_lote(p_pares jsonb)
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
      perform public.fn_conciliacao_casar(
        (v_par->>'transacao')::uuid,
        v_par->>'especie',
        (v_par->>'alvo')::uuid,
        true,
        false
      );
      v_casadas := v_casadas + 1;
    exception when others then
      v_falhas := v_falhas || jsonb_build_object(
        'transacao', v_par->>'transacao', 'erro', sqlerrm);
    end;
  end loop;

  return jsonb_build_object('casadas', v_casadas, 'falhas', v_falhas);
end;
$function$;

revoke all on function public.fn_conciliacao_casar_lote(jsonb) from public, anon;
grant execute on function public.fn_conciliacao_casar_lote(jsonb) to authenticated;

-- -------------------------------------------------------------
-- Lancar, ja pago e conciliado, um movimento que falta no app
-- -------------------------------------------------------------
-- p_dados: { descricao, mesCompetencia (YYYY-MM-01), centroCustoId,
--            categoriaId?, fornecedorId?, clienteId?, numeroDocumento?,
--            observacoes? }
-- O pagamento ja aconteceu no banco, entao o lancamento nasce pago, sem fila
-- de aprovacao. Quem lanca precisa poder criar lancamento do tipo.
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
  v_descricao text;
  v_lanc uuid;
  v_parcela uuid;
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
  exception when others then
    raise exception 'Centro de custo invalido';
  end;
  if v_centro is null then raise exception 'Informe o centro de custo'; end if;
  select c.ativo into v_centro_ok from public.centros_custo c where c.id = v_centro;
  if v_centro_ok is null then raise exception 'Centro de custo nao encontrado'; end if;
  if not v_centro_ok then raise exception 'Centro de custo inativo'; end if;

  v_lanc := gen_random_uuid();
  perform public.fn_exigir_competencia_aberta(v_mes, 'lancamento', v_lanc);

  insert into public.lancamentos (
    id, tipo, origem, fornecedor_id, cliente_id, categoria_id, centro_custo_id,
    descricao, valor, status, data_compra, mes_competencia, data_vencimento,
    numero_documento, observacoes
  ) values (
    v_lanc, v_tipo, 'manual',
    nullif(p_dados->>'fornecedorId', '')::uuid,
    nullif(p_dados->>'clienteId', '')::uuid,
    nullif(p_dados->>'categoriaId', '')::uuid,
    v_centro,
    v_descricao, v_valor, 'pago', v_t.data_movimento, v_mes, v_t.data_movimento,
    nullif(left(btrim(coalesce(p_dados->>'numeroDocumento', '')), 60), ''),
    left(coalesce(nullif(btrim(coalesce(p_dados->>'observacoes', '')), ''),
      'Lancado na conciliacao do extrato: ' || coalesce(v_t.memo, '-')), 2000)
  );

  insert into public.lancamento_parcelas (
    lancamento_id, numero_parcela, valor, data_vencimento, status,
    conta_bancaria_id, data_pagamento, pago_por, pago_em
  ) values (
    v_lanc, 1, v_valor, v_t.data_movimento, 'pago',
    v_t.conta_bancaria_id, v_t.data_movimento, (select auth.uid()), now()
  ) returning id into v_parcela;

  insert into public.lancamento_rateios (lancamento_id, centro_custo_id, valor, categoria_id)
  values (v_lanc, v_centro, v_valor, nullif(p_dados->>'categoriaId', '')::uuid);

  perform public.fn_conciliar_transacao(p_transacao_id, v_parcela);
  update public.extrato_transacoes set conciliacao_automatica = false where id = p_transacao_id;

  return v_lanc;
end;
$function$;

revoke all on function public.fn_conciliacao_lancar(uuid, jsonb) from public, anon;
grant execute on function public.fn_conciliacao_lancar(uuid, jsonb) to authenticated;

-- -------------------------------------------------------------
-- Lancar como transferencia (aplicacao/resgate, envio entre contas)
-- -------------------------------------------------------------
-- O sentido sai do movimento: debito sai desta conta para a contraparte,
-- credito vem da contraparte para esta. fn_salvar_transferencia cobra a
-- permissao de transferencias e a aplicacao quando envolve investimento.
create or replace function public.fn_conciliacao_lancar_transferencia(
  p_transacao_id uuid,
  p_conta_contraparte_id uuid,
  p_centro_custo_id uuid default null,
  p_descricao text default null
)
returns uuid
language plpgsql
security definer
set search_path to ''
as $function$
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
  update public.extrato_transacoes set conciliacao_automatica = false where id = p_transacao_id;
  return v_id;
end;
$function$;

revoke all on function public.fn_conciliacao_lancar_transferencia(uuid, uuid, uuid, text) from public, anon;
grant execute on function public.fn_conciliacao_lancar_transferencia(uuid, uuid, uuid, text) to authenticated;

-- -------------------------------------------------------------
-- No app e fora do banco: mudar a conta de uma parcela paga
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

revoke all on function public.fn_conciliacao_trocar_conta(uuid, uuid, text) from public, anon;
grant execute on function public.fn_conciliacao_trocar_conta(uuid, uuid, text) to authenticated;

-- -------------------------------------------------------------
-- No app e fora do banco: excluir o lancamento
-- -------------------------------------------------------------
-- So lancamento manual: o que nasceu de OC, folha, diaria ou aplicacao se
-- corrige na origem, senao a origem recria. Nenhuma parcela pode estar
-- conciliada. Copia em arquivo_morto antes de apagar, com o motivo.
create table if not exists arquivo_morto.lancamentos_excluidos_conciliacao (
  lancamento_id uuid not null,
  motivo text not null,
  excluido_por uuid,
  excluido_em timestamptz not null default now(),
  lancamento jsonb not null,
  parcelas jsonb not null,
  rateios jsonb not null
);

comment on table arquivo_morto.lancamentos_excluidos_conciliacao is
  'Lancamentos excluidos pela conciliacao bancaria (no app e fora do banco), com o motivo e copia integral para restaurar.';

revoke all on table arquivo_morto.lancamentos_excluidos_conciliacao from public, anon, authenticated;

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

  if exists (
    select 1 from public.extrato_transacoes e
    join public.lancamento_parcelas p on p.id = e.parcela_id
    where p.lancamento_id = v_lanc.id
  ) then
    raise exception 'Uma parcela deste lancamento esta conciliada: desfaca a conciliacao primeiro';
  end if;

  perform public.fn_exigir_competencia_aberta(v_lanc.mes_competencia, 'lancamento', v_lanc.id);

  insert into arquivo_morto.lancamentos_excluidos_conciliacao
    (lancamento_id, motivo, excluido_por, lancamento, parcelas, rateios)
  values (
    v_lanc.id, btrim(p_motivo), (select auth.uid()), to_jsonb(v_lanc),
    coalesce((select jsonb_agg(to_jsonb(p)) from public.lancamento_parcelas p where p.lancamento_id = v_lanc.id), '[]'),
    coalesce((select jsonb_agg(to_jsonb(r)) from public.lancamento_rateios r where r.lancamento_id = v_lanc.id), '[]')
  );

  delete from public.lancamentos where id = v_lanc.id;
end;
$function$;

revoke all on function public.fn_conciliacao_excluir_lancamento(uuid, text) from public, anon;
grant execute on function public.fn_conciliacao_excluir_lancamento(uuid, text) to authenticated;
