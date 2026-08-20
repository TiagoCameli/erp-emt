-- Diarista passa a ser pago pela folha, e a mesma diaria nao pode ser paga
-- duas vezes.
--
-- Antes desta migration havia um pagador so: o fechamento em /rh/diaristas
-- (fn_fechar_diarias), que soma as diarias em aberto da competencia e cria um
-- lancamento a pagar. Agora o diarista tambem entra na folha, e a aprovacao da
-- folha cria um lancamento "Salario X" por item. Sem coordenacao, as diarias de
-- um mes sairiam pagas nos dois lugares.
--
-- A coordenacao tem tres partes:
--
--   1. fn_aprovar_folha, ao aprovar, MARCA as diarias daquele diarista naquela
--      competencia com folha_id (e com o lancamento, quando houver). Antes de
--      marcar, confere que o conjunto de diarias nao mudou desde a geracao — a
--      linha de controle desta frente.
--   2. fn_desaprovar_folha SOLTA essas diarias, antes de apagar o lancamento
--      (a FK rh_diarias.lancamento_id e simples, sem on delete set null).
--   3. fn_fechar_diarias passa a tratar folha_id preenchido como "ja paga", nas
--      duas pontas: no que ele soma e no que ele marca.
--
-- Nada disso muda o comportamento de quem nao tem diarista: com zero diaristas
-- na folha, os tres loops adicionados nao iteram nenhuma vez.

/* ------------------------------------------------------------------ */
/* 1. Aprovar: a folha assume as diarias que pagou                    */
/* ------------------------------------------------------------------ */

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
  -- Diarista: conferencia e marcacao das diarias que esta folha pagou.
  v_diar record; v_soma numeric;
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

/* ------------------------------------------------------------------ */
/* 2. Desaprovar: solta as diarias antes de apagar o lancamento       */
/* ------------------------------------------------------------------ */

create or replace function public.fn_desaprovar_folha(p_folha uuid, p_motivo text)
returns void
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_status text; v_comp date; v_travado text; v_qtd int;
  -- Teto de nomes na mensagem de erro. O resto vira "e outros N".
  v_limite constant int := 3;
begin
  if not public.tem_permissao('rh.folha', 'desaprovar') then
    raise exception 'Sem permissao para desaprovar a folha';
  end if;

  if p_motivo is null or length(btrim(p_motivo)) = 0 then
    raise exception 'Informe o motivo da desaprovacao';
  end if;

  select status, competencia into v_status, v_comp
  from public.folhas where id = p_folha for update;

  if v_status is null then raise exception 'Folha nao encontrada'; end if;
  if v_status <> 'aprovado' then
    raise exception 'A folha de %/% esta em "%": só da para desaprovar folha aprovada.',
      to_char(v_comp, 'MM'), to_char(v_comp, 'YYYY'), v_status;
  end if;

  -- Trava as parcelas da folha ANTES de olhar o status delas. Sem este lock a
  -- consulta abaixo e um SELECT em read committed: leria a versao anterior de
  -- uma parcela sendo aprovada em outra sessao, passaria, e a cascade do delete
  -- requalificaria a linha so pelo match da FK, apagando parcela aprovada.
  -- `for update` nao convive com agregado, por isso o lock vem sozinho num
  -- perform e a consulta seguinte rele linhas ja travadas.
  perform 1
  from public.lancamento_parcelas pa
  join public.lancamentos l on l.id = pa.lancamento_id
  where (l.origem = 'folha'      and l.origem_id in (select id from public.folha_itens where folha_id = p_folha))
     or (l.origem = 'folha_guia' and l.origem_id in (select id from public.folha_guias where folha_id = p_folha))
  for update of pa;

  -- Trava: nada de apagar lancamento comprometido. Parcela aprovada ja esta na
  -- fila de pagamento e parcela conciliada ja casou com o extrato do banco.
  -- Mesmas travas da fn_excluir_lancamento. A mensagem nomeia o que travou.
  -- Uma parcela comprometida entre varias barra a desaprovacao inteira: o
  -- delete e por folha, nao por lancamento, entao nao existe meio caminho.
  -- v_qtd conta TODOS os comprometidos; v_travado lista so os v_limite
  -- primeiros, porque a mensagem vai para um toast.
  with comprometidos as (
    select distinct l.descricao as descricao
    from public.lancamentos l
    join public.lancamento_parcelas pa on pa.lancamento_id = l.id
    left join public.extrato_transacoes et on et.parcela_id = pa.id
    where (
        (l.origem = 'folha'      and l.origem_id in (select id from public.folha_itens where folha_id = p_folha))
     or (l.origem = 'folha_guia' and l.origem_id in (select id from public.folha_guias where folha_id = p_folha))
    )
    and (pa.status in ('aprovado', 'pago') or et.id is not null)
  )
  select (select count(*) from comprometidos),
         (select string_agg(descricao, '; ' order by descricao)
          from (select descricao from comprometidos order by descricao limit v_limite) primeiros)
  into v_qtd, v_travado;

  -- Gate no contador, nao no texto: se um dia descricao vier nula, o
  -- string_agg devolveria null e uma trava presa ao texto deixaria passar.
  if v_qtd > 0 then
    if v_qtd > v_limite then
      v_travado := coalesce(v_travado, '?') || format(' e outros %s', v_qtd - v_limite);
    end if;
    raise exception 'Nao da para desaprovar a folha de %/%: ja existe pagamento aprovado, pago ou conciliado em: %. Desaprove ou estorne o pagamento primeiro.',
      to_char(v_comp, 'MM'), to_char(v_comp, 'YYYY'),
      coalesce(v_travado, v_qtd || ' lancamento(s) sem descricao');
  end if;

  -- Solta as diarias que esta folha assumiu. Tem de vir ANTES do delete: a FK
  -- rh_diarias.lancamento_id e simples, sem on delete set null, e apagar o
  -- lancamento com a diaria ainda apontando para ele viola a FK — a
  -- desaprovacao estouraria no meio. Zerar as duas colunas devolve a diaria ao
  -- estado "em aberto", pagavel outra vez pela folha regerada ou pelo
  -- fechamento em /rh/diaristas.
  update public.rh_diarias
     set folha_id = null, lancamento_id = null
   where folha_id = p_folha;

  -- Apaga de verdade (escolha do Tiago). Parcelas e rateios caem por
  -- ON DELETE CASCADE. Solta o vinculo nas DUAS tabelas antes: as duas FKs
  -- (folha_itens.lancamento_id e folha_guias.lancamento_id) sao simples, sem
  -- on delete set null, entao apagar o lancamento com qualquer uma das duas
  -- ainda apontando para ele viola a FK.
  update public.folha_itens set lancamento_id = null where folha_id = p_folha;
  update public.folha_guias set lancamento_id = null where folha_id = p_folha;

  delete from public.lancamentos
  where origem = 'folha_guia'
    and origem_id in (select id from public.folha_guias where folha_id = p_folha);

  delete from public.lancamentos
  where origem = 'folha'
    and origem_id in (select id from public.folha_itens where folha_id = p_folha);

  -- Passo 3, obrigatorio: folha_guias tem unique (folha_id, grupo). Linha
  -- sobrando aqui faz a proxima aprovacao da mesma folha estourar no unique.
  delete from public.folha_guias where folha_id = p_folha;

  update public.folhas
  set status = 'rascunho', aprovado_por = null, aprovado_em = null,
      motivo_rejeicao = btrim(p_motivo)
  where id = p_folha;
end;
$function$;

/* ------------------------------------------------------------------ */
/* 3. Fechar diarias: folha_id preenchido tambem e "ja paga"          */
/* ------------------------------------------------------------------ */

create or replace function public.fn_fechar_diarias(
  p_colaborador uuid,
  p_competencia date,
  p_data_vencimento date default null::date
)
returns uuid
language plpgsql
security definer
set search_path to ''
as $function$
declare v_total numeric; v_nome text; v_cc uuid; v_lanc uuid; v_comp date;
begin
  if not public.tem_permissao('rh.diaristas', 'criar') then raise exception 'Sem permissao para fechar diarias'; end if;
  v_comp := date_trunc('month', p_competencia)::date;

  perform public.fn_exigir_competencia_aberta(v_comp, 'lancamento', null);

  -- "Em aberto" agora tem DUAS condicoes: sem lancamento e sem folha. A folha
  -- aprovada marca folha_id nas diarias que pagou (inclusive quando o item saiu
  -- com liquido zero e nao gerou lancamento nenhum), e sem esta segunda
  -- condicao o fechamento pagaria de novo o mes que a folha ja pagou.
  perform 1 from public.rh_diarias
  where colaborador_id = p_colaborador and competencia = v_comp
    and lancamento_id is null and folha_id is null for update;

  select coalesce(sum(valor), 0) into v_total from public.rh_diarias
  where colaborador_id = p_colaborador and competencia = v_comp
    and lancamento_id is null and folha_id is null;
  if v_total <= 0 then raise exception 'Nao ha diarias em aberto nessa competencia'; end if;

  select nome, centro_custo_id into v_nome, v_cc from public.colaboradores where id = p_colaborador;

  insert into public.lancamentos (tipo, origem, origem_id, centro_custo_id, descricao, valor, status, data_compra, mes_competencia, data_vencimento, created_by)
  values ('a_pagar', 'diaria', p_colaborador, v_cc, 'Diarias ' || coalesce(v_nome, '') || ' ' || to_char(v_comp, 'MM/YYYY'), v_total, 'a_pagar',
          (now() at time zone 'America/Rio_Branco')::date, v_comp, p_data_vencimento, (select auth.uid()))
  returning id into v_lanc;
  insert into public.lancamento_parcelas (lancamento_id, numero_parcela, valor, data_vencimento, status, created_by)
  values (v_lanc, 1, v_total, p_data_vencimento, 'pendente', (select auth.uid()));
  if v_cc is not null then
    insert into public.lancamento_rateios (lancamento_id, centro_custo_id, valor, created_by)
    values (v_lanc, v_cc, v_total, (select auth.uid()));
  end if;

  update public.rh_diarias set lancamento_id = v_lanc
  where colaborador_id = p_colaborador and competencia = v_comp
    and lancamento_id is null and folha_id is null;
  return v_lanc;
end;
$function$;

comment on function public.fn_fechar_diarias(uuid, date, date) is
  'Fecha as diarias EM ABERTO de um diarista numa competencia num unico lancamento a pagar. "Em aberto" = lancamento_id is null AND folha_id is null: diaria ja assumida por uma folha aprovada nao entra, senao o mes seria pago duas vezes (uma pela folha, outra aqui).';
