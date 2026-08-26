-- Prova de aceite: o extrato da conta FECHA no "Saldo atual" da listagem.
--
-- Contexto: `fn_extrato_conta` é a gêmea detalhada de `fn_rel_posicao_bancaria`.
-- A agregada alimenta a coluna "Saldo atual" de /financeiro/contas-bancarias; a
-- detalhada alimenta o extrato de cada conta. Duas funções com o mesmo WHERE
-- copiado à mão divergem na primeira regra que alguém acrescenta de um lado só,
-- e a divergência não dá erro em lugar nenhum: a tela de extrato simplesmente
-- fecha num saldo diferente do número que está na linha de cima.
--
-- É só leitura. Não escreve nada, não precisa de rollback.
--
-- A LINHA DE CONTROLE é o que dá valor ao resto: `controle_somando_tudo` soma o
-- extrato INTEIRO, ignorando a data de corte. Ela TEM que divergir do saldo em
-- toda conta que tenha corte, senão esta prova passaria mesmo se `no_saldo`
-- estivesse sempre true e o corte não estivesse sendo aplicado.

with e as (
  select c.id, c.nome, c.saldo_inicial, c.saldo_inicial_data,
         x.no_saldo, x.sentido, x.valor
  from public.contas_bancarias c
  -- `true` no segundo argumento: traz também o movimento anterior ao corte, que
  -- é o que a linha de controle precisa ver.
  cross join lateral public.fn_extrato_conta(c.id, true) x
),
somas as (
  select id, nome, saldo_inicial, saldo_inicial_data,
    count(*) as linhas_total,
    count(*) filter (where no_saldo) as linhas_no_saldo,
    round(coalesce(sum(case when no_saldo and sentido = 'entrada' then valor end), 0), 2) as entradas,
    round(coalesce(sum(case when no_saldo and sentido = 'saida'   then valor end), 0), 2) as saidas,
    round(coalesce(sum(case when sentido = 'entrada' then valor else -valor end), 0), 2) as movimento_de_tudo
  from e
  group by id, nome, saldo_inicial, saldo_inicial_data
)
select nome, saldo_inicial_data, linhas_total, linhas_no_saldo,
  entradas, saidas,
  round(saldo_inicial + entradas - saidas, 2) as extrato_fecha_em,
  public.fn_saldo_conta(id) as saldo_da_listagem,
  (round(saldo_inicial + entradas - saidas, 2) = public.fn_saldo_conta(id)) as passou,
  round(saldo_inicial + movimento_de_tudo, 2) as controle_somando_tudo,
  (round(saldo_inicial + movimento_de_tudo, 2) <> public.fn_saldo_conta(id)) as controle_divergiu
from somas
order by nome;

-- Resultado em 26/08/2026, com as cinco contas cadastradas:
--
--  nome                          corte       linhas  no_saldo  extrato_fecha_em  saldo_da_listagem  passou
--  BANCO DO BRASIL 102.124-9     2026-08-21    5939        53         37.393,55          37.393,55  true
--  BANCO DO BRASIL 1197-5 AMAZ.  (sem corte)    135       135              0,00               0,00  true
--  BANCO DO BRASIL 30.893-5      2026-08-21     336         4        779.246,33         779.246,33  true
--  CAIXA ECONOMICA 578367973-5   2026-08-26     340         0      4.599.100,34       4.599.100,34  true
--  CAIXINHA DE DINHEIRO          2026-08-23    1216         0              0,00               0,00  true
--
-- `passou = true` nas cinco.
--
-- CONTROLE: `controle_divergiu = true` em QUATRO das cinco, e por valores
-- grandes (BB 30.893-5 fecharia em R$ 12,34 mi somando tudo, contra os
-- R$ 779.246,33 reais). A única que não divergiu é a 1197-5, que não tem data de
-- corte: nela "tudo" e "dentro do saldo" são o mesmo conjunto, e não havia como
-- divergir. O controle está correto ao não acusar essa.
--
-- Nota de volume, que é o motivo de a tela usar `todasAsLinhas`: a BB 102.124-9
-- tem 5.939 movimentos registrados. O PostgREST corta em 1.000 sem erro nenhum,
-- então uma consulta solta esconderia 4.939 linhas em silêncio.

-- =====================================================================
-- Parte 2 (leitura): a RLS não zera o extrato nem apaga o nome da contraparte
-- =====================================================================
--
-- `fn_extrato_conta` NÃO é SECURITY DEFINER, então a RLS de lancamentos,
-- lancamento_parcelas, transferencias_contas e dos cadastros vale para quem
-- chama. O risco desta tela é o que já mordeu em Compras: a RLS de um módulo
-- vizinho devolve zero linhas ou nome nulo, e a tela desenha VAZIA sem erro
-- nenhum (foi assim que a Andreia viu 17 ordens e 0 opções, com UUID na tela).
--
-- `set_config('request.jwt.claims', ...)` sozinho NÃO prova nada: o MCP entra
-- como owner, e owner passa por cima da RLS. Quem faz a RLS valer é o
-- `set local role authenticated`.

do $prova$
declare
  v_conta uuid;
  v_owner int; v_tiago int; v_dora int;
  v_tiago_nomes int; v_dora_nomes int;
  v_dora_contas int;
begin
  select id into v_conta from public.contas_bancarias where nome ilike '%102.124-9%' limit 1;

  -- Como owner, sem RLS: o teto do que existe.
  select count(*) into v_owner from public.fn_extrato_conta(v_conta, false);

  -- Tiago (perfil Admin), que é quem hoje alcança a tela.
  perform set_config('request.jwt.claims', json_build_object('sub','c66fca9f-5428-4fb9-855f-dcff548764df','role','authenticated')::text, true);
  execute 'set local role authenticated';
  select count(*) into v_tiago from public.fn_extrato_conta(v_conta, false);
  select count(*) into v_tiago_nomes from public.fn_extrato_conta(v_conta, false) where contraparte is not null;
  reset role;

  -- Dora (perfil Financeiro), que vê lançamentos e NÃO tem
  -- financeiro.contas-bancarias. LINHA DE CONTROLE do que a RLS deixa passar por
  -- baixo: quem barra ela é a checagem da página, não a RLS destas tabelas. Serve
  -- para saber que, no dia em que a permissão for concedida, a tela não vai abrir
  -- vazia.
  perform set_config('request.jwt.claims', json_build_object('sub','3767e529-eae7-4178-852c-2dd2782efaaf','role','authenticated')::text, true);
  execute 'set local role authenticated';
  select count(*) into v_dora_contas from public.contas_bancarias where id = v_conta;
  select count(*) into v_dora from public.fn_extrato_conta(v_conta, false);
  select count(*) into v_dora_nomes from public.fn_extrato_conta(v_conta, false) where contraparte is not null;
  reset role;

  raise exception E'PROVA DE RLS (nada gravado)\n  owner ve % linhas\n  Tiago (Admin) ve % linhas, % com nome de contraparte\n  Dora (Financeiro) ve % linhas na conta_bancaria e % linhas de extrato, % com nome',
    v_owner, v_tiago, v_tiago_nomes, v_dora_contas, v_dora, v_dora_nomes;
end $prova$;

-- Resultado em 26/08/2026:
--   owner ve 53 linhas
--   Tiago (Admin) ve 53 linhas, 53 com nome de contraparte
--   Dora (Financeiro) ve 1 linhas na conta_bancaria e 53 linhas de extrato, 53 com nome
--
-- As 53 do Admin batem com as 53 do owner: a RLS não come linha de dinheiro, e
-- nenhuma contraparte volta nula por falta de acesso ao cadastro.

-- =====================================================================
-- Parte 3 (HTTP): o PostgREST aceita `order` + `Range` na chamada da RPC
-- =====================================================================
--
-- Não se prova em SQL: `todasAsLinhas` pagina a RPC com `.order().range()`, e
-- ordenação inválida numa chamada de função é erro que só aparece em runtime,
-- com build e teste verdes. Rodado com a chave `anon`, de propósito: o que se
-- quer saber é se a URL é PARSEADA, e o 403 de permissão prova isso melhor que
-- um 200 (que exigiria um JWT de usuário logado).
--
--   POST /rest/v1/rpc/fn_extrato_conta
--        ?order=data_movimento.asc.nullsfirst,chave.asc
--        Range: 0-999
--   -> 401 {"code":"42501","message":"permission denied for function fn_extrato_conta"}
--
-- CONTROLE, com `?order=coluna_que_nao_existe.asc`:
--   -> 400 {"code":"42703","message":"column record.coluna_que_nao_existe does not exist"}
--
-- O controle é o que dá valor ao primeiro: o PostgREST resolve as colunas do
-- `order` contra o record devolvido pela função ANTES de reclamar de permissão,
-- então `data_movimento` e `chave` foram aceitas de fato. E o 42501 confirma de
-- passagem que o `revoke ... from public` da migration fechou a porta do `anon`.
