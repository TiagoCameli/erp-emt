# Roteamento por perfil + Dashboard de Gestão — Plano de Implementação

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Remover a tela `/inicio`, redirecionar cada usuário pra sua tela inicial por perfil (dirigido por permissão) e criar o módulo Gestão (`/gestao`) com um dashboard de visão geral de Compras, Financeiro e RH.

**Architecture:** A rota raiz `/` calcula a rota inicial = primeiro módulo visível do usuário na ordem de `MODULOS`; o novo módulo Gestão entra como primeiro, então quem tem `gestao.painel:ver` (Admin/Gestor) cai em `/gestao` e o resto cai no seu módulo. O dashboard é um Server Component que lê três resumos agregados (só leitura, RLS das tabelas de base protege), cada seção com erro isolado.

**Tech Stack:** Next.js 15 App Router, TypeScript strict, Supabase (Postgres, RLS), Tailwind v4 + componentes canônicos EMT, Vitest, date-fns/@date-fns/tz.

## Global Constraints

- Componentes canônicos primeiro: usar `KPICard`, `PageHeader`, `MoneyText`, `EmptyState` de `@/components/canonicos`. Não criar componente novo.
- Dinheiro sempre via `MoneyText` (NUMERIC vem do banco, exibição `R$ 1.234,56`, `tabular-nums`). Nunca recalcular valor no app: o `valor`/`valor_total` vem do banco.
- Permissão tripla: RLS no banco + checagem no server + UI esconde. A página `/gestao` checa `temPermissao(..., "gestao.painel", "ver")` e faz `notFound()` sem permissão.
- Datas na timezone `America/Rio_Branco`: usar `dataHojeISO()` de `@/lib/formatadores` pra "hoje".
- `getUsuarioLogado` lê as permissões efetivas de `usuario_permissoes` (não de `perfil_permissoes`). Toda concessão de permissão precisa refletir em `usuario_permissoes` dos usuários do perfil.
- Migrations versionadas em `supabase/migrations/` (arquivo + aplicar). Rodar advisors (security + performance) depois e corrigir o que aparecer.
- Definição de pronto: `npm run typecheck`, `npm run lint`, `npm run build`, `npm test` verdes. Sem `any` novo, sem `console.log`.
- Textos pt-BR, sentence case, sem travessão.

Valores de status confirmados no código (usar exatamente estes):
- OC (`ordens_compra.status`): `rascunho`, `pendente_aprovacao`, `aprovado`, `rejeitado`, `cancelado`.
- Cotação (`cotacoes.status`): `aberta`, `finalizada`, `cancelada`.
- Parcela (`lancamento_parcelas.status`): `pendente`, `aprovado`, `pago`.
- Ponto (`rh_pontos.status`): `aberto`, `aprovado`.
- Lançamento tipo (`lancamentos.tipo`): `a_pagar`, `a_receber`.

Observação: em 2026-07-21 as tabelas transacionais estão vazias (fase dev). O dashboard deve renderizar zeros sem quebrar.

---

### Task 1: Registrar o módulo e o recurso de Gestão (config + ícone)

**Files:**
- Modify: `src/config/recursos.ts` (`MODULOS`, `RECURSOS`)
- Modify: `src/components/canonicos/app-shell.tsx` (`MAPA_ICONES`, import de ícone)
- Test: `src/config/recursos.test.ts`

**Interfaces:**
- Produces: módulo `{ id: "gestao", nome: "Gestão", rota: "/gestao" }` como PRIMEIRO item de `MODULOS`; recurso `{ id: "gestao.painel", nome: "Painel", modulo: "gestao", rota: "/gestao", acoes: ["ver"] }` em `RECURSOS`. Isso passa a fazer parte dos tipos `ModuloId` e `RecursoId`.

- [ ] **Step 1: Escrever o teste que falha**

Adicionar ao final de `src/config/recursos.test.ts`, antes do último `});` de fechamento do arquivo, um novo bloco:

```ts
describe("módulo Gestão", () => {
  it("Gestão é o primeiro módulo (vira a home de quem o vê)", () => {
    expect(MODULOS[0].id).toBe("gestao");
    expect(MODULOS[0].rota).toBe("/gestao");
  });

  it("existe o recurso gestao.painel só com a ação ver", () => {
    const painel = RECURSOS.find((r) => r.id === "gestao.painel");
    expect(painel, "recurso gestao.painel não encontrado").toBeDefined();
    expect(painel?.modulo).toBe("gestao");
    expect(painel?.rota).toBe("/gestao");
    expect([...(painel?.acoes ?? [])]).toEqual(["ver"]);
  });
});
```

- [ ] **Step 2: Rodar o teste e confirmar que falha**

Run: `npm test -- src/config/recursos.test.ts`
Expected: FAIL (`MODULOS[0].id` é `"cadastros"`; `gestao.painel` não existe).

- [ ] **Step 3: Adicionar o módulo Gestão como primeiro em `MODULOS`**

Em `src/config/recursos.ts`, trocar o bloco `MODULOS`:

```ts
/** Módulos na ordem de exibição da sidebar */
export const MODULOS = [
  { id: "gestao", nome: "Gestão", rota: "/gestao" },
  { id: "cadastros", nome: "Cadastros", rota: "/cadastros" },
  { id: "compras", nome: "Compras", rota: "/compras" },
  { id: "financeiro", nome: "Financeiro", rota: "/financeiro" },
  { id: "rh", nome: "RH", rota: "/rh" },
  { id: "administracao", nome: "Administração", rota: "/administracao" },
] as const;
```

- [ ] **Step 4: Adicionar o recurso `gestao.painel` no início de `RECURSOS`**

Em `src/config/recursos.ts`, inserir como PRIMEIRO item do array `RECURSOS` (logo após `export const RECURSOS = [`):

```ts
  // Gestão
  {
    id: "gestao.painel",
    nome: "Painel",
    modulo: "gestao",
    rota: "/gestao",
    acoes: ["ver"],
  },
```

- [ ] **Step 5: Adicionar o ícone do módulo Gestão no AppShell**

Em `src/components/canonicos/app-shell.tsx`, adicionar `LayoutDashboard` no import do lucide-react (mantendo a ordem alfabética do import):

```ts
import {
  Circle,
  FolderOpen,
  LayoutDashboard,
  LogOut,
  Search,
  Settings,
  ShoppingCart,
  Users,
  Wallet,
  type LucideIcon,
} from "lucide-react";
```

E adicionar a entrada em `MAPA_ICONES`:

```ts
const MAPA_ICONES: Record<string, LucideIcon> = {
  gestao: LayoutDashboard,
  administracao: Settings,
  cadastros: FolderOpen,
  compras: ShoppingCart,
  financeiro: Wallet,
  rh: Users,
};
```

- [ ] **Step 6: Rodar os testes e o typecheck**

Run: `npm test -- src/config/recursos.test.ts && npm run typecheck`
Expected: PASS nos testes; typecheck sem erros.

- [ ] **Step 7: Commit**

```bash
git add src/config/recursos.ts src/config/recursos.test.ts src/components/canonicos/app-shell.tsx
git commit -m "feat(gestao): registra módulo e recurso gestao.painel"
```

---

### Task 2: Helpers `modulosVisiveis` e `rotaInicial`

**Files:**
- Modify: `src/lib/permissoes.ts`
- Test: `src/lib/permissoes.test.ts`

**Interfaces:**
- Consumes: `MODULOS`, `recursosDoModulo`, `RecursoId` de `@/config/recursos`; `temPermissao`, `UsuarioLogado` do próprio arquivo.
- Produces:
  - `modulosVisiveis(usuario: UsuarioLogado | null): ReadonlyArray<(typeof MODULOS)[number]>` — módulos com "ver" em algum recurso, na ordem de `MODULOS`.
  - `rotaInicial(usuario: UsuarioLogado | null): string | null` — rota do primeiro módulo visível, ou `null`.

- [ ] **Step 1: Escrever os testes que falham**

Adicionar ao final de `src/lib/permissoes.test.ts` (o arquivo já mocka `server-only`, o client do Supabase e o `cache` do React no topo; reusar o helper `criarUsuario` já existente). Incluir `modulosVisiveis` e `rotaInicial` no import existente de `@/lib/permissoes`:

```ts
import { modulosVisiveis, rotaInicial, temPermissao } from "@/lib/permissoes";
```

E adicionar os blocos:

```ts
describe("modulosVisiveis", () => {
  it("usuário null não vê nenhum módulo", () => {
    expect(modulosVisiveis(null)).toHaveLength(0);
  });

  it("retorna os módulos na ordem de MODULOS (Gestão antes de Compras)", () => {
    const usuario = criarUsuario([
      { recurso: "compras.ordens", acao: "ver" },
      { recurso: "gestao.painel", acao: "ver" },
    ]);
    expect(modulosVisiveis(usuario).map((m) => m.id)).toEqual([
      "gestao",
      "compras",
    ]);
  });
});

describe("rotaInicial", () => {
  it("sem nenhuma permissão retorna null", () => {
    expect(rotaInicial(criarUsuario([]))).toBeNull();
  });

  it("perfil de Compras cai em /compras", () => {
    const usuario = criarUsuario([{ recurso: "compras.ordens", acao: "ver" }]);
    expect(rotaInicial(usuario)).toBe("/compras");
  });

  it("perfil de Financeiro cai em /financeiro", () => {
    const usuario = criarUsuario([
      { recurso: "financeiro.lancamentos", acao: "ver" },
    ]);
    expect(rotaInicial(usuario)).toBe("/financeiro");
  });

  it("perfil de RH cai em /rh", () => {
    const usuario = criarUsuario([{ recurso: "rh.folha", acao: "ver" }]);
    expect(rotaInicial(usuario)).toBe("/rh");
  });

  it("quem vê Gestão cai em /gestao, mesmo vendo outros módulos", () => {
    const usuario = criarUsuario([
      { recurso: "gestao.painel", acao: "ver" },
      { recurso: "compras.ordens", acao: "ver" },
      { recurso: "financeiro.lancamentos", acao: "ver" },
    ]);
    expect(rotaInicial(usuario)).toBe("/gestao");
  });

  it("ação diferente de ver não conta como módulo visível", () => {
    const usuario = criarUsuario([{ recurso: "compras.ordens", acao: "criar" }]);
    expect(rotaInicial(usuario)).toBeNull();
  });
});
```

- [ ] **Step 2: Rodar e confirmar falha**

Run: `npm test -- src/lib/permissoes.test.ts`
Expected: FAIL (`modulosVisiveis`/`rotaInicial` não existem).

- [ ] **Step 3: Implementar os helpers**

Em `src/lib/permissoes.ts`, ajustar o import de `@/config/recursos` para trazer também os valores `MODULOS` e `recursosDoModulo`:

```ts
import { MODULOS, recursosDoModulo } from "@/config/recursos";
import type { Acao, RecursoId } from "@/config/recursos";
```

E adicionar ao final do arquivo:

```ts
/**
 * Módulos que o usuário pode ver, na ordem da sidebar (MODULOS).
 * Um módulo é visível quando o usuário tem "ver" em algum recurso dele.
 */
export function modulosVisiveis(
  usuario: UsuarioLogado | null,
): ReadonlyArray<(typeof MODULOS)[number]> {
  return MODULOS.filter((modulo) =>
    recursosDoModulo(modulo.id).some((recurso) =>
      temPermissao(usuario, recurso.id as RecursoId, "ver"),
    ),
  );
}

/**
 * Rota inicial do usuário: o primeiro módulo visível na ordem da sidebar.
 * Retorna null quando não há nenhum módulo visível.
 */
export function rotaInicial(usuario: UsuarioLogado | null): string | null {
  return modulosVisiveis(usuario)[0]?.rota ?? null;
}
```

- [ ] **Step 4: Rodar os testes e o typecheck**

Run: `npm test -- src/lib/permissoes.test.ts && npm run typecheck`
Expected: PASS; typecheck limpo.

- [ ] **Step 5: Commit**

```bash
git add src/lib/permissoes.ts src/lib/permissoes.test.ts
git commit -m "feat(gestao): helpers modulosVisiveis e rotaInicial"
```

---

### Task 3: Queries agregadas do dashboard (`modules/gestao/queries.ts`)

**Files:**
- Create: `src/modules/gestao/queries.ts`

**Interfaces:**
- Consumes: `createClient` de `@/lib/supabase/server`; `dataHojeISO` de `@/lib/formatadores`; `addDays`, `addMonths`, `format`, `parseISO` de `date-fns`.
- Produces:
  - `ResumoCompras`, `ResumoFinanceiro`, `ResumoRh` (interfaces).
  - `comprasResumo(): Promise<ResumoCompras>`
  - `financeiroResumo(): Promise<ResumoFinanceiro>`
  - `rhResumo(): Promise<ResumoRh>`

(Sem teste unitário: o padrão do repo é testar funções puras, não queries que dependem do client do Supabase. A verificação é `typecheck` + `build` + conferência manual no preview, onde as tabelas vazias devem render zeros.)

- [ ] **Step 1: Criar o arquivo com as três queries**

Criar `src/modules/gestao/queries.ts`:

```ts
import "server-only";

import { addDays, addMonths, format, parseISO } from "date-fns";

import { dataHojeISO } from "@/lib/formatadores";
import { createClient } from "@/lib/supabase/server";

export interface ResumoCompras {
  ocsAprovar: { contagem: number; valor: number };
  ocsAbertas: { contagem: number; valor: number };
  cotacoesAbertas: number;
}

export interface ResumoFinanceiro {
  aPagar: { contagem: number; vencidas: number; valor: number };
  aAprovar: { contagem: number; valor: number };
  pagoNoMes: { contagem: number; valor: number };
}

export interface ResumoRh {
  colaboradoresAtivos: number;
  folha: { competencia: string | null; custoTotal: number };
  apontamentosAbertos: number;
}

/** Soma segura de valores NUMERIC que podem vir como string ou null do banco. */
function somar(valores: Array<number | string | null>): number {
  return valores.reduce<number>((total, v) => total + Number(v ?? 0), 0);
}

/** Resumo de Compras: OCs a aprovar, OCs abertas e cotações em aberto. */
export async function comprasResumo(): Promise<ResumoCompras> {
  const supabase = await createClient();

  const [aprovar, abertas, cotacoes] = await Promise.all([
    supabase
      .from("ordens_compra")
      .select("valor_total")
      .eq("status", "pendente_aprovacao"),
    supabase.from("ordens_compra").select("valor_total").eq("status", "aprovado"),
    supabase
      .from("cotacoes")
      .select("id", { count: "exact", head: true })
      .eq("status", "aberta"),
  ]);

  if (aprovar.error || abertas.error || cotacoes.error) {
    throw new Error("Não foi possível carregar o resumo de Compras");
  }

  return {
    ocsAprovar: {
      contagem: aprovar.data?.length ?? 0,
      valor: somar((aprovar.data ?? []).map((o) => o.valor_total)),
    },
    ocsAbertas: {
      contagem: abertas.data?.length ?? 0,
      valor: somar((abertas.data ?? []).map((o) => o.valor_total)),
    },
    cotacoesAbertas: cotacoes.count ?? 0,
  };
}

/** Resumo do Financeiro: a pagar (aprovadas vencendo/vencidas), a aprovar e pago no mês. */
export async function financeiroResumo(): Promise<ResumoFinanceiro> {
  const supabase = await createClient();

  const hoje = dataHojeISO();
  const limite7 = format(addDays(parseISO(hoje), 7), "yyyy-MM-dd");
  const inicioMes = `${hoje.slice(0, 7)}-01`;
  const proximoMes = format(addMonths(parseISO(inicioMes), 1), "yyyy-MM-dd");

  const [aPagar, aAprovar, pagas] = await Promise.all([
    supabase
      .from("lancamento_parcelas")
      .select("valor, data_vencimento, lancamentos!inner(tipo)")
      .eq("status", "aprovado")
      .eq("lancamentos.tipo", "a_pagar")
      .lte("data_vencimento", limite7),
    supabase
      .from("lancamento_parcelas")
      .select("valor, lancamentos!inner(tipo)")
      .eq("status", "pendente")
      .eq("lancamentos.tipo", "a_pagar"),
    supabase
      .from("lancamento_parcelas")
      .select("valor, lancamentos!inner(tipo)")
      .eq("status", "pago")
      .eq("lancamentos.tipo", "a_pagar")
      .gte("data_pagamento", inicioMes)
      .lt("data_pagamento", proximoMes),
  ]);

  if (aPagar.error || aAprovar.error || pagas.error) {
    throw new Error("Não foi possível carregar o resumo do Financeiro");
  }

  const vencidas = (aPagar.data ?? []).filter(
    (p) => p.data_vencimento != null && p.data_vencimento < hoje,
  ).length;

  return {
    aPagar: {
      contagem: aPagar.data?.length ?? 0,
      vencidas,
      valor: somar((aPagar.data ?? []).map((p) => p.valor)),
    },
    aAprovar: {
      contagem: aAprovar.data?.length ?? 0,
      valor: somar((aAprovar.data ?? []).map((p) => p.valor)),
    },
    pagoNoMes: {
      contagem: pagas.data?.length ?? 0,
      valor: somar((pagas.data ?? []).map((p) => p.valor)),
    },
  };
}

/** Resumo do RH: colaboradores ativos, custo da folha mais recente, apontamentos em aberto. */
export async function rhResumo(): Promise<ResumoRh> {
  const supabase = await createClient();

  const [colaboradores, folha, apontamentos] = await Promise.all([
    supabase
      .from("colaboradores")
      .select("id", { count: "exact", head: true })
      .eq("ativo", true),
    supabase
      .from("folhas")
      .select("competencia, custo_total")
      .order("competencia", { ascending: false })
      .limit(1)
      .maybeSingle(),
    supabase
      .from("rh_pontos")
      .select("id", { count: "exact", head: true })
      .eq("status", "aberto"),
  ]);

  if (colaboradores.error || folha.error || apontamentos.error) {
    throw new Error("Não foi possível carregar o resumo do RH");
  }

  return {
    colaboradoresAtivos: colaboradores.count ?? 0,
    folha: {
      competencia: folha.data?.competencia ?? null,
      custoTotal: Number(folha.data?.custo_total ?? 0),
    },
    apontamentosAbertos: apontamentos.count ?? 0,
  };
}
```

- [ ] **Step 2: Rodar o typecheck**

Run: `npm run typecheck`
Expected: sem erros. Se o TypeScript reclamar do embed `lancamentos!inner(tipo)` (tipos gerados), conferir `src/lib/database.types.ts` e alinhar com o padrão já usado em `src/modules/financeiro/pagamentos/queries.ts` (mesmo `!inner`). Não acessar campos de `lancamentos` além do filtro.

- [ ] **Step 3: Commit**

```bash
git add src/modules/gestao/queries.ts
git commit -m "feat(gestao): queries de resumo de Compras, Financeiro e RH"
```

---

### Task 4: Página do dashboard (`/gestao`)

**Files:**
- Create: `src/app/(app)/gestao/page.tsx`

**Interfaces:**
- Consumes: `comprasResumo`, `financeiroResumo`, `rhResumo` e os tipos `ResumoCompras`/`ResumoFinanceiro`/`ResumoRh` de `@/modules/gestao/queries`; `getUsuarioLogado`, `temPermissao` de `@/lib/permissoes`; `KPICard`, `PageHeader`, `MoneyText`, `EmptyState` de `@/components/canonicos`.
- Produces: rota `/gestao` (Server Component) com o dashboard.

- [ ] **Step 1: Criar a página**

Criar `src/app/(app)/gestao/page.tsx`:

```tsx
import type { ReactNode } from "react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { TriangleAlert } from "lucide-react";

import { EmptyState, KPICard, MoneyText, PageHeader } from "@/components/canonicos";
import { getUsuarioLogado, temPermissao } from "@/lib/permissoes";
import {
  comprasResumo,
  financeiroResumo,
  rhResumo,
  type ResumoCompras,
  type ResumoFinanceiro,
  type ResumoRh,
} from "@/modules/gestao/queries";

export const metadata = {
  title: "Gestão",
};

function Secao<T>({
  titulo,
  rota,
  resultado,
  children,
}: {
  titulo: string;
  rota: string;
  resultado: PromiseSettledResult<T>;
  children: (dados: T) => ReactNode;
}) {
  return (
    <section className="space-y-3">
      <div className="flex items-center justify-between">
        <h2 className="text-corpo font-semibold">{titulo}</h2>
        <Link
          href={rota}
          className="text-detalhe text-muted-foreground hover:text-foreground hover:underline"
        >
          Abrir {titulo.toLowerCase()}
        </Link>
      </div>
      {resultado.status === "fulfilled" ? (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {children(resultado.value)}
        </div>
      ) : (
        <EmptyState
          icone={TriangleAlert}
          titulo="Não foi possível carregar esta seção"
          descricao="Recarregue a página. Se continuar, avise o administrador."
        />
      )}
    </section>
  );
}

export default async function GestaoPage() {
  const usuario = await getUsuarioLogado();
  if (!temPermissao(usuario, "gestao.painel", "ver")) {
    notFound();
  }

  const [compras, financeiro, rh] = await Promise.allSettled([
    comprasResumo(),
    financeiroResumo(),
    rhResumo(),
  ]);

  return (
    <div className="space-y-6">
      <PageHeader
        titulo="Gestão"
        descricao="Visão geral de Compras, Financeiro e RH"
      />

      <Secao<ResumoCompras> titulo="Compras" rota="/compras" resultado={compras}>
        {(d) => (
          <>
            <KPICard
              titulo="OCs a aprovar"
              valor={d.ocsAprovar.contagem}
              detalhe={<MoneyText valor={d.ocsAprovar.valor} />}
            />
            <KPICard
              titulo="OCs abertas"
              valor={<MoneyText valor={d.ocsAbertas.valor} />}
              detalhe={`${d.ocsAbertas.contagem} ordem(ns)`}
            />
            <KPICard titulo="Cotações em aberto" valor={d.cotacoesAbertas} />
          </>
        )}
      </Secao>

      <Secao<ResumoFinanceiro>
        titulo="Financeiro"
        rota="/financeiro"
        resultado={financeiro}
      >
        {(d) => (
          <>
            <KPICard
              titulo="A pagar (até 7 dias)"
              valor={<MoneyText valor={d.aPagar.valor} />}
              detalhe={`${d.aPagar.contagem} parcela(s), ${d.aPagar.vencidas} vencida(s)`}
            />
            <KPICard
              titulo="Pagamentos a aprovar"
              valor={d.aAprovar.contagem}
              detalhe={<MoneyText valor={d.aAprovar.valor} />}
            />
            <KPICard
              titulo="Pago no mês"
              valor={<MoneyText valor={d.pagoNoMes.valor} />}
              detalhe={`${d.pagoNoMes.contagem} pagamento(s)`}
            />
          </>
        )}
      </Secao>

      <Secao<ResumoRh> titulo="RH" rota="/rh" resultado={rh}>
        {(d) => (
          <>
            <KPICard
              titulo="Colaboradores ativos"
              valor={d.colaboradoresAtivos}
            />
            <KPICard
              titulo="Custo da folha"
              valor={<MoneyText valor={d.folha.custoTotal} />}
              detalhe={d.folha.competencia ?? "sem folha lançada"}
            />
            <KPICard
              titulo="Apontamentos em aberto"
              valor={d.apontamentosAbertos}
            />
          </>
        )}
      </Secao>
    </div>
  );
}
```

- [ ] **Step 2: Rodar typecheck, lint e build**

Run: `npm run typecheck && npm run lint && npm run build`
Expected: tudo verde. (A rota `/gestao` compila; ainda sem permissão concedida, mas a página existe.)

- [ ] **Step 3: Commit**

```bash
git add "src/app/(app)/gestao/page.tsx"
git commit -m "feat(gestao): página do dashboard de visão geral"
```

---

### Task 5: Migration — conceder `gestao.painel` a Admin/Gestor e sincronizar usuários

**Files:**
- Create: `supabase/migrations/20260721120001_gestao_painel_permissoes.sql`

**Interfaces:**
- Produces: linhas `('gestao.painel','ver')` em `perfil_permissoes` para os perfis Admin e Gestor, e as linhas correspondentes em `usuario_permissoes` para os usuários desses perfis (ex: o Tiago).

- [ ] **Step 1: Criar o arquivo de migration**

Criar `supabase/migrations/20260721120001_gestao_painel_permissoes.sql`:

```sql
-- Concede o recurso gestao.painel (dashboard de visão geral) aos perfis
-- Admin e Gestor, e sincroniza a permissão efetiva dos usuários desses
-- perfis (getUsuarioLogado lê usuario_permissoes, não perfil_permissoes).

-- 1) Matriz do perfil
insert into public.perfil_permissoes (perfil_id, recurso, acao)
select p.id, 'gestao.painel', 'ver'
from public.perfis p
where p.nome in ('Admin', 'Gestor')
on conflict (perfil_id, recurso, acao) do nothing;

-- 2) Permissao efetiva dos usuarios que ja tem esses perfis
insert into public.usuario_permissoes (usuario_id, recurso, acao, created_by)
select u.id, pp.recurso, pp.acao, u.id
from public.usuarios u
join public.perfil_permissoes pp on pp.perfil_id = u.perfil_id
where pp.recurso = 'gestao.painel'
on conflict (usuario_id, recurso, acao) do nothing;
```

- [ ] **Step 2: Aplicar a migration**

Preferencial (CLI, se o projeto estiver linkado):

Run: `npx supabase db push`
Expected: aplica `20260721120001_gestao_painel_permissoes.sql` sem erro.

Alternativa (ambiente sem CLI linkado): aplicar o mesmo SQL via MCP do Supabase (`apply_migration`, name `gestao_painel_permissoes`, project_id `vsesgvqjgqpapoxhnbqx`).

- [ ] **Step 3: Verificar que o Admin ganhou a permissão efetiva**

Rodar (via MCP `execute_sql`, project_id `vsesgvqjgqpapoxhnbqx`):

```sql
select u.nome, up.recurso, up.acao
from usuario_permissoes up
join usuarios u on u.id = up.usuario_id
where up.recurso = 'gestao.painel';
```
Expected: pelo menos uma linha (o usuário Admin / Tiago) com `gestao.painel | ver`.

- [ ] **Step 4: Rodar os advisors e corrigir o que aparecer**

Rodar os advisors do Supabase (MCP `get_advisors` type `security` e `performance`). Como a migration só insere linhas (sem DDL, sem tabela nova), não deve gerar aviso novo. Se aparecer algo relacionado, corrigir antes de seguir.

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/20260721120001_gestao_painel_permissoes.sql
git commit -m "feat(gestao): concede gestao.painel a Admin e Gestor"
```

---

### Task 6: Usar `modulosVisiveis` no layout do app

**Files:**
- Modify: `src/app/(app)/layout.tsx`

**Interfaces:**
- Consumes: `modulosVisiveis` de `@/lib/permissoes`.

(Refactor: remove a duplicação do filtro de módulos, agora que o helper existe. Server Component, sem teste unitário; verificação por `typecheck`/`build`.)

- [ ] **Step 1: Trocar o cálculo inline pelo helper**

Em `src/app/(app)/layout.tsx`, ajustar o import de permissões:

```ts
import { getUsuarioLogado, modulosVisiveis } from "@/lib/permissoes";
```

Remover os imports que deixaram de ser usados no arquivo (`MODULOS`, `recursosDoModulo`, `temPermissao`, `RecursoId`) se não forem usados em outro ponto do arquivo, e substituir o bloco que monta `modulosVisiveis: ModuloNavegacao[]` por:

```ts
  const modulos: ModuloNavegacao[] = modulosVisiveis(usuario).map((modulo) => ({
    id: modulo.id,
    nome: modulo.nome,
    rota: modulo.rota,
    icone: modulo.id,
  }));
```

E passar `modulos={modulos}` no `<AppShell>`:

```tsx
    <AppShell
      usuario={{ nome: usuario.nome, email: usuario.email }}
      modulos={modulos}
      onSair={sair}
    >
      {children}
    </AppShell>
```

- [ ] **Step 2: Rodar typecheck e build**

Run: `npm run typecheck && npm run build`
Expected: verde. Nenhum import não usado (o lint pega isso).

- [ ] **Step 3: Rodar o lint**

Run: `npm run lint`
Expected: sem erros de import não usado nem outros.

- [ ] **Step 4: Commit**

```bash
git add "src/app/(app)/layout.tsx"
git commit -m "refactor(app): layout usa helper modulosVisiveis"
```

---

### Task 7: Redirecionar a raiz por perfil, remover `/inicio` e criar `/sem-acesso`

**Files:**
- Modify: `src/app/page.tsx`
- Delete: `src/app/(app)/inicio/page.tsx`
- Create: `src/app/(app)/sem-acesso/page.tsx`

**Interfaces:**
- Consumes: `getUsuarioLogado`, `rotaInicial` de `@/lib/permissoes`; `EmptyState` de `@/components/canonicos`.

- [ ] **Step 1: Reescrever a rota raiz para redirecionar por perfil**

Substituir todo o conteúdo de `src/app/page.tsx` por:

```tsx
import { redirect } from "next/navigation";

import { getUsuarioLogado, rotaInicial } from "@/lib/permissoes";

export default async function Home() {
  const usuario = await getUsuarioLogado();
  if (!usuario) redirect("/login");
  redirect(rotaInicial(usuario) ?? "/sem-acesso");
}
```

- [ ] **Step 2: Remover a tela de início**

Run: `git rm "src/app/(app)/inicio/page.tsx"`
Expected: arquivo removido. (Confirmado que nada mais referencia a rota `/inicio`: o logo do AppShell é texto, o middleware manda o usuário logado para `/`.)

- [ ] **Step 3: Criar a página de fallback `/sem-acesso`**

Criar `src/app/(app)/sem-acesso/page.tsx`:

```tsx
import { Inbox } from "lucide-react";

import { EmptyState } from "@/components/canonicos";

export const metadata = {
  title: "Sem acesso",
};

export default function SemAcessoPage() {
  return (
    <EmptyState
      icone={Inbox}
      titulo="Você ainda não tem acesso a nenhum módulo"
      descricao="Fale com o administrador do sistema para liberar seu acesso."
    />
  );
}
```

- [ ] **Step 4: Rodar typecheck, lint e build**

Run: `npm run typecheck && npm run lint && npm run build`
Expected: tudo verde; o build não deve mais listar a rota `/inicio` e deve listar `/gestao` e `/sem-acesso`.

- [ ] **Step 5: Rodar a suíte de testes inteira**

Run: `npm test`
Expected: todos os testes passam.

- [ ] **Step 6: Commit**

```bash
git add "src/app/page.tsx" "src/app/(app)/sem-acesso/page.tsx"
git rm --cached "src/app/(app)/inicio/page.tsx" 2>/dev/null || true
git commit -m "feat(gestao): redireciona a raiz por perfil e remove /inicio"
```

---

### Task 8: Verificação de ponta a ponta no preview

**Files:** nenhum (verificação manual).

- [ ] **Step 1: Subir o preview (Vercel) da branch/commit**

Publicar o deploy de preview e abrir com o usuário Admin (Tiago).

- [ ] **Step 2: Conferir o roteamento por perfil**

Entrar como Admin: ao abrir `/` (ou logo após o login), a URL deve virar `/gestao` e mostrar o dashboard com as três seções (números zerados, sem erro, já que as tabelas estão vazias).
Expected: cai em `/gestao`; sidebar mostra "Gestão" como primeiro item com o ícone de painel.

- [ ] **Step 3: Conferir o guard de permissão**

Confirmar que um perfil sem `gestao.painel` (ex: Compras, se houver usuário de teste) cai no seu módulo (`/compras`) e que abrir `/gestao` direto retorna 404 (notFound) para esse perfil.
Expected: comportamento conforme; sem tela de erro do Next.

- [ ] **Step 4: Confirmar que `/inicio` sumiu**

Abrir `/inicio` no preview.
Expected: 404 (rota não existe mais).

- [ ] **Step 5: Avisar o Tiago pra validar**

Passar o link do preview e o resumo do que mudou. Só considerar pronto após o ok dele.

---

## Ordem e dependências

Sequência que mantém cada commit shippable: 1 (config) → 2 (helpers) → 3 (queries) → 4 (página) → 5 (migration/permissão) → 6 (layout) → 7 (redirect + remove inicio) → 8 (verificação). O redirect (Task 7) só vira a chave depois que `/gestao` existe (Task 4) e o Admin já tem a permissão (Task 5).
