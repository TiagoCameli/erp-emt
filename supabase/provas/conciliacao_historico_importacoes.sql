-- Prova de aceite, Bloco G (03/10/2026): historico de importacoes.
-- Roda em transacao e ROLLBACK, numa conta de controle criada aqui. A acao
-- nova financeiro.conciliacao/excluir e dada ao usuario so dentro da prova.
--
--   1. importacao grava qtd_inseridas/qtd_ignoradas; reimportar o mesmo
--      arquivo nao cria extrato (extrato_id null)
--   2. fn_conciliacao_importacoes lista a importacao com conciliados/pendentes
--   3. excluir com movimento conciliado: recusado
--   4. excluir com mes fechado: recusado
--   5. sem a permissao excluir: recusado
--   6. excluir de verdade: some e fica a copia no arquivo morto

begin;

do $prova$
declare
  v_tiago uuid := 'c66fca9f-5428-4fb9-855f-dcff548764df';
  v_conta uuid;
  v_centro uuid;
  v_lanc uuid;
  v_parc uuid;
  v_r jsonb;
  v_extrato uuid;
  v_t uuid;
  v_lista jsonb;
  v_arquivo jsonb;
begin
  select c.id into v_centro from public.centros_custo c where c.ativo and c.pai_id is null and c.tipo = 'escritorio' limit 1;
  insert into public.contas_bancarias (nome, banco, tipo, conta, ativo, saldo_inicial, saldo_inicial_data)
  values ('PROVA HISTORICO', 'outro', 'corrente', '666.666-6', true, 0, date '2026-08-31') returning id into v_conta;
  insert into public.lancamentos (tipo, origem, descricao, valor, status, data_compra, mes_competencia, data_vencimento, centro_custo_id)
  values ('a_pagar', 'manual', 'prova G', 100, 'pago', date '2026-09-10', date '2026-09-01', date '2026-09-10', v_centro) returning id into v_lanc;
  insert into public.lancamento_parcelas (lancamento_id, numero_parcela, valor, data_vencimento, status, conta_bancaria_id, data_pagamento)
  values (v_lanc, 1, 100, date '2026-09-10', 'pago', v_conta, date '2026-09-10') returning id into v_parc;
  insert into public.lancamento_rateios (lancamento_id, centro_custo_id, valor) values (v_lanc, v_centro, 100);

  insert into public.usuario_permissoes (usuario_id, recurso, acao)
  values (v_tiago, 'financeiro.conciliacao', 'excluir') on conflict do nothing;
  perform set_config('request.jwt.claims', json_build_object('sub', v_tiago, 'role', 'authenticated')::text, true);

  v_arquivo := jsonb_build_array(
    jsonb_build_object('data', '2026-09-10', 'valor', -100, 'memo', 'PAGAMENTO', 'fitid', 'prova-g-1'),
    jsonb_build_object('data', '2026-09-12', 'valor', -7, 'memo', 'TARIFA', 'fitid', 'prova-g-2'));

  -- 1
  v_r := public.fn_conciliacao_importar(v_conta, 'PROVA-G.ofx', date '2026-09-01', date '2026-09-30', -107, date '2026-09-30', v_arquivo);
  v_extrato := (v_r->>'extrato_id')::uuid;
  if (select qtd_inseridas from public.extratos_ofx where id = v_extrato) <> 2
     or (select qtd_ignoradas from public.extratos_ofx where id = v_extrato) <> 0 then
    raise exception 'FALHA 1: contagens nao gravadas';
  end if;
  v_r := public.fn_conciliacao_importar(v_conta, 'PROVA-G.ofx', date '2026-09-01', date '2026-09-30', -107, date '2026-09-30', v_arquivo);
  if (v_r->'extrato_id') <> 'null'::jsonb or (v_r->>'ignoradas')::int <> 2
     or (select count(*) from public.extratos_ofx where conta_bancaria_id = v_conta) <> 1 then
    raise exception 'FALHA 1: reimportacao criou extrato: %', v_r;
  end if;
  raise notice 'OK 1 contagens gravadas; reimportacao nao cria extrato';

  -- 2
  select id into v_t from public.extrato_transacoes where extrato_id = v_extrato and fitid = 'prova-g-1';
  perform public.fn_conciliacao_casar(v_t, 'parcela', v_parc, false, null::text);
  select x into v_lista from jsonb_array_elements(public.fn_conciliacao_importacoes()) x
   where (x->>'id')::uuid = v_extrato;
  if (v_lista->>'conciliados')::int <> 1 or (v_lista->>'pendentes')::int <> 1
     or (v_lista->>'inseridas')::int <> 2 or (v_lista->>'importadoPor') is null then
    raise exception 'FALHA 2: historico %', v_lista;
  end if;
  raise notice 'OK 2 historico: % por %', v_lista->>'arquivo', v_lista->>'importadoPor';

  -- 3
  begin
    perform public.fn_conciliacao_excluir_extrato(v_extrato, 'prova');
    raise exception 'FALHA 3: excluiu com movimento conciliado';
  exception when others then
    if sqlerrm like 'FALHA%' then raise; end if;
    if sqlerrm not like 'Desfaca os 1 casamento%' then raise exception 'FALHA 3: mensagem %', sqlerrm; end if;
  end;
  raise notice 'OK 3 recusa com conciliado';

  -- 4: mes fechado (sem conciliado, para isolar a trava do mes)
  perform public.fn_desconciliar_transacao(v_t);
  insert into public.conciliacao_fechamentos (conta_bancaria_id, mes, saldo_banco, saldo_app, fechado_por)
  values (v_conta, date '2026-09-01', -107, -107, v_tiago);
  begin
    perform public.fn_conciliacao_excluir_extrato(v_extrato, 'prova');
    raise exception 'FALHA 4: excluiu com mes fechado';
  exception when others then
    if sqlerrm like 'FALHA%' then raise; end if;
    if sqlerrm not like 'Mes de setembro/2026%' then raise exception 'FALHA 4: mensagem %', sqlerrm; end if;
  end;
  delete from public.conciliacao_fechamentos where conta_bancaria_id = v_conta;
  raise notice 'OK 4 recusa com mes fechado';

  -- 5
  delete from public.usuario_permissoes where usuario_id = v_tiago and recurso = 'financeiro.conciliacao' and acao = 'excluir';
  begin
    perform public.fn_conciliacao_excluir_extrato(v_extrato, 'prova');
    raise exception 'FALHA 5: excluiu sem permissao';
  exception when others then if sqlerrm like 'FALHA%' then raise; end if; end;
  insert into public.usuario_permissoes (usuario_id, recurso, acao) values (v_tiago, 'financeiro.conciliacao', 'excluir');
  raise notice 'OK 5 sem a acao excluir: recusado';

  -- 6
  perform public.fn_conciliacao_excluir_extrato(v_extrato, 'prova: importado na conta errada');
  if exists (select 1 from public.extratos_ofx where id = v_extrato)
     or exists (select 1 from public.extrato_transacoes where extrato_id = v_extrato)
     or not exists (select 1 from arquivo_morto.extratos_excluidos_conciliacao
                    where extrato_id = v_extrato and jsonb_array_length(transacoes) = 2) then
    raise exception 'FALHA 6: exclusao/arquivo morto';
  end if;
  raise notice 'OK 6 excluido com copia no arquivo morto';
end;
$prova$;

set constraints all immediate;

select 'PROVA OK' as resultado;

rollback;
