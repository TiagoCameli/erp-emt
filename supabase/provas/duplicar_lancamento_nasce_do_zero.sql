-- Prova: o lançamento DUPLICADO nasce do zero, e o original não se mexe.
--
-- Pedido do Tiago em 27/08/2026: o duplicado "ainda precisa ser revisado, mesmo
-- que o que foi utilizado para duplicação esteja revisado e aprovado".
--
-- Roda dentro de uma transação que TERMINA EM `raise`: nada fica na base, e o
-- número da sequência não é queimado (a numeração é UPDATE em
-- `documento_sequencias`, não nextval, então o rollback a devolve).
--
-- Impersona um usuário de verdade com `set_config('request.jwt.claims')`, porque
-- `fn_salvar_lancamento` chama `tem_permissao` e `fn_pode_lancar_tipo`, que leem
-- `auth.uid()`. Sem isso a RPC recusaria por permissão e a prova passaria a
-- provar outra coisa.
--
-- O que ela tranca (o original é LAN-2026-1464: a pagar, manual, APROVADO, 10
-- parcelas todas COM conta bancária, uma delas já aprovada):
--   1. o duplicado não nasce aprovado
--   2. nenhuma parcela dele tem conta bancária -> NÃO REVISADO
--   3. nenhuma parcela dele tem vencimento (escolha do Tiago)
--   4. as parcelas nascem pendentes
--   5. não leva anexo
--   6. ganha número próprio
--   7. LINHA DE CONTROLE: o ORIGINAL continua aprovado e com as 10 contas.
--      Sem ela, uma versão que mexesse no original em vez de criar um novo
--      passaria em todos os outros seis casos.
--
-- O payload montado aqui é o mesmo que `dadosDuplicados` (duplicacao.ts) monta;
-- os campos, um a um, têm teste próprio em `duplicacao.test.ts`. O que só o
-- banco pode responder, e que esta prova responde, é o ESTADO em que o
-- lançamento nasce depois de passar por `fn_salvar_lancamento`.
--
-- Como rodar:
--   psql "$DATABASE_URL" -f supabase/provas/duplicar_lancamento_nasce_do_zero.sql
--
-- Resultado em 27/08/2026: falhas: 0. O duplicado nasceu `a_pagar` (a forma é
-- bancária, então ele entra na fila de aprovação como qualquer lançamento novo),
-- com as 10 parcelas pendentes, sem conta e sem vencimento.

do $prova$
declare
  v_orig uuid := '3ff2b734-64f5-483e-88af-a37c3a8c88d9';  -- LAN-2026-1464
  v_usuario uuid;
  v_novo uuid;
  v_dados jsonb; v_parcelas jsonb; v_rateios jsonb; v_formas jsonb;
  v_status text; v_qtd_parc int; v_com_conta int; v_com_data int;
  v_status_parc text; v_anexos int; v_anexos_orig int; v_numero text;
  v_saida text := ''; v_falhas int := 0;
begin
  select id into v_usuario from public.usuarios u
  where exists (select 1 from public.usuario_permissoes up
                where up.usuario_id = u.id
                  and up.recurso = 'financeiro.lancamentos' and up.acao = 'criar')
  limit 1;
  perform set_config('request.jwt.claims', json_build_object('sub', v_usuario)::text, true);

  -- O payload de `dadosDuplicados`: vencimento nulo no cabecalho e nas parcelas,
  -- e nada de conta, status ou data de pagamento (a RPC de criar nem os aceita).
  select jsonb_build_object(
    'tipo', l.tipo, 'fornecedor_id', l.fornecedor_id, 'categoria_id', l.categoria_id,
    'forma_pagamento_id', l.forma_pagamento_id,
    'condicao_pagamento_id', l.condicao_pagamento_id,
    'descricao', l.descricao, 'valor', l.valor,
    'data_compra', l.data_compra, 'mes_competencia', l.mes_competencia,
    'data_vencimento', null, 'numero_documento', l.numero_documento,
    'observacoes', l.observacoes, 'e_divida', l.e_divida,
    'valor_bruto', l.valor_bruto,
    'retencao_iss', l.retencao_iss, 'retencao_pis', l.retencao_pis,
    'retencao_cofins', l.retencao_cofins, 'retencao_csll', l.retencao_csll,
    'retencao_ir', l.retencao_ir, 'retencao_inss', l.retencao_inss,
    'retencao_outras', l.retencao_outras
  ) into v_dados from public.lancamentos l where l.id = v_orig;

  select coalesce(jsonb_agg(jsonb_build_object(
           'valor', p.valor, 'data_vencimento', null,
           'forma_pagamento_id', f.forma_pagamento_id)), '[]'::jsonb)
  into v_parcelas
  from public.lancamento_parcelas p
  left join public.lancamento_formas f on f.id = p.lancamento_forma_id
  where p.lancamento_id = v_orig and p.status <> 'cancelado';

  select coalesce(jsonb_agg(jsonb_build_object(
           'centro_custo_id', r.centro_custo_id, 'valor', r.valor)), '[]'::jsonb)
  into v_rateios from public.lancamento_rateios r where r.lancamento_id = v_orig;

  select coalesce(jsonb_agg(jsonb_build_object(
           'forma_pagamento_id', f.forma_pagamento_id, 'cartao_id', f.cartao_id,
           'valor', f.valor)), '[]'::jsonb)
  into v_formas from public.lancamento_formas f where f.lancamento_id = v_orig;

  select count(*) into v_anexos_orig from public.anexo_vinculos
  where entidade_tipo = 'lancamento' and entidade_id = v_orig;

  v_novo := public.fn_salvar_lancamento(null, v_dados, v_parcelas, v_rateios, v_formas);

  select status, numero into v_status, v_numero from public.lancamentos where id = v_novo;
  select count(*), count(*) filter (where conta_bancaria_id is not null),
         count(*) filter (where data_vencimento is not null),
         string_agg(distinct status, ',')
  into v_qtd_parc, v_com_conta, v_com_data, v_status_parc
  from public.lancamento_parcelas where lancamento_id = v_novo;

  select count(*) into v_anexos from public.anexo_vinculos
  where entidade_tipo = 'lancamento' and entidade_id = v_novo;

  -- 1 --------------------------------------------------------------------
  if v_status = 'aprovado' then
    v_saida := v_saida || E'\n  1. FALHOU: nasceu aprovado'; v_falhas := v_falhas + 1;
  else
    v_saida := v_saida || E'\n  1. ok, nasceu ' || v_status || ' (o original esta aprovado)';
  end if;
  -- 2 --------------------------------------------------------------------
  if v_com_conta > 0 then
    v_saida := v_saida || E'\n  2. FALHOU: ' || v_com_conta || ' parcelas ja com conta'; v_falhas := v_falhas + 1;
  else
    v_saida := v_saida || E'\n  2. ok, nenhuma das ' || v_qtd_parc || ' parcelas tem conta = NAO REVISADO';
  end if;
  -- 3 --------------------------------------------------------------------
  if v_com_data > 0 then
    v_saida := v_saida || E'\n  3. FALHOU: ' || v_com_data || ' parcelas com vencimento'; v_falhas := v_falhas + 1;
  else
    v_saida := v_saida || E'\n  3. ok, nenhuma parcela veio com vencimento';
  end if;
  -- 4 --------------------------------------------------------------------
  if v_status_parc is distinct from 'pendente' then
    v_saida := v_saida || E'\n  4. FALHOU: status das parcelas = ' || coalesce(v_status_parc,'nulo'); v_falhas := v_falhas + 1;
  else
    v_saida := v_saida || E'\n  4. ok, parcelas pendentes';
  end if;
  -- 5 --------------------------------------------------------------------
  if v_anexos > 0 then
    v_saida := v_saida || E'\n  5. FALHOU: veio com ' || v_anexos || ' anexos'; v_falhas := v_falhas + 1;
  else
    v_saida := v_saida || E'\n  5. ok, sem anexo (o original tem ' || v_anexos_orig || ')';
  end if;
  -- 6 --------------------------------------------------------------------
  if v_numero is null or v_numero = 'LAN-2026-1464' then
    v_saida := v_saida || E'\n  6. FALHOU: numero ' || coalesce(v_numero,'nulo'); v_falhas := v_falhas + 1;
  else
    v_saida := v_saida || E'\n  6. ok, numero proprio ' || v_numero;
  end if;
  -- 7 LINHA DE CONTROLE ----------------------------------------------------
  select count(*) filter (where conta_bancaria_id is not null) into v_com_conta
  from public.lancamento_parcelas where lancamento_id = v_orig;
  select status into v_status from public.lancamentos where id = v_orig;
  if v_status <> 'aprovado' or v_com_conta = 0 then
    v_saida := v_saida || E'\n  7. FALHOU: o ORIGINAL mudou (' || v_status || ', ' || v_com_conta || ' com conta)';
    v_falhas := v_falhas + 1;
  else
    v_saida := v_saida || E'\n  7. ok, original intacto: aprovado, ' || v_com_conta || ' parcelas com conta';
  end if;

  raise exception 'PROVA (transacao desfeita) - falhas: % %', v_falhas, v_saida;
end;
$prova$;
