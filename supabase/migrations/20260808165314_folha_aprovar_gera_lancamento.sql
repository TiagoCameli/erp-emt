-- Aplicada em produção pelo MCP (apply_migration) em 2026-08-08, versão
-- 20260808165314 no ledger. Este arquivo é o registro versionado do que foi
-- aplicado; NÃO rode `supabase db push` neste projeto (ver docs/decisoes.md).
--
-- Task 4 do Bloco 8a, parte 3 de 4: a task de dinheiro.
--
-- A aprovação da folha passa a criar as contas a pagar: um lançamento por
-- colaborador com o líquido e um por grupo de recolhimento com a guia.
-- Espelha a fn_fechar_diarias (o "RH vira Financeiro" do projeto): trava de
-- competência antes de inserir, lancamentos + lancamento_parcelas +
-- lancamento_rateios, e o id gravado de volta na origem.
--
-- A assinatura NÃO muda: a Server Action aprovarFolha (Task 2) já chama esta
-- RPC em produção. As checagens que já existiam (permissão, status pendente,
-- folha vazia, for update) continuam, na mesma ordem.
--
-- Identidade que fecha a conferência do contador:
--   Σ líquidos + Σ guias + Σ adiantamentos == folhas.custo_total
-- porque os retidos e o adiantamento se cancelam:
--   Σ(salário − inss − irrf − adiant) + Σ(encargos + inss + irrf) + Σ(adiant)
--   = Σ(salário) + Σ(encargos) = Σ custo_total
-- Provada em banco (transação com rollback), 2 colaboradores em 2 centros de
-- custo + 1 adiantamento: líquidos 6202.50 + guias 3237.50 + adiantamentos
-- 800.00 = 10240.00 = custo_total, diferença 0.00.
create or replace function public.fn_aprovar_folha(p_folha uuid)
returns void
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_status text; v_comp date;
  v_dia_sal smallint; v_dia_guia smallint;
  v_grupo_inss text; v_grupo_irrf text;
  v_venc_sal date; v_venc_guia date;
  v_uid uuid := (select auth.uid());
  v_item record; v_guia record; v_lanc uuid; v_guia_id uuid;
begin
  if not public.tem_permissao('rh.folha', 'aprovar') then
    raise exception 'Sem permissao para aprovar a folha';
  end if;

  select status, competencia into v_status, v_comp
  from public.folhas where id = p_folha for update;

  if v_status is null then raise exception 'Folha nao encontrada'; end if;
  if v_status <> 'pendente_aprovacao' then
    raise exception 'A folha de %/% esta em "%": só da para aprovar o que esta pendente de aprovacao.',
      to_char(v_comp, 'MM'), to_char(v_comp, 'YYYY'), v_status;
  end if;
  if not exists (select 1 from public.folha_itens where folha_id = p_folha) then
    raise exception 'A folha esta vazia';
  end if;

  -- Mesma trava de competencia que a fn_fechar_diarias usa.
  perform public.fn_exigir_competencia_aberta(v_comp, 'folha', p_folha);

  select dia_pagamento_salario, dia_vencimento_guias,
         grupo_recolhimento_inss, grupo_recolhimento_irrf
  into v_dia_sal, v_dia_guia, v_grupo_inss, v_grupo_irrf
  from public.folha_parametros where id = 1;

  v_venc_sal  := public.fn_vencimento_folha(v_comp, v_dia_sal);
  v_venc_guia := public.fn_vencimento_folha(v_comp, v_dia_guia);

  -- ===== 1. Salario: um lancamento por colaborador =====
  -- Item com liquido <= 0 nao gera lancamento: o adiantamento do mes pode ter
  -- consumido o salario inteiro, e lancamento de R$ 0 e sujeira na tela.
  for v_item in
    select fi.id, fi.centro_custo_id, fi.valor_liquido, c.nome
    from public.folha_itens fi
    join public.colaboradores c on c.id = fi.colaborador_id
    where fi.folha_id = p_folha and fi.valor_liquido > 0
    order by c.nome
  loop
    insert into public.lancamentos
      (tipo, origem, origem_id, centro_custo_id, descricao, valor, status,
       data_compra, mes_competencia, data_vencimento, created_by)
    values
      ('a_pagar', 'folha', v_item.id, v_item.centro_custo_id,
       'Salario ' || v_item.nome || ' ' || to_char(v_comp, 'MM/YYYY'),
       v_item.valor_liquido, 'a_pagar',
       (now() at time zone 'America/Rio_Branco')::date, v_comp, v_venc_sal, v_uid)
    returning id into v_lanc;

    insert into public.lancamento_parcelas
      (lancamento_id, numero_parcela, valor, data_vencimento, status, created_by)
    values (v_lanc, 1, v_item.valor_liquido, v_venc_sal, 'pendente', v_uid);

    if v_item.centro_custo_id is not null then
      insert into public.lancamento_rateios (lancamento_id, centro_custo_id, valor, created_by)
      values (v_lanc, v_item.centro_custo_id, v_item.valor_liquido, v_uid);
    end if;

    update public.folha_itens set lancamento_id = v_lanc where id = v_item.id;
  end loop;

  -- ===== 2. Guias: um lancamento por grupo de recolhimento =====
  -- A fonte junta as tres origens de valor da guia. O rateio e EXATO, nao
  -- proporcional: cada centavo ja nasce ligado a um item, e o item tem centro
  -- de custo. Logo sum(rateios) == valor do lancamento por construcao.
  for v_guia in
    with fonte as (
      -- encargos patronais, pelo grupo congelado no snapshot
      select fie.grupo_recolhimento as grupo, fi.centro_custo_id, fie.valor
      from public.folha_item_encargos fie
      join public.folha_itens fi on fi.id = fie.folha_item_id
      where fi.folha_id = p_folha and fie.grupo_recolhimento is not null
      union all
      -- INSS retido do trabalhador
      select v_grupo_inss, fi.centro_custo_id, fi.inss
      from public.folha_itens fi
      where fi.folha_id = p_folha and v_grupo_inss is not null and fi.inss > 0
      union all
      -- IRRF retido do trabalhador
      select v_grupo_irrf, fi.centro_custo_id, fi.irrf
      from public.folha_itens fi
      where fi.folha_id = p_folha and v_grupo_irrf is not null and fi.irrf > 0
    )
    -- por_cc soma os centavos por (grupo, centro de custo); o total do grupo e a
    -- soma dessas somas. Some valor_cc, nao valor: `valor` e coluna da fonte e
    -- nao existe mais depois do group by de por_cc.
    select grupo,
           sum(valor_cc) as total,
           jsonb_agg(jsonb_build_object('cc', centro_custo_id, 'valor', valor_cc))
             filter (where centro_custo_id is not null) as rateios
    from (
      select grupo, centro_custo_id, sum(valor) as valor_cc
      from fonte group by grupo, centro_custo_id
    ) por_cc
    group by grupo
    having sum(valor_cc) > 0
    order by grupo
  loop
    insert into public.folha_guias (folha_id, grupo, valor)
    values (p_folha, v_guia.grupo, v_guia.total)
    returning id into v_guia_id;

    insert into public.lancamentos
      (tipo, origem, origem_id, centro_custo_id, descricao, valor, status,
       data_compra, mes_competencia, data_vencimento, created_by)
    values
      ('a_pagar', 'folha_guia', v_guia_id, null,
       v_guia.grupo || ' folha ' || to_char(v_comp, 'MM/YYYY'),
       v_guia.total, 'a_pagar',
       (now() at time zone 'America/Rio_Branco')::date, v_comp, v_venc_guia, v_uid)
    returning id into v_lanc;

    insert into public.lancamento_parcelas
      (lancamento_id, numero_parcela, valor, data_vencimento, status, created_by)
    values (v_lanc, 1, v_guia.total, v_venc_guia, 'pendente', v_uid);

    insert into public.lancamento_rateios (lancamento_id, centro_custo_id, valor, created_by)
    select v_lanc, (r->>'cc')::uuid, (r->>'valor')::numeric, v_uid
    from jsonb_array_elements(coalesce(v_guia.rateios, '[]'::jsonb)) r;

    update public.folha_guias set lancamento_id = v_lanc where id = v_guia_id;
  end loop;

  update public.folhas
  set status = 'aprovado', aprovado_por = v_uid, aprovado_em = now(), motivo_rejeicao = null
  where id = p_folha;
end;
$function$;

revoke all on function public.fn_aprovar_folha(uuid) from public;
grant execute on function public.fn_aprovar_folha(uuid) to authenticated;

-- fn_vencimento_folha nasceu com o EXECUTE default (PUBLIC), o que daria a
-- anon o direito de chamar. E so aritmetica de data, mas o padrao do projeto e
-- fechar e abrir de proposito.
revoke all on function public.fn_vencimento_folha(date, smallint) from public;
grant execute on function public.fn_vencimento_folha(date, smallint) to authenticated;

-- Trava fail-closed: a fn continua definer com dono postgres (e o unico jeito de
-- passar pelo trg_guarda_status_folha e de escrever em folhas/folha_guias sem
-- grant), anon nao executa nenhuma das duas, e o corpo realmente gera lancamento.
do $$
declare v_def text;
begin
  select pg_get_functiondef(p.oid) into v_def
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public' and p.proname = 'fn_aprovar_folha';

  if not exists (
    select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname = 'fn_aprovar_folha'
      and p.prosecdef and pg_get_userbyid(p.proowner) = 'postgres'
  ) then
    raise exception 'fn_aprovar_folha precisa ser security definer com dono postgres';
  end if;

  if v_def not like '%insert into public.lancamentos%'
     or v_def not like '%insert into public.folha_guias%'
     or v_def not like '%insert into public.lancamento_parcelas%'
     or v_def not like '%insert into public.lancamento_rateios%' then
    raise exception 'fn_aprovar_folha nao gera os lancamentos: so faz a transicao de status';
  end if;

  -- As checagens herdadas da Task 2 nao podem ter caido na reescrita.
  if v_def not like '%tem_permissao(''rh.folha'', ''aprovar'')%'
     or v_def not like '%pendente_aprovacao%'
     or v_def not like '%A folha esta vazia%'
     or v_def not like '%for update%' then
    raise exception 'fn_aprovar_folha perdeu uma das checagens da Task 2';
  end if;

  if exists (
    select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.proname in ('fn_aprovar_folha', 'fn_vencimento_folha')
      and has_function_privilege('anon', p.oid, 'execute')
  ) then
    raise exception 'anon nao pode executar as funcoes da folha';
  end if;
end $$;

-- Rollback: recriar a fn_aprovar_folha com o corpo da 20260808144223
-- (só a transição de status), mantendo a mesma assinatura.
