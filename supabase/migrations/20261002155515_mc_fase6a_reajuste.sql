-- Medição de Contratos, Fase 6a: reajuste do DNIT registrado, não calculado (emenda de 02/10/2026 da
-- spec). O relatório SIAC "Resumo da Medição" (ou o lançamento manual, sem relatório) é gravado por
-- medição; cada linha do SIAC é casada a um ou mais itens nossos (de-para por contrato) e o reajuste
-- da linha é rateado entre eles na proporção do valor deles na medição. O rateio é gravado no import
-- (exceção consciente à D6). Vale o último relatório não excluído de cada medição. As tabelas do
-- cálculo da seção 5.5 (mc_indices, mc_indice_valores, mc_item_indices, mc_reajuste_aplicado,
-- mc_reajuste_aplicado_itens) ficam vazias e sem uso. Só aditivo: tabelas novas, uma coluna nova em
-- mc_reajuste_config, funções e views recriadas com as mesmas colunas (o jsonb do boletim e do painel
-- ganha chaves).

-- ------------------------------------------------------------------ estrutura
alter table public.mc_reajuste_config
  add column indice_descricao text check (indice_descricao is null or btrim(indice_descricao) <> '');

create table public.mc_reajuste_relatorios (
  id uuid primary key default gen_random_uuid(),
  medicao_id uuid not null,
  contrato_id uuid not null,
  sequencia integer not null check (sequencia > 0),
  origem text not null check (origem in ('siac', 'manual')),
  situacao text not null check (situacao in ('provisorio', 'definitivo')),
  total numeric not null check (total = round(total, 2)),
  valor_pi numeric check (valor_pi = round(valor_pi, 2)),
  medicao_tipo text,
  contrato_texto text,
  periodo_inicio date,
  periodo_fim date,
  data_base date,
  processado_em date,
  arquivo_id uuid references public.arquivos(id) on delete set null,
  arquivo_hash text,
  observacao text,
  created_at timestamptz not null default clock_timestamp(),
  created_by uuid references public.usuarios(id) default auth.uid(),
  excluido_em timestamptz,
  excluido_por uuid references public.usuarios(id),
  motivo_exclusao text,
  unique (medicao_id, sequencia),
  unique (id, contrato_id),
  foreign key (medicao_id, contrato_id) references public.mc_medicoes (id, contrato_id),
  check (origem = 'manual' or valor_pi is not null),
  check ((excluido_em is null) = (motivo_exclusao is null))
);
create index mc_reajuste_relatorios_contrato_ix on public.mc_reajuste_relatorios (contrato_id);
create index mc_reajuste_relatorios_arquivo_ix on public.mc_reajuste_relatorios (arquivo_id);
create index mc_reajuste_relatorios_medicao_contrato_ix on public.mc_reajuste_relatorios (medicao_id, contrato_id);
create index mc_reajuste_relatorios_excluido_por_ix on public.mc_reajuste_relatorios (excluido_por);
create index mc_reajuste_relatorios_created_by_ix on public.mc_reajuste_relatorios (created_by);

create table public.mc_reajuste_relatorio_indices (
  relatorio_id uuid not null,
  contrato_id uuid not null,
  sigla text not null check (btrim(sigla) <> ''),
  i0 numeric not null,
  i1 numeric not null,
  k numeric not null,
  primary key (relatorio_id, sigla),
  foreign key (relatorio_id, contrato_id) references public.mc_reajuste_relatorios (id, contrato_id)
);
create index mc_reajuste_relatorio_indices_rel_contrato_ix on public.mc_reajuste_relatorio_indices (relatorio_id, contrato_id);
create index mc_reajuste_relatorio_indices_contrato_ix on public.mc_reajuste_relatorio_indices (contrato_id);

create table public.mc_reajuste_linhas (
  id uuid primary key default gen_random_uuid(),
  relatorio_id uuid not null,
  contrato_id uuid not null,
  ordem integer not null check (ordem > 0),
  grupo text not null check (grupo ~ '^[0-9]+,[0-9]+$'),
  grupo_descricao text,
  codigo text not null check (codigo ~ '^[0-9]+$'),
  descricao text not null check (btrim(descricao) <> ''),
  unidade text not null check (btrim(unidade) <> ''),
  preco_unitario numeric not null,
  valor_pi numeric not null check (valor_pi <> 0 and valor_pi = round(valor_pi, 2)),
  fator numeric not null,
  reajuste numeric not null check (reajuste = round(reajuste, 2)),
  unique (relatorio_id, grupo, codigo),
  unique (relatorio_id, ordem),
  unique (id, relatorio_id),
  foreign key (relatorio_id, contrato_id) references public.mc_reajuste_relatorios (id, contrato_id)
);
create index mc_reajuste_linhas_rel_contrato_ix on public.mc_reajuste_linhas (relatorio_id, contrato_id);
create index mc_reajuste_linhas_contrato_ix on public.mc_reajuste_linhas (contrato_id);

create table public.mc_reajuste_rateio (
  linha_id uuid not null,
  relatorio_id uuid not null,
  contrato_id uuid not null,
  item_id uuid not null,
  valor_base numeric not null,
  valor numeric not null check (valor = round(valor, 2)),
  primary key (linha_id, item_id),
  foreign key (linha_id, relatorio_id) references public.mc_reajuste_linhas (id, relatorio_id),
  foreign key (relatorio_id, contrato_id) references public.mc_reajuste_relatorios (id, contrato_id),
  foreign key (item_id, contrato_id) references public.mc_itens (id, contrato_id)
);
create index mc_reajuste_rateio_linha_rel_ix on public.mc_reajuste_rateio (linha_id, relatorio_id);
create index mc_reajuste_rateio_rel_contrato_ix on public.mc_reajuste_rateio (relatorio_id, contrato_id);
create index mc_reajuste_rateio_item_contrato_ix on public.mc_reajuste_rateio (item_id, contrato_id);
create index mc_reajuste_rateio_contrato_ix on public.mc_reajuste_rateio (contrato_id);

-- De-para do contrato: linha do SIAC (grupo + código SICRO) -> itens nossos. Guardado no import e
-- reaproveitado no seguinte; o import de novo substitui o casamento das linhas que trouxe.
create table public.mc_reajuste_de_para (
  contrato_id uuid not null references public.mc_contratos(id),
  grupo text not null check (grupo ~ '^[0-9]+,[0-9]+$'),
  codigo text not null check (codigo ~ '^[0-9]+$'),
  item_id uuid not null,
  created_at timestamptz not null default now(),
  created_by uuid references public.usuarios(id) default auth.uid(),
  primary key (contrato_id, grupo, codigo, item_id),
  foreign key (item_id, contrato_id) references public.mc_itens (id, contrato_id)
);
create index mc_reajuste_de_para_item_contrato_ix on public.mc_reajuste_de_para (item_id, contrato_id);
create index mc_reajuste_de_para_created_by_ix on public.mc_reajuste_de_para (created_by);

-- ------------------------------------------------------------------ RLS, grants, auditoria, travas
do $rls$
declare t text;
begin
  foreach t in array array['mc_reajuste_relatorios', 'mc_reajuste_relatorio_indices', 'mc_reajuste_linhas',
                           'mc_reajuste_rateio', 'mc_reajuste_de_para'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('create policy %I on public.%I for select to authenticated using ((select public.fn_ve_medicao()) and contrato_id in (select public.fn_mc_meus_contratos()))', t || '_select', t);
    execute format('revoke all on public.%I from anon, authenticated', t);
    execute format('grant select on public.%I to authenticated', t);
    execute format('create trigger %I after insert or delete or update on public.%I for each row execute function public.fn_audit()', 'trg_audit_' || t, t);
    execute format('create trigger trg_mc_trava_truncate before truncate on public.%I for each statement execute function public.fn_mc_trava_truncate()', t);
  end loop;
end $rls$;

-- O relatório é imutável: só a exclusão (com motivo, uma vez) mexe nele. Apagar, nunca.
create or replace function public.fn_mc_trava_reajuste()
returns trigger language plpgsql set search_path to '' as $$
begin
  if tg_op = 'DELETE' then
    raise exception 'Relatório de reajuste não se apaga: exclua com motivo' using errcode = 'P0001';
  end if;
  if old.excluido_em is not null then
    raise exception 'O relatório de reajuste % já foi excluído', old.sequencia using errcode = 'P0001';
  end if;
  if new.excluido_em is null
     or (to_jsonb(new) - array['excluido_em', 'excluido_por', 'motivo_exclusao'])
        is distinct from (to_jsonb(old) - array['excluido_em', 'excluido_por', 'motivo_exclusao']) then
    raise exception 'O relatório de reajuste é imutável. Para corrigir, importe de novo; para tirar, exclua com motivo'
      using errcode = 'P0001';
  end if;
  return new;
end $$;
create trigger trg_mc_trava_reajuste before update or delete on public.mc_reajuste_relatorios
  for each row execute function public.fn_mc_trava_reajuste();

create or replace function public.fn_mc_trava_reajuste_filho()
returns trigger language plpgsql set search_path to '' as $$
begin
  raise exception 'Linhas, índices e rateio de um relatório de reajuste não mudam depois de gravados' using errcode = 'P0001';
end $$;
do $tf$
declare t text;
begin
  foreach t in array array['mc_reajuste_relatorio_indices', 'mc_reajuste_linhas', 'mc_reajuste_rateio'] loop
    execute format('create trigger trg_mc_trava_reajuste_filho before update or delete on public.%I for each row execute function public.fn_mc_trava_reajuste_filho()', t);
  end loop;
end $tf$;

-- ------------------------------------------------------------------ anexo do relatório
-- 'mc_reajuste': PDF do relatório SIAC (ou o documento do lançamento manual), anexado à MEDIÇÃO.
-- Corpos iguais aos vivos (pg_get_functiondef em 02/10/2026) com a linha nova marcada.
CREATE OR REPLACE FUNCTION public.fn_recurso_da_entidade(p_tipo text)
 RETURNS text
 LANGUAGE sql
 IMMUTABLE
 SET search_path TO ''
AS $function$
  select case p_tipo
    when 'cotacao'        then 'compras.cotacoes'
    when 'ordem_compra'   then 'compras.ordens'
    when 'lancamento'     then 'financeiro.lancamentos'
    when 'pagamento'      then 'financeiro.pagamentos'
    when 'rh_documento'   then 'rh.documentos'
    when 'rh_epi'         then 'rh.epis'
    when 'rh_ocorrencia'  then 'rh.ocorrencias'
    when 'equipamento_documento' then 'cadastros.equipamentos'
    when 'frete'          then 'frete.fretes'
    when 'frete_chegada'  then 'frete.fretes'
    when 'frete_pagamento' then 'frete.pagamentos'
    when 'pedido_material' then 'frete.pedidos-material'
    when 'combustivel_entrada' then 'combustivel.entradas'
    when 'combustivel_saida' then 'combustivel.saidas'
    when 'combustivel_transferencia' then 'combustivel.transferencias'
    when 'manutencao_os'  then 'manutencao.servicos'
    when 'aplicacao_posicao' then 'financeiro.aplicacoes'
    when 'mc_contrato'    then 'medicao.contratos'
    when 'mc_aditivo'     then 'medicao.contratos'
    when 'mc_planilha_versao' then 'medicao.planilha'
    when 'mc_lancamento'  then 'medicao.lancamentos'
    when 'mc_reajuste'    then 'medicao.reajuste' -- mc: Fase 6
    else null
  end;
$function$;

CREATE OR REPLACE FUNCTION public.fn_mc_contrato_da_entidade(p_tipo text, p_id uuid)
 RETURNS uuid
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  select case p_tipo
    when 'mc_contrato' then (select id from public.mc_contratos where id = p_id)
    when 'mc_aditivo' then (select contrato_id from public.mc_aditivos where id = p_id)
    when 'mc_planilha_versao' then (select contrato_id from public.mc_planilha_versoes where id = p_id)
    when 'mc_lancamento' then (select contrato_id from public.mc_lancamentos where id = p_id)
    when 'mc_reajuste' then (select contrato_id from public.mc_medicoes where id = p_id) -- mc: Fase 6
  end;
$function$;

-- O PDF de um relatório em uso não sai da medição (o histórico precisa dele).
CREATE OR REPLACE FUNCTION public.fn_desvincular_arquivo(p_vinculo_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_tipo text;
  v_recurso text;
  v_entidade uuid;
begin
  select entidade_tipo, entidade_id into v_tipo, v_entidade from public.anexo_vinculos where id = p_vinculo_id;
  if v_tipo is null then
    raise exception 'Anexo nao encontrado neste documento';
  end if;

  v_recurso := public.fn_recurso_da_entidade(v_tipo);
  if not public.tem_permissao(v_recurso, 'editar') then
    raise exception 'Sem permissao para remover anexo deste documento';
  end if;
  if not public.fn_anexo_entidade_visivel(v_tipo, v_entidade) then raise exception 'Sem acesso a este contrato'; end if; -- mc:
  if v_tipo = 'mc_reajuste' and exists (select 1 from public.mc_reajuste_relatorios r join public.anexo_vinculos v on v.arquivo_id = r.arquivo_id
       where v.id = p_vinculo_id and r.medicao_id = v_entidade and r.excluido_em is null) then
    raise exception 'O PDF é de um relatório de reajuste em uso. Exclua o relatório antes de tirar o anexo'; -- mc: Fase 6
  end if;

  delete from public.anexo_vinculos where id = p_vinculo_id;
end;
$function$;

-- ------------------------------------------------------------------ helpers internos
-- Dinheiro em pt-BR para mensagens ("-40.021,28"); ',' e '.' do to_char não dependem do locale.
create or replace function public.fn_mc_brl(p_valor numeric)
returns text language sql immutable set search_path to '' as $$
  select translate(to_char(p_valor, 'FM999,999,999,990.00'), ',.', '.,');
$$;

-- Rateio exato ao centavo: cada item recebe TRUNC(valor x peso / soma; 2) (div() é divisão inteira
-- exata, truncada em direção ao zero) e o que sobra vai para o item de maior peso (empate: o primeiro
-- da lista). Peso negativo conta como zero. Soma zero: tudo vai para o primeiro item (quem chama
-- passa só o item escolhido). A soma devolvida é exatamente p_valor.
create or replace function public.fn_mc_ratear(p_valor numeric, p_itens uuid[], p_pesos numeric[])
returns table (ord integer, item_id uuid, peso numeric, valor numeric)
language sql immutable set search_path to '' as $$
  with b as (
    select u.ord::integer as ord, u.item_id, greatest(coalesce(u.peso, 0), 0) as peso
      from unnest(p_itens, p_pesos) with ordinality as u(item_id, peso, ord)
  ), s as (
    select sum(peso) as soma from b
  ), parte as (
    select b.ord, b.item_id, b.peso,
           case when s.soma = 0 then 0 else div(p_valor * 100 * b.peso, s.soma) / 100 end as v
      from b cross join s
  ), maior as (
    select p.ord from parte p order by p.peso desc, p.ord limit 1
  )
  select p.ord, p.item_id, p.peso,
         round(p.v + case when p.ord = (select m.ord from maior m) then p_valor - (select sum(x.v) from parte x) else 0 end, 2)
    from parte p order by p.ord;
$$;

-- ------------------------------------------------------------------ RPCs
-- Importa o relatório SIAC já lido do PDF pelo servidor (o texto do PDF não entra no banco).
-- p_relatorio = {contrato_texto, medicao_numero, medicao_tipo, situacao ('provisorio'|'definitivo'),
--   periodo_inicio, periodo_fim, data_base, processado_em (yyyy-mm-dd), valor_pi, total (texto),
--   arquivo_id, indices [{sigla, i0, i1, k}], grupos [{grupo, descricao, valor_pi, reajuste}],
--   linhas [{grupo, codigo, descricao, unidade, preco_unitario, valor_pi, fator, reajuste,
--            itens [item_id], destino item_id|null}]}. Números como texto.
-- p_gravar = false: confere e devolve a prévia (rateio, pendências, diferença), sem gravar.
-- p_gravar = true: grava relatório, índices, linhas, rateio e de-para, e o evento da medição.
create or replace function public.fn_mc_reajuste_importar(p_medicao uuid, p_relatorio jsonb, p_gravar boolean default false)
returns jsonb language plpgsql security definer set search_path to '' as $$
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
end $$;

-- Lançamento manual (contrato sem relatório SIAC: Obra 012 e outros): total, situação, anexo opcional
-- (já anexado à medição como 'mc_reajuste') e observação. Sem rateio por item.
create or replace function public.fn_mc_reajuste_manual(p_medicao uuid, p_dados jsonb)
returns uuid language plpgsql security definer set search_path to '' as $$
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
end $$;

create or replace function public.fn_mc_reajuste_excluir(p_id uuid, p_motivo text)
returns void language plpgsql security definer set search_path to '' as $$
declare r public.mc_reajuste_relatorios%rowtype; m public.mc_medicoes%rowtype;
begin
  select * into r from public.mc_reajuste_relatorios where id = p_id;
  select * into m from public.mc_medicoes where id = r.medicao_id for update;
  perform public.fn_mc_exigir('medicao.reajuste', 'editar', r.contrato_id, 'Sem permissão para excluir reajuste');
  if r.id is null then raise exception 'Relatório de reajuste não encontrado' using errcode = 'P0001'; end if;
  if r.excluido_em is not null then raise exception 'O relatório de reajuste % já foi excluído', r.sequencia using errcode = 'P0001'; end if;
  if char_length(coalesce(btrim(p_motivo), '')) < 3 then raise exception 'Informe o motivo da exclusão' using errcode = 'P0001'; end if;
  update public.mc_reajuste_relatorios set excluido_em = now(), excluido_por = (select auth.uid()), motivo_exclusao = btrim(p_motivo)
   where id = p_id;
  insert into public.mc_medicao_eventos (medicao_id, contrato_id, evento, motivo, criado_em)
  values (r.medicao_id, r.contrato_id, 'reajuste_excluido', format('Relatório %s (R$ %s) excluído: %s', r.sequencia,
          public.fn_mc_brl(r.total), btrim(p_motivo)), clock_timestamp());
end $$;

-- Seção Reajuste do contrato: tem reajuste, data-base (mês), periodicidade e índice em texto.
-- p_dados = {tem_reajuste: true|false, data_base: 'yyyy-mm', periodicidade_meses: '12', indice_descricao}.
create or replace function public.fn_mc_reajuste_config_salvar(p_contrato uuid, p_dados jsonb)
returns void language plpgsql security definer set search_path to '' as $$
declare v_tem boolean; v_mes text := nullif(btrim(p_dados ->> 'data_base'), ''); v_per text := coalesce(nullif(btrim(p_dados ->> 'periodicidade_meses'), ''), '12');
begin
  perform public.fn_mc_exigir('medicao.reajuste', 'editar', p_contrato, 'Sem permissão para configurar o reajuste');
  if p_contrato is null or not exists (select 1 from public.mc_contratos where id = p_contrato and excluido_em is null) then
    raise exception 'Contrato não encontrado' using errcode = 'P0001';
  end if;
  if jsonb_typeof(p_dados -> 'tem_reajuste') is distinct from 'boolean' then
    raise exception 'Informe se o contrato tem reajuste' using errcode = 'P0001';
  end if;
  v_tem := (p_dados ->> 'tem_reajuste')::boolean;
  if v_mes is not null and v_mes !~ '^[0-9]{4}-(0[1-9]|1[0-2])$' then
    raise exception 'Data-base inválida: informe mês e ano' using errcode = 'P0001';
  end if;
  if v_tem and v_mes is null then raise exception 'Informe o mês da data-base do reajuste' using errcode = 'P0001'; end if;
  if v_per !~ '^[0-9]{1,3}$' or v_per::integer not between 1 and 120 then
    raise exception 'Periodicidade inválida: de 1 a 120 meses' using errcode = 'P0001';
  end if;
  insert into public.mc_reajuste_config (contrato_id, tem_reajuste, data_base, periodicidade_meses, indice_descricao)
  values (p_contrato, v_tem, (v_mes || '-01')::date, v_per::integer, nullif(btrim(p_dados ->> 'indice_descricao'), ''))
  on conflict (contrato_id) do update set tem_reajuste = excluded.tem_reajuste, data_base = excluded.data_base,
    periodicidade_meses = excluded.periodicidade_meses, indice_descricao = excluded.indice_descricao;
end $$;

-- ------------------------------------------------------------------ views
-- Reajuste que vale em cada medição: o último relatório não excluído; diferença para o anterior não
-- excluído (+ a receber, - a devolver).
create or replace view public.mc_v_reajuste_medicao with (security_invoker = true) as
with r as (
  select rr.*, row_number() over (partition by rr.medicao_id order by rr.sequencia desc) as n,
         count(*) over (partition by rr.medicao_id) as relatorios
    from public.mc_reajuste_relatorios rr where rr.excluido_em is null
)
select r1.medicao_id, r1.contrato_id, m.numero, r1.id as relatorio_id, r1.sequencia, r1.origem, r1.situacao, r1.total,
       r2.id as anterior_id, r2.total as anterior_total, r1.total - r2.total as diferenca, r1.relatorios
  from r r1
  join public.mc_medicoes m on m.id = r1.medicao_id
  left join r r2 on r2.medicao_id = r1.medicao_id and r2.n = 2
 where r1.n = 1;

-- Rateio por item do relatório que vale (só o do SIAC tem; o manual conta só no total).
create or replace view public.mc_v_reajuste_itens with (security_invoker = true) as
select v.medicao_id, v.contrato_id, v.numero, ra.item_id, sum(ra.valor) as valor
  from public.mc_v_reajuste_medicao v
  join public.mc_reajuste_rateio ra on ra.relatorio_id = v.relatorio_id
 group by v.medicao_id, v.contrato_id, v.numero, ra.item_id;

revoke all on public.mc_v_reajuste_medicao from anon, authenticated;
revoke all on public.mc_v_reajuste_itens from anon, authenticated;
grant select on public.mc_v_reajuste_medicao to authenticated;
grant select on public.mc_v_reajuste_itens to authenticated;

-- ------------------------------------------------------------------ boletim e painel
-- fn_mc_boletim: corpo vivo de 02/10/2026 (md5 756b89fd51a6156103a516ac311066d7) mais o reajuste:
-- por linha (item e grupo) 'reajuste_medicao' (na Nª) e 'reajuste_acumulado' (1ª..Nª), somas do
-- rateio; no total, as mesmas chaves somando o total do relatório que vale (o manual entra só aqui);
-- em cada medição, 'reajuste' e 'reajuste_situacao'.
CREATE OR REPLACE FUNCTION public.fn_mc_boletim(p_contrato uuid, p_ate integer DEFAULT NULL::integer)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE
 SET search_path TO ''
AS $function$
declare
  v_c public.mc_contratos%rowtype;
  v_versao public.mc_planilha_versoes%rowtype;
  v_ultima integer;
  v_ate integer;
  v_valor boolean;
  v_res jsonb;
begin
  if not public.tem_permissao('medicao.boletim', 'ver') then
    raise exception 'Sem permissão para ver o boletim.' using errcode = '42501';
  end if;
  select * into v_c from public.mc_contratos where id = p_contrato and excluido_em is null;
  if not found or not public.fn_mc_acessa_contrato(p_contrato) then
    raise exception 'Contrato não encontrado.' using errcode = 'P0002';
  end if;
  v_valor := v_c.regra_arredondamento is not null;
  select * into v_versao from public.mc_planilha_versoes
   where contrato_id = p_contrato and status = 'vigente' and excluido_em is null
   order by numero desc limit 1;
  select max(numero) into v_ultima from public.mc_medicoes where contrato_id = p_contrato;
  if p_ate is not null and (v_ultima is null or p_ate < 1 or p_ate > v_ultima) then
    raise exception 'A %ª medição não existe no contrato %.', p_ate, v_c.codigo using errcode = 'P0002';
  end if;
  v_ate := coalesce(p_ate, v_ultima);

  with med as (
    select mi.item_id, mi.numero, mi.qtd_efetiva, mi.valor_medicao
    from public.mc_v_medicao_itens mi
    where mi.contrato_id = p_contrato and mi.numero <= coalesce(v_ate, 0)
  ), por_item as (
    select item_id,
           jsonb_object_agg(numero::text, qtd_efetiva::text) as qtds,
           coalesce(sum(valor_medicao) filter (where numero = v_ate), 0) as valor_n,
           coalesce(sum(valor_medicao), 0) as acumulado
    from med group by item_id
  ), reaj as (
    select ri.item_id,
           coalesce(sum(ri.valor) filter (where ri.numero = v_ate), 0) as reaj_n,
           coalesce(sum(ri.valor), 0) as reaj_ac
    from public.mc_v_reajuste_itens ri
    where ri.contrato_id = p_contrato and ri.numero <= coalesce(v_ate, 0)
    group by ri.item_id
  ), linhas as (
    select l.* from public.mc_v_planilha_linhas l where l.versao_id = v_versao.id
  ), sub as (
    select s.ancestral_id as id, sum(l.valor_previsto) as previsto,
           sum(coalesce(p.valor_n, 0)) as valor_n, sum(coalesce(p.acumulado, 0)) as acumulado,
           sum(coalesce(r.reaj_n, 0)) as reaj_n, sum(coalesce(r.reaj_ac, 0)) as reaj_ac
    from public.mc_v_planilha_subarvore s
    join linhas l on l.id = s.linha_id and l.tipo = 'servico'
    left join por_item p on p.item_id = l.item_id
    left join reaj r on r.item_id = l.item_id
    group by s.ancestral_id
  ), valores as (
    select l.*, p.qtds,
           round(case when l.tipo = 'servico' then l.valor_previsto else coalesce(s.previsto, 0) end, 2) as prev,
           round(case when l.tipo = 'servico' then coalesce(p.valor_n, 0) else coalesce(s.valor_n, 0) end, 2) as vn,
           round(case when l.tipo = 'servico' then coalesce(p.acumulado, 0) else coalesce(s.acumulado, 0) end, 2) as ac,
           case when l.tipo = 'servico' then coalesce(r.reaj_n, 0) else coalesce(s.reaj_n, 0) end as rn,
           case when l.tipo = 'servico' then coalesce(r.reaj_ac, 0) else coalesce(s.reaj_ac, 0) end as rac
    from linhas l
    left join sub s on s.id = l.id
    left join por_item p on p.item_id = l.item_id and l.tipo = 'servico'
    left join reaj r on r.item_id = l.item_id and l.tipo = 'servico'
  ), fora as (
    select k.item_id, p.qtds, coalesce(p.valor_n, 0) as valor_n, coalesce(p.acumulado, 0) as acumulado,
           coalesce(r.reaj_n, 0) as reaj_n, coalesce(r.reaj_ac, 0) as reaj_ac, u.codigo, u.descricao, u.unidade
    from (select item_id from por_item union select item_id from reaj) k
    left join por_item p on p.item_id = k.item_id
    left join reaj r on r.item_id = k.item_id
    cross join lateral (
      select pi.codigo, pi.descricao, pi.unidade from public.mc_planilha_itens pi
      join public.mc_planilha_versoes v on v.id = pi.versao_id
      where pi.item_id = k.item_id order by v.numero desc limit 1) u
    where not exists (select 1 from linhas l where l.item_id = k.item_id)
  ), rm as (
    select coalesce(sum(total) filter (where numero = v_ate), 0) as reaj_n, coalesce(sum(total), 0) as reaj_ac
    from public.mc_v_reajuste_medicao where contrato_id = p_contrato and numero <= coalesce(v_ate, 0)
  ), tot as (
    select round((select sum(valor_previsto) from linhas where tipo = 'servico'), 2) as prev,
           round(coalesce((select sum(valor_n) from por_item), 0), 2) as vn,
           round(coalesce((select sum(acumulado) from por_item), 0), 2) as ac,
           (select reaj_n from rm) as rn, (select reaj_ac from rm) as rac
  )
  select jsonb_build_object(
    'contrato', jsonb_build_object('id', v_c.id, 'codigo', v_c.codigo, 'nome_obra', v_c.nome_obra,
      'numero_contrato', v_c.numero_contrato, 'contratante_nome', v_c.contratante_nome,
      'regra_arredondamento', v_c.regra_arredondamento),
    'versao', case when v_versao.id is null then null else jsonb_build_object('id', v_versao.id,
      'numero', v_versao.numero, 'vigente_desde', v_versao.vigente_desde) end,
    'ate', v_ate,
    'medicoes', coalesce((select jsonb_agg(jsonb_build_object('id', m.id, 'numero', m.numero,
        'periodo_inicio', m.periodo_inicio, 'periodo_fim', m.periodo_fim, 'status', m.status,
        'valor', t.valor::text,
        'reajuste', case when v_valor then rv.total::text end,
        'reajuste_situacao', rv.situacao) order by m.numero)
      from public.mc_medicoes m join public.mc_v_medicao_totais t on t.medicao_id = m.id
      left join public.mc_v_reajuste_medicao rv on rv.medicao_id = m.id
      where m.contrato_id = p_contrato), '[]'::jsonb),
    'linhas', coalesce((select jsonb_agg(jsonb_build_object('id', x.id, 'ordem', x.ordem, 'codigo', x.codigo,
        'pai_id', x.pai_id, 'nivel', x.nivel, 'descricao', x.descricao, 'unidade', x.unidade, 'tipo', x.tipo,
        'item_id', x.item_id, 'preco_unitario', x.preco_unitario::text,
        'quantidade_prevista', x.quantidade_prevista::text, 'qtds', coalesce(x.qtds, '{}'::jsonb),
        'previsto', case when v_valor then x.prev::text end,
        'valor_medicao', case when v_valor then x.vn::text end,
        'acumulado', case when v_valor then x.ac::text end,
        'saldo', case when v_valor then (x.prev - x.ac)::text end,
        'pct_executado', case when v_valor and x.prev <> 0 then (x.ac / x.prev)::text end,
        'pct_a_medir', case when v_valor and x.prev <> 0 then ((x.prev - x.ac) / x.prev)::text end,
        'reajuste_medicao', case when v_valor then x.rn::text end,
        'reajuste_acumulado', case when v_valor then x.rac::text end)
        order by x.ordem) from valores x), '[]'::jsonb),
    'fora_da_versao', coalesce((select jsonb_agg(jsonb_build_object('item_id', f.item_id, 'codigo', f.codigo,
        'descricao', f.descricao, 'unidade', f.unidade, 'qtds', coalesce(f.qtds, '{}'::jsonb),
        'valor_medicao', case when v_valor then round(f.valor_n, 2)::text end,
        'acumulado', case when v_valor then round(f.acumulado, 2)::text end,
        'reajuste_medicao', case when v_valor then f.reaj_n::text end,
        'reajuste_acumulado', case when v_valor then f.reaj_ac::text end) order by f.codigo)
      from fora f), '[]'::jsonb),
    'total', (select jsonb_build_object(
        'previsto', case when v_valor then coalesce(t.prev, 0)::text end,
        'valor_medicao', case when v_valor then t.vn::text end,
        'acumulado', case when v_valor then t.ac::text end,
        'saldo', case when v_valor then (coalesce(t.prev, 0) - t.ac)::text end,
        'pct_executado', case when v_valor and coalesce(t.prev, 0) <> 0 then (t.ac / t.prev)::text end,
        'pct_a_medir', case when v_valor and coalesce(t.prev, 0) <> 0 then ((t.prev - t.ac) / t.prev)::text end,
        'reajuste_medicao', case when v_valor then t.rn::text end,
        'reajuste_acumulado', case when v_valor then t.rac::text end)
      from tot t))
  into v_res;
  return v_res;
end $function$;

-- fn_mc_painel: corpo vivo de 02/10/2026 (md5 bb9df460fb014b48c2e69593edb0dc83) mais
-- 'reajuste_acumulado' por contrato (soma do total que vale em cada medição) e no total.
CREATE OR REPLACE FUNCTION public.fn_mc_painel(p_status text[] DEFAULT NULL::text[], p_tipos text[] DEFAULT NULL::text[])
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE
 SET search_path TO ''
AS $function$
declare v_res jsonb;
begin
  if not public.tem_permissao('medicao.painel', 'ver') then
    raise exception 'Sem permissão para ver o painel.' using errcode = '42501';
  end if;
  with c as (
    select c.* from public.mc_contratos c
    where c.excluido_em is null and c.id in (select public.fn_mc_meus_contratos())
      and (p_status is null or c.status = any(p_status))
      and (p_tipos is null or c.contratante_tipo = any(p_tipos))
  ), v as (
    select distinct on (pv.contrato_id) pv.contrato_id, pv.id, pv.numero
    from public.mc_planilha_versoes pv join c on c.id = pv.contrato_id
    where pv.status = 'vigente' and pv.excluido_em is null
    order by pv.contrato_id, pv.numero desc
  ), ac as (
    select mi.contrato_id, round(coalesce(sum(mi.valor_medicao), 0), 2) as acumulado
    from public.mc_v_medicao_itens mi join c on c.id = mi.contrato_id group by mi.contrato_id
  ), rj as (
    select r.contrato_id, sum(r.total) as reajuste from public.mc_v_reajuste_medicao r join c on c.id = r.contrato_id
    group by r.contrato_id
  ), ult as (
    select distinct on (m.contrato_id) m.contrato_id, m.numero, m.status, m.periodo_inicio, m.periodo_fim, t.valor
    from public.mc_medicoes m join c on c.id = m.contrato_id
    join public.mc_v_medicao_totais t on t.medicao_id = m.id
    order by m.contrato_id, m.numero desc
  ), qtd as (
    select m.contrato_id, count(*) as medicoes from public.mc_medicoes m join c on c.id = m.contrato_id group by m.contrato_id
  ), l as (
    select c.id, c.codigo, c.nome_obra, c.contratante_nome, c.contratante_tipo, c.status, v.numero as versao_numero,
           c.regra_arredondamento is not null as tem_valor,
           case when c.regra_arredondamento is not null then coalesce(vt.total_previsto, 0) end as previsto,
           case when c.regra_arredondamento is not null then coalesce(ac.acumulado, 0) end as acumulado,
           case when c.regra_arredondamento is not null then coalesce(rj.reajuste, 0) end as reajuste_acumulado,
           coalesce(qtd.medicoes, 0) as medicoes,
           ult.numero as corrente_numero, ult.status as corrente_status, ult.periodo_inicio, ult.periodo_fim,
           case when c.regra_arredondamento is not null then ult.valor end as corrente_valor
    from c
    left join v on v.contrato_id = c.id
    left join public.mc_v_versao_totais vt on vt.versao_id = v.id
    left join ac on ac.contrato_id = c.id
    left join rj on rj.contrato_id = c.id
    left join ult on ult.contrato_id = c.id
    left join qtd on qtd.contrato_id = c.id
  )
  select jsonb_build_object(
    'contratos', coalesce(jsonb_agg(jsonb_build_object('id', l.id, 'codigo', l.codigo, 'nome_obra', l.nome_obra,
        'contratante_nome', l.contratante_nome, 'contratante_tipo', l.contratante_tipo, 'status', l.status,
        'versao_numero', l.versao_numero, 'previsto', l.previsto::text, 'acumulado', l.acumulado::text,
        'saldo', (l.previsto - l.acumulado)::text,
        'pct_executado', case when l.previsto <> 0 then (l.acumulado / l.previsto)::text end,
        'reajuste_acumulado', l.reajuste_acumulado::text,
        'medicoes', l.medicoes,
        'corrente', case when l.corrente_numero is null then null else jsonb_build_object('numero', l.corrente_numero,
          'status', l.corrente_status, 'periodo_inicio', l.periodo_inicio, 'periodo_fim', l.periodo_fim,
          'valor', l.corrente_valor::text) end) order by l.codigo), '[]'::jsonb),
    'total', jsonb_build_object(
        'previsto', coalesce(sum(l.previsto) filter (where l.tem_valor), 0)::text,
        'acumulado', coalesce(sum(l.acumulado) filter (where l.tem_valor), 0)::text,
        'saldo', coalesce(sum(l.previsto - l.acumulado) filter (where l.tem_valor), 0)::text,
        'pct_executado', case when coalesce(sum(l.previsto) filter (where l.tem_valor), 0) <> 0
          then (sum(l.acumulado) filter (where l.tem_valor) / sum(l.previsto) filter (where l.tem_valor))::text end,
        'corrente', coalesce(sum(l.corrente_valor) filter (where l.tem_valor), 0)::text,
        'reajuste_acumulado', coalesce(sum(l.reajuste_acumulado) filter (where l.tem_valor), 0)::text))
  into v_res from l;
  return v_res;
end $function$;

-- ------------------------------------------------------------------ alertas
-- Definição viva de 02/10/2026 (pg_get_viewdef) mais dois tipos da Fase 6:
--   medicao_sem_reajuste: contrato com reajuste, medição aprovada com início do período a partir de
--     data_base + periodicidade_meses e sem relatório que valha. valor = nº da medição,
--     referencia = data do aniversário (yyyy-mm-dd), data = início do período.
--   reajuste_provisorio: o relatório que vale na medição é provisório. valor = nº da medição,
--     referencia = total do reajuste, data = início do período.
-- "Índice provisório" e "item sem índice" da Fase 5 deixam de existir: o módulo não tem índice.
create or replace view public.mc_v_alertas with (security_invoker = true) as
with c as (
  select * from public.mc_contratos where excluido_em is null
), vig as (
  select distinct on (v.contrato_id) v.contrato_id, v.id as versao_id, v.numero
    from public.mc_planilha_versoes v join c on c.id = v.contrato_id
   where v.status = 'vigente' and v.excluido_em is null order by v.contrato_id, v.numero desc
), v0 as (
  select v.contrato_id, t.total_previsto from public.mc_planilha_versoes v join public.mc_v_versao_totais t on t.versao_id = v.id
   where v.numero = 0 and v.status = 'vigente' and v.excluido_em is null
), acum as (
  select contrato_id, round(sum(valor_acumulado_exato), 2) as valor from public.mc_v_item_acumulado group by contrato_id
), fim as (
  select c.id as contrato_id,
         (coalesce(case when c.inicio_prazo = 'ordem_servico' then c.data_ordem_servico end, c.data_assinatura)
          + make_interval(months => c.prazo_meses + coalesce((select sum(a.prazo_acrescido_meses) from public.mc_aditivos a
                                                              where a.contrato_id = c.id and a.excluido_em is null), 0)::int))::date as fim_prazo
    from c
), aniv as (
  select rc.contrato_id, (rc.data_base + make_interval(months => rc.periodicidade_meses))::date as aniversario
    from public.mc_reajuste_config rc join c on c.id = rc.contrato_id
   where rc.tem_reajuste and rc.data_base is not null
)
select c.id as contrato_id, c.codigo, 'acumulado_acima_previsto'::text as tipo, 'alta'::text as gravidade, pi.item_id,
       pi.codigo as item_codigo, pi.unidade, a.qtd_acumulada::text as valor, pi.quantidade_prevista::text as referencia,
       null::date as data,
       exists (select 1 from public.mc_lancamentos l where l.contrato_id = c.id and l.item_id = pi.item_id
               and l.excluido_em is null and l.motivo_excesso is not null) as com_motivo
  from c join vig on vig.contrato_id = c.id
  join public.mc_planilha_itens pi on pi.versao_id = vig.versao_id and pi.tipo = 'servico'
  join public.mc_v_item_acumulado a on a.contrato_id = c.id and a.item_id = pi.item_id
 where a.qtd_acumulada > pi.quantidade_prevista
union all
select c.id, c.codigo, 'prazo_perto_do_fim', case when f.fim_prazo < current_date then 'alta' else 'media' end, null, null, null,
       (f.fim_prazo - current_date)::text, c.alerta_prazo_dias::text, f.fim_prazo, false
  from c join fim f on f.contrato_id = c.id
 where c.status = 'ativo' and f.fim_prazo is not null and f.fim_prazo - current_date <= c.alerta_prazo_dias
union all
select c.id, c.codigo, 'valor_perto_do_previsto', 'media', null, null, null,
       round(ac.valor / t.total_previsto * 100, 2)::text, c.alerta_valor_pct::text, null, false
  from c join vig on vig.contrato_id = c.id join public.mc_v_versao_totais t on t.versao_id = vig.versao_id
  join acum ac on ac.contrato_id = c.id
 where c.regra_arredondamento is not null and t.total_previsto > 0 and ac.valor / t.total_previsto * 100 >= c.alerta_valor_pct
union all
select c.id, c.codigo, 'valor_contrato_diferente', 'baixa', null, null, null,
       c.valor_inicial::text, v0.total_previsto::text, null, false
  from c join v0 on v0.contrato_id = c.id
 where c.valor_inicial is not null and v0.total_previsto is not null and c.valor_inicial <> v0.total_previsto
union all
select c.id, c.codigo, 'medicao_sem_reajuste', 'media', null, null, null,
       m.numero::text, an.aniversario::text, m.periodo_inicio, false
  from c join aniv an on an.contrato_id = c.id
  join public.mc_medicoes m on m.contrato_id = c.id and m.status = 'aprovada' and m.periodo_inicio >= an.aniversario
 where not exists (select 1 from public.mc_v_reajuste_medicao rv where rv.medicao_id = m.id)
union all
select c.id, c.codigo, 'reajuste_provisorio', 'baixa', null, null, null,
       rv.numero::text, rv.total::text, m.periodo_inicio, false
  from c join public.mc_v_reajuste_medicao rv on rv.contrato_id = c.id
  join public.mc_medicoes m on m.id = rv.medicao_id
 where rv.situacao = 'provisorio';
revoke all on public.mc_v_alertas from anon, authenticated;
grant select on public.mc_v_alertas to authenticated;

-- ------------------------------------------------------------------ grants
revoke all on function public.fn_mc_ratear(numeric, uuid[], numeric[]) from public, anon, authenticated;
revoke all on function public.fn_mc_brl(numeric) from public, anon, authenticated;
revoke all on function public.fn_mc_trava_reajuste() from public, anon, authenticated;
revoke all on function public.fn_mc_trava_reajuste_filho() from public, anon, authenticated;
do $g$
declare f text;
begin
  foreach f in array array['fn_mc_reajuste_importar(uuid, jsonb, boolean)', 'fn_mc_reajuste_manual(uuid, jsonb)',
                           'fn_mc_reajuste_excluir(uuid, text)', 'fn_mc_reajuste_config_salvar(uuid, jsonb)'] loop
    execute format('revoke all on function public.%s from public, anon', f);
    execute format('grant execute on function public.%s to authenticated', f);
  end loop;
end $g$;