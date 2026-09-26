-- Medição de Contratos, Fase 1d, fix round 3: o guard de vigente_desde inválido capturava
-- invalid_text_representation (22P02), que nunca é o erro real de um cast de texto para date.
-- 'abc'::date estoura invalid_datetime_format (22007) e '2026-02-30'::date estoura
-- datetime_field_overflow (22008, dia inexistente no mês). Passa a capturar as duas condições e
-- devolve mensagem de negócio própria, distinta da de valor ausente.

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
  exception when invalid_datetime_format or datetime_field_overflow then
    raise exception 'Data de início da versão inválida' using errcode = 'P0001';
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
