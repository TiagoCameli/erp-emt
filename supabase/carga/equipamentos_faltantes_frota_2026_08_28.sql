-- Cadastra os 3 equipamentos que estavam na frota e faltavam no ERP.
--
-- Aplicado no banco em 28/08/2026.
--
-- ## O que estava errado
--
-- O Tiago mandou o relatorio de frota do Gestao de Obras (frota-2026-08-28.pdf,
-- 64 equipamentos) e pediu para conferir se cada um tinha etapa no centro de
-- custo de manutencao. A conferencia devolveu:
--
--   * 61 equipamentos no erp-emt, e TODOS os 61 ja tinham etapa
--     (57 em "Manutencao/Documentacao de Equipamentos" + 4 em "001 - Carretas EMT");
--   * 3 equipamentos da frota que nao existiam no erp-emt, e por isso nao tinham
--     etapa nenhuma:
--
--       CS-006   Caminhao DAF - Nissey CF - 310                        (Semirreboque, DAF, 2025)
--       IMP-004  SISTEMA DE TRANSPORTE ROLL-ON/ROLL-OFF BASCULANTE     (Implementos)
--       IMP-005  PLATAFORMA ROLL ON - ROLL OFF 6.50 M - CARROCERIA ABERTA (Implementos, FACCHINI, 2025)
--
-- Os tres sao aquisicao/implemento recente: entraram na frota e ninguem cadastrou
-- no ERP. Enquanto nao existissem aqui, nenhum custo de manutencao deles tinha
-- onde ser lancado.
--
-- A 64a linha do relatorio e o "Equipamento Desconhecido" (tipo Sentinel, marca
-- Desconhecido, INATIVO, sem patrimonio). E registro de placeholder, nao
-- equipamento, entao fica de fora de proposito.
--
-- ## Por que so o insert de equipamentos
--
-- A etapa nasce sozinha: `trg_equipamento_cria_etapa` chama
-- `fn_equipamento_cria_etapa_manutencao()`, que insere o centro de custo com
-- `nome = descricao`, `nivel = 2`, `pai_id` = o centro raiz de tipo 'manutencao' e
-- `equipamento_id` = o novo equipamento. Criar a etapa a mao aqui produziria a
-- SEGUNDA etapa de cada um.
--
-- `controle_por = 'horimetro'` porque e o unico valor em uso nos 61 existentes, e
-- e o que o relatorio de frota marca para os tres (coluna "Medicao").
--
-- CS-006 vai para Manutencao, e nao para "001 - Carretas EMT", porque e para la
-- que a trigger manda e porque as 4 carretas de la sao especificamente os XF 530
-- (CS-002 a CS-005) que o Tiago moveu em 27/08. O CS-001, que tambem e cavalo,
-- esta na Manutencao. Se o DAF pertencer ao grupo das carretas, e so trocar o
-- pai da etapa.
--
-- ## Provado antes de aplicar
--
-- O mesmo insert rodou numa transacao desfeita: equipamentos 61 -> 64, etapas da
-- Manutencao 57 -> 60, e as tres etapas sairam da trigger com nivel 2, tipo nulo
-- (igual as 57 existentes) e ativas. Depois de aplicar: 64 equipamentos, ZERO sem
-- etapa, 60 + 4 = 64.
--
-- ## O que este arquivo NAO resolve
--
-- Duas divergencias no sentido contrario, que continuam abertas e sao decisao do
-- Tiago:
--
--   1. "CAMINHAO BOIADEIRO/MIILHO - L1620" (placa MZO 7876) existe no erp-emt,
--      tem etapa e JA TEM R$ 1.757,95 lancados em 3 lancamentos -- mas nao
--      aparece no relatorio de frota.
--   2. EH-004, TRE-002 e TRE-003 estao INATIVOS na frota e ATIVOS aqui, entao
--      continuam aceitando lancamento de manutencao.

insert into public.equipamentos (codigo, descricao, tipo, marca, ano, controle_por, ativo)
values
  ('CS-006', 'Caminhão DAF - Nissey CF - 310', 'Semirreboque', 'DAF', 2025, 'horimetro', true),
  ('IMP-004', 'SISTEMA DE TRANSPORTE ROLL-ON/ROLL-OFF BASCULANTE', 'Implementos', null, null, 'horimetro', true),
  ('IMP-005', 'PLATAFORMA ROLL ON - ROLL OFF 6.50 M - CARROCERIA ABERTA', 'Implementos', 'FACCHINI', 2025, 'horimetro', true);

-- Linha de controle: depois desta carga nao pode existir equipamento sem etapa.
do $conferencia$
declare v_sem_etapa int; v_total int;
begin
  select count(*) into v_total from public.equipamentos;
  select count(*) into v_sem_etapa
  from public.equipamentos e
  where not exists (select 1 from public.centros_custo c where c.equipamento_id = e.id);

  if v_sem_etapa > 0 then
    raise exception 'Ha % equipamento(s) sem etapa de centro de custo. A trigger nao rodou.', v_sem_etapa;
  end if;

  raise notice '% equipamentos, nenhum sem etapa.', v_total;
end $conferencia$;
