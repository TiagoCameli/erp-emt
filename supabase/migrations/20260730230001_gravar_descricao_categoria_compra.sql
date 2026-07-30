-- Descricao e categoria passam a ser GRAVADAS na compra.
--
-- A 20260730220001 criou ordens_compra.descricao/categoria_id (e as mesmas em
-- cotacoes) e fez o lancamento herdar as duas na aprovacao, mas nada preenchia
-- as colunas: o insert de fn_criar_ordem_compra lista as colunas uma a uma e
-- nao incluia os dois campos novos. Resultado: OC nascia sempre sem descricao e
-- sem categoria, e o lancamento aprovado caia no texto de fallback
-- ('Ordem de compra OC-XXXX') com categoria_id null, exatamente o problema que
-- a coluna existia para resolver.
--
-- Duas mudancas aqui:
-- 1. fn_criar_ordem_compra le descricao e categoria_id de p_cabecalho.
-- 2. Um trigger valida a categoria em ordens_compra e em cotacoes.
--
-- A validacao fica no trigger, e nao dentro da funcao de criar, porque nem todo
-- caminho de gravacao passa por funcao: a edicao do cabecalho da OC e toda a
-- gravacao da cotacao (criar e editar) sao UPDATE/INSERT direto na tabela via
-- RLS. No trigger a regra vale para os tres caminhos, sem duplicata.
--
-- A FK ja garante que a categoria existe; o que ela nao pega e categoria
-- INATIVA, que e o caso real (categoria desativada no cadastro continua sendo
-- um id valido).

create or replace function public.fn_validar_categoria_compra()
returns trigger
language plpgsql
security definer
set search_path to ''
as $$
declare
  v_ativo boolean;
begin
  -- Em UPDATE, so valida quando a categoria realmente muda. Categoria
  -- desativada depois da compra nao pode travar aprovacao, cancelamento nem
  -- edicao de outro campo de um documento que ja existe.
  if tg_op = 'UPDATE' and new.categoria_id is not distinct from old.categoria_id then
    return new;
  end if;

  -- Categoria e opcional: compra e cotacao antigas continuam validas sem ela.
  if new.categoria_id is null then
    return new;
  end if;

  select ativo into v_ativo
  from public.categorias_financeiras
  where id = new.categoria_id;

  if v_ativo is null then
    raise exception 'Categoria financeira nao encontrada';
  end if;
  if not v_ativo then
    raise exception 'A categoria financeira escolhida esta inativa. Escolha uma categoria ativa';
  end if;

  return new;
end;
$$;

revoke all on function public.fn_validar_categoria_compra() from public;

comment on function public.fn_validar_categoria_compra() is
  'Barra categoria financeira inexistente ou inativa em ordens_compra e cotacoes. Em UPDATE so age quando a categoria muda.';

drop trigger if exists trg_ordens_compra_categoria on public.ordens_compra;
create trigger trg_ordens_compra_categoria
  before insert or update of categoria_id on public.ordens_compra
  for each row execute function public.fn_validar_categoria_compra();

drop trigger if exists trg_cotacoes_categoria on public.cotacoes;
create trigger trg_cotacoes_categoria
  before insert or update of categoria_id on public.cotacoes
  for each row execute function public.fn_validar_categoria_compra();

comment on column public.cotacoes.descricao is
  'O que esta sendo cotado, em uma linha. Vira a descricao da OC gerada da cotacao.';
comment on column public.cotacoes.categoria_id is
  'Categoria do custo do que esta sendo cotado. Segue para a OC e de la para o lancamento.';

-- Corpo identico ao que estava no banco, com descricao e categoria_id lidos do
-- cabecalho e gravados no insert. Nada mais mudou: itens, total calculado,
-- competencia, cotacao de origem, set_config do recalculo e propagacao de
-- anexos seguem iguais.
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
  v_descricao text;
  v_categoria uuid;
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

  -- Descricao sem espaco nas pontas: e ela que vira a descricao do lancamento,
  -- e ' ' passando por nullif viraria uma descricao em branco no financeiro.
  v_descricao := nullif(btrim(p_cabecalho ->> 'descricao'), '');
  v_categoria := nullif(p_cabecalho ->> 'categoria_id', '')::uuid;

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
    data_compra, mes_competencia, observacoes, status, valor_total,
    descricao, categoria_id
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
    v_total,
    v_descricao,
    v_categoria
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

revoke all on function public.fn_criar_ordem_compra(jsonb, jsonb) from public;
grant execute on function public.fn_criar_ordem_compra(jsonb, jsonb) to authenticated;

notify pgrst, 'reload schema';
