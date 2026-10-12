# Financeiro PR 4: aplicações (posição do mês, alerta do CDI, data do OFX, saldo real) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** O rendimento das aplicações passa a ser confiável: transferência casada com o OFX assume a data do extrato; posição com rendimento negativo ou fora do CDI pede confirmação com motivo; fechar o mês da conta exige a posição do último dia de cada aplicação; o relatório mostra o saldo real e reconhece resgate automático.

**Architecture:** Banco: `fn_conciliar_transferencia` alinha `data_transferencia` à data do movimento (o gatilho existente recalcula o rendimento); `fn_simular_posicao_aplicacao` devolve também o rendimento esperado pelo CDI; `fn_salvar_posicao_aplicacao` ganha `p_confirmar`/`p_motivo`; `fn_conciliacao_fechar_mes` exige posição no último dia para as aplicações ativas das subcontas da conta. Tela: aviso no drawer da posição; Relatórios > Investimentos com o saldo de `fn_saldos_das_aplicacoes`.

**Tech Stack:** Supabase Postgres, Next.js 16, Vitest.

**Spec:** `docs/superpowers/specs/2026-10-09-financeiro-controle-total-design.md` (frente E).

## Global Constraints
- Prova SQL begin/rollback, RED primeiro, marca `v_msg` fora do bloco.
- Migrations aplicadas sem pedir; version real no arquivo; merge pelo número do branch.
- Dinheiro em centavos; corpo das funções copiado do banco vivo.

## Decisões do plano
- Data da posição exigida no fechamento: o **último dia do mês** (o extrato de investimento dá o saldo do dia mesmo em fim de semana).
- Faixa do CDI: rendimento < 0, ou fora de 50%–150% do esperado quando o esperado passa de R$ 100 (abaixo disso o ruído domina). Esperado = base × (fator do CDI no período − 1) × (% contratado ou 100%) ; base = posição anterior + aplicado − resgatado.
- Confirmado fora do CDI: o motivo vai para as observações da posição com o prefixo "[Fora do CDI]".
- Correção do dado: a migration alinha as transferências já casadas com data diferente do OFX (hoje só a TRF-2026-0862) — o gatilho recalcula o Fundo da Caixa e some o ±R$ 178 mil.
- Resgate automático: tipo resgate e (descrição com "RESGATE AUTO" em qualquer forma, ou sufixo "(regra)").

## Review Focus
- Alinhar a data de uma transferência casada em mês fechado: recusa pela trava (não move o saldo de mês conciliado).
- Recalcular rendimento cujo lançamento já está conciliado: hoje o sincronizar recusa — o alinhamento não pode deixar o casamento pela metade.
- Posição de abertura (`e_abertura`) não conta como posição do fim do mês.
- Aplicação inativa não bloqueia o fechamento.
- Simulação com esperado nulo (sem CDI no período) não pode travar o salvar.

---

### Task 1 (banco): data do OFX no casamento + correção do dado
- [ ] Prova (RED): criar transferência conta→subconta datada D+1 de uma linha de OFX não casada, casar por `fn_conciliacao_casar(.., 'transferencia', ..)` e esperar `data_transferencia = data_movimento`; após a migration, TRF-2026-0862 com data 2026-10-08 e o rendimento do Fundo em 08/10 ≥ 0.
- [ ] Migration: corpo vivo de `fn_conciliar_transferencia` + alinhamento (com `fn_conciliacao_exigir_data_aberta` nas duas contas, nas duas datas) + update único das já casadas.

### Task 2 (banco): CDI esperado e confirmação
- [ ] Prova (RED): `fn_simular_posicao_aplicacao` devolve `rendimento_esperado` e `fora_do_cdi`; salvar posição com rendimento negativo sem `p_confirmar` recusa com 'fora do CDI'; com `p_confirmar` e motivo passa e grava o prefixo nas observações.
- [ ] Migration: drop/create do simular (retorno novo), drop/create do salvar com `p_confirmar boolean default false, p_motivo text default null`.

### Task 3 (banco): posição do fim do mês no fechamento
- [ ] Prova (RED): fechar um mês de uma conta cuja subconta tem aplicação ativa sem posição no último dia recusa com 'posicao'; com a posição, segue para as demais checagens.
- [ ] Migration: corpo vivo de `fn_conciliacao_fechar_mes` + checagem.

### Task 4 (tela): drawer da posição e relatório
- [ ] Drawer: mostra o esperado pelo CDI e o aviso; quando `fora_do_cdi`, o salvar pede motivo (ConfirmDialog) e envia `confirmar`/`motivo`. Teste do componente.
- [ ] Relatórios > Investimentos e Excel: "Saldo aplicado" = `fn_saldos_das_aplicacoes`; `ehResgateAutomatico` com a regra nova. Testes.

### Task 5: portão, revisão, migrations, PR, merge, deploy, conferir o Fundo em produção, vault.
