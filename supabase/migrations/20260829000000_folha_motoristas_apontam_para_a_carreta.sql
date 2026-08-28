-- =============================================================
-- Folha: os quatro motoristas de carreta apontam para a carreta deles
-- =============================================================
-- PEDIDO DO TIAGO (28/08/2026): "ajuste a folha mas nao aprove ela ainda"
--
-- A folha de agosto/2026 está em RASCUNHO com os quatro motoristas de carreta
-- apontando para a RAIZ "001 - Carretas EMT". Aprovada assim, ela geraria
-- R$ 20.245,69 de custo na raiz que acabou de ser esvaziada, sem separação por
-- carreta — desfazendo em um clique o que seis migrations arrumaram.
--
-- ESTA MIGRATION NÃO APROVA NADA. Ela só troca o centro de custo. O status da
-- folha continua `rascunho`, e há uma prova que aborta o apply se ele mudar.
--
-- ============================================================
-- SÃO DOIS CAMPOS, E MEXER EM UM SÓ NÃO RESOLVE
-- ============================================================
-- `folha_itens.centro_custo_id` é o que vale para a folha que JÁ existe. Mas ele
-- nasce copiado de `colaboradores.centro_custo_id` — a `fn_gerar_folha` lê o
-- centro do colaborador ao montar cada item. Se eu corrigisse só o item, bastaria
-- alguém regerar a folha de agosto para tudo voltar à raiz, e a folha de setembro
-- nasceria errada de novo.
--
-- Então os dois mudam:
--   colaboradores.centro_custo_id .... conserta o futuro (e a regeração)
--   folha_itens.centro_custo_id ...... conserta a folha de agosto que já existe
--
-- ============================================================
-- QUEM VAI PARA ONDE
-- ============================================================
--   FRANCISCO FREIRE MAGALHÃES NETO ... SQS 7E01
--   JACSON LIMA FAGUNDES ............... SQU 9C94
--   MICHARLE ROCHA DA SILVA ............ SQU 9D04
--   ROSILDO DE SOUZA MENEZES ........... SQU 9D14
--
-- É o mesmo pareamento das migrations 20260828210000 e 20260828230000, que moveram
-- o salário histórico deles. O Ederson não entra: saiu da empresa em 05/2026 e não
-- está nesta folha.
--
-- ============================================================
-- O CENTRO DO COLABORADOR PASSA A SER UMA ETAPA
-- ============================================================
-- Até aqui os quatro apontavam para um centro RAIZ. Nada no banco exige raiz — o
-- campo é uma FK livre para `centros_custo` — e o custo de mão de obra por
-- equipamento é justamente o que ele quis desde o primeiro pedido. Vale saber, no
-- entanto, que se a tela de cadastro de colaborador só oferecer raiz no seletor,
-- editar esses quatro pela tela vai devolvê-los para "001 - Carretas EMT" sem
-- avisar. Se isso acontecer, o seletor de lá precisa da mesma escada de raiz e
-- etapa que os relatórios ganharam em 27/08.

do $folha$
declare
  e_7e01 uuid := 'af45def4-f5c9-4713-be2c-05ebd6b150d2';
  e_9c94 uuid := 'f41ceac0-89a2-4330-ab8a-0111ed55aaee';
  e_9d04 uuid := '8301d9f6-911e-42b8-af64-072d86266c9d';
  e_9d14 uuid := '728cb732-113c-4f39-a5db-a287abae20fe';
  v_carretas uuid := 'a39e45c0-aea5-4d98-aebd-814616b8551c';
  v_status_antes text; v_status_dep text;
  v_lanc_antes int; v_lanc_dep int;
  v_geral_antes numeric; v_geral_dep numeric;
  v_n int;
begin
  -- Fotografias do que NÃO pode mudar.
  select f.status into v_status_antes
  from public.folhas f where f.competencia = date '2026-08-01';
  if v_status_antes is null then
    raise exception 'Nao achei a folha de 08/2026.';
  end if;
  if v_status_antes <> 'rascunho' then
    raise exception 'A folha de 08/2026 esta em "%" e eu esperava rascunho.', v_status_antes;
  end if;

  select count(fi.lancamento_id) into v_lanc_antes
  from public.folha_itens fi join public.folhas f on f.id = fi.folha_id
  where f.competencia = date '2026-08-01';

  select coalesce(round(sum(r.valor),2),0) into v_geral_antes
  from public.lancamento_rateios r join public.lancamentos l on l.id=r.lancamento_id
  where l.tipo='a_pagar' and l.status<>'cancelado';

  -- ---------------------------------------------------------------
  -- 1. O cadastro do colaborador: conserta o futuro e a regeração
  -- ---------------------------------------------------------------
  update public.colaboradores col
  set centro_custo_id = case col.nome
        when 'FRANCISCO FREIRE MAGALHÃES NETO' then e_7e01
        when 'JACSON LIMA FAGUNDES'            then e_9c94
        when 'MICHARLE ROCHA DA SILVA'         then e_9d04
        when 'ROSILDO DE SOUZA MENEZES'        then e_9d14
      end
  where col.nome in ('FRANCISCO FREIRE MAGALHÃES NETO','JACSON LIMA FAGUNDES',
                     'MICHARLE ROCHA DA SILVA','ROSILDO DE SOUZA MENEZES')
    and col.centro_custo_id = v_carretas;
  get diagnostics v_n = row_count;
  if v_n <> 4 then
    raise exception 'Atualizei % colaboradores e esperava 4.', v_n;
  end if;

  -- ---------------------------------------------------------------
  -- 2. Os itens da folha de agosto, que já estavam gerados
  -- ---------------------------------------------------------------
  update public.folha_itens fi
  set centro_custo_id = col.centro_custo_id
  from public.colaboradores col, public.folhas f
  where col.id = fi.colaborador_id
    and f.id = fi.folha_id
    and f.competencia = date '2026-08-01'
    and col.nome in ('FRANCISCO FREIRE MAGALHÃES NETO','JACSON LIMA FAGUNDES',
                     'MICHARLE ROCHA DA SILVA','ROSILDO DE SOUZA MENEZES');
  get diagnostics v_n = row_count;
  if v_n <> 4 then
    raise exception 'Atualizei % itens de folha e esperava 4.', v_n;
  end if;

  -- ---------------------------------------------------------------
  -- PROVAS
  -- ---------------------------------------------------------------
  -- (a) A FOLHA NÃO FOI APROVADA. É o que ele pediu explicitamente, e é a única
  --     prova aqui que não é sobre centro de custo.
  select f.status into v_status_dep
  from public.folhas f where f.competencia = date '2026-08-01';
  if v_status_dep <> 'rascunho' then
    raise exception 'A folha saiu de rascunho para "%".', v_status_dep;
  end if;

  -- (b) E não gerou lançamento nenhum: aprovar é o que cria o lançamento, e
  --     ninguém aprovou.
  select count(fi.lancamento_id) into v_lanc_dep
  from public.folha_itens fi join public.folhas f on f.id = fi.folha_id
  where f.competencia = date '2026-08-01';
  if v_lanc_dep <> v_lanc_antes or v_lanc_dep <> 0 then
    raise exception 'A folha passou a ter % itens com lancamento (antes %).',
      v_lanc_dep, v_lanc_antes;
  end if;

  -- (c) LINHA DE CONTROLE do app: o custo não se move. Folha em rascunho não vira
  --     lançamento, então mexer nela não pode mudar número de relatório nenhum.
  select coalesce(round(sum(r.valor),2),0) into v_geral_dep
  from public.lancamento_rateios r join public.lancamentos l on l.id=r.lancamento_id
  where l.tipo='a_pagar' and l.status<>'cancelado';
  if v_geral_antes <> v_geral_dep then
    raise exception 'O total geral do custo mudou: R$ % -> R$ %.',
      to_char(v_geral_antes,'FM999999999990.00'), to_char(v_geral_dep,'FM999999999990.00');
  end if;

  -- (d) Os quatro estão em QUATRO carretas diferentes, uma cada. Um `case` com
  --     nome errado cairia em null ou repetiria destino, e é aqui que apareceria.
  select count(distinct col.centro_custo_id) into v_n
  from public.colaboradores col
  where col.nome in ('FRANCISCO FREIRE MAGALHÃES NETO','JACSON LIMA FAGUNDES',
                     'MICHARLE ROCHA DA SILVA','ROSILDO DE SOUZA MENEZES');
  if v_n <> 4 then
    raise exception 'Os quatro motoristas ficaram em % centros distintos.', v_n;
  end if;

  -- (e) E nenhum deles ficou na raiz, nem com centro nulo.
  select count(*) into v_n
  from public.colaboradores col
  where col.nome in ('FRANCISCO FREIRE MAGALHÃES NETO','JACSON LIMA FAGUNDES',
                     'MICHARLE ROCHA DA SILVA','ROSILDO DE SOUZA MENEZES')
    and (col.centro_custo_id is null or col.centro_custo_id = v_carretas);
  if v_n <> 0 then
    raise exception '% motoristas continuam na raiz ou sem centro.', v_n;
  end if;

  -- (f) O item da folha tem de espelhar o cadastro: se os dois divergirem, uma
  --     regeração muda o número sem ninguém pedir.
  select count(*) into v_n
  from public.folha_itens fi
  join public.colaboradores col on col.id = fi.colaborador_id
  join public.folhas f on f.id = fi.folha_id
  where f.competencia = date '2026-08-01'
    and col.nome in ('FRANCISCO FREIRE MAGALHÃES NETO','JACSON LIMA FAGUNDES',
                     'MICHARLE ROCHA DA SILVA','ROSILDO DE SOUZA MENEZES')
    and fi.centro_custo_id is distinct from col.centro_custo_id;
  if v_n <> 0 then
    raise exception '% itens da folha divergem do cadastro do colaborador.', v_n;
  end if;

  raise notice 'Folha de 08/2026 ajustada e AINDA EM RASCUNHO: 4 motoristas nas carretas deles, 0 lancamentos gerados.';
end $folha$;
