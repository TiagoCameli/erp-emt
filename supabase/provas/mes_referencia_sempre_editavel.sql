-- Prova: o mes de referencia muda mesmo com pagamento aprovado ou pago.
--
-- Rodar SEMPRE dentro de begin/rollback (nada fica gravado):
--   begin; <migration 20261012150000>; <esta prova>; rollback;   -> GREEN
--   begin; <esta prova>; rollback;                               -> RED (antes)
--
-- Usa lancamentos reais de OC, em meses abertos:
--   A. lancamento com parcela paga: muda o mes, e a OC muda junto
--   B. lancamento com parcela aprovada (nenhuma paga): muda o mes
--   C. mes fechado continua guardado: recusa, ou (para quem tem
--      financeiro.competencias:desaprovar) aceita registrando a excecao
-- Termina com raise exception se algum caso falhar.

do $prova$
declare
  v_usuario uuid;
  v_lanc uuid;
  v_oc uuid;
  v_mes date;
  v_alvo date;
  v_txt text;
  v_fechado date;
  v_falhas text := '';
begin
  select u.id into v_usuario
  from public.usuarios u
  join public.usuario_permissoes up on up.usuario_id = u.id
  where u.ativo and up.recurso = 'financeiro.lancamentos' and up.acao = 'editar'
  limit 1;
  perform set_config('request.jwt.claims', json_build_object('sub', v_usuario)::text, true);

  -- A. parcela paga
  select l.id, l.origem_id, l.mes_competencia into v_lanc, v_oc, v_mes
  from public.lancamentos l
  where l.origem = 'oc' and l.status <> 'cancelado'
    and exists (select 1 from public.lancamento_parcelas p where p.lancamento_id = l.id and p.status = 'pago')
    and not public.fn_competencia_fechada(l.mes_competencia)
    and not public.fn_competencia_fechada((l.mes_competencia + interval '1 month')::date)
  limit 1;
  if v_lanc is null then
    raise exception 'Prova sem massa: nenhum lancamento de OC pago em mes aberto';
  end if;
  v_alvo := (v_mes + interval '1 month')::date;

  begin
    perform public.fn_alterar_mes_competencia('lancamento', v_lanc, v_alvo);
    select oc.mes_competencia::text || ' / ' || l.mes_competencia::text into v_txt
    from public.lancamentos l join public.ordens_compra oc on oc.id = l.origem_id
    where l.id = v_lanc;
    if v_txt is distinct from v_alvo::text || ' / ' || v_alvo::text then
      v_falhas := v_falhas || format(E'\nA. pago: esperado %s nos dois, veio %s', v_alvo, v_txt);
    end if;
  exception when others then
    v_falhas := v_falhas || E'\nA. pago: recusou: ' || sqlerrm;
  end;

  -- B. parcela aprovada, nenhuma paga
  v_lanc := null;
  select l.id, l.mes_competencia into v_lanc, v_mes
  from public.lancamentos l
  where l.origem in ('oc', 'manual') and l.status <> 'cancelado'
    and exists (select 1 from public.lancamento_parcelas p where p.lancamento_id = l.id and p.status = 'aprovado')
    and not exists (select 1 from public.lancamento_parcelas p where p.lancamento_id = l.id and p.status = 'pago')
    and not public.fn_competencia_fechada(l.mes_competencia)
    and not public.fn_competencia_fechada((l.mes_competencia + interval '1 month')::date)
  limit 1;
  if v_lanc is null then
    raise notice 'B. sem lancamento aprovado em mes aberto: caso pulado';
  else
    v_alvo := (v_mes + interval '1 month')::date;
    begin
      perform public.fn_alterar_mes_competencia('lancamento', v_lanc, v_alvo);
      select mes_competencia into v_mes from public.lancamentos where id = v_lanc;
      if v_mes <> v_alvo then
        v_falhas := v_falhas || format(E'\nB. aprovado: esperado %s, veio %s', v_alvo, v_mes);
      end if;
    exception when others then
      v_falhas := v_falhas || E'\nB. aprovado: recusou: ' || sqlerrm;
    end;
  end if;

  -- C. mes fechado continua guardado
  select c.mes into v_fechado from public.competencias_fechadas c limit 1;
  if v_fechado is null then
    raise notice 'C. nenhum mes fechado: caso pulado';
  else
    select l.id into v_lanc from public.lancamentos l
    where l.origem = 'oc' and l.status <> 'cancelado'
      and not public.fn_competencia_fechada(l.mes_competencia)
    limit 1;
    begin
      perform public.fn_alterar_mes_competencia('lancamento', v_lanc, v_fechado);
      if not exists (
        select 1 from public.competencia_eventos
        where mes = v_fechado and tipo = 'excecao' and entidade_id = v_lanc
      ) then
        v_falhas := v_falhas || format(E'\nC. aceitou o mes fechado %s sem registrar excecao', v_fechado);
      end if;
    exception when others then
      if sqlerrm not ilike '%esta fechada%' then
        v_falhas := v_falhas || E'\nC. recusou por outro motivo: ' || sqlerrm;
      end if;
    end;
  end if;

  if v_falhas <> '' then
    raise exception 'FALHOU:%', v_falhas;
  end if;
  raise notice 'PASSOU: A, B, C';
end $prova$;
