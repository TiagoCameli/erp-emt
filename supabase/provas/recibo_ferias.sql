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
