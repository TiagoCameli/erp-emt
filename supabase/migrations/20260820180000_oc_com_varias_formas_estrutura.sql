-- A ordem de compra tambem pode ser paga por VARIAS formas. Bloco 2, parte A:
-- estrutura e backfill, sem mudanca de comportamento.
--
-- Espelha lancamento_formas, com UMA diferenca importante: aqui NAO ha constraint
-- trigger de soma. `ordens_compra.valor_total` e DERIVADO dos itens (trigger
-- trg_recalcular_total_oc), entao uma trava continua estouraria ao editar um
-- item -- num momento em que a pessoa nem estava mexendo em forma. A OC ja trata
-- as parcelas assim: a soma e conferida ao SALVAR e de novo na APROVACAO, que e
-- o portao real. As formas seguem a mesma regra.

create table if not exists public.oc_formas (
  id uuid primary key default gen_random_uuid(),
  ordem_compra_id uuid not null references public.ordens_compra (id) on delete cascade,
  forma_pagamento_id uuid not null references public.formas_pagamento (id),
  valor numeric(14, 2) not null check (valor > 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid,
  constraint uq_oc_formas_forma unique (ordem_compra_id, forma_pagamento_id)
);

comment on table public.oc_formas is
  'Quanto da ordem de compra sai por cada forma de pagamento. Desce para lancamento_formas quando a OC e aprovada.';

create index if not exists idx_oc_formas_ordem on public.oc_formas (ordem_compra_id);
create index if not exists idx_oc_formas_forma on public.oc_formas (forma_pagamento_id);

alter table public.oc_formas enable row level security;

-- Mesma plateia de oc_parcelas: quem ve a ordem ve como ela sera paga.
create policy oc_formas_select on public.oc_formas
  for select
  using ((select public.tem_permissao('compras.ordens', 'ver')));

-- Só SELECT: quem grava e fn_salvar_parcelas_oc, security definer.
grant select on public.oc_formas to authenticated;

create trigger trg_oc_formas_updated_at
  before update on public.oc_formas
  for each row execute function public.fn_set_updated_at();

create trigger trg_audit_oc_formas
  after insert or update or delete on public.oc_formas
  for each row execute function public.fn_audit();

create trigger trg_set_created_by
  before insert on public.oc_formas
  for each row execute function public.fn_set_created_by();

alter table public.oc_parcelas
  add column if not exists oc_forma_id uuid
    references public.oc_formas (id) on delete cascade;

comment on column public.oc_parcelas.oc_forma_id is
  'Por qual forma esta parcela da ordem sai. Nulo = ordem sem formas declaradas.';

create index if not exists idx_oc_parcelas_forma on public.oc_parcelas (oc_forma_id);

-- Backfill: quem tem forma no cabecalho ganha um bloco com o total.
-- Conferido antes: em 36 ordens, nenhuma tem valor_total <= 0 e as parcelas
-- somam o total em TODAS as 19 que tem parcela.
insert into public.oc_formas (ordem_compra_id, forma_pagamento_id, valor, created_by)
select oc.id, oc.forma_pagamento_id, oc.valor_total, oc.created_by
from public.ordens_compra oc
where oc.forma_pagamento_id is not null
  and oc.valor_total > 0
  and not exists (
    select 1 from public.oc_formas f where f.ordem_compra_id = oc.id
  );

update public.oc_parcelas p
set oc_forma_id = f.id
from public.oc_formas f
where f.ordem_compra_id = p.ordem_compra_id
  and p.oc_forma_id is null;
