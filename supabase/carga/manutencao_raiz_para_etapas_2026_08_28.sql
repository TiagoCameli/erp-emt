-- Esvazia o que dava para esvaziar da raiz da Manutencao de Equipamentos.
--
-- Aplicado no banco em 28/08/2026.
--
-- ## O que estava errado
--
-- A raiz de "Manutencao/Documentacao de Equipamentos" tinha R$ 2.311.440,47 em
-- 1.087 lancamentos, apesar de as 60 etapas por equipamento existirem. Ou seja: o
-- custo de manutencao estava na pilha do centro, nao na maquina.
--
-- E dentro dessa pilha havia R$ 828.410,13 classificados como "Aquisicao de
-- Equipamento" -- compra de maquina lancada no centro de MANUTENCAO.
--
-- ## As tres coisas que este arquivo faz
--
-- 1. A ESCAVADEIRA. LAN-2026-3871, R$ 794.262,60, Noroeste, 14/10/2025, descricao
--    "COMPRA DE UMA ESCAVADEIRA HIDRAULICA". E aquisicao de verdade, no centro
--    errado. Vai para uma etapa propria em "Aquisicao de Equipamentos".
--
--    Qual escavadeira: a PC200 (EH-005). Nao e chute -- tres evidencias
--    independentes: (a) existe LAN-2026-5625 "SEGURO DA ESCAVADEIRA PC 200" de
--    24/09/2025, tres semanas ANTES desta compra, entao a PC200 ja era da EMT;
--    (b) a frota registra a EH-005 (Komatsu PC200) adquirida em 29/08/2025;
--    (c) a NOROESTE e a revendedora Komatsu (vendeu tambem a carregadeira WA150).
--    A unica outra candidata sem data, a EC55BPRO, e uma mini de 5,5 t da Volvo,
--    que nao custa R$ 794 mil nem vem de revenda Komatsu.
--
-- 2. TRES LANCAMENTOS COM A CATEGORIA ERRADA. Estavam como "Aquisicao de
--    Equipamento" mas sao peca e servico: modulo de transmissao do D6NXL
--    (R$ 22.000,00), dente e pino da PC200 (R$ 2.519,33) e pecas da revisao da
--    PC200 (R$ 1.128,20). Viram "Manutencao de equipamentos".
--
--    O quarto (LAN-2026-4560, R$ 8.500,00, "PAGAMENTO DO COMUNICADOR") fica como
--    esta: nao nomeia maquina nenhuma, e comprar um comunicador pode ser
--    aquisicao mesmo. E o unico "Aquisicao de Equipamento" que sobra na raiz.
--
-- 3. O LOTE. Manda para a etapa da maquina todo lancamento da raiz cuja descricao
--    nomeia UMA maquina so.
--
-- ## Como o lote identifica a maquina, e por que assim
--
-- A lista de identificadores sai do CADASTRO (os nomes das etapas), nao de um
-- padrao solto no texto. De cada nome saem os pedacos com letra E numero e pelo
-- menos 4 caracteres -- na pratica, placa e codigo de modelo. Fica so o que
-- aponta para UMA etapa: "320C" (3 escavadeiras), "416E" (2 retros) e "CP56"
-- (2 rolos) sao descartados por ambiguidade.
--
-- Os DOIS LADOS sao normalizados (sem espaco, sem hifen, maiuscula) antes de
-- comparar. Isso importa mais do que parece: sem normalizar, "MZO 8547" no texto
-- nao casava com o token "MZO-8547", e um lancamento que citava QUATRO caminhoes
-- casava com UM so -- e teria ido inteiro para o caminhao errado. Normalizando,
-- ele casa com os quatro e cai fora do automatico, que e o certo. O ganho foi de
-- 61 para 276 lancamentos casados, e 22 corretamente barrados por citarem mais de
-- uma maquina.
--
-- ## Os dois falsos positivos que a revisao pegou
--
-- Revisar match por match antes de aplicar nao e zelo, e necessidade -- estes dois
-- passariam por qualquer contagem:
--
--   L1620    "COMPRA DE PECAS PARA CAMINHAO MUCK L 1620" casava com o
--            "CAMINHAO BOIADEIRO/MIILHO - L1620", mas e do Munck: as DUAS
--            maquinas sao L 1620.
--   L131850  "MANUTENCAO DOS CAMINHOES: MUNCK L1318/50 - CACAMBA (109) -
--            CACAMBA (110)" casava com a "Caminhao Pipa L1318/50", e o texto fala
--            de tres caminhoes, nenhum deles a pipa.
--
-- Os dois tokens ficam de fora. Sao 8 lancamentos, R$ 12.648,98, que voltam para
-- a fila do Tiago decidir.
--
-- ## Um caso que passa de proposito
--
-- "PECAS MANUTENCAO PA CARREGADEIRA E BOBCAT MC110C" nomeia duas maquinas, mas so
-- o Bobcat tem identificador -- a pa aparece sem modelo. Vai inteiro para o
-- Bobcat. E imperfeito e ainda assim melhor que ficar na raiz, e o Tiago corrige
-- se quiser.
--
-- ## Movimento por UPDATE, nunca por DELETE+INSERT
--
-- O lote so troca `centro_custo_id`. Recriar linha perderia `categoria_id`, que e
-- outra dimensao do rateio -- foi exatamente assim que R$ 133.160,00 mudaram de
-- categoria no DRE algumas horas antes (ver
-- aquisicao_equipamentos_etapas_2026_08_28.sql).
--
-- ## Provado em transacao desfeita, e conferido depois
--
--   Manutencao raiz:      R$ 2.311.440,47 -> R$ 1.161.756,89  (1.087 -> 819 lanc.)
--   Manutencao subarvore: caiu EXATAMENTE R$ 794.262,60 (so a escavadeira saiu)
--   Aquisicao subarvore:  subiu EXATAMENTE R$ 794.262,60
--   DRE por tipo:         inalterado
--   rateio fora do valor: 0
--
-- ## O que continua na raiz, para o Tiago
--
-- R$ 1.161.756,89 em 819 lancamentos que nao nomeiam maquina -- dizem "HILUX",
-- "CACAMBA", "MANUTENCAO DE EQUIPAMENTOS" sem placa. Nenhum automatismo resolve
-- isso; precisa de quem sabe.

do $aplica$
declare
  MANUT uuid := 'fbd2556a-3e96-474b-818f-ff536a288dff';
  AQ    uuid := '65d9a77a-b70b-42ed-a0f1-3e6ca5905da1';
  CARRETAS uuid := 'a39e45c0-aea5-4d98-aebd-814616b8551c';
  v_sub_antes numeric; v_aq_antes numeric; v_sub_dep numeric; v_aq_dep numeric;
  v_movidos int; v_cat int; v_div int; v_tipo_antes jsonb; v_tipo_dep jsonb;
begin
  select coalesce(sum(r.valor),0) into v_sub_antes
  from public.lancamento_rateios r
  join public.lancamentos l on l.id=r.lancamento_id and l.status<>'cancelado'
  join public.centros_custo c on c.id=r.centro_custo_id
  where c.id=MANUT or c.pai_id=MANUT;

  select coalesce(sum(r.valor),0) into v_aq_antes
  from public.lancamento_rateios r
  join public.lancamentos l on l.id=r.lancamento_id and l.status<>'cancelado'
  join public.centros_custo c on c.id=r.centro_custo_id
  where c.id=AQ or c.pai_id=AQ;

  select jsonb_object_agg(tipo,total) into v_tipo_antes
  from (select tipo, sum(total) as total
        from public.fn_rel_dre('2020-01-01','2030-12-31') group by tipo) t;

  -- ---------- 1. a escavadeira vai para Aquisicao ----------
  insert into public.centros_custo (nome, nivel, pai_id)
  select 'Escavadeira PC200 - 05', 2, AQ
  where not exists (
    select 1 from public.centros_custo c
    where c.pai_id=AQ and c.nome='Escavadeira PC200 - 05'
  );

  update public.lancamento_rateios r
  set centro_custo_id = (
    select id from public.centros_custo where pai_id=AQ and nome='Escavadeira PC200 - 05'
  )
  from public.lancamentos l
  where l.id = r.lancamento_id and l.numero = 'LAN-2026-3871' and r.centro_custo_id = MANUT;

  -- ---------- 2. as tres categorias erradas ----------
  update public.lancamento_rateios r
  set categoria_id = (
    select id from public.categorias_financeiras where nome='Manutenção de equipamentos'
  )
  from public.lancamentos l
  where l.id = r.lancamento_id and r.centro_custo_id = MANUT
    and l.numero in ('LAN-2026-1091','LAN-2026-3717','LAN-2026-5065');
  get diagnostics v_cat = row_count;

  -- ---------- 3. o lote, por placa ou codigo de modelo ----------
  with tk as (
    select c.id, upper(regexp_replace(t.tok,'[^A-Za-z0-9]','','g')) as token
    from public.centros_custo c
    cross join lateral unnest(string_to_array(c.nome,' ')) as t(tok)
    where c.pai_id in (MANUT, CARRETAS)
  ),
  distintos as (
    select token, (array_agg(distinct id))[1] as etapa_id
    from tk
    where length(token) >= 4 and token ~ '[0-9]' and token ~ '[A-Z]'
      -- os dois falsos positivos provados na revisao
      and token not in ('L1620','L131850')
    group by token having count(distinct id) = 1
  ),
  alvo as (
    select r.id as rateio_id,
           upper(regexp_replace(l.descricao,'[^A-Za-z0-9]','','g')) as texto
    from public.lancamento_rateios r
    join public.lancamentos l on l.id=r.lancamento_id and l.status<>'cancelado'
    where r.centro_custo_id = MANUT
  ),
  casou as (
    select a.rateio_id, d.etapa_id
    from alvo a join distintos d on a.texto like '%'||d.token||'%'
  ),
  unico as (
    -- so quem nomeia UMA maquina. Dois ou mais = decisao humana.
    select rateio_id, (array_agg(distinct etapa_id))[1] as etapa_id
    from casou group by rateio_id having count(distinct etapa_id) = 1
  )
  update public.lancamento_rateios r
  set centro_custo_id = u.etapa_id
  from unico u where u.rateio_id = r.id;
  get diagnostics v_movidos = row_count;

  -- ---------- linhas de controle ----------
  select coalesce(sum(r.valor),0) into v_sub_dep
  from public.lancamento_rateios r
  join public.lancamentos l on l.id=r.lancamento_id and l.status<>'cancelado'
  join public.centros_custo c on c.id=r.centro_custo_id
  where c.id=MANUT or c.pai_id=MANUT;

  select coalesce(sum(r.valor),0) into v_aq_dep
  from public.lancamento_rateios r
  join public.lancamentos l on l.id=r.lancamento_id and l.status<>'cancelado'
  join public.centros_custo c on c.id=r.centro_custo_id
  where c.id=AQ or c.pai_id=AQ;

  select jsonb_object_agg(tipo,total) into v_tipo_dep
  from (select tipo, sum(total) as total
        from public.fn_rel_dre('2020-01-01','2030-12-31') group by tipo) t;

  select count(*) into v_div from (
    select l.id from public.lancamentos l
    join public.lancamento_rateios r on r.lancamento_id=l.id
    where l.status<>'cancelado' group by l.id,l.valor
    having round(sum(r.valor),2) <> round(l.valor,2)) t;

  if v_tipo_antes <> v_tipo_dep then
    raise exception 'O DRE por tipo mudou: % -> %.', v_tipo_antes::text, v_tipo_dep::text;
  end if;
  if v_div > 0 then
    raise exception '% lancamento(s) com rateio que nao fecha com o valor.', v_div;
  end if;
  -- A UNICA coisa que pode atravessar a fronteira entre os dois centros raiz e a
  -- escavadeira. Se atravessar outra coisa, algo no lote pegou o que nao devia.
  if round(v_aq_dep - v_aq_antes, 2) <> 794262.60 then
    raise exception 'Aquisicao subiu R$ % em vez de 794262.60.', v_aq_dep - v_aq_antes;
  end if;
  if round(v_sub_antes - v_sub_dep, 2) <> 794262.60 then
    raise exception 'Manutencao caiu R$ % em vez de 794262.60.', v_sub_antes - v_sub_dep;
  end if;

  raise notice 'OK: % rateios para a etapa da maquina, % categorias corrigidas.',
    v_movidos, v_cat;
end $aplica$;
