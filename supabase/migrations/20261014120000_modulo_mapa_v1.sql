-- =====================================================================
-- ERP-EMT · Módulo Mapa · migration v1.2 (14/10/2026)
-- Aditiva e idempotente: não altera nem remove nada que já existia no ERP;
-- pode rodar por cima do schema da parte 1/3 aplicada em produção em 14/10
-- (seção 3b faz os ajustes: escopo da frota e locações). Segue as convenções
-- do projeto: fn_audit / trg_audit_<tabela>, fn_set_created_by,
-- fn_set_updated_at, RLS via tem_permissao(recurso, acao), funções
-- SECURITY DEFINER com search_path vazio e nomes totalmente qualificados.
-- Recursos novos (adicionar em src/config/recursos.ts):
--   mapa.mapa       ver / criar / editar / excluir
--   mapa.historico  ver
-- =====================================================================

-- ---------------------------------------------------------------------
-- 0. Extensões
-- ---------------------------------------------------------------------
create extension if not exists postgis with schema extensions;
-- pg_cron: habilitar no Dashboard (Integrations > Cron) ou:
-- create extension if not exists pg_cron;  -- agendamentos no fim deste arquivo

-- ---------------------------------------------------------------------
-- 1. Cadastros existentes: colunas novas (todas opcionais, com default)
-- ---------------------------------------------------------------------
alter table public.obras
  add column if not exists no_mapa    boolean not null default false,
  add column if not exists tipo_obra  text check (tipo_obra in ('rodovia','edificacao','outra')),
  add column if not exists cor        text,
  add column if not exists centro     extensions.geometry(Point, 4326);
comment on column public.obras.no_mapa   is 'Aparece no Módulo Mapa. Centros de custo que não são obra física ficam false.';
comment on column public.obras.tipo_obra is 'rodovia = trechos com traçado e km; edificacao = polígono; outra = só pino.';
comment on column public.obras.centro    is 'Ponto do pino/indicador da obra no mapa (WGS84).';

alter table public.localidades
  add column if not exists tipo     text not null default 'outro'
    check (tipo in ('pedreira','usina','canteiro','patio','oficina','sede','jazida','terreno','alojamento','deposito','pulmao','outro')),
  add column if not exists obra_id  uuid references public.obras(id),
  add column if not exists posicao  extensions.geometry(Point, 4326)
    generated always as (
      case when latitude is not null and longitude is not null
           then extensions.st_setsrid(extensions.st_makepoint(longitude::double precision, latitude::double precision), 4326)
      end) stored;
comment on column public.localidades.tipo    is 'Tipo do local no Módulo Mapa. Pedreira/usina/canteiro já eram origem/destino de frete.';
comment on column public.localidades.obra_id is 'Obra dona do local (jazida, canteiro, pátio de obra, alojamento). Nulo para locais da empresa.';
create index if not exists localidades_posicao_gix on public.localidades using gist (posicao);

alter table public.tanques
  add column if not exists localidade_id         uuid references public.localidades(id),
  add column if not exists equipamento_id        uuid references public.equipamentos(id),
  add column if not exists minimo_alerta_litros  numeric check (minimo_alerta_litros is null or minimo_alerta_litros >= 0);
comment on column public.tanques.localidade_id  is 'Onde o tanque fica (pátio, canteiro, usina). Nulo se é tanque de equipamento.';
comment on column public.tanques.equipamento_id is 'Tanque embarcado (meloza, comboio): acompanha a posição do equipamento no mapa.';

alter table public.almoxarifado_depositos
  add column if not exists localidade_id uuid references public.localidades(id);

-- ---------------------------------------------------------------------
-- 2. Configurações do módulo (reusa public.configuracoes)
-- ---------------------------------------------------------------------
insert into public.configuracoes (chave, valor, descricao) values
  ('mapa.modo_padrao',            '"satelite"', 'Modo inicial do mapa: satelite ou mapa.'),
  ('mapa.snap_tracado_m',         '300',        'Distância máxima (m) para colar o equipamento no traçado ao soltar.'),
  ('mapa.snap_local_m',           '300',        'Distância máxima (m) para considerar que soltou num local (pátio, usina, sede).'),
  ('mapa.dias_parado_alerta',     '7',          'Dias parado no pátio para gerar alerta.'),
  ('mapa.frete_horas_max',        '12',         'Horas além da duração estimada sem chegada registrada para alertar.'),
  ('mapa.frete_hora_saida_padrao','"06:00"',    'Hora assumida de saída do frete (a data do frete não tem hora).'),
  ('mapa.locacao_dias_aviso',     '15',         'Dias antes do fim da locação de terceiros para alertar.'),
  ('mapa.diarias_valor_max',      '20000',      'Valor acumulado de diárias a pagar que gera alerta.'),
  ('mapa.snapshot_hora',          '"23:59"',    'Hora (Acre) da foto diária.'),
  ('mapa.tipos_fora_do_mapa',     '["Implementos","Moto","Outros","Laboratório","rebocador"]',
                                                'Tipos do cadastro que nunca entram no mapa (só carros, caminhões e máquinas pesadas). Comparação sem diferenciar maiúsculas.')
on conflict (chave) do nothing;
-- Fornecedor pré-selecionado ao colocar uma máquina da Colorado no mapa (locação). Resolvido pelo nome; o Tiago pode trocar.
insert into public.configuracoes (chave, valor, descricao)
select 'mapa.fornecedor_colorado',
       coalesce((select to_jsonb(f.id::text) from public.fornecedores f
                 where f.ativo and f.razao_social ilike 'construtora colorado%' order by (f.nome_fantasia is null) desc, f.created_at limit 1), 'null'::jsonb),
       'Fornecedor sugerido na locação de máquina da Colorado (id de fornecedores). Nulo = pergunta sempre.'
on conflict (chave) do nothing;

-- ---------------------------------------------------------------------
-- 3. Tabelas do módulo
-- ---------------------------------------------------------------------
create table if not exists public.mapa_modelos_3d (
  chave        text primary key,
  nome         text not null,
  arquivo      text,                       -- caminho no bucket mapa-modelos (GLB); nulo = usa genérico
  escala       numeric not null default 1,
  ancora_cabine jsonb,                     -- {x,y,z} em metros, onde o boneco do operador fica
  versao       int not null default 1,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);
comment on table public.mapa_modelos_3d is 'Um GLB por tipo de equipamento. tipo_modelo_3d em mapa_equipamentos aponta para cá.';

create table if not exists public.mapa_trechos (
  id            uuid primary key default gen_random_uuid(),
  obra_id       uuid not null references public.obras(id),
  trecho_pai_id uuid references public.mapa_trechos(id),
  nome          text not null,
  rodovia       text,
  km_inicial    numeric(9,3) not null,
  km_final      numeric(9,3) not null,
  tracado       extensions.geometry(LineString, 4326) not null,
  cor           text,
  ordem         int not null default 0,
  ativo         boolean not null default true,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  created_by    uuid,
  check (km_inicial <> km_final)
);
comment on table public.mapa_trechos is 'Trecho de rodovia de uma obra: traçado entre km inicial e final. Só visual; custo e receita ficam na obra.';
create index if not exists mapa_trechos_tracado_gix on public.mapa_trechos using gist (tracado);
create index if not exists mapa_trechos_obra_idx on public.mapa_trechos (obra_id);

create table if not exists public.mapa_areas (
  id            uuid primary key default gen_random_uuid(),
  tipo          text not null check (tipo in ('edificacao','patio_obra','terreno','canteiro','jazida','alojamento','zona_oficina','zona_patio_central','outra')),
  nome          text not null,
  obra_id       uuid references public.obras(id),
  localidade_id uuid references public.localidades(id),
  poligono      extensions.geometry(Polygon, 4326) not null,
  atributos     jsonb not null default '{}'::jsonb,
  ativo         boolean not null default true,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  created_by    uuid,
  check (tipo not in ('patio_obra','jazida','canteiro','edificacao') or obra_id is not null)
);
comment on table public.mapa_areas is 'Polígonos: edificação, pátio de obra, terreno, canteiro, jazida, alojamento, zonas da oficina e do pátio central. Pátio de obra segue o ativo da obra (ver v_mapa_areas).';
create index if not exists mapa_areas_poligono_gix on public.mapa_areas using gist (poligono);

create table if not exists public.mapa_equipes (
  id                        uuid primary key default gen_random_uuid(),
  nome                      text not null,
  encarregado_colaborador_id uuid references public.colaboradores(id),
  obra_id                   uuid references public.obras(id),
  frente_id                 uuid,
  cor                       text,
  ativo                     boolean not null default true,
  created_at                timestamptz not null default now(),
  updated_at                timestamptz not null default now(),
  created_by                uuid
);

create table if not exists public.mapa_frentes (
  id          uuid primary key default gen_random_uuid(),
  obra_id     uuid not null references public.obras(id),
  trecho_id   uuid references public.mapa_trechos(id),
  area_id     uuid references public.mapa_areas(id),
  data        date not null,
  nome        text not null,
  servico     text,
  km_inicial  numeric(9,3),
  km_final    numeric(9,3),
  geometria   extensions.geometry(Geometry, 4326),
  observacao  text,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  created_by  uuid
);
comment on table public.mapa_frentes is 'Frente de serviço de um dia: onde a equipe e as máquinas estão trabalhando. Definida diariamente; pode haver várias por obra.';
create index if not exists mapa_frentes_obra_data_idx on public.mapa_frentes (obra_id, data);
alter table public.mapa_equipes
  drop constraint if exists mapa_equipes_frente_fk,
  add constraint mapa_equipes_frente_fk foreign key (frente_id) references public.mapa_frentes(id);

create table if not exists public.mapa_equipamentos (
  id                uuid primary key default gen_random_uuid(),
  equipamento_id    uuid not null unique references public.equipamentos(id),
  tipo_modelo_3d    text references public.mapa_modelos_3d(chave),
  fonte_posicao     text not null default 'manual' check (fonte_posicao in ('manual','gps')),
  posicao           extensions.geometry(Point, 4326),
  heading           real not null default 0,
  estado            text not null default 'parado' check (estado in ('operando','parado','em_rota','quebrado_obra','conserto')),
  estado_desde      timestamptz not null default now(),
  conserto_motivo   text,
  conserto_entrada  date,
  conserto_previsao date,
  obra_id           uuid references public.obras(id),
  trecho_id         uuid references public.mapa_trechos(id),
  frente_id         uuid references public.mapa_frentes(id),
  area_id           uuid references public.mapa_areas(id),
  localidade_id     uuid references public.localidades(id),
  km_atual          numeric(9,3),
  operador_colaborador_id uuid references public.colaboradores(id),
  deslocamento      jsonb,                 -- {origem, destino, saida, previsao} quando em_rota manual (prancha)
  quebra_descricao  text,
  no_mapa           boolean not null,      -- preenchido pelo trigger (fn_mapa_no_mapa_padrao) quando não informado
  locacao_id        uuid,                  -- locação em curso (mapa_locacoes); FK adicionada abaixo
  observacao        text,
  updated_at        timestamptz not null default now(),
  updated_by        uuid
);
comment on table public.mapa_equipamentos is 'Estado do equipamento no mapa (1:1 com equipamentos). no_mapa: próprio dentro do escopo (carros, caminhões e máquinas pesadas) entra sempre; Colorado e alugado só enquanto houver locação em curso. Conserto pode ser marcado no mapa (estado) ou vir da OS em execução (equipamentos.status = em_manutencao); fora de funcionamento vem do cadastro. Ver v_mapa_equipamentos.';
create index if not exists mapa_equipamentos_posicao_gix on public.mapa_equipamentos using gist (posicao);

-- Locação: máquina da Colorado ou de terceiro enquanto está em uso pela EMT. Uma em curso (fim nulo) por equipamento.
create table if not exists public.mapa_locacoes (
  id              uuid primary key default gen_random_uuid(),
  equipamento_id  uuid not null references public.equipamentos(id),
  fornecedor_id   uuid not null references public.fornecedores(id),
  tipo_aluguel    text not null check (tipo_aluguel in ('hora','dia','mes')),
  valor_unitario  numeric(12,2) not null check (valor_unitario >= 0),
  inicio          date not null,
  fim             date check (fim is null or fim >= inicio),
  fim_previsto    date,
  medicao_inicio  numeric,                 -- horímetro/km na entrada (tipo hora)
  medicao_fim     numeric,
  observacao      text,
  created_at      timestamptz not null default now(),
  created_by      uuid,
  updated_at      timestamptz not null default now(),
  updated_by      uuid
);
comment on table public.mapa_locacoes is 'Locação de máquina (Colorado ou terceiro): fornecedor, tipo de aluguel (hora/dia/mês), valor unitário e vigência. Iniciar coloca a máquina no mapa; encerrar tira. O lançamento a pagar continua no Financeiro.';
create unique index if not exists mapa_locacoes_em_curso_uidx on public.mapa_locacoes (equipamento_id) where fim is null;
create index if not exists mapa_locacoes_fornecedor_idx on public.mapa_locacoes (fornecedor_id, inicio);

create table if not exists public.mapa_colaboradores (
  id              uuid primary key default gen_random_uuid(),
  colaborador_id  uuid not null unique references public.colaboradores(id),
  equipe_id       uuid references public.mapa_equipes(id),
  obra_id         uuid references public.obras(id),
  frente_id       uuid references public.mapa_frentes(id),
  area_id         uuid references public.mapa_areas(id),
  localidade_id   uuid references public.localidades(id),
  equipamento_id  uuid references public.equipamentos(id),
  posicao_manual  extensions.geometry(Point, 4326),
  updated_at      timestamptz not null default now(),
  updated_by      uuid
);
comment on table public.mapa_colaboradores is 'Alocação visual da pessoa (1:1 com colaboradores): equipe, obra/frente e, se operando, o equipamento. Não altera colaboradores.obra_id do RH.';

create table if not exists public.mapa_movimentacoes (
  id           bigint generated always as identity primary key,
  tipo         text not null constraint mapa_movimentacoes_tipo_check check (tipo in ('transferencia','estado','operador','frente','equipe','posicao','locacao')),
  alvo         text not null check (alvo in ('equipamento','colaborador','equipe')),
  alvo_id      uuid not null,
  de           jsonb,
  para         jsonb,
  motivo       text,
  data_efetiva date not null default (now() at time zone 'America/Rio_Branco')::date,
  usuario_id   uuid default auth.uid(),
  criado_em    timestamptz not null default now()
);
comment on table public.mapa_movimentacoes is 'Trilha imutável de cada arraste, transferência e mudança de estado feita no mapa.';
create index if not exists mapa_movimentacoes_alvo_idx on public.mapa_movimentacoes (alvo, alvo_id, criado_em desc);
create index if not exists mapa_movimentacoes_data_idx on public.mapa_movimentacoes (data_efetiva);

create table if not exists public.mapa_excecoes_dia (
  id             uuid primary key default gen_random_uuid(),
  colaborador_id uuid not null references public.colaboradores(id),
  data           date not null,
  tipo           text not null check (tipo in ('falta','folga','afastado')),
  observacao     text,
  created_at     timestamptz not null default now(),
  created_by     uuid,
  unique (colaborador_id, data)
);
comment on table public.mapa_excecoes_dia is 'Presença é assumida pela alocação; aqui só a exceção do dia. Férias vêm de rh_ferias e atestado/acidente de rh_ocorrencias.';

create table if not exists public.mapa_diarias (
  id             uuid primary key default gen_random_uuid(),
  colaborador_id uuid not null references public.colaboradores(id),
  data           date not null,
  obra_id        uuid references public.obras(id),
  valor          numeric(10,2) not null default 0,
  pago           boolean not null default false,
  pago_em        date,
  pago_obs       text,
  origem         text not null default 'snapshot' check (origem in ('snapshot','manual')),
  created_at     timestamptz not null default now(),
  created_by     uuid,
  updated_at     timestamptz not null default now(),
  unique (colaborador_id, data)
);
comment on table public.mapa_diarias is 'Diária contada pelo Mapa: uma por diarista presente e alocado no dia (gerada na foto do dia). Marcar pago é do próprio módulo; não gera lançamento no Financeiro (decisão do Tiago).';
create index if not exists mapa_diarias_colab_data_idx on public.mapa_diarias (colaborador_id, data);

create table if not exists public.mapa_snapshots (
  id         uuid primary key default gen_random_uuid(),
  data       date not null unique,
  estado     jsonb not null,
  gerado_em  timestamptz not null default now(),
  gerado_por uuid
);
comment on table public.mapa_snapshots is 'Foto diária do mapa: posições, estados, alocações, frentes, carretas, tanques. Base da linha do tempo e dos relatórios mensais.';

create table if not exists public.mapa_servicos_medidos (
  id         uuid primary key default gen_random_uuid(),
  obra_id    uuid not null references public.obras(id),
  trecho_id  uuid references public.mapa_trechos(id),
  tipo       text not null check (tipo in ('ts','dreno','cbuq','paliativo','remendo','outro')),
  medicao    int,
  nome       text not null,
  posicao    extensions.geometry(Point, 4326),
  posicao_estimada boolean not null default false,
  km         text,
  lado       text,
  valor      numeric(14,2),
  dados      jsonb not null default '{}'::jsonb,
  fonte      text not null default 'kml',
  created_at timestamptz not null default now(),
  created_by uuid
);
comment on table public.mapa_servicos_medidos is 'Serviços medidos importados do KML/Notion (TS, drenos, CBUQ, paliativo). Quando o módulo Medição tiver coordenada, passa a ser a fonte.';
create index if not exists mapa_servicos_medidos_posicao_gix on public.mapa_servicos_medidos using gist (posicao);

create table if not exists public.mapa_alertas (
  id           uuid primary key default gen_random_uuid(),
  tipo         text not null,
  alvo         text not null,
  alvo_id      uuid,
  mensagem     text not null,
  dados        jsonb not null default '{}'::jsonb,
  criado_em    timestamptz not null default now(),
  resolvido_em timestamptz,
  resolvido_por uuid,
  unique (tipo, alvo, alvo_id, resolvido_em)
);

create table if not exists public.mapa_posicoes_gps (
  id             bigint generated always as identity primary key,
  equipamento_id uuid not null references public.equipamentos(id),
  posicao        extensions.geometry(Point, 4326) not null,
  velocidade_kmh numeric,
  heading        real,
  recebido_em    timestamptz not null default now(),
  fonte          text not null
);
comment on table public.mapa_posicoes_gps is 'Reservada para rastreadores (futuro). Quando houver, mapa_equipamentos.fonte_posicao = gps e o arraste é bloqueado.';
create index if not exists mapa_posicoes_gps_equip_idx on public.mapa_posicoes_gps (equipamento_id, recebido_em desc);

-- ---------------------------------------------------------------------
-- 3b. Escopo da frota no mapa e locações (ajustes idempotentes: valem
--     para banco novo e para a produção, onde o schema de 14/10 já existia)
-- ---------------------------------------------------------------------
-- Entra no mapa por padrão? Próprio dentro do escopo: sim. Colorado/alugado: só com locação em curso. Tipo fora do escopo: nunca.
create or replace function public.fn_mapa_no_mapa_padrao(p_equipamento uuid)
returns boolean language sql stable security definer set search_path to '' as $$
  select case
    when e.tipo is null then false
    when lower(e.tipo) in (select lower(x) from public.configuracoes c, jsonb_array_elements_text(c.valor) x where c.chave = 'mapa.tipos_fora_do_mapa') then false
    when e.propriedade = 'propria' then true
    else exists (select 1 from public.mapa_locacoes l where l.equipamento_id = e.id and l.fim is null)
  end
  from public.equipamentos e where e.id = p_equipamento;
$$;

-- Mensagem de bloqueio (nulo = pode ser posicionado no mapa)
create or replace function public.fn_mapa_motivo_fora_do_mapa(p_equipamento uuid)
returns text language sql stable security definer set search_path to '' as $$
  select case
    when e.id is null then 'Equipamento não encontrado'
    when not e.ativo then format('%s está inativo no cadastro', coalesce(e.codigo, e.descricao))
    when e.tipo is null or lower(e.tipo) in (select lower(x) from public.configuracoes c, jsonb_array_elements_text(c.valor) x where c.chave = 'mapa.tipos_fora_do_mapa')
      then format('%s é do tipo "%s", que não entra no mapa (só carros, caminhões e máquinas pesadas)', coalesce(e.codigo, e.descricao), coalesce(e.tipo, 'sem tipo'))
    when e.propriedade <> 'propria' and not exists (select 1 from public.mapa_locacoes l where l.equipamento_id = e.id and l.fim is null)
      then format('%s é %s: entra no mapa por "Adicionar máquina alugada" (fornecedor, tipo de aluguel e valor)', coalesce(e.codigo, e.descricao),
                  case e.propriedade when 'colorado' then 'da Colorado' else 'alugado de terceiro' end)
  end
  from (select 1) q left join public.equipamentos e on e.id = p_equipamento;
$$;

alter table public.mapa_equipamentos
  add column if not exists no_mapa    boolean,
  add column if not exists locacao_id uuid,
  drop column if exists locador,
  drop column if exists valor_locacao,
  drop column if exists locacao_inicio,
  drop column if exists locacao_fim;
alter table public.mapa_equipamentos
  drop constraint if exists mapa_equipamentos_locacao_fk,
  add constraint mapa_equipamentos_locacao_fk foreign key (locacao_id) references public.mapa_locacoes(id);
update public.mapa_equipamentos set no_mapa = public.fn_mapa_no_mapa_padrao(equipamento_id) where no_mapa is null;
alter table public.mapa_equipamentos alter column no_mapa set not null;

alter table public.mapa_movimentacoes
  drop constraint if exists mapa_movimentacoes_tipo_check,
  add constraint mapa_movimentacoes_tipo_check check (tipo in ('transferencia','estado','operador','frente','equipe','posicao','locacao'));

-- Linha nova em mapa_equipamentos sem no_mapa informado recebe o padrão
create or replace function public.fn_mapa_trg_equipamento_no_mapa()
returns trigger language plpgsql security definer set search_path to '' as $$
begin
  if new.no_mapa is null then
    new.no_mapa := coalesce(public.fn_mapa_no_mapa_padrao(new.equipamento_id), false);
  end if;
  return new;
end $$;
drop trigger if exists trg_mapa_equipamentos_no_mapa on public.mapa_equipamentos;
create trigger trg_mapa_equipamentos_no_mapa before insert on public.mapa_equipamentos
  for each row execute function public.fn_mapa_trg_equipamento_no_mapa();

-- Cadastro mudou propriedade ou tipo (ex.: Colorado que virou própria): recalcula o escopo
create or replace function public.fn_mapa_trg_equipamento_escopo()
returns trigger language plpgsql security definer set search_path to '' as $$
begin
  if new.propriedade is distinct from old.propriedade or new.tipo is distinct from old.tipo then
    update public.mapa_equipamentos set no_mapa = public.fn_mapa_no_mapa_padrao(new.id) where equipamento_id = new.id;
  end if;
  return new;
end $$;
drop trigger if exists trg_equipamento_mapa_escopo on public.equipamentos;
create trigger trg_equipamento_mapa_escopo after update of propriedade, tipo on public.equipamentos
  for each row execute function public.fn_mapa_trg_equipamento_escopo();

-- ---------------------------------------------------------------------
-- 4. Triggers padrão (created_by, updated_at, auditoria, imutabilidade)
-- ---------------------------------------------------------------------
do $$
declare t text;
begin
  foreach t in array array['mapa_trechos','mapa_areas','mapa_equipes','mapa_frentes','mapa_excecoes_dia','mapa_servicos_medidos','mapa_diarias','mapa_locacoes'] loop
    execute format('drop trigger if exists trg_set_created_by on public.%I', t);
    execute format('create trigger trg_set_created_by before insert on public.%I for each row execute function public.fn_set_created_by()', t);
  end loop;
  foreach t in array array['mapa_trechos','mapa_areas','mapa_equipes','mapa_frentes','mapa_equipamentos','mapa_colaboradores','mapa_modelos_3d','mapa_diarias','mapa_locacoes'] loop
    execute format('drop trigger if exists trg_%s_updated_at on public.%I', t, t);
    execute format('create trigger trg_%s_updated_at before update on public.%I for each row execute function public.fn_set_updated_at()', t, t);
  end loop;
  foreach t in array array['mapa_trechos','mapa_areas','mapa_equipes','mapa_frentes','mapa_equipamentos','mapa_colaboradores','mapa_excecoes_dia','mapa_servicos_medidos','mapa_alertas','mapa_modelos_3d','mapa_movimentacoes','mapa_diarias','mapa_locacoes'] loop
    execute format('drop trigger if exists trg_audit_%s on public.%I', t, t);
    execute format('create trigger trg_audit_%s after insert or update or delete on public.%I for each row execute function public.fn_audit()', t, t);
  end loop;
end $$;

create or replace function public.fn_mapa_trg_imutavel()
returns trigger language plpgsql set search_path to '' as $$
begin
  raise exception 'mapa_movimentacoes é imutável: sem UPDATE nem DELETE';
end $$;
drop trigger if exists trg_mapa_movimentacoes_imutavel on public.mapa_movimentacoes;
create trigger trg_mapa_movimentacoes_imutavel before update or delete on public.mapa_movimentacoes
  for each row execute function public.fn_mapa_trg_imutavel();

-- ---------------------------------------------------------------------
-- 5. RLS
-- ---------------------------------------------------------------------
do $$
declare t text;
begin
  foreach t in array array['mapa_modelos_3d','mapa_trechos','mapa_areas','mapa_equipes','mapa_frentes','mapa_equipamentos','mapa_colaboradores','mapa_excecoes_dia','mapa_servicos_medidos','mapa_alertas','mapa_posicoes_gps','mapa_diarias','mapa_locacoes'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('drop policy if exists %s_select on public.%I', t, t);
    execute format('drop policy if exists %s_insert on public.%I', t, t);
    execute format('drop policy if exists %s_update on public.%I', t, t);
    execute format('drop policy if exists %s_delete on public.%I', t, t);
    execute format('create policy %s_select on public.%I for select using ((select public.tem_permissao(''mapa.mapa'',''ver'')))', t, t);
    execute format('create policy %s_insert on public.%I for insert with check ((select public.tem_permissao(''mapa.mapa'',''criar'')))', t, t);
    execute format('create policy %s_update on public.%I for update using ((select public.tem_permissao(''mapa.mapa'',''editar''))) with check ((select public.tem_permissao(''mapa.mapa'',''editar'')))', t, t);
    execute format('create policy %s_delete on public.%I for delete using ((select public.tem_permissao(''mapa.mapa'',''excluir'')))', t, t);
  end loop;
end $$;

alter table public.mapa_movimentacoes enable row level security;
drop policy if exists mapa_movimentacoes_select on public.mapa_movimentacoes;
create policy mapa_movimentacoes_select on public.mapa_movimentacoes for select
  using ((select public.tem_permissao('mapa.mapa','ver')) or (select public.tem_permissao('mapa.historico','ver')));
drop policy if exists mapa_movimentacoes_insert on public.mapa_movimentacoes;
create policy mapa_movimentacoes_insert on public.mapa_movimentacoes for insert
  with check ((select public.tem_permissao('mapa.mapa','editar')));

alter table public.mapa_snapshots enable row level security;
drop policy if exists mapa_snapshots_select on public.mapa_snapshots;
create policy mapa_snapshots_select on public.mapa_snapshots for select
  using ((select public.tem_permissao('mapa.historico','ver')));
-- escrita de snapshots só pela função fn_mapa_snapshot (definer)

-- Permissões: Admin (perfil) e os usuários que hoje têm o perfil Admin
insert into public.perfil_permissoes (perfil_id, recurso, acao)
select p.id, r.recurso, a.acao
from public.perfis p
cross join (values ('mapa.mapa'), ('mapa.historico')) r(recurso)
cross join (values ('ver'), ('criar'), ('editar'), ('excluir')) a(acao)
where p.nome = 'Admin'
  and (r.recurso = 'mapa.mapa' or a.acao = 'ver')
  and not exists (select 1 from public.perfil_permissoes x where x.perfil_id = p.id and x.recurso = r.recurso and x.acao = a.acao);

insert into public.usuario_permissoes (usuario_id, recurso, acao)
select u.id, r.recurso, a.acao
from public.usuarios u
join public.perfis p on p.id = u.perfil_id and p.nome = 'Admin'
cross join (values ('mapa.mapa'), ('mapa.historico')) r(recurso)
cross join (values ('ver'), ('criar'), ('editar'), ('excluir')) a(acao)
where u.ativo
  and (r.recurso = 'mapa.mapa' or a.acao = 'ver')
  and not exists (select 1 from public.usuario_permissoes x where x.usuario_id = u.id and x.recurso = r.recurso and x.acao = a.acao);

-- ---------------------------------------------------------------------
-- 6. Modelos 3D: chaves (GLB entra depois, quando comprado)
-- ---------------------------------------------------------------------
insert into public.mapa_modelos_3d (chave, nome) values
  ('vibroacabadora','Vibroacabadora'), ('rolo_liso','Rolo liso (chapa)'), ('rolo_pneu','Rolo de pneu'),
  ('rolo_pe_carneiro','Rolo pé de carneiro'), ('escavadeira','Escavadeira hidráulica'), ('motoniveladora','Motoniveladora'),
  ('retroescavadeira','Retroescavadeira'), ('pa_carregadeira','Pá carregadeira'), ('minicarregadeira','Minicarregadeira'),
  ('trator_esteira','Trator de esteira'), ('trator_pneu','Trator de pneu'), ('manipulador_telescopico','Manipulador telescópico'),
  ('usina_asfalto','Usina de asfalto'), ('caminhao_basculante','Caminhão basculante'), ('caminhao_carroceria','Caminhão carroceria'),
  ('caminhao_betoneira','Caminhão betoneira'), ('caminhao_pintura','Caminhão de pintura'), ('caminhao_prancha','Caminhão prancha/plataforma'),
  ('caminhao_espargidor','Caminhão espargidor'), ('caminhao_munck','Caminhão munck'), ('caminhao_pipa','Caminhão pipa'),
  ('carreta_cavalo','Cavalo mecânico com semirreboque'), ('semirreboque','Semirreboque / implemento'), ('meloza','Meloza'),
  ('caminhonete','Veículo leve'), ('moto','Moto'), ('rebocador','Rebocador'), ('conteiner','Contêiner / laboratório'),
  ('gerador','Gerador'), ('compressor','Compressor'), ('tanque','Tanque estacionário'), ('boneco','Pessoa'), ('generico','Genérico')
on conflict (chave) do nothing;

-- Mapeia o tipo atual do cadastro para a chave do modelo e cria a linha 1:1 de cada equipamento.
-- no_mapa: próprio no escopo = true; Colorado/alugado = false até iniciar locação; implementos, motos, outros, laboratório, rebocador = false.
insert into public.mapa_equipamentos (equipamento_id, tipo_modelo_3d, no_mapa)
select e.id,
  case e.tipo
    when 'Vibroacabadora' then 'vibroacabadora' when 'Rolo Chapa' then 'rolo_liso' when 'Rolo de Pneu' then 'rolo_pneu'
    when 'Rolo Pé de Carneiro' then 'rolo_pe_carneiro' when 'Escavadeira Hidráulica' then 'escavadeira' when 'Motoniveladora' then 'motoniveladora'
    when 'Retroescavadeira' then 'retroescavadeira' when 'Pá Carregadeira' then 'pa_carregadeira' when 'Minicarregadeira' then 'minicarregadeira'
    when 'Trator de Esteira' then 'trator_esteira' when 'Trator' then 'trator_pneu' when 'Trator de Pneu' then 'trator_pneu'
    when 'Telescópio de Elevação' then 'manipulador_telescopico' when 'Usina de Asfalto' then 'usina_asfalto'
    when 'Caminhão Basculante' then 'caminhao_basculante' when 'CAMINHÃO' then 'caminhao_carroceria' when 'Caminhão Betoneira' then 'caminhao_betoneira'
    when 'Caminhão de Pintura' then 'caminhao_pintura' when 'Caminhão de Transporte' then 'caminhao_prancha' when 'Caminhão Espargidor' then 'caminhao_espargidor'
    when 'Caminhão Munck' then 'caminhao_munck' when 'Caminhão Pipa' then 'caminhao_pipa' when 'Semirreboque' then 'carreta_cavalo'
    when 'Implementos' then 'semirreboque' when 'Meloza' then 'meloza' when 'Carro' then 'caminhonete' when 'CARRO' then 'caminhonete'
    when 'Moto' then 'moto' when 'rebocador' then 'rebocador' when 'Laboratório' then 'conteiner'
    else 'generico' end,
  public.fn_mapa_no_mapa_padrao(e.id)
from public.equipamentos e
where not exists (select 1 from public.mapa_equipamentos m where m.equipamento_id = e.id);
-- Base que já tinha as linhas (produção): recalcula o escopo uma vez
update public.mapa_equipamentos m set no_mapa = public.fn_mapa_no_mapa_padrao(m.equipamento_id)
 where m.locacao_id is null and m.no_mapa is distinct from public.fn_mapa_no_mapa_padrao(m.equipamento_id);

-- Obras físicas (o Tiago ajusta no cadastro depois)
update public.obras set no_mapa = true, tipo_obra = 'rodovia'
 where nome in ('009 - Manutenção da Rodovia BR-364/AC - Lote 09 & 10','007 - AC 405 - Lote 2','007.1 AC405 - Lote 2 Trecho depois da Ponte do Moa','003 - Recuperação do Ramal do Gama','Acesso ao Polo Naval')
   and tipo_obra is null;
update public.obras set no_mapa = true, tipo_obra = 'edificacao'
 where nome in ('012 - CONSTRUÇÃO DE ESCOLA DO MUNICÍPIO DE MANCIO LIMA','011 - CONSTRUÇÃO DE ESCOLA EM TEMPO INTEGRAL MARECHAL THAUMATURGO','Galpão Silo','Amazônia Agroindústria')
   and tipo_obra is null;

-- Tipos dos locais já cadastrados
update public.localidades set tipo = 'pedreira' where tipo = 'outro' and nome ilike 'pedreira%' or (tipo = 'outro' and fornecedor_id is not null and nome ilike '%abun%');
update public.localidades set tipo = 'usina'    where tipo = 'outro' and nome ilike 'usina%';
update public.localidades set tipo = 'patio'    where tipo = 'outro' and (nome ilike 'patio%' or nome ilike 'pátio%' or nome = 'Colorado');
update public.localidades set tipo = 'pulmao'   where tipo = 'outro' and nome ilike 'pulm%';
update public.localidades set tipo = 'canteiro' where tipo = 'outro' and nome ilike 'escola%';

-- ---------------------------------------------------------------------
-- 7. Views
-- ---------------------------------------------------------------------
create or replace view public.v_mapa_areas with (security_invoker = true) as
select a.*,
       (a.ativo and (a.obra_id is null or o.ativo)) as ativo_efetivo,
       o.nome as obra_nome
from public.mapa_areas a
left join public.obras o on o.id = a.obra_id;

-- Todos os equipamentos do cadastro, com no_mapa dizendo quem aparece. O mapa filtra no_mapa; a lista
-- "Adicionar máquina alugada" usa os de propriedade colorado/alugada com no_mapa = false.
drop view if exists public.v_mapa_equipamentos;
create view public.v_mapa_equipamentos with (security_invoker = true) as
select e.id as equipamento_id, e.codigo, e.descricao, e.tipo, e.marca, e.modelo, e.placa, e.ano, e.propriedade, e.status as status_erp, e.ativo,
       coalesce(m.no_mapa, false) as no_mapa,
       m.id as mapa_id, m.tipo_modelo_3d, m.fonte_posicao, m.heading, m.estado as estado_mapa, m.estado_desde,
       m.obra_id, m.trecho_id, m.frente_id, m.area_id, m.localidade_id, m.km_atual, m.operador_colaborador_id,
       m.deslocamento, m.quebra_descricao, m.observacao,
       m.conserto_motivo, m.conserto_previsao,
       lc.id as locacao_id, lc.fornecedor_id as locador_id, coalesce(fr.nome_fantasia, fr.razao_social) as locador_nome,
       lc.tipo_aluguel, lc.valor_unitario as locacao_valor_unitario, lc.inicio as locacao_inicio, lc.fim_previsto as locacao_fim_previsto,
       lc.medicao_inicio as locacao_medicao_inicio,
       case when lc.id is null then null
            when lc.tipo_aluguel = 'dia'  then lc.valor_unitario * ((now() at time zone 'America/Rio_Branco')::date - lc.inicio + 1)
            when lc.tipo_aluguel = 'mes'  then round(lc.valor_unitario * ((now() at time zone 'America/Rio_Branco')::date - lc.inicio + 1) / 30.0, 2)
            when lc.tipo_aluguel = 'hora' and lc.medicao_inicio is not null and um.medicao is not null and um.medicao >= lc.medicao_inicio
                                          then lc.valor_unitario * (um.medicao - lc.medicao_inicio)
       end as locacao_custo_estimado,
       extensions.st_y(m.posicao) as lat, extensions.st_x(m.posicao) as lng,
       case when e.status = 'fora_funcionamento' then 'fora_funcionamento'
            when e.status = 'em_manutencao'      then 'conserto'
            when m.estado = 'conserto'           then 'conserto'
            when m.posicao is null               then 'sem_posicao'
            else m.estado end as estado_efetivo,
       coalesce((select min(coalesce(os.data_inicio, os.data_abertura)) from public.ordens_servico os
          where os.equipamento_id = e.id and os.excluido_em is null and os.status = 'em_execucao'), m.conserto_entrada) as conserto_desde,
       (select count(*) from public.ordens_servico os
          where os.equipamento_id = e.id and os.excluido_em is null and os.status in ('aberta','em_execucao')) as os_abertas,
       (select max(cs.data) from public.combustivel_saidas cs where cs.equipamento_id = e.id and cs.excluido_em is null) as ultimo_abastecimento,
       um.medicao as ultima_medicao,
       o.nome as obra_nome, t.nome as trecho_nome, f.nome as frente_nome, l.nome as localidade_nome, a.nome as area_nome,
       c.nome as operador_nome,
       extract(day from now() - m.estado_desde)::int as dias_no_estado
from public.equipamentos e
left join public.mapa_equipamentos m on m.equipamento_id = e.id
left join public.mapa_locacoes lc on lc.id = m.locacao_id
left join public.fornecedores fr on fr.id = lc.fornecedor_id
left join lateral (
  select cs.medicao from public.combustivel_saidas cs
  where cs.equipamento_id = e.id and cs.excluido_em is null and cs.medicao is not null
  order by cs.data desc limit 1) um on true
left join public.obras o on o.id = m.obra_id
left join public.mapa_trechos t on t.id = m.trecho_id
left join public.mapa_frentes f on f.id = m.frente_id
left join public.localidades l on l.id = m.localidade_id
left join public.mapa_areas a on a.id = m.area_id
left join public.colaboradores c on c.id = m.operador_colaborador_id;

create or replace view public.v_mapa_tanques with (security_invoker = true) as
select t.id, t.nome, t.apelido, t.uso, t.capacidade_litros, t.nivel_atual_litros,
       case when t.capacidade_litros > 0 then round(100 * t.nivel_atual_litros / t.capacidade_litros, 1) end as percentual,
       t.minimo_alerta_litros, t.eh_externo, t.ativo,
       i.nome as insumo_nome,
       t.localidade_id, l.nome as localidade_nome, extensions.st_y(l.posicao) as lat_local, extensions.st_x(l.posicao) as lng_local,
       t.equipamento_id, e.codigo as equipamento_codigo,
       (t.minimo_alerta_litros is not null and t.nivel_atual_litros <= t.minimo_alerta_litros) as abaixo_minimo
from public.tanques t
left join public.insumos i on i.id = t.combustivel_atual_id
left join public.localidades l on l.id = t.localidade_id
left join public.equipamentos e on e.id = t.equipamento_id;

create or replace view public.v_mapa_carretas_em_rota with (security_invoker = true) as
select f.id as frete_id, f.data as data_saida, f.tipo, f.peso_toneladas, f.valor_total as valor_frete, f.valor_material as valor_carga,
       f.motorista, f.placa_carreta, f.transportadora_id, coalesce(tr.nome_fantasia, tr.razao_social) as transportadora_nome,
       ins.nome as material,
       lo.id as origem_id, lo.nome as origem_nome, extensions.st_y(lo.posicao) as origem_lat, extensions.st_x(lo.posicao) as origem_lng,
       ld.id as destino_id, ld.nome as destino_nome, extensions.st_y(ld.posicao) as destino_lat, extensions.st_x(ld.posicao) as destino_lng,
       r.tracado, r.km_mapa, r.horas_mapa,
       (f.data::timestamp + coalesce((select (valor #>> '{}')::time from public.configuracoes where chave = 'mapa.frete_hora_saida_padrao'), '06:00'::time))
         at time zone 'America/Rio_Branco' as saida_estimada,
       least(1.0, greatest(0.0,
         extract(epoch from (now() - ((f.data::timestamp + coalesce((select (valor #>> '{}')::time from public.configuracoes where chave = 'mapa.frete_hora_saida_padrao'), '06:00'::time)) at time zone 'America/Rio_Branco')))
         / nullif(coalesce(r.horas_mapa, 0) * 3600, 0))) as progresso,
       e.id as equipamento_id, e.codigo as equipamento_codigo
from public.fretes f
join public.localidades lo on lo.id = f.origem_localidade_id
join public.localidades ld on ld.id = f.destino_localidade_id
left join public.frete_rotas_tracado r on r.origem_localidade_id = f.origem_localidade_id and r.destino_localidade_id = f.destino_localidade_id
left join public.fornecedores tr on tr.id = f.transportadora_id
left join public.insumos ins on ins.id = f.insumo_id
left join lateral (
  select e.id, e.codigo from public.equipamentos e
  where f.placa_carreta is not null and f.placa_carreta <> ''
    and (upper(replace(e.placa, '-', '')) = upper(replace(f.placa_carreta, '-', ''))
         or e.descricao ilike '%' || f.placa_carreta || '%')
  order by e.placa is null limit 1) e on true
where f.data_chegada is null and f.excluido_em is null;

-- ---------------------------------------------------------------------
-- 8. Funções
-- ---------------------------------------------------------------------
create or replace function public.fn_mapa_exigir(p_acao text)
returns void language plpgsql stable security definer set search_path to '' as $$
begin
  if not public.tem_permissao('mapa.mapa', p_acao) then
    raise exception 'Sem permissão no Mapa (%)', p_acao using errcode = '42501';
  end if;
end $$;

-- km de um ponto ao longo de um trecho (proporcional ao traçado) e distância em metros
create or replace function public.fn_mapa_km_no_trecho(p_trecho uuid, p_lng double precision, p_lat double precision,
  out km numeric, out distancia_m double precision, out snap_lng double precision, out snap_lat double precision)
language sql stable security definer set search_path to '' as $$
  select round((t.km_inicial + (t.km_final - t.km_inicial) * extensions.st_linelocatepoint(t.tracado, p))::numeric, 3),
         extensions.st_distance(t.tracado::extensions.geography, p::extensions.geography),
         extensions.st_x(extensions.st_closestpoint(t.tracado, p)),
         extensions.st_y(extensions.st_closestpoint(t.tracado, p))
  from public.mapa_trechos t,
       lateral (select extensions.st_setsrid(extensions.st_makepoint(p_lng, p_lat), 4326) as p) q
  where t.id = p_trecho;
$$;

-- Resolve onde o ponto caiu: área ativa > trecho (snap) > local próximo > livre
create or replace function public.fn_mapa_resolver_destino(p_lng double precision, p_lat double precision)
returns jsonb language plpgsql stable security definer set search_path to '' as $$
declare
  v_p extensions.geometry := extensions.st_setsrid(extensions.st_makepoint(p_lng, p_lat), 4326);
  v_snap_tracado double precision := coalesce((select (valor #>> '{}')::double precision from public.configuracoes where chave = 'mapa.snap_tracado_m'), 300);
  v_snap_local   double precision := coalesce((select (valor #>> '{}')::double precision from public.configuracoes where chave = 'mapa.snap_local_m'), 300);
  r record;
begin
  -- 1. dentro de uma área ativa
  select a.id, a.tipo, a.obra_id, a.localidade_id, a.nome into r
  from public.v_mapa_areas a
  where a.ativo_efetivo and extensions.st_contains(a.poligono, v_p)
  order by extensions.st_area(a.poligono) limit 1;
  if found then
    return jsonb_build_object('tipo', 'area', 'area_id', r.id, 'area_tipo', r.tipo, 'obra_id', r.obra_id,
      'localidade_id', r.localidade_id, 'nome', r.nome,
      'estado', case when r.tipo = 'zona_oficina' then 'conserto'
                     when r.tipo in ('patio_obra','zona_patio_central','terreno') then 'parado' else 'operando' end,
      'lng', p_lng, 'lat', p_lat);
  end if;
  -- 2. perto de um trecho
  select t.id, t.obra_id, t.nome, k.km, k.distancia_m, k.snap_lng, k.snap_lat into r
  from public.mapa_trechos t
  cross join lateral public.fn_mapa_km_no_trecho(t.id, p_lng, p_lat) k
  where t.ativo and extensions.st_dwithin(t.tracado::extensions.geography, v_p::extensions.geography, v_snap_tracado)
  order by k.distancia_m limit 1;
  if found then
    return jsonb_build_object('tipo', 'trecho', 'trecho_id', r.id, 'obra_id', r.obra_id, 'nome', r.nome,
      'km', r.km, 'distancia_m', r.distancia_m, 'estado', 'operando', 'lng', r.snap_lng, 'lat', r.snap_lat);
  end if;
  -- 3. perto de um local
  select l.id, l.tipo, l.nome, l.obra_id, extensions.st_distance(l.posicao::extensions.geography, v_p::extensions.geography) as d into r
  from public.localidades l
  where l.ativo and l.posicao is not null
    and extensions.st_dwithin(l.posicao::extensions.geography, v_p::extensions.geography, v_snap_local)
  order by d limit 1;
  if found then
    return jsonb_build_object('tipo', 'localidade', 'localidade_id', r.id, 'localidade_tipo', r.tipo, 'nome', r.nome, 'obra_id', r.obra_id,
      'estado', case when r.tipo = 'oficina' then 'conserto' when r.tipo in ('patio','terreno') then 'parado' else 'operando' end,
      'lng', p_lng, 'lat', p_lat, 'distancia_m', r.d);
  end if;
  -- 4. livre
  return jsonb_build_object('tipo', 'livre', 'estado', null, 'lng', p_lng, 'lat', p_lat);
end $$;

-- Move 1..n equipamentos. p_destino: {lng, lat, estado?, frente_id?, trecho_id?, area_id?, localidade_id?, obra_id?}
-- Se vierem só lng/lat, o destino é resolvido pelo fn_mapa_resolver_destino. Grava alocação + movimentação. Não mexe em rateio.
create or replace function public.fn_mapa_mover_equipamentos(p_ids uuid[], p_destino jsonb, p_data date, p_motivo text)
returns int language plpgsql security definer set search_path to '' as $$
declare
  v_id uuid; v_n int := 0; v_bloqueio text;
  v_dest jsonb; v_estado text; v_antes jsonb; v_pos extensions.geometry; v_km numeric;
  v_frente uuid; v_trecho uuid; v_area uuid; v_local uuid; v_obra uuid;
begin
  perform public.fn_mapa_exigir('editar');
  if p_ids is null or array_length(p_ids, 1) is null then raise exception 'Nenhum equipamento informado'; end if;
  if p_destino->>'lng' is null or p_destino->>'lat' is null then raise exception 'Destino sem coordenada'; end if;

  v_dest := public.fn_mapa_resolver_destino((p_destino->>'lng')::double precision, (p_destino->>'lat')::double precision);
  v_trecho := coalesce((p_destino->>'trecho_id')::uuid, (v_dest->>'trecho_id')::uuid);
  v_area   := coalesce((p_destino->>'area_id')::uuid, (v_dest->>'area_id')::uuid);
  v_local  := coalesce((p_destino->>'localidade_id')::uuid, (v_dest->>'localidade_id')::uuid);
  v_obra   := coalesce((p_destino->>'obra_id')::uuid, (v_dest->>'obra_id')::uuid);
  v_frente := (p_destino->>'frente_id')::uuid;
  v_estado := coalesce(p_destino->>'estado', v_dest->>'estado');
  if v_estado is null then raise exception 'Fora de qualquer zona: informe o estado (operando, parado ou em_rota)'; end if;
  if v_estado not in ('operando','parado','em_rota','quebrado_obra','conserto') then raise exception 'Estado inválido: %', v_estado; end if;
  v_pos := extensions.st_setsrid(extensions.st_makepoint(coalesce((v_dest->>'lng')::double precision, (p_destino->>'lng')::double precision),
                                                         coalesce((v_dest->>'lat')::double precision, (p_destino->>'lat')::double precision)), 4326);
  v_km := (v_dest->>'km')::numeric;

  -- frente do dia no trecho, se não veio explícita
  if v_frente is null and v_trecho is not null then
    select f.id into v_frente from public.mapa_frentes f
    where f.trecho_id = v_trecho and f.data = coalesce(p_data, (now() at time zone 'America/Rio_Branco')::date)
      and (v_km is null or f.km_inicial is null or f.km_final is null or v_km between least(f.km_inicial, f.km_final) and greatest(f.km_inicial, f.km_final))
    order by f.created_at desc limit 1;
  end if;
  if v_obra is null and v_frente is not null then select obra_id into v_obra from public.mapa_frentes where id = v_frente; end if;

  foreach v_id in array p_ids loop
    v_bloqueio := public.fn_mapa_motivo_fora_do_mapa(v_id);
    if v_bloqueio is not null then raise exception '%', v_bloqueio; end if;
    select to_jsonb(m) into v_antes from public.mapa_equipamentos m where m.equipamento_id = v_id;
    if v_antes is null then
      insert into public.mapa_equipamentos (equipamento_id) values (v_id);
      v_antes := '{}'::jsonb;
    end if;
    if (v_antes->>'fonte_posicao') = 'gps' then
      raise exception 'Equipamento % tem posição por GPS: não pode ser arrastado', v_id;
    end if;
    update public.mapa_equipamentos m set
      no_mapa = true,
      posicao = v_pos, estado = v_estado,
      estado_desde = case when m.estado is distinct from v_estado then now() else m.estado_desde end,
      obra_id = v_obra, trecho_id = v_trecho, frente_id = v_frente, area_id = v_area, localidade_id = v_local,
      km_atual = v_km, quebra_descricao = case when v_estado = 'quebrado_obra' then m.quebra_descricao end,
      deslocamento = case when v_estado = 'em_rota' then coalesce(p_destino->'deslocamento', m.deslocamento) end,
      conserto_motivo   = case when v_estado = 'conserto' then coalesce(p_destino->>'conserto_motivo', m.conserto_motivo, p_motivo) end,
      conserto_entrada  = case when v_estado = 'conserto' then coalesce(m.conserto_entrada, p_data, (now() at time zone 'America/Rio_Branco')::date) end,
      conserto_previsao = case when v_estado = 'conserto' then coalesce((p_destino->>'conserto_previsao')::date, m.conserto_previsao) end,
      updated_by = auth.uid()
    where m.equipamento_id = v_id;
    insert into public.mapa_movimentacoes (tipo, alvo, alvo_id, de, para, motivo, data_efetiva)
    values ('transferencia', 'equipamento', v_id,
            jsonb_build_object('obra_id', v_antes->'obra_id', 'trecho_id', v_antes->'trecho_id', 'frente_id', v_antes->'frente_id',
                               'area_id', v_antes->'area_id', 'localidade_id', v_antes->'localidade_id', 'estado', v_antes->'estado', 'km', v_antes->'km_atual'),
            v_dest || jsonb_build_object('obra_id', v_obra, 'trecho_id', v_trecho, 'frente_id', v_frente, 'area_id', v_area,
                                         'localidade_id', v_local, 'estado', v_estado, 'km', v_km),
            p_motivo, coalesce(p_data, (now() at time zone 'America/Rio_Branco')::date));
    v_n := v_n + 1;
  end loop;
  return v_n;
end $$;

-- Mudança de estado pelo clique: conserto (vai para a oficina), quebrado_obra, parado, operando, em_rota (manual).
-- Conserto também pode vir da OS em execução do Manutenção (equipamentos.status = em_manutencao); os dois convivem na view.
create or replace function public.fn_mapa_marcar_estado(p_id uuid, p_estado text, p_motivo text, p_descricao text default null, p_deslocamento jsonb default null, p_previsao date default null)
returns void language plpgsql security definer set search_path to '' as $$
declare v_antes jsonb; v_oficina extensions.geometry; v_oficina_local uuid; v_oficina_area uuid; v_bloqueio text;
begin
  perform public.fn_mapa_exigir('editar');
  if p_estado not in ('operando','parado','em_rota','quebrado_obra','conserto') then
    raise exception 'Estado inválido: %', p_estado;
  end if;
  v_bloqueio := public.fn_mapa_motivo_fora_do_mapa(p_id);
  if v_bloqueio is not null then raise exception '%', v_bloqueio; end if;
  select to_jsonb(m) into v_antes from public.mapa_equipamentos m where m.equipamento_id = p_id;
  if v_antes is null then
    insert into public.mapa_equipamentos (equipamento_id) values (p_id);
    v_antes := '{}'::jsonb;
  end if;
  if p_estado = 'conserto' then
    -- posição da oficina: zona desenhada > local tipo oficina > pátio central (Colorado)
    select a.id, extensions.st_centroid(a.poligono) into v_oficina_area, v_oficina
      from public.mapa_areas a where a.tipo = 'zona_oficina' and a.ativo order by a.created_at limit 1;
    if v_oficina is null then
      select l.id, l.posicao into v_oficina_local, v_oficina from public.localidades l
       where l.ativo and l.posicao is not null and l.tipo in ('oficina','patio')
       order by (l.tipo = 'oficina') desc, (l.nome = 'Colorado') desc, l.nome limit 1;
    end if;
  end if;
  update public.mapa_equipamentos m set
    estado = p_estado,
    estado_desde = case when m.estado is distinct from p_estado then now() else m.estado_desde end,
    quebra_descricao = case when p_estado = 'quebrado_obra' then p_descricao end,
    deslocamento = case when p_estado = 'em_rota' then coalesce(p_deslocamento, m.deslocamento) end,
    conserto_motivo   = case when p_estado = 'conserto' then coalesce(p_descricao, p_motivo) end,
    conserto_entrada  = case when p_estado = 'conserto' then coalesce(case when m.estado = 'conserto' then m.conserto_entrada end, (now() at time zone 'America/Rio_Branco')::date) end,
    conserto_previsao = case when p_estado = 'conserto' then coalesce(p_previsao, case when m.estado = 'conserto' then m.conserto_previsao end) end,
    posicao       = case when p_estado = 'conserto' and v_oficina is not null then v_oficina else m.posicao end,
    area_id       = case when p_estado = 'conserto' and v_oficina is not null then v_oficina_area else m.area_id end,
    localidade_id = case when p_estado = 'conserto' and v_oficina is not null then v_oficina_local else m.localidade_id end,
    trecho_id     = case when p_estado = 'conserto' then null else m.trecho_id end,
    frente_id     = case when p_estado = 'conserto' then null else m.frente_id end,
    km_atual      = case when p_estado = 'conserto' then null else m.km_atual end,
    updated_by = auth.uid()
  where m.equipamento_id = p_id;
  insert into public.mapa_movimentacoes (tipo, alvo, alvo_id, de, para, motivo)
  values ('estado', 'equipamento', p_id, jsonb_build_object('estado', v_antes->'estado'),
          jsonb_build_object('estado', p_estado, 'descricao', p_descricao, 'previsao', p_previsao, 'deslocamento', p_deslocamento), p_motivo);
end $$;

-- Assinala (ou tira) o operador de um equipamento
create or replace function public.fn_mapa_assinalar_operador(p_equipamento uuid, p_colaborador uuid, p_motivo text default null)
returns void language plpgsql security definer set search_path to '' as $$
declare v_antes uuid;
begin
  perform public.fn_mapa_exigir('editar');
  insert into public.mapa_equipamentos (equipamento_id) values (p_equipamento) on conflict (equipamento_id) do nothing;
  select operador_colaborador_id into v_antes from public.mapa_equipamentos where equipamento_id = p_equipamento;
  update public.mapa_equipamentos set operador_colaborador_id = p_colaborador, updated_by = auth.uid() where equipamento_id = p_equipamento;
  if p_colaborador is not null then
    insert into public.mapa_colaboradores (colaborador_id) values (p_colaborador) on conflict (colaborador_id) do nothing;
    -- tira a pessoa de outro equipamento e cola nesse
    update public.mapa_equipamentos set operador_colaborador_id = null where operador_colaborador_id = p_colaborador and equipamento_id <> p_equipamento;
    update public.mapa_colaboradores c set equipamento_id = p_equipamento,
      obra_id = coalesce(m.obra_id, c.obra_id), frente_id = coalesce(m.frente_id, c.frente_id), updated_by = auth.uid()
    from public.mapa_equipamentos m where m.equipamento_id = p_equipamento and c.colaborador_id = p_colaborador;
  end if;
  if v_antes is not null and v_antes is distinct from p_colaborador then
    update public.mapa_colaboradores set equipamento_id = null where colaborador_id = v_antes and equipamento_id = p_equipamento;
  end if;
  insert into public.mapa_movimentacoes (tipo, alvo, alvo_id, de, para, motivo)
  values ('operador', 'equipamento', p_equipamento, jsonb_build_object('colaborador_id', v_antes), jsonb_build_object('colaborador_id', p_colaborador), p_motivo);
end $$;

-- Move pessoas. p_destino: {frente_id?, obra_id?, equipe_id?, equipamento_id?, area_id?, localidade_id?, lng?, lat?}
create or replace function public.fn_mapa_mover_colaboradores(p_ids uuid[], p_destino jsonb, p_data date, p_motivo text)
returns int language plpgsql security definer set search_path to '' as $$
declare v_id uuid; v_n int := 0; v_antes jsonb; v_obra uuid; v_frente uuid; v_equipe uuid;
begin
  perform public.fn_mapa_exigir('editar');
  if p_destino ? 'equipamento_id' and (p_destino->>'equipamento_id') is not null then
    foreach v_id in array p_ids loop
      perform public.fn_mapa_assinalar_operador((p_destino->>'equipamento_id')::uuid, v_id, p_motivo);
      v_n := v_n + 1;
    end loop;
    return v_n;
  end if;
  v_frente := (p_destino->>'frente_id')::uuid;
  v_equipe := (p_destino->>'equipe_id')::uuid;
  v_obra   := (p_destino->>'obra_id')::uuid;
  if v_obra is null and v_frente is not null then select obra_id into v_obra from public.mapa_frentes where id = v_frente; end if;
  if v_obra is null and v_equipe is not null then select obra_id into v_obra from public.mapa_equipes where id = v_equipe; end if;
  if v_frente is null and v_equipe is not null then select frente_id into v_frente from public.mapa_equipes where id = v_equipe; end if;
  foreach v_id in array p_ids loop
    insert into public.mapa_colaboradores (colaborador_id) values (v_id) on conflict (colaborador_id) do nothing;
    select to_jsonb(c) into v_antes from public.mapa_colaboradores c where c.colaborador_id = v_id;
    update public.mapa_colaboradores c set
      obra_id = coalesce(v_obra, c.obra_id), frente_id = v_frente, equipe_id = coalesce(v_equipe, c.equipe_id),
      area_id = (p_destino->>'area_id')::uuid, localidade_id = (p_destino->>'localidade_id')::uuid,
      equipamento_id = null,
      posicao_manual = case when p_destino->>'lng' is not null
        then extensions.st_setsrid(extensions.st_makepoint((p_destino->>'lng')::double precision, (p_destino->>'lat')::double precision), 4326) end,
      updated_by = auth.uid()
    where c.colaborador_id = v_id;
    update public.mapa_equipamentos set operador_colaborador_id = null where operador_colaborador_id = v_id;
    insert into public.mapa_movimentacoes (tipo, alvo, alvo_id, de, para, motivo, data_efetiva)
    values ('transferencia', 'colaborador', v_id,
            jsonb_build_object('obra_id', v_antes->'obra_id', 'frente_id', v_antes->'frente_id', 'equipe_id', v_antes->'equipe_id', 'equipamento_id', v_antes->'equipamento_id'),
            jsonb_build_object('obra_id', v_obra, 'frente_id', v_frente, 'equipe_id', v_equipe),
            p_motivo, coalesce(p_data, (now() at time zone 'America/Rio_Branco')::date));
    v_n := v_n + 1;
  end loop;
  return v_n;
end $$;

-- Área (polígono GeoJSON). Pátio de obra / jazida / canteiro / edificação exigem obra ativa.
create or replace function public.fn_mapa_area_salvar(p_id uuid, p_tipo text, p_nome text, p_obra uuid, p_localidade uuid, p_geojson jsonb, p_atributos jsonb default '{}'::jsonb)
returns uuid language plpgsql security definer set search_path to '' as $$
declare v_id uuid; v_geom extensions.geometry;
begin
  perform public.fn_mapa_exigir(case when p_id is null then 'criar' else 'editar' end);
  v_geom := extensions.st_setsrid(extensions.st_geomfromgeojson(p_geojson::text), 4326);
  if extensions.geometrytype(v_geom) <> 'POLYGON' then raise exception 'A área precisa ser um polígono'; end if;
  if not extensions.st_isvalid(v_geom) then v_geom := extensions.st_makevalid(v_geom); end if;
  if p_tipo in ('patio_obra','jazida','canteiro','edificacao') then
    if p_obra is null then raise exception 'Informe a obra'; end if;
    if not exists (select 1 from public.obras o where o.id = p_obra and o.ativo) then
      raise exception 'A obra precisa estar ativa para receber %', p_tipo;
    end if;
  end if;
  if p_id is null then
    insert into public.mapa_areas (tipo, nome, obra_id, localidade_id, poligono, atributos)
    values (p_tipo, p_nome, p_obra, p_localidade, v_geom, coalesce(p_atributos, '{}'::jsonb)) returning id into v_id;
  else
    update public.mapa_areas set tipo = p_tipo, nome = p_nome, obra_id = p_obra, localidade_id = p_localidade,
      poligono = v_geom, atributos = coalesce(p_atributos, atributos) where id = p_id returning id into v_id;
  end if;
  return v_id;
end $$;

-- Trecho (LineString GeoJSON)
create or replace function public.fn_mapa_trecho_salvar(p_id uuid, p_obra uuid, p_nome text, p_rodovia text, p_km_inicial numeric, p_km_final numeric, p_geojson jsonb, p_trecho_pai uuid default null, p_cor text default null)
returns uuid language plpgsql security definer set search_path to '' as $$
declare v_id uuid; v_geom extensions.geometry;
begin
  perform public.fn_mapa_exigir(case when p_id is null then 'criar' else 'editar' end);
  v_geom := extensions.st_setsrid(extensions.st_geomfromgeojson(p_geojson::text), 4326);
  if extensions.geometrytype(v_geom) = 'MULTILINESTRING' then v_geom := extensions.st_linemerge(v_geom); end if;
  if extensions.geometrytype(v_geom) <> 'LINESTRING' then raise exception 'O traçado precisa ser uma linha contínua'; end if;
  if p_id is null then
    insert into public.mapa_trechos (obra_id, trecho_pai_id, nome, rodovia, km_inicial, km_final, tracado, cor)
    values (p_obra, p_trecho_pai, p_nome, p_rodovia, p_km_inicial, p_km_final, v_geom, p_cor) returning id into v_id;
  else
    update public.mapa_trechos set obra_id = p_obra, trecho_pai_id = p_trecho_pai, nome = p_nome, rodovia = p_rodovia,
      km_inicial = p_km_inicial, km_final = p_km_final, tracado = v_geom, cor = coalesce(p_cor, cor) where id = p_id returning id into v_id;
  end if;
  return v_id;
end $$;

-- Frente do dia
create or replace function public.fn_mapa_frente_salvar(p_id uuid, p_obra uuid, p_trecho uuid, p_area uuid, p_data date, p_nome text, p_servico text, p_km_inicial numeric, p_km_final numeric, p_geojson jsonb default null, p_observacao text default null)
returns uuid language plpgsql security definer set search_path to '' as $$
declare v_id uuid; v_geom extensions.geometry;
begin
  perform public.fn_mapa_exigir(case when p_id is null then 'criar' else 'editar' end);
  if p_geojson is not null then
    v_geom := extensions.st_setsrid(extensions.st_geomfromgeojson(p_geojson::text), 4326);
  elsif p_trecho is not null and p_km_inicial is not null and p_km_final is not null then
    -- recorta o trecho entre os km informados (proporcional ao traçado)
    select extensions.st_linesubstring(t.tracado,
             least(1, greatest(0, (least(p_km_inicial, p_km_final) - least(t.km_inicial, t.km_final)) / nullif(abs(t.km_final - t.km_inicial), 0))),
             least(1, greatest(0, (greatest(p_km_inicial, p_km_final) - least(t.km_inicial, t.km_final)) / nullif(abs(t.km_final - t.km_inicial), 0))))
      into v_geom from public.mapa_trechos t where t.id = p_trecho;
  end if;
  if p_id is null then
    insert into public.mapa_frentes (obra_id, trecho_id, area_id, data, nome, servico, km_inicial, km_final, geometria, observacao)
    values (p_obra, p_trecho, p_area, p_data, p_nome, p_servico, p_km_inicial, p_km_final, v_geom, p_observacao) returning id into v_id;
  else
    update public.mapa_frentes set obra_id = p_obra, trecho_id = p_trecho, area_id = p_area, data = p_data, nome = p_nome, servico = p_servico,
      km_inicial = p_km_inicial, km_final = p_km_final, geometria = coalesce(v_geom, geometria), observacao = p_observacao
    where id = p_id returning id into v_id;
  end if;
  insert into public.mapa_movimentacoes (tipo, alvo, alvo_id, para, data_efetiva)
  values ('frente', 'equipe', v_id, jsonb_build_object('frente_id', v_id, 'obra_id', p_obra, 'nome', p_nome, 'km_inicial', p_km_inicial, 'km_final', p_km_final), p_data);
  return v_id;
end $$;

-- "Repetir ontem": copia as frentes de uma data para outra, mantendo as máquinas e equipes apontadas para as novas frentes
create or replace function public.fn_mapa_frentes_repetir(p_de date, p_para date)
returns int language plpgsql security definer set search_path to '' as $$
declare r record; v_novo uuid; v_n int := 0;
begin
  perform public.fn_mapa_exigir('criar');
  for r in select * from public.mapa_frentes where data = p_de loop
    insert into public.mapa_frentes (obra_id, trecho_id, area_id, data, nome, servico, km_inicial, km_final, geometria, observacao)
    values (r.obra_id, r.trecho_id, r.area_id, p_para, r.nome, r.servico, r.km_inicial, r.km_final, r.geometria, r.observacao) returning id into v_novo;
    update public.mapa_equipamentos set frente_id = v_novo where frente_id = r.id;
    update public.mapa_colaboradores set frente_id = v_novo where frente_id = r.id;
    update public.mapa_equipes set frente_id = v_novo where frente_id = r.id;
    v_n := v_n + 1;
  end loop;
  return v_n;
end $$;

-- Status do dia de cada pessoa: presença assumida, exceções de mapa_excecoes_dia, férias de rh_ferias, afastamento de rh_ocorrencias
create or replace function public.fn_mapa_pessoas_dia(p_data date default null)
returns table (colaborador_id uuid, nome text, vinculo text, funcao text, valor_diaria numeric, obra_id uuid, frente_id uuid, equipe_id uuid,
               equipamento_id uuid, status_dia text, observacao text)
language sql stable security definer set search_path to '' as $$
  with d as (select coalesce(p_data, (now() at time zone 'America/Rio_Branco')::date) as dia)
  select c.id, c.nome, c.vinculo, f.nome, c.valor_diaria,
         coalesce(mc.obra_id, c.obra_id), mc.frente_id, mc.equipe_id, mc.equipamento_id,
         case
           when ex.tipo is not null then ex.tipo
           when exists (select 1 from public.rh_ferias fe where fe.colaborador_id = c.id and d.dia between fe.data_inicio and fe.data_fim
                        and coalesce(fe.status, '') not in ('cancelada','rejeitada')) then 'ferias'
           when exists (select 1 from public.rh_ocorrencias oc where oc.colaborador_id = c.id and oc.tipo in ('atestado','acidente','suspensao')
                        and d.dia between oc.data and coalesce(oc.data_fim, oc.data)) then 'afastado'
           when c.vinculo = 'diarista' and exists (select 1 from public.rh_diarias rd where rd.colaborador_id = c.id
                        and d.dia = any (rd.dias_falta)) then 'falta'
           else 'presente'
         end,
         ex.observacao
  from d
  cross join public.colaboradores c
  left join public.funcoes f on f.id = c.funcao_id
  left join public.mapa_colaboradores mc on mc.colaborador_id = c.id
  left join public.mapa_excecoes_dia ex on ex.colaborador_id = c.id and ex.data = d.dia
  where c.ativo and (c.data_demissao is null or c.data_demissao >= d.dia)
    and (auth.uid() is null or public.tem_permissao('mapa.mapa', 'ver'));  -- auth.uid() nulo = cron (foto diária)
$$;

-- Indicadores financeiros da obra (receita x custo) a partir dos rateios por centro de custo
create or replace function public.fn_mapa_obra_indicadores(p_obra uuid, p_mes date default null)
returns jsonb language sql stable security definer set search_path to '' as $$
  with m as (select date_trunc('month', coalesce(p_mes, (now() at time zone 'America/Rio_Branco')::date))::date as mes),
  raiz as (select c.id from public.centros_custo c where c.obra_id = p_obra and c.pai_id is null limit 1),
  sub as (select s.id from raiz, public.fn_centro_custo_subarvore(raiz.id) s),
  r as (
    select l.tipo, v.mes_competencia, v.valor
    from public.vw_custo_rateios v
    join public.lancamentos l on l.id = v.lancamento_id
    where v.centro_custo_id in (select id from sub) and coalesce(l.status, '') <> 'cancelado'
  )
  select jsonb_build_object(
    'obra_id', p_obra,
    'mes', (select mes from m),
    'receita_acumulada', coalesce((select sum(valor) from r where tipo = 'a_receber'), 0),
    'custo_acumulado',   coalesce((select sum(valor) from r where tipo = 'a_pagar'), 0),
    'receita_mes',       coalesce((select sum(valor) from r, m where tipo = 'a_receber' and r.mes_competencia = m.mes), 0),
    'custo_mes',         coalesce((select sum(valor) from r, m where tipo = 'a_pagar' and r.mes_competencia = m.mes), 0),
    'serie', (select coalesce(jsonb_agg(jsonb_build_object('mes', mes_competencia, 'receita', rec, 'custo', cus) order by mes_competencia), '[]'::jsonb)
              from (select mes_competencia, coalesce(sum(valor) filter (where tipo = 'a_receber'), 0) rec, coalesce(sum(valor) filter (where tipo = 'a_pagar'), 0) cus
                    from r group by mes_competencia) s)
  )
  where public.tem_permissao('mapa.mapa', 'ver');
$$;

-- Foto do dia
create or replace function public.fn_mapa_snapshot(p_data date default null)
returns uuid language plpgsql security definer set search_path to '' as $$
declare v_data date := coalesce(p_data, (now() at time zone 'America/Rio_Branco')::date); v_id uuid; v_estado jsonb;
begin
  if auth.uid() is not null then perform public.fn_mapa_exigir('ver'); end if;  -- cron roda sem usuário
  v_estado := jsonb_build_object(
    'equipamentos', (select coalesce(jsonb_agg(to_jsonb(v)), '[]'::jsonb) from public.v_mapa_equipamentos v where v.ativo and v.no_mapa),
    'pessoas',      (select coalesce(jsonb_agg(to_jsonb(p)), '[]'::jsonb) from public.fn_mapa_pessoas_dia(v_data) p),
    'frentes',      (select coalesce(jsonb_agg(to_jsonb(f) - 'geometria'), '[]'::jsonb) from public.mapa_frentes f where f.data = v_data),
    'equipes',      (select coalesce(jsonb_agg(to_jsonb(e)), '[]'::jsonb) from public.mapa_equipes e where e.ativo),
    'carretas',     (select coalesce(jsonb_agg(to_jsonb(c) - 'tracado'), '[]'::jsonb) from public.v_mapa_carretas_em_rota c),
    'tanques',      (select coalesce(jsonb_agg(to_jsonb(t)), '[]'::jsonb) from public.v_mapa_tanques t where t.ativo),
    'gerado_em',    now());
  insert into public.mapa_snapshots (data, estado, gerado_por) values (v_data, v_estado, auth.uid())
  on conflict (data) do update set estado = excluded.estado, gerado_em = now(), gerado_por = excluded.gerado_por
  returning id into v_id;
  -- diárias do dia: diarista presente e alocado numa obra
  insert into public.mapa_diarias (colaborador_id, data, obra_id, valor)
  select p.colaborador_id, v_data, p.obra_id, coalesce(p.valor_diaria, 0)
  from public.fn_mapa_pessoas_dia(v_data) p
  where p.vinculo = 'diarista' and p.status_dia = 'presente' and p.obra_id is not null
  on conflict (colaborador_id, data) do nothing;
  return v_id;
end $$;

-- Marca diárias como pagas (ou desfaz). Não gera lançamento no Financeiro.
create or replace function public.fn_mapa_diarias_marcar(p_ids uuid[], p_pago boolean, p_obs text default null, p_data date default null)
returns int language plpgsql security definer set search_path to '' as $$
declare v_n int;
begin
  perform public.fn_mapa_exigir('editar');
  update public.mapa_diarias set pago = p_pago,
    pago_em = case when p_pago then coalesce(p_data, (now() at time zone 'America/Rio_Branco')::date) end,
    pago_obs = case when p_pago then p_obs end
  where id = any (p_ids);
  get diagnostics v_n = row_count;
  return v_n;
end $$;

-- Diária avulsa (dia que o mapa não fotografou) ou correção
create or replace function public.fn_mapa_diaria_salvar(p_colaborador uuid, p_data date, p_obra uuid, p_valor numeric)
returns uuid language plpgsql security definer set search_path to '' as $$
declare v_id uuid;
begin
  perform public.fn_mapa_exigir('editar');
  insert into public.mapa_diarias (colaborador_id, data, obra_id, valor, origem)
  values (p_colaborador, p_data, p_obra, coalesce(p_valor, (select valor_diaria from public.colaboradores where id = p_colaborador), 0), 'manual')
  on conflict (colaborador_id, data) do update set obra_id = excluded.obra_id, valor = excluded.valor
  returning id into v_id;
  return v_id;
end $$;

-- Resumo mensal de diárias por diarista: contadas, valor, pagas, a pagar (e o que o RH lançou no mês)
create or replace function public.fn_mapa_rel_diarias_mes(p_mes date)
returns table (colaborador_id uuid, nome text, qtd int, valor numeric, pagas int, valor_pago numeric, a_pagar numeric, rh_qtd numeric)
language sql stable security definer set search_path to '' as $$
  select c.id, c.nome, count(d.id)::int, coalesce(sum(d.valor), 0), count(d.id) filter (where d.pago)::int,
         coalesce(sum(d.valor) filter (where d.pago), 0), coalesce(sum(d.valor) filter (where not d.pago), 0),
         coalesce((select sum(rd.qtd_diarias) from public.rh_diarias rd where rd.colaborador_id = c.id and rd.competencia = date_trunc('month', p_mes)::date), 0)
  from public.colaboradores c
  left join public.mapa_diarias d on d.colaborador_id = c.id
   and d.data >= date_trunc('month', p_mes)::date and d.data < (date_trunc('month', p_mes) + interval '1 month')::date
  where c.vinculo = 'diarista' and public.tem_permissao('mapa.mapa', 'ver')
  group by c.id, c.nome
  having count(d.id) > 0 or exists (select 1 from public.rh_diarias rd where rd.colaborador_id = c.id and rd.competencia = date_trunc('month', p_mes)::date)
  order by c.nome;
$$;

-- Alertas (idempotente: abre o que falta, fecha o que resolveu)
create or replace function public.fn_mapa_alertas_recalcular()
returns int language plpgsql security definer set search_path to '' as $$
declare
  v_dias int := coalesce((select (valor #>> '{}')::int from public.configuracoes where chave = 'mapa.dias_parado_alerta'), 7);
  v_horas numeric := coalesce((select (valor #>> '{}')::numeric from public.configuracoes where chave = 'mapa.frete_horas_max'), 12);
  v_loc int := coalesce((select (valor #>> '{}')::int from public.configuracoes where chave = 'mapa.locacao_dias_aviso'), 15);
  v_n int := 0;
begin
  drop table if exists _alvo;
  create temp table _alvo (tipo text, alvo text, alvo_id uuid, mensagem text, dados jsonb) on commit drop;
  insert into _alvo
  select 'parado_patio', 'equipamento', v.equipamento_id,
         format('%s parado há %s dias', coalesce(v.codigo, v.descricao), v.dias_no_estado), jsonb_build_object('dias', v.dias_no_estado)
  from public.v_mapa_equipamentos v where v.ativo and v.no_mapa and v.estado_efetivo = 'parado' and v.dias_no_estado >= v_dias
  union all
  select 'quebrado_obra', 'equipamento', v.equipamento_id, format('%s quebrado na obra', coalesce(v.codigo, v.descricao)), '{}'::jsonb
  from public.v_mapa_equipamentos v where v.ativo and v.no_mapa and v.estado_efetivo = 'quebrado_obra'
  union all
  select 'tanque_minimo', 'tanque', t.id, format('%s abaixo do mínimo (%s L)', t.nome, t.nivel_atual_litros), jsonb_build_object('nivel', t.nivel_atual_litros)
  from public.v_mapa_tanques t where t.ativo and t.abaixo_minimo
  union all
  select 'locacao_vencendo', 'equipamento', lc.equipamento_id,
         format('Locação de %s (%s) vence em %s', coalesce(e.codigo, e.descricao), coalesce(fr.nome_fantasia, fr.razao_social), to_char(lc.fim_previsto, 'DD/MM/YYYY')),
         jsonb_build_object('fim_previsto', lc.fim_previsto, 'locacao_id', lc.id)
  from public.mapa_locacoes lc
  join public.equipamentos e on e.id = lc.equipamento_id
  left join public.fornecedores fr on fr.id = lc.fornecedor_id
  where lc.fim is null and lc.fim_previsto is not null and lc.fim_previsto <= (now() at time zone 'America/Rio_Branco')::date + v_loc
  union all
  select 'conserto_atrasado', 'equipamento', v.equipamento_id,
         format('%s em conserto além da previsão (%s)', coalesce(v.codigo, v.descricao), to_char(v.conserto_previsao, 'DD/MM')), jsonb_build_object('previsao', v.conserto_previsao)
  from public.v_mapa_equipamentos v where v.ativo and v.no_mapa and v.estado_efetivo = 'conserto' and v.conserto_previsao is not null and v.conserto_previsao < (now() at time zone 'America/Rio_Branco')::date
  union all
  select 'diarias_a_pagar', 'empresa', null::uuid,
         format('Diárias a pagar: R$ %s', to_char(s.total, 'FM999G999G990D00')), jsonb_build_object('total', s.total, 'qtd', s.qtd)
  from (select sum(valor) total, count(*) qtd from public.mapa_diarias where not pago) s
  where s.total > coalesce((select (valor #>> '{}')::numeric from public.configuracoes where chave = 'mapa.diarias_valor_max'), 20000)
  union all
  select 'frete_sem_chegada', 'frete', c.frete_id,
         format('Carreta %s saiu %s de %s e não registrou chegada', coalesce(c.placa_carreta, '?'), to_char(c.data_saida, 'DD/MM'), c.origem_nome), '{}'::jsonb
  from public.v_mapa_carretas_em_rota c
  where c.horas_mapa is not null and now() > c.saida_estimada + ((c.horas_mapa + v_horas) || ' hours')::interval;

  insert into public.mapa_alertas (tipo, alvo, alvo_id, mensagem, dados)
  select a.tipo, a.alvo, a.alvo_id, a.mensagem, a.dados from _alvo a
  where not exists (select 1 from public.mapa_alertas x where x.tipo = a.tipo and x.alvo = a.alvo and x.alvo_id is not distinct from a.alvo_id and x.resolvido_em is null);
  get diagnostics v_n = row_count;
  update public.mapa_alertas x set resolvido_em = now()
  where x.resolvido_em is null
    and not exists (select 1 from _alvo a where a.tipo = x.tipo and a.alvo = x.alvo and a.alvo_id is not distinct from x.alvo_id);
  return v_n;
end $$;

-- Relatório mensal por equipamento (dias por obra e por estado), a partir das fotos diárias
create or replace function public.fn_mapa_rel_equipamentos_mes(p_mes date)
returns table (equipamento_id uuid, codigo text, descricao text, obra_id uuid, obra_nome text, estado text, dias int)
language sql stable security definer set search_path to '' as $$
  select (e->>'equipamento_id')::uuid, e->>'codigo', e->>'descricao', (e->>'obra_id')::uuid, e->>'obra_nome', e->>'estado_efetivo', count(*)::int
  from public.mapa_snapshots s, jsonb_array_elements(s.estado->'equipamentos') e
  where s.data >= date_trunc('month', p_mes)::date and s.data < (date_trunc('month', p_mes) + interval '1 month')::date
    and public.tem_permissao('mapa.historico', 'ver')
  group by 1,2,3,4,5,6 order by 2, 7 desc;
$$;

-- Relatório mensal por pessoa (dias por obra e status)
create or replace function public.fn_mapa_rel_pessoas_mes(p_mes date)
returns table (colaborador_id uuid, nome text, vinculo text, obra_id uuid, status_dia text, dias int, valor_diaria numeric)
language sql stable security definer set search_path to '' as $$
  select (p->>'colaborador_id')::uuid, p->>'nome', p->>'vinculo', (p->>'obra_id')::uuid, p->>'status_dia', count(*)::int, max((p->>'valor_diaria')::numeric)
  from public.mapa_snapshots s, jsonb_array_elements(s.estado->'pessoas') p
  where s.data >= date_trunc('month', p_mes)::date and s.data < (date_trunc('month', p_mes) + interval '1 month')::date
    and public.tem_permissao('mapa.historico', 'ver')
  group by 1,2,3,4,5 order by 2, 6 desc;
$$;

-- Locação: coloca no mapa uma máquina da Colorado ou de terceiro (ou cadastra uma nova alugada).
-- Pergunta obrigatória do app: fornecedor, tipo de máquina, tipo de aluguel (hora/dia/mês) e valor unitário.
-- p_equipamento: existente (propriedade colorado/alugada) ou nulo com p_novo = {codigo?, descricao, tipo, marca?, modelo?, placa?, ano?, controle_por?}.
-- p_destino: {lng, lat, ...} opcional; se vier, já posiciona (mesma regra do arraste). Retorna o id da locação.
create or replace function public.fn_mapa_locacao_iniciar(
  p_equipamento uuid, p_fornecedor uuid, p_tipo_aluguel text, p_valor_unitario numeric,
  p_inicio date default null, p_destino jsonb default null, p_fim_previsto date default null,
  p_medicao_inicio numeric default null, p_observacao text default null, p_novo jsonb default null)
returns uuid language plpgsql security definer set search_path to '' as $$
declare
  v_eq uuid := p_equipamento; v_loc uuid; v_inicio date := coalesce(p_inicio, (now() at time zone 'America/Rio_Branco')::date);
  v_codigo text; v_n int; r record;
begin
  perform public.fn_mapa_exigir('editar');
  if p_tipo_aluguel is null or p_tipo_aluguel not in ('hora','dia','mes') then raise exception 'Tipo de aluguel inválido: use hora, dia ou mes'; end if;
  if p_valor_unitario is null or p_valor_unitario < 0 then raise exception 'Informe o valor unitário do aluguel'; end if;
  if p_fornecedor is null or not exists (select 1 from public.fornecedores f where f.id = p_fornecedor and f.ativo) then
    raise exception 'Informe o fornecedor do aluguel (cadastro de fornecedores, ativo)';
  end if;
  if p_fim_previsto is not null and p_fim_previsto < v_inicio then raise exception 'Fim previsto anterior ao início'; end if;

  if v_eq is null then
    -- máquina nova, alugada de terceiro: entra no cadastro do ERP como propriedade alugada
    if p_novo is null or coalesce(p_novo->>'descricao', '') = '' or coalesce(p_novo->>'tipo', '') = '' then
      raise exception 'Máquina nova: informe pelo menos descrição e tipo de máquina';
    end if;
    if not public.tem_permissao('cadastros.equipamentos', 'criar') then
      raise exception 'Sem permissão para cadastrar equipamento (cadastros.equipamentos / criar)' using errcode = '42501';
    end if;
    if lower(p_novo->>'tipo') in (select lower(x) from public.configuracoes c, jsonb_array_elements_text(c.valor) x where c.chave = 'mapa.tipos_fora_do_mapa') then
      raise exception 'Tipo "%" não entra no mapa (só carros, caminhões e máquinas pesadas)', p_novo->>'tipo';
    end if;
    v_codigo := nullif(trim(p_novo->>'codigo'), '');
    if v_codigo is null then
      v_n := 1;
      loop
        v_codigo := 'ALU-' || lpad(v_n::text, 3, '0');
        exit when not exists (select 1 from public.equipamentos e where e.codigo = v_codigo);
        v_n := v_n + 1;
      end loop;
    elsif exists (select 1 from public.equipamentos e where e.codigo = v_codigo) then
      raise exception 'Já existe equipamento com o código %', v_codigo;
    end if;
    insert into public.equipamentos (codigo, descricao, tipo, marca, modelo, placa, ano, controle_por, propriedade, status, ativo)
    values (v_codigo, p_novo->>'descricao', p_novo->>'tipo', nullif(p_novo->>'marca',''), nullif(p_novo->>'modelo',''), nullif(p_novo->>'placa',''),
            (p_novo->>'ano')::smallint, coalesce(nullif(p_novo->>'controle_por',''), 'horimetro'), 'alugada', 'ativa', true)
    returning id into v_eq;
  else
    select e.id, e.codigo, e.descricao, e.tipo, e.propriedade, e.ativo into r from public.equipamentos e where e.id = v_eq;
    if r.id is null then raise exception 'Equipamento não encontrado'; end if;
    if not r.ativo then raise exception '% está inativo no cadastro', coalesce(r.codigo, r.descricao); end if;
    if r.propriedade = 'propria' then raise exception '% é equipamento próprio: não entra como locação', coalesce(r.codigo, r.descricao); end if;
    if r.tipo is null or lower(r.tipo) in (select lower(x) from public.configuracoes c, jsonb_array_elements_text(c.valor) x where c.chave = 'mapa.tipos_fora_do_mapa') then
      raise exception '% é do tipo "%", que não entra no mapa', coalesce(r.codigo, r.descricao), coalesce(r.tipo, 'sem tipo');
    end if;
    if exists (select 1 from public.mapa_locacoes l where l.equipamento_id = v_eq and l.fim is null) then
      raise exception '% já tem locação em curso (desde %)', coalesce(r.codigo, r.descricao),
        (select to_char(l.inicio, 'DD/MM/YYYY') from public.mapa_locacoes l where l.equipamento_id = v_eq and l.fim is null);
    end if;
  end if;

  insert into public.mapa_locacoes (equipamento_id, fornecedor_id, tipo_aluguel, valor_unitario, inicio, fim_previsto, medicao_inicio, observacao)
  values (v_eq, p_fornecedor, p_tipo_aluguel, p_valor_unitario, v_inicio, p_fim_previsto, p_medicao_inicio, p_observacao)
  returning id into v_loc;

  insert into public.mapa_equipamentos (equipamento_id, no_mapa, locacao_id, estado, estado_desde)
  values (v_eq, true, v_loc, 'parado', now())
  on conflict (equipamento_id) do update
    set no_mapa = true, locacao_id = excluded.locacao_id, estado = 'parado', estado_desde = now(), updated_by = auth.uid();

  insert into public.mapa_movimentacoes (tipo, alvo, alvo_id, de, para, motivo, data_efetiva)
  values ('locacao', 'equipamento', v_eq, jsonb_build_object('locacao_id', null),
          jsonb_build_object('locacao_id', v_loc, 'fornecedor_id', p_fornecedor, 'tipo_aluguel', p_tipo_aluguel, 'valor_unitario', p_valor_unitario,
                             'inicio', v_inicio, 'fim_previsto', p_fim_previsto, 'novo', p_novo is not null),
          coalesce(p_observacao, 'Entrada em locação'), v_inicio);

  if p_destino is not null and p_destino->>'lng' is not null and p_destino->>'lat' is not null then
    perform public.fn_mapa_mover_equipamentos(array[v_eq], p_destino, v_inicio, 'Entrada em locação');
  end if;
  return v_loc;
end $$;

-- Encerra a locação em curso: a máquina sai do mapa (continua no cadastro).
create or replace function public.fn_mapa_locacao_encerrar(p_equipamento uuid, p_fim date default null, p_medicao_fim numeric default null, p_motivo text default null)
returns void language plpgsql security definer set search_path to '' as $$
declare v_loc record; v_fim date := coalesce(p_fim, (now() at time zone 'America/Rio_Branco')::date);
begin
  perform public.fn_mapa_exigir('editar');
  select * into v_loc from public.mapa_locacoes l where l.equipamento_id = p_equipamento and l.fim is null;
  if v_loc.id is null then raise exception 'Este equipamento não tem locação em curso'; end if;
  if v_fim < v_loc.inicio then raise exception 'Fim anterior ao início da locação (%)', to_char(v_loc.inicio, 'DD/MM/YYYY'); end if;
  update public.mapa_locacoes set fim = v_fim, medicao_fim = coalesce(p_medicao_fim, medicao_fim), updated_by = auth.uid() where id = v_loc.id;
  update public.mapa_equipamentos set
    no_mapa = false, locacao_id = null, posicao = null, estado = 'parado', estado_desde = now(),
    obra_id = null, trecho_id = null, frente_id = null, area_id = null, localidade_id = null, km_atual = null,
    deslocamento = null, quebra_descricao = null, operador_colaborador_id = null, updated_by = auth.uid()
  where equipamento_id = p_equipamento;
  update public.mapa_colaboradores set equipamento_id = null, updated_by = auth.uid() where equipamento_id = p_equipamento;
  insert into public.mapa_movimentacoes (tipo, alvo, alvo_id, de, para, motivo, data_efetiva)
  values ('locacao', 'equipamento', p_equipamento,
          jsonb_build_object('locacao_id', v_loc.id, 'fornecedor_id', v_loc.fornecedor_id, 'tipo_aluguel', v_loc.tipo_aluguel, 'valor_unitario', v_loc.valor_unitario, 'inicio', v_loc.inicio),
          jsonb_build_object('locacao_id', null, 'fim', v_fim, 'medicao_fim', p_medicao_fim),
          coalesce(p_motivo, 'Fim da locação'), v_fim);
end $$;

-- Locações do mês: dias de uso dentro do mês e custo estimado (dia e mês pela vigência; hora pelo horímetro quando houver as duas medições)
create or replace function public.fn_mapa_rel_locacoes_mes(p_mes date)
returns table (locacao_id uuid, equipamento_id uuid, codigo text, descricao text, propriedade text, fornecedor_id uuid, fornecedor text,
               tipo_aluguel text, valor_unitario numeric, inicio date, fim date, fim_previsto date, dias_no_mes int, custo_estimado numeric)
language sql stable security definer set search_path to '' as $$
  with m as (select date_trunc('month', p_mes)::date as ini, (date_trunc('month', p_mes) + interval '1 month')::date - 1 as fim)
  select l.id, e.id, e.codigo, e.descricao, e.propriedade, l.fornecedor_id, coalesce(f.nome_fantasia, f.razao_social),
         l.tipo_aluguel, l.valor_unitario, l.inicio, l.fim, l.fim_previsto,
         greatest(0, least(coalesce(l.fim, (now() at time zone 'America/Rio_Branco')::date), m.fim) - greatest(l.inicio, m.ini) + 1)::int as dias_no_mes,
         case l.tipo_aluguel
           when 'dia'  then l.valor_unitario * greatest(0, least(coalesce(l.fim, (now() at time zone 'America/Rio_Branco')::date), m.fim) - greatest(l.inicio, m.ini) + 1)
           when 'mes'  then round(l.valor_unitario * greatest(0, least(coalesce(l.fim, (now() at time zone 'America/Rio_Branco')::date), m.fim) - greatest(l.inicio, m.ini) + 1) / (m.fim - m.ini + 1), 2)
           when 'hora' then case when l.medicao_inicio is not null and l.medicao_fim is not null and l.fim between m.ini and m.fim
                                 then l.valor_unitario * (l.medicao_fim - l.medicao_inicio) end
         end as custo_estimado
  from public.mapa_locacoes l
  cross join m
  join public.equipamentos e on e.id = l.equipamento_id
  left join public.fornecedores f on f.id = l.fornecedor_id
  where l.inicio <= m.fim and coalesce(l.fim, (now() at time zone 'America/Rio_Branco')::date) >= m.ini
    and public.tem_permissao('mapa.mapa', 'ver')
  order by e.codigo nulls last, e.descricao, l.inicio;
$$;

-- Permissões de execução: só usuários autenticados (as funções checam tem_permissao por dentro)
revoke all on function public.fn_mapa_exigir(text) from public, anon;
revoke all on function public.fn_mapa_no_mapa_padrao(uuid) from public, anon;
revoke all on function public.fn_mapa_motivo_fora_do_mapa(uuid) from public, anon;
revoke all on function public.fn_mapa_locacao_iniciar(uuid, uuid, text, numeric, date, jsonb, date, numeric, text, jsonb) from public, anon;
revoke all on function public.fn_mapa_locacao_encerrar(uuid, date, numeric, text) from public, anon;
revoke all on function public.fn_mapa_rel_locacoes_mes(date) from public, anon;
revoke all on function public.fn_mapa_resolver_destino(double precision, double precision) from public, anon;
revoke all on function public.fn_mapa_km_no_trecho(uuid, double precision, double precision) from public, anon;
revoke all on function public.fn_mapa_mover_equipamentos(uuid[], jsonb, date, text) from public, anon;
revoke all on function public.fn_mapa_marcar_estado(uuid, text, text, text, jsonb, date) from public, anon;
revoke all on function public.fn_mapa_diarias_marcar(uuid[], boolean, text, date) from public, anon;
revoke all on function public.fn_mapa_diaria_salvar(uuid, date, uuid, numeric) from public, anon;
revoke all on function public.fn_mapa_rel_diarias_mes(date) from public, anon;
revoke all on function public.fn_mapa_assinalar_operador(uuid, uuid, text) from public, anon;
revoke all on function public.fn_mapa_mover_colaboradores(uuid[], jsonb, date, text) from public, anon;
revoke all on function public.fn_mapa_area_salvar(uuid, text, text, uuid, uuid, jsonb, jsonb) from public, anon;
revoke all on function public.fn_mapa_trecho_salvar(uuid, uuid, text, text, numeric, numeric, jsonb, uuid, text) from public, anon;
revoke all on function public.fn_mapa_frente_salvar(uuid, uuid, uuid, uuid, date, text, text, numeric, numeric, jsonb, text) from public, anon;
revoke all on function public.fn_mapa_frentes_repetir(date, date) from public, anon;
revoke all on function public.fn_mapa_pessoas_dia(date) from public, anon;
revoke all on function public.fn_mapa_obra_indicadores(uuid, date) from public, anon;
revoke all on function public.fn_mapa_snapshot(date) from public, anon;
revoke all on function public.fn_mapa_alertas_recalcular() from public, anon;
revoke all on function public.fn_mapa_rel_equipamentos_mes(date) from public, anon;
revoke all on function public.fn_mapa_rel_pessoas_mes(date) from public, anon;

-- ---------------------------------------------------------------------
-- 9. Agendamentos (depois de habilitar pg_cron no projeto)
-- ---------------------------------------------------------------------
-- Agendado em produção em 14/10/2026 (jobs 1 e 2 de cron.job):
-- select cron.schedule('mapa_snapshot_diario', '59 4 * * *',  $$select public.fn_mapa_snapshot()$$);          -- 23:59 Acre = 04:59 UTC
-- select cron.schedule('mapa_alertas_hora',    '5 * * * *',   $$select public.fn_mapa_alertas_recalcular()$$);
