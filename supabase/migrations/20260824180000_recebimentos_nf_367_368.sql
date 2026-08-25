-- =============================================================
-- As medicoes de julho/2026: NF 367 e NF 368, com a nota anexada
--
-- PEDIDO DO TIAGO (24/08/2026): "lance esses dois recebimentos da obra de
-- manutencao da br-364 com a data de vencimento para um mes apos a emissao da
-- nota, anexe as nf em cada lancamento."
--
-- ============================================================
-- OS DOIS LOTES DO MESMO MES
-- ============================================================
--   NF 367  contrato 184/2026    Lote 10, prestacao em Cruzeiro do Sul
--   NF 368  contrato 00615/2025  Lote 09, prestacao em Tarauaca
-- As duas cobrem o servico de 01/07 a 31/07/2026, entao as duas tem competencia
-- 07/2026 -- a mesma regra das nove anteriores (a competencia e o mes do
-- servico, nao o da emissao).
--
-- VENCIMENTO = emissao mais um mes, como ele pediu:
--   NF 367  emitida 21/08/2026  ->  vence 21/09/2026
--   NF 368  emitida 24/08/2026  ->  vence 24/09/2026
--
-- Nascem PENDENTES, e nao pagas: o dinheiro ainda nao entrou. Sao os dois
-- primeiros lancamentos a receber em aberto do sistema (os 342 que existem estao
-- todos 'pago', porque vieram de carga historica). Conferido que a aba
-- Recebimentos os mostra: ela filtra pelo status da PARCELA
-- (STATUS_PARCELA_ABERTA, que e tudo menos pago e cancelado) e so exclui
-- lancamento cancelado.
--
-- ============================================================
-- LAYOUT DANFSe v2.0, e a armadilha que a prova pegou
-- ============================================================
-- Estas duas notas usam o DANFSe v2.0, que e melhor que os layouts anteriores:
-- ele imprime "Total das Retencoes (ISSQN / Federais)" ja somado e o "VALOR
-- LIQUIDO DA NFS-e" ao lado, entao nao ha o que deduzir sobre qual tributo entra
-- no liquido.
--
-- A armadilha: a linha de rotulos e "BC ISSQN | Aliquota | Retencao do ISSQN |
-- ISSQN Apurado" e a de valores vem embaixo na mesma ordem. Ler o primeiro valor
-- pega a BASE DE CALCULO. Na NF 368 isso e R$ 733.592,37 contra R$ 36.679,62 de
-- imposto -- um erro de vinte vezes. Quem pegou foi a linha de controle "as
-- quatro retencoes nomeadas somam o total impresso", que deu falso na primeira
-- tentativa.
--
-- DUAS PROVAS POR NOTA, as duas fechando ao centavo:
--   NF 367: 56.056,78 + 44.845,42 + 61.662,46 + 37.371,19 = 199.935,85 (impresso)
--           3.737.118,56 - 199.935,85 = 3.537.182,71 (impresso)
--   NF 368: 36.679,62 + 58.687,39 + 80.695,16 + 48.906,16 = 224.968,33 (impresso)
--           4.890.615,81 - 224.968,33 = 4.665.647,48 (impresso)
--
-- O ISSQN das duas esta marcado "Retido pelo Tomador", entao entra na retencao --
-- diferente das notas 356 e 361, em que a nota dizia "Nao Retido" e o DNIT retia
-- de todo jeito (ver 20260822260000).
--
-- O "PIS/COFINS - Debito Apuracao Propria" (R$ 178.507,47 na 368 e R$ 136.396,42
-- na 367) NAO entra: e imposto que a EMT paga ela mesma, e o proprio total da
-- nota o exclui.
--
-- As "Contribuicoes Sociais - Retidas" vao em `retencao_outras`, com a mesma
-- razao das notas anteriores: a nota informa o agregado ("3 - PIS/COFINS/CSLL
-- Retidos") e nao a quebra, e decompor seria inventar regra fiscal.
--
-- ============================================================
-- PELA fn_salvar_lancamento, E NAO POR INSERT
-- ============================================================
-- Este e o caminho da tela, e usa-lo aqui compra as validacoes de graca: a
-- tolerancia de R$ 1,00 entre bruto menos retencoes e o liquido, a soma das
-- parcelas, a soma do rateio, a competencia aberta e a exigencia de centro de
-- custo. Insert direto pularia todas -- e o objetivo aqui e justamente que estes
-- dois lancamentos sejam indistinguiveis dos que a tela cria.
--
-- ============================================================
-- OS ANEXOS
-- ============================================================
-- Os dois PDFs foram enviados ao bucket `anexos` antes desta migration, no
-- caminho que `pathNovo` do app gera (`arquivos/{ano}/{mes}/{uuid}.pdf`), porque
-- `pathValido` confere esse formato e caminho fora do padrao viraria anexo que a
-- tela nao abre. O `hash_sha256` e o mesmo que `hashDoArquivo` calcula, e e ele
-- que dedupica o mesmo PDF anexado em dois documentos.
--
-- Conferido no bucket antes de registrar: os dois objetos existem, com 118.101 e
-- 117.881 bytes -- os mesmos tamanhos que vao para `tamanho_bytes`. Registrar
-- anexo cujo binario nao subiu deixaria a tela com um item que abre em erro.
--
-- ============================================================
-- NADA DISTO MEXE NO SALDO
-- ============================================================
-- Parcela pendente nao entra em `fn_rel_posicao_bancaria` (que so soma
-- status='pago'), entao o saldo da 30.893-5 nao se mexe. Quando forem recebidas,
-- em setembro, vao contar: as duas datas sao posteriores a data de corte da conta
-- (21/08/2026), que e o comportamento certo.
-- =============================================================

do $lancar$
declare
  v_uid uuid;
  v_cli uuid; v_cat uuid; v_centro uuid; v_conta uuid;
  n record; v_id uuid; v_arq uuid;
  v_saldo_antes numeric; v_saldo_depois numeric;
  v_criados int := 0;
begin
  select id into v_uid from public.usuarios where email = 'tiago@emtconstrutora.com';
  select id into v_cli from public.clientes where nome like 'Departamento Nacional%';
  select id into v_cat from public.categorias_financeiras
   where nome = 'Medições de obra' and tipo = 'receita';
  select id into v_centro from public.centros_custo where nome like '009%';
  select id into v_conta from public.contas_bancarias where nome = 'BANCO DO BRASIL 30.893-5';

  if v_uid is null or v_cli is null or v_cat is null or v_centro is null or v_conta is null then
    raise exception 'Cadastro faltando: uid=% cliente=% categoria=% centro=% conta=%',
      v_uid, v_cli, v_cat, v_centro, v_conta;
  end if;

  -- fn_salvar_lancamento confere permissao por auth.uid()
  perform set_config('request.jwt.claims',
    json_build_object('sub', v_uid, 'role', 'authenticated')::text, true);

  v_saldo_antes := public.fn_saldo_conta(v_conta);

  for n in
    select * from (values
      ('367','2026-08-21'::date,'2026-09-21'::date,'2026-07-01'::date,
       3737118.56, 3537182.71, 56056.78, 44845.42, 61662.46, 37371.19,
       'arquivos/2026/08/871a0365-3d3e-4ff2-8b2d-a8a0f0a2b265.pdf',
       'db78cc7e1e7d82291c9b437ca5b5ec881655c538d51444225611776e09e1512a',
       118101, 'NF 367.pdf', '184/2026', 'Lote 10'),
      ('368','2026-08-24'::date,'2026-09-24'::date,'2026-07-01'::date,
       4890615.81, 4665647.48, 36679.62, 58687.39, 80695.16, 48906.16,
       'arquivos/2026/08/9b281834-db42-4c81-b567-13b7914fb1cb.pdf',
       'dd7ec511186a4f9d56b8fac5bd0799c7fce4f3e842a7924f1040f7b1cda8fafd',
       117881, 'NF 368.pdf', '00615/2025', 'Lote 09')
    ) as t(nf, emissao, vencimento, competencia, bruto, liquido,
           iss, ir, inss, outras, path, hash, tamanho, nome_arq, contrato, lote)
  loop
    -- guarda de idempotencia: rodar duas vezes nao cria o dobro
    if exists (
      select 1 from public.lancamentos
      where tipo = 'a_receber' and numero_documento = n.nf
        and categoria_id = v_cat and status <> 'cancelado'
    ) then
      raise notice 'NF % ja lancada, pulando.', n.nf;
      continue;
    end if;

    v_id := public.fn_salvar_lancamento(
      null,
      jsonb_build_object(
        'tipo', 'a_receber',
        'cliente_id', v_cli,
        'categoria_id', v_cat,
        'conta_bancaria_id', v_conta,
        'descricao', 'Medição 07/2026 - manutenção BR-364 ' || n.lote
                     || ' (contrato ' || n.contrato || ')',
        'valor', n.liquido,
        'valor_bruto', n.bruto,
        'retencao_iss', n.iss,
        'retencao_ir', n.ir,
        'retencao_inss', n.inss,
        'retencao_outras', n.outras,
        'data_compra', n.emissao,
        'mes_competencia', n.competencia,
        'data_vencimento', n.vencimento,
        'numero_documento', n.nf,
        'observacoes', 'NFS-e ' || n.nf || ' (DANFSe v2.0), emitida em '
          || to_char(n.emissao, 'DD/MM/YYYY') || ', servico de 01/07 a 31/07/2026. '
          || 'Bruto R$ ' || to_char(n.bruto, 'FM999999999990.00')
          || ', retido na fonte R$ ' || to_char(n.bruto - n.liquido, 'FM999999999990.00')
          || ', liquido R$ ' || to_char(n.liquido, 'FM999999999990.00')
          || '. Vencimento um mes apos a emissao.'),
      jsonb_build_array(jsonb_build_object('valor', n.liquido,
                                           'data_vencimento', n.vencimento)),
      jsonb_build_array(jsonb_build_object('centro_custo_id', v_centro,
                                           'valor', n.liquido)),
      '[]'::jsonb);

    insert into public.arquivos (path_storage, nome_original, tipo_mime,
      tamanho_bytes, hash_sha256, created_by)
    values (n.path, n.nome_arq, 'application/pdf', n.tamanho, n.hash, v_uid)
    returning id into v_arq;

    insert into public.anexo_vinculos (arquivo_id, entidade_tipo, entidade_id,
      origem, nome_exibicao, created_by)
    values (v_arq, 'lancamento', v_id, 'upload_direto', n.nome_arq, v_uid);

    v_criados := v_criados + 1;
  end loop;

  execute 'set constraints all immediate';

  -- ---------- as guardas ----------
  if v_criados <> 2 then
    raise exception 'Esperava criar 2 lancamentos e criei %.', v_criados;
  end if;

  if (select count(*) from public.lancamentos l
      join public.anexo_vinculos av on av.entidade_id = l.id
       and av.entidade_tipo = 'lancamento'
      where l.tipo = 'a_receber' and l.numero_documento in ('367','368')
        and l.status <> 'cancelado') <> 2 then
    raise exception 'Os dois lancamentos tinham de ficar com um anexo cada.';
  end if;

  if (select count(*) from public.lancamento_parcelas p
      join public.lancamentos l on l.id = p.lancamento_id
      where l.tipo = 'a_receber' and l.numero_documento in ('367','368')
        and p.status = 'pendente') <> 2 then
    raise exception 'As duas parcelas tinham de nascer pendentes.';
  end if;

  -- Parcela pendente nao entra no saldo. Se mexeu, algo nasceu pago.
  v_saldo_depois := public.fn_saldo_conta(v_conta);
  if v_saldo_depois <> v_saldo_antes then
    raise exception
      'O saldo da 30.893-5 mudou de R$ % para R$ %. Recebimento em aberto nao pode mover saldo.',
      to_char(v_saldo_antes, 'FM999999999990.00'), to_char(v_saldo_depois, 'FM999999999990.00');
  end if;

  raise notice 'NF 367 e 368 lancadas como recebimento em aberto, com a nota anexada. Saldo intacto em R$ %.',
    to_char(v_saldo_depois, 'FM999999999990.00');
end $lancar$;
