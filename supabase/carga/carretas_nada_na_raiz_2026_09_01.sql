-- Tira o custo da RAIZ de "001 - Carretas EMT": tudo passa a morar em etapa.
--
-- Regra dita pelo Tiago em 01/09/2026: "nao pode ter nada na raiz desse cc, tudo
-- tem que estar em etapa".
--
-- ## As duas linhas, e por que uma delas se divide
--
-- LAN-2026-6649  R$ 210,00  31/08/2026  Jacson Lima Fagundes
--   "ALIMENTACAO MOTORISTA CARRETA SQU 9C94 PERIODO 30/08 A 01/09"
--   -> a placa esta na DESCRICAO: vai inteiro para a carreta 03 (SQU9C94).
--      Nao foi escolha minha, foi leitura da fonte.
--
-- LAN-2026-5037  R$ 428,00  30/04/2026  ICCAP Implementos Rodoviarios
--   "SERVICO TROCA DE BALANCA GUERRA, PORCA E PARAFUSOS CARRETA"
--   -> a descricao diz so "CARRETA", sem placa, e o lancamento nao tem anexo nem
--      numero de documento. A unica pista era "OC da planilha: 1977" na
--      observacao, que aponta para o Mais Controle, fora do meu alcance.
--      O Tiago decidiu: DIVIDIR entre as carretas 03, 04 e 05.
--
-- ## A divisao dos R$ 428,00 e por MAIOR RESTO
--
--   428,00 / 3 = 142,6666...
--   142,67 + 142,67 + 142,66 = 428,00
--
-- Arredondando as tres para 142,67 daria R$ 428,01 e o
-- `trg_valida_soma_do_rateio` reprovaria no COMMIT; para 142,67/142,67/142,66 a
-- soma fecha exata. E a mesma regra de `pagamentos/recorte.ts`, que reparte a
-- fatia do centro na tela: os dois lugares tem que dividir dinheiro igual.
--
-- ## UPDATE onde da, INSERT so onde precisa
--
-- A 6649 e um UPDATE de `centro_custo_id` e nada mais -- nunca DELETE+INSERT,
-- porque recriar a linha perderia `categoria_id`, que e outra dimensao do rateio
-- e que a soma nao ve (foi assim que R$ 133.160,00 mudaram de categoria no DRE
-- em 28/08/2026).
--
-- A 5037 precisa virar TRES linhas, entao ela e um UPDATE (a linha que ja existe
-- vira a fatia da 03) mais dois INSERT. Os dois INSERT COPIAM `categoria_id` e
-- `created_by` da linha original: sem isso as duas fatias novas nasceriam sem
-- categoria e R$ 285,33 sairiam de "Outras despesas" no DRE sem ninguem pedir.
--
-- ## Idempotente
--
-- Se rodar duas vezes, a segunda nao acha nada na raiz e para no primeiro guard
-- ("esperava 2 rateios na raiz"). Nao ha como duplicar as fatias.
--
-- Rollback versionado em supabase/rollbacks/carretas_nada_na_raiz_2026_09_01_rollback.sql

do $aplica$
declare
  RAIZ  uuid := 'a39e45c0-aea5-4d98-aebd-814616b8551c'; -- 001 - Carretas EMT
  C03   uuid := 'f41ceac0-89a2-4330-ab8a-0111ed55aaee'; -- SQU9C94 - 03
  C04   uuid := '8301d9f6-911e-42b8-af64-072d86266c9d'; -- SQU9D04 - 04
  C05   uuid := '728cb732-113c-4f39-a5db-a287abae20fe'; -- SQU9D14 - 05

  R_5037 uuid := '34b394b1-64da-41ed-b238-6d2f7bb2dab4';
  R_6649 uuid := '434ca83d-a100-48ad-bb66-5ee787e56277';

  v_na_raiz int;
  v_lanc_5037 uuid; v_cat_5037 uuid; v_autor_5037 uuid;
  v_sub_antes numeric; v_sub_dep numeric;
  v_raiz_antes numeric; v_raiz_dep numeric;
  v_cat_antes jsonb; v_cat_dep jsonb;
  v_tipo_antes jsonb; v_tipo_dep jsonb;
  v_c03_antes numeric; v_c03_dep numeric;
  v_c04_antes numeric; v_c04_dep numeric;
  v_c05_antes numeric; v_c05_dep numeric;
  v_div int; v_n int;
begin
  -- ---------- 1. o estado de partida, fixado ANTES de mexer ----------
  select count(*) into v_na_raiz
  from public.lancamento_rateios where centro_custo_id = RAIZ;
  if v_na_raiz <> 2 then
    raise exception 'Esperava 2 rateios na raiz das Carretas, achei %. Ja rodou?', v_na_raiz;
  end if;

  select lancamento_id, categoria_id, created_by
    into v_lanc_5037, v_cat_5037, v_autor_5037
  from public.lancamento_rateios where id = R_5037;
  if v_lanc_5037 is null then
    raise exception 'O rateio do LAN-2026-5037 nao esta mais la.';
  end if;

  -- Soma da SUBARVORE inteira: ela NAO pode mudar. O dinheiro so desce de nivel.
  select coalesce(sum(r.valor),0) into v_sub_antes
  from public.lancamento_rateios r
  join public.centros_custo c on c.id = r.centro_custo_id
  where c.id = RAIZ or c.pai_id = RAIZ;

  select coalesce(sum(valor),0) into v_raiz_antes
  from public.lancamento_rateios where centro_custo_id = RAIZ;

  -- A dimensao que a soma nao ve, nos DOIS lancamentos tocados.
  select jsonb_object_agg(coalesce(categoria_id::text,'sem'), soma) into v_cat_antes
  from (select categoria_id, sum(valor) as soma
        from public.lancamento_rateios
        where lancamento_id in (v_lanc_5037,
              (select lancamento_id from public.lancamento_rateios where id = R_6649))
        group by categoria_id) t;

  select jsonb_object_agg(tipo,total) into v_tipo_antes
  from (select tipo, sum(total) as total
        from public.fn_rel_dre('2020-01-01','2030-12-31') group by tipo) t;

  select coalesce(sum(valor),0) into v_c03_antes from public.lancamento_rateios where centro_custo_id = C03;
  select coalesce(sum(valor),0) into v_c04_antes from public.lancamento_rateios where centro_custo_id = C04;
  select coalesce(sum(valor),0) into v_c05_antes from public.lancamento_rateios where centro_custo_id = C05;

  -- ---------- 2. LAN-2026-6649: a placa esta na descricao, vai inteiro ----------
  update public.lancamento_rateios
  set centro_custo_id = C03
  where id = R_6649 and centro_custo_id = RAIZ;
  get diagnostics v_n = row_count;
  if v_n <> 1 then raise exception 'A 6649 moveu % linhas em vez de 1.', v_n; end if;

  -- ---------- 3. LAN-2026-5037: divide entre 03, 04 e 05 ----------
  -- A linha que ja existe vira a fatia da 03 (mantem categoria e autor).
  update public.lancamento_rateios
  set centro_custo_id = C03, valor = 142.67
  where id = R_5037 and centro_custo_id = RAIZ;
  get diagnostics v_n = row_count;
  if v_n <> 1 then raise exception 'A 5037 nao virou a fatia da 03 (% linhas).', v_n; end if;

  -- As duas fatias novas COPIAM categoria e autor da linha original.
  insert into public.lancamento_rateios
    (lancamento_id, centro_custo_id, valor, categoria_id, created_by)
  values
    (v_lanc_5037, C04, 142.67, v_cat_5037, v_autor_5037),
    (v_lanc_5037, C05, 142.66, v_cat_5037, v_autor_5037);

  -- ---------- 4. linhas de controle ----------
  select coalesce(sum(r.valor),0) into v_sub_dep
  from public.lancamento_rateios r
  join public.centros_custo c on c.id = r.centro_custo_id
  where c.id = RAIZ or c.pai_id = RAIZ;

  select coalesce(sum(valor),0) into v_raiz_dep
  from public.lancamento_rateios where centro_custo_id = RAIZ;

  select jsonb_object_agg(coalesce(categoria_id::text,'sem'), soma) into v_cat_dep
  from (select categoria_id, sum(valor) as soma
        from public.lancamento_rateios
        where lancamento_id in (v_lanc_5037,
              (select lancamento_id from public.lancamento_rateios where id = R_6649))
        group by categoria_id) t;

  select jsonb_object_agg(tipo,total) into v_tipo_dep
  from (select tipo, sum(total) as total
        from public.fn_rel_dre('2020-01-01','2030-12-31') group by tipo) t;

  select coalesce(sum(valor),0) into v_c03_dep from public.lancamento_rateios where centro_custo_id = C03;
  select coalesce(sum(valor),0) into v_c04_dep from public.lancamento_rateios where centro_custo_id = C04;
  select coalesce(sum(valor),0) into v_c05_dep from public.lancamento_rateios where centro_custo_id = C05;

  select count(*) into v_div from (
    select l.id from public.lancamentos l
    join public.lancamento_rateios r on r.lancamento_id = l.id
    where l.status <> 'cancelado'
    group by l.id, l.valor
    having round(sum(r.valor),2) <> round(l.valor,2)) t;

  -- As que TEM que ficar iguais.
  if round(v_sub_antes - v_sub_dep, 2) <> 0 then
    raise exception 'A subarvore das Carretas mudou de R$ % para R$ %. O dinheiro devia so descer de nivel.',
      v_sub_antes, v_sub_dep;
  end if;
  if v_cat_antes <> v_cat_dep then
    raise exception 'A categoria do rateio mudou: % -> %.', v_cat_antes::text, v_cat_dep::text;
  end if;
  if v_tipo_antes <> v_tipo_dep then
    raise exception 'O DRE por tipo mudou: % -> %.', v_tipo_antes::text, v_tipo_dep::text;
  end if;
  if v_div > 0 then
    raise exception '% lancamento(s) com rateio que nao fecha com o valor.', v_div;
  end if;

  -- As que TEM que diferir, cada uma pelo valor exato.
  if v_raiz_dep <> 0 then
    raise exception 'Sobrou R$ % na raiz das Carretas.', v_raiz_dep;
  end if;
  if round(v_raiz_antes, 2) <> 638.00 then
    raise exception 'A raiz tinha R$ % em vez de 638,00 antes de mexer.', v_raiz_antes;
  end if;
  -- 210,00 da 6649 + 142,67 da fatia da 5037
  if round(v_c03_dep - v_c03_antes, 2) <> 352.67 then
    raise exception 'A carreta 03 subiu R$ % em vez de 352,67.', v_c03_dep - v_c03_antes;
  end if;
  if round(v_c04_dep - v_c04_antes, 2) <> 142.67 then
    raise exception 'A carreta 04 subiu R$ % em vez de 142,67.', v_c04_dep - v_c04_antes;
  end if;
  if round(v_c05_dep - v_c05_antes, 2) <> 142.66 then
    raise exception 'A carreta 05 subiu R$ % em vez de 142,66.', v_c05_dep - v_c05_antes;
  end if;

  raise notice 'OK: raiz das Carretas R$ % -> R$ 0,00. 03 +352,67 / 04 +142,67 / 05 +142,66.',
    v_raiz_antes;
end $aplica$;
