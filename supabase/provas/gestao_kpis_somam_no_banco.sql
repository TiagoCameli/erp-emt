-- Prova: os KPIs de Compras e Financeiro do painel de Gestao somam NO BANCO.
--
-- Defeito corrigido (01/08/2026): comprasResumo e financeiroResumo baixavam
-- LINHA (select valor_total / select valor) e somavam no Node. O PostgREST
-- corta em 1000 linhas SEM ERRO nenhum, entao "A pagar em aberto", "Vence em
-- ate 7 dias", "Pagamentos a aprovar" e "Pago no mes" passariam a mostrar um
-- numero MENOR que o real, calado, na primeira tela depois do login. Hoje o
-- banco tem 3 parcelas e 1 OC: o defeito e invisivel, e e exatamente por isso
-- que ele passaria despercebido ate a empresa ter volume.
--
-- O que esta prova mostra:
--
--   1. Compras, dados de hoje: a RPC nova da o MESMO numero do jeito antigo
--   2. Financeiro, dados de hoje: idem, nos sete numeros
--   3. Com 1200 OCs a aprovar: a RPC devolve contagem e valor REAIS
--   4. Com 1200 OCs a aprovar: o jeito antigo trava em 1000 e mente para MENOS
--   5. Com ~1200 parcelas em cada corte: a RPC devolve os sete numeros REAIS
--   6. Com ~1200 parcelas em cada corte: o jeito antigo mente para MENOS nos
--      quatro KPIs do painel (a pagar, vencidas, a aprovar, pago no mes)
--
-- "Jeito antigo" e simulado em SQL do mesmo jeito que o Node fazia: pega as
-- linhas com o teto de 1000 do PostgREST e soma o que veio. A mesma funcao com
-- teto nulo da o numero REAL, sem teto.
--
-- Roda contra PRODUCAO dentro de begin ... rollback. A massa dos casos 3 a 6 e
-- criada e desfeita: nada sobra, nem no audit_log, nem em documento_sequencias
-- (que e tabela, e volta junto). As funcoes pg_temp somem com a sessao.
--
-- Em psql saem dois resultados: o quadro da prova e a contagem depois do
-- rollback. Em cliente que so mostra o ultimo SELECT (MCP do Supabase), rode
-- sem a ultima linha para ver o quadro.
--
-- IMPORTANTE: as fn_rel_gestao_* sao SECURITY INVOKER, como as fn_rel_* irmas.
-- Por isso a medicao roda com `role = authenticated` e o jwt de um usuario
-- real, valendo o mesmo RLS da tela. A massa entra como postgres, porque
-- lancamento_parcelas so tem policy de SELECT.

begin;

create temp table prova_kpi (
  ordem int generated always as identity,
  caso text,
  esperado text,
  obtido text,
  passou boolean
);

-- Usuario da prova: RLS aqui e por permissao, nao por linha.
do $prova$
declare v_usuario uuid;
begin
  select u.id into v_usuario
  from public.usuarios u
  where u.ativo
    and exists (select 1 from public.usuario_permissoes p
                where p.usuario_id = u.id and p.recurso = 'compras.ordens' and p.acao = 'ver')
    and exists (select 1 from public.usuario_permissoes p
                where p.usuario_id = u.id and p.recurso = 'financeiro.lancamentos' and p.acao = 'ver')
  limit 1;

  if v_usuario is null then
    raise exception 'Nenhum usuario ativo ve compras.ordens e financeiro.lancamentos';
  end if;

  perform set_config('request.jwt.claims', json_build_object('sub', v_usuario)::text, true);
end $prova$;

-- ---------------------------------------------------------------
-- Medidores. Todos viram authenticated para medir e voltam depois,
-- para conseguirem escrever em prova_kpi.
-- ---------------------------------------------------------------

-- O painel HOJE: numeros prontos, vindos das RPCs novas.
create function pg_temp.rpc_compras() returns jsonb language plpgsql as $$
declare v jsonb;
begin
  perform set_config('role', 'authenticated', true);
  select to_jsonb(r) into v from public.fn_rel_gestao_compras_resumo() r;
  perform set_config('role', 'none', true);
  return v;
end $$;

create function pg_temp.rpc_financeiro(p_hoje date) returns jsonb language plpgsql as $$
declare v jsonb;
begin
  perform set_config('role', 'authenticated', true);
  select to_jsonb(r) into v from public.fn_rel_gestao_financeiro_resumo(p_hoje) r;
  perform set_config('role', 'none', true);
  return v;
end $$;

-- O painel ANTES: baixava linha e somava no Node. p_teto = 1000 reproduz o
-- corte silencioso do PostgREST; p_teto nulo da o numero real, sem teto.
create function pg_temp.node_compras(p_teto int) returns jsonb language plpgsql as $$
declare v jsonb;
begin
  perform set_config('role', 'authenticated', true);
  select jsonb_build_object(
    'ocs_aprovar_contagem', (select count(*) from (
        select 1 from public.ordens_compra
        where status = 'pendente_aprovacao' limit p_teto) s),
    'ocs_aprovar_valor', (select coalesce(sum(valor_total), 0) from (
        select valor_total from public.ordens_compra
        where status = 'pendente_aprovacao' limit p_teto) s),
    'ocs_abertas_contagem', (select count(*) from (
        select 1 from public.ordens_compra
        where status = 'aprovado' limit p_teto) s),
    'ocs_abertas_valor', (select coalesce(sum(valor_total), 0) from (
        select valor_total from public.ordens_compra
        where status = 'aprovado' limit p_teto) s),
    -- cotacoes ja usava count exact com head: nunca baixou linha, nunca mentiu.
    'cotacoes_abertas', (select count(*) from public.cotacoes where status = 'aberta')
  ) into v;
  perform set_config('role', 'none', true);
  return v;
end $$;

create function pg_temp.node_financeiro(p_hoje date, p_teto int) returns jsonb language plpgsql as $$
declare v jsonb;
begin
  perform set_config('role', 'authenticated', true);
  -- Tres consultas separadas, cada uma com o proprio teto, e as vencidas
  -- contadas em memoria em cima das linhas de a_pagar: era isso o TypeScript.
  with a_pagar as (
    select p.valor, p.data_vencimento
    from public.lancamento_parcelas p
    join public.lancamentos l on l.id = p.lancamento_id
    where p.status = 'aprovado' and l.tipo = 'a_pagar'
      and p.data_vencimento <= p_hoje + 7
    limit p_teto
  ),
  a_aprovar as (
    select p.valor
    from public.lancamento_parcelas p
    join public.lancamentos l on l.id = p.lancamento_id
    where p.status = 'pendente' and l.tipo = 'a_pagar'
    limit p_teto
  ),
  pagas as (
    select p.valor
    from public.lancamento_parcelas p
    join public.lancamentos l on l.id = p.lancamento_id
    where p.status = 'pago' and l.tipo = 'a_pagar'
      and p.data_pagamento >= date_trunc('month', p_hoje)::date
      and p.data_pagamento < (date_trunc('month', p_hoje) + interval '1 month')::date
    limit p_teto
  )
  select jsonb_build_object(
    'a_pagar_contagem', (select count(*) from a_pagar),
    'a_pagar_vencidas', (select count(*) from a_pagar where data_vencimento < p_hoje),
    'a_pagar_valor', (select coalesce(sum(valor), 0) from a_pagar),
    'a_aprovar_contagem', (select count(*) from a_aprovar),
    'a_aprovar_valor', (select coalesce(sum(valor), 0) from a_aprovar),
    'pago_mes_contagem', (select count(*) from pagas),
    'pago_mes_valor', (select coalesce(sum(valor), 0) from pagas)
  ) into v;
  perform set_config('role', 'none', true);
  return v;
end $$;

-- jsonb compara numero por numero; 0 e 0.00 sao o mesmo numero, entao a
-- comparacao nao quebra por formatacao de NUMERIC.
create function pg_temp.registrar(p_caso text, p_esperado jsonb, p_obtido jsonb)
returns void language sql as $$
  insert into prova_kpi (caso, esperado, obtido, passou)
  values (p_caso, p_esperado::text, p_obtido::text, p_esperado = p_obtido);
$$;

-- ---------------------------------------------------------------
-- 1 e 2. Dados de hoje: o numero novo e o mesmo numero antigo
-- ---------------------------------------------------------------
do $prova$
declare v_hoje date := (now() at time zone 'America/Rio_Branco')::date;
begin
  perform pg_temp.registrar(
    '1. Compras, dados de hoje: RPC = soma que o Node fazia',
    pg_temp.node_compras(1000), pg_temp.rpc_compras());

  perform pg_temp.registrar(
    '2. Financeiro, dados de hoje: RPC = soma que o Node fazia',
    pg_temp.node_financeiro(v_hoje, 1000), pg_temp.rpc_financeiro(v_hoje));
end $prova$;

-- ---------------------------------------------------------------
-- Massa: o volume que a EMT ainda nao tem e vai ter
-- ---------------------------------------------------------------
do $prova$
declare
  v_hoje date := (now() at time zone 'America/Rio_Branco')::date;
  v_mes date := date_trunc('month', (now() at time zone 'America/Rio_Branco'))::date;
  v_fornecedor uuid;
  v_condicao uuid;
  v_lanc uuid;
begin
  select id into v_fornecedor from public.fornecedores limit 1;
  select id into v_condicao from public.condicoes_pagamento limit 1;

  -- 1200 OCs a aprovar de R$ 1.000,00. numero preenchido na mao so para nao
  -- depender do numerador de documento.
  insert into public.ordens_compra (fornecedor_id, condicao_pagamento_id, valor_total, status, numero)
  select v_fornecedor, v_condicao, 1000.00, 'pendente_aprovacao', '[PROVA-KPI]-' || i
  from generate_series(1, 1200) i;

  -- 1200 parcelas aprovadas vencendo dentro dos 7 dias, 1100 delas ja vencidas.
  -- Passa de 1000 vencidas de proposito: assim o corte do PostgREST perde
  -- vencida com CERTEZA, sem depender de quais 1000 linhas ele traria.
  insert into public.lancamentos (tipo, origem, descricao, valor, status, mes_competencia)
  values ('a_pagar', 'manual', '[PROVA-KPI] a pagar', 120000.00, 'aprovado', v_mes)
  returning id into v_lanc;

  insert into public.lancamento_parcelas
    (lancamento_id, numero_parcela, valor, data_vencimento, data_programada, status)
  select v_lanc, i, 100.00,
         case when i <= 1100 then v_hoje - 1 else v_hoje + 1 end,
         case when i <= 1100 then v_hoje - 1 else v_hoje + 1 end,
         'aprovado'
  from generate_series(1, 1200) i;

  -- 1200 parcelas pendentes: o KPI "Pagamentos a aprovar", que nem filtro de
  -- data tinha, entao era o mais exposto ao teto.
  insert into public.lancamentos (tipo, origem, descricao, valor, status, mes_competencia)
  values ('a_pagar', 'manual', '[PROVA-KPI] a aprovar', 60000.00, 'previsto', v_mes)
  returning id into v_lanc;

  insert into public.lancamento_parcelas
    (lancamento_id, numero_parcela, valor, data_vencimento, status)
  select v_lanc, i, 50.00, v_hoje + 30, 'pendente'
  from generate_series(1, 1200) i;

  -- 1200 parcelas pagas no mes corrente.
  insert into public.lancamentos (tipo, origem, descricao, valor, status, mes_competencia)
  values ('a_pagar', 'manual', '[PROVA-KPI] pago no mes', 30000.00, 'pago', v_mes)
  returning id into v_lanc;

  insert into public.lancamento_parcelas
    (lancamento_id, numero_parcela, valor, data_vencimento, data_programada, data_pagamento, status)
  select v_lanc, i, 25.00, v_hoje, v_hoje, v_hoje, 'pago'
  from generate_series(1, 1200) i;
end $prova$;

-- ---------------------------------------------------------------
-- 3 a 6. Passando de 1000 linhas: quem trunca e quem nao trunca
-- ---------------------------------------------------------------
do $prova$
declare
  v_hoje date := (now() at time zone 'America/Rio_Branco')::date;
  v_real jsonb;
  v_node jsonb;
  v_rpc jsonb;
begin
  -- Compras
  v_real := pg_temp.node_compras(null);
  v_node := pg_temp.node_compras(1000);
  v_rpc := pg_temp.rpc_compras();

  perform pg_temp.registrar(
    '3. Compras com 1200 OCs a aprovar: RPC devolve o numero REAL do banco',
    v_real, v_rpc);

  insert into prova_kpi (caso, esperado, obtido, passou)
  values (
    '4. Compras com 1200 OCs: o jeito antigo trava em 1000 e mostra MENOS',
    format('contagem real %s, valor real %s',
           v_real ->> 'ocs_aprovar_contagem', v_real ->> 'ocs_aprovar_valor'),
    format('antigo mostrava %s e %s',
           v_node ->> 'ocs_aprovar_contagem', v_node ->> 'ocs_aprovar_valor'),
    (v_node ->> 'ocs_aprovar_contagem')::numeric < (v_real ->> 'ocs_aprovar_contagem')::numeric
    and (v_node ->> 'ocs_aprovar_valor')::numeric < (v_real ->> 'ocs_aprovar_valor')::numeric
  );

  -- Financeiro
  v_real := pg_temp.node_financeiro(v_hoje, null);
  v_node := pg_temp.node_financeiro(v_hoje, 1000);
  v_rpc := pg_temp.rpc_financeiro(v_hoje);

  perform pg_temp.registrar(
    '5. Financeiro com ~1200 parcelas por corte: RPC devolve o numero REAL',
    v_real, v_rpc);

  insert into prova_kpi (caso, esperado, obtido, passou)
  values (
    '6. Financeiro: o jeito antigo mostrava MENOS nos quatro KPIs do painel',
    format('real: a pagar %s (%s vencidas), a aprovar %s, pago no mes %s',
           v_real ->> 'a_pagar_valor', v_real ->> 'a_pagar_vencidas',
           v_real ->> 'a_aprovar_valor', v_real ->> 'pago_mes_valor'),
    format('antigo: a pagar %s (%s vencidas), a aprovar %s, pago no mes %s',
           v_node ->> 'a_pagar_valor', v_node ->> 'a_pagar_vencidas',
           v_node ->> 'a_aprovar_valor', v_node ->> 'pago_mes_valor'),
    (v_node ->> 'a_pagar_valor')::numeric < (v_real ->> 'a_pagar_valor')::numeric
    and (v_node ->> 'a_pagar_vencidas')::numeric < (v_real ->> 'a_pagar_vencidas')::numeric
    and (v_node ->> 'a_aprovar_valor')::numeric < (v_real ->> 'a_aprovar_valor')::numeric
    and (v_node ->> 'pago_mes_valor')::numeric < (v_real ->> 'pago_mes_valor')::numeric
  );
end $prova$;

select ordem, caso, esperado, obtido, passou,
       bool_and(passou) over () as prova_inteira_passou
from prova_kpi
order by ordem;

rollback;

-- Depois do rollback nao pode ter sobrado nada da massa.
select
  (select count(*) from public.lancamento_parcelas) as parcelas,
  (select count(*) from public.ordens_compra) as ocs,
  (select count(*) from public.audit_log where dados_depois::text like '%[PROVA-KPI]%') as audit_da_prova;

-- ---------------------------------------------------------------
-- Rodada em 01/08/2026 contra vsesgvqjgqpapoxhnbqx: 6 de 6 passaram.
--
--   1. compras hoje       novo = antigo  (1 OC aberta, R$ 3.600,00)
--   2. financeiro hoje    novo = antigo  (3 parcelas a aprovar, R$ 3.600,00)
--   3. compras com massa  RPC = 1200 OCs / R$ 1.200.000,00 (o real)
--   4. compras com massa  antigo mostrava 1000 OCs / R$ 1.000.000,00
--   5. financeiro c/massa RPC = a pagar 120.000,00 (1100 vencidas),
--                               a aprovar 63.600,00, pago no mes 30.000,00
--   6. financeiro c/massa antigo mostrava a pagar 100.000,00 (1000 vencidas),
--                               a aprovar 53.450,00, pago no mes 25.000,00
--
-- Depois do rollback: 3 parcelas, 1 lancamento, 1 OC, 0 linha de audit da
-- prova. Producao exatamente como estava.
