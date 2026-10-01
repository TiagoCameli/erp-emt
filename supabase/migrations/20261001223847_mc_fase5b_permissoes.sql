-- Medição de Contratos, Fase 5b: os 4 Admins ativos ganham editar, aprovar e desaprovar em Medições
-- (ciclo de conferência, envio e aprovação) e ver em Alertas.

with acoes(recurso, acao) as (values
  ('medicao.medicoes', 'editar'),
  ('medicao.medicoes', 'aprovar'),
  ('medicao.medicoes', 'desaprovar'),
  ('medicao.alertas', 'ver')
)
insert into public.perfil_permissoes (perfil_id, recurso, acao)
select p.id, a.recurso, a.acao from public.perfis p cross join acoes a where p.nome = 'Admin'
on conflict (perfil_id, recurso, acao) do nothing;

with acoes(recurso, acao) as (values
  ('medicao.medicoes', 'editar'),
  ('medicao.medicoes', 'aprovar'),
  ('medicao.medicoes', 'desaprovar'),
  ('medicao.alertas', 'ver')
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
  if v <> 84 then raise exception 'Esperado 84 permissões de medição (21 x 4 Admins), veio %', v; end if;
end $confere$;
