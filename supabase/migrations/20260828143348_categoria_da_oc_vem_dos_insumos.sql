-- APLICADA NO BANCO VIVO EM 4 MIGRATIONS, em 28/08/2026:
--
--   20260828143348  categoria_da_oc_vem_dos_insumos_derivado
--   20260828143450  reclassificar_insumo_pela_ordem_de_compra
--   20260828143634  reclassificar_insumo_qualifica_valor_ambiguo
--   20260828143752  relatorios_de_custo_leem_a_categoria_do_rateio
--
-- Este arquivo e a versao consolidada, e o corpo das funcoes aqui e o que esta
-- NO BANCO depois das quatro. A terceira existe porque as duas funcoes novas
-- nasceram com `valor` ambiguo entre o parametro de SAIDA e a coluna das
-- tabelas: o plpgsql so resolve isso na EXECUCAO, entao os dois primeiros
-- applies responderam "success" com as funcoes quebradas
--
--   ERROR: column reference "valor" is ambiguous
--
-- e o erro so apareceria no primeiro uso, no dialogo de confirmacao da OC, na
-- mao do usuario. Quem achou foi a prova em transacao desfeita, nao o apply.
--
-- A categoria de custo da ordem de compra passa a vir DOS INSUMOS.
--
-- Pedido do Tiago (27/08/2026): "categoria vem automatico de acordo com os
-- insumos que estao sendo adquiridos; se a compra tiver insumos de categorias
-- diferentes a OC registra mais de uma categoria; quando a pessoa seleciona um
-- insumo, a categoria dele ao lado; quem esta fazendo a OC pode alterar a
-- categoria daquele insumo direto na OC, e quando ela salva, a categoria daquele
-- insumo muda tanto nas OCs anteriores quanto para as futuras -- mas quero que
-- apareca um aviso na tela falando dessa mudanca."
--
-- O que existia antes, e por que precisava mudar:
--
--   1. `ordens_compra.categoria_id` era DIGITADO no cabecalho, obrigatorio. A
--      decisao de 30/07 foi explicita: "categoria escolhida por quem sabe o que
--      esta comprando, em vez de deduzida do insumo (OC com insumos de grupos
--      diferentes seria ambigua e exigiria uma regra de desempate inventada)".
--   2. Só que `fn_aprovar_ordem_compra` JA o sobrescrevia, na aprovacao, pela
--      categoria de maior valor entre os insumos -- e JA quebrava o rateio do
--      lancamento por (centro, categoria do insumo). A regra de desempate foi
--      inventada de qualquer jeito, e a tela dizia uma categoria antes de
--      aprovar e outra depois.
--
-- Medido no banco vivo hoje (28/08/2026), antes de aplicar:
--
--   * 72 ordens de compra, 10 delas (14%) JA com mais de uma categoria entre os
--     insumos -- e todas as 10 aparecendo com UMA categoria na tela;
--   * 6.367 lancamentos vivos, e ZERO com rateio que nao soma o valor do
--     lancamento (diferenca total R$ 0,00). E o que autoriza o DRE a trocar de
--     base sem mover um centavo;
--   * 6.540 rateios, 489 deles SEM categoria, somando R$ 61.446.438,72 -- todos
--     de lancamento `manual`. E por isso que o DRE agrupa por
--     `coalesce(r.categoria_id, l.categoria_id)` e nao por `r.categoria_id`:
--     sem o coalesce, esses R$ 61,4 mi viravam "(sem categoria)";
--   * ZERO divergencia entre o `categoria_id` guardado (na ordem e no
--     lancamento) e a predominante dos itens de hoje. Nao existe passivo
--     retroativo a realinhar: a base ja esta consistente, e o backfill da secao
--     7 nao muda nenhuma tela.
--
-- Esta migration acaba com a segunda verdade. A fonte passa a ser uma so,
-- `insumos.categoria_financeira_id`, e a ordem carrega duas colunas derivadas,
-- mantidas por trigger a partir dos itens:
--
--   * `categoria_ids` -- o conjunto, para a tela dizer "2 categorias" e para o
--     filtro da listagem achar a compra pela categoria de QUALQUER item dela
--     (antes, filtrar por "Pecas" escondia a peca que veio na mesma nota que o
--     material);
--   * `categoria_id` -- a predominante por valor, que continua sendo o que desce
--     para `lancamentos.categoria_id`.
--
-- E o efeito para tras, que e o que o aviso da tela anuncia: como a categoria e
-- LIDA do cadastro e nao fotografada na ordem, reclassificar um insumo muda o
-- que toda ordem que o comprou mostra. `fn_reclassificar_insumo` faz isso de
-- forma controlada e leva o rateio dos lancamentos ja gerados junto.

-- =====================================================================
-- 1. A coluna do conjunto de categorias
-- =====================================================================

alter table public.ordens_compra
  add column if not exists categoria_ids uuid[] not null default '{}'::uuid[];

comment on column public.ordens_compra.categoria_ids is
  'Conjunto das categorias de custo dos insumos comprados nesta ordem, derivado por trg_oc_categorias_derivadas. Vazio = ordem sem item, ou com item cujo insumo nao tem categoria. NAO editar na mao: a fonte e insumos.categoria_financeira_id.';

comment on column public.ordens_compra.categoria_id is
  'Categoria PREDOMINANTE por valor entre os itens, derivada por trg_oc_categorias_derivadas. E ela que desce para lancamentos.categoria_id na aprovacao. Deixou de ser digitada no cabecalho em 28/08/2026.';

-- GIN porque o filtro da listagem usa `@>` (contains).
create index if not exists idx_ordens_compra_categoria_ids
  on public.ordens_compra using gin (categoria_ids);

-- =====================================================================
-- 2. A conta canonica: as categorias de uma ordem
-- =====================================================================

-- Uma funcao so, usada pela trigger dos itens E pela trigger do insumo. Duas
-- copias divergiriam na primeira mudanca, e a divergencia aqui e a tela e o DRE
-- discordando sobre a mesma compra.
create or replace function public.fn_oc_categorias_derivadas(p_oc_id uuid)
returns void
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_ids uuid[];
  v_predominante uuid;
begin
  -- Ordem apagada nesta mesma transacao (lixeira, cancelamento): nada a derivar.
  if not exists (select 1 from public.ordens_compra where id = p_oc_id) then
    return;
  end if;

  -- Item sem categoria fica FORA do conjunto de proposito. Ele nao classifica
  -- nada, e quem cobra por ele e a trava da aprovacao mais o aviso da tela.
  -- Conta-lo como uma categoria anonima faria uma ordem incompleta parecer uma
  -- ordem com duas categorias.
  select coalesce(array_agg(distinct i.categoria_financeira_id), '{}'::uuid[])
  into v_ids
  from public.oc_itens oi
  join public.insumos i on i.id = oi.insumo_id
  where oi.ordem_compra_id = p_oc_id
    and i.categoria_financeira_id is not null;

  -- A predominante e a MESMA conta de fn_aprovar_ordem_compra: maior soma de
  -- quantidade * preco, desempate pelo id para nao depender da ordem em que as
  -- linhas voltaram.
  select i.categoria_financeira_id
  into v_predominante
  from public.oc_itens oi
  join public.insumos i on i.id = oi.insumo_id
  where oi.ordem_compra_id = p_oc_id
    and i.categoria_financeira_id is not null
  group by i.categoria_financeira_id
  order by sum(oi.quantidade * oi.preco_unitario) desc,
           i.categoria_financeira_id
  limit 1;

  update public.ordens_compra
  set categoria_ids = v_ids,
      -- Sem item classificado a predominante fica NULA em vez de manter a
      -- antiga: manter mostraria na tela uma categoria que nenhum item sustenta,
      -- e a aprovacao ja recusa a ordem nesse estado.
      categoria_id = v_predominante
  where id = p_oc_id
    and (categoria_ids is distinct from v_ids
         or categoria_id is distinct from v_predominante);
end;
$function$;

revoke all on function public.fn_oc_categorias_derivadas(uuid) from public, anon;

comment on function public.fn_oc_categorias_derivadas(uuid) is
  'Recalcula ordens_compra.categoria_ids e categoria_id a partir dos itens da ordem e do cadastro dos insumos. Conta canonica, usada pelas duas triggers.';

-- =====================================================================
-- 3. As triggers que mantem o derivado
-- =====================================================================

create or replace function public.fn_trg_oc_itens_categorias()
returns trigger
language plpgsql
security definer
set search_path to ''
as $function$
begin
  if tg_op = 'DELETE' then
    perform public.fn_oc_categorias_derivadas(old.ordem_compra_id);
    return old;
  end if;

  perform public.fn_oc_categorias_derivadas(new.ordem_compra_id);
  -- Mover um item de ordem nao acontece hoje, mas o UPDATE aceita, e deixaria a
  -- ordem de origem com o derivado velho.
  if tg_op = 'UPDATE' and old.ordem_compra_id <> new.ordem_compra_id then
    perform public.fn_oc_categorias_derivadas(old.ordem_compra_id);
  end if;
  return new;
end;
$function$;

revoke all on function public.fn_trg_oc_itens_categorias() from public, anon;

drop trigger if exists trg_oc_categorias_derivadas on public.oc_itens;
create trigger trg_oc_categorias_derivadas
  after insert or update or delete on public.oc_itens
  for each row execute function public.fn_trg_oc_itens_categorias();

-- A trigger do CADASTRO. E ela que faz "muda nas OCs anteriores" ser verdade
-- para a listagem e para a tela da ordem, sem ninguem reprocessar nada. Vale
-- para todo caminho que escreve o campo: a tela de Cadastros > Insumos, a
-- importacao por planilha e a reclassificacao feita de dentro da OC.
create or replace function public.fn_trg_insumo_categoria_nas_ordens()
returns trigger
language plpgsql
security definer
set search_path to ''
as $function$
declare v_oc uuid;
begin
  for v_oc in
    select distinct oi.ordem_compra_id
    from public.oc_itens oi
    where oi.insumo_id = new.id
  loop
    perform public.fn_oc_categorias_derivadas(v_oc);
  end loop;
  return new;
end;
$function$;

revoke all on function public.fn_trg_insumo_categoria_nas_ordens() from public, anon;

drop trigger if exists trg_insumo_categoria_nas_ordens on public.insumos;
-- A guarda de coluna e o que segura o custo: uma importacao que reescreve 3 mil
-- insumos sem mexer em categoria nao dispara nada.
create trigger trg_insumo_categoria_nas_ordens
  after update of categoria_financeira_id on public.insumos
  for each row
  when (old.categoria_financeira_id is distinct from new.categoria_financeira_id)
  execute function public.fn_trg_insumo_categoria_nas_ordens();

-- =====================================================================
-- 4. Reclassificar um insumo, e levar os lancamentos junto
-- =====================================================================

-- Devolve o tamanho do que mexeu, porque a tela precisa dizer o que aconteceu:
-- "13 ordens e 9 lancamentos atualizados" e a diferenca entre um aviso que
-- informa e um que decora.
create or replace function public.fn_reclassificar_insumo(
  p_insumo_id uuid,
  p_categoria_id uuid,
  p_categoria_anterior_id uuid default null
)
returns table(ordens int, ordens_aprovadas int, lancamentos int, valor numeric)
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_atual uuid;
  v_nome_insumo text;
  v_natureza text;
  v_tipo text;
  v_ativa boolean;
  v_ordens int := 0;
  v_aprovadas int := 0;
  v_lancamentos int := 0;
  v_valor numeric(14,2) := 0;
  v_lanc record;
begin
  -- Quem emite a ordem classifica o que esta comprando. A alternativa era exigir
  -- Cadastros > Insumos > editar, e na pratica o comprador teria que pedir para
  -- outra pessoa em cada munhao.
  if not (public.tem_permissao('compras.ordens', 'editar')
          or public.tem_permissao('cadastros.insumos', 'editar')) then
    raise exception 'Sem permissao para mudar a categoria de custo do insumo';
  end if;

  select i.nome, i.categoria_financeira_id into v_nome_insumo, v_atual
  from public.insumos i where i.id = p_insumo_id;

  if v_nome_insumo is null then
    raise exception 'Insumo nao encontrado';
  end if;

  -- Trava otimista. Duas pessoas com a mesma ordem aberta reclassificariam o
  -- mesmo insumo, e a segunda desfaria a primeira sem ninguem ficar sabendo --
  -- num campo que nao e da ordem, e sim do cadastro que TODAS elas leem.
  if v_atual is distinct from p_categoria_anterior_id then
    raise exception
      'A categoria de % mudou enquanto esta ordem estava aberta. Recarregue a ordem e refaca a troca.',
      v_nome_insumo;
  end if;

  if v_atual = p_categoria_id then
    return query select 0, 0, 0, 0::numeric;
    return;
  end if;

  select cf.tipo, coalesce(cf.natureza, 'operacional'), cf.ativo
  into v_tipo, v_natureza, v_ativa
  from public.categorias_financeiras cf where cf.id = p_categoria_id;

  if v_tipo is null then
    raise exception 'Categoria de custo nao encontrada';
  end if;
  if not v_ativa then
    raise exception 'Categoria de custo inativa';
  end if;
  if v_tipo <> 'despesa' then
    raise exception 'Insumo de compra so aceita categoria de despesa';
  end if;
  -- Natureza `movimentacao` e principal de aplicacao e de emprestimo, e
  -- fn_rel_posicao_bancaria a EXCLUI do saldo. Aceitar uma aqui faria uma compra
  -- de material sair do saldo bancario sem ninguem ter pedido isso.
  if v_natureza = 'movimentacao' then
    raise exception
      'Categoria de natureza movimentacao nao classifica compra: ela sai do saldo bancario e do resultado';
  end if;

  update public.insumos i
  set categoria_financeira_id = p_categoria_id, updated_at = now()
  where i.id = p_insumo_id;
  -- A trigger trg_insumo_categoria_nas_ordens ja refez categoria_ids e
  -- categoria_id de todas as ordens deste insumo neste ponto.

  select count(*), count(*) filter (where oc.status = 'aprovado')
  into v_ordens, v_aprovadas
  from public.ordens_compra oc
  where exists (
    select 1 from public.oc_itens oi
    where oi.ordem_compra_id = oc.id and oi.insumo_id = p_insumo_id
  );

  -- Agora os lancamentos. O rateio muda SO na dimensao categoria: o centro de
  -- cada linha e o total por centro ficam exatamente como estao.
  --
  -- Recalcular o rateio inteiro a partir dos itens da OC seria mais simples e
  -- estaria errado: 131 lancamentos tiveram o CENTRO reclassificado a mao depois
  -- da aprovacao (20260814120000), e recalcular desfaria aquilo em silencio.
  --
  -- A conta e por CENTRO, nao por linha de rateio: um centro pode ja ter duas
  -- linhas (uma por categoria), e repartir cada linha separadamente devolveria
  -- duas linhas por categoria em vez de uma -- somando certo, e dobrando o
  -- numero de linhas a cada reclassificacao.
  for v_lanc in
    select l.id, l.valor, l.origem_id
    from public.lancamentos l
    where l.origem = 'oc'
      and l.status <> 'cancelado'
      and exists (
        select 1 from public.oc_itens oi
        where oi.ordem_compra_id = l.origem_id
          and oi.insumo_id = p_insumo_id
      )
  loop
    with base as (
      select oi.centro_custo_id,
             i.categoria_financeira_id as categoria_id,
             round(sum(oi.quantidade * oi.preco_unitario), 2) as bruto
      from public.oc_itens oi
      join public.insumos i on i.id = oi.insumo_id
      where oi.ordem_compra_id = v_lanc.origem_id
        and i.categoria_financeira_id is not null
      group by oi.centro_custo_id, i.categoria_financeira_id
    ),
    -- Centro cujo bruto e zero (item de preco zero) fica de fora: nao ha como
    -- repartir proporcionalmente, e dividir por zero derrubaria a chamada.
    bruto_centro as (
      select base.centro_custo_id, sum(base.bruto) as total
      from base
      group by base.centro_custo_id
      having sum(base.bruto) > 0
    ),
    -- O total ATUAL por centro, lido antes do delete (as CTEs veem o mesmo
    -- snapshot). Centro que nao aparece nos itens nao entra aqui, e por isso sai
    -- desta reclassificacao inalterado.
    atual as (
      select r.centro_custo_id, sum(r.valor) as valor_centro
      from public.lancamento_rateios r
      where r.lancamento_id = v_lanc.id
        and r.centro_custo_id in (select bc.centro_custo_id from bruto_centro bc)
      group by r.centro_custo_id
    ),
    partes as (
      select a.centro_custo_id, b.categoria_id,
             round(a.valor_centro * b.bruto / bc.total, 2) as parte,
             row_number() over (
               partition by a.centro_custo_id
               order by b.bruto desc, b.categoria_id
             ) as ordem_da_parte,
             a.valor_centro
      from atual a
      join bruto_centro bc on bc.centro_custo_id = a.centro_custo_id
      join base b on b.centro_custo_id = a.centro_custo_id
    ),
    -- A sobra do arredondamento vai para a maior parte, como em
    -- fn_aprovar_ordem_compra: sem isto a soma do rateio deixa de fechar com o
    -- valor do lancamento e o total do DRE se move por centavos.
    sobra as (
      select partes.centro_custo_id,
             partes.valor_centro - sum(partes.parte) as resto
      from partes
      group by partes.centro_custo_id, partes.valor_centro
    ),
    apagadas as (
      delete from public.lancamento_rateios r
      where r.lancamento_id = v_lanc.id
        and r.centro_custo_id in (select a.centro_custo_id from atual a)
      returning r.id
    )
    insert into public.lancamento_rateios
      (lancamento_id, centro_custo_id, categoria_id, valor, created_by)
    select v_lanc.id, p.centro_custo_id, p.categoria_id,
           p.parte + case when p.ordem_da_parte = 1 then s.resto else 0 end,
           (select auth.uid())
    from partes p
    join sobra s on s.centro_custo_id = p.centro_custo_id
    -- Parte de valor zero nao vira linha, MENOS quando e a unica do centro:
    -- apagar a ultima linha de um centro deixaria o lancamento sem aquele centro,
    -- e a invariante de centro de custo recusaria a transacao inteira.
    where p.parte <> 0 or p.ordem_da_parte = 1;

    -- A predominante do lancamento acompanha o rateio. Ela e o que os relatorios
    -- de uma categoria so leem, e o que a tela de Lancamentos mostra.
    update public.lancamentos l
    set categoria_id = (
      select r.categoria_id
      from public.lancamento_rateios r
      where r.lancamento_id = v_lanc.id and r.categoria_id is not null
      group by r.categoria_id
      order by sum(r.valor) desc, r.categoria_id
      limit 1
    )
    where l.id = v_lanc.id
      and exists (
        select 1 from public.lancamento_rateios r
        where r.lancamento_id = v_lanc.id and r.categoria_id is not null
      );

    v_lancamentos := v_lancamentos + 1;
    v_valor := v_valor + coalesce(v_lanc.valor, 0);
  end loop;

  return query select v_ordens, v_aprovadas, v_lancamentos, v_valor;
end;
$function$;

revoke all on function public.fn_reclassificar_insumo(uuid, uuid, uuid) from public, anon;
grant execute on function public.fn_reclassificar_insumo(uuid, uuid, uuid) to authenticated;

comment on function public.fn_reclassificar_insumo(uuid, uuid, uuid) is
  'Muda insumos.categoria_financeira_id e reclassifica a dimensao categoria do rateio dos lancamentos das OCs que compraram o insumo (centro e valor de cada linha ficam intactos). Recusa quando a categoria mudou desde que a tela carregou, quando a categoria nao e despesa ativa, e quando a natureza e movimentacao. Devolve o tamanho do impacto.';

-- =====================================================================
-- 5. O tamanho do impacto, antes de confirmar
-- =====================================================================

create or replace function public.fn_impacto_reclassificar_insumos(
  p_insumo_ids uuid[]
)
returns table(ordens int, ordens_aprovadas int, lancamentos int, valor numeric)
language plpgsql
stable
security definer
set search_path to ''
as $function$
begin
  -- Definer sem checagem e uma porta aberta, mesmo devolvendo so contagem: a
  -- funcao le ordens e lancamentos passando por cima da RLS. E ela TEM que
  -- passar por cima, senao um usuario com visao parcial veria "0 ordens
  -- anteriores" e confirmaria uma mudanca que atinge trezentas.
  if not (public.tem_permissao('compras.ordens', 'editar')
          or public.tem_permissao('cadastros.insumos', 'editar')) then
    raise exception 'Sem permissao para contar o impacto da reclassificacao';
  end if;

  return query
  with ocs as (
    -- DISTINCT na ordem, e nao contagem por agregacao de itens: uma OC com tres
    -- itens do mesmo insumo contaria tres vezes.
    select distinct oi.ordem_compra_id
    from public.oc_itens oi
    where oi.insumo_id = any(coalesce(p_insumo_ids, '{}'::uuid[]))
  ),
  ordens_alvo as (
    select oc.id, oc.status
    from public.ordens_compra oc
    join ocs on ocs.ordem_compra_id = oc.id
  ),
  lancs as (
    select l.id, l.valor
    from public.lancamentos l
    join ocs on ocs.ordem_compra_id = l.origem_id
    where l.origem = 'oc' and l.status <> 'cancelado'
  )
  select
    (select count(*)::int from ordens_alvo),
    (select count(*)::int from ordens_alvo where ordens_alvo.status = 'aprovado'),
    (select count(*)::int from lancs),
    (select coalesce(sum(lancs.valor), 0) from lancs);
end;
$function$;

revoke all on function public.fn_impacto_reclassificar_insumos(uuid[]) from public, anon;
grant execute on function public.fn_impacto_reclassificar_insumos(uuid[]) to authenticated;

comment on function public.fn_impacto_reclassificar_insumos(uuid[]) is
  'Quantas ordens, quantas ja aprovadas, quantos lancamentos e quanto dinheiro uma reclassificacao destes insumos alcanca. Leitura, para o dialogo de confirmacao da OC.';

-- =====================================================================
-- 6. Os relatorios de custo passam a ler a categoria DO RATEIO
-- =====================================================================
--
-- Uma OC com duas categorias tem duas linhas de rateio, cada uma com a sua. Um
-- relatorio que agrupa ou filtra por `lancamentos.categoria_id` joga a compra
-- inteira na categoria de maior valor.
--
-- `coalesce(r.categoria_id, l.categoria_id)`, e nao `r.categoria_id` puro: so o
-- caminho da aprovacao de OC preenche a categoria do rateio. Sao 489 rateios com
-- categoria nula (R$ 61,4 mi, todos de lancamento manual), e sem o coalesce esse
-- dinheiro todo viraria "(sem categoria)". Nulo novo muda o significado de um
-- join sem dar erro.
--
-- AS 4 FUNCOES DE FILTRO SAO EDITADAS A PARTIR DELAS MESMAS. Nao ha corpo
-- reescrito aqui: cada uma le `pg_get_functiondef`, confere que a ancora aparece
-- EXATAMENTE uma vez e troca so aquele trecho. E o unico jeito seguro --
-- `fn_rel_custo_centro_custo` viva ja divergia do repositorio (ganhou "a etapa
-- ganha da raiz" e a exclusao do centro financeiro), e reescrever pelo repo
-- apagaria aquilo sem conflito, sem erro e sem aviso.
--
-- Fica de FORA de proposito tudo que usa a categoria para decidir NATUREZA:
-- fn_rel_posicao_bancaria, fn_rel_posicao_aplicacao, fn_rel_movimento_antes_do_corte,
-- fn_rel_fluxo_caixa, fn_rel_aging, fn_rel_creditos, fn_rel_custo_receita e
-- fn_rel_gestao_financeiro_resumo. Aquelas mexem em SALDO, e a natureza e do
-- documento inteiro, nao de uma fatia dele. fn_rel_custo_por_insumo e
-- fn_rel_custo_por_subcategoria tambem ficam: o `categoria_id` delas e o da
-- tabela categorias_insumo (o grupo), que nao tem nada com categoria financeira.

do $relatorios$
declare
  v_def text;
  v_novo text;
  v_vezes int;
  v_faltando text;
begin
  -- ---------- 6.1 fn_rel_custo_centro_custo: o filtro por categoria ----------
  v_def := pg_get_functiondef(
    'public.fn_rel_custo_centro_custo(date,date,uuid[],uuid[],uuid[],uuid[],boolean,text[],boolean,text[])'::regprocedure);
  v_vezes := (length(v_def) - length(replace(v_def, 'or l.categoria_id = any(p_categorias)', '')))
             / length('or l.categoria_id = any(p_categorias)');
  if v_vezes <> 1 then
    raise exception
      'fn_rel_custo_centro_custo: esperava 1 ocorrencia do filtro de categoria e achei %. Releia a funcao viva antes de mexer.', v_vezes;
  end if;
  v_novo := replace(v_def,
    'or l.categoria_id = any(p_categorias)',
    'or coalesce(r.categoria_id, l.categoria_id) = any(p_categorias)');
  execute v_novo;

  -- ---------- 6.2 fn_rel_custo_centro_serie: mesmo filtro ----------
  v_def := pg_get_functiondef(
    'public.fn_rel_custo_centro_serie(uuid[],date,date,uuid[],uuid[],uuid[],boolean,text[],boolean)'::regprocedure);
  v_vezes := (length(v_def) - length(replace(v_def, 'or l.categoria_id = any(p_categorias)', '')))
             / length('or l.categoria_id = any(p_categorias)');
  if v_vezes <> 1 then
    raise exception
      'fn_rel_custo_centro_serie: esperava 1 ocorrencia do filtro de categoria e achei %.', v_vezes;
  end if;
  v_novo := replace(v_def,
    'or l.categoria_id = any(p_categorias)',
    'or coalesce(r.categoria_id, l.categoria_id) = any(p_categorias)');
  execute v_novo;

  -- ---------- 6.3 fn_rel_custo_por_mes ----------
  v_def := pg_get_functiondef(
    'public.fn_rel_custo_por_mes(integer,date,date,uuid,uuid)'::regprocedure);
  v_vezes := (length(v_def) - length(replace(v_def, '(p_categoria is null or l.categoria_id = p_categoria)', '')))
             / length('(p_categoria is null or l.categoria_id = p_categoria)');
  if v_vezes <> 1 then
    raise exception
      'fn_rel_custo_por_mes: esperava 1 ocorrencia do filtro de categoria e achei %.', v_vezes;
  end if;
  v_novo := replace(v_def,
    '(p_categoria is null or l.categoria_id = p_categoria)',
    '(p_categoria is null or coalesce(r.categoria_id, l.categoria_id) = p_categoria)');
  execute v_novo;

  -- ---------- 6.4 fn_rel_custo_por_grupo: tres pontos coordenados ----------
  --
  -- Esta e diferente das outras. Ela filtra o LANCAMENTO por categoria numa CTE
  -- onde o rateio nem esta em escopo, e depois soma os ITENS da OC. Com uma OC
  -- mista, filtrar por "Pecas" derrubava a ordem inteira -- inclusive os itens de
  -- material dela. O certo e escolher os ITENS, no ramo dos itens, e o
  -- lancamento inteiro so no ramo que nao tem item.
  v_def := pg_get_functiondef(
    'public.fn_rel_custo_por_grupo(date,date,uuid,uuid)'::regprocedure);

  v_faltando := null;
  if position('select l.id, l.origem, l.origem_id' in v_def) = 0 then
    v_faltando := 'o select da CTE lancs';
  elsif position(E'      and (p_categoria is null or l.categoria_id = p_categoria)\n' in v_def) = 0 then
    v_faltando := 'o filtro de categoria na CTE lancs';
  elsif position(E'    where l.origem = ''oc''\n' in v_def) = 0 then
    v_faltando := 'o where do ramo com insumo';
  elsif position(E'    where l.origem <> ''oc''\n' in v_def) = 0 then
    v_faltando := 'o where do ramo sem insumo';
  end if;
  if v_faltando is not null then
    raise exception
      'fn_rel_custo_por_grupo: nao achei % na funcao viva. Releia e refaca esta secao a mao.',
      v_faltando;
  end if;

  -- a) a CTE lancs passa a carregar a categoria do lancamento...
  v_novo := replace(v_def,
    'select l.id, l.origem, l.origem_id',
    'select l.id, l.origem, l.origem_id, l.categoria_id');
  -- b) ...e para de recusar o lancamento pela categoria dele
  v_novo := replace(v_novo,
    E'      and (p_categoria is null or l.categoria_id = p_categoria)\n',
    '');
  -- c) o ramo dos itens escolhe por ITEM
  v_novo := replace(v_novo,
    E'    where l.origem = ''oc''\n',
    E'    where l.origem = ''oc''\n      and (p_categoria is null or i.categoria_financeira_id = p_categoria)\n');
  -- d) o ramo sem item continua escolhendo pelo documento, agora pelo rateio
  v_novo := replace(v_novo,
    E'    where l.origem <> ''oc''\n',
    E'    where l.origem <> ''oc''\n      and (p_categoria is null or coalesce(r.categoria_id, l.categoria_id) = p_categoria)\n');
  execute v_novo;

  raise notice 'Os 4 filtros de categoria passaram a ler o rateio.';
end $relatorios$;

-- O DRE e o unico corpo reescrito por inteiro, porque a mudanca dele e
-- estrutural: sai de somar `lancamentos.valor` agrupado pela categoria do
-- documento, e passa a somar `lancamento_rateios.valor` agrupado pela categoria
-- da FATIA. O corpo vivo foi conferido linha por linha contra este antes do
-- apply, e e identico ao que a 20260822180000 deixou.
create or replace function public.fn_rel_dre(p_inicio date, p_fim date)
returns table(tipo text, categoria_id uuid, categoria text, natureza text, total numeric)
language sql
stable
set search_path to ''
as $function$
  select
    l.tipo,
    c.id as categoria_id,
    c.nome as categoria,
    coalesce(c.natureza, 'operacional') as natureza,
    sum(r.valor) as total
  from public.lancamento_rateios r
  join public.lancamentos l on l.id = r.lancamento_id
  left join public.categorias_financeiras c
    on c.id = coalesce(r.categoria_id, l.categoria_id)
  where l.status <> 'cancelado'
    and l.mes_competencia >= date_trunc('month', p_inicio)::date
    and l.mes_competencia < p_fim
  group by l.tipo, c.id, c.nome, c.natureza
$function$;

revoke all on function public.fn_rel_dre(date, date) from public, anon;
grant execute on function public.fn_rel_dre(date, date) to authenticated;

comment on function public.fn_rel_dre(date, date) is
  'DRE gerencial por competencia, somado pelo RATEIO: uma ordem com material e peca de equipamento entra nas duas categorias, com o valor de cada uma. Devolve a natureza da categoria para a tela separar resultado operacional, resultado financeiro e movimentacao patrimonial (que nao e resultado).';

-- =====================================================================
-- 7. Backfill do derivado, com linha de controle
-- =====================================================================

do $backfill$
declare
  v_antes jsonb;
  v_depois jsonb;
  v_ordens int := 0;
  v_multi int;
  v_oc uuid;
begin
  -- LINHA DE CONTROLE, e ela TEM que dar zero de diferenca.
  --
  -- O DRE passou a somar pelo rateio em vez de pelo lancamento. O total POR
  -- CATEGORIA muda -- e o objetivo. O total POR TIPO nao pode mudar um centavo:
  -- se mudar, existe lancamento cujo rateio nao soma o valor dele, e o relatorio
  -- passaria a mentir de um jeito que ninguem mediu. Conferido antes do apply:
  -- 0 lancamentos divergentes em 6.367.
  select jsonb_object_agg(tipo, total) into v_antes
  from (
    select l.tipo, sum(l.valor) as total
    from public.lancamentos l
    where l.status <> 'cancelado'
      and l.mes_competencia >= '2020-01-01'
      and l.mes_competencia < '2030-12-31'
    group by l.tipo
  ) t;

  select jsonb_object_agg(tipo, total) into v_depois
  from (
    select tipo, sum(total) as total
    from public.fn_rel_dre('2020-01-01', '2030-12-31')
    group by tipo
  ) t;

  if v_antes <> v_depois then
    raise exception
      'O DRE somado pelo rateio nao fecha com o somado pelo lancamento. Antes: %. Depois: %. Ha lancamento cujo rateio nao soma o valor dele; conserte antes de trocar a funcao.',
      v_antes::text, v_depois::text;
  end if;

  raise notice 'DRE por tipo intacto na troca de base: %', v_antes::text;

  -- O backfill em si. Sao 72 ordens: roda em milissegundos, e a funcao nem
  -- escreve quando o derivado nao muda.
  for v_oc in select id from public.ordens_compra loop
    perform public.fn_oc_categorias_derivadas(v_oc);
    v_ordens := v_ordens + 1;
  end loop;

  select count(*) into v_multi
  from public.ordens_compra
  where cardinality(categoria_ids) > 1;

  raise notice 'Derivado refeito em % ordens. Com mais de uma categoria: % (esperado 10).',
    v_ordens, v_multi;
end $backfill$;

notify pgrst, 'reload schema';
