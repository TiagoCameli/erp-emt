-- Medição de Contratos, Fase 1a: estrutura.
-- Desenho: docs/superpowers/specs/2026-09-25-medicao-contratos-design.md (seção 5).
-- Só cria objeto novo, com prefixo mc_ (medicoes e fn_registrar_medicao já são da Manutenção).
-- Nenhuma FK para obras, clientes, centros_custo ou lancamentos: o módulo é independente (D1, D2).
-- Leitura: quem vê o módulo E está na lista do contrato (D3). Escrita: só pelas RPCs da Fase 1d.
-- Preço, quantidade prevista e quantidade de carga são numeric sem escala: a planilha oficial tem
-- casas escondidas (02.07.04 do Lote 09: 17.057,717 x 580,86 dá 9.908.145,50, o oficial é
-- 9.908.218,84). Exceção à regra 3 do CLAUDE.md, registrada em docs/decisoes.md.

create extension if not exists btree_gist with schema extensions;

-- =====================================================================
-- 1. Contrato
-- =====================================================================

create table public.mc_contratos (
  id uuid primary key default gen_random_uuid(),
  codigo text not null check (codigo ~ '^[A-Z0-9][A-Z0-9-]{1,29}$'),
  nome_obra text not null check (char_length(btrim(nome_obra)) between 2 and 200),
  local text,
  objeto text not null check (btrim(objeto) <> ''),
  numero_contrato text not null check (btrim(numero_contrato) <> ''),
  contratante_nome text not null check (btrim(contratante_nome) <> ''),
  contratante_tipo text not null check (contratante_tipo in ('federal', 'estadual', 'municipal', 'privado')),
  contratante_documento text,
  valor_inicial numeric(14,2) not null check (valor_inicial >= 0),
  data_assinatura date not null,
  data_ordem_servico date,
  prazo_meses integer not null check (prazo_meses > 0),
  inicio_prazo text not null default 'assinatura' check (inicio_prazo in ('assinatura', 'ordem_servico')),
  dia_inicio_periodo smallint not null default 1 check (dia_inicio_periodo between 1 and 28),
  tipo_localizacao text not null default 'texto' check (tipo_localizacao in ('rodovia', 'texto')),
  -- Nula até ser descoberta na planilha oficial: sem regra, as views devolvem valor nulo.
  regra_arredondamento text check (regra_arredondamento in ('item_por_medicao', 'item_por_acumulado', 'sem_arredondar')),
  alerta_prazo_dias integer not null default 90 check (alerta_prazo_dias >= 0),
  alerta_valor_pct numeric(5,2) not null default 90 check (alerta_valor_pct between 0 and 100),
  status text not null default 'ativo' check (status in ('ativo', 'paralisado', 'encerrado')),
  observacoes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references public.usuarios(id) default auth.uid(),
  excluido_em timestamptz,
  excluido_por uuid references public.usuarios(id),
  motivo_exclusao text,
  check (inicio_prazo = 'assinatura' or data_ordem_servico is not null)
);
create unique index mc_contratos_codigo_uk on public.mc_contratos (codigo) where excluido_em is null;

create table public.mc_contrato_usuarios (
  contrato_id uuid not null references public.mc_contratos(id),
  usuario_id uuid not null references public.usuarios(id),
  created_at timestamptz not null default now(),
  created_by uuid references public.usuarios(id) default auth.uid(),
  primary key (contrato_id, usuario_id)
);
create index mc_contrato_usuarios_usuario_ix on public.mc_contrato_usuarios (usuario_id);

create table public.mc_aditivos (
  id uuid primary key default gen_random_uuid(),
  contrato_id uuid not null references public.mc_contratos(id),
  numero integer not null check (numero > 0),
  data_assinatura date not null,
  data_vigencia date not null,
  tipos text[] not null check (cardinality(tipos) > 0 and tipos <@ array['quantidade', 'valor', 'prazo', 'inclusao_item']),
  prazo_acrescido_meses integer check (prazo_acrescido_meses > 0),
  motivo text not null check (btrim(motivo) <> ''),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references public.usuarios(id) default auth.uid(),
  excluido_em timestamptz,
  excluido_por uuid references public.usuarios(id),
  motivo_exclusao text,
  unique (id, contrato_id),
  check (('prazo' = any(tipos)) = (prazo_acrescido_meses is not null))
);
create unique index mc_aditivos_numero_uk on public.mc_aditivos (contrato_id, numero) where excluido_em is null;

-- =====================================================================
-- 2. Planilha contratual
-- =====================================================================

create table public.mc_planilha_versoes (
  id uuid primary key default gen_random_uuid(),
  contrato_id uuid not null references public.mc_contratos(id),
  numero integer not null check (numero >= 0),
  aditivo_id uuid,
  vigente_desde date not null,
  status text not null default 'rascunho' check (status in ('rascunho', 'vigente')),
  motivo text,
  arquivo_nome text,
  arquivo_hash text,
  aprovada_em timestamptz,
  aprovada_por uuid references public.usuarios(id),
  motivo_desaprovacao text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references public.usuarios(id) default auth.uid(),
  excluido_em timestamptz,
  excluido_por uuid references public.usuarios(id),
  motivo_exclusao text,
  unique (id, contrato_id),
  foreign key (aditivo_id, contrato_id) references public.mc_aditivos (id, contrato_id),
  check ((numero = 0) = (aditivo_id is null))
);
create unique index mc_planilha_versoes_numero_uk on public.mc_planilha_versoes (contrato_id, numero) where excluido_em is null;

-- Identidade estável do item: o acumulado soma por ela, atravessando as versões.
create table public.mc_itens (
  id uuid primary key default gen_random_uuid(),
  contrato_id uuid not null references public.mc_contratos(id),
  created_at timestamptz not null default now(),
  unique (id, contrato_id)
);

create table public.mc_planilha_itens (
  id uuid primary key default gen_random_uuid(),
  versao_id uuid not null,
  contrato_id uuid not null,
  item_id uuid not null,
  ordem integer not null check (ordem > 0),
  codigo text not null check (btrim(codigo) <> ''),
  pai_id uuid,
  descricao text not null check (btrim(descricao) <> ''),
  unidade text,
  tipo text not null check (tipo in ('titulo', 'servico')),
  preco_unitario numeric check (preco_unitario >= 0),
  quantidade_prevista numeric check (quantidade_prevista >= 0),
  linha_origem integer,
  created_at timestamptz not null default now(),
  unique (versao_id, ordem),
  unique (versao_id, item_id),
  unique (id, versao_id),
  foreign key (versao_id, contrato_id) references public.mc_planilha_versoes (id, contrato_id),
  foreign key (item_id, contrato_id) references public.mc_itens (id, contrato_id),
  foreign key (pai_id, versao_id) references public.mc_planilha_itens (id, versao_id),
  check ((tipo = 'titulo' and preco_unitario is null and quantidade_prevista is null)
      or (tipo = 'servico' and preco_unitario is not null and quantidade_prevista is not null))
);
create index mc_planilha_itens_pai_ix on public.mc_planilha_itens (pai_id);
create index mc_planilha_itens_item_ix on public.mc_planilha_itens (item_id);
create index mc_planilha_itens_contrato_ix on public.mc_planilha_itens (contrato_id);

-- =====================================================================
-- 3. Medição
-- =====================================================================

create table public.mc_medicoes (
  id uuid primary key default gen_random_uuid(),
  contrato_id uuid not null references public.mc_contratos(id),
  numero integer not null check (numero > 0),
  periodo_inicio date not null,
  periodo_fim date not null,
  status text not null default 'aberta' check (status in ('aberta', 'em_conferencia', 'enviada', 'aprovada')),
  versao_id uuid not null,
  aprovada_em timestamptz,
  aprovada_por uuid references public.usuarios(id),
  origem text not null default 'app' check (origem in ('app', 'carga')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references public.usuarios(id) default auth.uid(),
  unique (contrato_id, numero),
  unique (id, contrato_id),
  foreign key (versao_id, contrato_id) references public.mc_planilha_versoes (id, contrato_id),
  check (periodo_fim >= periodo_inicio),
  constraint mc_medicoes_sem_sobreposicao exclude using gist
    (contrato_id with =, daterange(periodo_inicio, periodo_fim, '[]') with &&)
);
create index mc_medicoes_versao_ix on public.mc_medicoes (versao_id);

create table public.mc_medicao_revisoes (
  id uuid primary key default gen_random_uuid(),
  medicao_id uuid not null,
  contrato_id uuid not null,
  numero integer not null check (numero >= 0),
  fase text not null default 'antes_aprovacao' check (fase in ('antes_aprovacao', 'pos_aprovacao')),
  motivo text,
  status text not null default 'em_aberto' check (status in ('em_aberto', 'enviada', 'aprovada', 'substituida')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references public.usuarios(id) default auth.uid(),
  unique (medicao_id, numero),
  unique (id, medicao_id),
  foreign key (medicao_id, contrato_id) references public.mc_medicoes (id, contrato_id),
  check (numero = 0 or coalesce(btrim(motivo), '') <> '')
);
create index mc_medicao_revisoes_contrato_ix on public.mc_medicao_revisoes (contrato_id);

-- Quantidade medida congelada no envio de cada revisão (quantidade, nunca dinheiro).
create table public.mc_revisao_itens (
  revisao_id uuid not null references public.mc_medicao_revisoes(id),
  item_id uuid not null,
  contrato_id uuid not null,
  quantidade numeric not null,
  primary key (revisao_id, item_id),
  foreign key (item_id, contrato_id) references public.mc_itens (id, contrato_id)
);
create index mc_revisao_itens_contrato_ix on public.mc_revisao_itens (contrato_id);

create table public.mc_aprovacoes_item (
  revisao_id uuid not null references public.mc_medicao_revisoes(id),
  item_id uuid not null,
  contrato_id uuid not null,
  quantidade_aprovada numeric not null check (quantidade_aprovada >= 0),
  created_at timestamptz not null default now(),
  created_by uuid references public.usuarios(id) default auth.uid(),
  primary key (revisao_id, item_id),
  foreign key (item_id, contrato_id) references public.mc_itens (id, contrato_id)
);
create index mc_aprovacoes_item_contrato_ix on public.mc_aprovacoes_item (contrato_id);

create table public.mc_medicao_eventos (
  id uuid primary key default gen_random_uuid(),
  medicao_id uuid not null,
  contrato_id uuid not null,
  evento text not null,
  de_status text,
  para_status text,
  motivo text,
  usuario_id uuid references public.usuarios(id) default auth.uid(),
  criado_em timestamptz not null default now(),
  foreign key (medicao_id, contrato_id) references public.mc_medicoes (id, contrato_id)
);
create index mc_medicao_eventos_medicao_ix on public.mc_medicao_eventos (medicao_id);

-- =====================================================================
-- 4. Lançamento diário e ajuste
-- =====================================================================

create table public.mc_lancamentos (
  id uuid primary key default gen_random_uuid(),
  contrato_id uuid not null,
  item_id uuid not null,
  medicao_id uuid not null,        -- preenchido pelo gatilho da Fase 1c, nunca pela tela
  data date not null,
  quantidade numeric not null check (quantidade > 0),
  km_inicial numeric(10,3),
  km_final numeric(10,3),
  estaca text,
  local_texto text,
  observacao text,
  motivo_excesso text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references public.usuarios(id) default auth.uid(),
  excluido_em timestamptz,
  excluido_por uuid references public.usuarios(id),
  motivo_exclusao text,
  foreign key (item_id, contrato_id) references public.mc_itens (id, contrato_id),
  foreign key (medicao_id, contrato_id) references public.mc_medicoes (id, contrato_id)
);
create index mc_lancamentos_medicao_ix on public.mc_lancamentos (medicao_id) where excluido_em is null;
create index mc_lancamentos_contrato_data_ix on public.mc_lancamentos (contrato_id, data);
create index mc_lancamentos_item_ix on public.mc_lancamentos (item_id);

create table public.mc_ajustes (
  id uuid primary key default gen_random_uuid(),
  medicao_id uuid not null,
  contrato_id uuid not null,
  revisao_id uuid not null,
  item_id uuid not null,
  quantidade numeric not null check (quantidade <> 0),
  motivo text not null check (char_length(btrim(motivo)) >= 3),
  tipo text not null default 'manual' check (tipo in ('manual', 'carga')),
  created_at timestamptz not null default now(),
  created_by uuid references public.usuarios(id) default auth.uid(),
  foreign key (medicao_id, contrato_id) references public.mc_medicoes (id, contrato_id),
  foreign key (revisao_id, medicao_id) references public.mc_medicao_revisoes (id, medicao_id),
  foreign key (item_id, contrato_id) references public.mc_itens (id, contrato_id)
);
create index mc_ajustes_medicao_ix on public.mc_ajustes (medicao_id);
create index mc_ajustes_revisao_ix on public.mc_ajustes (revisao_id);
create index mc_ajustes_item_ix on public.mc_ajustes (item_id);

-- =====================================================================
-- 5. Reajuste (nasce vazio; RPCs e telas na Fase 6)
-- =====================================================================

create table public.mc_indices (
  id uuid primary key default gen_random_uuid(),
  nome text not null check (btrim(nome) <> ''),
  sigla text not null check (btrim(sigla) <> ''),
  fonte text,
  observacao text,
  ativo boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references public.usuarios(id) default auth.uid(),
  excluido_em timestamptz,
  excluido_por uuid references public.usuarios(id),
  motivo_exclusao text
);
create unique index mc_indices_sigla_uk on public.mc_indices (upper(sigla)) where excluido_em is null;

create table public.mc_indice_valores (
  id uuid primary key default gen_random_uuid(),
  indice_id uuid not null references public.mc_indices(id),
  mes date not null check (extract(day from mes) = 1),
  valor numeric not null check (valor > 0),
  situacao text not null check (situacao in ('provisorio', 'definitivo')),
  fonte text not null check (btrim(fonte) <> ''),
  data_publicacao date,
  created_at timestamptz not null default now(),
  created_by uuid references public.usuarios(id) default auth.uid(),
  unique (indice_id, mes, situacao)
);

create table public.mc_reajuste_config (
  contrato_id uuid primary key references public.mc_contratos(id),
  tem_reajuste boolean not null default false,
  data_base date,
  periodicidade_meses integer not null default 12 check (periodicidade_meses > 0),
  defasagem_meses integer not null default 0 check (defasagem_meses >= 0),
  modo_indice_i text check (modo_indice_i in ('mensal', 'ciclo_anual')),          -- spec Q2, nula até a cláusula
  casas_fator smallint check (casas_fator between 0 and 12),
  indice_padrao_id uuid references public.mc_indices(id),
  formula text not null default 'padrao' check (formula = 'padrao'),
  regra_aniversario text check (regra_aniversario in ('medicao_inteira', 'proporcional_por_data')), -- spec Q3
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.mc_item_indices (
  item_id uuid primary key,
  contrato_id uuid not null,
  indice_id uuid not null references public.mc_indices(id),
  created_at timestamptz not null default now(),
  created_by uuid references public.usuarios(id) default auth.uid(),
  foreign key (item_id, contrato_id) references public.mc_itens (id, contrato_id)
);
create index mc_item_indices_contrato_ix on public.mc_item_indices (contrato_id);

create table public.mc_reajuste_aplicado (
  id uuid primary key default gen_random_uuid(),
  medicao_id uuid not null,
  contrato_id uuid not null,
  revisao_id uuid not null,
  indice_id uuid not null references public.mc_indices(id),
  i0 numeric not null,
  i numeric not null,
  mes_i date not null,
  fator numeric not null,
  situacao text not null check (situacao in ('provisorio', 'definitivo')),
  aplicado_em timestamptz not null default now(),
  unique (revisao_id, indice_id, situacao),
  foreign key (medicao_id, contrato_id) references public.mc_medicoes (id, contrato_id),
  foreign key (revisao_id, medicao_id) references public.mc_medicao_revisoes (id, medicao_id)
);

create table public.mc_reajuste_aplicado_itens (
  revisao_id uuid not null references public.mc_medicao_revisoes(id),
  item_id uuid not null,
  contrato_id uuid not null,
  indice_id uuid not null references public.mc_indices(id),
  primary key (revisao_id, item_id),
  foreign key (item_id, contrato_id) references public.mc_itens (id, contrato_id)
);

-- =====================================================================
-- 6. Acesso
-- =====================================================================

create or replace function public.fn_ve_medicao()
returns boolean language sql stable security definer set search_path to '' as $$
  select public.tem_permissao('medicao.painel', 'ver') or public.tem_permissao('medicao.contratos', 'ver')
      or public.tem_permissao('medicao.planilha', 'ver') or public.tem_permissao('medicao.boletim', 'ver')
      or public.tem_permissao('medicao.lancamentos', 'ver') or public.tem_permissao('medicao.medicoes', 'ver')
      or public.tem_permissao('medicao.reajuste', 'ver') or public.tem_permissao('medicao.indices', 'ver')
      or public.tem_permissao('medicao.alertas', 'ver');
$$;

-- Contratos do usuário logado. A linha em mc_contrato_usuarios É o acesso (padrão de
-- usuario_conta_saldo); usuário desativado ou excluído deixa de ver na hora.
create or replace function public.fn_mc_meus_contratos()
returns setof uuid language sql stable security definer set search_path to '' as $$
  select cu.contrato_id
  from public.mc_contrato_usuarios cu
  join public.usuarios u on u.id = cu.usuario_id
  where cu.usuario_id = (select auth.uid()) and u.ativo and u.excluido_em is null;
$$;

create or replace function public.fn_mc_acessa_contrato(p_contrato uuid)
returns boolean language sql stable security definer set search_path to '' as $$
  select p_contrato in (select public.fn_mc_meus_contratos());
$$;

do $fn$
declare f text;
begin
  foreach f in array array['fn_ve_medicao()', 'fn_mc_meus_contratos()', 'fn_mc_acessa_contrato(uuid)'] loop
    execute format('revoke all on function public.%s from public, anon', f);
    execute format('grant execute on function public.%s to authenticated', f);
  end loop;
end $fn$;

-- =====================================================================
-- 7. RLS, grants, auditoria e updated_at
-- =====================================================================

do $rls$
declare t text;
begin
  -- Tabelas de contrato: vê quem vê o módulo e está na lista do contrato.
  foreach t in array array['mc_contrato_usuarios', 'mc_aditivos', 'mc_planilha_versoes', 'mc_itens', 'mc_planilha_itens',
                           'mc_medicoes', 'mc_medicao_revisoes', 'mc_revisao_itens', 'mc_aprovacoes_item',
                           'mc_medicao_eventos', 'mc_lancamentos', 'mc_ajustes', 'mc_reajuste_config',
                           'mc_item_indices', 'mc_reajuste_aplicado', 'mc_reajuste_aplicado_itens'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('create policy %I on public.%I for select to authenticated using ((select public.fn_ve_medicao()) and contrato_id in (select public.fn_mc_meus_contratos()))', t || '_select', t);
  end loop;
  alter table public.mc_contratos enable row level security;
  create policy mc_contratos_select on public.mc_contratos for select to authenticated
    using ((select public.fn_ve_medicao()) and id in (select public.fn_mc_meus_contratos()));
  -- Índices valem para todos os contratos.
  foreach t in array array['mc_indices', 'mc_indice_valores'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('create policy %I on public.%I for select to authenticated using ((select public.fn_ve_medicao()))', t || '_select', t);
  end loop;

  foreach t in array array['mc_contratos', 'mc_contrato_usuarios', 'mc_aditivos', 'mc_planilha_versoes', 'mc_itens',
                           'mc_planilha_itens', 'mc_medicoes', 'mc_medicao_revisoes', 'mc_revisao_itens',
                           'mc_aprovacoes_item', 'mc_medicao_eventos', 'mc_lancamentos', 'mc_ajustes', 'mc_indices',
                           'mc_indice_valores', 'mc_reajuste_config', 'mc_item_indices', 'mc_reajuste_aplicado',
                           'mc_reajuste_aplicado_itens'] loop
    execute format('revoke all on public.%I from anon, authenticated', t);
    execute format('grant select on public.%I to authenticated', t);
    execute format('create trigger %I after insert or delete or update on public.%I for each row execute function public.fn_audit()', 'trg_audit_' || t, t);
  end loop;

  foreach t in array array['mc_contratos', 'mc_aditivos', 'mc_planilha_versoes', 'mc_medicoes', 'mc_medicao_revisoes',
                           'mc_lancamentos', 'mc_indices', 'mc_reajuste_config'] loop
    execute format('create trigger %I before update on public.%I for each row execute function public.fn_set_updated_at()', 'trg_updated_at_' || t, t);
  end loop;
end $rls$;
