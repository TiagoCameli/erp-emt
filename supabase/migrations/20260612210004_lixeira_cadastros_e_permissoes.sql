-- =============================================================
-- Fase 1 / Migration 11: exclusao/restauracao de cadastros + permissoes
-- Funcoes genericas que movem um cadastro para a lixeira e o restauram.
-- Cobrem cadastros "folha" (sem trigger que gere outros registros):
-- unidades, categorias, clientes, fornecedores, insumos, depositos,
-- colaboradores. Obras, equipamentos e centros de custo NAO entram:
-- eles tem triggers/auto-referencia e na Fase 1 sao apenas DESATIVADOS
-- (campo ativo). A FK protege a exclusao de itens em uso (erro amigavel).
-- =============================================================

-- Allowlist tabela -> recurso. Centraliza a regra e impede EXECUTE
-- dinamico em tabela arbitraria.
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
    else null
  end;
$$;

revoke all on function public.fn_recurso_do_cadastro(text) from public, anon, authenticated;
grant execute on function public.fn_recurso_do_cadastro(text) to authenticated;

-- -------------------------------------------------------------
-- fn_excluir_cadastro: snapshot na lixeira + delete fisico
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
-- fn_restaurar_cadastro: reinsere o snapshot na tabela de origem
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
begin
  if not public.tem_permissao('administracao.lixeira', 'editar') then
    raise exception 'Sem permissao para restaurar da lixeira';
  end if;

  select tabela, dados, restaurado_em
  into v_tabela, v_dados, v_restaurado
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

  execute format(
    'insert into public.%I select * from jsonb_populate_record(null::public.%I, $1)',
    v_tabela, v_tabela
  ) using v_dados;

  update public.lixeira
  set restaurado_por = (select auth.uid()), restaurado_em = now()
  where id = p_lixeira_id;
end $$;

revoke all on function public.fn_restaurar_cadastro(uuid) from public, anon;
grant execute on function public.fn_restaurar_cadastro(uuid) to authenticated;

-- -------------------------------------------------------------
-- Permissoes dos novos recursos de cadastros
-- Admin: tudo. Gestor: somente leitura (perfil observador).
-- -------------------------------------------------------------
insert into public.perfil_permissoes (perfil_id, recurso, acao)
select p.id, r.recurso, a.acao
from public.perfis p
cross join (values
  ('cadastros.obras'), ('cadastros.centros-custo'), ('cadastros.clientes'),
  ('cadastros.fornecedores'), ('cadastros.insumos'), ('cadastros.equipamentos'),
  ('cadastros.depositos'), ('cadastros.colaboradores'), ('cadastros.unidades'),
  ('cadastros.categorias')
) as r(recurso)
cross join (values ('ver'), ('criar'), ('editar'), ('excluir')) as a(acao)
where p.nome = 'Admin'
on conflict (perfil_id, recurso, acao) do nothing;

insert into public.perfil_permissoes (perfil_id, recurso, acao)
select p.id, r.recurso, 'ver'
from public.perfis p
cross join (values
  ('cadastros.obras'), ('cadastros.centros-custo'), ('cadastros.clientes'),
  ('cadastros.fornecedores'), ('cadastros.insumos'), ('cadastros.equipamentos'),
  ('cadastros.depositos'), ('cadastros.colaboradores'), ('cadastros.unidades'),
  ('cadastros.categorias')
) as r(recurso)
where p.nome = 'Gestor'
on conflict (perfil_id, recurso, acao) do nothing;

-- Sincroniza os usuarios que ja usam o perfil Admin (ex.: o primeiro
-- usuario) com os recursos recem-criados.
insert into public.usuario_permissoes (usuario_id, recurso, acao, created_by)
select u.id, pp.recurso, pp.acao, u.id
from public.usuarios u
join public.perfis p on p.id = u.perfil_id and p.nome = 'Admin'
join public.perfil_permissoes pp on pp.perfil_id = p.id
where pp.recurso like 'cadastros.%'
on conflict (usuario_id, recurso, acao) do nothing;
