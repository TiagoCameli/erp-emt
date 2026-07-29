-- Buraco na faxina: ela so via arquivo com linha em `arquivos` marcada como
-- orfa. Binario que subiu para o bucket e NUNCA virou registro (falha entre o
-- upload e o insert, como o 42P10 do fn_registrar_arquivo causava) era
-- invisivel: ficava no bucket para sempre, sem ninguem para apagar.
--
-- Esta funcao lista esses binarios para a faxina remover pela Storage API
-- (delete direto em storage.objects e bloqueado pelo Supabase, e bem bloqueado).
-- A carencia evita apagar upload em voo, cujo registro esta a caminho.

create or replace function public.fn_binarios_sem_registro(p_carencia_horas int default 24)
returns table (path_storage text, criado_em timestamptz)
language sql stable security definer set search_path to '' as $function$
  select o.name, o.created_at
  from storage.objects o
  where o.bucket_id = 'anexos'
    and o.created_at < now() - make_interval(hours => p_carencia_horas)
    and not exists (select 1 from public.arquivos a where a.path_storage = o.name)
  order by o.created_at;
$function$;

comment on function public.fn_binarios_sem_registro(int) is
  'Binarios no bucket sem linha em arquivos (upload que nao virou registro). A faxina remove pela Storage API. Carencia evita apagar upload em voo.';

revoke all on function public.fn_binarios_sem_registro(int) from public;
revoke all on function public.fn_binarios_sem_registro(int) from anon;
revoke all on function public.fn_binarios_sem_registro(int) from authenticated;
grant execute on function public.fn_binarios_sem_registro(int) to service_role;
