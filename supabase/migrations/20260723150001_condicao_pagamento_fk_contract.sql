-- CONTRACT da estratégia expand-contract (feature condições de pagamento).
-- O código em produção já usa SÓ condicao_pagamento_id (a FK); a coluna texto
-- condicao_pagamento ficou inerte. Confirmado antes de aplicar: nenhum código de
-- app, função ou view referencia a coluna texto; todas as OCs têm a FF preenchida
-- (0 nulas). Esta migration faz o backfill defensivo, torna a FK obrigatória na OC
-- e dropa as colunas texto.
--
-- Rollback:
--   alter table public.ordens_compra add column condicao_pagamento text;
--   alter table public.cotacao_fornecedores add column condicao_pagamento text;
--   update public.ordens_compra o set condicao_pagamento = c.descricao
--     from public.condicoes_pagamento c where c.id = o.condicao_pagamento_id;
--   update public.cotacao_fornecedores f set condicao_pagamento = c.descricao
--     from public.condicoes_pagamento c where c.id = f.condicao_pagamento_id;
--   alter table public.ordens_compra alter column condicao_pagamento_id drop not null;

-- Backfill defensivo de qualquer OC sem FK criada na janela expand->deploy.
update public.ordens_compra o
  set condicao_pagamento_id = c.id
  from public.condicoes_pagamento c
  where o.condicao_pagamento_id is null and c.descricao = o.condicao_pagamento;

update public.ordens_compra
  set condicao_pagamento_id =
    (select id from public.condicoes_pagamento where descricao = 'À vista' limit 1)
  where condicao_pagamento_id is null;

-- Toda OC precisa de condição de pagamento.
alter table public.ordens_compra
  alter column condicao_pagamento_id set not null;

-- Dropa as colunas texto antigas (inertes).
alter table public.ordens_compra drop column condicao_pagamento;
alter table public.cotacao_fornecedores drop column condicao_pagamento;
