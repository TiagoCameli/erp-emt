-- =============================================================
-- Desconto das parcelas do historico: o que saiu do banco, e nao so a divida
--
-- A INVESTIGACAO. O rodape da tela de Pagamentos do maiscontrole e o export em
-- nivel de parcela discordavam em R$ 29.998,67. Achado medindo agosto/2026,
-- onde o desconto do mes e exatamente R$ 6.210,00 e a soma da coluna "Valor
-- Total Pago" da R$ 1.473.685,73, o numero do rodape ao centavo:
--
--   o rodape mostra O QUE SAIU DO BANCO (pago + juros - descontos);
--   a carga trouxe o VALOR DE FACE da parcela.
--
-- No total, R$ 31.599,01 de descontos contra R$ 788,71 de juros = R$ 30.810,30,
-- que cobre os R$ 29.998,67 observados. Nao era erro de nenhum dos dois lados:
-- eram duas perguntas diferentes com a mesma etiqueta "Pago".
--
-- O QUE MUDA AQUI. O ERP-EMT ja modela isso: lancamento_parcelas.desconto, com
-- valor_liquido GERADO como valor - desconto. Preenchendo o desconto, as duas
-- visoes passam a existir no ERP sem contradicao: `valor` continua sendo a
-- divida (e o total de R$ 61.432.852,10 nao se move), e `valor_liquido` passa a
-- ser o que saiu da conta.
--
-- 20 parcelas, casadas uma a uma por fornecedor + vencimento + valor, cada uma
-- com exatamente uma candidata e todas pagas (conferido antes de rodar). A
-- maior e o desconto de R$ 18.450,00 nos R$ 300.000,00 do Rodrigo Aiache.
--
-- OS JUROS FICAM DE FORA, de proposito: sao R$ 788,71 em 3 parcelas, e o ERP
-- nao tem campo de juros na parcela. Inventar um agora, para tres linhas de
-- historico, e pior que registrar a diferenca. Fica documentado aqui e nas
-- observacoes do lancamento, e o efeito e o ERP mostrar R$ 788,71 menos de
-- saida do que o maiscontrole.
-- =============================================================

with d(forn, venc, valor, desconto) as (values
('PREFEITURA MUNICIPAL DE CRUZEIRO DO SUL','2025-06-30'::date,182.71::numeric,0.67::numeric),
('PREFEITURA MUNICIPAL DE CRUZEIRO DO SUL','2025-09-30',182.70,0.66),
('AGR DISTRIBUIDORA DE PECAS AUTOMOTIVAS LTDA','2025-10-01',1896.15,0.15),
('INSTITUTO SANTA TERESINHA','2026-01-10',1075.00,30.00),
('INSTITUTO SANTA TERESINHA','2026-03-10',1075.00,30.00),
('INSTITUTO SANTA TERESINHA','2026-04-10',1075.00,30.00),
('INSTITUTO SANTA TERESINHA','2026-05-10',1075.00,30.00),
('INSTITUTO SANTA TERESINHA','2026-06-10',1075.00,30.00),
('INSTITUTO SANTA TERESINHA','2026-07-10',1075.00,30.00),
('INSTITUTO SANTA TERESINHA','2026-08-10',1075.00,30.00),
('SÓ MOTOR','2026-07-28',1168.01,0.01),
('RODRIGO AIACHE SOCIEDADE INDIVIDUAL DE ADVOCACIA','2026-06-15',300000.00,18450.00),
('RODRIGO AIACHE SOCIEDADE INDIVIDUAL DE ADVOCACIA','2026-07-15',100000.00,6150.00),
('RODRIGO AIACHE SOCIEDADE INDIVIDUAL DE ADVOCACIA','2026-08-15',100000.00,6150.00),
('LUBRIFIC MULTIMARCAS AC','2026-08-06',965.41,25.25),
('PARCEIRAO DO ELETRICISTA','2026-08-06',93.03,4.75),
('KELPRO EQUIPAMENTOS E PEÇAS LTDA','2026-06-24',2912.70,297.00),
('KELPRO EQUIPAMENTOS E PEÇAS LTDA','2026-07-22',2912.70,297.00),
('DEPARTAMENTO ESTADUAL DE TRANSITO - DETRAN','2026-02-27',135.09,13.51),
('BACURAU TRANSPORTES','2026-02-16',1866.01,0.01)
),
alvo as (
  select p.id, d.desconto
  from d
  join public.fornecedores f
    on public.fn_chave_nome(f.razao_social) = public.fn_chave_nome(d.forn)
    or public.fn_chave_nome(coalesce(f.nome_fantasia,'')) = public.fn_chave_nome(d.forn)
  join public.lancamentos l on l.fornecedor_id = f.id
  join public.lancamento_parcelas p
    on p.lancamento_id = l.id and p.data_vencimento = d.venc and p.valor = d.valor
)
update public.lancamento_parcelas p
set desconto = a.desconto
from alvo a
where p.id = a.id;

-- O saldo da conta e derivado de valor_liquido, entao ele muda com o desconto.
-- Recalcula para as contas continuarem fechando em zero.
update public.contas_bancarias c
set saldo_inicial = coalesce((
  select sum(case when l.tipo = 'a_receber' then -p.valor_liquido else p.valor_liquido end)
  from public.lancamento_parcelas p
  join public.lancamentos l on l.id = p.lancamento_id
  where p.conta_bancaria_id = c.id and p.status = 'pago'
), 0);
