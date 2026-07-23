-- Feature #7 (Task 1): coluna `data_programada` em lancamento_parcelas +
-- função `fn_programar_pagamento`, base da fila de pagamento programado.
--
-- Lido ao vivo (MCP, 2026-07-23) antes de mexer:
--   lancamento_parcelas_status_check: CHECK (status = ANY ('pendente',
--   'aprovado', 'pago', 'cancelado')) — confirma os 4 valores esperados.
--   fn_pagar_parcela: security definer, set search_path = '', checa
--   tem_permissao(recurso, acao), busca status por id, raise exception se
--   não encontrada ou status incompatível, update pontual. Esta função
--   espelha exatamente esse padrão.
--   authenticated só tem SELECT em lancamento_parcelas (sem INSERT/UPDATE):
--   todo write passa por RPC security definer, por isso `data_programada`
--   só pode ser gravada via fn_programar_pagamento.
--
-- Regra: só parcela em status 'aprovado' (aprovada, ainda não paga) pode ser
-- programada. Recurso de permissão: financeiro.programados / ação editar
-- (cadastro do recurso em config/recursos.ts fica pra tarefa de UI/fila).
--
-- Rollback:
--   drop function if exists public.fn_programar_pagamento(uuid, date);
--   alter table public.lancamento_parcelas drop column if exists data_programada;

alter table public.lancamento_parcelas
  add column data_programada date;

create or replace function public.fn_programar_pagamento(
  p_parcela_id uuid,
  p_data_programada date
) returns void
language plpgsql
security definer
set search_path = ''
as $function$
declare v_status text;
begin
  if not public.tem_permissao('financeiro.programados', 'editar') then
    raise exception 'Sem permissao para programar pagamentos';
  end if;

  select status into v_status from public.lancamento_parcelas where id = p_parcela_id;
  if v_status is null then
    raise exception 'Parcela nao encontrada';
  end if;
  if v_status <> 'aprovado' then
    raise exception 'So da para programar parcela aprovada e nao paga';
  end if;

  update public.lancamento_parcelas
  set data_programada = p_data_programada
  where id = p_parcela_id;
end;
$function$;

revoke all on function public.fn_programar_pagamento(uuid, date) from public, anon;
grant execute on function public.fn_programar_pagamento(uuid, date) to authenticated;
