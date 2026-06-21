-- =============================================================
-- Fase 7 (espinha) / Migration: correções da revisão adversarial
-- 1. fn_gerar_folha: reseta o centro de custo a cada colaborador (SELECT INTO
--    com GROUP BY pode não retornar linha e manter o valor da iteração
--    anterior, alocando custo na obra errada). Só horas tipo 'normal' contam.
-- 2. fn_fechar_diarias: trava as diárias (for update) contra fechamento
--    concorrente (pagamento dobrado) e filtra pela competência (campo), não
--    pela data, casando com o painel de fechamentos.
-- =============================================================

create or replace function public.fn_fechar_diarias(p_colaborador uuid, p_competencia date, p_data_vencimento date default null)
returns uuid language plpgsql security definer set search_path = '' as $$
declare v_total numeric; v_nome text; v_cc uuid; v_lanc uuid; v_comp date;
begin
  if not public.tem_permissao('rh.diaristas', 'criar') then raise exception 'Sem permissao para fechar diarias'; end if;
  v_comp := date_trunc('month', p_competencia)::date;

  -- Trava as diárias em aberto da competência (serializa fechamentos concorrentes).
  perform 1 from public.rh_diarias
  where colaborador_id = p_colaborador and competencia = v_comp and lancamento_id is null for update;

  select coalesce(sum(valor), 0) into v_total from public.rh_diarias
  where colaborador_id = p_colaborador and competencia = v_comp and lancamento_id is null;
  if v_total <= 0 then raise exception 'Nao ha diarias em aberto nessa competencia'; end if;

  select nome, centro_custo_id into v_nome, v_cc from public.colaboradores where id = p_colaborador;

  insert into public.lancamentos (tipo, origem, origem_id, centro_custo_id, descricao, valor, status, competencia, data_vencimento, created_by)
  values ('a_pagar', 'diaria', p_colaborador, v_cc, 'Diarias ' || coalesce(v_nome, '') || ' ' || to_char(v_comp, 'MM/YYYY'), v_total, 'a_pagar', v_comp, p_data_vencimento, (select auth.uid()))
  returning id into v_lanc;
  insert into public.lancamento_parcelas (lancamento_id, numero_parcela, valor, data_vencimento, status, created_by)
  values (v_lanc, 1, v_total, p_data_vencimento, 'pendente', (select auth.uid()));
  if v_cc is not null then
    insert into public.lancamento_rateios (lancamento_id, centro_custo_id, valor, created_by)
    values (v_lanc, v_cc, v_total, (select auth.uid()));
  end if;

  update public.rh_diarias set lancamento_id = v_lanc
  where colaborador_id = p_colaborador and competencia = v_comp and lancamento_id is null;
  return v_lanc;
end $$;
revoke all on function public.fn_fechar_diarias(uuid, date, date) from public, anon;
grant execute on function public.fn_fechar_diarias(uuid, date, date) to authenticated;

create or replace function public.fn_gerar_folha(p_competencia date, p_encargos_pct numeric default 0)
returns uuid language plpgsql security definer set search_path = '' as $$
declare
  v_folha uuid; v_status text; v_ini date; v_fim date;
  v_colab record; v_hn numeric; v_he numeric; v_valor_hora numeric; v_extras numeric;
  v_encargos numeric; v_adiant numeric; v_custo numeric; v_liquido numeric; v_cc uuid;
begin
  if not public.tem_permissao('rh.folha', 'criar') then raise exception 'Sem permissao para gerar folha'; end if;
  if p_encargos_pct < 0 then raise exception 'Percentual de encargos invalido'; end if;
  v_ini := date_trunc('month', p_competencia)::date;
  v_fim := (v_ini + interval '1 month')::date;

  select id, status into v_folha, v_status from public.folhas where competencia = v_ini;
  if v_status = 'fechada' then raise exception 'A folha desta competencia ja esta fechada'; end if;
  if v_folha is null then
    insert into public.folhas (competencia, encargos_percentual, created_by) values (v_ini, p_encargos_pct, (select auth.uid())) returning id into v_folha;
  else
    update public.rh_adiantamentos set folha_id = null where folha_id = v_folha;
    delete from public.folha_itens where folha_id = v_folha;
    update public.folhas set encargos_percentual = p_encargos_pct where id = v_folha;
  end if;

  for v_colab in
    select id, coalesce(salario, 0) as salario, centro_custo_id from public.colaboradores
    where ativo and vinculo = 'clt'
  loop
    -- Só dias 'normal' geram horas (falta/folga/atestado não pagam).
    select coalesce(sum(a.horas_normais), 0), coalesce(sum(a.horas_extras), 0)
    into v_hn, v_he
    from public.rh_apontamentos a join public.rh_pontos pt on pt.id = a.ponto_id
    where a.colaborador_id = v_colab.id and a.tipo = 'normal' and pt.status = 'aprovado' and pt.data >= v_ini and pt.data < v_fim;

    continue when v_colab.salario = 0 and v_hn = 0 and v_he = 0;

    v_valor_hora := case when v_colab.salario > 0 then v_colab.salario / 220.0 else 0 end;
    v_extras := round(v_he * v_valor_hora * 1.5, 2);
    v_encargos := round((v_colab.salario + v_extras) * p_encargos_pct / 100.0, 2);

    select coalesce(sum(valor), 0) into v_adiant from public.rh_adiantamentos
    where colaborador_id = v_colab.id and date_trunc('month', competencia)::date = v_ini and folha_id is null;

    v_custo := v_colab.salario + v_extras + v_encargos;
    v_liquido := v_colab.salario + v_extras - v_adiant;

    -- Reseta antes do select: GROUP BY pode não retornar linha (sem apontamento).
    v_cc := null;
    select co.id into v_cc
    from public.rh_apontamentos a
    join public.rh_pontos pt on pt.id = a.ponto_id
    join public.centros_custo co on co.obra_id = pt.obra_id and co.nivel = 1
    where a.colaborador_id = v_colab.id and a.tipo = 'normal' and pt.status = 'aprovado' and pt.data >= v_ini and pt.data < v_fim
    group by co.id
    order by sum(a.horas_normais + a.horas_extras) desc
    limit 1;
    if v_cc is null then v_cc := v_colab.centro_custo_id; end if;

    insert into public.folha_itens (folha_id, colaborador_id, centro_custo_id, salario_base, horas_normais, horas_extras, valor_extras, encargos, adiantamentos, custo_total, valor_liquido)
    values (v_folha, v_colab.id, v_cc, v_colab.salario, v_hn, v_he, v_extras, v_encargos, v_adiant, v_custo, v_liquido);

    update public.rh_adiantamentos set folha_id = v_folha
    where colaborador_id = v_colab.id and date_trunc('month', competencia)::date = v_ini and folha_id is null;
  end loop;

  update public.folhas f set
    valor_bruto = coalesce((select sum(salario_base + valor_extras) from public.folha_itens where folha_id = v_folha), 0),
    valor_encargos = coalesce((select sum(encargos) from public.folha_itens where folha_id = v_folha), 0),
    valor_adiantamentos = coalesce((select sum(adiantamentos) from public.folha_itens where folha_id = v_folha), 0),
    valor_liquido = coalesce((select sum(valor_liquido) from public.folha_itens where folha_id = v_folha), 0),
    custo_total = coalesce((select sum(custo_total) from public.folha_itens where folha_id = v_folha), 0)
  where f.id = v_folha;

  return v_folha;
end $$;
revoke all on function public.fn_gerar_folha(date, numeric) from public, anon;
grant execute on function public.fn_gerar_folha(date, numeric) to authenticated;
