-- Quebra "Aquisicao de Equipamentos" em uma etapa por equipamento.
--
-- Aplicado no banco em 28/08/2026.
--
-- ## O que estava errado
--
-- O centro raiz "Aquisicao de Equipamentos" tinha 26 lancamentos e
-- R$ 5.322.242,89 empilhados NA RAIZ, sem etapa nenhuma. Nao dava para saber
-- quanto custou cada maquina: o relatorio de custo por centro mostrava uma linha
-- so, de R$ 5,3 milhoes.
--
-- ## Como cada lancamento foi identificado
--
-- O Tiago mandou as NFs da Vectra Engenharia, e elas fecharam DOIS lancamentos
-- ao centavo, pelo chassi e pela serie:
--
--   LAN-2026-4252  R$ 700.000,00 "COMPRA DE 2 ROLOS COMPACTORES"
--     = NF 19814  R$ 332.000,00  Rolo CB10, serie CAT0CB10L5B400127  -> RC-001
--     + NF 19815  R$ 368.000,00  Rolo Pneu CW34, serie CAT0CW34A3G400232 -> RP-001
--
--   LAN-2026-5233  R$ 1.110.000,00 "COMPRA DE MAQUINAS PARA EMT"
--     = NF 19820  R$ 242.000,00  Mercedes Atego, chassi 9BM958156LB165609 -> CE-001
--     + NF 19820  R$ 140.000,00  Espargidor EHR-600H, placa QXN7424      -> CE-002
--     + NF 19821  R$ 728.000,00  Vibro Acabadora Ciber AF4500, serie CP450022 -> VB-001
--
-- As series batem uma a uma com o relatorio de frota. O resto veio da descricao
-- do lancamento, e o que a descricao nao resolvia o Tiago respondeu:
--
--   * LAN-2026-0224 (R$ 134.400,00, descricao so "PAGAMENTO") -> Komatsu WA 150-6
--   * LAN-2026-5099 (R$ 58.666,68, "CARRO HILUX")             -> Hilux QWQ-1D76 - 05
--   * LAN-2026-0396 + frete                                   -> Bobcat S450 - 02
--   * As duas Saveiros de valor identico: uma para cada (doc 283305 -> QWQ2I35,
--     doc 283308 -> QWQ2I65). Se a associacao doc<->placa estiver invertida, o
--     total por equipamento continua certo.
--
-- ## Decisoes do Tiago
--
-- 1. Tratores que NAO estao na frota ganham etapa mesmo assim, sem cadastrar
--    equipamento: "Trator TR6115J" (R$ 470.000,00) e "Trator John Deere 5090E"
--    (R$ 1.007.313,53, as tres cotas do consorcio Randon mais a adesao). Quando
--    as maquinas chegarem, a etapa ja existe esperando.
-- 2. Frete, seguro E viagem entram no custo do equipamento. Os que nomeiam a
--    maquina foram direto (frete do Bobcat, seguro do DAF). Os dois fretes
--    fluviais Manaus->Porto Velho e os tres reembolsos de viagem, que nao nomeiam
--    nada, foram rateados entre as cinco maquinas da Vectra na proporcao do valor
--    de cada uma -- R$ 39.490,08 distribuidos, somando exato.
--
-- ## O que ficou por conta do rateio, e nao da nota
--
-- LAN-2026-5876 (R$ 132.500,00, "1 ROLL ON ROLL OFF e 01 PLATAFORMA ROLL ON") foi
-- dividido MEIO A MEIO entre IMP-004 e IMP-005, porque a nota desse nao veio. Se
-- os precos forem diferentes, e so ajustar as duas linhas de rateio.
--
-- ## As etapas nascem SEM equipamento_id, de proposito
--
-- Cada uma dessas maquinas ja tem uma etapa em "Manutencao/Documentacao de
-- Equipamentos", criada pela trigger, e ESSA carrega o equipamento_id. Repetir o
-- vinculo aqui quebraria o 1:1 que o resto do sistema assume, e a tela de centro
-- de custo bloqueia editar no que tem equipamento amarrado -- o que impediria o
-- Tiago de renomear estes baldes depois.
--
-- ## Provado antes de aplicar, em transacao desfeita
--
--   raiz:      R$ 5.322.242,89 -> R$ 0,00
--   subarvore: R$ 5.322.242,89 (identica: nada sumiu nem apareceu)
--   lancamentos cujo rateio nao fecha com o valor: 0
--
-- As mesmas tres conferencias rodam no fim deste arquivo e ABORTAM se falharem.

do $aplica$
declare
  AQ uuid := '65d9a77a-b70b-42ed-a0f1-3e6ca5905da1';  -- Aquisicao de Equipamentos
  v_antes numeric; v_raiz numeric; v_sub numeric; v_div int; v_etapas int;
begin
  select coalesce(sum(r.valor),0) into v_antes
  from public.lancamento_rateios r
  join public.lancamentos l on l.id = r.lancamento_id
  where r.centro_custo_id = AQ and l.status <> 'cancelado';

  -- ---------- 1. as 15 etapas ----------
  insert into public.centros_custo (nome, nivel, pai_id)
  select v.nome, 2, AQ
  from (values
    ('Caminhão DAF - Nissey CF - 310'),('Pá Carregadeira Komatsu 150'),
    ('Rolo Chapa CB10 - 01'),('Rolo de Pneu CW34 - 01'),
    ('Caminhão Espargidor - 01'),('Espargidor QWN-7424'),
    ('Vibro Acabadora AF4500 - 01'),
    ('SAVEIRO CS RB MF QWQ2I35 - 09'),('SAVEIRO CS RB MF QWQ2I65 - 08'),
    ('Hilux CDSRVA4FD QWQ-1D76 - 05'),('Bobcat S450 - 02'),
    ('SISTEMA DE TRANSPORTE ROLL-ON/ROLL-OFF BASCULANTE'),
    ('PLATAFORMA ROLL ON - ROLL OFF 6.50 M - CARROCERIA ABERTA'),
    ('Trator TR6115J'),('Trator John Deere 5090E')
  ) v(nome)
  where not exists (
    select 1 from public.centros_custo c where c.pai_id = AQ and c.nome = v.nome
  );

  -- ---------- 2. os 18 que vao inteiros para uma etapa ----------
  update public.lancamento_rateios r
  set centro_custo_id = e.id
  from public.lancamentos l, (values
    ('LAN-2026-1026','Caminhão DAF - Nissey CF - 310'),   -- financiamento PACCAR
    ('LAN-2026-4839','Caminhão DAF - Nissey CF - 310'),   -- compra Nissey
    ('LAN-2026-5955','Caminhão DAF - Nissey CF - 310'),   -- seguro Bradesco
    ('LAN-2026-0871','Pá Carregadeira Komatsu 150'),      -- Banco Komatsu
    ('LAN-2026-5217','Pá Carregadeira Komatsu 150'),      -- Noroeste
    ('LAN-2026-0224','Pá Carregadeira Komatsu 150'),      -- "PAGAMENTO", Noroeste
    ('LAN-2026-4282','SAVEIRO CS RB MF QWQ2I35 - 09'),    -- doc 283305
    ('LAN-2026-3300','SAVEIRO CS RB MF QWQ2I65 - 08'),    -- doc 283308
    ('LAN-2026-5099','Hilux CDSRVA4FD QWQ-1D76 - 05'),
    ('LAN-2026-0396','Bobcat S450 - 02'),
    ('LAN-2026-0484','Bobcat S450 - 02'),                 -- frete PVH -> CZS
    ('LAN-2026-0233','SISTEMA DE TRANSPORTE ROLL-ON/ROLL-OFF BASCULANTE'),
    ('LAN-2026-0027','PLATAFORMA ROLL ON - ROLL OFF 6.50 M - CARROCERIA ABERTA'),
    ('LAN-2026-0053','Trator TR6115J'),
    ('LAN-2026-1532','Trator John Deere 5090E'),          -- cota 130-0
    ('LAN-2026-1639','Trator John Deere 5090E'),          -- cota 160-0
    ('LAN-2026-3649','Trator John Deere 5090E'),          -- cota 187-0
    ('LAN-2026-4016','Trator John Deere 5090E')           -- adesao das 3 cotas
  ) m(numero, etapa)
  join public.centros_custo e on e.pai_id = AQ and e.nome = m.etapa
  where l.id = r.lancamento_id and l.numero = m.numero and r.centro_custo_id = AQ;

  -- ---------- 3. os 3 que cobrem mais de um equipamento ----------
  delete from public.lancamento_rateios r
  using public.lancamentos l
  where l.id = r.lancamento_id and r.centro_custo_id = AQ
    and l.numero in ('LAN-2026-4252','LAN-2026-5233','LAN-2026-5876');

  insert into public.lancamento_rateios (lancamento_id, centro_custo_id, valor)
  select l.id, e.id, v.valor
  from (values
    ('LAN-2026-4252','Rolo Chapa CB10 - 01', 332000.00),          -- NF 19814
    ('LAN-2026-4252','Rolo de Pneu CW34 - 01', 368000.00),        -- NF 19815
    ('LAN-2026-5233','Caminhão Espargidor - 01', 242000.00),      -- NF 19820 item 1
    ('LAN-2026-5233','Espargidor QWN-7424', 140000.00),           -- NF 19820 item 2
    ('LAN-2026-5233','Vibro Acabadora AF4500 - 01', 728000.00),   -- NF 19821
    -- Meio a meio: a nota deste nao veio. Ajustar se os precos diferirem.
    ('LAN-2026-5876','SISTEMA DE TRANSPORTE ROLL-ON/ROLL-OFF BASCULANTE', 66250.00),
    ('LAN-2026-5876','PLATAFORMA ROLL ON - ROLL OFF 6.50 M - CARROCERIA ABERTA', 66250.00)
  ) v(numero, etapa, valor)
  join public.lancamentos l on l.numero = v.numero
  join public.centros_custo e on e.pai_id = AQ and e.nome = v.etapa;

  -- ---------- 4. fretes genericos e viagens, rateados pela Vectra ----------
  -- A sobra do arredondamento vai para a maior parte, senao a soma do rateio
  -- deixa de fechar com o valor do lancamento por centavos.
  with base as (
    select e.id as etapa_id, v.peso
    from (values
      ('Rolo Chapa CB10 - 01', 332000.00),('Rolo de Pneu CW34 - 01', 368000.00),
      ('Caminhão Espargidor - 01', 242000.00),('Espargidor QWN-7424', 140000.00),
      ('Vibro Acabadora AF4500 - 01', 728000.00)
    ) v(etapa, peso)
    join public.centros_custo e on e.pai_id = AQ and e.nome = v.etapa
  ),
  total as (select sum(peso) as t from base),
  alvo as (
    select l.id as lanc_id, r.valor
    from public.lancamento_rateios r
    join public.lancamentos l on l.id = r.lancamento_id
    where r.centro_custo_id = AQ
      and l.numero in ('LAN-2026-5631','LAN-2026-1324',   -- fretes fluviais
                       'LAN-2026-5155','LAN-2026-2257','LAN-2026-4889')  -- viagens
  ),
  partes as (
    select a.lanc_id, b.etapa_id, round(a.valor * b.peso / t.t, 2) as parte,
           row_number() over (partition by a.lanc_id order by b.peso desc, b.etapa_id) as ordem,
           a.valor
    from alvo a cross join total t join base b on true
  ),
  sobra as (select lanc_id, valor - sum(parte) as resto from partes group by lanc_id, valor),
  apagadas as (
    delete from public.lancamento_rateios r using alvo a
    where r.lancamento_id = a.lanc_id and r.centro_custo_id = AQ returning r.id
  )
  insert into public.lancamento_rateios (lancamento_id, centro_custo_id, valor)
  select p.lanc_id, p.etapa_id, p.parte + case when p.ordem = 1 then s.resto else 0 end
  from partes p join sobra s on s.lanc_id = p.lanc_id
  where p.parte <> 0 or p.ordem = 1;

  -- ---------- linhas de controle ----------
  select coalesce(sum(r.valor),0) into v_raiz
  from public.lancamento_rateios r
  join public.lancamentos l on l.id = r.lancamento_id
  where r.centro_custo_id = AQ and l.status <> 'cancelado';

  select coalesce(sum(r.valor),0) into v_sub
  from public.lancamento_rateios r
  join public.lancamentos l on l.id = r.lancamento_id
  join public.centros_custo c on c.id = r.centro_custo_id
  where (c.id = AQ or c.pai_id = AQ) and l.status <> 'cancelado';

  select count(*) into v_div from (
    select l.id from public.lancamentos l
    join public.lancamento_rateios r on r.lancamento_id = l.id
    where l.status <> 'cancelado'
    group by l.id, l.valor
    having round(sum(r.valor),2) <> round(l.valor,2)) t;

  select count(*) into v_etapas from public.centros_custo where pai_id = AQ;

  if v_raiz <> 0 then
    raise exception 'Sobrou R$ % na raiz de Aquisicao de Equipamentos.', v_raiz;
  end if;
  if v_sub <> v_antes then
    raise exception 'A subarvore soma R$ % e antes eram R$ %. Dinheiro sumiu ou apareceu.', v_sub, v_antes;
  end if;
  if v_div > 0 then
    raise exception '% lancamento(s) com rateio que nao fecha com o valor.', v_div;
  end if;

  raise notice 'OK: % etapas, raiz zerada, subarvore R$ %.', v_etapas, v_sub;
end $aplica$;
