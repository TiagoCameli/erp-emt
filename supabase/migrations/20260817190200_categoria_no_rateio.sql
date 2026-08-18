-- Categoria no rateio do lançamento.
--
-- Uma OC que mistura categorias — a 2592 da BRITAS tem brita, rachão e BGS — caía
-- inteira numa categoria só, e o DRE mentia. O rateio passa a carregar categoria
-- além de centro de custo, então um documento do fornecedor continua sendo UM
-- lançamento: essa invariante é o que sustenta a conciliação com o Mais Controle, e
-- quebrá-la já custou R$ 14.190,82 numa carga anterior.
--
-- Nasce NULL e recebe backfill com a categoria do lançamento pai: os 6.041 rateios
-- existentes vêm de lançamentos de categoria única, então pai e rateio concordam por
-- construção. NOT NULL fica para depois, quando a cobertura estiver em 100%.

alter table public.lancamento_rateios
  add column categoria_id uuid references public.categorias_financeiras(id);

comment on column public.lancamento_rateios.categoria_id is
  'Categoria de custo desta fatia. Vem do insumo, pela OC. Antes de 17/08/2026 herdava a do lancamento.';

create index if not exists idx_lancamento_rateios_categoria
  on public.lancamento_rateios (categoria_id);

update public.lancamento_rateios r
set categoria_id = l.categoria_id
from public.lancamentos l
where l.id = r.lancamento_id
  and r.categoria_id is null
  and l.categoria_id is not null;
