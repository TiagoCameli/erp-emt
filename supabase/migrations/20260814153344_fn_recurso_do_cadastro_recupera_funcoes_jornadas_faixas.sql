-- Aplicada em produção pelo MCP (apply_migration) em 2026-08-14, versão
-- 20260814153344 no ledger. Este arquivo é o registro versionado do que foi
-- aplicado; NÃO rode `supabase db push` neste projeto (ver docs/decisoes.md).
--
-- Fix round 1 da Task 1 (Bloco 8b): o dispatcher continuava faltando quatro casos, não
-- só folha_encargos (20260814145129 recuperou apenas esse). A migration
-- 20260810130444 (excluir_obras_e_centros_custo, está no ledger, sem arquivo
-- versionado no repo) recriou fn_recurso_do_cadastro para acrescentar 'obras' e
-- 'centros_custo', mas partiu de uma base incompleta e derrubou cinco casos que a
-- última definição versionada (supabase/migrations/20260727130001_folha_faixas_parametros.sql)
-- tinha: 'funcoes', 'jornadas', 'folha_encargos', 'folha_inss_faixas', 'folha_irrf_faixas'.
--
-- Recria a função com os 15 casos vivos hoje: os 11 que já respondem certo (medido
-- no banco antes desta migration: unidades_medida, categorias_insumo, clientes,
-- fornecedores, insumos, depositos, colaboradores, obras, centros_custo,
-- folha_encargos, folha_provisoes) mais os 4 que continuavam null e são conferidos
-- contra src/config/recursos.ts antes de gravar (nenhum id de recurso mudou desde
-- 2026-07-27): 'funcoes' -> cadastros.funcoes, 'jornadas' -> cadastros.jornadas,
-- 'folha_inss_faixas' e 'folha_irrf_faixas' -> rh.parametros-folha.
--
-- Efeito em produção: hoje há 1 função e 1 jornada cadastradas; excluir qualquer
-- uma delas, ou qualquer faixa de INSS/IRRF, caía em "Tabela X nao pode ser
-- excluida por esta funcao". fn_restaurar_cadastro usa o mesmo dispatcher como
-- whitelist, então restaurar também recusava as quatro. Os dois ficam corretos com
-- esta migration, sem tocar em fn_excluir_cadastro nem fn_restaurar_cadastro.
--
-- Atributos preservados iguais ao que já estava gravado (conferido via pg_proc antes
-- de aplicar): language sql, immutable, search_path '', security invoker (não tem
-- 'security definer', então é invoker, o padrão da linguagem sql), proacl
-- {postgres=X, authenticated=X} (sem public, sem anon) — refeito explicitamente
-- abaixo para não depender de CREATE OR REPLACE preservar por conta própria.
--
-- Rollback: recriar removendo os 4 cases novos ('funcoes', 'jornadas',
-- 'folha_inss_faixas', 'folha_irrf_faixas'), voltando aos 11 casos anteriores a esta
-- migration — que, por sua vez, ainda não é o baseline correto: só uma migration
-- mais recente que esta consertaria o resto, se existir.

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
    else null
  end;
$function$;

revoke all on function public.fn_recurso_do_cadastro(text) from public, anon, authenticated;
grant execute on function public.fn_recurso_do_cadastro(text) to authenticated;
