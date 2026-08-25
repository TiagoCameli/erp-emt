-- Terceira parte: recalcula o que a conversao deixou para tras.
--
-- Erro meu na 20260825120000: converti `encargos_percentual` em
-- `desconto_percentual` e zerei o encargo, mas nao refiz os valores DERIVADOS
-- dele. O item do CLELTON ficou com o dado novo certo (desconto 7,5% = R$
-- 121,58, encargo 0) e os totais velhos: custo_total R$ 2.028,58 (ainda com o
-- encargo que nao existe mais) e valor_liquido R$ 1.907,00 (ainda sem o
-- desconto). Os totais da folha tambem: valor_encargos R$ 121,58 e
-- valor_descontos R$ 0,00.
--
-- Achei conferindo a linha depois de aplicar, nao pelo `success` do apply --
-- UPDATE que muda coluna de origem sem refazer a derivada nao da erro nenhum.
--
-- As formulas sao as MESMAS das funcoes (fn_editar_item_folha e fn_gerar_folha),
-- porque um recalculo com formula propria e uma terceira verdade sobre o mesmo
-- dinheiro. Vale so para folha em rascunho, pelo mesmo motivo da conversao.

update public.folha_itens i
set custo_total = i.salario_base + i.gratificacao + i.valor_extras
                  + i.encargos + i.provisoes,
    valor_liquido = greatest(
      i.salario_base + i.gratificacao + i.valor_extras
      - i.inss - i.irrf - i.descontos, 0) - i.adiantamentos
from public.folhas f
where f.id = i.folha_id
  and f.status = 'rascunho'
  and i.descontos > 0;

-- Guarda: o recalculo acima subtrai o adiantamento DEPOIS do greatest, entao um
-- desconto que engolisse o disponivel deixaria liquido negativo -- estado
-- impossivel (colaborador devendo para a folha). Hoje nao acontece (o unico item
-- com desconto tem adiantamento R$ 0,00), e se acontecer num banco onde exista,
-- e melhor a migration parar do que gravar isso em silencio.
do $guarda$
declare v_negativos int;
begin
  select count(*) into v_negativos
  from public.folha_itens where valor_liquido < 0;
  if v_negativos > 0 then
    raise exception 'O recalculo deixou % item(ns) com liquido negativo. Regere a folha para refazer a cascata de adiantamento.', v_negativos;
  end if;
end;
$guarda$;

-- Os totais de cada folha que teve item mexido.
do $totais$
declare v_folha uuid;
begin
  for v_folha in
    select distinct f.id
    from public.folhas f
    join public.folha_itens i on i.folha_id = f.id
    where f.status = 'rascunho'
  loop
    perform public.fn_folha_recalcular_totais(v_folha);
  end loop;
end;
$totais$;
