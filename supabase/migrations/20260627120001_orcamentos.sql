-- =============================================================
-- Modulo Orcamentos (EAP de obra)
-- orcamentos: cabecalho (1+ por obra). orcamento_itens: arvore
-- Etapa > Subetapa > Item (auto-referenciada, profundidade livre).
-- Origem inicial: importacao do Mais Controle (Orcamento Analitico).
-- =============================================================

-- ---------- Tabela: orcamentos (cabecalho) ----------
create table public.orcamentos (
  id uuid primary key default gen_random_uuid(),
  obra_id uuid not null references public.obras(id),
  numero text,
  descricao text,
  origem text not null default 'manual',
  custo_total numeric(16, 2) not null default 0,
  bdi numeric(7, 4),
  preco_total numeric(16, 2) not null default 0,
  status text not null default 'ativo' check (status in ('rascunho', 'ativo', 'arquivado')),
  observacoes text,
  ativo boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid
);

comment on table public.orcamentos is 'Orcamento (EAP) de uma obra. Cabecalho com totais; itens na arvore orcamento_itens.';

create index idx_orcamentos_obra on public.orcamentos (obra_id);

create trigger trg_orcamentos_updated_at
  before update on public.orcamentos
  for each row execute function public.fn_set_updated_at();
create trigger trg_orcamentos_created_by
  before insert on public.orcamentos
  for each row execute function public.fn_set_created_by();
create trigger trg_audit_orcamentos
  after insert or update or delete on public.orcamentos
  for each row execute function public.fn_audit();

-- ---------- Tabela: orcamento_itens (arvore EAP) ----------
create table public.orcamento_itens (
  id uuid primary key default gen_random_uuid(),
  orcamento_id uuid not null references public.orcamentos(id) on delete cascade,
  parent_id uuid references public.orcamento_itens(id) on delete cascade,
  tipo text not null check (tipo in ('etapa', 'subetapa', 'item')),
  indice text,
  codigo text,
  descricao text not null,
  unidade text,
  quantidade numeric(16, 4),
  custo_unitario numeric(16, 4),
  custo_total numeric(16, 2),
  bdi numeric(7, 4),
  preco_unitario numeric(16, 4),
  preco_total numeric(16, 2),
  ordem integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.orcamento_itens is 'Item da arvore do orcamento: etapa, subetapa ou item (folha). parent_id forma a hierarquia.';

create index idx_orcamento_itens_orcamento on public.orcamento_itens (orcamento_id, ordem);
create index idx_orcamento_itens_parent on public.orcamento_itens (parent_id);

create trigger trg_orcamento_itens_updated_at
  before update on public.orcamento_itens
  for each row execute function public.fn_set_updated_at();
create trigger trg_audit_orcamento_itens
  after insert or update or delete on public.orcamento_itens
  for each row execute function public.fn_audit();

-- ---------- RLS ----------
alter table public.orcamentos enable row level security;
alter table public.orcamento_itens enable row level security;

create policy orcamentos_select on public.orcamentos
  for select to authenticated
  using ((select public.tem_permissao('cadastros.orcamentos', 'ver')));
create policy orcamentos_insert on public.orcamentos
  for insert to authenticated
  with check ((select public.tem_permissao('cadastros.orcamentos', 'criar')));
create policy orcamentos_update on public.orcamentos
  for update to authenticated
  using ((select public.tem_permissao('cadastros.orcamentos', 'editar')))
  with check ((select public.tem_permissao('cadastros.orcamentos', 'editar')));
create policy orcamentos_delete on public.orcamentos
  for delete to authenticated
  using ((select public.tem_permissao('cadastros.orcamentos', 'excluir')));

create policy orcamento_itens_select on public.orcamento_itens
  for select to authenticated
  using ((select public.tem_permissao('cadastros.orcamentos', 'ver')));
create policy orcamento_itens_insert on public.orcamento_itens
  for insert to authenticated
  with check ((select public.tem_permissao('cadastros.orcamentos', 'criar'))
    or (select public.tem_permissao('cadastros.orcamentos', 'editar')));
create policy orcamento_itens_update on public.orcamento_itens
  for update to authenticated
  using ((select public.tem_permissao('cadastros.orcamentos', 'editar')))
  with check ((select public.tem_permissao('cadastros.orcamentos', 'editar')));
create policy orcamento_itens_delete on public.orcamento_itens
  for delete to authenticated
  using ((select public.tem_permissao('cadastros.orcamentos', 'excluir')));

grant select, insert, update, delete on table public.orcamentos to authenticated;
grant select, insert, update, delete on table public.orcamento_itens to authenticated;

-- ---------- Permissoes ----------
create temporary table _orc_pares (recurso text, acao text) on commit drop;
insert into _orc_pares (recurso, acao) values
  ('cadastros.orcamentos', 'ver'),
  ('cadastros.orcamentos', 'criar'),
  ('cadastros.orcamentos', 'editar'),
  ('cadastros.orcamentos', 'excluir');

-- Admin e Engenharia: tudo
insert into public.perfil_permissoes (perfil_id, recurso, acao)
select p.id, o.recurso, o.acao from public.perfis p cross join _orc_pares o
where p.nome in ('Admin', 'Engenharia')
on conflict (perfil_id, recurso, acao) do nothing;

-- Gestor e Financeiro: so ver
insert into public.perfil_permissoes (perfil_id, recurso, acao)
select p.id, o.recurso, 'ver' from public.perfis p cross join _orc_pares o
where p.nome in ('Gestor', 'Financeiro') and o.acao = 'ver'
on conflict (perfil_id, recurso, acao) do nothing;

-- Snapshot inicial dos usuarios Admin
insert into public.usuario_permissoes (usuario_id, recurso, acao, created_by)
select u.id, pp.recurso, pp.acao, u.id
from public.usuarios u
join public.perfis p on p.id = u.perfil_id and p.nome = 'Admin'
join public.perfil_permissoes pp on pp.perfil_id = p.id
where pp.recurso = 'cadastros.orcamentos'
on conflict (usuario_id, recurso, acao) do nothing;
