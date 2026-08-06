-- Define a conta bancaria de VARIOS lancamentos numa transacao.
--
-- Reusa a regra da fn_definir_conta_lancamento (migration
-- 20260730210001_conta_bancaria_portao_da_aprovacao.sql) e nao reimplementa nada
-- dela: mesma permissao, mesma exigencia de conta ativa, mesmo `status <> 'pago'`,
-- e o mesmo fn_aplicar_regra_pagamento no fim, que e o que faz dinheiro e cartao
-- andarem quando a conta aparece.
--
-- DIFERENCA DE PROPOSITO, decidida pelo Tiago em 06/08/2026: o lote SO PREENCHE
-- VAZIO. O `conta_bancaria_id is null` no where do update e o que garante isso no
-- nivel da PARCELA, e nao so do lancamento: lancamento "parcial" (uma parcela com
-- conta, duas sem) e completado nas vazias e NAO perde a que ja tinha. Trocar
-- conta ja definida continua sendo um a um, no detalhe do lancamento.
--
-- TETO de 500 por chamada: sem ele um clique vira update em milhares de parcelas
-- dentro de uma transacao, segurando lock numa tabela que o resto da empresa esta
-- usando. O mesmo numero esta em src/modules/financeiro/lancamentos/lote.ts, e um
-- teste amarra os dois.
create or replace function public.fn_definir_conta_lancamentos_lote(
  p_lanc_ids uuid[],
  p_conta_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path to ''
as $$
declare
  v_ids uuid[];
  v_total int;
  v_existentes uuid[];
  v_elegiveis uuid[];
  v_com_conta int;
  v_sem_pendente int;
  v_id uuid;
begin
  if not public.tem_permissao('financeiro.lancamentos', 'editar') then
    raise exception 'Sem permissao para editar lancamentos';
  end if;

  -- Deduplica e tira nulo: id repetido na lista nao pode consumir o teto nem
  -- contar duas vezes no resumo, senao o numero que aparece para o usuario mente.
  select coalesce(array_agg(distinct x), '{}'::uuid[]) into v_ids
  from unnest(coalesce(p_lanc_ids, '{}'::uuid[])) as x
  where x is not null;

  v_total := coalesce(array_length(v_ids, 1), 0);
  if v_total = 0 then
    raise exception 'Nenhum lancamento informado';
  end if;
  if v_total > 500 then
    raise exception 'Limite de 500 lancamentos por vez (recebidos %)', v_total;
  end if;

  if p_conta_id is null then
    raise exception 'Selecione a conta bancaria';
  end if;
  if not exists (
    select 1 from public.contas_bancarias c where c.id = p_conta_id and c.ativo
  ) then
    raise exception 'Conta bancaria invalida ou inativa';
  end if;

  select coalesce(array_agg(l.id), '{}'::uuid[]) into v_existentes
  from public.lancamentos l where l.id = any(v_ids);

  -- Elegivel = tem ao menos uma parcela nao paga E sem conta.
  select coalesce(array_agg(distinct lp.lancamento_id), '{}'::uuid[])
  into v_elegiveis
  from public.lancamento_parcelas lp
  where lp.lancamento_id = any(v_existentes)
    and lp.status <> 'pago'
    and lp.conta_bancaria_id is null;

  -- Tem parcela pendente, mas todas ja com conta.
  select count(distinct lp.lancamento_id) into v_com_conta
  from public.lancamento_parcelas lp
  where lp.lancamento_id = any(v_existentes)
    and lp.status <> 'pago'
    and not (lp.lancamento_id = any(v_elegiveis));

  -- O resto: existe, mas nao tem nenhuma parcela em aberto (ja quitado).
  v_sem_pendente := coalesce(array_length(v_existentes, 1), 0)
    - coalesce(array_length(v_elegiveis, 1), 0)
    - v_com_conta;

  update public.lancamento_parcelas
  set conta_bancaria_id = p_conta_id
  where lancamento_id = any(v_elegiveis)
    and status <> 'pago'
    and conta_bancaria_id is null;

  -- Um por um de proposito: a regra de pagamento e por lancamento e pode mudar o
  -- status dele (dinheiro e cartao andam sozinhos quando a conta aparece).
  foreach v_id in array v_elegiveis loop
    perform public.fn_aplicar_regra_pagamento(v_id);
  end loop;

  return jsonb_build_object(
    'definidos', coalesce(array_length(v_elegiveis, 1), 0),
    'pulados_com_conta', v_com_conta,
    'pulados_sem_parcela_pendente', v_sem_pendente,
    'nao_encontrados', v_total - coalesce(array_length(v_existentes, 1), 0)
  );
end;
$$;

revoke all on function public.fn_definir_conta_lancamentos_lote(uuid[], uuid) from public;
grant execute on function public.fn_definir_conta_lancamentos_lote(uuid[], uuid) to authenticated;
