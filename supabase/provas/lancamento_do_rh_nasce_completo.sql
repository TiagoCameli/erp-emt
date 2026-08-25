-- Prova de aceite: lançamento criado pelo RH nasce completo.
--
-- ESCREVE no banco, e por isso o bloco termina em `raise`: tudo é desfeito. As
-- medições sobrevivem porque viajam no TEXTO da exceção, não em tabela -- tabela
-- temporária seria desfeita junto.
--
-- Numeração não é queimada: `proximo_numero_documento` é UPDATE em
-- `documento_sequencias`, não `nextval`, então o rollback devolve o número.
--
-- Impersona o usuário porque as funções do RH chamam `tem_permissao`, que lê
-- `auth.uid()`. Sem isso a prova morreria na primeira linha, e não é a permissão
-- que está sendo provada aqui.
--
-- Cobre:
--   1. diária pela função: nasce com colaborador, categoria, forma e vencimento
--   2. CONTROLE: sem forma, a função RECUSA
--   3. CONTROLE: sem vencimento, a função RECUSA
--   4. folha: o trigger acha o colaborador pelo ITEM da folha (origem_id != pessoa)
--   5. CONTROLE: a categoria muda para "Pessoal Administrativo" no escritório
--   6. CONTROLE: `folha_guia` NÃO é tocado pelo trigger
--   7. CONTROLE: categoria inexistente RECUSA em vez de gravar nulo

do $prova$
declare
  v_log text := E'\n';
  v_diarista uuid;
  v_escritorio uuid;
  v_forma uuid;
  v_comp date := date_trunc('month', (now() at time zone 'America/Rio_Branco')::date)::date;
  v_lanc uuid;
  v_item uuid;
  v_item_escr uuid;
  v_colab text; v_cat text; v_fp text; v_venc date;
  v_erro text;
  v_ok boolean;
begin
  perform set_config('request.jwt.claims',
    json_build_object('sub', 'c66fca9f-5428-4fb9-855f-dcff548764df',
                      'role', 'authenticated')::text, true);

  select c.id into v_diarista from public.colaboradores c
  where c.vinculo = 'diarista' and c.ativo limit 1;
  select f.id into v_forma from public.formas_pagamento f where f.nome = 'PIX' and f.ativo;

  -- ===== 1. A diária pela função =====
  insert into public.rh_diarias (colaborador_id, competencia, valor)
  values (v_diarista, v_comp, 111.11);

  v_lanc := public.fn_fechar_diarias(v_diarista, v_comp, v_comp + 20, v_forma);

  select col.nome, cat.nome, fp.nome, l.data_vencimento
    into v_colab, v_cat, v_fp, v_venc
  from public.lancamentos l
  left join public.colaboradores col on col.id = l.colaborador_id
  left join public.categorias_financeiras cat on cat.id = l.categoria_id
  left join public.formas_pagamento fp on fp.id = l.forma_pagamento_id
  where l.id = v_lanc;

  v_ok := v_colab is not null and v_cat = 'Diárias Mão de Obra'
          and v_fp = 'PIX' and v_venc is not null;
  v_log := v_log || format('1. diaria completa ....... %s | colab=%s cat=%s forma=%s venc=%s',
    case when v_ok then 'PASSOU' else 'FALHOU' end, v_colab, v_cat, v_fp, v_venc) || E'\n';

  -- ===== 2. CONTROLE: sem forma, recusa =====
  begin
    insert into public.rh_diarias (colaborador_id, competencia, valor)
    values (v_diarista, v_comp, 22.22);
    perform public.fn_fechar_diarias(v_diarista, v_comp, v_comp + 20, null);
    v_log := v_log || '2. CONTROLE sem forma .... FALHOU | aceitou sem forma' || E'\n';
  exception when others then
    v_erro := sqlerrm;
    v_log := v_log || format('2. CONTROLE sem forma .... %s | %s',
      case when v_erro like '%forma de pagamento%' then 'PASSOU' else 'FALHOU' end, v_erro) || E'\n';
  end;

  -- ===== 3. CONTROLE: sem vencimento, recusa =====
  begin
    perform public.fn_fechar_diarias(v_diarista, v_comp, null, v_forma);
    v_log := v_log || '3. CONTROLE sem venc ..... FALHOU | aceitou sem vencimento' || E'\n';
  exception when others then
    v_erro := sqlerrm;
    v_log := v_log || format('3. CONTROLE sem venc ..... %s | %s',
      case when v_erro like '%vencimento%' then 'PASSOU' else 'FALHOU' end, v_erro) || E'\n';
  end;

  -- ===== 4. Folha: o trigger acha a pessoa pelo ITEM =====
  -- Aqui o `origem_id` NÃO é a pessoa, é o item da folha. É o caso que um trigger
  -- ingênuo erraria, pendurando o lançamento na pessoa errada.
  select fi.id into v_item
  from public.folha_itens fi
  join public.colaboradores c on c.id = fi.colaborador_id
  join public.centros_custo cc on cc.id = c.centro_custo_id
  where coalesce((select r.tipo from public.centros_custo r where r.id = cc.pai_id), cc.tipo) <> 'escritorio'
  limit 1;

  insert into public.lancamentos
    (tipo, origem, origem_id, descricao, valor, status, data_compra, mes_competencia, data_vencimento)
  values ('a_pagar', 'folha', v_item, 'PROVA folha', 1.00, 'a_pagar', v_comp, v_comp, v_comp + 5)
  returning id into v_lanc;

  select col.nome, cat.nome into v_colab, v_cat
  from public.lancamentos l
  left join public.colaboradores col on col.id = l.colaborador_id
  left join public.categorias_financeiras cat on cat.id = l.categoria_id
  where l.id = v_lanc;

  v_ok := v_colab is not null and v_cat = 'Salário Mão de Obra';
  v_log := v_log || format('4. folha pelo item ....... %s | colab=%s cat=%s',
    case when v_ok then 'PASSOU' else 'FALHOU' end, v_colab, v_cat) || E'\n';

  -- ===== 5. CONTROLE: escritório muda a categoria =====
  -- Sem este caso, a derivação poderia estar devolvendo "Mão de Obra" fixo e os
  -- casos 1 e 4 passariam do mesmo jeito.
  select fi.id into v_item_escr
  from public.folha_itens fi
  join public.colaboradores c on c.id = fi.colaborador_id
  join public.centros_custo cc on cc.id = c.centro_custo_id
  where coalesce((select r.tipo from public.centros_custo r where r.id = cc.pai_id), cc.tipo) = 'escritorio'
  limit 1;

  if v_item_escr is null then
    v_log := v_log || '5. CONTROLE escritorio ... SEM DADO | nenhum item de folha do escritorio' || E'\n';
  else
    insert into public.lancamentos
      (tipo, origem, origem_id, descricao, valor, status, data_compra, mes_competencia, data_vencimento)
    values ('a_pagar', 'folha', v_item_escr, 'PROVA folha escritorio', 1.00, 'a_pagar', v_comp, v_comp, v_comp + 5)
    returning id into v_lanc;

    select cat.nome into v_cat
    from public.lancamentos l
    left join public.categorias_financeiras cat on cat.id = l.categoria_id
    where l.id = v_lanc;

    v_log := v_log || format('5. CONTROLE escritorio ... %s | cat=%s',
      case when v_cat = 'Salário Pessoal Administrativo' then 'PASSOU' else 'FALHOU' end, v_cat) || E'\n';
  end if;

  -- ===== 6. CONTROLE: folha_guia fica intacto =====
  -- A guia é a empresa pagando o governo: não tem pessoa. Se o trigger a
  -- pegasse, tentaria achar um colaborador que não existe.
  insert into public.lancamentos
    (tipo, origem, origem_id, descricao, valor, status, data_compra, mes_competencia, data_vencimento)
  values ('a_pagar', 'folha_guia', gen_random_uuid(), 'PROVA guia', 1.00, 'a_pagar', v_comp, v_comp, v_comp + 5)
  returning id into v_lanc;

  select l.colaborador_id is null and l.categoria_id is null into v_ok
  from public.lancamentos l where l.id = v_lanc;
  v_log := v_log || format('6. CONTROLE folha_guia ... %s | intacto=%s',
    case when v_ok then 'PASSOU' else 'FALHOU' end, v_ok) || E'\n';

  -- ===== 7. CONTROLE: categoria que não existe RECUSA =====
  begin
    perform public.fn_categoria_do_rh(v_diarista, 'evento_que_nao_existe');
    v_log := v_log || '7. CONTROLE evento novo .. FALHOU | devolveu algo' || E'\n';
  exception when others then
    v_erro := sqlerrm;
    v_log := v_log || format('7. CONTROLE evento novo .. %s | %s',
      case when v_erro like '%sem categoria mapeada%' then 'PASSOU' else 'FALHOU' end, v_erro) || E'\n';
  end;

  raise exception 'PROVA (tudo desfeito):%', v_log;
end $prova$;

-- Resultado em 25/08/2026, os sete casos PASSOU:
--   1. diaria completa: colab=MARIA EVANILDE..., cat=Diárias Mão de Obra,
--      forma=PIX, venc preenchido
--   2. recusou sem forma  ("Escolha a forma de pagamento das diarias")
--   3. recusou sem vencimento ("Informe o vencimento do pagamento das diarias")
--   4. folha pelo item: achou o colaborador pelo folha_item, cat=Salário Mão de Obra
--   5. CONTROLE: item do escritório deu cat=Salário Pessoal Administrativo
--   6. CONTROLE: folha_guia ficou com colaborador e categoria NULOS
--   7. CONTROLE: evento sem mapa recusou em vez de devolver nulo
