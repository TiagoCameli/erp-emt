-- =============================================================
-- Fase 3 / Migration 23: extratos OFX e conciliacao
-- Importa extratos bancarios (OFX dos 3 bancos) e concilia cada
-- transacao com uma parcela do sistema. Dedup por fitid na importacao.
-- Escrita das tabelas e SEMPRE via funcao definer; authenticated so le.
-- =============================================================

-- -------------------------------------------------------------
-- extratos_ofx: um arquivo OFX importado, por conta
-- -------------------------------------------------------------
create table public.extratos_ofx (
  id uuid primary key default gen_random_uuid(),
  conta_bancaria_id uuid not null references public.contas_bancarias(id),
  nome_arquivo text,
  periodo_inicio date,
  periodo_fim date,
  importado_em timestamptz not null default now(),
  created_at timestamptz not null default now(),
  created_by uuid
);

comment on table public.extratos_ofx is 'Extratos bancarios importados via OFX, por conta.';

create index idx_extratos_ofx_conta on public.extratos_ofx (conta_bancaria_id);

create trigger trg_extratos_ofx_created_by
  before insert on public.extratos_ofx
  for each row execute function public.fn_set_created_by();
create trigger trg_audit_extratos_ofx
  after insert or update or delete on public.extratos_ofx
  for each row execute function public.fn_audit();

alter table public.extratos_ofx enable row level security;
create policy extratos_ofx_select on public.extratos_ofx
  for select to authenticated using ((select public.tem_permissao('financeiro.conciliacao', 'ver')));
grant select on table public.extratos_ofx to authenticated;

-- -------------------------------------------------------------
-- extrato_transacoes: as linhas de um extrato; conciliada = vinculada a parcela
-- -------------------------------------------------------------
create table public.extrato_transacoes (
  id uuid primary key default gen_random_uuid(),
  extrato_id uuid not null references public.extratos_ofx(id) on delete cascade,
  conta_bancaria_id uuid not null references public.contas_bancarias(id),
  data_movimento date not null,
  valor numeric(14, 2) not null,
  tipo text not null check (tipo in ('credito', 'debito')),
  memo text,
  fitid text,
  conciliada boolean not null default false,
  parcela_id uuid references public.lancamento_parcelas(id),
  conciliado_por uuid references public.usuarios(id),
  conciliado_em timestamptz,
  created_at timestamptz not null default now(),
  unique (extrato_id, fitid)
);

comment on table public.extrato_transacoes is 'Transacoes de um extrato OFX. Conciliada = vinculada a uma parcela do sistema.';

create index idx_extrato_transacoes_extrato on public.extrato_transacoes (extrato_id);
create index idx_extrato_transacoes_conta on public.extrato_transacoes (conta_bancaria_id);
create index idx_extrato_transacoes_conciliada on public.extrato_transacoes (conciliada);

create trigger trg_audit_extrato_transacoes
  after insert or update or delete on public.extrato_transacoes
  for each row execute function public.fn_audit();

alter table public.extrato_transacoes enable row level security;
create policy extrato_transacoes_select on public.extrato_transacoes
  for select to authenticated using ((select public.tem_permissao('financeiro.conciliacao', 'ver')));
grant select on table public.extrato_transacoes to authenticated;

-- -------------------------------------------------------------
-- Funcoes definer da conciliacao
-- -------------------------------------------------------------
create or replace function public.fn_importar_extrato(p_conta_id uuid, p_nome text, p_periodo_inicio date, p_periodo_fim date, p_transacoes jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare v_extrato uuid; v_t jsonb; v_inseridas int := 0; v_ignoradas int := 0; v_tipo text;
begin
  if not public.tem_permissao('financeiro.conciliacao', 'criar') then raise exception 'Sem permissao para importar extratos'; end if;
  if p_conta_id is null then raise exception 'Informe a conta bancaria'; end if;
  if p_transacoes is null or jsonb_array_length(p_transacoes) = 0 then raise exception 'O arquivo nao tem transacoes'; end if;

  insert into public.extratos_ofx (conta_bancaria_id, nome_arquivo, periodo_inicio, periodo_fim, created_by)
  values (p_conta_id, p_nome, p_periodo_inicio, p_periodo_fim, (select auth.uid())) returning id into v_extrato;

  for v_t in select * from jsonb_array_elements(p_transacoes) loop
    v_tipo := case when (v_t->>'valor')::numeric >= 0 then 'credito' else 'debito' end;
    begin
      insert into public.extrato_transacoes (extrato_id, conta_bancaria_id, data_movimento, valor, tipo, memo, fitid)
      values (v_extrato, p_conta_id, (v_t->>'data')::date, (v_t->>'valor')::numeric, v_tipo, v_t->>'memo', v_t->>'fitid');
      v_inseridas := v_inseridas + 1;
    exception when unique_violation then
      v_ignoradas := v_ignoradas + 1;
    end;
  end loop;

  return jsonb_build_object('extrato_id', v_extrato, 'inseridas', v_inseridas, 'ignoradas', v_ignoradas);
end $$;

create or replace function public.fn_conciliar_transacao(p_transacao_id uuid, p_parcela_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not public.tem_permissao('financeiro.conciliacao', 'editar') then raise exception 'Sem permissao para conciliar'; end if;
  if not exists (select 1 from public.lancamento_parcelas where id = p_parcela_id) then raise exception 'Parcela nao encontrada'; end if;
  update public.extrato_transacoes
  set conciliada = true, parcela_id = p_parcela_id, conciliado_por = (select auth.uid()), conciliado_em = now()
  where id = p_transacao_id;
end $$;

create or replace function public.fn_desconciliar_transacao(p_transacao_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not public.tem_permissao('financeiro.conciliacao', 'editar') then raise exception 'Sem permissao para conciliar'; end if;
  update public.extrato_transacoes
  set conciliada = false, parcela_id = null, conciliado_por = null, conciliado_em = null
  where id = p_transacao_id;
end $$;
