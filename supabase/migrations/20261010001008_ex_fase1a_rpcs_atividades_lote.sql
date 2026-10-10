-- Execução de Obras, Fase 1a: RPCs de atividades. O lote é o caminho único de escrita da grade, da
-- importação (F1b) e de um agente. Tudo ou nada; recalcula o CPM no fim, na mesma transação.

create or replace function public.fn_ex_atividades_salvar_lote(p_cronograma uuid, p_linhas jsonb)
returns jsonb language plpgsql security definer set search_path to '' as $$
declare
  v_obra uuid; v_n int; i int; l jsonb; v_atual public.ex_atividades%rowtype; v_nova boolean; v_id uuid;
  v_ids uuid[] := '{}'; v_cods text[] := '{}'; v_rot text; v_max_ordem int;
  v_codigo text; v_tipo text; v_nome text; v_ordem int; v_servico uuid; v_qtd numeric; v_unid uuid; v_prod numeric;
  v_modo text; v_dur int; v_peso numeric; v_valor numeric; v_restr text; v_restr_em date; v_resp uuid; v_obs text;
  v_pai uuid; v_p jsonb; v_pred uuid; v_ptipo text; v_patraso int; v_local text; v_x text; v_ret jsonb;
begin
  select obra_id into v_obra from public.ex_cronogramas where id = p_cronograma and excluido_em is null;
  if v_obra is null then raise exception 'Cronograma não encontrado' using errcode = 'P0001'; end if;
  if jsonb_typeof(p_linhas) is distinct from 'array' or jsonb_array_length(p_linhas) = 0 then
    raise exception 'Nenhuma linha para gravar' using errcode = 'P0001';
  end if;
  v_n := jsonb_array_length(p_linhas);
  if v_n > 3000 then raise exception 'No máximo 3.000 linhas por vez' using errcode = 'P0001'; end if;
  if exists (select 1 from jsonb_array_elements(p_linhas) e where coalesce(e ->> 'id', '') = '') then
    perform public.fn_ex_exigir('execucao.cronogramas', 'criar', v_obra, 'Sem permissão para criar atividade');
  end if;
  if exists (select 1 from jsonb_array_elements(p_linhas) e where coalesce(e ->> 'id', '') <> '') then
    perform public.fn_ex_exigir('execucao.cronogramas', 'editar', v_obra, 'Sem permissão para editar atividade');
  end if;
  perform pg_advisory_xact_lock(hashtextextended('ex_cronograma:' || p_cronograma::text, 0));
  select coalesce(max(ordem), 0) into v_max_ordem from public.ex_atividades where cronograma_id = p_cronograma and excluido_em is null;

  -- Passo 1: grava cada linha com código provisório ('#' || id), sem pai e sem vínculos.
  for i in 1 .. v_n loop
    l := p_linhas -> (i - 1);
    v_rot := coalesce(nullif(btrim(l ->> 'codigo'), ''), 'nº ' || i);
    v_nova := coalesce(l ->> 'id', '') = '';
    v_atual := null;
    if not v_nova then
      select * into v_atual from public.ex_atividades
      where id = (l ->> 'id')::uuid and cronograma_id = p_cronograma and excluido_em is null for update;
      if v_atual.id is null then raise exception 'Linha %: atividade não encontrada neste cronograma', v_rot using errcode = 'P0001'; end if;
      v_rot := coalesce(nullif(btrim(l ->> 'codigo'), ''), v_atual.codigo);
      if nullif(l ->> 'versao', '') is not null and v_atual.updated_at <> (l ->> 'versao')::timestamptz then
        raise exception 'Linha %: esta linha foi alterada por outra pessoa. Recarregue a grade', v_rot using errcode = 'P0001';
      end if;
    end if;

    v_codigo := case when l ? 'codigo' then btrim(l ->> 'codigo') else v_atual.codigo end;
    if coalesce(v_codigo, '') = '' or char_length(v_codigo) > 40 or left(v_codigo, 1) = '#' then
      raise exception 'Linha %: código de 1 a 40 caracteres, sem # no começo', v_rot using errcode = 'P0001';
    end if;
    if v_codigo = any (v_cods) then raise exception 'Código % repetido nas linhas enviadas', v_codigo using errcode = 'P0001'; end if;
    v_cods := v_cods || v_codigo;

    v_nome := case when l ? 'nome' then btrim(l ->> 'nome') else v_atual.nome end;
    if coalesce(v_nome, '') = '' then raise exception 'Linha %: informe o nome', v_rot using errcode = 'P0001'; end if;
    v_tipo := case when l ? 'tipo' then l ->> 'tipo' else coalesce(v_atual.tipo, 'atividade') end;
    if v_tipo not in ('resumo', 'atividade', 'marco') then raise exception 'Linha %: tipo deve ser resumo, atividade ou marco', v_rot using errcode = 'P0001'; end if;
    v_ordem := case when l ? 'ordem' then (l ->> 'ordem')::int else coalesce(v_atual.ordem, v_max_ordem + i) end;
    v_servico := case when l ? 'servico_id' then nullif(l ->> 'servico_id', '')::uuid else v_atual.servico_id end;
    v_qtd := case when l ? 'quantidade' then nullif(l ->> 'quantidade', '')::numeric else v_atual.quantidade end;
    v_unid := case when l ? 'unidade_id' then nullif(l ->> 'unidade_id', '')::uuid else v_atual.unidade_id end;
    v_prod := case when l ? 'produtividade' then nullif(l ->> 'produtividade', '')::numeric else v_atual.produtividade end;
    v_modo := case when l ? 'modo_duracao' then coalesce(nullif(l ->> 'modo_duracao', ''), 'digitada') else coalesce(v_atual.modo_duracao, 'digitada') end;
    v_peso := case when l ? 'peso_manual' then nullif(l ->> 'peso_manual', '')::numeric else v_atual.peso_manual end;
    v_valor := case when l ? 'valor_orcado' then nullif(l ->> 'valor_orcado', '')::numeric else v_atual.valor_orcado end;
    v_restr := case when l ? 'restricao_data' then coalesce(nullif(l ->> 'restricao_data', ''), 'nenhuma') else coalesce(v_atual.restricao_data, 'nenhuma') end;
    v_restr_em := case when l ? 'restricao_data_em' then nullif(l ->> 'restricao_data_em', '')::date else v_atual.restricao_data_em end;
    v_resp := case when l ? 'responsavel_id' then nullif(l ->> 'responsavel_id', '')::uuid else v_atual.responsavel_id end;
    v_obs := case when l ? 'observacao' then nullif(btrim(l ->> 'observacao'), '') else v_atual.observacao end;

    if v_tipo <> 'atividade' then
      if (l ? 'quantidade' and v_qtd is not null) or (l ? 'produtividade' and v_prod is not null) or (l ? 'servico_id' and v_servico is not null) then
        raise exception 'Linha %: resumo e marco não têm serviço, quantidade nem produtividade', v_rot using errcode = 'P0001';
      end if;
      v_qtd := null; v_prod := null; v_servico := null; v_modo := 'digitada'; v_dur := 0;
    elsif v_modo = 'por_produtividade' then
      if v_qtd is null or v_prod is null or v_prod <= 0 then
        raise exception 'Linha %: duração por produtividade precisa de quantidade e de produtividade maior que zero', v_rot using errcode = 'P0001';
      end if;
      v_dur := greatest(1, ceil(v_qtd / v_prod)::int);
    elsif v_modo = 'digitada' then
      v_dur := coalesce(case when l ? 'duracao_dias' then nullif(l ->> 'duracao_dias', '')::int else v_atual.duracao_dias end, 1);
      if v_dur < 0 then raise exception 'Linha %: duração não pode ser negativa', v_rot using errcode = 'P0001'; end if;
    else
      raise exception 'Linha %: modo de duração deve ser por_produtividade ou digitada', v_rot using errcode = 'P0001';
    end if;
    if v_restr not in ('nenhuma', 'inicio_nao_antes', 'fim_nao_depois') then
      raise exception 'Linha %: restrição de data inválida', v_rot using errcode = 'P0001';
    end if;
    if v_restr = 'nenhuma' then v_restr_em := null;
    elsif v_restr_em is null then raise exception 'Linha %: informe a data da restrição', v_rot using errcode = 'P0001';
    end if;

    begin
      if v_nova then
        v_id := gen_random_uuid();
        insert into public.ex_atividades (id, cronograma_id, obra_id, tipo, codigo, nome, ordem, servico_id, quantidade, unidade_id,
          produtividade, modo_duracao, duracao_dias, peso_manual, valor_orcado, restricao_data, restricao_data_em, responsavel_id, observacao)
        values (v_id, p_cronograma, v_obra, v_tipo, '#' || v_id::text, v_nome, v_ordem, v_servico, v_qtd, v_unid,
          v_prod, v_modo, v_dur, v_peso, v_valor, v_restr, v_restr_em, v_resp, v_obs);
      else
        v_id := v_atual.id;
        update public.ex_atividades set tipo = v_tipo, codigo = '#' || id::text, nome = v_nome, ordem = v_ordem, servico_id = v_servico,
          quantidade = v_qtd, unidade_id = v_unid, produtividade = v_prod, modo_duracao = v_modo, duracao_dias = v_dur,
          peso_manual = v_peso, valor_orcado = v_valor, restricao_data = v_restr, restricao_data_em = v_restr_em,
          responsavel_id = v_resp, observacao = v_obs
        where id = v_id;
      end if;
    exception
      when foreign_key_violation then
        raise exception 'Linha %: serviço, unidade ou responsável não encontrado', v_rot using errcode = 'P0001';
      when check_violation then
        raise exception 'Linha %: dado fora do permitido. Confira nome (até 300 letras), números (não negativos) e datas', v_rot using errcode = 'P0001';
    end;
    v_ids := v_ids || v_id;
  end loop;

  -- Passo 2: códigos finais. Colisão aqui é com linha que não veio no lote.
  for i in 1 .. v_n loop
    begin
      update public.ex_atividades set codigo = v_cods[i] where id = v_ids[i];
    exception when unique_violation then
      raise exception 'Já existe outra linha com o código % neste cronograma', v_cods[i] using errcode = 'P0001';
    end;
  end loop;

  -- Passo 3: pai, locais e predecessoras, já com os códigos finais.
  for i in 1 .. v_n loop
    l := p_linhas -> (i - 1);
    if l ? 'pai_codigo' then
      v_pai := null;
      if nullif(btrim(l ->> 'pai_codigo'), '') is not null then
        select id into v_pai from public.ex_atividades
        where cronograma_id = p_cronograma and excluido_em is null and codigo = btrim(l ->> 'pai_codigo');
        if v_pai is null then raise exception 'Linha %: a linha pai % não existe', v_cods[i], btrim(l ->> 'pai_codigo') using errcode = 'P0001'; end if;
        if v_pai = v_ids[i] then raise exception 'Linha %: não pode estar dentro dela mesma', v_cods[i] using errcode = 'P0001'; end if;
      end if;
      update public.ex_atividades set pai_id = v_pai where id = v_ids[i];
    end if;

    if l ? 'locais' then
      delete from public.ex_atividade_locais where atividade_id = v_ids[i];
      for v_local in select jsonb_array_elements_text(coalesce(l -> 'locais', '[]'::jsonb)) loop
        if not exists (select 1 from public.ex_locais where id = v_local::uuid and obra_id = v_obra and excluido_em is null) then
          raise exception 'Linha %: local não encontrado nesta obra', v_cods[i] using errcode = 'P0001';
        end if;
        insert into public.ex_atividade_locais (atividade_id, local_id, obra_id) values (v_ids[i], v_local::uuid, v_obra)
        on conflict do nothing;
      end loop;
    end if;

    if l ? 'predecessoras' then
      delete from public.ex_dependencias where sucessora_id = v_ids[i];
      for v_p in select * from jsonb_array_elements(coalesce(l -> 'predecessoras', '[]'::jsonb)) loop
        select id into v_pred from public.ex_atividades
        where cronograma_id = p_cronograma and excluido_em is null and codigo = btrim(v_p ->> 'codigo');
        if v_pred is null then raise exception 'Linha %: a predecessora % não existe', v_cods[i], v_p ->> 'codigo' using errcode = 'P0001'; end if;
        if v_pred = v_ids[i] then raise exception 'Linha %: não pode depender dela mesma', v_cods[i] using errcode = 'P0001'; end if;
        v_ptipo := upper(coalesce(nullif(v_p ->> 'tipo', ''), 'TI'));
        if v_ptipo not in ('TI', 'II', 'TT', 'IT') then raise exception 'Linha %: tipo de vínculo deve ser TI, II, TT ou IT', v_cods[i] using errcode = 'P0001'; end if;
        v_patraso := coalesce(nullif(v_p ->> 'atraso', '')::int, 0);
        if v_patraso not between -999 and 999 then raise exception 'Linha %: atraso entre -999 e 999 dias', v_cods[i] using errcode = 'P0001'; end if;
        begin
          insert into public.ex_dependencias (cronograma_id, obra_id, predecessora_id, sucessora_id, tipo, atraso_dias)
          values (p_cronograma, v_obra, v_pred, v_ids[i], v_ptipo, v_patraso);
        exception when unique_violation then
          raise exception 'Linha %: predecessora % repetida', v_cods[i], v_p ->> 'codigo' using errcode = 'P0001';
        end;
      end loop;
    end if;
  end loop;

  -- Passo 4: regras do cronograma inteiro.
  select p.codigo into v_x from public.ex_atividades p
  where p.cronograma_id = p_cronograma and p.excluido_em is null and p.tipo <> 'resumo'
    and exists (select 1 from public.ex_atividades f where f.pai_id = p.id and f.excluido_em is null)
  order by p.ordem limit 1;
  if v_x is not null then raise exception 'A linha % tem linhas dentro dela e precisa ser do tipo resumo', v_x using errcode = 'P0001'; end if;

  select a.codigo into v_x from public.ex_dependencias d
  join public.ex_atividades a on a.id in (d.predecessora_id, d.sucessora_id)
  where d.cronograma_id = p_cronograma and a.tipo = 'resumo' limit 1;
  if v_x is not null then raise exception 'A linha % é resumo: resumo não tem predecessora nem sucessora', v_x using errcode = 'P0001'; end if;

  with recursive sobe(id, atual, n) as (
    select a.id, a.pai_id, 1 from public.ex_atividades a where a.id = any (v_ids) and a.pai_id is not null
    union all
    select s.id, p.pai_id, s.n + 1 from sobe s join public.ex_atividades p on p.id = s.atual
    where s.atual <> s.id and s.n < 200 and p.pai_id is not null)
  select a.codigo into v_x from sobe s join public.ex_atividades a on a.id = s.id where s.atual = s.id limit 1;
  if v_x is not null then raise exception 'Hierarquia em ciclo na linha %', v_x using errcode = 'P0001'; end if;

  -- Passo 5: CPM (recusa ciclo de vínculo dizendo as linhas) e retorno.
  perform public.fn_ex_cpm_recalcular(p_cronograma);
  select jsonb_object_agg(a.codigo, a.id) into v_ret from public.ex_atividades a where a.id = any (v_ids);
  return jsonb_build_object('ids', coalesce(v_ret, '{}'::jsonb));
end $$;
