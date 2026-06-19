-- =============================================================
-- Fase 3 / Revisao: correcoes da revisao adversarial
-- Corrige defeitos confirmados no nucleo financeiro, todos no banco:
--  1. fn_salvar_lancamento: bloqueia edicao de lancamento nao-manual
--     (origem <> 'manual' edita-se na origem); rateio opcional de verdade
--     (so valida a soma quando ha rateio); valida a soma ja arredondada
--     por parcela/rateio (NUMERIC(14,2)), nao o input cru.
--  2. fn_conciliar_transacao: valida parcela paga, mesma conta, mesmo valor
--     em modulo, sentido (credito<->a_receber, debito<->a_pagar), parcela
--     ainda nao vinculada e transacao existente e nao conciliada.
--  3. extrato_transacoes: dedup por (conta_bancaria_id, fitid) com chave de
--     fallback deterministica quando o banco nao manda fitid.
--  4. fn_importar_extrato: valida conta existente e ativa + permissao de ver
--     contas bancarias; grava a chave de dedup.
--  5. fn_aprovar_ordem_compra / fn_registrar_recebimento: preenchem competencia
--     do lancamento (entra no DRE) e o recebimento reescala o rateio para
--     manter soma(rateios) = valor da NF.
-- =============================================================

-- -------------------------------------------------------------
-- 3 + 4. Dedup OFX por conta + fitid, com fallback para fitid nulo
-- -------------------------------------------------------------
-- A unique anterior era (extrato_id, fitid): como cada importacao cria um
-- extrato novo, reimportar o mesmo arquivo nunca colidia. A dedup correta e
-- por conta. Para transacoes sem fitid, derivamos uma chave deterministica
-- de conta+data+valor+memo, gravada em chave_dedup (generated).
alter table public.extrato_transacoes
  drop constraint if exists extrato_transacoes_extrato_id_fitid_key;

-- chave_dedup e populada pela fn_importar_extrato (coluna comum, nao generated:
-- date/numeric -> text dependem de DateStyle e nao sao immutable num generated).
alter table public.extrato_transacoes
  add column if not exists chave_dedup text;

comment on column public.extrato_transacoes.chave_dedup is 'Chave de deduplicacao por conta: fitid quando existe, senao chave deterministica de data+valor+memo. Evita reimportar a mesma transacao.';

create unique index if not exists extrato_transacoes_conta_chave_dedup_key
  on public.extrato_transacoes (conta_bancaria_id, chave_dedup);

create or replace function public.fn_importar_extrato(p_conta_id uuid, p_nome text, p_periodo_inicio date, p_periodo_fim date, p_transacoes jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare v_extrato uuid; v_t jsonb; v_inseridas int := 0; v_ignoradas int := 0; v_tipo text; v_conta_ativa boolean; v_fitid text; v_data date; v_valor numeric(14,2); v_memo text; v_chave text;
begin
  if not public.tem_permissao('financeiro.conciliacao', 'criar') then raise exception 'Sem permissao para importar extratos'; end if;
  if not public.tem_permissao('financeiro.contas-bancarias', 'ver') then raise exception 'Sem permissao para ver contas bancarias'; end if;
  if p_conta_id is null then raise exception 'Informe a conta bancaria'; end if;
  if p_transacoes is null or jsonb_array_length(p_transacoes) = 0 then raise exception 'O arquivo nao tem transacoes'; end if;

  select ativo into v_conta_ativa from public.contas_bancarias where id = p_conta_id;
  if v_conta_ativa is null then raise exception 'Conta bancaria nao encontrada'; end if;
  if not v_conta_ativa then raise exception 'Conta bancaria inativa'; end if;

  insert into public.extratos_ofx (conta_bancaria_id, nome_arquivo, periodo_inicio, periodo_fim, created_by)
  values (p_conta_id, p_nome, p_periodo_inicio, p_periodo_fim, (select auth.uid())) returning id into v_extrato;

  for v_t in select * from jsonb_array_elements(p_transacoes) loop
    v_fitid := nullif(btrim(v_t->>'fitid'), '');
    v_data := (v_t->>'data')::date;
    v_valor := (v_t->>'valor')::numeric;
    v_memo := v_t->>'memo';
    v_tipo := case when v_valor >= 0 then 'credito' else 'debito' end;
    -- fitid quando existe; senao chave deterministica (to_char nao depende de DateStyle)
    v_chave := coalesce(v_fitid, 'sd:' || to_char(v_data, 'YYYY-MM-DD') || ':' || to_char(v_valor, 'FM9999999999999990.00') || ':' || coalesce(v_memo, ''));
    begin
      insert into public.extrato_transacoes (extrato_id, conta_bancaria_id, data_movimento, valor, tipo, memo, fitid, chave_dedup)
      values (v_extrato, p_conta_id, v_data, v_valor, v_tipo, v_memo, v_fitid, v_chave);
      v_inseridas := v_inseridas + 1;
    exception when unique_violation then
      v_ignoradas := v_ignoradas + 1;
    end;
  end loop;

  return jsonb_build_object('extrato_id', v_extrato, 'inseridas', v_inseridas, 'ignoradas', v_ignoradas);
end $$;

-- -------------------------------------------------------------
-- 2. fn_conciliar_transacao: integridade do vinculo extrato <-> parcela
-- -------------------------------------------------------------
-- Garante que a mesma parcela so concilia uma vez (alem da validacao na RPC).
create unique index if not exists extrato_transacoes_parcela_unica
  on public.extrato_transacoes (parcela_id) where parcela_id is not null;

create or replace function public.fn_conciliar_transacao(p_transacao_id uuid, p_parcela_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_t_conta uuid; v_t_valor numeric(14,2); v_t_tipo text; v_t_conciliada boolean;
  v_p_status text; v_p_conta uuid; v_p_valor numeric(14,2); v_l_tipo text;
begin
  if not public.tem_permissao('financeiro.conciliacao', 'editar') then raise exception 'Sem permissao para conciliar'; end if;

  select t.conta_bancaria_id, t.valor, t.tipo, t.conciliada
  into v_t_conta, v_t_valor, v_t_tipo, v_t_conciliada
  from public.extrato_transacoes t where t.id = p_transacao_id;
  if v_t_conta is null then raise exception 'Transacao nao encontrada'; end if;
  if v_t_conciliada then raise exception 'Transacao ja conciliada'; end if;

  select p.status, p.conta_bancaria_id, p.valor, l.tipo
  into v_p_status, v_p_conta, v_p_valor, v_l_tipo
  from public.lancamento_parcelas p join public.lancamentos l on l.id = p.lancamento_id
  where p.id = p_parcela_id;
  if v_p_status is null then raise exception 'Parcela nao encontrada'; end if;
  if v_p_status <> 'pago' then raise exception 'So da para conciliar uma parcela ja paga'; end if;
  if v_p_conta is distinct from v_t_conta then raise exception 'A parcela e de outra conta bancaria'; end if;
  if round(v_p_valor, 2) <> round(abs(v_t_valor), 2) then raise exception 'O valor da parcela diverge do valor da transacao'; end if;
  if (v_t_tipo = 'credito' and v_l_tipo <> 'a_receber')
     or (v_t_tipo = 'debito' and v_l_tipo <> 'a_pagar') then
    raise exception 'O sentido da transacao nao corresponde ao tipo do lancamento';
  end if;
  if exists (select 1 from public.extrato_transacoes where parcela_id = p_parcela_id and id <> p_transacao_id) then
    raise exception 'Parcela ja conciliada com outra transacao';
  end if;

  update public.extrato_transacoes
  set conciliada = true, parcela_id = p_parcela_id, conciliado_por = (select auth.uid()), conciliado_em = now()
  where id = p_transacao_id;
end $$;

-- -------------------------------------------------------------
-- 1. fn_salvar_lancamento: origem somente-leitura + rateio opcional + soma por linha
-- -------------------------------------------------------------
create or replace function public.fn_salvar_lancamento(p_id uuid, p_dados jsonb, p_parcelas jsonb, p_rateios jsonb)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_id uuid := p_id; v_acao text; v_valor numeric(14,2);
  v_soma_parc numeric(14,2); v_soma_rat numeric(14,2); v_origem text; p jsonb; r jsonb;
begin
  v_acao := case when p_id is null then 'criar' else 'editar' end;
  if not public.tem_permissao('financeiro.lancamentos', v_acao) then
    raise exception 'Sem permissao para % lancamentos', v_acao;
  end if;

  v_valor := (p_dados->>'valor')::numeric;
  if v_valor is null or v_valor < 0 then raise exception 'Valor invalido'; end if;

  -- soma das parcelas ja arredondada por linha (cada coluna valor e numeric(14,2))
  select coalesce(sum(round((x->>'valor')::numeric, 2)), 0) into v_soma_parc from jsonb_array_elements(coalesce(p_parcelas,'[]'::jsonb)) x;
  if v_soma_parc <> round(v_valor, 2) then
    raise exception 'A soma das parcelas (R$ %) deve ser igual ao valor do lancamento (R$ %)', v_soma_parc, v_valor;
  end if;
  -- rateio e opcional: so valida a soma quando ha ao menos um rateio
  if jsonb_array_length(coalesce(p_rateios,'[]'::jsonb)) > 0 then
    select coalesce(sum(round((x->>'valor')::numeric, 2)), 0) into v_soma_rat from jsonb_array_elements(p_rateios) x;
    if v_soma_rat <> round(v_valor, 2) then
      raise exception 'A soma do rateio (R$ %) deve ser igual ao valor do lancamento (R$ %)', v_soma_rat, v_valor;
    end if;
  end if;

  if v_acao = 'criar' then
    insert into public.lancamentos (tipo, origem, fornecedor_id, categoria_id, descricao, valor, status, competencia, data_vencimento, created_by)
    values (
      coalesce(p_dados->>'tipo','a_pagar'), 'manual',
      nullif(p_dados->>'fornecedor_id','')::uuid, nullif(p_dados->>'categoria_id','')::uuid,
      p_dados->>'descricao', v_valor, 'a_pagar',
      nullif(p_dados->>'competencia','')::date, nullif(p_dados->>'data_vencimento','')::date, (select auth.uid())
    ) returning id into v_id;
  else
    select origem into v_origem from public.lancamentos where id = v_id;
    if v_origem is null then raise exception 'Lancamento nao encontrado'; end if;
    if v_origem <> 'manual' then
      raise exception 'Lancamento de origem % e somente-leitura aqui. Edite na origem.', v_origem;
    end if;
    if exists (select 1 from public.lancamento_parcelas where lancamento_id = v_id and status = 'pago') then
      raise exception 'Nao da para editar um lancamento com parcela ja paga';
    end if;
    update public.lancamentos set
      tipo = coalesce(p_dados->>'tipo', tipo),
      fornecedor_id = nullif(p_dados->>'fornecedor_id','')::uuid,
      categoria_id = nullif(p_dados->>'categoria_id','')::uuid,
      descricao = p_dados->>'descricao', valor = v_valor,
      competencia = nullif(p_dados->>'competencia','')::date,
      data_vencimento = nullif(p_dados->>'data_vencimento','')::date
    where id = v_id;
    delete from public.lancamento_parcelas where lancamento_id = v_id;
    delete from public.lancamento_rateios where lancamento_id = v_id;
  end if;

  for p in select * from jsonb_array_elements(p_parcelas) loop
    insert into public.lancamento_parcelas (lancamento_id, numero_parcela, valor, data_vencimento, status, created_by)
    values (v_id, coalesce((p->>'numero_parcela')::smallint, 1), (p->>'valor')::numeric, nullif(p->>'data_vencimento','')::date, 'pendente', (select auth.uid()));
  end loop;
  for r in select * from jsonb_array_elements(coalesce(p_rateios,'[]'::jsonb)) loop
    insert into public.lancamento_rateios (lancamento_id, centro_custo_id, valor, created_by)
    values (v_id, (r->>'centro_custo_id')::uuid, (r->>'valor')::numeric, (select auth.uid()));
  end loop;

  return v_id;
end $$;

-- -------------------------------------------------------------
-- 5. fn_aprovar_ordem_compra: lancamento da OC entra no DRE (competencia)
-- -------------------------------------------------------------
create or replace function public.fn_aprovar_ordem_compra(p_oc_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_status text;
  v_fornecedor uuid;
  v_total numeric(14, 2);
  v_numero text;
  v_lanc_id uuid;
  v_competencia date;
begin
  if not public.tem_permissao('compras.ordens', 'aprovar') then
    raise exception 'Sem permissao para aprovar ordens de compra';
  end if;

  select status, fornecedor_id, valor_total, numero
  into v_status, v_fornecedor, v_total, v_numero
  from public.ordens_compra where id = p_oc_id;

  if v_status is null then
    raise exception 'Ordem de compra nao encontrada';
  end if;
  if v_status <> 'pendente_aprovacao' then
    raise exception 'A ordem de compra precisa estar pendente de aprovacao';
  end if;

  update public.ordens_compra
  set status = 'aprovado', aprovado_por = (select auth.uid()), aprovado_em = now()
  where id = p_oc_id;

  v_competencia := (now() at time zone 'America/Rio_Branco')::date;

  insert into public.lancamentos (tipo, origem, origem_id, fornecedor_id, descricao, valor, status, competencia, created_by)
  values ('a_pagar', 'oc', p_oc_id, v_fornecedor, 'Ordem de compra ' || coalesce(v_numero, ''), v_total, 'previsto', v_competencia, (select auth.uid()))
  returning id into v_lanc_id;

  -- 1 parcela previsto (sem vencimento ate o recebimento confirmar)
  insert into public.lancamento_parcelas (lancamento_id, numero_parcela, valor, status, created_by)
  values (v_lanc_id, 1, v_total, 'pendente', (select auth.uid()));

  -- rateio pelos centros de custo dos itens da OC
  insert into public.lancamento_rateios (lancamento_id, centro_custo_id, valor, created_by)
  select v_lanc_id, oi.centro_custo_id, sum(oi.quantidade * oi.preco_unitario), (select auth.uid())
  from public.oc_itens oi
  where oi.ordem_compra_id = p_oc_id
  group by oi.centro_custo_id;
end $$;

-- -------------------------------------------------------------
-- 5. fn_registrar_recebimento: competencia + rateio reescalado para o valor da NF
-- -------------------------------------------------------------
create or replace function public.fn_registrar_recebimento(
  p_oc_id uuid, p_numero_nf text, p_valor_nf numeric, p_data_recebimento date,
  p_data_vencimento date, p_itens jsonb, p_observacoes text default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_oc_status text;
  v_fornecedor uuid;
  v_numero_oc text;
  v_recebimento_id uuid;
  v_esperado numeric(14, 2);
  v_tolerancia numeric;
  v_item jsonb;
  v_total_pedido numeric(14, 3);
  v_total_recebido numeric(14, 3);
  v_lancamento_id uuid;
  v_ja_recebido numeric(14, 3);
  v_qtd_pedida numeric(14, 3);
  v_valor_lanc numeric(14, 2);
  v_competencia date;
  v_soma_rat numeric(14, 2);
  v_ajuste numeric(14, 2);
begin
  if not public.tem_permissao('compras.recebimentos', 'criar') then
    raise exception 'Sem permissao para registrar recebimentos';
  end if;

  select status, fornecedor_id, numero into v_oc_status, v_fornecedor, v_numero_oc
  from public.ordens_compra where id = p_oc_id;
  if v_oc_status is null then
    raise exception 'Ordem de compra nao encontrada';
  end if;
  if v_oc_status not in ('aprovado', 'recebido_parcial') then
    raise exception 'So da para receber uma OC aprovada';
  end if;
  if p_itens is null or jsonb_array_length(p_itens) = 0 then
    raise exception 'Informe ao menos um item recebido';
  end if;

  -- valida cada item: pertence a OC e nao excede o saldo
  for v_item in select * from jsonb_array_elements(p_itens)
  loop
    select oi.quantidade into v_qtd_pedida
    from public.oc_itens oi
    where oi.id = (v_item->>'oc_item_id')::uuid and oi.ordem_compra_id = p_oc_id;
    if v_qtd_pedida is null then
      raise exception 'Item nao pertence a ordem de compra informada';
    end if;
    select coalesce(sum(ri.quantidade_recebida), 0) into v_ja_recebido
    from public.recebimento_itens ri
    join public.recebimentos r on r.id = ri.recebimento_id
    where ri.oc_item_id = (v_item->>'oc_item_id')::uuid and r.status = 'registrado';
    if v_ja_recebido + (v_item->>'quantidade_recebida')::numeric > v_qtd_pedida then
      raise exception 'Quantidade recebida excede o saldo do item';
    end if;
  end loop;

  select coalesce(sum((item->>'quantidade_recebida')::numeric * oi.preco_unitario), 0)
  into v_esperado
  from jsonb_array_elements(p_itens) item
  join public.oc_itens oi on oi.id = (item->>'oc_item_id')::uuid
  where oi.ordem_compra_id = p_oc_id;

  select coalesce((valor)::numeric, 0) into v_tolerancia
  from public.configuracoes where chave = 'tolerancia_divergencia_nf_percentual';

  if p_valor_nf is not null and v_esperado > 0 then
    if abs(p_valor_nf - v_esperado) > v_esperado * (coalesce(v_tolerancia, 0) / 100.0) then
      raise exception 'Valor da NF (R$ %) diverge do esperado (R$ %) acima da tolerancia de %.', p_valor_nf, v_esperado, (coalesce(v_tolerancia, 0)::text || '%');
    end if;
  end if;

  insert into public.recebimentos (ordem_compra_id, numero_nf, valor_nf, data_recebimento, data_vencimento, observacoes, created_by)
  values (p_oc_id, p_numero_nf, p_valor_nf, coalesce(p_data_recebimento, (now() at time zone 'America/Rio_Branco')::date), p_data_vencimento, p_observacoes, (select auth.uid()))
  returning id into v_recebimento_id;

  for v_item in select * from jsonb_array_elements(p_itens)
  loop
    insert into public.recebimento_itens (recebimento_id, oc_item_id, quantidade_recebida)
    values (v_recebimento_id, (v_item->>'oc_item_id')::uuid, (v_item->>'quantidade_recebida')::numeric);
  end loop;

  select coalesce(sum(quantidade), 0) into v_total_pedido from public.oc_itens where ordem_compra_id = p_oc_id;
  select coalesce(sum(ri.quantidade_recebida), 0) into v_total_recebido
  from public.recebimento_itens ri join public.recebimentos r on r.id = ri.recebimento_id
  where r.ordem_compra_id = p_oc_id and r.status = 'registrado';

  update public.ordens_compra
  set status = case when v_total_recebido >= v_total_pedido then 'recebido' else 'recebido_parcial' end
  where id = p_oc_id;

  v_competencia := coalesce(p_data_recebimento, (now() at time zone 'America/Rio_Branco')::date);

  -- confirma o financeiro: lancamento previsto da OC vira a_pagar + parcela
  select id into v_lancamento_id from public.lancamentos
  where origem = 'oc' and origem_id = p_oc_id and status = 'previsto' order by created_at limit 1;

  if v_lancamento_id is not null then
    v_valor_lanc := coalesce(p_valor_nf, (select valor from public.lancamentos where id = v_lancamento_id));
    update public.lancamentos
    set status = 'a_pagar', valor = v_valor_lanc, competencia = v_competencia, data_vencimento = p_data_vencimento
    where id = v_lancamento_id;
    update public.lancamento_parcelas
    set valor = v_valor_lanc, data_vencimento = p_data_vencimento
    where lancamento_id = v_lancamento_id;

    -- mantem soma(rateios) = valor da NF: reescala proporcional e ajusta o
    -- maior rateio com o residuo de arredondamento (o rateio e a fonte de
    -- verdade do custo por CC).
    select coalesce(sum(valor), 0) into v_soma_rat from public.lancamento_rateios where lancamento_id = v_lancamento_id;
    if v_soma_rat > 0 and v_soma_rat <> v_valor_lanc then
      update public.lancamento_rateios
      set valor = round(valor * v_valor_lanc / v_soma_rat, 2)
      where lancamento_id = v_lancamento_id;
      select v_valor_lanc - coalesce(sum(valor), 0) into v_ajuste from public.lancamento_rateios where lancamento_id = v_lancamento_id;
      if v_ajuste <> 0 then
        update public.lancamento_rateios
        set valor = valor + v_ajuste
        where id = (select id from public.lancamento_rateios where lancamento_id = v_lancamento_id order by valor desc, id limit 1);
      end if;
    end if;
  else
    insert into public.lancamentos (tipo, origem, origem_id, fornecedor_id, descricao, valor, status, competencia, data_vencimento, created_by)
    values ('a_pagar', 'oc', p_oc_id, v_fornecedor, 'Recebimento da OC ' || coalesce(v_numero_oc, ''), coalesce(p_valor_nf, 0), 'a_pagar', v_competencia, p_data_vencimento, (select auth.uid()))
    returning id into v_lancamento_id;
    insert into public.lancamento_parcelas (lancamento_id, numero_parcela, valor, data_vencimento, status, created_by)
    values (v_lancamento_id, 1, coalesce(p_valor_nf, 0), p_data_vencimento, 'pendente', (select auth.uid()));
  end if;

  return v_recebimento_id;
end $$;
