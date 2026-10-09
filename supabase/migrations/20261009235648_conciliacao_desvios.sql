-- Conciliacao: avisa quando um mes fechado mudou depois do fechamento (PR 1 do
-- controle total, 09/10/2026).
--
-- O fechamento grava o saldo do app no ultimo dia do mes (saldo_app). As
-- travas por data impedem o caminho normal de mexer nele; o que sobra (carga,
-- migration, ajuste direto no banco, mudanca de natureza de categoria que tira
-- ou poe parcela no caixa) so aparece se alguem recalcular. Esta funcao
-- recalcula cada mes fechado ativo da conta e devolve so os que mudaram.
-- Fechamento sem saldo_app gravado (antigo) nao entra: sem base, nao ha desvio.

create or replace function public.fn_conciliacao_desvios(p_conta_id uuid)
 returns table(mes date, saldo_fechamento numeric, saldo_agora numeric, diferenca numeric)
 language plpgsql
 stable security definer
 set search_path to ''
as $function$
begin
  if not public.tem_permissao('financeiro.conciliacao', 'ver') then
    raise exception 'Sem permissao para ver a conciliacao';
  end if;
  if not public.fn_pode_ver_saldo(p_conta_id) then
    return;
  end if;
  return query
    select x.mes, x.saldo_app, x.agora, round(x.agora - x.saldo_app, 2)
      from (
        select f.mes, f.saldo_app,
               public.fn_conciliacao_saldo_app_interno(
                 f.conta_bancaria_id, ((f.mes + interval '1 month')::date - 1)) as agora
          from public.conciliacao_fechamentos f
         where f.conta_bancaria_id = p_conta_id
           and f.reaberto_em is null
           and f.saldo_app is not null
      ) x
     where x.agora is distinct from x.saldo_app
     order by x.mes;
end;
$function$;

revoke execute on function public.fn_conciliacao_desvios(uuid) from public, anon;
grant execute on function public.fn_conciliacao_desvios(uuid) to authenticated;
