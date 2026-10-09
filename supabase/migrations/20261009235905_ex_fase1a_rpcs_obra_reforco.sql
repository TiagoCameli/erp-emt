-- Execução F1a, reforço das RPCs de obra: padrão da empresa preservado na edição, trava no ciclo de locais,
-- corrida do padrão e entradas nulas com mensagem em pt-BR.

create or replace function public.fn_ex_local_salvar(p_obra uuid, p_dados jsonb, p_id uuid default null)
returns uuid language plpgsql security definer set search_path to '' as $$
declare
  v_id uuid; v_pai uuid := nullif(p_dados ->> 'pai_id', '')::uuid; v_tipo text := p_dados ->> 'tipo';
  v_codigo text := btrim(coalesce(p_dados ->> 'codigo', '')); v_nome text := btrim(coalesce(p_dados ->> 'nome', ''));
  v_kmi numeric := nullif(p_dados ->> 'km_inicial', '')::numeric; v_kmf numeric := nullif(p_dados ->> 'km_final', '')::numeric;
  v_tipo_obra text; v_x uuid; v_passos int := 0;
begin
  perform public.fn_ex_exigir('execucao.cronogramas', case when p_id is null then 'criar' else 'editar' end, p_obra,
    'Sem permissão para cadastrar local');
  perform pg_advisory_xact_lock(hashtextextended('ex_obra:' || p_obra::text, 0));
  select tipo_obra into v_tipo_obra from public.ex_obras where obra_id = p_obra;
  if coalesce(v_tipo, '') not in ('bloco', 'pavimento', 'ambiente', 'peca', 'segmento', 'outro') then raise exception 'Tipo de local inválido' using errcode = 'P0001'; end if;
  if v_codigo = '' or char_length(v_codigo) > 30 then raise exception 'Código do local: de 1 a 30 caracteres' using errcode = 'P0001'; end if;
  if v_nome = '' then raise exception 'Informe o nome do local' using errcode = 'P0001'; end if;
  if (v_kmi is null) <> (v_kmf is null) then raise exception 'Informe km inicial e km final juntos' using errcode = 'P0001'; end if;
  if v_tipo = 'segmento' and v_tipo_obra = 'rodovia' and v_kmi is null then
    raise exception 'Segmento de rodovia precisa de km inicial e km final' using errcode = 'P0001';
  end if;
  if v_pai is not null then
    if not exists (select 1 from public.ex_locais where id = v_pai and obra_id = p_obra and excluido_em is null) then
      raise exception 'Local pai não encontrado nesta obra' using errcode = 'P0001';
    end if;
    -- Sobe a partir do pai: se encontrar o próprio local, fecharia um ciclo.
    v_x := v_pai;
    while v_x is not null and v_passos < 100 loop
      if v_x = p_id then raise exception 'Um local não pode ficar dentro dele mesmo' using errcode = 'P0001'; end if;
      select pai_id into v_x from public.ex_locais where id = v_x;
      v_passos := v_passos + 1;
    end loop;
  end if;
  begin
    if p_id is null then
      insert into public.ex_locais (obra_id, pai_id, tipo, codigo, nome, ordem, km_inicial, km_final, lado, faixa)
      values (p_obra, v_pai, v_tipo, v_codigo, v_nome, coalesce(nullif(p_dados ->> 'ordem', '')::int, 0), v_kmi, v_kmf,
              nullif(p_dados ->> 'lado', ''), nullif(btrim(p_dados ->> 'faixa'), ''))
      returning id into v_id;
    else
      update public.ex_locais set pai_id = v_pai, tipo = v_tipo, codigo = v_codigo, nome = v_nome,
        ordem = coalesce(nullif(p_dados ->> 'ordem', '')::int, ordem), km_inicial = v_kmi, km_final = v_kmf,
        lado = nullif(p_dados ->> 'lado', ''), faixa = nullif(btrim(p_dados ->> 'faixa'), '')
      where id = p_id and obra_id = p_obra and excluido_em is null
      returning id into v_id;
      if v_id is null then raise exception 'Local não encontrado' using errcode = 'P0001'; end if;
    end if;
  exception when unique_violation then
    raise exception 'Já existe outro local com o código % nesta obra', v_codigo using errcode = 'P0001';
  end;
  return v_id;
end $$;

create or replace function public.fn_ex_obra_configurar(p_obra uuid, p_dados jsonb)
returns void language plpgsql security definer set search_path to '' as $$
declare v_tipo text := p_dados ->> 'tipo_obra'; v_cal uuid := nullif(p_dados ->> 'calendario_id', '')::uuid;
begin
  if not exists (select 1 from public.ex_obras where obra_id = p_obra) then raise exception 'Obra sem pasta no módulo' using errcode = 'P0001'; end if;
  perform public.fn_ex_exigir('execucao.cronogramas', 'editar', p_obra, 'Sem permissão para configurar a obra');
  if coalesce(v_tipo, '') not in ('edificacao', 'rodovia', 'pequena') then raise exception 'Tipo de obra inválido' using errcode = 'P0001'; end if;
  if v_cal is not null and not exists (select 1 from public.ex_calendarios where id = v_cal and modelo and excluido_em is null) then
    raise exception 'O calendário padrão da obra precisa ser um calendário modelo' using errcode = 'P0001';
  end if;
  if v_tipo <> 'rodovia' and (nullif(p_dados ->> 'km_inicial', '') is not null or nullif(p_dados ->> 'km_final', '') is not null) then
    raise exception 'Km inicial e final só valem para obra de rodovia' using errcode = 'P0001';
  end if;
  update public.ex_obras set
    tipo_obra = v_tipo, calendario_id = v_cal,
    km_inicial = nullif(p_dados ->> 'km_inicial', '')::numeric, km_final = nullif(p_dados ->> 'km_final', '')::numeric,
    metros_por_estaca = coalesce(nullif(p_dados ->> 'metros_por_estaca', '')::numeric, 20),
    ppc_limite = coalesce(nullif(p_dados ->> 'ppc_limite', '')::numeric, 80),
    observacoes = nullif(btrim(p_dados ->> 'observacoes'), '')
  where obra_id = p_obra;
end $$;

create or replace function public.fn_ex_cronograma_status(p_id uuid, p_status text)
returns void language plpgsql security definer set search_path to '' as $$
declare v_obra uuid;
begin
  select obra_id into v_obra from public.ex_cronogramas where id = p_id and excluido_em is null;
  if v_obra is null then raise exception 'Cronograma não encontrado' using errcode = 'P0001'; end if;
  perform public.fn_ex_exigir('execucao.cronogramas', 'editar', v_obra, 'Sem permissão para mudar a situação do cronograma');
  if coalesce(p_status, '') not in ('rascunho', 'ativo', 'concluido', 'arquivado') then
    raise exception 'Situação inválida' using errcode = 'P0001';
  end if;
  update public.ex_cronogramas set status = p_status where id = p_id;
end $$;

create or replace function public.fn_ex_feriado_salvar(p_dados jsonb, p_id uuid default null)
returns uuid language plpgsql security definer set search_path to '' as $$
declare v_id uuid; v_data date := nullif(p_dados ->> 'data', '')::date; v_nome text := btrim(coalesce(p_dados ->> 'nome', ''));
  v_abr text := p_dados ->> 'abrangencia'; v_mun text := nullif(btrim(p_dados ->> 'municipio'), '');
begin
  perform public.fn_ex_exigir('execucao.modelos', case when p_id is null then 'criar' else 'editar' end, null,
    'Sem permissão para cadastrar feriado');
  if v_data is null then raise exception 'Informe a data do feriado' using errcode = 'P0001'; end if;
  if v_nome = '' then raise exception 'Informe o nome do feriado' using errcode = 'P0001'; end if;
  if coalesce(v_abr, '') not in ('nacional', 'AC', 'municipal') then raise exception 'Abrangência deve ser nacional, AC ou municipal' using errcode = 'P0001'; end if;
  if (v_abr = 'municipal') <> (v_mun is not null) then
    raise exception 'Feriado municipal precisa do município; nacional e estadual não têm município' using errcode = 'P0001';
  end if;
  begin
    if p_id is null then
      insert into public.ex_feriados (data, nome, abrangencia, municipio) values (v_data, v_nome, v_abr, v_mun) returning id into v_id;
    else
      update public.ex_feriados set data = v_data, nome = v_nome, abrangencia = v_abr, municipio = v_mun where id = p_id returning id into v_id;
      if v_id is null then raise exception 'Feriado não encontrado' using errcode = 'P0001'; end if;
    end if;
  exception when unique_violation then
    raise exception 'Já existe feriado com essa abrangência em %', to_char(v_data, 'DD/MM/YYYY') using errcode = 'P0001';
  end;
  perform public.fn_ex_recalcular_todos();
  return v_id;
end $$;

create or replace function public.fn_ex_calendario_excecao_salvar(p_cal uuid, p_data date, p_horas numeric, p_tipo text, p_descricao text)
returns void language plpgsql security definer set search_path to '' as $$
begin
  perform public.fn_ex_exigir_calendario(p_cal, 'Sem permissão para editar este calendário');
  if p_data is null or p_horas is null or p_horas not between 0 and 24 then raise exception 'Informe a data e as horas (0 a 24)' using errcode = 'P0001'; end if;
  if coalesce(p_tipo, '') not in ('feriado', 'paralisacao', 'extra') then raise exception 'Tipo de exceção inválido' using errcode = 'P0001'; end if;
  if btrim(coalesce(p_descricao, '')) = '' then raise exception 'Descreva a exceção' using errcode = 'P0001'; end if;
  insert into public.ex_calendario_excecoes (calendario_id, data, horas, tipo, descricao)
  values (p_cal, p_data, p_horas, p_tipo, btrim(p_descricao))
  on conflict (calendario_id, data) do update set horas = excluded.horas, tipo = excluded.tipo, descricao = excluded.descricao;
  perform public.fn_ex_recalcular_calendario(p_cal);
end $$;

create or replace function public.fn_ex_acesso_definir(p_obra uuid, p_usuario uuid, p_tem boolean)
returns void language plpgsql security definer set search_path to '' as $$
begin
  perform public.fn_ex_exigir('execucao.cronogramas', 'editar', p_obra, 'Sem permissão para mudar o acesso da obra');
  if p_tem is null then raise exception 'Informe se o usuário entra ou sai da lista' using errcode = 'P0001'; end if;
  perform pg_advisory_xact_lock(hashtextextended('ex_obra:' || p_obra::text, 0));
  if p_tem then
    if not exists (select 1 from public.usuarios where id = p_usuario and ativo and excluido_em is null) then
      raise exception 'Usuário não encontrado ou inativo' using errcode = 'P0001';
    end if;
    insert into public.ex_obra_usuarios (obra_id, usuario_id) values (p_obra, p_usuario) on conflict do nothing;
  else
    delete from public.ex_obra_usuarios where obra_id = p_obra and usuario_id = p_usuario;
    if not exists (select 1 from public.ex_obra_usuarios ou join public.usuarios u on u.id = ou.usuario_id
                   where ou.obra_id = p_obra and u.ativo and u.excluido_em is null) then
      raise exception 'A obra não pode ficar sem ninguém na lista' using errcode = 'P0001';
    end if;
  end if;
end $$;

create or replace function public.fn_ex_calendario_salvar(p_dados jsonb, p_id uuid default null)
returns uuid language plpgsql security definer set search_path to '' as $$
declare v_id uuid; v_modelo boolean; v_atual boolean; v_padrao boolean;
  -- Sem a chave, vale nacional + AC; com a chave (mesmo vazia), vale o que veio.
  v_abr text[] := case when p_dados ? 'feriados_abrangencia'
                       then array(select jsonb_array_elements_text(p_dados -> 'feriados_abrangencia'))
                       else array['nacional', 'AC'] end;
begin
  if p_id is null then
    perform public.fn_ex_exigir('execucao.modelos', 'criar', null, 'Sem permissão para criar calendário');
    v_modelo := true;
  else
    perform public.fn_ex_exigir_calendario(p_id, 'Sem permissão para editar este calendário');
    select modelo, padrao_empresa into v_modelo, v_atual from public.ex_calendarios where id = p_id;
  end if;
  if btrim(coalesce(p_dados ->> 'nome', '')) = '' then raise exception 'Informe o nome do calendário' using errcode = 'P0001'; end if;
  -- Na edição, sem a chave o padrão guardado continua valendo; na criação o padrão é falso.
  v_padrao := case when p_dados ? 'padrao_empresa' then coalesce((p_dados ->> 'padrao_empresa')::boolean, false)
                   else coalesce(v_atual, false) end;
  if p_id is not null and v_atual and not v_padrao then
    raise exception 'Escolha outro calendário como padrão da empresa antes de tirar este' using errcode = 'P0001';
  end if;
  if v_padrao and not v_modelo then raise exception 'Só um calendário modelo pode ser o padrão da empresa' using errcode = 'P0001'; end if;
  if v_padrao and not coalesce(v_atual, false) then
    perform pg_advisory_xact_lock(hashtextextended('ex_calendario_padrao', 0));
    update public.ex_calendarios set padrao_empresa = false where padrao_empresa and id is distinct from p_id;
  end if;
  begin
    if p_id is null then
      insert into public.ex_calendarios (nome, modelo, padrao_empresa, horas_seg, horas_ter, horas_qua, horas_qui, horas_sex,
        horas_sab, horas_dom, feriados_abrangencia, municipio, chuvoso_inicio_mes, chuvoso_fim_mes, observacoes)
      values (btrim(p_dados ->> 'nome'), true, v_padrao,
        coalesce((p_dados ->> 'horas_seg')::numeric, 0), coalesce((p_dados ->> 'horas_ter')::numeric, 0),
        coalesce((p_dados ->> 'horas_qua')::numeric, 0), coalesce((p_dados ->> 'horas_qui')::numeric, 0),
        coalesce((p_dados ->> 'horas_sex')::numeric, 0), coalesce((p_dados ->> 'horas_sab')::numeric, 0),
        coalesce((p_dados ->> 'horas_dom')::numeric, 0), v_abr, nullif(btrim(p_dados ->> 'municipio'), ''),
        nullif(p_dados ->> 'chuvoso_inicio_mes', '')::smallint, nullif(p_dados ->> 'chuvoso_fim_mes', '')::smallint,
        nullif(btrim(p_dados ->> 'observacoes'), ''))
      returning id into v_id;
    else
      update public.ex_calendarios set nome = btrim(p_dados ->> 'nome'), padrao_empresa = v_padrao,
        horas_seg = coalesce((p_dados ->> 'horas_seg')::numeric, 0), horas_ter = coalesce((p_dados ->> 'horas_ter')::numeric, 0),
        horas_qua = coalesce((p_dados ->> 'horas_qua')::numeric, 0), horas_qui = coalesce((p_dados ->> 'horas_qui')::numeric, 0),
        horas_sex = coalesce((p_dados ->> 'horas_sex')::numeric, 0), horas_sab = coalesce((p_dados ->> 'horas_sab')::numeric, 0),
        horas_dom = coalesce((p_dados ->> 'horas_dom')::numeric, 0), feriados_abrangencia = v_abr,
        municipio = nullif(btrim(p_dados ->> 'municipio'), ''),
        chuvoso_inicio_mes = nullif(p_dados ->> 'chuvoso_inicio_mes', '')::smallint,
        chuvoso_fim_mes = nullif(p_dados ->> 'chuvoso_fim_mes', '')::smallint,
        observacoes = nullif(btrim(p_dados ->> 'observacoes'), '')
      where id = p_id returning id into v_id;
      perform public.fn_ex_recalcular_calendario(v_id);
    end if;
  exception when unique_violation then
    raise exception 'Outro calendário acabou de virar o padrão da empresa. Tente de novo' using errcode = 'P0001';
  when check_violation then
    raise exception 'Calendário inválido: confira o nome (2 a 120 letras), as horas (0 a 24, ao menos um dia com horas) e o período chuvoso (início e fim juntos)'
      using errcode = 'P0001';
  end;
  return v_id;
end $$;
