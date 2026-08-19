-- Aplicada em produção pelo MCP (apply_migration) em 2026-08-19, versão
-- 20260819133655 no ledger. Este arquivo é o registro versionado do que foi
-- aplicado; NÃO rode `supabase db push` neste projeto (ver docs/decisoes.md).
--
-- Task 3 da frente de exceções auditadas na parcela.
-- Fora da data autorizada deixa de ser recusa e passa a ser excecao auditada:
-- a fn_pagar_parcela ganha p_motivo, exige o motivo quando a data informada
-- difere da data autorizada e grava o evento `pagou_fora_da_janela` na trilha
-- da parcela (parcela_eventos, Task 1 desta frente).
--
-- Duas coisas mudam de semantica, ambas decisao do dono (18/08/2026):
--   1. pagar fora da data autorizada passa a ser permitido COM motivo;
--   2. a comparacao passa a ser entre a data INFORMADA e a data programada, e
--      nao entre hoje e a programada. A tela pede "data do pagamento", e
--      comparar hoje fazia a recusa falar de uma data que ninguem digitou.
--
-- O que NAO muda: recusa de data no futuro, `data_programada is null`,
-- status <> 'aprovado', `em_revisao` com mensagem propria, a permissao
-- financeiro.pagamentos:criar, a trava de saldo, desconto e juros,
-- fn_recalcular_status_lancamento e fn_propagar_anexos. O ramo a_receber nao
-- usa a data programada e NAO passa a exigir motivo (guarda v_tipo no insert).
--
-- DROP + CREATE na MESMA migration, de proposito: acrescentar p_motivo com
-- default criaria uma SOBRECARGA se a versao de 5 parametros sobrevivesse, e
-- toda chamada com 5 argumentos morreria em `function is not unique`. O
-- drop tambem zera o ACL, por isso o revoke/grant abaixo restaura exatamente
-- o proacl de antes ({postgres=X/postgres,authenticated=X/postgres}) — esta base
-- ja esqueceu um re-grant e deixou um painel em branco sem erro nenhum.
--
-- p_desconto e p_juros MANTEM `default 0`: baixarRecebimento chama a RPC com
-- tres argumentos nomeados, e sem os defaults a baixa de recebimento quebraria.

drop function public.fn_pagar_parcela(uuid, uuid, date, numeric, numeric);

create or replace function public.fn_pagar_parcela(
  p_parcela_id uuid,
  p_conta_id uuid,
  p_data_pagamento date,
  p_desconto numeric default 0,
  p_juros numeric default 0,
  p_motivo text default null
)
returns void
language plpgsql
security definer
set search_path = ''
as $fn$
declare
  v_status text; v_lanc uuid; v_tipo text; v_valor numeric; v_saldo numeric;
  v_programada date; v_janela text; v_data_informada date; v_status_lanc text;
  v_hoje date := (now() at time zone 'America/Rio_Branco')::date;
  v_desconto numeric(14, 2);
  v_juros numeric(14, 2);
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

    -- Fora da data autorizada deixa de ser recusa e passa a ser evento com
    -- motivo (decisao do dono, 18/08/2026). A comparacao e com a data
    -- INFORMADA, nao com hoje: a tela pede "data do pagamento", e comparar
    -- hoje fazia a mensagem falar de uma data que o usuario nao digitou.
    -- fn_janela_pagamento() deixa de bloquear; o parametro segue existindo.
    if v_data_informada <> v_programada then
      if coalesce(btrim(p_motivo), '') = '' then
        raise exception 'Este pagamento esta fora da data autorizada (%): informe o motivo.',
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

  v_desconto := round(coalesce(p_desconto, 0), 2);
  v_juros := round(coalesce(p_juros, 0), 2);

  if v_desconto < 0 then
    raise exception 'O desconto nao pode ser negativo.';
  end if;

  if v_juros < 0 then
    raise exception 'Os juros nao podem ser negativos.';
  end if;

  if v_desconto > v_valor then
    raise exception 'O desconto (R$ %) nao pode ser maior que o valor da parcela (R$ %).',
      round(v_desconto, 2), round(v_valor, 2);
  end if;

  v_liquido := round(v_valor - v_desconto + v_juros, 2);

  if p_conta_id is null then raise exception 'Informe a conta bancaria'; end if;

  if v_tipo = 'a_pagar' then
    select c.saldo_inicial
      + coalesce(sum(case when l.tipo = 'a_receber' then p.valor_liquido else -p.valor_liquido end), 0)
    into v_saldo
    from public.contas_bancarias c
    left join public.lancamento_parcelas p on p.conta_bancaria_id = c.id and p.status = 'pago'
    left join public.lancamentos l on l.id = p.lancamento_id
    where c.id = p_conta_id
    group by c.saldo_inicial;

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
      pago_por = (select auth.uid()), pago_em = now()
  where id = p_parcela_id;
  perform public.fn_recalcular_status_lancamento(v_lanc);

  -- Excecao auditada: pagou fora da data autorizada. Grava DEPOIS do update,
  -- na mesma transacao, para nao existir pagamento fora da data sem trilha.
  -- A guarda de tipo existe porque a_receber nao tem data autorizada nem
  -- exigencia de motivo: sem ela, a baixa de recebimento gravaria evento.
  if v_tipo = 'a_pagar' and v_data_informada <> v_programada then
    insert into public.parcela_eventos
      (parcela_id, tipo, motivo, data_de, data_para, created_by)
    values
      (p_parcela_id, 'pagou_fora_da_janela', btrim(p_motivo),
       v_programada, v_data_informada, (select auth.uid()));
  end if;

  perform public.fn_propagar_anexos('lancamento', v_lanc, 'pagamento', p_parcela_id);
end;
$fn$;

revoke all on function public.fn_pagar_parcela(uuid, uuid, date, numeric, numeric, text) from public;
grant execute on function public.fn_pagar_parcela(uuid, uuid, date, numeric, numeric, text) to authenticated;

do $trava$
declare
  v_n integer; v_args text; v_acl text; v_secdef boolean; v_cfg text[];
begin
  select count(*) into v_n
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public' and p.proname = 'fn_pagar_parcela';
  if v_n <> 1 then
    raise exception 'fn_pagar_parcela ficou com % versoes: sobrecarga quebra toda chamada', v_n;
  end if;

  select pg_get_function_identity_arguments(p.oid), p.proacl::text, p.prosecdef, p.proconfig
    into v_args, v_acl, v_secdef, v_cfg
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public' and p.proname = 'fn_pagar_parcela';

  if v_args <> 'p_parcela_id uuid, p_conta_id uuid, p_data_pagamento date, p_desconto numeric, p_juros numeric, p_motivo text' then
    raise exception 'assinatura inesperada: %', v_args;
  end if;

  if coalesce(v_acl, '') <> '{postgres=X/postgres,authenticated=X/postgres}' then
    raise exception 'o grant nao foi restaurado: %', coalesce(v_acl, 'nulo');
  end if;

  if not v_secdef then raise exception 'fn_pagar_parcela perdeu o security definer'; end if;

  if v_cfg is null or not ('search_path=""' = any(v_cfg)) then
    raise exception 'fn_pagar_parcela perdeu o search_path vazio: %', v_cfg;
  end if;
end $trava$;
