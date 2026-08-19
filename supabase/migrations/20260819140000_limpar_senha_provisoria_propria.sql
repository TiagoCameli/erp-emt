-- O badge "1º acesso pendente" ficava para sempre em quem não é Admin.
--
-- ## O sintoma
--
-- Andreia, Brenda, Dora e Marvin fizeram o primeiro acesso e definiram a própria
-- senha, e a tela de Usuários e permissões continuava marcando "1º acesso
-- pendente" nos quatro. Emanuel, James e Tiago — os três Admin — nunca ficaram
-- presos. A diferença não era o login: era o perfil.
--
-- ## A causa
--
-- O badge não olha login nenhum. Ele é a existência de uma linha em
-- `usuario_senha_provisoria`, e essa linha deveria morrer quando a pessoa define
-- a própria senha. `definirSenha`/`alterarSenha` (src/modules/auth/actions.ts)
-- mandavam o delete do próprio usuário, com o client normal:
--
--     delete from usuario_senha_provisoria where usuario_id = auth.uid()
--
-- A policy de DELETE permite exatamente isso (`usuario_id = auth.uid()`). Mas a
-- policy de **SELECT** da mesma tabela exige `tem_permissao('administracao.
-- usuarios', 'ver')` — a senha em texto puro é para o admin repassar, então só
-- admin lê. E um `delete ... where coluna = valor` precisa LER a linha para
-- avaliar o where: o Postgres aplica a policy de SELECT junto com a de DELETE.
--
-- Quem não tem `usuarios.ver` não enxerga a linha, o delete casa zero linhas e
-- **não devolve erro** — `error` vem null, `logErroServidor` nunca dispara. O
-- app achava que limpou. Medido numa tabela de teste, mesma policy de DELETE nas
-- duas pontas, mudando só a de SELECT:
--
--     policy de select `using (false)`  ->  1 linha sobrou, sem erro
--     policy de select `using (true)`   ->  0 linhas sobraram
--
-- Correlação perfeita no banco: os 3 com `usuarios.ver` estão limpos, os 4 sem
-- estão presos.
--
-- ## O conserto
--
-- A limpeza deixa de depender do RLS de quem chama. `security definer` para
-- passar por cima das policies, e SEM PARÂMETRO: a função só sabe apagar a linha
-- do próprio `auth.uid()`, então não existe forma de um usuário comum usá-la para
-- apagar a provisória de outro (que é o que a policy de DELETE protegia).
--
-- Devolve a contagem apagada em vez de void: com a policy fora do caminho, zero
-- passa a significar "não havia provisória" (troca de senha comum, recuperação),
-- e não mais "o RLS me barrou em silêncio".

create or replace function public.fn_limpar_senha_provisoria_propria()
returns integer
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_uid uuid := (select auth.uid());
  v_apagadas integer;
begin
  -- Sem sessão não há "própria" linha: recusa em vez de apagar nada calado.
  if v_uid is null then
    raise exception 'Sem usuario autenticado';
  end if;

  delete from public.usuario_senha_provisoria
  where usuario_id = v_uid;

  get diagnostics v_apagadas = row_count;
  return v_apagadas;
end;
$function$;

comment on function public.fn_limpar_senha_provisoria_propria() is
  'Apaga a senha provisoria do proprio usuario logado (auth.uid()) ao definir/alterar a senha. security definer porque a policy de SELECT da tabela e so de admin, e sem ela o delete casava zero linhas sem erro. Sem parametro: nao da para limpar a de outro.';

revoke execute on function public.fn_limpar_senha_provisoria_propria() from public;
grant execute on function public.fn_limpar_senha_provisoria_propria() to authenticated;

-- ## Os que já ficaram presos
--
-- Quem tem provisória guardada mas já definiu a própria senha. `senha_temporaria`
-- nasce `true` no cadastro (`convidarUsuario`) e volta a `true` no reset do admin
-- (`redefinirSenhaUsuario`); só `definirSenha`/`alterarSenha` põem `false`. Então
-- `false` prova que a pessoa trocou a senha e a provisória é lixo.
--
-- O `= 'false'` é literal de propósito: metadata sem a chave dá null e NÃO entra,
-- para não apagar a provisória de quem de fato ainda não acessou.

delete from public.usuario_senha_provisoria sp
using auth.users au
where au.id = sp.usuario_id
  and au.raw_user_meta_data->>'senha_temporaria' = 'false';
