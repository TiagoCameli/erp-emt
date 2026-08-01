-- =============================================================
-- fn_rel_aging passa a agregar POR FAIXA no banco, em vez de por data.
--
-- Defeito de origem (01/08/2026): a funcao devolvia uma linha por
-- (tipo, data_vencimento) em aberto. O teto silencioso de 1000 linhas do
-- PostgREST vale para RPC do mesmo jeito que para tabela: passando disso ele
-- devolve 1000 linhas sem erro nenhum. No dia em que a EMT tiver mais de mil
-- DATAS distintas com parcela em aberto (parcela de OC e de lancamento avulso
-- se acumulam ano a ano), o grafico "A pagar por prazo de vencimento" do painel
-- de Gestao e o relatorio de Aging do Financeiro passariam a mostrar MENOS
-- divida do que existe, calados. E o mesmo mecanismo que a migration
-- 20260801120001 acabou de tirar dos KPIs do painel, hoje.
--
-- Agora a funcao devolve no maximo 11 linhas por tipo (22 no total, com
-- a_pagar e a_receber): o teto deixa de ser alcancavel com qualquer volume,
-- porque o numero de linhas nao depende mais do numero de vencimentos.
--
-- Por que DUAS colunas de faixa e nao uma: as duas telas usam recortes
-- DIFERENTES da mesma base, e nenhuma das duas e a outra.
--
--   faixa_prazo (painel de Gestao, olha para a FRENTE): quanto o caixa precisa
--     suportar. Vencido / ate 7 / 8 a 15 / 16 a 30 / 31 a 60 / mais de 60, mais
--     "sem_data" para parcela sem vencimento.
--   faixa_aging (relatorio do Financeiro, olha para TRAS): ha quanto tempo
--     venceu. A vencer / vencido 1 a 7 / 8 a 15 / 16 a 30 / 31 a 60 / mais de 60,
--     com parcela sem vencimento contando como "a vencer".
--
-- Os dois recortes se encaixam: "vencido" do painel e a uniao das cinco faixas
-- de atraso do aging, e "a_vencer" do aging e a uniao das cinco faixas futuras
-- do painel mais "sem_data". Por isso uma linha por combinacao serve as duas
-- telas exatamente, sem nenhuma soma sobrando ou faltando, e sem uma tela ter
-- que reclassificar a faixa da outra.
--
-- As bordas sao copia fiel do TypeScript que sai (classificarPrazo em
-- gestao/calculo.ts e classificarFaixa em financeiro/relatorios/calculo.ts):
-- vencer hoje conta como "ate 7 dias" no painel e como "a vencer" no aging, e
-- toda borda pertence a faixa de baixo (7 dias e ate_7, 8 dias e d_8_15).
--
-- SECURITY INVOKER, como todas as fn_rel_* (conferido com pg_get_functiondef no
-- banco vivo, nao nas migrations do repo): roda sob o RLS do usuario logado,
-- igual a versao anterior. Filtro de status e de cancelado copiado sem mudanca
-- da definicao viva: nenhuma regra de negocio muda aqui, so o LUGAR onde a
-- classificacao por faixa acontece.
--
-- Precisa de drop porque muda a lista de colunas do returns table (sai
-- data_vencimento, entram faixa_prazo e faixa_aging), o que create or replace
-- nao aceita. Os grants voltam logo abaixo.
-- =============================================================

drop function if exists public.fn_rel_aging();

-- p_hoje existe para a tela mandar a MESMA data que ela usa no resto do painel
-- (dataHojeISO, fuso de Rio Branco) e para a prova conseguir fixar o dia. Nulo
-- cai no hoje de Rio Branco, nunca no UTC do servidor, que vira o dia seguinte
-- as 21h locais e mudaria a faixa de tudo que vence amanha.
create or replace function public.fn_rel_aging(p_hoje date default null)
returns table (
  tipo text,
  faixa_prazo text,
  faixa_aging text,
  total numeric
)
language sql
stable
set search_path = ''
as $$
  with corte as (
    select coalesce(p_hoje, (now() at time zone 'America/Rio_Branco')::date) as hoje
  ),
  parcela as (
    -- dias positivo = ainda vai vencer; negativo = ja venceu; nulo = sem data.
    select
      l.tipo as tipo,
      p.valor as valor,
      p.data_vencimento - c.hoje as dias
    from public.lancamento_parcelas p
    join public.lancamentos l on l.id = p.lancamento_id
    cross join corte c
    where p.status in ('pendente', 'em_revisao', 'aprovado')
      and l.status <> 'cancelado'
  )
  select
    b.tipo,
    case
      when b.dias is null then 'sem_data'
      when b.dias < 0     then 'vencido'
      when b.dias <= 7    then 'ate_7'
      when b.dias <= 15   then 'd_8_15'
      when b.dias <= 30   then 'd_16_30'
      when b.dias <= 60   then 'd_31_60'
      else                     'acima_60'
    end,
    case
      when b.dias is null  then 'a_vencer'
      when b.dias >= 0     then 'a_vencer'
      when b.dias >= -7    then 'v_1_7'
      when b.dias >= -15   then 'v_8_15'
      when b.dias >= -30   then 'v_16_30'
      when b.dias >= -60   then 'v_31_60'
      else                      'v_60_mais'
    end,
    sum(b.valor)
  from parcela b
  group by 1, 2, 3
$$;

revoke all on function public.fn_rel_aging(date) from public, anon;
grant execute on function public.fn_rel_aging(date) to authenticated;

comment on function public.fn_rel_aging(date) is
  'Parcelas em aberto (pendente, em revisao, aprovado) somadas por tipo e faixa de vencimento. faixa_prazo e o recorte para a frente do painel de Gestao (vencido, ate_7, d_8_15, d_16_30, d_31_60, acima_60, sem_data); faixa_aging e o recorte para tras do relatorio do Financeiro (a_vencer, v_1_7, v_8_15, v_16_30, v_31_60, v_60_mais). p_hoje nulo = hoje em America/Rio_Branco. No maximo 11 linhas por tipo, entao nunca esbarra no teto de 1000 do PostgREST.';

notify pgrst, 'reload schema';
