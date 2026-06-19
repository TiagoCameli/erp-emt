-- =============================================================
-- Fase 2 / Migration 18: created_by automático
-- As Server Actions nem sempre populam created_by no insert, então
-- o solicitante/criador saía nulo (rastreabilidade quebrada: "quem
-- pediu?", "quem criou a OC?"). Trigger BEFORE INSERT preenche
-- created_by = auth.uid() quando vier nulo, em TODA tabela que tem
-- a coluna. À prova do esquecimento de cada action, agora e no futuro.
-- =============================================================

create or replace function public.fn_set_created_by()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.created_by is null then
    new.created_by := auth.uid();
  end if;
  return new;
end $$;

do $$
declare r record;
begin
  for r in
    select table_name
    from information_schema.columns
    where table_schema = 'public' and column_name = 'created_by'
  loop
    execute format('drop trigger if exists trg_set_created_by on public.%I', r.table_name);
    execute format(
      'create trigger trg_set_created_by before insert on public.%I for each row execute function public.fn_set_created_by()',
      r.table_name
    );
  end loop;
end $$;
