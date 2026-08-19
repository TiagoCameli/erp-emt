-- Lançamento sem centro de custo passa a ser recusado.
--
-- `fn_salvar_lancamento` validava a soma do rateio, mas só quando havia rateio:
--
--   if jsonb_array_length(coalesce(p_rateios,'[]'::jsonb)) > 0 then ... end if;
--
-- Lista vazia passava direto, e o lançamento nascia sem centro de custo nenhum —
-- contra a espinha dorsal do sistema ("nenhum custo existe sem centro de custo") e
-- fora do DRE por centro. Medido em 18/08/2026: cinco lançamentos manuais criados no
-- mesmo dia estavam assim, R$ 38.206,03 em FGTS, DARF e ICMS. Os cinco foram
-- corrigidos (os três DARF para Escritório Central, por decisão do Tiago) antes desta
-- migration, então ela nasce sem violar nada: 0 de 5.911 lançamentos sem rateio.
--
-- A trava vai aqui, e não numa constraint em `lancamentos`, porque o furo é deste
-- caminho. Uma trava na tabela alcançaria também folha, adiantamento e ordem de
-- compra, que criam lançamento por insert direto e já mandam rateio — risco sem
-- ganho. O caminho com rateio continua idêntico: isto só acrescenta o caso vazio.

do $$
declare
  v_def text;
  v_novo text;
begin
  select pg_get_functiondef(p.oid) into v_def
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public' and p.proname = 'fn_salvar_lancamento';

  if v_def is null then
    raise exception 'fn_salvar_lancamento nao existe';
  end if;

  v_novo := replace(
    v_def,
    'if jsonb_array_length(coalesce(p_rateios,''[]''::jsonb)) > 0 then',
    'if jsonb_array_length(coalesce(p_rateios,''[]''::jsonb)) = 0 then'
      || E'\n    raise exception ''Escolha o centro de custo: nenhum custo existe sem centro de custo'';'
      || E'\n  end if;'
      || E'\n  if true then'
  );

  if v_novo = v_def then
    raise exception 'Nao achei o bloco do rateio em fn_salvar_lancamento: a funcao mudou, revise a migration';
  end if;

  execute v_novo;
end $$;
