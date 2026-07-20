-- Reforma A: dropa o modulo Manutencao. Mantem o trigger de centro de custo do equipamento.
--
-- Ordem: Manutencao e dropada ANTES de Estoque (proxima migracao, 120003) porque
-- os_pecas (Manutencao) tem FKs para depositos/estoque_movimentos (Estoque) e
-- fn_os_adicionar_peca (Manutencao) chama fn_estoque_saida_interna (Estoque).
-- Dropar Manutencao primeiro resolve os dois: dropamos o lado filho da FK e a
-- funcao chamadora; a Estoque (tabelas e fn_estoque_*) segue intacta ate a
-- proxima migracao.
--
-- Todas as 12 tabelas abaixo estavam com 0 linhas no recon. Nenhuma tabela
-- sobrevivente tem FK apontando para dentro do Manutencao (verificado via
-- pg_constraint antes de aplicar).
--
-- Mantidos de proposito (NAO dropar): fn_equipamento_cria_etapa_manutencao()
-- e o trigger trg_equipamento_cria_etapa em equipamentos — essenciais para o
-- modelo de centro de custo (equipamento -> etapa) na Fase B.

-- 1) Dropar funcoes de manutencao.
drop function if exists public.fn_abrir_os(uuid,text,text,text,numeric,numeric,text,uuid) cascade;
drop function if exists public.fn_iniciar_os(uuid) cascade;
drop function if exists public.fn_os_adicionar_peca(uuid,uuid,uuid,numeric) cascade;
drop function if exists public.fn_cancelar_os(uuid,text) cascade;
drop function if exists public.fn_gerar_os_preventiva(uuid) cascade;
drop function if exists public.fn_concluir_os(uuid,numeric,numeric) cascade;
drop function if exists public.fn_executar_checklist(uuid,uuid,jsonb,uuid,numeric,numeric,text,boolean) cascade;

-- 2) Dropar tabelas (filha -> pai).
drop table if exists public.checklist_respostas;
drop table if exists public.checklist_execucoes;
drop table if exists public.checklist_perguntas;
drop table if exists public.checklists;
drop table if exists public.os_transicoes;
drop table if exists public.os_mao_obra;
drop table if exists public.os_terceiros;
drop table if exists public.os_pecas;
drop table if exists public.ordens_servico;
drop table if exists public.plano_atividades;
drop table if exists public.equipamento_planos;
drop table if exists public.planos_preventivos;
