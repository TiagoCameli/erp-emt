# Cadastro de usuário com senha provisória visível ao admin

Data: 2026-07-27
Recurso afetado: `administracao.usuarios`
Módulo: `src/modules/administracao/usuarios`, `src/modules/auth`

## Problema

1. O convite de usuário depende de email (`inviteUserByEmail`). O Supabase do projeto não tem SMTP configurado, então o email não chega. Pior: quando o Supabase aceita a chamada mas o email silenciosamente não sai, o fallback de senha temporária não dispara (só dispara em `error`), e o admin fica sem nada para repassar. Resultado prático: "convite não funciona".
2. O admin precisa conseguir passar o acesso ao usuário e nunca ficar travado (funcionário novo, esqueceu a senha). Hoje, mesmo no fallback, a senha temporária aparece uma única vez e não fica guardada em lugar reabrível.

## Objetivo

Onboarding de usuário sem depender de email, com **senha provisória gerada pelo sistema, visível aos admins** na área de Administração até o usuário definir a própria senha, e um botão **Redefinir senha** que o admin pode acionar a qualquer momento.

## Fora de escopo (decisão explícita de segurança)

Mostrar ao admin a **senha definitiva** (a que o usuário escolhe) está fora de escopo e não será implementado. Motivos:

- É impossível ler de volta: o Supabase guarda a senha com hash (bcrypt, mão única). Exibi-la exigiria armazenar a senha real de cada usuário em texto puro.
- Guardar a senha definitiva em texto puro é um furo grave: permite impersonação por admin (destrói a rastreabilidade/auditoria) e, em caso de vazamento, expõe a senha real de cada funcionário (com risco de reúso em banco/email).

O controle equivalente, sem o risco, é o botão **Redefinir senha**: o admin sempre pode gerar uma nova provisória, então nunca depende de "ver a senha atual".

## Arquitetura

### Modelo de dados

Tabela nova, isolada, para não expor texto puro através da tabela `usuarios` (onde cada usuário lê a própria linha):

```
public.usuario_senha_provisoria
  usuario_id   uuid  PK  references public.usuarios(id) on delete cascade
  senha        text  not null            -- senha provisória em texto puro (só enquanto pendente)
  gerada_em    timestamptz not null default now()
  gerada_por   uuid references public.usuarios(id)   -- admin que gerou
```

- "Existe linha" = usuário ainda não fez o primeiro acesso (acesso pendente). Sem linha = já definiu a própria senha.
- RLS: leitura/escrita **só para admin** (`tem_permissao('administracao.usuarios','ver')` no SELECT; `editar`/`criar` nas mutações). `anon` não recebe nada. Grants explícitos por operação.
- **Sem trigger de auditoria nesta tabela** (não gravar o valor da senha). O evento "gerou/redefiniu senha provisória" é auditado na ação sobre o usuário, sem o valor. Exceção à auditoria universal registrada em `docs/decisoes.md`.
- A flag `senha_temporaria` no `user_metadata` do `auth.users` continua sendo a fonte da verdade para forçar a troca no primeiro acesso (trava já existente em `src/app/(app)/layout.tsx`).

### Fluxo 1 — Cadastrar usuário (`convidarUsuario` → passa a criar direto)

`src/modules/administracao/usuarios/actions.ts`

1. `checarPermissao("criar")`.
2. Gera senha provisória forte (`gerarSenhaTemporaria`, já existe, 16 chars).
3. `admin.auth.admin.createUser({ email, password: provisória, email_confirm: true, user_metadata: { nome, senha_temporaria: true } })`. O trigger `trg_novo_usuario` cria a linha em `public.usuarios`.
4. Insere em `usuario_senha_provisoria` (usuario_id, senha, gerada_por = admin atual) usando o client normal (RLS valida a permissão de quem chama).
5. Se veio `perfilId`, aplica via RPC `aplicar_perfil` (comportamento atual mantido).
6. Retorna a senha provisória para o drawer exibir (componente de exibição já existe).

Remove a dependência de `inviteUserByEmail`. Email de convite fica desativado; reativar exige configurar SMTP + `NEXT_PUBLIC_SITE_URL` (tarefa separada, futura).

### Fluxo 2 — Redefinir senha (novo)

`redefinirSenhaUsuario(usuarioId)` em `actions.ts`:

1. `checarPermissao("editar")`.
2. Gera nova provisória.
3. Lê o `user_metadata` atual e reescreve mesclado: `admin.auth.admin.updateUserById(usuarioId, { password: novaProvisória, user_metadata: { ...atual, senha_temporaria: true } })`. (updateUserById substitui o objeto `user_metadata`, então preservar `nome` etc.)
4. `upsert` em `usuario_senha_provisoria` (nova senha, `gerada_em = now()`, `gerada_por = admin`).
5. Audita o evento (sem o valor).
6. Retorna a nova provisória para exibir.

Permitido para qualquer usuário, inclusive o próprio admin (não gera lockout: apenas força o próprio admin a trocar no próximo acesso). Sem trava adicional além da permissão.

### Fluxo 3 — Definir senha (ajuste no existente)

`definirSenha` em `src/modules/auth/actions.ts`: após `updateUser({ password, data: { senha_temporaria: false } })` com sucesso, **apaga** a linha de `usuario_senha_provisoria` do usuário logado. A senha provisória some da visão do admin no instante em que o usuário define a própria.

### UI (Administração)

- **Lista** (`usuarios-tabela.tsx`): selo "1º acesso pendente" quando existe linha em `usuario_senha_provisoria`.
- **Drawer de detalhe** (`detalhe-usuario-drawer.tsx`): seção "Acesso" com:
  - Status: "Aguardando 1º acesso" (pendente) ou "Ativo".
  - Senha provisória com botão revelar + copiar (só quando existe).
  - Botão "Redefinir senha".
- Queries (`queries.ts`): a leitura do detalhe (e o indicador da lista) passam a trazer a existência/valor da provisória. Protegido por RLS (só admin lê) e a página já é gated por permissão de `ver`.

### Segurança

- RLS admin-only na tabela nova; grants explícitos por operação; `anon` sem nada (regra de ouro nº 1).
- Senha provisória nunca em `console.log` nem em `audit_log`.
- Trafega para o browser do admin só ao abrir o drawer/revelar, sobre HTTPS.
- Migration versionada; rodar advisors (security + performance) depois.

### Testes

- Vitest: gera provisória no cadastro; apaga provisória ao definir senha definitiva; `redefinirSenhaUsuario` exige `editar`; cadastro exige `criar`.
- Playwright (opcional): cadastra → provisória exibida → login com provisória → forçado a `/definir-senha` → define → provisória some do admin e status vira Ativo.

## Resultado esperado

Cadastrou → senha provisória na hora, visível e copiável no drawer. Usuário não logou → continua visível, com selo "1º acesso pendente". Usuário logou e trocou → some, status vira Ativo. Esqueceu depois → admin clica Redefinir e tem nova provisória. Admin nunca fica travado e nunca vê a senha pessoal de ninguém.
