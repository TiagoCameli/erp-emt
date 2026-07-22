-- condicao_parcelas: parcelas de uma condicao de pagamento (dias + % do total).
-- Migration aditiva (não altera tabela/coluna existente).
-- Escrita só via a função salvar_condicao_parcelas (security definer); sem
-- policy nem grant de INSERT/UPDATE/DELETE direto para authenticated
-- (rule 1 do projeto: sem policy = sem grant), no mesmo padrão de
-- lancamento_parcelas.
--
-- Rollback:
--   drop function if exists public.salvar_condicao_parcelas(uuid, jsonb);
--   drop table if exists public.condicao_parcelas;

create table public.condicao_parcelas (
  id uuid primary key default gen_random_uuid(),
  condicao_id uuid not null references public.condicoes_pagamento (id) on delete cascade,
  numero int not null check (numero >= 1),
  dias_offset int not null check (dias_offset >= 0),
  percentual numeric(5,2) not null check (percentual > 0 and percentual <= 100),
  created_at timestamptz not null default now(),
  unique (condicao_id, numero)
);

-- Índice de cobertura da FK (advisor unindexed_foreign_keys), padrão do projeto.
create index idx_condicao_parcelas_condicao on public.condicao_parcelas (condicao_id);

alter table public.condicao_parcelas enable row level security;

-- SELECT: quem vê o cadastro de condições de pagamento vê as parcelas.
-- tem_permissao() envolvida em (select ...) para evitar reavaliação por
-- linha (advisor auth_rls_initplan), como em todas as policies do projeto.
create policy condicao_parcelas_select on public.condicao_parcelas
  for select to authenticated
  using ((select public.tem_permissao('cadastros.condicoes-pagamento', 'ver')));

-- INSERT/UPDATE/DELETE só via a função salvar_condicao_parcelas (security
-- definer) abaixo; sem policy de escrita e sem grant de escrita direto.
grant select on public.condicao_parcelas to authenticated;

-- Auditoria: mesmo trigger/função padrão do projeto (fn_audit, ver
-- 20260611230002_auditoria.sql).
create trigger trg_audit_condicao_parcelas
  after insert or update or delete on public.condicao_parcelas
  for each row execute function public.fn_audit();

-- Salva as parcelas de uma condição numa transação (delete + insert),
-- validando que a soma dos percentuais fecha em 100.
create or replace function public.salvar_condicao_parcelas(
  p_condicao_id uuid, p_parcelas jsonb
) returns void
language plpgsql
security definer
set search_path to ''
as $$
declare
  v_soma numeric(6,2);
begin
  if not public.tem_permissao('cadastros.condicoes-pagamento', 'editar') then
    raise exception 'Sem permissao para editar condicoes de pagamento';
  end if;

  if p_condicao_id is null then
    raise exception 'Condicao de pagamento invalida';
  end if;
  if not exists (select 1 from public.condicoes_pagamento where id = p_condicao_id) then
    raise exception 'Condicao de pagamento nao encontrada';
  end if;

  select coalesce(sum((p ->> 'percentual')::numeric), 0) into v_soma
  from jsonb_array_elements(coalesce(p_parcelas, '[]'::jsonb)) p;

  if round(v_soma, 2) <> 100.00 then
    raise exception 'A soma dos percentuais das parcelas deve ser 100 (recebido %)', v_soma;
  end if;

  delete from public.condicao_parcelas where condicao_id = p_condicao_id;

  insert into public.condicao_parcelas (condicao_id, numero, dias_offset, percentual)
  select
    p_condicao_id,
    row_number() over (order by (p ->> 'dias_offset')::int),
    (p ->> 'dias_offset')::int,
    (p ->> 'percentual')::numeric
  from jsonb_array_elements(p_parcelas) p;
end;
$$;

revoke all on function public.salvar_condicao_parcelas(uuid, jsonb) from public, anon;
grant execute on function public.salvar_condicao_parcelas(uuid, jsonb) to authenticated;
