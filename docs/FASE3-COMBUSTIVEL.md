# Fase 3: Combustível no ERP (desenho)

Plano mestre: `docs/PLANO-FRETE-COMBUSTIVEL-MANUTENCAO.md`, Fase 3. Levantamento da origem em
23/09/2026 (Gestão Obras, só leitura), a partir do banco vivo: 36 gatilhos e as funções
`private.recompute_fifo_tanque`, `saldo_min_tanque`, `inicio_ciclo_aberto`,
`fn_saidas_combustivel_movimentos` e companhia. A virada é no mesmo dia da Fase 4 (Frete):
o abastecimento de carreta gera débito na conta corrente da transportadora.

> **24/09/2026: tudo igual à origem.** O Tiago pediu o Combustível exatamente igual ao Gestão
> Obras. A migration `20260924120000_fase3_combustivel_igual_a_origem` e as telas voltaram cada
> regra e cálculo ao da origem (FIFO em TS para o preço sugerido e o snapshot, entrada por preço
> por litro, valor da transferência, esvaziamento do nível inteiro, detecção de anomalias, lixeira,
> atribuição em lote). Onde este desenho diz outra coisa, vale o registro em `docs/decisoes.md`
> ("Combustível igual ao Gestão Obras").

## Regra geral: dinheiro e saldo iguais à origem

O Tiago decidiu (22/09) que o FIFO do ERP fica igual ao do Gestão Obras. O mesmo vale para
tudo que mexe em valor ou saldo, para a carga bater na quarta casa:

- **PEPS por tanque, igual ao banco da origem.** Camadas = entradas e transferências recebidas,
  por data e ordem de inserção. As saídas `origem = tanque`, em ordem de data, criação e id,
  consomem as camadas do MESMO combustível com data até a da saída. **Transferência de saída e
  esvaziamento não consomem camada** (é o que o banco vivo faz; os 16 testes do TS da origem
  dizem o contrário e perdem para o banco). Faltou litro: a saída passa e entra em
  "sem suprimento". Tanque externo não tem PEPS.
- **Preço:** a saída de equipamento próprio recebe o preço médio das camadas consumidas, e
  `valor_total = preço × litros pedidos`. É recalculado a cada mudança no tanque (a origem
  também regrava; "foto imutável" não existe lá). A saída de carreta tem o preço digitado e
  nunca é regravada, mas consome camada.
- **Conta corrente da transportadora** (`transportadora_movimentos`, tabela do Frete criada
  aqui porque o combustível escreve nela). Só a carreta gera movimento:
  - tanque com dono (externo, Transterra/Areacre, Posto Progresso): crédito do dono =
    `litros × (coalesce(preço do dono, preço, 0) + coalesce(taxa por litro, 0))`, e débito da
    transportadora = `valor_total`;
  - tanque da EMT: um débito = `valor_total`.
  Excluir a saída apaga os movimentos; restaurar recria; mudar transportadora, tanque ou tipo
  de consumidor recria; o resto atualiza no lugar.
- **Travas iguais:** saldo nunca negativo em nenhum momento da linha do tempo (saídas antes das
  entradas no mesmo instante), ciclo fechado (movimento antes do último reabastecimento a partir
  de vazio não se edita nem exclui), capacidade e mistura de combustível pelo nível ATUAL (como a
  origem), entrada e transferência nunca em tanque externo, tipo da saída = combustível do
  tanque na data.

## O que muda por regra do ERP (sem mexer em dinheiro)

- Datas: `timestamptz`, interpretando o horário da origem como Rio Branco (plano, seção 5;
  regra 4 do CLAUDE.md). Rio Branco não tem horário de verão, então a ordem do PEPS não muda.
  "Data no futuro" passa a medir por Rio Branco (a origem usava São Paulo + 24 h).
- Esvaziamento ganha auditoria, lixeira e trava de ciclo (a origem não tinha nenhum dos três).
- Anomalia conferida pede `combustivel.anomalias/editar` (na origem qualquer usuário gravava).
- O celular não oferece tanque externo para equipamento próprio (a tela do computador já não
  oferecia; 0 casos na base).
- Entrada guarda o insumo e a quantidade na unidade dele, e `litros` já convertido (galão de
  Arla × 20, `insumos.litros_por_unidade`). O tanque só enxerga litros.
- O fornecedor da entrada vira FK (na origem era o nome em texto).
- O canal (computador ou celular) vira coluna (na origem só a observação dizia).

## Custo

- Saída de equipamento próprio: centro de custo = a etapa do equipamento (próprio na raiz de
  manutenção, Colorado na obra 002). Equipamento alugado não tem etapa: o custo vai para a obra
  da alocação.
- `abastecimento_alocacoes`: onde o equipamento trabalhou (obra raiz, percentual e litros).
  Na origem é sempre uma etapa a 100%; a etapa vira `etapa_legado` (texto), a obra vira o centro
  raiz, e 009 e 010 viram a obra única 009.
- **Nada gera lançamento, parcela ou rateio.**

## Entregas

1. **3a. Banco:** tabelas, PEPS, travas, conta corrente, RPCs, recursos para o perfil Admin e
   os 4 Admins, prova SQL.
2. **3b. Telas:** visão geral, tanques, entradas, abastecimentos, transferências,
   esvaziamentos, anomalias (com "sem suprimento"), relatórios.
3. **3c. Celular:** abastecer pelo QR do equipamento (só com sinal, como na origem).
4. **3d. Carga preparada e ensaiada** no molde da 2d. A virada fica para o dia da Fase 4.
