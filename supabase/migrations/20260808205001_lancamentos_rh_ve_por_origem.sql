-- Aplicada em produção pelo MCP (apply_migration) em 2026-08-08, versão
-- 20260808205001 no ledger. Este arquivo é o registro versionado do que foi
-- aplicado; NÃO rode `supabase db push` neste projeto (ver docs/decisoes.md).
--
-- Fix round 1 da Task 7 (Bloco 8a): a seção "Lançamentos gerados" do detalhe
-- da folha (e a coluna "No Financeiro" dos adiantamentos, Task 6) ficava
-- vazia por RLS pra quem tem só rh.folha:ver ou rh.adiantamentos:ver, sem
-- nenhuma das seis permissões de Financeiro/Compras: lancamentos_select e
-- lancamento_parcelas_select nunca incluíram esses dois recursos no OR.
-- Provado em transação com rollback (Tiago com as 6 permissões removidas):
-- toda origem ficava invisível, inclusive folha/folha_guia/adiantamento.
--
-- A correção NÃO é um OR solto (isso daria a quem tem rh.folha:ver
-- visibilidade de todo o contas a pagar da empresa, inclusive nota de
-- fornecedor e OC). Cada permissão de RH só libera a origem que é dela:
-- rh.folha:ver -> origem in ('folha','folha_guia'); rh.adiantamentos:ver ->
-- origem = 'adiantamento'. Em lancamento_parcelas (que não tem coluna
-- origem) a mesma regra usa exists() olhando a origem do lançamento pai.
--
-- Aproveitado para alinhar a divergência que o revisor mediu:
-- lancamentos_select tinha financeiro.relatorios:ver no OR e
-- lancamento_parcelas_select não. Os relatórios financeiros (fn_rel_*) são
-- security invoker (comentário de queries.ts do módulo relatorios), então
-- quem só tem financeiro.relatorios:ver dependia da RLS de
-- lancamento_parcelas pra ver as próprias linhas agregadas de aging/DRE -
-- sem essa permissão no OR, a agregação silenciosamente perdia as parcelas.
-- Corrigido junto.

alter policy lancamentos_select on public.lancamentos
  using (
    (select public.tem_permissao('financeiro.lancamentos', 'ver'))
    or (select public.tem_permissao('financeiro.aprovacao-pagamentos', 'ver'))
    or (select public.tem_permissao('financeiro.pagamentos', 'ver'))
    or (select public.tem_permissao('financeiro.contas-receber', 'ver'))
    or (select public.tem_permissao('financeiro.relatorios', 'ver'))
    or (select public.tem_permissao('compras.ordens', 'ver'))
    or ((select public.tem_permissao('rh.folha', 'ver')) and origem in ('folha', 'folha_guia'))
    or ((select public.tem_permissao('rh.adiantamentos', 'ver')) and origem = 'adiantamento')
  );

alter policy lancamento_parcelas_select on public.lancamento_parcelas
  using (
    (select public.tem_permissao('financeiro.lancamentos', 'ver'))
    or (select public.tem_permissao('financeiro.aprovacao-pagamentos', 'ver'))
    or (select public.tem_permissao('financeiro.pagamentos', 'ver'))
    or (select public.tem_permissao('financeiro.contas-receber', 'ver'))
    or (select public.tem_permissao('financeiro.relatorios', 'ver'))
    or (select public.tem_permissao('compras.ordens', 'ver'))
    or (
      (select public.tem_permissao('rh.folha', 'ver'))
      and exists (
        select 1 from public.lancamentos l
        where l.id = lancamento_parcelas.lancamento_id
          and l.origem in ('folha', 'folha_guia')
      )
    )
    or (
      (select public.tem_permissao('rh.adiantamentos', 'ver'))
      and exists (
        select 1 from public.lancamentos l
        where l.id = lancamento_parcelas.lancamento_id
          and l.origem = 'adiantamento'
      )
    )
  );

do $$
declare v_lanc text; v_parc text;
begin
  select qual into v_lanc from pg_policies
  where schemaname = 'public' and tablename = 'lancamentos' and policyname = 'lancamentos_select';
  select qual into v_parc from pg_policies
  where schemaname = 'public' and tablename = 'lancamento_parcelas' and policyname = 'lancamento_parcelas_select';

  if v_lanc is null or v_lanc not like '%rh.folha%' or v_lanc not like '%rh.adiantamentos%' then
    raise exception 'lancamentos_select nao ganhou as condicoes de rh.folha/rh.adiantamentos';
  end if;
  if v_parc is null or v_parc not like '%rh.folha%' or v_parc not like '%rh.adiantamentos%' then
    raise exception 'lancamento_parcelas_select nao ganhou as condicoes de rh.folha/rh.adiantamentos';
  end if;
  if v_parc not like '%financeiro.relatorios%' then
    raise exception 'lancamento_parcelas_select nao alinhou financeiro.relatorios (divergencia da Task 7)';
  end if;

  if exists (
    select 1 from information_schema.role_table_grants
    where table_schema = 'public' and table_name in ('lancamentos','lancamento_parcelas') and grantee = 'anon'
  ) then
    raise exception 'anon ganhou grant em lancamentos/lancamento_parcelas';
  end if;
end $$;

-- Rollback:
--   alter policy lancamentos_select on public.lancamentos
--     using (
--       (select public.tem_permissao('financeiro.lancamentos', 'ver'))
--       or (select public.tem_permissao('financeiro.aprovacao-pagamentos', 'ver'))
--       or (select public.tem_permissao('financeiro.pagamentos', 'ver'))
--       or (select public.tem_permissao('financeiro.contas-receber', 'ver'))
--       or (select public.tem_permissao('financeiro.relatorios', 'ver'))
--       or (select public.tem_permissao('compras.ordens', 'ver'))
--     );
--   alter policy lancamento_parcelas_select on public.lancamento_parcelas
--     using (
--       (select public.tem_permissao('financeiro.lancamentos', 'ver'))
--       or (select public.tem_permissao('financeiro.aprovacao-pagamentos', 'ver'))
--       or (select public.tem_permissao('financeiro.pagamentos', 'ver'))
--       or (select public.tem_permissao('financeiro.contas-receber', 'ver'))
--       or (select public.tem_permissao('compras.ordens', 'ver'))
--     );
