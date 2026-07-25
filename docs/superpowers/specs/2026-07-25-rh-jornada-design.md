# Jornada/escala de trabalho (#10) — Design

Data: 2026-07-25
Status: aprovado (design), pendente de plano
Autor: Léo (com Tiago)

## Problema

Do QA do RH (gap #10): o ponto não conhece a jornada normal, então o encarregado digita horas normais/extras na mão e não há "marcar extra/falta sozinho". Bloco 4 do programa "RH completo" (Grupo A).

**Como a EMT paga (dado pelo Tiago):** salário **fechado**, que já inclui as horas extras. Por enquanto, **as horas extras são só controle de produtividade**, não pagamento. Mas a `fn_gerar_folha` hoje PAGA extra (`extras = horas_extras × salário/220 × 1,5`, somado ao custo/líquido) — o que conflita com o salário fechado (conta a extra duas vezes). Então este bloco também ajusta a folha gerencial pra parar de pagar extra.

## Regra da EMT (dada pelo Tiago — não inventada)

Jornada normal:
- **Seg a sex:** 07:00–17:00 com 2h de refeição = **8h/dia**.
- **Sábado:** 07:00–12:00 = **5h**.
- **Domingo:** jornada normal **0h** (se o campo trabalhar, é tudo extra).

- Sábado à tarde (acima de 5h) e domingo (jornada 0) → tudo extra; o split trata sozinho.
- A jornada varia: a Padrão EMT é o default, com exceção por colaborador.
- **Extra = só produtividade** (salário fechado já embute). Pagamento de extra (e taxas diferenciadas domingo/feriado) fica pro Bloco 7 (folha oficial), com as regras do Tiago.

## Objetivo

Cadastro de jornadas + jornada por colaborador + o ponto separar normal/extra e sugerir falta (produtividade), e a folha gerencial passar a custar salário fixo + encargos (sem somar extra). Sem inventar regra fiscal/trabalhista além do que o Tiago definiu.

## Decisões (fechadas com o Tiago)

1. **Jornada por horas/dia da semana** (não por batida). Padrão EMT = seg-sex 8, sáb 5, dom 0.
2. **Padrão da empresa + override por colaborador** (`colaboradores.jornada_id`; vazio = Padrão EMT).
3. **Ponto lança o TOTAL**; separa normal (até a jornada do dia) e extra (acima); sugere falta em dia de jornada > 0 com zero hora. Split **editável**.
4. Jornada mora em **Cadastros** (`/cadastros/jornadas`).
5. O apontamento continua guardando `horas_normais`/`horas_extras` (produtividade); o total é só do formulário.
6. **Folha gerencial para de pagar extra agora:** custo = salário fixo + encargos (sobre o salário); horas extras ficam guardadas só como produtividade (valor_extras = 0). Ajuste na `fn_gerar_folha`, com teste.

## Design

### 1. Tabela `jornadas` (novo cadastro)
- `id uuid pk`, `nome text not null unique`, `horas_segunda…horas_domingo numeric(4,2) not null default 0` (cada uma check 0..24), `ativo boolean not null default true`, timestamps + created_by.
- RLS + grants + auditoria + soft delete + importação, espelhando um cadastro simples vivo (Bloco 3 usou `unidades_medida`/`funcoes`). Recurso `cadastros.jornadas` (aba em Cadastros) + seed de permissão.
- **Seed** "Padrão EMT": seg..sex = 8, sáb = 5, dom = 0.

### 2. `colaboradores.jornada_id` (FK, expand-only)
- `add column jornada_id uuid references public.jornadas(id)` (nullable = Padrão EMT). Opcional: backfill dos existentes pra Padrão EMT. Não dropa nada.

### 3. Lógica pura (testável) — `src/modules/rh/apontamentos/jornada-horas.ts`
- `jornadaDoDia(jornada, dataISO): number` — horas normais esperadas no dia da semana da data (sem TZ shift; usa a coluna do weekday).
- `separaHoras(total, jornadaHoras): { horasNormais, horasExtras }` — `normais = min(total, jornadaHoras)`, `extras = max(0, total - jornadaHoras)`, 2 casas.
- `sugereFalta(total, jornadaHoras): boolean` — `total === 0 && jornadaHoras > 0`.
- Testes: dia útil 10h→8+2; sábado 6h→5+1; domingo 4h→0+4; dia útil 0h→falta; domingo 0h→não falta; total ≤ jornada→sem extra.

### 4. Cadastro de jornadas (backend + aba)
- `src/modules/cadastros/jornadas/{schemas,queries,actions,importacao}.ts` + aba (`/cadastros/jornadas`: page/loading/tabela/form-drawer/import), espelhando o cadastro de funções (Bloco 3). `listarJornadasAtivas()` (id, nome, as 7 horas) pro Combobox do colaborador. Form: nome + 7 horas + ativo.

### 5. Integração no colaborador
- `schemas.ts`: `jornadaId: z.uuid().nullable()`. `queries.ts`/`actions.ts`/`ficha.ts`: ler/gravar `jornada_id`; a ficha mostra a jornada (nome). Form: Combobox das jornadas ativas (vazio = Padrão EMT).

### 6. Integração no ponto/apontamento
- A query que carrega os colaboradores do ponto traz a `jornada` de cada um (as 7 horas), com fallback pra Padrão EMT.
- `apontamento-form-drawer.tsx`: campo **Total de horas**; ao digitar, `jornadaDoDia` (pela data do ponto) → `separaHoras` → preenche `horasNormais`/`horasExtras` (editáveis); se `sugereFalta`, sugere `tipo=falta`. Mantém normal/extra visíveis (ajuste manual). Submit grava normal/extra como hoje (sem mudança no schema/servidor do apontamento nem em rh_apontamentos).

### 7. Ajuste na folha gerencial (`fn_gerar_folha`) — dinheiro
- Ler a fn viva (já lida: paga extra +50% e põe encargos sobre salário+extras). Trocar pra: **`v_extras := 0`** (não paga extra); `v_encargos := round(salario * pct/100, 2)` (encargos sobre o salário fixo); `v_custo := salario + v_encargos`; `v_liquido := salario - v_adiant`. Continuar gravando `horas_normais`/`horas_extras` em `folha_itens` (produtividade) com `valor_extras = 0`. `valor_bruto` = sum(salario_base). Migration `create or replace` via MCP; rollback = a versão anterior da fn. Teste em banco: um colaborador CLT com extra → custo = salário + encargos (extra não soma), horas ainda aparecem.

## Testes e definição de pronto
- Vitest na lógica pura (jornadaDoDia/separaHoras/sugereFalta).
- **fn_gerar_folha**: teste em banco (begin/rollback) provando que extra não entra no custo/líquido e que as horas continuam registradas; encargos sobre salário.
- Zod da jornada (nome; horas 0..24); RLS de `jornadas`; advisors após migrations. typecheck/lint/build verdes; testes existentes verdes; sem any/console.log. Combobox canônico.
- Verificação em banco: seed Padrão EMT (8/8/8/8/8/5/0); colaborador aponta pra jornada; split confere (sábado 6h→5+1).

## Fora de escopo (v1)
- Horário de batida (entrada/saída/intervalo) e ponto eletrônico.
- Banco de horas automático (a aba rh.banco-horas existe; integração depois).
- Pagamento de hora extra e taxas diferenciadas (domingo/feriado 100%), DSR, feriados — regra da folha oficial (Bloco 7), com as alíquotas do Tiago.
- Escalas rotativas/turnos alternados; por ora jornada fixa por dia da semana.
- Códigos de jornada do eSocial (Bloco 10).

## Riscos
- **Dinheiro (fn_gerar_folha):** mudança na folha gerencial. Ler a fn viva, trocar só o cálculo de extra/encargos, testar em banco (begin/rollback) antes; rollback documentado. Não mexer em fechar/reabrir folha.
- Tabela nova exige RLS/grants/trigger corretos desde a migration (espelhar cadastro vivo; advisors).
- Fallback de jornada: colaborador sem `jornada_id` usa a Padrão EMT de forma consistente (mesma resolução no ponto e na ficha).
