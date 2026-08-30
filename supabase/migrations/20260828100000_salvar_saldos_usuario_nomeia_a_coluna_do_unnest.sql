-- "Não foi possível salvar as contas": `salvar_saldos_usuario` estourava com
-- `42883 operator does not exist: uuid = text` no primeiro clique em
-- "Salvar contas".
--
-- A CAUSA, e é um erro de uma palavra:
--
--   from unnest(p_contas) as conta          -- ERRADO
--   from unnest(p_contas) as t(conta)       -- certo
--
-- Em `FROM unnest(...) as conta`, o alias é da TABELA, não da coluna. Então o
-- `where c.id = conta` do EXISTS comparava um uuid com o REGISTRO inteiro, e o
-- Postgres tentava resolver isso via texto — daí "uuid = text", que não parece
-- ter nada a ver com o problema.
--
-- POR QUE PASSOU PELA MIGRATION: plpgsql não valida as queries do corpo na
-- criação. `create or replace function` terminou com `success`, os advisors não
-- viram nada, e a função só quebrou na primeira EXECUÇÃO — que foi o Tiago
-- clicando no botão em produção.
--
-- POR QUE PASSOU PELAS MINHAS PROVAS, que é a parte que interessa: eu provei o
-- caminho de LEITURA com rigor (`fn_saldos_das_contas` e `fn_pode_ver_saldo`,
-- com troca de role, com linha de controle) e provei a ASSINATURA HTTP de outra
-- RPC. Desta eu nunca provei a EXECUÇÃO. Assinatura resolvida (42501 em vez de
-- PGRST202) diz que o PostgREST acha a função, não que ela roda.
--
-- A prova de execução está em
-- supabase/provas/saldo_por_conta_e_o_guard_do_pagamento.sql (parte 3).

create or replace function public.salvar_saldos_usuario(
  p_usuario_id uuid,
  p_contas uuid[]
)
returns void
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_editor uuid := (select auth.uid());
begin
  if not public.tem_permissao('administracao.usuarios', 'editar') then
    raise exception 'Sem permissao para editar permissoes de usuarios';
  end if;

  -- Não há trava de auto-lockout aqui, ao contrário de `salvar_matriz_usuario`:
  -- quem chega nesta função tem `administracao.usuarios / editar` e por isso vê
  -- o saldo de todas as contas de qualquer forma (`fn_pode_ver_saldo`). Não
  -- existe como se trancar fora do próprio saldo.
  delete from public.usuario_conta_saldo where usuario_id = p_usuario_id;

  insert into public.usuario_conta_saldo (usuario_id, conta_bancaria_id, created_by)
  select distinct p_usuario_id, t.conta, v_editor
  -- `as t(conta)` nomeia a COLUNA. Ver o cabeçalho: com `as conta` sozinho, o
  -- alias é da tabela e a comparação abaixo vira uuid = registro.
  from unnest(coalesce(p_contas, array[]::uuid[])) as t(conta)
  -- Ignora id que não é conta: o array vem do client, e uma FK estourando aqui
  -- viraria erro de banco na tela em vez de "salvo".
  where exists (select 1 from public.contas_bancarias c where c.id = t.conta);
end $function$;

comment on function public.salvar_saldos_usuario(uuid, uuid[]) is
  'Substitui as contas cujo saldo um usuário pode ver. Exige administracao.usuarios/editar.';

revoke all on function public.salvar_saldos_usuario(uuid, uuid[]) from public;
grant execute on function public.salvar_saldos_usuario(uuid, uuid[]) to authenticated;
