-- Medição de Contratos, Fase 1b: o cálculo. Nada aqui grava valor: tudo sai de view (D6, D7).
-- As views são security_invoker, então a RLS por contrato da Fase 1a vale nelas também.
--
-- regra_arredondamento (spec 6.2), configuração do contrato:
--   item_por_medicao    valor do item na medição = round(qtd x preço, 2); acumulado = soma
--   item_por_acumulado  valor na medição N = round(acum_N x preço, 2) - round(acum_N-1 x preço, 2),
--                       com o preço da versão da medição N
--   sem_arredondar      qtd x preço exato; só o total exibido é arredondado
-- Grupo e total: round(soma, 2). Nas regras por item a soma já tem 2 casas e o round não muda nada;
-- em sem_arredondar é ele que arredonda, e é daí que pode sair um centavo entre a soma dos grupos
-- e o total, como no Lote 09.
-- Regra nula: valor nulo. O contrato não tem valor enquanto a regra não for descoberta.

create or replace function public.fn_mc_valor(p_qtd numeric, p_preco numeric, p_regra text)
returns numeric language sql immutable set search_path to '' as $$
  select case p_regra
    when 'sem_arredondar' then p_qtd * p_preco
    when 'item_por_medicao' then round(p_qtd * p_preco, 2)
    when 'item_por_acumulado' then round(p_qtd * p_preco, 2)
  end;
$$;

create or replace view public.mc_v_planilha_linhas with (security_invoker = true) as
with recursive arvore as (
  select pi.id, pi.id as raiz_id, 1 as nivel
  from public.mc_planilha_itens pi where pi.pai_id is null
  union all
  select f.id, a.raiz_id, a.nivel + 1
  from public.mc_planilha_itens f join arvore a on f.pai_id = a.id
)
select pi.id, pi.versao_id, pi.contrato_id, pi.item_id, pi.ordem, pi.codigo, pi.pai_id, pi.descricao, pi.unidade,
       pi.tipo, pi.preco_unitario, pi.quantidade_prevista, a.nivel, a.raiz_id as grupo_id,
       public.fn_mc_valor(pi.quantidade_prevista, pi.preco_unitario, c.regra_arredondamento) as valor_previsto
from public.mc_planilha_itens pi
join arvore a on a.id = pi.id
join public.mc_contratos c on c.id = pi.contrato_id;

-- Fecho transitivo: cada linha é ancestral de si mesma e de toda a subárvore.
create or replace view public.mc_v_planilha_subarvore with (security_invoker = true) as
with recursive s as (
  select id as ancestral_id, id as linha_id from public.mc_planilha_itens
  union all
  select s.ancestral_id, f.id from s join public.mc_planilha_itens f on f.pai_id = s.linha_id
)
select ancestral_id, linha_id from s;

-- Total de uma linha = soma de TODAS as linhas com preço da subárvore, cada uma uma vez.
create or replace view public.mc_v_planilha_totais with (security_invoker = true) as
select s.ancestral_id as id, l.versao_id, round(sum(l.valor_previsto), 2) as total_previsto
from public.mc_v_planilha_subarvore s
join public.mc_v_planilha_linhas l on l.id = s.linha_id
where l.tipo = 'servico'
group by s.ancestral_id, l.versao_id;

create or replace view public.mc_v_versao_totais with (security_invoker = true) as
select l.versao_id, l.contrato_id, round(sum(l.valor_previsto), 2) as total_previsto
from public.mc_v_planilha_linhas l
where l.tipo = 'servico'
group by l.versao_id, l.contrato_id;

-- Quantidade medida = soma dos lançamentos ativos + soma dos ajustes da medição.
create or replace view public.mc_v_medicao_qtd with (security_invoker = true) as
select x.medicao_id, x.item_id, sum(x.lancado) as qtd_lancada, sum(x.ajustado) as qtd_ajustada,
       sum(x.lancado) + sum(x.ajustado) as qtd_medida
from (
  select medicao_id, item_id, quantidade as lancado, 0::numeric as ajustado
  from public.mc_lancamentos where excluido_em is null
  union all
  select medicao_id, item_id, 0::numeric, quantidade from public.mc_ajustes
) x
group by x.medicao_id, x.item_id;

-- Revisão aprovada vigente de cada medição: a de maior número entre as aprovadas.
create or replace view public.mc_v_medicao_revisao_aprovada with (security_invoker = true) as
select distinct on (r.medicao_id) r.medicao_id, r.id as revisao_id, r.numero
from public.mc_medicao_revisoes r
where r.status = 'aprovada'
order by r.medicao_id, r.numero desc;

create or replace view public.mc_v_medicao_itens with (security_invoker = true) as
with chaves as (
  select medicao_id, item_id from public.mc_v_medicao_qtd
  union
  select r.medicao_id, ai.item_id from public.mc_aprovacoes_item ai join public.mc_medicao_revisoes r on r.id = ai.revisao_id
), base as (
  select m.id as medicao_id, m.contrato_id, m.numero, m.status, m.versao_id, k.item_id,
         coalesce(q.qtd_medida, 0) as qtd_medida,
         -- Aprovada: o que a revisão vigente aprovou; item sem linha é zero (campo vazio vira zero).
         case when m.status = 'aprovada' then coalesce(ai.quantidade_aprovada, 0) end as qtd_aprovada
  from chaves k
  join public.mc_medicoes m on m.id = k.medicao_id
  left join public.mc_v_medicao_qtd q on q.medicao_id = k.medicao_id and q.item_id = k.item_id
  left join public.mc_v_medicao_revisao_aprovada ra on ra.medicao_id = m.id
  left join public.mc_aprovacoes_item ai on ai.revisao_id = ra.revisao_id and ai.item_id = k.item_id
), efetiva as (
  select b.*, case when b.status = 'aprovada' then b.qtd_aprovada else b.qtd_medida end as qtd_efetiva from base b
), acumulada as (
  select e.*, sum(e.qtd_efetiva) over (partition by e.contrato_id, e.item_id order by e.numero) as qtd_acumulada from efetiva e
)
select a.medicao_id, a.contrato_id, a.numero, a.status, a.item_id, pi.id as planilha_item_id, pi.preco_unitario,
       a.qtd_medida, a.qtd_aprovada, a.qtd_efetiva, a.qtd_medida - a.qtd_aprovada as glosa, a.qtd_acumulada,
       case c.regra_arredondamento
         when 'item_por_acumulado' then
           round(a.qtd_acumulada * pi.preco_unitario, 2) - round((a.qtd_acumulada - a.qtd_efetiva) * pi.preco_unitario, 2)
         else public.fn_mc_valor(a.qtd_efetiva, pi.preco_unitario, c.regra_arredondamento)
       end as valor_medicao
from acumulada a
join public.mc_contratos c on c.id = a.contrato_id
left join public.mc_planilha_itens pi on pi.versao_id = a.versao_id and pi.item_id = a.item_id;

create or replace view public.mc_v_medicao_totais with (security_invoker = true) as
select m.id as medicao_id, m.contrato_id, round(coalesce(sum(i.valor_medicao), 0), 2) as valor
from public.mc_medicoes m
left join public.mc_v_medicao_itens i on i.medicao_id = m.id
group by m.id, m.contrato_id;

create or replace view public.mc_v_item_acumulado with (security_invoker = true) as
select contrato_id, item_id, sum(qtd_efetiva) as qtd_acumulada, sum(valor_medicao) as valor_acumulado_exato,
       round(sum(valor_medicao), 2) as valor_acumulado
from public.mc_v_medicao_itens
group by contrato_id, item_id;

do $grants$
declare v text;
begin
  foreach v in array array['mc_v_planilha_linhas', 'mc_v_planilha_subarvore', 'mc_v_planilha_totais', 'mc_v_versao_totais',
                           'mc_v_medicao_qtd', 'mc_v_medicao_revisao_aprovada', 'mc_v_medicao_itens',
                           'mc_v_medicao_totais', 'mc_v_item_acumulado'] loop
    execute format('revoke all on public.%I from anon, authenticated', v);
    execute format('grant select on public.%I to authenticated', v);
  end loop;
end $grants$;
revoke all on function public.fn_mc_valor(numeric, numeric, text) from public, anon;
grant execute on function public.fn_mc_valor(numeric, numeric, text) to authenticated;
