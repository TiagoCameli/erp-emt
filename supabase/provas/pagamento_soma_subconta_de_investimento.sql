-- Prova: o saldo que trava o pagamento é o da conta somado ao das subcontas de
-- investimento dela (13/10/2026). BB 102.124-9: corrente R$ -191.846,57 e
-- investimentos R$ 248.166,32. O pagamento de R$ 1.716,67 (LAN-2026-5848) era
-- recusado porque a trava olhava só a corrente.
--
-- Roda em begin/rollback: nada é gravado. Entra como Tiago (Admin) com
-- `set local role authenticated`, igual a tela.

do $prova$
declare
  v_tiago uuid := 'c66fca9f-5428-4fb9-855f-dcff548764df';
  v_hoje date := (now() at time zone 'America/Rio_Branco')::date;
  v_conta uuid; v_pai numeric; v_grupo numeric;
  v_parcela uuid; v_valor numeric; v_data date;
  v_msg text;
begin
  select c.id into v_conta from public.contas_bancarias c
   where c.nome = 'BANCO DO BRASIL 102.124-9' and c.conta_pai_id is null;
  v_pai := public.fn_saldo_conta(v_conta);
  select sum(public.fn_saldo_conta(c.id)) into v_grupo from public.contas_bancarias c
   where c.id = v_conta or c.conta_pai_id = v_conta;

  -- Uma parcela a pagar aprovada, com data autorizada neste mês até hoje e
  -- valor que cabe na soma mas não na corrente.
  select p.id, p.valor, p.data_programada into v_parcela, v_valor, v_data
    from public.lancamento_parcelas p join public.lancamentos l on l.id = p.lancamento_id
   where l.tipo = 'a_pagar' and l.status <> 'cancelado' and p.status = 'aprovado'
     and p.data_programada between date_trunc('month', v_hoje)::date and v_hoje
     and p.valor > greatest(v_pai, 0) and p.valor <= v_grupo
   order by p.valor limit 1;

  if v_pai >= 0 or v_grupo <= 0 or v_parcela is null then
    raise exception 'PROVA SEM CENARIO: pai %, grupo %, parcela %', v_pai, v_grupo, v_parcela;
  end if;

  perform set_config('request.jwt.claims', json_build_object('sub', v_tiago, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';

  -- A: passa da soma por R$ 0,01 -> recusa, mostrando o saldo somado.
  v_msg := 'FALHOU A: pagou acima da soma';
  begin
    perform public.fn_pagar_parcela(v_parcela, v_conta, v_data, 0, 0,
      round(v_grupo - v_valor + 0.01, 2), null);
  exception when others then
    if sqlerrm like '%Saldo insuficiente%' || round(v_grupo, 2)::text || '%' then
      v_msg := 'OK';
    else
      v_msg := 'FALHOU A: mensagem ' || sqlerrm;
    end if;
  end;
  if v_msg like 'FALHOU%' then raise exception '%', v_msg; end if;


  -- B: cabe na soma (corrente negativa + investimentos) -> paga.
  v_msg := 'OK';
  begin
    perform public.fn_pagar_parcela(v_parcela, v_conta, v_data, 0, 0, 0, null);
    if (select status from public.lancamento_parcelas where id = v_parcela) <> 'pago' then
      v_msg := 'FALHOU B: não ficou paga';
    end if;
  exception when others then
    v_msg := 'FALHOU B: recusou com ' || sqlerrm;
  end;
  if v_msg like 'FALHOU%' then raise exception '%', v_msg; end if;

  raise notice 'PROVA OK: corrente %, com investimentos %, parcela de % paga', v_pai, v_grupo, v_valor;
end;
$prova$;
