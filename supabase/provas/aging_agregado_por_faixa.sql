-- Prova: fn_rel_aging agrega POR FAIXA no banco e para de depender do numero
-- de datas de vencimento.
--
-- Defeito de origem (01/08/2026): a funcao devolvia uma linha por
-- (tipo, data_vencimento) em aberto. O teto silencioso de 1000 linhas do
-- PostgREST vale para RPC igual vale para tabela. No dia em que a EMT tiver mais
-- de mil DATAS distintas com parcela em aberto, o grafico "A pagar por prazo de
-- vencimento" do painel de Gestao e o relatorio de Aging do Financeiro
-- passariam a mostrar MENOS divida do que existe, sem erro nenhum na tela. Hoje
-- o banco tem 3 parcelas em 3 datas: o defeito e invisivel, e e exatamente por
-- isso que ele passaria despercebido ate a empresa ter volume.
--
-- Atencao ao que esta prova NAO afirma: ela nao vai a rede. O teto de 1000 e do
-- PostgREST, e aqui ele e reproduzido em SQL com `limit 1000` sobre o MESMO
-- conjunto de linhas que a funcao antiga devolvia, do mesmo jeito que a prova
-- gestao_kpis_somam_no_banco.sql fez hoje. O que se prova aqui e que o caminho
-- antigo perde dinheiro quando cortado em 1000 linhas e o novo nao, porque o
-- novo nunca chega perto de 1000 linhas.
--
-- O que esta prova mostra:
--
--   1. Gestao, dados de hoje: a faixa nova bate numero a numero com o que a
--      tela mostra hoje (paridade: e ela que autoriza a troca)
--   2. Financeiro, dados de hoje: idem, nas seis faixas de aging dos dois tipos
--   3. Bordas: com parcela em todo deslocamento de dia que muda de faixa
--      (-200,-61,-60,-31,-30,-16,-15,-8,-7,-1,0,1,7,8,15,16,30,31,60,61,200 e
--      sem data), o banco classifica igual ao TypeScript que esta saindo
--   4. Com 1200 DATAS distintas em aberto: o caminho antigo trava em 1000 e
--      mostra MENOS divida do que existe, nas duas telas
--   5. Com 1200 DATAS distintas em aberto: a funcao nova devolve o valor REAL
--   6. Com 1200 DATAS distintas em aberto: a funcao nova devolve punhado de
--      linhas, nao 1200 (e por isso o teto deixou de ser alcancavel)
--
-- "Caminho antigo" e a definicao viva de fn_rel_aging de antes da migration
-- 20260801160001 (copiada de pg_get_functiondef, nao do .sql do repo) mais a
-- classificacao por faixa que o TypeScript fazia depois. O espelho do
-- TypeScript e transcrito na mao a partir de classificarPrazo
-- (src/modules/gestao/calculo.ts) e classificarFaixa
-- (src/modules/financeiro/relatorios/calculo.ts): e uma segunda implementacao,
-- escrita da fonte, nao um copia e cola do CASE da migration. As comparacoes
-- sao `except all` nas duas direcoes, entao linha sobrando conta tanto quanto
-- linha faltando.
--
-- Roda contra PRODUCAO dentro de begin ... rollback. A massa do caso 3 em
-- diante e criada e desfeita: nada sobra, nem no audit_log. As funcoes pg_temp
-- somem com a sessao.
--
-- Em psql saem dois resultados: o quadro da prova e a contagem depois do
-- rollback. Em cliente que so mostra o ultimo SELECT (MCP do Supabase), rode
-- sem a ultima linha para ver o quadro.
--
-- IMPORTANTE: fn_rel_aging e SECURITY INVOKER, como as fn_rel_* irmas. Por isso
-- toda medicao roda com `role = authenticated` e o jwt de um usuario real,
-- valendo o mesmo RLS da tela. A massa entra como postgres.

begin;

create temp table prova_aging (
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
-- Espelho do TypeScript que esta saindo. Transcrito das funcoes puras,
-- na mesma ordem de comparacao, para valer como segunda opiniao.
-- ---------------------------------------------------------------

-- classificarPrazo(diasAteVencer) de src/modules/gestao/calculo.ts.
-- Vencer hoje (0 dia) entra em "ate 7 dias"; borda pertence a faixa de baixo.
create function pg_temp.faixa_prazo_ts(p_dias int) returns text
language plpgsql immutable as $$
begin
  if p_dias is null then return 'sem_data'; end if;
  if p_dias < 0    then return 'vencido';  end if;
  if p_dias <= 7   then return 'ate_7';    end if;
  if p_dias <= 15  then return 'd_8_15';   end if;
  if p_dias <= 30  then return 'd_16_30';  end if;
  if p_dias <= 60  then return 'd_31_60';  end if;
  return 'acima_60';
end $$;

-- classificarFaixa(diasVencido) de src/modules/financeiro/relatorios/calculo.ts,
-- com faixaDaParcela: sem vencimento conta como "a vencer". Recebe dias
-- VENCIDO (hoje - vencimento), que e o sinal contrario do de cima.
create function pg_temp.faixa_aging_ts(p_dias_vencido int) returns text
language plpgsql immutable as $$
begin
  if p_dias_vencido is null then return 'a_vencer';  end if;
  if p_dias_vencido <= 0    then return 'a_vencer';  end if;
  if p_dias_vencido <= 7    then return 'v_1_7';     end if;
  if p_dias_vencido <= 15   then return 'v_8_15';    end if;
  if p_dias_vencido <= 30   then return 'v_16_30';   end if;
  if p_dias_vencido <= 60   then return 'v_31_60';   end if;
  return 'v_60_mais';
end $$;

-- ---------------------------------------------------------------
-- Caminho antigo: fn_rel_aging como estava (uma linha por tipo e data) mais o
-- teto do PostgREST. p_teto = 1000 reproduz o corte silencioso; p_teto nulo da
-- o numero real, sem teto.
-- ---------------------------------------------------------------
create function pg_temp.aging_antigo(p_teto int)
returns table (tipo text, data_vencimento date, total numeric)
language plpgsql stable as $$
begin
  perform set_config('role', 'authenticated', true);
  return query
    select * from (
      select l.tipo, p.data_vencimento, sum(p.valor) as total
      from public.lancamento_parcelas p
      join public.lancamentos l on l.id = p.lancamento_id
      where p.status in ('pendente', 'em_revisao', 'aprovado')
        and l.status <> 'cancelado'
      group by l.tipo, p.data_vencimento
      limit p_teto
    ) s;
  perform set_config('role', 'none', true);
end $$;

-- O painel de Gestao ANTES: descartava a_receber e somava por faixa de prazo
-- no Node, em cima das linhas que o PostgREST tivesse entregue.
create function pg_temp.painel_antigo(p_hoje date, p_teto int)
returns table (faixa text, total numeric)
language sql stable as $$
  select pg_temp.faixa_prazo_ts(a.data_vencimento - p_hoje), sum(a.total)
  from pg_temp.aging_antigo(p_teto) a
  where a.tipo is distinct from 'a_receber'
  group by 1
$$;

-- O relatorio de Aging ANTES: separava a_receber do resto e somava por faixa de
-- atraso no Node, tambem em cima do que tivesse chegado.
create function pg_temp.relatorio_antigo(p_hoje date, p_teto int)
returns table (grupo text, faixa text, total numeric)
language sql stable as $$
  select
    case when a.tipo = 'a_receber' then 'a_receber' else 'a_pagar' end,
    pg_temp.faixa_aging_ts(p_hoje - a.data_vencimento),
    sum(a.total)
  from pg_temp.aging_antigo(p_teto) a
  group by 1, 2
$$;

-- ---------------------------------------------------------------
-- Caminho novo: as mesmas duas leituras, agora em cima da funcao agregada.
-- ---------------------------------------------------------------
create function pg_temp.aging_novo(p_hoje date)
returns table (tipo text, faixa_prazo text, faixa_aging text, total numeric)
language plpgsql stable as $$
begin
  perform set_config('role', 'authenticated', true);
  return query select * from public.fn_rel_aging(p_hoje);
  perform set_config('role', 'none', true);
end $$;

create function pg_temp.painel_novo(p_hoje date)
returns table (faixa text, total numeric)
language sql stable as $$
  select n.faixa_prazo, sum(n.total)
  from pg_temp.aging_novo(p_hoje) n
  where n.tipo is distinct from 'a_receber'
  group by 1
$$;

create function pg_temp.relatorio_novo(p_hoje date)
returns table (grupo text, faixa text, total numeric)
language sql stable as $$
  select
    case when n.tipo = 'a_receber' then 'a_receber' else 'a_pagar' end,
    n.faixa_aging,
    sum(n.total)
  from pg_temp.aging_novo(p_hoje) n
  group by 1, 2
$$;

create function pg_temp.registrar(p_caso text, p_esperado text, p_obtido text, p_passou boolean)
returns void language sql as $$
  insert into prova_aging (caso, esperado, obtido, passou)
  values (p_caso, p_esperado, p_obtido, p_passou);
$$;

-- ---------------------------------------------------------------
-- 1 e 2. Dados de hoje: a faixa nova e a mesma faixa de hoje
-- ---------------------------------------------------------------
do $prova$
declare
  v_hoje date := (now() at time zone 'America/Rio_Branco')::date;
  v_dif int;
begin
  select count(*) into v_dif from (
    (select * from pg_temp.painel_novo(v_hoje)
     except all select * from pg_temp.painel_antigo(v_hoje, 1000))
    union all
    (select * from pg_temp.painel_antigo(v_hoje, 1000)
     except all select * from pg_temp.painel_novo(v_hoje))
  ) d;

  perform pg_temp.registrar(
    '1. Gestao, dados de hoje: faixa nova = faixa que a tela mostra agora',
    '0 linha de diferenca (except all nas duas direcoes)',
    format('%s linha(s) de diferenca; faixas hoje: %s', v_dif,
      (select string_agg(format('%s=%s', faixa, total), ', ' order by faixa)
       from pg_temp.painel_novo(v_hoje))),
    v_dif = 0);

  select count(*) into v_dif from (
    (select * from pg_temp.relatorio_novo(v_hoje)
     except all select * from pg_temp.relatorio_antigo(v_hoje, 1000))
    union all
    (select * from pg_temp.relatorio_antigo(v_hoje, 1000)
     except all select * from pg_temp.relatorio_novo(v_hoje))
  ) d;

  perform pg_temp.registrar(
    '2. Financeiro, dados de hoje: aging novo = aging que o relatorio mostra agora',
    '0 linha de diferenca (except all nas duas direcoes)',
    format('%s linha(s) de diferenca; aging hoje: %s', v_dif,
      (select string_agg(format('%s/%s=%s', grupo, faixa, total), ', ' order by grupo, faixa)
       from pg_temp.relatorio_novo(v_hoje))),
    v_dif = 0);
end $prova$;

-- ---------------------------------------------------------------
-- Massa. Duas levas, com proposito diferente cada uma:
--
--   bordas: uma parcela em cada deslocamento de dia que muda de faixa, mais
--     uma sem vencimento. Faz TODA faixa existir de fato na comparacao.
--   volume: 1200 datas DISTINTAS em aberto, que e o cenario do defeito. Nao e
--     hipotese distante: sao parcelas de OC e de lancamento avulso acumulando
--     ao longo dos anos, e basta passar de mil datas distintas.
-- ---------------------------------------------------------------
do $prova$
declare
  v_hoje date := (now() at time zone 'America/Rio_Branco')::date;
  v_mes date := date_trunc('month', (now() at time zone 'America/Rio_Branco'))::date;
  v_lanc uuid;
begin
  insert into public.lancamentos (tipo, origem, descricao, valor, status, mes_competencia)
  values ('a_pagar', 'manual', '[PROVA-AGING] bordas', 2200.00, 'previsto', v_mes)
  returning id into v_lanc;

  insert into public.lancamento_parcelas
    (lancamento_id, numero_parcela, valor, data_vencimento, status)
  select v_lanc, row_number() over (), 100.00, v_hoje + dias, 'pendente'
  from unnest(array[-200,-61,-60,-31,-30,-16,-15,-8,-7,-1,0,1,7,8,15,16,30,31,60,61,200]) dias;

  -- Sem vencimento: 'sem_data' no painel e 'a vencer' no aging. A coluna aceita
  -- nulo, entao a tela precisa aguentar isso.
  insert into public.lancamento_parcelas
    (lancamento_id, numero_parcela, valor, data_vencimento, status)
  values (v_lanc, 99, 100.00, null, 'pendente');

  -- 1200 datas distintas, de 599 dias atras a 600 dias a frente: passa de mil
  -- datas e cobre todas as faixas dos dois recortes.
  insert into public.lancamentos (tipo, origem, descricao, valor, status, mes_competencia)
  values ('a_pagar', 'manual', '[PROVA-AGING] volume', 120000.00, 'previsto', v_mes)
  returning id into v_lanc;

  insert into public.lancamento_parcelas
    (lancamento_id, numero_parcela, valor, data_vencimento, status)
  select v_lanc, i, 100.00, v_hoje - 600 + i, 'pendente'
  from generate_series(1, 1200) i;
end $prova$;

-- ---------------------------------------------------------------
-- 3. Bordas: o banco classifica igual ao TypeScript que esta saindo
-- ---------------------------------------------------------------
do $prova$
declare
  v_hoje date := (now() at time zone 'America/Rio_Branco')::date;
  v_dif int;
  v_dif_ag int;
begin
  -- Sem teto dos dois lados: aqui a pergunta e a CLASSIFICACAO, nao o corte.
  select count(*) into v_dif from (
    (select * from pg_temp.painel_novo(v_hoje)
     except all select * from pg_temp.painel_antigo(v_hoje, null))
    union all
    (select * from pg_temp.painel_antigo(v_hoje, null)
     except all select * from pg_temp.painel_novo(v_hoje))
  ) d;

  select count(*) into v_dif_ag from (
    (select * from pg_temp.relatorio_novo(v_hoje)
     except all select * from pg_temp.relatorio_antigo(v_hoje, null))
    union all
    (select * from pg_temp.relatorio_antigo(v_hoje, null)
     except all select * from pg_temp.relatorio_novo(v_hoje))
  ) d;

  v_dif := v_dif + v_dif_ag;

  perform pg_temp.registrar(
    '3. Bordas e sem vencimento: faixa do banco = faixa do TypeScript, nos dois recortes',
    '0 linha de diferenca, com as 7 faixas de prazo e as 6 de aging povoadas',
    format('%s linha(s) de diferenca; %s faixas de prazo, %s faixas de aging',
      v_dif,
      (select count(*) from pg_temp.painel_novo(v_hoje)),
      (select count(distinct faixa) from pg_temp.relatorio_novo(v_hoje))),
    v_dif = 0
      and (select count(*) from pg_temp.painel_novo(v_hoje)) = 7
      and (select count(distinct faixa) from pg_temp.relatorio_novo(v_hoje)) = 6);
end $prova$;

-- ---------------------------------------------------------------
-- 4 a 6. Passando de 1000 datas: quem trunca e quem nao trunca
-- ---------------------------------------------------------------
do $prova$
declare
  v_hoje date := (now() at time zone 'America/Rio_Branco')::date;
  v_real numeric;
  v_cortado numeric;
  v_novo numeric;
  v_real_ag numeric;
  v_cortado_ag numeric;
  v_novo_ag numeric;
  v_linhas int;
  v_datas int;
begin
  select count(*) into v_datas from pg_temp.aging_antigo(null);

  select coalesce(sum(total), 0) into v_real     from pg_temp.painel_antigo(v_hoje, null);
  select coalesce(sum(total), 0) into v_cortado  from pg_temp.painel_antigo(v_hoje, 1000);
  select coalesce(sum(total), 0) into v_novo     from pg_temp.painel_novo(v_hoje);

  select coalesce(sum(total), 0) into v_real_ag    from pg_temp.relatorio_antigo(v_hoje, null);
  select coalesce(sum(total), 0) into v_cortado_ag from pg_temp.relatorio_antigo(v_hoje, 1000);
  select coalesce(sum(total), 0) into v_novo_ag    from pg_temp.relatorio_novo(v_hoje);

  perform pg_temp.registrar(
    format('4. Com %s datas distintas em aberto: o caminho antigo mostra MENOS divida', v_datas),
    format('real: painel %s, aging %s', v_real, v_real_ag),
    format('antigo travado em 1000 linhas mostrava: painel %s, aging %s (some %s)',
           v_cortado, v_cortado_ag, v_real - v_cortado),
    v_cortado < v_real and v_cortado_ag < v_real_ag);

  perform pg_temp.registrar(
    format('5. Com %s datas distintas em aberto: a funcao nova devolve o valor REAL', v_datas),
    format('painel %s, aging %s', v_real, v_real_ag),
    format('painel %s, aging %s', v_novo, v_novo_ag),
    v_novo = v_real and v_novo_ag = v_real_ag);

  select count(*) into v_linhas from pg_temp.aging_novo(v_hoje);

  perform pg_temp.registrar(
    '6. E o teto deixou de ser alcancavel: a funcao nova devolve punhado de linhas',
    format('no maximo 11 linhas por tipo, contra %s linhas do caminho antigo', v_datas),
    format('%s linha(s)', v_linhas),
    v_linhas <= 22 and v_datas > 1000);
end $prova$;

select ordem, caso, esperado, obtido, passou,
       bool_and(passou) over () as prova_inteira_passou
from prova_aging
order by ordem;

rollback;

-- Depois do rollback nao pode ter sobrado nada da massa.
select
  (select count(*) from public.lancamento_parcelas) as parcelas,
  (select count(*) from public.lancamentos) as lancamentos,
  (select count(*) from public.fn_rel_aging()) as linhas_fn_rel_aging,
  (select count(*) from public.audit_log where dados_depois::text like '%[PROVA-AGING]%') as audit_da_prova;

-- ---------------------------------------------------------------
-- Rodada em 01/08/2026 contra vsesgvqjgqpapoxhnbqx: 6 de 6 passaram.
--
--   1. gestao hoje     0 diferenca. As 3 parcelas em aberto de hoje:
--                      d_8_15 = 1.199,88, d_16_30 = 1.199,88,
--                      d_31_60 = 1.200,24
--   2. financeiro hoje 0 diferenca. a_pagar/a_vencer = 3.600,00 (nada vencido
--                      hoje, e nenhum lancamento a_receber no banco ainda)
--   3. bordas          0 diferenca nos dois recortes, com as 7 faixas de prazo
--                      e as 6 de aging povoadas
--   4. 1201 datas      antigo travado em 1000 linhas mostrava R$ 105.700,00
--                      contra R$ 125.800,00 reais: R$ 20.100,00 sumindo calado,
--                      nas DUAS telas
--   5. 1201 datas      nova = R$ 125.800,00, o valor real, nos dois recortes
--   6. 1201 datas      a nova devolveu 11 linhas (contra 1201 do caminho antigo)
--
-- Depois do rollback: 3 parcelas, 1 lancamento, 3 linhas em fn_rel_aging,
-- 0 linha de audit da prova, 0 lancamento com a marca [PROVA-AGING].
-- Producao exatamente como estava.
--
-- Guardas conferidas na definicao viva depois de aplicar (a funcao foi
-- recriada, entao nenhuma podia ter sumido):
--   security invoker (prosecdef = false), STABLE, search_path = ''
--   acl = {postgres=X/postgres, authenticated=X/postgres} (anon sem execute)
--   filtro de status da parcela (pendente, em_revisao, aprovado): presente
--   filtro l.status <> 'cancelado': presente
--   corte do dia em America/Rio_Branco: presente
--   md5(prosrc) antes 1d8c407814f093bf4039acf8f7d311b1
--   md5(prosrc) depois 59cffbffeaa9e41d98b2408eabb9a53f
