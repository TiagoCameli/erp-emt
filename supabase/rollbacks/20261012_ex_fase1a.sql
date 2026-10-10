-- Rollback da Fase 1a da Execução. Só objetos ex_ e as permissões execucao.*.
-- Rodar só com o ok do Tiago. Ordem: views, funções, tabelas (filhas antes), permissões.
begin;
drop view if exists public.ex_v_atividades, public.ex_v_cronogramas, public.ex_v_pastas;
do $drop$
declare f record;
begin
  for f in select p.oid::regprocedure as assinatura from pg_proc p join pg_namespace n on n.oid = p.pronamespace
           where n.nspname = 'public' and (p.proname like 'fn\_ex\_%' or p.proname = 'fn_ve_execucao') loop
    execute format('drop function if exists %s cascade', f.assinatura);
  end loop;
end $drop$;
drop table if exists public.ex_atividade_datas, public.ex_dependencias, public.ex_atividade_locais,
  public.ex_atividades, public.ex_servicos, public.ex_locais, public.ex_cronogramas, public.ex_obra_usuarios,
  public.ex_obras, public.ex_calendario_excecoes, public.ex_feriados, public.ex_calendarios;
delete from public.usuario_permissoes where recurso like 'execucao.%';
delete from public.perfil_permissoes where recurso like 'execucao.%';
commit;
