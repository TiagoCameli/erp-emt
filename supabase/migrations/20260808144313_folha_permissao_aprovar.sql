-- Alçada da folha: aprovar/desaprovar de rh.folha nascem SÓ no Admin.
-- O perfil RH gera e edita a folha; quem aprova é o Admin (segregação de função).
--
-- Duas tabelas porque o modelo tem template + efetivo:
--   perfil_permissoes  = template do perfil (o que a tela de perfis mostra)
--   usuario_permissoes = permissão efetiva por usuário, e é a ÚNICA que
--                        public.tem_permissao() consulta. Sem a segunda o
--                        Admin não aprovaria nada apesar do template.

-- 1) Template do perfil Admin.
insert into public.perfil_permissoes (perfil_id, recurso, acao)
select p.id, 'rh.folha', a.acao
from public.perfis p
cross join (values ('aprovar'), ('desaprovar')) as a(acao)
where p.nome = 'Admin'
on conflict (perfil_id, recurso, acao) do nothing;

-- 2) Permissão efetiva dos usuários do perfil Admin.
insert into public.usuario_permissoes (usuario_id, recurso, acao)
select u.id, 'rh.folha', a.acao
from public.usuarios u
join public.perfis p on p.id = u.perfil_id
cross join (values ('aprovar'), ('desaprovar')) as a(acao)
where p.nome = 'Admin' and u.excluido_em is null
on conflict (usuario_id, recurso, acao) do nothing;

do $$
declare v_vazado integer;
begin
  -- Fail-closed: nenhum perfil fora do Admin pode ter aprovar/desaprovar de rh.folha.
  select count(*) into v_vazado
  from public.perfil_permissoes pp
  join public.perfis p on p.id = pp.perfil_id
  where pp.recurso = 'rh.folha' and pp.acao in ('aprovar','desaprovar')
    and p.nome <> 'Admin';
  if v_vazado > 0 then
    raise exception 'Seed vazou aprovar/desaprovar de rh.folha para % perfil(is) fora do Admin', v_vazado;
  end if;
end $$;

do $$
declare v_vazado integer;
begin
  -- Fail-closed na tabela que tem_permissao() realmente le: nenhum usuario de
  -- perfil diferente de Admin pode sair daqui podendo aprovar a folha.
  select count(*) into v_vazado
  from public.usuario_permissoes up
  join public.usuarios u on u.id = up.usuario_id
  left join public.perfis p on p.id = u.perfil_id
  where up.recurso = 'rh.folha' and up.acao in ('aprovar','desaprovar')
    and coalesce(p.nome, '') <> 'Admin';
  if v_vazado > 0 then
    raise exception 'Seed vazou aprovar/desaprovar de rh.folha para % usuario(s) fora do Admin', v_vazado;
  end if;
end $$;
