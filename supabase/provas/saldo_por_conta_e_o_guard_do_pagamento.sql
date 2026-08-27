-- Prova de aceite da permissão de ver saldo por conta bancária.
--
-- Duas coisas, e a segunda é a que podia causar estrago de verdade:
--
--   1. quem não tem a permissão de uma conta não vê o saldo dela por NENHUM
--      caminho (nem pela função, nem por consulta direta na coluna), e continua
--      vendo o nome;
--   2. o GUARD DO PAGAMENTO continua calculando o saldo CERTO. O caminho óbvio
--      desta obra seria filtrar `fn_rel_posicao_bancaria` por permissão — e isso
--      quebraria o guard em silêncio: `fn_pagar_parcela` é SECURITY DEFINER e
--      chama `fn_saldo_conta`, que lê aquela agregada, e `auth.uid()` continua
--      sendo o do CHAMADOR dentro de uma função SECURITY DEFINER. O filtro
--      esconderia o movimento de quem está pagando, e o guard passaria a
--      comparar o pagamento contra `saldo_inicial` puro.
--
-- ATENÇÃO À ORDEM DAS DUAS MIGRATIONS. Os controles B e B2 (leitura direta da
-- coluna e das agregadas) só passam DEPOIS de
-- `20260827230000_saldo_por_conta_fecha_as_portas.sql` rodar, o que só pode
-- acontecer com o código já em produção. Antes disso eles devolvem "PASSOU", e
-- isso é o esperado, não defeito: a tela já obedece à permissão, e o que falta é
-- fechar a porta de quem consulta o banco direto. O porquê da separação está no
-- cabeçalho da parte 1 — revogar antes do deploy derrubou a produção em
-- 27/08/2026 18:41.
--
-- Tudo dentro de DO que termina em `raise`: nada é gravado. `fn_pagar_parcela`
-- não queima numeração (numeração é UPDATE em `documento_sequencias`), então o
-- rollback não deixa buraco.
--
-- `set_config('request.jwt.claims', ...)` sozinho NÃO prova nada: o MCP entra
-- como owner e owner passa por cima da RLS e dos grants. Quem faz valer é o
-- `set local role authenticated`.

-- =====================================================================
-- Parte 1: o saldo só aparece para quem tem a permissão
-- =====================================================================

do $prova$
declare
  v_dora  uuid := '3767e529-eae7-4178-852c-2dd2782efaaf';  -- perfil Financeiro
  v_tiago uuid := 'c66fca9f-5428-4fb9-855f-dcff548764df';  -- perfil Admin
  v_conta uuid;
  v_inicial numeric; v_real numeric;
  a_dora_ve int;
  a_dora_nomes int;
  b_select_direto text := 'PASSOU (NAO DEVIA)';
  b2_agregada text := 'PASSOU (NAO DEVIA)';
  c_dora_marcada text := '(nao rodou)';
  d_tiago_ve int;
begin
  select id, saldo_inicial into v_conta, v_inicial
  from public.contas_bancarias where nome ilike '%102.124-9%' limit 1;
  v_real := public.fn_saldo_conta(v_conta);

  perform set_config('request.jwt.claims', json_build_object('sub', v_dora, 'role','authenticated')::text, true);
  execute 'set local role authenticated';

  -- A: sem marcação nenhuma, nenhuma conta traz saldo...
  select count(*) into a_dora_ve from public.fn_saldos_das_contas();
  -- ...e o NOME de todas continua visível. É o pedido em uma linha.
  select count(*) into a_dora_nomes from public.contas_bancarias;

  -- B CONTROLE: a consulta direta na coluna tem que ser recusada pelo GRANT.
  -- Sem este revoke, a permissão seria enfeite: bastava um select para ler o
  -- saldo inicial de qualquer conta.
  begin
    execute 'select saldo_inicial from public.contas_bancarias limit 1';
  exception when others then b_select_direto := sqlerrm;
  end;

  -- B2 CONTROLE: as agregadas de dinheiro por conta perderam o EXECUTE do
  -- client. Elas continuam verdadeiras para os guards (ver a parte 2), mas
  -- ninguém as chama de fora.
  begin
    execute 'select * from public.fn_rel_posicao_bancaria() limit 1';
  exception when others then b2_agregada := sqlerrm;
  end;
  reset role;

  -- C: marcando UMA conta para a Dora, ela passa a ver o saldo DAQUELA, e o
  -- número tem que ser o MESMO de `fn_saldo_conta` (que é o que o guard usa).
  insert into public.usuario_conta_saldo (usuario_id, conta_bancaria_id) values (v_dora, v_conta);
  perform set_config('request.jwt.claims', json_build_object('sub', v_dora, 'role','authenticated')::text, true);
  execute 'set local role authenticated';
  select count(*)::text || ' conta(s), saldo=' || coalesce(max(saldo)::text, '?')
    into c_dora_marcada from public.fn_saldos_das_contas();
  reset role;

  -- D: Admin vê todas sem depender de marcação (decisão do Tiago em 27/08).
  perform set_config('request.jwt.claims', json_build_object('sub', v_tiago, 'role','authenticated')::text, true);
  execute 'set local role authenticated';
  select count(*) into d_tiago_ve from public.fn_saldos_das_contas();
  reset role;

  raise exception E'PROVA DO SALDO POR CONTA (desfeita, nada gravado)\n  conta de teste: saldo_inicial=% saldo_real=%\n  A) Dora sem marcacao: % conta(s) com saldo, mas % nome(s) de conta visiveis\n  B) CONTROLE select saldo_inicial direto -> %\n  B2) CONTROLE fn_rel_posicao_bancaria pelo client -> %\n  C) Dora com 1 conta marcada -> %\n  D) Tiago (Admin) ve % conta(s)',
    v_inicial, v_real, a_dora_ve, a_dora_nomes, b_select_direto, b2_agregada,
    c_dora_marcada, d_tiago_ve;
end $prova$;

-- Resultado em 27/08/2026, COM a parte 2 aplicada (janela em que ela esteve no
-- banco, antes de ser revertida por ter derrubado a produção):
--   conta de teste: saldo_inicial=155484.34 saldo_real=303864.35
--   A) Dora sem marcacao: 0 conta(s) com saldo, mas 5 nome(s) de conta visiveis
--   B) CONTROLE select saldo_inicial direto -> permission denied for table contas_bancarias
--   B2) CONTROLE fn_rel_posicao_bancaria pelo client -> permission denied for function fn_rel_posicao_bancaria
--   C) Dora com 1 conta marcada -> 1 conta(s), saldo=303864.35
--   D) Tiago (Admin) ve 5 conta(s)
--
-- Reprova no MESMO dia, DEPOIS da reversão (estado em que o código sobe):
--   A) Dora sem marcacao: 0 saldo(s), 5 nome(s) de conta
--   C) Dora com 1 marcada: 1 conta(s), saldo=303864.35
--   D) Tiago (Admin): 5 conta(s)
--   B) select saldo_inicial -> PASSOU (esperado ate a parte 2 rodar)
--   B2) fn_rel_posicao_bancaria -> PASSOU (esperado ate a parte 2 rodar)
--
-- A linha A é o pedido inteiro numa linha: ZERO saldos e CINCO nomes — e ela
-- passa nos dois estados, porque quem filtra o saldo é `fn_saldos_das_contas`,
-- não o revoke. O revoke fecha a porta de quem consulta o banco por fora.
-- O saldo em C é idêntico ao `fn_saldo_conta` do topo: a tela e o guard falam do
-- mesmo número.

-- =====================================================================
-- Parte 1b: o estado DEFINITIVO, depois do deploy e da migration que fecha
-- =====================================================================
--
-- Rodada em 27/08/2026, com `20260827230000_saldo_por_conta_fecha_as_portas`
-- aplicada e o código (PRs #207 e #209) em produção. É este o estado que vale.
--
-- Além dos controles de leitura, aqui entram os DOIS UPDATEs, que é o que fecha
-- o furo achado no checklist: a Dora tem `financeiro.contas-bancarias / editar`,
-- então ela EDITA a conta — e não pode, ao salvar o nome, zerar o saldo.

do $prova$
declare
  v_dora  uuid := '3767e529-eae7-4178-852c-2dd2782efaaf';
  v_tiago uuid := 'c66fca9f-5428-4fb9-855f-dcff548764df';
  v_conta uuid;
  a_saldos int; a_nomes int;
  b text := 'PASSOU (NAO DEVIA)';
  b2 text := 'PASSOU (NAO DEVIA)';
  c int;
  d_query_nova int;
  e_update_nome text := '(nao rodou)';
  f_update_saldo text := 'PASSOU (NAO DEVIA)';
begin
  select id into v_conta from public.contas_bancarias where nome ilike '%102.124-9%' limit 1;

  perform set_config('request.jwt.claims', json_build_object('sub', v_dora, 'role','authenticated')::text, true);
  execute 'set local role authenticated';

  select count(*) into a_saldos from public.fn_saldos_das_contas();
  select count(*) into a_nomes from public.contas_bancarias;
  -- A query que o código NOVO faz. Se ela quebrar aqui, quebrou em produção.
  execute 'select count(*) from (select id, nome, banco, agencia, conta, tipo, saldo_inicial_data, ativo from public.contas_bancarias order by nome) x' into d_query_nova;

  begin execute 'select saldo_inicial from public.contas_bancarias limit 1';
  exception when others then b := sqlerrm; end;
  begin execute 'select * from public.fn_rel_posicao_bancaria() limit 1';
  exception when others then b2 := sqlerrm; end;

  -- E: o UPDATE que a action faz agora (SEM as colunas de saldo) tem que passar.
  -- Sem esta linha, a prova não distinguiria "trava funcionando" de "trava
  -- impedindo a Dora de trabalhar".
  begin
    execute format('update public.contas_bancarias set nome = nome where id = %L', v_conta);
    e_update_nome := 'PASSOU (correto)';
  exception when others then e_update_nome := 'RECUSOU: ' || sqlerrm;
  end;

  -- F CONTROLE: o UPDATE COM a coluna de saldo tem que ser recusado pela trigger.
  begin
    execute format('update public.contas_bancarias set saldo_inicial = 0 where id = %L', v_conta);
  exception when others then f_update_saldo := sqlerrm;
  end;
  reset role;

  perform set_config('request.jwt.claims', json_build_object('sub', v_tiago, 'role','authenticated')::text, true);
  execute 'set local role authenticated';
  select count(*) into c from public.fn_saldos_das_contas();
  reset role;

  raise exception E'PROVA FINAL (desfeita, nada gravado)\n  Dora: % saldo(s) e % nome(s) de conta; query nova devolve % linha(s)\n  CONTROLE select saldo_inicial -> %\n  CONTROLE fn_rel_posicao_bancaria -> %\n  Dora edita o NOME -> %\n  CONTROLE Dora edita o SALDO -> %\n  Tiago (Admin): % conta(s) com saldo',
    a_saldos, a_nomes, d_query_nova, b, b2, e_update_nome, f_update_saldo, c;
end $prova$;

-- Resultado em 27/08/2026, estado definitivo:
--   Dora: 0 saldo(s) e 5 nome(s) de conta; query nova devolve 5 linha(s)
--   CONTROLE select saldo_inicial -> permission denied for table contas_bancarias
--   CONTROLE fn_rel_posicao_bancaria -> permission denied for function fn_rel_posicao_bancaria
--   Dora edita o NOME -> PASSOU (correto)
--   CONTROLE Dora edita o SALDO -> Sem permissao para alterar o saldo inicial desta conta
--   Tiago (Admin): 5 conta(s) com saldo
--
-- As seis linhas juntas são a obra: o nome aparece, o saldo não, a consulta
-- direta e a agregada estão fechadas, quem edita conta continua editando, e o
-- saldo real não pode ser sobrescrito por quem não o vê. Admin passa por cima.

-- =====================================================================
-- Parte 2: o guard do pagamento continua certo, e para de contar o saldo
-- =====================================================================
--
-- O valor DISCRIMINANTE é calculado na hora, entre `saldo_inicial` e o saldo
-- real, porque a base se move (o saldo desta conta passou de R$ 37.393,55 para
-- R$ 303.864,35 em um dia). Chumbar o número faria a prova deixar de
-- discriminar sem avisar — foi o que aconteceu na primeira tentativa desta
-- prova, que "passou" testando um valor que cabia nos dois cálculos.
--
-- Neste valor, o guard CERTO e um guard que só olhasse `saldo_inicial` tomam
-- decisões OPOSTAS. É isso que faz a prova provar.

do $prova$
declare
  v_dora  uuid := '3767e529-eae7-4178-852c-2dd2782efaaf';
  v_tiago uuid := 'c66fca9f-5428-4fb9-855f-dcff548764df';
  -- Parcela aprovada de R$ 898,63 do LAN-2026-5026. Trocar por outra aprovada
  -- se esta já tiver sido paga; o `p_motivo` cobre o pagamento fora da janela.
  v_parcela uuid := 'cd1e4a43-acea-415c-8cb8-33e413e0610b';
  v_valor numeric;
  v_conta uuid;
  v_real numeric; v_inicial numeric;
  v_disc numeric; v_acima numeric;
  v_esperado text;
  e_disc text := '(nao rodou)';
  f_acima_dora text := 'ACEITOU (NAO DEVIA)';
  g_acima_tiago text := 'ACEITOU (NAO DEVIA)';
  v_hoje date := (now() at time zone 'America/Rio_Branco')::date;
begin
  select id, saldo_inicial into v_conta, v_inicial
  from public.contas_bancarias where nome ilike '%102.124-9%' limit 1;
  v_real := public.fn_saldo_conta(v_conta);
  select valor into v_valor from public.lancamento_parcelas where id = v_parcela;

  v_disc := round((v_inicial + v_real) / 2, 2);
  v_esperado := case when v_real > v_inicial
    then 'ACEITAR (um guard so-saldo_inicial recusaria)'
    else 'RECUSAR (um guard so-saldo_inicial aceitaria)' end;
  v_acima := round(v_real + 100000, 2);

  perform set_config('request.jwt.claims', json_build_object('sub', v_dora, 'role','authenticated')::text, true);
  execute 'set local role authenticated';

  -- E: o caso discriminante. Os juros levam o líquido ao valor escolhido.
  begin
    perform public.fn_pagar_parcela(v_parcela, v_conta, v_hoje, 0, v_disc - v_valor, 0, 'prova');
    e_disc := 'ACEITOU';
    raise exception 'desfaz E';
  exception when others then
    if sqlerrm <> 'desfaz E' then e_disc := 'RECUSOU: ' || sqlerrm; end if;
  end;

  -- F: acima do saldo real. Tem que recusar, e a mensagem NÃO pode dizer quanto
  -- a conta tem, porque a Dora não pode ver o saldo dela.
  begin
    perform public.fn_pagar_parcela(v_parcela, v_conta, v_hoje, 0, v_acima - v_valor, 0, 'prova');
    raise exception 'desfaz F';
  exception when others then
    if sqlerrm <> 'desfaz F' then f_acima_dora := sqlerrm; end if;
  end;
  reset role;

  -- G CONTROLE da mensagem: o MESMO pagamento pelo Admin tem que trazer o valor,
  -- senão eu teria trocado a mensagem para todo mundo e piorado a vida de quem
  -- pode ver.
  perform set_config('request.jwt.claims', json_build_object('sub', v_tiago, 'role','authenticated')::text, true);
  execute 'set local role authenticated';
  begin
    perform public.fn_pagar_parcela(v_parcela, v_conta, v_hoje, 0, v_acima - v_valor, 0, 'prova');
    raise exception 'desfaz G';
  exception when others then
    if sqlerrm <> 'desfaz G' then g_acima_tiago := sqlerrm; end if;
  end;
  reset role;

  raise exception E'PROVA DO GUARD (desfeita, nada gravado)\n  saldo_inicial=%  saldo_real=%\n  valor discriminante=%  esperado: %\n  E) Dora paga o discriminante -> %\n  F) Dora paga % (acima do saldo) -> %\n  G) Tiago (Admin) paga % -> %',
    v_inicial, v_real, v_disc, v_esperado, e_disc, v_acima, f_acima_dora, v_acima, g_acima_tiago;
end $prova$;

-- Resultado em 27/08/2026:
--   saldo_inicial=155484.34  saldo_real=303864.35
--   valor discriminante=229674.35  esperado: ACEITAR (um guard so-saldo_inicial recusaria)
--   E) Dora paga o discriminante -> ACEITOU
--   F) Dora paga 403864.35 (acima do saldo) -> Saldo insuficiente nesta conta
--      para o pagamento de R$ 403864.35.
--   G) Tiago (Admin) paga 403864.35 -> Saldo insuficiente na conta: saldo atual
--      R$ 303864.35, pagamento de R$ 403864.35.
--
-- E) é a prova do risco catastrófico: a Dora NÃO pode ver o saldo desta conta e
-- o pagamento de R$ 229.674,35 passou — ou seja, o guard enxergou os
-- R$ 303.864,35 reais, e não os R$ 155.484,34 de saldo inicial. Se a agregada
-- tivesse sido filtrada por permissão, este pagamento legítimo teria sido
-- recusado, e o oposto (pagar mais do que a conta tem) teria sido liberado em
-- outra conta.
--
-- F) e G) juntas mostram que a mensagem mudou só para quem não pode ver: a
-- recusa da Dora não diz o saldo, a do Admin diz. A recusa ainda revela uma
-- DESIGUALDADE (o saldo é menor que o pagamento), o que é inevitável numa
-- recusa útil — e é muito menos que o valor.
