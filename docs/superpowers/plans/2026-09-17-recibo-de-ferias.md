# Recibo de férias (Bloco 8d) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Pagar férias pelo ERP: uma tela cria o registro e o recibo juntos, os valores são digitados, e a aprovação gera a conta a pagar no centro de custo do colaborador.

**Architecture:** `rh_ferias` ganha o dinheiro em cima do registro que já existe. Uma linha = umas férias = um recibo, com dois status independentes (gozo e pagamento). O app não calcula nada: o único número derivado é `líquido = bruto − INSS − IRRF`, mantido por trigger. Ciclo de aprovação e geração de lançamento copiados do 13º, que está em produção.

**Tech Stack:** Next.js 15 App Router, TypeScript strict, Supabase (Postgres + RLS), Zod v4, vitest, shadcn.

**Spec:** `docs/superpowers/specs/2026-09-17-recibo-de-ferias-design.md`

## Global Constraints

- **Migrations vão pelo MCP `apply_migration`**, no projeto vivo `vsesgvqjgqpapoxhnbqx`, com `name` igual ao nome completo do arquivo. `supabase db push` é bomba armada neste repo: NUNCA rodar.
- **A migration que FECHA privilégio não é aplicada nesta entrega.** Ver Task 9 e a razão no cabeçalho dela.
- **Reler a definição viva antes de alterar função existente.** O arquivo do repo diverge do banco em mais de 150 versões.
- **Dinheiro é `numeric(14,2)`.** O app não calcula 13º nem férias: os valores são digitados.
- **Testes:** sandbox desligado, e **NÃO** passar `--environment=node` na suíte inteira (o `vitest.config.ts` define jsdom e o override derruba todo teste de componente com `document is not defined`, ainda assim saindo com exit 0). Comando: `npx vitest run`.
- **`eslint` e `next build` não rodam nesta máquina** (penduram em 0% de CPU: lint com tipos varrendo `node_modules` em diretório sincronizado com iCloud). Verificação deles é pelo CI do PR. Dizer isso no relato, nunca anunciar "tudo verde".
- **`"use client"` tem que ser a primeira linha** de todo arquivo que a declara. O `tsc` não pega; há teste guardando em `src/components/canonicos/use-client-no-topo.test.ts`.
- **Nada de `setState` dentro de `useEffect`.** Estado derivado de prop se ajusta DURANTE o render (padrão em `vencimento-lote.tsx`). O lint do CI recusa o efeito.
- **`git add` com caminhos explícitos**, nunca `-A`, e **nunca filtrar a saída do `git status`** antes de commitar: o repo tem arquivos soltos de outras frentes (`__repro*`) que não são nossos.
- **Commits frequentes**, um por task. Branch `recibo-ferias`, já criada a partir de `origin/main`.
- `git fetch origin` antes de cada task: outra frente pode ter mexido no banco ou no main.

## Estado de partida, medido em 17/09/2026

| | |
|---|---|
| `rh_ferias` | **0 linhas**, 12 colunas, RLS com policies de SELECT/INSERT/UPDATE/DELETE |
| Grants de `rh_ferias` | `authenticated`: **DELETE, INSERT, SELECT, UPDATE** (não é RPC-only) |
| FKs de `rh_ferias` | só `colaborador_id`. **`created_by` não tem FK** |
| `lancamentos.origem` | aceita `ferias`; **NÃO aceita `ferias_guia`** |
| Colaboradores ativos | 28 CLT (10 com admissão), mais terceiros e diaristas |

O ponto que governa a ordem das tasks: as actions `criarFerias`, `editarFerias` e `removerFerias` escrevem **direto na tabela** via PostgREST. Fechar os grants antes de convertê-las derruba a tela de férias em produção.

## File Structure

**Migrations:**
- `supabase/migrations/20260917<hhmmss>_ferias_recibo_colunas.sql` — colunas, trigger, FKs, origem da guia.
- `supabase/migrations/20260917<hhmmss>_ferias_recibo_rpcs.sql` — criar, editar, vencimento e o ciclo.
- `supabase/migrations/20260917<hhmmss>_ferias_recibo_aprovar.sql` — aprovar e desaprovar.
- `supabase/migrations/20260917<hhmmss>_ferias_cadastro_por_rpc.sql` — as três de cadastro viram RPC.
- `supabase/migrations/_PENDENTE_20260917_ferias_fecha_grants.sql` — **a que fecha. NÃO aplicar nesta entrega.**

**Prova:** `supabase/provas/recibo_ferias.sql`

**Módulo** `src/modules/rh/ferias/` (já existe; ganha):
- `recibo-schemas.ts` + `recibo-schemas.test.ts`
- `mensagem-aprovacao.ts` + `mensagem-aprovacao.test.ts`
- `recibo-queries.ts`, `recibo-actions.ts`
- `components/lancar-ferias-drawer.tsx`, `components/recibo-detalhe.tsx`, `components/editar-recibo-drawer.tsx`, `components/vencimento-recibo.tsx`

**Rota:** `src/app/(app)/rh/decimo-terceiro-e-ferias/ferias/[id]/page.tsx`

Arquivos separados dos de férias que já existem (`schemas.ts`, `queries.ts`, `actions.ts`) de propósito: o cadastro e o dinheiro têm donos diferentes, e misturar deixaria um arquivo com duas responsabilidades.

---

### Task 1: Colunas do recibo, trigger e a origem da guia

**Files:**
- Create: `supabase/migrations/20260917<hhmmss>_ferias_recibo_colunas.sql`

**Interfaces:**
- Produces: as colunas de dinheiro em `rh_ferias`; `fn_ferias_recibo_liquido()` (trigger); a origem `ferias_guia` aceita em `lancamentos`.

- [ ] **Step 1: Conferir o estado de partida**

```bash
git fetch origin && git status --short
```

Via MCP `execute_sql`, e ANOTAR:

```sql
select
  (select count(*) from rh_ferias) as linhas,
  (select pg_get_constraintdef(oid) from pg_constraint
    where conrelid='public.lancamentos'::regclass and conname='lancamentos_origem_check') as origens;
```

Esperado: `linhas = 0`, e a lista de origens SEM `ferias_guia`. Se `linhas > 0`, PARAR: alguém começou a usar a tela e o desenho precisa de conversa antes.

- [ ] **Step 2: Escrever a migration**

```sql
-- O recibo de ferias: dinheiro em cima do registro que ja existe.
--
-- Uma linha de rh_ferias = umas ferias = um recibo. Dois status independentes:
-- `status` e o GOZO (programada/gozada) e `status_recibo` e o PAGAMENTO.
-- Alguem pode estar de ferias sem o recibo ter saido, e receber antecipado sem
-- ter saido ainda.
--
-- O app NAO calcula ferias. Bruto, INSS e IRRF sao digitados; o unico numero
-- derivado e a subtracao.

alter table public.rh_ferias
  add column if not exists status_recibo text not null default 'sem_recibo',
  add column if not exists valor_bruto numeric(14,2) not null default 0,
  add column if not exists valor_inss numeric(14,2) not null default 0,
  add column if not exists valor_irrf numeric(14,2) not null default 0,
  add column if not exists valor_liquido numeric(14,2) not null default 0,
  add column if not exists data_vencimento date,
  add column if not exists centro_custo_id uuid references public.centros_custo(id),
  add column if not exists lancamento_id uuid references public.lancamentos(id),
  add column if not exists aprovado_por uuid,
  add column if not exists aprovado_em timestamptz,
  add column if not exists motivo_rejeicao text;

alter table public.rh_ferias
  drop constraint if exists rh_ferias_status_recibo_check;
alter table public.rh_ferias
  add constraint rh_ferias_status_recibo_check check (status_recibo in
    ('sem_recibo','rascunho','pendente_aprovacao','aprovado'));

-- `created_by` existe como coluna desde sempre e NUNCA teve FK. Ganha agora,
-- junto com `aprovado_por`: sao referencias de verdade e devem ser declaradas.
--
-- Consequencia que o PostgREST impoe: com DUAS FKs para `usuarios`, todo embed
-- de usuario nesta tabela passa a exigir hint (`usuarios!nome_da_fk(...)`).
-- Sem hint, HTTP 300 / PGRST201 e a tela quebra, sem aparecer em tsc, lint ou
-- build. A query da Task 6 ja nasce com o hint.
alter table public.rh_ferias
  drop constraint if exists rh_ferias_created_by_fkey,
  drop constraint if exists rh_ferias_aprovado_por_fkey;

alter table public.rh_ferias
  add constraint rh_ferias_created_by_fkey
    foreign key (created_by) references public.usuarios(id),
  add constraint rh_ferias_aprovado_por_fkey
    foreign key (aprovado_por) references public.usuarios(id);

comment on column public.rh_ferias.status_recibo is
  'Status do PAGAMENTO. Independente de `status`, que e o do GOZO.';

-- Liquido = bruto - INSS - IRRF. Coluna comum com trigger, e NAO coluna
-- gerada: coluna gerada faz o PostgREST devolver 428C9 para o frontend
-- publicado antes do deploy novo.
create or replace function public.fn_ferias_recibo_liquido()
returns trigger
language plpgsql
set search_path to ''
as $$
begin
  new.valor_liquido := new.valor_bruto - new.valor_inss - new.valor_irrf;
  return new;
end $$;

drop trigger if exists rh_ferias_liquido on public.rh_ferias;
create trigger rh_ferias_liquido
  before insert or update of valor_bruto, valor_inss, valor_irrf
  on public.rh_ferias
  for each row execute function public.fn_ferias_recibo_liquido();

-- A guia do recibo de ferias ganha origem PROPRIA, e nao 'folha_guia'.
-- Mesma razao do 13o: folha_guias.folha_id e NOT NULL apontando para `folhas`,
-- e rh/folha/queries.ts casa folha_guias por lancamento_id para classificar a
-- linha como guia. Um 'folha_guia' sem linha la vira orfao silencioso.
alter table public.lancamentos drop constraint lancamentos_origem_check;

alter table public.lancamentos add constraint lancamentos_origem_check
  check (origem in ('oc','manual','diaria','folha','folha_guia',
                    'adiantamento','rescisao','decimo_terceiro','ferias',
                    'decimo_terceiro_guia','ferias_guia'));
```

- [ ] **Step 3: Aplicar via MCP e rodar o advisor**

`apply_migration` com `name` = `20260917<hhmmss>_ferias_recibo_colunas`. Depois `get_advisors` (security). Anotar a contagem total de avisos ANTES de qualquer outra task, para comparar depois: a saída é grande e o que importa é se apareceu algo novo citando `rh_ferias`.

- [ ] **Step 4: Conferir o que nasceu**

```sql
select
  (select count(*) from information_schema.columns
    where table_schema='public' and table_name='rh_ferias') as colunas,
  (select count(*) from pg_constraint
    where conrelid='public.rh_ferias'::regclass and contype='f'
      and pg_get_constraintdef(oid) like '%usuarios%') as fks_usuarios,
  (select pg_get_constraintdef(oid) from pg_constraint
    where conrelid='public.lancamentos'::regclass and conname='lancamentos_origem_check')
      like '%ferias_guia%' as guia_aceita;
```

Esperado: `colunas = 23`, `fks_usuarios = 2`, `guia_aceita = true`.

- [ ] **Step 5: Provar o embed ANTES de escrever query nenhuma**

Com duas FKs para `usuarios`, o embed sem hint quebra. Provar agora, com a anon key (`get_publishable_keys`, tipo legacy) e o `get_project_url`:

```bash
K="<anon key>"
U="https://vsesgvqjgqpapoxhnbqx.supabase.co/rest/v1/rh_ferias"
curl -s -o /dev/null -w "sem hint: HTTP %{http_code}\n" \
  "$U?select=id,usuarios(nome)&limit=1" -H "apikey: $K" -H "Authorization: Bearer $K"
curl -s -o /dev/null -w "com hint: HTTP %{http_code}\n" \
  "$U?select=id,usuarios!rh_ferias_aprovado_por_fkey(nome)&limit=1" -H "apikey: $K" -H "Authorization: Bearer $K"
```

Esperado: **sem hint 300** (ambíguo) e **com hint 401** (o embed resolveu e parou na permissão, que é o correto para `anon`). Se o "sem hint" vier 401 também, a segunda FK não foi criada: voltar à Step 2.

- [ ] **Step 6: Commit**

```bash
git add supabase/migrations/20260917*_ferias_recibo_colunas.sql
git commit -m "feat(rh): colunas do recibo de férias, trigger do líquido e a origem da guia"
```

---

### Task 2: As RPCs do recibo e do ciclo

**Files:**
- Create: `supabase/migrations/20260917<hhmmss>_ferias_recibo_rpcs.sql`
- Create: `supabase/provas/recibo_ferias.sql`

**Interfaces:**
- Consumes: as colunas da Task 1.
- Produces: `fn_lancar_ferias(...) returns uuid`, `fn_editar_recibo_ferias(uuid, numeric, numeric, numeric) returns void`, `fn_definir_vencimento_ferias(uuid, date) returns void`, `fn_enviar_recibo_ferias_aprovacao(uuid) returns void`, `fn_voltar_recibo_ferias_para_rascunho(uuid) returns void`, `fn_rejeitar_recibo_ferias(uuid, text) returns void`.

- [ ] **Step 1: Escrever a migration**

```sql
-- Criar o recibo (que cria as ferias junto), editar os valores, o vencimento,
-- e o ciclo ate a aprovacao. A aprovacao em si vem na migration seguinte,
-- porque mexe em dinheiro no financeiro.

-- ===================================================================
-- 1. Lancar ferias: cria a linha E o recibo, numa transacao
-- ===================================================================
-- Uma tela so, e nao "primeiro programe, depois pague": rh_ferias tinha ZERO
-- linhas em producao, o que diz que o cadastro em duas etapas nunca pegou.
create or replace function public.fn_lancar_ferias(
  p_colaborador uuid,
  p_aquisitivo_inicio date,
  p_aquisitivo_fim date,
  p_data_inicio date,
  p_data_fim date,
  p_dias integer,
  p_status text,
  p_bruto numeric,
  p_inss numeric default 0,
  p_irrf numeric default 0,
  p_data_vencimento date default null,
  p_observacao text default null
)
returns uuid
language plpgsql
security definer
set search_path to ''
as $$
declare
  v_uid uuid := (select auth.uid());
  v_ferias uuid;
  v_cc uuid;
  v_nome text;
begin
  if not public.tem_permissao('rh.decimo-terceiro-ferias', 'criar') then
    raise exception 'Sem permissao para lancar ferias';
  end if;

  select nome, centro_custo_id into v_nome, v_cc
    from public.colaboradores where id = p_colaborador;
  if v_nome is null then raise exception 'Colaborador nao encontrado'; end if;

  if p_status not in ('programada', 'gozada') then
    raise exception 'Status de gozo invalido: %', p_status;
  end if;

  -- Recibo sem dias nem datas nao da para pagar: nao se sabe do que e.
  if p_dias is null or p_dias <= 0 then
    raise exception 'Informe quantos dias de ferias.';
  end if;
  if p_data_inicio is null or p_data_fim is null then
    raise exception 'Informe as datas de inicio e fim do gozo.';
  end if;
  if p_data_fim < p_data_inicio then
    raise exception 'O fim do gozo (%) e antes do inicio (%).',
      to_char(p_data_fim, 'DD/MM/YYYY'), to_char(p_data_inicio, 'DD/MM/YYYY');
  end if;
  if p_aquisitivo_fim < p_aquisitivo_inicio then
    raise exception 'O fim do periodo aquisitivo e antes do inicio.';
  end if;

  if p_bruto is null or p_bruto < 0 then
    raise exception 'O bruto nao pode ser negativo';
  end if;
  if coalesce(p_inss,0) < 0 or coalesce(p_irrf,0) < 0 then
    raise exception 'O desconto nao pode ser negativo';
  end if;
  if coalesce(p_inss,0) + coalesce(p_irrf,0) > p_bruto then
    raise exception 'Os descontos (%) passam do bruto (%): o liquido ficaria negativo.',
      coalesce(p_inss,0) + coalesce(p_irrf,0), p_bruto;
  end if;

  insert into public.rh_ferias
    (colaborador_id, periodo_aquisitivo_inicio, periodo_aquisitivo_fim,
     data_inicio, data_fim, dias, status, observacao,
     status_recibo, valor_bruto, valor_inss, valor_irrf,
     data_vencimento, centro_custo_id, created_by)
  values
    (p_colaborador, p_aquisitivo_inicio, p_aquisitivo_fim,
     p_data_inicio, p_data_fim, p_dias, p_status, p_observacao,
     'rascunho', p_bruto, coalesce(p_inss,0), coalesce(p_irrf,0),
     p_data_vencimento, v_cc, v_uid)
  returning id into v_ferias;

  return v_ferias;
end $$;

comment on function public.fn_lancar_ferias(uuid, date, date, date, date, integer, text, numeric, numeric, numeric, date, text) is
  'Cria a linha de ferias E o recibo em rascunho, numa transacao. O app nao calcula: bruto, INSS e IRRF sao digitados, e o liquido sai do trigger. O centro de custo e fotografado do colaborador.';

-- ===================================================================
-- 2. Editar os valores do recibo
-- ===================================================================
create or replace function public.fn_editar_recibo_ferias(
  p_ferias uuid, p_bruto numeric, p_inss numeric default 0, p_irrf numeric default 0
)
returns void
language plpgsql
security definer
set search_path to ''
as $$
declare v_status text;
begin
  if not public.tem_permissao('rh.decimo-terceiro-ferias', 'editar') then
    raise exception 'Sem permissao para editar o recibo';
  end if;

  if p_bruto is null or p_bruto < 0 then
    raise exception 'O bruto nao pode ser negativo';
  end if;
  if coalesce(p_inss,0) < 0 or coalesce(p_irrf,0) < 0 then
    raise exception 'O desconto nao pode ser negativo';
  end if;
  if coalesce(p_inss,0) + coalesce(p_irrf,0) > p_bruto then
    raise exception 'Os descontos (%) passam do bruto (%): o liquido ficaria negativo.',
      coalesce(p_inss,0) + coalesce(p_irrf,0), p_bruto;
  end if;

  select status_recibo into v_status from public.rh_ferias
   where id = p_ferias for update;
  if not found then raise exception 'Ferias nao encontradas'; end if;

  if v_status <> 'rascunho' then
    raise exception 'O recibo esta em "%": so da para editar em rascunho.', v_status;
  end if;

  update public.rh_ferias
     set valor_bruto = p_bruto,
         valor_inss = coalesce(p_inss,0),
         valor_irrf = coalesce(p_irrf,0),
         updated_at = now()
   where id = p_ferias;
end $$;

-- ===================================================================
-- 3. Vencimento
-- ===================================================================
create or replace function public.fn_definir_vencimento_ferias(
  p_ferias uuid, p_data date
)
returns void
language plpgsql
security definer
set search_path to ''
as $$
declare v_status text; v_inicio date;
begin
  if not public.tem_permissao('rh.decimo-terceiro-ferias', 'editar') then
    raise exception 'Sem permissao para editar o recibo';
  end if;

  select status_recibo, data_inicio into v_status, v_inicio
    from public.rh_ferias where id = p_ferias for update;
  if not found then raise exception 'Ferias nao encontradas'; end if;

  -- So em rascunho: depois de enviado o recibo esta na mao de quem aprova, e
  -- mudar a data por baixo trocaria o que a pessoa autorizou sem ela ver.
  if v_status <> 'rascunho' then
    raise exception 'O recibo esta em "%": a data de vencimento so muda em rascunho.', v_status;
  end if;

  -- Guarda de DIGITACAO: ferias sao pagas ate dois dias antes do gozo, mas
  -- recibo atrasado e caso real. O piso e um ano antes do inicio do gozo, que
  -- pega o erro tipico de ano errado sem recusar o atraso legitimo.
  if p_data is not null and v_inicio is not null
     and p_data < (v_inicio - interval '1 year')::date then
    raise exception 'A data de vencimento (%) esta mais de um ano antes do inicio do gozo (%).',
      to_char(p_data, 'DD/MM/YYYY'), to_char(v_inicio, 'DD/MM/YYYY');
  end if;

  update public.rh_ferias
     set data_vencimento = p_data, updated_at = now()
   where id = p_ferias;
end $$;

-- ===================================================================
-- 4. O ciclo ate a aprovacao
-- ===================================================================
create or replace function public.fn_enviar_recibo_ferias_aprovacao(p_ferias uuid)
returns void
language plpgsql
security definer
set search_path to ''
as $$
declare v_status text; v_liquido numeric;
begin
  if not public.tem_permissao('rh.decimo-terceiro-ferias', 'editar') then
    raise exception 'Sem permissao para enviar o recibo para aprovacao';
  end if;

  select status_recibo, valor_liquido into v_status, v_liquido
    from public.rh_ferias where id = p_ferias for update;
  if not found then raise exception 'Ferias nao encontradas'; end if;

  if v_status <> 'rascunho' then
    raise exception 'O recibo esta em "%": so da para enviar o que esta em rascunho.', v_status;
  end if;

  if coalesce(v_liquido, 0) <= 0 then
    raise exception 'O recibo esta zerado: informe o valor antes de enviar para aprovacao.';
  end if;

  update public.rh_ferias
     set status_recibo = 'pendente_aprovacao', motivo_rejeicao = null, updated_at = now()
   where id = p_ferias;
end $$;

-- Lado de QUEM MONTOU: correcao antes de alguem aprovar, sem motivo.
create or replace function public.fn_voltar_recibo_ferias_para_rascunho(p_ferias uuid)
returns void
language plpgsql
security definer
set search_path to ''
as $$
declare v_status text;
begin
  if not public.tem_permissao('rh.decimo-terceiro-ferias', 'editar') then
    raise exception 'Sem permissao para editar o recibo';
  end if;

  select status_recibo into v_status from public.rh_ferias
   where id = p_ferias for update;
  if not found then raise exception 'Ferias nao encontradas'; end if;

  if v_status <> 'pendente_aprovacao' then
    raise exception 'O recibo esta em "%": so da para voltar para rascunho o que esta pendente.', v_status;
  end if;

  update public.rh_ferias
     set status_recibo = 'rascunho', motivo_rejeicao = null, updated_at = now()
   where id = p_ferias;
end $$;

-- Lado de QUEM APROVA: devolve COM motivo. Vai para rascunho, e nao para um
-- status 'rejeitado', porque de 'rejeitado' nao se reenvia: seria beco sem
-- saida, que foi o bug do 13o em 12/09.
create or replace function public.fn_rejeitar_recibo_ferias(p_ferias uuid, p_motivo text)
returns void
language plpgsql
security definer
set search_path to ''
as $$
declare v_status text;
begin
  if not public.tem_permissao('rh.decimo-terceiro-ferias', 'aprovar') then
    raise exception 'Sem permissao para devolver o recibo';
  end if;

  if btrim(coalesce(p_motivo, ''), E' \t\r\n') = '' then
    raise exception 'Informe o motivo da devolucao';
  end if;

  select status_recibo into v_status from public.rh_ferias
   where id = p_ferias for update;
  if not found then raise exception 'Ferias nao encontradas'; end if;

  if v_status <> 'pendente_aprovacao' then
    raise exception 'O recibo esta em "%": so da para devolver o que esta pendente.', v_status;
  end if;

  update public.rh_ferias
     set status_recibo = 'rascunho',
         motivo_rejeicao = btrim(p_motivo, E' \t\r\n'),
         updated_at = now()
   where id = p_ferias;
end $$;
```

- [ ] **Step 2: Aplicar via MCP e rodar o advisor**

- [ ] **Step 3: Escrever a prova, parte 1**

Criar `supabase/provas/recibo_ferias.sql`. Molde: `supabase/provas/decimo_terceiro.sql`.

```sql
-- Prova do recibo de ferias (Bloco 8d).
--
-- A prova CHAMA as RPCs: plpgsql so valida as queries do corpo na PRIMEIRA
-- EXECUCAO, entao `apply_migration` devolver success nao prova nada.
--
-- O app nao calcula ferias, entao nao ha formula a conferir. O unico numero
-- e a subtracao: 1.000,00 - 80,00 - 20,00 = 900,00.

do $prova$
declare
  v_tiago uuid := 'c66fca9f-5428-4fb9-855f-dcff548764df';  -- Admin
  v_colab uuid; v_ferias uuid;
  a_status text; a_recibo text; a_liq numeric; a_cc uuid; a_cc_colab uuid;
  b_liq numeric;
  c_erro text := '(NAO RECUSOU)';
  d_erro text := '(NAO RECUSOU)';
  e_status text; f_status text; f_motivo text;
  g_status text; g_motivo text;
  h_erro text := '(NAO RECUSOU)';
begin
  -- Com centro de custo: sem ele a asserção de centro compararia null com
  -- null e passaria sem provar nada.
  select id, centro_custo_id into v_colab, a_cc_colab
    from public.colaboradores where ativo and centro_custo_id is not null limit 1;
  if v_colab is null then raise exception 'FALHOU: nenhum colaborador ativo com centro de custo'; end if;

  perform set_config('request.jwt.claims', json_build_object('sub', v_tiago, 'role','authenticated')::text, true);
  execute 'set local role authenticated';

  -- A) lancar cria a linha E o recibo
  v_ferias := public.fn_lancar_ferias(
    v_colab, date '2025-01-01', date '2025-12-31',
    date '2026-03-02', date '2026-03-31', 30, 'programada',
    1000.00, 80.00, 20.00, null, 'prova');

  select status, status_recibo, valor_liquido, centro_custo_id
    into a_status, a_recibo, a_liq, a_cc
    from public.rh_ferias where id = v_ferias;

  if a_status <> 'programada' then raise exception 'FALHOU gozo: veio %', a_status; end if;
  if a_recibo <> 'rascunho' then raise exception 'FALHOU recibo: veio %', a_recibo; end if;
  if a_liq <> 900.00 then raise exception 'FALHOU liquido: esperado 900.00, veio %', a_liq; end if;
  if a_cc is distinct from a_cc_colab then
    raise exception 'FALHOU: centro de custo nao veio do colaborador';
  end if;

  -- B) editar regrava e o trigger refaz o liquido
  perform public.fn_editar_recibo_ferias(v_ferias, 500.00, 0, 0);
  select valor_liquido into b_liq from public.rh_ferias where id = v_ferias;
  if b_liq <> 500.00 then raise exception 'FALHOU edicao: veio %', b_liq; end if;

  -- C) CONTROLE: desconto maior que o bruto
  begin
    perform public.fn_editar_recibo_ferias(v_ferias, 100.00, 90.00, 90.00);
  exception when others then c_erro := sqlerrm; end;
  if c_erro = '(NAO RECUSOU)' then raise exception 'FALHOU: aceitou desconto > bruto'; end if;

  -- D) CONTROLE: lancar sem dias
  begin
    perform public.fn_lancar_ferias(
      v_colab, date '2025-01-01', date '2025-12-31',
      date '2026-03-02', date '2026-03-31', 0, 'programada', 100.00);
  exception when others then d_erro := sqlerrm; end;
  if d_erro = '(NAO RECUSOU)' then raise exception 'FALHOU: lancou ferias sem dias'; end if;

  -- E) enviar
  perform public.fn_enviar_recibo_ferias_aprovacao(v_ferias);
  select status_recibo into e_status from public.rh_ferias where id = v_ferias;
  if e_status <> 'pendente_aprovacao' then raise exception 'FALHOU envio: %', e_status; end if;

  -- F) devolver volta para rascunho COM motivo, e de la da para editar
  perform public.fn_rejeitar_recibo_ferias(v_ferias, '  valor errado  ');
  select status_recibo, motivo_rejeicao into f_status, f_motivo
    from public.rh_ferias where id = v_ferias;
  if f_status <> 'rascunho' then raise exception 'FALHOU devolucao: %', f_status; end if;
  if f_motivo <> 'valor errado' then raise exception 'FALHOU motivo sem trim: "%"', f_motivo; end if;
  perform public.fn_editar_recibo_ferias(v_ferias, 600.00, 0, 0);

  -- G) VOLTAR PARA RASCUNHO, do lado de quem montou: enviar de novo e trazer
  -- de volta SEM motivo. E o caminho que faltou no 13o e deixou um lote preso
  -- em pendente_aprovacao com a tela inteira em so leitura.
  perform public.fn_enviar_recibo_ferias_aprovacao(v_ferias);
  perform public.fn_voltar_recibo_ferias_para_rascunho(v_ferias);
  select status_recibo, motivo_rejeicao into g_status, g_motivo
    from public.rh_ferias where id = v_ferias;
  if g_status <> 'rascunho' then raise exception 'FALHOU voltar: %', g_status; end if;
  if g_motivo is not null then
    raise exception 'FALHOU: voltar para rascunho deixou motivo gravado ("%"), e nao e recusa', g_motivo;
  end if;
  -- O ponto de voltar e poder editar de novo. Se isto estourar, voltar nao
  -- serviu para nada.
  perform public.fn_editar_recibo_ferias(v_ferias, 700.00, 0, 0);

  -- H) CONTROLE: voltar de novo, ja estando em rascunho
  begin
    perform public.fn_voltar_recibo_ferias_para_rascunho(v_ferias);
  exception when others then h_erro := sqlerrm; end;
  if h_erro = '(NAO RECUSOU)' then raise exception 'FALHOU: voltou um recibo que ja estava em rascunho'; end if;

  reset role;
  raise exception E'PROVA RECIBO DE FERIAS - parte 1 (desfeita)\n  A) lancou: gozo=% recibo=% liquido=% centro do colaborador? %\n  B) editou -> %\n  C) CONTROLE desconto > bruto -> %\n  D) CONTROLE lancar sem dias -> %\n  E) enviou -> %\n  F) devolveu -> % motivo="%" e deu para editar\n  G) voltou para % sem motivo, e deu para editar de novo\n  H) CONTROLE voltar ja em rascunho -> %',
    a_status, a_recibo, a_liq, (a_cc = a_cc_colab), b_liq, c_erro, d_erro, e_status, f_status, f_motivo, g_status, h_erro;
end $prova$;
```

- [ ] **Step 4: Rodar a prova**

Rodar o conteúdo via `execute_sql`. Esperado: erro `PROVA RECIBO DE FERIAS - parte 1 (desfeita)` com os valores entre parênteses batendo. Qualquer `FALHOU` é falha real.

Depois conferir que nada ficou:

```sql
select count(*) as sobrou from rh_ferias;
```

Esperado: `0`.

- [ ] **Step 5: Gravar o resultado no rodapé da prova e commitar**

Colar a saída como comentário no fim do arquivo, no padrão das outras provas.

```bash
git add supabase/migrations/20260917*_ferias_recibo_rpcs.sql supabase/provas/recibo_ferias.sql
git commit -m "feat(rh): RPCs do recibo de férias e do ciclo até a aprovação"
```

---

### Task 3: Aprovar e desaprovar

**Files:**
- Create: `supabase/migrations/20260917<hhmmss>_ferias_recibo_aprovar.sql`
- Modify: `supabase/provas/recibo_ferias.sql` (parte 2)

**Interfaces:**
- Consumes: `fn_exigir_competencia_aberta(p_mes date, p_entidade text, p_id uuid)`.
- Produces: `fn_aprovar_recibo_ferias(uuid) returns void`, `fn_desaprovar_recibo_ferias(uuid, text) returns void`.

- [ ] **Step 1: Reler o molde vivo**

```sql
select pg_get_functiondef(p.oid)
from pg_proc p join pg_namespace n on n.oid=p.pronamespace
where n.nspname='public' and p.proname='fn_aprovar_decimo_terceiro';
```

O bloco de insert em `lancamentos` + `lancamento_parcelas` + `parcela_eventos` + `lancamento_rateios` é copiado dali. Copiar da definição VIVA, não do arquivo do repo.

- [ ] **Step 2: Escrever a migration**

```sql
create or replace function public.fn_aprovar_recibo_ferias(p_ferias uuid)
returns void
language plpgsql
security definer
set search_path to ''
as $$
declare
  v_f record; v_nome text;
  v_uid uuid := (select auth.uid());
  v_comp date; v_venc date; v_lanc uuid; v_parcela uuid;
  v_aprova_pgto boolean := public.tem_permissao('financeiro.aprovacao-pagamentos', 'aprovar');
  v_st_parcela text;
  v_grupo_inss text; v_grupo_irrf text;
begin
  if not public.tem_permissao('rh.decimo-terceiro-ferias', 'aprovar') then
    raise exception 'Sem permissao para aprovar o recibo';
  end if;

  select f.*, c.nome into v_f
    from public.rh_ferias f join public.colaboradores c on c.id = f.colaborador_id
   where f.id = p_ferias for update;
  if not found then raise exception 'Ferias nao encontradas'; end if;
  v_nome := v_f.nome;

  if v_f.status_recibo <> 'pendente_aprovacao' then
    raise exception 'O recibo de % esta em "%": so da para aprovar o que esta pendente.', v_nome, v_f.status_recibo;
  end if;

  if v_f.valor_liquido <= 0 then
    raise exception 'O recibo esta zerado: informe o valor antes de aprovar.';
  end if;

  -- A competencia e o mes de INICIO DO GOZO: o custo pertence ao mes em que a
  -- pessoa esteve de ferias, nao ao mes em que o pagamento saiu.
  v_comp := date_trunc('month', v_f.data_inicio)::date;
  perform public.fn_exigir_competencia_aberta(v_comp, 'ferias', p_ferias);

  -- Sem data escolhida, vence dois dias antes do inicio do gozo, que e o
  -- prazo legal de pagamento das ferias.
  v_venc := coalesce(v_f.data_vencimento, v_f.data_inicio - 2);
  v_st_parcela := case when v_aprova_pgto then 'aprovado' else 'pendente' end;

  insert into public.lancamentos
    (tipo, origem, origem_id, centro_custo_id, descricao, valor, status,
     data_compra, mes_competencia, data_vencimento, created_by)
  values
    ('a_pagar', 'ferias', p_ferias, v_f.centro_custo_id,
     'Ferias ' || v_nome || ' ' || to_char(v_f.data_inicio, 'DD/MM') || ' a ' || to_char(v_f.data_fim, 'DD/MM/YYYY'),
     v_f.valor_liquido, 'a_pagar',
     (now() at time zone 'America/Rio_Branco')::date, v_comp, v_venc, v_uid)
  returning id into v_lanc;

  insert into public.lancamento_parcelas
    (lancamento_id, numero_parcela, valor, data_vencimento, status, created_by,
     aprovado_por, aprovado_em, data_programada, data_programada_origem)
  values (v_lanc, 1, v_f.valor_liquido, v_venc, v_st_parcela, v_uid,
     case when v_aprova_pgto then v_uid end,
     case when v_aprova_pgto then now() end,
     case when v_aprova_pgto then v_venc end,
     case when v_aprova_pgto then 'vencimento' end)
  returning id into v_parcela;

  if v_aprova_pgto then
    insert into public.parcela_eventos (parcela_id, tipo, data_para, created_by)
    values (v_parcela, 'aprovou', v_venc, v_uid);
  end if;

  if v_f.centro_custo_id is not null then
    insert into public.lancamento_rateios (lancamento_id, centro_custo_id, valor, created_by)
    values (v_lanc, v_f.centro_custo_id, v_f.valor_liquido, v_uid);
  end if;

  -- A guia sai do que foi DIGITADO. Sem desconto digitado, nao ha guia, que e
  -- o caso de quem nao tem carteira.
  if v_f.valor_inss > 0 or v_f.valor_irrf > 0 then
    select grupo_recolhimento_inss, grupo_recolhimento_irrf
      into v_grupo_inss, v_grupo_irrf
      from public.folha_parametros where id = 1;

    if v_grupo_inss is not null and v_f.valor_inss > 0 then
      insert into public.lancamentos
        (tipo, origem, origem_id, centro_custo_id, descricao, valor, status,
         data_compra, mes_competencia, data_vencimento, created_by)
      values ('a_pagar', 'ferias_guia', p_ferias, null,
        v_grupo_inss || ' ferias ' || v_nome,
        v_f.valor_inss, 'a_pagar',
        (now() at time zone 'America/Rio_Branco')::date, v_comp, v_venc, v_uid)
      returning id into v_lanc;
      insert into public.lancamento_parcelas
        (lancamento_id, numero_parcela, valor, data_vencimento, status, created_by)
      values (v_lanc, 1, v_f.valor_inss, v_venc, 'pendente', v_uid);
    end if;

    if v_grupo_irrf is not null and v_f.valor_irrf > 0 then
      insert into public.lancamentos
        (tipo, origem, origem_id, centro_custo_id, descricao, valor, status,
         data_compra, mes_competencia, data_vencimento, created_by)
      values ('a_pagar', 'ferias_guia', p_ferias, null,
        v_grupo_irrf || ' ferias ' || v_nome,
        v_f.valor_irrf, 'a_pagar',
        (now() at time zone 'America/Rio_Branco')::date, v_comp, v_venc, v_uid)
      returning id into v_lanc;
      insert into public.lancamento_parcelas
        (lancamento_id, numero_parcela, valor, data_vencimento, status, created_by)
      values (v_lanc, 1, v_f.valor_irrf, v_venc, 'pendente', v_uid);
    end if;
  end if;

  update public.rh_ferias
     set status_recibo = 'aprovado', aprovado_por = v_uid, aprovado_em = now(),
         motivo_rejeicao = null, lancamento_id = (
           select id from public.lancamentos
            where origem = 'ferias' and origem_id = p_ferias limit 1),
         updated_at = now()
   where id = p_ferias;
end $$;

comment on function public.fn_aprovar_recibo_ferias(uuid) is
  'Aprova o recibo: conta a pagar no centro de custo do colaborador, competencia no mes de INICIO DO GOZO, e guia por grupo quando houver INSS/IRRF digitado. Sem vencimento escolhido, vence dois dias antes do gozo.';

create or replace function public.fn_desaprovar_recibo_ferias(p_ferias uuid, p_motivo text)
returns void
language plpgsql
security definer
set search_path to ''
as $$
declare v_status text; v_ids uuid[];
begin
  if not public.tem_permissao('rh.decimo-terceiro-ferias', 'desaprovar') then
    raise exception 'Sem permissao para desaprovar o recibo';
  end if;

  if btrim(coalesce(p_motivo, ''), E' \t\r\n') = '' then
    raise exception 'Informe o motivo da desaprovacao';
  end if;

  select status_recibo into v_status from public.rh_ferias
   where id = p_ferias for update;
  if not found then raise exception 'Ferias nao encontradas'; end if;
  if v_status <> 'aprovado' then
    raise exception 'O recibo esta em "%": so da para desaprovar o que esta aprovado.', v_status;
  end if;

  select array_agg(id) into v_ids from public.lancamentos
   where origem in ('ferias', 'ferias_guia') and origem_id = p_ferias;

  if exists (
    select 1 from public.lancamento_parcelas lp
     where lp.lancamento_id = any(coalesce(v_ids, '{}')) and lp.status = 'pago'
  ) then
    raise exception 'Ha parcela ja paga neste recibo. Nao da para desaprovar.';
  end if;

  -- SOLTA a referencia ANTES do delete: a FK e simples, sem on delete set
  -- null, e inverter a ordem estoura no meio da desaprovacao.
  update public.rh_ferias set lancamento_id = null where id = p_ferias;

  if v_ids is not null then
    delete from public.lancamento_rateios where lancamento_id = any(v_ids);
    delete from public.parcela_eventos where parcela_id in
      (select id from public.lancamento_parcelas where lancamento_id = any(v_ids));
    delete from public.lancamento_parcelas where lancamento_id = any(v_ids);
    delete from public.lancamentos where id = any(v_ids);
  end if;

  update public.rh_ferias
     set status_recibo = 'rascunho', aprovado_por = null, aprovado_em = null,
         motivo_rejeicao = p_motivo, updated_at = now()
   where id = p_ferias;
end $$;
```

- [ ] **Step 3: Aplicar via MCP e rodar o advisor**

- [ ] **Step 4: Acrescentar a parte 2 da prova**

Bloco próprio em `supabase/provas/recibo_ferias.sql`, depois da parte 1:

```sql
do $prova2$
declare
  v_tiago uuid := 'c66fca9f-5428-4fb9-855f-dcff548764df';
  v_colab uuid; v_cc uuid; v_ferias uuid;
  a_qtd int; a_valor numeric; a_comp date; a_cc uuid;
  b_qtd int; b_status text; b_lanc uuid;
  c_erro text := '(NAO RECUSOU)';
begin
  select id, centro_custo_id into v_colab, v_cc
    from public.colaboradores where ativo and centro_custo_id is not null limit 1;

  perform set_config('request.jwt.claims', json_build_object('sub', v_tiago, 'role','authenticated')::text, true);
  execute 'set local role authenticated';

  v_ferias := public.fn_lancar_ferias(
    v_colab, date '2025-01-01', date '2025-12-31',
    date '2026-03-02', date '2026-03-31', 30, 'programada',
    1000.00, 80.00, 20.00, null, 'prova');

  -- C) CONTROLE: aprovar em rascunho
  begin
    perform public.fn_aprovar_recibo_ferias(v_ferias);
  exception when others then c_erro := sqlerrm; end;
  if c_erro = '(NAO RECUSOU)' then raise exception 'FALHOU: aprovou recibo em rascunho'; end if;

  perform public.fn_enviar_recibo_ferias_aprovacao(v_ferias);
  perform public.fn_aprovar_recibo_ferias(v_ferias);

  -- A) uma conta a pagar, no centro certo, na competencia do GOZO
  select count(*), coalesce(sum(l.valor),0), max(l.mes_competencia), max(l.centro_custo_id)
    into a_qtd, a_valor, a_comp, a_cc
    from public.lancamentos l
   where l.origem = 'ferias' and l.origem_id = v_ferias;

  if a_qtd <> 1 then raise exception 'FALHOU: esperava 1 lancamento, vieram %', a_qtd; end if;
  if a_valor <> 900.00 then raise exception 'FALHOU: lancamento de % em vez de 900.00', a_valor; end if;
  if a_comp <> date '2026-03-01' then
    raise exception 'FALHOU competencia: esperava 2026-03-01 (mes do gozo), veio %', a_comp;
  end if;
  if a_cc is distinct from v_cc then raise exception 'FALHOU: centro de custo errado'; end if;

  select lancamento_id into b_lanc from public.rh_ferias where id = v_ferias;
  if b_lanc is null then raise exception 'FALHOU: recibo aprovado sem lancamento_id'; end if;

  -- B) desaprovar devolve tudo
  perform public.fn_desaprovar_recibo_ferias(v_ferias, 'prova');
  select count(*) into b_qtd from public.lancamentos
   where origem in ('ferias','ferias_guia') and origem_id = v_ferias;
  select status_recibo, lancamento_id into b_status, b_lanc
    from public.rh_ferias where id = v_ferias;

  if b_qtd <> 0 then raise exception 'FALHOU: sobraram % lancamentos', b_qtd; end if;
  if b_status <> 'rascunho' then raise exception 'FALHOU: status apos desaprovar = %', b_status; end if;
  if b_lanc is not null then raise exception 'FALHOU: lancamento_id ficou orfao'; end if;

  reset role;
  raise exception E'PROVA RECIBO DE FERIAS - parte 2 (desfeita)\n  C) CONTROLE aprovar em rascunho -> %\n  A) aprovou: % lancamento de % na competencia % (mes do gozo), centro certo\n  B) desaprovou: % lancamentos, status %, lancamento_id nulo',
    c_erro, a_qtd, a_valor, a_comp, b_qtd, b_status;
end $prova2$;
```

- [ ] **Step 5: Rodar e conferir que nada sobrou**

```sql
select
  (select count(*) from rh_ferias) as ferias,
  (select count(*) from lancamentos where origem in ('ferias','ferias_guia')) as lancs;
```

Esperado: `0` nos dois.

- [ ] **Step 6: Gravar o resultado e commitar**

```bash
git add supabase/migrations/20260917*_ferias_recibo_aprovar.sql supabase/provas/recibo_ferias.sql
git commit -m "feat(rh): aprovar e desaprovar o recibo de férias"
```

---

### Task 4: As três actions de cadastro viram RPC

Esta task não acrescenta funcionalidade. Ela é o que torna **possível** fechar os grants na Task 9, e por isso vem antes das telas.

**Files:**
- Create: `supabase/migrations/20260917<hhmmss>_ferias_cadastro_por_rpc.sql`
- Modify: `src/modules/rh/ferias/actions.ts`

**Interfaces:**
- Produces: `fn_criar_ferias(...) returns uuid`, `fn_editar_ferias(...) returns void`, `fn_excluir_ferias(uuid) returns void`.

- [ ] **Step 1: Ler o que as actions escrevem hoje**

```bash
sed -n '1,130p' src/modules/rh/ferias/actions.ts
```

As três usam `.insert()`, `.update()` e `.delete()` direto na tabela. É exatamente isso que precisa sair, porque enquanto existir escrita direta o grant não pode fechar, e enquanto o grant não fechar **qualquer usuário autenticado pode alterar `valor_bruto` pelo PostgREST**, sem passar pela trava de status.

- [ ] **Step 2: Escrever a migration**

```sql
-- O cadastro de ferias (datas, dias, observacao, status de gozo) passa a
-- escrever por RPC, como o dinheiro.
--
-- Nao muda comportamento nenhum para quem usa a tela. Existe para que a
-- migration que FECHA os grants (arquivo _PENDENTE_) possa ser aplicada sem
-- derrubar a tela de ferias.
--
-- Nenhuma delas toca em valor: dinheiro so muda por fn_editar_recibo_ferias.

create or replace function public.fn_criar_ferias(
  p_colaborador uuid,
  p_aquisitivo_inicio date,
  p_aquisitivo_fim date,
  p_data_inicio date default null,
  p_data_fim date default null,
  p_dias integer default 0,
  p_status text default 'programada',
  p_observacao text default null
)
returns uuid
language plpgsql
security definer
set search_path to ''
as $$
declare v_id uuid;
begin
  if not public.tem_permissao('rh.decimo-terceiro-ferias', 'criar') then
    raise exception 'Sem permissao para criar ferias';
  end if;
  if p_status not in ('programada','gozada') then
    raise exception 'Status de gozo invalido: %', p_status;
  end if;
  if p_aquisitivo_fim < p_aquisitivo_inicio then
    raise exception 'O fim do periodo aquisitivo e antes do inicio.';
  end if;

  insert into public.rh_ferias
    (colaborador_id, periodo_aquisitivo_inicio, periodo_aquisitivo_fim,
     data_inicio, data_fim, dias, status, observacao, created_by)
  values
    (p_colaborador, p_aquisitivo_inicio, p_aquisitivo_fim,
     p_data_inicio, p_data_fim, coalesce(p_dias,0), p_status, p_observacao,
     (select auth.uid()))
  returning id into v_id;

  return v_id;
end $$;

create or replace function public.fn_editar_ferias(
  p_ferias uuid,
  p_aquisitivo_inicio date,
  p_aquisitivo_fim date,
  p_data_inicio date default null,
  p_data_fim date default null,
  p_dias integer default 0,
  p_status text default 'programada',
  p_observacao text default null
)
returns void
language plpgsql
security definer
set search_path to ''
as $$
begin
  if not public.tem_permissao('rh.decimo-terceiro-ferias', 'editar') then
    raise exception 'Sem permissao para editar ferias';
  end if;
  if p_status not in ('programada','gozada') then
    raise exception 'Status de gozo invalido: %', p_status;
  end if;

  -- NAO toca em valor nem em status_recibo: dinheiro so muda pela RPC do
  -- recibo, e status de recibo so pelo ciclo de aprovacao.
  update public.rh_ferias
     set periodo_aquisitivo_inicio = p_aquisitivo_inicio,
         periodo_aquisitivo_fim = p_aquisitivo_fim,
         data_inicio = p_data_inicio,
         data_fim = p_data_fim,
         dias = coalesce(p_dias,0),
         status = p_status,
         observacao = p_observacao,
         updated_at = now()
   where id = p_ferias;

  if not found then raise exception 'Ferias nao encontradas'; end if;
end $$;

create or replace function public.fn_excluir_ferias(p_ferias uuid)
returns void
language plpgsql
security definer
set search_path to ''
as $$
declare v_recibo text;
begin
  if not public.tem_permissao('rh.decimo-terceiro-ferias', 'excluir') then
    raise exception 'Sem permissao para excluir ferias';
  end if;

  select status_recibo into v_recibo from public.rh_ferias
   where id = p_ferias for update;
  if not found then raise exception 'Ferias nao encontradas'; end if;

  -- Recibo aprovado tem conta a pagar. Apagar aqui deixaria lancamento orfao.
  if v_recibo = 'aprovado' then
    raise exception 'Este recibo esta aprovado e tem conta a pagar. Desaprove antes de excluir.';
  end if;

  delete from public.rh_ferias where id = p_ferias;
end $$;
```

- [ ] **Step 3: Aplicar via MCP**

- [ ] **Step 4: Trocar as três actions para chamar as RPCs**

Em `src/modules/rh/ferias/actions.ts`, substituir o corpo das três. O padrão é o de `src/modules/rh/decimo-terceiro/actions.ts`: `supabase.rpc(...)` e `mensagemDeNegocio` devolvendo `error.message` só no SQLSTATE `P0001`, que é o que faz a recusa do banco chegar legível ao usuário.

```ts
const { error } = await supabase.rpc("fn_criar_ferias", {
  p_colaborador: validado.data.colaboradorId,
  p_aquisitivo_inicio: validado.data.periodoAquisitivoInicio,
  p_aquisitivo_fim: validado.data.periodoAquisitivoFim,
  p_data_inicio: validado.data.dataInicio ?? undefined,
  p_data_fim: validado.data.dataFim ?? undefined,
  p_dias: validado.data.dias,
  p_status: validado.data.status,
  p_observacao: validado.data.observacao ?? undefined,
});
```

`?? undefined` OMITE o parâmetro e deixa valer o DEFAULT do banco: "não informado" é estado legítimo para as datas de gozo.

- [ ] **Step 5: Regenerar os tipos, cirurgicamente**

**NÃO sobrescrever `src/lib/database.types.ts`.** O CLI a partir do `supabase@2.117` parou de escrever ponto e vírgula, e trocar o arquivo muda 83% das linhas, levando junto comentários escritos à mão. O jeito:

```bash
npx supabase gen types typescript --project-id vsesgvqjgqpapoxhnbqx > /tmp/t.ts
npx prettier --write /tmp/t.ts
```

Depois extrair do `/tmp/t.ts` só os blocos das funções novas (`      <nome>: {` com 6 espaços, contando chaves até fechar; função de assinatura curta sai **numa linha só**) e inseri-los em ordem alfabética em `Functions: {`. Conferir com `git diff --stat src/lib/database.types.ts`: tem que ser **só inserção**.

- [ ] **Step 6: Typecheck e testes**

```bash
npx tsc --noEmit
npx vitest run src/modules/rh/ferias
```

Esperado: zero erro; testes de férias passando.

- [ ] **Step 7: Commit**

```bash
git add supabase/migrations/20260917*_ferias_cadastro_por_rpc.sql src/modules/rh/ferias/actions.ts src/lib/database.types.ts
git commit -m "refactor(rh): cadastro de férias passa a escrever por RPC"
```

---

### Task 5: Schemas, mensagem e queries

**Files:**
- Create: `src/modules/rh/ferias/recibo-schemas.ts`, `recibo-schemas.test.ts`
- Create: `src/modules/rh/ferias/mensagem-aprovacao.ts`, `mensagem-aprovacao.test.ts`
- Create: `src/modules/rh/ferias/recibo-queries.ts`

**Interfaces:**
- Produces: `lancarFeriasSchema`, `editarReciboSchema`, `definirVencimentoReciboSchema`, `motivoReciboSchema`, `STATUS_RECIBO`, `ROTULO_STATUS_RECIBO`; `mensagemDeAprovacao(recibo, origem): string`; `buscarRecibo(id)`, `ReciboDetalhe`.

- [ ] **Step 1: Escrever o teste dos schemas primeiro**

`recibo-schemas.test.ts`:

```ts
import { describe, expect, it } from "vitest";

import {
  editarReciboSchema,
  lancarFeriasSchema,
} from "@/modules/rh/ferias/recibo-schemas";

const ID = "3f2504e0-4f89-11d3-9a0c-0305e82c3301";

function lancar(over: Record<string, unknown> = {}) {
  return lancarFeriasSchema.safeParse({
    colaboradorId: ID,
    periodoAquisitivoInicio: "2025-01-01",
    periodoAquisitivoFim: "2025-12-31",
    dataInicio: "2026-03-02",
    dataFim: "2026-03-31",
    dias: 30,
    status: "programada",
    bruto: "1000",
    inss: "",
    irrf: "",
    ...over,
  });
}

describe("lancarFeriasSchema", () => {
  it("aceita o caso completo", () => {
    const r = lancar();
    expect(r.success).toBe(true);
    if (r.success) expect(r.data.bruto).toBe(1000);
  });

  it("campo de desconto em branco vale zero", () => {
    const r = lancar();
    expect(r.success).toBe(true);
    if (r.success) {
      expect(r.data.inss).toBe(0);
      expect(r.data.irrf).toBe(0);
    }
  });

  it("recusa dias zero ou negativo: não dá para pagar férias de zero dia", () => {
    expect(lancar({ dias: 0 }).success).toBe(false);
    expect(lancar({ dias: -1 }).success).toBe(false);
  });

  it("recusa fim do gozo antes do início", () => {
    expect(lancar({ dataInicio: "2026-03-31", dataFim: "2026-03-02" }).success).toBe(false);
  });

  it("recusa fim do aquisitivo antes do início", () => {
    expect(
      lancar({ periodoAquisitivoInicio: "2025-12-31", periodoAquisitivoFim: "2025-01-01" })
        .success,
    ).toBe(false);
  });

  it("recusa desconto que passa do bruto", () => {
    expect(lancar({ bruto: "100", inss: "90", irrf: "90" }).success).toBe(false);
  });

  it("lê dinheiro em pt-BR", () => {
    const r = lancar({ bruto: "1.234,56" });
    expect(r.success).toBe(true);
    if (r.success) expect(r.data.bruto).toBe(1234.56);
  });

  it("recusa o ponto como decimal, que viraria mil vezes o valor", () => {
    expect(lancar({ bruto: "1.5" }).success).toBe(false);
  });

  it("recusa status de gozo fora do catálogo", () => {
    expect(lancar({ status: "ferias" }).success).toBe(false);
  });
});

describe("editarReciboSchema", () => {
  it("aceita bruto zero: é assim que o recibo volta a não ser pago", () => {
    const r = editarReciboSchema.safeParse({
      feriasId: ID, bruto: "0", inss: "", irrf: "",
    });
    expect(r.success).toBe(true);
  });

  it("recusa desconto maior que o bruto", () => {
    const r = editarReciboSchema.safeParse({
      feriasId: ID, bruto: "100", inss: "60", irrf: "60",
    });
    expect(r.success).toBe(false);
  });
});
```

- [ ] **Step 2: Rodar e ver falhar**

```bash
npx vitest run src/modules/rh/ferias/recibo-schemas.test.ts
```

Esperado: FAIL, `Failed to resolve import "@/modules/rh/ferias/recibo-schemas"`.

- [ ] **Step 3: Escrever `recibo-schemas.ts`**

Copiar o `dinheiroSchema` e o `dinheiroOpcionalSchema` de `src/modules/rh/decimo-terceiro/schemas.ts` (usam `paraNumero` de `@/modules/rh/percentual`, que lê pt-BR e devolve NaN em agrupamento inválido — **não** usar o de `rh/parametros-folha`, que tem o furo do ponto).

Acrescentar os `refine` de coerência: `dias > 0`, `dataFim >= dataInicio`, `aquisitivoFim >= aquisitivoInicio`, `inss + irrf <= bruto`.

Levar também um **schema de FORMULÁRIO separado** (tudo string, sem transform) mais o conversor `lancarFeriasFormParaInput`, como em `decimo-terceiro/schemas.ts`: o schema de servidor transforma, e transform faz o tipo de entrada diferir do de saída, o que quebra a tipagem do React Hook Form.

- [ ] **Step 4: Rodar e ver passar**

Esperado: 11 passed.

- [ ] **Step 5: Quebrar de propósito**

Trocar `dados.inss + dados.irrf <= dados.bruto` por `true` e rodar: o teste de desconto tem que cair nos dois describes. Desfazer.

Teste que sobrevive à mutação não está provando nada.

- [ ] **Step 6: Escrever a mensagem de aprovação, teste primeiro**

`mensagem-aprovacao.test.ts`, no molde de `src/modules/rh/decimo-terceiro/mensagem-aprovacao.test.ts`. O texto:

```
Recibo de férias de ANDREIA ALENCAR pronto para aprovação.

30 dias, de 02/03/2026 a 31/03/2026
Líquido a pagar: R$ 900,00
Vence em 28/02/2026

Aprovar: https://.../rh/decimo-terceiro-e-ferias/ferias/<id>
```

Casos a cobrir: a primeira linha nomeia a pessoa; o link tem o id; origem terminada em barra não vira barra dupla; o líquido sai pelo `formatarBRL` (asserido pelo formatador, nunca por string literal: o separador do pt-BR não é espaço comum); sem `dataVencimento` a linha "Vence em" some; "1 dia" no singular.

- [ ] **Step 7: Escrever `recibo-queries.ts`**

`import "server-only"` na primeira linha. `buscarRecibo(id)` devolve `ReciboDetalhe | null`.

**O embed de quem aprovou leva hint obrigatório**, porque a Task 1 criou a segunda FK para `usuarios`:

```ts
.select(
  `id, colaborador_id, periodo_aquisitivo_inicio, periodo_aquisitivo_fim,
   data_inicio, data_fim, dias, status, observacao,
   status_recibo, valor_bruto, valor_inss, valor_irrf, valor_liquido,
   data_vencimento, centro_custo_id, lancamento_id, aprovado_em, motivo_rejeicao,
   colaboradores(nome, vinculo, salario, data_admissao),
   centros_custo(nome, codigo),
   usuarios!rh_ferias_aprovado_por_fkey(nome)`,
)
```

Sem o hint, HTTP 300 / PGRST201 e a tela quebra — e isso passa no `tsc`, no lint e no build.

Acrescentar também à `listarFerias` de `queries.ts` os campos `status_recibo` e `valor_liquido`, para a coluna Recibo da tabela.

- [ ] **Step 8: Typecheck e commit**

```bash
npx tsc --noEmit
git add src/modules/rh/ferias/recibo-schemas.ts src/modules/rh/ferias/recibo-schemas.test.ts src/modules/rh/ferias/mensagem-aprovacao.ts src/modules/rh/ferias/mensagem-aprovacao.test.ts src/modules/rh/ferias/recibo-queries.ts src/modules/rh/ferias/queries.ts
git commit -m "feat(rh): schemas, mensagem e queries do recibo de férias"
```

---

### Task 6: Actions do recibo

**Files:**
- Create: `src/modules/rh/ferias/recibo-actions.ts`
- Modify: `src/lib/database.types.ts`

**Interfaces:**
- Produces: `lancarFerias`, `editarRecibo`, `definirVencimentoRecibo`, `enviarReciboParaAprovacao`, `voltarReciboParaRascunho`, `aprovarRecibo`, `rejeitarRecibo`, `desaprovarRecibo`.

- [ ] **Step 1: Escrever o arquivo**

Molde exato: `src/modules/rh/decimo-terceiro/actions.ts`. Copiar `mensagemDeNegocio`, `checarPermissao` e `revalidarTelas` de lá, trocando a rota dinâmica:

```ts
const RECURSO = "rh.decimo-terceiro-ferias" as const;
const ROTA = "/rh/decimo-terceiro-e-ferias";

function revalidarTelas(...extras: string[]): void {
  try {
    revalidatePath(ROTA);
    // Rota dinâmica precisa do segundo argumento "page": sem ele a tela do
    // recibo continuaria mostrando o valor anterior depois de editar.
    revalidatePath(`${ROTA}/ferias/[id]`, "page");
    for (const caminho of extras) revalidatePath(caminho);
  } catch (erro) {
    // A revalidação roda DEPOIS de a RPC commitar. Se estourar, o dinheiro já
    // está gravado, e devolver erro faria o usuário clicar de novo num recibo
    // já aprovado.
    logErroServidor("rh.ferias.revalidar", erro);
  }
}
```

`aprovarRecibo` e `desaprovarRecibo` revalidam também `/financeiro/lancamentos` e `/financeiro/pagamentos`.

- [ ] **Step 2: Regenerar os tipos, cirurgicamente**

Mesmo procedimento da Task 4 Step 5: gerar para `/tmp`, prettier, extrair **só** os blocos das RPCs novas, inserir em ordem alfabética. `git diff --stat` tem que mostrar só inserção.

Atenção ao parâmetro anulável: `fn_definir_vencimento_ferias(p_ferias uuid, p_data date)` — o gerador escreve `p_data: string` porque o parâmetro não tem DEFAULT e ele não sabe que **null é valor legítimo** (null apaga a data). Editar à mão para `p_data: string | null`, com o comentário de que regerar apaga de novo. Há precedente no arquivo: `fn_definir_vencimento_folha` e `fn_definir_vencimento_decimo_terceiro`.

- [ ] **Step 3: Typecheck**

```bash
npx tsc --noEmit
```

Esperado: zero erro. Se a RPC reclamar de argumento, a assinatura do banco diverge do que a action manda: conferir com `pg_get_function_identity_arguments` e acertar a action, não o banco.

- [ ] **Step 4: Commit**

```bash
git add src/modules/rh/ferias/recibo-actions.ts src/lib/database.types.ts
git commit -m "feat(rh): actions do recibo de férias"
```

---

### Task 7: As telas

**Files:**
- Create: `src/modules/rh/ferias/components/lancar-ferias-drawer.tsx`
- Create: `src/modules/rh/ferias/components/editar-recibo-drawer.tsx`
- Create: `src/modules/rh/ferias/components/vencimento-recibo.tsx`
- Create: `src/modules/rh/ferias/components/recibo-detalhe.tsx`
- Create: `src/app/(app)/rh/decimo-terceiro-e-ferias/ferias/[id]/page.tsx`
- Modify: `src/modules/rh/ferias/components/ferias-tabela.tsx`
- Modify: `src/modules/rh/ferias/components/ferias-acoes-cabecalho.tsx`

- [ ] **Step 0: Componentes canônicos primeiro**

A regra 9 do `CLAUDE.md`: `DataTable`, `FormDrawer`, `ApprovalBar`, `KPICard`, `MoneyText`, `EmptyState`, `StatusBadge`, `SecaoDetalhe` e `ConfirmDialog` já existem em `src/components/canonicos/`. Se um não cobrir, evoluir o canônico, nunca duplicar.

Três detalhes do design system: valor sai em `MoneyText` com `tabular-nums`; o verde de "aprovado" do `StatusBadge` **não** é o verde da marca; barra de ação com `flex-wrap` e **sem** `sm:flex-nowrap` (a faixa de 640 a 816px abre buraco).

- [ ] **Step 1: "Lançar férias" no cabeçalho da seção**

`ferias-acoes-cabecalho.tsx` passa a ter **dois** botões: o "Nova férias" que já existe (programa sem pagar) e o novo **"Lançar férias"**, que abre `lancar-ferias-drawer.tsx`.

O drawer tem: colaborador (Combobox), período aquisitivo, datas de gozo, dias, status de gozo (Combobox, sugerindo "Programada"), e bruto, INSS e IRRF. Ao escolher o colaborador, mostrar em cinza salário, vínculo e data de admissão — **contexto, nunca base de conta**.

Prévia do líquido enquanto digita, que é a mesma subtração que o banco faz.

`.default("")` **não pode aparecer** no schema do formulário: quebra o RHF porque o tipo de entrada deixa de bater com o de saída. Usar `defaultValues` no `useForm`.

- [ ] **Step 2: Coluna Recibo na tabela de férias**

Em `ferias-tabela.tsx`, acrescentar a coluna: "sem recibo" quando `status_recibo = 'sem_recibo'`, o `StatusBadge` quando rascunho ou pendente, e o `MoneyText` do líquido quando aprovado.

Clicar numa linha COM recibo navega para `/rh/decimo-terceiro-e-ferias/ferias/<id>`. Linha sem recibo segue abrindo o drawer de edição de cadastro, como hoje.

- [ ] **Step 3: O detalhe do recibo**

`recibo-detalhe.tsx`, no molde de `src/modules/rh/decimo-terceiro/components/lote-detalhe.tsx`:

- KPIs: líquido, bruto, descontos.
- `VencimentoRecibo` **antes** da `ApprovalBar`: quem vai aprovar precisa ver a data antes de bater o martelo. Editável só em rascunho, com ajuste de estado **durante o render** (não em efeito — o lint recusa `setState` em efeito).
- `ApprovalBar` com `acoesExtras`: em rascunho, "Enviar para aprovação"; em pendente, "Copiar pedido" e "Voltar para rascunho".
- "Copiar pedido" usa `mensagemDeAprovacao` e avisa se a área de transferência falhar.
- Toda ação de fluxo dentro de `comAvisoDeFalha`, e todo `router.refresh()` dentro de `semDerrubarSucesso`.

- [ ] **Step 4: A página do detalhe**

`page.tsx` com checagem de permissão, `notFound()` quando o recibo não existe, e o cabeçalho mostrando "Aprovado em X por Y" quando aprovado.

```tsx
/**
 * A action de aprovar roda NESTA função. Ela escreve lançamento, parcela,
 * rateio e até duas guias numa transação. Sem maxDuration a rota morre no teto
 * padrão e o recibo fica meio gravado.
 */
export const maxDuration = 60;
```

- [ ] **Step 5: Typecheck e build**

```bash
npx tsc --noEmit
```

`next build` não roda nesta máquina; é o CI que verifica. Rodar a suíte:

```bash
npx vitest run
```

O teste `use-client-no-topo.test.ts` vai varrer os arquivos novos: `"use client"` tem que ser a primeira linha de cada um.

- [ ] **Step 6: Commit**

```bash
git add src/modules/rh/ferias/components/ "src/app/(app)/rh/decimo-terceiro-e-ferias/ferias"
git commit -m "feat(rh): telas do recibo de férias"
```

---

### Task 8: maxDuration guardado, suíte e PR

**Files:**
- Create: `src/app/(app)/rh/decimo-terceiro-e-ferias/ferias/maxduration.test.ts`

- [ ] **Step 1: Escrever o teste guarda primeiro**

```ts
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

/**
 * A aprovação do recibo roda na função da PÁGINA. Ela escreve lançamento,
 * parcela, rateio e até duas guias numa transação. Sem maxDuration a rota morre
 * no teto padrão e o recibo fica meio gravado, com quem clicou sem saber se
 * aprovou. Este teste é a guarda: quem apagar a linha vê o teste cair.
 */
describe("maxDuration da rota do recibo de férias", () => {
  const caminho = join(
    process.cwd(),
    "src/app/(app)/rh/decimo-terceiro-e-ferias/ferias/[id]/page.tsx",
  );

  it("a página do detalhe declara maxDuration de pelo menos 60s", () => {
    const fonte = readFileSync(caminho, "utf8");
    const achado = /export\s+const\s+maxDuration\s*=\s*(\d+)/.exec(fonte);

    expect(achado, "a rota não declara maxDuration").not.toBeNull();
    expect(Number(achado?.[1])).toBeGreaterThanOrEqual(60);
  });
});
```

- [ ] **Step 2: Rodar e ver falhar, depois passar**

Se a Task 7 já declarou o `maxDuration`, comentar a linha, ver o teste cair, e descomentar. Teste que nunca foi visto falhando não é guarda.

- [ ] **Step 3: Suíte inteira e typecheck**

```bash
npx tsc --noEmit
npx vitest run
```

**Ler a linha `Test Files` / `Tests` e comparar com o baseline**, não confiar no exit code: a suíte já saiu com exit 0 tendo 458 falhas. Os dois arquivos `__repro*` de outra sessão falham e **não são nossos** — rodar `npx vitest run --exclude "**/__repro*"` para a contagem limpa, e dizer isso no relato.

- [ ] **Step 4: Conferir o commit ANTES de fazê-lo**

```bash
git status --short
```

Ler a saída **inteira, sem filtro**. Os `__repro*` têm que aparecer como `??` e ficar de fora. Adicionar por caminho explícito, nunca `git add -A`.

- [ ] **Step 5: Commit, push e PR**

```bash
git push -u origin recibo-ferias
gh pr create --title "feat(rh): recibo de férias (Bloco 8d)" --body-file /tmp/pr-ferias.md
```

O corpo do PR traz: o que faz; que o app **não calcula**; as travas; a saída das duas partes da prova; o teste do embed com curl (300 sem hint, 401 com hint); a tabela de verificação dizendo que `eslint` e `next build` **não foram verificados localmente**; e a **Task 9 como pendência explícita**, para o revisor saber que o fechamento dos grants não foi aplicado.

Esperar o CI verde antes de mergear. Check verde prova que buildou, não que a tela abre: o preview deste projeto dá 500, então a conferência de tela é na produção depois do merge.

---

### Task 9: A migration que FECHA os grants — NÃO APLICAR NESTA ENTREGA

**Files:**
- Create: `supabase/migrations/_PENDENTE_20260917_ferias_fecha_grants.sql`

**Esta task escreve um arquivo e NÃO o aplica.** O prefixo `_PENDENTE_` é o sinal.

- [ ] **Step 1: Entender por que ela é separada**

Em 27/08/2026 uma migration deste projeto revogou acesso que o código em `main` ainda usava, e **quatro telas caíram para todo mundo, inclusive Admin**. Outra frente teve que aplicar migration de emergência.

Aqui migration vai direto para o banco de **produção**: não há branch de banco. Então revogar não é "preparar o terreno", é quebrar na hora o código que está no ar. A ordem que funciona:

1. subir o código que para de usar o acesso (Tasks 4 a 8);
2. **confirmar o deploy em produção**;
3. só então aplicar esta.

- [ ] **Step 2: Escrever o arquivo, com o checklist no cabeçalho**

```sql
-- ===================================================================
-- NAO APLICAR JUNTO COM O PR DO BLOCO 8d.
-- ===================================================================
--
-- Esta migration FECHA privilegio: tira INSERT/UPDATE/DELETE de
-- `authenticated` em rh_ferias e derruba as policies de escrita.
--
-- Aplicar so DEPOIS de confirmar em producao que:
--
--   [ ] o deploy do 8d subiu (conferir o sha em
--       `gh api repos/:owner/:repo/deployments`);
--   [ ] `grep -rn "from(\"rh_ferias\")" src` nao devolve NENHUM
--       `.insert(`, `.update(` ou `.delete(` — so `.select(`;
--   [ ] a tela de ferias abre, cria, edita e exclui em producao;
--   [ ] o recibo lanca, edita, envia, aprova e desaprova em producao.
--
-- Com qualquer item aberto, NAO aplicar: em 27/08/2026 um revoke assim
-- derrubou quatro telas para todos os usuarios, inclusive Admin.
--
-- Depois de aplicar, conferir que a forma ficou igual a de
-- rh_decimo_terceiro: `authenticated` so com SELECT, `anon` sem nada.

revoke insert, update, delete on public.rh_ferias from authenticated;

drop policy if exists "rh_ferias_insert" on public.rh_ferias;
drop policy if exists "rh_ferias_update" on public.rh_ferias;
drop policy if exists "rh_ferias_delete" on public.rh_ferias;

-- Conferencia, dentro da propria migration: se sobrou privilegio de escrita,
-- estoura e desfaz em vez de deixar meio fechado.
do $$
declare v_extra text;
begin
  select string_agg(privilege_type, ',') into v_extra
    from information_schema.role_table_grants
   where table_schema = 'public' and table_name = 'rh_ferias'
     and grantee = 'authenticated' and privilege_type <> 'SELECT';
  if v_extra is not null then
    raise exception 'Sobrou privilegio de escrita em rh_ferias: %', v_extra;
  end if;
end $$;
```

- [ ] **Step 3: Commit do arquivo, sem aplicar**

```bash
git add supabase/migrations/_PENDENTE_20260917_ferias_fecha_grants.sql
git commit -m "chore(rh): migration que fecha os grants de rh_ferias (pendente de deploy)"
```

- [ ] **Step 4: Avisar o Tiago no relato final**

Dizer, com todas as letras, que **enquanto esta migration não for aplicada, um usuário autenticado consegue alterar `valor_bruto` de um recibo direto pelo PostgREST**, sem passar pela trava de status. O risco é baixo (só usuários do sistema, e há auditoria), mas é real e ele precisa saber que existe uma segunda etapa.

---

## Depois do merge

1. Rodar `supabase/provas/recibo_ferias.sql` uma vez contra produção e confirmar as duas partes.
2. Fazer o checklist da Task 9 e aplicar a migration que fecha.
3. Observar por um mês: se ninguém lançar férias pela tela, o problema não é a tela. É que o controle de férias não é feito no app, e aí o certo é parar, não acrescentar campo. Está escrito como Risco 1 na spec.
