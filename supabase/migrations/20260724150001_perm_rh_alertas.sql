-- Seed de permissão do recurso rh.alertas (aba "Alertas", 1ª aba do módulo RH).
--
-- Espelha exatamente quem já tem rh.documentos/ver:
--   - perfil_permissoes: perfis Admin, Gestor, RH (únicos com rh.documentos/ver)
--   - usuario_permissoes: usuário tiago@emtconstrutora.com (único com rh.documentos/ver)
--
-- Idempotente via ON CONFLICT DO NOTHING nas unique keys
-- (perfil_id, recurso, acao) e (usuario_id, recurso, acao).
--
-- Rollback:
--   delete from perfil_permissoes where recurso = 'rh.alertas';
--   delete from usuario_permissoes where recurso = 'rh.alertas';

insert into perfil_permissoes (perfil_id, recurso, acao)
select pp.perfil_id, 'rh.alertas', pp.acao
from perfil_permissoes pp
where pp.recurso = 'rh.documentos'
  and pp.acao = 'ver'
on conflict (perfil_id, recurso, acao) do nothing;

insert into usuario_permissoes (usuario_id, recurso, acao)
select up.usuario_id, 'rh.alertas', up.acao
from usuario_permissoes up
where up.recurso = 'rh.documentos'
  and up.acao = 'ver'
on conflict (usuario_id, recurso, acao) do nothing;
