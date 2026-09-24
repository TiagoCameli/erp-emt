-- Fases 3 e 4: carga do Combustível e do Frete do Gestão Obras (virada no mesmo dia).
--
-- Sem dado aqui: lê legado.carga_fase34 (enchido do retrato da origem por
-- scripts/migracao-gestao-obras/carregar_staging_fase34.py), grava, refaz o derivado pelas
-- funções do ERP e confere. Um bloco só, então é atômico: ou entra tudo e bate, ou nada.
--
-- Idempotente: ids por legado.fn_uid (o mesmo md5 do gerador) e on conflict do nothing.
-- Nada gera lançamento, parcela ou rateio (a conferência prova: 0 lançamentos novos).
--
-- Ordem (plano, seção 8): com app.carga_combustivel = '1' os gatilhos de PEPS, nível, conta
-- corrente, horímetro e travas não rodam; entra tudo como está na origem; depois roda uma vez
-- fn_comb_recalcular_tudo() (nível, PEPS e débito/crédito do abastecimento de carreta) e
-- fn_frete_recalcular_movimentos() (crédito do frete, débito do pagamento, ajuste aprovado).
-- A conta corrente da origem (transportadora_movimentos) NÃO é copiada: é regenerada, e o saldo
-- de cada transportadora tem que dar o da tela da origem na quarta casa.
--
-- Ensaio: com app.carga_ensaio = 'sim' faz tudo, confere e desfaz no fim (raise).
-- Conferência (plano, seção 9): contagem por tabela (vivos e excluídos), soma por mês de
-- fretes, saídas e pagamentos, saldo por transportadora, nível, combustível, valor em estoque e
-- preço PEPS da última saída de cada tanque, custo PEPS de cada saída, sem suprimento, anexos,
-- movimentos por tipo, contra os números que o gerador tirou do retrato ('esperado*').

do $carga$
declare
  v_manifesto jsonb;
  v_tabela text;
  v_partes int;
  v_lanc0 bigint;
  v_n bigint;
  v_n2 bigint;
  v_v numeric;
  v_v2 numeric;
  v_x numeric;
  v_esp jsonb;
  v_txt text;
  v_erros text := '';
  v_rel jsonb := '{}'::jsonb;
  r record;
begin
  -- ---------------------------------------------------------------- travas
  select dados -> 0 into v_manifesto from legado.carga_fase34 where tabela = 'manifesto' and parte = 1;
  if v_manifesto is null then
    raise exception 'Staging vazio: rodar carregar_staging_fase34.py antes da carga';
  end if;
  for v_tabela, v_partes in select key, value::int from jsonb_each_text(v_manifesto) loop
    select count(*) into v_n from legado.carga_fase34 where tabela = v_tabela;
    if v_n <> v_partes then
      raise exception 'Staging incompleto: % tem % de % partes', v_tabela, v_n, v_partes;
    end if;
  end loop;

  -- Nada de Frete ou Combustível lançado no ERP fora da carga (senão o saldo não é o da origem).
  select string_agg(t, ', ') into v_txt from (
    select 'fretes' t where exists (select 1 from public.fretes where origem <> 'migracao')
    union all select 'frete_pagamentos' where exists (select 1 from public.frete_pagamentos where origem <> 'migracao')
    union all select 'pedidos_material' where exists (select 1 from public.pedidos_material where origem <> 'migracao')
    union all select 'frete_ajustes' where exists (select 1 from public.frete_ajustes where origem <> 'migracao')
    union all select 'combustivel_entradas' where exists (select 1 from public.combustivel_entradas where origem <> 'migracao')
    union all select 'combustivel_saidas' where exists (select 1 from public.combustivel_saidas where canal <> 'migracao')
    union all select 'combustivel_transferencias' where exists (select 1 from public.combustivel_transferencias where origem <> 'migracao')
    union all select 'combustivel_esvaziamentos' where exists (select 1 from public.combustivel_esvaziamentos where origem <> 'migracao')
    union all select 'tanques' where exists (select 1 from public.tanques t
      where t.id not in (select legado.fn_uid('depositos', e ->> 'g') from legado.fn_staging34('tanque') e))
    union all select 'transportadora_movimentos' where exists (select 1 from public.transportadora_movimentos where origem <> 'migracao'
      and not (origem_tabela, origem_id) in (
        select 'fretes', legado.fn_uid('fretes', e ->> 'g') from legado.fn_staging34('frete') e
        union all select 'frete_pagamentos', legado.fn_uid('pagamentos_frete', e ->> 'g') from legado.fn_staging34('pagamento') e
        union all select 'combustivel_saidas', legado.fn_uid('saidas_combustivel', e ->> 'g') from legado.fn_staging34('saida') e
        union all select 'frete_ajustes', legado.fn_uid('transportadora_movimentos', e ->> 'k') from legado.fn_staging34('ajuste') e))
  ) x;
  if v_txt is not null then
    raise exception 'Existe lançamento no ERP fora da carga (%): o saldo da conta corrente não seria o da origem', v_txt;
  end if;
  select string_agg(e ->> 'nome', ', ') into v_txt from legado.fn_staging34('localidade') e
   where exists (select 1 from public.localidades l where public.fn_chave_nome(l.nome) = public.fn_chave_nome(e ->> 'nome')
                  and l.id <> legado.fn_uid('localidades', e ->> 'g'));
  if v_txt is not null then raise exception 'Localidade já cadastrada no ERP com outro id: %', v_txt; end if;

  -- De-paras
  select string_agg(distinct x.g, ', ') into v_txt from (
    select e ->> 'tr' g from legado.fn_staging34('frete') e union select e ->> 'tr' from legado.fn_staging34('pagamento') e
    union select e ->> 'tr' from legado.fn_staging34('saida') e where e ->> 'tr' is not null
    union select e ->> 'dono' from legado.fn_staging34('tanque') e where e ->> 'dono' is not null
    union select e ->> 'f' from legado.fn_staging34('pedido') e union select e ->> 'tr' from legado.fn_staging34('ajuste') e
    union select e ->> 'f' from legado.fn_staging34('localidade') e where e ->> 'f' is not null
    union select jsonb_array_elements_text(e -> 'fs') from legado.fn_staging34('entrada') e
    union select jsonb_array_elements_text(e -> 'fs') from legado.fn_staging34('painel') e) x
   where not exists (select 1 from legado.de_para_fornecedores d where d.gestao_obras_id = x.g);
  if v_txt is not null then raise exception 'Fornecedor sem de-para: %', v_txt; end if;
  select string_agg(e ->> 'g', ', ') into v_txt from legado.fn_staging34('entrada') e
   where jsonb_array_length(e -> 'fs') > 0 and (select count(distinct d.fornecedor_id) from legado.de_para_fornecedores d
           where d.gestao_obras_id in (select jsonb_array_elements_text(e -> 'fs'))) <> 1;
  if v_txt is not null then raise exception 'Entrada com fornecedor (texto) que casa com mais de um fornecedor do ERP: %', v_txt; end if;
  select string_agg(distinct e ->> 'eq', ', ') into v_txt from legado.fn_staging34('saida') e
   where e ->> 'eq' is not null and not exists (select 1 from legado.de_para_equipamentos d where d.gestao_obras_id = e ->> 'eq');
  if v_txt is not null then raise exception 'Equipamento sem de-para: %', v_txt; end if;
  select string_agg(distinct x.g, ', ') into v_txt from (
    select e ->> 'ob' g from legado.fn_staging34('alocacao') e union select e ->> 'ob' from legado.fn_staging34('frete') e
    union select e ->> 'ob' from legado.fn_staging34('ajuste') e where e ->> 'ob' is not null) x
   where not exists (select 1 from legado.de_para_obras d where d.gestao_obras_id = x.g);
  if v_txt is not null then raise exception 'Obra sem de-para: %', v_txt; end if;
  select string_agg(distinct x.g, ', ') into v_txt from (
    select e ->> 'i' g from legado.fn_staging34('entrada') e union select e ->> 'i' from legado.fn_staging34('saida') e
    union select e ->> 'i' from legado.fn_staging34('transferencia') e where e ->> 'i' is not null) x
   where not exists (select 1 from legado.de_para_insumos d where d.gestao_obras_id = x.g);
  if v_txt is not null then raise exception 'Combustível sem de-para de insumo: %', v_txt; end if;
  select string_agg(e ->> 'g', ', ') into v_txt from legado.fn_staging34('material_map') e
    join legado.de_para_insumos d on d.gestao_obras_id = e ->> 'g' where d.insumo_id <> (e ->> 'i')::uuid;
  if v_txt is not null then raise exception 'Material já tem de-para para outro insumo: %', v_txt; end if;
  select string_agg(e ->> 'g', ', ') into v_txt from legado.fn_staging34('saida') e
   where e ->> 'tc' = 'equipamento_proprio' and not exists (select 1 from legado.de_para_equipamentos d
           join public.equipamentos q on q.id = d.equipamento_id where d.gestao_obras_id = e ->> 'eq');
  if v_txt is not null then raise exception 'Saída de equipamento próprio sem equipamento: %', left(v_txt, 300); end if;

  select count(*) into v_lanc0 from public.lancamentos;
  perform set_config('app.carga_combustivel', '1', true);

  -- ---------------------------------------------------------------- cadastros
  insert into public.insumos (id, nome, categoria_id, categoria_financeira_id, unidade_id, descricao, ativo)
  select (e ->> 'id')::uuid, e ->> 'nome', m.categoria_id, m.categoria_financeira_id, m.unidade_id,
         'Criado na migração do Frete do Gestão Obras (material de pedreira, em tonelada).', true
  from legado.fn_staging34('material_novo') e join public.insumos m on m.id = (e ->> 'modelo')::uuid
  on conflict (id) do nothing;
  insert into legado.de_para_insumos (gestao_obras_id, nome_origem, insumo_id)
  select e ->> 'g', e ->> 'nome', (e ->> 'i')::uuid from legado.fn_staging34('material_map') e
  on conflict (gestao_obras_id) do nothing;

  insert into public.localidades (id, nome, endereco, ativo, fornecedor_id)
  select legado.fn_uid('localidades', e ->> 'g'), e ->> 'nome', e ->> 'end', (e ->> 'at')::boolean, d.fornecedor_id
  from legado.fn_staging34('localidade') e
  left join legado.de_para_fornecedores d on d.gestao_obras_id = e ->> 'f'
  on conflict (id) do nothing;

  insert into public.tanques (id, nome, apelido, capacidade_litros, eh_externo, proprietario_id, ativo, created_at, created_by)
  select legado.fn_uid('depositos', e ->> 'g'), e ->> 'nome', e ->> 'ap', (e ->> 'cap')::numeric, (e ->> 'ext')::boolean,
         d.fornecedor_id, (e ->> 'at')::boolean, (e ->> 'c')::timestamptz, (e ->> 'u')::uuid
  from legado.fn_staging34('tanque') e
  left join legado.de_para_fornecedores d on d.gestao_obras_id = e ->> 'dono'
  on conflict (id) do nothing;

  -- ---------------------------------------------------------------- combustível
  -- Relógio de parede da origem (timestamp sem fuso) = horário de Rio Branco (plano, seção 5).
  insert into public.combustivel_entradas (id, tanque_id, insumo_id, quantidade, litros, valor_total, fornecedor_id, nota_fiscal,
         observacoes, data_hora, origem, excluido_em, motivo_exclusao, created_at, updated_at, created_by)
  select legado.fn_uid('entradas_combustivel', e ->> 'g'), legado.fn_uid('depositos', e ->> 't'), i.insumo_id,
         (e ->> 'l')::numeric, (e ->> 'l')::numeric, (e ->> 'vt')::numeric,
         (select distinct d.fornecedor_id from legado.de_para_fornecedores d where d.gestao_obras_id in (select jsonb_array_elements_text(e -> 'fs'))),
         e ->> 'nf', e ->> 'o', (e ->> 'dh')::timestamp at time zone 'America/Rio_Branco', 'migracao',
         (e ->> 'ex')::timestamptz, e ->> 'm', (e ->> 'c')::timestamptz, (e ->> 'c')::timestamptz, (e ->> 'u')::uuid
  from legado.fn_staging34('entrada') e
  join legado.de_para_insumos i on i.gestao_obras_id = e ->> 'i'
  on conflict (id) do nothing;

  insert into public.combustivel_transferencias (id, tanque_origem_id, tanque_destino_id, insumo_id, litros, valor_total, data_hora,
         observacoes, origem, excluido_em, motivo_exclusao, created_at, updated_at, created_by)
  select legado.fn_uid('transferencias_combustivel', e ->> 'g'), legado.fn_uid('depositos', e ->> 'o'), legado.fn_uid('depositos', e ->> 'd'),
         i.insumo_id, (e ->> 'l')::numeric, (e ->> 'vt')::numeric, (e ->> 'dh')::timestamp at time zone 'America/Rio_Branco',
         e ->> 'ob', 'migracao', (e ->> 'ex')::timestamptz, e ->> 'm', (e ->> 'c')::timestamptz, (e ->> 'c')::timestamptz, (e ->> 'u')::uuid
  from legado.fn_staging34('transferencia') e
  left join legado.de_para_insumos i on i.gestao_obras_id = e ->> 'i'
  on conflict (id) do nothing;

  insert into public.combustivel_esvaziamentos (id, tanque_id, litros, motivo, valor_perda, data_hora, origem, created_at, updated_at, created_by)
  select legado.fn_uid('esvaziamentos_tanque', e ->> 'g'), legado.fn_uid('depositos', e ->> 't'), (e ->> 'l')::numeric, e ->> 'mo',
         (e ->> 'vp')::numeric, (e ->> 'dh')::timestamp at time zone 'America/Rio_Branco', 'migracao',
         (e ->> 'c')::timestamptz, (e ->> 'c')::timestamptz, (e ->> 'u')::uuid
  from legado.fn_staging34('esvaziamento') e
  on conflict (id) do nothing;

  -- O centro de custo do equipamento próprio é a etapa dele (o gatilho faria isso; na carga
  -- ele não roda). Preço e valor entram como na origem; o PEPS regrava os do próprio depois.
  insert into public.combustivel_saidas (id, origem, tipo_consumidor, tanque_id, equipamento_id, transportadora_id, placa, motorista,
         insumo_id, litros, preco_combustivel, preco_proprietario, taxa_litro, preco_unitario, preco_medio_tanque, valor_total, pago,
         pago_em, medicao, tipo_medicao, centro_custo_id, data, canal, observacoes, excluido_em, motivo_exclusao, created_at,
         updated_at, created_by)
  select legado.fn_uid('saidas_combustivel', e ->> 'g'), e ->> 'or', e ->> 'tc',
         case when e ->> 't' is not null then legado.fn_uid('depositos', e ->> 't') end,
         q.equipamento_id, tr.fornecedor_id, e ->> 'pl', e ->> 'mo', i.insumo_id, (e ->> 'l')::numeric,
         (e ->> 'pc')::numeric, (e ->> 'pp')::numeric, (e ->> 'tx')::numeric, (e ->> 'pu')::numeric, (e ->> 'pm')::numeric,
         (e ->> 'vt')::numeric, (e ->> 'pg')::boolean, (e ->> 'pe')::date, (e ->> 'me')::numeric, e ->> 'tm',
         case when e ->> 'tc' = 'equipamento_proprio' then (select c.id from public.centros_custo c where c.equipamento_id = q.equipamento_id limit 1) end,
         (e ->> 'd')::timestamp at time zone 'America/Rio_Branco', 'migracao', e ->> 'ob', (e ->> 'ex')::timestamptz, e ->> 'm',
         (e ->> 'c')::timestamptz, coalesce((e ->> 'up')::timestamptz, (e ->> 'c')::timestamptz), (e ->> 'u')::uuid
  from legado.fn_staging34('saida') e
  join legado.de_para_insumos i on i.gestao_obras_id = e ->> 'i'
  left join legado.de_para_equipamentos q on q.gestao_obras_id = e ->> 'eq'
  left join legado.de_para_fornecedores tr on tr.gestao_obras_id = e ->> 'tr'
  on conflict (id) do nothing;

  -- Onde o equipamento trabalhou: a obra raiz (009 e 010 são a mesma, decisão 4); a etapa da
  -- origem fica só como texto.
  insert into public.abastecimento_alocacoes (id, saida_id, centro_custo_id, percentual, litros, etapa_legado, created_at)
  select legado.fn_uid('abastecimento_alocacoes', e ->> 'k'), legado.fn_uid('saidas_combustivel', e ->> 's'), o.centro_custo_id,
         (e ->> 'p')::numeric, (e ->> 'l')::numeric * (e ->> 'p')::numeric / 100, e ->> 'et', now()
  from legado.fn_staging34('alocacao') e
  join legado.de_para_obras o on o.gestao_obras_id = e ->> 'ob'
  on conflict (id) do nothing;

  insert into public.combustivel_anomalias_conferidas (chave, motivo, conferido_por, conferido_em)
  select coalesce(e ->> 'k', 'D5-' || q.equipamento_id::text), e ->> 'm', (e ->> 'u')::uuid, (e ->> 'em')::timestamptz
  from legado.fn_staging34('anomalia_comb') e
  left join legado.de_para_equipamentos q on q.gestao_obras_id = e ->> 'eq'
  on conflict (chave) do nothing;

  -- ---------------------------------------------------------------- frete
  insert into public.fretes (id, tipo, data, data_chegada, centro_custo_id, origem_localidade_id, destino_localidade_id,
         transportadora_id, motorista, placa_carreta, insumo_id, peso_toneladas, km_rodados, valor_tkm, valor_total, valor_material,
         nota_fiscal, nota_fiscal2, observacoes, origem, excluido_em, motivo_exclusao, created_at, updated_at, created_by)
  select legado.fn_uid('fretes', e ->> 'g'), e ->> 'tp', (e ->> 'd')::date, (e ->> 'dc')::date, o.centro_custo_id,
         legado.fn_uid('localidades', e ->> 'o'), legado.fn_uid('localidades', e ->> 'de'), tr.fornecedor_id, e ->> 'mo', e ->> 'pl',
         i.insumo_id, (e ->> 'pe')::numeric, (e ->> 'km')::numeric, (e ->> 'tkm')::numeric, (e ->> 'vt')::numeric, (e ->> 'vm')::numeric,
         e ->> 'nf', e ->> 'nf2', e ->> 'obs', 'migracao', (e ->> 'ex')::timestamptz, e ->> 'm',
         (e ->> 'c')::timestamptz, coalesce((e ->> 'up')::timestamptz, (e ->> 'c')::timestamptz), (e ->> 'u')::uuid
  from legado.fn_staging34('frete') e
  join legado.de_para_obras o on o.gestao_obras_id = e ->> 'ob'
  join legado.de_para_fornecedores tr on tr.gestao_obras_id = e ->> 'tr'
  join legado.de_para_insumos i on i.gestao_obras_id = e ->> 'i'
  on conflict (id) do nothing;

  insert into public.frete_pagamentos (id, data, transportadora_id, mes_referencia, valor, metodo, quantidade_combustivel, responsavel,
         nota_fiscal, pago_por, observacoes, origem, excluido_em, motivo_exclusao, created_at, updated_at, created_by)
  select legado.fn_uid('pagamentos_frete', e ->> 'g'), (e ->> 'd')::date, tr.fornecedor_id, (e ->> 'mes')::date, (e ->> 'v')::numeric,
         e ->> 'met', (e ->> 'qc')::numeric, e ->> 'resp', e ->> 'nf', e ->> 'pp', e ->> 'obs', 'migracao',
         (e ->> 'ex')::timestamptz, e ->> 'm', (e ->> 'c')::timestamptz, coalesce((e ->> 'up')::timestamptz, (e ->> 'c')::timestamptz),
         (e ->> 'u')::uuid
  from legado.fn_staging34('pagamento') e
  join legado.de_para_fornecedores tr on tr.gestao_obras_id = e ->> 'tr'
  on conflict (id) do nothing;

  insert into public.pedidos_material (id, data, fornecedor_id, observacoes, origem, excluido_em, motivo_exclusao, created_at,
         updated_at, created_by)
  select legado.fn_uid('pedidos_material', e ->> 'g'), (e ->> 'd')::date, f.fornecedor_id, e ->> 'obs', 'migracao',
         (e ->> 'ex')::timestamptz, e ->> 'm', (e ->> 'c')::timestamptz, coalesce((e ->> 'up')::timestamptz, (e ->> 'c')::timestamptz),
         (e ->> 'u')::uuid
  from legado.fn_staging34('pedido') e
  join legado.de_para_fornecedores f on f.gestao_obras_id = e ->> 'f'
  on conflict (id) do nothing;
  insert into public.pedido_material_itens (id, pedido_id, ordem, insumo_id, quantidade, valor_unitario, created_at)
  select legado.fn_uid('pedido_material_itens', (e ->> 'g') || ':' || it.ordem), legado.fn_uid('pedidos_material', e ->> 'g'),
         it.ordem, i.insumo_id, (it.item ->> 'q')::numeric, (it.item ->> 'vu')::numeric, (e ->> 'c')::timestamptz
  from legado.fn_staging34('pedido') e
  cross join lateral jsonb_array_elements(e -> 'it') with ordinality as it(item, ordem)
  join legado.de_para_insumos i on i.gestao_obras_id = it.item ->> 'i'
  on conflict (id) do nothing;

  -- Ajustes (decisão do Tiago, 24/09): aprovados e soltos. Na origem entravam direto na conta
  -- corrente, sem aprovação; aprovado_por fica vazio, e o motivo diz de onde vieram.
  insert into public.frete_ajustes (id, transportadora_id, sinal, valor, data, mes_referencia, centro_custo_id, descricao, status,
         aprovado_em, motivo_status, origem, created_at, updated_at, created_by)
  select legado.fn_uid('transportadora_movimentos', e ->> 'k'), tr.fornecedor_id, e ->> 'sn', (e ->> 'v')::numeric,
         (e ->> 'd')::timestamptz, (e ->> 'mes')::date, o.centro_custo_id, e ->> 'ds', 'aprovado', (e ->> 'c')::timestamptz,
         'Migrado do Gestão Obras: lá o ajuste entrava direto na conta corrente, sem aprovação', 'migracao',
         (e ->> 'c')::timestamptz, (e ->> 'c')::timestamptz, (e ->> 'u')::uuid
  from legado.fn_staging34('ajuste') e
  join legado.de_para_fornecedores tr on tr.gestao_obras_id = e ->> 'tr'
  left join legado.de_para_obras o on o.gestao_obras_id = e ->> 'ob'
  on conflict (id) do nothing;

  update public.frete_painel_config c set
    fornecedor_ids = coalesce((select array_agg(distinct d.fornecedor_id order by d.fornecedor_id) from legado.fn_staging34('painel') e
                                cross join lateral jsonb_array_elements_text(e -> 'fs') g
                                join legado.de_para_fornecedores d on d.gestao_obras_id = g), '{}'),
    updated_at = coalesce((select (e ->> 'em')::timestamptz from legado.fn_staging34('painel') e), now()),
    updated_by = (select (e ->> 'u')::uuid from legado.fn_staging34('painel') e)
  where c.id = 'global';

  -- Frete: o ERP ainda não tem detector de anomalias do frete; a chave fica a da origem.
  insert into public.frete_anomalias_conferidas (chave, motivo, conferido_por, conferido_em)
  select e ->> 'k', e ->> 'm', (e ->> 'u')::uuid, (e ->> 'em')::timestamptz from legado.fn_staging34('anomalia_frete') e
  on conflict (chave) do nothing;

  -- ---------------------------------------------------------------- anexos (o binário já subiu)
  -- Um arquivo por conteúdo (arquivos_hash_tamanho_unico): a foto repetida é um arquivo com
  -- vários vínculos, e um conteúdo que o ERP já tinha é reaproveitado (o objeto que subiu à toa
  -- fica sem linha e a faxina apaga).
  insert into public.arquivos (id, path_storage, nome_original, tipo_mime, tamanho_bytes, hash_sha256, created_at)
  select legado.fn_uid('arquivos', e ->> 'k'), e ->> 'path', e ->> 'nome', e ->> 'mime', (e ->> 'b')::bigint, e ->> 'h',
         coalesce((e ->> 'c')::timestamptz, now())
  from legado.fn_staging34('arquivo') e
  on conflict do nothing;
  insert into public.anexo_vinculos (id, arquivo_id, entidade_tipo, entidade_id, origem, nome_exibicao, created_at)
  select legado.fn_uid('anexo_vinculos', e ->> 'k'), a.id, e ->> 'et',
         legado.fn_uid(e ->> 'tb', e ->> 'g'), 'upload_direto', e ->> 'nome', coalesce((e ->> 'c')::timestamptz, now())
  from legado.fn_staging34('vinculo') e
  join public.arquivos a on a.hash_sha256 = e ->> 'h' and a.tamanho_bytes = (e ->> 'b')::bigint
  on conflict do nothing;

  -- ---------------------------------------------------------------- derivado, uma vez
  -- Com a flag ainda ligada: o PEPS regrava preço e valor das saídas, e o gatilho BEFORE da
  -- saída (que recarimbaria insumo e centro) não pode rodar em cima do que veio da origem.
  perform public.fn_comb_recalcular_tudo();
  perform public.fn_frete_recalcular_movimentos();
  update public.transportadora_movimentos set origem = 'migracao' where origem <> 'migracao';
  perform set_config('app.carga_combustivel', '', true);

  -- ---------------------------------------------------------------- conferência
  for v_esp in select e from legado.fn_staging34('esperado') e loop
    v_tabela := v_esp ->> 'chave';
    v_v := null;
    case v_tabela
      when 'combustivel_entradas' then select count(*) into v_n from public.combustivel_entradas where origem = 'migracao' and excluido_em is null;
      when 'combustivel_entradas_excluidos' then select count(*) into v_n from public.combustivel_entradas where origem = 'migracao' and excluido_em is not null;
      when 'combustivel_saidas' then select count(*) into v_n from public.combustivel_saidas where canal = 'migracao' and excluido_em is null;
      when 'combustivel_saidas_excluidos' then select count(*) into v_n from public.combustivel_saidas where canal = 'migracao' and excluido_em is not null;
      when 'combustivel_transferencias' then select count(*) into v_n from public.combustivel_transferencias where origem = 'migracao' and excluido_em is null;
      when 'combustivel_transferencias_excluidos' then select count(*) into v_n from public.combustivel_transferencias where origem = 'migracao' and excluido_em is not null;
      when 'fretes' then select count(*) into v_n from public.fretes where origem = 'migracao' and excluido_em is null;
      when 'fretes_excluidos' then select count(*) into v_n from public.fretes where origem = 'migracao' and excluido_em is not null;
      when 'frete_pagamentos' then select count(*) into v_n from public.frete_pagamentos where origem = 'migracao' and excluido_em is null;
      when 'frete_pagamentos_excluidos' then select count(*) into v_n from public.frete_pagamentos where origem = 'migracao' and excluido_em is not null;
      when 'pedidos_material' then select count(*) into v_n from public.pedidos_material where origem = 'migracao' and excluido_em is null;
      when 'pedidos_material_excluidos' then select count(*) into v_n from public.pedidos_material where origem = 'migracao' and excluido_em is not null;
      when 'tanques' then select count(*) into v_n from public.tanques;
      when 'combustivel_esvaziamentos' then select count(*) into v_n from public.combustivel_esvaziamentos where origem = 'migracao';
      when 'abastecimento_alocacoes' then select count(*) into v_n from public.abastecimento_alocacoes a
        join public.combustivel_saidas s on s.id = a.saida_id where s.canal = 'migracao';
      when 'pedido_material_itens' then select count(*) into v_n from public.pedido_material_itens i
        join public.pedidos_material p on p.id = i.pedido_id where p.origem = 'migracao';
      when 'localidades' then select count(*) into v_n from public.localidades
        where id in (select legado.fn_uid('localidades', e ->> 'g') from legado.fn_staging34('localidade') e);
      when 'frete_ajustes' then select count(*), coalesce(sum(case sinal when 'credito' then valor else -valor end), 0) into v_n, v_v
        from public.frete_ajustes where origem = 'migracao' and status = 'aprovado';
      when 'combustivel_anomalias_conferidas' then select count(*) into v_n from public.combustivel_anomalias_conferidas;
      when 'frete_anomalias_conferidas' then select count(*) into v_n from public.frete_anomalias_conferidas;
      when 'painel_fornecedores' then select coalesce(cardinality(fornecedor_ids), 0) into v_n from public.frete_painel_config where id = 'global';
      when 'combustivel_camadas' then select count(*), round(coalesce(sum(litros * preco), 0), 4) into v_n, v_v from public.combustivel_camadas;
        v_esp := jsonb_set(v_esp, '{v}', to_jsonb(round((v_esp ->> 'v')::numeric, 4)::text));
      when 'combustivel_sem_suprimento' then select count(*), coalesce(sum(litros_sem_suprimento), 0) into v_n, v_v from public.combustivel_sem_suprimento;
      when 'anexos' then select count(*) into v_n from public.anexo_vinculos
        where id in (select legado.fn_uid('anexo_vinculos', e ->> 'k') from legado.fn_staging34('vinculo') e);
      when 'arquivos' then select count(*) into v_n from public.arquivos a
        where exists (select 1 from legado.fn_staging34('arquivo') e where a.hash_sha256 = e ->> 'h' and a.tamanho_bytes = (e ->> 'b')::bigint)
          and exists (select 1 from public.anexo_vinculos v where v.arquivo_id = a.id);
      else
        if v_tabela like 'anexos:%' then
          select count(*) into v_n from public.anexo_vinculos where entidade_tipo = substr(v_tabela, 8)
             and id in (select legado.fn_uid('anexo_vinculos', e ->> 'k') from legado.fn_staging34('vinculo') e);
        elsif v_tabela like 'movimentos:%' then
          select count(*), coalesce(sum(valor), 0) into v_n, v_v from public.transportadora_movimentos where tipo = substr(v_tabela, 12);
        else
          raise exception 'Conferência sem regra para %', v_tabela;
        end if;
    end case;
    v_rel := v_rel || jsonb_build_object(v_tabela, jsonb_build_array(
      case when v_v is null then to_jsonb(v_n) else jsonb_build_array(v_n, v_v) end,
      case when v_v is null then v_esp -> 'n' else jsonb_build_array(v_esp -> 'n', v_esp -> 'v') end));
    if v_n <> (v_esp ->> 'n')::bigint or (v_v is not null and v_v <> (v_esp ->> 'v')::numeric) then
      v_erros := v_erros || v_tabela || ': ERP ' || v_n || coalesce(' / ' || v_v, '') || ', origem ' || (v_esp ->> 'n')
                 || coalesce(' / ' || (v_esp ->> 'v'), '') || '; ';
    end if;
  end loop;

  -- Soma por mês (fretes pela data do frete, saídas pelo dia em Rio Branco, pagamentos pela data)
  v_n2 := 0;
  for v_esp in select e from legado.fn_staging34('esperado_mes') e loop
    if v_esp ->> 't' = 'fretes' then
      select count(*), coalesce(sum(valor_total), 0), coalesce(sum(valor_material), 0) into v_n, v_v, v_x from public.fretes
       where origem = 'migracao' and excluido_em is null and to_char(data, 'YYYY-MM') = v_esp ->> 'm';
    elsif v_esp ->> 't' = 'saidas' then
      select count(*), coalesce(sum(valor_total), 0), coalesce(sum(litros), 0) into v_n, v_v, v_x from public.combustivel_saidas
       where canal = 'migracao' and excluido_em is null and to_char(data at time zone 'America/Rio_Branco', 'YYYY-MM') = v_esp ->> 'm';
    else
      select count(*), coalesce(sum(valor), 0), coalesce(sum(quantidade_combustivel), 0) into v_n, v_v, v_x from public.frete_pagamentos
       where origem = 'migracao' and excluido_em is null and to_char(data, 'YYYY-MM') = v_esp ->> 'm';
    end if;
    if v_n <> (v_esp ->> 'n')::bigint or v_v <> (v_esp ->> 'v')::numeric or v_x <> (v_esp ->> 'x')::numeric then
      v_n2 := v_n2 + 1;
      v_erros := v_erros || (v_esp ->> 't') || ' ' || (v_esp ->> 'm') || ': ERP ' || v_n || ' / ' || v_v || ' / ' || v_x
                 || ', origem ' || (v_esp ->> 'n') || ' / ' || (v_esp ->> 'v') || ' / ' || (v_esp ->> 'x') || '; ';
    end if;
  end loop;
  v_rel := v_rel || jsonb_build_object('meses_diferentes', v_n2);

  -- Saldo de cada transportadora (a view da origem somada pelo de-para) x o do ERP, na 4a casa.
  for r in
    with esp as (
      select d.fornecedor_id, sum((e ->> 's')::numeric) s, sum((e ->> 'cf')::numeric) cf, sum((e ->> 'pf')::numeric) pf,
             sum((e ->> 'dc')::numeric) dc, string_agg(e ->> 'nome', ' + ') nome
        from legado.fn_staging34('esperado_saldo') e join legado.de_para_fornecedores d on d.gestao_obras_id = e ->> 'g'
       group by d.fornecedor_id),
    erp as (
      select transportadora_id fornecedor_id,
             sum(case when tipo in ('credito_frete', 'credito_abastecimento_transterra', 'ajuste_manual_credito') then valor else -valor end) s,
             coalesce(sum(valor) filter (where tipo = 'credito_frete'), 0) cf,
             coalesce(sum(valor) filter (where tipo = 'debito_pagamento_frete'), 0) pf,
             coalesce(sum(valor) filter (where tipo in ('debito_abastecimento_transterra', 'debito_abastecimento_emt')), 0) dc
        from public.transportadora_movimentos group by transportadora_id)
    select coalesce(esp.fornecedor_id, erp.fornecedor_id) f, coalesce(esp.nome, '(sem saldo na origem)') nome,
           coalesce(erp.s, 0) s_erp, coalesce(esp.s, 0) s_esp, coalesce(erp.cf, 0) cf_erp, coalesce(esp.cf, 0) cf_esp,
           coalesce(erp.pf, 0) pf_erp, coalesce(esp.pf, 0) pf_esp, coalesce(erp.dc, 0) dc_erp, coalesce(esp.dc, 0) dc_esp
      from esp full join erp on erp.fornecedor_id = esp.fornecedor_id
  loop
    v_rel := v_rel || jsonb_build_object('saldo ' || r.nome, jsonb_build_array(r.s_erp, r.s_esp));
    if (r.s_erp, r.cf_erp, r.pf_erp, r.dc_erp) is distinct from (r.s_esp, r.cf_esp, r.pf_esp, r.dc_esp) then
      v_erros := v_erros || 'saldo ' || r.nome || ': ERP ' || r.s_erp || ' (frete ' || r.cf_erp || ', pago ' || r.pf_erp
                 || ', combustível ' || r.dc_erp || '), origem ' || r.s_esp || ' (frete ' || r.cf_esp || ', pago ' || r.pf_esp
                 || ', combustível ' || r.dc_esp || '); ';
    end if;
  end loop;

  -- Tanque: nível, combustível, valor em estoque pelas camadas e preço PEPS da última saída.
  for r in
    select e ->> 'nome' nome, t.nivel_atual_litros nivel, (e ->> 'nivel')::numeric nivel_esp,
           t.combustivel_atual_id ci, (select d.insumo_id from legado.de_para_insumos d where d.gestao_obras_id = e ->> 'ci') ci_esp,
           round(coalesce((select sum((l.litros - coalesce((select sum(c.litros) from public.combustivel_camadas c where c.fonte_id = l.id), 0))
                                      * l.valor_total / l.litros)
                             from (select id, litros, valor_total from public.combustivel_entradas where tanque_id = t.id and excluido_em is null
                                   union all select id, litros, valor_total from public.combustivel_transferencias
                                    where tanque_destino_id = t.id and excluido_em is null) l), 0), 4) ve,
           (e ->> 've')::numeric ve_esp,
           (select round(sum(c.litros * c.preco) / nullif(sum(c.litros), 0), 4) from public.combustivel_camadas c
             where c.saida_id = legado.fn_uid('saidas_combustivel', e ->> 'us')) up,
           (e ->> 'up')::numeric up_esp
      from legado.fn_staging34('esperado_tanque') e join public.tanques t on t.id = legado.fn_uid('depositos', e ->> 'g')
  loop
    v_rel := v_rel || jsonb_build_object('tanque ' || r.nome, jsonb_build_array(jsonb_build_array(r.nivel, r.ve, r.up),
                                                                               jsonb_build_array(r.nivel_esp, r.ve_esp, r.up_esp)));
    if (r.nivel, r.ci, r.ve, r.up) is distinct from (r.nivel_esp, r.ci_esp, r.ve_esp, r.up_esp) then
      v_erros := v_erros || 'tanque ' || r.nome || ': ERP nível ' || r.nivel || ', estoque R$ ' || r.ve || ', PEPS ' || coalesce(r.up::text, '-')
                 || coalesce(case when r.ci is distinct from r.ci_esp then ', combustível diferente' end, '')
                 || '; origem nível ' || r.nivel_esp || ', estoque R$ ' || r.ve_esp || ', PEPS ' || coalesce(r.up_esp::text, '-') || '; ';
    end if;
  end loop;
  select count(*) into v_n from public.tanques t
   where not exists (select 1 from legado.fn_staging34('esperado_tanque') e where legado.fn_uid('depositos', e ->> 'g') = t.id);
  if v_n > 0 then v_erros := v_erros || v_n || ' tanques no ERP sem conferência; '; end if;

  -- Custo PEPS de cada saída (camadas da origem x camadas do ERP) e o valor gravado.
  select count(*), string_agg(g, ' ' order by g) filter (where rn <= 5) into v_n, v_txt from (
    select coalesce(x.s, y.g) g, row_number() over (order by coalesce(x.s, y.g)) rn from (
      select e ->> 's' s, (e ->> 'l')::numeric l, (e ->> 'v')::numeric v from legado.fn_staging34('esperado_camada_saida') e) x
    full join (
      select s.g, sum(c.litros) l, round(sum(c.litros * c.preco), 4) v
        from (select e ->> 'g' g, legado.fn_uid('saidas_combustivel', e ->> 'g') id from legado.fn_staging34('saida') e) s
        join public.combustivel_camadas c on c.saida_id = s.id group by s.g) y on y.g = x.s
    where (x.l, x.v) is distinct from (y.l, y.v)) z;
  v_rel := v_rel || jsonb_build_object('saidas_peps_diferente', v_n);
  if v_n > 0 then v_erros := v_erros || v_n || ' saídas com camadas PEPS diferentes da origem (ex.: ' || v_txt || '); '; end if;

  select count(*), string_agg(e ->> 'g', ' ' order by e ->> 'g') filter (where true) into v_n, v_txt
    from legado.fn_staging34('saida') e join public.combustivel_saidas s on s.id = legado.fn_uid('saidas_combustivel', e ->> 'g')
   where s.valor_total <> (e ->> 'vt')::numeric or s.preco_unitario <> (e ->> 'pu')::numeric;
  v_rel := v_rel || jsonb_build_object('saidas_valor_diferente', v_n);
  if v_n > 0 then v_erros := v_erros || v_n || ' saídas com preço ou valor diferente da origem depois do PEPS (ex.: ' || left(v_txt, 90) || '); '; end if;

  select count(*) - v_lanc0 into v_n from public.lancamentos;
  v_rel := v_rel || jsonb_build_object('lancamentos_novos', v_n);
  if v_n <> 0 then v_erros := v_erros || 'a carga criou ' || v_n || ' lançamentos; '; end if;

  if v_erros <> '' then
    raise exception 'Carga não bate com a origem: % || RELATORIO %', v_erros, v_rel;
  end if;
  if current_setting('app.carga_ensaio', true) = 'sim' then
    raise exception 'ENSAIO OK, nada gravado: %', v_rel;
  end if;
  raise notice 'Carga conferida: %', v_rel;
end $carga$;
