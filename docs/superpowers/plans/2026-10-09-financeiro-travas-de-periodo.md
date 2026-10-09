# Financeiro PR 1: travas de período — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Nada muda o saldo de um mês conciliado fechado sem reabrir o mês; mudar saldo inicial exige motivo; o painel acusa desvio depois do fechamento.

**Architecture:** Uma função SQL nova (`fn_conciliacao_exigir_data_aberta`) com a regra "conta (ou conta pai) + data ≤ último mês fechado → recusa", chamada nas RPCs que mexem em saldo. Saldo inicial passa a ser gravado só por RPC com motivo (o trigger recusa sem o `app.motivo_saldo_inicial`). Uma função de leitura (`fn_conciliacao_desvios`) compara o saldo gravado no fechamento com o recalculado.

**Tech Stack:** Supabase Postgres (plpgsql, SECURITY DEFINER, `search_path ''`), Next.js 16 server actions, zod, Vitest.

**Spec:** `docs/superpowers/specs/2026-10-09-financeiro-controle-total-design.md` (frente A, decisões D1 e D2).

## Global Constraints
- Migrations em `supabase/migrations/<version>_<nome>.sql`; aplicar pelo MCP `apply_migration` e gravar o MESMO SQL no arquivo com o version real (`list_migrations`).
- Ensaiar no projeto vivo com `npx supabase db query --linked -f` em `begin; ... rollback;`; IF com CASE no plpgsql precisa de parênteses.
- Prova de permissão precisa de `set local role authenticated` + `request.jwt.claims`; owner passa por cima de tudo.
- Funções: `SECURITY DEFINER`, `SET search_path TO ''`, nomes qualificados `public.`.
- Ids no TS com `idSchema`/`idSchemaCom`, nunca `z.uuid()`.
- Mensagens de erro em português, sem acento no SQL (padrão das funções vizinhas).
- Rodar tsc/eslint/vitest/build numa cópia em `$CLAUDE_JOB_DIR/tmp` com `npm ci` (iCloud).

## Review Focus
- Subconta de investimento sem fechamento próprio: a trava tem que olhar a conta pai (o #419 tirou a subconta do fechamento).
- Editar transferência movendo a data de um mês aberto PARA um fechado (ou de fechado para aberto): checar data/conta antigas E novas.
- Mês fechado e depois reaberto (`reaberto_em` preenchido) não trava; reabrir agosto com setembro fechado continua travado por setembro (mensagem nomeia setembro).
- Carga/migração sem usuário (`auth.uid()` nulo) continua passando no trigger do saldo inicial, como hoje.
- Desvio: mês fechado sem `saldo_app` gravado (fechamentos antigos) não pode aparecer como desvio falso.

---

### Task 1: Trava por data nas RPCs de saldo

**Files:**
- Create: `supabase/migrations/<version>_financeiro_trava_data_conciliada.sql`
- Create: `supabase/provas/trava_data_conciliada.sql`

**Interfaces:**
- Produces: `public.fn_conciliacao_exigir_data_aberta(p_conta_id uuid, p_data date) returns void` — raise `'Conta % esta conciliada ate %/%. Reabra esse mes na Conciliacao para mudar.'`.

- [ ] **Step 1: Prova que falha.** `supabase/provas/trava_data_conciliada.sql`: dentro de `do $prova$ ... $prova$`, como Admin (`set local role authenticated`, claims do Tiago `c66fca9f-5428-4fb9-855f-dcff548764df`), pegar a BB 102.124-9 (fechada em 2026-09), criar transferência para a BB 30.893-5 com data 2026-09-15 por `fn_salvar_transferencia` e esperar exceção contendo 'conciliada'; repetir com data 2026-08-10 (antes do último fechado) esperando exceção; com data 2026-10-05 esperar sucesso. Pagar uma parcela aprovada com `fn_pagar_parcela(..., data 2026-09-20)` esperando exceção. Terminar com `raise exception 'PROVA OK'`. Rodar `begin; \i prova; rollback;` via `npx supabase db query --linked -f`. Esperado agora: falha porque a transferência de setembro passa.
- [ ] **Step 2: Migration.**

```sql
create or replace function public.fn_conciliacao_exigir_data_aberta(p_conta_id uuid, p_data date)
 returns void language plpgsql stable security definer set search_path to ''
as $function$
declare
  v_conta uuid; v_mes date; v_nome text;
  v_meses text[] := array['janeiro','fevereiro','marco','abril','maio','junho','julho','agosto','setembro','outubro','novembro','dezembro'];
begin
  if p_conta_id is null or p_data is null then return; end if;
  -- Subconta de investimento nao fecha sozinha: vale o fechamento da conta pai.
  select coalesce(c.conta_pai_id, c.id), c.nome into v_conta, v_nome
    from public.contas_bancarias c where c.id = p_conta_id;
  select max(f.mes) into v_mes from public.conciliacao_fechamentos f
   where f.conta_bancaria_id in (p_conta_id, v_conta) and f.reaberto_em is null;
  if v_mes is not null and p_data < (v_mes + interval '1 month')::date then
    raise exception 'Conta % esta conciliada ate %/%. Reabra esse mes na Conciliacao para mudar.',
      coalesce(v_nome, '-'), v_meses[extract(month from v_mes)::int], extract(year from v_mes)::int;
  end if;
end $function$;
```

Depois, no mesmo arquivo, `create or replace` das funções abaixo a partir do `pg_get_functiondef` VIVO de cada uma (copiar inteiro, só inserir as linhas):
  - `fn_pagar_parcela`: logo após validar `p_conta_id`/`p_data_pagamento`, `perform public.fn_conciliacao_exigir_data_aberta(p_conta_id, p_data_pagamento);`
  - `fn_estornar_pagamento`: trocar o bloco `perform public.fn_conciliacao_exigir_mes_aberto(...) ... and exists (...)` por `perform public.fn_conciliacao_exigir_data_aberta(p.conta_bancaria_id, p.data_pagamento) from public.lancamento_parcelas p where p.id = p_parcela_id and p.status = 'pago';` (vale para todo pagamento, conciliado ou não).
  - `fn_salvar_transferencia`: antes do insert/update, `perform public.fn_conciliacao_exigir_data_aberta(p_conta_origem_id, p_data); perform public.fn_conciliacao_exigir_data_aberta(p_conta_destino_id, p_data);` e, quando `p_id` não é nulo, também para `conta_origem_id`, `conta_destino_id` e `data_transferencia` antigos (`select ... from public.transferencias_contas where id = p_id`).
  - `fn_excluir_transferencia`: após achar `v_dados`, as duas checagens com conta/data da transferência, e `if exists (select 1 from public.extrato_transacoes t where t.transferencia_id = p_id) then raise exception 'Nao da para excluir: esta transferencia esta conciliada. Desfaca a conciliacao primeiro'; end if;`
  - `fn_salvar_posicao_aplicacao`: `perform public.fn_conciliacao_exigir_data_aberta(<subconta da aplicacao>, p_data);` (subconta = `aplicacoes.conta_bancaria_id`).
- [ ] **Step 3: Ensaiar** `begin; <migration>; <prova>; rollback;` pelo CLI. Esperado: `PROVA OK`.
- [ ] **Step 4: Aplicar** pelo MCP `apply_migration`, conferir version em `list_migrations`, gravar o arquivo com esse version.
- [ ] **Step 5: Commit** `git add supabase/migrations supabase/provas && git commit -m "Financeiro: trava por data nas RPCs que mexem no saldo de mes conciliado"`.

### Task 2: Saldo inicial só com motivo

**Files:**
- Create: `supabase/migrations/<version>_saldo_inicial_com_motivo.sql`
- Create: `supabase/provas/saldo_inicial_com_motivo.sql`
- Modify: `src/modules/financeiro/contas-bancarias/schemas.ts` (campo `motivoSaldoInicial`)
- Modify: `src/modules/financeiro/contas-bancarias/actions.ts` (editarConta e salvarSaldoInicialSubconta)
- Modify: `src/modules/financeiro/contas-bancarias/components/contas-form-drawer.tsx`, `saldo-inicial-subconta-drawer.tsx`
- Test: `src/modules/financeiro/contas-bancarias/schemas.test.ts` (criar se não existir)

**Interfaces:**
- Produces: `public.fn_alterar_saldo_inicial(p_conta uuid, p_saldo numeric, p_data date, p_motivo text) returns void`; `fn_salvar_saldo_inicial_subconta` ganha `p_motivo text` (drop da assinatura antiga + create com o parâmetro novo); tabela `public.contas_saldo_inicial_eventos(id uuid pk default gen_random_uuid(), conta_bancaria_id uuid not null references contas_bancarias, saldo_antes numeric(14,2), saldo_depois numeric(14,2), data_antes date, data_depois date, motivo text not null, alterado_por uuid, alterado_em timestamptz default now())` com RLS de SELECT para quem `fn_pode_ver_saldo(conta_bancaria_id)`.

- [ ] **Step 1: Prova que falha.** Como Admin: `update contas_bancarias set saldo_inicial = saldo_inicial + 1 where nome = 'CAIXINHA DE DINHEIRO'` deve dar exceção 'Informe o motivo' (hoje passa). `fn_alterar_saldo_inicial(<caixinha>, x, d, 'teste')` deve passar e gravar 1 evento. Na BB 102.124-9 (tem fechamento) `fn_alterar_saldo_inicial(..., 'teste')` deve dar exceção 'conciliado'. Sem `auth.uid()` (owner, sem claims) o update direto passa.
- [ ] **Step 2: Migration.** `fn_trava_saldo_inicial` vira:

```sql
create or replace function public.fn_trava_saldo_inicial()
 returns trigger language plpgsql security definer set search_path to ''
as $function$
declare v_motivo text := nullif(btrim(coalesce(current_setting('app.motivo_saldo_inicial', true), '')), '');
begin
  if (select auth.uid()) is null then return new; end if;
  if new.saldo_inicial is distinct from old.saldo_inicial
     or new.saldo_inicial_data is distinct from old.saldo_inicial_data then
    if not public.fn_pode_ver_saldo(old.id) then
      raise exception 'Sem permissao para alterar o saldo inicial desta conta';
    end if;
    if v_motivo is null then
      raise exception 'Informe o motivo da mudanca do saldo inicial';
    end if;
    if exists (select 1 from public.conciliacao_fechamentos f
               where f.conta_bancaria_id in (old.id, coalesce(old.conta_pai_id, old.id))
                 and f.reaberto_em is null) then
      raise exception 'Esta conta tem mes conciliado fechado: o saldo inicial nao muda. Reabra os meses na Conciliacao.';
    end if;
    insert into public.contas_saldo_inicial_eventos
      (conta_bancaria_id, saldo_antes, saldo_depois, data_antes, data_depois, motivo, alterado_por)
    values (old.id, old.saldo_inicial, new.saldo_inicial, old.saldo_inicial_data, new.saldo_inicial_data, v_motivo, (select auth.uid()));
  end if;
  return new;
end $function$;

create or replace function public.fn_alterar_saldo_inicial(p_conta uuid, p_saldo numeric, p_data date, p_motivo text)
 returns void language plpgsql security definer set search_path to ''
as $function$
begin
  if not public.tem_permissao('financeiro.contas-bancarias', 'editar') then
    raise exception 'Sem permissao para editar contas bancarias';
  end if;
  perform set_config('app.motivo_saldo_inicial', coalesce(p_motivo, ''), true);
  update public.contas_bancarias set saldo_inicial = round(p_saldo, 2), saldo_inicial_data = p_data where id = p_conta;
  if not found then raise exception 'Conta nao encontrada'; end if;
end $function$;
```

(Confirmar o nome do recurso de permissão em `src/modules/financeiro/contas-bancarias/actions.ts` `RECURSO` antes de gravar.) `fn_salvar_saldo_inicial_subconta`: copiar o def vivo, acrescentar `p_motivo text`, `perform set_config('app.motivo_saldo_inicial', coalesce(p_motivo,''), true);` no começo; `grant execute ... to authenticated` nas duas.
- [ ] **Step 3: Teste do schema que falha** (`schemas.test.ts`): `contaFormSchema` com `saldoInicial` alterado e `motivoSaldoInicial: ""` → `contaSchema` de edição deve recusar quando `saldoMudou=true`. Implementação: `contaSchema` ganha `motivoSaldoInicial: z.string().trim().max(500).optional()`; a regra "obrigatório quando mudou" fica na action (que sabe o valor antigo) — então o teste é da função pura `exigeMotivoSaldo(antes, depois)` em `schemas.ts`:

```ts
export function saldoInicialMudou(
  antes: { saldoInicial: number | null; saldoInicialData: string | null },
  depois: { saldoInicial: number | null; saldoInicialData: string | null },
): boolean {
  return antes.saldoInicial !== depois.saldoInicial || (antes.saldoInicialData ?? null) !== (depois.saldoInicialData ?? null);
}
```

Testes: igual → false; centavo diferente → true; data de null para '2025-01-01' → true.
- [ ] **Step 4: Action.** Em `editarConta`: ler `saldo_inicial, saldo_inicial_data` atuais; sempre remover os dois do `registro` do update; se `saldoInicialMudou` e pode ver saldo: sem motivo → `{ erro: "Informe o motivo da mudança do saldo inicial" }`; com motivo → `supabase.rpc("fn_alterar_saldo_inicial", { p_conta, p_saldo, p_data, p_motivo })`, erro via `erroAcao`. Em `criarConta` nada muda (insert não passa pelo trigger de update). `salvarSaldoInicialSubconta` passa `p_motivo` (schema `saldoInicialSubcontaSchema` ganha `motivo: z.string().trim().min(3, { error: "Informe o motivo" })`).
- [ ] **Step 5: Tela.** `contas-form-drawer.tsx`: com `form.watch` de saldo e data, se diferirem dos iniciais, mostrar `Textarea` "Motivo da mudança do saldo inicial" (obrigatório) e mandar `motivoSaldoInicial`. `saldo-inicial-subconta-drawer.tsx`: campo motivo obrigatório.
- [ ] **Step 6:** `npx vitest run src/modules/financeiro/contas-bancarias` PASS; ensaio SQL `PROVA OK`; aplicar migration pelo MCP e versionar; `npm run gen:types` (ou atualizar `src/lib/database.types.ts` com as assinaturas novas) para o tsc.
- [ ] **Step 7: Commit** `"Financeiro: saldo inicial so muda com motivo e nunca com mes conciliado"`.

### Task 3: Desvio depois do fechamento

**Files:**
- Create: `supabase/migrations/<version>_conciliacao_desvios.sql`
- Modify: `src/modules/financeiro/conciliacao/queries.ts` (nova `listarDesvios`)
- Modify: `src/modules/financeiro/conciliacao/components/conciliacao-cliente.tsx` (aviso)
- Modify: a page de conciliação que monta as props (`src/app/(app)/financeiro/conciliacao/page.tsx`)
- Test: `src/modules/financeiro/conciliacao/painel.test.ts` (função pura `textoDesvio`)

**Interfaces:**
- Produces: `public.fn_conciliacao_desvios(p_conta_id uuid) returns table(mes date, saldo_fechamento numeric, saldo_agora numeric, diferenca numeric)` — só fechamentos ativos com `saldo_app is not null` e `diferenca <> 0`, usando `fn_conciliacao_saldo_app_interno(conta, último dia do mês)`. TS: `listarDesvios(contaId: string): Promise<{ mes: string; saldoFechamento: number; saldoAgora: number; diferenca: number }[]>`; `textoDesvio(d): string` → `"Setembro/2026 mudou R$ 1.234,56 depois do fechamento"`.

- [ ] **Step 1: Teste que falha** de `textoDesvio` (sinal negativo e positivo, mês por extenso com maiúscula).
- [ ] **Step 2:** implementar `textoDesvio` em `painel.ts` com `formatarBRL` de `@/lib/formatadores`; PASS.
- [ ] **Step 3: Migration** da função (security definer, checa `tem_permissao('financeiro.conciliacao','ver')`, `grant execute to authenticated`); prova: num `begin`, inserir uma parcela paga na BB 102 em 2026-09 como owner (sem passar pela RPC), chamar `fn_conciliacao_desvios` e esperar 1 linha com a diferença; rollback.
- [ ] **Step 4:** `listarDesvios` + chamada na page; em `conciliacao-cliente.tsx`, acima do painel, um aviso vermelho (componente de aviso canônico usado no arquivo) com uma linha por desvio e o texto "Reabra o mês para conferir".
- [ ] **Step 5:** vitest do módulo PASS; aplicar migration e versionar; commit `"Conciliacao: avisa quando um mes fechado mudou depois do fechamento"`.

### Task 4: Portão e entrega
- [ ] rsync para `$CLAUDE_JOB_DIR/tmp/erp-gate` (ou usar o clone fora do iCloud), `npm ci`, `npx tsc --noEmit`, `npx eslint` nos arquivos tocados, `npx vitest run`, `npm run build`.
- [ ] Conferir em produção (SELECT) que as funções vivas têm a trava: `pg_get_functiondef` contém `fn_conciliacao_exigir_data_aberta` nas 5 funções.
- [ ] PR "Financeiro: travas de período (PR 1 do controle total)", CI verde, merge, acompanhar o status Vercel do commit.
- [ ] Atualizar `docs/decisoes.md` com D1/D2 e o vault (`projects/erp-emt/log.md`).
