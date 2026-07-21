-- Índice de cobertura da FK created_by (advisor unindexed_foreign_keys),
-- no mesmo padrão das demais tabelas do projeto.
create index idx_condicoes_pagamento_created_by
  on public.condicoes_pagamento (created_by);
