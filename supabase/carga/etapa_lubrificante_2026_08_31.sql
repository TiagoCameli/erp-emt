-- Etapa Lubrificante: a compra em granel sai da raiz.
--
-- Aplicado no banco em 31/08/2026, depois de `mc_rateio_a_fundo`.
--
--   "crie uma etapa para lubrificante no cc de manutencao de equipamentos,
--    e coloque todo o lubrificante nele"
--
--   raiz da Manutencao: R$ 179.179,27 -> R$ 101.994,63  (64 -> 59 lanc.)
--   Lubrificante (nova):                R$  77.184,64  (5 lanc.)
--
-- ## Interpretei "todo o lubrificante" como a compra EM GRANEL, e nao como
--    literalmente todo lancamento que fala de oleo
--
-- Procurando lubrificante na subarvore da Manutencao aparecem duas realidades
-- diferentes:
--
--   6 lancamentos na RAIZ,    R$ 77.774,26  -- compra em granel, nenhuma
--                                              maquina citada
--  38 lancamentos em MAQUINA, R$ 25.398,33  -- troca de oleo com a maquina
--                                              nomeada no texto
--
-- Os 38 dizem coisas como "oleo balde HD 68 RETROESCAVADEIRA 416E", "HEXXLUB
-- GEAR 90 CAMINHAO CACAMBA 2423 MZO 8F87", "oleo motor PALIO". Move-los para
-- uma etapa generica de Lubrificante **destruiria** o custo por equipamento --
-- que e exatamente o que estes tres dias de revisao construiram. Entao eles
-- ficam onde estao, e a etapa nova recebe so o granel.
--
-- Se ele quiser os 38 tambem, e um UPDATE de uma linha. O contrario nao: depois
-- de agregar, a informacao de qual maquina era nao volta.
--
-- ## Dos 6 da raiz, movi 5
--
--   LAN-2026-4242  R$ 25.280,00  "compra de oleo lubrificante"
--   LAN-2026-0983  R$ 20.644,80  IPIRANGA BRUTUS PERFORMANCE 15W40 / GRAXA
--   LAN-2026-2895  R$ 17.703,00  LUBRIFICANTE IPIRANGA BRUTUS PERFORMANCE
--   LAN-2026-2389  R$ 10.718,58  LUBRAX GL 5 90 / LUBRAX TRM 4 80W
--   LAN-2026-1491  R$  2.838,26  LUBRAX ATF TDX / LUBRAX UNITRACTOR 10W30
--
-- O sexto (LAN-2026-1519, R$ 589,62) NAO foi: ele diz "oleo HEXXLUB para
-- RETROESCAVADEIRA 416E e CAMINHAO BOIADEIRO MZO 7876". Cita duas maquinas, e
-- so falta saber qual das duas 416E. Foi para a planilha de duvidas.
--
-- ## Isso encolhe a pergunta que estava aberta
--
-- Quatro desses cinco (R$ 51.904,64) estavam no bloco dos 22 que o MC manda
-- para 'Empresa' e que eu tinha deixado esperando decisao de contabilidade. A
-- resposta dele resolveu melhor que o MC: o custo continua na Manutencao (onde
-- ele pertence, porque e insumo de manutencao) e para de fingir que e de uma
-- maquina so.
--
-- ## Linha de controle
--
-- A Lubrificante fica DENTRO da Manutencao, entao a raiz cai R$ 77.184,64 e a
-- **subarvore nao pode mexer**. Se as duas mexessem junto, alguma fatia teria
-- saido do centro sem eu pedir.
--
-- Mais uma checagem que as outras cargas nao tinham: **prova de cobertura**.
-- Depois de mover, nenhuma compra de lubrificante em granel pode sobrar na raiz.
-- "Em granel" esta escrito no proprio SQL como uma condicao dupla: o texto fala
-- de lubrificante E nao cita maquina nem placa. Sem ela eu nao teria como saber
-- se peguei 5 de 5 ou 5 de 7.

do $aplica$
declare
  MANUT uuid := 'fbd2556a-3e96-474b-818f-ff536a288dff';
  ALVO text[] := array['LAN-2026-4242','LAN-2026-0983','LAN-2026-2895','LAN-2026-2389','LAN-2026-1491'];
  v_lub uuid; v_t int;
  v_raiz_a numeric; v_raiz_d numeric; v_sub_a numeric; v_sub_d numeric;
  v_tipo_a jsonb; v_tipo_d jsonb; v_div int; v_lin_a int; v_lin_d int; v_sobra int;
begin
  select count(*) into v_lin_a from public.lancamento_rateios;
  select jsonb_object_agg(tipo,total) into v_tipo_a
  from (select tipo, sum(total) as total from public.fn_rel_dre('2020-01-01','2030-12-31') group by tipo) t;
  select coalesce(sum(r.valor),0) into v_raiz_a from public.lancamento_rateios r
  join public.lancamentos l on l.id=r.lancamento_id and l.status<>'cancelado' where r.centro_custo_id=MANUT;
  select coalesce(sum(r.valor),0) into v_sub_a from public.lancamento_rateios r
  join public.lancamentos l on l.id=r.lancamento_id and l.status<>'cancelado'
  join public.centros_custo c on c.id=r.centro_custo_id where c.id=MANUT or c.pai_id=MANUT;

  insert into public.centros_custo (nome, nivel, pai_id)
  select 'Lubrificante', 2, MANUT
  where not exists (select 1 from public.centros_custo where pai_id=MANUT and nome='Lubrificante');
  select id into v_lub from public.centros_custo where pai_id=MANUT and nome='Lubrificante';
  if v_lub is null then raise exception 'A etapa Lubrificante nao foi criada.'; end if;

  update public.lancamento_rateios r set centro_custo_id = v_lub
  from public.lancamentos l
  where l.id=r.lancamento_id and l.status<>'cancelado'
    and r.centro_custo_id = MANUT and l.numero = any(ALVO);
  get diagnostics v_t = row_count;
  if v_t <> 5 then raise exception 'Moveu % linhas em vez de 5.', v_t; end if;

  -- prova de cobertura: nenhuma compra de lubrificante em granel pode sobrar na
  -- raiz. "Em granel" = o texto fala de lubrificante e NAO cita maquina nem placa.
  select count(*) into v_sobra from public.lancamento_rateios r
  join public.lancamentos l on l.id=r.lancamento_id and l.status<>'cancelado'
  where r.centro_custo_id = MANUT
    and upper(translate(l.descricao,'ÁÀÂÃÉÊÍÓÔÕÚÇáàâãéêíóôõúç','AAAAEEIOOOUCAAAAEEIOOOUC'))
        ~ 'LUBRAX|BRUTUS|LUBRIFICANTE|GRAXA'
    and upper(translate(l.descricao,'ÁÀÂÃÉÊÍÓÔÕÚÇáàâãéêíóôõúç','AAAAEEIOOOUCAAAAEEIOOOUC'))
        !~ 'RETRO|CACAMBA|CAVALO|ESCAVADEIRA|MOTONIVEL|ROLO|TRATOR|MELOZA|VIBRO|MUNCK|PALIO|HILUX|SAVEIRO|BOBCAT|PIPA|[A-Z]{3}[ -]?[0-9][A-Z0-9][0-9]{2}';

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

  if v_lin_d <> v_lin_a then raise exception 'O numero de rateios mudou.'; end if;
  if v_div > 0 then raise exception '% lancamento(s) com rateio fora do valor.', v_div; end if;
  if v_tipo_a <> v_tipo_d then raise exception 'DRE por tipo mudou.'; end if;
  -- a Lubrificante fica DENTRO da Manutencao: a subarvore nao pode mexer
  if round(v_sub_d - v_sub_a, 2) <> 0 then
    raise exception 'A subarvore mexeu R$ %, e nao devia.', v_sub_d-v_sub_a; end if;
  if round(v_raiz_a - v_raiz_d, 2) <> 77184.64 then
    raise exception 'A raiz caiu R$ % em vez de 77184.64.', v_raiz_a-v_raiz_d; end if;
  if v_sobra > 0 then
    raise exception 'Sobraram % compra(s) de lubrificante em granel na raiz.', v_sobra; end if;

  raise notice 'OK. Etapa Lubrificante %. Raiz R$ % -> R$ %.', v_lub, v_raiz_a, v_raiz_d;
end $aplica$;
