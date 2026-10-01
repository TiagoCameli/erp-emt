-- Medição de Contratos: período da medição informado à mão, por contrato (pedido de 30/09/2026 para a
-- Obra 012, que mede do dia 1 ao último dia do mês, mas às vezes vários meses numa medição só).
-- Aditivo: coluna nova com padrão false; as duas funções são recriadas a partir da definição em uso,
-- só com o campo novo. As regras de abrir medição não mudam (fim >= início, depois da última).

alter table public.mc_contratos add column periodo_manual boolean not null default false;

create or replace function public.fn_mc_contrato_salvar(p_dados jsonb, p_id uuid default null)
returns uuid language plpgsql security definer set search_path to '' as $$
declare v_id uuid; v_uid uuid := (select auth.uid());
begin
  if p_id is null then
    perform public.fn_mc_exigir('medicao.contratos', 'criar', null, 'Sem permissão para cadastrar contrato');
  else
    perform public.fn_mc_exigir('medicao.contratos', 'editar', p_id, 'Sem permissão para editar contrato');
  end if;
  if p_id is null then
    insert into public.mc_contratos (codigo, nome_obra, local, objeto, numero_contrato, contratante_nome, contratante_tipo,
      contratante_documento, valor_inicial, data_assinatura, data_ordem_servico, prazo_meses, inicio_prazo, dia_inicio_periodo,
      tipo_localizacao, regra_arredondamento, alerta_prazo_dias, alerta_valor_pct, status, observacoes, periodo_manual, created_by)
    values (upper(btrim(p_dados ->> 'codigo')), btrim(p_dados ->> 'nome_obra'), nullif(btrim(p_dados ->> 'local'), ''),
      btrim(p_dados ->> 'objeto'), btrim(p_dados ->> 'numero_contrato'), btrim(p_dados ->> 'contratante_nome'),
      p_dados ->> 'contratante_tipo', nullif(btrim(p_dados ->> 'contratante_documento'), ''), (p_dados ->> 'valor_inicial')::numeric,
      (p_dados ->> 'data_assinatura')::date, nullif(p_dados ->> 'data_ordem_servico', '')::date, (p_dados ->> 'prazo_meses')::int,
      coalesce(nullif(p_dados ->> 'inicio_prazo', ''), 'assinatura'), coalesce((p_dados ->> 'dia_inicio_periodo')::smallint, 1),
      coalesce(nullif(p_dados ->> 'tipo_localizacao', ''), 'texto'), nullif(p_dados ->> 'regra_arredondamento', ''),
      coalesce((p_dados ->> 'alerta_prazo_dias')::int, 90), coalesce((p_dados ->> 'alerta_valor_pct')::numeric, 90),
      coalesce(nullif(p_dados ->> 'status', ''), 'ativo'), nullif(btrim(p_dados ->> 'observacoes'), ''),
      coalesce((p_dados ->> 'periodo_manual')::boolean, false), v_uid)
    returning id into v_id;
    -- Sem isto o contrato nasceria invisível para quem o criou (D3).
    insert into public.mc_contrato_usuarios (contrato_id, usuario_id, created_by) values (v_id, v_uid, v_uid);
    insert into public.mc_reajuste_config (contrato_id) values (v_id);
    return v_id;
  end if;
  update public.mc_contratos set
    codigo = upper(btrim(p_dados ->> 'codigo')), nome_obra = btrim(p_dados ->> 'nome_obra'), local = nullif(btrim(p_dados ->> 'local'), ''),
    objeto = btrim(p_dados ->> 'objeto'), numero_contrato = btrim(p_dados ->> 'numero_contrato'),
    contratante_nome = btrim(p_dados ->> 'contratante_nome'), contratante_tipo = p_dados ->> 'contratante_tipo',
    contratante_documento = nullif(btrim(p_dados ->> 'contratante_documento'), ''), valor_inicial = (p_dados ->> 'valor_inicial')::numeric,
    data_assinatura = (p_dados ->> 'data_assinatura')::date, data_ordem_servico = nullif(p_dados ->> 'data_ordem_servico', '')::date,
    prazo_meses = (p_dados ->> 'prazo_meses')::int, inicio_prazo = coalesce(nullif(p_dados ->> 'inicio_prazo', ''), 'assinatura'),
    dia_inicio_periodo = coalesce((p_dados ->> 'dia_inicio_periodo')::smallint, 1),
    tipo_localizacao = coalesce(nullif(p_dados ->> 'tipo_localizacao', ''), 'texto'),
    regra_arredondamento = nullif(p_dados ->> 'regra_arredondamento', ''),
    alerta_prazo_dias = coalesce((p_dados ->> 'alerta_prazo_dias')::int, 90), alerta_valor_pct = coalesce((p_dados ->> 'alerta_valor_pct')::numeric, 90),
    status = coalesce(nullif(p_dados ->> 'status', ''), 'ativo'), observacoes = nullif(btrim(p_dados ->> 'observacoes'), ''),
    periodo_manual = coalesce((p_dados ->> 'periodo_manual')::boolean, periodo_manual)
  where id = p_id and excluido_em is null;
  if not found then raise exception 'Contrato não encontrado' using errcode = 'P0001'; end if;
  return p_id;
end $$;

create or replace function public.fn_mc_medicao_sugestao(p_contrato uuid)
returns jsonb language plpgsql stable security definer set search_path to '' as $$
declare v_c public.mc_contratos%rowtype; v_ultimo date; v_ini date; v_corte date; v_num int; v_versao int;
begin
  perform public.fn_mc_exigir('medicao.medicoes', 'criar', p_contrato, 'Sem permissão para abrir medição');
  select * into v_c from public.mc_contratos where id = p_contrato and excluido_em is null;
  if not found then raise exception 'Contrato não encontrado' using errcode = 'P0001'; end if;
  select max(periodo_fim), coalesce(max(numero), 0) + 1 into v_ultimo, v_num from public.mc_medicoes where contrato_id = p_contrato;
  v_ini := coalesce(v_ultimo + 1, v_c.data_ordem_servico, v_c.data_assinatura);
  v_corte := make_date(extract(year from v_ini)::int, extract(month from v_ini)::int, v_c.dia_inicio_periodo);
  if v_corte <= v_ini then v_corte := (v_corte + interval '1 month')::date; end if;
  select numero into v_versao from public.mc_planilha_versoes
   where contrato_id = p_contrato and status = 'vigente' and excluido_em is null order by numero desc limit 1;
  -- Período manual (contrato que mede vários meses de uma vez): não sugere datas, só diz depois de quando começa.
  if v_c.periodo_manual then
    return jsonb_build_object('numero', v_num, 'periodo_inicio', null, 'periodo_fim', null,
      'versao_numero', v_versao, 'depois_de', v_ultimo, 'periodo_manual', true);
  end if;
  return jsonb_build_object('numero', v_num, 'periodo_inicio', v_ini, 'periodo_fim', v_corte - 1,
    'versao_numero', v_versao, 'depois_de', v_ultimo, 'periodo_manual', false);
end $$;
