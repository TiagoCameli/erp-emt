-- Excluir OC deixava lancamento orfao, e excluir lancamento nunca funcionava.
--
-- BUG 1: fn_excluir_ordem_compra pegava o lancamento da ordem com `limit 1`.
-- A OC-2026-0032 tinha QUATRO lancamentos (heranca do bug de duplicacao de
-- ontem, quando desaprovar deixava o lancamento vivo e reaprovar criava outro),
-- entao a exclusao levou um e deixou tres orfaos apontando para uma ordem que
-- nao existe mais. Na tela eles apareciam como "Cancelado" e "Previsto", sem
-- ordem, sem como sair.
--
-- BUG 2: fn_excluir_lancamento recusava QUALQUER lancamento de origem 'oc'
-- mandando "exclua pela ordem de compra". Para orfao isso e' beco sem saida: a
-- ordem nao existe mais. O botao de excluir do detalhe do lancamento nunca
-- funcionava nesse caso.
--
-- REGRA NOVA (pedida pelo Tiago): lancamento so pode ser excluido se o pagamento
-- NAO estiver aprovado nem pago. Antes o guard olhava so 'pago', ou seja, dava
-- para excluir dinheiro que ja estava autorizado a sair.

-- =====================================================================
-- 1. Excluir ordem de compra leva TODOS os lancamentos dela
-- =====================================================================

create or replace function public.fn_excluir_ordem_compra(p_id uuid)
returns void
language plpgsql
security definer
set search_path to ''
as $$
begin
  if not public.tem_permissao('compras.ordens', 'excluir') then
    raise exception 'Sem permissao para excluir ordens de compra';
  end if;

  if exists (select 1 from public.recebimentos r where r.ordem_compra_id = p_id) then
    raise exception 'Nao da para excluir: esta ordem de compra ja tem recebimento registrado';
  end if;

  -- Agora olha 'aprovado' tambem: excluir ordem cujo pagamento ja foi
  -- autorizado seria apagar dinheiro liberado para sair.
  if exists (
    select 1
    from public.lancamentos l
    join public.lancamento_parcelas p on p.lancamento_id = l.id
    where l.origem = 'oc' and l.origem_id = p_id
      and p.status in ('aprovado', 'pago')
  ) then
    raise exception 'Nao da para excluir: o pagamento desta ordem ja foi aprovado ou pago. Desaprove ou estorne o pagamento antes';
  end if;

  if exists (
    select 1
    from public.extrato_transacoes t
    join public.lancamento_parcelas p on p.id = t.parcela_id
    join public.lancamentos l on l.id = p.lancamento_id
    where l.origem = 'oc' and l.origem_id = p_id
  ) then
    raise exception 'Nao da para excluir: esta ordem tem parcela conciliada';
  end if;

  -- TODOS, sem `limit 1`: era isso que deixava orfao quando a ordem tinha mais
  -- de um lancamento. As parcelas vao na cascata da FK.
  delete from public.lancamentos
  where origem = 'oc' and origem_id = p_id;

  delete from public.ordens_compra where id = p_id;
end;
$$;

revoke all on function public.fn_excluir_ordem_compra(uuid) from public;
grant execute on function public.fn_excluir_ordem_compra(uuid) to authenticated;

-- =====================================================================
-- 2. Excluir lancamento: a regra e o pagamento, nao a origem
-- =====================================================================
-- Lancamento de OC continua sendo excluido PELA ordem quando a ordem existe (o
-- contrario deixaria a ordem aprovada sem registro financeiro e sem como
-- regerar). Se a ordem nao existe mais, o lancamento e' orfao e sai por aqui.

create or replace function public.fn_excluir_lancamento(p_id uuid)
returns void
language plpgsql
security definer
set search_path to ''
as $$
declare
  v_origem text;
  v_origem_id uuid;
  v_ordem_existe boolean;
begin
  if not public.tem_permissao('financeiro.lancamentos', 'excluir') then
    raise exception 'Sem permissao para excluir lancamentos';
  end if;

  select origem, origem_id into v_origem, v_origem_id
  from public.lancamentos where id = p_id;

  if v_origem is null then
    raise exception 'Lancamento nao encontrado';
  end if;

  -- A regra que o Tiago pediu: aprovado ou pago nao exclui.
  if exists (
    select 1 from public.lancamento_parcelas p
    where p.lancamento_id = p_id and p.status in ('aprovado', 'pago')
  ) then
    raise exception 'Nao da para excluir: o pagamento deste lancamento ja foi aprovado ou pago. Desaprove ou estorne o pagamento antes';
  end if;

  if exists (
    select 1 from public.extrato_transacoes t
    join public.lancamento_parcelas p on p.id = t.parcela_id
    where p.lancamento_id = p_id
  ) then
    raise exception 'Nao da para excluir: este lancamento tem parcela conciliada';
  end if;

  if v_origem = 'diaria' then
    raise exception 'Nao da para excluir aqui: este lancamento veio de uma diaria. Exclua pela diaria';
  end if;

  if v_origem = 'oc' then
    select exists (select 1 from public.ordens_compra o where o.id = v_origem_id)
    into v_ordem_existe;

    if v_ordem_existe then
      raise exception 'Nao da para excluir aqui: este lancamento e de uma ordem de compra. Exclua pela ordem de compra';
    end if;
    -- Ordem nao existe mais: orfao, e sai por aqui.
  end if;

  delete from public.lancamentos where id = p_id;
end;
$$;

revoke all on function public.fn_excluir_lancamento(uuid) from public;
grant execute on function public.fn_excluir_lancamento(uuid) to authenticated;

-- =====================================================================
-- 3. Limpeza dos orfaos que o bug 1 deixou
-- =====================================================================
-- LAN-2026-0015, LAN-2026-0025 e LAN-2026-0026, todos da OC-2026-0032 (ja
-- excluida). Nenhum tem parcela paga nem conciliada. Sao restos do teste de
-- R$ 1,00 e do bug de duplicacao; o Tiago pediu para sairem.
--
-- Feito por numero e conferindo que a ordem sumiu, para nao levar nada vivo.

delete from public.lancamentos l
where l.origem = 'oc'
  and l.numero in ('LAN-2026-0015', 'LAN-2026-0025', 'LAN-2026-0026')
  and not exists (
    select 1 from public.ordens_compra o where o.id = l.origem_id
  )
  and not exists (
    select 1 from public.lancamento_parcelas p
    where p.lancamento_id = l.id and p.status = 'pago'
  )
  and not exists (
    select 1 from public.extrato_transacoes t
    join public.lancamento_parcelas p on p.id = t.parcela_id
    where p.lancamento_id = l.id
  );

notify pgrst, 'reload schema';
