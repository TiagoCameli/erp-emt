-- Os R$ 480 sem destino vao para o CS-01, e as tres linhas irmas que eu criei
-- sao fundidas.
--
-- Aplicado em 01/09/2026, depois de `respostas_da_planilha_parte2`.
--
--   raiz da Manutencao: R$ 12.260,39 -> R$ 11.780,39  (17 -> 14 lanc.)
--   CS-01:              R$ 73.286,55 -> R$ 73.766,55
--
--   "esses 480 coloque para o cs01 manutencao de equipamentos"
--
-- ## Bloco 1: os R$ 480
--
-- Eram as quatro fatias do rateio do MC que apontavam para maquina fora do
-- cadastro do ERP, e que eu deixei visiveis na raiz de proposito para a pergunta
-- continuar existindo:
--
--   LAN-2026-2946  R$ 420,00  "501 e 502 Motor Campactador de Solo"
--   LAN-2026-0793  R$  40,00  "Skidy"
--   LAN-2026-4307  R$  20,00  "Carga Semi-Reboque / Prancha - 104"
--
-- Os tres vao para o Caminhao Cavalo 2644 S/33 MZO-2987 - 01, o CS-01.
--
-- **O 0793 ja tinha uma fatia de R$ 25,00 no CS-01.** Somei nela em vez de
-- criar uma segunda linha no mesmo centro. Por isso o bloco mexe em tres
-- lancamentos e o numero de rateios cai UM: dois trocam de centro (net zero) e
-- um funde (net -1).
--
-- ## Bloco 2: tres linhas irmas que EU criei hoje e nao vi
--
-- Depois de aplicar, contei os pares (lancamento, centro) com mais de uma linha
-- e achei 21. Fui olhar quais eram meus e a minha primeira checagem MENTIU: eu
-- filtrei por `max(created_at) = hoje`, e as minhas eram UPDATE, que nao mexe em
-- `created_at`. Pela data pareciam de agosto.
--
-- Refazendo pela lista dos 59 lancamentos em vez de pela data, apareceram tres:
--
--   LAN-2026-4570  007 - AC 405        4.646,60 + 2.503,35
--   LAN-2026-0490  003 - Ramal do Gama 1.885,00 + 1.158,67
--   LAN-2026-3137  007 - AC 405        1.493,55 +    89,15
--
-- Eu mandei a fatia da raiz para um centro que o lancamento JA usava, e ficaram
-- duas linhas onde bastava uma. Nada errado no dinheiro -- as somas fechavam com
-- o valor do lancamento nos tres -- mas o detalhe do rateio ficava com linha
-- repetida, exatamente o que eu evitei no 0793 do bloco 1.
--
-- A licao e sobre a CHECAGEM, nao sobre o dado: `created_at` nao detecta UPDATE.
-- Para achar o que eu mesmo mexi, o filtro tem que ser a lista do que eu mexi.
--
-- ## Linha de controle
--
-- No bloco 1 o CS-01 sobe exatamente R$ 480,00, a raiz cai exatamente R$ 480,00,
-- e a **subarvore da Manutencao nao mexe**, porque o CS-01 vive dentro dela.
--
-- No bloco 2 a checagem e o contrario: fundir nao pode mexer em UM CENTAVO de
-- centro nenhum. O AC 405, o Ramal do Gama e a raiz tem que ficar identicos, e
-- so o numero de linhas cai. E uma operacao de forma, nao de valor, e a checagem
-- diz isso.

-- ============================ BLOCO 1 ============================
do $bloco1$
declare
  MANUT uuid := 'fbd2556a-3e96-474b-818f-ff536a288dff';
  CS1 uuid := 'e2a026bd-a760-49e6-a061-eb50a091a815';
  ALVO text[] := array['LAN-2026-2946','LAN-2026-0793','LAN-2026-4307'];
  v_lin_a int; v_lin_d int; v_div int; v_sobra int;
  v_raiz_a numeric; v_raiz_d numeric; v_sub_a numeric; v_sub_d numeric;
  v_cs_a numeric; v_cs_d numeric; v_tipo_a jsonb; v_tipo_d jsonb;
begin
  select count(*) into v_lin_a from public.lancamento_rateios;
  select jsonb_object_agg(tipo,total) into v_tipo_a
  from (select tipo, sum(total) as total from public.fn_rel_dre('2020-01-01','2030-12-31') group by tipo) t;
  select coalesce(sum(r.valor),0) into v_raiz_a from public.lancamento_rateios r
  join public.lancamentos l on l.id=r.lancamento_id and l.status<>'cancelado' where r.centro_custo_id=MANUT;
  select coalesce(sum(r.valor),0) into v_cs_a from public.lancamento_rateios r
  join public.lancamentos l on l.id=r.lancamento_id and l.status<>'cancelado' where r.centro_custo_id=CS1;
  select coalesce(sum(r.valor),0) into v_sub_a from public.lancamento_rateios r
  join public.lancamentos l on l.id=r.lancamento_id and l.status<>'cancelado'
  join public.centros_custo c on c.id=r.centro_custo_id where c.id=MANUT or c.pai_id=MANUT;

  -- UM statement. Os CTEs veem o MESMO instantaneo e tocam linhas diferentes:
  -- quem nao tem CS-01 troca o centro; quem tem, soma na fatia que existe e a
  -- linha da raiz e apagada.
  with alvo as (
    select r.id as rid, r.lancamento_id as lanc, r.valor
    from public.lancamento_rateios r
    join public.lancamentos l on l.id = r.lancamento_id
    where l.numero = any(ALVO) and r.centro_custo_id = MANUT
  ), tem_cs as (
    select distinct a.lanc from alvo a
    join public.lancamento_rateios r on r.lancamento_id = a.lanc and r.centro_custo_id = CS1
  ), movidos as (
    update public.lancamento_rateios r set centro_custo_id = CS1
    from alvo a
    where r.id = a.rid and a.lanc not in (select lanc from tem_cs)
    returning r.id
  ), somados as (
    update public.lancamento_rateios r set valor = r.valor + a.valor
    from alvo a
    where r.lancamento_id = a.lanc and r.centro_custo_id = CS1
    returning r.id
  )
  delete from public.lancamento_rateios r using alvo a
  where r.id = a.rid and a.lanc in (select lanc from tem_cs);

  select count(*) into v_lin_d from public.lancamento_rateios;
  select jsonb_object_agg(tipo,total) into v_tipo_d
  from (select tipo, sum(total) as total from public.fn_rel_dre('2020-01-01','2030-12-31') group by tipo) t;
  select coalesce(sum(r.valor),0) into v_raiz_d from public.lancamento_rateios r
  join public.lancamentos l on l.id=r.lancamento_id and l.status<>'cancelado' where r.centro_custo_id=MANUT;
  select coalesce(sum(r.valor),0) into v_cs_d from public.lancamento_rateios r
  join public.lancamentos l on l.id=r.lancamento_id and l.status<>'cancelado' where r.centro_custo_id=CS1;
  select coalesce(sum(r.valor),0) into v_sub_d from public.lancamento_rateios r
  join public.lancamentos l on l.id=r.lancamento_id and l.status<>'cancelado'
  join public.centros_custo c on c.id=r.centro_custo_id where c.id=MANUT or c.pai_id=MANUT;
  select count(*) into v_div from (select l.id from public.lancamentos l
    join public.lancamento_rateios r on r.lancamento_id=l.id where l.status<>'cancelado'
    group by l.id,l.valor having round(sum(r.valor),2)<>round(l.valor,2)) t;
  select count(*) into v_sobra from public.lancamento_rateios r
  join public.lancamentos l on l.id=r.lancamento_id
  where l.numero = any(ALVO) and r.centro_custo_id = MANUT;

  if v_lin_d - v_lin_a <> -1 then raise exception 'as linhas variaram % em vez de -1.', v_lin_d-v_lin_a; end if;
  if v_sobra > 0 then raise exception '% fatia(s) ficaram na raiz.', v_sobra; end if;
  if v_div > 0 then raise exception '% lancamento(s) com rateio fora do valor.', v_div; end if;
  if v_tipo_a <> v_tipo_d then raise exception 'DRE por tipo mudou.'; end if;
  -- o CS-01 fica DENTRO da Manutencao: a subarvore nao pode mexer
  if round(v_sub_d - v_sub_a, 2) <> 0 then
    raise exception 'a subarvore mexeu R$ %, e nao devia.', v_sub_d-v_sub_a; end if;
  if round(v_cs_d - v_cs_a, 2) <> 480.00 then
    raise exception 'o CS-01 subiu R$ % em vez de 480,00.', v_cs_d-v_cs_a; end if;
  if round(v_raiz_a - v_raiz_d, 2) <> 480.00 then
    raise exception 'a raiz caiu R$ % em vez de 480,00.', v_raiz_a-v_raiz_d; end if;

  raise notice 'Bloco 1 OK. Raiz R$ % -> R$ %. CS-01 R$ % -> R$ %.', v_raiz_a, v_raiz_d, v_cs_a, v_cs_d;
end $bloco1$;

-- ============================ BLOCO 2 ============================
do $bloco2$
declare
  ALVO text[] := array['LAN-2026-4570','LAN-2026-0490','LAN-2026-3137'];
  v_lin_a int; v_lin_d int; v_div int; v_dobrado int;
  v_007_a numeric; v_007_d numeric; v_003_a numeric; v_003_d numeric;
  v_raiz_a numeric; v_raiz_d numeric; v_tipo_a jsonb; v_tipo_d jsonb;
begin
  select count(*) into v_lin_a from public.lancamento_rateios;
  select jsonb_object_agg(tipo,total) into v_tipo_a
  from (select tipo, sum(total) as total from public.fn_rel_dre('2020-01-01','2030-12-31') group by tipo) t;
  select coalesce(sum(r.valor),0) into v_007_a from public.lancamento_rateios r
  join public.centros_custo c on c.id=r.centro_custo_id where c.nome='007 - AC 405 - Lote 2';
  select coalesce(sum(r.valor),0) into v_003_a from public.lancamento_rateios r
  join public.centros_custo c on c.id=r.centro_custo_id where c.nome='003 - Recuperação do Ramal do Gama';
  select coalesce(sum(r.valor),0) into v_raiz_a from public.lancamento_rateios r
  where r.centro_custo_id='fbd2556a-3e96-474b-818f-ff536a288dff';

  -- funde as linhas irmas: a que fica recebe a soma, as outras somem.
  with dup as (
    select r.id, r.lancamento_id, r.centro_custo_id,
           row_number() over (partition by r.lancamento_id, r.centro_custo_id
                              order by r.valor desc, r.id) as rn,
           sum(r.valor) over (partition by r.lancamento_id, r.centro_custo_id) as total,
           count(*) over (partition by r.lancamento_id, r.centro_custo_id) as n
    from public.lancamento_rateios r
    join public.lancamentos l on l.id = r.lancamento_id
    where l.numero = any(ALVO)
  ), upd as (
    update public.lancamento_rateios r set valor = d.total
    from dup d where r.id = d.id and d.rn = 1 and d.n > 1
    returning r.id
  )
  delete from public.lancamento_rateios r
  using dup d where r.id = d.id and d.rn > 1 and d.n > 1;

  select count(*) into v_lin_d from public.lancamento_rateios;
  select jsonb_object_agg(tipo,total) into v_tipo_d
  from (select tipo, sum(total) as total from public.fn_rel_dre('2020-01-01','2030-12-31') group by tipo) t;
  select coalesce(sum(r.valor),0) into v_007_d from public.lancamento_rateios r
  join public.centros_custo c on c.id=r.centro_custo_id where c.nome='007 - AC 405 - Lote 2';
  select coalesce(sum(r.valor),0) into v_003_d from public.lancamento_rateios r
  join public.centros_custo c on c.id=r.centro_custo_id where c.nome='003 - Recuperação do Ramal do Gama';
  select coalesce(sum(r.valor),0) into v_raiz_d from public.lancamento_rateios r
  where r.centro_custo_id='fbd2556a-3e96-474b-818f-ff536a288dff';
  select count(*) into v_div from (select l.id from public.lancamentos l
    join public.lancamento_rateios r on r.lancamento_id=l.id where l.status<>'cancelado'
    group by l.id,l.valor having round(sum(r.valor),2)<>round(l.valor,2)) t;
  select count(*) into v_dobrado from (
    select r.lancamento_id, r.centro_custo_id from public.lancamento_rateios r
    join public.lancamentos l on l.id=r.lancamento_id where l.numero = any(ALVO)
    group by 1,2 having count(*) > 1) t;

  if v_lin_d - v_lin_a <> -3 then raise exception 'as linhas variaram % em vez de -3.', v_lin_d-v_lin_a; end if;
  if v_dobrado > 0 then raise exception 'sobraram % pares com linha dobrada.', v_dobrado; end if;
  if v_div > 0 then raise exception '% lancamento(s) com rateio fora do valor.', v_div; end if;
  if v_tipo_a <> v_tipo_d then raise exception 'DRE por tipo mudou.'; end if;
  -- fundir nao pode mexer em UM centavo de centro nenhum
  if round(v_007_d - v_007_a, 2) <> 0 then raise exception 'o AC 405 mexeu R$ %.', v_007_d-v_007_a; end if;
  if round(v_003_d - v_003_a, 2) <> 0 then raise exception 'o Ramal do Gama mexeu R$ %.', v_003_d-v_003_a; end if;
  if round(v_raiz_d - v_raiz_a, 2) <> 0 then raise exception 'a raiz mexeu R$ %.', v_raiz_d-v_raiz_a; end if;

  raise notice 'Bloco 2 OK. Tres pares fundidos, 3 linhas a menos, nenhum centavo mudou de centro.';
end $bloco2$;
