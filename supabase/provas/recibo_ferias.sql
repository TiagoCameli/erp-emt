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
