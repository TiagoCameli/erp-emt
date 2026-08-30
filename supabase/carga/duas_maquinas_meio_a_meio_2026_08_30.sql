-- Descricao que cita DUAS maquinas divide meio a meio entre os dois centros.
--
-- Aplicado no banco em 30/08/2026, depois de
-- `vibro_leeboy_af5500_para_colorado_2026_08_30.sql`.
--
-- ## A regra, dita pelo Tiago
--
-- "quando tiver duas maquinas na descricao divida meio a meio entre os cc ou
-- etapa. rolo chapa dynapac tambem e da colorado, ja a 416e e uma das nossas
-- retroescavadeiras."
--
-- Ate aqui, lancamento que citava mais de uma maquina era RECUSADO pelos lotes
-- automaticos e ficava na raiz. Isso protegia contra mandar dinheiro da EMT para
-- a maquina errada, mas nao resolvia: eram 22 lancamentos parados so por isso.
--
-- ## Por que a divisao tem que caber num statement so
--
-- `trg_valida_soma_do_rateio` dispara AFTER ROW e exige que a soma dos rateios
-- seja igual ao valor do lancamento. Dividir uma linha em duas por dois
-- statements (UPDATE e depois INSERT) quebra a soma no meio do caminho e a
-- trigger aborta -- em qualquer ordem que se tente.
--
-- A saida e um CTE que ATUALIZA e INSERE dentro do MESMO statement: os gatilhos
-- AFTER ROW entram na fila e disparam no fim dele, quando a soma ja fechou.
--
-- ## A segunda metade e o RESTO, nunca um segundo arredondamento
--
-- `round(220.49/2, 2)` da 110,25. Dois arredondamentos dariam 110,25 + 110,25 =
-- 220,50, um centavo do nada. A primeira metade arredonda e a segunda e
-- `valor - primeira`, entao as duas sempre somam o original. Conferido em
-- LAN-2026-5392: virou 110,25 + 110,24.
--
-- ## O INSERT carrega categoria_id e created_by
--
-- Recriar linha sem `categoria_id` joga a metade nova em outra linha do DRE. Foi
-- assim que R$ 133.160,00 mudaram de gaveta em 28/08 sem nenhuma soma acusar. A
-- linha de controle "metade sem categoria" existe por causa daquele dia.
--
-- ## Parte 1: os dois que o Tiago decidiu na mao
--
--   LAN-2026-1293  R$ 250,00  "MECANICO NA VIBROACABADORA 8816B / ROLO CHAPA
--                  DYNAPAC COLORADO"
--                  As DUAS maquinas sao da Colorado -- a palavra esta na propria
--                  descricao. Dividir daria duas linhas no mesmo centro, entao
--                  foi inteiro, sem dividir.
--
--   LAN-2026-3501  R$ 1.000,00  "CATERPILLAR 416E / VIBROACABADORA LEEBOY 8816B"
--                  R$ 500,00 para a Colorado (a Leeboy) e R$ 500,00 que FICAM na
--                  raiz da Manutencao: a 416E e da EMT, mas existem DUAS
--                  retroescavadeiras 416E e a descricao nao diz qual. A metade
--                  espera na raiz junto com o bloco das retros.
--
-- ## Parte 2: os nove que a regra resolve sozinha
--
-- Placa contra placa, meio a meio. Nenhum sai da Manutencao: o dinheiro so acha
-- a maquina. Por isso a linha de controle mais forte aqui e "a subarvore da
-- Manutencao nao mudou um centavo".
--
-- ## Os tres que a leitura barrou, e que a contagem teria deixado passar
--
--   LAN-2026-5860  R$    4,00  "PARAFUSO CB 108 CAMINHAO CACAMBA MZO 8F87"
--                  O token CB10 casou dentro de "CB 108", que e o nome da PECA,
--                  nao do Rolo Chapa CB10. Ha uma maquina so aqui.
--   LAN-2026-4849  R$ 1.834,00 "MZO 5897 / MZO 8F87 E ROLO PE DE CARNEIRO"
--   LAN-2026-3215  R$   163,50 "NAB 4619, MZO 5897 E ROLO DE CARNEIRO 01 E 02"
--                  Os dois citam TRES ou mais maquinas: o rolo aparece sem
--                  modelo, entao o token nao o viu e a divisao meio a meio poria
--                  a parte dele nas cacambas.
--
-- ## Ainda na fila do Tiago
--
-- Dez lancamentos citam TRES maquinas (R$ 26.520,38), quase todos os pneus da
-- Fox: "8 PNEUS MZO5897 - 8 PNEUS MZO8547 - 4 PNEUS...". A regra fala de duas, e
-- ali o proprio texto da a quantidade por caminhao -- ratear por pneu e mais
-- exato que um terco para cada.
--
-- ## Resultado
--
--   raiz da Manutencao:  R$ 1.122.407,47 -> R$ 1.112.943,42  (803 -> 793 lanc.)
--   Colorado:            R$   252.611,32 -> R$   253.361,32
--   subarvore da Manutencao na parte 2: inalterada, como tem que ser
--   rateio fora do valor do lancamento: 0

-- ---------------------------------------------------------------------------
-- Parte 1
-- ---------------------------------------------------------------------------
do $parte1$
declare
  MANUT    uuid := 'fbd2556a-3e96-474b-818f-ff536a288dff';
  COLORADO uuid := '891f3c63-f7e5-49fb-a97c-9c99deeadc2b';
  R_3501   uuid := 'ac572b11-5931-4d06-b054-1ab5434d6d9c';
  R_1293   uuid := 'f1350518-ea07-4a0a-94d6-f5f4d2643bf3';
  v_cat_orig uuid; v_col_a numeric; v_col_d numeric;
  v_raiz_a numeric; v_raiz_d numeric; v_lin_a int; v_lin_d int;
  v_tipo_a jsonb; v_tipo_d jsonb; v_div int; v_cats int; v_metades numeric;
begin
  select categoria_id into v_cat_orig from public.lancamento_rateios where id = R_3501;
  select count(*) into v_lin_a from public.lancamento_rateios;
  select jsonb_object_agg(tipo,total) into v_tipo_a
  from (select tipo, sum(total) as total from public.fn_rel_dre('2020-01-01','2030-12-31') group by tipo) t;
  select coalesce(sum(r.valor),0) into v_col_a from public.lancamento_rateios r
  join public.lancamentos l on l.id=r.lancamento_id and l.status<>'cancelado' where r.centro_custo_id=COLORADO;
  select coalesce(sum(r.valor),0) into v_raiz_a from public.lancamento_rateios r
  join public.lancamentos l on l.id=r.lancamento_id and l.status<>'cancelado' where r.centro_custo_id=MANUT;

  update public.lancamento_rateios set centro_custo_id = COLORADO where id = R_1293;

  with metade as (
    update public.lancamento_rateios set valor = 500.00 where id = R_3501
    returning lancamento_id, categoria_id, created_by
  )
  insert into public.lancamento_rateios (lancamento_id, centro_custo_id, valor, categoria_id, created_by)
  select lancamento_id, COLORADO, 500.00, categoria_id, created_by from metade;

  select count(*) into v_lin_d from public.lancamento_rateios;
  select jsonb_object_agg(tipo,total) into v_tipo_d
  from (select tipo, sum(total) as total from public.fn_rel_dre('2020-01-01','2030-12-31') group by tipo) t;
  select coalesce(sum(r.valor),0) into v_col_d from public.lancamento_rateios r
  join public.lancamentos l on l.id=r.lancamento_id and l.status<>'cancelado' where r.centro_custo_id=COLORADO;
  select coalesce(sum(r.valor),0) into v_raiz_d from public.lancamento_rateios r
  join public.lancamentos l on l.id=r.lancamento_id and l.status<>'cancelado' where r.centro_custo_id=MANUT;
  select count(*) into v_div from (select l.id from public.lancamentos l
    join public.lancamento_rateios r on r.lancamento_id=l.id where l.status<>'cancelado'
    group by l.id,l.valor having round(sum(r.valor),2)<>round(l.valor,2)) t;
  select count(distinct coalesce(categoria_id::text,'sem')), sum(valor) into v_cats, v_metades
  from public.lancamento_rateios r
  where r.lancamento_id = (select lancamento_id from public.lancamento_rateios where id=R_3501);

  if v_lin_d - v_lin_a <> 1 then raise exception 'Nasceram % linhas em vez de 1.', v_lin_d-v_lin_a; end if;
  if v_cats <> 1 then raise exception 'As metades ficaram com % categorias.', v_cats; end if;
  if (select categoria_id from public.lancamento_rateios where id=R_3501) is distinct from v_cat_orig
    then raise exception 'A metade que ficou perdeu a categoria.'; end if;
  if round(v_metades,2) <> 1000.00 then raise exception 'As metades somam R$ %.', v_metades; end if;
  if v_tipo_a <> v_tipo_d then raise exception 'DRE por tipo mudou.'; end if;
  if v_div > 0 then raise exception '% lancamento(s) com rateio fora do valor.', v_div; end if;
  if round(v_col_d-v_col_a,2) <> 750.00 then raise exception 'Colorado subiu R$ %.', v_col_d-v_col_a; end if;
  if round(v_raiz_a-v_raiz_d,2) <> 750.00 then raise exception 'Raiz caiu R$ %.', v_raiz_a-v_raiz_d; end if;

  raise notice 'Parte 1 OK. Colorado R$ % -> R$ %.', v_col_a, v_col_d;
end $parte1$;

-- ---------------------------------------------------------------------------
-- Parte 2
-- ---------------------------------------------------------------------------
do $parte2$
declare
  MANUT uuid := 'fbd2556a-3e96-474b-818f-ff536a288dff';
  CARRETAS uuid := 'a39e45c0-aea5-4d98-aebd-814616b8551c';
  -- A lista e explicita, e nao "todo mundo com duas maquinas": dos 12 que a
  -- contagem achava, tres estavam errados (ver o cabecalho). Revisar match por
  -- match antes de aplicar nao e zelo, e o que separa 9 de 12.
  NOVE text[] := array['LAN-2026-2579','LAN-2026-1237','LAN-2026-5150','LAN-2026-0948',
                       'LAN-2026-5392','LAN-2026-4220','LAN-2026-1244','LAN-2026-2283','LAN-2026-5669'];
  v_raiz_a numeric; v_raiz_d numeric; v_sub_a numeric; v_sub_d numeric;
  v_lin_a int; v_lin_d int; v_tipo_a jsonb; v_tipo_d jsonb; v_div int; v_ins int; v_orfa int;
begin
  select count(*) into v_lin_a from public.lancamento_rateios;
  select jsonb_object_agg(tipo,total) into v_tipo_a
  from (select tipo, sum(total) as total from public.fn_rel_dre('2020-01-01','2030-12-31') group by tipo) t;
  select coalesce(sum(r.valor),0) into v_raiz_a from public.lancamento_rateios r
  join public.lancamentos l on l.id=r.lancamento_id and l.status<>'cancelado' where r.centro_custo_id=MANUT;
  select coalesce(sum(r.valor),0) into v_sub_a from public.lancamento_rateios r
  join public.lancamentos l on l.id=r.lancamento_id and l.status<>'cancelado'
  join public.centros_custo c on c.id=r.centro_custo_id where c.id=MANUT or c.pai_id=MANUT;

  with tk as (
    select c.id, upper(regexp_replace(t.tok,'[^A-Za-z0-9]','','g')) as token
    from public.centros_custo c
    cross join lateral unnest(string_to_array(c.nome,' ')) as t(tok)
    where c.pai_id in (MANUT, CARRETAS)
  ),
  distintos as (
    select token, (array_agg(distinct id))[1] as etapa_id
    from tk where length(token)>=4 and token ~ '[0-9]' and token ~ '[A-Z]'
      -- os dois falsos positivos provados em 28/08
      and token not in ('L1620','L131850')
    group by token having count(distinct id)=1
  ),
  alvo as (
    select r.id as rateio_id, r.lancamento_id, r.valor, r.categoria_id, r.created_by,
           upper(regexp_replace(l.descricao,'[^A-Za-z0-9]','','g')) as texto
    from public.lancamento_rateios r
    join public.lancamentos l on l.id=r.lancamento_id and l.status<>'cancelado'
    where r.centro_custo_id = MANUT and l.numero = any(NOVE)
  ),
  casou as (
    select a.*, d.etapa_id from alvo a join distintos d on a.texto like '%'||d.token||'%'
  ),
  par as (
    select rateio_id, lancamento_id, valor, categoria_id, created_by,
           (array_agg(distinct etapa_id))[1] as etapa_a,
           (array_agg(distinct etapa_id))[2] as etapa_b
    from casou
    group by rateio_id, lancamento_id, valor, categoria_id, created_by
    having count(distinct etapa_id) = 2
  ),
  atualiza as (
    update public.lancamento_rateios r
    set centro_custo_id = p.etapa_a, valor = round(p.valor/2, 2)
    from par p where r.id = p.rateio_id
    returning p.lancamento_id, p.etapa_b, p.valor - round(p.valor/2,2) as resto,
              p.categoria_id, p.created_by
  )
  insert into public.lancamento_rateios (lancamento_id, centro_custo_id, valor, categoria_id, created_by)
  select lancamento_id, etapa_b, resto, categoria_id, created_by from atualiza;
  get diagnostics v_ins = row_count;

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
  join public.lancamentos l on l.id=r.lancamento_id
  where l.numero = any(NOVE) and r.categoria_id is null;

  if v_ins <> 9 then raise exception 'Inseriu % metades em vez de 9.', v_ins; end if;
  if v_lin_d - v_lin_a <> 9 then raise exception 'Nasceram % linhas em vez de 9.', v_lin_d-v_lin_a; end if;
  if v_orfa > 0 then raise exception '% metade(s) nasceram sem categoria.', v_orfa; end if;
  if v_div > 0 then raise exception '% lancamento(s) com rateio fora do valor.', v_div; end if;
  if v_tipo_a <> v_tipo_d then raise exception 'DRE por tipo mudou.'; end if;
  -- A prova forte da parte 2: nada saiu da Manutencao, so achou a maquina.
  if round(v_sub_a - v_sub_d, 2) <> 0 then
    raise exception 'A subarvore mudou R$ %. Vazou dinheiro para fora.', v_sub_a-v_sub_d; end if;
  if round(v_raiz_a - v_raiz_d, 2) <> 8714.05 then
    raise exception 'A raiz caiu R$ % em vez de 8714.05.', v_raiz_a-v_raiz_d; end if;

  raise notice 'Parte 2 OK. % metades. Raiz R$ % -> R$ %.', v_ins, v_raiz_a, v_raiz_d;
end $parte2$;
