-- Duas etapas novas: a manutencao da Amazonia e a Oficina da EMT.
--
-- Aplicado no banco em 30/08/2026, depois de `mc/`.
--
-- ## O que o Tiago decidiu
--
--   "amarok e agrale e da amazonia agroindustria, crie uma etapa de manutencao
--    de equipamentos da amazonia dentro do cc da amazonia. valtra e equipamentos
--    colorado. crie a etapa oficina dentro do cc de manutencao de equipamentos."
--
-- Tres maquinas que apareciam na raiz da Manutencao e nao existem na frota da
-- EMT tinham dono: a Amarok e o Agrale BX6180 sao da Amazonia Agroindustria, e o
-- Valtra BH180 e da Colorado. E a Oficina, que o Mais Controle sempre teve como
-- etapa e o erp-emt nao tinha, ganhou a dela.
--
--   27 lancamentos, R$ 28.552,64 -> Manutencao de Equipamentos da Amazonia (nova)
--    5 lancamentos, R$  4.358,00 -> 002 - Equipamentos Colorado 2026
--   56 lancamentos, R$ 25.088,48 -> Oficina (nova, dentro da Manutencao)
--
--   raiz da Manutencao: R$ 479.333,06 -> R$ 421.333,94  (358 -> 270 lanc.)
--
-- ## Tres ficaram de fora, e a leitura pegou os tres
--
--   LAN-2026-4949  R$ 2.300,00  "02 BATERIAS HELIAR PARA CAMINHAO CAVALO E
--                  TRATOR DE PNEU BX6180"
--                  Duas maquinas de donos diferentes. Pela regra do meio a meio
--                  seria R$ 1.150 para cada, mas "caminhao cavalo" sem modelo
--                  serve para SEIS cavalos do cadastro. Falta dizer qual.
--   LAN-2026-1997  R$   567,00  cavalo MZO-2987 + cacamba MZO-5897 + meloza
--                  MZO-3926 + trator BX6180. Quatro maquinas, tres da EMT.
--   LAN-2026-2549  R$   150,00  "MATERIAL UTILIZADO NO ROLO QUE ESTA SENDO
--                  ADAPTADO OFICINA"
--                  Diz oficina, mas o material foi usado NO rolo. E qual rolo,
--                  o texto nao diz.
--
-- ## A Oficina fica DENTRO da Manutencao, e isso muda a linha de controle
--
-- Os R$ 25.088,48 saem da RAIZ mas continuam na SUBARVORE. Por isso as duas
-- checagens tem valores diferentes de proposito:
--
--   raiz      cai R$ 57.999,12  (Amazonia + Colorado + Oficina)
--   subarvore cai R$ 32.910,64  (so Amazonia + Colorado)
--
-- Escrever o mesmo numero nas duas teria passado despercebido e escondido um
-- erro de destino. E a mesma licao do Cavalo XF 530 de hoje mais cedo: a
-- fronteira que a checagem mede tem que ser a fronteira que a operacao cruza.
--
-- ## A usina nao foi movida
--
-- O Tiago pediu para detalhar antes de decidir. Sao 14 lancamentos e R$ 5.840,19,
-- quase todos dizendo "OBRA BR364" na propria descricao. Ficam na raiz ate ele
-- dizer para onde.

do $aplica$
declare
  MANUT uuid := 'fbd2556a-3e96-474b-818f-ff536a288dff';
  COLORADO uuid := '891f3c63-f7e5-49fb-a97c-9c99deeadc2b';
  AMAZONIA uuid := 'a6a1f57d-b8cb-4113-b694-58f34af7bdb4';
  v_amaz uuid; v_ofic uuid; v_a int; v_b int; v_c int;
  v_raiz_a numeric; v_raiz_d numeric; v_sub_a numeric; v_sub_d numeric;
  v_col_a numeric; v_col_d numeric; v_amz_a numeric; v_amz_d numeric;
  v_tipo_a jsonb; v_tipo_d jsonb; v_div int; v_lin_a int; v_lin_d int;
begin
  select count(*) into v_lin_a from public.lancamento_rateios;
  select jsonb_object_agg(tipo,total) into v_tipo_a
  from (select tipo, sum(total) as total from public.fn_rel_dre('2020-01-01','2030-12-31') group by tipo) t;
  select coalesce(sum(r.valor),0) into v_raiz_a from public.lancamento_rateios r
  join public.lancamentos l on l.id=r.lancamento_id and l.status<>'cancelado' where r.centro_custo_id=MANUT;
  select coalesce(sum(r.valor),0) into v_sub_a from public.lancamento_rateios r
  join public.lancamentos l on l.id=r.lancamento_id and l.status<>'cancelado'
  join public.centros_custo c on c.id=r.centro_custo_id where c.id=MANUT or c.pai_id=MANUT;
  select coalesce(sum(r.valor),0) into v_col_a from public.lancamento_rateios r
  join public.lancamentos l on l.id=r.lancamento_id and l.status<>'cancelado' where r.centro_custo_id=COLORADO;
  select coalesce(sum(r.valor),0) into v_amz_a from public.lancamento_rateios r
  join public.lancamentos l on l.id=r.lancamento_id and l.status<>'cancelado'
  join public.centros_custo c on c.id=r.centro_custo_id where c.id=AMAZONIA or c.pai_id=AMAZONIA;

  insert into public.centros_custo (nome, nivel, pai_id)
  select 'Manutenção de Equipamentos da Amazônia', 2, AMAZONIA
  where not exists (select 1 from public.centros_custo
                    where pai_id=AMAZONIA and nome='Manutenção de Equipamentos da Amazônia');
  select id into v_amaz from public.centros_custo
  where pai_id=AMAZONIA and nome='Manutenção de Equipamentos da Amazônia';

  insert into public.centros_custo (nome, nivel, pai_id)
  select 'Oficina', 2, MANUT
  where not exists (select 1 from public.centros_custo where pai_id=MANUT and nome='Oficina');
  select id into v_ofic from public.centros_custo where pai_id=MANUT and nome='Oficina';

  if v_amaz is null or v_ofic is null then
    raise exception 'Alguma das duas etapas novas nao foi criada.'; end if;

  update public.lancamento_rateios r set centro_custo_id = v_amaz
  from public.lancamentos l
  where l.id=r.lancamento_id and l.status<>'cancelado' and r.centro_custo_id=MANUT
    and upper(translate(l.descricao,'ÁÀÂÃÉÊÍÓÔÕÚÇáàâãéêíóôõúç','AAAAEEIOOOUCAAAAEEIOOOUC'))
        ~ 'AMAROK|AGRALE|BX6180|BX618|GIRICO'
    and l.numero not in ('LAN-2026-1997','LAN-2026-4949');
  get diagnostics v_a = row_count;

  update public.lancamento_rateios r set centro_custo_id = COLORADO
  from public.lancamentos l
  where l.id=r.lancamento_id and l.status<>'cancelado' and r.centro_custo_id=MANUT
    and upper(translate(l.descricao,'ÁÀÂÃÉÊÍÓÔÕÚÇáàâãéêíóôõúç','AAAAEEIOOOUCAAAAEEIOOOUC')) ~ 'VALTRA';
  get diagnostics v_b = row_count;

  update public.lancamento_rateios r set centro_custo_id = v_ofic
  from public.lancamentos l
  where l.id=r.lancamento_id and l.status<>'cancelado' and r.centro_custo_id=MANUT
    and upper(translate(l.descricao,'ÁÀÂÃÉÊÍÓÔÕÚÇáàâãéêíóôõúç','AAAAEEIOOOUCAAAAEEIOOOUC'))
        ~ 'OFICINA|FERRAMENT|ALICATE'
    and l.numero <> 'LAN-2026-2549';
  get diagnostics v_c = row_count;

  select count(*) into v_lin_d from public.lancamento_rateios;
  select jsonb_object_agg(tipo,total) into v_tipo_d
  from (select tipo, sum(total) as total from public.fn_rel_dre('2020-01-01','2030-12-31') group by tipo) t;
  select coalesce(sum(r.valor),0) into v_raiz_d from public.lancamento_rateios r
  join public.lancamentos l on l.id=r.lancamento_id and l.status<>'cancelado' where r.centro_custo_id=MANUT;
  select coalesce(sum(r.valor),0) into v_sub_d from public.lancamento_rateios r
  join public.lancamentos l on l.id=r.lancamento_id and l.status<>'cancelado'
  join public.centros_custo c on c.id=r.centro_custo_id where c.id=MANUT or c.pai_id=MANUT;
  select coalesce(sum(r.valor),0) into v_col_d from public.lancamento_rateios r
  join public.lancamentos l on l.id=r.lancamento_id and l.status<>'cancelado' where r.centro_custo_id=COLORADO;
  select coalesce(sum(r.valor),0) into v_amz_d from public.lancamento_rateios r
  join public.lancamentos l on l.id=r.lancamento_id and l.status<>'cancelado'
  join public.centros_custo c on c.id=r.centro_custo_id where c.id=AMAZONIA or c.pai_id=AMAZONIA;
  select count(*) into v_div from (select l.id from public.lancamentos l
    join public.lancamento_rateios r on r.lancamento_id=l.id where l.status<>'cancelado'
    group by l.id,l.valor having round(sum(r.valor),2)<>round(l.valor,2)) t;

  if v_lin_d <> v_lin_a then raise exception 'O numero de rateios mudou: % -> %.', v_lin_a, v_lin_d; end if;
  if v_div > 0 then raise exception '% lancamento(s) com rateio fora do valor.', v_div; end if;
  if v_tipo_a <> v_tipo_d then raise exception 'DRE por tipo mudou.'; end if;
  if round(v_amz_d - v_amz_a, 2) <> 28552.64 then
    raise exception 'Amazonia subiu R$ % em vez de 28552.64.', v_amz_d-v_amz_a; end if;
  if round(v_col_d - v_col_a, 2) <> 4358.00 then
    raise exception 'Colorado subiu R$ % em vez de 4358.00.', v_col_d-v_col_a; end if;
  -- a subarvore cai MENOS que a raiz, porque a Oficina fica dentro dela
  if round(v_sub_a - v_sub_d, 2) <> 32910.64 then
    raise exception 'A subarvore caiu R$ % em vez de 32910.64.', v_sub_a-v_sub_d; end if;
  if round(v_raiz_a - v_raiz_d, 2) <> 57999.12 then
    raise exception 'A raiz caiu R$ % em vez de 57999.12.', v_raiz_a-v_raiz_d; end if;

  raise notice 'OK. Amazonia % | Colorado % | Oficina %. Raiz R$ % -> R$ %.',
    v_a, v_b, v_c, v_raiz_a, v_raiz_d;
end $aplica$;
