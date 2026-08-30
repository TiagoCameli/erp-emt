-- Prova da rescisão (migrations 20260829210000, 211000 e 212000).
--
-- A prova CHAMA as nove RPCs. Não basta o `apply_migration` voltar `success`:
-- plpgsql só valida as queries do corpo na primeira EXECUÇÃO, e foi
-- exatamente aqui que isto se pagou. A primeira execução desta prova estourou
-- com `null value in column "valor"` porque `folha_parametros` estava VAZIA
-- (zero linhas desde julho), o `select ... into` não atribuiu nada e
-- `v_dias_aviso || ' dias'` com null virou null — toda verba saiu nula. A
-- migration tinha voltado `success` e o advisor estava limpo.
--
-- Sorte de o sintoma ter sido barulhento: `valor` é `not null`. Fosse
-- nullable, a rescisão teria sido gravada inteira em branco, somando R$ 0,00 e
-- com cara de documento pronto.

-- =====================================================================
-- Parte 1: o cálculo, conferido contra números feitos à mão
-- =====================================================================
--
-- Cobaia: ANDREIA ALENCAR DA SILVA, salário 2.000,00, admitida em 02/06/2014.
-- Demissão sem justa causa em 15/09/2026, aviso indenizado, FGTS 12.000,00,
-- 1 período de férias vencidas. Doze anos completos de casa.
--
-- Conta à mão, ANTES de rodar:
--   aviso = 30 + 3x12 = 66 dias -> 2000/30 x 66            = 4.400,00
--   data projetada = 15/09 + 66 dias                       = 20/11/2026
--   13o: jan a out cheios + nov com 20 dias = 11 avos      = 1.833,33
--   ferias vencidas: 1 periodo                             = 2.000,00
--     1/3                                                  =   666,67
--   ferias proporcionais: periodo aquisitivo desde 02/06/2026,
--     jun(29d) jul ago set out nov(20d) = 6 avos            = 1.000,00
--     1/3                                                  =   333,33
--   multa FGTS 40% de 12.000                               = 4.800,00
--                                                   LIQUIDO = 15.033,33

do $prova$
declare
  v_tiago uuid := 'c66fca9f-5428-4fb9-855f-dcff548764df';
  v_andreia uuid := '20102254-a5a7-4d66-bf31-d4b4dc61ff79';
  v_res uuid; v_itens int; v_prov numeric; v_desc numeric; v_liq numeric;
  v_linhas text; v_item uuid; v_livre uuid;
  e_itens int; e_liq numeric; e_aviso numeric; e_13 numeric; e_fp numeric;
  f_itens int; f_liq numeric;
  g_edit numeric; g_ref text; g_livre_valor numeric; g_livre_qtd int;
begin
  perform set_config('request.jwt.claims', json_build_object('sub', v_tiago, 'role','authenticated')::text, true);
  execute 'set local role authenticated';

  v_res := public.fn_gerar_rescisao(
    v_andreia, 'sem_justa_causa', date '2026-09-15', 'indenizado',
    date '2026-09-15', 12000.00, 1, null, null, 'prova');

  select count(*), string_agg(descricao || ' [' || natureza || '] ' || coalesce(referencia,'-') || ' = ' || valor, E'\n    ' order by ordem)
    into v_itens, v_linhas from public.rh_rescisao_itens where rescisao_id = v_res;
  select valor_proventos, valor_descontos, valor_liquido into v_prov, v_desc, v_liq
    from public.rh_rescisoes where id = v_res;
  select valor into e_aviso from public.rh_rescisao_itens where rescisao_id = v_res and codigo = 'aviso_previo_indenizado';
  select valor into e_13 from public.rh_rescisao_itens where rescisao_id = v_res and codigo = 'decimo_terceiro_proporcional';
  select valor into e_fp from public.rh_rescisao_itens where rescisao_id = v_res and codigo = 'ferias_proporcionais';

  -- B: editar uma verba e RECALCULAR. O valor digitado tem de sobreviver, e a
  -- referencia do calculo tem de sumir: "40% de R$ 12.000,00" ao lado de um
  -- numero que nao e 40% daquilo mente mais que referencia nenhuma.
  select id into v_item from public.rh_rescisao_itens where rescisao_id = v_res and codigo = 'multa_fgts';
  perform public.fn_editar_item_rescisao(v_item, 5000.00);
  -- C: linha LIVRE, que nenhum calculo recria. Sem o snapshot dela, o
  -- Recalcular comeria a pensao alimenticia que alguem acabou de lancar.
  v_livre := public.fn_adicionar_item_rescisao(v_res, 'Pensao alimenticia', 'desconto', 300.00);

  perform public.fn_gerar_rescisao(
    v_andreia, 'sem_justa_causa', date '2026-09-15', 'indenizado',
    date '2026-09-15', 12000.00, 1, null, null, 'prova');

  select valor, referencia into g_edit, g_ref
    from public.rh_rescisao_itens where rescisao_id = v_res and codigo = 'multa_fgts';
  select count(*), coalesce(max(valor),0) into g_livre_qtd, g_livre_valor
    from public.rh_rescisao_itens where rescisao_id = v_res and codigo is null;
  select count(*) into e_itens from public.rh_rescisao_itens where rescisao_id = v_res;
  select valor_liquido into e_liq from public.rh_rescisoes where id = v_res;

  -- D CONTROLE: virar JUSTA CAUSA. Somem aviso, 13o, ferias proporcionais e
  -- multa; ficam ferias vencidas + 1/3, INSS e IRRF. A linha livre continua:
  -- pensao alimenticia nao deixa de existir porque o tipo mudou.
  perform public.fn_gerar_rescisao(
    v_andreia, 'justa_causa', date '2026-09-15', 'nao_se_aplica',
    null, 0, 1, null, null, 'prova');
  select count(*) into f_itens from public.rh_rescisao_itens where rescisao_id = v_res and codigo is not null;
  select valor_liquido into f_liq from public.rh_rescisoes where id = v_res;
  reset role;

  raise exception E'PROVA RESCISAO - CALCULO (desfeita, nada gravado)\n  A) itens=% (9) liquido=% (15033.33) proventos=% descontos=%\n     aviso=% (4400.00) 13o=% (1833.33) ferias prop=% (1000.00)\n    %\n  B) editou multa para 5000 e RECALCULOU: valor=% (5000.00) referencia=% (vazia)\n  C) linha livre sobreviveu: % linha(s) de % (1 e 300.00)\n     itens=% (10) liquido=% (14933.33)\n  D) CONTROLE justa causa: % verbas calculadas (4) liquido=% (2366.67 = 2000 + 666.67 - 300 da linha livre)',
    v_itens, v_liq, v_prov, v_desc, e_aviso, e_13, e_fp, v_linhas,
    g_edit, coalesce(g_ref, '(vazia)'), g_livre_qtd, g_livre_valor,
    e_itens, e_liq, f_itens, f_liq;
end $prova$;

-- Resultado em 29/08/2026:
--
--   A) itens=9 (9)  liquido=15033.33 (15033.33)  proventos=15033.33 descontos=0.00
--      aviso=4400.00  13o=1833.33  ferias prop=1000.00
--     Aviso previo indenizado [provento] 66 dias (30 + 36 por 12 anos) = 4400.00
--     13o salario proporcional [provento] 11/12 avos = 1833.33
--     Ferias vencidas [provento] 1 periodo(s) = 2000.00
--     1/3 sobre ferias vencidas [provento] 1/3 = 666.67
--     Ferias proporcionais [provento] 6/12 avos = 1000.00
--     1/3 sobre ferias proporcionais [provento] 1/3 = 333.33
--     Multa rescisoria do FGTS [provento] 40% de R$ 12.000,00 = 4800.00
--     INSS [desconto] - = 0.00
--     IRRF [desconto] - = 0.00
--   B) valor=5000.00, referencia vazia
--   C) 1 linha livre de 300.00; itens=10, liquido=14933.33
--   D) 4 verbas calculadas, liquido 2366.67
--
-- Cada linha bate com a conta feita à mão, ao centavo. As duas primeiras
-- versões da referência da multa saíam "40% de 12,000.00": `to_char` com `G`/`D`
-- usa o lc_numeric do servidor, que aqui é inglês. Corrigido na migration
-- 20260829212000 com separadores literais + translate.

-- =====================================================================
-- Parte 2: aprovar desliga, desaprovar religa
-- =====================================================================

do $prova$
declare
  v_tiago uuid := 'c66fca9f-5428-4fb9-855f-dcff548764df';
  v_semperm uuid := '7d0194c2-fd7e-41d1-b6c4-f05c0a652229';
  v_andreia uuid := '20102254-a5a7-4d66-bf31-d4b4dc61ff79';
  v_res uuid; v_ref text; v_item uuid; v_terceiro uuid;
  a_erro text := 'PASSOU (NAO DEVIA)';
  ap_ativo boolean; ap_data date; ap_tipo text; ap_motivo text;
  ap_lanc uuid; ap_valor numeric; ap_origem text; ap_parcelas int;
  b_erro text := 'PASSOU (NAO DEVIA)';
  d_ativo boolean; d_data date; d_lanc int; d_status text;
  e_erro text := 'PASSOU (NAO DEVIA)';
  f_erro text := 'PASSOU (NAO DEVIA)';
begin
  perform set_config('request.jwt.claims', json_build_object('sub', v_tiago, 'role','authenticated')::text, true);
  execute 'set local role authenticated';

  v_res := public.fn_gerar_rescisao(
    v_andreia, 'sem_justa_causa', date '2026-09-15', 'indenizado',
    date '2026-09-15', 12000.00, 1, null, null, null);
  select referencia into v_ref from public.rh_rescisao_itens where rescisao_id = v_res and codigo = 'multa_fgts';

  -- A CONTROLE: aprovar direto do rascunho, sem passar pela fila.
  begin
    perform public.fn_aprovar_rescisao(v_res);
  exception when others then a_erro := sqlerrm; end;

  perform public.fn_enviar_rescisao_aprovacao(v_res);
  perform public.fn_aprovar_rescisao(v_res);

  select c.ativo, c.data_demissao, c.tipo_rescisao, c.motivo_desligamento
    into ap_ativo, ap_data, ap_tipo, ap_motivo
  from public.colaboradores c where c.id = v_andreia;

  select r.lancamento_id into ap_lanc from public.rh_rescisoes r where r.id = v_res;
  select l.valor, l.origem into ap_valor, ap_origem from public.lancamentos l where l.id = ap_lanc;
  select count(*) into ap_parcelas from public.lancamento_parcelas where lancamento_id = ap_lanc;

  -- B CONTROLE: editar verba de rescisao aprovada.
  select id into v_item from public.rh_rescisao_itens where rescisao_id = v_res and codigo = 'inss';
  begin
    perform public.fn_editar_item_rescisao(v_item, 100.00);
  exception when others then b_erro := sqlerrm; end;

  -- C: desaprovar religa a pessoa e apaga a conta a pagar.
  perform public.fn_desaprovar_rescisao(v_res, 'valor errado');
  select c.ativo, c.data_demissao into d_ativo, d_data from public.colaboradores c where c.id = v_andreia;
  select count(*) into d_lanc from public.lancamentos where id = ap_lanc;
  select status into d_status from public.rh_rescisoes where id = v_res;

  -- E CONTROLE: terceiro nao tem rescisao de contrato CLT.
  select id into v_terceiro from public.colaboradores
   where ativo and vinculo = 'terceiro' and salario > 0 limit 1;
  begin
    perform public.fn_gerar_rescisao(v_terceiro, 'sem_justa_causa', date '2026-09-15', 'indenizado');
  exception when others then e_erro := sqlerrm; end;
  reset role;

  -- F CONTROLE: usuario sem permissao de rescisoes.
  perform set_config('request.jwt.claims', json_build_object('sub', v_semperm, 'role','authenticated')::text, true);
  execute 'set local role authenticated';
  begin
    perform public.fn_gerar_rescisao(v_andreia, 'sem_justa_causa', date '2026-09-15', 'indenizado');
  exception when others then f_erro := sqlerrm; end;
  reset role;

  raise exception E'PROVA RESCISAO - APROVACAO (desfeita, nada gravado)\n  referencia da multa: "%"  (esperado 40%% de R$ 12.000,00)\n  A) CONTROLE aprovar em rascunho -> %\n  APROVOU: ativo=% (false) data_demissao=% (2026-09-15) tipo=% motivo="%"\n           lancamento origem=% (rescisao) valor=% (15033.33) parcelas=% (1)\n  B) CONTROLE editar verba de rescisao aprovada -> %\n  C) DESAPROVOU: ativo=% (true) data_demissao=% (vazia) lancamentos restantes=% (0) status=% (rascunho)\n  E) CONTROLE terceiro -> %\n  F) CONTROLE sem permissao -> %',
    v_ref, a_erro, ap_ativo, ap_data, ap_tipo, ap_motivo,
    ap_origem, ap_valor, ap_parcelas, b_erro,
    d_ativo, coalesce(d_data::text, '(vazia)'), d_lanc, d_status, e_erro, f_erro;
end $prova$;

-- Resultado em 29/08/2026:
--
--   referencia da multa: "40% de R$ 12.000,00"
--   A) CONTROLE aprovar em rascunho -> A rescisao de ANDREIA ALENCAR DA SILVA
--      esta em "rascunho": so da para aprovar o que esta pendente de aprovacao.
--   APROVOU: ativo=f  data_demissao=2026-09-15  tipo=sem_justa_causa
--            motivo="Rescisao RES-2026-0001"
--            lancamento origem=rescisao valor=15033.33 parcelas=1
--   B) CONTROLE editar verba de rescisao aprovada -> ... esta em "aprovado":
--      so da para editar em rascunho.
--   C) DESAPROVOU: ativo=t  data_demissao=(vazia)  lancamentos restantes=0
--                  status=rascunho
--   E) CONTROLE terceiro -> A rescisao e do contrato CLT, e VERA LUCIA DA SILVA
--      esta cadastrado como "terceiro". Para desligar, preencha a data de
--      demissao no cadastro do colaborador.
--   F) CONTROLE sem permissao -> Sem permissao para gerar rescisao
--
-- Aprovar e desaprovar são exatamente reversíveis: a pessoa volta a ficar
-- ativa, a data some do cadastro e a conta a pagar deixa de existir.
