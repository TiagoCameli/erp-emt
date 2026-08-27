-- Rollback de 20260827180000_cartoes_de_credito.sql e
-- 20260827180100_cartao_desce_para_o_lancamento.sql.
--
-- ORDEM, e o motivo dela: as funções voltam a NÃO mencionar `cartao_id` ANTES de
-- a coluna sair. Na ordem inversa, `fn_salvar_lancamento` fica apontando para
-- uma coluna que não existe mais e todo salvamento de lançamento quebra em
-- runtime — com o build verde, porque plpgsql só valida SQL ao executar.
--
-- O QUE SE PERDE: `drop column cartao_id` leva junto qual cartão pagou cada
-- bloco. Isso não volta. Antes de rodar, veja o que existe:
--   select count(*) from public.oc_formas where cartao_id is not null;
--   select count(*) from public.lancamento_formas where cartao_id is not null;
--   select * from public.cartoes_credito;

-- =====================================================================
-- 1. As funções deixam de mencionar a coluna
-- =====================================================================
-- Mesma técnica da migration, ao contrário: lê-se a definição viva e desfaz-se a
-- alteração no texto. Se outra frente mexeu nessas funções depois, o trabalho
-- dela sobrevive.

do $$
declare
  v_def text;
  v_novo text;
begin
  -- fn_salvar_parcelas_oc
  select pg_get_functiondef(p.oid) into v_def
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public' and p.proname = 'fn_salvar_parcelas_oc';

  if v_def is not null and position('cartao_id' in v_def) > 0 then
    v_novo := replace(v_def,
      '(ordem_compra_id, forma_pagamento_id, cartao_id, valor, created_by)',
      '(ordem_compra_id, forma_pagamento_id, valor, created_by)');
    v_novo := regexp_replace(v_novo,
      'nullif\(x->>''cartao_id'',''''\)::uuid,\s*round\(\(x->>''valor''\)::numeric, 2\), \(select auth\.uid\(\)\)',
      'round((x->>''valor'')::numeric, 2), (select auth.uid())');
    if position('cartao_id' in v_novo) > 0 then
      raise exception 'fn_salvar_parcelas_oc ainda menciona cartao_id depois da limpeza: revise a mao';
    end if;
    execute v_novo;
  end if;

  -- fn_salvar_lancamento
  select pg_get_functiondef(p.oid) into v_def
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public' and p.proname = 'fn_salvar_lancamento';

  if v_def is not null and position('cartao_id' in v_def) > 0 then
    v_novo := replace(v_def,
      '(lancamento_id, forma_pagamento_id, cartao_id, valor, created_by)',
      '(lancamento_id, forma_pagamento_id, valor, created_by)');
    v_novo := regexp_replace(v_novo,
      'nullif\(x->>''cartao_id'',''''\)::uuid,\s*round\(\(x->>''valor''\)::numeric, 2\), \(select auth\.uid\(\)\)',
      'round((x->>''valor'')::numeric, 2), (select auth.uid())');
    if position('cartao_id' in v_novo) > 0 then
      raise exception 'fn_salvar_lancamento ainda menciona cartao_id depois da limpeza: revise a mao';
    end if;
    execute v_novo;
  end if;

  -- fn_aprovar_ordem_compra
  select pg_get_functiondef(p.oid) into v_def
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public' and p.proname = 'fn_aprovar_ordem_compra';

  if v_def is not null and position('cartao_id' in v_def) > 0 then
    v_novo := replace(v_def,
      '(lancamento_id, forma_pagamento_id, cartao_id, valor, created_by)',
      '(lancamento_id, forma_pagamento_id, valor, created_by)');
    v_novo := replace(v_novo,
      'select v_lanc_id, ofo.forma_pagamento_id, ofo.cartao_id, ofo.valor, (select auth.uid())',
      'select v_lanc_id, ofo.forma_pagamento_id, ofo.valor, (select auth.uid())');
    if position('cartao_id' in v_novo) > 0 then
      raise exception 'fn_aprovar_ordem_compra ainda menciona cartao_id depois da limpeza: revise a mao';
    end if;
    execute v_novo;
  end if;
end;
$$;

-- =====================================================================
-- 2. A invariante sai
-- =====================================================================

drop trigger if exists trg_oc_formas_cartao on public.oc_formas;
drop trigger if exists trg_lancamento_formas_cartao on public.lancamento_formas;
drop function if exists public.fn_valida_cartao_da_forma();

-- =====================================================================
-- 3. As colunas saem (isto apaga qual cartão pagou o quê)
-- =====================================================================

alter table public.oc_formas drop column if exists cartao_id;
alter table public.lancamento_formas drop column if exists cartao_id;

-- =====================================================================
-- 4. O cadastro sai
-- =====================================================================
-- Por último, porque as FKs acima apontavam para cá.

drop function if exists public.fn_salvar_cartao_credito(uuid, text, text, text, text, smallint, smallint, boolean);
drop table if exists public.cartoes_credito;
