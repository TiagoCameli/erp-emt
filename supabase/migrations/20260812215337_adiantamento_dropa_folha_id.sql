-- Aplicada em produção pelo MCP (apply_migration) em 2026-08-12, versão
-- 20260812215337 no ledger. Este arquivo é o registro versionado do que foi
-- aplicado; NÃO rode `supabase db push` neste projeto (ver docs/decisoes.md).
--
-- Task 3 do adiantamento parcelado, parte 3 de 3 (CONTRACT): a coluna
-- `rh_adiantamentos.folha_id` deixa de existir. O vínculo com a folha passou a
-- viver na parcela (`rh_adiantamento_parcelas.folha_id`), então "este
-- adiantamento já entrou em folha" virou "existe parcela descontada".
--
-- Tudo numa migration só, e nesta ordem, porque cada peça depende da anterior:
--   1. os dois predicados definer (o singular para a trava, o plural para a
--      listagem), que são o que a Server Action passa a consultar;
--   2. `fn_excluir_adiantamento`, que LIA a coluna e quebraria no drop;
--   3. a policy `rh_adiant_update`, que TAMBÉM lê a coluna: policy que
--      referencia coluna impede o `drop column`, não é só questão de correção;
--   4. só então o drop (que leva a FK e o índice da coluna com ele).

-- ============================================================================
-- 1. Predicados definer, fail-closed
-- ============================================================================
-- A policy de select de `rh_adiantamento_parcelas` exige `rh.adiantamentos:ver`.
-- Um perfil com `editar` (ou `excluir`) sem `ver` leria a tabela VAZIA, o
-- `exists` daria false e a trava falharia ABERTA: deixaria editar/excluir um
-- adiantamento já descontado em folha. Por isso a leitura vem daqui, definer,
-- e o gate devolve o lado SEGURO quando falta permissão: `true` = "está em
-- folha" = travado. Um `and tem_permissao(...)` dentro do where devolveria
-- false (= "não está em folha"), que é exatamente o fail-open que esta função
-- existe para evitar. Mesmo desenho de `fn_adiantamento_pagamento_comprometido`
-- (Bloco 8a).
create or replace function public.fn_adiantamento_em_folha(p_adiantamento_id uuid)
returns boolean
language sql
stable
security definer
set search_path to ''
as $function$
  select case
    when p_adiantamento_id is null then true
    when not public.tem_permissao('rh.adiantamentos', 'ver') then true
    else exists (
      select 1
      from public.rh_adiantamento_parcelas pa
      where pa.adiantamento_id = p_adiantamento_id
        and pa.folha_id is not null
    )
  end;
$function$;

revoke all on function public.fn_adiantamento_em_folha(uuid) from public;
grant execute on function public.fn_adiantamento_em_folha(uuid) to authenticated;

-- Versão em lote para a listagem: 1 RPC, não 1 por linha. Mesmo gate
-- fail-closed, e aqui o lado seguro é devolver TODOS os ids como "em folha"
-- (toda linha aparece travada), espelhando `fn_adiantamentos_comprometidos`.
create or replace function public.fn_adiantamentos_em_folha(p_adiantamento_ids uuid[])
returns uuid[]
language sql
stable
security definer
set search_path to ''
as $function$
  select case
    when not public.tem_permissao('rh.adiantamentos', 'ver') then p_adiantamento_ids
    else coalesce(
      (select array_agg(distinct pa.adiantamento_id)
       from public.rh_adiantamento_parcelas pa
       where pa.adiantamento_id = any(p_adiantamento_ids)
         and pa.folha_id is not null),
      '{}'::uuid[]
    )
  end;
$function$;

revoke all on function public.fn_adiantamentos_em_folha(uuid[]) from public;
grant execute on function public.fn_adiantamentos_em_folha(uuid[]) to authenticated;

-- ============================================================================
-- 2. fn_excluir_adiantamento sem a coluna
-- ============================================================================
-- Recriada a partir da definição viva (md5(prosrc) =
-- 902470e7bd313827a9f3d79300fc7428). Só duas mudanças: `v_folha` sai do
-- `declare` e do `select` (ficaria sem uso), e a recusa "já incluído numa
-- folha" vira "já teve parcela descontada em folha". O resto é byte a byte o
-- que estava lá: a guarda de permissão, o `for update`, o `not found`, a
-- conferência de que o lançamento pertence a este adiantamento, o lock das
-- parcelas do lançamento e a trava de pagamento comprometido.
create or replace function public.fn_excluir_adiantamento(p_id uuid)
returns void
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_lanc uuid;
begin
  if not public.tem_permissao('rh.adiantamentos', 'excluir') then
    raise exception 'Sem permissao para excluir adiantamentos';
  end if;

  select lancamento_id into v_lanc
  from public.rh_adiantamentos where id = p_id for update;

  if not found then
    raise exception 'Adiantamento nao encontrado';
  end if;

  if exists (
    select 1 from public.rh_adiantamento_parcelas
    where adiantamento_id = p_id and folha_id is not null
  ) then
    raise exception 'Nao da para excluir: este adiantamento ja teve parcela descontada em folha. Desaprove a folha e regere antes de excluir';
  end if;

  if v_lanc is not null then
    if not exists (
      select 1 from public.lancamentos
      where id = v_lanc and origem = 'adiantamento' and origem_id = p_id
    ) then
      raise exception 'Inconsistencia: o lancamento vinculado nao pertence a este adiantamento';
    end if;

    perform 1 from public.lancamento_parcelas where lancamento_id = v_lanc for update;

    if public.fn_adiantamento_pagamento_comprometido(v_lanc) then
      raise exception 'Nao da para excluir: o pagamento deste adiantamento ja foi aprovado, pago ou conciliado. Estorne o pagamento antes';
    end if;
  end if;

  delete from public.rh_adiantamentos where id = p_id;

  if v_lanc is not null then
    delete from public.lancamentos where id = v_lanc;
  end if;
end;
$function$;

-- ============================================================================
-- 3. A policy de update, sem a coluna
-- ============================================================================
-- Idêntica à anterior, trocando `folha_id is null` por
-- `not fn_adiantamento_em_folha(id)`. `lancamento_id is null` continua sendo a
-- trava que na prática fecha o editar (todo adiantamento nasce com lançamento);
-- a trava de folha segue valendo para registro antigo sem lançamento. Sem essa
-- recriação o `drop column` abaixo falharia: a policy depende da coluna.
drop policy rh_adiant_update on public.rh_adiantamentos;

create policy rh_adiant_update on public.rh_adiantamentos
as permissive
for update
to authenticated
using (
  (select public.tem_permissao('rh.adiantamentos', 'editar'))
  and not public.fn_adiantamento_em_folha(id)
  and lancamento_id is null
  and not public.fn_adiantamento_pagamento_comprometido(lancamento_id)
)
with check (
  (select public.tem_permissao('rh.adiantamentos', 'editar'))
  and not public.fn_adiantamento_em_folha(id)
  and lancamento_id is null
  and not public.fn_adiantamento_pagamento_comprometido(lancamento_id)
);

-- ============================================================================
-- 4. O drop (leva a FK rh_adiantamentos_folha_id_fkey e o índice
--    idx_rh_adiantamentos_folha_id com ele)
-- ============================================================================
alter table public.rh_adiantamentos drop column folha_id;
