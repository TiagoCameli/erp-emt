-- fn_epis_a_recolher: EPIs a recolher (colaborador inativo com equipamento
-- ainda nao devolvido) para o painel de alertas de RH.
--
-- Porque uma fn SECURITY DEFINER em vez de um select com join:
--   O select anterior usava `.select("...,colaboradores!inner(...)")` (INNER
--   JOIN real no PostgREST). A RLS de public.colaboradores
--   (colaboradores_select = tem_permissao('cadastros.colaboradores','ver'))
--   e tudo-ou-nada por sessao: quem NAO tem esse recurso ve zero linhas de
--   colaboradores, e o INNER JOIN devolvia zero EPIs -> falso "Nenhum EPI a
--   recolher", calado. Mas a aba gateia essa categoria por rh.epis, e o perfil
--   RH tem rh.epis e NAO tem cadastros.colaboradores -> bug silencioso.
--
--   Esta fn (definer) atravessa a RLS de colaboradores e gateia pela permissao
--   correta (rh.epis/ver) no proprio WHERE: sem a permissao, retorna vazio.
--   Mesmo padrao das demais fns definer do projeto (nomes_usuarios_compras,
--   nomes_usuarios_auditoria, fn_gerar_folha).
--
-- Rollback:
--   drop function public.fn_epis_a_recolher();

create or replace function public.fn_epis_a_recolher()
returns table (
  id uuid,
  colaborador_id uuid,
  colaborador_nome text,
  descricao text,
  ca text,
  quantidade integer,
  data_entrega date
)
language sql
stable
security definer
set search_path = ''
as $$
  select
    e.id,
    e.colaborador_id,
    c.nome,
    e.descricao,
    e.ca,
    e.quantidade,
    e.data_entrega
  from public.rh_epis e
  join public.colaboradores c on c.id = e.colaborador_id
  where e.data_devolucao is null
    and c.ativo = false
    and public.tem_permissao('rh.epis', 'ver')
  order by e.data_entrega asc;
$$;

revoke all on function public.fn_epis_a_recolher() from public, anon;
grant execute on function public.fn_epis_a_recolher() to authenticated;
