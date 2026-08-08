# Bloco 8a — Aprovação da folha + folha vira lançamento no Financeiro — Plano

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A folha passa a ter aprovação do Admin, e a aprovação é o que cria os lançamentos a pagar no Financeiro (salário por colaborador, guias por grupo de recolhimento), com o adiantamento também virando lançamento.

**Architecture:** Máquina de status `rascunho > pendente_aprovacao > aprovado` em `folhas`, guardada por trigger (cópia estrutural de `fn_guarda_status_oc`). As transições sem efeito financeiro são UPDATE direto pela RLS; as duas que mexem em dinheiro são RPC `SECURITY DEFINER` (`fn_aprovar_folha`, `fn_desaprovar_folha`). A geração de lançamento espelha ponta a ponta a `fn_fechar_diarias`, que já é o padrão "RH vira Financeiro" do projeto: `lancamentos` + `lancamento_parcelas` + `lancamento_rateios`, com `fn_exigir_competencia_aberta` antes de inserir e o id gravado de volta na origem.

**Tech Stack:** Next.js 15 App Router, TypeScript strict, Supabase Postgres 17 (migrations via MCP `apply_migration`), Zod, React Hook Form, Vitest, Tailwind v4 + shadcn/ui, canônicos EMT.

**Spec:** `docs/superpowers/specs/2026-08-08-rh-folha-financeiro-design.md` (commit b32974b, aprovada pelo Tiago em 08/08/2026).

## Global Constraints

- **Projeto Supabase vivo:** `vsesgvqjgqpapoxhnbqx`. Migration **só** por MCP `apply_migration`. **`supabase db push` é PROIBIDO** (`docs/decisoes.md`, 2026-08-06: é destrutivo aqui, não é preferência).
- **Toda migration aplicada também vira arquivo em `supabase/migrations/`**, nomeado com a versão exata que o `apply_migration` gravou no ledger do banco (`supabase/migrations/<versao>_<nome>.sql`), com o mesmo SQL. A regra de ouro 5 do `CLAUDE.md` pede as duas coisas: versionada no repo E aplicada pelo MCP. Aplicar sem versionar é o que produziu as 164 versões que existem só no banco. O arquivo é rastro e revisão, nunca fonte de reaplicação: `db push` segue proibido.
- **`grant update` em tabela existente é por coluna, nunca a tabela inteira.** O precedente do projeto é `rh_pontos` (`supabase/migrations/20260621110001_rh_espinha_estrutura.sql:41-42`): `grant update (encarregado_id, observacao)`. Valor consolidado e rastro de aprovação só se escrevem por função definer, então não entram no grant. Grant de tabela inteira numa tabela cujos totais viram dinheiro é buraco de alçada, mesmo com policy e trigger no lugar.
- **O ledger de migrations não é fonte de verdade sobre o schema.** Antes de alterar função, policy ou grant, ler a definição real no banco (`pg_get_functiondef`, `information_schema`), nunca o `.sql` do repo.
- **RLS em 100% das tabelas, grants explícitos.** Tabela nova não herda privilégio: a migration declara `grant` para `authenticated` só do que as policies permitem. Sem policy de DELETE = sem grant de DELETE. `anon` nunca recebe nada.
- **Permissão tripla:** RLS no banco (`tem_permissao(recurso, acao)`), checagem na Server Action, UI esconde o que não pode.
- **Dinheiro é `NUMERIC(14,2)`**, quantidade `NUMERIC(14,3)`. Float proibido para valor. Exibição via `MoneyText` com `tabular-nums`.
- **Migration que mexe em privilégio termina com trava `do $$` fail-closed** (padrão de `docs/decisoes.md`): a trava estoura exceção se sobrar privilégio, exceção aborta a transação, transação abortada não grava versão no ledger. Versão no ledger = trava passou.
- **Toda tabela transacional tem trigger de auditoria** gravando em `audit_log`.
- **Componentes canônicos primeiro.** `ApprovalBar`, `StatusBadge`, `Trilha`, `Combobox`, `ComboboxCriavel`, `DataTable`, `MoneyText`, `EmptyState`, `ConfirmDialog`. Se um canônico não cobre, evolua o canônico, não duplique.
- **Nenhum valor fiscal semeado.** Nenhuma migration deste plano insere alíquota, faixa, grupo de recolhimento ou dia de vencimento. Config vazia tem que produzir zero guia, nunca um número inventado.
- **`aprovado` no masculino** em `folhas.status`: é o valor de `StatusPadrao` (`src/components/canonicos/status-badge.tsx`) e o `ApprovalBar` compara com `'pendente_aprovacao'` e `'aprovado'` literais. Rótulo feminino sai do prop `rotulo` do `StatusBadge`.
- **Nomes:** banco em português snake_case sem acento; rotas kebab-case; componentes PascalCase; variáveis de domínio em português.
- **Definição de pronto de cada task:** `npx tsc --noEmit` limpo, `npm run lint` sem erro, `npx vitest run` verde, sem `any` novo, sem `console.log`.
- **iCloud duplica arquivos.** Antes de rodar `tsc`, apagar duplicatas: `find src supabase -name "* [0-9].*" -delete`. Elas quebram o typecheck e não estão no git.
- **Commits em português**, imperativo, escopo entre parênteses. Terminar com `Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>`.
- **Branch `feat-rh-folha-financeiro`, sem git worktree.** O erp-emt roda no diretório principal (worktree foi removido em 07/08/2026 porque travava o merge). Feature vai em branch e faz merge em `main` no fim.
- **As funções de dinheiro nascem em duas etapas.** `fn_aprovar_folha` e `fn_desaprovar_folha` são criadas na Task 1 fazendo **só a transição de status**, e as Tasks 4 e 5 as substituem por `create or replace` acrescentando o efeito financeiro. Sem isso a Task 2 chamaria uma RPC que não existe em `database.types.ts` e o `tsc` dela quebraria.

## Arquivos: o que cada um passa a ser responsável por

**Banco (migrations, uma por task que toca schema):**
- máquina de status de `folhas` + trigger de guarda + seed de permissão (Task 1)
- config de grupo de recolhimento em `folha_encargos` / `folha_parametros` / `folha_item_encargos` (Task 3)
- `folha_guias`, `folha_itens.lancamento_id`, origens novas, `fn_vencimento_folha`, `fn_aprovar_folha` com dinheiro (Task 4)
- `fn_desaprovar_folha` com as travas (Task 5)
- `rh_adiantamentos.lancamento_id` + `fn_registrar_adiantamento` (Task 6)

**TypeScript:**
- `src/config/recursos.ts` — `rh.folha` ganha `aprovar` e `desaprovar` (Task 1)
- `src/modules/rh/_shared/formato.ts` — `StatusFolha` e `STATUS_FOLHA` com os três status (Task 1)
- `src/modules/rh/folha/vencimento.ts` (novo) — cálculo puro do vencimento, espelho da fn SQL (Task 4)
- `src/modules/rh/folha/actions.ts` — sai fechar/reabrir, entram enviar/aprovar/rejeitar/desaprovar (Task 2)
- `src/modules/rh/folha/queries.ts` — status novo, `aprovadoPor`/`aprovadoEm`/`motivoRejeicao`, lançamentos gerados (Tasks 2 e 7)
- `src/modules/rh/folha/components/folha-detalhe.tsx` — `ApprovalBar` + `Trilha` + seção de lançamentos (Tasks 2 e 7)
- `src/modules/rh/encargos/*` — campo grupo de recolhimento (Task 3)
- `src/modules/rh/parametros-folha/*` — dia de pagamento, dia das guias, grupos dos retidos (Task 3)
- `src/modules/rh/adiantamentos/*` — criação via RPC + trava + coluna na tabela (Task 6)

---

### Task 1: Máquina de status da folha (sem dinheiro)

**Modelo sugerido:** opus (DDL + trigger de guarda + seed de permissão).

**Files:**
- Migration nova (via MCP `apply_migration`, nome `folha_maquina_status`)
- Modify: `src/config/recursos.ts` (bloco `rh.folha`, hoje `acoes: ["ver", "criar", "editar"]`)
- Modify: `src/modules/rh/_shared/formato.ts:30-33` (`STATUS_FOLHA`)
- Test: `src/modules/rh/rh-schemas.test.ts` (bloco novo de status da folha)

**Interfaces:**
- Consumes: `public.tem_permissao(recurso, acao)`, padrão de `fn_guarda_status_oc`.
- Produces: `folhas.status in ('rascunho','pendente_aprovacao','aprovado')`; colunas `folhas.aprovado_por uuid`, `folhas.aprovado_em timestamptz`, `folhas.motivo_rejeicao text`; trigger `fn_guarda_status_folha`; ações `rh.folha:aprovar` e `rh.folha:desaprovar`; `fn_aprovar_folha(p_folha uuid)` e `fn_desaprovar_folha(p_folha uuid, p_motivo text)` fazendo só a transição de status (as Tasks 4 e 5 acrescentam o dinheiro por `create or replace`, sem mudar assinatura); tipo TS `StatusFolha = "rascunho" | "pendente_aprovacao" | "aprovado"`.

- [ ] **Step 1: Ler o estado vivo antes de escrever a migration**

Rodar via MCP `execute_sql` no projeto `vsesgvqjgqpapoxhnbqx`:

```sql
select pg_get_constraintdef(con.oid) as status_check
from pg_constraint con join pg_class c on c.oid = con.conrelid
where c.relname = 'folhas' and con.conname = 'folhas_status_check';

select count(*) as folhas_existentes, count(*) filter (where status <> 'rascunho') as nao_rascunho
from public.folhas;

select tgname, pg_get_triggerdef(t.oid) as def
from pg_trigger t join pg_class c on c.oid = t.tgrelid
where c.relname = 'folhas' and not t.tgisinternal;

select pg_get_functiondef(p.oid) as guarda_oc
from pg_proc p join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public' and p.proname = 'fn_guarda_status_oc';
```

Esperado: check com `('rascunho','fechada')`, `folhas_existentes = 0`, triggers de auditoria/updated_at, e a definição da guarda da OC para copiar a estrutura. **Se `folhas_existentes > 0`, PARAR e reportar:** o plano assume zero folha para trocar o check sem migrar dado.

- [ ] **Step 2: Aplicar a migration da máquina de status**

Via MCP `apply_migration`, nome `folha_maquina_status`:

```sql
-- Colunas de rastro da aprovação. aprovado_por/aprovado_em espelham rh_pontos;
-- motivo_rejeicao espelha ordens_compra (o trilha-helpers.ts já rotula os três).
alter table public.folhas
  add column if not exists aprovado_por uuid references public.usuarios(id),
  add column if not exists aprovado_em timestamptz,
  add column if not exists motivo_rejeicao text;

-- Status novo. 'fechada' sai: dois nomes para o mesmo estado é dívida.
-- Seguro sem migrar dado porque a tabela está vazia (conferido no Step 1).
alter table public.folhas drop constraint folhas_status_check;
alter table public.folhas add constraint folhas_status_check
  check (status in ('rascunho', 'pendente_aprovacao', 'aprovado'));

-- data_fechamento sai: aprovado_em passa a ser a única data de conclusão.
alter table public.folhas drop column data_fechamento;

-- Guarda de transição: cópia estrutural de fn_guarda_status_oc.
create or replace function public.fn_guarda_status_folha()
returns trigger
language plpgsql
set search_path to ''
as $function$
begin
  if new.status is not distinct from old.status then
    return new;
  end if;

  -- Dentro das RPCs (security definer, dono postgres) current_user deixa de ser
  -- 'authenticated'. Elas sao a maquina de status e ja checam tudo, entao passam.
  if current_user not in ('authenticated', 'anon') then
    return new;
  end if;

  -- Enviar para aprovacao: exige a mesma permissao da Server Action, e folha
  -- vazia nao vai para aprovacao (a checagem vivia na fn_fechar_folha).
  if old.status = 'rascunho' and new.status = 'pendente_aprovacao'
     and public.tem_permissao('rh.folha', 'editar') then
    if not exists (select 1 from public.folha_itens where folha_id = new.id) then
      raise exception 'A folha de %/% esta vazia: gere a folha antes de enviar para aprovacao.',
        to_char(new.competencia, 'MM'), to_char(new.competencia, 'YYYY');
    end if;
    return new;
  end if;

  -- Rejeitar: volta para rascunho com motivo. A folha e recalculavel, entao nao
  -- existe status 'rejeitado' aqui (seria beco sem saida).
  if old.status = 'pendente_aprovacao' and new.status = 'rascunho'
     and public.tem_permissao('rh.folha', 'aprovar') then
    return new;
  end if;

  if old.status = 'aprovado' then
    raise exception 'Para desfazer a aprovacao da folha de %/% use a acao Desaprovar: ela exige motivo, recusa se houver pagamento aprovado, pago ou conciliado, e apaga os lancamentos gerados. Mudar o status direto deixaria os lancamentos pendurados.',
      to_char(new.competencia, 'MM'), to_char(new.competencia, 'YYYY');
  end if;

  raise exception 'Mudanca de status nao permitida na folha de %/%: de "%" para "%". Use as acoes da folha (enviar para aprovacao, aprovar, rejeitar, desaprovar), que sao o unico caminho com permissao, motivo e efeito financeiro.',
    to_char(new.competencia, 'MM'), to_char(new.competencia, 'YYYY'), old.status, new.status;
end;
$function$;

drop trigger if exists trg_guarda_status_folha on public.folhas;
create trigger trg_guarda_status_folha
  before update of status on public.folhas
  for each row execute function public.fn_guarda_status_folha();

-- As duas funções antigas SAEM nesta migration: elas escrevem 'fechada', que o
-- check acima não aceita mais, e ficariam no banco como armadilha.
-- A guarda de status da fn_gerar_folha ("só gera em rascunho") entra na Task 4
-- Step 8, junto com a reescrita dela para o snapshot do grupo.
drop function public.fn_fechar_folha(uuid);
drop function public.fn_reabrir_folha(uuid);

-- As duas RPCs de aprovação nascem aqui fazendo SÓ a transição de status, para
-- que existam em database.types.ts quando a Task 2 escrever as actions. As
-- Tasks 4 e 5 substituem por create or replace acrescentando o dinheiro.
create or replace function public.fn_aprovar_folha(p_folha uuid)
returns void
language plpgsql
security definer
set search_path to ''
as $function$
declare v_status text; v_comp date; v_uid uuid := (select auth.uid());
begin
  if not public.tem_permissao('rh.folha', 'aprovar') then
    raise exception 'Sem permissao para aprovar a folha';
  end if;

  select status, competencia into v_status, v_comp
  from public.folhas where id = p_folha for update;

  if v_status is null then raise exception 'Folha nao encontrada'; end if;
  if v_status <> 'pendente_aprovacao' then
    raise exception 'A folha de %/% esta em "%": só da para aprovar o que esta pendente de aprovacao.',
      to_char(v_comp, 'MM'), to_char(v_comp, 'YYYY'), v_status;
  end if;
  if not exists (select 1 from public.folha_itens where folha_id = p_folha) then
    raise exception 'A folha esta vazia';
  end if;

  update public.folhas
  set status = 'aprovado', aprovado_por = v_uid, aprovado_em = now(), motivo_rejeicao = null
  where id = p_folha;
end;
$function$;

create or replace function public.fn_desaprovar_folha(p_folha uuid, p_motivo text)
returns void
language plpgsql
security definer
set search_path to ''
as $function$
declare v_status text; v_comp date;
begin
  if not public.tem_permissao('rh.folha', 'desaprovar') then
    raise exception 'Sem permissao para desaprovar a folha';
  end if;
  if p_motivo is null or length(btrim(p_motivo)) = 0 then
    raise exception 'Informe o motivo da desaprovacao';
  end if;

  select status, competencia into v_status, v_comp
  from public.folhas where id = p_folha for update;

  if v_status is null then raise exception 'Folha nao encontrada'; end if;
  if v_status <> 'aprovado' then
    raise exception 'A folha de %/% esta em "%": só da para desaprovar folha aprovada.',
      to_char(v_comp, 'MM'), to_char(v_comp, 'YYYY'), v_status;
  end if;

  update public.folhas
  set status = 'rascunho', aprovado_por = null, aprovado_em = null,
      motivo_rejeicao = btrim(p_motivo)
  where id = p_folha;
end;
$function$;

revoke all on function public.fn_aprovar_folha(uuid) from public;
revoke all on function public.fn_desaprovar_folha(uuid, text) from public;
grant execute on function public.fn_aprovar_folha(uuid) to authenticated;
grant execute on function public.fn_desaprovar_folha(uuid, text) to authenticated;
```

- [ ] **Step 3: Conferir no banco que a migration pegou**

```sql
select pg_get_constraintdef(oid) from pg_constraint where conname = 'folhas_status_check';
select column_name from information_schema.columns
where table_schema='public' and table_name='folhas'
  and column_name in ('aprovado_por','aprovado_em','motivo_rejeicao','data_fechamento');
select tgname from pg_trigger t join pg_class c on c.oid=t.tgrelid
where c.relname='folhas' and tgname='trg_guarda_status_folha';
select proname from pg_proc p join pg_namespace n on n.oid=p.pronamespace
where n.nspname='public' and proname in ('fn_fechar_folha','fn_reabrir_folha');

select proname, pg_get_function_identity_arguments(p.oid) as args
from pg_proc p join pg_namespace n on n.oid=p.pronamespace
where n.nspname='public' and proname in ('fn_aprovar_folha','fn_desaprovar_folha');
```

Esperado: check com os três status; três colunas presentes e `data_fechamento` ausente; trigger presente; **zero linha** na consulta das funções antigas; e as duas novas presentes com assinaturas `p_folha uuid` e `p_folha uuid, p_motivo text` (as Tasks 4 e 5 dependem dessas assinaturas exatas).

- [ ] **Step 4: Semear as permissões novas (migration separada, com trava fail-closed)**

Via `apply_migration`, nome `folha_permissao_aprovar`. Antes de escrever, ler como o Bloco 7 semeou (`select * from perfil_permissoes where recurso='rh.folha'`) e espelhar. A migration insere `aprovar` e `desaprovar` de `rh.folha` **só** para o perfil Admin e para os usuários que têm permissão direta de Admin, de forma idempotente (`on conflict do nothing`), e termina com:

```sql
do $$
declare v_vazado integer;
begin
  -- Fail-closed: nenhum perfil fora do Admin pode ter aprovar/desaprovar de rh.folha.
  select count(*) into v_vazado
  from public.perfil_permissoes pp
  join public.perfis p on p.id = pp.perfil_id
  where pp.recurso = 'rh.folha' and pp.acao in ('aprovar','desaprovar')
    and p.nome <> 'Admin';
  if v_vazado > 0 then
    raise exception 'Seed vazou aprovar/desaprovar de rh.folha para % perfil(is) fora do Admin', v_vazado;
  end if;
end $$;
```

- [ ] **Step 5: Conferir o seed no banco**

```sql
select p.nome, pp.acao from public.perfil_permissoes pp
join public.perfis p on p.id = pp.perfil_id
where pp.recurso = 'rh.folha' order by p.nome, pp.acao;
```

Esperado: Admin com ver/criar/editar/aprovar/desaprovar; RH com ver/criar/editar e **sem** aprovar/desaprovar; Gestor só ver.

- [ ] **Step 6: Escrever o teste do domínio de status (falha primeiro)**

Em `src/modules/rh/rh-schemas.test.ts`, adicionar:

```ts
import { STATUS_FOLHA, type StatusFolha } from "@/modules/rh/_shared/formato";

describe("status da folha", () => {
  it("tem os três status da máquina de aprovação e não tem 'fechada'", () => {
    expect(Object.keys(STATUS_FOLHA).sort()).toEqual([
      "aprovado",
      "pendente_aprovacao",
      "rascunho",
    ]);
  });

  it("usa 'aprovado' no masculino para casar com o StatusPadrao canônico", () => {
    // O ApprovalBar compara com 'aprovado' literal: 'aprovada' sumiria com o
    // botão de desaprovar.
    const status: StatusFolha = "aprovado";
    expect(STATUS_FOLHA[status].badge).toBe("aprovado");
  });

  it("mostra rótulo feminino na UI sem mudar o valor do banco", () => {
    expect(STATUS_FOLHA.aprovado.rotulo).toBe("Aprovada");
    expect(STATUS_FOLHA.pendente_aprovacao.rotulo).toBe("Pendente de aprovação");
  });
});
```

- [ ] **Step 7: Rodar e ver falhar**

`npx vitest run src/modules/rh/rh-schemas.test.ts`
Esperado: FAIL, porque `STATUS_FOLHA` hoje tem `rascunho` e `fechada`.

- [ ] **Step 8: Atualizar `STATUS_FOLHA` e `StatusFolha`**

Em `src/modules/rh/_shared/formato.ts`, trocar o tipo `StatusFolha` para `"rascunho" | "pendente_aprovacao" | "aprovado"` e o mapa para:

```ts
export const STATUS_FOLHA: Record<StatusFolha, FormatoBadge> = {
  rascunho: { rotulo: "Rascunho", badge: "rascunho" },
  pendente_aprovacao: {
    rotulo: "Pendente de aprovação",
    badge: "pendente_aprovacao",
  },
  aprovado: { rotulo: "Aprovada", badge: "aprovado" },
};
```

- [ ] **Step 9: Registrar as ações novas em `recursos.ts`**

No bloco `rh.folha`, trocar `acoes: ["ver", "criar", "editar"]` por `acoes: CRUD_APROVA` **não serve** (CRUD_APROVA inclui `excluir`, e a folha não tem exclusão). Usar a lista explícita:

```ts
{
  id: "rh.folha",
  nome: "Folha gerencial",
  modulo: "rh",
  rota: "/rh/folha",
  acoes: ["ver", "criar", "editar", "aprovar", "desaprovar"],
},
```

- [ ] **Step 10: Rodar o teste e o typecheck**

```bash
find src supabase -name "* [0-9].*" -delete
npx vitest run src/modules/rh/rh-schemas.test.ts
npx tsc --noEmit
```

Esperado: teste PASS. O `tsc` vai **falhar** em `folha/actions.ts`, `folha/queries.ts` e `folha-detalhe.tsx`, que ainda usam `"fechada"` e `dataFechamento`. Isso é esperado e é o escopo da Task 2. Anotar a lista de erros para a Task 2 consumir.

- [ ] **Step 11: Commit**

```bash
git add src/config/recursos.ts src/modules/rh/_shared/formato.ts src/modules/rh/rh-schemas.test.ts
git commit -m "feat(rh): folha ganha máquina de aprovação no banco (status, guarda e alçada)

Migrations aplicadas no projeto vivo: status rascunho/pendente_aprovacao/aprovado
(fechada sai, data_fechamento sai), colunas de rastro da aprovação, trigger
fn_guarda_status_folha espelhando a guarda da OC, e aprovar/desaprovar semeadas
só no perfil Admin (trava fail-closed no seed).

O tsc segue vermelho na UI da folha de propósito: é a Task 2.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

### Task 2: Fluxo de aprovação em TypeScript (sem dinheiro)

**Modelo sugerido:** sonnet (espelha OC ponta a ponta, sem SQL de dinheiro).

**Files:**
- Modify: `src/modules/rh/folha/actions.ts` (remove `fecharFolha`/`reabrirFolha`, adiciona quatro actions; `gerarPlanilhaFolha:198` usa `folha.status === "fechada"`; `:204` usa `dataFechamento`)
- Modify: `src/modules/rh/folha/queries.ts` (campos novos em `FolhaLista` e `FolhaDetalhe`, remove `dataFechamento`)
- Modify: `src/modules/rh/folha/components/folha-detalhe.tsx` (`ApprovalBar`, `StatusBadge`, botão Enviar, `Trilha`)
- Modify: `src/app/(app)/rh/folha/[id]/page.tsx` (buscar trilha e passar as permissões)
- Modify: `src/app/(app)/rh/folha/page.tsx:63` (texto do empty state fala de "fechadas")
- Test: `src/modules/rh/folha/transicoes.test.ts` (novo)

**Interfaces:**
- Consumes: `StatusFolha` e `STATUS_FOLHA` (Task 1), `ApprovalBar`, `StatusBadge`, `Trilha`, `eventosDaTrilha` de `@/components/canonicos`.
- Produces: actions `enviarFolhaParaAprovacao(id: string): Promise<ResultadoAcao>`, `aprovarFolha(id: string): Promise<ResultadoAcao>`, `rejeitarFolha(id: string, motivo: string): Promise<ResultadoAcao>`, `desaprovarFolha(id: string, motivo: string): Promise<ResultadoAcao>`; função pura `podeTransicionar(de: StatusFolha, para: StatusFolha): boolean`; campos `aprovadoEm: string | null`, `aprovadoPorNome: string | null`, `motivoRejeicao: string | null` em `FolhaDetalhe`.

- [ ] **Step 1: Escrever o teste das transições permitidas (falha primeiro)**

Criar `src/modules/rh/folha/transicoes.test.ts`:

```ts
import { describe, expect, it } from "vitest";

import { podeTransicionar } from "@/modules/rh/folha/transicoes";

describe("podeTransicionar", () => {
  it("permite enviar rascunho para aprovação", () => {
    expect(podeTransicionar("rascunho", "pendente_aprovacao")).toBe(true);
  });

  it("permite aprovar e rejeitar a folha pendente", () => {
    expect(podeTransicionar("pendente_aprovacao", "aprovado")).toBe(true);
    expect(podeTransicionar("pendente_aprovacao", "rascunho")).toBe(true);
  });

  it("permite desaprovar a folha aprovada de volta para rascunho", () => {
    expect(podeTransicionar("aprovado", "rascunho")).toBe(true);
  });

  it("recusa pular a aprovação", () => {
    expect(podeTransicionar("rascunho", "aprovado")).toBe(false);
  });

  it("recusa voltar a folha aprovada para pendente", () => {
    // Não existe esse caminho: desaprovar leva a rascunho, para poder regenerar.
    expect(podeTransicionar("aprovado", "pendente_aprovacao")).toBe(false);
  });

  it("recusa transição para o mesmo status", () => {
    expect(podeTransicionar("rascunho", "rascunho")).toBe(false);
  });
});
```

- [ ] **Step 2: Rodar e ver falhar**

`npx vitest run src/modules/rh/folha/transicoes.test.ts`
Esperado: FAIL com "Cannot find module '@/modules/rh/folha/transicoes'".

- [ ] **Step 3: Escrever `transicoes.ts`**

Criar `src/modules/rh/folha/transicoes.ts`:

```ts
import type { StatusFolha } from "@/modules/rh/_shared/formato";

/**
 * Transições permitidas da folha, espelhando o trigger fn_guarda_status_folha
 * no banco. Fonte única do que a UI habilita; o banco recusa de novo.
 *
 * Desaprovar leva a rascunho (não a pendente_aprovacao como na OC) porque o
 * único motivo de desaprovar uma folha é corrigir os números, e corrigir exige
 * regenerar, que só acontece em rascunho.
 */
const PERMITIDAS: Record<StatusFolha, readonly StatusFolha[]> = {
  rascunho: ["pendente_aprovacao"],
  pendente_aprovacao: ["aprovado", "rascunho"],
  aprovado: ["rascunho"],
};

export function podeTransicionar(de: StatusFolha, para: StatusFolha): boolean {
  return PERMITIDAS[de].includes(para);
}
```

- [ ] **Step 4: Rodar e ver passar**

`npx vitest run src/modules/rh/folha/transicoes.test.ts`
Esperado: PASS, 6 testes.

- [ ] **Step 5: Trocar as actions de fechar/reabrir pelas quatro novas**

Em `src/modules/rh/folha/actions.ts`, remover `fecharFolha` (linhas 93-118) e `reabrirFolha` (120-145) e colocar no lugar:

```ts
/**
 * Envia a folha de rascunho para aprovação. UPDATE direto pela RLS, guardado
 * pelo trigger fn_guarda_status_folha (que também recusa folha vazia). Limpa o
 * motivo da rejeição anterior, igual a OC faz.
 */
export async function enviarFolhaParaAprovacao(
  id: string,
): Promise<ResultadoAcao> {
  if (!(await checarPermissao("editar"))) {
    return { erro: "Sem permissão para enviar a folha para aprovação" };
  }

  const idValido = idSchema.safeParse(id);
  if (!idValido.success) return { erro: "Folha inválida" };

  const supabase = await createClient();
  const { error } = await supabase
    .from("folhas")
    .update({ status: "pendente_aprovacao", motivo_rejeicao: null })
    .eq("id", idValido.data)
    .eq("status", "rascunho");

  if (error) {
    return erroAcao(
      "rh.folha.enviarParaAprovacao",
      error,
      error.message || "Não foi possível enviar a folha para aprovação",
    );
  }

  revalidatePath(ROTA);
  revalidatePath(rotaDetalhe(idValido.data));
  return { ok: true };
}

/**
 * Aprova a folha via fn_aprovar_folha. É a aprovação que gera os lançamentos no
 * Financeiro (salário por colaborador e as guias por grupo de recolhimento), e
 * a mensagem de erro do banco vai direto pro toast.
 */
export async function aprovarFolha(id: string): Promise<ResultadoAcao> {
  if (!(await checarPermissao("aprovar"))) {
    return { erro: "Sem permissão para aprovar a folha" };
  }

  const idValido = idSchema.safeParse(id);
  if (!idValido.success) return { erro: "Folha inválida" };

  const supabase = await createClient();
  const { error } = await supabase.rpc("fn_aprovar_folha", {
    p_folha: idValido.data,
  });

  if (error) {
    return erroAcao(
      "rh.folha.aprovar",
      error,
      error.message || "Não foi possível aprovar a folha",
    );
  }

  revalidatePath(ROTA);
  revalidatePath(rotaDetalhe(idValido.data));
  return { ok: true };
}

/** Rejeita a folha pendente com motivo, devolvendo para rascunho. */
export async function rejeitarFolha(
  id: string,
  motivo: string,
): Promise<ResultadoAcao> {
  if (!(await checarPermissao("aprovar"))) {
    return { erro: "Sem permissão para rejeitar a folha" };
  }

  const idValido = idSchema.safeParse(id);
  if (!idValido.success) return { erro: "Folha inválida" };

  const motivoLimpo = motivo.trim();
  if (motivoLimpo === "") return { erro: "Informe o motivo da rejeição" };

  const supabase = await createClient();
  const { error } = await supabase
    .from("folhas")
    .update({ status: "rascunho", motivo_rejeicao: motivoLimpo })
    .eq("id", idValido.data)
    .eq("status", "pendente_aprovacao");

  if (error) {
    return erroAcao(
      "rh.folha.rejeitar",
      error,
      error.message || "Não foi possível rejeitar a folha",
    );
  }

  revalidatePath(ROTA);
  revalidatePath(rotaDetalhe(idValido.data));
  return { ok: true };
}

/**
 * Desaprova a folha via fn_desaprovar_folha: volta para rascunho e apaga os
 * lançamentos gerados. A RPC recusa se algum pagamento já estiver aprovado,
 * pago ou conciliado, e a mensagem dela vai direto pro toast.
 */
export async function desaprovarFolha(
  id: string,
  motivo: string,
): Promise<ResultadoAcao> {
  if (!(await checarPermissao("desaprovar"))) {
    return { erro: "Sem permissão para desaprovar a folha" };
  }

  const idValido = idSchema.safeParse(id);
  if (!idValido.success) return { erro: "Folha inválida" };

  const motivoLimpo = motivo.trim();
  if (motivoLimpo === "") return { erro: "Informe o motivo da desaprovação" };

  const supabase = await createClient();
  const { error } = await supabase.rpc("fn_desaprovar_folha", {
    p_folha: idValido.data,
    p_motivo: motivoLimpo,
  });

  if (error) {
    return erroAcao(
      "rh.folha.desaprovar",
      error,
      error.message || "Não foi possível desaprovar a folha",
    );
  }

  revalidatePath(ROTA);
  revalidatePath(rotaDetalhe(idValido.data));
  return { ok: true };
}
```

**Nota:** as duas RPCs já existem no banco desde a Task 1, fazendo só a transição de status. Regenerar `src/lib/database.types.ts` via MCP `generate_typescript_types` **no começo desta task**, antes de escrever as actions, senão o `supabase.rpc("fn_aprovar_folha", ...)` não tipa. O efeito financeiro entra nelas nas Tasks 4 e 5, sem mudar assinatura, então a tela não muda depois.

- [ ] **Step 6: Corrigir a planilha, que usa `"fechada"` e `dataFechamento`**

Em `actions.ts`, na `gerarPlanilhaFolha`, trocar a linha 198 e o bloco 204-206:

```ts
worksheet.addRow(["Status", STATUS_FOLHA[folha.status].rotulo]);
worksheet.addRow([
  "Encargos (%)",
  `${formatarQuantidade(folha.encargosPercentual)}%`,
]);
if (folha.aprovadoEm) {
  worksheet.addRow(["Aprovada em", formatarDataHora(folha.aprovadoEm)]);
}
```

Importar `STATUS_FOLHA` de `@/modules/rh/_shared/formato` e `formatarDataHora` de `@/lib/formatadores`. Remover o import de `formatarData` se ficar sem uso (o lint pega).

- [ ] **Step 7: Trocar `dataFechamento` pelos campos de aprovação nas queries**

Em `src/modules/rh/folha/queries.ts`: em `FolhaLista` e `FolhaDetalhe`, remover `dataFechamento` e adicionar

```ts
  /** Quando a folha foi aprovada (ISO), ou null se ainda não foi. */
  aprovadoEm: string | null;
  /** Nome de quem aprovou, via join com usuarios. Null se não aprovada. */
  aprovadoPorNome: string | null;
  /** Motivo da última rejeição, mostrado enquanto a folha volta pra rascunho. */
  motivoRejeicao: string | null;
```

Nos dois `select`, trocar `data_fechamento` por `aprovado_em, motivo_rejeicao, usuarios!folhas_aprovado_por_fkey(nome)` e mapear `aprovadoPorNome: folha.usuarios?.nome ?? null`. Conferir o nome real da FK no banco antes (`select conname from pg_constraint where conrelid='public.folhas'::regclass and contype='f'`) — se o nome divergir, usar o que o banco tem.

- [ ] **Step 8: Colocar o `ApprovalBar` e a `Trilha` no detalhe**

Em `folha-detalhe.tsx`, trocar o `const fechada = folha.status === "fechada"` (linha 100) e o bloco de botões (linha 182) por:

```tsx
<ApprovalBar
  status={folha.status}
  podeAprovar={podeAprovar}
  podeDesaprovar={podeDesaprovar}
  onAprovar={async () => {
    const r = await aprovarFolha(folha.id);
    if ("erro" in r) toast.erro(r.erro);
    else toast.sucesso("Folha aprovada. Lançamentos gerados no Financeiro");
  }}
  onRejeitar={async (motivo) => {
    const r = await rejeitarFolha(folha.id, motivo);
    if ("erro" in r) toast.erro(r.erro);
    else toast.sucesso("Folha rejeitada e devolvida para rascunho");
  }}
  onDesaprovar={async (motivo) => {
    const r = await desaprovarFolha(folha.id, motivo);
    if ("erro" in r) toast.erro(r.erro);
    else toast.sucesso("Aprovação desfeita. Lançamentos apagados");
  }}
/>
```

O botão **Enviar para aprovação** não vive no `ApprovalBar` (o canônico só trata aprovar/rejeitar/desaprovar). Ele vai no cabeçalho da página, visível só quando `folha.status === "rascunho" && podeEditar && folha.itens.length > 0`, com `ConfirmDialog` explicando que a folha vai para o Admin. Espelhar `enviarParaAprovacao` em `src/modules/compras/ordens/components/ordem-detalhe.tsx`.

Adicionar a `Trilha` no fim do detalhe, alimentada pela query de `audit_log` da folha, espelhando o que `ordem-detalhe.tsx` faz. Quando `folha.motivoRejeicao` existir e o status for `rascunho`, mostrar um aviso com o motivo acima da tabela.

- [ ] **Step 9: Passar as permissões novas da página**

Em `src/app/(app)/rh/folha/[id]/page.tsx`, buscar `podeAprovar` e `podeDesaprovar` com o helper de permissão que a página já usa para `podeEditar`, e buscar os eventos de trilha do `audit_log` da tabela `folhas` para aquele id. Espelhar a página de detalhe da OC.

- [ ] **Step 10: Corrigir o texto do empty state da listagem**

`src/app/(app)/rh/folha/page.tsx:63`: `detalhe="Ainda podem ser regeradas ou fechadas"` passa a `detalhe="Ainda podem ser regeradas ou enviadas para aprovação"`.

- [ ] **Step 11: Portão da task**

```bash
find src supabase -name "* [0-9].*" -delete
npx tsc --noEmit && npm run lint && npx vitest run
npm run build
```

Esperado: tudo limpo, build listando `/rh/folha` e `/rh/folha/[id]`.

- [ ] **Step 12: Commit**

```bash
git add -A
git commit -m "feat(rh): folha tem enviar, aprovar, rejeitar e desaprovar na tela

ApprovalBar canônico no detalhe da folha, botão de enviar no cabeçalho, trilha
lendo o audit_log e o motivo da rejeição visível quando a folha volta pra
rascunho. transicoes.ts espelha o trigger do banco e é a fonte do que a UI
habilita.

As RPCs fn_aprovar_folha e fn_desaprovar_folha entram nas Tasks 4 e 5.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

### Task 3: Config de grupo de recolhimento (sem dinheiro)

**Modelo sugerido:** sonnet (espelha cadastro existente, zero cálculo).

**Files:**
- Migration nova: `folha_grupo_recolhimento`
- Modify: `src/modules/rh/encargos/schemas.ts`, `queries.ts`, `actions.ts`, `importacao.ts`, `components/encargo-form-drawer.tsx`, `components/encargos-tabela.tsx`
- Modify: `src/modules/rh/parametros-folha/schemas.ts`, `queries.ts`, `actions.ts`, `components/parametros-form.tsx`
- Test: `src/modules/rh/encargos/schemas.test.ts`, `src/modules/rh/parametros-folha/schemas.test.ts`

**Interfaces:**
- Consumes: `Combobox`/`ComboboxCriavel` canônicos.
- Produces: colunas `folha_encargos.grupo_recolhimento text`, `folha_item_encargos.grupo_recolhimento text`, `folha_parametros.dia_vencimento_guias smallint`, `folha_parametros.grupo_recolhimento_inss text`, `folha_parametros.grupo_recolhimento_irrf text`; query `listarGruposRecolhimento(): Promise<string[]>`.

- [ ] **Step 1: Aplicar a migration da config**

Via `apply_migration`, nome `folha_grupo_recolhimento`:

```sql
-- Grupo de recolhimento do encargo patronal. Nulo = o encargo não vira guia.
alter table public.folha_encargos
  add column if not exists grupo_recolhimento text
    check (grupo_recolhimento is null or length(btrim(grupo_recolhimento)) between 1 and 60);

-- Snapshot do grupo no item: folha_item_encargos não tem FK para folha_encargos
-- (só o nome), então casar por nome quebraria ao renomear um encargo. O grupo é
-- congelado na geração, mesmo princípio que o percentual já usa.
alter table public.folha_item_encargos
  add column if not exists grupo_recolhimento text;

-- Onde cada retido do trabalhador entra, e o dia único das guias.
alter table public.folha_parametros
  add column if not exists grupo_recolhimento_inss text,
  add column if not exists grupo_recolhimento_irrf text,
  add column if not exists dia_vencimento_guias smallint
    check (dia_vencimento_guias is null or dia_vencimento_guias between 1 and 31),
  add column if not exists dia_pagamento_salario smallint
    check (dia_pagamento_salario is null or dia_pagamento_salario between 1 and 31);

-- NENHUM valor semeado: config vazia tem que gerar zero guia.
```

- [ ] **Step 2: Conferir no banco**

```sql
select column_name, data_type from information_schema.columns
where table_schema='public' and table_name in ('folha_encargos','folha_item_encargos','folha_parametros')
  and column_name like '%grupo%' or column_name like 'dia_%'
order by table_name, column_name;

select count(*) as valores_semeados from public.folha_parametros
where dia_pagamento_salario is not null or dia_vencimento_guias is not null;
```

Esperado: as cinco colunas presentes, `valores_semeados = 0`.

- [ ] **Step 3: Escrever o teste do schema do encargo (falha primeiro)**

Em `src/modules/rh/encargos/schemas.test.ts`, adicionar:

```ts
it("aceita encargo sem grupo de recolhimento (não vira guia)", () => {
  const r = encargoSchema.safeParse({
    nome: "FGTS",
    percentual: 8,
    ativo: true,
    grupoRecolhimento: undefined,
  });
  expect(r.success).toBe(true);
});

it("normaliza o grupo cortando espaço nas pontas", () => {
  const r = encargoSchema.safeParse({
    nome: "INSS patronal",
    percentual: 20,
    ativo: true,
    grupoRecolhimento: "  INSS  ",
  });
  expect(r.success && r.data.grupoRecolhimento).toBe("INSS");
});

it("recusa grupo com mais de 60 caracteres", () => {
  const r = encargoSchema.safeParse({
    nome: "RAT",
    percentual: 3,
    ativo: true,
    grupoRecolhimento: "x".repeat(61),
  });
  expect(r.success).toBe(false);
});
```

- [ ] **Step 4: Rodar e ver falhar**

`npx vitest run src/modules/rh/encargos/schemas.test.ts`
Esperado: FAIL (o schema ignora `grupoRecolhimento`, então o terceiro teste passa por acidente e o segundo falha).

- [ ] **Step 5: Adicionar o campo ao schema do encargo**

Em `src/modules/rh/encargos/schemas.ts`, adicionar ao objeto:

```ts
grupoRecolhimento: z
  .string()
  .trim()
  .min(1, { error: "Informe o grupo ou deixe vazio" })
  .max(60, { error: "Máximo de 60 caracteres" })
  .optional(),
```

E no schema de formulário a versão string (`""` vira `undefined` no `...FormParaInput`), espelhando como `observacao` já faz nos cadastros do RH.

- [ ] **Step 6: Rodar e ver passar**

`npx vitest run src/modules/rh/encargos/schemas.test.ts`
Esperado: PASS.

- [ ] **Step 7: Escrever o teste dos parâmetros (falha primeiro)**

Em `src/modules/rh/parametros-folha/schemas.test.ts`:

```ts
it("aceita dia de pagamento e dia das guias entre 1 e 31", () => {
  const r = parametrosSchema.safeParse({
    irrfDeducaoPorDependente: 0,
    irrfDescontoSimplificado: 0,
    fgtsPercentual: 8,
    diaPagamentoSalario: 5,
    diaVencimentoGuias: 20,
    grupoRecolhimentoInss: "INSS",
    grupoRecolhimentoIrrf: "IRRF",
  });
  expect(r.success).toBe(true);
});

it("recusa dia 0 e dia 32", () => {
  for (const dia of [0, 32]) {
    const r = parametrosSchema.safeParse({
      irrfDeducaoPorDependente: 0,
      irrfDescontoSimplificado: 0,
      fgtsPercentual: 8,
      diaPagamentoSalario: dia,
      diaVencimentoGuias: 20,
    });
    expect(r.success).toBe(false);
  }
});

it("aceita config vazia: sem dia e sem grupo (deploy seguro)", () => {
  const r = parametrosSchema.safeParse({
    irrfDeducaoPorDependente: 0,
    irrfDescontoSimplificado: 0,
    fgtsPercentual: 0,
  });
  expect(r.success).toBe(true);
});
```

- [ ] **Step 8: Rodar, ver falhar, implementar, ver passar**

```bash
npx vitest run src/modules/rh/parametros-folha/schemas.test.ts   # FAIL
```

Adicionar ao `parametrosSchema` os cinco campos, os dias como `z.number().int().min(1).max(31).optional()` e os grupos como string opcional trimada. Ajustar `queries.ts` (ler as colunas novas) e `actions.ts` (gravar no upsert do singleton `id = 1`).

```bash
npx vitest run src/modules/rh/parametros-folha/schemas.test.ts   # PASS
```

- [ ] **Step 9: Query dos grupos existentes, para o Combobox não deixar digitar divergente**

Em `src/modules/rh/parametros-folha/queries.ts`:

```ts
/**
 * Grupos de recolhimento distintos já cadastrados nos encargos, para o
 * Combobox dos retidos. O nome do grupo casa por igualdade exata na geração da
 * guia: dois inputs de texto livre transformariam "INSS" e "inss" em duas
 * guias, caladas.
 */
export async function listarGruposRecolhimento(): Promise<string[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("folha_encargos")
    .select("grupo_recolhimento")
    .not("grupo_recolhimento", "is", null);

  if (error) throw new Error("Não foi possível carregar os grupos de recolhimento");

  const grupos = new Set<string>();
  for (const linha of data ?? []) {
    if (linha.grupo_recolhimento) grupos.add(linha.grupo_recolhimento);
  }
  return [...grupos].sort((a, b) => a.localeCompare(b, "pt-BR"));
}
```

- [ ] **Step 10: UI dos dois formulários**

- `encargo-form-drawer.tsx`: campo "Grupo de recolhimento" com `ComboboxCriavel` alimentado por `listarGruposRecolhimento()`, com texto de ajuda "Encargo sem grupo não gera guia no Financeiro". Coluna nova na `encargos-tabela.tsx` mostrando o grupo ou `CelulaVazia`.
- `parametros-form.tsx`: seção nova "Pagamento e recolhimento" com `Dia de pagamento do salário`, `Dia de vencimento das guias` (ambos `InputNumerico`) e os dois `Combobox` de grupo (INSS retido, IRRF retido), cada um com a lista de grupos e a opção de criar. Texto de ajuda deixando claro que sem grupo o retido não vira guia.
- `importacao.ts` do encargo ganha a coluna do grupo no modelo e na validação.

- [ ] **Step 11: Portão da task**

```bash
find src supabase -name "* [0-9].*" -delete
npx tsc --noEmit && npm run lint && npx vitest run && npm run build
```

- [ ] **Step 12: Commit**

```bash
git add -A
git commit -m "feat(rh): encargo tem grupo de recolhimento e a folha tem dia de pagamento

Config editável, sem nenhum valor semeado: encargo sem grupo não vira guia e
config vazia gera zero guia. O grupo entra também no snapshot de
folha_item_encargos, porque a tabela não tem FK pro encargo e casar por nome
quebraria ao renomear. Os grupos dos retidos são Combobox da lista já
cadastrada, não texto livre, senão INSS e inss viravam duas guias.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

### Task 4: A aprovação gera os lançamentos (DINHEIRO)

**Modelo sugerido:** opus. Esta é a task de dinheiro do bloco.

**Files:**
- Migration nova: `folha_gera_lancamento`
- Create: `src/modules/rh/folha/vencimento.ts`, `src/modules/rh/folha/vencimento.test.ts`
- Modify: `fn_gerar_folha` no banco (grava o snapshot do grupo)
- Modify: `fn_excluir_lancamento` no banco (bloqueia as origens novas)

**Interfaces:**
- Consumes: colunas da Task 3, `fn_exigir_competencia_aberta(p_mes, p_entidade, p_id)`, padrão de `fn_fechar_diarias`.
- Produces: `fn_vencimento_folha(p_competencia date, p_dia smallint) returns date`; `fn_aprovar_folha(p_folha uuid) returns void`; tabela `folha_guias`; `folha_itens.lancamento_id`; origens `folha`, `folha_guia`, `adiantamento`; TS `vencimentoFolha(competencia: string, dia: number | null): string | null`.

- [ ] **Step 1: Escrever o teste do vencimento (falha primeiro)**

Criar `src/modules/rh/folha/vencimento.test.ts`:

```ts
import { describe, expect, it } from "vitest";

import { vencimentoFolha } from "@/modules/rh/folha/vencimento";

describe("vencimentoFolha", () => {
  it("vence no dia configurado do mês seguinte à competência", () => {
    expect(vencimentoFolha("2026-08-01", 5)).toBe("2026-09-05");
  });

  it("cai no último dia quando o dia não existe no mês seguinte", () => {
    // Competência de janeiro paga em fevereiro: dia 31 não existe.
    expect(vencimentoFolha("2026-01-01", 31)).toBe("2026-02-28");
  });

  it("respeita fevereiro de ano bissexto", () => {
    expect(vencimentoFolha("2028-01-01", 31)).toBe("2028-02-29");
  });

  it("vira o ano na competência de dezembro", () => {
    expect(vencimentoFolha("2026-12-01", 5)).toBe("2027-01-05");
  });

  it("aceita dia 1", () => {
    expect(vencimentoFolha("2026-08-01", 1)).toBe("2026-09-01");
  });

  it("devolve null sem dia configurado, para o Financeiro preencher", () => {
    expect(vencimentoFolha("2026-08-01", null)).toBeNull();
  });
});
```

- [ ] **Step 2: Rodar e ver falhar**

`npx vitest run src/modules/rh/folha/vencimento.test.ts`
Esperado: FAIL com módulo não encontrado.

- [ ] **Step 3: Escrever `vencimento.ts`**

```ts
/**
 * Vencimento de um lançamento da folha: o dia configurado, no mês seguinte à
 * competência. Dia que não existe no mês cai no último dia (31 em fevereiro
 * vira 28 ou 29). Sem dia configurado devolve null, e o Financeiro preenche.
 *
 * A mesma regra existe em SQL na fn_vencimento_folha: as duas têm que dar o
 * mesmo dia nos casos de borda (mesmo cuidado do Bloco 7 entre a lógica pura e
 * a fn_gerar_folha). Datas em UTC de propósito: são datas civis (yyyy-MM-dd),
 * sem hora, então fuso não entra na conta.
 */
export function vencimentoFolha(
  competencia: string,
  dia: number | null,
): string | null {
  if (dia === null) return null;

  const [ano, mes] = competencia.split("-").map(Number);
  // Date.UTC(ano, mes + 1, 0) = último dia do mês de índice `mes`, que é o mês
  // seguinte à competência (mes vem 1-based do ISO, e o índice é 0-based).
  const ultimoDiaDoMesSeguinte = new Date(Date.UTC(ano, mes + 1, 0)).getUTCDate();
  const diaFinal = Math.min(dia, ultimoDiaDoMesSeguinte);

  return new Date(Date.UTC(ano, mes, diaFinal)).toISOString().slice(0, 10);
}
```

- [ ] **Step 4: Rodar e ver passar**

`npx vitest run src/modules/rh/folha/vencimento.test.ts`
Esperado: PASS, 6 testes.

- [ ] **Step 5: Ler o estado vivo antes de mexer nas funções de dinheiro**

```sql
select pg_get_functiondef(p.oid) from pg_proc p join pg_namespace n on n.oid=p.pronamespace
where n.nspname='public' and p.proname in ('fn_gerar_folha','fn_fechar_diarias','fn_excluir_lancamento');

select pg_get_constraintdef(oid) from pg_constraint where conname='lancamentos_origem_check';

select column_name, is_nullable from information_schema.columns
where table_schema='public' and table_name in ('lancamento_parcelas','lancamento_rateios')
order by table_name, ordinal_position;
```

Copiar a `fn_gerar_folha` viva inteira para um scratch: o Step 7 a reescreve **preservando byte a byte** tudo que não é o snapshot do grupo.

- [ ] **Step 6: Aplicar a migration da estrutura (sem tocar em fn ainda)**

Via `apply_migration`, nome `folha_gera_lancamento_estrutura`:

```sql
-- Origens novas. Três, e não uma, porque o origem_id de cada uma aponta para um
-- tipo de registro diferente: item da folha, guia da folha, adiantamento.
alter table public.lancamentos drop constraint lancamentos_origem_check;
alter table public.lancamentos add constraint lancamentos_origem_check
  check (origem in ('oc', 'manual', 'diaria', 'folha', 'folha_guia', 'adiantamento'));

-- Vínculo de volta no item, espelhando rh_diarias.lancamento_id.
alter table public.folha_itens
  add column if not exists lancamento_id uuid references public.lancamentos(id);

-- Guias geradas por folha. Escrita só pela definer, leitura por rh.folha:
-- espelha folha_item_encargos.
create table if not exists public.folha_guias (
  id uuid primary key default gen_random_uuid(),
  folha_id uuid not null references public.folhas(id) on delete cascade,
  grupo text not null,
  valor numeric(14,2) not null check (valor >= 0),
  lancamento_id uuid references public.lancamentos(id),
  created_at timestamptz not null default now(),
  unique (folha_id, grupo)
);

alter table public.folha_guias enable row level security;

create policy folha_guias_select on public.folha_guias
  for select to authenticated
  using (public.tem_permissao('rh.folha', 'ver'));

-- Sem policy de insert/update/delete: escrita só pela função definer.
grant select on public.folha_guias to authenticated;

-- Vencimento em SQL, espelho de vencimento.ts. least() resolve o dia que não
-- existe no mês: o primeiro termo estoura para o mês seguinte e o segundo é o
-- último dia do mês de pagamento.
create or replace function public.fn_vencimento_folha(p_competencia date, p_dia smallint)
returns date
language sql
immutable
set search_path to ''
as $function$
  select case when p_dia is null then null else least(
    (date_trunc('month', p_competencia) + interval '1 month')::date + (p_dia - 1),
    (date_trunc('month', p_competencia) + interval '2 month' - interval '1 day')::date
  ) end;
$function$;

do $$
declare v_anon_dml integer;
begin
  -- Fail-closed: anon não pode ter nenhum privilégio em folha_guias, e
  -- authenticated não pode ter DML (escrita é só pela definer).
  select count(*) into v_anon_dml
  from information_schema.role_table_grants
  where table_schema = 'public' and table_name = 'folha_guias'
    and (grantee = 'anon'
      or (grantee = 'authenticated' and privilege_type in ('INSERT','UPDATE','DELETE')));
  if v_anon_dml > 0 then
    raise exception 'folha_guias tem % grant indevido (anon com acesso ou authenticated com DML)', v_anon_dml;
  end if;
end $$;
```

- [ ] **Step 7: Conferir a fn de vencimento contra os mesmos casos do teste TS**

```sql
select
  public.fn_vencimento_folha('2026-08-01'::date, 5::smallint)  as esperado_2026_09_05,
  public.fn_vencimento_folha('2026-01-01'::date, 31::smallint) as esperado_2026_02_28,
  public.fn_vencimento_folha('2028-01-01'::date, 31::smallint) as esperado_2028_02_29,
  public.fn_vencimento_folha('2026-12-01'::date, 5::smallint)  as esperado_2027_01_05,
  public.fn_vencimento_folha('2026-08-01'::date, 1::smallint)  as esperado_2026_09_01,
  public.fn_vencimento_folha('2026-08-01'::date, null)         as esperado_null;
```

Esperado: exatamente os valores dos nomes das colunas. **Se qualquer um divergir do teste TS, parar e reconciliar** — a fn e a lógica pura têm que dar o mesmo dia.

- [ ] **Step 8: `fn_gerar_folha` grava o snapshot do grupo**

Via `apply_migration`, nome `folha_gerar_snapshot_grupo`. Recriar a `fn_gerar_folha` lida no Step 5 **inteira**, mudando **só** o loop de encargos: o `insert into public.folha_item_encargos` passa a incluir `grupo_recolhimento`, e o `select` do loop passa a trazer o grupo:

```sql
    for v_enc in
      select nome, percentual, grupo_recolhimento from public.folha_encargos where ativo order by nome
    loop
      v_valor := round(v_colab.salario * v_enc.percentual / 100.0, 2);
      insert into public.folha_item_encargos (folha_item_id, nome, percentual, valor, grupo_recolhimento)
      values (v_item_id, v_enc.nome, v_enc.percentual, v_valor, v_enc.grupo_recolhimento);
      v_encargos := v_encargos + v_valor;
    end loop;
```

Além disso, trocar a guarda de status no começo da fn: onde hoje está

```sql
  if v_status = 'fechada' then raise exception 'A folha desta competencia ja esta fechada'; end if;
```

passa a ser

```sql
  if v_status is not null and v_status <> 'rascunho' then
    raise exception 'A folha de %/% esta em "%": só da para gerar em rascunho. Rejeite ou desaprove antes de regerar.',
      to_char(v_ini, 'MM'), to_char(v_ini, 'YYYY'), v_status;
  end if;
```

**Todo o resto da função fica byte a byte igual.** Depois de aplicar, diffar a definição nova contra o scratch do Step 5 e conferir que só essas três mudanças apareceram.

- [ ] **Step 9: Escrever a `fn_aprovar_folha`**

Via `apply_migration`, nome `folha_aprovar_gera_lancamento`:

```sql
create or replace function public.fn_aprovar_folha(p_folha uuid)
returns void
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_status text; v_comp date;
  v_dia_sal smallint; v_dia_guia smallint;
  v_grupo_inss text; v_grupo_irrf text;
  v_venc_sal date; v_venc_guia date;
  v_uid uuid := (select auth.uid());
  v_item record; v_guia record; v_lanc uuid; v_guia_id uuid;
begin
  if not public.tem_permissao('rh.folha', 'aprovar') then
    raise exception 'Sem permissao para aprovar a folha';
  end if;

  select status, competencia into v_status, v_comp
  from public.folhas where id = p_folha for update;

  if v_status is null then raise exception 'Folha nao encontrada'; end if;
  if v_status <> 'pendente_aprovacao' then
    raise exception 'A folha de %/% esta em "%": só da para aprovar o que esta pendente de aprovacao.',
      to_char(v_comp, 'MM'), to_char(v_comp, 'YYYY'), v_status;
  end if;
  if not exists (select 1 from public.folha_itens where folha_id = p_folha) then
    raise exception 'A folha esta vazia';
  end if;

  -- Mesma trava de competencia que a fn_fechar_diarias usa.
  perform public.fn_exigir_competencia_aberta(v_comp, 'folha', p_folha);

  select dia_pagamento_salario, dia_vencimento_guias,
         grupo_recolhimento_inss, grupo_recolhimento_irrf
  into v_dia_sal, v_dia_guia, v_grupo_inss, v_grupo_irrf
  from public.folha_parametros where id = 1;

  v_venc_sal  := public.fn_vencimento_folha(v_comp, v_dia_sal);
  v_venc_guia := public.fn_vencimento_folha(v_comp, v_dia_guia);

  -- ===== 1. Salario: um lancamento por colaborador =====
  -- Item com liquido <= 0 nao gera lancamento: o adiantamento do mes pode ter
  -- consumido o salario inteiro, e lancamento de R$ 0 e sujeira na tela.
  for v_item in
    select fi.id, fi.centro_custo_id, fi.valor_liquido, c.nome
    from public.folha_itens fi
    join public.colaboradores c on c.id = fi.colaborador_id
    where fi.folha_id = p_folha and fi.valor_liquido > 0
    order by c.nome
  loop
    insert into public.lancamentos
      (tipo, origem, origem_id, centro_custo_id, descricao, valor, status,
       data_compra, mes_competencia, data_vencimento, created_by)
    values
      ('a_pagar', 'folha', v_item.id, v_item.centro_custo_id,
       'Salario ' || v_item.nome || ' ' || to_char(v_comp, 'MM/YYYY'),
       v_item.valor_liquido, 'a_pagar',
       (now() at time zone 'America/Rio_Branco')::date, v_comp, v_venc_sal, v_uid)
    returning id into v_lanc;

    insert into public.lancamento_parcelas
      (lancamento_id, numero_parcela, valor, data_vencimento, status, created_by)
    values (v_lanc, 1, v_item.valor_liquido, v_venc_sal, 'pendente', v_uid);

    if v_item.centro_custo_id is not null then
      insert into public.lancamento_rateios (lancamento_id, centro_custo_id, valor, created_by)
      values (v_lanc, v_item.centro_custo_id, v_item.valor_liquido, v_uid);
    end if;

    update public.folha_itens set lancamento_id = v_lanc where id = v_item.id;
  end loop;

  -- ===== 2. Guias: um lancamento por grupo de recolhimento =====
  -- A fonte junta as tres origens de valor da guia. O rateio e EXATO, nao
  -- proporcional: cada centavo ja nasce ligado a um item, e o item tem centro
  -- de custo. Logo sum(rateios) == valor do lancamento por construcao.
  for v_guia in
    with fonte as (
      -- encargos patronais, pelo grupo congelado no snapshot
      select fie.grupo_recolhimento as grupo, fi.centro_custo_id, fie.valor
      from public.folha_item_encargos fie
      join public.folha_itens fi on fi.id = fie.folha_item_id
      where fi.folha_id = p_folha and fie.grupo_recolhimento is not null
      union all
      -- INSS retido do trabalhador
      select v_grupo_inss, fi.centro_custo_id, fi.inss
      from public.folha_itens fi
      where fi.folha_id = p_folha and v_grupo_inss is not null and fi.inss > 0
      union all
      -- IRRF retido do trabalhador
      select v_grupo_irrf, fi.centro_custo_id, fi.irrf
      from public.folha_itens fi
      where fi.folha_id = p_folha and v_grupo_irrf is not null and fi.irrf > 0
    )
    select grupo,
           sum(valor) as total,
           jsonb_agg(jsonb_build_object('cc', centro_custo_id, 'valor', valor_cc))
             filter (where centro_custo_id is not null) as rateios
    from (
      select grupo, centro_custo_id, sum(valor) as valor_cc
      from fonte group by grupo, centro_custo_id
    ) por_cc
    group by grupo
    having sum(valor) > 0
    order by grupo
  loop
    insert into public.folha_guias (folha_id, grupo, valor)
    values (p_folha, v_guia.grupo, v_guia.total)
    returning id into v_guia_id;

    insert into public.lancamentos
      (tipo, origem, origem_id, centro_custo_id, descricao, valor, status,
       data_compra, mes_competencia, data_vencimento, created_by)
    values
      ('a_pagar', 'folha_guia', v_guia_id, null,
       v_guia.grupo || ' folha ' || to_char(v_comp, 'MM/YYYY'),
       v_guia.total, 'a_pagar',
       (now() at time zone 'America/Rio_Branco')::date, v_comp, v_venc_guia, v_uid)
    returning id into v_lanc;

    insert into public.lancamento_parcelas
      (lancamento_id, numero_parcela, valor, data_vencimento, status, created_by)
    values (v_lanc, 1, v_guia.total, v_venc_guia, 'pendente', v_uid);

    insert into public.lancamento_rateios (lancamento_id, centro_custo_id, valor, created_by)
    select v_lanc, (r->>'cc')::uuid, (r->>'valor')::numeric, v_uid
    from jsonb_array_elements(coalesce(v_guia.rateios, '[]'::jsonb)) r;

    update public.folha_guias set lancamento_id = v_lanc where id = v_guia_id;
  end loop;

  update public.folhas
  set status = 'aprovado', aprovado_por = v_uid, aprovado_em = now(), motivo_rejeicao = null
  where id = p_folha;
end;
$function$;

revoke all on function public.fn_aprovar_folha(uuid) from public;
grant execute on function public.fn_aprovar_folha(uuid) to authenticated;
```

- [ ] **Step 10: `fn_excluir_lancamento` bloqueia as origens novas**

Via `apply_migration`, nome `excluir_lancamento_bloqueia_folha`. Recriar a fn lida no Step 5 **inteira**, adicionando, junto do bloco que já trata `'diaria'`:

```sql
  if v_origem in ('folha', 'folha_guia') then
    raise exception 'Nao da para excluir aqui: este lancamento veio da folha. Desaprove a folha, que apaga os lancamentos dela';
  end if;

  if v_origem = 'adiantamento' then
    raise exception 'Nao da para excluir aqui: este lancamento veio de um adiantamento. Exclua pelo adiantamento';
  end if;
```

Todo o resto byte a byte igual. Diffar contra o scratch depois de aplicar.

- [ ] **Step 11: Prova de aceite em banco (a identidade do custo total)**

Montar o cenário num bloco transacional que **termina em rollback**, para não sujar produção:

```sql
begin;
-- 2 colaboradores CLT ativos em 2 centros de custo, salários distintos
-- 2 encargos ativos em 2 grupos ('INSS' 20%, 'FGTS' 8%)
-- faixas de INSS e IRRF cadastradas
-- folha_parametros: dia_pagamento_salario=5, dia_vencimento_guias=20,
--   grupo_recolhimento_inss='INSS', grupo_recolhimento_irrf='IRRF'
-- 1 adiantamento para o primeiro colaborador
-- (inserir os registros acima)

select public.fn_gerar_folha('2026-08-01'::date, 0);
update public.folhas set status = 'pendente_aprovacao' where competencia = '2026-08-01';
select public.fn_aprovar_folha((select id from public.folhas where competencia='2026-08-01'));

-- A identidade: liquidos + guias + adiantamentos == custo_total
with f as (select id, custo_total from public.folhas where competencia='2026-08-01'),
liq as (select coalesce(sum(l.valor),0) v from public.lancamentos l
        join public.folha_itens fi on fi.id = l.origem_id
        where l.origem='folha' and fi.folha_id = (select id from f)),
gui as (select coalesce(sum(l.valor),0) v from public.lancamentos l
        join public.folha_guias g on g.id = l.origem_id
        where l.origem='folha_guia' and g.folha_id = (select id from f)),
adi as (select coalesce(sum(valor),0) v from public.rh_adiantamentos
        where folha_id = (select id from f))
select liq.v as liquidos, gui.v as guias, adi.v as adiantamentos,
       liq.v + gui.v + adi.v as soma, f.custo_total,
       (liq.v + gui.v + adi.v) - f.custo_total as diferenca
from f, liq, gui, adi;

-- Rateio de cada guia bate com o lançamento
select g.grupo, l.valor as lancamento, sum(r.valor) as rateios,
       l.valor - sum(r.valor) as diferenca
from public.folha_guias g
join public.lancamentos l on l.id = g.lancamento_id
join public.lancamento_rateios r on r.lancamento_id = l.id
where g.folha_id = (select id from public.folhas where competencia='2026-08-01')
group by g.grupo, l.valor;

-- Vencimentos
select origem, descricao, data_vencimento from public.lancamentos
where origem in ('folha','folha_guia') order by origem, descricao;

rollback;
```

Esperado: `diferenca = 0.00` nas duas conferências; salários vencendo 2026-09-05 e guias 2026-09-20. **Se a diferença não for zero, parar e reportar**: o bloco não sobe com dinheiro divergente.

- [ ] **Step 12: Prova do caminho da config vazia**

Repetir o cenário do Step 11 **sem** grupo de recolhimento em nenhum encargo e sem os grupos dos retidos, dentro de `begin; ... rollback;`. Esperado: os lançamentos de salário existem, `select count(*) from folha_guias` devolve **0**, e nenhum lançamento com `origem='folha_guia'`.

- [ ] **Step 13: Regenerar os tipos e rodar o portão**

```bash
find src supabase -name "* [0-9].*" -delete
npx tsc --noEmit && npm run lint && npx vitest run && npm run build
```

Regenerar `src/lib/database.types.ts` via MCP `generate_typescript_types` antes do `tsc` (as tabelas e RPCs novas precisam existir no tipo).

- [ ] **Step 14: Commit**

```bash
git add -A
git commit -m "feat(rh): aprovar a folha gera os lançamentos no Financeiro

A aprovação passa a criar um a_pagar por colaborador com o líquido (rateado no
centro de custo do item) e um por grupo de recolhimento com a guia, espelhando
a fn_fechar_diarias. O rateio da guia é exato, não proporcional: cada centavo
já nasce ligado a um item com centro de custo, então sum(rateios) == valor do
lançamento por construção.

Prova em banco: líquidos + guias + adiantamentos == folhas.custo_total no
centavo, porque os retidos e o adiantamento se cancelam. Config de grupo vazia
gera zero guia.

fn_gerar_folha agora congela o grupo no snapshot do encargo e só gera em
rascunho. fn_excluir_lancamento recusa apagar lançamento de folha pelo
Financeiro, igual já fazia com diária.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

### Task 5: Desaprovar apaga os lançamentos, com as travas (DINHEIRO)

**Modelo sugerido:** opus.

**Files:**
- Migration nova: `folha_desaprovar`

**Interfaces:**
- Consumes: `folha_guias`, `folha_itens.lancamento_id` (Task 4); travas de `fn_excluir_lancamento`.
- Produces: `fn_desaprovar_folha(p_folha uuid, p_motivo text) returns void`.

- [ ] **Step 1: Aplicar a migration**

```sql
create or replace function public.fn_desaprovar_folha(p_folha uuid, p_motivo text)
returns void
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_status text; v_comp date; v_travado text;
begin
  if not public.tem_permissao('rh.folha', 'desaprovar') then
    raise exception 'Sem permissao para desaprovar a folha';
  end if;

  if p_motivo is null or length(btrim(p_motivo)) = 0 then
    raise exception 'Informe o motivo da desaprovacao';
  end if;

  select status, competencia into v_status, v_comp
  from public.folhas where id = p_folha for update;

  if v_status is null then raise exception 'Folha nao encontrada'; end if;
  if v_status <> 'aprovado' then
    raise exception 'A folha de %/% esta em "%": só da para desaprovar folha aprovada.',
      to_char(v_comp, 'MM'), to_char(v_comp, 'YYYY'), v_status;
  end if;

  -- Trava: nada de apagar lancamento comprometido. Parcela aprovada ja esta na
  -- fila de pagamento e parcela conciliada ja casou com o extrato do banco.
  -- Mesmas travas da fn_excluir_lancamento. A mensagem nomeia o que travou.
  select string_agg(distinct l.descricao, '; ' order by l.descricao)
  into v_travado
  from public.lancamentos l
  join public.lancamento_parcelas pa on pa.lancamento_id = l.id
  left join public.extrato_transacoes et on et.parcela_id = pa.id
  where (
      (l.origem = 'folha' and l.origem_id in (select id from public.folha_itens where folha_id = p_folha))
   or (l.origem = 'folha_guia' and l.origem_id in (select id from public.folha_guias where folha_id = p_folha))
  )
  and (pa.status in ('aprovado', 'pago') or et.id is not null);

  if v_travado is not null then
    raise exception 'Nao da para desaprovar a folha de %/%: ja existe pagamento aprovado, pago ou conciliado em: %. Desaprove ou estorne o pagamento primeiro.',
      to_char(v_comp, 'MM'), to_char(v_comp, 'YYYY'), v_travado;
  end if;

  -- Apaga de verdade (escolha do Tiago). Parcelas e rateios caem por
  -- ON DELETE CASCADE. Solta o vinculo antes, para nao violar a FK.
  update public.folha_itens set lancamento_id = null where folha_id = p_folha;

  delete from public.lancamentos
  where origem = 'folha_guia'
    and origem_id in (select id from public.folha_guias where folha_id = p_folha);

  delete from public.lancamentos
  where origem = 'folha'
    and origem_id in (select id from public.folha_itens where folha_id = p_folha);

  delete from public.folha_guias where folha_id = p_folha;

  update public.folhas
  set status = 'rascunho', aprovado_por = null, aprovado_em = null,
      motivo_rejeicao = btrim(p_motivo)
  where id = p_folha;
end;
$function$;

revoke all on function public.fn_desaprovar_folha(uuid, text) from public;
grant execute on function public.fn_desaprovar_folha(uuid, text) to authenticated;
```

**Atenção na ordem dos deletes:** `folha_guias.lancamento_id` referencia `lancamentos`, então apagar o lançamento da guia antes de apagar a linha de `folha_guias` violaria a FK. Conferir se a FK de `folha_guias.lancamento_id` precisa de `on delete set null` (ler no banco); se precisar, ajustar a migration da Task 4 numa migration corretiva, não editar a já aplicada.

- [ ] **Step 2: Prova em banco do caminho feliz**

Dentro de `begin; ... rollback;`: montar o cenário da Task 4 Step 11, aprovar, e então:

```sql
select public.fn_desaprovar_folha(
  (select id from public.folhas where competencia='2026-08-01'),
  'teste de desaprovacao'
);

select
  (select count(*) from public.lancamentos where origem in ('folha','folha_guia')) as lancamentos_restantes,
  (select count(*) from public.folha_guias) as guias_restantes,
  (select count(*) from public.folha_itens where lancamento_id is not null) as itens_com_vinculo,
  (select status from public.folhas where competencia='2026-08-01') as status,
  (select motivo_rejeicao from public.folhas where competencia='2026-08-01') as motivo,
  (select count(*) from public.lancamento_parcelas pa
     join public.lancamentos l on l.id = pa.lancamento_id
   where l.origem in ('folha','folha_guia')) as parcelas_orfas;
```

Esperado: `0, 0, 0, 'rascunho', 'teste de desaprovacao', 0`.

- [ ] **Step 3: Prova das três travas**

Três cenários, cada um em `begin; ... rollback;`, aprovando primeiro e então marcando **uma** parcela de salário e rodando a desaprovação:

1. `update lancamento_parcelas set status='pago' where ...` → esperado: exceção citando a descrição do lançamento.
2. `update lancamento_parcelas set status='aprovado', data_programada=current_date where ...` → esperado: exceção (o check `programada_quando_aprovada` exige a data, por isso ela entra no update).
3. inserir uma linha em `extrato_transacoes` apontando para a parcela → esperado: exceção.

Em todos: conferir que a folha **continua** `aprovado` e que os lançamentos **continuam** existindo.

- [ ] **Step 4: Prova da alçada**

Confirmar que a fn recusa sem a permissão: rodar como um papel sem `rh.folha:desaprovar` e esperar `Sem permissao para desaprovar a folha`. Documentar no commit como foi verificado (hoje só existe usuário Admin em produção, então pode ser via `tem_permissao` simulada ou anotado como cobertura pendente, igual o Bloco 1 fez com o EPI).

- [ ] **Step 5: Regenerar tipos e rodar o portão**

```bash
find src supabase -name "* [0-9].*" -delete
npx tsc --noEmit && npm run lint && npx vitest run && npm run build
```

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "feat(rh): desaprovar a folha apaga os lançamentos, e recusa se houver pagamento

Trava mais forte que só \"foi pago\": recusa se qualquer parcela da folha estiver
aprovada, paga ou conciliada no extrato, que são as mesmas travas da
fn_excluir_lancamento. A mensagem nomeia o lançamento que travou.

Delete de verdade (escolha do Tiago), com parcelas e rateios caindo por
cascade, e o vínculo solto antes para não violar a FK.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

### Task 6: Adiantamento vira lançamento

**Modelo sugerido:** sonnet (espelha a diária; a fn é pequena).

**Files:**
- Migration nova: `adiantamento_gera_lancamento`
- Modify: `src/modules/rh/adiantamentos/actions.ts:59-80` (`criarAdiantamento`), `garantirEmAberto:36-56`
- Modify: `src/modules/rh/adiantamentos/queries.ts`, `components/adiantamentos-tabela.tsx`

**Interfaces:**
- Consumes: origem `adiantamento` (Task 4), `fn_exigir_competencia_aberta`.
- Produces: `rh_adiantamentos.lancamento_id`; `fn_registrar_adiantamento(p_dados jsonb) returns uuid`; campo `lancamentoId: string | null` na listagem.

- [ ] **Step 1: Aplicar a migration**

```sql
alter table public.rh_adiantamentos
  add column if not exists lancamento_id uuid references public.lancamentos(id);

create or replace function public.fn_registrar_adiantamento(p_dados jsonb)
returns uuid
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_colab uuid := (p_dados->>'colaborador_id')::uuid;
  v_comp date := date_trunc('month', (p_dados->>'competencia')::date)::date;
  v_valor numeric(14,2) := (p_dados->>'valor')::numeric;
  v_data date := (p_dados->>'data')::date;
  v_desc text := nullif(btrim(coalesce(p_dados->>'descricao', '')), '');
  v_uid uuid := (select auth.uid());
  v_nome text; v_cc uuid; v_adiant uuid; v_lanc uuid;
begin
  if not public.tem_permissao('rh.adiantamentos', 'criar') then
    raise exception 'Sem permissao para criar adiantamentos';
  end if;
  if v_valor is null or v_valor <= 0 then
    raise exception 'O valor do adiantamento tem que ser maior que zero';
  end if;

  perform public.fn_exigir_competencia_aberta(v_comp, 'adiantamento', null);

  select nome, centro_custo_id into v_nome, v_cc
  from public.colaboradores where id = v_colab;
  if v_nome is null then raise exception 'Colaborador nao encontrado'; end if;

  insert into public.rh_adiantamentos
    (colaborador_id, competencia, valor, data, descricao, created_by)
  values (v_colab, v_comp, v_valor, v_data, v_desc, v_uid)
  returning id into v_adiant;

  insert into public.lancamentos
    (tipo, origem, origem_id, centro_custo_id, descricao, valor, status,
     data_compra, mes_competencia, data_vencimento, created_by)
  values
    ('a_pagar', 'adiantamento', v_adiant, v_cc,
     'Adiantamento ' || v_nome || ' ' || to_char(v_comp, 'MM/YYYY'),
     v_valor, 'a_pagar',
     (now() at time zone 'America/Rio_Branco')::date, v_comp, v_data, v_uid)
  returning id into v_lanc;

  insert into public.lancamento_parcelas
    (lancamento_id, numero_parcela, valor, data_vencimento, status, created_by)
  values (v_lanc, 1, v_valor, v_data, 'pendente', v_uid);

  if v_cc is not null then
    insert into public.lancamento_rateios (lancamento_id, centro_custo_id, valor, created_by)
    values (v_lanc, v_cc, v_valor, v_uid);
  end if;

  update public.rh_adiantamentos set lancamento_id = v_lanc where id = v_adiant;
  return v_adiant;
end;
$function$;

revoke all on function public.fn_registrar_adiantamento(jsonb) from public;
grant execute on function public.fn_registrar_adiantamento(jsonb) to authenticated;
```

- [ ] **Step 2: `criarAdiantamento` passa a usar a RPC**

Em `actions.ts`, trocar o `supabase.from(TABELA).insert({...})` por:

```ts
  const { error } = await supabase.rpc("fn_registrar_adiantamento", {
    p_dados: {
      colaborador_id: validado.data.colaboradorId,
      competencia: validado.data.competencia,
      valor: validado.data.valor,
      data: validado.data.data,
      descricao: validado.data.descricao ?? null,
    },
  });
```

O motivo do `jsonb` em vez de argumentos posicionais: espelha `fn_salvar_lancamento` e `fn_criar_ordem_compra`, que já é o padrão do projeto para payload de criação, e evita quebrar a assinatura quando o adiantamento ganhar campo novo.

- [ ] **Step 3: Estender a trava de edição e exclusão**

Em `garantirEmAberto`, além do `folha_id`, buscar `lancamento_id` e recusar quando o lançamento tiver parcela `aprovado`/`pago`/conciliada, com mensagem explicando que o pagamento tem que ser estornado primeiro. Excluir adiantamento sem parcela comprometida tem que apagar o lançamento junto: fazer isso numa fn definer `fn_excluir_adiantamento(p_id uuid)`, não em duas chamadas do client (senão sobra lançamento órfão se a segunda falhar).

- [ ] **Step 4: Coluna na listagem**

`queries.ts` traz `lancamento_id` e a tabela ganha coluna "No Financeiro" com link pro lançamento, ou `CelulaVazia` quando nulo.

- [ ] **Step 5: Portão e commit**

```bash
find src supabase -name "* [0-9].*" -delete
npx tsc --noEmit && npm run lint && npx vitest run && npm run build
git add -A
git commit -m "feat(rh): adiantamento vira lançamento a pagar no Financeiro

O adiantamento era descontado do líquido da folha e o dinheiro saía do caixa
sem o app ver. Agora conceder gera um a_pagar no centro de custo do
colaborador, na mesma transação (por isso a criação virou fn definer, como a
diária já era). Adiantamento com pagamento aprovado, pago ou conciliado não
edita nem exclui.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

### Task 7: Seção "Lançamentos gerados" no detalhe da folha

**Modelo sugerido:** sonnet.

**Files:**
- Modify: `src/modules/rh/folha/queries.ts` (query dos lançamentos da folha)
- Create: `src/modules/rh/folha/components/lancamentos-gerados.tsx`
- Modify: `src/modules/rh/folha/components/folha-detalhe.tsx`
- Test: `src/modules/rh/folha/calculo.test.ts` (agrupamento para a tela)

**Interfaces:**
- Consumes: `folha_itens.lancamento_id`, `folha_guias` (Task 4).
- Produces: `listarLancamentosDaFolha(folhaId: string): Promise<LancamentoDaFolha[]>` com `{ id, tipo: "salario" | "guia", descricao, valor, dataVencimento, statusParcela }`.

- [ ] **Step 1: Escrever o teste do agrupamento (falha primeiro)**

Em `calculo.test.ts`, testar a função pura que separa salários de guias e soma cada grupo, incluindo o caso de folha em rascunho (lista vazia, sem quebrar) e o caso de guia sem rateio.

- [ ] **Step 2: Rodar, ver falhar, implementar em `calculo.ts`, ver passar**

```bash
npx vitest run src/modules/rh/folha/calculo.test.ts
```

- [ ] **Step 3: Query e componente**

`listarLancamentosDaFolha` faz **uma** leitura (join de `lancamentos` com `lancamento_parcelas` filtrando pelas duas origens da folha), e a separação salário/guia é pura em `calculo.ts`. Não repetir o erro que o Bloco 6 corrigiu na Task 4: página faz uma leitura, não três.

O componente mostra duas listas (Salários, Guias) com `MoneyText`, vencimento, status da parcela e link pro lançamento. `EmptyState` com texto explicando que os lançamentos nascem na aprovação quando a folha ainda é rascunho.

- [ ] **Step 4: Portão e commit**

```bash
find src supabase -name "* [0-9].*" -delete
npx tsc --noEmit && npm run lint && npx vitest run && npm run build
git add -A
git commit -m "feat(rh): detalhe da folha mostra os lançamentos gerados

Salários e guias separados, com vencimento, status da parcela e link pro
Financeiro. Uma leitura só, com a separação pura em calculo.ts.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

### Task 8: Portão final, prova de aceite e merge

**Modelo sugerido:** opus (review amplo do diff inteiro).

- [ ] **Step 1: Portão verde**

```bash
find src supabase -name "* [0-9].*" -delete
npx tsc --noEmit && npm run lint && npx vitest run && npm run build
```

- [ ] **Step 2: Advisors do Supabase**

Rodar `get_advisors` (security e performance) e comparar com a baseline. Esperado: nenhum issue novo além do WARN de função definer nova, que é padrão do projeto. `folha_guias` **não** pode aparecer em `rls_enabled_no_policy`.

- [ ] **Step 3: Rodar a prova de aceite completa de novo, no estado final**

Repetir o cenário do Step 11 da Task 4 (agora com o adiantamento passando pela `fn_registrar_adiantamento`), conferir a identidade `líquidos + guias + adiantamentos == custo_total`, desaprovar, conferir que zerou, aprovar de novo e conferir que os números repetem. Tudo em `begin; ... rollback;`.

- [ ] **Step 4: Review amplo**

Invocar `superpowers:requesting-code-review` sobre o diff completo da branch contra `main`, com foco em: dinheiro (a identidade fecha em todos os caminhos), permissão tripla nas quatro transições, `folha_guias` sem DML para `authenticated`, e nenhuma alíquota ou grupo semeado.

- [ ] **Step 5: Merge e deploy**

Merge da branch em `main`, esperar o CI verde, e conferir o deploy. Reportar ao Tiago as pendências dele: cadastrar encargos com grupo, cadastrar dia de pagamento e dia das guias e os grupos dos retidos em `/rh/parametros-folha`, cadastrar um colaborador CLT real, e validar um holerite (aceite fiscal que segue pendente do Bloco 7).

- [ ] **Step 6: Atualizar o ledger e a spec**

Atualizar `.superpowers/sdd/progress.md`: marcar o Bloco 7 como deployado (o ledger ainda diz "em andamento") e registrar o 8a como concluído, com o que ficou para 8b, 8c e 8d. Registrar em `docs/decisoes.md` as decisões estruturais: status `aprovado` no masculino por causa do canônico, ausência de `rejeitado` na folha, grupo no snapshot do encargo, e um dia único de vencimento para todas as guias.

---

## Self-review deste plano

**Cobertura da spec, seção por seção:**

| seção da spec | task |
|---|---|
| 1. Máquina de status (check, colunas, trigger, ações, `fn_gerar_folha` em rascunho, aprovação não recalcula) | 1, 2, e a guarda de rascunho no Step 8 da 4 |
| 2. Geração dos lançamentos (origens, salário, guias, rateio exato, vínculo, competência) | 4 |
| 3. Grupo de recolhimento (config, Combobox, grupo só pelo retido, snapshot) | 3 e o Step 8 da 4 |
| 4. Vencimento (parâmetro, mês seguinte, dia inexistente, TS espelhando SQL) | 4 (Steps 1-4, 6, 7) |
| 5. Adiantamento (coluna, fn definer, travas) | 6 |
| 6. Telas (ApprovalBar, Trilha, encargos, parâmetros, adiantamentos, permissão tripla) | 2, 3, 6, 7 |
| 7. Testes e prova de aceite | 4 (11-12), 5 (2-4), 8 (3) |
| Trava do desaprovar (aprovado/pago/conciliado) | 5 |

**Ponto onde o plano divergiu da spec, de propósito:** a checagem de folha vazia. A spec diz que ela migra para a função de enviar; o plano põe no trigger de guarda, porque enviar é UPDATE direto e não tem função própria. Efeito idêntico, e a trava fica no banco de qualquer caminho.

**Riscos que o implementador precisa saber:**

1. **A ordem dos deletes na Task 5 depende da FK de `folha_guias.lancamento_id`.** Se ela não for `on delete set null`, apagar o lançamento antes da linha da guia viola a FK. O Step 1 manda conferir no banco e corrigir por migration nova, nunca editando uma já aplicada.
2. **`fn_gerar_folha` é reescrita inteira na Task 4 Step 8.** É a função de dinheiro mais crítica do RH. O plano manda copiar a definição viva antes e diffar depois, esperando exatamente três mudanças.
3. **As RPCs de aprovação nascem em duas etapas** (transição na Task 1, dinheiro nas Tasks 4 e 5). Depois da Task 2 o preview já aprova e desaprova de verdade, só não gera lançamento. Quem implementar as Tasks 4 e 5 tem que usar `create or replace` **preservando a assinatura**, senão a action da Task 2 quebra.
4. **Zero colaborador em produção.** A prova de aceite monta o cenário em transação com rollback. Nada disso valida contra caso real: isso depende das pendências do Tiago.
