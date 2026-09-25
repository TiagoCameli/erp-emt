-- =============================================================
-- As aplicacoes e resgates da Caixa viram TRANSFERENCIAS para a subconta
--
-- PEDIDO DO TIAGO (24/09/2026), com as escolhas dele:
--   * saldo separado: a conta corrente mostra o disponivel, a subconta o aplicado;
--   * "o saldo em aplicacao e tudo que foi aplicado menos o que foi resgatado,
--     veja tudo que esta lancado no cc de investimentos";
--   * converter tudo o que estava lancado como despesa/receita no CC Investimentos;
--   * autorizacao explicita em 25/09/2026: "pode converter e dividir o saldo".
--
-- ============================================================
-- O QUE HAVIA NO CC INVESTIMENTOS (conferido em 25/09/2026)
-- ============================================================
-- 52 lancamentos, todos na CAIXA ECONOMICA 578367973-5, todos pagos, uma parcela
-- cada, nenhum conciliado com extrato, nenhum rateado fora do centro:
--   Aplicacao financeira (movimentacao) ....  8   R$  8.278.000,00
--   Resgate de aplicacao (movimentacao) .... 35   R$  8.494.887,62
--   "Investimentos" (operacional, CUSTO) ...  3   R$  6.100.000,00
--   "Outras despesas" (operacional, CUSTO)   3   R$  2.026.519,44
--   "Outras receitas" (operacional) ........  3   R$  1.976.925,59
--
-- 51 viram transferencia. Fica de fora o LAN-2026-7048 "DEBITO AUTORIZADO"
-- (R$ 19.519,44, 29/05): e um debito coberto por um resgate automatico do mesmo
-- valor no mesmo dia -- o resgate e movimentacao, o debito e uma despesa que
-- alguem pagou. Ele continua lancado, para o Tiago reclassificar.
--
-- Aplicacao (a pagar) -> transferencia Caixa -> subconta.
-- Resgate (a receber) -> transferencia subconta -> Caixa.
-- A aplicacao sai da descricao do banco: "CDB" -> Caixa Economica - CDB 95; o
-- resto ("APLICACAO FDO", "FDO - CLIENTE", "RESGATE AUTOMATICO") -> Fundo.
--
-- ============================================================
-- O SALDO INICIAL SE DIVIDE, O TOTAL NAO MUDA
-- ============================================================
-- O saldo inicial da Caixa (R$ 4.599.100,34 em 26/08) era corrente + aplicado
-- (a "opcao A" de 22/08). Ele se divide pela regra do Tiago: a subconta comeca
-- com o aplicado menos o resgatado ate o corte (R$ 4.529.409,44) e a corrente
-- fica com o resto (R$ 69.690,90). As transferencias ate o corte ficam como
-- historico e nao movem saldo (a regra de sempre do corte); as de depois movem.
--
-- Conferido aqui dentro (a migration aborta se falhar):
--   Caixa + subconta ........ identico ao centavo
--   demais contas ........... identicas
--   corrente da Caixa ....... nao fica negativa
--   custo por centro ........ so o Investimentos muda
--
-- Copia integral em arquivo_morto antes de apagar, como em 22/08: para desfazer,
-- reinserir das tres tabelas, apagar as transferencias com observacao
-- "Convertido do lancamento" e devolver o saldo inicial da subconta a Caixa.
-- =============================================================

drop table if exists arquivo_morto.lancamentos_investimentos_20260925;
drop table if exists arquivo_morto.lancamento_parcelas_investimentos_20260925;
drop table if exists arquivo_morto.lancamento_rateios_investimentos_20260925;

create table arquivo_morto.lancamentos_investimentos_20260925 as
  select distinct l.*
  from public.lancamentos l
  join public.lancamento_rateios r on r.lancamento_id = l.id
  join public.centros_custo c on c.id = r.centro_custo_id
  left join public.centros_custo raiz on raiz.id = c.pai_id
  where coalesce(raiz.tipo, c.tipo) = 'investimento'
    and l.status <> 'cancelado'
    and l.numero <> 'LAN-2026-7048';

create table arquivo_morto.lancamento_parcelas_investimentos_20260925 as
  select p.* from public.lancamento_parcelas p
  where p.lancamento_id in (select id from arquivo_morto.lancamentos_investimentos_20260925);

create table arquivo_morto.lancamento_rateios_investimentos_20260925 as
  select r.* from public.lancamento_rateios r
  where r.lancamento_id in (select id from arquivo_morto.lancamentos_investimentos_20260925);

comment on table arquivo_morto.lancamentos_investimentos_20260925 is
  'Os 51 lancamentos de aplicacao/resgate do CC Investimentos (Caixa), convertidos em transferencias para a subconta de investimentos em 25/09/2026 a pedido do Tiago. Copia integral: para desfazer, reinserir daqui e das duas tabelas irmas.';

do $conversao$
declare
  v_caixa uuid;
  v_sub uuid;
  v_corte date;
  v_cdb uuid;
  v_fundo uuid;
  v_copiados int;
  v_parcelas int;
  v_criadas int;
  v_apagados int;
  v_aplicado_no_corte numeric(14, 2);
  v_total_antes numeric(14, 2);
  v_total_depois numeric(14, 2);
  v_outras_antes jsonb;
  v_outras_depois jsonb;
  v_custo_antes jsonb;
  v_custo_depois jsonb;
  v_mudados jsonb;
begin
  select c.id, c.saldo_inicial_data into v_caixa, v_corte
  from public.contas_bancarias c where c.nome = 'CAIXA ECONOMICA 578367973-5';
  select s.id into v_sub from public.contas_bancarias s where s.conta_pai_id = v_caixa;
  select e.id into v_cdb from public.centros_custo e
    join public.centros_custo raiz on raiz.id = e.pai_id
    where raiz.tipo = 'investimento' and e.nome = 'Caixa Econômica - CDB 95';
  select e.id into v_fundo from public.centros_custo e
    join public.centros_custo raiz on raiz.id = e.pai_id
    where raiz.tipo = 'investimento' and e.nome = 'Caixa Econômica - Fundo';

  if v_caixa is null or v_sub is null or v_cdb is null or v_fundo is null or v_corte is null then
    raise exception 'Faltou a Caixa (%), a subconta (%), uma aplicacao (% / %) ou o corte (%)',
      v_caixa, v_sub, v_cdb, v_fundo, v_corte;
  end if;

  select count(*) into v_copiados from arquivo_morto.lancamentos_investimentos_20260925;
  select count(*) into v_parcelas from arquivo_morto.lancamento_parcelas_investimentos_20260925;
  if v_copiados <> 51 or v_parcelas <> 51 then
    raise exception 'Esperava 51 lancamentos e 51 parcelas copiados, e ha % e %', v_copiados, v_parcelas;
  end if;
  if exists (
    select 1 from arquivo_morto.lancamento_parcelas_investimentos_20260925 p
    where p.status <> 'pago' or p.conta_bancaria_id <> v_caixa or p.data_pagamento is null
       or coalesce(p.valor_liquido, 0) <= 0
  ) then
    raise exception 'Ha parcela nao paga, fora da Caixa, sem data ou sem valor: nao converto no escuro';
  end if;
  if exists (
    select 1 from public.extrato_transacoes t
    where t.parcela_id in (select id from arquivo_morto.lancamento_parcelas_investimentos_20260925)
  ) then
    raise exception 'Ha parcela conciliada com extrato: a conciliacao ficaria orfa';
  end if;

  -- O antes.
  select round(public.fn_saldo_conta(v_caixa) + public.fn_saldo_conta(v_sub), 2) into v_total_antes;
  select jsonb_object_agg(c.nome, public.fn_saldo_conta(c.id)) into v_outras_antes
    from public.contas_bancarias c where c.id not in (v_caixa, v_sub);
  select jsonb_object_agg(cc.nome, t.total) into v_custo_antes from (
    select r.centro_custo_id, sum(r.valor) as total
    from public.lancamento_rateios r
    join public.lancamentos l on l.id = r.lancamento_id
    where l.status <> 'cancelado' and l.tipo = 'a_pagar'
    group by 1) t
    join public.centros_custo cc on cc.id = t.centro_custo_id;

  -- As transferencias, na ordem do extrato.
  insert into public.transferencias_contas (
    numero, conta_origem_id, conta_destino_id, data_transferencia, valor, tarifa,
    descricao, observacoes, centro_custo_id, created_by
  )
  select
    public.proximo_numero_documento('TRF'),
    x.origem, x.destino, x.data_pagamento, x.valor_liquido, 0,
    x.descricao, x.observacoes, x.aplicacao, x.created_by
  from (
    select
      case when l.tipo = 'a_pagar' then v_caixa else v_sub end as origem,
      case when l.tipo = 'a_pagar' then v_sub else v_caixa end as destino,
      p.data_pagamento,
      p.valor_liquido,
      l.descricao,
      'Convertido do lancamento ' || l.numero || ' (' || coalesce(cat.nome, 'sem categoria')
        || ') em 25/09/2026: aplicacao nao e despesa, e dinheiro que vai para a subconta de investimentos.'
        as observacoes,
      case when l.descricao ilike '%CDB%' then v_cdb else v_fundo end as aplicacao,
      l.created_by,
      l.numero
    from arquivo_morto.lancamentos_investimentos_20260925 l
    join arquivo_morto.lancamento_parcelas_investimentos_20260925 p on p.lancamento_id = l.id
    left join public.categorias_financeiras cat on cat.id = l.categoria_id
    order by p.data_pagamento, l.numero
  ) x;
  get diagnostics v_criadas = row_count;

  if v_criadas <> v_copiados then
    raise exception 'Copiei % lancamentos e criei % transferencias', v_copiados, v_criadas;
  end if;

  -- O saldo inicial se divide no corte: aplicado menos resgatado ate la.
  select round(coalesce(sum(case when t.conta_destino_id = v_sub then t.valor else -t.valor end), 0), 2)
  into v_aplicado_no_corte
  from public.transferencias_contas t
  where (t.conta_destino_id = v_sub or t.conta_origem_id = v_sub)
    and t.data_transferencia <= v_corte;

  if v_aplicado_no_corte <> 4529409.44 then
    raise exception 'Esperava R$ 4.529.409,44 aplicados no corte e deu R$ %', v_aplicado_no_corte;
  end if;

  update public.contas_bancarias
  set saldo_inicial = saldo_inicial - v_aplicado_no_corte
  where id = v_caixa;
  update public.contas_bancarias
  set saldo_inicial = v_aplicado_no_corte, saldo_inicial_data = v_corte
  where id = v_sub;

  -- Os lancamentos saem (parcelas, rateios e formas caem por cascade).
  delete from public.lancamentos
  where id in (select id from arquivo_morto.lancamentos_investimentos_20260925);
  get diagnostics v_apagados = row_count;

  execute 'set constraints all immediate';

  if v_apagados <> v_copiados then
    raise exception 'Copiei % e apaguei %', v_copiados, v_apagados;
  end if;

  -- O depois.
  select round(public.fn_saldo_conta(v_caixa) + public.fn_saldo_conta(v_sub), 2) into v_total_depois;
  if v_total_depois <> v_total_antes then
    raise exception 'Caixa + subconta mudou de R$ % para R$ %', v_total_antes, v_total_depois;
  end if;
  if public.fn_saldo_conta(v_caixa) < 0 then
    raise exception 'A corrente da Caixa ficaria negativa: R$ %', public.fn_saldo_conta(v_caixa);
  end if;

  select jsonb_object_agg(c.nome, public.fn_saldo_conta(c.id)) into v_outras_depois
    from public.contas_bancarias c where c.id not in (v_caixa, v_sub);
  if v_outras_depois <> v_outras_antes then
    raise exception 'O saldo de outra conta mudou. Antes: %. Depois: %', v_outras_antes, v_outras_depois;
  end if;

  select jsonb_object_agg(cc.nome, t.total) into v_custo_depois from (
    select r.centro_custo_id, sum(r.valor) as total
    from public.lancamento_rateios r
    join public.lancamentos l on l.id = r.lancamento_id
    where l.status <> 'cancelado' and l.tipo = 'a_pagar'
    group by 1) t
    join public.centros_custo cc on cc.id = t.centro_custo_id;
  select coalesce(jsonb_agg(k), '[]'::jsonb) into v_mudados
  from (select jsonb_object_keys(v_custo_antes) as k
        union select jsonb_object_keys(coalesce(v_custo_depois, '{}'::jsonb))) ks
  where (v_custo_antes->>k) is distinct from (v_custo_depois->>k);
  if v_mudados <> '["Investimentos"]'::jsonb then
    raise exception 'Esperava que so o centro Investimentos mudasse, e mudaram: %', v_mudados;
  end if;

  raise notice 'Convertidos %: corrente da Caixa R$ %, subconta R$ %, total R$ % (igual).',
    v_criadas, public.fn_saldo_conta(v_caixa), public.fn_saldo_conta(v_sub), v_total_depois;
end $conversao$;
