-- Ordem de compra: frete, outras despesas, impostos e desconto no cabeçalho, e
-- preço unitário com 4 casas.
--
-- Vem da carga das ordens de compra do Mais Controle (17/08/2026), que expôs dois
-- defeitos no modelo da OC. Os dois são de dinheiro e os dois foram MEDIDOS, não
-- supostos.
--
-- ## 1. preco_unitario com 2 casas erra combustível
--
-- A coluna era NUMERIC(14,2). O Mais Controle vende diesel a R$ 6,5770 (S10) e
-- R$ 6,3947 (S500) — quatro casas, que é como combustível é precificado em toda
-- parte. Com duas casas, 6,5770 vira 6,58 e a OC 2605 (13.859,66 litros) sai
-- R$ 91.196,56 em vez de R$ 91.155,00: **R$ 41,56 de erro numa OC só**.
--
-- Não é problema da carga, é da coluna: qualquer compra futura de diesel, gasolina
-- ou arla erraria do mesmo jeito. NUMERIC(14,4) ainda dá teto de
-- R$ 9.999.999.999,9999 de preço unitário.
--
-- A regra 3 do CLAUDE.md ("dinheiro é NUMERIC(14,2)") continua valendo para VALOR:
-- valor_total, valores de parcela, de rateio. Preço unitário é TAXA, não valor —
-- e `quantidade` já era NUMERIC(14,3) pelo mesmo motivo.
--
-- ## 2. A OC não tinha onde guardar frete, imposto nem desconto
--
-- O Mais Controle tem os quatro campos no rodapé da OC, e eles são usados de
-- verdade: das 17 ordens carregadas, 6 têm ajuste (desconto de R$ 3.835,95 na
-- 2592, frete de R$ 5,99 na 2601, desconto de R$ 22,62 na 2604, e centavos de
-- imposto em três). Sem as colunas, o `valor_total` da 2592 sairia
-- R$ 103.835,95 em vez de R$ 100.000,00.
--
-- ## Como o total passa a ser calculado
--
--   valor_total = round(soma(quantidade * preco_unitario)
--                       + frete + outras_despesas + impostos - desconto, 2)
--
-- Soma dos itens SEM arredondar item por item, e arredonda só no fim. É o que o
-- Mais Controle faz, e é o que faz as 17 fecharem ao centavo: a 2607, por
-- exemplo, só fecha porque 7.500,01618 + 2.500,0079650 - 0,02 = 10.000,0041
-- arredonda para 10.000,00. Arredondando por item daria 10.000,01.
--
-- O cálculo virou trigger BEFORE no cabeçalho, então `valor_total` é derivado de
-- verdade: não há caminho no app que consiga gravar um total que não venha dos
-- itens mais os ajustes. A escotilha `oc.recalc_suprimido` continua respeitada,
-- para carga em lote.

alter table public.oc_itens
  alter column preco_unitario type numeric(14,4);

alter table public.ordens_compra
  add column if not exists frete            numeric(14,2) not null default 0,
  add column if not exists outras_despesas  numeric(14,2) not null default 0,
  add column if not exists impostos         numeric(14,2) not null default 0,
  add column if not exists desconto         numeric(14,2) not null default 0;

comment on column public.ordens_compra.frete is
  'Frete somado ao total da OC. Espelha o campo (+) Frete do Mais Controle.';
comment on column public.ordens_compra.outras_despesas is
  'Outras despesas somadas ao total da OC.';
comment on column public.ordens_compra.impostos is
  'Impostos somados ao total da OC.';
comment on column public.ordens_compra.desconto is
  'Desconto SUBTRAIDO do total da OC. Guardar sempre positivo.';

-- Uma função só com a conta, chamada pelos dois gatilhos: item mudou, ou ajuste
-- do cabeçalho mudou. Duas cópias da mesma soma divergiriam no primeiro ajuste.
create or replace function public.fn_total_da_oc(
  p_oc uuid,
  p_frete numeric,
  p_outras numeric,
  p_impostos numeric,
  p_desconto numeric
)
returns numeric
language sql
stable
security definer
set search_path to ''
as $function$
  select round(
    coalesce((select sum(i.quantidade * i.preco_unitario)
                from public.oc_itens i
               where i.ordem_compra_id = p_oc), 0)
    + coalesce(p_frete, 0) + coalesce(p_outras, 0) + coalesce(p_impostos, 0)
    - coalesce(p_desconto, 0), 2)
$function$;

-- BEFORE no cabeçalho: o total é sempre derivado, em qualquer INSERT ou UPDATE.
create or replace function public.fn_total_oc_cabecalho()
returns trigger
language plpgsql
security definer
set search_path to ''
as $function$
begin
  if coalesce(current_setting('oc.recalc_suprimido', true), '') = '1' then
    return new;
  end if;
  new.valor_total := public.fn_total_da_oc(
    new.id, new.frete, new.outras_despesas, new.impostos, new.desconto);
  return new;
end $function$;

drop trigger if exists trg_total_oc_cabecalho on public.ordens_compra;
create trigger trg_total_oc_cabecalho
before insert or update on public.ordens_compra
for each row execute function public.fn_total_oc_cabecalho();

-- AFTER nos itens: mexeu em item, recalcula o cabeçalho (que agora soma os
-- ajustes dele também).
create or replace function public.fn_recalcular_total_oc()
returns trigger
language plpgsql
security definer
set search_path to ''
as $function$
declare v_oc uuid := coalesce(new.ordem_compra_id, old.ordem_compra_id);
begin
  if coalesce(current_setting('oc.recalc_suprimido', true), '') = '1' then
    return null;
  end if;

  update public.ordens_compra o
     set valor_total = public.fn_total_da_oc(
           o.id, o.frete, o.outras_despesas, o.impostos, o.desconto)
   where o.id = v_oc;
  return null;
end $function$;

revoke all on function public.fn_total_da_oc(uuid, numeric, numeric, numeric, numeric) from public;
grant execute on function public.fn_total_da_oc(uuid, numeric, numeric, numeric, numeric) to authenticated;
