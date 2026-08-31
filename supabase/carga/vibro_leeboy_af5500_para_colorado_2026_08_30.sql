-- Separa as vibroacabadoras: a Leeboy e a AF5500 sao da Colorado, a AF4500 e da EMT.
--
-- Aplicado no banco em 30/08/2026.
--
-- ## A regra, dita pelo Tiago
--
--   * vibroacabadora LEEBOY  -> "002 - Equipamentos Colorado 2026"
--   * vibro AF5500           -> Colorado tambem
--   * vibro AF4500           -> Manutencao/Documentacao de Equipamentos (da EMT)
--   * so "VIBRO" na descricao, sem modelo -> AF4500...
--   * ...MAS: qualquer vibro ANTERIOR a aquisicao da AF4500 e da Colorado,
--     porque antes daquela data a EMT nao tinha vibro nenhuma.
--
-- ## A data de corte: 20/02/2026
--
-- LAN-2026-5233, "COMPRA DE MAQUINAS PARA EMT", Vectra Engenharia, R$ 728.000,00,
-- data_compra 20/02/2026. E a nota que trouxe a AF4500 (esta na etapa "Vibro
-- Acabadora AF4500 - 01" de "Aquisicao de Equipamentos" desde 28/08/2026).
--
-- A data nao e detalhe: ela e o que resolve o "so VIBRO". Sem ela, quatro
-- lancamentos de 2025 que dizem apenas "vibroacabadora" iriam para uma maquina
-- que a EMT ainda nao tinha comprado.
--
-- ## A regra e a data concordam, e isso e a prova
--
-- Nao foi preciso escolher entre o modelo e a data em nenhum caso:
--
--   * os 9 lancamentos de LEEBOY sao TODOS de 11/03/2025 a 23/07/2025;
--   * os 5 de AF5500 sao TODOS de 12/03/2025 a 15/10/2025;
--   * nenhum Leeboy ou AF5500 aparece depois de 20/02/2026;
--   * nenhum "so VIBRO" anterior ao corte cita AF4500.
--
-- Duas regras independentes apontando para o mesmo lado nos 18 casos e o que
-- permite aplicar sem conferir um por um com o Tiago.
--
-- ## O que NAO entra, e por que
--
-- Dois lancamentos citam DUAS maquinas, uma de cada dona. Mandar inteiro para a
-- Colorado poria custo de maquina da EMT na obra dela:
--
--   LAN-2026-3501  R$ 1.000,00  23/07/2025  "PRESTACAO DE SERVICOS NA MANUTENCAO
--                  DA CATERPILLAR 416E / VIBROACABADORA LEEBOY 8816B 28"
--                  -> a 416E e retroescavadeira da EMT.
--   LAN-2026-1293  R$   250,00  27/10/2025  "MECANICO NA VIBROACABADORA 8816B /
--                  ROLO CHAPA DYNAPAC"
--                  -> o rolo chapa CB10 e da EMT.
--
-- Ficam na raiz da Manutencao esperando o Tiago dizer como rateia. E a mesma
-- regra do lote de 28/08: dois ou mais matches e recusa, nunca desempate.
--
-- ## Fora do escopo, para o Tiago olhar depois
--
-- Tres lancamentos de vibro moram em centros de OBRA, nao na raiz da Manutencao.
-- Tirar custo de uma obra e outra decisao, entao nao foram tocados:
--
--   R$ 20,00   "007 - AC 405 - Lote 2"              AF5500, 15/10/2025
--   R$ 22,33   "009 - Manutencao da Rodovia BR-364"  so VIBRO, 24/04/2026
--   R$ 27,45   "002 - Equipamentos Colorado 2026"    so VIBRO, 11/08/2026
--
-- ## Movimento por UPDATE, nunca por DELETE+INSERT
--
-- So troca `centro_custo_id`. Recriar linha perderia `categoria_id`, que e outra
-- dimensao do rateio -- foi assim que R$ 133.160,00 mudaram de categoria no DRE
-- em 28/08. A linha de controle da categoria abaixo existe por causa disso.

do $aplica$
declare
  MANUT    uuid := 'fbd2556a-3e96-474b-818f-ff536a288dff';
  COLORADO uuid := '891f3c63-f7e5-49fb-a97c-9c99deeadc2b';
  AF4500   uuid := 'a4caefbd-3337-4ad2-9ff7-1aa79c00f8f3';

  PARA_COLORADO text[] := array[
    'LAN-2026-4601','LAN-2026-2598','LAN-2026-4816','LAN-2026-4851',
    'LAN-2026-2749','LAN-2026-4551','LAN-2026-0951','LAN-2026-4697',
    'LAN-2026-2242','LAN-2026-4458','LAN-2026-3477','LAN-2026-2886',
    'LAN-2026-0917','LAN-2026-4704','LAN-2026-5575','LAN-2026-2324'];
  PARA_AF4500 text[] := array['LAN-2026-2936','LAN-2026-5521','LAN-2026-5114'];

  v_ids uuid[];
  v_cat_antes jsonb; v_cat_dep jsonb;
  v_tipo_antes jsonb; v_tipo_dep jsonb;
  v_raiz_antes numeric; v_raiz_dep numeric;
  v_sub_antes numeric; v_sub_dep numeric;
  v_col_antes numeric; v_col_dep numeric;
  v_af_antes numeric;  v_af_dep numeric;
  v_a int; v_b int; v_div int;
begin
  -- ---------- as linhas que vao se mover, fixadas ANTES de mexer ----------
  select array_agg(r.id) into v_ids
  from public.lancamento_rateios r
  join public.lancamentos l on l.id = r.lancamento_id and l.status <> 'cancelado'
  where r.centro_custo_id = MANUT
    and (l.numero = any(PARA_COLORADO) or l.numero = any(PARA_AF4500));

  if coalesce(array_length(v_ids,1),0) <> 19 then
    raise exception 'Esperava 19 rateios para mover, achei %.', coalesce(array_length(v_ids,1),0);
  end if;

  -- A dimensao que a soma nao ve: a categoria de CADA linha que vai se mover.
  select jsonb_object_agg(coalesce(categoria_id::text,'sem'), soma) into v_cat_antes
  from (select categoria_id, sum(valor) as soma
        from public.lancamento_rateios where id = any(v_ids)
        group by categoria_id) t;

  select jsonb_object_agg(tipo,total) into v_tipo_antes
  from (select tipo, sum(total) as total
        from public.fn_rel_dre('2020-01-01','2030-12-31') group by tipo) t;

  select coalesce(sum(r.valor),0) into v_raiz_antes
  from public.lancamento_rateios r
  join public.lancamentos l on l.id=r.lancamento_id and l.status<>'cancelado'
  where r.centro_custo_id = MANUT;

  select coalesce(sum(r.valor),0) into v_sub_antes
  from public.lancamento_rateios r
  join public.lancamentos l on l.id=r.lancamento_id and l.status<>'cancelado'
  join public.centros_custo c on c.id=r.centro_custo_id
  where c.id=MANUT or c.pai_id=MANUT;

  select coalesce(sum(r.valor),0) into v_col_antes
  from public.lancamento_rateios r
  join public.lancamentos l on l.id=r.lancamento_id and l.status<>'cancelado'
  where r.centro_custo_id = COLORADO;

  select coalesce(sum(r.valor),0) into v_af_antes
  from public.lancamento_rateios r
  join public.lancamentos l on l.id=r.lancamento_id and l.status<>'cancelado'
  where r.centro_custo_id = AF4500;

  -- ---------- 1. Leeboy, AF5500 e o vibro anterior a 20/02/2026 ----------
  update public.lancamento_rateios r
  set centro_custo_id = COLORADO
  from public.lancamentos l
  where l.id = r.lancamento_id
    and r.centro_custo_id = MANUT
    and l.numero = any(PARA_COLORADO);
  get diagnostics v_a = row_count;

  -- ---------- 2. o vibro sem modelo, posterior a aquisicao ----------
  update public.lancamento_rateios r
  set centro_custo_id = AF4500
  from public.lancamentos l
  where l.id = r.lancamento_id
    and r.centro_custo_id = MANUT
    and l.numero = any(PARA_AF4500);
  get diagnostics v_b = row_count;

  -- ---------- linhas de controle ----------
  select jsonb_object_agg(coalesce(categoria_id::text,'sem'), soma) into v_cat_dep
  from (select categoria_id, sum(valor) as soma
        from public.lancamento_rateios where id = any(v_ids)
        group by categoria_id) t;

  select jsonb_object_agg(tipo,total) into v_tipo_dep
  from (select tipo, sum(total) as total
        from public.fn_rel_dre('2020-01-01','2030-12-31') group by tipo) t;

  select coalesce(sum(r.valor),0) into v_raiz_dep
  from public.lancamento_rateios r
  join public.lancamentos l on l.id=r.lancamento_id and l.status<>'cancelado'
  where r.centro_custo_id = MANUT;

  select coalesce(sum(r.valor),0) into v_sub_dep
  from public.lancamento_rateios r
  join public.lancamentos l on l.id=r.lancamento_id and l.status<>'cancelado'
  join public.centros_custo c on c.id=r.centro_custo_id
  where c.id=MANUT or c.pai_id=MANUT;

  select coalesce(sum(r.valor),0) into v_col_dep
  from public.lancamento_rateios r
  join public.lancamentos l on l.id=r.lancamento_id and l.status<>'cancelado'
  where r.centro_custo_id = COLORADO;

  select coalesce(sum(r.valor),0) into v_af_dep
  from public.lancamento_rateios r
  join public.lancamentos l on l.id=r.lancamento_id and l.status<>'cancelado'
  where r.centro_custo_id = AF4500;

  select count(*) into v_div from (
    select l.id from public.lancamentos l
    join public.lancamento_rateios r on r.lancamento_id=l.id
    where l.status<>'cancelado' group by l.id,l.valor
    having round(sum(r.valor),2) <> round(l.valor,2)) t;

  if v_a <> 16 then raise exception 'Colorado recebeu % linhas em vez de 16.', v_a; end if;
  if v_b <> 3  then raise exception 'AF4500 recebeu % linhas em vez de 3.', v_b; end if;

  -- A que TEM que ficar igual: nenhuma linha mudou de categoria no caminho.
  if v_cat_antes <> v_cat_dep then
    raise exception 'A categoria das linhas movidas mudou: % -> %.',
      v_cat_antes::text, v_cat_dep::text;
  end if;
  if v_tipo_antes <> v_tipo_dep then
    raise exception 'O DRE por tipo mudou: % -> %.', v_tipo_antes::text, v_tipo_dep::text;
  end if;
  if v_div > 0 then
    raise exception '% lancamento(s) com rateio que nao fecha com o valor.', v_div;
  end if;

  -- As que TEM que diferir, cada uma pelo seu valor exato.
  if round(v_col_dep - v_col_antes, 2) <> 38399.90 then
    raise exception 'Colorado subiu R$ % em vez de 38399.90.', v_col_dep - v_col_antes;
  end if;
  if round(v_af_dep - v_af_antes, 2) <> 949.52 then
    raise exception 'AF4500 subiu R$ % em vez de 949.52.', v_af_dep - v_af_antes;
  end if;
  if round(v_raiz_antes - v_raiz_dep, 2) <> 39349.42 then
    raise exception 'A raiz caiu R$ % em vez de 39349.42.', v_raiz_antes - v_raiz_dep;
  end if;
  -- A subarvore cai SO o que foi para a Colorado: os R$ 949,52 continuam dentro
  -- dela, na etapa da AF4500. Se cair 39.349,42 aqui, alguma coisa saiu do
  -- centro da manutencao sem ser pedida.
  if round(v_sub_antes - v_sub_dep, 2) <> 38399.90 then
    raise exception 'A subarvore da Manutencao caiu R$ % em vez de 38399.90.',
      v_sub_antes - v_sub_dep;
  end if;

  raise notice 'OK: % para a Colorado, % para a AF4500. Raiz: R$ % -> R$ %.',
    v_a, v_b, v_raiz_antes, v_raiz_dep;
end $aplica$;
