-- Fecha a migracao: o app inteiro ja usa arquivos + anexo_vinculos.
--
-- 1. As policies do bucket para usuario logado caem. Upload, URL assinada e
--    remocao passam SO pelo servidor com a chave de servico, depois de checar a
--    permissao pelo vinculo. Nenhum client fala com o Storage direto, e a
--    permissao deixa de vir do caminho do arquivo (que era o que impedia um
--    binario servir 4 documentos).
-- 2. A tabela `anexos` e as funcoes de permissao por path saem.
-- 3. A faxina roda com a chave de servico: garante o EXECUTE pro service_role.

drop policy if exists "anexos storage select" on storage.objects;
drop policy if exists "anexos storage insert" on storage.objects;
drop policy if exists "anexos storage delete" on storage.objects;

drop table if exists public.anexos;

drop function if exists public.fn_recurso_do_path_anexo(text);
drop function if exists public.fn_recurso_do_anexo(text);

grant execute on function public.fn_arquivos_orfaos(int) to service_role;
grant execute on function public.fn_apagar_arquivo_orfao(uuid, int) to service_role;
grant execute on function public.fn_arquivo_por_hash(text, bigint) to service_role;
grant execute on function public.fn_vincular_arquivo(uuid, text, uuid, text) to service_role;
grant execute on function public.fn_registrar_arquivo(text, text, text, bigint, text, text, uuid) to service_role;
grant execute on function public.fn_desvincular_arquivo(uuid) to service_role;
