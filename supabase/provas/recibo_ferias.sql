-- Prova do recibo de ferias (Bloco 8d).
--
-- A prova CHAMA as RPCs: plpgsql so valida as queries do corpo na PRIMEIRA
-- EXECUCAO, entao `apply_migration` devolver success nao prova nada.
--
-- O app nao calcula ferias, entao nao ha formula a conferir. O unico numero
-- e a subtracao: 1.000,00 - 80,00 - 20,00 = 900,00.
--
-- A prova roda como `authenticated`, nao como postgres, e a releitura depois
-- de cada RPC passa pela RLS. Isto nao e detalhe: foi assim que apareceu que
-- as policies de rh_ferias ainda chamavam `tem_permissao('rh.ferias', ...)`,
-- um recurso que deixou de existir em 12/09/2026, e por isso devolviam ZERO
-- linha para todo mundo (consertado em 20260918100000).
--
-- Dai a assercao A0. Sem ela a prova passaria com a tabela invisivel: com
-- `select ... into` sem linha toda variavel fica NULA, e `if a_recibo <>
-- 'rascunho'` com a_recibo nulo da NULL, que o `if` trata como falso e nao
-- levanta nada. Comparacao de igualdade nao acusa ausencia: quem prova
-- ausencia e contar a linha ou usar `is distinct from`.

do $prova$
declare
  v_tiago uuid := 'c66fca9f-5428-4fb9-855f-dcff548764df';  -- Admin
  v_colab uuid; v_ferias uuid;
  a_visiveis int;
  a_status text; a_recibo text; a_liq numeric; a_cc uuid; a_cc_colab uuid;
  b_liq numeric;
  c_erro text := '(NAO RECUSOU)';
  d_erro text := '(NAO RECUSOU)';
  e_status text; f_status text; f_motivo text;
  g_status text; g_motivo text;
  h_erro text := '(NAO RECUSOU)';
begin
  -- Com centro de custo: sem ele a assercao de centro compararia null com
  -- null e passaria sem provar nada.
  select id, centro_custo_id into v_colab, a_cc_colab
    from public.colaboradores where ativo and centro_custo_id is not null limit 1;
  if v_colab is null then raise exception 'FALHOU: nenhum colaborador ativo com centro de custo'; end if;

  perform set_config('request.jwt.claims', json_build_object('sub', v_tiago, 'role','authenticated')::text, true);
  execute 'set local role authenticated';

  -- A) lancar cria a linha E o recibo
  v_ferias := public.fn_lancar_ferias(
    v_colab, date '2025-01-01', date '2025-12-31',
    date '2026-03-02', date '2026-03-31', 30, 'programada',
    1000.00, 80.00, 20.00, null, 'prova');

  -- A0) a linha que a RPC gravou tem que ser VISIVEL para quem a gravou.
  -- A RPC e security definer e escreve por cima da RLS; a tela le direto e
  -- passa por ela. Se as duas discordarem, a tela mostra "nenhuma ferias
  -- cadastrada" logo depois de cadastrar, sem erro nenhum.
  select count(*) into a_visiveis from public.rh_ferias where id = v_ferias;
  if a_visiveis <> 1 then
    raise exception 'FALHOU: a RPC gravou mas o usuario nao enxerga a linha (RLS de rh_ferias)';
  end if;

  select status, status_recibo, valor_liquido, centro_custo_id
    into a_status, a_recibo, a_liq, a_cc
    from public.rh_ferias where id = v_ferias;

  if a_status <> 'programada' then raise exception 'FALHOU gozo: veio %', a_status; end if;
  if a_recibo <> 'rascunho' then raise exception 'FALHOU recibo: veio %', a_recibo; end if;
  if a_liq <> 900.00 then raise exception 'FALHOU liquido: esperado 900.00, veio %', a_liq; end if;
  if a_cc is distinct from a_cc_colab then
    raise exception 'FALHOU: centro de custo nao veio do colaborador';
  end if;

  -- B) editar regrava e o trigger refaz o liquido
  perform public.fn_editar_recibo_ferias(v_ferias, 500.00, 0, 0);
  select valor_liquido into b_liq from public.rh_ferias where id = v_ferias;
  if b_liq <> 500.00 then raise exception 'FALHOU edicao: veio %', b_liq; end if;

  -- C) CONTROLE: desconto maior que o bruto
  begin
    perform public.fn_editar_recibo_ferias(v_ferias, 100.00, 90.00, 90.00);
  exception when others then c_erro := sqlerrm; end;
  if c_erro = '(NAO RECUSOU)' then raise exception 'FALHOU: aceitou desconto > bruto'; end if;

  -- D) CONTROLE: lancar sem dias
  begin
    perform public.fn_lancar_ferias(
      v_colab, date '2025-01-01', date '2025-12-31',
      date '2026-03-02', date '2026-03-31', 0, 'programada', 100.00);
  exception when others then d_erro := sqlerrm; end;
  if d_erro = '(NAO RECUSOU)' then raise exception 'FALHOU: lancou ferias sem dias'; end if;

  -- E) enviar
  perform public.fn_enviar_recibo_ferias_aprovacao(v_ferias);
  select status_recibo into e_status from public.rh_ferias where id = v_ferias;
  if e_status <> 'pendente_aprovacao' then raise exception 'FALHOU envio: %', e_status; end if;

  -- F) devolver volta para rascunho COM motivo, e de la da para editar
  perform public.fn_rejeitar_recibo_ferias(v_ferias, '  valor errado  ');
  select status_recibo, motivo_rejeicao into f_status, f_motivo
    from public.rh_ferias where id = v_ferias;
  if f_status <> 'rascunho' then raise exception 'FALHOU devolucao: %', f_status; end if;
  if f_motivo <> 'valor errado' then raise exception 'FALHOU motivo sem trim: "%"', f_motivo; end if;
  perform public.fn_editar_recibo_ferias(v_ferias, 600.00, 0, 0);

  -- G) VOLTAR PARA RASCUNHO, do lado de quem montou: enviar de novo e trazer
  -- de volta SEM motivo. E o caminho que faltou no 13o e deixou um lote preso
  -- em pendente_aprovacao com a tela inteira em so leitura.
  perform public.fn_enviar_recibo_ferias_aprovacao(v_ferias);
  perform public.fn_voltar_recibo_ferias_para_rascunho(v_ferias);
  select status_recibo, motivo_rejeicao into g_status, g_motivo
    from public.rh_ferias where id = v_ferias;
  if g_status <> 'rascunho' then raise exception 'FALHOU voltar: %', g_status; end if;
  if g_motivo is not null then
    raise exception 'FALHOU: voltar para rascunho deixou motivo gravado ("%"), e nao e recusa', g_motivo;
  end if;
  -- O ponto de voltar e poder editar de novo. Se isto estourar, voltar nao
  -- serviu para nada.
  perform public.fn_editar_recibo_ferias(v_ferias, 700.00, 0, 0);

  -- H) CONTROLE: voltar de novo, ja estando em rascunho
  begin
    perform public.fn_voltar_recibo_ferias_para_rascunho(v_ferias);
  exception when others then h_erro := sqlerrm; end;
  if h_erro = '(NAO RECUSOU)' then raise exception 'FALHOU: voltou um recibo que ja estava em rascunho'; end if;

  reset role;
  raise exception E'PROVA RECIBO DE FERIAS - parte 1 (desfeita)\n  A0) a linha gravada e visivel para quem gravou: % linha\n  A) lancou: gozo=% recibo=% liquido=% centro do colaborador? %\n  B) editou -> %\n  C) CONTROLE desconto > bruto -> %\n  D) CONTROLE lancar sem dias -> %\n  E) enviou -> %\n  F) devolveu -> % motivo="%" e deu para editar\n  G) voltou para % sem motivo, e deu para editar de novo\n  H) CONTROLE voltar ja em rascunho -> %',
    a_visiveis, a_status, a_recibo, a_liq, (a_cc = a_cc_colab), b_liq, c_erro, d_erro, e_status, f_status, f_motivo, g_status, h_erro;
end $prova$;

-- Resultado em 18/09/2026:
--
--   A0) a linha gravada e visivel para quem gravou: 1 linha
--   A) lancou: gozo=programada recibo=rascunho liquido=900.00 centro do
--      colaborador? t
--   B) editou -> 500.00
--   C) CONTROLE desconto > bruto -> Os descontos (180.00) passam do bruto
--      (100.00): o liquido ficaria negativo.
--   D) CONTROLE lancar sem dias -> Informe quantos dias de ferias.
--   E) enviou -> pendente_aprovacao
--   F) devolveu -> rascunho motivo="valor errado" e deu para editar
--   G) voltou para rascunho sem motivo, e deu para editar de novo
--   H) CONTROLE voltar ja em rascunho -> O recibo esta em "rascunho": so da
--      para voltar para rascunho o que esta pendente.
--
-- 1.000,00 - 80,00 - 20,00 = 900,00 confere com a conta feita a mao.
--
-- Antes do conserto das policies (20260918100000), A0 devolvia 0 linha e a
-- unica assercao que acusava era a do centro de custo, por usar
-- `is distinct from`. Todas as de igualdade passavam batido comparando nulo.

-- ---------------------------------------------------------------------------
-- Parte 1b: o revoke do anon (migration 20260918110000)
-- ---------------------------------------------------------------------------
--
-- Revogar privilegio e a hora classica de derrubar producao: fecha para o anon
-- e fecha para o logado junto, e a tela so descobre no clique. Entao a prova
-- roda os DOIS papeis na mesma transacao.

do $prova$
declare
  v_tiago uuid := 'c66fca9f-5428-4fb9-855f-dcff548764df';  -- Admin
  v_colab uuid; v_ferias uuid;
  a_visiveis int; a_liq numeric; a_cc uuid; a_cc_colab uuid;
  e_status text; h_erro text := '(NAO RECUSOU)';
  v_anon_erro text := '(NAO RECUSOU)';
begin
  select id, centro_custo_id into v_colab, a_cc_colab
    from public.colaboradores where ativo and centro_custo_id is not null limit 1;

  -- o anon NAO pode mais chamar
  perform set_config('request.jwt.claims', json_build_object('role','anon')::text, true);
  execute 'set local role anon';
  begin
    perform public.fn_lancar_ferias(
      v_colab, date '2025-01-01', date '2025-12-31',
      date '2026-03-02', date '2026-03-31', 30, 'programada', 100.00);
  exception when others then v_anon_erro := sqlerrm; end;
  reset role;

  -- e o logado continua podendo tudo
  perform set_config('request.jwt.claims', json_build_object('sub', v_tiago, 'role','authenticated')::text, true);
  execute 'set local role authenticated';

  v_ferias := public.fn_lancar_ferias(
    v_colab, date '2025-01-01', date '2025-12-31',
    date '2026-03-02', date '2026-03-31', 30, 'programada',
    1000.00, 80.00, 20.00, null, 'prova');

  select count(*) into a_visiveis from public.rh_ferias where id = v_ferias;
  select valor_liquido, centro_custo_id into a_liq, a_cc
    from public.rh_ferias where id = v_ferias;

  perform public.fn_enviar_recibo_ferias_aprovacao(v_ferias);
  select status_recibo into e_status from public.rh_ferias where id = v_ferias;
  perform public.fn_voltar_recibo_ferias_para_rascunho(v_ferias);
  begin
    perform public.fn_voltar_recibo_ferias_para_rascunho(v_ferias);
  exception when others then h_erro := sqlerrm; end;
  reset role;

  if v_anon_erro = '(NAO RECUSOU)' then
    raise exception 'FALHOU: o anon ainda chamou fn_lancar_ferias';
  end if;
  if a_visiveis <> 1 or a_liq <> 900.00 or a_cc is distinct from a_cc_colab then
    raise exception 'FALHOU: o logado perdeu alguma coisa (visiveis=% liq=% cc=%)', a_visiveis, a_liq, a_cc;
  end if;

  raise exception E'DEPOIS DO REVOKE (desfeita)\n  anon chamando a RPC -> %\n  logado: lancou, enxerga % linha, liquido %, centro certo, enviou -> %\n  CONTROLE voltar ja em rascunho -> %',
    v_anon_erro, a_visiveis, a_liq, e_status, h_erro;
end $prova$;

-- Resultado em 18/09/2026:
--
--   anon chamando a RPC -> permission denied for function fn_lancar_ferias
--   logado: lancou, enxerga 1 linha, liquido 900.00, centro certo, enviou ->
--   pendente_aprovacao
--   CONTROLE voltar ja em rascunho -> O recibo esta em "rascunho": so da para
--   voltar para rascunho o que esta pendente.
--
-- O advisor de seguranca foi de 19 achados de
-- `anon_security_definer_function_executable` para 1, e o que sobrou
-- (`fn_trava_saldo_inicial`) retorna trigger e e de outra frente.

-- ---------------------------------------------------------------------------
-- Parte 2: aprovar e desaprovar (migration 20260918120000)
-- ---------------------------------------------------------------------------
--
-- A guia usa uma fixture: em producao `folha_parametros.grupo_recolhimento_*`
-- esta NULO nos dois, entao a guia nunca sai e o ramo ficaria sem prova. A
-- prova liga os dois grupos dentro da transacao desfeita. Sem isso, "passou"
-- so queria dizer que o `if` nem foi avaliado.

do $prova2$
declare
  v_tiago uuid := 'c66fca9f-5428-4fb9-855f-dcff548764df';  -- Admin
  v_colab uuid; v_cc uuid; v_ferias uuid;
  a_qtd int; a_valor numeric; a_comp date; a_cc uuid; a_venc date;
  a_guia_qtd int; a_guia_soma numeric; a_guia_cc int;
  b_qtd int; b_status text; b_lanc uuid; b_origem text;
  c_erro text := '(NAO RECUSOU)';
  d_erro text := '(NAO RECUSOU)';
  e_erro text := '(NAO RECUSOU)';
begin
  select id, centro_custo_id into v_colab, v_cc
    from public.colaboradores where ativo and centro_custo_id is not null limit 1;

  update public.folha_parametros
     set grupo_recolhimento_inss = 'GPS', grupo_recolhimento_irrf = 'DARF'
   where id = 1;

  perform set_config('request.jwt.claims', json_build_object('sub', v_tiago, 'role','authenticated')::text, true);
  execute 'set local role authenticated';

  v_ferias := public.fn_lancar_ferias(
    v_colab, date '2025-01-01', date '2025-12-31',
    date '2026-03-02', date '2026-03-31', 30, 'programada',
    1000.00, 80.00, 20.00, null, 'prova');

  -- C) CONTROLE: aprovar em rascunho
  begin
    perform public.fn_aprovar_recibo_ferias(v_ferias);
  exception when others then c_erro := sqlerrm; end;
  if c_erro = '(NAO RECUSOU)' then raise exception 'FALHOU: aprovou recibo em rascunho'; end if;

  perform public.fn_enviar_recibo_ferias_aprovacao(v_ferias);
  perform public.fn_aprovar_recibo_ferias(v_ferias);

  -- A) uma conta a pagar, no centro certo, na competencia do GOZO.
  -- Contagem e soma primeiro, atributos depois num select de UMA linha: com
  -- `max()` a query nem compila para uuid, e com mais de uma linha o max
  -- esconderia a segunda.
  select count(*), coalesce(sum(l.valor),0) into a_qtd, a_valor
    from public.lancamentos l
   where l.origem = 'ferias' and l.origem_id = v_ferias;
  if a_qtd <> 1 then raise exception 'FALHOU: esperava 1 lancamento, vieram %', a_qtd; end if;
  if a_valor <> 900.00 then raise exception 'FALHOU: lancamento de % em vez de 900.00', a_valor; end if;

  select l.mes_competencia, l.centro_custo_id, l.data_vencimento
    into a_comp, a_cc, a_venc
    from public.lancamentos l
   where l.origem = 'ferias' and l.origem_id = v_ferias;

  if a_comp <> date '2026-03-01' then
    raise exception 'FALHOU competencia: esperava 2026-03-01 (mes do gozo), veio %', a_comp;
  end if;
  if a_cc is distinct from v_cc then raise exception 'FALHOU: centro de custo errado'; end if;
  if a_venc <> date '2026-02-28' then
    raise exception 'FALHOU vencimento: esperava 2026-02-28 (gozo - 2), veio %', a_venc;
  end if;

  -- A2) as guias saem do que foi DIGITADO, e sem centro de custo: guia e da
  -- empresa, nao da obra.
  select count(*), coalesce(sum(l.valor),0), count(l.centro_custo_id)
    into a_guia_qtd, a_guia_soma, a_guia_cc
    from public.lancamentos l
   where l.origem = 'ferias_guia' and l.origem_id = v_ferias;

  if a_guia_qtd <> 2 then raise exception 'FALHOU guia: esperava 2 (INSS e IRRF), vieram %', a_guia_qtd; end if;
  if a_guia_soma <> 100.00 then raise exception 'FALHOU guia: soma % em vez de 100.00', a_guia_soma; end if;
  if a_guia_cc <> 0 then raise exception 'FALHOU: guia saiu com centro de custo'; end if;

  -- Recibo e guia compartilham `origem_id`. Se o lancamento_id fosse
  -- reconsultado com `limit 1` sem ordem, poderia apontar para a guia, e a
  -- tela mostraria o valor do INSS como se fosse o das ferias.
  select lancamento_id into b_lanc from public.rh_ferias where id = v_ferias;
  if b_lanc is null then raise exception 'FALHOU: recibo aprovado sem lancamento_id'; end if;
  select origem into b_origem from public.lancamentos where id = b_lanc;
  if b_origem <> 'ferias' then
    raise exception 'FALHOU: lancamento_id aponta para "%", nao para o recibo', b_origem;
  end if;

  -- D) CONTROLE: desaprovar sem motivo
  begin
    perform public.fn_desaprovar_recibo_ferias(v_ferias, '   ');
  exception when others then d_erro := sqlerrm; end;
  if d_erro = '(NAO RECUSOU)' then raise exception 'FALHOU: desaprovou sem motivo'; end if;

  -- E) CONTROLE: desaprovar com parcela ja paga. Sem esta trava, desaprovar
  -- apagaria um lancamento que ja saiu da conta bancaria.
  reset role;
  update public.lancamento_parcelas set status = 'pago' where lancamento_id = b_lanc;
  execute 'set local role authenticated';
  begin
    perform public.fn_desaprovar_recibo_ferias(v_ferias, 'prova');
  exception when others then e_erro := sqlerrm; end;
  if e_erro = '(NAO RECUSOU)' then raise exception 'FALHOU: desaprovou com parcela paga'; end if;
  reset role;
  update public.lancamento_parcelas set status = 'pendente' where lancamento_id = b_lanc;
  execute 'set local role authenticated';

  -- B) desaprovar devolve tudo, recibo E guia
  perform public.fn_desaprovar_recibo_ferias(v_ferias, 'prova');
  select count(*) into b_qtd from public.lancamentos
   where origem in ('ferias','ferias_guia') and origem_id = v_ferias;
  select status_recibo, lancamento_id into b_status, b_lanc
    from public.rh_ferias where id = v_ferias;

  if b_qtd <> 0 then raise exception 'FALHOU: sobraram % lancamentos', b_qtd; end if;
  if b_status <> 'rascunho' then raise exception 'FALHOU: status apos desaprovar = %', b_status; end if;
  if b_lanc is not null then raise exception 'FALHOU: lancamento_id ficou orfao'; end if;

  reset role;
  raise exception E'PROVA RECIBO DE FERIAS - parte 2 (desfeita)\n  C) CONTROLE aprovar em rascunho -> %\n  A) aprovou: % lancamento de % na competencia % (mes do gozo), vencendo % (gozo - 2), no centro do colaborador\n  A2) guia: % lancamentos somando % (80 INSS + 20 IRRF), nenhum com centro\n  D) CONTROLE desaprovar sem motivo -> %\n  E) CONTROLE desaprovar com parcela paga -> %\n  B) desaprovou: % lancamentos, status %, lancamento_id nulo',
    c_erro, a_qtd, a_valor, a_comp, a_venc, a_guia_qtd, a_guia_soma, d_erro, e_erro, b_qtd, b_status;
end $prova2$;

-- Resultado em 18/09/2026:
--
--   C) CONTROLE aprovar em rascunho -> O recibo de YARA NYLLA BEZERRA GADELHA
--      PEREIRA esta em "rascunho": so da para aprovar o que esta pendente.
--   A) aprovou: 1 lancamento de 900.00 na competencia 2026-03-01 (mes do
--      gozo), vencendo 2026-02-28 (gozo - 2), no centro do colaborador
--   A2) guia: 2 lancamentos somando 100.00 (80 INSS + 20 IRRF), nenhum com
--      centro
--   D) CONTROLE desaprovar sem motivo -> Informe o motivo da desaprovacao
--   E) CONTROLE desaprovar com parcela paga -> Ha parcela ja paga neste
--      recibo. Nao da para desaprovar.
--   B) desaprovou: 0 lancamentos, status rascunho, lancamento_id nulo
--
-- Contas a mao: 1.000,00 - 80,00 - 20,00 = 900,00 no recibo, 80,00 + 20,00 =
-- 100,00 nas guias. 02/03/2026 - 2 dias = 28/02/2026.
--
-- Depois da prova, conferido que nada sobrou: rh_ferias 0, lancamentos de
-- ferias 0, os dois grupos de recolhimento de volta a NULO, e nenhum
-- competencia_evento de entidade 'ferias'.

-- ---------------------------------------------------------------------------
-- Parte 3: o cadastro por RPC (migration 20260918130000)
-- ---------------------------------------------------------------------------
--
-- Em dois blocos porque o bloco unico estourava o tempo do transporte do MCP.
-- Sao independentes: cada um cria a sua propria linha.

do $prova3a$
declare
  v_tiago uuid := 'c66fca9f-5428-4fb9-855f-dcff548764df';  -- Admin
  v_colab uuid; v_cc uuid; v_ferias uuid;
  a_cc uuid; a_recibo text; a_dias int;
  b_dias int; b_status text; b_obs text;
  c_erro text := '(NAO RECUSOU)';
begin
  select id, centro_custo_id into v_colab, v_cc
    from public.colaboradores where ativo and centro_custo_id is not null limit 1;

  perform set_config('request.jwt.claims', json_build_object('sub', v_tiago, 'role','authenticated')::text, true);
  execute 'set local role authenticated';

  -- A) criar nasce SEM recibo e com o centro do colaborador. O centro importa
  -- aqui e nao so em fn_lancar_ferias: sem ele, umas ferias cadastradas por
  -- esta porta gerariam conta a pagar fora de qualquer obra na aprovacao.
  v_ferias := public.fn_criar_ferias(
    v_colab, date '2025-01-01', date '2025-12-31',
    date '2026-05-04', date '2026-05-23', 20, 'programada', 'cadastro');

  select centro_custo_id, status_recibo, dias into a_cc, a_recibo, a_dias
    from public.rh_ferias where id = v_ferias;
  if a_cc is distinct from v_cc then raise exception 'FALHOU: criar nao trouxe o centro do colaborador'; end if;
  if a_recibo <> 'sem_recibo' then raise exception 'FALHOU: nasceu em % em vez de sem_recibo', a_recibo; end if;
  if a_dias <> 20 then raise exception 'FALHOU dias: %', a_dias; end if;

  -- B) editar
  perform public.fn_editar_ferias(
    v_ferias, date '2025-01-01', date '2025-12-31',
    date '2026-05-04', date '2026-05-18', 15, 'gozada', 'voltou antes');
  select dias, status, observacao into b_dias, b_status, b_obs
    from public.rh_ferias where id = v_ferias;
  if b_dias <> 15 or b_status <> 'gozada' or b_obs <> 'voltou antes' then
    raise exception 'FALHOU editar: dias=% status=% obs=%', b_dias, b_status, b_obs;
  end if;

  -- C) CONTROLE: fim do gozo antes do inicio
  begin
    perform public.fn_editar_ferias(
      v_ferias, date '2025-01-01', date '2025-12-31',
      date '2026-05-04', date '2026-05-01', 15, 'gozada', null);
  exception when others then c_erro := sqlerrm; end;
  if c_erro = '(NAO RECUSOU)' then raise exception 'FALHOU: aceitou fim do gozo antes do inicio'; end if;

  reset role;
  raise exception E'PARTE 3a (desfeita)\n  A) criou: centro do colaborador, recibo=% dias=%\n  B) editou -> dias=% status=% obs="%"\n  C) CONTROLE fim do gozo antes do inicio -> %',
    a_recibo, a_dias, b_dias, b_status, b_obs, c_erro;
end $prova3a$;

-- Resultado em 18/09/2026:
--
--   A) criou: centro do colaborador, recibo=sem_recibo dias=20
--   B) editou -> dias=15 status=gozada obs="voltou antes"
--   C) CONTROLE fim do gozo antes do inicio -> O fim do gozo (01/05/2026) e
--      antes do inicio (04/05/2026).

do $prova3b$
declare
  v_tiago uuid := 'c66fca9f-5428-4fb9-855f-dcff548764df';  -- Admin
  v_colab uuid; v_ferias uuid;
  g_zero text; g_abriu text;
  d_erro text := '(NAO RECUSOU)';
  e_erro text := '(NAO RECUSOU)';
  f_sobrou int;
begin
  select id into v_colab
    from public.colaboradores where ativo and centro_custo_id is not null limit 1;

  perform set_config('request.jwt.claims', json_build_object('sub', v_tiago, 'role','authenticated')::text, true);
  execute 'set local role authenticated';

  v_ferias := public.fn_criar_ferias(
    v_colab, date '2025-01-01', date '2025-12-31',
    date '2026-05-04', date '2026-05-23', 20, 'programada', 'cadastro');

  -- G) DIGITAR VALOR ABRE O RECIBO.
  -- Esta assercao existe por causa de um beco sem saida achado provando a
  -- fn_criar_ferias: ela deixa o recibo em `sem_recibo`, e a
  -- fn_editar_recibo_ferias so aceitava `rascunho`. Quem cadastrasse as ferias
  -- pela tela de cadastro nao tinha como lancar o pagamento depois.
  -- Zero nao abre, porque `sem_recibo` quer dizer "ninguem digitou dinheiro".
  perform public.fn_editar_recibo_ferias(v_ferias, 0, 0, 0);
  select status_recibo into g_zero from public.rh_ferias where id = v_ferias;
  if g_zero <> 'sem_recibo' then raise exception 'FALHOU: zero abriu o recibo (%)', g_zero; end if;

  perform public.fn_editar_recibo_ferias(v_ferias, 800.00, 0, 0);
  select status_recibo into g_abriu from public.rh_ferias where id = v_ferias;
  if g_abriu <> 'rascunho' then raise exception 'FALHOU: digitar valor nao abriu o recibo (%)', g_abriu; end if;

  perform public.fn_enviar_recibo_ferias_aprovacao(v_ferias);
  perform public.fn_aprovar_recibo_ferias(v_ferias);

  -- D) CONTROLE: a data de inicio do gozo define a competencia e o vencimento
  -- da conta a pagar. Mudar a data com o recibo aprovado deixaria o lancamento
  -- apontando para um mes que nao existe mais no recibo.
  begin
    perform public.fn_editar_ferias(
      v_ferias, date '2025-01-01', date '2025-12-31',
      date '2026-09-01', date '2026-09-20', 20, 'programada', null);
  exception when others then d_erro := sqlerrm; end;
  if d_erro = '(NAO RECUSOU)' then
    raise exception 'FALHOU: mudou a data do gozo com o recibo aprovado';
  end if;

  -- E) CONTROLE: excluir com recibo aprovado deixaria lancamento orfao
  begin
    perform public.fn_excluir_ferias(v_ferias);
  exception when others then e_erro := sqlerrm; end;
  if e_erro = '(NAO RECUSOU)' then raise exception 'FALHOU: excluiu ferias com recibo aprovado'; end if;

  -- F) desaprovado, exclui
  perform public.fn_desaprovar_recibo_ferias(v_ferias, 'prova');
  perform public.fn_excluir_ferias(v_ferias);
  select count(*) into f_sobrou from public.rh_ferias where id = v_ferias;
  if f_sobrou <> 0 then raise exception 'FALHOU: nao excluiu'; end if;

  reset role;
  raise exception E'PARTE 3b (desfeita)\n  G) bruto 0 -> % ; bruto 800 -> %\n  D) CONTROLE editar com recibo aprovado -> %\n  E) CONTROLE excluir com recibo aprovado -> %\n  F) desaprovou e excluiu -> sobraram % linhas',
    g_zero, g_abriu, d_erro, e_erro, f_sobrou;
end $prova3b$;

-- Resultado em 18/09/2026:
--
--   G) bruto 0 -> sem_recibo ; bruto 800 -> rascunho
--   D) CONTROLE editar com recibo aprovado -> O recibo esta aprovado e ja
--      virou conta a pagar. Desaprove antes de mudar as datas.
--   E) CONTROLE excluir com recibo aprovado -> Este recibo esta aprovado e tem
--      conta a pagar. Desaprove antes de excluir.
--   F) desaprovou e excluiu -> sobraram 0 linhas
--
-- Depois das tres partes, conferido que nada sobrou: rh_ferias 0, lancamentos
-- de ferias 0, nenhum competencia_evento de entidade 'ferias'.

-- ---------------------------------------------------------------------------
-- Parte 4: depois do revoke (migration 20260918221453)
-- ---------------------------------------------------------------------------
--
-- Revogar privilegio e a hora classica de derrubar producao: fecha a porta
-- errada e a tela para de funcionar sem ninguem perceber ate alguem clicar.
-- Entao a prova confere os DOIS lados na mesma transacao: o que tinha que
-- fechar fechou, e o que nao podia fechar continua de pe.
--
-- Rodada em 18/09/2026, depois de confirmar o deploy em producao.

do $prova4$
declare
  v_tiago uuid := 'c66fca9f-5428-4fb9-855f-dcff548764df';  -- Admin
  v_colab uuid; v_cc uuid; v_ferias uuid;
  a_vis int; a_liq numeric; a_cc uuid; a_recibo text;
  a_qtd int; a_valor numeric; a_comp date; a_lanc_cc uuid;
  b_qtd int; h_sobrou int;
  e_status text; f_status text; g_status text;
  direto text := '(NAO RECUSOU)';
  c_erro text := '(NAO RECUSOU)';
begin
  select id, centro_custo_id into v_colab, v_cc
    from public.colaboradores where ativo and centro_custo_id is not null limit 1;

  perform set_config('request.jwt.claims', json_build_object('sub', v_tiago, 'role','authenticated')::text, true);
  execute 'set local role authenticated';

  -- O que o revoke FECHOU: escrita direta na tabela, que era o buraco. Um
  -- PATCH assim no PostgREST trocava o valor de um recibo ja aprovado.
  begin
    execute 'update public.rh_ferias set valor_bruto = 999999';
  exception when others then direto := sqlerrm; end;
  if direto = '(NAO RECUSOU)' then
    raise exception 'FALHOU: o update direto ainda passa, o revoke nao pegou';
  end if;

  -- O que o revoke NAO podia fechar: o caminho da tela, por RPC.
  -- Porta 1: lancar cria periodo e recibo de uma vez.
  v_ferias := public.fn_lancar_ferias(
    v_colab, date '2025-01-01', date '2025-12-31',
    date '2026-03-02', date '2026-03-31', 30, 'programada',
    1000.00, 80.00, 20.00, null, 'pos-revoke');

  select count(*) into a_vis from public.rh_ferias where id = v_ferias;
  select status_recibo, valor_liquido, centro_custo_id into a_recibo, a_liq, a_cc
    from public.rh_ferias where id = v_ferias;
  if a_vis <> 1 then raise exception 'FALHOU: a tela nao enxerga a linha depois do revoke'; end if;
  if a_liq <> 900.00 then raise exception 'FALHOU liquido: %', a_liq; end if;
  if a_cc is distinct from v_cc then raise exception 'FALHOU centro'; end if;

  perform public.fn_editar_recibo_ferias(v_ferias, 500.00, 0, 0);
  perform public.fn_definir_vencimento_ferias(v_ferias, date '2026-02-25');
  perform public.fn_enviar_recibo_ferias_aprovacao(v_ferias);
  select status_recibo into e_status from public.rh_ferias where id = v_ferias;
  perform public.fn_rejeitar_recibo_ferias(v_ferias, 'pos-revoke');
  select status_recibo into f_status from public.rh_ferias where id = v_ferias;

  begin
    perform public.fn_editar_recibo_ferias(v_ferias, 100.00, 90.00, 90.00);
  exception when others then c_erro := sqlerrm; end;
  if c_erro = '(NAO RECUSOU)' then raise exception 'FALHOU: trava de desconto sumiu'; end if;

  -- Porta 2: cadastro, que so marca o gozo, e o recibo abre digitando valor.
  v_ferias := public.fn_criar_ferias(
    v_colab, date '2025-01-01', date '2025-12-31',
    date '2026-03-02', date '2026-03-31', 30, 'programada', 'pos-revoke');
  perform public.fn_editar_ferias(
    v_ferias, date '2025-01-01', date '2025-12-31',
    date '2026-03-02', date '2026-03-25', 24, 'gozada', 'ajustado');
  perform public.fn_editar_recibo_ferias(v_ferias, 1000.00, 80.00, 20.00);
  select status_recibo into g_status from public.rh_ferias where id = v_ferias;

  perform public.fn_enviar_recibo_ferias_aprovacao(v_ferias);
  perform public.fn_aprovar_recibo_ferias(v_ferias);

  select count(*), coalesce(sum(valor),0) into a_qtd, a_valor
    from public.lancamentos where origem = 'ferias' and origem_id = v_ferias;
  select mes_competencia, centro_custo_id into a_comp, a_lanc_cc
    from public.lancamentos where origem = 'ferias' and origem_id = v_ferias;
  if a_qtd <> 1 or a_valor <> 900.00 then raise exception 'FALHOU aprovar: % de %', a_qtd, a_valor; end if;
  if a_lanc_cc is distinct from v_cc then raise exception 'FALHOU centro do lancamento'; end if;

  perform public.fn_desaprovar_recibo_ferias(v_ferias, 'pos-revoke');
  select count(*) into b_qtd from public.lancamentos
   where origem in ('ferias','ferias_guia') and origem_id = v_ferias;
  if b_qtd <> 0 then raise exception 'FALHOU desaprovar: sobraram % lancamentos', b_qtd; end if;

  perform public.fn_excluir_ferias(v_ferias);
  select count(*) into h_sobrou from public.rh_ferias where id = v_ferias;
  if h_sobrou <> 0 then raise exception 'FALHOU excluir'; end if;

  reset role;
  raise exception E'POS-REVOKE (desfeita)\n  update direto na tabela -> %\n  porta 1, lancar: enxerga % linha, recibo=% liquido=% centro certo\n  editou, definiu vencimento, enviou -> % ; devolveu -> %\n  CONTROLE desconto > bruto -> %\n  porta 2, cadastro: criou, editou, digitou valor -> recibo=%\n  aprovou: % lancamento de % na competencia %, centro certo\n  desaprovou: % lancamentos ; excluiu: sobraram % linhas',
    direto, a_vis, a_recibo, a_liq, e_status, f_status, c_erro, g_status,
    a_qtd, a_valor, a_comp, b_qtd, h_sobrou;
end $prova4$;

-- Resultado em 18/09/2026, depois de aplicar 20260918221453:
--
--   update direto na tabela -> permission denied for table rh_ferias
--   porta 1, lancar: enxerga 1 linha, recibo=rascunho liquido=900.00 centro
--   certo
--   editou, definiu vencimento, enviou -> pendente_aprovacao ; devolveu ->
--   rascunho
--   CONTROLE desconto > bruto -> Os descontos (180.00) passam do bruto
--   (100.00): o liquido ficaria negativo.
--   porta 2, cadastro: criou, editou, digitou valor -> recibo=rascunho
--   aprovou: 1 lancamento de 900.00 na competencia 2026-03-01, centro certo
--   desaprovou: 0 lancamentos ; excluiu: sobraram 0 linhas
--
-- Depois: rh_ferias 0, lancamentos de ferias 0, nenhum competencia_evento de
-- ferias, e uma unica policy na tabela (a de SELECT). O ACL ficou identico ao
-- de rh_decimo_terceiro: `authenticated` so com SELECT, `anon` sem nada.
