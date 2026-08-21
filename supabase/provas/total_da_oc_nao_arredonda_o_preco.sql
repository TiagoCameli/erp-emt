-- Prova de aceite: o total da OC não arredonda a taxa antes de multiplicar.
--
-- O caso real: 25.000 litros de Diesel S10 a R$ 6,1880, em três itens
-- (15.000 + 5.000 + 5.000).
--
--   conta certa:  R$ 154.700,00   <- a tela sempre mostrou isto
--   conta antiga: R$ 154.750,00   <- preço virava 6,19 antes de multiplicar
--
-- Com os dois números diferentes, `fn_salvar_parcelas_oc` recusava as parcelas
-- que vinham da tela e a OC ficava criada sem parcela nem forma.
--
-- Parte 1 é leitura. Parte 2 cria e paga de verdade, dentro de um bloco que
-- termina em `raise`: nada é gravado, e a numeração volta porque
-- `proximo_numero_documento` numera por UPDATE em tabela, não por sequência.

-- =====================================================================
-- Parte 1 (leitura): nenhuma OC do banco divergindo da função canônica
-- =====================================================================

select count(*) filter (
         where o.valor_total <> public.fn_total_da_oc(
           o.id, o.frete, o.outras_despesas, o.impostos, o.desconto)) as divergentes,
       count(*) as total_ocs
from public.ordens_compra o;

-- Esperado: divergentes = 0. Antes do conserto eram 14 (R$ 700,00 de inflação,
-- R$ 50,00 cada), todas em rascunho.

-- =====================================================================
-- Parte 2 (cria, paga e desfaz): o caso relatado de ponta a ponta
-- =====================================================================

do $prova$
declare
  v_usuario uuid := (select id from public.usuarios where email = 'tiago@emtconstrutora.com' and ativo limit 1);
  v_diesel uuid := '0d37c4aa-b2e4-417a-9e70-decd327d2631';
  v_boleto uuid := '0769ccff-b90a-4060-9a65-17af9b346c6a';
  v_cab jsonb;
  v_itens jsonb;
  v_oc uuid;
  v_total numeric;
  v_parcelas text := '(nao rodou)';
  v_controle text := '(nao rodou)';
  v_qtd_parc int; v_qtd_formas int;
begin
  -- Três itens no MESMO preço de 4 casas, em três centros: é o caso real.
  v_itens := jsonb_build_array(
    jsonb_build_object('insumo_id', v_diesel, 'quantidade', 15000, 'preco_unitario', 6.188,
                       'centro_custo_id', (select id from public.centros_custo where pai_id is null and nome ilike '009%' limit 1)),
    jsonb_build_object('insumo_id', v_diesel, 'quantidade', 5000, 'preco_unitario', 6.188,
                       'centro_custo_id', (select id from public.centros_custo where pai_id is null and nome ilike '003%' limit 1)),
    jsonb_build_object('insumo_id', v_diesel, 'quantidade', 5000, 'preco_unitario', 6.188,
                       'centro_custo_id', (select id from public.centros_custo where pai_id is null and nome ilike '007%' limit 1)));

  v_cab := jsonb_build_object(
    'fornecedor_id', (select id from public.fornecedores where ativo order by razao_social limit 1),
    'condicao_pagamento_id', (select id from public.condicoes_pagamento where ativo limit 1),
    'forma_pagamento_id', v_boleto,
    'cotacao_id', null,
    'data_compra', to_char(now() at time zone 'America/Rio_Branco','YYYY-MM-DD'),
    'mes_competencia', to_char(date_trunc('month', now() at time zone 'America/Rio_Branco'),'YYYY-MM-DD'),
    'descricao', 'PROVA ROLLBACK 25 mil litros diesel',
    'categoria_id', (select id from public.categorias_financeiras where ativo limit 1),
    'numero_documento', null, 'observacoes', null);

  perform set_config('request.jwt.claims', json_build_object('sub', v_usuario, 'role','authenticated')::text, true);
  execute 'set local role authenticated';

  v_oc := public.fn_criar_ordem_compra(v_cab, v_itens);
  select o.valor_total into v_total from public.ordens_compra o where o.id = v_oc;

  -- O passo que falhava: a parcela vem da tela, com o total da tela.
  begin
    perform public.fn_salvar_parcelas_oc(
      v_oc,
      jsonb_build_array(jsonb_build_object('data_vencimento', to_char((now() + interval '30 days')::date,'YYYY-MM-DD'),
                                           'valor', 154700.00, 'forma_pagamento_id', v_boleto)),
      jsonb_build_array(jsonb_build_object('forma_pagamento_id', v_boleto, 'valor', 154700.00)));
    select count(*) into v_qtd_parc from public.oc_parcelas p where p.ordem_compra_id = v_oc;
    select count(*) into v_qtd_formas from public.oc_formas f where f.ordem_compra_id = v_oc;
    v_parcelas := format('OK: %s parcela(s) e %s forma(s) gravadas', v_qtd_parc, v_qtd_formas);
  exception when others then
    v_parcelas := 'RECUSOU: ' || sqlerrm;
  end;

  -- LINHA DE CONTROLE: com o valor inflado de antes, a checagem de soma tem que
  -- recusar. Sem ela, um `fn_salvar_parcelas_oc` que aceitasse qualquer soma
  -- passaria no caso de cima.
  begin
    perform public.fn_salvar_parcelas_oc(
      v_oc,
      jsonb_build_array(jsonb_build_object('data_vencimento', to_char((now() + interval '30 days')::date,'YYYY-MM-DD'),
                                           'valor', 154750.00, 'forma_pagamento_id', v_boleto)),
      jsonb_build_array(jsonb_build_object('forma_pagamento_id', v_boleto, 'valor', 154750.00)));
    v_controle := 'PASSOU (NAO DEVIA)';
  exception when others then
    v_controle := 'recusou como esperado';
  end;

  raise exception E'PROVA (desfeita, nada gravado)\n  total gravado pela criacao: R$ %  (a conta certa e 154700.00)\n  parcelas de R$ 154.700,00: %\n  CONTROLE, parcelas de R$ 154.750,00: %',
    v_total, v_parcelas, v_controle;
end $prova$;

-- Resultado em 21/08/2026:
--   total gravado pela criacao: R$ 154700.00
--   parcelas de R$ 154.700,00: OK: 1 parcela(s) e 1 forma(s) gravadas
--   CONTROLE, parcelas de R$ 154.750,00: recusou como esperado
--
-- E depois: 57 OCs no banco (nenhuma sobra), sequência de numeração intacta.
