-- =============================================================
-- O que e do Ederson vai para a SQU 9D04
--
-- Fecha a serie de 01/09/2026:
--   1. salario_motorista_para_a_carreta_2026_09_01.sql   (PR #274)
--   2. motorista_carreta_qualquer_pagamento_2026_09_01.sql (PR #275)
--   3. este
--
-- Ele ficou de fora das duas primeiras porque nao foi citado em nenhuma das
-- frases do Tiago. Perguntei, e a resposta foi: "o do ederson vai para a
-- SQU 9D04". Mesma carreta do Micharle, que assumiu quando ele saiu.
--
-- ============================================================
-- ELE NAO ERA CLT, E ISSO EXPLICA O FILTRO
-- ============================================================
-- EDERSON GUIMARAES DE OLIVEIRA existe so como FORNECEDOR. O pagamento mensal
-- dele esta lancado como "PRESTACAO DE SERVICOS" (R$ 5.166,66 em 04/2026 e
-- R$ 1.166,67 em 05/2026, quando saiu) -- nao como salario. Por isso a primeira
-- rodada, que filtrava `descricao ilike '%SAL_RIO%'`, nao pegou nada dele.
--
-- Licao para a proxima: filtrar por especie na DESCRICAO acha o que a EMT
-- escreveu, nao o que a coisa e. Quem trabalha sem carteira aparece com outro
-- nome no mesmo lugar.
--
-- ============================================================
-- O QUE MOVEU
-- ============================================================
-- 11 rateios, 10 documentos, R$ 9.524,19 no total apos a mudanca. Sairam da
-- BR-364 (alimentacao, troca de pneu, prestacao de servicos) e das outras tres
-- carretas.
--
-- Mesma excecao das rodadas anteriores: o que aponta para "Aquisicao de
-- Equipamentos" nao se mexe. O Ederson nao tinha nada la, entao a excecao nao
-- teve efeito aqui -- mas fica no filtro para a regra ser a MESMA das outras
-- duas, e nao uma variante que alguem precise comparar depois.
--
-- ============================================================
-- DOIS DOCUMENTOS FICARAM COM TRES LINHAS NO MESMO CENTRO
-- ============================================================
-- LAN-2026-1160 (reembolso de passagem, R$ 193,86) e LAN-2026-2400 (alimentacao
-- viagem, R$ 500,00) estavam divididos em tres, um pedaco em cada carreta.
-- Agora os tres pedacos apontam para a SQU 9D04.
--
-- Deixei as tres linhas em vez de fundir numa so, de proposito: fundir e
-- DELETE + UPDATE, e o delete perderia o `categoria_id` das linhas apagadas, que
-- e outra dimensao do rateio. Tres linhas no mesmo centro o banco aceita, a soma
-- fecha, e a planilha por rateio ja junta por `centroId` na exibicao.
--
-- LINHA DE CONTROLE: total geral de rateios da empresa inalterado --
-- R$ 115.583.489,50 antes e depois, diferenca 0,00.
--
-- APLICADO EM 01/09/2026 pelo MCP. Este arquivo e o registro.
-- =============================================================

with ed as (
  select f.id as pessoa_id
  from public.fornecedores f
  where f.razao_social ilike '%EDERSON GUIMAR%'
  union all
  select co.id
  from public.colaboradores co
  where co.nome ilike '%EDERSON GUIMAR%'
),
alvo as (
  select distinct r.id as rateio_id
  from public.lancamento_rateios r
  join public.lancamentos l on l.id = r.lancamento_id
  join ed on ed.pessoa_id = l.fornecedor_id or ed.pessoa_id = l.colaborador_id
  join public.centros_custo c on c.id = r.centro_custo_id
  left join public.centros_custo raiz on raiz.id = c.pai_id
  where l.status <> 'cancelado'
    -- A excecao se le na RAIZ: a mesma maquina existe com o mesmo nome sob
    -- "Aquisicao de Equipamentos" e sob "Manutencao/Documentacao de Equipamentos".
    and coalesce(raiz.nome, c.nome) <> 'Aquisição de Equipamentos'
)
update public.lancamento_rateios r
set centro_custo_id = '8301d9f6-911e-42b8-af64-072d86266c9d'::uuid  -- SQU 9D04
from alvo a
where r.id = a.rateio_id
  and r.centro_custo_id <> '8301d9f6-911e-42b8-af64-072d86266c9d'::uuid;

-- =============================================================
-- PROVA
-- =============================================================
do $$
declare
  v_fora bigint;
  v_total numeric;
begin
  select count(*), round(coalesce(sum(r.valor), 0), 2)
    into v_fora, v_total
  from public.lancamento_rateios r
  join public.lancamentos l on l.id = r.lancamento_id
  left join public.fornecedores f on f.id = l.fornecedor_id
  left join public.colaboradores co on co.id = l.colaborador_id
  where l.status <> 'cancelado'
    and (coalesce(f.razao_social, '') ilike '%EDERSON GUIMAR%'
      or coalesce(co.nome, '') ilike '%EDERSON GUIMAR%')
    and r.centro_custo_id <> '8301d9f6-911e-42b8-af64-072d86266c9d'::uuid;

  if v_fora > 0 then
    raise exception 'sobraram % rateio(s) do Ederson fora da SQU 9D04, somando %', v_fora, v_total;
  end if;

  raise notice 'Ederson: tudo na SQU 9D04';
end
$$;
