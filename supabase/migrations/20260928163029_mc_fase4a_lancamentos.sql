-- Medição de Contratos, Fase 4a: abrir medição e lançamento diário (RPCs de escrita), só aditivo.
-- Regras: spec seção 5.4, 7.2 e 8, emenda de 28/09/2026. Números chegam como texto e viram numeric
-- sem passar por float.

-- Período sugerido da próxima medição: começa no dia seguinte ao fim da última (ou na OS/assinatura,
-- se não houver nenhuma) e termina na véspera do próximo dia_inicio_periodo.
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
  return jsonb_build_object('numero', v_num, 'periodo_inicio', v_ini, 'periodo_fim', v_corte - 1,
    'versao_numero', v_versao, 'depois_de', v_ultimo);
end $$;

-- Abre a próxima medição do contrato, sempre depois da última, com a planilha vigente mais recente
-- e a REV00 em aberto (a Fase 5 fecha, revisa e aprova).
create or replace function public.fn_mc_medicao_abrir(p_contrato uuid, p_inicio date, p_fim date)
returns uuid language plpgsql security definer set search_path to '' as $$
declare v_id uuid; v_num int; v_ultimo date; v_versao uuid; v_codigo text;
begin
  perform public.fn_mc_exigir('medicao.medicoes', 'criar', p_contrato, 'Sem permissão para abrir medição');
  select codigo into v_codigo from public.mc_contratos where id = p_contrato and excluido_em is null;
  if not found then raise exception 'Contrato não encontrado' using errcode = 'P0001'; end if;
  if p_inicio is null or p_fim is null or p_fim < p_inicio then
    raise exception 'Informe o período da medição com o fim igual ou depois do início' using errcode = 'P0001';
  end if;
  perform pg_advisory_xact_lock(hashtextextended('mc_medicao:' || p_contrato::text, 0));
  select max(periodo_fim), coalesce(max(numero), 0) + 1 into v_ultimo, v_num from public.mc_medicoes where contrato_id = p_contrato;
  if v_ultimo is not null and p_inicio <= v_ultimo then
    raise exception 'A %ª medição tem de começar depois de % (fim da %ª)', v_num, to_char(v_ultimo, 'DD/MM/YYYY'), v_num - 1
      using errcode = 'P0001';
  end if;
  select id into v_versao from public.mc_planilha_versoes
   where contrato_id = p_contrato and status = 'vigente' and excluido_em is null order by numero desc limit 1;
  if v_versao is null then
    raise exception 'O contrato % não tem planilha vigente. Aprove a planilha antes de abrir medição', v_codigo using errcode = 'P0001';
  end if;
  insert into public.mc_medicoes (contrato_id, numero, periodo_inicio, periodo_fim, versao_id, origem)
  values (p_contrato, v_num, p_inicio, p_fim, v_versao, 'app') returning id into v_id;
  insert into public.mc_medicao_revisoes (medicao_id, contrato_id, numero) values (v_id, p_contrato, 0);
  insert into public.mc_medicao_eventos (medicao_id, contrato_id, evento, para_status)
  values (v_id, p_contrato, 'abrir', 'aberta');
  return v_id;
end $$;

-- Grava (cria ou edita) um lançamento. Interna: quem chama já conferiu permissão e contrato.
-- Recusa com errcode MCEXC quando o acumulado do item passa do previsto sem motivo (spec 8).
create or replace function public.fn_mc_lancamento_gravar(p_contrato uuid, p_dados jsonb, p_id uuid)
returns uuid language plpgsql security definer set search_path to '' as $$
declare
  v_tipo_loc text; v_id uuid; v_item uuid; v_data date; v_qtd numeric; v_km_i numeric; v_km_f numeric;
  v_motivo text; v_medicao uuid; v_prevista numeric; v_acum numeric; v_codigo text; v_unidade text;
begin
  select tipo_localizacao into v_tipo_loc from public.mc_contratos where id = p_contrato;
  v_item := nullif(p_dados ->> 'item_id', '')::uuid;
  v_data := nullif(p_dados ->> 'data', '')::date;
  v_qtd := nullif(btrim(p_dados ->> 'quantidade'), '')::numeric;
  v_km_i := nullif(btrim(p_dados ->> 'km_inicial'), '')::numeric;
  v_km_f := nullif(btrim(p_dados ->> 'km_final'), '')::numeric;
  v_motivo := nullif(btrim(p_dados ->> 'motivo_excesso'), '');
  if v_item is null then raise exception 'Escolha o item' using errcode = 'P0001'; end if;
  if v_data is null then raise exception 'Informe a data' using errcode = 'P0001'; end if;
  if v_data > (now() at time zone 'America/Rio_Branco')::date then
    raise exception 'A data % ainda não chegou. Lançamento é do que já foi executado', to_char(v_data, 'DD/MM/YYYY')
      using errcode = 'P0001';
  end if;
  if v_qtd is null or v_qtd <= 0 then raise exception 'Informe a quantidade maior que zero' using errcode = 'P0001'; end if;
  if v_qtd <> round(v_qtd, 4) then raise exception 'A quantidade tem no máximo 4 casas' using errcode = 'P0001'; end if;
  if v_tipo_loc = 'rodovia' and (v_km_i is null or v_km_f is null) then
    raise exception 'Informe o km inicial e o km final' using errcode = 'P0001';
  end if;
  if v_km_i < 0 or v_km_f < 0 then raise exception 'Km não pode ser negativo' using errcode = 'P0001'; end if;
  if v_motivo is not null and char_length(v_motivo) < 3 then
    raise exception 'O motivo do excesso precisa de pelo menos 3 letras' using errcode = 'P0001';
  end if;

  if p_id is null then
    insert into public.mc_lancamentos (contrato_id, item_id, medicao_id, data, quantidade, km_inicial, km_final, estaca,
      local_texto, observacao, motivo_excesso)
    values (p_contrato, v_item, '00000000-0000-0000-0000-000000000000', v_data, v_qtd, v_km_i, v_km_f,
      nullif(btrim(p_dados ->> 'estaca'), ''), nullif(btrim(p_dados ->> 'local_texto'), ''),
      nullif(btrim(p_dados ->> 'observacao'), ''), v_motivo)
    returning id, medicao_id into v_id, v_medicao;
  else
    update public.mc_lancamentos set item_id = v_item, data = v_data, quantidade = v_qtd, km_inicial = v_km_i,
      km_final = v_km_f, estaca = nullif(btrim(p_dados ->> 'estaca'), ''), local_texto = nullif(btrim(p_dados ->> 'local_texto'), ''),
      observacao = nullif(btrim(p_dados ->> 'observacao'), ''), motivo_excesso = v_motivo
    where id = p_id and contrato_id = p_contrato and excluido_em is null
    returning id, medicao_id into v_id, v_medicao;
    if v_id is null then raise exception 'Lançamento não encontrado' using errcode = 'P0001'; end if;
  end if;

  -- Excesso: acumulado do item em todas as medições (aprovada = quantidade aprovada; aberta = medida)
  -- contra o previsto da versão da medição do lançamento.
  select pi.quantidade_prevista, pi.codigo, pi.unidade into v_prevista, v_codigo, v_unidade
  from public.mc_medicoes m join public.mc_planilha_itens pi on pi.versao_id = m.versao_id and pi.item_id = v_item
  where m.id = v_medicao;
  select coalesce(sum(qtd_efetiva), 0) into v_acum from public.mc_v_medicao_itens where contrato_id = p_contrato and item_id = v_item;
  if v_acum > v_prevista and v_motivo is null then
    raise exception 'O acumulado do % passa a % %, acima do previsto de % %. Informe o motivo (sinal de que precisa de aditivo)',
      v_codigo, replace(trim_scale(round(v_acum, 6))::text, '.', ','), v_unidade,
      replace(trim_scale(round(v_prevista, 6))::text, '.', ','), v_unidade using errcode = 'MCEXC';
  end if;
  return v_id;
end $$;

create or replace function public.fn_mc_lancamento_salvar(p_contrato uuid, p_dados jsonb, p_id uuid default null)
returns uuid language plpgsql security definer set search_path to '' as $$
begin
  if p_id is null then
    perform public.fn_mc_exigir('medicao.lancamentos', 'criar', p_contrato, 'Sem permissão para lançar');
  else
    perform public.fn_mc_exigir('medicao.lancamentos', 'editar', p_contrato, 'Sem permissão para editar lançamento');
  end if;
  return public.fn_mc_lancamento_gravar(p_contrato, p_dados, p_id);
end $$;

create or replace function public.fn_mc_lancamento_excluir(p_id uuid, p_motivo text)
returns void language plpgsql security definer set search_path to '' as $$
declare v_contrato uuid;
begin
  select contrato_id into v_contrato from public.mc_lancamentos where id = p_id and excluido_em is null;
  perform public.fn_mc_exigir('medicao.lancamentos', 'excluir', v_contrato, 'Sem permissão para excluir lançamento');
  if v_contrato is null then raise exception 'Lançamento não encontrado' using errcode = 'P0001'; end if;
  if char_length(coalesce(btrim(p_motivo), '')) < 3 then
    raise exception 'Informe o motivo da exclusão' using errcode = 'P0001';
  end if;
  update public.mc_lancamentos set excluido_em = now(), excluido_por = (select auth.uid()), motivo_exclusao = btrim(p_motivo)
  where id = p_id;
end $$;

-- Colar do Excel. Uma linha por objeto {linha, data, item_id, quantidade, km_inicial, km_final, estaca,
-- observacao, motivo_excesso}. Cada linha passa pelas mesmas regras do formulário, na ordem, e o
-- excesso soma as linhas anteriores do mesmo bloco. p_gravar = false só confere e não grava nada.
-- Devolve {gravadas, erros: [{linha, erro, excesso}]}; com p_gravar = true e algum erro, nada grava
-- (a RPC recusa com a lista).
create or replace function public.fn_mc_lancamentos_colar(p_contrato uuid, p_linhas jsonb, p_gravar boolean)
returns jsonb language plpgsql security definer set search_path to '' as $$
declare l jsonb; v_erros jsonb := '[]'::jsonb; v_ok int := 0; v_res jsonb;
begin
  perform public.fn_mc_exigir('medicao.lancamentos', 'criar', p_contrato, 'Sem permissão para lançar');
  if jsonb_typeof(p_linhas) is distinct from 'array' or jsonb_array_length(p_linhas) = 0 then
    raise exception 'Cole pelo menos uma linha' using errcode = 'P0001';
  end if;
  if jsonb_array_length(p_linhas) > 500 then
    raise exception 'Cole no máximo 500 linhas por vez' using errcode = 'P0001';
  end if;
  begin
    for l in select * from jsonb_array_elements(p_linhas) loop
      begin
        perform public.fn_mc_lancamento_gravar(p_contrato, l, null);
        v_ok := v_ok + 1;
      exception when others then
        v_erros := v_erros || jsonb_build_object('linha', (l ->> 'linha')::int, 'erro', sqlerrm, 'excesso', sqlstate = 'MCEXC');
      end;
    end loop;
    v_res := jsonb_build_object('gravadas', case when p_gravar and jsonb_array_length(v_erros) = 0 then v_ok else 0 end,
                                'validas', v_ok, 'erros', v_erros);
    if not p_gravar or jsonb_array_length(v_erros) > 0 then
      raise exception using errcode = 'MCDRY', message = v_res::text;
    end if;
  exception when sqlstate 'MCDRY' then
    v_res := sqlerrm::jsonb;
    if p_gravar then
      raise exception 'Nada foi gravado: % linha(s) com erro', jsonb_array_length(v_res -> 'erros') using errcode = 'P0001',
        detail = (v_res -> 'erros')::text;
    end if;
  end;
  return v_res;
end $$;

-- Trava do lançamento, reforçada: o contrato não muda, e a medição fica travada (for share) enquanto
-- o lançamento entra, para não passar por um fechamento concorrente.
create or replace function public.fn_mc_lancamento_medicao()
returns trigger language plpgsql set search_path to '' as $$
declare m record; v_codigo text;
begin
  if tg_op in ('UPDATE', 'DELETE') then
    select numero, status into m from public.mc_medicoes where id = old.medicao_id for share;
    if m.status <> 'aberta' then
      raise exception 'O lançamento é da %ª medição, que está %. Ele só muda enquanto a medição está aberta',
        m.numero, public.fn_mc_rotulo_status(m.status) using errcode = 'P0001';
    end if;
    if tg_op = 'DELETE' then return old; end if;
    if new.contrato_id is distinct from old.contrato_id then
      raise exception 'O contrato do lançamento não muda' using errcode = 'P0001';
    end if;
  end if;
  select c.codigo into v_codigo from public.mc_contratos c where c.id = new.contrato_id;
  select id, numero, status, periodo_inicio, periodo_fim, versao_id into m
  from public.mc_medicoes where contrato_id = new.contrato_id and new.data between periodo_inicio and periodo_fim for share;
  if not found then
    raise exception 'Não há medição para % no contrato %. Abra a medição do período antes de lançar',
      to_char(new.data, 'DD/MM/YYYY'), v_codigo using errcode = 'P0001';
  end if;
  if m.status <> 'aberta' then
    raise exception 'Não há medição aberta para % no contrato %. A %ª medição (% a %) está %',
      to_char(new.data, 'DD/MM/YYYY'), v_codigo, m.numero, to_char(m.periodo_inicio, 'DD/MM/YYYY'),
      to_char(m.periodo_fim, 'DD/MM/YYYY'), public.fn_mc_rotulo_status(m.status) using errcode = 'P0001';
  end if;
  if not exists (select 1 from public.mc_planilha_itens where versao_id = m.versao_id and item_id = new.item_id and tipo = 'servico') then
    raise exception 'O item não é serviço na versão da planilha da %ª medição. Título não recebe lançamento', m.numero using errcode = 'P0001';
  end if;
  new.medicao_id := m.id;
  return new;
end $$;

-- Lista de lançamentos com o item e a medição, para a tela (RLS das tabelas vale: security_invoker).
create or replace view public.mc_v_lancamentos with (security_invoker = true) as
select l.id, l.contrato_id, l.medicao_id, m.numero as medicao_numero, m.status as medicao_status, l.item_id,
       pi.codigo, pi.descricao, pi.unidade, l.data, l.quantidade, l.km_inicial, l.km_final, l.estaca, l.local_texto,
       l.observacao, l.motivo_excesso, l.created_at, l.created_by, l.excluido_em, l.excluido_por, l.motivo_exclusao
from public.mc_lancamentos l
join public.mc_medicoes m on m.id = l.medicao_id
left join public.mc_planilha_itens pi on pi.versao_id = m.versao_id and pi.item_id = l.item_id;
revoke all on public.mc_v_lancamentos from anon, authenticated;
grant select on public.mc_v_lancamentos to authenticated;

revoke all on function public.fn_mc_lancamento_gravar(uuid, jsonb, uuid) from public, anon, authenticated;
revoke all on function public.fn_mc_medicao_sugestao(uuid) from public, anon;
revoke all on function public.fn_mc_medicao_abrir(uuid, date, date) from public, anon;
revoke all on function public.fn_mc_lancamento_salvar(uuid, jsonb, uuid) from public, anon;
revoke all on function public.fn_mc_lancamento_excluir(uuid, text) from public, anon;
revoke all on function public.fn_mc_lancamentos_colar(uuid, jsonb, boolean) from public, anon;
grant execute on function public.fn_mc_medicao_sugestao(uuid) to authenticated;
grant execute on function public.fn_mc_medicao_abrir(uuid, date, date) to authenticated;
grant execute on function public.fn_mc_lancamento_salvar(uuid, jsonb, uuid) to authenticated;
grant execute on function public.fn_mc_lancamento_excluir(uuid, text) to authenticated;
grant execute on function public.fn_mc_lancamentos_colar(uuid, jsonb, boolean) to authenticated;
