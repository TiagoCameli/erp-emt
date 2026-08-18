# Exceções auditadas na parcela: conta lembrada, pagamento fora da data e alteração de parcela — Design

Data: 2026-08-18
Status: aprovado pelo Tiago (as duas seções, em 18/08/2026)
Autor: Léo (com Tiago)

## Problema

Três pedidos do Tiago no mesmo dia, todos na área de Pagamentos, todos a mesma coisa por baixo:
**o sistema hoje ou esquece o que já sabe, ou proíbe o que a vida real exige.**

1. **O drawer de pagamento pede a conta bancária que ele já tem em mão.** A parcela carrega
   `conta_bancaria_id`, escolhido no lançamento ou na aprovação, e a tela zera o campo ao abrir.
2. **Pagar fora da data autorizada é proibido.** A janela está em modo `exata`: antes o banco recusa
   ("Pagamento autorizado para 18/08"), depois também ("a data autorizada passou: reprograme").
   Na prática paga-se antes e paga-se depois, e o caminho hoje é reprogramar a data, o que apaga o
   fato de ter sido fora do prazo.
3. **Lançamento com uma parcela paga não aceita alteração em nenhuma outra parcela.**
   `fn_definir_parcelas_lancamento` recusa se existir parcela `aprovado` ou `pago`, porque ela apaga
   e recria o parcelamento inteiro. Quando a nota chega diferente do combinado, não há caminho.

O tema comum: **exceção em dinheiro deve ser possível e ficar registrada com autor, hora e motivo**,
em vez de ser proibida (e contornada por fora) ou permitida em silêncio.

## Decisões fechadas com o Tiago

1. **Alterar parcela não paga muda valor e vencimento, e o valor do lançamento é recalculado** como a
   soma das parcelas.
2. **Pagamento fora da data autorizada é permitido nos dois sentidos**, antes e depois, com
   justificativa obrigatória.
3. **Quem já paga pode pagar fora da data** (`financeiro.pagamentos:criar`). A justificativa é o
   controle, não uma segunda permissão.
4. **O rateio por centro de custo é ajustado proporcionalmente** quando o total muda.
5. **Alterar o valor derruba a aprovação:** a parcela volta a `pendente` e perde a data autorizada.
   Alterar só o vencimento mantém a aprovação.

## Design

### 1. Onde a justificativa mora: `parcela_eventos`, que já existe

`parcela_eventos` (`parcela_id`, `tipo`, `motivo`, `data_de`, `data_para`, `created_at`,
`created_by`) já é gravada por cinco funções: `fn_aprovar_parcela`, `fn_revisar_parcela`,
`fn_reenviar_parcela`, `fn_desaprovar_parcela` e `fn_reprogramar_parcela`. As justificativas novas
entram nela, não em coluna solta.

**Ela ganha:**
- dois tipos no check, que hoje aceita `aprovou, revisou, reenviou, desaprovou, reprogramou`:
  `pagou_fora_da_janela` e `alterou`;
- duas colunas, `valor_de` e `valor_para` (`numeric(14,2)`, nulas), para a alteração registrar
  dinheiro do mesmo jeito que a reprogramação já registra data em `data_de`/`data_para`.

**E ela passa a ser exibida.** Medido: `parcela_eventos` **não é lida por nenhuma tela** — só
aparece em `database.types.ts` e num comentário. Todo motivo de reprogramação já escrito está
gravado e invisível. Exigir justificativa nova sem mostrar nenhuma seria burocracia: a trilha da
parcela entra no detalhe do lançamento pelo canônico `Trilha`, o mesmo de ordem de compra e cotação.

### 2. Conta bancária lembrada (não toca no banco)

`lancamento_parcelas.conta_bancaria_id` é escrito por `fn_aprovar_parcela` (recebe `p_conta_id`) e
por `fn_definir_conta_lancamento` (grava nas parcelas não pagas). `buscarParcelasAPagar` já traz o
valor como `contaBancariaId`, e `pagar-parcela-drawer.tsx` faz `setContaId("")` ao abrir.

O drawer passa a iniciar com a conta da parcela. Sem conta (o caso da aba Programados, cujo contrato
declara o campo opcional justamente por isso), continua vazio pedindo escolha. Nenhuma migration.

### 3. Pagamento fora da data autorizada (DINHEIRO)

`fn_pagar_parcela` ganha `p_motivo text default null` e três mudanças:

**A comparação passa a ser com a data informada, não com hoje.** Hoje a trava compara
`v_hoje` com `data_programada`, enquanto a tela pede "data do pagamento" — então a recusa fala de
uma data que o usuário não digitou. Passa a comparar `v_data_informada` com `v_programada`.

```
se v_data_informada <> v_programada:
    motivo é obrigatório  (btrim vazio recusa)
    grava parcela_eventos tipo 'pagou_fora_da_janela', data_de = v_programada,
                          data_para = v_data_informada, motivo
senão:
    motivo é ignorado
```

**O que NÃO muda:** data no futuro continua recusada; `v_programada is null` continua recusada
(parcela aprovada sem data programada); a parcela continua tendo que estar `aprovado`; a trava de
saldo continua; a permissão continua `financeiro.pagamentos:criar`, conforme a decisão 3.

**`fn_janela_pagamento()` deixa de ser trava e passa a ser irrelevante para o bloqueio**, porque os
dois modos (`exata` e `a_partir`) passam a permitir com motivo. A função continua existindo e o
parâmetro segue configurável; o que muda é que fora da janela não é mais recusa, é evento.

### 4. Alterar parcela não paga (DINHEIRO)

Função nova `fn_alterar_parcela(p_parcela_id uuid, p_valor numeric, p_data_vencimento date,
p_motivo text)`. Não reaproveita `fn_definir_parcelas_lancamento`, que apaga e recria todas as
parcelas — incompatível com preservar a que já foi paga.

**Recusa, em ordem:**
- sem `financeiro.lancamentos:editar`;
- motivo vazio;
- parcela inexistente, ou `status = 'pago'`;
- lançamento `cancelado`;
- **lançamento de origem `folha`, `folha_guia` ou `adiantamento`** — a mesma guarda que
  `fn_definir_parcelas_lancamento` já tem, cujo comentário registra que sem ela dava para mover uma
  guia de INSS de dezembro para junho com o total preservado e sem sinal na tela da folha;
- competência fechada, por `fn_exigir_competencia_aberta`;
- valor `<= 0`, ou data de vencimento nula.

**Faz, em ordem:**
1. grava `parcela_eventos` tipo `alterou`, com `valor_de`/`valor_para` e `data_de`/`data_para`;
2. atualiza a parcela;
3. **se o valor mudou**, zera a aprovação: `status = 'pendente'`, `data_programada = null`,
   `data_programada_origem = null`, `aprovado_em = null`, `aprovado_por = null`. A conta bancária
   **fica**: ela não é aprovação, e é o que o drawer vai lembrar depois;
4. recalcula `lancamentos.valor` como a soma das parcelas, e `lancamentos.data_vencimento` como a
   menor data de vencimento (o que `fn_definir_parcelas_lancamento` já faz);
5. **redistribui os rateios proporcionalmente** ao novo valor;
6. `fn_recalcular_status_lancamento`.

**Duas coisas medidas no schema que o implementador não deve descobrir na mão:**

- **`valor_liquido` é coluna GERADA** (`(valor - desconto) + juros`). Alterar `valor` a atualiza
  sozinha, e **tentar escrever nela levanta erro**. Ela é o que a consulta de saldo da conta soma
  (`sum(valor_liquido)` das parcelas pagas), e como a alteração só atinge parcela **não paga**, o
  saldo de nenhuma conta se move. Parcela não paga tem `desconto` e `juros` em zero por default,
  então para ela `valor_liquido = valor`.
- **`conferido_por` e `conferido_em` NÃO caem** quando a aprovação cai. Conferir é sobre a conta
  bancária estar certa, e a alteração não mexe na conta. Decisão explícita para não ficar ambíguo.

**O rateio proporcional, e por que ele precisa de regra explícita:** `fn_salvar_lancamento` exige
que a soma dos rateios seja **igual** ao valor do lançamento (`<>` levanta exceção), e rateio é em
reais, não em percentual. Proporcional gera centavos que não fecham. A regra:

```
para cada rateio: novo = round(valor_antigo * novo_total / total_antigo, 2)
sobra = novo_total - soma(novos)
a sobra inteira vai para UMA linha: a de maior valor novo, desempate por id
```

A sobra numa linha só, escolhida por critério fixo, é o que faz a operação ser **determinística**:
rodar duas vezes com os mesmos números dá o mesmo resultado. Distribuir a sobra "de um em um" faria
o resultado depender da ordem de leitura.

**Total antigo zero** não acontece (o valor do lançamento é `>= 0` e a soma das parcelas fecha com
ele; parcela tem valor `> 0`), mas se acontecer a função recusa em vez de dividir por zero.

### 5. Telas

- **`pagar-parcela-drawer.tsx`**: conta inicial da parcela; campo de motivo aparece **só** quando a
  data informada difere da autorizada, com rótulo dizendo o que é ("adiantado em 1 dia", "atrasado
  em 3 dias") em vez de "justifique"; sem motivo nesse caso o botão não confirma.
- **`lancamento-detalhe.tsx`**: ação "Alterar" por parcela não paga, no menu da linha onde já vivem
  as ações de reenviar. Dialog com valor, vencimento e motivo, mostrando o total do lançamento antes
  e depois e avisando que o rateio será ajustado. Quando a parcela está aprovada, aviso de que
  alterar o valor derruba a aprovação.
- **A trilha da parcela**, pelo canônico `Trilha`, no detalhe.
- **`podeDefinirParcelas` e `editavel` não mudam**: o caminho de trocar todas as parcelas segue
  travado quando existe parcela fechada. A alteração individual fica ao lado dele, não no lugar.

### 6. Testes

**Vitest (puro):**
- rateio proporcional: distribuição com centavos, soma fechando exata, determinismo em duas
  execuções, e o caso de uma linha só;
- quando exigir motivo: datas iguais não exige, diferentes exigem, e parcela sem data autorizada;
- o texto de dias de diferença (1 dia, N dias, antes e depois).

**Prova em banco, em transação revertida:**
- pagar adiantado e pagar atrasado, com motivo: grava o pagamento e o evento; sem motivo recusa;
- data no futuro continua recusada; parcela não aprovada continua recusada; saldo insuficiente
  continua recusado;
- alterar valor: lançamento recalcula, **rateios somam exatamente o novo valor**, aprovação cai,
  evento gravado com valor antes e depois;
- alterar só vencimento: aprovação **se mantém**;
- parcela paga, lançamento de folha, guia, adiantamento e competência fechada: recusam;
- **linha de controle**: uma segunda parcela do mesmo lançamento que não deveria mudar, conferida
  antes e depois, para provar que a alteração não vazou para as vizinhas.

**Definição de pronto:** `tsc`, `npx eslint src`, `vitest` e `build` limpos; advisors sem achado
novo; migrations aplicadas por MCP **e** versionadas com SQL igual ao ledger; nenhuma prova deixando
resíduo em produção.

## Consequências que o Tiago aceitou explicitamente

1. **"Lançamento com pagamento não se edita" deixa de ser absoluto.** Passa a ser "não se edita,
   exceto parcela não paga, com motivo registrado". O rastro fica em `parcela_eventos`.
2. **O valor do lançamento deixa de ser sempre o do documento do fornecedor**, porque passa a ser
   recalculado pela soma das parcelas (decisão 1).
3. **O rateio muda sem ninguém escolher onde**, proporcionalmente (decisão 4). Uma obra pode
   absorver diferença que não é dela.

## Fora de escopo

- Aprovar ou reprogramar em lote.
- Alterar parcela de lançamento a receber (o desenho vale para `a_pagar`; a receber tem outra
  máquina de status).
- Mexer em `financeiro.conciliacao` e `financeiro.contas-receber`, que também usam conta bancária.
- Mudar `fn_janela_pagamento()` ou o parâmetro de janela.

## Riscos

1. **`fn_pagar_parcela` é a função que move dinheiro para fora da empresa.** Alterá-la exige o
   procedimento da casa: copiar a definição viva, recriar a partir dela com `replace()` cirúrgico, e
   diffar depois esperando só o previsto. O md5 atual é `ebee7691bc2b3bba8865867eda4b3dff` (4180
   chars).
2. **Outra sessão do Claude trabalha neste mesmo banco.** Conferir md5 antes de alterar função
   compartilhada e parar se divergir.
3. **A soma dos rateios é validada com `<>`**, então um centavo de erro no proporcional derruba a
   operação inteira — e derrubar é o comportamento certo, mas exige que o arredondamento feche por
   construção, não por sorte.
