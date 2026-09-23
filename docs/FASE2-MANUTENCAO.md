# Fase 2: Manutenção no ERP (desenho)

Plano mestre: `docs/PLANO-FRETE-COMBUSTIVEL-MANUTENCAO.md`, Fase 2. Levantamento da origem feito em
22/09/2026 (Gestão Obras, só leitura). Decisões do Tiago de 23/09/2026 marcadas com **[T]**.

## Regras

- **Nada gera lançamento, parcela ou rateio.** A OS diz para onde foi a peça, o óleo e o serviço.
- **Fluxo da OS [T]:** `aberta → em_execucao → concluida`, e `cancelada`. Dá para registrar a OS
  já concluída (o que a equipe faz hoje: 166 de 169 OS nasceram concluídas). Concluída volta a
  `aberta` só por **reabrir, com motivo** (regra 8 do CLAUDE.md: não se edita o que está em efeito).
- **Status do equipamento acompanha a OS [T]:** OS em execução põe o equipamento em
  `em_manutencao`; quando não sobra nenhuma OS em execução dele, ele volta a `ativa`. Equipamento
  `fora_funcionamento` não é mexido pela OS. Toda mudança grava `equipamento_status_historico`.
- **Custo da peça e do óleo [T]: custo médio igual à origem.** Custo médio do depósito = soma do
  valor das entradas ÷ soma das quantidades das entradas. Congelado na linha da OS quando a peça
  entra; mudar o custo médio depois não mexe em OS antiga.
- **Baixa real, com estorno [T].** A peça ou o óleo na OS gera uma saída no almoxarifado na hora,
  com trava de saldo no banco. Tirar a linha, cancelar ou excluir a OS estorna. Um saldo só,
  mantido por gatilho em `almoxarifado_saldos`, o mesmo em toda tela.
- **Serviço de terceiro: fornecedor obrigatório [T]** (`os_terceiros.fornecedor_id not null`).
- **Casas:** quantidade, custo unitário e custo com 4 casas (`CASAS_VALOR_OPERACIONAL` e
  `CASAS_TAXA`). A origem tem 2 casas no custo da OS e até 5 no valor unitário da entrada; a
  carga copia o valor TOTAL da entrada arredondado a 4 casas e deriva o unitário dele.
- **Custo só por gatilho.** A tela nunca manda `custo_*`: foi o defeito da origem, onde editar a OS
  regravava o custo com o que o navegador tinha carregado.
- **Centro de custo da OS:** a etapa do equipamento (próprio na manutenção, Colorado na obra 002).
  Equipamento alugado não tem etapa: a OS pede a obra onde ele trabalha.

## Tabelas

| Tabela | O quê |
|---|---|
| `tipos_oleo` | cadastro da Manutenção (`manutencao.tipos-oleo`): nome, aplicação, intervalo em meses |
| `almoxarifado_depositos` | depósito de peças (a origem tem 1 de verdade, o Almoxarifado Central) |
| `almoxarifado_itens` | a peça no almoxarifado: insumo do ERP, tipo de óleo, estoque mínimo e máximo, equipamentos compatíveis. Um por insumo |
| `almoxarifado_entradas` | entrada por NF: depósito, insumo, quantidade, valor, fornecedor, NF, data. Soft delete com trava de saldo |
| `almoxarifado_saidas` | saída para a OS (peça ou óleo), e o estorno dela. Nunca gravada pela tela, só pelas RPCs da OS |
| `almoxarifado_saldos` | saldo e custo médio por depósito × insumo, mantidos por gatilho |
| `ordens_servico` | a OS. `numero` OS-AAAA-NNNN e `numero_legado` |
| `os_pecas`, `os_oleos`, `os_terceiros` | as linhas da OS |
| `os_transicoes` | histórico de status (quem, quando, de, para, motivo) |
| `equipamento_medicoes` | horímetro e km, com `id_cliente` único para a fila offline não duplicar |
| `equipamento_status_historico` | toda troca de status do equipamento |

Escrita das OS, linhas, entradas e medições só por RPC SECURITY DEFINER com `tem_permissao`
(o que a tela faz é chamar a RPC). Leitura por RLS com `tem_permissao(..., 'ver')`. Auditoria em
todas. Soft delete da OS e da entrada pela lixeira, com motivo.

## Entregas (um PR cada)

1. **2a. Banco:** tabelas, gatilhos de saldo, custo e status, RPCs, recursos para o perfil Admin e
   os 4 Admins, prova SQL em transação desfeita.
2. **2b. Telas desktop:** painel, caderno de serviços (lista, OS, linhas), almoxarifado, tipos de
   óleo, horímetro e km.
3. **2c. Celular:** `/m/equipamento/[id]` com leitura do QR, abrir OS e lançar horímetro com fila
   offline idempotente, etiqueta QR nova, ficha técnica, e `/m/eq/<id antigo>` resolvendo o
   adesivo antigo pelo de-para.
4. **2d. Carga e virada:** migração dos dados da origem com conferência 9.5 a 9.7, a virada só da
   manutenção (origem só leitura nela) e, na mesma hora, o redirecionamento de `/m/eq/:id` no
   `vercel.json` do Gestão Obras para o ERP (antes da carga ele levaria o mecânico a um ERP sem o
   histórico da máquina). Precisa do ok do Tiago para congelar a origem.

## Pendências de dado para a carga (2d), não para o código

- **249 peças** casam com os insumos do ERP pelo nome, com revisão do Tiago (decisão d).
- **19 prestadores** de `os_terceiros` viram fornecedor (fornecedor obrigatório): 11 casam, 8 o
  Tiago decide ou cria.
- **Datas das entradas:** 313 de 332 estão 5 h à frente (bug do campo na origem). Nenhuma muda de
  dia se corrigir. Proposta: corrigir na carga.
- **Silo:** 1 peça saiu do "Depósito Central (Silo)", que não é almoxarifado.
- Não migrar: a medição e a saída de combustível de teste (`*test-pr2-trigger`).
- 57 adesivos QR antigos têm URL `localhost` e só funcionam pelo scanner do app; o redirecionamento
  não os alcança pela câmera do celular.
