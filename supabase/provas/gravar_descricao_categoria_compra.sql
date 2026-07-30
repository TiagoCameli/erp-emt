-- Prova de aceite: descricao e categoria GRAVADAS na OC e na cotacao.
--
-- Roda em transacao e termina em ROLLBACK. Nada fica no banco.
--
-- Rodada em 30/07/2026 contra o banco de producao, 13 casos, 13 PASSOU:
--
--   1. RPC grava descricao (sem espaco nas pontas) -> "Brita 1 para a usina"
--   2. RPC grava categoria_id                      -> 5ea885cd-...ca69f1
--   3. RPC sem os dois campos nao quebra           -> null / null
--   4. string vazia vira null                      -> null / null
--   5. edicao da OC grava os dois (UPDATE direto)  -> "Brita 0 e po de pedra"
--   6. lancamento herda descricao e categoria      -> mesma descricao e categoria
--   7. cotacao grava os dois na criacao            -> "Cimento CP II para o galpao"
--   8. cotacao grava os dois na edicao             -> "Cimento CP IV"
--   9. categoria inexistente na OC
--      "Categoria financeira nao encontrada"
--  10. categoria inativa na OC
--      "A categoria financeira escolhida esta inativa. Escolha uma categoria ativa"
--  11. categoria inativa na cotacao -> mesma mensagem (o trigger cobre as duas)
--  12. editar OC cuja categoria foi inativada depois -> aceito, nao trava
--  13. regravar a MESMA categoria inativa            -> aceito
--
-- Depois do rollback: 0 OC e 0 cotacao com a marca [PROVA-DESC-CAT], 0 categoria
-- inativa (a desativacao dos casos 10 e 11 voltou).
--
-- IMPORTANTE: fn_criar_ordem_compra checa tem_permissao(), que depende de
-- auth.uid(). Fora de sessao autenticada, o primeiro bloco assume o primeiro
-- usuario ativo com compras.ordens:criar.
--
-- Os dados de apoio (fornecedor, condicao, insumo, centro de custo) vem de uma
-- OC real do banco, para nao inventar combinacao que o banco recusaria por
-- outro motivo e confundir o resultado da prova.

begin;

do $prova$
declare v_usuario uuid;
begin
  select u.id into v_usuario
  from public.usuarios u
  join public.usuario_permissoes up on up.usuario_id = u.id
  where u.ativo and up.recurso = 'compras.ordens' and up.acao = 'criar'
  limit 1;
  if v_usuario is null then
    raise exception 'Nenhum usuario ativo com compras.ordens:criar';
  end if;
  perform set_config('request.jwt.claims', json_build_object('sub', v_usuario)::text, true);
end $prova$;

create temp table prova_desc_cat (
  ordem int generated always as identity,
  caso text, esperado text, obtido text, passou boolean
);

do $prova$
declare
  v_usuario uuid; v_aprovador uuid;
  v_forn uuid; v_cond uuid; v_insumo uuid; v_centro uuid;
  v_cat uuid; v_cat2 uuid;
  v_oc uuid; v_oc_vazia uuid; v_cot uuid;
  v_desc text; v_categoria uuid;
  v_itens jsonb; v_cab jsonb; v_hoje date;
begin
  v_hoje := (now() at time zone 'America/Rio_Branco')::date;

  select (current_setting('request.jwt.claims', true)::json ->> 'sub')::uuid into v_usuario;

  select o.fornecedor_id, o.condicao_pagamento_id into v_forn, v_cond
  from public.ordens_compra o
  where o.condicao_pagamento_id is not null
  order by o.created_at desc
  limit 1;

  select i.insumo_id, i.centro_custo_id into v_insumo, v_centro
  from public.oc_itens i
  limit 1;

  select id into v_cat from public.categorias_financeiras
  where ativo and tipo = 'despesa' order by nome limit 1;
  select id into v_cat2 from public.categorias_financeiras
  where ativo and tipo = 'despesa' and id <> v_cat order by nome limit 1;

  v_itens := jsonb_build_array(jsonb_build_object(
    'insumo_id', v_insumo,
    'quantidade', 2,
    'preco_unitario', 150.50,
    'centro_custo_id', v_centro
  ));

  v_cab := jsonb_build_object(
    'fornecedor_id', v_forn,
    'condicao_pagamento_id', v_cond,
    'data_compra', v_hoje,
    'mes_competencia', v_hoje,
    'observacoes', '[PROVA-DESC-CAT]'
  );

  -- 1 e 2. Caminho da RPC de criar, com os dois campos preenchidos.
  v_oc := public.fn_criar_ordem_compra(
    v_cab || jsonb_build_object(
      'descricao', '  Brita 1 para a usina  ',
      'categoria_id', v_cat
    ),
    v_itens
  );

  select descricao, categoria_id into v_desc, v_categoria
  from public.ordens_compra where id = v_oc;

  insert into prova_desc_cat (caso, esperado, obtido, passou) values
    ('1. RPC grava descricao (sem espaco nas pontas)', 'Brita 1 para a usina',
     coalesce(v_desc, '(null)'), v_desc = 'Brita 1 para a usina'),
    ('2. RPC grava categoria_id', v_cat::text,
     coalesce(v_categoria::text, '(null)'), v_categoria = v_cat);

  -- 3. Sem os dois campos no cabecalho: OC continua nascendo (compra legada).
  v_oc_vazia := public.fn_criar_ordem_compra(v_cab, v_itens);
  select descricao, categoria_id into v_desc, v_categoria
  from public.ordens_compra where id = v_oc_vazia;

  insert into prova_desc_cat (caso, esperado, obtido, passou) values
    ('3. RPC sem os dois campos nao quebra', 'null / null',
     coalesce(v_desc, 'null') || ' / ' || coalesce(v_categoria::text, 'null'),
     v_desc is null and v_categoria is null);

  -- 4. String vazia (o que o formulario manda com o campo em branco) vira null,
  -- e nao descricao em branco nem erro de cast de uuid.
  v_oc_vazia := public.fn_criar_ordem_compra(
    v_cab || jsonb_build_object('descricao', '', 'categoria_id', ''),
    v_itens
  );
  select descricao, categoria_id into v_desc, v_categoria
  from public.ordens_compra where id = v_oc_vazia;

  insert into prova_desc_cat (caso, esperado, obtido, passou) values
    ('4. string vazia vira null', 'null / null',
     coalesce(v_desc, 'null') || ' / ' || coalesce(v_categoria::text, 'null'),
     v_desc is null and v_categoria is null);

  -- 5. Edicao do cabecalho da OC: UPDATE direto na tabela, que e o caminho que
  -- a action editarOrdem usa.
  update public.ordens_compra
  set descricao = 'Brita 0 e po de pedra', categoria_id = v_cat2
  where id = v_oc;

  select descricao, categoria_id into v_desc, v_categoria
  from public.ordens_compra where id = v_oc;

  insert into prova_desc_cat (caso, esperado, obtido, passou) values
    ('5. edicao da OC grava os dois', 'Brita 0 e po de pedra / ' || v_cat2::text,
     coalesce(v_desc, '(null)') || ' / ' || coalesce(v_categoria::text, '(null)'),
     v_desc = 'Brita 0 e po de pedra' and v_categoria = v_cat2);

  -- 6. Ponta a ponta: aprovar a OC e ver o lancamento herdar o que foi gravado.
  select u.id into v_aprovador
  from public.usuarios u
  join public.usuario_permissoes up on up.usuario_id = u.id
  where u.ativo and up.recurso = 'compras.ordens' and up.acao = 'aprovar'
  limit 1;

  if v_aprovador is null then
    insert into prova_desc_cat (caso, esperado, obtido, passou) values
      ('6. lancamento herda da OC', 'herdou', 'sem usuario com aprovar', false);
  else
    perform set_config('request.jwt.claims', json_build_object('sub', v_aprovador)::text, true);
    update public.ordens_compra set status = 'pendente_aprovacao' where id = v_oc;
    begin
      perform public.fn_aprovar_ordem_compra(v_oc);
      select l.descricao, l.categoria_id into v_desc, v_categoria
      from public.lancamentos l
      where l.origem = 'oc' and l.origem_id = v_oc;
      insert into prova_desc_cat (caso, esperado, obtido, passou) values
        ('6. lancamento herda descricao e categoria',
         'Brita 0 e po de pedra / ' || v_cat2::text,
         coalesce(v_desc, '(null)') || ' / ' || coalesce(v_categoria::text, '(null)'),
         v_desc = 'Brita 0 e po de pedra' and v_categoria = v_cat2);
    exception when others then
      insert into prova_desc_cat (caso, esperado, obtido, passou) values
        ('6. lancamento herda descricao e categoria', 'herdou',
         'erro: ' || left(sqlerrm, 70), false);
    end;
    perform set_config('request.jwt.claims', json_build_object('sub', v_usuario)::text, true);
  end if;

  -- 7 e 8. Cotacao: criar e editar sao INSERT/UPDATE direto na tabela.
  insert into public.cotacoes (observacoes, status, descricao, categoria_id)
  values ('[PROVA-DESC-CAT]', 'aberta', 'Cimento CP II para o galpao', v_cat)
  returning id into v_cot;

  select descricao, categoria_id into v_desc, v_categoria
  from public.cotacoes where id = v_cot;

  insert into prova_desc_cat (caso, esperado, obtido, passou) values
    ('7. cotacao grava os dois na criacao',
     'Cimento CP II para o galpao / ' || v_cat::text,
     coalesce(v_desc, '(null)') || ' / ' || coalesce(v_categoria::text, '(null)'),
     v_desc = 'Cimento CP II para o galpao' and v_categoria = v_cat);

  update public.cotacoes
  set descricao = 'Cimento CP IV', categoria_id = v_cat2
  where id = v_cot;

  select descricao, categoria_id into v_desc, v_categoria
  from public.cotacoes where id = v_cot;

  insert into prova_desc_cat (caso, esperado, obtido, passou) values
    ('8. cotacao grava os dois na edicao', 'Cimento CP IV / ' || v_cat2::text,
     coalesce(v_desc, '(null)') || ' / ' || coalesce(v_categoria::text, '(null)'),
     v_desc = 'Cimento CP IV' and v_categoria = v_cat2);

  -- 9. Categoria que nao existe: recusada com mensagem em pt-BR (o trigger roda
  -- antes da FK, entao a mensagem que chega na tela e a nossa).
  begin
    perform public.fn_criar_ordem_compra(
      v_cab || jsonb_build_object('categoria_id', gen_random_uuid()), v_itens);
    insert into prova_desc_cat (caso, esperado, obtido, passou) values
      ('9. categoria inexistente na OC', 'recusado', 'aceitou', false);
  exception when others then
    insert into prova_desc_cat (caso, esperado, obtido, passou) values
      ('9. categoria inexistente na OC', 'recusado', left(sqlerrm, 70),
       sqlerrm like '%Categoria financeira nao encontrada%');
  end;

  -- 10 e 11. Categoria inativa: recusada na OC e na cotacao.
  update public.categorias_financeiras set ativo = false where id = v_cat2;

  begin
    perform public.fn_criar_ordem_compra(
      v_cab || jsonb_build_object('categoria_id', v_cat2), v_itens);
    insert into prova_desc_cat (caso, esperado, obtido, passou) values
      ('10. categoria inativa na OC', 'recusado', 'aceitou', false);
  exception when others then
    insert into prova_desc_cat (caso, esperado, obtido, passou) values
      ('10. categoria inativa na OC', 'recusado', left(sqlerrm, 70),
       sqlerrm like '%inativa%');
  end;

  begin
    insert into public.cotacoes (observacoes, status, categoria_id)
    values ('[PROVA-DESC-CAT]', 'aberta', v_cat2);
    insert into prova_desc_cat (caso, esperado, obtido, passou) values
      ('11. categoria inativa na cotacao', 'recusado', 'aceitou', false);
  exception when others then
    insert into prova_desc_cat (caso, esperado, obtido, passou) values
      ('11. categoria inativa na cotacao', 'recusado', left(sqlerrm, 70),
       sqlerrm like '%inativa%');
  end;

  -- 12. Documento que ja existe com categoria desativada depois nao fica
  -- travado: editar outro campo continua funcionando.
  begin
    update public.ordens_compra
    set observacoes = '[PROVA-DESC-CAT] editado depois de inativar'
    where id = v_oc;
    insert into prova_desc_cat (caso, esperado, obtido, passou) values
      ('12. editar OC de categoria ja inativa', 'aceito', 'aceito', true);
  exception when others then
    insert into prova_desc_cat (caso, esperado, obtido, passou) values
      ('12. editar OC de categoria ja inativa', 'aceito',
       'erro: ' || left(sqlerrm, 70), false);
  end;

  -- 13. Regravar a MESMA categoria inativa tambem passa (o trigger so age
  -- quando a categoria muda de verdade).
  begin
    update public.ordens_compra set categoria_id = v_cat2 where id = v_oc;
    insert into prova_desc_cat (caso, esperado, obtido, passou) values
      ('13. regravar a mesma categoria inativa', 'aceito', 'aceito', true);
  exception when others then
    insert into prova_desc_cat (caso, esperado, obtido, passou) values
      ('13. regravar a mesma categoria inativa', 'aceito',
       'erro: ' || left(sqlerrm, 70), false);
  end;
end $prova$;

select caso, esperado, obtido, case when passou then 'PASSOU' else 'FALHOU' end as resultado
from prova_desc_cat order by ordem;

rollback;
