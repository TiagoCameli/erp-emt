# Trilha de auditoria legível — Plano

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:subagent-driven-development (recomendado) ou executing-plans, tarefa a tarefa. Passos usam checkbox (`- [ ]`).

**Goal:** Trilha do audit_log legível em todo o app: título por ação, rótulo amigável de campo, valor formatado (R$/data/situação), UUID resolvido para nome, sem ruído técnico, mostrando só o valor novo.

**Architecture:** Reescreve o helper canônico puro `trilha-helpers.ts` (mapa de campos + formatadores + títulos), testável isolado com um mapa `nomes` injetado. Um resolvedor server-side (`trilha-nomes.ts`) resolve os UUIDs de FK para nome em lote. As 3 telas de detalhe (OC, cotação, lançamento) passam a chamar o resolvedor e o helper com `{nomes, entidade, genero}`. A tela global de Auditoria herda rótulos/formatação.

**Tech Stack:** Next.js 16 (TS strict), Supabase, Vitest. Só leitura/apresentação (não toca audit_log/triggers). Branch: `feat-trilha-legivel`.

Spec: `docs/superpowers/specs/2026-07-23-trilha-auditoria-legivel-design.md`.

## Global Constraints

- Só apresentação. Não muda audit_log, triggers, schema.
- Título por ação (não "Registro editado"); só o VALOR NOVO (sem "de → para").
- Esconde ruído: `created_by`, `updated_at`, `created_at`, `aprovado_por`, `aprovado_em`, e FK sem nome resolvido.
- Portão por tarefa: typecheck/lint/build verdes; testes existentes verdes; sem any novo, sem console.log. (Ambiente: limpar `.next` duplicado antes do typecheck: `find .next -name "* [0-9].ts" -delete; find .next -name "* [0-9].tsx" -delete`.)
- Import de `@/components/canonicos` e `@/lib/formatadores` (`formatarBRL`, `formatarData`, `formatarDataHora`).
- Todo commit termina com `Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>`.

---

## Task 1: Reescrever o helper (mapa + formatadores + títulos + só valor novo) + testes

**Files:**
- Modify: `src/components/canonicos/trilha-helpers.ts`
- Create: `src/components/canonicos/trilha-helpers.test.ts`

**Interfaces:**
- Produces:
  - `eventosDoAuditLog(registros: RegistroAuditLog[], opcoes?: { nomes?: Record<string,string>; entidade?: string; genero?: "f" | "m" }): EventoTrilha[]` (retrocompatível — opcoes opcional).
  - `CAMPOS_FK: Record<string, TabelaFk>` exportado (nome do campo → tabela de FK), para o resolvedor (Task 2) reusar. `type TabelaFk = "condicoes_pagamento" | "fornecedores" | "centros_custo" | "insumos" | "usuarios"`.

- [ ] **Step 1: Escrever o teste (falha primeiro)**

`src/components/canonicos/trilha-helpers.test.ts`:
```ts
import { describe, expect, it } from "vitest";
import { eventosDoAuditLog } from "./trilha-helpers";
import type { RegistroAuditLog } from "./trilha-helpers";

function reg(p: Partial<RegistroAuditLog>): RegistroAuditLog {
  return {
    id: 1, tabela: "ordens_compra", registro_id: "oc1", acao: "UPDATE",
    usuario_nome: "Tiago", dados_antes: null, dados_depois: null,
    criado_em: "2026-07-22T14:30:00Z", ...p,
  };
}

describe("eventosDoAuditLog", () => {
  it("INSERT vira '{entidade} criada' (feminino) / criado (masculino)", () => {
    const f = eventosDoAuditLog([reg({ acao: "INSERT", dados_antes: null, dados_depois: { status: "rascunho" } })], { entidade: "Ordem", genero: "f" });
    expect(f[0].titulo).toBe("Ordem criada");
    const m = eventosDoAuditLog([reg({ acao: "INSERT", dados_depois: { status: "rascunho" } })], { entidade: "Lançamento", genero: "m" });
    expect(m[0].titulo).toBe("Lançamento criado");
  });

  it("mudança de situação vira título por ação", () => {
    const t = (antes: string, depois: string) =>
      eventosDoAuditLog([reg({ dados_antes: { status: antes }, dados_depois: { status: depois } })], { entidade: "Ordem", genero: "f" })[0].titulo;
    expect(t("rascunho", "pendente_aprovacao")).toBe("Enviada para aprovação");
    expect(t("pendente_aprovacao", "aprovado")).toBe("Aprovada");
    expect(t("aprovado", "pendente_aprovacao")).toBe("Aprovação revertida");
    expect(t("pendente_aprovacao", "cancelado")).toBe("Cancelada");
    expect(t("aprovado", "recebido")).toBe("Recebida");
  });

  it("mostra rótulo amigável + valor novo formatado, sem 'de → para'", () => {
    const [e] = eventosDoAuditLog([reg({
      dados_antes: { valor_total: 0 }, dados_depois: { valor_total: 3680 },
    })], { entidade: "Ordem", genero: "f" });
    expect(e.descricao).toBe("Valor total: R$ 3.680,00");
    expect(e.descricao).not.toContain("→");
  });

  it("situação em palavras", () => {
    const [e] = eventosDoAuditLog([reg({
      dados_antes: { observacoes: "a" }, dados_depois: { observacoes: "a", status: "aprovado" },
    })], { entidade: "Ordem", genero: "f" });
    // título já cobre status; aqui garantimos o mapa de situação
    expect(eventosDoAuditLog([reg({ dados_antes: {}, dados_depois: { motivo_rejeicao: "x", status: "cancelado" } })], {})[0].titulo).toBe("Cancelada");
  });

  it("resolve FK pelo mapa nomes; oculta FK sem nome", () => {
    const nomes = { "uuid-cond": "À vista" };
    const [ok] = eventosDoAuditLog([reg({ dados_antes: {}, dados_depois: { condicao_pagamento_id: "uuid-cond" } })], { nomes });
    expect(ok.descricao).toBe("Condição de pagamento: À vista");
    const [semNome] = eventosDoAuditLog([reg({ dados_antes: {}, dados_depois: { condicao_pagamento_id: "uuid-desconhecido" } })], {});
    expect(semNome.descricao).toBeUndefined(); // sem nome, o campo é ocultado
  });

  it("oculta ruído (aprovado_por, aprovado_em, timestamps) e mostra '—' pra vazio relevante", () => {
    const [e] = eventosDoAuditLog([reg({
      dados_antes: { aprovado_por: "x", aprovado_em: "2026-07-22T19:30:00Z", motivo_rejeicao: null },
      dados_depois: { aprovado_por: null, aprovado_em: null, motivo_rejeicao: "Teste QA", status: "cancelado" },
    })], { entidade: "Ordem", genero: "f" });
    expect(e.titulo).toBe("Cancelada");
    expect(e.descricao).toBe("Motivo: Teste QA");
    expect(e.descricao).not.toContain("aprovado");
  });
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `npm test -- --run src/components/canonicos/trilha-helpers.test.ts` → FAIL (assinatura/comportamento novos).

- [ ] **Step 3: Reescrever `trilha-helpers.ts`**

Substituir o conteúdo por (mantendo `RegistroAuditLog`, `eventosDoAuditLog` exportados):
```ts
import type { Json } from "@/lib/database.types";
import { formatarBRL, formatarData, formatarDataHora } from "@/lib/formatadores";
import type { EventoTrilha, TipoEventoTrilha } from "./trilha";

export interface RegistroAuditLog {
  id: number | string;
  tabela: string;
  registro_id: string | null;
  acao: string;
  usuario_id?: string | null;
  usuario_nome?: string | null;
  dados_antes: Json | null;
  dados_depois: Json | null;
  criado_em: string;
}

export type TabelaFk =
  | "condicoes_pagamento" | "fornecedores" | "centros_custo" | "insumos" | "usuarios";

type TipoCampo = "texto" | "dinheiro" | "data" | "datahora" | "situacao" | "booleano" | "fk";
interface MetaCampo { rotulo?: string; tipo?: TipoCampo; oculto?: boolean; fkTabela?: TabelaFk; }

const CAMPOS: Record<string, MetaCampo> = {
  status: { rotulo: "Situação", tipo: "situacao" },
  valor_total: { rotulo: "Valor total", tipo: "dinheiro" },
  valor: { rotulo: "Valor", tipo: "dinheiro" },
  valor_nf: { rotulo: "Valor da NF", tipo: "dinheiro" },
  preco_unitario: { rotulo: "Preço unitário", tipo: "dinheiro" },
  quantidade: { rotulo: "Quantidade", tipo: "texto" },
  condicao_pagamento_id: { rotulo: "Condição de pagamento", tipo: "fk", fkTabela: "condicoes_pagamento" },
  fornecedor_id: { rotulo: "Fornecedor", tipo: "fk", fkTabela: "fornecedores" },
  centro_custo_id: { rotulo: "Centro de custo", tipo: "fk", fkTabela: "centros_custo" },
  insumo_id: { rotulo: "Insumo", tipo: "fk", fkTabela: "insumos" },
  motivo_rejeicao: { rotulo: "Motivo" },
  observacoes: { rotulo: "Observações" },
  numero_nf: { rotulo: "Nota fiscal" },
  data_emissao: { rotulo: "Data de emissão", tipo: "data" },
  data_recebimento: { rotulo: "Data do recebimento", tipo: "data" },
  data_vencimento: { rotulo: "Vencimento", tipo: "data" },
  aprovado_por: { oculto: true }, aprovado_em: { oculto: true },
  created_by: { oculto: true }, updated_at: { oculto: true }, created_at: { oculto: true },
};

/** Campos FK -> tabela, exportado para o resolvedor de nomes (server) reusar. */
export const CAMPOS_FK: Record<string, TabelaFk> = Object.fromEntries(
  Object.entries(CAMPOS)
    .filter(([, m]) => m.fkTabela)
    .map(([k, m]) => [k, m.fkTabela as TabelaFk]),
);

const SITUACOES: Record<string, string> = {
  rascunho: "Rascunho", pendente_aprovacao: "Pendente de aprovação",
  aprovado: "Aprovado", rejeitado: "Rejeitado", cancelado: "Cancelado",
  recebido: "Recebido", recebido_parcial: "Recebido parcial",
  finalizada: "Finalizada", pago: "Pago", pendente: "Pendente",
  previsto: "Previsto", a_pagar: "A pagar", a_receber: "A receber",
};

type ObjetoJson = { [chave: string]: Json | undefined };
function ehObjetoJson(v: Json | null): v is ObjetoJson {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

function rotuloCampo(campo: string): string {
  return CAMPOS[campo]?.rotulo ?? campo.replace(/_/g, " ");
}

/** Formata o valor NOVO conforme o tipo do campo. Devolve null se deve ocultar. */
function valorFormatado(campo: string, valor: Json | undefined, nomes: Record<string, string>): string | null {
  const meta = CAMPOS[campo] ?? {};
  if (meta.oculto) return null;
  if (meta.tipo === "fk") {
    if (typeof valor !== "string" || !valor) return null; // vazio de FK: ocultar
    const nome = nomes[valor];
    return nome ?? null; // sem nome resolvido: ocultar (não mostra uuid cru)
  }
  if (valor === null || valor === undefined) return "—";
  switch (meta.tipo) {
    case "dinheiro": return formatarBRL(Number(valor));
    case "data": return formatarData(String(valor));
    case "datahora": return formatarDataHora(String(valor));
    case "situacao": return SITUACOES[String(valor)] ?? String(valor);
    case "booleano": return valor ? "sim" : "não";
    default:
      if (typeof valor === "object") return JSON.stringify(valor);
      return String(valor);
  }
}

const TIPO_POR_ACAO: Record<string, TipoEventoTrilha> = {
  INSERT: "criacao", UPDATE: "edicao", DELETE: "exclusao",
};

function participio(base: string, genero: "f" | "m"): string {
  // base no feminino terminando em "a": "criada" -> "criado"
  return genero === "m" ? base.replace(/a$/, "o") : base;
}

function tituloEvento(
  acao: string, antes: ObjetoJson | null, depois: ObjetoJson | null,
  entidade: string, genero: "f" | "m",
): { titulo: string; tipo: TipoEventoTrilha } {
  const A = acao.toUpperCase();
  if (A === "INSERT") return { titulo: `${entidade} ${participio("criada", genero)}`, tipo: "criacao" };
  if (A === "DELETE") return { titulo: `${entidade} ${participio("excluída", genero)}`, tipo: "exclusao" };
  const antesStatus = antes && typeof antes.status === "string" ? antes.status : undefined;
  const depoisStatus = depois && typeof depois.status === "string" ? depois.status : undefined;
  if (depoisStatus && depoisStatus !== antesStatus) {
    switch (depoisStatus) {
      case "pendente_aprovacao":
        return antesStatus === "aprovado"
          ? { titulo: "Aprovação revertida", tipo: "desaprovacao" }
          : { titulo: `${participio("Enviada", genero)} para aprovação`, tipo: "edicao" };
      case "aprovado": return { titulo: participio("Aprovada", genero), tipo: "aprovacao" };
      case "rejeitado": return { titulo: participio("Rejeitada", genero), tipo: "rejeicao" };
      case "cancelado": return { titulo: participio("Cancelada", genero), tipo: "rejeicao" };
      case "recebido": return { titulo: participio("Recebida", genero), tipo: "aprovacao" };
      case "recebido_parcial": return { titulo: "Recebimento parcial", tipo: "edicao" };
      case "finalizada": return { titulo: participio("Finalizada", genero), tipo: "aprovacao" };
      case "rascunho": return { titulo: "Voltou para rascunho", tipo: "edicao" };
      default: return { titulo: `Situação: ${SITUACOES[depoisStatus] ?? depoisStatus}`, tipo: "edicao" };
    }
  }
  return { titulo: "Dados alterados", tipo: "edicao" };
}

/** Linhas "Rótulo: valor novo" dos campos que mudaram (só valor novo, sem "→"). */
function descricaoDasMudancas(
  antes: ObjetoJson | null, depois: ObjetoJson | null, nomes: Record<string, string>,
): string | undefined {
  if (!ehObjetoJson(depois)) return undefined;
  const antesObj = ehObjetoJson(antes) ? antes : {};
  const linhas: string[] = [];
  for (const campo of Object.keys(depois)) {
    if (campo === "status") continue; // já vira título
    if (JSON.stringify(antesObj[campo] ?? null) === JSON.stringify(depois[campo] ?? null)) continue;
    const v = valorFormatado(campo, depois[campo], nomes);
    if (v === null) continue;
    linhas.push(`${rotuloCampo(campo)}: ${v}`);
  }
  return linhas.length ? linhas.slice(0, 6).join(" · ") : undefined;
}

export function eventosDoAuditLog(
  registros: RegistroAuditLog[],
  opcoes?: { nomes?: Record<string, string>; entidade?: string; genero?: "f" | "m" },
): EventoTrilha[] {
  const nomes = opcoes?.nomes ?? {};
  const entidade = opcoes?.entidade ?? "Registro";
  const genero = opcoes?.genero ?? "f";
  return registros.map((r) => {
    const antes = ehObjetoJson(r.dados_antes) ? r.dados_antes : null;
    const depois = ehObjetoJson(r.dados_depois) ? r.dados_depois : null;
    const { titulo, tipo } = tituloEvento(r.acao, antes, depois, entidade, genero);
    const acao = r.acao.toUpperCase();
    // Em INSERT/DELETE a descrição por campo polui; mantemos só no UPDATE.
    const descricao = acao === "UPDATE" ? descricaoDasMudancas(antes, depois, nomes) : undefined;
    return {
      id: String(r.id),
      data: r.criado_em,
      titulo,
      descricao,
      usuario: r.usuario_nome ?? undefined,
      tipo: TIPO_POR_ACAO[acao] ?? tipo,
    };
  });
}
```
Nota: `tipo` do ponto colorido prioriza o TIPO_POR_ACAO só para INSERT/DELETE; para UPDATE usa o `tipo` semântico (aprovacao/rejeicao/desaprovacao/edicao). Ajustar se o teste de cor pedir — mas os testes acima focam em titulo/descricao. (Simplificar: usar sempre o `tipo` de `tituloEvento`, que já cobre criacao/exclusao/aprovacao/rejeicao/edicao. Preferir isso: remover `TIPO_POR_ACAO` e usar `tipo` direto.)

- [ ] **Step 4: Rodar teste (passa) + portão**

Run: `npm test -- --run src/components/canonicos/trilha-helpers.test.ts` → PASS.
Run: `npm run typecheck && npm run lint`.

- [ ] **Step 5: Commit**

```bash
git add src/components/canonicos/trilha-helpers.ts src/components/canonicos/trilha-helpers.test.ts
git commit -m "feat(trilha): título por ação + rótulos amigáveis + só valor novo + FK por nome"
```

---

## Task 2: Resolvedor de nomes (server) + ligar nas 3 telas de detalhe

**Files:**
- Create: `src/lib/trilha-nomes.ts`
- Modify: `src/modules/compras/ordens/queries.ts`, `src/modules/compras/cotacoes/queries.ts`, `src/modules/financeiro/lancamentos/queries.ts`

**Interfaces:**
- Consumes: `CAMPOS_FK`, `RegistroAuditLog` (Task 1).
- Produces: `resolverNomesAuditLog(supabase: SupabaseClient, registros: RegistroAuditLog[]): Promise<Record<string,string>>`.

- [ ] **Step 1: Implementar o resolvedor**

`src/lib/trilha-nomes.ts` (server; usa o client Supabase da request):
```ts
import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { CAMPOS_FK, type RegistroAuditLog, type TabelaFk } from "@/components/canonicos/trilha-helpers";

const COLUNA_NOME: Record<TabelaFk, string> = {
  condicoes_pagamento: "descricao",
  fornecedores: "razao_social",
  centros_custo: "nome",
  insumos: "nome",
  usuarios: "nome",
};

function coletarIdsPorTabela(registros: RegistroAuditLog[]): Map<TabelaFk, Set<string>> {
  const mapa = new Map<TabelaFk, Set<string>>();
  for (const r of registros) {
    for (const dados of [r.dados_antes, r.dados_depois]) {
      if (!dados || typeof dados !== "object" || Array.isArray(dados)) continue;
      for (const [campo, tabela] of Object.entries(CAMPOS_FK)) {
        const v = (dados as Record<string, unknown>)[campo];
        if (typeof v === "string" && v) {
          if (!mapa.has(tabela)) mapa.set(tabela, new Set());
          mapa.get(tabela)!.add(v);
        }
      }
    }
  }
  return mapa;
}

/** Resolve os UUIDs de FK presentes nos registros para nome (uuid -> nome). */
export async function resolverNomesAuditLog(
  supabase: SupabaseClient,
  registros: RegistroAuditLog[],
): Promise<Record<string, string>> {
  const porTabela = coletarIdsPorTabela(registros);
  const nomes: Record<string, string> = {};
  for (const [tabela, ids] of porTabela) {
    const coluna = COLUNA_NOME[tabela];
    const { data } = await supabase.from(tabela).select(`id, ${coluna}`).in("id", [...ids]);
    for (const linha of data ?? []) {
      const id = (linha as Record<string, unknown>).id as string;
      const nome = (linha as Record<string, unknown>)[coluna];
      if (id && typeof nome === "string") nomes[id] = nome;
    }
  }
  return nomes;
}
```
Obs.: se `fornecedores` tiver `nome_fantasia` melhor que `razao_social`, ajustar o select para trazer os dois e preferir `nome_fantasia ?? razao_social` (conferir o schema real de `fornecedores` antes).

- [ ] **Step 2: Ligar nas 3 queries de detalhe**

Em cada uma (`ordens`, `cotacoes`, `lancamentos`), onde hoje chama `eventosDoAuditLog(registros)`, passar a:
```ts
const nomes = await resolverNomesAuditLog(supabase, registros);
const trilha = eventosDoAuditLog(registros, { nomes, entidade: "Ordem", genero: "f" });
```
Entidade/genero por módulo: Ordem/"f", Cotação/"f", Lançamento/"m". Ler cada query antes (o `supabase` client já existe no escopo dela).

- [ ] **Step 3: Portão + commit**

Run: `npm run typecheck && npm run lint && npm test -- --run && npm run build`.
```bash
git add src/lib/trilha-nomes.ts src/modules/compras/ordens/queries.ts src/modules/compras/cotacoes/queries.ts src/modules/financeiro/lancamentos/queries.ts
git commit -m "feat(trilha): resolve UUID de FK para nome nas trilhas de OC, cotação e lançamento"
```

---

## Task 3: Tela global de Auditoria herda rótulos/formatação

**Files:**
- Modify: `src/modules/administracao/auditoria/queries.ts` e/ou `src/modules/administracao/auditoria/components/diff-auditoria.tsx` (ler antes pra ver como renderiza)

**Interfaces:**
- Consumes: helper melhorado (Task 1) + resolvedor (Task 2).

- [ ] **Step 1: Ler como a auditoria global renderiza hoje**

`sed -n` em `auditoria/queries.ts` e `diff-auditoria.tsx`. Se ela usa `eventosDoAuditLog`, já herda a melhoria — só passar `nomes` (via `resolverNomesAuditLog`) e, se a linha souber a tabela/entidade, um `entidade` melhor. Se `diff-auditoria.tsx` renderiza o diff cru por conta própria (before/after), aplicar os mesmos rótulos amigáveis e formatação (reusar o mapa `CAMPOS`/`SITUACOES` — se preciso, exportar do helper) e a resolução de nomes onde os campos batem com o mapa; campos fora do mapa mantêm o fallback legível (nome do campo, valor). Não é objetivo resolver 100% das tabelas aqui.

- [ ] **Step 2: Aplicar e conferir**

Aplicar a melhoria coerente com o que o Step 1 achou. Sem regressão: a auditoria global continua mostrando tudo, só mais legível.

- [ ] **Step 3: Portão + commit**

Run: `npm run typecheck && npm run lint && npm test -- --run && npm run build`.
```bash
git add src/modules/administracao/auditoria
git commit -m "feat(auditoria): tela global usa rótulos amigáveis e nomes na trilha"
```

---

## Task 4: Verificação final + preview

- [ ] **Step 1: Portão final** (limpar `.next` dup) `npm run typecheck && npm run lint && npm test -- --run && npm run build` — tudo verde.
- [ ] **Step 2: Preview** push da branch; conferir a trilha da OC do QA legível (Ordem criada / Enviada para aprovação / Aprovada / Aprovação revertida / Cancelada · Motivo / Condição de pagamento: À vista).
- [ ] **Step 3: Merge após OK do Tiago** `git checkout main && git merge --no-ff feat-trilha-legivel ... && git push origin main`.

---

## Self-review (feito ao escrever)

- **Cobertura do spec:** título por ação + entidade/gênero (T1); rótulos + formatação + só valor novo + situação em palavras + ocultar ruído (T1); FK→nome via resolvedor (T1 consome `nomes`, T2 resolve+liga); tela global (T3); preview (T4). Coberto.
- **Placeholders:** T3 tem um "ler antes" legítimo (a auditoria global pode renderizar diff próprio); a transformação está especificada condicionalmente. Sem TODO solto. `razao_social` vs `nome_fantasia` sinalizado pra conferir no schema.
- **Consistência de tipos:** `eventosDoAuditLog(registros, {nomes,entidade,genero})` e `CAMPOS_FK`/`TabelaFk` definidos na T1 e consumidos igual na T2; `resolverNomesAuditLog(supabase, registros)` mesma assinatura T2→uso.
