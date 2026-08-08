# Aprovação da folha + folha vira lançamento no Financeiro (Bloco 8a) — Design

Data: 2026-08-08
Status: rascunho (design), pendente de revisão do Tiago
Autor: Léo (com Tiago)

## Problema

Do QA do RH de 23/07/2026, gap #16, que estava marcado como "a verificar": **fechar a folha
não gera nada no Financeiro**. Verificado no banco vivo em 08/08/2026: a `fn_fechar_folha`
só muda `folhas.status` para `fechada` e grava `data_fechamento`. Não toca em `lancamentos`.

Consequência: a folha calcula custo de mão de obra por centro de custo e esse dinheiro nunca
chega no contas a pagar. Quem paga salário lança à mão. O diarista já não tem esse problema
(a `fn_fechar_diarias` insere lançamento + parcela + rateio desde sempre); a folha CLT tem.

Segundo problema, levantado pelo Tiago ao fechar o escopo: **quem calcula a folha libera o
dinheiro sozinho**. Hoje `rh.folha` dá criar/editar/ver ao perfil Admin *e* ao perfil RH, e
fechar a folha exige só `editar`. Não existe segregação de função. Isso também viola a regra
8 do `CLAUDE.md` do projeto, que manda `rascunho > pendente_aprovacao > aprovado > efeito`.

## Contexto: onde o RH está (auditoria de 08/08/2026)

Dos 16 gaps do QA original, 12 estão fechados e em produção (Blocos 1 a 7). Os abertos:

| gap | o que é | destino |
|---|---|---|
| #16 | folha não gera lançamento no Financeiro | **este bloco (8a)** |
| #5 | 13º e férias com cálculo financeiro | 8b, 8c, 8d |
| #6 | rescisão / TRCT | Bloco 9 |
| #4 | eSocial | Bloco 10 |

O gap #5 foi decomposto com o Tiago em quatro entregas, nesta ordem: **8a** ponte com o
Financeiro (este), **8b** provisão mensal de 13º e férias, **8c** folha de 13º, **8d** recibo
de férias. A ordem é deliberada: o 8a não depende de nenhuma regra trabalhista, conserta um
gap que já existe hoje na folha mensal, e é a base que 8c e 8d vão reusar para pagar.

**Estado do dado no banco vivo (08/08/2026):** 0 colaboradores, 0 folhas, 0 encargos
cadastrados, 0 faixas de INSS, 0 faixas de IRRF, 0 parâmetros de folha. Cadastro base
carregado (782 fornecedores, 18 centros de custo, 16 obras, 5 contas bancárias, 2 usuários).
Isso importa por dois motivos: (1) o rename do status `fechada` é troca de check, não
migração de dado; (2) o bloco não tem como ser validado contra caso real até o Tiago
cadastrar colaborador, encargos e faixas.

## Decisões fechadas com o Tiago

1. **Escopo do Bloco 8: provisão e pagamento**, e a ponte com o Financeiro dentro do Bloco 8.
   Quebrado em 8a/8b/8c/8d, uma frente por vez.
2. **Um lançamento por colaborador**, com o líquido, rateado no centro de custo do item.
   Motivo: pagamento e conciliação são por pessoa (Pix/TED por CPF casa com a linha).
3. **As guias (INSS, FGTS, IRRF) também viram lançamento**, uma por grupo de recolhimento,
   configurável pelo Tiago. Sem isso o custo por obra no Financeiro ficaria menor que o do RH
   e nasceriam dois números de custo de mão de obra convivendo.
4. **A aprovação é o que gera o dinheiro:** `rascunho > pendente_aprovacao > aprovado`. Os
   lançamentos nascem no momento da aprovação, nunca antes. Rejeitar volta para rascunho com
   motivo obrigatório e zero lançamento criado.
5. **`rh.folha:aprovar` e `rh.folha:desaprovar` só no perfil Admin.** O RH gera e envia, não
   aprova a própria folha.
6. **Desaprovar apaga os lançamentos** (delete de verdade, não cancelamento), e é bloqueado se
   qualquer parcela já estiver comprometida (ver trava abaixo).
7. **Vencimento do salário por parâmetro**, não digitado a cada mês.
8. **O adiantamento passa a virar lançamento** na concessão. Hoje ele é descontado do líquido
   e o dinheiro sai do caixa sem o app ver.

## Design

### 1. Máquina de status da folha

**`folhas.status`**: o check passa de `('rascunho','fechada')` para
`('rascunho','pendente_aprovacao','aprovado')`. O valor `fechada` **sai**: manter `fechada` e
`aprovado` como dois nomes do mesmo estado é dívida que vira bug. Zero folha no banco, então
é troca de check, não migração.

**`aprovado` no masculino, e isso não é descuido de concordância.** É o valor do `StatusPadrao`
canônico (`src/components/canonicos/status-badge.tsx`), o mesmo que a OC usa, e o `ApprovalBar`
canônico decide o que renderizar comparando com `'pendente_aprovacao'` e `'aprovado'` literais.
Usar `aprovada` no banco faria o canônico não reconhecer o estado e sumir com o botão de
desaprovar. O rótulo feminino na tela sai do `rotulo` do `StatusBadge`, que existe pra isso.

**Não existe status `rejeitado` na folha.** Rejeitar leva a `rascunho` com o motivo gravado, e o
próximo envio limpa o motivo (igual a OC faz). Divergência consciente da OC: uma OC rejeitada é
um documento que morreu, uma folha é recalculável, e corrigir exige regenerar, que exige
rascunho. Um `rejeitado` na folha seria um beco sem saída precisando de uma transição extra só
pra sair dele.

**Colunas novas em `folhas`**, todas espelhando padrão existente no projeto:
- `aprovado_por uuid` e `aprovado_em timestamptz` (espelha `rh_pontos`)
- `motivo_rejeicao text` (espelha a OC; o `trilha-helpers.ts` já sabe rotular esse campo)

**`data_fechamento` é dropada** (expand-contract, zero dado). `aprovado_em` passa a ser a
única data de conclusão da folha: dois campos para a mesma verdade divergem com o tempo. A UI
troca "fechada em" por "aprovada em".

**Nenhuma tabela de transições.** A auditoria universal já grava em `audit_log`, e a `Trilha`
canônica lê de lá e já renderiza `status`, `motivo_rejeicao`, `aprovado_por` e `aprovado_em`.
A trilha da folha sai de graça.

**Duas ações novas no recurso `rh.folha`**: `aprovar` e `desaprovar`, ambas semeadas apenas no
perfil Admin e nos usuários que já têm o Admin. O par é o mesmo que `compras.ordens` usa (as duas
já existem em `ACOES`), e separá-las permite dar a alçada de aprovar sem dar a de desfazer. O
perfil RH mantém criar/editar/ver e não ganha nenhuma das duas.

**A máquina de status, espelhando exatamente o que a OC faz:**

| ação na UI | transição | exige | como | efeito em dinheiro |
|---|---|---|---|---|
| Enviar para aprovação | rascunho → pendente_aprovacao | `rh.folha:editar` | update direto, guardado por trigger | nenhum. Recusa folha vazia |
| Aprovar | pendente_aprovacao → aprovado | `rh.folha:aprovar` | `fn_aprovar_folha(p_folha)` | **cria os lançamentos** |
| Rejeitar | pendente_aprovacao → rascunho | `rh.folha:aprovar` | update direto + `motivo_rejeicao` | nenhum |
| Desaprovar | aprovado → rascunho | `rh.folha:desaprovar` | `fn_desaprovar_folha(p_folha, p_motivo)` | apaga os lançamentos |

**Trigger de guarda `fn_guarda_status_folha`**, cópia estrutural de `fn_guarda_status_oc`: deixa
passar quando o status não mudou, deixa passar quando `current_user` não é `authenticated`/`anon`
(dentro das RPCs definer, que já checaram tudo), permite só as duas transições que o app faz por
update direto com a permissão de cada uma, e estoura com mensagem explicativa em qualquer outra.
Sem ele, um update direto por RLS pularia a aprovação e deixaria a folha aprovada sem lançamento.

`fn_fechar_folha` e `fn_reabrir_folha` são dropadas junto com o status `fechada`. A checagem de
folha vazia que vivia na `fn_fechar_folha` passa para o trigger de guarda (rascunho só sai para
pendente_aprovacao se houver item).

**`fn_gerar_folha` passa a exigir status `rascunho`.** Hoje ela recusa apenas
`status='fechada'`, o que com a máquina nova deixaria o RH regenerar uma folha que está
`pendente_aprovacao` e trocar os números debaixo do Admin que está analisando. A condição vira
"gera só em rascunho".

**A aprovação não recalcula a folha.** `fn_aprovar_folha` usa os `folha_itens` como estão: o
Admin aprova exatamente o que viu na tela. Se o ponto mudou depois do envio, o caminho é
rejeitar, regenerar em rascunho e enviar de novo. Recalcular na aprovação faria o Admin
carimbar um número que ele não leu.

**Por que desaprovar não fica em `editar`:** hoje a `fn_reabrir_folha` exige `rh.folha:editar`,
ou seja, o perfil RH reabre. Desaprovar é desfazer aprovação: em `editar`, o RH desfaria o
carimbo do Admin e apagaria lançamentos aprovados por ele, sozinho.

**Trava do desaprovar (mais forte do que "se foi pago").** A desaprovação estoura, sem desfazer
nada, se **qualquer** parcela de **qualquer** lançamento daquela folha estiver:
- com status `aprovado` ou `pago` (parcela aprovada já está na fila de pagamento), ou
- conciliada em `extrato_transacoes` (já casou com o extrato do banco).

Essas são exatamente as travas que a `fn_excluir_lancamento` canônica já aplica, replicadas
aqui. A mensagem de erro nomeia o colaborador ou a guia que travou, para o usuário saber o que
resolver. Se nada está comprometido, apaga: `lancamento_parcelas` e `lancamento_rateios` são
`ON DELETE CASCADE`, então o delete do lançamento leva os filhos.

### 2. Geração dos lançamentos (dentro de `fn_aprovar_folha`)

**Três origens novas** em `lancamentos.origem`, que hoje aceita só `('oc','manual','diaria')`:
`folha` (salário de um colaborador), `folha_guia` (uma guia) e `adiantamento`. Separadas de
propósito: o `origem_id` de cada uma aponta para um tipo de registro diferente, e usar
`'folha'` para as três deixaria o `origem_id` ambíguo. A UI do Financeiro trata `origem` como
texto e só dá tratamento especial ao `oc`, então valor novo não quebra tela.

**`fn_excluir_lancamento` ganha as origens novas na lista de bloqueio**, seguindo o que ela já
faz com `diaria`: mensagem "não dá para excluir aqui, este lançamento veio da folha (ou do
adiantamento); exclua pela folha". Lançamento de origem RH se apaga pela origem, nunca pelo
Financeiro.

**Salário, um por colaborador.** Para cada `folha_itens` com `valor_liquido > 0`:
- `lancamentos`: `tipo='a_pagar'`, `origem='folha'`, `origem_id = folha_itens.id`,
  `status='a_pagar'`, `descricao = 'Salário ' || nome || ' MM/AAAA'`,
  `valor = valor_liquido`, `centro_custo_id` = o do item, `mes_competencia` = competência da
  folha, `data_compra` = hoje em America/Rio_Branco, `data_vencimento` = calculado (seção 4).
- `lancamento_parcelas`: uma, `numero_parcela=1`, `status='pendente'`, mesmo valor e vencimento.
- `lancamento_rateios`: uma, no centro de custo do item, valor total.
- `folha_itens.lancamento_id` recebe o id (coluna nova, espelha `rh_diarias.lancamento_id`).

Item com `valor_liquido <= 0` não gera lançamento: o adiantamento do mês pode ter consumido o
salário inteiro, e lançamento de R$ 0,00 é sujeira na tela de pagamentos. O item continua na
folha, com o líquido zerado, e aparece no holerite normalmente.

**Guias, uma por grupo de recolhimento.** Para cada grupo com valor > 0:
- `lancamentos`: `origem='folha_guia'`, `origem_id = folha_guias.id`, `descricao = grupo || '
  folha MM/AAAA'`, `valor` = total do grupo, `centro_custo_id = null` (a guia não pertence a um
  centro só; o custo por centro vem do rateio).
- `lancamento_parcelas`: uma, `pendente`.
- `lancamento_rateios`: **uma por centro de custo** (ver rateio abaixo).
- `folha_guias`: tabela nova (`folha_id`, `grupo`, `valor`, `lancamento_id`), com
  **unique (`folha_id`, `grupo`)** e FK para `folhas` em cascade, escrita só pela função definer
  e lida com `rh.folha`, espelhando `folha_item_encargos`. Serve para saber quais lançamentos
  apagar na reabertura e para mostrar a quebra na tela sem recalcular.

**Composição de cada guia.** Um grupo soma três fontes possíveis:
1. encargos patronais cujo `folha_encargos.grupo_recolhimento` é aquele grupo (valor vem de
   `folha_item_encargos`, que já é snapshot por item);
2. `folha_itens.inss` (retido do trabalhador), se `folha_parametros.grupo_recolhimento_inss`
   apontar para esse grupo;
3. `folha_itens.irrf`, se `folha_parametros.grupo_recolhimento_irrf` apontar para esse grupo.

**O rateio da guia é exato, não proporcional aproximado.** Cada centavo de encargo e cada
centavo retido já nasce ligado a um `folha_itens`, e cada item tem centro de custo. O rateio é
a mesma soma agrupada por centro de custo do item. A soma dos rateios bate com o valor do
lançamento por construção: é o mesmo número somado de duas maneiras, não duas contas
independentes. Mesmo argumento que fechou o Bloco 6, e o mesmo motivo de não haver centavo
residual para distribuir.

**Competência do Financeiro.** `fn_aprovar_folha` chama
`fn_exigir_competencia_aberta(competencia, 'folha', folha_id)` antes de inserir, exatamente
como a `fn_fechar_diarias` faz. Competência fechada barra a aprovação, a menos que o usuário
tenha `financeiro.competencias:desaprovar`, caso em que registra exceção em
`competencia_eventos`.

**Não preenchidos de propósito:** `fornecedor_id` (colaborador não é fornecedor, e a FK aponta
só para `fornecedores`; a diária faz igual), `numero` (a diária também deixa nulo) e
`categoria_id`. A categoria fica como gap menor declarado: se o Tiago quiser classificar folha
numa categoria financeira, é um campo em `folha_parametros` depois, não neste bloco.

### 3. Grupo de recolhimento (config editável, sem seed de valor)

Segue o padrão que destravou o Grupo B: o Tiago cadastra, eu construo o mecanismo.

- `folha_encargos` ganha `grupo_recolhimento text` (nulo = não vira guia).
- `folha_parametros` (singleton `id=1`) ganha `grupo_recolhimento_inss text` e
  `grupo_recolhimento_irrf text`, cada um nomeando o grupo onde o retido do trabalhador entra.
  Vazio = o retido não vira guia. Ganha também `dia_vencimento_guias smallint` (check 1..31):
  **um dia para todas as guias**, não um por encargo. INSS, FGTS e IRRF de folha vencem no
  mesmo dia, e dia por encargo obrigaria a inventar desempate para dois encargos do mesmo grupo
  com dias diferentes, resolvendo um problema que a própria config criaria.
- `folha_item_encargos` ganha `grupo_recolhimento text`, gravado pela `fn_gerar_folha` como
  **snapshot** junto com nome/percentual/valor. A tabela não tem FK para `folha_encargos` (só o
  nome), então mapear encargo para grupo por nome quebraria ao renomear um encargo. O grupo é
  congelado no momento da geração, mesmo princípio que o Bloco 6 já usa para o percentual.

**O nome do grupo casa por igualdade exata, então não pode ser digitação livre nos dois
lados.** Em `/rh/parametros-folha` os dois campos de grupo são `Combobox` alimentado pelos
grupos distintos já cadastrados em `/rh/encargos`, mais a opção de criar (o `ComboboxCriavel`
canônico). Se fossem dois inputs de texto, "INSS" e "inss" seriam grupos diferentes e o retido
viraria uma guia sozinha, silenciosamente.

**Um grupo pode existir só pelo retido.** É o caso normal do IRRF: não há encargo patronal de
IRRF, só o retido do trabalhador. Então a guia de IRRF nasce de `folha_itens.irrf` e de mais
nada, e isso é válido, não é erro de configuração.

**Todas as guias vencem no mesmo dia**, o `dia_vencimento_guias` de `folha_parametros`, pela
mesma regra de mês seguinte do salário. Sem parâmetro, as guias nascem sem vencimento e o
Financeiro preenche.

**Config vazia é deploy seguro:** sem grupo cadastrado, a aprovação gera apenas os salários e
nenhuma guia. Não existe caminho em que o bloco invente um valor de guia.

### 4. Vencimento

- `folha_parametros` ganha `dia_pagamento_salario smallint`, check 1..31.
- Vencimento do salário = esse dia **no mês seguinte** à competência. Dia que não existe no mês
  (31 em fevereiro) cai no último dia do mês. Dezembro rola para janeiro do ano seguinte.
- Sem parâmetro, o lançamento nasce sem `data_vencimento` e o Financeiro preenche.
- As guias usam `dia_vencimento_guias`, mesma regra de mês seguinte.
- A conta é função pura em TypeScript, testada, e a mesma regra em SQL na função. As duas têm
  que dar o mesmo dia para os casos de borda (o mesmo cuidado do Bloco 7 entre
  `calculo-imposto.ts` e a `fn_gerar_folha`).

### 5. Adiantamento vira lançamento

- `rh_adiantamentos` ganha `lancamento_id uuid`.
- Conceder gera `a_pagar` imediato: `origem='adiantamento'`,
  `origem_id = rh_adiantamentos.id`, descrição `'Adiantamento ' || nome || ' MM/AAAA'`, centro
  de custo do colaborador, vencimento = data do adiantamento, mais parcela e rateio. Passa por
  `fn_exigir_competencia_aberta`.
- **Custo declarado:** a criação do adiantamento hoje é `insert` direto pela RLS
  (`criarAdiantamento` em `src/modules/rh/adiantamentos/actions.ts`). Para o adiantamento e o
  lançamento nascerem na mesma transação, a criação vira `fn_registrar_adiantamento` definer.
  É a mesma refatoração que a diária já tem, é pequena, e é mexer num fluxo que hoje funciona.
- A trava `garantirEmAberto` (que já bloqueia editar/excluir quando o adiantamento entrou numa
  folha) ganha condição irmã: adiantamento cujo lançamento tem parcela aprovada, paga ou
  conciliada não edita nem exclui. Excluir adiantamento sem parcela comprometida apaga o
  lançamento junto.

### 6. Telas (só canônico que já existe)

- **`/rh/folha` detalhe**: `ApprovalBar` com Enviar para aprovação, Aprovar e Reprovar (com
  motivo); `StatusBadge` nos três status; `Trilha` lendo o `audit_log` de `folhas`; seção nova
  "Lançamentos gerados" listando salários e guias, cada linha linkando para o lançamento no
  Financeiro. Empty state enquanto a folha é rascunho.
- **`/rh/encargos`**: dois campos no form (grupo de recolhimento, dia de vencimento) e as
  colunas na tabela.
- **`/rh/parametros-folha`**: três campos (dia de pagamento do salário, grupo do INSS retido,
  grupo do IRRF retido).
- **`/rh/adiantamentos`**: coluna indicando se já virou lançamento, com a trava quando
  comprometido.
- **Permissão tripla**: Aprovar e Reprovar só renderizam com `rh.folha:aprovar`, a Server
  Action checa, e a função no banco barra de novo.

### 7. Testes e prova de aceite

**Vitest (funções puras):**
- cálculo do vencimento: dia 31 em fevereiro (ano comum e bissexto), virada de dezembro para
  janeiro, dia 1, parâmetro nulo;
- agrupamento das guias: encargo sem grupo fica fora, dois encargos no mesmo grupo somam,
  retido de INSS e IRRF caindo em grupos diferentes e no mesmo grupo;
- montagem da lista de lançamentos gerados para a tela;
- rótulos e transições permitidas da máquina de status (o que cada status habilita).

**Prova em banco (o teste de aceite do bloco).** Cenário: dois colaboradores em dois centros de
custo distintos, dois encargos em dois grupos de recolhimento, faixas de INSS e IRRF
cadastradas, um adiantamento. Então:

```
Σ liquidos + Σ guias + Σ adiantamentos  ==  folhas.custo_total
```

porque os retidos e o adiantamento se cancelam:

```
  Σ (salario − inss − irrf − adiantamento)      [salários]
+ Σ encargos + Σ inss + Σ irrf                  [guias]
+ Σ adiantamento                                [adiantamentos]
= Σ salario + Σ encargos
= Σ custo_total
```

Se não fechar no centavo, o bloco não sobe. Além disso:
- soma dos rateios de cada guia == valor do lançamento da guia;
- desaprovar com tudo pendente apaga os lançamentos e zera `lancamento_id`;
- parcela marcada como `aprovado`, `pago` ou conciliada faz a desaprovação estourar;
- perfil RH consegue enviar para aprovação e **não** consegue aprovar nem desaprovar;
- update direto de status por RLS pulando a aprovação estoura no trigger de guarda;
- config de grupos vazia gera salários e nenhuma guia;
- item com líquido zero não gera lançamento e continua na folha;
- `fn_gerar_folha` estoura em folha `pendente_aprovacao` (não deixa trocar o número debaixo do
  Admin) e continua funcionando em `rascunho`;
- grupo que existe só pelo retido de IRRF gera a guia com o valor do retido e sem encargo;
- competência do Financeiro fechada barra a aprovação, e com
  `financeiro.competencias:desaprovar` registra exceção em `competencia_eventos`.

**Definição de pronto:** `tsc --noEmit`, lint e build limpos; sem `any` novo; advisors do
Supabase sem issue novo; RLS e grants conferidos na tabela nova (`folha_guias` sem DML para
`anon`, escrita só pela definer); auditoria gravando as transições; portão de testes verde.

## Fora de escopo deste bloco

- Provisão mensal de 13º e férias+1/3 na folha (**8b**).
- Folha de 13º, primeira e segunda parcela, com tributação própria (**8c**).
- Recibo de férias com 1/3, abono e o abatimento na folha mensal (**8d**).
- Rescisão e TRCT (Bloco 9). eSocial (Bloco 10).

## Gaps conhecidos que continuam abertos depois do Bloco 8

Achados na auditoria de 08/08/2026, nenhum deles é sobre financeiro, e por isso nenhum entra
em 8a/8b/8c/8d. Registrados aqui para o módulo não ser declarado 100% sem eles:

1. **Salário nunca é proporcional.** A `fn_gerar_folha` usa `colaboradores.salario` cheio, sem
   olhar `data_admissao`. Admitido dia 20 recebe o mês inteiro.
2. **Falta não desconta nada.** Coerente com salário fechado, mas é omissão hoje, não decisão
   registrada.
3. **Salário-família nunca é pago.** `rh_dependentes.dependente_salario_familia` existe desde o
   Bloco 2 e a folha ignora.
4. **Não existem "outros descontos"** (VT, plano de saúde, pensão). Era o "Bloco 7b" anotado no
   Bloco 7 e nunca entrou.
5. **Categoria financeira** dos lançamentos de folha fica nula (mesmo comportamento da diária).

## Pendências do Tiago

Sem estas, o bloco sobe mas não roda com número real:

1. Cadastrar os encargos patronais em `/rh/encargos`, agora **com grupo de recolhimento**.
2. Cadastrar as faixas de INSS e IRRF e os parâmetros em `/rh/parametros-folha`, incluindo o
   **dia de pagamento do salário**, o **dia de vencimento das guias** e em que grupo cada retido
   entra.
3. Cadastrar ao menos um colaborador CLT real (o banco tem zero hoje).
4. Validar um holerite real (aceite fiscal pendente desde o Bloco 7).
