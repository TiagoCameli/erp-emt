# Reforma Fase A: Remoção de módulos + migração de dados — Plano de implementação

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Enxugar o ERP-EMT para Compras (Cotações + OC), Financeiro, RH, mais Cadastros e Administração de suporte, removendo Estoque, Manutenção, Medição, Gestão e Orçamentos do app e do banco, e zerando o transacional.

**Architecture:** Remoção em duas frentes que mantêm o app verde a cada commit. Primeiro sai o código de app dos módulos mortos (rotas + módulos + entradas no catálogo `config/recursos.ts`, que é data-driven e regenera o menu sozinho). Depois vêm as migrations versionadas que dropam as tabelas na ordem segura de FK, corrigem/dropam as funções órfãs, limpam permissões e zeram o transacional. Código sai antes do banco para nenhum commit ficar com app chamando tabela dropada.

**Tech Stack:** Next.js 16 (App Router, TypeScript strict), Supabase (Postgres 17, RLS), Vitest, Tailwind v4 + shadcn/ui. Branch de trabalho: `reforma-3-modulos`.

## Global Constraints

- **Nunca tabela sem RLS.** Tudo que fica mantém política, grants explícitos e trigger de auditoria. Este plano só remove; não cria tabela.
- **Migrations versionadas** em `supabase/migrations/` (prefixo `YYYYMMDDHHMMSS_`). Cada migration é aplicada ao projeto Supabase `vsesgvqjgqpapoxhnbqx` via MCP `apply_migration` (name = nome do arquivo sem extensão) E salva como arquivo no repo. Proibido mexer no schema pelo dashboard.
- **Rodar advisors** (`get_advisors` security + performance) do Supabase depois de cada migration e corrigir o que aparecer de novo.
- **Dinheiro NUMERIC(14,2), quantidade NUMERIC(14,3).** Datas `date` ancoradas em America/Rio_Branco.
- **Portão de pronto por tarefa:** `npm run -s typecheck` (ou `npx tsc --noEmit`), `npm run -s lint`, `npm run -s build` verdes; sem `any` novo, sem `console.log`.
- **Projeto Supabase é único e compartilhado** (preview e produção usam o mesmo). Dropar tabela é irreversível. **Antes de aplicar a primeira migration destrutiva, confirmar com o Tiago:** aplicar direto no projeto (precedente das fases 1-8) ou criar branch Supabase de teste (`create_branch`) e validar antes. As tabelas mortas estão vazias; o único dado real é `lancamentos`/`lancamento_parcelas` (7964 linhas, todas `origem='manual'`), que o Tiago mandou zerar.
- **Nunca duas fases abertas ao mesmo tempo.** Esta é a Fase A. B a F vêm depois (ver Roadmap).

## Roadmap das fases (contexto; só a Fase A é detalhada aqui)

- **Fase A (este plano):** remoção de módulos + migração de dados.
- **Fase B:** destino de custo de 3 tipos (obra/empresa/equipamento) + seletor, remove a aba Centros de custo (editor de árvore).
- **Fase C:** OC sem geração automática de lançamento; botão Gerar lançamento; forma de pagamento no lançamento; dinheiro/cartão pagam direto, PIX/transferência/boleto/cheque na fila de autorização.
- **Fase D:** Contas a receber avulso (NF por obra / recebimento avulso).
- **Fase E:** RH folha rateada por apontamento.
- **Fase F:** anexos em lançamento e comprovante de pagamento; liberar todos os tipos de arquivo.

Spec de referência: `docs/superpowers/specs/2026-07-20-reforma-compras-financeiro-rh-design.md`.

---

## Task 1: Remover módulos mortos do app (Estoque, Manutenção, Medição, Gestão)

**Files:**
- Delete (dirs inteiros): `src/modules/estoque/`, `src/modules/manutencao/`, `src/modules/medicao/`, `src/modules/gestao/`
- Delete (rotas): `src/app/(app)/estoque/`, `src/app/(app)/manutencao/`, `src/app/(app)/medicao/`, `src/app/(app)/gestao/`
- Modify: `src/config/recursos.ts`
- Modify: `src/app/(app)/inicio/page.tsx` (remover os cards desses módulos se houver referência hardcoded)

**Interfaces:**
- Consumes: nada (é remoção).
- Produces: `MODULOS` e `RECURSOS` em `config/recursos.ts` sem `estoque`, `manutencao`, `medicao`, `gestao`. O menu (montado em `src/app/(app)/layout.tsx` a partir de `MODULOS`/`recursosDoModulo`) passa a mostrar só Compras, Financeiro, RH, Cadastros, Administração.

- [ ] **Step 1: Confirmar que nada fora dos módulos os importa**

Run:
```bash
cd /Users/tiagocameli/Documents/GitHub/erp-emt
grep -rn -E "modules/(estoque|manutencao|medicao|gestao)" src | grep -vE "src/(modules|app/\(app\))/(estoque|manutencao|medicao|gestao)/"
```
Expected: nenhuma linha (só o próprio código dos módulos referencia). Se aparecer algo, tratar o import antes de deletar.

- [ ] **Step 2: Deletar os diretórios de módulo e de rota**

```bash
git rm -r "src/modules/estoque" "src/modules/manutencao" "src/modules/medicao" "src/modules/gestao"
git rm -r "src/app/(app)/estoque" "src/app/(app)/manutencao" "src/app/(app)/medicao" "src/app/(app)/gestao"
```

- [ ] **Step 3: Tirar os módulos e recursos do catálogo**

Em `src/config/recursos.ts`:
- Em `MODULOS`, remover as entradas `{ id: "estoque", ... }`, `{ id: "manutencao", ... }`, `{ id: "medicao", ... }`, `{ id: "gestao", ... }`.
- Em `RECURSOS`, remover todos os objetos com `modulo: "estoque"`, `"manutencao"`, `"medicao"`, `"gestao"` (blocos comentados `// Estoque e Combustível`, `// Manutenção`, `// Medição`, `// Gestão (BI)`).

- [ ] **Step 4: Ajustar o dashboard `inicio` se referenciar os módulos removidos**

Abrir `src/app/(app)/inicio/page.tsx`. Se houver card/detalhe hardcoded de Estoque/Manutenção/Medição/Gestão, remover. (A listagem que vem de `RECURSOS`/`MODULOS` se ajusta sozinha.)

- [ ] **Step 5: Verificar tipos, lint e build**

Run:
```bash
npx tsc --noEmit && npm run -s lint && npm run -s build
```
Expected: tudo verde. Erros de "Cannot find module" apontam import remanescente a limpar.

- [ ] **Step 6: Confirmar o menu no grep**

Run:
```bash
grep -rn -E "\"(estoque|manutencao|medicao|gestao)\"" src/config/recursos.ts
```
Expected: nenhuma linha.

- [ ] **Step 7: Commit**

```bash
git add -A
git commit -m "refactor(reforma-a): remove modulos Estoque, Manutencao, Medicao e Gestao do app"
```

---

## Task 2: Enxugar Cadastros no app (remover Orçamentos e Depósitos)

**Files:**
- Delete: `src/modules/cadastros/orcamentos/`, `src/app/(app)/cadastros/orcamentos/`
- Delete: `src/app/(app)/cadastros/depositos/` e o código de módulo de depósitos, se existir em `src/modules/cadastros/` (conferir no Step 1)
- Modify: `src/config/recursos.ts`

**Interfaces:**
- Consumes: nada.
- Produces: `RECURSOS` sem `cadastros.orcamentos` e `cadastros.depositos`. **Mantém** `cadastros.centros-custo` (a aba de árvore sai só na Fase B).

- [ ] **Step 1: Localizar o código de depósitos e orçamentos**

Run:
```bash
ls -d "src/app/(app)/cadastros/orcamentos" "src/app/(app)/cadastros/depositos" 2>/dev/null
find src/modules/cadastros -maxdepth 1 -type d
grep -rn -E "cadastros/(orcamentos|depositos)|modules/cadastros/orcamentos" src | grep -vE "cadastros/(orcamentos|depositos)/"
```
Expected: identifica os dirs. A última linha mostra referências externas (deve ser vazia fora de `recursos.ts`).

- [ ] **Step 2: Deletar dirs**

```bash
git rm -r "src/app/(app)/cadastros/orcamentos" "src/app/(app)/cadastros/depositos"
# se houver módulo dedicado:
git rm -r "src/modules/cadastros/orcamentos" 2>/dev/null || true
```

- [ ] **Step 3: Tirar do catálogo**

Em `src/config/recursos.ts`, remover os objetos `id: "cadastros.orcamentos"` e `id: "cadastros.depositos"`.

- [ ] **Step 4: Verificar**

Run:
```bash
npx tsc --noEmit && npm run -s lint && npm run -s build
```
Expected: verde.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "refactor(reforma-a): remove abas Orcamentos e Depositos de Cadastros"
```

---

## Task 3: Enxugar Compras no app (remover Pedidos, Recebimentos, Painel)

**Files:**
- Delete: `src/modules/compras/pedidos/`, `src/modules/compras/recebimentos/`, `src/modules/compras/painel/`
- Delete: `src/app/(app)/compras/pedidos/`, `src/app/(app)/compras/recebimentos/`, `src/app/(app)/compras/painel/`
- Modify: `src/config/recursos.ts`
- Modify: `src/modules/compras/_shared/anexos-recurso.ts`
- Modify: `src/app/(app)/inicio/page.tsx` (texto do card de Compras)
- Modify (se referenciar pedido): `src/modules/compras/ordens/components/ordem-form-drawer.tsx`, `src/modules/compras/ordens/schemas.ts`, `src/modules/compras/ordens/queries.ts`, `src/modules/compras/ordens/actions.ts`

**Interfaces:**
- Consumes: nada.
- Produces: Compras com só `compras.cotacoes` e `compras.ordens` em `RECURSOS`. `anexos-recurso.ts` mapeia só `cotacoes` e `ordens_compra`. OC sem qualquer referência a pedido no app (a coluna `pedido_id` só some no banco na Task 4; no app o campo/seletor de pedido é removido agora).

- [ ] **Step 1: Deletar dirs de Pedidos, Recebimentos e Painel**

```bash
cd /Users/tiagocameli/Documents/GitHub/erp-emt
git rm -r "src/modules/compras/pedidos" "src/modules/compras/recebimentos" "src/modules/compras/painel"
git rm -r "src/app/(app)/compras/pedidos" "src/app/(app)/compras/recebimentos" "src/app/(app)/compras/painel"
```

- [ ] **Step 2: Tirar os recursos do catálogo**

Em `src/config/recursos.ts`, remover os objetos `id: "compras.pedidos"`, `id: "compras.recebimentos"` e `id: "compras.painel"`. Ficam só `compras.cotacoes` e `compras.ordens`.

- [ ] **Step 3: Corrigir o mapa de anexos de Compras**

Em `src/modules/compras/_shared/anexos-recurso.ts`, no objeto `RECURSO_POR_TABELA`, remover as linhas `pedidos: "compras.pedidos",` e `recebimentos: "compras.recebimentos",`. Deixar só:
```ts
const RECURSO_POR_TABELA = {
  cotacoes: "compras.cotacoes",
  ordens_compra: "compras.ordens",
} as const satisfies Record<string, RecursoId>;
```
Conferir se a função `acaoDoAnexo` ainda cita `"recebimentos"` (o `return tabela === "recebimentos" ? "criar" : "editar";`). Como recebimentos sai, simplificar para `return "editar";`.

- [ ] **Step 4: Remover referências a pedido dentro do módulo Ordens**

Run para achar:
```bash
grep -rn -iE "pedido" src/modules/compras/ordens
```
Para cada ocorrência de seleção/uso de pedido na OC (campo `pedidoId` no `schemas.ts`, seletor no `ordem-form-drawer.tsx`, join/coluna em `queries.ts`, uso em `actions.ts`), remover. **Manter** tudo que é de `cotacao` (cotação fica). A coluna `pedido_id` no banco só é dropada na Task 4; aqui é só o app parar de ler/escrever ela.

- [ ] **Step 5: Ajustar o card de Compras no dashboard**

Em `src/app/(app)/inicio/page.tsx`, trocar o `detalhe="Pedidos, cotações, ordens e recebimentos"` por `detalhe="Cotações e ordens de compra"`.

- [ ] **Step 6: Verificar**

Run:
```bash
npx tsc --noEmit && npm run -s lint && npm run -s build
```
Expected: verde. Se `tsc` reclamar que `"compras.pedidos"` não é `RecursoId`, sobrou referência a limpar (rodar `grep -rn "compras.pedidos\|compras.recebimentos\|compras.painel" src`).

- [ ] **Step 7: Commit**

```bash
git add -A
git commit -m "refactor(reforma-a): Compras fica so com Cotacoes e Ordens de compra"
```

---

## Task 4: Migração — enxugar Compras no banco

**Files:**
- Create: `supabase/migrations/20260720120001_reforma_a_enxuga_compras.sql`

**Interfaces:**
- Consumes: schema atual (FKs `cotacoes_pedido_id_fkey`, `ordens_compra_pedido_id_fkey`; funções `fn_desaprovar_ordem_compra`, `fn_registrar_recebimento`; funções de anexo `fn_recurso_do_anexo`, `fn_recurso_do_path_anexo`; check `ordens_compra_status_check`).
- Produces: tabelas `pedidos`, `pedido_itens`, `recebimentos`, `recebimento_itens` inexistentes; `ordens_compra` e `cotacoes` sem coluna `pedido_id`; `fn_desaprovar_ordem_compra` sem checagem de recebimento; `ordens_compra_status_check` sem `recebido`/`recebido_parcial`; `fn_registrar_recebimento` dropada; funções de anexo sem os mapeamentos `pedidos`/`recebimentos`.

- [ ] **Step 1: Buscar o corpo atual de `fn_desaprovar_ordem_compra` para editar com precisão**

Via MCP `execute_sql` no projeto `vsesgvqjgqpapoxhnbqx`:
```sql
select pg_get_functiondef('public.fn_desaprovar_ordem_compra(uuid, text)'::regprocedure);
```
Guardar o corpo. No corpo, localizar e **remover** este bloco (confirmado no recon):
```sql
  if exists (select 1 from public.recebimentos where ordem_compra_id = p_oc_id and status = 'registrado') then
    raise exception 'Estorne os recebimentos antes de desaprovar esta OC';
  end if;
```
O `create or replace` do Step 2 usa o corpo original menos esse bloco.

- [ ] **Step 2: Buscar o corpo atual de `fn_recurso_do_anexo` e `fn_recurso_do_path_anexo`**

```sql
select p.proname, pg_get_functiondef(p.oid)
from pg_proc p join pg_namespace n on n.oid=p.pronamespace
where n.nspname='public' and p.proname in ('fn_recurso_do_anexo','fn_recurso_do_path_anexo');
```
No Step 3, recriar as duas sem os ramos `'pedidos' → 'compras.pedidos'` e `'recebimentos' → 'compras.recebimentos'` (mantendo `'cotacoes'`, `'ordens_compra'` e o `else null`).

- [ ] **Step 3: Escrever a migration**

Criar `supabase/migrations/20260720120001_reforma_a_enxuga_compras.sql`:
```sql
-- Reforma A: enxuga Compras (remove Pedidos e Recebimentos do banco).

-- 1) Sever FKs cruzadas e dropar as colunas pedido_id (origem fica, destino dropa).
alter table public.cotacoes       drop constraint if exists cotacoes_pedido_id_fkey;
alter table public.cotacoes       drop column     if exists pedido_id;
alter table public.ordens_compra  drop constraint if exists ordens_compra_pedido_id_fkey;
alter table public.ordens_compra  drop column     if exists pedido_id;

-- 2) fn_desaprovar_ordem_compra sem a checagem de recebimentos.
--    (colar aqui o corpo original do Step 1 menos o if-exists de recebimentos)
create or replace function public.fn_desaprovar_ordem_compra(p_oc_id uuid, p_motivo text)
returns void language plpgsql security definer set search_path to '' as $function$
  -- CORPO ORIGINAL SEM O BLOCO DE recebimentos
$function$;

-- 3) Dropar a função de recebimento (referencia estoque + recebimentos).
drop function if exists public.fn_registrar_recebimento cascade;

-- 4) Dropar as tabelas de Pedidos e Recebimentos (filha -> pai).
drop table if exists public.recebimento_itens;
drop table if exists public.recebimentos;
drop table if exists public.pedido_itens;
drop table if exists public.pedidos;

-- 5) Recriar o CHECK de status da OC sem recebido/recebido_parcial.
alter table public.ordens_compra drop constraint if exists ordens_compra_status_check;
alter table public.ordens_compra add  constraint ordens_compra_status_check
  check (status in ('rascunho','pendente_aprovacao','aprovado','rejeitado','cancelado'));

-- 6) Recriar fn_recurso_do_anexo e fn_recurso_do_path_anexo sem pedidos/recebimentos.
--    (colar aqui os corpos do Step 2 sem os dois ramos)
```
Preencher os corpos das funções com o que foi lido nos Steps 1 e 2 (sem placeholder no arquivo final).

- [ ] **Step 4: Aplicar a migration**

Via MCP `apply_migration` (project_id `vsesgvqjgqpapoxhnbqx`, name `20260720120001_reforma_a_enxuga_compras`, query = conteúdo do arquivo).

- [ ] **Step 5: Verificar no banco**

```sql
select table_name from information_schema.tables
 where table_schema='public' and table_name in ('pedidos','pedido_itens','recebimentos','recebimento_itens'); -- 0 linhas
select column_name from information_schema.columns
 where table_schema='public' and table_name='ordens_compra' and column_name='pedido_id'; -- 0 linhas
select pg_get_constraintdef(oid) from pg_constraint where conname='ordens_compra_status_check'; -- sem recebido
```
Rodar `get_advisors` (security + performance) e conferir que não surgiu achado novo.

- [ ] **Step 6: Commit**

```bash
git add supabase/migrations/20260720120001_reforma_a_enxuga_compras.sql
git commit -m "feat(db,reforma-a): dropa Pedidos/Recebimentos, ajusta fn_desaprovar_oc e anexos"
```

---

## Task 5: Migração — dropar Estoque

**Files:**
- Create: `supabase/migrations/20260720120002_reforma_a_drop_estoque.sql`

**Interfaces:**
- Consumes: FK `oc_itens_deposito_id_fkey` (única FK cruzada que fica → estoque).
- Produces: `oc_itens` sem `deposito_id`; tabelas de estoque e funções de estoque inexistentes.

- [ ] **Step 1: Listar as funções de estoque a dropar (gera os DROPs exatos)**

```sql
select 'drop function if exists '||p.oid::regprocedure||' cascade;'
from pg_proc p join pg_namespace n on n.oid=p.pronamespace
where n.nspname='public'
  and (p.proname like 'fn_estoque%' or p.proname like 'fn_abastec%'
       or p.proname like '%deposito%' or p.proname like '%_peps%'
       or pg_get_functiondef(p.oid) ~* '\b(estoque_movimentos|estoque_camadas|estoque_saldos|estoque_minimos|abastecimentos|depositos|leituras_equipamento)\b');
```
Guardar as linhas geradas para colar na migration (Step 2). Revisar a lista: não dropar funções que também são usadas por Manutenção/Medição (essas saem nas Tasks 6 e 7); em caso de dúvida, deixar para a task do módulo dono.

- [ ] **Step 2: Escrever a migration**

Criar `supabase/migrations/20260720120002_reforma_a_drop_estoque.sql`:
```sql
-- Reforma A: dropa o modulo Estoque e Combustivel.

-- 1) Sever a FK cruzada e dropar a coluna deposito_id da OC (era do estoque).
alter table public.oc_itens drop constraint if exists oc_itens_deposito_id_fkey;
alter table public.oc_itens drop column     if exists deposito_id;

-- 2) Dropar funcoes de estoque (colar as linhas geradas no Step 1).

-- 3) Dropar tabelas (filha -> pai).
drop table if exists public.abastecimentos;
drop table if exists public.estoque_camadas;
drop table if exists public.estoque_saldos;
drop table if exists public.estoque_minimos;
drop table if exists public.leituras_equipamento;
drop table if exists public.estoque_movimentos;
drop table if exists public.depositos;
```
Nota: `leituras_equipamento` era compartilhada com a previsão de Manutenção (que sai na Task 6); dropar aqui é seguro porque o app de Manutenção já foi removido na Task 1.

- [ ] **Step 3: Aplicar** via MCP `apply_migration` (name `20260720120002_reforma_a_drop_estoque`).

- [ ] **Step 4: Verificar**

```sql
select table_name from information_schema.tables where table_schema='public'
 and table_name in ('abastecimentos','estoque_camadas','estoque_saldos','estoque_minimos','leituras_equipamento','estoque_movimentos','depositos'); -- 0
select column_name from information_schema.columns where table_schema='public' and table_name='oc_itens' and column_name='deposito_id'; -- 0
```
Rodar `get_advisors`.

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/20260720120002_reforma_a_drop_estoque.sql
git commit -m "feat(db,reforma-a): dropa modulo Estoque e a coluna deposito_id da OC"
```

---

## Task 6: Migração — dropar Manutenção

**Files:**
- Create: `supabase/migrations/20260720120003_reforma_a_drop_manutencao.sql`

**Interfaces:**
- Consumes: schema de manutenção.
- Produces: tabelas e funções de manutenção inexistentes. **Mantém** o trigger `trg_equipamento_cria_etapa` e a função `fn_equipamento_cria_etapa_manutencao` (essenciais para o destino de custo por equipamento na Fase B).

- [ ] **Step 1: Listar as funções de manutenção a dropar**

```sql
select 'drop function if exists '||p.oid::regprocedure||' cascade;'
from pg_proc p join pg_namespace n on n.oid=p.pronamespace
where n.nspname='public'
  and p.proname <> 'fn_equipamento_cria_etapa_manutencao'
  and pg_get_functiondef(p.oid) ~* '\b(ordens_servico|os_pecas|os_mao_obra|os_terceiros|os_transicoes|checklists|checklist_perguntas|checklist_respostas|checklist_execucoes|planos_preventivos|plano_atividades|equipamento_planos)\b';
```
Guardar para colar. **Não** incluir `fn_equipamento_cria_etapa_manutencao` (o filtro já exclui).

- [ ] **Step 2: Escrever a migration**

Criar `supabase/migrations/20260720120003_reforma_a_drop_manutencao.sql`:
```sql
-- Reforma A: dropa o modulo Manutencao. Mantem o trigger de centro de custo do equipamento.

-- 1) Dropar funcoes de manutencao (colar linhas do Step 1; nunca fn_equipamento_cria_etapa_manutencao).

-- 2) Dropar tabelas (filha -> pai).
drop table if exists public.checklist_respostas;
drop table if exists public.checklist_execucoes;
drop table if exists public.checklist_perguntas;
drop table if exists public.checklists;
drop table if exists public.os_transicoes;
drop table if exists public.os_mao_obra;
drop table if exists public.os_terceiros;
drop table if exists public.os_pecas;
drop table if exists public.ordens_servico;
drop table if exists public.plano_atividades;
drop table if exists public.equipamento_planos;
drop table if exists public.planos_preventivos;
```

- [ ] **Step 3: Aplicar** via MCP `apply_migration` (name `20260720120003_reforma_a_drop_manutencao`).

- [ ] **Step 4: Verificar**

```sql
select table_name from information_schema.tables where table_schema='public'
 and table_name in ('checklists','checklist_perguntas','checklist_respostas','checklist_execucoes','ordens_servico','os_pecas','os_mao_obra','os_terceiros','os_transicoes','planos_preventivos','plano_atividades','equipamento_planos'); -- 0
-- trigger de equipamento -> centro de custo continua existindo:
select tgname from pg_trigger where tgname='trg_equipamento_cria_etapa'; -- 1 linha
```
Rodar `get_advisors`.

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/20260720120003_reforma_a_drop_manutencao.sql
git commit -m "feat(db,reforma-a): dropa modulo Manutencao (mantem trigger de CC do equipamento)"
```

---

## Task 7: Migração — dropar Medição

**Files:**
- Create: `supabase/migrations/20260720120004_reforma_a_drop_medicao.sql`

**Interfaces:**
- Consumes: `lancamentos.origem` (check `lancamentos_origem_check` inclui `fatura`,`os`); tabelas de medição.
- Produces: tabelas e funções de medição inexistentes; `lancamentos_origem_check` sem `fatura` e `os` (mantém `oc`,`manual`,`diaria`). `lancamentos` não tem FK para `faturas` (liga por `origem_id` polimórfico), então nenhum ALTER de FK é preciso do lado de lançamentos.

- [ ] **Step 1: Listar as funções de medição a dropar**

```sql
select 'drop function if exists '||p.oid::regprocedure||' cascade;'
from pg_proc p join pg_namespace n on n.oid=p.pronamespace
where n.nspname='public'
  and pg_get_functiondef(p.oid) ~* '\b(medicoes|medicao_itens|medicao_anexos|planilhas_contratuais|planilha_itens|faturas)\b';
```
Guardar (deve trazer `fn_aprovar_medicao`, `fn_cancelar_medicao`, `fn_desaprovar_medicao`, `fn_check_medicao_item_planilha`, `fn_check_medicao_planilha`, `fn_set_medicao_numero`).

- [ ] **Step 2: Escrever a migration**

Criar `supabase/migrations/20260720120004_reforma_a_drop_medicao.sql`:
```sql
-- Reforma A: dropa o modulo Medicao e desamarra a origem 'fatura' do lancamento.

-- 1) Dropar funcoes de medicao (colar linhas do Step 1).

-- 2) Dropar tabelas (filha -> pai).
drop table if exists public.medicao_anexos;
drop table if exists public.medicao_itens;
drop table if exists public.faturas;
drop table if exists public.medicoes;
drop table if exists public.planilha_itens;
drop table if exists public.planilhas_contratuais;

-- 3) Ajustar o CHECK de origem do lancamento (tira fatura e os; mantem oc, manual, diaria).
alter table public.lancamentos drop constraint if exists lancamentos_origem_check;
alter table public.lancamentos add  constraint lancamentos_origem_check
  check (origem in ('oc','manual','diaria'));
```
Nota: como o transacional será zerado na Task 9 e hoje 100% dos lançamentos são `origem='manual'`, o novo CHECK não conflita com dado existente. Ainda assim, aplicar o Task 7 antes do Task 9 é seguro (nenhuma linha tem `origem` em `fatura`/`os`).

- [ ] **Step 3: Aplicar** via MCP `apply_migration` (name `20260720120004_reforma_a_drop_medicao`).

- [ ] **Step 4: Verificar**

```sql
select table_name from information_schema.tables where table_schema='public'
 and table_name in ('medicoes','medicao_itens','medicao_anexos','planilhas_contratuais','planilha_itens','faturas'); -- 0
select pg_get_constraintdef(oid) from pg_constraint where conname='lancamentos_origem_check'; -- sem fatura/os
```
Rodar `get_advisors`.

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/20260720120004_reforma_a_drop_medicao.sql
git commit -m "feat(db,reforma-a): dropa modulo Medicao e ajusta origem do lancamento"
```

---

## Task 8: Migração — dropar Orçamentos

**Files:**
- Create: `supabase/migrations/20260720120005_reforma_a_drop_orcamentos.sql`

**Interfaces:**
- Consumes: tabelas `orcamentos`, `orcamento_itens` (auto-ref `parent_id`) e as funções/triggers de cálculo (`recalcular_orcamento` e trigger da folha do item).
- Produces: tabelas e funções de orçamento inexistentes.

- [ ] **Step 1: Listar funções/triggers de orçamento a dropar**

```sql
select 'drop function if exists '||p.oid::regprocedure||' cascade;'
from pg_proc p join pg_namespace n on n.oid=p.pronamespace
where n.nspname='public'
  and pg_get_functiondef(p.oid) ~* '\b(orcamentos|orcamento_itens)\b';
```
Guardar (deve trazer `recalcular_orcamento` e a(s) função(ões) de trigger de cálculo do item). `drop ... cascade` já remove os triggers dependentes.

- [ ] **Step 2: Escrever a migration**

Criar `supabase/migrations/20260720120005_reforma_a_drop_orcamentos.sql`:
```sql
-- Reforma A: dropa o add-on Orcamentos (EAP).

-- 1) Dropar funcoes/triggers de orcamento (colar linhas do Step 1).

-- 2) Dropar tabelas (itens auto-ref parent_id primeiro, via cascade da propria FK).
drop table if exists public.orcamento_itens;
drop table if exists public.orcamentos;
```

- [ ] **Step 3: Aplicar** via MCP `apply_migration` (name `20260720120005_reforma_a_drop_orcamentos`).

- [ ] **Step 4: Verificar**

```sql
select table_name from information_schema.tables where table_schema='public'
 and table_name in ('orcamentos','orcamento_itens'); -- 0
```
Rodar `get_advisors`.

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/20260720120005_reforma_a_drop_orcamentos.sql
git commit -m "feat(db,reforma-a): dropa add-on Orcamentos (EAP)"
```

---

## Task 9: Migração — limpar permissões e zerar transacional

**Files:**
- Create: `supabase/migrations/20260720120006_reforma_a_limpa_perms_zera_transacional.sql`

**Interfaces:**
- Consumes: `perfil_permissoes` e `usuario_permissoes` (linhas de recursos removidos); tabelas transacionais que ficam (`lancamentos`, `lancamento_parcelas`, `lancamento_rateios`, e o que cascatear).
- Produces: matriz de permissões sem recurso órfão; transacional zerado, começando limpo no modelo novo.

- [ ] **Step 1: Conferir o formato das tabelas de permissão**

```sql
select column_name from information_schema.columns
 where table_schema='public' and table_name in ('perfil_permissoes','usuario_permissoes') order by table_name, ordinal_position;
select distinct recurso from public.perfil_permissoes order by recurso;
```
Confirmar o nome da coluna que guarda o recurso (esperado `recurso`) e ver quais recursos removidos ainda aparecem.

- [ ] **Step 2: Escrever a migration**

Criar `supabase/migrations/20260720120006_reforma_a_limpa_perms_zera_transacional.sql`:
```sql
-- Reforma A: limpa permissoes orfas e zera o transacional.

-- 1) Apagar permissoes de recursos que sairam do catalogo.
delete from public.perfil_permissoes
 where recurso like 'estoque.%' or recurso like 'manutencao.%'
    or recurso like 'medicao.%' or recurso like 'gestao.%'
    or recurso in ('cadastros.orcamentos','cadastros.depositos',
                   'compras.pedidos','compras.recebimentos','compras.painel');
delete from public.usuario_permissoes
 where recurso like 'estoque.%' or recurso like 'manutencao.%'
    or recurso like 'medicao.%' or recurso like 'gestao.%'
    or recurso in ('cadastros.orcamentos','cadastros.depositos',
                   'compras.pedidos','compras.recebimentos','compras.painel');

-- 2) Zerar o transacional (cascade limpa parcelas, rateios, transacoes OFX e diarias/RH vinculadas).
truncate table public.lancamentos restart identity cascade;

-- 3) Reiniciar as sequencias de numeracao de documentos para comecar limpo.
update public.documento_sequencias set proximo_numero = 1;
```
Nota: `truncate ... cascade` em `lancamentos` limpa também `lancamento_parcelas`, `lancamento_rateios`, `extrato_transacoes` (via `parcela_id`) e `rh_diarias` (via `lancamento_id`). Todas são transacionais e o Tiago mandou zerar. Se `documento_sequencias` tiver colunas diferentes de `proximo_numero`, ajustar o UPDATE ao schema visto no Step 1.

- [ ] **Step 3: Aplicar** via MCP `apply_migration` (name `20260720120006_reforma_a_limpa_perms_zera_transacional`).

- [ ] **Step 4: Verificar**

```sql
select count(*) from public.lancamentos;                                   -- 0
select count(*) from public.lancamento_parcelas;                           -- 0
select count(*) from public.perfil_permissoes where recurso like 'estoque.%' or recurso like 'gestao.%'; -- 0
```
Rodar `get_advisors` (security + performance) uma última vez.

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/20260720120006_reforma_a_limpa_perms_zera_transacional.sql
git commit -m "feat(db,reforma-a): limpa permissoes orfas e zera transacional"
```

---

## Task 10: Verificação da Fase A + abrir PR

**Files:** nenhum novo (verificação e PR).

**Interfaces:**
- Consumes: tudo das tarefas anteriores.
- Produces: Fase A validada e PR aberto para review.

- [ ] **Step 1: Portão local completo**

```bash
cd /Users/tiagocameli/Documents/GitHub/erp-emt
npx tsc --noEmit && npm run -s lint && npm run -s build && npm run -s test
```
Expected: tudo verde (os testes dos módulos removidos saíram junto com o código; se algum teste remanescente referencia módulo removido, remover o teste).

- [ ] **Step 2: Conferir o app rodando (dev ou preview)**

Subir `npm run dev` (ou abrir o preview da Vercel da branch) e conferir logado como Admin:
- Sidebar mostra só: Compras, Financeiro, RH, Cadastros, Administração.
- Compras mostra só Cotações e Ordens de compra.
- Rotas removidas dão 404: `/estoque`, `/manutencao`, `/medicao`, `/gestao`, `/cadastros/orcamentos`, `/cadastros/depositos`, `/compras/pedidos`, `/compras/recebimentos`, `/compras/painel`.
- Criar uma obra e um equipamento de teste e confirmar (via `select` em `centros_custo`) que o centro de custo raiz da obra e o nó do equipamento continuam sendo criados.

- [ ] **Step 3: Advisors limpos**

Rodar `get_advisors` security e performance no projeto e confirmar que não há achado novo introduzido pela Fase A. Anotar qualquer achado pré-existente que não seja desta fase.

- [ ] **Step 4: Abrir o PR**

```bash
git push -u origin reforma-3-modulos
gh pr create --title "Reforma Fase A: remocao de modulos + migracao" \
  --body "$(cat <<'EOF'
Enxuga o ERP para Compras (Cotacoes + OC), Financeiro, RH, mais Cadastros e Administracao.

Remove do app e do banco: Estoque, Manutencao, Medicao, Gestao, Orcamentos; e as abas Pedidos, Recebimentos e Painel de Compras, Depositos e Orcamentos de Cadastros.

- 6 migrations versionadas (enxuga compras, drop estoque/manutencao/medicao/orcamentos, limpa permissoes e zera transacional).
- Mantem o trigger de centro de custo do equipamento (base da Fase B).
- Transacional zerado; cadastros preservados.

Spec: docs/superpowers/specs/2026-07-20-reforma-compras-financeiro-rh-design.md
Plano: docs/superpowers/plans/2026-07-20-reforma-fase-a-remocao-migracao.md

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
)"
```

- [ ] **Step 5: Confirmar CI verde e pedir validação do Tiago no preview**

Aguardar o CI (typecheck, lint, testes, build) verde no PR e o preview da Vercel no ar. Pedir a validação do Tiago antes do merge.

---

## Self-Review (feito na escrita do plano)

- **Cobertura do spec (Fase A):** remoção de Estoque/Manutenção/Medição/Gestão (Task 1) ✓; remoção de Orçamentos + Depósitos (Task 2) ✓; Compras só Cotações+OC (Tasks 3 e 4) ✓; desamarrar Medição do Financeiro (Task 7) ✓; zerar transacional + manter cadastros (Task 9) ✓; drop em ordem de FK (Tasks 4-8) ✓; limpar permissões órfãs (Task 9) ✓; advisors (todas as tasks de migração) ✓. As partes de destino de custo, OC→lançamento, contas a receber, RH e anexos são das Fases B-F (fora deste plano, por decisão de faseamento).
- **Placeholder scan:** os únicos "colar aqui o corpo" são passos que exigem ler o corpo atual da função no banco (Steps de busca imediatamente antes), com o bloco exato a remover indicado. Não há TODO/TBD solto.
- **Consistência de nomes:** constraints (`oc_itens_deposito_id_fkey`, `cotacoes_pedido_id_fkey`, `ordens_compra_pedido_id_fkey`, `ordens_compra_status_check`, `lancamentos_origem_check`), funções (`fn_desaprovar_ordem_compra`, `fn_registrar_recebimento`, `fn_equipamento_cria_etapa_manutencao`, `fn_recurso_do_anexo`, `fn_recurso_do_path_anexo`) e tabelas conferidos contra o recon do schema vivo.
