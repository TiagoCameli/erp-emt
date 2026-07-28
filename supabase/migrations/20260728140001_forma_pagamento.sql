-- Forma de pagamento (metodo: dinheiro, cartao, boleto, TED, PIX...), distinta
-- da condicao de pagamento (prazo/parcelamento). Vai na OC e na cotacao (por
-- fornecedor, onde a condicao ja mora). Criavel na hora pelo Combobox (onCriar).

create table public.formas_pagamento (
  id uuid primary key default gen_random_uuid(),
  nome text not null unique,
  ativo boolean not null default true,
  created_at timestamptz not null default now(),
  created_by uuid
);

comment on table public.formas_pagamento is 'Forma/metodo de pagamento (dinheiro, cartao, boleto, TED, PIX). Lookup simples usado na OC e na cotacao.';

insert into public.formas_pagamento (nome) values
  ('Dinheiro'), ('PIX'), ('Transferencia'), ('TED'), ('Boleto'), ('Cartao'), ('Cheque');

alter table public.formas_pagamento enable row level security;

-- Leitura: qualquer autenticado (lookup nao sensivel).
create policy formas_pagamento_select on public.formas_pagamento
  for select to authenticated using (true);

grant select on table public.formas_pagamento to authenticated;

-- Criacao inline via RPC (quem cria OC ou cotacao pode adicionar uma forma).
create function public.fn_criar_forma_pagamento(p_nome text)
returns uuid language plpgsql security definer set search_path = '' as $$
declare v_id uuid; v_nome text;
begin
  if not (public.tem_permissao('compras.ordens', 'criar')
          or public.tem_permissao('compras.cotacoes', 'criar')) then
    raise exception 'Sem permissao para criar formas de pagamento';
  end if;
  v_nome := btrim(coalesce(p_nome, ''));
  if v_nome = '' then raise exception 'Informe o nome da forma de pagamento'; end if;
  insert into public.formas_pagamento (nome, created_by)
  values (v_nome, (select auth.uid()))
  on conflict (nome) do update set nome = excluded.nome
  returning id into v_id;
  return v_id;
end $$;
revoke all on function public.fn_criar_forma_pagamento(text) from public, anon;
grant execute on function public.fn_criar_forma_pagamento(text) to authenticated;

-- Campo na OC e na cotacao (por fornecedor).
alter table public.ordens_compra add column forma_pagamento_id uuid references public.formas_pagamento(id);
alter table public.cotacao_fornecedores add column forma_pagamento_id uuid references public.formas_pagamento(id);

-- fn_criar_ordem_compra passa a gravar forma_pagamento_id do cabecalho.
create or replace function public.fn_criar_ordem_compra(p_cabecalho jsonb, p_itens jsonb)
 returns uuid language plpgsql security definer set search_path to ''
as $function$
declare
  v_oc_id uuid;
  v_total numeric(14, 2);
  v_qtd_itens int;
begin
  if not public.tem_permissao('compras.ordens', 'criar') then
    raise exception 'Sem permissao para criar ordens de compra';
  end if;

  select count(*) into v_qtd_itens from jsonb_array_elements(p_itens);
  if v_qtd_itens = 0 then
    raise exception 'Adicione ao menos um item a ordem de compra';
  end if;

  select coalesce(sum(
    ((item ->> 'quantidade')::numeric(14, 3))
    * ((item ->> 'preco_unitario')::numeric(14, 2))
  ), 0)
  into v_total
  from jsonb_array_elements(p_itens) as item;

  perform set_config('oc.recalc_suprimido', '1', true);

  insert into public.ordens_compra (
    fornecedor_id, condicao_pagamento_id, forma_pagamento_id, cotacao_id,
    data_emissao, observacoes, status, valor_total
  )
  values (
    (p_cabecalho ->> 'fornecedor_id')::uuid,
    (p_cabecalho ->> 'condicao_pagamento_id')::uuid,
    nullif(p_cabecalho ->> 'forma_pagamento_id', '')::uuid,
    nullif(p_cabecalho ->> 'cotacao_id', '')::uuid,
    (p_cabecalho ->> 'data_emissao')::date,
    nullif(p_cabecalho ->> 'observacoes', ''),
    'rascunho',
    v_total
  )
  returning id into v_oc_id;

  insert into public.oc_itens (
    ordem_compra_id, insumo_id, quantidade, preco_unitario, centro_custo_id
  )
  select
    v_oc_id,
    (item ->> 'insumo_id')::uuid,
    (item ->> 'quantidade')::numeric,
    (item ->> 'preco_unitario')::numeric,
    (item ->> 'centro_custo_id')::uuid
  from jsonb_array_elements(p_itens) as item;

  perform set_config('oc.recalc_suprimido', '0', true);

  return v_oc_id;
end;
$function$;
revoke all on function public.fn_criar_ordem_compra(jsonb, jsonb) from public, anon;
grant execute on function public.fn_criar_ordem_compra(jsonb, jsonb) to authenticated;
