-- Fase 2d: carga da Manutenção do Gestão Obras.
--
-- Sem dado aqui: lê legado.carga_fase2d (enchido do retrato da origem por
-- scripts/migracao-gestao-obras/carregar_staging_fase2d.py), grava e confere. Um bloco só,
-- então é atômico: ou entra tudo e bate, ou não entra nada.
--
-- Idempotente: ids pelo legado.fn_uid (o mesmo md5 do gerador) e on conflict do nothing.
-- Nada gera lançamento, parcela ou rateio (e a conferência prova: 0 lançamentos novos).
--
-- Ensaio: com app.carga_ensaio = 'sim' faz tudo, confere e desfaz no fim (raise).
-- Conferência (seção 9 do plano): contagem por tabela, OS por status e custo, saldo de cada
-- peça, anexos, contra os números que o gerador contou do retrato (tabela 'esperado').

do $carga$
declare
  v_central constant uuid := legado.fn_uid('depositos_material', 'mp8hueeq1ppr2');
  v_manifesto jsonb;
  v_tabela text;
  v_partes int;
  v_lanc0 bigint;
  v_n bigint;
  v_v numeric;
  v_esp jsonb;
  v_erros text := '';
  v_relatorio jsonb := '{}'::jsonb;
begin
  -- ---------------------------------------------------------------- travas
  select dados -> 0 into v_manifesto from legado.carga_fase2d where tabela = 'manifesto' and parte = 1;
  if v_manifesto is null then
    raise exception 'Staging vazio: rodar carregar_staging_fase2d.py antes da carga';
  end if;
  for v_tabela, v_partes in select key, value::int from jsonb_each_text(v_manifesto) loop
    select count(*) into v_n from legado.carga_fase2d where tabela = v_tabela;
    if v_n <> v_partes then
      raise exception 'Staging incompleto: % tem % de % partes', v_tabela, v_n, v_partes;
    end if;
  end loop;
  if exists (select 1 from public.ordens_servico where origem <> 'migracao') then
    raise exception 'Existe OS lançada no ERP fora da carga: a numeração da origem colidiria';
  end if;

  select string_agg(distinct e ->> 'f', ', ') into v_erros from legado.fn_staging('entrada') e
   where not exists (select 1 from legado.de_para_fornecedores f where f.gestao_obras_id = e ->> 'f');
  if v_erros is not null then raise exception 'Fornecedor da entrada sem de-para: %', v_erros; end if;
  select string_agg(distinct x.eq, ', ') into v_erros from (
    select e ->> 'eq' eq from legado.fn_staging('os') e union select e ->> 'eq' from legado.fn_staging('ficha') e
    union select e ->> 'eq' from legado.fn_staging('documento') e union select e ->> 'eq' from legado.fn_staging('historico') e) x
   where not exists (select 1 from legado.de_para_equipamentos d where d.gestao_obras_id = x.eq);
  if v_erros is not null then raise exception 'Equipamento sem de-para: %', v_erros; end if;
  select string_agg(distinct e ->> 'eq', ', ') into v_erros from legado.fn_staging('os') e
    join legado.de_para_equipamentos d on d.gestao_obras_id = e ->> 'eq'
   where not exists (select 1 from public.centros_custo c where c.equipamento_id = d.equipamento_id);
  if v_erros is not null then raise exception 'Equipamento de OS sem etapa (centro de custo): %', v_erros; end if;
  -- O de-para de insumos da Fase 1 (combustível) não pode ser sobrescrito calado pelo das peças.
  select string_agg(e ->> 'g', ', ') into v_erros from legado.fn_staging('insumo_map') e
    join legado.de_para_insumos d on d.gestao_obras_id = e ->> 'g'
   where d.insumo_id <> (e ->> 'i')::uuid;
  if v_erros is not null then raise exception 'Peça já tem de-para para outro insumo: %', v_erros; end if;
  v_erros := '';

  select count(*) into v_lanc0 from public.lancamentos;

  -- ---------------------------------------------------------------- cadastros
  insert into public.fornecedores (id, tipo, razao_social, ativo)
  select (e ->> 'id')::uuid, 'pj', e ->> 'nome', true from legado.fn_staging('fornecedor_novo') e
  on conflict (id) do nothing;

  -- Mesmo nome e outra unidade já no ERP: a unidade vai no nome, senão ninguém distingue.
  insert into public.insumos (id, nome, categoria_id, categoria_financeira_id, unidade_id, descricao, ativo)
  select (e ->> 'id')::uuid,
         case when exists (select 1 from public.insumos i
                            where public.fn_chave_nome(i.nome) = public.fn_chave_nome(e ->> 'nome') and i.id <> (e ->> 'id')::uuid)
              then (e ->> 'nome') || ' - ' || (e ->> 'sigla') else e ->> 'nome' end,
         (e ->> 'cat')::uuid,
         (select c.categoria_financeira_id from public.categorias_insumo c where c.id = (e ->> 'cat')::uuid),
         (e ->> 'un')::uuid, 'Criado na migração do almoxarifado do Gestão Obras (23/09/2026).', true
  from legado.fn_staging('insumo_novo') e
  on conflict (id) do nothing;

  insert into legado.de_para_insumos (gestao_obras_id, nome_origem, insumo_id)
  select e ->> 'g', e ->> 'nome', (e ->> 'i')::uuid from legado.fn_staging('insumo_map') e
  on conflict (gestao_obras_id) do nothing;

  insert into public.tipos_oleo (id, nome, aplicacao, intervalo_meses, ativo, created_at, created_by)
  select legado.fn_uid('tipos_oleo', e ->> 'g'), e ->> 'nome', e ->> 'ap', (e ->> 'im')::int, (e ->> 'at')::boolean,
         (e ->> 'c')::timestamptz, (e ->> 'u')::uuid
  from legado.fn_staging('tipo_oleo') e
  on conflict (id) do nothing;

  -- O Silo não vira depósito: a entrada e a peça dele vêm para cá (saldo dele era 0).
  insert into public.almoxarifado_depositos (id, nome, ativo) values (v_central, 'Almoxarifado Central', true)
  on conflict (id) do nothing;

  insert into public.almoxarifado_itens (insumo_id, tipo_oleo_id, estoque_minimo, estoque_maximo, equipamento_ids, ativo)
  select (e ->> 'i')::uuid,
         case when e ->> 'to' is not null then legado.fn_uid('tipos_oleo', e ->> 'to') end,
         (e ->> 'min')::numeric, (e ->> 'max')::numeric,
         coalesce((select array_agg(d.equipamento_id order by d.equipamento_id) from legado.de_para_equipamentos d
                    where d.gestao_obras_id in (select jsonb_array_elements_text(e -> 'eq'))), '{}'),
         true
  from legado.fn_staging('item') e
  on conflict (insumo_id) do nothing;

  -- ---------------------------------------------------------------- entradas (todas antes das saídas)
  insert into public.almoxarifado_entradas (id, deposito_id, insumo_id, fornecedor_id, nota_fiscal, data, quantidade,
         valor_unitario, valor_total, observacoes, origem, created_at, created_by)
  select legado.fn_uid('entradas_material', e ->> 'g'), v_central, (e ->> 'i')::uuid, f.fornecedor_id, e ->> 'nf',
         (e ->> 'd')::date, (e ->> 'q')::numeric, (e ->> 'vu')::numeric, (e ->> 'vt')::numeric, e ->> 'o', 'migracao',
         (e ->> 'c')::timestamptz, (e ->> 'u')::uuid
  from legado.fn_staging('entrada') e
  join legado.de_para_fornecedores f on f.gestao_obras_id = e ->> 'f'
  on conflict (id) do nothing;

  -- ---------------------------------------------------------------- OS (mesmo número da origem)
  insert into public.ordens_servico (id, numero, numero_legado, equipamento_id, centro_custo_id, tipo, prioridade, status,
         descricao, defeito_reportado, causa_raiz, observacoes, data_abertura, data_inicio, data_conclusao,
         medicao_abertura, medicao_conclusao, origem, motivo_cancelamento, created_at, created_by)
  select legado.fn_uid('ordens_servico', e ->> 'g'), e ->> 'n', e ->> 'n', d.equipamento_id, c.id, e ->> 't', e ->> 'p', e ->> 's',
         e ->> 'ds', e ->> 'df', e ->> 'ca', e ->> 'ob', (e ->> 'da')::date, (e ->> 'di')::date, (e ->> 'dc')::date,
         (e ->> 'ma')::numeric, (e ->> 'mc')::numeric, 'migracao', e ->> 'mcanc', (e ->> 'c')::timestamptz, (e ->> 'u')::uuid
  from legado.fn_staging('os') e
  join legado.de_para_equipamentos d on d.gestao_obras_id = e ->> 'eq'
  join public.centros_custo c on c.equipamento_id = d.equipamento_id
  on conflict (id) do nothing;

  insert into public.os_transicoes (id, ordem_servico_id, status_de, status_para, motivo, usuario_id, criado_em)
  select legado.fn_uid('os_transicoes', e ->> 'g'), legado.fn_uid('ordens_servico', e ->> 'g'), null, e ->> 's',
         'Migrada do Gestão Obras (' || (e ->> 'n') || ')', (e ->> 'u')::uuid, (e ->> 'up')::timestamptz
  from legado.fn_staging('os') e
  on conflict (id) do nothing;

  -- ---------------------------------------------------------------- linhas: baixa e linha, custo congelado da origem
  insert into public.almoxarifado_saidas (id, deposito_id, insumo_id, quantidade, custo_unitario, valor_total,
         ordem_servico_id, motivo, created_at, created_by)
  select legado.fn_uid('saida_peca', e ->> 'g'), v_central, (e ->> 'i')::uuid, (e ->> 'q')::numeric, (e ->> 'cu')::numeric,
         (e ->> 'ct')::numeric, legado.fn_uid('ordens_servico', e ->> 'os'), 'os_peca', (e ->> 'c')::timestamptz, (e ->> 'u')::uuid
  from legado.fn_staging('peca') e
  on conflict (id) do nothing;
  insert into public.os_pecas (id, ordem_servico_id, insumo_id, deposito_id, saida_id, quantidade, custo_unitario,
         custo_total, observacoes, created_at, created_by)
  select legado.fn_uid('os_pecas', e ->> 'g'), legado.fn_uid('ordens_servico', e ->> 'os'), (e ->> 'i')::uuid, v_central,
         legado.fn_uid('saida_peca', e ->> 'g'), (e ->> 'q')::numeric, (e ->> 'cu')::numeric, (e ->> 'ct')::numeric, e ->> 'o',
         (e ->> 'c')::timestamptz, (e ->> 'u')::uuid
  from legado.fn_staging('peca') e
  on conflict (id) do nothing;

  insert into public.almoxarifado_saidas (id, deposito_id, insumo_id, quantidade, custo_unitario, valor_total,
         ordem_servico_id, motivo, created_at, created_by)
  select legado.fn_uid('saida_oleo', e ->> 'g'), v_central, (e ->> 'i')::uuid, (e ->> 'q')::numeric, (e ->> 'vu')::numeric,
         (e ->> 'vt')::numeric, legado.fn_uid('ordens_servico', e ->> 'os'), 'os_oleo', (e ->> 'c')::timestamptz, (e ->> 'u')::uuid
  from legado.fn_staging('oleo') e
  on conflict (id) do nothing;
  insert into public.os_oleos (id, ordem_servico_id, tipo_oleo_id, insumo_id, deposito_id, saida_id, quantidade, unidade,
         valor_unitario, valor_total, created_at, created_by)
  select legado.fn_uid('os_oleos', e ->> 'g'), legado.fn_uid('ordens_servico', e ->> 'os'), legado.fn_uid('tipos_oleo', e ->> 'to'),
         (e ->> 'i')::uuid, v_central, legado.fn_uid('saida_oleo', e ->> 'g'), (e ->> 'q')::numeric, e ->> 'un',
         (e ->> 'vu')::numeric, (e ->> 'vt')::numeric, (e ->> 'c')::timestamptz, (e ->> 'u')::uuid
  from legado.fn_staging('oleo') e
  on conflict (id) do nothing;

  insert into public.os_terceiros (id, ordem_servico_id, fornecedor_id, descricao, valor, nota_fiscal, created_at, created_by)
  select legado.fn_uid('os_terceiros', e ->> 'g'), legado.fn_uid('ordens_servico', e ->> 'os'), (e ->> 'f')::uuid, e ->> 'ds',
         (e ->> 'v')::numeric, e ->> 'nf', (e ->> 'c')::timestamptz, (e ->> 'u')::uuid
  from legado.fn_staging('terceiro') e
  on conflict (id) do nothing;

  -- ---------------------------------------------------------------- ficha, documentos, histórico
  insert into public.equipamento_especificacoes (id, equipamento_id, capacidade_tanque_l, capacidade_oleo_motor_l, tipo_oleo_motor,
         capacidade_oleo_hidraulico_l, tipo_oleo_hidraulico, capacidade_oleo_transmissao_l, tipo_oleo_transmissao,
         capacidade_oleo_diferencial_l, capacidade_arrefecedor_l, pneu_medida, pneu_qtd, bateria_especificacao, bateria_qtd,
         filtros, consumo_esperado_l_h, consumo_esperado_km_l, garantia_fim_data, garantia_fim_medicao, observacoes_tecnicas, created_at)
  select legado.fn_uid('especificacoes_equipamento', e ->> 'eq'), d.equipamento_id,
         (e ->> 'capacidade_tanque_l')::numeric, (e ->> 'capacidade_oleo_motor_l')::numeric, e ->> 'tipo_oleo_motor',
         (e ->> 'capacidade_oleo_hidraulico_l')::numeric, e ->> 'tipo_oleo_hidraulico',
         (e ->> 'capacidade_oleo_transmissao_l')::numeric, e ->> 'tipo_oleo_transmissao',
         (e ->> 'capacidade_oleo_diferencial_l')::numeric, (e ->> 'capacidade_arrefecedor_l')::numeric,
         e ->> 'pneu_medida', (e ->> 'pneu_qtd')::int, e ->> 'bateria_especificacao', (e ->> 'bateria_qtd')::int,
         nullif(e -> 'filtros', 'null'::jsonb), (e ->> 'consumo_esperado_l_h')::numeric, (e ->> 'consumo_esperado_km_l')::numeric,
         (e ->> 'garantia_fim_data')::date, (e ->> 'garantia_fim_medicao')::numeric, e ->> 'observacoes_tecnicas',
         (e ->> 'c')::timestamptz
  from legado.fn_staging('ficha') e
  join legado.de_para_equipamentos d on d.gestao_obras_id = e ->> 'eq'
  on conflict do nothing;

  insert into public.arquivos (id, path_storage, nome_original, tipo_mime, tamanho_bytes, hash_sha256, created_at)
  select legado.fn_uid('arquivos', e ->> 'k'), e ->> 'path', e ->> 'nome', e ->> 'mime', (e ->> 'b')::bigint, e ->> 'h',
         (e ->> 'c')::timestamptz
  from legado.fn_staging('arquivo') e
  on conflict (id) do nothing;
  insert into public.equipamento_documentos (id, equipamento_id, tipo, descricao, vencimento, anexo_path, created_at)
  select legado.fn_uid('documentos_equipamento', e ->> 'g'), d.equipamento_id, e ->> 't', e ->> 'ds', (e ->> 'v')::date,
         e ->> 'p', (e ->> 'c')::timestamptz
  from legado.fn_staging('documento') e
  join legado.de_para_equipamentos d on d.gestao_obras_id = e ->> 'eq'
  on conflict (id) do nothing;
  insert into public.anexo_vinculos (id, arquivo_id, entidade_tipo, entidade_id, origem, nome_exibicao, created_at)
  select legado.fn_uid('anexo_vinculos', e ->> 'k'), legado.fn_uid('arquivos', e ->> 'k'), 'equipamento_documento',
         legado.fn_uid('documentos_equipamento', e ->> 'doc'), 'upload_direto', e ->> 'nome', (e ->> 'c')::timestamptz
  from legado.fn_staging('arquivo') e
  on conflict do nothing;

  insert into public.equipamento_status_historico (id, equipamento_id, status_de, status_para, motivo, created_at, created_by)
  select legado.fn_uid('historico_status_equipamento', e ->> 'g'), d.equipamento_id, e ->> 'de', e ->> 'para', e ->> 'm',
         (e ->> 'c')::timestamptz, (e ->> 'u')::uuid
  from legado.fn_staging('historico') e
  join legado.de_para_equipamentos d on d.gestao_obras_id = e ->> 'eq'
  on conflict (id) do nothing;

  -- A numeração continua depois da maior OS da origem (inclusive das excluídas).
  insert into public.documento_sequencias (tipo, ano, proximo)
  select e ->> 'tipo', (e ->> 'ano')::int, (e ->> 'proximo')::int from legado.fn_staging('sequencia') e
  on conflict (tipo, ano) do update set proximo = greatest(public.documento_sequencias.proximo, excluded.proximo);

  -- ---------------------------------------------------------------- conferência
  for v_esp in select e from legado.fn_staging('esperado') e loop
    v_tabela := v_esp ->> 'chave';
    v_v := null;
    case v_tabela
      when 'ordens_servico' then select count(*) into v_n from public.ordens_servico where origem = 'migracao';
      when 'os_pecas' then select count(*) into v_n from public.os_pecas p join public.ordens_servico o on o.id = p.ordem_servico_id where o.origem = 'migracao';
      when 'os_oleos' then select count(*) into v_n from public.os_oleos p join public.ordens_servico o on o.id = p.ordem_servico_id where o.origem = 'migracao';
      when 'os_terceiros' then select count(*) into v_n from public.os_terceiros p join public.ordens_servico o on o.id = p.ordem_servico_id where o.origem = 'migracao';
      when 'almoxarifado_entradas' then select count(*) into v_n from public.almoxarifado_entradas where origem = 'migracao' and excluido_em is null;
      when 'tipos_oleo' then select count(*) into v_n from public.tipos_oleo t where t.id in (select legado.fn_uid('tipos_oleo', e ->> 'g') from legado.fn_staging('tipo_oleo') e);
      when 'equipamento_especificacoes' then select count(*) into v_n from public.equipamento_especificacoes t where t.id in (select legado.fn_uid('especificacoes_equipamento', e ->> 'eq') from legado.fn_staging('ficha') e);
      when 'equipamento_documentos' then select count(*) into v_n from public.equipamento_documentos t where t.id in (select legado.fn_uid('documentos_equipamento', e ->> 'g') from legado.fn_staging('documento') e);
      when 'anexo_vinculos' then select count(*) into v_n from public.anexo_vinculos where entidade_tipo = 'equipamento_documento';
      when 'equipamento_status_historico' then select count(*) into v_n from public.equipamento_status_historico t where t.id in (select legado.fn_uid('historico_status_equipamento', e ->> 'g') from legado.fn_staging('historico') e);
      else
        if v_tabela like 'os\_%' then
          select count(*), coalesce(sum(custo_total), 0) into v_n, v_v from public.ordens_servico
           where origem = 'migracao' and status = substr(v_tabela, 4);
        else
          raise exception 'Conferência sem regra para %', v_tabela;
        end if;
    end case;
    v_relatorio := v_relatorio || jsonb_build_object(v_tabela, case when v_v is null then to_jsonb(v_n) else jsonb_build_array(v_n, v_v) end);
    if v_n <> (v_esp ->> 'n')::bigint or (v_v is not null and v_v <> (v_esp ->> 'v')::numeric) then
      v_erros := v_erros || v_tabela || ': ERP ' || v_n || coalesce(' / ' || v_v, '') || ', origem ' || (v_esp ->> 'n')
                 || coalesce(' / ' || (v_esp ->> 'v'), '') || '; ';
    end if;
  end loop;

  select count(*) into v_n from legado.fn_staging('saldo_esperado') e
    left join public.almoxarifado_saldos s on s.insumo_id = (e ->> 'i')::uuid and s.deposito_id = v_central
   where coalesce(s.saldo, 0) <> (e ->> 's')::numeric;
  v_relatorio := v_relatorio || jsonb_build_object('pecas_com_saldo_diferente', v_n);
  if v_n > 0 then v_erros := v_erros || 'saldo diferente em ' || v_n || ' peças; '; end if;
  select count(*) into v_n from public.almoxarifado_saldos s where s.deposito_id = v_central
     and not exists (select 1 from legado.fn_staging('saldo_esperado') e where (e ->> 'i')::uuid = s.insumo_id);
  if v_n > 0 then v_erros := v_erros || v_n || ' peças no ERP sem saldo na origem; '; end if;

  select count(*) - v_lanc0 into v_n from public.lancamentos;
  v_relatorio := v_relatorio || jsonb_build_object('lancamentos_novos', v_n);
  if v_n <> 0 then v_erros := v_erros || 'a carga criou ' || v_n || ' lançamentos; '; end if;

  if v_erros <> '' then
    raise exception 'Carga não bate com a origem: %', v_erros;
  end if;
  if current_setting('app.carga_ensaio', true) = 'sim' then
    raise exception 'ENSAIO OK, nada gravado: %', v_relatorio;
  end if;
  raise notice 'Carga conferida: %', v_relatorio;
end $carga$;
