-- Medição de Contratos, Fase 3b: perfil Admin e os 4 Admins ativos ganham o Painel e o Boletim.
-- As outras abas entram nas fases delas, com o backfill delas. Quem mais vê, o Tiago decide.

with acoes(recurso, acao) as (values
  ('medicao.painel', 'ver'),
  ('medicao.boletim', 'ver')
)
insert into public.perfil_permissoes (perfil_id, recurso, acao)
select p.id, a.recurso, a.acao from public.perfis p cross join acoes a where p.nome = 'Admin'
on conflict (perfil_id, recurso, acao) do nothing;

with acoes(recurso, acao) as (values
  ('medicao.painel', 'ver'),
  ('medicao.boletim', 'ver')
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
  select count(distinct usuario_id) into v from public.usuario_permissoes where recurso like 'medicao.%';
  if v <> 4 then raise exception 'Medição foi para % usuários; o plano diz 4 Admins ativos', v; end if;
  select count(*) into v from public.usuario_permissoes where recurso like 'medicao.%';
  if v <> 44 then raise exception 'Esperado 44 permissões de medição (11 x 4 Admins), veio %', v; end if;
end $confere$;
