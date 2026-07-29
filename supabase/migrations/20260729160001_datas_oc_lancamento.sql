-- Tres datas com papeis distintos na OC e no lancamento.
--
-- Antes: um campo "data_emissao" fazia dois papeis conflitantes (na OC era data
-- digitada pelo usuario, no lancamento era data de sistema) e "competencia" era
-- data completa opcional, preenchida com "hoje" na aprovacao da OC. Custo de
-- obra nao tinha mes de referencia confiavel.
--
-- Agora:
--   created_at        -> "Criada em": data de sistema, imutavel (trigger)
--   data_compra       -> o fato: quando a compra aconteceu
--   mes_competencia   -> mes em que o insumo foi usado pela obra, DATE no dia 1
--
-- Regra de alteracao do mes de referencia (definida pelo Tiago em 29/07/2026):
-- pode mudar na OC ou no lancamento, sempre refletindo no outro, ATE o pagamento
-- ser aprovado ou pago. Depois disso exige estorno ou desaprovacao antes.
--
-- Migracao de dados sem copia: a data digitada na OC (data_emissao) e RENOMEADA
-- para data_compra, entao nenhum valor se perde e nao existe janela de
-- inconsistencia. O lancamento herda a data da OC de origem.

-- 1. Ordem de compra ---------------------------------------------------------

alter table public.ordens_compra rename column data_emissao to data_compra;

comment on column public.ordens_compra.data_compra is
  'O fato: quando a compra aconteceu. Editavel. Nao confundir com created_at (data de sistema) nem com recebimentos.data_recebimento (chegada da nota).';

alter table public.ordens_compra
  add column if not exists mes_competencia date
  default (date_trunc('month', (now() at time zone 'America/Rio_Branco'))::date);

update public.ordens_compra
set mes_competencia = date_trunc('month', data_compra)::date
where mes_competencia is null;

alter table public.ordens_compra alter column mes_competencia set not null;

alter table public.ordens_compra
  drop constraint if exists ordens_compra_mes_competencia_dia1;
alter table public.ordens_compra
  add constraint ordens_compra_mes_competencia_dia1
  check (extract(day from mes_competencia) = 1);

comment on column public.ordens_compra.mes_competencia is
  'Mes em que o material foi utilizado pela obra, normalizado no dia 1. Define em qual mes o custo entra.';

-- 2. Lancamento --------------------------------------------------------------

alter table public.lancamentos
  add column if not exists data_compra date
  default ((now() at time zone 'America/Rio_Branco')::date);

-- Backfill: lancamento de OC herda a data da compra; os outros ficam com a
-- data_emissao que tinham (que era data de sistema, o melhor disponivel).
update public.lancamentos l
set data_compra = coalesce(oc.data_compra, l.data_emissao)
from public.ordens_compra oc
where l.origem = 'oc' and l.origem_id = oc.id and l.data_compra is null;

update public.lancamentos
set data_compra = data_emissao
where data_compra is null;

alter table public.lancamentos alter column data_compra set not null;

comment on column public.lancamentos.data_compra is
  'O fato: data da compra (herdada da OC) ou do documento, em lancamento avulso. Editavel enquanto nenhuma parcela estiver aprovada ou paga.';

alter table public.lancamentos rename column competencia to mes_competencia;

update public.lancamentos
set mes_competencia = date_trunc('month', coalesce(mes_competencia, data_compra))::date
where mes_competencia is null
   or extract(day from mes_competencia) <> 1;

alter table public.lancamentos
  alter column mes_competencia set not null,
  alter column mes_competencia set default (date_trunc('month', (now() at time zone 'America/Rio_Branco'))::date);

alter table public.lancamentos
  drop constraint if exists lancamentos_mes_competencia_dia1;
alter table public.lancamentos
  add constraint lancamentos_mes_competencia_dia1
  check (extract(day from mes_competencia) = 1);

comment on column public.lancamentos.mes_competencia is
  'Mes em que o custo entra, normalizado no dia 1. Herdado da OC; em lancamento avulso e informado na tela.';

-- data_emissao do lancamento era data de sistema disfarcada de campo de negocio.
-- O valor foi preservado em data_compra acima; created_at continua sendo a data
-- de sistema de verdade.
alter table public.lancamentos drop column data_emissao;

-- 3. Data de criacao imutavel ------------------------------------------------
-- O editarOrdem faz UPDATE direto na tabela com o cabecalho inteiro, entao a
-- unica garantia que vale para qualquer caminho de escrita e no banco.

create or replace function public.fn_fixa_created_at()
returns trigger
language plpgsql
set search_path to ''
as $$
begin
  -- Ignora em vez de rejeitar: quem tentou mudar nao precisa saber, o valor
  -- simplesmente nao muda.
  new.created_at := old.created_at;
  return new;
end;
$$;

comment on function public.fn_fixa_created_at() is
  'Mantem created_at imutavel em UPDATE. A data de criacao e do sistema, nao do usuario.';

drop trigger if exists trg_fixa_created_at on public.ordens_compra;
create trigger trg_fixa_created_at
  before update on public.ordens_compra
  for each row execute function public.fn_fixa_created_at();

drop trigger if exists trg_fixa_created_at on public.lancamentos;
create trigger trg_fixa_created_at
  before update on public.lancamentos
  for each row execute function public.fn_fixa_created_at();

-- 4. Indices para o custo por mes --------------------------------------------

create index if not exists idx_ordens_compra_mes_competencia
  on public.ordens_compra (mes_competencia);
create index if not exists idx_lancamentos_mes_competencia
  on public.lancamentos (mes_competencia);
create index if not exists idx_lancamento_rateios_centro_custo
  on public.lancamento_rateios (centro_custo_id);

-- 5. Criar OC: grava as duas datas do fato -----------------------------------

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

  -- OC vinda de cotacao herda os anexos dela, por referencia.
  if v_cotacao is not null then
    perform public.fn_propagar_anexos('cotacao', v_cotacao, 'ordem_compra', v_oc_id);
  end if;

  return v_oc_id;
end;
$$;

-- 6. Parcelas da OC: o piso do vencimento e a data da COMPRA -----------------

create or replace function public.fn_salvar_parcelas_oc(p_oc_id uuid, p_parcelas jsonb)
returns void
language plpgsql
security definer
set search_path to ''
as $$
declare
  v_status text;
  v_total numeric(14, 2);
  v_compra date;
  v_soma numeric(14, 2);
  v_qtd int;
begin
  if not (
    public.tem_permissao('compras.ordens', 'editar')
    or public.tem_permissao('compras.ordens', 'criar')
  ) then
    raise exception 'Sem permissao para definir parcelas da ordem de compra';
  end if;

  select status, valor_total, data_compra
  into v_status, v_total, v_compra
  from public.ordens_compra
  where id = p_oc_id;

  if v_status is null then
    raise exception 'Ordem de compra nao encontrada';
  end if;
  if v_status not in ('rascunho', 'pendente_aprovacao') then
    raise exception 'So da para mexer nas parcelas de uma ordem em rascunho ou pendente de aprovacao. Depois de aprovada, edite as parcelas no lancamento.';
  end if;

  v_qtd := jsonb_array_length(coalesce(p_parcelas, '[]'::jsonb));

  delete from public.oc_parcelas where ordem_compra_id = p_oc_id;
  if v_qtd = 0 then
    return;
  end if;

  if exists (
    select 1
    from jsonb_array_elements(p_parcelas) x
    where coalesce((x->>'valor')::numeric, 0) <= 0
  ) then
    raise exception 'Toda parcela precisa de um valor maior que zero';
  end if;

  if exists (
    select 1
    from jsonb_array_elements(p_parcelas) x
    where nullif(x->>'data_vencimento', '') is null
  ) then
    raise exception 'Toda parcela precisa de uma data de vencimento';
  end if;

  if exists (
    select 1
    from jsonb_array_elements(p_parcelas) x
    where (x->>'data_vencimento')::date < v_compra
  ) then
    raise exception 'Nenhuma parcela pode vencer antes da data da compra (%)', v_compra;
  end if;

  select round(coalesce(sum((x->>'valor')::numeric), 0), 2)
  into v_soma
  from jsonb_array_elements(p_parcelas) x;

  if v_soma <> round(v_total, 2) then
    raise exception 'A soma das parcelas (R$ %) precisa fechar com o total da ordem (R$ %)', v_soma, round(v_total, 2);
  end if;

  insert into public.oc_parcelas (
    ordem_compra_id, numero_parcela, data_vencimento, valor, created_by
  )
  select
    p_oc_id,
    row_number() over (
      order by (x->>'data_vencimento')::date, x->>'valor'
    )::smallint,
    (x->>'data_vencimento')::date,
    round((x->>'valor')::numeric, 2),
    (select auth.uid())
  from jsonb_array_elements(p_parcelas) x;
end;
$$;

-- 7. Aprovar OC: o lancamento HERDA as duas datas ----------------------------
-- Antes a competencia do lancamento nascia como "hoje", o que jogava o custo no
-- mes da aprovacao em vez do mes em que a obra usou o material.

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

-- 8. Cartao quita na data da COMPRA, nao na data de sistema ------------------

create or replace function public.fn_aplicar_regra_pagamento(p_lanc_id uuid)
returns void
language plpgsql
security definer
set search_path to ''
as $$
declare
  v_tipo_lanc text;
  v_status text;
  v_valor numeric(14, 2);
  v_compra date;
  v_tipo_forma text;
  v_qtd int;
  v_soma numeric(14, 2);
  v_parcela record;
begin
  select l.tipo, l.status, l.valor, l.data_compra, coalesce(f.tipo, 'bancario')
  into v_tipo_lanc, v_status, v_valor, v_compra, v_tipo_forma
  from public.lancamentos l
  left join public.formas_pagamento f on f.id = l.forma_pagamento_id
  where l.id = p_lanc_id;

  if v_tipo_lanc is null then
    return;
  end if;
  if v_tipo_lanc <> 'a_pagar' then
    return;
  end if;
  if v_status = 'cancelado' then
    return;
  end if;

  if exists (
    select 1 from public.lancamento_parcelas
    where lancamento_id = p_lanc_id and status in ('aprovado', 'pago')
  ) then
    return;
  end if;

  select count(*), round(coalesce(sum(valor), 0), 2)
  into v_qtd, v_soma
  from public.lancamento_parcelas
  where lancamento_id = p_lanc_id and status = 'pendente';

  if v_qtd = 0 or v_soma <> round(coalesce(v_valor, 0), 2) then
    update public.lancamentos
    set status = 'previsto'
    where id = p_lanc_id and status <> 'previsto';
    return;
  end if;

  if v_tipo_forma = 'dinheiro' then
    update public.lancamento_parcelas
    set status = 'aprovado',
        aprovado_por = (select auth.uid()),
        aprovado_em = now()
    where lancamento_id = p_lanc_id and status = 'pendente';

    update public.lancamentos set status = 'a_pagar' where id = p_lanc_id;

  elsif v_tipo_forma = 'cartao_credito' then
    update public.lancamento_parcelas
    set status = 'pago',
        data_pagamento = coalesce(v_compra, (now() at time zone 'America/Rio_Branco')::date),
        pago_por = (select auth.uid()),
        pago_em = now()
    where lancamento_id = p_lanc_id and status = 'pendente';

    update public.lancamentos set status = 'pago' where id = p_lanc_id;

    for v_parcela in
      select id from public.lancamento_parcelas
      where lancamento_id = p_lanc_id and status = 'pago'
    loop
      perform public.fn_propagar_anexos(
        'lancamento', p_lanc_id, 'pagamento', v_parcela.id
      );
    end loop;

  else
    update public.lancamentos set status = 'a_pagar' where id = p_lanc_id;
  end if;
end;
$$;

-- 9. Lancamento avulso: exige as duas datas ----------------------------------

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
  v_compra date; v_mes date;
begin
  v_acao := case when p_id is null then 'criar' else 'editar' end;
  if not public.tem_permissao('financeiro.lancamentos', v_acao) then
    raise exception 'Sem permissao para % lancamentos', v_acao;
  end if;

  v_valor := (p_dados->>'valor')::numeric;
  if v_valor is null or v_valor < 0 then raise exception 'Valor invalido'; end if;

  v_compra := nullif(p_dados->>'data_compra','')::date;
  if v_compra is null then
    -- Vale para conta a pagar (data da compra) e a receber (data do documento).
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
    select origem into v_origem from public.lancamentos where id = v_id;
    if v_origem is null then raise exception 'Lancamento nao encontrado'; end if;
    if v_origem <> 'manual' then
      raise exception 'Lancamento de origem % e somente-leitura aqui. Edite na origem.', v_origem;
    end if;
    if exists (select 1 from public.lancamento_parcelas where lancamento_id = v_id and status = 'pago') then
      raise exception 'Nao da para editar um lancamento com parcela ja paga';
    end if;
    -- Mes de referencia trava junto com o pagamento: aprovado ou pago exige
    -- estorno ou desaprovacao antes (mesma regra de fn_alterar_mes_competencia).
    if exists (
      select 1 from public.lancamento_parcelas
      where lancamento_id = v_id and status in ('aprovado', 'pago')
    ) and exists (
      select 1 from public.lancamentos
      where id = v_id and mes_competencia <> v_mes
    ) then
      raise exception 'O mes de referencia nao muda com pagamento aprovado ou pago. Desaprove ou estorne o pagamento antes.';
    end if;
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

-- 10. Alterar o mes de referencia dos dois lados -----------------------------
-- Mudar na OC reflete no lancamento e mudar no lancamento reflete na OC: e um
-- unico mes de referencia da mesma compra, visto de dois lugares. A trava e o
-- pagamento, nao o status da OC.

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
    select id into v_lanc_id
    from public.lancamentos
    where origem = 'oc' and origem_id = v_oc_id and status <> 'cancelado'
    order by created_at desc
    limit 1;
    if not exists (select 1 from public.ordens_compra where id = v_oc_id) then
      raise exception 'Ordem de compra nao encontrada';
    end if;
  else
    if not public.tem_permissao('financeiro.lancamentos', 'editar') then
      raise exception 'Sem permissao para editar lancamentos';
    end if;
    v_lanc_id := p_id;
    select origem_id into v_oc_id
    from public.lancamentos
    where id = v_lanc_id and origem = 'oc';
    if not exists (select 1 from public.lancamentos where id = v_lanc_id) then
      raise exception 'Lancamento nao encontrado';
    end if;
  end if;

  -- Trava: pagamento aprovado ou pago congela o mes de referencia. Mexer nele
  -- depois disso reescreveria custo de um mes que ja foi decidido.
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

  if v_oc_id is not null then
    update public.ordens_compra set mes_competencia = v_mes where id = v_oc_id;
  end if;
  if v_lanc_id is not null then
    update public.lancamentos set mes_competencia = v_mes where id = v_lanc_id;
  end if;
end;
$$;

revoke all on function public.fn_alterar_mes_competencia(text, uuid, date) from public;
grant execute on function public.fn_alterar_mes_competencia(text, uuid, date) to authenticated;

comment on function public.fn_alterar_mes_competencia(text, uuid, date) is
  'Altera o mes de referencia da OC e do lancamento dela ao mesmo tempo. Recusa quando o pagamento ja foi aprovado ou pago: exige desaprovar ou estornar antes.';

-- 11. Fechamento de diarias: as duas datas -----------------------------------
-- A diaria e do mes da competencia, mas o fato (o fechamento) pode acontecer no
-- mes seguinte. E exatamente para isso que as duas datas existem.

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

-- 12. DRE por competencia ----------------------------------------------------
-- Era coalesce(competencia, data_vencimento, data_emissao): misturava regime de
-- competencia com caixa quando a competencia estava vazia. Agora ela e
-- obrigatoria, entao o relatorio usa so ela.

create or replace function public.fn_rel_dre(p_inicio date, p_fim date)
returns table(tipo text, categoria_id uuid, categoria text, total numeric)
language sql
stable
set search_path to ''
as $$
  select l.tipo, c.id as categoria_id, c.nome as categoria, sum(l.valor) as total
  from public.lancamentos l
  left join public.categorias_financeiras c on c.id = l.categoria_id
  where l.status <> 'cancelado'
    and l.mes_competencia >= date_trunc('month', p_inicio)::date
    and l.mes_competencia < p_fim
  group by l.tipo, c.id, c.nome
$$;
