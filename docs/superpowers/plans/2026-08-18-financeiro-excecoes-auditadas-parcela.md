# Exceções auditadas na parcela — Plano

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Exceção em dinheiro na parcela passa a ser possível e a ficar registrada com autor, hora e motivo, em vez de proibida ou silenciosa.

**Architecture:** As justificativas entram em `parcela_eventos`, que já existe e já é gravada por cinco funções, e que hoje nenhuma tela lê. A trilha passa a aparecer primeiro (valor imediato, zero risco), depois a conta lembrada, e só então as duas mudanças de dinheiro: `fn_pagar_parcela` aceitando data fora da autorizada com motivo, e uma `fn_alterar_parcela` nova para parcela não paga em lançamento que já tem parcela paga.

**Tech Stack:** Next.js 15 App Router, TypeScript strict, Supabase Postgres 17 (migrations via MCP `apply_migration`), Zod, React Hook Form, Vitest, canônicos EMT.

**Spec:** `docs/superpowers/specs/2026-08-18-financeiro-excecoes-auditadas-parcela-design.md` (commit `ca263ab`, aprovada pelo Tiago nas duas seções).

## Global Constraints

- **Projeto Supabase vivo:** `vsesgvqjgqpapoxhnbqx`. Migration **só** por MCP `apply_migration`, **e também** salva como arquivo em `supabase/migrations/<versao>_<nome>.sql` com o mesmo SQL executável. Conferência por **SQL normalizado** (remove `--`, colapsa espaço, `btrim`, `md5`), receita em `docs/decisoes.md`. **`supabase db push` é PROIBIDO.**
- **O ledger de migrations não é fonte de verdade sobre o schema.** Ler a definição real (`pg_get_functiondef`, `prosrc`, `information_schema`, `pg_policies`) antes de alterar.
- **Existe outra sessão do Claude ativa neste mesmo banco.** Antes de alterar função compartilhada, **confira o md5 e pare se divergir**. A receita é `md5(prosrc)`, **não** `md5(pg_get_functiondef)`.
- **`fn_pagar_parcela` está em `md5(prosrc) = ebee7691bc2b3bba8865867eda4b3dff` (4180 chars).** É a função que move dinheiro para fora da empresa.
- **Desconfie do SQL deste plano.** O Postgres **cria** função com SQL embutido inválido sem reclamar. **Rode cada consulta nova isolada antes de embutir.**
- **Teste o caso PARCIAL, não o extremo.** Aqui: lançamento com **uma** parcela paga e **duas** não pagas, e rateio em **dois** centros de custo, não um nem cinco.
- **`valor_liquido` de `lancamento_parcelas` é coluna GERADA** (`(valor - desconto) + juros`): escrever nela levanta erro, e ela se atualiza sozinha quando `valor` muda.
- **A soma dos rateios é validada com `<>`** em `fn_salvar_lancamento`: um centavo fora derruba a operação. O arredondamento tem que fechar **por construção**.
- **Dinheiro é `NUMERIC(14,2)`.** Float proibido. Exibição por `MoneyText` com `tabular-nums`.
- **Permissão tripla:** RLS no banco (`tem_permissao`), checagem na Server Action, UI esconde o que não pode.
- **Componentes canônicos primeiro.** Todo select é `Combobox` com busca, nunca o `Select` do shadcn. Trilha pelo canônico `Trilha`.
- **Toda prova em `begin; ... rollback;`** (ou abortada por `raise`). **Não use contagem de obras, centros de custo ou fornecedores como asserção**: a outra sessão mexe nesses cadastros. Nenhuma prova deixa resíduo.
- **Portão:** `find src supabase .next -name "* [0-9].*" -delete`, então `npx tsc --noEmit`, `npx eslint src` (**não** `npm run lint`), `npx vitest run`, `npm run build`. **Baseline: 1386 testes.** Regenere `src/lib/database.types.ts` pelo MCP depois de migration.
- **`git add` explícito por arquivo, nunca `git add -A`.** Commits em português, imperativo, **sem travessão**, terminando com `Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>`.
- **Branch `feat-parcela-excecoes-auditadas`, sem worktree.** Merge só depois do review amplo.

## Arquivos: responsabilidade de cada um

**Banco:** `parcela_eventos` cresce (Task 1); `fn_pagar_parcela` aceita motivo (Task 3); `fn_alterar_parcela` nova (Task 4).

**TypeScript:**
- `src/modules/financeiro/pagamentos/queries.ts` — `trilhaParcela` (Task 1)
- `src/modules/financeiro/pagamentos/eventos.ts` (novo) — mapeamento evento → `EventoTrilha`, puro (Task 1)
- `src/modules/financeiro/lancamentos/components/lancamento-detalhe.tsx` — trilha (Task 1) e ação Alterar (Task 4)
- `src/modules/financeiro/pagamentos/components/pagar-parcela-drawer.tsx` — conta lembrada (Task 2) e motivo (Task 3)
- `src/modules/financeiro/pagamentos/actions.ts` — motivo (Task 3)
- `src/modules/financeiro/lancamentos/actions.ts` — `alterarParcela` (Task 4)
- `src/modules/financeiro/lancamentos/components/alterar-parcela-dialog.tsx` (novo) — Task 4
- `src/modules/financeiro/lancamentos/rateio.ts` (novo) — redistribuição proporcional, pura e testável (Task 4)

---

### Task 1: A trilha da parcela sai da invisibilidade

**Modelo sugerido:** sonnet. Sem dinheiro: uma migration aditiva e leitura.

**Files:**
- Migration nova: `parcela_eventos_tipos_e_valores`
- Create: `src/modules/financeiro/pagamentos/eventos.ts`, `eventos.test.ts`
- Modify: `src/modules/financeiro/pagamentos/queries.ts`, `src/modules/financeiro/lancamentos/components/lancamento-detalhe.tsx`

**Interfaces:**
- Consumes: `parcela_eventos`, canônico `Trilha` (`EventoTrilha`, `TipoEventoTrilha` em `src/components/canonicos/trilha.tsx`).
- Produces: `interface ParcelaEvento { id, tipo, motivo, dataDe, dataPara, valorDe, valorPara, criadoEm, usuarioNome }`; `eventoParcelaParaTrilha(evento: ParcelaEvento, numeroParcela: number): EventoTrilha`; `trilhaParcelasDoLancamento(lancamentoId: string): Promise<EventoTrilha[]>`.

- [ ] **Step 1: Aplicar a migration aditiva**

Via `apply_migration`, nome `parcela_eventos_tipos_e_valores`:

```sql
alter table public.parcela_eventos
  add column if not exists valor_de numeric(14,2),
  add column if not exists valor_para numeric(14,2);

alter table public.parcela_eventos drop constraint if exists parcela_eventos_tipo_check;
alter table public.parcela_eventos add constraint parcela_eventos_tipo_check
  check (tipo = any (array[
    'aprovou','revisou','reenviou','desaprovou','reprogramou',
    'pagou_fora_da_janela','alterou'
  ]));

do $$
declare v_tipos text; v_cols integer;
begin
  select pg_get_constraintdef(oid) into v_tipos from pg_constraint
  where conrelid = 'public.parcela_eventos'::regclass and conname = 'parcela_eventos_tipo_check';
  if v_tipos is null then raise exception 'o check de tipo desapareceu'; end if;
  -- Os cinco antigos continuam aceitos: quem grava hoje nao pode parar de gravar.
  if v_tipos not like '%aprovou%' or v_tipos not like '%revisou%'
     or v_tipos not like '%reenviou%' or v_tipos not like '%desaprovou%'
     or v_tipos not like '%reprogramou%'
     or v_tipos not like '%pagou_fora_da_janela%' or v_tipos not like '%alterou%' then
    raise exception 'o check de tipo nao tem os sete tipos: %', v_tipos;
  end if;

  select count(*) into v_cols from information_schema.columns
  where table_schema='public' and table_name='parcela_eventos'
    and column_name in ('valor_de','valor_para') and data_type = 'numeric';
  if v_cols <> 2 then raise exception 'faltam as colunas de valor: %', v_cols; end if;
end $$;
```

**Confira antes de aplicar** que a policy de SELECT de `parcela_eventos` existe e por qual recurso, com `select policyname, cmd, qual, roles::text from pg_policies where tablename='parcela_eventos'`. **Se não houver policy de SELECT, pare e reporte**: sem ela a trilha nasce vazia e a Task 1 não tem como funcionar.

- [ ] **Step 2: Teste do mapeamento (falha primeiro)**

Criar `src/modules/financeiro/pagamentos/eventos.test.ts`:

```ts
import { describe, expect, it } from "vitest";

import {
  eventoParcelaParaTrilha,
  type ParcelaEvento,
} from "@/modules/financeiro/pagamentos/eventos";

const base: ParcelaEvento = {
  id: "e1",
  tipo: "reprogramou",
  motivo: "Fornecedor pediu prazo",
  dataDe: "2026-08-10",
  dataPara: "2026-08-20",
  valorDe: null,
  valorPara: null,
  criadoEm: "2026-08-09T12:00:00Z",
  usuarioNome: "Dora Silva",
};

describe("eventoParcelaParaTrilha", () => {
  it("põe o número da parcela no título e o motivo na descrição", () => {
    const e = eventoParcelaParaTrilha(base, 3);
    expect(e.titulo).toContain("Parcela 3");
    expect(e.descricao).toContain("Fornecedor pediu prazo");
    expect(e.usuario).toBe("Dora Silva");
  });

  it("mostra a mudança de data quando o evento tem data", () => {
    const e = eventoParcelaParaTrilha(base, 1);
    expect(e.descricao).toContain("10/08/2026");
    expect(e.descricao).toContain("20/08/2026");
  });

  it("mostra a mudança de valor quando o evento tem valor", () => {
    const e = eventoParcelaParaTrilha(
      { ...base, tipo: "alterou", valorDe: 1000, valorPara: 1500.5 },
      2,
    );
    expect(e.descricao).toContain("1.000,00");
    expect(e.descricao).toContain("1.500,50");
  });

  it("marca exceção de dinheiro com o tipo de destaque da trilha", () => {
    expect(eventoParcelaParaTrilha({ ...base, tipo: "alterou" }, 1).tipo).toBe("edicao");
    expect(
      eventoParcelaParaTrilha({ ...base, tipo: "pagou_fora_da_janela" }, 1).tipo,
    ).toBe("edicao");
  });

  it("mapeia os cinco tipos que já existiam", () => {
    const esperado: Record<string, string> = {
      aprovou: "aprovacao",
      revisou: "rejeicao",
      reenviou: "edicao",
      desaprovou: "desaprovacao",
      reprogramou: "edicao",
    };
    for (const [tipo, alvo] of Object.entries(esperado)) {
      expect(
        eventoParcelaParaTrilha({ ...base, tipo: tipo as ParcelaEvento["tipo"] }, 1).tipo,
      ).toBe(alvo);
    }
  });

  it("sobrevive a evento sem motivo", () => {
    const e = eventoParcelaParaTrilha({ ...base, motivo: null }, 1);
    expect(e.titulo).toContain("Parcela 1");
  });
});
```

- [ ] **Step 3: Rodar, ver falhar, implementar, ver passar**

`npx vitest run src/modules/financeiro/pagamentos/eventos.test.ts` → FAIL (módulo não existe).

Escreva `eventos.ts` com o tipo `ParcelaEvento`, o rótulo de cada tipo em português (o título: "Parcela 3 reprogramada", "Parcela 2 alterada", "Parcela 5 paga fora da data autorizada", e os cinco antigos) e o mapeamento para `TipoEventoTrilha`. Use `formatarData` e `formatarBRL` de `@/lib/formatadores` — **não** escreva formatação nova.

**Atenção ao asserir dinheiro em teste:** `formatarBRL` usa espaço não separável, então `toContain("1.000,00")` funciona mas `toBe("R$ 1.000,00")` com espaço comum **nunca** bate. Os testes acima já evitam isso de propósito.

`npx vitest run src/modules/financeiro/pagamentos/eventos.test.ts` → PASS, 6 testes.

- [ ] **Step 4: A leitura**

Em `pagamentos/queries.ts`, `trilhaParcelasDoLancamento(lancamentoId)`: lê `parcela_eventos` das parcelas daquele lançamento com o nome do autor (embed de `usuarios`) e o `numero_parcela` (embed de `lancamento_parcelas`), **numa leitura só**, e devolve `EventoTrilha[]` ordenado do mais recente para o mais antigo, passando cada linha por `eventoParcelaParaTrilha`.

Leia `trilhaFolha` em `src/modules/rh/folha/queries.ts` antes: é o mesmo problema já resolvido, e o formato de retorno é o mesmo.

- [ ] **Step 5: A tela**

Em `lancamento-detalhe.tsx`, uma seção com o canônico `Trilha`, recebendo os eventos **por prop do Server Component** (o padrão desta base: derivado e leitura vêm de cima, não do client). Quando não houver evento, `EmptyState` dizendo que ainda não houve movimentação nas parcelas.

- [ ] **Step 6: Portão e commit**

```bash
find src supabase .next -name "* [0-9].*" -delete
npx tsc --noEmit && npx eslint src && npx vitest run && npm run build
git add supabase/migrations/ src/lib/database.types.ts src/modules/financeiro/pagamentos/eventos.ts \
  src/modules/financeiro/pagamentos/eventos.test.ts src/modules/financeiro/pagamentos/queries.ts \
  src/modules/financeiro/lancamentos/components/lancamento-detalhe.tsx
git commit -m "feat(financeiro): a trilha da parcela sai da invisibilidade

parcela_eventos é gravada por cinco funções desde sempre e não era lida por
nenhuma tela: todo motivo de reprogramação já escrito estava gravado e invisível.
Agora aparece no detalhe do lançamento, pelo canônico Trilha.

A tabela ganha os dois tipos e as duas colunas de valor que as exceções de
dinheiro vão usar nas tasks seguintes, sem que nada passe a gravá-las ainda.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

### Task 2: A conta bancária que o sistema já sabia

**Modelo sugerido:** haiku ou sonnet. Uma linha de comportamento, sem banco.

**Files:**
- Modify: `src/modules/financeiro/pagamentos/components/pagar-parcela-drawer.tsx`

**Interfaces:**
- Consumes: `ParcelaAPagar.contaBancariaId?: string | null` (já existe em `pagamentos/queries.ts`, já populado por `buscarParcelasAPagar`).
- Produces: nada novo.

- [ ] **Step 1: Ler o reset atual e entender por que ele é assim**

Em `pagar-parcela-drawer.tsx`, por volta da linha 81, o reset acontece **durante o render** na transição de fechado para aberto (`if (aberto && !estavaAberto)`), não em `useEffect`, e o comentário explica: acontece antes da pintura, sem render em cascata. **Mantenha esse padrão**, só troque o valor inicial da conta.

```ts
setContaId(parcela?.contaBancariaId ?? "");
```

**Não mexa no reset do desconto.** O comentário ali diz que zerar o desconto é obrigatório, porque desconto vazando de um pagamento para o outro tiraria dinheiro que ninguém abateu. Isso continua valendo.

- [ ] **Step 2: Provar na tela e no teste**

O arquivo não tem teste hoje. Crie `pagar-parcela-drawer.test.tsx` cobrindo **só o que mudou**, no padrão dos testes de componente que já existem nesta base (leia `src/components/canonicos/data-table.test.tsx` e `lote-conta-bancaria.test.tsx` antes de escolher a ferramenta):

1. abrir o drawer com uma parcela que **tem** `contaBancariaId` deixa a conta escolhida;
2. abrir com parcela **sem** conta deixa o campo vazio;
3. fechar e reabrir com **outra** parcela troca a conta para a da nova parcela (é o caso que o reset existe para cobrir, e o que um `useState` inicial sem reset erraria).

- [ ] **Step 3: Portão e commit**

```bash
find src supabase .next -name "* [0-9].*" -delete
npx tsc --noEmit && npx eslint src && npx vitest run && npm run build
git add src/modules/financeiro/pagamentos/components/pagar-parcela-drawer.tsx \
  src/modules/financeiro/pagamentos/components/pagar-parcela-drawer.test.tsx
git commit -m "feat(financeiro): o pagamento lembra a conta que já foi escolhida

A parcela carrega conta_bancaria_id desde o lançamento ou a aprovação, e o drawer
zerava o campo ao abrir: pedia de novo um dado que já tinha em mão. Continua
alterável, e parcela sem conta continua pedindo escolha.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

### Task 3: Pagar fora da data autorizada, com motivo (DINHEIRO)

**Modelo sugerido:** opus. Altera a função que move dinheiro para fora da empresa.

**Files:**
- Migration nova: `pagar_parcela_fora_da_janela_com_motivo`
- Modify: `src/modules/financeiro/pagamentos/actions.ts`, `src/modules/financeiro/pagamentos/components/pagar-parcela-drawer.tsx`
- Create: `src/modules/financeiro/pagamentos/janela.ts`, `janela.test.ts`

**Interfaces:**
- Consumes: `parcela_eventos` com o tipo `pagou_fora_da_janela` (Task 1); `ParcelaAPagar.dataProgramada`.
- Produces: `fn_pagar_parcela(p_parcela_id uuid, p_conta_id uuid, p_data_pagamento date, p_desconto numeric, p_juros numeric, p_motivo text default null)`; a action hoje é `pagarParcela(id: string, contaBancariaId: string, dataPagamento: string, desconto = 0)` (`pagamentos/actions.ts:41`) e passa a receber `motivo?: string` como último parâmetro, depois de `desconto`; e em `janela.ts`: `foraDaJanela(dataPagamento: string, dataAutorizada: string | null): boolean` e `textoDaDiferenca(dataPagamento: string, dataAutorizada: string): string`.

- [ ] **Step 1: Ler a função viva e guardar num scratch**

```sql
select md5(prosrc) as antes, length(prosrc) as chars, prosrc
from pg_proc p join pg_namespace n on n.oid = p.pronamespace
where n.nspname='public' and p.proname='fn_pagar_parcela';
```

Esperado `ebee7691bc2b3bba8865867eda4b3dff`, 4180 chars. **Se divergir, pare e reporte.**

Localize: `v_data_informada := coalesce(p_data_pagamento, v_hoje);`, o bloco `if v_janela = 'a_partir' ... else ... end if;`, e o `update public.lancamento_parcelas set status = 'pago' ...` do fim.

- [ ] **Step 2: Rodar as consultas novas isoladas**

```sql
-- o insert do evento, com valores fixos, contra uma parcela real qualquer
begin;
insert into public.parcela_eventos (parcela_id, tipo, motivo, data_de, data_para, created_by)
select id, 'pagou_fora_da_janela', 'teste isolado', '2026-08-18'::date, '2026-08-17'::date, null
from public.lancamento_parcelas limit 1
returning id, tipo, data_de, data_para;
rollback;
```

- [ ] **Step 3: Aplicar a migration**

Recrie a função **a partir da definição viva** com `replace()` cirúrgico, fazendo três mudanças.

**(a) A assinatura ganha o motivo, com default**, para não quebrar chamador existente:

```sql
create or replace function public.fn_pagar_parcela(
  p_parcela_id uuid, p_conta_id uuid, p_data_pagamento date,
  p_desconto numeric, p_juros numeric, p_motivo text default null
) returns void language plpgsql security definer set search_path = '' as $fn$ ... $fn$;
```

**Atenção:** acrescentar parâmetro com default **cria uma sobrecarga** se a antiga não for removida, e o Postgres passa a não saber qual chamar (`function is not unique`) para chamadas com 5 argumentos. **`drop function` da versão de 5 parâmetros e recrie**, e **re-conceda o `grant execute`** que ela tinha (leia `proacl` antes de dropar). Isso já mordeu esta base: alterar RPC de relatório sem re-grant deixou o painel em branco sem erro.

**(b) A trava da janela vira exigência de motivo.** Substituir o bloco `if v_janela = 'a_partir' ... end if;` por:

```sql
    -- Fora da data autorizada deixa de ser recusa e passa a ser evento com
    -- motivo (decisao do dono, 18/08/2026). A comparacao e com a data
    -- INFORMADA, nao com hoje: a tela pede "data do pagamento", e comparar
    -- hoje fazia a mensagem falar de uma data que o usuario nao digitou.
    -- fn_janela_pagamento() deixa de bloquear; o parametro segue existindo.
    if v_data_informada <> v_programada then
      if coalesce(btrim(p_motivo), '') = '' then
        raise exception 'Este pagamento esta fora da data autorizada (%): informe o motivo.',
          to_char(v_programada, 'DD/MM/YYYY');
      end if;
    end if;
```

**(c) Depois do `update` que marca a parcela como paga**, gravar o evento:

```sql
  if v_tipo = 'a_pagar' and v_data_informada <> v_programada then
    insert into public.parcela_eventos
      (parcela_id, tipo, motivo, data_de, data_para, created_by)
    values
      (p_parcela_id, 'pagou_fora_da_janela', btrim(p_motivo),
       v_programada, v_data_informada, (select auth.uid()));
  end if;
```

**O que NÃO muda, e o diff tem que provar:** a recusa de data no futuro; `v_programada is null` recusando; `status <> 'aprovado'` recusando; `em_revisao` com mensagem própria; a permissão `financeiro.pagamentos:criar`; a trava de saldo; o desconto e os juros; `fn_recalcular_status_lancamento`; `fn_propagar_anexos`. O ramo `a_receber` não usa `v_programada` e **não pode passar a exigir motivo** — a guarda `v_tipo = 'a_pagar'` no insert existe para isso.

Trava `do $$` no fim: a função existe com 6 parâmetros, **não** existe mais com 5, e o `proacl` é o mesmo de antes.

Depois de aplicar, diffe contra o scratch do Step 1 esperando só as três mudanças.

- [ ] **Step 4: As regras puras, com teste primeiro**

`janela.test.ts`:

```ts
import { describe, expect, it } from "vitest";

import { foraDaJanela, textoDaDiferenca } from "@/modules/financeiro/pagamentos/janela";

describe("foraDaJanela", () => {
  it("data igual à autorizada não é fora", () => {
    expect(foraDaJanela("2026-08-18", "2026-08-18")).toBe(false);
  });
  it("antes e depois são fora", () => {
    expect(foraDaJanela("2026-08-17", "2026-08-18")).toBe(true);
    expect(foraDaJanela("2026-08-19", "2026-08-18")).toBe(true);
  });
  it("sem data autorizada não é fora: o banco recusa esse caso por outro motivo", () => {
    expect(foraDaJanela("2026-08-17", null)).toBe(false);
  });
});

describe("textoDaDiferenca", () => {
  it("diz adiantado e o número de dias", () => {
    expect(textoDaDiferenca("2026-08-17", "2026-08-18")).toBe("adiantado em 1 dia");
    expect(textoDaDiferenca("2026-08-15", "2026-08-18")).toBe("adiantado em 3 dias");
  });
  it("diz atrasado e o número de dias", () => {
    expect(textoDaDiferenca("2026-08-19", "2026-08-18")).toBe("atrasado em 1 dia");
    expect(textoDaDiferenca("2026-09-18", "2026-08-18")).toBe("atrasado em 31 dias");
  });
  it("atravessa mês e ano sem errar a contagem", () => {
    expect(textoDaDiferenca("2027-01-01", "2026-12-31")).toBe("atrasado em 1 dia");
  });
});
```

Rode, veja falhar, implemente `janela.ts`, veja passar. **Compare as datas como texto ISO ou por UTC**, nunca por `new Date(string).getTime()` com fuso local: a base exibe em America/Rio_Branco e um dia de diferença viraria zero ou dois. Leia `src/lib/formatadores.ts` e reuse o que já existe para data.

- [ ] **Step 5: A action e o drawer**

`actions.ts`: `pagarParcela` ganha `motivo?: string`, valida com Zod (texto trimado, 1..500) **só quando** a data informada difere da autorizada, e repassa à RPC. A checagem no servidor não é opcional: o cliente pode ser contornado.

O drawer: campo de texto que aparece **só** quando `foraDaJanela(dataPagamento, parcela.dataProgramada)`, com rótulo usando `textoDaDiferenca` ("Motivo do pagamento adiantado em 1 dia"), obrigatório nesse caso, e o botão bloqueado enquanto estiver vazio. O reset ao abrir zera o motivo, pelo mesmo argumento do desconto.

- [ ] **Step 6: As provas em banco**

Cada uma em `begin; ... rollback;` (ou abortada por `raise`), com fixture próprio e produção conferida antes e depois:

1. **pagar adiantado com motivo**: parcela aprovada com `data_programada` amanhã, pagamento hoje, motivo preenchido → parcela `pago`, evento `pagou_fora_da_janela` gravado com `data_de` = programada e `data_para` = informada;
2. **pagar atrasado com motivo** → mesmo resultado, evento gravado;
3. **fora da data sem motivo** → recusa, e a mensagem cita a data autorizada;
4. **na data exata sem motivo** → paga, e **nenhum** evento gravado;
5. **data no futuro** → continua recusada;
6. **parcela não aprovada** → continua recusada;
7. **saldo insuficiente** → continua recusado;
8. **a_receber**: baixar recebimento sem motivo → continua funcionando, sem exigir motivo e sem gravar evento.

- [ ] **Step 7: Portão e commit**

Portão completo, `git add` explícito, commit explicando que fora da data deixou de ser recusa e passou a ser evento com motivo, e que a comparação passou a ser com a data informada.

---

### Task 4: Alterar parcela não paga (DINHEIRO)

**Modelo sugerido:** opus. Recalcula o valor do lançamento e redistribui rateio.

**Files:**
- Migration nova: `alterar_parcela_nao_paga_com_motivo`
- Create: `src/modules/financeiro/lancamentos/rateio.ts`, `rateio.test.ts`, `components/alterar-parcela-dialog.tsx`
- Modify: `src/modules/financeiro/lancamentos/actions.ts`, `components/lancamento-detalhe.tsx`

**Interfaces:**
- Consumes: `parcela_eventos` com tipo `alterou` e as colunas `valor_de`/`valor_para` (Task 1).
- Produces: `fn_alterar_parcela(p_parcela_id uuid, p_valor numeric, p_data_vencimento date, p_motivo text)`; `alterarParcela(parcelaId, valor, dataVencimento, motivo)`; e em `rateio.ts`: `redistribuirRateio(rateios: { id: string; valor: number }[], novoTotal: number): { id: string; valor: number }[]`.

- [ ] **Step 1: O rateio proporcional, com teste primeiro**

`rateio.test.ts`:

```ts
import { describe, expect, it } from "vitest";

import { redistribuirRateio } from "@/modules/financeiro/lancamentos/rateio";

const soma = (r: { valor: number }[]) =>
  Math.round(r.reduce((t, x) => t + x.valor, 0) * 100) / 100;

describe("redistribuirRateio", () => {
  it("mantém a soma exatamente igual ao novo total", () => {
    const r = redistribuirRateio(
      [
        { id: "a", valor: 1000 },
        { id: "b", valor: 2000 },
      ],
      1000,
    );
    expect(soma(r)).toBe(1000);
  });

  it("distribui na proporção de antes", () => {
    const r = redistribuirRateio(
      [
        { id: "a", valor: 1000 },
        { id: "b", valor: 3000 },
      ],
      2000,
    );
    expect(r.find((x) => x.id === "a")?.valor).toBe(500);
    expect(r.find((x) => x.id === "b")?.valor).toBe(1500);
  });

  it("joga a sobra de centavos numa linha só e fecha exato", () => {
    // 1000 / 3 não fecha em duas casas: 333,33 x 3 = 999,99, sobra 0,01
    const r = redistribuirRateio(
      [
        { id: "a", valor: 100 },
        { id: "b", valor: 100 },
        { id: "c", valor: 100 },
      ],
      1000,
    );
    expect(soma(r)).toBe(1000);
    expect(r.filter((x) => x.valor === 333.33)).toHaveLength(2);
    expect(r.filter((x) => x.valor === 333.34)).toHaveLength(1);
  });

  it("é determinístico: duas execuções dão o mesmo resultado", () => {
    const entrada = [
      { id: "b", valor: 100 },
      { id: "a", valor: 100 },
      { id: "c", valor: 100 },
    ];
    expect(redistribuirRateio(entrada, 1000)).toEqual(
      redistribuirRateio(entrada, 1000),
    );
  });

  it("com uma linha só, ela recebe o total inteiro", () => {
    expect(redistribuirRateio([{ id: "a", valor: 700 }], 1234.56)).toEqual([
      { id: "a", valor: 1234.56 },
    ]);
  });

  it("lista vazia devolve lista vazia: lançamento sem rateio existe", () => {
    expect(redistribuirRateio([], 500)).toEqual([]);
  });
});
```

Rode, veja falhar, implemente, veja passar. A regra: `novo = round(valor * novoTotal / totalAntigo, 2)`, e a sobra (`novoTotal - soma(novos)`) inteira na linha de **maior valor novo, desempate por id** — sobra numa linha só, escolhida por critério fixo, é o que torna o resultado o mesmo em duas execuções. **Total antigo zero: devolva lista vazia em vez de dividir por zero.**

- [ ] **Step 2: A mesma regra no banco, rodada isolada antes de embutir**

O SQL que a função vai usar, testado sozinho com um lançamento real em transação revertida:

```sql
begin;
with base as (
  select id, round(valor * 2000::numeric / 4000::numeric, 2) as novo
  from public.lancamento_rateios where lancamento_id = (
    select lancamento_id from public.lancamento_rateios group by lancamento_id
    having count(*) > 1 limit 1
  )
),
tot as (select coalesce(sum(novo), 0) as s from base),
alvo as (select id from base order by novo desc, id limit 1)
select b.id, b.novo,
       b.novo + case when b.id = (select id from alvo)
                     then 2000::numeric - (select s from tot) else 0 end as final
from base b order by b.novo desc, b.id;
rollback;
```

Confira à mão que a coluna `final` soma exatamente 2000,00.

- [ ] **Step 3: Aplicar a migration da função nova**

`fn_alterar_parcela(p_parcela_id uuid, p_valor numeric, p_data_vencimento date, p_motivo text)`, `security definer`, `set search_path = ''`, com `grant execute` para `authenticated` no mesmo padrão das irmãs (leia o `proacl` de `fn_reprogramar_parcela` e copie).

Recusa, **nesta ordem**: sem `financeiro.lancamentos:editar`; `btrim(p_motivo)` vazio; `p_valor is null or p_valor <= 0`; `p_data_vencimento is null`; parcela inexistente; `status = 'pago'`; lançamento `cancelado`; `origem in ('folha','folha_guia','adiantamento')` **com a mesma mensagem que `fn_definir_parcelas_lancamento` usa** (leia e copie, não reescreva); competência fechada por `fn_exigir_competencia_aberta(v_mes, 'lancamento', v_lanc)`.

Faz: grava `parcela_eventos` tipo `alterou` com `valor_de`, `valor_para`, `data_de`, `data_para`; atualiza `valor` e `data_vencimento` da parcela (**nunca `valor_liquido`, que é coluna gerada**); se o valor mudou, zera `status = 'pendente'`, `data_programada = null`, `data_programada_origem = null`, `aprovado_em = null`, `aprovado_por = null` (**mantém `conta_bancaria_id`, `conferido_por` e `conferido_em`**); recalcula `lancamentos.valor` como soma das parcelas e `lancamentos.data_vencimento` como a menor; redistribui os rateios pelo SQL do Step 2; chama `fn_recalcular_status_lancamento`.

**A ordem importa:** gravar o evento **antes** do update é o que permite ler `valor_de` da própria linha sem variável extra; se preferir variáveis, leia antes e grave depois, mas não leia depois de escrever.

- [ ] **Step 4: As provas em banco**

Fixture do **caso parcial**: um lançamento `a_pagar` manual de R$ 4.000,00 com **três** parcelas (uma **paga** de 1.000, uma **aprovada** de 1.500, uma **pendente** de 1.500) e rateio em **dois** centros de custo (2.500 e 1.500). Tudo em transação revertida.

1. **alterar o valor da pendente** de 1.500 para 2.000 → `lancamentos.valor` = 4.500, **soma dos rateios = 4.500 exatamente**, a pendente segue `pendente`, evento `alterou` com `valor_de` 1500 e `valor_para` 2000;
2. **alterar o valor da aprovada** → ela volta a `pendente`, perde `data_programada` e `aprovado_em`, e **mantém** `conta_bancaria_id`;
3. **alterar só o vencimento da aprovada** → **continua `aprovado`**, com `data_programada` intacta, e o evento traz `data_de`/`data_para` e `valor_de = valor_para`;
4. **a parcela paga** → recusa;
5. **sem motivo** → recusa;
6. **valor zero ou negativo** → recusa;
7. **lançamento de origem folha, folha_guia e adiantamento** → recusa nos três;
8. **competência fechada** → recusa;
9. **linha de controle**: a parcela **paga** e a **outra** não alterada conferidas antes e depois, provando que nada vazou nelas; e `lancamentos.data_vencimento` conferido.

- [ ] **Step 5: A action e a tela**

`alterarParcela` em `lancamentos/actions.ts`, com Zod (valor `> 0` em `NUMERIC(14,2)`, data obrigatória, motivo trimado 1..500), checagem de permissão, `revalidatePath` no padrão do arquivo, e tradução do erro do banco pelo caminho que o módulo já usa — **sem isso a recusa vira "tente novamente"**, que foi o defeito que a revisão pegou duas vezes nesta base.

`alterar-parcela-dialog.tsx`: valor (`InputMoeda`), vencimento, motivo, mostrando o total do lançamento antes e depois e avisando que o rateio será ajustado proporcionalmente. Quando a parcela está `aprovado`, aviso de que alterar o valor derruba a aprovação. No `lancamento-detalhe.tsx`, a ação entra no menu da linha das parcelas **não pagas**, ao lado das que já existem.

**`podeDefinirParcelas` e `editavel` não mudam.**

- [ ] **Step 6: Portão e commit**

---

### Task 5: Portão final, prova de aceite e registro

**Modelo sugerido:** opus.

- [ ] **Step 1: Portão verde.** `find src supabase .next -name "* [0-9].*" -delete`, então `npx tsc --noEmit`, `npx eslint src`, `npx vitest run`, `npm run build`. Baseline 1386 mais os testes novos.

- [ ] **Step 2: Advisors** de segurança e performance. Reporte achado **novo** desta frente. `fn_alterar_parcela` não pode aparecer como definer executável por `public`.

- [ ] **Step 3: A prova de aceite ponta a ponta**, em transação revertida, no mesmo fixture do caso parcial: alterar a parcela pendente, aprovar, pagar **fora da data** com motivo, e conferir ao fim que a trilha do lançamento traz **os três eventos** na ordem certa (`alterou`, `aprovou`, `pagou_fora_da_janela`), que `lancamentos.valor` fecha com a soma das parcelas, que a soma dos rateios fecha com ele, e que o saldo da conta bancária caiu exatamente pelo `valor_liquido` da parcela paga.

- [ ] **Step 4: Conferir as migrations da frente** — cada versão com arquivo homônimo e SQL executável igual ao gravado, pela receita normalizada. Reporte a tabela versão × md5 dos dois lados, e confirme que `fn_pagar_parcela` **não** existe mais com 5 parâmetros.

- [ ] **Step 5: Registrar em `docs/decisoes.md`** uma entrada nova, no formato das existentes, com: que fora da data autorizada deixou de ser recusa e passou a ser evento com motivo, e que a comparação passou a ser com a data informada; que "lançamento com pagamento não se edita" deixou de ser absoluto; que o valor do lançamento passou a ser recalculado pela soma das parcelas e por isso pode divergir do documento do fornecedor; que o rateio é redistribuído proporcionalmente **sem ninguém escolher onde**, e que uma obra pode absorver diferença que não é dela; que `parcela_eventos` era gravada e invisível até esta frente; e que `fn_janela_pagamento()` deixou de bloquear sem deixar de existir.

- [ ] **Step 6: Não faça merge.** O merge é do coordenador, depois do review amplo.

---

## Self-review deste plano

**Cobertura da spec:**

| seção da spec | task |
|---|---|
| 1. `parcela_eventos` cresce e passa a ser exibida | 1 |
| 2. Conta bancária lembrada | 2 |
| 3. Pagamento fora da data autorizada | 3 |
| 4. Alterar parcela não paga, e o rateio proporcional | 4 |
| 5. Telas | 1 (Step 5), 2 (Step 1), 3 (Step 5), 4 (Step 5) |
| 6. Testes | 1 (Step 2), 3 (Steps 4 e 6), 4 (Steps 1, 2 e 4), 5 (Step 3) |
| Consequências aceitas pelo Tiago | 5 (Step 5) |

**Ordem:** a Task 1 vem primeiro porque as Tasks 3 e 4 gravam eventos que só têm valor se alguém os lê, e porque ela é a única sem risco de dinheiro — entrega valor no primeiro commit. A Task 2 é independente e pode trocar de lugar com a 1 sem prejuízo.

**Riscos:**

1. **A sobrecarga de `fn_pagar_parcela`.** Acrescentar parâmetro com default sem dropar a versão de 5 parâmetros cria ambiguidade (`function is not unique`) e derruba o pagamento inteiro. O Step 3 da Task 3 manda dropar e **re-conceder o grant**, que é o passo que esta base já esqueceu uma vez.
2. **O arredondamento do rateio.** `fn_salvar_lancamento` compara a soma com `<>`: um centavo derruba tudo. Por isso a regra está testada em Vitest **e** rodada isolada em SQL antes de entrar na função.
3. **Outra sessão trabalha neste banco.** Conferir md5 antes de alterar função compartilhada e parar se divergir.
