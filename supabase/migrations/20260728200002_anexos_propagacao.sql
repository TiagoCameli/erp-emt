-- Propagacao de anexos por REFERENCIA (nunca copia de binario) e o ciclo de
-- vida do arquivo orfao.

-- Dedup: definer porque um arquivo identico pode ter vinculo em documento que
-- ESTE usuario nao ve, e sem isso o dedup falharia calado. Devolve so o id.
create or replace function public.fn_arquivo_por_hash(p_hash text, p_tamanho bigint)
returns uuid language sql stable security definer set search_path to '' as $function$
  select a.id from public.arquivos a
  where p_hash is not null and a.hash_sha256 = p_hash and a.tamanho_bytes = p_tamanho
  limit 1;
$function$;
revoke all on function public.fn_arquivo_por_hash(text, bigint) from public;
revoke all on function public.fn_arquivo_por_hash(text, bigint) from anon;
grant execute on function public.fn_arquivo_por_hash(text, bigint) to authenticated;

create or replace function public.fn_vincular_arquivo(
  p_arquivo_id uuid, p_entidade_tipo text, p_entidade_id uuid, p_nome_exibicao text default null
) returns uuid language plpgsql security definer set search_path to '' as $function$
declare v_recurso text; v_vinculo uuid;
begin
  v_recurso := public.fn_recurso_da_entidade(p_entidade_tipo);
  if v_recurso is null then raise exception 'Tipo de entidade sem anexos: %', p_entidade_tipo; end if;
  if not (public.tem_permissao(v_recurso, 'editar') or public.tem_permissao(v_recurso, 'criar')) then
    raise exception 'Sem permissao para anexar neste documento';
  end if;
  if not exists (select 1 from public.arquivos where id = p_arquivo_id) then
    raise exception 'Arquivo nao encontrado';
  end if;

  insert into public.anexo_vinculos (arquivo_id, entidade_tipo, entidade_id, origem, nome_exibicao)
  values (p_arquivo_id, p_entidade_tipo, p_entidade_id, 'upload_direto', p_nome_exibicao)
  on conflict (arquivo_id, entidade_tipo, entidade_id) do update
    set nome_exibicao = coalesce(excluded.nome_exibicao, public.anexo_vinculos.nome_exibicao)
  returning id into v_vinculo;

  -- Arquivo voltou a ter dono: sai da fila da faxina.
  update public.arquivos set orfao_em = null where id = p_arquivo_id and orfao_em is not null;
  return v_vinculo;
end; $function$;
revoke all on function public.fn_vincular_arquivo(uuid, text, uuid, text) from public;
revoke all on function public.fn_vincular_arquivo(uuid, text, uuid, text) from anon;
grant execute on function public.fn_vincular_arquivo(uuid, text, uuid, text) to authenticated;

create or replace function public.fn_registrar_arquivo(
  p_path text, p_nome text, p_mime text, p_tamanho bigint, p_hash text,
  p_entidade_tipo text, p_entidade_id uuid
) returns uuid language plpgsql security definer set search_path to '' as $function$
declare v_recurso text; v_arquivo uuid;
begin
  v_recurso := public.fn_recurso_da_entidade(p_entidade_tipo);
  if v_recurso is null then raise exception 'Tipo de entidade sem anexos: %', p_entidade_tipo; end if;
  if not (public.tem_permissao(v_recurso, 'editar') or public.tem_permissao(v_recurso, 'criar')) then
    raise exception 'Sem permissao para anexar neste documento';
  end if;

  -- Corrida de dedup: o unique por (hash, tamanho) decide, quem perde reusa.
  insert into public.arquivos (path_storage, nome_original, tipo_mime, tamanho_bytes, hash_sha256)
  values (p_path, p_nome, nullif(p_mime, ''), p_tamanho, nullif(p_hash, ''))
  on conflict (hash_sha256, tamanho_bytes) do nothing
  returning id into v_arquivo;

  if v_arquivo is null then
    select id into v_arquivo from public.arquivos
    where hash_sha256 = nullif(p_hash, '') and tamanho_bytes = p_tamanho limit 1;
  end if;
  if v_arquivo is null then raise exception 'Nao foi possivel registrar o arquivo'; end if;

  perform public.fn_vincular_arquivo(v_arquivo, p_entidade_tipo, p_entidade_id, p_nome);
  return v_arquivo;
end; $function$;
revoke all on function public.fn_registrar_arquivo(text, text, text, bigint, text, text, uuid) from public;
revoke all on function public.fn_registrar_arquivo(text, text, text, bigint, text, text, uuid) from anon;
grant execute on function public.fn_registrar_arquivo(text, text, text, bigint, text, text, uuid) to authenticated;

-- Remove o VINCULO, nunca o arquivo. Decisao do Tiago: quem tem 'editar'
-- remove, mesmo de documento fechado; a auditoria grava quem foi.
create or replace function public.fn_desvincular_arquivo(p_vinculo_id uuid)
returns void language plpgsql security definer set search_path to '' as $function$
declare v_tipo text; v_recurso text;
begin
  select entidade_tipo into v_tipo from public.anexo_vinculos where id = p_vinculo_id;
  if v_tipo is null then raise exception 'Anexo nao encontrado neste documento'; end if;
  v_recurso := public.fn_recurso_da_entidade(v_tipo);
  if not public.tem_permissao(v_recurso, 'editar') then
    raise exception 'Sem permissao para remover anexo deste documento';
  end if;
  delete from public.anexo_vinculos where id = p_vinculo_id;
end; $function$;
revoke all on function public.fn_desvincular_arquivo(uuid) from public;
revoke all on function public.fn_desvincular_arquivo(uuid) from anon;
grant execute on function public.fn_desvincular_arquivo(uuid) to authenticated;

-- Sem checagem de permissao: chamada de DENTRO de funcoes que ja checaram.
create or replace function public.fn_propagar_anexos(
  p_de_tipo text, p_de_id uuid, p_para_tipo text, p_para_id uuid
) returns int language plpgsql security definer set search_path to '' as $function$
declare v_criados int;
begin
  if p_de_id is null or p_para_id is null then return 0; end if;

  insert into public.anexo_vinculos (
    arquivo_id, entidade_tipo, entidade_id, origem, vinculo_origem_id, nome_exibicao, created_by
  )
  select v.arquivo_id, p_para_tipo, p_para_id, 'propagado', v.id, v.nome_exibicao,
         coalesce((select auth.uid()), v.created_by)
  from public.anexo_vinculos v
  where v.entidade_tipo = p_de_tipo and v.entidade_id = p_de_id
  on conflict (arquivo_id, entidade_tipo, entidade_id) do nothing;
  get diagnostics v_criados = row_count;

  update public.arquivos a set orfao_em = null
  where a.orfao_em is not null
    and exists (select 1 from public.anexo_vinculos v
                where v.arquivo_id = a.id and v.entidade_tipo = p_para_tipo and v.entidade_id = p_para_id);
  return v_criados;
end; $function$;
revoke all on function public.fn_propagar_anexos(text, uuid, text, uuid) from public;
revoke all on function public.fn_propagar_anexos(text, uuid, text, uuid) from anon;
revoke all on function public.fn_propagar_anexos(text, uuid, text, uuid) from authenticated;

-- Cascata para frente: anexo novo desce a cadeia que JA existe.
create or replace function public.fn_cascata_anexos()
returns trigger language plpgsql security definer set search_path to '' as $function$
declare v_alvo record;
begin
  if pg_trigger_depth() > 4 then return null; end if;

  if new.entidade_tipo = 'cotacao' then
    for v_alvo in select id from public.ordens_compra where cotacao_id = new.entidade_id loop
      perform public.fn_propagar_anexos('cotacao', new.entidade_id, 'ordem_compra', v_alvo.id);
    end loop;
  elsif new.entidade_tipo = 'ordem_compra' then
    for v_alvo in select id from public.lancamentos where origem = 'oc' and origem_id = new.entidade_id loop
      perform public.fn_propagar_anexos('ordem_compra', new.entidade_id, 'lancamento', v_alvo.id);
    end loop;
  elsif new.entidade_tipo = 'lancamento' then
    -- Pagamento e a parcela PAGA: parcela pendente ainda nao e um pagamento.
    for v_alvo in select id from public.lancamento_parcelas
                  where lancamento_id = new.entidade_id and status = 'pago' loop
      perform public.fn_propagar_anexos('lancamento', new.entidade_id, 'pagamento', v_alvo.id);
    end loop;
  end if;
  return null;
end; $function$;

drop trigger if exists trg_cascata_anexos on public.anexo_vinculos;
create trigger trg_cascata_anexos after insert on public.anexo_vinculos
  for each row execute function public.fn_cascata_anexos();

create or replace function public.fn_marcar_arquivo_orfao()
returns trigger language plpgsql security definer set search_path to '' as $function$
begin
  update public.arquivos a set orfao_em = now()
  where a.id = old.arquivo_id
    and not exists (select 1 from public.anexo_vinculos v where v.arquivo_id = a.id);
  return null;
end; $function$;

drop trigger if exists trg_marcar_arquivo_orfao on public.anexo_vinculos;
create trigger trg_marcar_arquivo_orfao after delete on public.anexo_vinculos
  for each row execute function public.fn_marcar_arquivo_orfao();

create or replace function public.fn_arquivos_orfaos(p_carencia_horas int default 24)
returns table (id uuid, path_storage text, orfao_em timestamptz)
language sql stable security definer set search_path to '' as $function$
  select a.id, a.path_storage, a.orfao_em from public.arquivos a
  where a.orfao_em is not null
    and a.orfao_em < now() - make_interval(hours => p_carencia_horas)
    and not exists (select 1 from public.anexo_vinculos v where v.arquivo_id = a.id)
  order by a.orfao_em;
$function$;
revoke all on function public.fn_arquivos_orfaos(int) from public;
revoke all on function public.fn_arquivos_orfaos(int) from anon;
revoke all on function public.fn_arquivos_orfaos(int) from authenticated;

-- Apaga a linha so se AINDA estiver orfa e fora da carencia, travando a linha
-- para nao competir com uma propagacao.
create or replace function public.fn_apagar_arquivo_orfao(p_arquivo_id uuid, p_carencia_horas int default 24)
returns boolean language plpgsql security definer set search_path to '' as $function$
declare v_orfao_em timestamptz;
begin
  select orfao_em into v_orfao_em from public.arquivos where id = p_arquivo_id for update;
  if v_orfao_em is null then return false; end if;
  if v_orfao_em >= now() - make_interval(hours => p_carencia_horas) then return false; end if;
  if exists (select 1 from public.anexo_vinculos v where v.arquivo_id = p_arquivo_id) then return false; end if;
  delete from public.arquivos where id = p_arquivo_id;
  return true;
end; $function$;
revoke all on function public.fn_apagar_arquivo_orfao(uuid, int) from public;
revoke all on function public.fn_apagar_arquivo_orfao(uuid, int) from anon;
revoke all on function public.fn_apagar_arquivo_orfao(uuid, int) from authenticated;

-- Engancha na criacao da OC: OC vinda de cotacao herda os anexos dela.
-- (corpo identico ao vigente + a linha de propagacao no fim)
create or replace function public.fn_criar_ordem_compra(p_cabecalho jsonb, p_itens jsonb)
returns uuid language plpgsql security definer set search_path to '' as $function$
declare v_oc_id uuid; v_total numeric(14, 2); v_qtd_itens int; v_cotacao uuid;
begin
  if not public.tem_permissao('compras.ordens', 'criar') then
    raise exception 'Sem permissao para criar ordens de compra';
  end if;
  select count(*) into v_qtd_itens from jsonb_array_elements(p_itens);
  if v_qtd_itens = 0 then raise exception 'Adicione ao menos um item a ordem de compra'; end if;
  select coalesce(sum(((item ->> 'quantidade')::numeric(14, 3)) * ((item ->> 'preco_unitario')::numeric(14, 2))), 0)
  into v_total from jsonb_array_elements(p_itens) as item;

  v_cotacao := nullif(p_cabecalho ->> 'cotacao_id', '')::uuid;

  perform set_config('oc.recalc_suprimido', '1', true);
  insert into public.ordens_compra (
    fornecedor_id, condicao_pagamento_id, forma_pagamento_id, cotacao_id,
    data_emissao, observacoes, status, valor_total
  ) values (
    (p_cabecalho ->> 'fornecedor_id')::uuid,
    (p_cabecalho ->> 'condicao_pagamento_id')::uuid,
    nullif(p_cabecalho ->> 'forma_pagamento_id', '')::uuid,
    v_cotacao,
    (p_cabecalho ->> 'data_emissao')::date,
    nullif(p_cabecalho ->> 'observacoes', ''),
    'rascunho', v_total
  ) returning id into v_oc_id;
  insert into public.oc_itens (ordem_compra_id, insumo_id, quantidade, preco_unitario, centro_custo_id)
  select v_oc_id, (item ->> 'insumo_id')::uuid, (item ->> 'quantidade')::numeric,
         (item ->> 'preco_unitario')::numeric, (item ->> 'centro_custo_id')::uuid
  from jsonb_array_elements(p_itens) as item;
  perform set_config('oc.recalc_suprimido', '0', true);

  if v_cotacao is not null then
    perform public.fn_propagar_anexos('cotacao', v_cotacao, 'ordem_compra', v_oc_id);
  end if;
  return v_oc_id;
end; $function$;
