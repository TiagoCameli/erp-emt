-- =============================================================
-- Opcao A: a varredura sai do saldo bancario tambem
--
-- DECISAO DO TIAGO (22/08/2026): "vamos fazer a opcao A" -- o saldo da conta no
-- ERP passa a ser O DINHEIRO QUE ELE TEM, e nao o saldo da conta corrente.
--
-- ============================================================
-- POR QUE ESTA ERA UMA DECISAO E NAO UMA CORRECAO OBVIA
-- ============================================================
-- As tres contas do banco sao contas de VARREDURA: no fim do dia o saldo da
-- conta corrente vai para a aplicacao e volta na manha seguinte. Medido nos
-- extratos: a 102.124-9 fecha julho/2026 em R$ 0,00 depois de mandar
-- R$ 109.514,40 para o Rende Facil, e a Caixa fecha em R$ 0,00 depois de um
-- resgate de R$ 700.000,00.
--
-- Ou seja, o banco tem DOIS BOLSOS (corrente + aplicado) e o ERP modela UMA
-- conta. O extrato da 30.893-5 de 21/08/2026 mostra os dois na mesma folha:
--
--     SALDO ............................ -140.000,00   <- a conta corrente
--     Invest. Resgate Autom. .......... 1.546.246,33   <- o bolso aplicado
--     Saldo ........................... 1.406.246,33   <- a soma, do banco
--
-- O proprio banco chama a SOMA de "Saldo". Entao e ela que o ERP mostra.
--
-- ============================================================
-- A CONSEQUENCIA: A VARREDURA NAO PODE MEXER NO SALDO
-- ============================================================
-- Se `saldo_inicial` passa a ser corrente + aplicado, registrar a aplicacao
-- como pagamento faria o saldo CAIR sem o dinheiro ter saido da empresa -- e o
-- resgate faria SUBIR de novo. Duas mentiras que se cancelam quando o par esta
-- completo, e que viram erro puro quando nao esta.
--
-- E o par NAO esta completo: `fn_rel_posicao_aplicacao` mede principal aplicado
-- menos resgatado, que tem de ser >= 0, e da -R$ 3.571.015,96 na Caixa.
--
-- Por isso o filtro e o MESMO que ja tira a varredura do resultado: natureza
-- 'movimentacao'. Uma regra, dois relatorios. Ver
-- 20260822180000_natureza_da_categoria_e_investimento_fora_do_resultado.sql.
--
-- ============================================================
-- O QUE MUDA NA TELA, MEDIDO ANTES DE APLICAR
-- ============================================================
--   BANCO DO BRASIL 102.124-9 ...  5.826,46  ->    268.112,31   (+262.285,85)
--   CAIXA ECONOMICA 5783679735 ...     0,00  -> -3.571.015,96 (-3.571.015,96)
--   as outras tres ..............     0,00  ->          0,00   (sem varredura)
--
-- A 102.124-9 MELHORA: o extrato fecha a corrente em R$ 0,00 e o ERP estima
-- R$ 262.285,85 aplicados, entao R$ 268.112,31 fica a R$ 5.826,46 do saldo real
-- -- e esse residuo e exatamente o erro do plug antigo (ver a migration
-- 20260822190000). A conta que paga as contas passa a mostrar quase o numero
-- certo ANTES de qualquer rebase.
--
-- A CAIXA FICA NEGATIVA, e isso e o ponto: os R$ 3,57 milhoes de aplicacao que
-- ninguem importou pararam de aparecer como saldo a mais e passaram a aparecer
-- como o que sao, uma falta. A movimentacao de 2025 fecha em +R$ 3.571.032,34,
-- praticamente o mesmo valor: o furo e de 2025 e o extrato daquele ano existe.
--
-- Numero feio e visivel e melhor que numero bonito e falso. A tela ganha o
-- alerta ao lado (ver contas-tabela.tsx), para o negativo ter explicacao em vez
-- de virar misterio.
--
-- ============================================================
-- LEFT JOIN, NAO JOIN
-- ============================================================
-- `lancamentos.categoria_id` e NULAVEL. Um join comum com
-- categorias_financeiras descartaria do saldo toda parcela paga de lancamento
-- sem categoria, em silencio. Hoje sao zero -- e "hoje zero" nao e invariante:
-- o dia em que alguem gravar um lancamento sem categoria, o dinheiro dele
-- desapareceria do saldo sem erro nenhum. Com left join e coalesce, categoria
-- nula conta como operacional e continua no saldo.
-- =============================================================

create or replace function public.fn_rel_posicao_bancaria()
returns table(conta_bancaria_id uuid, tipo text, total numeric)
language sql
stable
set search_path to ''
as $function$
  select p.conta_bancaria_id, l.tipo, sum(p.valor_liquido) as total
  from public.lancamento_parcelas p
  join public.lancamentos l on l.id = p.lancamento_id
  left join public.categorias_financeiras cf on cf.id = l.categoria_id
  join public.contas_bancarias c on c.id = p.conta_bancaria_id
  where p.status = 'pago'
    and p.conta_bancaria_id is not null
    and l.status <> 'cancelado'
    -- Opcao A: aplicacao e resgate do principal nao mexem no saldo, porque o
    -- dinheiro nao saiu da empresa -- trocou de bolso dentro do mesmo banco.
    and coalesce(cf.natureza, 'operacional') <> 'movimentacao'
    and (
      c.saldo_inicial_data is null
      or p.data_pagamento is null
      or p.data_pagamento > c.saldo_inicial_data
    )
  group by p.conta_bancaria_id, l.tipo

  union all

  -- Transferencia entre contas da EMT continua contando: ali o dinheiro sai de
  -- uma conta e entra em outra, e as duas aparecem no ERP. Nao passa por
  -- categoria nenhuma, entao natureza nao se aplica.
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
  'Movimento agregado por conta e tipo. Conta so o que veio DEPOIS de contas_bancarias.saldo_inicial_data (NULL = tudo) e ignora categoria de natureza movimentacao (aplicacao e resgate do principal nao mexem no saldo: opcao A, 22/08/2026). Uma linha por conta e tipo, nunca uma por parcela.';

comment on column public.contas_bancarias.saldo_inicial is
  'Saldo da conta na data de saldo_inicial_data, incluindo o que estiver APLICADO (opcao A, 22/08/2026): e o numero que o proprio extrato chama de Saldo quando soma a corrente com o Invest. Resgate Autom. Sem a data ele e um plug, nao um saldo.';
