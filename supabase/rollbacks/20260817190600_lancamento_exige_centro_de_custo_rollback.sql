-- Volta a aceitar lançamento sem centro de custo (o comportamento anterior).
--
-- Reverter devolve o furo: lançamento manual pode nascer sem rateio e sair do DRE por
-- centro de custo. Só faça se algum fluxo legítimo precisar disso.

do $$
declare
  v_def text;
  v_novo text;
begin
  select pg_get_functiondef(p.oid) into v_def
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public' and p.proname = 'fn_salvar_lancamento';

  v_novo := replace(
    v_def,
    'if jsonb_array_length(coalesce(p_rateios,''[]''::jsonb)) = 0 then'
      || E'\n    raise exception ''Escolha o centro de custo: nenhum custo existe sem centro de custo'';'
      || E'\n  end if;'
      || E'\n  if true then',
    'if jsonb_array_length(coalesce(p_rateios,''[]''::jsonb)) > 0 then'
  );

  if v_novo = v_def then
    raise exception 'Nao achei o bloco alterado: revise o rollback';
  end if;

  execute v_novo;
end $$;
