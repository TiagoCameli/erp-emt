-- =============================================================
-- Conciliacao 100% precisa, Bloco F: fechamento do mes gravado
--
-- Pedido do Tiago (03/10/2026): "fechado" era calculado na hora e nada
-- impedia desconciliar ou lancar num mes ja conferido.
--
-- 1. conciliacao_fechamentos: um fechamento ativo por conta e mes (os
--    reabertos ficam como historico). RLS de leitura para quem ve a
--    Conciliacao; escrita so pelas RPCs. Auditoria universal.
-- 2. fn_conciliacao_fechar_mes recalcula no servidor (nao confia no cliente):
--    recusa com movimento faltando no app, sobrando no app, ou saldo do banco
--    diferente do app (ou sem saldo no arquivo). Grava os dois saldos.
--    fn_conciliacao_reabrir_mes exige motivo.
-- 3. Mes fechado bloqueia, naquela conta e mes: casar, desconciliar, lancar,
--    lancar transferencia (as duas contas), trocar conta (as duas contas),
--    excluir lancamento e estornar pagamento/recebimento conciliado.
--    So o corpo dessas funcoes muda; as assinaturas sao as mesmas.
-- 4. Importar num mes fechado e permitido; se entrar movimento novo, o mes
--    reabre sozinho com motivo "novo movimento importado" (auditado).
-- 5. O painel devolve o fechamento do mes.
-- 6. fn_desconciliar_transacao passa a limpar tambem o selo de automatico.
-- =============================================================

create table if not exists public.conciliacao_fechamentos (
  id uuid primary key default gen_random_uuid(),
  conta_bancaria_id uuid not null references public.contas_bancarias(id),
  mes date not null check (mes = date_trunc('month', mes)::date),
  saldo_banco numeric(14, 2) not null,
  saldo_app numeric(14, 2) not null,
  fechado_por uuid references public.usuarios(id),
  fechado_em timestamptz not null default now(),
  reaberto_por uuid references public.usuarios(id),
  reaberto_em timestamptz,
  motivo_reabertura text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references public.usuarios(id),
  constraint conciliacao_fechamentos_reabertura_com_motivo
    check (reaberto_em is null or coalesce(btrim(motivo_reabertura), '') <> '')
);

create unique index if not exists conciliacao_fechamentos_ativo
  on public.conciliacao_fechamentos (conta_bancaria_id, mes) where reaberto_em is null;
create index if not exists idx_conciliacao_fechamentos_fechado_por on public.conciliacao_fechamentos (fechado_por);
create index if not exists idx_conciliacao_fechamentos_reaberto_por on public.conciliacao_fechamentos (reaberto_por);
create index if not exists idx_conciliacao_fechamentos_created_by on public.conciliacao_fechamentos (created_by);

alter table public.conciliacao_fechamentos enable row level security;
drop policy if exists conciliacao_fechamentos_select on public.conciliacao_fechamentos;
create policy conciliacao_fechamentos_select on public.conciliacao_fechamentos
  for select to authenticated
  using ((select public.tem_permissao('financeiro.conciliacao', 'ver')));
revoke all on table public.conciliacao_fechamentos from public, anon, authenticated;
grant select on table public.conciliacao_fechamentos to authenticated;

drop trigger if exists trg_audit_conciliacao_fechamentos on public.conciliacao_fechamentos;
create trigger trg_audit_conciliacao_fechamentos after insert or update or delete on public.conciliacao_fechamentos
  for each row execute function public.fn_audit();
drop trigger if exists trg_conciliacao_fechamentos_updated_at on public.conciliacao_fechamentos;
create trigger trg_conciliacao_fechamentos_updated_at before update on public.conciliacao_fechamentos
  for each row execute function public.fn_set_updated_at();
drop trigger if exists trg_conciliacao_fechamentos_created_by on public.conciliacao_fechamentos;
create trigger trg_conciliacao_fechamentos_created_by before insert on public.conciliacao_fechamentos
  for each row execute function public.fn_set_created_by();

-- -------------------------------------------------------------
-- Trava de mes fechado
-- -------------------------------------------------------------
create or replace function public.fn_conciliacao_exigir_mes_aberto(p_conta_id uuid, p_data date)
returns void
language plpgsql
stable
security definer
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
end;
$function$;

revoke all on function public.fn_conciliacao_exigir_mes_aberto(uuid, date) from public, anon, authenticated;

-- -------------------------------------------------------------
-- Fechar e reabrir
-- -------------------------------------------------------------
create or replace function public.fn_conciliacao_fechar_mes(p_conta_id uuid, p_mes date)
returns uuid
language plpgsql
security definer
set search_path to ''
as $function$
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

  select e.saldo_final, least(coalesce(e.saldo_final_data, e.periodo_fim), e.periodo_fim)
    into v_banco, v_banco_data
  from public.extratos_ofx e
  where e.conta_bancaria_id = p_conta_id and e.periodo_inicio <= v_fim and e.periodo_fim >= v_fim
  order by e.importado_em desc limit 1;
  if v_banco is null then
    raise exception 'Nao da para fechar: nenhum extrato do fim do mes trouxe o saldo do banco';
  end if;
  v_app := public.fn_conciliacao_saldo_app_interno(p_conta_id, v_banco_data);
  if v_app <> v_banco then
    raise exception 'Nao da para fechar: o saldo do banco difere do app em R$ %', public.fn_conciliacao_brl(v_banco - v_app);
  end if;

  insert into public.conciliacao_fechamentos (conta_bancaria_id, mes, saldo_banco, saldo_app, fechado_por)
  values (p_conta_id, v_inicio, v_banco, v_app, (select auth.uid()))
  returning id into v_id;
  return v_id;
end;
$function$;

revoke all on function public.fn_conciliacao_fechar_mes(uuid, date) from public, anon;
grant execute on function public.fn_conciliacao_fechar_mes(uuid, date) to authenticated;

create or replace function public.fn_conciliacao_reabrir_mes(p_conta_id uuid, p_mes date, p_motivo text)
returns void
language plpgsql
security definer
set search_path to ''
as $function$
begin
  if not public.tem_permissao('financeiro.conciliacao', 'editar') then
    raise exception 'Sem permissao para conciliar';
  end if;
  if coalesce(btrim(p_motivo), '') = '' then
    raise exception 'Informe o motivo da reabertura';
  end if;
  update public.conciliacao_fechamentos
     set reaberto_em = now(), reaberto_por = (select auth.uid()), motivo_reabertura = btrim(p_motivo)
   where conta_bancaria_id = p_conta_id
     and mes = date_trunc('month', p_mes)::date
     and reaberto_em is null;
  if not found then raise exception 'Este mes nao esta fechado'; end if;
end;
$function$;

revoke all on function public.fn_conciliacao_reabrir_mes(uuid, date, text) from public, anon;
grant execute on function public.fn_conciliacao_reabrir_mes(uuid, date, text) to authenticated;

-- -------------------------------------------------------------
-- Desconciliar: trava de mes fechado e limpa o selo de automatico
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
begin
  if not public.tem_permissao('financeiro.conciliacao', 'editar') then raise exception 'Sem permissao para conciliar'; end if;
  select conta_bancaria_id, data_movimento into v_conta, v_data
  from public.extrato_transacoes where id = p_transacao_id;
  perform public.fn_conciliacao_exigir_mes_aberto(v_conta, v_data);
  update public.extrato_transacoes
  set conciliada = false, parcela_id = null, transferencia_id = null, conciliado_por = null,
      conciliado_em = null, conciliacao_automatica = false
  where id = p_transacao_id;
end
$function$;

-- -------------------------------------------------------------
-- As demais, com a trava (assinaturas iguais)
-- -------------------------------------------------------------
create or replace function public.fn_conciliacao_casar(
  p_transacao_id uuid,
  p_especie text,
  p_alvo_id uuid,
  p_automatica boolean,
  p_ajuste text
)
returns void
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_t public.extrato_transacoes;
  v_p public.lancamento_parcelas;
  v_tipo_lanc text;
  v_status_lanc text;
  v_mes_lanc date;
  v_conta_antiga text;
  v_conta_nova text;
  v_banco numeric(14, 2);
  v_diferenca numeric(14, 2);
  v_juros numeric(14, 2);
  v_desconto numeric(14, 2);
  v_partes text[] := '{}';
  v_muda_pago boolean;
  v_lanc_valor numeric(14, 2);
  v_lanc_origem text;
  v_soma_antiga numeric(14, 2);
  v_acumulado numeric(14, 2) := 0;
  v_rateio record;
  v_novo numeric(14, 2);
  v_qtd_rateios int;
  v_i int := 0;
begin
  if p_ajuste is not null and p_ajuste not in ('financeiro', 'custo') then
    raise exception 'Ajuste invalido: use financeiro ou custo';
  end if;
  if not public.tem_permissao('financeiro.conciliacao', 'editar') then
    raise exception 'Sem permissao para conciliar';
  end if;

  select * into v_t from public.extrato_transacoes where id = p_transacao_id for update;
  if v_t.id is null then raise exception 'Movimento do extrato nao encontrado'; end if;
  if v_t.conciliada then raise exception 'Este movimento ja esta conciliado'; end if;
  perform public.fn_conciliacao_exigir_mes_aberto(v_t.conta_bancaria_id, v_t.data_movimento);

  if p_especie = 'transferencia' then
    perform public.fn_conciliar_transferencia(p_transacao_id, p_alvo_id);
    update public.extrato_transacoes
       set conciliacao_automatica = coalesce(p_automatica, false)
     where id = p_transacao_id;
    return;
  end if;

  if p_especie is distinct from 'parcela' then
    raise exception 'Tipo de vinculo invalido';
  end if;

  select * into v_p from public.lancamento_parcelas where id = p_alvo_id for update;
  if v_p.id is null then raise exception 'Parcela nao encontrada'; end if;
  -- Tirar um pagamento de outra conta tambem mexe no mes fechado de la.
  if v_p.status = 'pago' and v_p.conta_bancaria_id is distinct from v_t.conta_bancaria_id then
    perform public.fn_conciliacao_exigir_mes_aberto(v_p.conta_bancaria_id, v_p.data_pagamento);
  end if;

  select l.tipo, l.status, l.mes_competencia, l.valor, l.origem
    into v_tipo_lanc, v_status_lanc, v_mes_lanc, v_lanc_valor, v_lanc_origem
  from public.lancamentos l where l.id = v_p.lancamento_id;
  if v_status_lanc = 'cancelado' then
    raise exception 'O lancamento desta parcela esta cancelado';
  end if;

  if (v_t.tipo = 'credito') <> (v_tipo_lanc = 'a_receber') then
    raise exception 'Credito so casa com recebimento, e debito so com pagamento';
  end if;

  if exists (select 1 from public.extrato_transacoes e where e.parcela_id = v_p.id) then
    raise exception 'Esta parcela ja esta conciliada com outro movimento';
  end if;

  if coalesce(p_automatica, false) and (
       p_ajuste is not null
       or v_p.status <> 'pago'
       or v_p.conta_bancaria_id is distinct from v_t.conta_bancaria_id
       or round(v_p.valor_liquido, 2) <> round(abs(v_t.valor), 2)
     ) then
    raise exception 'O casamento automatico so vincula parcela paga nesta conta com o valor exato';
  end if;

  v_banco := round(abs(v_t.valor), 2);
  v_diferenca := v_banco - round(v_p.valor_liquido, 2);

  if abs(v_diferenca) > 1 then
    raise exception 'O valor do extrato (R$ %) difere da parcela (R$ %) em mais de R$ 1,00: nao e o mesmo pagamento',
      v_banco, round(v_p.valor_liquido, 2);
  end if;
  if v_diferenca <> 0 and p_ajuste is null then
    raise exception 'O valor do extrato (R$ %) difere da parcela (R$ %)', v_banco, round(v_p.valor_liquido, 2);
  end if;

  -- Mexer em parcela paga (conta ou valor) e coisa de quem paga/recebe, e nao
  -- se faz em competencia fechada.
  -- Salario nao muda de valor por centavo de banco: RH so aceita financeiro.
  if v_diferenca <> 0 and p_ajuste = 'custo' and v_lanc_origem in (
       'folha', 'folha_guia', 'decimo_terceiro', 'decimo_terceiro_guia', 'ferias', 'ferias_guia',
       'rescisao', 'adiantamento', 'diaria', 'aplicacao') then
    raise exception 'Lancamento de origem % nao aceita ajuste como custo: salario e guia nao mudam de valor por centavo de banco. Use o ajuste financeiro (juros ou desconto).', v_lanc_origem;
  end if;

  v_muda_pago := v_p.status = 'pago'
    and (v_p.conta_bancaria_id is distinct from v_t.conta_bancaria_id or v_diferenca <> 0);
  -- Mudar o valor do fornecimento e mexer no pagamento mesmo com a parcela
  -- ainda aberta.
  if v_diferenca <> 0 and p_ajuste = 'custo' and not v_muda_pago then
    if not public.fn_conciliacao_pode_mexer_no_pago(v_tipo_lanc) then
      raise exception 'Sem permissao para alterar um pagamento ja registrado';
    end if;
    perform public.fn_exigir_competencia_aberta(v_mes_lanc, 'lancamento', v_p.lancamento_id);
  end if;
  if v_muda_pago then
    if not public.fn_conciliacao_pode_mexer_no_pago(v_tipo_lanc) then
      raise exception 'Sem permissao para alterar um pagamento ja registrado';
    end if;
    perform public.fn_exigir_competencia_aberta(v_mes_lanc, 'lancamento', v_p.lancamento_id);
  end if;

  if v_p.status = 'pago' then
    if v_p.conta_bancaria_id is distinct from v_t.conta_bancaria_id then
      select nome into v_conta_antiga from public.contas_bancarias where id = v_p.conta_bancaria_id;
      select nome into v_conta_nova from public.contas_bancarias where id = v_t.conta_bancaria_id;
      update public.lancamento_parcelas
         set conta_bancaria_id = v_t.conta_bancaria_id
       where id = v_p.id;
      v_partes := v_partes || format('conta trocada de %s para %s',
        coalesce(v_conta_antiga, 'nenhuma'), v_conta_nova);
    end if;
  elsif v_tipo_lanc = 'a_pagar' and v_p.status = 'aprovado' then
    if not public.tem_permissao('financeiro.pagamentos', 'criar') then
      raise exception 'Sem permissao para registrar pagamentos';
    end if;
  elsif v_tipo_lanc = 'a_pagar' then
    raise exception 'Esta parcela ainda nao foi aprovada para pagamento: aprove em Aprovacao de pagamentos antes de casar';
  elsif v_status_lanc is not null and v_p.status in ('pendente', 'aprovado') then
    if not public.tem_permissao('financeiro.recebimentos', 'editar') then
      raise exception 'Sem permissao para dar recebimento como recebido';
    end if;
  else
    raise exception 'Esta parcela nao pode ser conciliada (situacao: %)', v_p.status;
  end if;

  if v_p.status <> 'pago' then
    update public.lancamento_parcelas
       set status = 'pago',
           conta_bancaria_id = v_t.conta_bancaria_id,
           data_pagamento = v_t.data_movimento,
           pago_por = (select auth.uid()),
           pago_em = now()
     where id = v_p.id;
    v_partes := v_partes || format('baixa em %s pelo extrato',
      to_char(v_t.data_movimento, 'DD/MM/YYYY'));
  end if;

  if v_diferenca <> 0 and p_ajuste = 'financeiro' then
    v_juros := coalesce(v_p.juros, 0);
    v_desconto := coalesce(v_p.desconto, 0);
    if v_diferenca > 0 then
      if v_desconto >= v_diferenca then
        v_desconto := v_desconto - v_diferenca;
      else
        v_juros := v_juros + (v_diferenca - v_desconto);
        v_desconto := 0;
      end if;
    else
      if v_juros >= -v_diferenca then
        v_juros := v_juros + v_diferenca;
      else
        v_desconto := v_desconto + (-v_diferenca - v_juros);
        v_juros := 0;
      end if;
    end if;

    if v_desconto > v_p.valor then
      raise exception 'A diferenca e maior que a propria parcela: confira o movimento';
    end if;

    update public.lancamento_parcelas
       set juros = v_juros, desconto = v_desconto
     where id = v_p.id;
    v_partes := v_partes || format('valor ajustado de R$ %s para R$ %s - %s',
      public.fn_conciliacao_brl(round(v_p.valor_liquido, 2)),
      public.fn_conciliacao_brl(v_banco),
      case when v_diferenca > 0 then 'juros' else 'desconto' end);
  elsif v_diferenca <> 0 and p_ajuste = 'custo' then
    -- O valor do fornecimento muda: parcela, lancamento, forma da parcela e
    -- rateios (proporcional, o ultimo absorve o arredondamento). Juros e
    -- desconto nao mudam. A OC de origem nao e tocada: ela e o pedido, o
    -- lancamento e o que foi pago.
    if v_p.valor + v_diferenca < coalesce(v_p.desconto, 0) then
      raise exception 'O ajuste deixaria a parcela menor que o desconto ja dado';
    end if;
    update public.lancamento_parcelas set valor = valor + v_diferenca where id = v_p.id;
    if v_p.lancamento_forma_id is not null then
      update public.lancamento_formas set valor = valor + v_diferenca where id = v_p.lancamento_forma_id;
    end if;
    update public.lancamentos set valor = valor + v_diferenca where id = v_p.lancamento_id;

    select count(*), coalesce(sum(valor), 0) into v_qtd_rateios, v_soma_antiga
    from public.lancamento_rateios where lancamento_id = v_p.lancamento_id;
    for v_rateio in
      select id, valor from public.lancamento_rateios
      where lancamento_id = v_p.lancamento_id
      order by created_at, id
    loop
      v_i := v_i + 1;
      if v_i = v_qtd_rateios then
        v_novo := (v_lanc_valor + v_diferenca) - v_acumulado;
      elsif v_soma_antiga = 0 then
        v_novo := v_rateio.valor;
      else
        v_novo := round(v_rateio.valor * (v_lanc_valor + v_diferenca) / v_soma_antiga, 2);
      end if;
      v_acumulado := v_acumulado + v_novo;
      update public.lancamento_rateios set valor = v_novo where id = v_rateio.id;
    end loop;

    v_partes := v_partes || format('valor do fornecimento ajustado de R$ %s para R$ %s (diferenca R$ %s) - custo',
      public.fn_conciliacao_brl(round(v_p.valor, 2)),
      public.fn_conciliacao_brl(round(v_p.valor + v_diferenca, 2)),
      public.fn_conciliacao_brl(v_diferenca));
  end if;

  if array_length(v_partes, 1) > 0 then
    insert into public.parcela_eventos (parcela_id, tipo, motivo, valor_de, valor_para, created_by)
    values (
      v_p.id, 'alterou',
      'Conciliacao do extrato: ' || array_to_string(v_partes, '; '),
      case when v_diferenca <> 0 then round(v_p.valor_liquido, 2) end,
      case when v_diferenca <> 0 then v_banco end,
      (select auth.uid())
    );
    perform public.fn_recalcular_status_lancamento(v_p.lancamento_id);
  end if;

  if v_p.status <> 'pago' then
    perform public.fn_propagar_anexos('lancamento', v_p.lancamento_id, 'pagamento', v_p.id);
  end if;

  perform public.fn_conciliar_transacao(p_transacao_id, v_p.id);
  update public.extrato_transacoes
     set conciliacao_automatica = coalesce(p_automatica, false)
   where id = p_transacao_id;
end;
$function$;

create or replace function public.fn_conciliacao_lancar(
  p_transacao_id uuid,
  p_dados jsonb
)
returns uuid
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_t public.extrato_transacoes;
  v_tipo text;
  v_valor numeric(14, 2);
  v_mes date;
  v_centro uuid;
  v_centro_ok boolean;
  v_categoria uuid;
  v_categoria_tipo text;
  v_descricao text;
  v_lanc uuid;
  v_parcela uuid;
  v_quem uuid := (select auth.uid());
begin
  if not public.tem_permissao('financeiro.conciliacao', 'editar') then
    raise exception 'Sem permissao para conciliar';
  end if;

  select * into v_t from public.extrato_transacoes where id = p_transacao_id for update;
  if v_t.id is null then raise exception 'Movimento do extrato nao encontrado'; end if;
  if v_t.conciliada then raise exception 'Este movimento ja esta conciliado'; end if;
  perform public.fn_conciliacao_exigir_mes_aberto(v_t.conta_bancaria_id, v_t.data_movimento);

  v_tipo := case when v_t.tipo = 'credito' then 'a_receber' else 'a_pagar' end;
  if not public.fn_pode_lancar_tipo(v_tipo, 'criar') then
    raise exception 'Sem permissao para criar lancamentos';
  end if;

  v_valor := round(abs(v_t.valor), 2);
  v_descricao := nullif(btrim(coalesce(p_dados->>'descricao', '')), '');
  if v_descricao is null then
    v_descricao := coalesce(nullif(btrim(coalesce(v_t.memo, '')), ''), 'Movimento do extrato');
  end if;
  v_descricao := left(v_descricao, 500);

  begin
    v_mes := (p_dados->>'mesCompetencia')::date;
  exception when others then
    raise exception 'Mes de referencia invalido';
  end;
  if v_mes is null then raise exception 'Informe o mes de referencia'; end if;
  v_mes := date_trunc('month', v_mes)::date;

  begin
    v_centro := (p_dados->>'centroCustoId')::uuid;
    v_categoria := nullif(p_dados->>'categoriaId', '')::uuid;
  exception when others then
    raise exception 'Centro de custo ou categoria invalidos';
  end;
  if v_centro is null then raise exception 'Informe o centro de custo'; end if;
  select c.ativo into v_centro_ok from public.centros_custo c where c.id = v_centro;
  if v_centro_ok is null then raise exception 'Centro de custo nao encontrado'; end if;
  if not v_centro_ok then raise exception 'Centro de custo inativo'; end if;

  if v_categoria is not null then
    select c.tipo into v_categoria_tipo from public.categorias_financeiras c where c.id = v_categoria;
    if v_categoria_tipo is null then raise exception 'Categoria nao encontrada'; end if;
    if v_categoria_tipo <> (case when v_tipo = 'a_receber' then 'receita' else 'despesa' end) then
      raise exception 'A categoria escolhida nao e do tipo deste movimento';
    end if;
  end if;

  v_lanc := gen_random_uuid();
  perform public.fn_exigir_competencia_aberta(v_mes, 'lancamento', v_lanc);

  insert into public.lancamentos (
    id, tipo, origem, fornecedor_id, cliente_id, categoria_id, centro_custo_id,
    descricao, valor, status, data_compra, mes_competencia, data_vencimento,
    numero_documento, observacoes, created_by
  ) values (
    v_lanc, v_tipo, 'manual',
    case when v_tipo = 'a_pagar' then nullif(p_dados->>'fornecedorId', '')::uuid end,
    case when v_tipo = 'a_receber' then nullif(p_dados->>'clienteId', '')::uuid end,
    v_categoria,
    v_centro,
    v_descricao, v_valor, 'pago', v_t.data_movimento, v_mes, v_t.data_movimento,
    nullif(left(btrim(coalesce(p_dados->>'numeroDocumento', '')), 60), ''),
    left(coalesce(nullif(btrim(coalesce(p_dados->>'observacoes', '')), ''),
      'Lancado na conciliacao do extrato: ' || coalesce(v_t.memo, '-')), 2000),
    v_quem
  );

  insert into public.lancamento_parcelas (
    lancamento_id, numero_parcela, valor, data_vencimento, status,
    conta_bancaria_id, data_pagamento, pago_por, pago_em, created_by
  ) values (
    v_lanc, 1, v_valor, v_t.data_movimento, 'pago',
    v_t.conta_bancaria_id, v_t.data_movimento, v_quem, now(), v_quem
  ) returning id into v_parcela;

  insert into public.lancamento_rateios (lancamento_id, centro_custo_id, valor, categoria_id, created_by)
  values (v_lanc, v_centro, v_valor, v_categoria, v_quem);

  perform public.fn_conciliar_transacao(p_transacao_id, v_parcela);
  update public.extrato_transacoes set conciliacao_automatica = false where id = p_transacao_id;

  return v_lanc;
end;
$function$;

create or replace function public.fn_conciliacao_lancar_transferencia(
  p_transacao_id uuid,
  p_conta_contraparte_id uuid,
  p_centro_custo_id uuid default null,
  p_descricao text default null
)
returns uuid
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_t public.extrato_transacoes;
  v_id uuid;
begin
  if not public.tem_permissao('financeiro.conciliacao', 'editar') then
    raise exception 'Sem permissao para conciliar';
  end if;

  select * into v_t from public.extrato_transacoes where id = p_transacao_id for update;
  if v_t.id is null then raise exception 'Movimento do extrato nao encontrado'; end if;
  if v_t.conciliada then raise exception 'Este movimento ja esta conciliado'; end if;
  if p_conta_contraparte_id is null then raise exception 'Escolha a outra conta da transferencia'; end if;
  perform public.fn_conciliacao_exigir_mes_aberto(v_t.conta_bancaria_id, v_t.data_movimento);
  perform public.fn_conciliacao_exigir_mes_aberto(p_conta_contraparte_id, v_t.data_movimento);

  v_id := public.fn_salvar_transferencia(
    null,
    case when v_t.tipo = 'debito' then v_t.conta_bancaria_id else p_conta_contraparte_id end,
    case when v_t.tipo = 'debito' then p_conta_contraparte_id else v_t.conta_bancaria_id end,
    v_t.data_movimento,
    abs(v_t.valor),
    0,
    coalesce(nullif(btrim(coalesce(p_descricao, '')), ''), v_t.memo),
    'Lancada na conciliacao do extrato',
    p_centro_custo_id
  );

  perform public.fn_conciliar_transferencia(p_transacao_id, v_id);
  update public.extrato_transacoes set conciliacao_automatica = false where id = p_transacao_id;
  return v_id;
end;
$function$;

create or replace function public.fn_conciliacao_trocar_conta(
  p_parcela_id uuid,
  p_conta_id uuid,
  p_motivo text
)
returns void
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_p public.lancamento_parcelas;
  v_tipo text;
  v_mes date;
  v_antiga text;
  v_nova text;
  v_ativa boolean;
begin
  if not public.tem_permissao('financeiro.conciliacao', 'editar') then
    raise exception 'Sem permissao para conciliar';
  end if;
  if coalesce(btrim(p_motivo), '') = '' then
    raise exception 'Informe o motivo da troca de conta';
  end if;

  select * into v_p from public.lancamento_parcelas where id = p_parcela_id for update;
  if v_p.id is null then raise exception 'Parcela nao encontrada'; end if;
  if v_p.status <> 'pago' then raise exception 'So parcela paga muda de conta por aqui'; end if;
  perform public.fn_conciliacao_exigir_mes_aberto(v_p.conta_bancaria_id, v_p.data_pagamento);
  perform public.fn_conciliacao_exigir_mes_aberto(p_conta_id, v_p.data_pagamento);
  if exists (select 1 from public.extrato_transacoes e where e.parcela_id = v_p.id) then
    raise exception 'Esta parcela esta conciliada: desfaca a conciliacao primeiro';
  end if;

  select l.tipo, l.mes_competencia into v_tipo, v_mes from public.lancamentos l where l.id = v_p.lancamento_id;
  if not public.fn_conciliacao_pode_mexer_no_pago(v_tipo) then
    raise exception 'Sem permissao para alterar um pagamento ja registrado';
  end if;
  perform public.fn_exigir_competencia_aberta(v_mes, 'lancamento', v_p.lancamento_id);

  select nome, ativo into v_nova, v_ativa from public.contas_bancarias where id = p_conta_id;
  if v_nova is null then raise exception 'Conta bancaria nao encontrada'; end if;
  if not v_ativa then raise exception 'Conta bancaria inativa'; end if;
  if v_p.conta_bancaria_id = p_conta_id then raise exception 'A parcela ja esta nesta conta'; end if;

  select nome into v_antiga from public.contas_bancarias where id = v_p.conta_bancaria_id;

  update public.lancamento_parcelas set conta_bancaria_id = p_conta_id where id = v_p.id;

  insert into public.parcela_eventos (parcela_id, tipo, motivo, created_by)
  values (
    v_p.id, 'alterou',
    format('Conciliacao do extrato: conta trocada de %s para %s. %s',
      coalesce(v_antiga, 'nenhuma'), v_nova, btrim(p_motivo)),
    (select auth.uid())
  );
end;
$function$;

create or replace function public.fn_conciliacao_excluir_lancamento(
  p_parcela_id uuid,
  p_motivo text
)
returns void
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_lanc public.lancamentos;
  v_qtd int;
begin
  if not public.tem_permissao('financeiro.conciliacao', 'editar') then
    raise exception 'Sem permissao para conciliar';
  end if;
  if not public.tem_permissao('financeiro.lancamentos', 'excluir') then
    raise exception 'Sem permissao para excluir lancamentos';
  end if;
  if coalesce(btrim(p_motivo), '') = '' then
    raise exception 'Informe o motivo da exclusao';
  end if;

  select l.* into v_lanc
  from public.lancamentos l
  join public.lancamento_parcelas p on p.lancamento_id = l.id
  where p.id = p_parcela_id
  for update of l;
  if v_lanc.id is null then raise exception 'Parcela nao encontrada'; end if;
  perform public.fn_conciliacao_exigir_mes_aberto(p.conta_bancaria_id, p.data_pagamento)
    from public.lancamento_parcelas p where p.lancamento_id = v_lanc.id and p.status = 'pago';

  if v_lanc.origem <> 'manual' then
    raise exception 'Este lancamento veio de outro modulo (%): corrija na origem', v_lanc.origem;
  end if;

  select count(*) into v_qtd from public.lancamento_parcelas where lancamento_id = v_lanc.id;
  if v_qtd > 1 then
    raise exception 'Este lancamento tem % parcelas: excluir aqui apagaria todas. Estorne esta parcela em Pagamentos ou corrija o lancamento em Lancamentos', v_qtd;
  end if;

  if exists (
    select 1 from public.extrato_transacoes e
    join public.lancamento_parcelas p on p.id = e.parcela_id
    where p.lancamento_id = v_lanc.id
  ) then
    raise exception 'Uma parcela deste lancamento esta conciliada: desfaca a conciliacao primeiro';
  end if;

  perform public.fn_exigir_competencia_aberta(v_lanc.mes_competencia, 'lancamento', v_lanc.id);

  insert into arquivo_morto.lancamentos_excluidos_conciliacao
    (lancamento_id, motivo, excluido_por, lancamento, parcelas, rateios, formas, eventos)
  values (
    v_lanc.id, btrim(p_motivo), (select auth.uid()), to_jsonb(v_lanc),
    coalesce((select jsonb_agg(to_jsonb(p)) from public.lancamento_parcelas p where p.lancamento_id = v_lanc.id), '[]'),
    coalesce((select jsonb_agg(to_jsonb(r)) from public.lancamento_rateios r where r.lancamento_id = v_lanc.id), '[]'),
    coalesce((select jsonb_agg(to_jsonb(f)) from public.lancamento_formas f where f.lancamento_id = v_lanc.id), '[]'),
    coalesce((select jsonb_agg(to_jsonb(e)) from public.parcela_eventos e
              join public.lancamento_parcelas p on p.id = e.parcela_id
              where p.lancamento_id = v_lanc.id), '[]')
  );

  delete from public.lancamentos where id = v_lanc.id;
end;
$function$;

create or replace function public.fn_estornar_pagamento(p_parcela_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare v_status text; v_lanc uuid; v_tipo text;
begin
  select p.status, p.lancamento_id, l.tipo into v_status, v_lanc, v_tipo
    from public.lancamento_parcelas p join public.lancamentos l on l.id = p.lancamento_id
    where p.id = p_parcela_id;
  if v_status is null then raise exception 'Parcela nao encontrada'; end if;
  -- Bloco F: pagamento conciliado num mes fechado nao se estorna.
  perform public.fn_conciliacao_exigir_mes_aberto(p.conta_bancaria_id, p.data_pagamento)
    from public.lancamento_parcelas p
   where p.id = p_parcela_id and p.status = 'pago'
     and exists (select 1 from public.extrato_transacoes t where t.parcela_id = p.id);
  if exists (select 1 from public.lancamentos l join public.lancamento_parcelas lp on lp.lancamento_id = l.id where lp.id = p_parcela_id and l.origem = 'aplicacao') then
    raise exception 'Nao da para estornar: este lancamento foi gerado pela posicao da aplicacao. Regrave ou exclua a posicao em Financeiro > Aplicacoes';
  end if;

  if v_tipo = 'a_pagar' then
    if not public.tem_permissao('financeiro.pagamentos', 'excluir') then
      raise exception 'Sem permissao para estornar pagamentos';
    end if;
    if v_status <> 'pago' then raise exception 'Esta parcela nao esta paga'; end if;
  else
    if not public.tem_permissao('financeiro.recebimentos', 'excluir') then
      raise exception 'Sem permissao para estornar recebimentos';
    end if;
    if v_status <> 'pago' then raise exception 'Este recebimento nao esta baixado'; end if;
  end if;

  if exists (select 1 from public.extrato_transacoes t where t.parcela_id = p_parcela_id) then
    if v_tipo = 'a_pagar' then
      raise exception 'Nao da para estornar: este pagamento esta conciliado. Desfaca a conciliacao primeiro';
    else
      raise exception 'Nao da para estornar: este recebimento esta conciliado. Desfaca a conciliacao primeiro';
    end if;
  end if;

  update public.lancamento_parcelas
    set status = case when v_tipo = 'a_pagar' then 'aprovado' else 'pendente' end,
        -- So o a pagar perde a conta: no a receber ela e o destino escolhido no
        -- cadastro, nao um resto da baixa.
        conta_bancaria_id = case when v_tipo = 'a_pagar' then null else conta_bancaria_id end,
        data_pagamento = null, pago_por = null, pago_em = null,
        desconto = 0, juros = 0, outras_despesas = 0
    where id = p_parcela_id;
  perform public.fn_recalcular_status_lancamento(v_lanc);
end $function$;

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

create or replace function public.fn_conciliacao_painel(
  p_conta_id uuid,
  p_inicio date,
  p_fim date
)
returns jsonb
language plpgsql
stable
security definer
set search_path to ''
as $function$
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

  -- Saldo do banco: o do extrato que cobre o ultimo dia do periodo (o mais
  -- recente importado, se houver mais de um). A data e a menor entre o DTASOF
  -- e o fim do periodo: o BB poe no DTASOF o dia da exportacao, mas o saldo e
  -- o do fim do extrato.
  select true, e.saldo_final, least(coalesce(e.saldo_final_data, e.periodo_fim), e.periodo_fim)
    into v_tem_extrato, v_banco, v_banco_data
  from public.extratos_ofx e
  where e.conta_bancaria_id = p_conta_id
    and e.periodo_inicio <= p_fim and e.periodo_fim >= p_fim
  order by e.importado_em desc
  limit 1;

  if coalesce(v_tem_extrato, false) then
    v_pode_ver := public.fn_pode_ver_saldo(p_conta_id);
    if v_banco is not null then
      v_app := public.fn_conciliacao_saldo_app_interno(p_conta_id, v_banco_data);
    end if;
    -- Quem nao ve saldo recebe so se bateu ou nao, calculado aqui.
    v_saldo := jsonb_build_object(
      'data', v_banco_data,
      'temSaldoNoArquivo', v_banco is not null,
      'podeVer', v_pode_ver,
      'banco', case when v_pode_ver then v_banco end,
      'app', case when v_pode_ver then v_app end,
      'diferenca', case when v_pode_ver and v_banco is not null then v_banco - v_app end,
      'bate', case when v_banco is null then null else v_banco = v_app end
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
        'parcela', case when pi.id is null then null else jsonb_build_object(
          'id', pi.id, 'lancamentoId', pi.lancamento_id, 'lancamentoNumero', pi.lancamento_numero,
          'descricao', pi.descricao, 'nome', pi.nome, 'numeroParcela', pi.numero_parcela,
          'valorLiquido', pi.valor_liquido, 'dataPagamento', pi.data_pagamento) end,
        'transferencia', case when tf.id is null then null else jsonb_build_object(
          'id', tf.id, 'numero', tf.numero, 'descricao', tf.descricao,
          'origemNome', tf.origem_nome, 'destinoNome', tf.destino_nome,
          'data', tf.data_transferencia) end
      ) order by t.data_movimento, t.created_at)
      from public.extrato_transacoes t
      left join parcela_info pi on pi.id = t.parcela_id
      left join transf tf on tf.id = t.transferencia_id
      where t.conta_bancaria_id = p_conta_id
        and t.data_movimento between p_inicio and p_fim
    ), '[]'::jsonb),

    'pagasNaConta', coalesce((
      select jsonb_agg(to_jsonb(lv) order by lv."dataPagamento")
      from (
        select id, lancamento_id as "lancamentoId", lancamento_numero as "lancamentoNumero",
               descricao, nome, razao_social as "razaoSocial", tipo, origem,
               numero_parcela as "numeroParcela", qtd_parcelas as "qtdParcelas",
               valor, valor_liquido as "valorLiquido", data_pagamento as "dataPagamento",
               numero_documento as "numeroDocumento", status, conta_nome as "contaNome",
               conta_bancaria_id as "contaId"
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
               conta_bancaria_id as "contaId"
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
               conta_bancaria_id as "contaId"
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
