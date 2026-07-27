# Encargos discriminados na folha (#7) — Design

Data: 2026-07-27
Status: aprovado (design), pendente de plano
Autor: Léo (com Tiago)

## Problema

Do QA do RH (gap #7): a folha usa um **% global único** de encargos (`folhas.encargos_percentual`, testado com 40%; `folha_itens.encargos` é um número só). Não abre INSS patronal / FGTS / RAT / Terceiros. Bloco 6 do programa "RH completo" (primeiro do Grupo B — folha oficial).

## Regra de ouro (fiscal)

**Não invento alíquota.** As taxas dos encargos são cadastradas pelo Tiago numa config editável; eu só construo o mecanismo. Cobre folha onerada e desonerada (se desonerada, o Tiago não cadastra o INSS patronal). Pagamento de extra continua fora (salário fechado — Bloco 4).

## Decisões (fechadas com o Tiago)

1. **Alíquotas por config editável** — o Tiago cadastra cada encargo (nome + %); eu não semeio taxa.
2. **Base = salário** (a base atual da folha). Cada encargo = % sobre o salário do colaborador.
3. **A config substitui o % único** — a folha passa a somar os encargos discriminados; o campo "% global" sai da tela de gerar folha.
4. Guardar a **quebra por item** (snapshot na geração) pra preservar histórico mesmo que as taxas mudem depois.

## Design

### 1. Config de encargos — `folha_encargos`
- `id uuid pk`, `nome text not null unique`, `percentual numeric(6,3) not null` (permite 5.800, 0.200 etc.; check 0..100), `ativo boolean not null default true`, `created_at/updated_at/created_by`.
- RLS + grants + auditoria + soft delete, espelhando um cadastro simples vivo (`funcoes`/`jornadas`). Recurso novo `rh.encargos` (aba `/rh/encargos`), semeado aos mesmos perfis de `rh.folha`.
- **Sem seed de taxa** (o Tiago cadastra). Textos de ajuda dão exemplos de nomes (INSS patronal, FGTS, RAT/SAT, Terceiros), sem valores.

### 2. Quebra por item — `folha_item_encargos`
- `id uuid pk`, `folha_item_id uuid not null references public.folha_itens(id) on delete cascade`, `nome text not null`, `percentual numeric(6,3) not null`, `valor numeric(14,2) not null`.
- Escrita SÓ pela `fn_gerar_folha` (SECURITY DEFINER). RLS: select gateado por `rh.folha` ver (mesma da folha); sem insert/update/delete grant pro authenticated (a fn definer escreve; o cascade limpa junto com folha_itens na regeração). Sem auditoria própria (derivado da folha).

### 3. `fn_gerar_folha` passa a discriminar (DINHEIRO)
- Ler a fn viva (já conheço: hoje `v_encargos := round(salario * p_encargos_pct/100, 2)`; custo = salário + encargos; valor_extras=0 do Bloco 4).
- Nova lógica: em vez do `p_encargos_pct`, ler os `folha_encargos` **ativos**; para cada colaborador, para cada encargo ativo, `valor = round(salario * percentual/100, 2)`, inserir em `folha_item_encargos`; `v_encargos := sum(valores)`. `folha_itens.encargos` = esse total (mantém custo_total = salário + encargos; valor_liquido = salário - adiant, inalterado). Limpar `folha_item_encargos` junto com `folha_itens` na regeração (cascade cobre).
- **Assinatura:** hoje `fn_gerar_folha(competencia date, p_encargos_pct numeric)`. A config substitui o pct. Expand-contract: manter o parâmetro `p_encargos_pct` na assinatura por compat (ignorado — a fn passa a ler a config), OU criar nova assinatura sem o pct. Decidir no plano lendo quem chama; o mais seguro é manter a assinatura e ignorar o parâmetro (a UI para de passar valor relevante), evitando quebrar o RPC. `folhas.encargos_percentual` deixa de ser a fonte (fica como a soma, ou 0 — decidir; não é mais input).
- Preservar EXATAMENTE permissão (`rh.folha` criar), competência, upsert/limpeza, filtro clt/aprovado, adiantamentos, centro de custo, somatórios. Não tocar `fn_fechar_folha`/`fn_reabrir_folha`.

### 4. Backend + aba do cadastro de encargos
- `src/modules/rh/encargos/{schemas,queries,actions,importacao}.ts` + aba (`/rh/encargos`: page/loading/tabela/form-drawer/import) espelhando `funcoes`/`jornadas`. `listarEncargosAtivos()` (se útil). Form: nome + percentual (0..100, até 3 casas) + ativo. Soft delete via `fn_excluir_cadastro`.

### 5. Folha — UI
- Tela de gerar folha: **remover o campo "% global"** (a action de gerar não passa mais o pct como input do usuário; usa a config). Se a action hoje exige o pct, ajustar (passar 0/ignorar).
- Detalhe da folha: mostrar a **quebra de encargos** por colaborador (nome + valor de cada; total), lendo `folha_item_encargos`. Opcional: total por encargo no rodapé da folha.

## Testes e definição de pronto
- Vitest onde houver lógica pura (ex.: soma/validação do percentual). Zod do encargo (0..100, ≤3 casas).
- **fn_gerar_folha**: teste em banco (begin/rollback) — cadastrar 2 encargos (ex. 20% e 8%), um colaborador CLT com salário; gerar; conferir `folha_item_encargos` (2 linhas com os valores certos), `folha_itens.encargos` = soma, `custo_total = salário + encargos`. Reverter.
- RLS: `rh.encargos` gate no cadastro; `folha_item_encargos` select por `rh.folha`; advisors (as tabelas novas com RLS/policy; nenhuma em rls_enabled_no_policy). typecheck/lint/build verdes; sem any/console.log.

## Fora de escopo (v1)
- INSS/IRRF **descontado do empregado** (isso é holerite — Bloco 7).
- Bases diferentes do salário (13º, férias proporcional como base de encargo) — Bloco 7/8.
- Desoneração/CPRB sobre receita (não é encargo por-colaborador; se aplicável, o Tiago só não cadastra o INSS patronal).
- FAP/RAT variável por estabelecimento; por ora um % por encargo, company-wide (o Tiago põe o efetivo).
- eSocial dos eventos de folha (Bloco 10).

## Riscos
- **Dinheiro (fn_gerar_folha):** mudar a origem dos encargos. Ler a fn viva, mudar só o cálculo de encargos, testar em banco antes; preservar o resto; não tocar fechar/reabrir.
- Tabelas novas exigem RLS/grants corretos; `folha_item_encargos` é escrita só pela definer (sem grant de insert pro authenticated) e select por `rh.folha`.
- Folha sem encargos cadastrados sai com encargo 0 — avisar o Tiago (ele cadastra uma vez). Folhas fechadas antigas mantêm o valor gravado.
