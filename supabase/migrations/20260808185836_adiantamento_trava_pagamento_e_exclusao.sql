-- Aplicada em produção pelo MCP (apply_migration) em 2026-08-08, versão
-- 20260808185836 no ledger. Este arquivo é o registro versionado do que foi
-- aplicado; NÃO rode `supabase db push` neste projeto (ver docs/decisoes.md).
--
-- Task 6 do Bloco 8a, parte 2 de 2.

-- Predicado puro (espelha os dois criterios da fn_excluir_lancamento: parcela
-- aprovada/paga, ou parcela conciliada em extrato_transacoes), embrulhado em
-- security definer para nao herdar o "buraco" das RLS de lancamento_parcelas /
-- extrato_transacoes: quem tem so rh.adiantamentos nao tem "ver" em
-- financeiro.lancamentos nem financeiro.conciliacao, entao uma subconsulta
-- crua dentro da policy de rh_adiantamentos enxergaria zero linhas e a trava
-- passaria sempre "false" pra esse perfil. Mesma razao de tem_permissao() e
-- fn_competencia_fechada() serem definer.
create or replace function public.fn_adiantamento_pagamento_comprometido(p_lancamento_id uuid)
returns boolean
language sql
stable
security definer
set search_path to ''
as $function$
  select exists (
    select 1
    from public.lancamento_parcelas pa
    left join public.extrato_transacoes et on et.parcela_id = pa.id
    where pa.lancamento_id = p_lancamento_id
      and (pa.status in ('aprovado', 'pago') or et.id is not null)
  );
$function$;

comment on function public.fn_adiantamento_pagamento_comprometido(uuid) is
  'True quando o lancamento do adiantamento tem parcela aprovada, paga ou conciliada. Security definer de proposito: bypassa a RLS de lancamento_parcelas/extrato_transacoes, que um perfil so-rh.adiantamentos nao enxerga. Usada pela RLS de UPDATE de rh_adiantamentos, pela fn_excluir_adiantamento e pela Server Action (garantirEmAberto). Task 6 do Bloco 8a.';

revoke all on function public.fn_adiantamento_pagamento_comprometido(uuid) from public;
grant execute on function public.fn_adiantamento_pagamento_comprometido(uuid) to authenticated;

-- Versao em lote da mesma checagem, para a listagem (evita N+1 RPC por linha).
create or replace function public.fn_adiantamentos_comprometidos(p_lancamento_ids uuid[])
returns uuid[]
language sql
stable
security definer
set search_path to ''
as $function$
  select coalesce(array_agg(distinct pa.lancamento_id), '{}'::uuid[])
  from public.lancamento_parcelas pa
  left join public.extrato_transacoes et on et.parcela_id = pa.id
  where pa.lancamento_id = any(p_lancamento_ids)
    and (pa.status in ('aprovado', 'pago') or et.id is not null);
$function$;

comment on function public.fn_adiantamentos_comprometidos(uuid[]) is
  'Mesmo criterio de fn_adiantamento_pagamento_comprometido, em lote: devolve os lancamento_id (dentre os informados) com pagamento comprometido. Usada pela listagem de adiantamentos para esconder editar/excluir sem 1 RPC por linha. Task 6 do Bloco 8a.';

revoke all on function public.fn_adiantamentos_comprometidos(uuid[]) from public;
grant execute on function public.fn_adiantamentos_comprometidos(uuid[]) to authenticated;

-- Trava de UPDATE: alem de fora da folha, o lancamento do adiantamento nao
-- pode ter pagamento comprometido. Editar continua sendo update direto na
-- tabela (sem fn definer), entao a RLS e quem garante isso de verdade.
alter policy rh_adiant_update on public.rh_adiantamentos
  using (
    (select public.tem_permissao('rh.adiantamentos', 'editar'))
    and folha_id is null
    and not public.fn_adiantamento_pagamento_comprometido(lancamento_id)
  )
  with check (
    (select public.tem_permissao('rh.adiantamentos', 'editar'))
    and folha_id is null
    and not public.fn_adiantamento_pagamento_comprometido(lancamento_id)
  );

-- Excluir passa a ser so pela fn_excluir_adiantamento: ela apaga o
-- adiantamento e o lancamento junto, na mesma transacao. Um delete direto
-- pela RLS (que so olhava folha_id) apagaria so o adiantamento e deixaria o
-- lancamento orfao.
drop policy if exists rh_adiant_delete on public.rh_adiantamentos;
revoke delete on public.rh_adiantamentos from authenticated;

-- Criar tambem passa a ser so pela fn_registrar_adiantamento: um insert
-- direto criaria adiantamento sem lancamento, o bug que a Task 6 resolve.
drop policy if exists rh_adiant_insert on public.rh_adiantamentos;
revoke insert on public.rh_adiantamentos from authenticated;

create or replace function public.fn_excluir_adiantamento(p_id uuid)
returns void
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_folha uuid;
  v_lanc uuid;
begin
  if not public.tem_permissao('rh.adiantamentos', 'excluir') then
    raise exception 'Sem permissao para excluir adiantamentos';
  end if;

  select folha_id, lancamento_id into v_folha, v_lanc
  from public.rh_adiantamentos where id = p_id for update;

  if not found then
    raise exception 'Adiantamento nao encontrado';
  end if;

  if v_folha is not null then
    raise exception 'Adiantamento ja incluido numa folha';
  end if;

  if v_lanc is not null then
    -- Trava as parcelas do lancamento antes de ler o status (mesma razao da
    -- fn_desaprovar_folha): sem lock, uma parcela sendo aprovada em paralelo
    -- passaria pela leitura como pendente.
    perform 1 from public.lancamento_parcelas where lancamento_id = v_lanc for update;

    if public.fn_adiantamento_pagamento_comprometido(v_lanc) then
      raise exception 'Nao da para excluir: o pagamento deste adiantamento ja foi aprovado, pago ou conciliado. Estorne o pagamento antes';
    end if;
  end if;

  -- Apaga o adiantamento primeiro: solta o vinculo (rh_adiantamentos.lancamento_id
  -- referencia lancamentos) antes de apagar o lancamento, senao a FK barra.
  delete from public.rh_adiantamentos where id = p_id;

  if v_lanc is not null then
    delete from public.lancamentos where id = v_lanc;
  end if;
end;
$function$;

comment on function public.fn_excluir_adiantamento(uuid) is
  'Exclui um adiantamento e o lancamento dele junto, na mesma transacao. Recusa se ja esta numa folha ou se o pagamento foi aprovado, pago ou conciliado (mesmo criterio da fn_excluir_lancamento). E a origem que a fn_excluir_lancamento manda usar para origem=adiantamento. Task 6 do Bloco 8a.';

revoke all on function public.fn_excluir_adiantamento(uuid) from public;
grant execute on function public.fn_excluir_adiantamento(uuid) to authenticated;
