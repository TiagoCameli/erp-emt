-- =============================================================
-- Conciliacao 100% precisa, Bloco E: aceitar sugestoes seguras em lote
--
-- Pedido do Tiago (03/10/2026): a faixa 2 ("um clique com revisao"). A pessoa
-- revisa a lista de sugestoes seguras (paga em outra conta, em aberto
-- aprovada) e confirma; o lote casa com p_automatica = false, porque e
-- decisao humana: troca a conta ou da baixa, como no casar manual, e nunca
-- aplica ajuste de valor.
--
-- Sobrecarga fn_conciliacao_casar_lote(p_pares, p_automatica) SEM valor
-- padrao: a chamada atual, so com p_pares, continua resolvendo para a versao
-- de um parametro (o automatico), entao o codigo no ar nao muda.
-- =============================================================

create or replace function public.fn_conciliacao_casar_lote(p_pares jsonb, p_automatica boolean)
returns jsonb
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_par jsonb;
  v_casadas int := 0;
  v_falhas jsonb := '[]'::jsonb;
begin
  if not public.tem_permissao('financeiro.conciliacao', 'editar') then
    raise exception 'Sem permissao para conciliar';
  end if;
  if jsonb_typeof(p_pares) is distinct from 'array' then
    raise exception 'Lista de pares invalida';
  end if;

  for v_par in select * from jsonb_array_elements(p_pares) loop
    begin
      perform public.fn_conciliacao_casar(
        (v_par->>'transacao')::uuid,
        v_par->>'especie',
        (v_par->>'alvo')::uuid,
        coalesce(p_automatica, true),
        null::text
      );
      v_casadas := v_casadas + 1;
    exception when others then
      v_falhas := v_falhas || jsonb_build_object(
        'transacao', v_par->>'transacao', 'erro', sqlerrm);
    end;
  end loop;

  return jsonb_build_object('casadas', v_casadas, 'falhas', v_falhas);
end;
$function$;

revoke all on function public.fn_conciliacao_casar_lote(jsonb, boolean) from public, anon;
grant execute on function public.fn_conciliacao_casar_lote(jsonb, boolean) to authenticated;
