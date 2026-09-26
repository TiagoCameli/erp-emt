-- Medição de Contratos, Fase 1d: as RPCs de escrita da Fase 1. Toda RPC confere a ação no recurso
-- E o acesso ao contrato (spec 4.2). Números da planilha chegam como texto e viram numeric sem
-- passar por float.

create or replace function public.fn_mc_exigir(p_recurso text, p_acao text, p_contrato uuid, p_mensagem text)
returns void language plpgsql stable security definer set search_path to '' as $$
begin
  if not public.tem_permissao(p_recurso, p_acao) then raise exception '%', p_mensagem using errcode = 'P0001'; end if;
  if p_contrato is not null and not public.fn_mc_acessa_contrato(p_contrato) then
    raise exception 'Contrato não encontrado' using errcode = 'P0001';
  end if;
end $$;

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
      tipo_localizacao, regra_arredondamento, alerta_prazo_dias, alerta_valor_pct, status, observacoes, created_by)
    values (upper(btrim(p_dados ->> 'codigo')), btrim(p_dados ->> 'nome_obra'), nullif(btrim(p_dados ->> 'local'), ''),
      btrim(p_dados ->> 'objeto'), btrim(p_dados ->> 'numero_contrato'), btrim(p_dados ->> 'contratante_nome'),
      p_dados ->> 'contratante_tipo', nullif(btrim(p_dados ->> 'contratante_documento'), ''), (p_dados ->> 'valor_inicial')::numeric,
      (p_dados ->> 'data_assinatura')::date, nullif(p_dados ->> 'data_ordem_servico', '')::date, (p_dados ->> 'prazo_meses')::int,
      coalesce(nullif(p_dados ->> 'inicio_prazo', ''), 'assinatura'), coalesce((p_dados ->> 'dia_inicio_periodo')::smallint, 1),
      coalesce(nullif(p_dados ->> 'tipo_localizacao', ''), 'texto'), nullif(p_dados ->> 'regra_arredondamento', ''),
      coalesce((p_dados ->> 'alerta_prazo_dias')::int, 90), coalesce((p_dados ->> 'alerta_valor_pct')::numeric, 90),
      coalesce(nullif(p_dados ->> 'status', ''), 'ativo'), nullif(btrim(p_dados ->> 'observacoes'), ''), v_uid)
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
    status = coalesce(nullif(p_dados ->> 'status', ''), 'ativo'), observacoes = nullif(btrim(p_dados ->> 'observacoes'), '')
  where id = p_id and excluido_em is null;
  if not found then raise exception 'Contrato não encontrado' using errcode = 'P0001'; end if;
  return p_id;
end $$;

create or replace function public.fn_mc_acesso_definir(p_contrato uuid, p_usuario uuid, p_tem boolean)
returns void language plpgsql security definer set search_path to '' as $$
declare v_restantes int;
begin
  perform public.fn_mc_exigir('medicao.contratos', 'editar', p_contrato, 'Sem permissão para mudar o acesso deste contrato');
  perform pg_advisory_xact_lock(hashtextextended('mc_acesso:' || p_contrato::text, 0));
  if p_tem then
    if not exists (select 1 from public.usuarios where id = p_usuario and ativo and excluido_em is null) then
      raise exception 'Usuário inativo ou inexistente' using errcode = 'P0001';
    end if;
    insert into public.mc_contrato_usuarios (contrato_id, usuario_id, created_by)
    values (p_contrato, p_usuario, (select auth.uid())) on conflict do nothing;
    return;
  end if;
  delete from public.mc_contrato_usuarios where contrato_id = p_contrato and usuario_id = p_usuario;
  select count(*) into v_restantes from public.mc_contrato_usuarios cu join public.usuarios u on u.id = cu.usuario_id
  where cu.contrato_id = p_contrato and u.ativo and u.excluido_em is null;
  if v_restantes = 0 then raise exception 'O contrato ficaria sem ninguém ativo com acesso' using errcode = 'P0001'; end if;
end $$;

create or replace function public.fn_mc_usuarios_do_contrato(p_contrato uuid)
returns table (usuario_id uuid, nome text, email text, ativo boolean)
language plpgsql stable security definer set search_path to '' as $$
begin
  if not (public.fn_ve_medicao() and public.fn_mc_acessa_contrato(p_contrato)) then return; end if;
  return query select u.id, u.nome, u.email, (u.ativo and u.excluido_em is null)
  from public.mc_contrato_usuarios cu join public.usuarios u on u.id = cu.usuario_id
  where cu.contrato_id = p_contrato order by u.nome;
end $$;

create or replace function public.fn_mc_usuarios_ativos()
returns table (id uuid, nome text, email text)
language plpgsql stable security definer set search_path to '' as $$
begin
  if not public.tem_permissao('medicao.contratos', 'editar') then return; end if;
  return query select u.id, u.nome, u.email from public.usuarios u where u.ativo and u.excluido_em is null order by u.nome;
end $$;

create or replace function public.fn_mc_aditivo_salvar(p_contrato uuid, p_dados jsonb, p_id uuid default null)
returns uuid language plpgsql security definer set search_path to '' as $$
declare v_id uuid; v_tipos text[] := array(select jsonb_array_elements_text(p_dados -> 'tipos'));
begin
  perform public.fn_mc_exigir('medicao.contratos', 'editar', p_contrato, 'Sem permissão para registrar aditivo');
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

create or replace function public.fn_mc_planilha_criar_rascunho(p_contrato uuid, p_dados jsonb)
returns uuid language plpgsql security definer set search_path to '' as $$
declare v_id uuid; v_rascunho int; v_numero int; v_aditivo uuid := nullif(p_dados ->> 'aditivo_id', '')::uuid;
begin
  perform public.fn_mc_exigir('medicao.planilha', 'criar', p_contrato, 'Sem permissão para importar planilha');
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
  if v_aditivo is not null and exists (select 1 from public.mc_planilha_versoes where aditivo_id = v_aditivo and excluido_em is null) then
    raise exception 'Este aditivo já tem versão da planilha' using errcode = 'P0001';
  end if;
  insert into public.mc_planilha_versoes (contrato_id, numero, aditivo_id, vigente_desde, motivo)
  values (p_contrato, v_numero, v_aditivo, (p_dados ->> 'vigente_desde')::date, nullif(btrim(p_dados ->> 'motivo'), ''))
  returning id into v_id;
  return v_id;
end $$;

-- Grava (ou regrava) as linhas do rascunho. Regravar substitui: apaga as linhas e os itens que só
-- existiam nelas, e insere de novo. Pai vem por pai_ordem, que precisa ser uma linha anterior.
create or replace function public.fn_mc_planilha_gravar_linhas(p_versao uuid, p_linhas jsonb, p_arquivo_nome text, p_arquivo_hash text)
returns integer language plpgsql security definer set search_path to '' as $$
declare v record; l jsonb; v_item uuid; v_pai uuid; v_n int := 0; v_ordem int; v_antigos uuid[];
begin
  select id, contrato_id, status, numero into v from public.mc_planilha_versoes where id = p_versao and excluido_em is null;
  if not found then raise exception 'Versão não encontrada' using errcode = 'P0001'; end if;
  perform public.fn_mc_exigir('medicao.planilha', 'criar', v.contrato_id, 'Sem permissão para importar planilha');
  if v.status <> 'rascunho' then raise exception 'A versão % não está em rascunho', v.numero using errcode = 'P0001'; end if;
  if jsonb_typeof(p_linhas) <> 'array' or jsonb_array_length(p_linhas) = 0 then
    raise exception 'A planilha não tem linhas' using errcode = 'P0001';
  end if;
  perform pg_advisory_xact_lock(hashtextextended('mc_versao:' || v.contrato_id::text, 0));

  -- Sem tabela temporária: a segunda gravação na mesma transação (reenvio) quebraria no create.
  -- O delete de todas as linhas num comando só não esbarra na FK do pai (NO ACTION confere no fim).
  select coalesce(array_agg(item_id), '{}') into v_antigos from public.mc_planilha_itens where versao_id = p_versao;
  delete from public.mc_planilha_itens where versao_id = p_versao;
  delete from public.mc_itens i
  where i.id = any(v_antigos) and not exists (select 1 from public.mc_planilha_itens x where x.item_id = i.id);

  for l in select value from jsonb_array_elements(p_linhas) order by (value ->> 'ordem')::int loop
    v_ordem := (l ->> 'ordem')::int;
    v_item := nullif(l ->> 'item_id', '')::uuid;
    if v_item is null then
      insert into public.mc_itens (contrato_id) values (v.contrato_id) returning id into v_item;
    end if;
    v_pai := null;
    if nullif(l ->> 'pai_ordem', '') is not null then
      if (l ->> 'pai_ordem')::int >= v_ordem then
        raise exception 'Linha %: o pai precisa vir antes dela na planilha', v_ordem using errcode = 'P0001';
      end if;
      select id into v_pai from public.mc_planilha_itens where versao_id = p_versao and ordem = (l ->> 'pai_ordem')::int;
      if v_pai is null then raise exception 'Linha %: pai % não encontrado', v_ordem, l ->> 'pai_ordem' using errcode = 'P0001'; end if;
    end if;
    insert into public.mc_planilha_itens (versao_id, contrato_id, item_id, ordem, codigo, pai_id, descricao, unidade, tipo,
      preco_unitario, quantidade_prevista, linha_origem)
    values (p_versao, v.contrato_id, v_item, v_ordem, btrim(l ->> 'codigo'), v_pai, btrim(l ->> 'descricao'),
      nullif(btrim(l ->> 'unidade'), ''), l ->> 'tipo', (l ->> 'preco_unitario')::numeric, (l ->> 'quantidade_prevista')::numeric,
      nullif(l ->> 'linha_origem', '')::int);
    v_n := v_n + 1;
  end loop;

  update public.mc_planilha_versoes set arquivo_nome = p_arquivo_nome, arquivo_hash = p_arquivo_hash where id = p_versao;
  return v_n;
end $$;

create or replace function public.fn_mc_planilha_aprovar(p_versao uuid)
returns void language plpgsql security definer set search_path to '' as $$
declare v record; v_ultima date;
begin
  select id, contrato_id, status, numero, vigente_desde into v from public.mc_planilha_versoes where id = p_versao and excluido_em is null;
  if not found then raise exception 'Versão não encontrada' using errcode = 'P0001'; end if;
  perform public.fn_mc_exigir('medicao.planilha', 'aprovar', v.contrato_id, 'Sem permissão para tornar a versão vigente');
  if v.status <> 'rascunho' then raise exception 'A versão % já está vigente', v.numero using errcode = 'P0001'; end if;
  if not exists (select 1 from public.mc_planilha_itens where versao_id = p_versao and tipo = 'servico') then
    raise exception 'A versão % não tem nenhum serviço', v.numero using errcode = 'P0001';
  end if;
  select max(vigente_desde) into v_ultima from public.mc_planilha_versoes
  where contrato_id = v.contrato_id and status = 'vigente' and excluido_em is null;
  if v_ultima is not null and v.vigente_desde <= v_ultima then
    raise exception 'A versão % precisa começar depois de %, início da versão vigente anterior', v.numero, to_char(v_ultima, 'DD/MM/YYYY')
      using errcode = 'P0001';
  end if;
  update public.mc_planilha_versoes set status = 'vigente', aprovada_em = now(), aprovada_por = (select auth.uid()), motivo_desaprovacao = null
  where id = p_versao;
end $$;

create or replace function public.fn_mc_planilha_desaprovar(p_versao uuid, p_motivo text)
returns void language plpgsql security definer set search_path to '' as $$
declare v record;
begin
  select id, contrato_id, status, numero into v from public.mc_planilha_versoes where id = p_versao and excluido_em is null;
  if not found then raise exception 'Versão não encontrada' using errcode = 'P0001'; end if;
  perform public.fn_mc_exigir('medicao.planilha', 'desaprovar', v.contrato_id, 'Sem permissão para desaprovar a versão');
  if coalesce(btrim(p_motivo), '') = '' then raise exception 'Informe o motivo' using errcode = 'P0001'; end if;
  if v.status <> 'vigente' then raise exception 'A versão % não está vigente', v.numero using errcode = 'P0001'; end if;
  if exists (select 1 from public.mc_planilha_versoes where contrato_id = v.contrato_id and numero > v.numero and excluido_em is null) then
    raise exception 'Só a última versão volta a rascunho' using errcode = 'P0001';
  end if;
  update public.mc_planilha_versoes set status = 'rascunho', aprovada_em = null, aprovada_por = null, motivo_desaprovacao = btrim(p_motivo)
  where id = p_versao;
end $$;

create or replace function public.fn_mc_recurso_da_tabela(p_tabela text)
returns text language sql immutable set search_path to '' as $$
  select case p_tabela when 'mc_contratos' then 'medicao.contratos' when 'mc_aditivos' then 'medicao.contratos'
                       when 'mc_planilha_versoes' then 'medicao.planilha' end;
$$;

create or replace function public.fn_mc_excluir(p_tabela text, p_id uuid, p_motivo text)
returns void language plpgsql security definer set search_path to '' as $$
declare v_recurso text := public.fn_mc_recurso_da_tabela(p_tabela); v_contrato uuid; v_n int;
begin
  if v_recurso is null then raise exception 'Tabela inválida' using errcode = 'P0001'; end if;
  if coalesce(btrim(p_motivo), '') = '' then raise exception 'Informe o motivo da exclusão' using errcode = 'P0001'; end if;
  execute format('select %s from public.%I where id = $1', case when p_tabela = 'mc_contratos' then 'id' else 'contrato_id' end, p_tabela)
    into v_contrato using p_id;
  perform public.fn_mc_exigir(v_recurso, 'excluir', v_contrato, 'Sem permissão para excluir');
  if p_tabela = 'mc_planilha_versoes' and exists (select 1 from public.mc_planilha_versoes where id = p_id and status = 'vigente') then
    raise exception 'Versão vigente não se exclui. Desaprove antes, se nenhuma medição a usa' using errcode = 'P0001';
  end if;
  if p_tabela = 'mc_aditivos' and exists (select 1 from public.mc_planilha_versoes where aditivo_id = p_id and excluido_em is null) then
    raise exception 'O aditivo tem versão da planilha. Exclua a versão antes' using errcode = 'P0001';
  end if;
  execute format('update public.%I set excluido_em = now(), excluido_por = $1, motivo_exclusao = $2 where id = $3 and excluido_em is null', p_tabela)
    using (select auth.uid()), btrim(p_motivo), p_id;
  get diagnostics v_n = row_count;
  if v_n = 0 then raise exception 'Registro não encontrado ou já excluído' using errcode = 'P0001'; end if;
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
  execute format('update public.%I set excluido_em = null, excluido_por = null, motivo_exclusao = null where id = $1 and excluido_em is not null', p_tabela)
    using p_id;
  get diagnostics v_n = row_count;
  if v_n = 0 then raise exception 'Registro não encontrado na lixeira' using errcode = 'P0001'; end if;
end $$;

do $fn$
declare f text;
begin
  foreach f in array array['fn_mc_exigir(text, text, uuid, text)', 'fn_mc_contrato_salvar(jsonb, uuid)',
    'fn_mc_acesso_definir(uuid, uuid, boolean)', 'fn_mc_usuarios_do_contrato(uuid)', 'fn_mc_usuarios_ativos()',
    'fn_mc_aditivo_salvar(uuid, jsonb, uuid)', 'fn_mc_planilha_criar_rascunho(uuid, jsonb)',
    'fn_mc_planilha_gravar_linhas(uuid, jsonb, text, text)', 'fn_mc_planilha_aprovar(uuid)',
    'fn_mc_planilha_desaprovar(uuid, text)', 'fn_mc_recurso_da_tabela(text)', 'fn_mc_excluir(text, uuid, text)',
    'fn_mc_restaurar(text, uuid)'] loop
    execute format('revoke all on function public.%s from public, anon', f);
    execute format('grant execute on function public.%s to authenticated', f);
  end loop;
end $fn$;
