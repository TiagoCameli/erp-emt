-- Grupo de recolhimento do encargo patronal. Nulo = o encargo não vira guia.
alter table public.folha_encargos
  add column if not exists grupo_recolhimento text
    check (grupo_recolhimento is null or length(btrim(grupo_recolhimento)) between 1 and 60);

-- Snapshot do grupo no item: folha_item_encargos não tem FK para folha_encargos
-- (só o nome), então casar por nome quebraria ao renomear um encargo. O grupo é
-- congelado na geração, mesmo princípio que o percentual já usa.
alter table public.folha_item_encargos
  add column if not exists grupo_recolhimento text;

-- Onde cada retido do trabalhador entra, e o dia único das guias.
alter table public.folha_parametros
  add column if not exists grupo_recolhimento_inss text,
  add column if not exists grupo_recolhimento_irrf text,
  add column if not exists dia_vencimento_guias smallint
    check (dia_vencimento_guias is null or dia_vencimento_guias between 1 and 31),
  add column if not exists dia_pagamento_salario smallint
    check (dia_pagamento_salario is null or dia_pagamento_salario between 1 and 31);

-- NENHUM valor semeado: config vazia tem que gerar zero guia.
