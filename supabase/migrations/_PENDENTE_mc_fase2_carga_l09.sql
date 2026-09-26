-- Medição de Contratos, Fase 2: carga do Lote 09 (L09-BR364, CT 00615/2025, DNIT).
-- Plano: docs/superpowers/plans/2026-09-26-medicao-contratos-fase2-carga-lote09.md (Task 3).
--
-- PENDENTE: este arquivo só é aplicado com o ok do Tiago. Até lá roda apenas em transação
-- abortada (ensaio). Quando for aplicado, ganha o nome da versão real (schema_migrations).
--
-- Sem dado aqui: lê legado.carga_mc_l09 (legado.fn_staging_mc_l09, enchido por
-- scripts/migracao-medicao/carregar_staging_lote09.py a partir da planilha oficial v12), grava
-- pelas tabelas do módulo e confere cada número contra o esperado que o extrator tirou da
-- planilha. Um bloco só, então é atômico: ou entra tudo e bate, ou nada.
--
-- Ordem, respeitando as travas vivas da Fase 1c (fn_mc_trava_*), com app.mc_carga = '1':
--   1. contrato (inserção direta: as RPCs exigem auth.uid), mc_reajuste_config sem reajuste
--      (a Fase 6 configura) e a lista de acesso (os Admins ativos, conferindo que são 4);
--   2. versão 0 em rascunho, mc_itens e mc_planilha_itens (pai pela pai_ordem), e a versão
--      vira vigente com vigente_desde = início da 1ª medição (01/11/2025);
--   3. para N de 1 a 10, na ordem (a trava exige numero = max + 1 e a N-1 aprovada): a medição
--      nasce aprovada com origem 'carga' (só a carga nasce com outro status), a REV00 nasce
--      aprovada, os ajustes tipo 'carga' (só quantidade diferente de zero) e as aprovações por
--      item com a mesma quantidade (aprovada = medida).
-- Conferência pelas views do módulo (mc_v_*): contagens; por linha, preço e quantidade prevista
-- (texto exato) e valor previsto (exato); por medição e item, a quantidade (texto exato); por
-- item, a quantidade acumulada; por grupo, previsto, acumulado até a 10ª e 10ª (2 casas); total
-- previsto, acumulado, 10ª e saldo = previsto - acumulado. Qualquer diferença aborta.
--
-- Ensaio: com app.carga_ensaio = 'sim' faz tudo, confere e desfaz no fim (raise).
-- Desfazer: supabase/rollbacks/mc_fase2_carga_l09_rollback.sql.

do $carga$
declare
  c_codigo constant text := 'L09-BR364';
  c_motivo constant text := 'Carga inicial da planilha oficial v12';
  c_arquivo constant text := 'Medicao_Teste_3_ATUALIZADA_v12_NOVO.xlsx';
  c_hash constant text := '2a29e7473cca3e057a700a91c58d8d992e89ea42e2c74a094d1f3e59121fcb0b';
  v_esp jsonb;
  v_ct jsonb;
  v_contrato uuid;
  v_versao uuid;
  v_medicao uuid;
  v_revisao uuid;
  v_inicio date;
  v_n bigint;
  v_n2 bigint;
  v_v numeric;
  v_prev numeric;
  v_acum numeric;
  v_dec numeric;
  v_txt text;
  v_erros text := '';
  v_rel jsonb := '{}'::jsonb;
  r record;
begin
  -- ---------------------------------------------------------------- staging
  select count(*) into v_n from legado.fn_staging_mc_l09('esperado');
  if v_n <> 1 then raise exception 'Staging incompleto: esperado tem % linhas (deveria ter 1)', v_n; end if;
  select x into v_esp from legado.fn_staging_mc_l09('esperado') x;
  select count(*) into v_n from legado.fn_staging_mc_l09('contrato');
  if v_n <> 1 then raise exception 'Staging incompleto: contrato tem % linhas (deveria ter 1)', v_n; end if;
  select x into v_ct from legado.fn_staging_mc_l09('contrato') x;

  select count(*), count(*) filter (where e ->> 'tipo' = 'titulo'), count(*) filter (where e ->> 'tipo' = 'servico')
    into v_n, v_n2, v_v from legado.fn_staging_mc_l09('linhas') e;
  if (v_n, v_n2, v_v) is distinct from ((v_esp ->> 'linhas')::bigint, (v_esp ->> 'titulos')::bigint, (v_esp ->> 'servicos')::numeric) then
    raise exception 'Staging incompleto: % linhas (% títulos, % serviços), esperado % (% e %)', v_n, v_n2, v_v,
      v_esp ->> 'linhas', v_esp ->> 'titulos', v_esp ->> 'servicos';
  end if;
  select count(distinct (e ->> 'ordem')::int), min((e ->> 'ordem')::int), max((e ->> 'ordem')::int)
    into v_n, v_n2, v_v from legado.fn_staging_mc_l09('linhas') e;
  if (v_n, v_n2, v_v) is distinct from ((v_esp ->> 'linhas')::bigint, 1::bigint, (v_esp ->> 'linhas')::numeric) then
    raise exception 'Staging com ordem das linhas fora de 1..%', v_esp ->> 'linhas';
  end if;
  select string_agg(e ->> 'ordem', ', ') into v_txt from legado.fn_staging_mc_l09('linhas') e
   where e ->> 'tipo' not in ('titulo', 'servico')
      or (e ->> 'pai_ordem' is not null and not exists (
            select 1 from legado.fn_staging_mc_l09('linhas') p
             where (p ->> 'ordem')::int = (e ->> 'pai_ordem')::int
               and (p ->> 'ordem')::int < (e ->> 'ordem')::int));
  if v_txt is not null then raise exception 'Staging com tipo ou pai inválido nas linhas de ordem %', v_txt; end if;

  select count(*), min((e ->> 'numero')::int), max((e ->> 'numero')::int), min((e ->> 'periodo_inicio')::date)
    into v_n, v_n2, v_v, v_inicio from legado.fn_staging_mc_l09('medicoes') e;
  if (v_n, v_n2, v_v) is distinct from ((v_esp ->> 'medicoes')::bigint, 1::bigint, (v_esp ->> 'medicoes')::numeric)
     or v_inicio is distinct from date '2025-11-01' then
    raise exception 'Staging de medições incompleto: % medições (% a %), início %', v_n, v_n2, v_v, v_inicio;
  end if;

  select count(*), count(distinct ((q ->> 'ordem')::int, (q ->> 'numero_medicao')::int)),
         count(*) filter (where (q ->> 'quantidade')::numeric <> 0)
    into v_n, v_n2, v_v from legado.fn_staging_mc_l09('quantidades') q;
  if v_n <> (v_esp ->> 'servicos')::bigint * (v_esp ->> 'medicoes')::bigint or v_n2 <> v_n
     or v_v <> (v_esp ->> 'ajustes')::numeric then
    raise exception 'Staging de quantidades incompleto: % pares (% distintos, % diferentes de zero), esperado % pares e % ajustes',
      v_n, v_n2, v_v, (v_esp ->> 'servicos')::bigint * (v_esp ->> 'medicoes')::bigint, v_esp ->> 'ajustes';
  end if;
  select count(*) into v_n from legado.fn_staging_mc_l09('quantidades') q
   where (q ->> 'quantidade')::numeric < 0
      or not exists (select 1 from legado.fn_staging_mc_l09('linhas') e
                      where (e ->> 'ordem')::int = (q ->> 'ordem')::int and e ->> 'tipo' = 'servico')
      or not exists (select 1 from legado.fn_staging_mc_l09('medicoes') m
                      where (m ->> 'numero')::int = (q ->> 'numero_medicao')::int);
  if v_n > 0 then raise exception 'Staging com % quantidades negativas, fora de serviço ou de medição inexistente', v_n; end if;

  if v_ct ->> 'codigo' is distinct from c_codigo then
    raise exception 'Staging do contrato é de %, não de %', v_ct ->> 'codigo', c_codigo;
  end if;
  if exists (select 1 from public.mc_contratos where codigo = c_codigo and excluido_em is null) then
    raise exception 'O contrato % já existe: a carga não roda de novo', c_codigo;
  end if;

  perform set_config('app.mc_carga', '1', true);

  -- ---------------------------------------------------------------- contrato
  insert into public.mc_contratos (codigo, nome_obra, local, objeto, numero_contrato, contratante_nome, contratante_tipo,
                                   valor_inicial, data_assinatura, prazo_meses, inicio_prazo, dia_inicio_periodo,
                                   tipo_localizacao, regra_arredondamento, status, observacoes, created_by)
  values (v_ct ->> 'codigo', v_ct ->> 'nome_obra', v_ct ->> 'local', v_ct ->> 'objeto', v_ct ->> 'numero_contrato',
          v_ct ->> 'contratante_nome', v_ct ->> 'contratante_tipo', (v_ct ->> 'valor_inicial')::numeric,
          (v_ct ->> 'data_assinatura')::date, (v_ct ->> 'prazo_meses')::int, v_ct ->> 'inicio_prazo',
          (v_ct ->> 'dia_inicio_periodo')::smallint, v_ct ->> 'tipo_localizacao', v_ct ->> 'regra_arredondamento',
          v_ct ->> 'status', v_ct ->> 'observacoes', null)
  returning id into v_contrato;

  insert into public.mc_reajuste_config (contrato_id, tem_reajuste) values (v_contrato, false);

  insert into public.mc_contrato_usuarios (contrato_id, usuario_id, created_by)
  select v_contrato, u.id, null
    from public.usuarios u join public.perfis p on p.id = u.perfil_id
   where p.nome = 'Admin' and u.ativo and u.excluido_em is null;
  get diagnostics v_n = row_count;
  if v_n <> 4 then raise exception 'A lista de acesso teria % Admins ativos, e a carga espera 4', v_n; end if;

  -- ---------------------------------------------------------------- planilha v0
  insert into public.mc_planilha_versoes (contrato_id, numero, vigente_desde, status, motivo, arquivo_nome, arquivo_hash, created_by)
  values (v_contrato, 0, v_inicio, 'rascunho', c_motivo, c_arquivo, c_hash, null)
  returning id into v_versao;

  create temp table _mc_l09_linhas on commit drop as
  select (e ->> 'ordem')::int as ordem, (e ->> 'pai_ordem')::int as pai_ordem, e ->> 'codigo' as codigo,
         e ->> 'descricao' as descricao, nullif(btrim(e ->> 'unidade'), '') as unidade, e ->> 'tipo' as tipo,
         (e ->> 'preco_unitario')::numeric as preco_unitario, (e ->> 'quantidade_prevista')::numeric as quantidade_prevista,
         (e ->> 'linha_origem')::int as linha_origem, gen_random_uuid() as item_id, gen_random_uuid() as linha_id
    from legado.fn_staging_mc_l09('linhas') e;

  insert into public.mc_itens (id, contrato_id) select item_id, v_contrato from _mc_l09_linhas order by ordem;

  insert into public.mc_planilha_itens (id, versao_id, contrato_id, item_id, ordem, codigo, pai_id, descricao, unidade, tipo,
                                        preco_unitario, quantidade_prevista, linha_origem)
  select l.linha_id, v_versao, v_contrato, l.item_id, l.ordem, l.codigo, p.linha_id, l.descricao, l.unidade, l.tipo,
         l.preco_unitario, l.quantidade_prevista, l.linha_origem
    from _mc_l09_linhas l left join _mc_l09_linhas p on p.ordem = l.pai_ordem
   order by l.ordem;

  update public.mc_planilha_versoes set status = 'vigente', aprovada_em = now() where id = v_versao;

  -- ---------------------------------------------------------------- medições 1..10
  for r in select (m ->> 'numero')::int as numero, (m ->> 'periodo_inicio')::date as ini, (m ->> 'periodo_fim')::date as fim
             from legado.fn_staging_mc_l09('medicoes') m order by 1 loop
    insert into public.mc_medicoes (contrato_id, numero, periodo_inicio, periodo_fim, status, versao_id, aprovada_em, origem, created_by)
    values (v_contrato, r.numero, r.ini, r.fim, 'aprovada', v_versao, now(), 'carga', null)
    returning id into v_medicao;

    insert into public.mc_medicao_revisoes (medicao_id, contrato_id, numero, fase, status, created_by)
    values (v_medicao, v_contrato, 0, 'antes_aprovacao', 'aprovada', null)
    returning id into v_revisao;

    insert into public.mc_ajustes (medicao_id, contrato_id, revisao_id, item_id, quantidade, motivo, tipo, created_by)
    select v_medicao, v_contrato, v_revisao, l.item_id, (q ->> 'quantidade')::numeric, c_motivo, 'carga', null
      from legado.fn_staging_mc_l09('quantidades') q join _mc_l09_linhas l on l.ordem = (q ->> 'ordem')::int
     where (q ->> 'numero_medicao')::int = r.numero and (q ->> 'quantidade')::numeric <> 0
     order by l.ordem;

    insert into public.mc_aprovacoes_item (revisao_id, item_id, contrato_id, quantidade_aprovada, created_by)
    select v_revisao, a.item_id, v_contrato, a.quantidade, null from public.mc_ajustes a where a.revisao_id = v_revisao;
  end loop;

  -- ================================================================ conferência
  -- Contagens
  for r in
    select 'linhas' k, (select count(*) from public.mc_planilha_itens where versao_id = v_versao) n, (v_esp ->> 'linhas')::bigint e
    union all select 'titulos', (select count(*) from public.mc_planilha_itens where versao_id = v_versao and tipo = 'titulo'), (v_esp ->> 'titulos')::bigint
    union all select 'servicos', (select count(*) from public.mc_planilha_itens where versao_id = v_versao and tipo = 'servico'), (v_esp ->> 'servicos')::bigint
    union all select 'itens', (select count(*) from public.mc_itens where contrato_id = v_contrato), (v_esp ->> 'linhas')::bigint
    union all select 'medicoes', (select count(*) from public.mc_medicoes where contrato_id = v_contrato and status = 'aprovada' and origem = 'carga'), (v_esp ->> 'medicoes')::bigint
    union all select 'revisoes', (select count(*) from public.mc_medicao_revisoes where contrato_id = v_contrato and numero = 0 and status = 'aprovada'), (v_esp ->> 'medicoes')::bigint
    union all select 'ajustes', (select count(*) from public.mc_ajustes where contrato_id = v_contrato and tipo = 'carga'), (v_esp ->> 'ajustes')::bigint
    union all select 'aprovacoes_item', (select count(*) from public.mc_aprovacoes_item where contrato_id = v_contrato), (v_esp ->> 'ajustes')::bigint
    union all select 'acessos', (select count(*) from public.mc_contrato_usuarios where contrato_id = v_contrato), 4::bigint
  loop
    v_rel := v_rel || jsonb_build_object(r.k, r.n);
    if r.n is distinct from r.e then v_erros := v_erros || r.k || ': ' || r.n || ' (esperado ' || r.e || '); '; end if;
  end loop;

  -- Medições: número, período, versão e revisão
  select string_agg(m ->> 'numero', ', ') into v_txt from legado.fn_staging_mc_l09('medicoes') m
   where not exists (select 1 from public.mc_medicoes x
                      where x.contrato_id = v_contrato and x.numero = (m ->> 'numero')::int and x.versao_id = v_versao
                        and x.periodo_inicio = (m ->> 'periodo_inicio')::date and x.periodo_fim = (m ->> 'periodo_fim')::date
                        and (select count(*) from public.mc_medicao_revisoes rv where rv.medicao_id = x.id) = 1);
  if v_txt is not null then v_erros := v_erros || 'medições com período, versão ou revisão diferente: ' || v_txt || '; '; end if;

  -- Por linha: estrutura, preço e quantidade prevista (texto exato), valor previsto (exato)
  select count(*), string_agg(l.ordem::text, ' ' order by l.ordem) into v_n, v_txt
    from _mc_l09_linhas l
    left join public.mc_v_planilha_linhas v on v.versao_id = v_versao and v.ordem = l.ordem
    left join public.mc_planilha_itens pai on pai.id = v.pai_id
   where v.id is null
      or (v.codigo, v.tipo, v.descricao, v.unidade, v.item_id, pai.ordem)
         is distinct from (l.codigo, l.tipo, l.descricao, l.unidade, l.item_id, l.pai_ordem)
      or (l.tipo = 'servico' and (
            v.preco_unitario::text is distinct from v_esp -> 'precos' ->> l.ordem::text
         or v.quantidade_prevista::text is distinct from v_esp -> 'qtds_previstas' ->> l.ordem::text
         or v.valor_previsto is distinct from (v_esp -> 'previstos' ->> l.ordem::text)::numeric))
      or (l.tipo = 'titulo' and (v.preco_unitario is not null or v.quantidade_prevista is not null));
  v_rel := v_rel || jsonb_build_object('linhas_diferentes', v_n);
  if v_n > 0 then v_erros := v_erros || v_n || ' linhas da planilha diferentes do esperado (ordem ' || left(v_txt, 200) || '); '; end if;

  -- Por medição e item: quantidade medida e aprovada (texto exato), sem item a mais
  select count(*), string_agg(k, ' ' order by k) into v_n, v_txt from (
    select coalesce(s.numero || ':' || s.ordem, i.numero || ':' || l.ordem) k
      from (select (q ->> 'numero_medicao')::int numero, (q ->> 'ordem')::int ordem, q ->> 'quantidade' qtd
              from legado.fn_staging_mc_l09('quantidades') q where (q ->> 'quantidade')::numeric <> 0) s
      join _mc_l09_linhas ls on ls.ordem = s.ordem
      full join (select vi.* from public.mc_v_medicao_itens vi where vi.contrato_id = v_contrato) i
        on i.numero = s.numero and i.item_id = ls.item_id
      left join _mc_l09_linhas l on l.item_id = i.item_id
     where s.numero is null or i.medicao_id is null
        or i.qtd_aprovada::text is distinct from s.qtd or i.qtd_medida::text is distinct from s.qtd
        or i.planilha_item_id is null) z;
  v_rel := v_rel || jsonb_build_object('qtds_medicao_diferentes', v_n);
  if v_n > 0 then v_erros := v_erros || v_n || ' quantidades por medição diferentes (medição:ordem ' || left(v_txt, 200) || '); '; end if;

  -- Por item: quantidade acumulada até a 10ª
  select count(*), string_agg(l.ordem::text, ' ' order by l.ordem) into v_n, v_txt
    from _mc_l09_linhas l
    left join public.mc_v_item_acumulado a on a.contrato_id = v_contrato and a.item_id = l.item_id
   where l.tipo = 'servico'
     and coalesce(a.qtd_acumulada, 0) is distinct from (v_esp -> 'qtds_acumuladas' ->> l.ordem::text)::numeric;
  v_rel := v_rel || jsonb_build_object('qtds_acumuladas_diferentes', v_n);
  if v_n > 0 then v_erros := v_erros || v_n || ' quantidades acumuladas diferentes (ordem ' || left(v_txt, 200) || '); '; end if;

  -- Por grupo: previsto (total da linha título), acumulado até a 10ª e 10ª
  for r in
    with raiz as (
      select p.id, p.codigo from public.mc_planilha_itens p where p.versao_id = v_versao and p.pai_id is null),
    g as (
      select rz.codigo,
             (select t.total_previsto from public.mc_v_planilha_totais t where t.id = rz.id and t.versao_id = v_versao) prev,
             round(coalesce((select sum(i.valor_medicao) from public.mc_v_planilha_subarvore s
                               join public.mc_v_medicao_itens i on i.planilha_item_id = s.linha_id
                              where s.ancestral_id = rz.id), 0), 2) acum,
             round(coalesce((select sum(i.valor_medicao) from public.mc_v_planilha_subarvore s
                               join public.mc_v_medicao_itens i on i.planilha_item_id = s.linha_id
                              where s.ancestral_id = rz.id and i.numero = 10), 0), 2) dec
        from raiz rz)
    select coalesce(g.codigo, e.key) codigo, g.prev, g.acum, g.dec,
           (e.value ->> 'previsto')::numeric e_prev, (e.value ->> 'acumulado')::numeric e_acum, (e.value ->> 'decima')::numeric e_dec
      from g full join jsonb_each(v_esp -> 'grupos') e on e.key = g.codigo
     order by 1
  loop
    v_rel := v_rel || jsonb_build_object('grupo ' || r.codigo, jsonb_build_array(r.prev, r.acum, r.dec));
    if (r.prev, r.acum, r.dec) is distinct from (r.e_prev, r.e_acum, r.e_dec) then
      v_erros := v_erros || 'grupo ' || r.codigo || ': ERP previsto ' || coalesce(r.prev::text, '-') || ', acumulado '
                 || coalesce(r.acum::text, '-') || ', 10ª ' || coalesce(r.dec::text, '-') || '; esperado ' || coalesce(r.e_prev::text, '-')
                 || ', ' || coalesce(r.e_acum::text, '-') || ', ' || coalesce(r.e_dec::text, '-') || '; ';
    end if;
  end loop;

  -- Total: previsto, acumulado até a 10ª, 10ª e saldo
  select total_previsto into v_prev from public.mc_v_versao_totais where versao_id = v_versao;
  select round(sum(valor_medicao), 2) into v_acum from public.mc_v_medicao_itens where contrato_id = v_contrato;
  select t.valor into v_dec from public.mc_v_medicao_totais t join public.mc_medicoes m on m.id = t.medicao_id
   where m.contrato_id = v_contrato and m.numero = 10;
  v_rel := v_rel || jsonb_build_object('previsto', v_prev, 'acumulado', v_acum, 'decima', v_dec, 'saldo', v_prev - v_acum);
  if v_prev is distinct from (v_esp -> 'total' ->> 'previsto')::numeric then
    v_erros := v_erros || 'total previsto ' || coalesce(v_prev::text, '-') || ' (esperado ' || (v_esp -> 'total' ->> 'previsto') || '); ';
  end if;
  if v_acum is distinct from (v_esp -> 'total' ->> 'acumulado')::numeric then
    v_erros := v_erros || 'total acumulado ' || coalesce(v_acum::text, '-') || ' (esperado ' || (v_esp -> 'total' ->> 'acumulado') || '); ';
  end if;
  if v_dec is distinct from (v_esp -> 'total' ->> 'decima')::numeric then
    v_erros := v_erros || 'total da 10ª ' || coalesce(v_dec::text, '-') || ' (esperado ' || (v_esp -> 'total' ->> 'decima') || '); ';
  end if;
  if v_prev - v_acum is distinct from (v_esp -> 'total' ->> 'saldo')::numeric then
    v_erros := v_erros || 'saldo ' || coalesce((v_prev - v_acum)::text, '-') || ' (esperado ' || (v_esp -> 'total' ->> 'saldo') || '); ';
  end if;

  -- Valor de cada medição (informativo: a planilha não traz o total por medição no esperado)
  select jsonb_object_agg(m.numero::text, t.valor order by m.numero) into v_ct
    from public.mc_medicoes m join public.mc_v_medicao_totais t on t.medicao_id = m.id where m.contrato_id = v_contrato;
  v_rel := v_rel || jsonb_build_object('valor_por_medicao', v_ct);

  perform set_config('app.mc_carga', '', true);

  if v_erros <> '' then
    raise exception 'Carga não bate com a origem: % || RELATORIO %', v_erros, v_rel;
  end if;
  if current_setting('app.carga_ensaio', true) = 'sim' then
    raise exception 'ENSAIO OK, nada gravado: %', v_rel;
  end if;
  raise notice 'Carga conferida: %', v_rel;
end $carga$;
