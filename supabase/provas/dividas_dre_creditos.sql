-- Prova (PR 5 do controle total): juros e taxa do consorcio no DRE no mes do
-- vencimento sem mudar o total; Creditos por contrato e por cota.
-- Rodar em begin/rollback depois das migrations; termina com raise 'PROVA OK'.

select set_config('request.jwt.claims', '{"sub":"c66fca9f-5428-4fb9-855f-dcff548764df","role":"authenticated"}', true);

do $prova$
declare
  v_lanc uuid; v_c uuid; v_q uuid; v_antes numeric; v_depois numeric; v_fin_antes numeric; v_fin numeric; v_juros_ago numeric;
  v_r record; v_q_lanc uuid; v_tx numeric;
begin
  select l.id into v_lanc from public.lancamentos l where l.numero = 'LAN-2026-6722'; -- GiroCaixa, 60 parcelas, 2 pagas
  select sum(total) into v_antes from public.fn_rel_dre('2025-01-01', '2032-01-01');
  select coalesce(sum(total), 0) into v_fin_antes from public.fn_rel_dre('2026-08-01', '2026-09-01') where natureza = 'financeira';

  v_c := public.fn_salvar_contrato_divida(null, jsonb_build_object('credor', 'Caixa', 'numero', 'GiroCaixa prova', 'tipo', 'capital_giro',
    'centroCustoId', (select r.centro_custo_id from public.lancamento_rateios r where r.lancamento_id = v_lanc limit 1),
    'lancamentoId', v_lanc, 'valorContratado', 2298000, 'valorLiberado', 2298000, 'dataLiberacao', '2026-07-09',
    'taxaAm', 1.5, 'sistema', 'price', 'parcelas', 60, 'primeiroVencimento', '2026-08-20'));
  perform public.fn_gerar_cronograma_contrato(v_c);
  select juros into v_juros_ago from public.contrato_divida_cronograma where contrato_id = v_c and numero = 1;

  -- 1. Total do DRE igual; financeiro de ago/2026 ganha os juros da parcela 1.
  select sum(total) into v_depois from public.fn_rel_dre('2025-01-01', '2032-01-01');
  if v_depois <> v_antes then raise exception 'FALHOU 1: total % -> %', v_antes, v_depois; end if;
  select coalesce(sum(total), 0) into v_fin from public.fn_rel_dre('2026-08-01', '2026-09-01') where natureza = 'financeira';
  if v_fin - v_fin_antes <> v_juros_ago then raise exception 'FALHOU 1b: financeiro +% (juros %)', v_fin - v_fin_antes, v_juros_ago; end if;

  -- 2. Creditos: 2 parcelas pagas no lancamento -> principal pago = principal das parcelas 1 e 2.
  select * into v_r from public.fn_rel_dividas_contratos(date '2026-10-12') where contrato_id = v_c;
  if v_r.principal_pago <> (select sum(principal) from public.contrato_divida_cronograma where contrato_id = v_c and numero <= 2)
     or v_r.principal_pago + v_r.saldo_devedor <> 2298000 or jsonb_array_length(v_r.proximas) <> 12
     or (v_r.proximas->0->>'numero')::int <> 3 or jsonb_array_length(v_r.fluxo) <> 61 then
    raise exception 'FALHOU 2: pago % saldo % prox % fluxo %', v_r.principal_pago, v_r.saldo_devedor, v_r.proximas->0, jsonb_array_length(v_r.fluxo);
  end if;

  -- 3. Consorcio ligado a LAN-2026-7453 (76 parcelas): taxa sai do investimento e entra na despesa; total igual.
  select id into v_q_lanc from public.lancamentos where numero = 'LAN-2026-7453';
  v_q := public.fn_salvar_consorcio_cota(null, jsonb_build_object('administradora', 'Prova', 'grupo', 'G', 'cota', '1718-0', 'bem', 'Prova',
    'lancamentoId', v_q_lanc, 'valorCredito', 70000, 'prazo', 76, 'taxaAdmPct', 20, 'fundoReservaPct', 2, 'primeiroVencimento', '2026-08-10'));
  select sum(total) into v_depois from public.fn_rel_dre('2025-01-01', '2032-01-01');
  if v_depois <> v_antes then raise exception 'FALHOU 3: total % -> %', v_antes, v_depois; end if;
  select total into v_tx from public.fn_rel_dre('2026-08-01', '2026-09-01') where categoria = 'Taxa de administração de consórcio';
  if v_tx is null or v_tx < (select taxa_adm + fundo_reserva from public.consorcio_cota_cronograma where cota_id = v_q and numero = 1) then
    raise exception 'FALHOU 3b: taxa em ago/2026 %', v_tx;
  end if;

  -- 4. Creditos do consorcio: 3 pagas; nao contemplada nao e divida.
  select * into v_r from public.fn_rel_consorcios(date '2026-10-12') where cota_id = v_q;
  if v_r.parcelas_pagas <> 3 or v_r.divida <> 0 or v_r.a_pagar <= 0 then raise exception 'FALHOU 4: % % %', v_r.parcelas_pagas, v_r.divida, v_r.a_pagar; end if;
  perform public.fn_contemplar_consorcio(v_q, date '2026-10-01', 'sorteio', 70000);
  select * into v_r from public.fn_rel_consorcios(date '2026-10-12') where cota_id = v_q;
  if v_r.divida <> v_r.a_pagar then raise exception 'FALHOU 4b: divida %', v_r.divida; end if;

  -- 5. Sem relatorios nem dividas: Creditos vazio.
  perform set_config('request.jwt.claims', '{"sub":"a7324fb8-8311-4986-b975-8a8141ec7efc","role":"authenticated"}', true);
  if not public.tem_permissao('financeiro.relatorios', 'ver') and exists (select 1 from public.fn_rel_dividas_contratos(date '2026-10-12')) then
    raise exception 'FALHOU 5: viu contratos sem permissao';
  end if;

  raise exception 'PROVA OK';
end
$prova$;
