# Dados pessoais + dependentes do colaborador (#9) — Plano

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:subagent-driven-development, tarefa a tarefa. Passos usam checkbox (`- [ ]`).

**Goal:** Estruturar os dados pessoais do colaborador (RG, CTPS, PIS, CNH, escolaridade, CBO, dados eSocial) como colunas em `colaboradores`, e criar `rh_dependentes` (1:N, com flags de folha), com form, ficha e CRUD de dependentes. Sem inventar regra fiscal.

**Architecture:** Migration expand-only com colunas novas + enums check em `colaboradores`; migration da tabela `rh_dependentes` (RLS/grants/auditoria espelhando uma tabela de RH viva). Backend: schema/queries/actions do colaborador ganham os campos; módulo de dependentes (queries + actions gated por `cadastros.colaboradores`). UI: seções novas no form-drawer, seção de dependentes editável no modo edição (padrão anexos), e a ficha mostra dados pessoais + dependentes read-only. Migrations via MCP no projeto vivo `vsesgvqjgqpapoxhnbqx`, lendo o estado vivo antes.

**Tech Stack:** Next.js 16 (TS strict), Supabase (RLS) via MCP, RHF+Zod, Vitest, canônicos (SecaoFormulario/LinhaCampos/Combobox/SecaoDetalhe). Branch: `feat-rh-dados-pessoais`.

Spec: `docs/superpowers/specs/2026-07-24-rh-dados-pessoais-design.md`.

## Global Constraints
- Não inventar regra fiscal/trabalhista: só guardar campos e flags; enums amigáveis (mapear pro eSocial no Bloco 10). RG/CTPS/CNH estruturados convivem com os anexos.
- RLS/grants/auditoria: `rh_dependentes` nasce com RLS + policies + grants explícitos + trigger de auditoria, espelhando uma tabela de RH viva (ler antes). Permissão tripla: dependentes gated por `cadastros.colaboradores` (RLS + Server Action + UI).
- Datas `date`; sem TZ shift na exibição (formatador do projeto). Dinheiro não se aplica aqui.
- Combobox canônico (com busca) em todo select. Migrations via MCP + `.sql` versionado; `get_advisors` depois; regenerar tipos após DDL. Ambiente: limpar `.next` dup antes do typecheck.
- Portão por tarefa: typecheck/lint/build verdes; testes existentes verdes; sem any novo, sem console.log. Commit termina com `Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>`.

---

## Task 1: Migrations — colunas em `colaboradores` + tabela `rh_dependentes`

**Files:** Create `supabase/migrations/<ts>_colaborador_dados_pessoais.sql`, `supabase/migrations/<ts>_rh_dependentes.sql`; Modify `src/lib/database.types.ts` (regen).

**Interfaces:**
- Produces: colunas novas em `colaboradores` (rg, rg_orgao, rg_uf, ctps_numero, ctps_serie, ctps_uf, pis, cnh_numero, cnh_categoria, cnh_validade, escolaridade, data_nascimento, nome_mae, nacionalidade, estado_civil, raca_cor, titulo_eleitor, reservista, cbo); tabela `rh_dependentes` (id, colaborador_id, nome, data_nascimento, parentesco, cpf, dependente_irrf, dependente_salario_familia, timestamps).

- [ ] **Step 1: Ler o vivo** — `pg_get_functiondef`/definição de uma tabela de RH existente pra espelhar RLS/grants/trigger: rodar, via MCP, `select tablename, policyname, cmd, qual, with_check from pg_policies where tablename='rh_documentos';` e ver os grants (`\dp`-equivalente: `select grantee, privilege_type from information_schema.role_table_grants where table_name='rh_documentos'`) e o trigger de auditoria (procurar em `supabase/migrations/` a criação de `rh_documentos`/o trigger `audit`). Confirmar a função de auditoria usada (ex.: `fn_auditoria`/`audit_trigger`) e como `created_by` é setado.

- [ ] **Step 2: Migration das colunas** — `alter table public.colaboradores add column if not exists rg text, ... , add column if not exists cbo text;` (todas as 19 colunas da spec). Depois os checks:
```sql
alter table public.colaboradores add constraint colaboradores_escolaridade_check check (escolaridade is null or escolaridade in ('analfabeto','fundamental_incompleto','fundamental_completo','medio_incompleto','medio_completo','superior_incompleto','superior_completo','pos_graduacao','mestrado','doutorado'));
alter table public.colaboradores add constraint colaboradores_estado_civil_check check (estado_civil is null or estado_civil in ('solteiro','casado','divorciado','viuvo','uniao_estavel','separado_judicialmente'));
alter table public.colaboradores add constraint colaboradores_raca_cor_check check (raca_cor is null or raca_cor in ('branca','preta','parda','amarela','indigena'));
alter table public.colaboradores add constraint colaboradores_cnh_categoria_check check (cnh_categoria is null or cnh_categoria in ('A','B','C','D','E','AB','AC','AD','AE'));
```
Aplicar via `apply_migration`. Rollback documentado (drop constraints + drop columns).

- [ ] **Step 3: Migration da tabela `rh_dependentes`** — criar a tabela com as colunas da spec; `parentesco` check in ('conjuge','companheiro','filho','enteado','tutelado','pai','mae','outro'); FK `colaborador_id references public.colaboradores(id)`. **RLS on**; policies espelhando `rh_documentos` (select `tem_permissao('cadastros.colaboradores','ver')`, insert with_check `criar`, update `editar`, delete `excluir`); **grants explícitos** ao `authenticated` só de select/insert/update/delete (nada pro `anon`); **trigger de auditoria** igual às outras tabelas de RH (usar a mesma função/gatilho lido no Step 1). Aplicar via `apply_migration`; rodar `get_advisors` (security) e confirmar que NÃO sobra `rls_enabled_no_policy` nem grant indevido pra tabela nova. Rollback = `drop table public.rh_dependentes`.

- [ ] **Step 4: Regenerar tipos + portão** — `generate_typescript_types` → atualizar `src/lib/database.types.ts` (extrair de `{"types":"..."}`). Limpar `.next` dup; `typecheck`. Commit: `feat(db): dados pessoais em colaboradores + tabela rh_dependentes`.

---

## Task 2: Backend do colaborador (campos novos) + módulo de dependentes

**Files:** Modify `src/modules/cadastros/colaboradores/{schemas,queries,actions}.ts`; Create `src/modules/cadastros/colaboradores/dependentes.ts` (queries+actions) e `dependentes-schemas.ts` (+ teste); Modify o teste de schemas existente se precisar.

**Interfaces:**
- Consumes: colunas da Task 1; `exigirPermissao`/padrão de action do projeto.
- Produces:
  - Campos novos no `colaboradorSchema` e no shape de `queries.listar`/`buscar`/`actions` (camelCase: rg, rgOrgao, rgUf, ctpsNumero, ctpsSerie, ctpsUf, pis, cnhNumero, cnhCategoria, cnhValidade, escolaridade, dataNascimento, nomeMae, nacionalidade, estadoCivil, racaCor, tituloEleitor, reservista, cbo).
  - `type Dependente = { id; colaboradorId; nome; dataNascimento: string|null; parentesco: string; cpf: string|null; dependenteIrrf: boolean; dependenteSalarioFamilia: boolean }`.
  - `listarDependentes(colaboradorId: string): Promise<Dependente[]>`.
  - `salvarDependente(input): Promise<ResultadoAcao>` (id opcional = criar/editar; checa `cadastros.colaboradores` criar quando novo / editar quando existente).
  - `removerDependente(id: string): Promise<ResultadoAcao>` (checa `cadastros.colaboradores` excluir).

- [ ] **Step 1: Ler** `schemas.ts`/`queries.ts`/`actions.ts` atuais do colaborador (padrão de mapeamento camelCase↔snake_case, `textoOpcional`, enums) e um módulo com ação por-registro pra espelhar (ex.: `compras/_shared/anexos-actions.ts` — `exigirPermissao`, `erroAcao`, revalidate). Ler os enums da spec.

- [ ] **Step 2: Zod (falha primeiro)** — em `schemas.ts`, adicionar os campos novos (texto opcional; datas opcionais como `textoOpcional` de data; enums opcionais via `z.enum(...).nullable()` pros 4 enums, exportando as constantes `ESCOLARIDADES`/`ESTADOS_CIVIS`/`RACAS_COR`/`CNH_CATEGORIAS` + rótulos). Em `dependentes-schemas.ts`, o `dependenteSchema` (nome min 2; parentesco enum; datas/cpf opcionais; flags boolean com default false) + `PARENTESCOS`+rótulos. Escrever/expandir os testes Vitest cobrindo os enums e o dependente (nome vazio falha; parentesco inválido falha; flags default false). Rodar → FAIL.

- [ ] **Step 3: Implementar** — `queries.ts`/`actions.ts` do colaborador leem/gravam as colunas novas (mapear todos os campos). `dependentes.ts`: `listarDependentes` (server-only, filtra por colaborador, ordena por nascimento/nome), `salvarDependente` (Zod + `exigirPermissao` criar/editar + upsert), `removerDependente` (`exigirPermissao` excluir + delete). Rodar testes → PASS.

- [ ] **Step 4: Portão + commit** — `typecheck/lint/test`. Commit: `feat(rh): backend de dados pessoais e dependentes do colaborador`.

---

## Task 3: UI — seções no form + dependentes + ficha

**Files:** Modify `src/modules/cadastros/colaboradores/components/colaboradores-form-drawer.tsx`, `components/ficha-colaborador.tsx`; Create `components/dependentes-secao.tsx` (+ `dependente-form-drawer.tsx` ou inline).

- [ ] **Step 1: Ler** o `colaboradores-form-drawer.tsx` atual (seções Remuneração/Dados bancários já existem — copiar o padrão `SecaoFormulario`+`LinhaCampos`+`Combobox`), a `ficha-colaborador.tsx` (como monta `SecaoDetalhe` e gateia por permissão), e como os anexos ligam a seção só em modo edição com dados buscados no server (`documento-form-drawer.tsx`/`documentos-tabela.tsx`, padrão do #10).

- [ ] **Step 2: Seções no form** — adicionar `SecaoFormulario`: **Documentos pessoais** (RG+rgOrgao+rgUf, CTPS+serie+uf, PIS), **CNH** (número, categoria via `Combobox` das CNH_CATEGORIAS, validade), **Dados pessoais** (dataNascimento, escolaridade/estadoCivil/racaCor via `Combobox`, nacionalidade, nomeMae, tituloEleitor, reservista), **Ocupação** (cbo). Registrar os campos no RHF; preservar todos os campos atuais. Combobox canônico em todo select.

- [ ] **Step 3: Dependentes** — `dependentes-secao.tsx`: recebe `dependentesIniciais` (buscados no server via `listarDependentes` e passados pela page/drawer) e `podeEditar`/`podeExcluir`. Lista os dependentes; "Adicionar dependente" abre um mini-form (drawer/dialog canônico) com nome, nascimento, parentesco (`Combobox` PARENTESCOS), cpf, flags IRRF/salário-família; salvar chama `salvarDependente`; editar/remover idem. Só aparece em modo edição (colaborador com id). Toast + refresh. Colocar a seção no `colaboradores-form-drawer.tsx` (modo edição) do mesmo jeito que os anexos entraram.

- [ ] **Step 4: Ficha** — em `ficha-colaborador.tsx`, mostrar os dados pessoais novos (na seção de cadastro, que já é gateada por `cadastros.colaboradores` ver) e uma `SecaoDetalhe` **Dependentes** read-only (nome, parentesco, nascimento, flags). Buscar dependentes no server na page da ficha e passar.

- [ ] **Step 5: Portão + validação local** — limpar `.next` dup; `typecheck/lint/test/build`; `npm run dev`: abrir o cadastro, preencher os campos, salvar, adicionar/remover um dependente, abrir a ficha. Commit: `feat(rh): dados pessoais e dependentes no cadastro e na ficha`.

---

## Task 4: Verificação final + preview

- [ ] **Step 1: Portão final** (limpar `.next`) `typecheck/lint/test/build` verde; `get_advisors` sem novo (fora o esperado; a tabela nova NÃO pode aparecer em `rls_enabled_no_policy`).
- [ ] **Step 2: Preview** push; roteiro: preencher RG/CTPS/PIS/CNH/escolaridade/CBO/dados eSocial num colaborador; adicionar 2 dependentes (um IRRF, um salário-família); abrir a ficha e ver os dados + dependentes; conferir que sem `cadastros.colaboradores` a coisa some.
- [ ] **Step 3: Merge após OK do Tiago** `git checkout main && git merge --no-ff feat-rh-dados-pessoais ... && git push origin main`.

---

## Self-review (feito ao escrever)
- **Cobertura do spec:** colunas+enums em colaboradores e tabela rh_dependentes com RLS/grants/auditoria (T1); Zod+queries+actions do colaborador e módulo de dependentes gated por cadastros.colaboradores (T2); seções no form + dependentes editável (padrão anexos) + ficha read-only (T3); verificação (T4). Fora de escopo (cálculo IRRF/salário-família, códigos eSocial, validação CBO) não entra. Coberto.
- **Placeholders:** tabela de RH viva (RLS/grant/trigger) e os arquivos atuais têm "ler antes"; `<ts>` = timestamp. Enums 100% listados. Sem TODO solto.
- **Consistência:** as 19 colunas (T1) usadas no schema/queries (T2) e no form/ficha (T3); `rh_dependentes` (T1) consumida por `listarDependentes`/`salvarDependente`/`removerDependente` (T2) e pela seção de dependentes + ficha (T3); enums (ESCOLARIDADES/ESTADOS_CIVIS/RACAS_COR/CNH_CATEGORIAS/PARENTESCOS) definidos na T2 e usados na T3; tudo gateado por `cadastros.colaboradores`.
