-- Aplicada em produção pelo MCP (apply_migration) em 2026-10-08, versão
-- 20261008151907 no ledger. Este arquivo é o registro versionado do que foi
-- aplicado; NÃO rode `supabase db push` neste projeto (ver docs/decisoes.md).
--
-- Diária por período, parte 2 de 2: gravação, criar função e lista de funções.
-- A parte 1 (diaria_periodo_funcao) traz colunas, rh_diaria_valores e o cálculo.

-- Grava o valor da função se esta diária é a mais recente dela (pelo fim do
-- período). Editar uma diária velha não derruba o valor de uma mais nova.
create or replace function public.fn_diaria_atualizar_valor_funcao(p_diaria uuid)
returns void
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_funcao uuid; v_valor numeric; v_fim date;
begin
  select funcao_id, valor_diaria, coalesce(data_fim, data) into v_funcao, v_valor, v_fim
  from public.rh_diarias where id = p_diaria;

  if v_funcao is null or v_valor is null or v_valor <= 0 then return; end if;

  if exists (
    select 1 from public.rh_diarias d
    where d.funcao_id = v_funcao and d.id <> p_diaria
      and d.valor_diaria is not null
      and coalesce(d.data_fim, d.data) > v_fim
  ) then
    return;
  end if;

  insert into public.rh_diaria_valores (funcao_id, valor, diaria_id, atualizado_em, atualizado_por)
  values (v_funcao, v_valor, p_diaria, now(), (select auth.uid()))
  on conflict (funcao_id) do update
    set valor = excluded.valor, diaria_id = excluded.diaria_id,
        atualizado_em = excluded.atualizado_em, atualizado_por = excluded.atualizado_por;
end;
$function$;

revoke all on function public.fn_diaria_atualizar_valor_funcao(uuid) from public, anon, authenticated;

-- Cria (p_id nulo) ou edita uma diária por período. Na edição de diária fechada
-- valem as travas da fn_diaria_exigir_alteravel e o lançamento é acertado.
create or replace function public.fn_salvar_diaria(
  p_id uuid,
  p_colaborador uuid,
  p_funcao uuid,
  p_obra uuid,
  p_inicio date,
  p_fim date,
  p_meias date[],
  p_faltas date[],
  p_valor_diaria numeric,
  p_observacao text
)
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
begin
  if p_colaborador is null then raise exception 'Selecione o diarista'; end if;
  if p_funcao is null then raise exception 'Selecione a funcao'; end if;
  if p_valor_diaria is null or p_valor_diaria <= 0 then
    raise exception 'Informe o valor da diaria';
  end if;
  if not exists (select 1 from public.funcoes where id = p_funcao and ativo) then
    raise exception 'Funcao invalida ou inativa';
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
      p_colaborador, p_funcao, p_obra, p_inicio, p_fim, v_comp,
      round(p_valor_diaria, 2), v_qtd, v_meias, v_faltas, v_total,
      nullif(btrim(p_observacao), '')
    ) returning id into v_id;
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
        obra_id = p_obra,
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

    if v_lanc is not null then
      perform public.fn_diaria_ressincronizar_lancamento(v_lanc);
    end if;
  end if;

  perform public.fn_diaria_atualizar_valor_funcao(v_id);
  return v_id;
end;
$function$;

revoke all on function public.fn_salvar_diaria(uuid, uuid, uuid, uuid, date, date, date[], date[], numeric, text) from public, anon;
grant execute on function public.fn_salvar_diaria(uuid, uuid, uuid, uuid, date, date, date[], date[], numeric, text) to authenticated;

comment on function public.fn_salvar_diaria(uuid, uuid, uuid, uuid, date, date, date[], date[], numeric, text) is
'Cria (p_id nulo) ou edita uma diaria por periodo. Calcula qtd e total a partir dos dias (fn_diaria_calcular), grava o ultimo valor da funcao se esta e a diaria mais recente dela, e na diaria fechada acerta o lancamento com as travas da fn_diaria_exigir_alteravel.';

-- Cria função no catálogo único a partir do formulário de diária. Nome repetido
-- (sem diferenciar maiúscula) reaproveita a existente e a reativa. O valor
-- informado vira o valor atual da função.
create or replace function public.fn_criar_funcao_diaria(p_nome text, p_valor numeric)
returns uuid
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_nome text := upper(regexp_replace(btrim(coalesce(p_nome, '')), '\s+', ' ', 'g'));
  v_id uuid;
begin
  if not public.tem_permissao('rh.diaristas', 'criar') then
    raise exception 'Sem permissao para criar funcao';
  end if;
  if v_nome = '' then raise exception 'Informe o nome da funcao'; end if;
  if length(v_nome) > 120 then raise exception 'Nome da funcao muito longo'; end if;
  if p_valor is null or p_valor <= 0 then raise exception 'Informe o valor da diaria'; end if;

  select id into v_id from public.funcoes where lower(nome) = lower(v_nome) limit 1;

  if v_id is null then
    insert into public.funcoes (nome, ativo) values (v_nome, true) returning id into v_id;
  else
    update public.funcoes set ativo = true where id = v_id and not ativo;
  end if;

  insert into public.rh_diaria_valores (funcao_id, valor, diaria_id, atualizado_em, atualizado_por)
  values (v_id, round(p_valor, 2), null, now(), (select auth.uid()))
  on conflict (funcao_id) do update
    set valor = excluded.valor, diaria_id = null,
        atualizado_em = excluded.atualizado_em, atualizado_por = excluded.atualizado_por;

  return v_id;
end;
$function$;

revoke all on function public.fn_criar_funcao_diaria(text, numeric) from public, anon;
grant execute on function public.fn_criar_funcao_diaria(text, numeric) to authenticated;

comment on function public.fn_criar_funcao_diaria(text, numeric) is
'Cria funcao no catalogo unico pelo formulario de diaria (permissao rh.diaristas criar, nao cadastros.funcoes). Nome repetido reaproveita e reativa a existente. Grava o valor como valor atual da funcao.';

-- Funções ativas com o último valor de diária, para quem vê diárias. O catálogo
-- `funcoes` só abre para cadastros.funcoes:ver; o RH lê por aqui.
create or replace function public.fn_diaria_funcoes()
returns table (
  id uuid,
  nome text,
  valor numeric,
  atualizado_em timestamptz,
  diaria_id uuid
)
language plpgsql
stable
security definer
set search_path to ''
as $function$
begin
  if not public.tem_permissao('rh.diaristas', 'ver') then
    raise exception 'Sem permissao para ver diarias';
  end if;

  return query
  select f.id, f.nome, v.valor, v.atualizado_em, v.diaria_id
  from public.funcoes f
  left join public.rh_diaria_valores v on v.funcao_id = f.id
  where f.ativo
  order by f.nome;
end;
$function$;

revoke all on function public.fn_diaria_funcoes() from public, anon;
grant execute on function public.fn_diaria_funcoes() to authenticated;

comment on function public.fn_diaria_funcoes() is
'Funcoes ativas do catalogo com o ultimo valor de diaria (rh_diaria_valores), para o formulario e a tabela Valores por funcao da aba RH > Diarias.';
