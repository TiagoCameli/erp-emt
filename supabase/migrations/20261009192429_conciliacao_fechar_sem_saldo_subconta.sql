-- =============================================================
-- Conciliacao: fechar o mes sem o saldo da subconta
--
-- Pedido do Tiago (09/10/2026): fechar o mes nao pede mais o saldo da
-- subconta de investimentos. Com todos os movimentos da conta conciliados
-- e o saldo da corrente batendo com o banco, o mes fecha. A subconta
-- continua aparecendo no painel (banco x app), so nao trava o fechamento.
--
-- fn_conciliacao_fechar_mes: corpo igual ao de producao, sem o bloco da
-- subconta. Nenhuma assinatura muda.
-- =============================================================

CREATE OR REPLACE FUNCTION public.fn_conciliacao_fechar_mes(p_conta_id uuid, p_mes date)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_inicio date := date_trunc('month', p_mes)::date;
  v_fim date := (date_trunc('month', p_mes) + interval '1 month - 1 day')::date;
  v_painel jsonb;
  v_faltam int;
  v_fora int;
  v_banco numeric(14, 2);
  v_banco_data date;
  v_app numeric(14, 2);
  v_id uuid;
  v_saldo_banco jsonb;
begin
  if not public.tem_permissao('financeiro.conciliacao', 'editar') then
    raise exception 'Sem permissao para conciliar';
  end if;
  if p_conta_id is null or p_mes is null then raise exception 'Informe a conta e o mes'; end if;

  if exists (select 1 from public.conciliacao_fechamentos
             where conta_bancaria_id = p_conta_id and mes = v_inicio and reaberto_em is null) then
    raise exception 'Este mes ja esta fechado';
  end if;

  -- Recalcula aqui, com o mesmo painel da tela: nao confia no cliente.
  v_painel := public.fn_conciliacao_painel(p_conta_id, v_inicio, v_fim);
  select count(*) into v_faltam from jsonb_array_elements(v_painel->'transacoes') t
   where not (t->>'conciliada')::boolean;
  select (select count(*) from jsonb_array_elements(v_painel->'pagasNaConta') p
           where (p->>'dataPagamento')::date between v_inicio and v_fim)
       + (select count(*) from jsonb_array_elements(v_painel->'transferencias') t
           where (t->>'data')::date between v_inicio and v_fim)
    into v_fora;

  if v_faltam > 0 then
    raise exception 'Nao da para fechar: % movimento(s) do extrato ainda faltam no app', v_faltam;
  end if;
  if v_fora > 0 then
    raise exception 'Nao da para fechar: % lancamento(s) do app nao aparecem no extrato', v_fora;
  end if;

  -- Saldo do banco no ultimo dia do mes (Bloco K): encadeado a partir de
  -- uma ancora com extrato cobrindo, ou o LEDGERBAL quando e do fim do
  -- periodo. A mesma conta do painel.
  v_saldo_banco := public.fn_conciliacao_saldo_banco_no_dia(p_conta_id, v_fim);
  v_banco := (v_saldo_banco->>'banco')::numeric;
  v_banco_data := v_fim;
  if v_banco is null then
    raise exception 'Nao da para fechar: sem saldo do banco em % (%). Cadastre uma ancora em Importacoes',
      to_char(v_fim, 'DD/MM/YYYY'), v_saldo_banco->>'motivo';
  end if;
  v_app := public.fn_conciliacao_saldo_app_interno(p_conta_id, v_banco_data);
  if v_app <> v_banco then
    raise exception 'Nao da para fechar: o saldo do banco difere do app em R$ %', public.fn_conciliacao_brl(v_banco - v_app);
  end if;

  insert into public.conciliacao_fechamentos (conta_bancaria_id, mes, saldo_banco, saldo_app, fechado_por)
  values (p_conta_id, v_inicio, v_banco, v_app, (select auth.uid()))
  returning id into v_id;
  return v_id;
end;
$function$;
