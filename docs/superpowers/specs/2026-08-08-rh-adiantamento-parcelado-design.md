# Adiantamento parcelado, descontado em vários meses — Design

Data: 2026-08-08
Status: rascunho (design), pendente de revisão do Tiago
Autor: Léo (com Tiago)

## Problema

Hoje o adiantamento de salário é um vale do mês: a empresa paga R$ 500 no dia 15 e desconta
R$ 500 na folha da mesma competência. `rh_adiantamentos.competencia` é o mês do desconto e
`folha_id` marca qual folha descontou. Um adiantamento equivale a um desconto integral, num mês.

O Tiago precisa conceder adiantamento **descontado parcelado**: R$ 1.200 agora, R$ 400 por mês
em três folhas.

## O que isso muda de natureza

O dinheiro continua saindo do caixa **inteiro na concessão** (o lançamento a pagar de R$ 1.200 é
um só, criado pela `fn_registrar_adiantamento` do Bloco 8a). O que passa a ser parcelado é
apenas o **desconto na folha**. Entre o desembolso e a última parcela existe um saldo a receber
do colaborador que hoje não existe em lugar nenhum do sistema: o adiantamento deixa de ser um
vale do mês e passa a ser, na prática, um empréstimo amortizado na folha.

Consequência imediata: a identidade de conferência do Bloco 8a muda de definição. O termo deixa
de ser "soma dos adiantamentos concedidos nesta competência" e passa a ser "soma do que foi
efetivamente descontado nesta folha".

## Posicionamento no roadmap

Esta frente entra **antes do Bloco 8b** (provisão mensal de 13º e férias). As duas mexem na
`fn_gerar_folha` e na identidade de conferência; fazer na ordem inversa significaria mexer duas
vezes no mesmo cálculo de dinheiro, com dois ciclos de prova.

## Decisões fechadas com o Tiago

1. **Parcelas iguais, o sistema divide.** O usuário informa valor total e número de parcelas; a
   sobra de centavos vai na primeira.
2. **Parcela que não cabe no salário: desconta o que cabe e empurra a diferença** como parcela
   nova no fim do plano. O líquido nunca fica negativo.
3. **Desligamento antecipa o saldo** na primeira folha em rascunho, no momento em que o
   colaborador é inativado, avisando quem inativou.
4. **Existe quitação antecipada** do saldo restante.
5. **Adiantamento à vista é parcelamento em 1 vez.** Um caminho de código, sem ramo especial.

## Design

### 1. Modelo

**Tabela nova `rh_adiantamento_parcelas`:**

| coluna | tipo | papel |
|---|---|---|
| `id` | uuid | PK |
| `adiantamento_id` | uuid | FK para `rh_adiantamentos`, `on delete cascade` |
| `numero` | integer | ordem no plano, único por adiantamento |
| `competencia` | date | mês do desconto (dia 1) |
| `valor_previsto` | numeric(14,2) | o que o plano prevê descontar |
| `valor_descontado` | numeric(14,2) | o que a folha efetivamente descontou, default 0 |
| `folha_id` | uuid | FK para `folhas`, nulo = ainda não descontada |
| `gerada_por_folha_id` | uuid | FK para `folhas`, nulo exceto em parcela criada por empurrão |
| `created_at` | timestamptz | |

`unique (adiantamento_id, numero)`. RLS com policy de select por `rh.adiantamentos:ver`,
**sem DML para `authenticated`**: a escrita é só pelas funções definer, espelhando
`folha_item_encargos` e `folha_guias`. `anon` não recebe nada. Trigger de auditoria.

**`gerada_por_folha_id` existe por um motivo específico:** é o que permite a regeneração da
folha ser idempotente. Sem ele, regerar a mesma folha três vezes criaria três parcelas de sobra.

**`rh_adiantamentos.folha_id` sai** (expand-contract; produção tem zero adiantamento, então é
troca de estrutura e não migração de dado). Ela significa "esta folha descontou este
adiantamento", o que deixa de fazer sentido quando três folhas descontam pedaços dele. O vínculo
passa a viver na parcela.

Onde `folha_id` era usada e o que passa a valer:
- `fn_gerar_folha` (três pontos): passa a operar sobre parcelas;
- `garantirEmAberto` (trava de editar e excluir): a condição "já incluído numa folha" passa a
  ser "existe parcela com `folha_id` preenchido";
- identidade de conferência: passa a somar `valor_descontado` das parcelas da folha.

**Nenhuma coluna de "quantidade de parcelas".** É `count(*)` das parcelas; duas fontes para o
mesmo número divergem.

**`rh_adiantamentos.competencia` continua sendo a competência da primeira parcela**, então o
comportamento atual é o caso `parcelas = 1` e não existe ramo especial. A data da concessão já
vive em `rh_adiantamentos.data`.

### 2. Divisão em parcelas (lógica pura)

`dividirEmParcelas(total: number, quantidade: number): number[]` em
`src/modules/rh/adiantamentos/parcelamento.ts`. Parcelas iguais arredondadas a 2 casas, com a
diferença acumulada na primeira, de forma que a soma seja **exatamente** o total.

Casos de teste obrigatórios: 1.200 em 3 (400/400/400); 1.000 em 3 (333,34/333,33/333,33);
100 em 7; R$ 0,05 em 3 (0,03/0,01/0,01); 1 parcela (o total); quantidade maior que o total em
centavos (deve recusar na validação, não gerar parcela de zero).

**Limites validados nas três camadas** (check no banco, Zod, input na tela): quantidade de
parcelas inteira entre **1 e 60**, e nenhuma parcela pode sair com valor zero — o que implica
`quantidade <= total em centavos`. O teto de 60 é arbitrário e serve para impedir digitação
absurda (999 parcelas de um centavo); se algum caso real precisar de mais, é uma linha.

A mesma divisão roda no servidor. A prévia na tela é informativa: **o servidor recalcula**, e a
prévia nunca é fonte de verdade.

### 3. `fn_gerar_folha` (DINHEIRO)

A ordem do cálculo passa a ser, por colaborador:

```
disponivel  = salário − inss − irrf
previsto    = soma das parcelas em aberto deste colaborador nesta competência
descontado  = menor(previsto, maior(disponivel, 0))
líquido     = disponivel − descontado          -- nunca negativo
sobra       = previsto − descontado
```

`sobra > 0` cria **uma parcela nova no fim do plano de cada adiantamento que não coube**, com
`gerada_por_folha_id` = a folha corrente, `numero` = maior número existente + 1, e
`competencia` = **o mês seguinte à parcela de maior competência daquele adiantamento**. Se a
competência calculada já tiver folha aprovada, a parcela vai para o primeiro mês seguinte sem
folha aprovada: colocar parcela em folha aprovada seria dinheiro que nunca será descontado.

**A parcela parcialmente descontada fica fechada, não aberta.** Ela recebe `folha_id` e
`valor_descontado` menor que `valor_previsto`, e a diferença vive na parcela nova. A alternativa
(deixá-la aberta com desconto parcial) faria a mesma parcela ser contada em dois meses e é a
forma mais fácil de descontar o mesmo valor duas vezes.

**Cascata quando há mais de um adiantamento no mês.** As parcelas são descontadas em ordem de
`(rh_adiantamentos.data, rh_adiantamento_parcelas.numero)` — do adiantamento mais antigo para o
mais novo — cada uma pegando o que ainda cabe do disponível. Cada adiantamento gera sua própria
parcela de sobra. Sem essa regra explícita, "o que cabe" seria distribuído de um jeito que
ninguém consegue conferir depois.

**Idempotência.** No início, onde hoje existe
`update rh_adiantamentos set folha_id = null where folha_id = v_folha`, passa a haver:

```sql
delete from public.rh_adiantamento_parcelas where gerada_por_folha_id = v_folha;
update public.rh_adiantamento_parcelas
   set folha_id = null, valor_descontado = 0
 where folha_id = v_folha;
```

A função desfaz exatamente o que ela mesma fez. Regerar N vezes tem que dar o mesmo resultado e
não deixar parcela fantasma — e isso é teste obrigatório, não observação.

**O gap do líquido negativo é fechado por construção.** A pendência registrada no fechamento do
Bloco 8a (adiantamento maior que o salário deixa líquido negativo e nada registra a dívida)
deixa de existir: o saldo passa a ter onde morar. Líquido **zero** continua possível (e continua
não gerando lançamento), líquido **negativo** deixa de ser alcançável.

### 4. Identidade de conferência

Passa a ser:

```
Σ líquidos + Σ guias + Σ (valor_descontado das parcelas desta folha) == folhas.custo_total
```

Fecha pela mesma álgebra:
`Σ(salário − inss − irrf − descontado) + Σ(encargos + inss + irrf) + Σ descontado
= Σ salário + Σ encargos`.

**O `obj_description` da `fn_aprovar_folha` e a consulta de diagnóstico gravada nele têm que ser
atualizados na mesma entrega.** Mudar o cálculo e deixar o texto velho faz a ferramenta de
conferência mentir, e esse texto é exatamente onde alguém vai olhar ao encontrar diferença. As
causas de resíduo passam a ser duas (encargo sem grupo, retido sem grupo) mais "líquido zero";
a causa "líquido negativo" sai.

### 5. Quitação antecipada

`fn_quitar_adiantamento(p_adiantamento uuid, p_competencia date)`, definer, exige
`rh.adiantamentos:editar`. Junta as parcelas em aberto numa única na competência informada,
**preservando o total**. Registra em auditoria.

Recusa em dois casos: quando a folha da competência informada já está **aprovada** (mexer em
parcela de folha aprovada é alterar dinheiro já liberado), e quando **não há parcela em aberto**
(nada a quitar, e a mensagem diz isso em vez de criar parcela de zero). Competência **sem folha
nenhuma é válida**: a folha ainda vai ser gerada e vai encontrar a parcela.

### 6. Antecipação no desligamento

`fn_antecipar_adiantamentos_colaborador(p_colaborador uuid)`, definer. Junta o saldo em aberto
do colaborador numa parcela única por adiantamento. Sem saldo em aberto, não faz nada e devolve
zero.

**A competência de destino, sem ambiguidade:** a folha em `rascunho` de **menor competência**;
se não houver nenhuma folha em rascunho, o mês corrente em America/Rio_Branco. Nunca uma
competência cuja folha esteja `pendente_aprovacao` ou `aprovado` — no primeiro caso mudaria o
número que o Admin está analisando, no segundo alteraria dinheiro já liberado.

A função devolve a quantidade de parcelas antecipadas e a competência escolhida, para a Server
Action montar o aviso.

**Não é trigger, e a escolha é deliberada.** Efeito financeiro dentro de um `UPDATE` de cadastro
é o tipo de coisa que ninguém encontra depois, e o Bloco 8a já mostrou o custo desse padrão (o
trigger de guarda da folha é `BEFORE UPDATE OF status` e ficava cego a qualquer outra coluna).
Em vez disso, a Server Action que salva o colaborador detecta `ativo` virando falso, chama a
função explicitamente, e o toast informa quantas parcelas foram antecipadas e para qual
competência. Efeito em dinheiro visível na hora, para quem o causou.

### 7. Telas

- **Formulário de adiantamento**: campo de número de parcelas e prévia das parcelas antes de
  salvar (informativa, recalculada no servidor).
- **Listagem**: coluna de parcelamento ("3x de R$ 400,00") e coluna de saldo restante.
- **Detalhe do adiantamento**: as parcelas com competência, previsto, descontado e link para a
  folha que descontou.
- **Ação "Quitar saldo"** com `ConfirmDialog`, visível conforme permissão.
- **Holerite**: o desconto passa a poder identificar a parcela ("Adiantamento 2/3") em vez de só
  o valor.
- **Painel de alertas do RH**: categoria nova, colaborador inativo com saldo em aberto — a rede
  para um registro que escapou da antecipação.
- Canônicos primeiro (`MoneyText`, `CelulaVazia`, `ConfirmDialog`, `EmptyState`,
  `SecaoFormulario`); se um canônico não cobrir, evoluir o canônico em vez de duplicar.

### 8. Testes

**Vitest (puro):** `dividirEmParcelas` com os casos da seção 2; a montagem da prévia; o cálculo
do saldo restante; e o rótulo de parcelamento da listagem.

**Prova em banco, em transação revertida:**
- parcela que cabe: desconta, marca `folha_id` e `valor_descontado`;
- parcela que não cabe: desconta o que cabe, cria a sobra com `gerada_por_folha_id`, líquido zero;
- **regenerar a folha três vezes**: resultado idêntico, zero parcela fantasma;
- dois adiantamentos no mesmo mês: cascata pela ordem de data, cada um com sua sobra;
- quitação: total preservado, e recusa em competência com folha aprovada;
- antecipação ao inativar, incluindo o caso sem folha em rascunho;
- trava: adiantamento com parcela descontada não edita nem exclui;
- a identidade com o termo novo, incluindo o caso em que houve empurrão;
- `rh_adiantamento_parcelas` sem DML para `authenticated`, `anon` sem nada.

**Definição de pronto:** `tsc`, lint, build e vitest verdes; advisors sem achado novo; migrations
aplicadas por MCP **e** versionadas em `supabase/migrations/`; nenhuma prova deixando resíduo em
produção.

## Fora de escopo

- **O saldo a receber do colaborador não aparece como ativo no Financeiro.** O caixa continua
  fiel (o desembolso é despesa paga na concessão), e transformar isso em conta a receber é
  decisão de contabilidade, não de software.
- Juros ou correção sobre o saldo.
- Limite de percentual do salário por parcela.
- Desconto em verba rescisória de verdade: Bloco 9. Esta frente só garante que a dívida não fica
  órfã até lá.

## Riscos

1. **`fn_gerar_folha` é a função de dinheiro mais crítica do RH e será alterada de novo.** Ela
   mudou duas vezes no Bloco 8a (snapshot do grupo e guarda de status). O procedimento é o mesmo:
   copiar a definição viva antes, recriar a partir dela, e diffar depois esperando apenas as
   mudanças previstas.
2. **A regra de cascata é invisível no resultado.** Dois adiantamentos e um disponível
   insuficiente produzem números que só se conferem sabendo a ordem. A ordem tem que estar no
   comentário da função, não só na spec.
3. **A identidade e o texto que a explica precisam mudar juntos.** Se saírem em entregas
   diferentes, a conferência acusa bug inexistente — foi o que aconteceu duas vezes no 8a.
