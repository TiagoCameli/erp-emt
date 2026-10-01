-- Medição de Contratos: regra de arredondamento nova "item_truncado" (pedido de 01/10/2026, Obra 012).
-- A planilha contratual da Obra 012 (CT 030/2026) tem, em todos os 634 serviços, valor =
-- TRUNCAR(quantidade x preço com BDI, 2), e a soma desses valores é o valor do contrato
-- (R$ 13.735.512,00). Na medição vale o mesmo: cada item é truncado em cada medição e o acumulado é
-- a soma das medições (regra da spec 6.2 para todas as regras). Aditivo: amplia o check e acrescenta
-- um ramo em fn_mc_valor; as outras regras não mudam.

alter table public.mc_contratos drop constraint mc_contratos_regra_arredondamento_check;
alter table public.mc_contratos add constraint mc_contratos_regra_arredondamento_check
  check (regra_arredondamento = any (array['item_por_medicao', 'item_por_acumulado', 'sem_arredondar', 'item_truncado']));

create or replace function public.fn_mc_valor(p_qtd numeric, p_preco numeric, p_regra text)
returns numeric language sql immutable set search_path to '' as $$
  select case p_regra
    when 'sem_arredondar' then p_qtd * p_preco
    when 'item_por_medicao' then round(p_qtd * p_preco, 2)
    when 'item_por_acumulado' then round(p_qtd * p_preco, 2)
    when 'item_truncado' then trunc(p_qtd * p_preco, 2)
  end;
$$;
