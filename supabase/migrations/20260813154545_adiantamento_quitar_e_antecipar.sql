-- Aplicada em produção pelo MCP (apply_migration) em 2026-08-13, versão
-- 20260813154545 no ledger. Este arquivo é o registro versionado do que foi
-- aplicado; NÃO rode `supabase db push` neste projeto (ver docs/decisoes.md).
--
-- Task 5 do adiantamento parcelado: quitação antecipada e antecipação no
-- desligamento. Duas funções novas, nenhuma alteração em função existente
-- (`fn_gerar_folha` segue em md5(prosrc) 08413ddc2c86c8658371ebd3603a3cfd e
-- `fn_aprovar_folha` em a1261a1ccbff886980f0991da47a2446, conferidos antes e
-- depois).
--
-- A decisão de projeto que o brief não previa, e é dinheiro: as duas funções
-- juntam as parcelas em aberto AGRUPANDO POR gerada_por_folha_id, em vez de
-- sempre numa linha única. gerada_por_folha_id é o único vínculo que a
-- `fn_gerar_folha` tem para desfazer a sobra que ela empurrou, e perdê-lo faria
-- a regeneração da folha de origem reabrir a parcela de origem sem apagar a
-- linha derivada dela: o plano do adiantamento passaria a somar a sobra DUAS
-- VEZES (medido: 5.200,00 virando 8.600,00). O detalhe está no corpo e no
-- `comment on function`.
-- ============================================================================
-- 1. fn_quitar_adiantamento: junta as parcelas em aberto na competencia pedida
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

  if not exists (select 1 from public.rh_adiantamentos a where a.id = p_adiantamento) then
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

Recusa em tres casos:
1. folha da competencia em `aprovado` (mexeria em dinheiro ja liberado);
2. folha da competencia em `pendente_aprovacao` (mudaria o numero que o Admin
   esta analisando);
3. nenhuma parcela em aberto (diz isso, em vez de criar parcela de zero, que o
   check rh_adiant_parcelas_previsto_positivo recusaria de qualquer forma).
Competencia SEM folha nenhuma e valida: a folha ainda vai ser gerada e vai
encontrar a parcela. Competencia com folha em rascunho tambem, mas a folha
precisa ser regerada para descontar a parcela nova; enquanto nao for, o trigger
fn_guarda_status_folha recusa manda-la para aprovacao (folha obsoleta).

Preserva as parcelas JA DESCONTADAS, inclusive a que fechou com
valor_descontado = 0: o dinheiro delas ja esta numa folha.

NAO junta sempre numa linha unica: agrupa por gerada_por_folha_id. Sao 1 linha
no caso normal (nenhuma sobra aberta) e 2 quando existe sobra. O motivo esta no
corpo, e e dinheiro: gerada_por_folha_id e o unico vinculo que a fn_gerar_folha
tem para desfazer a sobra que ela empurrou, e perde-lo faria a regeneracao da
folha de origem somar a sobra DUAS VEZES no plano (medido: 5.200,00 virando
8.600,00). Herdar o vinculo tambem mantem a linha juntada dentro do cerco da
trava de regeneracao (ponto 3 do comentario da fn_gerar_folha).

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

revoke all on function public.fn_quitar_adiantamento(uuid, date) from public;
grant execute on function public.fn_quitar_adiantamento(uuid, date) to authenticated;

-- ============================================================================
-- 2. fn_antecipar_adiantamentos_colaborador: saldo em aberto vai para a folha
--    em rascunho de menor competencia quando o colaborador e inativado
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
  v_n integer;
  v_ad record;
  v_max integer;
  v_rows integer;
  v_criadas integer := 0;
  v_adiantamentos integer := 0;
  v_valor numeric(14,2) := 0;
  v_soma_antes numeric(14,2);
begin
  -- Sem permissao propria: antecipar e consequencia de inativar, entao o gate e
  -- o mesmo de inativar. Fail-closed por `raise`, e nao por predicado.
  if not public.tem_permissao('cadastros.colaboradores', 'editar') then
    raise exception 'Sem permissao para antecipar adiantamentos do colaborador';
  end if;

  if p_colaborador is null then
    raise exception 'Colaborador nao informado';
  end if;

  -- Sem saldo em aberto, nao faz NADA (nem escolhe competencia) e devolve zero.
  if not exists (
    select 1
    from public.rh_adiantamentos a
    join public.rh_adiantamento_parcelas pa on pa.adiantamento_id = a.id
    where a.colaborador_id = p_colaborador
      and pa.folha_id is null
  ) then
    return jsonb_build_object(
      'parcelas', 0, 'adiantamentos', 0, 'valor', 0, 'competencia', null
    );
  end if;

  -- Competencia de destino, sem ambiguidade: a folha em RASCUNHO de MENOR
  -- competencia. Nunca uma competencia cuja folha esteja pendente_aprovacao
  -- (mudaria o numero em analise) ou aprovado (dinheiro ja liberado), e o
  -- filtro por status = 'rascunho' garante isso direto.
  select min(f.competencia) into v_comp
  from public.folhas f
  where f.status = 'rascunho';

  if v_comp is null then
    -- Sem folha em rascunho: o mes corrente em America/Rio_Branco.
    v_comp := date_trunc('month', (now() at time zone 'America/Rio_Branco'))::date;
    -- O mes corrente pode ter folha em pendente_aprovacao ou aprovado (caso que
    -- a regra acima nao previu, porque previu "sem folha em rascunho"). "Nunca
    -- essas duas" vale mesmo aqui, entao anda para frente ate o primeiro mes
    -- sem folha ou com folha em rascunho. Teto de 120 meses, igual ao da
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
    select coalesce(sum(pa.valor_previsto), 0) into v_soma_antes
    from public.rh_adiantamento_parcelas pa
    where pa.adiantamento_id = v_ad.id
      and pa.folha_id is null;

    select coalesce(max(pa.numero), 0) into v_max
    from public.rh_adiantamento_parcelas pa
    where pa.adiantamento_id = v_ad.id;

    -- Mesmo agrupamento por gerada_por_folha_id da fn_quitar_adiantamento, e
    -- pelo mesmo motivo de dinheiro (ver o comentario de la).
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

    if (select coalesce(sum(pa.valor_previsto), 0)
        from public.rh_adiantamento_parcelas pa
        where pa.adiantamento_id = v_ad.id
          and pa.folha_id is null) <> v_soma_antes then
      raise exception 'Antecipacao mudaria o saldo em aberto do adiantamento %: abortado.', v_ad.id;
    end if;

    v_criadas := v_criadas + v_rows;
    v_adiantamentos := v_adiantamentos + 1;
    v_valor := v_valor + v_soma_antes;
  end loop;

  return jsonb_build_object(
    'parcelas', v_criadas,
    'adiantamentos', v_adiantamentos,
    'valor', v_valor,
    'competencia', case when v_criadas > 0 then to_char(v_comp, 'YYYY-MM-DD') else null end
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

Competencia de destino, sem ambiguidade: a folha em `rascunho` de MENOR
competencia. Se nao houver nenhuma folha em rascunho, o mes corrente em
America/Rio_Branco; e se ESSE mes tiver folha em pendente_aprovacao ou aprovado
(caso que a regra nao previu), anda para o primeiro mes seguinte sem folha ou com
folha em rascunho, porque "nunca pendente_aprovacao nem aprovado" vale sempre.
Teto de 120 meses.

Entram so os adiantamentos com saldo aberto FORA da competencia de destino: o que
ja esta la nao tem para onde ser antecipado. Sem saldo em aberto nenhum, nao faz
nada e devolve parcelas 0 (a inativacao nao pode falhar por isso).

Devolve jsonb: {"parcelas": n, "adiantamentos": n, "valor": n, "competencia":
"yyyy-mm-dd"} (competencia nula quando parcelas = 0).

`parcelas` conta LINHAS criadas, que e 1 por adiantamento no caso normal e 2 no
adiantamento que tem sobra aberta, porque o agrupamento e por
gerada_por_folha_id: o mesmo motivo de dinheiro da fn_quitar_adiantamento (perder
esse vinculo faria a regeneracao da folha de origem somar a sobra duas vezes no
plano).

Invariante preservada, a mesma do ponto 1 do comentario da fn_gerar_folha:
soma(valor_descontado) + soma(valor_previsto das ABERTAS) = valor concedido, por
adiantamento. A funcao confere, adiantamento por adiantamento, que a soma das
abertas nao mudou, e aborta se mudar.

Rede para o que escapar daqui (colaborador inativado antes desta funcao existir,
ou adiantamento cujo saldo ja estava na competencia de destino): o painel de
alertas do RH lista colaborador inativo com saldo de adiantamento em aberto.';

revoke all on function public.fn_antecipar_adiantamentos_colaborador(uuid) from public;
grant execute on function public.fn_antecipar_adiantamentos_colaborador(uuid) to authenticated;

-- ============================================================================
-- 3. Trava fail-closed do privilegio
-- ============================================================================
-- Mexeu em privilegio (revoke/grant execute), entao a migration termina
-- conferindo o estado final em vez de confiar no que ela acabou de rodar.
-- Fail-closed: qualquer achado levanta excecao e a migration inteira volta.
do $trava$
declare
  v_ruim integer;
  v_faltando integer;
begin
  -- anon nao executa nenhuma das duas, e nao existe grant para PUBLIC (entrada
  -- de acl que comeca com '=', a que anon herdaria).
  select count(*) into v_ruim
  from pg_proc p
  join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public'
    and p.proname in ('fn_quitar_adiantamento', 'fn_antecipar_adiantamentos_colaborador')
    and (has_function_privilege('anon', p.oid, 'EXECUTE')
      or exists (select 1 from unnest(p.proacl) acl where acl::text like '=%'));
  if v_ruim > 0 then
    raise exception 'anon (ou PUBLIC) executa % das funcoes novas de adiantamento', v_ruim;
  end if;

  -- authenticated executa as duas, e as duas sao definer com search_path preso.
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
    raise exception '% funcao(oes) nova(s) sem execute para authenticated, sem SECURITY DEFINER ou sem search_path preso', v_faltando;
  end if;
end $trava$;
