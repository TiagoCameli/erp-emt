-- =============================================================
-- Etapa e item sem custo podem ser EXCLUIDOS, nao so desativados
--
-- Pedido do Tiago (12/10/2026): "itens de etapas que nao tem custos
-- podem ser deletados e nao so inativados".
--
-- fn_excluir_centro_custo ja existia (20260810120001), mas a trava
-- fn_centro_custo_bloqueio olhava so 5 tabelas (colaboradores, folha,
-- lancamentos, rateios, itens de OC). Hoje 21 tabelas tem FK para
-- centros_custo (fretes, combustivel, OS, rescisoes, aplicacoes...):
-- uma etapa usada so num frete passava na trava e estourava 23503 no
-- delete. Aqui "em uso" passa a ser QUALQUER FK que aponte para o
-- centro, lida do catalogo: tabela nova com centro_custo_id entra na
-- regra sem ninguem lembrar de vir aqui.
--
-- E o no gerado por equipamento (equipamento_id) passa a ser travado
-- como 'gerido': o ciclo de vida dele e do cadastro do equipamento,
-- igual a regra de desativar (travas-de-status.ts).
-- =============================================================

-- -------------------------------------------------------------
-- fn_centros_custo_usados: ids de centro referenciados por alguma
-- FK (menos o pai_id da propria arvore, que e 'tem_filhos').
-- p_id restringe a um centro so. Interna: sem grant ao app.
-- -------------------------------------------------------------
create or replace function public.fn_centros_custo_usados(p_id uuid default null)
returns setof uuid
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  r record;
  v_sql text := '';
begin
  for r in
    select c.conrelid::regclass::text as tabela, a.attname as coluna
    from pg_catalog.pg_constraint c
    join pg_catalog.pg_attribute a
      on a.attrelid = c.conrelid and a.attnum = any (c.conkey)
    where c.contype = 'f'
      and c.confrelid = 'public.centros_custo'::regclass
      and c.conrelid <> 'public.centros_custo'::regclass
  loop
    v_sql := v_sql
      || case when v_sql = '' then '' else ' union ' end
      || format(
           'select %1$I from %2$s where %1$I is not null and ($1 is null or %1$I = $1)',
           r.coluna, r.tabela
         );
  end loop;

  if v_sql = '' then return; end if;
  return query execute v_sql using p_id;
end $$;

revoke all on function public.fn_centros_custo_usados(uuid) from public, anon, authenticated;

-- -------------------------------------------------------------
-- fn_centros_custo_em_uso: a lista para a arvore decidir se
-- oferece "Excluir". Security definer pelo mesmo motivo da
-- fn_centro_custo_dependencias: sob RLS o usuario pode nao ver
-- lancamentos e a lista sairia vazia, oferecendo exclusao que o
-- banco recusa.
-- -------------------------------------------------------------
create or replace function public.fn_centros_custo_em_uso()
returns setof uuid
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not public.tem_permissao('cadastros.centros-custo', 'ver') then
    raise exception 'Sem permissao para ver centros de custo';
  end if;
  return query select public.fn_centros_custo_usados(null);
end $$;

revoke all on function public.fn_centros_custo_em_uso() from public, anon;
grant execute on function public.fn_centros_custo_em_uso() to authenticated;

-- -------------------------------------------------------------
-- fn_centro_custo_bloqueio: mesmos codigos de antes, mais 'gerido'
-- (equipamento), e 'em_uso' lido de todas as FKs.
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
  v_equipamento uuid;
begin
  select nivel, tipo, sistema, equipamento_id
    into v_nivel, v_tipo, v_sistema, v_equipamento
  from public.centros_custo where id = p_id;

  -- FOUND, nao "not v_achou": SELECT INTO sem linha atribui NULL ao alvo,
  -- e `if not null` nao entra no bloco.
  if not found then return 'nao_encontrado'; end if;
  if v_sistema then return 'sistema'; end if;
  if v_nivel = 1 and v_tipo = 'obra' then return 'raiz_de_obra'; end if;
  if v_nivel = 1 then return 'nivel_1'; end if;
  if v_equipamento is not null then return 'gerido'; end if;

  if exists (select 1 from public.centros_custo where pai_id = p_id) then
    return 'tem_filhos';
  end if;
  if exists (select 1 from public.fn_centros_custo_usados(p_id)) then
    return 'em_uso';
  end if;

  return null;
end $$;

revoke all on function public.fn_centro_custo_bloqueio(uuid) from public, anon;
grant execute on function public.fn_centro_custo_bloqueio(uuid) to authenticated;
