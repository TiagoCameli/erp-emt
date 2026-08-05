-- Prova de aceite: desconto no pagamento da parcela.
--
-- Roda em transacao e termina em ROLLBACK: nada do que ela cria sobrevive.
-- Cria a propria conta bancaria (saldo_inicial R$ 500.000,00) para a aritmetica
-- do saldo ser exata e nao depender do que existe em producao. Os numeros sao os
-- da BR-364: parcela de R$ 500.000,00 paga com R$ 24.600,00 de desconto.
--
-- As RPCs sao SECURITY DEFINER e checam permissao por tem_permissao(), que le
-- auth.uid() de request.jwt.claims. Por isso a prova seta as claims do usuario
-- em vez de trocar de role: o que se prova aqui e a REGRA.
--
-- O que esta prova mede, e por que ela existe:
-- o saldo de conta bancaria NAO e uma coluna. Ele e DERIVADO, recalculado a
-- cada leitura, em lugares independentes que somam parcela paga. Acertar so a
-- funcao de pagar deixaria a tela de Pagamentos certa e o saldo errado para
-- sempre. Entao cada afirmacao abaixo e medida nos SEIS derivadores:
--   D1 guarda de saldo insuficiente dentro de fn_pagar_parcela (medida pelo
--      COMPORTAMENTO: o pagamento seguinte que so cabe se o desconto foi
--      respeitado tem que passar, e o centavo acima dele tem que ser recusado)
--   D2 a soma COMPLETA em SQL das parcelas pagas da conta: a verdade contra a
--      qual a coluna "Saldo atual" de Financeiro > Contas bancarias e conferida.
--      A tela nao soma mais parcela por parcela em Node: ela le a mesma RPC do
--      D3 (o motivo esta no item 8, e o lado TS tem teste em
--      contas-bancarias/saldo.test.ts e contas-bancarias/queries.test.ts)
--   D3 fn_rel_posicao_bancaria (relatorio Posicao bancaria)
--   D4 fn_rel_gestao_financeiro_resumo (KPI "pago no mes" do painel Gestao)
--   D5 fn_rel_fluxo_caixa (grafico de fluxo de caixa, linha realizada)
--   D6 fn_conciliar_transacao (casamento com o extrato OFX)
-- e em fn_rel_aging, que NAO deve mudar de definicao: parcela paga sai dela
-- inteira, sem residuo.
--
-- Os itens 7 e 8 vieram de dois defeitos achados medindo esta prova:
--   item 7  a ORDEM das guardas. O `except all` do item 6 e cego para ordem: ele
--           provou que as duas recusas de desconto existem, nao em que posicao.
--           Elas estavam ACIMA do bloco de permissao, e a mensagem cita o valor
--           da parcela: usuario sem permissao lia o valor de qualquer parcela.
--   item 8  o teto de 1.000 linhas do PostgREST na coluna "Saldo atual", que
--           somava as parcelas pagas em Node. Com as 1.696 parcelas pagas da
--           carga da BR-364 a coluna mostraria saldo mais alto do que a conta
--           tem, calada, e discordaria da Posicao bancaria.
--
-- Como esta prova foi rodada antes de a migracao ir para o banco: o conteudo de
-- supabase/migrations/20260805120001_desconto_no_pagamento.sql foi executado
-- DENTRO desta mesma transacao, antes do bloco abaixo, e desfeito no rollback.
-- Com a migracao ja aplicada, o arquivo roda como esta.

begin;

select set_config(
  'request.jwt.claims',
  json_build_object(
    'sub', 'c66fca9f-5428-4fb9-855f-dcff548764df',
    'role', 'authenticated'
  )::text,
  true
);

create temp table prova_log (ordem serial, passo text, detalhe text) on commit drop;

-- ---------------------------------------------------------------------------
-- Guardas de fn_pagar_parcela que existiam ANTES desta migracao.
-- Extraidas da definicao VIVA em producao, cujo md5(prosrc) era
-- 89a1555c23f6625de1675af5b41dd094. Sao 14 mensagens de recusa (a lista do
-- pedido falava em 13 porque contava a janela de pagamento, que tem tres
-- mensagens em dois modos, como um item so).
-- ---------------------------------------------------------------------------
create temp table guardas_antes (texto text) on commit drop;
insert into guardas_antes (texto) values
  ('Parcela nao encontrada'),
  ('Este lancamento esta cancelado: nao da para pagar esta parcela'),
  ('A data do pagamento nao pode ser no futuro (hoje e %).'),
  ('Sem permissao para registrar pagamentos'),
  ('Esta parcela esta em revisao: ela precisa ser reenviada e aprovada antes de pagar'),
  ('A parcela precisa estar aprovada para pagamento'),
  ('Esta parcela esta aprovada sem data programada: reprograme a data antes de pagar'),
  ('Pagamento autorizado a partir de %.'),
  ('Pagamento autorizado para %.'),
  ('A data autorizada (%) passou: reprograme a data antes de pagar.'),
  ('Sem permissao para baixar recebimentos'),
  ('Parcela ja baixada ou cancelada'),
  ('Informe a conta bancaria'),
  ('Saldo insuficiente na conta: saldo atual R$ %, pagamento de R$ %.');

do $prova$
declare
  v_conta uuid;
  v_lanc uuid;
  v_p1 uuid;   -- R$ 500.000,00: a que paga com R$ 24.600,00 de desconto
  v_p2 uuid;   -- R$  24.600,00: paga SEM desconto, e a que prova a guarda D1
  v_p3 uuid;   -- R$ 475.400,00: fica sem pagar, prova que a guarda ainda recusa
  v_extrato uuid;
  v_transacao uuid;

  v_hoje date := (now() at time zone 'America/Rio_Branco')::date;
  v_mes text := to_char(v_hoje, 'YYYY-MM');

  -- Numeros da BR-364
  c_valor_p1   constant numeric(14,2) := 500000.00;
  c_desconto   constant numeric(14,2) := 24600.00;
  c_liquido_p1 constant numeric(14,2) := 475400.00;
  c_valor_p2   constant numeric(14,2) := 24600.00;
  c_valor_p3   constant numeric(14,2) := 475400.00;
  c_saldo_ini  constant numeric(14,2) := 500000.00;

  -- Baselines dos agregados globais (medidos por DELTA: sao somas de todo o
  -- banco, e delta e imune ao que ja existe em producao)
  b_resumo_valor numeric; b_resumo_cont int;
  b_fluxo numeric;
  b_aging numeric;

  -- Leituras
  v_saldo_d2 numeric; v_saldo_d3 numeric;
  v_entradas numeric; v_saidas numeric;
  v_resumo_valor numeric; v_resumo_cont int;
  v_fluxo numeric; v_aging numeric;
  v_status text; v_desconto numeric; v_liquido numeric; v_valor numeric;
  v_conciliada boolean;
  v_msg text; v_n int; v_falhou boolean;
begin
  -- =========================================================================
  -- Cenario
  -- =========================================================================
  insert into public.contas_bancarias (nome, banco, tipo, saldo_inicial, ativo)
  values ('PROVA desconto', 'outro', 'corrente', c_saldo_ini, true)
  returning id into v_conta;

  insert into public.lancamentos
    (tipo, origem, descricao, valor, status, fornecedor_id, categoria_id,
     forma_pagamento_id, data_vencimento, mes_competencia, data_compra)
  values
    ('a_pagar', 'manual', 'PROVA desconto no pagamento',
     c_valor_p1 + c_valor_p2 + c_valor_p3, 'a_pagar',
     '9d34a92c-9529-4889-837d-e388061c43ca',
     '2170f158-9057-4256-8689-34ba0f80a0b1',
     '3b51be5a-0f79-4868-b88d-115f794dd3e3',
     v_hoje, date_trunc('month', v_hoje)::date, v_hoje)
  returning id into v_lanc;

  -- Aprovadas com data_programada = hoje: a janela vigente e 'exata', que exige
  -- pagar no dia autorizado. Nada aqui mexe na regra da janela.
  insert into public.lancamento_parcelas
    (lancamento_id, numero_parcela, valor, data_vencimento, data_programada,
     data_programada_origem, status)
  values (v_lanc, 1, c_valor_p1, v_hoje, v_hoje, 'aprovacao', 'aprovado')
  returning id into v_p1;

  insert into public.lancamento_parcelas
    (lancamento_id, numero_parcela, valor, data_vencimento, data_programada,
     data_programada_origem, status)
  values (v_lanc, 2, c_valor_p2, v_hoje, v_hoje, 'aprovacao', 'aprovado')
  returning id into v_p2;

  insert into public.lancamento_parcelas
    (lancamento_id, numero_parcela, valor, data_vencimento, data_programada,
     data_programada_origem, status)
  values (v_lanc, 3, c_valor_p3, v_hoje, v_hoje, 'aprovacao', 'aprovado')
  returning id into v_p3;

  -- Desconto nasce zero em parcela nova, sem ninguem informar nada.
  select count(*) into v_n from public.lancamento_parcelas
  where lancamento_id = v_lanc and desconto = 0 and valor_liquido = valor;
  if v_n <> 3 then
    raise exception 'FALHA: parcela nova deveria nascer com desconto 0 e valor_liquido = valor (achei % de 3)', v_n;
  end if;
  insert into prova_log (passo, detalhe)
  values ('cenario', 'conta com saldo inicial R$ 500.000,00 e 3 parcelas aprovadas; desconto nasce 0 nas tres');

  -- Baselines
  select r.pago_mes_valor, r.pago_mes_contagem into b_resumo_valor, b_resumo_cont
  from public.fn_rel_gestao_financeiro_resumo(v_hoje) r;

  select coalesce(sum(f.total), 0) into b_fluxo
  from public.fn_rel_fluxo_caixa() f
  where f.tipo = 'a_pagar' and f.realizado and f.mes = v_mes;

  select coalesce(sum(a.total), 0) into b_aging
  from public.fn_rel_aging(v_hoje) a where a.tipo = 'a_pagar';

  -- A parcela aprovada esta no aging pelo valor CHEIO antes de ser paga.
  if b_aging < c_valor_p1 then
    raise exception 'FALHA: cenario invalido, aging a_pagar (%) deveria conter as 3 parcelas', b_aging;
  end if;

  -- =========================================================================
  -- Item 3 da prova: desconto negativo e desconto maior que o valor: RECUSADOS
  -- =========================================================================
  v_falhou := false;
  begin
    perform public.fn_pagar_parcela(v_p1, v_conta, v_hoje, -0.01);
  exception when others then
    v_falhou := true; v_msg := sqlerrm;
  end;
  if not v_falhou then
    raise exception 'FALHA: desconto negativo foi ACEITO';
  end if;
  insert into prova_log (passo, detalhe)
  values ('recusa: desconto negativo', v_msg);

  v_falhou := false;
  begin
    perform public.fn_pagar_parcela(v_p1, v_conta, v_hoje, c_valor_p1 + 0.01);
  exception when others then
    v_falhou := true; v_msg := sqlerrm;
  end;
  if not v_falhou then
    raise exception 'FALHA: desconto maior que o valor da parcela foi ACEITO';
  end if;
  insert into prova_log (passo, detalhe)
  values ('recusa: desconto > valor', v_msg);

  -- E a barreira final do banco, independente da funcao: o check da tabela.
  v_falhou := false;
  begin
    update public.lancamento_parcelas set desconto = valor + 0.01 where id = v_p1;
  exception when others then
    v_falhou := true; v_msg := sqlerrm;
  end;
  if not v_falhou then
    raise exception 'FALHA: check da tabela aceitou desconto maior que o valor';
  end if;
  insert into prova_log (passo, detalhe)
  values ('recusa: check da tabela (barreira final)', v_msg);

  -- Nada disso deixou marca.
  select status, desconto into v_status, v_desconto
  from public.lancamento_parcelas where id = v_p1;
  if v_status <> 'aprovado' or v_desconto <> 0 then
    raise exception 'FALHA: recusa deixou marca na parcela (status %, desconto %)', v_status, v_desconto;
  end if;

  -- =========================================================================
  -- Item 1 da prova: pagar COM desconto, e o saldo cai valor MENOS desconto
  -- nos quatro (aqui, seis) lugares
  -- =========================================================================
  perform public.fn_pagar_parcela(v_p1, v_conta, v_hoje, c_desconto);

  select status, desconto, valor, valor_liquido
  into v_status, v_desconto, v_valor, v_liquido
  from public.lancamento_parcelas where id = v_p1;

  if v_status <> 'pago' then
    raise exception 'FALHA: parcela nao ficou paga (status %)', v_status;
  end if;
  if v_desconto <> c_desconto then
    raise exception 'FALHA: desconto gravado % em vez de %', v_desconto, c_desconto;
  end if;
  if v_valor <> c_valor_p1 then
    raise exception 'FALHA: o valor da parcela foi alterado (% em vez de %). Desconto nao reescreve a divida', v_valor, c_valor_p1;
  end if;
  if v_liquido <> c_liquido_p1 then
    raise exception 'FALHA: valor_liquido % em vez de %', v_liquido, c_liquido_p1;
  end if;
  insert into prova_log (passo, detalhe)
  values ('pagou com desconto',
    format('status pago, valor R$ %s intacto, desconto R$ %s, liquido R$ %s',
      v_valor, v_desconto, v_liquido));

  -- D2: coluna "Saldo atual" de Contas bancarias (espelho de listarContas)
  select c.saldo_inicial
       + coalesce(sum(case when l.tipo = 'a_receber' then p.valor_liquido else -p.valor_liquido end), 0)
  into v_saldo_d2
  from public.contas_bancarias c
  left join public.lancamento_parcelas p on p.conta_bancaria_id = c.id and p.status = 'pago'
  left join public.lancamentos l on l.id = p.lancamento_id
  where c.id = v_conta
  group by c.saldo_inicial;

  if v_saldo_d2 <> c_saldo_ini - c_liquido_p1 then
    raise exception 'FALHA D2: saldo atual % em vez de % (caiu o valor cheio, nao o liquido)',
      v_saldo_d2, c_saldo_ini - c_liquido_p1;
  end if;
  insert into prova_log (passo, detalhe)
  values ('D2 saldo atual (Contas bancarias)',
    format('R$ %s = 500.000,00 menos 475.400,00', v_saldo_d2));

  -- D3: fn_rel_posicao_bancaria
  select coalesce(sum(case when r.tipo = 'a_receber' then r.total else 0 end), 0),
         coalesce(sum(case when r.tipo = 'a_pagar' then r.total else 0 end), 0)
  into v_entradas, v_saidas
  from public.fn_rel_posicao_bancaria() r
  where r.conta_bancaria_id = v_conta;

  v_saldo_d3 := c_saldo_ini + v_entradas - v_saidas;
  if v_saidas <> c_liquido_p1 then
    raise exception 'FALHA D3: posicao bancaria registrou saida de % em vez de %', v_saidas, c_liquido_p1;
  end if;
  if v_saldo_d3 <> c_saldo_ini - c_liquido_p1 then
    raise exception 'FALHA D3: saldo da posicao bancaria % em vez de %', v_saldo_d3, c_saldo_ini - c_liquido_p1;
  end if;
  -- Os dois derivadores independentes tem que concordar entre si.
  if v_saldo_d3 <> v_saldo_d2 then
    raise exception 'FALHA: D2 (%) e D3 (%) discordam do mesmo saldo', v_saldo_d2, v_saldo_d3;
  end if;
  insert into prova_log (passo, detalhe)
  values ('D3 posicao bancaria',
    format('saida R$ %s, saldo R$ %s, igual ao D2', v_saidas, v_saldo_d3));

  -- D4: KPI "pago no mes" do painel de Gestao
  select r.pago_mes_valor, r.pago_mes_contagem into v_resumo_valor, v_resumo_cont
  from public.fn_rel_gestao_financeiro_resumo(v_hoje) r;

  if v_resumo_valor - b_resumo_valor <> c_liquido_p1 then
    raise exception 'FALHA D4: pago no mes subiu % em vez de %',
      v_resumo_valor - b_resumo_valor, c_liquido_p1;
  end if;
  if v_resumo_cont - b_resumo_cont <> 1 then
    raise exception 'FALHA D4: contagem de pagas subiu % em vez de 1', v_resumo_cont - b_resumo_cont;
  end if;
  insert into prova_log (passo, detalhe)
  values ('D4 resumo do painel Gestao',
    format('pago no mes +R$ %s (liquido), +1 parcela', v_resumo_valor - b_resumo_valor));

  -- D5: fluxo de caixa, linha realizada
  select coalesce(sum(f.total), 0) into v_fluxo
  from public.fn_rel_fluxo_caixa() f
  where f.tipo = 'a_pagar' and f.realizado and f.mes = v_mes;

  if v_fluxo - b_fluxo <> c_liquido_p1 then
    raise exception 'FALHA D5: fluxo de caixa realizado subiu % em vez de %',
      v_fluxo - b_fluxo, c_liquido_p1;
  end if;
  insert into prova_log (passo, detalhe)
  values ('D5 fluxo de caixa realizado',
    format('+R$ %s (liquido)', v_fluxo - b_fluxo));

  -- =========================================================================
  -- Item 4 da prova: parcela paga com desconto NAO aparece como parcialmente
  -- aberta. Ela sai do aging INTEIRA: o aging cai o valor CHEIO, sem residuo.
  -- =========================================================================
  select coalesce(sum(a.total), 0) into v_aging
  from public.fn_rel_aging(v_hoje) a where a.tipo = 'a_pagar';

  if b_aging - v_aging <> c_valor_p1 then
    raise exception 'FALHA: aging caiu % em vez de % (sobrou residuo de parcela JA QUITADA)',
      b_aging - v_aging, c_valor_p1;
  end if;
  insert into prova_log (passo, detalhe)
  values ('aging sem residuo',
    format('aging a_pagar caiu R$ %s, o valor cheio da parcela: zero residuo', b_aging - v_aging));

  -- =========================================================================
  -- Item 1 (continuacao): D1, a guarda de saldo insuficiente
  -- =========================================================================
  -- Sobrou exatamente R$ 24.600,00 na conta (o desconto nao saiu dela). A
  -- parcela 2 vale exatamente isso: se a guarda ainda somasse o valor cheio da
  -- parcela 1, ela veria saldo zero e RECUSARIA este pagamento.
  perform public.fn_pagar_parcela(v_p2, v_conta, v_hoje);

  select status, desconto, valor_liquido into v_status, v_desconto, v_liquido
  from public.lancamento_parcelas where id = v_p2;
  if v_status <> 'pago' then
    raise exception 'FALHA D1: a guarda de saldo recusou pagamento que cabia (o desconto nao saiu da conta)';
  end if;
  insert into prova_log (passo, detalhe)
  values ('D1 guarda de saldo enxerga o liquido',
    'pagamento de R$ 24.600,00 passou: a guarda viu o saldo de R$ 24.600,00 que o desconto deixou');

  -- =========================================================================
  -- Item 2 da prova: pagar SEM desconto e identico a hoje
  -- =========================================================================
  if v_desconto <> 0 then
    raise exception 'FALHA: pagamento sem desconto gravou desconto %', v_desconto;
  end if;
  if v_liquido <> c_valor_p2 then
    raise exception 'FALHA: sem desconto o liquido (%) deveria ser o valor cheio (%)', v_liquido, c_valor_p2;
  end if;

  select c.saldo_inicial
       + coalesce(sum(case when l.tipo = 'a_receber' then p.valor_liquido else -p.valor_liquido end), 0)
  into v_saldo_d2
  from public.contas_bancarias c
  left join public.lancamento_parcelas p on p.conta_bancaria_id = c.id and p.status = 'pago'
  left join public.lancamentos l on l.id = p.lancamento_id
  where c.id = v_conta group by c.saldo_inicial;

  if v_saldo_d2 <> 0 then
    raise exception 'FALHA: sem desconto o saldo deveria zerar, deu %', v_saldo_d2;
  end if;

  select coalesce(sum(case when r.tipo = 'a_pagar' then r.total else 0 end), 0) into v_saidas
  from public.fn_rel_posicao_bancaria() r where r.conta_bancaria_id = v_conta;
  if v_saidas <> c_liquido_p1 + c_valor_p2 then
    raise exception 'FALHA: saidas % em vez de %', v_saidas, c_liquido_p1 + c_valor_p2;
  end if;

  select r.pago_mes_valor into v_resumo_valor
  from public.fn_rel_gestao_financeiro_resumo(v_hoje) r;
  if v_resumo_valor - b_resumo_valor <> c_liquido_p1 + c_valor_p2 then
    raise exception 'FALHA: pago no mes % em vez de %',
      v_resumo_valor - b_resumo_valor, c_liquido_p1 + c_valor_p2;
  end if;

  select coalesce(sum(f.total), 0) into v_fluxo
  from public.fn_rel_fluxo_caixa() f
  where f.tipo = 'a_pagar' and f.realizado and f.mes = v_mes;
  if v_fluxo - b_fluxo <> c_liquido_p1 + c_valor_p2 then
    raise exception 'FALHA: fluxo % em vez de %', v_fluxo - b_fluxo, c_liquido_p1 + c_valor_p2;
  end if;
  insert into prova_log (passo, detalhe)
  values ('pagou sem desconto: identico a hoje',
    'desconto 0, liquido = valor cheio, e os quatro derivadores somaram o valor cheio');

  -- D1 ainda RECUSA: a conta esta zerada, a parcela 3 nao cabe.
  v_falhou := false;
  begin
    perform public.fn_pagar_parcela(v_p3, v_conta, v_hoje);
  exception when others then
    v_falhou := true; v_msg := sqlerrm;
  end;
  if not v_falhou then
    raise exception 'FALHA D1: a guarda de saldo insuficiente parou de recusar';
  end if;
  if v_msg not like 'Saldo insuficiente%' then
    raise exception 'FALHA D1: recusou pelo motivo errado (%)', v_msg;
  end if;
  insert into prova_log (passo, detalhe)
  values ('D1 guarda ainda recusa o que nao cabe', v_msg);

  -- =========================================================================
  -- Item 5 da prova: estorno zera o desconto e o saldo volta ao que era
  -- =========================================================================
  perform public.fn_estornar_pagamento(v_p2);
  perform public.fn_estornar_pagamento(v_p1);

  select status, desconto, valor, valor_liquido
  into v_status, v_desconto, v_valor, v_liquido
  from public.lancamento_parcelas where id = v_p1;

  if v_status <> 'aprovado' then
    raise exception 'FALHA: estorno deixou a parcela em %', v_status;
  end if;
  if v_desconto <> 0 then
    raise exception 'FALHA: estorno NAO zerou o desconto (ficou %). A parcela voltaria a aberta carregando desconto de um pagamento que nao existe mais', v_desconto;
  end if;
  if v_liquido <> v_valor then
    raise exception 'FALHA: apos o estorno o liquido (%) deveria ser o valor cheio (%)', v_liquido, v_valor;
  end if;

  select c.saldo_inicial
       + coalesce(sum(case when l.tipo = 'a_receber' then p.valor_liquido else -p.valor_liquido end), 0)
  into v_saldo_d2
  from public.contas_bancarias c
  left join public.lancamento_parcelas p on p.conta_bancaria_id = c.id and p.status = 'pago'
  left join public.lancamentos l on l.id = p.lancamento_id
  where c.id = v_conta group by c.saldo_inicial;
  if v_saldo_d2 <> c_saldo_ini then
    raise exception 'FALHA D2: apos o estorno o saldo deveria voltar a %, deu %', c_saldo_ini, v_saldo_d2;
  end if;

  select count(*) into v_n from public.fn_rel_posicao_bancaria() r where r.conta_bancaria_id = v_conta;
  if v_n <> 0 then
    raise exception 'FALHA D3: apos o estorno a posicao bancaria ainda tem % linha(s) desta conta', v_n;
  end if;

  select r.pago_mes_valor, r.pago_mes_contagem into v_resumo_valor, v_resumo_cont
  from public.fn_rel_gestao_financeiro_resumo(v_hoje) r;
  if v_resumo_valor <> b_resumo_valor or v_resumo_cont <> b_resumo_cont then
    raise exception 'FALHA D4: apos o estorno o pago no mes nao voltou ao baseline (% vs %)',
      v_resumo_valor, b_resumo_valor;
  end if;

  select coalesce(sum(f.total), 0) into v_fluxo
  from public.fn_rel_fluxo_caixa() f
  where f.tipo = 'a_pagar' and f.realizado and f.mes = v_mes;
  if v_fluxo <> b_fluxo then
    raise exception 'FALHA D5: apos o estorno o fluxo realizado nao voltou ao baseline (% vs %)', v_fluxo, b_fluxo;
  end if;

  select coalesce(sum(a.total), 0) into v_aging
  from public.fn_rel_aging(v_hoje) a where a.tipo = 'a_pagar';
  if v_aging <> b_aging then
    raise exception 'FALHA: apos o estorno o aging nao voltou ao baseline (% vs %)', v_aging, b_aging;
  end if;

  insert into prova_log (passo, detalhe)
  values ('estorno zera o desconto e devolve o saldo',
    'desconto 0, status aprovado, e os seis derivadores de volta ao baseline');

  -- =========================================================================
  -- D6: conciliacao com o extrato casa pelo LIQUIDO
  -- =========================================================================
  -- O banco debitou R$ 475.400,00, nao R$ 500.000,00. Comparar com o valor
  -- cheio recusaria para sempre a conciliacao desta parcela.
  perform public.fn_pagar_parcela(v_p1, v_conta, v_hoje, c_desconto);

  insert into public.extratos_ofx (conta_bancaria_id, nome_arquivo, periodo_inicio, periodo_fim)
  values (v_conta, 'PROVA.ofx', v_hoje, v_hoje)
  returning id into v_extrato;

  insert into public.extrato_transacoes
    (extrato_id, conta_bancaria_id, data_movimento, valor, tipo, memo)
  values (v_extrato, v_conta, v_hoje, -c_liquido_p1, 'debito', 'PROVA pagamento com desconto')
  returning id into v_transacao;

  perform public.fn_conciliar_transacao(v_transacao, v_p1);

  select conciliada into v_conciliada from public.extrato_transacoes where id = v_transacao;
  if not coalesce(v_conciliada, false) then
    raise exception 'FALHA D6: a conciliacao do liquido nao marcou a transacao';
  end if;
  insert into prova_log (passo, detalhe)
  values ('D6 conciliacao casa pelo liquido',
    'debito de R$ 475.400,00 do extrato casou com a parcela de R$ 500.000,00 paga com R$ 24.600,00 de desconto');

  -- E o valor CHEIO no extrato agora nao casa, que e o certo: nao foi isso que
  -- o banco debitou.
  insert into public.extrato_transacoes
    (extrato_id, conta_bancaria_id, data_movimento, valor, tipo, memo)
  values (v_extrato, v_conta, v_hoje, -c_valor_p1, 'debito', 'PROVA valor cheio')
  returning id into v_transacao;

  v_falhou := false;
  begin
    perform public.fn_conciliar_transacao(v_transacao, v_p1);
  exception when others then
    v_falhou := true; v_msg := sqlerrm;
  end;
  if not v_falhou then
    raise exception 'FALHA D6: conciliou com o valor cheio, que nao foi o que o banco debitou';
  end if;
  insert into prova_log (passo, detalhe)
  values ('D6 recusa o valor cheio', v_msg);

  raise notice 'PROVA OK';
end $prova$;

-- ---------------------------------------------------------------------------
-- Item 7 da prova: a ORDEM das guardas, nao so a existencia delas.
--
-- O `except all` do item 6 e CEGO PARA ORDEM. Ele prova que as duas recusas de
-- desconto existem; nunca provou em que posicao. E a posicao era o defeito: com
-- elas ACIMA do bloco de permissao, isto foi medido em producao com um usuario
-- de token valido e ZERO permissao chamando a RPC com desconto absurdo:
--   "O desconto (R$ 99999999.00) nao pode ser maior que o valor da parcela
--    (R$ 777777.77)"
-- Quem nao podia pagar lia o valor de qualquer parcela cujo id conhecesse, um id
-- por vez.
--
-- O que se mede aqui, nos DOIS ramos (a_pagar e a_receber, onde vivem as duas
-- checagens de permissao):
--   a) sem permissao + desconto invalido: a resposta e a recusa de PERMISSAO, e
--      nao contem valor nenhum da parcela;
--   b) a MESMA chamada, com o usuario que TEM permissao, ainda recebe a recusa
--      de desconto. Sem essa segunda metade, apagar a guarda passaria pela (a).
-- ---------------------------------------------------------------------------
do $ordem$
declare
  c_usuario       constant uuid := 'c66fca9f-5428-4fb9-855f-dcff548764df';
  c_sem_permissao constant uuid := '00000000-0000-0000-0000-000000000000';

  c_valor    constant numeric(14,2) := 777777.77;   -- o valor que vazava
  c_absurdo  constant numeric(14,2) := 99999999.00; -- o desconto que o vazava
  c_saldo    constant numeric(14,2) := 1000000.00;

  v_hoje date := (now() at time zone 'America/Rio_Branco')::date;
  v_conta uuid; v_lanc_pagar uuid; v_lanc_receber uuid;
  v_p_pagar uuid; v_p_receber uuid;
  v_msg text; v_falhou boolean;
begin
  insert into public.contas_bancarias (nome, banco, tipo, saldo_inicial, ativo)
  values ('PROVA ordem das guardas', 'outro', 'corrente', c_saldo, true)
  returning id into v_conta;

  insert into public.lancamentos
    (tipo, origem, descricao, valor, status, fornecedor_id, categoria_id,
     forma_pagamento_id, data_vencimento, mes_competencia, data_compra)
  values
    ('a_pagar', 'manual', 'PROVA ordem das guardas (a pagar)', c_valor, 'a_pagar',
     '9d34a92c-9529-4889-837d-e388061c43ca',
     '2170f158-9057-4256-8689-34ba0f80a0b1',
     '3b51be5a-0f79-4868-b88d-115f794dd3e3',
     v_hoje, date_trunc('month', v_hoje)::date, v_hoje)
  returning id into v_lanc_pagar;

  insert into public.lancamento_parcelas
    (lancamento_id, numero_parcela, valor, data_vencimento, data_programada,
     data_programada_origem, status)
  values (v_lanc_pagar, 1, c_valor, v_hoje, v_hoje, 'aprovacao', 'aprovado')
  returning id into v_p_pagar;

  insert into public.lancamentos
    (tipo, origem, descricao, valor, status, categoria_id,
     data_vencimento, mes_competencia, data_compra)
  values
    ('a_receber', 'manual', 'PROVA ordem das guardas (a receber)', c_valor,
     'a_pagar', '2170f158-9057-4256-8689-34ba0f80a0b1',
     v_hoje, date_trunc('month', v_hoje)::date, v_hoje)
  returning id into v_lanc_receber;

  insert into public.lancamento_parcelas
    (lancamento_id, numero_parcela, valor, data_vencimento, status)
  values (v_lanc_receber, 1, c_valor, v_hoje, 'pendente')
  returning id into v_p_receber;

  -- O usuario "sem permissao" nao pode ter permissao nenhuma, senao a prova
  -- mede outra coisa.
  if exists (
    select 1 from public.usuario_permissoes where usuario_id = c_sem_permissao
  ) then
    raise exception 'FALHA: cenario invalido, o usuario sem permissao tem linha em usuario_permissoes';
  end if;

  perform set_config(
    'request.jwt.claims',
    json_build_object('sub', c_sem_permissao::text, 'role', 'authenticated')::text,
    true
  );

  if public.tem_permissao('financeiro.pagamentos', 'criar')
     or public.tem_permissao('financeiro.contas-receber', 'editar') then
    raise exception 'FALHA: cenario invalido, o usuario da prova de ordem tem permissao';
  end if;

  -- (a) a_pagar, desconto absurdo: tem que morrer na permissao.
  v_falhou := false;
  begin
    perform public.fn_pagar_parcela(v_p_pagar, v_conta, v_hoje, c_absurdo);
  exception when others then
    v_falhou := true; v_msg := sqlerrm;
  end;
  if not v_falhou then
    raise exception 'FALHA ORDEM: usuario sem permissao conseguiu pagar';
  end if;
  if v_msg <> 'Sem permissao para registrar pagamentos' then
    raise exception 'FALHA ORDEM: sem permissao + desconto invalido respondeu "%" em vez da recusa de permissao', v_msg;
  end if;
  if strpos(v_msg, '777777') > 0 or v_msg like '%R$%' or v_msg like '%desconto%' then
    raise exception 'FALHA ORDEM: a recusa vazou valor da parcela: %', v_msg;
  end if;
  insert into prova_log (passo, detalhe)
  values ('item 7: sem permissao + desconto absurdo (a_pagar)',
    format('%s (nao vazou o valor R$ %s da parcela)', v_msg, c_valor));

  -- (a) mesma coisa com desconto negativo: a outra guarda de desconto tambem
  -- esta abaixo da permissao.
  v_falhou := false;
  begin
    perform public.fn_pagar_parcela(v_p_pagar, v_conta, v_hoje, -0.01);
  exception when others then
    v_falhou := true; v_msg := sqlerrm;
  end;
  if v_msg <> 'Sem permissao para registrar pagamentos' then
    raise exception 'FALHA ORDEM: sem permissao + desconto negativo respondeu "%"', v_msg;
  end if;
  insert into prova_log (passo, detalhe)
  values ('item 7: sem permissao + desconto negativo (a_pagar)', v_msg);

  -- (a) ramo a_receber: a outra checagem de permissao tambem vem primeiro.
  v_falhou := false;
  begin
    perform public.fn_pagar_parcela(v_p_receber, v_conta, v_hoje, c_absurdo);
  exception when others then
    v_falhou := true; v_msg := sqlerrm;
  end;
  if v_msg <> 'Sem permissao para baixar recebimentos' then
    raise exception 'FALHA ORDEM: no ramo a_receber a resposta foi "%" em vez da recusa de permissao', v_msg;
  end if;
  if strpos(v_msg, '777777') > 0 then
    raise exception 'FALHA ORDEM: a recusa do a_receber vazou valor: %', v_msg;
  end if;
  insert into prova_log (passo, detalhe)
  values ('item 7: sem permissao + desconto absurdo (a_receber)', v_msg);

  -- Nada disso deixou marca em parcela nenhuma.
  if exists (
    select 1 from public.lancamento_parcelas
    where id in (v_p_pagar, v_p_receber) and (status = 'pago' or desconto <> 0)
  ) then
    raise exception 'FALHA ORDEM: a recusa de permissao deixou marca na parcela';
  end if;

  -- (b) volta o usuario de verdade: a guarda de desconto continua existindo e
  -- recusando. E a metade que impede "passar na prova apagando a guarda".
  perform set_config(
    'request.jwt.claims',
    json_build_object('sub', c_usuario::text, 'role', 'authenticated')::text,
    true
  );

  v_falhou := false;
  begin
    perform public.fn_pagar_parcela(v_p_pagar, v_conta, v_hoje, c_absurdo);
  exception when others then
    v_falhou := true; v_msg := sqlerrm;
  end;
  if not v_falhou then
    raise exception 'FALHA ORDEM: com permissao o desconto absurdo foi ACEITO';
  end if;
  if v_msg not like 'O desconto%' then
    raise exception 'FALHA ORDEM: com permissao a recusa de desconto sumiu (respondeu "%")', v_msg;
  end if;
  insert into prova_log (passo, detalhe)
  values ('item 7: MESMA chamada, com permissao', v_msg);

  raise notice 'ORDEM OK';
end $ordem$;

-- ---------------------------------------------------------------------------
-- Item 8 da prova: a coluna "Saldo atual" bate com a Posicao bancaria mesmo com
-- mais de 1.000 parcelas pagas.
--
-- A coluna somava as parcelas pagas em Node, com um select sem paginacao. O
-- PostgREST corta em 1.000 linhas SEM ERRO NENHUM. A carga da obra BR-364 cria
-- 1.696 parcelas pagas, confortavelmente acima do teto: a coluna ignoraria umas
-- 696 saidas, mostraria saldo MUITO MAIS ALTO do que a conta tem e discordaria
-- de Relatorios > Posicao bancaria, que passa por RPC. E e essa coluna que se
-- confere contra o extrato do banco.
--
-- A massa desta prova e o volume da carga: 1.696 parcelas pagas de R$ 1.100,00
-- com R$ 100,00 de desconto cada (liquido R$ 1.000,00), numa conta que comeca
-- com R$ 2.000.000,00. Todas do MESMO valor de proposito: assim quaisquer 1.000
-- delas somam o mesmo, e a divergencia do jeito antigo e exata, sem depender de
-- em que ordem o PostgREST devolveria as linhas.
-- ---------------------------------------------------------------------------
do $teto$
declare
  c_parcelas  constant int := 1696;              -- o volume da carga BR-364
  c_teto      constant int := 1000;              -- db-max-rows do PostgREST
  c_valor     constant numeric(14,2) := 1100.00;
  c_desconto  constant numeric(14,2) := 100.00;
  c_liquido   constant numeric(14,2) := 1000.00;
  c_saldo_ini constant numeric(14,2) := 2000000.00;

  v_hoje date := (now() at time zone 'America/Rio_Branco')::date;
  v_conta uuid; v_lanc uuid;
  v_n int; v_linhas_conta int; v_linhas_rpc int;
  v_saldo_verdade numeric;   -- soma completa em SQL: a verdade
  v_saldo_coluna numeric;    -- o que listarContas() calcula hoje (pela RPC)
  v_saldo_posicao numeric;   -- Relatorios > Posicao bancaria
  v_saldo_truncado numeric;  -- o que a tela mostrava antes, cortada no teto
  v_saldo_cheio numeric;     -- se a RPC somasse `valor` em vez de valor_liquido
begin
  insert into public.contas_bancarias (nome, banco, tipo, saldo_inicial, ativo)
  values ('PROVA teto de 1000 linhas', 'outro', 'corrente', c_saldo_ini, true)
  returning id into v_conta;

  insert into public.lancamentos
    (tipo, origem, descricao, valor, status, fornecedor_id, categoria_id,
     forma_pagamento_id, data_vencimento, mes_competencia, data_compra)
  values
    ('a_pagar', 'manual', 'PROVA carga BR-364 (1.696 parcelas pagas)',
     c_valor * c_parcelas, 'a_pagar',
     '9d34a92c-9529-4889-837d-e388061c43ca',
     '2170f158-9057-4256-8689-34ba0f80a0b1',
     '3b51be5a-0f79-4868-b88d-115f794dd3e3',
     v_hoje, date_trunc('month', v_hoje)::date, v_hoje)
  returning id into v_lanc;

  -- Massa inserida direto: o que se mede aqui e a LEITURA do saldo, nao o ato de
  -- pagar (esse ja esta medido nos itens 1 a 6).
  insert into public.lancamento_parcelas
    (lancamento_id, numero_parcela, valor, desconto, data_vencimento, status,
     conta_bancaria_id, data_pagamento)
  select v_lanc, g, c_valor, c_desconto, v_hoje, 'pago', v_conta, v_hoje
  from generate_series(1, c_parcelas) g;

  select count(*) into v_n
  from public.lancamento_parcelas
  where conta_bancaria_id = v_conta and status = 'pago';
  if v_n <> c_parcelas or v_n <= c_teto then
    raise exception 'FALHA: cenario invalido, % parcelas pagas (precisa ser % e passar do teto de %)',
      v_n, c_parcelas, c_teto;
  end if;

  -- A verdade, somada em SQL sem teto nenhum: 1.696 x R$ 1.000,00 de liquido.
  select c_saldo_ini - coalesce(sum(p.valor_liquido), 0) into v_saldo_verdade
  from public.lancamento_parcelas p
  join public.lancamentos l on l.id = p.lancamento_id
  where p.status = 'pago' and p.conta_bancaria_id = v_conta
    and l.status <> 'cancelado';

  if v_saldo_verdade <> c_saldo_ini - c_parcelas * c_liquido then
    raise exception 'FALHA: cenario invalido, verdade % em vez de %',
      v_saldo_verdade, c_saldo_ini - c_parcelas * c_liquido;
  end if;

  -- A coluna "Saldo atual" como listarContas() a calcula HOJE: saldo_inicial
  -- mais o agregado de fn_rel_posicao_bancaria, entradas somando e saidas
  -- subtraindo. E a mesma expressao, com os mesmos dados, do saldo.ts.
  select c.saldo_inicial
       + coalesce(sum(case when r.tipo = 'a_receber' then r.total else -r.total end), 0)
  into v_saldo_coluna
  from public.contas_bancarias c
  left join public.fn_rel_posicao_bancaria() r on r.conta_bancaria_id = c.id
  where c.id = v_conta
  group by c.saldo_inicial;

  if v_saldo_coluna <> v_saldo_verdade then
    raise exception 'FALHA: a coluna Saldo atual deu % e a verdade e %',
      v_saldo_coluna, v_saldo_verdade;
  end if;

  -- Posicao bancaria, do jeito que o relatorio monta (entradas - saidas).
  select c_saldo_ini
       + coalesce(sum(case when r.tipo = 'a_receber' then r.total else 0 end), 0)
       - coalesce(sum(case when r.tipo = 'a_pagar' then r.total else 0 end), 0)
  into v_saldo_posicao
  from public.fn_rel_posicao_bancaria() r
  where r.conta_bancaria_id = v_conta;

  if v_saldo_posicao <> v_saldo_coluna then
    raise exception 'FALHA: com % parcelas pagas a coluna Saldo atual (%) discorda da Posicao bancaria (%)',
      c_parcelas, v_saldo_coluna, v_saldo_posicao;
  end if;
  insert into prova_log (passo, detalhe)
  values ('item 8: coluna Saldo atual = Posicao bancaria com 1.696 parcelas pagas',
    format('R$ %s nas duas telas, e igual a soma completa em SQL', v_saldo_coluna));

  -- O jeito ANTIGO, medido: select sem paginacao cortado no teto do PostgREST.
  -- `limit 1000` sem order by e exatamente o que ele devolvia. Na tela o corte
  -- era ainda pior, porque a consulta era GLOBAL: as parcelas das outras contas
  -- disputavam o mesmo orcamento de 1.000 linhas.
  select c_saldo_ini - coalesce(sum(x.valor_liquido), 0) into v_saldo_truncado
  from (
    select p.valor_liquido
    from public.lancamento_parcelas p
    join public.lancamentos l on l.id = p.lancamento_id
    where p.status = 'pago' and p.conta_bancaria_id = v_conta
      and l.status <> 'cancelado'
    limit c_teto
  ) x;

  if v_saldo_truncado <> c_saldo_ini - c_teto * c_liquido then
    raise exception 'FALHA: a emulacao do corte deu % em vez de %',
      v_saldo_truncado, c_saldo_ini - c_teto * c_liquido;
  end if;
  if v_saldo_truncado <= v_saldo_coluna then
    raise exception 'FALHA: a emulacao do corte nao mostrou saldo mais alto (% vs %)',
      v_saldo_truncado, v_saldo_coluna;
  end if;
  if v_saldo_truncado - v_saldo_coluna <> (c_parcelas - c_teto) * c_liquido then
    raise exception 'FALHA: divergencia de % em vez de %',
      v_saldo_truncado - v_saldo_coluna, (c_parcelas - c_teto) * c_liquido;
  end if;
  insert into prova_log (passo, detalhe)
  values ('item 8: o defeito medido (soma em Node, cortada em 1.000 linhas)',
    format('mostraria R$ %s em vez de R$ %s: R$ %s a MAIS, %s saidas ignoradas em silencio',
      v_saldo_truncado, v_saldo_coluna, v_saldo_truncado - v_saldo_coluna,
      c_parcelas - c_teto));

  -- O agregado nao cresce com o volume: e por isso que a correcao nao tem o
  -- mesmo teto. 1.696 parcelas viram UMA linha.
  select count(*) into v_linhas_conta
  from public.fn_rel_posicao_bancaria() r where r.conta_bancaria_id = v_conta;
  select count(*) into v_linhas_rpc from public.fn_rel_posicao_bancaria() r;

  if v_linhas_conta <> 1 then
    raise exception 'FALHA: a RPC devolveu % linhas para uma conta com um tipo de lancamento', v_linhas_conta;
  end if;
  if v_linhas_rpc >= c_teto then
    raise exception 'FALHA: a RPC devolveu % linhas, o proprio teto do PostgREST voltaria a cortar', v_linhas_rpc;
  end if;
  insert into prova_log (passo, detalhe)
  values ('item 8: o agregado nao cresce com o volume',
    format('%s parcelas pagas viraram 1 linha na RPC; %s linha(s) no total, contra o teto de %s',
      c_parcelas, v_linhas_rpc, c_teto));

  -- E o agregado e do LIQUIDO: se somasse `valor`, a coluna daria outro numero.
  select c_saldo_ini - coalesce(sum(p.valor), 0) into v_saldo_cheio
  from public.lancamento_parcelas p
  where p.status = 'pago' and p.conta_bancaria_id = v_conta;

  if v_saldo_coluna = v_saldo_cheio then
    raise exception 'FALHA: a coluna somou o valor cheio (%), nao o liquido', v_saldo_cheio;
  end if;
  insert into prova_log (passo, detalhe)
  values ('item 8: o agregado e do liquido',
    format('R$ %s (liquido) e nao R$ %s, que e o que sairia somando o valor cheio',
      v_saldo_coluna, v_saldo_cheio));

  raise notice 'TETO OK';
end $teto$;

-- ---------------------------------------------------------------------------
-- Item 6 da prova: as guardas de fn_pagar_parcela intactas.
-- except all nas duas direcoes sobre as mensagens de recusa da definicao viva.
-- ---------------------------------------------------------------------------
create temp table guardas_depois (texto text) on commit drop;

insert into guardas_depois (texto)
select m[1]
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace,
     regexp_matches(p.prosrc, $re$raise exception '([^']*)'$re$, 'g') m
where n.nspname = 'public' and p.proname = 'fn_pagar_parcela';

do $guardas$
declare
  v_perdidas text;
  v_novas text;
  v_n int;
  v_md5_antes constant text := '89a1555c23f6625de1675af5b41dd094';
  v_md5_depois text;
  v_src text;
begin
  select md5(p.prosrc), p.prosrc into v_md5_depois, v_src
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public' and p.proname = 'fn_pagar_parcela';

  -- Direcao 1, a que importa: guarda que existia e nao existe mais.
  select string_agg(x.texto, ' | ') into v_perdidas
  from (select texto from guardas_antes except all select texto from guardas_depois) x;

  if v_perdidas is not null then
    raise exception 'FALHA: guarda(s) PERDIDA(S) em fn_pagar_parcela: %', v_perdidas;
  end if;

  -- Direcao 2: o que a migracao acrescentou. Tem que ser so o desconto.
  select string_agg(x.texto, ' | ') into v_novas
  from (select texto from guardas_depois except all select texto from guardas_antes) x;

  if v_novas is distinct from
     'O desconto nao pode ser negativo. | O desconto (R$ %) nao pode ser maior que o valor da parcela (R$ %).'
     and v_novas is distinct from
     'O desconto (R$ %) nao pode ser maior que o valor da parcela (R$ %). | O desconto nao pode ser negativo.'
  then
    raise exception 'FALHA: a migracao mexeu em guarda que nao era desconto. Novas: %', v_novas;
  end if;

  select count(*) into v_n from guardas_depois;
  if v_n <> 16 then
    raise exception 'FALHA: fn_pagar_parcela deveria ter 16 recusas (14 de antes + 2 de desconto), tem %', v_n;
  end if;

  -- Os dois efeitos do fim da funcao continuam sendo disparados.
  if v_src not like '%fn_recalcular_status_lancamento%' then
    raise exception 'FALHA: fn_pagar_parcela parou de chamar fn_recalcular_status_lancamento';
  end if;
  if v_src not like '%fn_propagar_anexos%' then
    raise exception 'FALHA: fn_pagar_parcela parou de chamar fn_propagar_anexos';
  end if;

  -- E a funcao mudou de verdade em relacao ao que estava em producao.
  if v_md5_depois = v_md5_antes then
    raise exception 'FALHA: fn_pagar_parcela nao mudou (md5 ainda %)', v_md5_antes;
  end if;

  insert into prova_log (passo, detalhe)
  values ('guardas intactas',
    format('14 de 14 mantidas (except all vazio), 2 novas de desconto, 16 no total; efeitos preservados; md5 %s -> %s',
      v_md5_antes, v_md5_depois));

  -- O grant nao pode ter voltado ao default de funcao nova (PUBLIC executa).
  if has_function_privilege('anon',
       'public.fn_pagar_parcela(uuid, uuid, date, numeric)', 'execute') then
    raise exception 'FALHA: anon ganhou execute em fn_pagar_parcela';
  end if;
  if not has_function_privilege('authenticated',
       'public.fn_pagar_parcela(uuid, uuid, date, numeric)', 'execute') then
    raise exception 'FALHA: authenticated perdeu execute em fn_pagar_parcela';
  end if;
  -- A assinatura antiga de 3 argumentos nao pode conviver com a nova: as duas
  -- casariam com a chamada de 3 argumentos ("function is not unique").
  if exists (
    select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname = 'fn_pagar_parcela'
      and p.pronargs = 3
  ) then
    raise exception 'FALHA: a fn_pagar_parcela de 3 argumentos sobreviveu ao lado da de 4';
  end if;

  insert into prova_log (passo, detalhe)
  values ('permissao no banco',
    'authenticated executa, anon nao, e existe uma unica assinatura de fn_pagar_parcela');

  -- Coluna nova: `authenticated` LÊ (herdado do grant de tabela), `anon` não lê,
  -- e ninguém ESCREVE desconto direto. Escrever é privilégio exclusivo das
  -- funções SECURITY DEFINER, que é o que faz a regra do desconto ser
  -- inescapável e não uma convenção do front.
  if not has_column_privilege('authenticated', 'public.lancamento_parcelas', 'desconto', 'select')
     or not has_column_privilege('authenticated', 'public.lancamento_parcelas', 'valor_liquido', 'select') then
    raise exception 'FALHA: authenticated nao le as colunas novas';
  end if;
  if has_column_privilege('anon', 'public.lancamento_parcelas', 'desconto', 'select') then
    raise exception 'FALHA: anon ganhou leitura de desconto';
  end if;
  if has_column_privilege('authenticated', 'public.lancamento_parcelas', 'desconto', 'update') then
    raise exception 'FALHA: authenticated pode gravar desconto direto, sem passar por fn_pagar_parcela';
  end if;

  insert into prova_log (passo, detalhe)
  values ('grant das colunas novas',
    'authenticated le desconto e valor_liquido, anon nao le, e nem authenticated grava desconto direto');

  raise notice 'GUARDAS OK';
end $guardas$;

select ordem, passo, detalhe from prova_log order by ordem;

rollback;
