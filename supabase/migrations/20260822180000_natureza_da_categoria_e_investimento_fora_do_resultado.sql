-- =============================================================
-- Natureza da categoria financeira: investimento sai do resultado
--
-- PEDIDO DO TIAGO (22/08/2026): "resolva o problema dos investimentos para que
-- eu possa ter a melhor analise possivel das minhas obras e tambem da saude
-- financeira da empresa."
--
-- ============================================================
-- O QUE ESTA ERRADO HOJE
-- ============================================================
-- `fn_rel_dre` agrupa por `lancamentos.tipo` (a_pagar / a_receber) e por
-- categoria. Ela NAO olha nada que diga se aquela linha e resultado ou apenas
-- dinheiro trocando de bolso. Consequencia medida em 22/08/2026, no ano de
-- 2026: 31,7% da "receita" (R$ 4.729.771,45) e 14,3% da "despesa"
-- (R$ 4.993.573,68) sao a varredura automatica da conta -- o BB Rende Facil
-- aplicando o saldo a noite e resgatando na manha seguinte, todo dia util.
--
-- Aplicar e resgatar o PRINCIPAL nao e receita nem despesa: e o mesmo dinheiro
-- indo e voltando. Enquanto isso conta como resultado, a margem da empresa e
-- ficcao -- e nenhum relatorio avisa, porque a soma fecha.
--
-- ============================================================
-- A ANALISE DAS OBRAS JA ESTAVA LIMPA (conferido, nao suposto)
-- ============================================================
-- Antes de mexer, medi onde a varredura cai por centro de custo: os 257
-- lancamentos estao TODOS no centro "Investimentos". Nenhuma obra recebe
-- rateio de aplicacao financeira.
--
-- Os 28 lancamentos de "APLICACAO DO ASFALTO" na obra 007 (R$ 26.025,00)
-- parecem investimento pelo texto e NAO sao: e mao de obra aplicando asfalto,
-- custo de obra legitimo. Ficam onde estao. Mesma coisa com "APLICATIVO DE
-- DIARIO DE OBRA" (R$ 1.500,00) e as guias de "FUNDO DE GARANTIA": o que
-- parecia contaminacao de obra era falso positivo de busca por texto.
--
-- ============================================================
-- COMO OS 257 FORAM IDENTIFICADOS
-- ============================================================
-- Duas pistas independentes, batidas uma contra a outra por DIFERENCA DE
-- CONJUNTO (nao por contagem, que empata por acidente):
--
--   pista A: o rateio cai no centro de custo "Investimentos"  -> 257
--   pista B: a descricao comeca com o historico do banco
--            (BB RENDE FACIL / APLICA / RESG / VENC CDB)       -> 257
--   nas duas                                                  -> 256
--
-- Os dois dissidentes provaram qual pista vale:
--   * "APLICATIVO DE DIARIO DE OBRA" entrou na pista B so porque "^aplica"
--     casa com "aplicativo". Nao esta no centro Investimentos. Falso positivo.
--   * "CREDITO TRANSF AGENCIA" (R$ 975.787,77) esta no centro Investimentos e
--     nao casa com o texto. E credito de transferencia lancado na categoria
--     "Juros de aplicacoes financeiras": nem juros nem receita.
--
-- Vale a pista A: o centro de custo e classificacao que o Tiago mesmo fez,
-- registro por registro. O texto e heuristica minha.
--
-- ============================================================
-- ISTO NAO MEXE EM UM CENTAVO DE SALDO
-- ============================================================
-- So `lancamentos.categoria_id` muda. Parcela, pagamento, conta bancaria, data
-- e valor ficam intactos, entao `fn_saldo_conta` e `fn_rel_posicao_bancaria`
-- devolvem exatamente o mesmo numero antes e depois. O saldo bancario e tratado
-- na migration seguinte, que e outro assunto.
-- =============================================================

-- ---------- 1. a natureza ----------
-- Tres valores, porque um DRE honesto tem tres blocos:
--   operacional  = obra: receita de medicao, custo, despesa. E o resultado.
--   financeira   = juros ganhos, tarifa, IOF. E resultado, mas nao e da obra.
--   movimentacao = principal de aplicacao, resgate, emprestimo recebido. NAO e
--                  resultado: e patrimonio trocando de lugar.
--
-- Coluna nova em vez de um terceiro valor em `tipo`: `tipo` diz o SINAL
-- (receita soma, despesa subtrai) e e par com `lancamentos.tipo`. Um
-- 'movimentacao' ali deixaria o sinal indefinido em toda soma que existe.
alter table public.categorias_financeiras
  add column if not exists natureza text not null default 'operacional';

alter table public.categorias_financeiras
  drop constraint if exists categorias_financeiras_natureza_check;
alter table public.categorias_financeiras
  add constraint categorias_financeiras_natureza_check
  check (natureza in ('operacional', 'financeira', 'movimentacao'));

comment on column public.categorias_financeiras.natureza is
  'Onde a categoria entra no DRE: operacional (resultado da obra), financeira (resultado, mas de juros e tarifa) ou movimentacao (principal de aplicacao e emprestimo, FORA do resultado).';

-- ---------- 2. as duas categorias de movimentacao ----------
-- id fixo por md5 para a migration poder rodar duas vezes sem criar duplicata,
-- e `on conflict do nothing` porque a unique e (nome, tipo): se ja existir
-- categoria com esse nome, ela e reaproveitada em vez de virar a segunda.
insert into public.categorias_financeiras (id, nome, tipo, natureza, ativo)
values
  (md5('emt:cat:movimentacao:aplicacao')::uuid,
   'Aplicação financeira', 'despesa', 'movimentacao', true),
  (md5('emt:cat:movimentacao:resgate')::uuid,
   'Resgate de aplicação', 'receita', 'movimentacao', true)
on conflict (nome, tipo) do nothing;

-- Se as categorias ja existiam (rodada anterior, ou cadastro do Tiago), elas
-- tem de ficar com a natureza certa mesmo que o insert nao tenha feito nada.
update public.categorias_financeiras
set natureza = 'movimentacao'
where (nome = 'Aplicação financeira' and tipo = 'despesa')
   or (nome = 'Resgate de aplicação' and tipo = 'receita');

-- ---------- 3. a natureza das categorias que ja existiam ----------
-- Lista curta e nominal DE PROPOSITO. Classificar por palavra no nome
-- ("financeir", "banc") arrastaria categoria de obra pelo nome e mudaria de
-- significado sozinha quando alguem criasse categoria nova.
--
-- Fora desta lista fica "Despesas financeiras": sao 232 lancamentos e
-- R$ 2.097.312,58 de coisa misturada (tem transferencia de R$ 157.900,00 e tem
-- "APLICATIVO DE DIARIO DE OBRA"). Chutar 'financeira' nela tiraria R$ 2 mi do
-- resultado operacional por conta propria. Fica operacional e o Tiago decide na
-- tela, que agora tem o campo.
update public.categorias_financeiras
set natureza = 'financeira'
where nome in ('Juros de aplicações financeiras', 'Tarifa Bancária')
  and natureza = 'operacional';

-- Principal de emprestimo que entra na conta nao e receita: e divida. O banco
-- credita e a empresa passa a dever.
update public.categorias_financeiras
set natureza = 'movimentacao'
where nome = 'Financiamento bancário'
  and tipo = 'receita'
  and natureza = 'operacional';

-- ---------- 4. os 257 lancamentos vao para as categorias certas ----------
-- a_pagar (dinheiro saiu da conta para a aplicacao) -> Aplicação financeira
-- a_receber (dinheiro voltou da aplicacao)          -> Resgate de aplicação
--
-- A categoria de destino e buscada por (nome, tipo) e nao pelo md5: se o passo
-- 2 reaproveitou uma categoria que ja existia, e nela que os lancamentos tem
-- de cair.
with destino as (
  select
    (select id from public.categorias_financeiras
      where nome = 'Aplicação financeira' and tipo = 'despesa') as id_aplicacao,
    (select id from public.categorias_financeiras
      where nome = 'Resgate de aplicação' and tipo = 'receita') as id_resgate
),
sweep as (
  select distinct l.id, l.tipo
  from public.lancamentos l
  join public.lancamento_rateios r on r.lancamento_id = l.id
  join public.centros_custo cc on cc.id = r.centro_custo_id
  where l.status <> 'cancelado'
    and cc.nome = 'Investimentos'
)
update public.lancamentos l
set categoria_id = case
      when s.tipo = 'a_pagar' then d.id_aplicacao
      else d.id_resgate
    end,
    updated_at = now()
from sweep s, destino d
where l.id = s.id
  and d.id_aplicacao is not null
  and d.id_resgate is not null
  and l.categoria_id is distinct from (case
        when s.tipo = 'a_pagar' then d.id_aplicacao
        else d.id_resgate
      end);

-- ---------- 5. o DRE passa a dizer a natureza ----------
-- DROP + CREATE porque a assinatura de retorno muda (coluna nova na RETURNS
-- TABLE). `create or replace` recusa mudanca de tipo de retorno, e o drop leva
-- os grants embora: por isso o grant explicito no fim, com o revoke antes --
-- funcao recem-criada nasce com EXECUTE para PUBLIC, e PUBLIC inclui `anon`.
drop function if exists public.fn_rel_dre(date, date);

create function public.fn_rel_dre(p_inicio date, p_fim date)
returns table(tipo text, categoria_id uuid, categoria text, natureza text, total numeric)
language sql
stable
set search_path to ''
as $function$
  select
    l.tipo,
    c.id as categoria_id,
    c.nome as categoria,
    -- Sem categoria a linha nao tem como ser classificada. Cai em operacional
    -- porque o DRE tem de continuar mostrando ela: sumir com despesa por falta
    -- de cadastro seria o mesmo erro que esta migration conserta, ao contrario.
    coalesce(c.natureza, 'operacional') as natureza,
    sum(l.valor) as total
  from public.lancamentos l
  left join public.categorias_financeiras c on c.id = l.categoria_id
  where l.status <> 'cancelado'
    and l.mes_competencia >= date_trunc('month', p_inicio)::date
    and l.mes_competencia < p_fim
  group by l.tipo, c.id, c.nome, c.natureza
$function$;

revoke all on function public.fn_rel_dre(date, date) from public, anon;
grant execute on function public.fn_rel_dre(date, date) to authenticated;

comment on function public.fn_rel_dre(date, date) is
  'DRE gerencial por competencia. Devolve a natureza da categoria para a tela separar resultado operacional, resultado financeiro e movimentacao patrimonial (que nao e resultado).';

-- ---------- 6. a posicao em aplicacao, que e uma linha de controle ----------
-- Quanto de principal esta aplicado agora, por conta: o que saiu para aplicacao
-- menos o que voltou de resgate. Este numero TEM que ser >= 0 -- nao existe
-- resgatar mais principal do que se aplicou.
--
-- Em 22/08/2026 ele da NEGATIVO em R$ 3.571.015,96 na Caixa, e e exatamente por
-- isso que a funcao existe: e a medida do que falta importar de extrato. Sem
-- ela, esse furo aparece como saldo bancario a mais e ninguem sabe de onde vem.
create or replace function public.fn_rel_posicao_aplicacao()
returns table(conta_bancaria_id uuid, aplicado numeric, resgatado numeric, posicao numeric)
language sql
stable
set search_path to ''
as $function$
  select
    p.conta_bancaria_id,
    coalesce(sum(p.valor_liquido) filter (where l.tipo = 'a_pagar'), 0) as aplicado,
    coalesce(sum(p.valor_liquido) filter (where l.tipo = 'a_receber'), 0) as resgatado,
    coalesce(sum(case when l.tipo = 'a_pagar' then p.valor_liquido
                      else -p.valor_liquido end), 0) as posicao
  from public.lancamento_parcelas p
  join public.lancamentos l on l.id = p.lancamento_id
  join public.categorias_financeiras c on c.id = l.categoria_id
  where p.status = 'pago'
    and p.conta_bancaria_id is not null
    and l.status <> 'cancelado'
    and c.natureza = 'movimentacao'
  group by p.conta_bancaria_id
$function$;

revoke all on function public.fn_rel_posicao_aplicacao() from public, anon;
grant execute on function public.fn_rel_posicao_aplicacao() to authenticated;

comment on function public.fn_rel_posicao_aplicacao() is
  'Principal aplicado menos resgatado por conta. Linha de controle: tem que ser >= 0. Negativo significa extrato faltando importado, nao lucro.';
