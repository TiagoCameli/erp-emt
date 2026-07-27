-- rh_ocorrencias.data_fim: fim do periodo de uma ocorrencia (Bloco 5, Task 1).
--
-- Ate aqui uma ocorrencia so tinha `data` (um dia). O atestado (tipo='atestado')
-- pode cobrir varios dias, entao ganha um `data_fim` opcional. Quando nulo, a
-- ocorrencia vale so no dia `data` (periodo de um dia). O ponto vai abater a
-- falta lendo essa cobertura por public.fn_atestados_ponto (migration seguinte).
--
-- data_fim >= data (ou nulo). Nao ha default: registros existentes ficam com
-- data_fim = null (comportamento de um dia, identico ao de antes).
--
-- Rollback:
--   alter table public.rh_ocorrencias drop constraint rh_ocorrencias_data_fim_check;
--   alter table public.rh_ocorrencias drop column data_fim;

alter table public.rh_ocorrencias
  add column data_fim date;

alter table public.rh_ocorrencias
  add constraint rh_ocorrencias_data_fim_check
  check (data_fim is null or data_fim >= data);
