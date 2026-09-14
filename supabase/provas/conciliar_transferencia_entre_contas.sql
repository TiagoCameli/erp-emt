-- Prova de aceite: conciliar TRANSFERÊNCIA entre contas, nos dois lados.
--
-- Roda em transacao e termina em ROLLBACK: o extrato e os movimentos que ela
-- cria nao sobrevivem, e as permissoes que ela apaga voltam inteiras.
--
-- O DEFEITO (print do usuario em 14/09/2026): no extrato de janeiro/2025 da
-- Caixa o debito de R$ 450.000,00 de 07/01 ("ENVIO DE TED") fica pendente com
-- "Nenhuma parcela compativel". Ele esta lancado: e a TRF-2026-0168, Caixa ->
-- BB 102.124-9, mesmo dia, mesmo valor. A conciliacao so sabia procurar
-- `lancamento_parcelas`, e transferencia nao e parcela: sao 348 no banco, e
-- nenhuma delas jamais poderia ser conciliada, dos dois lados.
--
-- A prova usa a transferencia REAL (procurada pelo numero, e falha se ela
-- sumir) mas fabrica os proprios movimentos de extrato, para nao depender de o
-- movimento do usuario continuar pendente depois do conserto.
--
-- Ela roda inteira na pele de uma usuaria com a Conciliacao e NADA MAIS, que e
-- o caso que expoe as duas metades ao mesmo tempo: a RPC nova e a leitura da
-- transferencia (a policy de `transferencias_contas` listava tres recursos e a
-- Conciliacao nao estava entre eles).
--
-- Linhas de controle, sem as quais a prova nao distingue "trava consertada" de
-- "trava desligada": o lado repetido, o sentido errado, o valor divergente e o
-- desfazer que precisa liberar o lado.

begin;

create temp table prova_log (ordem serial, passo text, detalhe text) on commit drop;

do $prova$
declare
  v_conciliadora uuid := 'a7324fb8-8311-4986-b975-8a8141ec7efc';  -- Brenda Ciacci
  v_trf uuid; v_trf_valor numeric(14,2); v_trf_data date;
  v_caixa uuid; v_bb uuid;
  v_extrato_caixa uuid; v_extrato_bb uuid;
  v_mov_saida uuid; v_mov_entrada uuid; v_mov_sobra uuid; v_mov_sentido uuid; v_mov_valor uuid;
  v_visiveis int; v_erro text; v_vinculo uuid; v_parcela uuid; v_conciliada boolean;
  v_parcelas_candidatas int;
begin
  select f.id, f.valor, f.data_transferencia, f.conta_origem_id, f.conta_destino_id
    into v_trf, v_trf_valor, v_trf_data, v_caixa, v_bb
  from public.transferencias_contas f where f.numero = 'TRF-2026-0168';
  if v_trf is null then raise exception 'FALHA: a TRF-2026-0168 do print sumiu'; end if;

  -- O caso puro: a Conciliacao inteira, e nada mais.
  delete from public.usuario_permissoes
   where usuario_id = v_conciliadora and recurso <> 'financeiro.conciliacao';

  perform set_config('request.jwt.claims',
    json_build_object('sub', v_conciliadora, 'role', 'authenticated')::text, true);

  -- A MEDIDA DO DEFEITO: nao existe parcela paga que case com este movimento.
  -- E por isso que a tela dizia "Nenhuma parcela compativel" e ficava por isso
  -- mesmo: sem a especie transferencia, esta linha nunca teria par.
  select count(*) into v_parcelas_candidatas
  from public.lancamento_parcelas p
  where p.conta_bancaria_id = v_caixa
    and p.status = 'pago'
    and p.valor_liquido = v_trf_valor
    and p.data_pagamento between v_trf_data - 3 and v_trf_data + 3;

  insert into prova_log (passo, detalhe)
  values ('o defeito', 'parcelas pagas que casariam com o ENVIO DE TED: ' || v_parcelas_candidatas
    || ' (por isso a transacao ficava pendente para sempre)');

  -- Extratos e movimentos proprios da prova, um em cada ponta.
  insert into public.extratos_ofx (conta_bancaria_id, nome_arquivo, periodo_inicio, periodo_fim)
  values (v_caixa, 'PROVA-origem.ofx', v_trf_data, v_trf_data) returning id into v_extrato_caixa;
  insert into public.extratos_ofx (conta_bancaria_id, nome_arquivo, periodo_inicio, periodo_fim)
  values (v_bb, 'PROVA-destino.ofx', v_trf_data, v_trf_data) returning id into v_extrato_bb;

  insert into public.extrato_transacoes (extrato_id, conta_bancaria_id, data_movimento, valor, tipo, memo, chave_dedup)
  values (v_extrato_caixa, v_caixa, v_trf_data, -v_trf_valor, 'debito', 'ENVIO DE TED', 'prova:saida')
  returning id into v_mov_saida;
  insert into public.extrato_transacoes (extrato_id, conta_bancaria_id, data_movimento, valor, tipo, memo, chave_dedup)
  values (v_extrato_bb, v_bb, v_trf_data, v_trf_valor, 'credito', 'RECEBIMENTO TED', 'prova:entrada')
  returning id into v_mov_entrada;
  insert into public.extrato_transacoes (extrato_id, conta_bancaria_id, data_movimento, valor, tipo, memo, chave_dedup)
  values (v_extrato_caixa, v_caixa, v_trf_data, -v_trf_valor, 'debito', 'OUTRO ENVIO IGUAL', 'prova:sobra')
  returning id into v_mov_sobra;
  insert into public.extrato_transacoes (extrato_id, conta_bancaria_id, data_movimento, valor, tipo, memo, chave_dedup)
  values (v_extrato_caixa, v_caixa, v_trf_data, v_trf_valor, 'credito', 'ENTRADA NA ORIGEM', 'prova:sentido')
  returning id into v_mov_sentido;
  insert into public.extrato_transacoes (extrato_id, conta_bancaria_id, data_movimento, valor, tipo, memo, chave_dedup)
  values (v_extrato_caixa, v_caixa, v_trf_data, -(v_trf_valor + 1), 'debito', 'ENVIO COM UM REAL A MAIS', 'prova:valor')
  returning id into v_mov_valor;

  -- M1: quem so tem Conciliacao precisa ENXERGAR a transferencia, senao o
  -- sugeridor volta vazio mesmo com a RPC no lugar. RLS so se prova trocando o
  -- ROLE; com as claims sozinhas a leitura sai como postgres.
  set local role authenticated;
  select count(*) into v_visiveis from public.transferencias_contas where id = v_trf;
  reset role;

  if v_visiveis <> 1 then
    raise exception 'FALHA (M1): quem so tem Conciliacao nao enxerga a transferencia, o sugeridor volta vazio';
  end if;
  insert into prova_log (passo, detalhe)
  values ('M1 le a transferencia', 'a TRF-2026-0168 e visivel para quem so tem Conciliacao');

  -- M2: o lado de SAIDA, que e o movimento do print.
  set local role authenticated;
  perform public.fn_conciliar_transferencia(v_mov_saida, v_trf);
  reset role;

  select transferencia_id, parcela_id, conciliada into v_vinculo, v_parcela, v_conciliada
  from public.extrato_transacoes where id = v_mov_saida;
  if v_vinculo is distinct from v_trf then raise exception 'FALHA (M2): o vinculo nao gravou'; end if;
  if v_parcela is not null then raise exception 'FALHA (M2): ficou com parcela_id preenchido junto'; end if;
  if not v_conciliada then raise exception 'FALHA (M2): a transacao nao ficou conciliada'; end if;

  insert into prova_log (passo, detalhe)
  values ('M2 lado da saida', 'ENVIO DE TED de ' || to_char(v_trf_valor, 'FM999G999G990D00') || ' casado com a TRF-2026-0168');

  -- M3: o MESMO lancamento no outro extrato. Se a unicidade fosse so por
  -- transferencia, conciliar a saida na Caixa deixaria a entrada no BB orfa.
  set local role authenticated;
  perform public.fn_conciliar_transferencia(v_mov_entrada, v_trf);
  reset role;

  if (select transferencia_id from public.extrato_transacoes where id = v_mov_entrada) is distinct from v_trf then
    raise exception 'FALHA (M3): o lado da entrada nao pode ser conciliado com a mesma transferencia';
  end if;
  insert into prova_log (passo, detalhe)
  values ('M3 lado da entrada', 'a mesma transferencia tambem casa no extrato do BB 102.124-9, como credito');

  -- C1: lado repetido.
  v_erro := null;
  set local role authenticated;
  begin perform public.fn_conciliar_transferencia(v_mov_sobra, v_trf);
  exception when others then v_erro := sqlerrm; end;
  reset role;
  if v_erro is null then raise exception 'FALHA (C1): a mesma saida foi conciliada duas vezes'; end if;
  if v_erro not like '%lado%' then raise exception 'FALHA (C1): recusou pelo motivo errado: %', v_erro; end if;
  insert into prova_log (passo, detalhe) values ('C1 lado repetido recusado', v_erro);

  -- C2: sentido errado (credito na conta de ORIGEM).
  v_erro := null;
  set local role authenticated;
  begin perform public.fn_conciliar_transferencia(v_mov_sentido, v_trf);
  exception when others then v_erro := sqlerrm; end;
  reset role;
  if v_erro is null then raise exception 'FALHA (C2): credito na origem foi aceito'; end if;
  if v_erro not like '%sentido%' then raise exception 'FALHA (C2): recusou pelo motivo errado: %', v_erro; end if;
  insert into prova_log (passo, detalhe) values ('C2 sentido errado recusado', v_erro);

  -- C3: valor divergente por um real.
  v_erro := null;
  set local role authenticated;
  begin perform public.fn_conciliar_transferencia(v_mov_valor, v_trf);
  exception when others then v_erro := sqlerrm; end;
  reset role;
  if v_erro is null then raise exception 'FALHA (C3): valor divergente foi aceito'; end if;
  if v_erro not like '%valor%' then raise exception 'FALHA (C3): recusou pelo motivo errado: %', v_erro; end if;
  insert into prova_log (passo, detalhe) values ('C3 valor divergente recusado', v_erro);

  -- C4: desfazer tem que limpar o vinculo E liberar o lado. Se
  -- fn_desconciliar_transacao esquecesse `transferencia_id`, o movimento
  -- voltaria a "pendente" e nunca mais aceitaria conciliacao, calado.
  set local role authenticated;
  perform public.fn_desconciliar_transacao(v_mov_saida);
  reset role;
  if (select transferencia_id from public.extrato_transacoes where id = v_mov_saida) is not null then
    raise exception 'FALHA (C4): desconciliar deixou transferencia_id preenchido';
  end if;

  set local role authenticated;
  perform public.fn_conciliar_transferencia(v_mov_sobra, v_trf);
  reset role;
  if (select transferencia_id from public.extrato_transacoes where id = v_mov_sobra) is distinct from v_trf then
    raise exception 'FALHA (C4): o lado nao foi liberado pelo desconciliar';
  end if;
  insert into prova_log (passo, detalhe)
  values ('C4 desfazer libera o lado', 'desconciliou a saida e outro movimento pode ocupar o lado');

  -- C5: um movimento e parcela OU transferencia, nunca os dois.
  v_erro := null;
  begin
    update public.extrato_transacoes
       set parcela_id = (select id from public.lancamento_parcelas limit 1)
     where id = v_mov_sobra;
  exception when others then v_erro := sqlerrm; end;
  if v_erro is null then raise exception 'FALHA (C5): gravou parcela e transferencia no mesmo movimento'; end if;
  if v_erro not like '%um_vinculo%' then raise exception 'FALHA (C5): barrou por outro motivo: %', v_erro; end if;
  insert into prova_log (passo, detalhe) values ('C5 vinculo unico', 'o CHECK barra parcela e transferencia juntas');

  raise notice 'PROVA OK';
end $prova$;

select ordem, passo, detalhe from prova_log order by ordem;

rollback;
