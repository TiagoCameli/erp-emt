-- Revisao do PR 1 (09/10/2026): a regra "ate o ultimo mes fechado" vale para
-- TODA operacao da conciliacao, nao so para pagar/transferir.
--
-- Casar, desfazer, lancar, regras automaticas, excluir linha do OFX, trocar
-- conta, estorno e devolucao chamam fn_conciliacao_exigir_mes_aberto, que so
-- olhava o mes exato do movimento. Casar uma parcela de agosto com setembro
-- fechado mudava o saldo do fim de setembro (e excluir linha do OFX de agosto
-- muda o saldo do banco encadeado ate setembro). Em vez de remendar as 13
-- funcoes, a trava antiga passa a aplicar tambem a regra nova: a proxima funcao
-- da conciliacao que chamar a trava ja nasce certa. A mensagem do mes exato
-- continua quando e o proprio mes que esta fechado.
--
-- Tambem: excluir posicao de aplicacao ganha a trava que gravar ja tinha, e as
-- duas travas deixam de ser executaveis por anon (o erro devolve nome da conta).

create or replace function public.fn_conciliacao_exigir_mes_aberto(p_conta_id uuid, p_data date)
 returns void
 language plpgsql
 stable security definer
 set search_path to ''
as $function$
declare
  v_nome text;
  v_mes date := date_trunc('month', p_data)::date;
  v_meses text[] := array['janeiro','fevereiro','marco','abril','maio','junho','julho','agosto','setembro','outubro','novembro','dezembro'];
begin
  if p_conta_id is null or p_data is null then return; end if;
  if exists (
    select 1 from public.conciliacao_fechamentos f
    where f.conta_bancaria_id = p_conta_id and f.mes = v_mes and f.reaberto_em is null
  ) then
    select nome into v_nome from public.contas_bancarias where id = p_conta_id;
    raise exception 'Mes de %/% da conta % esta conciliado e fechado. Reabra primeiro.',
      v_meses[extract(month from v_mes)::int], extract(year from v_mes)::int, coalesce(v_nome, '-');
  end if;
  -- Mes anterior a um fechado tambem muda o saldo do fechado.
  perform public.fn_conciliacao_exigir_data_aberta(p_conta_id, p_data);
end;
$function$;

revoke execute on function public.fn_conciliacao_exigir_mes_aberto(uuid, date) from public, anon;
revoke execute on function public.fn_conciliacao_exigir_data_aberta(uuid, date) from public, anon;
grant execute on function public.fn_conciliacao_exigir_mes_aberto(uuid, date) to authenticated;
grant execute on function public.fn_conciliacao_exigir_data_aberta(uuid, date) to authenticated;

CREATE OR REPLACE FUNCTION public.fn_excluir_posicao_aplicacao(p_id uuid, p_motivo text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare v_apl uuid; v_data date; v_abertura boolean; v_conta uuid;
begin
  if not public.tem_permissao('financeiro.aplicacoes', 'editar') then
    raise exception 'Sem permissao para excluir posicao de aplicacao';
  end if;
  if coalesce(btrim(p_motivo), '') = '' then
    raise exception 'Informe o motivo da exclusao';
  end if;

  select p.aplicacao_id, p.data, p.e_abertura into v_apl, v_data, v_abertura
  from public.aplicacao_posicoes p where p.id = p_id and p.excluido_em is null;
  if v_apl is null then raise exception 'Posicao nao encontrada'; end if;
  if v_abertura then
    raise exception 'A posicao de abertura nao se exclui: regrave o valor dela';
  end if;

  select a.conta_bancaria_id into v_conta from public.aplicacoes a where a.id = v_apl for update;
  if not public.fn_pode_ver_saldo(v_conta) then
    raise exception 'Sem permissao para ver o saldo desta conta';
  end if;
  perform public.fn_conciliacao_exigir_data_aberta(v_conta, v_data);

  update public.aplicacao_posicoes
     set excluido_em = now(), excluido_por = (select auth.uid()), motivo_exclusao = btrim(p_motivo)
   where id = p_id;

  perform public.fn_aplicacao_sincronizar_posicao(p_id);
  perform public.fn_aplicacao_recalcular(v_apl, v_data);
end;
$function$;
