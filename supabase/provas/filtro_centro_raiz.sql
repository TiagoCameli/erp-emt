-- Prova do filtro de centro de custo dos relatórios: o seletor oferece só RAIZ.
--
-- Só leitura: não cria massa e não apaga nada. Pode rodar quantas vezes quiser.
--
-- O que está sendo defendido: TODO relatório de centro agrupa na raiz, então
-- oferecer etapa no seletor mente na tela. Antes desta mudança o seletor
-- mostrava 73 opções (12 raízes + 61 equipamentos) e escolher um equipamento
-- devolvia uma linha com o nome da raiz.
--
-- As LINHAS DE CONTROLE são o que dá valor ao resto: o caso 2 exige que a lista
-- de raízes NÃO perca dinheiro, e os casos 3 e 4 exigem que os números MUDEM --
-- sem eles, uma função que ignorasse a hierarquia passaria em tudo.
--
-- Cobre:
--   1. a lista encolhe: 12 raízes ativas contra 73 centros ativos
--   2. CONTROLE: escolher as 12 raízes dá o MESMO total que não filtrar nada
--   3. CONTROLE: escolher UMA etapa devolve linha com o nome da RAIZ
--   4. CONTROLE: a subárvore da raiz é MAIOR que o nó raiz sozinho
--   5. nenhum centro inativo tem rateio (filtrar por `ativo` não esconde dinheiro)
--   6. a vida do centro não começa depois do primeiro mês de uma etapa dele

create temp table if not exists prova_raiz (
  ordem int generated always as identity,
  caso text, esperado text, obtido text, passou boolean
);
truncate prova_raiz;

do $prova$
declare
  v_meses date[];
  v_ativos int; v_raizes int; v_etapas int;
  v_todos numeric; v_so_raizes numeric;
  v_raiz uuid; v_etapa uuid; v_nome_etapa text; v_nome_linha text;
  v_subarvore numeric; v_no_raiz numeric;
  v_inativo numeric;
  v_vida date; v_primeira_etapa date;
begin
  select array_agg(mes) into v_meses from public.fn_rel_meses_competencia();

  select count(*) filter (where ativo),
         count(*) filter (where ativo and pai_id is null),
         count(*) filter (where ativo and pai_id is not null)
    into v_ativos, v_raizes, v_etapas
  from public.centros_custo;

  insert into prova_raiz(caso, esperado, obtido, passou) values
   ('1. a lista do seletor encolhe para as raizes',
    format('%s raizes de %s centros ativos', v_raizes, v_ativos),
    format('%s raizes + %s etapas', v_raizes, v_etapas),
    v_raizes + v_etapas = v_ativos and v_etapas > 0 and v_raizes < v_ativos);

  select coalesce(sum(total),0) into v_todos
  from public.fn_rel_custo_receita(v_meses) where tipo='a_pagar';

  select coalesce(sum(total),0) into v_so_raizes
  from public.fn_rel_custo_receita(
         v_meses,
         (select array_agg(id) from public.centros_custo where pai_id is null and ativo))
  where tipo='a_pagar';

  insert into prova_raiz(caso, esperado, obtido, passou) values
   ('2. CONTROLE: as raizes ativas NAO escondem dinheiro',
    v_todos::text, v_so_raizes::text, v_so_raizes = v_todos and v_todos > 0);

  select id into v_raiz from public.centros_custo where tipo='manutencao' and pai_id is null;
  select c.id, c.nome into v_etapa, v_nome_etapa
  from public.centros_custo c
  where c.pai_id = v_raiz
    and exists (select 1 from public.lancamento_rateios r where r.centro_custo_id = c.id)
  order by c.nome limit 1;

  select nome into v_nome_linha
  from public.fn_rel_custo_receita(v_meses, array[v_etapa])
  where tipo='a_pagar' limit 1;

  insert into prova_raiz(caso, esperado, obtido, passou) values
   ('3. CONTROLE: escolher a etapa devolve o nome da RAIZ (por isso etapa nao vai no seletor)',
    format('linha chamada %L', (select nome from public.centros_custo where id = v_raiz)),
    format('escolhi %L e voltou %L', v_nome_etapa, v_nome_linha),
    v_nome_linha = (select nome from public.centros_custo where id = v_raiz)
      and v_nome_linha <> v_nome_etapa);

  select coalesce(sum(total),0) into v_subarvore
  from public.fn_rel_custo_centro_serie(array[v_raiz]);

  select coalesce(sum(r.valor),0) into v_no_raiz
  from public.lancamento_rateios r
  join public.lancamentos l on l.id = r.lancamento_id
  where l.status <> 'cancelado' and r.centro_custo_id = v_raiz;

  insert into prova_raiz(caso, esperado, obtido, passou) values
   ('4. CONTROLE: a subarvore da raiz e MAIOR que o no raiz sozinho',
    format('mais que %s (o no sozinho)', v_no_raiz),
    v_subarvore::text,
    v_subarvore > v_no_raiz);

  select coalesce(sum(r.valor),0) into v_inativo
  from public.lancamento_rateios r
  join public.lancamentos l on l.id = r.lancamento_id
  join public.centros_custo c on c.id = r.centro_custo_id
  where l.status <> 'cancelado' and not c.ativo;

  insert into prova_raiz(caso, esperado, obtido, passou) values
   ('5. nenhum centro inativo tem rateio (filtrar ativo nao esconde dinheiro)',
    '0', v_inativo::text, v_inativo = 0);

  select min(primeiro_mes) into v_vida from public.fn_rel_custo_centro_vida(array[v_raiz]);
  select min(l.mes_competencia) into v_primeira_etapa
  from public.lancamento_rateios r
  join public.lancamentos l on l.id = r.lancamento_id
  join public.centros_custo c on c.id = r.centro_custo_id
  where l.status <> 'cancelado' and c.pai_id = v_raiz;

  insert into prova_raiz(caso, esperado, obtido, passou) values
   ('6. a vida do centro nao comeca depois do primeiro mes de uma etapa dele',
    format('menor ou igual a %s', v_primeira_etapa), v_vida::text,
    v_vida <= v_primeira_etapa);
end $prova$;

select ordem, caso, esperado, obtido, passou from prova_raiz order by ordem;

-- Resultado em 24/08/2026, os seis com passou = true:
--   1. 12 raízes + 61 etapas = 73 ativos (o seletor mostrava os 73)
--   2. CONTROLE: R$ 53.089.404,61 com as raízes e sem filtro nenhum
--   3. CONTROLE: escolhi 'CAMINHÃO BOIADEIRO/MIILHO - L1620' e voltou
--      'Manutenção/Documentação de Equipamentos'
--   4. CONTROLE: subárvore R$ 2.352.419,95 contra R$ 2.322.017,25 do nó raiz
--   5. zero dinheiro em centro inativo
--   6. vida começa em 2025-01, e a primeira etapa só tem custo em 2026-08
