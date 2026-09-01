-- Parte 2 das respostas: os 6 que ele mandou "aplicar o rateio do MC".
--
-- Aplicado em 01/09/2026, depois da parte 1.
--
--   raiz da Manutencao:      R$ 16.072,44 -> R$ 12.260,39
--   subarvore da Manutencao: cai R$ 766,53
--   linhas de rateio:        +31
--
-- ## Por que esta parte e diferente das outras cargas todas
--
-- Nas outras eu movia a FATIA da raiz. Aqui o rateio do MC reescreve o
-- lancamento INTEIRO: o 2361, por exemplo, tem hoje 009 R$ 11.889,67 + 003
-- R$ 2.377,93 + raiz R$ 732,40, e o MC diz que sao 009 R$ 12.500 + 003 R$ 2.500.
-- As duas fatias que ja estavam fora tambem estao erradas.
--
-- Entao aqui eu APAGO todos os rateios dos 6 e escrevo os novos. Isso tem dois
-- perigos que as outras cargas nao tinham, e cada um ganhou uma checagem:
--
--   1. **perder a categoria e o autor.** O rateio carrega `categoria_id`, que e
--      a segunda dimensao do custo, e `created_by`. Apagar e reinserir perde os
--      dois se eu nao guardar antes. Guardo numa temp `orig` e PROVO que cada
--      lancamento tem um so de cada (`count(distinct) = 1`); se algum tivesse
--      duas categorias no rateio, agregar destruiria informacao e a carga aborta
--      em vez de escolher uma.
--   2. **a trigger da soma.** `trg_valida_soma_do_rateio` dispara AFTER ROW. Um
--      DELETE seguido de um INSERT separado abortaria no fim do DELETE, com o
--      lancamento somando zero. Por isso o delete e o insert vivem no MESMO
--      statement, num CTE que modifica dados.
--
-- ## O que o MC diz, e o que eu nao consegui aplicar
--
--   2946  R$ 1.725,00  13 fatias. Duas apontam para "501 e 502 Motor
--         Campactador de Solo", que nao existem no cadastro do ERP: R$ 420
--         ficam na raiz.
--   5125  R$ 1.160,00  11 fatias, tres saindo da manutencao (Colorado R$ 40,
--         Casa James R$ 30, escola 011 R$ 25, obra 009 R$ 20).
--   2361  R$ 15.000,00 reescreve as tres fatias para 009 R$ 12.500 + 003
--         R$ 2.500.
--   4307  R$   545,00  9 fatias. "Carga Semi-Reboque/Prancha - 104" nao existe:
--         R$ 20 ficam na raiz.
--   1486  R$   385,00  Colorado R$ 319,48 + Pipa MZO-4486 R$ 65,52. O ERP tinha
--         R$ 296,32 na raiz e R$ 88,68 na Colorado -- errado nos dois lados.
--   0793  R$   295,00  7 fatias. "Skidy" nao existe: R$ 40 ficam na raiz.
--
-- Os R$ 480 sem destino ficam na raiz de proposito. Escolher uma maquina por
-- conta propria seria inventar, e a fatia visivel na raiz e o que faz a pergunta
-- continuar existindo.
--
-- ## As etapas de obra do MC viraram o centro da obra
--
-- O MC poe fatias em "Casa James > Outros", "011 > ADMINISTRACAO LOCAL" e
-- "009 > Despesas Diversas". Essas etapas de servico de obra podem nao existir
-- no ERP com esse nome, e inventar o mapeamento seria pior que a granularidade
-- que se perde. Foram para o centro raiz da obra, que e a mesma granularidade
-- que o ERP ja usava no 2361.
--
-- ## Destino resolvido por NOME
--
-- Como na parte 1: o par (pai, nome) resolve o uuid, com checagem de nome
-- inexistente e de nome ambiguo. "Rolo Chapa CB10 - 01" existe na Manutencao E
-- em Aquisicao de Equipamentos, entao o pai nao e opcional.
--
-- ## Ensaio
--
-- Rodei este bloco inteiro com `raise exception` no fim antes de valer. Passou
-- as sete checagens e devolveu "raiz R$ 16.072,44 -> R$ 12.260,39, 31 linhas de
-- rateio a mais".

do $aplica$
declare
  MANUT uuid := 'fbd2556a-3e96-474b-818f-ff536a288dff';
  ALVO text[] := array['LAN-2026-2946','LAN-2026-5125','LAN-2026-2361','LAN-2026-4307','LAN-2026-1486','LAN-2026-0793'];
  v_txt text; v_n int;
  v_lin_a int; v_lin_d int; v_div int; v_orfa int;
  v_raiz_a numeric; v_raiz_d numeric; v_sub_a numeric; v_sub_d numeric;
  v_tipo_a jsonb; v_tipo_d jsonb;
begin
  create temp table p2(num text, pai text, nome text, valor numeric) on commit drop;
  insert into p2(num, pai, nome, valor) values
  ('2946','Manutenção/Documentação de Equipamentos','Escavadeira 320C - 02',320.00),
  ('2946','Manutenção/Documentação de Equipamentos','Escavadeira 320C - 03',220.00),
  ('2946',NULL,'Manutenção/Documentação de Equipamentos',420.00),
  ('2946','Manutenção/Documentação de Equipamentos','Escavadeira 320C - 01',155.00),
  ('2946','Manutenção/Documentação de Equipamentos','Pá Carregadeira 924K - 01',155.00),
  ('2946','Manutenção/Documentação de Equipamentos','Manipulador Telescópio 540-170 - 01',100.00),
  ('2946','Manutenção/Documentação de Equipamentos','Caminhão Pipa 2626 NCP-4846 - 01',85.00),
  ('2946','Manutenção/Documentação de Equipamentos','Caminhão Caçamba 2425/48 NAB-4619 - 06',80.00),
  ('2946','Manutenção/Documentação de Equipamentos','Pá Carregadeira W20 - 02',70.00),
  ('2946','Manutenção/Documentação de Equipamentos','Caminhão Caçamba 2423 K/36 MZO-5897 - 01',50.00),
  ('2946','001 - Carretas EMT','Caminhão Cavalo XF 530 FTT SQS7E01 - 02',45.00),
  ('2946','Manutenção/Documentação de Equipamentos','Caminhão Caçamba 2423 K/36 MZO-8F87 - 03',25.00),
  ('5125','Manutenção/Documentação de Equipamentos','Pá Carregadeira 924K - 01',680.00),
  ('5125','Manutenção/Documentação de Equipamentos','Caminhão Munck L 1620 MZO-4396 - 01',140.00),
  ('5125','Manutenção/Documentação de Equipamentos','Caminhão Cavalo 2644 S/33 MZO-2987 - 01',60.00),
  ('5125','Manutenção/Documentação de Equipamentos','Caminhão Caçamba 2423 K/36 MZO-5897 - 01',60.00),
  ('5125',NULL,'002 - Equipamentos Colorado 2026',40.00),
  ('5125','Manutenção/Documentação de Equipamentos','Trator de Esteira D6NXL - 01',40.00),
  ('5125','Manutenção/Documentação de Equipamentos','Caminhão Caçamba 2423 K/36 MZO-8547 - 02',40.00),
  ('5125',NULL,'Casa James',30.00),
  ('5125',NULL,'011 - CONSTRUÇÃO DE ESCOLA EM TEMPO INTEGRAL MARECHAL THAUMATURGO',25.00),
  ('5125','Manutenção/Documentação de Equipamentos','Caminhão Caçamba 2423 K/36 MZO-8F87 - 03',25.00),
  ('5125',NULL,'009 - Manutenção da Rodovia BR-364/AC - Lote 09 & 10',20.00),
  ('2361',NULL,'009 - Manutenção da Rodovia BR-364/AC - Lote 09 & 10',12500.00),
  ('2361',NULL,'003 - Recuperação do Ramal do Gama',2500.00),
  ('4307','Manutenção/Documentação de Equipamentos','Caminhão Munck L 1620 MZO-4396 - 01',290.00),
  ('4307','Manutenção/Documentação de Equipamentos','Retroescavadeira 416E - 01',60.00),
  ('4307','Manutenção/Documentação de Equipamentos','Caminhão Caçamba 2423 K/36 MZO-8547 - 02',45.00),
  ('4307',NULL,'009 - Manutenção da Rodovia BR-364/AC - Lote 09 & 10',35.00),
  ('4307',NULL,'002 - Equipamentos Colorado 2026',30.00),
  ('4307','Manutenção/Documentação de Equipamentos','Caminhão Pipa 2626 NCP-4846 - 01',25.00),
  ('4307','Manutenção/Documentação de Equipamentos','Caminhão Caçamba 2425/48 NAB-4619 - 06',20.00),
  ('4307','Manutenção/Documentação de Equipamentos','Bobcat MC110C - 01',20.00),
  ('4307',NULL,'Manutenção/Documentação de Equipamentos',20.00),
  ('1486',NULL,'002 - Equipamentos Colorado 2026',319.48),
  ('1486','Manutenção/Documentação de Equipamentos','Caminhão Pipa L1318/50 MZO-4486 - 02',65.52),
  ('0793','Manutenção/Documentação de Equipamentos','Caminhão Munck L 1620 MZO-4396 - 01',70.00),
  ('0793','Manutenção/Documentação de Equipamentos','Caminhão Caçamba 2423 K/36 MZO-8F87 - 03',55.00),
  ('0793','Manutenção/Documentação de Equipamentos','Pá Carregadeira 924K - 01',40.00),
  ('0793',NULL,'Manutenção/Documentação de Equipamentos',40.00),
  ('0793',NULL,'009 - Manutenção da Rodovia BR-364/AC - Lote 09 & 10',40.00),
  ('0793','Manutenção/Documentação de Equipamentos','Escavadeira 320C - 01',25.00),
  ('0793','Manutenção/Documentação de Equipamentos','Caminhão Cavalo 2644 S/33 MZO-2987 - 01',25.00);

  create temp table d2 on commit drop as
  select p.num, p.pai, p.nome, p.valor, c.id as centro
  from p2 p
  left join public.centros_custo c
    on c.nome = p.nome
   and ( (p.pai is null and c.pai_id is null)
      or (p.pai is not null and c.pai_id = (select id from public.centros_custo
                                             where nome = p.pai and pai_id is null)) );

  select string_agg(distinct coalesce(pai,'(raiz)') || ' > ' || nome, ' ; ') into v_txt
  from d2 where centro is null;
  if v_txt is not null then raise exception 'destino que nao existe: %', v_txt; end if;
  if (select count(*) from d2) <> (select count(*) from p2) then
    raise exception 'algum nome casou com mais de um centro.'; end if;

  select string_agg(x.num || ' (' || x.s || ' vs ' || l.valor || ')', '; ') into v_txt
  from (select num, sum(valor) as s from d2 group by num) x
  join public.lancamentos l on l.numero = 'LAN-2026-' || x.num
  where round(x.s,2) <> round(l.valor,2);
  if v_txt is not null then raise exception 'o rateio novo nao fecha com o valor em: %', v_txt; end if;

  -- guardo categoria e autor antes de apagar, e PROVO que ha um so de cada
  create temp table orig on commit drop as
  select r.lancamento_id,
         (array_agg(distinct r.categoria_id))[1] as categoria_id,
         (array_agg(distinct r.created_by))[1] as created_by,
         count(distinct r.categoria_id) as nc, count(distinct r.created_by) as na
  from public.lancamento_rateios r
  join public.lancamentos l on l.id = r.lancamento_id
  where l.numero = any(ALVO) group by r.lancamento_id;
  select count(*) into v_n from orig where nc > 1 or na > 1;
  if v_n > 0 then raise exception '% lancamento(s) tem mais de uma categoria ou autor no rateio.', v_n; end if;
  if (select count(*) from orig) <> 6 then
    raise exception 'achei % lancamentos em vez de 6.', (select count(*) from orig); end if;

  select count(*) into v_lin_a from public.lancamento_rateios;
  select jsonb_object_agg(tipo,total) into v_tipo_a
  from (select tipo, sum(total) as total from public.fn_rel_dre('2020-01-01','2030-12-31') group by tipo) t;
  select coalesce(sum(r.valor),0) into v_raiz_a from public.lancamento_rateios r
  join public.lancamentos l on l.id=r.lancamento_id and l.status<>'cancelado' where r.centro_custo_id=MANUT;
  select coalesce(sum(r.valor),0) into v_sub_a from public.lancamento_rateios r
  join public.lancamentos l on l.id=r.lancamento_id and l.status<>'cancelado'
  join public.centros_custo c on c.id=r.centro_custo_id where c.id=MANUT or c.pai_id=MANUT;

  -- UM statement: apaga o rateio velho e escreve o novo junto, senao a trigger
  -- da soma aborta no fim do delete com o lancamento somando zero.
  with del as (
    delete from public.lancamento_rateios r
    using public.lancamentos l
    where l.id = r.lancamento_id and l.numero = any(ALVO)
    returning r.lancamento_id
  ), quantos as (select count(*) as n from del)
  insert into public.lancamento_rateios (lancamento_id, centro_custo_id, valor, categoria_id, created_by)
  select o.lancamento_id, d.centro, d.valor, o.categoria_id, o.created_by
  from orig o
  join public.lancamentos l on l.id = o.lancamento_id
  join d2 d on d.num = replace(l.numero, 'LAN-2026-', '')
  cross join quantos;

  select count(*) into v_lin_d from public.lancamento_rateios;
  select jsonb_object_agg(tipo,total) into v_tipo_d
  from (select tipo, sum(total) as total from public.fn_rel_dre('2020-01-01','2030-12-31') group by tipo) t;
  select coalesce(sum(r.valor),0) into v_raiz_d from public.lancamento_rateios r
  join public.lancamentos l on l.id=r.lancamento_id and l.status<>'cancelado' where r.centro_custo_id=MANUT;
  select coalesce(sum(r.valor),0) into v_sub_d from public.lancamento_rateios r
  join public.lancamentos l on l.id=r.lancamento_id and l.status<>'cancelado'
  join public.centros_custo c on c.id=r.centro_custo_id where c.id=MANUT or c.pai_id=MANUT;
  select count(*) into v_div from (select l.id from public.lancamentos l
    join public.lancamento_rateios r on r.lancamento_id=l.id where l.status<>'cancelado'
    group by l.id,l.valor having round(sum(r.valor),2)<>round(l.valor,2)) t;
  select count(*) into v_orfa from public.lancamento_rateios r
  where r.categoria_id is null and r.created_at > now() - interval '2 minutes';

  if v_lin_d - v_lin_a <> 31 then raise exception 'o numero de rateios variou % em vez de 31.', v_lin_d-v_lin_a; end if;
  if v_orfa > 0 then raise exception '% fatia(s) nasceram sem categoria.', v_orfa; end if;
  if v_div > 0 then raise exception '% lancamento(s) com rateio fora do valor.', v_div; end if;
  if v_tipo_a <> v_tipo_d then raise exception 'DRE por tipo mudou.'; end if;
  if round(v_raiz_a - v_raiz_d, 2) <> 3812.05 then
    raise exception 'a raiz caiu R$ % em vez de 3812.05.', v_raiz_a-v_raiz_d; end if;
  if round(v_sub_a - v_sub_d, 2) <> 766.53 then
    raise exception 'a subarvore caiu R$ % em vez de 766.53.', v_sub_a-v_sub_d; end if;

  raise notice 'OK. Raiz R$ % -> R$ %. % linhas de rateio a mais.',
    v_raiz_a, v_raiz_d, v_lin_d-v_lin_a;
end $aplica$;
