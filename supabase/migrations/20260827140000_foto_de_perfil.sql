-- Foto de perfil do usuário.
--
-- =====================================================================
-- POR QUE UM BUCKET PRÓPRIO, E NÃO O `anexos`
-- =====================================================================
--
-- Porque a faxina apagaria a foto sozinha. `fn_binarios_sem_registro` varre o
-- bucket `anexos` INTEIRO e devolve todo objeto sem linha em `public.arquivos`
-- criado há mais de 24 horas; o cron da Vercel então chama `removerBinarios`
-- nessa lista. Uma foto guardada em `anexos` não tem linha em `arquivos` (ela
-- não é anexo de documento nenhum), então desapareceria no dia seguinte, sem
-- erro em lugar nenhum — a tela voltaria a mostrar as iniciais e ninguém saberia
-- por quê.
--
-- A alternativa era excluir o prefixo `avatares/` dentro de
-- `fn_binarios_sem_registro`. Recusada: acrescenta uma exceção numa função de
-- FAXINA (a que apaga binário) para resolver um problema de outra feature, e o
-- custo de errar ali é apagar anexo de verdade.
--
-- De brinde, o bucket próprio consegue o que o `anexos` não pode ter: filtro de
-- MIME. `anexos` aceita qualquer tipo de propósito (nota em PDF, planilha, foto
-- da obra) e a recusa dele mora em `validarArquivo`. Aqui só entra JPEG, e é o
-- Storage que garante, não a tela.
--
-- SEM POLICY DE STORAGE, seguindo o modelo que o projeto fechou em
-- 20260728200004: nenhum client fala com o Storage por conta própria. A leitura
-- sai por URL assinada gerada no servidor, e a escrita por token de upload
-- assinado, também emitido no servidor depois de decidir o caminho. Com RLS
-- ligada e nenhuma policy, não existe caminho direto.

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'avatares',
  'avatares',
  false,
  -- 2 MB. A tela reduz a imagem para 512x512 JPEG antes de subir, o que dá algo
  -- entre 40 e 150 KB; 2 MB é folga para o caso de o navegador não conseguir
  -- redimensionar e mandar o arquivo como veio. O bucket é o ÚNICO ponto do
  -- caminho que pode dizer não, porque os bytes não passam pela server action.
  2 * 1024 * 1024,
  -- Só JPEG. A tela converte tudo para JPEG no canvas, então isto não recusa
  -- nada que ela produza — e recusa qualquer coisa que ela NÃO tenha produzido.
  array['image/jpeg']
)
on conflict (id) do update
  set public = false,
      file_size_limit = 2 * 1024 * 1024,
      allowed_mime_types = array['image/jpeg'];

-- =====================================================================
-- A coluna, amarrada na própria linha
-- =====================================================================

alter table public.usuarios
  add column if not exists foto_path text;

comment on column public.usuarios.foto_path is
  'Caminho da foto no bucket `avatares`. Sempre avatares/<id do usuario>.jpg, garantido por CHECK. Null = sem foto.';

do $$
begin
  -- O CHECK compara com a COLUNA `id` da própria linha, e não com um padrão
  -- genérico de uuid. A diferença é o que ele impede: com `~ '^avatares/.*'`, a
  -- linha da Andreia poderia apontar para a foto da Dora e a tela mostraria o
  -- rosto errado. Assim, uma linha só consegue apontar para o SEU objeto — a
  -- invariante vale mesmo para um UPDATE feito por fora do app.
  if not exists (select 1 from pg_constraint where conname = 'usuarios_foto_path_check') then
    alter table public.usuarios add constraint usuarios_foto_path_check
      check (foto_path is null or foto_path = 'avatares/' || id::text || '.jpg');
  end if;
end $$;

-- =====================================================================
-- Gravar e remover: só a própria linha
-- =====================================================================
--
-- As duas NÃO RECEBEM CAMINHO. O caminho é DERIVADO de `auth.uid()` dentro da
-- função, então não existe a versão "apontar minha linha para a foto de outro" —
-- nem por engano na Server Action, nem por chamada direta na RPC. É o mesmo
-- raciocínio de `fn_salvar_meu_perfil`, que também não recebe id de usuário.

create or replace function public.fn_salvar_minha_foto()
returns text
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_uid uuid := (select auth.uid());
  v_path text;
begin
  if v_uid is null then
    raise exception 'Sem usuário autenticado';
  end if;

  update public.usuarios
  set foto_path = 'avatares/' || v_uid::text || '.jpg'
  where id = v_uid
  returning foto_path into v_path;

  -- Zero linhas com sessão válida é usuário sem cadastro. Recusa em vez de
  -- devolver null como se tivesse gravado.
  if v_path is null then
    raise exception 'Usuário não encontrado';
  end if;

  -- Devolve o caminho GRAVADO para quem chamou poder conferir que é o mesmo em
  -- que o binário foi posto. Se as duas contas do caminho (esta, em SQL, e a da
  -- action, em TypeScript) divergirem algum dia, a comparação transforma um
  -- avatar quebrado em silêncio num erro visível.
  return v_path;
end;
$function$;

create or replace function public.fn_remover_minha_foto()
returns text
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_uid uuid := (select auth.uid());
  v_path text;
begin
  if v_uid is null then
    raise exception 'Sem usuário autenticado';
  end if;

  -- Guarda o caminho ANTES de limpar: é ele que quem chamou usa para apagar o
  -- binário. Sem devolver, a linha ficaria sem foto e o objeto sobraria no
  -- bucket para sempre — e este bucket não tem faxina, justamente porque ele
  -- não pode ter (ver o cabeçalho).
  select foto_path into v_path from public.usuarios where id = v_uid;

  update public.usuarios set foto_path = null where id = v_uid;

  -- Null aqui é resposta legítima: "não havia foto". Quem chama não apaga nada.
  return v_path;
end;
$function$;

comment on function public.fn_salvar_minha_foto() is
  'Aponta a PRÓPRIA linha (auth.uid()) para a foto dela e devolve o caminho. Não recebe caminho: ele é derivado do uid.';
comment on function public.fn_remover_minha_foto() is
  'Tira a foto da PRÓPRIA linha e devolve o caminho que estava lá, para o chamador apagar o binário. Null = não havia foto.';

-- Função nova nasce com EXECUTE para PUBLIC, e PUBLIC inclui `anon`.
revoke all on function public.fn_salvar_minha_foto() from public;
revoke all on function public.fn_remover_minha_foto() from public;
grant execute on function public.fn_salvar_minha_foto() to authenticated;
grant execute on function public.fn_remover_minha_foto() to authenticated;
