# Senha provisória visível ao admin — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Cadastro de usuário sem depender de email, com senha provisória gerada, visível aos admins até o 1º acesso, e botão redefinir senha a qualquer momento.

**Architecture:** Tabela isolada `usuario_senha_provisoria` guarda a provisória em texto puro, lida só por admin via RLS. O cadastro cria o usuário direto na auth (service role) com a provisória e `senha_temporaria=true`; o layout já força a troca no 1º acesso. Ao definir a própria senha, a linha da provisória é apagada. Redefinir gera nova provisória. A senha definitiva nunca é armazenada nem exibida (impossível/inseguro).

**Tech Stack:** Next.js 15 App Router, Server Actions, Supabase (Postgres 17 + Auth + RLS), supabase-js, React Hook Form + Zod, TanStack Table, Vitest.

## Global Constraints

- Projeto Supabase erp-emt ref: `vsesgvqjgqpapoxhnbqx`. Migration aplicada via MCP `apply_migration` (não pelo dashboard).
- RLS em 100% das tabelas; grants explícitos por operação; `anon` nunca recebe grant (regra de ouro nº 1).
- Permissão tripla: RLS (`tem_permissao(recurso, acao)`) + checagem na Server Action + UI esconde. Recurso: `administracao.usuarios`, ações `ver/criar/editar/excluir`.
- Enforcement de permissão usa `getUsuarioLogado`/`temPermissao`/`exigirPermissao` de `@/lib/permissoes`.
- Sem `any` novo, sem `console.log`. `tsc --noEmit`, lint e build passando.
- Voz pt-BR, sentence case, sem travessão. Botão diz o que faz.
- **Nunca** logar (console/audit_log) o valor de qualquer senha. A tabela nova NÃO tem trigger `fn_audit`.
- Client admin (service role) é `createAdminClient()` de `@/lib/supabase/admin`, só no servidor. Mutações de tabela usam o client normal `createClient()` de `@/lib/supabase/server` (RLS valida quem chama), espelhando o padrão de `aplicar_perfil`.
- iCloud às vezes duplica `.next/*` (arquivos com sufixo ` N.tsx`) e quebra o `tsc`; limpar antes do typecheck: `find .next -name "* [0-9].ts" -o -name "* [0-9].tsx" | xargs rm -f 2>/dev/null || true`.

---

### Task 1: Migration da tabela `usuario_senha_provisoria`

**Files:**
- Create: `supabase/migrations/20260727150001_usuario_senha_provisoria.sql`
- Modify (regenerado): `src/lib/database.types.ts`

**Interfaces:**
- Produces: tabela `public.usuario_senha_provisoria (usuario_id uuid PK, senha text, gerada_em timestamptz, gerada_por uuid)`, lida/escrita só por admin de `administracao.usuarios`; usada por Tasks 3, 4, 5.

- [ ] **Step 1: Escrever a migration**

Criar `supabase/migrations/20260727150001_usuario_senha_provisoria.sql`:

```sql
-- =============================================================
-- Administracao / usuarios: senha provisoria visivel ao admin.
-- Guarda a senha provisoria (texto puro) gerada no cadastro/reset,
-- visivel SO para admin de usuarios (RLS). Removida quando o usuario
-- define a propria senha. SEM trigger de auditoria: o valor da senha
-- nunca vai para audit_log (o evento e auditado na acao sobre o usuario).
-- =============================================================

create table public.usuario_senha_provisoria (
  usuario_id uuid primary key references public.usuarios(id) on delete cascade,
  senha text not null,
  gerada_em timestamptz not null default now(),
  gerada_por uuid references public.usuarios(id)
);

comment on table public.usuario_senha_provisoria is
  'Senha provisoria (texto puro) de acesso pendente. Visivel so para admin de usuarios via RLS. Removida quando o usuario define a propria senha. SEM auditoria de valor.';

alter table public.usuario_senha_provisoria enable row level security;

-- Leitura: so quem administra usuarios
create policy usuario_senha_provisoria_select on public.usuario_senha_provisoria
  for select to authenticated
  using ((select public.tem_permissao('administracao.usuarios', 'ver')));

-- Insercao: cadastro (criar) ou reset (editar)
create policy usuario_senha_provisoria_insert on public.usuario_senha_provisoria
  for insert to authenticated
  with check (
    (select public.tem_permissao('administracao.usuarios', 'criar'))
    or (select public.tem_permissao('administracao.usuarios', 'editar'))
  );

-- Atualizacao (upsert do reset): editar
create policy usuario_senha_provisoria_update on public.usuario_senha_provisoria
  for update to authenticated
  using ((select public.tem_permissao('administracao.usuarios', 'editar')))
  with check ((select public.tem_permissao('administracao.usuarios', 'editar')));

-- Remocao: o proprio usuario limpa a sua ao definir a senha; admin tambem pode
create policy usuario_senha_provisoria_delete on public.usuario_senha_provisoria
  for delete to authenticated
  using (
    usuario_id = (select auth.uid())
    or (select public.tem_permissao('administracao.usuarios', 'editar'))
  );

grant select, insert, update, delete on table public.usuario_senha_provisoria to authenticated;
```

- [ ] **Step 2: Aplicar via MCP**

Aplicar o MESMO SQL no projeto `vsesgvqjgqpapoxhnbqx` com `mcp__plugin_supabase_supabase__apply_migration`, name `usuario_senha_provisoria`.
Expected: sucesso, sem erro.

- [ ] **Step 3: Rodar advisors de segurança**

`mcp__plugin_supabase_supabase__get_advisors` type `security`.
Expected: nenhum advisor novo apontando `usuario_senha_provisoria` (RLS habilitada, sem grant pra `anon`). Se aparecer algo, corrigir antes de seguir.

- [ ] **Step 4: Regerar os tipos do banco**

`mcp__plugin_supabase_supabase__generate_typescript_types` e sobrescrever `src/lib/database.types.ts` com o resultado. Confirmar que passou a existir a chave `usuario_senha_provisoria` no arquivo:

Run: `grep -c "usuario_senha_provisoria" src/lib/database.types.ts`
Expected: > 0

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/20260727150001_usuario_senha_provisoria.sql src/lib/database.types.ts
git commit -m "feat(admin): tabela usuario_senha_provisoria (RLS admin-only)"
```

---

### Task 2: Util `gerarSenhaProvisoria` (pura, testável)

Extrair o gerador para um módulo puro (não pode ficar num arquivo `"use server"`, que só exporta funções async).

**Files:**
- Create: `src/modules/administracao/usuarios/senha-provisoria.ts`
- Test: `src/modules/administracao/usuarios/senha-provisoria.test.ts`

**Interfaces:**
- Produces: `gerarSenhaProvisoria(): string` — 16 caracteres do alfabeto `ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789!@#$%`. Consumido por Task 3.

- [ ] **Step 1: Escrever o teste que falha**

Criar `src/modules/administracao/usuarios/senha-provisoria.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { gerarSenhaProvisoria } from "./senha-provisoria";

const ALFABETO = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789!@#$%";

describe("gerarSenhaProvisoria", () => {
  it("gera 16 caracteres", () => {
    expect(gerarSenhaProvisoria()).toHaveLength(16);
  });

  it("usa só o alfabeto permitido", () => {
    const senha = gerarSenhaProvisoria();
    for (const c of senha) {
      expect(ALFABETO).toContain(c);
    }
  });

  it("não repete entre chamadas", () => {
    const a = gerarSenhaProvisoria();
    const b = gerarSenhaProvisoria();
    expect(a).not.toBe(b);
  });
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `npx vitest run src/modules/administracao/usuarios/senha-provisoria.test.ts`
Expected: FAIL (`Cannot find module './senha-provisoria'`).

- [ ] **Step 3: Implementar o módulo**

Criar `src/modules/administracao/usuarios/senha-provisoria.ts`:

```ts
/** Senha provisória forte: 16 caracteres de classes misturadas. */
export function gerarSenhaProvisoria(): string {
  const alfabeto =
    "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789!@#$%";
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => alfabeto[b % alfabeto.length]).join("");
}
```

- [ ] **Step 4: Rodar e ver passar**

Run: `npx vitest run src/modules/administracao/usuarios/senha-provisoria.test.ts`
Expected: PASS (3 testes).

- [ ] **Step 5: Commit**

```bash
git add src/modules/administracao/usuarios/senha-provisoria.ts src/modules/administracao/usuarios/senha-provisoria.test.ts
git commit -m "feat(admin): gerador de senha provisória (util puro + teste)"
```

---

### Task 3: Actions — cadastro sem email, obter e redefinir senha

**Files:**
- Modify: `src/modules/administracao/usuarios/actions.ts`

**Interfaces:**
- Consumes: `gerarSenhaProvisoria` (Task 2); tabela `usuario_senha_provisoria` (Task 1).
- Produces:
  - `convidarUsuario(dados): Promise<ResultadoConvite>` onde `ResultadoConvite = { ok: true; senhaProvisoria: string; aviso?: string } | { erro: string }`.
  - `redefinirSenhaUsuario(usuarioId: string): Promise<ResultadoConvite>`.
  - `obterSenhaProvisoria(usuarioId: string): Promise<{ ok: true; senha: string | null } | { erro: string }>`.
  Consumidos pelas Tasks 6 e 7.

- [ ] **Step 1: Trocar imports e o tipo de retorno**

No topo, o import de `gerarSenhaProvisoria` e o tipo. Substituir o bloco `ResultadoConvite` (linhas 29-31) por:

```ts
export type ResultadoConvite =
  | { ok: true; senhaProvisoria: string; aviso?: string }
  | { erro: string };

export type ResultadoSenha =
  | { ok: true; senha: string | null }
  | { erro: string };
```

Adicionar o import (junto aos outros imports do módulo):

```ts
import { gerarSenhaProvisoria } from "@/modules/administracao/usuarios/senha-provisoria";
```

- [ ] **Step 2: Remover `siteUrl` e `gerarSenhaTemporaria` locais**

Apagar a função `siteUrl()` (linhas 45-57) e a função local `gerarSenhaTemporaria()` (linhas 59-66) — a primeira fica sem uso (não há mais convite por email) e a segunda foi para o módulo puro da Task 2.

- [ ] **Step 3: Reescrever `convidarUsuario`**

Substituir toda a função `convidarUsuario` (linhas 68-150) por:

```ts
/**
 * Cadastra um usuário sem depender de email: cria na auth com uma senha
 * provisória gerada e a flag senha_temporaria (força a troca no 1º acesso),
 * guarda a provisória para o admin repassar/reabrir, e aplica o perfil.
 */
export async function convidarUsuario(
  dados: ConvidarUsuarioInput,
): Promise<ResultadoConvite> {
  const editor = await getUsuarioLogado();
  if (!editor || !temPermissao(editor, RECURSO, "criar")) {
    return { erro: "Sem permissão para cadastrar usuários" };
  }

  const validado = convidarUsuarioSchema.safeParse(dados);
  if (!validado.success) {
    return { erro: validado.error.issues[0]?.message ?? "Dados inválidos" };
  }

  const { nome, email, perfilId } = validado.data;
  const admin = createAdminClient();

  const senhaProvisoria = gerarSenhaProvisoria();
  const criado = await admin.auth.admin.createUser({
    email,
    password: senhaProvisoria,
    email_confirm: true,
    user_metadata: { nome, senha_temporaria: true },
  });

  if (criado.error) {
    if (criado.error.code === "email_exists") {
      return { erro: "Já existe um usuário com este email" };
    }
    return erroAcao(
      "administracao.usuarios.cadastrar",
      criado.error,
      "Não foi possível cadastrar o usuário. Tente novamente",
    );
  }

  const usuarioId = criado.data.user?.id;
  if (!usuarioId) {
    return { erro: "Não foi possível cadastrar o usuário. Tente novamente" };
  }

  // Client normal: o RLS valida a permissão de quem chama.
  const supabase = await createClient();

  const { error: erroSenha } = await supabase
    .from("usuario_senha_provisoria")
    .insert({ usuario_id: usuarioId, senha: senhaProvisoria, gerada_por: editor.id });
  if (erroSenha) {
    return erroAcao(
      "administracao.usuarios.cadastrar",
      erroSenha,
      "Usuário criado, mas a senha provisória não foi salva. Redefina a senha do usuário",
    );
  }

  let aviso: string | undefined;
  if (perfilId) {
    const { error } = await supabase.rpc("aplicar_perfil", {
      p_usuario_id: usuarioId,
      p_perfil_id: perfilId,
    });
    if (error) {
      logErroServidor("administracao.usuarios.cadastrar", error);
      aviso =
        "Usuário criado, mas o perfil não foi aplicado. Abra o usuário e aplique de novo";
    }
  }

  revalidatePath(ROTA);

  const resultado: ResultadoConvite = { ok: true, senhaProvisoria };
  if (aviso) resultado.aviso = aviso;
  return resultado;
}
```

- [ ] **Step 4: Adicionar `obterSenhaProvisoria` e `redefinirSenhaUsuario`**

Logo após `convidarUsuario`, adicionar:

```ts
/** Lê a senha provisória de um usuário (só admin). Null se já não há. */
export async function obterSenhaProvisoria(
  usuarioId: string,
): Promise<ResultadoSenha> {
  if (!(await checarPermissao("ver"))) {
    return { erro: "Sem permissão para ver a senha provisória" };
  }
  const idValido = uuidSchema.safeParse(usuarioId);
  if (!idValido.success) return { erro: "Usuário inválido" };

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("usuario_senha_provisoria")
    .select("senha")
    .eq("usuario_id", idValido.data)
    .maybeSingle();

  if (error) {
    return erroAcao(
      "administracao.usuarios.obter-senha",
      error,
      "Não foi possível carregar a senha provisória",
    );
  }
  return { ok: true, senha: data?.senha ?? null };
}

/**
 * Redefine a senha do usuário para uma nova provisória (gerada), força a
 * troca no próximo acesso e regrava a provisória para o admin repassar.
 */
export async function redefinirSenhaUsuario(
  usuarioId: string,
): Promise<ResultadoConvite> {
  const editor = await getUsuarioLogado();
  if (!editor || !temPermissao(editor, RECURSO, "editar")) {
    return { erro: "Sem permissão para redefinir senhas" };
  }
  const idValido = uuidSchema.safeParse(usuarioId);
  if (!idValido.success) return { erro: "Usuário inválido" };

  const admin = createAdminClient();

  // Preserva o metadata atual (nome etc.) e religa a flag de troca.
  const { data: atual, error: erroLeitura } =
    await admin.auth.admin.getUserById(idValido.data);
  if (erroLeitura || !atual.user) {
    return erroAcao(
      "administracao.usuarios.redefinir-senha",
      erroLeitura ?? new Error("usuário não encontrado"),
      "Não foi possível redefinir a senha. Tente novamente",
    );
  }

  const senhaProvisoria = gerarSenhaProvisoria();
  const { error: erroUpdate } = await admin.auth.admin.updateUserById(
    idValido.data,
    {
      password: senhaProvisoria,
      user_metadata: { ...atual.user.user_metadata, senha_temporaria: true },
    },
  );
  if (erroUpdate) {
    return erroAcao(
      "administracao.usuarios.redefinir-senha",
      erroUpdate,
      "Não foi possível redefinir a senha. Tente novamente",
    );
  }

  const supabase = await createClient();
  const { error: erroSenha } = await supabase
    .from("usuario_senha_provisoria")
    .upsert(
      {
        usuario_id: idValido.data,
        senha: senhaProvisoria,
        gerada_em: new Date().toISOString(),
        gerada_por: editor.id,
      },
      { onConflict: "usuario_id" },
    );
  if (erroSenha) {
    return erroAcao(
      "administracao.usuarios.redefinir-senha",
      erroSenha,
      "Senha redefinida, mas não foi salva para exibição. Tente redefinir de novo",
    );
  }

  revalidatePath(ROTA);
  return { ok: true, senhaProvisoria };
}
```

- [ ] **Step 4b: Ajustar a doc do `checarPermissao`**

`convidarUsuario` deixou de usar `checarPermissao` (passou a usar `getUsuarioLogado`/`temPermissao` para pegar `editor.id`). Confirmar que `checarPermissao` continua usado (por `obterSenhaProvisoria`, `aplicarPerfilUsuario`, `salvarMatrizUsuario`) — está, não remover.

- [ ] **Step 5: Typecheck**

Run: `find .next -name "* [0-9].ts" -o -name "* [0-9].tsx" | xargs rm -f 2>/dev/null; npx tsc --noEmit`
Expected: sem erros no arquivo `actions.ts` (as chamadas `.from("usuario_senha_provisoria")` só tipam com os types regerados na Task 1).

- [ ] **Step 6: Commit**

```bash
git add src/modules/administracao/usuarios/actions.ts
git commit -m "feat(admin): cadastro sem email + obter/redefinir senha provisória"
```

---

### Task 4: Limpar a provisória quando o usuário define a própria senha

**Files:**
- Modify: `src/modules/auth/actions.ts:61-94` (função `definirSenha`)

**Interfaces:**
- Consumes: tabela `usuario_senha_provisoria` (Task 1), policy de delete do próprio (`usuario_id = auth.uid()`).

- [ ] **Step 1: Importar `logErroServidor`**

Trocar o import de erros (linha 5) por:

```ts
import { erroAcao, logErroServidor } from "@/lib/erros";
```

- [ ] **Step 2: Apagar a provisória após o sucesso**

Dentro de `definirSenha`, logo depois do bloco que trata `error` do `updateUser` (ou seja, após confirmar sucesso) e ANTES do `revalidatePath("/", "layout")`, inserir:

```ts
  // Acesso deixou de ser pendente: some a provisória da visão do admin.
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (user) {
    const { error: erroLimpeza } = await supabase
      .from("usuario_senha_provisoria")
      .delete()
      .eq("usuario_id", user.id);
    if (erroLimpeza) {
      logErroServidor("auth.definir-senha.limpar-provisoria", erroLimpeza);
    }
  }
```

- [ ] **Step 3: Typecheck**

Run: `find .next -name "* [0-9].ts" -o -name "* [0-9].tsx" | xargs rm -f 2>/dev/null; npx tsc --noEmit`
Expected: sem erros.

- [ ] **Step 4: Commit**

```bash
git add src/modules/auth/actions.ts
git commit -m "feat(auth): apaga senha provisória ao definir a senha definitiva"
```

---

### Task 5: Query — expor `acessoPendente` na listagem

**Files:**
- Modify: `src/modules/administracao/usuarios/queries.ts`

**Interfaces:**
- Consumes: tabela `usuario_senha_provisoria` (Task 1).
- Produces: `UsuarioLista` ganha `acessoPendente: boolean`. Consumido pelas Tasks 6/7.

- [ ] **Step 1: Adicionar o campo à interface**

Na interface `UsuarioLista` (linhas 6-14), adicionar após `criadoEm`:

```ts
  acessoPendente: boolean;
```

- [ ] **Step 2: Embutir a existência da provisória no select**

Em `listarUsuarios`, trocar o `.select(...)` (linha 34) por:

```ts
    .select(
      "id, nome, email, ativo, perfil_id, created_at, perfis(nome), usuario_senha_provisoria(usuario_id)",
    )
```

E o `.map(...)` de retorno (linhas 41-49) por:

```ts
  return (data ?? []).map((usuario) => {
    const provisoria = usuario.usuario_senha_provisoria;
    return {
      id: usuario.id,
      nome: usuario.nome,
      email: usuario.email,
      ativo: usuario.ativo,
      perfilId: usuario.perfil_id,
      perfilNome: usuario.perfis?.nome ?? null,
      criadoEm: usuario.created_at,
      acessoPendente: Array.isArray(provisoria)
        ? provisoria.length > 0
        : provisoria != null,
    };
  });
```

- [ ] **Step 3: Typecheck**

Run: `find .next -name "* [0-9].ts" -o -name "* [0-9].tsx" | xargs rm -f 2>/dev/null; npx tsc --noEmit`
Expected: sem erros (o embed `usuario_senha_provisoria(usuario_id)` tipa com os types da Task 1).

- [ ] **Step 4: Commit**

```bash
git add src/modules/administracao/usuarios/queries.ts
git commit -m "feat(admin): listagem de usuários expõe acesso pendente"
```

---

### Task 6: Drawer de cadastro — senha provisória sempre visível

**Files:**
- Modify: `src/modules/administracao/usuarios/components/convidar-usuario-drawer.tsx`

**Interfaces:**
- Consumes: `convidarUsuario` → `{ ok: true; senhaProvisoria; aviso? }` (Task 3).

- [ ] **Step 1: Ajustar estado e submit para senha sempre presente**

Trocar o estado `senhaTemporaria` por `senhaProvisoria` e a lógica de submit. Substituir o bloco de estado (linhas 41-43) por:

```ts
  const [senhaProvisoria, setSenhaProvisoria] = React.useState<string | null>(
    null,
  );
```

Substituir `aoMudarAberto` (linhas 52-60) por (comentário atualizado + reset do novo estado):

```ts
  function aoMudarAberto(novoAberto: boolean) {
    setAberto(novoAberto);
    if (!novoAberto) {
      setSenhaProvisoria(null);
      setPerfilId(SEM_PERFIL);
      form.reset();
    }
  }
```

Substituir `aoEnviar` (linhas 62-85) por:

```ts
  async function aoEnviar(dados: FormInput) {
    const resultado = await convidarUsuario({
      nome: dados.nome,
      email: dados.email,
      ...(perfilId !== SEM_PERFIL ? { perfilId } : {}),
    });

    if ("erro" in resultado) {
      toast.error(resultado.erro);
      return;
    }

    if (resultado.aviso) {
      toast.warning(resultado.aviso);
    }

    setSenhaProvisoria(resultado.senhaProvisoria);
    toast.success("Usuário cadastrado");
  }
```

Substituir `copiarSenha` (linhas 87-91) por:

```ts
  async function copiarSenha() {
    if (!senhaProvisoria) return;
    await navigator.clipboard.writeText(senhaProvisoria);
    toast.success("Senha copiada");
  }
```

- [ ] **Step 2: Atualizar textos e o corpo do drawer**

Trocar o rótulo do botão de abrir (linhas 95-98): manter o ícone, texto `Cadastrar usuário`. Trocar `titulo`/`descricao` do `FormDrawer` (linhas 103-104) por:

```tsx
        titulo="Cadastrar usuário"
        descricao="O sistema gera uma senha provisória para você repassar. O usuário troca no primeiro acesso"
```

No `rodape` (linhas 105-132), trocar as condições de `senhaTemporaria` por `senhaProvisoria`, e o botão de envio de `Enviar convite`/`Enviando...` para `Cadastrar usuário`/`Cadastrando...`:

```tsx
        rodape={
          senhaProvisoria ? (
            <Button type="button" onClick={() => aoMudarAberto(false)}>
              Concluir
            </Button>
          ) : (
            <>
              <Button
                type="button"
                variant="outline"
                onClick={() => aoMudarAberto(false)}
                disabled={enviando}
              >
                Cancelar
              </Button>
              <Button type="submit" form={ID_FORM} disabled={enviando}>
                {enviando ? (
                  <>
                    <LoaderCircle className="animate-spin" />
                    Cadastrando...
                  </>
                ) : (
                  "Cadastrar usuário"
                )}
              </Button>
            </>
          )
        }
```

No corpo, trocar `senhaTemporaria ? (` (linha 134) por `senhaProvisoria ? (` e o conteúdo do Alert (linhas 135-158) por:

```tsx
          <Alert>
            <TriangleAlert />
            <AlertTitle>Senha provisória gerada</AlertTitle>
            <AlertDescription className="flex flex-col gap-3">
              <span>
                Copie a senha abaixo e repasse ao usuário. Ela fica visível na
                ficha do usuário (aba Administração) até ele definir a própria
                senha no primeiro acesso.
              </span>
              <span className="flex items-center gap-2">
                <code className="codigo-doc rounded-md border border-border bg-surface px-2 py-1">
                  {senhaProvisoria}
                </code>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={copiarSenha}
                >
                  <Copy />
                  Copiar senha
                </Button>
              </span>
            </AlertDescription>
          </Alert>
```

Atualizar o comentário do componente (linhas 33-37) para refletir que a senha provisória é sempre gerada (não é mais fallback de email).

- [ ] **Step 3: Typecheck + lint**

Run: `find .next -name "* [0-9].ts" -o -name "* [0-9].tsx" | xargs rm -f 2>/dev/null; npx tsc --noEmit && npx eslint src/modules/administracao/usuarios/components/convidar-usuario-drawer.tsx`
Expected: sem erros. (Não deve sobrar referência a `senhaTemporaria`.)

- [ ] **Step 4: Commit**

```bash
git add src/modules/administracao/usuarios/components/convidar-usuario-drawer.tsx
git commit -m "feat(admin): cadastro mostra a senha provisória gerada"
```

---

### Task 7: Lista com selo de pendência + seção Acesso no detalhe

**Files:**
- Modify: `src/modules/administracao/usuarios/components/usuarios-tabela.tsx`
- Modify: `src/modules/administracao/usuarios/components/detalhe-usuario-drawer.tsx`

**Interfaces:**
- Consumes: `UsuarioLista.acessoPendente` (Task 5); `obterSenhaProvisoria`, `redefinirSenhaUsuario` (Task 3); `ConfirmDialog`, `StatusBadge` de `@/components/canonicos`.

- [ ] **Step 1: Selo "1º acesso pendente" na coluna Status**

Em `usuarios-tabela.tsx`, substituir a coluna `ativo` (linhas 35-44) por:

```tsx
  {
    accessorKey: "ativo",
    header: "Status",
    cell: ({ row }) => (
      <div className="flex flex-wrap items-center gap-1.5">
        {row.original.ativo ? (
          <StatusBadge status="aprovado" rotulo="Ativo" />
        ) : (
          <StatusBadge status="rascunho" rotulo="Inativo" />
        )}
        {row.original.acessoPendente ? (
          <StatusBadge status="pendente_aprovacao" rotulo="1º acesso pendente" />
        ) : null}
      </div>
    ),
  },
```

- [ ] **Step 2: Seção Acesso no detalhe — imports e estado**

Em `detalhe-usuario-drawer.tsx`, adicionar aos imports de ícones (linha 6): `Copy`, `KeyRound`. Adicionar aos imports de canônicos (linhas 9-16): `ConfirmDialog`. Adicionar aos imports de actions (linhas 20-23):

```ts
import {
  aplicarPerfilUsuario,
  editarUsuario,
  obterSenhaProvisoria,
  redefinirSenhaUsuario,
} from "@/modules/administracao/usuarios/actions";
```

Adicionar estado (após `versaoMatriz`, linha 60):

```ts
  const [senhaRevelada, setSenhaRevelada] = React.useState<string | null>(null);
  const [carregandoSenha, setCarregandoSenha] = React.useState(false);
  const [confirmarReset, setConfirmarReset] = React.useState(false);
```

- [ ] **Step 3: Handlers de revelar, copiar e redefinir**

Adicionar dentro do componente (após `aplicarPerfil`, antes do `if (!usuario) return null;`):

```ts
  async function revelarSenha() {
    if (!usuario) return;
    setCarregandoSenha(true);
    const resultado = await obterSenhaProvisoria(usuario.id);
    setCarregandoSenha(false);
    if ("erro" in resultado) {
      toast.error(resultado.erro);
      return;
    }
    if (!resultado.senha) {
      toast.info("Este usuário já definiu a própria senha");
      return;
    }
    setSenhaRevelada(resultado.senha);
  }

  async function copiarSenha() {
    if (!senhaRevelada) return;
    await navigator.clipboard.writeText(senhaRevelada);
    toast.success("Senha copiada");
  }

  async function redefinirSenha() {
    if (!usuario) return;
    const resultado = await redefinirSenhaUsuario(usuario.id);
    if ("erro" in resultado) {
      toast.error(resultado.erro);
      return;
    }
    setSenhaRevelada(resultado.senhaProvisoria);
    toast.success("Senha redefinida. Copie a nova senha provisória");
  }
```

- [ ] **Step 4: Bloco Acesso na UI**

No cabeçalho de status (linhas 104-115), adicionar o selo de pendência. Trocar aquele `div` por:

```tsx
        <div className="flex flex-wrap items-center gap-2">
          {usuario.ativo ? (
            <StatusBadge status="aprovado" rotulo="Ativo" />
          ) : (
            <StatusBadge status="rascunho" rotulo="Inativo" />
          )}
          {usuario.acessoPendente ? (
            <StatusBadge status="pendente_aprovacao" rotulo="1º acesso pendente" />
          ) : null}
          <span className="text-detalhe text-muted-foreground">
            {usuario.perfilNome
              ? `Perfil: ${usuario.perfilNome}`
              : "Sem perfil aplicado"}
          </span>
        </div>
```

Dentro do bloco `podeEditar ? (...)`, logo após o `<Separator />` que fecha a aplicação de perfil (linha 197), inserir a seção Acesso:

```tsx
            <div className="flex flex-col gap-2">
              <p className="text-corpo font-medium">Acesso</p>
              <p className="text-detalhe text-muted-foreground">
                {usuario.acessoPendente
                  ? "Aguardando o 1º acesso. A senha provisória abaixo vale até o usuário definir a própria."
                  : "O usuário já definiu a própria senha. Redefina para gerar uma nova senha provisória."}
              </p>

              {senhaRevelada ? (
                <span className="flex items-center gap-2">
                  <code className="codigo-doc rounded-md border border-border bg-surface px-2 py-1">
                    {senhaRevelada}
                  </code>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={copiarSenha}
                  >
                    <Copy />
                    Copiar
                  </Button>
                </span>
              ) : null}

              <div className="flex flex-wrap items-center gap-2">
                {usuario.acessoPendente && !senhaRevelada ? (
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={revelarSenha}
                    disabled={carregandoSenha}
                  >
                    {carregandoSenha ? (
                      <>
                        <LoaderCircle className="animate-spin" />
                        Carregando...
                      </>
                    ) : (
                      <>
                        <KeyRound />
                        Revelar senha provisória
                      </>
                    )}
                  </Button>
                ) : null}
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => setConfirmarReset(true)}
                >
                  <KeyRound />
                  Redefinir senha
                </Button>
              </div>
            </div>

            <Separator />
```

Antes do fechamento do `FormDrawer` (depois do bloco da matriz, antes de `</FormDrawer>`), adicionar o diálogo de confirmação:

```tsx
      <ConfirmDialog
        aberto={confirmarReset}
        onAbertoChange={setConfirmarReset}
        titulo="Redefinir a senha deste usuário?"
        descricao="Uma nova senha provisória será gerada. A senha atual do usuário deixa de valer e ele terá que definir uma nova no próximo acesso."
        textoConfirmar="Redefinir senha"
        onConfirmar={redefinirSenha}
      />
```

- [ ] **Step 5: Typecheck + lint + build**

Run:
```
find .next -name "* [0-9].ts" -o -name "* [0-9].tsx" | xargs rm -f 2>/dev/null
npx tsc --noEmit && npx eslint src/modules/administracao/usuarios/components/ && npm run build
```
Expected: tudo passando, sem `any` novo, sem `console.log`.

- [ ] **Step 6: Commit**

```bash
git add src/modules/administracao/usuarios/components/usuarios-tabela.tsx src/modules/administracao/usuarios/components/detalhe-usuario-drawer.tsx
git commit -m "feat(admin): selo de 1º acesso + revelar/redefinir senha no detalhe"
```

---

### Task 8: Decisão registrada + verificação fim-a-fim

**Files:**
- Modify: `docs/decisoes.md`

- [ ] **Step 1: Registrar a decisão**

Acrescentar ao final de `docs/decisoes.md`:

```markdown

**Onboarding por senha provisória (sem email).** O cadastro de usuário não depende mais de SMTP: o admin cria o usuário e o sistema gera uma senha provisória, guardada em `usuario_senha_provisoria` (texto puro) e visível SÓ para admin de `administracao.usuarios` via RLS. A flag `senha_temporaria` no metadata força a troca no 1º acesso (trava no layout do app); ao definir a própria senha, a linha da provisória é apagada. O admin pode redefinir a senha de qualquer usuário a qualquer momento (gera nova provisória). A senha DEFINITIVA nunca é armazenada nem exibida: é impossível (hash) e inseguro (impersonação por admin, vazamento expõe a senha real, reúso). **Exceção à auditoria universal:** `usuario_senha_provisoria` não tem trigger `fn_audit` para nunca gravar o valor da senha em `audit_log`; o evento de gerar/redefinir é auditado na ação sobre o usuário, sem o valor.
```

- [ ] **Step 2: Rodar advisors de performance**

`mcp__plugin_supabase_supabase__get_advisors` type `performance`.
Expected: nenhum apontamento novo relevante à tabela nova.

- [ ] **Step 3: Verificação manual (preview Vercel ou local)**

Runbook, marcar cada um:
- [ ] Cadastrar um usuário de teste em Administração → aparece a senha provisória com botão copiar.
- [ ] Na lista, esse usuário mostra o selo "1º acesso pendente".
- [ ] Abrir o detalhe → seção Acesso → "Revelar senha provisória" mostra a mesma senha; "Copiar" funciona.
- [ ] Fazer login com email + senha provisória → o app redireciona para `/definir-senha` e não deixa passar antes de trocar.
- [ ] Definir a senha definitiva → entra no app.
- [ ] Voltar como admin: o selo "1º acesso pendente" sumiu; "Revelar" informa que o usuário já definiu a própria senha.
- [ ] Clicar "Redefinir senha" (confirmando no diálogo) → nova provisória aparece; o selo "1º acesso pendente" volta.
- [ ] Logar como um usuário SEM permissão de `administracao.usuarios` e confirmar que ele não enxerga a tela nem consegue ler `usuario_senha_provisoria` (RLS).

- [ ] **Step 4: Commit**

```bash
git add docs/decisoes.md
git commit -m "docs(admin): decisão do onboarding por senha provisória"
```

---

## Notas de execução

- Ordem obrigatória: Task 1 (migration + regen types) antes de 3/4/5, senão o `tsc` não conhece a tabela.
- Nada de `inviteUserByEmail` no fluxo principal. Reativar email um dia = configurar SMTP + `NEXT_PUBLIC_SITE_URL` (fora deste plano).
- Ao final, seguir `superpowers:finishing-a-development-branch` para decidir merge/PR em `main`.
