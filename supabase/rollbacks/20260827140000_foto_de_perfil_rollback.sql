-- Rollback de 20260827140000_foto_de_perfil.sql
--
-- ORDEM, e o motivo dela: o BUCKET fica por último e só sai se estiver vazio.
-- `delete from storage.buckets` com objeto dentro falha pela FK de
-- `storage.objects`, e forçar a remoção dos objetos apaga as fotos de todos —
-- que é exatamente o dado que um rollback não deve levar embora sem que alguém
-- tenha pedido.
--
-- Por isso a limpeza dos objetos está COMENTADA. Descomente só se a intenção for
-- descartar as fotos de verdade. Sem ela, o bucket continua no projeto com os
-- arquivos parados, sem custo além do espaço, e a coluna volta a existir do jeito
-- que estava (null em todo mundo) se a migration for reaplicada.
--
-- Para saber o que seria perdido:
--   select count(*) from storage.objects where bucket_id = 'avatares';
--   select id, nome, foto_path from public.usuarios where foto_path is not null;

drop function if exists public.fn_salvar_minha_foto();
drop function if exists public.fn_remover_minha_foto();

-- `drop column` derruba o CHECK junto.
alter table public.usuarios drop column if exists foto_path;

-- Descomente as duas linhas abaixo para apagar as fotos e o bucket. Irreversível.
-- delete from storage.objects where bucket_id = 'avatares';
-- delete from storage.buckets where id = 'avatares';
