# Medição de Contratos, Fase 1 (banco + cadastro + importador): plano de implementação

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Deixar no ar o banco inteiro do módulo Medição de Contratos (tabelas, cálculo em view, travas, acesso por contrato, permissões com backfill) e as telas de cadastro de contrato e de importação da planilha contratual com versões e aditivos.

**Architecture:** Tudo com prefixo `mc_`, sem FK para nenhum outro módulo. Leitura por RLS (quem vê o módulo E está na lista do contrato); escrita só por RPC `security definer`. Valor, acumulado e total nunca são gravados: saem de views `security_invoker`. O xlsx oficial sobe direto para o Storage como anexo da versão em rascunho, e o servidor baixa e lê o arquivo de lá. O navegador nunca manda os números.

**Tech Stack:** Supabase Postgres 17 (MCP `apply_migration` / `execute_sql`), Next.js 16 App Router, TypeScript strict, exceljs 4, Zod, React Hook Form, TanStack Table, Vitest 4.

**Spec:** `docs/superpowers/specs/2026-09-25-medicao-contratos-design.md`. Ler inteira antes da Task 1.

## Global Constraints

- A fase só começa **depois do merge do PR #320** (decisão D5). Uma fase aberta por vez.
- Branch `medicao-fase1`, criada de `origin/main` atualizado. A cópia local do Tiago está atrás do main: nunca trabalhar nela.
- Migration vai direto para produção por `apply_migration` do MCP do Supabase. **`supabase db push` é proibido.** O `.sql` idêntico fica em `supabase/migrations/` (memória: sempre `Write` o `.sql` ao aplicar).
- Só mudança **aditiva**: nada existente muda de comportamento, exceto as duas policies e duas funções de anexo da Task 6, que só ganham uma condição a mais para entidades `mc_*`.
- Toda tabela: RLS ligada, policy só de SELECT, `revoke all ... from anon, authenticated` + `grant select ... to authenticated`, trigger `fn_audit`. Toda função nova: `revoke all ... from public, anon` + `grant execute ... to authenticated`, `set search_path to ''`.
- Nenhuma escrita em `obras`, `clientes`, `centros_custo`, `lancamentos`, `lancamento_parcelas`, estoque (D1, D2). A prova confere isso.
- Função existente é alterada **a partir da definição viva** (`pg_get_functiondef`), nunca de cópia do repo (decisoes.md L1750).
- Preço, quantidade prevista e quantidade de carga: `numeric` **sem escala**. Quantidade digitada: no máximo 4 casas (`CASAS_TAXA`). Dinheiro: 2 casas no ponto que `regra_arredondamento` manda.
- Arredondamento: `round(numeric, 2)` do Postgres (meio para longe do zero). O TypeScript só arredonda no diagnóstico da importação e usa a mesma regra.
- Textos da UI em pt-BR, sentence case, botão diz o que faz. **Sem travessão** em texto, comentário ou mensagem.
- Nomes: tabelas `mc_*`, funções `fn_mc_*`, views `mc_v_*`, módulo `medicao`, recursos `medicao.*`, rotas `/medicao/*`, pasta `src/modules/medicao/`.
- Timestamps das migrations: série `20261001100000` a `20261001150000`. Se o main tiver migration com timestamp maior ou igual, somar 1 dia a todas, mantendo a ordem.
- Portão do PR: `npx tsc --noEmit`, `npm run lint`, `npm run test -- --run`, `npm run build`, CI verde, prova `supabase/provas/mc_fase1_banco.sql` rodada no banco vivo com todos os casos certos, advisors do Supabase (security e performance) sem item novo.

## Review Focus

1. **xlsx salvo sem valor calculado** (fórmula sem cache, comum em arquivo gerado por script): a importação bloqueia com "A célula F12 é fórmula sem valor calculado. Abra o arquivo no Excel, salve e envie de novo". Nunca vira zero. Teste na Task 8.
2. **Número digitado como texto na planilha** (`"1.234,56"` numa célula de texto): a importação bloqueia apontando a célula e não converte, porque converter texto formatado é exatamente o erro das casas escondidas. Teste na Task 8.
3. **Usuário desativado que ainda está na lista do contrato**: deixa de ver na hora (RLS), e a RPC recusa. Caso 6f da prova.
4. **Gravar linhas duas vezes no mesmo rascunho** (duplo clique, reenvio): a segunda gravação substitui, não duplica. Caso 4d da prova.
5. **Dois rascunhos ao mesmo tempo no mesmo contrato**: o segundo é recusado ("Já existe a versão N em rascunho"). Caso 4e da prova.

---

## Mapa de arquivos

**Banco**
- `supabase/migrations/20261001100000_mc_fase1a_estrutura.sql`: tabelas, índices, RLS, auditoria, funções de acesso.
- `supabase/migrations/20261001110000_mc_fase1b_calculo.sql`: `fn_mc_valor` e views de cálculo.
- `supabase/migrations/20261001120000_mc_fase1c_travas.sql`: triggers de imutabilidade, roteamento do lançamento, numeração.
- `supabase/migrations/20261001130000_mc_fase1d_rpcs.sql`: RPCs de contrato, acesso, aditivo, planilha, excluir e restaurar.
- `supabase/migrations/20261001140000_mc_fase1e_anexos.sql`: entidades de anexo e trava por contrato.
- `supabase/migrations/20261001150000_mc_fase1f_permissoes.sql`: backfill dos 4 Admins.
- `supabase/provas/mc_fase1_banco.sql`: prova única, cresce a cada task.

**App**
- `src/config/recursos.ts`: módulo `medicao` e recursos `medicao.contratos`, `medicao.planilha`.
- `src/modules/_shared/anexos/entidades.ts`: `mc_contrato`, `mc_aditivo`, `mc_planilha_versao`.
- `src/modules/medicao/_shared/decimal.ts` (+ teste): aritmética decimal exata com BigInt, só para diagnóstico.
- `src/modules/medicao/_shared/rotulos.ts`: rótulos de status, tipo de contratante, regra.
- `src/modules/medicao/planilha/leitor.ts` (+ teste): lê células do xlsx sem perder casa.
- `src/modules/medicao/planilha/montagem.ts` (+ teste): hierarquia, tipo, alertas.
- `src/modules/medicao/planilha/diagnostico.ts` (+ teste): confere a coluna de valor da planilha contra qtd × preço.
- `src/modules/medicao/planilha/casamento.ts` (+ teste): casa as linhas do aditivo com os itens da versão anterior.
- `src/modules/medicao/planilha/actions.ts` (+ teste), `queries.ts`, `schemas.ts`, `components/*`.
- `src/modules/medicao/contratos/actions.ts` (+ teste), `queries.ts`, `schemas.ts` (+ teste), `components/*`.
- `src/app/(app)/medicao/layout.tsx`, `page.tsx`, `contratos/page.tsx`, `contratos/[id]/page.tsx`, `planilha/page.tsx`, `planilha/[versaoId]/page.tsx`, `planilha/[versaoId]/importar/page.tsx`, `loading.tsx` em cada.
- `src/lib/database.types.ts`: tipos novos (regerados; ver Task 7).

**Docs**
- `docs/decisoes.md`, a spec (emendas da Task 13), `vault/projects/erp-emt/status.md` (fora do repo).

---

### Task 0: Preparar a branch e ler o que está vivo

**Files:** nenhum arquivo de produto.

- [ ] **Step 1: Confirmar o merge do #320 e criar a branch**

```bash
cd /Users/tiagocameli/Documents/GitHub/erp-emt
gh pr view 320 --json state,mergedAt
git fetch origin
git worktree add .claude/worktrees/medicao-fase1 -b medicao-fase1 origin/main
cd .claude/worktrees/medicao-fase1
ls supabase/migrations | tail -3
```

Esperado: `"state":"MERGED"`. Se não estiver mergeado, **pare** e avise o Tiago (D5). Anote o último timestamp e ajuste a série de timestamps se for preciso (Global Constraints).

- [ ] **Step 2: Conferir a extensão btree_gist**

MCP `list_extensions`. Se `btree_gist` não estiver instalada, a Task 1 a cria em `extensions` (já está no SQL). Anote a versão.

- [ ] **Step 3: Guardar as definições vivas que a Task 6 altera**

MCP `execute_sql`:

```sql
select p.proname, md5(pg_get_functiondef(p.oid)) as md5, pg_get_functiondef(p.oid) as def
from pg_proc p join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public' and p.proname in ('fn_recurso_da_entidade', 'fn_vincular_arquivo', 'fn_desvincular_arquivo');

select polname, pg_get_expr(polqual, polrelid) as usando
from pg_policy where polname in ('anexo_vinculos_select', 'arquivos_select');
```

Salve a saída em `$CLAUDE_JOB_DIR/tmp/anexos_vivos.txt`. A Task 6 compara com isto.

- [ ] **Step 4: Ids da prova**

```sql
select id, nome, ativo from public.usuarios where id in ('c66fca9f-5428-4fb9-855f-dcff548764df', 'f155865b-1d4b-4b25-bf3d-54d8de9176b0');
select count(*) from public.usuario_permissoes where usuario_id = 'f155865b-1d4b-4b25-bf3d-54d8de9176b0';
select count(*) from public.usuarios u join public.perfis p on p.id = u.perfil_id and p.nome = 'Admin' where u.ativo and u.excluido_em is null;
```

Esperado: Tiago (Admin) e o usuário "zero" existem; o zero tem 0 permissões; 4 Admins ativos. Se algum número diferir, pare e avise: a prova e o backfill dependem deles.

---

### Task 1: Estrutura (tabelas, RLS, acesso por contrato)

**Files:**
- Create: `supabase/migrations/20261001100000_mc_fase1a_estrutura.sql`
- Create: `supabase/provas/mc_fase1_banco.sql`

**Interfaces:**
- Produces: tabelas `mc_*` da seção 5 da spec; `fn_ve_medicao() returns boolean`; `fn_mc_meus_contratos() returns setof uuid`; `fn_mc_acessa_contrato(uuid) returns boolean`.

- [ ] **Step 1: Escrever a prova (primeira parte), que tem de falhar**

`supabase/provas/mc_fase1_banco.sql`:

```sql
-- Prova da Fase 1 da Medição de Contratos. Migrations 20261001100000 a 20261001150000.
-- NÃO GRAVA: termina em raise exception com as medições, e o bloco de aborto garante o rollback.
-- Rodar inteira pelo MCP execute_sql. Cada caso vira uma chave em r; "recusou: ..." é o esperado
-- nos casos de trava; "PASSOU (errado)" é falha.
--
-- Números esperados, feitos à mão (seção 11 da spec):
--   K1 v0: 01 título | 01.01 3 x 0,335 = 1,005 | 01.02 3 x 0,335 = 1,005 | 01.02.01 2 x 10,004 = 20,008
--          02 título | 02.01 1 x 100 = 100 | 02.01 (código repetido) 1 x 1 = 1
--     item_por_medicao / item_por_acumulado: linhas 1,01 1,01 20,01 100 1; 01.02 subárvore 21,02;
--       grupo 01 = 22,03; grupo 02 = 101,00; total 123,03
--     sem_arredondar: 01.02 subárvore round(21,013) = 21,01; grupo 01 round(22,018) = 22,02;
--       grupo 02 = 101,00; total round(123,018) = 123,02   (o centavo do Lote 09 em miniatura)
--   K1 medições (01.01): 1ª lança 1 + 0,5 = 1,5; 2ª lança 1,5
--     item_por_medicao: 1ª 0,50; 2ª 0,50; acumulado 1,00
--     item_por_acumulado: 1ª round(0,5025) = 0,50; 2ª round(1,005) - 0,50 = 0,51; acumulado 1,01
--     sem_arredondar: 1ª 0,5025; 2ª 0,5025; acumulado round(1,005) = 1,01
--   K2 v0: 01 título | 01.01 10 x 0,335 = 3,35. 1ª medição lança 1,5, aprovada 1,2: glosa 0,3,
--     valor round(0,402) = 0,40. Aditivo 1 + v1 (a partir de 01/02): 01.01 12 x 0,4 = 4,80 e
--     01.02 novo 5 x 2 = 10,00, total v1 14,80. 2ª medição (v1) lança 1,5: valor 0,60;
--     acumulado do 01.01: quantidade 2,7, valor 1,00.

do $prova$
declare
  v_tiago constant uuid := 'c66fca9f-5428-4fb9-855f-dcff548764df';
  v_zero constant uuid := 'f155865b-1d4b-4b25-bf3d-54d8de9176b0';
  v_k1 uuid; v_k2 uuid; v_k3 uuid; v_n bigint; v_txt text; v_regra text; v_j jsonb; v_acc jsonb; r jsonb := '{}'::jsonb;
  v_obras0 bigint; v_cc0 bigint; v_lanc0 bigint;
begin
  select count(*) into v_obras0 from public.obras;
  select count(*) into v_cc0 from public.centros_custo;
  select count(*) into v_lanc0 from public.lancamentos;

  -- 1. Estrutura: as tabelas existem com RLS ligada e sem grant de escrita
  select count(*) into v_n from pg_class c join pg_namespace n on n.oid = c.relnamespace
   where n.nspname = 'public' and c.relkind = 'r' and c.relname like 'mc\_%' and c.relrowsecurity;
  r := r || jsonb_build_object('1a_tabelas_com_rls', v_n);
  select count(*) into v_n from information_schema.role_table_grants
   where table_schema = 'public' and table_name like 'mc\_%' and grantee in ('authenticated', 'anon')
     and privilege_type in ('INSERT', 'UPDATE', 'DELETE');
  r := r || jsonb_build_object('1b_grants_de_escrita', v_n);
  select count(*) into v_n from pg_trigger t join pg_class c on c.oid = t.tgrelid
   where c.relname like 'mc\_%' and t.tgname like 'trg_audit_%';
  r := r || jsonb_build_object('1c_tabelas_auditadas', v_n);

  -- [casos 2 em diante entram nas próximas tasks]

  -- 9. O módulo não escreveu em outro módulo
  r := r || jsonb_build_object('9_outros_modulos_intactos',
    (select count(*) from public.obras) = v_obras0 and (select count(*) from public.centros_custo) = v_cc0
    and (select count(*) from public.lancamentos) = v_lanc0);

  raise exception 'PROVA %', r;
end $prova$;
do $aborto$ begin raise exception 'ABORTO GARANTIDO'; end $aborto$;
```

- [ ] **Step 2: Rodar a prova e ver falhar**

MCP `execute_sql` com o arquivo. Esperado: `PROVA {"1a_tabelas_com_rls": 0, "1b_grants_de_escrita": 0, "1c_tabelas_auditadas": 0, ...}`. Zero tabelas: a estrutura não existe. É a falha esperada.

- [ ] **Step 3: Escrever a migration**

`supabase/migrations/20261001100000_mc_fase1a_estrutura.sql`:

```sql
-- Medição de Contratos, Fase 1a: estrutura.
-- Desenho: docs/superpowers/specs/2026-09-25-medicao-contratos-design.md (seção 5).
-- Só cria objeto novo, com prefixo mc_ (medicoes e fn_registrar_medicao já são da Manutenção).
-- Nenhuma FK para obras, clientes, centros_custo ou lancamentos: o módulo é independente (D1, D2).
-- Leitura: quem vê o módulo E está na lista do contrato (D3). Escrita: só pelas RPCs da Fase 1d.
-- Preço, quantidade prevista e quantidade de carga são numeric sem escala: a planilha oficial tem
-- casas escondidas (02.07.04 do Lote 09: 17.057,717 x 580,86 dá 9.908.145,50, o oficial é
-- 9.908.218,84). Exceção à regra 3 do CLAUDE.md, registrada em docs/decisoes.md.

create extension if not exists btree_gist with schema extensions;

-- =====================================================================
-- 1. Contrato
-- =====================================================================

create table public.mc_contratos (
  id uuid primary key default gen_random_uuid(),
  codigo text not null check (codigo ~ '^[A-Z0-9][A-Z0-9-]{1,29}$'),
  nome_obra text not null check (char_length(btrim(nome_obra)) between 2 and 200),
  local text,
  objeto text not null check (btrim(objeto) <> ''),
  numero_contrato text not null check (btrim(numero_contrato) <> ''),
  contratante_nome text not null check (btrim(contratante_nome) <> ''),
  contratante_tipo text not null check (contratante_tipo in ('federal', 'estadual', 'municipal', 'privado')),
  contratante_documento text,
  valor_inicial numeric(14,2) not null check (valor_inicial >= 0),
  data_assinatura date not null,
  data_ordem_servico date,
  prazo_meses integer not null check (prazo_meses > 0),
  inicio_prazo text not null default 'assinatura' check (inicio_prazo in ('assinatura', 'ordem_servico')),
  dia_inicio_periodo smallint not null default 1 check (dia_inicio_periodo between 1 and 28),
  tipo_localizacao text not null default 'texto' check (tipo_localizacao in ('rodovia', 'texto')),
  -- Nula até ser descoberta na planilha oficial: sem regra, as views devolvem valor nulo.
  regra_arredondamento text check (regra_arredondamento in ('item_por_medicao', 'item_por_acumulado', 'sem_arredondar')),
  alerta_prazo_dias integer not null default 90 check (alerta_prazo_dias >= 0),
  alerta_valor_pct numeric(5,2) not null default 90 check (alerta_valor_pct between 0 and 100),
  status text not null default 'ativo' check (status in ('ativo', 'paralisado', 'encerrado')),
  observacoes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references public.usuarios(id) default auth.uid(),
  excluido_em timestamptz,
  excluido_por uuid references public.usuarios(id),
  motivo_exclusao text,
  check (inicio_prazo = 'assinatura' or data_ordem_servico is not null)
);
create unique index mc_contratos_codigo_uk on public.mc_contratos (codigo) where excluido_em is null;

create table public.mc_contrato_usuarios (
  contrato_id uuid not null references public.mc_contratos(id),
  usuario_id uuid not null references public.usuarios(id),
  created_at timestamptz not null default now(),
  created_by uuid references public.usuarios(id) default auth.uid(),
  primary key (contrato_id, usuario_id)
);
create index mc_contrato_usuarios_usuario_ix on public.mc_contrato_usuarios (usuario_id);

create table public.mc_aditivos (
  id uuid primary key default gen_random_uuid(),
  contrato_id uuid not null references public.mc_contratos(id),
  numero integer not null check (numero > 0),
  data_assinatura date not null,
  data_vigencia date not null,
  tipos text[] not null check (cardinality(tipos) > 0 and tipos <@ array['quantidade', 'valor', 'prazo', 'inclusao_item']),
  prazo_acrescido_meses integer check (prazo_acrescido_meses > 0),
  motivo text not null check (btrim(motivo) <> ''),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references public.usuarios(id) default auth.uid(),
  excluido_em timestamptz,
  excluido_por uuid references public.usuarios(id),
  motivo_exclusao text,
  unique (id, contrato_id),
  check (('prazo' = any(tipos)) = (prazo_acrescido_meses is not null))
);
create unique index mc_aditivos_numero_uk on public.mc_aditivos (contrato_id, numero) where excluido_em is null;

-- =====================================================================
-- 2. Planilha contratual
-- =====================================================================

create table public.mc_planilha_versoes (
  id uuid primary key default gen_random_uuid(),
  contrato_id uuid not null references public.mc_contratos(id),
  numero integer not null check (numero >= 0),
  aditivo_id uuid,
  vigente_desde date not null,
  status text not null default 'rascunho' check (status in ('rascunho', 'vigente')),
  motivo text,
  arquivo_nome text,
  arquivo_hash text,
  aprovada_em timestamptz,
  aprovada_por uuid references public.usuarios(id),
  motivo_desaprovacao text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references public.usuarios(id) default auth.uid(),
  excluido_em timestamptz,
  excluido_por uuid references public.usuarios(id),
  motivo_exclusao text,
  unique (id, contrato_id),
  foreign key (aditivo_id, contrato_id) references public.mc_aditivos (id, contrato_id),
  check ((numero = 0) = (aditivo_id is null))
);
create unique index mc_planilha_versoes_numero_uk on public.mc_planilha_versoes (contrato_id, numero) where excluido_em is null;

-- Identidade estável do item: o acumulado soma por ela, atravessando as versões.
create table public.mc_itens (
  id uuid primary key default gen_random_uuid(),
  contrato_id uuid not null references public.mc_contratos(id),
  created_at timestamptz not null default now(),
  unique (id, contrato_id)
);

create table public.mc_planilha_itens (
  id uuid primary key default gen_random_uuid(),
  versao_id uuid not null,
  contrato_id uuid not null,
  item_id uuid not null,
  ordem integer not null check (ordem > 0),
  codigo text not null check (btrim(codigo) <> ''),
  pai_id uuid,
  descricao text not null check (btrim(descricao) <> ''),
  unidade text,
  tipo text not null check (tipo in ('titulo', 'servico')),
  preco_unitario numeric check (preco_unitario >= 0),
  quantidade_prevista numeric check (quantidade_prevista >= 0),
  linha_origem integer,
  created_at timestamptz not null default now(),
  unique (versao_id, ordem),
  unique (versao_id, item_id),
  unique (id, versao_id),
  foreign key (versao_id, contrato_id) references public.mc_planilha_versoes (id, contrato_id),
  foreign key (item_id, contrato_id) references public.mc_itens (id, contrato_id),
  foreign key (pai_id, versao_id) references public.mc_planilha_itens (id, versao_id),
  check ((tipo = 'titulo' and preco_unitario is null and quantidade_prevista is null)
      or (tipo = 'servico' and preco_unitario is not null and quantidade_prevista is not null))
);
create index mc_planilha_itens_pai_ix on public.mc_planilha_itens (pai_id);
create index mc_planilha_itens_item_ix on public.mc_planilha_itens (item_id);
create index mc_planilha_itens_contrato_ix on public.mc_planilha_itens (contrato_id);

-- =====================================================================
-- 3. Medição
-- =====================================================================

create table public.mc_medicoes (
  id uuid primary key default gen_random_uuid(),
  contrato_id uuid not null references public.mc_contratos(id),
  numero integer not null check (numero > 0),
  periodo_inicio date not null,
  periodo_fim date not null,
  status text not null default 'aberta' check (status in ('aberta', 'em_conferencia', 'enviada', 'aprovada')),
  versao_id uuid not null,
  aprovada_em timestamptz,
  aprovada_por uuid references public.usuarios(id),
  origem text not null default 'app' check (origem in ('app', 'carga')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references public.usuarios(id) default auth.uid(),
  unique (contrato_id, numero),
  unique (id, contrato_id),
  foreign key (versao_id, contrato_id) references public.mc_planilha_versoes (id, contrato_id),
  check (periodo_fim >= periodo_inicio),
  constraint mc_medicoes_sem_sobreposicao exclude using gist
    (contrato_id with =, daterange(periodo_inicio, periodo_fim, '[]') with &&)
);
create index mc_medicoes_versao_ix on public.mc_medicoes (versao_id);

create table public.mc_medicao_revisoes (
  id uuid primary key default gen_random_uuid(),
  medicao_id uuid not null,
  contrato_id uuid not null,
  numero integer not null check (numero >= 0),
  fase text not null default 'antes_aprovacao' check (fase in ('antes_aprovacao', 'pos_aprovacao')),
  motivo text,
  status text not null default 'em_aberto' check (status in ('em_aberto', 'enviada', 'aprovada', 'substituida')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references public.usuarios(id) default auth.uid(),
  unique (medicao_id, numero),
  unique (id, medicao_id),
  foreign key (medicao_id, contrato_id) references public.mc_medicoes (id, contrato_id),
  check (numero = 0 or coalesce(btrim(motivo), '') <> '')
);
create index mc_medicao_revisoes_contrato_ix on public.mc_medicao_revisoes (contrato_id);

-- Quantidade medida congelada no envio de cada revisão (quantidade, nunca dinheiro).
create table public.mc_revisao_itens (
  revisao_id uuid not null references public.mc_medicao_revisoes(id),
  item_id uuid not null,
  contrato_id uuid not null,
  quantidade numeric not null,
  primary key (revisao_id, item_id),
  foreign key (item_id, contrato_id) references public.mc_itens (id, contrato_id)
);
create index mc_revisao_itens_contrato_ix on public.mc_revisao_itens (contrato_id);

create table public.mc_aprovacoes_item (
  revisao_id uuid not null references public.mc_medicao_revisoes(id),
  item_id uuid not null,
  contrato_id uuid not null,
  quantidade_aprovada numeric not null check (quantidade_aprovada >= 0),
  created_at timestamptz not null default now(),
  created_by uuid references public.usuarios(id) default auth.uid(),
  primary key (revisao_id, item_id),
  foreign key (item_id, contrato_id) references public.mc_itens (id, contrato_id)
);
create index mc_aprovacoes_item_contrato_ix on public.mc_aprovacoes_item (contrato_id);

create table public.mc_medicao_eventos (
  id uuid primary key default gen_random_uuid(),
  medicao_id uuid not null,
  contrato_id uuid not null,
  evento text not null,
  de_status text,
  para_status text,
  motivo text,
  usuario_id uuid references public.usuarios(id) default auth.uid(),
  criado_em timestamptz not null default now(),
  foreign key (medicao_id, contrato_id) references public.mc_medicoes (id, contrato_id)
);
create index mc_medicao_eventos_medicao_ix on public.mc_medicao_eventos (medicao_id);

-- =====================================================================
-- 4. Lançamento diário e ajuste
-- =====================================================================

create table public.mc_lancamentos (
  id uuid primary key default gen_random_uuid(),
  contrato_id uuid not null,
  item_id uuid not null,
  medicao_id uuid not null,        -- preenchido pelo gatilho da Fase 1c, nunca pela tela
  data date not null,
  quantidade numeric not null check (quantidade > 0),
  km_inicial numeric(10,3),
  km_final numeric(10,3),
  estaca text,
  local_texto text,
  observacao text,
  motivo_excesso text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references public.usuarios(id) default auth.uid(),
  excluido_em timestamptz,
  excluido_por uuid references public.usuarios(id),
  motivo_exclusao text,
  foreign key (item_id, contrato_id) references public.mc_itens (id, contrato_id),
  foreign key (medicao_id, contrato_id) references public.mc_medicoes (id, contrato_id)
);
create index mc_lancamentos_medicao_ix on public.mc_lancamentos (medicao_id) where excluido_em is null;
create index mc_lancamentos_contrato_data_ix on public.mc_lancamentos (contrato_id, data);
create index mc_lancamentos_item_ix on public.mc_lancamentos (item_id);

create table public.mc_ajustes (
  id uuid primary key default gen_random_uuid(),
  medicao_id uuid not null,
  contrato_id uuid not null,
  revisao_id uuid not null,
  item_id uuid not null,
  quantidade numeric not null check (quantidade <> 0),
  motivo text not null check (char_length(btrim(motivo)) >= 3),
  tipo text not null default 'manual' check (tipo in ('manual', 'carga')),
  created_at timestamptz not null default now(),
  created_by uuid references public.usuarios(id) default auth.uid(),
  foreign key (medicao_id, contrato_id) references public.mc_medicoes (id, contrato_id),
  foreign key (revisao_id, medicao_id) references public.mc_medicao_revisoes (id, medicao_id),
  foreign key (item_id, contrato_id) references public.mc_itens (id, contrato_id)
);
create index mc_ajustes_medicao_ix on public.mc_ajustes (medicao_id);
create index mc_ajustes_revisao_ix on public.mc_ajustes (revisao_id);
create index mc_ajustes_item_ix on public.mc_ajustes (item_id);

-- =====================================================================
-- 5. Reajuste (nasce vazio; RPCs e telas na Fase 6)
-- =====================================================================

create table public.mc_indices (
  id uuid primary key default gen_random_uuid(),
  nome text not null check (btrim(nome) <> ''),
  sigla text not null check (btrim(sigla) <> ''),
  fonte text,
  observacao text,
  ativo boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references public.usuarios(id) default auth.uid(),
  excluido_em timestamptz,
  excluido_por uuid references public.usuarios(id),
  motivo_exclusao text
);
create unique index mc_indices_sigla_uk on public.mc_indices (upper(sigla)) where excluido_em is null;

create table public.mc_indice_valores (
  id uuid primary key default gen_random_uuid(),
  indice_id uuid not null references public.mc_indices(id),
  mes date not null check (extract(day from mes) = 1),
  valor numeric not null check (valor > 0),
  situacao text not null check (situacao in ('provisorio', 'definitivo')),
  fonte text not null check (btrim(fonte) <> ''),
  data_publicacao date,
  created_at timestamptz not null default now(),
  created_by uuid references public.usuarios(id) default auth.uid(),
  unique (indice_id, mes, situacao)
);

create table public.mc_reajuste_config (
  contrato_id uuid primary key references public.mc_contratos(id),
  tem_reajuste boolean not null default false,
  data_base date,
  periodicidade_meses integer not null default 12 check (periodicidade_meses > 0),
  defasagem_meses integer not null default 0 check (defasagem_meses >= 0),
  modo_indice_i text check (modo_indice_i in ('mensal', 'ciclo_anual')),          -- spec Q2, nula até a cláusula
  casas_fator smallint check (casas_fator between 0 and 12),
  indice_padrao_id uuid references public.mc_indices(id),
  formula text not null default 'padrao' check (formula = 'padrao'),
  regra_aniversario text check (regra_aniversario in ('medicao_inteira', 'proporcional_por_data')), -- spec Q3
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.mc_item_indices (
  item_id uuid primary key,
  contrato_id uuid not null,
  indice_id uuid not null references public.mc_indices(id),
  created_at timestamptz not null default now(),
  created_by uuid references public.usuarios(id) default auth.uid(),
  foreign key (item_id, contrato_id) references public.mc_itens (id, contrato_id)
);
create index mc_item_indices_contrato_ix on public.mc_item_indices (contrato_id);

create table public.mc_reajuste_aplicado (
  id uuid primary key default gen_random_uuid(),
  medicao_id uuid not null,
  contrato_id uuid not null,
  revisao_id uuid not null,
  indice_id uuid not null references public.mc_indices(id),
  i0 numeric not null,
  i numeric not null,
  mes_i date not null,
  fator numeric not null,
  situacao text not null check (situacao in ('provisorio', 'definitivo')),
  aplicado_em timestamptz not null default now(),
  unique (revisao_id, indice_id, situacao),
  foreign key (medicao_id, contrato_id) references public.mc_medicoes (id, contrato_id),
  foreign key (revisao_id, medicao_id) references public.mc_medicao_revisoes (id, medicao_id)
);

create table public.mc_reajuste_aplicado_itens (
  revisao_id uuid not null references public.mc_medicao_revisoes(id),
  item_id uuid not null,
  contrato_id uuid not null,
  indice_id uuid not null references public.mc_indices(id),
  primary key (revisao_id, item_id),
  foreign key (item_id, contrato_id) references public.mc_itens (id, contrato_id)
);

-- =====================================================================
-- 6. Acesso
-- =====================================================================

create or replace function public.fn_ve_medicao()
returns boolean language sql stable security definer set search_path to '' as $$
  select public.tem_permissao('medicao.painel', 'ver') or public.tem_permissao('medicao.contratos', 'ver')
      or public.tem_permissao('medicao.planilha', 'ver') or public.tem_permissao('medicao.boletim', 'ver')
      or public.tem_permissao('medicao.lancamentos', 'ver') or public.tem_permissao('medicao.medicoes', 'ver')
      or public.tem_permissao('medicao.reajuste', 'ver') or public.tem_permissao('medicao.indices', 'ver')
      or public.tem_permissao('medicao.alertas', 'ver');
$$;

-- Contratos do usuário logado. A linha em mc_contrato_usuarios É o acesso (padrão de
-- usuario_conta_saldo); usuário desativado ou excluído deixa de ver na hora.
create or replace function public.fn_mc_meus_contratos()
returns setof uuid language sql stable security definer set search_path to '' as $$
  select cu.contrato_id
  from public.mc_contrato_usuarios cu
  join public.usuarios u on u.id = cu.usuario_id
  where cu.usuario_id = (select auth.uid()) and u.ativo and u.excluido_em is null;
$$;

create or replace function public.fn_mc_acessa_contrato(p_contrato uuid)
returns boolean language sql stable security definer set search_path to '' as $$
  select p_contrato in (select public.fn_mc_meus_contratos());
$$;

do $fn$
declare f text;
begin
  foreach f in array array['fn_ve_medicao()', 'fn_mc_meus_contratos()', 'fn_mc_acessa_contrato(uuid)'] loop
    execute format('revoke all on function public.%s from public, anon', f);
    execute format('grant execute on function public.%s to authenticated', f);
  end loop;
end $fn$;

-- =====================================================================
-- 7. RLS, grants, auditoria e updated_at
-- =====================================================================

do $rls$
declare t text;
begin
  -- Tabelas de contrato: vê quem vê o módulo e está na lista do contrato.
  foreach t in array array['mc_contrato_usuarios', 'mc_aditivos', 'mc_planilha_versoes', 'mc_itens', 'mc_planilha_itens',
                           'mc_medicoes', 'mc_medicao_revisoes', 'mc_revisao_itens', 'mc_aprovacoes_item',
                           'mc_medicao_eventos', 'mc_lancamentos', 'mc_ajustes', 'mc_reajuste_config',
                           'mc_item_indices', 'mc_reajuste_aplicado', 'mc_reajuste_aplicado_itens'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('create policy %I on public.%I for select to authenticated using ((select public.fn_ve_medicao()) and contrato_id in (select public.fn_mc_meus_contratos()))', t || '_select', t);
  end loop;
  alter table public.mc_contratos enable row level security;
  create policy mc_contratos_select on public.mc_contratos for select to authenticated
    using ((select public.fn_ve_medicao()) and id in (select public.fn_mc_meus_contratos()));
  -- Índices valem para todos os contratos.
  foreach t in array array['mc_indices', 'mc_indice_valores'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('create policy %I on public.%I for select to authenticated using ((select public.fn_ve_medicao()))', t || '_select', t);
  end loop;

  foreach t in array array['mc_contratos', 'mc_contrato_usuarios', 'mc_aditivos', 'mc_planilha_versoes', 'mc_itens',
                           'mc_planilha_itens', 'mc_medicoes', 'mc_medicao_revisoes', 'mc_revisao_itens',
                           'mc_aprovacoes_item', 'mc_medicao_eventos', 'mc_lancamentos', 'mc_ajustes', 'mc_indices',
                           'mc_indice_valores', 'mc_reajuste_config', 'mc_item_indices', 'mc_reajuste_aplicado',
                           'mc_reajuste_aplicado_itens'] loop
    execute format('revoke all on public.%I from anon, authenticated', t);
    execute format('grant select on public.%I to authenticated', t);
    execute format('create trigger %I after insert or delete or update on public.%I for each row execute function public.fn_audit()', 'trg_audit_' || t, t);
  end loop;

  foreach t in array array['mc_contratos', 'mc_aditivos', 'mc_planilha_versoes', 'mc_medicoes', 'mc_medicao_revisoes',
                           'mc_lancamentos', 'mc_indices', 'mc_reajuste_config'] loop
    execute format('create trigger %I before update on public.%I for each row execute function public.fn_set_updated_at()', 'trg_updated_at_' || t, t);
  end loop;
end $rls$;
```

- [ ] **Step 4: Aplicar e rodar os advisors**

MCP `apply_migration` com nome `mc_fase1a_estrutura` e o conteúdo exato do arquivo. Depois `get_advisors` (security e performance). FK sem índice que aparecer no advisor ganha índice numa migration de correção **antes** de seguir.

- [ ] **Step 5: Rodar a prova e ver passar**

Esperado: `"1a_tabelas_com_rls": 19`, `"1b_grants_de_escrita": 0`, `"1c_tabelas_auditadas": 19`, `"9_outros_modulos_intactos": true`.

- [ ] **Step 6: Mutação**

Numa transação à parte (`begin; ... rollback;` pelo `execute_sql`), rode `grant insert on public.mc_lancamentos to authenticated;` e a parte 1 da prova: `1b` tem de dar 1. Desfaça. Se não der 1, a prova não está olhando o que diz olhar: conserte a consulta.

- [ ] **Step 7: Commit**

```bash
git add supabase/migrations/20261001100000_mc_fase1a_estrutura.sql supabase/provas/mc_fase1_banco.sql
git commit -m "Medição de contratos: estrutura do banco, RLS por contrato e auditoria"
```

---

### Task 2: Cálculo em view

**Files:**
- Create: `supabase/migrations/20261001110000_mc_fase1b_calculo.sql`
- Modify: `supabase/provas/mc_fase1_banco.sql` (casos 2 e 3)

**Interfaces:**
- Consumes: tabelas da Task 1.
- Produces:
  - `fn_mc_valor(p_qtd numeric, p_preco numeric, p_regra text) returns numeric`
  - `mc_v_planilha_linhas(id, versao_id, contrato_id, item_id, ordem, codigo, pai_id, descricao, unidade, tipo, preco_unitario, quantidade_prevista, nivel, grupo_id, valor_previsto)`
  - `mc_v_planilha_subarvore(ancestral_id, linha_id)`
  - `mc_v_planilha_totais(id, versao_id, total_previsto)`: total da subárvore de cada linha
  - `mc_v_versao_totais(versao_id, contrato_id, total_previsto)`
  - `mc_v_medicao_itens(medicao_id, contrato_id, numero, status, item_id, planilha_item_id, preco_unitario, qtd_medida, qtd_aprovada, qtd_efetiva, glosa, qtd_acumulada, valor_medicao)`
  - `mc_v_medicao_totais(medicao_id, contrato_id, valor)`
  - `mc_v_item_acumulado(contrato_id, item_id, qtd_acumulada, valor_acumulado_exato, valor_acumulado)`

- [ ] **Step 1: Acrescentar os casos 2 e 3 à prova**

Os casos montam os dados direto nas tabelas, como dono (antes do `set local role`), porque as RPCs de contrato só chegam na Task 4 e as de lançamento e medição só nas Fases 4 e 5. Os gatilhos da Task 3 valem para o dono também, e é isso que a prova quer. Substituir a linha `-- [casos 2 em diante entram nas próximas tasks]` por:

```sql
  -- Dados de K1 (cálculo) e K2 (versões e travas), montados como dono.
  insert into public.mc_contratos (codigo, nome_obra, objeto, numero_contrato, contratante_nome, contratante_tipo,
    valor_inicial, data_assinatura, prazo_meses, regra_arredondamento, created_by)
  values ('PROVA-K1', 'Prova K1', 'Prova', 'K1', 'Contratante prova', 'privado', 123.03, '2025-12-01', 12, 'item_por_medicao', v_tiago)
  returning id into v_k1;
  insert into public.mc_contrato_usuarios (contrato_id, usuario_id) values (v_k1, v_tiago);
  perform public.fn_mc_prova_planilha(v_k1, 0, null, '2025-12-01', jsonb_build_array(
    jsonb_build_object('ordem', 1, 'codigo', '01', 'descricao', 'Grupo A', 'tipo', 'titulo'),
    jsonb_build_object('ordem', 2, 'codigo', '01.01', 'pai', 1, 'descricao', 'Serviço 1', 'unidade', 'un', 'tipo', 'servico', 'preco', '0.335', 'qtd', '3'),
    jsonb_build_object('ordem', 3, 'codigo', '01.02', 'pai', 1, 'descricao', 'Serviço 2', 'unidade', 'm2', 'tipo', 'servico', 'preco', '0.335', 'qtd', '3'),
    jsonb_build_object('ordem', 4, 'codigo', '01.02.01', 'pai', 3, 'descricao', 'Filho com preço', 'unidade', 't', 'tipo', 'servico', 'preco', '10.004', 'qtd', '2'),
    jsonb_build_object('ordem', 5, 'codigo', '02', 'descricao', 'Grupo B', 'tipo', 'titulo'),
    jsonb_build_object('ordem', 6, 'codigo', '02.01', 'pai', 5, 'descricao', 'Serviço 3', 'unidade', 'un', 'tipo', 'servico', 'preco', '100', 'qtd', '1'),
    jsonb_build_object('ordem', 7, 'codigo', '02.01', 'pai', 5, 'descricao', 'Código repetido', 'unidade', 'un', 'tipo', 'servico', 'preco', '1', 'qtd', '1')));

  -- 2. Previsto por linha, subárvore, grupo e total, nas três regras. Um comando por regra: dentro
  --    de um SELECT só, o update da regra não seria visto pelas views (snapshot do comando).
  v_acc := '{}'::jsonb;
  foreach v_regra in array array['item_por_medicao', 'item_por_acumulado', 'sem_arredondar'] loop
    update public.mc_contratos set regra_arredondamento = v_regra where id = v_k1;
    select jsonb_build_object(
      'linha_01_01', (select valor_previsto from public.mc_v_planilha_linhas where contrato_id = v_k1 and ordem = 2),
      'subarvore_01_02', (select t.total_previsto from public.mc_v_planilha_totais t join public.mc_planilha_itens i on i.id = t.id where i.contrato_id = v_k1 and i.ordem = 3),
      'grupo_01', (select t.total_previsto from public.mc_v_planilha_totais t join public.mc_planilha_itens i on i.id = t.id where i.contrato_id = v_k1 and i.ordem = 1),
      'grupo_02', (select t.total_previsto from public.mc_v_planilha_totais t join public.mc_planilha_itens i on i.id = t.id where i.contrato_id = v_k1 and i.ordem = 5),
      'total', (select total_previsto from public.mc_v_versao_totais where contrato_id = v_k1)) into v_j;
    v_acc := v_acc || jsonb_build_object(v_regra, v_j);
  end loop;
  r := r || jsonb_build_object('2_previsto', v_acc);

  -- 3. Medições de K1: 1ª (jan) lança 1 + 0,5; 2ª (fev) lança 1,5, as duas abertas
  perform public.fn_mc_prova_medicao(v_k1, '2026-01-01', '2026-01-31');
  perform public.fn_mc_prova_medicao(v_k1, '2026-02-01', '2026-02-28');
  insert into public.mc_lancamentos (contrato_id, item_id, medicao_id, data, quantidade)
  select v_k1, i.item_id, '00000000-0000-0000-0000-000000000000', d.data, d.qtd
  from public.mc_planilha_itens i, (values ('2026-01-10'::date, 1::numeric), ('2026-01-20', 0.5), ('2026-02-05', 1.5)) d(data, qtd)
  where i.contrato_id = v_k1 and i.ordem = 2;
  v_acc := '{}'::jsonb;
  foreach v_regra in array array['item_por_medicao', 'item_por_acumulado', 'sem_arredondar'] loop
    update public.mc_contratos set regra_arredondamento = v_regra where id = v_k1;
    select jsonb_build_object(
      'med1', (select valor_medicao from public.mc_v_medicao_itens where contrato_id = v_k1 and numero = 1),
      'med2', (select valor_medicao from public.mc_v_medicao_itens where contrato_id = v_k1 and numero = 2),
      'acumulado', (select valor_acumulado from public.mc_v_item_acumulado where contrato_id = v_k1),
      'total_med2', (select valor from public.mc_v_medicao_totais t join public.mc_medicoes m on m.id = t.medicao_id where m.contrato_id = v_k1 and m.numero = 2)) into v_j;
    v_acc := v_acc || jsonb_build_object(v_regra, v_j);
  end loop;
  r := r || jsonb_build_object('3_medicoes', v_acc);
```

O `medicao_id` zerado no insert é de propósito: o gatilho da Task 3 sobrescreve com a medição do período. Antes da Task 3 esse insert falha na FK, e é isso que a Step 2 espera.

As duas funções auxiliares da prova ficam **no topo do arquivo**, criadas antes do `do $prova$` e dentro da mesma transação do `execute_sql`. O aborto desfaz tudo, elas inclusive:

```sql
begin;
create function public.fn_mc_prova_planilha(p_contrato uuid, p_numero int, p_aditivo uuid, p_desde date, p_linhas jsonb)
returns uuid language plpgsql set search_path to '' as $$
declare v_versao uuid; l jsonb; v_item uuid; v_pai uuid;
begin
  insert into public.mc_planilha_versoes (contrato_id, numero, aditivo_id, vigente_desde)
  values (p_contrato, p_numero, p_aditivo, p_desde) returning id into v_versao;
  for l in select * from jsonb_array_elements(p_linhas) loop
    v_item := nullif(l ->> 'item_id', '')::uuid;
    if v_item is null then insert into public.mc_itens (contrato_id) values (p_contrato) returning id into v_item; end if;
    select id into v_pai from public.mc_planilha_itens where versao_id = v_versao and ordem = (l ->> 'pai')::int;
    insert into public.mc_planilha_itens (versao_id, contrato_id, item_id, ordem, codigo, pai_id, descricao, unidade, tipo, preco_unitario, quantidade_prevista)
    values (v_versao, p_contrato, v_item, (l ->> 'ordem')::int, l ->> 'codigo', v_pai, l ->> 'descricao', l ->> 'unidade', l ->> 'tipo',
            (l ->> 'preco')::numeric, (l ->> 'qtd')::numeric);
  end loop;
  update public.mc_planilha_versoes set status = 'vigente' where id = v_versao;
  return v_versao;
end $$;
create function public.fn_mc_prova_medicao(p_contrato uuid, p_ini date, p_fim date) returns uuid language sql set search_path to '' as $$
  insert into public.mc_medicoes (contrato_id, numero, periodo_inicio, periodo_fim, versao_id)
  select p_contrato, coalesce((select max(numero) from public.mc_medicoes where contrato_id = p_contrato), 0) + 1, p_ini, p_fim,
         (select id from public.mc_planilha_versoes where contrato_id = p_contrato and status = 'vigente' order by numero desc limit 1)
  returning id;
$$;
```

E o fim do arquivo passa a ser:

```sql
do $aborto$ begin raise exception 'ABORTO GARANTIDO'; end $aborto$;
rollback;
```

- [ ] **Step 2: Rodar e ver falhar**

Esperado: erro `relation "public.mc_v_planilha_linhas" does not exist`.

- [ ] **Step 3: Escrever a migration**

`supabase/migrations/20261001110000_mc_fase1b_calculo.sql`:

```sql
-- Medição de Contratos, Fase 1b: o cálculo. Nada aqui grava valor: tudo sai de view (D6, D7).
-- As views são security_invoker, então a RLS por contrato da Fase 1a vale nelas também.
--
-- regra_arredondamento (spec 6.2), configuração do contrato:
--   item_por_medicao    valor do item na medição = round(qtd x preço, 2); acumulado = soma
--   item_por_acumulado  valor na medição N = round(acum_N x preço, 2) - round(acum_N-1 x preço, 2),
--                       com o preço da versão da medição N
--   sem_arredondar      qtd x preço exato; só o total exibido é arredondado
-- Grupo e total: round(soma, 2). Nas regras por item a soma já tem 2 casas e o round não muda nada;
-- em sem_arredondar é ele que arredonda, e é daí que pode sair um centavo entre a soma dos grupos
-- e o total, como no Lote 09.
-- Regra nula: valor nulo. O contrato não tem valor enquanto a regra não for descoberta.

create or replace function public.fn_mc_valor(p_qtd numeric, p_preco numeric, p_regra text)
returns numeric language sql immutable set search_path to '' as $$
  select case p_regra
    when 'sem_arredondar' then p_qtd * p_preco
    when 'item_por_medicao' then round(p_qtd * p_preco, 2)
    when 'item_por_acumulado' then round(p_qtd * p_preco, 2)
  end;
$$;

create or replace view public.mc_v_planilha_linhas with (security_invoker = true) as
with recursive arvore as (
  select pi.id, pi.id as raiz_id, 1 as nivel
  from public.mc_planilha_itens pi where pi.pai_id is null
  union all
  select f.id, a.raiz_id, a.nivel + 1
  from public.mc_planilha_itens f join arvore a on f.pai_id = a.id
)
select pi.id, pi.versao_id, pi.contrato_id, pi.item_id, pi.ordem, pi.codigo, pi.pai_id, pi.descricao, pi.unidade,
       pi.tipo, pi.preco_unitario, pi.quantidade_prevista, a.nivel, a.raiz_id as grupo_id,
       public.fn_mc_valor(pi.quantidade_prevista, pi.preco_unitario, c.regra_arredondamento) as valor_previsto
from public.mc_planilha_itens pi
join arvore a on a.id = pi.id
join public.mc_contratos c on c.id = pi.contrato_id;

-- Fecho transitivo: cada linha é ancestral de si mesma e de toda a subárvore.
create or replace view public.mc_v_planilha_subarvore with (security_invoker = true) as
with recursive s as (
  select id as ancestral_id, id as linha_id from public.mc_planilha_itens
  union all
  select s.ancestral_id, f.id from s join public.mc_planilha_itens f on f.pai_id = s.linha_id
)
select ancestral_id, linha_id from s;

-- Total de uma linha = soma de TODAS as linhas com preço da subárvore, cada uma uma vez.
create or replace view public.mc_v_planilha_totais with (security_invoker = true) as
select s.ancestral_id as id, l.versao_id, round(sum(l.valor_previsto), 2) as total_previsto
from public.mc_v_planilha_subarvore s
join public.mc_v_planilha_linhas l on l.id = s.linha_id
where l.tipo = 'servico'
group by s.ancestral_id, l.versao_id;

create or replace view public.mc_v_versao_totais with (security_invoker = true) as
select l.versao_id, l.contrato_id, round(sum(l.valor_previsto), 2) as total_previsto
from public.mc_v_planilha_linhas l
where l.tipo = 'servico'
group by l.versao_id, l.contrato_id;

-- Quantidade medida = soma dos lançamentos ativos + soma dos ajustes da medição.
create or replace view public.mc_v_medicao_qtd with (security_invoker = true) as
select x.medicao_id, x.item_id, sum(x.lancado) as qtd_lancada, sum(x.ajustado) as qtd_ajustada,
       sum(x.lancado) + sum(x.ajustado) as qtd_medida
from (
  select medicao_id, item_id, quantidade as lancado, 0::numeric as ajustado
  from public.mc_lancamentos where excluido_em is null
  union all
  select medicao_id, item_id, 0::numeric, quantidade from public.mc_ajustes
) x
group by x.medicao_id, x.item_id;

-- Revisão aprovada vigente de cada medição: a de maior número entre as aprovadas.
create or replace view public.mc_v_medicao_revisao_aprovada with (security_invoker = true) as
select distinct on (r.medicao_id) r.medicao_id, r.id as revisao_id, r.numero
from public.mc_medicao_revisoes r
where r.status = 'aprovada'
order by r.medicao_id, r.numero desc;

create or replace view public.mc_v_medicao_itens with (security_invoker = true) as
with chaves as (
  select medicao_id, item_id from public.mc_v_medicao_qtd
  union
  select r.medicao_id, ai.item_id from public.mc_aprovacoes_item ai join public.mc_medicao_revisoes r on r.id = ai.revisao_id
), base as (
  select m.id as medicao_id, m.contrato_id, m.numero, m.status, m.versao_id, k.item_id,
         coalesce(q.qtd_medida, 0) as qtd_medida,
         -- Aprovada: o que a revisão vigente aprovou; item sem linha é zero (campo vazio vira zero).
         case when m.status = 'aprovada' then coalesce(ai.quantidade_aprovada, 0) end as qtd_aprovada
  from chaves k
  join public.mc_medicoes m on m.id = k.medicao_id
  left join public.mc_v_medicao_qtd q on q.medicao_id = k.medicao_id and q.item_id = k.item_id
  left join public.mc_v_medicao_revisao_aprovada ra on ra.medicao_id = m.id
  left join public.mc_aprovacoes_item ai on ai.revisao_id = ra.revisao_id and ai.item_id = k.item_id
), efetiva as (
  select b.*, case when b.status = 'aprovada' then b.qtd_aprovada else b.qtd_medida end as qtd_efetiva from base b
), acumulada as (
  select e.*, sum(e.qtd_efetiva) over (partition by e.contrato_id, e.item_id order by e.numero) as qtd_acumulada from efetiva e
)
select a.medicao_id, a.contrato_id, a.numero, a.status, a.item_id, pi.id as planilha_item_id, pi.preco_unitario,
       a.qtd_medida, a.qtd_aprovada, a.qtd_efetiva, a.qtd_medida - a.qtd_aprovada as glosa, a.qtd_acumulada,
       case c.regra_arredondamento
         when 'item_por_acumulado' then
           round(a.qtd_acumulada * pi.preco_unitario, 2) - round((a.qtd_acumulada - a.qtd_efetiva) * pi.preco_unitario, 2)
         else public.fn_mc_valor(a.qtd_efetiva, pi.preco_unitario, c.regra_arredondamento)
       end as valor_medicao
from acumulada a
join public.mc_contratos c on c.id = a.contrato_id
left join public.mc_planilha_itens pi on pi.versao_id = a.versao_id and pi.item_id = a.item_id;

create or replace view public.mc_v_medicao_totais with (security_invoker = true) as
select m.id as medicao_id, m.contrato_id, round(coalesce(sum(i.valor_medicao), 0), 2) as valor
from public.mc_medicoes m
left join public.mc_v_medicao_itens i on i.medicao_id = m.id
group by m.id, m.contrato_id;

create or replace view public.mc_v_item_acumulado with (security_invoker = true) as
select contrato_id, item_id, sum(qtd_efetiva) as qtd_acumulada, sum(valor_medicao) as valor_acumulado_exato,
       round(sum(valor_medicao), 2) as valor_acumulado
from public.mc_v_medicao_itens
group by contrato_id, item_id;

do $grants$
declare v text;
begin
  foreach v in array array['mc_v_planilha_linhas', 'mc_v_planilha_subarvore', 'mc_v_planilha_totais', 'mc_v_versao_totais',
                           'mc_v_medicao_qtd', 'mc_v_medicao_revisao_aprovada', 'mc_v_medicao_itens',
                           'mc_v_medicao_totais', 'mc_v_item_acumulado'] loop
    execute format('revoke all on public.%I from anon, authenticated', v);
    execute format('grant select on public.%I to authenticated', v);
  end loop;
end $grants$;
revoke all on function public.fn_mc_valor(numeric, numeric, text) from public, anon;
grant execute on function public.fn_mc_valor(numeric, numeric, text) to authenticated;
```

- [ ] **Step 4: Aplicar, advisors, rodar a prova**

`apply_migration` (`mc_fase1b_calculo`), `get_advisors`. Rodar a prova. O caso 3 ainda falha na FK do `medicao_id` zerado (o gatilho é da Task 3). Para esta task, confira o caso 2 comentando temporariamente o bloco do caso 3 **no arquivo local**, sem commitar o comentário. Esperado:

```json
"2_previsto": {
  "item_por_medicao":   {"linha_01_01": 1.01, "subarvore_01_02": 21.02, "grupo_01": 22.03, "grupo_02": 101.00, "total": 123.03},
  "item_por_acumulado": {"linha_01_01": 1.01, "subarvore_01_02": 21.02, "grupo_01": 22.03, "grupo_02": 101.00, "total": 123.03},
  "sem_arredondar":     {"linha_01_01": 1.005, "subarvore_01_02": 21.01, "grupo_01": 22.02, "grupo_02": 101.00, "total": 123.02}
}
```

Volte o caso 3 ao arquivo.

- [ ] **Step 5: Mutação**

Numa transação desfeita, recrie `mc_v_planilha_totais` somando também os títulos com valor zero E contando o pai duas vezes (`union all` da subárvore com as linhas diretas). O `subarvore_01_02` tem de sair de 21,02. Em outra, troque `round(p_qtd * p_preco, 2)` por `trunc(p_qtd * p_preco, 2)`: `linha_01_01` tem de sair 1,00. Se algum número não mudar, a prova é fraca: conserte antes de seguir.

- [ ] **Step 6: Commit**

```bash
git add supabase/migrations/20261001110000_mc_fase1b_calculo.sql supabase/provas/mc_fase1_banco.sql
git commit -m "Medição de contratos: cálculo por view nas três regras de arredondamento"
```

---

### Task 3: Travas (imutabilidade, roteamento do lançamento, numeração)

**Files:**
- Create: `supabase/migrations/20261001120000_mc_fase1c_travas.sql`
- Modify: `supabase/provas/mc_fase1_banco.sql` (caso 3 passa; casos 4 e 5)

**Interfaces:**
- Produces: gatilhos `trg_mc_*`; `fn_mc_rotulo_status(text) returns text`. Todo erro de trava sai com `errcode 'P0001'` e mensagem em pt-BR (o `mensagemDeNegocio` da action repassa P0001).
- A carga da Fase 2 liga `set_config('app.mc_carga', '1', true)` para gravar ajuste e aprovação em medição que já nasce aprovada. Nenhum outro caminho usa essa chave.

- [ ] **Step 1: Acrescentar os casos 4 e 5 à prova**

Depois do caso 3:

```sql
  -- K2: versões, glosa, travas
  insert into public.mc_contratos (codigo, nome_obra, objeto, numero_contrato, contratante_nome, contratante_tipo,
    valor_inicial, data_assinatura, prazo_meses, regra_arredondamento, created_by)
  values ('PROVA-K2', 'Prova K2', 'Prova', 'K2', 'Contratante prova', 'municipal', 3.35, '2025-12-01', 12, 'item_por_medicao', v_tiago)
  returning id into v_k2;
  insert into public.mc_contrato_usuarios (contrato_id, usuario_id) values (v_k2, v_tiago);
  perform public.fn_mc_prova_planilha(v_k2, 0, null, '2025-12-01', jsonb_build_array(
    jsonb_build_object('ordem', 1, 'codigo', '01', 'descricao', 'Grupo', 'tipo', 'titulo'),
    jsonb_build_object('ordem', 2, 'codigo', '01.01', 'pai', 1, 'descricao', 'Serviço', 'unidade', 'un', 'tipo', 'servico', 'preco', '0.335', 'qtd', '10')));
  perform public.fn_mc_prova_medicao(v_k2, '2026-01-01', '2026-01-31');
  insert into public.mc_lancamentos (contrato_id, item_id, medicao_id, data, quantidade)
  select v_k2, item_id, '00000000-0000-0000-0000-000000000000', '2026-01-15', 1.5 from public.mc_planilha_itens where contrato_id = v_k2 and ordem = 2;

  -- 4a. Lançamento caiu na medição do período
  select numero::text into v_txt from public.mc_lancamentos l join public.mc_medicoes m on m.id = l.medicao_id where l.contrato_id = v_k2;
  r := r || jsonb_build_object('4a_lancamento_na_1a', v_txt);

  -- Aprova a 1ª de K2 com 1,2 (medida 1,5): glosa 0,3, valor 0,40
  insert into public.mc_medicao_revisoes (medicao_id, contrato_id, numero) select id, v_k2, 0 from public.mc_medicoes where contrato_id = v_k2 and numero = 1;
  insert into public.mc_aprovacoes_item (revisao_id, item_id, contrato_id, quantidade_aprovada)
  select r2.id, i.item_id, v_k2, 1.2 from public.mc_medicao_revisoes r2, public.mc_planilha_itens i where r2.contrato_id = v_k2 and i.contrato_id = v_k2 and i.ordem = 2;
  update public.mc_medicao_revisoes set status = 'aprovada' where contrato_id = v_k2;
  update public.mc_medicoes set status = 'aprovada', aprovada_em = now() where contrato_id = v_k2 and numero = 1;
  select jsonb_build_object('glosa', glosa, 'valor', valor_medicao) into strict v_txt from public.mc_v_medicao_itens where contrato_id = v_k2 and numero = 1;
  r := r || jsonb_build_object('4b_aprovada_glosa', v_txt::jsonb);

  -- 4c. Aditivo 1 + v1 a partir de 01/02: 01.01 muda para 12 x 0,4; entra 01.02 (5 x 2)
  insert into public.mc_aditivos (contrato_id, numero, data_assinatura, data_vigencia, tipos, motivo)
  values (v_k2, 1, '2026-01-25', '2026-02-01', array['quantidade', 'valor', 'inclusao_item'], 'Prova');
  perform public.fn_mc_prova_planilha(v_k2, 1, (select id from public.mc_aditivos where contrato_id = v_k2), '2026-02-01', jsonb_build_array(
    jsonb_build_object('ordem', 1, 'codigo', '01', 'descricao', 'Grupo', 'tipo', 'titulo',
                       'item_id', (select item_id from public.mc_planilha_itens where contrato_id = v_k2 and ordem = 1 limit 1)),
    jsonb_build_object('ordem', 2, 'codigo', '01.01', 'pai', 1, 'descricao', 'Serviço', 'unidade', 'un', 'tipo', 'servico', 'preco', '0.4', 'qtd', '12',
                       'item_id', (select item_id from public.mc_planilha_itens where contrato_id = v_k2 and ordem = 2 limit 1)),
    jsonb_build_object('ordem', 3, 'codigo', '01.02', 'pai', 1, 'descricao', 'Novo', 'unidade', 'm', 'tipo', 'servico', 'preco', '2', 'qtd', '5')));
  perform public.fn_mc_prova_medicao(v_k2, '2026-02-01', '2026-02-28');
  insert into public.mc_lancamentos (contrato_id, item_id, medicao_id, data, quantidade)
  select v_k2, item_id, '00000000-0000-0000-0000-000000000000', '2026-02-10', 1.5 from public.mc_planilha_itens where contrato_id = v_k2 and ordem = 2 limit 1;
  select jsonb_build_object(
    'total_v1', (select total_previsto from public.mc_v_versao_totais t join public.mc_planilha_versoes v on v.id = t.versao_id where v.contrato_id = v_k2 and v.numero = 1),
    'valor_med2', (select valor_medicao from public.mc_v_medicao_itens where contrato_id = v_k2 and numero = 2),
    'qtd_acum', (select qtd_acumulada from public.mc_v_item_acumulado where contrato_id = v_k2),
    'valor_acum', (select valor_acumulado from public.mc_v_item_acumulado where contrato_id = v_k2)) into v_txt;
  r := r || jsonb_build_object('4c_versoes', v_txt::jsonb);

  -- 5. Travas: cada uma tem de recusar
  begin insert into public.mc_lancamentos (contrato_id, item_id, medicao_id, data, quantidade)
    select v_k2, item_id, '00000000-0000-0000-0000-000000000000', '2025-12-31', 1 from public.mc_planilha_itens where contrato_id = v_k2 and ordem = 2 limit 1;
    v_txt := 'PASSOU (errado)'; exception when others then v_txt := 'recusou: ' || sqlerrm; end;
  r := r || jsonb_build_object('5a_sem_medicao', v_txt);
  begin insert into public.mc_lancamentos (contrato_id, item_id, medicao_id, data, quantidade)
    select v_k2, item_id, '00000000-0000-0000-0000-000000000000', '2026-02-11', 1 from public.mc_planilha_itens where contrato_id = v_k2 and ordem = 1 limit 1;
    v_txt := 'PASSOU (errado)'; exception when others then v_txt := 'recusou: ' || sqlerrm; end;
  r := r || jsonb_build_object('5b_titulo', v_txt);
  begin perform public.fn_mc_prova_medicao(v_k2, '2026-02-20', '2026-03-10');
    v_txt := 'PASSOU (errado)'; exception when others then v_txt := 'recusou: ' || sqlerrm; end;
  r := r || jsonb_build_object('5c_sobreposicao', v_txt);
  update public.mc_medicoes set status = 'em_conferencia' where contrato_id = v_k2 and numero = 2;
  begin insert into public.mc_lancamentos (contrato_id, item_id, medicao_id, data, quantidade)
    select v_k2, item_id, '00000000-0000-0000-0000-000000000000', '2026-02-12', 1 from public.mc_planilha_itens where contrato_id = v_k2 and ordem = 2 limit 1;
    v_txt := 'PASSOU (errado)'; exception when others then v_txt := 'recusou: ' || sqlerrm; end;
  r := r || jsonb_build_object('5d_em_conferencia', v_txt);
  begin update public.mc_medicoes set periodo_fim = '2026-01-30' where contrato_id = v_k2 and numero = 1;
    v_txt := 'PASSOU (errado)'; exception when others then v_txt := 'recusou: ' || sqlerrm; end;
  r := r || jsonb_build_object('5e1_aprovada_update', v_txt);
  begin delete from public.mc_medicoes where contrato_id = v_k2 and numero = 1;
    v_txt := 'PASSOU (errado)'; exception when others then v_txt := 'recusou: ' || sqlerrm; end;
  r := r || jsonb_build_object('5e2_aprovada_delete', v_txt);
  begin insert into public.mc_ajustes (medicao_id, contrato_id, revisao_id, item_id, quantidade, motivo)
    select m.id, v_k2, rv.id, i.item_id, 1, 'Tentativa' from public.mc_medicoes m join public.mc_medicao_revisoes rv on rv.medicao_id = m.id
    join public.mc_planilha_itens i on i.versao_id = m.versao_id and i.ordem = 2 where m.contrato_id = v_k2 and m.numero = 1;
    v_txt := 'PASSOU (errado)'; exception when others then v_txt := 'recusou: ' || sqlerrm; end;
  r := r || jsonb_build_object('5e3_ajuste_em_aprovada', v_txt);
  begin update public.mc_lancamentos set excluido_em = now(), motivo_exclusao = 'x' where contrato_id = v_k2 and data = '2026-01-15';
    v_txt := 'PASSOU (errado)'; exception when others then v_txt := 'recusou: ' || sqlerrm; end;
  r := r || jsonb_build_object('5e4_lancamento_de_aprovada', v_txt);
  begin update public.mc_aprovacoes_item set quantidade_aprovada = 1.5 where contrato_id = v_k2;
    v_txt := 'PASSOU (errado)'; exception when others then v_txt := 'recusou: ' || sqlerrm; end;
  r := r || jsonb_build_object('5e5_aprovacao_alterada', v_txt);
  begin update public.mc_planilha_itens set preco_unitario = 1 where contrato_id = v_k2 and ordem = 2;
    v_txt := 'PASSOU (errado)'; exception when others then v_txt := 'recusou: ' || sqlerrm; end;
  r := r || jsonb_build_object('5f_versao_vigente', v_txt);
  begin update public.mc_contratos set regra_arredondamento = 'sem_arredondar' where id = v_k2;
    v_txt := 'PASSOU (errado)'; exception when others then v_txt := 'recusou: ' || sqlerrm; end;
  r := r || jsonb_build_object('5g_regra_com_aprovada', v_txt);
  begin insert into public.mc_medicoes (contrato_id, numero, periodo_inicio, periodo_fim, versao_id)
    select v_k2, 5, '2026-04-01', '2026-04-30', versao_id from public.mc_medicoes where contrato_id = v_k2 and numero = 2;
    v_txt := 'PASSOU (errado)'; exception when others then v_txt := 'recusou: ' || sqlerrm; end;
  r := r || jsonb_build_object('5h_numero_fora_de_ordem', v_txt);
  insert into public.mc_ajustes (medicao_id, contrato_id, revisao_id, item_id, quantidade, motivo)
  select m.id, v_k1, rv.id, i.item_id, 0.1, 'Ajuste de prova' from public.mc_medicoes m
    join public.mc_medicao_revisoes rv on rv.medicao_id = m.id join public.mc_planilha_itens i on i.versao_id = m.versao_id and i.ordem = 2
    where m.contrato_id = v_k1 and m.numero = 1;
  begin update public.mc_ajustes set quantidade = 0.2 where contrato_id = v_k1;
    v_txt := 'PASSOU (errado)'; exception when others then v_txt := 'recusou: ' || sqlerrm; end;
  r := r || jsonb_build_object('5i_ajuste_alterado', v_txt);
```

O caso 5i precisa de uma revisão em K1 e roda depois do caso 3, então o ajuste de 0,1 não mexe nos números já lidos. Antes dele, acrescente: `insert into public.mc_medicao_revisoes (medicao_id, contrato_id, numero) select id, v_k1, 0 from public.mc_medicoes where contrato_id = v_k1 and numero = 1;`.

- [ ] **Step 2: Rodar e ver falhar**

Esperado: falha no insert do caso 3 (`violates foreign key constraint`, `medicao_id` zerado). Sem o gatilho, nada roteia.

- [ ] **Step 3: Escrever a migration**

`supabase/migrations/20261001120000_mc_fase1c_travas.sql`:

```sql
-- Medição de Contratos, Fase 1c: as travas no banco (spec seções 7 e 8). Valem para qualquer
-- papel, dono inclusive: a tela não é a barreira.
-- app.mc_carga = '1' libera só a carga da Fase 2 a gravar ajuste e aprovação em medição que nasce
-- aprovada. Nenhuma tela liga essa chave.

create or replace function public.fn_mc_rotulo_status(p_status text)
returns text language sql immutable set search_path to '' as $$
  select case p_status when 'aberta' then 'aberta' when 'em_conferencia' then 'em conferência'
                       when 'enviada' then 'enviada' when 'aprovada' then 'aprovada' else p_status end;
$$;

create or replace function public.fn_mc_em_carga()
returns boolean language sql stable set search_path to '' as $$
  select coalesce(current_setting('app.mc_carga', true), '') = '1';
$$;

-- Linha de versão vigente não muda.
create or replace function public.fn_mc_trava_linha_versao()
returns trigger language plpgsql set search_path to '' as $$
declare v_status text; v_numero int;
begin
  select status, numero into v_status, v_numero from public.mc_planilha_versoes where id = coalesce(new.versao_id, old.versao_id);
  if v_status = 'vigente' then
    raise exception 'A versão % da planilha está vigente e não pode ser alterada. Mudança na planilha entra por aditivo', v_numero
      using errcode = 'P0001';
  end if;
  return coalesce(new, old);
end $$;
create trigger trg_mc_trava_linha_versao before insert or update or delete on public.mc_planilha_itens
  for each row execute function public.fn_mc_trava_linha_versao();

-- Versão vigente só volta a rascunho se nenhuma medição a usa; fora isso não muda nem sai.
create or replace function public.fn_mc_trava_versao()
returns trigger language plpgsql set search_path to '' as $$
begin
  if tg_op = 'DELETE' then
    if old.status = 'vigente' then raise exception 'A versão % está vigente e não pode ser apagada', old.numero using errcode = 'P0001'; end if;
    return old;
  end if;
  if old.status = 'vigente' then
    if new.status = 'rascunho'
       and (new.contrato_id, new.numero, new.aditivo_id, new.vigente_desde, new.excluido_em)
           is not distinct from (old.contrato_id, old.numero, old.aditivo_id, old.vigente_desde, old.excluido_em) then
      if exists (select 1 from public.mc_medicoes where versao_id = old.id) then
        raise exception 'A versão % já é usada por medição e não pode voltar a rascunho', old.numero using errcode = 'P0001';
      end if;
      return new;
    end if;
    raise exception 'A versão % da planilha está vigente e não pode ser alterada', old.numero using errcode = 'P0001';
  end if;
  return new;
end $$;
create trigger trg_mc_trava_versao before update or delete on public.mc_planilha_versoes
  for each row execute function public.fn_mc_trava_versao();

-- Medição: número em sequência, versão vigente, aprovada imutável.
create or replace function public.fn_mc_trava_medicao()
returns trigger language plpgsql set search_path to '' as $$
declare v_max int; v_status_versao text;
begin
  if tg_op = 'DELETE' then
    if old.status = 'aprovada' then
      raise exception 'A %ª medição está aprovada e não pode ser apagada', old.numero using errcode = 'P0001';
    end if;
    return old;
  end if;
  if tg_op = 'UPDATE' and old.status = 'aprovada' then
    raise exception 'A %ª medição está aprovada e é imutável. Correção entra por revisão pós-aprovação', old.numero using errcode = 'P0001';
  end if;
  if tg_op = 'INSERT' then
    perform pg_advisory_xact_lock(hashtextextended('mc_medicao:' || new.contrato_id::text, 0));
    select coalesce(max(numero), 0) into v_max from public.mc_medicoes where contrato_id = new.contrato_id;
    if new.numero <> v_max + 1 then
      raise exception 'A próxima medição do contrato é a %ª, não a %ª', v_max + 1, new.numero using errcode = 'P0001';
    end if;
  end if;
  if tg_op = 'INSERT' or new.versao_id is distinct from old.versao_id then
    select status into v_status_versao from public.mc_planilha_versoes where id = new.versao_id;
    if v_status_versao is distinct from 'vigente' then
      raise exception 'A medição só usa versão vigente da planilha' using errcode = 'P0001';
    end if;
  end if;
  return new;
end $$;
create trigger trg_mc_trava_medicao before insert or update or delete on public.mc_medicoes
  for each row execute function public.fn_mc_trava_medicao();

-- Lançamento: o banco escolhe a medição pela data; só entra e só muda em medição aberta.
create or replace function public.fn_mc_lancamento_medicao()
returns trigger language plpgsql set search_path to '' as $$
declare m record; v_codigo text;
begin
  if tg_op in ('UPDATE', 'DELETE') then
    select numero, status into m from public.mc_medicoes where id = old.medicao_id;
    if m.status <> 'aberta' then
      raise exception 'O lançamento é da %ª medição, que está %. Ele só muda enquanto a medição está aberta',
        m.numero, public.fn_mc_rotulo_status(m.status) using errcode = 'P0001';
    end if;
    if tg_op = 'DELETE' then return old; end if;
  end if;
  select c.codigo into v_codigo from public.mc_contratos c where c.id = new.contrato_id;
  select id, numero, status, periodo_inicio, periodo_fim, versao_id into m
  from public.mc_medicoes where contrato_id = new.contrato_id and new.data between periodo_inicio and periodo_fim;
  if not found then
    raise exception 'Não há medição para % no contrato %. Abra a medição do período antes de lançar',
      to_char(new.data, 'DD/MM/YYYY'), v_codigo using errcode = 'P0001';
  end if;
  if m.status <> 'aberta' then
    raise exception 'Não há medição aberta para % no contrato %. A %ª medição (% a %) está %',
      to_char(new.data, 'DD/MM/YYYY'), v_codigo, m.numero, to_char(m.periodo_inicio, 'DD/MM/YYYY'),
      to_char(m.periodo_fim, 'DD/MM/YYYY'), public.fn_mc_rotulo_status(m.status) using errcode = 'P0001';
  end if;
  if not exists (select 1 from public.mc_planilha_itens where versao_id = m.versao_id and item_id = new.item_id and tipo = 'servico') then
    raise exception 'O item não é serviço na versão da planilha da %ª medição. Título não recebe lançamento', m.numero using errcode = 'P0001';
  end if;
  new.medicao_id := m.id;
  return new;
end $$;
create trigger trg_mc_lancamento_medicao before insert or update or delete on public.mc_lancamentos
  for each row execute function public.fn_mc_lancamento_medicao();

-- Ajuste: não se altera nem se apaga (corrige-se com outro ajuste). Entra em medição aberta ou em
-- conferência, ou em revisão pós-aprovação em aberto.
create or replace function public.fn_mc_trava_ajuste()
returns trigger language plpgsql set search_path to '' as $$
declare v_status text; v_numero int; v_fase text; v_rev_status text;
begin
  if tg_op <> 'INSERT' then
    raise exception 'Ajuste não se altera nem se apaga. Lance outro ajuste com o motivo' using errcode = 'P0001';
  end if;
  if not exists (select 1 from public.mc_medicoes m join public.mc_planilha_itens i on i.versao_id = m.versao_id
                 where m.id = new.medicao_id and i.item_id = new.item_id and i.tipo = 'servico') then
    raise exception 'O item do ajuste não é serviço na versão da planilha desta medição' using errcode = 'P0001';
  end if;
  if public.fn_mc_em_carga() then return new; end if;
  select m.status, m.numero into v_status, v_numero from public.mc_medicoes m where m.id = new.medicao_id;
  select fase, status into v_fase, v_rev_status from public.mc_medicao_revisoes where id = new.revisao_id;
  if v_status in ('aberta', 'em_conferencia') and v_rev_status = 'em_aberto' then return new; end if;
  if v_status = 'aprovada' and v_fase = 'pos_aprovacao' and v_rev_status = 'em_aberto' then return new; end if;
  raise exception 'A %ª medição está % e não recebe ajuste nesta revisão', v_numero, public.fn_mc_rotulo_status(v_status)
    using errcode = 'P0001';
end $$;
create trigger trg_mc_trava_ajuste before insert or update or delete on public.mc_ajustes
  for each row execute function public.fn_mc_trava_ajuste();

-- Quantidade aprovada e quantidade congelada: só mudam com a revisão em aberto.
create or replace function public.fn_mc_trava_filho_revisao()
returns trigger language plpgsql set search_path to '' as $$
declare v_status text; v_numero int;
begin
  if public.fn_mc_em_carga() then return coalesce(new, old); end if;
  select status, numero into v_status, v_numero from public.mc_medicao_revisoes where id = coalesce(new.revisao_id, old.revisao_id);
  if v_status <> 'em_aberto' then
    raise exception 'A REV% está % e não muda mais', lpad(v_numero::text, 2, '0'), v_status using errcode = 'P0001';
  end if;
  return coalesce(new, old);
end $$;
create trigger trg_mc_trava_aprovacoes before insert or update or delete on public.mc_aprovacoes_item
  for each row execute function public.fn_mc_trava_filho_revisao();
create trigger trg_mc_trava_revisao_itens before insert or update or delete on public.mc_revisao_itens
  for each row execute function public.fn_mc_trava_filho_revisao();

-- Revisão aprovada só passa a substituída; substituída não muda; aprovada não sai.
create or replace function public.fn_mc_trava_revisao()
returns trigger language plpgsql set search_path to '' as $$
begin
  if tg_op = 'DELETE' then
    if old.status in ('aprovada', 'substituida') then
      raise exception 'A REV% está % e não pode ser apagada', lpad(old.numero::text, 2, '0'), old.status using errcode = 'P0001';
    end if;
    return old;
  end if;
  if old.status = 'substituida'
     or (old.status = 'aprovada' and not (new.status = 'substituida' and new.numero = old.numero and new.medicao_id = old.medicao_id)) then
    raise exception 'A REV% está % e não muda mais', lpad(old.numero::text, 2, '0'), old.status using errcode = 'P0001';
  end if;
  return new;
end $$;
create trigger trg_mc_trava_revisao before update or delete on public.mc_medicao_revisoes
  for each row execute function public.fn_mc_trava_revisao();

-- Regra de arredondamento: com medição aprovada, trocar a regra mudaria valor aprovado.
create or replace function public.fn_mc_trava_regra()
returns trigger language plpgsql set search_path to '' as $$
begin
  if new.regra_arredondamento is distinct from old.regra_arredondamento
     and exists (select 1 from public.mc_medicoes where contrato_id = old.id and status = 'aprovada') then
    raise exception 'O contrato % já tem medição aprovada: a regra de arredondamento não muda mais', old.codigo using errcode = 'P0001';
  end if;
  return new;
end $$;
create trigger trg_mc_trava_regra before update on public.mc_contratos
  for each row execute function public.fn_mc_trava_regra();

do $fn$
declare f text;
begin
  foreach f in array array['fn_mc_rotulo_status(text)', 'fn_mc_em_carga()', 'fn_mc_trava_linha_versao()', 'fn_mc_trava_versao()',
                           'fn_mc_trava_medicao()', 'fn_mc_lancamento_medicao()', 'fn_mc_trava_ajuste()',
                           'fn_mc_trava_filho_revisao()', 'fn_mc_trava_revisao()', 'fn_mc_trava_regra()'] loop
    execute format('revoke all on function public.%s from public, anon', f);
  end loop;
  execute 'grant execute on function public.fn_mc_rotulo_status(text) to authenticated';
end $fn$;
```

- [ ] **Step 4: Aplicar, advisors, rodar a prova**

Esperado nos casos novos:

```json
"3_medicoes": {
  "item_por_medicao":   {"med1": 0.50, "med2": 0.50, "acumulado": 1.00, "total_med2": 0.50},
  "item_por_acumulado": {"med1": 0.50, "med2": 0.51, "acumulado": 1.01, "total_med2": 0.51},
  "sem_arredondar":     {"med1": 0.5025, "med2": 0.5025, "acumulado": 1.01, "total_med2": 0.50}
},
"4a_lancamento_na_1a": "1",
"4b_aprovada_glosa": {"glosa": 0.3, "valor": 0.40},
"4c_versoes": {"total_v1": 14.80, "valor_med2": 0.60, "qtd_acum": 2.7, "valor_acum": 1.00}
```

`total_med2` em `sem_arredondar` é round(0,5025, 2) = 0,50. Todos os `5*` começam com `recusou:` e a mensagem é a da trava certa (5a "Não há medição para 31/12/2025", 5b "Título não recebe lançamento", 5c `conflicting key value violates exclusion constraint "mc_medicoes_sem_sobreposicao"`, 5d "está em conferência", 5e1 "é imutável", 5e2 "não pode ser apagada", 5e3 "não recebe ajuste", 5e4 "que está aprovada", 5e5 "REV00 está aprovada", 5f "está vigente", 5g "regra de arredondamento não muda mais", 5h "é a 3ª, não a 5ª", 5i "não se altera nem se apaga").

- [ ] **Step 5: Mutação**

Em transação desfeita, recrie `fn_mc_lancamento_medicao` sem o teste `m.status <> 'aberta'`: o `5d` tem de virar `PASSOU (errado)`. Recrie `fn_mc_trava_medicao` sem o bloco `old.status = 'aprovada'`: `5e1` tem de virar `PASSOU (errado)`. Desfaça.

- [ ] **Step 6: Commit**

```bash
git add supabase/migrations/20261001120000_mc_fase1c_travas.sql supabase/provas/mc_fase1_banco.sql
git commit -m "Medição de contratos: travas no banco (aprovada imutável, lançamento só em medição aberta)"
```

---

### Task 4: RPCs de contrato, acesso, aditivo e planilha

**Files:**
- Create: `supabase/migrations/20261001130000_mc_fase1d_rpcs.sql`
- Modify: `supabase/provas/mc_fase1_banco.sql` (casos 4d, 4e, 6)

**Interfaces (todas `security definer`, erro de negócio com `errcode 'P0001'`):**
- `fn_mc_contrato_salvar(p_dados jsonb, p_id uuid default null) returns uuid`
- `fn_mc_acesso_definir(p_contrato uuid, p_usuario uuid, p_tem boolean) returns void`
- `fn_mc_usuarios_do_contrato(p_contrato uuid) returns table (usuario_id uuid, nome text, email text, ativo boolean)`
- `fn_mc_usuarios_ativos() returns table (id uuid, nome text, email text)`
- `fn_mc_aditivo_salvar(p_contrato uuid, p_dados jsonb, p_id uuid default null) returns uuid`
- `fn_mc_planilha_criar_rascunho(p_contrato uuid, p_dados jsonb) returns uuid`: `p_dados = {aditivo_id?, vigente_desde, motivo?}`
- `fn_mc_planilha_gravar_linhas(p_versao uuid, p_linhas jsonb, p_arquivo_nome text, p_arquivo_hash text) returns integer`: `p_linhas = [{ordem, codigo, pai_ordem|null, descricao, unidade|null, tipo, preco_unitario: string|null, quantidade_prevista: string|null, linha_origem, item_id|null}]`
- `fn_mc_planilha_aprovar(p_versao uuid) returns void`
- `fn_mc_planilha_desaprovar(p_versao uuid, p_motivo text) returns void`
- `fn_mc_excluir(p_tabela text, p_id uuid, p_motivo text) returns void` para `mc_contratos`, `mc_aditivos`, `mc_planilha_versoes`
- `fn_mc_restaurar(p_tabela text, p_id uuid) returns void`

- [ ] **Step 1: Acrescentar os casos à prova**

Antes do caso 9:

```sql
  -- 4d/4e. Rascunho pela RPC: gravar duas vezes substitui; segundo rascunho é recusado
  perform set_config('request.jwt.claims', json_build_object('sub', v_tiago, 'role', 'authenticated')::text, true);
  insert into public.usuario_permissoes (usuario_id, recurso, acao)
  select v_tiago, x.recurso, x.acao from (values ('medicao.contratos', 'ver'), ('medicao.contratos', 'criar'), ('medicao.contratos', 'editar'),
    ('medicao.planilha', 'ver'), ('medicao.planilha', 'criar'), ('medicao.planilha', 'aprovar')) x(recurso, acao)
  on conflict do nothing;
  set local role authenticated;
  v_k3 := public.fn_mc_contrato_salvar(jsonb_build_object('codigo', 'prova-k3', 'nome_obra', 'Prova K3', 'objeto', 'Prova',
    'numero_contrato', 'K3', 'contratante_nome', 'Prova', 'contratante_tipo', 'estadual', 'valor_inicial', '10',
    'data_assinatura', '2026-01-01', 'prazo_meses', 12));
  perform public.fn_mc_planilha_criar_rascunho(v_k3, jsonb_build_object('vigente_desde', '2026-01-01'));
  for v_n in 1..2 loop
    perform public.fn_mc_planilha_gravar_linhas(
      (select id from public.mc_planilha_versoes where contrato_id = v_k3), jsonb_build_array(
        jsonb_build_object('ordem', 1, 'codigo', '01', 'pai_ordem', null, 'descricao', 'Grupo', 'unidade', null, 'tipo', 'titulo',
                           'preco_unitario', null, 'quantidade_prevista', null, 'linha_origem', 5, 'item_id', null),
        jsonb_build_object('ordem', 2, 'codigo', '01.01', 'pai_ordem', 1, 'descricao', 'Serviço', 'unidade', 'un', 'tipo', 'servico',
                           'preco_unitario', '580.86429961', 'quantidade_prevista', '17057.717', 'linha_origem', 6, 'item_id', null)),
      'planilha.xlsx', 'abc');
  end loop;
  select jsonb_build_object('linhas', (select count(*) from public.mc_planilha_itens where contrato_id = v_k3),
    'preco_cheio', (select preco_unitario::text from public.mc_planilha_itens where contrato_id = v_k3 and ordem = 2),
    'codigo_maiusculo', (select codigo from public.mc_contratos where id = v_k3),
    'criador_na_lista', exists (select 1 from public.mc_contrato_usuarios where contrato_id = v_k3 and usuario_id = v_tiago)) into v_txt;
  r := r || jsonb_build_object('4d_gravar_duas_vezes', v_txt::jsonb);
  begin perform public.fn_mc_planilha_criar_rascunho(v_k3, jsonb_build_object('vigente_desde', '2026-01-01'));
    v_txt := 'PASSOU (errado)'; exception when others then v_txt := 'recusou: ' || sqlerrm; end;
  r := r || jsonb_build_object('4e_segundo_rascunho', v_txt);
  perform public.fn_mc_planilha_aprovar((select id from public.mc_planilha_versoes where contrato_id = v_k3));
  r := r || jsonb_build_object('4f_aprovada', (select status from public.mc_planilha_versoes where contrato_id = v_k3));
  reset role;

  -- 6. Acesso por contrato
  insert into public.usuario_permissoes (usuario_id, recurso, acao)
  values (v_zero, 'medicao.contratos', 'ver'), (v_zero, 'medicao.planilha', 'ver') on conflict do nothing;
  perform set_config('request.jwt.claims', json_build_object('sub', v_zero, 'role', 'authenticated')::text, true);
  set local role authenticated;
  r := r || jsonb_build_object('6a_fora_da_lista',
    jsonb_build_object('contratos', (select count(*) from public.mc_contratos where codigo like 'PROVA-%'),
                       'linhas', (select count(*) from public.mc_planilha_itens where contrato_id in (v_k1, v_k2, v_k3)),
                       'views', (select count(*) from public.mc_v_planilha_linhas where contrato_id in (v_k1, v_k2, v_k3))));
  begin perform public.fn_mc_contrato_salvar(jsonb_build_object('codigo', 'X1', 'nome_obra', 'X', 'objeto', 'X', 'numero_contrato', 'X',
      'contratante_nome', 'X', 'contratante_tipo', 'privado', 'valor_inicial', '1', 'data_assinatura', '2026-01-01', 'prazo_meses', 1));
    v_txt := 'PASSOU (errado)'; exception when others then v_txt := 'recusou: ' || sqlerrm; end;
  r := r || jsonb_build_object('6b_sem_criar', v_txt);
  reset role;
  perform set_config('request.jwt.claims', json_build_object('sub', v_tiago, 'role', 'authenticated')::text, true);
  set local role authenticated;
  perform public.fn_mc_acesso_definir(v_k2, v_zero, true);
  begin perform public.fn_mc_acesso_definir(v_k3, v_tiago, false);
    v_txt := 'PASSOU (errado)'; exception when others then v_txt := 'recusou: ' || sqlerrm; end;
  r := r || jsonb_build_object('6c_ultimo_da_lista', v_txt);
  r := r || jsonb_build_object('6d_controle_tiago', (select count(*) from public.mc_contratos where codigo like 'PROVA-%'));
  reset role;
  perform set_config('request.jwt.claims', json_build_object('sub', v_zero, 'role', 'authenticated')::text, true);
  set local role authenticated;
  r := r || jsonb_build_object('6e_na_lista_de_k2', (select array_agg(codigo) from public.mc_contratos where codigo like 'PROVA-%'));
  reset role;
  update public.usuarios set ativo = false where id = v_zero;
  set local role authenticated;
  r := r || jsonb_build_object('6f_desativado', (select count(*) from public.mc_contratos where codigo like 'PROVA-%'));
  reset role;
  update public.usuarios set ativo = true where id = v_zero;
```

- [ ] **Step 2: Rodar e ver falhar**

Esperado: `function public.fn_mc_contrato_salvar(jsonb) does not exist`.

- [ ] **Step 3: Escrever a migration**

`supabase/migrations/20261001130000_mc_fase1d_rpcs.sql`:

```sql
-- Medição de Contratos, Fase 1d: as RPCs de escrita da Fase 1. Toda RPC confere a ação no recurso
-- E o acesso ao contrato (spec 4.2). Números da planilha chegam como texto e viram numeric sem
-- passar por float.

create or replace function public.fn_mc_exigir(p_recurso text, p_acao text, p_contrato uuid, p_mensagem text)
returns void language plpgsql stable security definer set search_path to '' as $$
begin
  if not public.tem_permissao(p_recurso, p_acao) then raise exception '%', p_mensagem using errcode = 'P0001'; end if;
  if p_contrato is not null and not public.fn_mc_acessa_contrato(p_contrato) then
    raise exception 'Contrato não encontrado' using errcode = 'P0001';
  end if;
end $$;

create or replace function public.fn_mc_contrato_salvar(p_dados jsonb, p_id uuid default null)
returns uuid language plpgsql security definer set search_path to '' as $$
declare v_id uuid; v_uid uuid := (select auth.uid());
begin
  if p_id is null then
    perform public.fn_mc_exigir('medicao.contratos', 'criar', null, 'Sem permissão para cadastrar contrato');
  else
    perform public.fn_mc_exigir('medicao.contratos', 'editar', p_id, 'Sem permissão para editar contrato');
  end if;
  if p_id is null then
    insert into public.mc_contratos (codigo, nome_obra, local, objeto, numero_contrato, contratante_nome, contratante_tipo,
      contratante_documento, valor_inicial, data_assinatura, data_ordem_servico, prazo_meses, inicio_prazo, dia_inicio_periodo,
      tipo_localizacao, regra_arredondamento, alerta_prazo_dias, alerta_valor_pct, status, observacoes, created_by)
    values (upper(btrim(p_dados ->> 'codigo')), btrim(p_dados ->> 'nome_obra'), nullif(btrim(p_dados ->> 'local'), ''),
      btrim(p_dados ->> 'objeto'), btrim(p_dados ->> 'numero_contrato'), btrim(p_dados ->> 'contratante_nome'),
      p_dados ->> 'contratante_tipo', nullif(btrim(p_dados ->> 'contratante_documento'), ''), (p_dados ->> 'valor_inicial')::numeric,
      (p_dados ->> 'data_assinatura')::date, nullif(p_dados ->> 'data_ordem_servico', '')::date, (p_dados ->> 'prazo_meses')::int,
      coalesce(nullif(p_dados ->> 'inicio_prazo', ''), 'assinatura'), coalesce((p_dados ->> 'dia_inicio_periodo')::smallint, 1),
      coalesce(nullif(p_dados ->> 'tipo_localizacao', ''), 'texto'), nullif(p_dados ->> 'regra_arredondamento', ''),
      coalesce((p_dados ->> 'alerta_prazo_dias')::int, 90), coalesce((p_dados ->> 'alerta_valor_pct')::numeric, 90),
      coalesce(nullif(p_dados ->> 'status', ''), 'ativo'), nullif(btrim(p_dados ->> 'observacoes'), ''), v_uid)
    returning id into v_id;
    -- Sem isto o contrato nasceria invisível para quem o criou (D3).
    insert into public.mc_contrato_usuarios (contrato_id, usuario_id, created_by) values (v_id, v_uid, v_uid);
    insert into public.mc_reajuste_config (contrato_id) values (v_id);
    return v_id;
  end if;
  update public.mc_contratos set
    codigo = upper(btrim(p_dados ->> 'codigo')), nome_obra = btrim(p_dados ->> 'nome_obra'), local = nullif(btrim(p_dados ->> 'local'), ''),
    objeto = btrim(p_dados ->> 'objeto'), numero_contrato = btrim(p_dados ->> 'numero_contrato'),
    contratante_nome = btrim(p_dados ->> 'contratante_nome'), contratante_tipo = p_dados ->> 'contratante_tipo',
    contratante_documento = nullif(btrim(p_dados ->> 'contratante_documento'), ''), valor_inicial = (p_dados ->> 'valor_inicial')::numeric,
    data_assinatura = (p_dados ->> 'data_assinatura')::date, data_ordem_servico = nullif(p_dados ->> 'data_ordem_servico', '')::date,
    prazo_meses = (p_dados ->> 'prazo_meses')::int, inicio_prazo = coalesce(nullif(p_dados ->> 'inicio_prazo', ''), 'assinatura'),
    dia_inicio_periodo = coalesce((p_dados ->> 'dia_inicio_periodo')::smallint, 1),
    tipo_localizacao = coalesce(nullif(p_dados ->> 'tipo_localizacao', ''), 'texto'),
    regra_arredondamento = nullif(p_dados ->> 'regra_arredondamento', ''),
    alerta_prazo_dias = coalesce((p_dados ->> 'alerta_prazo_dias')::int, 90), alerta_valor_pct = coalesce((p_dados ->> 'alerta_valor_pct')::numeric, 90),
    status = coalesce(nullif(p_dados ->> 'status', ''), 'ativo'), observacoes = nullif(btrim(p_dados ->> 'observacoes'), '')
  where id = p_id and excluido_em is null;
  if not found then raise exception 'Contrato não encontrado' using errcode = 'P0001'; end if;
  return p_id;
end $$;

create or replace function public.fn_mc_acesso_definir(p_contrato uuid, p_usuario uuid, p_tem boolean)
returns void language plpgsql security definer set search_path to '' as $$
declare v_restantes int;
begin
  perform public.fn_mc_exigir('medicao.contratos', 'editar', p_contrato, 'Sem permissão para mudar o acesso deste contrato');
  perform pg_advisory_xact_lock(hashtextextended('mc_acesso:' || p_contrato::text, 0));
  if p_tem then
    if not exists (select 1 from public.usuarios where id = p_usuario and ativo and excluido_em is null) then
      raise exception 'Usuário inativo ou inexistente' using errcode = 'P0001';
    end if;
    insert into public.mc_contrato_usuarios (contrato_id, usuario_id, created_by)
    values (p_contrato, p_usuario, (select auth.uid())) on conflict do nothing;
    return;
  end if;
  delete from public.mc_contrato_usuarios where contrato_id = p_contrato and usuario_id = p_usuario;
  select count(*) into v_restantes from public.mc_contrato_usuarios cu join public.usuarios u on u.id = cu.usuario_id
  where cu.contrato_id = p_contrato and u.ativo and u.excluido_em is null;
  if v_restantes = 0 then raise exception 'O contrato ficaria sem ninguém ativo com acesso' using errcode = 'P0001'; end if;
end $$;

create or replace function public.fn_mc_usuarios_do_contrato(p_contrato uuid)
returns table (usuario_id uuid, nome text, email text, ativo boolean)
language plpgsql stable security definer set search_path to '' as $$
begin
  if not (public.fn_ve_medicao() and public.fn_mc_acessa_contrato(p_contrato)) then return; end if;
  return query select u.id, u.nome, u.email, (u.ativo and u.excluido_em is null)
  from public.mc_contrato_usuarios cu join public.usuarios u on u.id = cu.usuario_id
  where cu.contrato_id = p_contrato order by u.nome;
end $$;

create or replace function public.fn_mc_usuarios_ativos()
returns table (id uuid, nome text, email text)
language plpgsql stable security definer set search_path to '' as $$
begin
  if not public.tem_permissao('medicao.contratos', 'editar') then return; end if;
  return query select u.id, u.nome, u.email from public.usuarios u where u.ativo and u.excluido_em is null order by u.nome;
end $$;

create or replace function public.fn_mc_aditivo_salvar(p_contrato uuid, p_dados jsonb, p_id uuid default null)
returns uuid language plpgsql security definer set search_path to '' as $$
declare v_id uuid; v_tipos text[] := array(select jsonb_array_elements_text(p_dados -> 'tipos'));
begin
  perform public.fn_mc_exigir('medicao.contratos', 'editar', p_contrato, 'Sem permissão para registrar aditivo');
  if p_id is null then
    perform pg_advisory_xact_lock(hashtextextended('mc_aditivo:' || p_contrato::text, 0));
    insert into public.mc_aditivos (contrato_id, numero, data_assinatura, data_vigencia, tipos, prazo_acrescido_meses, motivo)
    values (p_contrato,
      coalesce((select max(numero) from public.mc_aditivos where contrato_id = p_contrato and excluido_em is null), 0) + 1,
      (p_dados ->> 'data_assinatura')::date, (p_dados ->> 'data_vigencia')::date, v_tipos,
      nullif(p_dados ->> 'prazo_acrescido_meses', '')::int, btrim(p_dados ->> 'motivo'))
    returning id into v_id;
    return v_id;
  end if;
  if exists (select 1 from public.mc_planilha_versoes where aditivo_id = p_id and status = 'vigente') then
    raise exception 'O aditivo já tem versão vigente da planilha e não muda mais' using errcode = 'P0001';
  end if;
  update public.mc_aditivos set data_assinatura = (p_dados ->> 'data_assinatura')::date, data_vigencia = (p_dados ->> 'data_vigencia')::date,
    tipos = v_tipos, prazo_acrescido_meses = nullif(p_dados ->> 'prazo_acrescido_meses', '')::int, motivo = btrim(p_dados ->> 'motivo')
  where id = p_id and contrato_id = p_contrato and excluido_em is null;
  if not found then raise exception 'Aditivo não encontrado' using errcode = 'P0001'; end if;
  return p_id;
end $$;

create or replace function public.fn_mc_planilha_criar_rascunho(p_contrato uuid, p_dados jsonb)
returns uuid language plpgsql security definer set search_path to '' as $$
declare v_id uuid; v_rascunho int; v_numero int; v_aditivo uuid := nullif(p_dados ->> 'aditivo_id', '')::uuid;
begin
  perform public.fn_mc_exigir('medicao.planilha', 'criar', p_contrato, 'Sem permissão para importar planilha');
  perform pg_advisory_xact_lock(hashtextextended('mc_versao:' || p_contrato::text, 0));
  select numero into v_rascunho from public.mc_planilha_versoes
  where contrato_id = p_contrato and status = 'rascunho' and excluido_em is null;
  if found then
    raise exception 'Já existe a versão % em rascunho. Termine ou exclua antes de começar outra', v_rascunho using errcode = 'P0001';
  end if;
  select coalesce(max(numero) + 1, 0) into v_numero from public.mc_planilha_versoes
  where contrato_id = p_contrato and excluido_em is null;
  if v_numero = 0 and v_aditivo is not null then
    raise exception 'A primeira versão é a planilha licitada: não tem aditivo' using errcode = 'P0001';
  end if;
  if v_numero > 0 and v_aditivo is null then
    raise exception 'A versão % precisa do aditivo que a originou' using errcode = 'P0001';
  end if;
  if v_aditivo is not null and exists (select 1 from public.mc_planilha_versoes where aditivo_id = v_aditivo and excluido_em is null) then
    raise exception 'Este aditivo já tem versão da planilha' using errcode = 'P0001';
  end if;
  insert into public.mc_planilha_versoes (contrato_id, numero, aditivo_id, vigente_desde, motivo)
  values (p_contrato, v_numero, v_aditivo, (p_dados ->> 'vigente_desde')::date, nullif(btrim(p_dados ->> 'motivo'), ''))
  returning id into v_id;
  return v_id;
end $$;

-- Grava (ou regrava) as linhas do rascunho. Regravar substitui: apaga as linhas e os itens que só
-- existiam nelas, e insere de novo. Pai vem por pai_ordem, que precisa ser uma linha anterior.
create or replace function public.fn_mc_planilha_gravar_linhas(p_versao uuid, p_linhas jsonb, p_arquivo_nome text, p_arquivo_hash text)
returns integer language plpgsql security definer set search_path to '' as $$
declare v record; l jsonb; v_item uuid; v_pai uuid; v_n int := 0; v_ordem int; v_antigos uuid[];
begin
  select id, contrato_id, status, numero into v from public.mc_planilha_versoes where id = p_versao and excluido_em is null;
  if not found then raise exception 'Versão não encontrada' using errcode = 'P0001'; end if;
  perform public.fn_mc_exigir('medicao.planilha', 'criar', v.contrato_id, 'Sem permissão para importar planilha');
  if v.status <> 'rascunho' then raise exception 'A versão % não está em rascunho', v.numero using errcode = 'P0001'; end if;
  if jsonb_typeof(p_linhas) <> 'array' or jsonb_array_length(p_linhas) = 0 then
    raise exception 'A planilha não tem linhas' using errcode = 'P0001';
  end if;
  perform pg_advisory_xact_lock(hashtextextended('mc_versao:' || v.contrato_id::text, 0));

  -- Sem tabela temporária: a segunda gravação na mesma transação (reenvio) quebraria no create.
  -- O delete de todas as linhas num comando só não esbarra na FK do pai (NO ACTION confere no fim).
  select coalesce(array_agg(item_id), '{}') into v_antigos from public.mc_planilha_itens where versao_id = p_versao;
  delete from public.mc_planilha_itens where versao_id = p_versao;
  delete from public.mc_itens i
  where i.id = any(v_antigos) and not exists (select 1 from public.mc_planilha_itens x where x.item_id = i.id);

  for l in select value from jsonb_array_elements(p_linhas) order by (value ->> 'ordem')::int loop
    v_ordem := (l ->> 'ordem')::int;
    v_item := nullif(l ->> 'item_id', '')::uuid;
    if v_item is null then
      insert into public.mc_itens (contrato_id) values (v.contrato_id) returning id into v_item;
    end if;
    v_pai := null;
    if nullif(l ->> 'pai_ordem', '') is not null then
      if (l ->> 'pai_ordem')::int >= v_ordem then
        raise exception 'Linha %: o pai precisa vir antes dela na planilha', v_ordem using errcode = 'P0001';
      end if;
      select id into v_pai from public.mc_planilha_itens where versao_id = p_versao and ordem = (l ->> 'pai_ordem')::int;
      if v_pai is null then raise exception 'Linha %: pai % não encontrado', v_ordem, l ->> 'pai_ordem' using errcode = 'P0001'; end if;
    end if;
    insert into public.mc_planilha_itens (versao_id, contrato_id, item_id, ordem, codigo, pai_id, descricao, unidade, tipo,
      preco_unitario, quantidade_prevista, linha_origem)
    values (p_versao, v.contrato_id, v_item, v_ordem, btrim(l ->> 'codigo'), v_pai, btrim(l ->> 'descricao'),
      nullif(btrim(l ->> 'unidade'), ''), l ->> 'tipo', (l ->> 'preco_unitario')::numeric, (l ->> 'quantidade_prevista')::numeric,
      nullif(l ->> 'linha_origem', '')::int);
    v_n := v_n + 1;
  end loop;

  update public.mc_planilha_versoes set arquivo_nome = p_arquivo_nome, arquivo_hash = p_arquivo_hash where id = p_versao;
  return v_n;
end $$;

create or replace function public.fn_mc_planilha_aprovar(p_versao uuid)
returns void language plpgsql security definer set search_path to '' as $$
declare v record; v_ultima date;
begin
  select id, contrato_id, status, numero, vigente_desde into v from public.mc_planilha_versoes where id = p_versao and excluido_em is null;
  if not found then raise exception 'Versão não encontrada' using errcode = 'P0001'; end if;
  perform public.fn_mc_exigir('medicao.planilha', 'aprovar', v.contrato_id, 'Sem permissão para tornar a versão vigente');
  if v.status <> 'rascunho' then raise exception 'A versão % já está vigente', v.numero using errcode = 'P0001'; end if;
  if not exists (select 1 from public.mc_planilha_itens where versao_id = p_versao and tipo = 'servico') then
    raise exception 'A versão % não tem nenhum serviço' using errcode = 'P0001';
  end if;
  select max(vigente_desde) into v_ultima from public.mc_planilha_versoes
  where contrato_id = v.contrato_id and status = 'vigente' and excluido_em is null;
  if v_ultima is not null and v.vigente_desde <= v_ultima then
    raise exception 'A versão % precisa começar depois de %, início da versão vigente anterior', v.numero, to_char(v_ultima, 'DD/MM/YYYY')
      using errcode = 'P0001';
  end if;
  update public.mc_planilha_versoes set status = 'vigente', aprovada_em = now(), aprovada_por = (select auth.uid()), motivo_desaprovacao = null
  where id = p_versao;
end $$;

create or replace function public.fn_mc_planilha_desaprovar(p_versao uuid, p_motivo text)
returns void language plpgsql security definer set search_path to '' as $$
declare v record;
begin
  select id, contrato_id, status, numero into v from public.mc_planilha_versoes where id = p_versao and excluido_em is null;
  if not found then raise exception 'Versão não encontrada' using errcode = 'P0001'; end if;
  perform public.fn_mc_exigir('medicao.planilha', 'desaprovar', v.contrato_id, 'Sem permissão para desaprovar a versão');
  if coalesce(btrim(p_motivo), '') = '' then raise exception 'Informe o motivo' using errcode = 'P0001'; end if;
  if v.status <> 'vigente' then raise exception 'A versão % não está vigente', v.numero using errcode = 'P0001'; end if;
  if exists (select 1 from public.mc_planilha_versoes where contrato_id = v.contrato_id and numero > v.numero and excluido_em is null) then
    raise exception 'Só a última versão volta a rascunho' using errcode = 'P0001';
  end if;
  update public.mc_planilha_versoes set status = 'rascunho', aprovada_em = null, aprovada_por = null, motivo_desaprovacao = btrim(p_motivo)
  where id = p_versao;
end $$;

create or replace function public.fn_mc_recurso_da_tabela(p_tabela text)
returns text language sql immutable set search_path to '' as $$
  select case p_tabela when 'mc_contratos' then 'medicao.contratos' when 'mc_aditivos' then 'medicao.contratos'
                       when 'mc_planilha_versoes' then 'medicao.planilha' end;
$$;

create or replace function public.fn_mc_excluir(p_tabela text, p_id uuid, p_motivo text)
returns void language plpgsql security definer set search_path to '' as $$
declare v_recurso text := public.fn_mc_recurso_da_tabela(p_tabela); v_contrato uuid; v_n int;
begin
  if v_recurso is null then raise exception 'Tabela inválida' using errcode = 'P0001'; end if;
  if coalesce(btrim(p_motivo), '') = '' then raise exception 'Informe o motivo da exclusão' using errcode = 'P0001'; end if;
  execute format('select %s from public.%I where id = $1', case when p_tabela = 'mc_contratos' then 'id' else 'contrato_id' end, p_tabela)
    into v_contrato using p_id;
  perform public.fn_mc_exigir(v_recurso, 'excluir', v_contrato, 'Sem permissão para excluir');
  if p_tabela = 'mc_planilha_versoes' and exists (select 1 from public.mc_planilha_versoes where id = p_id and status = 'vigente') then
    raise exception 'Versão vigente não se exclui. Desaprove antes, se nenhuma medição a usa' using errcode = 'P0001';
  end if;
  if p_tabela = 'mc_aditivos' and exists (select 1 from public.mc_planilha_versoes where aditivo_id = p_id and excluido_em is null) then
    raise exception 'O aditivo tem versão da planilha. Exclua a versão antes' using errcode = 'P0001';
  end if;
  execute format('update public.%I set excluido_em = now(), excluido_por = $1, motivo_exclusao = $2 where id = $3 and excluido_em is null', p_tabela)
    using (select auth.uid()), btrim(p_motivo), p_id;
  get diagnostics v_n = row_count;
  if v_n = 0 then raise exception 'Registro não encontrado ou já excluído' using errcode = 'P0001'; end if;
end $$;

create or replace function public.fn_mc_restaurar(p_tabela text, p_id uuid)
returns void language plpgsql security definer set search_path to '' as $$
declare v_recurso text := public.fn_mc_recurso_da_tabela(p_tabela); v_contrato uuid; v_n int;
begin
  if v_recurso is null then raise exception 'Tabela inválida' using errcode = 'P0001'; end if;
  execute format('select %s from public.%I where id = $1', case when p_tabela = 'mc_contratos' then 'id' else 'contrato_id' end, p_tabela)
    into v_contrato using p_id;
  if not (public.tem_permissao('administracao.lixeira', 'editar') and public.tem_permissao(v_recurso, 'excluir')
          and public.fn_mc_acessa_contrato(v_contrato)) then
    raise exception 'Sem permissão para restaurar' using errcode = 'P0001';
  end if;
  execute format('update public.%I set excluido_em = null, excluido_por = null, motivo_exclusao = null where id = $1 and excluido_em is not null', p_tabela)
    using p_id;
  get diagnostics v_n = row_count;
  if v_n = 0 then raise exception 'Registro não encontrado na lixeira' using errcode = 'P0001'; end if;
end $$;

do $fn$
declare f text;
begin
  foreach f in array array['fn_mc_exigir(text, text, uuid, text)', 'fn_mc_contrato_salvar(jsonb, uuid)',
    'fn_mc_acesso_definir(uuid, uuid, boolean)', 'fn_mc_usuarios_do_contrato(uuid)', 'fn_mc_usuarios_ativos()',
    'fn_mc_aditivo_salvar(uuid, jsonb, uuid)', 'fn_mc_planilha_criar_rascunho(uuid, jsonb)',
    'fn_mc_planilha_gravar_linhas(uuid, jsonb, text, text)', 'fn_mc_planilha_aprovar(uuid)',
    'fn_mc_planilha_desaprovar(uuid, text)', 'fn_mc_recurso_da_tabela(text)', 'fn_mc_excluir(text, uuid, text)',
    'fn_mc_restaurar(text, uuid)'] loop
    execute format('revoke all on function public.%s from public, anon', f);
    execute format('grant execute on function public.%s to authenticated', f);
  end loop;
end $fn$;
```

Restaurar contrato cujo código já foi reusado bate no índice único parcial e sai com a mensagem do Postgres. A action traduz `23505` em "Já existe outro contrato ativo com o código X".

- [ ] **Step 4: Aplicar, advisors, rodar a prova**

Esperado:

```json
"4d_gravar_duas_vezes": {"linhas": 2, "preco_cheio": "580.86429961", "codigo_maiusculo": "PROVA-K3", "criador_na_lista": true},
"4e_segundo_rascunho": "recusou: Já existe a versão 0 em rascunho. ...",
"4f_aprovada": "vigente",
"6a_fora_da_lista": {"contratos": 0, "linhas": 0, "views": 0},
"6b_sem_criar": "recusou: Sem permissão para cadastrar contrato",
"6c_ultimo_da_lista": "recusou: O contrato ficaria sem ninguém ativo com acesso",
"6d_controle_tiago": 3,
"6e_na_lista_de_k2": ["PROVA-K2"],
"6f_desativado": 0
```

`6d` é a linha de controle: o mesmo `select count(*)` que deu 0 para o zero dá 3 para o Tiago (os três `PROVA-*`; o filtro por código mantém a prova de pé depois que o Lote 09 entrar). Sem ela, o 0 do `6a` não provaria nada (decisoes.md L1885). O `4e` roda **antes** do `4f`: depois de aprovada a v0 não existe rascunho, e o segundo rascunho seria aceito como v1 sem aditivo, o que também é recusado, mas por outro motivo.

- [ ] **Step 5: Mutação**

Em transação desfeita, recrie `fn_mc_meus_contratos` sem o `and u.ativo`: `6f` tem de dar 1. Recrie `fn_mc_contrato_salvar` sem o insert em `mc_contrato_usuarios`: `4d.criador_na_lista` tem de dar false. Desfaça.

- [ ] **Step 6: Commit**

```bash
git add supabase/migrations/20261001130000_mc_fase1d_rpcs.sql supabase/provas/mc_fase1_banco.sql
git commit -m "Medição de contratos: RPCs de contrato, acesso, aditivo e versões da planilha"
```

---

### Task 5: Permissões e catálogo (app + backfill)

**Files:**
- Create: `supabase/migrations/20261001150000_mc_fase1f_permissoes.sql`
- Modify: `src/config/recursos.ts`
- Modify: `supabase/provas/mc_fase1_banco.sql` (caso 7)
- Test: `src/config/recursos.test.ts` (se existir; senão `src/modules/medicao/_shared/recursos.test.ts`)

**Interfaces:**
- Produces: `ModuloId` ganha `"medicao"`; `RecursoId` ganha `"medicao.contratos"` e `"medicao.planilha"`.

- [ ] **Step 1: Teste do catálogo que falha**

`src/modules/medicao/_shared/recursos.test.ts`:

```ts
import { describe, expect, it } from "vitest";

import { MODULOS, recursosDoModulo } from "@/config/recursos";

describe("catálogo da Medição de Contratos", () => {
  it("o módulo existe entre Manutenção e Administração", () => {
    const ids = MODULOS.map((m) => m.id);
    expect(ids.indexOf("medicao")).toBe(ids.indexOf("manutencao") + 1);
    expect(ids.indexOf("administracao")).toBe(ids.indexOf("medicao") + 1);
  });

  it("a Fase 1 registra só as abas que já têm tela, com as ações do backfill", () => {
    expect(recursosDoModulo("medicao").map((r) => [r.id, [...r.acoes]])).toEqual([
      ["medicao.contratos", ["ver", "criar", "editar", "excluir"]],
      ["medicao.planilha", ["ver", "criar", "excluir", "aprovar", "desaprovar"]],
    ]);
  });
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `npx vitest run src/modules/medicao/_shared/recursos.test.ts`
Esperado: FAIL, `recursosDoModulo("medicao")` não tipa / devolve `[]`.

- [ ] **Step 3: Registrar no catálogo**

Em `src/config/recursos.ts`, no `MODULOS`, entre `manutencao` e `administracao`:

```ts
  { id: "medicao", nome: "Medição", rota: "/medicao" },
```

E ajuste o comentário acima de `MODULOS`: "Medição de Contratos fica depois da Manutenção (25/09/2026)". No `RECURSOS`, antes do primeiro recurso de `administracao`:

```ts
  // Medição de Contratos (spec 2026-09-25). As outras abas entram nas fases delas, cada uma com o
  // seu backfill: registrar aba sem tela deixaria link morto no menu.
  {
    id: "medicao.contratos",
    nome: "Contratos",
    modulo: "medicao",
    rota: "/medicao/contratos",
    acoes: CRUD,
  },
  {
    id: "medicao.planilha",
    nome: "Planilha contratual",
    modulo: "medicao",
    rota: "/medicao/planilha",
    acoes: ["ver", "criar", "excluir", "aprovar", "desaprovar"],
  },
```

- [ ] **Step 4: Rodar o teste e ver passar**

Run: `npx vitest run src/modules/medicao/_shared/recursos.test.ts`. Esperado: PASS. Rode também `npx tsc --noEmit`: algum `switch` exaustivo em `ModuloId` (ícone da sidebar, por exemplo) pode reclamar. Acrescente o caso `medicao` com o ícone `Ruler` do lucide-react.

- [ ] **Step 5: Caso 7 na prova, antes do caso 9**

```sql
  -- 7. Backfill: os 4 Admins, 9 permissões cada
  select jsonb_build_object('admins', count(distinct usuario_id), 'linhas', count(*)) into v_txt
  from public.usuario_permissoes where recurso like 'medicao.%';
  r := r || jsonb_build_object('7_backfill', v_txt::jsonb);
```

Atenção: o caso 4 insere permissões do Tiago na transação. Por isso o caso 7 lê antes do caso 4. Mova o bloco para logo depois do caso 1.

- [ ] **Step 6: Migration de backfill**

`supabase/migrations/20261001150000_mc_fase1f_permissoes.sql`:

```sql
-- Medição de Contratos, Fase 1f: perfil Admin e os 4 Admins ativos ganham as abas da Fase 1.
-- As outras abas entram nas fases delas, com o backfill delas. Quem mais vê, o Tiago decide.

with acoes(recurso, acao) as (values
  ('medicao.contratos', 'ver'), ('medicao.contratos', 'criar'), ('medicao.contratos', 'editar'), ('medicao.contratos', 'excluir'),
  ('medicao.planilha', 'ver'), ('medicao.planilha', 'criar'), ('medicao.planilha', 'excluir'),
  ('medicao.planilha', 'aprovar'), ('medicao.planilha', 'desaprovar')
)
insert into public.perfil_permissoes (perfil_id, recurso, acao)
select p.id, a.recurso, a.acao from public.perfis p cross join acoes a where p.nome = 'Admin'
on conflict (perfil_id, recurso, acao) do nothing;

with acoes(recurso, acao) as (values
  ('medicao.contratos', 'ver'), ('medicao.contratos', 'criar'), ('medicao.contratos', 'editar'), ('medicao.contratos', 'excluir'),
  ('medicao.planilha', 'ver'), ('medicao.planilha', 'criar'), ('medicao.planilha', 'excluir'),
  ('medicao.planilha', 'aprovar'), ('medicao.planilha', 'desaprovar')
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
  select count(distinct usuario_id) into v from public.usuario_permissoes where recurso like 'medicao.%';
  if v <> 4 then raise exception 'Medição foi para % usuários; o plano diz 4 Admins ativos', v; end if;
  select count(*) into v from public.usuario_permissoes where recurso like 'medicao.%';
  if v <> 36 then raise exception 'Esperado 36 permissões de medição (9 x 4 Admins), veio %', v; end if;
end $confere$;
```

**Não aplique ainda.** O backfill vai junto com o deploy das telas (Task 12), para o menu não mostrar aba que ainda não existe em produção. Rode a prova agora com a migration dentro da própria transação da prova (cole o SQL antes do `do $prova$`). Esperado: `"7_backfill": {"admins": 4, "linhas": 36}`.

- [ ] **Step 7: Commit**

```bash
git add src/config/recursos.ts src/modules/medicao/_shared/recursos.test.ts supabase/migrations/20261001150000_mc_fase1f_permissoes.sql supabase/provas/mc_fase1_banco.sql
git commit -m "Medição de contratos: módulo e abas no catálogo, backfill dos 4 Admins"
```

---

### Task 6: Anexos com trava por contrato

**Files:**
- Create: `supabase/migrations/20261001140000_mc_fase1e_anexos.sql`
- Modify: `src/modules/_shared/anexos/entidades.ts`
- Modify: `supabase/provas/mc_fase1_banco.sql` (caso 8)

**Interfaces:**
- Produces: `fn_anexo_entidade_visivel(p_tipo text, p_id uuid) returns boolean`; entidades `mc_contrato`, `mc_aditivo` (recurso `medicao.contratos`), `mc_planilha_versao` (recurso `medicao.planilha`).

- [ ] **Step 1: Caso 8 na prova (antes do 9)**

```sql
  -- 8. Anexo de contrato fora da lista não aparece; dentro aparece (controle)
  insert into public.arquivos (path_storage, nome_original, tipo_mime, tamanho_bytes, hash_sha256)
  values ('prova/k1.pdf', 'k1.pdf', 'application/pdf', 10, 'prova-k1'), ('prova/k2.pdf', 'k2.pdf', 'application/pdf', 11, 'prova-k2');
  insert into public.anexo_vinculos (arquivo_id, entidade_tipo, entidade_id, origem)
  select id, 'mc_contrato', case hash_sha256 when 'prova-k1' then v_k1 else v_k2 end, 'upload_direto'
  from public.arquivos where hash_sha256 in ('prova-k1', 'prova-k2');
  perform set_config('request.jwt.claims', json_build_object('sub', v_zero, 'role', 'authenticated')::text, true);
  set local role authenticated;
  r := r || jsonb_build_object('8a_anexos_visiveis_ao_zero',
    (select array_agg(a.nome_original order by a.nome_original) from public.anexo_vinculos v join public.arquivos a on a.id = v.arquivo_id
     where v.entidade_tipo = 'mc_contrato'));
  reset role;
  insert into public.usuario_permissoes (usuario_id, recurso, acao) values (v_zero, 'medicao.contratos', 'editar') on conflict do nothing;
  set local role authenticated;
  begin perform public.fn_vincular_arquivo(v_arq_k2, 'mc_contrato', v_k1);
    v_txt := 'PASSOU (errado)'; exception when others then v_txt := 'recusou: ' || sqlerrm; end;
  r := r || jsonb_build_object('8b_anexar_fora_da_lista', v_txt);
  reset role;
```

Os ids (`v_k1`, e `v_arq_k2` = id do arquivo `prova-k2`, lido como dono logo depois do insert em `arquivos`) são lidos **antes** do `set local role`. Com o papel do zero, a RLS esconderia K1, o id viria nulo e a recusa passaria pelo motivo errado. Declare `v_arq_k2 uuid` no bloco e preencha com `select id into v_arq_k2 from public.arquivos where hash_sha256 = 'prova-k2';` depois do insert.

- [ ] **Step 2: Rodar e ver falhar**

Esperado: `8a` = `["k1.pdf", "k2.pdf"]` e `8b` = `PASSOU (errado)`: hoje a visibilidade só olha o recurso. Na verdade o insert do vínculo falha antes, no check `fn_recurso_da_entidade(entidade_tipo) is not null`, porque `mc_contrato` não existe. As duas falhas contam.

- [ ] **Step 3: Conferir a definição viva contra o arquivo da Task 0**

Rode de novo a consulta da Task 0, Step 3. O `md5` das três funções e o texto das duas policies têm de ser **iguais** ao salvo. Se mudou (outra frente mexeu), pare e releia antes de escrever a migration.

- [ ] **Step 4: Escrever a migration a partir do vivo**

`supabase/migrations/20261001140000_mc_fase1e_anexos.sql`. O `fn_recurso_da_entidade` é o **texto vivo** com três `when` a mais. `fn_vincular_arquivo` e `fn_desvincular_arquivo` são o texto vivo com **uma** linha a mais cada, marcada com `-- mc:`. O bloco abaixo mostra o resultado esperado sobre a versão do repo (20260728200002 e 20260925185942); se o vivo tiver diferença, vale o vivo.

```sql
-- Medição de Contratos, Fase 1e: anexos. Alterado a partir da definição viva (conferida pelo md5
-- em <data da execução>). Para as entidades mc_* o anexo também exige estar na lista do contrato
-- (spec 4.3); para todas as outras nada muda.

create or replace function public.fn_recurso_da_entidade(p_tipo text)
 returns text language sql immutable set search_path to ''
as $function$
  select case p_tipo
    when 'cotacao'        then 'compras.cotacoes'
    when 'ordem_compra'   then 'compras.ordens'
    when 'lancamento'     then 'financeiro.lancamentos'
    when 'pagamento'      then 'financeiro.pagamentos'
    when 'rh_documento'   then 'rh.documentos'
    when 'rh_epi'         then 'rh.epis'
    when 'rh_ocorrencia'  then 'rh.ocorrencias'
    when 'equipamento_documento' then 'cadastros.equipamentos'
    when 'frete'          then 'frete.fretes'
    when 'frete_chegada'  then 'frete.fretes'
    when 'frete_pagamento' then 'frete.pagamentos'
    when 'pedido_material' then 'frete.pedidos-material'
    when 'combustivel_entrada' then 'combustivel.entradas'
    when 'combustivel_saida' then 'combustivel.saidas'
    when 'combustivel_transferencia' then 'combustivel.transferencias'
    when 'manutencao_os'  then 'manutencao.servicos'
    when 'mc_contrato'    then 'medicao.contratos'
    when 'mc_aditivo'     then 'medicao.contratos'
    when 'mc_planilha_versao' then 'medicao.planilha'
    else null
  end;
$function$;

-- Contrato dono de uma entidade mc_*; nulo para qualquer outro tipo.
create or replace function public.fn_mc_contrato_da_entidade(p_tipo text, p_id uuid)
returns uuid language sql stable security definer set search_path to '' as $$
  select case p_tipo
    when 'mc_contrato' then (select id from public.mc_contratos where id = p_id)
    when 'mc_aditivo' then (select contrato_id from public.mc_aditivos where id = p_id)
    when 'mc_planilha_versao' then (select contrato_id from public.mc_planilha_versoes where id = p_id)
  end;
$$;

create or replace function public.fn_anexo_entidade_visivel(p_tipo text, p_id uuid)
returns boolean language sql stable security definer set search_path to '' as $$
  select case when p_tipo like 'mc\_%'
    then coalesce(public.fn_mc_contrato_da_entidade(p_tipo, p_id) in (select public.fn_mc_meus_contratos()), false)
    else true end;
$$;
revoke all on function public.fn_mc_contrato_da_entidade(text, uuid) from public, anon;
revoke all on function public.fn_anexo_entidade_visivel(text, uuid) from public, anon;
grant execute on function public.fn_anexo_entidade_visivel(text, uuid) to authenticated;

alter policy anexo_vinculos_select on public.anexo_vinculos using (
  (select public.tem_permissao(public.fn_recurso_da_entidade(entidade_tipo), 'ver'))
  and public.fn_anexo_entidade_visivel(entidade_tipo, entidade_id));

alter policy arquivos_select on public.arquivos using (
  exists (
    select 1 from public.anexo_vinculos v
    where v.arquivo_id = arquivos.id
      and (select public.tem_permissao(public.fn_recurso_da_entidade(v.entidade_tipo), 'ver'))
      and public.fn_anexo_entidade_visivel(v.entidade_tipo, v.entidade_id)
  ));

-- fn_vincular_arquivo: texto vivo + a linha marcada.
create or replace function public.fn_vincular_arquivo(
  p_arquivo_id uuid, p_entidade_tipo text, p_entidade_id uuid, p_nome_exibicao text default null
) returns uuid language plpgsql security definer set search_path to '' as $function$
declare v_recurso text; v_vinculo uuid;
begin
  v_recurso := public.fn_recurso_da_entidade(p_entidade_tipo);
  if v_recurso is null then raise exception 'Tipo de entidade sem anexos: %', p_entidade_tipo; end if;
  if not (public.tem_permissao(v_recurso, 'editar') or public.tem_permissao(v_recurso, 'criar')) then
    raise exception 'Sem permissao para anexar neste documento';
  end if;
  if not public.fn_anexo_entidade_visivel(p_entidade_tipo, p_entidade_id) then raise exception 'Sem acesso a este contrato'; end if; -- mc:
  if not exists (select 1 from public.arquivos where id = p_arquivo_id) then
    raise exception 'Arquivo nao encontrado';
  end if;

  insert into public.anexo_vinculos (arquivo_id, entidade_tipo, entidade_id, origem, nome_exibicao)
  values (p_arquivo_id, p_entidade_tipo, p_entidade_id, 'upload_direto', p_nome_exibicao)
  on conflict (arquivo_id, entidade_tipo, entidade_id) do update
    set nome_exibicao = coalesce(excluded.nome_exibicao, public.anexo_vinculos.nome_exibicao)
  returning id into v_vinculo;

  -- Arquivo voltou a ter dono: sai da fila da faxina.
  update public.arquivos set orfao_em = null where id = p_arquivo_id and orfao_em is not null;
  return v_vinculo;
end; $function$;

-- fn_desvincular_arquivo: texto vivo + a linha marcada.
create or replace function public.fn_desvincular_arquivo(p_vinculo_id uuid)
returns void language plpgsql security definer set search_path to '' as $function$
declare v_tipo text; v_recurso text; v_entidade uuid;
begin
  select entidade_tipo, entidade_id into v_tipo, v_entidade from public.anexo_vinculos where id = p_vinculo_id;
  if v_tipo is null then raise exception 'Anexo nao encontrado neste documento'; end if;
  v_recurso := public.fn_recurso_da_entidade(v_tipo);
  if not public.tem_permissao(v_recurso, 'editar') then
    raise exception 'Sem permissao para remover anexo deste documento';
  end if;
  if not public.fn_anexo_entidade_visivel(v_tipo, v_entidade) then raise exception 'Sem acesso a este contrato'; end if; -- mc:
  delete from public.anexo_vinculos where id = p_vinculo_id;
end; $function$;

-- create or replace com a mesma assinatura mantém os grants (decisoes.md L2577). Confere:
do $confere$
begin
  if has_function_privilege('anon', 'public.fn_vincular_arquivo(uuid, text, uuid, text)', 'execute') then
    raise exception 'anon ganhou execute em fn_vincular_arquivo';
  end if;
end $confere$;
```

Depois de aplicar, confira de novo: o `md5` de `pg_get_functiondef` das duas funções com as linhas `-- mc:` removidas tem de bater com o `md5` salvo na Task 0. Diferença = alguma coisa além da linha entrou. Desfaça com a definição salva e refaça.

- [ ] **Step 5: TypeScript das entidades**

Em `src/modules/_shared/anexos/entidades.ts`, no `RECURSO_POR_ENTIDADE`, depois de `manutencao_os`:

```ts
  // Medição de Contratos: documentos do contrato e do aditivo, e o xlsx oficial de cada versão da
  // planilha. O banco também exige estar na lista do contrato (fn_anexo_entidade_visivel).
  mc_contrato: "medicao.contratos",
  mc_aditivo: "medicao.contratos",
  mc_planilha_versao: "medicao.planilha",
```

No `ROTULO_ENTIDADE`:

```ts
  mc_contrato: "contrato",
  mc_aditivo: "aditivo",
  mc_planilha_versao: "planilha contratual",
```

Run: `npx vitest run src/modules/_shared/anexos/entidades.test.ts`. Esperado: PASS. O teste lê a última migration que define `fn_recurso_da_entidade` (esta) e confere que as duas listas casam. Se falhar, uma das duas listas está errada.

- [ ] **Step 6: Aplicar, advisors, rodar a prova**

Esperado: `"8a_anexos_visiveis_ao_zero": ["k2.pdf"]` (o zero está só na lista de K2) e `"8b_anexar_fora_da_lista": "recusou: Sem acesso a este contrato"`.

- [ ] **Step 7: Mutação e commit**

Em transação desfeita, recrie `fn_anexo_entidade_visivel` devolvendo sempre `true`: `8a` tem de voltar a ter os dois arquivos. Depois:

```bash
git add supabase/migrations/20261001140000_mc_fase1e_anexos.sql src/modules/_shared/anexos/entidades.ts supabase/provas/mc_fase1_banco.sql
git commit -m "Medição de contratos: anexos de contrato, aditivo e planilha só para quem está na lista"
```

---

### Task 7: Tipos do banco

**Files:**
- Modify: `src/lib/database.types.ts`

- [ ] **Step 1: Regerar e restaurar o que é manual**

MCP `generate_typescript_types`. Antes de sobrescrever, rode `git diff --stat` com o arquivo novo num caminho temporário e procure no atual os blocos escritos à mão (`grep -n "regerar apaga" src/lib/database.types.ts`). Hoje há pelo menos o `p_id: string | null` de `fn_salvar_transferencia` (decisoes.md L3099 e L3441). Restaure cada bloco manual com o comentário dele.

- [ ] **Step 2: Conferir**

Run: `npx tsc --noEmit`. Esperado: sem erro. As RPCs com parâmetro `default null` (`p_id`) aparecem como opcionais: nas actions, passe `p_id: id ?? undefined`, que sobrevive a qualquer regeneração.

- [ ] **Step 3: Commit**

```bash
git add src/lib/database.types.ts
git commit -m "Tipos do banco com as tabelas, views e RPCs da Medição de Contratos"
```

---

### Task 8: Decimal exato e leitor de células do xlsx

**Files:**
- Create: `src/modules/medicao/_shared/decimal.ts`, `src/modules/medicao/_shared/decimal.test.ts`
- Create: `src/modules/medicao/planilha/leitor.ts`, `src/modules/medicao/planilha/leitor.test.ts`

**Interfaces:**
- Produces (`decimal.ts`):
  - `interface Decimal { digitos: bigint; escala: number }`
  - `lerDecimal(texto: string): Decimal`: aceita `-?\d+(\.\d+)?`, lança fora disso
  - `multiplicar(a: Decimal, b: Decimal): Decimal`
  - `arredondar(d: Decimal, casas: number): Decimal`: meio para longe do zero, igual ao `round` do Postgres
  - `subtrair(a: Decimal, b: Decimal): Decimal`, `absoluto(d: Decimal): Decimal`, `comparar(a: Decimal, b: Decimal): -1 | 0 | 1`
  - `paraTexto(d: Decimal): string`: sem zeros à direita, `"0"` para zero
  - `casasDecimais(texto: string): number`
- Produces (`leitor.ts`):
  - `type CelulaLida = { tipo: "vazia" } | { tipo: "numero"; texto: string } | { tipo: "texto"; bruto: string } | { tipo: "formula_sem_valor" } | { tipo: "erro"; bruto: string }`
  - `lerCelula(valor: ExcelJS.CellValue): CelulaLida`
  - `numeroParaTexto(n: number): string`: representação mais curta que volta ao mesmo double; lança se precisar de expoente
  - `enderecoCelula(linha: number, coluna: number): string` (ex.: `F12`)

- [ ] **Step 1: Testes do decimal (falham)**

`src/modules/medicao/_shared/decimal.test.ts`:

```ts
import { describe, expect, it } from "vitest";

import { absoluto, arredondar, casasDecimais, comparar, lerDecimal, multiplicar, paraTexto, subtrair } from "./decimal";

const t = (s: string) => lerDecimal(s);

describe("decimal exato", () => {
  it("multiplica sem perder casa (02.07.04 do Lote 09)", () => {
    expect(paraTexto(multiplicar(t("17057.717"), t("580.86")))).toBe("9908145.49062");
  });

  it("arredonda meio para longe do zero, como o round do Postgres", () => {
    expect(paraTexto(arredondar(t("1.005"), 2))).toBe("1.01");
    expect(paraTexto(arredondar(t("0.5025"), 2))).toBe("0.5");
    expect(paraTexto(arredondar(t("-1.005"), 2))).toBe("-1.01");
    expect(paraTexto(arredondar(t("2"), 2))).toBe("2");
  });

  it("subtrai, compara e tira o absoluto", () => {
    expect(paraTexto(subtrair(t("1.01"), t("0.5")))).toBe("0.51");
    expect(comparar(t("0.1"), t("0.10"))).toBe(0);
    expect(comparar(t("0.1"), t("0.2"))).toBe(-1);
    expect(paraTexto(absoluto(t("-3.2")))).toBe("3.2");
  });

  it("recusa texto que não é número canônico", () => {
    expect(() => lerDecimal("1.234,56")).toThrow("Número inválido");
    expect(() => lerDecimal("1e-7")).toThrow("Número inválido");
    expect(() => lerDecimal("")).toThrow("Número inválido");
  });

  it("conta casas", () => {
    expect(casasDecimais("580.8643")).toBe(4);
    expect(casasDecimais("100")).toBe(0);
  });
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `npx vitest run src/modules/medicao/_shared/decimal.test.ts`. Esperado: FAIL, módulo não existe.

- [ ] **Step 3: Implementar**

`src/modules/medicao/_shared/decimal.ts`:

```ts
/**
 * Aritmética decimal exata (BigInt), só para o DIAGNÓSTICO da importação: conferir a coluna de
 * valor da planilha contra quantidade x preço sem o erro do float. O valor de verdade é sempre o
 * do banco (fn_mc_valor e as views mc_v_*); isto aqui nunca vai para tela como número oficial.
 *
 * Sem literal 1n: o tsconfig mira ES2017.
 */

export interface Decimal {
  /** valor = digitos / 10^escala */
  digitos: bigint;
  escala: number;
}

const ZERO = BigInt(0);
const DEZ = BigInt(10);

function potencia(expoente: number): bigint {
  return DEZ ** BigInt(expoente);
}

export function lerDecimal(texto: string): Decimal {
  const limpo = texto.trim();
  if (!/^-?\d+(\.\d+)?$/.test(limpo)) throw new Error(`Número inválido: ${texto}`);
  const negativo = limpo.startsWith("-");
  const [inteiro, fracao = ""] = limpo.replace("-", "").split(".");
  const digitos = BigInt(inteiro + fracao);
  return { digitos: negativo ? -digitos : digitos, escala: fracao.length };
}

function mesmaEscala(a: Decimal, b: Decimal): [bigint, bigint, number] {
  const escala = Math.max(a.escala, b.escala);
  return [a.digitos * potencia(escala - a.escala), b.digitos * potencia(escala - b.escala), escala];
}

export function multiplicar(a: Decimal, b: Decimal): Decimal {
  return { digitos: a.digitos * b.digitos, escala: a.escala + b.escala };
}

export function subtrair(a: Decimal, b: Decimal): Decimal {
  const [x, y, escala] = mesmaEscala(a, b);
  return { digitos: x - y, escala };
}

export function absoluto(d: Decimal): Decimal {
  return { digitos: d.digitos < ZERO ? -d.digitos : d.digitos, escala: d.escala };
}

export function comparar(a: Decimal, b: Decimal): -1 | 0 | 1 {
  const [x, y] = mesmaEscala(a, b);
  return x === y ? 0 : x < y ? -1 : 1;
}

/** Meio para longe do zero: o mesmo round(numeric, n) do Postgres. */
export function arredondar(d: Decimal, casas: number): Decimal {
  if (d.escala <= casas) return { digitos: d.digitos * potencia(casas - d.escala), escala: casas };
  const fator = potencia(d.escala - casas);
  const negativo = d.digitos < ZERO;
  const abs = negativo ? -d.digitos : d.digitos;
  let quociente = abs / fator;
  if ((abs % fator) * BigInt(2) >= fator) quociente += BigInt(1);
  return { digitos: negativo ? -quociente : quociente, escala: casas };
}

export function paraTexto(d: Decimal): string {
  const negativo = d.digitos < ZERO;
  let corpo = (negativo ? -d.digitos : d.digitos).toString().padStart(d.escala + 1, "0");
  if (d.escala > 0) {
    corpo = `${corpo.slice(0, corpo.length - d.escala)}.${corpo.slice(corpo.length - d.escala)}`.replace(/\.?0+$/, "");
  }
  if (corpo === "0" || corpo === "") return "0";
  return negativo ? `-${corpo}` : corpo;
}

export function casasDecimais(texto: string): number {
  const ponto = texto.indexOf(".");
  return ponto === -1 ? 0 : texto.length - ponto - 1;
}
```

- [ ] **Step 4: Rodar e ver passar**

Run: `npx vitest run src/modules/medicao/_shared/decimal.test.ts`. Esperado: PASS.

- [ ] **Step 5: Testes do leitor (falham)**

`src/modules/medicao/planilha/leitor.test.ts`:

```ts
import { describe, expect, it } from "vitest";

import { enderecoCelula, lerCelula, numeroParaTexto } from "./leitor";

describe("lerCelula", () => {
  it("número vira texto sem arredondar (casas escondidas)", () => {
    expect(lerCelula(580.8642996)).toEqual({ tipo: "numero", texto: "580.8642996" });
    expect(lerCelula(17057.717)).toEqual({ tipo: "numero", texto: "17057.717" });
  });

  it("fórmula usa o resultado guardado no arquivo", () => {
    expect(lerCelula({ formula: "D5*E5", result: 9908218.84 })).toEqual({ tipo: "numero", texto: "9908218.84" });
  });

  it("fórmula sem valor calculado é marcada, nunca vira zero", () => {
    expect(lerCelula({ formula: "D5*E5", result: undefined } as never)).toEqual({ tipo: "formula_sem_valor" });
  });

  it("erro de fórmula é marcado", () => {
    expect(lerCelula({ formula: "D5/0", result: { error: "#DIV/0!" } } as never)).toEqual({ tipo: "erro", bruto: "#DIV/0!" });
  });

  it("texto fica como veio, com o espaço sobrando", () => {
    expect(lerCelula("un ")).toEqual({ tipo: "texto", bruto: "un " });
    expect(lerCelula("1.234,56")).toEqual({ tipo: "texto", bruto: "1.234,56" });
  });

  it("vazio é vazio, e não zero", () => {
    expect(lerCelula(null)).toEqual({ tipo: "vazia" });
    expect(lerCelula(undefined as never)).toEqual({ tipo: "vazia" });
    expect(lerCelula("   ")).toEqual({ tipo: "vazia" });
    expect(lerCelula(0)).toEqual({ tipo: "numero", texto: "0" });
  });

  it("rich text vira o texto emendado", () => {
    expect(lerCelula({ richText: [{ text: "Imprima" }, { text: "ção" }] } as never)).toEqual({ tipo: "texto", bruto: "Imprimação" });
  });
});

describe("numeroParaTexto", () => {
  it("recusa número que precisaria de expoente", () => {
    expect(() => numeroParaTexto(1e-7)).toThrow("fora da faixa");
    expect(() => numeroParaTexto(1e21)).toThrow("fora da faixa");
  });
});

describe("enderecoCelula", () => {
  it("monta o endereço do Excel", () => {
    expect(enderecoCelula(12, 6)).toBe("F12");
    expect(enderecoCelula(3, 28)).toBe("AB3");
  });
});
```

- [ ] **Step 6: Rodar e ver falhar**

Run: `npx vitest run src/modules/medicao/planilha/leitor.test.ts`. Esperado: FAIL.

- [ ] **Step 7: Implementar**

`src/modules/medicao/planilha/leitor.ts`:

```ts
import type ExcelJS from "exceljs";

/**
 * Leitura de célula do xlsx oficial da planilha contratual, sem perder casa.
 *
 * Regra da spec (6.1): vale o VALOR da célula, nunca o texto formatado. O Excel guarda o número
 * como double; aqui ele vira a representação mais curta que volta ao mesmo double (String(n)), e é
 * esse texto que vai para o numeric do banco. Texto numa coluna de número (ex.: "1.234,56") não é
 * convertido: é exatamente o texto formatado que esconde casas, e a importação recusa.
 */

export type CelulaLida =
  | { tipo: "vazia" }
  | { tipo: "numero"; texto: string }
  | { tipo: "texto"; bruto: string }
  | { tipo: "formula_sem_valor" }
  | { tipo: "erro"; bruto: string };

export function numeroParaTexto(n: number): string {
  const texto = String(n);
  if (!Number.isFinite(n) || /e/i.test(texto)) throw new Error(`Número fora da faixa: ${texto}`);
  return texto;
}

function deValorSimples(valor: unknown): CelulaLida {
  if (valor === null || valor === undefined) return { tipo: "vazia" };
  if (typeof valor === "number") return { tipo: "numero", texto: numeroParaTexto(valor) };
  if (typeof valor === "string") return valor.trim() === "" ? { tipo: "vazia" } : { tipo: "texto", bruto: valor };
  if (typeof valor === "boolean") return { tipo: "texto", bruto: valor ? "VERDADEIRO" : "FALSO" };
  if (valor instanceof Date) return { tipo: "texto", bruto: valor.toISOString().slice(0, 10) };
  return { tipo: "erro", bruto: JSON.stringify(valor) };
}

export function lerCelula(valor: ExcelJS.CellValue): CelulaLida {
  if (valor === null || valor === undefined) return { tipo: "vazia" };
  if (typeof valor !== "object" || valor instanceof Date) return deValorSimples(valor);
  if ("richText" in valor) return deValorSimples(valor.richText.map((trecho) => trecho.text).join(""));
  if ("hyperlink" in valor) return deValorSimples(valor.text);
  if ("formula" in valor || "sharedFormula" in valor) {
    const resultado = (valor as { result?: unknown }).result;
    if (resultado === undefined || resultado === null) return { tipo: "formula_sem_valor" };
    if (typeof resultado === "object" && resultado !== null && "error" in resultado) {
      return { tipo: "erro", bruto: String((resultado as { error: unknown }).error) };
    }
    return deValorSimples(resultado);
  }
  if ("error" in valor) return { tipo: "erro", bruto: String(valor.error) };
  return { tipo: "erro", bruto: JSON.stringify(valor) };
}

export function enderecoCelula(linha: number, coluna: number): string {
  let letras = "";
  let n = coluna;
  while (n > 0) {
    const resto = (n - 1) % 26;
    letras = String.fromCharCode(65 + resto) + letras;
    n = Math.floor((n - 1) / 26);
  }
  return `${letras}${linha}`;
}
```

- [ ] **Step 8: Rodar e ver passar; mutação**

Run: `npx vitest run src/modules/medicao/planilha/leitor.test.ts src/modules/medicao/_shared/decimal.test.ts`. Esperado: PASS. Mutação: troque `return { tipo: "formula_sem_valor" }` por `return { tipo: "numero", texto: "0" }`: o teste "nunca vira zero" tem de falhar. Troque `>=` por `>` no `arredondar`: o teste do 1,005 tem de falhar. Desfaça.

- [ ] **Step 9: Commit**

```bash
git add src/modules/medicao/_shared/decimal.ts src/modules/medicao/_shared/decimal.test.ts src/modules/medicao/planilha/leitor.ts src/modules/medicao/planilha/leitor.test.ts
git commit -m "Medição de contratos: leitor de célula do xlsx sem perder casa e decimal exato"
```

---

### Task 9: Montagem da planilha (hierarquia, tipo, alertas) e diagnóstico da coluna de valor

**Files:**
- Create: `src/modules/medicao/planilha/montagem.ts`, `montagem.test.ts`
- Create: `src/modules/medicao/planilha/diagnostico.ts`, `diagnostico.test.ts`

**Interfaces:**
- Consumes: `CelulaLida`, `enderecoCelula` (Task 8); `lerDecimal`, `multiplicar`, `arredondar`, `comparar`, `subtrair`, `absoluto`, `paraTexto`, `casasDecimais` (Task 8).
- Produces (`montagem.ts`):

```ts
export interface LinhaBruta {
  linhaOrigem: number;
  oculta: boolean;
  codigo: CelulaLida;
  descricao: CelulaLida;
  unidade: CelulaLida;
  preco: CelulaLida;
  quantidade: CelulaLida;
  valor: CelulaLida | null;           // null quando a planilha não tem coluna de valor mapeada
  colunas: { preco: number; quantidade: number; valor: number | null };
}
export type TipoAlerta =
  | "codigo_duplicado" | "sem_preco" | "vazio_vira_zero" | "unidade_com_espaco" | "hierarquia_ambigua"
  | "codigo_sem_pai" | "linha_oculta" | "formula_sem_valor" | "numero_como_texto" | "erro_de_formula";
export interface Alerta { tipo: TipoAlerta; bloqueia: boolean; ordem: number | null; linhaOrigem: number; mensagem: string }
export interface LinhaImportada {
  ordem: number; linhaOrigem: number; codigo: string; paiOrdem: number | null; descricao: string;
  unidade: string | null; tipo: "titulo" | "servico"; precoUnitario: string | null; quantidadePrevista: string | null;
  valorPlanilha: string | null;
}
export interface Ambiguidade { ordem: number; codigo: string; candidatos: number[]; sugerido: number }
export interface Montagem { linhas: LinhaImportada[]; alertas: Alerta[]; ambiguidades: Ambiguidade[]; duplicados: { codigo: string; ordens: number[] }[] }
export function montarPlanilha(brutas: LinhaBruta[], paiEscolhido?: Record<number, number>): Montagem
```

- Produces (`diagnostico.ts`):

```ts
export type Classe = "arredondado" | "exato" | "indistinto" | "diverge";
export interface DiagnosticoLinha { ordem: number; codigo: string; classe: Classe; exato: string; arredondado: string; planilha: string }
export interface Diagnostico { comValor: number; arredondado: number; exato: number; indistinto: number; diverge: DiagnosticoLinha[] }
export function diagnosticarValores(linhas: LinhaImportada[]): Diagnostico | null
```

- [ ] **Step 1: Testes da montagem (falham)**

`src/modules/medicao/planilha/montagem.test.ts`:

```ts
import { describe, expect, it } from "vitest";

import type { CelulaLida } from "./leitor";
import { montarPlanilha, type LinhaBruta } from "./montagem";

const n = (texto: string): CelulaLida => ({ tipo: "numero", texto });
const s = (bruto: string): CelulaLida => ({ tipo: "texto", bruto });
const vazia: CelulaLida = { tipo: "vazia" };

function linha(l: number, codigo: string, descricao: string, unidade: CelulaLida, preco: CelulaLida, qtd: CelulaLida, extra: Partial<LinhaBruta> = {}): LinhaBruta {
  return { linhaOrigem: l, oculta: false, codigo: s(codigo), descricao: s(descricao), unidade, preco, quantidade: qtd, valor: null,
           colunas: { preco: 4, quantidade: 5, valor: null }, ...extra };
}

describe("montarPlanilha", () => {
  it("título sem preço, serviço com preço, e filho com preço de serviço com preço", () => {
    const m = montarPlanilha([
      linha(5, "02.07", "Pavimentação", vazia, vazia, vazia),
      linha(6, "02.07.05", "Imprimação", s("m2"), n("4.5"), n("100")),
      linha(7, "02.07.05.01", "Aquisição CM-30", s("t"), n("5000"), n("1.2")),
      linha(8, "02.07.05.02", "Transporte", s("tkm"), n("0.9"), n("300")),
    ]);
    expect(m.linhas.map((x) => [x.ordem, x.codigo, x.tipo, x.paiOrdem])).toEqual([
      [1, "02.07", "titulo", null],
      [2, "02.07.05", "servico", 1],
      [3, "02.07.05.01", "servico", 2],
      [4, "02.07.05.02", "servico", 2],
    ]);
    expect(m.alertas).toEqual([]);
  });

  it("código repetido é importado como está, sinalizado, e o pai dos filhos fica ambíguo", () => {
    const m = montarPlanilha([
      linha(5, "02", "Grupo", vazia, vazia, vazia),
      linha(6, "02.02", "Usinagem", s("t"), n("10"), n("1")),
      linha(7, "02.02", "DOPE", s("kg"), n("20"), n("1")),
      linha(8, "02.02", "CAP", s("t"), n("30"), n("1")),
      linha(9, "02.02.01", "Transporte do CAP", s("tkm"), n("1"), n("1")),
    ]);
    expect(m.linhas).toHaveLength(5);
    expect(m.duplicados).toEqual([{ codigo: "02.02", ordens: [2, 3, 4] }]);
    expect(m.ambiguidades).toEqual([{ ordem: 5, codigo: "02.02.01", candidatos: [2, 3, 4], sugerido: 4 }]);
    expect(m.linhas[4].paiOrdem).toBe(4);
    expect(m.alertas.map((a) => a.tipo).sort()).toEqual(["codigo_duplicado", "hierarquia_ambigua"]);
  });

  it("a escolha do usuário resolve a ambiguidade", () => {
    const m = montarPlanilha([
      linha(5, "02.02", "Usinagem", s("t"), n("10"), n("1")),
      linha(6, "02.02", "CAP", s("t"), n("30"), n("1")),
      linha(7, "02.02.01", "Transporte", s("tkm"), n("1"), n("1")),
    ], { 3: 1 });
    expect(m.linhas[2].paiOrdem).toBe(1);
    expect(m.alertas.find((a) => a.tipo === "hierarquia_ambigua")).toBeUndefined();
  });

  it("unidade com espaço sobrando entra aparada e gera alerta", () => {
    const m = montarPlanilha([linha(5, "01", "Roçada", s("un "), n("1"), n("2"))]);
    expect(m.linhas[0].unidade).toBe("un");
    expect(m.alertas).toMatchObject([{ tipo: "unidade_com_espaco", bloqueia: false, linhaOrigem: 5 }]);
  });

  it("serviço sem preço ou sem quantidade: vazio vira zero, com alerta", () => {
    const m = montarPlanilha([
      linha(5, "01", "Sem preço", s("un"), vazia, n("2")),
      linha(6, "02", "Sem quantidade", s("un"), n("3"), vazia),
    ]);
    expect(m.linhas.map((x) => [x.precoUnitario, x.quantidadePrevista])).toEqual([["0", "2"], ["3", "0"]]);
    expect(m.alertas.map((a) => a.tipo)).toEqual(["sem_preco", "vazio_vira_zero"]);
  });

  it("número como texto bloqueia, com o endereço da célula", () => {
    const m = montarPlanilha([linha(12, "01", "X", s("un"), s("1.234,56"), n("1"))]);
    expect(m.alertas).toMatchObject([{ tipo: "numero_como_texto", bloqueia: true, linhaOrigem: 12 }]);
    expect(m.alertas[0].mensagem).toContain("D12");
  });

  it("fórmula sem valor calculado bloqueia", () => {
    const m = montarPlanilha([linha(12, "01", "X", s("un"), n("1"), { tipo: "formula_sem_valor" })]);
    expect(m.alertas).toMatchObject([{ tipo: "formula_sem_valor", bloqueia: true }]);
    expect(m.alertas[0].mensagem).toBe("A célula E12 é fórmula sem valor calculado. Abra o arquivo no Excel, salve e envie de novo");
  });

  it("linha oculta entra e é sinalizada", () => {
    const m = montarPlanilha([linha(5, "01", "X", s("un"), n("1"), n("1"), { oculta: true })]);
    expect(m.linhas).toHaveLength(1);
    expect(m.alertas).toMatchObject([{ tipo: "linha_oculta", bloqueia: false }]);
  });

  it("código com ponto sem pai na planilha vai para a raiz, com alerta", () => {
    const m = montarPlanilha([linha(5, "02.07.04", "Órfão", s("t"), n("1"), n("1"))]);
    expect(m.linhas[0].paiOrdem).toBeNull();
    expect(m.alertas).toMatchObject([{ tipo: "codigo_sem_pai", bloqueia: false }]);
  });

  it("linha sem código nem descrição é ignorada; sem código mas com descrição bloqueia", () => {
    const m = montarPlanilha([
      linha(5, "", "", vazia, vazia, vazia, { codigo: vazia, descricao: vazia }),
      linha(6, "", "Observação solta", vazia, n("1"), n("1"), { codigo: vazia }),
    ]);
    expect(m.linhas).toHaveLength(0);
    expect(m.alertas).toMatchObject([{ tipo: "numero_como_texto", bloqueia: true, linhaOrigem: 6 }]);
  });
});
```

O último caso usa `numero_como_texto` como tipo genérico de "célula inválida que bloqueia". Na implementação, crie um tipo próprio `linha_sem_codigo` e troque no teste e na união `TipoAlerta`: cada alerta tem nome do que ele é.

- [ ] **Step 2: Rodar e ver falhar**

Run: `npx vitest run src/modules/medicao/planilha/montagem.test.ts`. Esperado: FAIL.

- [ ] **Step 3: Implementar**

`src/modules/medicao/planilha/montagem.ts`:

```ts
import { enderecoCelula, type CelulaLida } from "./leitor";

/**
 * Monta a planilha contratual a partir das linhas lidas do xlsx (spec 5.2 e 8):
 * - linha com preço OU quantidade é serviço; sem os dois é título;
 * - o pai é a linha anterior de código mais longo que é prefixo do código (com ponto);
 *   código repetido torna o pai ambíguo: sugere o mais próximo e pede confirmação;
 * - campo vazio de serviço vira "0" com alerta, nunca some;
 * - texto em coluna de número, fórmula sem valor e erro de fórmula BLOQUEIAM.
 * Nada aqui calcula dinheiro.
 */

export interface LinhaBruta {
  linhaOrigem: number;
  oculta: boolean;
  codigo: CelulaLida;
  descricao: CelulaLida;
  unidade: CelulaLida;
  preco: CelulaLida;
  quantidade: CelulaLida;
  valor: CelulaLida | null;
  colunas: { preco: number; quantidade: number; valor: number | null };
}

export type TipoAlerta =
  | "codigo_duplicado"
  | "sem_preco"
  | "vazio_vira_zero"
  | "unidade_com_espaco"
  | "hierarquia_ambigua"
  | "codigo_sem_pai"
  | "linha_oculta"
  | "formula_sem_valor"
  | "numero_como_texto"
  | "erro_de_formula"
  | "linha_sem_codigo";

export interface Alerta {
  tipo: TipoAlerta;
  bloqueia: boolean;
  ordem: number | null;
  linhaOrigem: number;
  mensagem: string;
}

export interface LinhaImportada {
  ordem: number;
  linhaOrigem: number;
  codigo: string;
  paiOrdem: number | null;
  descricao: string;
  unidade: string | null;
  tipo: "titulo" | "servico";
  precoUnitario: string | null;
  quantidadePrevista: string | null;
  valorPlanilha: string | null;
}

export interface Ambiguidade {
  ordem: number;
  codigo: string;
  candidatos: number[];
  sugerido: number;
}

export interface Montagem {
  linhas: LinhaImportada[];
  alertas: Alerta[];
  ambiguidades: Ambiguidade[];
  duplicados: { codigo: string; ordens: number[] }[];
}

function texto(c: CelulaLida): string | null {
  if (c.tipo === "texto") return c.bruto;
  if (c.tipo === "numero") return c.texto;
  return null;
}

/** Célula de número: devolve o texto do número, null se vazia, ou o alerta que bloqueia. */
function numero(c: CelulaLida, linha: number, coluna: number): { valor: string | null } | { alerta: Omit<Alerta, "ordem"> } {
  const endereco = enderecoCelula(linha, coluna);
  switch (c.tipo) {
    case "vazia":
      return { valor: null };
    case "numero":
      return { valor: c.texto };
    case "formula_sem_valor":
      return { alerta: { tipo: "formula_sem_valor", bloqueia: true, linhaOrigem: linha,
        mensagem: `A célula ${endereco} é fórmula sem valor calculado. Abra o arquivo no Excel, salve e envie de novo` } };
    case "erro":
      return { alerta: { tipo: "erro_de_formula", bloqueia: true, linhaOrigem: linha,
        mensagem: `A célula ${endereco} tem erro de fórmula (${c.bruto})` } };
    case "texto":
      return { alerta: { tipo: "numero_como_texto", bloqueia: true, linhaOrigem: linha,
        mensagem: `A célula ${endereco} tem o texto "${c.bruto}" onde devia haver número. Use o xlsx oficial, com a célula em formato de número` } };
  }
}

export function montarPlanilha(brutas: LinhaBruta[], paiEscolhido: Record<number, number> = {}): Montagem {
  const linhas: LinhaImportada[] = [];
  const alertas: Alerta[] = [];
  const ambiguidades: Ambiguidade[] = [];

  for (const b of brutas) {
    const codigo = texto(b.codigo)?.trim() ?? "";
    const descricao = texto(b.descricao)?.trim() ?? "";
    if (codigo === "" && descricao === "") continue;
    if (codigo === "") {
      alertas.push({ tipo: "linha_sem_codigo", bloqueia: true, ordem: null, linhaOrigem: b.linhaOrigem,
        mensagem: `A linha ${b.linhaOrigem} tem descrição mas não tem código` });
      continue;
    }
    const ordem = linhas.length + 1;

    const preco = numero(b.preco, b.linhaOrigem, b.colunas.preco);
    const qtd = numero(b.quantidade, b.linhaOrigem, b.colunas.quantidade);
    const valor = b.valor && b.colunas.valor ? numero(b.valor, b.linhaOrigem, b.colunas.valor) : { valor: null };
    for (const r of [preco, qtd, valor]) if ("alerta" in r) alertas.push({ ...r.alerta, ordem });
    const precoTexto = "valor" in preco ? preco.valor : null;
    const qtdTexto = "valor" in qtd ? qtd.valor : null;
    const tipo: LinhaImportada["tipo"] = precoTexto !== null || qtdTexto !== null || "alerta" in preco || "alerta" in qtd ? "servico" : "titulo";

    if (tipo === "servico" && "valor" in preco && precoTexto === null) {
      alertas.push({ tipo: "sem_preco", bloqueia: false, ordem, linhaOrigem: b.linhaOrigem,
        mensagem: `O serviço ${codigo} (linha ${b.linhaOrigem}) não tem preço: entra com preço zero` });
    }
    if (tipo === "servico" && "valor" in qtd && qtdTexto === null) {
      alertas.push({ tipo: "vazio_vira_zero", bloqueia: false, ordem, linhaOrigem: b.linhaOrigem,
        mensagem: `O serviço ${codigo} (linha ${b.linhaOrigem}) não tem quantidade: entra com quantidade zero` });
    }

    const unidadeBruta = texto(b.unidade);
    const unidade = unidadeBruta?.trim() || null;
    if (unidadeBruta !== null && unidade !== null && unidadeBruta !== unidade) {
      alertas.push({ tipo: "unidade_com_espaco", bloqueia: false, ordem, linhaOrigem: b.linhaOrigem,
        mensagem: `A unidade "${unidadeBruta}" da linha ${b.linhaOrigem} tem espaço sobrando: entra como "${unidade}"` });
    }
    if (b.oculta) {
      alertas.push({ tipo: "linha_oculta", bloqueia: false, ordem, linhaOrigem: b.linhaOrigem,
        mensagem: `A linha ${b.linhaOrigem} (${codigo}) está oculta na planilha e foi importada. Confira se ela é do contrato` });
    }

    // Pai: a linha anterior com o maior código que é prefixo deste, seguido de ponto.
    let paiOrdem: number | null = null;
    const partes = codigo.split(".");
    for (let tamanho = partes.length - 1; tamanho > 0 && paiOrdem === null; tamanho--) {
      const prefixo = partes.slice(0, tamanho).join(".");
      const candidatos = linhas.filter((l) => l.codigo === prefixo).map((l) => l.ordem);
      if (candidatos.length === 0) continue;
      const sugerido = candidatos[candidatos.length - 1];
      if (candidatos.length > 1) {
        const escolhido = paiEscolhido[ordem];
        if (escolhido !== undefined && candidatos.includes(escolhido)) {
          paiOrdem = escolhido;
        } else {
          paiOrdem = sugerido;
          ambiguidades.push({ ordem, codigo, candidatos, sugerido });
          alertas.push({ tipo: "hierarquia_ambigua", bloqueia: false, ordem, linhaOrigem: b.linhaOrigem,
            mensagem: `O código ${prefixo} aparece ${candidatos.length} vezes: confirme de qual linha o ${codigo} é filho` });
        }
      } else {
        paiOrdem = sugerido;
      }
    }
    if (paiOrdem === null && partes.length > 1) {
      alertas.push({ tipo: "codigo_sem_pai", bloqueia: false, ordem, linhaOrigem: b.linhaOrigem,
        mensagem: `O código ${codigo} não tem linha de grupo acima dele na planilha: entra na raiz` });
    }

    linhas.push({
      ordem,
      linhaOrigem: b.linhaOrigem,
      codigo,
      paiOrdem,
      descricao,
      unidade,
      tipo,
      precoUnitario: tipo === "servico" ? (precoTexto ?? "0") : null,
      quantidadePrevista: tipo === "servico" ? (qtdTexto ?? "0") : null,
      valorPlanilha: "valor" in valor ? valor.valor : null,
    });
  }

  const porCodigo = new Map<string, number[]>();
  for (const l of linhas) porCodigo.set(l.codigo, [...(porCodigo.get(l.codigo) ?? []), l.ordem]);
  const duplicados = [...porCodigo.entries()].filter(([, ordens]) => ordens.length > 1).map(([codigo, ordens]) => ({ codigo, ordens }));
  for (const d of duplicados) {
    alertas.push({ tipo: "codigo_duplicado", bloqueia: false, ordem: d.ordens[0], linhaOrigem: linhas[d.ordens[0] - 1].linhaOrigem,
      mensagem: `O código ${d.codigo} aparece ${d.ordens.length} vezes (linhas ${d.ordens.map((o) => linhas[o - 1].linhaOrigem).join(", ")}). Entra como está: confirme que são serviços distintos` });
  }

  return { linhas, alertas, ambiguidades, duplicados };
}
```

- [ ] **Step 4: Rodar e ver passar; mutação**

Run: `npx vitest run src/modules/medicao/planilha/montagem.test.ts`. Esperado: PASS (depois de trocar o tipo do último caso para `linha_sem_codigo`). Mutação: no laço do pai, troque `candidatos[candidatos.length - 1]` por `candidatos[0]`: o teste do `02.02.01` tem de falhar. Troque `unidadeBruta?.trim()` por `unidadeBruta`: o teste do `"un "` tem de falhar. Desfaça.

- [ ] **Step 5: Testes do diagnóstico (falham)**

`src/modules/medicao/planilha/diagnostico.test.ts`:

```ts
import { describe, expect, it } from "vitest";

import { diagnosticarValores } from "./diagnostico";
import type { LinhaImportada } from "./montagem";

function serv(ordem: number, codigo: string, preco: string, qtd: string, valorPlanilha: string | null): LinhaImportada {
  return { ordem, linhaOrigem: ordem + 4, codigo, paiOrdem: null, descricao: codigo, unidade: "un", tipo: "servico",
           precoUnitario: preco, quantidadePrevista: qtd, valorPlanilha };
}

describe("diagnosticarValores", () => {
  it("classifica cada linha pela forma como a planilha chegou no valor", () => {
    const d = diagnosticarValores([
      serv(1, "01.01", "0.335", "3", "1.01"),        // arredondado a 2 casas
      serv(2, "01.02", "0.335", "3", "1.005"),       // exato (sem arredondar)
      serv(3, "01.03", "100", "1", "100"),           // tanto faz
      serv(4, "01.04", "580.86", "17057.717", "9908218.84"), // não fecha com o preço exibido
    ]);
    expect(d).toMatchObject({ comValor: 4, arredondado: 1, exato: 1, indistinto: 1 });
    expect(d?.diverge).toEqual([{ ordem: 4, codigo: "01.04", classe: "diverge", exato: "9908145.49062", arredondado: "9908145.49", planilha: "9908218.84" }]);
  });

  it("valor da planilha com ruído de double conta como exato", () => {
    const d = diagnosticarValores([serv(1, "01", "0.1", "3", "0.30000000000000004")]);
    expect(d).toMatchObject({ indistinto: 1, diverge: [] });
  });

  it("sem coluna de valor não há diagnóstico", () => {
    expect(diagnosticarValores([serv(1, "01", "1", "1", null)])).toBeNull();
  });
});
```

- [ ] **Step 6: Implementar**

`src/modules/medicao/planilha/diagnostico.ts`:

```ts
import { absoluto, arredondar, casasDecimais, comparar, lerDecimal, multiplicar, paraTexto, subtrair } from "@/modules/medicao/_shared/decimal";

import type { LinhaImportada } from "./montagem";

/**
 * Confere, linha a linha, a coluna "valor previsto" da planilha contra quantidade x preço. Não
 * escolhe regra nenhuma (spec 6.2: a regra do Lote 09 é descoberta e mostrada ao Tiago, não
 * chutada). Só conta:
 *   arredondado  a planilha tem round(q x p, 2), e isso difere do exato
 *   exato        a planilha tem q x p sem arredondar (tolerância de 1e-6 para o ruído do double)
 *   indistinto   q x p já tem até 2 casas: as duas leituras dão o mesmo número
 *   diverge      não fecha de jeito nenhum (preço ou quantidade com casa escondida que o arquivo
 *                não traz, ou valor digitado à mão)
 */

export type Classe = "arredondado" | "exato" | "indistinto" | "diverge";

export interface DiagnosticoLinha {
  ordem: number;
  codigo: string;
  classe: Classe;
  exato: string;
  arredondado: string;
  planilha: string;
}

export interface Diagnostico {
  comValor: number;
  arredondado: number;
  exato: number;
  indistinto: number;
  diverge: DiagnosticoLinha[];
}

const TOLERANCIA = lerDecimal("0.000001");

export function diagnosticarValores(linhas: LinhaImportada[]): Diagnostico | null {
  const comValor = linhas.filter((l) => l.tipo === "servico" && l.valorPlanilha !== null);
  if (comValor.length === 0) return null;

  const resultado: Diagnostico = { comValor: comValor.length, arredondado: 0, exato: 0, indistinto: 0, diverge: [] };
  for (const l of comValor) {
    const exato = multiplicar(lerDecimal(l.quantidadePrevista ?? "0"), lerDecimal(l.precoUnitario ?? "0"));
    const arred = arredondar(exato, 2);
    const planilha = lerDecimal(l.valorPlanilha as string);
    const pertoDoExato = comparar(absoluto(subtrair(planilha, exato)), TOLERANCIA) <= 0;
    const igualAoArredondado = casasDecimais(l.valorPlanilha as string) <= 2 && comparar(planilha, arred) === 0;
    const exatoTemAte2Casas = comparar(exato, arred) === 0;

    let classe: Classe;
    if (exatoTemAte2Casas && (pertoDoExato || igualAoArredondado)) classe = "indistinto";
    else if (igualAoArredondado) classe = "arredondado";
    else if (pertoDoExato) classe = "exato";
    else classe = "diverge";

    if (classe === "diverge") {
      resultado.diverge.push({ ordem: l.ordem, codigo: l.codigo, classe, exato: paraTexto(exato), arredondado: paraTexto(arred),
                               planilha: l.valorPlanilha as string });
    } else {
      resultado[classe] += 1;
    }
  }
  return resultado;
}
```

- [ ] **Step 7: Rodar, mutação, commit**

Run: `npx vitest run src/modules/medicao/planilha/`. Esperado: PASS. Mutação: `TOLERANCIA = "0"` tem de derrubar o teste do ruído de double. Desfaça.

```bash
git add src/modules/medicao/planilha/montagem.ts src/modules/medicao/planilha/montagem.test.ts src/modules/medicao/planilha/diagnostico.ts src/modules/medicao/planilha/diagnostico.test.ts
git commit -m "Medição de contratos: montagem da planilha com alertas e diagnóstico da coluna de valor"
```

---

### Task 10: Casamento do aditivo com a versão anterior

**Files:**
- Create: `src/modules/medicao/planilha/casamento.ts`, `casamento.test.ts`

**Interfaces:**
- Consumes: `LinhaImportada` (Task 9), `lerDecimal`, `comparar` (Task 8).
- Produces:

```ts
export interface LinhaAnterior { itemId: string; codigo: string; descricao: string; unidade: string | null; tipo: "titulo" | "servico"; precoUnitario: string | null; quantidadePrevista: string | null }
export type Situacao = "igual" | "mudou_quantidade" | "mudou_preco" | "mudou_quantidade_e_preco" | "novo" | "ambiguo";
export interface Casamento { ordem: number; itemId: string | null; situacao: Situacao; candidatos: string[] }
export interface ResultadoCasamento { linhas: Casamento[]; sairam: LinhaAnterior[] }
export function casarComVersaoAnterior(novas: LinhaImportada[], anteriores: LinhaAnterior[], escolhas?: Record<number, string | null>): ResultadoCasamento
export function chaveDoItem(codigo: string, descricao: string, unidade: string | null): string
```

- [ ] **Step 1: Testes (falham)**

`src/modules/medicao/planilha/casamento.test.ts`:

```ts
import { describe, expect, it } from "vitest";

import { casarComVersaoAnterior, chaveDoItem, type LinhaAnterior } from "./casamento";
import type { LinhaImportada } from "./montagem";

const nova = (ordem: number, codigo: string, descricao: string, preco: string | null, qtd: string | null): LinhaImportada => ({
  ordem, linhaOrigem: ordem, codigo, paiOrdem: null, descricao, unidade: preco ? "un" : null,
  tipo: preco ? "servico" : "titulo", precoUnitario: preco, quantidadePrevista: qtd, valorPlanilha: null,
});
const antiga = (itemId: string, codigo: string, descricao: string, preco: string | null, qtd: string | null): LinhaAnterior => ({
  itemId, codigo, descricao, unidade: preco ? "un" : null, tipo: preco ? "servico" : "titulo", precoUnitario: preco, quantidadePrevista: qtd,
});

describe("casarComVersaoAnterior", () => {
  const anteriores = [
    antiga("i1", "01", "Grupo", null, null),
    antiga("i2", "01.01", "Roçada manual", "0.335", "10"),
    antiga("i3", "01.02", "Capina", "2", "5"),
    antiga("i4", "01.03", "Sai no aditivo", "1", "1"),
  ];

  it("casa por código, descrição e unidade, e classifica a mudança", () => {
    const r = casarComVersaoAnterior([
      nova(1, "01", "Grupo", null, null),
      nova(2, "01.01", "Roçada  MANUAL", "0.4", "12"),
      nova(3, "01.02", "Capina", "2", "5"),
      nova(4, "01.04", "Serviço novo", "3", "1"),
    ], anteriores);
    expect(r.linhas.map((c) => [c.ordem, c.itemId, c.situacao])).toEqual([
      [1, "i1", "igual"], [2, "i2", "mudou_quantidade_e_preco"], [3, "i3", "igual"], [4, null, "novo"],
    ]);
    expect(r.sairam.map((s) => s.itemId)).toEqual(["i4"]);
  });

  it("chave repetida na versão anterior fica ambígua até o usuário escolher", () => {
    const dup = [antiga("a", "02.02", "CAP", "30", "1"), antiga("b", "02.02", "CAP", "30", "1")];
    const r = casarComVersaoAnterior([nova(1, "02.02", "CAP", "30", "1")], dup);
    expect(r.linhas[0]).toEqual({ ordem: 1, itemId: null, situacao: "ambiguo", candidatos: ["a", "b"] });
    const escolhido = casarComVersaoAnterior([nova(1, "02.02", "CAP", "30", "1")], dup, { 1: "b" });
    expect(escolhido.linhas[0]).toMatchObject({ itemId: "b", situacao: "igual" });
    expect(escolhido.sairam.map((s) => s.itemId)).toEqual(["a"]);
  });

  it("um item anterior não casa com duas linhas novas", () => {
    const r = casarComVersaoAnterior([nova(1, "01.02", "Capina", "2", "5"), nova(2, "01.02", "Capina", "2", "6")], anteriores);
    expect(r.linhas.map((c) => c.itemId)).toEqual(["i3", null]);
    expect(r.linhas[1].situacao).toBe("novo");
  });

  it("a escolha do usuário pode marcar como novo o que casaria sozinho", () => {
    const r = casarComVersaoAnterior([nova(1, "01.02", "Capina", "2", "5")], anteriores, { 1: null });
    expect(r.linhas[0]).toMatchObject({ itemId: null, situacao: "novo" });
  });

  it("a chave ignora caixa e espaço repetido", () => {
    expect(chaveDoItem("01.01", " Roçada   Manual ", "un")).toBe(chaveDoItem("01.01", "roçada manual", "un"));
  });
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `npx vitest run src/modules/medicao/planilha/casamento.test.ts`. Esperado: FAIL.

- [ ] **Step 3: Implementar**

`src/modules/medicao/planilha/casamento.ts`:

```ts
import { comparar, lerDecimal } from "@/modules/medicao/_shared/decimal";

import type { LinhaImportada } from "./montagem";

/**
 * Casa as linhas da versão nova (aditivo) com os itens da versão anterior, para o acumulado
 * atravessar o aditivo pela identidade estável do item (spec 5.2). Chave: código + descrição
 * (sem caixa, espaço normalizado) + unidade. Chave repetida fica ambígua e espera o usuário. Um
 * item anterior casa com uma linha só. O que sobra da versão anterior "saiu".
 */

export interface LinhaAnterior {
  itemId: string;
  codigo: string;
  descricao: string;
  unidade: string | null;
  tipo: "titulo" | "servico";
  precoUnitario: string | null;
  quantidadePrevista: string | null;
}

export type Situacao = "igual" | "mudou_quantidade" | "mudou_preco" | "mudou_quantidade_e_preco" | "novo" | "ambiguo";

export interface Casamento {
  ordem: number;
  itemId: string | null;
  situacao: Situacao;
  candidatos: string[];
}

export interface ResultadoCasamento {
  linhas: Casamento[];
  sairam: LinhaAnterior[];
}

export function chaveDoItem(codigo: string, descricao: string, unidade: string | null): string {
  const norm = (s: string) => s.trim().replace(/\s+/g, " ").toLocaleLowerCase("pt-BR");
  return `${codigo.trim()}|${norm(descricao)}|${norm(unidade ?? "")}`;
}

function iguais(a: string | null, b: string | null): boolean {
  if (a === null || b === null) return a === b;
  return comparar(lerDecimal(a), lerDecimal(b)) === 0;
}

function situacaoDe(nova: LinhaImportada, anterior: LinhaAnterior): Situacao {
  const qtd = !iguais(nova.quantidadePrevista, anterior.quantidadePrevista);
  const preco = !iguais(nova.precoUnitario, anterior.precoUnitario);
  if (qtd && preco) return "mudou_quantidade_e_preco";
  if (qtd) return "mudou_quantidade";
  if (preco) return "mudou_preco";
  return "igual";
}

export function casarComVersaoAnterior(
  novas: LinhaImportada[],
  anteriores: LinhaAnterior[],
  escolhas: Record<number, string | null> = {},
): ResultadoCasamento {
  const porChave = new Map<string, LinhaAnterior[]>();
  for (const a of anteriores) {
    const chave = chaveDoItem(a.codigo, a.descricao, a.unidade);
    porChave.set(chave, [...(porChave.get(chave) ?? []), a]);
  }
  const porId = new Map(anteriores.map((a) => [a.itemId, a]));
  const usados = new Set<string>();

  // Escolhas explícitas primeiro, para o casamento automático não roubar o item escolhido.
  for (const [, itemId] of Object.entries(escolhas)) if (itemId) usados.add(itemId);

  const linhas: Casamento[] = novas.map((nova) => {
    if (nova.ordem in escolhas) {
      const itemId = escolhas[nova.ordem];
      const anterior = itemId ? porId.get(itemId) : undefined;
      return anterior
        ? { ordem: nova.ordem, itemId: anterior.itemId, situacao: situacaoDe(nova, anterior), candidatos: [] }
        : { ordem: nova.ordem, itemId: null, situacao: "novo", candidatos: [] };
    }
    const candidatos = (porChave.get(chaveDoItem(nova.codigo, nova.descricao, nova.unidade)) ?? []).filter((a) => !usados.has(a.itemId));
    if (candidatos.length === 0) return { ordem: nova.ordem, itemId: null, situacao: "novo", candidatos: [] };
    if (candidatos.length > 1) return { ordem: nova.ordem, itemId: null, situacao: "ambiguo", candidatos: candidatos.map((c) => c.itemId) };
    usados.add(candidatos[0].itemId);
    return { ordem: nova.ordem, itemId: candidatos[0].itemId, situacao: situacaoDe(nova, candidatos[0]), candidatos: [] };
  });

  const casados = new Set(linhas.map((l) => l.itemId).filter((id): id is string => id !== null));
  return { linhas, sairam: anteriores.filter((a) => !casados.has(a.itemId)) };
}
```

- [ ] **Step 4: Rodar, mutação, commit**

Run: `npx vitest run src/modules/medicao/planilha/casamento.test.ts`. Esperado: PASS. Mutação: tire o `.filter((a) => !usados.has(a.itemId))`: o teste "não casa com duas linhas" tem de falhar. Desfaça.

```bash
git add src/modules/medicao/planilha/casamento.ts src/modules/medicao/planilha/casamento.test.ts
git commit -m "Medição de contratos: casamento das linhas do aditivo com os itens da versão anterior"
```

---

### Task 11: Contratos (schemas, queries, actions, telas)

**Files:**
- Create: `src/modules/medicao/_shared/rotulos.ts`
- Create: `src/modules/medicao/contratos/schemas.ts`, `schemas.test.ts`, `queries.ts`, `actions.ts`, `actions.test.ts`
- Create: `src/modules/medicao/contratos/components/contratos-tabela.tsx`, `contrato-form-drawer.tsx`, `novo-contrato-botao.tsx`, `contrato-detalhe.tsx`, `acesso-contrato.tsx`, `aditivos-contrato.tsx`
- Create: `src/app/(app)/medicao/layout.tsx`, `page.tsx`, `loading.tsx`, `contratos/page.tsx`, `contratos/loading.tsx`, `contratos/[id]/page.tsx`

**Interfaces:**
- Produces (`schemas.ts`): `contratoSchema` (Zod) e `type ContratoInput`; `payloadDoContrato(c: ContratoInput): Record<string, string | number | null>`; `aditivoSchema`, `type AditivoInput`, `payloadDoAditivo`.
- Produces (`actions.ts`): `salvarContrato(id: string | null, dados: ContratoInput): Promise<{ ok: true; id: string } | { erro: string }>`; `definirAcesso(contratoId: string, usuarioId: string, tem: boolean): Promise<{ ok: true } | { erro: string }>`; `salvarAditivo(contratoId: string, id: string | null, dados: AditivoInput)`; `excluirContrato(id: string, motivo: string)`; `restaurarContrato(id: string)`; `excluirAditivo(id: string, motivo: string)`.
- Produces (`queries.ts`): `listarContratos(filtros: { status?: string; tipo?: string; lixeira?: boolean }): Promise<ContratoLista[]>`; `carregarContrato(id: string): Promise<ContratoDetalhe | null>`; `listarUsuariosDoContrato(id: string)`; `listarUsuariosAtivos()`; `listarAditivos(contratoId: string)`.

- [ ] **Step 1: Rótulos**

`src/modules/medicao/_shared/rotulos.ts`:

```ts
export const TIPOS_CONTRATANTE = ["federal", "estadual", "municipal", "privado"] as const;
export type TipoContratante = (typeof TIPOS_CONTRATANTE)[number];
export const ROTULO_TIPO_CONTRATANTE: Record<TipoContratante, string> = {
  federal: "Federal", estadual: "Estadual", municipal: "Municipal", privado: "Privado",
};

export const STATUS_CONTRATO = ["ativo", "paralisado", "encerrado"] as const;
export type StatusContrato = (typeof STATUS_CONTRATO)[number];
export const ROTULO_STATUS_CONTRATO: Record<StatusContrato, string> = {
  ativo: "Ativo", paralisado: "Paralisado", encerrado: "Encerrado",
};

export const REGRAS_ARREDONDAMENTO = ["item_por_medicao", "item_por_acumulado", "sem_arredondar"] as const;
export type RegraArredondamento = (typeof REGRAS_ARREDONDAMENTO)[number];
export const ROTULO_REGRA: Record<RegraArredondamento, string> = {
  item_por_medicao: "Por item, em cada medição",
  item_por_acumulado: "Por item, no acumulado",
  sem_arredondar: "Sem arredondar, só no total",
};

export const TIPOS_ADITIVO = ["quantidade", "valor", "prazo", "inclusao_item"] as const;
export type TipoAditivo = (typeof TIPOS_ADITIVO)[number];
export const ROTULO_TIPO_ADITIVO: Record<TipoAditivo, string> = {
  quantidade: "Quantidade", valor: "Valor", prazo: "Prazo", inclusao_item: "Inclusão de item",
};

export const ROTULO_STATUS_VERSAO = { rascunho: "Rascunho", vigente: "Vigente" } as const;
```

- [ ] **Step 2: Testes do schema (falham)**

`src/modules/medicao/contratos/schemas.test.ts`:

```ts
import { describe, expect, it } from "vitest";

import { aditivoSchema, contratoSchema, payloadDoContrato } from "./schemas";

const valido = {
  codigo: "l09-br364", nomeObra: "BR-364 Lote 09", local: "Cruzeiro do Sul/AC", objeto: "Manutenção rodoviária",
  numeroContrato: "00615/2025", contratanteNome: "DNIT", contratanteTipo: "federal", contratanteDocumento: "",
  valorInicial: 243927498.02, dataAssinatura: "2025-10-01", dataOrdemServico: "", prazoMeses: 39, inicioPrazo: "assinatura",
  diaInicioPeriodo: 26, tipoLocalizacao: "rodovia", regraArredondamento: null, alertaPrazoDias: 90, alertaValorPct: 90,
  status: "ativo", observacoes: "",
} as const;

describe("contratoSchema", () => {
  it("aceita o Lote 09 e manda o código em maiúsculas, sem regra definida", () => {
    const r = contratoSchema.parse(valido);
    expect(payloadDoContrato(r)).toMatchObject({ codigo: "L09-BR364", valor_inicial: "243927498.02", regra_arredondamento: null,
      data_ordem_servico: null, dia_inicio_periodo: 26 });
  });

  it("valor inicial com 3 casas é recusado", () => {
    expect(contratoSchema.safeParse({ ...valido, valorInicial: 1.005 }).success).toBe(false);
  });

  it("prazo contado da OS exige a data da OS", () => {
    const r = contratoSchema.safeParse({ ...valido, inicioPrazo: "ordem_servico", dataOrdemServico: "" });
    expect(r.success).toBe(false);
    expect(r.error?.issues[0]?.message).toBe("Informe a data da ordem de serviço");
  });

  it("dia de início do período vai de 1 a 28", () => {
    expect(contratoSchema.safeParse({ ...valido, diaInicioPeriodo: 29 }).success).toBe(false);
  });
});

describe("aditivoSchema", () => {
  it("aditivo de prazo exige os meses acrescidos, e só ele", () => {
    const base = { dataAssinatura: "2026-05-01", dataVigencia: "2026-05-01", motivo: "Chuvas", prazoAcrescidoMeses: null };
    expect(aditivoSchema.safeParse({ ...base, tipos: ["prazo"] }).success).toBe(false);
    expect(aditivoSchema.safeParse({ ...base, tipos: ["prazo"], prazoAcrescidoMeses: 6 }).success).toBe(true);
    expect(aditivoSchema.safeParse({ ...base, tipos: ["valor"], prazoAcrescidoMeses: 6 }).success).toBe(false);
  });
});
```

- [ ] **Step 3: Implementar o schema**

`src/modules/medicao/contratos/schemas.ts`:

```ts
import { z } from "zod";

import { CASAS_DINHEIRO } from "@/lib/casas-decimais";
import { REGRAS_ARREDONDAMENTO, STATUS_CONTRATO, TIPOS_ADITIVO, TIPOS_CONTRATANTE } from "@/modules/medicao/_shared/rotulos";

const data = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Data inválida");
const dataOpcional = z.union([data, z.literal("")]);

const valorDinheiro = z
  .number({ error: "Informe o valor" })
  .nonnegative("O valor não pode ser negativo")
  .refine((v) => Number(v.toFixed(CASAS_DINHEIRO)) === v, `No máximo ${CASAS_DINHEIRO} casas`);

export const contratoSchema = z
  .object({
    codigo: z.string().trim().regex(/^[A-Za-z0-9][A-Za-z0-9-]{1,29}$/, "Código com 2 a 30 letras, números ou hífen"),
    nomeObra: z.string().trim().min(2, "Informe o nome da obra").max(200),
    local: z.string().trim().max(200),
    objeto: z.string().trim().min(1, "Informe o objeto"),
    numeroContrato: z.string().trim().min(1, "Informe o número do contrato"),
    contratanteNome: z.string().trim().min(1, "Informe o contratante"),
    contratanteTipo: z.enum(TIPOS_CONTRATANTE),
    contratanteDocumento: z.string().trim().max(20),
    valorInicial: valorDinheiro,
    dataAssinatura: data,
    dataOrdemServico: dataOpcional,
    prazoMeses: z.number().int().positive("Prazo em meses, maior que zero"),
    inicioPrazo: z.enum(["assinatura", "ordem_servico"]),
    diaInicioPeriodo: z.number().int().min(1).max(28, "O período começa entre o dia 1 e o dia 28"),
    tipoLocalizacao: z.enum(["rodovia", "texto"]),
    regraArredondamento: z.enum(REGRAS_ARREDONDAMENTO).nullable(),
    alertaPrazoDias: z.number().int().nonnegative(),
    alertaValorPct: z.number().min(0).max(100),
    status: z.enum(STATUS_CONTRATO),
    observacoes: z.string().trim(),
  })
  .refine((c) => c.inicioPrazo === "assinatura" || c.dataOrdemServico !== "", {
    message: "Informe a data da ordem de serviço",
    path: ["dataOrdemServico"],
  });

export type ContratoInput = z.infer<typeof contratoSchema>;

/** Payload da fn_mc_contrato_salvar. Dinheiro vai como texto, para não passar por float no banco. */
export function payloadDoContrato(c: ContratoInput): Record<string, string | number | null> {
  return {
    codigo: c.codigo.toUpperCase(),
    nome_obra: c.nomeObra,
    local: c.local || null,
    objeto: c.objeto,
    numero_contrato: c.numeroContrato,
    contratante_nome: c.contratanteNome,
    contratante_tipo: c.contratanteTipo,
    contratante_documento: c.contratanteDocumento || null,
    valor_inicial: c.valorInicial.toFixed(CASAS_DINHEIRO),
    data_assinatura: c.dataAssinatura,
    data_ordem_servico: c.dataOrdemServico || null,
    prazo_meses: c.prazoMeses,
    inicio_prazo: c.inicioPrazo,
    dia_inicio_periodo: c.diaInicioPeriodo,
    tipo_localizacao: c.tipoLocalizacao,
    regra_arredondamento: c.regraArredondamento,
    alerta_prazo_dias: c.alertaPrazoDias,
    alerta_valor_pct: c.alertaValorPct,
    status: c.status,
    observacoes: c.observacoes || null,
  };
}

export const aditivoSchema = z
  .object({
    dataAssinatura: data,
    dataVigencia: data,
    tipos: z.array(z.enum(TIPOS_ADITIVO)).min(1, "Marque o tipo do aditivo"),
    prazoAcrescidoMeses: z.number().int().positive().nullable(),
    motivo: z.string().trim().min(1, "Informe o motivo"),
  })
  .refine((a) => a.tipos.includes("prazo") === (a.prazoAcrescidoMeses !== null), {
    message: "Meses acrescidos só no aditivo de prazo, e nele são obrigatórios",
    path: ["prazoAcrescidoMeses"],
  });

export type AditivoInput = z.infer<typeof aditivoSchema>;

export function payloadDoAditivo(a: AditivoInput) {
  return {
    data_assinatura: a.dataAssinatura,
    data_vigencia: a.dataVigencia,
    tipos: a.tipos,
    prazo_acrescido_meses: a.prazoAcrescidoMeses,
    motivo: a.motivo,
  };
}

export const motivoSchema = z.string().trim().min(3, "Informe o motivo");
```

Run: `npx vitest run src/modules/medicao/contratos/schemas.test.ts`. Esperado: PASS.

- [ ] **Step 4: Testes das actions (falham)**

`src/modules/medicao/contratos/actions.test.ts`, no molde de `src/modules/frete/ajustes/actions.test.ts` (mesmo `vi.hoisted`, mesmos mocks de `server-only`, `next/cache`, `@/lib/permissoes` e `@/lib/supabase/server`):

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

import { definirAcesso, excluirContrato, salvarContrato } from "@/modules/medicao/contratos/actions";
import type { ContratoInput } from "@/modules/medicao/contratos/schemas";

const ID = "33333333-3333-4333-8333-333333333333";
const USUARIO = "44444444-4444-4444-8444-444444444444";
const DADOS: ContratoInput = {
  codigo: "L09-BR364", nomeObra: "BR-364 Lote 09", local: "", objeto: "Manutenção", numeroContrato: "00615/2025",
  contratanteNome: "DNIT", contratanteTipo: "federal", contratanteDocumento: "", valorInicial: 243927498.02,
  dataAssinatura: "2025-10-01", dataOrdemServico: "", prazoMeses: 39, inicioPrazo: "assinatura", diaInicioPeriodo: 26,
  tipoLocalizacao: "rodovia", regraArredondamento: null, alertaPrazoDias: 90, alertaValorPct: 90, status: "ativo", observacoes: "",
};

beforeEach(() => {
  estado.negadas = [];
  estado.chamadas = [];
  estado.resposta = { data: ID, error: null };
  vi.spyOn(console, "error").mockImplementation(() => {});
});

describe("salvarContrato", () => {
  it("sem medicao.contratos/criar não chama o banco", async () => {
    estado.negadas = ["medicao.contratos/criar"];
    await expect(salvarContrato(null, DADOS)).resolves.toEqual({ erro: "Sem permissão para cadastrar contrato" });
    expect(estado.chamadas).toEqual([]);
  });

  it("criar omite p_id (DEFAULT null no banco) e manda o valor como texto", async () => {
    await expect(salvarContrato(null, DADOS)).resolves.toEqual({ ok: true, id: ID });
    expect(estado.chamadas[0].fn).toBe("fn_mc_contrato_salvar");
    expect(estado.chamadas[0].args.p_id).toBeUndefined();
    expect((estado.chamadas[0].args.p_dados as Record<string, unknown>).valor_inicial).toBe("243927498.02");
  });

  it("editar exige medicao.contratos/editar", async () => {
    estado.negadas = ["medicao.contratos/editar"];
    await expect(salvarContrato(ID, DADOS)).resolves.toEqual({ erro: "Sem permissão para editar contrato" });
  });

  it("código repetido vira mensagem clara", async () => {
    estado.resposta = { data: null, error: { code: "23505", message: "duplicate key value violates unique constraint \"mc_contratos_codigo_uk\"" } };
    await expect(salvarContrato(null, DADOS)).resolves.toEqual({ erro: "Já existe outro contrato ativo com o código L09-BR364" });
  });

  it("erro de negócio do banco (P0001) chega como está", async () => {
    estado.resposta = { data: null, error: { code: "P0001", message: "Contrato não encontrado" } };
    await expect(salvarContrato(ID, DADOS)).resolves.toEqual({ erro: "Contrato não encontrado" });
  });
});

describe("definirAcesso", () => {
  it("sem editar não chama o banco", async () => {
    estado.negadas = ["medicao.contratos/editar"];
    await expect(definirAcesso(ID, USUARIO, true)).resolves.toEqual({ erro: "Sem permissão para mudar o acesso" });
    expect(estado.chamadas).toEqual([]);
  });

  it("repassa a recusa de tirar o último da lista", async () => {
    estado.resposta = { data: null, error: { code: "P0001", message: "O contrato ficaria sem ninguém ativo com acesso" } };
    await expect(definirAcesso(ID, USUARIO, false)).resolves.toEqual({ erro: "O contrato ficaria sem ninguém ativo com acesso" });
  });
});

describe("excluirContrato", () => {
  it("exige motivo antes do banco", async () => {
    await expect(excluirContrato(ID, " ")).resolves.toEqual({ erro: "Informe o motivo" });
    expect(estado.chamadas).toEqual([]);
  });
});
```

- [ ] **Step 5: Implementar as actions**

`src/modules/medicao/contratos/actions.ts`:

```ts
"use server";

import { revalidatePath } from "next/cache";

import { erroAcao, semLancar } from "@/lib/erros";
import { mensagemDeNegocio } from "@/lib/erros-banco";
import { idSchema } from "@/lib/id";
import { exigirPermissao } from "@/lib/permissoes";
import { createClient } from "@/lib/supabase/server";
import {
  aditivoSchema,
  contratoSchema,
  motivoSchema,
  payloadDoAditivo,
  payloadDoContrato,
  type AditivoInput,
  type ContratoInput,
} from "@/modules/medicao/contratos/schemas";

/**
 * Mutações do cadastro de contrato (`medicao.contratos`). Só por RPC, que confere de novo a ação E
 * o acesso ao contrato. Nada aqui toca obra, cliente ou centro de custo (D1, D2).
 */

const RECURSO = "medicao.contratos" as const;
const ROTA = "/medicao/contratos";

export type ResultadoAcao = { ok: true } | { erro: string };
export type ResultadoSalvar = { ok: true; id: string } | { erro: string };

async function pode(acao: "criar" | "editar" | "excluir"): Promise<boolean> {
  try {
    await exigirPermissao(RECURSO, acao);
    return true;
  } catch {
    return false;
  }
}

function revalidar(id?: string) {
  for (const rota of [ROTA, "/medicao/planilha", ...(id ? [`${ROTA}/${id}`] : [])]) {
    try {
      revalidatePath(rota);
    } catch {
      // O sucesso já aconteceu.
    }
  }
}

export async function salvarContrato(id: string | null, dados: ContratoInput): Promise<ResultadoSalvar> {
  return semLancar("medicao.contratos.salvar", async () => {
    if (!(await pode(id === null ? "criar" : "editar"))) {
      return { erro: id === null ? "Sem permissão para cadastrar contrato" : "Sem permissão para editar contrato" };
    }
    if (id !== null && !idSchema.safeParse(id).success) return { erro: "Contrato inválido" };
    const validado = contratoSchema.safeParse(dados);
    if (!validado.success) return { erro: validado.error.issues[0]?.message ?? "Dados inválidos" };

    const supabase = await createClient();
    const { data, error } = await supabase.rpc("fn_mc_contrato_salvar", {
      p_dados: payloadDoContrato(validado.data),
      p_id: id ?? undefined,
    });
    if (error) {
      if (error.code === "23505") return { erro: `Já existe outro contrato ativo com o código ${validado.data.codigo.toUpperCase()}` };
      return erroAcao("medicao.contratos.salvar", error, mensagemDeNegocio(error, "Não foi possível salvar o contrato. Tente novamente"));
    }
    const salvo = typeof data === "string" ? data : (id ?? "");
    revalidar(salvo);
    return { ok: true, id: salvo };
  });
}

export async function definirAcesso(contratoId: string, usuarioId: string, tem: boolean): Promise<ResultadoAcao> {
  return semLancar("medicao.contratos.acesso", async () => {
    if (!(await pode("editar"))) return { erro: "Sem permissão para mudar o acesso" };
    if (!idSchema.safeParse(contratoId).success || !idSchema.safeParse(usuarioId).success) return { erro: "Dados inválidos" };
    const supabase = await createClient();
    const { error } = await supabase.rpc("fn_mc_acesso_definir", { p_contrato: contratoId, p_usuario: usuarioId, p_tem: tem });
    if (error) return erroAcao("medicao.contratos.acesso", error, mensagemDeNegocio(error, "Não foi possível mudar o acesso"));
    revalidar(contratoId);
    return { ok: true };
  });
}

export async function salvarAditivo(contratoId: string, id: string | null, dados: AditivoInput): Promise<ResultadoSalvar> {
  return semLancar("medicao.contratos.aditivo", async () => {
    if (!(await pode("editar"))) return { erro: "Sem permissão para registrar aditivo" };
    if (!idSchema.safeParse(contratoId).success || (id !== null && !idSchema.safeParse(id).success)) return { erro: "Dados inválidos" };
    const validado = aditivoSchema.safeParse(dados);
    if (!validado.success) return { erro: validado.error.issues[0]?.message ?? "Dados inválidos" };
    const supabase = await createClient();
    const { data, error } = await supabase.rpc("fn_mc_aditivo_salvar", {
      p_contrato: contratoId,
      p_dados: payloadDoAditivo(validado.data),
      p_id: id ?? undefined,
    });
    if (error) return erroAcao("medicao.contratos.aditivo", error, mensagemDeNegocio(error, "Não foi possível salvar o aditivo"));
    revalidar(contratoId);
    return { ok: true, id: typeof data === "string" ? data : (id ?? "") };
  });
}

async function excluir(tabela: "mc_contratos" | "mc_aditivos", id: string, motivo: string, contexto: string): Promise<ResultadoAcao> {
  if (!(await pode("excluir"))) return { erro: "Sem permissão para excluir" };
  if (!idSchema.safeParse(id).success) return { erro: "Registro inválido" };
  const m = motivoSchema.safeParse(motivo);
  if (!m.success) return { erro: "Informe o motivo" };
  const supabase = await createClient();
  const { error } = await supabase.rpc("fn_mc_excluir", { p_tabela: tabela, p_id: id, p_motivo: m.data });
  if (error) return erroAcao(contexto, error, mensagemDeNegocio(error, "Não foi possível excluir"));
  revalidar();
  return { ok: true };
}

export async function excluirContrato(id: string, motivo: string): Promise<ResultadoAcao> {
  return semLancar("medicao.contratos.excluir", () => excluir("mc_contratos", id, motivo, "medicao.contratos.excluir"));
}

export async function excluirAditivo(id: string, motivo: string): Promise<ResultadoAcao> {
  return semLancar("medicao.contratos.excluirAditivo", () => excluir("mc_aditivos", id, motivo, "medicao.contratos.excluirAditivo"));
}

export async function restaurarContrato(id: string): Promise<ResultadoAcao> {
  return semLancar("medicao.contratos.restaurar", async () => {
    if (!idSchema.safeParse(id).success) return { erro: "Registro inválido" };
    const supabase = await createClient();
    const { error } = await supabase.rpc("fn_mc_restaurar", { p_tabela: "mc_contratos", p_id: id });
    if (error) {
      if (error.code === "23505") return { erro: "Já existe outro contrato ativo com este código. Mude o código dele antes de restaurar" };
      return erroAcao("medicao.contratos.restaurar", error, mensagemDeNegocio(error, "Não foi possível restaurar"));
    }
    revalidar(id);
    return { ok: true };
  });
}
```

Confira em `src/lib/erros-banco.ts` que `mensagemDeNegocio` devolve `error.message` para `P0001`. Se ele não fizer isso, é o teste "erro de negócio chega como está" que vai pegar. Não mude o `mensagemDeNegocio`: trate aqui.

Run: `npx vitest run src/modules/medicao/contratos/`. Esperado: PASS. Mutação: tire o `if (!(await pode(...)))` do `salvarContrato`: o primeiro teste tem de falhar.

- [ ] **Step 6: Queries**

`src/modules/medicao/contratos/queries.ts`:

```ts
import "server-only";

import { createClient } from "@/lib/supabase/server";

/** Leitura do cadastro de contrato. A RLS já filtra pela lista do contrato (D3). */

export interface ContratoLista {
  id: string;
  codigo: string;
  nomeObra: string;
  numeroContrato: string;
  contratanteNome: string;
  contratanteTipo: string;
  valorInicial: number;
  status: string;
  excluidoEm: string | null;
  motivoExclusao: string | null;
}

export async function listarContratos(filtros: { status?: string; tipo?: string; lixeira?: boolean }): Promise<ContratoLista[]> {
  const supabase = await createClient();
  let q = supabase
    .from("mc_contratos")
    .select("id, codigo, nome_obra, numero_contrato, contratante_nome, contratante_tipo, valor_inicial, status, excluido_em, motivo_exclusao")
    .order("codigo");
  q = filtros.lixeira ? q.not("excluido_em", "is", null) : q.is("excluido_em", null);
  if (filtros.status) q = q.eq("status", filtros.status);
  if (filtros.tipo) q = q.eq("contratante_tipo", filtros.tipo);
  const { data, error } = await q;
  if (error) throw error;
  return (data ?? []).map((c) => ({
    id: c.id, codigo: c.codigo, nomeObra: c.nome_obra, numeroContrato: c.numero_contrato, contratanteNome: c.contratante_nome,
    contratanteTipo: c.contratante_tipo, valorInicial: Number(c.valor_inicial), status: c.status,
    excluidoEm: c.excluido_em, motivoExclusao: c.motivo_exclusao,
  }));
}

export type ContratoDetalhe = NonNullable<Awaited<ReturnType<typeof carregarContrato>>>;

export async function carregarContrato(id: string) {
  const supabase = await createClient();
  const { data, error } = await supabase.from("mc_contratos").select("*").eq("id", id).maybeSingle();
  if (error) throw error;
  return data;
}

export async function listarUsuariosDoContrato(id: string) {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("fn_mc_usuarios_do_contrato", { p_contrato: id });
  if (error) throw error;
  return data ?? [];
}

export async function listarUsuariosAtivos() {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("fn_mc_usuarios_ativos");
  if (error) throw error;
  return data ?? [];
}

export async function listarAditivos(contratoId: string) {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("mc_aditivos")
    .select("id, numero, data_assinatura, data_vigencia, tipos, prazo_acrescido_meses, motivo, excluido_em")
    .eq("contrato_id", contratoId)
    .is("excluido_em", null)
    .order("numero");
  if (error) throw error;
  return data ?? [];
}
```

`valor_inicial` é dinheiro de 2 casas e só é exibido: `Number` é aceitável aqui, porque nenhum cálculo sai dele. Comente isso na função.

- [ ] **Step 7: Telas**

Rotas no molde do Frete (`src/app/(app)/frete/layout.tsx`, `page.tsx`, `ajustes/page.tsx`):

`src/app/(app)/medicao/layout.tsx`: igual ao do Frete, trocando `"frete"` por `"medicao"`, sem o comentário do pedido do Tiago (o layout só mostra a régua quando há mais de uma aba).

`src/app/(app)/medicao/page.tsx`:

```tsx
import { notFound, redirect } from "next/navigation";

import { abasVisiveis, getUsuarioLogado } from "@/lib/permissoes";

/** A Fase 1 não tem painel: a rota do módulo cai na primeira aba que a pessoa vê. */
export default async function MedicaoPagina() {
  const usuario = await getUsuarioLogado();
  const primeira = abasVisiveis(usuario, "medicao")[0];
  if (!primeira) notFound();
  redirect(primeira.rota);
}
```

`src/app/(app)/medicao/contratos/page.tsx`: `PageHeader modulo="Medição" titulo="Contratos" descricao="Contratos medidos pelo módulo. Você só vê os contratos em que está na lista de acesso"`, `notFound()` sem `ver`, `listarContratos(filtros)`, botão `NovoContratoBotao` só com `criar`, e a lista em `ContratosTabela`. Filtros na URL: `status`, `tipo`, `lixeira=1`. A lixeira só aparece com `excluir`.

`ContratosTabela` (`"use client"`, molde de `ajustes-tabela.tsx`): colunas Código (JetBrains Mono, `font-mono`), Obra, Contrato, Contratante (nome + tipo em legenda), Valor do contrato (`MoneyText`, `alinharDireita`, `atomico`), Status (`StatusBadge` com `ROTULO_STATUS_CONTRATO`). `idTabela="medicao.contratos"`, `onRowClick` para `/medicao/contratos/[id]`. `EmptyState` com a ação "Cadastrar contrato" quando vazio e o usuário pode criar; sem poder criar, o texto é "Nenhum contrato com você na lista de acesso".

`ContratoFormDrawer` (molde de `ajuste-form-drawer.tsx`, `FormDrawer` + React Hook Form + `zodResolver(contratoSchema)`). Seções: Identificação (código, nome da obra, local, objeto, número do contrato), Contratante (nome, tipo, documento), Valores e prazo (valor do contrato com `InputPreco` de 2 casas, data de assinatura, data da OS, prazo em meses, início do prazo), Medição (dia de início do período com a ajuda "1 = mês civil; 26 = de 26 a 25, como no DNIT", localização rodovia ou texto, regra de arredondamento com "Ainda não definida" como opção vazia e a ajuda "Sem regra, o módulo não mostra valor. No Lote 09 ela é descoberta na planilha oficial"), Alertas (dias e %), Status e observações. Botão "Cadastrar contrato" ou "Salvar contrato". Sucesso: toast "Contrato cadastrado. Você já está na lista de acesso dele".

`src/app/(app)/medicao/contratos/[id]/page.tsx`: `carregarContrato(id)`; `null` vira `notFound()` (a RLS já esconde contrato fora da lista, então fora da lista é 404, e não "sem permissão"). `ContratoDetalhe` mostra os dados em grade, o botão "Editar contrato" (com `editar`), e três blocos:
- `AcessoContrato`: lista `listarUsuariosDoContrato` com nome, e-mail e selo "Inativo"; com `editar`, um `Combobox` de `listarUsuariosAtivos` + "Dar acesso", e "Tirar acesso" por linha, com `ConfirmDialog` ("Fulano deixa de ver este contrato e tudo dele"). Erro da RPC vira toast.
- `AditivosContrato`: tabela de `listarAditivos` (número, assinatura, vigência, tipos, meses, motivo) + drawer de aditivo (`aditivoSchema`) com "Registrar aditivo".
- `Anexos` canônico com `entidade="mc_contrato"` e o id: documentos do contrato (contrato assinado, cláusula de reajuste, OS).
- Link "Planilha contratual" para `/medicao/planilha?contrato=<id>`.
- `Trilha` canônica do registro.

- [ ] **Step 8: Verificar**

Run: `npx tsc --noEmit && npm run lint && npx vitest run src/modules/medicao`. Esperado: tudo limpo. Suba `npm run dev` e, logado como Admin **no banco em que a Task 5 foi aplicada na transação da prova**, não é possível ver a tela (o backfill não está aplicado). Para ver a tela antes do deploy: rode localmente contra o banco com as permissões do seu usuário de teste concedidas por `execute_sql` numa migration **não versionada** que você desfaz depois. Se isso não for aceitável, a verificação visual fica para o preview da Task 12.

- [ ] **Step 9: Commit**

```bash
git add src/modules/medicao/_shared/rotulos.ts src/modules/medicao/contratos "src/app/(app)/medicao"
git commit -m "Medição de contratos: cadastro de contrato, acesso por contrato e aditivos"
```

---

### Task 12: Planilha contratual (rascunho, importação pelo Storage, versões)

**Files:**
- Create: `src/modules/medicao/planilha/schemas.ts`, `queries.ts`, `actions.ts`, `actions.test.ts`, `ler-arquivo.ts`, `ler-arquivo.test.ts`
- Create: `src/modules/medicao/planilha/components/versoes-tabela.tsx`, `nova-versao-botao.tsx`, `importar-planilha.tsx`, `versao-detalhe.tsx`
- Create: `src/app/(app)/medicao/planilha/page.tsx`, `loading.tsx`, `[versaoId]/page.tsx`, `[versaoId]/importar/page.tsx`

**Interfaces:**
- Consumes: `lerCelula` (Task 8), `montarPlanilha`, `LinhaBruta`, `Montagem` (Task 9), `diagnosticarValores` (Task 9), `casarComVersaoAnterior`, `LinhaAnterior` (Task 10), `lerBinario` de `@/lib/arquivos`, `enviarAnexoDoNavegador` de `@/modules/_shared/anexos/enviar-do-navegador`.
- Produces (`ler-arquivo.ts`, server-only):

```ts
export interface Mapeamento {
  aba: string;
  linhaCabecalho: number;
  colunas: { codigo: number; descricao: number; unidade: number; preco: number; quantidade: number; valor: number | null };
}
export interface AbaPrevia { nome: string; linhas: { numero: number; celulas: string[] }[]; sugestao: Mapeamento | null }
export async function abrirPlanilha(buffer: ArrayBuffer): Promise<ExcelJS.Workbook>
export function previaDasAbas(wb: ExcelJS.Workbook, linhasPorAba?: number): AbaPrevia[]
export function sugerirMapeamento(aba: string, linhas: { numero: number; celulas: string[] }[]): Mapeamento | null
export function lerLinhasBrutas(wb: ExcelJS.Workbook, mapa: Mapeamento): LinhaBruta[]
```

- Produces (`actions.ts`):
  - `criarRascunho(contratoId: string, dados: { aditivoId: string | null; vigenteDesde: string; motivo: string }): Promise<{ ok: true; id: string } | { erro: string }>`
  - `lerAbasDaVersao(versaoId: string): Promise<{ ok: true; abas: AbaPrevia[]; arquivo: string } | { erro: string }>`
  - `previaDaImportacao(versaoId: string, mapa: Mapeamento, escolhas: Escolhas): Promise<{ ok: true; previa: Previa } | { erro: string }>`
  - `gravarImportacao(versaoId: string, mapa: Mapeamento, escolhas: Escolhas): Promise<{ ok: true; linhas: number } | { erro: string }>`
  - `aprovarVersao(versaoId: string)`, `desaprovarVersao(versaoId: string, motivo: string)`, `excluirVersao(versaoId: string, motivo: string)`
  - `type Escolhas = { paiPorOrdem: Record<number, number>; itemPorOrdem: Record<number, string | null>; duplicadosConfirmados: boolean; alertasLidos: boolean }`
  - `type Previa = Montagem & { diagnostico: Diagnostico | null; casamento: ResultadoCasamento | null; numeroVersao: number; bloqueios: number }`

- [ ] **Step 1: Testes do leitor de arquivo (falham)**

`src/modules/medicao/planilha/ler-arquivo.test.ts` monta um workbook em memória com exceljs, grava em buffer e lê de volta. Assim o teste passa pelo mesmo caminho do arquivo real:

```ts
// @vitest-environment node
import ExcelJS from "exceljs";
import { describe, expect, it } from "vitest";

import { abrirPlanilha, lerLinhasBrutas, previaDasAbas, sugerirMapeamento } from "./ler-arquivo";

async function arquivo(): Promise<ArrayBuffer> {
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet("Planilha");
  ws.addRow(["CONSÓRCIO EMT-COLORADO I"]);
  ws.addRow([]);
  ws.addRow(["ITEM", "DISCRIMINAÇÃO", "UNID.", "PREÇO UNITÁRIO", "QUANTIDADE PREVISTA", "VALOR PREVISTO"]);
  ws.addRow(["02.07", "Pavimentação"]);
  ws.addRow(["02.07.04", "CBUQ", "t", 580.8642996, 17057.717, { formula: "D5*E5", result: 9908218.84 }]);
  ws.addRow(["02.07.05", "Imprimação", "m2 ", 4.5, 100, { formula: "D6*E6" }]);
  ws.getRow(6).hidden = true;
  const buf = await wb.xlsx.writeBuffer();
  return buf as ArrayBuffer;
}

describe("ler-arquivo", () => {
  it("sugere o mapeamento pela linha de cabeçalho", async () => {
    const wb = await abrirPlanilha(await arquivo());
    const [aba] = previaDasAbas(wb);
    expect(aba.nome).toBe("Planilha");
    expect(aba.sugestao).toEqual({ aba: "Planilha", linhaCabecalho: 3,
      colunas: { codigo: 1, descricao: 2, unidade: 3, preco: 4, quantidade: 5, valor: 6 } });
  });

  it("lê do cabeçalho para baixo, com a casa escondida, a linha oculta e a fórmula sem valor", async () => {
    const wb = await abrirPlanilha(await arquivo());
    const mapa = sugerirMapeamento("Planilha", previaDasAbas(wb)[0].linhas);
    const linhas = lerLinhasBrutas(wb, mapa!);
    expect(linhas.map((l) => l.linhaOrigem)).toEqual([4, 5, 6]);
    expect(linhas[1].preco).toEqual({ tipo: "numero", texto: "580.8642996" });
    expect(linhas[1].valor).toEqual({ tipo: "numero", texto: "9908218.84" });
    expect(linhas[2]).toMatchObject({ oculta: true, unidade: { tipo: "texto", bruto: "m2 " }, valor: { tipo: "formula_sem_valor" } });
  });

  it("sem cabeçalho reconhecível não sugere nada", () => {
    expect(sugerirMapeamento("X", [{ numero: 1, celulas: ["a", "b"] }])).toBeNull();
  });
});
```

- [ ] **Step 2: Implementar `ler-arquivo.ts`**

```ts
import "server-only";

import ExcelJS from "exceljs";

import { lerCelula } from "./leitor";
import type { LinhaBruta } from "./montagem";

/**
 * Lê o xlsx oficial DEPOIS que ele está no Storage (o servidor baixa, spec 6.1). O navegador só
 * escolhe aba e colunas; os números saem daqui.
 */

export interface Mapeamento {
  aba: string;
  linhaCabecalho: number;
  colunas: { codigo: number; descricao: number; unidade: number; preco: number; quantidade: number; valor: number | null };
}

export interface AbaPrevia {
  nome: string;
  linhas: { numero: number; celulas: string[] }[];
  sugestao: Mapeamento | null;
}

export async function abrirPlanilha(buffer: ArrayBuffer): Promise<ExcelJS.Workbook> {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(buffer);
  return wb;
}

function textoDaCelula(valor: ExcelJS.CellValue): string {
  const c = lerCelula(valor);
  if (c.tipo === "numero") return c.texto;
  if (c.tipo === "texto" || c.tipo === "erro") return c.bruto;
  if (c.tipo === "formula_sem_valor") return "(fórmula sem valor)";
  return "";
}

export function previaDasAbas(wb: ExcelJS.Workbook, linhasPorAba = 40): AbaPrevia[] {
  return wb.worksheets.map((ws) => {
    const linhas: AbaPrevia["linhas"] = [];
    for (let n = 1; n <= Math.min(ws.rowCount, linhasPorAba); n++) {
      const row = ws.getRow(n);
      const celulas: string[] = [];
      for (let c = 1; c <= Math.min(ws.columnCount, 30); c++) celulas.push(textoDaCelula(row.getCell(c).value));
      linhas.push({ numero: n, celulas });
    }
    return { nome: ws.name, linhas, sugestao: sugerirMapeamento(ws.name, linhas) };
  });
}

const norm = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").trim().toLowerCase();

const PADROES: Record<keyof Mapeamento["colunas"], RegExp> = {
  codigo: /^(item|codigo|cod\.?)$/,
  descricao: /^(discriminacao|descricao|servico|servicos)/,
  unidade: /^(unid\.?|unidade|und\.?|un\.?)$/,
  preco: /preco\s*unit/,
  quantidade: /^(quant|qtd)/,
  valor: /^valor\s*(previsto|total|contratual)?/,
};

export function sugerirMapeamento(aba: string, linhas: { numero: number; celulas: string[] }[]): Mapeamento | null {
  for (const linha of linhas) {
    const achou = (padrao: RegExp) => linha.celulas.findIndex((c) => padrao.test(norm(c))) + 1;
    const colunas = {
      codigo: achou(PADROES.codigo), descricao: achou(PADROES.descricao), unidade: achou(PADROES.unidade),
      preco: achou(PADROES.preco), quantidade: achou(PADROES.quantidade), valor: achou(PADROES.valor) || null,
    };
    if (colunas.codigo && colunas.descricao && colunas.unidade && colunas.preco && colunas.quantidade) {
      return { aba, linhaCabecalho: linha.numero, colunas };
    }
  }
  return null;
}

export function lerLinhasBrutas(wb: ExcelJS.Workbook, mapa: Mapeamento): LinhaBruta[] {
  const ws = wb.getWorksheet(mapa.aba);
  if (!ws) throw new Error(`A aba ${mapa.aba} não existe no arquivo`);
  const linhas: LinhaBruta[] = [];
  for (let n = mapa.linhaCabecalho + 1; n <= ws.rowCount; n++) {
    const row = ws.getRow(n);
    const cel = (coluna: number) => lerCelula(row.getCell(coluna).value);
    linhas.push({
      linhaOrigem: n,
      oculta: row.hidden === true,
      codigo: cel(mapa.colunas.codigo),
      descricao: cel(mapa.colunas.descricao),
      unidade: cel(mapa.colunas.unidade),
      preco: cel(mapa.colunas.preco),
      quantidade: cel(mapa.colunas.quantidade),
      valor: mapa.colunas.valor ? cel(mapa.colunas.valor) : null,
      colunas: { preco: mapa.colunas.preco, quantidade: mapa.colunas.quantidade, valor: mapa.colunas.valor },
    });
  }
  return linhas;
}
```

Run: `npx vitest run src/modules/medicao/planilha/ler-arquivo.test.ts`. Esperado: PASS. Se o exceljs não gravar `hidden` no buffer, troque `ws.getRow(6).hidden = true` por `ws.getRow(6).hidden = true; ws.getRow(6).commit()` e confira de novo. Linha oculta tem de sobreviver à ida e volta, senão o alerta nunca dispara em arquivo real.

- [ ] **Step 3: Testes das actions (falham)**

`src/modules/medicao/planilha/actions.test.ts`. As queries e o Storage são trocados por mocks; o arquivo é um xlsx de verdade, gerado pelo exceljs, e passa pelo mesmo leitor do arquivo real:

```ts
// @vitest-environment node
import ExcelJS from "exceljs";
import { beforeEach, describe, expect, it, vi } from "vitest";

type Versao = { id: string; contratoId: string; numero: number; status: string };

const estado = vi.hoisted(() => ({
  negadas: [] as string[],
  chamadas: [] as { fn: string; args: Record<string, unknown> }[],
  versao: null as Versao | null,
  arquivo: null as { path: string; nome: string } | null,
  buffer: new ArrayBuffer(0),
  anteriores: [] as unknown[],
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
      return { data: 2, error: null };
    },
  }),
}));
vi.mock("@/lib/arquivos", () => ({
  lerBinario: async () => ({ blob: new Blob([estado.buffer]), tamanhoBytes: estado.buffer.byteLength }),
  hashDoArquivo: async () => "hash-do-servidor",
}));
vi.mock("@/modules/medicao/planilha/queries", () => ({
  carregarVersaoParaImportar: async () => estado.versao,
  arquivoDaVersao: async () => estado.arquivo,
  linhasDaVersaoAnterior: async () => estado.anteriores,
}));

import { gravarImportacao } from "@/modules/medicao/planilha/actions";

const V = "33333333-3333-4333-8333-333333333333";
const MAPA = { aba: "Planilha", linhaCabecalho: 1, colunas: { codigo: 1, descricao: 2, unidade: 3, preco: 4, quantidade: 5, valor: null } };
const OK = { paiPorOrdem: {}, itemPorOrdem: {}, duplicadosConfirmados: true, alertasLidos: true };

async function planilha(linhas: unknown[][]): Promise<ArrayBuffer> {
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet("Planilha");
  ws.addRow(["ITEM", "DISCRIMINAÇÃO", "UNID.", "PREÇO UNITÁRIO", "QUANTIDADE"]);
  for (const l of linhas) ws.addRow(l);
  return (await wb.xlsx.writeBuffer()) as ArrayBuffer;
}

beforeEach(async () => {
  estado.negadas = [];
  estado.chamadas = [];
  estado.versao = { id: V, contratoId: "c", numero: 0, status: "rascunho" };
  estado.arquivo = { path: "anexos/x.xlsx", nome: "planilha.xlsx" };
  estado.anteriores = [];
  estado.buffer = await planilha([["02.07", "Pavimentação"], ["02.07.04", "CBUQ", "t", 580.8642996, 17057.717]]);
  vi.spyOn(console, "error").mockImplementation(() => {});
});

describe("gravarImportacao", () => {
  it("sem medicao.planilha/criar não chama o banco", async () => {
    estado.negadas = ["medicao.planilha/criar"];
    await expect(gravarImportacao(V, MAPA, OK)).resolves.toEqual({ erro: "Sem permissão para importar planilha" });
    expect(estado.chamadas).toEqual([]);
  });

  it("versão sem xlsx anexado", async () => {
    estado.arquivo = null;
    await expect(gravarImportacao(V, MAPA, OK)).resolves.toEqual({ erro: "Anexe o xlsx oficial antes de importar" });
  });

  it("versão que não está em rascunho", async () => {
    estado.versao = { id: V, contratoId: "c", numero: 0, status: "vigente" };
    await expect(gravarImportacao(V, MAPA, OK)).resolves.toEqual({ erro: "A versão 0 não está em rascunho" });
  });

  it("alerta que bloqueia impede a gravação", async () => {
    estado.buffer = await planilha([["01", "X", "un", { formula: "1+1" }, 1]]);
    await expect(gravarImportacao(V, MAPA, OK)).resolves.toEqual({ erro: "A planilha tem 1 problema que impede a importação" });
    expect(estado.chamadas).toEqual([]);
  });

  it("código repetido sem confirmação", async () => {
    estado.buffer = await planilha([["01", "A", "un", 1, 1], ["01", "B", "un", 1, 1]]);
    await expect(gravarImportacao(V, MAPA, { ...OK, duplicadosConfirmados: false })).resolves.toEqual({ erro: "Confirme os códigos repetidos" });
  });

  it("pai ambíguo sem escolha, e com escolha grava", async () => {
    estado.buffer = await planilha([["02.02", "A", "t", 1, 1], ["02.02", "B", "t", 1, 1], ["02.02.01", "C", "t", 1, 1]]);
    await expect(gravarImportacao(V, MAPA, OK)).resolves.toEqual({ erro: "Escolha o pai das linhas com código ambíguo" });
    await expect(gravarImportacao(V, MAPA, { ...OK, paiPorOrdem: { 3: 1 } })).resolves.toEqual({ ok: true, linhas: 2 });
    const linhas = estado.chamadas[0].args.p_linhas as { ordem: number; pai_ordem: number | null }[];
    expect(linhas[2].pai_ordem).toBe(1);
  });

  it("alertas não lidos", async () => {
    estado.buffer = await planilha([["01", "Roçada", "un ", 1, 1]]);
    await expect(gravarImportacao(V, MAPA, { ...OK, alertasLidos: false })).resolves.toEqual({ erro: "Marque que leu os alertas" });
  });

  it("grava os números como texto, o pai por ordem e o hash medido no servidor", async () => {
    await expect(gravarImportacao(V, MAPA, OK)).resolves.toEqual({ ok: true, linhas: 2 });
    expect(estado.chamadas).toHaveLength(1);
    const { fn, args } = estado.chamadas[0];
    expect(fn).toBe("fn_mc_planilha_gravar_linhas");
    expect(args.p_arquivo_hash).toBe("hash-do-servidor");
    expect(args.p_arquivo_nome).toBe("planilha.xlsx");
    expect(args.p_linhas).toEqual([
      { ordem: 1, codigo: "02.07", pai_ordem: null, descricao: "Pavimentação", unidade: null, tipo: "titulo",
        preco_unitario: null, quantidade_prevista: null, linha_origem: 2, item_id: null },
      { ordem: 2, codigo: "02.07.04", pai_ordem: 1, descricao: "CBUQ", unidade: "t", tipo: "servico",
        preco_unitario: "580.8642996", quantidade_prevista: "17057.717", linha_origem: 3, item_id: null },
    ]);
  });

  it("aditivo com item ambíguo não grava", async () => {
    estado.versao = { id: V, contratoId: "c", numero: 1, status: "rascunho" };
    estado.anteriores = [
      { itemId: "a", codigo: "02.07.04", descricao: "CBUQ", unidade: "t", tipo: "servico", precoUnitario: "580", quantidadePrevista: "1" },
      { itemId: "b", codigo: "02.07.04", descricao: "CBUQ", unidade: "t", tipo: "servico", precoUnitario: "580", quantidadePrevista: "1" },
    ];
    await expect(gravarImportacao(V, MAPA, OK)).resolves.toEqual({ erro: "Resolva os itens ambíguos do aditivo" });
  });
});
```

Run: `npx vitest run src/modules/medicao/planilha/actions.test.ts`. Esperado: FAIL, `actions.ts` não existe.

- [ ] **Step 4: Implementar schemas, queries e actions**

`src/modules/medicao/planilha/schemas.ts`:

```ts
import { z } from "zod";

export const mapeamentoSchema = z.object({
  aba: z.string().min(1),
  linhaCabecalho: z.number().int().positive(),
  colunas: z.object({
    codigo: z.number().int().positive(), descricao: z.number().int().positive(), unidade: z.number().int().positive(),
    preco: z.number().int().positive(), quantidade: z.number().int().positive(), valor: z.number().int().positive().nullable(),
  }),
});

export const escolhasSchema = z.object({
  paiPorOrdem: z.record(z.string(), z.number().int().positive()),
  itemPorOrdem: z.record(z.string(), z.string().nullable()),
  duplicadosConfirmados: z.boolean(),
  alertasLidos: z.boolean(),
});

export const rascunhoSchema = z.object({
  aditivoId: z.string().nullable(),
  vigenteDesde: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Informe a data de início da versão"),
  motivo: z.string().trim(),
});

export type Escolhas = z.infer<typeof escolhasSchema>;
```

`src/modules/medicao/planilha/queries.ts` (server-only):
- `listarVersoes(contratoId)`: `mc_planilha_versoes` (não excluídas, e as excluídas quando `lixeira=1`) com `mc_v_versao_totais.total_previsto` e o nome do aditivo.
- `carregarVersao(versaoId)`: a versão, o contrato (`codigo`, `regra_arredondamento`) e as linhas de `mc_v_planilha_linhas` + `mc_v_planilha_totais`, ordenadas por `ordem`. Use `todasAsLinhas` de `@/lib/supabase/todas-as-linhas`: o Lote 09 passa das 1.000 linhas do teto silencioso do PostgREST.
- Detalhe de `linhasDaVersaoAnterior`: linhas da versão `numero - 1` como `LinhaAnterior[]` (preço e quantidade lidos como **texto**: `preco_unitario::text` numa view auxiliar ou `select=preco_unitario` com o PostgREST devolvendo numeric como string; confira o tipo que chega e, se vier `number`, crie a view `mc_v_planilha_linhas_texto` numa migration aditiva desta task).
- `carregarVersaoParaImportar(versaoId): Promise<{ id: string; contratoId: string; numero: number; status: string } | null>` (RLS: fora da lista devolve null).
- `arquivoDaVersao(versaoId): Promise<{ path: string; nome: string } | null>`: o vínculo mais recente com `entidade_tipo = 'mc_planilha_versao'`, com `arquivos.path_storage` e `nome_original`.
- `linhasDaVersaoAnterior(contratoId: string, numero: number): Promise<LinhaAnterior[]>`: descrito abaixo.

`src/modules/medicao/planilha/actions.ts`: o núcleo de `gravarImportacao` é

```ts
async function montarDaVersao(versaoId: string, mapa: Mapeamento, escolhas: Escolhas) {
  const versao = await carregarVersaoParaImportar(versaoId);         // RLS: fora da lista = null
  if (!versao) return { erro: "Versão não encontrada" } as const;
  if (versao.status !== "rascunho") return { erro: `A versão ${versao.numero} não está em rascunho` } as const;
  const arquivo = await arquivoDaVersao(versaoId);
  if (!arquivo) return { erro: "Anexe o xlsx oficial antes de importar" } as const;
  const binario = await lerBinario(arquivo.path);
  if ("erro" in binario) return { erro: binario.erro } as const;
  const wb = await abrirPlanilha(await binario.blob.arrayBuffer());
  const montagem = montarPlanilha(lerLinhasBrutas(wb, mapa), escolhas.paiPorOrdem);
  const anteriores = versao.numero > 0 ? await linhasDaVersaoAnterior(versao.contratoId, versao.numero) : null;
  const casamento = anteriores ? casarComVersaoAnterior(montagem.linhas, anteriores, escolhas.itemPorOrdem) : null;
  const previa: Previa = {
    ...montagem,
    diagnostico: diagnosticarValores(montagem.linhas),
    casamento,
    numeroVersao: versao.numero,
    bloqueios: montagem.alertas.filter((a) => a.bloqueia).length,
  };
  return { versao, arquivo, binario, previa } as const;
}
```

`previaDaImportacao` devolve `previa`. `gravarImportacao` recusa, nesta ordem: `bloqueios > 0` ("A planilha tem 1 problema que impede a importação"; com mais de um, "A planilha tem N problemas que impedem a importação"), `duplicados.length > 0 && !duplicadosConfirmados` ("Confirme os códigos repetidos"), `ambiguidades.length > 0` ("Escolha o pai das linhas com código ambíguo"), casamento com `ambiguo` ("Resolva os itens ambíguos do aditivo"), `alertas.length > 0 && !alertasLidos` ("Marque que leu os alertas"). Depois chama:

```ts
const { data, error } = await supabase.rpc("fn_mc_planilha_gravar_linhas", {
  p_versao: versaoId,
  p_linhas: previa.linhas.map((l) => ({
    ordem: l.ordem, codigo: l.codigo, pai_ordem: l.paiOrdem, descricao: l.descricao, unidade: l.unidade, tipo: l.tipo,
    preco_unitario: l.precoUnitario, quantidade_prevista: l.quantidadePrevista, linha_origem: l.linhaOrigem,
    item_id: casamento?.linhas.find((c) => c.ordem === l.ordem)?.itemId ?? null,
  })),
  p_arquivo_nome: arquivo.nome,
  p_arquivo_hash: await hashDoArquivo(binario.blob),
});
```

Todas começam por `exigirPermissao("medicao.planilha", <ação>)` (criar para rascunho/prévia/gravar; aprovar; desaprovar; excluir), no mesmo formato `pode()` da Task 11, e validam ids com `idSchema` e entradas com os schemas.

Run: `npx vitest run src/modules/medicao/planilha/`. Esperado: PASS. Mutação: tire a recusa por `duplicadosConfirmados`: o caso tem de falhar.

- [ ] **Step 5: Telas**

`src/app/(app)/medicao/planilha/page.tsx`: `searchParams.contrato`. Sem contrato: `FilterBar` com `FiltroSelect` dos contratos da lista (`listarContratos({})`) e `EmptyState` "Escolha o contrato". Com contrato: `PageHeader titulo="Planilha contratual" descricao="Versões da planilha. A v0 é a licitada; cada aditivo entra como versão nova, sem apagar a anterior"`, `VersoesTabela` (Versão `v0`, Aditivo, Vigente desde, Status `StatusBadge`, Previsto `MoneyText` do banco ou "Sem regra de arredondamento" em `text-muted-foreground` quando nulo, Arquivo), e `NovaVersaoBotao` com `criar`: drawer com a data de início, o aditivo (obrigatório a partir da v1, lista de `listarAditivos` sem versão) e o motivo. Ao criar, vai para `/medicao/planilha/<id>/importar`.

`src/app/(app)/medicao/planilha/[versaoId]/importar/page.tsx` + `ImportarPlanilha` (`"use client"`), passos:
1. **Arquivo**: `Anexos` canônico com `entidade="mc_planilha_versao"`, aceitando `.xlsx`. Texto: "Envie o xlsx oficial. O módulo lê os números do arquivo guardado, nunca do que aparece na tela". Com o arquivo anexado, "Ler planilha" chama `lerAbasDaVersao`.
2. **Colunas**: seletor de aba, linha do cabeçalho e as seis colunas (valor é opcional), preenchidos pela sugestão; tabela das 40 primeiras linhas com a linha de cabeçalho destacada.
3. **Prévia** (`previaDaImportacao`): cartões com linhas, títulos, serviços e bloqueios; lista de alertas agrupada por tipo, bloqueantes primeiro (cor `status-rejeitado`); para cada ambiguidade de pai, um `Select` com os candidatos (código, descrição e linha do xlsx), com o sugerido marcado; bloco dos códigos repetidos com a caixa "Confirmo que são serviços distintos e entram como estão"; **diagnóstico da coluna de valor**, em texto: "Das N linhas com valor na planilha: A batem com qtd × preço arredondado a 2 casas, E batem com qtd × preço exato, I dão o mesmo número nas duas leituras, D não fecham" e a tabela das que não fecham (código, exato, arredondado, planilha), com a frase "Isto não escolhe a regra do contrato. Leve para o Tiago decidir" (spec 6.2); no aditivo, a tabela do casamento (situação por linha com `StatusBadge`, `Select` para ambíguos e para trocar novo/casado) e a lista do que saiu; a caixa "Li os alertas".
4. **Gravar**: "Gravar no rascunho" chama `gravarImportacao`; sucesso vai para `/medicao/planilha/<id>`.

`src/app/(app)/medicao/planilha/[versaoId]/page.tsx` + `VersaoDetalhe`: cabeçalho com versão, status, vigente desde, aditivo, arquivo (link pelo `urlDoAnexo`) e hash; tabela das linhas (`DataTable` plana, recuo por `nivel` com `padding-left`, título em peso 600): Item (mono), Discriminação, Unid., Preço unitário (texto do numeric **completo**, `tabular-nums`, alinhado à direita), Quantidade prevista (idem), Valor previsto (`MoneyText` do banco; nos títulos, o `total_previsto` da subárvore). Rodapé com o total da versão (`mc_v_versao_totais`). Ações: rascunho com `aprovar` → "Tornar vigente" (`ConfirmDialog`: "A versão fica imutável. Mudança depois só por aditivo"); rascunho com `criar` → "Reimportar"; rascunho com `excluir` → "Excluir rascunho" com motivo; vigente com `desaprovar` → "Voltar a rascunho" com motivo (a RPC recusa se houver medição). Sem regra de arredondamento: faixa de aviso no topo, "O contrato ainda não tem regra de arredondamento. Os valores aparecem quando ela for definida no cadastro", com link para o contrato.

- [ ] **Step 6: Verificar**

Run: `npx tsc --noEmit && npm run lint && npm run test -- --run && npm run build`. Esperado: tudo limpo.

- [ ] **Step 7: Commit**

```bash
git add src/modules/medicao/planilha "src/app/(app)/medicao/planilha"
git commit -m "Medição de contratos: importação da planilha contratual pelo Storage, versões e aditivos"
```

---

### Task 13: Documentação, deploy e prova final

**Files:**
- Modify: `docs/decisoes.md`
- Modify: `docs/superpowers/specs/2026-09-25-medicao-contratos-design.md`
- Modify (fora do repo): `vault/projects/erp-emt/status.md`, `vault/log.md`

- [ ] **Step 1: Emendas da spec**

Na seção 6.2, troque "Opções previstas; só entra no CHECK a que a planilha oficial provar" por: "As três regras são opções genéricas do contrato, implementadas e provadas na Fase 1 com números feitos à mão. Qual delas é a do Lote 09 é descoberto na planilha oficial (Fase 2), com o diagnóstico da importação, e mostrado ao Tiago antes de gravar. Regra nula = contrato sem valor." Na seção 6.1, acrescente: "O xlsx sobe direto para o Storage como anexo da versão; o servidor baixa e lê. O navegador nunca manda os números (limite de 4 MB da Server Action e confiança)." Na seção 4.1, acrescente: "Na Fase 1 só `medicao.contratos` e `medicao.planilha` entram no catálogo; cada aba entra na fase dela, com o seu backfill."

- [ ] **Step 2: Decisões**

No fim de `docs/decisoes.md`, no formato `**Contexto:** / **Decisão:** / **Consequência:**`:

```markdown
## 2026-10-01 - Medição de Contratos: módulo independente, acesso por lista do contrato

**Contexto:** o Tiago pediu um módulo de medição para todos os contratos, com a planilha que só muda
por aditivo, lançamento diário e reajuste. O módulo da Fase 6 saiu na reforma de 20/07 porque gerava
fatura e a receber sozinho.

**Decisão:**
1. Prefixo `mc_` (`medicoes` e `fn_registrar_medicao` são da Manutenção). Nenhuma FK para outro módulo;
   o contrato tem os próprios dados e não cria nem se vincula a obra (Tiago, 25/09).
2. Acesso por contrato só por lista (`mc_contrato_usuarios`, a linha é o acesso), Admin inclusive. Toda
   policy do módulo e os anexos `mc_*` exigem a lista.
3. As ações pedidas (cadastrar, lançar, fechar, importar, reajuste) viram recursos por aba com as 6
   ações de sempre (ver a decisão de 2026-08 sobre não criar ação nova).
4. Exceção à regra 3 do CLAUDE.md: preço, quantidade prevista e quantidade de carga são `numeric` sem
   escala, porque a planilha oficial tem casas escondidas (02.07.04 do Lote 09). Quantidade digitada
   continua com 4 casas.
5. Valor, acumulado, total e glosa só em view `security_invoker`; o TypeScript não recalcula dinheiro.
   A regra de arredondamento é do contrato (três opções), nula até ser descoberta.
6. O xlsx da planilha é lido no servidor, a partir do Storage.

**Consequência:** a Fase 2 descobre a regra do Lote 09 com o diagnóstico da importação e mostra ao
Tiago. Aba nova do módulo entra no catálogo junto com a tela e o backfill dela.
```

- [ ] **Step 3: Aplicar o backfill e conferir**

Com o PR aprovado pelo Tiago e o preview da Vercel verde: MCP `apply_migration` de `mc_fase1f_permissoes` (a trava `$confere$` aborta se não forem 4 Admins e 36 linhas). `get_advisors`. Rode a prova inteira `supabase/provas/mc_fase1_banco.sql` no banco vivo (sem a cópia do backfill que a Task 5 colou dentro dela: retire o bloco). Cole a saída completa na descrição do PR.

- [ ] **Step 4: Portão**

```bash
npx tsc --noEmit && npm run lint && npm run test -- --run && npm run build
```

Esperado: tudo limpo. Abra o PR como rascunho, com o corpo:

```markdown
Fase 1 da Medição de Contratos (spec `docs/superpowers/specs/2026-09-25-medicao-contratos-design.md`).

- Banco inteiro do módulo (19 tabelas `mc_*`, cálculo por view, travas, acesso por contrato), só aditivo.
- Telas: Contratos (cadastro, acesso, aditivos, documentos) e Planilha contratual (importação pelo Storage, versões).
- Nada escreve em outro módulo (caso 9 da prova).

Prova `supabase/provas/mc_fase1_banco.sql`: <cole a saída>
Advisors: <resultado>
Mutações feitas: <lista da execução, task a task>

🤖 Generated with [Claude Code](https://claude.com/claude-code)
```

Espere o CI verde. **Não mergeie**: o Tiago aprova cada fase.

- [ ] **Step 5: Status do projeto**

Em `vault/projects/erp-emt/status.md`, entrada no topo `> **Sessão DD/MM/AAAA: Medição de Contratos, Fase 1 ...**` com o PR, o que entrou, a prova e o que falta (Fase 2: carga do Lote 09, que espera os arquivos oficiais e a resposta da pergunta Q1). Atualize `updated` e `last_run`. Registre no `vault/log.md`.

- [ ] **Step 6: Commit**

```bash
git add docs/decisoes.md docs/superpowers/specs/2026-09-25-medicao-contratos-design.md
git commit -m "Decisões e emendas da spec da Medição de Contratos, Fase 1"
git push -u origin medicao-fase1
```

---

## Cobertura da spec na Fase 1

| Spec | Onde |
|---|---|
| 2 D1, D2 (independência) | Task 1 (sem FK), caso 9 da prova |
| 2 D3 (lista do contrato) | Tasks 1, 4, 6; casos 6 e 8 |
| 3 (nomes) | Global Constraints |
| 4.1 (recursos, backfill) | Task 5 (abas da Fase 1), Task 13 |
| 4.2, 4.3 | Tasks 1, 4, 6 |
| 5.1 a 5.5 (modelo) | Task 1 (todas as tabelas, reajuste vazio) |
| 5.2 hierarquia, duplicado, filho com preço | Task 9; caso 2 |
| 5.2 aditivo e identidade do item | Tasks 4, 10; caso 4c |
| 5.4 roteamento do lançamento | Task 3; casos 4a, 5a, 5b, 5d |
| 6.1 casas escondidas | Tasks 8, 9, 12; caso 4d (`580.86429961`) |
| 6.2 regras de arredondamento | Task 2; casos 2 e 3; diagnóstico da Task 9 |
| 7 imutabilidade | Task 3; casos 5e*, 5f, 5g |
| 8 alertas da importação | Task 9 |
| 9 telas 2 e 3 | Tasks 11 e 12 |
| 11 provas, mutação | cada task |

Ficam para as fases seguintes, como a spec manda: telas 1, 4 a 9, RPCs de lançamento, medição e reajuste, a carga, os demais recursos e os alertas calculados (`mc_v_alertas`).
