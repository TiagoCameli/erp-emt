-- Fix-forward da 20260722160001: o advisor de performance
-- (multiple_permissive_policies) acusou SELECT e INSERT de
-- condicoes_pagamento com duas policies permissivas para o mesmo papel/ação
-- (a de compras já existente + a _cadastro que acabou de ser criada). Mesmo
-- padrão da 20260721170002 (fix-forward, não se edita migration já
-- aplicada): dobra a condição nova dentro da policy existente com OR, e
-- remove as policies _cadastro que ficaram redundantes. A de UPDATE
-- continua como está (é a única policy de update na tabela, não duplica).
--
-- Rollback:
--   alter policy condicoes_pagamento_select on public.condicoes_pagamento
--     using (
--       (select public.tem_permissao('compras.ordens', 'ver'))
--       or (select public.tem_permissao('compras.cotacoes', 'ver'))
--     );
--   alter policy condicoes_pagamento_insert on public.condicoes_pagamento
--     with check (
--       (select public.tem_permissao('compras.ordens', 'criar'))
--       or (select public.tem_permissao('compras.ordens', 'editar'))
--       or (select public.tem_permissao('compras.cotacoes', 'criar'))
--       or (select public.tem_permissao('compras.cotacoes', 'editar'))
--     );
--   create policy condicoes_pagamento_select_cadastro on public.condicoes_pagamento
--     for select to authenticated
--     using ((select public.tem_permissao('cadastros.condicoes-pagamento', 'ver')));
--   create policy condicoes_pagamento_insert_cadastro on public.condicoes_pagamento
--     for insert to authenticated
--     with check ((select public.tem_permissao('cadastros.condicoes-pagamento', 'criar')));

alter policy condicoes_pagamento_select on public.condicoes_pagamento
  using (
    (select public.tem_permissao('compras.ordens', 'ver'))
    or (select public.tem_permissao('compras.cotacoes', 'ver'))
    or (select public.tem_permissao('cadastros.condicoes-pagamento', 'ver'))
  );

alter policy condicoes_pagamento_insert on public.condicoes_pagamento
  with check (
    (select public.tem_permissao('compras.ordens', 'criar'))
    or (select public.tem_permissao('compras.ordens', 'editar'))
    or (select public.tem_permissao('compras.cotacoes', 'criar'))
    or (select public.tem_permissao('compras.cotacoes', 'editar'))
    or (select public.tem_permissao('cadastros.condicoes-pagamento', 'criar'))
  );

drop policy condicoes_pagamento_select_cadastro on public.condicoes_pagamento;
drop policy condicoes_pagamento_insert_cadastro on public.condicoes_pagamento;
