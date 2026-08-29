-- =============================================================
-- Folha: data de vencimento escolhida na propria folha
-- =============================================================
-- PEDIDO DO TIAGO (29/08/2026): "quando a folha esta em rascunho tem que ter um
-- campo para colocar a data de vencimento da folha que e o mesmo que vai
-- aparecer nos lancamentos".
--
-- Ate aqui a data saia SO de `folha_parametros.dia_pagamento_salario`, um dia do
-- mes fixo para todas as folhas. Isso nao aguenta a realidade: o dia 5 cai num
-- domingo, o mes fecha atrasado, um mes especifico paga antes por causa de
-- feriado. Amarrar todas as folhas ao mesmo dia obriga a mexer no parametro
-- global (que vale para as proximas) so para acertar uma.
--
-- Agora a folha tem data propria, e ela MANDA:
--   data na folha .......... e o vencimento e a data programada do pagamento
--   sem data na folha ...... cai no dia parametrizado, como antes
--
-- ============================================================
-- POR QUE UMA RPC, E NAO UM UPDATE DIRETO
-- ============================================================
-- Medido em 29/08/2026: em `folhas` o `authenticated` tem SELECT na tabela e
-- UPDATE em DUAS COLUNAS SO — `status` e `motivo_rejeicao`. Todo o resto e
-- escrito por funcao SECURITY DEFINER. Coluna nova nao herda UPDATE nenhum, e
-- e assim que tem de continuar: dar `update (data_vencimento)` ao
-- `authenticated` abriria a coluna para qualquer PostgREST, e a regra de "so em
-- rascunho" teria de ser reimplementada num trigger para valer.
--
-- Com a RPC a porta e unica: quem escreve a coluna e a funcao, e a funcao cobra
-- permissao e status antes. Menos superficie e menos lugar para a regra
-- divergir.
--
-- ============================================================
-- SO A DATA DO SALARIO
-- ============================================================
-- A folha gera dois tipos de lancamento: salario por colaborador e guia por
-- grupo de recolhimento. A data da folha vale para o SALARIO. A guia continua no
-- `dia_vencimento_guias`, porque o vencimento de recolhimento e prazo legal, nao
-- escolha da empresa — INSS e FGTS tem data propria e junta-las seria inventar
-- regra fiscal. (Medido hoje: esta folha nao gera guia nenhuma, porque nenhum
-- encargo dela tem grupo de recolhimento configurado.)

alter table public.folhas add column data_vencimento date;

comment on column public.folhas.data_vencimento is
  'Vencimento escolhido para ESTA folha, editavel so em rascunho pela fn_definir_vencimento_folha. Quando preenchida, manda no vencimento e na data programada dos lancamentos de salario; quando null, vale folha_parametros.dia_pagamento_salario. Nao vale para as guias, que tem prazo legal proprio.';

-- ---------------------------------------------------------------
-- fn_definir_vencimento_folha
-- ---------------------------------------------------------------
create or replace function public.fn_definir_vencimento_folha(
  p_folha uuid,
  p_data date
)
returns void
language plpgsql
security definer
set search_path to ''
as $function$
declare v_status text; v_comp date;
begin
  if not public.tem_permissao('rh.folha', 'editar') then
    raise exception 'Sem permissao para editar a folha';
  end if;

  select status, competencia into v_status, v_comp
  from public.folhas where id = p_folha for update;

  if v_status is null then raise exception 'Folha nao encontrada'; end if;

  -- So em rascunho, como o Tiago pediu. Depois de enviada a folha esta na mao
  -- de quem aprova, e mudar a data debaixo dela trocaria o que a pessoa
  -- autorizou sem ela ver. Quem precisar corrigir usa "Voltar para rascunho".
  if v_status <> 'rascunho' then
    raise exception 'A folha de %/% esta em "%": a data de vencimento so muda com a folha em rascunho. Volte a folha para rascunho antes.',
      to_char(v_comp, 'MM'), to_char(v_comp, 'YYYY'), v_status;
  end if;

  -- Guarda de digitacao, nao regra de negocio: vencimento ANTES do mes da
  -- competencia e sempre erro (ano errado, tipicamente), e programaria 47
  -- pagamentos para uma data que ja passou. O limite e frouxo de proposito —
  -- pagar dentro do proprio mes da competencia e legitimo.
  if p_data is not null and p_data < date_trunc('month', v_comp)::date then
    raise exception 'A data de vencimento (%) e anterior ao mes da competencia (%/%).',
      to_char(p_data, 'DD/MM/YYYY'), to_char(v_comp, 'MM'), to_char(v_comp, 'YYYY');
  end if;

  -- null e apagar a data escolhida e voltar ao dia parametrizado. E o unico
  -- jeito de desfazer sem regerar a folha.
  update public.folhas set data_vencimento = p_data where id = p_folha;
end;
$function$;

comment on function public.fn_definir_vencimento_folha(uuid, date) is
  'Define (ou limpa, com null) a data de vencimento da folha. So em rascunho e so com rh.folha:editar. A coluna nao tem grant de UPDATE para authenticated: esta funcao e a unica porta.';

revoke all on function public.fn_definir_vencimento_folha(uuid, date)
  from public, anon;
grant execute on function public.fn_definir_vencimento_folha(uuid, date)
  to authenticated;

-- ---------------------------------------------------------------
-- fn_aprovar_folha: a data da folha manda no vencimento do salario
-- ---------------------------------------------------------------
-- Editada por ANCORA a partir da definicao viva: varias frentes mexem nesta
-- funcao e `create or replace` sobrescreve sem dar conflito.
do $aprovar$
declare
  v_def text; v_novo text; v_n int;
  a_decl text; r_decl text;
  a_sel text;  r_sel text;
  a_calc text; r_calc text;
  a_msg text;  r_msg text;
begin
  select pg_get_functiondef(p.oid) into v_def
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public' and p.proname = 'fn_aprovar_folha';
  if v_def is null then
    raise exception 'fn_aprovar_folha nao existe.';
  end if;

  a_decl := $a$  v_venc_sal date; v_venc_guia date;$a$;
  r_decl := $r$  v_venc_sal date; v_venc_guia date;
  -- Data escolhida na propria folha. Quando existe, manda no vencimento do
  -- salario e o dia parametrizado nao e consultado.
  v_venc_folha date;$r$;

  a_sel := $a$  select status, competencia into v_status, v_comp
  from public.folhas where id = p_folha for update;$a$;
  r_sel := $r$  select status, competencia, data_vencimento
  into v_status, v_comp, v_venc_folha
  from public.folhas where id = p_folha for update;$r$;

  a_calc := $a$  v_venc_sal  := public.fn_vencimento_folha(v_comp, v_dia_sal);$a$;
  r_calc := $r$  -- A data da folha manda; o dia parametrizado e o padrao de quando ninguem
  -- escolheu. Invertida, a ordem faria o campo da tela nao servir para nada.
  v_venc_sal  := coalesce(v_venc_folha, public.fn_vencimento_folha(v_comp, v_dia_sal));$r$;

  a_msg := $a$    raise exception 'Defina o dia de pagamento do salario em RH > Parametros da folha: o pagamento da folha nasce aprovado, e aprovacao sem data programada nao existe.';$a$;
  r_msg := $r$    raise exception 'Esta folha esta sem data de vencimento. Volte a folha para rascunho e preencha a data de vencimento, ou defina o dia de pagamento do salario em RH > Parametros da folha. O pagamento nasce aprovado, e aprovacao sem data programada nao existe.';$r$;

  v_n := (length(v_def) - length(replace(v_def, a_decl, ''))) / length(a_decl);
  if v_n <> 1 then raise exception 'Ancora do declare aparece % vez(es), esperava 1.', v_n; end if;
  v_n := (length(v_def) - length(replace(v_def, a_sel, ''))) / length(a_sel);
  if v_n <> 1 then raise exception 'Ancora do select da folha aparece % vez(es), esperava 1.', v_n; end if;
  -- A linha do salario e a da guia sao parecidas; contar e o que garante que a
  -- troca nao acerta a da guia, que tem de continuar no prazo legal dela.
  v_n := (length(v_def) - length(replace(v_def, a_calc, ''))) / length(a_calc);
  if v_n <> 1 then raise exception 'Ancora do calculo do vencimento aparece % vez(es), esperava 1.', v_n; end if;
  v_n := (length(v_def) - length(replace(v_def, a_msg, ''))) / length(a_msg);
  if v_n <> 1 then raise exception 'Ancora da mensagem da guarda aparece % vez(es), esperava 1.', v_n; end if;

  v_novo := replace(v_def, a_decl, r_decl);
  v_novo := replace(v_novo, a_sel, r_sel);
  v_novo := replace(v_novo, a_calc, r_calc);
  v_novo := replace(v_novo, a_msg, r_msg);
  execute v_novo;
end $aprovar$;

-- ---------------------------------------------------------------
-- PROVAS ESTATICAS
-- ---------------------------------------------------------------
do $estatico$
declare v_apr text; v_n int; v_tipo text; v_nulavel text;
begin
  -- (a) A coluna existe, e date e aceita null (null = cai no parametro).
  select data_type, is_nullable into v_tipo, v_nulavel
  from information_schema.columns
  where table_schema = 'public' and table_name = 'folhas' and column_name = 'data_vencimento';
  if v_tipo is distinct from 'date' or v_nulavel is distinct from 'YES' then
    raise exception 'folhas.data_vencimento saiu como % / nulavel %, esperava date / YES.', v_tipo, v_nulavel;
  end if;

  -- (b) A tela LE a coluna, e ninguem a escreve direto. As duas metades
  --     importam: sem o SELECT o campo nasce vazio na tela; com o UPDATE a
  --     regra de "so em rascunho" deixa de valer sem nada quebrar
  --     visivelmente, porque o PostgREST passaria a escrever a coluna direto.
  if not has_column_privilege('authenticated', 'public.folhas', 'data_vencimento', 'SELECT') then
    raise exception 'authenticated nao consegue ler folhas.data_vencimento: o campo nasceria vazio na tela.';
  end if;
  if has_column_privilege('authenticated', 'public.folhas', 'data_vencimento', 'UPDATE') then
    raise exception 'folhas.data_vencimento ganhou grant de UPDATE: a RPC deixou de ser a unica porta.';
  end if;

  -- (c) A RPC existe, e SECURITY DEFINER, e so o authenticated executa. Funcao
  --     nova nasce com EXECUTE para PUBLIC: sem o revoke, o anon executaria.
  if not exists (
    select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname = 'fn_definir_vencimento_folha' and p.prosecdef
  ) then
    raise exception 'fn_definir_vencimento_folha nao existe ou nao e security definer.';
  end if;
  if not has_function_privilege('authenticated', 'public.fn_definir_vencimento_folha(uuid, date)', 'EXECUTE') then
    raise exception 'authenticated nao pode executar fn_definir_vencimento_folha.';
  end if;
  if has_function_privilege('anon', 'public.fn_definir_vencimento_folha(uuid, date)', 'EXECUTE') then
    raise exception 'anon ainda pode executar fn_definir_vencimento_folha.';
  end if;

  select pg_get_functiondef(p.oid) into v_apr
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public' and p.proname = 'fn_aprovar_folha';

  -- (d) O salario passou a coalescer, e a guia NAO. Se as duas coalescessem, a
  --     guia de INSS venceria junto com o salario — prazo legal trocado por
  --     escolha da empresa.
  v_n := (length(v_apr) - length(replace(v_apr, 'coalesce(v_venc_folha', ''))) / length('coalesce(v_venc_folha');
  if v_n <> 1 then raise exception 'coalesce(v_venc_folha aparece % vez(es), esperava 1 (so o salario).', v_n; end if;
  if position('v_venc_guia := public.fn_vencimento_folha(v_comp, v_dia_guia);' in v_apr) = 0 then
    raise exception 'A linha da guia mudou: ela tem de continuar so no dia parametrizado.';
  end if;

  -- (e) A funcao passou a LER a coluna. Sem isto o coalesce coalesceria sempre
  --     null e o campo da tela nao faria efeito nenhum.
  if position('data_vencimento' in v_apr) = 0 then
    raise exception 'fn_aprovar_folha nao le folhas.data_vencimento.';
  end if;

  -- (f) A ancora nao levou junto o resto: estas sao de pernas diferentes.
  if position('As diarias de % mudaram depois que a folha' in v_apr) = 0
     or position('fn_exigir_competencia_aberta' in v_apr) = 0
     or position('v_st_parcela' in v_apr) = 0 then
    raise exception 'A ancora levou junto outra parte da fn_aprovar_folha.';
  end if;

  raise notice 'Provas estaticas ok.';
end $estatico$;

-- ---------------------------------------------------------------
-- PROVA COMPORTAMENTAL: a data da folha chega nos lancamentos
-- ---------------------------------------------------------------
-- Aprova a folha DE VERDADE com uma data escolhida na folha, mede o vencimento
-- que chegou nas parcelas e desfaz tudo com `raise` dentro de sub-bloco.
--
-- A LINHA DE CONTROLE E A DATA DO PARAMETRO. O ensaio grava dia 5 no parametro
-- (que daria 05 do mes seguinte) e uma data DIFERENTE na folha. Se as parcelas
-- saissem com a data do parametro, ou se as duas fossem iguais por acaso, a
-- prova acusa: ela exige que as duas datas sejam diferentes ANTES de comparar.
-- O ensaio DIRIGE o status da folha em vez de procurar uma num status
-- especifico. Escrito assim porque a primeira versao procurava
-- `pendente_aprovacao`, o Tiago devolveu a folha para rascunho no meio, o bloco
-- caiu no "nao deu para rodar" e RETORNOU — e ensaio que retorna em vez de
-- estourar deixa a transacao COMMITAR. Prova que depende do estado que
-- encontrou nao e prova: e sorte.
do $ensaio$
declare
  v_folha uuid; v_comp date;
  v_com_pgto uuid;
  v_escolhida date; v_do_parametro date;
  v_n int := -1; v_com_a_data int := -1;
  v_recusou_fora_do_rascunho boolean := false;
  v_recusou_data_velha boolean := false;
  v_erro text;
begin
  -- Qualquer folha que ainda de para mexer serve; a aprovada nao, porque a RLS
  -- e a guarda de status recusariam e o ensaio mediria a trava, nao a mudanca.
  select id, competencia into v_folha, v_comp
  from public.folhas where status <> 'aprovado' order by competencia limit 1;

  select up.usuario_id into v_com_pgto
  from public.usuario_permissoes up
  where up.recurso = 'rh.folha' and up.acao = 'aprovar'
    and exists (select 1 from public.usuario_permissoes u2
                where u2.usuario_id = up.usuario_id
                  and u2.recurso = 'financeiro.aprovacao-pagamentos' and u2.acao = 'aprovar')
  limit 1;

  if v_folha is null or v_com_pgto is null then
    -- Barulho, e nao silencio: quem le o log tem de saber que a prova NAO
    -- rodou, em vez de supor que passou.
    raise warning 'ENSAIO NAO RODOU: folha mexivel=%, usuario que aprova pagamento=%',
      v_folha, v_com_pgto;
    return;
  end if;

  -- A data do parametro e a data escolhida TEM de ser diferentes, senao o
  -- ensaio passaria mesmo se a funcao ignorasse a folha inteira.
  v_do_parametro := public.fn_vencimento_folha(v_comp, 5::smallint);
  v_escolhida := v_do_parametro + 6;
  if v_escolhida = v_do_parametro then
    raise exception 'As duas datas do ensaio ficaram iguais: a prova nao distinguiria nada.';
  end if;

  perform set_config('request.jwt.claims',
    json_build_object('sub', v_com_pgto, 'role', 'authenticated')::text, true);

  -- UM sub-bloco para tudo, terminado em `raise`: toda escrita daqui para baixo
  -- volta atras, inclusive as trocas de status que o proprio ensaio faz.
  begin
    -- ---- controle A: fora do rascunho a RPC tem de recusar ----
    update public.folhas set status = 'pendente_aprovacao' where id = v_folha;
    begin
      perform public.fn_definir_vencimento_folha(v_folha, v_escolhida);
      raise exception 'CONTROLE_A_PASSOU_E_NAO_DEVIA';
    exception when others then
      v_erro := sqlerrm;
      if v_erro = 'CONTROLE_A_PASSOU_E_NAO_DEVIA' then
        raise exception 'A data mudou com a folha fora do rascunho: a trava nao pegou.';
      end if;
      v_recusou_fora_do_rascunho := position('so muda com a folha em rascunho' in v_erro) > 0;
    end;
    if not v_recusou_fora_do_rascunho then
      raise exception 'Controle A falhou por outro motivo: %', v_erro;
    end if;

    update public.folhas set status = 'rascunho' where id = v_folha;

    -- ---- controle B: data anterior ao mes da competencia tem de ser recusada ----
    begin
      perform public.fn_definir_vencimento_folha(v_folha, (date_trunc('month', v_comp) - interval '1 day')::date);
      raise exception 'CONTROLE_B_PASSOU_E_NAO_DEVIA';
    exception when others then
      v_erro := sqlerrm;
      if v_erro = 'CONTROLE_B_PASSOU_E_NAO_DEVIA' then
        raise exception 'A RPC aceitou vencimento anterior ao mes da competencia.';
      end if;
      v_recusou_data_velha := position('anterior ao mes da competencia' in v_erro) > 0;
    end;
    if not v_recusou_data_velha then
      raise exception 'Controle B falhou por outro motivo: %', v_erro;
    end if;

    perform public.fn_definir_vencimento_folha(v_folha, v_escolhida);

    insert into public.folha_parametros (id, dia_pagamento_salario, dia_vencimento_guias)
    values (1, 5, 20)
    on conflict (id) do update set dia_pagamento_salario = 5, dia_vencimento_guias = 20;

    update public.folhas set status = 'pendente_aprovacao' where id = v_folha;
    perform public.fn_aprovar_folha(v_folha);

    select count(*),
           count(*) filter (where pa.data_vencimento = v_escolhida
                              and pa.data_programada = v_escolhida)
    into v_n, v_com_a_data
    from public.lancamento_parcelas pa
    join public.lancamentos l on l.id = pa.lancamento_id
    where l.origem = 'folha'
      and l.origem_id in (select id from public.folha_itens where folha_id = v_folha);

    raise exception 'DESFAZER';
  exception when others then
    v_erro := sqlerrm;
    if v_erro <> 'DESFAZER' then
      raise exception 'Ensaio da aprovacao com data na folha falhou: %', v_erro;
    end if;
  end;

  perform set_config('request.jwt.claims', '', true);

  if coalesce(v_n, 0) = 0 then
    raise exception 'A folha do ensaio nao gerou parcela de salario: a prova nao mede nada.';
  end if;
  if v_com_a_data <> v_n then
    raise exception 'So % de % parcelas sairam com a data escolhida na folha (%); o parametro daria %.',
      v_com_a_data, v_n, v_escolhida, v_do_parametro;
  end if;

  raise notice 'Ensaio ok: % de % parcelas de salario venceram em % (a data da folha), e nao em % (a do parametro).',
    v_com_a_data, v_n, v_escolhida, v_do_parametro;
end $ensaio$;
