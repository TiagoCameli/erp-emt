-- =============================================================
-- Folha gerencial: o adiantamento sai da gratificacao
--
-- Correcao do Tiago (05/10/2026) a 20261005220000: a gratificacao cheia saia
-- do liquido e o adiantamento caia no salario (Jeferson Melo: 1.399,43 +
-- 300,57 no app, 1.499,43 + 200,57 no banco). O banco tira o adiantamento da
-- gratificacao: lancamento da gratificacao = gratificacao - adiantamento, e o
-- salario e o resto do liquido. Conferido nos 23 pagos em 30/09/2026: a
-- regra bate com o banco em todos.
-- =============================================================

create or replace function public.fn_aprovar_folha(p_folha uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_grat numeric(14, 2);
  v_parte text;
  v_valor_parte numeric(14, 2);
  v_status text; v_comp date;
  v_dia_sal smallint; v_dia_guia smallint;
  v_grupo_inss text; v_grupo_irrf text;
  v_venc_sal date; v_venc_guia date;
  -- Data escolhida na propria folha. Quando existe, manda no vencimento do
  -- salario e o dia parametrizado nao e consultado.
  v_venc_folha date;
  v_uid uuid := (select auth.uid());
  v_item record; v_guia record; v_lanc uuid; v_guia_id uuid;
  v_parcela uuid;
  -- Aprovar a folha aprova o pagamento dela, MAS so para quem pode aprovar
  -- pagamento. Sem isto, quem aprova folha e nao aprova pagamento ganharia por
  -- esta porta um aval que a tela de Aprovacao de pagamentos nega a ela.
  v_aprova_pgto boolean := public.tem_permissao('financeiro.aprovacao-pagamentos', 'aprovar');
  v_st_parcela text := case when v_aprova_pgto then 'aprovado' else 'pendente' end;
  -- Diarista: conferencia e marcacao das diarias que esta folha pagou.
  v_diar record; v_soma numeric;
begin
  if not public.tem_permissao('rh.folha', 'aprovar') then
    raise exception 'Sem permissao para aprovar a folha';
  end if;

  select status, competencia, data_vencimento
  into v_status, v_comp, v_venc_folha
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

  -- A data da folha manda; o dia parametrizado e o padrao de quando ninguem
  -- escolheu. Invertida, a ordem faria o campo da tela nao servir para nada.
  v_venc_sal  := coalesce(v_venc_folha, public.fn_vencimento_folha(v_comp, v_dia_sal));
  v_venc_guia := public.fn_vencimento_folha(v_comp, v_dia_guia);

  -- Pagamento aprovado exige data programada (CHECK
  -- lancamento_parcelas_programada_quando_aprovada). A data sai do dia de
  -- pagamento parametrizado; sem ele o vencimento e null e a aprovacao nao teria
  -- QUANDO acontecer. Recusa aqui, com texto que diz onde resolver, em vez de
  -- deixar o CHECK estourar erro de banco no meio da aprovacao.
  if v_aprova_pgto and v_venc_sal is null then
    raise exception 'Esta folha esta sem data de vencimento. Volte a folha para rascunho e preencha a data de vencimento, ou defina o dia de pagamento do salario em RH > Parametros da folha. O pagamento nasce aprovado, e aprovacao sem data programada nao existe.';
  end if;

  -- ===== 0. Diarista: as diarias ainda batem com a folha? =====
  -- Roda ANTES de criar lancamento nenhum: uma folha que nao corresponde mais
  -- as diarias tem de parar sem deixar meio pagamento atras de si.
  -- A folha foi gerada a partir das diarias em aberto da competencia. Entre a
  -- geracao e a aprovacao alguem pode ter lancado uma diaria nova, excluido
  -- uma, ou fechado o mes em /rh/diaristas. Nesses casos o salario_base do item
  -- deixou de ser a soma das diarias, e aprovar pagaria um valor que nao
  -- corresponde a nada — em silencio.
  -- Item editado a mao fica FORA da checagem: ali o valor e escolha declarada
  -- do Tiago, nao a soma das diarias.
  for v_diar in
    select fi.salario_base, fi.editado_manualmente, fi.colaborador_id, c.nome
    from public.folha_itens fi
    join public.colaboradores c on c.id = fi.colaborador_id
    where fi.folha_id = p_folha and c.vinculo = 'diarista'
      and not fi.editado_manualmente
    order by c.nome
  loop
    select coalesce(sum(d.valor), 0) into v_soma
    from public.rh_diarias d
    where d.colaborador_id = v_diar.colaborador_id
      and d.competencia = v_comp
      and d.lancamento_id is null
      and d.folha_id is null;

    if v_soma <> v_diar.salario_base then
      raise exception 'As diarias de % mudaram depois que a folha de %/% foi gerada: a folha esta com % e as diarias em aberto somam %. Regere a folha antes de aprovar.',
        v_diar.nome, to_char(v_comp, 'MM'), to_char(v_comp, 'YYYY'),
        v_diar.salario_base, v_soma;
    end if;
  end loop;

  -- ===== 1. Salario: ate dois lancamentos por colaborador =====
  -- Pedido do Tiago (05/10/2026): o banco paga o salario e a gratificacao em
  -- dois PIX. Um lancamento da gratificacao (ja sem o adiantamento) e outro
  -- do salario (o resto do liquido), quando ha gratificacao no mes. Os dois
  -- tem origem 'folha' e origem_id = item;
  -- folha_itens.lancamento_id aponta para o do salario.
  -- Item com liquido <= 0 nao gera lancamento: o adiantamento do mes pode ter
  -- consumido o salario inteiro, e lancamento de R$ 0 e sujeira na tela.
  for v_item in
    select fi.id, fi.centro_custo_id, fi.valor_liquido, fi.gratificacao,
           fi.adiantamentos, c.nome
    from public.folha_itens fi
    join public.colaboradores c on c.id = fi.colaborador_id
    where fi.folha_id = p_folha and fi.valor_liquido > 0
    order by c.nome
  loop
    -- O adiantamento sai da gratificacao, como o banco paga; o salario e o
    -- resto do liquido. Caso real: Jeferson Melo, gratificacao 300,57 -
    -- 100,00 de adiantamento = 200,57, e salario 1.700,00 - 200,57 = 1.499,43.
    v_grat := greatest(0, round(coalesce(v_item.gratificacao, 0) - coalesce(v_item.adiantamentos, 0), 2));
    if v_grat >= v_item.valor_liquido then v_grat := 0; end if;
  foreach v_parte in array case when v_grat > 0 then array['salario', 'gratificacao'] else array['salario'] end
  loop
    v_valor_parte := case when v_parte = 'gratificacao' then v_grat else v_item.valor_liquido - v_grat end;
    insert into public.lancamentos
      (tipo, origem, origem_id, centro_custo_id, descricao, valor, status,
       data_compra, mes_competencia, data_vencimento, created_by)
    values
      ('a_pagar', 'folha', v_item.id, v_item.centro_custo_id,
       case when v_parte = 'gratificacao' then 'Gratificacao ' else 'Salario ' end
         || v_item.nome || ' ' || to_char(v_comp, 'MM/YYYY'),
       v_valor_parte, 'a_pagar',
       (now() at time zone 'America/Rio_Branco')::date, v_comp, v_venc_sal, v_uid)
    returning id into v_lanc;

    -- Os quatro campos da aprovacao vao JUNTOS de proposito: sao exatamente os
    -- que a fn_aprovar_parcela grava. Um faltando deixa a parcela num estado que
    -- as telas de pagamento nao sabem ler.
    -- conta_bancaria_id fica de fora: nenhuma folha foi paga ainda, escolher o
    -- banco que paga a folha e decisao do Tiago, e a fn_pagar_parcela pede a
    -- conta na hora de pagar de qualquer jeito.
    insert into public.lancamento_parcelas
      (lancamento_id, numero_parcela, valor, data_vencimento, status, created_by,
       aprovado_por, aprovado_em, data_programada, data_programada_origem)
    values (v_lanc, 1, v_valor_parte, v_venc_sal, v_st_parcela, v_uid,
       case when v_aprova_pgto then v_uid end,
       case when v_aprova_pgto then now() end,
       case when v_aprova_pgto then v_venc_sal end,
       -- 'vencimento' e nao 'aprovacao': ninguem escolheu esta data numa tela,
       -- ela veio do dia parametrizado. Reprogramar depois precisa saber disso.
       case when v_aprova_pgto then 'vencimento' end)
    returning id into v_parcela;

    if v_aprova_pgto then
      insert into public.parcela_eventos (parcela_id, tipo, data_para, created_by)
      values (v_parcela, 'aprovou', v_venc_sal, v_uid);
    end if;

    if v_item.centro_custo_id is not null then
      insert into public.lancamento_rateios (lancamento_id, centro_custo_id, valor, created_by)
      values (v_lanc, v_item.centro_custo_id, v_valor_parte, v_uid);
    end if;

    if v_parte = 'salario' then
      update public.folha_itens set lancamento_id = v_lanc where id = v_item.id;
    end if;
  end loop;
  end loop;

  -- ===== 1b. Diarista: marca as diarias como pagas por ESTA folha =====
  -- Percorre TODOS os itens de diarista, nao so os que geraram lancamento. O
  -- item com liquido zero (adiantamento comeu o mes) nao tem lancamento, mas as
  -- diarias dele JA foram consumidas pela folha: sem a marca de folha_id o
  -- fechamento em /rh/diaristas as pagaria de novo, e o colaborador receberia o
  -- mes duas vezes.
  -- lancamento_id vem do item (null quando nao houve lancamento): quem define
  -- "ja paga" e o folha_id, e o lancamento_id fica so como rastro de qual conta
  -- a pagar carregou aquela diaria.
  for v_diar in
    select fi.colaborador_id, fi.lancamento_id
    from public.folha_itens fi
    join public.colaboradores c on c.id = fi.colaborador_id
    where fi.folha_id = p_folha and c.vinculo = 'diarista'
  loop
    update public.rh_diarias
       set folha_id = p_folha,
           lancamento_id = v_diar.lancamento_id
     where colaborador_id = v_diar.colaborador_id
       and competencia = v_comp
       and lancamento_id is null
       and folha_id is null;
  end loop;

  -- ===== 2. Guias: um lancamento por grupo de recolhimento =====
  -- A fonte junta as tres origens de valor da guia. O rateio e EXATO, nao
  -- proporcional: cada centavo ja nasce ligado a um item, e o item tem centro
  -- de custo. Logo sum(rateios) == valor do lancamento por construcao.
  -- Encargo individual entra em folha_item_encargos com grupo_recolhimento
  -- null, e o `where` da primeira perna o exclui: percentual proprio de uma
  -- pessoa e custo gerencial, nao guia que a empresa recolhe.
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

    -- Mesma guarda do salario, so que aqui dentro do laco: exigir o dia de
    -- vencimento das guias numa folha que nao gerou guia nenhuma seria cobrar
    -- parametro que aquela folha nao usa.
    if v_aprova_pgto and v_venc_guia is null then
      raise exception 'Defina o dia de vencimento das guias em RH > Parametros da folha: a guia % nasce com pagamento aprovado, e aprovacao sem data programada nao existe.', v_guia.grupo;
    end if;

    insert into public.lancamento_parcelas
      (lancamento_id, numero_parcela, valor, data_vencimento, status, created_by,
       aprovado_por, aprovado_em, data_programada, data_programada_origem)
    values (v_lanc, 1, v_guia.total, v_venc_guia, v_st_parcela, v_uid,
       case when v_aprova_pgto then v_uid end,
       case when v_aprova_pgto then now() end,
       case when v_aprova_pgto then v_venc_guia end,
       case when v_aprova_pgto then 'vencimento' end)
    returning id into v_parcela;

    if v_aprova_pgto then
      insert into public.parcela_eventos (parcela_id, tipo, data_para, created_by)
      values (v_parcela, 'aprovou', v_venc_guia, v_uid);
    end if;

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

