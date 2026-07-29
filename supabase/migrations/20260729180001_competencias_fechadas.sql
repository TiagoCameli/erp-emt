-- Competencia fechada: trava o mes de referencia depois do fechamento.
--
-- Bloco 2 do trabalho de datas. Fechar um mes congela o custo daquele mes: se
-- alguem lancar depois com mes de referencia fechado, o relatorio que voce ja
-- olhou muda sozinho. A trava vale para os quatro caminhos que escrevem mes de
-- referencia (criar OC, aprovar OC, salvar lancamento, alterar o mes) e para o
-- fechamento de diarias.
--
-- Excecao: quem pode REABRIR o mes (financeiro.competencias:desaprovar) pode
-- lancar dentro dele, e a excecao fica registrada no audit_log com o documento e
-- o mes. Nao existe flag de admin no projeto; a permissao de reabrir e o
-- equivalente mais honesto de "so admin".

-- 1. Tabela ------------------------------------------------------------------

-- id uuid como em toda tabela do projeto: o fn_audit usa `id` para preencher
-- registro_id, e sem ele a auditoria gravaria a linha sem referencia. A unicidade
-- do mes fica na constraint unique.
create table if not exists public.competencias_fechadas (
  id uuid primary key default gen_random_uuid(),
  mes date not null unique,
  observacao text,
  fechado_por uuid references public.usuarios(id),
  fechado_em timestamptz not null default now(),
  created_at timestamptz not null default now(),
  created_by uuid references public.usuarios(id),
  constraint competencias_fechadas_dia1 check (extract(day from mes) = 1)
);

comment on table public.competencias_fechadas is
  'Meses de referencia encerrados. Uma linha por mes (dia 1). Sem linha = mes aberto.';

alter table public.competencias_fechadas enable row level security;

drop policy if exists competencias_fechadas_select on public.competencias_fechadas;
create policy competencias_fechadas_select
  on public.competencias_fechadas for select
  to authenticated
  using (public.tem_permissao('financeiro.competencias', 'ver'));

-- Escrita so pelas funcoes (security definer): sem grant de insert/update/delete
-- para o client, nem policy para eles.
revoke all on table public.competencias_fechadas from anon, authenticated;
grant select on table public.competencias_fechadas to authenticated;

drop trigger if exists trg_audit_competencias_fechadas on public.competencias_fechadas;
create trigger trg_audit_competencias_fechadas
  after insert or update or delete on public.competencias_fechadas
  for each row execute function public.fn_audit();

-- 2. Consultar se um mes esta fechado ----------------------------------------

create or replace function public.fn_competencia_fechada(p_mes date)
returns boolean
language sql
stable
security definer
set search_path to ''
as $$
  select exists (
    select 1 from public.competencias_fechadas
    where mes = date_trunc('month', p_mes)::date
  );
$$;

revoke all on function public.fn_competencia_fechada(date) from public;
grant execute on function public.fn_competencia_fechada(date) to authenticated;

-- 3. A trava, em um lugar so -------------------------------------------------

create or replace function public.fn_exigir_competencia_aberta(
  p_mes date,
  p_entidade text,
  p_id uuid
)
returns void
language plpgsql
security definer
set search_path to ''
as $$
declare
  v_mes date := date_trunc('month', p_mes)::date;
begin
  if not public.fn_competencia_fechada(v_mes) then
    return;
  end if;

  if not public.tem_permissao('financeiro.competencias', 'desaprovar') then
    raise exception 'A competencia %/% esta fechada: nao da para lancar nela. Reabra a competencia ou escolha outro mes de referencia.',
      to_char(v_mes, 'MM'), to_char(v_mes, 'YYYY');
  end if;

  -- Passou pela excecao: fica registrado quem lancou em mes fechado, em qual
  -- documento e em qual mes (ver 20260729180002, que trocou o audit_log por
  -- competencia_eventos: o check de audit_log.acao so aceita INSERT/UPDATE/DELETE).
  insert into public.competencia_eventos (mes, tipo, entidade_tipo, entidade_id, created_by)
  values (v_mes, 'excecao', p_entidade, p_id, (select auth.uid()));
end;
$$;

revoke all on function public.fn_exigir_competencia_aberta(date, text, uuid) from public;

comment on function public.fn_exigir_competencia_aberta(date, text, uuid) is
  'Recusa escrita em mes de referencia fechado. Quem pode reabrir a competencia passa, com a excecao registrada no audit_log. Interna.';

-- 4. Fechar e reabrir --------------------------------------------------------

create or replace function public.fn_fechar_competencia(
  p_mes date,
  p_observacao text default null
)
returns void
language plpgsql
security definer
set search_path to ''
as $$
declare
  v_mes date;
begin
  if not public.tem_permissao('financeiro.competencias', 'aprovar') then
    raise exception 'Sem permissao para fechar competencia';
  end if;
  if p_mes is null then
    raise exception 'Informe o mes a fechar';
  end if;

  v_mes := date_trunc('month', p_mes)::date;

  if v_mes > date_trunc('month', (now() at time zone 'America/Rio_Branco'))::date then
    raise exception 'Nao da para fechar um mes que ainda nao comecou';
  end if;

  insert into public.competencias_fechadas (mes, observacao, fechado_por, created_by)
  values (v_mes, nullif(btrim(p_observacao), ''), (select auth.uid()), (select auth.uid()))
  on conflict (mes) do nothing;
end;
$$;

revoke all on function public.fn_fechar_competencia(date, text) from public;
grant execute on function public.fn_fechar_competencia(date, text) to authenticated;

create or replace function public.fn_reabrir_competencia(
  p_mes date,
  p_motivo text
)
returns void
language plpgsql
security definer
set search_path to ''
as $$
declare
  v_mes date;
  v_motivo text;
begin
  if not public.tem_permissao('financeiro.competencias', 'desaprovar') then
    raise exception 'Sem permissao para reabrir competencia';
  end if;

  v_motivo := btrim(coalesce(p_motivo, ''));
  if v_motivo = '' then
    raise exception 'Informe o motivo da reabertura';
  end if;

  v_mes := date_trunc('month', p_mes)::date;

  if not public.fn_competencia_fechada(v_mes) then
    raise exception 'Esta competencia nao esta fechada';
  end if;

  delete from public.competencias_fechadas where mes = v_mes;

  -- O trigger de auditoria grava o delete, mas nao o motivo: ele entra na
  -- trilha de competencia (ver 20260729180002).
  insert into public.competencia_eventos (mes, tipo, motivo, created_by)
  values (v_mes, 'reabriu', v_motivo, (select auth.uid()));
end;
$$;

revoke all on function public.fn_reabrir_competencia(date, text) from public;
grant execute on function public.fn_reabrir_competencia(date, text) to authenticated;

-- 5. Painel do fechamento ----------------------------------------------------
-- Uma linha por mes com o que importa para decidir fechar: quanto de custo o mes
-- tem, quantos lancamentos ainda estao incompletos (previsto) e o estado.

create or replace function public.fn_competencias_painel(p_meses int default 13)
returns table(
  mes date,
  fechada boolean,
  fechado_em timestamptz,
  fechado_por uuid,
  observacao text,
  custo numeric,
  lancamentos int,
  incompletos int
)
language sql
stable
security definer
set search_path to ''
as $$
  with meses as (
    select date_trunc('month', (now() at time zone 'America/Rio_Branco'))::date
           - (n || ' months')::interval as mes
    from generate_series(0, greatest(coalesce(p_meses, 13), 1) - 1) as n
    union
    select mes::timestamp from public.competencias_fechadas
    union
    select distinct mes_competencia::timestamp from public.lancamentos
  )
  select
    m.mes::date,
    (cf.mes is not null) as fechada,
    cf.fechado_em,
    cf.fechado_por,
    cf.observacao,
    coalesce((
      select sum(r.valor)
      from public.lancamento_rateios r
      join public.lancamentos l on l.id = r.lancamento_id
      where l.tipo = 'a_pagar' and l.status <> 'cancelado'
        and l.mes_competencia = m.mes::date
    ), 0) as custo,
    (
      select count(*)::int from public.lancamentos l
      where l.mes_competencia = m.mes::date and l.status <> 'cancelado'
    ) as lancamentos,
    (
      select count(*)::int from public.lancamentos l
      where l.mes_competencia = m.mes::date and l.status = 'previsto'
    ) as incompletos
  from meses m
  left join public.competencias_fechadas cf on cf.mes = m.mes::date
  where public.tem_permissao('financeiro.competencias', 'ver')
  order by m.mes desc
$$;

revoke all on function public.fn_competencias_painel(int) from public;
grant execute on function public.fn_competencias_painel(int) to authenticated;

comment on function public.fn_competencias_painel(int) is
  'Um mes por linha com custo, quantidade de lancamentos, incompletos e estado do fechamento. Base da aba Fechamento de competencia.';

-- 6. A trava entra nos caminhos de escrita -----------------------------------

create or replace function public.fn_criar_ordem_compra(p_cabecalho jsonb, p_itens jsonb)
returns uuid
language plpgsql
security definer
set search_path to ''
as $$
declare
  v_oc_id uuid;
  v_total numeric(14, 2);
  v_qtd_itens int;
  v_cotacao uuid;
  v_data_compra date;
  v_mes date;
begin
  if not public.tem_permissao('compras.ordens', 'criar') then
    raise exception 'Sem permissao para criar ordens de compra';
  end if;
  select count(*) into v_qtd_itens from jsonb_array_elements(p_itens);
  if v_qtd_itens = 0 then
    raise exception 'Adicione ao menos um item a ordem de compra';
  end if;
  select coalesce(sum(((item ->> 'quantidade')::numeric(14, 3)) * ((item ->> 'preco_unitario')::numeric(14, 2))), 0)
  into v_total from jsonb_array_elements(p_itens) as item;

  v_cotacao := nullif(p_cabecalho ->> 'cotacao_id', '')::uuid;

  v_data_compra := coalesce(
    (nullif(p_cabecalho ->> 'data_compra', ''))::date,
    (now() at time zone 'America/Rio_Branco')::date
  );
  v_mes := date_trunc('month', coalesce(
    (nullif(p_cabecalho ->> 'mes_competencia', ''))::date,
    v_data_compra
  ))::date;

  perform public.fn_exigir_competencia_aberta(v_mes, 'ordem_compra', null);

  perform set_config('oc.recalc_suprimido', '1', true);
  insert into public.ordens_compra (
    fornecedor_id, condicao_pagamento_id, forma_pagamento_id, cotacao_id,
    data_compra, mes_competencia, observacoes, status, valor_total
  )
  values (
    (p_cabecalho ->> 'fornecedor_id')::uuid,
    (p_cabecalho ->> 'condicao_pagamento_id')::uuid,
    nullif(p_cabecalho ->> 'forma_pagamento_id', '')::uuid,
    v_cotacao,
    v_data_compra,
    v_mes,
    nullif(p_cabecalho ->> 'observacoes', ''),
    'rascunho',
    v_total
  )
  returning id into v_oc_id;
  insert into public.oc_itens (ordem_compra_id, insumo_id, quantidade, preco_unitario, centro_custo_id)
  select v_oc_id, (item ->> 'insumo_id')::uuid, (item ->> 'quantidade')::numeric, (item ->> 'preco_unitario')::numeric, (item ->> 'centro_custo_id')::uuid
  from jsonb_array_elements(p_itens) as item;
  perform set_config('oc.recalc_suprimido', '0', true);

  if v_cotacao is not null then
    perform public.fn_propagar_anexos('cotacao', v_cotacao, 'ordem_compra', v_oc_id);
  end if;

  return v_oc_id;
end;
$$;

create or replace function public.fn_alterar_mes_competencia(
  p_entidade text,
  p_id uuid,
  p_mes date
)
returns void
language plpgsql
security definer
set search_path to ''
as $$
declare
  v_lanc_id uuid;
  v_oc_id uuid;
  v_mes date;
  v_mes_atual date;
  v_travadas int;
begin
  if p_entidade not in ('ordem_compra', 'lancamento') then
    raise exception 'Documento invalido para alterar mes de referencia';
  end if;
  if p_mes is null then
    raise exception 'Informe o mes de referencia';
  end if;
  v_mes := date_trunc('month', p_mes)::date;

  if p_entidade = 'ordem_compra' then
    if not public.tem_permissao('compras.ordens', 'editar') then
      raise exception 'Sem permissao para editar ordens de compra';
    end if;
    v_oc_id := p_id;
    select mes_competencia into v_mes_atual from public.ordens_compra where id = v_oc_id;
    if v_mes_atual is null then
      raise exception 'Ordem de compra nao encontrada';
    end if;
    select id into v_lanc_id
    from public.lancamentos
    where origem = 'oc' and origem_id = v_oc_id and status <> 'cancelado'
    order by created_at desc
    limit 1;
  else
    if not public.tem_permissao('financeiro.lancamentos', 'editar') then
      raise exception 'Sem permissao para editar lancamentos';
    end if;
    v_lanc_id := p_id;
    select mes_competencia into v_mes_atual from public.lancamentos where id = v_lanc_id;
    if v_mes_atual is null then
      raise exception 'Lancamento nao encontrado';
    end if;
    select origem_id into v_oc_id
    from public.lancamentos
    where id = v_lanc_id and origem = 'oc';
  end if;

  if v_lanc_id is not null then
    select count(*) into v_travadas
    from public.lancamento_parcelas
    where lancamento_id = v_lanc_id and status in ('aprovado', 'pago');

    if v_travadas > 0 then
      if exists (
        select 1 from public.lancamento_parcelas
        where lancamento_id = v_lanc_id and status = 'pago'
      ) then
        raise exception 'Este pagamento ja foi pago. Estorne o pagamento antes de mudar o mes de referencia.';
      end if;
      raise exception 'Este pagamento ja foi aprovado. Desaprove o pagamento antes de mudar o mes de referencia.';
    end if;
  end if;

  -- Os dois lados da mudanca sao competencia: sair de um mes fechado tambem
  -- mexe no custo daquele mes.
  perform public.fn_exigir_competencia_aberta(v_mes_atual, p_entidade, p_id);
  perform public.fn_exigir_competencia_aberta(v_mes, p_entidade, p_id);

  if v_oc_id is not null then
    update public.ordens_compra set mes_competencia = v_mes where id = v_oc_id;
  end if;
  if v_lanc_id is not null then
    update public.lancamentos set mes_competencia = v_mes where id = v_lanc_id;
  end if;
end;
$$;

create or replace function public.fn_aprovar_ordem_compra(p_oc_id uuid)
returns void
language plpgsql
security definer
set search_path to ''
as $$
declare
  v_status text;
  v_fornecedor uuid;
  v_total numeric(14, 2);
  v_numero text;
  v_forma uuid;
  v_compra date;
  v_mes date;
  v_lanc_id uuid;
  v_qtd_parcelas int;
  v_soma_parcelas numeric(14, 2);
begin
  if not public.tem_permissao('compras.ordens', 'aprovar') then
    raise exception 'Sem permissao para aprovar ordens de compra';
  end if;

  select status, fornecedor_id, valor_total, numero, forma_pagamento_id,
         data_compra, mes_competencia
  into v_status, v_fornecedor, v_total, v_numero, v_forma, v_compra, v_mes
  from public.ordens_compra where id = p_oc_id;

  if v_status is null then
    raise exception 'Ordem de compra nao encontrada';
  end if;
  if v_status <> 'pendente_aprovacao' then
    raise exception 'A ordem de compra precisa estar pendente de aprovacao';
  end if;

  -- A aprovacao cria o lancamento, ou seja, cria custo no mes de referencia da
  -- OC. Se aquele mes fechou depois de a OC ser criada, para aqui.
  perform public.fn_exigir_competencia_aberta(v_mes, 'ordem_compra', p_oc_id);

  select count(*), round(coalesce(sum(valor), 0), 2)
  into v_qtd_parcelas, v_soma_parcelas
  from public.oc_parcelas
  where ordem_compra_id = p_oc_id;

  if v_qtd_parcelas > 0 and v_soma_parcelas <> round(v_total, 2) then
    raise exception 'A soma das parcelas da ordem (R$ %) nao fecha com o total (R$ %). Ajuste as parcelas antes de aprovar.',
      v_soma_parcelas, round(v_total, 2);
  end if;

  update public.ordens_compra
  set status = 'aprovado', aprovado_por = (select auth.uid()), aprovado_em = now()
  where id = p_oc_id;

  insert into public.lancamentos (
    tipo, origem, origem_id, fornecedor_id, forma_pagamento_id, descricao,
    valor, status, data_compra, mes_competencia, created_by
  )
  values (
    'a_pagar', 'oc', p_oc_id, v_fornecedor, v_forma,
    'Ordem de compra ' || coalesce(v_numero, ''),
    v_total, 'previsto', v_compra, v_mes, (select auth.uid())
  )
  returning id into v_lanc_id;

  if v_qtd_parcelas > 0 then
    insert into public.lancamento_parcelas (
      lancamento_id, numero_parcela, valor, data_vencimento, status, created_by
    )
    select v_lanc_id, p.numero_parcela, p.valor, p.data_vencimento, 'pendente', (select auth.uid())
    from public.oc_parcelas p
    where p.ordem_compra_id = p_oc_id
    order by p.numero_parcela;

    update public.lancamentos
    set data_vencimento = (
      select min(p.data_vencimento) from public.oc_parcelas p
      where p.ordem_compra_id = p_oc_id
    )
    where id = v_lanc_id;
  end if;

  insert into public.lancamento_rateios (lancamento_id, centro_custo_id, valor, created_by)
  select v_lanc_id, oi.centro_custo_id, sum(oi.quantidade * oi.preco_unitario), (select auth.uid())
  from public.oc_itens oi
  where oi.ordem_compra_id = p_oc_id
  group by oi.centro_custo_id;

  perform public.fn_propagar_anexos('ordem_compra', p_oc_id, 'lancamento', v_lanc_id);

  perform public.fn_aplicar_regra_pagamento(v_lanc_id);
end;
$$;

create or replace function public.fn_salvar_lancamento(
  p_id uuid,
  p_dados jsonb,
  p_parcelas jsonb,
  p_rateios jsonb
)
returns uuid
language plpgsql
security definer
set search_path to ''
as $$
declare
  v_id uuid := p_id; v_acao text; v_valor numeric(14,2);
  v_soma_parc numeric(14,2); v_soma_rat numeric(14,2); v_origem text; p jsonb; r jsonb;
  v_compra date; v_mes date; v_mes_atual date;
begin
  v_acao := case when p_id is null then 'criar' else 'editar' end;
  if not public.tem_permissao('financeiro.lancamentos', v_acao) then
    raise exception 'Sem permissao para % lancamentos', v_acao;
  end if;

  v_valor := (p_dados->>'valor')::numeric;
  if v_valor is null or v_valor < 0 then raise exception 'Valor invalido'; end if;

  v_compra := nullif(p_dados->>'data_compra','')::date;
  if v_compra is null then
    raise exception 'Informe a data da compra ou do documento';
  end if;
  v_mes := date_trunc('month', coalesce(nullif(p_dados->>'mes_competencia','')::date, v_compra))::date;

  select coalesce(sum(round((x->>'valor')::numeric, 2)), 0) into v_soma_parc from jsonb_array_elements(coalesce(p_parcelas,'[]'::jsonb)) x;
  if v_soma_parc <> round(v_valor, 2) then
    raise exception 'A soma das parcelas (R$ %) deve ser igual ao valor do lancamento (R$ %)', v_soma_parc, v_valor;
  end if;
  if jsonb_array_length(coalesce(p_rateios,'[]'::jsonb)) > 0 then
    select coalesce(sum(round((x->>'valor')::numeric, 2)), 0) into v_soma_rat from jsonb_array_elements(p_rateios) x;
    if v_soma_rat <> round(v_valor, 2) then
      raise exception 'A soma do rateio (R$ %) deve ser igual ao valor do lancamento (R$ %)', v_soma_rat, v_valor;
    end if;
  end if;

  perform public.fn_exigir_competencia_aberta(v_mes, 'lancamento', v_id);

  if v_acao = 'criar' then
    insert into public.lancamentos (tipo, origem, fornecedor_id, categoria_id, forma_pagamento_id, descricao, valor, status, data_compra, mes_competencia, data_vencimento, created_by)
    values (
      coalesce(p_dados->>'tipo','a_pagar'), 'manual',
      nullif(p_dados->>'fornecedor_id','')::uuid, nullif(p_dados->>'categoria_id','')::uuid,
      nullif(p_dados->>'forma_pagamento_id','')::uuid,
      p_dados->>'descricao', v_valor, 'a_pagar',
      v_compra, v_mes, nullif(p_dados->>'data_vencimento','')::date, (select auth.uid())
    ) returning id into v_id;
  else
    select origem, mes_competencia into v_origem, v_mes_atual
    from public.lancamentos where id = v_id;
    if v_origem is null then raise exception 'Lancamento nao encontrado'; end if;
    if v_origem <> 'manual' then
      raise exception 'Lancamento de origem % e somente-leitura aqui. Edite na origem.', v_origem;
    end if;
    if exists (select 1 from public.lancamento_parcelas where lancamento_id = v_id and status = 'pago') then
      raise exception 'Nao da para editar um lancamento com parcela ja paga';
    end if;
    if exists (
      select 1 from public.lancamento_parcelas
      where lancamento_id = v_id and status in ('aprovado', 'pago')
    ) and v_mes_atual <> v_mes then
      raise exception 'O mes de referencia nao muda com pagamento aprovado ou pago. Desaprove ou estorne o pagamento antes.';
    end if;
    -- Editar tira o valor do mes antigo tambem: se ele estiver fechado, para.
    perform public.fn_exigir_competencia_aberta(v_mes_atual, 'lancamento', v_id);
    update public.lancamentos set
      tipo = coalesce(p_dados->>'tipo', tipo),
      fornecedor_id = nullif(p_dados->>'fornecedor_id','')::uuid,
      categoria_id = nullif(p_dados->>'categoria_id','')::uuid,
      forma_pagamento_id = nullif(p_dados->>'forma_pagamento_id','')::uuid,
      descricao = p_dados->>'descricao', valor = v_valor,
      data_compra = v_compra,
      mes_competencia = v_mes,
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

  perform public.fn_aplicar_regra_pagamento(v_id);

  return v_id;
end;
$$;

create or replace function public.fn_fechar_diarias(
  p_colaborador uuid,
  p_competencia date,
  p_data_vencimento date default null::date
)
returns uuid
language plpgsql
security definer
set search_path to ''
as $$
declare v_total numeric; v_nome text; v_cc uuid; v_lanc uuid; v_comp date;
begin
  if not public.tem_permissao('rh.diaristas', 'criar') then raise exception 'Sem permissao para fechar diarias'; end if;
  v_comp := date_trunc('month', p_competencia)::date;

  perform public.fn_exigir_competencia_aberta(v_comp, 'lancamento', null);

  perform 1 from public.rh_diarias
  where colaborador_id = p_colaborador and competencia = v_comp and lancamento_id is null for update;

  select coalesce(sum(valor), 0) into v_total from public.rh_diarias
  where colaborador_id = p_colaborador and competencia = v_comp and lancamento_id is null;
  if v_total <= 0 then raise exception 'Nao ha diarias em aberto nessa competencia'; end if;

  select nome, centro_custo_id into v_nome, v_cc from public.colaboradores where id = p_colaborador;

  insert into public.lancamentos (tipo, origem, origem_id, centro_custo_id, descricao, valor, status, data_compra, mes_competencia, data_vencimento, created_by)
  values ('a_pagar', 'diaria', p_colaborador, v_cc, 'Diarias ' || coalesce(v_nome, '') || ' ' || to_char(v_comp, 'MM/YYYY'), v_total, 'a_pagar',
          (now() at time zone 'America/Rio_Branco')::date, v_comp, p_data_vencimento, (select auth.uid()))
  returning id into v_lanc;
  insert into public.lancamento_parcelas (lancamento_id, numero_parcela, valor, data_vencimento, status, created_by)
  values (v_lanc, 1, v_total, p_data_vencimento, 'pendente', (select auth.uid()));
  if v_cc is not null then
    insert into public.lancamento_rateios (lancamento_id, centro_custo_id, valor, created_by)
    values (v_lanc, v_cc, v_total, (select auth.uid()));
  end if;

  update public.rh_diarias set lancamento_id = v_lanc
  where colaborador_id = p_colaborador and competencia = v_comp and lancamento_id is null;
  return v_lanc;
end;
$$;

-- 7. Permissao da aba nova ---------------------------------------------------
-- Fechar competencia e ato de controle financeiro: quem aprova pagamento e quem
-- ganha. Reabrir fica na mesma mao (e a excecao de lancar em mes fechado tambem).

insert into public.usuario_permissoes (usuario_id, recurso, acao)
select distinct up.usuario_id, 'financeiro.competencias', a.acao
from public.usuario_permissoes up
cross join (values ('ver'), ('aprovar'), ('desaprovar')) as a(acao)
where up.recurso = 'financeiro.aprovacao-pagamentos'
  and up.acao = 'aprovar'
  and not exists (
    select 1 from public.usuario_permissoes ja
    where ja.usuario_id = up.usuario_id
      and ja.recurso = 'financeiro.competencias'
      and ja.acao = a.acao
  );
