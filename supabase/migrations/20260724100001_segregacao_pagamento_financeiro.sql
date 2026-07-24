-- Segregação de função (decisão do Tiago, #11 do QA): Financeiro lança e paga;
-- Gestor aprova o pagamento. Quem paga não deve aprovar o próprio pagamento.
-- Remove aprovar/desaprovar do perfil Financeiro na aprovação de pagamentos.
-- Mantém o 'ver' (Financeiro acompanha o que está pendente, sem poder aprovar).
-- Gestor já tem aprovar/desaprovar e não paga (só 'ver' em pagamentos) — sem mudança.
-- 0 usuários no perfil Financeiro hoje; o delete em usuario_permissoes é defensivo.
--
-- Rollback:
--   insert into public.perfil_permissoes (perfil_id, recurso, acao)
--   select (select id from public.perfis where nome='Financeiro'),
--          'financeiro.aprovacao-pagamentos', acao
--   from (values ('aprovar'),('desaprovar')) as a(acao)
--   on conflict do nothing;

delete from public.perfil_permissoes
where perfil_id = (select id from public.perfis where nome = 'Financeiro')
  and recurso = 'financeiro.aprovacao-pagamentos'
  and acao in ('aprovar', 'desaprovar');

delete from public.usuario_permissoes
where usuario_id in (
    select id from public.usuarios
    where perfil_id = (select id from public.perfis where nome = 'Financeiro')
  )
  and recurso = 'financeiro.aprovacao-pagamentos'
  and acao in ('aprovar', 'desaprovar');
