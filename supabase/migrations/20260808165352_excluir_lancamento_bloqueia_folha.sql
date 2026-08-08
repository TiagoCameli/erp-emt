-- Aplicada em produção pelo MCP (apply_migration) em 2026-08-08, versão
-- 20260808165352 no ledger. Este arquivo é o registro versionado do que foi
-- aplicado; NÃO rode `supabase db push` neste projeto (ver docs/decisoes.md).
--
-- Task 4 do Bloco 8a, parte 4 de 4.
--
-- Lançamento que veio do RH se apaga pela origem, nunca pelo Financeiro: apagar
-- a conta a pagar por fora deixaria folha_itens.lancamento_id /
-- folha_guias.lancamento_id apontando para nada e a folha aprovada sem o
-- dinheiro dela. Mesma regra que a origem 'diaria' já tem desde a
-- 20260730192937 (excluir_lancamento_e_orfaos).
--
-- Recriação CIRÚRGICA a partir da pg_get_functiondef, com o md5 da versão viva
-- fixado: o resto da função (parcela aprovada/paga, parcela conciliada, OC que
-- ainda existe) fica byte a byte igual, provado pelo replace reverso no fim.
-- Diff conferido na aplicação: 54 -> 62 linhas, 1622 -> 1970 caracteres, e o
-- reverso devolve o md5 9d92f18f39211017e22838546c294ca7 da original.
-- Rodar de novo aborta no md5: registro do que rodou, não fonte de reaplicação.
do $mig$
declare
  v_def text;
  v_novo text;
  v_reverso text;
  c_antes constant text := $anchor$  if v_origem = 'diaria' then
    raise exception 'Nao da para excluir aqui: este lancamento veio de uma diaria. Exclua pela diaria';
  end if;$anchor$;
  c_depois constant text := $anchor$  if v_origem = 'diaria' then
    raise exception 'Nao da para excluir aqui: este lancamento veio de uma diaria. Exclua pela diaria';
  end if;

  if v_origem in ('folha', 'folha_guia') then
    raise exception 'Nao da para excluir aqui: este lancamento veio da folha. Desaprove a folha, que apaga os lancamentos dela';
  end if;

  if v_origem = 'adiantamento' then
    raise exception 'Nao da para excluir aqui: este lancamento veio de um adiantamento. Exclua pelo adiantamento';
  end if;$anchor$;
begin
  select pg_get_functiondef(p.oid) into v_def
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public' and p.proname = 'fn_excluir_lancamento';

  if v_def is null then
    raise exception 'fn_excluir_lancamento nao encontrada';
  end if;

  if md5(v_def) <> '9d92f18f39211017e22838546c294ca7' then
    raise exception 'fn_excluir_lancamento viva nao e a lida no Step 5 (md5 %, esperado 9d92f18f39211017e22838546c294ca7): reler antes de recriar',
      md5(v_def);
  end if;

  if (length(v_def) - length(replace(v_def, c_antes, ''))) / length(c_antes) <> 1 then
    raise exception 'o bloco da origem diaria nao aparece exatamente 1 vez na fn viva';
  end if;

  v_novo := replace(v_def, c_antes, c_depois);

  if length(v_novo) - length(v_def) <> length(c_depois) - length(c_antes) then
    raise exception 'a fn nova cresceu % caracteres em vez de %',
      length(v_novo) - length(v_def), length(c_depois) - length(c_antes);
  end if;

  execute v_novo;

  -- Prova: desfazer a inclusão devolve, byte a byte, a original do Step 5.
  select pg_get_functiondef(p.oid) into v_reverso
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public' and p.proname = 'fn_excluir_lancamento';

  v_reverso := replace(v_reverso, c_depois, c_antes);

  if md5(v_reverso) <> '9d92f18f39211017e22838546c294ca7' then
    raise exception 'fn_excluir_lancamento recriada difere da original em algo alem das origens novas (md5 reverso %)',
      md5(v_reverso);
  end if;
end $mig$;

-- Trava fail-closed: as três origens novas estão barradas e as barreiras
-- antigas continuam de pé.
do $$
declare v_def text;
begin
  select pg_get_functiondef(p.oid) into v_def
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public' and p.proname = 'fn_excluir_lancamento';

  if v_def not like '%''folha'', ''folha_guia''%' or v_def not like '%''adiantamento''%' then
    raise exception 'fn_excluir_lancamento nao recusa as origens da folha';
  end if;
  if v_def not like '%veio de uma diaria%'
     or v_def not like '%ja foi aprovado ou pago%'
     or v_def not like '%parcela conciliada%'
     or v_def not like '%e de uma ordem de compra%' then
    raise exception 'fn_excluir_lancamento perdeu uma das barreiras antigas';
  end if;
end $$;

-- Rollback: o mesmo bloco com c_antes/c_depois trocados de lugar (e o md5
-- esperado passando a ser c21f785ee5c7fbc1e9246dcdadf7a0d1, o da versão com as
-- origens novas).
