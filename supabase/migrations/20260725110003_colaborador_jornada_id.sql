-- Bloco 4: adiciona colaboradores.jornada_id (FK -> jornadas) e faz o backfill
-- ligando todo colaborador ainda sem jornada a jornada "Padrão EMT".
--
-- Rollback:
--   drop index if exists public.idx_colaboradores_jornada_id;
--   alter table public.colaboradores drop column if exists jornada_id;

alter table public.colaboradores
  add column jornada_id uuid references public.jornadas(id);

create index if not exists idx_colaboradores_jornada_id
  on public.colaboradores (jornada_id);

-- Backfill: todos os colaboradores sem jornada apontam para a "Padrão EMT".
update public.colaboradores
set jornada_id = (select id from public.jornadas where nome = 'Padrão EMT')
where jornada_id is null;
