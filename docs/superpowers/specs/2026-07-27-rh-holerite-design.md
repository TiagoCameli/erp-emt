# Holerite + INSS/IRRF/FGTS por faixa (#3) — Design

Data: 2026-07-27
Status: rascunho (design), pendente de revisão do Tiago
Autor: Léo (com Tiago)

## Problema

Do QA do RH (gap #3): a folha não gera holerite (contracheque) nem calcula INSS/IRRF/FGTS por faixa. Hoje o líquido da folha = salário − adiantamentos (sem descontos legais). Bloco 7 do programa "RH completo" (2º do Grupo B — folha oficial). É o mais pesado e o mais fiscal.

## Regra de ouro (fiscal)

**Não invento alíquota/faixa.** As tabelas (INSS, IRRF) e os parâmetros (dedução por dependente, desconto simplificado, FGTS %) são cadastrados pelo Tiago com os valores oficiais vigentes, numa config editável. Eu encodo o **método de cálculo** (progressivo por faixa, parcela a deduzir, menor imposto entre completo/simplificado) — que é o método público padrão da Receita/INSS, não uma regra inventada. **Aceite:** o cálculo será testado contra um holerite real que o Tiago validar (salário conhecido → INSS/IRRF/líquido conhecidos).

## Decisões (fechadas com o Tiago)

1. **IRRF completo + simplificado, aplica o MENOR imposto** (como a Receita permite).
2. **Holerite mensal (núcleo):** provento = salário (fixo, já inclui extra — Bloco 4); descontos = INSS, IRRF, adiantamentos. FGTS informativo (não desconta). Líquido = salário − INSS − IRRF − adiantamentos.
3. **A folha gerencial passa a refletir o líquido com os descontos legais** (`fn_gerar_folha` desconta INSS/IRRF). Custo da empresa segue salário + encargos patronais (Bloco 6). — MUDANÇA DE DINHEIRO.
4. **PDF do contracheque** neste bloco.
5. **"Outros descontos" (VT, plano de saúde...) ficam pro Bloco 7b** (rubricas configuráveis), pra não inchar este.

## Design

### 1. Config editável (o Tiago cadastra os valores oficiais)
- `folha_inss_faixas`: `limite_ate numeric(14,2)`, `aliquota numeric(6,3)`, ordem por limite. Progressivo: a contribuição soma, por faixa, (porção do salário na faixa × alíquota); o teto = o maior `limite_ate` (contribuição travada nele).
- `folha_irrf_faixas`: `limite_ate numeric(14,2)`, `aliquota numeric(6,3)`, `parcela_deduzir numeric(14,2)`. Imposto = base × alíquota_da_faixa − parcela_deduzir.
- `folha_parametros` (config escalar, key/value ou 1 linha): `irrf_deducao_por_dependente`, `irrf_desconto_simplificado` (valor fixo mensal), `fgts_percentual`. (Base do INSS/IRRF = salário; teto do INSS = última faixa.)
- Tudo com RLS/grants/auditoria + soft delete (faixas) sob um recurso novo **`rh.parametros-folha`** (aba "Parâmetros da folha"), semeado aos mesmos perfis de `rh.folha`. **Sem seed de valores.**
- **Sem versão por vigência na v1** (config = tabela vigente; folhas fechadas guardam o valor calculado — snapshot; regenerar folha antiga usaria a tabela atual — documentado, aceitável). Vigência histórica fica pra depois.

### 2. Lógica pura (testável — o coração fiscal) — `src/modules/rh/folha/calculo-imposto.ts`
- `calcularINSS(salario, faixasINSS): number` — progressivo, travado no teto. 2 casas.
- `calcularIRRFCompleto(salario, inss, qtdDependentesIRRF, faixasIRRF, deducaoPorDependente): number` — base = salário − inss − (qtd × deducaoPorDependente); imposto pela faixa; nunca negativo.
- `calcularIRRFSimplificado(salario, faixasIRRF, descontoSimplificado): number` — base = salário − descontoSimplificado; imposto pela faixa; nunca negativo.
- `calcularIRRF(...) = min(completo, simplificado)`.
- Dependentes de IRRF vêm de `rh_dependentes` com `dependente_irrf = true` (Bloco 2). 
- Testes com casos de valor conhecido (Tiago valida ao menos 1 real): isento; cada faixa; teto do INSS; com/sem dependente; simplificado vencendo o completo e vice-versa; base negativa → 0.

### 3. `fn_gerar_folha` desconta INSS/IRRF (DINHEIRO)
- Ler a fn viva. Adicionar, por colaborador: `v_inss := calcular…` (as faixas via subselect nas tabelas de config), `v_irrf := min(completo, simplificado)` usando a contagem de `rh_dependentes` com `dependente_irrf`. Guardar `inss` e `irrf` no `folha_itens` (colunas novas `inss numeric(14,2)`, `irrf numeric(14,2)` — expand). `valor_liquido := salario − v_inss − v_irrf − v_adiant`. Custo/encargos (Bloco 6) inalterados. Preservar todo o resto; não tocar fechar/reabrir. (O cálculo em SQL espelha a lógica pura; a lógica pura TS é a fonte dos testes e do que a UI mostra.) Rollback documentado.
- Como o INSS/IRRF dependem de faixas em tabela, a fn lê `folha_inss_faixas`/`folha_irrf_faixas`/`folha_parametros`. Se as tabelas estiverem vazias → INSS/IRRF = 0 (folha sem desconto legal; avisar o Tiago que precisa cadastrar).

### 4. Holerite — tela
- Por colaborador na folha (competência): proventos (salário) / descontos (INSS, IRRF, adiantamentos) / líquido; FGTS informativo (salário × fgts_percentual). Uma tela de holerite (a partir do `/rh/folha/[id]`, por colaborador) ou uma aba de holerite. Read-only (derivado da folha). Mostra a base e as faixas aplicadas de forma clara.

### 5. Holerite — PDF
- Gerar o contracheque em PDF (pdfmake — stack do projeto) com cabeçalho da empresa/colaborador/competência, proventos/descontos/líquido, FGTS informativo. Um por colaborador (e talvez lote da competência). Sem dado sensível vazando; gated por `rh.folha` ver.

## Testes e definição de pronto
- Vitest exaustivo na lógica pura (INSS/IRRF), incluindo um caso real validado pelo Tiago.
- **fn_gerar_folha:** teste em banco (begin/rollback) — cadastrar faixas/params de teste, colaborador com salário e N dependentes IRRF; gerar; conferir inss/irrf/líquido batendo com a lógica pura; custo/encargos inalterados. Reverter.
- RLS: config `rh.parametros-folha`; holerite/PDF gated por `rh.folha`. Advisors. typecheck/lint/build; sem any/console.log.

## Fora de escopo
- Outros descontos (VT, plano, pensão, faltas) — Bloco 7b (rubricas).
- 13º e férias com cálculo financeiro — Bloco 8. Rescisão — Bloco 9. eSocial — Bloco 10.
- Vigência histórica das tabelas (versionamento por competência) — depois.
- INSS/IRRF sobre 13º/férias (bases específicas) — Bloco 8.
- Formatação legal 100% do contracheque / RE / assinatura digital.

## Riscos
- **Dinheiro (fn_gerar_folha):** muda o líquido. Ler a fn viva, adicionar só INSS/IRRF, testar em banco; preservar custo/encargos/fechar-reabrir. A lógica pura TS e a SQL têm que dar o MESMO número (testar os dois contra o caso validado).
- **Correção fiscal:** o método (progressivo, parcela a deduzir, menor imposto) precisa bater com um holerite real — daí o caso validado pelo Tiago ser condição de pronto.
- Bloco grande (~7 tarefas): config+recurso, UI de config, lógica pura, fn (dinheiro), holerite tela, holerite PDF, verificação. Construir por partes, cada uma revisada.
- Dependentes IRRF dependem do flag `dependente_irrf` (Bloco 2) estar preenchido; se vazio, dedução por dependente = 0 (correto, mas avisar).
