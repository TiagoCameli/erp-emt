-- Planilha de-para da reclassificacao (PR 2 do controle total, D11).
-- SO LEITURA. Uma linha por rateio candidato, com a proposta e a regra que a
-- gerou. "decidir" = sim quando a regra nao tem certeza: o Tiago escolhe.
-- Rodar depois das migrations do PR 2 (usa as categorias e centros novos).
with recursive arvore as (
  select c.id, c.id as raiz_id, c.nome as raiz_nome, c.tipo as raiz_tipo
    from public.centros_custo c where c.nivel = 1
  union all
  select f.id, a.raiz_id, a.raiz_nome, a.raiz_tipo from public.centros_custo f join arvore a on f.pai_id = a.id
),
base as (
  select r.id as rateio_id, l.numero, l.tipo, l.mes_competencia, r.valor, l.descricao,
         coalesce(fo.nome_fantasia, fo.razao_social) as fornecedor,
         cf.nome as categoria_atual, cf.natureza as natureza_atual,
         cc.nome as centro_atual, a.raiz_id, a.raiz_nome, a.raiz_tipo,
         upper(coalesce(l.descricao, '') || ' ' || coalesce(l.observacoes, '') || ' ' || coalesce(fo.nome_fantasia, '') || ' ' || coalesce(fo.razao_social, '')) as texto
    from public.lancamento_rateios r
    join public.lancamentos l on l.id = r.lancamento_id
    join public.centros_custo cc on cc.id = r.centro_custo_id
    join arvore a on a.id = r.centro_custo_id
    left join public.categorias_financeiras cf on cf.id = coalesce(r.categoria_id, l.categoria_id)
    left join public.fornecedores fo on fo.id = l.fornecedor_id
   where l.status <> 'cancelado' and l.origem is distinct from 'aplicacao'
),
regra as (
  select b.*,
    case
      -- (b) empresa ligada: o que vai e mutuo concedido, o que volta e devolucao
      when b.raiz_tipo = 'empresa_ligada' and b.natureza_atual not in ('mutuo') then 'b_empresa_ligada'
      -- (a) centros do socio e despesas pessoais da familia
      when b.raiz_tipo = 'socio' and b.natureza_atual is distinct from 'distribuicao' then 'a_centro_socio'
      when b.texto ~ '(PESSOA F[IÍ]SIC|M[AÃ]E DO S|IZETE|PEDRO ARMANI|CASA (DO )?SR|CASEIRO|SR\.? ?JAMES|JAMES CAMELI|JAMES CASTRO|REEMBOLSO TIAGO|TIAGO DE MELO)'
           and b.tipo = 'a_pagar' and coalesce(b.natureza_atual, 'operacional') = 'operacional' then 'a_despesa_pessoal'
      -- (e) pro labore sem nome de socio: nao ha pro-labore formal, mas de quem?
      when b.categoria_atual = 'Pro Labore' and b.tipo = 'a_pagar' then 'e_pro_labore_sem_socio'
      -- (c) bem comprado como despesa
      when b.tipo = 'a_pagar' and b.texto ~ 'CONS[OÓ]RCIO' and coalesce(b.natureza_atual, 'operacional') = 'operacional' then 'c_consorcio'
      -- Bem pelo nome; "carreta"/"cavalo" so a partir de R$ 100 mil (abaixo disso e
      -- alimentacao de motorista, pneu, remendo: custo da operacao das carretas).
      when b.tipo = 'a_pagar' and b.categoria_atual = 'Outras despesas'
           and (b.texto ~ '(PACCAR|HILUX|ROLL[ -]?ON)' or (b.texto ~ '(CARRETA|CAVALO MEC)' and b.valor >= 100000)) then 'c_equipamento'
      when b.tipo = 'a_pagar' and b.texto ~ 'TERRENO' and b.categoria_atual = 'Outras despesas' then 'c_terreno'
      -- (d) centro de aquisicao com categoria de custo
      when b.raiz_tipo = 'imobilizado' and coalesce(b.natureza_atual, 'operacional') = 'operacional' and b.tipo = 'a_pagar'
           and b.texto ~ '(FRETE|DOCUMENT|EMPLAC|LICENC|IPVA|DETRAN|TRANSPORTE)' then 'd_imobilizado_gasto'
      when b.raiz_tipo = 'imobilizado' and coalesce(b.natureza_atual, 'operacional') = 'operacional' and b.tipo = 'a_pagar' then 'd_imobilizado'
      -- (e) generico que pede olho humano
      when b.texto ~ 'PECU[AÁ]RIA' then 'e_pecuaria'
      when b.categoria_atual = 'Despesas financeiras' then 'e_despesas_financeiras'
    end as regra
    from base b
)
select x.rateio_id, x.numero, x.tipo, to_char(x.mes_competencia, 'YYYY-MM') as competencia, x.valor,
       x.descricao, x.fornecedor, x.categoria_atual, x.centro_atual, x.raiz_nome as centro_raiz,
       case x.regra
         when 'b_empresa_ligada' then case when x.tipo = 'a_receber' then 'Devolução de mútuo' else 'Mútuo concedido a empresa ligada' end
         when 'a_centro_socio' then 'Distribuição a sócio'
         when 'a_despesa_pessoal' then 'Distribuição a sócio'
         when 'e_pro_labore_sem_socio' then 'Distribuição a sócio'
         when 'c_consorcio' then 'Consórcio a contemplar'
         when 'c_equipamento' then 'Aquisição de Equipamento'
         when 'c_terreno' then 'Compra de Terreno'
         when 'd_imobilizado' then 'Aquisição de Equipamento'
         else null end as categoria_proposta,
       case
         when x.regra in ('a_centro_socio', 'a_despesa_pessoal', 'e_pro_labore_sem_socio')
           then case when x.texto ~ 'TIAGO' then 'Sócio Tiago de Melo Cameli' else 'Sócio James Castro Cameli' end
         when x.regra = 'd_imobilizado_gasto' then 'Manutenção/Documentação de Equipamentos'
         else x.raiz_nome end as centro_proposto,
       x.regra,
       case when x.regra like 'e_%' or x.regra = 'd_imobilizado_gasto'
              or (x.regra in ('a_centro_socio','a_despesa_pessoal') and x.tipo = 'a_receber')
              -- O que entra da empresa ligada e devolucao do mutuo (Tiago, 10/10/2026);
              -- emprestimo e investimento ja tem natureza propria e pedem olho.
              or (x.regra = 'b_empresa_ligada' and x.natureza_atual in ('movimentacao', 'investimento'))
            then 'sim' else 'nao' end as decidir
  from regra x
 where x.regra is not null
 order by x.regra, x.mes_competencia, x.numero;
