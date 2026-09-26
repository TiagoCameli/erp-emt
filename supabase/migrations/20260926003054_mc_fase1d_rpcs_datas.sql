-- Medição de Contratos, Fase 1d, fix round 2: fn_mc_planilha_criar_rascunho recusa com mensagem de
-- negócio quando vigente_desde está ausente/vazio ou não é uma data válida (antes caía direto no
-- not null da coluna, com erro cru do Postgres). fn_mc_restaurar de aditivo ou versão da planilha
-- recusa quando o contrato pai ainda está na lixeira. fn_mc_aditivo_salvar recusa tipos vazio.

create or replace function public.fn_mc_planilha_criar_rascunho(p_contrato uuid, p_dados jsonb)
returns uuid language plpgsql security definer set search_path to '' as $$
declare v_id uuid; v_rascunho int; v_numero int; v_aditivo uuid := nullif(p_dados ->> 'aditivo_id', '')::uuid; v_aditivo_tipos text[];
  v_vigente_desde date;
begin
  perform public.fn_mc_exigir('medicao.planilha', 'criar', p_contrato, 'Sem permissão para importar planilha');
  if nullif(p_dados ->> 'vigente_desde', '') is null then
    raise exception 'Informe a data de início da versão' using errcode = 'P0001';
  end if;
  begin
    v_vigente_desde := (p_dados ->> 'vigente_desde')::date;
  exception when invalid_text_representation then
    raise exception 'Informe a data de início da versão' using errcode = 'P0001';
  end;
  perform pg_advisory_xact_lock(hashtextextended('mc_versao:' || p_contrato::text, 0));
  select numero into v_rascunho from public.mc_planilha_versoes
  where contrato_id = p_contrato and status = 'rascunho' and excluido_em is null;
  if found then
    raise exception 'Já existe a versão % em rascunho. Termine ou exclua antes de começar outra', v_rascunho using errcode = 'P0001';
  end if;
  select coalesce(max(numero) + 1, 0) into v_numero from public.mc_planilha_versoes
  where contrato_id = p_contrato and excluido_em is null;
  if v_numero = 0 and v_aditivo is not null then
    raise exception 'A primeira versão é a planilha licitada: não tem aditivo' using errcode = 'P0001';
  end if;
  if v_numero > 0 and v_aditivo is null then
    raise exception 'A versão % precisa do aditivo que a originou', v_numero using errcode = 'P0001';
  end if;
  if v_aditivo is not null then
    select tipos into v_aditivo_tipos from public.mc_aditivos where id = v_aditivo and contrato_id = p_contrato and excluido_em is null;
    if not found then raise exception 'Aditivo não encontrado' using errcode = 'P0001'; end if;
    if not (v_aditivo_tipos && array['quantidade', 'valor', 'inclusao_item']::text[]) then
      raise exception 'Aditivo só de prazo não muda a planilha' using errcode = 'P0001';
    end if;
    if exists (select 1 from public.mc_planilha_versoes where aditivo_id = v_aditivo and excluido_em is null) then
      raise exception 'Este aditivo já tem versão da planilha' using errcode = 'P0001';
    end if;
  end if;
  insert into public.mc_planilha_versoes (contrato_id, numero, aditivo_id, vigente_desde, motivo)
  values (p_contrato, v_numero, v_aditivo, v_vigente_desde, nullif(btrim(p_dados ->> 'motivo'), ''))
  returning id into v_id;
  return v_id;
end $$;

create or replace function public.fn_mc_aditivo_salvar(p_contrato uuid, p_dados jsonb, p_id uuid default null)
returns uuid language plpgsql security definer set search_path to '' as $$
declare v_id uuid; v_tipos text[];
begin
  perform public.fn_mc_exigir('medicao.contratos', 'editar', p_contrato, 'Sem permissão para registrar aditivo');
  if coalesce(jsonb_typeof(p_dados -> 'tipos'), '') <> 'array' then
    raise exception 'Informe ao menos um tipo do aditivo' using errcode = 'P0001';
  end if;
  v_tipos := array(select jsonb_array_elements_text(p_dados -> 'tipos'));
  if cardinality(v_tipos) = 0 then
    raise exception 'Marque o tipo do aditivo' using errcode = 'P0001';
  end if;
  if p_id is null then
    perform pg_advisory_xact_lock(hashtextextended('mc_aditivo:' || p_contrato::text, 0));
    insert into public.mc_aditivos (contrato_id, numero, data_assinatura, data_vigencia, tipos, prazo_acrescido_meses, motivo)
    values (p_contrato,
      coalesce((select max(numero) from public.mc_aditivos where contrato_id = p_contrato and excluido_em is null), 0) + 1,
      (p_dados ->> 'data_assinatura')::date, (p_dados ->> 'data_vigencia')::date, v_tipos,
      nullif(p_dados ->> 'prazo_acrescido_meses', '')::int, btrim(p_dados ->> 'motivo'))
    returning id into v_id;
    return v_id;
  end if;
  if exists (select 1 from public.mc_planilha_versoes where aditivo_id = p_id and status = 'vigente') then
    raise exception 'O aditivo já tem versão vigente da planilha e não muda mais' using errcode = 'P0001';
  end if;
  update public.mc_aditivos set data_assinatura = (p_dados ->> 'data_assinatura')::date, data_vigencia = (p_dados ->> 'data_vigencia')::date,
    tipos = v_tipos, prazo_acrescido_meses = nullif(p_dados ->> 'prazo_acrescido_meses', '')::int, motivo = btrim(p_dados ->> 'motivo')
  where id = p_id and contrato_id = p_contrato and excluido_em is null;
  if not found then raise exception 'Aditivo não encontrado' using errcode = 'P0001'; end if;
  return p_id;
end $$;

create or replace function public.fn_mc_restaurar(p_tabela text, p_id uuid)
returns void language plpgsql security definer set search_path to '' as $$
declare v_recurso text := public.fn_mc_recurso_da_tabela(p_tabela); v_contrato uuid; v_n int;
begin
  if v_recurso is null then raise exception 'Tabela inválida' using errcode = 'P0001'; end if;
  execute format('select %s from public.%I where id = $1', case when p_tabela = 'mc_contratos' then 'id' else 'contrato_id' end, p_tabela)
    into v_contrato using p_id;
  if not (public.tem_permissao('administracao.lixeira', 'editar') and public.tem_permissao(v_recurso, 'excluir')
          and public.fn_mc_acessa_contrato(v_contrato)) then
    raise exception 'Sem permissão para restaurar' using errcode = 'P0001';
  end if;
  if p_tabela in ('mc_aditivos', 'mc_planilha_versoes')
      and exists (select 1 from public.mc_contratos where id = v_contrato and excluido_em is not null) then
    raise exception 'Restaure o contrato antes' using errcode = 'P0001';
  end if;
  if p_tabela = 'mc_planilha_versoes' and exists (
    select 1 from public.mc_planilha_versoes v join public.mc_aditivos a on a.id = v.aditivo_id
    where v.id = p_id and a.excluido_em is not null
  ) then
    raise exception 'Restaure o aditivo antes' using errcode = 'P0001';
  end if;
  execute format('update public.%I set excluido_em = null, excluido_por = null, motivo_exclusao = null where id = $1 and excluido_em is not null', p_tabela)
    using p_id;
  get diagnostics v_n = row_count;
  if v_n = 0 then raise exception 'Registro não encontrado na lixeira' using errcode = 'P0001'; end if;
end $$;
