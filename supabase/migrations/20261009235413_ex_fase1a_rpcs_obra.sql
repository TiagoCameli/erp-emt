-- Execução de Obras, Fase 1a: RPCs de obra, cronograma, acesso, locais, serviços e calendário.
-- Toda escrita do módulo passa por aqui (D13). Cada RPC confere a ação E a lista da obra.

create or replace function public.fn_ex_obras_disponiveis()
returns table (obra_id uuid, nome text, tem_pasta boolean, tenho_acesso boolean)
language plpgsql stable security definer set search_path to '' as $$
#variable_conflict use_column
begin
  if not public.tem_permissao('execucao.cronogramas', 'criar') then
    raise exception 'Sem permissão para criar cronograma' using errcode = 'P0001';
  end if;
  return query
  select o.id, o.nome, e.obra_id is not null, public.fn_ex_acessa_obra(o.id)
  from public.obras o left join public.ex_obras e on e.obra_id = o.id
  where o.ativo
  order by o.nome;
end $$;

create or replace function public.fn_ex_obra_nome(p_obra uuid)
returns text language sql stable security definer set search_path to '' as $$
  select o.nome from public.obras o
  where o.id = p_obra and public.fn_ve_execucao() and public.fn_ex_acessa_obra(p_obra);
$$;

-- Recalcula todos os cronogramas vivos que usam o calendário ou um filho dele.
create or replace function public.fn_ex_recalcular_calendario(p_cal uuid)
returns void language plpgsql security definer set search_path to '' as $$
declare v_c uuid;
begin
  for v_c in select k.id from public.ex_cronogramas k join public.ex_calendarios c on c.id = k.calendario_id
             where k.excluido_em is null and (c.id = p_cal or c.pai_id = p_cal) loop
    perform public.fn_ex_cpm_recalcular(v_c);
  end loop;
end $$;

-- Permissão sobre um calendário: modelo é da aba Modelos; o calendário de um cronograma é do cronograma.
create or replace function public.fn_ex_exigir_calendario(p_cal uuid, p_mensagem text)
returns void language plpgsql stable security definer set search_path to '' as $$
declare v_modelo boolean; v_obra uuid;
begin
  select c.modelo into v_modelo from public.ex_calendarios c where c.id = p_cal and c.excluido_em is null;
  if v_modelo is null then raise exception 'Calendário não encontrado' using errcode = 'P0001'; end if;
  if v_modelo then
    perform public.fn_ex_exigir('execucao.modelos', 'editar', null, p_mensagem);
  else
    select k.obra_id into v_obra from public.ex_cronogramas k where k.calendario_id = p_cal and k.excluido_em is null limit 1;
    if v_obra is null then raise exception 'Calendário sem cronograma vivo' using errcode = 'P0001'; end if;
    perform public.fn_ex_exigir('execucao.cronogramas', 'editar', v_obra, p_mensagem);
  end if;
end $$;

create or replace function public.fn_ex_cronograma_salvar(p_dados jsonb, p_id uuid default null)
returns uuid language plpgsql security definer set search_path to '' as $$
declare
  v_obra uuid; v_id uuid; v_modelo uuid; v_cal uuid;
  v_codigo text := upper(btrim(coalesce(p_dados ->> 'codigo', '')));
  v_nome text := btrim(coalesce(p_dados ->> 'nome', ''));
  v_inicio date := nullif(p_dados ->> 'data_inicio', '')::date;
  v_corte date := nullif(p_dados ->> 'data_corte', '')::date;
  v_peso text := coalesce(nullif(p_dados ->> 'criterio_peso', ''), 'duracao');
begin
  if v_codigo !~ '^[A-Z0-9][A-Z0-9-]{0,19}$' then
    raise exception 'Código do cronograma: até 20 letras, números ou hífen, sem espaço' using errcode = 'P0001';
  end if;
  if char_length(v_nome) not between 2 and 160 then raise exception 'Informe o nome do cronograma' using errcode = 'P0001'; end if;
  if v_inicio is null then raise exception 'Informe a data de início do cronograma' using errcode = 'P0001'; end if;
  if v_peso not in ('valor', 'duracao', 'homem_hora', 'manual') then raise exception 'Critério de peso inválido' using errcode = 'P0001'; end if;

  if p_id is null then
    perform public.fn_ex_exigir('execucao.cronogramas', 'criar', null, 'Sem permissão para criar cronograma');
    v_obra := nullif(p_dados ->> 'obra_id', '')::uuid;
    if v_obra is null or not exists (select 1 from public.obras where id = v_obra and ativo) then
      raise exception 'Escolha uma obra ativa do cadastro de Obras' using errcode = 'P0001';
    end if;
    perform pg_advisory_xact_lock(hashtextextended('ex_obra:' || v_obra::text, 0));
    if not exists (select 1 from public.ex_obras where obra_id = v_obra) then
      if coalesce(p_dados ->> 'tipo_obra', '') not in ('edificacao', 'rodovia', 'pequena') then
        raise exception 'Informe o tipo da obra: edificação, rodovia ou obra pequena' using errcode = 'P0001';
      end if;
      insert into public.ex_obras (obra_id, tipo_obra, calendario_id)
      values (v_obra, p_dados ->> 'tipo_obra',
              (select id from public.ex_calendarios where padrao_empresa and excluido_em is null));
      -- Q1 (a): a pasta nasce com quem criou e todos os Admins ativos na lista.
      insert into public.ex_obra_usuarios (obra_id, usuario_id)
      select v_obra, u.id from public.usuarios u left join public.perfis p on p.id = u.perfil_id
      where u.ativo and u.excluido_em is null and (u.id = (select auth.uid()) or p.nome = 'Admin')
      on conflict do nothing;
    elsif not public.fn_ex_acessa_obra(v_obra) then
      raise exception 'Esta obra já tem cronogramas e você não está na lista de acesso dela. Peça para alguém da lista incluir você'
        using errcode = 'P0001';
    end if;
    v_modelo := coalesce(nullif(p_dados ->> 'calendario_modelo_id', '')::uuid,
                         (select calendario_id from public.ex_obras where obra_id = v_obra),
                         (select id from public.ex_calendarios where padrao_empresa and excluido_em is null));
    if not exists (select 1 from public.ex_calendarios where id = v_modelo and modelo and excluido_em is null) then
      raise exception 'Calendário modelo não encontrado' using errcode = 'P0001';
    end if;
    -- Cada cronograma tem o próprio calendário, filho do modelo: herda as exceções do modelo e ganha as dele.
    insert into public.ex_calendarios (nome, pai_id, horas_seg, horas_ter, horas_qua, horas_qui, horas_sex, horas_sab, horas_dom,
      feriados_abrangencia, municipio, chuvoso_inicio_mes, chuvoso_fim_mes)
    select 'Cronograma ' || v_codigo, c.id, c.horas_seg, c.horas_ter, c.horas_qua, c.horas_qui, c.horas_sex, c.horas_sab, c.horas_dom,
           c.feriados_abrangencia, c.municipio, c.chuvoso_inicio_mes, c.chuvoso_fim_mes
    from public.ex_calendarios c where c.id = v_modelo
    returning id into v_cal;
    begin
      insert into public.ex_cronogramas (obra_id, codigo, nome, calendario_id, criterio_peso, data_inicio, data_corte, observacoes)
      values (v_obra, v_codigo, v_nome, v_cal, v_peso, v_inicio, v_corte, nullif(btrim(p_dados ->> 'observacoes'), ''))
      returning id into v_id;
    exception when unique_violation then
      raise exception 'Já existe outro cronograma com o código % nesta obra', v_codigo using errcode = 'P0001';
    end;
  else
    select obra_id into v_obra from public.ex_cronogramas where id = p_id and excluido_em is null;
    if v_obra is null then raise exception 'Cronograma não encontrado' using errcode = 'P0001'; end if;
    perform public.fn_ex_exigir('execucao.cronogramas', 'editar', v_obra, 'Sem permissão para editar cronograma');
    begin
      update public.ex_cronogramas
         set codigo = v_codigo, nome = v_nome, criterio_peso = v_peso, data_inicio = v_inicio, data_corte = v_corte,
             observacoes = nullif(btrim(p_dados ->> 'observacoes'), '')
       where id = p_id;
    exception when unique_violation then
      raise exception 'Já existe outro cronograma com o código % nesta obra', v_codigo using errcode = 'P0001';
    end;
    v_id := p_id;
  end if;
  perform public.fn_ex_cpm_recalcular(v_id);
  return v_id;
end $$;

create or replace function public.fn_ex_cronograma_status(p_id uuid, p_status text)
returns void language plpgsql security definer set search_path to '' as $$
declare v_obra uuid;
begin
  select obra_id into v_obra from public.ex_cronogramas where id = p_id and excluido_em is null;
  if v_obra is null then raise exception 'Cronograma não encontrado' using errcode = 'P0001'; end if;
  perform public.fn_ex_exigir('execucao.cronogramas', 'editar', v_obra, 'Sem permissão para mudar a situação do cronograma');
  if p_status not in ('rascunho', 'ativo', 'concluido', 'arquivado') then
    raise exception 'Situação inválida' using errcode = 'P0001';
  end if;
  update public.ex_cronogramas set status = p_status where id = p_id;
end $$;

create or replace function public.fn_ex_cronograma_excluir(p_id uuid, p_motivo text)
returns void language plpgsql security definer set search_path to '' as $$
declare v_obra uuid;
begin
  select obra_id into v_obra from public.ex_cronogramas where id = p_id and excluido_em is null;
  if v_obra is null then raise exception 'Cronograma não encontrado' using errcode = 'P0001'; end if;
  perform public.fn_ex_exigir('execucao.cronogramas', 'excluir', v_obra, 'Sem permissão para excluir cronograma');
  if btrim(coalesce(p_motivo, '')) = '' then raise exception 'Informe o motivo da exclusão' using errcode = 'P0001'; end if;
  update public.ex_cronogramas set excluido_em = now(), excluido_por = (select auth.uid()), motivo_exclusao = btrim(p_motivo)
  where id = p_id;
end $$;

create or replace function public.fn_ex_cronograma_recalcular(p_id uuid)
returns void language plpgsql security definer set search_path to '' as $$
declare v_obra uuid;
begin
  select obra_id into v_obra from public.ex_cronogramas where id = p_id and excluido_em is null;
  if v_obra is null then raise exception 'Cronograma não encontrado' using errcode = 'P0001'; end if;
  perform public.fn_ex_exigir('execucao.cronogramas', 'editar', v_obra, 'Sem permissão para recalcular o cronograma');
  perform public.fn_ex_cpm_recalcular(p_id);
end $$;

create or replace function public.fn_ex_obra_configurar(p_obra uuid, p_dados jsonb)
returns void language plpgsql security definer set search_path to '' as $$
declare v_tipo text := p_dados ->> 'tipo_obra'; v_cal uuid := nullif(p_dados ->> 'calendario_id', '')::uuid;
begin
  if not exists (select 1 from public.ex_obras where obra_id = p_obra) then raise exception 'Obra sem pasta no módulo' using errcode = 'P0001'; end if;
  perform public.fn_ex_exigir('execucao.cronogramas', 'editar', p_obra, 'Sem permissão para configurar a obra');
  if v_tipo not in ('edificacao', 'rodovia', 'pequena') then raise exception 'Tipo de obra inválido' using errcode = 'P0001'; end if;
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

create or replace function public.fn_ex_acesso_definir(p_obra uuid, p_usuario uuid, p_tem boolean)
returns void language plpgsql security definer set search_path to '' as $$
begin
  perform public.fn_ex_exigir('execucao.cronogramas', 'editar', p_obra, 'Sem permissão para mudar o acesso da obra');
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

create or replace function public.fn_ex_usuarios_da_obra(p_obra uuid)
returns table (usuario_id uuid, nome text, email text, na_lista boolean)
language plpgsql stable security definer set search_path to '' as $$
#variable_conflict use_column
begin
  perform public.fn_ex_exigir('execucao.cronogramas', 'ver', p_obra, 'Sem permissão para ver o acesso da obra');
  return query
  select u.id, u.nome, u.email, exists (select 1 from public.ex_obra_usuarios ou where ou.obra_id = p_obra and ou.usuario_id = u.id)
  from public.usuarios u where u.ativo and u.excluido_em is null
  order by 4 desc, u.nome;
end $$;

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
  select tipo_obra into v_tipo_obra from public.ex_obras where obra_id = p_obra;
  if v_tipo not in ('bloco', 'pavimento', 'ambiente', 'peca', 'segmento', 'outro') then raise exception 'Tipo de local inválido' using errcode = 'P0001'; end if;
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

create or replace function public.fn_ex_local_excluir(p_id uuid, p_motivo text)
returns void language plpgsql security definer set search_path to '' as $$
declare v_obra uuid;
begin
  select obra_id into v_obra from public.ex_locais where id = p_id and excluido_em is null;
  if v_obra is null then raise exception 'Local não encontrado' using errcode = 'P0001'; end if;
  perform public.fn_ex_exigir('execucao.cronogramas', 'excluir', v_obra, 'Sem permissão para excluir local');
  if btrim(coalesce(p_motivo, '')) = '' then raise exception 'Informe o motivo da exclusão' using errcode = 'P0001'; end if;
  if exists (select 1 from public.ex_locais where pai_id = p_id and excluido_em is null) then
    raise exception 'Exclua ou mova antes os locais que estão dentro deste' using errcode = 'P0001';
  end if;
  if exists (select 1 from public.ex_atividade_locais al join public.ex_atividades a on a.id = al.atividade_id
             where al.local_id = p_id and a.excluido_em is null) then
    raise exception 'Há atividades neste local. Tire o local delas antes de excluir' using errcode = 'P0001';
  end if;
  update public.ex_locais set excluido_em = now(), excluido_por = (select auth.uid()), motivo_exclusao = btrim(p_motivo) where id = p_id;
end $$;

create or replace function public.fn_ex_servico_salvar(p_dados jsonb, p_id uuid default null)
returns uuid language plpgsql security definer set search_path to '' as $$
declare v_id uuid; v_codigo text := btrim(coalesce(p_dados ->> 'codigo', '')); v_nome text := btrim(coalesce(p_dados ->> 'nome', ''));
begin
  perform public.fn_ex_exigir('execucao.modelos', case when p_id is null then 'criar' else 'editar' end, null,
    'Sem permissão para cadastrar serviço');
  if v_codigo = '' or char_length(v_codigo) > 30 then raise exception 'Código do serviço: de 1 a 30 caracteres' using errcode = 'P0001'; end if;
  if char_length(v_nome) < 2 then raise exception 'Informe o nome do serviço' using errcode = 'P0001'; end if;
  begin
    if p_id is null then
      insert into public.ex_servicos (codigo, nome, unidade_id, produtividade_padrao, ceu_aberto, ativo, observacoes)
      values (v_codigo, v_nome, nullif(p_dados ->> 'unidade_id', '')::uuid, nullif(p_dados ->> 'produtividade_padrao', '')::numeric,
              coalesce((p_dados ->> 'ceu_aberto')::boolean, false), coalesce((p_dados ->> 'ativo')::boolean, true),
              nullif(btrim(p_dados ->> 'observacoes'), ''))
      returning id into v_id;
    else
      update public.ex_servicos set codigo = v_codigo, nome = v_nome, unidade_id = nullif(p_dados ->> 'unidade_id', '')::uuid,
        produtividade_padrao = nullif(p_dados ->> 'produtividade_padrao', '')::numeric,
        ceu_aberto = coalesce((p_dados ->> 'ceu_aberto')::boolean, false), ativo = coalesce((p_dados ->> 'ativo')::boolean, true),
        observacoes = nullif(btrim(p_dados ->> 'observacoes'), '')
      where id = p_id returning id into v_id;
      if v_id is null then raise exception 'Serviço não encontrado' using errcode = 'P0001'; end if;
    end if;
  exception when unique_violation then
    raise exception 'Já existe um serviço com o código %', v_codigo using errcode = 'P0001';
  end;
  return v_id;
end $$;

create or replace function public.fn_ex_calendario_salvar(p_dados jsonb, p_id uuid default null)
returns uuid language plpgsql security definer set search_path to '' as $$
declare v_id uuid; v_modelo boolean; v_padrao boolean := coalesce((p_dados ->> 'padrao_empresa')::boolean, false);
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
    select modelo into v_modelo from public.ex_calendarios where id = p_id;
  end if;
  if v_padrao and not v_modelo then raise exception 'Só um calendário modelo pode ser o padrão da empresa' using errcode = 'P0001'; end if;
  if v_padrao then
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
  exception when check_violation then
    raise exception 'Calendário inválido: confira o nome (2 a 120 letras), as horas (0 a 24, ao menos um dia com horas) e o período chuvoso (início e fim juntos)'
      using errcode = 'P0001';
  end;
  return v_id;
end $$;

create or replace function public.fn_ex_calendario_excecao_salvar(p_cal uuid, p_data date, p_horas numeric, p_tipo text, p_descricao text)
returns void language plpgsql security definer set search_path to '' as $$
begin
  perform public.fn_ex_exigir_calendario(p_cal, 'Sem permissão para editar este calendário');
  if p_data is null or p_horas is null or p_horas not between 0 and 24 then raise exception 'Informe a data e as horas (0 a 24)' using errcode = 'P0001'; end if;
  if p_tipo not in ('feriado', 'paralisacao', 'extra') then raise exception 'Tipo de exceção inválido' using errcode = 'P0001'; end if;
  if btrim(coalesce(p_descricao, '')) = '' then raise exception 'Descreva a exceção' using errcode = 'P0001'; end if;
  insert into public.ex_calendario_excecoes (calendario_id, data, horas, tipo, descricao)
  values (p_cal, p_data, p_horas, p_tipo, btrim(p_descricao))
  on conflict (calendario_id, data) do update set horas = excluded.horas, tipo = excluded.tipo, descricao = excluded.descricao;
  perform public.fn_ex_recalcular_calendario(p_cal);
end $$;

create or replace function public.fn_ex_recalcular_todos()
returns void language plpgsql security definer set search_path to '' as $$
declare v_c uuid;
begin
  for v_c in select id from public.ex_cronogramas where excluido_em is null loop
    perform public.fn_ex_cpm_recalcular(v_c);
  end loop;
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
  if v_abr not in ('nacional', 'AC', 'municipal') then raise exception 'Abrangência deve ser nacional, AC ou municipal' using errcode = 'P0001'; end if;
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

create or replace function public.fn_ex_feriado_excluir(p_id uuid)
returns void language plpgsql security definer set search_path to '' as $$
begin
  perform public.fn_ex_exigir('execucao.modelos', 'excluir', null, 'Sem permissão para excluir feriado');
  delete from public.ex_feriados where id = p_id;
  if not found then raise exception 'Feriado não encontrado' using errcode = 'P0001'; end if;
  perform public.fn_ex_recalcular_todos();
end $$;

create or replace function public.fn_ex_calendario_excecao_excluir(p_cal uuid, p_data date)
returns void language plpgsql security definer set search_path to '' as $$
begin
  perform public.fn_ex_exigir_calendario(p_cal, 'Sem permissão para editar este calendário');
  delete from public.ex_calendario_excecoes where calendario_id = p_cal and data = p_data;
  perform public.fn_ex_recalcular_calendario(p_cal);
end $$;

do $fn$
declare f text;
begin
  foreach f in array array[
    'fn_ex_obras_disponiveis()', 'fn_ex_obra_nome(uuid)', 'fn_ex_cronograma_salvar(jsonb, uuid)',
    'fn_ex_cronograma_status(uuid, text)', 'fn_ex_cronograma_excluir(uuid, text)', 'fn_ex_cronograma_recalcular(uuid)',
    'fn_ex_obra_configurar(uuid, jsonb)', 'fn_ex_acesso_definir(uuid, uuid, boolean)', 'fn_ex_usuarios_da_obra(uuid)',
    'fn_ex_local_salvar(uuid, jsonb, uuid)', 'fn_ex_local_excluir(uuid, text)', 'fn_ex_servico_salvar(jsonb, uuid)',
    'fn_ex_calendario_salvar(jsonb, uuid)', 'fn_ex_calendario_excecao_salvar(uuid, date, numeric, text, text)',
    'fn_ex_calendario_excecao_excluir(uuid, date)', 'fn_ex_feriado_salvar(jsonb, uuid)', 'fn_ex_feriado_excluir(uuid)'] loop
    execute format('revoke all on function public.%s from public, anon', f);
    execute format('grant execute on function public.%s to authenticated', f);
  end loop;
  foreach f in array array['fn_ex_recalcular_calendario(uuid)', 'fn_ex_exigir_calendario(uuid, text)', 'fn_ex_recalcular_todos()'] loop
    execute format('revoke all on function public.%s from public, anon, authenticated', f);
  end loop;
end $fn$;
