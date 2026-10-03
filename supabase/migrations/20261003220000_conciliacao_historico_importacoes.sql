-- =============================================================
-- Conciliacao 100% precisa, Bloco G: historico de importacoes
--
-- Pedido do Tiago (03/10/2026): nenhuma tela listava o que ja foi importado,
-- nem dava para desfazer um arquivo importado na conta errada.
--
-- 1. extratos_ofx ganha qtd_inseridas e qtd_ignoradas, gravadas no fim da
--    importacao. Importacao em que nada entrou nao deixa extrato: a RPC
--    devolve extrato_id null.
-- 2. fn_conciliacao_importacoes(): o historico para a tela (conta, arquivo,
--    periodo, saldo final, quem e quando importou, inseridas/ignoradas,
--    conciliados x pendentes, mes fechado). Por RPC porque o nome de quem
--    importou vem de usuarios e extratos_ofx.created_by nao tem FK.
-- 3. fn_conciliacao_excluir_extrato(id, motivo): exige a acao nova
--    financeiro.conciliacao/excluir. Recusa com movimento conciliado
--    ("desfaca os N casamentos antes") ou com mes fechado. Copia extrato e
--    movimentos em arquivo_morto com o motivo antes de apagar.
-- =============================================================

alter table public.extratos_ofx
  add column if not exists qtd_inseridas int,
  add column if not exists qtd_ignoradas int;

create or replace function public.fn_conciliacao_importar(
  p_conta_id uuid,
  p_nome text,
  p_periodo_inicio date,
  p_periodo_fim date,
  p_saldo_final numeric,
  p_saldo_final_data date,
  p_transacoes jsonb
)
returns jsonb
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_extrato uuid; v_t jsonb; v_inseridas int := 0; v_ignoradas int := 0; v_tipo text;
  v_conta_ativa boolean; v_fitid text; v_data date; v_valor numeric(14,2); v_memo text; v_chave text;
  v_n int;
  v_ignorados jsonb := '[]'::jsonb;
  v_meses date[] := '{}';
  v_reabertos int := 0;
begin
  if not public.tem_permissao('financeiro.conciliacao', 'criar') then raise exception 'Sem permissao para importar extratos'; end if;
  if p_conta_id is null then raise exception 'Informe a conta bancaria'; end if;
  if p_transacoes is null or jsonb_array_length(p_transacoes) = 0 then raise exception 'O arquivo nao tem transacoes'; end if;

  if p_periodo_inicio is not null and p_periodo_fim is not null and not exists (
    select 1 from jsonb_array_elements(p_transacoes) x
    where (x->>'data')::date between p_periodo_inicio and p_periodo_fim
  ) then
    raise exception 'O arquivo declara o periodo de % a %, mas nenhum movimento cai nesse periodo',
      to_char(p_periodo_inicio, 'DD/MM/YYYY'), to_char(p_periodo_fim, 'DD/MM/YYYY');
  end if;

  select ativo into v_conta_ativa from public.contas_bancarias where id = p_conta_id;
  if v_conta_ativa is null then raise exception 'Conta bancaria nao encontrada'; end if;
  if not v_conta_ativa then raise exception 'Conta bancaria inativa'; end if;

  insert into public.extratos_ofx (conta_bancaria_id, nome_arquivo, periodo_inicio, periodo_fim, saldo_final, saldo_final_data, created_by)
  values (p_conta_id, p_nome, p_periodo_inicio, p_periodo_fim, round(p_saldo_final, 2), p_saldo_final_data, (select auth.uid()))
  returning id into v_extrato;

  for v_t in select * from jsonb_array_elements(p_transacoes) loop
    v_fitid := nullif(btrim(v_t->>'fitid'), '');
    v_data := (v_t->>'data')::date;
    v_valor := (v_t->>'valor')::numeric;
    v_memo := v_t->>'memo';
    v_n := coalesce(nullif(v_t->>'n', '')::int, 1);
    v_tipo := case when v_valor >= 0 then 'credito' else 'debito' end;
    v_chave := coalesce(v_fitid,
      'sd:' || to_char(v_data, 'YYYY-MM-DD') || ':' || to_char(v_valor, 'FM9999999999999990.00')
      || ':' || coalesce(v_memo, '') || ':' || v_n);
    begin
      insert into public.extrato_transacoes (extrato_id, conta_bancaria_id, data_movimento, valor, tipo, memo, fitid, chave_dedup)
      values (v_extrato, p_conta_id, v_data, v_valor, v_tipo, v_memo, v_fitid, v_chave);
      v_inseridas := v_inseridas + 1;
      v_meses := array_append(v_meses, date_trunc('month', v_data)::date);
    exception when unique_violation then
      v_ignoradas := v_ignoradas + 1;
      v_ignorados := v_ignorados || jsonb_build_object(
        'data', v_data, 'valor', v_valor, 'memo', v_memo, 'fitid', v_fitid);
    end;
  end loop;

  -- Nada novo: o arquivo ja estava importado. Nao fica extrato vazio no
  -- historico; a tela diz "esse arquivo ja estava importado".
  if v_inseridas = 0 then
    delete from public.extratos_ofx where id = v_extrato;
    v_extrato := null;
  else
    update public.extratos_ofx
       set qtd_inseridas = v_inseridas, qtd_ignoradas = v_ignoradas
     where id = v_extrato;
  end if;

  -- Mes fechado aceita importacao, mas movimento novo reabre o mes: o que
  -- estava conciliado deixou de ser o extrato inteiro.
  update public.conciliacao_fechamentos f
     set reaberto_em = now(), reaberto_por = (select auth.uid()),
         motivo_reabertura = 'novo movimento importado'
   where f.conta_bancaria_id = p_conta_id
     and f.reaberto_em is null
     and f.mes = any (v_meses);
  get diagnostics v_reabertos = row_count;

  return jsonb_build_object(
    'meses_reabertos', v_reabertos,
    'extrato_id', v_extrato,
    'inseridas', v_inseridas,
    'ignoradas', v_ignoradas,
    'ignorados', v_ignorados
  );
end
$function$;

-- -------------------------------------------------------------
-- Historico
-- -------------------------------------------------------------
create or replace function public.fn_conciliacao_importacoes()
returns jsonb
language plpgsql
stable
security definer
set search_path to ''
as $function$
begin
  if not public.tem_permissao('financeiro.conciliacao', 'ver') then
    raise exception 'Sem permissao para ver a conciliacao';
  end if;

  return coalesce((
    select jsonb_agg(jsonb_build_object(
      'id', e.id,
      'contaId', e.conta_bancaria_id,
      'contaNome', c.nome,
      'arquivo', e.nome_arquivo,
      'periodoInicio', e.periodo_inicio,
      'periodoFim', e.periodo_fim,
      'saldoFinal', case when public.fn_pode_ver_saldo(e.conta_bancaria_id) then e.saldo_final end,
      'temSaldo', e.saldo_final is not null,
      'importadoEm', e.importado_em,
      'importadoPor', u.nome,
      'inseridas', coalesce(e.qtd_inseridas, m.total),
      'ignoradas', coalesce(e.qtd_ignoradas, 0),
      'conciliados', m.conciliados,
      'pendentes', m.total - m.conciliados,
      'mesFechado', exists (
        select 1 from public.conciliacao_fechamentos f
        where f.conta_bancaria_id = e.conta_bancaria_id and f.reaberto_em is null
          and f.mes between date_trunc('month', e.periodo_inicio)::date and date_trunc('month', e.periodo_fim)::date)
    ) order by e.importado_em desc)
    from public.extratos_ofx e
    join public.contas_bancarias c on c.id = e.conta_bancaria_id
    left join public.usuarios u on u.id = e.created_by
    left join lateral (
      select count(*) as total, count(*) filter (where t.conciliada) as conciliados
      from public.extrato_transacoes t where t.extrato_id = e.id
    ) m on true
  ), '[]'::jsonb);
end;
$function$;

revoke all on function public.fn_conciliacao_importacoes() from public, anon;
grant execute on function public.fn_conciliacao_importacoes() to authenticated;

-- -------------------------------------------------------------
-- Excluir uma importacao
-- -------------------------------------------------------------
create table if not exists arquivo_morto.extratos_excluidos_conciliacao (
  extrato_id uuid not null,
  motivo text not null,
  excluido_por uuid,
  excluido_em timestamptz not null default now(),
  extrato jsonb not null,
  transacoes jsonb not null
);

comment on table arquivo_morto.extratos_excluidos_conciliacao is
  'Importacoes de extrato excluidas pela tela de importacoes da conciliacao, com motivo e copia integral para restaurar.';

revoke all on table arquivo_morto.extratos_excluidos_conciliacao from public, anon, authenticated;

create or replace function public.fn_conciliacao_excluir_extrato(p_extrato_id uuid, p_motivo text)
returns void
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_e public.extratos_ofx;
  v_conciliados int;
begin
  if not public.tem_permissao('financeiro.conciliacao', 'excluir') then
    raise exception 'Sem permissao para excluir importacoes';
  end if;
  if coalesce(btrim(p_motivo), '') = '' then
    raise exception 'Informe o motivo da exclusao';
  end if;

  select * into v_e from public.extratos_ofx where id = p_extrato_id for update;
  if v_e.id is null then raise exception 'Importacao nao encontrada'; end if;

  select count(*) into v_conciliados from public.extrato_transacoes
  where extrato_id = p_extrato_id and conciliada;
  if v_conciliados > 0 then
    raise exception 'Desfaca os % casamento(s) desta importacao antes de excluir', v_conciliados;
  end if;

  perform public.fn_conciliacao_exigir_mes_aberto(v_e.conta_bancaria_id, d.mes)
  from (select distinct date_trunc('month', t.data_movimento)::date as mes
        from public.extrato_transacoes t where t.extrato_id = p_extrato_id) d;

  insert into arquivo_morto.extratos_excluidos_conciliacao (extrato_id, motivo, excluido_por, extrato, transacoes)
  values (
    v_e.id, btrim(p_motivo), (select auth.uid()), to_jsonb(v_e),
    coalesce((select jsonb_agg(to_jsonb(t)) from public.extrato_transacoes t where t.extrato_id = p_extrato_id), '[]')
  );

  delete from public.extratos_ofx where id = p_extrato_id;
end;
$function$;

revoke all on function public.fn_conciliacao_excluir_extrato(uuid, text) from public, anon;
grant execute on function public.fn_conciliacao_excluir_extrato(uuid, text) to authenticated;
