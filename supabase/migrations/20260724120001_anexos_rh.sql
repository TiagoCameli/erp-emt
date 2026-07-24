-- =============================================================
-- RH / Anexos: estende o mapa tabela -> recurso pras tabelas de RH.
--
-- As telas de Documentos/ASO (rh_documentos), EPI (rh_epis) e Ausencias/
-- ocorrencias/atestado (rh_ocorrencias) so guardavam metadados; faltava
-- deixar anexar o arquivo em si (#12). O sistema de anexos generico ja
-- existe (tabela public.anexos + bucket privado 'anexos'); a RLS da tabela
-- e as policies de storage.objects derivam o recurso de permissao pela
-- funcao public.fn_recurso_do_anexo(tabela). Enquanto essa funcao devolvia
-- null pras tabelas de RH, todo insert/select de anexo de RH ficava barrado.
--
-- Aqui so ACRESCENTAMOS os casos de RH, PRESERVANDO os casos vivos de
-- compras (cotacoes, ordens_compra) exatamente como estao no banco. Com isso
-- a RLS de public.anexos e as policies de storage.objects passam a cobrir os
-- anexos dessas tres telas, gated pela permissao da aba (ver p/ listar/baixar;
-- criar/editar p/ anexar).
--
-- A public.fn_recurso_do_path_anexo(path) NAO muda: ela deriva a tabela do
-- primeiro segmento do path (tabela/registro_id/uuid) e delega pra
-- fn_recurso_do_anexo, entao passa a cobrir RH automaticamente.
--
-- Rollback: restaurar a versao anterior da funcao (so os casos de compras):
--   create or replace function public.fn_recurso_do_anexo(p_tabela text)
--   returns text language sql immutable set search_path = '' as $$
--     select case p_tabela
--       when 'cotacoes'      then 'compras.cotacoes'
--       when 'ordens_compra' then 'compras.ordens'
--       else null
--     end;
--   $$;
--   revoke all on function public.fn_recurso_do_anexo(text) from public, anon, authenticated;
--   grant execute on function public.fn_recurso_do_anexo(text) to authenticated;
-- =============================================================

create or replace function public.fn_recurso_do_anexo(p_tabela text)
returns text language sql immutable set search_path = '' as $$
  select case p_tabela
    -- Compras (preservado do banco vivo)
    when 'cotacoes'       then 'compras.cotacoes'
    when 'ordens_compra'  then 'compras.ordens'
    -- RH (novo)
    when 'rh_documentos'  then 'rh.documentos'
    when 'rh_epis'        then 'rh.epis'
    when 'rh_ocorrencias' then 'rh.ocorrencias'
    else null
  end;
$$;
revoke all on function public.fn_recurso_do_anexo(text) from public, anon, authenticated;
grant execute on function public.fn_recurso_do_anexo(text) to authenticated;
