-- Execução de Obras, Fase 1a: estrutura.
-- Desenho: docs/superpowers/specs/2026-10-09-execucao-obras-design.md (seções 6 e 7).
-- Só cria objeto novo, com prefixo ex_. Lê obras e usuarios; não escreve em nenhum outro módulo.
-- Leitura: quem vê o módulo E está na lista da obra (Q1). Escrita: só pelas RPCs fn_ex_*.

-- =====================================================================
-- 1. Obra (configuração do módulo, 1:1 com obras) e acesso
-- =====================================================================

create table public.ex_calendarios (
  id uuid primary key default gen_random_uuid(),
  nome text not null check (char_length(btrim(nome)) between 2 and 120),
  modelo boolean not null default false,
  padrao_empresa boolean not null default false,
  pai_id uuid references public.ex_calendarios(id),
  horas_seg numeric(4,2) not null default 0 check (horas_seg between 0 and 24),
  horas_ter numeric(4,2) not null default 0 check (horas_ter between 0 and 24),
  horas_qua numeric(4,2) not null default 0 check (horas_qua between 0 and 24),
  horas_qui numeric(4,2) not null default 0 check (horas_qui between 0 and 24),
  horas_sex numeric(4,2) not null default 0 check (horas_sex between 0 and 24),
  horas_sab numeric(4,2) not null default 0 check (horas_sab between 0 and 24),
  horas_dom numeric(4,2) not null default 0 check (horas_dom between 0 and 24),
  feriados_abrangencia text[] not null default array['nacional', 'AC']
    check (feriados_abrangencia <@ array['nacional', 'AC', 'municipal']),
  municipio text,
  chuvoso_inicio_mes smallint check (chuvoso_inicio_mes between 1 and 12),
  chuvoso_fim_mes smallint check (chuvoso_fim_mes between 1 and 12),
  observacoes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references public.usuarios(id) default auth.uid(),
  excluido_em timestamptz,
  excluido_por uuid references public.usuarios(id),
  motivo_exclusao text,
  check (horas_seg + horas_ter + horas_qua + horas_qui + horas_sex + horas_sab + horas_dom > 0),
  check ((chuvoso_inicio_mes is null) = (chuvoso_fim_mes is null)),
  check (not padrao_empresa or modelo),
  check (pai_id is null or pai_id <> id)
);
create unique index ex_calendarios_padrao_uk on public.ex_calendarios (padrao_empresa) where padrao_empresa and excluido_em is null;
create index ex_calendarios_pai_ix on public.ex_calendarios (pai_id);

create table public.ex_feriados (
  id uuid primary key default gen_random_uuid(),
  data date not null,
  nome text not null check (btrim(nome) <> ''),
  abrangencia text not null check (abrangencia in ('nacional', 'AC', 'municipal')),
  municipio text,
  created_at timestamptz not null default now(),
  created_by uuid references public.usuarios(id) default auth.uid(),
  check ((abrangencia = 'municipal') = (municipio is not null))
);
create unique index ex_feriados_uk on public.ex_feriados (data, abrangencia, coalesce(municipio, ''));

create table public.ex_calendario_excecoes (
  id uuid primary key default gen_random_uuid(),
  calendario_id uuid not null references public.ex_calendarios(id),
  data date not null,
  horas numeric(4,2) not null check (horas between 0 and 24),
  tipo text not null check (tipo in ('feriado', 'paralisacao', 'extra')),
  descricao text not null check (btrim(descricao) <> ''),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references public.usuarios(id) default auth.uid(),
  unique (calendario_id, data)
);

create table public.ex_obras (
  obra_id uuid primary key references public.obras(id),
  tipo_obra text not null check (tipo_obra in ('edificacao', 'rodovia', 'pequena')),
  calendario_id uuid references public.ex_calendarios(id),
  km_inicial numeric(10,3),
  km_final numeric(10,3),
  metros_por_estaca numeric(8,3) not null default 20 check (metros_por_estaca > 0),
  ppc_limite numeric(5,2) not null default 80 check (ppc_limite between 0 and 100),
  observacoes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references public.usuarios(id) default auth.uid(),
  check (tipo_obra = 'rodovia' or (km_inicial is null and km_final is null))
);
create index ex_obras_calendario_ix on public.ex_obras (calendario_id);

create table public.ex_obra_usuarios (
  obra_id uuid not null references public.ex_obras(obra_id),
  usuario_id uuid not null references public.usuarios(id),
  created_at timestamptz not null default now(),
  created_by uuid references public.usuarios(id) default auth.uid(),
  primary key (obra_id, usuario_id)
);
create index ex_obra_usuarios_usuario_ix on public.ex_obra_usuarios (usuario_id);

-- =====================================================================
-- 2. Cronograma e locais
-- =====================================================================

create table public.ex_cronogramas (
  id uuid primary key default gen_random_uuid(),
  obra_id uuid not null references public.ex_obras(obra_id),
  codigo text not null check (codigo ~ '^[A-Z0-9][A-Z0-9-]{0,19}$'),
  nome text not null check (char_length(btrim(nome)) between 2 and 160),
  status text not null default 'rascunho' check (status in ('rascunho', 'ativo', 'concluido', 'arquivado')),
  calendario_id uuid not null references public.ex_calendarios(id),
  criterio_peso text not null default 'duracao' check (criterio_peso in ('valor', 'duracao', 'homem_hora', 'manual')),
  data_inicio date not null,
  data_corte date,
  calculado_em timestamptz,
  observacoes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references public.usuarios(id) default auth.uid(),
  excluido_em timestamptz,
  excluido_por uuid references public.usuarios(id),
  motivo_exclusao text,
  unique (id, obra_id)
);
create unique index ex_cronogramas_codigo_uk on public.ex_cronogramas (obra_id, codigo) where excluido_em is null;
create index ex_cronogramas_calendario_ix on public.ex_cronogramas (calendario_id);

create table public.ex_locais (
  id uuid primary key default gen_random_uuid(),
  obra_id uuid not null references public.ex_obras(obra_id),
  pai_id uuid,
  tipo text not null check (tipo in ('bloco', 'pavimento', 'ambiente', 'peca', 'segmento', 'outro')),
  codigo text not null check (btrim(codigo) <> '' and char_length(codigo) <= 30),
  nome text not null check (char_length(btrim(nome)) between 1 and 160),
  ordem integer not null default 0,
  km_inicial numeric(10,3),
  km_final numeric(10,3),
  lado text check (lado in ('LD', 'LE', 'eixo', 'ambos')),
  faixa text check (char_length(faixa) <= 30),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references public.usuarios(id) default auth.uid(),
  excluido_em timestamptz,
  excluido_por uuid references public.usuarios(id),
  motivo_exclusao text,
  unique (id, obra_id),
  foreign key (pai_id, obra_id) references public.ex_locais (id, obra_id),
  check (pai_id is null or pai_id <> id),
  check ((km_inicial is null) = (km_final is null))
);
create unique index ex_locais_codigo_uk on public.ex_locais (obra_id, codigo) where excluido_em is null;
create index ex_locais_pai_ix on public.ex_locais (pai_id);

-- =====================================================================
-- 3. Biblioteca de serviços e atividades
-- =====================================================================

create table public.ex_servicos (
  id uuid primary key default gen_random_uuid(),
  codigo text not null check (btrim(codigo) <> '' and char_length(codigo) <= 30),
  nome text not null check (char_length(btrim(nome)) between 2 and 200),
  unidade_id uuid references public.unidades_medida(id),
  produtividade_padrao numeric(18,4) check (produtividade_padrao > 0),
  ceu_aberto boolean not null default false,
  ativo boolean not null default true,
  observacoes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references public.usuarios(id) default auth.uid()
);
create unique index ex_servicos_codigo_uk on public.ex_servicos (upper(codigo));
create index ex_servicos_unidade_ix on public.ex_servicos (unidade_id);

create table public.ex_atividades (
  id uuid primary key default gen_random_uuid(),
  cronograma_id uuid not null,
  obra_id uuid not null,
  pai_id uuid,
  tipo text not null default 'atividade' check (tipo in ('resumo', 'atividade', 'marco')),
  codigo text not null check (btrim(codigo) <> '' and char_length(codigo) <= 40),
  nome text not null check (char_length(btrim(nome)) between 1 and 300),
  ordem integer not null,
  servico_id uuid references public.ex_servicos(id),
  quantidade numeric(18,4) check (quantidade >= 0),
  unidade_id uuid references public.unidades_medida(id),
  produtividade numeric(18,4) check (produtividade > 0),
  modo_duracao text not null default 'digitada' check (modo_duracao in ('por_produtividade', 'digitada')),
  duracao_dias integer not null default 1 check (duracao_dias >= 0),
  peso_manual numeric(18,4) check (peso_manual >= 0),
  valor_orcado numeric(14,2) check (valor_orcado >= 0),
  restricao_data text not null default 'nenhuma' check (restricao_data in ('nenhuma', 'inicio_nao_antes', 'fim_nao_depois')),
  restricao_data_em date,
  responsavel_id uuid references public.usuarios(id),
  observacao text,
  inicio_real date,
  fim_real date,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references public.usuarios(id) default auth.uid(),
  excluido_em timestamptz,
  excluido_por uuid references public.usuarios(id),
  motivo_exclusao text,
  unique (id, cronograma_id),
  unique (id, obra_id),
  foreign key (cronograma_id, obra_id) references public.ex_cronogramas (id, obra_id),
  foreign key (pai_id, cronograma_id) references public.ex_atividades (id, cronograma_id),
  check (pai_id is null or pai_id <> id),
  check ((restricao_data = 'nenhuma') = (restricao_data_em is null)),
  check (tipo <> 'marco' or duracao_dias = 0),
  check (tipo = 'atividade' or (quantidade is null and produtividade is null and servico_id is null)),
  check (modo_duracao = 'digitada' or (quantidade is not null and produtividade is not null)),
  check (fim_real is null or (inicio_real is not null and fim_real >= inicio_real))
);
create unique index ex_atividades_codigo_uk on public.ex_atividades (cronograma_id, codigo) where excluido_em is null;
create index ex_atividades_cronograma_ordem_ix on public.ex_atividades (cronograma_id, ordem) where excluido_em is null;
create index ex_atividades_pai_ix on public.ex_atividades (pai_id);
create index ex_atividades_obra_ix on public.ex_atividades (obra_id);
create index ex_atividades_servico_ix on public.ex_atividades (servico_id);
create index ex_atividades_unidade_ix on public.ex_atividades (unidade_id);
create index ex_atividades_responsavel_ix on public.ex_atividades (responsavel_id);

create table public.ex_atividade_locais (
  atividade_id uuid not null,
  local_id uuid not null,
  obra_id uuid not null,
  created_at timestamptz not null default now(),
  primary key (atividade_id, local_id),
  foreign key (atividade_id, obra_id) references public.ex_atividades (id, obra_id),
  foreign key (local_id, obra_id) references public.ex_locais (id, obra_id)
);
create index ex_atividade_locais_local_ix on public.ex_atividade_locais (local_id);

create table public.ex_dependencias (
  id uuid primary key default gen_random_uuid(),
  cronograma_id uuid not null,
  obra_id uuid not null,
  predecessora_id uuid not null,
  sucessora_id uuid not null,
  tipo text not null default 'TI' check (tipo in ('TI', 'II', 'TT', 'IT')),
  atraso_dias integer not null default 0 check (atraso_dias between -999 and 999),
  created_at timestamptz not null default now(),
  created_by uuid references public.usuarios(id) default auth.uid(),
  unique (predecessora_id, sucessora_id),
  foreign key (cronograma_id, obra_id) references public.ex_cronogramas (id, obra_id),
  foreign key (predecessora_id, cronograma_id) references public.ex_atividades (id, cronograma_id),
  foreign key (sucessora_id, cronograma_id) references public.ex_atividades (id, cronograma_id),
  check (predecessora_id <> sucessora_id)
);
create index ex_dependencias_sucessora_ix on public.ex_dependencias (sucessora_id);
create index ex_dependencias_cronograma_ix on public.ex_dependencias (cronograma_id);

-- Cache do CPM. Gravado SÓ por fn_ex_cpm_recalcular (Task 3). Ninguém mais calcula datas.
create table public.ex_atividade_datas (
  atividade_id uuid primary key,
  cronograma_id uuid not null,
  obra_id uuid not null,
  inicio_cedo date not null,
  fim_cedo date not null,
  inicio_tarde date not null,
  fim_tarde date not null,
  folga_total integer not null,
  folga_livre integer not null,
  critica boolean not null,
  calculado_em timestamptz not null default now(),
  foreign key (atividade_id, cronograma_id) references public.ex_atividades (id, cronograma_id),
  foreign key (cronograma_id, obra_id) references public.ex_cronogramas (id, obra_id)
);
create index ex_atividade_datas_cronograma_ix on public.ex_atividade_datas (cronograma_id);

-- =====================================================================
-- 4. Acesso
-- =====================================================================

create or replace function public.fn_ve_execucao()
returns boolean language sql stable security definer set search_path to '' as $$
  select public.tem_permissao('execucao.obras', 'ver') or public.tem_permissao('execucao.cronogramas', 'ver')
      or public.tem_permissao('execucao.modelos', 'ver');
$$;

-- Obras do usuário logado. A linha em ex_obra_usuarios É o acesso (padrão de mc_contrato_usuarios);
-- usuário desativado ou excluído deixa de ver na hora.
create or replace function public.fn_ex_minhas_obras()
returns setof uuid language sql stable security definer set search_path to '' as $$
  select ou.obra_id
  from public.ex_obra_usuarios ou
  join public.usuarios u on u.id = ou.usuario_id
  where ou.usuario_id = (select auth.uid()) and u.ativo and u.excluido_em is null;
$$;

create or replace function public.fn_ex_acessa_obra(p_obra uuid)
returns boolean language sql stable security definer set search_path to '' as $$
  select p_obra in (select public.fn_ex_minhas_obras());
$$;

create or replace function public.fn_ex_exigir(p_recurso text, p_acao text, p_obra uuid, p_mensagem text)
returns void language plpgsql stable security definer set search_path to '' as $$
begin
  if not public.tem_permissao(p_recurso, p_acao) then raise exception '%', p_mensagem using errcode = 'P0001'; end if;
  if p_obra is not null and not public.fn_ex_acessa_obra(p_obra) then
    raise exception 'Obra não encontrada ou você não está na lista de acesso dela' using errcode = 'P0001';
  end if;
end $$;

do $fn$
declare f text;
begin
  foreach f in array array['fn_ve_execucao()', 'fn_ex_minhas_obras()', 'fn_ex_acessa_obra(uuid)',
                           'fn_ex_exigir(text, text, uuid, text)'] loop
    execute format('revoke all on function public.%s from public, anon', f);
    execute format('grant execute on function public.%s to authenticated', f);
  end loop;
end $fn$;

-- =====================================================================
-- 5. RLS, grants, auditoria e updated_at
-- =====================================================================

do $rls$
declare t text;
begin
  -- Tabelas de obra: vê quem vê o módulo e está na lista da obra.
  foreach t in array array['ex_obra_usuarios', 'ex_cronogramas', 'ex_locais', 'ex_atividades',
                           'ex_atividade_locais', 'ex_dependencias', 'ex_atividade_datas'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('create policy %I on public.%I for select to authenticated using ((select public.fn_ve_execucao()) and obra_id in (select public.fn_ex_minhas_obras()))', t || '_select', t);
  end loop;
  alter table public.ex_obras enable row level security;
  create policy ex_obras_select on public.ex_obras for select to authenticated
    using ((select public.fn_ve_execucao()) and obra_id in (select public.fn_ex_minhas_obras()));
  -- Globais: biblioteca, calendários e feriados valem para todas as obras.
  foreach t in array array['ex_servicos', 'ex_calendarios', 'ex_calendario_excecoes', 'ex_feriados'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('create policy %I on public.%I for select to authenticated using ((select public.fn_ve_execucao()))', t || '_select', t);
  end loop;

  foreach t in array array['ex_obras', 'ex_obra_usuarios', 'ex_calendarios', 'ex_feriados', 'ex_calendario_excecoes',
                           'ex_cronogramas', 'ex_locais', 'ex_servicos', 'ex_atividades', 'ex_atividade_locais',
                           'ex_dependencias', 'ex_atividade_datas'] loop
    execute format('revoke all on public.%I from anon, authenticated', t);
    execute format('grant select on public.%I to authenticated', t);
    execute format('create trigger %I after insert or delete or update on public.%I for each row execute function public.fn_audit()', 'trg_audit_' || t, t);
  end loop;

  foreach t in array array['ex_obras', 'ex_calendarios', 'ex_calendario_excecoes', 'ex_cronogramas', 'ex_locais',
                           'ex_servicos', 'ex_atividades'] loop
    execute format('create trigger %I before update on public.%I for each row execute function public.fn_set_updated_at()', 'trg_updated_at_' || t, t);
  end loop;
end $rls$;
