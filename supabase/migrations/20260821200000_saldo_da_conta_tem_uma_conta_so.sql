-- O saldo da conta bancária passa a ter UMA conta só, compartilhada pela tela e
-- pelo guard do pagamento.
--
-- ## O defeito
--
-- Existiam duas fórmulas de saldo:
--
--   TELA (fn_rel_posicao_bancaria + posicaoBancaria):
--     saldo_inicial + (a_receber pagas + transferência recebida)
--                   - (a_pagar pagas + transferência enviada + tarifa)
--
--   GUARD (fn_pagar_parcela):
--     saldo_inicial + (a_receber pagas) - (a_pagar pagas)
--
-- O guard não conhecia `transferencias_contas`. Enquanto quase não havia
-- transferência no banco as duas coincidiam, e o guard vinha funcionando.
--
-- ## O que fez isso aparecer
--
-- A carga do histórico do Mais Controle (319 transferências, R$ 41,8 mi) entrou
-- em 21/08/2026 às 15:25:42 UTC. Ela abaixou `saldo_inicial` de cada conta para
-- PRESERVAR o saldo atual — e preservou, medido pela fórmula da TELA, que é a
-- que ela verificou antes e depois. Só que o guard perdeu de vista justamente as
-- transferências que compensam essa redução.
--
-- Efeito medido na conta operacional (BANCO DO BRASIL 102.124-9):
--
--   saldo_inicial              R$   2.158.293,23
--   a_receber pagas            R$   6.077.684,27
--   a_pagar pagas              R$  41.409.178,81
--   transferência recebida     R$  33.767.474,25   <- o guard não via
--   transferência enviada      R$     571.946,48   <- nem esta
--   ------------------------------------------------
--   saldo pela TELA            R$      22.326,46
--   saldo pelo GUARD           R$ -33.173.201,31
--
-- O último pagamento que passou por essa conta foi às 15:15:52 UTC, dez minutos
-- antes da carga. Depois dela, todo pagamento pela conta era recusado com
-- "Saldo insuficiente na conta: saldo atual R$ -33173201.31" — e são 857
-- parcelas em aberto apontando para ela.
--
-- ## O conserto
--
-- `fn_saldo_conta` passa a ser a ÚNICA definição de saldo, construída SOBRE a
-- mesma `fn_rel_posicao_bancaria` que a tela lê. Não é uma segunda fórmula
-- escrita igual: é a mesma fonte. Duas fórmulas de dinheiro escritas em dois
-- lugares divergem no primeiro movimento que alguém acrescenta de um lado só, e
-- foi exatamente o que aconteceu aqui.
--
-- De brinde, o guard herda um filtro que a tela já tinha e ele não: parcela paga
-- de lançamento CANCELADO não conta. Hoje isso não muda número nenhum (são 0
-- parcelas nessa situação), e é por isso que está escrito aqui em vez de virar
-- surpresa no dia em que a primeira aparecer.
--
-- ## O que este conserto NÃO resolve
--
-- Três contas (BANCO DO BRASIL 30.893-5, CAIXA ECONOMICA 578367973-5 e BANCO DO
-- BRASIL 1197-5 AMAZÔNIA) ficam com saldo calculado R$ 0,00, então pagamento por
-- elas continua recusado — como já era ANTES da carga, pelo mesmo motivo: o
-- `saldo_inicial` delas não é o saldo real do banco (ver o registro da carga em
-- supabase/carga/recebimentos_e_transferencias_mc_2026_08_20.sql). Isso é
-- calibração de dado, não código, e é decisão do dono.

create or replace function public.fn_saldo_conta(p_conta uuid)
returns numeric
language sql
stable
set search_path to ''
as $function$
  -- Lê o movimento da MESMA função que a tela lê. A regra de sinal é a mesma do
  -- `posicaoBancaria`: entra o que é a_receber ou transferência recebida, sai
  -- todo o resto (a_pagar e transferência enviada, esta já com a tarifa somada
  -- pela RPC, porque o banco debita valor mais tarifa da origem).
  select round(
           (select c.saldo_inicial
            from public.contas_bancarias c
            where c.id = p_conta)
           + coalesce(sum(
               case
                 when m.tipo in ('a_receber', 'transferencia_entrada') then m.total
                 else -m.total
               end
             ), 0),
           2)
  from public.fn_rel_posicao_bancaria() m
  where m.conta_bancaria_id = p_conta
$function$;

comment on function public.fn_saldo_conta(uuid) is
  'Saldo atual da conta bancaria: saldo_inicial mais o efeito de tudo que movimentou a conta (parcelas pagas dos dois tipos e as duas pontas das transferencias). Fonte unica: quem mostra saldo na tela e quem barra pagamento por saldo leem daqui.';

-- Funcao nova nasce com EXECUTE para PUBLIC. Quem a chama e a fn_pagar_parcela,
-- que e SECURITY DEFINER e roda como o dono, entao `authenticated` nao precisa de
-- grant nenhum aqui.
revoke all on function public.fn_saldo_conta(uuid) from public;

create or replace function public.fn_pagar_parcela(p_parcela_id uuid, p_conta_id uuid, p_data_pagamento date, p_desconto numeric DEFAULT 0, p_juros numeric DEFAULT 0, p_outras_despesas numeric DEFAULT 0, p_motivo text DEFAULT NULL::text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_status text; v_lanc uuid; v_tipo text; v_valor numeric; v_saldo numeric;
  v_programada date; v_janela text; v_data_informada date; v_status_lanc text;
  v_hoje date := (now() at time zone 'America/Rio_Branco')::date;
  v_desconto numeric(14, 2);
  v_juros numeric(14, 2);
  v_outras numeric(14, 2);
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

    if v_data_informada <> v_programada then
      if coalesce(btrim(p_motivo), '') = '' then
        raise exception 'Este pagamento esta fora da data autorizada (%): informe o motivo.',
          to_char(v_programada, 'DD/MM/YYYY');
      end if;
    end if;
  else
    if not public.tem_permissao('financeiro.recebimentos', 'editar') then
      raise exception 'Sem permissao para dar recebimento como recebido';
    end if;
    if v_status not in ('pendente', 'aprovado') then
      raise exception 'Recebimento ja baixado ou cancelado';
    end if;
  end if;

  v_desconto := round(coalesce(p_desconto, 0), 2);
  v_juros := round(coalesce(p_juros, 0), 2);
  v_outras := round(coalesce(p_outras_despesas, 0), 2);

  if v_desconto < 0 then
    raise exception 'O desconto nao pode ser negativo.';
  end if;

  if v_juros < 0 then
    raise exception 'Os juros nao podem ser negativos.';
  end if;

  if v_outras < 0 then
    raise exception 'As outras despesas nao podem ser negativas.';
  end if;

  if v_desconto > v_valor then
    raise exception 'O desconto (R$ %) nao pode ser maior que o valor da parcela (R$ %).',
      round(v_desconto, 2), round(v_valor, 2);
  end if;

  v_liquido := round(v_valor - v_desconto + v_juros + v_outras, 2);

  if p_conta_id is null then raise exception 'Informe a conta bancaria'; end if;

  if v_tipo = 'a_pagar' then
    -- MESMA conta de saldo que a tela mostra (ver fn_saldo_conta). Enquanto esta
    -- checagem tinha formula propria, ela ignorava transferencia entre contas: a
    -- conta operacional aparecia com R$ 22.326,46 na tela e R$ -33.173.201,31
    -- aqui, e nenhum pagamento passava.
    v_saldo := public.fn_saldo_conta(p_conta_id);

    if coalesce(v_saldo, 0) - v_liquido < 0 then
      raise exception 'Saldo insuficiente na conta: saldo atual R$ %, pagamento de R$ %.',
        round(coalesce(v_saldo, 0), 2), round(v_liquido, 2);
    end if;
  end if;

  update public.lancamento_parcelas
  set status = 'pago', conta_bancaria_id = p_conta_id,
      data_pagamento = v_data_informada,
      desconto = v_desconto,
      juros = v_juros,
      outras_despesas = v_outras,
      pago_por = (select auth.uid()), pago_em = now()
  where id = p_parcela_id;
  perform public.fn_recalcular_status_lancamento(v_lanc);

  if v_tipo = 'a_pagar' and v_data_informada <> v_programada then
    insert into public.parcela_eventos
      (parcela_id, tipo, motivo, data_de, data_para, created_by)
    values
      (p_parcela_id, 'pagou_fora_da_janela', btrim(p_motivo),
       v_programada, v_data_informada, (select auth.uid()));
  end if;

  perform public.fn_propagar_anexos('lancamento', v_lanc, 'pagamento', p_parcela_id);
end;
$function$;

revoke all on function public.fn_pagar_parcela(uuid, uuid, date, numeric, numeric, numeric, text) from public;
grant execute on function public.fn_pagar_parcela(uuid, uuid, date, numeric, numeric, numeric, text) to authenticated;
