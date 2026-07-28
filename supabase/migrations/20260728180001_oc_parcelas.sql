-- Parcelas manuais na ordem de compra, integradas ao financeiro.
--
-- Contexto do que existia antes desta migration:
--   * fn_aprovar_ordem_compra criava o lançamento da OC com UMA parcela de
--     valor cheio e data_vencimento NULL. Como o filtro da fila de aprovação
--     aceita lançamento 'previsto', essa parcela já aparecia para aprovação e
--     pagamento ANTES da nota fiscal chegar.
--   * fn_registrar_recebimento apagava essa parcela e gerava N parcelas pela
--     condição de pagamento. Era o único lugar do sistema que sabia dividir
--     30/60/90, e ninguém mais reusava essa lógica.
--
-- O que passa a valer:
--   * As parcelas são definidas por pessoa, na OC (oc_parcelas) ou depois no
--     lançamento. Nada é gerado automaticamente.
--   * "Gerar pela condição" é uma sugestão, e a divisão vive num lugar só:
--     fn_parcelas_da_condicao.
--   * OC sem parcelas gera lançamento SEM parcela. Sem parcela não há o que
--     aprovar nem pagar, então a trava é estrutural.
--   * Lançamento ainda 'previsto' (nota não registrada) não tem parcela
--     aprovável, nem que alguém defina as parcelas na mão.

-- ---------------------------------------------------------------------------
-- 1. Parcelas da ordem de compra
-- ---------------------------------------------------------------------------

create table if not exists public.oc_parcelas (
  id uuid primary key default gen_random_uuid(),
  ordem_compra_id uuid not null
    references public.ordens_compra (id) on delete cascade,
  numero_parcela smallint not null,
  data_vencimento date not null,
  valor numeric(14, 2) not null,
  created_at timestamptz not null default now(),
  created_by uuid,
  constraint oc_parcelas_numero_unico unique (ordem_compra_id, numero_parcela),
  constraint oc_parcelas_numero_positivo check (numero_parcela >= 1),
  constraint oc_parcelas_valor_positivo check (valor > 0)
);

comment on table public.oc_parcelas is
  'Parcelas definidas na ordem de compra. Viram as parcelas do lançamento na aprovação. Escrita só via fn_salvar_parcelas_oc.';

alter table public.oc_parcelas enable row level security;

-- Leitura por quem vê a OC. Escrita NÃO tem policy: passa toda por
-- fn_salvar_parcelas_oc (security definer), igual a lancamento_parcelas.
drop policy if exists oc_parcelas_select on public.oc_parcelas;
create policy oc_parcelas_select on public.oc_parcelas
  for select
  using ((select public.tem_permissao('compras.ordens', 'ver')));

revoke all on table public.oc_parcelas from anon;
revoke all on table public.oc_parcelas from authenticated;
grant select on table public.oc_parcelas to authenticated;

drop trigger if exists trg_audit_oc_parcelas on public.oc_parcelas;
create trigger trg_audit_oc_parcelas
  after insert or update or delete on public.oc_parcelas
  for each row execute function public.fn_audit();

drop trigger if exists trg_set_created_by on public.oc_parcelas;
create trigger trg_set_created_by
  before insert on public.oc_parcelas
  for each row execute function public.fn_set_created_by();

-- ---------------------------------------------------------------------------
-- 2. Divisão pela condição de pagamento: uma implementação, um lugar
-- ---------------------------------------------------------------------------

create or replace function public.fn_parcelas_da_condicao(
  p_condicao_id uuid,
  p_valor numeric,
  p_data_base date
)
returns table (
  numero_parcela smallint,
  data_vencimento date,
  valor numeric
)
language plpgsql
stable
security definer
set search_path to ''
as $function$
declare
  v_qtd int;
  v_soma_percentual numeric(7, 2);
  v_centavos bigint;
begin
  if p_condicao_id is null then
    raise exception 'Informe a condicao de pagamento';
  end if;
  if p_valor is null or p_valor <= 0 then
    raise exception 'Informe um valor maior que zero para dividir em parcelas';
  end if;
  if p_data_base is null then
    raise exception 'Informe a data base das parcelas';
  end if;

  select count(*), coalesce(sum(cp.percentual), 0)
  into v_qtd, v_soma_percentual
  from public.condicao_parcelas cp
  where cp.condicao_id = p_condicao_id;

  if v_qtd = 0 then
    raise exception 'A condicao de pagamento nao tem parcelas cadastradas';
  end if;
  if round(v_soma_percentual, 2) <> 100.00 then
    raise exception 'A condicao de pagamento tem parcelas cujos percentuais nao somam 100 (recebido %)', v_soma_percentual;
  end if;

  -- Divisão em centavos: cada parcela pega o percentual dela e a ÚLTIMA
  -- absorve a sobra do arredondamento (100/3 = 33,33 + 33,33 + 33,34).
  v_centavos := round(p_valor * 100)::bigint;

  return query
  with base as (
    select
      cp.numero,
      cp.dias_offset,
      count(*) over () as total_parcelas,
      round(v_centavos * cp.percentual / 100)::bigint as centavos_bruto
    from public.condicao_parcelas cp
    where cp.condicao_id = p_condicao_id
  ),
  somado as (
    select
      b.numero,
      b.dias_offset,
      b.total_parcelas,
      b.centavos_bruto,
      coalesce(
        sum(b.centavos_bruto) over (
          order by b.numero rows between unbounded preceding and 1 preceding
        ),
        0
      ) as soma_anteriores
    from base b
  )
  select
    s.numero::smallint,
    (p_data_base + s.dias_offset)::date,
    (case
      when s.numero = s.total_parcelas then (v_centavos - s.soma_anteriores) / 100.0
      else s.centavos_bruto / 100.0
    end)::numeric(14, 2)
  from somado s
  order by s.numero;
end;
$function$;

comment on function public.fn_parcelas_da_condicao(uuid, numeric, date) is
  'Sugestão de parcelas a partir da condição de pagamento: percentual por parcela, vencimento = data base + dias_offset, sobra de centavos na última. Fonte única desta divisão.';

revoke all on function public.fn_parcelas_da_condicao(uuid, numeric, date) from public;
revoke all on function public.fn_parcelas_da_condicao(uuid, numeric, date) from anon;
grant execute on function public.fn_parcelas_da_condicao(uuid, numeric, date) to authenticated;

-- ---------------------------------------------------------------------------
-- 3. Salvar as parcelas da OC (atômico)
-- ---------------------------------------------------------------------------

create or replace function public.fn_salvar_parcelas_oc(
  p_oc_id uuid,
  p_parcelas jsonb
)
returns void
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_status text;
  v_total numeric(14, 2);
  v_emissao date;
  v_soma numeric(14, 2);
  v_qtd int;
begin
  -- Quem cria a OC precisa poder definir as parcelas dela na mesma sessão,
  -- então 'criar' também abre a porta (a trava real é o status da OC).
  if not (
    public.tem_permissao('compras.ordens', 'editar')
    or public.tem_permissao('compras.ordens', 'criar')
  ) then
    raise exception 'Sem permissao para definir parcelas da ordem de compra';
  end if;

  select status, valor_total, data_emissao
  into v_status, v_total, v_emissao
  from public.ordens_compra
  where id = p_oc_id;

  if v_status is null then
    raise exception 'Ordem de compra nao encontrada';
  end if;
  if v_status not in ('rascunho', 'pendente_aprovacao') then
    raise exception 'Só da para mexer nas parcelas de uma ordem em rascunho ou pendente de aprovacao. Depois de aprovada, edite as parcelas no lancamento.';
  end if;

  v_qtd := jsonb_array_length(coalesce(p_parcelas, '[]'::jsonb));

  -- Lista vazia limpa as parcelas: a OC volta a ser "sem parcelas definidas".
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
    where (x->>'data_vencimento')::date < v_emissao
  ) then
    raise exception 'Nenhuma parcela pode vencer antes da emissao da ordem (%)', v_emissao;
  end if;

  select round(coalesce(sum((x->>'valor')::numeric), 0), 2)
  into v_soma
  from jsonb_array_elements(p_parcelas) x;

  if v_soma <> round(v_total, 2) then
    raise exception 'A soma das parcelas (R$ %) precisa fechar com o total da ordem (R$ %)', v_soma, round(v_total, 2);
  end if;

  -- A numeração é dada aqui pela ordem de vencimento: nunca chega furada.
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
$function$;

comment on function public.fn_salvar_parcelas_oc(uuid, jsonb) is
  'Troca as parcelas da OC de uma vez. Valida status da OC, soma igual ao total, valor positivo e vencimento não anterior à emissão.';

revoke all on function public.fn_salvar_parcelas_oc(uuid, jsonb) from public;
revoke all on function public.fn_salvar_parcelas_oc(uuid, jsonb) from anon;
grant execute on function public.fn_salvar_parcelas_oc(uuid, jsonb) to authenticated;

-- ---------------------------------------------------------------------------
-- 4. Definir as parcelas de um lançamento já existente
-- ---------------------------------------------------------------------------
-- fn_salvar_lancamento recusa lançamento de origem <> 'manual' de propósito
-- (o cabeçalho pertence à origem). Esta função mexe SÓ nas parcelas, então
-- serve para o lançamento de OC que nasceu sem parcela.

create or replace function public.fn_definir_parcelas_lancamento(
  p_lanc_id uuid,
  p_parcelas jsonb
)
returns void
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_valor numeric(14, 2);
  v_status text;
  v_soma numeric(14, 2);
  v_qtd int;
begin
  if not public.tem_permissao('financeiro.lancamentos', 'editar') then
    raise exception 'Sem permissao para editar lancamentos';
  end if;

  select valor, status into v_valor, v_status
  from public.lancamentos
  where id = p_lanc_id;

  if v_valor is null then
    raise exception 'Lancamento nao encontrado';
  end if;
  if v_status = 'cancelado' then
    raise exception 'Lancamento cancelado nao aceita parcelas';
  end if;

  if exists (
    select 1 from public.lancamento_parcelas
    where lancamento_id = p_lanc_id and status in ('aprovado', 'pago')
  ) then
    raise exception 'Este lancamento ja tem parcela aprovada ou paga: as parcelas nao podem mais ser trocadas';
  end if;

  v_qtd := jsonb_array_length(coalesce(p_parcelas, '[]'::jsonb));
  if v_qtd = 0 then
    raise exception 'Informe ao menos uma parcela';
  end if;

  if exists (
    select 1 from jsonb_array_elements(p_parcelas) x
    where coalesce((x->>'valor')::numeric, 0) <= 0
  ) then
    raise exception 'Toda parcela precisa de um valor maior que zero';
  end if;

  if exists (
    select 1 from jsonb_array_elements(p_parcelas) x
    where nullif(x->>'data_vencimento', '') is null
  ) then
    raise exception 'Toda parcela precisa de uma data de vencimento';
  end if;

  select round(coalesce(sum((x->>'valor')::numeric), 0), 2)
  into v_soma
  from jsonb_array_elements(p_parcelas) x;

  if v_soma <> round(v_valor, 2) then
    raise exception 'A soma das parcelas (R$ %) precisa fechar com o valor do lancamento (R$ %)', v_soma, round(v_valor, 2);
  end if;

  delete from public.lancamento_parcelas where lancamento_id = p_lanc_id;

  insert into public.lancamento_parcelas (
    lancamento_id, numero_parcela, valor, data_vencimento, status, created_by
  )
  select
    p_lanc_id,
    row_number() over (
      order by (x->>'data_vencimento')::date, x->>'valor'
    )::smallint,
    round((x->>'valor')::numeric, 2),
    (x->>'data_vencimento')::date,
    'pendente',
    (select auth.uid())
  from jsonb_array_elements(p_parcelas) x;

  update public.lancamentos
  set data_vencimento = (
    select min(lp.data_vencimento)
    from public.lancamento_parcelas lp
    where lp.lancamento_id = p_lanc_id
  )
  where id = p_lanc_id;

  -- De propósito NÃO chama fn_recalcular_status_lancamento: ela levaria um
  -- lançamento 'previsto' para 'a_pagar', ou seja, deixaria pagável uma OC
  -- cuja nota fiscal ainda não foi registrada.
end;
$function$;

comment on function public.fn_definir_parcelas_lancamento(uuid, jsonb) is
  'Troca as parcelas de um lançamento sem tocar no cabeçalho. Recusa se alguma parcela já foi aprovada ou paga. Valida soma igual ao valor do lançamento.';

revoke all on function public.fn_definir_parcelas_lancamento(uuid, jsonb) from public;
revoke all on function public.fn_definir_parcelas_lancamento(uuid, jsonb) from anon;
grant execute on function public.fn_definir_parcelas_lancamento(uuid, jsonb) to authenticated;

-- ---------------------------------------------------------------------------
-- 5. Aprovação da OC: herda as parcelas, ou não cria nenhuma
-- ---------------------------------------------------------------------------

create or replace function public.fn_aprovar_ordem_compra(p_oc_id uuid)
returns void
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_status text;
  v_fornecedor uuid;
  v_total numeric(14, 2);
  v_numero text;
  v_lanc_id uuid;
  v_competencia date;
  v_qtd_parcelas int;
  v_soma_parcelas numeric(14, 2);
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

  -- As parcelas podem ter sido definidas antes de o total mudar; se não
  -- fecharem, a aprovação para aqui em vez de gerar lançamento torto.
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

  v_competencia := (now() at time zone 'America/Rio_Branco')::date;

  insert into public.lancamentos (tipo, origem, origem_id, fornecedor_id, descricao, valor, status, competencia, created_by)
  values ('a_pagar', 'oc', p_oc_id, v_fornecedor, 'Ordem de compra ' || coalesce(v_numero, ''), v_total, 'previsto', v_competencia, (select auth.uid()))
  returning id into v_lanc_id;

  -- Com parcelas na OC, o lançamento nasce com EXATAMENTE elas. Sem parcelas,
  -- nasce sem nenhuma: fica "parcelas pendentes", fora da fila de aprovação e
  -- sem poder ser pago, até alguém definir no lançamento.
  if v_qtd_parcelas > 0 then
    insert into public.lancamento_parcelas (lancamento_id, numero_parcela, valor, data_vencimento, status, created_by)
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
end $function$;

-- ---------------------------------------------------------------------------
-- 6. Recebimento: respeita as parcelas herdadas, não regera nada
-- ---------------------------------------------------------------------------

create or replace function public.fn_registrar_recebimento(
  p_oc_id uuid,
  p_numero_nf text,
  p_valor_nf numeric,
  p_data_recebimento date
)
returns void
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_status text;
  v_condicao_id uuid;
  v_valor_total numeric;
  v_tolerancia numeric;
  v_numero_nf text;
  v_lanc_id uuid;
  v_qtd_parcelas int;
  v_soma_parcelas numeric(14, 2);
  v_parcela_id uuid;
  v_valor_parcela numeric(14, 2);
  v_diferenca numeric(14, 2);
begin
  if not public.tem_permissao('compras.ordens', 'aprovar') then
    raise exception 'Sem permissao para registrar recebimento de ordens de compra';
  end if;

  v_numero_nf := btrim(p_numero_nf);
  if coalesce(v_numero_nf, '') = '' then
    raise exception 'Informe o numero da nota fiscal';
  end if;
  if p_valor_nf is null or p_valor_nf <= 0 then
    raise exception 'Informe um valor de nota fiscal maior que zero';
  end if;
  if p_data_recebimento is null then
    raise exception 'Informe a data do recebimento';
  end if;

  select status, condicao_pagamento_id, valor_total
  into v_status, v_condicao_id, v_valor_total
  from public.ordens_compra
  where id = p_oc_id;

  if v_status is null then
    raise exception 'Ordem de compra nao encontrada';
  end if;
  if v_status <> 'aprovado' then
    raise exception 'So da para registrar recebimento de uma ordem de compra aprovada';
  end if;
  if v_condicao_id is null then
    raise exception 'Ordem de compra sem condicao de pagamento definida';
  end if;

  -- configuracoes.valor é jsonb: o nullif(valor,'')::numeric que estava aqui
  -- estourava com "invalid input syntax for type json" e derrubava TODO
  -- recebimento (ver 20260728180003_fix_tolerancia_nf_jsonb).
  select coalesce((valor #>> '{}')::numeric, 0) into v_tolerancia
  from public.configuracoes where chave = 'tolerancia_divergencia_nf_percentual';
  if v_valor_total is not null and v_valor_total > 0 then
    if abs(p_valor_nf - v_valor_total) > v_valor_total * (coalesce(v_tolerancia, 0) / 100.0) then
      raise exception 'A nota fiscal (R$ %) diverge do total da ordem de compra (R$ %) acima da tolerancia permitida (% por cento).',
        round(p_valor_nf, 2), round(v_valor_total, 2), coalesce(v_tolerancia, 0);
    end if;
  end if;

  if exists (select 1 from public.recebimentos where ordem_compra_id = p_oc_id) then
    raise exception 'Esta ordem de compra ja tem recebimento registrado';
  end if;

  select id into v_lanc_id
  from public.lancamentos
  where origem = 'oc' and origem_id = p_oc_id and status = 'previsto'
  order by created_at desc
  limit 1;

  if v_lanc_id is null then
    raise exception 'Lancamento previsto desta ordem de compra nao encontrado';
  end if;

  select count(*), round(coalesce(sum(valor), 0), 2)
  into v_qtd_parcelas, v_soma_parcelas
  from public.lancamento_parcelas
  where lancamento_id = v_lanc_id;

  -- Parcelas herdadas da OC ficam como foram definidas. Se a nota veio com
  -- valor diferente (dentro da tolerância), a diferença cai na ÚLTIMA parcela
  -- em aberto, e a soma continua igual ao valor do lançamento.
  if v_qtd_parcelas > 0 and v_soma_parcelas <> round(p_valor_nf, 2) then
    select id, valor into v_parcela_id, v_valor_parcela
    from public.lancamento_parcelas
    where lancamento_id = v_lanc_id and status = 'pendente'
    order by numero_parcela desc
    limit 1;

    if v_parcela_id is null then
      raise exception 'A nota fiscal (R$ %) diverge da soma das parcelas (R$ %) e nao ha parcela em aberto para absorver a diferenca',
        round(p_valor_nf, 2), v_soma_parcelas;
    end if;

    v_diferenca := round(p_valor_nf, 2) - v_soma_parcelas;

    if round(v_valor_parcela + v_diferenca, 2) <= 0 then
      raise exception 'A diferenca da nota fiscal (R$ %) zeraria a ultima parcela em aberto (R$ %). Ajuste as parcelas antes de registrar o recebimento.',
        v_diferenca, v_valor_parcela;
    end if;

    update public.lancamento_parcelas
    set valor = round(v_valor_parcela + v_diferenca, 2)
    where id = v_parcela_id;
  end if;

  update public.lancamentos
  set status = 'a_pagar', valor = p_valor_nf
  where id = v_lanc_id;

  update public.lancamentos
  set data_vencimento = (
    select min(lp.data_vencimento)
    from public.lancamento_parcelas lp
    where lp.lancamento_id = v_lanc_id
  )
  where id = v_lanc_id;

  insert into public.recebimentos (
    ordem_compra_id, lancamento_id, numero_nf, valor_nf, data_recebimento, created_by
  )
  values (p_oc_id, v_lanc_id, v_numero_nf, p_valor_nf, p_data_recebimento, (select auth.uid()));

  update public.ordens_compra
  set status = 'recebido'
  where id = p_oc_id;
end;
$function$;

-- ---------------------------------------------------------------------------
-- 7. Trava no banco: parcela de lançamento 'previsto' não se aprova
-- ---------------------------------------------------------------------------
-- 'previsto' = OC aprovada cuja nota fiscal ainda não foi registrada. Sem
-- isso, definir as parcelas na mão colocaria o pagamento na fila antes da
-- nota. Pagar já era impossível por outro caminho (fn_pagar_parcela exige
-- parcela 'aprovado'), então esta é a trava que fecha os dois.

create or replace function public.fn_aprovar_parcela(p_parcela_id uuid)
returns void
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_status text;
  v_status_lanc text;
begin
  if not public.tem_permissao('financeiro.aprovacao-pagamentos', 'aprovar') then
    raise exception 'Sem permissao para aprovar pagamentos';
  end if;

  select lp.status, l.status
  into v_status, v_status_lanc
  from public.lancamento_parcelas lp
  join public.lancamentos l on l.id = lp.lancamento_id
  where lp.id = p_parcela_id;

  if v_status is null then
    raise exception 'Parcela nao encontrada';
  end if;
  if v_status <> 'pendente' then
    raise exception 'So da para aprovar uma parcela pendente';
  end if;
  if v_status_lanc = 'previsto' then
    raise exception 'Este lancamento ainda esta previsto: registre o recebimento da nota fiscal antes de aprovar o pagamento';
  end if;

  update public.lancamento_parcelas
  set status = 'aprovado', aprovado_por = (select auth.uid()), aprovado_em = now()
  where id = p_parcela_id;
end $function$;
