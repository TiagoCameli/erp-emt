-- Medição de Contratos, Fase 1f: perfil Admin e os 4 Admins ativos ganham as abas da Fase 1.
-- As outras abas entram nas fases delas, com o backfill delas. Quem mais vê, o Tiago decide.

with acoes(recurso, acao) as (values
  ('medicao.contratos', 'ver'), ('medicao.contratos', 'criar'), ('medicao.contratos', 'editar'), ('medicao.contratos', 'excluir'),
  ('medicao.planilha', 'ver'), ('medicao.planilha', 'criar'), ('medicao.planilha', 'excluir'),
  ('medicao.planilha', 'aprovar'), ('medicao.planilha', 'desaprovar')
)
insert into public.perfil_permissoes (perfil_id, recurso, acao)
select p.id, a.recurso, a.acao from public.perfis p cross join acoes a where p.nome = 'Admin'
on conflict (perfil_id, recurso, acao) do nothing;

with acoes(recurso, acao) as (values
  ('medicao.contratos', 'ver'), ('medicao.contratos', 'criar'), ('medicao.contratos', 'editar'), ('medicao.contratos', 'excluir'),
  ('medicao.planilha', 'ver'), ('medicao.planilha', 'criar'), ('medicao.planilha', 'excluir'),
  ('medicao.planilha', 'aprovar'), ('medicao.planilha', 'desaprovar')
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
  if v <> 36 then raise exception 'Esperado 36 permissões de medição (9 x 4 Admins), veio %', v; end if;
end $confere$;
