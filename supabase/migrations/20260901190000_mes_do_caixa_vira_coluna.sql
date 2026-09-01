-- =============================================================
-- O mes do CAIXA de uma parcela vira coluna, para o drill parar de mandar a
-- lista de ids na URL
--
-- ============================================================
-- O DEFEITO
-- ============================================================
-- O drill dos relatorios resolve o recorte em `fn_lancamentos_do_recorte`, traz
-- os ids dos lancamentos e os manda de volta para o PostgREST num
-- `id=in.(...)`. Isso viaja na QUERY STRING de um GET, 37 caracteres por uuid.
--
-- Medido no `edge_logs` em 01/09/2026:
--
--   GET /rest/v1/lancamentos -> 400, URL de 29.342 caracteres, 4 vezes
--
-- E a barra mais pesada do fluxo de caixa tem 732 lancamentos. Pior: o recorte
-- `conta_paga` (o clique na Posicao bancaria) casa 4.818 lancamentos numa conta
-- -- e acima de ~1.800 ids a requisicao NAO COMPLETA e nao deixa log em lugar
-- nenhum, entao aquele drill falhava sem nem virar 400.
--
-- Lote nao resolve: a lista aqui e FILTRO, e ordenacao, paginacao e
-- `count: exact` sao do servidor sobre o filtro inteiro.
--
-- ============================================================
-- POR QUE UMA COLUNA, E NAO MAIS UM PARAMETRO
-- ============================================================
-- A saida e a mesma que o filtro de centro de custo ja usa: mandar o filtro
-- para o EMBED (`.in("filho.coluna", ...)` + `not.is.null`), que e pequeno. Para
-- isso o criterio precisa ser uma COLUNA que o PostgREST saiba comparar -- e o
-- mes do caixa nao era: e um `case` sobre o status com dois `coalesce` dentro.
--
-- Agora e `mes_fluxo`, coluna gerada. E ela passa a ser a UNICA definicao: as
-- duas funcoes que tinham a expressao copiada (`fn_rel_fluxo_caixa` e
-- `fn_lancamentos_do_recorte`) leem a coluna. Sem isso seriam tres copias da
-- mesma regra, e a primeira que alguem mudasse de um lado so faria a lista abrir
-- com um conjunto diferente do que a barra somou, sem erro nenhum.
--
-- `date_trunc('month', x::timestamp)::date` e IMMUTABLE, que e o que coluna
-- gerada exige. `to_char` NAO e (depende de locale), por isso a coluna guarda o
-- dia 1 como `date` e quem precisa do texto formata na hora.
--
-- ============================================================
-- REGIME DE CAIXA, RELEMBRANDO
-- ============================================================
-- Parcela paga entra no mes em que o dinheiro se moveu (data_pagamento); as
-- demais, no mes em que devem ocorrer (data_programada). `data_vencimento` e o
-- fallback dos dois. E por isso que o mes muda quando a parcela e paga -- a
-- coluna e gerada, entao ela acompanha sozinha.
-- =============================================================

alter table public.lancamento_parcelas
  add column mes_fluxo date
  generated always as (
    case
      when status = 'pago'
        then date_trunc('month', coalesce(data_pagamento, data_vencimento)::timestamp)::date
      else date_trunc('month', coalesce(data_programada, data_vencimento)::timestamp)::date
    end
  ) stored;

comment on column public.lancamento_parcelas.mes_fluxo is
  'Primeiro dia do mes em que esta parcela entra no REGIME DE CAIXA: mes do pagamento quando paga, mes da programacao (ou do vencimento) quando nao. Definicao unica -- fn_rel_fluxo_caixa e fn_lancamentos_do_recorte leem daqui, e o drill filtra por ela no embed em vez de mandar a lista de ids na URL.';

-- O drill filtra por (mes_fluxo, status) e o relatorio agrupa por elas.
create index if not exists idx_lancamento_parcelas_mes_fluxo
  on public.lancamento_parcelas (mes_fluxo, status);

-- ---------- fn_rel_fluxo_caixa passa a ler a coluna ----------
-- Assinatura IGUAL a de 20260901120000, entao `create or replace` basta: o ACL
-- de `authenticated` sobrevive ao replace.
create or replace function public.fn_rel_fluxo_caixa(
  p_centros_custo uuid[] default null,
  p_centros_receita uuid[] default null
)
returns table(mes text, tipo text, realizado boolean, total numeric)
language sql
stable
set search_path to ''
as $function$
  with alvo_custo as (
    select distinct s.id as centro_id
    from unnest(coalesce(p_centros_custo, '{}'::uuid[])) as escolhido(id)
    cross join lateral public.fn_centro_custo_subarvore(escolhido.id) s
  ),
  alvo_receita as (
    select distinct s.id as centro_id
    from unnest(coalesce(p_centros_receita, '{}'::uuid[])) as escolhido(id)
    cross join lateral public.fn_centro_custo_subarvore(escolhido.id) s
  ),
  fatia as (
    select
      r.lancamento_id,
      sum(r.valor) as rateio_total,
      sum(case
            when l.tipo = 'a_pagar'   and ac.centro_id is not null then r.valor
            when l.tipo = 'a_receber' and ar.centro_id is not null then r.valor
            else 0
          end) as rateio_escolhido
    from public.lancamento_rateios r
    join public.lancamentos l on l.id = r.lancamento_id
    left join alvo_custo ac on ac.centro_id = r.centro_custo_id
    left join alvo_receita ar on ar.centro_id = r.centro_custo_id
    where l.status <> 'cancelado'
    group by r.lancamento_id
  ),
  parcela as (
    select
      -- A regra do mes de caixa mora na coluna gerada `mes_fluxo`, nao mais
      -- numa copia da expressao aqui.
      to_char(p.mes_fluxo, 'YYYY-MM') as mes,
      p.lancamento_id,
      l.tipo,
      (p.status = 'pago') as realizado,
      p.valor_liquido as valor,
      case
        when l.tipo = 'a_pagar'
          then coalesce(cardinality(p_centros_custo), 0) > 0
        else coalesce(cardinality(p_centros_receita), 0) > 0
      end as tem_corte
    from public.lancamento_parcelas p
    join public.lancamentos l on l.id = p.lancamento_id
    left join public.categorias_financeiras cf on cf.id = l.categoria_id
    where p.status <> 'cancelado'
      and l.status <> 'cancelado'
      and coalesce(cf.natureza, 'operacional') <> 'movimentacao'
  )
  select t.mes, t.tipo, t.realizado, round(sum(t.valor), 2) as total
  from (
    select
      pa.mes,
      pa.tipo,
      pa.realizado,
      case
        when pa.tem_corte
          then pa.valor * f.rateio_escolhido / nullif(f.rateio_total, 0)
        else pa.valor
      end as valor
    from parcela pa
    left join fatia f on f.lancamento_id = pa.lancamento_id
    where pa.mes is not null
      and (not pa.tem_corte or coalesce(f.rateio_escolhido, 0) <> 0)
  ) t
  group by t.mes, t.tipo, t.realizado
$function$;

comment on function public.fn_rel_fluxo_caixa(uuid[], uuid[]) is
  'Entradas e saidas por mes de CAIXA (coluna lancamento_parcelas.mes_fluxo), realizado e previsto. Ignora natureza movimentacao. Com centro escolhido soma a FATIA do rateio daquele centro (subarvore), por lado. Sem parametro, identica a versao sem filtro.';

-- ---------- fn_lancamentos_do_recorte passa a ler a coluna ----------
-- Assinatura igual, `create or replace` basta.
create or replace function public.fn_lancamentos_do_recorte(
  p_tipo_recorte text,
  p_faixa text default null,
  p_tipo_lancamento text default null,
  p_mes text default null,
  p_realizado boolean default null,
  p_conta uuid default null,
  p_hoje date default null
)
returns table(lancamento_id uuid, valor_no_recorte numeric)
language sql
stable
set search_path to ''
as $function$
  with corte as (
    select coalesce(p_hoje, (now() at time zone 'America/Rio_Branco')::date) as hoje
  ),
  parcela as (
    select
      p.lancamento_id,
      l.tipo as tipo_lancamento,
      p.status,
      p.valor,
      coalesce(p.valor_liquido, p.valor) as liquido,
      p.conta_bancaria_id,
      p.data_pagamento,
      coalesce(cf.natureza, 'operacional') as natureza,
      p.data_vencimento - c.hoje as dias,
      -- Mesma coluna que fn_rel_fluxo_caixa agrupa, e a mesma que o drill filtra
      -- no embed. Uma definicao so.
      to_char(p.mes_fluxo, 'YYYY-MM') as mes_fluxo
    from public.lancamento_parcelas p
    join public.lancamentos l on l.id = p.lancamento_id
    left join public.categorias_financeiras cf on cf.id = l.categoria_id
    cross join corte c
    where l.status <> 'cancelado'
  ),
  aging as (
    select f.lancamento_id, sum(f.valor) as total
    from (
      select b.lancamento_id, b.valor,
        case
          when b.dias is null  then 'a_vencer'
          when b.dias >= 0     then 'a_vencer'
          when b.dias >= -7    then 'v_1_7'
          when b.dias >= -15   then 'v_8_15'
          when b.dias >= -30   then 'v_16_30'
          when b.dias >= -60   then 'v_31_60'
          else                      'v_60_mais'
        end as faixa
      from parcela b
      where b.status in ('pendente', 'em_revisao', 'aprovado')
        and b.tipo_lancamento = p_tipo_lancamento
        and b.natureza <> 'movimentacao'
    ) f
    where p_tipo_recorte = 'aging' and f.faixa = p_faixa
    group by f.lancamento_id
  ),
  fluxo as (
    select lancamento_id, sum(liquido) as total
    from parcela
    where p_tipo_recorte = 'fluxo'
      and status <> 'cancelado'
      and mes_fluxo = p_mes
      and (status = 'pago') = p_realizado
      and natureza <> 'movimentacao'
    group by lancamento_id
  ),
  conta_paga as (
    select b.lancamento_id, sum(b.liquido) as total
    from parcela b
    join public.contas_bancarias c on c.id = b.conta_bancaria_id
    where p_tipo_recorte = 'conta_paga'
      and b.status = 'pago'
      and b.conta_bancaria_id is not null
      and b.natureza <> 'movimentacao'
      and (
        c.saldo_inicial_data is null
        or b.data_pagamento is null
        or b.data_pagamento > c.saldo_inicial_data
      )
      and (p_conta is null or b.conta_bancaria_id = p_conta)
    group by b.lancamento_id
  )
  select lancamento_id, total from aging
  union all
  select lancamento_id, total from fluxo
  union all
  select lancamento_id, total from conta_paga
$function$;

comment on function public.fn_lancamentos_do_recorte(text, text, text, text, boolean, uuid, date) is
  'Valor de cada lancamento DENTRO de um recorte de relatorio (aging, fluxo de caixa, conta paga). Cada ramo repete o WHERE da RPC gemea. O mes do caixa vem da coluna lancamento_parcelas.mes_fluxo, a mesma que fn_rel_fluxo_caixa agrupa e que o drill filtra no embed.';

-- =============================================================
-- PROVA
-- =============================================================
do $$
declare
  v_divergentes bigint;
  v_nulos bigint;
  v_valor_sem_mes numeric;
  v_acl_fluxo text;
  v_acl_recorte text;
begin
  -- 1. A coluna gerada tem de valer EXATAMENTE a expressao que estava copiada
  --    nas duas funcoes. Uma linha diferente ja moveria dinheiro de mes.
  select count(*) into v_divergentes
  from public.lancamento_parcelas p
  where p.mes_fluxo is distinct from (
    case
      when p.status = 'pago'
        then date_trunc('month', coalesce(p.data_pagamento, p.data_vencimento)::timestamp)::date
      else date_trunc('month', coalesce(p.data_programada, p.data_vencimento)::timestamp)::date
    end
  );

  if v_divergentes > 0 then
    raise exception 'mes_fluxo diverge da expressao antiga em % parcela(s)', v_divergentes;
  end if;

  -- 2. Parcela sem NENHUMA das tres datas fica com mes nulo e nao entra no fluxo
  --    de caixa. Isso ja era assim antes desta migration (a RPC sempre teve
  --    `where t.mes is not null`), entao aqui e AVISO e nao recusa -- barrar
  --    reprovaria a migration por um defeito de dado que ela nao causou nem
  --    piora. A guarda 1 e que prova que nada mudou de mes.
  --
  --    Medido em 01/09/2026: 1 parcela, R$ 432,24, LAN-2026-6522
  --    ("Diarias MARIA EVANILDE SILVA NASCIMENTO 08/2026", a pagar, pendente).
  --    Dinheiro invisivel no fluxo de caixa ate alguem lhe dar uma data.
  select count(*), coalesce(sum(p.valor_liquido), 0)
    into v_nulos, v_valor_sem_mes
  from public.lancamento_parcelas p
  where p.mes_fluxo is null and p.status <> 'cancelado';

  if v_nulos > 0 then
    raise notice 'ATENCAO: % parcela(s) nao cancelada(s) sem nenhuma das tres datas, somando %. Elas nao aparecem no fluxo de caixa.', v_nulos, v_valor_sem_mes;
  end if;

  -- 3. O `create or replace` preserva o ACL, mas conferir e barato e a falha
  --    seria uma tela em branco SEM erro.
  select array_to_string(p.proacl, ' ') into v_acl_fluxo
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public' and p.proname = 'fn_rel_fluxo_caixa';

  select array_to_string(p.proacl, ' ') into v_acl_recorte
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public' and p.proname = 'fn_lancamentos_do_recorte';

  if coalesce(v_acl_fluxo, '') not like '%authenticated=X%' then
    raise exception 'fn_rel_fluxo_caixa perdeu o grant (acl: %)', v_acl_fluxo;
  end if;
  if coalesce(v_acl_recorte, '') not like '%authenticated=X%' then
    raise exception 'fn_lancamentos_do_recorte perdeu o grant (acl: %)', v_acl_recorte;
  end if;

  raise notice 'mes_fluxo confere com a expressao antiga em todas as parcelas; grants preservados';
end
$$;
