-- FASE B de duas: limpeza do vocabulario antigo do carimbo do pagamento direto.
--
-- ============ ORDEM OBRIGATORIA: ESTE ARQUIVO E' O ULTIMO ============
--   1. 20260803120001_conferido_no_pagamento_direto.sql (fase A, aditiva)
--   2. deploy do codigo novo, e a tela "Aprovacao de pagamentos" ABERTA e
--      conferida em producao (as duas abas carregando)
--   3. so entao ESTE arquivo
--
-- Aplicar esta fase B antes do deploy do codigo novo quebra a tela: o bundle
-- que esta em producao le revisado_em e pede o embed
-- `usuarios!lancamento_parcelas_revisado_por_fkey`, e chama
-- fn_marcar_parcela_revisada. Sem essas tres coisas a consulta da aba falha e a
-- pagina inteira cai em "Algo deu errado ao carregar esta tela" - inclusive a
-- fila de aprovacao, que e' onde o Tiago libera dinheiro. Foi exatamente esse o
-- estrago de 03/08/2026, quando o rename foi aplicado antes do deploy.
--
-- Nao ha pressa nenhuma para rodar este arquivo: o par antigo so ocupa espaco de
-- schema. Em duvida, espere. O caro e' o inverso.
--
-- Nada de dado se perde aqui: a fase A copiou revisado_por/revisado_em para
-- conferido_por/conferido_em, e o historico de cada marcar/desmarcar continua no
-- audit_log, que nao e' tocado.

-- =====================================================================
-- 1. RPC antiga
-- =====================================================================
-- Sai primeiro: enquanto ela existir, alguem (um bundle antigo em cache, uma
-- chamada solta) ainda consegue escrever no par antigo que este arquivo esta
-- derrubando na sequencia.
drop function if exists public.fn_marcar_parcela_revisada(uuid, boolean);

-- =====================================================================
-- 2. Colunas antigas
-- =====================================================================
-- `drop column` leva junto tudo que depende da coluna: a FK
-- lancamento_parcelas_revisado_por_fkey, o check
-- lancamento_parcelas_revisado_par (cita as duas colunas) e o indice
-- idx_lancamento_parcelas_revisado_por. Nao precisa de `cascade`, porque nao ha
-- view nem constraint de outra tabela dependendo delas.
alter table public.lancamento_parcelas
  drop column if exists revisado_por,
  drop column if exists revisado_em;

-- =====================================================================
-- 3. Confere que nao sobrou nome velho
-- =====================================================================
-- O bloco 2 deveria ter levado tudo, mas "deveria" nao e' verificacao. Se algo
-- sobrou (indice recriado a mao, check em coluna que nao existe mais), este
-- arquivo derruba e, se ainda assim sobrar, para com a lista na mensagem em vez
-- de terminar dizendo que deu tudo certo.
drop index if exists public.idx_lancamento_parcelas_revisado_por;

alter table public.lancamento_parcelas
  drop constraint if exists lancamento_parcelas_revisado_par;

alter table public.lancamento_parcelas
  drop constraint if exists lancamento_parcelas_revisado_por_fkey;

do $$
declare
  v_sobrou text;
begin
  select string_agg(item, ', ' order by item) into v_sobrou
  from (
    select 'coluna ' || column_name as item
    from information_schema.columns
    where table_schema = 'public' and table_name = 'lancamento_parcelas'
      and column_name in ('revisado_por', 'revisado_em')
    union all
    select 'constraint ' || conname
    from pg_constraint
    where conrelid = 'public.lancamento_parcelas'::regclass
      and conname like '%revisado%'
    union all
    select 'indice ' || indexname
    from pg_indexes
    where schemaname = 'public' and tablename = 'lancamento_parcelas'
      and indexname like '%revisado%'
    union all
    select 'funcao ' || p.proname
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname = 'fn_marcar_parcela_revisada'
  ) x;

  if v_sobrou is not null then
    raise exception 'Sobrou nome antigo da conferencia: %', v_sobrou;
  end if;
end $$;

-- Nao confunda com o que FICA: status 'em_revisao', fn_revisar_parcela,
-- parcela_eventos.tipo = 'revisou' e o KPI "Em revisao" sao a OUTRA revisao, a
-- de devolver a parcela para ajuste. Nenhum deles tem nada a ver com este
-- arquivo e nenhum deles sai.

notify pgrst, 'reload schema';
