-- O relatorio "Endividamento" passou a se chamar "Creditos" (pedido do Tiago em
-- 26/08/2026). O conteudo e o mesmo: emprestimo, financiamento e consorcio.
--
-- ALTER FUNCTION ... RENAME em vez de DROP + CREATE de proposito. O objeto
-- continua sendo o mesmo (mesmo oid), entao os privilegios vao junto: nao ha
-- janela sem grant e nao ha risco de esquecer o `grant execute to authenticated`
-- depois, que e a falha que deixa o painel em branco sem erro nenhum na tela.
--
-- A coluna `lancamentos.e_divida` NAO muda. O que foi renomeado e o relatorio,
-- nao a marca no lancamento: a caixinha continua dizendo "e emprestimo,
-- financiamento ou consorcio", que e o fato, e "divida" segue sendo o nome certo
-- do que ela marca. Trocar a coluna mexeria em fn_salvar_lancamento sem ninguem
-- ter pedido.

do $$
declare
  v_acl_antes text;
  v_acl_depois text;
begin
  -- Idempotente: se ja foi renomeada, nao ha nada a fazer.
  if not exists (
    select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname = 'fn_rel_endividamento'
  ) then
    raise notice 'fn_rel_endividamento ja renomeada; nada a fazer';
    return;
  end if;

  select array_to_string(p.proacl, ' | ') into v_acl_antes
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public' and p.proname = 'fn_rel_endividamento';

  alter function public.fn_rel_endividamento() rename to fn_rel_creditos;
  alter function public.fn_rel_endividamento_por_mes(int) rename to fn_rel_creditos_por_mes;

  select array_to_string(p.proacl, ' | ') into v_acl_depois
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public' and p.proname = 'fn_rel_creditos';

  -- LINHA DE CONTROLE: o rename tem que ter PRESERVADO o acl. Se algum dia o
  -- Postgres mudar isso, a migration para aqui em vez de deixar a tela em branco.
  if v_acl_depois is distinct from v_acl_antes then
    raise exception 'O rename mexeu nos privilegios. Antes: % / Depois: %',
      v_acl_antes, v_acl_depois;
  end if;
  if position('authenticated=X' in coalesce(v_acl_depois, '')) = 0 then
    raise exception 'fn_rel_creditos ficou sem execute para authenticated: %', v_acl_depois;
  end if;

  -- PUBLIC aparece no aclitem como um grantee VAZIO ('=X/postgres'). Ler o array
  -- elemento a elemento, e nao o texto concatenado: la dentro
  -- 'postgres=X/postgres' tambem contem '=X/postgres', e o teste acusaria sempre.
  if exists (
    select 1
    from pg_proc p
      join pg_namespace n on n.oid = p.pronamespace
      cross join lateral unnest(coalesce(p.proacl, '{}'::aclitem[])) as a(item)
    where n.nspname = 'public'
      and p.proname in ('fn_rel_creditos', 'fn_rel_creditos_por_mes')
      and a.item::text like '=%'
  ) then
    raise exception 'fn_rel_creditos ficou executavel por PUBLIC';
  end if;
end $$;

comment on function public.fn_rel_creditos() is
  'Uma linha por credito tomado (lancamentos.e_divida): contratado, pago, saldo e proximo vencimento. Saldo sai da soma das parcelas em aberto, nao de um campo.';

comment on function public.fn_rel_creditos_por_mes(int) is
  'Parcelas de credito em aberto por mes de vencimento, nos proximos N meses. Parcela vencida e nao paga cai no mes corrente: para o caixa ela e compromisso de agora.';
