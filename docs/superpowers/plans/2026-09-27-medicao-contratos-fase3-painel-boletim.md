# Medição de Contratos, Fase 3 (Painel + Boletim + export): plano de implementação

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development. Steps use checkbox (`- [ ]`) syntax.

**Goal:** Telas só de leitura do Painel de contratos e do Boletim, com o export xlsx do boletim conferido célula a célula contra a planilha oficial do Lote 09, e o `DataTable` canônico ganhando linhas em árvore.

**Architecture:** Todo número de dinheiro sai do banco (D7). Duas RPCs novas `security invoker` (`fn_mc_boletim`, `fn_mc_painel`) leem as views da Fase 1 e devolvem jsonb já montado, com todo numeric como texto (sem passar por double). O TypeScript só monta a árvore para exibir, formata e escreve o xlsx com exceljs. O `DataTable` ganha o modo árvore (`getSubRows` do TanStack) sem tabela paralela (regra 9).

**Tech Stack:** Supabase Postgres 17 (MCP `apply_migration` / `execute_sql`), Next.js App Router, TanStack Table 8.21, exceljs 4.4, vitest 4, Python 3 + openpyxl para a conferência.

**Spec:** `docs/superpowers/specs/2026-09-25-medicao-contratos-design.md` (seções 4.1, 9.1, 9.4, 9.9, 13.3).

## Regras de cálculo desta fase (derivadas da spec e da Fase 2, nada novo)

- **Linha de serviço** mostra os próprios valores: previsto = `mc_v_planilha_linhas.valor_previsto`; valor na Nª = `valor_medicao` da Nª; acumulado = Σ `valor_medicao` das medições 1..N. Linha com preço e com filhos com preço (02.07.05) mostra só os dela, como na planilha oficial.
- **Título** mostra a soma exata das linhas de serviço da subárvore (`mc_v_planilha_subarvore`), arredondada no fim.
- Em toda linha, grupo e total: previsto, valor na Nª e acumulado = `round(soma exata, 2)`. Nas regras `item_por_*` o `valor_medicao` já vem arredondado; em `sem_arredondar` é exato. É o que reproduz o centavo do Lote 09 (total …,77 contra grupos …,76).
- **Saldo = previsto − acumulado**, os dois já arredondados, em toda linha, grupo e total (decisão do Tiago, 26/09: 207.385.821,72). % executada = acumulado / previsto; % a medir = saldo / previsto; nulos quando o previsto é zero.
- Regra de arredondamento nula: todo valor em dinheiro e % sai nulo; quantidades continuam.
- Quantidade por medição = `qtd_efetiva` de `mc_v_medicao_itens` (aprovada quando a medição está aprovada, senão medida).
- "Boletim até a Nª": colunas 1ª..Nª; "valor na medição" é o da Nª; acumulado soma 1..N. Padrão N = última medição do contrato ("medição corrente", o cartão "até hoje").
- Versão da planilha exibida: a vigente de maior número. Item medido que não está nessa versão (saiu num aditivo) aparece em `fora_da_versao` e **entra no acumulado e no valor da Nª do total**; o previsto do total é o da versão exibida. Não existe aditivo ainda; esta regra é só para nada medido sumir do total e vai como pergunta Q8 na spec (Task 9).
- Painel: previsto = total da versão vigente de maior número; acumulado = `round(Σ exato de todas as medições)`; medição corrente = a de maior número, com `mc_v_medicao_totais.valor`. Total consolidado = soma dos valores já arredondados de cada contrato. Reajuste acumulado e pendências **não** entram nesta fase (Fases 5 e 6), nem como coluna vazia.
- Exibição de preço e quantidade: 15 algarismos significativos, zeros finais cortados, sem passar por `Number`. É o que o Excel mostra; tira o ruído de double (`102.34700000000001` vira `102,347`) e mantém a casa escondida (`580,8643`). O dado no banco não muda.

## Global Constraints

- Migration vai direto para produção: só mudança **aditiva**. Aplicar por `apply_migration`; o arquivo no repo usa a versão REAL de `supabase_migrations.schema_migrations`. `db push` proibido.
- Funções novas: `set search_path to ''`, nomes qualificados `public.`, `revoke all on function ... from public, anon`, `grant execute ... to authenticated`. Advisors do Supabase limpos depois de cada migration.
- Nenhuma escrita em outro módulo (D1). Nenhuma FK nova para fora do `mc_*`.
- Dinheiro só do banco; o TS não soma, não subtrai e não arredonda valor (D7). Numeric sempre como texto no jsonb (`::text`).
- Backfill só para os 4 Admins ativos (Tiago, James, Emanuel, Lorenzo); `$confere$` aborta se não forem 4 usuários e 44 linhas `medicao.%`.
- Textos pt-BR, sem travessão (—). Commits terminam com `Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>`.
- `node_modules` do checkout no iCloud pode estar "dataless": se `tsc`/`vitest` travarem, rodar numa cópia em `$CLAUDE_JOB_DIR/tmp` com `npm ci`.
- Portão do PR: `npm run typecheck`, `npm run lint`, `npx vitest run`, `npm run build`, CI verde, prova SQL no banco vivo, advisors limpos. Depois: merge (merge commit), deploy de produção acompanhado e conferência na tela.

## Review Focus

1. Contrato fora da lista do usuário, ou usuário sem `medicao.boletim/ver`: a RPC recusa, não devolve árvore vazia com totais zerados. Prova Task 3 (casos 3e, 3f).
2. `p_ate` fora de 1..última (0, 11 no Lote 09, contrato sem medição): mensagem clara, não boletim vazio. Contrato sem medição com `p_ate` nulo: boletim com só o previsto. Prova Task 3 (3g, 3h).
3. Busca e filtro por grupo na árvore: achar `02.07.05.01` tem de manter os pais visíveis e não pode mexer nos totais do rodapé e dos cartões (que são do contrato). Teste Task 2 e Task 5.
4. Texto de numeric com muitas casas ou ruído (`102.34700000000001`, `21154.63583333333`, `-0.30000000000000004`, `0.749996`, `0`): exibição certa sem `Number`. Teste Task 1.
5. Export com N menor que a última (boletim "até a 9ª"): só 9 colunas de medição, valor da Nª é o da 9ª, acumulado só até a 9ª. Teste Task 7.

---

### Task 1: Exibição de preço e quantidade sem ruído de double

**Files:**
- Modify: `src/modules/medicao/planilha/formato.ts`
- Test: `src/modules/medicao/planilha/formato.test.ts` (criar se não existir; se existir, acrescentar)
- Modify: `src/modules/medicao/planilha/components/versao-detalhe.tsx` (preço e quantidade passam a usar a função nova)

**Interfaces:**
- Produces: `export function numeroExibicao(texto: string | null): string`: arredonda o texto a 15 algarismos significativos (meio para longe do zero), corta zeros finais da fração, formata com `decimalPtBr`. Texto que não casa `^-?\d+(\.\d+)?$` volta como veio; `null` vira `""`.

- [ ] **Step 1: teste que falha**

```ts
import { describe, expect, it } from "vitest";
import { numeroExibicao } from "./formato";

describe("numeroExibicao", () => {
  it.each([
    ["102.34700000000001", "102,347"],
    ["580.8643", "580,8643"],
    ["21154.63583333333", "21.154,6358333333"],
    ["17057.717", "17.057,717"],
    ["0.749996", "0,749996"],
    ["-0.30000000000000004", "-0,3"],
    ["0", "0"],
    ["36", "36"],
    ["1234567890123456789", "1.234.567.890.123.460.000"],
    ["0.000012345678901234567", "0,0000123456789012346"],
    ["9.9999999999999999", "10"],
  ])("%s vira %s", (entrada, saida) => {
    expect(numeroExibicao(entrada)).toBe(saida);
  });
  it("null vira vazio e texto estranho volta como veio", () => {
    expect(numeroExibicao(null)).toBe("");
    expect(numeroExibicao("abc")).toBe("abc");
  });
});
```

- [ ] **Step 2:** `npx vitest run src/modules/medicao/planilha/formato.test.ts`: FAIL (função não existe).
- [ ] **Step 3: implementar** em `formato.ts`, só com string/BigInt:

```ts
const SIGNIFICATIVOS = 15;

/**
 * Preço e quantidade para a TELA: 15 algarismos significativos, como o Excel mostra. Tira o ruído
 * de double que veio do xlsx (102.34700000000001 vira 102,347) e mantém a casa escondida
 * (580,8643). Nunca passa por Number; o dado no banco continua com todas as casas.
 */
export function numeroExibicao(texto: string | null): string {
  if (texto === null) return "";
  const m = /^(-?)(\d+)(?:\.(\d+))?$/.exec(texto.trim());
  if (!m) return texto;
  const [, sinal, inteiro, fracao = ""] = m;
  let valor = BigInt(inteiro + fracao);
  let casas = fracao.length;
  const corte = valor.toString().length - SIGNIFICATIVOS;
  if (corte > 0) {
    const fator = BigInt(10) ** BigInt(corte);
    const resto = valor % fator;
    valor = valor / fator + (resto * BigInt(2) >= fator ? BigInt(1) : BigInt(0));
    casas -= corte;
  }
  let s = valor.toString();
  if (casas < 0) {
    s += "0".repeat(-casas);
    casas = 0;
  }
  s = s.padStart(casas + 1, "0");
  const parteInteira = s.slice(0, s.length - casas);
  const parteFracao = s.slice(s.length - casas).replace(/0+$/, "");
  const negativo = sinal === "-" && valor !== BigInt(0);
  return decimalPtBr(`${negativo ? "-" : ""}${parteInteira}${parteFracao ? `.${parteFracao}` : ""}`);
}
```

Conferido em node com os casos do teste e mais `"0.00"` → `"0"`, `"-0.000"` → `"0"`, `"007.50"` → `"7,5"` (acrescentar esses três ao `it.each`). Sem literal `1n`: o tsconfig mira ES2017 (ver `decimal.ts`).

- [ ] **Step 4:** teste PASSA. Mutação: trocar `SIGNIFICATIVOS` para 17 e ver `102.34700000000001` falhar; desfazer.
- [ ] **Step 5:** em `versao-detalhe.tsx`, preço unitário e quantidade prevista passam de `decimalPtBr` para `numeroExibicao` (dinheiro continua `MoneyText`). Rodar os testes da planilha.
- [ ] **Step 6: commit** `Medição: preço e quantidade sem ruído de double na tela`.

### Task 2: DataTable com linhas em árvore

**Files:**
- Modify: `src/components/canonicos/data-table.tsx`
- Modify: `src/components/canonicos/index.ts` (exportar `CelulaArvore`) — conferir onde o barrel exporta o `DataTable`
- Test: `src/components/canonicos/data-table-arvore.test.tsx` (padrão de `data-table-expansao.test.tsx`: mocks de `next/navigation` e de `@/modules/_shared/preferencias-tabela/actions`, `afterEach(cleanup)`, `afterEach(limparEstadosTabelaParaTeste)`)

**Interfaces:**
- Produces, em `DataTableProps<TData>`:
  - `subLinhas?: (registro: TData) => TData[] | undefined`: liga o modo árvore (`getSubRows`, `getExpandedRowModel`, `filterFromLeafRows: true`, ordenação desligada, todas as linhas abertas no início, sem paginação: todas as linhas visíveis). Incompatível com `linhaExpandida` e com `selecao`: se vierem juntos, `throw new Error("DataTable: subLinhas não combina com linhaExpandida nem selecao")`.
  - Com `subLinhas`, a barra da tabela mostra o botão "Recolher tudo" / "Expandir tudo" (`table.toggleAllRowsExpanded`).
  - Busca (`searchKey`) na árvore: linha que casa mantém os ancestrais; enquanto houver busca, tudo fica aberto.
- Produces: `export function CelulaArvore<TData>({ linha, children }: { linha: Row<TData>; children: React.ReactNode })`: recuo `linha.depth * 1rem`, chevron (botão com `aria-label` "Recolher"/"Expandir", `aria-expanded`) quando `linha.getCanExpand()`, espaço do mesmo tamanho quando não. `stopPropagation` no clique, como a coluna de expansão atual.
- O rodapé (`rodape`) continua igual.

- [ ] **Step 1: testes que falham** (`data-table-arvore.test.tsx`):
  - dados `[{id:"1", codigo:"01", filhos:[{id:"1.1", codigo:"01.01", filhos:[{id:"1.1.1", codigo:"01.01.01"}]}]}, {id:"2", codigo:"02"}]` com 60 filhos em `02` → renderiza as 64 linhas (sem paginação: nenhum controle "Próxima página").
  - clicar em "Recolher" do `01` esconde `01.01` e `01.01.01`; clicar de novo mostra.
  - "Recolher tudo" deixa só `01` e `02`; "Expandir tudo" volta.
  - busca `01.01.01` (com `searchKey="codigo"`) mostra `01`, `01.01`, `01.01.01` e esconde `02`.
  - cabeçalho não ordena ao clicar.
  - `subLinhas` junto com `linhaExpandida` lança o erro.
  - o recuo: `01.01.01` tem `padding-left: 2rem`.
- [ ] **Step 2:** rodar e ver falhar.
- [ ] **Step 3: implementar.** No `useReactTable`: quando `subLinhas` existe, `getSubRows: subLinhas`, `getExpandedRowModel: getExpandedRowModel()`, `filterFromLeafRows: true`, `enableSorting: false`, estado inicial `expanded: true`, sem `getPaginationRowModel` (ou `pageSize` = total de linhas; escolher o que não quebra o modo servidor) e o rodapé de paginação escondido. O `ExpandedState` já existe (linha ~2130): reaproveitar. Enquanto o filtro global tiver texto, forçar `expanded: true`. `CelulaArvore` no mesmo arquivo.
- [ ] **Step 4:** testes da árvore PASSAM e os existentes (`data-table.test.tsx`, `-expansao`, `-selecao`) continuam verdes.
- [ ] **Step 5: commit** `DataTable: linhas em árvore (subLinhas + CelulaArvore)`.

### Task 3: RPCs `fn_mc_boletim` e `fn_mc_painel` + prova

**Files:**
- Create: `supabase/provas/mc_fase3_banco.sql`
- Create: `supabase/migrations/<versão real>_mc_fase3a_boletim_painel.sql`

**Interfaces:**
- Produces `public.fn_mc_boletim(p_contrato uuid, p_ate integer default null) returns jsonb`:
  ```
  { contrato: {id, codigo, nome_obra, numero_contrato, contratante_nome, regra_arredondamento},
    versao: {id, numero, vigente_desde} | null,
    ate: int | null,                       -- N usado
    medicoes: [{id, numero, periodo_inicio, periodo_fim, status, valor}],  -- todas do contrato, por número
    linhas: [{id, ordem, codigo, pai_id, nivel, descricao, unidade, tipo, item_id,
              preco_unitario, quantidade_prevista, qtds: {"1": "1.5", ...},
              previsto, valor_medicao, acumulado, saldo, pct_executado, pct_a_medir}],  -- por ordem
    fora_da_versao: [{item_id, codigo, descricao, unidade, qtds, valor_medicao, acumulado}],
    total: {previsto, valor_medicao, acumulado, saldo, pct_executado, pct_a_medir} }
  ```
  Todo numeric como texto. `qtds` só com medições 1..N.
- Produces `public.fn_mc_painel(p_status text[] default null, p_tipos text[] default null) returns jsonb`:
  ```
  { contratos: [{id, codigo, nome_obra, contratante_nome, contratante_tipo, status, versao_numero,
                 previsto, acumulado, saldo, pct_executado, medicoes,
                 corrente: {numero, status, periodo_inicio, periodo_fim, valor} | null}],  -- por código
    total: {previsto, acumulado, saldo, pct_executado, corrente} }
  ```

Números da prova, feitos à mão (contrato K, `sem_arredondar`, as linhas do K1 da prova da Fase 1):
`01` título | `01.01` 3 × 0,335 | `01.02` 3 × 0,335 | `01.02.01` (filho de 01.02) 2 × 10,004 | `02` título | `02.01` 1 × 100,005 | `02.01` (repetido) 1 × 1.
Medições: 1ª (jan) lança `01.01` 1,5 e `02.01` (ordem 6) 0,5; 2ª (fev) lança `01.01` 1,5 e `01.02.01` 1. Ambas abertas (qtd efetiva = medida).
- Até a 2ª (padrão): `01.01` qtds {1: 1.5, 2: 1.5}, previsto 1,01, valor 2ª round(0,5025) = 0,50, acumulado round(1,005) = 1,01, saldo 0,00, % exec 1. `01.02` (serviço com filho) só os dele: previsto 1,01, valor 0,00, acumulado 0,00, saldo 1,01. `01.02.01`: previsto 20,01, valor 10,00, acumulado 10,00, saldo 10,01. Grupo `01`: previsto round(22,018) = 22,02; valor round(10,5065) = 10,51; acumulado round(11,009) = 11,01; saldo 11,01. `02.01` (ordem 6): previsto 100,01, valor 0,00, acumulado round(50,0025) = 50,00, saldo 50,01. Grupo `02`: previsto 101,01, valor 0,00, acumulado 50,00, saldo 51,01. **Total**: previsto 123,02; valor 10,51; acumulado round(61,0115) = 61,01; saldo 62,01; % exec 61,01/123,02 (conferir `round(pct, 6) = 0.495936`). Medições: 1ª round(50,505) = 50,51; 2ª 10,51.
- Até a 1ª: total valor 50,51, acumulado round(50,505) = 50,51 (grupos 0,50 + 50,00 = 50,50: o centavo), saldo 72,51; `01.01` qtds só {1: 1.5}.
- Regra nula: toda chave de dinheiro e % nula, `qtds` iguais.
- Painel com filtro `p_tipos = {privado}` (K é `privado`, o L09 é `federal`): um contrato, previsto 123,02, acumulado 61,01, saldo 62,01, corrente {numero 2, valor 10,51}; total igual.
- Fora da versão: K3 com v0 (`01` título, `01.01` 1 × 10, `01.02` 1 × 5), 1ª lança `01.02` 0,5 (2,50), aditivo + v1 vigente a partir do mês seguinte só com `01` e `01.01`. Boletim: linhas de v1 (previsto 10,00), `fora_da_versao` com `01.02` acumulado 2,50, total acumulado 2,50, saldo 7,50.
- Lote 09 vivo (sem gravar, impersonando o Tiago): total previsto 243927483.49, acumulado 36541661.77, valor da 10ª 680738.27, saldo 207385821.72; grupos (previsto / acumulado / 10ª): 01 761566.89/117937.01/0.00; 02 91142410.02/18657438.30/3312.02; 03 15650687.43/139520.48/0.00; 04 74015072.36/15662616.12/660861.19; 05 4104431.62/0.00/0.00; 06 50465073.89/0.00/0.00; 07 1704476.68/1070413.54/0.00; 08 6083764.60/893736.31/16565.06; 265 linhas; `02.07.04` preço `580.8643`.

- [ ] **Step 1: escrever a prova** `supabase/provas/mc_fase3_banco.sql` no estilo de `mc_fase1_banco.sql` (ler o arquivo inteiro antes: `begin;`, helpers `fn_mc_prova_planilha`/`fn_mc_prova_medicao` recriados na transação, dados como dono, depois `set local role authenticated` + `request.jwt.claims` do Tiago para chamar as RPCs como usuário, `r jsonb` com um caso por chave, `raise exception 'PROVA %', r` no fim e o bloco de ABORTO GARANTIDO). Casos:
  - 3a boletim de K até a 2ª (números acima, linha a linha); 3b até a 1ª; 3c regra nula; 3d fora da versão (K3);
  - 3e usuário `v_zero` com `medicao.boletim/ver` na transação mas fora da lista de K → "recusou: ..."; 3f Tiago sem `medicao.boletim/ver` (apagar a permissão na transação) → recusou; o mesmo para `fn_mc_painel` sem `medicao.painel/ver`;
  - 3g `p_ate = 0` e `p_ate = 3` em K → recusou com mensagem que cita a medição; 3h contrato sem medição → `ate` nulo, linhas com previsto e valores zero;
  - 3i painel filtrado `privado`;
  - 3j Lote 09 vivo (alvos acima);
  - **3k controle**: o mesmo 3j comparado a um alvo desviado em R$ 0,01 (`36541661.78`) tem de dar DIFERENTE;
  - 3l nenhuma escrita: contagem de `mc_*` e de `obras`, `centros_custo`, `lancamentos` iguais antes e depois.
- [ ] **Step 2:** rodar a prova pelo MCP `execute_sql`: tem de falhar porque as funções não existem.
- [ ] **Step 3: migration**, com este texto (já rodado em 27/09 contra produção numa transação desfeita: L09 bateu total previsto 243927483.49, acumulado 36541661.77, 10ª 680738.27, saldo 207385821.72, os 8 grupos, 265 linhas, `02.07.04` com `580.8643`, painel igual; nada ficou gravado):

```sql
-- Medição de Contratos, Fase 3a: boletim e painel, só leitura. Todo número sai daqui como texto;
-- a tela e o xlsx só formatam (D7). Regras: plano da Fase 3, seção "Regras de cálculo".
--   Serviço mostra os próprios valores; título soma as linhas de serviço da subárvore.
--   Dinheiro = round(soma exata, 2) em linha, grupo e total (o centavo do Lote 09).
--   Saldo = previsto - acumulado, os dois já arredondados (Tiago, 26/09/2026).
--   Regra de arredondamento nula: dinheiro e % nulos, quantidades continuam.
create or replace function public.fn_mc_boletim(p_contrato uuid, p_ate integer default null)
returns jsonb language plpgsql stable security invoker set search_path to '' as $$
declare
  v_c public.mc_contratos%rowtype;
  v_versao public.mc_planilha_versoes%rowtype;
  v_ultima integer;
  v_ate integer;
  v_valor boolean;
  v_res jsonb;
begin
  if not public.tem_permissao('medicao.boletim', 'ver') then
    raise exception 'Sem permissão para ver o boletim.' using errcode = '42501';
  end if;
  select * into v_c from public.mc_contratos where id = p_contrato and excluido_em is null;
  if not found or not public.fn_mc_acessa_contrato(p_contrato) then
    raise exception 'Contrato não encontrado.' using errcode = 'P0002';
  end if;
  v_valor := v_c.regra_arredondamento is not null;
  select * into v_versao from public.mc_planilha_versoes
   where contrato_id = p_contrato and status = 'vigente' and excluido_em is null
   order by numero desc limit 1;
  select max(numero) into v_ultima from public.mc_medicoes where contrato_id = p_contrato;
  if p_ate is not null and (v_ultima is null or p_ate < 1 or p_ate > v_ultima) then
    raise exception 'A %ª medição não existe no contrato %.', p_ate, v_c.codigo using errcode = 'P0002';
  end if;
  v_ate := coalesce(p_ate, v_ultima);

  with med as (
    select mi.item_id, mi.numero, mi.qtd_efetiva, mi.valor_medicao
    from public.mc_v_medicao_itens mi
    where mi.contrato_id = p_contrato and mi.numero <= coalesce(v_ate, 0)
  ), por_item as (
    select item_id,
           jsonb_object_agg(numero::text, qtd_efetiva::text) as qtds,
           coalesce(sum(valor_medicao) filter (where numero = v_ate), 0) as valor_n,
           coalesce(sum(valor_medicao), 0) as acumulado
    from med group by item_id
  ), linhas as (
    select l.* from public.mc_v_planilha_linhas l where l.versao_id = v_versao.id
  ), sub as (
    select s.ancestral_id as id, sum(l.valor_previsto) as previsto,
           sum(coalesce(p.valor_n, 0)) as valor_n, sum(coalesce(p.acumulado, 0)) as acumulado
    from public.mc_v_planilha_subarvore s
    join linhas l on l.id = s.linha_id and l.tipo = 'servico'
    left join por_item p on p.item_id = l.item_id
    group by s.ancestral_id
  ), valores as (
    select l.*, p.qtds,
           round(case when l.tipo = 'servico' then l.valor_previsto else coalesce(s.previsto, 0) end, 2) as prev,
           round(case when l.tipo = 'servico' then coalesce(p.valor_n, 0) else coalesce(s.valor_n, 0) end, 2) as vn,
           round(case when l.tipo = 'servico' then coalesce(p.acumulado, 0) else coalesce(s.acumulado, 0) end, 2) as ac
    from linhas l
    left join sub s on s.id = l.id
    left join por_item p on p.item_id = l.item_id and l.tipo = 'servico'
  ), fora as (
    select p.*, u.codigo, u.descricao, u.unidade
    from por_item p
    cross join lateral (
      select pi.codigo, pi.descricao, pi.unidade from public.mc_planilha_itens pi
      join public.mc_planilha_versoes v on v.id = pi.versao_id
      where pi.item_id = p.item_id order by v.numero desc limit 1) u
    where not exists (select 1 from linhas l where l.item_id = p.item_id)
  ), tot as (
    select round((select sum(valor_previsto) from linhas where tipo = 'servico'), 2) as prev,
           round(coalesce((select sum(valor_n) from por_item), 0), 2) as vn,
           round(coalesce((select sum(acumulado) from por_item), 0), 2) as ac
  )
  select jsonb_build_object(
    'contrato', jsonb_build_object('id', v_c.id, 'codigo', v_c.codigo, 'nome_obra', v_c.nome_obra,
      'numero_contrato', v_c.numero_contrato, 'contratante_nome', v_c.contratante_nome,
      'regra_arredondamento', v_c.regra_arredondamento),
    'versao', case when v_versao.id is null then null else jsonb_build_object('id', v_versao.id,
      'numero', v_versao.numero, 'vigente_desde', v_versao.vigente_desde) end,
    'ate', v_ate,
    'medicoes', coalesce((select jsonb_agg(jsonb_build_object('id', m.id, 'numero', m.numero,
        'periodo_inicio', m.periodo_inicio, 'periodo_fim', m.periodo_fim, 'status', m.status,
        'valor', t.valor::text) order by m.numero)
      from public.mc_medicoes m join public.mc_v_medicao_totais t on t.medicao_id = m.id
      where m.contrato_id = p_contrato), '[]'::jsonb),
    'linhas', coalesce((select jsonb_agg(jsonb_build_object('id', x.id, 'ordem', x.ordem, 'codigo', x.codigo,
        'pai_id', x.pai_id, 'nivel', x.nivel, 'descricao', x.descricao, 'unidade', x.unidade, 'tipo', x.tipo,
        'item_id', x.item_id, 'preco_unitario', x.preco_unitario::text,
        'quantidade_prevista', x.quantidade_prevista::text, 'qtds', coalesce(x.qtds, '{}'::jsonb),
        'previsto', case when v_valor then x.prev::text end,
        'valor_medicao', case when v_valor then x.vn::text end,
        'acumulado', case when v_valor then x.ac::text end,
        'saldo', case when v_valor then (x.prev - x.ac)::text end,
        'pct_executado', case when v_valor and x.prev <> 0 then (x.ac / x.prev)::text end,
        'pct_a_medir', case when v_valor and x.prev <> 0 then ((x.prev - x.ac) / x.prev)::text end)
        order by x.ordem) from valores x), '[]'::jsonb),
    'fora_da_versao', coalesce((select jsonb_agg(jsonb_build_object('item_id', f.item_id, 'codigo', f.codigo,
        'descricao', f.descricao, 'unidade', f.unidade, 'qtds', f.qtds,
        'valor_medicao', case when v_valor then round(f.valor_n, 2)::text end,
        'acumulado', case when v_valor then round(f.acumulado, 2)::text end) order by f.codigo)
      from fora f), '[]'::jsonb),
    'total', (select jsonb_build_object(
        'previsto', case when v_valor then coalesce(t.prev, 0)::text end,
        'valor_medicao', case when v_valor then t.vn::text end,
        'acumulado', case when v_valor then t.ac::text end,
        'saldo', case when v_valor then (coalesce(t.prev, 0) - t.ac)::text end,
        'pct_executado', case when v_valor and coalesce(t.prev, 0) <> 0 then (t.ac / t.prev)::text end,
        'pct_a_medir', case when v_valor and coalesce(t.prev, 0) <> 0 then ((t.prev - t.ac) / t.prev)::text end)
      from tot t))
  into v_res;
  return v_res;
end $$;

-- Painel: um contrato por linha, da lista do usuário. Total consolidado = soma dos valores já
-- arredondados de cada contrato; contrato com regra nula fica fora das somas.
create or replace function public.fn_mc_painel(p_status text[] default null, p_tipos text[] default null)
returns jsonb language plpgsql stable security invoker set search_path to '' as $$
declare v_res jsonb;
begin
  if not public.tem_permissao('medicao.painel', 'ver') then
    raise exception 'Sem permissão para ver o painel.' using errcode = '42501';
  end if;
  with c as (
    select c.* from public.mc_contratos c
    where c.excluido_em is null and c.id in (select public.fn_mc_meus_contratos())
      and (p_status is null or c.status = any(p_status))
      and (p_tipos is null or c.contratante_tipo = any(p_tipos))
  ), v as (
    select distinct on (pv.contrato_id) pv.contrato_id, pv.id, pv.numero
    from public.mc_planilha_versoes pv join c on c.id = pv.contrato_id
    where pv.status = 'vigente' and pv.excluido_em is null
    order by pv.contrato_id, pv.numero desc
  ), ac as (
    select mi.contrato_id, round(coalesce(sum(mi.valor_medicao), 0), 2) as acumulado
    from public.mc_v_medicao_itens mi join c on c.id = mi.contrato_id group by mi.contrato_id
  ), ult as (
    select distinct on (m.contrato_id) m.contrato_id, m.numero, m.status, m.periodo_inicio, m.periodo_fim, t.valor
    from public.mc_medicoes m join c on c.id = m.contrato_id
    join public.mc_v_medicao_totais t on t.medicao_id = m.id
    order by m.contrato_id, m.numero desc
  ), qtd as (
    select m.contrato_id, count(*) as medicoes from public.mc_medicoes m join c on c.id = m.contrato_id group by m.contrato_id
  ), l as (
    select c.id, c.codigo, c.nome_obra, c.contratante_nome, c.contratante_tipo, c.status, v.numero as versao_numero,
           c.regra_arredondamento is not null as tem_valor,
           case when c.regra_arredondamento is not null then coalesce(vt.total_previsto, 0) end as previsto,
           case when c.regra_arredondamento is not null then coalesce(ac.acumulado, 0) end as acumulado,
           coalesce(qtd.medicoes, 0) as medicoes,
           ult.numero as corrente_numero, ult.status as corrente_status, ult.periodo_inicio, ult.periodo_fim,
           case when c.regra_arredondamento is not null then ult.valor end as corrente_valor
    from c
    left join v on v.contrato_id = c.id
    left join public.mc_v_versao_totais vt on vt.versao_id = v.id
    left join ac on ac.contrato_id = c.id
    left join ult on ult.contrato_id = c.id
    left join qtd on qtd.contrato_id = c.id
  )
  select jsonb_build_object(
    'contratos', coalesce(jsonb_agg(jsonb_build_object('id', l.id, 'codigo', l.codigo, 'nome_obra', l.nome_obra,
        'contratante_nome', l.contratante_nome, 'contratante_tipo', l.contratante_tipo, 'status', l.status,
        'versao_numero', l.versao_numero, 'previsto', l.previsto::text, 'acumulado', l.acumulado::text,
        'saldo', (l.previsto - l.acumulado)::text,
        'pct_executado', case when l.previsto <> 0 then (l.acumulado / l.previsto)::text end,
        'medicoes', l.medicoes,
        'corrente', case when l.corrente_numero is null then null else jsonb_build_object('numero', l.corrente_numero,
          'status', l.corrente_status, 'periodo_inicio', l.periodo_inicio, 'periodo_fim', l.periodo_fim,
          'valor', l.corrente_valor::text) end) order by l.codigo), '[]'::jsonb),
    'total', jsonb_build_object(
        'previsto', coalesce(sum(l.previsto) filter (where l.tem_valor), 0)::text,
        'acumulado', coalesce(sum(l.acumulado) filter (where l.tem_valor), 0)::text,
        'saldo', coalesce(sum(l.previsto - l.acumulado) filter (where l.tem_valor), 0)::text,
        'pct_executado', case when coalesce(sum(l.previsto) filter (where l.tem_valor), 0) <> 0
          then (sum(l.acumulado) filter (where l.tem_valor) / sum(l.previsto) filter (where l.tem_valor))::text end,
        'corrente', coalesce(sum(l.corrente_valor) filter (where l.tem_valor), 0)::text))
  into v_res from l;
  return v_res;
end $$;

revoke all on function public.fn_mc_boletim(uuid, integer) from public, anon;
revoke all on function public.fn_mc_painel(text[], text[]) from public, anon;
grant execute on function public.fn_mc_boletim(uuid, integer) to authenticated;
grant execute on function public.fn_mc_painel(text[], text[]) to authenticated;
```

  Colunas conferidas no banco vivo (`excluido_em` em `mc_contratos` e `mc_planilha_versoes`). O plano de execução do Lote 09 deve ficar abaixo de 1 s (`explain analyze` impersonando o Tiago); se passar, filtrar `mc_v_medicao_itens` por contrato antes da janela.
- [ ] **Step 4:** aplicar por `apply_migration` (nome `mc_fase3a_boletim_painel`), ler a versão real em `schema_migrations`, gravar o arquivo com essa versão e com o texto **idêntico** ao aplicado. Advisors (`security` e `performance`) sem aviso novo.
- [ ] **Step 5:** rodar a prova: todos os casos com o esperado, controle 3k DIFERENTE, termina em `PROVA` + aborto. Mutação: trocar em `fn_mc_boletim` o acumulado do total para soma dos grupos arredondados (numa cópia só dentro da transação da prova, `create or replace` antes dos casos) e ver 3b falhar (50,50 ≠ 50,51); desfazer.
- [ ] **Step 6:** atualizar `src/lib/database.types.ts` (MCP `generate_typescript_types`, só as entradas novas de `Functions`; não reescrever o arquivo inteiro se o diff trouxer ruído de outros módulos). Commit `Medição Fase 3a: RPCs do boletim e do painel (aplicadas) + prova`.

### Task 4: Recursos `medicao.painel` e `medicao.boletim` + backfill

**Files:**
- Modify: `src/config/recursos.ts` (acrescentar antes de `medicao.contratos` o painel e depois de `medicao.planilha` o boletim)
- Modify: `src/modules/medicao/_shared/recursos.test.ts`
- Modify: `src/app/(app)/medicao/page.tsx` (tirar o comentário "A Fase 1 não tem painel"; o redirecionamento para a primeira aba visível já leva ao painel)
- Create: `supabase/migrations/<versão real>_mc_fase3b_permissoes.sql`

**Interfaces:**
- Produces: `{ id: "medicao.painel", nome: "Painel", modulo: "medicao", acoes: ["ver"], rota: "/medicao/painel" }` e `{ id: "medicao.boletim", nome: "Boletim", modulo: "medicao", acoes: ["ver"], rota: "/medicao/boletim" }` (copiar a forma exata das entradas vizinhas em `recursos.ts:575-587`).

- [ ] **Step 1:** teste em `recursos.test.ts`: abas do módulo `medicao` na ordem Painel, Contratos, Planilha, Boletim; painel e boletim só com `ver`. Rodar: FAIL.
- [ ] **Step 2:** acrescentar as entradas; teste PASSA.
- [ ] **Step 3: migration**, no molde de `20260926150625_mc_fase1f_permissoes.sql`, com as ações `('medicao.painel','ver'), ('medicao.boletim','ver')` para o perfil Admin e os Admins ativos, e o `$confere$`: `count(distinct usuario_id) = 4` e `count(*) = 44` em `usuario_permissoes where recurso like 'medicao.%'`. Aplicar por `apply_migration`; arquivo com a versão real. As abas só aparecem quando o código com `recursos.ts` estiver no ar, então aplicar antes do deploy não abre link morto.
- [ ] **Step 4:** conferir no banco: 4 Admins × 11 = 44. Commit `Medição Fase 3b: recursos painel e boletim, backfill dos 4 Admins`.

### Task 5: Tela do Boletim

**Files:**
- Create: `src/modules/medicao/boletim/tipos.ts`, `src/modules/medicao/boletim/queries.ts`, `src/modules/medicao/boletim/arvore.ts`, `src/modules/medicao/boletim/arvore.test.ts`
- Create: `src/modules/medicao/boletim/components/boletim-tabela.tsx`, `src/modules/medicao/boletim/components/seletor-boletim.tsx`
- Create: `src/app/(app)/medicao/boletim/page.tsx`, `src/app/(app)/medicao/boletim/loading.tsx`

**Interfaces:**
- Produces `tipos.ts`: `Boletim`, `LinhaBoletim`, `MedicaoBoletim`, `TotalBoletim`, `ItemForaDaVersao` espelhando o jsonb da Task 3 (numeric como `string | null`).
- Produces `queries.ts`: `export async function carregarBoletim(contratoId: string, ate: number | null): Promise<{ boletim: Boletim | null; erro: string | null }>` (chama `supabase.rpc("fn_mc_boletim", { p_contrato, p_ate })`; erro da RPC vira `erro` com a mensagem do banco).
- Produces `arvore.ts`: `export type NoBoletim = LinhaBoletim & { filhos: NoBoletim[] }` e `export function montarArvoreBoletim(linhas: LinhaBoletim[]): NoBoletim[]` (por `pai_id`, na ordem de `ordem`; pai inexistente → raiz). Não mexe em número nenhum.

- [ ] **Step 1:** teste de `montarArvoreBoletim` (3 níveis, código repetido `02.01` duas vezes como irmãos, ordem preservada, pai ausente vira raiz). FAIL → implementar → PASS.
- [ ] **Step 2: página** `/medicao/boletim?contrato=<id>&ate=<n>`:
  - guarda: `getUsuarioLogado` + `temPermissao(usuario, "medicao.boletim", "ver")`, senão `notFound()` (igual `planilha/page.tsx`).
  - `SeletorBoletim`: `FilterBar` com o seletor de contrato (reusar `SeletorContrato` de `planilha/components/versoes-tabela.tsx`; se ele estiver preso à planilha, mover para `src/modules/medicao/_shared/seletor-contrato.tsx` e ajustar o import da planilha) e `FiltroSelect` "Até a medição" com as medições do boletim (`1ª (01/11 a 30/11/2025)`…; vazio = última), mais `FiltroSelect` "Grupo" com os títulos de nível 1. Tudo na URL (`useFiltrosUrl().setMuitos`).
  - sem contrato: `EmptyState` "Escolha o contrato". Erro da RPC: mensagem do banco num `EmptyState`.
  - `GradeKpis` com `KPICard`: Previsto, Acumulado até a Nª, % executado, Saldo a medir, "Nª medição" (valor + período + status em rótulo). Todos com `MoneyText` do `total` da RPC.
  - `BoletimTabela` (client): `DataTable` com `subLinhas={(n) => n.filhos.length ? n.filhos : undefined}`, `idTabela="medicao.boletim.linhas"`, `searchKey` na descrição+código (coluna oculta de busca, se o `DataTable` pedir), colunas Item (com `CelulaArvore`), Discriminação, Unid., Preço Unitário (`numeroExibicao`), Qtd Prevista Total (`numeroExibicao`), Valor Previsto Total, uma coluna por medição 1..N (`numeroExibicao` de `qtds[n]`, vazio quando não há), Valor na Nª, Acumulado, % Executada, Saldo a Medir, % a Medir. Todas as de número com `meta.alinharDireita` e `tabular-nums`; títulos em negrito. `rodape` com o `total` da RPC ("Total do contrato").
  - filtro por grupo só escolhe qual raiz mostrar; rodapé e cartões continuam do contrato (nota "Totais do contrato" ao lado do filtro quando houver grupo).
  - `fora_da_versao` não vazio: aviso acima da tabela "N itens medidos fora da versão vigente (vN)" com a lista (código, descrição, acumulado).
  - `%` exibido com 2 casas (`Intl.NumberFormat("pt-BR", { style: "percent", minimumFractionDigits: 2, maximumFractionDigits: 2 })`, conversão de texto só para exibir).
- [ ] **Step 3:** teste de componente de `BoletimTabela` com um boletim pequeno (o K da Task 3, até a 2ª): o `01.01` mostra a quantidade `1,5` na coluna "2ª" e `R$ 0,50` em "Valor na 2ª"; o rodapé mostra `R$ 61,01`; buscar `01.02.01` mantém `01` e `01.02`. Rodar: PASS.
- [ ] **Step 4:** `npm run typecheck`, lint, testes. Commit `Medição: tela do Boletim (só leitura, em árvore)`.

### Task 6: Tela do Painel

**Files:**
- Create: `src/modules/medicao/painel/tipos.ts`, `src/modules/medicao/painel/queries.ts`, `src/modules/medicao/painel/components/painel-tabela.tsx`, `src/modules/medicao/painel/components/painel-filtros.tsx`
- Create: `src/app/(app)/medicao/painel/page.tsx`, `src/app/(app)/medicao/painel/loading.tsx`
- Test: `src/modules/medicao/painel/components/painel-tabela.test.tsx`

**Interfaces:**
- Produces `queries.ts`: `export async function carregarPainel(filtros: { status: string[]; tipos: string[] }): Promise<{ painel: Painel | null; erro: string | null }>` (RPC `fn_mc_painel`, arrays vazios viram `null`).

- [ ] **Step 1:** página com guarda `medicao.painel/ver`; `FilterBar` com `FiltroSelectMulti` Status (`ativo | paralisado | encerrado`, rótulos de `_shared/rotulos.ts`) e Tipo de contratante (`federal | estadual | municipal | privado`), na URL.
- [ ] **Step 2:** `GradeKpis`: Previsto, Acumulado, % executado, Saldo, Medição corrente (soma), do `total` da RPC.
- [ ] **Step 3:** `PainelTabela`: colunas Contrato (código + obra), Contratante, Status, Previsto, Acumulado, % executado, Saldo, Medição corrente (Nª, período, status e valor). `rodape` = total consolidado. Clique na linha → `/medicao/boletim?contrato=<id>`. Contrato com regra nula: valores "—" e nota "Sem regra de arredondamento".
- [ ] **Step 4:** teste de componente: 2 contratos, rodapé com o total da RPC (não soma no TS: o teste passa um `total` que NÃO é a soma das linhas e confere que o rodapé mostra o `total`), clique navega. Rodar: PASS.
- [ ] **Step 5:** commit `Medição: tela do Painel de contratos`.

### Task 7: Export xlsx do boletim

**Files:**
- Create: `src/modules/medicao/boletim/planilha.ts`, `src/modules/medicao/boletim/planilha.test.ts`
- Create: `src/modules/medicao/boletim/actions.ts`, `src/modules/medicao/boletim/components/botao-exportar-boletim.tsx`
- Create: `src/modules/medicao/boletim/exportar-local.test.ts` (só roda com `MC_BOLETIM_JSON`)
- Modify: `src/app/(app)/medicao/boletim/page.tsx` (botão no cabeçalho da página, como no Financeiro)

**Interfaces:**
- Produces `planilha.ts`: `export async function montarPlanilhaBoletim(boletim: Boletim): Promise<ExcelJS.Workbook>` e `export const COLUNAS_FIXAS_BOLETIM = 6`.
- Produces `actions.ts`: `export async function gerarPlanilhaBoletim(contratoId: string, ate: number | null): Promise<{ base64: string; nomeArquivo: string } | { erro: string }>` (`exigirPermissao("medicao.boletim", "ver")`, `carregarBoletim`, `await import("./planilha")`, `writeBuffer`). Nome: `boletim-<codigo>-ate-<N>a-medicao.xlsx`.

Layout (uma aba "Boletim"):
- `escreverCabecalhoMarca(workbook, ws, { titulo: "Boletim de medição", colunas })` (linhas 1-5), depois uma linha de contexto: `Contrato <codigo> · CT <numero_contrato> · <nome_obra> · Até a <N>ª medição (<periodo>) · Planilha v<versao>`.
- Cabeçalho: `Item | Discriminação | Unid. | Preço Unitário | Quantidade Prevista Total | Valor (R$) Previsto Total | 1ª Medição … Nª Medição | Valor (R$) Executado na Nª Medição | Valor (R$) Executado Acumulado | Porcentagem Executada (%) | Saldo a Medir (R$) | Porcentagem a Medir (%)`, com `estilizarCabecalhoColunas`.
- Uma linha por linha do boletim, na ordem; código e descrição como texto; preço, quantidade e quantidades por medição como número (`Number(texto)`: o texto veio de double do xlsx, então volta ao mesmo double), `numFmt` `#,##0.00########`; dinheiro como número a partir do texto de 2 casas, `numFmt` `"R$" #,##0.00`; % como número, `0.00%`. Títulos em negrito com preenchimento claro (cor de `CORES_MARCA`). Célula de medição sem quantidade fica vazia.
- Linha "Total:" com o `total` da RPC (valores, não fórmula: o número é o do banco).
- Itens fora da versão (se houver) depois do total, sob a linha "Itens medidos fora da versão vigente".
- `views: [{ state: "frozen", xSplit: 2, ySplit: <linha do cabeçalho> }]`; larguras de coluna fixas por tipo. Tudo a partir de `linhaHeader.number`, nunca de constante.

- [ ] **Step 1: testes que falham** (`planilha.test.ts`, padrão de `financeiro/lancamentos/planilha.test.ts` "arquivo relido": gerar buffer e reler com exceljs):
  - com o boletim K até a 2ª: cabeçalho na linha 7 (5 de marca + contexto), 2 colunas de medição, célula "Valor na 2ª" do `01.01` = 0.5 (número), acumulado do total = 61.01, linha de total presente, `01.02.01` quantidade da 2ª = 1, célula da 1ª vazia para `01.02.01`.
  - boletim até a 1ª: 1 coluna de medição e o cabeçalho "Valor (R$) Executado na 1ª Medição".
  - preço `21154.63583333333` relido é `21154.63583333333` (igualdade de double), quantidade `102.34700000000001` idem.
  - logo embutida e `LINHAS_CABECALHO_MARCA` respeitados (como o teste do Financeiro).
- [ ] **Step 2:** rodar: FAIL. **Step 3:** implementar. **Step 4:** PASS; mutação: escrever o dinheiro com `Math.round(x)` e ver o teste do 0.5 falhar; desfazer.
- [ ] **Step 5:** `exportar-local.test.ts`: `it.runIf(process.env.MC_BOLETIM_JSON)("gera o xlsx a partir do JSON da RPC", ...)` lê o JSON (`fs`), chama `montarPlanilhaBoletim` e grava em `process.env.MC_BOLETIM_XLSX`. Sem a variável o teste é pulado (CI não roda).
- [ ] **Step 6:** botão (`botao-exportar-boletim.tsx`, molde de `botao-exportar-lancamentos.tsx`) no cabeçalho da página do boletim, desabilitado sem contrato. Commit `Medição: export xlsx do boletim`.

### Task 8: Conferência célula a célula contra a planilha oficial

**Files:**
- Create: `scripts/migracao-medicao/conferir_export_lote09.py`, `scripts/migracao-medicao/test_conferir_export_lote09.py`
- Modify: `scripts/migracao-medicao/README.md` (seção "Conferência do export")

**Interfaces:**
- Consumes: o xlsx oficial (`Medicao_Teste_3_ATUALIZADA_v12_NOVO.xlsx`, sha256 `2a29e7473cca3e057a700a91c58d8d992e89ea42e2c74a094d1f3e59121fcb0b`, aba `Planilha de Medição`, linhas 15 a 279, total na 280) e o xlsx exportado (Task 7).
- Produces: `python3 conferir_export_lote09.py <oficial.xlsx> <exportado.xlsx>` imprime um relatório e sai com 1 se houver diferença não explicada. Relatório em `_retrato/conferencia_export.txt`.

Regras da conferência (linha oficial r ↔ linha exportada de mesma ordem; oficial lido com `data_only=True`, números por `Decimal(repr(v))`):
- B código (texto igual; exceção explicada: linha 20 `02.02` → `02.02.01`), C descrição (igual, aparada), E unidade (aparada).
- F preço, G quantidade prevista, I..R quantidades da 1ª à 10ª: **o mesmo double** (vazio oficial = 0 ou vazio exportado). S..AR do oficial: todos vazios ou zero (senão acusa).
- H, AS (10ª), AT: `round_half_up(oficial, 2) == exportado`, em serviços e títulos.
- AU, AW: `|oficial − exportado| < 0.00005` (a tela mostra 2 casas de %); diferença acima disso é listada.
- AV saldo: exportado == `round(H,2) − round(AT,2)` do oficial (a regra do Tiago); a diferença contra o AV oficial (`TRUNC(H−AT,3)`) é **explicada** e contada à parte, com a soma (no total: 207.385.821,63 contra ,72).
- Linha 280 contra a linha "Total:" exportada: H 243927483.49, AS 680738.27, AT 36541661.77, AV (explicada), AU, AW.
- Contagem: 265 linhas casadas, 0 diferença não explicada.

- [ ] **Step 1: teste** (`unittest` da stdlib, como `test_gerar_carga_lote09.py`): monta com openpyxl dois arquivos mínimos em `tempfile` (3 linhas + total, no layout de colunas de cada um) e confere: iguais → 0 diferenças; exportado com 1 centavo a mais no AT de uma linha → 1 diferença citando linha e coluna; exportado com o saldo pela conta direta e o oficial com TRUNC → 0 não explicadas, 1 explicada. FAIL → implementar → PASS.
- [ ] **Step 2: rodar contra o Lote 09 de produção**:
  1. Pegar o jsonb: `supabase db query --linked` (como `carregar_staging_lote09.py`) numa transação `begin; set local role authenticated; set local request.jwt.claims = '{"sub":"c66fca9f-5428-4fb9-855f-dcff548764df","role":"authenticated"}'; select public.fn_mc_boletim('<id do L09>'); rollback;` e salvar em `scripts/migracao-medicao/_retrato/boletim_l09.json`. Se o CLI não devolver só o resultado do select, usar o MCP `execute_sql` e salvar a saída.
  2. `MC_BOLETIM_JSON=.../boletim_l09.json MC_BOLETIM_XLSX=.../_retrato/boletim_l09.xlsx npx vitest run src/modules/medicao/boletim/exportar-local.test.ts`.
  3. `python3 scripts/migracao-medicao/conferir_export_lote09.py ~/Downloads/Medicao_Teste_3_ATUALIZADA_v12_NOVO.xlsx scripts/migracao-medicao/_retrato/boletim_l09.xlsx`.
  Esperado: 0 diferença não explicada. Se aparecer qualquer uma: **parar e mostrar ao Tiago** (não ajustar regra para fechar).
- [ ] **Step 3:** mutação: editar à mão uma célula do `boletim_l09.xlsx` (AT de uma linha + 0,01) e ver o conferidor acusar; regenerar.
- [ ] **Step 4:** commit (sem `_retrato/`) `Medição: conferência célula a célula do export do boletim`.

### Task 9: Fechamento: docs, PR, merge, deploy, conferência em produção

**Files:**
- Modify: `docs/superpowers/specs/2026-09-25-medicao-contratos-design.md` (emendas 27/09: regras de exibição da seção "Regras de cálculo" deste plano; Q8 "Item medido que saiu num aditivo: entra no acumulado do total com previsto da versão nova?" em aberto, bloqueia Fase 5)
- Modify: `docs/decisoes.md` (entrada 2026-09-27: Fase 3; exibição com 15 significativos; serviço com filhos mostra só os próprios valores; boletim "até a Nª"; reajuste e pendências fora do painel até as Fases 5 e 6)
- Modify: `/Users/tiagocameli/Desktop/personal-os/vault/projects/erp-emt/status.md` e `vault/log.md`

- [ ] **Step 1:** portão completo: `npm run typecheck`, `npm run lint`, `npx vitest run`, `npm run build`; prova da Task 3 de novo no banco vivo; advisors.
- [ ] **Step 2:** revisão final do branch inteiro (subagente revisor).
- [ ] **Step 3:** push, PR "Medição Fase 3: Painel, Boletim e export conferido", corpo com os números conferidos e a conferência do export; CI verde; merge (merge commit); acompanhar o deploy de produção até `success`.
- [ ] **Step 4:** conferir em produção no navegador: `/medicao/painel` (L09 com previsto 243.927.483,49, acumulado 36.541.661,77, saldo 207.385.821,72, 10ª R$ 680.738,27), `/medicao/boletim?contrato=<L09>` (árvore, `02.07.05.01` com `102,347`, rodapé com os totais, "até a 9ª" muda colunas e totais), botão de export presente. Atualizar status e log do vault.
