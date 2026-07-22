# Padronização dos formulários do ERP-EMT — Design

Data: 2026-07-22
Status: aprovado (design), pendente de plano de implementação
Autor: Léo (com Tiago)

## Problema

Os formulários do app não seguem um padrão. Existe um shell de modal canônico
(`FormDrawer`) e um wrapper de campo (`CampoFormulario` + `classesFormulario`),
mas só 6 dos 26 form-drawers usam o wrapper. Os outros 18 escrevem o label na mão,
com espaçamento inconsistente (gap-2/3/4/5 misturados, grids ad-hoc). Além disso o
`CampoFormulario` mora em `src/modules/cadastros/_shared/campos.tsx`, um caminho de
módulo, o que empurra os outros módulos a copiar em vez de reusar.

Caso concreto que disparou o trabalho: no form de OC, a linha de item mostra Insumo
em uma linha, Quantidade + Preço unitário em outra e o Subtotal solto numa terceira.
O Tiago quer os quatro (insumo, quantidade, preço, subtotal) na mesma linha, e mais:
todos os forms no melhor design possível e num padrão único.

## Objetivo

Um kit de formulário canônico único, adotado por 100% dos forms do app, com:
- linha de item em formato de tabela compacta (rótulo vira cabeçalho de coluna, 1x);
- layout de campos em 2 colunas inteligente (curtos lado a lado, longos largura total);
- espaçamento e tipografia únicos, seguindo o design system EMT (base Notion, Faixa âmbar).

Escopo é **somente UI**. Não toca em regra de negócio, RLS, Server Action, schema
nem migration. Os 186 testes existentes continuam verdes.

## Decisões (fechadas com o Tiago)

1. **Linha de item = tabela compacta.** O rótulo (Insumo, Qtd, Preço un., Subtotal)
   aparece 1x como cabeçalho de coluna; cada linha de item é enxuta. Melhor densidade
   para itens que repetem.
2. **Campos gerais = 2 colunas inteligente.** Campo longo (nome, fornecedor, combobox,
   observações) ocupa largura total; campos curtos que andam juntos (data, valor,
   condição, unidade) vão lado a lado em 2 colunas, empilhando no celular.
3. **Rollout = canônico + tudo num plano só.** Promove o kit para `components/canonicos/`,
   migra os 26 forms + login/definir-senha/config, deixa tsc/lint/build/testes verdes e
   entrega 1 preview na Vercel pra validação.
4. **Mover o `CampoFormulario` do módulo cadastros para o canônico** (aprovado pelo
   Tiago), atualizando os imports. Refactor de organização que sustenta o padrão.

## O kit canônico (novo em `src/components/canonicos/`)

Todas as peças abaixo ficam em `components/canonicos/` e são exportadas pelo
`components/canonicos/index.ts`.

### `CampoFormulario`
Movido de `modules/cadastros/_shared/campos.tsx`. Mesma API atual: `id`, `rotulo`,
`obrigatorio`, `erro`, `ajuda`, `children`, `className`. Empilha label + controle +
ajuda/erro. É o átomo de campo de todo form.

### `SelectAtivo`
Movido junto (mesma API). O switch "Ativo" dos cadastros.

### `LinhaCampos`
Grid responsivo para colocar campos lado a lado. API:
- `colunas?: 2 | 3` (default 2)
- `children`, `className`
Layout: `grid grid-cols-1 gap-4` no mobile, `sm:grid-cols-{colunas}` no desktop.
É o "2 colunas inteligente": campos longos ficam fora dela (largura total do form),
campos curtos entram dentro dela.

### `SecaoFormulario`
Agrupa um bloco do form com título e ação opcional à direita. API:
- `titulo: string`
- `acao?: ReactNode` (ex: botão "Adicionar centro de custo")
- `children`
Estilo: título em `text-detalhe font-semibold` com a **Faixa âmbar de 3px** à esquerda
(assinatura do design system EMT), ação alinhada à direita. Substitui os cabeçalhos
`<div className="flex items-center justify-between"><h3>...</h3><Button/></div>` que
hoje cada form escreve na mão.

### `TabelaItens` (linha de item em tabela)
A peça central do pedido. Renderiza uma tabela compacta de itens que repetem, com o
rótulo como cabeçalho de coluna 1x. Composição por colunas declaradas, para OC e
cotação usarem a mesma peça.

API (proposta):
```
<TabelaItens
  colunas={[
    { chave: "insumo",   rotulo: "Insumo",    largura: "1fr",   alinhamento: "left"  },
    { chave: "qtd",      rotulo: "Qtd",       largura: "120px", alinhamento: "right" },
    { chave: "preco",    rotulo: "Preço un.", largura: "140px", alinhamento: "right" },
    { chave: "subtotal", rotulo: "Subtotal",  largura: "140px", alinhamento: "right" },
  ]}
  linhas={campos}                    // do useFieldArray
  renderCelula={(chave, indice) => ...}   // devolve o controle da célula
  onRemover={(indice) => ...}
  podeRemover={(indice) => boolean}
  rodape={<>+ Adicionar insumo ... Subtotal do centro R$ ...</>}
/>
```

Comportamento:
- Desktop (`sm+`): grid com `grid-template-columns` das larguras declaradas + coluna
  fixa da lixeira. Cabeçalho de coluna com os rótulos 1x. Números `tabular-nums`,
  alinhados à direita. Subtotal por linha e total ao vivo continuam calculados pelo
  form (a `TabelaItens` só posiciona; o cálculo fica em `calculo.ts`).
- Mobile (`< sm`): cada linha vira um card empilhado com rótulo por campo (reusa
  `CampoFormulario`), pra não quebrar em tela estreita.
- Erro por célula: a `TabelaItens` exibe a mensagem de erro embaixo da célula quando
  o form passa o erro.

A `TabelaItens` NÃO conhece react-hook-form: recebe as linhas e um `renderCelula`.
Isso a mantém genérica (OC e cotação têm colunas diferentes) e testável isolada.

### `classesFormulario`
Movida para o canônico. Espaçamento único do stack do form: `flex flex-col gap-5`.
Acaba a mistura gap-2/3/4/5.

## Layout padrão de um form (como fica)

```
FormDrawer (modal centralizado: header fixo / corpo rolável / rodapé fixo)
 └─ <form className={classesFormulario}>          // gap-5
      Fornecedor *              → CampoFormulario (largura total)
      LinhaCampos(2):           → Condição de pgto | Data de emissão
      Cotação de origem         → CampoFormulario (largura total)
      SecaoFormulario "Itens" + ação
        └─ TabelaItens
      Observações               → CampoFormulario (largura total)
```

Largura do modal por tipo:
- Cadastro simples (poucos campos): `sm:max-w-xl` (padrão do `FormDrawer`).
- Form com itens ou muitos campos (OC, cotação, lançamento): `sm:max-w-2xl` ou
  `sm:max-w-3xl` conforme o conteúdo.

## Alcance da migração

Todos os forms passam a consumir o kit canônico:

- **Cadastros (10):** obras, clientes, fornecedores, colaboradores, equipamentos,
  insumos, unidades, categorias, centros-custo (no-form-drawer).
- **Compras (3+):** ordem (OC, com `TabelaItens`), cotações (nova-cotacao,
  fornecedor-cotacao, com `TabelaItens`).
- **Financeiro (5):** categorias, contas-bancarias, contas-receber, lançamentos,
  pagamentos (drawers de baixa/aprovar).
- **RH (11):** adiantamentos, apontamentos, criar-ponto, banco-horas, diaristas,
  documentos, epis, ferias, ocorrencias, folha (gerar-folha).
- **Administração (1):** configurações.
- **Auth (2):** login, definir-senha (adotam `CampoFormulario` pra ficarem no padrão).

Import antigo `modules/cadastros/_shared/campos` vira um re-export fino do canônico
durante a migração (nada quebra no meio), e no fim os imports apontam direto pro
canônico e o arquivo `_shared/campos.tsx` é removido.

## Testes e definição de pronto

- `TabelaItens`, `LinhaCampos` e `SecaoFormulario` ganham teste de render (Vitest +
  Testing Library) cobrindo: cabeçalho de coluna 1x, colapso mobile da `TabelaItens`,
  exibição de erro por célula, grid de N colunas.
- Os 186 testes existentes continuam verdes (é só UI; nenhuma regra muda).
- `npm run typecheck`, `npm run lint`, `npm run build` verdes. Sem `any` novo, sem
  `console.log`.
- Paridade visual: nenhum form perde campo, ação ou validação. Cálculo de subtotal/total
  da OC idêntico ao atual.
- 1 preview na Vercel no fim pra o Tiago validar o app inteiro.

## Fora de escopo

- Regra de negócio, RLS, Server Action, schema, migration: nada muda.
- Novos campos ou novas telas: não. É padronização do que já existe.
- Refactor não relacionado (ex: reorganizar módulos): não.
- O item da cotação só entra na `TabelaItens` se as colunas casarem sem forçar; se o
  fluxo da cotação for diferente demais, ela adota o kit de campos mas mantém seu
  layout de itens (decisão registrada no plano).

## Riscos

- **Volume:** 26+ forms tocados. Mitigação: kit canônico primeiro e migração em ondas
  por módulo, cada onda com build verde antes de seguir.
- **Regressão de cálculo na OC:** o subtotal/total ao vivo é sensível. Mitigação: manter
  `calculo.ts` intocado; a `TabelaItens` só posiciona, não calcula.
- **Mobile:** a tabela de itens precisa colapsar bem. Mitigação: fallback empilhado
  testado no Vitest e conferido no preview.
