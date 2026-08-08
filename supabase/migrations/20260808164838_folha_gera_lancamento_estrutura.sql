-- Aplicada em produção pelo MCP (apply_migration) em 2026-08-08, versão
-- 20260808164838 no ledger. Este arquivo é o registro versionado do que foi
-- aplicado; NÃO rode `supabase db push` neste projeto (ver docs/decisoes.md).
--
-- Task 4 do Bloco 8a, parte 1 de 4: a estrutura que a aprovação vai preencher.
-- Nada de função de dinheiro aqui — só origens, vínculo, tabela de guia e o
-- vencimento em SQL.

-- Origens novas. Três, e não uma, porque o origem_id de cada uma aponta para um
-- tipo de registro diferente: item da folha, guia da folha, adiantamento.
alter table public.lancamentos drop constraint lancamentos_origem_check;
alter table public.lancamentos add constraint lancamentos_origem_check
  check (origem in ('oc', 'manual', 'diaria', 'folha', 'folha_guia', 'adiantamento'));

-- Vínculo de volta no item, espelhando rh_diarias.lancamento_id (FK simples, sem
-- ON DELETE: apagar o lançamento exige limpar o vínculo antes, e a Task 5 faz isso).
alter table public.folha_itens
  add column if not exists lancamento_id uuid references public.lancamentos(id);

-- Índice na FK nova: a Task 5 varre por lancamento_id e o advisor de performance
-- cobra índice em toda FK.
create index if not exists idx_folha_itens_lancamento_id
  on public.folha_itens (lancamento_id);

-- Guias geradas por folha. Escrita só pela definer, leitura por rh.folha:
-- espelha folha_item_encargos.
create table if not exists public.folha_guias (
  id uuid primary key default gen_random_uuid(),
  folha_id uuid not null references public.folhas(id) on delete cascade,
  grupo text not null check (length(btrim(grupo)) between 1 and 60),
  valor numeric(14,2) not null check (valor >= 0),
  lancamento_id uuid references public.lancamentos(id),
  created_at timestamptz not null default now(),
  unique (folha_id, grupo)
);

-- unique (folha_id, grupo) já indexa folha_id (coluna à esquerda); falta a outra FK.
create index if not exists idx_folha_guias_lancamento_id
  on public.folha_guias (lancamento_id);

alter table public.folha_guias enable row level security;

create policy folha_guias_select on public.folha_guias
  for select to authenticated
  using ((select public.tem_permissao('rh.folha', 'ver')));

-- Sem policy de insert/update/delete: escrita só pela função definer.
grant select on public.folha_guias to authenticated;

-- Regra de ouro 6: tabela transacional tem trilha. Espelha
-- trg_audit_folha_item_encargos (20260807195301).
create trigger trg_audit_folha_guias
after insert or update or delete on public.folha_guias
for each row execute function public.fn_audit();

-- Grupo em branco não pode contar como configurado: a fn_aprovar_folha decide
-- pelo `is not null`, e '' passaria por configurado gerando uma guia sem nome.
-- Espelha o check que folha_encargos.grupo_recolhimento já tem (20260808162405);
-- as colunas dos retidos nasceram sem ele.
alter table public.folha_parametros
  add constraint folha_parametros_grupo_recolhimento_inss_check
    check (grupo_recolhimento_inss is null
           or length(btrim(grupo_recolhimento_inss)) between 1 and 60),
  add constraint folha_parametros_grupo_recolhimento_irrf_check
    check (grupo_recolhimento_irrf is null
           or length(btrim(grupo_recolhimento_irrf)) between 1 and 60);

-- Vencimento em SQL, espelho de vencimento.ts. least() resolve o dia que não
-- existe no mês: o primeiro termo estoura para o mês seguinte e o segundo é o
-- último dia do mês de pagamento.
create or replace function public.fn_vencimento_folha(p_competencia date, p_dia smallint)
returns date
language sql
immutable
set search_path to ''
as $function$
  select case when p_dia is null then null else least(
    (date_trunc('month', p_competencia) + interval '1 month')::date + (p_dia - 1),
    (date_trunc('month', p_competencia) + interval '2 month' - interval '1 day')::date
  ) end;
$function$;

do $$
declare v_anon_dml integer;
begin
  -- Fail-closed: anon não pode ter nenhum privilégio em folha_guias, e
  -- authenticated não pode ter DML (escrita é só pela definer).
  select count(*) into v_anon_dml
  from information_schema.role_table_grants
  where table_schema = 'public' and table_name = 'folha_guias'
    and (grantee = 'anon'
      or (grantee = 'authenticated' and privilege_type in ('INSERT','UPDATE','DELETE')));
  if v_anon_dml > 0 then
    raise exception 'folha_guias tem % grant indevido (anon com acesso ou authenticated com DML)', v_anon_dml;
  end if;

  -- Fail-closed: RLS ligada e a policy de leitura existe.
  if not exists (
    select 1 from pg_class c join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public' and c.relname = 'folha_guias' and c.relrowsecurity
  ) then
    raise exception 'folha_guias sem row level security';
  end if;
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'folha_guias' and policyname = 'folha_guias_select'
  ) then
    raise exception 'folha_guias sem policy de select';
  end if;
end $$;

-- Rollback:
--   drop trigger if exists trg_audit_folha_guias on public.folha_guias;
--   drop table if exists public.folha_guias;
--   drop index if exists public.idx_folha_itens_lancamento_id;
--   alter table public.folha_itens drop column if exists lancamento_id;
--   alter table public.folha_parametros
--     drop constraint if exists folha_parametros_grupo_recolhimento_inss_check,
--     drop constraint if exists folha_parametros_grupo_recolhimento_irrf_check;
--   drop function if exists public.fn_vencimento_folha(date, smallint);
--   alter table public.lancamentos drop constraint lancamentos_origem_check;
--   alter table public.lancamentos add constraint lancamentos_origem_check
--     check (origem in ('oc', 'manual', 'diaria'));
