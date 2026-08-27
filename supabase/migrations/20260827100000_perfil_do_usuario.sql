-- Minha conta: cada usuário preenche os próprios dados.
--
-- Até aqui `usuarios` tinha só o necessário para entrar no sistema (nome, email,
-- ativo, perfil). Quem precisava do celular de alguém perguntava no grupo.
--
-- POR QUE EM `usuarios` E NÃO EM `colaboradores`, que já tem telefone,
-- data_nascimento, cpf e rg: são coisas diferentes com donos diferentes.
-- `colaboradores` é a ficha de EMPREGO, mantida pelo RH, e carrega salário,
-- banco, agência, conta e chave PIX na mesma linha. Um formulário de
-- auto-serviço apontado para lá seria um caminho para a pessoa editar o próprio
-- salário e a própria conta de depósito. Aqui o dado é o do USUÁRIO DO SISTEMA:
-- como falar com ele. Conferido em 27/08/2026: dos 7 usuários ativos, só um
-- (Tiago) tem colaborador de mesmo nome, e mesmo nele telefone e data de
-- nascimento estavam vazios — não há dado duplicado para conciliar.
--
-- COMO A GRAVAÇÃO ACONTECE, que é a parte que decide a segurança: a policy de
-- UPDATE de `usuarios` exige `tem_permissao('administracao.usuarios','editar')`,
-- que só os Admins têm. Afrouxar essa policy para "ou a própria linha" abriria
-- `perfil_id` e `ativo` para o próprio usuário, isto é, cada um se promoveria a
-- Admin. RLS não filtra COLUNA, e restringir por `grant` de coluna atingiria o
-- role `authenticated` inteiro, quebrando a edição feita pelo Admin.
--
-- A saída é a mesma que `fn_limpar_senha_provisoria_propria` já usa nesta base:
-- uma função SECURITY DEFINER que escreve SÓ nas colunas de perfil e SÓ na linha
-- de `auth.uid()`. O que ela não menciona, ninguém muda por ela.
--
-- Auditoria: `trg_audit_usuarios` já existe e dispara em UPDATE, então cada
-- alteração de perfil entra em `audit_log` sem nada novo aqui.

-- =====================================================================
-- 1. Colunas
-- =====================================================================

alter table public.usuarios
  add column if not exists celular text,
  add column if not exists data_nascimento date,
  add column if not exists cargo text,
  add column if not exists ramal text,
  add column if not exists cpf text,
  add column if not exists rg text,
  -- Endereço com prefixo, no mesmo estilo de `rg_*`, `ctps_*` e `cnh_*` de
  -- colaboradores: agrupa o bloco, e `numero` solto numa tabela de documento é
  -- ambíguo (número de quê?).
  add column if not exists endereco_cep text,
  add column if not exists endereco_logradouro text,
  add column if not exists endereco_numero text,
  add column if not exists endereco_complemento text,
  add column if not exists endereco_bairro text,
  add column if not exists endereco_cidade text,
  add column if not exists endereco_uf text;

comment on column public.usuarios.celular is 'Só dígitos, com DDD (10 ou 11). A máscara é da tela.';
comment on column public.usuarios.cpf is 'Só dígitos (11). Não confundir com colaboradores.cpf, que é da ficha de emprego do RH.';
comment on column public.usuarios.endereco_cep is 'Só dígitos (8).';

-- =====================================================================
-- 2. CHECKs
-- =====================================================================
--
-- Guardar DÍGITOS e deixar a máscara para a tela: com máscara no banco, o mesmo
-- celular entra como "(68) 99999-1234" e como "68999991234" e nenhuma busca
-- acha os dois. Os CHECKs abaixo são o que garante que a coluna só tem dígitos,
-- mesmo se um dia alguém gravar por fora da RPC.
--
-- `btrim` recebe a lista de brancos EXPLÍCITA: `btrim(x)` sem argumento corta só
-- espaço, então uma string feita de \n passaria por "tem pelo menos 1
-- caractere" e a tela desenharia um campo preenchido com nada dentro.

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'usuarios_celular_check') then
    alter table public.usuarios add constraint usuarios_celular_check
      check (celular is null or celular ~ '^[0-9]{10,11}$');
  end if;

  if not exists (select 1 from pg_constraint where conname = 'usuarios_cpf_check') then
    alter table public.usuarios add constraint usuarios_cpf_check
      check (cpf is null or cpf ~ '^[0-9]{11}$');
  end if;

  if not exists (select 1 from pg_constraint where conname = 'usuarios_endereco_cep_check') then
    alter table public.usuarios add constraint usuarios_endereco_cep_check
      check (endereco_cep is null or endereco_cep ~ '^[0-9]{8}$');
  end if;

  -- Faixa IMUTÁVEL de propósito. "Não pode ser no futuro" depende de hoje, e
  -- CHECK com `current_date` transforma uma linha válida hoje em linha inválida
  -- amanhã: o `pg_restore` de um dump antigo passa a falhar. Essa regra vive na
  -- RPC e no Zod, onde ela pode olhar o calendário.
  if not exists (select 1 from pg_constraint where conname = 'usuarios_data_nascimento_check') then
    alter table public.usuarios add constraint usuarios_data_nascimento_check
      check (data_nascimento is null
             or (data_nascimento >= date '1900-01-01' and data_nascimento <= date '2100-01-01'));
  end if;

  if not exists (select 1 from pg_constraint where conname = 'usuarios_endereco_uf_check') then
    alter table public.usuarios add constraint usuarios_endereco_uf_check
      check (endereco_uf is null or endereco_uf = any (array[
        'AC','AL','AP','AM','BA','CE','DF','ES','GO','MA','MT','MS','MG','PA',
        'PB','PR','PE','PI','RJ','RN','RS','RO','RR','SC','SP','SE','TO'
      ]));
  end if;

  -- Tetos de texto. RG e ramal ficam livres de formato de propósito: RG varia de
  -- estado para estado (alguns têm letra) e ramal às vezes vem anotado como
  -- "4521 obra". Recusar o que a pessoa tem escrito no documento é pior que
  -- aceitar texto.
  if not exists (select 1 from pg_constraint where conname = 'usuarios_cargo_check') then
    alter table public.usuarios add constraint usuarios_cargo_check
      check (cargo is null or (length(btrim(cargo, E' \t\r\n')) between 1 and 60));
  end if;

  if not exists (select 1 from pg_constraint where conname = 'usuarios_ramal_check') then
    alter table public.usuarios add constraint usuarios_ramal_check
      check (ramal is null or (length(btrim(ramal, E' \t\r\n')) between 1 and 20));
  end if;

  if not exists (select 1 from pg_constraint where conname = 'usuarios_rg_check') then
    alter table public.usuarios add constraint usuarios_rg_check
      check (rg is null or (length(btrim(rg, E' \t\r\n')) between 1 and 20));
  end if;

  if not exists (select 1 from pg_constraint where conname = 'usuarios_endereco_logradouro_check') then
    alter table public.usuarios add constraint usuarios_endereco_logradouro_check
      check (endereco_logradouro is null or (length(btrim(endereco_logradouro, E' \t\r\n')) between 1 and 120));
  end if;

  if not exists (select 1 from pg_constraint where conname = 'usuarios_endereco_numero_check') then
    alter table public.usuarios add constraint usuarios_endereco_numero_check
      check (endereco_numero is null or (length(btrim(endereco_numero, E' \t\r\n')) between 1 and 20));
  end if;

  if not exists (select 1 from pg_constraint where conname = 'usuarios_endereco_complemento_check') then
    alter table public.usuarios add constraint usuarios_endereco_complemento_check
      check (endereco_complemento is null or (length(btrim(endereco_complemento, E' \t\r\n')) between 1 and 60));
  end if;

  if not exists (select 1 from pg_constraint where conname = 'usuarios_endereco_bairro_check') then
    alter table public.usuarios add constraint usuarios_endereco_bairro_check
      check (endereco_bairro is null or (length(btrim(endereco_bairro, E' \t\r\n')) between 1 and 60));
  end if;

  if not exists (select 1 from pg_constraint where conname = 'usuarios_endereco_cidade_check') then
    alter table public.usuarios add constraint usuarios_endereco_cidade_check
      check (endereco_cidade is null or (length(btrim(endereco_cidade, E' \t\r\n')) between 1 and 60));
  end if;
end $$;

-- =====================================================================
-- 3. A gravação de auto-serviço
-- =====================================================================

create or replace function public.fn_salvar_meu_perfil(
  p_celular text,
  p_data_nascimento date,
  p_cargo text,
  p_ramal text,
  p_cpf text,
  p_rg text,
  p_endereco_cep text,
  p_endereco_logradouro text,
  p_endereco_numero text,
  p_endereco_complemento text,
  p_endereco_bairro text,
  p_endereco_cidade text,
  p_endereco_uf text
)
returns void
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_uid uuid := (select auth.uid());
  v_celular text;
  v_cpf text;
  v_cep text;
  v_uf text;
  v_linhas integer;
begin
  -- Sem sessão não existe "meu" perfil. Recusa em vez de atualizar zero linhas
  -- em silêncio, que na tela viraria "salvo" sem nada ter sido salvo.
  if v_uid is null then
    raise exception 'Sem usuário autenticado';
  end if;

  -- Normalização: dígitos no que é numérico, texto aparado no resto, e vazio
  -- vira NULL. Fica AQUI, e não só no Zod, porque esta função é a última
  -- barreira: o dia em que outra tela chamar a RPC direto, a coluna continua
  -- com dígito e sem string de espaços.
  v_celular := nullif(regexp_replace(coalesce(p_celular, ''), '[^0-9]', '', 'g'), '');
  v_cpf     := nullif(regexp_replace(coalesce(p_cpf, ''), '[^0-9]', '', 'g'), '');
  v_cep     := nullif(regexp_replace(coalesce(p_endereco_cep, ''), '[^0-9]', '', 'g'), '');
  v_uf      := nullif(upper(btrim(coalesce(p_endereco_uf, ''), E' \t\r\n')), '');

  -- As mensagens saem em pt-BR daqui porque a alternativa é o erro do CHECK,
  -- que chega na tela como "violates check constraint usuarios_celular_check".
  if v_celular is not null and v_celular !~ '^[0-9]{10,11}$' then
    raise exception 'O celular precisa ter DDD e 10 ou 11 dígitos';
  end if;
  if v_cpf is not null and v_cpf !~ '^[0-9]{11}$' then
    raise exception 'O CPF precisa ter 11 dígitos';
  end if;
  if v_cep is not null and v_cep !~ '^[0-9]{8}$' then
    raise exception 'O CEP precisa ter 8 dígitos';
  end if;

  -- "Não pode nascer no futuro" mora aqui, e não no CHECK, porque depende de
  -- hoje (ver o comentário da constraint). O fuso é o da empresa: à noite, UTC
  -- já é amanhã em Rio Branco, e uma data de hoje seria recusada como futura.
  if p_data_nascimento is not null
     and p_data_nascimento > (now() at time zone 'America/Rio_Branco')::date then
    raise exception 'A data de nascimento não pode ser no futuro';
  end if;

  -- O UPDATE lista as colunas UMA POR UMA, e é isso que faz esta função ser
  -- segura: `perfil_id`, `ativo`, `nome`, `email` e `excluido_em` não estão
  -- aqui, então ninguém muda o próprio perfil de acesso por este caminho.
  -- `where id = v_uid` amarra na própria linha; o id NÃO é parâmetro de
  -- propósito, para não existir a versão "salvar o perfil de outro".
  update public.usuarios set
    celular               = v_celular,
    data_nascimento       = p_data_nascimento,
    cargo                 = nullif(btrim(coalesce(p_cargo, ''), E' \t\r\n'), ''),
    ramal                 = nullif(btrim(coalesce(p_ramal, ''), E' \t\r\n'), ''),
    cpf                   = v_cpf,
    rg                    = nullif(btrim(coalesce(p_rg, ''), E' \t\r\n'), ''),
    endereco_cep          = v_cep,
    endereco_logradouro   = nullif(btrim(coalesce(p_endereco_logradouro, ''), E' \t\r\n'), ''),
    endereco_numero       = nullif(btrim(coalesce(p_endereco_numero, ''), E' \t\r\n'), ''),
    endereco_complemento  = nullif(btrim(coalesce(p_endereco_complemento, ''), E' \t\r\n'), ''),
    endereco_bairro       = nullif(btrim(coalesce(p_endereco_bairro, ''), E' \t\r\n'), ''),
    endereco_cidade       = nullif(btrim(coalesce(p_endereco_cidade, ''), E' \t\r\n'), ''),
    endereco_uf           = v_uf
  where id = v_uid;

  get diagnostics v_linhas = row_count;
  -- Zero linhas com sessão válida significa usuário sem cadastro (ou excluído).
  -- Melhor recusar que devolver sucesso para uma gravação que não aconteceu.
  if v_linhas = 0 then
    raise exception 'Usuário não encontrado';
  end if;
end;
$function$;

comment on function public.fn_salvar_meu_perfil(text, date, text, text, text, text, text, text, text, text, text, text, text) is
  'Grava os dados de perfil do PRÓPRIO usuário (auth.uid()). Não toca em nome, email, ativo nem perfil_id.';

-- Função nova nasce com EXECUTE para PUBLIC, e PUBLIC inclui `anon`. Sem o
-- revoke, qualquer requisição sem login chamaria isto (com auth.uid() nulo ela
-- recusaria, mas a porta não deve nem existir).
revoke all on function public.fn_salvar_meu_perfil(text, date, text, text, text, text, text, text, text, text, text, text, text) from public;
grant execute on function public.fn_salvar_meu_perfil(text, date, text, text, text, text, text, text, text, text, text, text, text) to authenticated;
