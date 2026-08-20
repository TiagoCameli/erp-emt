-- Prova de aceite: as observacoes da OC descem para o lancamento e chegam ate
-- a parcela que Pagamentos exibe.
--
-- Roda em UM bloco DO que termina em `raise exception`. O relatorio sai na
-- mensagem do erro, e o erro desfaz tudo -- nada fica no banco, nem quando a
-- prova roda por um cliente que gerencia a transacao por conta propria (MCP,
-- SQL editor). `begin; ... rollback;` sozinho depende do cliente respeitar o
-- bloco; o raise nao depende de ninguem.
--
-- O caso 2 e a LINHA DE CONTROLE: uma OC sem observacao TEM que sair null.
-- Sem ela, um bug que escrevesse texto fixo em toda aprovacao passaria a prova
-- inteira, porque todos os outros casos so olham "veio texto?".
--
-- Rodada em 20/08/2026 contra o banco de producao, 6 casos, 6 PASSOU:
--
--   1. OC com observacao -> lancamento herda o texto identico, com as quebras
--      de linha preservadas (a observacao real tem CNPJ e chave PIX em linhas
--      separadas; virar uma linha so a torna ilegivel)
--   2. CONTROLE: OC sem observacao -> lancamento sai null, nao string vazia
--   3. OC com so espacos e quebras -> lancamento sai null (normalizacao)
--   4. O texto chega na parcela pelo mesmo caminho do espelho do pagamento
--      (parcela -> lancamento pai), que e o que quem paga le
--   5. Backfill preenche lancamento de OC que ficou sem observacao
--   6. Backfill NAO sobrescreve lancamento que ja tem texto proprio
--
-- Na primeira rodada o caso 3 FALHOU, e valeu a prova inteira: a normalizacao
-- usava `btrim(x)` sem argumento, que corta SO espaco. E'   \n  \t ' sobrevivia
-- como E'\n  \t', passava pelo nullif e chegava na tela como observacao -- e a
-- tela testa `observacoes ? ...`, entao string de branco e truthy e a secao
-- "Observacoes" apareceria vazia. Corrigido para btrim(x, E' \t\r\n').
--
-- IMPORTANTE: fn_criar_ordem_compra e fn_aprovar_ordem_compra checam
-- tem_permissao(), que depende de auth.uid(). Fora de sessao autenticada, o
-- bloco assume um usuario ativo com a permissao de cada passo.
--
-- Os dados de apoio (fornecedor, condicao, insumo, centro de custo) vem de uma
-- OC real do banco, para nao inventar combinacao que o banco recusaria por
-- outro motivo e confundir o resultado da prova. O insumo precisa ter
-- categoria_financeira_id, senao a aprovacao recusa antes de chegar no que
-- esta sendo provado.

do $prova$
declare
  v_criador uuid; v_aprovador uuid;
  v_forn uuid; v_cond uuid; v_insumo uuid; v_centro uuid; v_cat uuid;
  v_oc_com uuid; v_oc_sem uuid; v_oc_espaco uuid;
  v_lanc uuid; v_obs text; v_obs_parcela text;
  v_itens jsonb; v_cab jsonb; v_hoje date;
  -- Texto multilinha, igual ao que Compras escreve de verdade.
  v_texto constant text := E'PAGAMENTO PARA DIA 19/08/2026\nChave PIX CNPJ: 11137434000154\nFalar com o encarregado';
  -- Relatorio acumulado, uma linha por caso. Sai na mensagem do raise final.
  v_rel text := '';
begin
  v_hoje := (now() at time zone 'America/Rio_Branco')::date;

  select u.id into v_criador
  from public.usuarios u
  join public.usuario_permissoes up on up.usuario_id = u.id
  where u.ativo and up.recurso = 'compras.ordens' and up.acao = 'criar'
  limit 1;
  if v_criador is null then
    raise exception 'PROVA ABORTADA: nenhum usuario ativo com compras.ordens:criar';
  end if;

  select u.id into v_aprovador
  from public.usuarios u
  join public.usuario_permissoes up on up.usuario_id = u.id
  where u.ativo and up.recurso = 'compras.ordens' and up.acao = 'aprovar'
  limit 1;
  if v_aprovador is null then
    raise exception 'PROVA ABORTADA: nenhum usuario ativo com compras.ordens:aprovar';
  end if;

  perform set_config('request.jwt.claims', json_build_object('sub', v_criador)::text, true);

  select o.fornecedor_id, o.condicao_pagamento_id into v_forn, v_cond
  from public.ordens_compra o
  where o.condicao_pagamento_id is not null
  order by o.created_at desc
  limit 1;

  -- Insumo COM categoria de custo: sem ela fn_aprovar_ordem_compra recusa a OC
  -- inteira antes de copiar o que estamos provando.
  select oi.insumo_id, oi.centro_custo_id into v_insumo, v_centro
  from public.oc_itens oi
  join public.insumos i on i.id = oi.insumo_id
  where i.categoria_financeira_id is not null
  limit 1;
  if v_insumo is null then
    raise exception 'PROVA ABORTADA: nenhum insumo com categoria de custo';
  end if;

  select id into v_cat from public.categorias_financeiras
  where ativo and tipo = 'despesa' order by nome limit 1;

  v_itens := jsonb_build_array(jsonb_build_object(
    'insumo_id', v_insumo,
    'quantidade', 1,
    'preco_unitario', 1000.00,
    'centro_custo_id', v_centro
  ));

  v_cab := jsonb_build_object(
    'fornecedor_id', v_forn,
    'condicao_pagamento_id', v_cond,
    'data_compra', v_hoje,
    'mes_competencia', v_hoje,
    'descricao', '[PROVA-OBS] Servico prestado',
    'categoria_id', v_cat
  );

  v_oc_com := public.fn_criar_ordem_compra(
    v_cab || jsonb_build_object('observacoes', v_texto), v_itens);
  v_oc_sem := public.fn_criar_ordem_compra(v_cab, v_itens);
  v_oc_espaco := public.fn_criar_ordem_compra(
    v_cab || jsonb_build_object('observacoes', E'   \n  \t '), v_itens);

  -- Uma parcela na OC com observacao: e ela que vira lancamento_parcelas e
  -- aparece na fila de Pagamentos (caso 4).
  perform public.fn_salvar_parcelas_oc(v_oc_com, jsonb_build_array(
    jsonb_build_object('data_vencimento', v_hoje + 30, 'valor', 1000.00)));

  perform set_config('request.jwt.claims', json_build_object('sub', v_aprovador)::text, true);

  -- 1 e 4. OC com observacao.
  update public.ordens_compra set status = 'pendente_aprovacao' where id = v_oc_com;
  perform public.fn_aprovar_ordem_compra(v_oc_com);

  select id, observacoes into v_lanc, v_obs
  from public.lancamentos where origem = 'oc' and origem_id = v_oc_com;

  v_rel := v_rel || format(E'\n1. lancamento herda a observacao da OC (multilinha, identica): %s | obtido=%s',
    case when v_obs = v_texto then 'PASSOU' else 'FALHOU' end,
    replace(coalesce(v_obs, '(null)'), E'\n', '\\n'));

  -- Caminho que o espelho do pagamento e o drawer da parcela leem: da parcela
  -- para o lancamento pai. E o unico caminho que quem paga tem.
  select l.observacoes into v_obs_parcela
  from public.lancamento_parcelas p
  join public.lancamentos l on l.id = p.lancamento_id
  where p.lancamento_id = v_lanc
  limit 1;

  v_rel := v_rel || format(E'\n4. a observacao chega na parcela (caminho de Pagamentos): %s | obtido=%s',
    case when v_obs_parcela = v_texto then 'PASSOU' else 'FALHOU' end,
    replace(coalesce(v_obs_parcela, '(null)'), E'\n', '\\n'));

  -- 2. LINHA DE CONTROLE. OC sem observacao TEM que sair null. Se este caso
  -- passar a devolver texto, a copia esta escrevendo o que nao existe.
  update public.ordens_compra set status = 'pendente_aprovacao' where id = v_oc_sem;
  perform public.fn_aprovar_ordem_compra(v_oc_sem);
  select observacoes into v_obs
  from public.lancamentos where origem = 'oc' and origem_id = v_oc_sem;

  v_rel := v_rel || format(E'\n2. CONTROLE: OC sem observacao -> lancamento null: %s | obtido=%s',
    case when v_obs is null then 'PASSOU' else 'FALHOU' end,
    coalesce('"' || v_obs || '"', 'null'));

  -- 3. So espacos e quebras: null, nao string em branco. String em branco faria
  -- a tela desenhar a secao "Observacoes" vazia.
  update public.ordens_compra set status = 'pendente_aprovacao' where id = v_oc_espaco;
  perform public.fn_aprovar_ordem_compra(v_oc_espaco);
  select observacoes into v_obs
  from public.lancamentos where origem = 'oc' and origem_id = v_oc_espaco;

  v_rel := v_rel || format(E'\n3. OC com so espacos -> lancamento null: %s | obtido=%s',
    case when v_obs is null then 'PASSOU' else 'FALHOU' end,
    coalesce('"' || v_obs || '"', 'null'));

  -- 5. Backfill: zera a observacao do lancamento (simulando o que a aprovacao
  -- antiga deixava) e roda o MESMO update da migration.
  update public.lancamentos set observacoes = null where id = v_lanc;

  update public.lancamentos l
  set observacoes = nullif(btrim(oc.observacoes, E' \t\r\n'), '')
  from public.ordens_compra oc
  where l.origem = 'oc'
    and l.origem_id = oc.id
    and btrim(coalesce(l.observacoes, ''), E' \t\r\n') = ''
    and btrim(coalesce(oc.observacoes, ''), E' \t\r\n') <> '';

  select observacoes into v_obs from public.lancamentos where id = v_lanc;

  v_rel := v_rel || format(E'\n5. backfill preenche lancamento que ficou sem observacao: %s | obtido=%s',
    case when v_obs = v_texto then 'PASSOU' else 'FALHOU' end,
    replace(coalesce(v_obs, '(null)'), E'\n', '\\n'));

  -- 6. Backfill nao sobrescreve texto proprio. Marca o lancamento com um texto
  -- diferente do da OC e roda o update de novo: nao pode encostar nele.
  update public.lancamentos set observacoes = 'TEXTO PROPRIO DO FINANCEIRO'
  where id = v_lanc;

  update public.lancamentos l
  set observacoes = nullif(btrim(oc.observacoes, E' \t\r\n'), '')
  from public.ordens_compra oc
  where l.origem = 'oc'
    and l.origem_id = oc.id
    and btrim(coalesce(l.observacoes, ''), E' \t\r\n') = ''
    and btrim(coalesce(oc.observacoes, ''), E' \t\r\n') <> '';

  select observacoes into v_obs from public.lancamentos where id = v_lanc;

  v_rel := v_rel || format(E'\n6. backfill nao sobrescreve texto proprio: %s | obtido=%s',
    case when v_obs = 'TEXTO PROPRIO DO FINANCEIRO' then 'PASSOU' else 'FALHOU' end,
    coalesce(v_obs, '(null)'));

  -- O raise carrega o relatorio E desfaz as tres OCs de prova.
  raise exception 'PROVA (desfeita de proposito):%', v_rel;
end $prova$;
