-- Bloco 7 / Task 4: fn_gerar_folha passa a DESCONTAR INSS e IRRF no liquido.
--
-- Por colaborador CLT, apos o salario, calcula:
--   v_inss  : INSS progressivo sobre folha_inss_faixas (aliquota so na porcao
--             dentro de cada faixa, ordenado por limite_ate, trava no teto).
--   v_qtd_dep: dependentes IRRF (rh_dependentes.dependente_irrf) do colaborador.
--   v_irrf  : min(completo, simplificado) sobre folha_irrf_faixas +
--             folha_parametros (deducao_por_dependente, desconto_simplificado).
-- Espelha EXATAMENTE src/modules/rh/folha/calculo-imposto.ts (Task 3).
-- Config vazia (sem faixas/params) => INSS/IRRF = 0.
-- Grava inss/irrf no folha_itens; v_liquido := salario - inss - irrf - adiant.
-- Encargos discriminados, custo (salario + encargos) e todo o resto (Bloco 6)
-- ficam INALTERADOS. fn_fechar/fn_reabrir intactas.
--
-- ============================================================================
-- ROLLBACK (versao anterior, pos-Bloco 6, ANTES desta task): reaplicar o corpo
-- abaixo com create or replace.
-- ----------------------------------------------------------------------------
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
--   v_item_id uuid; v_enc record; v_valor numeric; v_pct_total numeric;
-- begin
--   if not public.tem_permissao('rh.folha', 'criar') then raise exception 'Sem permissao para gerar folha'; end if;
--   v_ini := date_trunc('month', p_competencia)::date;
--   v_fim := (v_ini + interval '1 month')::date;
--   select coalesce(sum(percentual), 0) into v_pct_total from public.folha_encargos where ativo;
--   select id, status into v_folha, v_status from public.folhas where competencia = v_ini;
--   if v_status = 'fechada' then raise exception 'A folha desta competencia ja esta fechada'; end if;
--   if v_folha is null then
--     insert into public.folhas (competencia, encargos_percentual, created_by) values (v_ini, v_pct_total, (select auth.uid())) returning id into v_folha;
--   else
--     update public.rh_adiantamentos set folha_id = null where folha_id = v_folha;
--     delete from public.folha_itens where folha_id = v_folha;
--     update public.folhas set encargos_percentual = v_pct_total where id = v_folha;
--   end if;
--   for v_colab in
--     select id, coalesce(salario, 0) as salario, centro_custo_id from public.colaboradores
--     where ativo and vinculo = 'clt'
--   loop
--     select coalesce(sum(a.horas_normais), 0), coalesce(sum(a.horas_extras), 0)
--     into v_hn, v_he
--     from public.rh_apontamentos a join public.rh_pontos pt on pt.id = a.ponto_id
--     where a.colaborador_id = v_colab.id and a.tipo = 'normal' and pt.status = 'aprovado' and pt.data >= v_ini and pt.data < v_fim;
--     continue when v_colab.salario = 0 and v_hn = 0 and v_he = 0;
--     v_valor_hora := case when v_colab.salario > 0 then v_colab.salario / 220.0 else 0 end;
--     v_extras := 0;
--     select coalesce(sum(valor), 0) into v_adiant from public.rh_adiantamentos
--     where colaborador_id = v_colab.id and date_trunc('month', competencia)::date = v_ini and folha_id is null;
--     v_liquido := v_colab.salario - v_adiant;
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
--     insert into public.folha_itens (folha_id, colaborador_id, centro_custo_id, salario_base, horas_normais, horas_extras, valor_extras, encargos, adiantamentos, custo_total, valor_liquido)
--     values (v_folha, v_colab.id, v_cc, v_colab.salario, v_hn, v_he, v_extras, 0, v_adiant, v_colab.salario, v_liquido)
--     returning id into v_item_id;
--     v_encargos := 0;
--     for v_enc in
--       select nome, percentual from public.folha_encargos where ativo order by nome
--     loop
--       v_valor := round(v_colab.salario * v_enc.percentual / 100.0, 2);
--       insert into public.folha_item_encargos (folha_item_id, nome, percentual, valor)
--       values (v_item_id, v_enc.nome, v_enc.percentual, v_valor);
--       v_encargos := v_encargos + v_valor;
--     end loop;
--     v_custo := v_colab.salario + v_encargos;
--     update public.folha_itens set encargos = v_encargos, custo_total = v_custo where id = v_item_id;
--     update public.rh_adiantamentos set folha_id = v_folha
--     where colaborador_id = v_colab.id and date_trunc('month', competencia)::date = v_ini and folha_id is null;
--   end loop;
--   update public.folhas f set
--     valor_bruto = coalesce((select sum(salario_base + valor_extras) from public.folha_itens where folha_id = v_folha), 0),
--     valor_encargos = coalesce((select sum(encargos) from public.folha_itens where folha_id = v_folha), 0),
--     valor_adiantamentos = coalesce((select sum(adiantamentos) from public.folha_itens where folha_id = v_folha), 0),
--     valor_liquido = coalesce((select sum(valor_liquido) from public.folha_itens where folha_id = v_folha), 0),
--     custo_total = coalesce((select sum(custo_total) from public.folha_itens where folha_id = v_folha), 0)
--   where f.id = v_folha;
--   return v_folha;
-- end $function$;
-- ============================================================================

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
  v_item_id uuid; v_enc record; v_valor numeric; v_pct_total numeric;
  -- Bloco 7 / Task 4: descontos legais por colaborador.
  v_inss numeric; v_irrf numeric; v_qtd_dep integer;
  v_deducao_dep numeric; v_desconto_simpl numeric; v_has_irrf boolean;
  v_base_c numeric; v_base_s numeric; v_irrf_completo numeric; v_irrf_simplificado numeric;
  v_aliq numeric; v_parc numeric;
begin
  if not public.tem_permissao('rh.folha', 'criar') then raise exception 'Sem permissao para gerar folha'; end if;
  -- p_encargos_pct: LEGADO. Os encargos agora vem discriminados de public.folha_encargos (ativos).
  -- Mantido na assinatura so para nao quebrar o RPC/call existente; ignorado no calculo.
  v_ini := date_trunc('month', p_competencia)::date;
  v_fim := (v_ini + interval '1 month')::date;

  -- Soma dos percentuais ativos: valor informativo gravado em folhas.encargos_percentual.
  select coalesce(sum(percentual), 0) into v_pct_total from public.folha_encargos where ativo;

  -- Parametros globais do IRRF (folha_parametros e linha unica id=1). Sem linha => 0 (sem desconto legal).
  select coalesce(irrf_deducao_por_dependente, 0), coalesce(irrf_desconto_simplificado, 0)
  into v_deducao_dep, v_desconto_simpl
  from public.folha_parametros where id = 1;
  v_deducao_dep := coalesce(v_deducao_dep, 0);
  v_desconto_simpl := coalesce(v_desconto_simpl, 0);

  -- Sem faixas de IRRF cadastradas => IRRF 0 (espelha calcularIRRF com faixas vazias).
  select exists (select 1 from public.folha_irrf_faixas) into v_has_irrf;

  select id, status into v_folha, v_status from public.folhas where competencia = v_ini;
  if v_status = 'fechada' then raise exception 'A folha desta competencia ja esta fechada'; end if;
  if v_folha is null then
    insert into public.folhas (competencia, encargos_percentual, created_by) values (v_ini, v_pct_total, (select auth.uid())) returning id into v_folha;
  else
    update public.rh_adiantamentos set folha_id = null where folha_id = v_folha;
    -- delete cascateia para folha_item_encargos (FK ON DELETE CASCADE).
    delete from public.folha_itens where folha_id = v_folha;
    update public.folhas set encargos_percentual = v_pct_total where id = v_folha;
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

    select coalesce(sum(valor), 0) into v_adiant from public.rh_adiantamentos
    where colaborador_id = v_colab.id and date_trunc('month', competencia)::date = v_ini and folha_id is null;

    -- ===== Bloco 7 / Task 4: INSS e IRRF (espelha calculo-imposto.ts) =====
    -- INSS progressivo (calcularINSS): para cada faixa (ordenada por limite_ate),
    -- aliquota SO sobre a porcao do salario entre o limite anterior e limite_ate;
    -- porcao negativa vira 0 (equivale ao break do TS) => trava no teto. round(,2) na soma.
    select coalesce(round(sum(t.porcao * t.aliquota / 100.0), 2), 0)
    into v_inss
    from (
      select greatest(
               least(v_colab.salario, f.limite_ate)
               - coalesce(lag(f.limite_ate) over (order by f.limite_ate), 0),
               0) as porcao,
             f.aliquota
      from public.folha_inss_faixas f
    ) t;

    -- Dependentes IRRF do colaborador (Bloco 2).
    select count(*) into v_qtd_dep
    from public.rh_dependentes
    where colaborador_id = v_colab.id and dependente_irrf;

    -- IRRF = min(completo, simplificado) (calcularIRRF). Sem faixas => 0.
    if v_has_irrf then
      -- completo: base = salario - inss - qtd_dep * deducao_por_dependente
      v_base_c := v_colab.salario - v_inss - v_qtd_dep * v_deducao_dep;
      -- simplificado: base = salario - desconto_simplificado
      v_base_s := v_colab.salario - v_desconto_simpl;

      -- impostoIrrf(base_c): faixa = 1a cujo limite_ate >= max(base,0); senao a ultima.
      -- imposto = max(0, max(base,0) * aliquota/100 - parcela), round(,2).
      select fx.aliquota, fx.parcela_deduzir into v_aliq, v_parc
      from public.folha_irrf_faixas fx
      where fx.id = coalesce(
        (select id from public.folha_irrf_faixas where limite_ate >= greatest(v_base_c, 0) order by limite_ate asc limit 1),
        (select id from public.folha_irrf_faixas order by limite_ate desc limit 1));
      v_irrf_completo := round(greatest(greatest(v_base_c, 0) * v_aliq / 100.0 - v_parc, 0), 2);

      -- impostoIrrf(base_s)
      select fx.aliquota, fx.parcela_deduzir into v_aliq, v_parc
      from public.folha_irrf_faixas fx
      where fx.id = coalesce(
        (select id from public.folha_irrf_faixas where limite_ate >= greatest(v_base_s, 0) order by limite_ate asc limit 1),
        (select id from public.folha_irrf_faixas order by limite_ate desc limit 1));
      v_irrf_simplificado := round(greatest(greatest(v_base_s, 0) * v_aliq / 100.0 - v_parc, 0), 2);

      v_irrf := least(v_irrf_completo, v_irrf_simplificado);
    else
      v_irrf := 0;
    end if;
    -- ===== fim INSS/IRRF =====

    -- Liquido: salario menos descontos legais (INSS/IRRF) e adiantamentos. Sem extra.
    v_liquido := v_colab.salario - v_inss - v_irrf - v_adiant;

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

    -- Insere o item com encargos provisorios (0) e custo = salario; captura o id para as linhas discriminadas.
    insert into public.folha_itens (folha_id, colaborador_id, centro_custo_id, salario_base, horas_normais, horas_extras, valor_extras, encargos, inss, irrf, adiantamentos, custo_total, valor_liquido)
    values (v_folha, v_colab.id, v_cc, v_colab.salario, v_hn, v_he, v_extras, 0, v_inss, v_irrf, v_adiant, v_colab.salario, v_liquido)
    returning id into v_item_id;

    -- Discrimina: uma linha por encargo ativo; valor = round(salario * aliquota / 100, 2).
    -- v_encargos e a SOMA das linhas (mesma e unica formula) => sum(linhas) == folha_itens.encargos.
    v_encargos := 0;
    for v_enc in
      select nome, percentual from public.folha_encargos where ativo order by nome
    loop
      v_valor := round(v_colab.salario * v_enc.percentual / 100.0, 2);
      insert into public.folha_item_encargos (folha_item_id, nome, percentual, valor)
      values (v_item_id, v_enc.nome, v_enc.percentual, v_valor);
      v_encargos := v_encargos + v_valor;
    end loop;

    -- Fecha o item com o total discriminado e o custo da empresa (salario + encargos).
    -- INSS/IRRF sao desconto do trabalhador: NAO entram no custo da empresa.
    v_custo := v_colab.salario + v_encargos;
    update public.folha_itens set encargos = v_encargos, custo_total = v_custo where id = v_item_id;

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
