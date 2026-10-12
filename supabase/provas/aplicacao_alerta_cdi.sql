-- Prova (PR 4 do controle total): a simulacao da posicao devolve o rendimento
-- esperado pelo CDI e o alerta; salvar fora do CDI pede confirmacao com motivo.
-- Rodar em begin/rollback depois da migration; termina com raise 'PROVA OK'.

select set_config('request.jwt.claims', '{"sub":"c66fca9f-5428-4fb9-855f-dcff548764df","role":"authenticated"}', true);

do $prova$
declare
  v_apl uuid := '71cf4c39-f7fa-40ee-8c27-e3e90f7089b2'; -- CDB 95% do CDI
  v_dia date := date '2026-10-12';
  v_ant numeric; v_esp numeric; v_fora boolean; v_obs text; v_msg text;
begin
  select s.saldo_anterior, s.rendimento_esperado into v_ant, v_esp
    from public.fn_simular_posicao_aplicacao(v_apl, v_dia, 0) s;
  if v_esp is null or v_esp < 1000 or v_esp > 5000 then raise exception 'FALHOU 1: esperado %', v_esp; end if;

  -- 2. Dentro da faixa: sem alerta, salva sem confirmar.
  select s.fora_do_cdi into v_fora from public.fn_simular_posicao_aplicacao(v_apl, v_dia, v_ant + round(v_esp, 2)) s;
  if v_fora then raise exception 'FALHOU 2: dentro do CDI marcado como fora'; end if;
  perform public.fn_salvar_posicao_aplicacao(v_apl, v_dia, v_ant + round(v_esp, 2));

  -- 3. Negativo: alerta, e salvar sem confirmar recusa.
  select s.fora_do_cdi into v_fora from public.fn_simular_posicao_aplicacao(v_apl, v_dia, v_ant - 1000) s;
  if not v_fora then raise exception 'FALHOU 3: negativo sem alerta'; end if;
  v_msg := 'FALHOU 4: salvou negativo sem confirmar';
  begin
    perform public.fn_salvar_posicao_aplicacao(v_apl, v_dia, v_ant - 1000);
  exception when others then
    if sqlerrm ilike '%fora do CDI%' then v_msg := null; else v_msg := 'FALHOU 4: ' || sqlerrm; end if;
  end;
  if v_msg is not null then raise exception '%', v_msg; end if;

  -- 5. Confirmar sem motivo recusa.
  v_msg := 'FALHOU 5: confirmou sem motivo';
  begin
    perform public.fn_salvar_posicao_aplicacao(v_apl, v_dia, v_ant - 1000, p_confirmar => true, p_motivo => '  ');
  exception when others then
    if sqlerrm ilike '%motivo%' then v_msg := null; else v_msg := 'FALHOU 5: ' || sqlerrm; end if;
  end;
  if v_msg is not null then raise exception '%', v_msg; end if;

  -- 6. Acima de 150%: alerta; com confirmar e motivo grava o prefixo.
  select s.fora_do_cdi into v_fora from public.fn_simular_posicao_aplicacao(v_apl, v_dia, v_ant + round(v_esp * 2, 2)) s;
  if not v_fora then raise exception 'FALHOU 6: o dobro do esperado sem alerta'; end if;
  perform public.fn_salvar_posicao_aplicacao(v_apl, v_dia, v_ant + round(v_esp * 2, 2), p_observacoes => 'extrato',
    p_confirmar => true, p_motivo => 'juros do mes creditados');
  select p.observacoes into v_obs from public.aplicacao_posicoes p
   where p.aplicacao_id = v_apl and p.data = v_dia and p.excluido_em is null;
  if v_obs is null or v_obs not like '[Fora do CDI] juros do mes creditados%' or v_obs not like '%extrato%' then
    raise exception 'FALHOU 7: observacoes %', v_obs;
  end if;

  -- 8. Regravar fora do CDI troca o motivo (nao acumula); voltar para dentro tira.
  perform public.fn_salvar_posicao_aplicacao(v_apl, v_dia, v_ant + round(v_esp * 2, 2), p_observacoes => v_obs,
    p_confirmar => true, p_motivo => 'segundo motivo');
  select p.observacoes into v_obs from public.aplicacao_posicoes p
   where p.aplicacao_id = v_apl and p.data = v_dia and p.excluido_em is null;
  if v_obs <> E'[Fora do CDI] segundo motivo\nextrato' then raise exception 'FALHOU 8: observacoes %', v_obs; end if;
  perform public.fn_salvar_posicao_aplicacao(v_apl, v_dia, v_ant + round(v_esp, 2), p_observacoes => v_obs);
  select p.observacoes into v_obs from public.aplicacao_posicoes p
   where p.aplicacao_id = v_apl and p.data = v_dia and p.excluido_em is null;
  if v_obs <> 'extrato' then raise exception 'FALHOU 9: observacoes %', v_obs; end if;

  -- 10. Mensagem em reais no formato brasileiro.
  v_msg := 'FALHOU 10: salvou';
  begin
    perform public.fn_salvar_posicao_aplicacao(v_apl, v_dia, v_ant - 1000);
  exception when others then v_msg := sqlerrm;
  end;
  if v_msg not like '%R$ -1.000,00%' and v_msg not like '%R$ 1.000,00%' then raise exception 'FALHOU 10: %', v_msg; end if;

  raise exception 'PROVA OK';
end
$prova$;
