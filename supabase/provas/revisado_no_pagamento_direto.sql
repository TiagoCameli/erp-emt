-- Prova de aceite do "marcar como revisado" no pagamento que nao passa pela
-- fila de aprovacao (dinheiro e cartao de credito).
--
-- Roda contra o banco vivo. Toda a massa nasce e morre dentro de uma
-- transacao de prova (o bloco `begin ... exception ... end` do plpgsql, que e'
-- um savepoint: ao levantar PROVA_ROLLBACK tudo o que foi escrito e' desfeito,
-- inclusive as linhas de audit_log). O resultado dos casos sobrevive porque
-- fica numa variavel jsonb, que nao e' banco. Pode rodar quantas vezes quiser.
--
-- Cobre:
--   1. marcar uma parcela JA PAGA funciona, e a auditoria registra (caso
--      principal: a area existe para conferir depois do fato consumado)
--   2. marcar e desmarcar funciona, e desmarcar limpa quem e quando
--   3. quem nao tem financeiro.aprovacao-pagamentos:aprovar e' recusado pelo
--      banco (usuario sem cadastro e usuario real sem a acao)
--   4. a revisao nao muda mais nada: a linha inteira da parcela e a linha do
--      lancamento ficam identicas, fora os proprios campos da conferencia
--   5. pagar continua funcionando sem revisao nenhuma, e aprovar tambem: a
--      prova de que nao nasceu um portao novo
--   6. depois do rollback, nada sobrou em producao
--
-- Os ids da massa sao fixos de proposito: o caso 6 precisa procurar por eles
-- depois que a transacao ja morreu.

create temp table if not exists prova_revisado (
  ordem int generated always as identity,
  caso text,
  esperado text,
  obtido text,
  passou boolean
);
truncate prova_revisado;

do $prova$
declare
  k_conta constant uuid := 'aa000000-0000-4000-8000-000000000001';
  k_lanc  constant uuid := 'aa000000-0000-4000-8000-000000000002';
  k_p1    constant uuid := 'aa000000-0000-4000-8000-000000000003';
  k_p2    constant uuid := 'aa000000-0000-4000-8000-000000000004';
  k_p3    constant uuid := 'aa000000-0000-4000-8000-000000000005';

  v_prova jsonb := '[]'::jsonb;
  v_usuario uuid;
  v_forma uuid;
  v_hoje date := (now() at time zone 'America/Rio_Branco')::date;
  v_antes jsonb; v_depois jsonb;
  v_antes_lanc jsonb; v_depois_lanc jsonb;
  v_txt text; v_int int; v_uuid uuid; v_ts timestamptz;
begin
  -- As funcoes checam tem_permissao(), que depende de auth.uid(). Rodando fora
  -- de uma sessao autenticada (SQL editor, MCP), assume o primeiro usuario
  -- ativo que aprova pagamentos.
  select u.id into v_usuario
  from public.usuarios u
  join public.usuario_permissoes up on up.usuario_id = u.id
  where u.ativo
    and up.recurso = 'financeiro.aprovacao-pagamentos'
    and up.acao = 'aprovar'
  limit 1;

  if v_usuario is null then
    raise exception 'Nenhum usuario ativo com financeiro.aprovacao-pagamentos:aprovar para rodar a prova';
  end if;

  select id into v_forma
  from public.formas_pagamento where tipo = 'dinheiro' and ativo order by nome limit 1;

  if v_forma is null then
    raise exception 'Catalogo sem forma de pagamento do tipo dinheiro';
  end if;

  -- ===================================================================
  -- transacao da prova: nada daqui para baixo e' commitado
  -- ===================================================================
  begin
    perform set_config('request.jwt.claims', json_build_object('sub', v_usuario)::text, true);

    -- massa: conta propria (para nao depender do saldo real de nenhuma conta)
    -- e um lancamento em dinheiro de R$ 300,00 em tres parcelas, uma em cada
    -- estado que interessa: paga, aprovada e pendente.
    insert into public.contas_bancarias (id, nome, saldo_inicial, ativo)
    values (k_conta, '[PROVA-REVISADO] conta', 1000.00, true);

    insert into public.lancamentos (
      id, tipo, origem, descricao, valor, status, forma_pagamento_id,
      data_vencimento, mes_competencia, data_compra, observacoes
    )
    values (
      k_lanc, 'a_pagar', 'manual', '[PROVA-REVISADO] pagamento em dinheiro',
      300.00, 'a_pagar', v_forma,
      v_hoje, date_trunc('month', v_hoje)::date, v_hoje, '[PROVA-REVISADO]'
    );

    insert into public.lancamento_parcelas (
      id, lancamento_id, numero_parcela, valor, data_vencimento, status,
      conta_bancaria_id, data_pagamento, pago_por, pago_em,
      aprovado_por, aprovado_em, data_programada, data_programada_origem
    )
    values
      (k_p1, k_lanc, 1, 100.00, v_hoje, 'pago', k_conta, v_hoje, v_usuario, now(),
       v_usuario, now(), null, null),
      (k_p2, k_lanc, 2, 100.00, v_hoje, 'aprovado', k_conta, null, null, null,
       v_usuario, now(), v_hoje, 'aprovacao'),
      (k_p3, k_lanc, 3, 100.00, v_hoje, 'pendente', k_conta, null, null, null,
       null, null, null, null);

    -- -----------------------------------------------------------------
    -- 1. marcar uma parcela JA PAGA (o caso principal)
    -- -----------------------------------------------------------------
    select to_jsonb(lp) into v_antes from public.lancamento_parcelas lp where lp.id = k_p1;
    select to_jsonb(l) into v_antes_lanc from public.lancamentos l where l.id = k_lanc;

    perform public.fn_marcar_parcela_revisada(k_p1);

    select lp.revisado_por, lp.revisado_em, lp.status
    into v_uuid, v_ts, v_txt
    from public.lancamento_parcelas lp where lp.id = k_p1;

    v_prova := v_prova || jsonb_build_object(
      'caso', '1. parcela paga: revisao registra QUEM',
      'esperado', v_usuario::text, 'obtido', coalesce(v_uuid::text, 'nulo'));
    v_prova := v_prova || jsonb_build_object(
      'caso', '1b. parcela paga: revisao registra QUANDO',
      'esperado', 'sim', 'obtido', case when v_ts is not null then 'sim' else 'nao' end);
    v_prova := v_prova || jsonb_build_object(
      'caso', '1c. parcela paga continua paga',
      'esperado', 'pago', 'obtido', v_txt);

    -- auditoria: o trigger padrao da tabela grava o UPDATE com o diff
    select count(*) into v_int
    from public.audit_log a
    where a.tabela = 'lancamento_parcelas'
      and a.registro_id = k_p1::text
      and a.acao = 'UPDATE'
      and a.dados_antes ->> 'revisado_por' is null
      and a.dados_depois ->> 'revisado_por' = v_usuario::text;
    v_prova := v_prova || jsonb_build_object(
      'caso', '1d. auditoria gravou a revisao (UPDATE com antes/depois)',
      'esperado', '1', 'obtido', v_int::text);

    -- -----------------------------------------------------------------
    -- 4. a revisao nao muda mais nada
    -- -----------------------------------------------------------------
    -- Compara a linha inteira, coluna por coluna, fora updated_at:
    -- trg_lancamento_parcelas_updated_at carimba QUALQUER update da tabela, e'
    -- comportamento padrao e nao efeito da revisao (dentro desta transacao ele
    -- nem chega a diferir, porque now() e' fixo na transacao). Status, data
    -- programada, conta, valor, datas e o resto tem que ficar identicos.
    select to_jsonb(lp) into v_depois from public.lancamento_parcelas lp where lp.id = k_p1;

    select coalesce(string_agg(k, ', ' order by k), 'nada mudou') into v_txt
    from (
      select key as k from jsonb_each(v_antes)
      where key <> 'updated_at'
        and value is distinct from (v_depois -> key)
    ) x;
    v_prova := v_prova || jsonb_build_object(
      'caso', '4. so os campos da conferencia mudaram na parcela',
      'esperado', 'revisado_em, revisado_por', 'obtido', v_txt);

    select to_jsonb(l) into v_depois_lanc from public.lancamentos l where l.id = k_lanc;
    v_prova := v_prova || jsonb_build_object(
      'caso', '4b. lancamento pai intacto',
      'esperado', 'identico',
      'obtido', case when v_antes_lanc = v_depois_lanc then 'identico' else 'mudou' end);

    -- -----------------------------------------------------------------
    -- 2. marcar e desmarcar
    -- -----------------------------------------------------------------
    perform public.fn_marcar_parcela_revisada(k_p3, true);

    select coalesce(lp.revisado_por::text, 'nulo')
           || ' / '
           || case when lp.revisado_em is not null then 'com data' else 'nulo' end
    into v_txt
    from public.lancamento_parcelas lp where lp.id = k_p3;
    v_prova := v_prova || jsonb_build_object(
      'caso', '2. marcar preenche quem e quando',
      'esperado', v_usuario::text || ' / com data', 'obtido', v_txt);

    perform public.fn_marcar_parcela_revisada(k_p3, false);

    select coalesce(lp.revisado_por::text, 'nulo')
           || ' / '
           || coalesce(lp.revisado_em::text, 'nulo')
    into v_txt
    from public.lancamento_parcelas lp where lp.id = k_p3;
    v_prova := v_prova || jsonb_build_object(
      'caso', '2b. desmarcar limpa quem e quando',
      'esperado', 'nulo / nulo', 'obtido', v_txt);

    select lp.status into v_txt from public.lancamento_parcelas lp where lp.id = k_p3;
    v_prova := v_prova || jsonb_build_object(
      'caso', '2c. marcar e desmarcar nao mexeu no status',
      'esperado', 'pendente', 'obtido', v_txt);

    -- -----------------------------------------------------------------
    -- 3. sem permissao o banco recusa
    -- -----------------------------------------------------------------
    perform set_config('request.jwt.claims',
      json_build_object('sub', '00000000-0000-4000-8000-0000000000ff')::text, true);
    begin
      perform public.fn_marcar_parcela_revisada(k_p1, true);
      v_txt := 'aceitou';
    exception when others then
      v_txt := 'recusado';
    end;
    v_prova := v_prova || jsonb_build_object(
      'caso', '3. usuario sem cadastro nao marca',
      'esperado', 'recusado', 'obtido', v_txt);

    -- agora o usuario real, so que sem a acao 'aprovar' (a exclusao tambem e'
    -- desfeita no fim): prova que o portao e' a permissao, nao o cadastro
    delete from public.usuario_permissoes
    where usuario_id = v_usuario
      and recurso = 'financeiro.aprovacao-pagamentos'
      and acao = 'aprovar';

    perform set_config('request.jwt.claims', json_build_object('sub', v_usuario)::text, true);
    begin
      perform public.fn_marcar_parcela_revisada(k_p3, true);
      v_txt := 'aceitou';
    exception when others then
      v_txt := 'recusado';
    end;
    v_prova := v_prova || jsonb_build_object(
      'caso', '3b. usuario real sem a acao aprovar nao marca',
      'esperado', 'recusado', 'obtido', v_txt);

    insert into public.usuario_permissoes (usuario_id, recurso, acao)
    values (v_usuario, 'financeiro.aprovacao-pagamentos', 'aprovar');

    -- -----------------------------------------------------------------
    -- 5. pagar sem revisao nenhuma continua funcionando
    -- -----------------------------------------------------------------
    select lp.revisado_em into v_ts from public.lancamento_parcelas lp where lp.id = k_p2;
    v_prova := v_prova || jsonb_build_object(
      'caso', '5. parcela a pagar entra no teste sem revisao',
      'esperado', 'nao revisada',
      'obtido', case when v_ts is null then 'nao revisada' else 'revisada' end);

    begin
      perform public.fn_pagar_parcela(k_p2, k_conta, v_hoje);
      v_txt := 'pagou';
    exception when others then
      v_txt := left(sqlerrm, 70);
    end;
    v_prova := v_prova || jsonb_build_object(
      'caso', '5b. fn_pagar_parcela nao exige revisao',
      'esperado', 'pagou', 'obtido', v_txt);

    select lp.status, lp.revisado_em into v_txt, v_ts
    from public.lancamento_parcelas lp where lp.id = k_p2;
    v_prova := v_prova || jsonb_build_object(
      'caso', '5c. parcela ficou paga sem nunca ter sido revisada',
      'esperado', 'pago / nao revisada',
      'obtido', v_txt || ' / ' || case when v_ts is null then 'nao revisada' else 'revisada' end);

    -- e a fila de aprovacao tambem nao virou portao: p3 esta sem revisao
    -- (foi marcada e desmarcada no caso 2) e tem que aprovar assim mesmo
    begin
      perform public.fn_aprovar_parcela(k_p3, v_hoje, k_conta);
      v_txt := 'aprovou';
    exception when others then
      v_txt := left(sqlerrm, 70);
    end;
    v_prova := v_prova || jsonb_build_object(
      'caso', '5d. fn_aprovar_parcela tambem nao exige revisao',
      'esperado', 'aprovou', 'obtido', v_txt);

    -- fim da transacao da prova: desfaz tudo
    raise exception using errcode = 'P0001', message = 'PROVA_ROLLBACK';
  exception when sqlstate 'P0001' then
    if sqlerrm <> 'PROVA_ROLLBACK' then
      raise;
    end if;
  end;

  insert into prova_revisado (caso, esperado, obtido, passou)
  select e ->> 'caso', e ->> 'esperado', e ->> 'obtido',
         (e ->> 'esperado') is not distinct from (e ->> 'obtido')
  from jsonb_array_elements(v_prova) e;
end $prova$;

-- 6. depois do rollback, nada sobrou em producao. Le o banco de verdade pelos
-- ids fixos da massa, incluindo o audit_log que a propria prova gerou.
insert into prova_revisado (caso, esperado, obtido, passou)
select '6. depois do rollback, nada sobrou em producao', '0', total::text, total = 0
from (
  select
    (select count(*) from public.contas_bancarias
      where id = 'aa000000-0000-4000-8000-000000000001'::uuid)
  + (select count(*) from public.lancamentos
      where id = 'aa000000-0000-4000-8000-000000000002'::uuid)
  + (select count(*) from public.lancamento_parcelas
      where lancamento_id = 'aa000000-0000-4000-8000-000000000002'::uuid)
  + (select count(*) from public.parcela_eventos
      where parcela_id in (
        'aa000000-0000-4000-8000-000000000003'::uuid,
        'aa000000-0000-4000-8000-000000000004'::uuid,
        'aa000000-0000-4000-8000-000000000005'::uuid))
  + (select count(*) from public.audit_log
      where registro_id in (
        'aa000000-0000-4000-8000-000000000001',
        'aa000000-0000-4000-8000-000000000002',
        'aa000000-0000-4000-8000-000000000003',
        'aa000000-0000-4000-8000-000000000004',
        'aa000000-0000-4000-8000-000000000005'))
  + (select count(*) from public.lancamentos where observacoes = '[PROVA-REVISADO]')
  as total
) t;

-- 6b. e a revisao nao vazou para nenhuma parcela de verdade
insert into prova_revisado (caso, esperado, obtido, passou)
select '6b. nenhuma parcela real ficou marcada pela prova', '0', c::text, c = 0
from (
  select count(*) as c from public.lancamento_parcelas
  where revisado_em >= now() - interval '10 minutes'
) t;

select
  caso,
  esperado,
  obtido,
  case when passou then 'PASSOU' else 'FALHOU' end as resultado
from prova_revisado
order by ordem;
