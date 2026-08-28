-- A categoria de custo sai do INSUMO e passa a ser da SUBCATEGORIA.
--
-- APLICADA NO BANCO VIVO EM 2 MIGRATIONS, em 28/08/2026:
--
--   20260828162100  categoria_de_custo_passa_para_a_subcategoria
--   20260828162326  funcoes_leem_a_categoria_de_custo_da_subcategoria
--
-- Este arquivo e a versao consolidada. Os corpos de funcao aqui sao os que estao
-- NO BANCO depois das duas.
--
-- ---------------------------------------------------------------------
-- Por que
-- ---------------------------------------------------------------------
--
-- Decisao do Tiago, olhando a tela de Insumos: "eu nao quero categoria de custo
-- no app, somente grupo e sub categoria, aplique isso no app inteiro". Ele esta
-- certo, e o dado prova: a categoria de custo era praticamente uma FUNCAO da
-- subcategoria, e as excecoes eram sujeira, nao regra.
--
--   Hidraulica     -> Materiais de construcao (283 insumos), 21 excecoes
--   Eletrica       -> Materiais de construcao (208 insumos),  2 excecoes
--   Diaristas      -> Mao de Obra Terceirizada  (6 insumos),  1 excecao
--   A classificar  -> Materiais (500) / Outras despesas (18), 5 excecoes
--
-- Eram 3.391 insumos carregando um campo que 28 subcategorias determinam. A
-- categoria de custo passa a ser configurada UMA VEZ por subcategoria, em
-- Cadastros > Categorias de insumo, e o insumo fica so com grupo + subcategoria.
--
-- ---------------------------------------------------------------------
-- Medido antes de aplicar
-- ---------------------------------------------------------------------
--
--   * 30 insumos de 3.391 mudam de categoria de custo ao serem puxados para a
--     dominante da subcategoria deles, alcancando R$ 20.886,72 ja comprados em
--     14 OCs. TODOS os 30 movimentos sao de natureza `operacional` para
--     `operacional`: nada disto mexe em saldo bancario.
--   * `insumos.categoria_id` e NOT NULL e sem orfao (0 de 3.391), entao o join
--     novo para `categorias_insumo` e sem perda. Se fosse nulavel, o join
--     descartaria o item inteiro sem erro e o custo sumiria do rateio.
--   * As 28 subcategorias ficaram todas classificadas, menos "Material
--     Betuminoso CAP" -- inativa e sem insumo, entao nula de propósito.
--
-- Provado em transacao desfeita DEPOIS de trocar as funcoes: o DRE por tipo, por
-- categoria e o custo por grupo ficaram IDENTICOS. E o esperado, e o motivo
-- importa: `lancamento_rateios.categoria_id` e uma FOTO tirada na aprovacao.
-- Trocar a fonte da derivacao nao reescreve foto antiga -- vale para aprovacao
-- nova e para reclassificacao explicita.
--
-- Tambem provado, impersonando a Brenda e desfazendo: aprovar a OC-2026-0091
-- passou e o rateio saiu como "Frete" (vindo da subcategoria "Fretes e
-- transporte"); e trocar a subcategoria da BRITA 4 na OC-2026-0017 manteve o
-- rateio em R$ 100.000,00 com o POR CENTRO identico, movendo so a categoria
-- (R$ 11.077,77 de um lado para o outro, fechando ao centavo).

-- =====================================================================
-- 1. A coluna, na subcategoria
-- =====================================================================

alter table public.categorias_insumo
  add column if not exists categoria_financeira_id uuid
    references public.categorias_financeiras(id);

comment on column public.categorias_insumo.categoria_financeira_id is
  'Categoria de custo (DRE) de tudo que estiver nesta subcategoria. Passou a morar aqui em 28/08/2026: antes era um campo por insumo, redundante em 3.391 linhas. NULA e um estado legitimo (subcategoria nova ainda nao classificada), e a OC avisa antes de a aprovacao recusar.';

create index if not exists idx_categorias_insumo_categoria_financeira
  on public.categorias_insumo (categoria_financeira_id);

do $backfill$
declare
  v_tocadas int;
  v_sem_categoria text;
begin
  -- `fn_padrao_categoria_de_custo()` ja existia e ja calculava exatamente isto:
  -- a categoria mais usada em cada subcategoria.
  update public.categorias_insumo ci
  set categoria_financeira_id = p.categoria_financeira_id
  from public.fn_padrao_categoria_de_custo() p
  where p.categoria_insumo_id = ci.id
    and ci.categoria_financeira_id is null;
  get diagnostics v_tocadas = row_count;

  -- GUARDA: subcategoria ATIVA que tem insumo e ficou sem categoria travaria a
  -- aprovacao de toda OC que comprasse aquele insumo -- e hoje essas OCs passam,
  -- porque o insumo carregava a categoria. Regressao silenciosa, entao para aqui.
  select string_agg(ci.nome || ' (' || t.insumos || ' insumos)', '; ')
  into v_sem_categoria
  from public.categorias_insumo ci
  join (
    select i.categoria_id, count(*) as insumos
    from public.insumos i
    where i.ativo
    group by i.categoria_id
  ) t on t.categoria_id = ci.id
  where ci.ativo and ci.categoria_financeira_id is null;

  if v_sem_categoria is not null then
    raise exception
      'Estas subcategorias ativas tem insumo e ficaram sem categoria de custo, o que travaria a aprovacao das OCs delas: %',
      v_sem_categoria;
  end if;

  raise notice 'Categoria de custo definida em % subcategorias.', v_tocadas;
end $backfill$;

comment on function public.fn_padrao_categoria_de_custo() is
  'HISTORICA: le insumos.categoria_financeira_id, que deixou de ser a fonte em 28/08/2026. Serviu de base para o backfill de categorias_insumo.categoria_financeira_id e nao deve mais ser usada para decidir classificacao.';

comment on column public.insumos.categoria_financeira_id is
  'MORTA desde 28/08/2026: a categoria de custo passou para categorias_insumo.categoria_financeira_id. Nao e mais lida por nenhuma funcao nem por nenhuma tela. Mantida por uma versao para o rollback ser barato; a queda vai em migration separada, depois do deploy assentar.';

-- =====================================================================
-- 2. A redistribuicao canonica do rateio
-- =====================================================================
--
-- Refaz a dimensao CATEGORIA do rateio de um lancamento de OC, a partir da fonte
-- de hoje. O centro de cada linha e o total por centro ficam intactos: 131
-- lancamentos tiveram o centro reclassificado a mao em 14/08, e recalcular o
-- rateio pelos itens desfaria aquilo em silencio.
--
-- Existe como funcao propria porque agora tem DOIS chamadores (a reclassificacao
-- de um insumo e a realinhada em lote). Duas copias da mesma CTE divergiriam na
-- primeira mudanca, e a divergencia aqui e dinheiro em categoria errada.
create or replace function public.fn_realinhar_rateio_do_lancamento(p_lancamento_id uuid)
returns void
language plpgsql
security definer
set search_path to ''
as $function$
declare v_oc uuid;
begin
  select l.origem_id into v_oc
  from public.lancamentos l
  where l.id = p_lancamento_id and l.origem = 'oc' and l.status <> 'cancelado';

  if v_oc is null then
    return;  -- lancamento que nao e de OC, ou cancelado: nada a realinhar
  end if;

  with base as (
    select oi.centro_custo_id,
           ci.categoria_financeira_id as categoria_id,
           round(sum(oi.quantidade * oi.preco_unitario), 2) as bruto
    from public.oc_itens oi
    join public.insumos i on i.id = oi.insumo_id
    join public.categorias_insumo ci on ci.id = i.categoria_id
    where oi.ordem_compra_id = v_oc
      and ci.categoria_financeira_id is not null
    group by oi.centro_custo_id, ci.categoria_financeira_id
  ),
  bruto_centro as (
    select base.centro_custo_id, sum(base.bruto) as total
    from base group by base.centro_custo_id having sum(base.bruto) > 0
  ),
  atual as (
    select r.centro_custo_id, sum(r.valor) as valor_centro
    from public.lancamento_rateios r
    where r.lancamento_id = p_lancamento_id
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
  sobra as (
    select partes.centro_custo_id,
           partes.valor_centro - sum(partes.parte) as resto
    from partes group by partes.centro_custo_id, partes.valor_centro
  ),
  apagadas as (
    delete from public.lancamento_rateios r
    where r.lancamento_id = p_lancamento_id
      and r.centro_custo_id in (select a.centro_custo_id from atual a)
    returning r.id
  )
  insert into public.lancamento_rateios
    (lancamento_id, centro_custo_id, categoria_id, valor, created_by)
  select p_lancamento_id, p.centro_custo_id, p.categoria_id,
         p.parte + case when p.ordem_da_parte = 1 then s.resto else 0 end,
         (select auth.uid())
  from partes p
  join sobra s on s.centro_custo_id = p.centro_custo_id
  where p.parte <> 0 or p.ordem_da_parte = 1;

  update public.lancamentos l
  set categoria_id = (
    select r.categoria_id
    from public.lancamento_rateios r
    where r.lancamento_id = p_lancamento_id and r.categoria_id is not null
    group by r.categoria_id
    order by sum(r.valor) desc, r.categoria_id
    limit 1
  )
  where l.id = p_lancamento_id
    and exists (
      select 1 from public.lancamento_rateios r
      where r.lancamento_id = p_lancamento_id and r.categoria_id is not null
    );
end;
$function$;

revoke all on function public.fn_realinhar_rateio_do_lancamento(uuid) from public, anon;

comment on function public.fn_realinhar_rateio_do_lancamento(uuid) is
  'Refaz a dimensao categoria do rateio de um lancamento de OC a partir da categoria de custo da subcategoria dos insumos. Centro e total por centro ficam intactos. Interna: sem grant.';

-- =====================================================================
-- 3. As tres funcoes que liam insumos.categoria_financeira_id
-- =====================================================================
--
-- Editadas A PARTIR DELAS MESMAS, com ancora conferida. A
-- fn_aprovar_ordem_compra foi sobrescrita quatro vezes no mesmo dia em 20/08 e
-- reescrever pelo repositorio apaga o trabalho de outra frente sem conflito.
do $funcoes$
declare v_def text; v_novo text; v_n int;
begin
  -- fn_aprovar_ordem_compra: 3 joins de insumos, 7 usos do campo
  v_def := pg_get_functiondef('public.fn_aprovar_ordem_compra(uuid)'::regprocedure);
  v_n := (length(v_def) - length(replace(v_def, 'join public.insumos i on i.id = oi.insumo_id','')))
         / length('join public.insumos i on i.id = oi.insumo_id');
  if v_n <> 3 then
    raise exception 'fn_aprovar_ordem_compra: esperava 3 joins de insumos e achei %. Releia a funcao viva.', v_n;
  end if;
  v_novo := replace(v_def,
    'join public.insumos i on i.id = oi.insumo_id',
    E'join public.insumos i on i.id = oi.insumo_id\n    join public.categorias_insumo ci on ci.id = i.categoria_id');
  v_n := (length(v_novo) - length(replace(v_novo, 'i.categoria_financeira_id','')))
         / length('i.categoria_financeira_id');
  if v_n <> 7 then
    raise exception 'fn_aprovar_ordem_compra: esperava 7 usos de i.categoria_financeira_id e achei %.', v_n;
  end if;
  v_novo := replace(v_novo, 'i.categoria_financeira_id', 'ci.categoria_financeira_id');
  -- A mensagem tambem muda de endereco: quem classifica agora e a subcategoria.
  v_novo := replace(v_novo,
    'Ha item sem categoria de custo. Classifique o insumo antes de aprovar',
    'Ha item cuja subcategoria nao tem categoria de custo. Classifique a subcategoria antes de aprovar');
  execute v_novo;

  -- fn_oc_categorias_derivadas
  v_def := pg_get_functiondef('public.fn_oc_categorias_derivadas(uuid)'::regprocedure);
  v_novo := replace(v_def,
    'join public.insumos i on i.id = oi.insumo_id',
    E'join public.insumos i on i.id = oi.insumo_id\n  join public.categorias_insumo ci on ci.id = i.categoria_id');
  v_novo := replace(v_novo, 'i.categoria_financeira_id', 'ci.categoria_financeira_id');
  execute v_novo;

  -- fn_rel_custo_por_grupo: ela JA junta categorias_insumo, com apelido `c`.
  -- Por isso esta troca e diferente das outras duas, e vai com contagem propria.
  v_def := pg_get_functiondef('public.fn_rel_custo_por_grupo(date,date,uuid,uuid)'::regprocedure);
  v_n := (length(v_def) - length(replace(v_def, 'i.categoria_financeira_id','')))
         / length('i.categoria_financeira_id');
  if v_n <> 1 then
    raise exception 'fn_rel_custo_por_grupo: esperava 1 uso de i.categoria_financeira_id e achei %.', v_n;
  end if;
  execute replace(v_def, 'i.categoria_financeira_id', 'c.categoria_financeira_id');

  raise notice 'As tres funcoes passaram a ler categorias_insumo.categoria_financeira_id.';
end $funcoes$;

-- =====================================================================
-- 4. fn_reclassificar_insumo agora troca a SUBCATEGORIA
-- =====================================================================
--
-- Decisao do Tiago: "cada insumo tem a sua subcategoria independente de outros
-- insumos, agora o campo edita as subcategorias do mesmo jeito que fazia com as
-- categorias de custo e altera somente a subcategoria daquele insumo."
--
-- A coluna na OC continua editavel, e o que ela escreve mudou de
-- `insumos.categoria_financeira_id` para `insumos.categoria_id`. O efeito no DRE
-- continua existindo, porque a categoria de custo pendura na subcategoria -- e por
-- isso o aviso da tela continua valendo, agora mostrando os DOIS de/para.
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
  v_ativa boolean;
  v_nome_sub text;
  v_categoria_custo uuid;
  v_natureza text;
  v_ordens int := 0;
  v_aprovadas int := 0;
  v_lancamentos int := 0;
  v_valor numeric(14,2) := 0;
  v_lanc record;
begin
  if not (public.tem_permissao('compras.ordens', 'editar')
          or public.tem_permissao('cadastros.insumos', 'editar')) then
    raise exception 'Sem permissao para mudar a subcategoria do insumo';
  end if;

  select i.nome, i.categoria_id into v_nome_insumo, v_atual
  from public.insumos i where i.id = p_insumo_id;

  if v_nome_insumo is null then
    raise exception 'Insumo nao encontrado';
  end if;

  -- Trava otimista. Duas pessoas com a mesma ordem aberta reclassificariam o
  -- mesmo insumo, e a segunda desfaria a primeira sem ninguem ficar sabendo.
  if v_atual is distinct from p_categoria_anterior_id then
    raise exception
      'A subcategoria de % mudou enquanto esta ordem estava aberta. Recarregue a ordem e refaca a troca.',
      v_nome_insumo;
  end if;

  if v_atual = p_categoria_id then
    return query select 0, 0, 0, 0::numeric;
    return;
  end if;

  select ci.nome, ci.ativo, ci.categoria_financeira_id
  into v_nome_sub, v_ativa, v_categoria_custo
  from public.categorias_insumo ci where ci.id = p_categoria_id;

  if v_nome_sub is null then
    raise exception 'Subcategoria nao encontrada';
  end if;
  if not v_ativa then
    raise exception 'Subcategoria inativa';
  end if;
  -- Subcategoria sem categoria de custo travaria a aprovacao de toda ordem que
  -- comprasse este insumo. Recusar aqui e dizer o problema no lugar onde ele tem
  -- solucao, em vez de deixar a OC morrer na aprovacao.
  if v_categoria_custo is null then
    raise exception
      'A subcategoria % nao tem categoria de custo definida. Classifique ela em Cadastros antes de mover insumo para ela.',
      v_nome_sub;
  end if;

  select coalesce(cf.natureza, 'operacional') into v_natureza
  from public.categorias_financeiras cf where cf.id = v_categoria_custo;
  -- Natureza `movimentacao` sai do saldo bancario (fn_rel_posicao_bancaria a
  -- exclui). Compra de material nao pode sair do saldo por classificacao.
  if v_natureza = 'movimentacao' then
    raise exception
      'A subcategoria % aponta para categoria de natureza movimentacao, que sai do saldo bancario e do resultado',
      v_nome_sub;
  end if;

  update public.insumos i
  set categoria_id = p_categoria_id, updated_at = now()
  where i.id = p_insumo_id;
  -- A trigger trg_insumo_subcategoria_nas_ordens refaz categoria_ids e
  -- categoria_id das ordens deste insumo neste ponto.

  select count(*), count(*) filter (where oc.status = 'aprovado')
  into v_ordens, v_aprovadas
  from public.ordens_compra oc
  where exists (
    select 1 from public.oc_itens oi
    where oi.ordem_compra_id = oc.id and oi.insumo_id = p_insumo_id
  );

  for v_lanc in
    select l.id, l.valor
    from public.lancamentos l
    where l.origem = 'oc'
      and l.status <> 'cancelado'
      and exists (
        select 1 from public.oc_itens oi
        where oi.ordem_compra_id = l.origem_id
          and oi.insumo_id = p_insumo_id
      )
  loop
    perform public.fn_realinhar_rateio_do_lancamento(v_lanc.id);
    v_lancamentos := v_lancamentos + 1;
    v_valor := v_valor + coalesce(v_lanc.valor, 0);
  end loop;

  return query select v_ordens, v_aprovadas, v_lancamentos, v_valor;
end;
$function$;

revoke all on function public.fn_reclassificar_insumo(uuid, uuid, uuid) from public, anon;
grant execute on function public.fn_reclassificar_insumo(uuid, uuid, uuid) to authenticated;

comment on function public.fn_reclassificar_insumo(uuid, uuid, uuid) is
  'Muda insumos.categoria_id (a SUBCATEGORIA) de UM insumo e realinha a dimensao categoria do rateio dos lancamentos das OCs que o compraram. Desde 28/08/2026 a categoria de custo vem da subcategoria, entao trocar de subcategoria e o que reclassifica o DRE. Recusa subcategoria inativa, sem categoria de custo, de natureza movimentacao, e recusa quando a subcategoria mudou desde que a tela carregou.';

-- =====================================================================
-- 5. As triggers do derivado
-- =====================================================================

drop trigger if exists trg_insumo_categoria_nas_ordens on public.insumos;

create or replace function public.fn_trg_insumo_subcategoria_nas_ordens()
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

revoke all on function public.fn_trg_insumo_subcategoria_nas_ordens() from public, anon;

drop trigger if exists trg_insumo_subcategoria_nas_ordens on public.insumos;
create trigger trg_insumo_subcategoria_nas_ordens
  after update of categoria_id on public.insumos
  for each row
  when (old.categoria_id is distinct from new.categoria_id)
  execute function public.fn_trg_insumo_subcategoria_nas_ordens();

-- Mudar a categoria de custo DE UMA SUBCATEGORIA tambem move o derivado de toda
-- ordem que comprou insumo dela. Sem isto, configurar a subcategoria em Cadastros
-- deixaria as ordens mostrando a categoria velha.
create or replace function public.fn_trg_subcategoria_categoria_nas_ordens()
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
    join public.insumos i on i.id = oi.insumo_id
    where i.categoria_id = new.id
  loop
    perform public.fn_oc_categorias_derivadas(v_oc);
  end loop;
  return new;
end;
$function$;

revoke all on function public.fn_trg_subcategoria_categoria_nas_ordens() from public, anon;

drop trigger if exists trg_subcategoria_categoria_nas_ordens on public.categorias_insumo;
create trigger trg_subcategoria_categoria_nas_ordens
  after update of categoria_financeira_id on public.categorias_insumo
  for each row
  when (old.categoria_financeira_id is distinct from new.categoria_financeira_id)
  execute function public.fn_trg_subcategoria_categoria_nas_ordens();

-- =====================================================================
-- 6. O gatilho duplicado sai
-- =====================================================================
--
-- `trg_categoria_da_oc_pelos_itens` (de outra frente) mantinha
-- `ordens_compra.categoria_id` pela predominante dos itens -- o MESMO trabalho do
-- trg_oc_categorias_derivadas, na MESMA tabela, no mesmo evento. Dois gatilhos
-- escrevendo a mesma coluna: o resultado passou a depender da ordem alfabetica
-- dos nomes, e o antigo ainda lia insumos.categoria_financeira_id, que morreu.
-- O meu faz estritamente mais (mantem tambem categoria_ids), entao o antigo sai.
drop trigger if exists trg_categoria_da_oc_pelos_itens on public.oc_itens;

comment on function public.fn_categoria_da_oc_pelos_itens() is
  'ORFA desde 28/08/2026: o gatilho dela foi removido por duplicar trg_oc_categorias_derivadas, e o corpo ainda le insumos.categoria_financeira_id, que deixou de ser a fonte. Mantida sem gatilho para o rollback ser barato.';

notify pgrst, 'reload schema';
