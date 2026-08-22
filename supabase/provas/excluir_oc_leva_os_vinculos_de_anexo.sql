-- Prova de aceite: excluir OC leva os vínculos de anexo, e as guardas continuam
-- guardando.
--
-- Cria uma OC de verdade, anexa por onde o app anexa (`fn_registrar_arquivo`),
-- exclui e mede — tudo num bloco que termina em `raise`, então nada é gravado e a
-- numeração de OC volta (a sequência é UPDATE em tabela, não `nextval`).
--
-- ARMADILHA DE MEDIÇÃO, e é o motivo do `reset role` no meio: a policy de
-- `arquivos` exige um vínculo VISÍVEL. Olhando como `authenticated`, um arquivo
-- sem vínculo parece NÃO EXISTIR — "não visível" e "não existe" se confundem, e a
-- primeira versão desta prova concluiu (errado) que o arquivo tinha sido apagado.
-- O arquivo fica: quem cuida dele é `trg_marcar_arquivo_orfao`, que marca
-- `orfao_em` quando nenhum vínculo sobra.

do $prova$
declare
  v_usuario uuid := (select id from public.usuarios where email = 'tiago@emtconstrutora.com' and ativo limit 1);
  v_diesel uuid := (select id from public.insumos where nome ilike '%Diesel S10%' and ativo limit 1);
  v_cc uuid := (select id from public.centros_custo where pai_id is null and nome ilike '009%' limit 1);
  -- Controle: uma OC com pagamento aprovado. Ela NÃO pode sair.
  v_controle uuid := (
    select o.id from public.ordens_compra o
    where exists (
      select 1 from public.lancamentos l
      join public.lancamento_parcelas p on p.lancamento_id = l.id
      where l.origem = 'oc' and l.origem_id = o.id and p.status in ('aprovado','pago'))
    limit 1);
  v_cab jsonb; v_itens jsonb; v_oc uuid; v_arquivo uuid;
  v_oc_existe boolean; v_vinculos int;
  v_arquivo_existe boolean; v_arquivo_orfao boolean;
  v_recusa text := '(nao rodou)'; v_controle_ainda_la boolean;
begin
  v_itens := jsonb_build_array(jsonb_build_object(
    'insumo_id', v_diesel, 'quantidade', 100, 'preco_unitario', 6.188, 'centro_custo_id', v_cc));
  v_cab := jsonb_build_object(
    'fornecedor_id', (select id from public.fornecedores where ativo order by razao_social limit 1),
    'condicao_pagamento_id', (select id from public.condicoes_pagamento where ativo limit 1),
    'forma_pagamento_id', (select id from public.formas_pagamento where ativo and nome='Boleto' limit 1),
    'cotacao_id', null,
    'data_compra', to_char(now() at time zone 'America/Rio_Branco','YYYY-MM-DD'),
    'mes_competencia', to_char(date_trunc('month', now() at time zone 'America/Rio_Branco'),'YYYY-MM-DD'),
    'descricao', 'PROVA ROLLBACK exclusao com anexo',
    'categoria_id', (select id from public.categorias_financeiras where ativo limit 1),
    'numero_documento', null, 'observacoes', null);

  perform set_config('request.jwt.claims', json_build_object('sub', v_usuario, 'role','authenticated')::text, true);
  execute 'set local role authenticated';

  v_oc := public.fn_criar_ordem_compra(v_cab, v_itens);

  -- Anexa pelo caminho REAL do app: `authenticated` não tem INSERT direto em
  -- anexo_vinculos, e é a RPC que cria arquivo e vínculo.
  v_arquivo := public.fn_registrar_arquivo(
    'prova/rollback-' || gen_random_uuid()::text || '.pdf',
    'PROVA.pdf', 'application/pdf', 1024,
    md5(gen_random_uuid()::text), 'ordem_compra', v_oc);

  perform public.fn_excluir_ordem_compra(v_oc);
  select exists (select 1 from public.ordens_compra where id = v_oc) into v_oc_existe;
  select count(*) into v_vinculos from public.anexo_vinculos where entidade_id = v_oc;

  -- LINHA DE CONTROLE: a guarda do pagamento continua de pé.
  begin
    perform public.fn_excluir_ordem_compra(v_controle);
    v_recusa := 'PASSOU (NAO DEVIA)';
  exception when others then
    v_recusa := sqlerrm;
  end;
  select exists (select 1 from public.ordens_compra where id = v_controle) into v_controle_ainda_la;

  execute 'reset role';
  select exists (select 1 from public.arquivos where id = v_arquivo) into v_arquivo_existe;
  select exists (select 1 from public.arquivos where id = v_arquivo and orfao_em is not null)
    into v_arquivo_orfao;

  raise exception E'PROVA (desfeita, nada gravado)\n  A) OC rascunho com anexo -> oc_existe=% vinculos=% | arquivo_existe=% marcado_orfao=%\n  B) CONTROLE (OC com pagamento aprovado) -> % | ainda_esta_la=%',
    v_oc_existe, v_vinculos, v_arquivo_existe, v_arquivo_orfao, v_recusa, v_controle_ainda_la;
end $prova$;

-- Resultado em 21/08/2026:
--   A) oc_existe=f  vinculos=0  arquivo_existe=t  marcado_orfao=t
--   B) CONTROLE -> "Nao da para excluir: o pagamento desta ordem ja foi aprovado
--      ou pago..."  ainda_esta_la=t
--
-- E antes do conserto de dado desta migration: 4 vínculos órfãos de ordem_compra
-- e 7 de lançamento (279 vínculos no total, 268 depois).
