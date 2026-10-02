-- Medição de Contratos, Fase 6b: os 4 Admins ativos ganham ver e editar em Reajuste (importar o
-- relatório SIAC, lançar sem relatório, excluir relatório e configurar o reajuste do contrato).

with acoes(recurso, acao) as (values
  ('medicao.reajuste', 'ver'),
  ('medicao.reajuste', 'editar')
)
insert into public.perfil_permissoes (perfil_id, recurso, acao)
select p.id, a.recurso, a.acao from public.perfis p cross join acoes a where p.nome = 'Admin'
on conflict (perfil_id, recurso, acao) do nothing;

with acoes(recurso, acao) as (values
  ('medicao.reajuste', 'ver'),
  ('medicao.reajuste', 'editar')
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
  if v <> 92 then raise exception 'Esperado 92 permissões de medição (23 x 4 Admins), veio %', v; end if;
end $confere$;
