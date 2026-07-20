-- Reforma A (Task 7): dropa o modulo Medicao (tabelas + funcoes) e desamarra
-- as origens 'fatura' e 'os' do check de lancamentos.origem.
--
-- Contexto: o app de Medicao ja foi removido (Task 1). Todas as 6 tabelas do
-- modulo estao vazias (0 linhas, recon previo). lancamentos NAO tem FK para
-- faturas (liga por origem_id polimorfico) e 100% das linhas hoje tem
-- origem='manual', entao o novo CHECK nao conflita com dado existente.
--
-- Discovery (rodado antes desta migration): nenhuma tabela sobrevivente tem FK
-- apontando para dentro das tabelas de Medicao (todas as FKs cruzadas saem de
-- dentro do modulo em direcao a obras/unidades_medida/clientes/lancamentos,
-- nunca o contrario). Nenhuma view depende das tabelas de Medicao.

-- 1) Dropar funcoes de medicao (confirmadas 1 a 1 via pg_get_functiondef;
--    nenhuma e helper generico ou de outro modulo).
drop function if exists public.fn_aprovar_medicao(uuid, date) cascade;
drop function if exists public.fn_cancelar_medicao(uuid, text) cascade;
drop function if exists public.fn_desaprovar_medicao(uuid, text) cascade;
drop function if exists public.fn_check_medicao_item_planilha() cascade;
drop function if exists public.fn_check_medicao_planilha() cascade;
drop function if exists public.fn_set_medicao_numero() cascade;

-- 2) Dropar tabelas (filha -> pai).
drop table if exists public.medicao_anexos;
drop table if exists public.medicao_itens;
drop table if exists public.faturas;
drop table if exists public.medicoes;
drop table if exists public.planilha_itens;
drop table if exists public.planilhas_contratuais;

-- 3) Ajustar o CHECK de origem do lancamento (tira fatura e os; mantem oc, manual, diaria).
alter table public.lancamentos drop constraint if exists lancamentos_origem_check;
alter table public.lancamentos add  constraint lancamentos_origem_check
  check (origem in ('oc','manual','diaria'));
