-- Medição de Contratos, Fase 6a3: um PDF vale para um relatório de reajuste só, enquanto ele não for
-- excluído. fn_mc_reajuste_importar (ao gravar) e fn_mc_reajuste_manual (com anexo) recusam o arquivo_id
-- que já está num relatório NÃO excluído da medição, com o nº do relatório. O PDF de um relatório excluído
-- volta a entrar (o anexo faz dedup por conteúdo: reenviar o mesmo PDF devolve o mesmo arquivo, e é assim
-- que se refaz um rateio errado). Evita a duplicata de dois gravar ou duas abas (a medição já fica em
-- "for update"). Corpos vivos de 02/10/2026 (md5 do prosrc: importar b924f44ce0f37161b080e4bdffe13909,
-- manual cc33e34846c832075a917aeb27f9b049) com o bloco novo marcado "mc: Fase 6a3". Só aditivo.
CREATE OR REPLACE FUNCTION public.fn_mc_reajuste_importar(p_medicao uuid, p_relatorio jsonb, p_gravar boolean DEFAULT false)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  m public.mc_medicoes%rowtype;
  v_ant public.mc_reajuste_relatorios%rowtype;
  v_numero_contrato text; v_codigo_contrato text;
  v_situacao text := p_relatorio ->> 'situacao';
  v_total numeric; v_valor_pi numeric; v_txt text; v_rotulo text;
  v_preco numeric; v_pi numeric; v_fator numeric; v_reaj numeric;
  v_itens uuid[]; v_pesos numeric[]; v_destino uuid; v_rateio jsonb; v_pendencia text;
  v_linhas jsonb := '[]'::jsonb; v_arquivo uuid; v_id uuid; v_seq integer; v_linha_id uuid;
  l record; x jsonb; v_res jsonb;
begin
  select * into m from public.mc_medicoes where id = p_medicao for update;
  perform public.fn_mc_exigir('medicao.reajuste', 'editar', m.contrato_id, 'Sem permissão para importar reajuste');
  if m.id is null then raise exception 'Medição não encontrada' using errcode = 'P0001'; end if;
  if m.status not in ('enviada', 'aprovada') then
    raise exception 'A %ª medição está %: o reajuste entra só em medição enviada ou aprovada', m.numero,
      public.fn_mc_rotulo_status(m.status) using errcode = 'P0001';
  end if;
  if jsonb_typeof(p_relatorio) is distinct from 'object' or jsonb_typeof(p_relatorio -> 'linhas') is distinct from 'array'
     or jsonb_typeof(p_relatorio -> 'grupos') is distinct from 'array' or jsonb_typeof(p_relatorio -> 'indices') is distinct from 'array' then
    raise exception 'Relatório em formato inválido' using errcode = 'P0001';
  end if;

  -- Cabeçalho: contrato (o número do nosso contrato aparece como palavra no "CONTRATO:" do SIAC),
  -- medição e situação dos índices.
  select numero_contrato, codigo into v_numero_contrato, v_codigo_contrato from public.mc_contratos where id = m.contrato_id;
  if strpos(' ' || regexp_replace(coalesce(p_relatorio ->> 'contrato_texto', ''), '[^0-9/.-]+', ' ', 'g') || ' ',
            ' ' || btrim(regexp_replace(v_numero_contrato, '[^0-9/.-]+', ' ', 'g')) || ' ') = 0 then
    raise exception 'O relatório é do contrato "%", não do % (contrato %)', coalesce(p_relatorio ->> 'contrato_texto', 'sem número'),
      v_codigo_contrato, v_numero_contrato using errcode = 'P0001';
  end if;
  if coalesce(p_relatorio ->> 'medicao_numero', '') !~ '^[0-9]{1,4}$' or (p_relatorio ->> 'medicao_numero')::integer <> m.numero then
    raise exception 'O relatório é da %ª medição, não da %ª', coalesce(p_relatorio ->> 'medicao_numero', '?'), m.numero using errcode = 'P0001';
  end if;
  if v_situacao is null or v_situacao not in ('provisorio', 'definitivo') then
    raise exception 'Situação dos índices inválida: informe provisório ou definitivo' using errcode = 'P0001';
  end if;
  v_total := public.fn_mc_numero(p_relatorio ->> 'total', 'Total do reajuste inválido');
  v_valor_pi := public.fn_mc_numero(p_relatorio ->> 'valor_pi', 'Valor a PI do relatório inválido');
  if v_total is null or v_valor_pi is null or v_total <> round(v_total, 2) or v_valor_pi <> round(v_valor_pi, 2) then
    raise exception 'Informe o total do reajuste e o valor a PI do relatório com até 2 casas' using errcode = 'P0001';
  end if;

  -- Grupos (SUBTOTAL do SIAC) e índices.
  if exists (select 1 from jsonb_array_elements(p_relatorio -> 'grupos') g
              where coalesce(g ->> 'grupo', '') !~ '^[0-9]+,[0-9]+$'
                 or public.fn_mc_numero(g ->> 'valor_pi', 'SUBTOTAL inválido') is null
                 or public.fn_mc_numero(g ->> 'reajuste', 'SUBTOTAL inválido') is null)
     or (select count(*) <> count(distinct g ->> 'grupo') from jsonb_array_elements(p_relatorio -> 'grupos') g) then
    raise exception 'SUBTOTAL de grupo em formato inválido ou repetido' using errcode = 'P0001';
  end if;
  if exists (select 1 from jsonb_array_elements(p_relatorio -> 'indices') i
              where coalesce(btrim(i ->> 'sigla'), '') = ''
                 or public.fn_mc_numero(i ->> 'i0', 'Índice inválido') is null
                 or public.fn_mc_numero(i ->> 'i1', 'Índice inválido') is null
                 or public.fn_mc_numero(i ->> 'k', 'Índice inválido') is null)
     or (select count(*) <> count(distinct btrim(i ->> 'sigla')) from jsonb_array_elements(p_relatorio -> 'indices') i) then
    raise exception 'Tabela de índices em formato inválido ou com sigla repetida' using errcode = 'P0001';
  end if;

  -- Linhas: confere uma a uma e calcula o rateio.
  for l in select e.j, e.ord::integer as ord from jsonb_array_elements(p_relatorio -> 'linhas') with ordinality as e(j, ord) loop
    v_rotulo := format('Linha %s (%s %s)', l.ord, coalesce(l.j ->> 'grupo', '?'), coalesce(l.j ->> 'codigo', '?'));
    if coalesce(l.j ->> 'grupo', '') !~ '^[0-9]+,[0-9]+$' or coalesce(l.j ->> 'codigo', '') !~ '^[0-9]+$'
       or coalesce(btrim(l.j ->> 'descricao'), '') = '' or coalesce(btrim(l.j ->> 'unidade'), '') = '' then
      raise exception '%: grupo, código SICRO, descrição e unidade são obrigatórios', v_rotulo using errcode = 'P0001';
    end if;
    v_preco := public.fn_mc_numero(l.j ->> 'preco_unitario', v_rotulo || ': preço inválido');
    v_pi := public.fn_mc_numero(l.j ->> 'valor_pi', v_rotulo || ': valor a PI inválido');
    v_fator := public.fn_mc_numero(l.j ->> 'fator', v_rotulo || ': fator inválido');
    v_reaj := public.fn_mc_numero(l.j ->> 'reajuste', v_rotulo || ': reajuste inválido');
    if v_preco is null or v_pi is null or v_fator is null or v_reaj is null then
      raise exception '%: preço, valor a PI, fator e reajuste são obrigatórios', v_rotulo using errcode = 'P0001';
    end if;
    if v_pi = 0 then raise exception '%: linha com valor a PI zero não entra no import', v_rotulo using errcode = 'P0001'; end if;
    if v_pi <> round(v_pi, 2) or v_reaj <> round(v_reaj, 2) then
      raise exception '%: valor a PI e reajuste têm no máximo 2 casas', v_rotulo using errcode = 'P0001';
    end if;
    if not exists (select 1 from jsonb_array_elements(p_relatorio -> 'grupos') g where g ->> 'grupo' = l.j ->> 'grupo') then
      raise exception '%: o grupo % não tem SUBTOTAL no relatório', v_rotulo, l.j ->> 'grupo' using errcode = 'P0001';
    end if;

    -- Itens casados (do de-para ou escolhidos na prévia): serviços deste contrato, sem repetição.
    if jsonb_typeof(coalesce(l.j -> 'itens', '[]'::jsonb)) <> 'array'
       or exists (select 1 from jsonb_array_elements_text(coalesce(l.j -> 'itens', '[]'::jsonb)) t
                   where t !~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$')
       or (l.j ->> 'destino' is not null and l.j ->> 'destino' !~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$') then
      raise exception '%: itens casados em formato inválido', v_rotulo using errcode = 'P0001';
    end if;
    select coalesce(array_agg(t::uuid order by o), '{}') into v_itens
      from jsonb_array_elements_text(coalesce(l.j -> 'itens', '[]'::jsonb)) with ordinality as e(t, o);
    if cardinality(v_itens) <> (select count(distinct u) from unnest(v_itens) u) then
      raise exception '%: item repetido no casamento', v_rotulo using errcode = 'P0001';
    end if;
    if exists (select 1 from unnest(v_itens) u where not exists (
                 select 1 from public.mc_planilha_itens pi where pi.item_id = u and pi.contrato_id = m.contrato_id and pi.tipo = 'servico')) then
      raise exception '%: item casado que não é serviço deste contrato', v_rotulo using errcode = 'P0001';
    end if;
    v_destino := (l.j ->> 'destino')::uuid;
    if v_destino is not null and not (v_destino = any(v_itens)) then
      raise exception '%: o item que recebe a linha tem de estar entre os casados', v_rotulo using errcode = 'P0001';
    end if;

    -- Peso = valor do item nesta medição (mc_v_medicao_itens: aprovada se aprovada, medida se enviada).
    select coalesce(array_agg(coalesce((select sum(mi.valor_medicao) from public.mc_v_medicao_itens mi
                                         where mi.medicao_id = p_medicao and mi.item_id = u.id), 0) order by u.o), '{}')
      into v_pesos from unnest(v_itens) with ordinality as u(id, o);

    v_rateio := '[]'::jsonb; v_pendencia := null;
    if cardinality(v_itens) = 0 then
      v_pendencia := 'Case a linha com um ou mais itens';
    elsif cardinality(v_itens) = 1 or (select sum(greatest(p, 0)) from unnest(v_pesos) p) > 0 then
      select jsonb_agg(jsonb_build_object('item_id', r.item_id, 'valor_base', r.peso::text, 'valor', r.valor::text) order by r.ord)
        into v_rateio from public.fn_mc_ratear(v_reaj, v_itens, v_pesos) r;
    elsif v_destino is not null then
      select jsonb_agg(jsonb_build_object('item_id', r.item_id, 'valor_base', r.peso::text, 'valor', r.valor::text) order by r.ord)
        into v_rateio from public.fn_mc_ratear(v_reaj, array[v_destino], array[0::numeric]) r;
    else
      v_pendencia := 'Os itens casados não têm valor nesta medição: escolha o item que recebe a linha';
    end if;

    v_linhas := v_linhas || jsonb_build_array(jsonb_build_object(
      'ordem', l.ord, 'grupo', l.j ->> 'grupo', 'codigo', l.j ->> 'codigo', 'descricao', btrim(l.j ->> 'descricao'),
      'unidade', btrim(l.j ->> 'unidade'), 'preco_unitario', v_preco::text, 'valor_pi', v_pi::text, 'fator', v_fator::text,
      'reajuste', v_reaj::text, 'itens', to_jsonb(v_itens), 'destino', v_destino,
      'valor_nosso', round((select coalesce(sum(p), 0) from unnest(v_pesos) p), 2)::text,
      'rateio', v_rateio, 'pendencia', v_pendencia));
  end loop;

  select format('%s %s', y ->> 'grupo', y ->> 'codigo') into v_txt
    from jsonb_array_elements(v_linhas) y group by y ->> 'grupo', y ->> 'codigo' having count(*) > 1 limit 1;
  if v_txt is not null then raise exception 'Linha repetida no relatório: %', v_txt using errcode = 'P0001'; end if;

  -- As linhas somam o SUBTOTAL de cada grupo, e os SUBTOTAIS somam a SOMA.
  select string_agg(format('%s (valor a PI %s e SUBTOTAL %s; reajuste %s e SUBTOTAL %s)', g.grupo,
                           public.fn_mc_brl(coalesce(s.pi, 0)), public.fn_mc_brl(g.pi),
                           public.fn_mc_brl(coalesce(s.rj, 0)), public.fn_mc_brl(g.rj)), '; ' order by g.grupo)
    into v_txt
    from (select e ->> 'grupo' as grupo, (e ->> 'valor_pi')::numeric as pi, (e ->> 'reajuste')::numeric as rj
            from jsonb_array_elements(p_relatorio -> 'grupos') e) g
    left join (select y ->> 'grupo' as grupo, sum((y ->> 'valor_pi')::numeric) as pi, sum((y ->> 'reajuste')::numeric) as rj
                 from jsonb_array_elements(v_linhas) y group by 1) s on s.grupo = g.grupo
   where coalesce(s.pi, 0) <> g.pi or coalesce(s.rj, 0) <> g.rj;
  if v_txt is not null then
    raise exception 'As linhas não somam o SUBTOTAL do grupo: %', v_txt using errcode = 'P0001';
  end if;
  select string_agg(v, ', ') into v_txt from (
    select format('valor a PI %s e SOMA %s', public.fn_mc_brl(sum((e ->> 'valor_pi')::numeric)), public.fn_mc_brl(v_valor_pi)) as v
      from jsonb_array_elements(p_relatorio -> 'grupos') e having coalesce(sum((e ->> 'valor_pi')::numeric), 0) <> v_valor_pi
    union all
    select format('reajuste %s e SOMA %s', public.fn_mc_brl(sum((e ->> 'reajuste')::numeric)), public.fn_mc_brl(v_total))
      from jsonb_array_elements(p_relatorio -> 'grupos') e having coalesce(sum((e ->> 'reajuste')::numeric), 0) <> v_total) d;
  if v_txt is not null then
    raise exception 'Os SUBTOTAIS não somam a SOMA do relatório: %', v_txt using errcode = 'P0001';
  end if;

  select * into v_ant from public.mc_reajuste_relatorios
   where medicao_id = p_medicao and excluido_em is null order by sequencia desc limit 1;
  v_res := jsonb_build_object(
    'linhas', v_linhas,
    'pendencias', (select count(*) from jsonb_array_elements(v_linhas) y where y ->> 'pendencia' is not null),
    'total', v_total::text, 'valor_pi', v_valor_pi::text, 'situacao', v_situacao,
    'medicao_valor', (select t.valor::text from public.mc_v_medicao_totais t where t.medicao_id = p_medicao),
    'anterior', case when v_ant.id is null then null else jsonb_build_object('id', v_ant.id, 'sequencia', v_ant.sequencia,
                  'origem', v_ant.origem, 'situacao', v_ant.situacao, 'total', v_ant.total::text) end,
    'diferenca', case when v_ant.id is null then null else (v_total - v_ant.total)::text end);
  if not coalesce(p_gravar, false) then return v_res; end if;

  -- Gravar.
  select string_agg(format('%s %s', y ->> 'grupo', y ->> 'codigo'), ', ' order by (y ->> 'ordem')::integer) into v_txt
    from jsonb_array_elements(v_linhas) y where y ->> 'pendencia' is not null;
  if v_txt is not null then
    raise exception 'Escolha os itens que recebem o reajuste das linhas: %', v_txt using errcode = 'P0001';
  end if;
  if coalesce(p_relatorio ->> 'arquivo_id', '') !~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$'
     or not exists (select 1 from public.anexo_vinculos v where v.arquivo_id = (p_relatorio ->> 'arquivo_id')::uuid
                     and v.entidade_tipo = 'mc_reajuste' and v.entidade_id = p_medicao) then
    raise exception 'Anexe o PDF do relatório SIAC nesta medição antes de gravar' using errcode = 'P0001';
  end if;
  v_arquivo := (p_relatorio ->> 'arquivo_id')::uuid;
  -- mc: Fase 6a3, um PDF vale para um relatório só enquanto ele não for excluído (dois gravar, duas abas).
  select r.sequencia into v_seq from public.mc_reajuste_relatorios r
   where r.medicao_id = p_medicao and r.arquivo_id = v_arquivo and r.excluido_em is null order by r.sequencia limit 1;
  if v_seq is not null then
    raise exception 'Este PDF já está no relatório nº % desta medição; exclua-o antes de importar de novo.', v_seq using errcode = 'P0001';
  end if;
  select coalesce(max(sequencia), 0) + 1 into v_seq from public.mc_reajuste_relatorios where medicao_id = p_medicao;
  insert into public.mc_reajuste_relatorios (medicao_id, contrato_id, sequencia, origem, situacao, total, valor_pi, medicao_tipo,
    contrato_texto, periodo_inicio, periodo_fim, data_base, processado_em, arquivo_id, arquivo_hash)
  values (p_medicao, m.contrato_id, v_seq, 'siac', v_situacao, v_total, v_valor_pi, nullif(btrim(p_relatorio ->> 'medicao_tipo'), ''),
    btrim(p_relatorio ->> 'contrato_texto'), nullif(p_relatorio ->> 'periodo_inicio', '')::date, nullif(p_relatorio ->> 'periodo_fim', '')::date,
    nullif(p_relatorio ->> 'data_base', '')::date, nullif(p_relatorio ->> 'processado_em', '')::date, v_arquivo,
    (select a.hash_sha256 from public.arquivos a where a.id = v_arquivo))
  returning id into v_id;
  insert into public.mc_reajuste_relatorio_indices (relatorio_id, contrato_id, sigla, i0, i1, k)
  select v_id, m.contrato_id, btrim(i ->> 'sigla'), (i ->> 'i0')::numeric, (i ->> 'i1')::numeric, (i ->> 'k')::numeric
    from jsonb_array_elements(p_relatorio -> 'indices') i;
  for x in select y from jsonb_array_elements(v_linhas) y order by (y ->> 'ordem')::integer loop
    insert into public.mc_reajuste_linhas (relatorio_id, contrato_id, ordem, grupo, grupo_descricao, codigo, descricao, unidade,
      preco_unitario, valor_pi, fator, reajuste)
    values (v_id, m.contrato_id, (x ->> 'ordem')::integer, x ->> 'grupo',
      (select nullif(btrim(g ->> 'descricao'), '') from jsonb_array_elements(p_relatorio -> 'grupos') g where g ->> 'grupo' = x ->> 'grupo'),
      x ->> 'codigo', x ->> 'descricao', x ->> 'unidade', (x ->> 'preco_unitario')::numeric, (x ->> 'valor_pi')::numeric,
      (x ->> 'fator')::numeric, (x ->> 'reajuste')::numeric)
    returning id into v_linha_id;
    insert into public.mc_reajuste_rateio (linha_id, relatorio_id, contrato_id, item_id, valor_base, valor)
    select v_linha_id, v_id, m.contrato_id, (r ->> 'item_id')::uuid, (r ->> 'valor_base')::numeric, (r ->> 'valor')::numeric
      from jsonb_array_elements(x -> 'rateio') r;
  end loop;

  -- De-para: o casamento das linhas deste relatório substitui o anterior delas.
  delete from public.mc_reajuste_de_para d using jsonb_array_elements(v_linhas) y
   where d.contrato_id = m.contrato_id and d.grupo = y ->> 'grupo' and d.codigo = y ->> 'codigo';
  insert into public.mc_reajuste_de_para (contrato_id, grupo, codigo, item_id)
  select m.contrato_id, y ->> 'grupo', y ->> 'codigo', i::uuid
    from jsonb_array_elements(v_linhas) y cross join jsonb_array_elements_text(y -> 'itens') i;

  -- Conferência final, já no que foi gravado: rateio de cada linha = reajuste da linha; linhas = total.
  if exists (select 1 from public.mc_reajuste_linhas rl where rl.relatorio_id = v_id
              and rl.reajuste <> (select coalesce(sum(rr.valor), 0) from public.mc_reajuste_rateio rr where rr.linha_id = rl.id))
     or (select coalesce(sum(rl.reajuste), 0) from public.mc_reajuste_linhas rl where rl.relatorio_id = v_id) <> v_total then
    raise exception 'O rateio não fecha com o relatório' using errcode = 'P0001';
  end if;

  insert into public.mc_medicao_eventos (medicao_id, contrato_id, evento, motivo, criado_em)
  values (p_medicao, m.contrato_id, 'reajuste', format('Relatório SIAC %s, índices %s: R$ %s', v_seq,
          case v_situacao when 'definitivo' then 'definitivos' else 'provisórios' end, public.fn_mc_brl(v_total)), clock_timestamp());
  return v_res || jsonb_build_object('relatorio_id', v_id, 'sequencia', v_seq);
end $function$;
revoke all on function public.fn_mc_reajuste_importar(uuid, jsonb, boolean) from public, anon;
grant execute on function public.fn_mc_reajuste_importar(uuid, jsonb, boolean) to authenticated;

CREATE OR REPLACE FUNCTION public.fn_mc_reajuste_manual(p_medicao uuid, p_dados jsonb)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare m public.mc_medicoes%rowtype; v_total numeric; v_situacao text := p_dados ->> 'situacao'; v_arquivo uuid; v_seq integer; v_id uuid;
begin
  select * into m from public.mc_medicoes where id = p_medicao for update;
  perform public.fn_mc_exigir('medicao.reajuste', 'editar', m.contrato_id, 'Sem permissão para lançar reajuste');
  if m.id is null then raise exception 'Medição não encontrada' using errcode = 'P0001'; end if;
  if m.status not in ('enviada', 'aprovada') then
    raise exception 'A %ª medição está %: o reajuste entra só em medição enviada ou aprovada', m.numero,
      public.fn_mc_rotulo_status(m.status) using errcode = 'P0001';
  end if;
  v_total := public.fn_mc_numero(p_dados ->> 'total', 'Total do reajuste inválido');
  if v_total is null or v_total <> round(v_total, 2) then
    raise exception 'Informe o total do reajuste com até 2 casas' using errcode = 'P0001';
  end if;
  if v_situacao is null or v_situacao not in ('provisorio', 'definitivo') then
    raise exception 'Situação dos índices inválida: informe provisório ou definitivo' using errcode = 'P0001';
  end if;
  if nullif(p_dados ->> 'arquivo_id', '') is not null then
    if p_dados ->> 'arquivo_id' !~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$'
       or not exists (select 1 from public.anexo_vinculos v where v.arquivo_id = (p_dados ->> 'arquivo_id')::uuid
                       and v.entidade_tipo = 'mc_reajuste' and v.entidade_id = p_medicao) then
      raise exception 'O anexo informado não está nesta medição' using errcode = 'P0001';
    end if;
    v_arquivo := (p_dados ->> 'arquivo_id')::uuid;
    -- mc: Fase 6a3, um PDF vale para um relatório só enquanto ele não for excluído.
    select r.sequencia into v_seq from public.mc_reajuste_relatorios r
     where r.medicao_id = p_medicao and r.arquivo_id = v_arquivo and r.excluido_em is null order by r.sequencia limit 1;
    if v_seq is not null then
      raise exception 'Este PDF já está no relatório nº % desta medição; exclua-o antes de lançar de novo.', v_seq using errcode = 'P0001';
    end if;
  end if;
  select coalesce(max(sequencia), 0) + 1 into v_seq from public.mc_reajuste_relatorios where medicao_id = p_medicao;
  insert into public.mc_reajuste_relatorios (medicao_id, contrato_id, sequencia, origem, situacao, total, arquivo_id, arquivo_hash, observacao)
  values (p_medicao, m.contrato_id, v_seq, 'manual', v_situacao, v_total, v_arquivo,
          (select a.hash_sha256 from public.arquivos a where a.id = v_arquivo), nullif(btrim(p_dados ->> 'observacao'), ''))
  returning id into v_id;
  insert into public.mc_medicao_eventos (medicao_id, contrato_id, evento, motivo, criado_em)
  values (p_medicao, m.contrato_id, 'reajuste', format('Lançamento manual %s, índices %s: R$ %s', v_seq,
          case v_situacao when 'definitivo' then 'definitivos' else 'provisórios' end, public.fn_mc_brl(v_total)), clock_timestamp());
  return v_id;
end $function$;
revoke all on function public.fn_mc_reajuste_manual(uuid, jsonb) from public, anon;
grant execute on function public.fn_mc_reajuste_manual(uuid, jsonb) to authenticated;