-- Prova de aceite: cada um edita o PRÓPRIO perfil, e só as colunas de perfil.
--
-- Contexto: a policy de UPDATE de `usuarios` exige
-- `tem_permissao('administracao.usuarios','editar')`, que só os Admins têm. Para
-- o auto-serviço de "Minha conta" existir, o caminho é `fn_salvar_meu_perfil`,
-- SECURITY DEFINER, que escreve só nas colunas de perfil e só na linha de
-- `auth.uid()`.
--
-- O risco que esta prova cobre é o pior possível nesta base: se a gravação
-- pudesse tocar `perfil_id`, qualquer pessoa se promoveria a Admin pela tela de
-- "Minha conta" — e ninguém veria, porque a tela não mostra perfil de acesso.
--
-- `set_config('request.jwt.claims', ...)` SOZINHO não prova nada: o MCP entra
-- como owner e owner passa por cima da RLS. Quem faz a RLS valer é o
-- `set local role authenticated`.
--
-- Roda dentro de um DO que termina em `raise`: nada é gravado. As colunas de
-- perfil não têm sequência nem numeração, então o rollback não deixa buraco.
--
-- AS LINHAS DE CONTROLE (B, C, D) são o que dá valor ao resto: sem elas, uma
-- função que atualizasse a tabela inteira passaria no caso A.

do $prova$
declare
  v_andreia uuid := '7d0194c2-fd7e-41d1-b6c4-f05c0a652229';  -- perfil Compras
  v_dora    uuid := '3767e529-eae7-4178-852c-2dd2782efaaf';  -- perfil Financeiro
  v_perfil_admin uuid := (select id from public.perfis where nome = 'Admin' limit 1);
  v_perfil_antes uuid := (select perfil_id from public.usuarios where id = v_andreia);
  a_celular text; a_cargo text; a_uf text; a_nasc date; a_cpf text;
  b_dora_celular text := '(nao lido)';
  c_linhas int := -1;
  d_linhas int := -1;
  e_erro text := 'PASSOU (NAO DEVIA)';
  f_erro text := 'PASSOU (NAO DEVIA)';
  g_perfil_depois uuid;
begin
  perform set_config('request.jwt.claims', json_build_object('sub', v_andreia, 'role','authenticated')::text, true);
  execute 'set local role authenticated';

  -- A: Andreia (NÃO Admin) salva o próprio perfil. Tem que gravar, e tem que
  -- NORMALIZAR: máscara fora, cargo aparado, UF em maiúscula.
  perform public.fn_salvar_meu_perfil(
    '(68) 99999-1234', date '1990-05-17', '  Compradora  ', '4521',
    '111.444.777-35', 'MG-1234567',
    '69.900-000', 'Rua das Palmeiras', '123', 'Sala 2', 'Centro', 'Rio Branco', 'ac'
  );
  select celular, cargo, endereco_uf, data_nascimento, cpf
    into a_celular, a_cargo, a_uf, a_nasc, a_cpf
  from public.usuarios where id = v_andreia;

  -- B CONTROLE: a linha da Dora não pode ter sido tocada. A função não recebe
  -- id de usuário justamente para não existir a versão "salvar o perfil de
  -- outro"; isto confirma que o `where id = auth.uid()` é o que manda.
  select coalesce(celular, '(null)') into b_dora_celular from public.usuarios where id = v_dora;

  -- C CONTROLE: Andreia tentando se promover a Admin por UPDATE direto.
  -- A RLS barra devolvendo ZERO LINHAS, SEM ERRO — é o mesmo comportamento que
  -- prendeu o badge de "1º acesso pendente" nos não-Admin. Por isso a prova
  -- conta linhas em vez de esperar exceção: esperar exceção passaria à toa.
  update public.usuarios set perfil_id = v_perfil_admin where id = v_andreia;
  get diagnostics c_linhas = row_count;

  -- D CONTROLE: Andreia tentando escrever na linha da Dora por UPDATE direto.
  update public.usuarios set celular = '68900000000' where id = v_dora;
  get diagnostics d_linhas = row_count;

  -- E: celular curto recusado, com mensagem em pt-BR e não com o texto do CHECK.
  begin
    perform public.fn_salvar_meu_perfil('123', null, null, null, null, null, null, null, null, null, null, null, null);
  exception when others then e_erro := sqlerrm;
  end;

  -- F: nascimento no futuro recusado. A data de hoje é a de Rio Branco: à noite
  -- UTC já é amanhã aqui, e comparar em UTC recusaria uma data de hoje.
  begin
    perform public.fn_salvar_meu_perfil(null, (now() at time zone 'America/Rio_Branco')::date + 1,
      null, null, null, null, null, null, null, null, null, null, null);
  exception when others then f_erro := sqlerrm;
  end;

  reset role;
  select perfil_id into g_perfil_depois from public.usuarios where id = v_andreia;

  raise exception E'PROVA DO PERFIL (desfeita, nada gravado)\n  A) Andreia salvou o proprio: celular=% cargo=[%] uf=% nasc=% cpf=%\n  B) CONTROLE celular da Dora depois: %\n  C) CONTROLE update direto de perfil_id na propria linha: % linha(s)\n  D) CONTROLE update direto na linha da Dora: % linha(s)\n  E) celular "123" -> %\n  F) nascimento amanha -> %\n  G) perfil_id da Andreia antes=% depois=%',
    a_celular, a_cargo, a_uf, a_nasc, a_cpf, b_dora_celular, c_linhas, d_linhas, e_erro, f_erro, v_perfil_antes, g_perfil_depois;
end $prova$;

-- Resultado em 27/08/2026:
--
--   A) Andreia salvou o proprio: celular=68999991234 cargo=[Compradora]
--      uf=AC nasc=1990-05-17 cpf=11144477735
--   B) CONTROLE celular da Dora depois: <NULL>
--   C) CONTROLE update direto de perfil_id na propria linha: 0 linha(s)
--   D) CONTROLE update direto na linha da Dora: 0 linha(s)
--   E) celular "123" -> O celular precisa ter DDD e 10 ou 11 dígitos
--   F) nascimento amanha -> A data de nascimento não pode ser no futuro
--   G) perfil_id da Andreia antes=a2b0d58b-462f-4012-8f75-c5d444bfe580
--                              depois=a2b0d58b-462f-4012-8f75-c5d444bfe580
--
-- Leitura: a normalização funcionou nos três formatos (máscara de celular caiu,
-- cargo perdeu os espaços, "ac" virou "AC", CPF mascarado virou 11 dígitos). Os
-- três controles deram o resultado que TEM que dar: a linha de outro intacta e
-- ZERO linhas nos dois UPDATEs diretos, inclusive o que tentava trocar o próprio
-- perfil de acesso. O perfil_id da Andreia é o mesmo antes e depois.

-- =====================================================================
-- Parte 2 (HTTP): o PostgREST resolve a assinatura de 13 parâmetros
-- =====================================================================
--
-- Não se prova em SQL, e é a falha mais fácil de passar batida nesta migration:
-- o PostgREST casa a função pelos NOMES dos parâmetros que chegam no corpo. Um
-- nome errado na Server Action não quebra o `tsc`, não quebra o build e não
-- aparece em teste unitário — vira 404 na primeira vez que alguém clica em
-- "Salvar dados". Com treze parâmetros, a chance de errar um é real.
--
-- Rodado com a chave `anon` de propósito: o que se quer saber é se a assinatura
-- CASA, e o 42501 de permissão prova isso melhor que um 200 (que exigiria JWT de
-- usuário logado).
--
--   POST /rest/v1/rpc/fn_salvar_meu_perfil
--   corpo com as 13 chaves que `salvarMeuPerfil` monta
--   -> 401 {"code":"42501","message":"permission denied for function fn_salvar_meu_perfil"}
--
-- CONTROLE, trocando UM nome (p_celular -> p_telefone):
--   -> 404 {"code":"PGRST202","message":"Could not find the function
--           public.fn_salvar_meu_perfil(... p_telefone) in the schema cache"}
--
-- O controle é o que dá valor ao primeiro: a resolução por nome de parâmetro
-- acontece ANTES da checagem de permissão, então o 42501 só aparece quando as
-- treze chaves batem. E o 42501 confirma de passagem que o
-- `revoke ... from public` fechou a porta do `anon`.
