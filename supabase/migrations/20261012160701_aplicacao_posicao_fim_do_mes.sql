-- Aplicacoes: fechar o mes da conta exige a posicao do ultimo dia de cada
-- aplicacao ativa das subcontas (PR 4 do controle total, 12/10/2026, frente E).

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
  v_sem_posicao text;
begin
  if not public.tem_permissao('financeiro.conciliacao', 'editar') then
    raise exception 'Sem permissao para conciliar';
  end if;
  if p_conta_id is null or p_mes is null then raise exception 'Informe a conta e o mes'; end if;

  if exists (select 1 from public.conciliacao_fechamentos
             where conta_bancaria_id = p_conta_id and mes = v_inicio and reaberto_em is null) then
    raise exception 'Este mes ja esta fechado';
  end if;

  -- Aplicacoes das subcontas (ou da propria conta): fechar o mes exige a posicao
  -- do ultimo dia de cada aplicacao ativa que ja tinha posicao gravada ate la.
  -- Sem ela o rendimento do mes nao esta no app.
  select string_agg(coalesce(cc.nome, a.produto), ', ' order by cc.nome) into v_sem_posicao
  from public.aplicacoes a
  join public.contas_bancarias c on c.id = a.conta_bancaria_id
  left join public.centros_custo cc on cc.id = a.centro_custo_id
  where a.ativa
    and (c.id = p_conta_id or c.conta_pai_id = p_conta_id)
    and exists (select 1 from public.aplicacao_posicoes p
                 where p.aplicacao_id = a.id and p.excluido_em is null and p.data <= v_fim)
    and not exists (select 1 from public.aplicacao_posicoes p
                     where p.aplicacao_id = a.id and p.excluido_em is null and p.data = v_fim);
  if v_sem_posicao is not null then
    raise exception 'Nao da para fechar: falta a posicao de % das aplicacoes: %',
      to_char(v_fim, 'DD/MM/YYYY'), v_sem_posicao;
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
