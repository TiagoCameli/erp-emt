# Jornada/escala de trabalho (#10) — Design

Data: 2026-07-25
Status: aprovado (design), pendente de plano
Autor: Léo (com Tiago)

## Problema

Do QA do RH (gap #10): o ponto não conhece a jornada normal, então o encarregado digita horas normais/extras na mão e não há "marcar extra/falta sozinho". Bloco 4 do programa "RH completo" (Grupo A). O split normal/extra vira valor na folha (normal = salário/220; extra +50%), então precisa ser correto.

## Regra da EMT (dada pelo Tiago — não inventada)

Jornada normal da EMT:
- **Seg a sex:** 07:00–17:00 com 2h de refeição = **8h/dia**.
- **Sábado:** 07:00–12:00 = **5h**.
- **Domingo:** jornada normal **0h** (não há jornada; se o pessoal de campo trabalhar, é tudo extra).

Consequências (o split trata sozinho, sem regra especial):
- Sábado à tarde (acima de 5h) = extra. Domingo (jornada 0) = tudo extra.
- A jornada varia: a Padrão EMT é o default, com exceção por colaborador.
- **Fora de escopo aqui:** taxa diferenciada de extra (domingo/feriado 100%) é regra da FOLHA (Bloco 6/7), com as alíquotas do Tiago. Aqui "extra" = horas acima da jornada; a folha aplica a taxa que já tem (+50%).

## Objetivo

Cadastro de jornadas + jornada por colaborador + o ponto separar normal/extra e sugerir falta a partir da jornada do dia. Sem inventar regra fiscal/trabalhista além do que o Tiago definiu.

## Decisões (fechadas com o Tiago)

1. **Jornada por horas/dia da semana**, não por horário de batida. A Padrão EMT = seg-sex 8, sáb 5, dom 0.
2. **Padrão da empresa + override por colaborador** (`colaboradores.jornada_id`; sem escolher = Padrão EMT).
3. **Ponto lança o TOTAL**; o sistema separa normal (até a jornada do dia) e extra (acima), e sugere falta em dia de jornada > 0 com zero hora. O split fica **editável** (exceção de obra).
4. Jornada mora em **Cadastros** (`/cadastros/jornadas`), no padrão dos outros cadastros.
5. O apontamento continua guardando `horas_normais`/`horas_extras` (a folha não muda); o total é só do formulário.

## Design

### 1. Tabela `jornadas` (novo cadastro)
- Colunas: `id uuid pk`, `nome text not null unique`, `horas_segunda`/`horas_terca`/`horas_quarta`/`horas_quinta`/`horas_sexta`/`horas_sabado`/`horas_domingo` `numeric(4,2) not null default 0` (cada uma com check 0..24), `ativo boolean not null default true`, timestamps + created_by.
- RLS + grants + auditoria + soft delete + importação, espelhando um cadastro simples vivo (o Bloco 3 usou `unidades_medida`/`funcoes` — reusar o mesmo padrão). Recurso novo `cadastros.jornadas` (aba em Cadastros) com seed de permissão.
- **Seed** "Padrão EMT": segunda..sexta = 8, sábado = 5, domingo = 0.

### 2. `colaboradores.jornada_id` (FK)
- `alter table colaboradores add column jornada_id uuid references public.jornadas(id)`. Nullable = usa a Padrão EMT (o código resolve o fallback pra jornada Padrão EMT; opcionalmente backfill setando todos os colaboradores existentes pra Padrão EMT). Expand-only (não dropa nada).

### 3. Lógica pura (testável, alimenta a folha)
`src/modules/rh/apontamentos/jornada-horas.ts`:
- `jornadaDoDia(jornada, dataISO): number` — horas normais esperadas no dia da semana da data (0=domingo … 6=sábado; usa a coluna certa). Sem TZ shift (America/Rio_Branco; comparar só a data).
- `separaHoras(total: number, jornadaHoras: number): { horasNormais: number; horasExtras: number }` — `horasNormais = min(total, jornadaHoras)`, `horasExtras = max(0, total - jornadaHoras)`. Arredonda a 2 casas (NUMERIC(5,2)).
- `sugereFalta(total, jornadaHoras): boolean` — `total === 0 && jornadaHoras > 0`.
Testes cobrindo: dia útil 10h→8+2; sábado 6h→5+1; domingo 4h→0+4; dia útil 0h→falta; domingo 0h→não falta; total ≤ jornada→sem extra.

### 4. Cadastro de jornadas (backend + aba)
- `src/modules/cadastros/jornadas/{schemas,queries,actions,importacao}.ts` + a aba (`/cadastros/jornadas`: page/loading/tabela/form-drawer/import). Espelhar o cadastro de funções (Bloco 3). `listarJornadasAtivas()` (id, nome, as 7 horas) pro Combobox do colaborador. Form: nome + 7 campos de horas (numéricos) + ativo.

### 5. Integração no colaborador
- `colaboradores/schemas.ts`: `jornadaId: z.uuid().nullable()`. `queries.ts`/`actions.ts`/`ficha.ts`: ler/gravar `jornada_id`; a ficha mostra a jornada (nome). Form: campo jornada vira `Combobox` das jornadas ativas (default vazio = Padrão EMT).

### 6. Integração no ponto/apontamento
- A query que carrega os colaboradores do ponto passa a trazer a `jornada` de cada um (as 7 horas), com fallback pra Padrão EMT.
- `apontamento-form-drawer.tsx`: adicionar um campo **Total de horas**; ao digitar, calcular `jornadaDoDia` (pela data do ponto) → `separaHoras` → preencher `horasNormais`/`horasExtras` (editáveis) e, se `sugereFalta`, sugerir `tipo=falta`. Mantém os campos normal/extra visíveis (ajuste manual). O submit grava normal/extra como hoje (sem mudança no schema/servidor do apontamento nem em rh_apontamentos).
- Onde já existe apontamento (edição), o Total aparece = normal+extra.

## Testes e definição de pronto
- Vitest na lógica pura (jornadaDoDia/separaHoras/sugereFalta) — dinheiro na folha depende disso.
- Zod da jornada (nome; horas 0..24); RLS de `jornadas`.
- Advisors após migrations (tabela nova precisa de RLS+policies). typecheck/lint/build verdes; testes existentes verdes; sem any/console.log. Combobox canônico.
- Verificação em banco: seed Padrão EMT existe (8/8/8/8/8/5/0); colaborador aponta pra jornada; o split confere num caso real (sábado 6h → 5+1).

## Fora de escopo (v1)
- Horário de batida (entrada/saída/intervalo) e ponto eletrônico.
- Banco de horas automático (a aba rh.banco-horas existe, mas a integração fica pra depois).
- DSR, feriados, e taxa de extra diferenciada (domingo/feriado 100%) — regra da folha (Bloco 6/7), com as alíquotas do Tiago.
- Escalas rotativas complexas (turnos alternados); por ora jornada fixa por dia da semana.
- Códigos de jornada do eSocial (Bloco 10).

## Riscos
- **Dinheiro:** o split alimenta a folha (extra +50%). Testar a lógica pura com cuidado e não mudar o storage (normal/extra) nem a fn da folha.
- Tabela nova exige RLS/grants/trigger corretos desde a migration (espelhar cadastro vivo; advisors depois).
- Fallback de jornada: colaborador sem `jornada_id` deve usar a Padrão EMT de forma consistente (mesma resolução no ponto e na ficha).
