# Financeiro PR 5: contratos de dívida e consórcios (estrutura) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:subagent-driven-development ou superpowers:executing-plans.

**Goal:** Cadastro de contratos de dívida (com cronograma Price/SAC/do banco e eventos) e de cotas de consórcio (com contemplação); Créditos mostra saldo devedor de principal, juros pagos/a pagar, CET e próximas 12 parcelas; o DRE passa a ter os juros dos empréstimos no resultado financeiro e a taxa de administração do consórcio na despesa, no mês do vencimento. Sem dados (PR 6, depois dos PDFs).

**Spec:** `docs/superpowers/specs/2026-10-09-financeiro-controle-total-design.md` (frente F; D9, D10).

## Decisão do plano que muda a spec
A spec previa dois rateios no lançamento da parcela (principal e juros). No banco, **cada contrato é UM lançamento com todas as parcelas** (ex.: LAN-2026-6722, 60 parcelas; consórcios com 72–76). Rateio e competência são do lançamento, não da parcela: dividir o rateio jogaria os juros do contrato inteiro num mês só. Então:
- O lançamento continua como está (principal + juros em "Pagamento de Empréstimo", movimentação; consórcio em "Consórcio a contemplar", investimento).
- O contrato aponta para o lançamento das prestações (`lancamento_id`) e o da liberação (`lancamento_liberacao_id`); a linha do cronograma casa com a parcela pelo número.
- O `fn_rel_dre` soma linhas do cronograma no mês do vencimento: **+juros/encargos em "Juros de empréstimos"** e **−o mesmo em "Pagamento de Empréstimo"**; consórcio: **+taxa adm + fundo de reserva em "Taxa de administração de consórcio"** e **−o mesmo em "Consórcio a contemplar"**. O total geral não muda; nada conta duas vezes.

## Global Constraints
- Dinheiro só no banco, centavos (maior resto; última parcela fecha o saldo). Prova SQL begin/rollback, RED primeiro. Migrations sem pedir (MCP; CLI linkado se o MCP falhar). Recurso novo `financeiro.dividas` (ver/editar), seed Admin. Anexos: entidades `contrato_divida` e `consorcio_cota`.

## Tasks
1. **Banco — contratos**: `contratos_divida` (credor, número, tipo, centro_custo_id etapa (raiz financeiro ou imobilizado) único, lancamento_id, lancamento_liberacao_id, valor_contratado, valor_liberado, data_liberacao, taxa_am, indexador, sistema, carencia_meses, parcelas, primeiro_vencimento, garantia, status, observacoes); `contrato_divida_cronograma` (contrato, versao, numero, vencimento, principal, juros, encargos, saldo_apos, substituida_em); `contrato_divida_eventos` (tipo amortizacao/quitacao/renegociacao, data, valor, motivo, versao_nova). RPCs `fn_salvar_contrato_divida`, `fn_gerar_cronograma_contrato` (Price/SAC, carência com juros), `fn_salvar_cronograma_contrato` (manual jsonb), `fn_registrar_evento_contrato`. Prova: Price 100.000 a 2% em 12 → PMT 9.455,96, soma do principal = liberado ao centavo; SAC; manual com soma errada recusa; renegociação guarda a versão antiga.
2. **Banco — consórcio**: `consorcio_cotas` (administradora, grupo, cota, bem, centro_custo_id, lancamento_id, valor_credito, prazo, taxa_adm_pct, fundo_reserva_pct, primeiro_vencimento, status, contemplacao_data/forma/lance/carta, bem_centro_id) + `consorcio_cota_cronograma` (numero, vencimento, fundo_comum, taxa_adm, fundo_reserva); `fn_salvar_consorcio_cota` gera o cronograma; `fn_contemplar_consorcio`. Prova.
3. **Banco — relatórios**: `fn_rel_dividas_contratos(p_data)` (por contrato: liberado, principal pago, saldo devedor de principal, juros pagos, juros a pagar, próximas 12 parcelas em jsonb; por cota: pago, a pagar, status); `fn_rel_dre` com as linhas do cronograma. Prova: total do DRE igual antes/depois; juros no mês do vencimento.
4. **Tela**: rota Financeiro > Dívidas (abas Contratos/Consórcios), drawer de cadastro, detalhe com cronograma e eventos, anexos; Créditos ganha "Contratos" (saldo devedor, juros, CET calculado no TS pelo fluxo, próximas 12). Testes.
5. Portão, revisão, migrations, PR, merge pelo branch, deploy, vault.

## Review Focus
- Parcela já paga não pode ter o cronograma trocado sem evento (renegociação/amortização).
- Última parcela fecha o saldo ao centavo (Price e SAC).
- DRE: soma geral idêntica com e sem cronograma; juros só de contrato com cronograma.
- Contrato cancelado/quitado: sem juros futuros no DRE depois da quitação.
