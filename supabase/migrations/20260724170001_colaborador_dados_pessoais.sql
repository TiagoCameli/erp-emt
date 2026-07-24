-- Bloco 2 / Task 1: dados pessoais e documentos do colaborador.
-- Adiciona 19 colunas de dados pessoais/documentos em public.colaboradores
-- e 4 constraints de dominio (cada uma aceita null ou valor da lista).
-- Colunas idempotentes (add column if not exists); constraints com nome fixo.

alter table public.colaboradores add column if not exists rg text;
alter table public.colaboradores add column if not exists rg_orgao text;
alter table public.colaboradores add column if not exists rg_uf text;
alter table public.colaboradores add column if not exists ctps_numero text;
alter table public.colaboradores add column if not exists ctps_serie text;
alter table public.colaboradores add column if not exists ctps_uf text;
alter table public.colaboradores add column if not exists pis text;
alter table public.colaboradores add column if not exists cnh_numero text;
alter table public.colaboradores add column if not exists cnh_categoria text;
alter table public.colaboradores add column if not exists cnh_validade date;
alter table public.colaboradores add column if not exists escolaridade text;
alter table public.colaboradores add column if not exists data_nascimento date;
alter table public.colaboradores add column if not exists nome_mae text;
alter table public.colaboradores add column if not exists nacionalidade text;
alter table public.colaboradores add column if not exists estado_civil text;
alter table public.colaboradores add column if not exists raca_cor text;
alter table public.colaboradores add column if not exists titulo_eleitor text;
alter table public.colaboradores add column if not exists reservista text;
alter table public.colaboradores add column if not exists cbo text;

alter table public.colaboradores add constraint colaboradores_escolaridade_check check (escolaridade is null or escolaridade in ('analfabeto','fundamental_incompleto','fundamental_completo','medio_incompleto','medio_completo','superior_incompleto','superior_completo','pos_graduacao','mestrado','doutorado'));
alter table public.colaboradores add constraint colaboradores_estado_civil_check check (estado_civil is null or estado_civil in ('solteiro','casado','divorciado','viuvo','uniao_estavel','separado_judicialmente'));
alter table public.colaboradores add constraint colaboradores_raca_cor_check check (raca_cor is null or raca_cor in ('branca','preta','parda','amarela','indigena'));
alter table public.colaboradores add constraint colaboradores_cnh_categoria_check check (cnh_categoria is null or cnh_categoria in ('A','B','C','D','E','AB','AC','AD','AE'));

comment on column public.colaboradores.rg is 'Numero do RG.';
comment on column public.colaboradores.pis is 'PIS/PASEP/NIT.';
comment on column public.colaboradores.cbo is 'Codigo Brasileiro de Ocupacoes.';

-- ============================================================================
-- ROLLBACK (executar manualmente para desfazer):
-- ----------------------------------------------------------------------------
-- alter table public.colaboradores drop constraint if exists colaboradores_escolaridade_check;
-- alter table public.colaboradores drop constraint if exists colaboradores_estado_civil_check;
-- alter table public.colaboradores drop constraint if exists colaboradores_raca_cor_check;
-- alter table public.colaboradores drop constraint if exists colaboradores_cnh_categoria_check;
-- alter table public.colaboradores drop column if exists rg;
-- alter table public.colaboradores drop column if exists rg_orgao;
-- alter table public.colaboradores drop column if exists rg_uf;
-- alter table public.colaboradores drop column if exists ctps_numero;
-- alter table public.colaboradores drop column if exists ctps_serie;
-- alter table public.colaboradores drop column if exists ctps_uf;
-- alter table public.colaboradores drop column if exists pis;
-- alter table public.colaboradores drop column if exists cnh_numero;
-- alter table public.colaboradores drop column if exists cnh_categoria;
-- alter table public.colaboradores drop column if exists cnh_validade;
-- alter table public.colaboradores drop column if exists escolaridade;
-- alter table public.colaboradores drop column if exists data_nascimento;
-- alter table public.colaboradores drop column if exists nome_mae;
-- alter table public.colaboradores drop column if exists nacionalidade;
-- alter table public.colaboradores drop column if exists estado_civil;
-- alter table public.colaboradores drop column if exists raca_cor;
-- alter table public.colaboradores drop column if exists titulo_eleitor;
-- alter table public.colaboradores drop column if exists reservista;
-- alter table public.colaboradores drop column if exists cbo;
-- ============================================================================
