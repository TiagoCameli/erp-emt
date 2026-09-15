-- Prova do lote de 13o (migration 20260914150000).
--
-- O 13o NAO calcula. Ele monta a planilha com todo colaborador ativo dos tres
-- vinculos, zerada, e quem monta o lote digita cada valor, tira e acrescenta
-- quem quiser. Entao esta prova nao confere formula nenhuma: ela confere que
--
--   1. todo mundo entra, inclusive quem nao tem carteira;
--   2. o lote nasce ZERADO;
--   3. o que foi digitado e o que fica, e o liquido e a subtracao;
--   4. tirar e acrescentar funcionam;
--   5. aprovar so gera conta a pagar para a linha preenchida.
--
-- A prova CHAMA as RPCs: plpgsql so valida as queries do corpo na primeira
-- EXECUCAO, entao `apply_migration` devolver success nao prova nada.
--
-- Nao ha numero "feito a mao" de 13o aqui porque nao existe conta a fazer. O
-- unico numero conferido e a subtracao: 1.000,00 - 80,00 - 20,00 = 900,00.

do $prova$
declare
  v_tiago uuid := 'c66fca9f-5428-4fb9-855f-dcff548764df';  -- Admin
  v_lote uuid; v_item uuid; v_terceiro uuid; v_saiu uuid;
  a_qtd int; a_clt int; a_terc int; a_diar int; a_liq numeric;
  b_liq numeric; b_item_liq numeric;
  c_erro text := '(NAO RECUSOU)';
  d_qtd int; e_qtd int;
  f_erro text := '(NAO RECUSOU)';
  g_lanc int; g_soma numeric;
begin
  perform set_config('request.jwt.claims', json_build_object('sub', v_tiago, 'role','authenticated')::text, true);
  execute 'set local role authenticated';

  -- ===================================================================
  -- A) gerar traz TODO ativo dos tres vinculos, zerado
  -- ===================================================================
  v_lote := public.fn_gerar_decimo_terceiro(2024::smallint, 1::smallint, null);

  select count(*), coalesce(sum(i.valor_liquido),0) into a_qtd, a_liq
    from public.rh_decimo_terceiro_itens i where i.decimo_terceiro_id = v_lote;
  select count(*) filter (where c.vinculo='clt'),
         count(*) filter (where c.vinculo='terceiro'),
         count(*) filter (where c.vinculo='diarista')
    into a_clt, a_terc, a_diar
    from public.rh_decimo_terceiro_itens i
    join public.colaboradores c on c.id = i.colaborador_id
   where i.decimo_terceiro_id = v_lote;

  -- Conferido contra a contagem de ativos, nao contra 60 fixo: o cadastro anda.
  if a_qtd <> (select count(*) from public.colaboradores
                where ativo and vinculo in ('clt','terceiro','diarista')) then
    raise exception 'FALHOU: o lote nao trouxe todos os ativos (veio %)', a_qtd;
  end if;

  -- O ponto da mudanca de 14/09/2026: quem NAO tem carteira recebe 13o aqui.
  if a_terc = 0 or a_diar = 0 then
    raise exception 'FALHOU: sem carteira ficou de fora (terceiro=%, diarista=%)', a_terc, a_diar;
  end if;

  if a_liq <> 0 then raise exception 'FALHOU: lote nao nasceu zerado, veio %', a_liq; end if;

  -- ===================================================================
  -- B) o que foi digitado e o que fica; o liquido e a subtracao
  -- ===================================================================
  -- De proposito num DIARISTA: ele nao tem salario nenhum no cadastro, e no
  -- modelo antigo nao teria como entrar.
  select i.id into v_item from public.rh_decimo_terceiro_itens i
    join public.colaboradores c on c.id = i.colaborador_id
   where i.decimo_terceiro_id = v_lote and c.vinculo = 'diarista' limit 1;

  perform public.fn_editar_item_decimo_terceiro(v_item, 1000.00, 80.00, 20.00);
  select valor_liquido into b_item_liq from public.rh_decimo_terceiro_itens where id = v_item;
  select valor_liquido into b_liq from public.rh_decimo_terceiro where id = v_lote;
  if b_item_liq <> 900.00 then raise exception 'FALHOU liquido do item: esperado 900.00, veio %', b_item_liq; end if;
  if b_liq <> 900.00 then raise exception 'FALHOU total do lote: esperado 900.00, veio %', b_liq; end if;

  -- ===================================================================
  -- C) CONTROLE: desconto maior que o bruto deixaria liquido negativo
  -- ===================================================================
  begin
    perform public.fn_editar_item_decimo_terceiro(v_item, 100.00, 90.00, 90.00);
  exception when others then c_erro := sqlerrm; end;
  if c_erro = '(NAO RECUSOU)' then raise exception 'FALHOU: aceitou desconto maior que o bruto'; end if;

  -- ===================================================================
  -- D) e E) tirar do lote e acrescentar de volta
  -- ===================================================================
  select i.id, i.colaborador_id into v_saiu, v_terceiro
    from public.rh_decimo_terceiro_itens i
    join public.colaboradores c on c.id = i.colaborador_id
   where i.decimo_terceiro_id = v_lote and c.vinculo = 'terceiro' limit 1;

  perform public.fn_tirar_do_lote_decimo_terceiro(v_saiu);
  select count(*) into d_qtd from public.rh_decimo_terceiro_itens where decimo_terceiro_id = v_lote;
  if d_qtd <> a_qtd - 1 then raise exception 'FALHOU tirar: esperava %, veio %', a_qtd - 1, d_qtd; end if;

  perform public.fn_adicionar_ao_lote_decimo_terceiro(v_lote, v_terceiro);
  select count(*) into e_qtd from public.rh_decimo_terceiro_itens where decimo_terceiro_id = v_lote;
  if e_qtd <> a_qtd then raise exception 'FALHOU adicionar: esperava %, veio %', a_qtd, e_qtd; end if;

  -- ===================================================================
  -- F) CONTROLE: acrescentar quem ja esta no lote
  -- ===================================================================
  begin
    perform public.fn_adicionar_ao_lote_decimo_terceiro(v_lote, v_terceiro);
  exception when others then f_erro := sqlerrm; end;
  if f_erro = '(NAO RECUSOU)' then raise exception 'FALHOU: adicionou o mesmo colaborador duas vezes'; end if;

  -- ===================================================================
  -- G) aprovar gera conta a pagar SO para quem tem valor
  -- ===================================================================
  -- Das linhas do lote, uma unica foi preenchida. Se a aprovacao gerasse
  -- lancamento para as outras, sairiam contas a pagar de R$ 0,00 na fila.
  perform public.fn_enviar_decimo_terceiro_aprovacao(v_lote);
  perform public.fn_aprovar_decimo_terceiro(v_lote);
  select count(*), coalesce(sum(l.valor),0) into g_lanc, g_soma
    from public.lancamentos l
   where l.origem = 'decimo_terceiro'
     and l.origem_id in (select id from public.rh_decimo_terceiro_itens where decimo_terceiro_id = v_lote);
  if g_lanc <> 1 then raise exception 'FALHOU: esperava 1 lancamento, vieram %', g_lanc; end if;
  if g_soma <> 900.00 then raise exception 'FALHOU: lancamento de % em vez de 900.00', g_soma; end if;

  reset role;
  raise exception E'PROVA 13o PLANILHA (desfeita, nada gravado)\n  A) gerou % itens zerados: clt=% terceiro=% diarista=%  liquido=%\n  B) digitou 1000 - 80 - 20 -> item=% e lote=%\n  C) CONTROLE desconto > bruto -> %\n  D) tirou do lote -> % itens\n  E) adicionou de volta -> % itens\n  F) CONTROLE adicionar duplicado -> %\n  G) aprovou: % lancamento somando % (so a linha preenchida)',
    a_qtd, a_clt, a_terc, a_diar, a_liq, b_item_liq, b_liq, c_erro, d_qtd, e_qtd, f_erro, g_lanc, g_soma;
end $prova$;

-- Resultado em 14/09/2026:
--
--   A) gerou 60 itens zerados: clt=29 terceiro=27 diarista=4  liquido=0.00
--   B) digitou 1000 - 80 - 20 -> item=900.00 e lote=900.00
--   C) CONTROLE desconto > bruto -> Os descontos (180.00) passam do bruto
--      (100.00): o liquido ficaria negativo.
--   D) tirou do lote -> 59 itens
--   E) adicionou de volta -> 60 itens
--   F) CONTROLE adicionar duplicado -> ANTONIO FRANCISCO DA SILVA GAMA - TOIN
--      ja esta neste lote.
--   G) aprovou: 1 lancamento somando 900.00 (so a linha preenchida das 60)
--
-- Os 27 terceiros e os 4 diaristas sao exatamente o que o modelo anterior
-- deixava de fora.

-- =====================================================================
-- Parte 2: o pedido de aprovacao (migration 20260915100000)
-- =====================================================================
--
-- Duas coisas que a folha gerencial tem e o 13o passou a ter: voltar para
-- rascunho enquanto espera, e vencimento editavel.
--
-- O item A e o que NAO da para copiar da folha. La a guarda recusa data
-- anterior ao mes da competencia; aqui a competencia e dezembro e a 1a parcela
-- e paga em NOVEMBRO (a lei manda ate 30/11). Copiar a guarda da folha
-- recusaria o caso normal.

do $prova2$
declare
  v_tiago uuid := 'c66fca9f-5428-4fb9-855f-dcff548764df';
  v_lote uuid; v_item uuid;
  a_venc date; b_venc date;
  c_erro text := '(NAO RECUSOU)';
  d_status text; e_status text;
  f_erro text := '(NAO RECUSOU)';
  g_erro text := '(NAO RECUSOU)';
begin
  perform set_config('request.jwt.claims', json_build_object('sub', v_tiago, 'role','authenticated')::text, true);
  execute 'set local role authenticated';

  v_lote := public.fn_gerar_decimo_terceiro(2023::smallint, 1::smallint, null);

  -- A) vencimento em NOVEMBRO e aceito (a guarda da folha recusaria)
  select data_vencimento into a_venc from public.rh_decimo_terceiro where id = v_lote;
  perform public.fn_definir_vencimento_decimo_terceiro(v_lote, date '2023-11-30');
  select data_vencimento into b_venc from public.rh_decimo_terceiro where id = v_lote;
  if b_venc <> date '2023-11-30' then raise exception 'FALHOU vencimento: veio %', b_venc; end if;

  -- C) CONTROLE: ano anterior e erro de digitacao, e e recusado
  begin
    perform public.fn_definir_vencimento_decimo_terceiro(v_lote, date '2022-12-20');
  exception when others then c_erro := sqlerrm; end;
  if c_erro = '(NAO RECUSOU)' then raise exception 'FALHOU: aceitou vencimento de ano anterior'; end if;

  -- D) enviar, voltar para rascunho, e o lote volta EDITAVEL
  select id into v_item from public.rh_decimo_terceiro_itens where decimo_terceiro_id = v_lote limit 1;
  perform public.fn_editar_item_decimo_terceiro(v_item, 500.00, 0, 0);
  perform public.fn_enviar_decimo_terceiro_aprovacao(v_lote);
  select status into d_status from public.rh_decimo_terceiro where id = v_lote;

  perform public.fn_voltar_decimo_terceiro_para_rascunho(v_lote);
  select status into e_status from public.rh_decimo_terceiro where id = v_lote;
  if e_status <> 'rascunho' then raise exception 'FALHOU voltar: status %', e_status; end if;

  -- o ponto de voltar e poder editar de novo. Se isto estourar, voltar nao
  -- serviu para nada.
  perform public.fn_editar_item_decimo_terceiro(v_item, 600.00, 0, 0);

  -- E) CONTROLE: voltar de novo, ja estando em rascunho
  begin
    perform public.fn_voltar_decimo_terceiro_para_rascunho(v_lote);
  exception when others then f_erro := sqlerrm; end;
  if f_erro = '(NAO RECUSOU)' then raise exception 'FALHOU: voltou um lote que ja estava em rascunho'; end if;

  -- F) CONTROLE: mexer no vencimento com o lote PENDENTE trocaria o que quem
  -- aprova autorizou, por baixo dela
  perform public.fn_enviar_decimo_terceiro_aprovacao(v_lote);
  begin
    perform public.fn_definir_vencimento_decimo_terceiro(v_lote, date '2023-12-15');
  exception when others then g_erro := sqlerrm; end;
  if g_erro = '(NAO RECUSOU)' then
    raise exception 'FALHOU: mudou o vencimento por baixo de quem ia aprovar';
  end if;

  reset role;
  raise exception E'PROVA 13o PEDIDO DE APROVACAO (desfeita)\n  A) vencimento: nasceu % e virou % (NOVEMBRO, aceito)\n  C) CONTROLE ano anterior -> %\n  D) enviou (%) e voltou para % e deu para editar de novo\n  E) CONTROLE voltar ja em rascunho -> %\n  F) CONTROLE mudar vencimento com o lote pendente -> %',
    coalesce(a_venc::text,'(nulo)'), b_venc, c_erro, d_status, e_status, f_erro, g_erro;
end $prova2$;

-- Resultado em 15/09/2026:
--
--   A) vencimento: nasceu (nulo) e virou 2023-11-30 (NOVEMBRO, aceito)
--   C) CONTROLE ano anterior -> A data de vencimento (20/12/2022) e anterior
--      ao ano do 13o (2023).
--   D) enviou (pendente_aprovacao) e voltou para rascunho e deu para editar de novo
--   E) CONTROLE voltar ja em rascunho -> O lote esta em "rascunho": so da para
--      voltar para rascunho o que esta pendente de aprovacao.
--   F) CONTROLE mudar vencimento com o lote pendente -> O lote esta em
--      "pendente_aprovacao": a data de vencimento so muda em rascunho.
