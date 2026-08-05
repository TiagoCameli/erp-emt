-- Execucao da importacao do historico financeiro BR-364 Lote 09.
--
-- Este arquivo NAO e migration: e o roteiro da rodada. Ele existe para a
-- importacao ser rodada primeiro em ensaio (begin ... rollback), conferida, e
-- so depois valendo.
--
-- Ordem obrigatoria:
--   1. supabase/migrations/20260804130001_stg_br364_carga.sql        (a staging)
--   2. supabase/migrations/20260804140000_fn_importar_br364_lote09.sql (a funcao)
--   3. este arquivo
--
-- PASSO 1 - ENSAIO. Roda tudo e desfaz, so para ler o relatorio.
--   Copie o bloco abaixo inteiro, incluindo o rollback.

begin;

select jsonb_pretty(public.fn_importar_br364_lote09(
  p_usuario_id             => 'c66fca9f-5428-4fb9-855f-dcff548764df',  -- Tiago
  p_criar_lancamento_orfao => true,
  p_ajustar_saldo_conta    => true
)) as relatorio;

-- Conferencia 1: cada conta tem de fechar em R$ 0,00 (mesma formula que
-- fn_pagar_parcela usa para conferir saldo).
select c.nome,
       c.saldo_inicial,
       c.saldo_inicial + coalesce(sum(
         case when l.tipo = 'a_receber' then p.valor else -p.valor end), 0) as saldo_final
from public.contas_bancarias c
left join public.lancamento_parcelas p on p.conta_bancaria_id = c.id and p.status = 'pago'
left join public.lancamentos l on l.id = p.lancamento_id
group by c.id, c.nome, c.saldo_inicial
order by c.nome;

-- Conferencia 2: os totais que tem de bater com a planilha.
select
  (select count(*) from public.lancamentos where observacoes like '%Importado da planilha BR-364 Lote 09 (%') as lancamentos,
  (select sum(valor) from public.lancamentos where observacoes like '%Importado da planilha BR-364 Lote 09 (%') as valor_lancado,
  (select count(*) from public.lancamento_parcelas p join public.lancamentos l on l.id = p.lancamento_id
    where p.status = 'pago' and l.observacoes like '%Importado da planilha BR-364 Lote 09 (%') as parcelas_pagas,
  (select sum(p.valor) from public.lancamento_parcelas p join public.lancamentos l on l.id = p.lancamento_id
    where p.status = 'pago' and l.observacoes like '%Importado da planilha BR-364 Lote 09 (%') as valor_pago,
  (select count(*) from public.lancamento_parcelas p join public.lancamentos l on l.id = p.lancamento_id
    where p.status = 'pendente' and l.observacoes like '%Importado da planilha BR-364 Lote 09 (%') as parcelas_abertas,
  (select sum(p.valor) from public.lancamento_parcelas p join public.lancamentos l on l.id = p.lancamento_id
    where p.status = 'pendente' and l.observacoes like '%Importado da planilha BR-364 Lote 09 (%') as valor_aberto;

-- Conferencia 3: rateio 100% no centro 009, um por lancamento.
select cc.nome as centro, count(*) as rateios, sum(r.valor) as valor
from public.lancamento_rateios r
join public.centros_custo cc on cc.id = r.centro_custo_id
join public.lancamentos l on l.id = r.lancamento_id
where l.observacoes like '%Importado da planilha BR-364 Lote 09 (%'
group by cc.nome;

-- Conferencia 4: a lista das 54 linhas "Quem Paga = Cliente" que ficaram FORA
-- (a lista separada, para conferir fora do ERP).
select linha_planilha, indice, lancamento, valor, pago_a, descricao, conta
from public.stg_br364_lancamentos
where quem_paga = 'Cliente'
order by linha_planilha;

rollback;


-- PASSO 2 - VALENDO. Somente depois de o relatorio do ensaio ter sido
-- aprovado. E o MESMO comando, sem o rollback:
--
--   begin;
--   select jsonb_pretty(public.fn_importar_br364_lote09(
--     p_usuario_id => 'c66fca9f-5428-4fb9-855f-dcff548764df'));
--   -- confira as mesmas 4 conferencias acima
--   commit;
--
-- Rodar duas vezes nao duplica (os ids sao derivados do indice da planilha),
-- entao um commit repetido por engano nao dobra o passivo.
--
-- PASSO 3 - depois de aprovado, derrubar a staging:
--   supabase/rollbacks/20260804130001_stg_br364_carga_rollback.sql
--
-- Para desfazer a importacao inteira:
--   supabase/rollbacks/20260804140000_fn_importar_br364_lote09_rollback.sql
