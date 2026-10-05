-- Prova de aceite, Bloco H (05/10/2026): regras de conciliacao por historico.
-- Roda depois da migration 20261005140000 e termina em ROLLBACK.

begin;

do $prova$
declare
  v_tiago uuid := 'c66fca9f-5428-4fb9-855f-dcff548764df';
  v_aplic uuid := 'd914abf2-77a4-4c4d-b356-8038740aae81';
  v_cc uuid; v_sub uuid; v_sub2 uuid; v_centro uuid; v_cat uuid;
  v_r_rende uuid; v_r_tarifa uuid; v_r_sem_aplic uuid;
  v_imp jsonb; v_res jsonb;
  v_deb uuid; v_cred uuid; v_tar uuid; v_outro uuid;
  v_trf public.transferencias_contas;
  v_lanc public.lancamentos;
begin
  perform set_config('request.jwt.claims', json_build_object('sub', v_tiago, 'role', 'authenticated')::text, true);

  insert into public.contas_bancarias (nome, banco, tipo, conta, ativo, saldo_inicial, saldo_inicial_data)
  values ('PROVA REGRAS', 'outro', 'corrente', '888.888-8', true, 1000, date '2026-09-30') returning id into v_cc;
  -- A subconta de investimentos nasce junto com a conta corrente (trigger).
  select id into v_sub from public.contas_bancarias where conta_pai_id = v_cc;
  select c.id into v_centro from public.centros_custo c where c.ativo and c.pai_id is null and c.tipo = 'escritorio' limit 1;
  select c.id into v_cat from public.categorias_financeiras c where c.ativo and c.tipo = 'despesa' order by c.nome limit 1;

  v_imp := public.fn_conciliacao_importar(v_cc, 'PROVA.ofx', date '2026-10-01', date '2026-10-31', null, null, jsonb_build_array(
    jsonb_build_object('data', '2026-10-02', 'valor', -100, 'memo', 'BB RENDE FÁCIL - RENDE FACIL', 'fitid', 'pr-1'),
    jsonb_build_object('data', '2026-10-03', 'valor', 40, 'memo', 'BB RENDE FÁCIL - RENDE FACIL', 'fitid', 'pr-2'),
    jsonb_build_object('data', '2026-10-05', 'valor', -30, 'memo', 'TARIFA PACOTE DE SERVIÇOS - COBRANÇA REFERENTE 05/10/2026', 'fitid', 'pr-3'),
    jsonb_build_object('data', '2026-10-06', 'valor', -7, 'memo', 'PIX - ENVIADO - 06/10 10:00 FULANO', 'fitid', 'pr-4')));
  select id into v_deb from public.extrato_transacoes where conta_bancaria_id = v_cc and fitid = 'pr-1';
  select id into v_cred from public.extrato_transacoes where conta_bancaria_id = v_cc and fitid = 'pr-2';
  select id into v_tar from public.extrato_transacoes where conta_bancaria_id = v_cc and fitid = 'pr-3';
  select id into v_outro from public.extrato_transacoes where conta_bancaria_id = v_cc and fitid = 'pr-4';

  -- normalizacao
  if public.fn_conciliacao_normalizar_historico('  Tarifa   pacote de serviços ') <> 'TARIFA PACOTE DE SERVICOS' then
    raise exception 'FALHA 0: normalizacao';
  end if;

  v_r_rende := public.fn_conciliacao_salvar_regra(null, jsonb_build_object(
    'contaBancariaId', v_cc, 'nome', 'BB Rende Fácil', 'padrao', 'bb rende fácil', 'acao', 'transferencia',
    'contaContraparteId', v_sub, 'centroCustoId', v_aplic, 'automatica', true));
  v_r_tarifa := public.fn_conciliacao_salvar_regra(null, jsonb_build_object(
    'contaBancariaId', v_cc, 'nome', 'Tarifa pacote', 'padrao', 'TARIFA PACOTE DE SERVICOS', 'sentido', 'debito',
    'acao', 'lancar', 'categoriaId', v_cat, 'centroCustoId', v_centro, 'automatica', false));
  if (select padrao from public.conciliacao_regras where id = v_r_rende) <> 'BB RENDE FACIL' then
    raise exception 'FALHA 1: padrao nao normalizado';
  end if;

  -- automaticas: Rende Facil aplica, tarifa (nao automatica) vira sugestao
  v_res := public.fn_conciliacao_aplicar_regras(v_cc, null);
  if (v_res->>'aplicadas')::int <> 2 or (v_res->>'sugeridas')::int <> 1 or jsonb_array_length(v_res->'ignoradas') <> 0 then
    raise exception 'FALHA 2: aplicar_regras = %', v_res;
  end if;
  select tr.* into v_trf from public.transferencias_contas tr join public.extrato_transacoes t on t.transferencia_id = tr.id where t.id = v_deb;
  if v_trf.conta_origem_id <> v_cc or v_trf.conta_destino_id <> v_sub or v_trf.valor <> 100
     or v_trf.descricao <> 'BB Rende Fácil (regra)' or v_trf.centro_custo_id <> v_aplic then
    raise exception 'FALHA 2: debito nao virou aplicacao: %', to_jsonb(v_trf);
  end if;
  select tr.* into v_trf from public.transferencias_contas tr join public.extrato_transacoes t on t.transferencia_id = tr.id where t.id = v_cred;
  if v_trf.conta_origem_id <> v_sub or v_trf.conta_destino_id <> v_cc or v_trf.valor <> 40 then
    raise exception 'FALHA 2: credito nao virou resgate: %', to_jsonb(v_trf);
  end if;
  if not (select conciliacao_automatica from public.extrato_transacoes where id = v_deb) then
    raise exception 'FALHA 2: nao marcou automatica';
  end if;
  if (select conciliada from public.extrato_transacoes where id = v_tar) then
    raise exception 'FALHA 2: regra nao automatica aplicou sozinha';
  end if;
  if (select vezes_aplicada from public.conciliacao_regras where id = v_r_rende) <> 2 then
    raise exception 'FALHA 2: vezes_aplicada';
  end if;
  raise notice 'OK 2 Rende Facil: debito = aplicacao, credito = resgate; tarifa ficou como sugestao';

  -- "Aplicar" da tela: tarifa vira lancamento pago e conciliado
  v_res := public.fn_conciliacao_aplicar_regra(v_r_tarifa, array[v_tar, v_outro]);
  if (v_res->>'aplicadas')::int <> 1 or jsonb_array_length(v_res->'falhas') <> 1 then
    raise exception 'FALHA 3: aplicar_regra = %', v_res;
  end if;
  select l.* into v_lanc from public.lancamentos l join public.lancamento_parcelas p on p.lancamento_id = l.id
   join public.extrato_transacoes t on t.parcela_id = p.id where t.id = v_tar;
  if v_lanc.id is null or v_lanc.status <> 'pago' or v_lanc.categoria_id <> v_cat or v_lanc.centro_custo_id <> v_centro
     or v_lanc.valor <> 30 or v_lanc.mes_competencia <> date '2026-10-01' then
    raise exception 'FALHA 3: lancamento = %', to_jsonb(v_lanc);
  end if;
  if (select conciliacao_automatica from public.extrato_transacoes where id = v_tar) then
    raise exception 'FALHA 3: aplicacao manual marcada como automatica';
  end if;
  raise notice 'OK 3 tarifa: lancamento pago e conciliado; PIX de outro historico recusado';

  -- subconta sem aplicacao: regra sem aplicacao e sem cadastro recusa
  insert into public.contas_bancarias (nome, banco, tipo, conta, ativo, saldo_inicial, saldo_inicial_data)
  values ('PROVA REGRAS 2', 'outro', 'corrente', '777.777-7', true, 0, date '2026-09-30') returning id into v_cc;
  select id into v_sub2 from public.contas_bancarias where conta_pai_id = v_cc;
  perform public.fn_conciliacao_importar(v_cc, 'PROVA2.ofx', date '2026-10-01', date '2026-10-31', null, null, jsonb_build_array(
    jsonb_build_object('data', '2026-10-02', 'valor', -50, 'memo', 'BB RENDE FÁCIL - RENDE FACIL', 'fitid', 'pr2-1')));
  v_r_sem_aplic := public.fn_conciliacao_salvar_regra(null, jsonb_build_object(
    'contaBancariaId', v_cc, 'nome', 'Rende sem aplicacao', 'padrao', 'BB RENDE FACIL', 'acao', 'transferencia',
    'contaContraparteId', v_sub2, 'automatica', true));
  v_res := public.fn_conciliacao_aplicar_regras(v_cc, null);
  if (v_res->>'aplicadas')::int <> 0 or (v_res->'ignoradas'->0->>'erro') <> 'Cadastre a aplicacao da subconta' then
    raise exception 'FALHA 4: sem aplicacao = %', v_res;
  end if;
  raise notice 'OK 4 subconta sem aplicacao: fica em Faltam com o aviso';

  -- mes fechado recusa
  insert into public.conciliacao_fechamentos (conta_bancaria_id, mes, saldo_banco, saldo_app, fechado_por)
  values (v_cc, date '2026-10-01', 0, 0, v_tiago);
  begin
    perform public.fn_conciliacao_aplicar_regras(v_cc, date '2026-10-01');
    raise exception 'FALHA 5: aplicou em mes fechado';
  exception when others then
    if sqlerrm like 'FALHA%' then raise; end if;
  end;
  v_res := public.fn_conciliacao_aplicar_regras(v_cc, null);
  if (v_res->>'aplicadas')::int <> 0 then raise exception 'FALHA 5: todos os meses aplicou no fechado'; end if;
  raise notice 'OK 5 mes fechado recusa';
end;
$prova$;

select 'PROVA OK' as resultado;

rollback;
