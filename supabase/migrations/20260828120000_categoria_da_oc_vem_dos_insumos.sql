-- A categoria de custo da ordem de compra passa a vir DOS INSUMOS.
--
-- Pedido do Tiago (27/08/2026): "categoria vem automático de acordo com os
-- insumos que estão sendo adquiridos; se a compra tiver insumos de categorias
-- diferentes a OC registra mais de uma categoria; quando a pessoa seleciona um
-- insumo, a categoria dele ao lado; quem está fazendo a OC pode alterar a
-- categoria daquele insumo direto na OC, e quando ela salva, a categoria daquele
-- insumo muda tanto nas OCs anteriores quanto para as futuras -- mas quero que
-- apareça um aviso na tela falando dessa mudança."
--
-- O que existia antes (e por que precisava mudar):
--
--   1. `ordens_compra.categoria_id` era DIGITADO no cabeçalho, obrigatório, e a
--      decisão de 30/07 era explícita: "categoria escolhida por quem sabe o que
--      está comprando, em vez de deduzida do insumo (OC com insumos de grupos
--      diferentes seria ambígua e exigiria uma regra de desempate inventada)".
--   2. Só que `fn_aprovar_ordem_compra` JÁ o sobrescrevia, na aprovação, pela
--      categoria de maior valor entre os insumos -- e já quebrava o rateio do
--      lançamento por (centro, categoria do insumo). Ou seja: a regra de
--      desempate foi inventada de qualquer jeito, e a tela dizia uma categoria
--      antes de aprovar e outra depois.
--
-- Esta migration acaba com a segunda verdade. A fonte passa a ser uma só,
-- `insumos.categoria_financeira_id`, e a ordem carrega DUAS colunas derivadas,
-- mantidas por trigger a partir dos itens:
--
--   * `categoria_ids` -- o conjunto de categorias da ordem, para a tela dizer
--     "2 categorias" e para o filtro da listagem achar a compra pela categoria
--     de QUALQUER item dela (antes, filtrar por "Peças" escondia a peça de
--     R$ 40 mil que veio na mesma nota que R$ 60 mil de material);
--   * `categoria_id` -- a predominante por valor, que continua sendo o que desce
--     para `lancamentos.categoria_id` e o que as telas de uma categoria só leem.
--
-- E o efeito para trás, que é o que o aviso da tela anuncia: como a categoria é
-- LIDA do cadastro e não fotografada na ordem, reclassificar um insumo muda o
-- que TODA ordem que o comprou mostra. `fn_reclassificar_insumo` faz isso de
-- forma controlada e leva os lançamentos já gerados junto.
--
-- ATENÇÃO A QUEM FOR APLICAR: as três funções de relatório alteradas aqui foram
-- escritas a partir do repositório, não do banco. `CREATE OR REPLACE` troca o
-- corpo INTEIRO e não dá conflito, então releia `pg_get_functiondef` de
-- fn_rel_dre e fn_rel_custo_centro_custo IMEDIATAMENTE antes do apply e refaça a
-- seção 6 a partir do corpo vivo. Já apagamos trabalho de outra frente assim
-- (ver 20260820210000).

-- =====================================================================
-- 1. A coluna do conjunto de categorias
-- =====================================================================

alter table public.ordens_compra
  add column if not exists categoria_ids uuid[] not null default '{}'::uuid[];

comment on column public.ordens_compra.categoria_ids is
  'Conjunto das categorias de custo dos insumos comprados nesta ordem, derivado por trg_oc_categorias_derivadas. Vazio = ordem sem item, ou com item cujo insumo nao tem categoria. NAO editar na mao: a fonte e insumos.categoria_financeira_id.';

comment on column public.ordens_compra.categoria_id is
  'Categoria PREDOMINANTE por valor entre os itens, derivada por trg_oc_categorias_derivadas. E ela que desce para lancamentos.categoria_id na aprovacao. Deixou de ser digitada no cabecalho em 28/08/2026.';

-- GIN porque o filtro da listagem usa `@>` (contains). Sem ele, filtrar por
-- categoria varre as 5.911 ordens.
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
  -- quantidade * preco, com desempate pelo id para nao depender da ordem em que
  -- as linhas voltaram.
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
      -- Sem item classificado, a predominante fica NULA em vez de manter a
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
  -- Mover um item de ordem (nao acontece hoje, mas o UPDATE aceita) deixaria a
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
-- para a listagem e para a tela da ordem, sem ninguem precisar reprocessar nada.
-- Vale para todo caminho que escreve o campo: a tela de Cadastros > Insumos, a
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

  select nome, categoria_financeira_id into v_nome_insumo, v_atual
  from public.insumos where id = p_insumo_id;

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

  select tipo, coalesce(natureza, 'operacional'), ativo
  into v_tipo, v_natureza, v_ativa
  from public.categorias_financeiras where id = p_categoria_id;

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

  update public.insumos
  set categoria_financeira_id = p_categoria_id, updated_at = now()
  where id = p_insumo_id;
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
  -- duas linhas por categoria em vez de uma -- somando certo, mas dobrando o
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
      select centro_custo_id, sum(bruto) as total
      from base
      group by centro_custo_id
      having sum(bruto) > 0
    ),
    -- O total ATUAL por centro, lido antes do delete (as CTEs veem o mesmo
    -- snapshot). Centro que nao aparece nos itens nao entra aqui, e por isso sai
    -- desta reclassificacao inalterado.
    atual as (
      select r.centro_custo_id, sum(r.valor) as valor
      from public.lancamento_rateios r
      where r.lancamento_id = v_lanc.id
        and r.centro_custo_id in (select centro_custo_id from bruto_centro)
      group by r.centro_custo_id
    ),
    partes as (
      select a.centro_custo_id, b.categoria_id,
             round(a.valor * b.bruto / bc.total, 2) as valor,
             row_number() over (
               partition by a.centro_custo_id
               order by b.bruto desc, b.categoria_id
             ) as ordem,
             a.valor as valor_centro
      from atual a
      join bruto_centro bc on bc.centro_custo_id = a.centro_custo_id
      join base b on b.centro_custo_id = a.centro_custo_id
    ),
    -- A sobra do arredondamento vai para a maior parte, como em
    -- fn_aprovar_ordem_compra: sem isto a soma do rateio deixa de fechar com o
    -- valor do lancamento e o total do DRE se move por centavos.
    sobra as (
      select centro_custo_id, valor_centro - sum(valor) as resto
      from partes group by centro_custo_id, valor_centro
    ),
    apagadas as (
      delete from public.lancamento_rateios r
      where r.lancamento_id = v_lanc.id
        and r.centro_custo_id in (select centro_custo_id from atual)
      returning r.id
    )
    insert into public.lancamento_rateios
      (lancamento_id, centro_custo_id, categoria_id, valor, created_by)
    select v_lanc.id, p.centro_custo_id, p.categoria_id,
           p.valor + case when p.ordem = 1 then s.resto else 0 end,
           (select auth.uid())
    from partes p
    join sobra s on s.centro_custo_id = p.centro_custo_id
    -- Parte de valor zero nao vira linha, MENOS quando e a unica do centro:
    -- apagar a ultima linha de um centro deixaria o lancamento sem aquele centro,
    -- e a invariante de centro de custo recusaria a transacao inteira.
    where p.valor <> 0 or p.ordem = 1;

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
  -- funcao le lancamentos e ordens passando por cima da RLS. E ela TEM que
  -- passar por cima, senao um usuario com visao parcial veria "0 ordens
  -- anteriores" e confirmaria uma mudanca que atinge trezentas.
  if not (public.tem_permissao('compras.ordens', 'editar')
          or public.tem_permissao('cadastros.insumos', 'editar')) then
    raise exception 'Sem permissao para contar o impacto da reclassificacao';
  end if;

  return query
  with alvo as (select unnest(coalesce(p_insumo_ids, '{}'::uuid[])) as insumo_id),
  -- DISTINCT na ordem, e nao contagem por agregacao de itens: uma OC com tres
  -- itens do mesmo insumo contaria tres vezes.
  ocs as (
    select distinct oi.ordem_compra_id
    from public.oc_itens oi
    join alvo a on a.insumo_id = oi.insumo_id
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
    (select count(*)::int from ordens_alvo where status = 'aprovado'),
    (select count(*)::int from lancs),
    (select coalesce(sum(valor), 0) from lancs);
end;
$function$;

revoke all on function public.fn_impacto_reclassificar_insumos(uuid[]) from public, anon;
grant execute on function public.fn_impacto_reclassificar_insumos(uuid[]) to authenticated;

comment on function public.fn_impacto_reclassificar_insumos(uuid[]) is
  'Quantas ordens, quantas ja aprovadas, quantos lancamentos e quanto dinheiro uma reclassificacao destes insumos alcanca. Leitura, para o dialogo de confirmacao da OC.';

-- =====================================================================
-- 6. Os relatorios passam a ler a categoria DO RATEIO
-- =====================================================================
--
-- Uma OC com duas categorias tem duas linhas de rateio, cada uma com a sua. O
-- `lancamentos.categoria_id` guarda so a predominante, entao um DRE que agrupa
-- por ele joga a compra inteira na categoria de maior valor.
--
-- `coalesce(r.categoria_id, l.categoria_id)`, e nao `r.categoria_id` puro: so o
-- caminho da aprovacao de OC preenche a categoria do rateio. Lancamento avulso,
-- folha, medicao e a carga antiga tem rateio com categoria nula, e trocar o
-- agrupamento sem o coalesce faria esse dinheiro todo virar "(sem categoria)".
-- Nulo novo muda o significado de um join sem dar erro.
--
-- LEIA A NOTA DO TOPO antes de aplicar esta secao.

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
    -- Sem categoria a linha nao tem como ser classificada. Cai em operacional
    -- porque o DRE tem de continuar mostrando ela: sumir com despesa por falta
    -- de cadastro seria o mesmo erro que esta funcao conserta, ao contrario.
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
  'DRE gerencial por competencia, somado pelo RATEIO: uma ordem com material e peca de equipamento entra nas duas categorias, com o valor de cada. Devolve a natureza da categoria para a tela separar resultado operacional, resultado financeiro e movimentacao patrimonial (que nao e resultado).';

-- O filtro por categoria do relatorio de custo por centro. Mesma razao: filtrar
-- por `l.categoria_id` escondia a parte da compra que nao era a predominante.
drop function if exists public.fn_rel_custo_centro_custo(date, date, uuid[], uuid[], uuid[], uuid[], boolean, text[], boolean, text[]);

create function public.fn_rel_custo_centro_custo(
  p_inicio date default null,
  p_fim date default null,
  p_centros uuid[] default null,
  p_categorias uuid[] default null,
  p_fornecedores uuid[] default null,
  p_formas uuid[] default null,
  p_sem_forma boolean default false,
  p_status text[] default null,
  p_excluir_previsto boolean default false,
  p_tipos_centro text[] default null
)
returns table(centro_custo_id uuid, nome text, codigo text, total numeric)
language sql
stable
set search_path to ''
as $function$
  with recursive raizes as (
    select c.id as centro_id, c.id as raiz_id
    from public.centros_custo c
    where c.pai_id is null
    union all
    select f.id, a.raiz_id
    from public.centros_custo f
    join raizes a on f.pai_id = a.centro_id
  ),
  -- Escolher um centro vale para a SUBÁRVORE dele: quem escolhe a obra quer as
  -- etapas dela, e comparar no id da etapa perdia dinheiro em silêncio.
  alvos as (
    select distinct s.id
    from unnest(coalesce(p_centros, '{}'::uuid[])) as escolhido(id)
    cross join lateral public.fn_centro_custo_subarvore(escolhido.id) s
  )
  select raiz.id, raiz.nome, raiz.codigo, sum(r.valor) as total
  from public.lancamento_rateios r
  join public.lancamentos l on l.id = r.lancamento_id
  left join raizes a on a.centro_id = r.centro_custo_id
  left join public.centros_custo raiz on raiz.id = a.raiz_id
  where l.tipo = 'a_pagar'
    and l.status <> 'cancelado'
    and (not coalesce(p_excluir_previsto, false) or l.status <> 'previsto')
    and (p_inicio is null or l.mes_competencia >= date_trunc('month', p_inicio)::date)
    and (p_fim is null or l.mes_competencia < p_fim)
    and (
      coalesce(cardinality(p_centros), 0) = 0
      or r.centro_custo_id in (select alvos.id from alvos)
    )
    and (
      coalesce(cardinality(p_categorias), 0) = 0
      or coalesce(r.categoria_id, l.categoria_id) = any(p_categorias)
    )
    and (
      coalesce(cardinality(p_fornecedores), 0) = 0
      or l.fornecedor_id = any(p_fornecedores)
    )
    and (coalesce(cardinality(p_status), 0) = 0 or l.status = any(p_status))
    -- Forma de pagamento é a única com duas pernas: 880 lançamentos a pagar não
    -- têm forma nenhuma (R$ 13,4 mi), então "sem forma" precisa ser uma escolha
    -- marcável, e não um resto invisível.
    and (
      (coalesce(cardinality(p_formas), 0) = 0 and not coalesce(p_sem_forma, false))
      or l.forma_pagamento_id = any(coalesce(p_formas, '{}'::uuid[]))
      or (coalesce(p_sem_forma, false) and l.forma_pagamento_id is null)
    )
    and (
      coalesce(cardinality(p_tipos_centro), 0) = 0
      or raiz.tipo = any(p_tipos_centro)
    )
  group by raiz.id, raiz.nome, raiz.codigo
$function$;

revoke all on function public.fn_rel_custo_centro_custo(date, date, uuid[], uuid[], uuid[], uuid[], boolean, text[], boolean, text[]) from public, anon;
grant execute on function public.fn_rel_custo_centro_custo(date, date, uuid[], uuid[], uuid[], uuid[], boolean, text[], boolean, text[]) to authenticated;

-- =====================================================================
-- 7. Backfill do derivado, com linha de controle
-- =====================================================================

do $backfill$
declare
  v_dre_antes jsonb;
  v_dre_depois jsonb;
  v_ordens int;
  v_multi int;
  v_oc uuid;
  v_divergentes int;
  v_valor_divergente numeric(14,2);
begin
  -- LINHA DE CONTROLE. O DRE passou a somar pelo rateio em vez de pelo
  -- lancamento: o total POR CATEGORIA tem que mudar (e o objetivo), e o total
  -- POR TIPO nao pode mudar nem um centavo. Se mudar, existe lancamento cujo
  -- rateio nao soma o valor dele -- e ai o relatorio inteiro estava mentindo de
  -- um jeito que ninguem tinha medido.
  select jsonb_object_agg(tipo, total) into v_dre_antes
  from (
    select l.tipo, sum(l.valor) as total
    from public.lancamentos l
    where l.status <> 'cancelado'
      and l.mes_competencia >= '2020-01-01'
      and l.mes_competencia < '2030-12-31'
    group by l.tipo
  ) t;

  select jsonb_object_agg(tipo, total) into v_dre_depois
  from (
    select tipo, sum(total) as total
    from public.fn_rel_dre('2020-01-01', '2030-12-31')
    group by tipo
  ) t;

  if v_dre_antes <> v_dre_depois then
    raise exception
      'O DRE somado pelo rateio nao fecha com o somado pelo lancamento. Antes: %. Depois: %. Ha lancamento cujo rateio nao soma o valor dele; conserte antes de trocar a funcao.',
      v_dre_antes::text, v_dre_depois::text;
  end if;

  raise notice 'DRE por tipo intacto na troca de base: %', v_dre_antes::text;

  -- O backfill em si. Uma chamada por ordem: sao 5.911, roda em segundos, e a
  -- funcao ja nao escreve quando o derivado nao muda.
  v_ordens := 0;
  for v_oc in select id from public.ordens_compra loop
    perform public.fn_oc_categorias_derivadas(v_oc);
    v_ordens := v_ordens + 1;
  end loop;

  select count(*) into v_multi
  from public.ordens_compra
  where cardinality(categoria_ids) > 1;

  raise notice 'Derivado refeito em % ordens. Com mais de uma categoria: %.',
    v_ordens, v_multi;

  -- O que esta migration NAO faz, de proposito: realinhar os lancamentos ja
  -- gerados cuja categoria discorda da predominante dos itens de hoje.
  --
  -- Discordam porque o cadastro do insumo mudou depois da aprovacao. Realinhar
  -- e o comportamento pedido ("reclassifica tudo") e passa a valer para toda
  -- reclassificacao FUTURA, via fn_reclassificar_insumo. Fazer a base inteira
  -- aqui moveria dinheiro entre categorias do DRE de meses fechados numa
  -- migration de estrutura, sem ninguem ter visto o tamanho. O numero fica
  -- medido para o Tiago decidir.
  select count(*), coalesce(sum(l.valor), 0)
  into v_divergentes, v_valor_divergente
  from public.lancamentos l
  join public.ordens_compra oc on oc.id = l.origem_id
  where l.origem = 'oc'
    and l.status <> 'cancelado'
    and oc.categoria_id is not null
    and l.categoria_id is distinct from oc.categoria_id;

  raise notice
    'Lancamentos de OC cuja categoria discorda da predominante dos itens de hoje: % (R$ %). NAO foram tocados: decisao do Tiago em passo separado.',
    v_divergentes, to_char(v_valor_divergente, 'FM999999999990.00');
end $backfill$;

notify pgrst, 'reload schema';
