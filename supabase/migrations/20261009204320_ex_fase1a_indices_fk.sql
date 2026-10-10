-- Execução de Obras, Fase 1a: índices cobrindo as chaves estrangeiras que o advisor
-- unindexed_foreign_keys apontou nas tabelas ex_. Mesma regra da Medição (mc_fase1a_indices_fk).
-- Cada índice cobre exatamente as colunas da FK, na mesma ordem.

create index ex_atividade_datas_atividade_cronograma_ix on public.ex_atividade_datas (atividade_id, cronograma_id);
create index ex_atividade_datas_cronograma_obra_ix on public.ex_atividade_datas (cronograma_id, obra_id);
create index ex_atividade_locais_atividade_obra_ix on public.ex_atividade_locais (atividade_id, obra_id);
create index ex_atividade_locais_local_obra_ix on public.ex_atividade_locais (local_id, obra_id);
create index ex_atividades_created_by_ix on public.ex_atividades (created_by);
create index ex_atividades_cronograma_obra_ix on public.ex_atividades (cronograma_id, obra_id);
create index ex_atividades_excluido_por_ix on public.ex_atividades (excluido_por);
create index ex_atividades_pai_cronograma_ix on public.ex_atividades (pai_id, cronograma_id);
create index ex_calendario_excecoes_created_by_ix on public.ex_calendario_excecoes (created_by);
create index ex_calendarios_created_by_ix on public.ex_calendarios (created_by);
create index ex_calendarios_excluido_por_ix on public.ex_calendarios (excluido_por);
create index ex_cronogramas_created_by_ix on public.ex_cronogramas (created_by);
create index ex_cronogramas_excluido_por_ix on public.ex_cronogramas (excluido_por);
create index ex_dependencias_created_by_ix on public.ex_dependencias (created_by);
create index ex_dependencias_cronograma_obra_ix on public.ex_dependencias (cronograma_id, obra_id);
create index ex_dependencias_predecessora_cronograma_ix on public.ex_dependencias (predecessora_id, cronograma_id);
create index ex_dependencias_sucessora_cronograma_ix on public.ex_dependencias (sucessora_id, cronograma_id);
create index ex_feriados_created_by_ix on public.ex_feriados (created_by);
create index ex_locais_created_by_ix on public.ex_locais (created_by);
create index ex_locais_excluido_por_ix on public.ex_locais (excluido_por);
create index ex_locais_pai_obra_ix on public.ex_locais (pai_id, obra_id);
create index ex_obra_usuarios_created_by_ix on public.ex_obra_usuarios (created_by);
create index ex_obras_created_by_ix on public.ex_obras (created_by);
create index ex_servicos_created_by_ix on public.ex_servicos (created_by);
