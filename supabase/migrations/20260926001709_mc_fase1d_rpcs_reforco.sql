-- Medição de Contratos, Fase 1d, reforço (fix round 1): fn_mc_exigir passa a recusar contrato
-- excluído (as RPCs de escrita não podem mais agir numa árvore na lixeira; fn_mc_restaurar mantém
-- seu próprio caminho, sem passar por fn_mc_exigir). Trava por advisory lock em aprovar/desaprovar/
-- excluir(mc_planilha_versoes), com releitura FOR UPDATE depois do lock (mesmo em gravar_linhas).
-- Mensagens de negócio (P0001) no lugar de erro cru do Postgres em validações de linha e de aditivo.
-- Aditivo só de prazo não libera nova versão da planilha; aditivo excluído bloqueia a versão nova;
-- restaurar versão cujo aditivo está na lixeira exige restaurar o aditivo primeiro.

create or replace function public.fn_mc_exigir(p_recurso text, p_acao text, p_contrato uuid, p_mensagem text)
returns void language plpgsql stable security definer set search_path to '' as $$
begin
  if not public.tem_permissao(p_recurso, p_acao) then raise exception '%', p_mensagem using errcode = 'P0001'; end if;
  if p_contrato is not null and not (
    public.fn_mc_acessa_contrato(p_contrato)
    and exists (select 1 from public.mc_contratos where id = p_contrato and excluido_em is null)
  ) then
    raise exception 'Contrato não encontrado' using errcode = 'P0001';
  end if;
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
declare v_id uuid; v_rascunho int; v_numero int; v_aditivo uuid := nullif(p_dados ->> 'aditivo_id', '')::uuid; v_aditivo_tipos text[];
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
  values (p_contrato, v_numero, v_aditivo, (p_dados ->> 'vigente_desde')::date, nullif(btrim(p_dados ->> 'motivo'), ''))
  returning id into v_id;
  return v_id;
end $$;

-- Grava (ou regrava) as linhas do rascunho. Regravar substitui: apaga as linhas e os itens que só
-- existiam nelas, e insere de novo. Pai vem por pai_ordem, que precisa ser uma linha anterior.
-- Reconfere o status depois do advisory lock (outra sessão pode ter mudado a versão entre a leitura
-- inicial e o lock). Valida ordem e item repetidos, e item de outro contrato, com mensagem de negócio.
create or replace function public.fn_mc_planilha_gravar_linhas(p_versao uuid, p_linhas jsonb, p_arquivo_nome text, p_arquivo_hash text)
returns integer language plpgsql security definer set search_path to '' as $$
declare v record; l jsonb; v_item uuid; v_pai uuid; v_n int := 0; v_ordem int; v_antigos uuid[];
  v_ordens int[] := '{}'; v_itens_vistos uuid[] := '{}';
begin
  select id, contrato_id, status, numero into v from public.mc_planilha_versoes where id = p_versao and excluido_em is null;
  if not found then raise exception 'Versão não encontrada' using errcode = 'P0001'; end if;
  perform public.fn_mc_exigir('medicao.planilha', 'criar', v.contrato_id, 'Sem permissão para importar planilha');
  if jsonb_typeof(p_linhas) <> 'array' or jsonb_array_length(p_linhas) = 0 then
    raise exception 'A planilha não tem linhas' using errcode = 'P0001';
  end if;
  perform pg_advisory_xact_lock(hashtextextended('mc_versao:' || v.contrato_id::text, 0));

  select id, contrato_id, status, numero into v from public.mc_planilha_versoes where id = p_versao and excluido_em is null for update;
  if not found then raise exception 'Versão não encontrada' using errcode = 'P0001'; end if;
  if v.status <> 'rascunho' then raise exception 'A versão % não está em rascunho', v.numero using errcode = 'P0001'; end if;

  -- Sem tabela temporária: a segunda gravação na mesma transação (reenvio) quebraria no create.
  -- O delete de todas as linhas num comando só não esbarra na FK do pai (NO ACTION confere no fim).
  select coalesce(array_agg(item_id), '{}') into v_antigos from public.mc_planilha_itens where versao_id = p_versao;
  delete from public.mc_planilha_itens where versao_id = p_versao;
  delete from public.mc_itens i
  where i.id = any(v_antigos) and not exists (select 1 from public.mc_planilha_itens x where x.item_id = i.id);

  for l in select value from jsonb_array_elements(p_linhas) order by (value ->> 'ordem')::int loop
    v_ordem := (l ->> 'ordem')::int;
    if v_ordem = any(v_ordens) then
      raise exception 'Linha %: ordem repetida', v_ordem using errcode = 'P0001';
    end if;
    v_ordens := array_append(v_ordens, v_ordem);
    if l ->> 'preco_unitario' = '' then
      raise exception 'Linha %: preço inválido', v_ordem using errcode = 'P0001';
    end if;
    if l ->> 'quantidade_prevista' = '' then
      raise exception 'Linha %: quantidade inválida', v_ordem using errcode = 'P0001';
    end if;
    v_item := nullif(l ->> 'item_id', '')::uuid;
    if v_item is not null then
      if v_item = any(v_itens_vistos) then
        raise exception 'Linha %: item repetido na versão', v_ordem using errcode = 'P0001';
      end if;
      if not exists (select 1 from public.mc_itens where id = v_item and contrato_id = v.contrato_id) then
        raise exception 'Linha %: item não pertence ao contrato', v_ordem using errcode = 'P0001';
      end if;
      v_itens_vistos := array_append(v_itens_vistos, v_item);
    else
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
  perform pg_advisory_xact_lock(hashtextextended('mc_versao:' || v.contrato_id::text, 0));
  select id, contrato_id, status, numero, vigente_desde into v from public.mc_planilha_versoes where id = p_versao and excluido_em is null for update;
  if not found then raise exception 'Versão não encontrada' using errcode = 'P0001'; end if;
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
  perform pg_advisory_xact_lock(hashtextextended('mc_versao:' || v.contrato_id::text, 0));
  select id, contrato_id, status, numero into v from public.mc_planilha_versoes where id = p_versao and excluido_em is null for update;
  if not found then raise exception 'Versão não encontrada' using errcode = 'P0001'; end if;
  if v.status <> 'vigente' then raise exception 'A versão % não está vigente', v.numero using errcode = 'P0001'; end if;
  if exists (select 1 from public.mc_planilha_versoes where contrato_id = v.contrato_id and numero > v.numero and excluido_em is null) then
    raise exception 'Só a última versão volta a rascunho' using errcode = 'P0001';
  end if;
  update public.mc_planilha_versoes set status = 'rascunho', aprovada_em = null, aprovada_por = null, motivo_desaprovacao = btrim(p_motivo)
  where id = p_versao;
end $$;

create or replace function public.fn_mc_excluir(p_tabela text, p_id uuid, p_motivo text)
returns void language plpgsql security definer set search_path to '' as $$
declare v_recurso text := public.fn_mc_recurso_da_tabela(p_tabela); v_contrato uuid; v_n int; v_status text;
begin
  if v_recurso is null then raise exception 'Tabela inválida' using errcode = 'P0001'; end if;
  if coalesce(btrim(p_motivo), '') = '' then raise exception 'Informe o motivo da exclusão' using errcode = 'P0001'; end if;
  execute format('select %s from public.%I where id = $1', case when p_tabela = 'mc_contratos' then 'id' else 'contrato_id' end, p_tabela)
    into v_contrato using p_id;
  perform public.fn_mc_exigir(v_recurso, 'excluir', v_contrato, 'Sem permissão para excluir');
  if p_tabela = 'mc_planilha_versoes' then
    perform pg_advisory_xact_lock(hashtextextended('mc_versao:' || v_contrato::text, 0));
    select status into v_status from public.mc_planilha_versoes where id = p_id for update;
    if v_status = 'vigente' then
      raise exception 'Versão vigente não se exclui. Desaprove antes, se nenhuma medição a usa' using errcode = 'P0001';
    end if;
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
