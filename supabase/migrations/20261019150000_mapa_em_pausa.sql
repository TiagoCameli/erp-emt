-- Mapa em pausa (Tiago, 19/10/2026: "quero inativar o modulo de mapa por enquanto. coloque ele em
-- pausa, niguem deve poder acessalo").
--
-- A pausa vale para TODOS, inclusive quem tem a permissão gravada. As permissões em
-- usuario_permissoes / perfil_permissoes NÃO são apagadas: retomar é só desligar a chave.
--
-- Como: tem_permissao responde false para qualquer recurso de um módulo cuja chave
-- `<modulo>.em_pausa` em configuracoes valha true. Toda policy do Mapa (mapa_*,
-- colaborador_dias_centro, equipamento_dias_centro) e o fn_mapa_exigir das RPCs passam por
-- tem_permissao('mapa.…'), então o banco inteiro do Mapa fecha num ponto só. Os outros módulos não
-- têm a chave e não mudam.
--
-- O que continua rodando: os crons (dias por centro às 23:55, foto às 23:59, alertas de hora em
-- hora) rodam sem usuário e não passam por tem_permissao.
--
-- No app, a mesma pausa está em MODULOS_EM_PAUSA (src/config/recursos.ts).
-- Para RETOMAR: update public.configuracoes set valor = 'false'::jsonb where chave = 'mapa.em_pausa';
-- e tirar "mapa" de MODULOS_EM_PAUSA.

insert into public.configuracoes (chave, valor, descricao)
values ('mapa.em_pausa', 'true'::jsonb,
        'Módulo Mapa em pausa: ninguém acessa (tem_permissao nega mapa.*). false para retomar.')
on conflict (chave) do update set valor = excluded.valor, descricao = excluded.descricao, updated_at = now();

CREATE OR REPLACE FUNCTION public.tem_permissao(p_recurso text, p_acao text)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  select exists (
    select 1
    from public.usuario_permissoes up
    join public.usuarios u on u.id = up.usuario_id
    where up.usuario_id = (select auth.uid())
      and up.recurso = p_recurso
      and up.acao = p_acao
      and u.ativo
  )
  and not exists (
    select 1 from public.configuracoes c
    where c.chave = split_part(p_recurso, '.', 1) || '.em_pausa'
      and c.valor = 'true'::jsonb
  );
$function$;
