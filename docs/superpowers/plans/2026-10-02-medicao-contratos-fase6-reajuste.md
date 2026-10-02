# Medição de Contratos, Fase 6 (reajuste do DNIT): plano de implementação

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development. Steps use checkbox (`- [ ]`) syntax.

**Goal:** Registrar em cada medição o reajuste que o DNIT calculou (relatório SIAC "Resumo da Medição" em PDF, ou lançamento manual quando não há relatório), ratear o reajuste de cada linha do SIAC entre os nossos itens e mostrá-lo no detalhe da medição, no Boletim (por item e grupo, com export), no Painel, nos alertas e numa aba própria. O módulo não calcula reajuste.

**Architecture:** O servidor lê o texto do PDF com `unpdf` (pdf.js, posição de cada pedaço), monta o relatório (cabeçalho, índices, grupos com SUBTOTAL, linhas, SOMA) e confere as somas em BigInt. O de-para (linha SIAC → itens nossos) é sugerido em TS e confirmado na prévia. O dinheiro é do banco (D7): a RPC `fn_mc_reajuste_importar` confere de novo contrato, medição, status e somas, faz o rateio exato ao centavo (`fn_mc_ratear`, `div()` inteiro) e devolve a prévia (`p_gravar = false`) ou grava tudo numa transação (`p_gravar = true`), como `fn_mc_lancamentos_colar`. Vale o último relatório não excluído (`mc_v_reajuste_medicao`); o rateio fica em `mc_reajuste_rateio` e chega ao Boletim por `mc_v_reajuste_itens`.

**Tech Stack:** Supabase Postgres 17 (MCP `apply_migration` / `execute_sql`), Next.js App Router, canônicos do repo, vitest 4, `unpdf` 1.8.1 (dependência nova).

**Spec:** `docs/superpowers/specs/2026-09-25-medicao-contratos-design.md`, emenda de 02/10/2026 na fase 6 da seção 13 (substitui o cálculo da seção 5.5).

## Decisões do Tiago (02/10/2026)

1. Importar o PDF do SIAC no detalhe da medição (enviada ou aprovada). O servidor lê cabeçalho, tabela I0/I1/K e linhas (grupo SIAC, código SICRO, descrição, unidade, preço, valor a PI líquido, fator, reajuste). Recusa com o motivo se o contrato (`mc_contratos.numero_contrato`) ou o número da medição não batem, ou se as linhas não somam os SUBTOTAIS e o total. Linha com valor a PI líquido zero não entra.
2. De-para por contrato: (grupo SIAC, código SICRO) → um ou mais itens nossos. Sugerido no primeiro import (mesma unidade, preço a até 0,5%, grupo correspondente), confirmado ou corrigido na prévia, guardado e reaproveitado; o import seguinte só pergunta as linhas novas.
3. Rateio: o reajuste de cada linha é dividido entre os itens casados na proporção do valor deles na medição; o centavo que sobra vai para o maior item; a soma é exatamente a do DNIT. Itens casados sem valor na medição: o usuário escolhe o item que recebe a linha inteira. A prévia mostra, por linha, o valor a PI do DNIT ao lado do nosso (só conferência). O rateio é gravado no import (exceção consciente à D6).
4. Provisório e definitivo: vários relatórios por medição; vale o último não excluído; diferença para o anterior como a receber (+) ou a devolver (−); histórico com o PDF anexado (anexo canônico de tipo novo, travado pelo contrato como `mc_lancamento`). Excluir relatório exige motivo.
5. Lançamento manual (Obra 012 e qualquer contrato sem SIAC): total, situação, anexo, observação, sem rateio por item.
6. Onde aparece: seção Reajuste no detalhe da medição; Boletim com "Reajuste na medição" e "Reajuste acumulado" por item e grupo (soma do rateio; o manual conta só no total e no cartão), cartão "Reajuste acumulado" e as colunas no xlsx; Painel com reajuste acumulado por contrato e no total; alertas "medição aprovada sem reajuste" (contrato com reajuste, início do período ≥ `data_base` + `periodicidade_meses`) e "reajuste provisório" (o que vale é provisório). Contrato ganha a seção Reajuste (tem reajuste, data-base em mês, índice em texto) em `mc_reajuste_config` com uma coluna nova de texto para o índice.
7. Recurso `medicao.reajuste` com ver e editar para os 4 Admins (molde da Fase 5b).
8. As tabelas do cálculo antigo ficam vazias e sem uso. Fora do escopo: qualquer cálculo de reajuste.
9. Gravação atômica por RPC `security definer` (molde `fn_mc_exigir`), números como texto, o banco confere também (rateio de cada linha = reajuste da linha; linhas = total; medição enviada ou aprovada).

### Escolhas deste plano (fora da lista acima; o Tiago confirma na revisão)

- **E1. Rateio no SQL, não no TS.** `fn_mc_ratear(valor, itens[], pesos[])` dá a cada item `div(valor × 100 × peso, soma) / 100` (divisão inteira exata do Postgres, truncada em direção ao zero) e o que sobra, que pode ser mais de um centavo e tem o sinal do valor, vai para o item de maior peso (empate: o primeiro da lista). A prévia chama a mesma RPC com `p_gravar = false` (molde `fn_mc_lancamentos_colar`), então a tela mostra exatamente o que será gravado e o dinheiro continua só no banco (D7). Peso negativo conta como zero.
- **E2. Um item casado sem valor recebe a linha sozinho, sem pergunta.** Só com dois ou mais itens sem valor o usuário escolhe o destino. Caso real: SIAC 2,2/51269 (imprimação, R$ 85,46 a PI, reajuste 1,26) casa com o nosso 02.07.05, que não tem valor na 4ª do L09.
- **E3. A aba Reajuste (`/medicao/reajuste`).** Todo recurso do catálogo é uma aba do menu com rota (`RecursoDef.rota` obrigatória, teste "rotas são únicas"). `medicao.reajuste` vira a aba entre Medições e Boletim: lista as medições enviadas e aprovadas de cada contrato com a situação do reajuste (sem relatório, provisório, definitivo), o total e a diferença; o clique abre o detalhe da medição.
- **E4. O PDF é anexo da MEDIÇÃO** (`entidade_tipo = 'mc_reajuste'`, `entidade_id` = medição): o relatório só existe depois de gravado, e o fluxo canônico de anexo (preparar, subir direto ao Storage, confirmar com hash) precisa da entidade antes. O relatório guarda `arquivo_id` e o hash; `fn_desvincular_arquivo` recusa tirar o PDF de um relatório não excluído.
- **E5. A seção Reajuste do contrato grava com `medicao.reajuste/editar`** (não com `medicao.contratos/editar`), pela RPC `fn_mc_reajuste_config_salvar`; a periodicidade (padrão 12) também é editável.
- **E6. Período do relatório diferente do da medição é aviso, não recusa** (a decisão 1 recusa só contrato e número).
- **E7. "45 linhas":** o PDF real tem 45 linhas de serviço; 34 têm valor a PI líquido e entram; as 11 de zero ficam fora (decisão 1).
- **E8. Eventos na trilha da medição:** `reajuste` ("Relatório SIAC 2, índices definitivos: R$ -40.021,28") e `reajuste_excluido`.
- **E9. Manual:** valor digitado em `InputMoeda` mais o sentido (positivo/negativo), porque `normalizarNumeroDigitado` recusa sinal; anexo e observação opcionais.
- **E10. Fora deste plano:** o "demonstrativo de reajuste por medição" em xlsx (seção 9, tela 9) e a tela Índices (tela 7). O reajuste do Boletim e do Painel segue a regra do dinheiro do módulo: contrato sem regra de arredondamento mostra nulo.

## Regras (escritas e testadas no SQL da Task 1)

| Passo | Regra | RPC | Ação |
|---|---|---|---|
| Prévia do SIAC | medição enviada ou aprovada; contrato do cabeçalho contém o `numero_contrato` como palavra; nº da medição igual; situação dos índices provisório/definitivo; total e valor a PI com 2 casas; cada linha com grupo `n,n`, código SICRO só dígitos, descrição, unidade, valor a PI ≠ 0 e reajuste com 2 casas; itens casados são serviços do contrato, sem repetição; linhas = SUBTOTAL por grupo (valor a PI e reajuste); SUBTOTAIS = SOMA; devolve linhas com rateio, pendências, valor nosso e diferença para o anterior | `fn_mc_reajuste_importar(p_medicao, p_relatorio, false)` | editar |
| Gravar SIAC | tudo da prévia, sem pendência, PDF anexado à medição; grava relatório (sequência nº+1), índices, linhas, rateio e de-para (substitui o das linhas trazidas); confere no gravado rateio = linha e linhas = total; evento `reajuste` | `fn_mc_reajuste_importar(p_medicao, p_relatorio, true)` | editar |
| Manual | medição enviada ou aprovada; total com 2 casas (pode ser negativo ou zero); situação; anexo opcional (tem de ser `mc_reajuste` da medição); observação opcional; evento `reajuste` | `fn_mc_reajuste_manual(p_medicao, p_dados)` | editar |
| Excluir | motivo ≥ 3; uma vez; evento `reajuste_excluido`; vale de novo o anterior não excluído | `fn_mc_reajuste_excluir(p_id, p_motivo)` | editar |
| Configurar | tem reajuste (boolean); data-base `aaaa-mm` (obrigatória com reajuste); periodicidade 1..120 (padrão 12); índice em texto | `fn_mc_reajuste_config_salvar(p_contrato, p_dados)` | editar |
| Travas | relatório: nunca apaga; update só para excluir (uma vez); linhas, índices e rateio imutáveis; truncate recusado | triggers | |

Números conferidos antes de escrever o plano (a migration da Task 1 carregada num PGlite com stubs das tabelas e das views, mais o PDF real lido pelo código da Task 3; nada foi escrito no banco de produção):
contrato de teste K9 (`00999/2026`, 01.01 e 01.02 m³ a 10, 01.03 e 01.04 t a 5), 1ª enviada com 01.01 = 300,00 e 01.02 = 100,00. Relatório provisório com a linha 1,0/111 (reajuste 10,01, itens 01.01 + 01.02) e a 1,0/222 (−5,00, itens 01.03 + 01.04, os dois sem valor): a prévia dá 7,51 e 2,50 (sobra 1 centavo para o 01.01) e a 222 pendente ("Os itens casados não têm valor nesta medição: escolha o item que recebe a linha"); gravar recusa ("Escolha os itens que recebem o reajuste das linhas: 1,0 222"); com destino 01.04 grava 7,51 / 2,50 / −5,00 (total 5,01). Definitivo (12,00 e −4,00, total 8,00): 9,00 / 3,00 / −4,00, anterior 5,01, **diferença 2,99**; boletim da 1ª: total, grupo 01 e cartão 8,00, 01.01 = 9,00, 01.04 = −4,00; painel 8,00. Excluir sem motivo recusa; excluído o definitivo, vale o provisório (5,01, sem diferença). Manual −1.234,56 provisório na 2ª: boletim até a 2ª dá reajuste na medição −1.234,56, acumulado −1.229,55 e o grupo 01 só 5,01 (o manual não entra nas linhas). `fn_mc_ratear`: 1,00 em três pesos iguais = 0,34 / 0,33 / 0,33; −0,05 em dois iguais = −0,03 / −0,02; 10,01 em 300 e 100 = 7,51 / 2,50. **4ª do L09 real** (o PDF lido, os 245 serviços da v0 com o valor de cada um na 4ª, o de-para sugerido): 34 linhas, nenhuma pendência, rateio somando **−40.021,28** em 34 itens; 02.07.07.02 = −1.082,16; 04.03.02 = −95.030,34; 02.07.05 = 1,26; 08.01 = 3.268,58; valor nosso da linha 4,0/60112 = 539.028,27 contra 539.026,36 do DNIT; 34 linhas de de-para. Por grupo nosso: 01 = 211,80; 02 = 5.062,81 (2,2 + 2,5); 03 = 250,50; 04 = −48.781,32 (4,0 + 4,1); 07 = −33,65; 08 = 3.268,58. A 4ª nossa vale 2.615.053,13 contra 2.616.306,26 a PI do DNIT. Hash de `mc_v_medicao_itens` em 02/10/2026: L09 `e494e5b27f249ca93e8b6fcb821604ee`, L10 `55747138b02e631473d53a9f5b0eb3f2`; `medicao.%` = 84 linhas em 4 usuários; todas as `mc_reajuste_config` com `tem_reajuste = false`.

## Global Constraints

- Migration vai direto para produção: só mudança aditiva (tabelas novas, uma coluna nova, funções e views recriadas com as mesmas colunas; o jsonb do boletim e do painel só ganha chaves). Aplicar por `apply_migration`; arquivo com a versão REAL de `supabase_migrations.schema_migrations` e texto idêntico (md5). `db push` proibido.
- RPCs: `security definer`, `set search_path to ''`, revoke de public/anon, grant a authenticated; as internas (`fn_mc_ratear`, `fn_mc_brl`, triggers) sem grant. Advisors sem aviso novo (os índices de FK já estão na migration).
- Dinheiro só do banco (D7): o TS lê e confere texto em BigInt, nunca calcula o rateio nem soma dinheiro para exibir. Nenhuma escrita em outro módulo (D1). Nunca `z.uuid()`: `idSchema`.
- Backfill só para os 4 Admins ativos; `$confere$` com 4 usuários e **92** linhas `medicao.%` (23 × 4).
- Ninguém importa o relatório real por mim: a 4ª do L09 é importada pelo Tiago, pela tela. Testes no banco vivo só em transação desfeita. `mc_reajuste_config` de produção só muda pela tela.
- Canônicos obrigatórios (DataTable, FormDrawer, ConfirmDialog, Trilha, SecaoDetalhe, MoneyText, InputMoeda, Anexos, EmptyState, SeloMedicao, KPICard, FilterBar).
- Trabalho só no clone fora do iCloud: `/Users/tiagocameli/.claude/jobs/84e7ccda/tmp/erp` (branch `medicao-fase6-reajuste`). Nunca editar `.git` à mão. `node_modules` antigo: `npm ci` antes do primeiro `tsc`/`vitest`.
- Textos pt-BR com acentos, sem travessão (—). Commits com `Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>`.
- Portão: `npx tsc --noEmit`, `npm run lint` (0 erros), `npx vitest run`, `npm run build`, CI verde, provas das Fases 4, 5 e 6 no banco vivo, advisors. Depois merge, deploy, conferência na tela sem gravar.

## Review Focus

1. Centavo do rateio: a soma do rateio de cada linha é o reajuste da linha e a soma das linhas é o total do DNIT, exatamente (0,34/0,33/0,33; −0,03/−0,02; 7,51/2,50; L09 4ª = −40.021,28 em 34 itens). Prova 6f e 6g; mutação da Task 1 (sobra para o menor) tem de quebrar 6f.
2. PDF errado não entra: contrato, nº da medição, SUBTOTAL ou SOMA que não batem são recusados com o motivo, no TS (`conferirRelatorio`, teste "aponta linha que não soma") e no banco (prova 6d).
3. Provisório trocado por definitivo: vale o último não excluído, diferença +2,99; excluir volta ao anterior; relatório, linhas e rateio imutáveis. Prova 6c.
4. Boletim do L09 com o reajuste da 4ª: o executado não muda (36.541.661,77) e o reajuste fecha por grupo (02 = 5.062,81; 04 = −48.781,32; total −40.021,28). Prova 6h.
5. Itens de mesmo SICRO, unidade e preço em grupos diferentes não se confundem: 2,2/60112 → 02.07.07.02, 4,0/60112 → 04.03.02, 4,0/200134 → 04.04.02 (e não 04.03.03, a 0,27%). Teste `de-para.test.ts`.

---

### Task 1: SQL do reajuste + prova

**Files:**
- Create: `supabase/provas/mc_fase6_banco.sql`
- Create: `supabase/migrations/<versão real>_mc_fase6a_reajuste.sql`
- Modify: `src/lib/database.types.ts` (as 5 tabelas novas, a coluna `indice_descricao`, as views `mc_v_reajuste_medicao` e `mc_v_reajuste_itens`, as 4 RPCs com grant)

**Interfaces:**
- Produces as RPCs da tabela de regras e:
  - `mc_v_reajuste_medicao`: `medicao_id, contrato_id, numero, relatorio_id, sequencia, origem ('siac'|'manual'), situacao ('provisorio'|'definitivo'), total numeric, anterior_id, anterior_total, diferenca, relatorios bigint` (uma linha por medição que tem relatório não excluído).
  - `mc_v_reajuste_itens`: `medicao_id, contrato_id, numero, item_id, valor` (rateio do relatório que vale).
  - `fn_mc_reajuste_importar` devolve jsonb `{linhas: [{ordem, grupo, codigo, descricao, unidade, preco_unitario, valor_pi, fator, reajuste, itens: uuid[], destino, valor_nosso, rateio: [{item_id, valor_base, valor}], pendencia: text|null}], pendencias, total, valor_pi, situacao, medicao_valor, anterior: {id, sequencia, origem, situacao, total}|null, diferenca}` e, gravando, mais `relatorio_id, sequencia`. Todo número como texto.
  - `fn_mc_boletim`: cada linha e cada item fora da versão ganham `reajuste_medicao` e `reajuste_acumulado`; `total` ganha os dois; cada medição ganha `reajuste` e `reajuste_situacao`. `fn_mc_painel`: cada contrato e o `total` ganham `reajuste_acumulado`.
  - `mc_v_alertas`: tipos novos `medicao_sem_reajuste` (gravidade media; valor = nº da medição, referencia = aniversário aaaa-mm-dd, data = início do período) e `reajuste_provisorio` (baixa; valor = nº, referencia = total, data = início do período).
  - Anexo `mc_reajuste` → recurso `medicao.reajuste`, contrato da medição.

- [ ] **Step 1: prova** `supabase/provas/mc_fase6_banco.sql` no estilo de `supabase/provas/mc_fase5_banco.sql` (ler inteira; copiar os helpers `fn_mc_prova_planilha`, `fn_mc_prova_confere`, `fn_mc_prova_item`, `fn_mc_prova_hash`, `fn_mc_prova_fora` e o molde de recusa `begin ... exception when others then v_txt := 'recusou: ' || sqlerrm; end`). As permissões `medicao.reajuste` ver e editar do Tiago (`c66fca9f-5428-4fb9-855f-dcff548764df`) entram na transação com `on conflict do nothing` (o backfill é a Task 2, e a prova continua verde depois dele). Os payloads são montados como dono, antes do `set local role authenticated`. Helpers novos:

```sql
-- Arquivo + vínculo 'mc_reajuste' na medição (como dono), para a RPC aceitar o PDF.
create function public.fn_mc_prova_anexo(p_medicao uuid, p_nome text) returns uuid language plpgsql set search_path to '' as $$
declare v uuid;
begin
  insert into public.arquivos (path_storage, nome_original, tipo_mime, tamanho_bytes, hash_sha256)
  values ('prova/' || p_nome, p_nome, 'application/pdf', 1, md5(p_nome)) returning id into v;
  insert into public.anexo_vinculos (arquivo_id, entidade_tipo, entidade_id, origem) values (v, 'mc_reajuste', p_medicao, 'upload_direto');
  return v;
end $$;
-- p_relatorio a partir de linhas compactas [grupo, codigo, unidade, preco, valor_pi, fator, reajuste, código do nosso item]
-- e grupos [grupo, valor_pi, reajuste]; o item sai do código na versão vigente (fn_mc_prova_item).
create function public.fn_mc_prova_siac(p_contrato uuid, p_cab jsonb, p_linhas jsonb, p_grupos jsonb) returns jsonb
language sql stable set search_path to '' as $$
  select p_cab || jsonb_build_object(
    'indices', coalesce(p_cab -> 'indices', '[]'::jsonb),
    'linhas', (select jsonb_agg(jsonb_build_object('grupo', e ->> 0, 'codigo', e ->> 1, 'descricao', 'SICRO ' || (e ->> 1),
                 'unidade', e ->> 2, 'preco_unitario', e ->> 3, 'valor_pi', e ->> 4, 'fator', e ->> 5, 'reajuste', e ->> 6,
                 'itens', case when e ->> 7 is null then '[]'::jsonb else jsonb_build_array(public.fn_mc_prova_item(p_contrato, e ->> 7)) end)
                 order by o) from jsonb_array_elements(p_linhas) with ordinality as t(e, o)),
    'grupos', (select jsonb_agg(jsonb_build_object('grupo', g ->> 0, 'valor_pi', g ->> 1, 'reajuste', g ->> 2)) from jsonb_array_elements(p_grupos) g));
$$;
```

A 4ª real do L09 entra como literal (lida do PDF pelo código da Task 3; o teste `para-banco.test.ts` confere as mesmas 34 linhas):

```sql
-- [grupo, código SICRO, unidade, preço, valor a PI líquido, fator, reajuste, nosso item]
v_l09_linhas jsonb := '[
["1,0","55072","MES","21154.5250","4759.76","0.0445","211.80","01.01"],
["2,2","29083","T","3771.4474","320.57","-0.1487","-47.66","02.07.06.01"],
["2,2","51269","M²","0.4516","85.46","0.0148","1.26","02.07.05"],
["2,2","60112","T","5641.7149","6138.18","-0.1763","-1082.16","02.07.07.02"],
["2,2","86522","M³","14.4634","136.85","0.0148","2.02","02.07.01"],
["2,2","90224","M³","7.7817","1202.56","0.0073","8.77","02.07.02"],
["2,2","93793","M³","460.1313","7100.28","0.0073","51.83","02.07.09"],
["2,2","200134","T","2489.9519","211.64","0.0148","3.13","02.07.06.02"],
["2,2","201005","T","2496.5651","2716.26","0.0148","40.20","02.07.07.03"],
["2,2","290300","M³","212.3887","2954.53","0.0148","43.72","02.07.03"],
["2,2","322022","M²","0.3358","63.54","0.0148","0.94","02.07.06"],
["2,2","517556","T","338.2865","7669.29","0.0148","113.50","02.07.07"],
["2,2","517557","M³","580.8643","21984.55","0.0148","325.37","02.07.04"],
["2,2","517560","M³","465.5160","47137.21","0.0073","344.10","02.07.08"],
["2,2","6011205","L","44.3672","25.15","0.0148","0.37","02.07.07.01"],
["2,5","49299","T/KM","1.0190","2419.26","0.0445","107.65","02.10.02"],
["2,5","49401","T/KM","0.9958","170.04","0.0445","7.56","02.10.01"],
["2,5","517573","T/KM","0.7063","115555.33","0.0445","5142.21","02.10.03"],
["3,5","49321","H","23.1600","5928.96","0.0155","91.89","03.15.08"],
["3,5","91396","UN/DIA","4.6204","147.85","0.0155","2.29","03.15.03"],
["3,5","91826","UN/DIA","0.9032","289.02","0.0155","4.47","03.15.05"],
["3,5","517521","M²","510.2727","9797.23","0.0155","151.85","03.15.13"],
["4,0","29083","T","3771.4474","28278.31","-0.1487","-4204.98","04.04.01"],
["4,0","55025","M³","129.2675","107705.68","0.0445","4792.90","04.02"],
["4,0","60112","T","5641.7149","539026.36","-0.1763","-95030.34","04.03.02"],
["4,0","200134","T","2489.9519","18669.65","0.0148","276.31","04.04.02"],
["4,0","201005","T","2496.5651","238529.31","0.0148","3530.23","04.03.03"],
["4,0","322022","M²","0.3358","5595.77","0.0148","82.81","04.04"],
["4,0","517555","T","326.4402","648424.49","0.0148","9596.68","04.03"],
["4,0","6011205","L","44.3672","2119.46","0.0148","31.36","04.03.01"],
["4,1","49299","T/KM","1.0190","45666.57","0.0445","2032.16","04.05.01"],
["4,1","517573","T/KM","0.7063","676664.24","0.0445","30111.55","04.05.02"],
["7,0","52482","UND","659996.6468","3959.97","-0.0085","-33.65","07.02"],
["8,0","49408","%","6083764.60","64852.93","0.0504","3268.58","08.01"]
]';
v_l09_grupos jsonb := '[["1,0","4759.76","211.80"],["2,2","97746.07","-194.61"],["2,5","118144.63","5257.42"],["3,3","0.00","0.00"],["3,5","16163.06","250.50"],["3,6","0.00","0.00"],["3,7","0.00","0.00"],["4,0","1588349.03","-80925.03"],["4,1","722330.81","32143.71"],["7,0","3959.97","-33.65"],["7,1","0.00","0.00"],["8,0","64852.93","3268.58"]]';
v_l09_cab jsonb := '{"contrato_texto": "24 00615/2025 - CONSÓRCIO EMT-COLORADO I", "medicao_numero": "4", "medicao_tipo": "PROVISÓRIA",
  "situacao": "definitivo", "periodo_inicio": "2026-02-01", "periodo_fim": "2026-02-28", "data_base": "2025-01-01",
  "processado_em": "2026-03-19", "valor_pi": "2616306.26", "total": "-40021.28",
  "indices": [{"sigla": "CAPT", "i0": "1086.06", "i1": "894.632", "k": "-0.1763"}, {"sigla": "PAVIM", "i0": "584.512", "i1": "593.167", "k": "0.0148"}]}';
```

Casos (cada um uma chave em `r`; números esperados no cabeçalho da prova, como na Fase 5):
  - `6m` antes de tudo, alertas reais iguais aos da Fase 5 (só `valor_contrato_diferente` de L09 243.927.498,02 × 243.927.483,49 e de L10 121.590.621,00 × 121.573.053,78) e hashes de `mc_v_medicao_itens` de L09/L10 iguais aos de 02/10/2026 (acima).
  - `6a` K9 (`PROVA-K9`, `numero_contrato` `00999/2026`, `item_por_medicao`, assinatura 2025-12-01, Tiago na lista; v0 vigente desde 2025-12-01: 01 título | 01.01 m³ 10 previsto 1000 | 01.02 m³ 10 previsto 1000 | 01.03 t 5 previsto 100 | 01.04 t 5 previsto 100). 1ª (jan/2026) lança 01.01 30 e 01.02 10, fecha e envia; 2ª (fev/2026) aberta. Importar na 2ª recusa: "A 2ª medição está aberta: o reajuste entra só em medição enviada ou aprovada".
  - `6b` prévia provisória da 1ª (grupo 1,0 valor a PI 450,00 reajuste 5,01; linhas 111 m³ 10,0000 400,00 0,0250 10,01 itens [01.01, 01.02] e 222 t 5,0000 50,00 −0,1000 −5,00 itens [01.03, 01.04]; PDF `k9-prov.pdf`): pendências 1; rateio da 111 = [7.51, 2.50]; `valor_nosso` 400.00; pendência da 222 "Os itens casados não têm valor nesta medição: escolha o item que recebe a linha"; nenhum relatório gravado. Gravar recusa "Escolha os itens que recebem o reajuste das linhas: 1,0 222". Com `destino` 01.04 grava: rateio 7,51 / 2,50 / −5,00, sequência 1, provisório; evento `reajuste` "Relatório SIAC 1, índices provisórios: R$ 5,01"; 4 linhas em `mc_reajuste_de_para`.
  - `6c` definitivo (PDF `k9-def.pdf`; reajustes 12,00 e −4,00, SUBTOTAL e total 8,00): devolve anterior 5.01 e diferença 2.99; `mc_v_reajuste_medicao` = definitivo, 8,00, anterior 5,01, diferença 2,99, 2 relatórios; rateio 9,00 / 3,00 / −4,00. Excluir sem motivo recusa ("Informe o motivo da exclusão"); com motivo "definitivo lançado errado" volta o provisório (5,01, diferença nula); excluir de novo recusa ("O relatório de reajuste 2 já foi excluído"); como dono, update do total, delete do relatório e update de uma linha recusam pelas travas.
  - `6d` recusas na prévia da 1ª (cada uma com a mensagem exata): contrato "24 00184/2026 - CONSÓRCIO" ("O relatório é do contrato "24 00184/2026 - CONSÓRCIO", não do PROVA-K9 (contrato 00999/2026)"); medição "2" ("O relatório é da 2ª medição, não da 1ª"); SUBTOTAL 8,01 ("As linhas não somam o SUBTOTAL do grupo: 1,0 (valor a PI 450,00 e SUBTOTAL 450,00; reajuste 8,00 e SUBTOTAL 8,01)"); total 8,02 ("Os SUBTOTAIS não somam a SOMA do relatório: reajuste 8,00 e SOMA 8,02"); valor a PI 0,00 na 222 ("Linha 2 (1,0 222): linha com valor a PI zero não entra no import"); reajuste "abc" ("Linha 1 (1,0 111): reajuste inválido: abc"); item do L09 casado ("Linha 1 (1,0 111): item casado que não é serviço deste contrato"); destino fora dos itens ("Linha 2 (1,0 222): o item que recebe a linha tem de estar entre os casados"); gravar com o PDF anexado a outra medição ("Anexe o PDF do relatório SIAC nesta medição antes de gravar").
  - `6e` usuário zero (`f155865b-1d4b-4b25-bf3d-54d8de9176b0`) sem `medicao.reajuste/editar`: importar, manual e excluir recusam ("Sem permissão para importar reajuste", "Sem permissão para lançar reajuste", "Sem permissão para excluir reajuste"); com editar e fora da lista de K9: "Contrato não encontrado".
  - `6f` `fn_mc_ratear` (como dono): 1,00 em [1,1,1] = [0.34, 0.33, 0.33]; −0,05 em [1,1] = [−0.03, −0.02]; 10,01 em [300,100] = [7.51, 2.50]; 5,00 em [0,0] = [5.00, 0.00]; 1,00 em [−5,5] = [0.00, 1.00]; −95.030,34 em [539028.266066112320575723] = [−95030.34].
  - `6g` L09 real: `fn_mc_reajuste_config_salvar(L09, {tem_reajuste: true, data_base: '2025-01', periodicidade_meses: '12', indice_descricao: 'Índices FGV/DNIT do setor rodoviário'})` → 8 alertas `medicao_sem_reajuste` de L09 (3ª a 10ª, referência 2026-01-01). Prévia da 4ª (`fn_mc_prova_siac(v_l09, v_l09_cab || arquivo, v_l09_linhas, v_l09_grupos)`): 34 linhas, 0 pendências, total −40021.28, valor_pi 2616306.26, `medicao_valor` 2615053.13, linha 4,0/60112 com `valor_nosso` 539028.27, linha 2,2/51269 com rateio [02.07.05: 1.26, valor_base 0]. Gravar: soma do rateio −40.021,28 em 34 linhas; 02.07.07.02 = −1.082,16; 04.03.02 = −95.030,34; 02.07.05 = 1,26; 08.01 = 3.268,58; 34 linhas de de-para de L09; 2 índices gravados. Alertas `medicao_sem_reajuste` de L09: 7 (3ª, 5ª a 10ª); nenhum `reajuste_provisorio` de L09.
  - `6h` boletim e painel do L09 (como Tiago, `set local role authenticated`): até a 4ª, total `reajuste_medicao` e `reajuste_acumulado` −40021.28; linhas 01 = 211.80, 02 = 5062.81, 03 = 250.50, 04 = −48781.32, 07 = −33.65, 08 = 3268.58, 02.07.05 = 1.26; `medicoes[3].reajuste` −40021.28 e `reajuste_situacao` definitivo. Até a 10ª: `reajuste_medicao` 0, `reajuste_acumulado` −40021.28 e `acumulado` (executado) 36541661.77 igual ao de antes. Painel: L09 `reajuste_acumulado` −40021.28, L10 0, total −40021.28.
  - `6i` O012 manual: abrir a 1ª (2026-03-01 a 2026-03-31), fechar e enviar; manual na 1ª aberta antes de fechar recusa; total "12.345" recusa ("Informe o total do reajuste com até 2 casas"); manual 1234.56 provisório "INCC da Prefeitura, mar/2026", sem anexo: vale manual, provisório, 1.234,56; boletim do O012 até a 1ª: total `reajuste_medicao` 1234.56 e todas as linhas 0; alerta `reajuste_provisorio` do O012 com valor "1" e referência "1234.56"; evento "Lançamento manual 1, índices provisórios: R$ 1.234,56".
  - `6j` anexos: `fn_recurso_da_entidade('mc_reajuste')` = `medicao.reajuste`; `fn_mc_contrato_da_entidade('mc_reajuste', 4ª do L09)` = L09; como Tiago, `fn_desvincular_arquivo` do PDF do relatório do L09 recusa ("O PDF é de um relatório de reajuste em uso. Exclua o relatório antes de tirar o anexo"); o do definitivo excluído de K9 sai.
  - `6k` configuração: data-base "2025-13" recusa ("Data-base inválida: informe mês e ano"); com reajuste e sem data recusa ("Informe o mês da data-base do reajuste"); periodicidade "0" recusa ("Periodicidade inválida: de 1 a 120 meses"); a de L09 lida de volta: true, 2025-01-01, 12, o texto do índice.
  - `6n` nada fora do módulo mudou (`fn_mc_prova_fora`).
  - `6o` grants: as 4 RPCs sem anon e com authenticated; `fn_mc_ratear` e `fn_mc_brl` sem authenticated; as duas views só select para authenticated; as 4 RPCs `security definer` com `search_path` vazio; RLS ligada nas 5 tabelas novas.
  - `6z` controle: o total do reajuste da 4ª do L09 lido de `mc_v_reajuste_medicao` comparado com −40021.27 tem de dar "DIFERENTE (esperado)".
- [ ] **Step 2:** rodar a prova pelo MCP `execute_sql`: falha porque as funções e tabelas não existem (RED).
- [ ] **Step 3:** migration com este texto (carregado e exercitado num PGlite com stubs antes deste plano; os corpos de `fn_mc_boletim`, `fn_mc_painel`, `mc_v_alertas`, `fn_recurso_da_entidade`, `fn_mc_contrato_da_entidade` e `fn_desvincular_arquivo` partem das definições vivas de 02/10/2026; conferir de novo com `pg_get_functiondef`/`pg_get_viewdef` e os md5 citados antes de aplicar e, se algo mudou em produção, levar a mudança junto):

```sql
-- Medição de Contratos, Fase 6a: reajuste do DNIT registrado, não calculado (emenda de 02/10/2026 da
-- spec). O relatório SIAC "Resumo da Medição" (ou o lançamento manual, sem relatório) é gravado por
-- medição; cada linha do SIAC é casada a um ou mais itens nossos (de-para por contrato) e o reajuste
-- da linha é rateado entre eles na proporção do valor deles na medição. O rateio é gravado no import
-- (exceção consciente à D6). Vale o último relatório não excluído de cada medição. As tabelas do
-- cálculo da seção 5.5 (mc_indices, mc_indice_valores, mc_item_indices, mc_reajuste_aplicado,
-- mc_reajuste_aplicado_itens) ficam vazias e sem uso. Só aditivo: tabelas novas, uma coluna nova em
-- mc_reajuste_config, funções e views recriadas com as mesmas colunas (o jsonb do boletim e do painel
-- ganha chaves).

-- ------------------------------------------------------------------ estrutura
alter table public.mc_reajuste_config
  add column indice_descricao text check (indice_descricao is null or btrim(indice_descricao) <> '');

create table public.mc_reajuste_relatorios (
  id uuid primary key default gen_random_uuid(),
  medicao_id uuid not null,
  contrato_id uuid not null,
  sequencia integer not null check (sequencia > 0),
  origem text not null check (origem in ('siac', 'manual')),
  situacao text not null check (situacao in ('provisorio', 'definitivo')),
  total numeric not null check (total = round(total, 2)),
  valor_pi numeric check (valor_pi = round(valor_pi, 2)),
  medicao_tipo text,
  contrato_texto text,
  periodo_inicio date,
  periodo_fim date,
  data_base date,
  processado_em date,
  arquivo_id uuid references public.arquivos(id) on delete set null,
  arquivo_hash text,
  observacao text,
  created_at timestamptz not null default clock_timestamp(),
  created_by uuid references public.usuarios(id) default auth.uid(),
  excluido_em timestamptz,
  excluido_por uuid references public.usuarios(id),
  motivo_exclusao text,
  unique (medicao_id, sequencia),
  unique (id, contrato_id),
  foreign key (medicao_id, contrato_id) references public.mc_medicoes (id, contrato_id),
  check (origem = 'manual' or valor_pi is not null),
  check ((excluido_em is null) = (motivo_exclusao is null))
);
create index mc_reajuste_relatorios_contrato_ix on public.mc_reajuste_relatorios (contrato_id);
create index mc_reajuste_relatorios_arquivo_ix on public.mc_reajuste_relatorios (arquivo_id);
create index mc_reajuste_relatorios_medicao_contrato_ix on public.mc_reajuste_relatorios (medicao_id, contrato_id);
create index mc_reajuste_relatorios_excluido_por_ix on public.mc_reajuste_relatorios (excluido_por);
create index mc_reajuste_relatorios_created_by_ix on public.mc_reajuste_relatorios (created_by);

create table public.mc_reajuste_relatorio_indices (
  relatorio_id uuid not null,
  contrato_id uuid not null,
  sigla text not null check (btrim(sigla) <> ''),
  i0 numeric not null,
  i1 numeric not null,
  k numeric not null,
  primary key (relatorio_id, sigla),
  foreign key (relatorio_id, contrato_id) references public.mc_reajuste_relatorios (id, contrato_id)
);
create index mc_reajuste_relatorio_indices_rel_contrato_ix on public.mc_reajuste_relatorio_indices (relatorio_id, contrato_id);
create index mc_reajuste_relatorio_indices_contrato_ix on public.mc_reajuste_relatorio_indices (contrato_id);

create table public.mc_reajuste_linhas (
  id uuid primary key default gen_random_uuid(),
  relatorio_id uuid not null,
  contrato_id uuid not null,
  ordem integer not null check (ordem > 0),
  grupo text not null check (grupo ~ '^[0-9]+,[0-9]+$'),
  grupo_descricao text,
  codigo text not null check (codigo ~ '^[0-9]+$'),
  descricao text not null check (btrim(descricao) <> ''),
  unidade text not null check (btrim(unidade) <> ''),
  preco_unitario numeric not null,
  valor_pi numeric not null check (valor_pi <> 0 and valor_pi = round(valor_pi, 2)),
  fator numeric not null,
  reajuste numeric not null check (reajuste = round(reajuste, 2)),
  unique (relatorio_id, grupo, codigo),
  unique (relatorio_id, ordem),
  unique (id, relatorio_id),
  foreign key (relatorio_id, contrato_id) references public.mc_reajuste_relatorios (id, contrato_id)
);
create index mc_reajuste_linhas_rel_contrato_ix on public.mc_reajuste_linhas (relatorio_id, contrato_id);
create index mc_reajuste_linhas_contrato_ix on public.mc_reajuste_linhas (contrato_id);

create table public.mc_reajuste_rateio (
  linha_id uuid not null,
  relatorio_id uuid not null,
  contrato_id uuid not null,
  item_id uuid not null,
  valor_base numeric not null,
  valor numeric not null check (valor = round(valor, 2)),
  primary key (linha_id, item_id),
  foreign key (linha_id, relatorio_id) references public.mc_reajuste_linhas (id, relatorio_id),
  foreign key (relatorio_id, contrato_id) references public.mc_reajuste_relatorios (id, contrato_id),
  foreign key (item_id, contrato_id) references public.mc_itens (id, contrato_id)
);
create index mc_reajuste_rateio_linha_rel_ix on public.mc_reajuste_rateio (linha_id, relatorio_id);
create index mc_reajuste_rateio_rel_contrato_ix on public.mc_reajuste_rateio (relatorio_id, contrato_id);
create index mc_reajuste_rateio_item_contrato_ix on public.mc_reajuste_rateio (item_id, contrato_id);
create index mc_reajuste_rateio_contrato_ix on public.mc_reajuste_rateio (contrato_id);

-- De-para do contrato: linha do SIAC (grupo + código SICRO) -> itens nossos. Guardado no import e
-- reaproveitado no seguinte; o import de novo substitui o casamento das linhas que trouxe.
create table public.mc_reajuste_de_para (
  contrato_id uuid not null references public.mc_contratos(id),
  grupo text not null check (grupo ~ '^[0-9]+,[0-9]+$'),
  codigo text not null check (codigo ~ '^[0-9]+$'),
  item_id uuid not null,
  created_at timestamptz not null default now(),
  created_by uuid references public.usuarios(id) default auth.uid(),
  primary key (contrato_id, grupo, codigo, item_id),
  foreign key (item_id, contrato_id) references public.mc_itens (id, contrato_id)
);
create index mc_reajuste_de_para_item_contrato_ix on public.mc_reajuste_de_para (item_id, contrato_id);
create index mc_reajuste_de_para_created_by_ix on public.mc_reajuste_de_para (created_by);

-- ------------------------------------------------------------------ RLS, grants, auditoria, travas
do $rls$
declare t text;
begin
  foreach t in array array['mc_reajuste_relatorios', 'mc_reajuste_relatorio_indices', 'mc_reajuste_linhas',
                           'mc_reajuste_rateio', 'mc_reajuste_de_para'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('create policy %I on public.%I for select to authenticated using ((select public.fn_ve_medicao()) and contrato_id in (select public.fn_mc_meus_contratos()))', t || '_select', t);
    execute format('revoke all on public.%I from anon, authenticated', t);
    execute format('grant select on public.%I to authenticated', t);
    execute format('create trigger %I after insert or delete or update on public.%I for each row execute function public.fn_audit()', 'trg_audit_' || t, t);
    execute format('create trigger trg_mc_trava_truncate before truncate on public.%I for each statement execute function public.fn_mc_trava_truncate()', t);
  end loop;
end $rls$;

-- O relatório é imutável: só a exclusão (com motivo, uma vez) mexe nele. Apagar, nunca.
create or replace function public.fn_mc_trava_reajuste()
returns trigger language plpgsql set search_path to '' as $$
begin
  if tg_op = 'DELETE' then
    raise exception 'Relatório de reajuste não se apaga: exclua com motivo' using errcode = 'P0001';
  end if;
  if old.excluido_em is not null then
    raise exception 'O relatório de reajuste % já foi excluído', old.sequencia using errcode = 'P0001';
  end if;
  if new.excluido_em is null
     or (to_jsonb(new) - array['excluido_em', 'excluido_por', 'motivo_exclusao'])
        is distinct from (to_jsonb(old) - array['excluido_em', 'excluido_por', 'motivo_exclusao']) then
    raise exception 'O relatório de reajuste é imutável. Para corrigir, importe de novo; para tirar, exclua com motivo'
      using errcode = 'P0001';
  end if;
  return new;
end $$;
create trigger trg_mc_trava_reajuste before update or delete on public.mc_reajuste_relatorios
  for each row execute function public.fn_mc_trava_reajuste();

create or replace function public.fn_mc_trava_reajuste_filho()
returns trigger language plpgsql set search_path to '' as $$
begin
  raise exception 'Linhas, índices e rateio de um relatório de reajuste não mudam depois de gravados' using errcode = 'P0001';
end $$;
do $tf$
declare t text;
begin
  foreach t in array array['mc_reajuste_relatorio_indices', 'mc_reajuste_linhas', 'mc_reajuste_rateio'] loop
    execute format('create trigger trg_mc_trava_reajuste_filho before update or delete on public.%I for each row execute function public.fn_mc_trava_reajuste_filho()', t);
  end loop;
end $tf$;

-- ------------------------------------------------------------------ anexo do relatório
-- 'mc_reajuste': PDF do relatório SIAC (ou o documento do lançamento manual), anexado à MEDIÇÃO.
-- Corpos iguais aos vivos (pg_get_functiondef em 02/10/2026) com a linha nova marcada.
CREATE OR REPLACE FUNCTION public.fn_recurso_da_entidade(p_tipo text)
 RETURNS text
 LANGUAGE sql
 IMMUTABLE
 SET search_path TO ''
AS $function$
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
    when 'aplicacao_posicao' then 'financeiro.aplicacoes'
    when 'mc_contrato'    then 'medicao.contratos'
    when 'mc_aditivo'     then 'medicao.contratos'
    when 'mc_planilha_versao' then 'medicao.planilha'
    when 'mc_lancamento'  then 'medicao.lancamentos'
    when 'mc_reajuste'    then 'medicao.reajuste' -- mc: Fase 6
    else null
  end;
$function$;

CREATE OR REPLACE FUNCTION public.fn_mc_contrato_da_entidade(p_tipo text, p_id uuid)
 RETURNS uuid
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  select case p_tipo
    when 'mc_contrato' then (select id from public.mc_contratos where id = p_id)
    when 'mc_aditivo' then (select contrato_id from public.mc_aditivos where id = p_id)
    when 'mc_planilha_versao' then (select contrato_id from public.mc_planilha_versoes where id = p_id)
    when 'mc_lancamento' then (select contrato_id from public.mc_lancamentos where id = p_id)
    when 'mc_reajuste' then (select contrato_id from public.mc_medicoes where id = p_id) -- mc: Fase 6
  end;
$function$;

-- O PDF de um relatório em uso não sai da medição (o histórico precisa dele).
CREATE OR REPLACE FUNCTION public.fn_desvincular_arquivo(p_vinculo_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_tipo text;
  v_recurso text;
  v_entidade uuid;
begin
  select entidade_tipo, entidade_id into v_tipo, v_entidade from public.anexo_vinculos where id = p_vinculo_id;
  if v_tipo is null then
    raise exception 'Anexo nao encontrado neste documento';
  end if;

  v_recurso := public.fn_recurso_da_entidade(v_tipo);
  if not public.tem_permissao(v_recurso, 'editar') then
    raise exception 'Sem permissao para remover anexo deste documento';
  end if;
  if not public.fn_anexo_entidade_visivel(v_tipo, v_entidade) then raise exception 'Sem acesso a este contrato'; end if; -- mc:
  if v_tipo = 'mc_reajuste' and exists (select 1 from public.mc_reajuste_relatorios r join public.anexo_vinculos v on v.arquivo_id = r.arquivo_id
       where v.id = p_vinculo_id and r.medicao_id = v_entidade and r.excluido_em is null) then
    raise exception 'O PDF é de um relatório de reajuste em uso. Exclua o relatório antes de tirar o anexo'; -- mc: Fase 6
  end if;

  delete from public.anexo_vinculos where id = p_vinculo_id;
end;
$function$;

-- ------------------------------------------------------------------ helpers internos
-- Dinheiro em pt-BR para mensagens ("-40.021,28"); ',' e '.' do to_char não dependem do locale.
create or replace function public.fn_mc_brl(p_valor numeric)
returns text language sql immutable set search_path to '' as $$
  select translate(to_char(p_valor, 'FM999,999,999,990.00'), ',.', '.,');
$$;

-- Rateio exato ao centavo: cada item recebe TRUNC(valor x peso / soma; 2) (div() é divisão inteira
-- exata, truncada em direção ao zero) e o que sobra vai para o item de maior peso (empate: o primeiro
-- da lista). Peso negativo conta como zero. Soma zero: tudo vai para o primeiro item (quem chama
-- passa só o item escolhido). A soma devolvida é exatamente p_valor.
create or replace function public.fn_mc_ratear(p_valor numeric, p_itens uuid[], p_pesos numeric[])
returns table (ord integer, item_id uuid, peso numeric, valor numeric)
language sql immutable set search_path to '' as $$
  with b as (
    select u.ord::integer as ord, u.item_id, greatest(coalesce(u.peso, 0), 0) as peso
      from unnest(p_itens, p_pesos) with ordinality as u(item_id, peso, ord)
  ), s as (
    select sum(peso) as soma from b
  ), parte as (
    select b.ord, b.item_id, b.peso,
           case when s.soma = 0 then 0 else div(p_valor * 100 * b.peso, s.soma) / 100 end as v
      from b cross join s
  ), maior as (
    select p.ord from parte p order by p.peso desc, p.ord limit 1
  )
  select p.ord, p.item_id, p.peso,
         round(p.v + case when p.ord = (select m.ord from maior m) then p_valor - (select sum(x.v) from parte x) else 0 end, 2)
    from parte p order by p.ord;
$$;

-- ------------------------------------------------------------------ RPCs
-- Importa o relatório SIAC já lido do PDF pelo servidor (o texto do PDF não entra no banco).
-- p_relatorio = {contrato_texto, medicao_numero, medicao_tipo, situacao ('provisorio'|'definitivo'),
--   periodo_inicio, periodo_fim, data_base, processado_em (yyyy-mm-dd), valor_pi, total (texto),
--   arquivo_id, indices [{sigla, i0, i1, k}], grupos [{grupo, descricao, valor_pi, reajuste}],
--   linhas [{grupo, codigo, descricao, unidade, preco_unitario, valor_pi, fator, reajuste,
--            itens [item_id], destino item_id|null}]}. Números como texto.
-- p_gravar = false: confere e devolve a prévia (rateio, pendências, diferença), sem gravar.
-- p_gravar = true: grava relatório, índices, linhas, rateio e de-para, e o evento da medição.
create or replace function public.fn_mc_reajuste_importar(p_medicao uuid, p_relatorio jsonb, p_gravar boolean default false)
returns jsonb language plpgsql security definer set search_path to '' as $$
declare
  m public.mc_medicoes%rowtype;
  v_ant public.mc_reajuste_relatorios%rowtype;
  v_numero_contrato text; v_codigo_contrato text;
  v_situacao text := p_relatorio ->> 'situacao';
  v_total numeric; v_valor_pi numeric; v_txt text; v_rotulo text;
  v_preco numeric; v_pi numeric; v_fator numeric; v_reaj numeric;
  v_itens uuid[]; v_pesos numeric[]; v_destino uuid; v_rateio jsonb; v_pendencia text;
  v_linhas jsonb := '[]'::jsonb; v_arquivo uuid; v_id uuid; v_seq integer; v_linha_id uuid;
  l record; x jsonb; v_res jsonb;
begin
  select * into m from public.mc_medicoes where id = p_medicao for update;
  perform public.fn_mc_exigir('medicao.reajuste', 'editar', m.contrato_id, 'Sem permissão para importar reajuste');
  if m.id is null then raise exception 'Medição não encontrada' using errcode = 'P0001'; end if;
  if m.status not in ('enviada', 'aprovada') then
    raise exception 'A %ª medição está %: o reajuste entra só em medição enviada ou aprovada', m.numero,
      public.fn_mc_rotulo_status(m.status) using errcode = 'P0001';
  end if;
  if jsonb_typeof(p_relatorio) is distinct from 'object' or jsonb_typeof(p_relatorio -> 'linhas') is distinct from 'array'
     or jsonb_typeof(p_relatorio -> 'grupos') is distinct from 'array' or jsonb_typeof(p_relatorio -> 'indices') is distinct from 'array' then
    raise exception 'Relatório em formato inválido' using errcode = 'P0001';
  end if;

  -- Cabeçalho: contrato (o número do nosso contrato aparece como palavra no "CONTRATO:" do SIAC),
  -- medição e situação dos índices.
  select numero_contrato, codigo into v_numero_contrato, v_codigo_contrato from public.mc_contratos where id = m.contrato_id;
  if strpos(' ' || regexp_replace(coalesce(p_relatorio ->> 'contrato_texto', ''), '[^0-9/.-]+', ' ', 'g') || ' ',
            ' ' || btrim(regexp_replace(v_numero_contrato, '[^0-9/.-]+', ' ', 'g')) || ' ') = 0 then
    raise exception 'O relatório é do contrato "%", não do % (contrato %)', coalesce(p_relatorio ->> 'contrato_texto', 'sem número'),
      v_codigo_contrato, v_numero_contrato using errcode = 'P0001';
  end if;
  if coalesce(p_relatorio ->> 'medicao_numero', '') !~ '^[0-9]{1,4}$' or (p_relatorio ->> 'medicao_numero')::integer <> m.numero then
    raise exception 'O relatório é da %ª medição, não da %ª', coalesce(p_relatorio ->> 'medicao_numero', '?'), m.numero using errcode = 'P0001';
  end if;
  if v_situacao is null or v_situacao not in ('provisorio', 'definitivo') then
    raise exception 'Situação dos índices inválida: informe provisório ou definitivo' using errcode = 'P0001';
  end if;
  v_total := public.fn_mc_numero(p_relatorio ->> 'total', 'Total do reajuste inválido');
  v_valor_pi := public.fn_mc_numero(p_relatorio ->> 'valor_pi', 'Valor a PI do relatório inválido');
  if v_total is null or v_valor_pi is null or v_total <> round(v_total, 2) or v_valor_pi <> round(v_valor_pi, 2) then
    raise exception 'Informe o total do reajuste e o valor a PI do relatório com até 2 casas' using errcode = 'P0001';
  end if;

  -- Grupos (SUBTOTAL do SIAC) e índices.
  if exists (select 1 from jsonb_array_elements(p_relatorio -> 'grupos') g
              where coalesce(g ->> 'grupo', '') !~ '^[0-9]+,[0-9]+$'
                 or public.fn_mc_numero(g ->> 'valor_pi', 'SUBTOTAL inválido') is null
                 or public.fn_mc_numero(g ->> 'reajuste', 'SUBTOTAL inválido') is null)
     or (select count(*) <> count(distinct g ->> 'grupo') from jsonb_array_elements(p_relatorio -> 'grupos') g) then
    raise exception 'SUBTOTAL de grupo em formato inválido ou repetido' using errcode = 'P0001';
  end if;
  if exists (select 1 from jsonb_array_elements(p_relatorio -> 'indices') i
              where coalesce(btrim(i ->> 'sigla'), '') = ''
                 or public.fn_mc_numero(i ->> 'i0', 'Índice inválido') is null
                 or public.fn_mc_numero(i ->> 'i1', 'Índice inválido') is null
                 or public.fn_mc_numero(i ->> 'k', 'Índice inválido') is null)
     or (select count(*) <> count(distinct btrim(i ->> 'sigla')) from jsonb_array_elements(p_relatorio -> 'indices') i) then
    raise exception 'Tabela de índices em formato inválido ou com sigla repetida' using errcode = 'P0001';
  end if;

  -- Linhas: confere uma a uma e calcula o rateio.
  for l in select e.j, e.ord::integer as ord from jsonb_array_elements(p_relatorio -> 'linhas') with ordinality as e(j, ord) loop
    v_rotulo := format('Linha %s (%s %s)', l.ord, coalesce(l.j ->> 'grupo', '?'), coalesce(l.j ->> 'codigo', '?'));
    if coalesce(l.j ->> 'grupo', '') !~ '^[0-9]+,[0-9]+$' or coalesce(l.j ->> 'codigo', '') !~ '^[0-9]+$'
       or coalesce(btrim(l.j ->> 'descricao'), '') = '' or coalesce(btrim(l.j ->> 'unidade'), '') = '' then
      raise exception '%: grupo, código SICRO, descrição e unidade são obrigatórios', v_rotulo using errcode = 'P0001';
    end if;
    v_preco := public.fn_mc_numero(l.j ->> 'preco_unitario', v_rotulo || ': preço inválido');
    v_pi := public.fn_mc_numero(l.j ->> 'valor_pi', v_rotulo || ': valor a PI inválido');
    v_fator := public.fn_mc_numero(l.j ->> 'fator', v_rotulo || ': fator inválido');
    v_reaj := public.fn_mc_numero(l.j ->> 'reajuste', v_rotulo || ': reajuste inválido');
    if v_preco is null or v_pi is null or v_fator is null or v_reaj is null then
      raise exception '%: preço, valor a PI, fator e reajuste são obrigatórios', v_rotulo using errcode = 'P0001';
    end if;
    if v_pi = 0 then raise exception '%: linha com valor a PI zero não entra no import', v_rotulo using errcode = 'P0001'; end if;
    if v_pi <> round(v_pi, 2) or v_reaj <> round(v_reaj, 2) then
      raise exception '%: valor a PI e reajuste têm no máximo 2 casas', v_rotulo using errcode = 'P0001';
    end if;
    if not exists (select 1 from jsonb_array_elements(p_relatorio -> 'grupos') g where g ->> 'grupo' = l.j ->> 'grupo') then
      raise exception '%: o grupo % não tem SUBTOTAL no relatório', v_rotulo, l.j ->> 'grupo' using errcode = 'P0001';
    end if;

    -- Itens casados (do de-para ou escolhidos na prévia): serviços deste contrato, sem repetição.
    if jsonb_typeof(coalesce(l.j -> 'itens', '[]'::jsonb)) <> 'array'
       or exists (select 1 from jsonb_array_elements_text(coalesce(l.j -> 'itens', '[]'::jsonb)) t
                   where t !~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$')
       or (l.j ->> 'destino' is not null and l.j ->> 'destino' !~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$') then
      raise exception '%: itens casados em formato inválido', v_rotulo using errcode = 'P0001';
    end if;
    select coalesce(array_agg(t::uuid order by o), '{}') into v_itens
      from jsonb_array_elements_text(coalesce(l.j -> 'itens', '[]'::jsonb)) with ordinality as e(t, o);
    if cardinality(v_itens) <> (select count(distinct u) from unnest(v_itens) u) then
      raise exception '%: item repetido no casamento', v_rotulo using errcode = 'P0001';
    end if;
    if exists (select 1 from unnest(v_itens) u where not exists (
                 select 1 from public.mc_planilha_itens pi where pi.item_id = u and pi.contrato_id = m.contrato_id and pi.tipo = 'servico')) then
      raise exception '%: item casado que não é serviço deste contrato', v_rotulo using errcode = 'P0001';
    end if;
    v_destino := (l.j ->> 'destino')::uuid;
    if v_destino is not null and not (v_destino = any(v_itens)) then
      raise exception '%: o item que recebe a linha tem de estar entre os casados', v_rotulo using errcode = 'P0001';
    end if;

    -- Peso = valor do item nesta medição (mc_v_medicao_itens: aprovada se aprovada, medida se enviada).
    select coalesce(array_agg(coalesce((select sum(mi.valor_medicao) from public.mc_v_medicao_itens mi
                                         where mi.medicao_id = p_medicao and mi.item_id = u.id), 0) order by u.o), '{}')
      into v_pesos from unnest(v_itens) with ordinality as u(id, o);

    v_rateio := '[]'::jsonb; v_pendencia := null;
    if cardinality(v_itens) = 0 then
      v_pendencia := 'Case a linha com um ou mais itens';
    elsif cardinality(v_itens) = 1 or (select sum(greatest(p, 0)) from unnest(v_pesos) p) > 0 then
      select jsonb_agg(jsonb_build_object('item_id', r.item_id, 'valor_base', r.peso::text, 'valor', r.valor::text) order by r.ord)
        into v_rateio from public.fn_mc_ratear(v_reaj, v_itens, v_pesos) r;
    elsif v_destino is not null then
      select jsonb_agg(jsonb_build_object('item_id', r.item_id, 'valor_base', r.peso::text, 'valor', r.valor::text) order by r.ord)
        into v_rateio from public.fn_mc_ratear(v_reaj, array[v_destino], array[0::numeric]) r;
    else
      v_pendencia := 'Os itens casados não têm valor nesta medição: escolha o item que recebe a linha';
    end if;

    v_linhas := v_linhas || jsonb_build_array(jsonb_build_object(
      'ordem', l.ord, 'grupo', l.j ->> 'grupo', 'codigo', l.j ->> 'codigo', 'descricao', btrim(l.j ->> 'descricao'),
      'unidade', btrim(l.j ->> 'unidade'), 'preco_unitario', v_preco::text, 'valor_pi', v_pi::text, 'fator', v_fator::text,
      'reajuste', v_reaj::text, 'itens', to_jsonb(v_itens), 'destino', v_destino,
      'valor_nosso', round((select coalesce(sum(p), 0) from unnest(v_pesos) p), 2)::text,
      'rateio', v_rateio, 'pendencia', v_pendencia));
  end loop;

  select format('%s %s', y ->> 'grupo', y ->> 'codigo') into v_txt
    from jsonb_array_elements(v_linhas) y group by y ->> 'grupo', y ->> 'codigo' having count(*) > 1 limit 1;
  if v_txt is not null then raise exception 'Linha repetida no relatório: %', v_txt using errcode = 'P0001'; end if;

  -- As linhas somam o SUBTOTAL de cada grupo, e os SUBTOTAIS somam a SOMA.
  select string_agg(format('%s (valor a PI %s e SUBTOTAL %s; reajuste %s e SUBTOTAL %s)', g.grupo,
                           public.fn_mc_brl(coalesce(s.pi, 0)), public.fn_mc_brl(g.pi),
                           public.fn_mc_brl(coalesce(s.rj, 0)), public.fn_mc_brl(g.rj)), '; ' order by g.grupo)
    into v_txt
    from (select e ->> 'grupo' as grupo, (e ->> 'valor_pi')::numeric as pi, (e ->> 'reajuste')::numeric as rj
            from jsonb_array_elements(p_relatorio -> 'grupos') e) g
    left join (select y ->> 'grupo' as grupo, sum((y ->> 'valor_pi')::numeric) as pi, sum((y ->> 'reajuste')::numeric) as rj
                 from jsonb_array_elements(v_linhas) y group by 1) s on s.grupo = g.grupo
   where coalesce(s.pi, 0) <> g.pi or coalesce(s.rj, 0) <> g.rj;
  if v_txt is not null then
    raise exception 'As linhas não somam o SUBTOTAL do grupo: %', v_txt using errcode = 'P0001';
  end if;
  select string_agg(v, ', ') into v_txt from (
    select format('valor a PI %s e SOMA %s', public.fn_mc_brl(sum((e ->> 'valor_pi')::numeric)), public.fn_mc_brl(v_valor_pi)) as v
      from jsonb_array_elements(p_relatorio -> 'grupos') e having coalesce(sum((e ->> 'valor_pi')::numeric), 0) <> v_valor_pi
    union all
    select format('reajuste %s e SOMA %s', public.fn_mc_brl(sum((e ->> 'reajuste')::numeric)), public.fn_mc_brl(v_total))
      from jsonb_array_elements(p_relatorio -> 'grupos') e having coalesce(sum((e ->> 'reajuste')::numeric), 0) <> v_total) d;
  if v_txt is not null then
    raise exception 'Os SUBTOTAIS não somam a SOMA do relatório: %', v_txt using errcode = 'P0001';
  end if;

  select * into v_ant from public.mc_reajuste_relatorios
   where medicao_id = p_medicao and excluido_em is null order by sequencia desc limit 1;
  v_res := jsonb_build_object(
    'linhas', v_linhas,
    'pendencias', (select count(*) from jsonb_array_elements(v_linhas) y where y ->> 'pendencia' is not null),
    'total', v_total::text, 'valor_pi', v_valor_pi::text, 'situacao', v_situacao,
    'medicao_valor', (select t.valor::text from public.mc_v_medicao_totais t where t.medicao_id = p_medicao),
    'anterior', case when v_ant.id is null then null else jsonb_build_object('id', v_ant.id, 'sequencia', v_ant.sequencia,
                  'origem', v_ant.origem, 'situacao', v_ant.situacao, 'total', v_ant.total::text) end,
    'diferenca', case when v_ant.id is null then null else (v_total - v_ant.total)::text end);
  if not coalesce(p_gravar, false) then return v_res; end if;

  -- Gravar.
  select string_agg(format('%s %s', y ->> 'grupo', y ->> 'codigo'), ', ' order by (y ->> 'ordem')::integer) into v_txt
    from jsonb_array_elements(v_linhas) y where y ->> 'pendencia' is not null;
  if v_txt is not null then
    raise exception 'Escolha os itens que recebem o reajuste das linhas: %', v_txt using errcode = 'P0001';
  end if;
  if coalesce(p_relatorio ->> 'arquivo_id', '') !~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$'
     or not exists (select 1 from public.anexo_vinculos v where v.arquivo_id = (p_relatorio ->> 'arquivo_id')::uuid
                     and v.entidade_tipo = 'mc_reajuste' and v.entidade_id = p_medicao) then
    raise exception 'Anexe o PDF do relatório SIAC nesta medição antes de gravar' using errcode = 'P0001';
  end if;
  v_arquivo := (p_relatorio ->> 'arquivo_id')::uuid;
  select coalesce(max(sequencia), 0) + 1 into v_seq from public.mc_reajuste_relatorios where medicao_id = p_medicao;
  insert into public.mc_reajuste_relatorios (medicao_id, contrato_id, sequencia, origem, situacao, total, valor_pi, medicao_tipo,
    contrato_texto, periodo_inicio, periodo_fim, data_base, processado_em, arquivo_id, arquivo_hash)
  values (p_medicao, m.contrato_id, v_seq, 'siac', v_situacao, v_total, v_valor_pi, nullif(btrim(p_relatorio ->> 'medicao_tipo'), ''),
    btrim(p_relatorio ->> 'contrato_texto'), nullif(p_relatorio ->> 'periodo_inicio', '')::date, nullif(p_relatorio ->> 'periodo_fim', '')::date,
    nullif(p_relatorio ->> 'data_base', '')::date, nullif(p_relatorio ->> 'processado_em', '')::date, v_arquivo,
    (select a.hash_sha256 from public.arquivos a where a.id = v_arquivo))
  returning id into v_id;
  insert into public.mc_reajuste_relatorio_indices (relatorio_id, contrato_id, sigla, i0, i1, k)
  select v_id, m.contrato_id, btrim(i ->> 'sigla'), (i ->> 'i0')::numeric, (i ->> 'i1')::numeric, (i ->> 'k')::numeric
    from jsonb_array_elements(p_relatorio -> 'indices') i;
  for x in select y from jsonb_array_elements(v_linhas) y order by (y ->> 'ordem')::integer loop
    insert into public.mc_reajuste_linhas (relatorio_id, contrato_id, ordem, grupo, grupo_descricao, codigo, descricao, unidade,
      preco_unitario, valor_pi, fator, reajuste)
    values (v_id, m.contrato_id, (x ->> 'ordem')::integer, x ->> 'grupo',
      (select nullif(btrim(g ->> 'descricao'), '') from jsonb_array_elements(p_relatorio -> 'grupos') g where g ->> 'grupo' = x ->> 'grupo'),
      x ->> 'codigo', x ->> 'descricao', x ->> 'unidade', (x ->> 'preco_unitario')::numeric, (x ->> 'valor_pi')::numeric,
      (x ->> 'fator')::numeric, (x ->> 'reajuste')::numeric)
    returning id into v_linha_id;
    insert into public.mc_reajuste_rateio (linha_id, relatorio_id, contrato_id, item_id, valor_base, valor)
    select v_linha_id, v_id, m.contrato_id, (r ->> 'item_id')::uuid, (r ->> 'valor_base')::numeric, (r ->> 'valor')::numeric
      from jsonb_array_elements(x -> 'rateio') r;
  end loop;

  -- De-para: o casamento das linhas deste relatório substitui o anterior delas.
  delete from public.mc_reajuste_de_para d using jsonb_array_elements(v_linhas) y
   where d.contrato_id = m.contrato_id and d.grupo = y ->> 'grupo' and d.codigo = y ->> 'codigo';
  insert into public.mc_reajuste_de_para (contrato_id, grupo, codigo, item_id)
  select m.contrato_id, y ->> 'grupo', y ->> 'codigo', i::uuid
    from jsonb_array_elements(v_linhas) y cross join jsonb_array_elements_text(y -> 'itens') i;

  -- Conferência final, já no que foi gravado: rateio de cada linha = reajuste da linha; linhas = total.
  if exists (select 1 from public.mc_reajuste_linhas rl where rl.relatorio_id = v_id
              and rl.reajuste <> (select coalesce(sum(rr.valor), 0) from public.mc_reajuste_rateio rr where rr.linha_id = rl.id))
     or (select coalesce(sum(rl.reajuste), 0) from public.mc_reajuste_linhas rl where rl.relatorio_id = v_id) <> v_total then
    raise exception 'O rateio não fecha com o relatório' using errcode = 'P0001';
  end if;

  insert into public.mc_medicao_eventos (medicao_id, contrato_id, evento, motivo, criado_em)
  values (p_medicao, m.contrato_id, 'reajuste', format('Relatório SIAC %s, índices %s: R$ %s', v_seq,
          case v_situacao when 'definitivo' then 'definitivos' else 'provisórios' end, public.fn_mc_brl(v_total)), clock_timestamp());
  return v_res || jsonb_build_object('relatorio_id', v_id, 'sequencia', v_seq);
end $$;

-- Lançamento manual (contrato sem relatório SIAC: Obra 012 e outros): total, situação, anexo opcional
-- (já anexado à medição como 'mc_reajuste') e observação. Sem rateio por item.
create or replace function public.fn_mc_reajuste_manual(p_medicao uuid, p_dados jsonb)
returns uuid language plpgsql security definer set search_path to '' as $$
declare m public.mc_medicoes%rowtype; v_total numeric; v_situacao text := p_dados ->> 'situacao'; v_arquivo uuid; v_seq integer; v_id uuid;
begin
  select * into m from public.mc_medicoes where id = p_medicao for update;
  perform public.fn_mc_exigir('medicao.reajuste', 'editar', m.contrato_id, 'Sem permissão para lançar reajuste');
  if m.id is null then raise exception 'Medição não encontrada' using errcode = 'P0001'; end if;
  if m.status not in ('enviada', 'aprovada') then
    raise exception 'A %ª medição está %: o reajuste entra só em medição enviada ou aprovada', m.numero,
      public.fn_mc_rotulo_status(m.status) using errcode = 'P0001';
  end if;
  v_total := public.fn_mc_numero(p_dados ->> 'total', 'Total do reajuste inválido');
  if v_total is null or v_total <> round(v_total, 2) then
    raise exception 'Informe o total do reajuste com até 2 casas' using errcode = 'P0001';
  end if;
  if v_situacao is null or v_situacao not in ('provisorio', 'definitivo') then
    raise exception 'Situação dos índices inválida: informe provisório ou definitivo' using errcode = 'P0001';
  end if;
  if nullif(p_dados ->> 'arquivo_id', '') is not null then
    if p_dados ->> 'arquivo_id' !~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$'
       or not exists (select 1 from public.anexo_vinculos v where v.arquivo_id = (p_dados ->> 'arquivo_id')::uuid
                       and v.entidade_tipo = 'mc_reajuste' and v.entidade_id = p_medicao) then
      raise exception 'O anexo informado não está nesta medição' using errcode = 'P0001';
    end if;
    v_arquivo := (p_dados ->> 'arquivo_id')::uuid;
  end if;
  select coalesce(max(sequencia), 0) + 1 into v_seq from public.mc_reajuste_relatorios where medicao_id = p_medicao;
  insert into public.mc_reajuste_relatorios (medicao_id, contrato_id, sequencia, origem, situacao, total, arquivo_id, arquivo_hash, observacao)
  values (p_medicao, m.contrato_id, v_seq, 'manual', v_situacao, v_total, v_arquivo,
          (select a.hash_sha256 from public.arquivos a where a.id = v_arquivo), nullif(btrim(p_dados ->> 'observacao'), ''))
  returning id into v_id;
  insert into public.mc_medicao_eventos (medicao_id, contrato_id, evento, motivo, criado_em)
  values (p_medicao, m.contrato_id, 'reajuste', format('Lançamento manual %s, índices %s: R$ %s', v_seq,
          case v_situacao when 'definitivo' then 'definitivos' else 'provisórios' end, public.fn_mc_brl(v_total)), clock_timestamp());
  return v_id;
end $$;

create or replace function public.fn_mc_reajuste_excluir(p_id uuid, p_motivo text)
returns void language plpgsql security definer set search_path to '' as $$
declare r public.mc_reajuste_relatorios%rowtype; m public.mc_medicoes%rowtype;
begin
  select * into r from public.mc_reajuste_relatorios where id = p_id;
  select * into m from public.mc_medicoes where id = r.medicao_id for update;
  perform public.fn_mc_exigir('medicao.reajuste', 'editar', r.contrato_id, 'Sem permissão para excluir reajuste');
  if r.id is null then raise exception 'Relatório de reajuste não encontrado' using errcode = 'P0001'; end if;
  if r.excluido_em is not null then raise exception 'O relatório de reajuste % já foi excluído', r.sequencia using errcode = 'P0001'; end if;
  if char_length(coalesce(btrim(p_motivo), '')) < 3 then raise exception 'Informe o motivo da exclusão' using errcode = 'P0001'; end if;
  update public.mc_reajuste_relatorios set excluido_em = now(), excluido_por = (select auth.uid()), motivo_exclusao = btrim(p_motivo)
   where id = p_id;
  insert into public.mc_medicao_eventos (medicao_id, contrato_id, evento, motivo, criado_em)
  values (r.medicao_id, r.contrato_id, 'reajuste_excluido', format('Relatório %s (R$ %s) excluído: %s', r.sequencia,
          public.fn_mc_brl(r.total), btrim(p_motivo)), clock_timestamp());
end $$;

-- Seção Reajuste do contrato: tem reajuste, data-base (mês), periodicidade e índice em texto.
-- p_dados = {tem_reajuste: true|false, data_base: 'yyyy-mm', periodicidade_meses: '12', indice_descricao}.
create or replace function public.fn_mc_reajuste_config_salvar(p_contrato uuid, p_dados jsonb)
returns void language plpgsql security definer set search_path to '' as $$
declare v_tem boolean; v_mes text := nullif(btrim(p_dados ->> 'data_base'), ''); v_per text := coalesce(nullif(btrim(p_dados ->> 'periodicidade_meses'), ''), '12');
begin
  perform public.fn_mc_exigir('medicao.reajuste', 'editar', p_contrato, 'Sem permissão para configurar o reajuste');
  if p_contrato is null or not exists (select 1 from public.mc_contratos where id = p_contrato and excluido_em is null) then
    raise exception 'Contrato não encontrado' using errcode = 'P0001';
  end if;
  if jsonb_typeof(p_dados -> 'tem_reajuste') is distinct from 'boolean' then
    raise exception 'Informe se o contrato tem reajuste' using errcode = 'P0001';
  end if;
  v_tem := (p_dados ->> 'tem_reajuste')::boolean;
  if v_mes is not null and v_mes !~ '^[0-9]{4}-(0[1-9]|1[0-2])$' then
    raise exception 'Data-base inválida: informe mês e ano' using errcode = 'P0001';
  end if;
  if v_tem and v_mes is null then raise exception 'Informe o mês da data-base do reajuste' using errcode = 'P0001'; end if;
  if v_per !~ '^[0-9]{1,3}$' or v_per::integer not between 1 and 120 then
    raise exception 'Periodicidade inválida: de 1 a 120 meses' using errcode = 'P0001';
  end if;
  insert into public.mc_reajuste_config (contrato_id, tem_reajuste, data_base, periodicidade_meses, indice_descricao)
  values (p_contrato, v_tem, (v_mes || '-01')::date, v_per::integer, nullif(btrim(p_dados ->> 'indice_descricao'), ''))
  on conflict (contrato_id) do update set tem_reajuste = excluded.tem_reajuste, data_base = excluded.data_base,
    periodicidade_meses = excluded.periodicidade_meses, indice_descricao = excluded.indice_descricao;
end $$;

-- ------------------------------------------------------------------ views
-- Reajuste que vale em cada medição: o último relatório não excluído; diferença para o anterior não
-- excluído (+ a receber, - a devolver).
create or replace view public.mc_v_reajuste_medicao with (security_invoker = true) as
with r as (
  select rr.*, row_number() over (partition by rr.medicao_id order by rr.sequencia desc) as n,
         count(*) over (partition by rr.medicao_id) as relatorios
    from public.mc_reajuste_relatorios rr where rr.excluido_em is null
)
select r1.medicao_id, r1.contrato_id, m.numero, r1.id as relatorio_id, r1.sequencia, r1.origem, r1.situacao, r1.total,
       r2.id as anterior_id, r2.total as anterior_total, r1.total - r2.total as diferenca, r1.relatorios
  from r r1
  join public.mc_medicoes m on m.id = r1.medicao_id
  left join r r2 on r2.medicao_id = r1.medicao_id and r2.n = 2
 where r1.n = 1;

-- Rateio por item do relatório que vale (só o do SIAC tem; o manual conta só no total).
create or replace view public.mc_v_reajuste_itens with (security_invoker = true) as
select v.medicao_id, v.contrato_id, v.numero, ra.item_id, sum(ra.valor) as valor
  from public.mc_v_reajuste_medicao v
  join public.mc_reajuste_rateio ra on ra.relatorio_id = v.relatorio_id
 group by v.medicao_id, v.contrato_id, v.numero, ra.item_id;

revoke all on public.mc_v_reajuste_medicao from anon, authenticated;
revoke all on public.mc_v_reajuste_itens from anon, authenticated;
grant select on public.mc_v_reajuste_medicao to authenticated;
grant select on public.mc_v_reajuste_itens to authenticated;

-- ------------------------------------------------------------------ boletim e painel
-- fn_mc_boletim: corpo vivo de 02/10/2026 (md5 756b89fd51a6156103a516ac311066d7) mais o reajuste:
-- por linha (item e grupo) 'reajuste_medicao' (na Nª) e 'reajuste_acumulado' (1ª..Nª), somas do
-- rateio; no total, as mesmas chaves somando o total do relatório que vale (o manual entra só aqui);
-- em cada medição, 'reajuste' e 'reajuste_situacao'.
CREATE OR REPLACE FUNCTION public.fn_mc_boletim(p_contrato uuid, p_ate integer DEFAULT NULL::integer)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE
 SET search_path TO ''
AS $function$
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
  ), reaj as (
    select ri.item_id,
           coalesce(sum(ri.valor) filter (where ri.numero = v_ate), 0) as reaj_n,
           coalesce(sum(ri.valor), 0) as reaj_ac
    from public.mc_v_reajuste_itens ri
    where ri.contrato_id = p_contrato and ri.numero <= coalesce(v_ate, 0)
    group by ri.item_id
  ), linhas as (
    select l.* from public.mc_v_planilha_linhas l where l.versao_id = v_versao.id
  ), sub as (
    select s.ancestral_id as id, sum(l.valor_previsto) as previsto,
           sum(coalesce(p.valor_n, 0)) as valor_n, sum(coalesce(p.acumulado, 0)) as acumulado,
           sum(coalesce(r.reaj_n, 0)) as reaj_n, sum(coalesce(r.reaj_ac, 0)) as reaj_ac
    from public.mc_v_planilha_subarvore s
    join linhas l on l.id = s.linha_id and l.tipo = 'servico'
    left join por_item p on p.item_id = l.item_id
    left join reaj r on r.item_id = l.item_id
    group by s.ancestral_id
  ), valores as (
    select l.*, p.qtds,
           round(case when l.tipo = 'servico' then l.valor_previsto else coalesce(s.previsto, 0) end, 2) as prev,
           round(case when l.tipo = 'servico' then coalesce(p.valor_n, 0) else coalesce(s.valor_n, 0) end, 2) as vn,
           round(case when l.tipo = 'servico' then coalesce(p.acumulado, 0) else coalesce(s.acumulado, 0) end, 2) as ac,
           case when l.tipo = 'servico' then coalesce(r.reaj_n, 0) else coalesce(s.reaj_n, 0) end as rn,
           case when l.tipo = 'servico' then coalesce(r.reaj_ac, 0) else coalesce(s.reaj_ac, 0) end as rac
    from linhas l
    left join sub s on s.id = l.id
    left join por_item p on p.item_id = l.item_id and l.tipo = 'servico'
    left join reaj r on r.item_id = l.item_id and l.tipo = 'servico'
  ), fora as (
    select k.item_id, p.qtds, coalesce(p.valor_n, 0) as valor_n, coalesce(p.acumulado, 0) as acumulado,
           coalesce(r.reaj_n, 0) as reaj_n, coalesce(r.reaj_ac, 0) as reaj_ac, u.codigo, u.descricao, u.unidade
    from (select item_id from por_item union select item_id from reaj) k
    left join por_item p on p.item_id = k.item_id
    left join reaj r on r.item_id = k.item_id
    cross join lateral (
      select pi.codigo, pi.descricao, pi.unidade from public.mc_planilha_itens pi
      join public.mc_planilha_versoes v on v.id = pi.versao_id
      where pi.item_id = k.item_id order by v.numero desc limit 1) u
    where not exists (select 1 from linhas l where l.item_id = k.item_id)
  ), rm as (
    select coalesce(sum(total) filter (where numero = v_ate), 0) as reaj_n, coalesce(sum(total), 0) as reaj_ac
    from public.mc_v_reajuste_medicao where contrato_id = p_contrato and numero <= coalesce(v_ate, 0)
  ), tot as (
    select round((select sum(valor_previsto) from linhas where tipo = 'servico'), 2) as prev,
           round(coalesce((select sum(valor_n) from por_item), 0), 2) as vn,
           round(coalesce((select sum(acumulado) from por_item), 0), 2) as ac,
           (select reaj_n from rm) as rn, (select reaj_ac from rm) as rac
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
        'valor', t.valor::text,
        'reajuste', case when v_valor then rv.total::text end,
        'reajuste_situacao', rv.situacao) order by m.numero)
      from public.mc_medicoes m join public.mc_v_medicao_totais t on t.medicao_id = m.id
      left join public.mc_v_reajuste_medicao rv on rv.medicao_id = m.id
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
        'pct_a_medir', case when v_valor and x.prev <> 0 then ((x.prev - x.ac) / x.prev)::text end,
        'reajuste_medicao', case when v_valor then x.rn::text end,
        'reajuste_acumulado', case when v_valor then x.rac::text end)
        order by x.ordem) from valores x), '[]'::jsonb),
    'fora_da_versao', coalesce((select jsonb_agg(jsonb_build_object('item_id', f.item_id, 'codigo', f.codigo,
        'descricao', f.descricao, 'unidade', f.unidade, 'qtds', coalesce(f.qtds, '{}'::jsonb),
        'valor_medicao', case when v_valor then round(f.valor_n, 2)::text end,
        'acumulado', case when v_valor then round(f.acumulado, 2)::text end,
        'reajuste_medicao', case when v_valor then f.reaj_n::text end,
        'reajuste_acumulado', case when v_valor then f.reaj_ac::text end) order by f.codigo)
      from fora f), '[]'::jsonb),
    'total', (select jsonb_build_object(
        'previsto', case when v_valor then coalesce(t.prev, 0)::text end,
        'valor_medicao', case when v_valor then t.vn::text end,
        'acumulado', case when v_valor then t.ac::text end,
        'saldo', case when v_valor then (coalesce(t.prev, 0) - t.ac)::text end,
        'pct_executado', case when v_valor and coalesce(t.prev, 0) <> 0 then (t.ac / t.prev)::text end,
        'pct_a_medir', case when v_valor and coalesce(t.prev, 0) <> 0 then ((t.prev - t.ac) / t.prev)::text end,
        'reajuste_medicao', case when v_valor then t.rn::text end,
        'reajuste_acumulado', case when v_valor then t.rac::text end)
      from tot t))
  into v_res;
  return v_res;
end $function$;

-- fn_mc_painel: corpo vivo de 02/10/2026 (md5 bb9df460fb014b48c2e69593edb0dc83) mais
-- 'reajuste_acumulado' por contrato (soma do total que vale em cada medição) e no total.
CREATE OR REPLACE FUNCTION public.fn_mc_painel(p_status text[] DEFAULT NULL::text[], p_tipos text[] DEFAULT NULL::text[])
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE
 SET search_path TO ''
AS $function$
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
  ), rj as (
    select r.contrato_id, sum(r.total) as reajuste from public.mc_v_reajuste_medicao r join c on c.id = r.contrato_id
    group by r.contrato_id
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
           case when c.regra_arredondamento is not null then coalesce(rj.reajuste, 0) end as reajuste_acumulado,
           coalesce(qtd.medicoes, 0) as medicoes,
           ult.numero as corrente_numero, ult.status as corrente_status, ult.periodo_inicio, ult.periodo_fim,
           case when c.regra_arredondamento is not null then ult.valor end as corrente_valor
    from c
    left join v on v.contrato_id = c.id
    left join public.mc_v_versao_totais vt on vt.versao_id = v.id
    left join ac on ac.contrato_id = c.id
    left join rj on rj.contrato_id = c.id
    left join ult on ult.contrato_id = c.id
    left join qtd on qtd.contrato_id = c.id
  )
  select jsonb_build_object(
    'contratos', coalesce(jsonb_agg(jsonb_build_object('id', l.id, 'codigo', l.codigo, 'nome_obra', l.nome_obra,
        'contratante_nome', l.contratante_nome, 'contratante_tipo', l.contratante_tipo, 'status', l.status,
        'versao_numero', l.versao_numero, 'previsto', l.previsto::text, 'acumulado', l.acumulado::text,
        'saldo', (l.previsto - l.acumulado)::text,
        'pct_executado', case when l.previsto <> 0 then (l.acumulado / l.previsto)::text end,
        'reajuste_acumulado', l.reajuste_acumulado::text,
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
        'corrente', coalesce(sum(l.corrente_valor) filter (where l.tem_valor), 0)::text,
        'reajuste_acumulado', coalesce(sum(l.reajuste_acumulado) filter (where l.tem_valor), 0)::text))
  into v_res from l;
  return v_res;
end $function$;

-- ------------------------------------------------------------------ alertas
-- Definição viva de 02/10/2026 (pg_get_viewdef) mais dois tipos da Fase 6:
--   medicao_sem_reajuste: contrato com reajuste, medição aprovada com início do período a partir de
--     data_base + periodicidade_meses e sem relatório que valha. valor = nº da medição,
--     referencia = data do aniversário (yyyy-mm-dd), data = início do período.
--   reajuste_provisorio: o relatório que vale na medição é provisório. valor = nº da medição,
--     referencia = total do reajuste, data = início do período.
-- "Índice provisório" e "item sem índice" da Fase 5 deixam de existir: o módulo não tem índice.
create or replace view public.mc_v_alertas with (security_invoker = true) as
with c as (
  select * from public.mc_contratos where excluido_em is null
), vig as (
  select distinct on (v.contrato_id) v.contrato_id, v.id as versao_id, v.numero
    from public.mc_planilha_versoes v join c on c.id = v.contrato_id
   where v.status = 'vigente' and v.excluido_em is null order by v.contrato_id, v.numero desc
), v0 as (
  select v.contrato_id, t.total_previsto from public.mc_planilha_versoes v join public.mc_v_versao_totais t on t.versao_id = v.id
   where v.numero = 0 and v.status = 'vigente' and v.excluido_em is null
), acum as (
  select contrato_id, round(sum(valor_acumulado_exato), 2) as valor from public.mc_v_item_acumulado group by contrato_id
), fim as (
  select c.id as contrato_id,
         (coalesce(case when c.inicio_prazo = 'ordem_servico' then c.data_ordem_servico end, c.data_assinatura)
          + make_interval(months => c.prazo_meses + coalesce((select sum(a.prazo_acrescido_meses) from public.mc_aditivos a
                                                              where a.contrato_id = c.id and a.excluido_em is null), 0)::int))::date as fim_prazo
    from c
), aniv as (
  select rc.contrato_id, (rc.data_base + make_interval(months => rc.periodicidade_meses))::date as aniversario
    from public.mc_reajuste_config rc join c on c.id = rc.contrato_id
   where rc.tem_reajuste and rc.data_base is not null
)
select c.id as contrato_id, c.codigo, 'acumulado_acima_previsto'::text as tipo, 'alta'::text as gravidade, pi.item_id,
       pi.codigo as item_codigo, pi.unidade, a.qtd_acumulada::text as valor, pi.quantidade_prevista::text as referencia,
       null::date as data,
       exists (select 1 from public.mc_lancamentos l where l.contrato_id = c.id and l.item_id = pi.item_id
               and l.excluido_em is null and l.motivo_excesso is not null) as com_motivo
  from c join vig on vig.contrato_id = c.id
  join public.mc_planilha_itens pi on pi.versao_id = vig.versao_id and pi.tipo = 'servico'
  join public.mc_v_item_acumulado a on a.contrato_id = c.id and a.item_id = pi.item_id
 where a.qtd_acumulada > pi.quantidade_prevista
union all
select c.id, c.codigo, 'prazo_perto_do_fim', case when f.fim_prazo < current_date then 'alta' else 'media' end, null, null, null,
       (f.fim_prazo - current_date)::text, c.alerta_prazo_dias::text, f.fim_prazo, false
  from c join fim f on f.contrato_id = c.id
 where c.status = 'ativo' and f.fim_prazo is not null and f.fim_prazo - current_date <= c.alerta_prazo_dias
union all
select c.id, c.codigo, 'valor_perto_do_previsto', 'media', null, null, null,
       round(ac.valor / t.total_previsto * 100, 2)::text, c.alerta_valor_pct::text, null, false
  from c join vig on vig.contrato_id = c.id join public.mc_v_versao_totais t on t.versao_id = vig.versao_id
  join acum ac on ac.contrato_id = c.id
 where c.regra_arredondamento is not null and t.total_previsto > 0 and ac.valor / t.total_previsto * 100 >= c.alerta_valor_pct
union all
select c.id, c.codigo, 'valor_contrato_diferente', 'baixa', null, null, null,
       c.valor_inicial::text, v0.total_previsto::text, null, false
  from c join v0 on v0.contrato_id = c.id
 where c.valor_inicial is not null and v0.total_previsto is not null and c.valor_inicial <> v0.total_previsto
union all
select c.id, c.codigo, 'medicao_sem_reajuste', 'media', null, null, null,
       m.numero::text, an.aniversario::text, m.periodo_inicio, false
  from c join aniv an on an.contrato_id = c.id
  join public.mc_medicoes m on m.contrato_id = c.id and m.status = 'aprovada' and m.periodo_inicio >= an.aniversario
 where not exists (select 1 from public.mc_v_reajuste_medicao rv where rv.medicao_id = m.id)
union all
select c.id, c.codigo, 'reajuste_provisorio', 'baixa', null, null, null,
       rv.numero::text, rv.total::text, m.periodo_inicio, false
  from c join public.mc_v_reajuste_medicao rv on rv.contrato_id = c.id
  join public.mc_medicoes m on m.id = rv.medicao_id
 where rv.situacao = 'provisorio';
revoke all on public.mc_v_alertas from anon, authenticated;
grant select on public.mc_v_alertas to authenticated;

-- ------------------------------------------------------------------ grants
revoke all on function public.fn_mc_ratear(numeric, uuid[], numeric[]) from public, anon, authenticated;
revoke all on function public.fn_mc_brl(numeric) from public, anon, authenticated;
revoke all on function public.fn_mc_trava_reajuste() from public, anon, authenticated;
revoke all on function public.fn_mc_trava_reajuste_filho() from public, anon, authenticated;
do $g$
declare f text;
begin
  foreach f in array array['fn_mc_reajuste_importar(uuid, jsonb, boolean)', 'fn_mc_reajuste_manual(uuid, jsonb)',
                           'fn_mc_reajuste_excluir(uuid, text)', 'fn_mc_reajuste_config_salvar(uuid, jsonb)'] loop
    execute format('revoke all on function public.%s from public, anon', f);
    execute format('grant execute on function public.%s to authenticated', f);
  end loop;
end $g$;
```

- [ ] **Step 4:** aplicar por `apply_migration` (nome `mc_fase6a_reajuste`), ler a versão real em `supabase_migrations.schema_migrations`, salvar o arquivo com essa versão e conferir o md5 do texto; advisors (segurança e desempenho) sem aviso novo.
- [ ] **Step 5:** prova verde (todas as chaves "OK" ou "recusou: ..." esperadas, `6z` "DIFERENTE (esperado)"). Mutação: na transação, recriar `fn_mc_ratear` dando a sobra para o item de MENOR peso; `6f` (10,01 → 7,50 / 2,51) e `6b` têm de sair DIFERENTE. Rodar de novo as provas `mc_fase5_banco.sql` e `mc_fase4_banco.sql`: verdes.
- [ ] **Step 6:** `src/lib/database.types.ts` (blocos novos, gerados por `generate_typescript_types` e colados só no que mudou) e commit `Medição Fase 6a: reajuste do DNIT no banco (aplicada) + prova`.

### Task 2: Recurso, permissões e anexo

**Files:**
- Modify: `src/config/recursos.ts`, `src/modules/medicao/_shared/recursos.test.ts`, `src/modules/_shared/anexos/entidades.ts`, `src/modules/_shared/anexos/entidades.test.ts`
- Create: `supabase/migrations/<versão real>_mc_fase6b_permissoes.sql`

**Interfaces:**
- Produces `{ id: "medicao.reajuste", nome: "Reajuste", modulo: "medicao", rota: "/medicao/reajuste", acoes: ["ver", "editar"] }` entre Medições e Boletim (E3), e a entidade de anexo `mc_reajuste` → `medicao.reajuste` com rótulo "relatório de reajuste".

- [ ] `recursos.test.ts`: a ordem passa a ser Painel, Contratos, Planilha, Lançamentos, Medições, **Reajuste**, Boletim, Alertas, com `["medicao.reajuste", ["ver", "editar"]]`. `entidades.test.ts`: `recursoDaEntidade("mc_reajuste")` = `medicao.reajuste` e o rótulo. RED, depois o código.
- [ ] Migration no molde de `20261001223847_mc_fase5b_permissoes.sql`:

```sql
-- Medição de Contratos, Fase 6b: os 4 Admins ativos ganham ver e editar em Reajuste (importar o
-- relatório SIAC, lançar sem relatório, excluir relatório e configurar o reajuste do contrato).

with acoes(recurso, acao) as (values
  ('medicao.reajuste', 'ver'),
  ('medicao.reajuste', 'editar')
)
insert into public.perfil_permissoes (perfil_id, recurso, acao)
select p.id, a.recurso, a.acao from public.perfis p cross join acoes a where p.nome = 'Admin'
on conflict (perfil_id, recurso, acao) do nothing;

with acoes(recurso, acao) as (values
  ('medicao.reajuste', 'ver'),
  ('medicao.reajuste', 'editar')
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
  if v <> 92 then raise exception 'Esperado 92 permissões de medição (23 x 4 Admins), veio %', v; end if;
end $confere$;
```

- [ ] Pré-conferência por `execute_sql`: 84 linhas `medicao.%` em 4 usuários. Aplicar (`mc_fase6b_permissoes`), versão real, md5, advisors; conferir 92 / 4. A prova da Task 1 continua verde (as permissões que ela insere já existem: `on conflict do nothing` no insert da prova).
- [ ] Commit `Medição Fase 6b: permissões do reajuste e anexo do relatório`.

### Task 3: Leitor do relatório SIAC (PDF)

**Files:**
- Modify: `package.json`, `package-lock.json` (`npm i unpdf@1.8.1`), `next.config.ts` (`serverExternalPackages: ["pdfmake", "unpdf"]`, com uma linha no comentário: o pdf.js do unpdf carrega o worker por import dinâmico e não deve ser empacotado)
- Create: `src/modules/medicao/reajuste/siac/__fixtures__/siac-l09-4a.pdf` (cópia do PDF real, 69.388 bytes: `cp "/Users/tiagocameli/Library/Application Support/Claude/local-agent-mode-sessions/9c968b31-df29-4586-88ee-b5c1852bff83/ecede4ed-9da9-4f4b-a646-2ab6c4ad1973/local_b9d57a1c-636a-4e6b-8a6f-435b18ce4462/uploads/rel_resumo_medicoes.pdf" src/modules/medicao/reajuste/siac/__fixtures__/siac-l09-4a.pdf`)
- Create: `src/modules/medicao/reajuste/siac/extrair.ts`, `ler-relatorio.ts`, `ler-relatorio.test.ts`, `para-banco.ts`, `para-banco.test.ts`

**Interfaces:**
- Produces `extrairTextoPdf(bytes: Uint8Array): Promise<PedacoTexto[][]>` (servidor), `lerRelatorioSiac(paginas): RelatorioSiac` (lança `ErroRelatorioSiac` com a mensagem pt-BR), `conferirRelatorio(r): string[]`, `numeroSiac(texto): string`, `relatorioParaBanco(r, escolhas, arquivoId)` (o `p_relatorio` da RPC) e o tipo `Escolhas = Record<"grupo|codigo", {itens: string[]; destino: string | null}>`.

O método de leitura foi provado num script descartável antes deste plano: `unpdf` 1.8.1 tira do PDF real o mesmo texto que o `pdftotext -layout`, com a posição de cada pedaço; a página é landscape girada 90°, e `viewport.convertToViewportPoint` devolve x para a direita e y para baixo. As linhas da tabela saem agrupando por y (±2,5 pt); os 7 números de uma linha de serviço saem na ordem do x, então não é preciso fronteira de coluna (o grupo 3,5 tem o valor a PI líquido deslocado na impressão e mesmo assim sai certo). O código abaixo passou com `tsc --strict` e vitest no ambiente node.

- [ ] **Step 1:** copiar o PDF e escrever `ler-relatorio.test.ts` (RED: o módulo não existe):

```ts
// @vitest-environment node
import { readFile } from "node:fs/promises";
import path from "node:path";

import { beforeAll, describe, expect, it } from "vitest";

import { extrairTextoPdf } from "./extrair";
import { conferirRelatorio, ErroRelatorioSiac, lerRelatorioSiac, numeroSiac, type PedacoTexto, type RelatorioSiac } from "./ler-relatorio";

/** PDF real do SIAC: 4ª medição do L09 (CT 00615/2025), processado em 19/03/2026. */
const PDF = path.join(__dirname, "__fixtures__", "siac-l09-4a.pdf");

// grupo, código SICRO, unidade, valor a PI líquido, fator, reajuste (todas as 45 linhas, na ordem do PDF)
const LINHAS: [string, string, string, string, string, string][] = [
  ["1,0", "55072", "MES", "4759.76", "0.0445", "211.80"],
  ["2,2", "29083", "T", "320.57", "-0.1487", "-47.66"],
  ["2,2", "51269", "M²", "85.46", "0.0148", "1.26"],
  ["2,2", "60112", "T", "6138.18", "-0.1763", "-1082.16"],
  ["2,2", "86522", "M³", "136.85", "0.0148", "2.02"],
  ["2,2", "90224", "M³", "1202.56", "0.0073", "8.77"],
  ["2,2", "93793", "M³", "7100.28", "0.0073", "51.83"],
  ["2,2", "200134", "T", "211.64", "0.0148", "3.13"],
  ["2,2", "201005", "T", "2716.26", "0.0148", "40.20"],
  ["2,2", "290300", "M³", "2954.53", "0.0148", "43.72"],
  ["2,2", "322022", "M²", "63.54", "0.0148", "0.94"],
  ["2,2", "517556", "T", "7669.29", "0.0148", "113.50"],
  ["2,2", "517557", "M³", "21984.55", "0.0148", "325.37"],
  ["2,2", "517560", "M³", "47137.21", "0.0073", "344.10"],
  ["2,2", "6011205", "L", "25.15", "0.0148", "0.37"],
  ["2,5", "49299", "T/KM", "2419.26", "0.0445", "107.65"],
  ["2,5", "49401", "T/KM", "170.04", "0.0445", "7.56"],
  ["2,5", "517573", "T/KM", "115555.33", "0.0445", "5142.21"],
  ["3,3", "86324", "M²", "0.00", "0.0073", "0.00"],
  ["3,3", "92446", "M", "0.00", "0.0389", "0.00"],
  ["3,5", "49321", "H", "5928.96", "0.0155", "91.89"],
  ["3,5", "91396", "UN/DIA", "147.85", "0.0155", "2.29"],
  ["3,5", "91826", "UN/DIA", "289.02", "0.0155", "4.47"],
  ["3,5", "517521", "M²", "9797.23", "0.0155", "151.85"],
  ["3,6", "517557", "M³", "0.00", "0.0148", "0.00"],
  ["3,6", "517560", "M³", "0.00", "0.0073", "0.00"],
  ["3,7", "49299", "T/KM", "0.00", "0.0445", "0.00"],
  ["3,7", "517573", "T/KM", "0.00", "0.0445", "0.00"],
  ["4,0", "29083", "T", "28278.31", "-0.1487", "-4204.98"],
  ["4,0", "55025", "M³", "107705.68", "0.0445", "4792.90"],
  ["4,0", "60112", "T", "539026.36", "-0.1763", "-95030.34"],
  ["4,0", "200134", "T", "18669.65", "0.0148", "276.31"],
  ["4,0", "201005", "T", "238529.31", "0.0148", "3530.23"],
  ["4,0", "322022", "M²", "5595.77", "0.0148", "82.81"],
  ["4,0", "517555", "T", "648424.49", "0.0148", "9596.68"],
  ["4,0", "6011205", "L", "2119.46", "0.0148", "31.36"],
  ["4,1", "49299", "T/KM", "45666.57", "0.0445", "2032.16"],
  ["4,1", "517573", "T/KM", "676664.24", "0.0445", "30111.55"],
  ["7,0", "51837", "UND", "0.00", "0.0581", "0.00"],
  ["7,0", "52482", "UND", "3959.97", "-0.0085", "-33.65"],
  ["7,0", "517561", "M²", "0.00", "0.0581", "0.00"],
  ["7,0", "517562", "M²", "0.00", "0.0581", "0.00"],
  ["7,1", "49401", "T/KM", "0.00", "0.0445", "0.00"],
  ["7,1", "517573", "T/KM", "0.00", "0.0445", "0.00"],
  ["8,0", "49408", "%", "64852.93", "0.0504", "3268.58"],
];

// grupo, linhas, SUBTOTAL valor a PI acumulado, líquido, reajuste
const GRUPOS: [string, number, string, string, string][] = [
  ["1,0", 1, "59761.51", "4759.76", "211.80"],
  ["2,2", 14, "97746.07", "97746.07", "-194.61"],
  ["2,5", 3, "118144.63", "118144.63", "5257.42"],
  ["3,3", 2, "15206.15", "0.00", "0.00"],
  ["3,5", 4, "33561.59", "16163.06", "250.50"],
  ["3,6", 2, "1799269.66", "0.00", "0.00"],
  ["3,7", 2, "2588470.65", "0.00", "0.00"],
  ["4,0", 8, "3219773.37", "1588349.03", "-80925.03"],
  ["4,1", 2, "1464247.65", "722330.81", "32143.71"],
  ["7,0", 4, "917027.66", "3959.97", "-33.65"],
  ["7,1", 2, "107186.08", "0.00", "0.00"],
  ["8,0", 1, "261358.52", "64852.93", "3268.58"],
];

let paginas: PedacoTexto[][];
let relatorio: RelatorioSiac;

beforeAll(async () => {
  paginas = await extrairTextoPdf(new Uint8Array(await readFile(PDF)));
  relatorio = lerRelatorioSiac(paginas);
});

describe("relatório SIAC real (4ª do L09)", () => {
  it("lê as 3 páginas e o cabeçalho", () => {
    expect(paginas).toHaveLength(3);
    expect(relatorio.cabecalho).toEqual({
      contratoTexto: "24 00615/2025 - CONSÓRCIO EMT-COLORADO I",
      medicaoNumero: 4,
      medicaoTipo: "PROVISÓRIA",
      situacao: "definitivo",
      periodoInicio: "2026-02-01",
      periodoFim: "2026-02-28",
      dataBase: "2025-01-01",
      processadoEm: "2026-03-19",
    });
  });

  it("lê os 14 índices, cada um uma vez (as páginas repetem a tabela)", () => {
    expect(relatorio.indices.map((i) => i.sigla)).toEqual([
      "ADLOC", "ASFDIL", "CAPT", "CONSER", "DRENAG", "EMUL", "EMUMOD", "INCC", "ISAOAE", "MOB", "OAE-SA", "OCMA", "PAVIM", "SIN-H",
    ]);
    expect(relatorio.indices.find((i) => i.sigla === "CAPT")).toEqual({ sigla: "CAPT", i0: "1086.06", i1: "894.632", k: "-0.1763" });
    expect(relatorio.indices.find((i) => i.sigla === "ASFDIL")).toEqual({ sigla: "ASFDIL", i0: "1032.86", i1: "0.000", k: "-1.0000" });
    expect(relatorio.indices.find((i) => i.sigla === "INCC")).toEqual({ sigla: "INCC", i0: "1169.11", i1: "1237.03", k: "0.0581" });
  });

  it("lê as 45 linhas na ordem, com grupo, código, unidade, valor a PI líquido, fator e reajuste", () => {
    expect(relatorio.linhas.map((l) => [l.grupo, l.codigo, l.unidade, l.valorPiLiquido, l.fator, l.reajuste])).toEqual(LINHAS);
    expect(relatorio.linhas.filter((l) => l.valorPiLiquido !== "0.00")).toHaveLength(34);
  });

  it("junta a descrição de várias linhas, inclusive a que passa para a página seguinte", () => {
    const porChave = new Map(relatorio.linhas.map((l) => [`${l.grupo}|${l.codigo}`, l]));
    expect(porChave.get("2,2|93793")?.descricao).toBe(
      "ENROCAMENTO DE PEDRA ESPALHADA E COMPACTADA MECANICAMENTE - PEDRA DE MÃO COMERCIAL - FORNECIMENTO E ASSENTAMENTO",
    );
    expect(porChave.get("3,3|92446")?.descricao).toBe("TUBO PEAD PARA DRENAGEM - D = 400 MM - FORNECIMENTO E INSTALAÇÃO");
    expect(porChave.get("4,0|60112")).toMatchObject({
      descricao: "AQUISIÇÃO DE CAP 50/70",
      precoUnitario: "5641.7149",
      quantidadeAcumulada: "193.677",
      valorPiAcumulado: "1092670.40",
    });
    expect(porChave.get("3,7|517573")?.quantidadeAcumulada).toBe("3530768.7");
  });

  it("lê os 12 grupos com SUBTOTAL e a SOMA: -40.021,28 sobre 2.616.306,26", () => {
    expect(relatorio.grupos.map((g) => [g.grupo, g.linhas.length, g.subtotal.valorPiAcumulado, g.subtotal.valorPiLiquido, g.subtotal.reajuste])).toEqual(GRUPOS);
    expect(relatorio.grupos[1].descricao).toBe("CONSERVAÇÃO CORRETIVA DE PASSIVO EXISTENTE - REPARO PROFUNDO");
    expect(relatorio.soma).toEqual({ valorPiAcumulado: "10681753.54", valorPiLiquido: "2616306.26", reajuste: "-40021.28" });
  });

  it("as linhas somam os SUBTOTAIS e os SUBTOTAIS somam a SOMA", () => {
    expect(conferirRelatorio(relatorio)).toEqual([]);
  });

  it("aponta linha que não soma o SUBTOTAL e SUBTOTAL que não soma a SOMA", () => {
    const errado = structuredClone(relatorio);
    errado.grupos[7].linhas[2].reajuste = "-95030.35";
    errado.grupos[0].subtotal.reajuste = "211.81";
    expect(conferirRelatorio(errado)).toEqual([
      "Grupo 1,0: as linhas somam 211,80 de reajuste e o SUBTOTAL diz 211,81",
      "Grupo 4,0: as linhas somam -80.925,04 de reajuste e o SUBTOTAL diz -80.925,03",
      "Os SUBTOTAIS somam -40.021,27 de reajuste e a SOMA diz -40.021,28",
    ]);
  });
});

describe("numeroSiac e recusas", () => {
  it("troca o formato pt-BR pelo do banco sem passar por float", () => {
    expect(numeroSiac("1.092.670,40")).toBe("1092670.40");
    expect(numeroSiac("-95.030,34")).toBe("-95030.34");
    expect(numeroSiac("0,0073")).toBe("0.0073");
    expect(numeroSiac("3.530.768,7")).toBe("3530768.7");
    expect(() => numeroSiac("1.23,4")).toThrow(ErroRelatorioSiac);
  });

  it("recusa PDF que não é o Resumo da Medição", () => {
    expect(() => lerRelatorioSiac([[{ texto: "NOTA FISCAL", x: 30, y: 30 }]])).toThrow(
      "A página 1 não tem a tabela do Resumo da Medição. Este PDF é o relatório SIAC?",
    );
  });
});
```

- [ ] **Step 2:** `npm i unpdf@1.8.1`; `extrair.ts`:

```ts
import "server-only";

import { getDocumentProxy } from "unpdf";

import type { PedacoTexto } from "./ler-relatorio";

/**
 * Texto do PDF com a posição de cada pedaço, página a página (unpdf = pdf.js para servidor, roda na
 * Vercel sem binário). A posição passa pelo viewport da página, então a rotação (o relatório SIAC é
 * landscape girado 90°) já vem aplicada: x cresce para a direita e y para baixo. O pdf.js repete
 * alguns pedaços (a sigla da tabela de índices sai duas vezes): o repetido no mesmo lugar é descartado.
 */
export async function extrairTextoPdf(bytes: Uint8Array): Promise<PedacoTexto[][]> {
  const pdf = await getDocumentProxy(bytes);
  try {
    const paginas: PedacoTexto[][] = [];
    for (let n = 1; n <= pdf.numPages; n++) {
      const pagina = await pdf.getPage(n);
      const viewport = pagina.getViewport({ scale: 1 });
      const conteudo = await pagina.getTextContent();
      const vistos = new Set<string>();
      const pedacos: PedacoTexto[] = [];
      for (const item of conteudo.items) {
        if (!("str" in item) || item.str.trim() === "") continue;
        const [x, y] = viewport.convertToViewportPoint(item.transform[4], item.transform[5]);
        const chave = `${item.str}|${Math.round(x)}|${Math.round(y)}`;
        if (vistos.has(chave)) continue;
        vistos.add(chave);
        pedacos.push({ texto: item.str.trim(), x, y });
      }
      paginas.push(pedacos);
    }
    return paginas;
  } finally {
    await pdf.cleanup();
  }
}
```

- [ ] **Step 3:** `ler-relatorio.ts`:

```ts
import { comparar, lerDecimal, somar, type Decimal } from "@/modules/medicao/_shared/decimal";

/**
 * Leitor do relatório SIAC "Resumo da Medição" do DNIT (Fase 6). Recebe os pedaços de texto de cada
 * página com a posição (x, y em pontos, origem no canto de cima à esquerda, já com a rotação da
 * página aplicada: `extrair.ts`) e devolve cabeçalho, tabela de índices, grupos com SUBTOTAL, linhas
 * e a SOMA. Números saem como TEXTO no formato do banco ("-1082.16"), sem passar por float (D7).
 *
 * Formato conferido no PDF real da 4ª do L09 (3 páginas, landscape girado 90°):
 * - toda página repete o cabeçalho (CONTRATO, Data Base, Período Líquido, título "4ª MEDIÇÃO ... -
 *   ÍNDICES ...", "Processado dd/mm/aaaa") e a tabela de índices (sigla, I0, I1, K, duas por linha);
 * - a tabela começa na linha que tem "Serviço"; as duas linhas seguintes do cabeçalho da tabela
 *   ("Código ... Preço ...", "SICRO ... Líquido") são puladas;
 * - grupo: "2,2 - CONSERVAÇÃO ..."; linha: código SICRO (só dígitos, x < 60), descrição (uma ou mais
 *   linhas), "Não"/"Sim", unidade e 7 números (preço, quantidade acumulada, valor a PI acumulado,
 *   valor a PI líquido, fator, reajustamento líquido, ajuste contratual líquido);
 * - a descrição pode continuar na linha de baixo e até na página seguinte (3,3 / 92446);
 * - "SUBTOTAL" (4 números: acumulado, líquido, reajuste, ajuste), "SOMA" (os mesmos 4), "A DEDUZIR",
 *   "LÍQUIDO À PAGAR" e o rodapé "Solicitado por ...".
 */

export interface PedacoTexto {
  texto: string;
  x: number;
  y: number;
}

export interface IndiceSiac {
  sigla: string;
  i0: string;
  i1: string;
  k: string;
}

export interface LinhaSiac {
  grupo: string;
  codigo: string;
  descricao: string;
  unidade: string;
  precoUnitario: string;
  quantidadeAcumulada: string;
  valorPiAcumulado: string;
  valorPiLiquido: string;
  fator: string;
  reajuste: string;
}

export interface SomaSiac {
  valorPiAcumulado: string;
  valorPiLiquido: string;
  reajuste: string;
}

export interface GrupoSiac {
  grupo: string;
  descricao: string;
  subtotal: SomaSiac;
  linhas: LinhaSiac[];
}

export interface CabecalhoSiac {
  /** O texto inteiro depois de "CONTRATO:", ex.: "24 00615/2025 - CONSÓRCIO EMT-COLORADO I". */
  contratoTexto: string;
  medicaoNumero: number;
  /** "PROVISÓRIA", "FINAL"...: o que vem entre "MEDIÇÃO" e "- ÍNDICES". */
  medicaoTipo: string;
  /** Situação dos ÍNDICES do relatório. */
  situacao: "provisorio" | "definitivo";
  /** yyyy-mm-dd */
  periodoInicio: string;
  periodoFim: string;
  dataBase: string;
  processadoEm: string | null;
}

export interface RelatorioSiac {
  cabecalho: CabecalhoSiac;
  indices: IndiceSiac[];
  grupos: GrupoSiac[];
  linhas: LinhaSiac[];
  soma: SomaSiac;
}

export class ErroRelatorioSiac extends Error {}

const NUMERO = /^-?(\d{1,3}(\.\d{3})+|\d+)(,\d+)?$/;
const TITULO = /^(\d+)ª MEDIÇÃO (.+) - ÍNDICES (PROVISÓRIOS|DEFINITIVOS)$/;
const GRUPO = /^(\d+,\d+) - (.+)$/;
const SIGLA = /^[A-Z][A-Z0-9-]*$/;
const PERIODO = /^(\d{2})\/(\d{2})\/(\d{4}) - (\d{2})\/(\d{2})\/(\d{4})$/;
const DATA = /^(\d{2})\/(\d{2})\/(\d{4})$/;

/** "1.234,56" -> "1234.56"; "-0,1763" -> "-0.1763". Texto que não é número pt-BR é recusado. */
export function numeroSiac(texto: string): string {
  if (!NUMERO.test(texto)) throw new ErroRelatorioSiac(`Número inválido no relatório: "${texto}"`);
  return texto.replace(/\./g, "").replace(",", ".");
}

function dataIso(texto: string | undefined): string {
  const m = texto ? DATA.exec(texto) : null;
  if (!m) throw new ErroRelatorioSiac(`Data inválida no cabeçalho do relatório: "${texto ?? ""}"`);
  return `${m[3]}-${m[2]}-${m[1]}`;
}

interface Linha {
  y: number;
  pedacos: PedacoTexto[];
}

/** Junta os pedaços da mesma altura (tolerância 2,5 pt) e ordena cada linha da esquerda para a direita. */
export function agruparLinhas(pedacos: PedacoTexto[], tolerancia = 2.5): Linha[] {
  const ordenados = [...pedacos].sort((a, b) => a.y - b.y || a.x - b.x);
  const linhas: Linha[] = [];
  for (const p of ordenados) {
    const ultima = linhas[linhas.length - 1];
    if (ultima && Math.abs(p.y - ultima.y) <= tolerancia) ultima.pedacos.push(p);
    else linhas.push({ y: p.y, pedacos: [p] });
  }
  for (const l of linhas) l.pedacos.sort((a, b) => a.x - b.x);
  return linhas;
}

function soma(textos: string[], onde: string): SomaSiac {
  if (textos.length !== 4) throw new ErroRelatorioSiac(`${onde} com ${textos.length} números (esperado 4)`);
  const [valorPiAcumulado, valorPiLiquido, reajuste] = textos.map(numeroSiac);
  return { valorPiAcumulado, valorPiLiquido, reajuste };
}

const IGNORAR = ["A DEDUZIR", "LÍQUIDO À PAGAR", "OS SERVIÇOS OBJETOS", "(*)"];
const CABECALHO_TABELA = new Set(["Código", "SICRO", "Preço", "Unitário"]);

export function lerRelatorioSiac(paginas: PedacoTexto[][]): RelatorioSiac {
  if (paginas.length === 0) throw new ErroRelatorioSiac("O PDF não tem páginas");
  const cab: Partial<CabecalhoSiac> = {};
  const indices = new Map<string, IndiceSiac>();
  const grupos: GrupoSiac[] = [];
  const linhas: LinhaSiac[] = [];
  let grupo: GrupoSiac | null = null;
  let ultima: LinhaSiac | null = null;
  let somaFinal: SomaSiac | null = null;

  paginas.forEach((pedacos, p) => {
    const ls = agruparLinhas(pedacos);
    const inicio = ls.findIndex((l) => l.pedacos.some((x) => x.texto === "Serviço"));
    if (inicio < 0) throw new ErroRelatorioSiac(`A página ${p + 1} não tem a tabela do Resumo da Medição. Este PDF é o relatório SIAC?`);

    for (const l of ls.slice(0, inicio)) {
      const t = l.pedacos.map((x) => x.texto);
      for (let k = 0; k < t.length; k++) {
        if (p === 0) {
          if (t[k] === "CONTRATO:") cab.contratoTexto = t[k + 1];
          if (t[k] === "Data Base:") cab.dataBase = dataIso(t[k + 1]);
          if (t[k] === "Processado") cab.processadoEm = dataIso(t[k + 1]);
          if (t[k] === "Período Líquido:") {
            const m = PERIODO.exec(t[k + 1] ?? "");
            if (!m) throw new ErroRelatorioSiac(`Período líquido inválido: "${t[k + 1] ?? ""}"`);
            cab.periodoInicio = `${m[3]}-${m[2]}-${m[1]}`;
            cab.periodoFim = `${m[6]}-${m[5]}-${m[4]}`;
          }
          const titulo = TITULO.exec(t[k]);
          if (titulo) {
            cab.medicaoNumero = Number.parseInt(titulo[1], 10);
            cab.medicaoTipo = titulo[2];
            cab.situacao = titulo[3] === "DEFINITIVOS" ? "definitivo" : "provisorio";
          }
        }
        if (SIGLA.test(t[k]) && [1, 2, 3].every((d) => NUMERO.test(t[k + d] ?? ""))) {
          indices.set(t[k], { sigla: t[k], i0: numeroSiac(t[k + 1]), i1: numeroSiac(t[k + 2]), k: numeroSiac(t[k + 3]) });
          k += 3;
        }
      }
    }

    for (const l of ls.slice(inicio + 1)) {
      const t = l.pedacos.map((x) => x.texto);
      if (t[0].startsWith("Solicitado por")) continue;
      if (t.some((x) => CABECALHO_TABELA.has(x))) continue;
      if (IGNORAR.some((i) => t[0].startsWith(i))) continue;

      const g = GRUPO.exec(t[0]);
      if (g) {
        grupo = { grupo: g[1], descricao: g[2], subtotal: { valorPiAcumulado: "0", valorPiLiquido: "0", reajuste: "0" }, linhas: [] };
        grupos.push(grupo);
        ultima = null;
        continue;
      }
      if (t[0] === "SUBTOTAL") {
        if (!grupo) throw new ErroRelatorioSiac("SUBTOTAL antes do primeiro grupo");
        grupo.subtotal = soma(t.slice(1), `SUBTOTAL do grupo ${grupo.grupo}`);
        ultima = null;
        continue;
      }
      if (t[0] === "SOMA") {
        somaFinal = soma(t.slice(1), "SOMA");
        continue;
      }
      if (/^\d+$/.test(t[0]) && l.pedacos[0].x < 60) {
        const iFlag = t.findIndex((x, k) => k > 0 && (x === "Não" || x === "Sim"));
        const numeros = iFlag < 0 ? [] : t.slice(iFlag + 2);
        if (!grupo || iFlag < 0 || numeros.length !== 7) {
          throw new ErroRelatorioSiac(`A linha do serviço ${t[0]} (página ${p + 1}) não está no formato do Resumo da Medição`);
        }
        const [precoUnitario, quantidadeAcumulada, valorPiAcumulado, valorPiLiquido, fator, reajuste] = numeros.map(numeroSiac);
        ultima = {
          grupo: grupo.grupo,
          codigo: t[0],
          descricao: t.slice(1, iFlag).join(" "),
          unidade: t[iFlag + 1],
          precoUnitario,
          quantidadeAcumulada,
          valorPiAcumulado,
          valorPiLiquido,
          fator,
          reajuste,
        };
        grupo.linhas.push(ultima);
        linhas.push(ultima);
        continue;
      }
      // Continuação da descrição (inclusive na página seguinte): só texto na coluna da descrição.
      if (ultima && l.pedacos.every((x) => x.x > 60 && x.x < 300)) {
        ultima.descricao = `${ultima.descricao} ${t.join(" ")}`;
        continue;
      }
      throw new ErroRelatorioSiac(`Linha não reconhecida na página ${p + 1}: "${t.join(" ")}"`);
    }
  });

  if (!cab.contratoTexto || !cab.medicaoNumero || !cab.situacao || !cab.periodoInicio || !cab.periodoFim || !cab.dataBase) {
    throw new ErroRelatorioSiac("Cabeçalho do relatório incompleto: contrato, medição, situação dos índices, período ou data-base");
  }
  if (!somaFinal) throw new ErroRelatorioSiac("O relatório não tem a linha SOMA");
  return {
    cabecalho: { processadoEm: null, ...cab } as CabecalhoSiac,
    indices: [...indices.values()],
    grupos,
    linhas,
    soma: somaFinal,
  };
}

function somaDe(textos: string[]): Decimal {
  return textos.reduce((acc, t) => somar(acc, lerDecimal(t)), lerDecimal("0"));
}

function brl(texto: string): string {
  const [i, d = ""] = texto.replace("-", "").split(".");
  const milhar = i.replace(/\B(?=(\d{3})+(?!\d))/g, ".");
  return `${texto.startsWith("-") ? "-" : ""}${milhar},${(d + "00").slice(0, 2)}`;
}

/**
 * Confere as somas do relatório (exatas, BigInt): linhas de cada grupo = SUBTOTAL (valor a PI
 * acumulado, líquido e reajuste) e SUBTOTAIS = SOMA. Devolve as diferenças em pt-BR; vazio = fecha.
 * O banco confere de novo o líquido e o reajuste na gravação.
 */
export function conferirRelatorio(r: RelatorioSiac): string[] {
  const erros: string[] = [];
  const campos: [keyof SomaSiac, string][] = [
    ["valorPiAcumulado", "valor a PI acumulado"],
    ["valorPiLiquido", "valor a PI líquido"],
    ["reajuste", "reajuste"],
  ];
  for (const g of r.grupos) {
    for (const [campo, nome] of campos) {
      const s = somaDe(g.linhas.map((l) => l[campo]));
      if (comparar(s, lerDecimal(g.subtotal[campo])) !== 0) {
        erros.push(`Grupo ${g.grupo}: as linhas somam ${brl(textoDe(s))} de ${nome} e o SUBTOTAL diz ${brl(g.subtotal[campo])}`);
      }
    }
  }
  for (const [campo, nome] of campos) {
    const s = somaDe(r.grupos.map((g) => g.subtotal[campo]));
    if (comparar(s, lerDecimal(r.soma[campo])) !== 0) {
      erros.push(`Os SUBTOTAIS somam ${brl(textoDe(s))} de ${nome} e a SOMA diz ${brl(r.soma[campo])}`);
    }
  }
  return erros;
}

function textoDe(d: Decimal): string {
  const negativo = d.digitos < BigInt(0);
  const s = (negativo ? -d.digitos : d.digitos).toString().padStart(d.escala + 1, "0");
  const corpo = d.escala > 0 ? `${s.slice(0, s.length - d.escala)}.${s.slice(s.length - d.escala)}` : s;
  return negativo ? `-${corpo}` : corpo;
}
```

- [ ] **Step 4:** `para-banco.test.ts` (RED) e `para-banco.ts`:

```ts
// @vitest-environment node
import { readFile } from "node:fs/promises";
import path from "node:path";

import { expect, it } from "vitest";

import { extrairTextoPdf } from "./extrair";
import { lerRelatorioSiac } from "./ler-relatorio";
import { relatorioParaBanco } from "./para-banco";

it("monta o p_relatorio da 4ª do L09 com as 34 linhas de valor e os itens escolhidos", async () => {
  const r = lerRelatorioSiac(await extrairTextoPdf(new Uint8Array(await readFile(path.join(__dirname, "__fixtures__", "siac-l09-4a.pdf")))));
  const item = "11111111-1111-4111-8111-111111111111";
  const p = relatorioParaBanco(r, { "4,0|60112": { itens: [item], destino: null } }, "22222222-2222-4222-8222-222222222222");
  expect(p).toMatchObject({
    contrato_texto: "24 00615/2025 - CONSÓRCIO EMT-COLORADO I", medicao_numero: "4", situacao: "definitivo",
    valor_pi: "2616306.26", total: "-40021.28", arquivo_id: "22222222-2222-4222-8222-222222222222",
  });
  expect(p.linhas).toHaveLength(34);
  expect(p.grupos).toHaveLength(12);
  expect(p.indices).toHaveLength(14);
  expect(p.linhas.find((l) => l.grupo === "4,0" && l.codigo === "60112")).toMatchObject({ valor_pi: "539026.36", reajuste: "-95030.34", itens: [item] });
  expect(p.linhas.find((l) => l.grupo === "2,2" && l.codigo === "60112")?.itens).toEqual([]);
  expect(p.linhas.some((l) => l.valor_pi === "0.00")).toBe(false);
});
```

```ts
import type { RelatorioSiac } from "./ler-relatorio";

/** Itens que recebem cada linha (chave `grupo|codigo`) e, quando nenhum tem valor, o escolhido. */
export type Escolhas = Record<string, { itens: string[]; destino: string | null }>;

/**
 * O `p_relatorio` de `fn_mc_reajuste_importar`: cabeçalho, índices, SUBTOTAIS e só as linhas com
 * valor a PI líquido diferente de zero (as de zero não entram, spec 13). Números como texto.
 */
export function relatorioParaBanco(r: RelatorioSiac, escolhas: Escolhas, arquivoId: string | null) {
  return {
    contrato_texto: r.cabecalho.contratoTexto,
    medicao_numero: String(r.cabecalho.medicaoNumero),
    medicao_tipo: r.cabecalho.medicaoTipo,
    situacao: r.cabecalho.situacao,
    periodo_inicio: r.cabecalho.periodoInicio,
    periodo_fim: r.cabecalho.periodoFim,
    data_base: r.cabecalho.dataBase,
    processado_em: r.cabecalho.processadoEm,
    valor_pi: r.soma.valorPiLiquido,
    total: r.soma.reajuste,
    arquivo_id: arquivoId,
    indices: r.indices.map((i) => ({ sigla: i.sigla, i0: i.i0, i1: i.i1, k: i.k })),
    grupos: r.grupos.map((g) => ({ grupo: g.grupo, descricao: g.descricao, valor_pi: g.subtotal.valorPiLiquido, reajuste: g.subtotal.reajuste })),
    linhas: r.linhas
      .filter((l) => !/^-?0+(\.0+)?$/.test(l.valorPiLiquido))
      .map((l) => {
        const e = escolhas[`${l.grupo}|${l.codigo}`];
        return {
          grupo: l.grupo,
          codigo: l.codigo,
          descricao: l.descricao,
          unidade: l.unidade,
          preco_unitario: l.precoUnitario,
          valor_pi: l.valorPiLiquido,
          fator: l.fator,
          reajuste: l.reajuste,
          itens: e?.itens ?? [],
          destino: e?.destino ?? null,
        };
      }),
  };
}
```

- [ ] **Step 5:** `npx vitest run src/modules/medicao/reajuste`, `npx tsc --noEmit`, `npm run build` (confere que o `unpdf` externo sobe no build). Commit `Medição: leitor do relatório SIAC (unpdf) com o PDF real da 4ª do L09`.

### Task 4: De-para, queries e actions do reajuste

**Files:**
- Create: `src/modules/medicao/reajuste/unidade.ts`, `de-para.ts`, `de-para.test.ts`, `__fixtures__/l09-4a-itens.json`, `tipos.ts`, `schemas.ts`, `schemas.test.ts`, `formato.ts`, `formato.test.ts`, `queries.ts`, `queries.test.ts`, `actions.ts`, `actions.test.ts`

**Interfaces:**
- Consumes Task 1 (RPCs e views) e Task 3 (leitor).
- Produces:
  - `sugerirDePara(linhas, itens: ItemCandidato[], salvos: CasamentoSalvo[]): Map<string, Casamento>`; `chaveLinha(grupo, codigo)`; `normalizarUnidade(u)`.
  - `queries.ts` (`server-only`, RLS): `carregarReajusteMedicao(medicaoId): Promise<ReajusteMedicao>` = `{ vigente: { relatorioId, sequencia, origem, situacao, total, anteriorTotal, diferenca } | null; relatorios: RelatorioResumo[] (todos, inclusive excluídos: id, sequencia, origem, situacao, total, criadoEm, criadoPorNome, arquivoId, arquivoNome, observacao, excluidoEm, motivoExclusao); linhas: LinhaReajuste[] do que vale (grupo, codigo, descricao, unidade, valorPi, fator, reajuste, rateio: {itemId, codigo, valor, valorBase}[]); indices: IndiceSiac[] do que vale }`; `itensParaCasar(medicaoId): Promise<ItemCandidato[]>` (serviços da versão da medição em `mc_planilha_itens` com `valor_medicao::text` de `mc_v_medicao_itens`, "0" quando o item não tem linha; `todasAsLinhas`, o L09 tem 245 serviços); `casamentosSalvos(contratoId)`; `pdfDaMedicao(medicaoId, arquivoId): {path, nome} | null` (o vínculo `mc_reajuste` da medição com aquele arquivo); `pdfsPendentes(medicaoId)` (vínculos `mc_reajuste` cujo arquivo não está em relatório nenhum); `carregarConfigReajuste(contratoId)`; `listarReajustes({contratoId?, situacao?})` para a aba (medições enviadas e aprovadas com `mc_v_reajuste_medicao` à esquerda). Números como `::text`.
  - `actions.ts` ("use server"; todas com `exigirPermissao("medicao.reajuste", "editar")`, `idSchema`, `semLancar`, `mensagemDeNegocio`, e `revalidatePath` de `/medicao/medicoes/[id]`, `/medicao/reajuste`, `/medicao/boletim`, `/medicao/painel`, `/medicao/alertas`):
    - `lerPdfSiac(medicaoId, arquivoId)` → `{ ok: true; cabecalho; avisos: string[]; escolhas: Escolhas; origem: Record<chave, Casamento["origem"]>; conferir: string[]; candidatos: ItemCandidato[]; previa: PreviaReajuste } | { erro }`. Baixa o PDF (`pdfDaMedicao` + `lerBinario`), importa `extrair.ts` por `await import(...)` (falha do pdf.js derruba só este botão, como o PDF da folha), `lerRelatorioSiac` (erro `ErroRelatorioSiac` vira a mensagem), `conferirRelatorio` (diferença vira `{ erro: "O relatório não fecha: " + erros.join("; ") }`), aviso se o período do relatório não é o da medição ("O relatório é do período 01/02/2026 a 28/02/2026 e a medição de ..."), `sugerirDePara` com `itensParaCasar` e `casamentosSalvos`, e a prévia da RPC com `p_gravar: false`.
    - `previaReajuste(medicaoId, arquivoId, escolhas)` e `gravarReajuste(medicaoId, arquivoId, escolhas)`: leem o PDF de novo no servidor (o número nunca vem do navegador, como na importação da planilha), validam `escolhas` com `escolhasSchema` e chamam a RPC (`false` / `true`). Recusa do banco volta como está.
    - `lancarReajusteManual(medicaoId, {valor, sentido, situacao, observacao, arquivoId})`, `excluirRelatorioReajuste(relatorioId, medicaoId, motivo)`, `salvarConfigReajuste(contratoId, {temReajuste, dataBase, periodicidadeMeses, indiceDescricao})` (esta revalida `/medicao/contratos/[id]`).
  - `schemas.ts`: `escolhasSchema = z.record(z.string().regex(/^\d+,\d+\|\d+$/), z.object({ itens: z.array(idSchema).max(20), destino: idSchema.nullable() }))`; `manualSchema` (valor por `normalizarNumeroDigitado(valor, 2)`, sentido `positivo | negativo`, situação, observação até 500, `arquivoId: idSchema.nullable()`); `valorManualParaBanco(valor, sentido)` → `"1234.56"` ou `"-1234.56"`; `configSchema` (data-base `aaaa-mm` ou vazia, obrigatória com reajuste; periodicidade inteira 1..120; índice até 200).
  - `formato.ts`: `rotuloSituacaoReajuste` (provisório/definitivo), `rotuloOrigemReajuste` (SIAC/Manual), `diferencaReajuste(texto)` → `{ texto: "R$ 2,99 a receber" | "R$ 2,99 a devolver" | "sem diferença", sinal }` (BigInt, sem `Number`), `mesAno("2025-01-01")` → "01/2025", `aniversario("2025-01-01", 12)` → "01/2026".

- [ ] **Step 1:** gerar a fixture com o SELECT abaixo pelo MCP (`execute_sql`, leitura) e salvar como JSON `[{itemId, codigo, unidade, preco, valor}]` em `src/modules/medicao/reajuste/__fixtures__/l09-4a-itens.json` (245 serviços):

```sql
select json_agg(json_build_object('itemId', pi.item_id, 'codigo', pi.codigo, 'unidade', pi.unidade, 'preco', pi.preco_unitario::text,
                                  'valor', coalesce(mi.valor_medicao, 0)::text) order by pi.ordem)
  from mc_medicoes m
  join mc_planilha_itens pi on pi.versao_id = m.versao_id and pi.tipo = 'servico'
  left join mc_v_medicao_itens mi on mi.medicao_id = m.id and mi.item_id = pi.item_id
 where m.contrato_id = 'c4109738-9af7-4ddb-8982-3b2c79fe6e43' and m.numero = 4;
```

- [ ] **Step 2:** `de-para.test.ts` (RED; as 34 sugestões esperadas foram conferidas uma a uma contra a planilha):

```ts
// @vitest-environment node
import { readFile } from "node:fs/promises";
import path from "node:path";

import { beforeAll, describe, expect, it } from "vitest";

import { chaveLinha, sugerirDePara, type ItemCandidato } from "./de-para";
import { extrairTextoPdf } from "./siac/extrair";
import { lerRelatorioSiac, type RelatorioSiac } from "./siac/ler-relatorio";
import { normalizarUnidade } from "./unidade";

// Serviços da v0 do L09 com o valor de cada um na 4ª (mc_v_medicao_itens), tirados do banco em 02/10/2026.
import itensL09 from "./__fixtures__/l09-4a-itens.json";

const ITENS = itensL09 as ItemCandidato[];
const codigoDe = new Map(ITENS.map((i) => [i.itemId, i.codigo]));

// A sugestão esperada para as 34 linhas com valor da 4ª (conferida linha a linha contra a planilha).
const ESPERADO: Record<string, string> = {
  "1,0|55072": "01.01",
  "2,2|29083": "02.07.06.01", "2,2|51269": "02.07.05", "2,2|60112": "02.07.07.02", "2,2|86522": "02.07.01",
  "2,2|90224": "02.07.02", "2,2|93793": "02.07.09", "2,2|200134": "02.07.06.02", "2,2|201005": "02.07.07.03",
  "2,2|290300": "02.07.03", "2,2|322022": "02.07.06", "2,2|517556": "02.07.07", "2,2|517557": "02.07.04",
  "2,2|517560": "02.07.08", "2,2|6011205": "02.07.07.01",
  "2,5|49299": "02.10.02", "2,5|49401": "02.10.01", "2,5|517573": "02.10.03",
  "3,5|49321": "03.15.08", "3,5|91396": "03.15.03", "3,5|91826": "03.15.05", "3,5|517521": "03.15.13",
  "4,0|29083": "04.04.01", "4,0|55025": "04.02", "4,0|60112": "04.03.02", "4,0|200134": "04.04.02",
  "4,0|201005": "04.03.03", "4,0|322022": "04.04", "4,0|517555": "04.03", "4,0|6011205": "04.03.01",
  "4,1|49299": "04.05.01", "4,1|517573": "04.05.02",
  "7,0|52482": "07.02",
  "8,0|49408": "08.01",
};

let relatorio: RelatorioSiac;
beforeAll(async () => {
  relatorio = lerRelatorioSiac(await extrairTextoPdf(new Uint8Array(await readFile(path.join(__dirname, "siac", "__fixtures__", "siac-l09-4a.pdf")))));
});

describe("normalizarUnidade", () => {
  it("casa as unidades do SIAC com as da planilha", () => {
    expect(normalizarUnidade("T/KM")).toBe(normalizarUnidade("tkm"));
    expect(normalizarUnidade("UN/DIA")).toBe(normalizarUnidade("un.dia"));
    expect(normalizarUnidade("M²")).toBe(normalizarUnidade("m²"));
    expect(normalizarUnidade("MES")).toBe(normalizarUnidade("mês"));
    expect(normalizarUnidade("UND")).toBe(normalizarUnidade("un"));
    expect(normalizarUnidade("M³")).not.toBe(normalizarUnidade("m²"));
  });
});

describe("sugerirDePara com a 4ª real do L09", () => {
  it("sugere um item para cada uma das 34 linhas com valor, e o certo", () => {
    const s = sugerirDePara(relatorio.linhas, ITENS, []);
    expect(s.size).toBe(34);
    const obtido = Object.fromEntries([...s].map(([k, c]) => [k, c.itens.map((i) => codigoDe.get(i)).join(",")]));
    expect(obtido).toEqual(ESPERADO);
  });

  it("o CAP do 2,2 vai para o 02.07.07.02 e o do 4,0 para o 04.03.02 (mesmo SICRO, preço e unidade)", () => {
    const s = sugerirDePara(relatorio.linhas, ITENS, []);
    expect(codigoDe.get(s.get(chaveLinha("2,2", "60112"))!.itens[0])).toBe("02.07.07.02");
    expect(codigoDe.get(s.get(chaveLinha("4,0", "60112"))!.itens[0])).toBe("04.03.02");
  });

  it("transporte de RR-1C do 4,0 fica no 04.04.02 e não no 04.03.03 (preço a 0,27%, dentro da tolerância)", () => {
    const s = sugerirDePara(relatorio.linhas, ITENS, []);
    expect(codigoDe.get(s.get(chaveLinha("4,0", "200134"))!.itens[0])).toBe("04.04.02");
  });

  it("marca para conferir só a imprimação (02.07.05 sem valor na 4ª)", () => {
    const s = sugerirDePara(relatorio.linhas, ITENS, []);
    expect([...s].filter(([, c]) => c.conferir).map(([k]) => k)).toEqual(["2,2|51269"]);
  });

  it("casamento salvo vale de novo e só a linha nova é sugerida", () => {
    const cap = ITENS.find((i) => i.codigo === "04.03.02")!;
    const outro = ITENS.find((i) => i.codigo === "04.03.03")!;
    const s = sugerirDePara(relatorio.linhas, ITENS, [
      { grupo: "4,0", codigo: "60112", itemId: cap.itemId },
      { grupo: "4,0", codigo: "60112", itemId: outro.itemId },
    ]);
    expect(s.get(chaveLinha("4,0", "60112"))).toEqual({ itens: [cap.itemId, outro.itemId], origem: "salvo", conferir: false });
    expect(s.get(chaveLinha("2,2", "60112"))?.origem).toBe("sugerido");
  });

  it("salvo com item que saiu da planilha volta a ser sugerido; linha sem candidato fica vazia", () => {
    const s = sugerirDePara(
      [...relatorio.linhas, { grupo: "9,0", codigo: "1", unidade: "KG", precoUnitario: "1.0000", valorPiLiquido: "10.00" }],
      ITENS,
      [{ grupo: "8,0", codigo: "49408", itemId: "00000000-0000-4000-8000-000000000000" }],
    );
    expect(s.get(chaveLinha("8,0", "49408"))?.origem).toBe("sugerido");
    expect(s.get(chaveLinha("9,0", "1"))).toEqual({ itens: [], origem: "sem_candidato", conferir: true });
  });
});
```

- [ ] **Step 3:** `unidade.ts` e `de-para.ts`:

```ts
/**
 * Unidade normalizada para casar a linha do SIAC com o item da planilha: sem acento, minúscula, sem
 * espaço, ponto e barra, com ² e ³ virando 2 e 3 (NFKD). "T/KM" = "tkm", "UN/DIA" = "un.dia",
 * "M²" = "m²", "MES" = "mês". "und" e "unid" viram "un".
 */
export function normalizarUnidade(unidade: string | null | undefined): string {
  const base = (unidade ?? "")
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[\s./]/g, "");
  return base === "und" || base === "unid" ? "un" : base;
}
```

```ts
import { absoluto, comparar, lerDecimal, multiplicar, subtrair, type Decimal } from "@/modules/medicao/_shared/decimal";
import { normalizarUnidade } from "@/modules/medicao/reajuste/unidade";

/**
 * De-para do reajuste (Fase 6): cada linha do SIAC (grupo + código SICRO) aponta para um ou mais
 * itens nossos. O casamento salvo do contrato (`mc_reajuste_de_para`) vale de novo; linha nova
 * recebe uma SUGESTÃO, que o usuário confirma ou corrige na prévia. Só escolhe item: o dinheiro
 * (rateio) é do banco (`fn_mc_reajuste_importar`, D7). Comparações exatas (BigInt, `decimal.ts`).
 *
 * Sugestão, para a linha L (só as de valor a PI diferente de zero):
 *  1. candidatos = serviços da versão da medição com a mesma unidade normalizada e preço a até 0,5%
 *     do preço do SIAC (|p - pL| x 1000 <= 5 x |pL|);
 *  2. ordem: (a) o primeiro nível do código é o número antes da vírgula do grupo SIAC ("2,2" -> "02");
 *     (b) tem valor nesta medição; (c) menor diferença de preço; (d) está no subgrupo dominante do
 *     grupo SIAC (os dois primeiros níveis, "02.07", que mais aparecem entre os casamentos firmes do
 *     grupo, ou seja, linhas com um só candidato em (a) e (b)); (e) menor diferença entre o valor do
 *     item na medição e o valor a PI do SIAC; (f) código;
 *  3. sugere o primeiro; `conferir` = o segundo empata em (a) a (d), ou o sugerido não tem valor;
 *  4. sem candidato: nenhum item, o usuário escolhe.
 */

export interface LinhaParaCasar {
  grupo: string;
  codigo: string;
  unidade: string;
  precoUnitario: string;
  valorPiLiquido: string;
}

export interface ItemCandidato {
  itemId: string;
  codigo: string;
  unidade: string | null;
  /** Preço da linha da planilha (texto do banco). */
  preco: string;
  /** Valor do item nesta medição (texto do banco; "0" se não foi medido). */
  valor: string;
}

export interface CasamentoSalvo {
  grupo: string;
  codigo: string;
  itemId: string;
}

export interface Casamento {
  itens: string[];
  origem: "salvo" | "sugerido" | "sem_candidato";
  /** A sugestão precisa de olho: empate ou item sem valor na medição. */
  conferir: boolean;
}

export function chaveLinha(grupo: string, codigo: string): string {
  return `${grupo}|${codigo}`;
}

const MIL = lerDecimal("1000");
const CINCO = lerDecimal("5");
const ZERO = lerDecimal("0");

function precoProximo(preco: Decimal, alvo: Decimal): boolean {
  return comparar(multiplicar(absoluto(subtrair(preco, alvo)), MIL), multiplicar(CINCO, absoluto(alvo))) <= 0;
}

function nivel1DoGrupo(grupo: string): string {
  return grupo.split(",")[0].padStart(2, "0");
}

function prefixo2(codigo: string): string {
  return codigo.split(".").slice(0, 2).join(".");
}

interface Candidato {
  item: ItemCandidato;
  mesmoNivel: boolean;
  temValor: boolean;
  difPreco: Decimal;
  difValor: Decimal;
}

function candidatos(linha: LinhaParaCasar, itens: ItemCandidato[]): Candidato[] {
  const unidade = normalizarUnidade(linha.unidade);
  const alvo = lerDecimal(linha.precoUnitario);
  const pi = lerDecimal(linha.valorPiLiquido);
  const nivel = nivel1DoGrupo(linha.grupo);
  return itens
    .filter((i) => normalizarUnidade(i.unidade) === unidade && precoProximo(lerDecimal(i.preco), alvo))
    .map((i) => {
      const valor = lerDecimal(i.valor);
      return {
        item: i,
        mesmoNivel: i.codigo.split(".")[0] === nivel,
        temValor: comparar(valor, ZERO) !== 0,
        difPreco: absoluto(subtrair(lerDecimal(i.preco), alvo)),
        difValor: absoluto(subtrair(valor, pi)),
      };
    });
}

export function sugerirDePara(linhas: LinhaParaCasar[], itens: ItemCandidato[], salvos: CasamentoSalvo[]): Map<string, Casamento> {
  const comValor = linhas.filter((l) => comparar(lerDecimal(l.valorPiLiquido), ZERO) !== 0);
  const existentes = new Set(itens.map((i) => i.itemId));
  const salvosPorChave = new Map<string, string[]>();
  for (const s of salvos) {
    const k = chaveLinha(s.grupo, s.codigo);
    salvosPorChave.set(k, [...(salvosPorChave.get(k) ?? []), s.itemId]);
  }

  // Casamentos firmes (um só candidato do mesmo nível e com valor): o subgrupo dominante de cada grupo SIAC.
  const contagem = new Map<string, Map<string, number>>();
  for (const l of comValor) {
    const firmes = candidatos(l, itens).filter((c) => c.mesmoNivel && c.temValor);
    if (firmes.length !== 1) continue;
    const p = prefixo2(firmes[0].item.codigo);
    const m = contagem.get(l.grupo) ?? new Map<string, number>();
    m.set(p, (m.get(p) ?? 0) + 1);
    contagem.set(l.grupo, m);
  }
  const dominante = new Map<string, string>();
  for (const [g, m] of contagem) {
    const [p] = [...m].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))[0];
    dominante.set(g, p);
  }

  const resultado = new Map<string, Casamento>();
  for (const l of comValor) {
    const chave = chaveLinha(l.grupo, l.codigo);
    const salvo = salvosPorChave.get(chave);
    if (salvo && salvo.length > 0 && salvo.every((i) => existentes.has(i))) {
      resultado.set(chave, { itens: salvo, origem: "salvo", conferir: false });
      continue;
    }
    const dom = dominante.get(l.grupo);
    const chaveOrdem = (c: Candidato) => [c.mesmoNivel ? 0 : 1, c.temValor ? 0 : 1] as const;
    const ordenados = candidatos(l, itens).sort((a, b) => {
      const [a1, a2] = chaveOrdem(a);
      const [b1, b2] = chaveOrdem(b);
      return (
        a1 - b1 ||
        a2 - b2 ||
        comparar(a.difPreco, b.difPreco) ||
        (prefixo2(a.item.codigo) === dom ? 0 : 1) - (prefixo2(b.item.codigo) === dom ? 0 : 1) ||
        comparar(a.difValor, b.difValor) ||
        a.item.codigo.localeCompare(b.item.codigo)
      );
    });
    const [primeiro, segundo] = ordenados;
    if (!primeiro) {
      resultado.set(chave, { itens: [], origem: "sem_candidato", conferir: true });
      continue;
    }
    const empata =
      segundo !== undefined &&
      primeiro.mesmoNivel === segundo.mesmoNivel &&
      primeiro.temValor === segundo.temValor &&
      comparar(primeiro.difPreco, segundo.difPreco) === 0 &&
      (prefixo2(primeiro.item.codigo) === dom) === (prefixo2(segundo.item.codigo) === dom);
    resultado.set(chave, { itens: [primeiro.item.itemId], origem: "sugerido", conferir: empata || !primeiro.temValor });
  }
  return resultado;
}
```

- [ ] **Step 4:** testes de `schemas.ts` (escolha com chave fora do formato recusada; `z.uuid` nunca: id de carga md5 aceito; "1.234,56" positivo → "1234.56", negativo → "-1234.56"; "1.234" ambíguo recusado como no colar; data-base "2025-13" recusada; com reajuste sem data recusada) e de `formato.ts` ("2.99" → "R$ 2,99 a receber"; "-1.5" → "R$ 1,50 a devolver"; "0" → "sem diferença"; aniversário de 2025-01-01 + 12 = "01/2026", de 2025-04-01 + 12 = "04/2026"). Depois o código.
- [ ] **Step 5:** `queries.ts` com teste no molde de `src/modules/medicao/medicoes/detalhe-queries.test.ts` (cliente falso): `carregarReajusteMedicao` pega as linhas e o rateio só do relatório que vale, põe o código do item no rateio e traz os excluídos no histórico; `itensParaCasar` devolve "0" para serviço sem linha na view; `pdfsPendentes` tira os arquivos já usados.
- [ ] **Step 6:** `actions.ts` com teste no molde de `src/modules/medicao/medicoes/ciclo-actions.test.ts`: sem permissão não chama o banco; id inválido recusado; `lerPdfSiac` com o PDF real (o teste lê a fixture e finge o `lerBinario`) chama a RPC com 34 linhas, `p_gravar: false` e as escolhas sugeridas (04.03.02 na 4,0/60112); PDF de outro tipo devolve "A página 1 não tem a tabela do Resumo da Medição. Este PDF é o relatório SIAC?"; relatório com SUBTOTAL errado devolve "O relatório não fecha: ..." sem chamar a RPC; `gravarReajuste` manda `p_gravar: true` e revalida as 5 rotas; recusa do banco (P0001) volta como está; manual negativo vai como `"-1234.56"`.
- [ ] **Step 7:** commit `Medição: de-para sugerido e actions do reajuste`.

### Task 5: Seção Reajuste no detalhe da medição

**Files:**
- Create: `src/modules/medicao/reajuste/components/secao-reajuste.tsx`, `importar-siac-drawer.tsx`, `reajuste-manual-drawer.tsx`, `historico-reajuste.tsx`, `excluir-relatorio.tsx` (+ testes `.test.tsx`)
- Modify: `src/app/(app)/medicao/medicoes/[id]/page.tsx` (carrega `carregarReajusteMedicao` e `pdfsPendentes` só com `medicao.reajuste/ver`; passa `podeEditarReajuste`), `src/modules/medicao/medicoes/components/medicao-detalhe.tsx` (prop `secaoReajuste?: React.ReactNode`, entre Itens e Revisões), `src/modules/medicao/medicoes/eventos.ts` e `eventos.test.ts` (`reajuste` → "Reajuste registrado", tipo `documento`; `reajuste_excluido` → "Relatório de reajuste excluído", tipo `rejeicao`)

**Interfaces:**
- Consumes `ReajusteMedicao`, as actions da Task 4 e `Anexos` (`src/components/canonicos/anexos.tsx`) com `entidade="mc_reajuste"`.

- [ ] `SecaoDetalhe` "Reajuste" (card): sem relatório, `EmptyState` "Nenhum reajuste registrado nesta medição"; com relatório, total (`MoneyText`), situação (selo Provisório / Definitivo), origem (SIAC nº / Manual), diferença para o anterior (`diferencaReajuste`) e, no SIAC, valor a PI do DNIT ao lado do valor da medição. Botões "Importar relatório SIAC" e "Lançar sem relatório" só com `podeEditarReajuste` e medição enviada ou aprovada (calculado no servidor; a RPC confere de novo).
- [ ] Linhas do relatório que vale (`DataTable`): grupo, código SICRO, descrição, unid., valor a PI (DNIT), fator, reajuste, itens rateados ("04.03.02 · R$ -95.030,34"; mais de um item vira lista); rodapé com o total. Tabela de índices (sigla, I0, I1, K) recolhível.
- [ ] `ImportarSiacDrawer` (`FormDrawer` largo): passo 1, `Anexos` só com PDFs (`aceitar="application/pdf"`, `filtro` pelos pendentes, convite "Arraste o PDF do Resumo da Medição do SIAC"); ao subir, ou no botão "Ler" de um PDF pendente, chama `lerPdfSiac`. Passo 2, prévia: cabeçalho lido (contrato, Nª, situação dos índices, período, data-base, processado em), avisos, total do DNIT e a diferença para o que vale hoje; `DataTable` das linhas com valor a PI do DNIT, valor nosso, reajuste, selo da origem do casamento (Salvo, Sugerido, Conferir, Sem candidato), itens casados (chips com remover e um `Combobox` dos candidatos "código · descrição · unid. · R$ preço"), escolha do destino quando a RPC devolveu pendência, e o rateio que a RPC devolveu. Toda troca chama `previaReajuste` e redesenha com a resposta (nenhuma conta na tela). "Gravar" desabilitado com pendência ou enquanto envia; `ConfirmDialog` "Gravar o reajuste de R$ -40.021,28 (índices definitivos) na 4ª medição?".
- [ ] `ReajusteManualDrawer`: valor (`InputMoeda`), sentido (positivo / negativo), situação, observação, anexo opcional (o PDF pendente escolhido); grava por `lancarReajusteManual`.
- [ ] `HistoricoReajuste`: todos os relatórios (nº, origem, situação, total, diferença para o anterior, quando, quem, PDF com link por `urlDoAnexo`, excluído com o motivo riscado); "Excluir" (`ConfirmDialog` com motivo obrigatório, molde de `src/modules/medicao/lancamentos/components/excluir-lancamento.tsx`) só no que não foi excluído e com `podeEditarReajuste`.
- [ ] Testes de componente: sem permissão não há botões; medição aberta não mostra importar; a prévia mostra "Conferir" na 2,2/51269 e o rateio 1,26 no 02.07.05; trocar um item chama `previaReajuste` com a escolha nova; com pendência o Gravar fica desabilitado; erro do banco aparece como está; excluir sem motivo não envia; o histórico mostra a diferença "R$ 2,99 a receber"; a trilha traduz `reajuste`. Commit `Medição: seção Reajuste no detalhe da medição`.

### Task 6: Boletim, Painel, alertas, contrato e aba Reajuste

**Files:**
- Modify: `src/modules/medicao/boletim/tipos.ts`, `components/boletim-tabela.tsx`, `components/boletim-cartoes.tsx`, `planilha.ts` (+ testes `boletim-tabela.test.tsx`, `boletim-cartoes.test.tsx`, `planilha.test.ts`)
- Modify: `src/modules/medicao/painel/tipos.ts`, `components/painel-tabela.tsx` (+ `painel-tabela.test.tsx`)
- Modify: `src/modules/medicao/alertas/tipos.ts`, `formato.ts` (+ `formato.test.ts`, `components/alertas-tabela.test.tsx`)
- Create: `src/modules/medicao/reajuste/components/config-reajuste.tsx` (+ teste); Modify: `src/modules/medicao/contratos/components/contrato-detalhe.tsx`, `src/app/(app)/medicao/contratos/[id]/page.tsx`
- Create: `src/app/(app)/medicao/reajuste/page.tsx`, `loading.tsx`, `page.test.tsx`, `src/modules/medicao/reajuste/components/reajustes-tabela.tsx` (+ teste)

**Interfaces:**
- Consumes o jsonb novo de `fn_mc_boletim`/`fn_mc_painel`, `mc_v_alertas`, `carregarConfigReajuste`, `salvarConfigReajuste`, `listarReajustes`.

- [ ] Boletim: `LinhaBoletim` e `ItemForaDaVersao` ganham `reajuste_medicao` e `reajuste_acumulado`; `TotalBoletim` também; `MedicaoBoletim` ganha `reajuste` e `reajuste_situacao` (todos `string | null`). Colunas "Reajuste na medição" e "Reajuste acumulado" (`MoneyText`, negrito no título, rodapé do total) depois de "% a medir"; cartão `KPICard` "Reajuste acumulado" (`idCard="reajuste"`) com o `total.reajuste_acumulado` e, embaixo, "na Nª: R$ ..." e a situação quando provisória. xlsx: `COLUNAS_FINAIS` passa de 5 para 7 com "Reajuste na Nª" e "Reajuste acumulado" (formato dinheiro, texto do banco na célula como o resto). Testes: a linha 04 do L09 até a 4ª mostra −48.781,32; o total e o cartão −40.021,28; a planilha tem as duas colunas novas com os valores do jsonb.
- [ ] Painel: `ContratoPainel.reajuste_acumulado` e `TotalPainel.reajuste_acumulado`; coluna "Reajuste acumulado" e rodapé. Teste com −40.021,28.
- [ ] Alertas: `TipoAlerta` ganha `medicao_sem_reajuste` e `reajuste_provisorio`; `ROTULO_TIPO_ALERTA` "Medição aprovada sem reajuste" e "Reajuste provisório"; `fraseAlerta`: "3ª medição (início 01/01/2026) aprovada sem reajuste; aniversário da data-base em 01/01/2026" e "O reajuste da 1ª medição está com índices provisórios: R$ 1.234,56". Testes das duas frases.
- [ ] Contrato: `ConfigReajuste` (`SecaoDetalhe` "Reajuste", visível com `medicao.reajuste/ver`): tem reajuste (Sim/Não), data-base (mm/aaaa), periodicidade (12 meses), aniversário (`aniversario`), índice (texto); "Editar" com `medicao.reajuste/editar` abre `FormDrawer` (Switch, mês/ano, periodicidade, índice) e grava por `salvarConfigReajuste`. Testes: sem editar não há botão; gravar manda `{temReajuste: true, dataBase: "2025-01", periodicidadeMeses: 12, indiceDescricao: ...}`; erro do banco aparece.
- [ ] Aba Reajuste: guarda `medicao.reajuste/ver`; `FilterBar` (contrato, situação: sem relatório / provisório / definitivo); `DataTable` (contrato, medição Nª e período, `SeloMedicao`, reajuste `MoneyText`, situação, diferença, nº de relatórios); clique abre `/medicao/medicoes/[id]`; `EmptyState` sem medição enviada ou aprovada. Teste de página (guarda e 404) e da tabela.
- [ ] Commit `Medição: reajuste no Boletim, Painel, alertas, contrato e aba Reajuste`.

### Task 7: Fechamento

- [ ] `docs/decisoes.md`: entrada `## 2026-10-02 - Medição de Contratos: Fase 6, reajuste do DNIT` com o pedido do Tiago, as decisões 1 a 9, as escolhas E1 a E10, o método do SIAC conferido no PDF real (K = arred(I1/I0 − 1; 4); reajuste do item = TRUNC(valor a PI líquido × K; 2); total −40.021,28) e por que o módulo não calcula, a exceção à D6 (rateio gravado), a dependência `unpdf` e o que ficou de fora (tela Índices, demonstrativo xlsx, tabelas da 5.5 vazias). O vault é do Tiago.
- [ ] Portão completo no clone: `npm ci` se o `node_modules` for antigo, `npx tsc --noEmit`, `npm run lint` (0 erros), `npx vitest run`, `npm run build`; provas `mc_fase6_banco.sql`, `mc_fase5_banco.sql` e `mc_fase4_banco.sql` verdes no banco vivo; advisors sem aviso novo.
- [ ] Revisão final do branch (`superpowers:requesting-code-review`), PR com o resumo e as escolhas E1 a E10 para o Tiago confirmar, CI verde, merge e deploy (status do commit, sem MCP da Vercel); conferência na tela sem gravar: detalhe da 4ª do L09 com a seção Reajuste vazia e os botões; aba Reajuste; seção Reajuste do contrato L09 com "Não". A importação real da 4ª é do Tiago.
