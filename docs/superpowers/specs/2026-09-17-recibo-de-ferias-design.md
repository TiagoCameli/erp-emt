# Recibo de férias (Bloco 8d) — Design

Data: 2026-09-17
Estado: desenho aprovado pelo Tiago no chat, pendente de plano de implementação.

**Antecessor direto:** o 13º (Bloco 8c), em produção desde 14/09/2026. Este bloco
repete o mesmo desenho, e a razão está na seção "O que este bloco herda".

**Substitui** a Seção 3 da spec `2026-09-11-13o-e-ferias-design.md`, que descrevia
um recibo CALCULADO (salário ÷ 30 × dias, mais um terço). Aquele desenho morreu
junto com o do 13º em 14/09, e não deve ser reaproveitado.

## Problema

O app registra férias e não paga férias.

`rh_ferias` guarda período aquisitivo, datas de gozo, dias e um `status` de
`programada` / `gozada`. Não há valor, não há aprovação, não há lançamento. Quem
paga férias hoje lança na mão no Financeiro, sem vínculo com o colaborador nem
com o período.

**A tabela tem ZERO linhas em produção.** Ninguém nunca registrou férias no app.
Isso é dado, não detalhe: um cadastro em duas etapas que não paga nada não é
aberto por ninguém, e é por isso que o recibo passa a criar o registro.

Estado medido em 17/09/2026: 28 CLT ativos, 10 com `data_admissao`, 0 provisões
ativas, 0 linhas em `rh_ferias`.

## Decisões fechadas com o Tiago (16 e 17/09/2026)

| # | Decisão | Consequência |
|---|---|---|
| 1 | **O app não calcula.** Bruto, INSS e IRRF são digitados. | Nada de salário ÷ 30 × dias, nada de terço. Mesma regra do 13º. |
| 2 | **Uma tela só:** o recibo cria o registro de férias. | Não existe "primeiro programe, depois pague". |
| 3 | **Gozo e pagamento são status separados.** | `status` (programada/gozada) e `status_recibo` convivem. |
| 4 | **"Nova férias" continua existindo**, sem dinheiro. | Programar sem pagar segue possível, e o alerta de vencimento sobrevive. |
| 5 | **Cada recibo é um documento**, com ciclo próprio. Não é lote. | Férias acontece uma pessoa por vez ao longo do ano. |
| 6 | **A guia sai igual à do 13º**, por grupo de recolhimento. | Uma guia por recibo quando houver desconto digitado. |

## O que este bloco herda

O 13º foi desenhado duas vezes. A primeira versão calculava avos e percentual, e
durou **um dia**: a empresa paga 13º para quem não tem carteira, e para essa
gente não existe fórmula. A segunda virou planilha.

Este bloco nasce já na segunda versão. Concretamente, herda:

- **Valor digitado**, com salário, vínculo e admissão em cinza como contexto.
- **Líquido = bruto − INSS − IRRF**, por trigger, em coluna comum (coluna gerada
  devolve 428C9 ao frontend publicado antes do deploy novo).
- **Ciclo com volta**: Voltar para rascunho, Devolver para ajuste, Desaprovar.
- **Copiar pedido**: mensagem com números e link para o WhatsApp de quem aprova.
- **Vencimento editável**, só em rascunho.
- **Três vínculos**: quem não tem carteira também tira férias e recebe.

## Design

### 1. Modelo

`rh_ferias` continua sendo a tabela. Uma linha = umas férias = um recibo.

**Fica como está:** `colaborador_id`, `periodo_aquisitivo_inicio`,
`periodo_aquisitivo_fim`, `data_inicio`, `data_fim`, `dias`, `status`
(`programada` / `gozada`), `observacao`.

**Entra:**

```
status_recibo    text not null default 'sem_recibo'
                 ('sem_recibo','rascunho','pendente_aprovacao','aprovado')
valor_bruto      numeric(14,2) not null default 0
valor_inss       numeric(14,2) not null default 0
valor_irrf       numeric(14,2) not null default 0
valor_liquido    numeric(14,2) not null default 0   -- trigger
data_vencimento  date
centro_custo_id  uuid references centros_custo(id)
lancamento_id    uuid references lancamentos(id)
aprovado_por     uuid references usuarios(id)
aprovado_em      timestamptz
motivo_rejeicao  text
```

**Dois status, de propósito.** Gozo e pagamento não andam juntos: alguém pode
estar de férias sem o recibo ter saído, e alguém pode receber antecipado sem ter
saído ainda. Colapsar os dois num só obrigaria a inventar uma ordem que a
operação não tem.

**Qual status de gozo a linha nasce com:** quem lança escolhe, e o formulário
sugere `programada`. Pagar férias que já aconteceram é caso real (o recibo
atrasou), e deduzir o status pela data seria adivinhação: uma data futura não
prova que a pessoa vai tirar, e uma data passada não prova que tirou.

`centro_custo_id` é fotografado do colaborador no momento da criação, como no
13º: o cadastro pode mudar depois e o custo já lançado não muda junto.

### 2. O cálculo (DINHEIRO)

Não há. É o ponto do bloco.

O único número derivado é a subtração, mantida por trigger:

```
valor_liquido = valor_bruto - valor_inss - valor_irrf
```

`salario_base` **não** é gravado aqui, diferente do 13º: lá o lote é uma
fotografia de um momento, aqui a linha é de uma pessoa só e o salário é lido do
cadastro na hora de exibir. Um número a menos para envelhecer.

### 3. As RPCs

Toda escrita passa por RPC `security definer`: a tabela ganha grant de SELECT e
mais nada, como `rh_decimo_terceiro`.

| Função | O que faz |
|---|---|
| `fn_lancar_ferias(p_colaborador, p_aquisitivo_inicio, p_aquisitivo_fim, p_data_inicio, p_data_fim, p_dias, p_status, p_bruto, p_inss, p_irrf, p_data_vencimento, p_observacao)` | Cria a linha de férias **e** o recibo em rascunho, numa transação. Devolve o id. |
| `fn_editar_recibo_ferias(p_ferias, p_bruto, p_inss, p_irrf)` | Grava os três valores. Só em rascunho. |
| `fn_definir_vencimento_ferias(p_ferias, p_data)` | Vencimento. Só em rascunho. |
| `fn_enviar_recibo_ferias_aprovacao(p_ferias)` | Rascunho → pendente. Recusa recibo zerado. |
| `fn_voltar_recibo_ferias_para_rascunho(p_ferias)` | Pendente → rascunho, sem motivo. Lado de quem montou. |
| `fn_rejeitar_recibo_ferias(p_ferias, p_motivo)` | Pendente → rascunho, COM motivo. Lado de quem aprova. |
| `fn_aprovar_recibo_ferias(p_ferias)` | Gera a conta a pagar e a guia. |
| `fn_desaprovar_recibo_ferias(p_ferias, p_motivo)` | Apaga os lançamentos e volta para rascunho. |

O `fn_editar_ferias` que já existe (datas, dias, observação) continua e não toca
em dinheiro.

### 4. O dinheiro no financeiro

**Aprovar** gera, numa transação:

- **Uma conta a pagar**, `origem = 'ferias'` (já aceita no CHECK desde o PR
  #279), `origem_id` = a linha de férias, `centro_custo_id` o do recibo,
  descrição `Férias <nome> <dd/mm> a <dd/mm>`.
- **Uma guia por grupo de recolhimento**, quando houver INSS ou IRRF digitado,
  com `origem = 'ferias_guia'`. **Essa origem é nova e precisa entrar no CHECK.**

Vale a mesma razão do 13º para não reusar `folha_guia`: `folha_guias.folha_id` é
NOT NULL apontando para `folhas`, e `rh/folha/queries.ts` casa `folha_guias` por
`lancamento_id` para classificar a linha como guia.

**A competência é o mês de INÍCIO DO GOZO**, não o mês do pagamento: o custo
pertence ao mês em que a pessoa esteve de férias. Passa por
`fn_exigir_competencia_aberta` antes de gravar.

**Recibo com líquido <= 0 não é aprovado**, e a mensagem diz por quê.

**Desaprovar** solta `lancamento_id` ANTES do delete: a FK é simples, sem
`on delete set null`, e inverter a ordem estoura no meio. Recusa se alguma
parcela já foi paga.

### 5. Telas

Na seção **Férias** da aba `13º e Férias`:

- O botão **"Lançar férias"** abre um formulário só: colaborador, período
  aquisitivo, datas de gozo, dias, e os três valores. Salvou, nasce a linha com
  o recibo em rascunho.
- O **"Nova férias"** atual continua, para programar sem pagar.
- A tabela ganha a coluna **Recibo**: "sem recibo", "rascunho", "pendente", ou o
  líquido quando aprovado.
- Clicar numa linha com recibo abre o detalhe, em rota própria
  (`/rh/decimo-terceiro-e-ferias/ferias/[id]`), com a barra de aprovação, o
  vencimento editável, Copiar pedido e Voltar para rascunho.

Salário, vínculo e data de admissão aparecem em cinza no formulário e no
detalhe: contexto para decidir o valor, nunca base de conta.

A rota do detalhe leva `maxDuration`: a aprovação escreve lançamento, parcela,
rateio e guia numa transação, e a action roda na função da página.

### 6. Permissões

Nenhum recurso novo. Tudo cai em `rh.decimo-terceiro-ferias`, que já existe com
`ver`, `criar`, `editar`, `excluir`, `aprovar` e `desaprovar`, e cujo Admin já
tem as seis.

## Testes

**Prova em `supabase/provas/recibo_ferias.sql`**, em transação desfeita,
chamando as RPCs de verdade: `plpgsql` só valida o corpo na primeira execução, e
`apply_migration` devolver `success` não prova nada.

O que ela confere:

1. `fn_lancar_ferias` cria a linha **e** o recibo, e a linha nasce com
   `status_recibo = 'rascunho'` e valores zerados.
2. Digitar 1.000 − 80 − 20 grava 900 no líquido (a única conta do bloco).
3. Aprovar gera **um** lançamento de 900 no centro de custo daquela pessoa, com
   competência no mês do início do gozo.
4. Desaprovar devolve: zero lançamento, `lancamento_id` nulo, status em rascunho.
5. Devolver para ajuste volta para rascunho **e de lá dá para editar de novo** —
   é o que o 13º ensinou: voltar sem destravar a edição é beco sem saída.

**Quatro controles**, cada um com sua linha: recibo sem dias recusado, desconto
maior que o bruto recusado, aprovar em rascunho recusado, e mexer no vencimento
com o recibo pendente recusado. Mais uma linha de controle que **deve** falhar e
falha, senão a prova não está olhando.

**TypeScript (vitest)** cobre o que é de TypeScript: os schemas (datas coerentes,
dias maior que zero, dinheiro em pt-BR, desconto que passa do bruto) e a mensagem
de aprovação. Valor em real asserido pelo formatador, nunca por string literal.
Cada teste tem que cair quando o código é quebrado de propósito.

**O embed de quem aprovou leva hint de FK.** `rh_ferias` passará a ter duas FKs
para `usuarios` (`created_by` e `aprovado_por`), e embed ambíguo devolve HTTP 300
e quebra a tela sem aparecer em `tsc`, lint ou build. Conferir com curl e a anon
key antes de subir: 300 é ambíguo, 401 é o embed resolvido parando na RLS.

## Fora de escopo

- **Cálculo de férias** (salário ÷ 30 × dias, terço constitucional). Decisão do
  Tiago: o valor é digitado.
- **Abono pecuniário** (venda de 10 dias).
- **Abatimento da provisão de férias.** Mesma situação do 13º: `folha_provisoes`
  está vazia, então nada é provisionado hoje. A tela avisa se houver provisão de
  férias ativa, porque aí o custo conta duas vezes.
- **Recibo impresso** em PDF. O 13º também não tem, pela mesma razão: ninguém
  usou ainda para saber o que quer ver no papel.
- **eSocial** (Bloco 10).

## Riscos

1. **`rh_ferias` está vazia, e continuar vazia é o desfecho ruim.** O bloco é uma
   aposta de que uma tela que paga é uma tela que alguém abre. Se em um mês
   ninguém lançar férias por aqui, o problema não é a tela: é que o controle de
   férias não é feito no app, e aí o certo é parar, não acrescentar campo.
2. **As faixas de INSS e IRRF seguem vazias**, como no 13º. Não bloqueia: os
   valores são digitados. Mas a guia só sai se o Tiago digitar o desconto, e o
   grupo de recolhimento precisa estar cadastrado em `/rh/parametros-folha`,
   senão o retido não vira conta a pagar. A tela avisa.
3. **Uma guia por recibo.** Decisão consciente do Tiago em 17/09: cinco férias
   com desconto no mês geram cinco guias de INSS na fila. Só dispara quando ele
   digita desconto, e na operação dele a maioria vai com zero.
4. **O banco vivo se move.** Reler a definição viva das funções tocadas
   imediatamente antes de alterar: o arquivo do repo diverge do banco.
