-- Estorno de recebimento: a RPC passa a saber de que lado do caixa ela está.
--
-- `fn_estornar_pagamento` já devolvia a parcela de recebimento ao estado certo
-- (`pendente`, não `aprovado`), mas duas coisas nela só valiam para o a pagar:
--
--   1. A PERMISSÃO era fixa em `financeiro.pagamentos` / `excluir`. Quem cuida
--      de recebimento e não mexe em pagamento não conseguia estornar, e quem
--      tinha `excluir` em Pagamentos estornava recebimento sem ter uma única
--      permissão de Recebimentos. A função é SECURITY DEFINER: esse `if` É a
--      barreira, não um enfeite na frente de outra.
--
--   2. `conta_bancaria_id = null`. No a pagar a conta só é escrita na hora de
--      pagar, então limpar é desfazer. No a RECEBER a coluna é a CONTA DE
--      DESTINO, gravada no insert da parcela lá em
--      20260819170000_recebimentos_com_cliente_conta_e_documento.sql e
--      obrigatória no formulário. Estornar apagava um campo que o cadastro
--      exige e devolvia a parcela para a fila sem conta.
--
-- O saldo não depende disso: ele se deriva de parcela com `status = 'pago'`, e
-- a estornada deixa de ser paga. Manter a conta na parcela em aberto não soma
-- nada em conta nenhuma. Ver [[project_erp_emt_recebimentos]] e
-- [[project_erp_emt_dinheiro_e_da_parcela]].
--
-- A leitura da parcela sobe para ANTES da permissão porque agora é o tipo dela
-- que decide qual permissão cobrar. É a mesma ordem que `fn_pagar_parcela` já
-- usa no par desta função, pelo mesmo motivo.
--
-- Assinatura inalterada, então é `create or replace` -- mas o `revoke`/`grant`
-- vem junto de novo: função recriada nasce com EXECUTE para PUBLIC, e um grant
-- sem o revoke na frente não fecha nada.
-- Ver [[feedback_grant_sem_revoke_nao_fecha_nada]].

create or replace function public.fn_estornar_pagamento(p_parcela_id uuid)
returns void
language plpgsql
security definer
set search_path to ''
as $function$
declare v_status text; v_lanc uuid; v_tipo text;
begin
  select p.status, p.lancamento_id, l.tipo into v_status, v_lanc, v_tipo
    from public.lancamento_parcelas p join public.lancamentos l on l.id = p.lancamento_id
    where p.id = p_parcela_id;
  if v_status is null then raise exception 'Parcela nao encontrada'; end if;

  if v_tipo = 'a_pagar' then
    if not public.tem_permissao('financeiro.pagamentos', 'excluir') then
      raise exception 'Sem permissao para estornar pagamentos';
    end if;
    if v_status <> 'pago' then raise exception 'Esta parcela nao esta paga'; end if;
  else
    if not public.tem_permissao('financeiro.recebimentos', 'excluir') then
      raise exception 'Sem permissao para estornar recebimentos';
    end if;
    if v_status <> 'pago' then raise exception 'Este recebimento nao esta baixado'; end if;
  end if;

  if exists (select 1 from public.extrato_transacoes t where t.parcela_id = p_parcela_id) then
    if v_tipo = 'a_pagar' then
      raise exception 'Nao da para estornar: este pagamento esta conciliado. Desfaca a conciliacao primeiro';
    else
      raise exception 'Nao da para estornar: este recebimento esta conciliado. Desfaca a conciliacao primeiro';
    end if;
  end if;

  update public.lancamento_parcelas
    set status = case when v_tipo = 'a_pagar' then 'aprovado' else 'pendente' end,
        -- Só o a pagar perde a conta: no a receber ela é o destino escolhido no
        -- cadastro, não um resto da baixa.
        conta_bancaria_id = case when v_tipo = 'a_pagar' then null else conta_bancaria_id end,
        data_pagamento = null, pago_por = null, pago_em = null,
        desconto = 0, juros = 0, outras_despesas = 0
    where id = p_parcela_id;
  perform public.fn_recalcular_status_lancamento(v_lanc);
end $function$;

comment on function public.fn_estornar_pagamento(uuid) is
  'Desfaz a baixa de uma parcela paga, dos dois lados do caixa. Cobra financeiro.pagamentos/excluir no a pagar e financeiro.recebimentos/excluir no a receber. Recusa parcela conciliada. No a receber preserva a conta de destino, que e dado do cadastro e nao da baixa.';

revoke all on function public.fn_estornar_pagamento(uuid) from public, anon;
grant execute on function public.fn_estornar_pagamento(uuid) to authenticated;
