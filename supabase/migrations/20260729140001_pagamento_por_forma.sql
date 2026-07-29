-- Pagamento por forma de pagamento.
--
-- Regra definida pelo Tiago em 29/07/2026: o lancamento completo vai direto
-- para a aprovacao de pagamento, e a nota fiscal PARA de travar dinheiro (ela
-- volta a ser documento e controle de divergencia, registrada no recebimento).
-- Quem decide o caminho e a forma de pagamento:
--
--   bancario, cheque  -> parcelas 'pendente'  -> fila de aprovacao
--   dinheiro          -> parcelas 'aprovado'  -> direto em Pagamentos, sem fila
--   cartao_credito    -> parcelas 'pago'      -> nasce quitado (sem controle de fatura)
--
-- Lancamento incompleto (sem parcela, ou soma das parcelas que nao fecha com o
-- valor) fica 'previsto' e nao entra em fila nem em pagamento ate ser
-- completado. 'previsto' passa a significar "incompleto ou previsao", nunca
-- mais "esperando nota fiscal".

-- 1. Tipo da forma de pagamento ---------------------------------------------
-- A regra le o TIPO, nunca o nome digitado: o catalogo e livre e no dia em que
-- alguem cadastrar "Cartão Crédito" a regra tem que continuar valendo.

alter table public.formas_pagamento
  add column if not exists tipo text not null default 'bancario';

alter table public.formas_pagamento
  drop constraint if exists formas_pagamento_tipo_check;

alter table public.formas_pagamento
  add constraint formas_pagamento_tipo_check
  check (tipo in ('bancario', 'dinheiro', 'cartao_credito', 'cheque'));

comment on column public.formas_pagamento.tipo is
  'Classificador que a regra de pagamento le: bancario, dinheiro, cartao_credito, cheque. Nunca amarre regra no nome digitado.';

update public.formas_pagamento
set tipo = case
  when lower(nome) like '%dinheiro%'
    or lower(nome) like '%especie%'
    or lower(nome) like '%espécie%' then 'dinheiro'
  when lower(nome) like '%cart%' then 'cartao_credito'
  when lower(nome) like '%cheque%' then 'cheque'
  else 'bancario'
end;

-- Duplicata do catalogo: "Cartao" e "Cartão de Credito" sao a mesma coisa.
-- Desativa a que ninguem usa, em vez de apagar (historico).
update public.formas_pagamento f
set ativo = false
where f.nome = 'Cartao'
  and not exists (
    select 1 from public.ordens_compra oc where oc.forma_pagamento_id = f.id
  );

-- 2. Forma de pagamento no lancamento ---------------------------------------
-- Sem ela aqui, o financeiro precisaria voltar na OC para saber o caminho, e
-- lancamento manual ficaria sem regra nenhuma.

alter table public.lancamentos
  add column if not exists forma_pagamento_id uuid references public.formas_pagamento(id);

comment on column public.lancamentos.forma_pagamento_id is
  'Forma de pagamento herdada da OC na aprovacao ou escolhida no lancamento manual. Decide se o pagamento passa pela fila de aprovacao.';

-- 3. A regra, em um lugar so ------------------------------------------------

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
  v_emissao date;
  v_tipo_forma text;
  v_qtd int;
  v_soma numeric(14, 2);
  v_parcela record;
begin
  select l.tipo, l.status, l.valor, l.data_emissao, coalesce(f.tipo, 'bancario')
  into v_tipo_lanc, v_status, v_valor, v_emissao, v_tipo_forma
  from public.lancamentos l
  left join public.formas_pagamento f on f.id = l.forma_pagamento_id
  where l.id = p_lanc_id;

  if v_tipo_lanc is null then
    return;
  end if;
  -- Conta a receber nao tem fila de aprovacao de pagamento: nada a decidir.
  if v_tipo_lanc <> 'a_pagar' then
    return;
  end if;
  if v_status = 'cancelado' then
    return;
  end if;

  -- Parcela aprovada ou paga e historico. A regra nunca reescreve historico:
  -- se ja tem, o lancamento ja passou pelo caminho dele.
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

  -- Incompleto: sem parcela, ou soma que nao fecha com o valor. Fica previsto e
  -- fora de tudo ate alguem definir as parcelas.
  if v_qtd = 0 or v_soma <> round(coalesce(v_valor, 0), 2) then
    update public.lancamentos
    set status = 'previsto'
    where id = p_lanc_id and status <> 'previsto';
    return;
  end if;

  if v_tipo_forma = 'dinheiro' then
    -- Dinheiro nao pede aprovacao: nasce aprovado e vai direto para Pagamentos,
    -- onde a baixa sai da conta de caixa.
    update public.lancamento_parcelas
    set status = 'aprovado',
        aprovado_por = (select auth.uid()),
        aprovado_em = now()
    where lancamento_id = p_lanc_id and status = 'pendente';

    update public.lancamentos set status = 'a_pagar' where id = p_lanc_id;

  elsif v_tipo_forma = 'cartao_credito' then
    -- Cartao de credito nasce quitado: o dinheiro sai na fatura, que este ERP
    -- ainda nao controla. Sem conta bancaria de proposito, para nao debitar
    -- saldo de uma conta que nao pagou nada.
    update public.lancamento_parcelas
    set status = 'pago',
        data_pagamento = coalesce(v_emissao, (now() at time zone 'America/Rio_Branco')::date),
        pago_por = (select auth.uid()),
        pago_em = now()
    where lancamento_id = p_lanc_id and status = 'pendente';

    update public.lancamentos set status = 'pago' where id = p_lanc_id;

    -- O pagamento (a parcela paga) herda os anexos do lancamento, por
    -- referencia, igual ao caminho normal do fn_pagar_parcela.
    for v_parcela in
      select id from public.lancamento_parcelas
      where lancamento_id = p_lanc_id and status = 'pago'
    loop
      perform public.fn_propagar_anexos(
        'lancamento', p_lanc_id, 'pagamento', v_parcela.id
      );
    end loop;

  else
    -- Bancario, cheque, ou forma nao informada: caminho normal. Forma vazia cai
    -- aqui de proposito, porque o default seguro e PASSAR pela aprovacao.
    update public.lancamentos set status = 'a_pagar' where id = p_lanc_id;
  end if;
end;
$$;

revoke all on function public.fn_aplicar_regra_pagamento(uuid) from public;

comment on function public.fn_aplicar_regra_pagamento(uuid) is
  'Aplica a regra de pagamento por forma. Interna: chamada pelas funcoes que criam ou refazem parcelas de um lancamento.';

-- 4. Criar forma de pagamento agora carrega o tipo --------------------------
-- Assinatura muda (ganha p_tipo com default), entao a antiga sai para nao virar
-- overload ambiguo.

drop function if exists public.fn_criar_forma_pagamento(text);

create or replace function public.fn_criar_forma_pagamento(
  p_nome text,
  p_tipo text default 'bancario'
)
returns uuid
language plpgsql
security definer
set search_path to ''
as $$
declare
  v_id uuid;
  v_nome text;
  v_tipo text;
begin
  if not (
    public.tem_permissao('compras.ordens', 'criar')
    or public.tem_permissao('compras.cotacoes', 'criar')
  ) then
    raise exception 'Sem permissao para criar formas de pagamento';
  end if;

  v_nome := btrim(coalesce(p_nome, ''));
  if v_nome = '' then
    raise exception 'Informe o nome da forma de pagamento';
  end if;

  v_tipo := coalesce(nullif(btrim(p_tipo), ''), 'bancario');
  if v_tipo not in ('bancario', 'dinheiro', 'cartao_credito', 'cheque') then
    raise exception 'Tipo de forma de pagamento invalido: %', v_tipo;
  end if;

  insert into public.formas_pagamento (nome, tipo, created_by)
  values (v_nome, v_tipo, (select auth.uid()))
  on conflict (nome) do update set nome = excluded.nome
  returning id into v_id;

  return v_id;
end;
$$;

revoke all on function public.fn_criar_forma_pagamento(text, text) from public;
grant execute on function public.fn_criar_forma_pagamento(text, text) to authenticated;

-- 5. Aprovar OC: o lancamento nasce no caminho da forma ---------------------

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
  v_lanc_id uuid;
  v_competencia date;
  v_qtd_parcelas int;
  v_soma_parcelas numeric(14, 2);
begin
  if not public.tem_permissao('compras.ordens', 'aprovar') then
    raise exception 'Sem permissao para aprovar ordens de compra';
  end if;

  select status, fornecedor_id, valor_total, numero, forma_pagamento_id
  into v_status, v_fornecedor, v_total, v_numero, v_forma
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

  v_competencia := (now() at time zone 'America/Rio_Branco')::date;

  -- Nasce previsto e a regra decide o caminho no fim, com as parcelas na mao.
  insert into public.lancamentos (
    tipo, origem, origem_id, fornecedor_id, forma_pagamento_id, descricao,
    valor, status, competencia, created_by
  )
  values (
    'a_pagar', 'oc', p_oc_id, v_fornecedor, v_forma,
    'Ordem de compra ' || coalesce(v_numero, ''),
    v_total, 'previsto', v_competencia, (select auth.uid())
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

  -- O lancamento herda os anexos da OC (inclusive os que a OC herdou da
  -- cotacao), por referencia: nenhum binario e copiado.
  perform public.fn_propagar_anexos('ordem_compra', p_oc_id, 'lancamento', v_lanc_id);

  -- Depois dos anexos, porque cartao de credito ja nasce pago e propaga do
  -- lancamento para o pagamento.
  perform public.fn_aplicar_regra_pagamento(v_lanc_id);
end;
$$;

-- 6. Definir parcelas completa o lancamento e aplica a regra ----------------

create or replace function public.fn_definir_parcelas_lancamento(
  p_lanc_id uuid,
  p_parcelas jsonb
)
returns void
language plpgsql
security definer
set search_path to ''
as $$
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

  -- Completar as parcelas e o que faltava: a regra da forma decide para onde o
  -- lancamento vai agora.
  perform public.fn_aplicar_regra_pagamento(p_lanc_id);
end;
$$;

-- 7. Lancamento manual: guarda a forma e segue a mesma regra ----------------

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
begin
  v_acao := case when p_id is null then 'criar' else 'editar' end;
  if not public.tem_permissao('financeiro.lancamentos', v_acao) then
    raise exception 'Sem permissao para % lancamentos', v_acao;
  end if;

  v_valor := (p_dados->>'valor')::numeric;
  if v_valor is null or v_valor < 0 then raise exception 'Valor invalido'; end if;

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
    insert into public.lancamentos (tipo, origem, fornecedor_id, categoria_id, forma_pagamento_id, descricao, valor, status, competencia, data_vencimento, created_by)
    values (
      coalesce(p_dados->>'tipo','a_pagar'), 'manual',
      nullif(p_dados->>'fornecedor_id','')::uuid, nullif(p_dados->>'categoria_id','')::uuid,
      nullif(p_dados->>'forma_pagamento_id','')::uuid,
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
      forma_pagamento_id = nullif(p_dados->>'forma_pagamento_id','')::uuid,
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

  -- Mesma regra do lancamento de OC: dinheiro nao passa pela fila, cartao de
  -- credito nasce quitado, o resto vai para a aprovacao.
  perform public.fn_aplicar_regra_pagamento(v_id);

  return v_id;
end;
$$;

-- 8. Recebimento: registra a nota sem mandar em dinheiro --------------------
-- Divergencia que nao pode ser absorvida (parcela ja aprovada ou paga) fica
-- gravada no recebimento em vez de reescrever valor que ja saiu.

alter table public.recebimentos
  add column if not exists divergencia_valor numeric(14, 2);

comment on column public.recebimentos.divergencia_valor is
  'Diferenca entre o valor da nota e a soma das parcelas quando nao havia parcela em aberto para absorver. Nulo quando fechou.';

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
as $$
declare
  v_status text;
  v_condicao_id uuid;
  v_valor_total numeric;
  v_tolerancia numeric;
  v_numero_nf text;
  v_lanc_id uuid;
  v_status_lanc text;
  v_qtd_parcelas int;
  v_soma_parcelas numeric(14, 2);
  v_parcela_id uuid;
  v_valor_parcela numeric(14, 2);
  v_diferenca numeric(14, 2);
  v_divergencia numeric(14, 2);
  v_tudo_pago boolean;
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

  select coalesce((valor #>> '{}')::numeric, 0) into v_tolerancia
  from public.configuracoes
  where chave = 'tolerancia_divergencia_nf_percentual';

  if v_valor_total is not null and v_valor_total > 0 then
    if abs(p_valor_nf - v_valor_total) > v_valor_total * (coalesce(v_tolerancia, 0) / 100.0) then
      raise exception 'A nota fiscal (R$ %) diverge do total da ordem de compra (R$ %) acima da tolerancia permitida (% por cento).',
        round(p_valor_nf, 2), round(v_valor_total, 2), coalesce(v_tolerancia, 0);
    end if;
  end if;

  if exists (select 1 from public.recebimentos where ordem_compra_id = p_oc_id) then
    raise exception 'Esta ordem de compra ja tem recebimento registrado';
  end if;

  -- Antes o lancamento era procurado com status 'previsto' fixo. Com pagamento
  -- por forma ele pode ja estar a_pagar, aprovado ou pago quando a nota chega
  -- (dinheiro e cartao nao esperam nota), e a busca por status derrubava o
  -- recebimento com "lancamento previsto nao encontrado".
  select id, status into v_lanc_id, v_status_lanc
  from public.lancamentos
  where origem = 'oc' and origem_id = p_oc_id and status <> 'cancelado'
  order by created_at desc
  limit 1;

  if v_lanc_id is null then
    raise exception 'Lancamento desta ordem de compra nao encontrado';
  end if;

  select count(*), round(coalesce(sum(valor), 0), 2)
  into v_qtd_parcelas, v_soma_parcelas
  from public.lancamento_parcelas
  where lancamento_id = v_lanc_id;

  if v_qtd_parcelas = 0 then
    -- Lancamento ainda incompleto: as parcelas serao definidas no financeiro a
    -- partir do valor da nota.
    update public.lancamentos set valor = p_valor_nf where id = v_lanc_id;

  elsif v_soma_parcelas <> round(p_valor_nf, 2) then
    select id, valor into v_parcela_id, v_valor_parcela
    from public.lancamento_parcelas
    where lancamento_id = v_lanc_id and status = 'pendente'
    order by numero_parcela desc
    limit 1;

    if v_parcela_id is null then
      -- Nao ha parcela em aberto: o dinheiro ja foi aprovado ou ja saiu.
      -- Reescrever valor pago seria falsificar historico, entao a divergencia
      -- fica registrada no recebimento e o valor do lancamento fica de pe.
      v_divergencia := round(p_valor_nf, 2) - v_soma_parcelas;
    else
      v_diferenca := round(p_valor_nf, 2) - v_soma_parcelas;

      if round(v_valor_parcela + v_diferenca, 2) <= 0 then
        raise exception 'A diferenca da nota fiscal (R$ %) zeraria a ultima parcela em aberto (R$ %). Ajuste as parcelas antes de registrar o recebimento.',
          v_diferenca, v_valor_parcela;
      end if;

      update public.lancamento_parcelas
      set valor = round(v_valor_parcela + v_diferenca, 2)
      where id = v_parcela_id;

      update public.lancamentos set valor = p_valor_nf where id = v_lanc_id;
    end if;
  end if;

  update public.lancamentos
  set data_vencimento = (
    select min(lp.data_vencimento)
    from public.lancamento_parcelas lp
    where lp.lancamento_id = v_lanc_id
  )
  where id = v_lanc_id;

  insert into public.recebimentos (
    ordem_compra_id, lancamento_id, numero_nf, valor_nf, data_recebimento,
    divergencia_valor, created_by
  )
  values (
    p_oc_id, v_lanc_id, v_numero_nf, p_valor_nf, p_data_recebimento,
    nullif(v_divergencia, 0), (select auth.uid())
  );

  update public.ordens_compra
  set status = 'recebido'
  where id = p_oc_id;

  -- A nota so promove status de lancamento que ainda estava incompleto: a
  -- regra da forma decide, nunca o recebimento por conta propria.
  if v_status_lanc = 'previsto' then
    perform public.fn_aplicar_regra_pagamento(v_lanc_id);
  end if;

  -- Fecha o ciclo de quem pagou antes da nota (cartao de credito): a OC ja
  -- estava quitada e agora recebeu, entao vira 'pago'.
  select v_qtd_parcelas > 0 and not exists (
    select 1 from public.lancamento_parcelas
    where lancamento_id = v_lanc_id and status <> 'pago'
  )
  into v_tudo_pago;

  if v_tudo_pago then
    update public.ordens_compra set status = 'pago' where id = p_oc_id;
  end if;
end;
$$;

-- 9. Mensagem da trava de 'previsto' -----------------------------------------
-- 'previsto' agora e lancamento incompleto, nao mais "esperando nota fiscal".

create or replace function public.fn_aprovar_parcela(p_parcela_id uuid)
returns void
language plpgsql
security definer
set search_path to ''
as $$
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
    raise exception 'Este lancamento esta incompleto: as parcelas precisam somar o valor do lancamento antes de aprovar o pagamento';
  end if;

  update public.lancamento_parcelas
  set status = 'aprovado', aprovado_por = (select auth.uid()), aprovado_em = now()
  where id = p_parcela_id;
end;
$$;

-- 10. Cadastro das formas de pagamento ---------------------------------------
-- O tipo precisa de um lugar para ser mantido pelo dono do processo, senão a
-- unica forma de corrigir um tipo errado e uma migration.

create or replace function public.fn_salvar_forma_pagamento(
  p_id uuid,
  p_nome text,
  p_tipo text,
  p_ativo boolean
)
returns uuid
language plpgsql
security definer
set search_path to ''
as $$
declare
  v_id uuid;
  v_nome text;
  v_tipo text;
begin
  if p_id is null then
    if not public.tem_permissao('cadastros.formas-pagamento', 'criar') then
      raise exception 'Sem permissao para criar formas de pagamento';
    end if;
  else
    if not public.tem_permissao('cadastros.formas-pagamento', 'editar') then
      raise exception 'Sem permissao para editar formas de pagamento';
    end if;
  end if;

  v_nome := btrim(coalesce(p_nome, ''));
  if v_nome = '' then
    raise exception 'Informe o nome da forma de pagamento';
  end if;

  v_tipo := coalesce(nullif(btrim(p_tipo), ''), 'bancario');
  if v_tipo not in ('bancario', 'dinheiro', 'cartao_credito', 'cheque') then
    raise exception 'Tipo de forma de pagamento invalido: %', v_tipo;
  end if;

  if p_id is null then
    insert into public.formas_pagamento (nome, tipo, ativo, created_by)
    values (v_nome, v_tipo, coalesce(p_ativo, true), (select auth.uid()))
    returning id into v_id;
  else
    update public.formas_pagamento
    set nome = v_nome,
        tipo = v_tipo,
        ativo = coalesce(p_ativo, true)
    where id = p_id
    returning id into v_id;

    if v_id is null then
      raise exception 'Forma de pagamento nao encontrada';
    end if;
  end if;

  return v_id;
end;
$$;

revoke all on function public.fn_salvar_forma_pagamento(uuid, text, text, boolean) from public;
grant execute on function public.fn_salvar_forma_pagamento(uuid, text, text, boolean) to authenticated;

-- Permissao da aba nova: quem ja cuida do catalogo de condicoes de pagamento
-- passa a cuidar do de formas. Sem isto a aba nasce invisivel para todos.
insert into public.usuario_permissoes (usuario_id, recurso, acao)
select distinct up.usuario_id, 'cadastros.formas-pagamento', a.acao
from public.usuario_permissoes up
cross join (values ('ver'), ('criar'), ('editar')) as a(acao)
where up.recurso = 'cadastros.condicoes-pagamento'
  and not exists (
    select 1 from public.usuario_permissoes ja
    where ja.usuario_id = up.usuario_id
      and ja.recurso = 'cadastros.formas-pagamento'
      and ja.acao = a.acao
  );

-- 11. Backfill da forma nos lancamentos que ja existiam -----------------------
-- Lancamento de OC criado antes desta migration nasceu sem forma. Herda a da
-- ordem de origem, senao o financeiro ve "Forma de pagamento: -" em documento
-- que tem forma definida na compra. Nao reaplica a regra de pagamento aqui: o
-- caminho de quem ja existe se resolve quando as parcelas forem definidas.
update public.lancamentos l
set forma_pagamento_id = oc.forma_pagamento_id
from public.ordens_compra oc
where l.origem = 'oc'
  and l.origem_id = oc.id
  and l.forma_pagamento_id is null
  and oc.forma_pagamento_id is not null;

-- 12. Indice da FK nova (advisor: unindexed_foreign_keys) --------------------
create index if not exists idx_lancamentos_forma_pagamento_id
  on public.lancamentos (forma_pagamento_id);
