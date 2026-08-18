# Categoria de custo na Ordem de Compra

Data: 17/08/2026
Branch: `feat-oc-categoria-de-custo`, empilhado em `feat-oc-ajustes-e-carga-mc`

## Problema

Hoje quem monta uma Ordem de Compra escolhe a **categoria do custo** à mão, num
select de 55 opções, mesmo tendo acabado de escolher os insumos — que já sabem a
que categoria pertencem. Duas consequências:

1. **A informação é digitada duas vezes** e pode divergir. O insumo "Diesel S10"
   está na categoria de insumo `Combustível`, mas nada impede a OC dele ser
   classificada como `Materiais de construção`.
2. **Uma OC só aceita uma categoria.** Quando a compra mistura coisas — a
   OC-2026-0017 tem brita, rachão e BGS — o valor inteiro cai numa categoria só e
   o DRE mente. Das 17 ordens carregadas, **4 já têm itens de categorias
   diferentes**.

Somado a isso, as 17 ordens importadas do Mais Controle entraram sem categoria
(a carga foi por SQL, sem passar pelo formulário, que exige o campo) e 9 delas
sem descrição.

## Decisões tomadas (Tiago, 17/08/2026)

| tema | decisão |
|---|---|
| onde vive o vínculo insumo -> categoria de custo | **no próprio insumo** (`insumos.categoria_financeira_id`), semeado por regra a partir da categoria do insumo |
| OC com categorias diferentes | **`lancamento_rateios` ganha `categoria_id`** — um lançamento, rateado por categoria |
| descrição das 17 OCs | ler a observação **no Mais Controle**, mostrar os pares antes de gravar |
| insumos em "A classificar" (520) | **travar em OC nova**, corrigir sob demanda; sem mutirão |

## Arquitetura

### Modelo de dados

```
insumos
  + categoria_financeira_id  uuid null -> categorias_financeiras(id)

lancamento_rateios
  + categoria_id             uuid null -> categorias_financeiras(id)

ordens_compra
  ~ categoria_id             deixa de ser digitada; passa a ser derivada dos itens
```

Três pontos de projeto:

**O rateio da OC não é armazenado.** `oc_itens` já tem `insumo_id`,
`centro_custo_id`, `quantidade` e `preco_unitario`. O rateio por categoria é
*derivado* disso — não há tabela nova nem estado para dessincronizar. Ele só é
materializado em `lancamento_rateios` no momento da aprovação, que é quando
vira dinheiro.

**As colunas novas nascem nullable.** `insumos.categoria_financeira_id` fica
nullable até a semeadura cobrir os 3.357 registros; a obrigatoriedade é imposta
na aplicação (Zod + o form de insumo) desde o primeiro dia. Virar `NOT NULL` no
banco é um passo posterior, quando a cobertura estiver em 100% — e aí ele é
barato. `lancamento_rateios.categoria_id` fica nullable pela mesma razão: os
6.737 rateios existentes recebem backfill com a categoria do lançamento pai.

**`lancamentos.categoria_id` continua existindo e preenchido.** 5.905 lançamentos
e todos os relatórios dependem dele. Quando a OC tem uma categoria só, ele e o
rateio concordam; quando tem várias, ele guarda a de maior valor. O DRE passar a
ler do rateio é uma etapa seguinte, fora deste spec.

### Semeadura dos 3.357 insumos

A decisão foi categoria no insumo, mas classificar 3.357 itens à mão não é
trabalho de gente. A semeadura usa um mapa de **27 linhas** — uma por categoria
de insumo — e depois qualquer insumo pode ser ajustado individualmente, que é
justamente o ganho de ter a coluna no insumo.

| categoria do insumo (grupo) | categoria de custo |
|---|---|
| Combustível *(Equipamentos)* | Combustível |
| Lubrificantes e graxas | Combustíveis e lubrificantes |
| Filtros | Manutenção de equipamentos |
| Peças e componentes | Manutenção de equipamentos |
| Pneus e câmaras | Manutenção de equipamentos |
| Manutenção e serviços | Manutenção de equipamentos |
| Locação de equipamento | Aluguel de Equipamento |
| A classificar *(Equipamentos)* | Manutenção de equipamentos |
| Equipe própria *(Mão de obra)* | Salário Mão de Obra |
| Diaristas | Mão de Obra Terceirizada |
| Terceiros e empreitas | Mão de Obra Terceirizada |
| A classificar *(Mão de obra)* | Mão de Obra Terceirizada |
| Aço, ferragens e fixação *(Material)* | Materiais de construção |
| Asfalto e ligantes | Materiais de construção |
| Cimento, agregados e concreto | Materiais de construção |
| Elétrica | Materiais de construção |
| Hidráulica | Materiais de construção |
| Madeira e formas | Materiais de construção |
| Pintura e acabamento | Materiais de construção |
| EPI e sinalização | EPI'S |
| Ferramentas e consumíveis | Materiais |
| Limpeza e escritório | Material de Escritório |
| A classificar *(Material)* | Materiais |
| Fretes e transporte *(Outros)* | Frete |
| Taxas e administrativo | Impostos e taxas |
| Rancho e alojamento | Hospedagem |
| A classificar *(Outros)* | Outras despesas |

**Suposição registrada:** "Rancho e alojamento" cobre alimentação de equipe em
campo, e a categoria financeira mais próxima é `Hospedagem`. Foi apresentada ao
Tiago marcada como dúvida e ele aprovou o design sem trocá-la. Se estiver errada,
é um UPDATE de uma linha no mapa e a re-semeadura dos insumos daquela categoria.

### Fluxo

**Cadastro de insumo.** Ganha o campo "Categoria de custo", obrigatório. É aqui
que a padronização acontece de verdade: um insumo não existe sem saber onde o
custo dele cai.

**Montagem da OC.** O select de categoria **sai do formulário**. Ao adicionar um
item, a categoria de custo do insumo aparece ao lado dele, como leitura. Abaixo
da lista, um painel mostra o rateio derivado:

```
Rateio por categoria
  Materiais de construção ................ R$ 71.300,00   (71,3%)
  A classificar .......................... R$ 28.700,00   (28,7%)
                                          ─────────────
                                           R$ 100.000,00
```

**Trava do "A classificar".** Insumo cuja categoria de insumo é `A classificar`,
ou que esteja sem `categoria_financeira_id`, é recusado na OC com o caminho para
resolver ali mesmo. Os 520 não travam nada hoje — só travam quando alguém tenta
comprar aquele item, que é exatamente quando a informação importa e existe.

**Aprovação.** Gera **um** lançamento, com rateio por (centro de custo x
categoria). Um documento do fornecedor continua sendo um lançamento: essa
invariante é o que sustenta a conciliação com o Mais Controle fechada hoje, e
quebrá-la já custou R$ 14.190,82 numa carga anterior.

### Cálculo do rateio

Uma função pura, `ratearPorCategoria(itens)`, em `src/modules/compras/ordens/`:

- agrupa `oc_itens` por (`centro_custo_id`, categoria de custo do insumo)
- valor de cada fatia = `sum(quantidade * preco_unitario)`
- rateia frete, impostos, outras despesas e desconto **proporcionalmente** às
  fatias, porque o total da OC inclui o rodapé
- arredonda a 2 casas e joga o **resto na maior fatia**, para que
  `sum(fatias) = valor_total` ao centavo

O resto-na-maior-fatia é a mesma regra já usada na correção dos rateios do
financeiro hoje; repetir a regra evita duas aritméticas diferentes no sistema.

## Erros e casos de borda

| situação | comportamento |
|---|---|
| insumo sem `categoria_financeira_id` | OC recusa o item, com link para classificar |
| insumo em `A classificar` | idem |
| OC com uma categoria só | rateio de 1 linha; `ordens_compra.categoria_id` = ela |
| OC com N categorias | `ordens_compra.categoria_id` = a de maior valor |
| desconto maior que a soma dos itens | já barrado pelo cálculo do total da OC hoje |
| centro de custo repetido com a mesma categoria | agrupa numa fatia só |
| rateio que não soma o total | erro; a trava `sum(rateios) = valor` do banco pega |

## Testes

Unitários (Vitest), sobre a função pura:

- soma das fatias igual ao total, incluindo rodapé de frete/imposto/desconto
- resto de arredondamento cai na maior fatia (caso com 3 fatias e centavo sobrando)
- agrupamento por (centro de custo, categoria) junta itens repetidos
- OC de uma categoria só produz uma fatia
- **linha de controle:** uma OC multi-categoria cujo rateio TEM que dar diferente
  de zero em duas categorias — sem ela o teste passa sem provar nada

Mapa de semeadura: teste que garante que as 27 categorias de insumo têm destino
e que todos os destinos existem em `categorias_financeiras`.

Validação: insumo em "A classificar" é recusado pelo schema da OC.

## Fora de escopo

- DRE e relatórios lendo do rateio (continuam em `lancamentos.categoria_id`)
- Reclassificar os 520 insumos em "A classificar" em mutirão
- `NOT NULL` nas colunas novas
- Mexer nos 6.737 rateios além do backfill da categoria do pai
- Descrição das 6 OCs que estão vazias no próprio Mais Controle (ver abaixo)

## Dependência

Este branch está empilhado em `feat-oc-ajustes-e-carga-mc`, que tem 3 commits,
**nenhum PR aberto** e não está mergeado — mas cuja carga **já está aplicada no
banco vivo**. Aquele branch precisa mergear antes deste, senão o merge traz os
dois juntos. A migration nova entra depois da `20260817160000`.

## Backfill da descrição — feito em 17/08/2026

A observação da OC no Mais Controle **não é a coluna "Descrição"** da listagem
(essa vem vazia). Ela vive na aba **Informações**, na seção **Observações**, no fim
da ficha. Foi lida na tela das 17 ordens, uma por uma.

Resultado: **4 ordens ganharam descrição**, 7 já tinham texto idêntico ao do MC, e
**6 estão vazias no próprio MC** — não há o que copiar.

| MC | erp | descrição gravada |
|---|---|---|
| 2607 | OC-2026-0001 | REFERENTE A 20 MIL LITROS DIESEL - 15 MIL S10 E 5 MIL S500 |
| 2606 | OC-2026-0002 | REFERENTE A 5 MIL LITROS DIESEL S500 - BR364 LOTE10 |
| 2605 | OC-2026-0003 | REFERENTE A 15 MIL LITROS DIESEL S10 - GREGORIO |
| 2597 | OC-2026-0011 | CAIXA DO DIA 01/08/2026 - MECANICO PASSOU 1 SEMANA PRESTANDO SERVICO NO SILO |

Nas três de diesel a observação também traz a data do boleto (31/08, 13/09 e
13/09). Ela não entrou na descrição — que é "o que está sendo comprado" — e foi
anexada em `observacoes` como `Observação no Mais Controle: ...`, porque é
informação de vencimento e some se descartada.

**Sem descrição nem aqui nem no MC (6):** OC-2026-0004 (SHIRLEY), 0005
(M S TEIXEIRA), 0006 (PEMAZA), 0007 (RONDOBRAS), 0008 (GOL LOG) e **0017 (BRITAS,
R$ 100.000)**. Todas em rascunho. A descrição é obrigatória no formulário, então
elas **não passam pela aprovação** como estão. Duas saídas, e é escolha do Tiago:

1. gerar a descrição a partir dos itens (ex.: "Diesel S10 e Diesel S500"),
   marcando em `observacoes` que foi gerada porque a origem não tinha; ou
2. ele preenche as seis na tela, que são rascunhos e leva um minuto cada.

Nada foi gerado automaticamente: inventar texto e gravá-lo como se fosse dado do
Mais Controle seria pior do que deixar em branco.
