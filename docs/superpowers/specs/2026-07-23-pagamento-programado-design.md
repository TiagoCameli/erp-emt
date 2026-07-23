# Pagamento programado (fila de programados) — Design

Data: 2026-07-23
Status: aprovado (design), pendente de plano
Autor: Léo (com Tiago)

## Problema

QA #7: a parcela tem `data_vencimento` (vencimento) e `data_pagamento` (preenchida ao pagar). Não há uma **data programada** de pagamento (quando você planeja pagar, que pode diferir do vencimento), nem uma fila/agenda de pagamentos programados por data. Fluxo hoje: aprovar → pagar.

## Objetivo

Uma data programada por parcela + uma aba "Programados" que mostra a agenda de caixa (parcelas aprovadas e não pagas por data programada), pra planejar o que pagar e quando.

## Decisões (fechadas com o Tiago)

1. **Ação "Programar" separada** (não na aprovação, não campo sempre-editável): numa parcela aprovada e não paga, uma ação "Programar pagamento" define/edita a data.
2. **Aba nova "Programados"** em Financeiro (não um filtro na tela de Pagamentos).
3. **Default = vencimento (editável):** a data efetiva de programação = `data_programada` ou, se vazia, o `vencimento`. Toda parcela aprovada já entra na fila pela data de vencimento; a ação "Programar" ajusta.

## Modelo de dados

- Nova coluna `lancamento_parcelas.data_programada date` (nullable). Sem default no banco; a "data efetiva" é `coalesce(data_programada, data_vencimento)` (na query/UI). Não precisa backfill.
- RLS: a coluna herda a RLS da tabela `lancamento_parcelas` (já existente). Escrita só via função definer (a tabela só tem grant de SELECT).

### `fn_programar_pagamento(p_parcela_id uuid, p_data_programada date) returns void`
- security definer, `set search_path=''`, checa permissão `financeiro.programados`/`editar`.
- Só atua em parcela com status `aprovado` e não paga (senão erro claro). Seta `data_programada`. Auditoria pelo trigger padrão.
- revoke public/anon; grant execute authenticated.

## Recurso e permissão

- `financeiro.programados` em `config/recursos.ts` (ações `ver`, `editar`), rota `/financeiro/programados`. Seed de permissão (perfil_permissoes + sync usuario_permissoes, padrão do projeto) aos perfis que já têm `financeiro.pagamentos`.

## Aba "Programados" (UI)

- Rota `/(app)/financeiro/programados/page.tsx` + `loading.tsx` (SkeletonPagina). Server Component: checa `ver`, lista via query nova.
- Query: parcelas com lançamento `a_pagar`/parcela `aprovado` e não paga (as pagáveis), trazendo lançamento (descrição, fornecedor), valor, vencimento, data_programada, e a data efetiva. Ordenado por data efetiva asc.
- UI (client): lista/tabela agrupada ou marcada por **atrasadas** (efetiva < hoje), **hoje** (= hoje) e **próximas** (> hoje), com StatusBadge de cor (atrasada vermelho, hoje âmbar, próxima neutro). KPICards no topo: total **atrasado**, **hoje**, **próximos 7 dias** (soma dos valores). Ações por linha: **Pagar** (reusa o `pagar-parcela-drawer` existente) e **Programar/Reprogramar** (dialog com a data, default = efetiva atual).
- MoneyText/tabular-nums nos valores; timezone America/Rio_Branco pro "hoje".

## Reuso

- Pagar: reusa o fluxo/drawer de `financeiro/pagamentos` (`pagar-parcela-drawer` + a action que chama `fn_pagar_parcela`), sem duplicar.
- Programar: novo dialog canônico (RHF+Zod: uma data) + action `programarPagamento(parcelaId, data)` chamando a RPC.

## Testes e definição de pronto

- Vitest: cálculo da data efetiva (coalesce) e do bucket (atrasada/hoje/próxima) e a soma dos KPIs — em funções puras testáveis.
- RLS/permissão: sem `financeiro.programados` ver, a aba some; sem editar, "Programar" some.
- Advisors após a migration. typecheck/lint/build verdes; testes existentes verdes; sem any/console.log.
- Verificação em banco: programar uma parcela aprovada muda a data efetiva e o bucket; pagar tira ela da fila.

## Fora de escopo

- Não muda aprovar nem pagar (só adiciona a data programada + a fila).
- Contas a receber (não entra).
- Pagamento em lote/programação recorrente: não (uma parcela por vez).
- Parcelas ainda NÃO aprovadas não entram na fila (a fila é das pagáveis).

## Riscos

- A permissão nova precisa ser semeada (perfil + usuario_permissoes) senão a aba fica inacessível — como no cadastro de condições. O plano cobre.
- Reuso do pagar-parcela-drawer: conferir a API real do drawer antes (props/refresh).
