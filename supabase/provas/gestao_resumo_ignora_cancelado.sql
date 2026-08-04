-- Prova: os KPIs do Financeiro no painel de Gestao param de contar lancamento
-- CANCELADO.
--
-- Defeito (medido em 04/08/2026): fn_rel_gestao_financeiro_resumo filtrava so
-- lancamentos.tipo = 'a_pagar' e NAO excluia lancamento cancelado, enquanto as
-- dez fn_rel_* irmas todas excluem com `l.status <> 'cancelado'`. Resultado: "A
-- pagar em aberto", "Vence em ate 7 dias", "Pagamentos a aprovar" e "Pago no
-- mes" podiam mostrar MAIS do que a empresa deve, na primeira tela depois do
-- login, discordando dos relatorios e da tabela de maiores custos que fica logo
-- abaixo dos cartoes na mesma tela.
--
-- Hoje o banco tem 1 lancamento e 3 parcelas, nenhum cancelado: o defeito e
-- invisivel, e e exatamente por isso que ele passaria despercebido ate a
-- primeira OC cancelada com parcela em aberto.
--
-- O que esta prova mostra:
--
--   0. Premissa: hoje nao existe lancamento cancelado nem parcela cancelada
--   1. A copia pg_temp da versao VIVA e fiel (mesmo prosrc, mesmo numero)
--   2. Reescrita: `except all` nas duas direcoes contra a definicao viva.
--      Nenhuma linha se perdeu; as unicas linhas novas sao o filtro e o
--      comentario que o explica
--   3. md5 do prosrc antes e depois (o que exatamente mudou)
--   4. Com os dados de hoje o numero NAO muda: novo = antigo, nos sete
--   5. Com um lancamento CANCELADO com parcela em aberto: o ANTIGO inflava os
--      quatro cortes do painel
--   6. Com a mesma massa: o NOVO nao mexe em nenhum dos sete numeros
--   7. Os quatro cortes fecham entre si e com quatro consultas independentes
--   8. Fecha com fn_rel_aging (que ja excluia cancelado): o "vence em ate 7
--      dias" cabe dentro de vencido + ate_7 do aging. O ANTIGO estourava esse
--      teto com a massa, o que e a assinatura do defeito visto de fora
--
-- Roda contra PRODUCAO dentro de begin ... rollback. A definicao nova entra na
-- propria transacao (DDL e transacional no Postgres), e a massa dos casos 5 a 8
-- e criada e desfeita: nada sobra, nem no audit_log, nem em
-- documento_sequencias (que e tabela, e volta junto).
--
-- IMPORTANTE: as fn_rel_* sao SECURITY INVOKER. Por isso a medicao roda com
-- `role = authenticated` e o jwt de um usuario real, valendo o mesmo RLS da
-- tela. A massa entra como postgres, porque lancamento_parcelas so tem policy
-- de SELECT.

begin;

create temp table prova_cancelado (
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
                where p.usuario_id = u.id and p.recurso = 'financeiro.lancamentos' and p.acao = 'ver')
  limit 1;

  if v_usuario is null then
    raise exception 'Nenhum usuario ativo ve financeiro.lancamentos';
  end if;

  perform set_config('request.jwt.claims', json_build_object('sub', v_usuario)::text, true);
end $prova$;

-- ---------------------------------------------------------------
-- A definicao VIVA, guardada antes de qualquer coisa
-- ---------------------------------------------------------------
create temp table def_antes as
select p.prosrc, md5(p.prosrc) as md5_prosrc
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public' and p.proname = 'fn_rel_gestao_financeiro_resumo';

-- A copia da versao antiga e montada a partir do prosrc vivo, nao digitada de
-- novo: assim nao existe a chance de a "versao antiga" da prova ser uma versao
-- que nunca rodou em producao.
do $prova$
declare v_src text;
begin
  select prosrc into v_src from def_antes;

  execute format($ddl$
    create function pg_temp.resumo_antigo(p_hoje date default null)
    returns table (
      a_pagar_contagem int,
      a_pagar_vencidas int,
      a_pagar_valor numeric,
      a_aprovar_contagem int,
      a_aprovar_valor numeric,
      pago_mes_contagem int,
      pago_mes_valor numeric
    )
    language sql
    stable
    set search_path = ''
    as %L
  $ddl$, v_src);
end $prova$;

-- ---------------------------------------------------------------
-- Medidores. Viram authenticated para medir e voltam depois, para
-- conseguirem escrever em prova_cancelado.
-- ---------------------------------------------------------------
create function pg_temp.medir_novo(p_hoje date) returns jsonb language plpgsql as $$
declare v jsonb;
begin
  perform set_config('role', 'authenticated', true);
  select to_jsonb(r) into v from public.fn_rel_gestao_financeiro_resumo(p_hoje) r;
  perform set_config('role', 'none', true);
  return v;
end $$;

create function pg_temp.medir_antigo(p_hoje date) returns jsonb language plpgsql as $$
declare v jsonb;
begin
  perform set_config('role', 'authenticated', true);
  select to_jsonb(r) into v from pg_temp.resumo_antigo(p_hoje) r;
  perform set_config('role', 'none', true);
  return v;
end $$;

-- Os quatro numeros do painel recalculados um por um, cada um na sua consulta,
-- com o criterio das irmas. Se o resumo (uma varredura com FILTER) discordar
-- daqui, os cortes nao fecham entre si.
create function pg_temp.medir_a_mao(p_hoje date) returns jsonb language plpgsql as $$
declare v jsonb;
begin
  perform set_config('role', 'authenticated', true);
  select jsonb_build_object(
    'a_pagar_contagem', (select count(*) from public.lancamento_parcelas p
        join public.lancamentos l on l.id = p.lancamento_id
        where l.tipo = 'a_pagar' and l.status <> 'cancelado'
          and p.status = 'aprovado' and p.data_vencimento <= p_hoje + 7),
    'a_pagar_vencidas', (select count(*) from public.lancamento_parcelas p
        join public.lancamentos l on l.id = p.lancamento_id
        where l.tipo = 'a_pagar' and l.status <> 'cancelado'
          and p.status = 'aprovado' and p.data_vencimento <= p_hoje + 7
          and p.data_vencimento < p_hoje),
    'a_pagar_valor', (select coalesce(sum(p.valor), 0) from public.lancamento_parcelas p
        join public.lancamentos l on l.id = p.lancamento_id
        where l.tipo = 'a_pagar' and l.status <> 'cancelado'
          and p.status = 'aprovado' and p.data_vencimento <= p_hoje + 7),
    'a_aprovar_contagem', (select count(*) from public.lancamento_parcelas p
        join public.lancamentos l on l.id = p.lancamento_id
        where l.tipo = 'a_pagar' and l.status <> 'cancelado'
          and p.status = 'pendente'),
    'a_aprovar_valor', (select coalesce(sum(p.valor), 0) from public.lancamento_parcelas p
        join public.lancamentos l on l.id = p.lancamento_id
        where l.tipo = 'a_pagar' and l.status <> 'cancelado'
          and p.status = 'pendente'),
    'pago_mes_contagem', (select count(*) from public.lancamento_parcelas p
        join public.lancamentos l on l.id = p.lancamento_id
        where l.tipo = 'a_pagar' and l.status <> 'cancelado'
          and p.status = 'pago'
          and p.data_pagamento >= date_trunc('month', p_hoje)::date
          and p.data_pagamento < (date_trunc('month', p_hoje) + interval '1 month')::date),
    'pago_mes_valor', (select coalesce(sum(p.valor), 0) from public.lancamento_parcelas p
        join public.lancamentos l on l.id = p.lancamento_id
        where l.tipo = 'a_pagar' and l.status <> 'cancelado'
          and p.status = 'pago'
          and p.data_pagamento >= date_trunc('month', p_hoje)::date
          and p.data_pagamento < (date_trunc('month', p_hoje) + interval '1 month')::date)
  ) into v;
  perform set_config('role', 'none', true);
  return v;
end $$;

-- Aging do mesmo dia: quanto de a_pagar em aberto (pendente, em revisao ou
-- aprovado) vence de hoje ate 7 dias ou ja venceu. E o teto natural do cartao
-- "vence em ate 7 dias", que olha so as aprovadas.
create function pg_temp.medir_aging_ate7(p_hoje date) returns numeric language plpgsql as $$
declare v numeric;
begin
  perform set_config('role', 'authenticated', true);
  select coalesce(sum(a.total), 0) into v
  from public.fn_rel_aging(p_hoje) a
  where a.tipo = 'a_pagar' and a.faixa_prazo in ('vencido', 'ate_7');
  perform set_config('role', 'none', true);
  return v;
end $$;

-- jsonb compara numero por numero; 0 e 0.00 sao o mesmo numero, entao a
-- comparacao nao quebra por formatacao de NUMERIC.
create function pg_temp.registrar(p_caso text, p_esperado jsonb, p_obtido jsonb)
returns void language sql as $$
  insert into prova_cancelado (caso, esperado, obtido, passou)
  values (p_caso, p_esperado::text, p_obtido::text, p_esperado = p_obtido);
$$;

-- ---------------------------------------------------------------
-- 0. Premissa: hoje nao ha cancelado nenhum
-- ---------------------------------------------------------------
insert into prova_cancelado (caso, esperado, obtido, passou)
select
  '0. Premissa: hoje nao existe lancamento cancelado nem parcela cancelada',
  'lanc cancelado 0, parcela cancelada 0',
  format('lanc cancelado %s, parcela cancelada %s', c.lanc, c.parc),
  c.lanc = 0 and c.parc = 0
from (
  select
    (select count(*) from public.lancamentos where status = 'cancelado') as lanc,
    (select count(*) from public.lancamento_parcelas where status = 'cancelado') as parc
) c;

-- ---------------------------------------------------------------
-- 1. A copia pg_temp e fiel a versao viva
-- ---------------------------------------------------------------
insert into prova_cancelado (caso, esperado, obtido, passou)
select
  '1. A copia pg_temp reproduz o prosrc da funcao viva',
  (select md5_prosrc from def_antes),
  md5(p.prosrc),
  md5(p.prosrc) = (select md5_prosrc from def_antes)
from pg_proc p
where p.pronamespace = pg_my_temp_schema() and p.proname = 'resumo_antigo';

do $prova$
declare v_hoje date := (now() at time zone 'America/Rio_Branco')::date;
begin
  perform pg_temp.registrar(
    '1b. Antes de aplicar nada: a copia da o mesmo numero da funcao em producao',
    pg_temp.medir_novo(v_hoje), pg_temp.medir_antigo(v_hoje));
end $prova$;

-- Snapshot do painel de hoje, medido ANTES da troca.
create temp table painel_hoje as
select pg_temp.medir_antigo((now() at time zone 'America/Rio_Branco')::date) as valores;

-- ===============================================================
-- A CORRECAO (identica a supabase/migrations/20260804120001_...sql)
-- ===============================================================

create or replace function public.fn_rel_gestao_financeiro_resumo(p_hoje date default null)
returns table (
  a_pagar_contagem int,
  a_pagar_vencidas int,
  a_pagar_valor numeric,
  a_aprovar_contagem int,
  a_aprovar_valor numeric,
  pago_mes_contagem int,
  pago_mes_valor numeric
)
language sql
stable
set search_path = ''
as $$
  with janela as (
    select
      d.hoje,
      d.hoje + 7 as limite7,
      date_trunc('month', d.hoje)::date as inicio_mes,
      (date_trunc('month', d.hoje) + interval '1 month')::date as proximo_mes
    from (
      select coalesce(
        p_hoje,
        (now() at time zone 'America/Rio_Branco')::date
      ) as hoje
    ) d
  ),
  base as (
    -- Lancamento cancelado nao e divida: fora dos tres cortes, com o MESMO
    -- criterio das fn_rel_* irmas. Parcela cancelada ja cai fora sozinha,
    -- porque cada corte abaixo exige um status exato de parcela.
    select p.status, p.valor, p.data_vencimento, p.data_pagamento
    from public.lancamento_parcelas p
    join public.lancamentos l on l.id = p.lancamento_id
    where l.tipo = 'a_pagar'
      and l.status <> 'cancelado'
  )
  -- left join ... on true garante uma linha mesmo com base vazia: os FILTER
  -- viram falso e a funcao devolve zeros, nunca "nenhuma linha".
  select
    count(*) filter (
      where b.status = 'aprovado' and b.data_vencimento <= j.limite7
    )::int,
    count(*) filter (
      where b.status = 'aprovado'
        and b.data_vencimento <= j.limite7
        and b.data_vencimento < j.hoje
    )::int,
    coalesce(sum(b.valor) filter (
      where b.status = 'aprovado' and b.data_vencimento <= j.limite7
    ), 0),
    count(*) filter (where b.status = 'pendente')::int,
    coalesce(sum(b.valor) filter (where b.status = 'pendente'), 0),
    count(*) filter (
      where b.status = 'pago'
        and b.data_pagamento >= j.inicio_mes
        and b.data_pagamento < j.proximo_mes
    )::int,
    coalesce(sum(b.valor) filter (
      where b.status = 'pago'
        and b.data_pagamento >= j.inicio_mes
        and b.data_pagamento < j.proximo_mes
    ), 0)
  from janela j
  left join base b on true
$$;

-- create or replace nao mexe em grant nem em owner; os dois ficam aqui de
-- proposito, para a funcao continuar autocontida se alguem rodar so este
-- arquivo num banco novo.
revoke all on function public.fn_rel_gestao_financeiro_resumo(date) from public, anon;
grant execute on function public.fn_rel_gestao_financeiro_resumo(date) to authenticated;

comment on function public.fn_rel_gestao_financeiro_resumo(date) is
  'KPIs do Financeiro no painel de Gestao (a pagar ate 7 dias com vencidas, a aprovar, pago no mes) agregados no banco. Ignora lancamento cancelado, igual as fn_rel_* irmas. p_hoje nulo = hoje em America/Rio_Branco. Uma linha.';

-- fn_rel_gestao_compras_resumo NAO tem o mesmo defeito e nao e tocada aqui:
-- ela filtra por lista branca (`oc.status in ('pendente_aprovacao',
-- 'aprovado')`, e `c.status = 'aberta'` nas cotacoes), e 'cancelado' /
-- 'cancelada' sao status mutuamente exclusivos no check das duas tabelas. OC
-- cancelada, portanto, nunca entra. Confirmado tambem em
-- fn_cancelar_ordem_compra, que grava status = 'cancelado' na OC.

notify pgrst, 'reload schema';

-- ---------------------------------------------------------------
-- 2. Reescrita: nenhuma guarda se perdeu
-- ---------------------------------------------------------------
with depois as (
  select p.prosrc
  from pg_proc p
  join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public' and p.proname = 'fn_rel_gestao_financeiro_resumo'
),
linhas_antes as (
  select unnest(string_to_array((select prosrc from def_antes), E'\n')) as linha
),
linhas_depois as (
  select unnest(string_to_array((select prosrc from depois), E'\n')) as linha
),
perdidas as (
  select linha from linhas_antes except all select linha from linhas_depois
),
ganhas as (
  select linha from linhas_depois except all select linha from linhas_antes
)
insert into prova_cancelado (caso, esperado, obtido, passou)
select
  '2. except all nas duas direcoes: nada perdido, so o filtro e o comentario entraram',
  'perdidas: (nenhuma) | ganhas: 4 linhas, uma delas o filtro',
  format('perdidas: %s | ganhas: %s',
    coalesce((select string_agg(btrim(linha), ' / ') from perdidas), '(nenhuma)'),
    coalesce((select string_agg(btrim(linha), ' / ') from ganhas), '(nenhuma)')),
  not exists (select 1 from perdidas)
  and (select count(*) from ganhas) = 4
  and (select count(*) from ganhas where btrim(linha) = 'and l.status <> ''cancelado''') = 1;

-- ---------------------------------------------------------------
-- 3. md5 do prosrc: antes e depois
-- ---------------------------------------------------------------
insert into prova_cancelado (caso, esperado, obtido, passou)
select
  '3. md5 do prosrc mudou e bate com o corpo da migration',
  format('antes %s, depois 92967669ba1489f4c282ca6ed5316dbb', (select md5_prosrc from def_antes)),
  format('antes %s, depois %s', (select md5_prosrc from def_antes), md5(p.prosrc)),
  md5(p.prosrc) = '92967669ba1489f4c282ca6ed5316dbb'
  and md5(p.prosrc) <> (select md5_prosrc from def_antes)
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public' and p.proname = 'fn_rel_gestao_financeiro_resumo';

-- ---------------------------------------------------------------
-- 4. Dados de hoje: o numero NAO muda
-- ---------------------------------------------------------------
do $prova$
declare v_hoje date := (now() at time zone 'America/Rio_Branco')::date;
begin
  perform pg_temp.registrar(
    '4. Dados de hoje: os sete numeros do novo = os sete do antigo',
    (select valores from painel_hoje), pg_temp.medir_novo(v_hoje));
end $prova$;

-- ---------------------------------------------------------------
-- Massa: UM lancamento cancelado com parcela em aberto
-- ---------------------------------------------------------------
-- E o caso que a empresa vai produzir na primeira OC cancelada:
-- fn_cancelar_ordem_compra cancela o cabecalho do lancamento e as parcelas nao
-- pagas. Aqui a massa e mais dura de proposito: o lancamento esta cancelado e
-- as parcelas seguem em aberto, como se alguem tivesse cancelado o cabecalho
-- sem cascata. Se o filtro estiver no lugar certo (o cabecalho), some tudo.
do $prova$
declare
  v_hoje date := (now() at time zone 'America/Rio_Branco')::date;
  v_mes date := date_trunc('month', (now() at time zone 'America/Rio_Branco'))::date;
  v_lanc uuid;
begin
  insert into public.lancamentos (tipo, origem, descricao, valor, status, mes_competencia)
  values ('a_pagar', 'manual', '[PROVA-CANCELADO] nao deve aparecer em KPI', 1600.00, 'cancelado', v_mes)
  returning id into v_lanc;

  insert into public.lancamento_parcelas
    (lancamento_id, numero_parcela, valor, data_vencimento, data_programada, data_pagamento, status)
  values
    -- vence dentro dos 7 dias: infla "A pagar em aberto"
    (v_lanc, 1, 500.00, v_hoje + 3, v_hoje + 3, null, 'aprovado'),
    -- ja vencida: infla "A pagar" e o contador de vencidas
    (v_lanc, 2, 300.00, v_hoje - 2, v_hoje - 2, null, 'aprovado'),
    -- pendente: infla "Pagamentos a aprovar"
    (v_lanc, 3, 100.00, v_hoje + 30, null, null, 'pendente'),
    -- paga neste mes: infla "Pago no mes"
    (v_lanc, 4, 700.00, v_hoje, v_hoje, v_hoje, 'pago');
end $prova$;

-- ---------------------------------------------------------------
-- 5 e 6. O defeito, reproduzido, e a correcao
-- ---------------------------------------------------------------
do $prova$
declare
  v_hoje date := (now() at time zone 'America/Rio_Branco')::date;
  v_hoje_snap jsonb := (select valores from painel_hoje);
  v_antigo jsonb := pg_temp.medir_antigo(v_hoje);
  v_novo jsonb := pg_temp.medir_novo(v_hoje);
begin
  insert into prova_cancelado (caso, esperado, obtido, passou)
  values (
    '5. Com o lancamento cancelado: o ANTIGO inflava os quatro cortes',
    format('a pagar %s (%s vencidas), a aprovar %s, pago no mes %s (o painel sem a massa)',
           v_hoje_snap ->> 'a_pagar_valor', v_hoje_snap ->> 'a_pagar_vencidas',
           v_hoje_snap ->> 'a_aprovar_valor', v_hoje_snap ->> 'pago_mes_valor'),
    format('antigo mostrava a pagar %s (%s vencidas), a aprovar %s, pago no mes %s',
           v_antigo ->> 'a_pagar_valor', v_antigo ->> 'a_pagar_vencidas',
           v_antigo ->> 'a_aprovar_valor', v_antigo ->> 'pago_mes_valor'),
    (v_antigo ->> 'a_pagar_valor')::numeric > (v_hoje_snap ->> 'a_pagar_valor')::numeric
    and (v_antigo ->> 'a_pagar_vencidas')::int > (v_hoje_snap ->> 'a_pagar_vencidas')::int
    and (v_antigo ->> 'a_aprovar_valor')::numeric > (v_hoje_snap ->> 'a_aprovar_valor')::numeric
    and (v_antigo ->> 'pago_mes_valor')::numeric > (v_hoje_snap ->> 'pago_mes_valor')::numeric
  );

  perform pg_temp.registrar(
    '6. Com a mesma massa: o NOVO nao mexe em nenhum dos sete numeros',
    v_hoje_snap, v_novo);
end $prova$;

-- ---------------------------------------------------------------
-- 7. Os quatro cortes fecham entre si
-- ---------------------------------------------------------------
do $prova$
declare
  v_hoje date := (now() at time zone 'America/Rio_Branco')::date;
  v_novo jsonb := pg_temp.medir_novo(v_hoje);
begin
  perform pg_temp.registrar(
    '7. Uma varredura com FILTER = quatro consultas independentes, com a massa no banco',
    pg_temp.medir_a_mao(v_hoje), v_novo);

  insert into prova_cancelado (caso, esperado, obtido, passou)
  values (
    '7b. Vencidas e subconjunto de a pagar, e nenhum corte fica negativo',
    'vencidas <= contagem e todos >= 0',
    format('a pagar %s parcelas (%s vencidas), a aprovar %s, pago no mes %s',
           v_novo ->> 'a_pagar_contagem', v_novo ->> 'a_pagar_vencidas',
           v_novo ->> 'a_aprovar_contagem', v_novo ->> 'pago_mes_contagem'),
    (v_novo ->> 'a_pagar_vencidas')::int <= (v_novo ->> 'a_pagar_contagem')::int
    and (v_novo ->> 'a_pagar_valor')::numeric >= 0
    and (v_novo ->> 'a_aprovar_valor')::numeric >= 0
    and (v_novo ->> 'pago_mes_valor')::numeric >= 0
  );
end $prova$;

-- ---------------------------------------------------------------
-- 8. Fecha com o aging, que ja excluia cancelado
-- ---------------------------------------------------------------
do $prova$
declare
  v_hoje date := (now() at time zone 'America/Rio_Branco')::date;
  v_aging numeric := pg_temp.medir_aging_ate7(v_hoje);
  v_antigo jsonb := pg_temp.medir_antigo(v_hoje);
  v_novo jsonb := pg_temp.medir_novo(v_hoje);
begin
  insert into prova_cancelado (caso, esperado, obtido, passou)
  values (
    '8. O ANTIGO estourava o aging (assinatura do defeito visto de fora)',
    format('a pagar do painel <= %s (vencido + ate_7 do aging)', v_aging),
    format('antigo %s, novo %s', v_antigo ->> 'a_pagar_valor', v_novo ->> 'a_pagar_valor'),
    (v_antigo ->> 'a_pagar_valor')::numeric > v_aging
    and (v_novo ->> 'a_pagar_valor')::numeric <= v_aging
  );
end $prova$;

select ordem, caso, esperado, obtido, passou,
       bool_and(passou) over () as prova_inteira_passou
from prova_cancelado
order by ordem;

rollback;

-- Depois do rollback nao pode ter sobrado nada: nem a massa, nem a definicao
-- nova (a producao volta para o md5 505d0ce3aa98748a226ece9f591c504d).
select
  (select count(*) from public.lancamentos) as lancamentos,
  (select count(*) from public.lancamento_parcelas) as parcelas,
  (select count(*) from public.audit_log where dados_depois::text like '%[PROVA-CANCELADO]%') as audit_da_prova,
  (select md5(p.prosrc) from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname = 'fn_rel_gestao_financeiro_resumo') as md5_da_funcao;

-- ---------------------------------------------------------------
-- Rodada em 04/08/2026 contra vsesgvqjgqpapoxhnbqx: 11 de 11 passaram.
--
--   0.  premissa            0 lancamento cancelado, 0 parcela cancelada
--   1.  copia fiel          md5 505d0ce3aa98748a226ece9f591c504d nas duas
--   1b. copia = producao    a pagar 0, a aprovar R$ 3.600,00 (3), pago 0
--   2.  except all          perdidas: nenhuma; ganhas: 3 comentarios + o filtro
--   3.  md5                 505d0ce3aa98748a226ece9f591c504d ->
--                           92967669ba1489f4c282ca6ed5316dbb
--   4.  dados de hoje       os sete numeros iguais (nada mudou)
--   5.  defeito reproduzido antigo inflava para a pagar R$ 800,00 (1 vencida),
--                           a aprovar R$ 3.700,00, pago no mes R$ 700,00
--   6.  correcao            novo seguiu em a pagar 0, a aprovar R$ 3.600,00,
--                           pago no mes 0, com a massa cancelada no banco
--   7.  cortes fecham       resumo = quatro consultas independentes
--   7b. coerencia           vencidas (0) <= contagem (0), nenhum negativo
--   8.  fecha com o aging   antigo 800,00 > teto 0 do aging; novo 0 <= 0
--
-- Depois do rollback: 1 lancamento, 3 parcelas, 0 linha de audit da prova e a
-- funcao de volta no md5 505d0ce3aa98748a226ece9f591c504d. Producao
-- exatamente como estava; a migration foi aplicada em seguida, por MCP.
