-- =============================================================
-- Conciliacao: fatura do cartao de credito
--
-- Pedido do Tiago (05/10/2026): o banco paga a fatura do cartao num debito
-- so ("CARTAO CX" R$ 30.286,47 em 28/09/2026 na Caixa), e no app cada compra
-- no cartao e uma parcela paga sozinha. Nao havia como conciliar.
--
-- 1. cartao_faturas: a fatura paga por um movimento do extrato (um para um),
--    com o cartao, o vencimento e os encargos (juros, IOF, anuidade).
-- 2. cartao_fatura_parcelas: as compras (parcelas) da fatura, com o estado
--    que cada uma tinha antes (para desfazer devolver tudo como estava).
-- 3. extrato_transacoes.cartao_fatura_id: o vinculo do movimento com a
--    fatura. A trava de vinculo unico passa a contar a fatura.
-- 4. fn_conciliacao_compras_do_cartao(transacao, cartao): as parcelas do
--    cartao (pela forma de pagamento do lancamento) ainda fora de fatura,
--    aprovadas ou pagas, com vencimento ate 20 dias do debito.
-- 5. fn_conciliacao_casar_fatura(transacao, cartao, parcelas[], encargos):
--    a soma das compras mais os encargos tem de ser o valor do debito. As
--    parcelas ficam pagas na conta e na data do debito (a que estava paga em
--    outra conta muda de conta); os encargos viram um lancamento pago, com a
--    categoria e o centro de custo escolhidos, dentro da fatura.
-- 6. fn_desconciliar_transacao desfaz a fatura: as parcelas voltam ao estado
--    de antes e o lancamento de encargos e apagado.
-- 7. O painel nao mostra mais as compras da fatura em "fora do banco" e
--    devolve a fatura do movimento casado.
-- =============================================================

create table if not exists public.cartao_faturas (
  id uuid primary key default gen_random_uuid(),
  cartao_id uuid not null references public.cartoes_credito(id),
  conta_bancaria_id uuid not null references public.contas_bancarias(id),
  vencimento date not null,
  valor numeric(14, 2) not null check (valor > 0),
  encargos numeric(14, 2) not null default 0 check (encargos >= 0),
  encargos_lancamento_id uuid references public.lancamentos(id) on delete set null,
  created_at timestamptz not null default now(),
  created_by uuid references public.usuarios(id)
);
create index if not exists idx_cartao_faturas_cartao on public.cartao_faturas (cartao_id);
create index if not exists idx_cartao_faturas_conta on public.cartao_faturas (conta_bancaria_id);
create index if not exists idx_cartao_faturas_encargos on public.cartao_faturas (encargos_lancamento_id);
create index if not exists idx_cartao_faturas_created_by on public.cartao_faturas (created_by);

create table if not exists public.cartao_fatura_parcelas (
  fatura_id uuid not null references public.cartao_faturas(id) on delete cascade,
  parcela_id uuid not null references public.lancamento_parcelas(id) on delete cascade,
  status_antes text not null,
  conta_antes uuid,
  data_pagamento_antes date,
  pago_por_antes uuid,
  pago_em_antes timestamptz,
  primary key (fatura_id, parcela_id),
  constraint cartao_fatura_parcelas_uma_fatura unique (parcela_id)
);

alter table public.cartao_faturas enable row level security;
alter table public.cartao_fatura_parcelas enable row level security;
drop policy if exists cartao_faturas_select on public.cartao_faturas;
create policy cartao_faturas_select on public.cartao_faturas for select to authenticated
  using ((select public.tem_permissao('financeiro.conciliacao', 'ver')));
drop policy if exists cartao_fatura_parcelas_select on public.cartao_fatura_parcelas;
create policy cartao_fatura_parcelas_select on public.cartao_fatura_parcelas for select to authenticated
  using ((select public.tem_permissao('financeiro.conciliacao', 'ver')));
revoke all on table public.cartao_faturas, public.cartao_fatura_parcelas from public, anon, authenticated;
grant select on table public.cartao_faturas, public.cartao_fatura_parcelas to authenticated;

drop trigger if exists trg_audit_cartao_faturas on public.cartao_faturas;
create trigger trg_audit_cartao_faturas after insert or update or delete on public.cartao_faturas
  for each row execute function public.fn_audit();
drop trigger if exists trg_cartao_faturas_created_by on public.cartao_faturas;
create trigger trg_cartao_faturas_created_by before insert on public.cartao_faturas
  for each row execute function public.fn_set_created_by();

alter table public.extrato_transacoes
  add column if not exists cartao_fatura_id uuid references public.cartao_faturas(id);
create unique index if not exists extrato_transacoes_uma_por_fatura
  on public.extrato_transacoes (cartao_fatura_id) where cartao_fatura_id is not null;
alter table public.extrato_transacoes drop constraint if exists extrato_transacoes_um_vinculo;
alter table public.extrato_transacoes add constraint extrato_transacoes_um_vinculo
  check (num_nonnulls(parcela_id, transferencia_id, estorno_par_id, cartao_fatura_id) <= 1);

-- -------------------------------------------------------------
-- Compras do cartao que podem estar nesta fatura.
-- -------------------------------------------------------------
create or replace function public.fn_conciliacao_compras_do_cartao(p_transacao_id uuid, p_cartao_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path to ''
as $function$
declare
  v_t public.extrato_transacoes;
begin
  if not public.tem_permissao('financeiro.conciliacao', 'ver') then
    raise exception 'Sem permissao para ver a conciliacao';
  end if;
  select * into v_t from public.extrato_transacoes where id = p_transacao_id;
  if v_t.id is null then return '[]'::jsonb; end if;
  return coalesce((
    select jsonb_agg(jsonb_build_object(
      'parcelaId', lp.id, 'lancamentoId', l.id, 'lancamentoNumero', l.numero,
      'descricao', l.descricao, 'fornecedor', coalesce(f.nome_fantasia, f.razao_social),
      'numeroParcela', lp.numero_parcela, 'qtdParcelas', (select count(*) from public.lancamento_parcelas x where x.lancamento_id = l.id),
      'valor', lp.valor_liquido, 'vencimento', lp.data_vencimento, 'status', lp.status,
      'contaNome', cb.nome, 'dataPagamento', lp.data_pagamento
    ) order by lp.data_vencimento, l.numero)
    from public.lancamento_parcelas lp
    join public.lancamento_formas lf on lf.id = lp.lancamento_forma_id
    join public.lancamentos l on l.id = lp.lancamento_id
    left join public.fornecedores f on f.id = l.fornecedor_id
    left join public.contas_bancarias cb on cb.id = lp.conta_bancaria_id
    where lf.cartao_id = p_cartao_id
      and l.tipo = 'a_pagar' and l.status <> 'cancelado'
      and lp.status in ('aprovado', 'pago')
      and abs(lp.data_vencimento - v_t.data_movimento) <= 20
      and not exists (select 1 from public.cartao_fatura_parcelas fp where fp.parcela_id = lp.id)
      and not exists (select 1 from public.extrato_transacoes e where e.parcela_id = lp.id)
  ), '[]'::jsonb);
end;
$function$;
revoke all on function public.fn_conciliacao_compras_do_cartao(uuid, uuid) from public, anon;
grant execute on function public.fn_conciliacao_compras_do_cartao(uuid, uuid) to authenticated;

-- -------------------------------------------------------------
-- Casar o debito com a fatura.
-- -------------------------------------------------------------
create or replace function public.fn_conciliacao_casar_fatura(
  p_transacao_id uuid, p_cartao_id uuid, p_parcela_ids uuid[], p_encargos jsonb default null
)
returns uuid
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_t public.extrato_transacoes;
  v_quem uuid := (select auth.uid());
  v_soma numeric(14, 2);
  v_qtd int;
  v_encargos numeric(14, 2) := round(coalesce((p_encargos->>'valor')::numeric, 0), 2);
  v_fatura uuid;
  v_lanc uuid;
  v_parc uuid;
  v_centro uuid := nullif(p_encargos->>'centroCustoId', '')::uuid;
  v_categoria uuid := nullif(p_encargos->>'categoriaId', '')::uuid;
  v_mes date;
  r record;
begin
  if not public.tem_permissao('financeiro.conciliacao', 'editar') then
    raise exception 'Sem permissao para conciliar';
  end if;
  if not public.fn_conciliacao_pode_mexer_no_pago('a_pagar') then
    raise exception 'Sem permissao para dar baixa em pagamentos';
  end if;
  select * into v_t from public.extrato_transacoes where id = p_transacao_id for update;
  if v_t.id is null then raise exception 'Movimento do extrato nao encontrado'; end if;
  if v_t.conciliada then raise exception 'Este movimento ja esta conciliado'; end if;
  if v_t.tipo <> 'debito' then raise exception 'A fatura do cartao e um debito'; end if;
  perform public.fn_conciliacao_exigir_mes_aberto(v_t.conta_bancaria_id, v_t.data_movimento);
  if not exists (select 1 from public.cartoes_credito where id = p_cartao_id) then
    raise exception 'Cartao nao encontrado';
  end if;
  if coalesce(array_length(p_parcela_ids, 1), 0) = 0 and v_encargos = 0 then
    raise exception 'Escolha as compras da fatura';
  end if;

  -- Todas do cartao, fora de fatura e de outro casamento.
  select count(*), coalesce(sum(lp.valor_liquido), 0) into v_qtd, v_soma
  from public.lancamento_parcelas lp
  join public.lancamento_formas lf on lf.id = lp.lancamento_forma_id
  join public.lancamentos l on l.id = lp.lancamento_id
  where lp.id = any (coalesce(p_parcela_ids, '{}'))
    and lf.cartao_id = p_cartao_id and l.tipo = 'a_pagar' and l.status <> 'cancelado'
    and lp.status in ('aprovado', 'pago')
    and not exists (select 1 from public.cartao_fatura_parcelas fp where fp.parcela_id = lp.id)
    and not exists (select 1 from public.extrato_transacoes e where e.parcela_id = lp.id);
  if v_qtd <> coalesce(array_length(p_parcela_ids, 1), 0) then
    raise exception 'Alguma compra escolhida nao e deste cartao, ja esta em outra fatura ou ja foi conciliada';
  end if;
  if v_soma + v_encargos <> abs(v_t.valor) then
    raise exception 'As compras (R$ %) mais os encargos (R$ %) nao fecham o debito do banco (R$ %)',
      public.fn_conciliacao_brl(v_soma), public.fn_conciliacao_brl(v_encargos), public.fn_conciliacao_brl(abs(v_t.valor));
  end if;
  if v_encargos > 0 and (v_centro is null or v_categoria is null) then
    raise exception 'Escolha a categoria e o centro de custo dos encargos do cartao';
  end if;

  insert into public.cartao_faturas (cartao_id, conta_bancaria_id, vencimento, valor, encargos)
  values (p_cartao_id, v_t.conta_bancaria_id, v_t.data_movimento, abs(v_t.valor), v_encargos)
  returning id into v_fatura;

  for r in select lp.* from public.lancamento_parcelas lp where lp.id = any (coalesce(p_parcela_ids, '{}')) for update loop
    insert into public.cartao_fatura_parcelas (fatura_id, parcela_id, status_antes, conta_antes,
      data_pagamento_antes, pago_por_antes, pago_em_antes)
    values (v_fatura, r.id, r.status, r.conta_bancaria_id, r.data_pagamento, r.pago_por, r.pago_em);
    update public.lancamento_parcelas
       set status = 'pago', conta_bancaria_id = v_t.conta_bancaria_id, data_pagamento = v_t.data_movimento,
           pago_por = coalesce(pago_por, v_quem), pago_em = coalesce(pago_em, now())
     where id = r.id;
    perform public.fn_recalcular_status_lancamento(r.lancamento_id);
  end loop;

  if v_encargos > 0 then
    v_mes := date_trunc('month', v_t.data_movimento)::date;
    v_lanc := gen_random_uuid();
    perform public.fn_exigir_competencia_aberta(v_mes, 'lancamento', v_lanc);
    insert into public.lancamentos (id, tipo, origem, categoria_id, centro_custo_id, descricao, valor, status,
      data_compra, mes_competencia, data_vencimento, observacoes, created_by)
    values (v_lanc, 'a_pagar', 'manual', v_categoria, v_centro,
      'Encargos do cartao ' || (select nome from public.cartoes_credito where id = p_cartao_id),
      v_encargos, 'pago', v_t.data_movimento, v_mes, v_t.data_movimento,
      left('Diferenca da fatura paga em ' || to_char(v_t.data_movimento, 'DD/MM/YYYY') || ': ' || coalesce(v_t.memo, '-'), 2000), v_quem);
    insert into public.lancamento_parcelas (lancamento_id, numero_parcela, valor, data_vencimento, status,
      conta_bancaria_id, data_pagamento, pago_por, pago_em, created_by)
    values (v_lanc, 1, v_encargos, v_t.data_movimento, 'pago', v_t.conta_bancaria_id, v_t.data_movimento, v_quem, now(), v_quem)
    returning id into v_parc;
    insert into public.lancamento_rateios (lancamento_id, centro_custo_id, valor, categoria_id, created_by)
    values (v_lanc, v_centro, v_encargos, v_categoria, v_quem);
    insert into public.cartao_fatura_parcelas (fatura_id, parcela_id, status_antes)
    values (v_fatura, v_parc, 'novo');
    update public.cartao_faturas set encargos_lancamento_id = v_lanc where id = v_fatura;
  end if;

  update public.extrato_transacoes
     set conciliada = true, cartao_fatura_id = v_fatura, conciliado_por = v_quem,
         conciliado_em = now(), conciliacao_automatica = false
   where id = v_t.id;
  return v_fatura;
end;
$function$;
revoke all on function public.fn_conciliacao_casar_fatura(uuid, uuid, uuid[], jsonb) from public, anon;
grant execute on function public.fn_conciliacao_casar_fatura(uuid, uuid, uuid[], jsonb) to authenticated;

-- -------------------------------------------------------------
-- Desfazer: tambem a fatura.
-- -------------------------------------------------------------
create or replace function public.fn_desconciliar_transacao(p_transacao_id uuid)
returns void
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_conta uuid;
  v_data date;
  v_par uuid;
  v_par_data date;
  v_fatura uuid;
  v_encargos uuid;
  r record;
begin
  if not public.tem_permissao('financeiro.conciliacao', 'editar') then raise exception 'Sem permissao para conciliar'; end if;
  select conta_bancaria_id, data_movimento, estorno_par_id, cartao_fatura_id into v_conta, v_data, v_par, v_fatura
  from public.extrato_transacoes where id = p_transacao_id;
  perform public.fn_conciliacao_exigir_mes_aberto(v_conta, v_data);
  if v_par is not null then
    select data_movimento into v_par_data from public.extrato_transacoes where id = v_par;
    perform public.fn_conciliacao_exigir_mes_aberto(v_conta, v_par_data);
  end if;
  update public.extrato_transacoes
  set conciliada = false, parcela_id = null, transferencia_id = null, estorno_par_id = null,
      cartao_fatura_id = null,
      conciliado_por = null, conciliado_em = null, conciliacao_automatica = false,
      confira_confirmado_em = null, confira_confirmado_por = null
  where id = p_transacao_id or (v_par is not null and id = v_par);

  if v_fatura is not null then
    -- As compras voltam ao estado de antes; os encargos saem.
    select encargos_lancamento_id into v_encargos from public.cartao_faturas where id = v_fatura;
    for r in select fp.*, lp.lancamento_id from public.cartao_fatura_parcelas fp
             join public.lancamento_parcelas lp on lp.id = fp.parcela_id
             where fp.fatura_id = v_fatura and fp.status_antes <> 'novo' loop
      update public.lancamento_parcelas
         set status = r.status_antes, conta_bancaria_id = r.conta_antes, data_pagamento = r.data_pagamento_antes,
             pago_por = r.pago_por_antes, pago_em = r.pago_em_antes
       where id = r.parcela_id;
      perform public.fn_recalcular_status_lancamento(r.lancamento_id);
    end loop;
    delete from public.cartao_faturas where id = v_fatura;
    if v_encargos is not null then
      delete from public.lancamentos where id = v_encargos;
    end if;
  end if;
end
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
      (exists (select 1 from public.extrato_transacoes e where e.parcela_id = p.id)
       or exists (select 1 from public.cartao_fatura_parcelas fp where fp.parcela_id = p.id)) as vinculada
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
          'memo', ep.memo) end,
        'fatura', case when cf.id is null then null else jsonb_build_object(
          'id', cf.id, 'cartaoNome', cc.nome, 'vencimento', cf.vencimento,
          'qtdCompras', (select count(*) from public.cartao_fatura_parcelas fp where fp.fatura_id = cf.id),
          'encargos', cf.encargos) end
      ) order by t.data_movimento, t.created_at)
      from public.extrato_transacoes t
      left join parcela_info pi on pi.id = t.parcela_id
      left join transf tf on tf.id = t.transferencia_id
      left join public.extrato_transacoes ep on ep.id = t.estorno_par_id
      left join public.cartao_faturas cf on cf.id = t.cartao_fatura_id
      left join public.cartoes_credito cc on cc.id = cf.cartao_id
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
