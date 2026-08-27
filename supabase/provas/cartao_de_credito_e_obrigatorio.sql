-- Prova: cartão de crédito é invariante de banco, não só regra de tela.
--
-- Roda inteira dentro de uma transação que TERMINA EM `raise`: nada disto fica
-- na base. É o mesmo padrão das outras provas deste diretório — a alternativa,
-- "testar em homologação", não existe aqui: o projeto é um só.
--
-- As triggers são DEFERRABLE INITIALLY DEFERRED, então sem o `set constraints
-- all immediate` do começo cada insert só estouraria no commit, e o commit é
-- justamente o que esta prova nunca faz.
--
-- O que ela tranca:
--   1. forma de cartão SEM cartão é recusada
--   2. forma de cartão COM cartão ativo passa
--   3. forma que não é cartão COM cartão é recusada
--   4. cartão INATIVO é recusado
--   5. os documentos que já existem sem cartão continuam intocados (o `update`
--      de valor que `fn_definir_parcelas_lancamento` faz não dispara a trigger)
--
-- Como rodar:
--   psql "$DATABASE_URL" -f supabase/provas/cartao_de_credito_e_obrigatorio.sql

do $prova$
declare
  v_cartao uuid;
  v_cartao_inativo uuid;
  v_oc uuid;
  v_forma_cartao uuid;
  v_forma_pix uuid;
  v_bloco uuid;
  v_saida text := '';
  v_falhas int := 0;
begin
  set constraints all immediate;

  select id into v_forma_cartao
  from public.formas_pagamento where tipo = 'cartao_credito' and ativo limit 1;
  select id into v_forma_pix
  from public.formas_pagamento where tipo <> 'cartao_credito' and ativo limit 1;
  select id into v_oc
  from public.ordens_compra where status in ('rascunho', 'pendente_aprovacao') limit 1;

  if v_forma_cartao is null or v_forma_pix is null or v_oc is null then
    raise exception 'A base nao tem forma de cartao, forma nao-cartao ou ordem editavel para a prova';
  end if;

  insert into public.cartoes_credito (nome, ultimos_digitos)
  values ('PROVA CARTAO ATIVO', '4829') returning id into v_cartao;
  insert into public.cartoes_credito (nome, ultimos_digitos, ativo)
  values ('PROVA CARTAO INATIVO', '7712', false) returning id into v_cartao_inativo;

  -- O unique (ordem, forma) atrapalharia os inserts abaixo; a ordem fica sem
  -- forma nenhuma DENTRO desta transação.
  delete from public.oc_formas where ordem_compra_id = v_oc;

  -- 1 --------------------------------------------------------------------
  begin
    insert into public.oc_formas (ordem_compra_id, forma_pagamento_id, valor)
    values (v_oc, v_forma_cartao, 1);
    v_saida := v_saida || E'\n  1. FALHOU: aceitou forma de cartao SEM cartao';
    v_falhas := v_falhas + 1;
    delete from public.oc_formas where ordem_compra_id = v_oc;
  exception when others then
    v_saida := v_saida || E'\n  1. ok, recusou: ' || sqlerrm;
  end;

  -- 2 --------------------------------------------------------------------
  begin
    insert into public.oc_formas (ordem_compra_id, forma_pagamento_id, cartao_id, valor)
    values (v_oc, v_forma_cartao, v_cartao, 1)
    returning id into v_bloco;
    v_saida := v_saida || E'\n  2. ok, aceitou com cartao ativo';
    delete from public.oc_formas where id = v_bloco;
  exception when others then
    v_saida := v_saida || E'\n  2. FALHOU: recusou cartao ativo: ' || sqlerrm;
    v_falhas := v_falhas + 1;
  end;

  -- 3 --------------------------------------------------------------------
  begin
    insert into public.oc_formas (ordem_compra_id, forma_pagamento_id, cartao_id, valor)
    values (v_oc, v_forma_pix, v_cartao, 1);
    v_saida := v_saida || E'\n  3. FALHOU: aceitou cartao em forma que nao e cartao';
    v_falhas := v_falhas + 1;
    delete from public.oc_formas where ordem_compra_id = v_oc;
  exception when others then
    v_saida := v_saida || E'\n  3. ok, recusou: ' || sqlerrm;
  end;

  -- 4 --------------------------------------------------------------------
  begin
    insert into public.oc_formas (ordem_compra_id, forma_pagamento_id, cartao_id, valor)
    values (v_oc, v_forma_cartao, v_cartao_inativo, 1);
    v_saida := v_saida || E'\n  4. FALHOU: aceitou cartao inativo';
    v_falhas := v_falhas + 1;
    delete from public.oc_formas where ordem_compra_id = v_oc;
  exception when others then
    v_saida := v_saida || E'\n  4. ok, recusou: ' || sqlerrm;
  end;

  -- 5 --------------------------------------------------------------------
  -- A LINHA DE CONTROLE desta prova: um bloco ANTIGO, de forma de cartão e sem
  -- cartão nenhum, tem que continuar aceitando `update ... set valor`. É esse o
  -- caminho de `fn_definir_parcelas_lancamento`, e se a trigger o pegasse, todo
  -- lançamento manual de cartão que já existe pararia de fechar.
  begin
    update public.lancamento_formas lf
    set valor = lf.valor
    where lf.cartao_id is null
      and exists (
        select 1 from public.formas_pagamento f
        where f.id = lf.forma_pagamento_id and f.tipo = 'cartao_credito'
      );
    v_saida := v_saida || E'\n  5. ok, update de valor em bloco antigo sem cartao passou';
  exception when others then
    v_saida := v_saida || E'\n  5. FALHOU: trigger pegou bloco antigo: ' || sqlerrm;
    v_falhas := v_falhas + 1;
  end;

  raise exception 'PROVA (transacao desfeita) - falhas: % %', v_falhas, v_saida;
end;
$prova$;
