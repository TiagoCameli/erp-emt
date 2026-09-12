# 13º e Férias: lançamento e pagamento (Bloco 8c + 8d) — Design

Data: 2026-09-11
Estado: aprovado pelo Tiago no chat, pendente de plano de implementação.
Antecessores: `2026-08-08-rh-folha-financeiro-design.md` (folha), `2026-08-13-rh-provisao-13o-ferias-design.md` (provisão 8b), e a rescisão (PR #236, migration `20260829210000_rescisoes.sql`), que é o molde estrutural desta entrega.

## Problema

O ERP não paga 13º nem férias. O que existe hoje, medido no banco vivo em 11/09/2026:

- **Provisão** (`folha_provisoes`, `folha_item_provisoes`): custo sem caixa, não gera lançamento nem guia. A tabela está **vazia**, então nada é provisionado hoje.
- **Rescisão** (`fn_rescisao_avos_13`): 13º proporcional só ao desligar, só CLT.
- **Folha mensal**: `folhas` tem `UNIQUE (competencia)` e não tem coluna `tipo`. Uma folha por mês. Não existe caminho para uma segunda folha de dezembro.

O único jeito de pagar 13º hoje é digitar como `gratificacao` num item de folha, que entra na base de INSS/IRRF junto com o salário do mês quando o 13º é tributação exclusiva, ou lançar na mão no Financeiro, que sai do RH inteiro.

Dezembro de 2026 está a três meses e a empresa tem 29 CLT ativos.

## Decisões fechadas com o Tiago (11/09/2026)

| # | Decisão | Consequência |
|---|---|---|
| 1 | **Desconto de INSS/IRRF é opcional, por lote.** A 1ª parcela sai sem desconto, a 2ª com. | Chave booleana no documento, desligada por padrão. Não é decisão global. |
| 2 | **13º em lote, férias uma a uma.** | Duas formas diferentes na mesma aba: 13º espelha `folhas`, férias espelha `rh_rescisoes`. |
| 3 | **CLT sem `data_admissao` fica de fora do lote**, com a lista de quem e o motivo na tela. | Nunca pagar R$ 0,00 calado nem 12 avos presumidos. |
| 4 | **O percentual é escolhido ao gerar.** O formulário sugere 50% na 1ª parcela e 100% na 2ª. A 2ª abate o que a 1ª pagou àquela pessoa. | Campo no formulário, não constante no código. A sugestão muda com a parcela escolhida: 50% na 2ª faria o líquido dar zero, e isso não pode passar por descuido. |
| 5 | **Férias é um registro só**, com recibo opcional em cima. | `rh_ferias` ganha o recibo; gozo sem pagamento continua válido. |
| 6 | **Abatimento da provisão fica fora de escopo**, com aviso antes de aprovar. | Ver "O que o 8b pediu e este bloco não faz". |

## Estado do banco que o design assume

Medido em 11/09/2026, projeto `vsesgvqjgqpapoxhnbqx`:

- `rh_ferias`: **0 linhas**. Reaproveitar a tabela não migra dado nenhum.
- `folha_inss_faixas` e `folha_irrf_faixas`: **0 linhas**. Nenhum holerite real validado (pendência aberta desde o Bloco 7).
- `folha_provisoes` e `folha_encargos`: **0 linhas**.
- `colaboradores` ativos: 29 CLT (11 com `data_admissao`), 27 terceiro, 4 diarista. Todos com `centro_custo_id`.
- `folhas`: uma linha, 08/2026, aprovada.

O número de 11 de 29 é o que justifica a decisão 3. Do jeito que `fn_rescisao_avos_13` funciona, os outros 18 dariam zero avos.

## Design

### 1. Modelo

**Duas tabelas novas para o 13º**, espelhando `folhas` / `folha_itens`:

```
rh_decimo_terceiro
  id, ano smallint, parcela smallint (1 ou 2),
  percentual numeric(7,4),            -- o que o Tiago escolheu ao gerar
  com_desconto boolean not null default false,
  status text ('rascunho','pendente_aprovacao','aprovado','rejeitado'),
  data_vencimento date,
  valor_bruto, valor_descontos, valor_liquido numeric(14,2),
  aprovado_por, aprovado_em, motivo_rejeicao,
  excluido_em, excluido_por, motivo_exclusao,
  created_at, updated_at, created_by
  -- índice único parcial, não constraint: o lote excluído libera o par (ano, parcela)
  create unique index ... on rh_decimo_terceiro (ano, parcela) where excluido_em is null

rh_decimo_terceiro_itens
  id, decimo_terceiro_id (on delete cascade),
  colaborador_id, centro_custo_id,
  salario_base numeric(14,2), avos smallint,
  valor_bruto, valor_ja_pago, valor_inss, valor_irrf, valor_liquido numeric(14,2),
  editado_manualmente boolean not null default false,
  lancamento_id uuid references lancamentos(id),
  created_at
  unique (decimo_terceiro_id, colaborador_id)
```

`valor_ja_pago` guarda, na 2ª parcela, o que a 1ª pagou àquela pessoa. Fica gravado na linha em vez de ser recalculado na leitura, porque o lote da 1ª pode ser excluído depois e o número da 2ª não pode mudar retroativamente.

**Férias: colunas novas em `rh_ferias`** (que hoje só tem período, datas, dias, status, observação) mais uma tabela filha:

```
rh_ferias  (colunas acrescentadas)
  status_recibo text not null default 'sem_recibo'
    ('sem_recibo','rascunho','pendente_aprovacao','aprovado','rejeitado'),
  com_desconto boolean not null default false,
  salario_base, valor_bruto, valor_descontos, valor_liquido numeric(14,2),
  data_vencimento date, centro_custo_id uuid, lancamento_id uuid,
  aprovado_por, aprovado_em, motivo_rejeicao

rh_ferias_itens
  id, ferias_id (on delete cascade),
  codigo text, descricao text, natureza text ('provento','desconto'),
  referencia text, valor numeric(14,2),
  editado_manualmente boolean, ordem smallint, created_at
```

`rh_ferias_itens` é cópia estrutural de `rh_rescisao_itens`, de propósito: a tela de itens, o cálculo de totais e o PDF podem compartilhar formato.

As duas famílias novas levam trigger `fn_audit()` e RLS de leitura para `authenticated`, como a rescisão.

**Exclusão lógica é própria, não passa pelo dispatcher.** `fn_recurso_do_cadastro` tem 15 casos e nenhum é de rescisão: ela tem `fn_excluir_rescisao` própria. O 13º segue igual, com `fn_excluir_decimo_terceiro`. Férias não precisa: um recibo rejeitado volta para `sem_recibo` e a linha de férias continua existindo.

### 2. O cálculo (DINHEIRO)

**13º, por colaborador:**

```
avos          = fn_rescisao_avos_13(data_admissao, 31/12/<ano>)    -- já existe, já em produção
valor_bruto   = round(salario / 12, 2) * avos * percentual
valor_ja_pago = soma do valor_BRUTO daquela pessoa no lote da 1ª parcela do mesmo ano (0 na 1ª)
base          = valor_bruto - valor_ja_pago
inss, irrf    = 0 se com_desconto = false, senão calculados sobre o 13º INTEIRO do ano
valor_liquido = base - inss - irrf
```

O abatimento usa o **bruto** da 1ª parcela, não o líquido. Com a 1ª sem desconto os dois números são iguais e a escolha parece não importar, mas se alguém ligar a chave na 1ª eles divergem, e aí só o bruto fecha: o imposto é do 13º inteiro e é cobrado uma vez só, na parcela que tem a chave ligada. Abater líquido cobraria imposto sobre imposto.

A divisão acontece **antes** da multiplicação e o `round` envolve a divisão, não o produto. Isso não é estilo: `salario * avos / 12` e `round(salario/12,2) * avos` divergem em centavos, e a divergência aparece na conferência do lote inteiro.

Na 2ª parcela o `percentual` é tipicamente 100%, então `valor_bruto` é o 13º cheio e `valor_ja_pago` tira o que já saiu. Quem foi admitido entre as duas parcelas tem `valor_ja_pago = 0` e recebe tudo na 2ª, que é o comportamento certo sem nenhum caso especial.

**Férias, por período:**

```
valor_dias  = round(salario / 30, 2) * dias
terco       = round(valor_dias / 3, 2)
valor_bruto = valor_dias + terco
```

O terço é calculado **aqui**, e isso é deliberado. A regra do Tiago de 14/08/2026 diz que o percentual de `folha_provisoes` já embute o terço e que nunca se soma terço sobre valor vindo da provisão. Este valor não vem da provisão, vem do salário. São duas contas independentes e o código não pode confundi-las. O comentário fica na função.

Itens gerados: `Férias N dias`, `1/3 constitucional`, e `INSS` / `IRRF` quando a chave estiver ligada.

**INSS e IRRF**, nos dois casos, reusam `fn_folha_inss` e `fn_folha_irrf`, que já existem. A base do 13º é **exclusiva**: calcula sobre o 13º inteiro do ano, não sobre o salário do mês somado ao 13º. A base das férias é o bruto das férias. Nenhuma alíquota nova é escrita neste bloco.

### 3. As três travas

1. **Faixa vazia com desconto ligado recusa.** `com_desconto = true` e `count(folha_inss_faixas) = 0` faz o gerar levantar exceção nomeando a tabela vazia. Sem isso o cálculo devolve zero e o lote fecha "certo" com imposto nenhum.
2. **Sem `data_admissao` fica de fora.** O gerar não cria item para quem não tem, e devolve a lista dos excluídos. A tela mostra o bloco "N colaboradores fora do lote" com nome, motivo e link para o cadastro.
3. **Competência fechada barra.** `fn_exigir_competencia_aberta(p_mes, p_entidade, p_id)` antes de qualquer escrita de aprovação, com `p_entidade` = `'decimo_terceiro'` ou `'ferias'`.

### 4. O dinheiro no financeiro

`lancamentos_origem_check` hoje aceita sete valores (`oc`, `manual`, `diaria`, `folha`, `folha_guia`, `adiantamento`, `rescisao`). Precisa aceitar mais dois: **`decimo_terceiro`** e **`ferias`**. A migration faz `drop constraint` + `add constraint` com a lista nova, sem `not valid`, porque a tabela já satisfaz a lista maior por construção.

**Aprovar o lote de 13º**, numa transação:

- Uma conta a pagar **por item**, `origem = 'decimo_terceiro'`, `origem_id` = o item, `centro_custo_id` = o do colaborador, descrição `13º <nome> <N>ª parcela <ano>`. Um lançamento por pessoa, não um pelo total, porque `fn_aprovar_folha` faz assim e o custo tem que cair na obra de cada um.
- Uma **guia por grupo de recolhimento** quando `com_desconto` for true, usando `folha_parametros.grupo_recolhimento_inss` e `.grupo_recolhimento_irrf`, no molde de `folha_guias`. Grupo não configurado significa retido que não vira conta a pagar: a tela avisa antes, como a folha já faz.
- Item com `valor_liquido <= 0` não gera lançamento.
- `lancamento_parcelas` com uma parcela, nascendo `aprovado` se quem aprova tiver `financeiro.aprovacao-pagamentos:aprovar`, senão `pendente`, e `lancamento_rateios` com o centro de custo.

**Aprovar recibo de férias**: um lançamento só, `origem = 'ferias'`, `origem_id` = a linha de `rh_ferias`.

**Desaprovar** existe nos dois, e solta `lancamento_id` **antes** do delete dos lançamentos. As FKs são simples, sem `on delete set null`: inverter a ordem estoura no meio da desaprovação, e isso já aconteceu na folha.

**`maxDuration` na rota.** A action de aprovar roda na função da página e o lote escreve 29 lançamentos, 29 parcelas, rateios e guias. A rota leva `maxDuration` com teste que guarda a presença, senão em dezembro o clique toma timeout com o lote meio gravado.

### 5. Telas

`/rh/ferias` vira **`/rh/decimo-terceiro-e-ferias`**, rótulo "13º e Férias". A rota antiga responde com `redirect` permanente.

Uma página, duas seções empilhadas:

**Férias** em cima. A tabela que já existe (colaborador, período aquisitivo, gozo, dias, situação) ganha a coluna **Recibo**: "não pago", "rascunho", "pendente", ou o valor líquido quando aprovado. Ação de linha **Gerar recibo**, que abre o drawer com os itens calculados e editáveis.

**13º** embaixo. Lista dos lotes, um por ano e parcela, com ano, parcela, percentual, quantidade de pessoas, valor líquido e status. Ação de cabeçalho **Gerar 13º** (ação de página fica no cabeçalho, não solta no corpo). O drawer pede ano, parcela, percentual e a chave de desconto.

O detalhe do lote é página própria, `/rh/decimo-terceiro-e-ferias/13o/[id]`, com a tabela de itens, o bloco de excluídos, e as ações de enviar para aprovação, aprovar, rejeitar, desaprovar.

Barra de ação com `flex-wrap`, sem `sm:flex-nowrap`: a faixa de 640 a 816px abre buraco.

### 6. Permissões

O recurso `rh.ferias` (rota `/rh/ferias`, ações CRUD) vira **`rh.decimo-terceiro-ferias`** com rota nova e ações `CRUD` mais `aprovar`. A migration renomeia em `recursos`, `perfil_permissoes` e **`usuario_permissoes`**, nas três, porque `getUsuarioLogado` lê a permissão efetiva do usuário, não a do perfil. Perfil que tinha férias continua tendo.

Checagem explícita que o Bloco 8b nos ensinou: garantir que o **Admin tenha todas as ações do recurso novo**, inclusive `excluir` e `aprovar`. Em `rh.encargos` o catálogo declara `excluir` e nenhum perfil tem, nem o Admin, e o conserto ficou inalcançável pela tela. Molde do conserto: `20260727140001`.

## Ordem de implementação

São dois blocos que dividem uma aba, e o plano não deve tratá-los como uma coisa só. A ordem que reduz risco:

1. **Infra comum**: as duas origens novas no `lancamentos_origem_check`, a renomeação do recurso e a rota nova com o redirect. Vai ao ar sem mudar comportamento nenhum.
2. **13º (8c)**, que é o que tem prazo. Tabelas, cálculo, travas, aprovação, telas.
3. **Férias (8d)**, que reusa o cálculo de imposto e o caminho do lançamento já provados pelo 13º.

Dezembro manda na ordem: se algo tiver que escorregar, escorrega o 8d, não o 8c.

## Testes

**A conta de dinheiro vive na função SQL, e é lá que ela se prova.** Avos, percentual, abatimento e imposto ficam dentro de `fn_gerar_decimo_terceiro`. Escrever a mesma fórmula em TypeScript para poder testá-la criaria uma segunda fonte de verdade, e um teste verde em cima da cópia não diz nada sobre a RPC que realmente paga. O `calculo.ts` da folha é precedente: ele só agrega para a tela, não calcula dinheiro.

**Prova em `supabase/provas/decimo_terceiro.sql`**, no molde de `rescisao.sql`: os números são calculados **à mão no cabeçalho do arquivo**, antes de qualquer `select`, e o teste confere a RPC contra eles. Colaborador de mentira com admissão conhecida, gera o lote, aprova, confere que a soma dos lançamentos bate com o líquido, e termina em `raise exception` para desfazer tudo. Sem sujar a base e sem queimar numeração.

A prova tem que demonstrar que a RPC **executou**, não só que não levantou erro. Isto já se pagou aqui: `plpgsql` só valida as queries do corpo na primeira execução, e a prova da rescisão estourou com `folha_parametros` vazia depois de a migration ter voltado `success` com o advisor limpo.

**TypeScript (vitest) cobre o que é de TypeScript:** os schemas de validação, a agregação para a tela (soma dos itens, lista dos excluídos, aviso de provisão) e o formato. Valor em real asserido pelo formatador, nunca por string literal, porque o separador do `pt-BR` não é espaço comum. Cada teste tem que cair quando o código é quebrado de propósito: teste que sobrevive à mutação não está provando nada.

**Uma prova por trava:** desconto ligado com faixa vazia recusa; colaborador sem admissão não vira item e aparece na lista de excluídos; competência fechada barra a aprovação.

**Linha de controle obrigatória:** um caso que deve falhar e falha. Sem isso não dá para saber se a prova está olhando para alguma coisa.

**RLS**: provar com `set local role` trocado de verdade, não com a conexão de serviço.

Ambiente: sandbox desligado e `--environment=node`. Exit 0 sem suíte não é suíte verde.

## O que o 8b pediu e este bloco não faz

A spec de 13/08/2026 registrou como dependência: *"quando o 13º for pago de verdade, a provisão acumulada precisa ser abatida, senão o custo conta duas vezes"*. **Este bloco não faz o abatimento**, por decisão do Tiago em 11/09/2026.

Razão: `folha_provisoes` está vazia, então hoje nada é provisionado e o custo não dobra. O abatimento correto exige somar `folha_item_provisoes` por colaborador ao longo dos meses e decidir o que fazer quando o provisionado for maior ou menor que o pago, o que é um bloco por si.

**O que entra no lugar:** o gerar do lote consulta `folha_provisoes` e, se houver provisão de 13º ativa, mostra aviso em vermelho no drawer e no detalhe do lote dizendo que o custo vai contar duas vezes. A dependência continua aberta e registrada aqui.

## Fora de escopo

- Abono pecuniário (venda de 10 dias de férias).
- Adiantamento de 13º dentro do recibo de férias.
- Abatimento ou baixa da provisão (acima).
- eSocial (Bloco 10).
- 13º e férias para terceiro e diarista. 13º é da CLT, e retenção de terceiro é regra fiscal que o Tiago ainda não declarou.
- Holerite/PDF do 13º e recibo de férias impresso. O espelho reusa o molde canônico, mas entra depois do dinheiro estar certo.

## Riscos

1. **As faixas de INSS e IRRF nunca foram validadas contra caso real.** A trava impede o cálculo silencioso de zero, mas não valida a tabela que o Tiago cadastrar. O primeiro lote com desconto tem que ser conferido linha a linha contra um holerite que ele reconheça, antes de aprovar.
2. **`lancamentos_origem_check` é alterado em tabela viva.** A janela entre `drop` e `add` é dentro da transação da migration, então não há risco de linha órfã, mas a ordem importa: a constraint nova tem que existir antes de qualquer RPC nova ir ao ar.
3. **A renomeação do recurso mexe em permissão de produção.** Estreitar privilégio derruba tela. A migration renomeia nas três tabelas na mesma transação e a prova confere que nenhum usuário perdeu acesso, comparando a contagem antes e depois.
4. **18 dos 29 CLT não têm data de admissão.** O sistema vai barrar, que é o certo, mas isso é trabalho de cadastro do Tiago antes de dezembro. Quanto mais cedo ele souber, melhor.
5. **O banco vivo se move.** Outra frente pode aplicar migration entre o plano e a execução. Reler a definição viva das funções tocadas imediatamente antes de alterar, nunca partir do arquivo do repo, que diverge do banco em 155 versões.
