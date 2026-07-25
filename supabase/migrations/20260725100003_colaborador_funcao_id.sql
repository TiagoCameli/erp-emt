-- FASE EXPAND do Bloco 3: adiciona colaboradores.funcao_id (FK -> funcoes) e faz
-- o backfill a partir do texto livre colaboradores.funcao. NAO dropa funcao nem
-- cbo — isso e a fase CONTRACT (Task 4), so depois que o codigo migrar.
--
-- Rollback:
--   drop index if exists public.idx_colaboradores_funcao_id;
--   alter table public.colaboradores drop column if exists funcao_id;

alter table public.colaboradores
  add column funcao_id uuid references public.funcoes(id);

create index if not exists idx_colaboradores_funcao_id
  on public.colaboradores (funcao_id);

-- Backfill 1: cria as funcoes distintas ja usadas em texto livre.
insert into public.funcoes (nome)
select distinct btrim(funcao)
from public.colaboradores
where funcao is not null and btrim(funcao) <> ''
on conflict (nome) do nothing;

-- Backfill 2: liga cada colaborador a sua funcao pelo nome (normalizado por btrim).
update public.colaboradores c
set funcao_id = f.id
from public.funcoes f
where f.nome = btrim(c.funcao)
  and c.funcao_id is null
  and c.funcao is not null
  and btrim(c.funcao) <> '';
