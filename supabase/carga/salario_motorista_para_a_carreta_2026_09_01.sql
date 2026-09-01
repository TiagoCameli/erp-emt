-- =============================================================
-- O salario de cada motorista de carreta vai para a carreta dele
--
-- Pedido do Tiago em 01/09/2026: "a maioria dos salarios dos motoristas das
-- carretas estao no local errado, tem que colocar para a sua propria carreta".
--
-- Medido antes de aplicar: NAO era a maioria, era a TOTALIDADE. Os 30
-- documentos de salario dos 5 motoristas estavam todos fora da carreta --
-- nenhum dentro.
--
--   Escritorio Central .......... R$ 37.377,63   (13 documentos)
--   009 - BR-364/AC Lote 09 & 10  R$ 28.699,42   (15 documentos)
--   007 - AC 405 - Lote 2 ....... R$  4.692,47   ( 1 documento)
--   004 - Galpao Silo ........... R$  2.697,72   ( 1 documento)
--                                 -------------
--                                 R$ 73.467,24   (30 documentos)
--
-- ============================================================
-- POR QUE SO O HISTORICO ESTAVA ERRADO
-- ============================================================
-- O cadastro ja tinha sido corrigido em 28/08/2026: `colaboradores.centro_custo_id`
-- de cada motorista aponta para a carreta dele, e a folha de 08/2026, aprovada,
-- gerou os 4 lancamentos `origem = 'folha'` JA no centro certo (LAN-2026-6688,
-- 6693, 6707, 6709).
--
-- O que nunca foi movido foi o HISTORICO: os salarios lancados a mao antes disso,
-- de 02/2025 a 08/2026, que identificam a pessoa pelo `fornecedor_id` (a EMT
-- lanca o salario com o proprio colaborador no campo de fornecedor -- a descricao
-- e sempre a mesma frase, sem nome).
--
-- ============================================================
-- O PAREAMENTO
-- ============================================================
-- Nao foi adivinhado: saiu dos dados e o Tiago confirmou em 28/08/2026.
--
--   Francisco Freire Magalhaes Neto ... SQS 7E01
--   Jacson Lima Fagundes .............. SQU 9C94
--   Micharle Rocha da Silva ........... SQU 9D04
--   Ederson Guimaraes de Oliveira ..... SQU 9D04  (saiu; dirigia antes do Micharle)
--   Rosildo de Souza Menezes .......... SQU 9D14
--
-- ============================================================
-- POR QUE UPDATE, E POR QUE ELE BASTA AQUI
-- ============================================================
-- UPDATE de `centro_custo_id`, nunca DELETE+INSERT: recriar a linha perde
-- `categoria_id`, que e outra dimensao do rateio.
--
-- E aqui nao ha divisao nem arredondamento a fazer: os 30 documentos tem UM
-- rateio cada (conferido antes de aplicar), entao a soma por documento nao se
-- mexe e a `trg_valida_soma_do_rateio` nao tem o que reprovar. Rateio dividido
-- exigiria maior resto, com a ultima parte por diferenca.
--
-- ============================================================
-- O QUE ISSO CUSTA, E QUE E DECISAO DELE
-- ============================================================
-- Tira R$ 28.699,42 da obra BR-364 e R$ 37.377,63 do Escritorio Central. E
-- inclui salario de 2025 do Francisco (R$ 24.455,65, em Escritorio Central,
-- Galpao Silo e AC 405) de meses em que a SQS 7E01 ainda nao aparecia em
-- lancamento nenhum. Nao e erro: e a regra que ele deu em 28/08 -- "o custo e do
-- motorista, e o motorista e da carreta".
--
-- ============================================================
-- APLICADO EM 01/09/2026 pelo MCP. Este arquivo e o registro.
-- =============================================================

with motoristas as (
  select
    f.id as fornecedor_id,
    case
      when f.razao_social ilike '%FRANCISCO FREIRE%' then 'af45def4-f5c9-4713-be2c-05ebd6b150d2'::uuid
      when f.razao_social ilike '%JACSON LIMA%'      then 'f41ceac0-89a2-4330-ab8a-0111ed55aaee'::uuid
      when f.razao_social ilike '%MICHARLE%'         then '8301d9f6-911e-42b8-af64-072d86266c9d'::uuid
      when f.razao_social ilike '%EDERSON GUIMAR%'   then '8301d9f6-911e-42b8-af64-072d86266c9d'::uuid
      when f.razao_social ilike '%ROSILDO DE SOUZA%' then '728cb732-113c-4f39-a5db-a287abae20fe'::uuid
    end as carreta_id
  from public.fornecedores f
  where f.razao_social ilike '%FRANCISCO FREIRE%'
     or f.razao_social ilike '%JACSON LIMA%'
     or f.razao_social ilike '%MICHARLE%'
     or f.razao_social ilike '%EDERSON GUIMAR%'
     or f.razao_social ilike '%ROSILDO DE SOUZA%'
),
alvo as (
  select r.id as rateio_id, m.carreta_id
  from public.lancamento_rateios r
  join public.lancamentos l on l.id = r.lancamento_id
  join motoristas m on m.fornecedor_id = l.fornecedor_id
  where l.status <> 'cancelado'
    -- `SAL_RIO` com `_` de um caractere pega SALARIO e SALÁRIO, e junto vem o
    -- decimo terceiro e o adiantamento de salario, que sao a mesma folha.
    and l.descricao ilike '%SAL_RIO%'
    and r.centro_custo_id <> m.carreta_id
)
update public.lancamento_rateios r
set centro_custo_id = a.carreta_id
from alvo a
where r.id = a.rateio_id;

-- =============================================================
-- PROVA
-- =============================================================
do $$
declare
  v_fora bigint;
  v_salario numeric;
begin
  -- 1. Nao sobrou salario de motorista fora da carreta dele.
  select count(*) into v_fora
  from public.lancamento_rateios r
  join public.lancamentos l on l.id = r.lancamento_id
  join public.fornecedores f on f.id = l.fornecedor_id
  join public.centros_custo c on c.id = r.centro_custo_id
  where l.status <> 'cancelado'
    and l.descricao ilike '%SAL_RIO%'
    and (f.razao_social ilike '%FRANCISCO FREIRE%' or f.razao_social ilike '%JACSON LIMA%'
      or f.razao_social ilike '%MICHARLE%' or f.razao_social ilike '%EDERSON GUIMAR%'
      or f.razao_social ilike '%ROSILDO DE SOUZA%')
    and c.pai_id is distinct from (select id from public.centros_custo where nome = '001 - Carretas EMT');

  if v_fora > 0 then
    raise exception 'sobraram % rateio(s) de salario de motorista fora das carretas', v_fora;
  end if;

  -- 2. O DINHEIRO NAO MUDOU, so de centro. Linha de controle: a soma dos
  --    salarios desses 5 e a mesma de antes.
  select round(sum(r.valor), 2) into v_salario
  from public.lancamento_rateios r
  join public.lancamentos l on l.id = r.lancamento_id
  join public.fornecedores f on f.id = l.fornecedor_id
  where l.status <> 'cancelado'
    and l.descricao ilike '%SAL_RIO%'
    and (f.razao_social ilike '%FRANCISCO FREIRE%' or f.razao_social ilike '%JACSON LIMA%'
      or f.razao_social ilike '%MICHARLE%' or f.razao_social ilike '%EDERSON GUIMAR%'
      or f.razao_social ilike '%ROSILDO DE SOUZA%');

  if v_salario <> 73467.24 then
    raise exception 'a soma dos salarios mudou: esperado 73467.24, veio %', v_salario;
  end if;

  raise notice 'salario dos 5 motoristas: R$ % em 4 carretas, nenhum fora', v_salario;
end
$$;
