-- Ajuste de performance/idioma: envolve tem_permissao em (select ...) nas
-- policies de condicoes_pagamento, como todas as outras policies do projeto.
-- Sem o (select), o Postgres reavalia a função por linha (advisor
-- auth_rls_initplan). Fix-forward: a 20260721170001 já rodou "cru".

alter policy condicoes_pagamento_select on public.condicoes_pagamento
  using (
    (select public.tem_permissao('compras.ordens', 'ver'))
    or (select public.tem_permissao('compras.cotacoes', 'ver'))
  );

alter policy condicoes_pagamento_insert on public.condicoes_pagamento
  with check (
    (select public.tem_permissao('compras.ordens', 'criar'))
    or (select public.tem_permissao('compras.ordens', 'editar'))
    or (select public.tem_permissao('compras.cotacoes', 'criar'))
    or (select public.tem_permissao('compras.cotacoes', 'editar'))
  );
