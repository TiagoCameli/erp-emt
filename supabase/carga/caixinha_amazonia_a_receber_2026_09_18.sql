-- Tira os 331 "a receber" da Amazonia Agroindustria de centro alheio e poe todos
-- numa etapa nova, "Caixinha Amazonia", dentro do centro da propria Amazonia.
--
-- Pedido do Tiago em 18/09/2026: "todos esses lancamentos a receber tem que
-- mudar de CC para o CC da amazonia agroindustria". Perguntado se ia na raiz ou
-- numa etapa, ele respondeu: "crie um etapa de Caixinha Amazonia". Perguntado se
-- os 5 que estavam em outras obras entravam: "Sim, os 331".
--
-- ## Por que etapa e nao a raiz
--
-- O centro "Amazonia Agroindustria" JA tem etapa ("Manutencao de Equipamentos da
-- Amazonia"), e a regra dele de 01/09/2026 diz que centro com etapa nao pode ter
-- nada na raiz. Jogar 331 linhas na raiz seria criar, no mesmo dia, o problema
-- que a limpeza das Carretas resolveu (carretas_nada_na_raiz_2026_09_01.sql).
--
-- ## O que estava errado
--
-- Os 331 sao do cliente "Amazonia Agroindustria", todos ja RECEBIDOS, vencimento
-- de 05/04/2025 a 28/08/2026, R$ 617.209,94 no total. Nenhum deles estava no
-- centro da Amazonia:
--
--   Escritorio Central                         326   R$ 591.966,94
--   004 - Galpao Silo                            3   R$   5.743,00
--   009 - Manutencao da Rodovia BR-364 L09&10    2   R$  19.500,00
--
-- Os 322 maiores sao categoria "Prestacao de servicos" com descricao de servico
-- feito para a Amazonia (ex "ABASTECIMENTO DA ESCAVADEIRA 320"). Os 5 de fora do
-- Escritorio sao "REFERENTE RECEBIMENTO CAIXA AMAZONIA" e "REFERENTE RECEBIMENTO
-- AMAZONIA PARA EMT" -- dinheiro da Amazonia entrando, nao receita daquelas
-- obras. Por isso entraram tambem, com o Tiago decidindo.
--
-- ## UPDATE, nunca DELETE+INSERT
--
-- So `centro_custo_id` muda. Recriar a linha perderia `categoria_id`, que e outra
-- dimensao do rateio e que a soma nao ve. Aqui os 331 tem `categoria_id` nulo no
-- rateio (a categoria vive no lancamento), mas a regra vale igual.
--
-- Cada lancamento tem UM rateio, entao nao ha divisao a fazer: 331 lancamentos,
-- 331 rateios, valor de cada um intocado e a soma identica nos dois lados.
--
-- ## Idempotente
--
-- A etapa nasce com id fixo e `on conflict do nothing`. O UPDATE so alcanca quem
-- ainda nao esta na Caixinha. Rodar duas vezes nao move nada na segunda.
--
-- Aplicado no banco vivo (vsesgvqjgqpapoxhnbqx) em 18/09/2026 via MCP.
-- Rollback versionado em
-- supabase/rollbacks/caixinha_amazonia_a_receber_2026_09_18_rollback.sql

do $aplica$
declare
  RAIZ     uuid := 'a6a1f57d-b8cb-4113-b694-58f34af7bdb4'; -- Amazonia Agroindustria
  CAIXINHA uuid := '0cba9e3e-34f7-452a-9374-17ba4fb6409f'; -- Caixinha Amazonia (etapa)

  v_antes_qtd   int;    v_antes_soma   numeric;
  v_antes_fora  int;
  v_depois_qtd  int;    v_depois_soma  numeric;
  v_intruso     int;
  v_sub_antes   numeric; v_sub_depois  numeric;
  v_div         int;
  v_movidos     int;
begin
  -- A etapa. Nivel 2, filha da raiz, sem obra propria -- mesmo molde da
  -- "Manutencao de Equipamentos da Amazonia".
  insert into public.centros_custo (id, nome, nivel, tipo, pai_id, obra_id, sistema, ativo)
  values (CAIXINHA, 'Caixinha Amazônia', 2, null, RAIZ, null, false, true)
  on conflict (id) do nothing;

  -- ANTES
  select count(*), coalesce(sum(r.valor), 0)
    into v_antes_qtd, v_antes_soma
  from public.lancamentos l
  join public.lancamento_rateios r on r.lancamento_id = l.id
  join public.clientes c on c.id = l.cliente_id
  where l.tipo = 'a_receber' and c.nome ilike 'Amazonia%';

  select count(*) into v_antes_fora
  from public.lancamentos l
  join public.lancamento_rateios r on r.lancamento_id = l.id
  join public.clientes c on c.id = l.cliente_id
  where l.tipo = 'a_receber' and c.nome ilike 'Amazonia%'
    and r.centro_custo_id <> CAIXINHA;

  select coalesce(sum(r.valor), 0) into v_sub_antes
  from public.lancamento_rateios r
  join public.centros_custo cc on cc.id = r.centro_custo_id
  where cc.id = RAIZ or cc.pai_id = RAIZ;

  if v_antes_fora > 0 and v_antes_qtd <> 331 then
    raise exception 'Esperava 331 rateios a receber da Amazonia, achei %.', v_antes_qtd;
  end if;
  if v_antes_fora > 0 and round(v_antes_soma, 2) <> 617209.94 then
    raise exception 'Esperava R$ 617.209,94 a receber da Amazonia, achei R$ %.', v_antes_soma;
  end if;

  -- O FIX
  update public.lancamento_rateios r
     set centro_custo_id = CAIXINHA
    from public.lancamentos l
    join public.clientes c on c.id = l.cliente_id
   where r.lancamento_id = l.id
     and l.tipo = 'a_receber'
     and c.nome ilike 'Amazonia%'
     and r.centro_custo_id <> CAIXINHA;
  get diagnostics v_movidos = row_count;

  -- DEPOIS
  select count(*), coalesce(sum(r.valor), 0)
    into v_depois_qtd, v_depois_soma
  from public.lancamentos l
  join public.lancamento_rateios r on r.lancamento_id = l.id
  join public.clientes c on c.id = l.cliente_id
  where l.tipo = 'a_receber' and c.nome ilike 'Amazonia%'
    and r.centro_custo_id = CAIXINHA;

  -- Ninguem que nao seja a Amazonia pode ter caido na etapa nova.
  select count(*) into v_intruso
  from public.lancamento_rateios r
  join public.lancamentos l on l.id = r.lancamento_id
  left join public.clientes c on c.id = l.cliente_id
  where r.centro_custo_id = CAIXINHA
    and (l.tipo <> 'a_receber' or c.nome is null or c.nome not ilike 'Amazonia%');

  select coalesce(sum(r.valor), 0) into v_sub_depois
  from public.lancamento_rateios r
  join public.centros_custo cc on cc.id = r.centro_custo_id
  where cc.id = RAIZ or cc.pai_id = RAIZ;

  select count(*) into v_div from (
    select l.id from public.lancamentos l
    join public.lancamento_rateios r on r.lancamento_id = l.id
    where l.status <> 'cancelado'
    group by l.id, l.valor
    having round(sum(r.valor), 2) <> round(l.valor, 2)) t;

  -- As que TEM que ficar iguais.
  if v_depois_qtd <> v_antes_qtd then
    raise exception 'Sumiu rateio no caminho: % antes, % depois.', v_antes_qtd, v_depois_qtd;
  end if;
  if round(v_depois_soma - v_antes_soma, 2) <> 0 then
    raise exception 'A soma do a receber da Amazonia mudou de R$ % para R$ %.',
      v_antes_soma, v_depois_soma;
  end if;
  if v_div > 0 then
    raise exception '% lancamento(s) com rateio que nao fecha com o valor.', v_div;
  end if;

  -- As que TEM que diferir, pelo valor exato: a subarvore da Amazonia ganha
  -- inteiro o que estava em centro alheio.
  if v_antes_fora > 0 and round(v_sub_depois - v_sub_antes, 2) <> round(v_antes_soma, 2) then
    raise exception 'A subarvore da Amazonia subiu R$ % em vez de R$ %.',
      v_sub_depois - v_sub_antes, v_antes_soma;
  end if;
  if v_intruso > 0 then
    raise exception '% linha(s) na Caixinha Amazonia que nao sao a receber da Amazonia.', v_intruso;
  end if;

  raise notice 'OK: % rateio(s) movido(s) para a Caixinha Amazonia. % linhas / R$ % na etapa.',
    v_movidos, v_depois_qtd, v_depois_soma;
end $aplica$;
