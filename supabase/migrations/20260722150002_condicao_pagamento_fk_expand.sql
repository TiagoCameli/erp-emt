-- Expand (estratégia expand-contract): adiciona condicao_pagamento_id NULLABLE
-- em ordens_compra e cotacao_fornecedores, faz backfill pela descrição e semeia
-- condicao_parcelas para as condições existentes. As colunas texto
-- `condicao_pagamento` PERMANECEM intactas nas duas tabelas — o código em
-- produção ainda lê/escreve nelas. NÃO faz `set not null` nem `drop column`;
-- isso é a Task 9 (contract), só depois do deploy do código que passa a usar
-- o id. Migration idempotente (pode rodar de novo sem duplicar dado).
--
-- Estado real checado antes de escrever (MCP execute_sql, 2026-07-22):
--   - select distinct condicao_pagamento from ordens_compra where ... not null       -> nenhuma linha
--   - select distinct condicao_pagamento from cotacao_fornecedores where ... not null -> nenhuma linha
--   - condicoes_pagamento já tinha: À vista, 7/15/21/28/30/45/60 dias, 30/60 dias,
--     30/60/90 dias, Boleto 30 dias (seed da migration 20260721170001).
--   - ordens_compra: 1 linha, nenhuma com condicao_pagamento preenchido.
--   - cotacao_fornecedores: 2 linhas, nenhuma com condicao_pagamento preenchido.
-- Ou seja, hoje o backfill por igualdade de texto não casa nada (não há texto
-- gravado); todas as OCs caem no fallback 'À vista' do Step 4. O Step 3
-- (garantir condição para texto usado) e o `update ... from` do Step 4 ficam
-- na migration para cobrir corretamente o dia em que já existir dado gravado
-- (produção real, ou re-execução em outro ambiente/branch com dados).
--
-- Rollback:
--   drop index if exists public.idx_ordens_compra_condicao;
--   drop index if exists public.idx_cotacao_fornecedores_condicao;
--   alter table public.cotacao_fornecedores drop column if exists condicao_pagamento_id;
--   alter table public.ordens_compra drop column if exists condicao_pagamento_id;
--   -- (parcelas semeadas por este arquivo podem ficar; são aditivas e não
--   -- quebram nada. Se quiser reverter 100%, apagar as linhas de
--   -- condicao_parcelas cujo condicao_id não tinha parcela antes desta
--   -- migration.)

-- Step 2: semear parcela única (100%) para condições que ainda não têm
-- nenhuma parcela cadastrada. "À vista" -> 0 dias; senão, primeiro número
-- encontrado na descrição (ex.: "30 dias" -> 30, "30/60 dias" -> 30 — a
-- quebra em múltiplas parcelas reais fica fora do escopo desta migration
-- aditiva, é ajuste de cadastro posterior via UI/Task de negócio).
insert into public.condicao_parcelas (condicao_id, numero, dias_offset, percentual)
select c.id,
       1,
       case when c.descricao ilike '%vista%' then 0
            else coalesce((regexp_match(c.descricao, '(\d+)'))[1]::int, 0) end,
       100.00
from public.condicoes_pagamento c
where not exists (select 1 from public.condicao_parcelas p where p.condicao_id = c.id);

-- Step 3: garantir uma condição de pagamento para todo texto já usado nas
-- transações (ordens_compra e cotacao_fornecedores) que ainda não existe no
-- cadastro. Hoje não há texto gravado em nenhuma das duas tabelas, então este
-- insert não afeta nada — fica aqui para cobrir dado real/futuro.
insert into public.condicoes_pagamento (descricao)
select distinct condicao_pagamento from public.ordens_compra
where condicao_pagamento is not null
  and condicao_pagamento not in (select descricao from public.condicoes_pagamento)
on conflict (descricao) do nothing;

insert into public.condicoes_pagamento (descricao)
select distinct condicao_pagamento from public.cotacao_fornecedores
where condicao_pagamento is not null
  and condicao_pagamento not in (select descricao from public.condicoes_pagamento)
on conflict (descricao) do nothing;

-- Repete o Step 2 para as condições recém-criadas no Step 3 (mesma regra:
-- "à vista" -> 0 dias, senão primeiro número da descrição, fallback 0 dias).
insert into public.condicao_parcelas (condicao_id, numero, dias_offset, percentual)
select c.id,
       1,
       case when c.descricao ilike '%vista%' then 0
            else coalesce((regexp_match(c.descricao, '(\d+)'))[1]::int, 0) end,
       100.00
from public.condicoes_pagamento c
where not exists (select 1 from public.condicao_parcelas p where p.condicao_id = c.id);

-- Step 4: colunas FK NULLABLE + backfill. Coluna texto NÃO é tocada.
alter table public.ordens_compra
  add column if not exists condicao_pagamento_id uuid references public.condicoes_pagamento (id);

update public.ordens_compra o
set condicao_pagamento_id = c.id
from public.condicoes_pagamento c
where c.descricao = o.condicao_pagamento
  and o.condicao_pagamento_id is null;

-- Linhas sem texto (ou cujo texto não bateu com nenhuma condição) recebem o
-- fallback 'À vista'. A coluna segue NULLABLE nesta fase (expand); a garantia
-- de "sempre preenchida" vira `not null` só na Task 9 (contract).
update public.ordens_compra
set condicao_pagamento_id = (select id from public.condicoes_pagamento where descricao = 'À vista' limit 1)
where condicao_pagamento_id is null;

alter table public.cotacao_fornecedores
  add column if not exists condicao_pagamento_id uuid references public.condicoes_pagamento (id);

update public.cotacao_fornecedores f
set condicao_pagamento_id = c.id
from public.condicoes_pagamento c
where c.descricao = f.condicao_pagamento
  and f.condicao_pagamento_id is null;

-- Índices de cobertura da FK (advisor unindexed_foreign_keys), padrão do projeto.
create index if not exists idx_ordens_compra_condicao on public.ordens_compra (condicao_pagamento_id);
create index if not exists idx_cotacao_fornecedores_condicao on public.cotacao_fornecedores (condicao_pagamento_id);
