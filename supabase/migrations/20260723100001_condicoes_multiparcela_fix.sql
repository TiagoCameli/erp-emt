-- Fix de DADO (bug #1 do QA de Compras): a migração que converteu condições
-- de pagamento de texto livre para parcelas estruturadas
-- (20260722150001_condicao_parcelas.sql + carga inicial) parseou só o
-- primeiro número de condições multi-parcela, então "30/60 dias" e
-- "30/60/90 dias" ficaram com 1 parcela (30 dias / 100%) em vez de 2 e 3
-- parcelas. A lógica de recebimento (recebimento_parcelas_condicao) está
-- correta; só os dados de condicao_parcelas estão errados. Corrige com
-- divisão igual entre as parcelas.
--
-- Caminho: a RPC salvar_condicao_parcelas(condicao_id, jsonb) existe e faz
-- exatamente isso (valida soma=100, delete+insert), mas ela checa
-- tem_permissao(..., 'editar') via auth.uid(). Rodando como migration
-- (service role / postgres), auth.uid() é null, então a checagem barra:
--   ERRO: Sem permissao para editar condicoes de pagamento
-- Confirmado testando a RPC dentro de "begin; ... rollback;" antes de
-- escrever esta migration. Por isso o delete+insert é feito direto em
-- condicao_parcelas abaixo (mesmo efeito da função, sem o gate de
-- permissão, que não faz sentido para uma migration).
--
-- Rollback (volta cada condição para 1 parcela do 1º número / 100%):
--   delete from public.condicao_parcelas
--     where condicao_id = (select id from public.condicoes_pagamento where descricao = '30/60 dias');
--   insert into public.condicao_parcelas (condicao_id, numero, dias_offset, percentual)
--     values ((select id from public.condicoes_pagamento where descricao = '30/60 dias'), 1, 30, 100.00);
--
--   delete from public.condicao_parcelas
--     where condicao_id = (select id from public.condicoes_pagamento where descricao = '30/60/90 dias');
--   insert into public.condicao_parcelas (condicao_id, numero, dias_offset, percentual)
--     values ((select id from public.condicoes_pagamento where descricao = '30/60/90 dias'), 1, 30, 100.00);

-- "30/60 dias" -> 2 parcelas iguais (50% / 50%)
delete from public.condicao_parcelas
  where condicao_id = (select id from public.condicoes_pagamento where descricao = '30/60 dias');

insert into public.condicao_parcelas (condicao_id, numero, dias_offset, percentual)
values
  ((select id from public.condicoes_pagamento where descricao = '30/60 dias'), 1, 30, 50.00),
  ((select id from public.condicoes_pagamento where descricao = '30/60 dias'), 2, 60, 50.00);

-- "30/60/90 dias" -> 3 parcelas iguais (33.33% / 33.33% / 33.34%, a última
-- absorve a diferença de arredondamento para fechar em 100.00)
delete from public.condicao_parcelas
  where condicao_id = (select id from public.condicoes_pagamento where descricao = '30/60/90 dias');

insert into public.condicao_parcelas (condicao_id, numero, dias_offset, percentual)
values
  ((select id from public.condicoes_pagamento where descricao = '30/60/90 dias'), 1, 30, 33.33),
  ((select id from public.condicoes_pagamento where descricao = '30/60/90 dias'), 2, 60, 33.33),
  ((select id from public.condicoes_pagamento where descricao = '30/60/90 dias'), 3, 90, 33.34);

-- Garantia: soma de percentual por condição afetada deve ser exatamente 100.
do $$
declare
  v_bad record;
begin
  for v_bad in
    select cp.descricao, sum(p.percentual) as soma
    from public.condicoes_pagamento cp
    join public.condicao_parcelas p on p.condicao_id = cp.id
    where cp.descricao in ('30/60 dias', '30/60/90 dias')
    group by cp.descricao
    having round(sum(p.percentual), 2) <> 100.00
  loop
    raise exception 'condicao % com soma % (esperado 100.00)', v_bad.descricao, v_bad.soma;
  end loop;
end $$;
