-- =============================================================
-- Saldo inicial passa a ter DATA
--
-- PEDIDO DO TIAGO (22/08/2026): "eu nao vou conseguir o extrato do ano passado
-- da conta BANCO DO BRASIL 30.893-5, vou conseguir algumas notas fiscais que
-- mostram o valor da conta mas nao o dia exato que o dinheiro entrou, o
-- importante e que o saldo atual esteja batendo, mas deixe um esquema pronto
-- para sempre que eu conseguir uma nota fiscal do ano passado."
--
-- ============================================================
-- POR QUE O SALDO NAO BATE HOJE
-- ============================================================
-- `saldo_inicial` e um numero SEM DATA. `fn_saldo_conta` faz
-- `saldo_inicial + soma de TODO movimento da conta`, do primeiro registro ao
-- ultimo, sem recorte de periodo.
--
-- Um numero sem data nao e saldo inicial: e um plug. Quem carregou o historico
-- resolveu a conta nao fechar escrevendo em `saldo_inicial` exatamente o
-- negativo da soma dos movimentos, para o saldo dar zero. Ficaram R$ 21,5
-- milhoes de saldo de abertura ficticio, e o numero na tela nao se compara com
-- extrato nenhum -- nao existe data em que o banco tenha dito aquilo.
--
-- E o pior: no modelo sem data, importar uma nota de 2025 MOVE o saldo de hoje.
-- Entao ou o saldo atual bate, ou o historico entra. Nao os dois.
--
-- ============================================================
-- A DATA DE CORTE RESOLVE OS DOIS PEDIDOS COM UM MECANISMO
-- ============================================================
-- `saldo_inicial_data` e a data do extrato de onde `saldo_inicial` foi lido, e
-- a soma passa a contar so o movimento DEPOIS dela.
--
--   saldo atual  =  saldo do extrato na data de corte
--                +  movimento posterior aquela data
--
-- 1. O SALDO ATUAL BATE POR CONSTRUCAO: basta gravar o saldo do ultimo extrato
--    e a data dele. Nao depende de ter o historico completo.
--
-- 2. O ESQUEMA DA NOTA DE 2025 SAI DE GRACA: nota fiscal com pagamento ANTES do
--    corte alimenta DRE, custo por obra e extrato do fornecedor, e NAO mexe no
--    saldo bancario -- porque aquele periodo ja esta representado pelo saldo de
--    abertura. E exatamente o que ele pediu: "o importante e que o saldo atual
--    esteja batendo". A data exata em que o dinheiro entrou deixa de ser
--    necessaria para o saldo fechar. Ela continua importando para a competencia,
--    e competencia e mes, nao dia.
--
-- ============================================================
-- NULL CONTINUA SIGNIFICANDO O COMPORTAMENTO DE HOJE
-- ============================================================
-- A coluna nasce NULL em todas as contas e NULL nao corta nada: soma tudo, como
-- sempre somou. Esta migration NAO escreve saldo nem data em conta nenhuma --
-- isso e decisao do Tiago, conta por conta, com o extrato na mao. O que ela
-- entrega e o mecanismo, provado.
-- =============================================================

alter table public.contas_bancarias
  add column if not exists saldo_inicial_data date;

comment on column public.contas_bancarias.saldo_inicial_data is
  'Data do extrato de onde saldo_inicial foi lido. O saldo atual conta so o movimento POSTERIOR a ela. NULL = conta tudo desde o primeiro registro (comportamento anterior a 22/08/2026).';

comment on column public.contas_bancarias.saldo_inicial is
  'Saldo da conta na data de saldo_inicial_data. Sem a data ele e um plug, nao um saldo: foi assim que R$ 21,5 milhoes de abertura ficticia entraram na base.';

-- ---------- a soma passa a respeitar o corte ----------
-- `create or replace` porque a assinatura de retorno nao muda: continua
-- (conta_bancaria_id, tipo, total), e as quatro telas que leem esta RPC
-- (Contas bancarias, Pagamentos, Transferencias e Relatorios > Posicao
-- bancaria) ganham o corte de uma vez, sem tocar em nenhuma delas. A gemea em
-- TypeScript (`movimentoPorContaEmCentavos`) so soma o que a RPC devolve, entao
-- ela tambem nao muda.
--
-- `fn_saldo_conta` delega para ca, o que significa que a guarda de saldo de
-- `fn_pagar_parcela` passa a usar o saldo com corte -- e e o certo: quem paga
-- precisa do saldo que o banco tem, nao do plug.
--
-- Parcela paga com `data_pagamento` NULL entra (nao fica de fora). Sao zero hoje,
-- mas se aparecer uma, o erro de contar dinheiro que talvez seja antigo e menor
-- que o de sumir com dinheiro que saiu da conta: saldo a menos trava pagamento
-- e ninguem descobre por que.
create or replace function public.fn_rel_posicao_bancaria()
returns table(conta_bancaria_id uuid, tipo text, total numeric)
language sql
stable
set search_path to ''
as $function$
  select p.conta_bancaria_id, l.tipo, sum(p.valor_liquido) as total
  from public.lancamento_parcelas p
  join public.lancamentos l on l.id = p.lancamento_id
  join public.contas_bancarias c on c.id = p.conta_bancaria_id
  where p.status = 'pago'
    and p.conta_bancaria_id is not null
    and l.status <> 'cancelado'
    and (
      c.saldo_inicial_data is null
      or p.data_pagamento is null
      or p.data_pagamento > c.saldo_inicial_data
    )
  group by p.conta_bancaria_id, l.tipo

  union all

  select t.conta_destino_id, 'transferencia_entrada', sum(t.valor)
  from public.transferencias_contas t
  join public.contas_bancarias c on c.id = t.conta_destino_id
  where c.saldo_inicial_data is null
     or t.data_transferencia > c.saldo_inicial_data
  group by t.conta_destino_id

  union all

  select t.conta_origem_id, 'transferencia_saida', sum(t.valor + t.tarifa)
  from public.transferencias_contas t
  join public.contas_bancarias c on c.id = t.conta_origem_id
  where c.saldo_inicial_data is null
     or t.data_transferencia > c.saldo_inicial_data
  group by t.conta_origem_id
$function$;

revoke all on function public.fn_rel_posicao_bancaria() from public, anon;
grant execute on function public.fn_rel_posicao_bancaria() to authenticated;

comment on function public.fn_rel_posicao_bancaria() is
  'Movimento agregado por conta e tipo, contando so o que veio DEPOIS de contas_bancarias.saldo_inicial_data (NULL = conta tudo). Uma linha por conta e tipo, nunca uma por parcela.';

-- Indice pelo par que o corte compara. A consulta filtra por conta e data de
-- pagamento em 6.500+ parcelas pagas e roda em quatro telas.
create index if not exists idx_parcelas_conta_data_pagamento
  on public.lancamento_parcelas (conta_bancaria_id, data_pagamento)
  where status = 'pago';

-- ---------- o que ficou de fora do saldo, por conta ----------
-- Uma data de corte esconde movimento do saldo. Escondido em SILENCIO seria um
-- segundo plug -- e o primeiro passou meses sem ninguem notar. Esta funcao diz,
-- por conta, quanto e quantos pagamentos ficaram antes do corte: e o numero que
-- a tela mostra ao lado do saldo para a escolha ficar visivel.
create or replace function public.fn_rel_movimento_antes_do_corte()
returns table(
  conta_bancaria_id uuid,
  corte date,
  parcelas integer,
  recebido numeric,
  pago numeric
)
language sql
stable
set search_path to ''
as $function$
  select
    c.id,
    c.saldo_inicial_data,
    count(p.id)::int,
    coalesce(sum(p.valor_liquido) filter (where l.tipo = 'a_receber'), 0),
    coalesce(sum(p.valor_liquido) filter (where l.tipo = 'a_pagar'), 0)
  from public.contas_bancarias c
  join public.lancamento_parcelas p on p.conta_bancaria_id = c.id
  join public.lancamentos l on l.id = p.lancamento_id
  where c.saldo_inicial_data is not null
    and p.status = 'pago'
    and l.status <> 'cancelado'
    and p.data_pagamento is not null
    and p.data_pagamento <= c.saldo_inicial_data
  group by c.id, c.saldo_inicial_data
$function$;

revoke all on function public.fn_rel_movimento_antes_do_corte() from public, anon;
grant execute on function public.fn_rel_movimento_antes_do_corte() to authenticated;

comment on function public.fn_rel_movimento_antes_do_corte() is
  'Pagamentos anteriores a data de corte de cada conta: o movimento que o saldo NAO conta, para a tela poder dizer isso em vez de esconder.';
