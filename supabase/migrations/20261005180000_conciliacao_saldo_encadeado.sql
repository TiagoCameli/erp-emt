-- =============================================================
-- Conciliacao v2, Bloco K: saldo encadeado e ancoras
--
-- Defeito (Tiago, 05/10/2026): o LEDGERBAL do BB e o saldo na data do
-- download, nao no fim do mes (DTASOF <> DTEND nos 16 arquivos), e e 0,00
-- desde set/25 por causa da varredura do Rende Facil. O painel comparava
-- datas diferentes e o mes nunca fechava.
--
-- 1. conciliacao_saldos_ancora: saldo conhecido de uma conta no FIM de um
--    dia (extrato em PDF, LEDGERBAL do fim do periodo, ou informado).
--    Semeadura: BB 102.124-9 em 21/08/2026 = R$ 155.484,34 (saldo inicial).
-- 2. fn_conciliacao_saldo_banco(conta, data): a ancora mais proxima com
--    extrato cobrindo todos os dias ate a data, mais ou menos os movimentos
--    do extrato no meio. Sem ancora: sem_ancora; com buraco: sem_cobertura.
-- 3. fn_conciliacao_importar grava ancora so quando DTASOF = fim do periodo.
-- 4. Painel e fechamento usam o mesmo saldo. Subconta (sem OFX): o
--    fechamento exige a ancora da subconta no ultimo dia do mes, quando ela
--    teve movimento, e recusa com diferenca.
-- 5. fn_conciliacao_registrar_ancora(conta, data, saldo, fonte, obs).
--
-- Nenhuma assinatura em uso muda. fn_conciliacao_fechar_mes muda o criterio
-- do saldo (encadeado, subconta); ninguem fecha mes enquanto o codigo novo
-- nao entra (o Tiago decidiu fechar a partir de set/2026).
-- =============================================================

create table if not exists public.conciliacao_saldos_ancora (
  id uuid primary key default gen_random_uuid(),
  conta_bancaria_id uuid not null references public.contas_bancarias(id),
  data date not null,
  saldo numeric(14, 2) not null,
  fonte text not null check (fonte in ('extrato_pdf', 'ledgerbal_fim_periodo', 'informado')),
  observacao text,
  created_at timestamptz not null default now(),
  created_by uuid references public.usuarios(id),
  constraint conciliacao_saldos_ancora_unica unique (conta_bancaria_id, data)
);

create index if not exists idx_conciliacao_saldos_ancora_created_by on public.conciliacao_saldos_ancora (created_by);

alter table public.conciliacao_saldos_ancora enable row level security;
drop policy if exists conciliacao_saldos_ancora_select on public.conciliacao_saldos_ancora;
create policy conciliacao_saldos_ancora_select on public.conciliacao_saldos_ancora
  for select to authenticated
  using ((select public.tem_permissao('financeiro.conciliacao', 'ver'))
         and public.fn_pode_ver_saldo(conta_bancaria_id));
revoke all on table public.conciliacao_saldos_ancora from public, anon, authenticated;
grant select on table public.conciliacao_saldos_ancora to authenticated;

drop trigger if exists trg_audit_conciliacao_saldos_ancora on public.conciliacao_saldos_ancora;
create trigger trg_audit_conciliacao_saldos_ancora after insert or update or delete on public.conciliacao_saldos_ancora
  for each row execute function public.fn_audit();
drop trigger if exists trg_conciliacao_saldos_ancora_created_by on public.conciliacao_saldos_ancora;
create trigger trg_conciliacao_saldos_ancora_created_by before insert on public.conciliacao_saldos_ancora
  for each row execute function public.fn_set_created_by();

-- -------------------------------------------------------------
-- Saldo do banco numa data, encadeado a partir de uma ancora.
-- Interna (sem checar permissao): quem chama e o painel e o fechamento.
-- -------------------------------------------------------------
create or replace function public.fn_conciliacao_saldo_banco_interno(p_conta_id uuid, p_data date)
returns jsonb
language plpgsql
stable
security definer
set search_path to ''
as $function$
declare
  v_a public.conciliacao_saldos_ancora;
  v_tem_ancora boolean := false;
  v_lo date;
  v_hi date;
  v_soma numeric;
begin
  for v_a in
    select * from public.conciliacao_saldos_ancora a
    where a.conta_bancaria_id = p_conta_id
    order by abs(a.data - p_data), a.data
  loop
    v_tem_ancora := true;
    v_lo := least(v_a.data, p_data);
    v_hi := greatest(v_a.data, p_data);
    -- Cobertura continua: todo dia de (lo, hi] dentro de algum extrato.
    if exists (
      select 1 from generate_series(v_lo + 1, v_hi, interval '1 day') d
      where not exists (
        select 1 from public.extratos_ofx e
        where e.conta_bancaria_id = p_conta_id
          and d::date between e.periodo_inicio and e.periodo_fim)
    ) then
      continue;
    end if;
    select coalesce(sum(t.valor), 0) into v_soma
    from public.extrato_transacoes t
    where t.conta_bancaria_id = p_conta_id
      and t.data_movimento > v_lo and t.data_movimento <= v_hi;
    return jsonb_build_object(
      'saldo', case when p_data >= v_a.data then v_a.saldo + v_soma else v_a.saldo - v_soma end,
      'ancoraData', v_a.data,
      'ancoraFonte', v_a.fonte,
      'cobertura', 'ok');
  end loop;
  return jsonb_build_object(
    'saldo', null, 'ancoraData', null, 'ancoraFonte', null,
    'cobertura', case when v_tem_ancora then 'sem_cobertura' else 'sem_ancora' end);
end;
$function$;

revoke all on function public.fn_conciliacao_saldo_banco_interno(uuid, date) from public, anon, authenticated;

create or replace function public.fn_conciliacao_saldo_banco(p_conta_id uuid, p_data date)
returns jsonb
language plpgsql
stable
security definer
set search_path to ''
as $function$
declare
  v jsonb;
begin
  if not public.tem_permissao('financeiro.conciliacao', 'ver') then
    raise exception 'Sem permissao para ver a conciliacao';
  end if;
  v := public.fn_conciliacao_saldo_banco_interno(p_conta_id, p_data);
  if not public.fn_pode_ver_saldo(p_conta_id) then
    v := v || jsonb_build_object('saldo', null);
  end if;
  return v;
end;
$function$;

revoke all on function public.fn_conciliacao_saldo_banco(uuid, date) from public, anon;
grant execute on function public.fn_conciliacao_saldo_banco(uuid, date) to authenticated;

-- -------------------------------------------------------------
-- O saldo do banco que o painel e o fechamento usam: encadeado; senao o
-- LEDGERBAL de um extrato cujo DTASOF e o proprio fim do periodo e o dia.
-- -------------------------------------------------------------
create or replace function public.fn_conciliacao_saldo_banco_no_dia(p_conta_id uuid, p_data date)
returns jsonb
language plpgsql
stable
security definer
set search_path to ''
as $function$
declare
  v_enc jsonb := public.fn_conciliacao_saldo_banco_interno(p_conta_id, p_data);
  v_ledger numeric(14, 2);
begin
  if v_enc->>'cobertura' = 'ok' then
    return jsonb_build_object('banco', (v_enc->>'saldo')::numeric, 'fonte', 'encadeado',
      'ancoraData', v_enc->>'ancoraData', 'motivo', null);
  end if;
  select e.saldo_final into v_ledger from public.extratos_ofx e
  where e.conta_bancaria_id = p_conta_id and e.periodo_fim = p_data
    and e.saldo_final_data = e.periodo_fim and e.saldo_final is not null
  order by e.importado_em desc limit 1;
  if v_ledger is not null then
    return jsonb_build_object('banco', v_ledger, 'fonte', 'ledgerbal', 'ancoraData', null, 'motivo', null);
  end if;
  return jsonb_build_object('banco', null, 'fonte', null, 'ancoraData', null,
    'motivo', v_enc->>'cobertura');
end;
$function$;

revoke all on function public.fn_conciliacao_saldo_banco_no_dia(uuid, date) from public, anon, authenticated;

-- -------------------------------------------------------------
-- Registrar ancora (Importacoes; fechamento com a subconta).
-- -------------------------------------------------------------
create or replace function public.fn_conciliacao_registrar_ancora(
  p_conta_id uuid, p_data date, p_saldo numeric, p_fonte text, p_observacao text
)
returns uuid
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_id uuid;
begin
  if not public.tem_permissao('financeiro.conciliacao', 'editar') then
    raise exception 'Sem permissao para conciliar';
  end if;
  if not public.fn_pode_ver_saldo(p_conta_id) then
    raise exception 'Sem permissao para ver o saldo desta conta';
  end if;
  if p_conta_id is null or p_data is null or p_saldo is null then
    raise exception 'Informe a conta, a data e o saldo';
  end if;
  if p_fonte not in ('extrato_pdf', 'informado') then
    raise exception 'Fonte da ancora invalida';
  end if;
  insert into public.conciliacao_saldos_ancora (conta_bancaria_id, data, saldo, fonte, observacao)
  values (p_conta_id, p_data, round(p_saldo, 2), p_fonte, nullif(btrim(coalesce(p_observacao, '')), ''))
  on conflict (conta_bancaria_id, data) do update
     set saldo = excluded.saldo, fonte = excluded.fonte, observacao = excluded.observacao
  returning id into v_id;
  return v_id;
end;
$function$;

revoke all on function public.fn_conciliacao_registrar_ancora(uuid, date, numeric, text, text) from public, anon;
grant execute on function public.fn_conciliacao_registrar_ancora(uuid, date, numeric, text, text) to authenticated;

-- Semeadura: o saldo inicial da BB 102.124-9 no corte.
insert into public.conciliacao_saldos_ancora (conta_bancaria_id, data, saldo, fonte, observacao)
select '40fb6875-ad20-45ed-9346-d1b59e7d9723', date '2026-08-21', 155484.34, 'informado',
       'Saldo inicial cadastrado (corte da migracao)'
where exists (select 1 from public.contas_bancarias where id = '40fb6875-ad20-45ed-9346-d1b59e7d9723')
on conflict (conta_bancaria_id, data) do nothing;

create or replace function public.fn_conciliacao_importar(p_conta_id uuid, p_nome text, p_periodo_inicio date, p_periodo_fim date, p_saldo_final numeric, p_saldo_final_data date, p_transacoes jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
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

  -- Ancora do saldo (Bloco K): o LEDGERBAL so vale como saldo do fim do
  -- periodo quando o banco diz que e dessa data (DTASOF = fim). O BB poe a
  -- data do download, entao no BB nunca vira ancora.
  if p_saldo_final is not null and p_saldo_final_data is not null
     and p_periodo_fim is not null and p_saldo_final_data = p_periodo_fim then
    insert into public.conciliacao_saldos_ancora (conta_bancaria_id, data, saldo, fonte, observacao)
    values (p_conta_id, p_periodo_fim, round(p_saldo_final, 2), 'ledgerbal_fim_periodo', p_nome)
    on conflict (conta_bancaria_id, data) do nothing;
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

create or replace function public.fn_conciliacao_fechar_mes(p_conta_id uuid, p_mes date)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_inicio date := date_trunc('month', p_mes)::date;
  v_fim date := (date_trunc('month', p_mes) + interval '1 month - 1 day')::date;
  v_painel jsonb;
  v_faltam int;
  v_fora int;
  v_banco numeric(14, 2);
  v_banco_data date;
  v_app numeric(14, 2);
  v_id uuid;
  v_saldo_banco jsonb;
  v_sub uuid;
  v_sub_banco numeric(14, 2);
  v_sub_app numeric(14, 2);
begin
  if not public.tem_permissao('financeiro.conciliacao', 'editar') then
    raise exception 'Sem permissao para conciliar';
  end if;
  if p_conta_id is null or p_mes is null then raise exception 'Informe a conta e o mes'; end if;

  if exists (select 1 from public.conciliacao_fechamentos
             where conta_bancaria_id = p_conta_id and mes = v_inicio and reaberto_em is null) then
    raise exception 'Este mes ja esta fechado';
  end if;

  -- Recalcula aqui, com o mesmo painel da tela: nao confia no cliente.
  v_painel := public.fn_conciliacao_painel(p_conta_id, v_inicio, v_fim);
  select count(*) into v_faltam from jsonb_array_elements(v_painel->'transacoes') t
   where not (t->>'conciliada')::boolean;
  select (select count(*) from jsonb_array_elements(v_painel->'pagasNaConta') p
           where (p->>'dataPagamento')::date between v_inicio and v_fim)
       + (select count(*) from jsonb_array_elements(v_painel->'transferencias') t
           where (t->>'data')::date between v_inicio and v_fim)
    into v_fora;

  if v_faltam > 0 then
    raise exception 'Nao da para fechar: % movimento(s) do extrato ainda faltam no app', v_faltam;
  end if;
  if v_fora > 0 then
    raise exception 'Nao da para fechar: % lancamento(s) do app nao aparecem no extrato', v_fora;
  end if;

  -- Saldo do banco no ultimo dia do mes (Bloco K): encadeado a partir de
  -- uma ancora com extrato cobrindo, ou o LEDGERBAL quando e do fim do
  -- periodo. A mesma conta do painel.
  v_saldo_banco := public.fn_conciliacao_saldo_banco_no_dia(p_conta_id, v_fim);
  v_banco := (v_saldo_banco->>'banco')::numeric;
  v_banco_data := v_fim;
  if v_banco is null then
    raise exception 'Nao da para fechar: sem saldo do banco em % (%). Cadastre uma ancora em Importacoes',
      to_char(v_fim, 'DD/MM/YYYY'), v_saldo_banco->>'motivo';
  end if;
  v_app := public.fn_conciliacao_saldo_app_interno(p_conta_id, v_banco_data);
  if v_app <> v_banco then
    raise exception 'Nao da para fechar: o saldo do banco difere do app em R$ %', public.fn_conciliacao_brl(v_banco - v_app);
  end if;

  -- Subconta de investimentos: sem OFX, o saldo vem do extrato de
  -- investimentos (ancora do ultimo dia do mes). So quando ela teve
  -- movimento ate o fim do mes.
  select c.id into v_sub from public.contas_bancarias c where c.conta_pai_id = p_conta_id;
  if v_sub is not null and exists (
       select 1 from public.transferencias_contas t
       where v_sub in (t.conta_origem_id, t.conta_destino_id) and t.data_transferencia <= v_fim) then
    select a.saldo into v_sub_banco from public.conciliacao_saldos_ancora a
     where a.conta_bancaria_id = v_sub and a.data = v_fim;
    if v_sub_banco is null then
      raise exception 'Nao da para fechar: informe o saldo da subconta em % (extrato de investimentos)', to_char(v_fim, 'DD/MM/YYYY');
    end if;
    v_sub_app := public.fn_conciliacao_saldo_app_interno(v_sub, v_fim);
    if v_sub_app <> v_sub_banco then
      raise exception 'Subconta: banco R$ %, app R$ %. Lance o rendimento ou confira as transferencias.',
        public.fn_conciliacao_brl(v_sub_banco), public.fn_conciliacao_brl(v_sub_app);
    end if;
  end if;

  insert into public.conciliacao_fechamentos (conta_bancaria_id, mes, saldo_banco, saldo_app, fechado_por)
  values (p_conta_id, v_inicio, v_banco, v_app, (select auth.uid()))
  returning id into v_id;
  return v_id;
end;
$function$;

create or replace function public.fn_conciliacao_painel(p_conta_id uuid, p_inicio date, p_fim date)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_folga_paga int := 5;
  v_folga_aberta int := 45;
  v_tolerancia numeric := 1.00;
  v_valores numeric[];
  v_resultado jsonb;
  v_saldo jsonb;
  v_banco numeric(14, 2);
  v_banco_data date;
  v_tem_extrato boolean := false;
  v_app numeric(14, 2);
  v_pode_ver boolean;
  v_fechamento jsonb;
  v_corte date;
  v_saldo_banco jsonb;
  v_sub uuid;
  v_sub_banco numeric(14, 2);
  v_sub_app numeric(14, 2);
begin
  if not public.tem_permissao('financeiro.conciliacao', 'ver') then
    raise exception 'Sem permissao para ver a conciliacao';
  end if;
  if p_conta_id is null or p_inicio is null or p_fim is null then
    raise exception 'Informe a conta e o periodo';
  end if;
  if p_inicio > p_fim then
    raise exception 'O periodo comeca depois de terminar';
  end if;

  select coalesce(array_agg(distinct round(abs(t.valor), 2)), '{}')
    into v_valores
  from public.extrato_transacoes t
  where t.conta_bancaria_id = p_conta_id
    and t.data_movimento between p_inicio and p_fim
    and not t.conciliada;

  -- Saldo do banco no ultimo dia do periodo (Bloco K): encadeado a partir
  -- de uma ancora com extrato cobrindo; o LEDGERBAL so quando o banco diz que
  -- e do fim do periodo. So aparece quando algum extrato cobre esse dia.
  select true into v_tem_extrato
  from public.extratos_ofx e
  where e.conta_bancaria_id = p_conta_id
    and e.periodo_inicio <= p_fim and e.periodo_fim >= p_fim
  limit 1;

  if coalesce(v_tem_extrato, false) then
    v_pode_ver := public.fn_pode_ver_saldo(p_conta_id);
    select saldo_inicial_data into v_corte from public.contas_bancarias where id = p_conta_id;
    v_saldo_banco := public.fn_conciliacao_saldo_banco_no_dia(p_conta_id, p_fim);
    v_banco := (v_saldo_banco->>'banco')::numeric;
    v_banco_data := p_fim;
    v_app := public.fn_conciliacao_saldo_app_interno(p_conta_id, p_fim);

    select c.id into v_sub from public.contas_bancarias c where c.conta_pai_id = p_conta_id;
    if v_sub is not null then
      select a.saldo into v_sub_banco from public.conciliacao_saldos_ancora a
       where a.conta_bancaria_id = v_sub and a.data = p_fim;
      v_sub_app := public.fn_conciliacao_saldo_app_interno(v_sub, p_fim);
    end if;

    -- Quem nao ve saldo recebe so se bateu ou nao, calculado aqui.
    v_saldo := jsonb_build_object(
      'data', v_banco_data,
      'temSaldoNoArquivo', v_banco is not null,
      'podeVer', v_pode_ver,
      'banco', case when v_pode_ver then v_banco end,
      'bancoFonte', v_saldo_banco->>'fonte',
      'bancoAncora', v_saldo_banco->>'ancoraData',
      'motivo', v_saldo_banco->>'motivo',
      'app', case when v_pode_ver then v_app end,
      'diferenca', case when v_pode_ver and v_banco is not null then v_banco - v_app end,
      'bate', case when v_banco is null then null else v_banco = v_app end,
      'corte', v_corte,
      'antesDoCorte', v_corte is not null and v_banco_data < v_corte,
      'subconta', case when v_sub is null then null else jsonb_build_object(
        'banco', case when v_pode_ver then v_sub_banco end,
        'app', case when v_pode_ver then v_sub_app end,
        'temAncora', v_sub_banco is not null,
        'bate', case when v_sub_banco is null then null else v_sub_banco = v_sub_app end) end
    );
  end if;

  select jsonb_build_object(
           'fechadoEm', f.fechado_em,
           'fechadoPor', u.nome,
           'saldoBanco', case when public.fn_pode_ver_saldo(p_conta_id) then f.saldo_banco end)
    into v_fechamento
  from public.conciliacao_fechamentos f
  left join public.usuarios u on u.id = f.fechado_por
  where f.conta_bancaria_id = p_conta_id
    and f.mes = date_trunc('month', p_inicio)::date
    and f.reaberto_em is null;

  with base as (
    -- So o que pode interessar: pagas na janela, abertas na janela maior, e
    -- as ja vinculadas a movimentos deste periodo. Antes a CTE varria todas
    -- as parcelas do banco.
    select p.*
    from public.lancamento_parcelas p
    where (p.status = 'pago'
           and p.data_pagamento between p_inicio - v_folga_paga and p_fim + v_folga_paga)
       or (p.status in ('pendente', 'aprovado')
           and coalesce(p.data_programada, p.data_vencimento)
               between p_inicio - v_folga_aberta and p_fim + v_folga_aberta)
       or p.id in (
           select t.parcela_id from public.extrato_transacoes t
           where t.conta_bancaria_id = p_conta_id
             and t.data_movimento between p_inicio and p_fim
             and t.parcela_id is not null)
  ),
  parcela_info as (
    select
      p.id, p.lancamento_id, p.numero_parcela, p.status, p.valor, p.desconto,
      p.juros, p.outras_despesas, p.valor_liquido, p.data_pagamento,
      p.data_vencimento, p.data_programada, p.conta_bancaria_id,
      l.numero as lancamento_numero, l.descricao, l.tipo, l.origem,
      l.numero_documento,
      -- Apelidos bancarios do favorecido (Bloco I): o cedente que o banco
      -- escreve no historico e que a pessoa ja confirmou ser este fornecedor.
      coalesce((
        select array_agg(a.apelido order by a.apelido)
        from public.fornecedor_apelidos_bancarios a
        where (l.fornecedor_id is not null and a.fornecedor_id = l.fornecedor_id)
           or (l.colaborador_id is not null and a.colaborador_id = l.colaborador_id)
      ), '{}') as apelidos,
      coalesce(f.nome_fantasia, f.razao_social, cl.nome_fantasia, cl.nome, co.nome) as nome,
      f.razao_social as razao_social,
      cb.nome as conta_nome,
      q.qtd as qtd_parcelas,
      exists (select 1 from public.extrato_transacoes e where e.parcela_id = p.id) as vinculada
    from base p
    join public.lancamentos l on l.id = p.lancamento_id
    left join public.fornecedores f on f.id = l.fornecedor_id
    left join public.clientes cl on cl.id = l.cliente_id
    left join public.colaboradores co on co.id = l.colaborador_id
    left join public.contas_bancarias cb on cb.id = p.conta_bancaria_id
    left join lateral (
      select count(*) as qtd from public.lancamento_parcelas p2 where p2.lancamento_id = p.lancamento_id
    ) q on true
    where l.status <> 'cancelado'
  ),
  livres as (
    select pi.* from parcela_info pi where not pi.vinculada
  ),
  -- Perto de algum movimento sem par (ate a tolerancia).
  perto as (
    select lv.* from livres lv
    where exists (
      select 1 from unnest(v_valores) v
      where abs(v - round(lv.valor_liquido, 2)) <= v_tolerancia
    )
  ),
  transf as (
    select
      tr.id, tr.numero, tr.descricao, tr.data_transferencia, tr.valor,
      tr.conta_origem_id, tr.conta_destino_id,
      o.nome as origem_nome, d.nome as destino_nome,
      case when tr.conta_origem_id = p_conta_id then 'saida' else 'entrada' end as lado
    from public.transferencias_contas tr
    join public.contas_bancarias o on o.id = tr.conta_origem_id
    join public.contas_bancarias d on d.id = tr.conta_destino_id
    where p_conta_id in (tr.conta_origem_id, tr.conta_destino_id)
  )
  select jsonb_build_object(
    'saldo', v_saldo,
    'fechamento', v_fechamento,
    'transacoes', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', t.id,
        'extratoId', t.extrato_id,
        'dataMovimento', t.data_movimento,
        'valor', t.valor,
        'tipo', t.tipo,
        'memo', t.memo,
        'conciliada', t.conciliada,
        'automatica', t.conciliacao_automatica,
        'confiraConfirmado', t.confira_confirmado_em is not null,
        'parcela', case when pi.id is null then null else jsonb_build_object(
          'id', pi.id, 'lancamentoId', pi.lancamento_id, 'lancamentoNumero', pi.lancamento_numero,
          'descricao', pi.descricao, 'nome', pi.nome, 'numeroParcela', pi.numero_parcela,
          'valorLiquido', pi.valor_liquido, 'dataPagamento', pi.data_pagamento,
          'apelidos', to_jsonb(pi.apelidos)) end,
        'transferencia', case when tf.id is null then null else jsonb_build_object(
          'id', tf.id, 'numero', tf.numero, 'descricao', tf.descricao,
          'origemNome', tf.origem_nome, 'destinoNome', tf.destino_nome,
          'data', tf.data_transferencia) end,
        'estorno', case when ep.id is null then null else jsonb_build_object(
          'id', ep.id, 'dataMovimento', ep.data_movimento, 'valor', ep.valor,
          'memo', ep.memo) end
      ) order by t.data_movimento, t.created_at)
      from public.extrato_transacoes t
      left join parcela_info pi on pi.id = t.parcela_id
      left join transf tf on tf.id = t.transferencia_id
      left join public.extrato_transacoes ep on ep.id = t.estorno_par_id
      where t.conta_bancaria_id = p_conta_id
        and t.data_movimento between p_inicio and p_fim
    ), '[]'::jsonb),

    -- Movimentos sem par logo antes e logo depois do periodo: o envio de
    -- uma TED devolvida no comeco do mes pode ter saido no mes anterior.
    'vizinhos', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', v.id, 'dataMovimento', v.data_movimento, 'valor', v.valor,
        'tipo', v.tipo, 'memo', v.memo) order by v.data_movimento)
      from public.extrato_transacoes v
      where v.conta_bancaria_id = p_conta_id
        and not v.conciliada
        and (v.data_movimento between p_inicio - 10 and p_inicio - 1
             or v.data_movimento between p_fim + 1 and p_fim + 10)
    ), '[]'::jsonb),

    'pagasNaConta', coalesce((
      select jsonb_agg(to_jsonb(lv) order by lv."dataPagamento")
      from (
        select id, lancamento_id as "lancamentoId", lancamento_numero as "lancamentoNumero",
               descricao, nome, razao_social as "razaoSocial", tipo, origem,
               numero_parcela as "numeroParcela", qtd_parcelas as "qtdParcelas",
               valor, valor_liquido as "valorLiquido", data_pagamento as "dataPagamento",
               numero_documento as "numeroDocumento", status, conta_nome as "contaNome",
               conta_bancaria_id as "contaId", apelidos
        from livres
        where status = 'pago'
          and conta_bancaria_id = p_conta_id
      ) lv
    ), '[]'::jsonb),

    'pagasEmOutraConta', coalesce((
      select jsonb_agg(to_jsonb(lv) order by lv."dataPagamento")
      from (
        select id, lancamento_id as "lancamentoId", lancamento_numero as "lancamentoNumero",
               descricao, nome, razao_social as "razaoSocial", tipo, origem,
               numero_parcela as "numeroParcela", qtd_parcelas as "qtdParcelas",
               valor, valor_liquido as "valorLiquido", data_pagamento as "dataPagamento",
               numero_documento as "numeroDocumento", status, conta_nome as "contaNome",
               conta_bancaria_id as "contaId", apelidos
        from perto
        where status = 'pago'
          and conta_bancaria_id is distinct from p_conta_id
      ) lv
    ), '[]'::jsonb),

    'abertas', coalesce((
      select jsonb_agg(to_jsonb(lv) order by lv."dataVencimento")
      from (
        select id, lancamento_id as "lancamentoId", lancamento_numero as "lancamentoNumero",
               descricao, nome, razao_social as "razaoSocial", tipo, origem,
               numero_parcela as "numeroParcela", qtd_parcelas as "qtdParcelas",
               valor, valor_liquido as "valorLiquido",
               coalesce(data_programada, data_vencimento) as "dataVencimento",
               numero_documento as "numeroDocumento", status, conta_nome as "contaNome",
               conta_bancaria_id as "contaId", apelidos
        from perto
        where status in ('pendente', 'aprovado')
      ) lv
    ), '[]'::jsonb),

    'transferencias', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', tf.id, 'numero', tf.numero, 'descricao', tf.descricao,
        'data', tf.data_transferencia, 'valor', tf.valor, 'lado', tf.lado,
        'origemNome', tf.origem_nome, 'destinoNome', tf.destino_nome
      ) order by tf.data_transferencia)
      from transf tf
      where tf.data_transferencia between p_inicio - v_folga_paga and p_fim + v_folga_paga
        and not exists (
          select 1 from public.extrato_transacoes e
          where e.transferencia_id = tf.id
            and e.tipo = case when tf.lado = 'saida' then 'debito' else 'credito' end
        )
    ), '[]'::jsonb)
  ) into v_resultado;

  return v_resultado;
end;
$function$;
