-- =============================================================
-- Conciliacao v2, Bloco H: regras por historico (Rende Facil e tarifas)
--
-- Pedido do Tiago (05/10/2026): o historico do banco ja diz o que muitos
-- movimentos sao ("BB RENDE FACIL", "TARIFA PACOTE DE SERVICOS"). Uma regra
-- liga um texto do historico a uma acao:
--   transferencia: lanca a transferencia com a conta contraparte (Rende
--                  Facil: debito = aplicacao, credito = resgate);
--   lancar:        lanca pago com fornecedor, categoria e centro de custo;
--   apelido:       reservada ao Bloco I (nao aplica nada aqui).
-- So a regra automatica aplica sozinha; as demais viram sugestao na tela.
--
-- 1. conciliacao_regras, com padrao NORMALIZADO (sem acento, maiusculas,
--    espacos simples) comparado por position, nunca regex.
-- 2. fn_conciliacao_normalizar_historico(text): a mesma normalizacao do TS.
-- 3. fn_conciliacao_aplicar_regra_interna: aplica UMA regra a UM movimento
--    pelas funcoes que ja existem (lancar e lancar_transferencia). Interna.
-- 4. fn_conciliacao_aplicar_regras(conta, mes): as automaticas, sozinhas.
-- 5. fn_conciliacao_aplicar_regra(regra, transacoes[]): o "Aplicar" da tela.
-- 6. fn_conciliacao_salvar_regra(id, dados): criar e editar.
-- 7. Semeadura: BB Rende Facil na BB 102.124-9, automatica.
--
-- Aplicacao da subconta: a da regra (centro_custo_id) ou, sem ela, a unica
-- aplicacao ativa cadastrada para a subconta. Sem nenhuma, o movimento fica
-- em Faltam com "Cadastre a aplicacao da subconta".
-- =============================================================

create or replace function public.fn_conciliacao_normalizar_historico(p_texto text)
returns text
language sql
immutable
set search_path to ''
as $function$
  select nullif(btrim(regexp_replace(upper(translate(coalesce(p_texto, ''),
    'áàâãäéèêëíìîïóòôõöúùûüçÁÀÂÃÄÉÈÊËÍÌÎÏÓÒÔÕÖÚÙÛÜÇ',
    'aaaaaeeeeiiiiooooouuuucAAAAAEEEEIIIIOOOOOUUUUC')), '\s+', ' ', 'g')), '');
$function$;

create table if not exists public.conciliacao_regras (
  id uuid primary key default gen_random_uuid(),
  conta_bancaria_id uuid references public.contas_bancarias(id),
  nome text not null check (btrim(nome) <> ''),
  padrao text not null check (length(padrao) >= 3),
  sentido text check (sentido in ('credito', 'debito')),
  acao text not null check (acao in ('transferencia', 'lancar', 'apelido')),
  conta_contraparte_id uuid references public.contas_bancarias(id),
  fornecedor_id uuid references public.fornecedores(id),
  categoria_id uuid references public.categorias_financeiras(id),
  centro_custo_id uuid references public.centros_custo(id),
  automatica boolean not null default false,
  ativa boolean not null default true,
  vezes_aplicada int not null default 0,
  ultima_aplicacao timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references public.usuarios(id),
  constraint conciliacao_regras_transferencia_tem_contraparte
    check (acao <> 'transferencia' or conta_contraparte_id is not null),
  constraint conciliacao_regras_lancar_tem_categoria_e_centro
    check (acao <> 'lancar' or (categoria_id is not null and centro_custo_id is not null)),
  constraint conciliacao_regras_padrao_normalizado
    check (padrao = public.fn_conciliacao_normalizar_historico(padrao))
);

create index if not exists idx_conciliacao_regras_conta on public.conciliacao_regras (conta_bancaria_id);
create index if not exists idx_conciliacao_regras_contraparte on public.conciliacao_regras (conta_contraparte_id);
create index if not exists idx_conciliacao_regras_fornecedor on public.conciliacao_regras (fornecedor_id);
create index if not exists idx_conciliacao_regras_categoria on public.conciliacao_regras (categoria_id);
create index if not exists idx_conciliacao_regras_centro on public.conciliacao_regras (centro_custo_id);
create index if not exists idx_conciliacao_regras_created_by on public.conciliacao_regras (created_by);

alter table public.conciliacao_regras enable row level security;
drop policy if exists conciliacao_regras_select on public.conciliacao_regras;
create policy conciliacao_regras_select on public.conciliacao_regras
  for select to authenticated
  using ((select public.tem_permissao('financeiro.conciliacao', 'ver')));
revoke all on table public.conciliacao_regras from public, anon, authenticated;
grant select on table public.conciliacao_regras to authenticated;

drop trigger if exists trg_audit_conciliacao_regras on public.conciliacao_regras;
create trigger trg_audit_conciliacao_regras after insert or update or delete on public.conciliacao_regras
  for each row execute function public.fn_audit();
drop trigger if exists trg_conciliacao_regras_updated_at on public.conciliacao_regras;
create trigger trg_conciliacao_regras_updated_at before update on public.conciliacao_regras
  for each row execute function public.fn_set_updated_at();
drop trigger if exists trg_conciliacao_regras_created_by on public.conciliacao_regras;
create trigger trg_conciliacao_regras_created_by before insert on public.conciliacao_regras
  for each row execute function public.fn_set_created_by();

-- -------------------------------------------------------------
-- Aplica uma regra a um movimento. Interna: as publicas checam permissao.
-- -------------------------------------------------------------
create or replace function public.fn_conciliacao_aplicar_regra_interna(
  p_regra public.conciliacao_regras,
  p_transacao_id uuid,
  p_automatica boolean
)
returns void
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_t public.extrato_transacoes;
  v_contraparte public.contas_bancarias;
  v_conta public.contas_bancarias;
  v_aplicacao uuid;
  v_qtd int;
begin
  select * into v_t from public.extrato_transacoes where id = p_transacao_id;
  if v_t.id is null then raise exception 'Movimento do extrato nao encontrado'; end if;
  if v_t.conciliada then raise exception 'Este movimento ja esta conciliado'; end if;
  if not p_regra.ativa then raise exception 'A regra % esta inativa', p_regra.nome; end if;
  if p_regra.conta_bancaria_id is not null and p_regra.conta_bancaria_id <> v_t.conta_bancaria_id then
    raise exception 'A regra % e de outra conta', p_regra.nome;
  end if;
  if p_regra.sentido is not null and p_regra.sentido <> v_t.tipo then
    raise exception 'A regra % e so para %', p_regra.nome, p_regra.sentido;
  end if;
  if position(p_regra.padrao in coalesce(public.fn_conciliacao_normalizar_historico(v_t.memo), '')) = 0 then
    raise exception 'O historico nao tem o texto da regra %', p_regra.nome;
  end if;

  if p_regra.acao = 'transferencia' then
    select * into v_conta from public.contas_bancarias where id = v_t.conta_bancaria_id;
    select * into v_contraparte from public.contas_bancarias where id = p_regra.conta_contraparte_id;
    if v_contraparte.id is null then raise exception 'A conta da regra % nao existe mais', p_regra.nome; end if;
    if v_contraparte.tipo = 'investimento' or v_conta.tipo = 'investimento' then
      v_aplicacao := p_regra.centro_custo_id;
      if v_aplicacao is null then
        select count(*), min(a.centro_custo_id::text)::uuid into v_qtd, v_aplicacao
        from public.aplicacoes a
        where a.ativa and a.conta_bancaria_id = case when v_contraparte.tipo = 'investimento' then v_contraparte.id else v_conta.id end;
        if v_qtd = 0 then raise exception 'Cadastre a aplicacao da subconta'; end if;
        if v_qtd > 1 then raise exception 'A subconta tem mais de uma aplicacao: escolha a aplicacao na regra %', p_regra.nome; end if;
      end if;
    end if;
    perform public.fn_conciliacao_lancar_transferencia(
      v_t.id, v_contraparte.id, v_aplicacao, p_regra.nome || ' (regra)');
  elsif p_regra.acao = 'lancar' then
    perform public.fn_conciliacao_lancar(v_t.id, jsonb_build_object(
      'mesCompetencia', date_trunc('month', v_t.data_movimento)::date,
      'centroCustoId', p_regra.centro_custo_id,
      'categoriaId', p_regra.categoria_id,
      'fornecedorId', p_regra.fornecedor_id,
      'observacoes', 'Lancado pela regra de conciliacao ' || p_regra.nome || ': ' || coalesce(v_t.memo, '-')));
  else
    raise exception 'A regra % nao lanca nada', p_regra.nome;
  end if;

  update public.extrato_transacoes set conciliacao_automatica = coalesce(p_automatica, false)
   where id = v_t.id;
  update public.conciliacao_regras
     set vezes_aplicada = vezes_aplicada + 1, ultima_aplicacao = now()
   where id = p_regra.id;
end;
$function$;

revoke all on function public.fn_conciliacao_aplicar_regra_interna(public.conciliacao_regras, uuid, boolean)
  from public, anon, authenticated;

-- -------------------------------------------------------------
-- As automaticas, sozinhas: importacao e "Casar automaticamente".
-- -------------------------------------------------------------
create or replace function public.fn_conciliacao_aplicar_regras(p_conta_id uuid, p_mes date default null)
returns jsonb
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_t record;
  v_regra public.conciliacao_regras;
  v_aplicadas int := 0;
  v_sugeridas int := 0;
  v_por jsonb := '{}'::jsonb;
  v_ignoradas jsonb := '[]'::jsonb;
  v_inicio date;
  v_fim date;
begin
  if not public.tem_permissao('financeiro.conciliacao', 'editar') then
    raise exception 'Sem permissao para conciliar';
  end if;
  if p_conta_id is null then raise exception 'Informe a conta'; end if;
  if p_mes is not null then
    v_inicio := date_trunc('month', p_mes)::date;
    v_fim := (v_inicio + interval '1 month - 1 day')::date;
    perform public.fn_conciliacao_exigir_mes_aberto(p_conta_id, v_inicio);
  end if;

  for v_t in
    select t.id, t.tipo, public.fn_conciliacao_normalizar_historico(t.memo) as historico
    from public.extrato_transacoes t
    where t.conta_bancaria_id = p_conta_id and not t.conciliada
      and (p_mes is null or t.data_movimento between v_inicio and v_fim)
    order by t.data_movimento, t.created_at
  loop
    -- A primeira regra ativa que casa: a da conta antes da geral, por nome.
    select r.* into v_regra
    from public.conciliacao_regras r
    where r.ativa and r.acao <> 'apelido'
      and (r.conta_bancaria_id is null or r.conta_bancaria_id = p_conta_id)
      and (r.sentido is null or r.sentido = v_t.tipo)
      and position(r.padrao in coalesce(v_t.historico, '')) > 0
    order by (r.conta_bancaria_id is null), r.nome, r.id
    limit 1;
    if v_regra.id is null then continue; end if;
    if not v_regra.automatica then
      v_sugeridas := v_sugeridas + 1;
      continue;
    end if;
    begin
      perform public.fn_conciliacao_aplicar_regra_interna(v_regra, v_t.id, true);
      v_aplicadas := v_aplicadas + 1;
      v_por := jsonb_set(v_por, array[v_regra.id::text],
        jsonb_build_object('regraId', v_regra.id, 'nome', v_regra.nome,
          'qtd', coalesce((v_por->v_regra.id::text->>'qtd')::int, 0) + 1));
    exception when others then
      v_ignoradas := v_ignoradas || jsonb_build_object(
        'transacaoId', v_t.id, 'regra', v_regra.nome, 'erro', sqlerrm);
    end;
  end loop;

  return jsonb_build_object(
    'aplicadas', v_aplicadas,
    'porRegra', coalesce((select jsonb_agg(value) from jsonb_each(v_por)), '[]'::jsonb),
    'sugeridas', v_sugeridas,
    'ignoradas', v_ignoradas);
end;
$function$;

revoke all on function public.fn_conciliacao_aplicar_regras(uuid, date) from public, anon;
grant execute on function public.fn_conciliacao_aplicar_regras(uuid, date) to authenticated;

-- -------------------------------------------------------------
-- O "Aplicar" da tela: uma regra (automatica ou nao) em movimentos escolhidos.
-- -------------------------------------------------------------
create or replace function public.fn_conciliacao_aplicar_regra(p_regra_id uuid, p_transacao_ids uuid[])
returns jsonb
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_regra public.conciliacao_regras;
  v_id uuid;
  v_aplicadas int := 0;
  v_falhas jsonb := '[]'::jsonb;
begin
  if not public.tem_permissao('financeiro.conciliacao', 'editar') then
    raise exception 'Sem permissao para conciliar';
  end if;
  select * into v_regra from public.conciliacao_regras where id = p_regra_id;
  if v_regra.id is null then raise exception 'Regra nao encontrada'; end if;

  foreach v_id in array coalesce(p_transacao_ids, '{}') loop
    begin
      perform public.fn_conciliacao_aplicar_regra_interna(v_regra, v_id, false);
      v_aplicadas := v_aplicadas + 1;
    exception when others then
      v_falhas := v_falhas || jsonb_build_object('transacao', v_id, 'erro', sqlerrm);
    end;
  end loop;
  return jsonb_build_object('aplicadas', v_aplicadas, 'falhas', v_falhas);
end;
$function$;

revoke all on function public.fn_conciliacao_aplicar_regra(uuid, uuid[]) from public, anon;
grant execute on function public.fn_conciliacao_aplicar_regra(uuid, uuid[]) to authenticated;

-- -------------------------------------------------------------
-- Criar e editar. O padrao e gravado normalizado.
-- -------------------------------------------------------------
create or replace function public.fn_conciliacao_salvar_regra(p_id uuid, p_dados jsonb)
returns uuid
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_id uuid := p_id;
  v_padrao text := public.fn_conciliacao_normalizar_historico(p_dados->>'padrao');
  v_acao text := p_dados->>'acao';
  v_conta uuid := nullif(p_dados->>'contaBancariaId', '')::uuid;
  v_contraparte uuid := nullif(p_dados->>'contaContraparteId', '')::uuid;
begin
  if not public.tem_permissao('financeiro.conciliacao', 'editar') then
    raise exception 'Sem permissao para editar regras de conciliacao';
  end if;
  if coalesce(btrim(p_dados->>'nome'), '') = '' then raise exception 'Informe o nome da regra'; end if;
  if v_padrao is null or length(v_padrao) < 3 then
    raise exception 'O texto do historico precisa ter pelo menos 3 letras';
  end if;
  if v_acao is null or v_acao not in ('transferencia', 'lancar', 'apelido') then
    raise exception 'Escolha o que a regra faz';
  end if;
  if v_acao = 'transferencia' and v_contraparte is null then
    raise exception 'Escolha a outra conta da transferencia';
  end if;
  if v_acao = 'transferencia' and v_contraparte = v_conta then
    raise exception 'A outra conta precisa ser diferente da conta da regra';
  end if;
  if v_acao = 'lancar' and (nullif(p_dados->>'categoriaId', '') is null or nullif(p_dados->>'centroCustoId', '') is null) then
    raise exception 'Escolha a categoria e o centro de custo do lancamento';
  end if;

  if v_id is null then
    insert into public.conciliacao_regras (
      conta_bancaria_id, nome, padrao, sentido, acao, conta_contraparte_id,
      fornecedor_id, categoria_id, centro_custo_id, automatica, ativa)
    values (
      v_conta, btrim(p_dados->>'nome'), v_padrao, nullif(p_dados->>'sentido', ''), v_acao,
      case when v_acao = 'transferencia' then v_contraparte end,
      case when v_acao = 'lancar' then nullif(p_dados->>'fornecedorId', '')::uuid end,
      case when v_acao = 'lancar' then nullif(p_dados->>'categoriaId', '')::uuid end,
      case when v_acao in ('lancar', 'transferencia') then nullif(p_dados->>'centroCustoId', '')::uuid end,
      coalesce((p_dados->>'automatica')::boolean, false),
      coalesce((p_dados->>'ativa')::boolean, true))
    returning id into v_id;
  else
    update public.conciliacao_regras set
      conta_bancaria_id = v_conta,
      nome = btrim(p_dados->>'nome'),
      padrao = v_padrao,
      sentido = nullif(p_dados->>'sentido', ''),
      acao = v_acao,
      conta_contraparte_id = case when v_acao = 'transferencia' then v_contraparte end,
      fornecedor_id = case when v_acao = 'lancar' then nullif(p_dados->>'fornecedorId', '')::uuid end,
      categoria_id = case when v_acao = 'lancar' then nullif(p_dados->>'categoriaId', '')::uuid end,
      centro_custo_id = case when v_acao in ('lancar', 'transferencia') then nullif(p_dados->>'centroCustoId', '')::uuid end,
      automatica = coalesce((p_dados->>'automatica')::boolean, false),
      ativa = coalesce((p_dados->>'ativa')::boolean, true)
    where id = v_id;
    if not found then raise exception 'Regra nao encontrada'; end if;
  end if;
  return v_id;
end;
$function$;

revoke all on function public.fn_conciliacao_salvar_regra(uuid, jsonb) from public, anon;
grant execute on function public.fn_conciliacao_salvar_regra(uuid, jsonb) to authenticated;

-- -------------------------------------------------------------
-- Semeadura: BB Rende Facil na BB 102.124-9, com a aplicacao
-- "Banco do Brasil - Rende Facil" de Investimentos.
-- -------------------------------------------------------------
insert into public.conciliacao_regras (
  conta_bancaria_id, nome, padrao, sentido, acao, conta_contraparte_id, centro_custo_id, automatica)
select '40fb6875-ad20-45ed-9346-d1b59e7d9723', 'BB Rende Fácil', 'BB RENDE FACIL', null, 'transferencia',
       '5c8e0e86-bbdb-46a4-9809-1e1700fffac0', 'd914abf2-77a4-4c4d-b356-8038740aae81', true
where exists (select 1 from public.contas_bancarias where id = '40fb6875-ad20-45ed-9346-d1b59e7d9723')
  and exists (select 1 from public.contas_bancarias where id = '5c8e0e86-bbdb-46a4-9809-1e1700fffac0')
  and not exists (select 1 from public.conciliacao_regras where padrao = 'BB RENDE FACIL'
                  and conta_bancaria_id = '40fb6875-ad20-45ed-9346-d1b59e7d9723');
