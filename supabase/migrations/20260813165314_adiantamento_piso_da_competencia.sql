-- Aplicada em produção pelo MCP (apply_migration) em 2026-08-13, versão
-- 20260813165314 no ledger. Este arquivo é o registro versionado do que foi
-- aplicado; NÃO rode `supabase db push` neste projeto (ver docs/decisoes.md).
--
-- Fix round 1 da Task 5 do adiantamento parcelado. Um Critical de dinheiro do
-- colaborador, mais quatro Minor de mensagem e concorrência. Nenhuma função
-- existente fora das duas desta task foi tocada (`fn_gerar_folha` segue em
-- md5(prosrc) 08413ddc2c86c8658371ebd3603a3cfd e `fn_aprovar_folha` em
-- a1261a1ccbff886980f0991da47a2446; a trava do fim desta migration confere os
-- dois e derruba a migration se algum tiver mudado).
--
-- CRITICAL. As duas funções podiam mover uma sobra aberta para competência
-- ANTERIOR à folha que a gerou, invertendo a ordem da cadeia. A trava de
-- regeneração da `fn_gerar_folha` compara `f.status <> 'rascunho'` e NÃO tem
-- condição de ordem, então a isenção "folha posterior em rascunho não trava"
-- passava a valer para uma folha que já não era posterior, e o
-- `delete ... where gerada_por_folha_id = v_folha` (que não filtra `folha_id`)
-- apagava uma parcela JÁ FECHADA na folha mais antiga.
--
-- Medido antes deste fix, adiantamento de 5.200,00 e salário 2.000,00 (bloco X
-- da prova): o plano ia a 6.400,00 e, rodando a folha até zerar o saldo, o
-- colaborador pagava 6.400,00, ou seja 1.200,00 A MAIS do que foi concedido.
-- Diferente do transitório documentado no ponto 1 do comentário da
-- `fn_gerar_folha` (que é para FRENTE e cura ao regerar o mês seguinte), a folha
-- que cobrava a mais nascia limpa e passava pelo `fn_guarda_status_folha` sem
-- atrito. Os dois caminhos existiam, e o pior não exigia escolha nenhuma do
-- operador: a antecipação escolhia `min(competencia)` das folhas em rascunho sem
-- piso, então qualquer folha antiga parada em rascunho puxava a sobra para trás
-- sozinha, no momento da inativação.
--
-- A correção é um PISO de competência nas duas funções: o destino nunca pode ser
-- anterior à maior competência entre as folhas que geraram as sobras abertas que
-- estão sendo movidas. Igual ao piso é permitido. Na quitação o piso é RECUSA
-- explícita, dizendo qual é o piso e por quê; na antecipação, que é automática e
-- não pode travar a inativação, o piso entra na ESCOLHA (a menor folha em
-- rascunho >= piso; se não houver, o primeiro mês livre a partir do piso).
--
-- MINOR 1 e 2 (mensagem, e valem porque prometer valor errado no toast destrói a
-- confiança na tela): o retorno da antecipação passa a trazer `saldo_aberto`,
-- para a Server Action avisar quando existe saldo e nada foi movido em vez de
-- calar; e `valor` passa a somar só o que REALMENTE mudou de mês, em vez do
-- saldo inteiro (a parcela que já estava na competência de destino é reescrita,
-- mas não foi antecipada).
--
-- MINOR 4 (concorrência): as duas trancam a linha do adiantamento (`for update`)
-- antes de ler `max(numero)`, e traduzem `unique_violation` em mensagem de
-- negócio. A trava serializa as duas entre si; contra a `fn_gerar_folha` (que não
-- tranca essa linha) o que resta é a mensagem, que deixa de ser erro cru.
-- ============================================================================
-- 1. fn_quitar_adiantamento: ganha o PISO de competencia
-- ============================================================================
create or replace function public.fn_quitar_adiantamento(
  p_adiantamento uuid,
  p_competencia date
)
returns void
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_comp date;
  v_status text;
  v_qtd integer;
  v_soma numeric(14,2);
  v_max integer;
  v_piso date;
begin
  -- Gate fail-closed: `raise`, nunca predicado. `and tem_permissao(...)` dentro
  -- de um WHERE deixaria a funcao seguir em frente exatamente para quem nao
  -- pode, que e o fail-open que este gate existe para evitar.
  if not public.tem_permissao('rh.adiantamentos', 'editar') then
    raise exception 'Sem permissao para quitar adiantamentos';
  end if;

  if p_adiantamento is null then
    raise exception 'Adiantamento nao informado';
  end if;
  if p_competencia is null then
    raise exception 'Competencia nao informada';
  end if;

  -- O check rh_adiant_parcelas_competencia_dia1 exige dia 1.
  v_comp := date_trunc('month', p_competencia)::date;

  -- Tranca a linha do adiantamento ANTES de ler o maior numero: duas quitacoes
  -- simultaneas (ou uma quitacao e uma antecipacao) leriam o mesmo max(numero) e
  -- colidiriam no unique (adiantamento_id, numero), devolvendo erro cru de
  -- Postgres. O escopo do remanejo e o adiantamento, entao a trava e por
  -- adiantamento. Nao serializa contra a fn_gerar_folha (que nao tranca esta
  -- linha): esse caminho fica coberto pelo handler de unique_violation abaixo.
  perform 1 from public.rh_adiantamentos a where a.id = p_adiantamento for update;
  if not found then
    raise exception 'Adiantamento nao encontrado';
  end if;

  -- folhas.competencia e UNIQUE, entao o select escalar e seguro. Competencia
  -- SEM folha nenhuma e valida: a folha ainda vai ser gerada e vai encontrar a
  -- parcela. Se a folha do mes existe e esta em rascunho tambem vale, mas ela
  -- precisa ser REGERADA para descontar a parcela nova; enquanto nao for, o
  -- trigger fn_guarda_status_folha recusa manda-la para aprovacao (folha
  -- obsoleta), que e a rede desse caso.
  select f.status into v_status from public.folhas f where f.competencia = v_comp;

  if v_status = 'aprovado' then
    raise exception 'A folha de %/% ja esta aprovada: quitar nela alteraria dinheiro ja liberado. Escolha outra competencia, ou desaprove a folha antes.',
      to_char(v_comp, 'MM'), to_char(v_comp, 'YYYY');
  end if;
  if v_status = 'pendente_aprovacao' then
    raise exception 'A folha de %/% esta em aprovacao: quitar nela mudaria o numero que o Admin esta analisando. Escolha outra competencia, ou rejeite a folha antes.',
      to_char(v_comp, 'MM'), to_char(v_comp, 'YYYY');
  end if;

  -- "Em aberto" e folha_id nulo. Parcela ja descontada (inclusive a que fechou
  -- com valor_descontado = 0) NAO e tocada: o dinheiro dela ja esta numa folha.
  select count(*), coalesce(sum(pa.valor_previsto), 0)
  into v_qtd, v_soma
  from public.rh_adiantamento_parcelas pa
  where pa.adiantamento_id = p_adiantamento
    and pa.folha_id is null;

  if v_qtd = 0 then
    raise exception 'Este adiantamento nao tem parcela em aberto: nao ha saldo para quitar.';
  end if;

  -- ==========================================================================
  -- PISO DA COMPETENCIA (fix round 1, e dinheiro do colaborador)
  -- ==========================================================================
  -- Sobra NUNCA pode voltar para antes do mes da folha que a empurrou. Sem este
  -- piso, quitar numa competencia anterior a origem INVERTE a ordem da cadeia, e
  -- a inversao fura a trava de regeneracao da fn_gerar_folha:
  --
  --   a trava recusa regerar a folha F quando uma sobra marcada com F ja foi
  --   descontada por outra folha que NAO esta em rascunho. Ela compara
  --   `f.status <> 'rascunho'` e NAO tem condicao de ordem, entao a isencao
  --   "folha posterior em rascunho nao trava" (que existe porque nada de dinheiro
  --   saiu dela ainda, e travar seria indestravavel) passa a valer para uma folha
  --   que nao e posterior, e sim ANTERIOR. Liberada a regeneracao de F, o
  --   `delete from rh_adiantamento_parcelas where gerada_por_folha_id = v_folha`
  --   (que nao filtra folha_id) apaga uma parcela JA FECHADA na folha mais
  --   antiga, enquanto o folha_itens daquela folha segue com o desconto.
  --
  -- Medido antes deste fix, adiantamento de 5.200,00 e salario 2.000,00: quitar
  -- em julho uma sobra empurrada pela folha de agosto, gerar julho e regerar
  -- agosto levava o plano a 6.400,00, e rodando a folha ate zerar o colaborador
  -- pagava 6.400,00 por um adiantamento de 5.200,00 (1.200,00 a mais). Diferente
  -- do transitorio documentado no ponto 1 do comentario da fn_gerar_folha (que
  -- e para FRENTE e cura ao regerar o mes seguinte), aqui a folha que cobra a
  -- mais nasce limpa e passa pelo fn_guarda_status_folha sem atrito.
  select max(f.competencia) into v_piso
  from public.rh_adiantamento_parcelas pa
  join public.folhas f on f.id = pa.gerada_por_folha_id
  where pa.adiantamento_id = p_adiantamento
    and pa.folha_id is null;

  -- Igual ao piso e permitido: a sobra na propria competencia de origem nao
  -- inverte nada (a folha de origem, ao regerar, apaga essa linha e reabre a
  -- parcela de origem no mesmo mes, que e o comportamento correto).
  if v_piso is not null and v_comp < v_piso then
    raise exception 'Nao da para quitar em %: o saldo em aberto tem sobra de adiantamento empurrada pela folha de %, e a sobra nao pode voltar para antes do mes da folha que a gerou. Isso inverteria a ordem da cadeia e regerar aquela folha apagaria parcela ja descontada, cobrando do colaborador mais do que o valor concedido. Quite em % ou em um mes depois.',
      to_char(v_comp, 'MM/YYYY'), to_char(v_piso, 'MM/YYYY'), to_char(v_piso, 'MM/YYYY');
  end if;

  -- numero = maior + 1, medido ANTES do delete (sobre TODAS as parcelas,
  -- inclusive as descontadas) para nunca reaproveitar numero de parcela que ja
  -- existiu e nunca colidir com o unique (adiantamento_id, numero).
  select coalesce(max(pa.numero), 0) into v_max
  from public.rh_adiantamento_parcelas pa
  where pa.adiantamento_id = p_adiantamento;

  -- Apaga as abertas e insere a juntada, num statement so (CTE que modifica
  -- dados): o delete alimenta o insert pelo RETURNING, entao nao existe janela
  -- com o saldo apagado e ainda nao recriado.
  --
  -- POR QUE AGRUPA POR gerada_por_folha_id, em vez de UMA linha sempre:
  -- gerada_por_folha_id e o unico vinculo que a fn_gerar_folha tem para DESFAZER
  -- a sobra que ela empurrou (`delete ... where gerada_por_folha_id = v_folha`
  -- na regeneracao). Juntar tudo numa linha com gerada_por_folha_id nulo faria a
  -- regeneracao da folha que empurrou a sobra reabrir a parcela de origem (valor
  -- inteiro) SEM apagar a linha derivada dela, e o plano do adiantamento passaria
  -- a somar o valor da sobra DUAS VEZES. Medido: adiantamento de 5.200,00 com
  -- desconto de 1.800,00 em julho e sobra de 3.400,00, quitado em setembro,
  -- regerar julho levava o plano a 8.600,00.
  -- Juntar tudo numa linha com gerada_por_folha_id de UM dos grupos e pior: a
  -- regeneracao apagaria a linha inteira e o pedaco que nao veio daquela folha
  -- desapareceria do plano (dinheiro a menos).
  -- Agrupando, cada pedaco continua sabendo de onde veio: a regeneracao apaga
  -- exatamente o pedaco que aquela folha empurrou e reabre a origem dele, e o
  -- pedaco que nasceu do plano original nao e tocado. Na pratica sao 1 linha no
  -- caso normal (nenhuma sobra: todo gerada_por_folha_id nulo) e 2 quando existe
  -- sobra aberta. As duas coexistem na mesma competencia de proposito: a
  -- fn_gerar_folha itera sobre TODAS as parcelas abertas do mes e desconta em
  -- cascata, entao o efeito para o colaborador e o mesmo (o saldo todo cai nesse
  -- mes), e nao existe unique (adiantamento_id, competencia).
  -- Efeito colateral desejado: a linha juntada que herda gerada_por_folha_id
  -- fica DENTRO do cerco da trava de regeneracao (ponto 3 do comentario da
  -- fn_gerar_folha). Se ela for descontada por folha fora do rascunho, regerar a
  -- folha de origem passa a ser RECUSADO, como seria com a sobra original.
  begin
    with abertas as (
      delete from public.rh_adiantamento_parcelas pa
      where pa.adiantamento_id = p_adiantamento
        and pa.folha_id is null
      returning pa.numero, pa.valor_previsto, pa.gerada_por_folha_id
    ),
    juntadas as (
      select v_max + (row_number() over (order by min(abertas.numero))) as numero,
             sum(abertas.valor_previsto) as valor_previsto,
             abertas.gerada_por_folha_id
      from abertas
      group by abertas.gerada_por_folha_id
    )
    insert into public.rh_adiantamento_parcelas
      (adiantamento_id, numero, competencia, valor_previsto, gerada_por_folha_id)
    select p_adiantamento, j.numero, v_comp, j.valor_previsto, j.gerada_por_folha_id
    from juntadas j;
  exception when unique_violation then
    -- A trava por adiantamento acima cobre outra quitacao ou antecipacao, mas
    -- nao a fn_gerar_folha, que tambem insere parcela com max(numero) + 1.
    raise exception 'Outra escrita nas parcelas deste adiantamento aconteceu ao mesmo tempo (provavelmente uma folha sendo gerada). Abra o adiantamento de novo, confira o saldo e repita a quitacao.';
  end;

  -- Trava de dinheiro no proprio caminho quente: a soma das abertas depois tem
  -- que ser exatamente a soma das abertas antes. Se algum dia o agrupamento
  -- mudar e perder (ou dobrar) centavo, a transacao morre aqui em vez de gravar
  -- saldo errado.
  if (select coalesce(sum(pa.valor_previsto), 0)
      from public.rh_adiantamento_parcelas pa
      where pa.adiantamento_id = p_adiantamento
        and pa.folha_id is null) <> v_soma then
    raise exception 'Quitacao mudaria o saldo em aberto do adiantamento (de % para %): abortado.',
      v_soma,
      (select coalesce(sum(pa.valor_previsto), 0)
       from public.rh_adiantamento_parcelas pa
       where pa.adiantamento_id = p_adiantamento and pa.folha_id is null);
  end if;
end;
$function$;

comment on function public.fn_quitar_adiantamento(uuid, date) is
'Quitacao antecipada: junta as parcelas EM ABERTO (folha_id nulo) de um
adiantamento na competencia informada, preservando o total.

Exige rh.adiantamentos:editar, com gate por `raise` (fail-closed).

Recusa em QUATRO casos:
1. folha da competencia em `aprovado` (mexeria em dinheiro ja liberado);
2. folha da competencia em `pendente_aprovacao` (mudaria o numero que o Admin
   esta analisando);
3. nenhuma parcela em aberto (diz isso, em vez de criar parcela de zero, que o
   check rh_adiant_parcelas_previsto_positivo recusaria de qualquer forma);
4. competencia ANTERIOR ao PISO, que e a maior competencia entre as folhas que
   empurraram as sobras abertas que seriam movidas (ver abaixo). Igual ao piso
   e permitido.
Competencia SEM folha nenhuma e valida (respeitado o piso): a folha ainda vai ser
gerada e vai encontrar a parcela. Competencia com folha em rascunho tambem, mas a
folha precisa ser regerada para descontar a parcela nova; enquanto nao for, o
trigger fn_guarda_status_folha recusa manda-la para aprovacao (folha obsoleta).

O PISO existe porque sobra que volta para ANTES da folha que a gerou inverte a
ordem da cadeia, e a inversao FURA a trava de regeneracao da fn_gerar_folha: a
trava compara `f.status <> ''rascunho''` e nao tem condicao de ordem, entao a
isencao "folha posterior em rascunho nao trava" passa a valer para uma folha
ANTERIOR, e o `delete ... where gerada_por_folha_id = v_folha` (que nao filtra
folha_id) apaga parcela JA FECHADA na folha mais antiga. Medido antes do fix,
adiantamento de 5.200,00 com salario 2.000,00: plano em 6.400,00 e o colaborador
pagando 6.400,00, 1.200,00 a mais. Diferente do transitorio do ponto 1 do
comentario da fn_gerar_folha, que e para FRENTE e cura ao regerar o mes seguinte,
aqui a folha que cobra a mais nasce limpa e aprova sem atrito.

Preserva as parcelas JA DESCONTADAS, inclusive a que fechou com
valor_descontado = 0: o dinheiro delas ja esta numa folha.

NAO junta sempre numa linha unica: agrupa por gerada_por_folha_id. Sao 1 linha
no caso normal (nenhuma sobra aberta) e 2 quando existe sobra. O motivo esta no
corpo, e e dinheiro: gerada_por_folha_id e o unico vinculo que a fn_gerar_folha
tem para desfazer a sobra que ela empurrou, e perde-lo faria a regeneracao da
folha de origem somar a sobra DUAS VEZES no plano (medido: 5.200,00 virando
8.600,00). Herdar o vinculo tambem mantem a linha juntada dentro do cerco da
trava de regeneracao (ponto 3 do comentario da fn_gerar_folha).

Concorrencia: tranca a linha do adiantamento (`for update`) antes de ler
max(numero), para duas quitacoes simultaneas nao colidirem no unique
(adiantamento_id, numero). A fn_gerar_folha nao e serializada por essa trava, e
esse caminho cai no handler de unique_violation, que devolve mensagem de negocio
em vez de erro cru.

Invariante preservada, e a documentada no ponto 1 do comentario da
fn_gerar_folha: soma(valor_descontado) + soma(valor_previsto das ABERTAS) =
valor concedido. Nao confundir com soma(valor_previsto) de TODAS as parcelas,
que fica MAIOR que o concedido sempre que uma folha descontou parcela pela
metade (a parcela fechada guarda o valor_previsto inteiro e a sobra nasce com a
diferenca). A funcao ainda confere, no proprio caminho quente, que a soma das
abertas nao mudou, e aborta se mudar.

Auditoria: o trigger trg_audit_rh_adiant_parcelas grava o delete e o insert em
audit_log.

NAO chama fn_exigir_competencia_aberta de proposito: quitar nao cria lancamento
no Financeiro, so remaneja o plano de desconto da folha (mesma razao pela qual a
fn_gerar_folha nao chama).';

-- ============================================================================
-- 2. fn_antecipar_adiantamentos_colaborador: escolhe respeitando o PISO
-- ============================================================================
create or replace function public.fn_antecipar_adiantamentos_colaborador(
  p_colaborador uuid
)
returns jsonb
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_comp date;
  v_piso date;
  v_n integer;
  v_ad record;
  v_max integer;
  v_rows integer;
  v_criadas integer := 0;
  v_adiantamentos integer := 0;
  v_valor numeric(14,2) := 0;
  v_saldo numeric(14,2);
  v_soma_antes numeric(14,2);
  v_movido numeric(14,2);
begin
  -- Sem permissao propria: antecipar e consequencia de inativar, entao o gate e
  -- o mesmo de inativar. Fail-closed por `raise`, e nao por predicado.
  if not public.tem_permissao('cadastros.colaboradores', 'editar') then
    raise exception 'Sem permissao para antecipar adiantamentos do colaborador';
  end if;

  if p_colaborador is null then
    raise exception 'Colaborador nao informado';
  end if;

  -- Saldo em aberto do colaborador. Vai no retorno para a Server Action poder
  -- avisar quando existe saldo e nada foi movido: inativar alguem com saldo e
  -- nao dizer nada e o silencio que a tela nao pode ter.
  select coalesce(sum(pa.valor_previsto), 0) into v_saldo
  from public.rh_adiantamentos a
  join public.rh_adiantamento_parcelas pa on pa.adiantamento_id = a.id
  where a.colaborador_id = p_colaborador
    and pa.folha_id is null;

  -- Sem saldo em aberto, nao faz NADA (nem escolhe competencia) e devolve zero.
  if v_saldo = 0 then
    return jsonb_build_object(
      'parcelas', 0, 'adiantamentos', 0, 'valor', 0,
      'competencia', null, 'saldo_aberto', 0
    );
  end if;

  -- PISO da competencia de destino: a maior competencia entre as folhas que
  -- empurraram as sobras abertas deste colaborador. Sobra nao pode voltar para
  -- antes da folha que a gerou; o porque, com o valor medido, esta no
  -- `comment on function` da fn_quitar_adiantamento. O piso e do COLABORADOR e
  -- nao de cada adiantamento porque o destino e um so para a chamada inteira;
  -- na duvida ele atrasa o desconto, nunca inverte a cadeia.
  select max(f.competencia) into v_piso
  from public.rh_adiantamentos a
  join public.rh_adiantamento_parcelas pa on pa.adiantamento_id = a.id
  join public.folhas f on f.id = pa.gerada_por_folha_id
  where a.colaborador_id = p_colaborador
    and pa.folha_id is null;

  -- Competencia de destino, sem ambiguidade: a folha em RASCUNHO de MENOR
  -- competencia que respeite o piso. Nunca uma competencia cuja folha esteja
  -- pendente_aprovacao (mudaria o numero em analise) ou aprovado (dinheiro ja
  -- liberado), e o filtro por status = 'rascunho' garante isso direto.
  -- O piso no WHERE e o que impede a inativacao de mover sobra para tras
  -- SOZINHA, sem escolha nenhuma do operador: qualquer folha antiga parada em
  -- rascunho seria a menor competencia e puxaria a sobra para o passado.
  select min(f.competencia) into v_comp
  from public.folhas f
  where f.status = 'rascunho'
    and (v_piso is null or f.competencia >= v_piso);

  if v_comp is null then
    -- Sem folha em rascunho utilizavel: o mes corrente em America/Rio_Branco, e
    -- nunca antes do piso. Antecipar e automatico (consequencia de inativar),
    -- entao aqui NAO se recusa: escolhe-se um destino valido.
    v_comp := date_trunc('month', (now() at time zone 'America/Rio_Branco'))::date;
    if v_piso is not null and v_piso > v_comp then
      v_comp := v_piso;
    end if;
    -- O mes escolhido pode ter folha em pendente_aprovacao ou aprovado. "Nunca
    -- essas duas" vale sempre, entao anda para frente ate o primeiro mes sem
    -- folha ou com folha em rascunho. Teto de 120 meses, igual ao da
    -- fn_proxima_competencia_desconto, para nao existir laco infinito.
    v_n := 0;
    while v_n <= 120 and exists (
      select 1 from public.folhas f
      where f.competencia = v_comp
        and f.status in ('pendente_aprovacao', 'aprovado')
    ) loop
      v_comp := (v_comp + interval '1 month')::date;
      v_n := v_n + 1;
    end loop;
    if v_n > 120 then
      raise exception 'Nao achei competencia livre (sem folha em aprovacao ou aprovada) nos 120 meses depois de %', v_comp;
    end if;
  end if;

  -- Uma parcela por ADIANTAMENTO, nao uma global: adiantamentos diferentes tem
  -- data diferente, e a cascata da fn_gerar_folha ordena por
  -- (rh_adiantamentos.data, rh_adiantamento_parcelas.numero). Juntar tudo numa
  -- linha so perderia essa ordem e o vinculo de cada parcela com o seu
  -- adiantamento.
  --
  -- So entram os adiantamentos que tem saldo aberto FORA da competencia de
  -- destino: o que ja esta la nao tem para onde ser antecipado, e mexer nele so
  -- trocaria numero de parcela e poluiria o aviso com parcela que nao andou.
  for v_ad in
    select a.id
    from public.rh_adiantamentos a
    where a.colaborador_id = p_colaborador
      and exists (
        select 1 from public.rh_adiantamento_parcelas pa
        where pa.adiantamento_id = a.id
          and pa.folha_id is null
          and pa.competencia <> v_comp
      )
    order by a.data, a.id
  loop
    -- Mesma trava por adiantamento da quitacao, e na mesma ordem determinada
    -- (a.data, a.id) para duas antecipacoes simultaneas nao se cruzarem.
    perform 1 from public.rh_adiantamentos a where a.id = v_ad.id for update;

    select coalesce(sum(pa.valor_previsto), 0) into v_soma_antes
    from public.rh_adiantamento_parcelas pa
    where pa.adiantamento_id = v_ad.id
      and pa.folha_id is null;

    -- So o que REALMENTE muda de mes entra no valor do aviso. Somar o saldo
    -- inteiro prometeria no toast dinheiro que nao andou (a parcela que ja
    -- estava na competencia de destino e reescrita, mas nao foi antecipada).
    select coalesce(sum(pa.valor_previsto), 0) into v_movido
    from public.rh_adiantamento_parcelas pa
    where pa.adiantamento_id = v_ad.id
      and pa.folha_id is null
      and pa.competencia <> v_comp;

    select coalesce(max(pa.numero), 0) into v_max
    from public.rh_adiantamento_parcelas pa
    where pa.adiantamento_id = v_ad.id;

    -- Mesmo agrupamento por gerada_por_folha_id da fn_quitar_adiantamento, e
    -- pelo mesmo motivo de dinheiro (ver o comentario de la).
    begin
      with abertas as (
        delete from public.rh_adiantamento_parcelas pa
        where pa.adiantamento_id = v_ad.id
          and pa.folha_id is null
        returning pa.numero, pa.valor_previsto, pa.gerada_por_folha_id
      ),
      juntadas as (
        select v_max + (row_number() over (order by min(abertas.numero))) as numero,
               sum(abertas.valor_previsto) as valor_previsto,
               abertas.gerada_por_folha_id
        from abertas
        group by abertas.gerada_por_folha_id
      )
      insert into public.rh_adiantamento_parcelas
        (adiantamento_id, numero, competencia, valor_previsto, gerada_por_folha_id)
      select v_ad.id, j.numero, v_comp, j.valor_previsto, j.gerada_por_folha_id
      from juntadas j;

      get diagnostics v_rows = row_count;
    exception when unique_violation then
      raise exception 'Outra escrita nas parcelas do adiantamento % aconteceu ao mesmo tempo (provavelmente uma folha sendo gerada). Inative de novo, ou antecipe o saldo pela tela de adiantamentos.', v_ad.id;
    end;

    if (select coalesce(sum(pa.valor_previsto), 0)
        from public.rh_adiantamento_parcelas pa
        where pa.adiantamento_id = v_ad.id
          and pa.folha_id is null) <> v_soma_antes then
      raise exception 'Antecipacao mudaria o saldo em aberto do adiantamento %: abortado.', v_ad.id;
    end if;

    v_criadas := v_criadas + v_rows;
    v_adiantamentos := v_adiantamentos + 1;
    v_valor := v_valor + v_movido;
  end loop;

  return jsonb_build_object(
    'parcelas', v_criadas,
    'adiantamentos', v_adiantamentos,
    'valor', v_valor,
    'competencia', case when v_criadas > 0 then to_char(v_comp, 'YYYY-MM-DD') else null end,
    'saldo_aberto', v_saldo
  );
end;
$function$;

comment on function public.fn_antecipar_adiantamentos_colaborador(uuid) is
'Antecipacao no desligamento: junta o saldo em aberto do colaborador, UMA parcela
por ADIANTAMENTO (nao uma global), na competencia de destino.

NAO E TRIGGER, e a escolha e deliberada. Efeito financeiro dentro de um UPDATE de
cadastro e o que ninguem encontra depois, e esta base ja pagou por esse padrao: o
trigger de guarda da folha e BEFORE UPDATE OF status e ficava cego a qualquer
outra coluna. Quem chama e a Server Action que salva o colaborador, DEPOIS do
update bem-sucedido, quando ativo vai de true para false, e o toast diz quantas
parcelas foram antecipadas e para qual competencia. Efeito em dinheiro visivel na
hora, para quem o causou.

Gate: cadastros.colaboradores:editar, por `raise` (fail-closed). Nao tem
permissao propria porque e consequencia de inativar.

Competencia de destino, sem ambiguidade e com PISO:
1. a folha em `rascunho` de MENOR competencia que seja >= o piso;
2. se nao houver, o maior entre o mes corrente em America/Rio_Branco e o piso,
   andando para frente ate o primeiro mes sem folha ou com folha em rascunho
   (teto de 120 meses). Nunca pendente_aprovacao nem aprovado.

O PISO e a maior competencia entre as folhas que empurraram as sobras abertas do
colaborador. Sem ele, QUALQUER folha antiga parada em rascunho seria a menor
competencia e a inativacao moveria a sobra para TRAS da folha que a gerou,
sozinha, sem escolha nenhuma do operador. Isso inverte a ordem da cadeia e fura a
trava de regeneracao da fn_gerar_folha (que compara status e nao tem condicao de
ordem): o resultado medido foi o colaborador pagando 1.200,00 a mais num
adiantamento de 5.200,00. O detalhe do mecanismo esta no `comment on function` da
fn_quitar_adiantamento. Por ser automatica, esta funcao nao RECUSA quando o piso
aperta: ela ESCOLHE um destino valido, para a inativacao nunca falhar por isso.

Entram so os adiantamentos com saldo aberto FORA da competencia de destino: o que
ja esta la nao tem para onde ser antecipado. Sem saldo em aberto nenhum, nao faz
nada e devolve parcelas 0 (a inativacao nao pode falhar por isso).

Devolve jsonb: {"parcelas": n, "adiantamentos": n, "valor": n, "competencia":
"yyyy-mm-dd", "saldo_aberto": n} (competencia nula quando parcelas = 0).
`valor` e so o que MUDOU de mes, nao o saldo inteiro: parcela que ja estava na
competencia de destino e reescrita mas nao foi antecipada, e prometer o valor
dela no toast seria mentir sobre dinheiro. `saldo_aberto` e o saldo total em
aberto, para a Server Action avisar quando existe saldo e nada foi movido.

`parcelas` conta LINHAS criadas, que e 1 por adiantamento no caso normal e 2 no
adiantamento que tem sobra aberta, porque o agrupamento e por
gerada_por_folha_id: o mesmo motivo de dinheiro da fn_quitar_adiantamento (perder
esse vinculo faria a regeneracao da folha de origem somar a sobra duas vezes no
plano).

Concorrencia: tranca cada adiantamento (`for update`) na ordem (data, id) antes
de ler max(numero), e traduz unique_violation em mensagem de negocio.

Invariante preservada, a mesma do ponto 1 do comentario da fn_gerar_folha:
soma(valor_descontado) + soma(valor_previsto das ABERTAS) = valor concedido, por
adiantamento. A funcao confere, adiantamento por adiantamento, que a soma das
abertas nao mudou, e aborta se mudar.

Rede para o que escapar daqui (colaborador inativado antes desta funcao existir,
ou adiantamento cujo saldo ja estava na competencia de destino): o painel de
alertas do RH lista colaborador inativo com saldo de adiantamento em aberto.

PENDENTE DE DECISAO DO DONO DO SISTEMA: a fn_gerar_folha itera
`where ativo and vinculo = ''clt''`, e a Server Action inativa o colaborador ANTES
de chamar esta funcao, entao a parcela antecipada de um colaborador inativo nao e
alcancada por nenhuma folha e o saldo fica parado. A premissa da feature depende
de como o desligamento deve ser pago (rescisao, e nao folha mensal), o que nao e
decisao de implementacao. A rede do painel de alertas cobre a visibilidade
enquanto isso.';

-- ============================================================================
-- 3. Trava fail-closed do privilegio
-- ============================================================================
-- `create or replace function` PRESERVA o acl, entao esta migration nao mexe em
-- privilegio. A trava confere o estado final de qualquer forma, porque o que
-- interessa e o resultado e nao a intencao: fail-closed, qualquer achado levanta
-- excecao e a migration inteira volta.
do $trava$
declare
  v_ruim integer;
  v_faltando integer;
begin
  select count(*) into v_ruim
  from pg_proc p
  join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public'
    and p.proname in ('fn_quitar_adiantamento', 'fn_antecipar_adiantamentos_colaborador')
    and (has_function_privilege('anon', p.oid, 'EXECUTE')
      or exists (select 1 from unnest(p.proacl) acl where acl::text like '=%'));
  if v_ruim > 0 then
    raise exception 'anon (ou PUBLIC) executa % das funcoes de adiantamento', v_ruim;
  end if;

  select count(*) into v_faltando
  from (values ('fn_quitar_adiantamento'), ('fn_antecipar_adiantamentos_colaborador')) as f(nome)
  where not exists (
    select 1 from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname = f.nome
      and p.prosecdef
      and array_to_string(coalesce(p.proconfig, array[]::text[]), ' ') like '%search_path%'
      and has_function_privilege('authenticated', p.oid, 'EXECUTE')
  );
  if v_faltando > 0 then
    raise exception '% funcao(oes) sem execute para authenticated, sem SECURITY DEFINER ou sem search_path preso', v_faltando;
  end if;

  -- As duas funcoes de dinheiro que esta frente NAO pode alterar seguem intactas.
  if (select md5(p.prosrc) from pg_proc p join pg_namespace n on n.oid = p.pronamespace
      where n.nspname='public' and p.proname='fn_gerar_folha')
     <> '08413ddc2c86c8658371ebd3603a3cfd' then
    raise exception 'fn_gerar_folha mudou: esta migration nao pode toca-la';
  end if;
  if (select md5(p.prosrc) from pg_proc p join pg_namespace n on n.oid = p.pronamespace
      where n.nspname='public' and p.proname='fn_aprovar_folha')
     <> 'a1261a1ccbff886980f0991da47a2446' then
    raise exception 'fn_aprovar_folha mudou: esta migration nao pode toca-la';
  end if;
end $trava$;
