-- Categoria de custo padrão de cada categoria de insumo.
--
-- A categoria de custo mora no insumo (decisão do Tiago em 17/08/2026), mas o
-- formulário e a importação por planilha precisam de um padrão — senão quem cadastra
-- decide de novo o que a subcategoria do insumo já diz, e a importação (que não tem
-- coluna de categoria de custo na planilha) criaria insumo sem ela.
--
-- O padrão EMERGE dos insumos já classificados, em vez de repetir o mapa de 27 linhas
-- num terceiro lugar — ele já vive na migration de semeadura (20260817190100) e em
-- src/modules/cadastros/insumos/mapa-categoria-custo.ts. Consequência boa:
-- reclassificar insumos move o padrão junto, sem migration nova.
--
-- Devolve no máximo uma linha por categoria de insumo. Categoria sem nenhum insumo
-- classificado não aparece — hoje só "A classificar" do grupo Mão de obra, que tem
-- zero insumos. Quem chama trata a ausência como "sem padrão" e pede a escolha.

create or replace function public.fn_padrao_categoria_de_custo()
returns table (categoria_insumo_id uuid, categoria_financeira_id uuid)
language sql
stable
security invoker
set search_path to ''
as $$
  select distinct on (i.categoria_id) i.categoria_id, i.categoria_financeira_id
  from public.insumos i
  where i.categoria_financeira_id is not null
  group by i.categoria_id, i.categoria_financeira_id
  order by i.categoria_id, count(*) desc, i.categoria_financeira_id
$$;

comment on function public.fn_padrao_categoria_de_custo() is
  'Categoria de custo predominante por categoria de insumo. Padrao para o form e a importacao.';

-- SECURITY INVOKER, então a RLS de insumos vale para quem chama. `anon` não recebe
-- nada (regra 1 do CLAUDE.md); só `authenticated` executa.
revoke all on function public.fn_padrao_categoria_de_custo() from public;
revoke all on function public.fn_padrao_categoria_de_custo() from anon;
grant execute on function public.fn_padrao_categoria_de_custo() to authenticated;
