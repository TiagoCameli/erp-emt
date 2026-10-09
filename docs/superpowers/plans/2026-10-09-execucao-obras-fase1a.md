# Execução de Obras, Fase 1a (banco base, calendário, CPM e grade): plano de implementação

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Deixar no ar o núcleo do módulo Execução: pastas por obra (derivadas), cronogramas, locais, EAP e atividades, calendário com feriados, motor CPM no banco e a grade estilo planilha para montar e editar o cronograma, com acesso por lista de usuários de cada obra.

**Architecture:** Tudo com prefixo `ex_`. Leitura por RLS (quem vê o módulo E está na lista da obra); escrita só por RPC `security definer` que confere a ação e a lista. Datas, folgas e caminho crítico saem de uma única função SQL (`fn_ex_cpm_calcular`); o cache `ex_atividade_datas` só é gravado por `fn_ex_cpm_recalcular`, chamada pelas RPCs na mesma transação. O TypeScript lê, formata e desenha; nunca calcula data.

**Tech Stack:** Supabase Postgres 17 (MCP `apply_migration` / `execute_sql`), Next.js 16 App Router, React 19, TypeScript strict, TanStack Table 8 + TanStack Virtual 3, Zod 4, React Hook Form, Vitest 4.

**Spec:** `docs/superpowers/specs/2026-10-09-execucao-obras-design.md` (ler inteira antes da Task 1, inclusive as emendas de 09/10 no fim da seção 14).

## Global Constraints

- Branch `obras-execucao-spec` (já tem o spec e este plano), worktree `/Users/tiagocameli/Documents/GitHub/erp-emt/.claude/worktrees/obras-execucao-spec`. Antes de começar: `git fetch origin && git rebase origin/main`.
- O checkout fica em `Documents`, que o iCloud sincroniza. Se `tsc`, `vitest` ou `git` travarem ou acusarem pack "far too short", é arquivo "dataless": rodar `brctl download <pasta>` ou trabalhar numa cópia em `$CLAUDE_JOB_DIR/tmp` com `npm ci` (memória do projeto). Não é corrupção.
- Migration vai direto para produção por `apply_migration` do MCP do Supabase. **`supabase db push` é proibido.** O `.sql` idêntico fica em `supabase/migrations/`, com o nome trocado para a versão REAL aplicada (conferida em `supabase_migrations.schema_migrations`). Migration acima de ~40 KB: dividir (o MCP dá "Invalid or expired requestState").
- Só mudança **aditiva**. Nenhuma tabela, coluna ou função existente é alterada nesta fase. Única policy existente que muda: `unidades_medida_select` ganha `or fn_ve_execucao()` (Task 6), recriada a partir da definição viva, no mesmo padrão da Manutenção.
- Nenhuma escrita em `obras`, `centros_custo`, `colaboradores`, `ordens_compra`, `oc_itens`, `lancamentos` ou em tabela de outro módulo. A prova confere.
- Toda tabela nova: RLS ligada, policy só de SELECT, `revoke all ... from anon, authenticated` + `grant select ... to authenticated`, trigger `trg_audit_<tabela>` com `fn_audit()`, `trg_updated_at_<tabela>` com `fn_set_updated_at()` quando tem `updated_at`. Toda função nova: `set search_path to ''`, `revoke all ... from public, anon`; as RPCs ganham `grant execute ... to authenticated`; as internas (`fn_ex_cpm_recalcular`, `fn_ex_cpm_calcular`, `fn_ex_pascoa`) não.
- Erro de negócio: `raise exception '<mensagem em pt-BR>' using errcode = 'P0001'`. Concorrência: `pg_advisory_xact_lock(hashtextextended('ex_<coisa>:' || id::text, 0))`.
- Soft delete na linha: `excluido_em`, `excluido_por`, `motivo_exclusao` (padrão do Frete e da Medição).
- Ids: `uuid`. No app, `idSchema` de `@/lib/id` (nunca `z.uuid()`: há ids md5 em produção).
- Quantidade e produtividade digitadas: `numeric(18,4)` (4 casas, `CASAS_TAXA` de `src/lib/casas-decimais.ts`). Dinheiro: `numeric(14,2)`. Duração e atraso: `integer` (dias úteis).
- **Dia útil** = dia com horas > 0 no calendário, depois de feriados e exceções. Sábado de 5 h conta 1 dia (Q7, suposição registrada no spec).
- Nomes: tabelas `ex_*`, views `ex_v_*`, funções `fn_ex_*`, módulo `execucao`, rotas `/execucao/*`, recursos `execucao.*`, pasta `src/modules/execucao/`.
- Textos da UI em pt-BR, sentence case, botão diz o que faz. **Sem travessão** (— ou –) em texto, comentário, mensagem ou commit.
- Cores: marca primária verde (`--emt-verde`), âmbar só como "a Faixa" e nunca como texto. Status com `StatusBadge`.
- Timestamps das migrations: série `20261012100000` a `20261012170000`. Se o main tiver migration com timestamp maior ou igual, somar 1 dia a todas, mantendo a ordem.
- Portão do PR: `npx tsc --noEmit`, `npm run lint`, `npm run test -- --run`, `npm run build`, CI verde, prova `supabase/provas/ex_fase1a_banco.sql` rodada no banco vivo com todos os casos certos, advisors do Supabase (security e performance) sem item novo, deploy `success` e telas conferidas em produção (`https://emtconstrutora.com`).

## Review Focus

1. **Dependência que fecha um ciclo** (A depende de B, B depende de A, colado de uma planilha ou digitado na grade): o lote inteiro é recusado com "Dependência em ciclo: as linhas 1.1, 1.2 não têm ordem possível"; nada é gravado e o CPM não roda em loop. Casos 4f e 5b da prova.
2. **Atividade sem duração e sem produtividade** (linha nova com só o nome): grava com duração 1 dia [proposta do plano: padrão 1]; nunca grava duração nula que quebraria o CPM. Caso 5e da prova.
3. **Data de início do cronograma num feriado ou domingo**: a primeira atividade começa no próximo dia útil, e a grade mostra a data real, não a digitada. Caso 4d da prova.
4. **Usuário desativado que continua na lista da obra**: deixa de ver na hora (RLS) e a RPC recusa. Caso 3e da prova.
5. **Duas abas salvando a mesma linha** (o engenheiro com a grade aberta em dois lugares): a segunda gravação é recusada com "Esta linha foi alterada por outra pessoa. Recarregue a grade", pelo `updated_at` esperado. Caso 5f da prova e teste da action na Task 13.

---

## Mapa de arquivos

**Banco**
- `supabase/migrations/20261012100000_ex_fase1a_estrutura.sql`: tabelas, índices, RLS, auditoria, funções de acesso.
- `supabase/migrations/20261012110000_ex_fase1a_calendario.sql`: Páscoa, dias úteis, carga de feriados 2026 a 2030, calendário padrão da empresa.
- `supabase/migrations/20261012120000_ex_fase1a_cpm.sql`: `fn_ex_cpm_calcular`, `fn_ex_cpm_recalcular`.
- `supabase/migrations/20261012130000_ex_fase1a_rpcs_obra.sql`: obras disponíveis, cronograma, acesso, obra, locais, serviços, calendário.
- `supabase/migrations/20261012140000_ex_fase1a_rpcs_atividades.sql`: lote de atividades, exclusão, renumeração, recálculo.
- `supabase/migrations/20261012150000_ex_fase1a_views.sql`: `ex_v_pastas`, `ex_v_cronogramas`, `ex_v_atividades`, comentários para agentes.
- `supabase/migrations/20261012160000_ex_fase1a_permissoes.sql`: backfill do perfil Admin e dos Admins ativos.
- `supabase/provas/ex_fase1a_banco.sql`: prova única, cresce a cada task.
- `supabase/rollbacks/20261012_ex_fase1a.sql`: derruba tudo da fase (só objetos `ex_`).

**App**
- `src/config/recursos.ts`: módulo `execucao`, recursos `execucao.obras`, `execucao.cronogramas`, `execucao.modelos`.
- `src/components/canonicos/app-shell.tsx`: ícone do módulo.
- `src/components/canonicos/grade-edicao.tsx` (+ `grade-edicao.test.tsx`), `src/components/canonicos/grade-edicao-teclado.ts` (+ teste), `src/components/canonicos/index.ts`: canônico novo de grade editável.
- `src/modules/execucao/_shared/rotulos.ts`, `src/modules/execucao/_shared/numero.ts` (+ teste).
- `src/modules/execucao/obras/{queries.ts, actions.ts, actions.test.ts, schemas.ts, schemas.test.ts, components/*}`.
- `src/modules/execucao/cronogramas/{queries.ts, actions.ts, actions.test.ts, schemas.ts, edicao.ts, edicao.test.ts, dependencias-texto.ts, dependencias-texto.test.ts, colar.ts, hierarquia.ts, hierarquia.test.ts, components/*}`.
- `src/lib/bloco-colado.ts` (+ teste): leitor do bloco colado do Excel, usado pela `GradeEdicao` (nasce em `cronogramas/colar.ts` na Task 9 e muda para `src/lib` na Task 12).
- `src/modules/execucao/modelos/{queries.ts, actions.ts, actions.test.ts, schemas.ts, components/*}`.
- `src/app/(app)/execucao/{layout.tsx, page.tsx, loading.tsx}`, `obras/page.tsx`, `obras/[obraId]/page.tsx`, `cronogramas/page.tsx`, `cronogramas/[id]/page.tsx`, `modelos/page.tsx`, com `loading.tsx` em cada e `page.test.tsx` nas três abas.
- `src/lib/database.types.ts`: tipos novos (regerados, Task 8).

**Docs**
- `docs/modulos/execucao-guia-para-agentes.md` (novo), `docs/decisoes.md`, a spec (emendas), `vault/projects/erp-emt/status.md` (fora do repo, em `/Users/tiagocameli/Desktop/personal-os/vault/`).

---

### Task 0: Preparar a branch e ler o que está vivo

**Files:** nenhum arquivo de produto.

- [ ] **Step 1: Atualizar a branch**

```bash
cd /Users/tiagocameli/Documents/GitHub/erp-emt/.claude/worktrees/obras-execucao-spec
git fetch origin && git rebase origin/main
ls supabase/migrations | tail -3
npm ci
```

Anote o último timestamp. Se for ≥ `20261012100000`, ajuste a série (Global Constraints).

- [ ] **Step 2: Conferir ids e contagens que a prova e o backfill usam**

MCP `execute_sql`:

```sql
select id, nome, ativo from public.usuarios
where id in ('c66fca9f-5428-4fb9-855f-dcff548764df', 'f155865b-1d4b-4b25-bf3d-54d8de9176b0');
select count(*) from public.usuario_permissoes where usuario_id = 'f155865b-1d4b-4b25-bf3d-54d8de9176b0';
select count(*) from public.usuarios u join public.perfis p on p.id = u.perfil_id and p.nome = 'Admin'
where u.ativo and u.excluido_em is null;
select count(*) from pg_class where relname like 'ex\_%';
select id, nome from public.obras where ativo order by nome limit 5;
```

Esperado: Tiago (Admin) e o usuário "zero" existem e estão ativos; o zero tem 0 permissões; 4 Admins ativos; 0 objetos `ex_`; há obras ativas. Se algum número diferir, **pare e avise o Tiago**: a prova e o backfill dependem deles.

- [ ] **Step 3: Conferir as assinaturas que as migrations usam**

```sql
select pg_get_function_identity_arguments(p.oid), pg_get_function_result(p.oid), p.proname
from pg_proc p join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public' and p.proname in ('tem_permissao', 'fn_audit', 'fn_set_updated_at');
```

Esperado: `tem_permissao(p_recurso text, p_acao text) returns boolean`, `fn_audit() returns trigger`, `fn_set_updated_at() returns trigger`.

---

### Task 1: Estrutura (tabelas, RLS, acesso por obra)

**Files:**
- Create: `supabase/migrations/20261012100000_ex_fase1a_estrutura.sql`
- Create: `supabase/provas/ex_fase1a_banco.sql`
- Create: `supabase/rollbacks/20261012_ex_fase1a.sql`

**Interfaces:**
- Produces: tabelas `ex_obras`, `ex_obra_usuarios`, `ex_calendarios`, `ex_feriados`, `ex_calendario_excecoes`, `ex_cronogramas`, `ex_locais`, `ex_servicos`, `ex_atividades`, `ex_atividade_locais`, `ex_dependencias`, `ex_atividade_datas`; funções `fn_ve_execucao() returns boolean`, `fn_ex_minhas_obras() returns setof uuid`, `fn_ex_acessa_obra(uuid) returns boolean`, `fn_ex_exigir(p_recurso text, p_acao text, p_obra uuid, p_mensagem text) returns void`.

- [ ] **Step 1: Escrever a prova (primeira parte), que tem de falhar**

`supabase/provas/ex_fase1a_banco.sql`:

```sql
-- Prova da Fase 1a da Execução de Obras. Migrations 20261012100000 a 20261012160000.
-- NÃO GRAVA: termina em raise exception com as medições, e o bloco de aborto garante o rollback.
-- Rodar inteira pelo MCP execute_sql. Cada caso vira uma chave em r; "recusou: ..." é o esperado
-- nos casos de trava; "PASSOU (errado)" é falha. Os números esperados estão ao lado de cada caso.
begin;
do $prova$
declare
  v_tiago constant uuid := 'c66fca9f-5428-4fb9-855f-dcff548764df';
  v_zero constant uuid := 'f155865b-1d4b-4b25-bf3d-54d8de9176b0';
  v_obra uuid; v_obra2 uuid; v_cron uuid; v_cal uuid; v_n bigint; v_txt text; v_j jsonb; r jsonb := '{}'::jsonb;
  v_obras0 bigint; v_cc0 bigint; v_colab0 bigint;
begin
  select count(*) into v_obras0 from public.obras;
  select count(*) into v_cc0 from public.centros_custo;
  select count(*) into v_colab0 from public.colaboradores;

  -- 1. Estrutura: as tabelas existem com RLS ligada, sem grant de escrita, auditadas
  --    Esperado: 1a = 12, 1b = 0, 1c = 12
  select count(*) into v_n from pg_class c join pg_namespace n on n.oid = c.relnamespace
   where n.nspname = 'public' and c.relkind = 'r' and c.relname like 'ex\_%' and c.relrowsecurity;
  r := r || jsonb_build_object('1a_tabelas_com_rls', v_n);
  select count(*) into v_n from information_schema.role_table_grants
   where table_schema = 'public' and table_name like 'ex\_%' and grantee in ('authenticated', 'anon')
     and privilege_type in ('INSERT', 'UPDATE', 'DELETE');
  r := r || jsonb_build_object('1b_grants_de_escrita', v_n);
  select count(*) into v_n from pg_trigger t join pg_class c on c.oid = t.tgrelid
   where c.relname like 'ex\_%' and t.tgname like 'trg_audit_%';
  r := r || jsonb_build_object('1c_tabelas_auditadas', v_n);

  -- (os casos 2 a 9 entram nas tasks seguintes, sempre antes desta linha)

  -- 9. O módulo não escreveu em outro módulo. Esperado: true
  r := r || jsonb_build_object('9_outros_modulos_intactos',
    (select count(*) from public.obras) = v_obras0 and (select count(*) from public.centros_custo) = v_cc0
    and (select count(*) from public.colaboradores) = v_colab0);

  raise exception 'PROVA %', r;
end $prova$;
do $aborto$ begin raise exception 'ABORTO GARANTIDO'; end $aborto$;
rollback;
```

- [ ] **Step 2: Rodar a prova e ver falhar**

MCP `execute_sql` com o arquivo inteiro. Esperado: `PROVA {"1a_tabelas_com_rls": 0, "1b_grants_de_escrita": 0, "1c_tabelas_auditadas": 0, ...}`, ou seja, falha (1a e 1c deveriam ser 12).

- [ ] **Step 3: Escrever a migration de estrutura**

`supabase/migrations/20261012100000_ex_fase1a_estrutura.sql`:

```sql
-- Execução de Obras, Fase 1a: estrutura.
-- Desenho: docs/superpowers/specs/2026-10-09-execucao-obras-design.md (seções 6 e 7).
-- Só cria objeto novo, com prefixo ex_. Lê obras e usuarios; não escreve em nenhum outro módulo.
-- Leitura: quem vê o módulo E está na lista da obra (Q1). Escrita: só pelas RPCs fn_ex_*.

-- =====================================================================
-- 1. Obra (configuração do módulo, 1:1 com obras) e acesso
-- =====================================================================

create table public.ex_calendarios (
  id uuid primary key default gen_random_uuid(),
  nome text not null check (char_length(btrim(nome)) between 2 and 120),
  modelo boolean not null default false,
  padrao_empresa boolean not null default false,
  pai_id uuid references public.ex_calendarios(id),
  horas_seg numeric(4,2) not null default 0 check (horas_seg between 0 and 24),
  horas_ter numeric(4,2) not null default 0 check (horas_ter between 0 and 24),
  horas_qua numeric(4,2) not null default 0 check (horas_qua between 0 and 24),
  horas_qui numeric(4,2) not null default 0 check (horas_qui between 0 and 24),
  horas_sex numeric(4,2) not null default 0 check (horas_sex between 0 and 24),
  horas_sab numeric(4,2) not null default 0 check (horas_sab between 0 and 24),
  horas_dom numeric(4,2) not null default 0 check (horas_dom between 0 and 24),
  feriados_abrangencia text[] not null default array['nacional', 'AC']
    check (feriados_abrangencia <@ array['nacional', 'AC', 'municipal']),
  municipio text,
  chuvoso_inicio_mes smallint check (chuvoso_inicio_mes between 1 and 12),
  chuvoso_fim_mes smallint check (chuvoso_fim_mes between 1 and 12),
  observacoes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references public.usuarios(id) default auth.uid(),
  excluido_em timestamptz,
  excluido_por uuid references public.usuarios(id),
  motivo_exclusao text,
  check (horas_seg + horas_ter + horas_qua + horas_qui + horas_sex + horas_sab + horas_dom > 0),
  check ((chuvoso_inicio_mes is null) = (chuvoso_fim_mes is null)),
  check (not padrao_empresa or modelo),
  check (pai_id is null or pai_id <> id)
);
create unique index ex_calendarios_padrao_uk on public.ex_calendarios (padrao_empresa) where padrao_empresa and excluido_em is null;
create index ex_calendarios_pai_ix on public.ex_calendarios (pai_id);

create table public.ex_feriados (
  id uuid primary key default gen_random_uuid(),
  data date not null,
  nome text not null check (btrim(nome) <> ''),
  abrangencia text not null check (abrangencia in ('nacional', 'AC', 'municipal')),
  municipio text,
  created_at timestamptz not null default now(),
  created_by uuid references public.usuarios(id) default auth.uid(),
  check ((abrangencia = 'municipal') = (municipio is not null))
);
create unique index ex_feriados_uk on public.ex_feriados (data, abrangencia, coalesce(municipio, ''));

create table public.ex_calendario_excecoes (
  id uuid primary key default gen_random_uuid(),
  calendario_id uuid not null references public.ex_calendarios(id),
  data date not null,
  horas numeric(4,2) not null check (horas between 0 and 24),
  tipo text not null check (tipo in ('feriado', 'paralisacao', 'extra')),
  descricao text not null check (btrim(descricao) <> ''),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references public.usuarios(id) default auth.uid(),
  unique (calendario_id, data)
);

create table public.ex_obras (
  obra_id uuid primary key references public.obras(id),
  tipo_obra text not null check (tipo_obra in ('edificacao', 'rodovia', 'pequena')),
  calendario_id uuid references public.ex_calendarios(id),
  km_inicial numeric(10,3),
  km_final numeric(10,3),
  metros_por_estaca numeric(8,3) not null default 20 check (metros_por_estaca > 0),
  ppc_limite numeric(5,2) not null default 80 check (ppc_limite between 0 and 100),
  observacoes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references public.usuarios(id) default auth.uid(),
  check (tipo_obra = 'rodovia' or (km_inicial is null and km_final is null))
);
create index ex_obras_calendario_ix on public.ex_obras (calendario_id);

create table public.ex_obra_usuarios (
  obra_id uuid not null references public.ex_obras(obra_id),
  usuario_id uuid not null references public.usuarios(id),
  created_at timestamptz not null default now(),
  created_by uuid references public.usuarios(id) default auth.uid(),
  primary key (obra_id, usuario_id)
);
create index ex_obra_usuarios_usuario_ix on public.ex_obra_usuarios (usuario_id);

-- =====================================================================
-- 2. Cronograma e locais
-- =====================================================================

create table public.ex_cronogramas (
  id uuid primary key default gen_random_uuid(),
  obra_id uuid not null references public.ex_obras(obra_id),
  codigo text not null check (codigo ~ '^[A-Z0-9][A-Z0-9-]{0,19}$'),
  nome text not null check (char_length(btrim(nome)) between 2 and 160),
  status text not null default 'rascunho' check (status in ('rascunho', 'ativo', 'concluido', 'arquivado')),
  calendario_id uuid not null references public.ex_calendarios(id),
  criterio_peso text not null default 'duracao' check (criterio_peso in ('valor', 'duracao', 'homem_hora', 'manual')),
  data_inicio date not null,
  data_corte date,
  calculado_em timestamptz,
  observacoes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references public.usuarios(id) default auth.uid(),
  excluido_em timestamptz,
  excluido_por uuid references public.usuarios(id),
  motivo_exclusao text,
  unique (id, obra_id)
);
create unique index ex_cronogramas_codigo_uk on public.ex_cronogramas (obra_id, codigo) where excluido_em is null;
create index ex_cronogramas_calendario_ix on public.ex_cronogramas (calendario_id);

create table public.ex_locais (
  id uuid primary key default gen_random_uuid(),
  obra_id uuid not null references public.ex_obras(obra_id),
  pai_id uuid,
  tipo text not null check (tipo in ('bloco', 'pavimento', 'ambiente', 'peca', 'segmento', 'outro')),
  codigo text not null check (btrim(codigo) <> '' and char_length(codigo) <= 30),
  nome text not null check (char_length(btrim(nome)) between 1 and 160),
  ordem integer not null default 0,
  km_inicial numeric(10,3),
  km_final numeric(10,3),
  lado text check (lado in ('LD', 'LE', 'eixo', 'ambos')),
  faixa text check (char_length(faixa) <= 30),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references public.usuarios(id) default auth.uid(),
  excluido_em timestamptz,
  excluido_por uuid references public.usuarios(id),
  motivo_exclusao text,
  unique (id, obra_id),
  foreign key (pai_id, obra_id) references public.ex_locais (id, obra_id),
  check (pai_id is null or pai_id <> id),
  check ((km_inicial is null) = (km_final is null))
);
create unique index ex_locais_codigo_uk on public.ex_locais (obra_id, codigo) where excluido_em is null;
create index ex_locais_pai_ix on public.ex_locais (pai_id);

-- =====================================================================
-- 3. Biblioteca de serviços e atividades
-- =====================================================================

create table public.ex_servicos (
  id uuid primary key default gen_random_uuid(),
  codigo text not null check (btrim(codigo) <> '' and char_length(codigo) <= 30),
  nome text not null check (char_length(btrim(nome)) between 2 and 200),
  unidade_id uuid references public.unidades_medida(id),
  produtividade_padrao numeric(18,4) check (produtividade_padrao > 0),
  ceu_aberto boolean not null default false,
  ativo boolean not null default true,
  observacoes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references public.usuarios(id) default auth.uid()
);
create unique index ex_servicos_codigo_uk on public.ex_servicos (upper(codigo));
create index ex_servicos_unidade_ix on public.ex_servicos (unidade_id);

create table public.ex_atividades (
  id uuid primary key default gen_random_uuid(),
  cronograma_id uuid not null,
  obra_id uuid not null,
  pai_id uuid,
  tipo text not null default 'atividade' check (tipo in ('resumo', 'atividade', 'marco')),
  codigo text not null check (btrim(codigo) <> '' and char_length(codigo) <= 40),
  nome text not null check (char_length(btrim(nome)) between 1 and 300),
  ordem integer not null,
  servico_id uuid references public.ex_servicos(id),
  quantidade numeric(18,4) check (quantidade >= 0),
  unidade_id uuid references public.unidades_medida(id),
  produtividade numeric(18,4) check (produtividade > 0),
  modo_duracao text not null default 'digitada' check (modo_duracao in ('por_produtividade', 'digitada')),
  duracao_dias integer not null default 1 check (duracao_dias >= 0),
  peso_manual numeric(18,4) check (peso_manual >= 0),
  valor_orcado numeric(14,2) check (valor_orcado >= 0),
  restricao_data text not null default 'nenhuma' check (restricao_data in ('nenhuma', 'inicio_nao_antes', 'fim_nao_depois')),
  restricao_data_em date,
  responsavel_id uuid references public.usuarios(id),
  observacao text,
  inicio_real date,
  fim_real date,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references public.usuarios(id) default auth.uid(),
  excluido_em timestamptz,
  excluido_por uuid references public.usuarios(id),
  motivo_exclusao text,
  unique (id, cronograma_id),
  unique (id, obra_id),
  foreign key (cronograma_id, obra_id) references public.ex_cronogramas (id, obra_id),
  foreign key (pai_id, cronograma_id) references public.ex_atividades (id, cronograma_id),
  check (pai_id is null or pai_id <> id),
  check ((restricao_data = 'nenhuma') = (restricao_data_em is null)),
  check (tipo <> 'marco' or duracao_dias = 0),
  check (tipo = 'atividade' or (quantidade is null and produtividade is null and servico_id is null)),
  check (modo_duracao = 'digitada' or (quantidade is not null and produtividade is not null)),
  check (fim_real is null or (inicio_real is not null and fim_real >= inicio_real))
);
create unique index ex_atividades_codigo_uk on public.ex_atividades (cronograma_id, codigo) where excluido_em is null;
create index ex_atividades_cronograma_ordem_ix on public.ex_atividades (cronograma_id, ordem) where excluido_em is null;
create index ex_atividades_pai_ix on public.ex_atividades (pai_id);
create index ex_atividades_obra_ix on public.ex_atividades (obra_id);
create index ex_atividades_servico_ix on public.ex_atividades (servico_id);
create index ex_atividades_unidade_ix on public.ex_atividades (unidade_id);
create index ex_atividades_responsavel_ix on public.ex_atividades (responsavel_id);

create table public.ex_atividade_locais (
  atividade_id uuid not null,
  local_id uuid not null,
  obra_id uuid not null,
  created_at timestamptz not null default now(),
  primary key (atividade_id, local_id),
  foreign key (atividade_id, obra_id) references public.ex_atividades (id, obra_id),
  foreign key (local_id, obra_id) references public.ex_locais (id, obra_id)
);
create index ex_atividade_locais_local_ix on public.ex_atividade_locais (local_id);

create table public.ex_dependencias (
  id uuid primary key default gen_random_uuid(),
  cronograma_id uuid not null,
  obra_id uuid not null,
  predecessora_id uuid not null,
  sucessora_id uuid not null,
  tipo text not null default 'TI' check (tipo in ('TI', 'II', 'TT', 'IT')),
  atraso_dias integer not null default 0 check (atraso_dias between -999 and 999),
  created_at timestamptz not null default now(),
  created_by uuid references public.usuarios(id) default auth.uid(),
  unique (predecessora_id, sucessora_id),
  foreign key (cronograma_id, obra_id) references public.ex_cronogramas (id, obra_id),
  foreign key (predecessora_id, cronograma_id) references public.ex_atividades (id, cronograma_id),
  foreign key (sucessora_id, cronograma_id) references public.ex_atividades (id, cronograma_id),
  check (predecessora_id <> sucessora_id)
);
create index ex_dependencias_sucessora_ix on public.ex_dependencias (sucessora_id);
create index ex_dependencias_cronograma_ix on public.ex_dependencias (cronograma_id);

-- Cache do CPM. Gravado SÓ por fn_ex_cpm_recalcular (Task 3). Ninguém mais calcula datas.
create table public.ex_atividade_datas (
  atividade_id uuid primary key,
  cronograma_id uuid not null,
  obra_id uuid not null,
  inicio_cedo date not null,
  fim_cedo date not null,
  inicio_tarde date not null,
  fim_tarde date not null,
  folga_total integer not null,
  folga_livre integer not null,
  critica boolean not null,
  calculado_em timestamptz not null default now(),
  foreign key (atividade_id, cronograma_id) references public.ex_atividades (id, cronograma_id),
  foreign key (cronograma_id, obra_id) references public.ex_cronogramas (id, obra_id)
);
create index ex_atividade_datas_cronograma_ix on public.ex_atividade_datas (cronograma_id);

-- =====================================================================
-- 4. Acesso
-- =====================================================================

create or replace function public.fn_ve_execucao()
returns boolean language sql stable security definer set search_path to '' as $$
  select public.tem_permissao('execucao.obras', 'ver') or public.tem_permissao('execucao.cronogramas', 'ver')
      or public.tem_permissao('execucao.modelos', 'ver');
$$;

-- Obras do usuário logado. A linha em ex_obra_usuarios É o acesso (padrão de mc_contrato_usuarios);
-- usuário desativado ou excluído deixa de ver na hora.
create or replace function public.fn_ex_minhas_obras()
returns setof uuid language sql stable security definer set search_path to '' as $$
  select ou.obra_id
  from public.ex_obra_usuarios ou
  join public.usuarios u on u.id = ou.usuario_id
  where ou.usuario_id = (select auth.uid()) and u.ativo and u.excluido_em is null;
$$;

create or replace function public.fn_ex_acessa_obra(p_obra uuid)
returns boolean language sql stable security definer set search_path to '' as $$
  select p_obra in (select public.fn_ex_minhas_obras());
$$;

create or replace function public.fn_ex_exigir(p_recurso text, p_acao text, p_obra uuid, p_mensagem text)
returns void language plpgsql stable security definer set search_path to '' as $$
begin
  if not public.tem_permissao(p_recurso, p_acao) then raise exception '%', p_mensagem using errcode = 'P0001'; end if;
  if p_obra is not null and not public.fn_ex_acessa_obra(p_obra) then
    raise exception 'Obra não encontrada ou você não está na lista de acesso dela' using errcode = 'P0001';
  end if;
end $$;

do $fn$
declare f text;
begin
  foreach f in array array['fn_ve_execucao()', 'fn_ex_minhas_obras()', 'fn_ex_acessa_obra(uuid)',
                           'fn_ex_exigir(text, text, uuid, text)'] loop
    execute format('revoke all on function public.%s from public, anon', f);
    execute format('grant execute on function public.%s to authenticated', f);
  end loop;
end $fn$;

-- =====================================================================
-- 5. RLS, grants, auditoria e updated_at
-- =====================================================================

do $rls$
declare t text;
begin
  -- Tabelas de obra: vê quem vê o módulo e está na lista da obra.
  foreach t in array array['ex_obra_usuarios', 'ex_cronogramas', 'ex_locais', 'ex_atividades',
                           'ex_atividade_locais', 'ex_dependencias', 'ex_atividade_datas'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('create policy %I on public.%I for select to authenticated using ((select public.fn_ve_execucao()) and obra_id in (select public.fn_ex_minhas_obras()))', t || '_select', t);
  end loop;
  alter table public.ex_obras enable row level security;
  create policy ex_obras_select on public.ex_obras for select to authenticated
    using ((select public.fn_ve_execucao()) and obra_id in (select public.fn_ex_minhas_obras()));
  -- Globais: biblioteca, calendários e feriados valem para todas as obras.
  foreach t in array array['ex_servicos', 'ex_calendarios', 'ex_calendario_excecoes', 'ex_feriados'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('create policy %I on public.%I for select to authenticated using ((select public.fn_ve_execucao()))', t || '_select', t);
  end loop;

  foreach t in array array['ex_obras', 'ex_obra_usuarios', 'ex_calendarios', 'ex_feriados', 'ex_calendario_excecoes',
                           'ex_cronogramas', 'ex_locais', 'ex_servicos', 'ex_atividades', 'ex_atividade_locais',
                           'ex_dependencias', 'ex_atividade_datas'] loop
    execute format('revoke all on public.%I from anon, authenticated', t);
    execute format('grant select on public.%I to authenticated', t);
    execute format('create trigger %I after insert or delete or update on public.%I for each row execute function public.fn_audit()', 'trg_audit_' || t, t);
  end loop;

  foreach t in array array['ex_obras', 'ex_calendarios', 'ex_calendario_excecoes', 'ex_cronogramas', 'ex_locais',
                           'ex_servicos', 'ex_atividades'] loop
    execute format('create trigger %I before update on public.%I for each row execute function public.fn_set_updated_at()', 'trg_updated_at_' || t, t);
  end loop;
end $rls$;
```

Nota: `ex_atividade_datas` é reescrita inteira a cada recálculo. A auditoria dela gera muitas linhas; isso é aceito na F1a e reavaliado com o volume real (anotar em `docs/decisoes.md` na Task 13). Se o Tiago preferir, o trigger de auditoria dessa tabela sai antes do merge (é cache derivado, não dado de entrada).

- [ ] **Step 4: Escrever o rollback**

`supabase/rollbacks/20261012_ex_fase1a.sql`:

```sql
-- Rollback da Fase 1a da Execução. Só objetos ex_ e as permissões execucao.*.
-- Rodar só com o ok do Tiago. Ordem: views, funções, tabelas (filhas antes), permissões.
begin;
drop view if exists public.ex_v_atividades, public.ex_v_cronogramas, public.ex_v_pastas;
do $drop$
declare f record;
begin
  for f in select p.oid::regprocedure as assinatura from pg_proc p join pg_namespace n on n.oid = p.pronamespace
           where n.nspname = 'public' and (p.proname like 'fn\_ex\_%' or p.proname = 'fn_ve_execucao') loop
    execute format('drop function if exists %s cascade', f.assinatura);
  end loop;
end $drop$;
drop table if exists public.ex_atividade_datas, public.ex_dependencias, public.ex_atividade_locais,
  public.ex_atividades, public.ex_servicos, public.ex_locais, public.ex_cronogramas, public.ex_obra_usuarios,
  public.ex_obras, public.ex_calendario_excecoes, public.ex_feriados, public.ex_calendarios;
delete from public.usuario_permissoes where recurso like 'execucao.%';
delete from public.perfil_permissoes where recurso like 'execucao.%';
commit;
```

- [ ] **Step 5: Aplicar a migration**

MCP `apply_migration` com nome `ex_fase1a_estrutura` e o conteúdo do Step 3. Depois:

```sql
select version, name from supabase_migrations.schema_migrations where name like 'ex\_fase1a%' order by version;
```

Renomeie o arquivo para a versão real se divergir.

- [ ] **Step 6: Rodar a prova**

Esperado: `1a_tabelas_com_rls: 12`, `1b_grants_de_escrita: 0`, `1c_tabelas_auditadas: 12`, `9_outros_modulos_intactos: true`.

- [ ] **Step 7: Advisors e commit**

MCP `get_advisors` (security e performance). Esperado: nenhum item com `ex_`. Corrigir o que aparecer numa migration nova da série.

```bash
git add supabase/migrations/*_ex_fase1a_estrutura.sql supabase/provas/ex_fase1a_banco.sql supabase/rollbacks/20261012_ex_fase1a.sql
git commit -m "Execução F1a: estrutura, RLS e acesso por obra"
```

---

### Task 2: Calendário, Páscoa e feriados

**Files:**
- Create: `supabase/migrations/20261012110000_ex_fase1a_calendario.sql`
- Modify: `supabase/provas/ex_fase1a_banco.sql` (caso 2)

**Interfaces:**
- Consumes: `ex_calendarios`, `ex_calendario_excecoes`, `ex_feriados` (Task 1).
- Produces:
  - `fn_ex_pascoa(p_ano integer) returns date` (interna).
  - `fn_ex_dias_uteis(p_cal uuid, p_de date, p_ate date) returns table (data date, horas numeric)`, só os dias com horas > 0, em ordem.
  - `fn_ex_somar_dias_uteis(p_cal uuid, p_data date, p_n integer) returns date`: com `p_n >= 0`, o n-ésimo dia útil contando do primeiro dia útil em ou depois de `p_data` (n = 0 é ele mesmo); com `p_n < 0`, conta para trás a partir do último dia útil em ou antes de `p_data`.
  - Calendário `Padrão EMT` (`modelo = true`, `padrao_empresa = true`).

Regra de horas de um dia (uma só, usada por tudo): exceção do próprio calendário; senão exceção do calendário pai; senão 0 se for feriado de uma abrangência marcada no calendário (municipal só se o município bate); senão as horas do dia da semana.

- [ ] **Step 1: Escrever o caso 2 da prova (falha)**

No `ex_fase1a_banco.sql`, antes da linha `-- (os casos 2 a 9 ...)`:

```sql
  -- 2. Calendário. Padrão EMT: seg a sex 9 h, sáb 5 h, dom 0; feriados nacionais e do AC.
  --    2a Páscoa 2026 a 2030: 2026-04-05, 2027-03-28, 2028-04-16, 2029-04-01, 2030-04-21
  --    2b dias úteis de 01/04/2026 a 07/04/2026: 04-01, 04-02, 04-04 (sáb), 04-06, 04-07
  --       (03/04 é Sexta-feira Santa, 05/04 é domingo)
  --    2c somar(03/04, 0) = 04-04; somar(02/04, 1) = 04-04; somar(06/04, -1) = 04-04
  --    2d calendário filho: paralisação no PAI em 06/04 some do filho; extra no FILHO em 05/04 entra
  --       Esperado 2d: 04-01, 04-02, 04-04, 04-05, 04-07
  select id into v_cal from public.ex_calendarios where padrao_empresa and excluido_em is null;
  r := r || jsonb_build_object('2a_pascoa', (select jsonb_agg(public.fn_ex_pascoa(a) order by a) from generate_series(2026, 2030) a));
  r := r || jsonb_build_object('2b_dias_uteis', (select jsonb_agg(data order by data) from public.fn_ex_dias_uteis(v_cal, '2026-04-01', '2026-04-07')));
  r := r || jsonb_build_object('2c_somar', jsonb_build_array(
    public.fn_ex_somar_dias_uteis(v_cal, '2026-04-03', 0), public.fn_ex_somar_dias_uteis(v_cal, '2026-04-02', 1),
    public.fn_ex_somar_dias_uteis(v_cal, '2026-04-06', -1)));
  declare v_filho uuid; v_pai uuid;
  begin
    insert into public.ex_calendarios (nome, modelo, horas_seg, horas_ter, horas_qua, horas_qui, horas_sex, horas_sab)
    values ('Prova pai', true, 9, 9, 9, 9, 9, 5) returning id into v_pai;
    insert into public.ex_calendarios (nome, pai_id, horas_seg, horas_ter, horas_qua, horas_qui, horas_sex, horas_sab)
    values ('Prova filho', v_pai, 9, 9, 9, 9, 9, 5) returning id into v_filho;
    insert into public.ex_calendario_excecoes (calendario_id, data, horas, tipo, descricao)
    values (v_pai, '2026-04-06', 0, 'paralisacao', 'Prova'), (v_filho, '2026-04-05', 8, 'extra', 'Prova');
    r := r || jsonb_build_object('2d_heranca', (select jsonb_agg(data order by data) from public.fn_ex_dias_uteis(v_filho, '2026-04-01', '2026-04-07')));
  end;
```

Rodar: falha com `function public.fn_ex_pascoa(integer) does not exist`.

- [ ] **Step 2: Lista de feriados (decidida)**

Decisão do Tiago (09/10/2026): ele mesmo diz no app o que é ou não feriado (cadastro de feriados na aba Modelos, Tasks 4 e 11; e a exceção por calendário, que já existe, transforma um feriado em dia de trabalho num cronograma só). A carga abaixo é o ponto de partida, sem checkpoint:
- **Nacionais fixos** (2026 a 2030): 01/01, 21/04, 01/05, 07/09, 12/10, 02/11, 15/11, 20/11 (Lei 14.759/2023), 25/12. **Móvel:** Sexta-feira Santa (Páscoa − 2).
- **Acre:** 23/01 Dia do Evangélico; 08/03 Dia Internacional da Mulher; 15/06 Aniversário do Acre; 06/08 Início da Revolução Acreana; 05/09 Dia da Amazônia; 17/11 Tratado de Petrópolis.
- **Fora:** Carnaval e Corpus Christi (ponto facultativo); municipais entram pelo cadastro.
- **Calendário padrão:** seg a sex 9 h, sáb 5 h, dom 0, nacionais + AC, sem período chuvoso.

- [ ] **Step 3: Escrever a migration**

`supabase/migrations/20261012110000_ex_fase1a_calendario.sql`:

```sql
-- Execução de Obras, Fase 1a: calendário.
-- Dia útil = dia com horas > 0, depois de exceções e feriados (spec 7.3; Q7 suposição (a)).
-- Feriados: carga inicial; o Tiago corrige no app (fn_ex_feriado_salvar/excluir, aba Modelos). Decisão de 09/10/2026.

-- Páscoa pelo algoritmo de Meeus/Jones/Butcher (calendário gregoriano).
create or replace function public.fn_ex_pascoa(p_ano integer)
returns date language plpgsql immutable set search_path to '' as $$
declare a int; b int; c int; d int; e int; f int; g int; h int; i int; k int; l int; m int; mes int; dia int;
begin
  a := p_ano % 19; b := p_ano / 100; c := p_ano % 100; d := b / 4; e := b % 4;
  f := (b + 8) / 25; g := (b - f + 1) / 3; h := (19 * a + b - d - g + 15) % 30;
  i := c / 4; k := c % 4; l := (32 + 2 * e + 2 * i - h - k) % 7;
  m := (a + 11 * h + 22 * l) / 451;
  mes := (h + l - 7 * m + 114) / 31; dia := ((h + l - 7 * m + 114) % 31) + 1;
  return make_date(p_ano, mes, dia);
end $$;

create or replace function public.fn_ex_dias_uteis(p_cal uuid, p_de date, p_ate date)
returns table (data date, horas numeric) language sql stable security definer set search_path to '' as $$
  select d.dia::date, h.horas
  from public.ex_calendarios c
  cross join generate_series(p_de, p_ate, interval '1 day') as d(dia)
  cross join lateral (select coalesce(
      (select e.horas from public.ex_calendario_excecoes e where e.calendario_id = c.id and e.data = d.dia::date),
      (select e.horas from public.ex_calendario_excecoes e where e.calendario_id = c.pai_id and e.data = d.dia::date),
      (select 0::numeric from public.ex_feriados f
        where f.data = d.dia::date and f.abrangencia = any (c.feriados_abrangencia)
          and (f.abrangencia <> 'municipal' or f.municipio = c.municipio) limit 1),
      case extract(isodow from d.dia)::int
        when 1 then c.horas_seg when 2 then c.horas_ter when 3 then c.horas_qua when 4 then c.horas_qui
        when 5 then c.horas_sex when 6 then c.horas_sab else c.horas_dom end) as horas) h
  where c.id = p_cal and h.horas > 0
  order by 1;
$$;

create or replace function public.fn_ex_somar_dias_uteis(p_cal uuid, p_data date, p_n integer)
returns date language plpgsql stable security definer set search_path to '' as $$
declare v_janela int := greatest(60, abs(p_n) * 3 + 60); v_data date;
begin
  if not exists (select 1 from public.ex_calendarios where id = p_cal) then
    raise exception 'Calendário não encontrado' using errcode = 'P0001';
  end if;
  loop
    if p_n >= 0 then
      select data into v_data from public.fn_ex_dias_uteis(p_cal, p_data, p_data + v_janela) order by data offset p_n limit 1;
    else
      select data into v_data from public.fn_ex_dias_uteis(p_cal, p_data - v_janela, p_data) order by data desc offset (-p_n - 1) limit 1;
    end if;
    exit when v_data is not null;
    if v_janela > 36500 then raise exception 'O calendário não tem dias úteis suficientes' using errcode = 'P0001'; end if;
    v_janela := v_janela * 2;
  end loop;
  return v_data;
end $$;

revoke all on function public.fn_ex_pascoa(integer) from public, anon;
revoke all on function public.fn_ex_dias_uteis(uuid, date, date) from public, anon;
revoke all on function public.fn_ex_somar_dias_uteis(uuid, date, integer) from public, anon;
grant execute on function public.fn_ex_dias_uteis(uuid, date, date) to authenticated;
grant execute on function public.fn_ex_somar_dias_uteis(uuid, date, integer) to authenticated;

-- Carga inicial de feriados 2026 a 2030 (Step 2). Ponto de partida: o Tiago edita no app.
insert into public.ex_feriados (data, nome, abrangencia)
select make_date(a, f.mes, f.dia), f.nome, 'nacional'
from generate_series(2026, 2030) a
cross join (values (1, 1, 'Confraternização Universal'), (4, 21, 'Tiradentes'), (5, 1, 'Dia do Trabalho'),
                   (9, 7, 'Independência do Brasil'), (10, 12, 'Nossa Senhora Aparecida'), (11, 2, 'Finados'),
                   (11, 15, 'Proclamação da República'), (11, 20, 'Dia Nacional de Zumbi e da Consciência Negra'),
                   (12, 25, 'Natal')) as f(mes, dia, nome)
union all
select public.fn_ex_pascoa(a) - 2, 'Sexta-feira Santa', 'nacional' from generate_series(2026, 2030) a
union all
select make_date(a, f.mes, f.dia), f.nome, 'AC'
from generate_series(2026, 2030) a
cross join (values (1, 23, 'Dia do Evangélico'), (3, 8, 'Dia Internacional da Mulher'), (6, 15, 'Aniversário do Acre'),
                   (8, 6, 'Início da Revolução Acreana'), (9, 5, 'Dia da Amazônia'),
                   (11, 17, 'Assinatura do Tratado de Petrópolis')) as f(mes, dia, nome);

insert into public.ex_calendarios (nome, modelo, padrao_empresa, horas_seg, horas_ter, horas_qua, horas_qui, horas_sex,
  horas_sab, horas_dom, observacoes)
values ('Padrão EMT', true, true, 9, 9, 9, 9, 9, 5, 0, 'Calendário padrão da empresa. Cronograma novo herda dele.');

do $confere$
declare v int;
begin
  select count(*) into v from public.ex_feriados;
  if v <> 80 then raise exception 'Esperado 80 feriados (10 nacionais e 6 do AC por ano, 5 anos), veio %', v; end if;
end $confere$;
```



- [ ] **Step 4: Aplicar, renomear se preciso, rodar a prova**

Esperado: `2a_pascoa: ["2026-04-05","2027-03-28","2028-04-16","2029-04-01","2030-04-21"]`, `2b_dias_uteis: ["2026-04-01","2026-04-02","2026-04-04","2026-04-06","2026-04-07"]`, `2c_somar: ["2026-04-04","2026-04-04","2026-04-04"]`, `2d_heranca: ["2026-04-01","2026-04-02","2026-04-04","2026-04-05","2026-04-07"]`.

- [ ] **Step 5: Mutação manual**

Dentro de `begin; ... rollback;`, uma de cada vez, rodando a prova inteira depois de cada uma:
1. `update public.ex_feriados set data = data - 1 where nome = 'Sexta-feira Santa';` Esperado: `2b` muda (02/04 sai, 03/04 entra).
2. `create or replace` de `fn_ex_dias_uteis` sem a linha da exceção do calendário pai. Esperado: `2d` muda (06/04 volta a ser dia útil).

Anote as duas mutações e o resultado no corpo do commit.

- [ ] **Step 6: Advisors e commit**

```bash
git add supabase/migrations/*_ex_fase1a_calendario.sql supabase/provas/ex_fase1a_banco.sql
git commit -m "Execução F1a: calendário, Páscoa e feriados nacionais e do Acre"
```

---

### Task 3: Motor CPM

**Files:**
- Create: `supabase/migrations/20261012120000_ex_fase1a_cpm.sql`
- Modify: `supabase/provas/ex_fase1a_banco.sql` (caso 4)

**Interfaces:**
- Consumes: `fn_ex_dias_uteis` (Task 2); `ex_atividades`, `ex_dependencias`, `ex_cronogramas`, `ex_atividade_datas` (Task 1).
- Produces:
  - `fn_ex_cpm_calcular(p_cronograma uuid, p_cenario jsonb default null) returns table (atividade_id uuid, inicio_cedo date, fim_cedo date, inicio_tarde date, fim_tarde date, folga_total integer, folga_livre integer, critica boolean)`. Função pura, interna. `p_cenario` na F1a aceita só `{"duracoes": {"<atividade_id>": <dias>}}`; a F2 estende (atraso, produtividade, equipe extra).
  - `fn_ex_cpm_recalcular(p_cronograma uuid) returns void`. Interna, a única que escreve `ex_atividade_datas`.

**Regras (comentadas no SQL e no guia para agentes):**
- O tempo é contado em dias úteis do calendário do cronograma, com índice 0 no primeiro dia útil da origem. `ES` é o início (inclusivo), `EF = ES + duração` é o fim **exclusivo**. Data de início = dia útil `ES`; data de fim = dia útil `EF − 1`.
- Vínculos com atraso `L` (pode ser negativo): `TI` ES(s) ≥ EF(p) + L; `II` ES(s) ≥ ES(p) + L; `TT` EF(s) ≥ EF(p) + L; `IT` EF(s) ≥ ES(p) + L.
- Ninguém começa antes do `data_inicio` do cronograma, nem antes da `data_corte` se a atividade não começou, nem antes de `restricao_data_em` em `inicio_nao_antes`. `fim_nao_depois` limita o fim mais tarde (pode gerar folga negativa).
- Real: `inicio_real` fixa o início; `fim_real` fixa o fim. Concluída: folga 0, não crítica. Em andamento na F1a: fim = início real + duração (a F3 troca por trabalho restante pelo avanço).
- Marco (duração 0) cai no fim do dia útil anterior ao seu `ES` (o dia em que a predecessora termina); no começo do cronograma, cai no primeiro dia útil.
- Resumo: envelope das descendentes (menor início, maior fim; folga total = a menor; crítico se alguma filha é).
- Crítica = folga total ≤ 0 e não concluída. Folga livre: o quanto a atividade atrasa sem empurrar nenhuma sucessora; sem sucessora, até o fim do cronograma.
- Ciclo: erro "Dependência em ciclo: as linhas X, Y, Z não têm ordem possível" (até 10 códigos).

- [ ] **Step 1: Escrever o caso 4 da prova (falha)**

Cronograma feito à mão. Calendário sem feriado, seg a sex 8 h. Início 02/03/2026 (segunda). Dias úteis: índice 0 = 02/03, 1 = 03/03, 2 = 04/03, 3 = 05/03, 4 = 06/03, 5 = 09/03, 6 = 10/03, 7 = 11/03.

| Linha | Duração | Vínculo | ES/EF | Datas | Folga total / livre | Crítica |
|---|---|---|---|---|---|---|
| 1 (resumo de 1.1 a 1.3) | | | | 02/03 a 06/03 | 0 | sim |
| 1.1 A | 3 | | 0/3 | 02/03 a 04/03 | 0 / 0 | sim |
| 1.2 B | 2 | 1.1 TI | 3/5 | 05/03 a 06/03 | 0 / 0 | sim |
| 1.3 C | 4 | 1.1 II+1 | 1/5 | 03/03 a 06/03 | 1 / 0 | não |
| 2 D | 2 | 1.2 TT+1 | 4/6 | 06/03 a 09/03 | 0 / 0 | sim |
| 3 E | 1 | 1.3 IT | 0/1 | 02/03 a 02/03 | 5 / 5 | não |
| 4 F | 2 | 1.1 TI−1 | 2/4 | 04/03 a 05/03 | 2 / 2 | não |
| 5 M (marco) | 0 | 2 TI, 1.3 TI | 6/6 | 09/03 | 0 / 0 | sim |

Datas mais tarde: A 02/03 a 04/03; B 05/03 a 06/03; C 04/03 a 09/03; D 06/03 a 09/03; E 09/03 a 09/03; F 06/03 a 09/03; M 09/03.

No `ex_fase1a_banco.sql`, antes de `-- (os casos 2 a 9 ...)`:

```sql
  -- 4. CPM (tabela feita à mão no plano, Task 3)
  declare v_c4 uuid; v_cal4 uuid; v_a uuid; v_b uuid; v_cc uuid; v_d uuid; v_e uuid; v_f uuid; v_m uuid; v_res uuid; v_t0 timestamptz;
  begin
    select gen_random_uuid() into v_c4;
    insert into public.ex_calendarios (nome, horas_seg, horas_ter, horas_qua, horas_qui, horas_sex, feriados_abrangencia)
    values ('Prova CPM', 8, 8, 8, 8, 8, '{}') returning id into v_cal4;
    select id into v_obra from public.obras where ativo order by nome limit 1;
    insert into public.ex_obras (obra_id, tipo_obra) values (v_obra, 'edificacao') on conflict (obra_id) do nothing;
    insert into public.ex_cronogramas (id, obra_id, codigo, nome, calendario_id, data_inicio)
    values (v_c4, v_obra, 'PROVA4', 'Prova CPM', v_cal4, '2026-03-02');
    insert into public.ex_atividades (cronograma_id, obra_id, tipo, codigo, nome, ordem, duracao_dias)
    values (v_c4, v_obra, 'resumo', '1', 'Resumo', 1, 0) returning id into v_res;
    insert into public.ex_atividades (cronograma_id, obra_id, pai_id, codigo, nome, ordem, duracao_dias) values
      (v_c4, v_obra, v_res, '1.1', 'A', 2, 3) returning id into v_a;
    insert into public.ex_atividades (cronograma_id, obra_id, pai_id, codigo, nome, ordem, duracao_dias) values
      (v_c4, v_obra, v_res, '1.2', 'B', 3, 2) returning id into v_b;
    insert into public.ex_atividades (cronograma_id, obra_id, pai_id, codigo, nome, ordem, duracao_dias) values
      (v_c4, v_obra, v_res, '1.3', 'C', 4, 4) returning id into v_cc;
    insert into public.ex_atividades (cronograma_id, obra_id, codigo, nome, ordem, duracao_dias) values
      (v_c4, v_obra, '2', 'D', 5, 2) returning id into v_d;
    insert into public.ex_atividades (cronograma_id, obra_id, codigo, nome, ordem, duracao_dias) values
      (v_c4, v_obra, '3', 'E', 6, 1) returning id into v_e;
    insert into public.ex_atividades (cronograma_id, obra_id, codigo, nome, ordem, duracao_dias) values
      (v_c4, v_obra, '4', 'F', 7, 2) returning id into v_f;
    insert into public.ex_atividades (cronograma_id, obra_id, tipo, codigo, nome, ordem, duracao_dias) values
      (v_c4, v_obra, 'marco', '5', 'M', 8, 0) returning id into v_m;
    insert into public.ex_dependencias (cronograma_id, obra_id, predecessora_id, sucessora_id, tipo, atraso_dias) values
      (v_c4, v_obra, v_a, v_b, 'TI', 0), (v_c4, v_obra, v_a, v_cc, 'II', 1), (v_c4, v_obra, v_b, v_d, 'TT', 1),
      (v_c4, v_obra, v_cc, v_e, 'IT', 0), (v_c4, v_obra, v_a, v_f, 'TI', -1),
      (v_c4, v_obra, v_d, v_m, 'TI', 0), (v_c4, v_obra, v_cc, v_m, 'TI', 0);
    perform public.fn_ex_cpm_recalcular(v_c4);
    r := r || jsonb_build_object('4a_cpm', (select jsonb_object_agg(a.codigo, jsonb_build_array(
        d.inicio_cedo, d.fim_cedo, d.inicio_tarde, d.fim_tarde, d.folga_total, d.folga_livre, d.critica) order by a.codigo)
      from public.ex_atividade_datas d join public.ex_atividades a on a.id = d.atividade_id where d.cronograma_id = v_c4));

    -- 4b. "E se": B com 4 dias (ES 3, EF 7) empurra D para ES 6, EF 8 (10/03 a 11/03) e o marco para 11/03,
    --     sem gravar: o cache continua com o marco em 09/03.
    r := r || jsonb_build_object('4b_e_se', jsonb_build_object(
      'marco_simulado', (select inicio_cedo from public.fn_ex_cpm_calcular(v_c4, jsonb_build_object('duracoes', jsonb_build_object(v_b::text, 4))) where atividade_id = v_m),
      'marco_gravado', (select inicio_cedo from public.ex_atividade_datas where atividade_id = v_m)));

    -- 4c. Restrição "não antes de" num sábado (07/03): E começa no próximo dia útil, 09/03.
    update public.ex_atividades set restricao_data = 'inicio_nao_antes', restricao_data_em = '2026-03-07' where id = v_e;
    perform public.fn_ex_cpm_recalcular(v_c4);
    r := r || jsonb_build_object('4c_restricao_sabado', (select jsonb_build_array(inicio_cedo, fim_cedo) from public.ex_atividade_datas where atividade_id = v_e));

    -- 4d. Cronograma começando num domingo (01/03): a primeira atividade começa 02/03.
    update public.ex_cronogramas set data_inicio = '2026-03-01' where id = v_c4;
    perform public.fn_ex_cpm_recalcular(v_c4);
    r := r || jsonb_build_object('4d_inicio_domingo', (select inicio_cedo from public.ex_atividade_datas where atividade_id = v_a));

    -- 4e. Real: A começou 03/03 e terminou 05/03: B passa para 06/03 a 09/03; A não é crítica (concluída).
    update public.ex_atividades set inicio_real = '2026-03-03', fim_real = '2026-03-05' where id = v_a;
    perform public.fn_ex_cpm_recalcular(v_c4);
    r := r || jsonb_build_object('4e_real', jsonb_build_object(
      'a', (select jsonb_build_array(inicio_cedo, fim_cedo, critica) from public.ex_atividade_datas where atividade_id = v_a),
      'b', (select jsonb_build_array(inicio_cedo, fim_cedo) from public.ex_atividade_datas where atividade_id = v_b)));

    -- 4f. Ciclo gravado direto (as RPCs nunca deixam): o cálculo recusa e diz as linhas.
    insert into public.ex_dependencias (cronograma_id, obra_id, predecessora_id, sucessora_id) values (v_c4, v_obra, v_m, v_a);
    begin perform public.fn_ex_cpm_recalcular(v_c4); v_txt := 'PASSOU (errado)';
    exception when others then v_txt := 'recusou: ' || sqlerrm; end;
    r := r || jsonb_build_object('4f_ciclo', v_txt);

    -- 4g. Desempenho: 3.000 atividades, ~4.500 vínculos. Meta: menos de 1.000 ms.
    declare v_c5 uuid := gen_random_uuid();
    begin
      insert into public.ex_cronogramas (id, obra_id, codigo, nome, calendario_id, data_inicio)
      values (v_c5, v_obra, 'PROVA5', 'Prova desempenho', v_cal4, '2026-03-02');
      insert into public.ex_atividades (cronograma_id, obra_id, codigo, nome, ordem, duracao_dias)
      select v_c5, v_obra, i::text, 'A' || i, i, (i % 5) + 1 from generate_series(1, 3000) i;
      insert into public.ex_dependencias (cronograma_id, obra_id, predecessora_id, sucessora_id, tipo)
      select v_c5, v_obra, p.id, s.id, 'TI' from public.ex_atividades p join public.ex_atividades s
        on s.cronograma_id = v_c5 and s.ordem = p.ordem + 1 where p.cronograma_id = v_c5
      union all
      select v_c5, v_obra, p.id, s.id, 'II' from public.ex_atividades p join public.ex_atividades s
        on s.cronograma_id = v_c5 and s.ordem = p.ordem + 3 where p.cronograma_id = v_c5 and p.ordem % 2 = 0;
      v_t0 := clock_timestamp();
      perform public.fn_ex_cpm_recalcular(v_c5);
      r := r || jsonb_build_object('4g_desempenho_ms', round(extract(epoch from clock_timestamp() - v_t0) * 1000),
        '4g_linhas', (select count(*) from public.ex_atividade_datas where cronograma_id = v_c5));
    end;
  end;
```

Esperado (a conferir no Step 4):
- `4a_cpm`: `{"1": ["2026-03-02","2026-03-06","2026-03-02","2026-03-09",0,0,true], "1.1": ["2026-03-02","2026-03-04","2026-03-02","2026-03-04",0,0,true], "1.2": ["2026-03-05","2026-03-06","2026-03-05","2026-03-06",0,0,true], "1.3": ["2026-03-03","2026-03-06","2026-03-04","2026-03-09",1,0,false], "2": ["2026-03-06","2026-03-09","2026-03-06","2026-03-09",0,0,true], "3": ["2026-03-02","2026-03-02","2026-03-09","2026-03-09",5,5,false], "4": ["2026-03-04","2026-03-05","2026-03-06","2026-03-09",2,2,false], "5": ["2026-03-09","2026-03-09","2026-03-09","2026-03-09",0,0,true]}`. O resumo "1" tem fim mais tarde 09/03 (o de C) e folga livre 0 por regra.
- `4b_e_se`: `{"marco_simulado": "2026-03-11", "marco_gravado": "2026-03-09"}`.
- `4c_restricao_sabado`: `["2026-03-09","2026-03-09"]`.
- `4d_inicio_domingo`: `"2026-03-02"`.
- `4e_real`: `{"a": ["2026-03-03","2026-03-05",false], "b": ["2026-03-06","2026-03-09"]}`.
- `4f_ciclo`: `"recusou: Dependência em ciclo: as linhas 1.1, ... não têm ordem possível"` (a lista exata depende da ordem; tem de conter `1.1` e `5`).
- `4g_desempenho_ms` < 1000 e `4g_linhas` = 3000.

Rodar: falha com `function public.fn_ex_cpm_recalcular(uuid) does not exist`.

- [ ] **Step 2: Escrever a migration**

`supabase/migrations/20261012120000_ex_fase1a_cpm.sql`:

```sql
-- Execução de Obras, Fase 1a: motor CPM. A ÚNICA fonte de datas, folgas e caminho crítico do módulo (D16).
-- Regras no plano (Task 3) e no guia para agentes. Tempo em dias úteis do calendário do cronograma:
-- ES = início (inclusivo), EF = ES + duração = fim EXCLUSIVO. Data de início = dia útil ES, data de fim = dia útil EF - 1.

create or replace function public.fn_ex_cpm_calcular(p_cronograma uuid, p_cenario jsonb default null)
returns table (atividade_id uuid, inicio_cedo date, fim_cedo date, inicio_tarde date, fim_tarde date,
               folga_total integer, folga_livre integer, critica boolean)
language plpgsql stable security definer set search_path to '' as $$
#variable_conflict use_column
declare
  v_cal uuid; v_inicio date; v_corte date; v_origem date; v_ate date;
  v_dias date[]; v_preciso int;
  v_id uuid[]; v_dur int[]; v_esmin int[]; v_lfmax int[]; v_fixes int[]; v_fixef int[]; v_cod text[]; v_n int;
  l_pred int[]; l_succ int[]; l_tipo text[]; l_lag int[]; v_m int;
  in_ini int[]; in_qtd int[]; out_lnk int[]; out_ini int[]; out_qtd int[];
  v_grau int[]; v_fila int[]; v_cab int := 1; v_cauda int := 0;
  v_es int[]; v_ef int[]; v_ls int[]; v_lf int[]; v_tf int[]; v_ff int[];
  v_pf int := 0; i int; j int; k int; u int; s int; x int; v_lim int; v_inicio_idx int; v_corte_idx int; v_resto text;
begin
  select c.calendario_id, c.data_inicio, c.data_corte into v_cal, v_inicio, v_corte
  from public.ex_cronogramas c where c.id = p_cronograma and c.excluido_em is null;
  if v_cal is null then raise exception 'Cronograma não encontrado' using errcode = 'P0001'; end if;

  -- Dias úteis da origem até depois da última data fixa (real, restrição, corte). Cresce no fim se precisar.
  select least(v_inicio, min(a.inicio_real)),
         greatest(v_inicio, coalesce(v_corte, v_inicio), max(a.inicio_real), max(a.fim_real), max(a.restricao_data_em)) + 30
    into v_origem, v_ate
  from public.ex_atividades a where a.cronograma_id = p_cronograma and a.excluido_em is null;
  v_origem := coalesce(v_origem, v_inicio);
  v_ate := coalesce(v_ate, v_inicio + 30);
  v_dias := array(select d.data from public.fn_ex_dias_uteis(v_cal, v_origem, v_ate) d);
  v_inicio_idx := (select count(*) from unnest(v_dias) w where w < v_inicio);
  v_corte_idx := case when v_corte is null then 0 else (select count(*) from unnest(v_dias) w where w < v_corte) end;

  -- Atividades e marcos (resumo não entra no cálculo), numerados 1..n.
  with a as (
    select a.id, a.codigo, row_number() over (order by a.ordem, a.id)::int as i,
           coalesce((p_cenario -> 'duracoes' ->> a.id::text)::int, a.duracao_dias) as dur,
           a.inicio_real, a.fim_real, a.restricao_data, a.restricao_data_em
    from public.ex_atividades a
    where a.cronograma_id = p_cronograma and a.excluido_em is null and a.tipo <> 'resumo')
  select array_agg(a.id order by a.i), array_agg(a.codigo order by a.i), array_agg(a.dur order by a.i),
         array_agg(greatest(v_inicio_idx,
                            case when a.inicio_real is null then v_corte_idx else 0 end,
                            case when a.restricao_data = 'inicio_nao_antes'
                                 then (select count(*) from unnest(v_dias) w where w < a.restricao_data_em)::int else 0 end) order by a.i),
         array_agg(case when a.restricao_data = 'fim_nao_depois'
                        then (select count(*) from unnest(v_dias) w where w <= a.restricao_data_em)::int end order by a.i),
         array_agg(case when a.inicio_real is not null then (select count(*) from unnest(v_dias) w where w < a.inicio_real)::int end order by a.i),
         array_agg(case when a.fim_real is not null then (select count(*) from unnest(v_dias) w where w <= a.fim_real)::int end order by a.i)
    into v_id, v_cod, v_dur, v_esmin, v_lfmax, v_fixes, v_fixef
  from a;
  v_n := coalesce(cardinality(v_id), 0);
  if v_n = 0 then return; end if;

  -- Vínculos entre atividades vivas, ordenados pela sucessora.
  with a as (
    select a.id, row_number() over (order by a.ordem, a.id)::int as i
    from public.ex_atividades a
    where a.cronograma_id = p_cronograma and a.excluido_em is null and a.tipo <> 'resumo'),
  l as (
    select pa.i as p, sa.i as s, d.tipo, d.atraso_dias as lag
    from public.ex_dependencias d join a pa on pa.id = d.predecessora_id join a sa on sa.id = d.sucessora_id
    where d.cronograma_id = p_cronograma)
  select coalesce(array_agg(l.p order by l.s, l.p), '{}'), coalesce(array_agg(l.s order by l.s, l.p), '{}'),
         coalesce(array_agg(l.tipo order by l.s, l.p), '{}'), coalesce(array_agg(l.lag order by l.s, l.p), '{}')
    into l_pred, l_succ, l_tipo, l_lag
  from l;
  v_m := cardinality(l_pred);

  in_ini := array_fill(0, array[v_n]); in_qtd := array_fill(0, array[v_n]);
  out_ini := array_fill(0, array[v_n]); out_qtd := array_fill(0, array[v_n]);
  for k in 1 .. v_m loop
    s := l_succ[k];
    if in_qtd[s] = 0 then in_ini[s] := k; end if;
    in_qtd[s] := in_qtd[s] + 1;
  end loop;
  out_lnk := coalesce((select array_agg(t.k order by t.p, t.k) from unnest(l_pred) with ordinality as t(p, k)), '{}');
  for j in 1 .. v_m loop
    u := l_pred[out_lnk[j]];
    if out_qtd[u] = 0 then out_ini[u] := j; end if;
    out_qtd[u] := out_qtd[u] + 1;
  end loop;

  -- Ordem topológica (Kahn).
  v_grau := in_qtd; v_fila := array_fill(0, array[v_n]);
  for i in 1 .. v_n loop
    if v_grau[i] = 0 then v_cauda := v_cauda + 1; v_fila[v_cauda] := i; end if;
  end loop;
  while v_cab <= v_cauda loop
    u := v_fila[v_cab]; v_cab := v_cab + 1;
    for j in out_ini[u] .. out_ini[u] + out_qtd[u] - 1 loop
      continue when out_qtd[u] = 0;
      s := l_succ[out_lnk[j]];
      v_grau[s] := v_grau[s] - 1;
      if v_grau[s] = 0 then v_cauda := v_cauda + 1; v_fila[v_cauda] := s; end if;
    end loop;
  end loop;
  if v_cauda < v_n then
    select string_agg(v_cod[t.i], ', ' order by v_cod[t.i]) into v_resto
    from (select g.i from generate_series(1, v_n) g(i) where v_grau[g.i] > 0 order by g.i limit 10) t;
    raise exception 'Dependência em ciclo: as linhas % não têm ordem possível', v_resto using errcode = 'P0001';
  end if;

  -- Ida: datas mais cedo.
  v_es := array_fill(0, array[v_n]); v_ef := array_fill(0, array[v_n]);
  for x in 1 .. v_n loop
    u := v_fila[x];
    if v_fixes[u] is not null then
      v_es[u] := v_fixes[u];
    else
      v_es[u] := v_esmin[u];
      for k in in_ini[u] .. in_ini[u] + in_qtd[u] - 1 loop
        continue when in_qtd[u] = 0;
        i := l_pred[k];
        v_es[u] := greatest(v_es[u], case l_tipo[k]
          when 'TI' then v_ef[i] + l_lag[k]
          when 'II' then v_es[i] + l_lag[k]
          when 'TT' then v_ef[i] + l_lag[k] - v_dur[u]
          else v_es[i] + l_lag[k] - v_dur[u] end);
      end loop;
    end if;
    v_ef[u] := coalesce(v_fixef[u], v_es[u] + v_dur[u]);
    v_pf := greatest(v_pf, v_ef[u]);
  end loop;

  -- Volta: datas mais tarde e folgas.
  v_ls := array_fill(0, array[v_n]); v_lf := array_fill(0, array[v_n]);
  v_tf := array_fill(0, array[v_n]); v_ff := array_fill(0, array[v_n]);
  for x in reverse v_n .. 1 loop
    u := v_fila[x];
    v_lim := least(v_pf, coalesce(v_lfmax[u], v_pf));
    v_ff[u] := v_pf - v_ef[u];
    for j in out_ini[u] .. out_ini[u] + out_qtd[u] - 1 loop
      continue when out_qtd[u] = 0;
      k := out_lnk[j]; s := l_succ[k];
      v_lim := least(v_lim, case l_tipo[k]
        when 'TI' then v_ls[s] - l_lag[k]
        when 'II' then v_ls[s] - l_lag[k] + v_dur[u]
        when 'TT' then v_lf[s] - l_lag[k]
        else v_lf[s] - l_lag[k] + v_dur[u] end);
      v_ff[u] := least(v_ff[u], case l_tipo[k]
        when 'TI' then v_es[s] - (v_ef[u] + l_lag[k])
        when 'II' then v_es[s] - (v_es[u] + l_lag[k])
        when 'TT' then v_ef[s] - (v_ef[u] + l_lag[k])
        else v_ef[s] - (v_es[u] + l_lag[k]) end);
    end loop;
    v_lf[u] := v_lim; v_ls[u] := v_lim - v_dur[u];
    v_tf[u] := v_ls[u] - v_es[u];
    if v_fixef[u] is not null then v_tf[u] := 0; v_ff[u] := 0; end if;
  end loop;

  -- Garante dias úteis suficientes para converter os índices em data.
  v_preciso := greatest((select max(e) from unnest(v_ef) e), (select max(e) from unnest(v_lf) e)) + 2;
  while cardinality(v_dias) < v_preciso loop
    if v_ate > v_origem + 36500 then
      raise exception 'O cronograma passa de 100 anos: confira as durações e o calendário' using errcode = 'P0001';
    end if;
    v_ate := v_ate + greatest(60, (v_preciso - cardinality(v_dias)) * 2);
    v_dias := array(select d.data from public.fn_ex_dias_uteis(v_cal, v_origem, v_ate) d);
  end loop;

  return query
  with recursive base as (
    select v_id[g.i] as id, v_dur[g.i] as dur, v_es[g.i] as es, v_ef[g.i] as ef, v_ls[g.i] as ls, v_lf[g.i] as lf,
           v_tf[g.i] as tf, v_ff[g.i] as ff, (v_tf[g.i] <= 0 and v_fixef[g.i] is null) as crit
    from generate_series(1, v_n) g(i)),
  folhas as (
    select b.id,
           case when b.dur > 0 then v_dias[b.es + 1] else v_dias[greatest(b.es, 1)] end as ic,
           case when b.dur > 0 then v_dias[b.ef] else v_dias[greatest(b.es, 1)] end as fc,
           -- Folga negativa (restrição "fim não depois de" impossível) daria índice < 0: a data mais tarde
           -- fica no primeiro dia útil e a folga negativa continua em folga_total.
           case when b.dur > 0 then v_dias[greatest(b.ls, 0) + 1] else v_dias[greatest(b.ls, 1)] end as it,
           case when b.dur > 0 then v_dias[greatest(b.lf, 1)] else v_dias[greatest(b.ls, 1)] end as ft,
           b.tf, b.ff, b.crit
    from base b),
  arvore as (
    -- Cada resumo ligado a todas as folhas descendentes.
    select r.id as resumo_id, r.id as no_id
    from public.ex_atividades r where r.cronograma_id = p_cronograma and r.excluido_em is null and r.tipo = 'resumo'
    union all
    select t.resumo_id, f.id
    from arvore t join public.ex_atividades f on f.pai_id = t.no_id and f.excluido_em is null)
  select f.id, f.ic, f.fc, f.it, f.ft, f.tf, f.ff, f.crit from folhas f
  union all
  select t.resumo_id, min(f.ic), max(f.fc), min(f.it), max(f.ft), min(f.tf), 0, bool_or(f.crit)
  from arvore t join folhas f on f.id = t.no_id
  group by t.resumo_id;
end $$;

create or replace function public.fn_ex_cpm_recalcular(p_cronograma uuid)
returns void language plpgsql security definer set search_path to '' as $$
declare v_obra uuid;
begin
  select obra_id into v_obra from public.ex_cronogramas where id = p_cronograma;
  delete from public.ex_atividade_datas where cronograma_id = p_cronograma;
  insert into public.ex_atividade_datas (atividade_id, cronograma_id, obra_id, inicio_cedo, fim_cedo, inicio_tarde,
    fim_tarde, folga_total, folga_livre, critica)
  select c.atividade_id, p_cronograma, v_obra, c.inicio_cedo, c.fim_cedo, c.inicio_tarde, c.fim_tarde,
         c.folga_total, c.folga_livre, c.critica
  from public.fn_ex_cpm_calcular(p_cronograma) c;
  update public.ex_cronogramas set calculado_em = now() where id = p_cronograma;
end $$;

-- Internas: só as RPCs fn_ex_* (security definer) chamam. Nenhum grant para authenticated.
revoke all on function public.fn_ex_cpm_calcular(uuid, jsonb) from public, anon, authenticated;
revoke all on function public.fn_ex_cpm_recalcular(uuid) from public, anon, authenticated;
```

Nota sobre a prova 4a: o resumo "1" agrega 1.1, 1.2 e 1.3, então o fim mais tarde dele é o maior entre 04/03, 06/03 e 09/03 = 09/03, e a folga total é a menor (0). Se o resultado divergir da tabela, **o erro está no código, não na tabela**: a tabela foi feita à mão antes do código. Só mude a tabela se mostrar ao Tiago o porquê.

- [ ] **Step 3: Aplicar e renomear se preciso**

- [ ] **Step 4: Rodar a prova**

Esperado: os valores listados no Step 1. Se `4g_desempenho_ms` passar de 1000, anote o número e otimize antes de seguir (primeiro suspeito: os `count(*) from unnest(v_dias)` por atividade; trocar por busca binária num laço só nas atividades com data fixa).

- [ ] **Step 5: Mutação manual**

Num `begin; ... rollback;`, recrie `fn_ex_cpm_calcular` com (1) `'TT' then v_ef[i] + l_lag[k]` sem `- v_dur[u]` e (2) `v_dias[b.ef]` trocado por `v_dias[b.ef + 1]`, uma de cada vez, e rode a prova: `4a` tem de mudar nas duas. Anote no commit.

- [ ] **Step 6: Advisors e commit**

```bash
git add supabase/migrations/*_ex_fase1a_cpm.sql supabase/provas/ex_fase1a_banco.sql
git commit -m "Execução F1a: motor CPM no banco (4 vínculos, atraso, restrições, real, resumo)"
```

---

### Task 4: RPCs de obra, cronograma, acesso, locais, serviços e calendário

**Files:**
- Create: `supabase/migrations/20261012130000_ex_fase1a_rpcs_obra.sql`
- Modify: `supabase/provas/ex_fase1a_banco.sql` (caso 3)

**Interfaces:**
- Consumes: `fn_ex_exigir`, `fn_ex_acessa_obra` (Task 1); `fn_ex_cpm_recalcular` (Task 3).
- Produces (todas `security definer`, `grant execute to authenticated`, erros `P0001` em pt-BR):
  - `fn_ex_obras_disponiveis() returns table (obra_id uuid, nome text, tem_pasta boolean, tenho_acesso boolean)`
  - `fn_ex_obra_nome(p_obra uuid) returns text` (nulo se o usuário não vê a obra)
  - `fn_ex_cronograma_salvar(p_dados jsonb, p_id uuid default null) returns uuid`. Chaves de `p_dados`: `obra_id` (só na criação), `tipo_obra` (obrigatório se a obra ainda não tem pasta), `calendario_modelo_id` (opcional, só na criação), `codigo`, `nome`, `data_inicio`, `data_corte`, `criterio_peso`, `observacoes`.
  - `fn_ex_cronograma_status(p_id uuid, p_status text) returns void`
  - `fn_ex_cronograma_excluir(p_id uuid, p_motivo text) returns void`
  - `fn_ex_cronograma_recalcular(p_id uuid) returns void`
  - `fn_ex_obra_configurar(p_obra uuid, p_dados jsonb) returns void`. Chaves: `tipo_obra`, `calendario_id` (modelo), `km_inicial`, `km_final`, `metros_por_estaca`, `ppc_limite`, `observacoes`.
  - `fn_ex_acesso_definir(p_obra uuid, p_usuario uuid, p_tem boolean) returns void`
  - `fn_ex_usuarios_da_obra(p_obra uuid) returns table (usuario_id uuid, nome text, email text, na_lista boolean)`
  - `fn_ex_local_salvar(p_obra uuid, p_dados jsonb, p_id uuid default null) returns uuid`. Chaves: `pai_id`, `tipo`, `codigo`, `nome`, `ordem`, `km_inicial`, `km_final`, `lado`, `faixa`.
  - `fn_ex_local_excluir(p_id uuid, p_motivo text) returns void`
  - `fn_ex_servico_salvar(p_dados jsonb, p_id uuid default null) returns uuid`. Chaves: `codigo`, `nome`, `unidade_id`, `produtividade_padrao`, `ceu_aberto`, `ativo`, `observacoes`.
  - `fn_ex_calendario_salvar(p_dados jsonb, p_id uuid default null) returns uuid`. Criar = calendário **modelo** (`execucao.modelos/criar`). Editar um modelo exige `execucao.modelos/editar`; editar o calendário próprio de um cronograma exige `execucao.cronogramas/editar` e a lista da obra. Chaves: `nome`, `horas_seg` ... `horas_dom`, `feriados_abrangencia` (array), `municipio`, `chuvoso_inicio_mes`, `chuvoso_fim_mes`, `padrao_empresa` (só modelo), `observacoes`.
  - `fn_ex_calendario_excecao_salvar(p_cal uuid, p_data date, p_horas numeric, p_tipo text, p_descricao text) returns void` e `fn_ex_calendario_excecao_excluir(p_cal uuid, p_data date) returns void`. Mesma regra de permissão do calendário.
  - Toda mudança de calendário recalcula os cronogramas que usam o calendário ou um filho dele.
  - `fn_ex_feriado_salvar(p_dados jsonb, p_id uuid default null) returns uuid` (chaves `data`, `nome`, `abrangencia`, `municipio`) e `fn_ex_feriado_excluir(p_id uuid) returns void`: o Tiago diz no app o que é feriado (decisão de 09/10/2026). Criar exige `execucao.modelos/criar`, editar `editar`, excluir `excluir`. Feriado é global: depois de gravar, recalcula todos os cronogramas vivos (`fn_ex_recalcular_todos()`, interna). Excluir é definitivo (a trilha fica no `audit_log`). Para "este feriado não vale nesta obra", o caminho é a exceção do calendário do cronograma com horas > 0.

- [ ] **Step 1: Escrever o caso 3 da prova (falha)**

No `ex_fase1a_banco.sql`, depois do caso 2 e antes do caso 4. Declare no topo do bloco `$prova$`: `v_lista bigint; v_admins bigint;`.

```sql
  -- 3. Acesso por obra. As permissões do backfill (Task 7) ainda não estão aplicadas: a prova dá ao
  --    Tiago as 9 da fase dentro da transação.
  insert into public.usuario_permissoes (usuario_id, recurso, acao)
  select v_tiago, x.recurso, x.acao from (values ('execucao.obras', 'ver'),
    ('execucao.cronogramas', 'ver'), ('execucao.cronogramas', 'criar'), ('execucao.cronogramas', 'editar'), ('execucao.cronogramas', 'excluir'),
    ('execucao.modelos', 'ver'), ('execucao.modelos', 'criar'), ('execucao.modelos', 'editar'), ('execucao.modelos', 'excluir')) x(recurso, acao)
  on conflict do nothing;
  select count(*) into v_admins from public.usuarios u join public.perfis p on p.id = u.perfil_id and p.nome = 'Admin'
   where u.ativo and u.excluido_em is null;
  select o.id into v_obra2 from public.obras o where o.ativo and not exists (select 1 from public.ex_obras e where e.obra_id = o.id)
   order by o.nome desc limit 1;

  -- 3a. Tiago cria o primeiro cronograma da obra 2: a pasta nasce e a lista recebe Tiago + Admins. Esperado: lista = admins
  perform set_config('request.jwt.claims', json_build_object('sub', v_tiago, 'role', 'authenticated')::text, true);
  set local role authenticated;
  v_cron := public.fn_ex_cronograma_salvar(jsonb_build_object('obra_id', v_obra2, 'tipo_obra', 'edificacao',
    'codigo', 'FUND', 'nome', 'Fundação', 'data_inicio', '2026-03-02'));
  reset role;
  select count(*) into v_lista from public.ex_obra_usuarios where obra_id = v_obra2;
  r := r || jsonb_build_object('3a_pasta_e_lista', jsonb_build_object('lista', v_lista, 'admins', v_admins,
    'calendario_herdado', (select c.pai_id = (select id from public.ex_calendarios where padrao_empresa)
                           from public.ex_cronogramas k join public.ex_calendarios c on c.id = k.calendario_id where k.id = v_cron)));

  -- 3b. Usuário zero sem permissão nenhuma não vê nada. Esperado: 0
  perform set_config('request.jwt.claims', json_build_object('sub', v_zero, 'role', 'authenticated')::text, true);
  set local role authenticated;
  r := r || jsonb_build_object('3b_zero_sem_permissao', (select count(*) from public.ex_cronogramas));
  reset role;

  -- 3c. Zero com execucao.cronogramas/ver mas fora da lista: continua sem ver. Esperado: 0
  insert into public.usuario_permissoes (usuario_id, recurso, acao) values (v_zero, 'execucao.cronogramas', 'ver');
  set local role authenticated;
  r := r || jsonb_build_object('3c_zero_fora_da_lista', (select count(*) from public.ex_cronogramas));
  reset role;

  -- 3d. Tiago põe o zero na lista: zero vê 1.
  perform set_config('request.jwt.claims', json_build_object('sub', v_tiago, 'role', 'authenticated')::text, true);
  set local role authenticated;
  perform public.fn_ex_acesso_definir(v_obra2, v_zero, true);
  reset role;
  perform set_config('request.jwt.claims', json_build_object('sub', v_zero, 'role', 'authenticated')::text, true);
  set local role authenticated;
  r := r || jsonb_build_object('3d_zero_na_lista', (select count(*) from public.ex_cronogramas));
  reset role;

  -- 3e. Zero desativado: deixa de ver na hora, e a RPC recusa. Esperado: 0 e "recusou: ..."
  update public.usuarios set ativo = false where id = v_zero;
  insert into public.usuario_permissoes (usuario_id, recurso, acao) values (v_zero, 'execucao.cronogramas', 'editar');
  set local role authenticated;
  r := r || jsonb_build_object('3e_desativado_ve', (select count(*) from public.ex_cronogramas));
  begin perform public.fn_ex_cronograma_salvar(jsonb_build_object('codigo', 'FUND', 'nome', 'Mudou', 'data_inicio', '2026-03-02'), v_cron);
    v_txt := 'PASSOU (errado)'; exception when others then v_txt := 'recusou: ' || sqlerrm; end;
  r := r || jsonb_build_object('3e_desativado_edita', v_txt);
  reset role;
  update public.usuarios set ativo = true where id = v_zero;
  delete from public.usuario_permissoes where usuario_id = v_zero and recurso like 'execucao.%';

  -- 3f. Tirar o último da lista é recusado. Esperado: "recusou: A obra não pode ficar sem ninguém na lista"
  delete from public.ex_obra_usuarios where obra_id = v_obra2 and usuario_id <> v_tiago;
  perform set_config('request.jwt.claims', json_build_object('sub', v_tiago, 'role', 'authenticated')::text, true);
  set local role authenticated;
  begin perform public.fn_ex_acesso_definir(v_obra2, v_tiago, false);
    v_txt := 'PASSOU (errado)'; exception when others then v_txt := 'recusou: ' || sqlerrm; end;
  r := r || jsonb_build_object('3f_ultimo_da_lista', v_txt);

  -- 3g. Código repetido na mesma obra. Esperado: "recusou: Já existe outro cronograma com o código FUND nesta obra"
  begin perform public.fn_ex_cronograma_salvar(jsonb_build_object('obra_id', v_obra2, 'codigo', 'fund', 'nome', 'Outra', 'data_inicio', '2026-03-02'));
    v_txt := 'PASSOU (errado)'; exception when others then v_txt := 'recusou: ' || sqlerrm; end;
  r := r || jsonb_build_object('3g_codigo_repetido', v_txt);

  -- 3j. Feriado pelo app: 24/12/2026 (quinta) vira feriado nacional e sai dos dias úteis; excluir devolve.
  --     Esperado: {"antes": true, "feriado": false, "depois": true}
  declare v_fer uuid;
  begin
    r := r || jsonb_build_object('3j_feriado_app', jsonb_build_object(
      'antes', exists (select 1 from public.fn_ex_dias_uteis((select id from public.ex_calendarios where padrao_empresa), '2026-12-24', '2026-12-24'))));
    v_fer := public.fn_ex_feriado_salvar(jsonb_build_object('data', '2026-12-24', 'nome', 'Véspera de Natal', 'abrangencia', 'nacional'));
    r := r || jsonb_build_object('3j_feriado', exists (select 1 from public.fn_ex_dias_uteis((select id from public.ex_calendarios where padrao_empresa), '2026-12-24', '2026-12-24')));
    perform public.fn_ex_feriado_excluir(v_fer);
    r := r || jsonb_build_object('3j_depois', exists (select 1 from public.fn_ex_dias_uteis((select id from public.ex_calendarios where padrao_empresa), '2026-12-24', '2026-12-24')));
  end;

  -- 3h. Local em ciclo: B filho de A, depois A filho de B. Esperado: "recusou: ..."
  declare v_la uuid; v_lb uuid;
  begin
    v_la := public.fn_ex_local_salvar(v_obra2, jsonb_build_object('tipo', 'bloco', 'codigo', 'A', 'nome', 'Bloco A'));
    v_lb := public.fn_ex_local_salvar(v_obra2, jsonb_build_object('tipo', 'pavimento', 'codigo', 'A-T', 'nome', 'Térreo', 'pai_id', v_la));
    begin perform public.fn_ex_local_salvar(v_obra2, jsonb_build_object('tipo', 'bloco', 'codigo', 'A', 'nome', 'Bloco A', 'pai_id', v_lb), v_la);
      v_txt := 'PASSOU (errado)'; exception when others then v_txt := 'recusou: ' || sqlerrm; end;
    r := r || jsonb_build_object('3h_local_em_ciclo', v_txt);
  end;
  reset role;

  -- 3i. Zero com criar, fora da lista, tenta criar cronograma numa obra que já tem pasta.
  --     Esperado: "recusou: Esta obra já tem cronogramas e você não está na lista de acesso dela..."
  insert into public.usuario_permissoes (usuario_id, recurso, acao) values (v_zero, 'execucao.cronogramas', 'criar');
  perform set_config('request.jwt.claims', json_build_object('sub', v_zero, 'role', 'authenticated')::text, true);
  set local role authenticated;
  begin perform public.fn_ex_cronograma_salvar(jsonb_build_object('obra_id', v_obra2, 'codigo', 'OUTRO', 'nome', 'Outro', 'data_inicio', '2026-03-02'));
    v_txt := 'PASSOU (errado)'; exception when others then v_txt := 'recusou: ' || sqlerrm; end;
  r := r || jsonb_build_object('3i_criar_fora_da_lista', v_txt);
  reset role;
  delete from public.usuario_permissoes where usuario_id = v_zero and recurso like 'execucao.%';
```

Declare também `v_obra2 uuid;` no topo (já existe na Task 1 como `v_obra2`). Rodar: falha com `function public.fn_ex_cronograma_salvar(jsonb) does not exist`.

Esperado depois da migration: `3a {"lista": <admins>, "admins": <admins>, "calendario_herdado": true}` (o Tiago é Admin, então lista = admins = 4); `3b 0`; `3c 0`; `3d 1`; `3e_desativado_ve 0`; `3e_desativado_edita "recusou: ..."`; `3f "recusou: A obra não pode ficar sem ninguém na lista"`; `3g "recusou: Já existe outro cronograma com o código FUND nesta obra"`; `3h "recusou: Um local não pode ficar dentro dele mesmo"`; `3i "recusou: Esta obra já tem cronogramas e você não está na lista de acesso dela..."`; `3j_feriado_app {"antes": true}`, `3j_feriado false`, `3j_depois true`.

- [ ] **Step 2: Escrever a migration**

`supabase/migrations/20261012130000_ex_fase1a_rpcs_obra.sql`:

```sql
-- Execução de Obras, Fase 1a: RPCs de obra, cronograma, acesso, locais, serviços e calendário.
-- Toda escrita do módulo passa por aqui (D13). Cada RPC confere a ação E a lista da obra.

create or replace function public.fn_ex_obras_disponiveis()
returns table (obra_id uuid, nome text, tem_pasta boolean, tenho_acesso boolean)
language plpgsql stable security definer set search_path to '' as $$
#variable_conflict use_column
begin
  if not public.tem_permissao('execucao.cronogramas', 'criar') then
    raise exception 'Sem permissão para criar cronograma' using errcode = 'P0001';
  end if;
  return query
  select o.id, o.nome, e.obra_id is not null, public.fn_ex_acessa_obra(o.id)
  from public.obras o left join public.ex_obras e on e.obra_id = o.id
  where o.ativo
  order by o.nome;
end $$;

create or replace function public.fn_ex_obra_nome(p_obra uuid)
returns text language sql stable security definer set search_path to '' as $$
  select o.nome from public.obras o
  where o.id = p_obra and public.fn_ve_execucao() and public.fn_ex_acessa_obra(p_obra);
$$;

-- Recalcula todos os cronogramas vivos que usam o calendário ou um filho dele.
create or replace function public.fn_ex_recalcular_calendario(p_cal uuid)
returns void language plpgsql security definer set search_path to '' as $$
declare v_c uuid;
begin
  for v_c in select k.id from public.ex_cronogramas k join public.ex_calendarios c on c.id = k.calendario_id
             where k.excluido_em is null and (c.id = p_cal or c.pai_id = p_cal) loop
    perform public.fn_ex_cpm_recalcular(v_c);
  end loop;
end $$;

-- Permissão sobre um calendário: modelo é da aba Modelos; o calendário de um cronograma é do cronograma.
create or replace function public.fn_ex_exigir_calendario(p_cal uuid, p_mensagem text)
returns void language plpgsql stable security definer set search_path to '' as $$
declare v_modelo boolean; v_obra uuid;
begin
  select c.modelo into v_modelo from public.ex_calendarios c where c.id = p_cal and c.excluido_em is null;
  if v_modelo is null then raise exception 'Calendário não encontrado' using errcode = 'P0001'; end if;
  if v_modelo then
    perform public.fn_ex_exigir('execucao.modelos', 'editar', null, p_mensagem);
  else
    select k.obra_id into v_obra from public.ex_cronogramas k where k.calendario_id = p_cal and k.excluido_em is null limit 1;
    if v_obra is null then raise exception 'Calendário sem cronograma vivo' using errcode = 'P0001'; end if;
    perform public.fn_ex_exigir('execucao.cronogramas', 'editar', v_obra, p_mensagem);
  end if;
end $$;

create or replace function public.fn_ex_cronograma_salvar(p_dados jsonb, p_id uuid default null)
returns uuid language plpgsql security definer set search_path to '' as $$
declare
  v_obra uuid; v_id uuid; v_modelo uuid; v_cal uuid;
  v_codigo text := upper(btrim(coalesce(p_dados ->> 'codigo', '')));
  v_nome text := btrim(coalesce(p_dados ->> 'nome', ''));
  v_inicio date := nullif(p_dados ->> 'data_inicio', '')::date;
  v_corte date := nullif(p_dados ->> 'data_corte', '')::date;
  v_peso text := coalesce(nullif(p_dados ->> 'criterio_peso', ''), 'duracao');
begin
  if v_codigo !~ '^[A-Z0-9][A-Z0-9-]{0,19}$' then
    raise exception 'Código do cronograma: até 20 letras, números ou hífen, sem espaço' using errcode = 'P0001';
  end if;
  if char_length(v_nome) not between 2 and 160 then raise exception 'Informe o nome do cronograma' using errcode = 'P0001'; end if;
  if v_inicio is null then raise exception 'Informe a data de início do cronograma' using errcode = 'P0001'; end if;
  if v_peso not in ('valor', 'duracao', 'homem_hora', 'manual') then raise exception 'Critério de peso inválido' using errcode = 'P0001'; end if;

  if p_id is null then
    perform public.fn_ex_exigir('execucao.cronogramas', 'criar', null, 'Sem permissão para criar cronograma');
    v_obra := nullif(p_dados ->> 'obra_id', '')::uuid;
    if v_obra is null or not exists (select 1 from public.obras where id = v_obra and ativo) then
      raise exception 'Escolha uma obra ativa do cadastro de Obras' using errcode = 'P0001';
    end if;
    perform pg_advisory_xact_lock(hashtextextended('ex_obra:' || v_obra::text, 0));
    if not exists (select 1 from public.ex_obras where obra_id = v_obra) then
      if coalesce(p_dados ->> 'tipo_obra', '') not in ('edificacao', 'rodovia', 'pequena') then
        raise exception 'Informe o tipo da obra: edificação, rodovia ou obra pequena' using errcode = 'P0001';
      end if;
      insert into public.ex_obras (obra_id, tipo_obra, calendario_id)
      values (v_obra, p_dados ->> 'tipo_obra',
              (select id from public.ex_calendarios where padrao_empresa and excluido_em is null));
      -- Q1 (a): a pasta nasce com quem criou e todos os Admins ativos na lista.
      insert into public.ex_obra_usuarios (obra_id, usuario_id)
      select v_obra, u.id from public.usuarios u left join public.perfis p on p.id = u.perfil_id
      where u.ativo and u.excluido_em is null and (u.id = (select auth.uid()) or p.nome = 'Admin')
      on conflict do nothing;
    elsif not public.fn_ex_acessa_obra(v_obra) then
      raise exception 'Esta obra já tem cronogramas e você não está na lista de acesso dela. Peça para alguém da lista incluir você'
        using errcode = 'P0001';
    end if;
    v_modelo := coalesce(nullif(p_dados ->> 'calendario_modelo_id', '')::uuid,
                         (select calendario_id from public.ex_obras where obra_id = v_obra),
                         (select id from public.ex_calendarios where padrao_empresa and excluido_em is null));
    if not exists (select 1 from public.ex_calendarios where id = v_modelo and modelo and excluido_em is null) then
      raise exception 'Calendário modelo não encontrado' using errcode = 'P0001';
    end if;
    -- Cada cronograma tem o próprio calendário, filho do modelo: herda as exceções do modelo e ganha as dele.
    insert into public.ex_calendarios (nome, pai_id, horas_seg, horas_ter, horas_qua, horas_qui, horas_sex, horas_sab, horas_dom,
      feriados_abrangencia, municipio, chuvoso_inicio_mes, chuvoso_fim_mes)
    select 'Cronograma ' || v_codigo, c.id, c.horas_seg, c.horas_ter, c.horas_qua, c.horas_qui, c.horas_sex, c.horas_sab, c.horas_dom,
           c.feriados_abrangencia, c.municipio, c.chuvoso_inicio_mes, c.chuvoso_fim_mes
    from public.ex_calendarios c where c.id = v_modelo
    returning id into v_cal;
    begin
      insert into public.ex_cronogramas (obra_id, codigo, nome, calendario_id, criterio_peso, data_inicio, data_corte, observacoes)
      values (v_obra, v_codigo, v_nome, v_cal, v_peso, v_inicio, v_corte, nullif(btrim(p_dados ->> 'observacoes'), ''))
      returning id into v_id;
    exception when unique_violation then
      raise exception 'Já existe outro cronograma com o código % nesta obra', v_codigo using errcode = 'P0001';
    end;
  else
    select obra_id into v_obra from public.ex_cronogramas where id = p_id and excluido_em is null;
    if v_obra is null then raise exception 'Cronograma não encontrado' using errcode = 'P0001'; end if;
    perform public.fn_ex_exigir('execucao.cronogramas', 'editar', v_obra, 'Sem permissão para editar cronograma');
    begin
      update public.ex_cronogramas
         set codigo = v_codigo, nome = v_nome, criterio_peso = v_peso, data_inicio = v_inicio, data_corte = v_corte,
             observacoes = nullif(btrim(p_dados ->> 'observacoes'), '')
       where id = p_id;
    exception when unique_violation then
      raise exception 'Já existe outro cronograma com o código % nesta obra', v_codigo using errcode = 'P0001';
    end;
    v_id := p_id;
  end if;
  perform public.fn_ex_cpm_recalcular(v_id);
  return v_id;
end $$;

create or replace function public.fn_ex_cronograma_status(p_id uuid, p_status text)
returns void language plpgsql security definer set search_path to '' as $$
declare v_obra uuid;
begin
  select obra_id into v_obra from public.ex_cronogramas where id = p_id and excluido_em is null;
  if v_obra is null then raise exception 'Cronograma não encontrado' using errcode = 'P0001'; end if;
  perform public.fn_ex_exigir('execucao.cronogramas', 'editar', v_obra, 'Sem permissão para mudar a situação do cronograma');
  if p_status not in ('rascunho', 'ativo', 'concluido', 'arquivado') then
    raise exception 'Situação inválida' using errcode = 'P0001';
  end if;
  update public.ex_cronogramas set status = p_status where id = p_id;
end $$;

create or replace function public.fn_ex_cronograma_excluir(p_id uuid, p_motivo text)
returns void language plpgsql security definer set search_path to '' as $$
declare v_obra uuid;
begin
  select obra_id into v_obra from public.ex_cronogramas where id = p_id and excluido_em is null;
  if v_obra is null then raise exception 'Cronograma não encontrado' using errcode = 'P0001'; end if;
  perform public.fn_ex_exigir('execucao.cronogramas', 'excluir', v_obra, 'Sem permissão para excluir cronograma');
  if btrim(coalesce(p_motivo, '')) = '' then raise exception 'Informe o motivo da exclusão' using errcode = 'P0001'; end if;
  update public.ex_cronogramas set excluido_em = now(), excluido_por = (select auth.uid()), motivo_exclusao = btrim(p_motivo)
  where id = p_id;
end $$;

create or replace function public.fn_ex_cronograma_recalcular(p_id uuid)
returns void language plpgsql security definer set search_path to '' as $$
declare v_obra uuid;
begin
  select obra_id into v_obra from public.ex_cronogramas where id = p_id and excluido_em is null;
  if v_obra is null then raise exception 'Cronograma não encontrado' using errcode = 'P0001'; end if;
  perform public.fn_ex_exigir('execucao.cronogramas', 'editar', v_obra, 'Sem permissão para recalcular o cronograma');
  perform public.fn_ex_cpm_recalcular(p_id);
end $$;

create or replace function public.fn_ex_obra_configurar(p_obra uuid, p_dados jsonb)
returns void language plpgsql security definer set search_path to '' as $$
declare v_tipo text := p_dados ->> 'tipo_obra'; v_cal uuid := nullif(p_dados ->> 'calendario_id', '')::uuid;
begin
  if not exists (select 1 from public.ex_obras where obra_id = p_obra) then raise exception 'Obra sem pasta no módulo' using errcode = 'P0001'; end if;
  perform public.fn_ex_exigir('execucao.cronogramas', 'editar', p_obra, 'Sem permissão para configurar a obra');
  if v_tipo not in ('edificacao', 'rodovia', 'pequena') then raise exception 'Tipo de obra inválido' using errcode = 'P0001'; end if;
  if v_cal is not null and not exists (select 1 from public.ex_calendarios where id = v_cal and modelo and excluido_em is null) then
    raise exception 'O calendário padrão da obra precisa ser um calendário modelo' using errcode = 'P0001';
  end if;
  if v_tipo <> 'rodovia' and (nullif(p_dados ->> 'km_inicial', '') is not null or nullif(p_dados ->> 'km_final', '') is not null) then
    raise exception 'Km inicial e final só valem para obra de rodovia' using errcode = 'P0001';
  end if;
  update public.ex_obras set
    tipo_obra = v_tipo, calendario_id = v_cal,
    km_inicial = nullif(p_dados ->> 'km_inicial', '')::numeric, km_final = nullif(p_dados ->> 'km_final', '')::numeric,
    metros_por_estaca = coalesce(nullif(p_dados ->> 'metros_por_estaca', '')::numeric, 20),
    ppc_limite = coalesce(nullif(p_dados ->> 'ppc_limite', '')::numeric, 80),
    observacoes = nullif(btrim(p_dados ->> 'observacoes'), '')
  where obra_id = p_obra;
end $$;

create or replace function public.fn_ex_acesso_definir(p_obra uuid, p_usuario uuid, p_tem boolean)
returns void language plpgsql security definer set search_path to '' as $$
begin
  perform public.fn_ex_exigir('execucao.cronogramas', 'editar', p_obra, 'Sem permissão para mudar o acesso da obra');
  perform pg_advisory_xact_lock(hashtextextended('ex_obra:' || p_obra::text, 0));
  if p_tem then
    if not exists (select 1 from public.usuarios where id = p_usuario and ativo and excluido_em is null) then
      raise exception 'Usuário não encontrado ou inativo' using errcode = 'P0001';
    end if;
    insert into public.ex_obra_usuarios (obra_id, usuario_id) values (p_obra, p_usuario) on conflict do nothing;
  else
    delete from public.ex_obra_usuarios where obra_id = p_obra and usuario_id = p_usuario;
    if not exists (select 1 from public.ex_obra_usuarios ou join public.usuarios u on u.id = ou.usuario_id
                   where ou.obra_id = p_obra and u.ativo and u.excluido_em is null) then
      raise exception 'A obra não pode ficar sem ninguém na lista' using errcode = 'P0001';
    end if;
  end if;
end $$;

create or replace function public.fn_ex_usuarios_da_obra(p_obra uuid)
returns table (usuario_id uuid, nome text, email text, na_lista boolean)
language plpgsql stable security definer set search_path to '' as $$
#variable_conflict use_column
begin
  perform public.fn_ex_exigir('execucao.cronogramas', 'ver', p_obra, 'Sem permissão para ver o acesso da obra');
  return query
  select u.id, u.nome, u.email, exists (select 1 from public.ex_obra_usuarios ou where ou.obra_id = p_obra and ou.usuario_id = u.id)
  from public.usuarios u where u.ativo and u.excluido_em is null
  order by 4 desc, u.nome;
end $$;

create or replace function public.fn_ex_local_salvar(p_obra uuid, p_dados jsonb, p_id uuid default null)
returns uuid language plpgsql security definer set search_path to '' as $$
declare
  v_id uuid; v_pai uuid := nullif(p_dados ->> 'pai_id', '')::uuid; v_tipo text := p_dados ->> 'tipo';
  v_codigo text := btrim(coalesce(p_dados ->> 'codigo', '')); v_nome text := btrim(coalesce(p_dados ->> 'nome', ''));
  v_kmi numeric := nullif(p_dados ->> 'km_inicial', '')::numeric; v_kmf numeric := nullif(p_dados ->> 'km_final', '')::numeric;
  v_tipo_obra text; v_x uuid; v_passos int := 0;
begin
  perform public.fn_ex_exigir('execucao.cronogramas', case when p_id is null then 'criar' else 'editar' end, p_obra,
    'Sem permissão para cadastrar local');
  select tipo_obra into v_tipo_obra from public.ex_obras where obra_id = p_obra;
  if v_tipo not in ('bloco', 'pavimento', 'ambiente', 'peca', 'segmento', 'outro') then raise exception 'Tipo de local inválido' using errcode = 'P0001'; end if;
  if v_codigo = '' or char_length(v_codigo) > 30 then raise exception 'Código do local: de 1 a 30 caracteres' using errcode = 'P0001'; end if;
  if v_nome = '' then raise exception 'Informe o nome do local' using errcode = 'P0001'; end if;
  if (v_kmi is null) <> (v_kmf is null) then raise exception 'Informe km inicial e km final juntos' using errcode = 'P0001'; end if;
  if v_tipo = 'segmento' and v_tipo_obra = 'rodovia' and v_kmi is null then
    raise exception 'Segmento de rodovia precisa de km inicial e km final' using errcode = 'P0001';
  end if;
  if v_pai is not null then
    if not exists (select 1 from public.ex_locais where id = v_pai and obra_id = p_obra and excluido_em is null) then
      raise exception 'Local pai não encontrado nesta obra' using errcode = 'P0001';
    end if;
    -- Sobe a partir do pai: se encontrar o próprio local, fecharia um ciclo.
    v_x := v_pai;
    while v_x is not null and v_passos < 100 loop
      if v_x = p_id then raise exception 'Um local não pode ficar dentro dele mesmo' using errcode = 'P0001'; end if;
      select pai_id into v_x from public.ex_locais where id = v_x;
      v_passos := v_passos + 1;
    end loop;
  end if;
  begin
    if p_id is null then
      insert into public.ex_locais (obra_id, pai_id, tipo, codigo, nome, ordem, km_inicial, km_final, lado, faixa)
      values (p_obra, v_pai, v_tipo, v_codigo, v_nome, coalesce(nullif(p_dados ->> 'ordem', '')::int, 0), v_kmi, v_kmf,
              nullif(p_dados ->> 'lado', ''), nullif(btrim(p_dados ->> 'faixa'), ''))
      returning id into v_id;
    else
      update public.ex_locais set pai_id = v_pai, tipo = v_tipo, codigo = v_codigo, nome = v_nome,
        ordem = coalesce(nullif(p_dados ->> 'ordem', '')::int, ordem), km_inicial = v_kmi, km_final = v_kmf,
        lado = nullif(p_dados ->> 'lado', ''), faixa = nullif(btrim(p_dados ->> 'faixa'), '')
      where id = p_id and obra_id = p_obra and excluido_em is null
      returning id into v_id;
      if v_id is null then raise exception 'Local não encontrado' using errcode = 'P0001'; end if;
    end if;
  exception when unique_violation then
    raise exception 'Já existe outro local com o código % nesta obra', v_codigo using errcode = 'P0001';
  end;
  return v_id;
end $$;

create or replace function public.fn_ex_local_excluir(p_id uuid, p_motivo text)
returns void language plpgsql security definer set search_path to '' as $$
declare v_obra uuid;
begin
  select obra_id into v_obra from public.ex_locais where id = p_id and excluido_em is null;
  if v_obra is null then raise exception 'Local não encontrado' using errcode = 'P0001'; end if;
  perform public.fn_ex_exigir('execucao.cronogramas', 'excluir', v_obra, 'Sem permissão para excluir local');
  if btrim(coalesce(p_motivo, '')) = '' then raise exception 'Informe o motivo da exclusão' using errcode = 'P0001'; end if;
  if exists (select 1 from public.ex_locais where pai_id = p_id and excluido_em is null) then
    raise exception 'Exclua ou mova antes os locais que estão dentro deste' using errcode = 'P0001';
  end if;
  if exists (select 1 from public.ex_atividade_locais al join public.ex_atividades a on a.id = al.atividade_id
             where al.local_id = p_id and a.excluido_em is null) then
    raise exception 'Há atividades neste local. Tire o local delas antes de excluir' using errcode = 'P0001';
  end if;
  update public.ex_locais set excluido_em = now(), excluido_por = (select auth.uid()), motivo_exclusao = btrim(p_motivo) where id = p_id;
end $$;

create or replace function public.fn_ex_servico_salvar(p_dados jsonb, p_id uuid default null)
returns uuid language plpgsql security definer set search_path to '' as $$
declare v_id uuid; v_codigo text := btrim(coalesce(p_dados ->> 'codigo', '')); v_nome text := btrim(coalesce(p_dados ->> 'nome', ''));
begin
  perform public.fn_ex_exigir('execucao.modelos', case when p_id is null then 'criar' else 'editar' end, null,
    'Sem permissão para cadastrar serviço');
  if v_codigo = '' or char_length(v_codigo) > 30 then raise exception 'Código do serviço: de 1 a 30 caracteres' using errcode = 'P0001'; end if;
  if char_length(v_nome) < 2 then raise exception 'Informe o nome do serviço' using errcode = 'P0001'; end if;
  begin
    if p_id is null then
      insert into public.ex_servicos (codigo, nome, unidade_id, produtividade_padrao, ceu_aberto, ativo, observacoes)
      values (v_codigo, v_nome, nullif(p_dados ->> 'unidade_id', '')::uuid, nullif(p_dados ->> 'produtividade_padrao', '')::numeric,
              coalesce((p_dados ->> 'ceu_aberto')::boolean, false), coalesce((p_dados ->> 'ativo')::boolean, true),
              nullif(btrim(p_dados ->> 'observacoes'), ''))
      returning id into v_id;
    else
      update public.ex_servicos set codigo = v_codigo, nome = v_nome, unidade_id = nullif(p_dados ->> 'unidade_id', '')::uuid,
        produtividade_padrao = nullif(p_dados ->> 'produtividade_padrao', '')::numeric,
        ceu_aberto = coalesce((p_dados ->> 'ceu_aberto')::boolean, false), ativo = coalesce((p_dados ->> 'ativo')::boolean, true),
        observacoes = nullif(btrim(p_dados ->> 'observacoes'), '')
      where id = p_id returning id into v_id;
      if v_id is null then raise exception 'Serviço não encontrado' using errcode = 'P0001'; end if;
    end if;
  exception when unique_violation then
    raise exception 'Já existe um serviço com o código %', v_codigo using errcode = 'P0001';
  end;
  return v_id;
end $$;

create or replace function public.fn_ex_calendario_salvar(p_dados jsonb, p_id uuid default null)
returns uuid language plpgsql security definer set search_path to '' as $$
declare v_id uuid; v_modelo boolean; v_padrao boolean := coalesce((p_dados ->> 'padrao_empresa')::boolean, false);
  -- Sem a chave, vale nacional + AC; com a chave (mesmo vazia), vale o que veio.
  v_abr text[] := case when p_dados ? 'feriados_abrangencia'
                       then array(select jsonb_array_elements_text(p_dados -> 'feriados_abrangencia'))
                       else array['nacional', 'AC'] end;
begin
  if p_id is null then
    perform public.fn_ex_exigir('execucao.modelos', 'criar', null, 'Sem permissão para criar calendário');
    v_modelo := true;
  else
    perform public.fn_ex_exigir_calendario(p_id, 'Sem permissão para editar este calendário');
    select modelo into v_modelo from public.ex_calendarios where id = p_id;
  end if;
  if v_padrao and not v_modelo then raise exception 'Só um calendário modelo pode ser o padrão da empresa' using errcode = 'P0001'; end if;
  if v_padrao then
    update public.ex_calendarios set padrao_empresa = false where padrao_empresa and id is distinct from p_id;
  end if;
  begin
    if p_id is null then
      insert into public.ex_calendarios (nome, modelo, padrao_empresa, horas_seg, horas_ter, horas_qua, horas_qui, horas_sex,
        horas_sab, horas_dom, feriados_abrangencia, municipio, chuvoso_inicio_mes, chuvoso_fim_mes, observacoes)
      values (btrim(p_dados ->> 'nome'), true, v_padrao,
        coalesce((p_dados ->> 'horas_seg')::numeric, 0), coalesce((p_dados ->> 'horas_ter')::numeric, 0),
        coalesce((p_dados ->> 'horas_qua')::numeric, 0), coalesce((p_dados ->> 'horas_qui')::numeric, 0),
        coalesce((p_dados ->> 'horas_sex')::numeric, 0), coalesce((p_dados ->> 'horas_sab')::numeric, 0),
        coalesce((p_dados ->> 'horas_dom')::numeric, 0), v_abr, nullif(btrim(p_dados ->> 'municipio'), ''),
        nullif(p_dados ->> 'chuvoso_inicio_mes', '')::smallint, nullif(p_dados ->> 'chuvoso_fim_mes', '')::smallint,
        nullif(btrim(p_dados ->> 'observacoes'), ''))
      returning id into v_id;
    else
      update public.ex_calendarios set nome = btrim(p_dados ->> 'nome'), padrao_empresa = v_padrao,
        horas_seg = coalesce((p_dados ->> 'horas_seg')::numeric, 0), horas_ter = coalesce((p_dados ->> 'horas_ter')::numeric, 0),
        horas_qua = coalesce((p_dados ->> 'horas_qua')::numeric, 0), horas_qui = coalesce((p_dados ->> 'horas_qui')::numeric, 0),
        horas_sex = coalesce((p_dados ->> 'horas_sex')::numeric, 0), horas_sab = coalesce((p_dados ->> 'horas_sab')::numeric, 0),
        horas_dom = coalesce((p_dados ->> 'horas_dom')::numeric, 0), feriados_abrangencia = v_abr,
        municipio = nullif(btrim(p_dados ->> 'municipio'), ''),
        chuvoso_inicio_mes = nullif(p_dados ->> 'chuvoso_inicio_mes', '')::smallint,
        chuvoso_fim_mes = nullif(p_dados ->> 'chuvoso_fim_mes', '')::smallint,
        observacoes = nullif(btrim(p_dados ->> 'observacoes'), '')
      where id = p_id returning id into v_id;
      perform public.fn_ex_recalcular_calendario(v_id);
    end if;
  exception when check_violation then
    raise exception 'Calendário inválido: confira o nome (2 a 120 letras), as horas (0 a 24, ao menos um dia com horas) e o período chuvoso (início e fim juntos)'
      using errcode = 'P0001';
  end;
  return v_id;
end $$;

create or replace function public.fn_ex_calendario_excecao_salvar(p_cal uuid, p_data date, p_horas numeric, p_tipo text, p_descricao text)
returns void language plpgsql security definer set search_path to '' as $$
begin
  perform public.fn_ex_exigir_calendario(p_cal, 'Sem permissão para editar este calendário');
  if p_data is null or p_horas is null or p_horas not between 0 and 24 then raise exception 'Informe a data e as horas (0 a 24)' using errcode = 'P0001'; end if;
  if p_tipo not in ('feriado', 'paralisacao', 'extra') then raise exception 'Tipo de exceção inválido' using errcode = 'P0001'; end if;
  if btrim(coalesce(p_descricao, '')) = '' then raise exception 'Descreva a exceção' using errcode = 'P0001'; end if;
  insert into public.ex_calendario_excecoes (calendario_id, data, horas, tipo, descricao)
  values (p_cal, p_data, p_horas, p_tipo, btrim(p_descricao))
  on conflict (calendario_id, data) do update set horas = excluded.horas, tipo = excluded.tipo, descricao = excluded.descricao;
  perform public.fn_ex_recalcular_calendario(p_cal);
end $$;

create or replace function public.fn_ex_recalcular_todos()
returns void language plpgsql security definer set search_path to '' as $$
declare v_c uuid;
begin
  for v_c in select id from public.ex_cronogramas where excluido_em is null loop
    perform public.fn_ex_cpm_recalcular(v_c);
  end loop;
end $$;

create or replace function public.fn_ex_feriado_salvar(p_dados jsonb, p_id uuid default null)
returns uuid language plpgsql security definer set search_path to '' as $$
declare v_id uuid; v_data date := nullif(p_dados ->> 'data', '')::date; v_nome text := btrim(coalesce(p_dados ->> 'nome', ''));
  v_abr text := p_dados ->> 'abrangencia'; v_mun text := nullif(btrim(p_dados ->> 'municipio'), '');
begin
  perform public.fn_ex_exigir('execucao.modelos', case when p_id is null then 'criar' else 'editar' end, null,
    'Sem permissão para cadastrar feriado');
  if v_data is null then raise exception 'Informe a data do feriado' using errcode = 'P0001'; end if;
  if v_nome = '' then raise exception 'Informe o nome do feriado' using errcode = 'P0001'; end if;
  if v_abr not in ('nacional', 'AC', 'municipal') then raise exception 'Abrangência deve ser nacional, AC ou municipal' using errcode = 'P0001'; end if;
  if (v_abr = 'municipal') <> (v_mun is not null) then
    raise exception 'Feriado municipal precisa do município; nacional e estadual não têm município' using errcode = 'P0001';
  end if;
  begin
    if p_id is null then
      insert into public.ex_feriados (data, nome, abrangencia, municipio) values (v_data, v_nome, v_abr, v_mun) returning id into v_id;
    else
      update public.ex_feriados set data = v_data, nome = v_nome, abrangencia = v_abr, municipio = v_mun where id = p_id returning id into v_id;
      if v_id is null then raise exception 'Feriado não encontrado' using errcode = 'P0001'; end if;
    end if;
  exception when unique_violation then
    raise exception 'Já existe feriado com essa abrangência em %', to_char(v_data, 'DD/MM/YYYY') using errcode = 'P0001';
  end;
  perform public.fn_ex_recalcular_todos();
  return v_id;
end $$;

create or replace function public.fn_ex_feriado_excluir(p_id uuid)
returns void language plpgsql security definer set search_path to '' as $$
begin
  perform public.fn_ex_exigir('execucao.modelos', 'excluir', null, 'Sem permissão para excluir feriado');
  delete from public.ex_feriados where id = p_id;
  if not found then raise exception 'Feriado não encontrado' using errcode = 'P0001'; end if;
  perform public.fn_ex_recalcular_todos();
end $$;

create or replace function public.fn_ex_calendario_excecao_excluir(p_cal uuid, p_data date)
returns void language plpgsql security definer set search_path to '' as $$
begin
  perform public.fn_ex_exigir_calendario(p_cal, 'Sem permissão para editar este calendário');
  delete from public.ex_calendario_excecoes where calendario_id = p_cal and data = p_data;
  perform public.fn_ex_recalcular_calendario(p_cal);
end $$;

do $fn$
declare f text;
begin
  foreach f in array array[
    'fn_ex_obras_disponiveis()', 'fn_ex_obra_nome(uuid)', 'fn_ex_cronograma_salvar(jsonb, uuid)',
    'fn_ex_cronograma_status(uuid, text)', 'fn_ex_cronograma_excluir(uuid, text)', 'fn_ex_cronograma_recalcular(uuid)',
    'fn_ex_obra_configurar(uuid, jsonb)', 'fn_ex_acesso_definir(uuid, uuid, boolean)', 'fn_ex_usuarios_da_obra(uuid)',
    'fn_ex_local_salvar(uuid, jsonb, uuid)', 'fn_ex_local_excluir(uuid, text)', 'fn_ex_servico_salvar(jsonb, uuid)',
    'fn_ex_calendario_salvar(jsonb, uuid)', 'fn_ex_calendario_excecao_salvar(uuid, date, numeric, text, text)',
    'fn_ex_calendario_excecao_excluir(uuid, date)', 'fn_ex_feriado_salvar(jsonb, uuid)', 'fn_ex_feriado_excluir(uuid)'] loop
    execute format('revoke all on function public.%s from public, anon', f);
    execute format('grant execute on function public.%s to authenticated', f);
  end loop;
  foreach f in array array['fn_ex_recalcular_calendario(uuid)', 'fn_ex_exigir_calendario(uuid, text)', 'fn_ex_recalcular_todos()'] loop
    execute format('revoke all on function public.%s from public, anon, authenticated', f);
  end loop;
end $fn$;
```

- [ ] **Step 3: Aplicar, renomear se preciso, rodar a prova**

Esperado: os valores do Step 1. Se `3a` mostrar lista ≠ admins, confira se o Tiago está no perfil Admin (Task 0, Step 2).

- [ ] **Step 4: Mutação manual**

Dentro de `begin; ... rollback;`, recrie `fn_ex_acesso_definir` sem o bloco "não pode ficar sem ninguém" e rode a prova: `3f` tem de virar `PASSOU (errado)`. Recrie `fn_ex_cronograma_salvar` sem o `elsif not public.fn_ex_acessa_obra(...)`: `3i` tem de virar `PASSOU (errado)`.

- [ ] **Step 5: Advisors e commit**

```bash
git add supabase/migrations/*_ex_fase1a_rpcs_obra.sql supabase/provas/ex_fase1a_banco.sql
git commit -m "Execução F1a: RPCs de obra, cronograma, acesso, locais, serviços e calendário"
```

---

### Task 5: RPCs de atividades (lote, exclusão, renumeração)

**Files:**
- Create: `supabase/migrations/20261012140000_ex_fase1a_rpcs_atividades.sql`
- Modify: `supabase/provas/ex_fase1a_banco.sql` (caso 5)

**Interfaces:**
- Consumes: `fn_ex_exigir` (Task 1), `fn_ex_cpm_recalcular` (Task 3), cronograma e lista da obra (Task 4).
- Produces:
  - `fn_ex_atividades_salvar_lote(p_cronograma uuid, p_linhas jsonb) returns jsonb` → `{"ids": {"<codigo>": "<id>", ...}}` só das linhas enviadas, com o código final. Cada linha é um objeto:
    - `id` (vazio = nova), `versao` (o `updated_at` lido; se vier e não bater, recusa).
    - `codigo` (obrigatório na nova), `nome` (obrigatório na nova), `tipo` (`resumo | atividade | marco`, padrão `atividade`), `ordem` (padrão: depois da última).
    - `pai_codigo` (vazio = raiz; ausente = mantém), `servico_id`, `quantidade`, `unidade_id`, `produtividade`, `modo_duracao` (`por_produtividade | digitada`), `duracao_dias` (padrão 1), `peso_manual`, `valor_orcado`, `restricao_data`, `restricao_data_em`, `responsavel_id`, `observacao`.
    - `locais`: array de ids de `ex_locais` (presente = substitui; ausente = mantém).
    - `predecessoras`: array de `{"codigo": "1.2", "tipo": "TI", "atraso": 2}` (presente = substitui; ausente = mantém).
    - **Linha existente: campo ausente fica como está.** Linha nova: campo ausente vale o padrão.
    - Tudo ou nada: qualquer erro recusa o lote inteiro com a mensagem "Linha <código>: ...".
  - `fn_ex_atividades_excluir(p_cronograma uuid, p_ids uuid[], p_motivo text) returns integer` (quantas linhas saíram, contando as filhas).
  - `fn_ex_eap_renumerar(p_cronograma uuid) returns integer` (códigos 1, 1.1, 1.1.1 pela ordem da árvore).

**Regras do lote (no banco, uma vez só):**
- Duração `por_produtividade` = `max(1, teto(quantidade / produtividade))`; resumo e marco = 0; `digitada` sem valor = 1.
- Resumo e marco não têm serviço, quantidade nem produtividade: trocar o tipo para resumo ou marco limpa esses campos, a menos que a linha mande valor para eles (aí recusa).
- Quem tem filhas precisa ser resumo. Resumo não tem vínculo. Hierarquia e vínculos sem ciclo.
- Criar linha exige `execucao.cronogramas/criar`; mudar linha existente exige `editar`; as duas exigem a lista da obra.

- [ ] **Step 1: Escrever o caso 5 da prova (falha)**

Declare no topo do `$prova$`: `v_ids jsonb; v_11 uuid; v_12 uuid; v_r1 uuid;`. Depois do caso 3, antes do caso 4:

```sql
  -- 5. Lote de atividades no cronograma FUND da obra 2 (calendário Padrão EMT: sáb 5 h conta, dom não).
  --    Dias úteis desde 02/03/2026: 0=02, 1=03, 2=04, 3=05, 4=06, 5=07 (sáb), 6=09, 7=10, 8=11, 9=12, 10=13.
  perform set_config('request.jwt.claims', json_build_object('sub', v_tiago, 'role', 'authenticated')::text, true);
  set local role authenticated;
  -- 5a. 1.1 por produtividade 100 / 30 = 4 dias (02/03 a 05/03); 1.2 com 5 dias, 1.1 TI+2: 09/03 a 13/03.
  v_ids := public.fn_ex_atividades_salvar_lote(v_cron, jsonb_build_array(
    jsonb_build_object('codigo', '1', 'nome', 'Fundação', 'tipo', 'resumo'),
    jsonb_build_object('codigo', '1.1', 'nome', 'Estacas', 'pai_codigo', '1', 'modo_duracao', 'por_produtividade',
                       'quantidade', 100, 'produtividade', 30),
    jsonb_build_object('codigo', '1.2', 'nome', 'Blocos', 'pai_codigo', '1', 'duracao_dias', 5,
                       'predecessoras', jsonb_build_array(jsonb_build_object('codigo', '1.1', 'tipo', 'TI', 'atraso', 2)))));
  v_r1 := (v_ids -> 'ids' ->> '1')::uuid; v_11 := (v_ids -> 'ids' ->> '1.1')::uuid; v_12 := (v_ids -> 'ids' ->> '1.2')::uuid;
  r := r || jsonb_build_object('5a_lote', (select jsonb_object_agg(a.codigo, jsonb_build_array(d.inicio_cedo, d.fim_cedo, a.duracao_dias))
    from public.ex_atividades a join public.ex_atividade_datas d on d.atividade_id = a.id where a.cronograma_id = v_cron));

  -- 5b. Ciclo: 1.1 passa a depender de 1.2. Recusa e nada muda (continua 1 vínculo).
  begin perform public.fn_ex_atividades_salvar_lote(v_cron, jsonb_build_array(jsonb_build_object('id', v_11,
      'predecessoras', jsonb_build_array(jsonb_build_object('codigo', '1.2')))));
    v_txt := 'PASSOU (errado)'; exception when others then v_txt := 'recusou: ' || sqlerrm; end;
  r := r || jsonb_build_object('5b_ciclo', v_txt, '5b_vinculos', (select count(*) from public.ex_dependencias where cronograma_id = v_cron));

  -- 5c. Código repetido no mesmo lote.
  begin perform public.fn_ex_atividades_salvar_lote(v_cron, jsonb_build_array(
      jsonb_build_object('codigo', 'X', 'nome', 'Um'), jsonb_build_object('codigo', 'X', 'nome', 'Dois')));
    v_txt := 'PASSOU (errado)'; exception when others then v_txt := 'recusou: ' || sqlerrm; end;
  r := r || jsonb_build_object('5c_codigo_repetido', v_txt);

  -- 5d. Linha com filhas deixando de ser resumo.
  begin perform public.fn_ex_atividades_salvar_lote(v_cron, jsonb_build_array(jsonb_build_object('id', v_r1, 'tipo', 'atividade')));
    v_txt := 'PASSOU (errado)'; exception when others then v_txt := 'recusou: ' || sqlerrm; end;
  r := r || jsonb_build_object('5d_filhas_sem_resumo', v_txt);

  -- 5e. Linha só com código e nome: duração 1.
  perform public.fn_ex_atividades_salvar_lote(v_cron, jsonb_build_array(jsonb_build_object('codigo', '2', 'nome', 'Limpeza')));
  r := r || jsonb_build_object('5e_duracao_padrao', (select duracao_dias from public.ex_atividades where cronograma_id = v_cron and codigo = '2' and excluido_em is null));

  -- 5f. Versão desatualizada (outra aba gravou antes).
  begin perform public.fn_ex_atividades_salvar_lote(v_cron, jsonb_build_array(jsonb_build_object('id', v_12,
      'versao', '2000-01-01T00:00:00Z', 'nome', 'Outro nome')));
    v_txt := 'PASSOU (errado)'; exception when others then v_txt := 'recusou: ' || sqlerrm; end;
  r := r || jsonb_build_object('5f_versao', v_txt);

  -- 5g. Mudança parcial: só o nome. Duração, pai e vínculo ficam.
  perform public.fn_ex_atividades_salvar_lote(v_cron, jsonb_build_array(jsonb_build_object('id', v_12, 'nome', 'Blocos de coroamento')));
  r := r || jsonb_build_object('5g_parcial', (select jsonb_build_object('nome', a.nome, 'duracao', a.duracao_dias, 'pai', p.codigo,
      'vinculos', (select count(*) from public.ex_dependencias where sucessora_id = a.id))
    from public.ex_atividades a join public.ex_atividades p on p.id = a.pai_id where a.id = v_12));

  -- 5h. Excluir o resumo leva as filhas e os vínculos; o cache fica só com a linha 2.
  r := r || jsonb_build_object('5h_excluidas', public.fn_ex_atividades_excluir(v_cron, array[v_r1], 'Prova'),
    '5h_vivas', (select jsonb_agg(codigo order by codigo) from public.ex_atividades where cronograma_id = v_cron and excluido_em is null),
    '5h_datas', (select count(*) from public.ex_atividade_datas where cronograma_id = v_cron),
    '5h_vinculos', (select count(*) from public.ex_dependencias where cronograma_id = v_cron));

  -- 5i. Linha nova "X" com ordem 0 e renumerar: X vira 1, Limpeza continua 2.
  perform public.fn_ex_atividades_salvar_lote(v_cron, jsonb_build_array(jsonb_build_object('codigo', 'X', 'nome', 'Nova', 'ordem', 0)));
  perform public.fn_ex_eap_renumerar(v_cron);
  r := r || jsonb_build_object('5i_renumerar', (select jsonb_agg(jsonb_build_array(codigo, nome) order by ordem)
    from public.ex_atividades where cronograma_id = v_cron and excluido_em is null));
  reset role;

  -- 5j. Zero sem permissão nenhuma.
  perform set_config('request.jwt.claims', json_build_object('sub', v_zero, 'role', 'authenticated')::text, true);
  set local role authenticated;
  begin perform public.fn_ex_atividades_salvar_lote(v_cron, jsonb_build_array(jsonb_build_object('codigo', 'Z', 'nome', 'Z')));
    v_txt := 'PASSOU (errado)'; exception when others then v_txt := 'recusou: ' || sqlerrm; end;
  r := r || jsonb_build_object('5j_sem_permissao', v_txt);
  reset role;
```

Esperado depois da migration:
- `5a_lote`: `{"1": ["2026-03-02","2026-03-13",0], "1.1": ["2026-03-02","2026-03-05",4], "1.2": ["2026-03-09","2026-03-13",5]}`
- `5b_ciclo`: `"recusou: Dependência em ciclo: as linhas 1.1, 1.2 não têm ordem possível"`, `5b_vinculos`: 1
- `5c_codigo_repetido`: `"recusou: Código X repetido nas linhas enviadas"`
- `5d_filhas_sem_resumo`: `"recusou: A linha 1 tem linhas dentro dela e precisa ser do tipo resumo"`
- `5e_duracao_padrao`: 1
- `5f_versao`: `"recusou: Linha 1.2: esta linha foi alterada por outra pessoa. Recarregue a grade"`
- `5g_parcial`: `{"nome": "Blocos de coroamento", "duracao": 5, "pai": "1", "vinculos": 1}`
- `5h_excluidas`: 3, `5h_vivas`: `["2"]`, `5h_datas`: 1, `5h_vinculos`: 0
- `5i_renumerar`: `[["1","Nova"],["2","Limpeza"]]`
- `5j_sem_permissao`: `"recusou: Sem permissão para criar atividade"`

- [ ] **Step 2: Escrever a migration**

`supabase/migrations/20261012140000_ex_fase1a_rpcs_atividades.sql`:

```sql
-- Execução de Obras, Fase 1a: RPCs de atividades. O lote é o caminho único de escrita da grade, da
-- importação (F1b) e de um agente. Tudo ou nada; recalcula o CPM no fim, na mesma transação.

create or replace function public.fn_ex_atividades_salvar_lote(p_cronograma uuid, p_linhas jsonb)
returns jsonb language plpgsql security definer set search_path to '' as $$
declare
  v_obra uuid; v_n int; i int; l jsonb; v_atual public.ex_atividades%rowtype; v_nova boolean; v_id uuid;
  v_ids uuid[] := '{}'; v_cods text[] := '{}'; v_rot text; v_max_ordem int;
  v_codigo text; v_tipo text; v_nome text; v_ordem int; v_servico uuid; v_qtd numeric; v_unid uuid; v_prod numeric;
  v_modo text; v_dur int; v_peso numeric; v_valor numeric; v_restr text; v_restr_em date; v_resp uuid; v_obs text;
  v_pai uuid; v_p jsonb; v_pred uuid; v_ptipo text; v_patraso int; v_local text; v_x text; v_ret jsonb;
begin
  select obra_id into v_obra from public.ex_cronogramas where id = p_cronograma and excluido_em is null;
  if v_obra is null then raise exception 'Cronograma não encontrado' using errcode = 'P0001'; end if;
  if jsonb_typeof(p_linhas) is distinct from 'array' or jsonb_array_length(p_linhas) = 0 then
    raise exception 'Nenhuma linha para gravar' using errcode = 'P0001';
  end if;
  v_n := jsonb_array_length(p_linhas);
  if v_n > 3000 then raise exception 'No máximo 3.000 linhas por vez' using errcode = 'P0001'; end if;
  if exists (select 1 from jsonb_array_elements(p_linhas) e where coalesce(e ->> 'id', '') = '') then
    perform public.fn_ex_exigir('execucao.cronogramas', 'criar', v_obra, 'Sem permissão para criar atividade');
  end if;
  if exists (select 1 from jsonb_array_elements(p_linhas) e where coalesce(e ->> 'id', '') <> '') then
    perform public.fn_ex_exigir('execucao.cronogramas', 'editar', v_obra, 'Sem permissão para editar atividade');
  end if;
  perform pg_advisory_xact_lock(hashtextextended('ex_cronograma:' || p_cronograma::text, 0));
  select coalesce(max(ordem), 0) into v_max_ordem from public.ex_atividades where cronograma_id = p_cronograma and excluido_em is null;

  -- Passo 1: grava cada linha com código provisório ('#' || id), sem pai e sem vínculos.
  for i in 1 .. v_n loop
    l := p_linhas -> (i - 1);
    v_rot := coalesce(nullif(btrim(l ->> 'codigo'), ''), 'nº ' || i);
    v_nova := coalesce(l ->> 'id', '') = '';
    v_atual := null;
    if not v_nova then
      select * into v_atual from public.ex_atividades
      where id = (l ->> 'id')::uuid and cronograma_id = p_cronograma and excluido_em is null for update;
      if v_atual.id is null then raise exception 'Linha %: atividade não encontrada neste cronograma', v_rot using errcode = 'P0001'; end if;
      v_rot := coalesce(nullif(btrim(l ->> 'codigo'), ''), v_atual.codigo);
      if nullif(l ->> 'versao', '') is not null and v_atual.updated_at <> (l ->> 'versao')::timestamptz then
        raise exception 'Linha %: esta linha foi alterada por outra pessoa. Recarregue a grade', v_rot using errcode = 'P0001';
      end if;
    end if;

    v_codigo := case when l ? 'codigo' then btrim(l ->> 'codigo') else v_atual.codigo end;
    if coalesce(v_codigo, '') = '' or char_length(v_codigo) > 40 or left(v_codigo, 1) = '#' then
      raise exception 'Linha %: código de 1 a 40 caracteres, sem # no começo', v_rot using errcode = 'P0001';
    end if;
    if v_codigo = any (v_cods) then raise exception 'Código % repetido nas linhas enviadas', v_codigo using errcode = 'P0001'; end if;
    v_cods := v_cods || v_codigo;

    v_nome := case when l ? 'nome' then btrim(l ->> 'nome') else v_atual.nome end;
    if coalesce(v_nome, '') = '' then raise exception 'Linha %: informe o nome', v_rot using errcode = 'P0001'; end if;
    v_tipo := case when l ? 'tipo' then l ->> 'tipo' else coalesce(v_atual.tipo, 'atividade') end;
    if v_tipo not in ('resumo', 'atividade', 'marco') then raise exception 'Linha %: tipo deve ser resumo, atividade ou marco', v_rot using errcode = 'P0001'; end if;
    v_ordem := case when l ? 'ordem' then (l ->> 'ordem')::int else coalesce(v_atual.ordem, v_max_ordem + i) end;
    v_servico := case when l ? 'servico_id' then nullif(l ->> 'servico_id', '')::uuid else v_atual.servico_id end;
    v_qtd := case when l ? 'quantidade' then nullif(l ->> 'quantidade', '')::numeric else v_atual.quantidade end;
    v_unid := case when l ? 'unidade_id' then nullif(l ->> 'unidade_id', '')::uuid else v_atual.unidade_id end;
    v_prod := case when l ? 'produtividade' then nullif(l ->> 'produtividade', '')::numeric else v_atual.produtividade end;
    v_modo := case when l ? 'modo_duracao' then coalesce(nullif(l ->> 'modo_duracao', ''), 'digitada') else coalesce(v_atual.modo_duracao, 'digitada') end;
    v_peso := case when l ? 'peso_manual' then nullif(l ->> 'peso_manual', '')::numeric else v_atual.peso_manual end;
    v_valor := case when l ? 'valor_orcado' then nullif(l ->> 'valor_orcado', '')::numeric else v_atual.valor_orcado end;
    v_restr := case when l ? 'restricao_data' then coalesce(nullif(l ->> 'restricao_data', ''), 'nenhuma') else coalesce(v_atual.restricao_data, 'nenhuma') end;
    v_restr_em := case when l ? 'restricao_data_em' then nullif(l ->> 'restricao_data_em', '')::date else v_atual.restricao_data_em end;
    v_resp := case when l ? 'responsavel_id' then nullif(l ->> 'responsavel_id', '')::uuid else v_atual.responsavel_id end;
    v_obs := case when l ? 'observacao' then nullif(btrim(l ->> 'observacao'), '') else v_atual.observacao end;

    if v_tipo <> 'atividade' then
      if (l ? 'quantidade' and v_qtd is not null) or (l ? 'produtividade' and v_prod is not null) or (l ? 'servico_id' and v_servico is not null) then
        raise exception 'Linha %: resumo e marco não têm serviço, quantidade nem produtividade', v_rot using errcode = 'P0001';
      end if;
      v_qtd := null; v_prod := null; v_servico := null; v_modo := 'digitada'; v_dur := 0;
    elsif v_modo = 'por_produtividade' then
      if v_qtd is null or v_prod is null or v_prod <= 0 then
        raise exception 'Linha %: duração por produtividade precisa de quantidade e de produtividade maior que zero', v_rot using errcode = 'P0001';
      end if;
      v_dur := greatest(1, ceil(v_qtd / v_prod)::int);
    elsif v_modo = 'digitada' then
      v_dur := coalesce(case when l ? 'duracao_dias' then nullif(l ->> 'duracao_dias', '')::int else v_atual.duracao_dias end, 1);
      if v_dur < 0 then raise exception 'Linha %: duração não pode ser negativa', v_rot using errcode = 'P0001'; end if;
    else
      raise exception 'Linha %: modo de duração deve ser por_produtividade ou digitada', v_rot using errcode = 'P0001';
    end if;
    if v_restr not in ('nenhuma', 'inicio_nao_antes', 'fim_nao_depois') then
      raise exception 'Linha %: restrição de data inválida', v_rot using errcode = 'P0001';
    end if;
    if v_restr = 'nenhuma' then v_restr_em := null;
    elsif v_restr_em is null then raise exception 'Linha %: informe a data da restrição', v_rot using errcode = 'P0001';
    end if;

    begin
      if v_nova then
        v_id := gen_random_uuid();
        insert into public.ex_atividades (id, cronograma_id, obra_id, tipo, codigo, nome, ordem, servico_id, quantidade, unidade_id,
          produtividade, modo_duracao, duracao_dias, peso_manual, valor_orcado, restricao_data, restricao_data_em, responsavel_id, observacao)
        values (v_id, p_cronograma, v_obra, v_tipo, '#' || v_id::text, v_nome, v_ordem, v_servico, v_qtd, v_unid,
          v_prod, v_modo, v_dur, v_peso, v_valor, v_restr, v_restr_em, v_resp, v_obs);
      else
        v_id := v_atual.id;
        update public.ex_atividades set tipo = v_tipo, codigo = '#' || id::text, nome = v_nome, ordem = v_ordem, servico_id = v_servico,
          quantidade = v_qtd, unidade_id = v_unid, produtividade = v_prod, modo_duracao = v_modo, duracao_dias = v_dur,
          peso_manual = v_peso, valor_orcado = v_valor, restricao_data = v_restr, restricao_data_em = v_restr_em,
          responsavel_id = v_resp, observacao = v_obs
        where id = v_id;
      end if;
    exception
      when foreign_key_violation then
        raise exception 'Linha %: serviço, unidade ou responsável não encontrado', v_rot using errcode = 'P0001';
      when check_violation then
        raise exception 'Linha %: dado fora do permitido. Confira nome (até 300 letras), números (não negativos) e datas', v_rot using errcode = 'P0001';
    end;
    v_ids := v_ids || v_id;
  end loop;

  -- Passo 2: códigos finais. Colisão aqui é com linha que não veio no lote.
  for i in 1 .. v_n loop
    begin
      update public.ex_atividades set codigo = v_cods[i] where id = v_ids[i];
    exception when unique_violation then
      raise exception 'Já existe outra linha com o código % neste cronograma', v_cods[i] using errcode = 'P0001';
    end;
  end loop;

  -- Passo 3: pai, locais e predecessoras, já com os códigos finais.
  for i in 1 .. v_n loop
    l := p_linhas -> (i - 1);
    if l ? 'pai_codigo' then
      v_pai := null;
      if nullif(btrim(l ->> 'pai_codigo'), '') is not null then
        select id into v_pai from public.ex_atividades
        where cronograma_id = p_cronograma and excluido_em is null and codigo = btrim(l ->> 'pai_codigo');
        if v_pai is null then raise exception 'Linha %: a linha pai % não existe', v_cods[i], btrim(l ->> 'pai_codigo') using errcode = 'P0001'; end if;
        if v_pai = v_ids[i] then raise exception 'Linha %: não pode estar dentro dela mesma', v_cods[i] using errcode = 'P0001'; end if;
      end if;
      update public.ex_atividades set pai_id = v_pai where id = v_ids[i];
    end if;

    if l ? 'locais' then
      delete from public.ex_atividade_locais where atividade_id = v_ids[i];
      for v_local in select jsonb_array_elements_text(coalesce(l -> 'locais', '[]'::jsonb)) loop
        if not exists (select 1 from public.ex_locais where id = v_local::uuid and obra_id = v_obra and excluido_em is null) then
          raise exception 'Linha %: local não encontrado nesta obra', v_cods[i] using errcode = 'P0001';
        end if;
        insert into public.ex_atividade_locais (atividade_id, local_id, obra_id) values (v_ids[i], v_local::uuid, v_obra)
        on conflict do nothing;
      end loop;
    end if;

    if l ? 'predecessoras' then
      delete from public.ex_dependencias where sucessora_id = v_ids[i];
      for v_p in select * from jsonb_array_elements(coalesce(l -> 'predecessoras', '[]'::jsonb)) loop
        select id into v_pred from public.ex_atividades
        where cronograma_id = p_cronograma and excluido_em is null and codigo = btrim(v_p ->> 'codigo');
        if v_pred is null then raise exception 'Linha %: a predecessora % não existe', v_cods[i], v_p ->> 'codigo' using errcode = 'P0001'; end if;
        if v_pred = v_ids[i] then raise exception 'Linha %: não pode depender dela mesma', v_cods[i] using errcode = 'P0001'; end if;
        v_ptipo := upper(coalesce(nullif(v_p ->> 'tipo', ''), 'TI'));
        if v_ptipo not in ('TI', 'II', 'TT', 'IT') then raise exception 'Linha %: tipo de vínculo deve ser TI, II, TT ou IT', v_cods[i] using errcode = 'P0001'; end if;
        v_patraso := coalesce(nullif(v_p ->> 'atraso', '')::int, 0);
        if v_patraso not between -999 and 999 then raise exception 'Linha %: atraso entre -999 e 999 dias', v_cods[i] using errcode = 'P0001'; end if;
        begin
          insert into public.ex_dependencias (cronograma_id, obra_id, predecessora_id, sucessora_id, tipo, atraso_dias)
          values (p_cronograma, v_obra, v_pred, v_ids[i], v_ptipo, v_patraso);
        exception when unique_violation then
          raise exception 'Linha %: predecessora % repetida', v_cods[i], v_p ->> 'codigo' using errcode = 'P0001';
        end;
      end loop;
    end if;
  end loop;

  -- Passo 4: regras do cronograma inteiro.
  select p.codigo into v_x from public.ex_atividades p
  where p.cronograma_id = p_cronograma and p.excluido_em is null and p.tipo <> 'resumo'
    and exists (select 1 from public.ex_atividades f where f.pai_id = p.id and f.excluido_em is null)
  order by p.ordem limit 1;
  if v_x is not null then raise exception 'A linha % tem linhas dentro dela e precisa ser do tipo resumo', v_x using errcode = 'P0001'; end if;

  select a.codigo into v_x from public.ex_dependencias d
  join public.ex_atividades a on a.id in (d.predecessora_id, d.sucessora_id)
  where d.cronograma_id = p_cronograma and a.tipo = 'resumo' limit 1;
  if v_x is not null then raise exception 'A linha % é resumo: resumo não tem predecessora nem sucessora', v_x using errcode = 'P0001'; end if;

  with recursive sobe(id, atual, n) as (
    select a.id, a.pai_id, 1 from public.ex_atividades a where a.id = any (v_ids) and a.pai_id is not null
    union all
    select s.id, p.pai_id, s.n + 1 from sobe s join public.ex_atividades p on p.id = s.atual
    where s.atual <> s.id and s.n < 200 and p.pai_id is not null)
  select a.codigo into v_x from sobe s join public.ex_atividades a on a.id = s.id where s.atual = s.id limit 1;
  if v_x is not null then raise exception 'Hierarquia em ciclo na linha %', v_x using errcode = 'P0001'; end if;

  -- Passo 5: CPM (recusa ciclo de vínculo dizendo as linhas) e retorno.
  perform public.fn_ex_cpm_recalcular(p_cronograma);
  select jsonb_object_agg(a.codigo, a.id) into v_ret from public.ex_atividades a where a.id = any (v_ids);
  return jsonb_build_object('ids', coalesce(v_ret, '{}'::jsonb));
end $$;

create or replace function public.fn_ex_atividades_excluir(p_cronograma uuid, p_ids uuid[], p_motivo text)
returns integer language plpgsql security definer set search_path to '' as $$
declare v_obra uuid; v_todas uuid[];
begin
  select obra_id into v_obra from public.ex_cronogramas where id = p_cronograma and excluido_em is null;
  if v_obra is null then raise exception 'Cronograma não encontrado' using errcode = 'P0001'; end if;
  perform public.fn_ex_exigir('execucao.cronogramas', 'excluir', v_obra, 'Sem permissão para excluir atividade');
  if btrim(coalesce(p_motivo, '')) = '' then raise exception 'Informe o motivo da exclusão' using errcode = 'P0001'; end if;
  perform pg_advisory_xact_lock(hashtextextended('ex_cronograma:' || p_cronograma::text, 0));
  with recursive d(id) as (
    select a.id from public.ex_atividades a where a.id = any (p_ids) and a.cronograma_id = p_cronograma and a.excluido_em is null
    union
    select f.id from public.ex_atividades f join d on f.pai_id = d.id where f.excluido_em is null)
  select array_agg(id) into v_todas from d;
  if v_todas is null then raise exception 'Nenhuma linha encontrada para excluir' using errcode = 'P0001'; end if;
  delete from public.ex_dependencias where predecessora_id = any (v_todas) or sucessora_id = any (v_todas);
  update public.ex_atividades set excluido_em = now(), excluido_por = (select auth.uid()), motivo_exclusao = btrim(p_motivo)
  where id = any (v_todas);
  perform public.fn_ex_cpm_recalcular(p_cronograma);
  return cardinality(v_todas);
end $$;

create or replace function public.fn_ex_eap_renumerar(p_cronograma uuid)
returns integer language plpgsql security definer set search_path to '' as $$
declare v_obra uuid; v_n int;
begin
  select obra_id into v_obra from public.ex_cronogramas where id = p_cronograma and excluido_em is null;
  if v_obra is null then raise exception 'Cronograma não encontrado' using errcode = 'P0001'; end if;
  perform public.fn_ex_exigir('execucao.cronogramas', 'editar', v_obra, 'Sem permissão para renumerar a EAP');
  perform pg_advisory_xact_lock(hashtextextended('ex_cronograma:' || p_cronograma::text, 0));
  -- Dois passos com a mesma árvore: primeiro um código provisório, depois o final (a troca não colide no índice único).
  with recursive irmas as (
    select a.id, a.pai_id, row_number() over (partition by a.pai_id order by a.ordem, a.id) as pos
    from public.ex_atividades a where a.cronograma_id = p_cronograma and a.excluido_em is null),
  arv(id, cod) as (
    select i.id, i.pos::text from irmas i where i.pai_id is null
    union all
    select i.id, arv.cod || '.' || i.pos from irmas i join arv on i.pai_id = arv.id)
  update public.ex_atividades a set codigo = '#' || a.id::text from arv where arv.id = a.id;
  with recursive irmas as (
    select a.id, a.pai_id, row_number() over (partition by a.pai_id order by a.ordem, a.id) as pos
    from public.ex_atividades a where a.cronograma_id = p_cronograma and a.excluido_em is null),
  arv(id, cod) as (
    select i.id, i.pos::text from irmas i where i.pai_id is null
    union all
    select i.id, arv.cod || '.' || i.pos from irmas i join arv on i.pai_id = arv.id)
  update public.ex_atividades a set codigo = arv.cod from arv where arv.id = a.id;
  get diagnostics v_n = row_count;
  return v_n;
end $$;

do $fn$
declare f text;
begin
  foreach f in array array['fn_ex_atividades_salvar_lote(uuid, jsonb)', 'fn_ex_atividades_excluir(uuid, uuid[], text)',
                           'fn_ex_eap_renumerar(uuid)'] loop
    execute format('revoke all on function public.%s from public, anon', f);
    execute format('grant execute on function public.%s to authenticated', f);
  end loop;
end $fn$;
```

Nota: o lote abre um subbloco com `exception` por linha (passos 1 e 2). Com 3.000 linhas isso são 6.000 subtransações; o caso 4g mede só o CPM. Se a importação da F1b ficar lenta, o primeiro ajuste é validar antes e gravar em comando único.

- [ ] **Step 3: Aplicar, renomear se preciso, rodar a prova**

Esperado: os valores do Step 1 e todos os casos anteriores iguais.

- [ ] **Step 4: Mutação manual**

Dentro de `begin; ... rollback;`, uma de cada vez: (1) tirar o `ceil` (duração vira `(v_qtd / v_prod)::int`, que arredonda 3,33 para 3): `5a` tem de mudar; (2) tirar o bloco "Passo 4" da regra de filhas: `5d` tem de virar `PASSOU (errado)`; (3) no `update` do passo 1, trocar `codigo = '#' || id::text` por `codigo = v_codigo`: um lote que troca os códigos de 1.1 e 1.2 entre si (`[{id: v_11, codigo: '1.2'}, {id: v_12, codigo: '1.1'}]`) tem de falhar com unique violation. Anote no commit.

- [ ] **Step 5: Advisors e commit**

```bash
git add supabase/migrations/*_ex_fase1a_rpcs_atividades.sql supabase/provas/ex_fase1a_banco.sql
git commit -m "Execução F1a: lote de atividades, exclusão em cascata e renumeração da EAP"
```

---

### Task 6: Views de leitura, unidades visíveis e comentários para agentes

**Files:**
- Create: `supabase/migrations/20261012150000_ex_fase1a_views.sql`
- Modify: `supabase/provas/ex_fase1a_banco.sql` (caso 6)

**Interfaces:**
- Consumes: tudo das Tasks 1 a 5; `fn_ex_obra_nome` (Task 4).
- Produces (todas `security_invoker = true`, então a RLS da lista da obra vale):
  - `ex_v_pastas`: `obra_id, obra_nome, tipo_obra, n_cronogramas, n_ativos, n_rascunhos, inicio_previsto, termino_previsto`. Só obras com pelo menos um cronograma não excluído (D15: a pasta é derivada).
  - `ex_v_cronogramas`: `id, obra_id, obra_nome, codigo, nome, status, criterio_peso, data_inicio, data_corte, calendario_id, calculado_em, observacoes, versao, n_atividades, n_criticas, inicio_previsto, termino_previsto`.
  - `ex_v_atividades`: `id, cronograma_id, obra_id, pai_id, pai_codigo, tipo, codigo, nome, ordem, servico_id, servico_codigo, servico_nome, quantidade, unidade_id, unidade_sigla, produtividade, modo_duracao, duracao_dias, peso_manual, valor_orcado, restricao_data, restricao_data_em, responsavel_id, observacao, inicio_real, fim_real, inicio_cedo, fim_cedo, inicio_tarde, fim_tarde, folga_total, folga_livre, critica, predecessoras (jsonb [{codigo,tipo,atraso}]), locais (jsonb [{id,codigo,nome}]), versao`.
  - Policy `unidades_medida_select` passa a aceitar também `fn_ve_execucao()` (mesmo padrão da Manutenção).

- [ ] **Step 1: Ler a policy viva de `unidades_medida`**

```sql
select polname, pg_get_expr(polqual, polrelid) from pg_policy where polrelid = 'public.unidades_medida'::regclass and polcmd = 'r';
```

Esperado: `unidades_medida_select` com `tem_permissao('cadastros.unidades','ver') OR fn_ve_manutencao()`. Se vier diferente (outro módulo já acrescentou algo), a migration do Step 3 recria a policy com **o que veio** mais `or (select public.fn_ve_execucao())`. Nunca a partir da cópia do repo (decisoes.md L1750).

- [ ] **Step 2: Escrever o caso 6 da prova (falha)**

Depois do caso 5, antes do caso 4:

```sql
  -- 6. Views. Esperado: 6a true; 6b 2 linhas com versão; 6c false; 6d true
  perform set_config('request.jwt.claims', json_build_object('sub', v_tiago, 'role', 'authenticated')::text, true);
  set local role authenticated;
  r := r || jsonb_build_object('6a_pasta_existe', exists (select 1 from public.ex_v_pastas where obra_id = v_obra2 and n_cronogramas = 1));
  r := r || jsonb_build_object('6b_atividades', (select jsonb_build_object('linhas', count(*), 'com_versao', count(versao))
    from public.ex_v_atividades where cronograma_id = v_cron));
  perform public.fn_ex_cronograma_excluir(v_cron, 'Prova: a pasta some');
  r := r || jsonb_build_object('6c_pasta_some', exists (select 1 from public.ex_v_pastas where obra_id = v_obra2));
  reset role;
  insert into public.usuario_permissoes (usuario_id, recurso, acao) values (v_zero, 'execucao.cronogramas', 'ver');
  perform set_config('request.jwt.claims', json_build_object('sub', v_zero, 'role', 'authenticated')::text, true);
  set local role authenticated;
  r := r || jsonb_build_object('6d_unidades_visiveis', (select count(*) > 0 from public.unidades_medida));
  reset role;
  delete from public.usuario_permissoes where usuario_id = v_zero and recurso like 'execucao.%';
```

- [ ] **Step 3: Escrever a migration**

`supabase/migrations/20261012150000_ex_fase1a_views.sql`:

```sql
-- Execução de Obras, Fase 1a: views de leitura (tela e agentes) e unidades visíveis no módulo.

create or replace view public.ex_v_atividades with (security_invoker = true) as
select a.id, a.cronograma_id, a.obra_id, a.pai_id, p.codigo as pai_codigo, a.tipo, a.codigo, a.nome, a.ordem,
       a.servico_id, s.codigo as servico_codigo, s.nome as servico_nome, a.quantidade, a.unidade_id, u.sigla as unidade_sigla,
       a.produtividade, a.modo_duracao, a.duracao_dias, a.peso_manual, a.valor_orcado, a.restricao_data, a.restricao_data_em,
       a.responsavel_id, a.observacao, a.inicio_real, a.fim_real,
       d.inicio_cedo, d.fim_cedo, d.inicio_tarde, d.fim_tarde, d.folga_total, d.folga_livre, d.critica,
       coalesce((select jsonb_agg(jsonb_build_object('codigo', pa.codigo, 'tipo', dp.tipo, 'atraso', dp.atraso_dias) order by pa.ordem)
                 from public.ex_dependencias dp join public.ex_atividades pa on pa.id = dp.predecessora_id
                 where dp.sucessora_id = a.id), '[]'::jsonb) as predecessoras,
       coalesce((select jsonb_agg(jsonb_build_object('id', l.id, 'codigo', l.codigo, 'nome', l.nome) order by l.ordem, l.codigo)
                 from public.ex_atividade_locais al join public.ex_locais l on l.id = al.local_id
                 where al.atividade_id = a.id and l.excluido_em is null), '[]'::jsonb) as locais,
       a.updated_at as versao
from public.ex_atividades a
left join public.ex_atividades p on p.id = a.pai_id
left join public.ex_servicos s on s.id = a.servico_id
left join public.unidades_medida u on u.id = a.unidade_id
left join public.ex_atividade_datas d on d.atividade_id = a.id
where a.excluido_em is null;

create or replace view public.ex_v_cronogramas with (security_invoker = true) as
select k.id, k.obra_id, public.fn_ex_obra_nome(k.obra_id) as obra_nome, k.codigo, k.nome, k.status, k.criterio_peso,
       k.data_inicio, k.data_corte, k.calendario_id, k.calculado_em, k.observacoes, k.updated_at as versao,
       (select count(*) from public.ex_atividades a where a.cronograma_id = k.id and a.excluido_em is null and a.tipo <> 'resumo') as n_atividades,
       (select count(*) from public.ex_atividade_datas d join public.ex_atividades a on a.id = d.atividade_id
         where d.cronograma_id = k.id and d.critica and a.tipo <> 'resumo') as n_criticas,
       (select min(d.inicio_cedo) from public.ex_atividade_datas d where d.cronograma_id = k.id) as inicio_previsto,
       (select max(d.fim_cedo) from public.ex_atividade_datas d where d.cronograma_id = k.id) as termino_previsto
from public.ex_cronogramas k
where k.excluido_em is null;

create or replace view public.ex_v_pastas with (security_invoker = true) as
select e.obra_id, public.fn_ex_obra_nome(e.obra_id) as obra_nome, e.tipo_obra,
       count(k.id) as n_cronogramas,
       count(k.id) filter (where k.status = 'ativo') as n_ativos,
       count(k.id) filter (where k.status = 'rascunho') as n_rascunhos,
       min(d.inicio) filter (where k.status <> 'arquivado') as inicio_previsto,
       max(d.fim) filter (where k.status <> 'arquivado') as termino_previsto
from public.ex_obras e
join public.ex_cronogramas k on k.obra_id = e.obra_id and k.excluido_em is null
left join lateral (select min(x.inicio_cedo) as inicio, max(x.fim_cedo) as fim
                   from public.ex_atividade_datas x where x.cronograma_id = k.id) d on true
group by e.obra_id, e.tipo_obra;

revoke all on public.ex_v_atividades, public.ex_v_cronogramas, public.ex_v_pastas from anon, authenticated;
grant select on public.ex_v_atividades, public.ex_v_cronogramas, public.ex_v_pastas to authenticated;

-- Unidades: quem usa o módulo precisa ver a sigla (mesmo padrão da Manutenção). Expressão anterior lida
-- da definição viva no Step 1 da Task 6; se mudou, esta linha reflete o que estava lá.
drop policy if exists unidades_medida_select on public.unidades_medida;
create policy unidades_medida_select on public.unidades_medida for select to authenticated
  using ((select public.tem_permissao('cadastros.unidades', 'ver'))
      or (select public.fn_ve_manutencao())
      or (select public.fn_ve_execucao()));

-- Comentários: o agente lê o modelo pelo catálogo (D13).
comment on table public.ex_obras is 'Execução: configuração do módulo por obra (1:1 com obras). Nasce com o primeiro cronograma.';
comment on table public.ex_obra_usuarios is 'Execução: lista de acesso da obra. A linha é o acesso. Escrita só por fn_ex_acesso_definir.';
comment on table public.ex_cronogramas is 'Execução: cronogramas de uma obra. Escrita só por fn_ex_cronograma_salvar/status/excluir.';
comment on table public.ex_locais is 'Execução: locais da obra (bloco, pavimento, ambiente, peça, segmento de rodovia). Escrita por fn_ex_local_salvar/excluir.';
comment on table public.ex_servicos is 'Execução: biblioteca global de serviços. Escrita por fn_ex_servico_salvar.';
comment on table public.ex_atividades is 'Execução: EAP e atividades (tipo resumo, atividade, marco). Escrita SÓ por fn_ex_atividades_salvar_lote/excluir e fn_ex_eap_renumerar.';
comment on table public.ex_dependencias is 'Execução: vínculos TI (término-início), II, TT, IT, com atraso em dias úteis. Escrita pelo lote (chave predecessoras).';
comment on table public.ex_atividade_datas is 'Execução: cache do CPM. Gravado só por fn_ex_cpm_recalcular. Nunca calcule datas fora do banco.';
comment on table public.ex_calendarios is 'Execução: calendários. modelo=true são da empresa; cada cronograma tem o próprio, filho de um modelo.';
comment on table public.ex_calendario_excecoes is 'Execução: dias com horas diferentes (feriado local, paralisação, extra). Exceção do pai vale para o filho.';
comment on table public.ex_feriados is 'Execução: feriados nacionais, do Acre e municipais. Dia de feriado tem 0 horas se a abrangência está no calendário.';
comment on view public.ex_v_pastas is 'Execução: uma linha por obra com cronograma (a pasta). Use para "quais obras estão no módulo".';
comment on view public.ex_v_cronogramas is 'Execução: cronogramas com início e término previstos e número de atividades críticas.';
comment on view public.ex_v_atividades is 'Execução: atividades com datas do CPM, folgas, crítica, predecessoras e locais. Leitura padrão para grade e agentes.';
comment on function public.fn_ex_atividades_salvar_lote(uuid, jsonb) is 'Execução: grava várias atividades de uma vez, tudo ou nada. Ver docs/modulos/execucao-guia-para-agentes.md.';
comment on function public.fn_ex_dias_uteis(uuid, date, date) is 'Execução: dias úteis (horas > 0) de um calendário entre duas datas.';
comment on function public.fn_ex_somar_dias_uteis(uuid, date, integer) is 'Execução: soma n dias úteis a uma data (n = 0: próximo dia útil).';
```

- [ ] **Step 4: Aplicar, renomear se preciso, rodar a prova**

Esperado: `6a_pasta_existe: true`, `6b_atividades: {"linhas": 2, "com_versao": 2}`, `6c_pasta_some: false`, `6d_unidades_visiveis: true`.

- [ ] **Step 5: Advisors e commit**

Atenção ao advisor `security_definer_view`: as três views são `security_invoker`, então não podem aparecer. `fn_ex_obra_nome` é `security definer` e só devolve o nome se o usuário vê a obra.

```bash
git add supabase/migrations/*_ex_fase1a_views.sql supabase/provas/ex_fase1a_banco.sql
git commit -m "Execução F1a: views de pasta, cronograma e atividades, e comentários para agentes"
```

---

### Task 7: Permissões (backfill escrito agora, aplicado na Task 13)

**Files:**
- Create: `supabase/migrations/20261012160000_ex_fase1a_permissoes.sql`
- Modify: `supabase/provas/ex_fase1a_banco.sql` (caso 7)

**Interfaces:**
- Produces: perfil Admin e os 4 Admins ativos com `execucao.obras` (ver), `execucao.cronogramas` (ver, criar, editar, excluir), `execucao.modelos` (ver, criar, editar, excluir): 9 por usuário, 36 no total.

- [ ] **Step 1: Escrever o caso 7 da prova**

Logo depois do caso 1:

```sql
  -- 7. Backfill: lido antes de qualquer caso inserir permissões na transação. Até a Task 13 aplicar a
  --    migration, o esperado é {"admins": 0, "linhas": 0}; depois, {"admins": 4, "linhas": 36}.
  select jsonb_build_object('admins', count(distinct usuario_id), 'linhas', count(*)) into v_j
  from public.usuario_permissoes where recurso like 'execucao.%';
  r := r || jsonb_build_object('7_backfill', v_j);
```

- [ ] **Step 2: Escrever a migration (NÃO aplicar ainda)**

`supabase/migrations/20261012160000_ex_fase1a_permissoes.sql`:

```sql
-- Execução de Obras, Fase 1a: perfil Admin e os Admins ativos ganham as abas da fase.
-- As outras abas entram nas fases delas, com o backfill delas. Quem mais vê, o Tiago decide.

with acoes(recurso, acao) as (values
  ('execucao.obras', 'ver'),
  ('execucao.cronogramas', 'ver'), ('execucao.cronogramas', 'criar'), ('execucao.cronogramas', 'editar'), ('execucao.cronogramas', 'excluir'),
  ('execucao.modelos', 'ver'), ('execucao.modelos', 'criar'), ('execucao.modelos', 'editar'), ('execucao.modelos', 'excluir')
)
insert into public.perfil_permissoes (perfil_id, recurso, acao)
select p.id, a.recurso, a.acao from public.perfis p cross join acoes a where p.nome = 'Admin'
on conflict (perfil_id, recurso, acao) do nothing;

with acoes(recurso, acao) as (values
  ('execucao.obras', 'ver'),
  ('execucao.cronogramas', 'ver'), ('execucao.cronogramas', 'criar'), ('execucao.cronogramas', 'editar'), ('execucao.cronogramas', 'excluir'),
  ('execucao.modelos', 'ver'), ('execucao.modelos', 'criar'), ('execucao.modelos', 'editar'), ('execucao.modelos', 'excluir')
)
insert into public.usuario_permissoes (usuario_id, recurso, acao)
select u.id, a.recurso, a.acao
from public.usuarios u join public.perfis p on p.id = u.perfil_id and p.nome = 'Admin'
cross join acoes a
where u.ativo and u.excluido_em is null
on conflict (usuario_id, recurso, acao) do nothing;

do $confere$
declare v int;
begin
  select count(distinct usuario_id) into v from public.usuario_permissoes where recurso like 'execucao.%';
  if v <> 4 then raise exception 'Execução foi para % usuários; o plano diz 4 Admins ativos', v; end if;
  select count(*) into v from public.usuario_permissoes where recurso like 'execucao.%';
  if v <> 36 then raise exception 'Esperado 36 permissões de execução (9 x 4 Admins), veio %', v; end if;
end $confere$;
```

- [ ] **Step 3: Ensaiar sem gravar**

MCP `execute_sql` com `begin;` + o conteúdo do Step 2 + `rollback;`. Esperado: termina sem erro (o `$confere$` passou). Rodar a prova: `7_backfill` continua `{"admins": 0, "linhas": 0}` (o ensaio voltou).

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/20261012160000_ex_fase1a_permissoes.sql supabase/provas/ex_fase1a_banco.sql
git commit -m "Execução F1a: backfill de permissões (aplicado só no fim da fase)"
```

---

### Task 8: Catálogo, ícone, tipos e rotas base

**Files:**
- Modify: `src/config/recursos.ts` (MODULOS e RECURSOS)
- Modify: `src/components/canonicos/app-shell.tsx` (`MAPA_ICONES`)
- Modify: `src/lib/database.types.ts` (regerado)
- Create: `src/modules/execucao/_shared/rotulos.ts`, `src/modules/execucao/_shared/catalogo.test.ts`
- Create: `src/app/(app)/execucao/layout.tsx`, `src/app/(app)/execucao/page.tsx`, `src/app/(app)/execucao/loading.tsx`

**Interfaces:**
- Produces: módulo `execucao` no menu; recursos `execucao.obras` (`/execucao/obras`, ver), `execucao.cronogramas` (`/execucao/cronogramas`, CRUD), `execucao.modelos` (`/execucao/modelos`, CRUD); `rotulos.ts` com:
  - `TIPOS_OBRA = ["edificacao","rodovia","pequena"] as const` e `ROTULO_TIPO_OBRA`
  - `STATUS_CRONOGRAMA = ["rascunho","ativo","concluido","arquivado"] as const` e `ROTULO_STATUS_CRONOGRAMA`
  - `TIPOS_LOCAL`, `ROTULO_TIPO_LOCAL`; `TIPOS_ATIVIDADE`, `ROTULO_TIPO_ATIVIDADE`; `TIPOS_VINCULO = ["TI","II","TT","IT"] as const`, `ROTULO_TIPO_VINCULO`; `CRITERIOS_PESO`, `ROTULO_CRITERIO_PESO`; `LADOS`, `ROTULO_LADO`.

- [ ] **Step 1: Teste do catálogo (falha)**

`src/modules/execucao/_shared/catalogo.test.ts`:

```ts
import { describe, expect, it } from "vitest";

import { MODULOS, RECURSOS } from "@/config/recursos";

describe("catálogo da Execução", () => {
  it("o módulo vem depois da Medição", () => {
    const ids = MODULOS.map((m) => m.id);
    expect(ids.indexOf("execucao")).toBe(ids.indexOf("medicao") + 1);
  });

  it("a Fase 1a registra só as três abas com tela", () => {
    const abas = RECURSOS.filter((r) => r.modulo === "execucao").map((r) => [r.id, r.rota, [...r.acoes]]);
    expect(abas).toEqual([
      ["execucao.obras", "/execucao/obras", ["ver"]],
      ["execucao.cronogramas", "/execucao/cronogramas", ["ver", "criar", "editar", "excluir"]],
      ["execucao.modelos", "/execucao/modelos", ["ver", "criar", "editar", "excluir"]],
    ]);
  });
});
```

Run: `npx vitest run src/modules/execucao/_shared/catalogo.test.ts`. Expected: FAIL (`-1` não é `10`).

- [ ] **Step 2: Registrar o módulo e as abas**

Em `src/config/recursos.ts`, no comentário de `MODULOS` acrescente "Execução de Obras fica depois da Medição (09/10/2026)." e a linha, logo depois de `medicao`:

```ts
  { id: "execucao", nome: "Execução", rota: "/execucao" },
```

No fim de `RECURSOS`, depois do último `medicao.*`:

```ts
  // Execução de Obras (spec 2026-10-09). Cada aba nova entra na fase dela, com o seu backfill.
  {
    id: "execucao.obras",
    nome: "Obras",
    modulo: "execucao",
    rota: "/execucao/obras",
    acoes: ["ver"],
  },
  {
    id: "execucao.cronogramas",
    nome: "Cronogramas",
    modulo: "execucao",
    rota: "/execucao/cronogramas",
    acoes: CRUD,
  },
  {
    id: "execucao.modelos",
    nome: "Modelos",
    modulo: "execucao",
    rota: "/execucao/modelos",
    acoes: CRUD,
  },
```

Em `src/components/canonicos/app-shell.tsx`, importe `HardHat` de `lucide-react` e acrescente `execucao: HardHat,` em `MAPA_ICONES`, logo depois de `medicao: Ruler,`.

- [ ] **Step 3: Rodar o teste e a suíte do catálogo**

Run: `npx vitest run src/modules/execucao/_shared/catalogo.test.ts src/config/recursos.test.ts src/components/canonicos/app-shell.test.tsx`. Expected: PASS. Se `recursos.test.ts` tiver uma lista fixa de módulos ou de recursos, acrescente `execucao` nela (é o mesmo registro, não regra nova).

- [ ] **Step 4: Rótulos**

`src/modules/execucao/_shared/rotulos.ts`:

```ts
/** Rótulos da Execução. Os valores são os mesmos dos CHECKs do banco (migration 20261012100000). */

export const TIPOS_OBRA = ["edificacao", "rodovia", "pequena"] as const;
export type TipoObra = (typeof TIPOS_OBRA)[number];
export const ROTULO_TIPO_OBRA: Record<TipoObra, string> = {
  edificacao: "Edificação",
  rodovia: "Rodovia",
  pequena: "Obra pequena",
};

export const STATUS_CRONOGRAMA = ["rascunho", "ativo", "concluido", "arquivado"] as const;
export type StatusCronograma = (typeof STATUS_CRONOGRAMA)[number];
export const ROTULO_STATUS_CRONOGRAMA: Record<StatusCronograma, string> = {
  rascunho: "Rascunho",
  ativo: "Ativo",
  concluido: "Concluído",
  arquivado: "Arquivado",
};

export const TIPOS_LOCAL = ["bloco", "pavimento", "ambiente", "peca", "segmento", "outro"] as const;
export type TipoLocal = (typeof TIPOS_LOCAL)[number];
export const ROTULO_TIPO_LOCAL: Record<TipoLocal, string> = {
  bloco: "Bloco",
  pavimento: "Pavimento",
  ambiente: "Ambiente",
  peca: "Peça",
  segmento: "Segmento",
  outro: "Outro",
};

export const TIPOS_ATIVIDADE = ["resumo", "atividade", "marco"] as const;
export type TipoAtividade = (typeof TIPOS_ATIVIDADE)[number];
export const ROTULO_TIPO_ATIVIDADE: Record<TipoAtividade, string> = {
  resumo: "Resumo",
  atividade: "Atividade",
  marco: "Marco",
};

export const TIPOS_VINCULO = ["TI", "II", "TT", "IT"] as const;
export type TipoVinculo = (typeof TIPOS_VINCULO)[number];
export const ROTULO_TIPO_VINCULO: Record<TipoVinculo, string> = {
  TI: "Término a início",
  II: "Início a início",
  TT: "Término a término",
  IT: "Início a término",
};

export const CRITERIOS_PESO = ["duracao", "valor", "homem_hora", "manual"] as const;
export type CriterioPeso = (typeof CRITERIOS_PESO)[number];
export const ROTULO_CRITERIO_PESO: Record<CriterioPeso, string> = {
  duracao: "Duração",
  valor: "Valor orçado",
  homem_hora: "Homem-hora",
  manual: "Peso manual",
};

export const LADOS = ["LD", "LE", "eixo", "ambos"] as const;
export type Lado = (typeof LADOS)[number];
export const ROTULO_LADO: Record<Lado, string> = { LD: "Lado direito", LE: "Lado esquerdo", eixo: "Eixo", ambos: "Ambos" };
```

- [ ] **Step 5: Layout e entrada do módulo**

`src/app/(app)/execucao/layout.tsx` e `page.tsx`: copie os da Medição (`src/app/(app)/medicao/layout.tsx` e `page.tsx`) trocando `"medicao"` por `"execucao"`, o nome da função (`LayoutExecucao`, `ExecucaoPagina`) e o comentário ("Régua de abas da Execução"). `loading.tsx`: copie `src/app/(app)/medicao/loading.tsx`.

- [ ] **Step 6: Regerar os tipos**

MCP `generate_typescript_types` e salve em `$CLAUDE_JOB_DIR/tmp/database.types.novo.ts`. Compare com `src/lib/database.types.ts`:

```bash
diff <(grep -v '^\s*$' src/lib/database.types.ts) <(grep -v '^\s*$' "$CLAUDE_JOB_DIR/tmp/database.types.novo.ts") | grep '^[<>]' | grep -v 'ex_' | head -40
```

Se a única diferença for o que tem `ex_`, troque o arquivo pelo novo. Se aparecer outra diferença (edição manual ou migration de outro trabalho), **não sobrescreva**: copie só os blocos `ex_*` (Tables, Views, Functions) para dentro do arquivo atual, nos mesmos lugares em ordem alfabética.

- [ ] **Step 7: tsc, testes e commit**

Run: `npx tsc --noEmit && npx vitest run src/modules/execucao src/config src/components/canonicos/app-shell.test.tsx`. Expected: PASS.

```bash
git add src/config/recursos.ts src/components/canonicos/app-shell.tsx src/lib/database.types.ts src/modules/execucao/_shared "src/app/(app)/execucao"
git commit -m "Execução F1a: módulo no catálogo, ícone, rótulos e tipos do banco"
```

---

### Task 9: Regras de entrada em TypeScript puro (número colado, predecessoras, bloco do Excel, hierarquia)

Nada aqui calcula data: só interpreta o que a pessoa digita ou cola e monta as linhas para o lote. A regra de cronograma continua no banco.

**Files:**
- Create: `src/modules/execucao/_shared/numero.ts`, `src/modules/execucao/_shared/numero.test.ts`
- Create: `src/modules/execucao/cronogramas/dependencias-texto.ts`, `dependencias-texto.test.ts`
- Create: `src/modules/execucao/cronogramas/colar.ts`, `colar.test.ts`
- Create: `src/modules/execucao/cronogramas/hierarquia.ts`, `hierarquia.test.ts`

**Interfaces:**
- Produces:
  - `lerNumeroColado(texto: string, casas?: number): { ok: true; valor: string | null } | { ok: false; erro: string }`. `valor` em texto com ponto decimal ("1234.5"), pronto para o banco; vazio vira `null`.
  - `type Predecessora = { codigo: string; tipo: TipoVinculo; atraso: number }`
  - `lerPredecessoras(texto: string, codigoDaLinha: (numero: number) => string | undefined): { ok: true; valor: Predecessora[] } | { ok: false; erro: string }`
  - `formatarPredecessoras(lista: readonly Predecessora[]): string`
  - `lerBlocoColado(texto: string): string[][]`
  - `type LinhaArvore = { id: string; codigo: string; paiId: string | null; tipo: TipoAtividade; ordem: number }`
  - `ordenarArvore(linhas: readonly LinhaArvore[]): LinhaArvore[]` (ordem de exibição: pai antes das filhas, irmãs por `ordem`)
  - `type Mudanca = { id: string; pai_codigo?: string; ordem?: number; tipo?: TipoAtividade }`
  - `recuar(linhas, id): Mudanca[]`, `avancar(linhas, id): Mudanca[]`, `moverAcima(linhas, id): Mudanca[]`, `moverAbaixo(linhas, id): Mudanca[]`
  - `proximaLinha(linhas, idReferencia: string | null): { codigo: string; pai_codigo: string; ordem: number; mudancas: Mudanca[] }`

- [ ] **Step 1: Testes do número colado (falham)**

`src/modules/execucao/_shared/numero.test.ts`:

```ts
import { describe, expect, it } from "vitest";

import { lerNumeroColado } from "@/modules/execucao/_shared/numero";

describe("lerNumeroColado", () => {
  it.each([
    ["", null],
    ["  ", null],
    ["12", "12"],
    ["12,5", "12.5"],
    ["1.234,5", "1234.5"],
    ["1.234.567,891", "1234567.891"],
    ["12.5", "12.5"],
    ["0,0001", "0.0001"],
    ["-3", "-3"],
  ])("%j vira %j", (texto, esperado) => {
    expect(lerNumeroColado(texto)).toEqual({ ok: true, valor: esperado });
  });

  it("1.234 sem vírgula é ambíguo (mil ou um e pouco) e vira erro", () => {
    expect(lerNumeroColado("1.234")).toEqual({ ok: false, erro: "Número ambíguo: 1.234. Use vírgula para decimal (1,234) ou tire o ponto (1234)" });
  });

  it("mais casas que o permitido vira erro, nunca arredonda escondido", () => {
    expect(lerNumeroColado("1,23456")).toEqual({ ok: false, erro: "No máximo 4 casas decimais: 1,23456" });
  });

  it("texto que não é número vira erro", () => {
    expect(lerNumeroColado("abc")).toEqual({ ok: false, erro: "Não é número: abc" });
  });
});
```

Run: `npx vitest run src/modules/execucao/_shared/numero.test.ts`. Expected: FAIL (módulo não existe).

- [ ] **Step 2: Implementar**

`src/modules/execucao/_shared/numero.ts`:

```ts
import { CASAS_TAXA } from "@/lib/casas-decimais";

/**
 * Número que veio colado do Excel ou digitado na grade (pt-BR). Nunca adivinha: "1.234" pode ser mil
 * ou um vírgula duzentos e trinta e quatro, então vira erro e a pessoa escolhe.
 */
export function lerNumeroColado(
  texto: string,
  casas: number = CASAS_TAXA,
): { ok: true; valor: string | null } | { ok: false; erro: string } {
  const t = texto.trim().replace(/\s/g, "");
  if (t === "") return { ok: true, valor: null };
  let normal: string;
  if (/^-?\d{1,3}(\.\d{3})+,\d+$/.test(t) || /^-?\d+,\d+$/.test(t)) {
    normal = t.replace(/\./g, "").replace(",", ".");
  } else if (/^-?\d{1,3}(\.\d{3})+$/.test(t)) {
    return { ok: false, erro: `Número ambíguo: ${texto.trim()}. Use vírgula para decimal (1,234) ou tire o ponto (1234)` };
  } else if (/^-?\d+(\.\d+)?$/.test(t)) {
    normal = t;
  } else {
    return { ok: false, erro: `Não é número: ${texto.trim()}` };
  }
  const fracao = normal.split(".")[1] ?? "";
  if (fracao.length > casas) return { ok: false, erro: `No máximo ${casas} casas decimais: ${texto.trim()}` };
  return { ok: true, valor: normal };
}
```

Run o teste: PASS.

- [ ] **Step 3: Testes das predecessoras (falham)**

`src/modules/execucao/cronogramas/dependencias-texto.test.ts`:

```ts
import { describe, expect, it } from "vitest";

import { formatarPredecessoras, lerPredecessoras } from "@/modules/execucao/cronogramas/dependencias-texto";

const linhas: Record<number, string> = { 3: "1.2", 7: "2.1" };
const porNumero = (n: number) => linhas[n];

describe("lerPredecessoras", () => {
  it.each([
    ["", []],
    ["1.1", [{ codigo: "1.1", tipo: "TI", atraso: 0 }]],
    ["1.1TI+2", [{ codigo: "1.1", tipo: "TI", atraso: 2 }]],
    ["1.3 ii -1", [{ codigo: "1.3", tipo: "II", atraso: -1 }]],
    ["1.1; 1.3TT+5d", [{ codigo: "1.1", tipo: "TI", atraso: 0 }, { codigo: "1.3", tipo: "TT", atraso: 5 }]],
    ["#3TI+2", [{ codigo: "1.2", tipo: "TI", atraso: 2 }]],
    ["#7IT", [{ codigo: "2.1", tipo: "IT", atraso: 0 }]],
  ])("%j", (texto, esperado) => {
    expect(lerPredecessoras(texto, porNumero)).toEqual({ ok: true, valor: esperado });
  });

  it("linha que não existe pelo número", () => {
    expect(lerPredecessoras("#9", porNumero)).toEqual({ ok: false, erro: "Não existe a linha 9" });
  });

  it("pedaço que não se entende", () => {
    expect(lerPredecessoras("1.1XX+2", porNumero)).toEqual({
      ok: false,
      erro: 'Não entendi "1.1XX+2". Use código, tipo (TI, II, TT, IT) e atraso: 1.2TI+2',
    });
  });

  it("a mesma predecessora duas vezes", () => {
    expect(lerPredecessoras("1.1; 1.1II", porNumero)).toEqual({ ok: false, erro: "A predecessora 1.1 aparece duas vezes" });
  });
});

describe("formatarPredecessoras", () => {
  it("omite TI sem atraso e escreve o resto", () => {
    expect(formatarPredecessoras([
      { codigo: "1.1", tipo: "TI", atraso: 0 },
      { codigo: "1.2", tipo: "TI", atraso: 2 },
      { codigo: "1.3", tipo: "II", atraso: -1 },
      { codigo: "2", tipo: "TT", atraso: 0 },
    ])).toBe("1.1; 1.2TI+2; 1.3II-1; 2TT");
  });

  it("ida e volta", () => {
    const texto = "1.1; 1.2TI+2; 1.3II-1; 2TT";
    const lido = lerPredecessoras(texto, porNumero);
    expect(lido.ok && formatarPredecessoras(lido.valor)).toBe(texto);
  });
});
```

Run: FAIL (módulo não existe).

- [ ] **Step 4: Implementar**

`src/modules/execucao/cronogramas/dependencias-texto.ts`:

```ts
import { TIPOS_VINCULO, type TipoVinculo } from "@/modules/execucao/_shared/rotulos";

/**
 * Texto de predecessoras da grade: "1.2TI+2; 1.3II-1; #7". Código da linha, tipo (TI, II, TT, IT; sem tipo
 * é TI) e atraso em dias úteis. "#7" é a linha número 7 da grade. Só interpreta: quem valida ciclo e
 * existência é o banco (fn_ex_atividades_salvar_lote).
 */
export type Predecessora = { codigo: string; tipo: TipoVinculo; atraso: number };

// O código termina em dígito (1, 1.2, A1.3): assim "1.1XX" não vira código. Linha com código só de letras
// é referida pelo número da linha (#7).
const PADRAO = /^(#\d+|[A-Za-z0-9.]*?[0-9])\s*(TI|II|TT|IT)?\s*(?:([+-])\s*(\d+))?\s*(?:d|dias?)?$/i;

export function lerPredecessoras(
  texto: string,
  codigoDaLinha: (numero: number) => string | undefined,
): { ok: true; valor: Predecessora[] } | { ok: false; erro: string } {
  const pedacos = texto.split(/[;,]/).map((p) => p.trim()).filter(Boolean);
  const valor: Predecessora[] = [];
  for (const pedaco of pedacos) {
    const m = PADRAO.exec(pedaco);
    if (!m) return { ok: false, erro: `Não entendi "${pedaco}". Use código, tipo (TI, II, TT, IT) e atraso: 1.2TI+2` };
    const [, ref, tipoTexto, sinal, numero] = m;
    let codigo = ref;
    if (ref.startsWith("#")) {
      const n = Number(ref.slice(1));
      const achado = codigoDaLinha(n);
      if (!achado) return { ok: false, erro: `Não existe a linha ${n}` };
      codigo = achado;
    }
    const tipo = (tipoTexto?.toUpperCase() ?? "TI") as TipoVinculo;
    if (!TIPOS_VINCULO.includes(tipo)) return { ok: false, erro: `Tipo de vínculo inválido em "${pedaco}"` };
    const atraso = numero ? Number(numero) * (sinal === "-" ? -1 : 1) : 0;
    if (valor.some((v) => v.codigo === codigo)) return { ok: false, erro: `A predecessora ${codigo} aparece duas vezes` };
    valor.push({ codigo, tipo, atraso });
  }
  return { ok: true, valor };
}

export function formatarPredecessoras(lista: readonly Predecessora[]): string {
  return lista
    .map(({ codigo, tipo, atraso }) => {
      if (tipo === "TI" && atraso === 0) return codigo;
      const lag = atraso === 0 ? "" : atraso > 0 ? `+${atraso}` : `${atraso}`;
      return `${codigo}${tipo}${lag}`;
    })
    .join("; ");
}
```

Run: PASS. O código precisa terminar em dígito, então "1.1XX+2" não casa (XX não é tipo nem atraso) e vira erro, que é o que o teste quer.

- [ ] **Step 5: Testes do bloco colado (falham)**

`src/modules/execucao/cronogramas/colar.test.ts`:

```ts
import { describe, expect, it } from "vitest";

import { lerBlocoColado } from "@/modules/execucao/cronogramas/colar";

describe("lerBlocoColado", () => {
  it("linhas por quebra, colunas por tabulação, sem a linha vazia do fim", () => {
    expect(lerBlocoColado("1.1\tEstacas\t30\r\n1.2\tBlocos\t5\r\n")).toEqual([
      ["1.1", "Estacas", "30"],
      ["1.2", "Blocos", "5"],
    ]);
  });

  it("célula entre aspas com quebra de linha e aspas dobradas (como o Excel copia)", () => {
    expect(lerBlocoColado('1\t"Fundação\nbloco ""A"""\t3\n')).toEqual([["1", 'Fundação\nbloco "A"', "3"]]);
  });

  it("uma célula só", () => {
    expect(lerBlocoColado("42")).toEqual([["42"]]);
  });
});
```

- [ ] **Step 6: Implementar**

`src/modules/execucao/cronogramas/colar.ts`:

```ts
/**
 * Bloco copiado do Excel ou do Google Planilhas (texto com tabulação). Aspas só abrem célula no começo
 * dela, e "" dentro de aspas é uma aspa, igual ao que o Excel escreve na área de transferência.
 */
export function lerBlocoColado(texto: string): string[][] {
  const linhas: string[][] = [];
  let linha: string[] = [];
  let celula = "";
  let emAspas = false;
  const t = texto.replace(/\r\n?/g, "\n");
  for (let i = 0; i < t.length; i++) {
    const c = t[i];
    if (emAspas) {
      if (c === '"' && t[i + 1] === '"') {
        celula += '"';
        i++;
      } else if (c === '"') {
        emAspas = false;
      } else {
        celula += c;
      }
    } else if (c === '"' && celula === "") {
      emAspas = true;
    } else if (c === "\t") {
      linha.push(celula);
      celula = "";
    } else if (c === "\n") {
      linha.push(celula);
      linhas.push(linha);
      linha = [];
      celula = "";
    } else {
      celula += c;
    }
  }
  if (celula !== "" || linha.length > 0) {
    linha.push(celula);
    linhas.push(linha);
  }
  return linhas;
}
```

Run: PASS.

- [ ] **Step 7: Testes da hierarquia (falham)**

`src/modules/execucao/cronogramas/hierarquia.test.ts`:

```ts
import { describe, expect, it } from "vitest";

import {
  avancar,
  moverAbaixo,
  moverAcima,
  ordenarArvore,
  proximaLinha,
  recuar,
  type LinhaArvore,
} from "@/modules/execucao/cronogramas/hierarquia";

// 1 (resumo) > 1.1, 1.2 ; 2 ; 3
const base: LinhaArvore[] = [
  { id: "r1", codigo: "1", paiId: null, tipo: "resumo", ordem: 1 },
  { id: "a11", codigo: "1.1", paiId: "r1", tipo: "atividade", ordem: 1 },
  { id: "a12", codigo: "1.2", paiId: "r1", tipo: "atividade", ordem: 2 },
  { id: "a2", codigo: "2", paiId: null, tipo: "atividade", ordem: 2 },
  { id: "a3", codigo: "3", paiId: null, tipo: "atividade", ordem: 3 },
];

describe("ordenarArvore", () => {
  it("pai antes das filhas, irmãs pela ordem, mesmo embaralhado", () => {
    const embaralhado = [base[3], base[2], base[4], base[0], base[1]];
    expect(ordenarArvore(embaralhado).map((l) => l.codigo)).toEqual(["1", "1.1", "1.2", "2", "3"]);
  });
});

describe("recuar", () => {
  it("3 vira filha de 2, e 2 vira resumo", () => {
    expect(recuar(base, "a3")).toEqual([
      { id: "a2", tipo: "resumo" },
      { id: "a3", pai_codigo: "2", ordem: 1 },
    ]);
  });
  it("primeira filha não tem irmã acima: nada muda", () => {
    expect(recuar(base, "a11")).toEqual([]);
  });
  it("recuar para dentro de quem já é resumo vai para o fim das filhas dele", () => {
    expect(recuar(base, "a2")).toEqual([{ id: "a2", pai_codigo: "1", ordem: 3 }]);
  });
});

describe("avancar", () => {
  it("1.2 sai do resumo e fica logo depois dele; as irmãs de baixo da raiz descem uma posição", () => {
    expect(avancar(base, "a12")).toEqual([
      { id: "a12", pai_codigo: "", ordem: 2 },
      { id: "a2", ordem: 3 },
      { id: "a3", ordem: 4 },
    ]);
  });
  it("linha na raiz: nada muda", () => {
    expect(avancar(base, "a2")).toEqual([]);
  });
});

describe("mover", () => {
  it("troca a ordem com a irmã de cima e de baixo", () => {
    expect(moverAcima(base, "a12")).toEqual([{ id: "a12", ordem: 1 }, { id: "a11", ordem: 2 }]);
    expect(moverAbaixo(base, "a2")).toEqual([{ id: "a2", ordem: 3 }, { id: "a3", ordem: 2 }]);
    expect(moverAcima(base, "a11")).toEqual([]);
  });
});

describe("proximaLinha", () => {
  it("abaixo de 1.1: código 1.3 (o próximo livre), dentro de 1, ordem 2, e 1.2 desce", () => {
    expect(proximaLinha(base, "a11")).toEqual({
      codigo: "1.3",
      pai_codigo: "1",
      ordem: 2,
      mudancas: [{ id: "a12", ordem: 3 }],
    });
  });
  it("sem referência: no fim da raiz", () => {
    expect(proximaLinha(base, null)).toEqual({ codigo: "4", pai_codigo: "", ordem: 4, mudancas: [] });
  });
  it("cronograma vazio", () => {
    expect(proximaLinha([], null)).toEqual({ codigo: "1", pai_codigo: "", ordem: 1, mudancas: [] });
  });
});
```

- [ ] **Step 8: Implementar**

`src/modules/execucao/cronogramas/hierarquia.ts`:

```ts
import type { TipoAtividade } from "@/modules/execucao/_shared/rotulos";

/**
 * Operações de árvore da grade (recuar, avançar, mover, inserir). Devolvem só as mudanças, no formato
 * do lote (fn_ex_atividades_salvar_lote): quem grava e valida é o banco. `ordem` vale entre irmãs.
 */
export type LinhaArvore = { id: string; codigo: string; paiId: string | null; tipo: TipoAtividade; ordem: number };
export type Mudanca = { id: string; pai_codigo?: string; ordem?: number; tipo?: TipoAtividade };

function irmas(linhas: readonly LinhaArvore[], paiId: string | null): LinhaArvore[] {
  return linhas.filter((l) => l.paiId === paiId).sort((a, b) => a.ordem - b.ordem || a.codigo.localeCompare(b.codigo));
}

export function ordenarArvore(linhas: readonly LinhaArvore[]): LinhaArvore[] {
  const saida: LinhaArvore[] = [];
  const visitar = (paiId: string | null) => {
    for (const l of irmas(linhas, paiId)) {
      saida.push(l);
      visitar(l.id);
    }
  };
  visitar(null);
  return saida;
}

function achar(linhas: readonly LinhaArvore[], id: string): LinhaArvore {
  const l = linhas.find((x) => x.id === id);
  if (!l) throw new Error(`Linha ${id} não está na grade`);
  return l;
}

export function recuar(linhas: readonly LinhaArvore[], id: string): Mudanca[] {
  const linha = achar(linhas, id);
  const lista = irmas(linhas, linha.paiId);
  const i = lista.findIndex((l) => l.id === id);
  if (i <= 0) return [];
  const novoPai = lista[i - 1];
  const filhasDoNovoPai = irmas(linhas, novoPai.id);
  const ordem = (filhasDoNovoPai.at(-1)?.ordem ?? 0) + 1;
  const mudancas: Mudanca[] = [];
  if (novoPai.tipo !== "resumo") mudancas.push({ id: novoPai.id, tipo: "resumo" });
  mudancas.push({ id, pai_codigo: novoPai.codigo, ordem });
  return mudancas;
}

export function avancar(linhas: readonly LinhaArvore[], id: string): Mudanca[] {
  const linha = achar(linhas, id);
  if (linha.paiId === null) return [];
  const pai = achar(linhas, linha.paiId);
  const avo = pai.paiId === null ? null : achar(linhas, pai.paiId);
  const ordem = pai.ordem + 1;
  const mudancas: Mudanca[] = [{ id, pai_codigo: avo?.codigo ?? "", ordem }];
  for (const irma of irmas(linhas, pai.paiId)) {
    if (irma.id !== pai.id && irma.ordem >= ordem) mudancas.push({ id: irma.id, ordem: irma.ordem + 1 });
  }
  return mudancas;
}

function trocar(linhas: readonly LinhaArvore[], id: string, delta: -1 | 1): Mudanca[] {
  const linha = achar(linhas, id);
  const lista = irmas(linhas, linha.paiId);
  const i = lista.findIndex((l) => l.id === id);
  const outra = lista[i + delta];
  if (!outra) return [];
  return [{ id, ordem: outra.ordem }, { id: outra.id, ordem: linha.ordem }];
}

export const moverAcima = (linhas: readonly LinhaArvore[], id: string) => trocar(linhas, id, -1);
export const moverAbaixo = (linhas: readonly LinhaArvore[], id: string) => trocar(linhas, id, 1);

/** Código livre seguinte entre as irmãs: prefixo do pai + (maior último número + 1). */
function proximoCodigo(linhas: readonly LinhaArvore[], pai: LinhaArvore | null): string {
  const prefixo = pai ? `${pai.codigo}.` : "";
  const numeros = linhas
    .filter((l) => (pai ? l.paiId === pai.id : l.paiId === null))
    .map((l) => Number(l.codigo.slice(prefixo.length)))
    .filter((n) => Number.isInteger(n));
  return `${prefixo}${(numeros.length ? Math.max(...numeros) : 0) + 1}`;
}

export function proximaLinha(
  linhas: readonly LinhaArvore[],
  idReferencia: string | null,
): { codigo: string; pai_codigo: string; ordem: number; mudancas: Mudanca[] } {
  if (idReferencia === null) {
    const raiz = irmas(linhas, null);
    return { codigo: proximoCodigo(linhas, null), pai_codigo: "", ordem: (raiz.at(-1)?.ordem ?? 0) + 1, mudancas: [] };
  }
  const ref = achar(linhas, idReferencia);
  const pai = ref.paiId === null ? null : achar(linhas, ref.paiId);
  const ordem = ref.ordem + 1;
  const mudancas = irmas(linhas, ref.paiId)
    .filter((l) => l.id !== ref.id && l.ordem >= ordem)
    .map((l) => ({ id: l.id, ordem: l.ordem + 1 }));
  return { codigo: proximoCodigo(linhas, pai), pai_codigo: pai?.codigo ?? "", ordem, mudancas };
}
```

Run: `npx vitest run src/modules/execucao`. Expected: PASS.

- [ ] **Step 9: Commit**

```bash
git add src/modules/execucao
git commit -m "Execução F1a: leitura de número colado, predecessoras em texto, bloco do Excel e operações de árvore"
```

---

### Task 10: Pastas e obra (servidor e telas)

**Files:**
- Create: `src/modules/execucao/obras/schemas.ts`, `schemas.test.ts`, `actions.ts`, `actions.test.ts`, `queries.ts`
- Create: `src/modules/execucao/obras/components/pastas-grade.tsx`, `novo-cronograma-drawer.tsx`, `locais-tabela.tsx`, `local-drawer.tsx`, `acesso-obra.tsx`, `configurar-obra-drawer.tsx`
- Create: `src/app/(app)/execucao/obras/page.tsx`, `loading.tsx`, `src/app/(app)/execucao/obras/[obraId]/page.tsx`, `loading.tsx`

**Interfaces:**
- Consumes: RPCs da Task 4, `ex_v_pastas` e `ex_v_cronogramas` (Task 6), rótulos (Task 8).
- Produces:
  - `schemas.ts`: `novoCronogramaSchema`, `configurarObraSchema`, `localSchema`, tipos `NovoCronogramaInput`, `ConfigurarObraInput`, `LocalInput`, e `payloadDoNovoCronograma`, `payloadDaObra`, `payloadDoLocal`.
  - `actions.ts`: `criarCronograma(dados): Promise<{ ok: true; id: string } | { erro: string }>`, `configurarObra(obraId, dados)`, `definirAcesso(obraId, usuarioId, tem)`, `salvarLocal(obraId, id | null, dados)`, `excluirLocal(id, motivo)`, todas `Promise<{ ok: true } | { ok: true; id: string } | { erro: string }>`.
  - `queries.ts`: `listarPastas(): Promise<Pasta[]>`, `pastaDaObra(obraId): Promise<ObraPasta | null>`, `locaisDaObra(obraId): Promise<Local[]>`, `usuariosDaObra(obraId): Promise<UsuarioDaObra[]>`, `obrasDisponiveis(): Promise<ObraDisponivel[]>`, `calendariosModelo(): Promise<{ id: string; nome: string; padrao: boolean }[]>`.
  - `NovoCronogramaDrawer` é usado também pela lista de cronogramas (Task 13).

- [ ] **Step 1: Testes dos schemas (falham)**

`src/modules/execucao/obras/schemas.test.ts`:

```ts
import { describe, expect, it } from "vitest";

import { configurarObraSchema, localSchema, novoCronogramaSchema, payloadDoNovoCronograma } from "@/modules/execucao/obras/schemas";

const OBRA = "11111111-1111-4111-8111-111111111111";

describe("novoCronogramaSchema", () => {
  it("põe o código em maiúsculas e monta o payload do banco", () => {
    const r = novoCronogramaSchema.parse({ obraId: OBRA, tipoObra: "edificacao", codigo: " fund ", nome: "Fundação",
      dataInicio: "2026-03-02", criterioPeso: "duracao" });
    expect(payloadDoNovoCronograma(r)).toEqual({ obra_id: OBRA, tipo_obra: "edificacao", codigo: "FUND", nome: "Fundação",
      data_inicio: "2026-03-02", calendario_modelo_id: null, criterio_peso: "duracao", observacoes: null });
  });
  it("recusa código com espaço", () => {
    const r = novoCronogramaSchema.safeParse({ obraId: OBRA, codigo: "A B", nome: "X1", dataInicio: "2026-03-02", criterioPeso: "duracao" });
    expect(r.success).toBe(false);
  });
});

describe("configurarObraSchema", () => {
  it("km só em rodovia", () => {
    expect(configurarObraSchema.safeParse({ tipoObra: "edificacao", kmInicial: "100", kmFinal: "120",
      metrosPorEstaca: "20", ppcLimite: "80" }).success).toBe(false);
    expect(configurarObraSchema.safeParse({ tipoObra: "rodovia", kmInicial: "100", kmFinal: "120",
      metrosPorEstaca: "20", ppcLimite: "80" }).success).toBe(true);
  });
});

describe("localSchema", () => {
  it("km inicial e final andam juntos", () => {
    expect(localSchema.safeParse({ tipo: "segmento", codigo: "T1", nome: "Trecho 1", ordem: 0, kmInicial: "100", kmFinal: "" }).success).toBe(false);
  });
});
```

Run: `npx vitest run src/modules/execucao/obras/schemas.test.ts`. Expected: FAIL.

- [ ] **Step 2: Implementar os schemas**

`src/modules/execucao/obras/schemas.ts`:

```ts
import { z } from "zod";

import { idSchema } from "@/lib/id";
import { lerNumeroColado } from "@/modules/execucao/_shared/numero";
import { CRITERIOS_PESO, LADOS, TIPOS_LOCAL, TIPOS_OBRA } from "@/modules/execucao/_shared/rotulos";

const data = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Data inválida");
const textoOpcional = (max: number) => z.string().trim().max(max).optional();
/** Número digitado (pt-BR) em texto; sai no formato do banco ("1234.5") ou vazio. */
const numeroOpcional = z
  .string()
  .optional()
  .transform((t, ctx) => {
    const lido = lerNumeroColado(t ?? "");
    if (!lido.ok) {
      ctx.addIssue({ code: "custom", message: lido.erro });
      return z.NEVER;
    }
    return lido.valor;
  });

export const novoCronogramaSchema = z.object({
  obraId: idSchema,
  tipoObra: z.enum(TIPOS_OBRA).optional(),
  codigo: z.string().trim().toUpperCase().regex(/^[A-Z0-9][A-Z0-9-]{0,19}$/, "Código: até 20 letras, números ou hífen, sem espaço"),
  nome: z.string().trim().min(2, "Informe o nome").max(160),
  dataInicio: data,
  calendarioModeloId: idSchema.optional(),
  criterioPeso: z.enum(CRITERIOS_PESO),
  observacoes: textoOpcional(2000),
});
export type NovoCronogramaInput = z.input<typeof novoCronogramaSchema>;

export function payloadDoNovoCronograma(d: z.output<typeof novoCronogramaSchema>) {
  return {
    obra_id: d.obraId,
    tipo_obra: d.tipoObra ?? null,
    codigo: d.codigo,
    nome: d.nome,
    data_inicio: d.dataInicio,
    calendario_modelo_id: d.calendarioModeloId ?? null,
    criterio_peso: d.criterioPeso,
    observacoes: d.observacoes || null,
  };
}

export const configurarObraSchema = z
  .object({
    tipoObra: z.enum(TIPOS_OBRA),
    calendarioId: idSchema.optional(),
    kmInicial: numeroOpcional,
    kmFinal: numeroOpcional,
    metrosPorEstaca: numeroOpcional,
    ppcLimite: numeroOpcional,
    observacoes: textoOpcional(2000),
  })
  .refine((d) => d.tipoObra === "rodovia" || (d.kmInicial === null && d.kmFinal === null), {
    message: "Km inicial e final só valem para obra de rodovia",
    path: ["kmInicial"],
  })
  .refine((d) => (d.kmInicial === null) === (d.kmFinal === null), { message: "Informe km inicial e final juntos", path: ["kmFinal"] });
export type ConfigurarObraInput = z.input<typeof configurarObraSchema>;

export function payloadDaObra(d: z.output<typeof configurarObraSchema>) {
  return {
    tipo_obra: d.tipoObra,
    calendario_id: d.calendarioId ?? null,
    km_inicial: d.kmInicial,
    km_final: d.kmFinal,
    metros_por_estaca: d.metrosPorEstaca,
    ppc_limite: d.ppcLimite,
    observacoes: d.observacoes || null,
  };
}

export const localSchema = z
  .object({
    paiId: idSchema.optional(),
    tipo: z.enum(TIPOS_LOCAL),
    codigo: z.string().trim().min(1, "Informe o código").max(30),
    nome: z.string().trim().min(1, "Informe o nome").max(160),
    ordem: z.number().int(),
    kmInicial: numeroOpcional,
    kmFinal: numeroOpcional,
    lado: z.enum(LADOS).optional(),
    faixa: textoOpcional(30),
  })
  .refine((d) => (d.kmInicial === null) === (d.kmFinal === null), { message: "Informe km inicial e final juntos", path: ["kmFinal"] });
export type LocalInput = z.input<typeof localSchema>;

export function payloadDoLocal(d: z.output<typeof localSchema>) {
  return {
    pai_id: d.paiId ?? null,
    tipo: d.tipo,
    codigo: d.codigo,
    nome: d.nome,
    ordem: d.ordem,
    km_inicial: d.kmInicial,
    km_final: d.kmFinal,
    lado: d.lado ?? null,
    faixa: d.faixa || null,
  };
}
```

Run: PASS.

- [ ] **Step 3: Testes das actions (falham)**

`src/modules/execucao/obras/actions.test.ts` (mesmo molde de `src/modules/medicao/contratos/actions.test.ts`):

```ts
// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";

const estado = vi.hoisted(() => ({
  negadas: [] as string[],
  chamadas: [] as { fn: string; args: Record<string, unknown> }[],
  resposta: { data: null as unknown, error: null as { code?: string; message?: string } | null },
}));

vi.mock("server-only", () => ({}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/permissoes", () => ({
  exigirPermissao: vi.fn(async (recurso: string, acao: string) => {
    if (estado.negadas.includes(`${recurso}/${acao}`)) throw new Error("Sem permissão");
  }),
}));
vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({
    rpc: async (fn: string, args: Record<string, unknown>) => {
      estado.chamadas.push({ fn, args });
      return estado.resposta;
    },
  }),
}));

import { criarCronograma, definirAcesso, excluirLocal, salvarLocal } from "@/modules/execucao/obras/actions";

const OBRA = "11111111-1111-4111-8111-111111111111";
const ID = "22222222-2222-4222-8222-222222222222";

beforeEach(() => {
  estado.negadas = [];
  estado.chamadas = [];
  estado.resposta = { data: ID, error: null };
  vi.spyOn(console, "error").mockImplementation(() => {});
});

describe("criarCronograma", () => {
  const dados = { obraId: OBRA, tipoObra: "edificacao" as const, codigo: "fund", nome: "Fundação", dataInicio: "2026-03-02", criterioPeso: "duracao" as const };

  it("sem execucao.cronogramas/criar não chama o banco", async () => {
    estado.negadas = ["execucao.cronogramas/criar"];
    await expect(criarCronograma(dados)).resolves.toEqual({ erro: "Sem permissão para criar cronograma" });
    expect(estado.chamadas).toEqual([]);
  });

  it("chama fn_ex_cronograma_salvar sem p_id e devolve o id", async () => {
    await expect(criarCronograma(dados)).resolves.toEqual({ ok: true, id: ID });
    expect(estado.chamadas[0].fn).toBe("fn_ex_cronograma_salvar");
    expect(estado.chamadas[0].args.p_id).toBeUndefined();
    expect((estado.chamadas[0].args.p_dados as Record<string, unknown>).codigo).toBe("FUND");
  });

  it("mensagem de negócio do banco passa para a tela", async () => {
    estado.resposta = { data: null, error: { code: "P0001", message: "Esta obra já tem cronogramas e você não está na lista" } };
    await expect(criarCronograma(dados)).resolves.toEqual({ erro: "Esta obra já tem cronogramas e você não está na lista" });
  });
});

describe("definirAcesso", () => {
  it("id inválido não chama o banco", async () => {
    await expect(definirAcesso("x", ID, true)).resolves.toEqual({ erro: "Dados inválidos" });
    expect(estado.chamadas).toEqual([]);
  });
});

describe("locais", () => {
  it("salvar novo usa criar; editar usa editar", async () => {
    estado.negadas = ["execucao.cronogramas/editar"];
    const local = { tipo: "bloco" as const, codigo: "A", nome: "Bloco A", ordem: 0 };
    await expect(salvarLocal(OBRA, null, local)).resolves.toEqual({ ok: true, id: ID });
    await expect(salvarLocal(OBRA, ID, local)).resolves.toEqual({ erro: "Sem permissão para editar local" });
  });

  it("excluir exige motivo", async () => {
    await expect(excluirLocal(ID, "  ")).resolves.toEqual({ erro: "Informe o motivo da exclusão" });
    expect(estado.chamadas).toEqual([]);
  });
});
```

Run: FAIL.

- [ ] **Step 4: Implementar as actions**

`src/modules/execucao/obras/actions.ts`:

```ts
"use server";

import { revalidatePath } from "next/cache";

import { erroAcao, semLancar } from "@/lib/erros";
import { mensagemDeNegocio } from "@/lib/erros-banco";
import { idSchema } from "@/lib/id";
import { exigirPermissao } from "@/lib/permissoes";
import { createClient } from "@/lib/supabase/server";
import {
  configurarObraSchema,
  localSchema,
  novoCronogramaSchema,
  payloadDaObra,
  payloadDoLocal,
  payloadDoNovoCronograma,
  type ConfigurarObraInput,
  type LocalInput,
  type NovoCronogramaInput,
} from "@/modules/execucao/obras/schemas";

/**
 * Mutações de pasta, obra, acesso e locais. Só por RPC, que confere de novo a ação E a lista da obra.
 * Nada aqui escreve em obras, colaboradores ou qualquer outro módulo.
 */

export type ResultadoAcao = { ok: true } | { erro: string };
export type ResultadoSalvar = { ok: true; id: string } | { erro: string };

const RECURSO = "execucao.cronogramas" as const;

async function pode(acao: "criar" | "editar" | "excluir"): Promise<boolean> {
  try {
    await exigirPermissao(RECURSO, acao);
    return true;
  } catch {
    return false;
  }
}

function revalidar(obraId?: string) {
  for (const rota of ["/execucao/obras", "/execucao/cronogramas", ...(obraId ? [`/execucao/obras/${obraId}`] : [])]) {
    try {
      revalidatePath(rota);
    } catch {
      // O sucesso já aconteceu.
    }
  }
}

export async function criarCronograma(dados: NovoCronogramaInput): Promise<ResultadoSalvar> {
  return semLancar("execucao.obras.criarCronograma", async () => {
    if (!(await pode("criar"))) return { erro: "Sem permissão para criar cronograma" };
    const v = novoCronogramaSchema.safeParse(dados);
    if (!v.success) return { erro: v.error.issues[0]?.message ?? "Dados inválidos" };
    const supabase = await createClient();
    const { data, error } = await supabase.rpc("fn_ex_cronograma_salvar", { p_dados: payloadDoNovoCronograma(v.data) });
    if (error) return erroAcao("execucao.obras.criarCronograma", error, mensagemDeNegocio(error, "Não foi possível criar o cronograma"));
    revalidar(v.data.obraId);
    return { ok: true, id: String(data) };
  });
}

export async function configurarObra(obraId: string, dados: ConfigurarObraInput): Promise<ResultadoAcao> {
  return semLancar("execucao.obras.configurar", async () => {
    if (!(await pode("editar"))) return { erro: "Sem permissão para configurar a obra" };
    if (!idSchema.safeParse(obraId).success) return { erro: "Dados inválidos" };
    const v = configurarObraSchema.safeParse(dados);
    if (!v.success) return { erro: v.error.issues[0]?.message ?? "Dados inválidos" };
    const supabase = await createClient();
    const { error } = await supabase.rpc("fn_ex_obra_configurar", { p_obra: obraId, p_dados: payloadDaObra(v.data) });
    if (error) return erroAcao("execucao.obras.configurar", error, mensagemDeNegocio(error, "Não foi possível salvar a configuração"));
    revalidar(obraId);
    return { ok: true };
  });
}

export async function definirAcesso(obraId: string, usuarioId: string, tem: boolean): Promise<ResultadoAcao> {
  return semLancar("execucao.obras.acesso", async () => {
    if (!(await pode("editar"))) return { erro: "Sem permissão para mudar o acesso da obra" };
    if (!idSchema.safeParse(obraId).success || !idSchema.safeParse(usuarioId).success) return { erro: "Dados inválidos" };
    const supabase = await createClient();
    const { error } = await supabase.rpc("fn_ex_acesso_definir", { p_obra: obraId, p_usuario: usuarioId, p_tem: tem });
    if (error) return erroAcao("execucao.obras.acesso", error, mensagemDeNegocio(error, "Não foi possível mudar o acesso"));
    revalidar(obraId);
    return { ok: true };
  });
}

export async function salvarLocal(obraId: string, id: string | null, dados: LocalInput): Promise<ResultadoSalvar> {
  return semLancar("execucao.obras.local", async () => {
    if (!(await pode(id === null ? "criar" : "editar"))) {
      return { erro: id === null ? "Sem permissão para cadastrar local" : "Sem permissão para editar local" };
    }
    if (!idSchema.safeParse(obraId).success || (id !== null && !idSchema.safeParse(id).success)) return { erro: "Dados inválidos" };
    const v = localSchema.safeParse(dados);
    if (!v.success) return { erro: v.error.issues[0]?.message ?? "Dados inválidos" };
    const supabase = await createClient();
    const { data, error } = await supabase.rpc("fn_ex_local_salvar", { p_obra: obraId, p_dados: payloadDoLocal(v.data), p_id: id ?? undefined });
    if (error) return erroAcao("execucao.obras.local", error, mensagemDeNegocio(error, "Não foi possível salvar o local"));
    revalidar(obraId);
    return { ok: true, id: String(data) };
  });
}

export async function excluirLocal(id: string, motivo: string): Promise<ResultadoAcao> {
  return semLancar("execucao.obras.excluirLocal", async () => {
    if (!(await pode("excluir"))) return { erro: "Sem permissão para excluir local" };
    if (!idSchema.safeParse(id).success) return { erro: "Dados inválidos" };
    if (motivo.trim() === "") return { erro: "Informe o motivo da exclusão" };
    const supabase = await createClient();
    const { error } = await supabase.rpc("fn_ex_local_excluir", { p_id: id, p_motivo: motivo.trim() });
    if (error) return erroAcao("execucao.obras.excluirLocal", error, mensagemDeNegocio(error, "Não foi possível excluir o local"));
    revalidar();
    return { ok: true };
  });
}
```

Run: `npx vitest run src/modules/execucao/obras`. Expected: PASS. (O tipo de `supabase.rpc` vem de `database.types.ts`, regerado na Task 8; se o `tsc` reclamar de nome de parâmetro, o nome certo é o da migration da Task 4.)

- [ ] **Step 5: Queries**

`src/modules/execucao/obras/queries.ts`:

```ts
import "server-only";

import { createClient } from "@/lib/supabase/server";
import { todasAsLinhas } from "@/lib/supabase/todas-as-linhas";
import type { TipoLocal, TipoObra } from "@/modules/execucao/_shared/rotulos";

/** Leitura de pastas, obra e locais. A RLS já filtra pela lista da obra. */

export interface Pasta {
  obraId: string;
  obraNome: string;
  tipoObra: TipoObra;
  nCronogramas: number;
  nAtivos: number;
  nRascunhos: number;
  inicioPrevisto: string | null;
  terminoPrevisto: string | null;
}

export async function listarPastas(): Promise<Pasta[]> {
  const supabase = await createClient();
  const { data, error } = await supabase.from("ex_v_pastas").select("*").order("obra_nome");
  if (error) throw new Error(`Não foi possível ler as pastas: ${error.message}`);
  return (data ?? []).map((p) => ({
    obraId: p.obra_id!,
    obraNome: p.obra_nome ?? "",
    tipoObra: p.tipo_obra as TipoObra,
    nCronogramas: Number(p.n_cronogramas ?? 0),
    nAtivos: Number(p.n_ativos ?? 0),
    nRascunhos: Number(p.n_rascunhos ?? 0),
    inicioPrevisto: p.inicio_previsto,
    terminoPrevisto: p.termino_previsto,
  }));
}

export interface ObraPasta {
  obraId: string;
  obraNome: string;
  tipoObra: TipoObra;
  calendarioId: string | null;
  kmInicial: string | null;
  kmFinal: string | null;
  metrosPorEstaca: string;
  ppcLimite: string;
  observacoes: string | null;
}

export async function pastaDaObra(obraId: string): Promise<ObraPasta | null> {
  const supabase = await createClient();
  const [{ data, error }, nome] = await Promise.all([
    supabase.from("ex_obras").select("*").eq("obra_id", obraId).maybeSingle(),
    supabase.rpc("fn_ex_obra_nome", { p_obra: obraId }),
  ]);
  if (error) throw new Error(`Não foi possível ler a obra: ${error.message}`);
  if (!data) return null;
  return {
    obraId: data.obra_id,
    obraNome: String(nome.data ?? ""),
    tipoObra: data.tipo_obra as TipoObra,
    calendarioId: data.calendario_id,
    kmInicial: data.km_inicial === null ? null : String(data.km_inicial),
    kmFinal: data.km_final === null ? null : String(data.km_final),
    metrosPorEstaca: String(data.metros_por_estaca),
    ppcLimite: String(data.ppc_limite),
    observacoes: data.observacoes,
  };
}

export interface Local {
  id: string;
  paiId: string | null;
  tipo: TipoLocal;
  codigo: string;
  nome: string;
  ordem: number;
  kmInicial: string | null;
  kmFinal: string | null;
  lado: string | null;
  faixa: string | null;
}

export async function locaisDaObra(obraId: string): Promise<Local[]> {
  const supabase = await createClient();
  const { linhas, erro } = await todasAsLinhas((de, ate) =>
    supabase.from("ex_locais").select("*").eq("obra_id", obraId).is("excluido_em", null).order("ordem").order("codigo").range(de, ate),
  );
  if (erro) throw new Error(`Não foi possível ler os locais: ${erro}`);
  return linhas.map((l) => ({
    id: l.id,
    paiId: l.pai_id,
    tipo: l.tipo as TipoLocal,
    codigo: l.codigo,
    nome: l.nome,
    ordem: l.ordem,
    kmInicial: l.km_inicial === null ? null : String(l.km_inicial),
    kmFinal: l.km_final === null ? null : String(l.km_final),
    lado: l.lado,
    faixa: l.faixa,
  }));
}

export interface UsuarioDaObra { id: string; nome: string; email: string; naLista: boolean }

export async function usuariosDaObra(obraId: string): Promise<UsuarioDaObra[]> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("fn_ex_usuarios_da_obra", { p_obra: obraId });
  if (error) throw new Error(`Não foi possível ler o acesso: ${error.message}`);
  return (data ?? []).map((u) => ({ id: u.usuario_id, nome: u.nome, email: u.email, naLista: u.na_lista }));
}

export interface ObraDisponivel { id: string; nome: string; temPasta: boolean; tenhoAcesso: boolean }

export async function obrasDisponiveis(): Promise<ObraDisponivel[]> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("fn_ex_obras_disponiveis");
  if (error) throw new Error(`Não foi possível ler as obras: ${error.message}`);
  return (data ?? []).map((o) => ({ id: o.obra_id, nome: o.nome, temPasta: o.tem_pasta, tenhoAcesso: o.tenho_acesso }));
}

export async function calendariosModelo(): Promise<{ id: string; nome: string; padrao: boolean }[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("ex_calendarios").select("id, nome, padrao_empresa").eq("modelo", true).is("excluido_em", null).order("nome");
  if (error) throw new Error(`Não foi possível ler os calendários: ${error.message}`);
  return (data ?? []).map((c) => ({ id: c.id, nome: c.nome, padrao: c.padrao_empresa }));
}
```

- [ ] **Step 6: Tela de pastas**

`src/app/(app)/execucao/obras/page.tsx`:

```tsx
import { notFound } from "next/navigation";

import { PageHeader } from "@/components/canonicos";
import { getUsuarioLogado, temPermissao } from "@/lib/permissoes";
import { NovoCronogramaDrawer } from "@/modules/execucao/obras/components/novo-cronograma-drawer";
import { PastasGrade } from "@/modules/execucao/obras/components/pastas-grade";
import { calendariosModelo, listarPastas, obrasDisponiveis } from "@/modules/execucao/obras/queries";

export default async function PaginaObras() {
  const usuario = await getUsuarioLogado();
  if (!usuario || !temPermissao(usuario, "execucao.obras", "ver")) notFound();
  const podeCriar = temPermissao(usuario, "execucao.cronogramas", "criar");
  const [pastas, obras, calendarios] = await Promise.all([
    listarPastas(),
    podeCriar ? obrasDisponiveis() : Promise.resolve([]),
    podeCriar ? calendariosModelo() : Promise.resolve([]),
  ]);
  return (
    <>
      <PageHeader
        modulo="Execução"
        titulo="Obras"
        descricao="Uma pasta para cada obra com cronograma. Você só vê as obras em que está na lista de acesso"
        acoes={podeCriar ? <NovoCronogramaDrawer obras={obras} calendarios={calendarios} /> : undefined}
      />
      <PastasGrade pastas={pastas} podeCriar={podeCriar} />
    </>
  );
}
```

`src/modules/execucao/obras/components/pastas-grade.tsx` (cliente): grade responsiva de cards (`grid gap-4 sm:grid-cols-2 xl:grid-cols-3`), um `Link` por pasta para `/execucao/obras/${obraId}`, cada card com a Faixa à esquerda (`border-l-[3px] border-l-faixa`, a mesma do `KPICard`), nome da obra em peso 600, `StatusBadge` discreto com `ROTULO_TIPO_OBRA[tipoObra]`, e três linhas: "N cronogramas (A ativos, R em rascunho)", "Início previsto <formatarData>", "Término previsto <formatarData>". Sem pasta: `EmptyState` com ícone `FolderOpen`, título "Nenhuma obra no módulo ainda", descrição "A pasta da obra aparece quando ela ganha o primeiro cronograma" e, se `podeCriar`, a ação "Novo cronograma" (o mesmo drawer). Saúde, PPC e material faltando **não entram** nesta fase (nem como espaço vazio): chegam na F3 e F5.

`src/modules/execucao/obras/components/novo-cronograma-drawer.tsx` (cliente): botão "Novo cronograma" que abre `FormDrawer` (React Hook Form + `zodResolver(novoCronogramaSchema)`):
- Obra (`Combobox` com `obras`; rótulo "<nome>" e, se `temPasta && !tenhoAcesso`, a opção vem desabilitada com o sufixo " (sem acesso)").
- Tipo da obra (select com `TIPOS_OBRA`), **só aparece se a obra escolhida não tem pasta**; obrigatório nesse caso (validação no `onSubmit`: "Informe o tipo da obra").
- Código, Nome, Data de início (`input type="date"`), Calendário (select com `calendarios`, padrão o `padrao: true`), Critério de peso (select com `ROTULO_CRITERIO_PESO`, padrão "duracao"), Observações.
- Salvar chama `criarCronograma`; sucesso faz `toast.sucesso("Cronograma criado")` e `router.push(`/execucao/cronogramas/${id}`)`; erro fica no rodapé do drawer.

- [ ] **Step 7: Tela da obra**

`src/app/(app)/execucao/obras/[obraId]/page.tsx`: `notFound()` sem `execucao.obras/ver`, com id inválido (`idSchema`) ou sem pasta (`pastaDaObra` nulo, o que inclui "fora da lista"). Carrega em paralelo `pastaDaObra`, `locaisDaObra`, os cronogramas da obra (`ex_v_cronogramas` com `.eq("obra_id", obraId)`, pela query `listarCronogramas({ obraId })` da Task 13; até lá, leia direto no `queries.ts` desta task e mova depois) e, se `execucao.cronogramas/editar`, `usuariosDaObra` e `calendariosModelo`. Layout (desktop, uma coluna, seções com `SecaoDetalhe`):
1. `PageHeader` com `voltarPara={{ rota: "/execucao/obras", rotulo: "Obras" }}`, título = nome da obra, selo com o tipo, ação "Configurar obra" (abre `ConfigurarObraDrawer`, só com `editar`).
2. **Cronogramas**: `DataTable` com código (mono), nome, situação (`StatusBadge` com `ROTULO_STATUS_CRONOGRAMA`), início e término previstos, atividades, críticas; clique na linha vai para `/execucao/cronogramas/[id]`.
3. **Locais**: `LocaisTabela` = `DataTable` em árvore (`subLinhas`, montada de `paiId`), colunas código, nome, tipo, km (só rodovia), lado e faixa (só rodovia); botão "Novo local" e menu "⋮" da linha com Editar e Excluir (`ConfirmDialog` com `exigeMotivo`), conforme as permissões; `LocalDrawer` com os campos do `localSchema` (pai = `Combobox` com os locais da obra, menos o próprio e os descendentes).
4. **Acesso** (só com `editar`): `AcessoObra`, lista dos usuários ativos com um `Switch` "Na lista" por linha; ligar e desligar chama `definirAcesso`; o erro do banco ("A obra não pode ficar sem ninguém na lista") vira `toast.erro` e o switch volta.

`ConfigurarObraDrawer`: tipo da obra, calendário padrão da obra (modelos), km inicial e final (só se rodovia), metros por estaca, PPC mínimo (%), observações; salvar chama `configurarObra`.

- [ ] **Step 8: Teste de página**

`src/app/(app)/execucao/obras/page.test.tsx`, no molde de `src/app/(app)/medicao/contratos/page.test.tsx`: sem `execucao.obras/ver` chama `notFound`; com `ver` e sem `criar` não renderiza o botão "Novo cronograma" e não chama `obrasDisponiveis`.

Run: `npx vitest run src/modules/execucao src/app/\(app\)/execucao`. Expected: PASS.

- [ ] **Step 9: tsc, lint e commit**

```bash
npx tsc --noEmit && npm run lint
git add src/modules/execucao/obras "src/app/(app)/execucao/obras"
git commit -m "Execução F1a: pastas por obra, novo cronograma, locais, acesso e configuração da obra"
```

---

### Task 11: Modelos (biblioteca de serviços e calendários)

**Files:**
- Create: `src/modules/execucao/modelos/schemas.ts`, `schemas.test.ts`, `actions.ts`, `actions.test.ts`, `queries.ts`
- Create: `src/modules/execucao/modelos/components/servicos-tabela.tsx`, `servico-drawer.tsx`, `calendarios-tabela.tsx`, `calendario-drawer.tsx`, `excecoes-calendario.tsx`
- Create: `src/app/(app)/execucao/modelos/page.tsx`, `loading.tsx`, `page.test.tsx`

**Interfaces:**
- Consumes: `fn_ex_servico_salvar`, `fn_ex_calendario_salvar`, `fn_ex_calendario_excecao_salvar`, `fn_ex_calendario_excecao_excluir` (Task 4).
- Produces:
  - `servicoSchema`, `calendarioSchema`, `excecaoSchema` e os `payloadDo*`.
  - Actions: `salvarServico(id | null, dados)`, `salvarCalendario(id | null, dados)`, `salvarExcecao(calendarioId, dados)`, `excluirExcecao(calendarioId, data)`, `salvarFeriado(id | null, dados)`, `excluirFeriado(id)`. Retornos no mesmo formato da Task 10.
  - `feriadoSchema` (`data`, `nome`, `abrangencia`, `municipio` obrigatório só em municipal) e `payloadDoFeriado`.
  - Query `listarFeriados(ano?: number): Promise<Feriado[]>` (todos os anos se ausente, ordem por data).
  - Queries: `listarServicos(): Promise<Servico[]>` (com `unidadeSigla`), `listarCalendarios(): Promise<Calendario[]>` (só modelos), `calendarioPorId(id): Promise<Calendario | null>`, `excecoesDoCalendario(id): Promise<Excecao[]>`, `unidadesMedida(): Promise<{ id: string; sigla: string; nome: string }[]>`.
  - `CalendarioDrawer` aceita `calendario: Calendario | null` e `excecoes: Excecao[]`, e serve tanto aos modelos quanto ao calendário próprio de um cronograma (sem o campo "Padrão da empresa" quando `calendario.modelo` é falso).
  - Estas queries também servem à grade (Task 13): `listarServicos` e `unidadesMedida` alimentam as listas das colunas Serviço e Unidade.

- [ ] **Step 1: Testes dos schemas (falham)**

`src/modules/execucao/modelos/schemas.test.ts`:

```ts
import { describe, expect, it } from "vitest";

import { calendarioSchema, excecaoSchema, payloadDoCalendario, servicoSchema } from "@/modules/execucao/modelos/schemas";

describe("calendarioSchema", () => {
  it("horas com vírgula viram número do banco; sem nenhuma hora na semana é recusado", () => {
    const base = { nome: "Padrão", horasSeg: "9", horasTer: "9", horasQua: "9", horasQui: "9", horasSex: "9", horasSab: "5", horasDom: "",
      feriadosAbrangencia: ["nacional", "AC"], municipio: "", padraoEmpresa: false };
    const ok = calendarioSchema.parse(base);
    expect(payloadDoCalendario(ok)).toMatchObject({ horas_sab: "5", horas_dom: "0", feriados_abrangencia: ["nacional", "AC"] });
    expect(calendarioSchema.safeParse({ ...base, horasSeg: "", horasTer: "", horasQua: "", horasQui: "", horasSex: "", horasSab: "" }).success).toBe(false);
  });
  it("período chuvoso: início e fim juntos", () => {
    const base = { nome: "Chuva", horasSeg: "8", feriadosAbrangencia: [], padraoEmpresa: false };
    expect(calendarioSchema.safeParse({ ...base, chuvosoInicioMes: 11 }).success).toBe(false);
    expect(calendarioSchema.safeParse({ ...base, chuvosoInicioMes: 11, chuvosoFimMes: 4 }).success).toBe(true);
  });
});

describe("excecaoSchema", () => {
  it("horas de 0 a 24 e descrição obrigatória", () => {
    expect(excecaoSchema.safeParse({ data: "2026-12-24", horas: "4", tipo: "extra", descricao: "Véspera" }).success).toBe(true);
    expect(excecaoSchema.safeParse({ data: "2026-12-24", horas: "25", tipo: "extra", descricao: "X" }).success).toBe(false);
    expect(excecaoSchema.safeParse({ data: "2026-12-24", horas: "0", tipo: "paralisacao", descricao: " " }).success).toBe(false);
  });
});

describe("servicoSchema", () => {
  it("produtividade com vírgula", () => {
    expect(servicoSchema.parse({ codigo: "EST-01", nome: "Estaca escavada", produtividadePadrao: "12,5", ceuAberto: true, ativo: true })
      .produtividadePadrao).toBe("12.5");
  });
});
```

Run: FAIL.

- [ ] **Step 2: Implementar os schemas**

`src/modules/execucao/modelos/schemas.ts`:

```ts
import { z } from "zod";

import { idSchema } from "@/lib/id";
import { lerNumeroColado } from "@/modules/execucao/_shared/numero";

const numero = (casas = 4) =>
  z
    .string()
    .optional()
    .transform((t, ctx) => {
      const lido = lerNumeroColado(t ?? "", casas);
      if (!lido.ok) {
        ctx.addIssue({ code: "custom", message: lido.erro });
        return z.NEVER;
      }
      return lido.valor;
    });
const horas = numero(2).refine((h) => h === null || (Number(h) >= 0 && Number(h) <= 24), "Horas de 0 a 24");

export const servicoSchema = z.object({
  codigo: z.string().trim().min(1, "Informe o código").max(30),
  nome: z.string().trim().min(2, "Informe o nome").max(200),
  unidadeId: idSchema.optional(),
  produtividadePadrao: numero().refine((p) => p === null || Number(p) > 0, "Produtividade maior que zero"),
  ceuAberto: z.boolean(),
  ativo: z.boolean(),
  observacoes: z.string().trim().max(2000).optional(),
});
export type ServicoInput = z.input<typeof servicoSchema>;
export function payloadDoServico(d: z.output<typeof servicoSchema>) {
  return {
    codigo: d.codigo,
    nome: d.nome,
    unidade_id: d.unidadeId ?? null,
    produtividade_padrao: d.produtividadePadrao,
    ceu_aberto: d.ceuAberto,
    ativo: d.ativo,
    observacoes: d.observacoes || null,
  };
}

const DIAS = ["horasSeg", "horasTer", "horasQua", "horasQui", "horasSex", "horasSab", "horasDom"] as const;

export const calendarioSchema = z
  .object({
    nome: z.string().trim().min(2, "Informe o nome").max(120),
    horasSeg: horas, horasTer: horas, horasQua: horas, horasQui: horas, horasSex: horas, horasSab: horas, horasDom: horas,
    feriadosAbrangencia: z.array(z.enum(["nacional", "AC", "municipal"])),
    municipio: z.string().trim().max(120).optional(),
    chuvosoInicioMes: z.number().int().min(1).max(12).optional(),
    chuvosoFimMes: z.number().int().min(1).max(12).optional(),
    padraoEmpresa: z.boolean(),
    observacoes: z.string().trim().max(2000).optional(),
  })
  .refine((d) => DIAS.some((dia) => Number(d[dia] ?? 0) > 0), { message: "Ao menos um dia da semana precisa ter horas", path: ["horasSeg"] })
  .refine((d) => (d.chuvosoInicioMes === undefined) === (d.chuvosoFimMes === undefined), {
    message: "Informe início e fim do período chuvoso juntos",
    path: ["chuvosoFimMes"],
  })
  .refine((d) => !d.feriadosAbrangencia.includes("municipal") || (d.municipio ?? "") !== "", {
    message: "Informe o município para usar feriados municipais",
    path: ["municipio"],
  });
export type CalendarioInput = z.input<typeof calendarioSchema>;
export function payloadDoCalendario(d: z.output<typeof calendarioSchema>) {
  return {
    nome: d.nome,
    horas_seg: d.horasSeg ?? "0", horas_ter: d.horasTer ?? "0", horas_qua: d.horasQua ?? "0", horas_qui: d.horasQui ?? "0",
    horas_sex: d.horasSex ?? "0", horas_sab: d.horasSab ?? "0", horas_dom: d.horasDom ?? "0",
    feriados_abrangencia: d.feriadosAbrangencia,
    municipio: d.municipio || null,
    chuvoso_inicio_mes: d.chuvosoInicioMes ?? null,
    chuvoso_fim_mes: d.chuvosoFimMes ?? null,
    padrao_empresa: d.padraoEmpresa,
    observacoes: d.observacoes || null,
  };
}

export const excecaoSchema = z.object({
  data: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Data inválida"),
  horas: horas.refine((h) => h !== null, "Informe as horas (0 para dia parado)"),
  tipo: z.enum(["feriado", "paralisacao", "extra"]),
  descricao: z.string().trim().min(1, "Descreva a exceção").max(200),
});
export type ExcecaoInput = z.input<typeof excecaoSchema>;
```

Run: PASS.

- [ ] **Step 3: Actions, com teste (falha, depois passa)**

`src/modules/execucao/modelos/actions.test.ts`: mesmo molde da Task 10. Casos:
1. `salvarServico(null, dados)` sem `execucao.modelos/criar` → `{ erro: "Sem permissão para cadastrar serviço" }` e nenhuma chamada.
2. `salvarCalendario(null, dados)` chama `fn_ex_calendario_salvar` sem `p_id` e com `p_dados.horas_sab = "5"`.
3. `salvarExcecao(ID, { data: "2026-12-24", horas: "4", tipo: "extra", descricao: "Véspera" })` chama `fn_ex_calendario_excecao_salvar` com `{ p_cal: ID, p_data: "2026-12-24", p_horas: "4", p_tipo: "extra", p_descricao: "Véspera" }`.
4. `excluirExcecao(ID, "2026-13-01")` → `{ erro: "Dados inválidos" }` sem chamada.
5. `salvarFeriado(null, { data: "2026-12-24", nome: "Véspera de Natal", abrangencia: "nacional" })` chama `fn_ex_feriado_salvar` com `p_dados = { data: "2026-12-24", nome: "Véspera de Natal", abrangencia: "nacional", municipio: null }`; sem `execucao.modelos/criar` → `{ erro: "Sem permissão para cadastrar feriado" }`.
6. `salvarFeriado(null, { data: "2026-06-01", nome: "Aniversário", abrangencia: "municipal" })` (sem município) → erro do schema "Informe o município", sem chamada.

`src/modules/execucao/modelos/actions.ts`: mesmo molde de `obras/actions.ts`, com `RECURSO = "execucao.modelos"` para serviço e para **criar** calendário. Editar calendário e mexer em exceção podem ser do calendário próprio de um cronograma (aí a permissão é `execucao.cronogramas/editar`): a action confere `execucao.modelos/editar` **ou** `execucao.cronogramas/editar` (passa se tiver uma das duas) e deixa a decisão final com o banco (`fn_ex_exigir_calendario`), que sabe se o calendário é modelo ou de cronograma. Revalida `/execucao/modelos` e `/execucao/cronogramas`.

Run: `npx vitest run src/modules/execucao/modelos`. Expected: PASS.

- [ ] **Step 4: Queries**

`src/modules/execucao/modelos/queries.ts` (`import "server-only"`):
- `listarServicos()`: `ex_servicos` com `unidades_medida(sigla)` no select (`select("*, unidades_medida(sigla)")`), ordenado por código.
- `listarCalendarios()`: `ex_calendarios` com `modelo = true` e `excluido_em is null`.
- `calendarioPorId(id)`: um calendário qualquer (modelo ou de cronograma), para o drawer de calendário aberto a partir do cronograma (Task 13).
- `excecoesDoCalendario(id)`: `ex_calendario_excecoes` do calendário **e** do pai (o pai em leitura, marcado `herdada: true`, para a tela mostrar "vem do calendário X").
- `unidadesMedida()`: `unidades_medida` ativas, `id, sigla, nome`, ordenado por sigla (a policy da Task 6 deixa ler).

- [ ] **Step 5: Tela**

`src/app/(app)/execucao/modelos/page.tsx`: `notFound()` sem `execucao.modelos/ver`. Duas seções (`SecaoDetalhe`):
1. **Serviços**: `ServicosTabela` (`DataTable`: código mono, nome, unidade, produtividade padrão com `formatarQuantidade`, "Céu aberto" Sim/Não, situação Ativo/Inativo) + "Novo serviço" e Editar no "⋮" (`ServicoDrawer`, campos do `servicoSchema`, unidade em `Combobox`). Sem serviço: `EmptyState` "Nenhum serviço na biblioteca" com a ação.
2. **Calendários**: `CalendariosTabela` (nome, horas da semana em texto curto "seg a sex 9 h, sáb 5 h", feriados "Nacionais e AC", selo "Padrão da empresa") + "Novo calendário" e Editar (`CalendarioDrawer`: nome, sete campos de horas lado a lado com `InputHoras`, caixas Nacionais / Acre / Municipais, município, período chuvoso com dois selects de mês, "Padrão da empresa"). Dentro do drawer de um calendário salvo, `ExcecoesCalendario`: tabela de exceções (data, horas, tipo, descrição, "herdada de <nome>" quando vem do pai) + formulário em linha "Nova exceção" e excluir por linha.

3. **Feriados** (decisão do Tiago, 09/10/2026: ele diz no app o que é feriado): `FeriadosTabela` com filtro por ano (padrão o ano corrente), colunas data (`formatarData` + dia da semana), nome, abrangência (Nacional, Acre, Municipal: <município>); "Novo feriado", Editar e Excluir (`ConfirmDialog`, sem motivo: a trilha fica no `audit_log`) conforme `execucao.modelos`. Ajuda da seção: "Feriado vale para todos os cronogramas cujo calendário usa essa abrangência, e as datas são recalculadas ao salvar. Para trabalhar num feriado em um cronograma só, use uma exceção no calendário dele com as horas do dia."

Texto de ajuda no topo da seção Calendários: "Cada cronograma tem o próprio calendário, criado a partir de um destes. Mudar um modelo recalcula as datas de todos os cronogramas que vêm dele."

`page.test.tsx`: sem `ver` → `notFound`; com `ver` e sem `criar` → sem os botões "Novo serviço", "Novo calendário" e "Novo feriado".

- [ ] **Step 6: tsc, lint, testes e commit**

```bash
npx tsc --noEmit && npm run lint && npx vitest run src/modules/execucao "src/app/(app)/execucao"
git add src/modules/execucao/modelos "src/app/(app)/execucao/modelos"
git commit -m "Execução F1a: biblioteca de serviços e calendários com exceções"
```

---

### Task 12: Canônico `GradeEdicao` (grade estilo planilha)

**Por que canônico novo, e não evolução do `DataTable`:** o `DataTable` é tabela de leitura (filtro, paginação, cartões no celular, colunas personalizáveis); edição célula a célula com teclado, colar bloco e linhas virtuais muda o contrato inteiro dele. A regra 9 do CLAUDE.md proíbe duplicar um canônico que resolve o caso; aqui nenhum resolve, então nasce um canônico (em `components/canonicos`, exportado no `index.ts`), não um componente de tela. Registrar isso em `docs/decisoes.md` na Task 14.

**Files:**
- Create: `src/components/canonicos/grade-edicao-teclado.ts`, `grade-edicao-teclado.test.ts`
- Create: `src/components/canonicos/grade-edicao.tsx`, `grade-edicao.test.tsx`
- Modify: `src/components/canonicos/index.ts` (exportar `GradeEdicao`, `type ColunaGrade`, `type MudancaCelula`)

**Interfaces:**
- Produces:

```ts
export type PosicaoCelula = { linha: number; coluna: number };
export type AcaoTeclado =
  | { tipo: "mover"; para: PosicaoCelula }
  | { tipo: "editar"; manterTexto: boolean; textoInicial?: string }
  | { tipo: "confirmar"; depois: PosicaoCelula }
  | { tipo: "cancelar" }
  | { tipo: "limpar" }
  | { tipo: "atalho"; atalho: AtalhoGrade }
  | { tipo: "nada" };
export type AtalhoGrade = "recuar" | "avancar" | "acima" | "abaixo" | "inserir" | "excluir";
export function acaoDaTecla(
  evento: { key: string; shiftKey: boolean; altKey: boolean; ctrlKey: boolean; metaKey: boolean },
  estado: { posicao: PosicaoCelula; editando: boolean; nLinhas: number; nColunas: number },
): AcaoTeclado;

export interface ColunaGrade<T> {
  id: string;
  titulo: string;
  largura: number;
  direita?: boolean;
  mono?: boolean;
  exibir: (linha: T) => React.ReactNode;
  /** Ausente = só leitura. `opcoes` vira lista no editor. */
  editar?: { texto: (linha: T) => string; opcoes?: { valor: string; rotulo: string }[]; podeEditar?: (linha: T) => boolean };
  recuo?: (linha: T) => number;
}
export type MudancaCelula = { idLinha: string; idColuna: string; texto: string };
export interface GradeEdicaoProps<T> {
  linhas: readonly T[];
  colunas: readonly ColunaGrade<T>[];
  idDaLinha: (linha: T) => string;
  onEditar: (mudancas: MudancaCelula[]) => void;
  onColarAlem?: (bloco: string[][], idColunaInicial: string) => void;
  onAtalho?: (atalho: AtalhoGrade, idLinha: string) => void;
  selecionadas: ReadonlySet<string>;
  onSelecionadasChange: (ids: Set<string>) => void;
  classeDaLinha?: (linha: T) => string | undefined;
  somenteLeitura?: boolean;
  alturaLinha?: number;      // padrão 32
  alturaInicial?: number;    // padrão 600; usado também no jsdom (initialRect do virtualizer)
  rotulo: string;            // aria-label da grade
}
```

**Comportamento (o teste cobre cada linha):**
- Setas movem a célula ativa. Tab vai para a direita (Shift+Tab para a esquerda), passando para a linha seguinte no fim. Enter confirma a edição e desce (Shift+Enter sobe); fora da edição, Enter começa a editar.
- Digitar um caractere começa a editar **substituindo** o texto; F2 começa a editar **mantendo** o texto. Esc cancela. Delete/Backspace fora da edição limpa a célula (`texto: ""`).
- Ctrl/Cmd+V cola o bloco (`lerBlocoColado` da Task 9, movido para `src/lib/bloco-colado.ts` nesta task, porque agora é usado por um canônico; `cronogramas/colar.ts` passa a reexportar de lá) a partir da célula ativa, só nas colunas editáveis; o que passa da última linha vai para `onColarAlem`. Ctrl/Cmd+C copia a célula ativa (ou as linhas selecionadas inteiras) como texto com tabulação.
- Linhas selecionadas (caixa na primeira coluna, Shift+clique para faixa): editar uma célula de uma linha selecionada aplica o mesmo texto a **todas** as selecionadas (uma `MudancaCelula` por linha).
- Atalhos: Alt+Shift+→ recuar, Alt+Shift+← avançar, Alt+Shift+↑/↓ mover, Ctrl/Cmd+Enter inserir abaixo, Ctrl/Cmd+Delete excluir. Só emitem `onAtalho`; quem decide é a tela.
- Virtualização de linhas com `@tanstack/react-virtual` (já no projeto); cabeçalho fixo; primeira coluna (nº da linha) fixa à esquerda. Foco com `foco-anel-dentro`. `role="grid"`, `aria-rowcount`, `aria-colcount`, célula ativa com `aria-selected`.

- [ ] **Step 1: Testes do teclado (falham)**

`src/components/canonicos/grade-edicao-teclado.test.ts`:

```ts
import { describe, expect, it } from "vitest";

import { acaoDaTecla } from "@/components/canonicos/grade-edicao-teclado";

const tecla = (key: string, m: Partial<{ shiftKey: boolean; altKey: boolean; ctrlKey: boolean; metaKey: boolean }> = {}) => ({
  key, shiftKey: false, altKey: false, ctrlKey: false, metaKey: false, ...m,
});
const fora = { posicao: { linha: 1, coluna: 1 }, editando: false, nLinhas: 3, nColunas: 3 };
const dentro = { ...fora, editando: true };

describe("acaoDaTecla", () => {
  it("setas movem e param na borda", () => {
    expect(acaoDaTecla(tecla("ArrowDown"), fora)).toEqual({ tipo: "mover", para: { linha: 2, coluna: 1 } });
    expect(acaoDaTecla(tecla("ArrowUp"), { ...fora, posicao: { linha: 0, coluna: 1 } })).toEqual({ tipo: "mover", para: { linha: 0, coluna: 1 } });
  });
  it("Tab no fim da linha vai para o começo da próxima; Shift+Tab volta", () => {
    expect(acaoDaTecla(tecla("Tab"), { ...fora, posicao: { linha: 1, coluna: 2 } })).toEqual({ tipo: "mover", para: { linha: 2, coluna: 0 } });
    expect(acaoDaTecla(tecla("Tab", { shiftKey: true }), { ...fora, posicao: { linha: 1, coluna: 0 } })).toEqual({ tipo: "mover", para: { linha: 0, coluna: 2 } });
  });
  it("Enter: fora edita, dentro confirma e desce; Shift+Enter sobe", () => {
    expect(acaoDaTecla(tecla("Enter"), fora)).toEqual({ tipo: "editar", manterTexto: true });
    expect(acaoDaTecla(tecla("Enter"), dentro)).toEqual({ tipo: "confirmar", depois: { linha: 2, coluna: 1 } });
    expect(acaoDaTecla(tecla("Enter", { shiftKey: true }), dentro)).toEqual({ tipo: "confirmar", depois: { linha: 0, coluna: 1 } });
  });
  it("Tab dentro da edição confirma e anda", () => {
    expect(acaoDaTecla(tecla("Tab"), dentro)).toEqual({ tipo: "confirmar", depois: { linha: 1, coluna: 2 } });
  });
  it("caractere começa a editar substituindo; F2 mantém; Esc cancela; Delete limpa", () => {
    expect(acaoDaTecla(tecla("7"), fora)).toEqual({ tipo: "editar", manterTexto: false, textoInicial: "7" });
    expect(acaoDaTecla(tecla("F2"), fora)).toEqual({ tipo: "editar", manterTexto: true });
    expect(acaoDaTecla(tecla("Escape"), dentro)).toEqual({ tipo: "cancelar" });
    expect(acaoDaTecla(tecla("Delete"), fora)).toEqual({ tipo: "limpar" });
  });
  it("dentro da edição, setas e caracteres são do campo", () => {
    expect(acaoDaTecla(tecla("ArrowLeft"), dentro)).toEqual({ tipo: "nada" });
    expect(acaoDaTecla(tecla("a"), dentro)).toEqual({ tipo: "nada" });
  });
  it("atalhos de árvore", () => {
    expect(acaoDaTecla(tecla("ArrowRight", { altKey: true, shiftKey: true }), fora)).toEqual({ tipo: "atalho", atalho: "recuar" });
    expect(acaoDaTecla(tecla("ArrowLeft", { altKey: true, shiftKey: true }), fora)).toEqual({ tipo: "atalho", atalho: "avancar" });
    expect(acaoDaTecla(tecla("ArrowUp", { altKey: true, shiftKey: true }), fora)).toEqual({ tipo: "atalho", atalho: "acima" });
    expect(acaoDaTecla(tecla("Enter", { ctrlKey: true }), fora)).toEqual({ tipo: "atalho", atalho: "inserir" });
    expect(acaoDaTecla(tecla("Delete", { metaKey: true }), fora)).toEqual({ tipo: "atalho", atalho: "excluir" });
  });
  it("Ctrl+C e Ctrl+V não são tratados aqui (eventos copy/paste)", () => {
    expect(acaoDaTecla(tecla("v", { ctrlKey: true }), fora)).toEqual({ tipo: "nada" });
  });
});
```

Run: FAIL.

- [ ] **Step 2: Implementar o teclado**

`src/components/canonicos/grade-edicao-teclado.ts`:

```ts
/**
 * Teclado da GradeEdicao, sem React: recebe a tecla e o estado, devolve o que fazer. Copiar e colar
 * NÃO passam por aqui: vêm dos eventos copy/paste do navegador, que trazem a área de transferência.
 */
export type PosicaoCelula = { linha: number; coluna: number };
export type AtalhoGrade = "recuar" | "avancar" | "acima" | "abaixo" | "inserir" | "excluir";
export type AcaoTeclado =
  | { tipo: "mover"; para: PosicaoCelula }
  | { tipo: "editar"; manterTexto: boolean; textoInicial?: string }
  | { tipo: "confirmar"; depois: PosicaoCelula }
  | { tipo: "cancelar" }
  | { tipo: "limpar" }
  | { tipo: "atalho"; atalho: AtalhoGrade }
  | { tipo: "nada" };

type Evento = { key: string; shiftKey: boolean; altKey: boolean; ctrlKey: boolean; metaKey: boolean };
type Estado = { posicao: PosicaoCelula; editando: boolean; nLinhas: number; nColunas: number };

const limitar = (n: number, max: number) => Math.max(0, Math.min(n, max - 1));

function andarTab(p: PosicaoCelula, voltar: boolean, nLinhas: number, nColunas: number): PosicaoCelula {
  let { linha, coluna } = p;
  coluna += voltar ? -1 : 1;
  if (coluna >= nColunas) { coluna = 0; linha += 1; }
  if (coluna < 0) { coluna = nColunas - 1; linha -= 1; }
  if (linha < 0 || linha >= nLinhas) return p;
  return { linha, coluna };
}

export function acaoDaTecla(e: Evento, s: Estado): AcaoTeclado {
  const mod = e.ctrlKey || e.metaKey;
  const { linha, coluna } = s.posicao;

  if (e.altKey && e.shiftKey && !s.editando) {
    const mapa: Record<string, AtalhoGrade> = { ArrowRight: "recuar", ArrowLeft: "avancar", ArrowUp: "acima", ArrowDown: "abaixo" };
    if (mapa[e.key]) return { tipo: "atalho", atalho: mapa[e.key] };
  }
  if (mod && e.key === "Enter" && !s.editando) return { tipo: "atalho", atalho: "inserir" };
  if (mod && (e.key === "Delete" || e.key === "Backspace") && !s.editando) return { tipo: "atalho", atalho: "excluir" };

  if (s.editando) {
    if (e.key === "Escape") return { tipo: "cancelar" };
    if (e.key === "Enter") return { tipo: "confirmar", depois: { linha: limitar(linha + (e.shiftKey ? -1 : 1), s.nLinhas), coluna } };
    if (e.key === "Tab") return { tipo: "confirmar", depois: andarTab(s.posicao, e.shiftKey, s.nLinhas, s.nColunas) };
    return { tipo: "nada" };
  }

  switch (e.key) {
    case "ArrowDown": return { tipo: "mover", para: { linha: limitar(linha + 1, s.nLinhas), coluna } };
    case "ArrowUp": return { tipo: "mover", para: { linha: limitar(linha - 1, s.nLinhas), coluna } };
    case "ArrowRight": return { tipo: "mover", para: { linha, coluna: limitar(coluna + 1, s.nColunas) } };
    case "ArrowLeft": return { tipo: "mover", para: { linha, coluna: limitar(coluna - 1, s.nColunas) } };
    case "Tab": return { tipo: "mover", para: andarTab(s.posicao, e.shiftKey, s.nLinhas, s.nColunas) };
    case "Enter":
    case "F2": return { tipo: "editar", manterTexto: true };
    case "Delete":
    case "Backspace": return { tipo: "limpar" };
  }
  if (!mod && !e.altKey && e.key.length === 1) return { tipo: "editar", manterTexto: false, textoInicial: e.key };
  return { tipo: "nada" };
}
```

Run: PASS.

- [ ] **Step 3: Mover o leitor de bloco para `src/lib`**

`git mv src/modules/execucao/cronogramas/colar.ts src/lib/bloco-colado.ts` e o teste junto (`src/lib/bloco-colado.test.ts`, import ajustado). Crie `src/modules/execucao/cronogramas/colar.ts` com uma linha: `export { lerBlocoColado } from "@/lib/bloco-colado";`. Rode `npx vitest run src/lib/bloco-colado.test.ts`: PASS.

- [ ] **Step 4: Testes do componente (falham)**

`src/components/canonicos/grade-edicao.test.tsx` (`@vitest-environment jsdom`, `@testing-library/react` + `user-event` se o projeto já usa; senão `fireEvent`):

```tsx
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { GradeEdicao, type ColunaGrade } from "@/components/canonicos";

type L = { id: string; codigo: string; nome: string; dur: string };
const linhas: L[] = [
  { id: "a", codigo: "1", nome: "Fundação", dur: "0" },
  { id: "b", codigo: "1.1", nome: "Estacas", dur: "4" },
];
const colunas: ColunaGrade<L>[] = [
  { id: "codigo", titulo: "Código", largura: 80, exibir: (l) => l.codigo, editar: { texto: (l) => l.codigo } },
  { id: "nome", titulo: "Nome", largura: 200, exibir: (l) => l.nome, editar: { texto: (l) => l.nome } },
  { id: "inicio", titulo: "Início", largura: 100, exibir: () => "02/03/2026" },
  { id: "dur", titulo: "Duração", largura: 80, direita: true, exibir: (l) => l.dur, editar: { texto: (l) => l.dur } },
];

function montar(extra: Partial<React.ComponentProps<typeof GradeEdicao<L>>> = {}) {
  const onEditar = vi.fn();
  const onColarAlem = vi.fn();
  render(
    <GradeEdicao<L> rotulo="Cronograma" linhas={linhas} colunas={colunas} idDaLinha={(l) => l.id}
      onEditar={onEditar} onColarAlem={onColarAlem} selecionadas={new Set()} onSelecionadasChange={() => {}} {...extra} />,
  );
  return { onEditar, onColarAlem, grade: screen.getByRole("grid", { name: "Cronograma" }) };
}

describe("GradeEdicao", () => {
  it("digitar e Enter emite a mudança da célula", () => {
    const { onEditar } = montar();
    fireEvent.click(screen.getByText("Estacas"));
    fireEvent.keyDown(screen.getByRole("grid"), { key: "E" });
    const campo = screen.getByRole("textbox", { name: "Nome, linha 2" });
    fireEvent.change(campo, { target: { value: "Estacas raiz" } });
    fireEvent.keyDown(campo, { key: "Enter" });
    expect(onEditar).toHaveBeenCalledWith([{ idLinha: "b", idColuna: "nome", texto: "Estacas raiz" }]);
  });

  it("coluna só leitura não abre editor", () => {
    montar();
    fireEvent.click(screen.getAllByText("02/03/2026")[0]);
    fireEvent.keyDown(screen.getByRole("grid"), { key: "F2" });
    expect(screen.queryByRole("textbox")).toBeNull();
  });

  it("colar bloco a partir da célula ativa pula a coluna só leitura e manda o excedente para onColarAlem", () => {
    const { onEditar, onColarAlem } = montar();
    fireEvent.click(screen.getByText("Fundação"));
    fireEvent.paste(screen.getByRole("grid"), { clipboardData: { getData: () => "Base\t5\nEstacas\t6\nBlocos\t7\n" } });
    expect(onEditar).toHaveBeenCalledWith([
      { idLinha: "a", idColuna: "nome", texto: "Base" },
      { idLinha: "a", idColuna: "dur", texto: "5" },
      { idLinha: "b", idColuna: "nome", texto: "Estacas" },
      { idLinha: "b", idColuna: "dur", texto: "6" },
    ]);
    expect(onColarAlem).toHaveBeenCalledWith([["Blocos", "7"]], "nome");
  });

  it("com linhas selecionadas, a edição vale para todas", () => {
    const { onEditar } = montar({ selecionadas: new Set(["a", "b"]) });
    fireEvent.click(screen.getByText("4"));
    fireEvent.keyDown(screen.getByRole("grid"), { key: "9" });
    fireEvent.keyDown(screen.getByRole("textbox", { name: "Duração, linha 2" }), { key: "Enter" });
    expect(onEditar).toHaveBeenCalledWith([
      { idLinha: "a", idColuna: "dur", texto: "9" },
      { idLinha: "b", idColuna: "dur", texto: "9" },
    ]);
  });

  it("somente leitura não edita nem cola", () => {
    const { onEditar } = montar({ somenteLeitura: true });
    fireEvent.click(screen.getByText("Estacas"));
    fireEvent.keyDown(screen.getByRole("grid"), { key: "x" });
    fireEvent.paste(screen.getByRole("grid"), { clipboardData: { getData: () => "y" } });
    expect(onEditar).not.toHaveBeenCalled();
  });
});
```

Nota sobre a colagem: o bloco "Base\t5" colado a partir de "Nome" ocupa Nome e a **próxima coluna editável** (Duração), pulando Início, que é só leitura. É assim que o Excel não faz, mas é o que evita perder o número da duração numa coluna que ninguém edita. A grade conta só colunas editáveis ao distribuir o bloco.

Run: FAIL.

- [ ] **Step 5: Implementar o componente**

`src/components/canonicos/grade-edicao.tsx` (`"use client"`), com esta estrutura:

```tsx
"use client";

import * as React from "react";
import { useVirtualizer } from "@tanstack/react-virtual";

import { lerBlocoColado } from "@/lib/bloco-colado";
import { cn } from "@/lib/utils";
import { acaoDaTecla, type AtalhoGrade, type PosicaoCelula } from "@/components/canonicos/grade-edicao-teclado";

// (interfaces ColunaGrade, MudancaCelula e GradeEdicaoProps exatamente como em "Interfaces" acima)

export function GradeEdicao<T>(props: GradeEdicaoProps<T>) {
  const { linhas, colunas, idDaLinha, onEditar, onColarAlem, onAtalho, selecionadas, onSelecionadasChange,
    classeDaLinha, somenteLeitura = false, alturaLinha = 32, alturaInicial = 600, rotulo } = props;
  const [ativa, setAtiva] = React.useState<PosicaoCelula>({ linha: 0, coluna: 0 });
  const [edicao, setEdicao] = React.useState<{ texto: string } | null>(null);
  const [ancora, setAncora] = React.useState<number | null>(null);
  const rolagem = React.useRef<HTMLDivElement>(null);
  const grade = React.useRef<HTMLDivElement>(null);

  const virtual = useVirtualizer({
    count: linhas.length,
    getScrollElement: () => rolagem.current,
    estimateSize: () => alturaLinha,
    overscan: 12,
    initialRect: { width: 1200, height: alturaInicial },
  });

  const editavel = (linha: number, coluna: number) => {
    const c = colunas[coluna];
    const l = linhas[linha];
    return !somenteLeitura && !!c?.editar && !!l && (c.editar.podeEditar?.(l) ?? true);
  };

  const alvos = (linha: number): string[] => {
    const id = idDaLinha(linhas[linha]);
    return selecionadas.size > 1 && selecionadas.has(id) ? linhas.map(idDaLinha).filter((x) => selecionadas.has(x)) : [id];
  };

  const confirmar = (texto: string) => {
    const coluna = colunas[ativa.coluna];
    onEditar(alvos(ativa.linha).map((idLinha) => ({ idLinha, idColuna: coluna.id, texto })));
    setEdicao(null);
  };

  const aoTeclar = (e: React.KeyboardEvent) => {
    const acao = acaoDaTecla(e, { posicao: ativa, editando: edicao !== null, nLinhas: linhas.length, nColunas: colunas.length });
    switch (acao.tipo) {
      case "nada": return;
      case "mover":
        e.preventDefault(); setAtiva(acao.para); virtual.scrollToIndex(acao.para.linha); return;
      case "editar":
        if (!editavel(ativa.linha, ativa.coluna)) return;
        e.preventDefault();
        setEdicao({ texto: acao.manterTexto ? colunas[ativa.coluna].editar!.texto(linhas[ativa.linha]) : (acao.textoInicial ?? "") });
        return;
      case "confirmar":
        e.preventDefault(); confirmar(edicao?.texto ?? ""); setAtiva(acao.depois); grade.current?.focus(); return;
      case "cancelar":
        e.preventDefault(); setEdicao(null); grade.current?.focus(); return;
      case "limpar":
        if (!editavel(ativa.linha, ativa.coluna)) return;
        e.preventDefault(); confirmar(""); return;
      case "atalho":
        e.preventDefault(); if (!somenteLeitura && linhas[ativa.linha]) onAtalho?.(acao.atalho as AtalhoGrade, idDaLinha(linhas[ativa.linha])); return;
    }
  };

  const aoColar = (e: React.ClipboardEvent) => {
    if (somenteLeitura || edicao !== null) return;
    e.preventDefault();
    const bloco = lerBlocoColado(e.clipboardData.getData("text/plain") || e.clipboardData.getData("text"));
    const colunasEditaveis = colunas.map((c, i) => ({ c, i })).filter(({ c, i }) => c.editar && i >= ativa.coluna);
    const mudancas: MudancaCelula[] = [];
    const alem: string[][] = [];
    bloco.forEach((valores, k) => {
      const linha = linhas[ativa.linha + k];
      if (!linha) { alem.push(valores); return; }
      valores.forEach((texto, j) => {
        const destino = colunasEditaveis[j];
        if (destino && (destino.c.editar!.podeEditar?.(linha) ?? true)) {
          mudancas.push({ idLinha: idDaLinha(linha), idColuna: destino.c.id, texto });
        }
      });
    });
    if (mudancas.length) onEditar(mudancas);
    if (alem.length && colunasEditaveis[0]) onColarAlem?.(alem, colunasEditaveis[0].c.id);
  };

  const aoCopiar = (e: React.ClipboardEvent) => {
    if (edicao !== null) return;
    e.preventDefault();
    const ids = selecionadas.size ? linhas.filter((l) => selecionadas.has(idDaLinha(l))) : [linhas[ativa.linha]];
    const textoDa = (l: T, c: ColunaGrade<T>) => (c.editar ? c.editar.texto(l) : String(c.exibir(l) ?? ""));
    const texto = selecionadas.size
      ? ids.map((l) => colunas.map((c) => textoDa(l, c)).join("\t")).join("\n")
      : textoDa(linhas[ativa.linha], colunas[ativa.coluna]);
    e.clipboardData.setData("text/plain", texto);
  };

  // Seleção: clique na caixa da linha alterna; Shift+clique marca a faixa desde a última âncora.
  const alternar = (indice: number, faixa: boolean) => {
    const novo = new Set(selecionadas);
    if (faixa && ancora !== null) {
      const [de, ate] = [Math.min(ancora, indice), Math.max(ancora, indice)];
      for (let i = de; i <= ate; i++) novo.add(idDaLinha(linhas[i]));
    } else {
      const id = idDaLinha(linhas[indice]);
      if (novo.has(id)) novo.delete(id); else novo.add(id);
      setAncora(indice);
    }
    onSelecionadasChange(novo);
  };

  // Render: <div role="grid" aria-label={rotulo} tabIndex={0} ref={grade} onKeyDown={aoTeclar} onPaste={aoColar}
  //   onCopy={aoCopiar} className="foco-anel-dentro ...">; cabeçalho fixo (role="row" com role="columnheader");
  //   área rolável ref={rolagem} com altura alturaInicial e as linhas de virtual.getVirtualItems() posicionadas
  //   por transform; cada linha role="row" aria-rowindex, primeira célula fixa com o nº e a caixa de seleção,
  //   depois as células role="gridcell" (largura da coluna, tabular-nums e alinhamento à direita quando `direita`,
  //   font-mono quando `mono`, recuo de 16px por nível quando `recuo`), aria-selected na ativa e onClick que
  //   ativa a célula. Na célula ativa em edição, um <input aria-label={`${coluna.titulo}, linha ${n}`} autoFocus
  //   value={edicao.texto} onChange onKeyDown={(e) => { e.stopPropagation(); aoTeclar(e); }}> (ou <select>
  //   quando há `opcoes`; o stopPropagation impede a mesma tecla de chegar ao onKeyDown da grade e confirmar
  //   duas vezes); onBlur confirma.
  //   Célula ativa: contorno 2px na cor de --ring; linha selecionada: fundo bg-muted.
}
```

O trecho de render vai escrito por completo no arquivo, seguindo exatamente o comentário acima: ele descreve marcação e classes, não lógica nova. Mantenha a lógica toda nas funções acima, que são o que o teste exercita.

Run: `npx vitest run src/components/canonicos/grade-edicao`. Expected: PASS.

- [ ] **Step 6: Exportar e commit**

Em `src/components/canonicos/index.ts`: `export { GradeEdicao, type ColunaGrade, type MudancaCelula, type GradeEdicaoProps } from "./grade-edicao";` e `export type { AtalhoGrade } from "./grade-edicao-teclado";`.

```bash
npx tsc --noEmit && npm run lint
git add src/components/canonicos/grade-edicao* src/components/canonicos/index.ts src/lib/bloco-colado* src/modules/execucao/cronogramas/colar*
git commit -m "Canônico GradeEdicao: grade estilo planilha com teclado, colar bloco e edição em várias linhas"
```

---

### Task 13: Cronogramas (lista, grade e ações)

**Files:**
- Create: `src/modules/execucao/cronogramas/edicao.ts`, `edicao.test.ts`
- Create: `src/modules/execucao/cronogramas/schemas.ts`, `actions.ts`, `actions.test.ts`, `queries.ts`
- Create: `src/modules/execucao/cronogramas/components/cronogramas-tabela.tsx`, `grade-cronograma.tsx`, `barra-cronograma.tsx`, `editar-cronograma-drawer.tsx`
- Create: `src/app/(app)/execucao/cronogramas/page.tsx`, `loading.tsx`, `page.test.tsx`, `src/app/(app)/execucao/cronogramas/[id]/page.tsx`, `loading.tsx`

**Interfaces:**
- Consumes: `GradeEdicao` (Task 12); `lerPredecessoras`, `formatarPredecessoras`, `ordenarArvore`, `recuar`, `avancar`, `moverAcima`, `moverAbaixo`, `proximaLinha`, `lerNumeroColado` (Task 9); `listarServicos`, `unidadesMedida`, `listarCalendarios` (Task 11); `locaisDaObra`, `NovoCronogramaDrawer` (Task 10); RPCs das Tasks 4 e 5; `ex_v_atividades`, `ex_v_cronogramas` (Task 6).
- Produces:

```ts
// edicao.ts
export type AtividadeGrade = {
  id: string; codigo: string; nome: string; tipo: TipoAtividade; paiId: string | null; paiCodigo: string | null; ordem: number;
  servicoId: string | null; servicoCodigo: string | null; quantidade: string | null; unidadeId: string | null; unidadeSigla: string | null;
  produtividade: string | null; modoDuracao: "por_produtividade" | "digitada"; duracaoDias: number;
  inicioCedo: string | null; fimCedo: string | null; folgaTotal: number | null; critica: boolean | null;
  predecessoras: Predecessora[]; locais: { id: string; codigo: string; nome: string }[]; observacao: string | null; versao: string;
};
export type LinhaLote = { id?: string; versao?: string } & Record<string, unknown>;
export interface ContextoEdicao {
  servicos: readonly { id: string; codigo: string }[];
  unidades: readonly { id: string; sigla: string }[];
  locais: readonly { id: string; codigo: string }[];
  codigoDaLinha: (numero: number) => string | undefined;
}
export const COLUNAS_EDITAVEIS: readonly string[]; // ids, na ordem da grade
export function camposDaCelula(idColuna: string, texto: string, ctx: ContextoEdicao): { ok: true; campos: Record<string, unknown> } | { ok: false; erro: string };
export function montarLote(mudancas: readonly MudancaCelula[], porId: ReadonlyMap<string, AtividadeGrade>, ctx: ContextoEdicao):
  { ok: true; linhas: LinhaLote[] } | { ok: false; erro: string };
export function linhasNovasDoBloco(bloco: readonly string[][], idColunaInicial: string, existentes: readonly AtividadeGrade[], ctx: ContextoEdicao):
  { ok: true; linhas: LinhaLote[] } | { ok: false; erro: string };
export function mudancasParaLote(mudancas: readonly Mudanca[], porId: ReadonlyMap<string, AtividadeGrade>): LinhaLote[];

// actions.ts
salvarLinhas(cronogramaId: string, linhas: LinhaLote[]): Promise<{ ok: true; atividades: AtividadeGrade[] } | { erro: string }>;
excluirAtividades(cronogramaId: string, ids: string[], motivo: string): Promise<{ ok: true; atividades: AtividadeGrade[] } | { erro: string }>;
renumerarEap(cronogramaId: string), recalcular(cronogramaId: string): Promise<{ ok: true; atividades: AtividadeGrade[] } | { erro: string }>;
salvarCronograma(id: string, dados: CronogramaInput), mudarStatus(id: string, status: StatusCronograma), excluirCronograma(id: string, motivo: string): Promise<{ ok: true } | { erro: string }>;

// queries.ts
listarCronogramas(filtros?: { obraId?: string; status?: StatusCronograma }): Promise<CronogramaLista[]>;
cronogramaDetalhe(id: string): Promise<CronogramaLista | null>;
atividadesDoCronograma(id: string): Promise<AtividadeGrade[]>;
```

**Regras da edição (só interpretação; o banco valida e calcula):**
- Colunas editáveis, nesta ordem: `codigo`, `nome`, `tipo`, `servico`, `quantidade`, `unidade`, `produtividade`, `modo`, `duracao`, `predecessoras`, `locais`, `observacao`. Só leitura: `inicio`, `termino`, `folga`, `critica`.
- `tipo` aceita o valor ou o rótulo ("Resumo", "atividade", "MARCO"). `modo` aceita "Produtividade" ou "Digitada". `servico` e `unidade` casam pelo código ou pela sigla, sem diferenciar maiúscula; vazio limpa.
- Digitar uma duração passa a atividade para `modo_duracao = digitada` (quem digita a duração quer aquela duração). Na `por_produtividade`, a célula da duração é só leitura.
- `locais`: códigos separados por `;`, casados com os locais da obra.
- Várias mudanças na mesma linha viram **uma** linha do lote, com `id` e `versao`.

- [ ] **Step 1: Testes da edição (falham)**

`src/modules/execucao/cronogramas/edicao.test.ts`:

```ts
import { describe, expect, it } from "vitest";

import { camposDaCelula, linhasNovasDoBloco, montarLote, mudancasParaLote, type AtividadeGrade, type ContextoEdicao } from "@/modules/execucao/cronogramas/edicao";

const ctx: ContextoEdicao = {
  servicos: [{ id: "s1", codigo: "EST-01" }],
  unidades: [{ id: "u1", sigla: "m" }, { id: "u2", sigla: "m³" }],
  locais: [{ id: "l1", codigo: "A" }, { id: "l2", codigo: "B" }],
  codigoDaLinha: (n) => ({ 1: "1", 2: "1.1" })[n],
};
const a = (p: Partial<AtividadeGrade>): AtividadeGrade => ({
  id: "x", codigo: "1.1", nome: "Estacas", tipo: "atividade", paiId: "r", paiCodigo: "1", ordem: 1, servicoId: null, servicoCodigo: null,
  quantidade: null, unidadeId: null, unidadeSigla: null, produtividade: null, modoDuracao: "digitada", duracaoDias: 1,
  inicioCedo: null, fimCedo: null, folgaTotal: null, critica: null, predecessoras: [], locais: [], observacao: null, versao: "v1", ...p,
});

describe("camposDaCelula", () => {
  it.each([
    ["nome", " Estacas raiz ", { nome: "Estacas raiz" }],
    ["tipo", "Marco", { tipo: "marco" }],
    ["servico", "est-01", { servico_id: "s1" }],
    ["servico", "", { servico_id: null }],
    ["unidade", "M³", { unidade_id: "u2" }],
    ["quantidade", "1.234,5", { quantidade: "1234.5" }],
    ["modo", "Produtividade", { modo_duracao: "por_produtividade" }],
    ["duracao", "5", { duracao_dias: 5, modo_duracao: "digitada" }],
    ["predecessoras", "#2TI+2", { predecessoras: [{ codigo: "1.1", tipo: "TI", atraso: 2 }] }],
    ["locais", "A; b", { locais: ["l1", "l2"] }],
  ])("%s = %j", (coluna, texto, campos) => {
    expect(camposDaCelula(coluna, texto, ctx)).toEqual({ ok: true, campos });
  });

  it.each([
    ["codigo", " ", "Informe o código"],
    ["tipo", "Fase", "Tipo deve ser Resumo, Atividade ou Marco"],
    ["servico", "XYZ", "Serviço XYZ não está na biblioteca"],
    ["duracao", "2,5", "Duração em dias inteiros"],
    ["locais", "Z", "Local Z não existe nesta obra"],
  ])("%s = %j recusa", (coluna, texto, erro) => {
    expect(camposDaCelula(coluna, texto, ctx)).toEqual({ ok: false, erro });
  });
});

describe("montarLote", () => {
  it("junta as mudanças da mesma linha numa linha do lote, com id e versão", () => {
    const porId = new Map([["x", a({})]]);
    expect(montarLote([
      { idLinha: "x", idColuna: "nome", texto: "Estacas raiz" },
      { idLinha: "x", idColuna: "duracao", texto: "4" },
    ], porId, ctx)).toEqual({ ok: true, linhas: [{ id: "x", versao: "v1", nome: "Estacas raiz", duracao_dias: 4, modo_duracao: "digitada" }] });
  });

  it("o primeiro erro diz a linha", () => {
    const porId = new Map([["x", a({})]]);
    expect(montarLote([{ idLinha: "x", idColuna: "tipo", texto: "Fase" }], porId, ctx))
      .toEqual({ ok: false, erro: "Linha 1.1: Tipo deve ser Resumo, Atividade ou Marco" });
  });
});

describe("linhasNovasDoBloco", () => {
  it("bloco colado abaixo da última linha vira linhas novas na raiz, com código gerado quando não vem", () => {
    const existentes = [a({ id: "r", codigo: "1", paiId: null, paiCodigo: null, tipo: "resumo", ordem: 1 })];
    // A partir de "nome", a 8ª posição do bloco (índice 7) cai em "duracao" (COLUNAS_EDITAVEIS[1 + 7]).
    expect(linhasNovasDoBloco([["Limpeza", "", "", "", "", "", "", "2"]], "nome", existentes, ctx)).toEqual({
      ok: true,
      linhas: [{ codigo: "2", pai_codigo: "", ordem: 2, nome: "Limpeza", duracao_dias: 2, modo_duracao: "digitada" }],
    });
  });

  it("se o bloco começa na coluna código, usa o código colado", () => {
    expect(linhasNovasDoBloco([["9", "Pintura"]], "codigo", [], ctx)).toEqual({
      ok: true,
      linhas: [{ codigo: "9", pai_codigo: "", ordem: 1, nome: "Pintura" }],
    });
  });
});

describe("mudancasParaLote", () => {
  it("leva id e versão de cada linha mexida", () => {
    const porId = new Map([["x", a({})], ["y", a({ id: "y", versao: "v9" })]]);
    expect(mudancasParaLote([{ id: "x", pai_codigo: "2", ordem: 1 }, { id: "y", tipo: "resumo" }], porId)).toEqual([
      { id: "x", versao: "v1", pai_codigo: "2", ordem: 1 },
      { id: "y", versao: "v9", tipo: "resumo" },
    ]);
  });
});
```

Run: FAIL.

- [ ] **Step 2: Implementar `edicao.ts`**

`src/modules/execucao/cronogramas/edicao.ts`:

```ts
import type { MudancaCelula } from "@/components/canonicos";
import { lerNumeroColado } from "@/modules/execucao/_shared/numero";
import { ROTULO_TIPO_ATIVIDADE, TIPOS_ATIVIDADE, type TipoAtividade } from "@/modules/execucao/_shared/rotulos";
import { lerPredecessoras, type Predecessora } from "@/modules/execucao/cronogramas/dependencias-texto";
import { proximaLinha, type Mudanca } from "@/modules/execucao/cronogramas/hierarquia";

/**
 * Da célula editada na grade para a linha do lote (fn_ex_atividades_salvar_lote). Só interpreta texto;
 * duração, datas e validação de cronograma são do banco.
 */

// (tipos AtividadeGrade, LinhaLote e ContextoEdicao exatamente como em "Interfaces")

export const COLUNAS_EDITAVEIS = ["codigo", "nome", "tipo", "servico", "quantidade", "unidade", "produtividade", "modo",
  "duracao", "predecessoras", "locais", "observacao"] as const;

const igual = (a: string, b: string) => a.localeCompare(b, "pt-BR", { sensitivity: "accent" }) === 0;

type Campos = { ok: true; campos: Record<string, unknown> } | { ok: false; erro: string };

export function camposDaCelula(idColuna: string, texto: string, ctx: ContextoEdicao): Campos {
  const t = texto.trim();
  switch (idColuna) {
    case "codigo":
      return t ? { ok: true, campos: { codigo: t } } : { ok: false, erro: "Informe o código" };
    case "nome":
      return t ? { ok: true, campos: { nome: t } } : { ok: false, erro: "Informe o nome" };
    case "tipo": {
      const tipo = TIPOS_ATIVIDADE.find((v) => igual(v, t) || igual(ROTULO_TIPO_ATIVIDADE[v], t));
      return tipo ? { ok: true, campos: { tipo } } : { ok: false, erro: "Tipo deve ser Resumo, Atividade ou Marco" };
    }
    case "servico": {
      if (!t) return { ok: true, campos: { servico_id: null } };
      const s = ctx.servicos.find((x) => igual(x.codigo, t));
      return s ? { ok: true, campos: { servico_id: s.id } } : { ok: false, erro: `Serviço ${t} não está na biblioteca` };
    }
    case "unidade": {
      if (!t) return { ok: true, campos: { unidade_id: null } };
      const u = ctx.unidades.find((x) => igual(x.sigla, t));
      return u ? { ok: true, campos: { unidade_id: u.id } } : { ok: false, erro: `Unidade ${t} não existe no cadastro` };
    }
    case "quantidade":
    case "produtividade": {
      const lido = lerNumeroColado(t);
      if (!lido.ok) return lido;
      if (lido.valor !== null && Number(lido.valor) < 0) return { ok: false, erro: "Não pode ser negativo" };
      return { ok: true, campos: { [idColuna]: lido.valor } };
    }
    case "modo":
      if (igual(t, "Produtividade") || igual(t, "por_produtividade")) return { ok: true, campos: { modo_duracao: "por_produtividade" } };
      if (igual(t, "Digitada")) return { ok: true, campos: { modo_duracao: "digitada" } };
      return { ok: false, erro: "Modo deve ser Produtividade ou Digitada" };
    case "duracao": {
      if (!/^\d+$/.test(t)) return { ok: false, erro: "Duração em dias inteiros" };
      return { ok: true, campos: { duracao_dias: Number(t), modo_duracao: "digitada" } };
    }
    case "predecessoras": {
      const lido = lerPredecessoras(t, ctx.codigoDaLinha);
      return lido.ok ? { ok: true, campos: { predecessoras: lido.valor } } : lido;
    }
    case "locais": {
      const ids: string[] = [];
      for (const codigo of t.split(";").map((c) => c.trim()).filter(Boolean)) {
        const l = ctx.locais.find((x) => igual(x.codigo, codigo));
        if (!l) return { ok: false, erro: `Local ${codigo} não existe nesta obra` };
        ids.push(l.id);
      }
      return { ok: true, campos: { locais: ids } };
    }
    case "observacao":
      return { ok: true, campos: { observacao: t || null } };
    default:
      return { ok: false, erro: "Esta coluna não se edita" };
  }
}

export function montarLote(mudancas: readonly MudancaCelula[], porId: ReadonlyMap<string, AtividadeGrade>, ctx: ContextoEdicao):
  { ok: true; linhas: LinhaLote[] } | { ok: false; erro: string } {
  const linhas = new Map<string, LinhaLote>();
  for (const m of mudancas) {
    const atividade = porId.get(m.idLinha);
    if (!atividade) return { ok: false, erro: "Linha não encontrada. Recarregue a grade" };
    const r = camposDaCelula(m.idColuna, m.texto, ctx);
    if (!r.ok) return { ok: false, erro: `Linha ${atividade.codigo}: ${r.erro}` };
    const linha = linhas.get(m.idLinha) ?? { id: atividade.id, versao: atividade.versao };
    linhas.set(m.idLinha, { ...linha, ...r.campos });
  }
  return { ok: true, linhas: [...linhas.values()] };
}

export function linhasNovasDoBloco(bloco: readonly string[][], idColunaInicial: string, existentes: readonly AtividadeGrade[], ctx: ContextoEdicao):
  { ok: true; linhas: LinhaLote[] } | { ok: false; erro: string } {
  const inicio = COLUNAS_EDITAVEIS.indexOf(idColunaInicial as (typeof COLUNAS_EDITAVEIS)[number]);
  if (inicio < 0) return { ok: false, erro: "Cole a partir de uma coluna editável" };
  const arvore = existentes.map((e) => ({ id: e.id, codigo: e.codigo, paiId: e.paiId, tipo: e.tipo, ordem: e.ordem }));
  const linhas: LinhaLote[] = [];
  for (const valores of bloco) {
    let campos: Record<string, unknown> = {};
    for (const [j, texto] of valores.entries()) {
      const coluna = COLUNAS_EDITAVEIS[inicio + j];
      if (!coluna || texto.trim() === "") continue;
      const r = camposDaCelula(coluna, texto, ctx);
      if (!r.ok) return { ok: false, erro: `Linha colada ${linhas.length + 1}: ${r.erro}` };
      campos = { ...campos, ...r.campos };
    }
    const proxima = proximaLinha(arvore, null);
    const codigo = typeof campos.codigo === "string" ? campos.codigo : proxima.codigo;
    linhas.push({ codigo, pai_codigo: "", ordem: proxima.ordem, ...campos });
    arvore.push({ id: `novo-${linhas.length}`, codigo, paiId: null, tipo: "atividade", ordem: proxima.ordem });
  }
  return { ok: true, linhas };
}

export function mudancasParaLote(mudancas: readonly Mudanca[], porId: ReadonlyMap<string, AtividadeGrade>): LinhaLote[] {
  return mudancas.map(({ id, ...resto }) => ({ id, versao: porId.get(id)?.versao, ...resto }));
}
```

Run: `npx vitest run src/modules/execucao/cronogramas`. Expected: PASS.

- [ ] **Step 3: Queries**

`src/modules/execucao/cronogramas/queries.ts` (`import "server-only"`):
- `CronogramaLista`: `id, obraId, obraNome, codigo, nome, status, criterioPeso, dataInicio, dataCorte, calendarioId, calculadoEm, observacoes, versao, nAtividades, nCriticas, inicioPrevisto, terminoPrevisto` (de `ex_v_cronogramas`).
- `listarCronogramas(filtros)`: `.from("ex_v_cronogramas").select("*")`, filtro opcional por `obra_id` e `status`, ordem `obra_nome, codigo`.
- `cronogramaDetalhe(id)`: o mesmo com `.eq("id", id).maybeSingle()`.
- `atividadesDoCronograma(id)`: `todasAsLinhas` sobre `ex_v_atividades` com `.eq("cronograma_id", id).order("ordem").order("codigo")`, mapeando para `AtividadeGrade` (números do banco como texto com `String(...)`, `predecessoras` e `locais` direto do jsonb). Passa de 1.000 linhas sem cortar (o teto do PostgREST).

Troque a leitura provisória de cronogramas da tela da obra (Task 10, Step 7) por `listarCronogramas({ obraId })`.

- [ ] **Step 4: Actions, com teste**

`src/modules/execucao/cronogramas/schemas.ts`: `cronogramaSchema` (código, nome, `dataInicio`, `dataCorte` opcional, `criterioPeso`, observações), com `payloadDoCronograma`; `motivoSchema = z.string().trim().min(3, "Informe o motivo")`.

`src/modules/execucao/cronogramas/actions.ts`, no molde de `obras/actions.ts`:
- `salvarLinhas(cronogramaId, linhas)`: valida `idSchema` do cronograma e `linhas.length` entre 1 e 3.000; exige `execucao.cronogramas/criar` se alguma linha não tem `id` e `editar` se alguma tem; chama `fn_ex_atividades_salvar_lote` com `{ p_cronograma, p_linhas: linhas }`; em sucesso devolve `{ ok: true, atividades: await atividadesDoCronograma(cronogramaId) }` (a grade troca tudo pelo que o banco calculou); revalida `/execucao/cronogramas/${id}`.
- `excluirAtividades`, `renumerarEap`, `recalcular`: mesma forma, com `fn_ex_atividades_excluir` (motivo pelo `motivoSchema`), `fn_ex_eap_renumerar`, `fn_ex_cronograma_recalcular`, todos devolvendo as atividades relidas.
- `salvarCronograma`, `mudarStatus`, `excluirCronograma`: `fn_ex_cronograma_salvar` (com `p_id`), `fn_ex_cronograma_status`, `fn_ex_cronograma_excluir`.

`actions.test.ts` (molde da Task 10), casos:
1. `salvarLinhas` com uma linha sem `id` e sem `execucao.cronogramas/criar` → `{ erro: "Sem permissão para criar atividade" }`, nenhuma chamada.
2. Com linhas só com `id` e sem `editar` → `{ erro: "Sem permissão para editar atividade" }`.
3. Erro `P0001` "Linha 1.2: esta linha foi alterada por outra pessoa. Recarregue a grade" passa intacto para a tela (Review Focus 5).
4. 3.001 linhas → `{ erro: "No máximo 3.000 linhas por vez" }` sem chamada.
5. `excluirAtividades` sem motivo → `{ erro: "Informe o motivo" }`.
Mock de `@/modules/execucao/cronogramas/queries` com `atividadesDoCronograma: async () => []`.

Run: `npx vitest run src/modules/execucao/cronogramas`. Expected: PASS.

- [ ] **Step 5: Lista de cronogramas**

`src/app/(app)/execucao/cronogramas/page.tsx`: `notFound()` sem `execucao.cronogramas/ver`. `PageHeader` "Cronogramas" com `NovoCronogramaDrawer` (Task 10) quando `criar`, carregando `obrasDisponiveis()` e `calendariosModelo()` só nesse caso. `CronogramasTabela`: `DataTable` com obra, código (mono), nome, situação (`StatusBadge`), início e término previstos (`formatarData`), atividades, críticas; filtros por obra e situação (`FiltroSelect` + `useFiltrosUrl`, como em `contratos-tabela.tsx`); clique abre `/execucao/cronogramas/[id]`. Vazio: `EmptyState` "Nenhum cronograma ainda" com a ação "Novo cronograma".

`page.test.tsx`: sem `ver` → `notFound`; sem `criar` → sem o botão.

- [ ] **Step 6: Tela do cronograma com a grade**

`src/app/(app)/execucao/cronogramas/[id]/page.tsx`: `notFound()` sem `ver`, id inválido ou cronograma nulo (fora da lista). Carrega em paralelo `cronogramaDetalhe`, `atividadesDoCronograma`, `listarServicos`, `unidadesMedida`, `locaisDaObra(obraId)`. Monta:
1. `PageHeader`: `voltarPara` a pasta da obra (`/execucao/obras/${obraId}`, rótulo = nome da obra), título "<código> · <nome>" com `tituloMono` no código, selo de situação, ações "Editar dados" (`EditarCronogramaDrawer`, com `editar`: código, nome, início, **data de corte**, critério de peso, observações), "Calendário" (abre o `CalendarioDrawer` da Task 11 com `calendarioPorId(calendarioId)` e as exceções, próprias e herdadas do modelo; salvar recalcula as datas e a página relê as atividades) e o seletor de situação (`mudarStatus`).
2. `GradeKpis` com `KPICard`: Início previsto, Término previsto, Atividades, No caminho crítico, "Datas calculadas em <formatarDataHora(calculadoEm)>".
3. Abaixo do `md`: aviso "A grade do cronograma é feita para computador. No celular, a lista abaixo é só leitura" e um `DataTable` simples (código, nome, início, término) em cartões. A partir do `md`: `GradeCronograma`.

`grade-cronograma.tsx` (`"use client"`):
- Estado: `atividades` (das props; troca inteira pela resposta de cada action), `selecionadas`, `salvando` (via `useTransition`).
- `linhas = ordenarArvore(...)` remapeado para `AtividadeGrade`, com o nível de cada uma (profundidade pelo `paiId`) para o recuo.
- Colunas `ColunaGrade<AtividadeGrade>`: Código (mono, `largura` 80), Nome (220, `recuo` = nível, peso 600 em resumo), Tipo (100, `opcoes` dos rótulos), Serviço (110, `opcoes` dos códigos), Qtd (90, direita, `formatarQuantidade`), Un (60, `opcoes` das siglas), Produtividade (100, direita), Modo (110, `opcoes` Produtividade/Digitada), Duração (80, direita, `podeEditar` só em atividade `digitada`), Início e Término (90, só leitura, `formatarData`), Folga (60, direita, só leitura), Crítica (50, só leitura: ponto `bg-status-rejeitado` com `aria-label="No caminho crítico"`), Predecessoras (140, `formatarPredecessoras`), Locais (120, códigos com "; "), Observação (200). Resumo e marco: Serviço, Qtd, Un, Produtividade e Modo com `podeEditar` falso.
- `onEditar` → `montarLote` → erro vira `toast.erro` e nada é enviado; ok → `salvarLinhas` → `setAtividades(resp.atividades)` ou `toast.erro(resp.erro)`.
- `onColarAlem` → `linhasNovasDoBloco` → `salvarLinhas`.
- `onAtalho` e `BarraCronograma` (botões com ícone e rótulo: "Nova linha", "Recuar", "Avançar", "Subir", "Descer", "Excluir", "Renumerar EAP", "Recalcular datas"; dicas com o atalho do teclado): recuar/avançar/subir/descer → `hierarquia.ts` → `mudancasParaLote` → `salvarLinhas`; nova linha → `proximaLinha(linhas, idAtiva)` → linha `{ codigo, pai_codigo, ordem, nome: "Nova atividade" }` mais as mudanças → `salvarLinhas`; excluir → `ConfirmDialog` com `exigeMotivo`, sobre as selecionadas (ou a ativa) → `excluirAtividades`.
- Sem `editar` e sem `criar`: `somenteLeitura` e a barra some.
- Enquanto `salvando`, um selo discreto "Salvando..." no canto da barra; a grade continua navegável.

- [ ] **Step 7: Conferência visual**

Fica para a Task 14, depois do backfill: sem as permissões da fase ninguém entra nas telas, e o preview da Vercel deste projeto responde 500 (decisoes.md, 25/09/2026). Até lá, valem os testes de componente e de página.

- [ ] **Step 8: tsc, lint, testes e commit**

```bash
npx tsc --noEmit && npm run lint && npx vitest run src/modules/execucao src/components/canonicos "src/app/(app)/execucao"
git add src/modules/execucao/cronogramas "src/app/(app)/execucao/cronogramas" "src/app/(app)/execucao/obras"
git commit -m "Execução F1a: lista de cronogramas e grade editável com teclado, colar, árvore e recálculo"
```

---

### Task 14: Guia para agentes, backfill, prova final, PR e produção

**Files:**
- Create: `docs/modulos/execucao-guia-para-agentes.md`
- Modify: `docs/decisoes.md`, `docs/superpowers/specs/2026-10-09-execucao-obras-design.md` (emendas), `supabase/provas/ex_fase1a_banco.sql` (cabeçalho com o resultado)
- Modify (fora do repo): `/Users/tiagocameli/Desktop/personal-os/vault/projects/erp-emt/status.md`

- [ ] **Step 1: Escrever o guia para agentes**

`docs/modulos/execucao-guia-para-agentes.md`, em pt-BR, sem travessão, com estas seções (conteúdo real, tirado das migrations desta fase):
1. **O que é o módulo** (2 parágrafos) e a regra de ouro: *ler pelas views `ex_v_*`, escrever só pelas RPCs `fn_ex_*`, nunca calcular data fora do banco*.
2. **Modelo de dados**: tabela por tabela (as 12 da Task 1), com a coluna que importa e quem escreve nela.
3. **Acesso**: lista por obra; o agente usa a sessão de um usuário e só enxerga as obras dele; `fn_ex_obras_disponiveis()` para achar a obra.
4. **Regras**: dia útil, os 4 vínculos com atraso, duração por produtividade (teto, mínimo 1), marco, resumo, restrições de data, real, data de corte, folga e crítica (as regras da Task 3, copiadas).
5. **RPCs** com exemplo de chamada SQL e o retorno. No mínimo:

```sql
-- Criar cronograma (a pasta da obra nasce junto se for o primeiro)
select public.fn_ex_cronograma_salvar('{"obra_id":"<obra>","tipo_obra":"edificacao","codigo":"FUND","nome":"Fundação","data_inicio":"2026-11-03"}');

-- Montar a EAP e as atividades de uma vez (tudo ou nada)
select public.fn_ex_atividades_salvar_lote('<cronograma>', '[
  {"codigo":"1","nome":"Fundação","tipo":"resumo"},
  {"codigo":"1.1","nome":"Estacas","pai_codigo":"1","modo_duracao":"por_produtividade","quantidade":120,"produtividade":30},
  {"codigo":"1.2","nome":"Blocos","pai_codigo":"1","duracao_dias":6,"predecessoras":[{"codigo":"1.1","tipo":"TI","atraso":2}]}
]');

-- Mudar só a duração de uma linha (campos ausentes ficam como estão)
select public.fn_ex_atividades_salvar_lote('<cronograma>', '[{"id":"<atividade>","duracao_dias":8}]');

-- Simular sem gravar ("e se"), F1a: só durações
-- (fn_ex_cpm_calcular é interna; a RPC de simulação entra na F2)
```

6. **Consultas prontas**: término previsto de cada cronograma (`ex_v_cronogramas`), caminho crítico de um cronograma (`ex_v_atividades where critica`), atividades que começam na próxima semana, atividades sem predecessora (soltas), dias úteis entre duas datas (`fn_ex_dias_uteis`).
7. **Erros comuns e o que significam** (as mensagens `P0001` das RPCs desta fase, uma por linha).
8. **O que vem nas próximas fases** (uma linha por fase, do spec).

- [ ] **Step 2: Aplicar o backfill de permissões**

MCP `apply_migration` com `ex_fase1a_permissoes` (Task 7). O `$confere$` aborta se não forem 4 Admins e 36 linhas. Renomeie o arquivo para a versão real.

- [ ] **Step 3: Prova final no banco vivo**

Rode `supabase/provas/ex_fase1a_banco.sql` inteira. Esperado: todos os casos com o valor das Tasks 1 a 7, agora com `7_backfill: {"admins": 4, "linhas": 36}`. Os casos 3 em diante inserem permissões na transação com `on conflict do nothing`, então continuam valendo. Escreva o resultado (data, versões das migrations, `4g_desempenho_ms`) no cabeçalho da prova.

- [ ] **Step 4: Advisors**

MCP `get_advisors` (security e performance). Esperado: nenhum item com `ex_` nem com as funções `fn_ex_*`. Corrija numa migration nova da série, se aparecer.

- [ ] **Step 5: Portão local**

```bash
npx tsc --noEmit && npm run lint && npm run test -- --run && npm run build
```

Expected: tudo verde. Se o `vitest` travar sem saída, é o iCloud (Global Constraints).

- [ ] **Step 6: Documentação**

- `docs/decisoes.md`, entrada "2026-10-1x - Execução de Obras, Fase 1a", com: prefixo `ex_` e menu "Execução"; acesso por lista da obra com Admins na pasta nova; estoque físico sem valor (seção 4 do spec, para a F5); CPM só no banco, em dias úteis, ES inclusivo e EF exclusivo, marco no fim do dia anterior; Q7 como suposição (sábado de 5 h = 1 dia útil); `GradeEdicao` como canônico novo e por quê; Gantt desenhado por nós (decisão da F2, registrada aqui pela escolha de não usar motor de agenda de lib); policy de `unidades_medida` estendida para a Execução; auditoria de `ex_atividade_datas` (cache) mantida por enquanto, com o volume medido na prova.
- Spec: emenda "Fase 1a entregue em <data>" na seção 13, com o PR e o que ficou para a F1b.

- [ ] **Step 7: PR, CI e merge**

```bash
git push -u origin obras-execucao-spec
gh pr create --title "Execução de Obras, Fase 1a: pastas, cronogramas, calendário, CPM e grade" --body "$(cat <<'EOF'
## O que entra
- Banco do módulo Execução (prefixo ex_): obras, acesso por lista, cronogramas, locais, serviços, atividades, vínculos, calendários e feriados 2026 a 2030.
- Motor CPM no banco (4 vínculos com atraso, restrições, real, resumo, folga e caminho crítico).
- Telas: Obras (pastas), Cronogramas (lista e grade editável), Modelos (serviços e calendários).
- Canônico novo GradeEdicao.
- Guia para agentes em docs/modulos/execucao-guia-para-agentes.md.

## Provas
- supabase/provas/ex_fase1a_banco.sql no banco vivo: <resultado>.
- CPM com 3.000 atividades: <ms>.
- tsc, lint, testes (<n>), build.

## Fora desta fase
F1b: importação Excel e modelos × locais. F2 em diante: Gantt, baseline, pausas, "e se" (spec, seção 13).

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
)"
gh pr checks --watch
```

CI cancelado por tempo com os passos verdes: `gh run rerun --failed` (não é bug). Com o CI verde, faça o merge (regra do Tiago: serviço fechado com portão verde vai para produção sem pedir): `gh pr merge --merge`.

- [ ] **Step 8: Deploy e conferência em produção**

O MCP da Vercel dá 403 neste projeto: confira o deploy pelo status do commit do merge (`gh api repos/TiagoCameli/erp-emt/commits/<sha>/status`) até `success`. Depois, no navegador (Claude in Chrome), em `https://emtconstrutora.com`:
1. Menu mostra "Execução" com Obras, Cronogramas e Modelos.
2. Modelos: o calendário "Padrão EMT" aparece com seg a sex 9 h e sáb 5 h.
3. Obras vazia mostra o estado vazio com "Novo cronograma".
4. **Não crie dado de verdade sem o Tiago**: a conferência da grade usa um cronograma criado pelo Tiago, ou fica descrita para ele conferir (criar na Obra 012, colar 3 linhas, recuar, ver as datas mudarem).

Grave um GIF curto da navegação (Obras, Modelos, Cronogramas) para o relatório.

- [ ] **Step 9: Nota do projeto**

No `status.md` do vault, acima da última sessão: "Sessão <data> (Execução de Obras, Fase 1a)": PR e merge, migrations com as versões reais, prova e desempenho, telas conferidas, o que o Tiago precisa fazer (conferir feriados do Acre na tela, criar o primeiro cronograma da Obra 012), próxima fase (F1b).
