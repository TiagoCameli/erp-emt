# Dias de equipamento por centro de custo — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Registrar, para cada dia, em qual centro de custo cada equipamento do Mapa ficou. Mostrar
esses dias num relatório mensal e na ficha da máquina.

**Architecture:** O dia é fechado às 23:59 de Rio Branco, por um cron no mesmo horário da foto do
Mapa. O fechamento lê o estado **efetivo** de cada máquina na `v_mapa_equipamentos`, aplica a
regra do desenho e grava uma linha por (dia, equipamento) em `equipamento_dias_centro`. O dia de
hoje, ainda aberto, é calculado ao vivo pela mesma regra. Os dias que já têm foto
(`mapa_snapshots`) são preenchidos pela regra na implantação.

**Desvio do desenho (decidido na implementação):** o desenho sugeria períodos abertos e fechados
por trigger. Isso não funciona aqui porque o estado efetivo não é uma coluna: a view o calcula a
partir de `equipamentos.status`, da OS em execução e da posição. Um trigger em
`mapa_equipamentos` perderia essas mudanças. O fechamento diário na hora do fim do dia é
exatamente a regra "o dia vai para onde terminou". A correção retroativa por `data_efetiva` fica
fora desta entrega: o dia fechado não muda. O dia de hoje pode ser refechado
(`fn_equip_dias_fechar(hoje)` é idempotente).

**Tech Stack:** Postgres/Supabase (plpgsql, pg_cron), Next.js 15 App Router, TS strict, vitest,
exceljs.

**Spec:** `docs/superpowers/specs/2026-10-16-equipamento-dias-por-centro-design.md`

## Global Constraints

- Fuso do dia: `America/Rio_Branco`. Cron `'59 4 * * *'` (23:59 Acre = 04:59 UTC).
- Centro novo: nome `Equipamento Sem Alocação`, nível 1, `pai_id` nulo, `sistema = true`,
  `papel_rateio = 'indireto'`, **tipo `'equipamento'`** (nunca `'escritorio'`).
- O centro de uma obra é a raiz: `centros_custo` com `obra_id = <obra>`, `pai_id is null`,
  `nivel = 1`.
- Carreta EMT = `public.fn_mapa_carreta_emt(equipamento_id)` (v1.22). A obra dela é
  `public.fn_mapa_obra_carretas_emt()`.
- Implemento = `equipamentos.tipo = 'Implementos'`, acoplado em `equipamentos.acoplado_em`.
- Toda escrita via função `security definer` com `set search_path to ''`. Grants:
  `revoke all ... from public, anon` + `grant execute ... to authenticated`.
- A migration é aditiva (sem `drop` de objeto existente) e não reescreve nenhuma função do Mapa.

## A regra (fonte única: `public.fn_equip_centro_regra`)

Entrada: `estado_efetivo`, `obra_id`, `varios_centros`, `carreta_emt`. Saída: `(centro_custo_id, motivo)`.
A primeira linha que casa vence:

| # | Condição | centro | motivo |
|---|---|---|---|
| 1 | `estado_efetivo = 'fora_funcionamento'` | nenhum (não grava linha) | — |
| 2 | `carreta_emt` | raiz da obra `fn_mapa_obra_carretas_emt()` | `carreta_emt` |
| 3 | `estado_efetivo = 'operando'` e `varios_centros` | Sem Alocação | `varios_centros` |
| 4 | `estado_efetivo = 'operando'` e `obra_id` nulo | Sem Alocação | `sem_obra` |
| 5 | `estado_efetivo = 'operando'` e a obra sem centro raiz | Sem Alocação | `obra_sem_centro` |
| 6 | `estado_efetivo = 'operando'` | raiz da obra | `obra` |
| 7 | qualquer outro estado (parado, em_rota, quebrado_obra, conserto, sem_posicao, nulo) | Sem Alocação | o próprio estado (`'sem_estado'` se nulo) |

Implemento acoplado: herda `(centro, motivo)` da máquina hospedeira no mesmo dia, com
`motivo = 'acoplado'` e `acoplado_em` preenchido. Se a hospedeira não tem linha no dia, o
implemento também não tem.

## Review Focus

1. **Máquina alugada fora do mapa** (`no_mapa = false`): não gera linha nenhuma. Um equipamento
   inativo também não.
2. **Rodar o fechamento duas vezes no mesmo dia** (cron + refechamento manual): o resultado é o
   mesmo número de linhas, sem duplicar (`on conflict (dia, equipamento_id) do update`).
3. **Obra sem centro raiz:** cai em Sem Alocação com motivo `obra_sem_centro`, sem erro e sem
   `null` em `centro_custo_id`.
4. **Mês corrente no relatório:** soma os dias fechados com o dia de hoje calculado ao vivo, e um
   mesmo dia nunca aparece duas vezes.
5. **Centro novo no rateio indireto:** com custo zero, a soma dos percentuais e a lista de
   `fn_rel_custos_indiretos` não quebram. É conferido na prova do Task 1 chamando a função do ano.

---

### Task 1: Banco — centro, marca, tabela, regra, fechamento, cron, carga dos dias já fotografados, RPCs

**Files:**
- Create: `supabase/migrations/20261016203100_equipamento_dias_por_centro.sql`. Antes de nomear,
  conferir que a versão está livre no ledger
  (`select version from supabase_migrations.schema_migrations where version >= '20261016'`).
- Create: `supabase/tests/equipamento_dias_por_centro_prova.sql`, um bloco `do` que termina em
  `raise exception` com o relatório, para sempre desfazer.

**Interfaces (Produces):**
- `centros_custo.tipo` check passa a aceitar `'equipamento'`.
- `configuracoes` chave `'mapa.centro_sem_alocacao'` = id do centro novo.
  `public.fn_mapa_centro_sem_alocacao() returns uuid`, no molde de `fn_mapa_obra_carretas_emt`.
- `mapa_equipamentos.varios_centros boolean not null default false`.
- Tabela `public.equipamento_dias_centro(dia date, equipamento_id uuid → equipamentos, centro_custo_id uuid not null → centros_custo, motivo text not null, estado text, obra_id uuid → obras, acoplado_em uuid → equipamentos, fechado_em timestamptz not null default now(), primary key (dia, equipamento_id))`,
  com índice `(centro_custo_id, dia)` e RLS ligada. Só policy de select:
  `tem_permissao('mapa.mapa','ver') or tem_permissao('mapa.historico','ver')`. Sem grants de
  escrita para `authenticated`.
- `public.fn_equip_centro_regra(p_estado text, p_obra uuid, p_varios boolean, p_carreta boolean) returns table(centro_custo_id uuid, motivo text)`: `stable`, segue a tabela da regra acima.
- `public.fn_equip_dias_calcular(p_data date) returns table(equipamento_id uuid, centro_custo_id uuid, motivo text, estado text, obra_id uuid, acoplado_em uuid)`:
  - estado **atual** de `v_mapa_equipamentos`, filtrado por `ativo and no_mapa`;
  - `varios_centros` vem de `mapa_equipamentos`;
  - inclui os implementos acoplados;
  - não grava nada; é ela que serve o "hoje ao vivo".
- `public.fn_equip_dias_fechar(p_data date default null) returns int`:
  - `security definer`;
  - `p_data` nulo vira hoje em Rio Branco;
  - recusa data diferente de hoje ("só o dia de hoje pode ser fechado");
  - se houver `auth.uid()`, exige `fn_mapa_exigir('editar')`; o cron roda sem usuário;
  - faz upsert de `fn_equip_dias_calcular(p_data)` e apaga as linhas do dia que não vieram mais
    (máquina que saiu do mapa no meio do dia);
  - devolve o número de linhas.
- Cron: `select cron.schedule('equip_dias_centro_diario', '59 4 * * *', $$select public.fn_equip_dias_fechar()$$);`,
  dentro de um bloco que só agenda se o job não existir (`cron.job where jobname = ...`).
- Carga do passado:
  - para cada `mapa_snapshots` com data menor que hoje, aplicar `fn_equip_centro_regra` a cada
    elemento de `estado->'equipamentos'` (`estado_efetivo`, `obra_id`, `varios_centros` = false,
    `fn_mapa_carreta_emt(equipamento_id)`);
  - fazer o mesmo para os implementos com `acoplado_em` hoje, como aproximação;
  - `on conflict do nothing`.
- `public.fn_mapa_marcar_varios_centros(p_id uuid, p_valor boolean) returns void`:
  - `fn_mapa_exigir('editar')`;
  - atualiza `mapa_equipamentos.varios_centros`;
  - registra em `mapa_movimentacoes` com tipo `'centro'`, ampliando o check de tipo a partir da
    lista **viva** (as 8 de hoje + `'centro'`), com `de/para = {"varios_centros": bool}` e motivo
    `'Atende vários centros: ligado'` ou `'... desligado'`.
- `public.fn_mapa_centros_equipamento(p_id uuid) returns jsonb`:
  - exige `mapa.mapa` ver;
  - devolve
    `{ varios_centros, atual: {centro_id, centro_nome, motivo, desde}, mes: [{centro_id, centro_nome, dias}], periodos: [{centro_id, centro_nome, motivo, de, ate, dias}] }`;
  - "desde" é o primeiro dia do período atual;
  - os períodos juntam dias consecutivos com o mesmo centro e motivo (gaps-and-islands), dos
    últimos 90 dias, mais recentes primeiro;
  - o mês e o atual incluem o hoje ao vivo.
- `public.fn_mapa_rel_dias_centro(p_mes date) returns table(equipamento_id uuid, codigo text, descricao text, propriedade text, centro_custo_id uuid, centro_nome text, dias int)`:
  - exige `mapa.historico` ver;
  - usa as linhas fechadas do mês e, se o mês contém hoje, o hoje ao vivo, sem duplicar se o
    hoje já foi fechado.

- [ ] **Step 1:** Escrever a prova (`supabase/tests/...`), que roda tudo dentro de uma transação desfeita:
  - (a) a regra, linha a linha da tabela, com obra real e obra fictícia sem centro;
  - (b) `fn_equip_dias_fechar()` duas vezes, com a mesma contagem;
  - (c) uma máquina `parado` cai em Sem Alocação; ligar `varios_centros` numa `operando` cai em
    Sem Alocação; desligar cai na raiz da obra;
  - (d) uma carreta EMT vai para a raiz de 001;
  - (e) um implemento acoplado herda da hospedeira;
  - (f) `fn_rel_custos_indiretos(2026)` roda;
  - (g) linha de controle: o total de linhas do dia é igual a
    `count(*)` de `v_mapa_equipamentos where ativo and no_mapa and estado_efetivo <> 'fora_funcionamento'`
    mais os implementos acoplados nessas máquinas.
- [ ] **Step 2:** Rodar a prova contra o banco vivo antes da migration. Esperado: falha porque `fn_equip_centro_regra` não existe.
- [ ] **Step 3:** Escrever a migration (a `begin;`/`commit;` vai no arquivo de aplicação, em `$CLAUDE_JOB_DIR/tmp`, com o insert no ledger).
- [ ] **Step 4:** Aplicar com `supabase db query --linked -f` e rodar a prova. Esperado: a `raise exception` final traz o relatório com todas as asserções OK.
- [ ] **Step 5:** Conferir pelo banco:
  - `select jobname, schedule from cron.job`: o job novo está lá;
  - `select count(*) from equipamento_dias_centro group by dia`: há um dia para cada foto passada;
  - os advisors de segurança passam sem item novo.
- [ ] **Step 6:** Regenerar `src/lib/database.types.ts` só nos trechos novos (tabela, 5 funções e
  a coluna nova). É edição manual, porque regenerar o arquivo inteiro apaga as edições à mão.
- [ ] **Step 7:** Commit.

### Task 2: Regras puras de exibição e a ficha da máquina

**Files:**
- Create: `src/modules/mapa/centros.ts`. É puro, sem `server-only`. Tem os tipos
  `CentrosEquipamento`, `RelDiasCentroLinha`, `ROTULO_MOTIVO_CENTRO: Record<string,string>`,
  `paraCentrosEquipamento(json: unknown): CentrosEquipamento | null` e
  `agruparRelatorio(linhas: RelDiasCentroLinha[]): {equipamentos: {id, codigo, descricao, propriedade, centros: {id, nome, dias}[], total}[], centros: {id, nome, total}[]}`.
- Create: `src/modules/mapa/centros.test.ts`.
- Modify: `src/modules/mapa/actions.ts`. Acrescenta `carregarCentrosEquipamento(equipamentoId)`,
  que pede só ver (molde de `carregarFichaEquipamento`), e `marcarVariosCentros(dados)`, com
  `semPermissao("editar")` e um schema zod `{ equipamentoId: id, valor: boolean }` em `schemas.ts`.
- Create: `src/modules/mapa/components/centros-equipamento.tsx`. É `"use client"`, no molde de
  `numeros-equipamento.tsx`. Mostra:
  - o centro atual e desde quando;
  - o interruptor "Atende vários centros", que só aparece com permissão de editar e recarrega
    depois de gravar;
  - os dias do mês por centro;
  - os períodos;
  - o link "Ver relatório", que leva a `/mapa/dias-por-centro?mes=AAAA-MM`.
- Modify: `src/modules/mapa/components/ficha-equipamento.tsx`, para montar o bloco "Centros de
  custo" com `key={equipamentoId}`, ao lado de `NumerosEquipamento`. Implemento não mostra o
  interruptor.

Rótulos de motivo (copy fixa):

| motivo | rótulo |
|---|---|
| `obra` | Operando na obra |
| `carreta_emt` | Carreta EMT |
| `varios_centros` | Atende vários centros |
| `sem_obra` | Operando sem obra |
| `obra_sem_centro` | Obra sem centro de custo |
| `parado` | Parado |
| `em_rota` | Em rota |
| `quebrado_obra` | Quebrado na obra |
| `conserto` | Em conserto |
| `sem_posicao` | Sem posição no mapa |
| `acoplado` | Acoplado |

Motivo desconhecido mostra o texto cru.

- [ ] **Step 1:** Testes em `centros.test.ts`:
  - `paraCentrosEquipamento` aceita o JSON do Task 1 e devolve `null` para formato errado;
  - `agruparRelatorio` com 2 máquinas × 2 centros dá totais por máquina e por centro corretos,
    com os centros ordenados por total desc e os equipamentos por código;
  - `ROTULO_MOTIVO_CENTRO` cobre os 11 motivos.
- [ ] **Step 2:** `npx vitest run src/modules/mapa/centros.test.ts --environment=node`. Esperado: FAIL, porque o módulo não existe.
- [ ] **Step 3:** Implementar `centros.ts`, as actions e o componente, e ligar na ficha.
- [ ] **Step 4:** Rodar os testes (PASS) e `npx tsc --noEmit` (sem erros novos). Rodar com o sandbox desligado.
- [ ] **Step 5:** Commit.

### Task 3: Relatório mensal `/mapa/dias-por-centro` com Excel

**Files:**
- Create: `src/app/(app)/mapa/dias-por-centro/page.tsx` e `loading.tsx`, no molde de
  `/mapa/historico`, com `notFound()` sem `mapa.historico` ver. O mês vem de `?mes=AAAA-MM`; se
  não vier ou for inválido, usa o mês corrente.
- Create: `src/modules/mapa/centros-queries.ts`, com `server-only` e
  `carregarRelDiasCentro(mes: string)`, que chama `fn_mapa_rel_dias_centro`.
- Create: `src/modules/mapa/components/rel-dias-centro.tsx`. É client e tem:
  - a escolha do mês (prev/next) e o filtro próprio/alugado, os dois na URL;
  - uma tabela com equipamento nas linhas, centros nas colunas e total;
  - a linha de totais por centro;
  - o botão "Exportar Excel".
- Create: `src/modules/mapa/centros-planilha.ts`, que escreve com exceljs e
  `escreverCabecalhoMarca` / `estilizarCabecalhoColunas` (`src/lib/planilha-marca.ts`). Ele
  recebe o resultado de `agruparRelatorio` e devolve base64.
- Modify: `src/modules/mapa/actions.ts`, com `gerarPlanilhaDiasCentro(mes)`. O padrão é
  `gerarPlanilhaCombustivel`: import dinâmico do módulo da planilha e retorno
  `{ok, base64, nome}`, baixado com `baixarBase64`.
- Modify: `src/app/(app)/mapa/historico/page.tsx`, com uma ação no cabeçalho, "Dias por centro",
  que leva ao relatório.
- Test: `src/modules/mapa/centros-planilha.test.ts`. A planilha de 2 máquinas tem uma linha por
  máquina mais a de totais, e a coluna Total bate com `agruparRelatorio`.

- [ ] **Step 1:** Escrever o teste da planilha e confirmar que falha.
- [ ] **Step 2:** Implementar a planilha, a query, a página, o componente e a ação.
- [ ] **Step 3:** Rodar vitest (PASS) e `tsc` (limpo).
- [ ] **Step 4:** Commit.

### Task 4: Entrega

- [ ] Rebase em `origin/main`. Antes, reler se alguma migration nova do Mapa mexeu em
  `mapa_movimentacoes_tipo_check`. Se mexeu, refazer o check a partir da lista viva.
- [ ] Push, `gh pr create`, esperar o CI, `gh pr merge --squash` e conferir o deploy de produção
  no SHA.
- [ ] Conferir no banco que `fn_mapa_rel_dias_centro(<mês corrente>)` devolve linhas.
