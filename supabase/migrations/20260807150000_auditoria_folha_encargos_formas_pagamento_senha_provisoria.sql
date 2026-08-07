-- Aplicada em produção pelo MCP (apply_migration) em 2026-08-07, versão
-- 20260807195301 no ledger. Este arquivo é o registro versionado do que foi
-- aplicado; NÃO rode `supabase db push` neste projeto (ver docs/decisoes.md).
--
-- Regra de ouro 6 do CLAUDE.md: toda tabela transacional tem trigger gravando em
-- audit_log. Três estavam de fora. As outras sem trigger (audit_log,
-- documento_sequencias, preferencias_tabela) estão CERTAS assim: a primeira não
-- audita a si mesma, a segunda é contador interno e a terceira é preferência de UI.

-- 1) folha_item_encargos: percentual e valor de encargo por item de folha. É
--    dinheiro de RH, e alterar uma linha hoje não deixa rastro nenhum.
create trigger trg_audit_folha_item_encargos
after insert or update or delete on public.folha_item_encargos
for each row execute function public.fn_audit();

-- 2) formas_pagamento: define se o lançamento paga direto (dinheiro/cartão) ou vai
--    para a fila de autorização. Mudar o `tipo` de uma forma altera o caminho do
--    dinheiro para todo lançamento que a use.
create trigger trg_audit_formas_pagamento
after insert or update or delete on public.formas_pagamento
for each row execute function public.fn_audit();

-- 3) usuario_senha_provisoria precisa de trilha, mas NÃO PODE usar a fn_audit
--    padrão. Ela grava a linha inteira (`to_jsonb(new)`) e a coluna `senha` é
--    TEXTO EM CLARO: o trigger padrão copiaria a senha para o audit_log, que tem
--    outro conjunto de leitores (administracao.auditoria:ver), é permanente e não
--    é apagável pelo client. Seria trocar uma exposição por outra, pior.
--
--    Esta função registra QUEM mexeu, QUANDO e em QUAL usuário, e descarta o valor
--    da senha. Também resolve a chave: a fn_audit padrão procura 'id' ou 'chave' e
--    esta tabela tem `usuario_id` — sem isto o registro_id sairia nulo.
create or replace function public.fn_audit_senha_provisoria()
returns trigger
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_antes jsonb;
  v_depois jsonb;
  v_chave text;
begin
  v_antes  := case when tg_op in ('UPDATE', 'DELETE') then to_jsonb(old) - 'senha' end;
  v_depois := case when tg_op in ('INSERT', 'UPDATE') then to_jsonb(new) - 'senha' end;
  v_chave  := coalesce(v_depois ->> 'usuario_id', v_antes ->> 'usuario_id');

  insert into public.audit_log (tabela, registro_id, acao, usuario_id, dados_antes, dados_depois)
  values (tg_table_name, v_chave, tg_op, auth.uid(), v_antes, v_depois);

  if tg_op = 'DELETE' then return old; end if;
  return new;
end
$function$;

create trigger trg_audit_usuario_senha_provisoria
after insert or update or delete on public.usuario_senha_provisoria
for each row execute function public.fn_audit_senha_provisoria();

-- Trava fail-closed: os três triggers existem, e a função da senha realmente
-- descarta a coluna. O segundo teste é no TEXTO do corpo de propósito, para que
-- trocar esta função pela fn_audit padrão "por simplicidade" derrube a migration
-- em vez de reintroduzir o vazamento em silêncio.
do $$
declare
  v_faltando text;
begin
  select string_agg(t.tabela, ', ') into v_faltando
  from (values
    ('folha_item_encargos'), ('formas_pagamento'), ('usuario_senha_provisoria')
  ) as t(tabela)
  where not exists (
    select 1 from pg_trigger tg
    join pg_class c on c.oid = tg.tgrelid
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public' and c.relname = t.tabela and not tg.tgisinternal
  );
  if v_faltando is not null then
    raise exception 'Trigger de auditoria nao criado em: %', v_faltando;
  end if;

  if not exists (
    select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname = 'fn_audit_senha_provisoria'
      and pg_get_functiondef(p.oid) like '%- ''senha''%'
  ) then
    raise exception
      'fn_audit_senha_provisoria nao descarta a coluna senha: gravaria a senha em claro no audit_log';
  end if;
end $$;
