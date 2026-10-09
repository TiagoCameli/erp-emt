-- =============================================================
-- Conciliacao: excluir ancora de saldo
--
-- Pedido do Tiago (09/10/2026): poder apagar ancoras em Importacoes. Ate
-- aqui so dava para gravar ou substituir pela mesma data; uma ancora errada
-- (ou o LEDGERBAL de um OFX que ja nao vale) ficava para sempre encadeando
-- o saldo do banco.
--
-- fn_conciliacao_excluir_ancora(id): mesmas travas de registrar (editar a
-- conciliacao, ver o saldo da conta). Recusa quando o mes da ancora esta
-- fechado, ou o mes seguinte quando ela e do ultimo dia (a ancora de 31/08
-- abre setembro). A trilha fica no fn_audit da tabela.
-- =============================================================

create or replace function public.fn_conciliacao_excluir_ancora(p_id uuid)
returns void
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_a public.conciliacao_saldos_ancora;
begin
  if not public.tem_permissao('financeiro.conciliacao', 'editar') then
    raise exception 'Sem permissao para conciliar';
  end if;
  select * into v_a from public.conciliacao_saldos_ancora where id = p_id for update;
  if not found then
    raise exception 'Ancora nao encontrada';
  end if;
  if not public.fn_pode_ver_saldo(v_a.conta_bancaria_id) then
    raise exception 'Sem permissao para ver o saldo desta conta';
  end if;
  perform public.fn_conciliacao_exigir_mes_aberto(v_a.conta_bancaria_id, v_a.data);
  perform public.fn_conciliacao_exigir_mes_aberto(v_a.conta_bancaria_id, v_a.data + 1);
  delete from public.conciliacao_saldos_ancora where id = p_id;
end;
$function$;

revoke all on function public.fn_conciliacao_excluir_ancora(uuid) from public, anon;
grant execute on function public.fn_conciliacao_excluir_ancora(uuid) to authenticated;
