-- As duas ultimas pendencias do bloco: as duas sao da Amazonia.
--
-- Aplicado no banco em 31/08/2026, depois de `mc_rateio_real`.
--
-- ## O que ele disse
--
--   "todos esses dois sao da amazonia"
--
-- Resposta as duas perguntas que sobraram, e as duas nasceram da conferencia
-- contra o Mais Controle, nao da leitura das notas:
--
--   LAN-2026-2492  R$ 2.000,00  o MC lanca essa metade em "Trator de Pneu
--                  (Girico) WALMET 128 - 06", maquina que nao existe na frota do
--                  ERP. Eu tinha mandado para a Amazonia supondo que fosse o
--                  BX6180. **Confirmado: e da Amazonia de qualquer jeito**, so
--                  que e outra maquina. Nada a mover.
--   LAN-2026-2549  R$   150,00  "material utilizado no rolo que esta sendo
--                  adaptado, oficina". Ele tinha dito "rolo 01" e o MC dizia
--                  "Oficina". A resposta e uma terceira: o rolo e da Amazonia.
--                  **Sai do Rolo CP56 - 01 e vai para a Amazonia.**
--
--   Manutencao de Equipamentos da Amazonia: R$ 39.783,63 -> R$ 39.933,63
--   Rolo CP56 - 01:                         R$ 13.208,13 -> R$ 13.058,13
--
-- ## A raiz NAO pode mexer aqui, e e isso que a checagem mede
--
-- Todas as cargas anteriores tiravam dinheiro da raiz. Esta nao: os R$ 150,00
-- estao numa ETAPA (o Rolo CP56 - 01) desde ontem. Escrever "a raiz cai R$ 150"
-- por habito teria falhado, e escrever "a raiz nao mexe" e o que prova que eu
-- movi da etapa certa.
--
-- A subarvore da Manutencao cai R$ 150,00 porque a etapa da Amazonia vive fora
-- dela, debaixo do centro da Amazonia Agroindustria.
--
-- ## O 2492 entra como PROVA, nao como movimento
--
-- Ele confirmou um destino que ja estava aplicado. Em vez de nao fazer nada, o
-- bloco verifica que os R$ 2.000,00 continuam la. Se outra frente tivesse mexido
-- nesse lancamento no meio do caminho, esta carga falharia em vez de passar
-- calada dizendo "confirmado".

do $aplica$
declare
  MANUT uuid := 'fbd2556a-3e96-474b-818f-ff536a288dff';
  AMAZ uuid := 'df5637cd-0c9d-45de-b06f-26cd31a0d666';
  ROLO1 uuid := '516ed0a3-c5b5-4868-b421-179a64fc36bb';
  v_raiz_a numeric; v_raiz_d numeric; v_sub_a numeric; v_sub_d numeric;
  v_amz_a numeric; v_amz_d numeric; v_rolo_a numeric; v_rolo_d numeric;
  v_2492 numeric; v_tipo_a jsonb; v_tipo_d jsonb; v_div int; v_lin_a int; v_lin_d int; v_t int;
begin
  select count(*) into v_lin_a from public.lancamento_rateios;
  select jsonb_object_agg(tipo,total) into v_tipo_a
  from (select tipo, sum(total) as total from public.fn_rel_dre('2020-01-01','2030-12-31') group by tipo) t;
  select coalesce(sum(r.valor),0) into v_raiz_a from public.lancamento_rateios r
  join public.lancamentos l on l.id=r.lancamento_id and l.status<>'cancelado' where r.centro_custo_id=MANUT;
  select coalesce(sum(r.valor),0) into v_sub_a from public.lancamento_rateios r
  join public.lancamentos l on l.id=r.lancamento_id and l.status<>'cancelado'
  join public.centros_custo c on c.id=r.centro_custo_id where c.id=MANUT or c.pai_id=MANUT;
  select coalesce(sum(r.valor),0) into v_amz_a from public.lancamento_rateios r
  join public.lancamentos l on l.id=r.lancamento_id and l.status<>'cancelado' where r.centro_custo_id=AMAZ;
  select coalesce(sum(r.valor),0) into v_rolo_a from public.lancamento_rateios r
  join public.lancamentos l on l.id=r.lancamento_id and l.status<>'cancelado' where r.centro_custo_id=ROLO1;

  -- o 2492 ja esta na Amazonia desde ontem; aqui so PROVO que continua, porque a
  -- resposta dele confirma o destino sem mandar mover nada
  select coalesce(sum(r.valor),0) into v_2492 from public.lancamento_rateios r
  join public.lancamentos l on l.id=r.lancamento_id
  where l.numero='LAN-2026-2492' and r.centro_custo_id=AMAZ;
  if round(v_2492,2) <> 2000.00 then
    raise exception 'O 2492 tem R$ % na Amazonia, esperava 2000,00.', v_2492; end if;

  -- o 2549 sai do Rolo CP56 - 01 e vai para a Amazonia
  update public.lancamento_rateios r set centro_custo_id = AMAZ
  from public.lancamentos l
  where l.id=r.lancamento_id and l.numero='LAN-2026-2549' and r.centro_custo_id=ROLO1;
  get diagnostics v_t = row_count; if v_t <> 1 then raise exception '2549 moveu % linhas.', v_t; end if;

  select count(*) into v_lin_d from public.lancamento_rateios;
  select jsonb_object_agg(tipo,total) into v_tipo_d
  from (select tipo, sum(total) as total from public.fn_rel_dre('2020-01-01','2030-12-31') group by tipo) t;
  select coalesce(sum(r.valor),0) into v_raiz_d from public.lancamento_rateios r
  join public.lancamentos l on l.id=r.lancamento_id and l.status<>'cancelado' where r.centro_custo_id=MANUT;
  select coalesce(sum(r.valor),0) into v_sub_d from public.lancamento_rateios r
  join public.lancamentos l on l.id=r.lancamento_id and l.status<>'cancelado'
  join public.centros_custo c on c.id=r.centro_custo_id where c.id=MANUT or c.pai_id=MANUT;
  select coalesce(sum(r.valor),0) into v_amz_d from public.lancamento_rateios r
  join public.lancamentos l on l.id=r.lancamento_id and l.status<>'cancelado' where r.centro_custo_id=AMAZ;
  select coalesce(sum(r.valor),0) into v_rolo_d from public.lancamento_rateios r
  join public.lancamentos l on l.id=r.lancamento_id and l.status<>'cancelado' where r.centro_custo_id=ROLO1;
  select count(*) into v_div from (select l.id from public.lancamentos l
    join public.lancamento_rateios r on r.lancamento_id=l.id where l.status<>'cancelado'
    group by l.id,l.valor having round(sum(r.valor),2)<>round(l.valor,2)) t;

  if v_lin_d <> v_lin_a then raise exception 'O numero de rateios mudou.'; end if;
  if v_div > 0 then raise exception '% lancamento(s) com rateio fora do valor.', v_div; end if;
  if v_tipo_a <> v_tipo_d then raise exception 'DRE por tipo mudou.'; end if;
  -- a RAIZ nao pode mexer: o dinheiro sai de uma ETAPA, nao dela
  if round(v_raiz_d - v_raiz_a, 2) <> 0 then
    raise exception 'A raiz mexeu R$ %, e nao devia.', v_raiz_d-v_raiz_a; end if;
  if round(v_rolo_a - v_rolo_d, 2) <> 150.00 then
    raise exception 'O Rolo CP56-01 caiu R$ % em vez de 150,00.', v_rolo_a-v_rolo_d; end if;
  if round(v_amz_d - v_amz_a, 2) <> 150.00 then
    raise exception 'A Amazonia subiu R$ % em vez de 150,00.', v_amz_d-v_amz_a; end if;
  if round(v_sub_a - v_sub_d, 2) <> 150.00 then
    raise exception 'A subarvore caiu R$ % em vez de 150,00.', v_sub_a-v_sub_d; end if;

  raise notice 'OK. Amazonia R$ % -> R$ %. Subarvore da Manutencao R$ % -> R$ %.',
    v_amz_a, v_amz_d, v_sub_a, v_sub_d;
end $aplica$;
