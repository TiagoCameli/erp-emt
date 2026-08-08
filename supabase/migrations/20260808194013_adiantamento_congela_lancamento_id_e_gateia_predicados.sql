-- Aplicada em produção pelo MCP (apply_migration) em 2026-08-08, versão
-- 20260808194013 no ledger. Este arquivo é o registro versionado do que foi
-- aplicado; NÃO rode `supabase db push` neste projeto (ver docs/decisoes.md).
--
-- Task 6 do Bloco 8a, fix round 1 (achado CRITICAL de revisão).

-- Fix round 1 da Task 6. Achado CRITICAL do revisor: authenticated tinha
-- UPDATE na tabela inteira rh_adiantamentos, e a policy so checava folha_id
-- e pagamento comprometido na linha NOVA, sem fixar lancamento_id no valor
-- antigo. Repontar lancamento_id para o lancamento de outra origem (ex. nota
-- de fornecedor) passava pelo with check quando o alvo nao estava
-- comprometido, e dali fn_excluir_adiantamento apagava o lancamento errado.
-- Setar lancamento_id = null tambem passava, deixando a_pagar fantasma.
--
-- Correcao (mesmo contrato que rh_diarias/fn_fechar_diarias ja tem): trava
-- lancamento_id is null no using E no with check, e reforca com grant por
-- coluna (nunca a tabela inteira). Como todo adiantamento nasce com
-- lancamento via fn_registrar_adiantamento, lancamento_id nunca fica null
-- depois de criado: editar deixa de ter janela de uso real, por desenho.

-- 1) Gate fail-closed nos dois predicados: sem 'rh.adiantamentos':'ver',
-- devolve "comprometido" (true / todos os ids), nunca "livre". Retornar false
-- seria o mesmo fail-open que essas funcoes existem para evitar; raise
-- exception foi descartado porque a ordem de avaliacao de AND/OR no Postgres
-- nao e garantida (doc oficial), e esse predicado e chamado dentro da propria
-- policy de UPDATE lado a lado com tem_permissao('editar') - um raise
-- poderia estourar antes da checagem de permissao rodar, para uma role sem
-- 'editar' que nunca deveria nem chegar ali.
create or replace function public.fn_adiantamento_pagamento_comprometido(p_lancamento_id uuid)
returns boolean
language sql
stable
security definer
set search_path to ''
as $function$
  select case
    when not public.tem_permissao('rh.adiantamentos', 'ver') then true
    else exists (
      select 1
      from public.lancamento_parcelas pa
      left join public.extrato_transacoes et on et.parcela_id = pa.id
      where pa.lancamento_id = p_lancamento_id
        and (pa.status in ('aprovado', 'pago') or et.id is not null)
    )
  end;
$function$;

comment on function public.fn_adiantamento_pagamento_comprometido(uuid) is
  'True quando o lancamento do adiantamento tem parcela aprovada, paga ou conciliada, OU quando quem chamou nao tem rh.adiantamentos:ver (fail-closed: sem a permissao, trata como comprometido, nunca como livre). Security definer para bypassar a RLS de lancamento_parcelas/extrato_transacoes. Fix round 1 da Task 6 do Bloco 8a.';

create or replace function public.fn_adiantamentos_comprometidos(p_lancamento_ids uuid[])
returns uuid[]
language sql
stable
security definer
set search_path to ''
as $function$
  select case
    when not public.tem_permissao('rh.adiantamentos', 'ver') then p_lancamento_ids
    else coalesce(
      (select array_agg(distinct pa.lancamento_id)
       from public.lancamento_parcelas pa
       left join public.extrato_transacoes et on et.parcela_id = pa.id
       where pa.lancamento_id = any(p_lancamento_ids)
         and (pa.status in ('aprovado', 'pago') or et.id is not null)),
      '{}'::uuid[]
    )
  end;
$function$;

comment on function public.fn_adiantamentos_comprometidos(uuid[]) is
  'Versao em lote de fn_adiantamento_pagamento_comprometido, mesmo fail-closed: sem rh.adiantamentos:ver devolve os proprios ids recebidos (trata todos como comprometidos). Fix round 1 da Task 6 do Bloco 8a.';

revoke all on function public.fn_adiantamento_pagamento_comprometido(uuid) from public;
grant execute on function public.fn_adiantamento_pagamento_comprometido(uuid) to authenticated;
revoke all on function public.fn_adiantamentos_comprometidos(uuid[]) from public;
grant execute on function public.fn_adiantamentos_comprometidos(uuid[]) to authenticated;

-- 2) Congela lancamento_id e folha_id no UPDATE. Trava dupla: RLS (lancamento_id
-- is null no using e no with check, dos dois lados nao da para repontar nem
-- zerar) e grant por coluna (cinto): authenticated so escreve os 5 campos que
-- editarAdiantamento de fato usa.
alter policy rh_adiant_update on public.rh_adiantamentos
  using (
    (select public.tem_permissao('rh.adiantamentos', 'editar'))
    and folha_id is null
    and lancamento_id is null
    and not public.fn_adiantamento_pagamento_comprometido(lancamento_id)
  )
  with check (
    (select public.tem_permissao('rh.adiantamentos', 'editar'))
    and folha_id is null
    and lancamento_id is null
    and not public.fn_adiantamento_pagamento_comprometido(lancamento_id)
  );

revoke update on public.rh_adiantamentos from authenticated;
grant update (colaborador_id, competencia, valor, data, descricao) on public.rh_adiantamentos to authenticated;

-- 3) fn_excluir_adiantamento ganha uma segunda rede, independente da correcao
-- acima: confere que o lancamento apontado e mesmo o do proprio adiantamento
-- (origem='adiantamento' e origem_id=p_id) antes de apagar. Defesa em
-- profundidade: mesmo que uma falha futura reabra o repontamento, esta funcao
-- nao apaga lancamento de outra origem.
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

comment on function public.fn_excluir_adiantamento(uuid) is
  'Exclui um adiantamento e o lancamento dele junto, na mesma transacao. Recusa se ja esta numa folha, se o lancamento apontado nao e mesmo o deste adiantamento (integridade, defesa em profundidade do fix round 1), ou se o pagamento foi aprovado, pago ou conciliado. Task 6 do Bloco 8a, fix round 1.';

revoke all on function public.fn_excluir_adiantamento(uuid) from public;
grant execute on function public.fn_excluir_adiantamento(uuid) to authenticated;

-- 4) Indice em lancamento_id, como as outras FKs que a trava usa (folha_id,
-- rh_diarias.lancamento_id, folha_itens/folha_guias.lancamento_id) ja tem.
create index if not exists idx_rh_adiantamentos_lancamento_id on public.rh_adiantamentos (lancamento_id);

-- 5) Trava fail-closed da propria migration: recusa aplicar (na verdade,
-- confere DEPOIS de aplicado, dentro da mesma transacao da migration) se
-- authenticated ainda tiver UPDATE em lancamento_id ou folha_id.
do $$
begin
  if exists (
    select 1 from information_schema.column_privileges
    where table_schema = 'public' and table_name = 'rh_adiantamentos'
      and grantee = 'authenticated' and privilege_type = 'UPDATE'
      and column_name in ('lancamento_id', 'folha_id')
  ) then
    raise exception 'authenticated ainda tem UPDATE em lancamento_id ou folha_id de rh_adiantamentos: o fix nao pegou';
  end if;

  if exists (
    select 1 from information_schema.role_table_grants
    where table_schema = 'public' and table_name = 'rh_adiantamentos'
      and grantee = 'authenticated' and privilege_type = 'INSERT'
  ) then
    raise exception 'authenticated tem INSERT em rh_adiantamentos: deveria ser so pela fn_registrar_adiantamento';
  end if;

  if exists (
    select 1 from information_schema.role_table_grants
    where table_schema = 'public' and table_name = 'rh_adiantamentos'
      and grantee = 'authenticated' and privilege_type = 'DELETE'
  ) then
    raise exception 'authenticated tem DELETE em rh_adiantamentos: deveria ser so pela fn_excluir_adiantamento';
  end if;
end $$;
