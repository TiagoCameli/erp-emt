-- fn_gerar_folha: a folha gerencial PARA de pagar hora extra (Bloco 4, Task 5).
--
-- Decisao do Tiago: o salario da EMT e FECHADO e ja inclui as horas extras. Por
-- enquanto as horas extras sao so CONTROLE DE PRODUTIVIDADE, nao pagamento. Antes,
-- esta fn pagava o extra (v_extras = horas_extras x salario/220 x 1.5), somava ao
-- custo e ao liquido, e calculava encargos sobre salario+extras. Isso inflava o
-- custo gerencial de quem batia hora extra.
--
-- Agora:
--   v_extras   := 0                                      (nao paga extra)
--   v_encargos := round(salario * pct / 100, 2)          (encargos SO sobre o salario fixo)
--   v_custo    := salario + encargos                      (sem extra no custo)
--   v_liquido  := salario - adiantamentos                 (sem extra no liquido)
--
-- As horas continuam gravadas em folha_itens (horas_normais / horas_extras) como
-- PRODUTIVIDADE; valor_extras vai gravado como 0. Todo o resto e identico ao
-- original: checagem de permissao rh.folha/criar, montagem da competencia,
-- upsert/limpeza da folha, filtro vinculo='clt' e ponto aprovado, adiantamentos,
-- selecao do centro de custo, o vinculo dos adiantamentos a folha e os somatorios.
-- fn_fechar_folha / fn_reabrir_folha NAO sao tocadas.
--
-- v_valor_hora continua sendo calculado (fica sem uso agora), mantido pra reduzir
-- o diff; nao afeta nenhum valor gravado.
--
-- Rollback (versao ANTERIOR da fn, que PAGAVA extra):
--
-- CREATE OR REPLACE FUNCTION public.fn_gerar_folha(p_competencia date, p_encargos_pct numeric DEFAULT 0)
--  RETURNS uuid
--  LANGUAGE plpgsql
--  SECURITY DEFINER
--  SET search_path TO ''
-- AS $function$
-- declare
--   v_folha uuid; v_status text; v_ini date; v_fim date;
--   v_colab record; v_hn numeric; v_he numeric; v_valor_hora numeric; v_extras numeric;
--   v_encargos numeric; v_adiant numeric; v_custo numeric; v_liquido numeric; v_cc uuid;
-- begin
--   if not public.tem_permissao('rh.folha', 'criar') then raise exception 'Sem permissao para gerar folha'; end if;
--   if p_encargos_pct < 0 then raise exception 'Percentual de encargos invalido'; end if;
--   v_ini := date_trunc('month', p_competencia)::date;
--   v_fim := (v_ini + interval '1 month')::date;
--
--   select id, status into v_folha, v_status from public.folhas where competencia = v_ini;
--   if v_status = 'fechada' then raise exception 'A folha desta competencia ja esta fechada'; end if;
--   if v_folha is null then
--     insert into public.folhas (competencia, encargos_percentual, created_by) values (v_ini, p_encargos_pct, (select auth.uid())) returning id into v_folha;
--   else
--     update public.rh_adiantamentos set folha_id = null where folha_id = v_folha;
--     delete from public.folha_itens where folha_id = v_folha;
--     update public.folhas set encargos_percentual = p_encargos_pct where id = v_folha;
--   end if;
--
--   for v_colab in
--     select id, coalesce(salario, 0) as salario, centro_custo_id from public.colaboradores
--     where ativo and vinculo = 'clt'
--   loop
--     select coalesce(sum(a.horas_normais), 0), coalesce(sum(a.horas_extras), 0)
--     into v_hn, v_he
--     from public.rh_apontamentos a join public.rh_pontos pt on pt.id = a.ponto_id
--     where a.colaborador_id = v_colab.id and a.tipo = 'normal' and pt.status = 'aprovado' and pt.data >= v_ini and pt.data < v_fim;
--
--     continue when v_colab.salario = 0 and v_hn = 0 and v_he = 0;
--
--     v_valor_hora := case when v_colab.salario > 0 then v_colab.salario / 220.0 else 0 end;
--     v_extras := round(v_he * v_valor_hora * 1.5, 2);
--     v_encargos := round((v_colab.salario + v_extras) * p_encargos_pct / 100.0, 2);
--
--     select coalesce(sum(valor), 0) into v_adiant from public.rh_adiantamentos
--     where colaborador_id = v_colab.id and date_trunc('month', competencia)::date = v_ini and folha_id is null;
--
--     v_custo := v_colab.salario + v_extras + v_encargos;
--     v_liquido := v_colab.salario + v_extras - v_adiant;
--
--     v_cc := null;
--     select co.id into v_cc
--     from public.rh_apontamentos a
--     join public.rh_pontos pt on pt.id = a.ponto_id
--     join public.centros_custo co on co.obra_id = pt.obra_id and co.nivel = 1
--     where a.colaborador_id = v_colab.id and a.tipo = 'normal' and pt.status = 'aprovado' and pt.data >= v_ini and pt.data < v_fim
--     group by co.id
--     order by sum(a.horas_normais + a.horas_extras) desc
--     limit 1;
--     if v_cc is null then v_cc := v_colab.centro_custo_id; end if;
--
--     insert into public.folha_itens (folha_id, colaborador_id, centro_custo_id, salario_base, horas_normais, horas_extras, valor_extras, encargos, adiantamentos, custo_total, valor_liquido)
--     values (v_folha, v_colab.id, v_cc, v_colab.salario, v_hn, v_he, v_extras, v_encargos, v_adiant, v_custo, v_liquido);
--
--     update public.rh_adiantamentos set folha_id = v_folha
--     where colaborador_id = v_colab.id and date_trunc('month', competencia)::date = v_ini and folha_id is null;
--   end loop;
--
--   update public.folhas f set
--     valor_bruto = coalesce((select sum(salario_base + valor_extras) from public.folha_itens where folha_id = v_folha), 0),
--     valor_encargos = coalesce((select sum(encargos) from public.folha_itens where folha_id = v_folha), 0),
--     valor_adiantamentos = coalesce((select sum(adiantamentos) from public.folha_itens where folha_id = v_folha), 0),
--     valor_liquido = coalesce((select sum(valor_liquido) from public.folha_itens where folha_id = v_folha), 0),
--     custo_total = coalesce((select sum(custo_total) from public.folha_itens where folha_id = v_folha), 0)
--   where f.id = v_folha;
--
--   return v_folha;
-- end $function$;

create or replace function public.fn_gerar_folha(p_competencia date, p_encargos_pct numeric default 0)
 returns uuid
 language plpgsql
 security definer
 set search_path to ''
as $function$
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
    select coalesce(sum(a.horas_normais), 0), coalesce(sum(a.horas_extras), 0)
    into v_hn, v_he
    from public.rh_apontamentos a join public.rh_pontos pt on pt.id = a.ponto_id
    where a.colaborador_id = v_colab.id and a.tipo = 'normal' and pt.status = 'aprovado' and pt.data >= v_ini and pt.data < v_fim;

    continue when v_colab.salario = 0 and v_hn = 0 and v_he = 0;

    v_valor_hora := case when v_colab.salario > 0 then v_colab.salario / 220.0 else 0 end;
    -- Salario fechado: nao paga extra. Horas extras seguem gravadas so como produtividade.
    v_extras := 0;
    -- Encargos SO sobre o salario fixo (nao mais sobre salario + extras).
    v_encargos := round(v_colab.salario * p_encargos_pct / 100.0, 2);

    select coalesce(sum(valor), 0) into v_adiant from public.rh_adiantamentos
    where colaborador_id = v_colab.id and date_trunc('month', competencia)::date = v_ini and folha_id is null;

    -- Custo e liquido sem extra.
    v_custo := v_colab.salario + v_encargos;
    v_liquido := v_colab.salario - v_adiant;

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
end $function$;
