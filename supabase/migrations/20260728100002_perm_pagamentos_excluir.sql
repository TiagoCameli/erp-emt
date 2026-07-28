-- Nova acao 'excluir' em financeiro.pagamentos (para estornar um pagamento).
insert into public.perfil_permissoes (perfil_id, recurso, acao)
select p.id, 'financeiro.pagamentos', 'excluir'
from public.perfis p where p.nome = 'Admin'
on conflict (perfil_id, recurso, acao) do nothing;

-- Sincroniza na matriz efetiva de quem ja administra pagamentos (tem 'criar').
insert into public.usuario_permissoes (usuario_id, recurso, acao)
select up.usuario_id, 'financeiro.pagamentos', 'excluir'
from public.usuario_permissoes up
where up.recurso = 'financeiro.pagamentos' and up.acao = 'criar'
on conflict (usuario_id, recurso, acao) do nothing;
