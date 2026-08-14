# Relatórios interativos do Financeiro

Data: 2026-08-14 · Dono: Tiago · Escopo aprovado: os 6 relatórios de uma vez

## Problema

Os relatórios do Financeiro são becos sem saída. A tela de Custo por centro de custo
diz que o 009 - BR-364 custou R$ 3.235.673,04 em julho de 2026 e não há nada a fazer
com esse número: para saber *de que* ele é feito, a pessoa abre Lançamentos em outra
aba e remonta o filtro na mão. Os seis relatórios têm o mesmo defeito.

Pedido do dono: clicar em qualquer dimensão abre, **em aba nova**, os custos
discriminados **com o mesmo filtro que o relatório está mostrando**; e o relatório de
centro de custo ganha os filtros que faltam para análise de verdade.

## A decisão que governa tudo: o total do drill-down fecha com a célula clicada

Aprovada pelo dono. É o que torna o recurso confiável em vez de decorativo: se a
lista que abre soma diferente da célula que foi clicada, quem confere conclui que um
dos dois está errado e para de usar os dois.

Cumprir isso é mais difícil do que parece, porque **cada relatório soma um grão
diferente**:

| relatório | grão que soma | medida |
|---|---|---|
| DRE gerencial | lançamento, por categoria | `lancamentos.valor` |
| Custo por grupo de insumo | **misto**: item de OC, ou rateio | `oc_itens.qtd * preco`, ou `lancamento_rateios.valor` |
| Custo por centro de custo | **rateio** | `lancamento_rateios.valor` |
| Fluxo de caixa | **parcela**, por mês de venc/pagto | `parcela.valor` |
| Aging | **parcela aberta**, por faixa | `parcela.valor` |
| Posição bancária | **parcela paga**, por conta | `parcela.valor_liquido` |

A listagem de Lançamentos soma `lancamentos.valor` nos cartões
(`resumirLancamentos`). Logo, ela fecha hoje com o DRE, e **não fecha** com os outros.
Nos 121 lançamentos rateados entre obras ela mostraria o valor cheio onde o relatório
de centro de custo contou só a parte daquele centro.

O grupo de insumo é caso de borda: sem filtro de centro, a soma de TODOS os rateios de
um lançamento é igual ao `valor` dele (a RPC de gravação valida isso), então o total
fecha por identidade. Fecha por sorte estrutural, não por desenho — e para de fechar
no dia em que existir uma OC, porque aí a linha do grupo passa a somar item de OC.

### Medição que prova por que não dá para confiar na base de hoje

Medido em 14/08/2026 no projeto `vsesgvqjgqpapoxhnbqx`:

- 5.848 lançamentos, **0 cancelados** e **0 previstos**
- 7.701 parcelas, **0 sem data de vencimento**, **0 pagas sem `valor_liquido`**
- 5.979 rateios, dos quais **121 lançamentos têm mais de um centro**
- **0 ordens de compra e 0 itens de OC**; todos os 5.848 lançamentos são
  `origem='manual'`
- 12 centros de custo, **todos nível 1, nenhum com pai, nenhum com orçamento**
- 57 categorias financeiras, **nenhuma com pai**

Consequência: hoje o drill-down fecharia **por coincidência** mesmo sem excluir
cancelado e sem tratar `valor_liquido` nulo. Um teste escrito em cima do dado atual
passa e esconde exatamente o defeito que ele deveria pegar. Toda prova deste bloco
constrói o caso parcial (um cancelado, um previsto, um rateado, uma parcela sem
vencimento) numa transação revertida — não confere só o retrato de hoje.

## Arquitetura

### 1. `relatorios/drill.ts` — o contrato do clique (módulo puro)

Uma função por relatório: recebe o estado de filtro do relatório e a célula clicada,
devolve a URL de destino. Nada de React, nada de banco.

Mora num módulo próprio, e não dentro de cada componente de tabela, pelo mesmo motivo
que `lancamentos/filtros.ts` existe para a exportação: **duas montagens da mesma URL
divergem no primeiro filtro que alguém acrescenta de um lado só**, e o sintoma é o
pior possível — a lista abre sem erro mostrando um conjunto diferente do que a célula
somou.

Regra de ouro do módulo: **o drill carrega a chave da dimensão do próprio relatório,
nunca uma reconstrução aproximada dela.** Aging classifica faixa por dias de atraso
dentro de `fn_rel_aging`; remontar isso como janela de datas no destino
(`hoje-15 .. hoje-8`) daria certo hoje e erraria na borda, além de descartar parcela
sem vencimento — que o aging conta como "a vencer" e um filtro de data exclui. Então
o destino recebe `faixa_aging=v_8_15` e reusa a MESMA classificação.

### 2. Três parâmetros novos na URL de Lançamentos

É o custo de "o total fecha", e cada um existe por um relatório específico:

| parâmetro | por causa de | por que não dá sem ele |
|---|---|---|
| `sem_cancelado=1` | Custo por centro, Custo por grupo | os dois somam `status <> 'cancelado'`; a listagem só sabe filtrar *um* status, não excluir um |
| `parcela_status=pago` | Posição bancária | ela soma parcela paga pelo líquido; sem isso o clique numa conta nunca fecha |
| `faixa_aging=<faixa>` | Aging | ver a regra de ouro acima: reconstruir a faixa por datas erra na borda e perde parcela sem vencimento |

Todos entram em `lerFiltrosLancamentos` com validação contra lista fechada, aparecem
como chip na FilterBar e são lidos **uma vez só** — a exportação para Excel os herda
de graça, porque ela já lê os mesmos filtros que a lista.

### 3. O recorte: `valorRecorte` na listagem

`LancamentoLista` ganha `valorRecorte: number | null`. `null` significa "sem recorte"
e o total continua sendo o `valor` de sempre. `resumirLancamentos` passa a somar
`valorRecorte ?? valor`; a tabela mostra a coluna "Valor no recorte" só quando há
recorte, com o rótulo dizendo qual é (ex: "No centro 009 - BR-364").

Duas origens, com **precedência declarada**:

1. `centro` ativo → soma dos rateios daquele lançamento naquele centro
2. senão, filtro de parcela ativo (`venc_de/ate`, `conta`, `atraso`, `parcela_status`,
   `faixa_aging`) → soma das parcelas que casam, por `valor`, ou por
   `coalesce(valor_liquido, valor)` quando o recorte é de pagas

**Centro e parcela ativos ao mesmo tempo não geram o produto dos dois.** Ratear o
valor da parcela pela proporção do centro seria uma conta que ninguém pediu e que
nenhum relatório precisa; inventá-la é pior que não tê-la. A precedência é o centro,
declarada em comentário e travada por teste. Nenhum dos seis relatórios produz esse
par — o relatório de centro de custo não tem dimensão de parcela.

O rateio do centro exige uma consulta a mais por página (25 linhas), no mesmo molde do
que `detalharLancamentosParaPlanilha` já faz. As parcelas já vêm no `select` da
listagem (o `dinheiroDasParcelas` depende delas), então o recorte por parcela não
custa consulta nenhuma.

### 4. Filtros do relatório de centro de custo

Contrato próprio em `relatorios/filtros-custo-cc.ts`, puro, espelhando o de
lançamentos (o mesmo padrão de validar contra lista fechada e devolver só o que
passou, para filtro inválido na URL não aparecer preenchido na barra).

**Modo de período** (`modo`):

- `mes` — um mês de referência. É o comportamento de hoje e continua o padrão.
- `periodo` — `de`/`ate` livres em mês. Responde "custo acumulado da obra no ano".
- `total` — tudo que existe na base, sem limite de período.
- `vida` — **um centro por vez** (escolha do dono): escolhido o centro, o período vira
  automaticamente do primeiro lançamento *daquele* centro até hoje. O KPI diz "desde
  MM/AAAA" e entra um gráfico mês a mês só dele. Sem centro escolhido, o modo avisa
  que precisa de um em vez de cair silenciosamente em outro período.

**Demais filtros:** categoria financeira, fornecedor, incluir Previsto, tipo de centro
(obra / escritório / manutenção, que já existe em `centros_custo.tipo`), e comparação
com o período anterior (colunas de variação em R$ e %).

**Grupo de insumo saiu dos filtros, e o motivo é dado, não gosto.** O desenho
aprovado incluía filtrar por Material / Mão de obra / Equipamentos / Outros. Medido:
os grupos vêm de `oc_itens → insumos → categorias_insumo → insumo_grupos`, então
existem **só para lançamento de origem OC** — e há **0 ordens de compra** no banco.
O dropdown abriria vazio. Categoria financeira faz o mesmo trabalho com dado que
existe: 57 cadastradas, 49 em uso. Quando Compras começar a emitir OC, o filtro de
grupo entra num bloco seguinte.

**Comparação com o período anterior vale só nos modos `mes` e `periodo`.** Em `total`
não existe período anterior a "tudo", e em `vida` o anterior ao primeiro lançamento do
centro é vazio por definição. Nos dois modos o controle aparece desabilitado com o
motivo, em vez de mostrar uma variação de 100% contra zero — que leria como a obra
tendo dobrado de custo.

Dropdown é o Combobox canônico com busca, nunca o Select do shadcn.

Todos esses filtros viajam no drill-down. Clicar no 009 com o relatório filtrado em
"categoria Manutenção de equipamentos, fornecedor FOX PNEUS, julho de 2026" abre a
lista com essa categoria, esse fornecedor e esse mês — e o total dela fecha com a
célula que foi clicada, não com o total do centro no mês inteiro.

### 5. O que fica clicável nos seis

| relatório | clique em | destino |
|---|---|---|
| Custo por centro de custo | linha da tabela e barra do gráfico | `centro` + período + `tipo=a_pagar` + `sem_cancelado=1` |
| Custo por grupo de insumo | linha do grupo | período + `tipo=a_pagar` + `sem_cancelado=1` (ver ressalva abaixo) |
| DRE gerencial | linha de categoria | `categoria` + `mes` + `tipo` conforme receita ou despesa |
| Fluxo de caixa | barra do mês, entrada ou saída | `venc_de`/`venc_ate` do mês + `tipo` |
| Aging | faixa de vencimento | `faixa_aging` + `tipo` |
| Posição bancária | conta | `conta` + `parcela_status=pago` |

**Ressalva do Custo por grupo de insumo.** Ele é o único de grão MISTO: para
lançamento de origem OC soma `oc_itens.quantidade * preco_unitario`, e para todo o
resto soma `lancamento_rateios.valor`. Como há **0 OCs** hoje, ele é uma linha só
("Sem insumo (lançamento avulso)", `grupo_id` nulo) que vale o total do período — e o
drill dela é o período inteiro, que fecha. Quando existir OC, a linha de um grupo real
passa a somar item de OC, e aí o destino honesto é a lista de ITENS daquela OC, não a
de lançamentos. Este bloco **não** resolve esse caso: a função de drill do grupo
recusa `grupo_id` não nulo com erro explícito, para o dia em que a primeira OC entrar
não virar um total que não fecha e ninguém percebe. `fn_rel_custo_por_grupo` já aceita
`p_centro_custo` e `p_categoria` (hoje sem uso pela tela), então o filtro do relatório
viaja sem função nova.

Todos abrem em aba nova (`target="_blank"`), com o relatório continuando aberto atrás
para comparar vários centros sem perder o lugar. Link de verdade (`<a href>`), não
`onClick` com `router.push`: assim o meio-clique, o "abrir em nova aba" do sistema e o
copiar-link funcionam, e a URL é compartilhável com o financeiro.

### 6. Banco

- `fn_rel_custo_centro_custo` ganha os filtros novos (categoria, grupo, fornecedor,
  incluir previsto, tipo de centro) além do período que já tem.
- `fn_rel_custo_centro_vida(p_centro)` — primeiro mês de competência daquele centro.
- `fn_rel_custo_centro_serie(p_centro, p_inicio, p_fim)` — uma linha por mês de
  competência com o total do centro, para o gráfico do modo `vida`. Devolve mês sem
  custo como zero em vez de omitir a linha: série com buraco desenha uma reta ligando
  dois meses distantes e some com a informação de que a obra parou.

Todas `stable`, `set search_path to ''` e **sem `security definer`**, como as
`fn_rel_*` de hoje: rodam como o chamador, então a RLS do usuário continua valendo.
Grants explícitos para `authenticated` só do `execute` necessário, `anon` não recebe
nada. Advisors de security e performance rodados depois.

## Testes

| arquivo | o que trava |
|---|---|
| `relatorios/drill.test.ts` | os 6 destinos, e principalmente que os filtros IMPLÍCITOS viajam (`tipo`, `sem_cancelado`) e que os filtros do relatório viajam junto |
| `lancamentos/resumo.test.ts` (acréscimo) | recorte por centro fecha com a soma dos rateios; recorte por parcela por `valor` e por líquido; precedência quando centro e parcela estão ativos; `valorRecorte` nulo mantém o total antigo |
| `lancamentos/filtros.test.ts` (acréscimo) | os 3 parâmetros novos validados contra lista fechada, e lixo na URL não vira filtro |
| `relatorios/filtros-custo-cc.test.ts` | os 4 modos, período invertido trocado de lado, `vida` sem centro |
| `supabase/provas/drill_fecha_com_a_celula.sql` | para os 6: total do drill = célula do relatório, **no caso parcial construído** (um cancelado, um previsto, um rateado 60/40, uma parcela sem vencimento), em transação revertida |

A prova SQL é a que importa. As outras podem passar com a conta errada se eu escrever
o teste com a mesma cabeça com que escrevi o código; a prova compara dois caminhos
independentes contra o banco e entrega uma coluna que tem que dar zero.

## Fora de escopo, e por quê

**Orçado vs realizado.** É a análise mais forte que existe para centro de custo e
**não dá para fazer hoje**: `centros_custo.orcamento` existe e está vazia nos 12
centros. Precisa do orçamento preenchido antes.

**Drill hierárquico Obra > Etapa > Item.** `pai_id` e `nivel` existem em
`centros_custo`, mas os 12 centros são **todos nível 1 e nenhum tem pai**. Um drill
hierárquico hoje abriria sempre vazio. Precisa das etapas cadastradas antes.

**Filtro e drill por grupo de insumo.** 0 ordens de compra, então 0 itens de OC e
nenhum grupo materializado. Detalhado na seção de filtros.

**Subcategoria e insumo dentro do grupo.** `fn_rel_custo_por_subcategoria` desce do
grupo para a categoria do insumo; sem OC, não há o que descer. E as 57 categorias
financeiras também são todas raiz (nenhuma com pai), então não há nível intermediário
nem por esse caminho.

As quatro viram blocos seguintes quando o dado existir. Nenhuma é bloqueio para este
bloco. As três primeiras têm a mesma causa e o mesmo desfecho: **o ERP tem o esquema
pronto para uma análise que a operação ainda não alimentou.** Vale dizer ao dono uma
vez, com número, em vez de entregar filtro vazio seis vezes.

## Riscos

1. **Mexer em `resumo.ts` é mexer em código de dinheiro maduro.** Mitigação: campo
   novo com `null` como padrão, então todo caminho que não passa recorte continua
   somando exatamente o que somava; e o teste antigo continua valendo sem alteração.
2. **Seis relatórios de uma vez é muita superfície para validar.** O dono escolheu
   assim, ciente. Mitigação: a prova SQL cobre os seis com o mesmo critério, então a
   falha aparece antes da tela dele, não depois.
3. **Regime trocado.** Fluxo, aging e posição bancária são regime de CAIXA; DRE e os
   dois de custo são COMPETÊNCIA. Mandar `mes` (competência) num drill de caixa, ou
   `venc_*` num drill de competência, dá lista errada sem erro nenhum. Mitigação: o
   tipo de cada função em `drill.ts` só aceita o recorte do regime daquele relatório,
   então a troca não compila.
