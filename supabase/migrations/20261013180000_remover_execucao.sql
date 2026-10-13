-- Remove o módulo Execução de Obras inteiro, a pedido do Tiago (13/10/2026).
-- O banco tinha só o teste de hoje (1 obra, cronograma "Fundação" com 2 atividades),
-- 2 calendários, 79 feriados e 45 permissões; backup em JSON no personal-os
-- (outputs/erp-emt-remover-execucao-backup). Nada fora do módulo aponta para as
-- tabelas ex_; a única dependência externa é a policy de unidades_medida.

-- Unidades: volta a expressão viva sem a Execução (mantém o Estoque, que entrou depois).
drop policy if exists unidades_medida_select on public.unidades_medida;
create policy unidades_medida_select on public.unidades_medida for select to authenticated
  using ((select public.tem_permissao('cadastros.unidades', 'ver'))
      or (select public.fn_ve_manutencao())
      or (select public.fn_ve_combustivel())
      or (select public.fn_ve_frete())
      or (select public.fn_ve_estoque()));

drop view if exists public.ex_v_pastas, public.ex_v_atividades, public.ex_v_cronogramas;

drop table if exists
  public.ex_atividade_datas,
  public.ex_atividade_locais,
  public.ex_dependencias,
  public.ex_atividades,
  public.ex_cronogramas,
  public.ex_locais,
  public.ex_obra_usuarios,
  public.ex_obras,
  public.ex_servicos,
  public.ex_calendario_excecoes,
  public.ex_feriados,
  public.ex_calendarios;

do $drop$
declare f regprocedure;
begin
  for f in
    select p.oid::regprocedure from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and (p.proname like 'fn\_ex\_%' or p.proname = 'fn_ve_execucao')
  loop
    execute format('drop function %s', f);
  end loop;
end
$drop$;

delete from public.usuario_permissoes where recurso like 'execucao.%';
delete from public.perfil_permissoes where recurso like 'execucao.%';

do $confere$
declare v int;
begin
  select count(*) into v from pg_class c join pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'public' and c.relname like 'ex\_%' and c.relkind in ('r', 'v');
  if v <> 0 then raise exception 'Sobraram % tabelas/views ex_', v; end if;
  select count(*) into v from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public' and (p.proname like 'fn\_ex\_%' or p.proname = 'fn_ve_execucao');
  if v <> 0 then raise exception 'Sobraram % funções da Execução', v; end if;
  select count(*) into v from public.usuario_permissoes where recurso like 'execucao.%';
  select v + count(*) into v from public.perfil_permissoes where recurso like 'execucao.%';
  if v <> 0 then raise exception 'Sobraram % permissões execucao.*', v; end if;
end
$confere$;
