-- Prova: o "Lancar" da conciliacao cria lancamento comum, que so casa com o
-- extrato depois de aprovado e pago (Tiago, 13/10/2026).
--
-- Roda em begin/rollback: nada e gravado. Entra como Tiago (Admin) com
-- `set local role authenticated`, igual a tela. Pega um debito pequeno sem
-- par, num mes de conciliacao aberto.

do $prova$
declare
  v_tiago uuid := 'c66fca9f-5428-4fb9-855f-dcff548764df';
  v_t public.extrato_transacoes;
  v_centro uuid;
  v_lanc uuid;
  v_parcela uuid;
  v_status text;
  v_painel jsonb;
  v_msg text;
begin
  perform set_config('request.jwt.claims', json_build_object('sub', v_tiago, 'role', 'authenticated')::text, true);

  select t.* into v_t from public.extrato_transacoes t
   where not t.conciliada and t.tipo = 'debito' and abs(t.valor) < 50
     and not exists (select 1 from public.conciliacao_fechamentos f
                      where f.conta_bancaria_id = t.conta_bancaria_id
                        and f.mes >= date_trunc('month', t.data_movimento)::date
                        and f.reaberto_em is null)
   order by t.data_movimento desc limit 1;
  select c.id into v_centro from public.centros_custo c
   where c.ativo and c.tipo <> 'investimento' order by c.created_at limit 1;
  if v_t.id is null or v_centro is null then
    raise exception 'PROVA SEM CENARIO: movimento %, centro %', v_t.id, v_centro;
  end if;

  execute 'set local role authenticated';

  -- A: lancar cria lancamento pendente, nao concilia.
  v_lanc := public.fn_conciliacao_lancar(v_t.id, jsonb_build_object(
    'centroCustoId', v_centro,
    'mesCompetencia', date_trunc('month', v_t.data_movimento)::date));
  select p.id, p.status into v_parcela, v_status
    from public.lancamento_parcelas p where p.lancamento_id = v_lanc;
  if v_status <> 'pendente' then raise exception 'FALHOU A: parcela %', v_status; end if;
  if (select conciliada from public.extrato_transacoes where id = v_t.id) then
    raise exception 'FALHOU A: movimento ficou conciliado';
  end if;
  if (select conta_bancaria_id from public.lancamento_parcelas where id = v_parcela)
     is distinct from v_t.conta_bancaria_id then
    raise exception 'FALHOU A: parcela sem a conta do extrato';
  end if;
  if not (select lancado_na_conciliacao and extrato_transacao_id = v_t.id
            from public.lancamentos where id = v_lanc) then
    raise exception 'FALHOU A: sem a marca da conciliacao';
  end if;

  -- B: o painel mostra o lancado no movimento.
  v_painel := public.fn_conciliacao_painel(v_t.conta_bancaria_id,
    date_trunc('month', v_t.data_movimento)::date,
    (date_trunc('month', v_t.data_movimento) + interval '1 month - 1 day')::date);
  if not exists (
    select 1 from jsonb_array_elements(v_painel->'transacoes') x
     where x->>'id' = v_t.id::text
       and x->'lancado'->>'parcelaStatus' = 'pendente') then
    raise exception 'FALHOU B: painel sem o lancado';
  end if;
  if exists (select 1 from jsonb_array_elements(v_painel->'abertas') x
              where x->>'id' = v_parcela::text) then
    raise exception 'FALHOU B: lancado aparece nas abertas';
  end if;

  -- C: lancar de novo recusa.
  v_msg := 'FALHOU C: lancou duas vezes';
  begin
    perform public.fn_conciliacao_lancar(v_t.id, jsonb_build_object(
      'centroCustoId', v_centro,
      'mesCompetencia', date_trunc('month', v_t.data_movimento)::date));
  exception when others then
    if sqlerrm like '%ja foi lancado%' then v_msg := 'OK'; else v_msg := 'FALHOU C: ' || sqlerrm; end if;
  end;
  if v_msg <> 'OK' then raise exception '%', v_msg; end if;

  -- D: casar pendente recusa.
  v_msg := 'FALHOU D: casou pendente';
  begin
    perform public.fn_conciliacao_casar(v_t.id, 'parcela', v_parcela, false, null);
  exception when others then
    if sqlerrm like '%feito pela conciliacao%' then v_msg := 'OK'; else v_msg := 'FALHOU D: ' || sqlerrm; end if;
  end;
  if v_msg <> 'OK' then raise exception '%', v_msg; end if;

  -- E: aprovado ainda recusa (antes dava baixa pelo extrato).
  perform public.fn_aprovar_parcela(v_parcela, v_t.data_movimento, v_t.conta_bancaria_id);
  if (select status from public.lancamento_parcelas where id = v_parcela) <> 'aprovado' then
    raise exception 'FALHOU E: nao aprovou';
  end if;
  v_msg := 'FALHOU E: casou aprovado';
  begin
    perform public.fn_conciliacao_casar(v_t.id, 'parcela', v_parcela, false, null);
  exception when others then
    if sqlerrm like '%feito pela conciliacao%' then v_msg := 'OK'; else v_msg := 'FALHOU E: ' || sqlerrm; end if;
  end;
  if v_msg <> 'OK' then raise exception '%', v_msg; end if;

  -- F: pago em Pagamentos, casa.
  perform public.fn_pagar_parcela(v_parcela, v_t.conta_bancaria_id, v_t.data_movimento, 0, 0, 0, null);
  perform public.fn_conciliacao_casar(v_t.id, 'parcela', v_parcela, false, null);
  if not (select conciliada from public.extrato_transacoes where id = v_t.id) then
    raise exception 'FALHOU F: nao conciliou depois de pago';
  end if;

  raise notice 'PROVA OK: movimento % (R$ %)', v_t.id, abs(v_t.valor);
end;
$prova$;
