-- Aplicada em produção pelo MCP (apply_migration) em 2026-08-18, versão
-- 20260818135701 no ledger. Este arquivo é o registro versionado do que foi
-- aplicado; NÃO rode `supabase db push` neste projeto (ver docs/decisoes.md).
--
-- Conta bancária passa a ser legível por quem lança e por quem paga, não só
-- por quem tem a aba Contas bancárias.
--
-- O sintoma, relatado pelo dono e medido antes de mexer: usuário que faz
-- lançamento e não tem `financeiro.contas-bancarias:ver` recebia LISTA VAZIA
-- no campo Conta bancária, sem erro nenhum. Medido com a permissão real de
-- Brenda Ciacci: 5 contas no banco, `tem_permissao('financeiro.contas-bancarias','ver')`
-- falso, e a policy de select devolvendo 0 linhas. O combobox simplesmente não
-- tinha opção, então não havia o que selecionar e nem o que reclamar. Dora
-- Silva estava no mesmo caso, e ela também paga.
--
-- Por que ampliar a policy em vez de conceder a aba: é o padrão que esta base
-- já usa nas outras tabelas de apoio do mesmo formulário. `categorias_financeiras`
-- é legível por `financeiro.categorias:ver` OU `compras.ordens:ver` OU
-- `compras.cotacoes:ver`; `condicoes_pagamento` idem; `formas_pagamento` é
-- livre. `contas_bancarias` era a única amarrada só à própria aba, e ficou para
-- trás quando as vizinhas foram ajustadas. Conceder a aba resolveria para estas
-- duas pessoas e deixaria o próximo usuário novo travado do mesmo jeito.
--
-- O que isto expõe, declarado: quem tem `ver` em lançamentos, pagamentos ou
-- aprovação de pagamentos passa a poder ler a linha inteira da conta, incluindo
-- agência, conta e saldo_inicial. A ABA continua fora do menu de quem não tem
-- `financeiro.contas-bancarias:ver`, porque o menu é montado por
-- `abasVisiveis`, não pela policy. Decisão do dono em 18/08/2026, ciente disso.
-- Quem paga já descobria o saldo por outro caminho: `fn_pagar_parcela` recusa
-- com a mensagem "saldo atual R$ x" quando não há saldo.
--
-- Fora do escopo de propósito: `financeiro.conciliacao` e
-- `financeiro.contas-receber` também usam conta bancária e NÃO entraram aqui,
-- porque o pedido foi lançamento e pagamento. Se travar para alguém, é o mesmo
-- conserto, um OR a mais.
--
-- Rollback: recriar a policy com o `using` de antes, só
-- `(select public.tem_permissao('financeiro.contas-bancarias','ver'))`.
-- Nada além da policy de SELECT mudou.

drop policy if exists contas_bancarias_select on public.contas_bancarias;

create policy contas_bancarias_select on public.contas_bancarias
  for select to authenticated
  using (
    (select public.tem_permissao('financeiro.contas-bancarias', 'ver'))
    or (select public.tem_permissao('financeiro.lancamentos', 'ver'))
    or (select public.tem_permissao('financeiro.pagamentos', 'ver'))
    or (select public.tem_permissao('financeiro.aprovacao-pagamentos', 'ver'))
  );

do $$
declare v_qual text; v_roles text; v_cmds text;
begin
  select qual, roles::text into v_qual, v_roles
  from pg_policies
  where tablename = 'contas_bancarias' and cmd = 'SELECT';

  if v_qual is null then
    raise exception 'a policy de select de contas_bancarias desapareceu';
  end if;
  if v_roles <> '{authenticated}' then
    raise exception 'a policy de select mudou de role: %', v_roles;
  end if;
  if v_qual not like '%financeiro.lancamentos%'
     or v_qual not like '%financeiro.pagamentos%'
     or v_qual not like '%financeiro.aprovacao-pagamentos%'
     or v_qual not like '%financeiro.contas-bancarias%' then
    raise exception 'a policy de select nao tem os quatro recursos: %', v_qual;
  end if;

  select string_agg(distinct cmd, ',' order by cmd) into v_cmds
  from pg_policies where tablename = 'contas_bancarias';
  if v_cmds <> 'INSERT,SELECT,UPDATE' then
    raise exception 'as policies de contas_bancarias mudaram de conjunto: %', v_cmds;
  end if;

  if exists (
    select 1 from information_schema.role_table_grants
    where table_schema = 'public' and table_name = 'contas_bancarias'
      and (grantee = 'anon' or (grantee = 'authenticated' and privilege_type = 'DELETE'))
  ) then
    raise exception 'grant indevido em contas_bancarias';
  end if;
end $$;
