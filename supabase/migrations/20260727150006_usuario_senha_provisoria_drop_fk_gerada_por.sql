-- A FK gerada_por -> usuarios criava uma SEGUNDA relação entre
-- usuario_senha_provisoria e usuarios. Isso deixava o embed
-- `usuario_senha_provisoria(...)` (usado na lista de Administração >
-- Usuários) AMBÍGUO: o PostgREST não sabia por qual FK resolver e
-- devolvia HTTP 300, quebrando a tela. gerada_por passa a ser coluna
-- simples (sem FK). Não há perda prática: usuário nunca é apagado de
-- verdade (soft delete via excluido_em), então a referência não fica órfã.
alter table public.usuario_senha_provisoria
  drop constraint if exists usuario_senha_provisoria_gerada_por_fkey;
