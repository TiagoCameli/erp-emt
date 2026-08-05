-- Desconto no pagamento da parcela.
--
-- Motivo: na migracao da BR-364 cinco parcelas foram pagas com desconto
-- (R$ 24.615,23 no total, R$ 24.600,00 numa unica de R$ 500.000,00). Sem campo
-- de desconto sobravam dois caminhos, os dois errados: baixar o valor da
-- parcela (que passa a divergir da nota e da planilha) ou pagar o valor cheio
-- (e todo relatorio que calcula "em aberto = valor menos parcelas" mostra
-- residuo em parcela JA QUITADA).
--
-- O ponto delicado desta migracao: NAO existe extrato interno nem coluna de
-- saldo. O saldo de conta bancaria e DERIVADO, recalculado a cada leitura, e
-- cada lugar que o deriva soma `parcela.valor`. Trocar so a funcao de pagar
-- deixaria a tela de Pagamentos certa e o saldo da conta errado para sempre,
-- porque ele e recalculado do zero a cada abertura.
--
-- Por isso o valor liquido ganha UMA definicao unica, a coluna gerada
-- `valor_liquido`, e todos os derivadores passam a le-la:
--   1. fn_pagar_parcela .... guarda de saldo insuficiente (so decide QUANDO o
--                            banco recusa; nao move saldo nenhum)
--   2. fn_rel_posicao_bancaria ... relatorio Posicao bancaria
--   3. fn_rel_fluxo_caixa ........ grafico de fluxo de caixa
--   4. fn_rel_gestao_financeiro_resumo ... KPI "pago no mes" do painel Gestao
--   5. fn_conciliar_transacao .... casamento com o extrato OFX: o banco debitou
--      o LIQUIDO, entao comparar com o valor cheio recusaria para sempre a
--      conciliacao de uma parcela paga com desconto (quinto lugar, achado aqui)
-- O sexto derivador e a coluna "Saldo atual" de Financeiro > Contas bancarias
-- (src/modules/financeiro/contas-bancarias/queries.ts). Ela NAO soma mais em
-- Node: passou a ler fn_rel_posicao_bancaria, a mesma do item 2. Somar parcela
-- por parcela ali era defeito independente do desconto, porque o PostgREST corta
-- a resposta em 1.000 linhas sem erro nenhum e a carga da BR-364 cria 1.696
-- parcelas pagas: a coluna que se confere com o extrato do banco ignoraria umas
-- 696 saidas em silencio e discordaria de Relatorios > Posicao bancaria. Com as
-- duas telas na mesma funcao, o valor_liquido chega agregado do banco e elas nao
-- tem como divergir.
--
-- fn_rel_aging NAO muda: ela ja filtra status in (pendente, em_revisao,
-- aprovado), entao parcela paga nunca entrou nela.
--
-- Sem juros e sem multa de proposito: a planilha tem a coluna e ela esta zerada
-- nas 1.773 linhas. Desconto e QUANTO se paga, nao SE pode pagar: nada aqui
-- toca regra de aprovacao, janela de pagamento ou carimbo de conferencia.

-- ---------------------------------------------------------------------------
-- 1. Coluna de desconto e o liquido derivado dela
-- ---------------------------------------------------------------------------

alter table public.lancamento_parcelas
  add column if not exists desconto numeric(14, 2) not null default 0;

comment on column public.lancamento_parcelas.desconto is
  'Abatimento concedido pelo credor no ato do pagamento, em reais. Zero quando '
  'nao houve. Quem grava e SO fn_pagar_parcela; fn_estornar_pagamento zera. '
  'Nao e juros nem multa: reduz o que sai do caixa, nao o valor devido.';

-- Check separado do ADD COLUMN para o arquivo poder ser reaplicado (e para a
-- prova rodar a migracao inteira dentro de begin/rollback).
do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.lancamento_parcelas'::regclass
      and conname = 'lancamento_parcelas_desconto_valido'
  ) then
    alter table public.lancamento_parcelas
      add constraint lancamento_parcelas_desconto_valido
      check (desconto >= 0 and desconto <= valor);
  end if;
end $$;

-- Coluna gerada, e nao view: e ela que da ao PostgREST um campo filtravel por
-- igualdade (a sugestao de conciliacao filtra `.eq(valor_liquido, X)`) e ao SQL
-- uma unica fonte do liquido, para nenhum derivador futuro de saldo poder
-- discordar dos outros.
alter table public.lancamento_parcelas
  add column if not exists valor_liquido numeric(14, 2)
  generated always as (valor - desconto) stored;

comment on column public.lancamento_parcelas.valor_liquido is
  'Valor menos desconto: o que de fato entrou ou saiu da conta bancaria. '
  'DEFINICAO UNICA de saldo derivado. Todo lugar que soma parcela paga para '
  'chegar a saldo, posicao bancaria, fluxo de caixa realizado ou casamento com '
  'extrato le esta coluna, nunca `valor`.';

-- Grant: `authenticated` tem SELECT no NIVEL DA TABELA (conferido antes desta
-- migracao), e grant de tabela cobre coluna nova. Nenhum grant de INSERT ou
-- UPDATE existe para ele em lancamento_parcelas: desconto so muda por
-- fn_pagar_parcela / fn_estornar_pagamento, que sao SECURITY DEFINER.

-- ---------------------------------------------------------------------------
-- 2. fn_pagar_parcela: aceita o desconto
-- ---------------------------------------------------------------------------
-- DROP antes do CREATE porque o parametro novo muda a assinatura. Sem o drop, a
-- versao de 3 argumentos continuaria viva ao lado da de 4 com default, e toda
-- chamada existente de 3 argumentos passaria a falhar com "function is not
-- unique" (as duas casariam). Com o drop, `p_desconto` omitido cai no default 0
-- e nenhuma chamada existente muda de comportamento.
drop function if exists public.fn_pagar_parcela(uuid, uuid, date);

create or replace function public.fn_pagar_parcela(
  p_parcela_id uuid,
  p_conta_id uuid,
  p_data_pagamento date,
  p_desconto numeric default 0
)
returns void
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_status text; v_lanc uuid; v_tipo text; v_valor numeric; v_saldo numeric;
  v_programada date; v_janela text; v_data_informada date; v_status_lanc text;
  v_hoje date := (now() at time zone 'America/Rio_Branco')::date;
  v_desconto numeric(14, 2);
  v_liquido numeric(14, 2);
begin
  select p.status, p.lancamento_id, l.tipo, p.valor, p.data_programada, l.status
  into v_status, v_lanc, v_tipo, v_valor, v_programada, v_status_lanc
  from public.lancamento_parcelas p
  join public.lancamentos l on l.id = p.lancamento_id
  where p.id = p_parcela_id;

  if v_status is null then raise exception 'Parcela nao encontrada'; end if;

  if v_status_lanc = 'cancelado' then
    raise exception 'Este lancamento esta cancelado: nao da para pagar esta parcela';
  end if;

  v_data_informada := coalesce(p_data_pagamento, v_hoje);

  if v_data_informada > v_hoje then
    raise exception 'A data do pagamento nao pode ser no futuro (hoje e %).',
      to_char(v_hoje, 'DD/MM/YYYY');
  end if;

  if v_tipo = 'a_pagar' then
    if not public.tem_permissao('financeiro.pagamentos', 'criar') then
      raise exception 'Sem permissao para registrar pagamentos';
    end if;
    if v_status = 'em_revisao' then
      raise exception 'Esta parcela esta em revisao: ela precisa ser reenviada e aprovada antes de pagar';
    end if;
    if v_status <> 'aprovado' then
      raise exception 'A parcela precisa estar aprovada para pagamento';
    end if;

    if v_programada is null then
      raise exception 'Esta parcela esta aprovada sem data programada: reprograme a data antes de pagar';
    end if;

    v_janela := public.fn_janela_pagamento();

    if v_janela = 'a_partir' then
      if v_hoje < v_programada then
        raise exception 'Pagamento autorizado a partir de %.',
          to_char(v_programada, 'DD/MM/YYYY');
      end if;
    else
      if v_hoje < v_programada then
        raise exception 'Pagamento autorizado para %.',
          to_char(v_programada, 'DD/MM/YYYY');
      elsif v_hoje > v_programada then
        raise exception 'A data autorizada (%) passou: reprograme a data antes de pagar.',
          to_char(v_programada, 'DD/MM/YYYY');
      end if;
    end if;
  else
    if not public.tem_permissao('financeiro.contas-receber', 'editar') then
      raise exception 'Sem permissao para baixar recebimentos';
    end if;
    if v_status not in ('pendente', 'aprovado') then
      raise exception 'Parcela ja baixada ou cancelada';
    end if;
  end if;

  -- Desconto do ato do pagamento. Nulo vira zero para as chamadas que nao
  -- informam o parametro continuarem identicas.
  --
  -- As duas recusas ficam DEPOIS do bloco de permissao de proposito, e nao no
  -- comeco da funcao: a segunda mensagem CITA O VALOR da parcela, e barreira
  -- que responde antes de checar quem esta chamando nao e barreira. Medido em
  -- producao com elas la em cima: um usuario com token valido e ZERO permissao,
  -- chamando a RPC com desconto absurdo, recebia de volta "O desconto
  -- (R$ 99999999.00) nao pode ser maior que o valor da parcela (R$ 777777.77)",
  -- ou seja, lia o valor de qualquer parcela cujo id conhecesse, um id por vez.
  -- Pela tela nada muda (a Server Action barra antes), mas o banco e a barreira
  -- final. O check da tabela continua sendo a ultima, nao a primeira.
  v_desconto := round(coalesce(p_desconto, 0), 2);

  if v_desconto < 0 then
    raise exception 'O desconto nao pode ser negativo.';
  end if;

  if v_desconto > v_valor then
    raise exception 'O desconto (R$ %) nao pode ser maior que o valor da parcela (R$ %).',
      round(v_desconto, 2), round(v_valor, 2);
  end if;

  -- O que de fato sai do caixa. Daqui para baixo, dinheiro que se move e
  -- v_liquido; v_valor continua sendo a divida, que o desconto nao reescreve.
  v_liquido := round(v_valor - v_desconto, 2);

  if p_conta_id is null then raise exception 'Informe a conta bancaria'; end if;

  if v_tipo = 'a_pagar' then
    -- Saldo derivado das parcelas JA pagas nesta conta. Passa a somar
    -- valor_liquido: com valor cheio, uma parcela paga com desconto rebaixaria
    -- o saldo desta guarda a cada nova conferencia e recusaria pagamento que
    -- cabe na conta.
    select c.saldo_inicial
      + coalesce(sum(case when l.tipo = 'a_receber' then p.valor_liquido else -p.valor_liquido end), 0)
    into v_saldo
    from public.contas_bancarias c
    left join public.lancamento_parcelas p on p.conta_bancaria_id = c.id and p.status = 'pago'
    left join public.lancamentos l on l.id = p.lancamento_id
    where c.id = p_conta_id
    group by c.saldo_inicial;

    -- Compara com o liquido: o desconto nao sai da conta, entao exigir saldo
    -- para o valor cheio barraria pagamento que a conta aguenta.
    if coalesce(v_saldo, 0) - v_liquido < 0 then
      raise exception 'Saldo insuficiente na conta: saldo atual R$ %, pagamento de R$ %.',
        round(coalesce(v_saldo, 0), 2), round(v_liquido, 2);
    end if;
  end if;

  update public.lancamento_parcelas
  set status = 'pago', conta_bancaria_id = p_conta_id,
      data_pagamento = v_data_informada,
      desconto = v_desconto,
      pago_por = (select auth.uid()), pago_em = now()
  where id = p_parcela_id;
  perform public.fn_recalcular_status_lancamento(v_lanc);

  perform public.fn_propagar_anexos('lancamento', v_lanc, 'pagamento', p_parcela_id);
end;
$function$;

-- Funcao nova nasce com EXECUTE para PUBLIC: revogar e obrigatorio, senao
-- `anon` (que hoje nao executa nada) ganharia acesso de brinde.
revoke all on function public.fn_pagar_parcela(uuid, uuid, date, numeric) from public;
grant execute on function public.fn_pagar_parcela(uuid, uuid, date, numeric) to authenticated;

-- ---------------------------------------------------------------------------
-- 3. fn_estornar_pagamento: zera o desconto ao devolver a parcela
-- ---------------------------------------------------------------------------
-- Sem isso a parcela volta a aberta carregando desconto de um pagamento que
-- nao existe mais: o liquido continuaria abatido no aging e no fluxo, e o
-- proximo pagamento sairia menor sem ninguem ter pedido.
create or replace function public.fn_estornar_pagamento(p_parcela_id uuid)
returns void
language plpgsql
security definer
set search_path to ''
as $function$
declare v_status text; v_lanc uuid; v_tipo text;
begin
  if not public.tem_permissao('financeiro.pagamentos', 'excluir') then
    raise exception 'Sem permissao para estornar pagamentos';
  end if;
  select p.status, p.lancamento_id, l.tipo into v_status, v_lanc, v_tipo
    from public.lancamento_parcelas p join public.lancamentos l on l.id = p.lancamento_id
    where p.id = p_parcela_id;
  if v_status is null then raise exception 'Parcela nao encontrada'; end if;
  if v_status <> 'pago' then raise exception 'Esta parcela nao esta paga'; end if;
  if exists (select 1 from public.extrato_transacoes t where t.parcela_id = p_parcela_id) then
    raise exception 'Nao da para estornar: este pagamento esta conciliado. Desfaca a conciliacao primeiro';
  end if;
  update public.lancamento_parcelas
    set status = case when v_tipo = 'a_pagar' then 'aprovado' else 'pendente' end,
        conta_bancaria_id = null, data_pagamento = null, pago_por = null, pago_em = null,
        desconto = 0
    where id = p_parcela_id;
  perform public.fn_recalcular_status_lancamento(v_lanc);
end $function$;

-- ---------------------------------------------------------------------------
-- 4. fn_conciliar_transacao: casa com o extrato pelo liquido
-- ---------------------------------------------------------------------------
-- Quinto derivador do saldo, e o mais silencioso: o banco debitou valor menos
-- desconto, entao comparar com o valor cheio recusaria PARA SEMPRE a
-- conciliacao de uma parcela paga com desconto, com a mensagem enganosa de que
-- o valor diverge.
create or replace function public.fn_conciliar_transacao(p_transacao_id uuid, p_parcela_id uuid)
returns void
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_t_conta uuid; v_t_valor numeric(14,2); v_t_tipo text; v_t_conciliada boolean;
  v_p_status text; v_p_conta uuid; v_p_liquido numeric(14,2); v_l_tipo text;
begin
  if not public.tem_permissao('financeiro.conciliacao', 'editar') then raise exception 'Sem permissao para conciliar'; end if;

  select t.conta_bancaria_id, t.valor, t.tipo, t.conciliada
  into v_t_conta, v_t_valor, v_t_tipo, v_t_conciliada
  from public.extrato_transacoes t where t.id = p_transacao_id;
  if v_t_conta is null then raise exception 'Transacao nao encontrada'; end if;
  if v_t_conciliada then raise exception 'Transacao ja conciliada'; end if;

  select p.status, p.conta_bancaria_id, p.valor_liquido, l.tipo
  into v_p_status, v_p_conta, v_p_liquido, v_l_tipo
  from public.lancamento_parcelas p join public.lancamentos l on l.id = p.lancamento_id
  where p.id = p_parcela_id;
  if v_p_status is null then raise exception 'Parcela nao encontrada'; end if;
  if v_p_status <> 'pago' then raise exception 'So da para conciliar uma parcela ja paga'; end if;
  if v_p_conta is distinct from v_t_conta then raise exception 'A parcela e de outra conta bancaria'; end if;
  if round(v_p_liquido, 2) <> round(abs(v_t_valor), 2) then raise exception 'O valor da parcela diverge do valor da transacao'; end if;
  if (v_t_tipo = 'credito' and v_l_tipo <> 'a_receber')
     or (v_t_tipo = 'debito' and v_l_tipo <> 'a_pagar') then
    raise exception 'O sentido da transacao nao corresponde ao tipo do lancamento';
  end if;
  if exists (select 1 from public.extrato_transacoes where parcela_id = p_parcela_id and id <> p_transacao_id) then
    raise exception 'Parcela ja conciliada com outra transacao';
  end if;

  update public.extrato_transacoes
  set conciliada = true, parcela_id = p_parcela_id, conciliado_por = (select auth.uid()), conciliado_em = now()
  where id = p_transacao_id;
end $function$;

-- ---------------------------------------------------------------------------
-- 5. fn_rel_posicao_bancaria: relatorio Posicao bancaria
-- ---------------------------------------------------------------------------
create or replace function public.fn_rel_posicao_bancaria()
returns table(conta_bancaria_id uuid, tipo text, total numeric)
language sql
stable
set search_path to ''
as $function$
  -- valor_liquido, nao valor: aqui so entra parcela paga, e o que a conta
  -- movimentou foi o liquido.
  select p.conta_bancaria_id, l.tipo, sum(p.valor_liquido) as total
  from public.lancamento_parcelas p
  join public.lancamentos l on l.id = p.lancamento_id
  where p.status = 'pago'
    and p.conta_bancaria_id is not null
    and l.status <> 'cancelado'
  group by p.conta_bancaria_id, l.tipo
$function$;

-- ---------------------------------------------------------------------------
-- 6. fn_rel_fluxo_caixa: grafico de fluxo de caixa
-- ---------------------------------------------------------------------------
create or replace function public.fn_rel_fluxo_caixa()
returns table(mes text, tipo text, realizado boolean, total numeric)
language sql
stable
set search_path to ''
as $function$
  select t.mes, t.tipo, t.realizado, sum(t.valor) as total
  from (
    select
      case
        when p.status = 'pago'
          then to_char(coalesce(p.data_pagamento, p.data_vencimento), 'YYYY-MM')
        else to_char(coalesce(p.data_programada, p.data_vencimento), 'YYYY-MM')
      end as mes,
      l.tipo,
      (p.status = 'pago') as realizado,
      -- Realizado sai pelo liquido (foi o que passou no caixa). Previsto tem
      -- desconto zero por construcao, entao a linha nao paga nao muda: o
      -- desconto so nasce no ato do pagamento e o estorno o zera.
      p.valor_liquido as valor
    from public.lancamento_parcelas p
    join public.lancamentos l on l.id = p.lancamento_id
    where p.status <> 'cancelado'
      and l.status <> 'cancelado'
  ) t
  where t.mes is not null
  group by t.mes, t.tipo, t.realizado
$function$;

-- ---------------------------------------------------------------------------
-- 7. fn_rel_gestao_financeiro_resumo: KPIs do painel de Gestao
-- ---------------------------------------------------------------------------
create or replace function public.fn_rel_gestao_financeiro_resumo(p_hoje date default null::date)
returns table(a_pagar_contagem integer, a_pagar_vencidas integer, a_pagar_valor numeric, a_aprovar_contagem integer, a_aprovar_valor numeric, pago_mes_contagem integer, pago_mes_valor numeric)
language sql
stable
set search_path to ''
as $function$
  with janela as (
    select
      d.hoje,
      d.hoje + 7 as limite7,
      date_trunc('month', d.hoje)::date as inicio_mes,
      (date_trunc('month', d.hoje) + interval '1 month')::date as proximo_mes
    from (
      select coalesce(
        p_hoje,
        (now() at time zone 'America/Rio_Branco')::date
      ) as hoje
    ) d
  ),
  base as (
    -- Lancamento cancelado nao e divida: fora dos tres cortes, com o MESMO
    -- criterio das fn_rel_* irmas. Parcela cancelada ja cai fora sozinha,
    -- porque cada corte abaixo exige um status exato de parcela.
    select p.status, p.valor, p.valor_liquido, p.data_vencimento, p.data_pagamento
    from public.lancamento_parcelas p
    join public.lancamentos l on l.id = p.lancamento_id
    where l.tipo = 'a_pagar'
      and l.status <> 'cancelado'
  )
  -- left join ... on true garante uma linha mesmo com base vazia: os FILTER
  -- viram falso e a funcao devolve zeros, nunca "nenhuma linha".
  select
    count(*) filter (
      where b.status = 'aprovado' and b.data_vencimento <= j.limite7
    )::int,
    count(*) filter (
      where b.status = 'aprovado'
        and b.data_vencimento <= j.limite7
        and b.data_vencimento < j.hoje
    )::int,
    -- A pagar e a aprovar seguem no valor CHEIO: e divida em aberto, e desconto
    -- ainda nao houve (parcela nao paga tem desconto zero de todo jeito).
    coalesce(sum(b.valor) filter (
      where b.status = 'aprovado' and b.data_vencimento <= j.limite7
    ), 0),
    count(*) filter (where b.status = 'pendente')::int,
    coalesce(sum(b.valor) filter (where b.status = 'pendente'), 0),
    count(*) filter (
      where b.status = 'pago'
        and b.data_pagamento >= j.inicio_mes
        and b.data_pagamento < j.proximo_mes
    )::int,
    -- Pago no mes e caixa que saiu: liquido.
    coalesce(sum(b.valor_liquido) filter (
      where b.status = 'pago'
        and b.data_pagamento >= j.inicio_mes
        and b.data_pagamento < j.proximo_mes
    ), 0)
  from janela j
  left join base b on true
$function$;

-- PostgREST precisa reler o schema: coluna nova e assinatura nova de RPC.
notify pgrst, 'reload schema';
