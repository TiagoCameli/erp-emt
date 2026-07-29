-- Rollback da migration 20260729160001_datas_oc_lancamento.
--
-- Existe porque essa migration RENOMEIA e REMOVE coluna, e não só adiciona:
-- desfazer na pressa, sem script, é o jeito de perder dado. Rodar isto volta o
-- schema ao estado anterior sem perder valor de negócio.
--
-- O que NÃO volta: `lancamentos.data_emissao` era data de sistema e foi
-- recriada a partir de created_at (a coluna antiga guardava exatamente isso).
-- O mês de referência (mes_competencia) volta para `competencia` mantendo o
-- valor, então nada do que o usuário escolheu se perde.
--
-- Ordem: primeiro as funções voltam a referenciar as colunas antigas, depois o
-- schema muda. Tudo em uma transação (o Supabase roda cada arquivo assim).

-- 1. Colunas -----------------------------------------------------------------

alter table public.ordens_compra rename column data_compra to data_emissao;

alter table public.ordens_compra
  drop constraint if exists ordens_compra_mes_competencia_dia1;
alter table public.ordens_compra drop column if exists mes_competencia;

alter table public.lancamentos
  add column if not exists data_emissao date
  default ((now() at time zone 'America/Rio_Branco')::date);

update public.lancamentos
set data_emissao = (created_at at time zone 'America/Rio_Branco')::date
where data_emissao is null;

alter table public.lancamentos alter column data_emissao set not null;

alter table public.lancamentos
  drop constraint if exists lancamentos_mes_competencia_dia1;
alter table public.lancamentos rename column mes_competencia to competencia;
alter table public.lancamentos alter column competencia drop not null;
alter table public.lancamentos alter column competencia drop default;
alter table public.lancamentos drop column if exists data_compra;

drop index if exists public.idx_ordens_compra_mes_competencia;
drop index if exists public.idx_lancamentos_mes_competencia;

-- 2. Trigger de imutabilidade -------------------------------------------------

drop trigger if exists trg_fixa_created_at on public.ordens_compra;
drop trigger if exists trg_fixa_created_at on public.lancamentos;
drop function if exists public.fn_fixa_created_at();

-- 3. Função nova ---------------------------------------------------------------

drop function if exists public.fn_alterar_mes_competencia(text, uuid, date);

-- 4. Funções alteradas -------------------------------------------------------
-- Voltam para a versão de 20260729140001 (pagamento por forma), que é a última
-- antes desta migration. O corpo está lá; aqui só o essencial para o app não
-- quebrar: as três que leem as colunas renomeadas.

create or replace function public.fn_rel_dre(p_inicio date, p_fim date)
returns table(tipo text, categoria_id uuid, categoria text, total numeric)
language sql
stable
set search_path to ''
as $$
  select l.tipo, c.id as categoria_id, c.nome as categoria, sum(l.valor) as total
  from public.lancamentos l
  left join public.categorias_financeiras c on c.id = l.categoria_id
  where l.status <> 'cancelado'
    and coalesce(l.competencia, l.data_vencimento, l.data_emissao) >= p_inicio
    and coalesce(l.competencia, l.data_vencimento, l.data_emissao) < p_fim
  group by l.tipo, c.id, c.nome
$$;

-- ATENÇÃO: fn_criar_ordem_compra, fn_salvar_parcelas_oc,
-- fn_aprovar_ordem_compra, fn_aplicar_regra_pagamento, fn_salvar_lancamento e
-- fn_fechar_diarias precisam ser recriadas a partir de
-- supabase/migrations/20260729140001_pagamento_por_forma.sql (seções 5 a 11),
-- trocando data_compra por data_emissao e mes_competencia por competencia.
-- Não replico os corpos aqui para não criar uma terceira versão de cada função
-- para manter: a fonte é a migration anterior.
