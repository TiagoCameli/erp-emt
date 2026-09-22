-- Fase 1 da migração de Frete, Combustível e Manutenção: os cadastros compartilhados.
-- Plano: docs/PLANO-FRETE-COMBUSTIVEL-MANUTENCAO.md, seções 3, 6.2 e 7.
--
-- O ERP é o dono de fornecedor, equipamento, obra e insumo (decisão 2 do plano). Os
-- módulos novos não vão ter cadastro próprio dessas coisas, então o que eles precisam
-- saber de cada uma entra AQUI, no cadastro do ERP:
--
--   fornecedores  ganha se é transportadora, se é dono de tanque e a taxa por litro.
--   equipamentos  ganha situação, PROPRIEDADE, medição inicial, série e datas.
--   equipamento_especificacoes  (nova, 1:1) tanque, óleos, pneus, consumo esperado.
--   localidades   (nova) origem e destino do frete. Recurso cadastros.localidades.
--   insumos       ganha litros_por_unidade: o galão de Arla é 20 L, e o tanque só
--                 conta litro (decisão 6).
--
-- Nada aqui cria lançamento, parcela ou rateio (decisão 3). Nada aqui toca módulo novo.
--
-- A PROPRIEDADE é a mudança que corrige um defeito de hoje: equipamento da Colorado
-- cadastrado pela tela nasce na manutenção da EMT e a etapa tem que ser movida à mão.
-- A partir daqui:
--   propria  → etapa na raiz "Manutenção/Documentação de Equipamentos"
--   colorado → etapa na obra "002 - Equipamentos Colorado 2026"
--   alugada  → sem etapa, sem centro de custo (o custo vai para a obra onde trabalhou)
-- E mudar a propriedade de um equipamento cuja etapa já tem uso (lançamento, rateio,
-- item de OC, colaborador, folha, férias, rescisão, 13º, ou etapa filha) é recusado.
--
-- AS QUATRO CARRETAS ficam onde estão. Elas são próprias, mas a etapa delas mora em
-- "001 - Carretas EMT" desde 27/08/2026, por decisão do Tiago (custo recolhido por
-- placa). Esta migration não move etapa nenhuma: marca a propriedade pelo lugar onde
-- a etapa JÁ está. A regra nova vale para equipamento cadastrado daqui para a frente.
--
-- Estado medido em 22/09/2026, antes: 107 equipamentos; 68 com etapa na manutenção,
-- 4 em 001 - Carretas EMT, 31 em 002 - Equipamentos Colorado 2026, 4 sem etapa
-- (Caminhão de Apoio Jorgean, Caçamba JXS6G76, Caçamba NAA-4511, Hilux Renan BDX3D28).

-- =====================================================================
-- 1. Fornecedores
-- =====================================================================

alter table public.fornecedores
  add column if not exists eh_transportadora boolean not null default false,
  add column if not exists eh_dona_de_tanque boolean not null default false,
  -- TAXA pela regra 3 (multiplica litros para virar valor), por isso 4 casas.
  add column if not exists taxa_litro_padrao numeric(14,4);

alter table public.fornecedores
  drop constraint if exists fornecedores_taxa_litro_padrao_nao_negativa;
alter table public.fornecedores
  add constraint fornecedores_taxa_litro_padrao_nao_negativa
  check (taxa_litro_padrao is null or taxa_litro_padrao >= 0);

comment on column public.fornecedores.eh_transportadora is
  'Transportadora de frete: tem conta corrente no módulo Frete.';
comment on column public.fornecedores.eh_dona_de_tanque is
  'Dona de tanque externo (ex. Areacre): carreta que abastece lá gera crédito para ela.';
comment on column public.fornecedores.taxa_litro_padrao is
  'Taxa por litro que o dono do tanque cobra além do combustível. TAXA, 4 casas.';

-- =====================================================================
-- 2. Equipamentos: colunas novas
-- =====================================================================

alter table public.equipamentos
  add column if not exists status text not null default 'ativa',
  add column if not exists propriedade text not null default 'propria',
  add column if not exists medicao_inicial numeric(14,4),
  add column if not exists numero_serie text,
  add column if not exists data_aquisicao date,
  add column if not exists data_venda date;

alter table public.equipamentos drop constraint if exists equipamentos_status_valido;
alter table public.equipamentos
  add constraint equipamentos_status_valido
  check (status in ('ativa', 'em_manutencao', 'fora_funcionamento'));

alter table public.equipamentos drop constraint if exists equipamentos_propriedade_valida;
alter table public.equipamentos
  add constraint equipamentos_propriedade_valida
  check (propriedade in ('propria', 'colorado', 'alugada'));

alter table public.equipamentos drop constraint if exists equipamentos_venda_depois_da_aquisicao;
alter table public.equipamentos
  add constraint equipamentos_venda_depois_da_aquisicao
  check (data_venda is null or data_aquisicao is null or data_venda >= data_aquisicao);

alter table public.equipamentos drop constraint if exists equipamentos_medicao_inicial_nao_negativa;
alter table public.equipamentos
  add constraint equipamentos_medicao_inicial_nao_negativa
  check (medicao_inicial is null or medicao_inicial >= 0);

comment on column public.equipamentos.propriedade is
  'propria: etapa na raiz de manutenção. colorado: etapa na obra 002. alugada: sem etapa.';
comment on column public.equipamentos.status is
  'ativa, em_manutencao ou fora_funcionamento. Na Fase 2 passa a acompanhar a OS.';
comment on column public.equipamentos.medicao_inicial is
  'Horímetro ou km na entrada do equipamento (controle_por diz qual). TAXA, 4 casas.';

-- =====================================================================
-- 3. Onde mora a etapa de cada propriedade
-- =====================================================================
-- A raiz da manutenção se acha pelo tipo, como o gatilho sempre fez. A raiz da
-- Colorado é um centro de obra comum, sem nada que a distinga, então ela fica em
-- `configuracoes`: sem id gravado em função e sem depender do nome da obra.

insert into public.configuracoes (chave, valor, descricao)
select 'centro_custo_equipamentos_colorado',
       to_jsonb(c.id::text),
       'Centro de custo raiz onde nasce a etapa do equipamento de propriedade "colorado".'
from public.centros_custo c
join public.obras o on o.id = c.obra_id
where c.pai_id is null
  and o.nome = '002 - Equipamentos Colorado 2026'
on conflict (chave) do nothing;

do $confere$
begin
  if not exists (select 1 from public.configuracoes where chave = 'centro_custo_equipamentos_colorado') then
    raise exception 'Centro raiz da obra 002 - Equipamentos Colorado 2026 nao encontrado';
  end if;
end $confere$;

create or replace function public.fn_centro_raiz_da_propriedade(p_propriedade text)
returns uuid
language sql
stable
security definer
set search_path to ''
as $$
  select case p_propriedade
    when 'propria' then (
      select id from public.centros_custo
      where nivel = 1 and tipo = 'manutencao'
      order by created_at limit 1)
    when 'colorado' then (
      select (valor #>> '{}')::uuid from public.configuracoes
      where chave = 'centro_custo_equipamentos_colorado')
    else null
  end;
$$;

revoke all on function public.fn_centro_raiz_da_propriedade(text) from public, anon, authenticated;

-- Uso de um centro: tudo o que tem FK para centros_custo (medido em 22/09/2026) e as
-- etapas filhas. Se uma tabela nova passar a apontar para centros_custo, entra aqui.
create or replace function public.fn_centro_custo_em_uso(p_centro_id uuid)
returns boolean
language sql
stable
security definer
set search_path to ''
as $$
  select exists (select 1 from public.lancamentos where centro_custo_id = p_centro_id)
      or exists (select 1 from public.lancamento_rateios where centro_custo_id = p_centro_id)
      or exists (select 1 from public.oc_itens where centro_custo_id = p_centro_id)
      or exists (select 1 from public.colaboradores where centro_custo_id = p_centro_id)
      or exists (select 1 from public.folha_itens where centro_custo_id = p_centro_id)
      or exists (select 1 from public.rh_ferias where centro_custo_id = p_centro_id)
      or exists (select 1 from public.rh_rescisoes where centro_custo_id = p_centro_id)
      or exists (select 1 from public.rh_decimo_terceiro_itens where centro_custo_id = p_centro_id)
      or exists (select 1 from public.centros_custo where pai_id = p_centro_id);
$$;

revoke all on function public.fn_centro_custo_em_uso(uuid) from public, anon, authenticated;

-- =====================================================================
-- 4. Marca a propriedade de quem já existe, pelo lugar onde a etapa JÁ está
-- =====================================================================
-- Antes do gatilho de UPDATE existir, para ele não tentar mover nada.

update public.equipamentos e
set propriedade = 'colorado'
from public.centros_custo c
where c.equipamento_id = e.id
  and c.pai_id = public.fn_centro_raiz_da_propriedade('colorado')
  and e.propriedade <> 'colorado';

update public.equipamentos e
set propriedade = 'alugada'
where not exists (select 1 from public.centros_custo c where c.equipamento_id = e.id)
  and e.propriedade <> 'alugada';

do $confere$
declare
  v_colorado int; v_alugada int; v_propria int;
begin
  select count(*) filter (where propriedade = 'colorado'),
         count(*) filter (where propriedade = 'alugada'),
         count(*) filter (where propriedade = 'propria')
    into v_colorado, v_alugada, v_propria
  from public.equipamentos;
  -- Os números de 22/09/2026. Se o cadastro andou, a migration para e alguém olha.
  if (v_colorado, v_alugada, v_propria) <> (31, 4, 72) then
    raise exception 'Propriedade inesperada: colorado %, alugada %, propria % (esperado 31, 4, 72)',
      v_colorado, v_alugada, v_propria;
  end if;
end $confere$;

-- =====================================================================
-- 5. O gatilho que cria a etapa, agora pela propriedade
-- =====================================================================

create or replace function public.fn_equipamento_cria_etapa_manutencao()
returns trigger
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_pai uuid;
begin
  if new.propriedade = 'alugada' then
    return new;
  end if;

  v_pai := public.fn_centro_raiz_da_propriedade(new.propriedade);
  if v_pai is null then
    raise exception 'Centro de custo raiz para equipamento % nao encontrado. Cadastre-o antes dos equipamentos.',
      new.propriedade;
  end if;

  insert into public.centros_custo (nome, nivel, pai_id, equipamento_id, created_by)
  values (new.descricao, 2, v_pai, new.id, new.created_by);
  return new;
end $function$;

-- Mudar a propriedade reposiciona a etapa, mas só enquanto ela não tem uso.
create or replace function public.fn_equipamento_troca_propriedade()
returns trigger
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_etapa uuid;
  v_pai uuid;
begin
  if new.propriedade is not distinct from old.propriedade then
    return new;
  end if;

  select id into v_etapa from public.centros_custo where equipamento_id = new.id;

  if v_etapa is not null and public.fn_centro_custo_em_uso(v_etapa) then
    raise exception 'Nao da para mudar a propriedade: o centro de custo deste equipamento ja tem lancamento, rateio, item de OC ou pessoa. Fale com o administrador.';
  end if;

  if new.propriedade = 'alugada' then
    if v_etapa is not null then
      delete from public.centros_custo where id = v_etapa;
    end if;
    return new;
  end if;

  v_pai := public.fn_centro_raiz_da_propriedade(new.propriedade);
  if v_pai is null then
    raise exception 'Centro de custo raiz para equipamento % nao encontrado.', new.propriedade;
  end if;

  if v_etapa is null then
    insert into public.centros_custo (nome, nivel, pai_id, equipamento_id, created_by)
    values (new.descricao, 2, v_pai, new.id, (select auth.uid()));
  else
    update public.centros_custo set pai_id = v_pai where id = v_etapa;
  end if;
  return new;
end $function$;

revoke all on function public.fn_equipamento_cria_etapa_manutencao() from public, anon, authenticated;
revoke all on function public.fn_equipamento_troca_propriedade() from public, anon, authenticated;

drop trigger if exists trg_equipamento_troca_propriedade on public.equipamentos;
create trigger trg_equipamento_troca_propriedade
  after update of propriedade on public.equipamentos
  for each row execute function public.fn_equipamento_troca_propriedade();

-- =====================================================================
-- 6. Especificações técnicas do equipamento (1:1)
-- =====================================================================
-- Mesmos campos da origem (especificacoes_equipamento, 47 linhas em 22/09/2026).
-- tipo_oleo_* fica texto por enquanto: o cadastro de tipos de óleo entra na Fase 2,
-- dentro da Manutenção.

-- id próprio, e não equipamento_id como chave: fn_audit identifica o registro por `id`
-- (ou `chave`), e sem ele a trilha da ficha ficaria sem identificador.
create table if not exists public.equipamento_especificacoes (
  id uuid primary key default gen_random_uuid(),
  equipamento_id uuid not null unique references public.equipamentos(id) on delete cascade,
  capacidade_tanque_l numeric(14,4),
  capacidade_oleo_motor_l numeric(14,4),
  tipo_oleo_motor text,
  capacidade_oleo_hidraulico_l numeric(14,4),
  tipo_oleo_hidraulico text,
  capacidade_oleo_transmissao_l numeric(14,4),
  tipo_oleo_transmissao text,
  capacidade_oleo_diferencial_l numeric(14,4),
  capacidade_arrefecedor_l numeric(14,4),
  pneu_medida text,
  pneu_qtd integer,
  bateria_especificacao text,
  bateria_qtd integer,
  filtros jsonb,
  consumo_esperado_l_h numeric(14,4),
  consumo_esperado_km_l numeric(14,4),
  garantia_fim_data date,
  garantia_fim_medicao numeric(14,4),
  observacoes_tecnicas text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references public.usuarios(id),

  constraint equipamento_especificacoes_quantidades
    check ((pneu_qtd is null or pneu_qtd >= 0) and (bateria_qtd is null or bateria_qtd >= 0))
);

comment on table public.equipamento_especificacoes is
  'Ficha técnica do equipamento, uma linha por equipamento. Permissão de cadastros.equipamentos.';

alter table public.equipamento_especificacoes enable row level security;

drop policy if exists equipamento_especificacoes_select on public.equipamento_especificacoes;
create policy equipamento_especificacoes_select on public.equipamento_especificacoes
  for select to authenticated
  using ((select public.tem_permissao('cadastros.equipamentos', 'ver')));

drop policy if exists equipamento_especificacoes_insert on public.equipamento_especificacoes;
create policy equipamento_especificacoes_insert on public.equipamento_especificacoes
  for insert to authenticated
  with check ((select public.tem_permissao('cadastros.equipamentos', 'editar')));

drop policy if exists equipamento_especificacoes_update on public.equipamento_especificacoes;
create policy equipamento_especificacoes_update on public.equipamento_especificacoes
  for update to authenticated
  using ((select public.tem_permissao('cadastros.equipamentos', 'editar')))
  with check ((select public.tem_permissao('cadastros.equipamentos', 'editar')));

-- Sem policy de DELETE, sem grant de DELETE: a ficha sai junto com o equipamento.
revoke all on public.equipamento_especificacoes from anon, authenticated;
grant select, insert, update on public.equipamento_especificacoes to authenticated;

drop trigger if exists trg_equipamento_especificacoes_updated_at on public.equipamento_especificacoes;
create trigger trg_equipamento_especificacoes_updated_at
  before update on public.equipamento_especificacoes
  for each row execute function public.fn_set_updated_at();

drop trigger if exists trg_set_created_by on public.equipamento_especificacoes;
create trigger trg_set_created_by
  before insert on public.equipamento_especificacoes
  for each row execute function public.fn_set_created_by();

drop trigger if exists trg_audit_equipamento_especificacoes on public.equipamento_especificacoes;
create trigger trg_audit_equipamento_especificacoes
  after insert or delete or update on public.equipamento_especificacoes
  for each row execute function public.fn_audit();

-- =====================================================================
-- 7. Localidades (origem e destino do frete)
-- =====================================================================

create table if not exists public.localidades (
  id uuid primary key default gen_random_uuid(),
  nome text not null,
  endereco text,
  ativo boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references public.usuarios(id),

  constraint localidades_nome_nao_vazio check (btrim(nome) <> '')
);

create unique index if not exists uq_localidades_nome
  on public.localidades (public.fn_chave_nome(nome));

comment on table public.localidades is
  'Origem e destino do frete (pedreira, usina, canteiro). Recurso cadastros.localidades.';

alter table public.localidades enable row level security;

drop policy if exists localidades_select on public.localidades;
create policy localidades_select on public.localidades
  for select to authenticated
  using ((select public.tem_permissao('cadastros.localidades', 'ver')));

drop policy if exists localidades_insert on public.localidades;
create policy localidades_insert on public.localidades
  for insert to authenticated
  with check ((select public.tem_permissao('cadastros.localidades', 'criar')));

drop policy if exists localidades_update on public.localidades;
create policy localidades_update on public.localidades
  for update to authenticated
  using ((select public.tem_permissao('cadastros.localidades', 'editar')))
  with check ((select public.tem_permissao('cadastros.localidades', 'editar')));

-- Excluir é pela lixeira (fn_excluir_cadastro), como todo cadastro: sem DELETE direto.
revoke all on public.localidades from anon, authenticated;
grant select, insert, update on public.localidades to authenticated;

drop trigger if exists trg_localidades_updated_at on public.localidades;
create trigger trg_localidades_updated_at
  before update on public.localidades
  for each row execute function public.fn_set_updated_at();

drop trigger if exists trg_set_created_by on public.localidades;
create trigger trg_set_created_by
  before insert on public.localidades
  for each row execute function public.fn_set_created_by();

drop trigger if exists trg_audit_localidades on public.localidades;
create trigger trg_audit_localidades
  after insert or delete or update on public.localidades
  for each row execute function public.fn_audit();

-- A lixeira confere a permissão do recurso de origem. Alterado a partir da definição
-- VIVA de 22/09/2026 (15 casos), só com o caso de localidades a mais.
create or replace function public.fn_recurso_do_cadastro(p_tabela text)
returns text
language sql
immutable
set search_path to ''
as $function$
  select case p_tabela
    when 'unidades_medida'   then 'cadastros.unidades'
    when 'categorias_insumo' then 'cadastros.categorias'
    when 'clientes'          then 'cadastros.clientes'
    when 'fornecedores'      then 'cadastros.fornecedores'
    when 'insumos'           then 'cadastros.insumos'
    when 'depositos'         then 'cadastros.depositos'
    when 'colaboradores'     then 'cadastros.colaboradores'
    when 'obras'             then 'cadastros.obras'
    when 'centros_custo'     then 'cadastros.centros-custo'
    when 'funcoes'           then 'cadastros.funcoes'
    when 'jornadas'          then 'cadastros.jornadas'
    when 'folha_encargos'    then 'rh.encargos'
    when 'folha_provisoes'   then 'rh.encargos'
    when 'folha_inss_faixas' then 'rh.parametros-folha'
    when 'folha_irrf_faixas' then 'rh.parametros-folha'
    when 'localidades'       then 'cadastros.localidades'
    else null
  end;
$function$;

-- =====================================================================
-- 8. Insumo: quantos litros cabem numa unidade
-- =====================================================================
-- O tanque só enxerga litro (decisão 6). A entrada em galão converte na hora:
-- quantidade × litros_por_unidade. Nulo = o insumo já é medido em litro ou não é
-- combustível.

alter table public.insumos
  add column if not exists litros_por_unidade numeric(14,4);

alter table public.insumos drop constraint if exists insumos_litros_por_unidade_positivo;
alter table public.insumos
  add constraint insumos_litros_por_unidade_positivo
  check (litros_por_unidade is null or litros_por_unidade > 0);

comment on column public.insumos.litros_por_unidade is
  'Litros em uma unidade do insumo (galão de Arla = 20). O tanque de combustível conta litro.';

update public.insumos set litros_por_unidade = 20
where codigo = '1335M186' and litros_por_unidade is distinct from 20;

-- =====================================================================
-- 9. Permissão: cadastros.localidades para o perfil Admin e os Admins ativos
-- =====================================================================
-- Recurso novo nasce sem ninguém e a aba some até para o Tiago. O plano (4.3) manda
-- dar ao perfil Admin e aos 4 Admins ativos na mesma migration; os outros usuários
-- recebem pela matriz revisada, depois.

insert into public.perfil_permissoes (perfil_id, recurso, acao)
select p.id, 'cadastros.localidades', a.acao
from public.perfis p
cross join (values ('ver'), ('criar'), ('editar'), ('excluir')) a(acao)
where p.nome = 'Admin'
  and not exists (
    select 1 from public.perfil_permissoes x
    where x.perfil_id = p.id and x.recurso = 'cadastros.localidades' and x.acao = a.acao);

insert into public.usuario_permissoes (usuario_id, recurso, acao)
select u.id, 'cadastros.localidades', a.acao
from public.usuarios u
join public.perfis p on p.id = u.perfil_id and p.nome = 'Admin'
cross join (values ('ver'), ('criar'), ('editar'), ('excluir')) a(acao)
where u.ativo and u.excluido_em is null
  and not exists (
    select 1 from public.usuario_permissoes x
    where x.usuario_id = u.id and x.recurso = 'cadastros.localidades' and x.acao = a.acao);

do $confere$
declare v int;
begin
  select count(distinct usuario_id) into v
  from public.usuario_permissoes where recurso = 'cadastros.localidades';
  if v <> 4 then
    raise exception 'cadastros.localidades foi para % usuarios; o plano diz 4 Admins ativos', v;
  end if;
end $confere$;
