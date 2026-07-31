-- Prova de aceite: com UMA parcela, valor e vencimento saem do cabecalho.
--
-- Nao ha migration nova aqui: fn_salvar_lancamento nao mudou nesta entrega (a
-- ultima foi a 20260731130001, da renumeracao). O que mudou foi o formulario, que
-- passou a esconder a tabela de Parcelas quando existe uma parcela so e a montar
-- essa parcela a partir dos campos Valor e Vencimento do topo. Esta prova conferre
-- que o payload novo do formulario nao briga com as guardas da funcao e que
-- lancamentos.data_vencimento fica coerente com as parcelas nos dois estados.
--
-- Roda contra o banco vivo dentro de BEGIN ... ROLLBACK: nada do que ela cria
-- fica, nem as linhas de audit_log (o trigger grava na mesma transacao, entao o
-- rollback leva tudo).
--
-- Lista de aceite:
--   1. parcela unica derivada do cabecalho fecha com o valor e nasce numero 1,
--      com a data do campo Vencimento
--   2. parcela unica com o campo Vencimento em branco grava parcela sem data e
--      lancamentos.data_vencimento null, sem os dois divergirem
--   3. dividindo em tres, o cabecalho passa a ser o vencimento MAIS PROXIMO, que
--      e o da parcela 1 depois da renumeracao
--   4. voltando para uma parcela, sobra uma com a data que o formulario carregou
--      da parcela que restou
--   5. a guarda da soma continua valendo com uma parcela so
--
-- Rodada em 31/07/2026 contra o banco de producao: 5 casos, 5 passaram.
--   1. 1=2026-08-10/1000.00 e lancamento.data_vencimento=2026-08-10          ok
--   2. 1=sem data e lancamento.data_vencimento=null                          ok
--   3. 1=2026-08-20 | 2=2026-09-20 | 3=2026-10-20 e cabecalho=2026-08-20     ok
--   4. 1=2026-09-20/1000.00 e lancamento.data_vencimento=2026-09-20          ok
--   5. "A soma das parcelas (R$ 999.00) deve ser igual ao valor do lancamento
--      (R$ 1000.00)"                                                         ok
--
-- Depois do ROLLBACK: 0 lancamentos [PROVA-UNICA], 0 linhas de audit_log da prova,
-- tabela temporaria inexistente.
--
-- IMPORTANTE: fn_salvar_lancamento e SECURITY DEFINER e checa tem_permissao(),
-- que le auth.uid() de request.jwt.claims. Rodando fora de sessao autenticada
-- (SQL editor, MCP), o primeiro bloco assume um usuario ativo com
-- financeiro.lancamentos criar+editar. As claims sao setadas com is_local = true,
-- para nao vazarem da transacao.

begin;

do $prova$
declare v_usuario uuid;
begin
  select u.id into v_usuario from public.usuarios u
  where u.ativo
    and exists (select 1 from public.usuario_permissoes up where up.usuario_id = u.id
                and up.recurso = 'financeiro.lancamentos' and up.acao = 'criar')
    and exists (select 1 from public.usuario_permissoes up where up.usuario_id = u.id
                and up.recurso = 'financeiro.lancamentos' and up.acao = 'editar')
  limit 1;
  perform set_config('request.jwt.claims', json_build_object('sub', v_usuario)::text, true);
end $prova$;

create temp table prova_unica (
  ordem int generated always as identity, caso text, esperado text, obtido text, passou boolean
) on commit drop;

do $prova$
declare
  v_lanc uuid; v_obtido text; v_venc_lanc text; v_erro text;
begin
  -- 1. parcela unica derivada do cabecalho: valor total + campo Vencimento
  v_lanc := public.fn_salvar_lancamento(
    null,
    jsonb_build_object(
      'tipo','a_pagar','fornecedor_id','','categoria_id','','forma_pagamento_id','',
      'condicao_pagamento_id','','descricao','[PROVA-UNICA] parcela unica do cabecalho',
      'valor', 1000.00, 'data_compra','2026-07-10','mes_competencia','2026-07-01',
      'data_vencimento','2026-08-10'
    ),
    jsonb_build_array(jsonb_build_object('valor', 1000.00, 'data_vencimento','2026-08-10')),
    '[]'::jsonb
  );

  select string_agg(p.numero_parcela || '=' || coalesce(p.data_vencimento::text,'sem data') || '/' || p.valor::text, ' | ' order by p.numero_parcela),
         (select l.data_vencimento::text from public.lancamentos l where l.id = v_lanc)
  into v_obtido, v_venc_lanc
  from public.lancamento_parcelas p where p.lancamento_id = v_lanc;

  insert into prova_unica (caso, esperado, obtido, passou) values (
    '1. parcela unica: soma fecha, numero 1, data do cabecalho',
    '1=2026-08-10/1000.00 e lancamento.data_vencimento=2026-08-10',
    coalesce(v_obtido,'nenhuma') || ' e lancamento.data_vencimento=' || coalesce(v_venc_lanc,'null'),
    v_obtido = '1=2026-08-10/1000.00' and v_venc_lanc = '2026-08-10'
  );

  -- 2. parcela unica sem vencimento (campo Vencimento em branco)
  perform public.fn_salvar_lancamento(
    v_lanc,
    jsonb_build_object(
      'tipo','a_pagar','fornecedor_id','','categoria_id','','forma_pagamento_id','',
      'condicao_pagamento_id','','descricao','[PROVA-UNICA] parcela unica sem data',
      'valor', 1000.00, 'data_compra','2026-07-10','mes_competencia','2026-07-01',
      'data_vencimento',''
    ),
    jsonb_build_array(jsonb_build_object('valor', 1000.00, 'data_vencimento','')),
    '[]'::jsonb
  );

  select string_agg(p.numero_parcela || '=' || coalesce(p.data_vencimento::text,'sem data'), ' | ' order by p.numero_parcela),
         (select coalesce(l.data_vencimento::text,'null') from public.lancamentos l where l.id = v_lanc)
  into v_obtido, v_venc_lanc
  from public.lancamento_parcelas p where p.lancamento_id = v_lanc;

  insert into prova_unica (caso, esperado, obtido, passou) values (
    '2. parcela unica sem data: parcela e cabecalho ficam os dois vazios',
    '1=sem data e lancamento.data_vencimento=null',
    coalesce(v_obtido,'nenhuma') || ' e lancamento.data_vencimento=' || coalesce(v_venc_lanc,'null'),
    v_obtido = '1=sem data' and v_venc_lanc = 'null'
  );

  -- 3. de uma para tres: cabecalho passa a ser o vencimento mais proximo
  perform public.fn_salvar_lancamento(
    v_lanc,
    jsonb_build_object(
      'tipo','a_pagar','fornecedor_id','','categoria_id','','forma_pagamento_id','',
      'condicao_pagamento_id','','descricao','[PROVA-UNICA] dividida em tres',
      'valor', 1000.00, 'data_compra','2026-07-10','mes_competencia','2026-07-01',
      'data_vencimento','2026-08-20'
    ),
    jsonb_build_array(
      jsonb_build_object('valor', 500.00, 'data_vencimento','2026-10-20'),
      jsonb_build_object('valor', 300.00, 'data_vencimento','2026-08-20'),
      jsonb_build_object('valor', 200.00, 'data_vencimento','2026-09-20')
    ),
    '[]'::jsonb
  );

  select string_agg(p.numero_parcela || '=' || p.data_vencimento::text, ' | ' order by p.numero_parcela),
         (select l.data_vencimento::text from public.lancamentos l where l.id = v_lanc)
  into v_obtido, v_venc_lanc
  from public.lancamento_parcelas p where p.lancamento_id = v_lanc;

  insert into prova_unica (caso, esperado, obtido, passou) values (
    '3. tres parcelas: cabecalho = vencimento da parcela 1',
    '1=2026-08-20 | 2=2026-09-20 | 3=2026-10-20 e lancamento.data_vencimento=2026-08-20',
    coalesce(v_obtido,'nenhuma') || ' e lancamento.data_vencimento=' || coalesce(v_venc_lanc,'null'),
    v_obtido = '1=2026-08-20 | 2=2026-09-20 | 3=2026-10-20' and v_venc_lanc = '2026-08-20'
  );

  -- 4. de tres de volta para uma, carregando a data que sobrou
  perform public.fn_salvar_lancamento(
    v_lanc,
    jsonb_build_object(
      'tipo','a_pagar','fornecedor_id','','categoria_id','','forma_pagamento_id','',
      'condicao_pagamento_id','','descricao','[PROVA-UNICA] de volta para uma',
      'valor', 1000.00, 'data_compra','2026-07-10','mes_competencia','2026-07-01',
      'data_vencimento','2026-09-20'
    ),
    jsonb_build_array(jsonb_build_object('valor', 1000.00, 'data_vencimento','2026-09-20')),
    '[]'::jsonb
  );

  select string_agg(p.numero_parcela || '=' || p.data_vencimento::text || '/' || p.valor::text, ' | ' order by p.numero_parcela),
         (select l.data_vencimento::text from public.lancamentos l where l.id = v_lanc)
  into v_obtido, v_venc_lanc
  from public.lancamento_parcelas p where p.lancamento_id = v_lanc;

  insert into prova_unica (caso, esperado, obtido, passou) values (
    '4. voltando para uma parcela: sobra 1 com a data carregada',
    '1=2026-09-20/1000.00 e lancamento.data_vencimento=2026-09-20',
    coalesce(v_obtido,'nenhuma') || ' e lancamento.data_vencimento=' || coalesce(v_venc_lanc,'null'),
    v_obtido = '1=2026-09-20/1000.00' and v_venc_lanc = '2026-09-20'
  );

  -- 5. a guarda da soma continua valendo com uma parcela so
  v_erro := null;
  begin
    perform public.fn_salvar_lancamento(
      null,
      jsonb_build_object(
        'tipo','a_pagar','fornecedor_id','','categoria_id','','forma_pagamento_id','',
        'condicao_pagamento_id','','descricao','[PROVA-UNICA] parcela unica que nao fecha',
        'valor', 1000.00, 'data_compra','2026-07-10','mes_competencia','2026-07-01',
        'data_vencimento','2026-08-10'
      ),
      jsonb_build_array(jsonb_build_object('valor', 999.00, 'data_vencimento','2026-08-10')),
      '[]'::jsonb
    );
  exception when others then v_erro := sqlerrm;
  end;

  insert into prova_unica (caso, esperado, obtido, passou) values (
    '5. parcela unica que nao fecha com o valor e recusada',
    'excecao "A soma das parcelas ..."',
    coalesce(v_erro,'nenhuma excecao (passou batido)'),
    v_erro like 'A soma das parcelas%'
  );
end $prova$;

select ordem, caso, esperado, obtido, passou from prova_unica order by ordem;

rollback;
