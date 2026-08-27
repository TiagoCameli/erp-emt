-- Quem já administra as FORMAS de pagamento administra os CARTÕES.
--
-- `usuario_permissoes` é uma tabela por usuário, não uma derivação do perfil:
-- recurso novo nasce sem ninguém, e a tela some até para o Tiago. O critério
-- aqui é o único defensável sem inventar política: espelhar, ação por ação,
-- quem já tem cadastros.formas-pagamento — Tiago, Emanuel, Dora e Marvin em
-- 27/08/2026. Ninguém ganha um acesso que já não tivesse para o cadastro irmão.

insert into public.usuario_permissoes (usuario_id, recurso, acao, created_by)
select up.usuario_id, 'cadastros.cartoes', up.acao, up.created_by
from public.usuario_permissoes up
where up.recurso = 'cadastros.formas-pagamento'
  and not exists (
    select 1 from public.usuario_permissoes x
    where x.usuario_id = up.usuario_id
      and x.recurso = 'cadastros.cartoes'
      and x.acao = up.acao
  );

-- O mesmo espelho no PERFIL, para o próximo usuário do perfil já nascer com o
-- acesso. Hoje nenhum perfil tem formas-pagamento, então isto não insere nada;
-- fica aqui para o dia em que passar a ter, e para não criar a divergência
-- silenciosa entre os dois lados.
insert into public.perfil_permissoes (perfil_id, recurso, acao)
select pp.perfil_id, 'cadastros.cartoes', pp.acao
from public.perfil_permissoes pp
where pp.recurso = 'cadastros.formas-pagamento'
  and not exists (
    select 1 from public.perfil_permissoes x
    where x.perfil_id = pp.perfil_id
      and x.recurso = 'cadastros.cartoes'
      and x.acao = pp.acao
  );
