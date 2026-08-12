-- =============================================================
-- Excluir obras e centros de custo que nao tem nada atrelado
--
-- A migration 11 (lixeira_cadastros_e_permissoes) deixou obras e
-- centros de custo FORA da allowlist de exclusao de proposito: o
-- trigger trg_obra_cria_centro_custo faz toda obra nascer com um
-- centro raiz, e centros_custo.obra_id tem FK para obras. Logo
-- nenhuma obra estaria "sem nada atrelado" e a exclusao generica
-- falharia sempre com um 23503 traduzido como "esta em uso".
--
-- Aqui obra e centro raiz passam a morrer juntos, numa operacao
-- atomica (simetrico do trigger: nasceram juntos). Centro de custo
-- exclui so folha, de baixo para cima.
--
-- A regra mora aqui, nao na Server Action: quem chamar a RPC direto
-- passa pelas mesmas validacoes.
-- =============================================================

-- -------------------------------------------------------------
-- fn_centro_custo_bloqueio: fonte unica da regra do centro.
-- Devolve NULL quando pode excluir, ou o CODIGO do impedimento.
-- O texto em pt-BR acentuado e montado na aplicacao
-- (src/modules/cadastros/_shared/dependencias.ts) a partir deste
-- codigo mais as contagens.
-- -------------------------------------------------------------
create or replace function public.fn_centro_custo_bloqueio(p_id uuid)
returns text
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_nivel smallint;
  v_tipo text;
  v_sistema boolean;
begin
  select nivel, tipo, sistema
    into v_nivel, v_tipo, v_sistema
  from public.centros_custo where id = p_id;

  -- FOUND, nao "not v_achou": SELECT INTO sem linha atribui NULL ao alvo,
  -- e `if not null` nao entra no bloco.
  if not found then return 'nao_encontrado'; end if;
  if v_sistema then return 'sistema'; end if;
  if v_nivel = 1 and v_tipo = 'obra' then return 'raiz_de_obra'; end if;
  if v_nivel = 1 then return 'nivel_1'; end if;

  if exists (select 1 from public.centros_custo where pai_id = p_id) then
    return 'tem_filhos';
  end if;
  if exists (select 1 from public.colaboradores where centro_custo_id = p_id)
     or exists (select 1 from public.folha_itens where centro_custo_id = p_id)
     or exists (select 1 from public.lancamentos where centro_custo_id = p_id)
     or exists (select 1 from public.lancamento_rateios where centro_custo_id = p_id)
     or exists (select 1 from public.oc_itens where centro_custo_id = p_id) then
    return 'em_uso';
  end if;

  return null;
end $$;

revoke all on function public.fn_centro_custo_bloqueio(uuid) from public, anon;
grant execute on function public.fn_centro_custo_bloqueio(uuid) to authenticated;

-- -------------------------------------------------------------
-- fn_obra_bloqueio: idem para a obra. Considera a obra E o centro
-- raiz dela, porque os dois saem juntos.
-- -------------------------------------------------------------
create or replace function public.fn_obra_bloqueio(p_id uuid)
returns text
language plpgsql
stable
security definer
set search_path = ''
as $$
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
end $$;

revoke all on function public.fn_obra_bloqueio(uuid) from public, anon;
grant execute on function public.fn_obra_bloqueio(uuid) to authenticated;

-- -------------------------------------------------------------
-- fn_centro_custo_dependencias: contagens + codigo de bloqueio.
-- Alimenta o tooltip do botao e o resumo do dialogo. Security
-- definer de proposito: sob RLS o usuario pode nao ver folha_itens
-- ou lancamentos, e a contagem sairia zerada, dizendo "pode
-- excluir" para algo que nao pode. Exige a acao 'ver' no recurso.
-- -------------------------------------------------------------
create or replace function public.fn_centro_custo_dependencias(p_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v jsonb;
begin
  if not public.tem_permissao('cadastros.centros-custo', 'ver') then
    raise exception 'Sem permissao para ver centros de custo';
  end if;

  select jsonb_build_object(
    'filhos',        (select count(*) from public.centros_custo x where x.pai_id = c.id),
    'colaboradores', (select count(*) from public.colaboradores x where x.centro_custo_id = c.id),
    'folha_itens',   (select count(*) from public.folha_itens x where x.centro_custo_id = c.id),
    'lancamentos',   (select count(*) from public.lancamentos x where x.centro_custo_id = c.id),
    'rateios',       (select count(*) from public.lancamento_rateios x where x.centro_custo_id = c.id),
    'oc_itens',      (select count(*) from public.oc_itens x where x.centro_custo_id = c.id),
    'sistema',       c.sistema,
    'nivel',         c.nivel,
    'bloqueio',      public.fn_centro_custo_bloqueio(c.id)
  )
  into v
  from public.centros_custo c where c.id = p_id;

  return coalesce(v, jsonb_build_object('bloqueio', 'nao_encontrado'));
end $$;

revoke all on function public.fn_centro_custo_dependencias(uuid) from public, anon;
grant execute on function public.fn_centro_custo_dependencias(uuid) to authenticated;

-- -------------------------------------------------------------
-- fn_obra_dependencias: idem, somando obra + centro raiz.
-- -------------------------------------------------------------
create or replace function public.fn_obra_dependencias(p_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
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
    'diarias',       (select count(*) from public.rh_diarias x where x.obra_id = p_id),
    'pontos',        (select count(*) from public.rh_pontos x where x.obra_id = p_id),
    'folha_itens',   (select count(*) from public.folha_itens x where x.centro_custo_id = v_centro_id),
    'lancamentos',   (select count(*) from public.lancamentos x where x.centro_custo_id = v_centro_id),
    'rateios',       (select count(*) from public.lancamento_rateios x where x.centro_custo_id = v_centro_id),
    'oc_itens',      (select count(*) from public.oc_itens x where x.centro_custo_id = v_centro_id),
    'bloqueio',      public.fn_obra_bloqueio(p_id)
  ) into v;

  return v;
end $$;

revoke all on function public.fn_obra_dependencias(uuid) from public, anon;
grant execute on function public.fn_obra_dependencias(uuid) to authenticated;

-- -------------------------------------------------------------
-- fn_excluir_centro_custo: snapshot na lixeira + delete fisico.
-- -------------------------------------------------------------
create or replace function public.fn_excluir_centro_custo(p_id uuid, p_motivo text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_bloqueio text;
  v_dados jsonb;
begin
  if not public.tem_permissao('cadastros.centros-custo', 'excluir') then
    raise exception 'Sem permissao para excluir centro de custo';
  end if;
  if coalesce(btrim(p_motivo), '') = '' then
    raise exception 'Informe o motivo da exclusao';
  end if;

  v_bloqueio := public.fn_centro_custo_bloqueio(p_id);
  if v_bloqueio is not null then
    raise exception 'Centro de custo nao pode ser excluido (%)', v_bloqueio;
  end if;

  select to_jsonb(c) into v_dados from public.centros_custo c where c.id = p_id;

  insert into public.lixeira (tabela, registro_id, dados, motivo, excluido_por)
  values ('centros_custo', p_id::text, v_dados, p_motivo, (select auth.uid()));

  delete from public.centros_custo where id = p_id;
end $$;

revoke all on function public.fn_excluir_centro_custo(uuid, text) from public, anon;
grant execute on function public.fn_excluir_centro_custo(uuid, text) to authenticated;

-- -------------------------------------------------------------
-- fn_excluir_obra: apaga o par obra + centro raiz na mesma
-- transacao, com UMA entrada na lixeira (tabela 'obras') que leva
-- o snapshot do centro embutido na chave centro_custo_raiz. Assim
-- a restauracao devolve o par sempre junto, sem duplicar centro.
-- -------------------------------------------------------------
create or replace function public.fn_excluir_obra(p_id uuid, p_motivo text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_bloqueio text;
  v_obra jsonb;
  v_centro jsonb;
  v_centro_id uuid;
begin
  if not public.tem_permissao('cadastros.obras', 'excluir') then
    raise exception 'Sem permissao para excluir obra';
  end if;
  if coalesce(btrim(p_motivo), '') = '' then
    raise exception 'Informe o motivo da exclusao';
  end if;

  v_bloqueio := public.fn_obra_bloqueio(p_id);
  if v_bloqueio is not null then
    raise exception 'Obra nao pode ser excluida (%)', v_bloqueio;
  end if;

  select to_jsonb(o) into v_obra from public.obras o where o.id = p_id;
  select id, to_jsonb(c) into v_centro_id, v_centro
  from public.centros_custo c where c.obra_id = p_id;

  insert into public.lixeira (tabela, registro_id, dados, motivo, excluido_por)
  values (
    'obras', p_id::text,
    v_obra || jsonb_build_object('centro_custo_raiz', v_centro),
    p_motivo, (select auth.uid())
  );

  if v_centro_id is not null then
    delete from public.centros_custo where id = v_centro_id;
  end if;
  delete from public.obras where id = p_id;
end $$;

revoke all on function public.fn_excluir_obra(uuid, text) from public, anon;
grant execute on function public.fn_excluir_obra(uuid, text) to authenticated;

-- -------------------------------------------------------------
-- Allowlist: obras e centros_custo passam a ser restauraveis.
-- -------------------------------------------------------------
create or replace function public.fn_recurso_do_cadastro(p_tabela text)
returns text
language sql
immutable
set search_path = ''
as $$
  select case p_tabela
    when 'unidades_medida'   then 'cadastros.unidades'
    when 'categorias_insumo' then 'cadastros.categorias'
    when 'clientes'          then 'cadastros.clientes'
    when 'fornecedores'      then 'cadastros.fornecedores'
    when 'insumos'           then 'cadastros.insumos'
    when 'depositos'         then 'cadastros.depositos'
    when 'colaboradores'     then 'cadastros.colaboradores'
    when 'obras'             then 'cadastros.obras'
    when 'centros_custo'     then 'cadastros.centros-custo'
    else null
  end;
$$;

revoke all on function public.fn_recurso_do_cadastro(text) from public, anon, authenticated;
grant execute on function public.fn_recurso_do_cadastro(text) to authenticated;

-- -------------------------------------------------------------
-- fn_excluir_cadastro: fecha a porta generica para as duas novas
-- tabelas. Sem esta guarda, entrar por aqui furava as validacoes
-- (a allowlist acima acabou de aceita-las para restauracao).
-- -------------------------------------------------------------
create or replace function public.fn_excluir_cadastro(
  p_tabela text,
  p_id uuid,
  p_motivo text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_recurso text := public.fn_recurso_do_cadastro(p_tabela);
  v_dados jsonb;
begin
  if p_tabela = 'obras' then
    raise exception 'Obra se exclui pela fn_excluir_obra, que trata o centro de custo raiz';
  end if;
  if p_tabela = 'centros_custo' then
    raise exception 'Centro de custo se exclui pela fn_excluir_centro_custo';
  end if;

  if v_recurso is null then
    raise exception 'Tabela % nao pode ser excluida por esta funcao', p_tabela;
  end if;

  if not public.tem_permissao(v_recurso, 'excluir') then
    raise exception 'Sem permissao para excluir em %', v_recurso;
  end if;

  if coalesce(btrim(p_motivo), '') = '' then
    raise exception 'Informe o motivo da exclusao';
  end if;

  execute format('select to_jsonb(t) from public.%I t where id = $1', p_tabela)
    into v_dados using p_id;

  if v_dados is null then
    raise exception 'Registro nao encontrado';
  end if;

  insert into public.lixeira (tabela, registro_id, dados, motivo, excluido_por)
  values (p_tabela, p_id::text, v_dados, p_motivo, (select auth.uid()));

  -- A FK protege o que esta em uso: o erro 23503 vira mensagem amigavel
  -- na Server Action.
  execute format('delete from public.%I where id = $1', p_tabela) using p_id;
end $$;

revoke all on function public.fn_excluir_cadastro(text, uuid, text) from public, anon;
grant execute on function public.fn_excluir_cadastro(text, uuid, text) to authenticated;

-- -------------------------------------------------------------
-- fn_restaurar_cadastro: ramo novo para 'obras'.
-- Reinserir a obra faz o trigger trg_obra_cria_centro_custo criar
-- um centro raiz NOVO. Em vez de reinserir a linha antiga (o que
-- daria dois centros na mesma obra), aplicamos os campos do
-- snapshot sobre o centro recem-criado. O id do centro muda, e
-- isso e inofensivo: a exclusao so era permitida quando nada
-- referenciava aquele id.
-- -------------------------------------------------------------
create or replace function public.fn_restaurar_cadastro(p_lixeira_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_tabela text;
  v_dados jsonb;
  v_restaurado timestamptz;
  v_registro_id text;
  v_centro jsonb;
begin
  if not public.tem_permissao('administracao.lixeira', 'editar') then
    raise exception 'Sem permissao para restaurar da lixeira';
  end if;

  select tabela, dados, restaurado_em, registro_id
  into v_tabela, v_dados, v_restaurado, v_registro_id
  from public.lixeira
  where id = p_lixeira_id;

  if v_tabela is null then
    raise exception 'Item nao encontrado na lixeira';
  end if;
  if v_restaurado is not null then
    raise exception 'Este item ja foi restaurado';
  end if;
  if public.fn_recurso_do_cadastro(v_tabela) is null then
    raise exception 'Tabela % nao pode ser restaurada', v_tabela;
  end if;

  if v_tabela = 'obras' then
    -- jsonb_populate_record ignora a chave centro_custo_raiz (nao e coluna).
    insert into public.obras
    select * from jsonb_populate_record(null::public.obras, v_dados);

    v_centro := v_dados -> 'centro_custo_raiz';
    if v_centro is not null and v_centro <> 'null'::jsonb then
      update public.centros_custo c
      set codigo    = v_centro ->> 'codigo',
          orcamento = (v_centro ->> 'orcamento')::numeric,
          ativo     = coalesce((v_centro ->> 'ativo')::boolean, true)
      where c.obra_id = v_registro_id::uuid;
    end if;
  else
    execute format(
      'insert into public.%I select * from jsonb_populate_record(null::public.%I, $1)',
      v_tabela, v_tabela
    ) using v_dados;
  end if;

  update public.lixeira
  set restaurado_por = (select auth.uid()), restaurado_em = now()
  where id = p_lixeira_id;
end $$;

revoke all on function public.fn_restaurar_cadastro(uuid) from public, anon;
grant execute on function public.fn_restaurar_cadastro(uuid) to authenticated;
