-- =============================================================
-- Relatorios financeiros: agregacao no banco (varredura 06/07/2026)
--
-- Antes, fluxo de caixa / DRE / aging / posicao bancaria / custo por CC
-- buscavam TODAS as linhas (7.9k lancamentos + 7.9k parcelas) e somavam
-- em JS no servidor. Estas funcoes fazem o GROUP BY no Postgres e devolvem
-- so as linhas agregadas; a forma final (rotulos, faixas, ordenacao)
-- continua nas funcoes puras de calculo.ts, sem duplicar regra.
--
-- Todas SECURITY INVOKER: rodam sob o RLS do usuario logado, exatamente
-- como as queries diretas que substituem (quem nao ve a tabela, nao ve o
-- agregado). Leitura pura, STABLE, search_path fixo.
-- =============================================================

-- ---------- 1. Fluxo de caixa ----------
-- Parcelas nao canceladas somadas por mes / tipo / realizado.
-- Regra do mes (igual ao JS que substitui): parcela paga cai no mes do
-- pagamento (fallback vencimento); pendente/aprovada no mes do vencimento.
-- Parcela sem data nenhuma fica de fora (mes nulo), como antes.
create or replace function public.fn_rel_fluxo_caixa()
returns table (mes text, tipo text, realizado boolean, total numeric)
language sql
stable
set search_path = ''
as $$
  select t.mes, t.tipo, t.realizado, sum(t.valor) as total
  from (
    select
      case
        when p.status = 'pago'
          then to_char(coalesce(p.data_pagamento, p.data_vencimento), 'YYYY-MM')
        else to_char(p.data_vencimento, 'YYYY-MM')
      end as mes,
      l.tipo,
      (p.status = 'pago') as realizado,
      p.valor
    from public.lancamento_parcelas p
    join public.lancamentos l on l.id = p.lancamento_id
    where p.status <> 'cancelado'
      and l.status <> 'cancelado'
  ) t
  where t.mes is not null
  group by t.mes, t.tipo, t.realizado
$$;

revoke all on function public.fn_rel_fluxo_caixa() from public, anon;
grant execute on function public.fn_rel_fluxo_caixa() to authenticated;

-- ---------- 2. DRE gerencial ----------
-- Lancamentos nao cancelados do periodo somados por tipo e categoria.
-- Data efetiva (igual ao JS): competencia, senao vencimento, senao emissao;
-- tudo nulo fica de fora.
create or replace function public.fn_rel_dre(p_inicio date, p_fim date)
returns table (tipo text, categoria_id uuid, categoria text, total numeric)
language sql
stable
set search_path = ''
as $$
  select l.tipo, c.id as categoria_id, c.nome as categoria, sum(l.valor) as total
  from public.lancamentos l
  left join public.categorias_financeiras c on c.id = l.categoria_id
  where l.status <> 'cancelado'
    and coalesce(l.competencia, l.data_vencimento, l.data_emissao) >= p_inicio
    and coalesce(l.competencia, l.data_vencimento, l.data_emissao) < p_fim
  group by l.tipo, c.id, c.nome
$$;

revoke all on function public.fn_rel_dre(date, date) from public, anon;
grant execute on function public.fn_rel_dre(date, date) to authenticated;

-- ---------- 3. Aging ----------
-- Parcelas em aberto (pendente/aprovado) somadas por tipo e vencimento.
-- A classificacao em faixas continua no app (calculo.ts, testada), que passa
-- a receber uma linha por data distinta em vez de uma por parcela.
create or replace function public.fn_rel_aging()
returns table (tipo text, data_vencimento date, total numeric)
language sql
stable
set search_path = ''
as $$
  select l.tipo, p.data_vencimento, sum(p.valor) as total
  from public.lancamento_parcelas p
  join public.lancamentos l on l.id = p.lancamento_id
  where p.status in ('pendente', 'aprovado')
    and l.status <> 'cancelado'
  group by l.tipo, p.data_vencimento
$$;

revoke all on function public.fn_rel_aging() from public, anon;
grant execute on function public.fn_rel_aging() to authenticated;

-- ---------- 4. Posicao bancaria ----------
-- Parcelas pagas com conta somadas por conta e tipo.
create or replace function public.fn_rel_posicao_bancaria()
returns table (conta_bancaria_id uuid, tipo text, total numeric)
language sql
stable
set search_path = ''
as $$
  select p.conta_bancaria_id, l.tipo, sum(p.valor) as total
  from public.lancamento_parcelas p
  join public.lancamentos l on l.id = p.lancamento_id
  where p.status = 'pago'
    and p.conta_bancaria_id is not null
    and l.status <> 'cancelado'
  group by p.conta_bancaria_id, l.tipo
$$;

revoke all on function public.fn_rel_posicao_bancaria() from public, anon;
grant execute on function public.fn_rel_posicao_bancaria() to authenticated;

-- ---------- 5. Custo por centro de custo ----------
-- Rateios de lancamentos a_pagar nao cancelados somados por CC.
create or replace function public.fn_rel_custo_centro_custo()
returns table (centro_custo_id uuid, nome text, codigo text, total numeric)
language sql
stable
set search_path = ''
as $$
  select r.centro_custo_id, cc.nome, cc.codigo, sum(r.valor) as total
  from public.lancamento_rateios r
  join public.lancamentos l on l.id = r.lancamento_id
  left join public.centros_custo cc on cc.id = r.centro_custo_id
  where l.tipo = 'a_pagar'
    and l.status <> 'cancelado'
  group by r.centro_custo_id, cc.nome, cc.codigo
$$;

revoke all on function public.fn_rel_custo_centro_custo() from public, anon;
grant execute on function public.fn_rel_custo_centro_custo() to authenticated;

-- ---------- 6. Fornecedores com lancamentos ----------
-- Antes o app buscava 1 linha por lancamento a_pagar so pra montar um
-- DISTINCT em JS. A ordenacao (localeCompare) continua no app.
create or replace function public.fn_rel_fornecedores_com_lancamentos()
returns table (id uuid, nome text)
language sql
stable
set search_path = ''
as $$
  select distinct f.id, coalesce(f.nome_fantasia, f.razao_social) as nome
  from public.lancamentos l
  join public.fornecedores f on f.id = l.fornecedor_id
  where l.tipo = 'a_pagar'
    and l.status <> 'cancelado'
$$;

revoke all on function public.fn_rel_fornecedores_com_lancamentos() from public, anon;
grant execute on function public.fn_rel_fornecedores_com_lancamentos() to authenticated;
