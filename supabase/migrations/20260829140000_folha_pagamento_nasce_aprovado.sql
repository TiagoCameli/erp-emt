-- =============================================================
-- Folha: aprovar a folha ja aprova o pagamento dela
-- =============================================================
-- PEDIDO DO TIAGO (29/08/2026): "quando ela for aprovada aqui na folha
-- gerencial quero que ja nasca com o pagamento aprovado".
--
-- Ate aqui a folha aprovada gerava lancamento com parcela 'pendente', e alguem
-- tinha de aprovar o pagamento OUTRA VEZ em Financeiro > Aprovacao de
-- pagamentos. Dois avais para o mesmo dinheiro, e o segundo nunca ia negar o
-- que o primeiro aprovou: aprovar a folha JA E a decisao de pagar aqueles
-- salarios. O segundo aval so atrasava o pagamento e enfiava a folha inteira
-- numa fila que existe para conferir compra, nao salario.
--
-- ============================================================
-- 1. APROVADA SIM, MAS SO POR QUEM PODE APROVAR PAGAMENTO
-- ============================================================
-- Medido no banco em 29/08/2026: quatro pessoas tem `rh.folha:aprovar`, e uma
-- delas NAO tem `financeiro.aprovacao-pagamentos:aprovar`. Se a aprovacao da
-- folha aprovasse o pagamento sempre, essa pessoa passaria a dar um aval de
-- R$ 173 mil que a tela de Aprovacao de pagamentos nega a ela na cara. Isso e
-- escalada de permissao por porta lateral, e a regra de ouro 2 do projeto
-- (permissao no banco, na action e na UI) existe justamente contra isso.
--
-- Entao o status da parcela segue a permissao de quem aprovou:
--   tem `financeiro.aprovacao-pagamentos:aprovar` .... parcela nasce 'aprovado'
--   nao tem ......................................... parcela nasce 'pendente'
--
-- Isso NAO fica escondido: a secao "Lancamentos gerados" da propria folha tem
-- coluna Status por linha, entao a diferenca aparece na mesma tela em que a
-- pessoa acabou de aprovar. Se o Tiago quiser que ela tambem aprove o pagamento
-- pela folha, e uma concessao de permissao, nao uma mudanca de codigo.
--
-- ============================================================
-- 2. SEM DATA PROGRAMADA NAO EXISTE PAGAMENTO APROVADO
-- ============================================================
-- `lancamento_parcelas` tem CHECK `programada_quando_aprovada`: status
-- 'aprovado' exige `data_programada`. A data da folha vem de
-- `fn_vencimento_folha(competencia, dia)`, e o dia vem de `folha_parametros`.
--
-- Medido em 29/08/2026: a tabela `folha_parametros` **nao tem nenhuma linha**.
-- Ou seja, hoje o vencimento das parcelas da folha sai NULL. Isso ja era um
-- buraco (conta a pagar sem data), mas passava calado porque parcela pendente
-- nao precisa de data. Nascendo aprovada, o CHECK estouraria erro de constraint
-- no meio da aprovacao — mensagem de banco, na cara do usuario.
--
-- Por isso a funcao passa a recusar ANTES, com texto que diz o que fazer e
-- onde. Recusar e melhor que programar para hoje por conta propria: pagamento
-- tem data autorizada, e inventar a data e inventar a autorizacao.
--
-- ============================================================
-- 3. DESAPROVAR A FOLHA PRECISOU AFROUXAR (senao a folha vira concreto)
-- ============================================================
-- `fn_desaprovar_folha` recusava quando havia parcela 'aprovado' OU 'pago' OU
-- conciliada. Com o pagamento nascendo aprovado, TODA folha aprovada passaria a
-- bater nessa trava: desaprovar ficaria impossivel para 100% das folhas, no
-- minuto seguinte a aprovacao. Seria o pior tipo de regressao — a que so
-- aparece quando alguem precisa consertar um erro.
--
-- A trava existia para nao apagar o que OUTRA pessoa ja comprometeu numa etapa
-- seguinte. Agora "aprovado e nao pago" nao e mais compromisso de terceiro: e a
-- propria folha, criado pela mesma aprovacao que se quer desfazer. O que
-- continua travando e o que de fato aconteceu com o dinheiro:
--   'pago' ................ saiu do caixa
--   conciliada ............ casou com o extrato do banco
--
-- ============================================================
-- Editadas por ANCORA a partir da definicao viva: varias frentes mexem nestas
-- funcoes e `create or replace` sobrescreve sem dar conflito.

-- ---------------------------------------------------------------
-- fn_aprovar_folha
-- ---------------------------------------------------------------
do $aprovar$
declare
  v_def text; v_novo text; v_n int;
  a_declare text; r_declare text;
  a_venc text;    r_venc text;
  a_sal text;     r_sal text;
  a_guia text;    r_guia text;
begin
  select pg_get_functiondef(p.oid) into v_def
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public' and p.proname = 'fn_aprovar_folha';
  if v_def is null then
    raise exception 'fn_aprovar_folha nao existe.';
  end if;

  -- (1) declaracoes: a permissao de pagamento e o status que ela decide.
  a_declare := $a$  v_item record; v_guia record; v_lanc uuid; v_guia_id uuid;$a$;
  r_declare := $r$  v_item record; v_guia record; v_lanc uuid; v_guia_id uuid;
  v_parcela uuid;
  -- Aprovar a folha aprova o pagamento dela, MAS so para quem pode aprovar
  -- pagamento. Sem isto, quem aprova folha e nao aprova pagamento ganharia por
  -- esta porta um aval que a tela de Aprovacao de pagamentos nega a ela.
  v_aprova_pgto boolean := public.tem_permissao('financeiro.aprovacao-pagamentos', 'aprovar');
  v_st_parcela text := case when v_aprova_pgto then 'aprovado' else 'pendente' end;$r$;

  -- (2) guarda da data do salario, logo depois de calcular os vencimentos.
  a_venc := $a$  v_venc_sal  := public.fn_vencimento_folha(v_comp, v_dia_sal);
  v_venc_guia := public.fn_vencimento_folha(v_comp, v_dia_guia);$a$;
  r_venc := $r$  v_venc_sal  := public.fn_vencimento_folha(v_comp, v_dia_sal);
  v_venc_guia := public.fn_vencimento_folha(v_comp, v_dia_guia);

  -- Pagamento aprovado exige data programada (CHECK
  -- lancamento_parcelas_programada_quando_aprovada). A data sai do dia de
  -- pagamento parametrizado; sem ele o vencimento e null e a aprovacao nao teria
  -- QUANDO acontecer. Recusa aqui, com texto que diz onde resolver, em vez de
  -- deixar o CHECK estourar erro de banco no meio da aprovacao.
  if v_aprova_pgto and v_venc_sal is null then
    raise exception 'Defina o dia de pagamento do salario em RH > Parametros da folha: o pagamento da folha nasce aprovado, e aprovacao sem data programada nao existe.';
  end if;$r$;

  -- (3) parcela do salario.
  a_sal := $a$    insert into public.lancamento_parcelas
      (lancamento_id, numero_parcela, valor, data_vencimento, status, created_by)
    values (v_lanc, 1, v_item.valor_liquido, v_venc_sal, 'pendente', v_uid);$a$;
  r_sal := $r$    -- Os quatro campos da aprovacao vao JUNTOS de proposito: sao exatamente os
    -- que a fn_aprovar_parcela grava. Um faltando deixa a parcela num estado que
    -- as telas de pagamento nao sabem ler.
    -- conta_bancaria_id fica de fora: nenhuma folha foi paga ainda, escolher o
    -- banco que paga a folha e decisao do Tiago, e a fn_pagar_parcela pede a
    -- conta na hora de pagar de qualquer jeito.
    insert into public.lancamento_parcelas
      (lancamento_id, numero_parcela, valor, data_vencimento, status, created_by,
       aprovado_por, aprovado_em, data_programada, data_programada_origem)
    values (v_lanc, 1, v_item.valor_liquido, v_venc_sal, v_st_parcela, v_uid,
       case when v_aprova_pgto then v_uid end,
       case when v_aprova_pgto then now() end,
       case when v_aprova_pgto then v_venc_sal end,
       -- 'vencimento' e nao 'aprovacao': ninguem escolheu esta data numa tela,
       -- ela veio do dia parametrizado. Reprogramar depois precisa saber disso.
       case when v_aprova_pgto then 'vencimento' end)
    returning id into v_parcela;

    if v_aprova_pgto then
      insert into public.parcela_eventos (parcela_id, tipo, data_para, created_by)
      values (v_parcela, 'aprovou', v_venc_sal, v_uid);
    end if;$r$;

  -- (4) parcela da guia.
  a_guia := $a$    insert into public.lancamento_parcelas
      (lancamento_id, numero_parcela, valor, data_vencimento, status, created_by)
    values (v_lanc, 1, v_guia.total, v_venc_guia, 'pendente', v_uid);$a$;
  r_guia := $r$    -- Mesma guarda do salario, so que aqui dentro do laco: exigir o dia de
    -- vencimento das guias numa folha que nao gerou guia nenhuma seria cobrar
    -- parametro que aquela folha nao usa.
    if v_aprova_pgto and v_venc_guia is null then
      raise exception 'Defina o dia de vencimento das guias em RH > Parametros da folha: a guia % nasce com pagamento aprovado, e aprovacao sem data programada nao existe.', v_guia.grupo;
    end if;

    insert into public.lancamento_parcelas
      (lancamento_id, numero_parcela, valor, data_vencimento, status, created_by,
       aprovado_por, aprovado_em, data_programada, data_programada_origem)
    values (v_lanc, 1, v_guia.total, v_venc_guia, v_st_parcela, v_uid,
       case when v_aprova_pgto then v_uid end,
       case when v_aprova_pgto then now() end,
       case when v_aprova_pgto then v_venc_guia end,
       case when v_aprova_pgto then 'vencimento' end)
    returning id into v_parcela;

    if v_aprova_pgto then
      insert into public.parcela_eventos (parcela_id, tipo, data_para, created_by)
      values (v_parcela, 'aprovou', v_venc_guia, v_uid);
    end if;$r$;

  -- Cada ancora tem de aparecer UMA vez. As duas de parcela sao quase iguais e
  -- so a linha do `values` as separa: contar antes de trocar e o que impede uma
  -- troca acertar a outra.
  v_n := (length(v_def) - length(replace(v_def, a_declare, ''))) / length(a_declare);
  if v_n <> 1 then raise exception 'Ancora do declare aparece % vez(es), esperava 1.', v_n; end if;
  v_n := (length(v_def) - length(replace(v_def, a_venc, ''))) / length(a_venc);
  if v_n <> 1 then raise exception 'Ancora dos vencimentos aparece % vez(es), esperava 1.', v_n; end if;
  v_n := (length(v_def) - length(replace(v_def, a_sal, ''))) / length(a_sal);
  if v_n <> 1 then raise exception 'Ancora da parcela do salario aparece % vez(es), esperava 1.', v_n; end if;
  v_n := (length(v_def) - length(replace(v_def, a_guia, ''))) / length(a_guia);
  if v_n <> 1 then raise exception 'Ancora da parcela da guia aparece % vez(es), esperava 1.', v_n; end if;

  v_novo := replace(v_def, a_declare, r_declare);
  v_novo := replace(v_novo, a_venc, r_venc);
  v_novo := replace(v_novo, a_sal, r_sal);
  v_novo := replace(v_novo, a_guia, r_guia);
  execute v_novo;
end $aprovar$;

-- ---------------------------------------------------------------
-- fn_desaprovar_folha
-- ---------------------------------------------------------------
do $desaprovar$
declare v_def text; v_n int; a_trava text; r_trava text;
begin
  select pg_get_functiondef(p.oid) into v_def
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public' and p.proname = 'fn_desaprovar_folha';
  if v_def is null then
    raise exception 'fn_desaprovar_folha nao existe.';
  end if;

  a_trava := $a$    and (pa.status in ('aprovado', 'pago') or et.id is not null)$a$;
  r_trava := $r$    -- 'aprovado' saiu da trava em 29/08/2026. Com o pagamento da folha nascendo
    -- aprovado, manter 'aprovado' aqui trancaria TODA folha aprovada para
    -- sempre. O que ainda tranca e o que aconteceu com o dinheiro: parcela paga
    -- (saiu do caixa) e parcela conciliada (casou com o extrato).
    and (pa.status = 'pago' or et.id is not null)$r$;

  v_n := (length(v_def) - length(replace(v_def, a_trava, ''))) / length(a_trava);
  if v_n <> 1 then raise exception 'Ancora da trava aparece % vez(es), esperava 1.', v_n; end if;

  execute replace(v_def, a_trava, r_trava);
end $desaprovar$;

-- ---------------------------------------------------------------
-- PROVAS ESTATICAS: o texto das funcoes diz o que tem de dizer
-- ---------------------------------------------------------------
do $estatico$
declare v_apr text; v_des text; v_n int;
begin
  select pg_get_functiondef(p.oid) into v_apr from pg_proc p
  join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public' and p.proname = 'fn_aprovar_folha';
  select pg_get_functiondef(p.oid) into v_des from pg_proc p
  join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public' and p.proname = 'fn_desaprovar_folha';

  -- (a) Nenhuma parcela da folha nasce mais com 'pendente' cravado no codigo.
  --     Este e o defeito exato que a migration desfaz: se sobrasse um, aquela
  --     perna da folha continuaria exigindo o segundo aval e ninguem
  --     perceberia, porque a outra perna funciona.
  v_n := (length(v_apr) - length(replace(v_apr, $x$, 'pendente', v_uid)$x$, '')))
         / length($x$, 'pendente', v_uid)$x$);
  if v_n <> 0 then
    raise exception 'Sobraram % insert(s) de parcela com status pendente cravado.', v_n;
  end if;

  -- (b) E as DUAS pernas (salario e guia) passaram a decidir pelo status
  --     calculado: 1 no declare + 2 nos inserts.
  v_n := (length(v_apr) - length(replace(v_apr, 'v_st_parcela', ''))) / length('v_st_parcela');
  if v_n <> 3 then
    raise exception 'v_st_parcela aparece % vez(es), esperava 3 (declare + salario + guia).', v_n;
  end if;

  -- (c) As duas pernas gravam a origem da data e o evento da Trilha. Sem o
  --     evento, a parcela ficaria aprovada sem ninguem no historico dizendo
  --     quem aprovou — e a Trilha e o unico lugar que responde isso.
  v_n := (length(v_apr) - length(replace(v_apr, 'data_programada_origem', '')))
         / length('data_programada_origem');
  if v_n <> 2 then raise exception 'data_programada_origem aparece % vez(es), esperava 2.', v_n; end if;
  v_n := (length(v_apr) - length(replace(v_apr, $x$'aprovou'$x$, ''))) / length($x$'aprovou'$x$);
  if v_n <> 2 then raise exception 'O evento aprovou aparece % vez(es), esperava 2.', v_n; end if;

  -- (d) As duas guardas de data existem, uma por perna.
  if position('Defina o dia de pagamento do salario' in v_apr) = 0
     or position('Defina o dia de vencimento das guias' in v_apr) = 0 then
    raise exception 'Faltou alguma das guardas de data programada.';
  end if;

  -- (e) A ancora nao levou junto o resto da funcao. Estas tres sao de pernas
  --     diferentes (diarista, competencia, guias): se o replace tivesse comido
  --     um trecho grande, alguma cairia.
  if position('As diarias de % mudaram depois que a folha' in v_apr) = 0
     or position('fn_exigir_competencia_aberta' in v_apr) = 0
     or position('insert into public.folha_guias' in v_apr) = 0 then
    raise exception 'A ancora levou junto outra parte da fn_aprovar_folha.';
  end if;

  -- (f) Desaprovar: 'aprovado' saiu da trava, 'pago' e conciliacao ficaram.
  --     A terceira condicao e a que prova que afrouxei so o que queria: se o
  --     replace tivesse comido a linha inteira, conciliada pararia de travar e
  --     a folha apagaria lancamento que ja casou com o extrato do banco.
  if position($x$pa.status in ('aprovado', 'pago')$x$ in v_des) <> 0 then
    raise exception 'A trava de desaprovar ainda recusa parcela aprovada.';
  end if;
  if position($x$pa.status = 'pago'$x$ in v_des) = 0 then
    raise exception 'A trava de parcela paga sumiu da desaprovacao.';
  end if;
  if position('et.id is not null' in v_des) = 0 then
    raise exception 'A trava de parcela conciliada sumiu da desaprovacao.';
  end if;

  raise notice 'Provas estaticas ok.';
end $estatico$;

-- ---------------------------------------------------------------
-- PROVA COMPORTAMENTAL: aprova a folha DE VERDADE e desfaz
-- ---------------------------------------------------------------
-- Texto de funcao nao prova comportamento. Este bloco chama a
-- `fn_aprovar_folha` na folha que estiver esperando aprovacao, personificando
-- duas pessoas reais, mede o resultado e desfaz tudo com um `raise` dentro de
-- sub-bloco (as escritas voltam atras; as variaveis de plpgsql sao memoria e
-- sobrevivem, que e o que permite comparar depois).
--
-- Sao TRES linhas, e a graca esta na diferenca entre elas:
--   controle 1 ... sem parametro de dia: TEM de falhar na guarda nova
--   positiva ..... com parametro, quem aprova pagamento: parcelas aprovadas
--   controle 2 ... com parametro, quem NAO aprova pagamento: parcelas pendentes
-- A positiva e o controle 2 rodam sobre a MESMA folha, entao a comparacao e por
-- relacao (mesmo total de parcelas, aprovadas 100% x 0%) e nao por um numero
-- congelado que envelhece na proxima folha.
do $ensaio$
declare
  v_folha uuid;
  -- Quem aprova folha E pagamento x quem aprova so a folha. Lidos por
  -- permissao, nao por nome cravado: se o Tiago mudar a matriz, o ensaio pega a
  -- pessoa certa em vez de provar sobre um id que nao vale mais.
  v_com_pgto uuid; v_sem_pgto uuid;
  v_guarda_pegou boolean := false; v_erro text;
  v_n_com int := -1; v_apr_com int := -1; v_prog_com int := -1; v_ev_com int := -1;
  v_n_sem int := -1; v_apr_sem int := -1;
begin
  select id into v_folha from public.folhas
  where status = 'pendente_aprovacao' order by competencia limit 1;

  select up.usuario_id into v_com_pgto
  from public.usuario_permissoes up
  where up.recurso = 'rh.folha' and up.acao = 'aprovar'
    and exists (select 1 from public.usuario_permissoes u2
                where u2.usuario_id = up.usuario_id
                  and u2.recurso = 'financeiro.aprovacao-pagamentos' and u2.acao = 'aprovar')
  limit 1;

  select up.usuario_id into v_sem_pgto
  from public.usuario_permissoes up
  where up.recurso = 'rh.folha' and up.acao = 'aprovar'
    and not exists (select 1 from public.usuario_permissoes u2
                    where u2.usuario_id = up.usuario_id
                      and u2.recurso = 'financeiro.aprovacao-pagamentos' and u2.acao = 'aprovar')
  limit 1;

  if v_folha is null or v_com_pgto is null then
    -- Silencio aqui seria pior que barulho: quem le o log precisa saber que a
    -- prova comportamental NAO rodou, e nao supor que ela passou.
    raise warning 'ENSAIO NAO RODOU: folha esperando aprovacao=%, usuario que aprova pagamento=%',
      v_folha, v_com_pgto;
    return;
  end if;

  -- ---- controle 1: sem dia de pagamento, a guarda nova tem de recusar ----
  begin
    perform set_config('request.jwt.claims',
      json_build_object('sub', v_com_pgto, 'role', 'authenticated')::text, true);
    delete from public.folha_parametros where id = 1;
    perform public.fn_aprovar_folha(v_folha);
    raise exception 'CONTROLE_1_PASSOU_E_NAO_DEVIA';
  exception when others then
    v_erro := sqlerrm;
    if v_erro = 'CONTROLE_1_PASSOU_E_NAO_DEVIA' then
      raise exception 'A folha aprovou o pagamento sem dia de pagamento definido: a guarda nao pegou.';
    end if;
    v_guarda_pegou := position('Defina o dia de pagamento do salario' in v_erro) > 0;
  end;

  if not v_guarda_pegou then
    raise exception 'Controle 1 falhou por outro motivo: %', v_erro;
  end if;

  -- ---- positiva: com dia de pagamento, quem aprova pagamento ----
  begin
    perform set_config('request.jwt.claims',
      json_build_object('sub', v_com_pgto, 'role', 'authenticated')::text, true);
    insert into public.folha_parametros (id, dia_pagamento_salario, dia_vencimento_guias)
    values (1, 5, 20)
    on conflict (id) do update
      set dia_pagamento_salario = 5, dia_vencimento_guias = 20;

    perform public.fn_aprovar_folha(v_folha);

    select count(*),
           count(*) filter (where pa.status = 'aprovado'),
           count(*) filter (where pa.data_programada = pa.data_vencimento
                              and pa.data_programada_origem = 'vencimento'
                              and pa.aprovado_por = v_com_pgto
                              and pa.aprovado_em is not null),
           count(*) filter (where exists (select 1 from public.parcela_eventos ev
                                          where ev.parcela_id = pa.id and ev.tipo = 'aprovou'
                                            and ev.data_para = pa.data_vencimento))
    into v_n_com, v_apr_com, v_prog_com, v_ev_com
    from public.lancamento_parcelas pa
    join public.lancamentos l on l.id = pa.lancamento_id
    where (l.origem = 'folha'      and l.origem_id in (select id from public.folha_itens where folha_id = v_folha))
       or (l.origem = 'folha_guia' and l.origem_id in (select id from public.folha_guias where folha_id = v_folha));

    raise exception 'DESFAZER';
  exception when others then
    v_erro := sqlerrm;
    if v_erro <> 'DESFAZER' then
      raise exception 'Ensaio da aprovacao COM permissao de pagamento falhou: %', v_erro;
    end if;
  end;

  -- ---- controle 2: mesma folha, quem NAO aprova pagamento ----
  if v_sem_pgto is not null then
    begin
      perform set_config('request.jwt.claims',
        json_build_object('sub', v_sem_pgto, 'role', 'authenticated')::text, true);
      insert into public.folha_parametros (id, dia_pagamento_salario, dia_vencimento_guias)
      values (1, 5, 20)
      on conflict (id) do update
        set dia_pagamento_salario = 5, dia_vencimento_guias = 20;

      perform public.fn_aprovar_folha(v_folha);

      select count(*), count(*) filter (where pa.status = 'aprovado')
      into v_n_sem, v_apr_sem
      from public.lancamento_parcelas pa
      join public.lancamentos l on l.id = pa.lancamento_id
      where (l.origem = 'folha'      and l.origem_id in (select id from public.folha_itens where folha_id = v_folha))
         or (l.origem = 'folha_guia' and l.origem_id in (select id from public.folha_guias where folha_id = v_folha));

      raise exception 'DESFAZER';
    exception when others then
      v_erro := sqlerrm;
      if v_erro <> 'DESFAZER' then
        raise exception 'Ensaio da aprovacao SEM permissao de pagamento falhou: %', v_erro;
      end if;
    end;
  end if;

  perform set_config('request.jwt.claims', '', true);

  -- ---- o que os tres ensaios tem de dizer ----
  -- Zero parcela nao prova nada: uma folha que nao gerou lancamento passaria em
  -- qualquer assercao de "todas estao aprovadas".
  if coalesce(v_n_com, 0) = 0 then
    raise exception 'A folha do ensaio nao gerou parcela nenhuma: a prova nao mede nada.';
  end if;
  if v_apr_com <> v_n_com then
    raise exception 'So % de % parcelas nasceram aprovadas.', v_apr_com, v_n_com;
  end if;
  if v_prog_com <> v_n_com then
    raise exception 'So % de % parcelas nasceram com data programada, origem e aprovador certos.',
      v_prog_com, v_n_com;
  end if;
  if v_ev_com <> v_n_com then
    raise exception 'So % de % parcelas gravaram o evento aprovou na Trilha.', v_ev_com, v_n_com;
  end if;

  if v_sem_pgto is not null then
    -- A diferenca e a prova: MESMA folha, mesmo total de parcelas, e o status
    -- muda so por causa de quem clicou.
    if v_n_sem <> v_n_com then
      raise exception 'Os dois ensaios geraram numeros diferentes de parcela (% x %): nao da para comparar.',
        v_n_com, v_n_sem;
    end if;
    if v_apr_sem <> 0 then
      raise exception 'Quem NAO pode aprovar pagamento aprovou % parcela(s).', v_apr_sem;
    end if;
  end if;

  raise notice 'Ensaio ok: % de % parcelas nascem aprovadas com quem aprova pagamento, e 0 de % com quem nao aprova.',
    v_apr_com, v_n_com, v_n_sem;
end $ensaio$;
