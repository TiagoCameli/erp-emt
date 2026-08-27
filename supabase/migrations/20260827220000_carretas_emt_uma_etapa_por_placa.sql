-- =============================================================
-- Carretas EMT: uma etapa por carreta, e o custo separado pela placa
-- =============================================================
-- PEDIDO DO TIAGO (27/08/2026): "no centro de custo carretas emt tem que ter 4
-- etapas uma para cada carreta da empresa, nas descricoes dos lancamentos voce
-- consegue diferenciar cada uma das carretas pela placa, crie uma etapa para cada
-- carreta e coloque os lancamentos de cada uma das carretas em suas respectivas
-- etapas, o que nao tiver certeza eu organizo depois."
--
-- ============================================================
-- AS 4 ETAPAS JÁ EXISTIAM — NO LUGAR ERRADO
-- ============================================================
-- Antes de criar qualquer coisa eu procurei as placas no cadastro, e as quatro
-- carretas já estavam lá como etapa: "Caminhão Cavalo XF 530 FTT SQS7E01 - 02",
-- "- SQU9C94 - 03", "- SQU9D04 - 04" e "- SQU9D14 - 05". Só que penduradas em
-- "Manutenção/Documentação de Equipamentos", porque nasceram pela trigger
-- `trg_equipamento_cria_etapa`, que põe todo equipamento novo lá.
--
-- Criar quatro etapas homônimas em Carretas EMT deixaria a MESMA carreta em dois
-- centros, e quem abrisse o filtro veria a placa duas vezes sem saber qual
-- escolher. Perguntei, e ele escolheu MOVER: cada carreta num lugar só. Então
-- estas quatro trocam de pai e levam junto os R$ 6.693,90 que já tinham de
-- manutenção — dinheiro que sai do relatório da Manutenção e passa a aparecer em
-- Carretas EMT. É uma consequência da escolha, não um efeito colateral: era o que
-- estava no desenho que ele aprovou.
--
-- A trigger só dispara em INSERT de equipamento, então ela não desfaz isto — mas
-- equipamento NOVO continua nascendo sob a manutenção, que é o comportamento certo
-- para o resto da frota.
--
-- ============================================================
-- COMO A PLACA FOI LIDA
-- ============================================================
-- Por LISTA FIXA das quatro placas, e não por padrão de placa. Rodei uma varredura
-- com `[A-Z]{3}[0-9][0-9A-Z][0-9]{2}` nas descrições antes de escrever isto, e ela
-- trouxe cinco fantasmas junto das quatro reais: "CICLISTA 4000" virou STA4000,
-- "BASCULHANTE D 2E 9351" virou TED2E93, "ENVOLVENTE 2005" virou NTE2005. Uma
-- regex solta aqui atribuiria custo a uma carreta que não existe.
--
-- A comparação ignora espaço (`SQS 7E01` e `SQS7E01` são a mesma placa) e conta
-- quantas das quatro aparecem em cada descrição:
--
--   UMA placa .......... 29 rateios, R$ 95.376,08 -> vão para a etapa dela
--   TRÊS placas ........ 1 lançamento com 3 rateios IGUAIS de R$ 4.989,62
--                        ("6 CHAPA PLASTICA LAMINADA ... SQU 9C94 / SQU 9D04 E
--                        SQU 9D14"): seis chapas, três caminhões, três partes
--                        iguais. Um rateio para cada placa — o conjunto é certo,
--                        e como as três partes são idênticas a ordem não muda
--                        nada.
--   NENHUMA placa ...... 17 rateios, R$ 6.261.403,56 -> FICAM NA RAIZ
--
-- Os R$ 6,26 milhões que ficam são a compra da frota (dois contratos de carreta e
-- implementos, R$ 3,2 mi e R$ 1,1 mi), o seguro do conjunto, os implementos "das
-- 03 carretas" e as viagens para buscá-las. Nenhum deles diz de qual carreta é, e
-- ele foi explícito: o que não tiver certeza ele organiza depois. Chutar aqui
-- seria pior que deixar na raiz, porque na raiz a falta de recorte é VISÍVEL.
--
-- ============================================================
-- O QUE NÃO MUDA
-- ============================================================
-- Nenhum valor de rateio é tocado — só a coluna `centro_custo_id`. A soma por
-- lançamento continua a mesma, então a constraint trigger `trg_valida_soma_do_rateio`
-- passa, e o total geral do custo por centro de custo não se move: as provas (a) e
-- (b) abaixo travam exatamente isso.

do $carretas$
declare
  v_carretas uuid := 'a39e45c0-aea5-4d98-aebd-814616b8551c'; -- 001 - Carretas EMT
  v_manut    uuid := 'fbd2556a-3e96-474b-818f-ff536a288dff'; -- Manutenção/Documentação de Equipamentos
  e_7e01 uuid := 'af45def4-f5c9-4713-be2c-05ebd6b150d2';
  e_9c94 uuid := 'f41ceac0-89a2-4330-ab8a-0111ed55aaee';
  e_9d04 uuid := '8301d9f6-911e-42b8-af64-072d86266c9d';
  e_9d14 uuid := '728cb732-113c-4f39-a5db-a287abae20fe';
  v_car_antes numeric; v_man_antes numeric; v_geral_antes numeric;
  v_car_dep numeric;   v_man_dep numeric;   v_geral_dep numeric;
  v_n int; v_sobra_n int; v_sobra numeric; v_etapas numeric; v_veio numeric;
begin
  -- As fotografias de ANTES, para as provas compararem RELAÇÕES em vez de números
  -- que eu tenha medido meia hora atrás: esta base recebe lançamento o dia inteiro.
  select coalesce(round(sum(r.valor),2),0) into v_car_antes
  from public.lancamento_rateios r join public.lancamentos l on l.id=r.lancamento_id
  where r.centro_custo_id in (select id from public.fn_centro_custo_subarvore(v_carretas))
    and l.tipo='a_pagar' and l.status<>'cancelado';

  select coalesce(round(sum(r.valor),2),0) into v_man_antes
  from public.lancamento_rateios r join public.lancamentos l on l.id=r.lancamento_id
  where r.centro_custo_id in (select id from public.fn_centro_custo_subarvore(v_manut))
    and l.tipo='a_pagar' and l.status<>'cancelado';

  select coalesce(round(sum(r.valor),2),0) into v_geral_antes
  from public.lancamento_rateios r join public.lancamentos l on l.id=r.lancamento_id
  where l.tipo='a_pagar' and l.status<>'cancelado';

  -- Guarda de cadastro: se as quatro etapas não estiverem onde eu li, alguém já
  -- mexeu nelas e o resto desta migration deixou de fazer sentido.
  select count(*) into v_n from public.centros_custo
  where id in (e_7e01,e_9c94,e_9d04,e_9d14) and pai_id = v_manut and nivel = 2 and ativo;
  if v_n <> 4 then
    raise exception 'Esperava as 4 carretas ativas sob a manutencao e achei %.', v_n;
  end if;

  -- ---------------------------------------------------------------
  -- 1. As quatro carretas trocam de pai
  -- ---------------------------------------------------------------
  update public.centros_custo set pai_id = v_carretas
  where id in (e_7e01, e_9c94, e_9d04, e_9d14);
  get diagnostics v_n = row_count;
  if v_n <> 4 then raise exception 'Movi % etapas e esperava 4.', v_n; end if;

  -- ---------------------------------------------------------------
  -- 2. Rateio cuja descrição cita UMA das quatro placas
  -- ---------------------------------------------------------------
  with alvo as (
    select r.id,
      case when upper(replace(l.descricao,' ','')) like '%SQS7E01%' then e_7e01
           when upper(replace(l.descricao,' ','')) like '%SQU9C94%' then e_9c94
           when upper(replace(l.descricao,' ','')) like '%SQU9D04%' then e_9d04
           else e_9d14 end as destino
    from public.lancamento_rateios r join public.lancamentos l on l.id=r.lancamento_id
    where r.centro_custo_id = v_carretas
      and (upper(replace(l.descricao,' ','')) like '%SQS7E01%')::int
        + (upper(replace(l.descricao,' ','')) like '%SQU9C94%')::int
        + (upper(replace(l.descricao,' ','')) like '%SQU9D04%')::int
        + (upper(replace(l.descricao,' ','')) like '%SQU9D14%')::int = 1
  )
  update public.lancamento_rateios r set centro_custo_id = a.destino
  from alvo a where a.id = r.id;
  get diagnostics v_n = row_count;
  if v_n <> 29 then raise exception 'Movi % rateios de placa unica e esperava 29.', v_n; end if;

  -- ---------------------------------------------------------------
  -- 3. As seis chapas: três rateios iguais, uma placa cada
  -- ---------------------------------------------------------------
  with tres as (
    select r.id, row_number() over (order by r.id) as n
    from public.lancamento_rateios r join public.lancamentos l on l.id=r.lancamento_id
    where r.centro_custo_id = v_carretas
      and upper(replace(l.descricao,' ','')) like '%SQU9C94%'
      and upper(replace(l.descricao,' ','')) like '%SQU9D04%'
      and upper(replace(l.descricao,' ','')) like '%SQU9D14%'
  )
  update public.lancamento_rateios r
  set centro_custo_id = case t.n when 1 then e_9c94 when 2 then e_9d04 else e_9d14 end
  from tres t where t.id = r.id;
  get diagnostics v_n = row_count;
  if v_n <> 3 then raise exception 'Movi % rateios do lancamento das chapas e esperava 3.', v_n; end if;

  -- ---------------------------------------------------------------
  -- PROVAS, que abortam o apply se falharem
  -- ---------------------------------------------------------------
  select coalesce(round(sum(r.valor),2),0) into v_car_dep
  from public.lancamento_rateios r join public.lancamentos l on l.id=r.lancamento_id
  where r.centro_custo_id in (select id from public.fn_centro_custo_subarvore(v_carretas))
    and l.tipo='a_pagar' and l.status<>'cancelado';
  select coalesce(round(sum(r.valor),2),0) into v_man_dep
  from public.lancamento_rateios r join public.lancamentos l on l.id=r.lancamento_id
  where r.centro_custo_id in (select id from public.fn_centro_custo_subarvore(v_manut))
    and l.tipo='a_pagar' and l.status<>'cancelado';
  select coalesce(round(sum(r.valor),2),0) into v_geral_dep
  from public.lancamento_rateios r join public.lancamentos l on l.id=r.lancamento_id
  where l.tipo='a_pagar' and l.status<>'cancelado';

  -- (a) LINHA DE CONTROLE. O dinheiro só trocou de lugar dentro da árvore, então o
  --     total geral do custo NÃO pode se mover. Se um UPDATE tivesse duplicado ou
  --     perdido rateio, é aqui que apareceria.
  if v_geral_antes <> v_geral_dep then
    raise exception 'O total geral mudou: R$ % -> R$ %.',
      to_char(v_geral_antes,'FM999999999990.00'), to_char(v_geral_dep,'FM999999999990.00');
  end if;

  -- (b) O que Carretas ganhou é EXATAMENTE o que a Manutenção perdeu. Reatribuir
  --     rateio dentro da subárvore de Carretas não mexe em nenhuma das duas somas;
  --     a única coisa que as move é a mudança de pai das quatro etapas.
  v_veio := v_car_dep - v_car_antes;
  if v_veio <> (v_man_antes - v_man_dep) then
    raise exception 'Carretas ganhou R$ % e a manutencao perdeu R$ %.',
      to_char(v_veio,'FM999999999990.00'),
      to_char(v_man_antes - v_man_dep,'FM999999999990.00');
  end if;

  -- (c) A PROVA QUE TEM DE DAR DIFERENTE DE ZERO. Sem ela, (a) e (b) passariam
  --     intactas num apply que não moveu etapa nenhuma.
  if v_veio <= 0 then
    raise exception 'A mudanca de pai nao trouxe dinheiro nenhum (R$ %).',
      to_char(v_veio,'FM999999999990.00');
  end if;

  -- (d) A raiz fica só com o que não tem placa, e as quatro etapas ficam com o
  --     resto. As duas parcelas TÊM de fechar a subárvore inteira.
  select count(*), coalesce(round(sum(r.valor),2),0) into v_sobra_n, v_sobra
  from public.lancamento_rateios r join public.lancamentos l on l.id=r.lancamento_id
  where r.centro_custo_id = v_carretas and l.tipo='a_pagar' and l.status<>'cancelado';
  select coalesce(round(sum(r.valor),2),0) into v_etapas
  from public.lancamento_rateios r join public.lancamentos l on l.id=r.lancamento_id
  where r.centro_custo_id in (e_7e01,e_9c94,e_9d04,e_9d14)
    and l.tipo='a_pagar' and l.status<>'cancelado';
  if v_sobra + v_etapas <> v_car_dep then
    raise exception 'Raiz R$ % + etapas R$ % nao fecham a subarvore R$ %.',
      to_char(v_sobra,'FM999999999990.00'), to_char(v_etapas,'FM999999999990.00'),
      to_char(v_car_dep,'FM999999999990.00');
  end if;
  if v_sobra_n <> 17 then
    raise exception 'Sobraram % rateios sem placa na raiz e eu contei 17.', v_sobra_n;
  end if;

  -- (e) Nenhuma das quatro etapas pode ter ficado vazia: se uma placa não tivesse
  --     casado com nada, o recorte dela seria uma linha de zero na tela.
  select count(*) into v_n
  from (select r.centro_custo_id
        from public.lancamento_rateios r
        where r.centro_custo_id in (e_7e01,e_9c94,e_9d04,e_9d14)
        group by 1) t;
  if v_n <> 4 then
    raise exception 'Só % das 4 carretas ficaram com rateio.', v_n;
  end if;

  raise notice E'Carretas EMT tem 4 etapas por placa.\n  raiz (sem placa): % rateios, R$ %\n  4 carretas: R$ %\n  veio da manutencao: R$ %\n  total geral intacto: R$ %',
    v_sobra_n, to_char(v_sobra,'FM999999999990.00'), to_char(v_etapas,'FM999999999990.00'),
    to_char(v_veio,'FM999999999990.00'), to_char(v_geral_dep,'FM999999999990.00');
end $carretas$;
