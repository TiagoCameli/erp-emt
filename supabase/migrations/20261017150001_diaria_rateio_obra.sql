-- RH Diárias: obra obrigatória e rateio da diária entre obras por percentual.
--
-- Antes: rh_diarias.obra_id era opcional e o fechamento (fn_fechar_diarias)
-- ignorava a obra da diária: jogava o custo inteiro no centro do CADASTRO do
-- colaborador. Caso real (05/10/2026): Emanuel, 600 na AC 405 + 500 na BR-364,
-- caiu tudo no 007.
--
-- Agora:
--   * rh_diaria_rateios: cada diária reparte o próprio valor entre centros raiz
--     (obra, Escritório Central, Manutenção/Documentação) por percentual, soma
--     exatamente 100. É a fonte da verdade da obra da diária.
--   * rh_diarias.obra_id passa a ser DERIVADO: a obra da linha de maior
--     percentual (null quando ela é Escritório/Manutenção). Mantido para o
--     bloqueio de excluir obra e para quem já lê a coluna.
--   * fn_diaria_valor_por_centro: o valor da diária em reais por centro. Divide
--     antes de arredondar; o centavo que sobra vai para a linha de maior
--     percentual. Usada pelo fechamento, pela ressincronização e pela folha.
--   * fn_fechar_diarias e fn_diaria_ressincronizar_lancamento montam o rateio
--     do lançamento pelas obras das diárias (fn_diaria_refazer_rateio_lancamento).
--   * fn_salvar_diaria ganha p_rateio (jsonb). Cliente antigo (só p_obra) segue
--     funcionando: obra vira 100%. Sem obra nenhuma, recusa.

-- ---------------------------------------------------------------- tabela
create table public.rh_diaria_rateios (
  id uuid primary key default gen_random_uuid(),
  diaria_id uuid not null references public.rh_diarias(id) on delete cascade,
  centro_custo_id uuid not null references public.centros_custo(id),
  -- Taxa, não dinheiro: 4 casas (7/11 = 63,6364%).
  percentual numeric(7, 4) not null check (percentual > 0 and percentual <= 100),
  created_at timestamptz not null default now(),
  created_by uuid,
  unique (diaria_id, centro_custo_id)
);
comment on table public.rh_diaria_rateios is
  'Rateio da diária entre centros raiz por percentual (soma 100). Grava só por fn_diaria_gravar_rateio.';
create index idx_rh_diaria_rateios_centro on public.rh_diaria_rateios (centro_custo_id);

create trigger trg_rh_diaria_rateios_created_by before insert on public.rh_diaria_rateios
  for each row execute function public.fn_set_created_by();
create trigger trg_audit_rh_diaria_rateios after insert or update or delete on public.rh_diaria_rateios
  for each row execute function public.fn_audit();

alter table public.rh_diaria_rateios enable row level security;
create policy rh_diaria_rateios_select on public.rh_diaria_rateios for select to authenticated
  using ((select public.tem_permissao('rh.diaristas', 'ver')));
-- Escrita só pelas funções SECURITY DEFINER: o default do schema daria tudo.
revoke all on table public.rh_diaria_rateios from anon, authenticated;
grant select on table public.rh_diaria_rateios to authenticated;

-- ---------------------------------------------------------------- valor por centro
-- Diária sem rateio (não deveria existir depois do backfill de 17/10/2026) cai
-- inteira no centro do cadastro do colaborador, como era antes.
create or replace function public.fn_diaria_valor_por_centro(p_diaria uuid)
returns table (centro_custo_id uuid, valor numeric)
language sql
stable
security definer
set search_path to ''
as $$
  with d as (
    select d.id, d.valor, c.centro_custo_id as centro_cadastro
    from public.rh_diarias d
    join public.colaboradores c on c.id = d.colaborador_id
    where d.id = p_diaria
  ),
  linhas as (
    select r.centro_custo_id, r.percentual, d.valor,
           round(d.valor * r.percentual / 100, 2) as bruto,
           row_number() over (order by r.percentual desc, r.centro_custo_id) as rn
    from d join public.rh_diaria_rateios r on r.diaria_id = d.id
  )
  select l.centro_custo_id,
         l.bruto + case when l.rn = 1 then l.valor - sum(l.bruto) over () else 0 end
  from linhas l
  union all
  select d.centro_cadastro, d.valor
  from d
  where not exists (select 1 from public.rh_diaria_rateios r where r.diaria_id = d.id);
$$;
revoke all on function public.fn_diaria_valor_por_centro(uuid) from public, anon, authenticated;

-- ---------------------------------------------------------------- gravar rateio
-- p_rateio: [{"centro_custo_id": uuid, "percentual": numeric}, ...]
create or replace function public.fn_diaria_gravar_rateio(p_diaria uuid, p_rateio jsonb)
returns void
language plpgsql
security definer
set search_path to ''
as $$
declare
  v_qtd int;
  v_distintos int;
  v_soma numeric;
  v_obra uuid;
begin
  if p_rateio is null or jsonb_typeof(p_rateio) <> 'array' then
    raise exception 'Escolha a obra da diaria';
  end if;
  v_qtd := jsonb_array_length(p_rateio);
  if v_qtd = 0 then raise exception 'Escolha a obra da diaria'; end if;

  if exists (
    select 1 from jsonb_array_elements(p_rateio) x
    where nullif(x->>'centro_custo_id', '') is null
  ) then
    raise exception 'Toda linha do rateio precisa de uma obra';
  end if;

  if exists (
    select 1 from jsonb_array_elements(p_rateio) x
    where coalesce((x->>'percentual')::numeric, 0) <= 0
       or (x->>'percentual')::numeric > 100
       or (x->>'percentual')::numeric <> round((x->>'percentual')::numeric, 4)
  ) then
    raise exception 'Percentual do rateio precisa ser maior que zero, ate 100 e com ate 4 casas';
  end if;

  select count(distinct x->>'centro_custo_id') into v_distintos
  from jsonb_array_elements(p_rateio) x;
  if v_distintos <> v_qtd then
    raise exception 'A mesma obra aparece em duas linhas do rateio: some numa linha so';
  end if;

  select sum((x->>'percentual')::numeric) into v_soma from jsonb_array_elements(p_rateio) x;
  if v_soma <> 100 then
    raise exception 'O rateio da diaria tem que somar 100%% (esta somando %)',
      rtrim(rtrim(to_char(v_soma, 'FM9990.0000'), '0'), '.') || '%';
  end if;

  -- Só centro raiz de obra, Escritório ou Manutenção. Inativo (ou obra inativa)
  -- só se JÁ estava nesta diária: senão a edição que tira o custo de lá seria
  -- justamente a que fica trancada.
  if exists (
    select 1 from jsonb_array_elements(p_rateio) x
    left join public.centros_custo c on c.id = (x->>'centro_custo_id')::uuid
    left join public.obras o on o.id = c.obra_id
    where c.id is null
       or c.nivel <> 1
       or c.tipo not in ('obra', 'escritorio', 'manutencao')
       or ((not c.ativo or coalesce(not o.ativo, false))
           and not exists (
             select 1 from public.rh_diaria_rateios r
             where r.diaria_id = p_diaria and r.centro_custo_id = c.id))
  ) then
    raise exception 'Obra invalida ou inativa no rateio da diaria';
  end if;

  delete from public.rh_diaria_rateios where diaria_id = p_diaria;
  insert into public.rh_diaria_rateios (diaria_id, centro_custo_id, percentual)
  select p_diaria, (x->>'centro_custo_id')::uuid, (x->>'percentual')::numeric
  from jsonb_array_elements(p_rateio) x;

  -- obra_id derivado: a obra da linha de maior percentual.
  select c.obra_id into v_obra
  from public.rh_diaria_rateios r
  join public.centros_custo c on c.id = r.centro_custo_id
  where r.diaria_id = p_diaria
  order by r.percentual desc, r.centro_custo_id
  limit 1;
  update public.rh_diarias set obra_id = v_obra where id = p_diaria;
end;
$$;
revoke all on function public.fn_diaria_gravar_rateio(uuid, jsonb) from public, anon, authenticated;

-- Obra (cliente antigo, fn_editar_diaria) -> rateio de 100% no centro raiz dela.
create or replace function public.fn_diaria_rateio_da_obra(p_obra uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path to ''
as $$
declare v_centro uuid;
begin
  if p_obra is null then raise exception 'Escolha a obra da diaria'; end if;
  select id into v_centro from public.centros_custo
  where obra_id = p_obra and nivel = 1 order by created_at limit 1;
  if v_centro is null then raise exception 'A obra escolhida nao tem centro de custo'; end if;
  return jsonb_build_array(jsonb_build_object('centro_custo_id', v_centro, 'percentual', 100));
end;
$$;
revoke all on function public.fn_diaria_rateio_da_obra(uuid) from public, anon, authenticated;

-- ---------------------------------------------------------------- rateio do lançamento
-- Refaz lancamento_rateios a partir das diárias ligadas ao lançamento e acerta
-- lancamentos.centro_custo_id para o centro de maior valor. Categoria de cada
-- centro que continua é preservada (mesma foto da fn_definir_rateio_lancamento).
-- p_motivo não nulo grava a troca em rateio_eventos (trilha do lançamento).
create or replace function public.fn_diaria_refazer_rateio_lancamento(p_lanc uuid, p_motivo text)
returns void
language plpgsql
security definer
set search_path to ''
as $$
declare
  v_antes jsonb;
  v_depois jsonb;
  v_categorias jsonb;
  v_principal uuid;
begin
  -- Mesmo formato e ordem da trilha da fn_definir_rateio_lancamento.
  select coalesce(jsonb_agg(jsonb_build_object('centro_custo_id', p.centro_custo_id, 'valor', p.valor)
           order by p.valor desc, p.centro_custo_id), '[]'::jsonb)
  into v_depois
  from (
    select rv.centro_custo_id, round(sum(rv.valor), 2) as valor
    from public.rh_diarias d
    cross join lateral public.fn_diaria_valor_por_centro(d.id) rv
    where d.lancamento_id = p_lanc
    group by rv.centro_custo_id
  ) p;

  if v_depois = '[]'::jsonb then return; end if;
  if exists (select 1 from jsonb_array_elements(v_depois) x where x->>'centro_custo_id' is null) then
    raise exception 'Ha diaria sem obra e o diarista nao tem centro de custo no cadastro: escolha a obra da diaria';
  end if;

  select coalesce(jsonb_agg(jsonb_build_object('centro_custo_id', centro_custo_id, 'valor', valor)
           order by valor desc, centro_custo_id), '[]'::jsonb)
  into v_antes from public.lancamento_rateios where lancamento_id = p_lanc;

  if v_antes = v_depois then return; end if;

  select coalesce(jsonb_object_agg(centro_custo_id::text, categoria_id), '{}'::jsonb)
  into v_categorias
  from public.lancamento_rateios where lancamento_id = p_lanc and categoria_id is not null;

  delete from public.lancamento_rateios where lancamento_id = p_lanc;
  insert into public.lancamento_rateios (lancamento_id, centro_custo_id, categoria_id, valor, created_by)
  select p_lanc, (x->>'centro_custo_id')::uuid,
         nullif(v_categorias->>(x->>'centro_custo_id'), '')::uuid,
         (x->>'valor')::numeric, (select auth.uid())
  from jsonb_array_elements(v_depois) x;

  -- v_depois já vem ordenado por valor desc: o primeiro é o principal.
  v_principal := (v_depois->0->>'centro_custo_id')::uuid;
  update public.lancamentos set centro_custo_id = v_principal
  where id = p_lanc and centro_custo_id is distinct from v_principal;

  if p_motivo is not null and v_antes <> '[]'::jsonb then
    insert into public.rateio_eventos (lancamento_id, motivo, antes, depois, created_by)
    values (p_lanc, p_motivo, v_antes, v_depois, (select auth.uid()));
  end if;
end;
$$;
revoke all on function public.fn_diaria_refazer_rateio_lancamento(uuid, text) from public, anon, authenticated;

-- ---------------------------------------------------------------- opções da tela
-- O catálogo centros_custo não abre para quem é só do RH (mesmo motivo da
-- fn_diaria_funcoes). Devolve os inativos também, para a tabela mostrar o nome
-- de diária antiga; a tela oferece só os ativos.
create or replace function public.fn_diaria_centros()
returns table (id uuid, nome text, tipo text, obra_id uuid, ativo boolean)
language plpgsql
stable
security definer
set search_path to ''
as $$
begin
  if not public.tem_permissao('rh.diaristas', 'ver') then
    raise exception 'Sem permissao para ver diarias';
  end if;
  return query
  select c.id, c.nome, c.tipo, c.obra_id, (c.ativo and coalesce(o.ativo, true))
  from public.centros_custo c
  left join public.obras o on o.id = c.obra_id
  where c.nivel = 1 and c.tipo in ('obra', 'escritorio', 'manutencao')
  order by c.nome;
end;
$$;
revoke all on function public.fn_diaria_centros() from public, anon;
grant execute on function public.fn_diaria_centros() to authenticated;

-- ---------------------------------------------------------------- salvar
drop function public.fn_salvar_diaria(uuid, uuid, uuid, uuid, date, date, date[], date[], numeric, text);

create function public.fn_salvar_diaria(
  p_id uuid, p_colaborador uuid, p_funcao uuid, p_obra uuid, p_inicio date, p_fim date,
  p_meias date[], p_faltas date[], p_valor_diaria numeric, p_observacao text,
  p_rateio jsonb default null)
returns uuid
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_id uuid := p_id;
  v_lanc uuid;
  v_qtd numeric;
  v_total numeric;
  v_comp date;
  v_colab uuid;
  v_comp_atual date;
  v_meias date[];
  v_faltas date[];
  v_rateio jsonb;
begin
  if p_colaborador is null then raise exception 'Selecione o diarista'; end if;
  if p_funcao is null then raise exception 'Selecione a funcao'; end if;
  if p_valor_diaria is null or p_valor_diaria <= 0 then
    raise exception 'Informe o valor da diaria';
  end if;
  if not exists (select 1 from public.funcoes where id = p_funcao and ativo) then
    raise exception 'Funcao invalida ou inativa';
  end if;

  -- Obra obrigatória desde 17/10/2026. Cliente antigo manda só p_obra.
  v_rateio := coalesce(p_rateio, case when p_obra is not null then public.fn_diaria_rateio_da_obra(p_obra) end);
  if v_rateio is null or jsonb_array_length(v_rateio) = 0 then
    raise exception 'Escolha a obra da diaria';
  end if;

  v_qtd := public.fn_diaria_calcular(p_inicio, p_fim, p_meias, p_faltas);
  if v_qtd <= 0 then raise exception 'Nenhum dia trabalhado no periodo'; end if;

  v_total := round(v_qtd * round(p_valor_diaria, 2), 2);
  v_comp := date_trunc('month', p_inicio)::date;
  select coalesce(array_agg(distinct d order by d), '{}') into v_meias from unnest(coalesce(p_meias, '{}')) d;
  select coalesce(array_agg(distinct d order by d), '{}') into v_faltas from unnest(coalesce(p_faltas, '{}')) d;

  if v_id is null then
    if not public.tem_permissao('rh.diaristas', 'criar') then
      raise exception 'Sem permissao para registrar diarias';
    end if;

    insert into public.rh_diarias (
      colaborador_id, funcao_id, obra_id, data, data_fim, competencia,
      valor_diaria, qtd_diarias, dias_meia, dias_falta, valor, observacao
    ) values (
      p_colaborador, p_funcao, null, p_inicio, p_fim, v_comp,
      round(p_valor_diaria, 2), v_qtd, v_meias, v_faltas, v_total,
      nullif(btrim(p_observacao), '')
    ) returning id into v_id;

    perform public.fn_diaria_gravar_rateio(v_id, v_rateio);
  else
    v_lanc := public.fn_diaria_exigir_alteravel(v_id);

    if v_lanc is not null then
      select colaborador_id, competencia into v_colab, v_comp_atual
      from public.rh_diarias where id = v_id;
      if v_colab <> p_colaborador then
        raise exception 'Diaria ja fechada nao troca de diarista: exclua e lance de novo';
      end if;
      if v_comp_atual <> v_comp then
        raise exception 'Diaria ja fechada nao troca de mes: exclua e lance de novo';
      end if;
    end if;

    update public.rh_diarias
    set colaborador_id = p_colaborador,
        funcao_id = p_funcao,
        data = p_inicio,
        data_fim = p_fim,
        competencia = v_comp,
        valor_diaria = round(p_valor_diaria, 2),
        qtd_diarias = v_qtd,
        dias_meia = v_meias,
        dias_falta = v_faltas,
        valor = v_total,
        observacao = nullif(btrim(p_observacao), '')
    where id = v_id;

    perform public.fn_diaria_gravar_rateio(v_id, v_rateio);

    if v_lanc is not null then
      perform public.fn_diaria_ressincronizar_lancamento(v_lanc);
    end if;
  end if;

  perform public.fn_diaria_atualizar_valor_funcao(v_id);
  return v_id;
end;
$function$;
revoke all on function public.fn_salvar_diaria(uuid, uuid, uuid, uuid, date, date, date[], date[], numeric, text, jsonb) from public, anon;
grant execute on function public.fn_salvar_diaria(uuid, uuid, uuid, uuid, date, date, date[], date[], numeric, text, jsonb) to authenticated;

-- ---------------------------------------------------------------- editar (legado, dia único)
create or replace function public.fn_editar_diaria(p_id uuid, p_colaborador uuid, p_obra uuid, p_data date, p_valor numeric, p_observacao text)
returns void
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_lanc uuid; v_colab uuid; v_comp date; v_nova_comp date;
begin
  if p_colaborador is null then raise exception 'Selecione o diarista'; end if;
  if p_data is null then raise exception 'Informe a data'; end if;
  if p_valor is null or p_valor <= 0 then raise exception 'Informe um valor maior que zero'; end if;
  if p_obra is null then raise exception 'Escolha a obra da diaria'; end if;

  v_lanc := public.fn_diaria_exigir_alteravel(p_id);
  v_nova_comp := date_trunc('month', p_data)::date;

  if v_lanc is not null then
    select colaborador_id, competencia into v_colab, v_comp
    from public.rh_diarias where id = p_id;
    if v_colab <> p_colaborador then
      raise exception 'Diaria ja fechada nao troca de diarista: exclua e lance de novo';
    end if;
    if v_comp <> v_nova_comp then
      raise exception 'Diaria ja fechada nao troca de mes: exclua e lance de novo';
    end if;
  end if;

  update public.rh_diarias
  set colaborador_id = p_colaborador,
      data = p_data,
      competencia = v_nova_comp,
      valor = round(p_valor, 2),
      observacao = nullif(btrim(p_observacao), '')
  where id = p_id;

  perform public.fn_diaria_gravar_rateio(p_id, public.fn_diaria_rateio_da_obra(p_obra));

  if v_lanc is not null then
    perform public.fn_diaria_ressincronizar_lancamento(v_lanc);
  end if;
end;
$function$;

-- ---------------------------------------------------------------- ressincronizar
-- Antes recusava lançamento com mais de um rateio. Agora o rateio do lançamento
-- de diária É derivado das diárias: refaz pela obra delas. Edição manual feita
-- no Financeiro é reescrita aqui (o diálogo "Editar rateio" já avisa que
-- alterar o documento de origem refaz o rateio).
create or replace function public.fn_diaria_ressincronizar_lancamento(p_lanc uuid)
returns void
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_total numeric(14, 2);
  v_qtd int;
  v_parcelas int;
begin
  select count(*), coalesce(round(sum(valor), 2), 0) into v_qtd, v_total
  from public.rh_diarias where lancamento_id = p_lanc;

  if v_qtd = 0 or v_total <= 0 then
    -- Solta o vínculo antes: rh_diarias_lancamento_id_fkey é FK simples.
    update public.rh_diarias set lancamento_id = null where lancamento_id = p_lanc;
    delete from public.lancamentos where id = p_lanc;
    return;
  end if;

  select count(*) into v_parcelas from public.lancamento_parcelas where lancamento_id = p_lanc;

  if v_parcelas <> 1
     or exists (select 1 from public.lancamento_formas where lancamento_id = p_lanc) then
    raise exception 'Nao da para alterar: o lancamento desta diaria foi repartido no Financeiro (parcelas ou formas). Ajuste o lancamento por la';
  end if;

  update public.lancamentos set valor = v_total where id = p_lanc and valor <> v_total;
  update public.lancamento_parcelas set valor = v_total where lancamento_id = p_lanc and valor <> v_total;
  perform public.fn_diaria_refazer_rateio_lancamento(p_lanc, 'Diaria alterada em RH > Diarias');
end;
$function$;

-- ---------------------------------------------------------------- fechar
create or replace function public.fn_fechar_diarias(p_colaborador uuid, p_competencia date, p_data_vencimento date, p_forma_pagamento uuid)
returns uuid
language plpgsql
security definer
set search_path to ''
as $function$
declare v_total numeric; v_nome text; v_cc uuid; v_lanc uuid; v_comp date;
begin
  if not public.tem_permissao('rh.diaristas', 'criar') then raise exception 'Sem permissao para fechar diarias'; end if;
  v_comp := date_trunc('month', p_competencia)::date;

  if p_data_vencimento is null then
    raise exception 'Informe o vencimento do pagamento das diarias';
  end if;
  if p_forma_pagamento is null then
    raise exception 'Escolha a forma de pagamento das diarias';
  end if;
  if not exists (
    select 1 from public.formas_pagamento where id = p_forma_pagamento and ativo
  ) then
    raise exception 'Forma de pagamento invalida ou inativa';
  end if;

  perform public.fn_exigir_competencia_aberta(v_comp, 'lancamento', null);

  -- "Em aberto" tem DUAS condicoes: sem lancamento e sem folha. A folha aprovada
  -- marca folha_id nas diarias que pagou, e sem esta segunda condicao o
  -- fechamento pagaria de novo o mes que a folha ja pagou.
  perform 1 from public.rh_diarias
  where colaborador_id = p_colaborador and competencia = v_comp
    and lancamento_id is null and folha_id is null for update;

  select coalesce(sum(valor), 0) into v_total from public.rh_diarias
  where colaborador_id = p_colaborador and competencia = v_comp
    and lancamento_id is null and folha_id is null;
  if v_total <= 0 then raise exception 'Nao ha diarias em aberto nessa competencia'; end if;

  select nome, centro_custo_id into v_nome, v_cc from public.colaboradores where id = p_colaborador;

  -- colaborador_id e categoria_id NAO entram aqui: quem preenche e o trigger,
  -- para os tres caminhos do RH no mesmo lugar. O centro do cadastro e so o
  -- ponto de partida: o rateio abaixo troca pelo centro de maior valor.
  insert into public.lancamentos (tipo, origem, origem_id, centro_custo_id, descricao, valor, status, data_compra, mes_competencia, data_vencimento, forma_pagamento_id, created_by)
  values ('a_pagar', 'diaria', p_colaborador, v_cc, 'Diarias ' || coalesce(v_nome, '') || ' ' || to_char(v_comp, 'MM/YYYY'), v_total, 'a_pagar',
          (now() at time zone 'America/Rio_Branco')::date, v_comp, p_data_vencimento, p_forma_pagamento, (select auth.uid()))
  returning id into v_lanc;
  insert into public.lancamento_parcelas (lancamento_id, numero_parcela, valor, data_vencimento, status, created_by)
  values (v_lanc, 1, v_total, p_data_vencimento, 'pendente', (select auth.uid()));

  update public.rh_diarias set lancamento_id = v_lanc
  where colaborador_id = p_colaborador and competencia = v_comp
    and lancamento_id is null and folha_id is null;

  -- Rateio pelas obras das diarias (antes: tudo no centro do cadastro).
  perform public.fn_diaria_refazer_rateio_lancamento(v_lanc, null);
  return v_lanc;
end;
$function$;

-- ---------------------------------------------------------------- folha e obra
-- As três abaixo são a versão VIVA (lida do banco em 17/10/2026) com só o
-- trecho de diária trocado: folha pega o centro de maior valor pelo rateio;
-- excluir obra também enxerga diária rateada no centro dela.

CREATE OR REPLACE FUNCTION public.fn_gerar_folha(p_competencia date, p_encargos_pct numeric DEFAULT 0)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_folha uuid; v_status text; v_ini date; v_fim date;
  v_colab record; v_hn numeric; v_he numeric; v_extras numeric;
  v_adiant numeric; v_custo numeric; v_liquido numeric; v_cc uuid;
  v_item_id uuid; v_pct_total numeric;
  v_encargos numeric; v_provisoes numeric;
  -- Base do mes, gratificacao e percentual de DESCONTO do item: dependem do
  -- vinculo, do cadastro e do que o Tiago editou a mao nesta folha.
  v_base numeric; v_grat numeric; v_desc_val numeric; v_manual boolean;
  v_desconto numeric;
  v_man jsonb; v_manuais jsonb;
  -- Descontos legais por colaborador (Bloco 7 / Task 4), agora via helper.
  v_inss numeric; v_irrf numeric;
  -- Bloco 8b / Task 3: adiantamento descontado por parcela, com cascata.
  v_disponivel numeric; v_par record; v_desc_par numeric; v_trava date;
  -- Avos de 30 trabalhados na competencia (29/08/2026). Null para diarista, que
  -- ja e proporcional por construcao.
  v_avos integer;
begin
  if not public.tem_permissao('rh.folha', 'criar') then raise exception 'Sem permissao para gerar folha'; end if;
  -- p_encargos_pct: LEGADO. Os encargos vem de public.folha_encargos (ativos).
  -- Mantido na assinatura so para nao quebrar o RPC/call existente; ignorado no
  -- calculo.
  v_ini := date_trunc('month', p_competencia)::date;
  v_fim := (v_ini + interval '1 month')::date;

  -- Soma dos percentuais ativos: valor informativo gravado em
  -- folhas.encargos_percentual.
  select coalesce(sum(percentual), 0) into v_pct_total from public.folha_encargos where ativo;

  -- Folha nova nao tem edicao manual nenhuma para preservar.
  v_manuais := '{}'::jsonb;

  select id, status into v_folha, v_status from public.folhas where competencia = v_ini;
  if v_status is not null and v_status <> 'rascunho' then
    raise exception 'A folha de %/% esta em "%": só da para gerar em rascunho. Rejeite ou desaprove antes de regerar.',
      to_char(v_ini, 'MM'), to_char(v_ini, 'YYYY'), v_status;
  end if;
  if v_folha is null then
    insert into public.folhas (competencia, encargos_percentual, created_by) values (v_ini, v_pct_total, (select auth.uid())) returning id into v_folha;
  else
    -- Regenerar apaga as sobras que ESTA folha empurrou. Mas uma folha
    -- POSTERIOR pode ja ter descontado uma dessas sobras: apagar ali deixaria o
    -- item daquela folha apontando para parcela que nao existe mais, com o
    -- dinheiro dela ja lancado no Financeiro. Recusar e melhor que apagar em
    -- silencio ou pela metade. A isencao vale SO para folha que esta em rascunho
    -- E e POSTERIOR a esta (por isso a trava abaixo tambem dispara quando
    -- f.competencia < v_ini): nada saiu de uma posterior em rascunho ainda, e
    -- travar seria indestravavel, porque regerar a posterior liberaria a parcela
    -- no inicio e a redescontaria no fim, para sempre.
    -- Esse argumento de indestravabilidade NAO vale para folha ANTERIOR, e por
    -- isso ela trava mesmo em rascunho: se algum codigo mover uma sobra para
    -- competencia anterior a folha que a criou (a Task 5 move parcelas entre
    -- competencias), regenerar esta folha apagaria uma parcela JA FECHADA, e o
    -- desconto dela viraria dinheiro cobrado do colaborador sem registro nenhum
    -- no plano. Medido sem esta condicao de ordem: adiantamento de 5200,00 com a
    -- sobra movida para o mes anterior, 1842,77 cobrados via liquido e
    -- INVISIVEIS no ledger, e a folha que cobra a mais aprovando sem atrito.
    -- Os dois status que travam tem volta documentada para rascunho:
    -- pendente_aprovacao pela rejeicao, aprovado pela desaprovacao.
    select f.competencia into v_trava
    from public.rh_adiantamento_parcelas pa
    join public.folhas f on f.id = pa.folha_id
    where pa.gerada_por_folha_id = v_folha
      and pa.folha_id <> v_folha
      and (f.status <> 'rascunho' or f.competencia < v_ini)
    order by f.competencia
    limit 1;
    if v_trava is not null then
      raise exception 'Nao da para regerar a folha de %/%: a sobra de adiantamento que ela empurrou ja foi descontada na folha de %/%. Se aquela folha e POSTERIOR a esta, desaprove ou rejeite ela antes de regerar esta. Se ela e ANTERIOR, o plano deste adiantamento esta fora de ordem (parcela de sobra empurrada para tras) e precisa ser corrigido antes.',
        to_char(v_ini, 'MM'), to_char(v_ini, 'YYYY'),
        to_char(v_trava, 'MM'), to_char(v_trava, 'YYYY');
    end if;

    -- Guarda o que o Tiago editou a mao ANTES de apagar os itens, e reaplica no
    -- loop. Sem este snapshot, um Regerar apagaria em silencio a gratificacao e
    -- o DESCONTO que ele acabou de digitar na tela, e a folha voltaria a mostrar
    -- o numero do cadastro sem avisar ninguem — o valor some e a unica pista e o
    -- total do rodape ter mudado.
    -- Chave: colaborador_id (nao o id do item, que morre no delete).
    -- TODOS os campos que a fn_editar_item_folha grava, e nao so os tres de
    -- dinheiro. Campo editavel fora deste objeto e armadilha: a pessoa edita,
    -- clica em Regerar por outro motivo, e o valor volta ao do cadastro em
    -- silencio. `desconto_horas` entrou junto em 29/08/2026 — ele ja era
    -- editavel e ja se perdia aqui desde sempre (o valor do desconto
    -- sobrevivia, o motivo em horas nao).
    select coalesce(jsonb_object_agg(colaborador_id::text, jsonb_build_object(
             'salario_base', salario_base,
             'gratificacao', gratificacao,
             'descontos', descontos,
             'desconto_horas', desconto_horas,
             'centro_custo_id', centro_custo_id,
             'horas_normais', horas_normais,
             'horas_extras', horas_extras,
             'valor_extras', valor_extras)), '{}'::jsonb)
    into v_manuais
    from public.folha_itens
    where folha_id = v_folha and editado_manualmente;

    delete from public.rh_adiantamento_parcelas where gerada_por_folha_id = v_folha;
    update public.rh_adiantamento_parcelas
       set folha_id = null, valor_descontado = 0
     where folha_id = v_folha;
    -- delete cascateia para folha_item_encargos e folha_item_provisoes
    -- (as duas FKs sao ON DELETE CASCADE): regerar nao deixa linha orfa.
    delete from public.folha_itens where folha_id = v_folha;
    update public.folhas set encargos_percentual = v_pct_total where id = v_folha;
  end if;

  for v_colab in
    select c.id,
           coalesce(c.salario, 0) as salario,
           c.centro_custo_id,
           c.vinculo,
           coalesce(c.gratificacao, 0) as gratificacao,
           c.desconto_valor,
           c.data_admissao,
           c.data_demissao
    from public.colaboradores c
    where (
            c.ativo
            -- Desligado continua entrando na folha da competencia em que saiu (e
            -- nas anteriores, se alguem regerar). Sem esta perna, `ativo = false`
            -- tiraria a pessoa da propria folha que tem de pagar os dias que ela
            -- trabalhou, e o desligamento viraria calote silencioso do ultimo mes.
            or (c.data_demissao is not null and c.data_demissao >= v_ini)
          )
      and c.vinculo in ('clt', 'terceiro', 'diarista')
      -- Fora DESTA folha por decisao de quem esta montando ela. Por folha, nao
      -- por pessoa: na competencia seguinte (outra folha) ele entra por padrao.
      -- Ver public.folha_exclusoes e fn_tirar_da_folha.
      and not exists (
        select 1 from public.folha_exclusoes x
        where x.folha_id = v_folha and x.colaborador_id = c.id
      )
  loop
    -- ===== Base do mes por vinculo =====
    -- Diarista nao tem salario: o mes dele e a soma das diarias. "Em aberto" e
    -- a MESMA definicao da fn_fechar_diarias (lancamento_id is null) mais o
    -- folha_id, que marca a diaria ja assumida por uma folha aprovada. As duas
    -- condicoes juntas sao o que impede a mesma diaria de ser paga duas vezes,
    -- uma pela folha e outra pelo fechamento em /rh/diaristas.
    if v_colab.vinculo = 'diarista' then
      select coalesce(sum(d.valor), 0) into v_base
      from public.rh_diarias d
      where d.colaborador_id = v_colab.id
        and d.competencia = v_ini
        and d.lancamento_id is null
        and d.folha_id is null;
    else
      v_base := v_colab.salario;
    end if;

    v_grat := v_colab.gratificacao;
    v_desc_val := v_colab.desconto_valor;
    v_manual := false;

    -- ===== Proporcionalidade por dias trabalhados (29/08/2026) =====
    -- Quem entra ou sai no meio do mes recebe os avos que trabalhou. Decisao do
    -- Tiago: a folha do mes do desligamento paga os dias, e a rescisao NAO
    -- repete saldo de salario. Um valor, um lugar.
    -- Diarista fica de fora: o mes dele ja e a soma das diarias que ele fez, e
    -- aplicar avos ali cortaria o mesmo mes duas vezes.
    -- O `if` interno existe para que o cadastro SEM datas nao passe nem pelo
    -- round: 38 dos 59 colaboradores ativos estao sem data_admissao, e para eles
    -- nada muda.
    v_avos := null;
    if v_colab.vinculo <> 'diarista' then
      v_avos := 30;
      if v_colab.data_admissao is not null or v_colab.data_demissao is not null then
        v_avos := public.fn_folha_avos_do_mes(v_colab.data_admissao, v_colab.data_demissao, v_ini);
        v_base := round(v_base * v_avos / 30.0, 2);
        -- A gratificacao acompanha o salario. Ela e valor MENSAL fixo: quem
        -- trabalhou tres dias teria o salario cortado e o penduricalho inteiro.
        -- A edicao manual continua mandando, porque e reaplicada logo abaixo.
        v_grat := round(v_grat * v_avos / 30.0, 2);
      end if;
    end if;

    -- Reaplica a edicao manual desta folha, se existir. Sobrepoe TUDO que veio
    -- do cadastro e do calculo por vinculo: quem editou a linha decidiu o
    -- numero. `->>` num JSON null devolve SQL null, e null no desconto vale
    -- zero: desde 26/08/2026 o desconto e um VALOR digitado, e vazio na tela
    -- e R$ 0,00 -- um jeito so de dizer "sem desconto".
    v_man := v_manuais -> v_colab.id::text;
    if v_man is not null then
      v_base := (v_man ->> 'salario_base')::numeric;
      v_grat := (v_man ->> 'gratificacao')::numeric;
      v_desc_val := (v_man ->> 'descontos')::numeric;
      v_manual := true;
    end if;

    select coalesce(sum(a.horas_normais), 0), coalesce(sum(a.horas_extras), 0)
    into v_hn, v_he
    from public.rh_apontamentos a join public.rh_pontos pt on pt.id = a.ponto_id
    where a.colaborador_id = v_colab.id and a.tipo = 'normal' and pt.status = 'aprovado' and pt.data >= v_ini and pt.data < v_fim;

    -- Nada a pagar e nada a registrar: linha de R$ 0,00 e sujeira na folha. E o
    -- que mantem fora o diarista que nao trabalhou no mes e o terceiro sem
    -- salario cadastrado.
    continue when v_base = 0 and v_grat = 0 and v_hn = 0 and v_he = 0;

    -- Salario fechado: nao paga extra. Horas extras seguem gravadas so como produtividade.
    v_extras := 0;

    -- ===== Descontos legais: SO CLT =====
    -- As faixas de INSS e IRRF da folha sao as do empregado com carteira.
    -- Terceiro e diarista entram na folha como CUSTO da empresa; a retencao
    -- deles, quando houver, e regra fiscal que o Tiago vai declarar.
    -- Base = salario base + gratificacao (gratificacao habitual integra a
    -- remuneracao). As formulas moram em fn_folha_inss / fn_folha_irrf, as
    -- MESMAS que a edicao de item usa.
    if v_colab.vinculo = 'clt' then
      v_inss := public.fn_folha_inss(v_base + v_grat);
      v_irrf := public.fn_folha_irrf(v_base + v_grat, v_inss, v_colab.id);
    else
      v_inss := 0;
      v_irrf := 0;
    end if;

    -- O desconto por pessoa, sobre o SALARIO BASE (a gratificacao fica fora,
    -- mesma base do encargo e da provisao). Mesma formula da
    -- fn_editar_item_folha: se mudar de base, muda nos DOIS lugares.
    v_desconto := coalesce(v_desc_val, 0);

    -- Adiantamento parcelado: desconta o que cabe no liquido disponivel, do
    -- adiantamento MAIS ANTIGO para o mais novo. Ordem da cascata, declarada e
    -- conferivel: rh_adiantamentos.data, depois rh_adiantamento_parcelas.numero.
    -- Com dois adiantamentos disputando o mesmo disponivel, o mais antigo leva o
    -- desconto e o mais novo gera a sobra. O que nao couber vira parcela nova
    -- DAQUELE adiantamento na PROXIMA competencia livre depois DESTA, marcada com
    -- esta folha em gerada_por_folha_id para a regeneracao poder desfazer.
    -- NAO e "no fim do plano": calcular a competencia a partir do max() das
    -- outras linhas fazia a sobra PULAR meses quando um mes anterior era
    -- regerado (o max ainda via a sobra que a cadeia criou mais adiante), e o mes
    -- pulado saia sem desconto nenhum, com liquido cheio. Medido: cadeia
    -- jul/ago/set de 5200 sobre salario 2000, regerar julho jogava a sobra em
    -- OUTUBRO e agosto saia com adiantamentos 0,00.
    -- Se ja houver parcela naquela competencia, as duas COEXISTEM: o loop abaixo
    -- itera sobre TODAS as parcelas abertas do mes e desconta em cascata, entao
    -- engrossar o mes seguinte e seguro. Nao existe unique (adiantamento_id,
    -- competencia); o unique e (adiantamento_id, numero), e o numero segue sendo
    -- max(numero) + 1.
    -- A gratificacao entra no disponivel: ela e dinheiro que o colaborador
    -- recebe, logo e dinheiro de onde o adiantamento pode ser descontado. O
    -- DESCONTO POR PESSOA sai antes, pelo mesmo motivo ao contrario: ele nao
    -- chega na mao do colaborador, entao nao esta disponivel para o
    -- adiantamento — e sem isso o liquido poderia fechar negativo.
    v_disponivel := greatest(v_base + v_grat - v_inss - v_irrf - v_desconto, 0);
    v_adiant := 0;

    for v_par in
      select pa.id, pa.adiantamento_id, pa.valor_previsto
      from public.rh_adiantamento_parcelas pa
      join public.rh_adiantamentos a on a.id = pa.adiantamento_id
      where a.colaborador_id = v_colab.id
        and pa.competencia = v_ini
        and pa.folha_id is null
      order by a.data, pa.numero
    loop
      v_desc_par := least(v_par.valor_previsto, greatest(v_disponivel - v_adiant, 0));

      -- Fecha a parcela NESTA folha sempre, inclusive com desconto zero:
      -- "esta folha processou esta parcela e nao cabia nada" e estado legitimo, e
      -- o check rh_adiant_parcelas_descontado_com_folha passou a admitir
      -- (valor_descontado = 0 com folha_id preenchido). Deixar a parcela ABERTA
      -- aqui faria o plano do adiantamento somar DUAS VEZES o mesmo valor, porque
      -- a sobra abaixo nasce com o valor inteiro dela: o saldo devedor mentiria e
      -- a quitacao cobraria a mais. O sentido oposto segue impossivel pelo check:
      -- desconto maior que zero sem folha_id.
      update public.rh_adiantamento_parcelas
         set folha_id = v_folha,
             valor_descontado = v_desc_par
       where id = v_par.id;

      v_adiant := v_adiant + v_desc_par;

      if v_par.valor_previsto > v_desc_par then
        insert into public.rh_adiantamento_parcelas
          (adiantamento_id, numero, competencia, valor_previsto, gerada_por_folha_id)
        select v_par.adiantamento_id,
               max(pa2.numero) + 1,
               public.fn_proxima_competencia_desconto(v_ini),
               v_par.valor_previsto - v_desc_par,
               v_folha
        from public.rh_adiantamento_parcelas pa2
        where pa2.adiantamento_id = v_par.adiantamento_id;
      end if;
    end loop;

    -- Liquido: base do mes + gratificacao, menos descontos legais (INSS/IRRF), o
    -- desconto por pessoa e o adiantamento descontado. Sem extra.
    -- v_adiant <= v_disponivel por construcao (least/greatest acima), entao o
    -- liquido NUNCA fica negativo.
    v_liquido := v_disponivel - v_adiant;

    -- ===== Centro de custo =====
    v_cc := null;
    select co.id into v_cc
    from public.rh_apontamentos a
    join public.rh_pontos pt on pt.id = a.ponto_id
    join public.centros_custo co on co.obra_id = pt.obra_id and co.nivel = 1
    where a.colaborador_id = v_colab.id and a.tipo = 'normal' and pt.status = 'aprovado' and pt.data >= v_ini and pt.data < v_fim
    group by co.id
    order by sum(a.horas_normais + a.horas_extras) desc
    limit 1;

    -- Diarista nao tem apontamento de ponto: a obra dele esta na propria
    -- diaria. Pega a obra que concentrou o maior VALOR de diaria no mes, e cai
    -- no centro do cadastro se as diarias vierem sem obra. Sem isto o custo do
    -- diarista iria todo para o centro do cadastro (tipicamente o Escritorio
    -- Central), e a obra onde ele efetivamente trabalhou nao veria o custo.
    if v_cc is null and v_colab.vinculo = 'diarista' then
      -- Desde 17/10/2026 a diaria se reparte entre obras por percentual
      -- (rh_diaria_rateios). A folha continua com UM centro por item: o que
      -- concentrou mais valor somando as fatias de cada diaria.
      select rv.centro_custo_id into v_cc
      from public.rh_diarias d
      cross join lateral public.fn_diaria_valor_por_centro(d.id) rv
      where d.colaborador_id = v_colab.id
        and d.competencia = v_ini
        and d.lancamento_id is null
        and d.folha_id is null
        and rv.centro_custo_id is not null
      group by rv.centro_custo_id
      order by sum(rv.valor) desc, rv.centro_custo_id
      limit 1;
    end if;

    if v_cc is null then v_cc := v_colab.centro_custo_id; end if;

    -- Segunda metade da reaplicacao manual. A primeira (salario, gratificacao,
    -- desconto) fica la em cima porque precisa valer ANTES do `continue` que
    -- descarta linha zerada. Estes quatro so existem depois do apontamento e da
    -- escolha do centro, entao so aqui da para sobrepo-los.
    if v_man is not null then
      -- `?` e nao `->>`: folha editada ANTES de 29/08/2026 tem snapshot com tres
      -- chaves so, e ali `->>` devolveria null e apagaria o centro de custo de
      -- quem nunca pediu isso.
      if v_man ? 'centro_custo_id' and v_man ->> 'centro_custo_id' is not null then
        v_cc := (v_man ->> 'centro_custo_id')::uuid;
      end if;
      if v_man ? 'horas_normais' then v_hn := (v_man ->> 'horas_normais')::numeric; end if;
      if v_man ? 'horas_extras' then v_he := (v_man ->> 'horas_extras')::numeric; end if;
      if v_man ? 'valor_extras' then v_extras := (v_man ->> 'valor_extras')::numeric; end if;
    end if;

    -- Insere o item com encargos/provisao provisorios (0); o helper discrimina
    -- em seguida e devolve os totais.
    insert into public.folha_itens
      (folha_id, colaborador_id, centro_custo_id, salario_base, gratificacao,
       horas_normais, horas_extras, valor_extras, encargos, encargos_percentual,
       descontos, desconto_horas,
       inss, irrf, adiantamentos, custo_total, valor_liquido, editado_manualmente,
       dias_trabalhados)
    values
      (v_folha, v_colab.id, v_cc, v_base, v_grat,
       v_hn, v_he, v_extras, 0, null,
       v_desconto,
       case when v_man ? 'desconto_horas' then (v_man ->> 'desconto_horas')::numeric end,
       v_inss, v_irrf, v_adiant, v_base + v_grat, v_liquido, v_manual,
       v_avos)
    returning id into v_item_id;

    -- Encargos e provisao discriminados. A BASE E O SALARIO BASE, sem
    -- gratificacao: e a regra do Tiago, e o unico lugar onde ela e aplicada.
    -- Percentual NULL: o encargo patronal vem so da configuracao, porque o
    -- percentual por pessoa agora e desconto.
    perform public.fn_folha_aplicar_encargos_e_provisoes(v_item_id, v_base, null);

    select encargos, provisoes into v_encargos, v_provisoes
    from public.folha_itens where id = v_item_id;

    -- Custo da empresa: base + gratificacao + extras + encargos + provisao.
    -- INSS/IRRF e o desconto por pessoa sao desconto do trabalhador: NAO entram
    -- no custo da empresa, porque o dinheiro sai da conta do mesmo jeito.
    v_custo := v_base + v_grat + v_extras + v_encargos + v_provisoes;
    update public.folha_itens set custo_total = v_custo where id = v_item_id;
  end loop;

  perform public.fn_folha_recalcular_totais(v_folha);

  return v_folha;
end $function$;

CREATE OR REPLACE FUNCTION public.fn_obra_bloqueio(p_id uuid)
 RETURNS text
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_centro_id uuid;
begin
  if not exists (select 1 from public.obras where id = p_id) then
    return 'nao_encontrado';
  end if;

  -- A obra pode ter mais de um centro raiz se alguem inseriu na mao.
  -- Nesse caso nao arriscamos: bloqueia e pede ajuste manual.
  if (select count(*) from public.centros_custo where obra_id = p_id) > 1 then
    return 'centros_duplicados';
  end if;

  select id into v_centro_id from public.centros_custo where obra_id = p_id;

  if v_centro_id is not null
     and exists (select 1 from public.centros_custo where pai_id = v_centro_id) then
    return 'tem_filhos';
  end if;

  if exists (select 1 from public.colaboradores where obra_id = p_id)
     or exists (select 1 from public.rh_diarias where obra_id = p_id)
     or (v_centro_id is not null
         and exists (select 1 from public.rh_diaria_rateios where centro_custo_id = v_centro_id))
     or exists (select 1 from public.rh_pontos where obra_id = p_id) then
    return 'em_uso';
  end if;

  if v_centro_id is not null and (
       exists (select 1 from public.colaboradores where centro_custo_id = v_centro_id)
    or exists (select 1 from public.folha_itens where centro_custo_id = v_centro_id)
    or exists (select 1 from public.lancamentos where centro_custo_id = v_centro_id)
    or exists (select 1 from public.lancamento_rateios where centro_custo_id = v_centro_id)
    or exists (select 1 from public.oc_itens where centro_custo_id = v_centro_id)
  ) then
    return 'centro_em_uso';
  end if;

  return null;
end $function$;

CREATE OR REPLACE FUNCTION public.fn_obra_dependencias(p_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v jsonb;
  v_centro_id uuid;
begin
  if not public.tem_permissao('cadastros.obras', 'ver') then
    raise exception 'Sem permissao para ver obras';
  end if;

  if not exists (select 1 from public.obras where id = p_id) then
    return jsonb_build_object('bloqueio', 'nao_encontrado');
  end if;

  select id into v_centro_id from public.centros_custo
  where obra_id = p_id order by created_at limit 1;

  select jsonb_build_object(
    'centro_custo_id', v_centro_id,
    'filhos',        (select count(*) from public.centros_custo x where x.pai_id = v_centro_id),
    'colaboradores', (select count(*) from public.colaboradores x
                        where x.obra_id = p_id or x.centro_custo_id = v_centro_id),
    'diarias',       (select count(*) from public.rh_diarias x where x.obra_id = p_id
                        or exists (select 1 from public.rh_diaria_rateios r
                                   where r.diaria_id = x.id and r.centro_custo_id = v_centro_id)),
    'pontos',        (select count(*) from public.rh_pontos x where x.obra_id = p_id),
    'folha_itens',   (select count(*) from public.folha_itens x where x.centro_custo_id = v_centro_id),
    'lancamentos',   (select count(*) from public.lancamentos x where x.centro_custo_id = v_centro_id),
    'rateios',       (select count(*) from public.lancamento_rateios x where x.centro_custo_id = v_centro_id),
    'oc_itens',      (select count(*) from public.oc_itens x where x.centro_custo_id = v_centro_id),
    'bloqueio',      public.fn_obra_bloqueio(p_id)
  ) into v;

  return v;
end $function$;
