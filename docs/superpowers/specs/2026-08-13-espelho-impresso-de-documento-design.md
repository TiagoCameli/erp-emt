# Espelho impresso de documento, e seleção de linha na listagem

Data: 2026-08-13
Recursos afetados: `compras.ordens`, `financeiro.lancamentos`, `financeiro.pagamentos`
Módulos: `src/app/(espelho)`, `src/components/canonicos/espelho-impresso.tsx`, `src/components/canonicos/barra-selecao.tsx`, `src/modules/compras/ordens`, `src/modules/financeiro/lancamentos`, `src/modules/financeiro/pagamentos`

## Problema

Não existe como levar um documento do ERP para o papel. Quando o Tiago precisa anexar uma OC em processo, mandar um lançamento para o contador ou arquivar o comprovante de um pagamento, a única saída hoje é print de tela: sai a sidebar, sai o filtro, sai cortado, e não sai o que importa (os itens, as parcelas, o rateio, quem aprovou).

O pedido veio em duas partes: um jeito de **selecionar a linha** na listagem, e um botão de **imprimir o espelho** do registro selecionado, com todas as informações dele. O mesmo botão tem que existir dentro do detalhe, quando a linha está aberta.

## Objetivo

Imprimir, de qualquer listagem de documento ou do detalhe dele, um papel que sirva como comprovante: cabeçalho, linhas filhas, rateio por centro de custo, trilha de aprovação e lista de anexos. Marcando várias linhas, sai um espelho por linha, uma página cada.

## O que já existe e vai ser reusado inteiro

Levantamento feito antes do desenho, e o que ele mudou:

1. **A seleção de linha já existe.** `DataTable` tem a prop `selecao` (`SelecaoDataTable<TData>`): coluna de checkbox prependada, opt-in, ciente de página, com "selecionar todos desta página" e `habilitada?()` para desabilitar linha. Hoje só `financeiro/lancamentos/components/lancamentos-tabela.tsx` usa. **Não se escreve seleção nova**; liga-se a que existe.

2. **A impressão já tem padrão no app.** `holerite-dialog.tsx` imprime via `window.print()`, com a região `.holerite-print` isolada no `globals.css` e `.nao-imprime` escondendo os controles. Nada de biblioteca de PDF: `pdfmake` está citado no plano mestre mas **não está no `package.json`**, e não entra nesta fase.

3. **A leitura de detalhe existe por entidade.** `buscarOrdem(id)` + `trilhaOrdem(id)`, `buscarLancamento(id)` + `trilhaLancamento(id)`. Continuam servindo as telas de detalhe, intocadas.

4. **Buscar o detalhe de N ids marcados já tem precedente.** `detalharLancamentosParaPlanilha(ids)` faz exatamente isso para a exportação Excel, quebrando os ids em lotes por `emLotes(ids, LOTE_IDS_POSTGREST)`, porque `in` vira query string de um GET e mil uuids estouram a URL do PostgREST antes de o banco olhar permissão. O espelho segue esse caminho.

5. **Grupo de rota sem AppShell já existe.** `(auth)` é o precedente: o espelho não precisa nascer dentro da sidebar.

## Fatos do domínio que moldam o desenho

1. **São 43 tabelas com `DataTable` no app**, de OC e lançamento até faixa de IRRF e unidade de medida. Espelho de "faixa de INSS" não significa nada; espelho de OC significa muito.

2. **Pagamento não é tabela própria.** É `lancamento_parcelas` com status `pago`. O espelho de pagamento é o espelho de uma parcela, e por isso a rota dele recebe id de parcela, não de lançamento.

3. **`valor_liquido` passou a ser `valor - desconto + juros`** (decisão de 11/08/2026). `ParcelaPaga`, a interface que a listagem de pagamentos usa, **não expõe `juros`**. Um espelho construído sobre ela mentiria sobre o que saiu da conta.

4. **Medição e OS não existem no código.** Não há módulo para elas. Ficam fora por inexistência, não por escolha.

## Decisões

### Rota renderizada no servidor, e não dialog no cliente

Foram consideradas três formas: rota de espelho por documento; dialog no cliente igual ao holerite; e um motor genérico dirigido por descritor.

**Escolhida: rota por documento.** É Server Component lendo dados, que é a convenção do projeto; a permissão vem das mesmas queries e do RLS; N documentos em um único trabalho de impressão saem com quebra de página no CSS; e listagem e detalhe compartilham um layout só, sem chance de divergir.

O dialog foi recusado porque, com 12 marcados, um dialog com 12 documentos é ruim de usar, e porque o truque de `visibility: hidden` sobre `body *` é frágil com dialog em portal. O holerite imprime um documento por vez, e é por isso que ali funciona.

O descritor genérico foi recusado porque entorta rápido: item de OC tem quantidade, unidade e preço unitário; parcela de lançamento tem vencimento, conta e status com cor. Ou o descritor cresce até ser uma linguagem de layout, ou os dois documentos saem mal.

### Uma rota por documento, atendendo 1 e N com o mesmo código

```
src/app/(espelho)/layout.tsx                        sem shell, fundo branco, page setup
src/app/(espelho)/espelho/ordens/page.tsx           /espelho/ordens?ids=...
src/app/(espelho)/espelho/lancamentos/page.tsx      /espelho/lancamentos?ids=...
src/app/(espelho)/espelho/pagamentos/page.tsx       /espelho/pagamentos?ids=...
```

O botão do detalhe manda um id só. `N=1` é um lote de um: **um caminho, não dois**, porque dois caminhos divergem.

Prefixo `/espelho/` próprio para não disputar espaço de URL com `/compras/ordens/[id]`, que já existe.

Abre em aba nova, para não perder os filtros da listagem.

### O enfeite da página vira canônico, o conteúdo fica com o documento

`src/components/canonicos/espelho-impresso.tsx`:

- `EspelhoImpresso`: a Faixa âmbar no topo, título do documento, número em JetBrains Mono, "emitido em <data> por <usuário>" no rodapé, quebra de página entre irmãos
- `EspelhoSecao`: bloco titulado
- `EspelhoCampos`: grade rótulo/valor
- `EspelhoTabela`: tabela compacta para as linhas filhas
- `BotaoImprimir`: client component que dispara `window.print()` uma vez ao montar e deixa o botão visível para reimprimir

Componente novo se justifica pela regra 9 do CLAUDE.md: nenhum canônico existente resolve layout de impressão. Fica em `canonicos/` para os três documentos (e os futuros) compartilharem.

Como a página inteira é o documento, o truque de `visibility: hidden` do `globals.css` **não é usado aqui**. O do holerite fica como está: migrar aquela regra sem necessidade seria mexer em código que funciona por gosto.

**A Faixa só chega ao papel com `print-color-adjust: exact`.** Navegador remove cor de fundo ao imprimir por padrão, e `globals.css` hoje não declara isso em lugar nenhum: sem a regra, a assinatura do design sai branca e os status perdem a cor. O layout do `(espelho)` declara `print-color-adjust: exact`.

Mesmo assim, o usuário pode desligar "gráficos de fundo" no diálogo do sistema, e isso está fora do nosso alcance. Por isso o espelho **nunca depende de cor para informar**: status sai como texto ao lado da cor, exatamente como o `StatusBadge` já faz na tela. Em preto e branco o papel continua completo.

### O que cada espelho mostra

"Todas as informações" precisa de definição por documento, porque parcela não tem filho:

| Documento | Cabeçalho | Linhas | Rateio | Trilha | Anexos |
|---|---|---|---|---|---|
| OC | número, fornecedor, categoria, condição e forma, datas, competência, status, valor total, observações, cotação de origem, lançamento gerado | itens (insumo, quantidade, unidade, preço unitário, total) e parcelas previstas | por centro de custo | eventos da OC | nomes e tamanhos |
| Lançamento | número, fornecedor, categoria, descrição, forma, datas, competência, status, valor, observações, OC de origem | parcelas (número, vencimento, valor, desconto, juros, líquido, conta, status, data de pagamento) | por centro de custo | eventos do lançamento | nomes e tamanhos |
| Pagamento | a parcela (número, vencimento, valor, desconto, juros, líquido, conta, data de pagamento) **mais o cabeçalho do lançamento pai**, porque parcela sozinha não identifica a despesa | nenhuma: parcela é folha | o do lançamento pai | eventos da parcela | os da parcela |

O espelho de pagamento carrega o pai de propósito. Um papel dizendo apenas "parcela 2, R$ 1.943,95, paga em 26/06" não serve como comprovante de nada.

### Leitura própria por entidade, em lote

```
src/modules/compras/ordens/espelho.ts          buscarOrdensParaEspelho(ids)
src/modules/financeiro/lancamentos/espelho.ts  buscarLancamentosParaEspelho(ids)
src/modules/financeiro/pagamentos/espelho.ts   buscarPagamentosParaEspelho(ids)
```

Cada uma devolve cabeçalho + filhos + rateio + trilha + lista de anexos em uma passada, com os ids quebrados em lotes por `emLotes(ids, LOTE_IDS_POSTGREST)`.

Leitura própria, e não reuso de `buscarOrdem`, pelo mesmo motivo que `detalharLancamentosParaPlanilha` existe: o espelho precisa exatamente dos campos que imprime, e imprime mais do que a tela de detalhe mostra em alguns casos (todo o rateio, por exemplo). Reusar `buscarOrdem` em laço daria 2N idas ao banco.

### Sem ação `imprimir` nova

`ACOES` hoje é `ver, criar, editar, excluir, aprovar, desaprovar`. **Não se acrescenta `imprimir`.**

O espelho não mostra nada que o usuário não leia na tela de detalhe, então permissão separada seria teatro: basta um print de tela. E somar `imprimir` ao `ACOES` abre coluna nova na matriz de permissão de **todos** os recursos e obriga a reconceder todos os perfis. Raio de alcance grande, controle real nenhum.

O espelho exige `ver` no recurso. A regra tripla fica:

- **Banco:** o RLS já existe nas três tabelas e a query roda como o usuário. Linha invisível não volta. Nada a fazer.
- **Server:** a página checa `ver` no recurso antes de consultar.
- **UI:** o botão só aparece em tela que o usuário já pode ver.

Id que o usuário não pode ver **sai calado da impressão e a página diz quantos saíram**. Nunca derruba a impressão inteira por causa de uma linha invisível, e nunca imprime linha que ele não pode ver.

### `juros` entra em `ParcelaPaga`

Remendo pequeno, dentro do escopo porque sem ele o espelho de pagamento mente: `ParcelaPaga` ganha `juros`, e a query que a preenche passa a selecionar a coluna.

### Um refactor, declarado

A barra de "N selecionados" existe hoje embutida em `lote-conta-bancaria.tsx` (157 linhas, com o select de conta e a confirmação dentro). Para não virar três cópias em ordens, lançamentos e pagamentos, extrai-se um canônico fino:

`src/components/canonicos/barra-selecao.tsx`: mostra "N selecionados", um slot de ações e o "limpar seleção".

`LoteContaBancaria` passa a morar dentro dele. É extração presencial, risco baixo, mas mexe em código que funciona, e por isso está declarada aqui em vez de acontecer de lado.

## Onde ficam os botões

**Na listagem:** dentro da `BarraSelecao`, que aparece quando há seleção. Rótulo "Imprimir espelho (3)", ícone `Printer`. Com zero marcado, a barra não existe, então o botão não existe.

**No detalhe:** no cabeçalho, ao lado de Editar e Aprovar, apontando para `/espelho/<doc>?ids=<id>` em aba nova.

## Estados de erro e de vazio

| Situação | Comportamento |
|---|---|
| Sem `ids` | "Nada para imprimir", e não dispara impressão |
| Todos os ids invisíveis pelo RLS | Mesma tela, dizendo que nada visível foi encontrado |
| Mais de 50 marcados | O botão da barra já avisa e não navega; a página guarda o mesmo limite para link colado à mão |
| Id malformado | Zod recusa e a página diz que o link está inválido |
| Sem permissão `ver` no recurso | Página de sem permissão, não `notFound` disfarçado |

O corte em 50 recusa em vez de imprimir 50 e calar sobre o resto: truncar em silêncio faz o papel parecer completo quando não é. O número é um botão de ajuste, não uma lei.

O limite é checado **nos dois lugares**: no botão, para o usuário saber antes de abrir aba; e na página, porque o link é colável e ninguém confia em guarda que mora só no cliente.

## Testes

**Vitest**, nas partes puras:

- validação e corte dos ids (vazio, malformado, repetido, acima de 50)
- mapeamento dos dados de cada espelho, inclusive o caso de rateio em mais de um centro
- soma dos filhos conferindo com o total do cabeçalho
- `ParcelaPaga` com juros: líquido igual a `valor - desconto + juros`

**Playwright**, no fluxo crítico: marcar dois lançamentos na listagem, clicar em "Imprimir espelho (2)", e conferir que a página traz os dois documentos com os valores certos, com `window.print` stubado.

**RLS**, teste e não suposição: usuário sem `ver` no recurso não abre a rota; id de linha que ele não vê sai da impressão.

## Fora do escopo desta fase

- **Cotação e folha.** Mesmo trilho, entrega seguinte. O holerite continua como está.
- **Checkbox nas 38 tabelas sem ação.** Checkbox onde existe ação para ele (imprimir ou lote). Coluna a mais em tabela densa, sem nada que ela dispare, é ruído. Liga-se nas demais no dia que tiverem ação.
- **PDF baixado.** A impressão do navegador já deixa salvar como PDF no diálogo do sistema. `pdfmake` traria dependência nova e um segundo layout para manter em sincronia com o CSS.
- **Medição e OS.** Não existem no código.
