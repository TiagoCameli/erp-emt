# Provisão mensal de 13º e férias (Bloco 8b) — Plano

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A folha passa a provisionar 13º e férias como custo do mês (principal mais os encargos que vão incidir quando forem pagos), sem gerar conta a pagar.

**Architecture:** Tabela `folha_provisoes` espelhando `folha_encargos` (config editável, sem seed de valor), snapshot por item em `folha_item_provisoes`, e a `fn_gerar_folha` somando as provisões ao `custo_total`. A identidade de conferência ganha um quarto termo. Nenhum lançamento é criado: provisão é custo sem caixa.

**Tech Stack:** Next.js 15 App Router, TypeScript strict, Supabase Postgres 17 (migrations via MCP `apply_migration`), Zod, React Hook Form, Vitest, canônicos EMT.

**Spec:** `docs/superpowers/specs/2026-08-13-rh-provisao-13o-ferias-design.md` (commit c496078, aprovada pelo Tiago).

## Global Constraints

- **Projeto Supabase vivo:** `vsesgvqjgqpapoxhnbqx`. Migration **só** por MCP `apply_migration`, **e também** salva como arquivo em `supabase/migrations/<versao>_<nome>.sql` com o mesmo SQL executável. A conferência é por **SQL normalizado** (comentário removido, espaço colapsado, `btrim`, `md5`), receita em `docs/decisoes.md` — o padrão do repo mantém um cabeçalho de aviso. **`supabase db push` é PROIBIDO** (destrutivo aqui).
- **O ledger de migrations não é fonte de verdade sobre o schema.** Ler a definição real (`pg_get_functiondef`, `information_schema`, `pg_policies`) antes de alterar função, policy ou grant.
- **Existe outra sessão do Claude ativa neste mesmo banco**, mexendo em Financeiro, auth e UI. **Antes de alterar qualquer função compartilhada, confira o md5** e **pare e reporte** se divergir do valor deste plano: a colisão seria no banco, não no git, onde o merge avisaria.
- **`fn_gerar_folha` está em `md5(prosrc) = 29c33b2d43a50af321f0ee2f7b7e5728` (14363 chars)** e **`fn_aprovar_folha` em `a1261a1ccbff886980f0991da47a2446`**.
- **Desconfie do SQL deste plano.** O Postgres **cria** função com SQL embutido inválido sem reclamar: nesta base um `sum(valor)` sobre subconsulta cuja coluna era `valor_cc` quase quebrou a primeira aprovação de folha em produção. **Rode cada consulta nova isolada antes de embutir.**
- **Teste o caso PARCIAL, não o extremo.** Nesta base o teste do estado extremo passou e escondeu o perigoso duas vezes. Aqui: **uma** provisão cadastrada entre duas (não zero nem todas), e encargo cadastrado com **outro** desativado.
- **Tabela nova sem DML para `authenticated`** quando a escrita é só por definer (modelo: `folha_item_encargos`, `folha_guias`, `rh_adiantamento_parcelas`). `anon` nunca recebe nada. Migration que mexe em privilégio termina com trava `do $$` fail-closed.
- **`grant update` em tabela existente é por coluna, nunca a tabela inteira.**
- **Nenhum valor fiscal ou percentual semeado.** Config vazia tem que produzir provisão zero.
- **Dinheiro é `NUMERIC(14,2)`.** Float proibido. Exibição via `MoneyText` com `tabular-nums`.
- **Permissão tripla:** RLS no banco (`tem_permissao`), checagem na Server Action, UI esconde o que não pode. Recurso: `rh.encargos` (nenhum recurso novo).
- **Componentes canônicos primeiro.** Todo select é `Combobox` com busca, nunca o `Select` do shadcn. `InputNumerico` **não é exportado** (só `InputMoeda`, 2 casas, e `InputQuantidade`, 3 casas): para inteiro simples use `<Input type="number">`.
- **Toda prova em transação que termina em `rollback`.** Produção tem zero colaborador, folha, adiantamento e parcela e tem que continuar assim. **Não use contagem de obras, centros de custo ou fornecedores como asserção** — a outra sessão mexe nesses cadastros; verifique "estável antes e depois".
- **`npx eslint src`, não `npm run lint`**: existe worktree de outra sessão com `.next` dentro que gera milhares de erros falsos. **Não mexa na config nem no worktree.**
- **`git add` explícito por arquivo, nunca `git add -A`**, pelo mesmo motivo.
- Antes do `tsc`: `find src supabase .next -name "* [0-9].*" -delete` (iCloud duplica arquivos).
- **Portão verde:** `npx tsc --noEmit`, `npx eslint src`, `npx vitest run`, `npm run build`. **Baseline: 1138 testes.** Regenere `src/lib/database.types.ts` (MCP `generate_typescript_types`) depois de migration e antes do `tsc`.
- **A varredura `fn_verificar_diagnosticos_gravados()` tem que voltar zero falha** ao fim de qualquer task que toque schema. Ela existe porque uma consulta gravada em comentário ficou quebrada em silêncio nesta base.
- **Commits em português**, imperativo, escopo entre parênteses, terminando com `Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>`. **Nunca use travessão (em-dash).**
- **Incrementos pequenos:** aplique, prove e commite cada peça. A API caiu duas vezes nesta frente e quem acumulou trabalho não commitado perdeu o ciclo inteiro.
- **Branch `feat-rh-provisao-13o-ferias`, sem worktree.** Merge só na última task.

## Arquivos: responsabilidade de cada um

**Banco:**
- `folha_provisoes` + `folha_item_provisoes` + colunas de total + seed de permissão (Task 1)
- `fn_gerar_folha` provisionando (Task 2)
- `obj_description` da `fn_aprovar_folha` e a consulta de diagnóstico (Task 3)

**TypeScript:**
- `src/modules/rh/provisoes/{schemas,queries,actions}.ts` (novo) — cadastro, espelhando `rh/encargos` (Task 1)
- `src/modules/rh/provisoes/components/*` (novo) — form e tabela (Task 1)
- `src/app/(app)/rh/encargos/page.tsx` — seção nova na aba existente (Task 1)
- `src/modules/rh/folha/queries.ts` — `provisoesDetalhe` no item (Task 4)
- `src/modules/rh/folha/calculo.ts` — `resumoPorProvisao` pura (Task 4)
- `src/modules/rh/folha/components/folha-detalhe.tsx` — quebra e resumo (Task 4)
- `src/modules/rh/folha/actions.ts` — coluna na planilha (Task 4)

---

### Task 1: Cadastro de provisões (config editável, sem dinheiro)

**Modelo sugerido:** sonnet — espelha `rh/encargos` ponta a ponta, sem cálculo.

**Files:**
- Migration nova: `folha_provisoes`
- Create: `src/modules/rh/percentual.ts` (schema de percentual compartilhado, extraído de encargos)
- Create: `src/modules/rh/provisoes/schemas.ts`, `queries.ts`, `actions.ts`, `components/provisao-form-drawer.tsx`, `components/provisoes-tabela.tsx`, `components/provisoes-secao.tsx`
- Create: `src/modules/rh/provisoes/schemas.test.ts`
- Modify: `src/modules/rh/encargos/schemas.ts` (passa a importar o percentual extraído)
- Modify: `src/app/(app)/rh/encargos/page.tsx`

**Interfaces:**
- Consumes: `fn_excluir_cadastro`, `fn_recurso_do_cadastro` (dispatcher de soft delete), `tem_permissao`.
- Produces: tabela `folha_provisoes` (`id`, `nome`, `percentual`, `ativo`, `created_at`, `updated_at`, `created_by`); tabela `folha_item_provisoes` (`id`, `folha_item_id`, `nome`, `percentual`, `valor_principal`, `valor_encargos`); colunas `folha_itens.provisoes` e `folhas.valor_provisoes`; `percentualSchema` exportado de `src/modules/rh/percentual.ts`; `provisaoSchema` com `ProvisaoInput = z.infer<...>` e `ProvisaoFormInput = z.input<...>` (o padrão de `encargoSchema`, **não** existe função conversora); `listarProvisoes()`, `listarProvisoesAtivas()`.

- [ ] **Step 1: Ler o modelo vivo antes de escrever**

```sql
select pg_get_constraintdef(oid) as def, conname from pg_constraint
where conrelid = 'public.folha_encargos'::regclass order by conname;

select policyname, cmd, qual, with_check from pg_policies where tablename = 'folha_encargos';

select relacl from pg_class where relname in ('folha_encargos','folha_item_encargos');

select pg_get_triggerdef(t.oid) from pg_trigger t join pg_class c on c.oid = t.tgrelid
where c.relname = 'folha_encargos' and not t.tgisinternal;

select pg_get_functiondef(p.oid) from pg_proc p join pg_namespace n on n.oid = p.pronamespace
where n.nspname='public' and p.proname = 'fn_recurso_do_cadastro';
```

A tabela nova espelha `folha_encargos` **menos** `grupo_recolhimento` (provisão não vira guia). `folha_item_provisoes` espelha `folha_item_encargos` trocando `valor` por `valor_principal` + `valor_encargos` e sem `grupo_recolhimento`.

- [ ] **Step 2: Aplicar a migration**

Via `apply_migration`, nome `folha_provisoes`:

```sql
create table if not exists public.folha_provisoes (
  id uuid primary key default gen_random_uuid(),
  nome text not null check (length(btrim(nome)) between 2 and 60),
  -- Diferença DELIBERADA de folha_encargos, que aceita percentual 0: provisão
  -- de 0% só gera linha de valor zero no snapshot e suja a conferência do
  -- contador, e desligar uma provisão é `ativo = false`. O Zod tem que casar
  -- com isso (>= 0 no Zod contra > 0 aqui joga erro cru do Postgres na tela).
  percentual numeric(6,3) not null check (percentual > 0 and percentual <= 100),
  ativo boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references public.usuarios(id),
  unique (nome)
);

alter table public.folha_provisoes enable row level security;

-- Espelha folha_encargos: sem policy de DELETE (soft delete via fn_excluir_cadastro).
create policy folha_provisoes_select on public.folha_provisoes
  for select to authenticated using ((select public.tem_permissao('rh.encargos','ver')));
create policy folha_provisoes_insert on public.folha_provisoes
  for insert to authenticated with check ((select public.tem_permissao('rh.encargos','criar')));
create policy folha_provisoes_update on public.folha_provisoes
  for update to authenticated
  using ((select public.tem_permissao('rh.encargos','editar')))
  with check ((select public.tem_permissao('rh.encargos','editar')));

grant select, insert on public.folha_provisoes to authenticated;
grant update (nome, percentual, ativo) on public.folha_provisoes to authenticated;

-- Snapshot: escrita SO pela definer, leitura por rh.folha.
create table if not exists public.folha_item_provisoes (
  id uuid primary key default gen_random_uuid(),
  folha_item_id uuid not null references public.folha_itens(id) on delete cascade,
  nome text not null,
  percentual numeric(6,3) not null,
  valor_principal numeric(14,2) not null check (valor_principal >= 0),
  valor_encargos numeric(14,2) not null default 0 check (valor_encargos >= 0)
);

create index if not exists idx_folha_item_provisoes_item
  on public.folha_item_provisoes (folha_item_id);

alter table public.folha_item_provisoes enable row level security;

create policy folha_item_provisoes_select on public.folha_item_provisoes
  for select to authenticated using ((select public.tem_permissao('rh.folha','ver')));

grant select on public.folha_item_provisoes to authenticated;

-- Totais. Default 0 para folha antiga continuar somando certo.
alter table public.folha_itens add column if not exists provisoes numeric(14,2) not null default 0;
alter table public.folhas add column if not exists valor_provisoes numeric(14,2) not null default 0;

do $$
declare v_ruim integer;
begin
  select count(*) into v_ruim
  from information_schema.role_table_grants
  where table_schema = 'public'
    and ((table_name = 'folha_item_provisoes'
          and (grantee = 'anon' or (grantee = 'authenticated' and privilege_type in ('INSERT','UPDATE','DELETE'))))
      or (table_name = 'folha_provisoes'
          and (grantee = 'anon' or (grantee = 'authenticated' and privilege_type = 'DELETE'))));
  if v_ruim > 0 then
    raise exception 'grant indevido em folha_provisoes/folha_item_provisoes: % ocorrencia(s)', v_ruim;
  end if;
end $$;
```

**Acrescente os três triggers do padrão** (`trg_audit_*`, `trg_*_updated_at`, `trg_set_created_by`) copiando as definições que você leu no Step 1 — não invente os nomes das funções de trigger.

**`folha_item_provisoes` não precisa de `updated_at` nem `created_by`**, espelhando `folha_item_encargos` (é snapshot escrito por definer; quem fez fica no `audit_log`).

- [ ] **Step 3: Estender o dispatcher de soft delete, consertando o encargo no caminho**

**Contexto medido, não suposto:** `fn_excluir_cadastro(p_tabela, p_id, p_motivo)` grava o registro em `lixeira` e dá `delete`, mas começa por `v_recurso := fn_recurso_do_cadastro(p_tabela)` e **levanta exceção se vier null**. Hoje `fn_recurso_do_cadastro('folha_encargos')` devolve **null**: os únicos casos no `case` são `unidades_medida`, `categorias_insumo`, `clientes`, `fornecedores`, `insumos`, `depositos`, `colaboradores`, `obras` e `centros_custo`.

Ou seja: **`excluirEncargo` (`rh/encargos/actions.ts:110`) está quebrado em produção** e sempre levantou `Tabela folha_encargos nao pode ser excluida por esta funcao`. Nunca apareceu porque existem zero encargos cadastrados, então ninguém nunca clicou. O recurso `rh.encargos` tem `CRUD` em `config/recursos.ts:288`, então o botão de excluir aparece na tela.

Isso importa aqui porque a spec manda espelhar esse caminho: espelhado como está, a provisão nasce com o botão de excluir quebrado do mesmo jeito.

Recrie `fn_recurso_do_cadastro` **inteira, preservando todos os casos existentes**, e acrescente **dois**:

```sql
    when 'folha_encargos'    then 'rh.encargos'
    when 'folha_provisoes'   then 'rh.encargos'
```

Depois de aplicar:

```sql
select public.fn_recurso_do_cadastro('folha_encargos') as deve_ser_rh_encargos,
       public.fn_recurso_do_cadastro('folha_provisoes') as deve_ser_rh_encargos,
       public.fn_recurso_do_cadastro('colaboradores') as deve_ser_cadastros_colaboradores,
       public.fn_recurso_do_cadastro('insumos') as deve_ser_cadastros_insumos,
       public.fn_recurso_do_cadastro('nao_existe') as deve_ser_null;
```

E prove a exclusão de ponta a ponta, em transação revertida, para **as duas** tabelas: inserir uma linha, chamar `fn_excluir_cadastro`, conferir que ela saiu da tabela e apareceu em `lixeira` com o motivo, e que motivo vazio é recusado.

**Não mexa em `excluirEncargo` nem na tela dos encargos:** o defeito é do banco, o TypeScript já chama certo, e alargar o escopo em task de cadastro é como esta frente já criou retrabalho. Registre o conserto na mensagem de commit.

- [ ] **Step 4: Conferir no banco**

```sql
select relacl from pg_class where relname in ('folha_provisoes','folha_item_provisoes');
select policyname, cmd from pg_policies where tablename in ('folha_provisoes','folha_item_provisoes') order by 1;
select column_name, column_default, is_nullable from information_schema.columns
where table_schema='public' and (
  (table_name='folha_itens' and column_name='provisoes') or
  (table_name='folhas' and column_name='valor_provisoes'));
select count(*) as provisoes_semeadas from public.folha_provisoes;
```

Esperado: `folha_provisoes` com `arw` (sem `d`), `folha_item_provisoes` com `r` só; quatro policies na primeira e uma na segunda; as duas colunas `NOT NULL default 0`; e **zero** provisão semeada.

- [ ] **Step 5: Escrever o teste do schema (falha primeiro)**

Criar `src/modules/rh/provisoes/schemas.test.ts`:

```ts
import { describe, expect, it } from "vitest";

import { provisaoSchema } from "@/modules/rh/provisoes/schemas";

describe("provisaoSchema", () => {
  const base = { nome: "Provisão 13º", percentual: 8.333, ativo: true };

  it("aceita percentual com três casas", () => {
    expect(provisaoSchema.safeParse(base).success).toBe(true);
  });

  it("recusa percentual zero ou negativo", () => {
    for (const percentual of [0, -1]) {
      expect(provisaoSchema.safeParse({ ...base, percentual }).success).toBe(false);
    }
  });

  it("recusa percentual acima de 100", () => {
    expect(provisaoSchema.safeParse({ ...base, percentual: 100.001 }).success).toBe(false);
  });

  it("recusa mais de três casas decimais", () => {
    expect(provisaoSchema.safeParse({ ...base, percentual: 8.3333 }).success).toBe(false);
  });

  it("aceita o percentual como string digitada em pt-BR", () => {
    const r = provisaoSchema.safeParse({ ...base, percentual: "8,333" });
    expect(r.success && r.data.percentual).toBe(8.333);
  });

  it("normaliza o nome cortando espaço nas pontas", () => {
    const r = provisaoSchema.safeParse({ ...base, nome: "  Provisão férias  " });
    expect(r.success && r.data.nome).toBe("Provisão férias");
  });

  it("recusa nome vazio, curto e com mais de 60 caracteres", () => {
    for (const nome of ["   ", "x", "x".repeat(61)]) {
      expect(provisaoSchema.safeParse({ ...base, nome }).success).toBe(false);
    }
  });
});
```

- [ ] **Step 6: Rodar, ver falhar, implementar, ver passar**

`npx vitest run src/modules/rh/provisoes/schemas.test.ts` → FAIL (módulo não existe).

**O percentual não pode ser duplicado.** `encargos/schemas.ts` já tem exatamente essa validação (`paraNumero` pt-BR, `casasDecimais`, os três `refine`), mas **privada** no arquivo. Mova `paraNumero`, `casasDecimais` e `percentualSchema` para `src/modules/rh/percentual.ts` exportando os três, e faça `encargos/schemas.ts` importar em vez de declarar. **`npx vitest run src/modules/rh/encargos` é o portão dessa extração** — se aquele teste continuar verde, a mudança foi só de lugar. Copiar o percentual para provisões seria a quarta cópia da mesma regra na base.

Então `schemas.ts` das provisões:

```ts
import { z } from "zod";

import { percentualSchema } from "@/modules/rh/percentual";

/** Provisão mensal de 13º e férias: percentual do salário lançado como custo. */
export const provisaoSchema = z.object({
  nome: z
    .string()
    .trim()
    .min(2, { error: "O nome precisa ter pelo menos 2 caracteres" })
    .max(60, { error: "Máximo de 60 caracteres" }),
  /**
   * Zero é recusado aqui de propósito, ao contrário do encargo: o check da
   * coluna é `percentual > 0` e provisão de 0% só sujaria o snapshot com
   * linha de valor zero. Desligar uma provisão é `ativo = false`.
   */
  percentual: percentualSchema.refine((valor) => valor > 0, {
    error: "O percentual precisa ser maior que zero",
  }),
  ativo: z.boolean().default(true),
});

/** Saída validada (percentual já número): use nas server actions. */
export type ProvisaoInput = z.infer<typeof provisaoSchema>;

/** Entrada do formulário (percentual como string): use no react-hook-form. */
export type ProvisaoFormInput = z.input<typeof provisaoSchema>;
```

`npx vitest run src/modules/rh` → PASS, 7 testes novos e os de encargos intactos.

- [ ] **Step 7: Backend e tela do cadastro**

`queries.ts` com `listarProvisoes()` e `listarProvisoesAtivas()`; `actions.ts` com criar, editar e excluir (o excluir **só** via `fn_excluir_cadastro`, nunca `.delete()`), tudo espelhando `rh/encargos`. A tela é uma **seção nova** em `/rh/encargos`, no padrão de `provisoes-secao.tsx` + `provisoes-tabela.tsx` + `provisao-form-drawer.tsx`, com a mesma alçada (`rh.encargos`). Texto de ajuda no form deixando claro que a provisão **entra no custo da folha e não gera conta a pagar**.

- [ ] **Step 8: Regenerar tipos, portão e commit**

```bash
find src supabase .next -name "* [0-9].*" -delete
npx tsc --noEmit && npx eslint src && npx vitest run && npm run build
```

Rode também `select * from public.fn_verificar_diagnosticos_gravados();` e confirme zero linha.

```bash
git add src/modules/rh/provisoes src/modules/rh/percentual.ts src/modules/rh/encargos/schemas.ts \
  src/app/\(app\)/rh/encargos/page.tsx src/lib/database.types.ts supabase/migrations/
git commit -m "feat(rh): cadastro de provisão de 13º e férias

Tabela separada de folha_encargos de propósito: as duas guardam os mesmos campos
mas têm destinos opostos, e provisão na tabela dos encargos viraria conta a pagar
no dia que alguém esquecesse um where. Sem seed de valor, então config vazia
significa provisão zero. Cadastro sob o recurso rh.encargos, sem recurso novo.

Conserta de passagem a exclusão de encargo da folha, que sempre levantou
exceção: fn_recurso_do_cadastro não conhecia folha_encargos, então
fn_excluir_cadastro recusava a tabela. Nunca apareceu porque não existe
encargo cadastrado. As duas tabelas entram no dispatcher.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

### Task 2: A folha provisiona (DINHEIRO)

**Modelo sugerido:** opus. É a task de dinheiro.

**Files:**
- Migration nova: `folha_provisiona_13o_ferias`

**Interfaces:**
- Consumes: `folha_provisoes`, `folha_item_provisoes`, `folha_itens.provisoes`, `folhas.valor_provisoes` (Task 1).
- Produces: `fn_gerar_folha` gravando as linhas de provisão e somando ao `custo_total`.

- [ ] **Step 1: Ler a função viva e guardar num scratch**

```sql
select md5(prosrc) as antes, length(prosrc) as chars, prosrc
from pg_proc p join pg_namespace n on n.oid = p.pronamespace
where n.nspname='public' and p.proname='fn_gerar_folha';
```

Esperado `29c33b2d43a50af321f0ee2f7b7e5728`, 14363 chars. **Se divergir, pare e reporte** (outra sessão trabalha neste banco).

Localize no corpo: a declaração de variáveis, o loop `for v_enc in select nome, percentual, grupo_recolhimento from public.folha_encargos where ativo`, a linha `v_custo := v_colab.salario + v_encargos;`, e o `update public.folhas f set ... custo_total = ...` do fim.

- [ ] **Step 2: Rodar a consulta nova isolada, antes de embutir**

```sql
select nome, percentual from public.folha_provisoes where ativo order by nome;
```

E o cálculo, com valores fixos, conferindo à mão:

```sql
select round(3000 * 8.333 / 100.0, 2) as principal_esperado_249_99,
       round(round(3000 * 8.333 / 100.0, 2) * 28 / 100.0, 2) as encargos_esperado_70_00;
```

- [ ] **Step 3: Aplicar a migration**

Via `apply_migration`, nome `folha_provisiona_13o_ferias`. Recrie a função **a partir da própria `pg_get_functiondef`** com `replace()` cirúrgico (o padrão que funcionou nas quatro alterações anteriores desta função), fazendo **três** mudanças:

**(a)** declarar as variáveis novas junto das existentes:

```sql
  v_prov record; v_prov_principal numeric; v_prov_encargos numeric; v_provisoes numeric;
```

**(b)** inserir, **depois** do loop de encargos e **antes** de `v_custo := v_colab.salario + v_encargos;`:

```sql
    -- Bloco 8b: provisao de 13o e ferias. Custo do mes, SEM caixa: nao gera
    -- lancamento nem guia. Principal + os encargos que vao incidir quando o 13o
    -- e as ferias forem pagos, usando v_pct_total, a MESMA base que os encargos
    -- deste mes usaram. Config vazia => v_provisoes = 0 e custo igual ao de antes.
    -- Arredondamento por LINHA, como no Bloco 6: sum(linhas) == folha_itens.provisoes
    -- por construcao.
    v_provisoes := 0;
    for v_prov in
      select nome, percentual from public.folha_provisoes where ativo order by nome
    loop
      v_prov_principal := round(v_colab.salario * v_prov.percentual / 100.0, 2);
      v_prov_encargos := round(v_prov_principal * v_pct_total / 100.0, 2);

      insert into public.folha_item_provisoes
        (folha_item_id, nome, percentual, valor_principal, valor_encargos)
      values (v_item_id, v_prov.nome, v_prov.percentual, v_prov_principal, v_prov_encargos);

      v_provisoes := v_provisoes + v_prov_principal + v_prov_encargos;
    end loop;

    update public.folha_itens set provisoes = v_provisoes where id = v_item_id;
```

**(c)** trocar o custo e o consolidado:

```sql
    v_custo := v_colab.salario + v_encargos + v_provisoes;
```

e no `update public.folhas` do fim, acrescentar:

```sql
    valor_provisoes = coalesce((select sum(provisoes) from public.folha_itens where folha_id = v_folha), 0),
```

**Atenção à ordem:** o `insert` em `folha_item_provisoes` precisa de `v_item_id`, que só existe **depois** do `insert into folha_itens ... returning id into v_item_id`. O loop de encargos já está depois disso, então inserir o bloco logo após ele é seguro — confirme lendo o corpo, não assuma.

**Trava `do $$` no fim da migration** conferindo que `fn_aprovar_folha` continua em `a1261a1ccbff886980f0991da47a2446` (ela **não** é desta task) e que o corpo novo da `fn_gerar_folha` bate com o `replace()` que você calculou antes de aplicar.

Depois de aplicar, diffe contra o scratch do Step 1 esperando **só** essas três mudanças. Intactos: INSS progressivo com `lag`, IRRF com `least`, o loop de encargos, o desconto de parcela de adiantamento com cascata e empurrão, a guarda de status, e o snapshot do grupo de recolhimento.

- [ ] **Step 4: A prova de aceite desta task**

Em transação revertida, com **duas** provisões cadastradas e **uma delas inativa** (o caso parcial), mais **dois** encargos com um deles inativo:

```sql
begin;
-- 2 colaboradores CLT com salário distinto, 2 encargos (um ativo 20%, um inativo 8%),
-- 2 provisões (13º 8,333% ativa, férias 11,111% INATIVA)
select public.fn_gerar_folha('2026-09-01'::date, 0);

select fi.salario_base, fi.encargos, fi.provisoes, fi.custo_total, fi.valor_liquido,
       fi.salario_base + fi.encargos + fi.provisoes - fi.custo_total as custo_fecha
from public.folha_itens fi
join public.folhas f on f.id = fi.folha_id where f.competencia = '2026-09-01';

-- soma das linhas == total do item, por construção
select fi.id, fi.provisoes,
       coalesce(sum(fip.valor_principal + fip.valor_encargos), 0) as soma_linhas,
       fi.provisoes - coalesce(sum(fip.valor_principal + fip.valor_encargos), 0) as diferenca
from public.folha_itens fi
left join public.folha_item_provisoes fip on fip.folha_item_id = fi.id
join public.folhas f on f.id = fi.folha_id where f.competencia = '2026-09-01'
group by fi.id, fi.provisoes;

-- só a provisão ATIVA gerou linha
select count(*) as deve_ser_1_por_item from public.folha_item_provisoes;
rollback;
```

Esperado: `custo_fecha = 0` nos dois itens; `diferenca = 0`; uma linha de provisão por item (só a ativa); `valor_liquido` **igual** ao que a folha daria antes desta task (o líquido não muda). **Se o líquido mudar, pare e reporte.**

- [ ] **Step 5: As outras quatro provas**

Cada uma em `begin; ... rollback;`:
1. **Config vazia**: nenhuma provisão ativa → `provisoes = 0`, `custo_total = salário + encargos`, zero linha em `folha_item_provisoes`;
2. **Sem encargo cadastrado**: `v_pct_total = 0` → provisão nasce **só com principal**, `valor_encargos = 0`;
3. **Regenerar três vezes**: `provisoes`, `custo_total` e as linhas idênticas, e nenhuma linha órfã (o cascade de `folha_itens` limpa);
4. **Snapshot**: gerar a folha, **desativar um encargo**, e conferir que `folha_item_provisoes` daquela folha **não muda** (é para isso que o snapshot existe).

- [ ] **Step 6: Portão e commit**

```bash
find src supabase .next -name "* [0-9].*" -delete
npx tsc --noEmit && npx eslint src && npx vitest run && npm run build
```

Rode `select * from public.fn_verificar_diagnosticos_gravados();` — **espera-se que ela ACUSE** a consulta de diagnóstico da `fn_aprovar_folha`, porque o `custo_total` mudou de composição e o texto ainda não. **Isso não é erro seu: é a Task 3.** Registre a saída no relatório.

```bash
git add supabase/migrations/ src/lib/database.types.ts
git commit -m "feat(rh): a folha provisiona 13º e férias como custo do mês

Principal mais os encargos que vão incidir quando forem pagos, usando a mesma
base de percentual que os encargos do mês usaram. Não gera lançamento nem guia:
provisão é custo sem caixa. O líquido do colaborador não muda.

Config vazia dá provisão zero e custo igual ao de antes, então o deploy é seguro
antes de cadastrar. Arredondamento por linha, então a soma das linhas bate com o
total do item por construção.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

### Task 3: A identidade ganha o quarto termo

**Modelo sugerido:** opus (mexe no artefato que o contador usa para conferir dinheiro).

**Files:**
- Migration nova: `folha_aprovar_comentario_provisao`

**Interfaces:**
- Consumes: `folhas.valor_provisoes`, `folha_itens.provisoes` (Tasks 1 e 2).
- Produces: `obj_description` da `fn_aprovar_folha` com a identidade de quatro termos e a consulta de diagnóstico atualizada.

- [ ] **Step 1: Ler o comentário vivo e a consulta**

```sql
select obj_description('public.fn_aprovar_folha(uuid)'::regprocedure) as texto;
select md5(prosrc) from pg_proc p join pg_namespace n on n.oid=p.pronamespace
where n.nspname='public' and p.proname='fn_aprovar_folha';
```

O md5 é `a1261a1ccbff886980f0991da47a2446` e **não pode mudar nesta task**: só o comentário muda.

- [ ] **Step 2: Aplicar o comentário e a consulta novos**

Via `apply_migration`, nome `folha_aprovar_comentario_provisao`. O texto novo tem que:

1. declarar a identidade de **quatro** termos: `Σ líquidos + Σ guias + Σ adiantamento descontado + Σ provisões == folhas.custo_total`;
2. dizer que **provisão não é uma quarta causa de resíduo, é um termo explícito** — as causas de diferença legítima continuam três (encargo sem grupo, retido sem grupo, líquido zero);
3. explicar em uma frase que provisão é custo sem caixa e por isso **não** aparece nos lançamentos;
4. trazer a consulta de diagnóstico atualizada com a coluna de provisões somando na conta do `explicado`;
5. manter a marca `-- DIAGNOSTICO EXECUTAVEL v1` e continuar **rodando colada**, sem placeholder de cliente (`:folha` e afins não são SQL fora do `psql`, e a base tem guarda de regressão contra `:[a-zA-Z_]`).

Trava `do $$` conferindo o md5 de `fn_aprovar_folha` e de `fn_gerar_folha`, e chamando `fn_verificar_diagnosticos_gravados()` no fim.

- [ ] **Step 3: Provar nos cinco estados, com a consulta EXTRAÍDA e executada**

Em transação revertida, extraindo a consulta do próprio `obj_description` (o que importa é que o **gravado** roda):
1. sem provisão e config completa → `explicado = 0.00`;
2. **com** provisão → `explicado = 0.00`;
3. com provisão **e** encargo sem grupo (resíduo legítimo) → `explicado = 0.00`;
4. com provisão e `folha_parametros` vazia (estado de produção hoje) → `explicado = 0.00`;
5. o **caso parcial**: uma provisão ativa e outra inativa, com só um dos grupos de retido configurado → `explicado = 0.00`.

O caso 5 é onde esta base já se enganou duas vezes: o extremo esconde o parcial.

- [ ] **Step 4: Portão e commit**

```bash
npx vitest run
```

Confirme `select * from public.fn_verificar_diagnosticos_gravados();` voltando **zero linha** (o que a Task 2 deixou acusando tem que estar resolvido aqui).

```bash
git add supabase/migrations/
git commit -m "docs(rh): a identidade da folha ganha o termo da provisão

Com provisão no custo_total, a soma dos lançamentos deixa de dar o custo total
de propósito: o quarto termo é explícito, não é resíduo. As três causas de
diferença legítima continuam as mesmas. A consulta de diagnóstico gravada no
comentário acompanha, e a migration prova que ela roda extraindo do próprio
comentário e executando.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

### Task 4: Telas

**Modelo sugerido:** sonnet.

**Files:**
- Modify: `src/modules/rh/folha/queries.ts` (embed de `folha_item_provisoes` no select que já existe)
- Modify: `src/modules/rh/folha/calculo.ts` + `calculo.test.ts` (`resumoPorProvisao` pura)
- Modify: `src/modules/rh/folha/components/folha-detalhe.tsx`
- Modify: `src/modules/rh/folha/components/lancamentos-gerados.tsx` (a linha de texto)
- Modify: `src/modules/rh/folha/actions.ts` (coluna na planilha)

**Interfaces:**
- Consumes: `folha_item_provisoes` (Task 1), `folha_itens.provisoes` (Task 2), `FolhaDetalhe` e `FolhaItem` (`folha/queries.ts`).
- Produces, em `folha/queries.ts` (é onde `EncargoDetalhe` e `ResumoEncargo` moram, não em `calculo.ts`):
  - `interface ProvisaoDetalhe { nome: string; valorPrincipal: number; valorEncargos: number }`
  - `interface ResumoProvisao { nome: string; principal: number; encargos: number; total: number }`
  - `FolhaItem.provisoes: number` e `FolhaItem.provisoesDetalhe: ProvisaoDetalhe[]` — **não opcional**, `[]` para folha gerada antes desta frente, exatamente como `encargosDetalhe` (não siga `adiantamentoParcelas`, que é opcional por outro motivo: RLS pode esvaziá-lo).
- Produces, em `folha/calculo.ts`: `resumoPorProvisao(folha: FolhaDetalhe): ResumoProvisao[]` — **recebe a folha inteira, não os itens**, porque é a assinatura de `resumoPorEncargo` e de `resumoPorCentroCusto` no mesmo arquivo.

- [ ] **Step 1: Teste da função pura (falha primeiro)**

Em `src/modules/rh/folha/calculo.test.ts`, no padrão que o arquivo já usa para montar `FolhaDetalhe` de teste (leia os helpers existentes antes de inventar outro):

```ts
import { resumoPorProvisao } from "@/modules/rh/folha/calculo";

describe("resumoPorProvisao", () => {
  const folhaCom = (
    provisoesPorItem: { nome: string; valorPrincipal: number; valorEncargos: number }[][],
  ) => ({ itens: provisoesPorItem.map((provisoesDetalhe) => ({ provisoesDetalhe })) }) as never;

  it("agrupa por nome somando principal e encargos", () => {
    const r = resumoPorProvisao(
      folhaCom([
        [{ nome: "13º", valorPrincipal: 100, valorEncargos: 28 }],
        [{ nome: "13º", valorPrincipal: 50, valorEncargos: 14 }],
      ]),
    );
    expect(r).toEqual([{ nome: "13º", principal: 150, encargos: 42, total: 192 }]);
  });

  it("ordena por nome e mantém as provisões separadas", () => {
    const r = resumoPorProvisao(
      folhaCom([
        [
          { nome: "Férias", valorPrincipal: 111, valorEncargos: 31 },
          { nome: "13º", valorPrincipal: 83, valorEncargos: 23 },
        ],
      ]),
    );
    expect(r.map((p) => p.nome)).toEqual(["13º", "Férias"]);
  });

  it("devolve lista vazia quando nenhum item tem provisão", () => {
    expect(resumoPorProvisao(folhaCom([[]]))).toEqual([]);
  });
});
```

- [ ] **Step 2: Rodar, ver falhar, implementar em `calculo.ts`, ver passar**

`npx vitest run src/modules/rh/folha/calculo.test.ts` → FAIL, depois PASS.

Espelhe `resumoPorEncargo` (`calculo.ts:47`), que já existe no mesmo arquivo, resolve o mesmo problema para encargos e define a ordenação e o formato de retorno que o vizinho da tela espera.

- [ ] **Step 3: Query e detalhe**

Em `buscarFolha` (`queries.ts:284`) são **duas** edições nos `.select()` **que já existem**, sem leitura nova:

1. no select de `folhas`, acrescentar `valor_provisoes` à lista (junto de `valor_encargos`), e o campo em `FolhaDetalhe`;
2. no select de `folha_itens`, acrescentar `provisoes` à lista de colunas e `folha_item_provisoes(nome, valor_principal, valor_encargos)` aos embeds, ao lado de `folha_item_encargos(nome, valor)`.

No `.map()`, `provisoesDetalhe` segue **linha por linha** o que `encargosDetalhe` faz logo acima (`?? []` e `.sort(localeCompare "pt-BR")`), inclusive o comentário de que folha antiga vem vazia.

**Sem leitura nova**: esta tela já foi corrigida em review por fazer três leituras onde uma bastava, e a frente anterior teve que remover uma releitura da mesma tabela no mesmo request.

No `folha-detalhe.tsx`: disclosure da provisão por item (padrão dos encargos do Bloco 6) e um resumo "Provisões por tipo", com `MoneyText`. Mostre principal e encargos separados, que é como o Tiago vai conferir.

- [ ] **Step 4: A linha de texto que evita o chamado**

Em `lancamentos-gerados.tsx`, acrescente uma linha explicando que a provisão de 13º e férias entra no custo da folha e **não** vira conta a pagar, por isso não aparece na lista. Sem isso, alguém compara o custo com os lançamentos, encontra a diferença e abre chamado.

- [ ] **Step 5: A planilha**

Em `gerarPlanilhaFolha` (`actions.ts`), acrescente a coluna de provisão ao cabeçalho, à linha de cada colaborador e à linha de totais — é o arquivo que vai para o contador. Confira que `custo_total` na planilha continua batendo com a soma das colunas.

- [ ] **Step 6: Portão e commit**

```bash
find src supabase .next -name "* [0-9].*" -delete
npx tsc --noEmit && npx eslint src && npx vitest run && npm run build
git add src/modules/rh/folha
git commit -m "feat(rh): detalhe da folha e planilha mostram a provisão

Quebra por tipo com principal e encargos separados, resumo por provisão, e uma
linha na seção de lançamentos dizendo que provisão é custo sem caixa e por isso
não aparece ali. Agregação pura, sem leitura nova.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

### Task 5: Portão final, prova de aceite e registro

**Modelo sugerido:** opus.

- [ ] **Step 1: Portão verde.** `find src supabase .next -name "* [0-9].*" -delete`, então `npx tsc --noEmit`, `npx eslint src`, `npx vitest run`, `npm run build`. Baseline 1138 mais os testes das Tasks 1 e 4.

- [ ] **Step 2: Advisors** (segurança e performance). Reporte achado **novo** desta frente. `folha_provisoes` e `folha_item_provisoes` não podem aparecer em `rls_enabled_no_policy`.

- [ ] **Step 3: A prova de aceite ponta a ponta**, em transação revertida, com produção estável antes e depois. Cenário: 3 colaboradores CLT em centros de custo distintos, faixas de INSS e IRRF, 2 encargos (um com grupo, um sem), 2 provisões (uma ativa, uma inativa), parâmetros completos, e um adiantamento parcelado com uma parcela que não cabe.

Prove: a **identidade de quatro termos** com a consulta extraída do `obj_description` dando `explicado = 0.00`; `custo_total = salário + encargos + provisões` em cada item; **contagem de lançamentos idêntica antes e depois de aprovar** (a prova de que provisão não vira caixa); `valor_liquido` inalterado; a soma das linhas de provisão batendo com o total do item; regenerar três vezes idêntico; e o ciclo aprovar → desaprovar → reaprovar.

- [ ] **Step 4: Conferir as migrations desta frente** — cada versão nova com arquivo homônimo e SQL executável igual ao gravado, pela receita normalizada de `docs/decisoes.md`. Reporte a tabela versão × md5 dos dois lados. E rode `fn_verificar_diagnosticos_gravados()` uma última vez.

- [ ] **Step 5: Registrar em `docs/decisoes.md`** uma entrada nova, no formato das existentes, com: por que a provisão mora em tabela separada dos encargos; a identidade de quatro termos e o fato de a provisão não ser causa de resíduo; que o `custo_total` do BI da Gestão **vai subir** no mês em que a config for cadastrada, sem nada ter piorado; e a **dependência do Bloco 8c**: a provisão acumula sem nada consumi-la, e quando o 13º for pago ela tem que ser abatida, senão o custo conta duas vezes.

- [ ] **Step 6: Não faça merge.** O merge é do coordenador, depois do review amplo.

---

## Self-review deste plano

**Cobertura da spec:**

| seção da spec | task |
|---|---|
| 1. Modelo (tabela separada, snapshot, totais, onde cadastrar) | 1 |
| 2. O cálculo, os três pontos explícitos (total = principal + encargos, arredondamento por linha, `v_pct_total` zero) | 2 (Steps 3, 4 e 5) |
| 3. Identidade de quatro termos e o `obj_description` | 3 |
| 4. Telas (detalhe, lançamentos, holerite intocado, planilha) | 4 |
| 5. Testes | 1 (Step 5), 2 (Steps 4 e 5), 3 (Step 3), 4 (Step 1), 5 (Step 3) |
| Dependência do 8c | 5 (Step 5) |

**Um ponto em que o plano é deliberadamente mais explícito que a spec:** a Task 2 Step 6 avisa que a varredura de diagnósticos **vai acusar** depois da Task 2 e só volta a zero na Task 3. Sem esse aviso, o implementador da Task 2 pararia achando que quebrou algo — e a spec, corretamente, não desce a esse nível.

**Riscos:**

1. **`fn_gerar_folha` será alterada pela quinta vez em duas semanas.** O procedimento que funcionou nas quatro anteriores está no Step 3 da Task 2: copiar a definição viva, recriar a partir dela com `replace()`, diffar depois esperando só o previsto.
2. **A ordem do `insert` depende de `v_item_id`.** O bloco novo precisa ficar depois do `insert into folha_itens ... returning id`. O plano manda confirmar lendo o corpo em vez de assumir a posição.
3. **Outra sessão do Claude trabalha neste banco.** Todas as tasks que tocam função compartilhada mandam conferir md5 antes e parar se divergir. Isso já pegou uma colisão em potencial na frente anterior.
