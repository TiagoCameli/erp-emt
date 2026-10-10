-- Prova do lote de reclassificacao (PR 2 do controle total). Rodar em
-- begin/rollback depois das migrations; termina com raise 'PROVA OK'.

select set_config('request.jwt.claims', '{"sub":"c66fca9f-5428-4fb9-855f-dcff548764df","role":"authenticated"}', true);

do $prova$
declare
  v_distrib uuid := (select id from public.categorias_financeiras where nome = 'Distribuição a sócio' and tipo = 'despesa');
  v_devol uuid := (select id from public.categorias_financeiras where nome = 'Devolução de mútuo' and tipo = 'receita');
  v_socio uuid := 'e892aee6-fab2-4931-9582-640ce7be3967';
  v_r uuid; v_lanc uuid; v_r_fechado uuid; v_r_cancel uuid; v_n int; v_msg text; v_ev int;
begin
  -- Um rateio a pagar de 2026 com centro unico no lancamento.
  select r.id, r.lancamento_id into v_r, v_lanc
    from public.lancamento_rateios r join public.lancamentos l on l.id = r.lancamento_id
   where l.tipo = 'a_pagar' and l.status <> 'cancelado' and l.origem is distinct from 'aplicacao'
     and l.mes_competencia >= date '2026-01-01'
     and (select count(*) from public.lancamento_rateios x where x.lancamento_id = l.id) = 1
   limit 1;

  -- 1. Item valido muda categoria e centro e grava um evento.
  select count(*) into v_ev from public.rateio_eventos where lancamento_id = v_lanc;
  v_n := public.fn_reclassificar_rateios_lote(
    jsonb_build_array(jsonb_build_object('rateioId', v_r, 'categoriaId', v_distrib, 'centroCustoId', v_socio)), 'prova');
  if v_n <> 1 then raise exception 'FALHOU 1: devolveu %', v_n; end if;
  if (select categoria_id from public.lancamento_rateios where id = v_r) <> v_distrib
     or (select centro_custo_id from public.lancamento_rateios where id = v_r) <> v_socio then
    raise exception 'FALHOU 2: rateio nao mudou';
  end if;
  if (select count(*) from public.rateio_eventos where lancamento_id = v_lanc) <> v_ev + 1 then
    raise exception 'FALHOU 3: evento nao gravado';
  end if;
  -- Lancamento de rateio unico: o cabecalho acompanha a categoria (a lista de
  -- lancamentos filtra pela categoria do cabecalho, e o clique do DRE abriria
  -- vazio se so o rateio mudasse).
  if (select categoria_id from public.lancamentos where id = v_lanc) <> v_distrib then
    raise exception 'FALHOU 3b: cabecalho nao acompanhou a categoria do rateio';
  end if;

  -- 2. Categoria de receita num lancamento a pagar: recusa.
  begin
    perform public.fn_reclassificar_rateios_lote(
      jsonb_build_array(jsonb_build_object('rateioId', v_r, 'categoriaId', v_devol)), 'prova');
    v_msg := 'FALHOU 4: aceitou categoria de receita em a pagar';
  exception when others then
    get stacked diagnostics v_msg = message_text;
    if v_msg not like '%tipo%' then raise exception 'FALHOU 4: %', v_msg; end if;
  end;
  if v_msg like 'FALHOU%' then raise exception '%', v_msg; end if;

  -- 3. Competencia fechada (2024-10). Usuario que edita lancamento mas nao reabre competencia: recusa com a
  --    mensagem da competencia. Admin (Tiago, que pode reabrir competencia):
  --    passa e fica registrado como excecao, como em fn_definir_rateio_lancamento.
  select r.id, r.lancamento_id into v_r_fechado, v_lanc from public.lancamento_rateios r join public.lancamentos l on l.id = r.lancamento_id
   where l.mes_competencia = date '2024-10-01' and l.status <> 'cancelado' and l.tipo = 'a_pagar' limit 1;
  if v_r_fechado is not null then
    perform set_config('request.jwt.claims', '{"sub":"a7324fb8-8311-4986-b975-8a8141ec7efc","role":"authenticated"}', true);
    begin
      perform public.fn_reclassificar_rateios_lote(
        jsonb_build_array(jsonb_build_object('rateioId', v_r_fechado, 'categoriaId', v_distrib)), 'prova');
      v_msg := 'FALHOU 5: usuario sem reabrir competencia mudou mes fechado';
    exception when others then
      get stacked diagnostics v_msg = message_text;
      if v_msg not ilike '%compet%' then raise exception 'FALHOU 5: %', v_msg; end if;
    end;
    if v_msg like 'FALHOU%' then raise exception '%', v_msg; end if;
    perform set_config('request.jwt.claims', '{"sub":"c66fca9f-5428-4fb9-855f-dcff548764df","role":"authenticated"}', true);
    select count(*) into v_ev from public.competencia_eventos where entidade_id = v_lanc and tipo = 'excecao';
    -- Item que nao muda nada nao registra excecao.
    perform public.fn_reclassificar_rateios_lote(
      jsonb_build_array(jsonb_build_object('rateioId', v_r_fechado)), 'prova');
    if (select count(*) from public.competencia_eventos where entidade_id = v_lanc and tipo = 'excecao') <> v_ev then
      raise exception 'FALHOU 5a: item sem mudanca registrou excecao';
    end if;
    perform public.fn_reclassificar_rateios_lote(
      jsonb_build_array(jsonb_build_object('rateioId', v_r_fechado, 'categoriaId', v_distrib)), 'prova');
    if (select count(*) from public.competencia_eventos where entidade_id = v_lanc and tipo = 'excecao') <> v_ev + 1 then
      raise exception 'FALHOU 5b: admin passou sem registrar a excecao';
    end if;
  end if;

  -- 4. Lancamento cancelado: recusa.
  select r.id into v_r_cancel from public.lancamento_rateios r join public.lancamentos l on l.id = r.lancamento_id
   where l.status = 'cancelado' and l.tipo = 'a_pagar' limit 1;
  if v_r_cancel is not null then
    begin
      perform public.fn_reclassificar_rateios_lote(
        jsonb_build_array(jsonb_build_object('rateioId', v_r_cancel, 'categoriaId', v_distrib)), 'prova');
      v_msg := 'FALHOU 6: mudou lancamento cancelado';
    exception when others then
      get stacked diagnostics v_msg = message_text;
      if v_msg not ilike '%cancelado%' then raise exception 'FALHOU 6: %', v_msg; end if;
    end;
    if v_msg like 'FALHOU%' then raise exception '%', v_msg; end if;
  end if;

  -- 5. Sem motivo: recusa.
  begin
    perform public.fn_reclassificar_rateios_lote(
      jsonb_build_array(jsonb_build_object('rateioId', v_r, 'categoriaId', v_distrib)), ' ');
    v_msg := 'FALHOU 7: aceitou sem motivo';
  exception when others then
    get stacked diagnostics v_msg = message_text;
    if v_msg not ilike '%motivo%' then raise exception 'FALHOU 7: %', v_msg; end if;
  end;
  if v_msg like 'FALHOU%' then raise exception '%', v_msg; end if;

  raise exception 'PROVA OK';
end
$prova$;
