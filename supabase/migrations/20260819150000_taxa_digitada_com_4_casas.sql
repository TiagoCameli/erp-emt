-- Taxa digitada aceita 4 casas decimais: preço unitário, quantidade, percentual
-- e extensão.
--
-- Pedido do Tiago em 19/08/2026, com o caso na tela: editando a OC do frete de
-- 20 mil litros de diesel, o campo "Preço un." recusou 6,3947 com "O preço
-- aceita no máximo 2 casas decimais". A coluna `oc_itens.preco_unitario` já
-- tinha sido alargada para NUMERIC(14,4) em 17/08 (migration
-- 20260817160000_oc_ajustes_e_preco_com_4_casas) — quem estava recusando era só
-- o schema do formulário. Esta migration acaba o serviço nas OUTRAS colunas de
-- taxa, para a regra valer em qualquer tela onde se digita uma taxa e não só na
-- OC.
--
-- ## A distinção que continua valendo: taxa não é valor
--
-- A regra 3 do CLAUDE.md separa as duas coisas, e a migration de 17/08 já tinha
-- registrado o porquê:
--
-- - **VALOR** (dinheiro que alguém paga ou recebe) continua NUMERIC(14,2).
--   `valor_total`, valor de parcela, de rateio, de pagamento, salário, diária,
--   adiantamento. Centavo é a unidade em que o boleto é pago e em que o extrato
--   OFX concilia: guardar R$ 1.234,5678 numa parcela cria valor que não tem
--   como ser pago nem conferido.
-- - **TAXA** (número que MULTIPLICA para virar valor) aceita 4 casas. Preço
--   unitário de combustível é 6,3947 em toda parte; percentual de encargo e de
--   provisão é onde 0,0001 muda o custo do mês; quantidade de litro tem fração.
--   Arredondar a taxa erra o valor final, e erra por item.
--
-- Medida na época, na OC 2605: 6,5770 arredondado para 6,58 em 13.859,66 litros
-- dá R$ 41,56 de erro numa ordem só.
--
-- ## Escalas
--
-- Preço e quantidade viram NUMERIC(14,4): teto de 9.999.999.999,9999, que é
-- dez bilhões de litros e dez bilhões de reais por unidade.
--
-- Percentual vira NUMERIC(7,4): teto de 999,9999. As colunas eram (5,2) e
-- (6,3), as duas com três dígitos inteiros — nenhuma perde faixa, e todo CHECK
-- de 0..100 já existente continua valendo (nenhum deles fala de escala).
--
-- Nenhuma tabela aqui passa de 51 linhas hoje, então a reescrita é barata. Os
-- máximos foram conferidos antes: quantidade 13.859,660, extensão 142,000,
-- percentual 100,00 — todos cabem folgado na escala nova.

-- Compras: o preço da cotação erra combustível do mesmo jeito que o da OC
-- errava, e a quantidade tinha uma casa menos que a taxa que a multiplica.
alter table public.cotacao_itens
  alter column preco_unitario type numeric(14,4),
  alter column quantidade     type numeric(14,4);

alter table public.oc_itens
  alter column quantidade type numeric(14,4);

comment on column public.cotacao_itens.preco_unitario is
  'Preço unitário cotado. TAXA, não valor: 4 casas porque combustível é precificado em 4 (6,3947).';
comment on column public.cotacao_itens.quantidade is
  'Quantidade cotada. TAXA: 4 casas.';
comment on column public.oc_itens.quantidade is
  'Quantidade do item. TAXA: 4 casas, igual ao preço que ela multiplica.';

-- Percentuais digitados. Inclui os de folha, onde a alíquota vem da lei e um
-- décimo de milésimo muda o encargo do mês inteiro.
alter table public.condicao_parcelas    alter column percentual      type numeric(7,4);
alter table public.folhas               alter column encargos_percentual type numeric(7,4);
alter table public.folha_encargos       alter column percentual      type numeric(7,4);
alter table public.folha_provisoes      alter column percentual      type numeric(7,4);
alter table public.folha_item_encargos  alter column percentual      type numeric(7,4);
alter table public.folha_item_provisoes alter column percentual      type numeric(7,4);
alter table public.folha_parametros     alter column fgts_percentual type numeric(7,4);
alter table public.folha_inss_faixas    alter column aliquota        type numeric(7,4);
alter table public.folha_irrf_faixas    alter column aliquota        type numeric(7,4);

-- Extensão de obra: é medida, não dinheiro.
alter table public.obras alter column extensao_km type numeric(14,4);
