-- Aplicada em produção pelo MCP (apply_migration) em 2026-08-14, versão
-- 20260814145129 no ledger. Este arquivo é o registro versionado do que foi
-- aplicado; NÃO rode `supabase db push` neste projeto (ver docs/decisoes.md).
--
-- Conserta um bug pré-existente: fn_recurso_do_cadastro('folha_encargos') devolvia
-- null (o case tinha sido perdido numa recriação anterior da função), então
-- fn_excluir_cadastro sempre recusava com "Tabela folha_encargos nao pode ser
-- excluida por esta funcao". Nunca apareceu porque não existe encargo cadastrado
-- em produção. Acrescenta os dois: folha_encargos (conserto) e folha_provisoes
-- (Bloco 8b, Task 1), preservando TODOS os cases existentes, lidos do vivo em
-- 2026-08-14.
--
-- Rollback: recriar removendo as duas linhas novas (when 'folha_encargos' ...,
-- when 'folha_provisoes' ...), voltando aos 9 cases originais.

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
    when 'folha_encargos'    then 'rh.encargos'
    when 'folha_provisoes'   then 'rh.encargos'
    else null
  end;
$function$;
