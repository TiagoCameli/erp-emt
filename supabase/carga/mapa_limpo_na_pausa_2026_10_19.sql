-- Mapa limpo durante a pausa (Tiago, 19/10/2026: "tire todos os equipamentos que estavam no mapa,
-- e colaboradores tambem, deixei o mapa limpo durante a pausa"). Vem depois de
-- 20261019150000_mapa_em_pausa (ninguém acessa o Mapa).
--
-- O que sai (o que põe a máquina ou a pessoa NO MAPA):
--   mapa_equipamentos: no_mapa, posição, rumo, obra, trecho, frente, área, local, km, operador,
--                      deslocamento e o retorno de frete.
--   mapa_colaboradores: obra, frente, área, local, máquina, ponto manual e o diarista no mapa.
-- O que fica (é da máquina ou da pessoa, não do lugar): modelo 3D, estado e conserto, observação,
-- locação, "vários centros"; equipe, centro escolhido e trabalhando/parado.
-- A carreta EMT continua com a obra "001 - Carretas EMT": o trigger obra_fixa_carreta a repõe.
--
-- Os 4 crons do Mapa ficam DESLIGADOS na pausa (active = false, não apagados): com o mapa vazio
-- eles gravariam todos em Sem Alocação todo dia. As diárias do RH não leem o Mapa.
--
-- Cópia integral antes de limpar: arquivo_morto.mapa_equipamentos_2026_10_19 e
-- arquivo_morto.mapa_colaboradores_2026_10_19 (schema fora da API).
--
-- VOLTAR como estava (depois de tirar a pausa):
--   update public.mapa_equipamentos m set no_mapa = b.no_mapa, posicao = b.posicao, heading = b.heading,
--     obra_id = b.obra_id, trecho_id = b.trecho_id, frente_id = b.frente_id, area_id = b.area_id,
--     localidade_id = b.localidade_id, km_atual = b.km_atual, operador_colaborador_id = b.operador_colaborador_id,
--     deslocamento = b.deslocamento, retorno_frete_id = b.retorno_frete_id, retorno_localidade_id = b.retorno_localidade_id
--   from arquivo_morto.mapa_equipamentos_2026_10_19 b where b.id = m.id;
--   update public.mapa_colaboradores m set obra_id = b.obra_id, frente_id = b.frente_id, area_id = b.area_id,
--     localidade_id = b.localidade_id, equipamento_id = b.equipamento_id, posicao_manual = b.posicao_manual,
--     diarista_no_mapa = b.diarista_no_mapa
--   from arquivo_morto.mapa_colaboradores_2026_10_19 b where b.id = m.id;
--   select cron.alter_job(jobid, active := true) from cron.job
--   where jobname in ('mapa_snapshot_diario','mapa_alertas_hora','equip_dias_centro_diario','colab_dias_centro_diario');

create table arquivo_morto.mapa_equipamentos_2026_10_19 as select * from public.mapa_equipamentos;
create table arquivo_morto.mapa_colaboradores_2026_10_19 as select * from public.mapa_colaboradores;
revoke all on arquivo_morto.mapa_equipamentos_2026_10_19, arquivo_morto.mapa_colaboradores_2026_10_19
  from public, anon, authenticated;

update public.mapa_colaboradores
set obra_id = null, frente_id = null, area_id = null, localidade_id = null, equipamento_id = null,
    posicao_manual = null, diarista_no_mapa = false;

update public.mapa_equipamentos
set no_mapa = false, posicao = null, heading = null, obra_id = null, trecho_id = null,
    frente_id = null, area_id = null, localidade_id = null, km_atual = null,
    operador_colaborador_id = null, deslocamento = null, retorno_frete_id = null,
    retorno_localidade_id = null;

select cron.alter_job(jobid, active := false) from cron.job
where jobname in ('mapa_snapshot_diario', 'mapa_alertas_hora', 'equip_dias_centro_diario', 'colab_dias_centro_diario');
