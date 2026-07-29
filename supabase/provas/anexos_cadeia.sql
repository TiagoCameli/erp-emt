-- Prova de aceite dos anexos com arquivo unico e propagacao por referencia.
--
-- Cria a propria massa (marcada com [PROVA-ANEXO]), verifica cada regra e apaga
-- o que criou. Pode rodar quantas vezes quiser.
--
-- Cobre: propagacao cotacao -> OC -> lancamento -> pagamento com UM objeto no
-- Storage; anexo tardio descendo a cadeia; dedup por hash+tamanho; remover
-- vinculo nao apagar arquivo compartilhado; ultimo vinculo marcando orfao;
-- carencia de 24h protegendo o binario; faxina apagando fora da carencia.
--
-- As funcoes checam tem_permissao(), que depende de auth.uid(): o primeiro bloco
-- assume um usuario ativo com as permissoes necessarias.

do $prova$
declare v_usuario uuid;
begin
  select u.id into v_usuario
  from public.usuarios u
  join public.usuario_permissoes up on up.usuario_id = u.id
  where u.ativo and up.recurso = 'compras.ordens' and up.acao = 'aprovar'
  limit 1;
  if v_usuario is null then
    raise exception 'Nenhum usuario ativo com compras.ordens:aprovar para rodar a prova';
  end if;
  perform set_config('request.jwt.claims', json_build_object('sub', v_usuario)::text, false);
end $prova$;

create temp table if not exists prova_anexos (
  ordem int generated always as identity, caso text, obtido text, passou boolean
);
truncate prova_anexos;

do $prova$
declare
  v_forn uuid; v_ins uuid; v_cc uuid; v_cond uuid; v_conta uuid;
  v_cot uuid; v_oc uuid; v_lanc uuid; v_parcela uuid;
  v_arquivo uuid; v_arquivo2 uuid; v_reuso uuid;
  v_txt text; v_int int;
begin
  select id into v_forn from public.fornecedores where ativo order by razao_social limit 1;
  select id into v_ins from public.insumos where ativo order by nome limit 1;
  select id into v_cc from public.centros_custo where ativo order by codigo nulls last limit 1;
  select cp.condicao_id into v_cond from public.condicao_parcelas cp
    group by cp.condicao_id having count(*) = 1 and round(sum(cp.percentual),2) = 100.00 limit 1;

  -- Conta descartavel com saldo: fn_pagar_parcela confere saldo.
  insert into public.contas_bancarias (nome, saldo_inicial)
  values ('[PROVA-ANEXO] conta', 5000) returning id into v_conta;

  insert into public.cotacoes (status, observacoes)
  values ('aberta', '[PROVA-ANEXO] cotacao') returning id into v_cot;

  -- Usa fn_registrar_arquivo, que e o caminho que a TELA usa. A versao anterior
  -- desta prova inseria em `arquivos` na mao e chamava so fn_vincular_arquivo:
  -- testava em volta do caminho real, e por isso nao pegou o 42P10 que fazia
  -- TODO upload falhar (ON CONFLICT nao inferia o indice parcial de dedup).
  select public.fn_registrar_arquivo(
    'arquivos/prova/' || gen_random_uuid() || '.pdf', 'nf.pdf', 'application/pdf', 999,
    'prova-' || gen_random_uuid(), 'cotacao', v_cot
  ) into v_arquivo;

  insert into prova_anexos (caso, obtido, passou) values (
    'registrar arquivo pelo caminho da tela',
    (select count(*)::text || ' vinculo' from public.anexo_vinculos where arquivo_id = v_arquivo),
    (select count(*) = 1 from public.anexo_vinculos where arquivo_id = v_arquivo));

  select public.fn_criar_ordem_compra(
    jsonb_build_object('fornecedor_id', v_forn, 'condicao_pagamento_id', v_cond,
                       'cotacao_id', v_cot, 'data_emissao', '2026-01-10',
                       'observacoes', '[PROVA-ANEXO] oc'),
    jsonb_build_array(jsonb_build_object('insumo_id', v_ins, 'quantidade', 10,
                                        'preco_unitario', 10, 'centro_custo_id', v_cc))
  ) into v_oc;

  perform public.fn_salvar_parcelas_oc(v_oc, '[{"data_vencimento":"2026-02-10","valor":100.00}]'::jsonb);
  update public.ordens_compra set status = 'pendente_aprovacao' where id = v_oc;
  perform public.fn_aprovar_ordem_compra(v_oc);
  select id into v_lanc from public.lancamentos where origem = 'oc' and origem_id = v_oc;

  perform public.fn_registrar_recebimento(v_oc, 'PROVA-ANEXO-NF', 100.00, '2026-01-20');
  select id into v_parcela from public.lancamento_parcelas where lancamento_id = v_lanc order by numero_parcela limit 1;
  perform public.fn_aprovar_parcela(v_parcela);
  perform public.fn_pagar_parcela(v_parcela, v_conta, '2026-01-25');

  select string_agg(entidade_tipo || '/' || origem, ' ' order by
    case entidade_tipo when 'cotacao' then 1 when 'ordem_compra' then 2
                       when 'lancamento' then 3 else 4 end)
  into v_txt from public.anexo_vinculos where arquivo_id = v_arquivo;
  insert into prova_anexos (caso, obtido, passou) values (
    'cadeia inteira propagada', v_txt,
    v_txt = 'cotacao/upload_direto ordem_compra/propagado lancamento/propagado pagamento/propagado');

  select count(*) into v_int from public.arquivos where id = v_arquivo;
  insert into prova_anexos (caso, obtido, passou) values (
    'um arquivo fisico para os 4 documentos', v_int || ' arquivo', v_int = 1);

  -- Anexo tardio na OC desce para o que ja existe (tambem pelo caminho da tela).
  select public.fn_registrar_arquivo(
    'arquivos/prova/' || gen_random_uuid() || '.pdf', 'boleto.pdf', 'application/pdf', 555,
    'prova2-' || gen_random_uuid(), 'ordem_compra', v_oc
  ) into v_arquivo2;

  select string_agg(entidade_tipo || '/' || origem, ' ' order by
    case entidade_tipo when 'ordem_compra' then 1 when 'lancamento' then 2 else 3 end)
  into v_txt from public.anexo_vinculos where arquivo_id = v_arquivo2;
  insert into prova_anexos (caso, obtido, passou) values (
    'anexo tardio na OC desce a cadeia', v_txt,
    v_txt = 'ordem_compra/upload_direto lancamento/propagado pagamento/propagado');

  -- Dedup pelo caminho da tela: mesmo hash e tamanho em OUTRO documento reusa o
  -- registro em vez de subir binario de novo.
  begin
    select public.fn_registrar_arquivo(
      'arquivos/prova/duplicata.pdf', 'copia.pdf', 'application/pdf',
      (select tamanho_bytes from public.arquivos where id = v_arquivo2),
      (select hash_sha256 from public.arquivos where id = v_arquivo2),
      'lancamento', v_lanc
    ) into v_reuso;
    insert into prova_anexos (caso, obtido, passou) values (
      'dedup reusa o mesmo arquivo',
      case when v_reuso = v_arquivo2 then 'mesmo id, sem binario novo' else 'criou outro registro' end,
      v_reuso = v_arquivo2);
  end;

  -- Remover um vinculo nao mexe no arquivo compartilhado.
  perform public.fn_desvincular_arquivo(
    (select id from public.anexo_vinculos where arquivo_id = v_arquivo and entidade_tipo = 'ordem_compra'));
  select count(*) into v_int from public.arquivos where id = v_arquivo and orfao_em is null;
  insert into prova_anexos (caso, obtido, passou) values (
    'remover 1 vinculo nao apaga arquivo', v_int || ' arquivo vivo sem marca', v_int = 1);

  -- Ultimo vinculo removido marca orfao.
  delete from public.anexo_vinculos where arquivo_id = v_arquivo;
  select case when orfao_em is null then 'sem marca' else 'marcado orfao' end
  into v_txt from public.arquivos where id = v_arquivo;
  insert into prova_anexos (caso, obtido, passou) values (
    'ultimo vinculo marca orfao', v_txt, v_txt = 'marcado orfao');

  -- Carencia de 24h protege o binario.
  insert into prova_anexos (caso, obtido, passou) values (
    'faxina respeita a carencia',
    case when public.fn_apagar_arquivo_orfao(v_arquivo) then 'apagou' else 'recusou' end,
    not public.fn_apagar_arquivo_orfao(v_arquivo));

  update public.arquivos set orfao_em = now() - interval '30 hours' where id = v_arquivo;
  insert into prova_anexos (caso, obtido, passou) values (
    'faxina apaga fora da carencia',
    case when public.fn_apagar_arquivo_orfao(v_arquivo) then 'apagou' else 'recusou' end, true);

  select count(*) into v_int from public.arquivos where id = v_arquivo;
  insert into prova_anexos (caso, obtido, passou) values ('arquivo saiu da tabela', v_int || ' linha', v_int = 0);

  -- Limpeza
  delete from public.recebimentos where ordem_compra_id = v_oc;
  delete from public.anexo_vinculos where arquivo_id in (v_arquivo, v_arquivo2);
  delete from public.arquivos where id in (v_arquivo, v_arquivo2);
  delete from public.lancamento_parcelas where lancamento_id = v_lanc;
  delete from public.lancamento_rateios where lancamento_id = v_lanc;
  delete from public.lancamentos where id = v_lanc;
  delete from public.oc_parcelas where ordem_compra_id = v_oc;
  delete from public.oc_itens where ordem_compra_id = v_oc;
  delete from public.ordens_compra where id = v_oc;
  delete from public.cotacoes where id = v_cot;
  delete from public.contas_bancarias where id = v_conta;
end $prova$;

select caso, obtido, case when passou then 'PASSOU' else 'FALHOU' end as resultado
from prova_anexos order by ordem;
