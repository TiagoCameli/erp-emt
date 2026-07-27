-- fn_gerar_folha passa a DISCRIMINAR os encargos pela config (Bloco 6) — MUDANCA EM DINHEIRO.
-- Antes: um unico % global (p_encargos_pct) sobre o salario. Agora: uma linha por encargo ATIVO
-- de public.folha_encargos, gravada em public.folha_item_encargos, e o total (folha_itens.encargos)
-- e a SOMA dessas linhas.
--
-- Decisoes desta migration:
--  * ORDEM id/total: o insert de folha_item_encargos precisa do folha_itens.id (FK), mas o
--    folha_itens.encargos precisa do total. Resolvido com a opcao (b) do brief, que garante
--    consistencia estrutural: insere folha_itens com encargos=0 e custo_total=salario, captura o
--    id com RETURNING, roda o loop somando v_encargos E inserindo cada linha (unica fonte da
--    formula), e fecha com UPDATE folha_itens SET encargos=v_encargos, custo_total=salario+v_encargos.
--    Assim sum(folha_item_encargos.valor) == folha_itens.encargos por construcao (o loop e a unica
--    formula; nao ha calculo duplicado que possa divergir por arredondamento).
--  * p_encargos_pct: mantido na ASSINATURA (default 0) para NAO quebrar o RPC/call existente, mas
--    IGNORADO no calculo (legado). Removida tambem a antiga validacao "p_encargos_pct < 0".
--  * folhas.encargos_percentual: deixa de ser input do usuario; passa a guardar a SOMA dos percentuais
--    ativos (valor informativo, exibido no cabecalho da planilha). Se nao houver encargo ativo, fica 0.
--  * Limpeza na regeracao: o delete de folha_itens ja cascateia para folha_item_encargos
--    (FK ON DELETE CASCADE, Task 1). Nao ha delete explicito de folha_item_encargos.
--  * PRESERVADO exatamente: checagem de permissao, montagem da competencia, upsert da folha,
--    desvincula/revincula de rh_adiantamentos, filtro clt/ativo/aprovado, salario fechado (extras=0),
--    determinacao do centro de custo, e o UPDATE de somatorios de folhas
--    (valor_bruto = sum(salario_base + valor_extras) inalterado). fn_fechar_folha/fn_reabrir_folha
--    NAO sao tocadas.
--
-- Rollback (versao ANTERIOR — Bloco 4, % global unico):
--   create or replace function public.fn_gerar_folha(p_competencia date, p_encargos_pct numeric default 0)
--    returns uuid language plpgsql security definer set search_path to '' as $rollback$
--   declare
--     v_folha uuid; v_status text; v_ini date; v_fim date;
--     v_colab record; v_hn numeric; v_he numeric; v_valor_hora numeric; v_extras numeric;
--     v_encargos numeric; v_adiant numeric; v_custo numeric; v_liquido numeric; v_cc uuid;
--   begin
--     if not public.tem_permissao('rh.folha', 'criar') then raise exception 'Sem permissao para gerar folha'; end if;
--     if p_encargos_pct < 0 then raise exception 'Percentual de encargos invalido'; end if;
--     v_ini := date_trunc('month', p_competencia)::date;
--     v_fim := (v_ini + interval '1 month')::date;
--     select id, status into v_folha, v_status from public.folhas where competencia = v_ini;
--     if v_status = 'fechada' then raise exception 'A folha desta competencia ja esta fechada'; end if;
--     if v_folha is null then
--       insert into public.folhas (competencia, encargos_percentual, created_by) values (v_ini, p_encargos_pct, (select auth.uid())) returning id into v_folha;
--     else
--       update public.rh_adiantamentos set folha_id = null where folha_id = v_folha;
--       delete from public.folha_itens where folha_id = v_folha;
--       update public.folhas set encargos_percentual = p_encargos_pct where id = v_folha;
--     end if;
--     for v_colab in
--       select id, coalesce(salario, 0) as salario, centro_custo_id from public.colaboradores
--       where ativo and vinculo = 'clt'
--     loop
--       select coalesce(sum(a.horas_normais), 0), coalesce(sum(a.horas_extras), 0)
--       into v_hn, v_he
--       from public.rh_apontamentos a join public.rh_pontos pt on pt.id = a.ponto_id
--       where a.colaborador_id = v_colab.id and a.tipo = 'normal' and pt.status = 'aprovado' and pt.data >= v_ini and pt.data < v_fim;
--       continue when v_colab.salario = 0 and v_hn = 0 and v_he = 0;
--       v_valor_hora := case when v_colab.salario > 0 then v_colab.salario / 220.0 else 0 end;
--       v_extras := 0;
--       v_encargos := round(v_colab.salario * p_encargos_pct / 100.0, 2);
--       select coalesce(sum(valor), 0) into v_adiant from public.rh_adiantamentos
--       where colaborador_id = v_colab.id and date_trunc('month', competencia)::date = v_ini and folha_id is null;
--       v_custo := v_colab.salario + v_encargos;
--       v_liquido := v_colab.salario - v_adiant;
--       v_cc := null;
--       select co.id into v_cc
--       from public.rh_apontamentos a
--       join public.rh_pontos pt on pt.id = a.ponto_id
--       join public.centros_custo co on co.obra_id = pt.obra_id and co.nivel = 1
--       where a.colaborador_id = v_colab.id and a.tipo = 'normal' and pt.status = 'aprovado' and pt.data >= v_ini and pt.data < v_fim
--       group by co.id
--       order by sum(a.horas_normais + a.horas_extras) desc
--       limit 1;
--       if v_cc is null then v_cc := v_colab.centro_custo_id; end if;
--       insert into public.folha_itens (folha_id, colaborador_id, centro_custo_id, salario_base, horas_normais, horas_extras, valor_extras, encargos, adiantamentos, custo_total, valor_liquido)
--       values (v_folha, v_colab.id, v_cc, v_colab.salario, v_hn, v_he, v_extras, v_encargos, v_adiant, v_custo, v_liquido);
--       update public.rh_adiantamentos set folha_id = v_folha
--       where colaborador_id = v_colab.id and date_trunc('month', competencia)::date = v_ini and folha_id is null;
--     end loop;
--     update public.folhas f set
--       valor_bruto = coalesce((select sum(salario_base + valor_extras) from public.folha_itens where folha_id = v_folha), 0),
--       valor_encargos = coalesce((select sum(encargos) from public.folha_itens where folha_id = v_folha), 0),
--       valor_adiantamentos = coalesce((select sum(adiantamentos) from public.folha_itens where folha_id = v_folha), 0),
--       valor_liquido = coalesce((select sum(valor_liquido) from public.folha_itens where folha_id = v_folha), 0),
--       custo_total = coalesce((select sum(custo_total) from public.folha_itens where folha_id = v_folha), 0)
--     where f.id = v_folha;
--     return v_folha;
--   end $rollback$;

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
begin
  if not public.tem_permissao('rh.folha', 'criar') then raise exception 'Sem permissao para gerar folha'; end if;
  -- p_encargos_pct: LEGADO. Os encargos agora vem discriminados de public.folha_encargos (ativos).
  -- Mantido na assinatura so para nao quebrar o RPC/call existente; ignorado no calculo.
  v_ini := date_trunc('month', p_competencia)::date;
  v_fim := (v_ini + interval '1 month')::date;

  -- Soma dos percentuais ativos: valor informativo gravado em folhas.encargos_percentual
  -- (o % global deixou de ser input; aqui vira o somatorio das aliquotas vigentes).
  select coalesce(sum(percentual), 0) into v_pct_total from public.folha_encargos where ativo;

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

    -- Liquido sem extra e independente de encargos.
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

    -- Insere o item com encargos provisorios (0) e custo = salario; captura o id para as linhas discriminadas.
    insert into public.folha_itens (folha_id, colaborador_id, centro_custo_id, salario_base, horas_normais, horas_extras, valor_extras, encargos, adiantamentos, custo_total, valor_liquido)
    values (v_folha, v_colab.id, v_cc, v_colab.salario, v_hn, v_he, v_extras, 0, v_adiant, v_colab.salario, v_liquido)
    returning id into v_item_id;

    -- Discrimina: uma linha por encargo ativo; valor = round(salario * aliquota / 100, 2).
    -- v_encargos e a SOMA das linhas gravadas (mesma e unica formula) => sum(linhas) == folha_itens.encargos.
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
