-- Execução de Obras, Fase 1a: perfil Admin e os Admins ativos ganham as abas da fase.
-- As outras abas entram nas fases delas, com o backfill delas. Quem mais vê, o Tiago decide.

with acoes(recurso, acao) as (values
  ('execucao.obras', 'ver'),
  ('execucao.cronogramas', 'ver'), ('execucao.cronogramas', 'criar'), ('execucao.cronogramas', 'editar'), ('execucao.cronogramas', 'excluir'),
  ('execucao.modelos', 'ver'), ('execucao.modelos', 'criar'), ('execucao.modelos', 'editar'), ('execucao.modelos', 'excluir')
)
insert into public.perfil_permissoes (perfil_id, recurso, acao)
select p.id, a.recurso, a.acao from public.perfis p cross join acoes a where p.nome = 'Admin'
on conflict (perfil_id, recurso, acao) do nothing;

with acoes(recurso, acao) as (values
  ('execucao.obras', 'ver'),
  ('execucao.cronogramas', 'ver'), ('execucao.cronogramas', 'criar'), ('execucao.cronogramas', 'editar'), ('execucao.cronogramas', 'excluir'),
  ('execucao.modelos', 'ver'), ('execucao.modelos', 'criar'), ('execucao.modelos', 'editar'), ('execucao.modelos', 'excluir')
)
insert into public.usuario_permissoes (usuario_id, recurso, acao)
select u.id, a.recurso, a.acao
from public.usuarios u join public.perfis p on p.id = u.perfil_id and p.nome = 'Admin'
cross join acoes a
where u.ativo and u.excluido_em is null
on conflict (usuario_id, recurso, acao) do nothing;

do $confere$
declare v int;
begin
  select count(distinct usuario_id) into v from public.usuario_permissoes where recurso like 'execucao.%';
  if v <> 4 then raise exception 'Execução foi para % usuários; o plano diz 4 Admins ativos', v; end if;
  select count(*) into v from public.usuario_permissoes where recurso like 'execucao.%';
  if v <> 36 then raise exception 'Esperado 36 permissões de execução (9 x 4 Admins), veio %', v; end if;
end $confere$;
