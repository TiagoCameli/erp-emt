# Dias de equipamento por centro de custo — desenho

Data: 16/10/2026 · Pedido do Tiago · Módulo: Mapa (erp-emt)

## Por que

Todo equipamento gera custo: depreciação, se é próprio, ou aluguel, se é alugado. Esse custo
tem que cair no centro de custo onde o equipamento trabalhou. Hoje o ERP não sabe quantos dias
cada equipamento passou em cada centro. O Mapa sabe onde ele está **agora**, mas não guarda os
dias em cada centro.

Mais tarde o ERP vai ter a depreciação por hora de cada equipamento e vai ratear esse custo
pelos centros. **Por agora o Tiago quer só o registro dos dias**: quantos dias cada equipamento
ficou em cada centro de custo. O rateio em reais vem depois e lê este registro.

## Objetivos

1. Todo equipamento do Mapa tem, em todo dia, exatamente **um** centro de custo. Não fica dia
   sem centro e nenhum dia cai em dois centros.
2. O centro sai do que o pessoal do Mapa **já marca**: a obra e o estado. Ninguém lança dia a
   dia e ninguém escolhe centro numa lista.
3. É possível ver os dias:
   - num **relatório mensal**, com equipamento × centro × dias;
   - na **ficha do equipamento** no Mapa, com os períodos e os dias por centro.

## Fora de escopo (agora)

- Depreciação: vida útil, valor residual, custo por hora.
- Valor em reais, rateio do custo do equipamento e geração de lançamento.
- Escolher **etapa** dentro da obra. O Tiago decidiu: **só a obra, por enquanto**.
- Refazer o passado. A contagem começa quando entrar no ar.

## Anti-objetivos (o que tornaria isto um fracasso mesmo funcionando)

- Pedir ao pessoal do Mapa um passo novo a cada movimentação. Quem anota é o pessoal que já
  usa o Mapa, e o trabalho deles não pode crescer.
- Um equipamento com dia sem centro, ou somando mais dias do que o mês tem.
- O centro novo bagunçar o Escritório Central, o rateio indireto ou a folha (ver
  "Armadilha" abaixo).

## Regras decididas pelo Tiago

1. **Centro novo "Equipamento Sem Alocação"**:
   - fica no nível 1 (raiz) e é de sistema;
   - tem `papel_rateio = 'indireto'`;
   - funciona como o Escritório Central: o custo dele é dividido entre as obras pelo custo
     mensal de cada obra, e isso já é o que `fn_rel_custos_indiretos` e o rateio indireto de
     12/10 fazem com qualquer raiz `indireto`;
   - hoje nenhum lançamento cai nele; ele só recebe dias.
2. **Equipamento parado vai para Sem Alocação.**
3. **Equipamento operando que trabalha para vários centros ao mesmo tempo vai para Sem
   Alocação.** O pessoal do Mapa marca isso de propósito.
4. **Equipamento operando para uma obra vai para o centro raiz daquela obra.** Só a obra, não
   a etapa.
5. **Próprio e alugado contam dias igual.** A diferença (depreciação × aluguel) só aparece no
   rateio futuro. Para o alugado, o valor já está em `mapa_locacoes` (tipo_aluguel,
   valor_unitario, vigência).
6. **Quem registra é o pessoal que já mexe no Mapa.**
7. **Os dias aparecem nos dois lugares**: relatório mensal e ficha do equipamento.

## Regra do centro, dia a dia

O centro de um equipamento num instante sai do **estado efetivo** dele no Mapa: o
`estado_efetivo` da view do Mapa (v1.19), que junta `mapa_equipamentos.estado` com o
`equipamentos.status`, a OS em execução e a posição. O registro tem que reagir a todas essas
fontes, não só a `mapa_equipamentos`:

| Situação no Mapa | Centro |
|---|---|
| `estado = 'operando'`, com `obra_id` e **sem** a marca "atende vários centros" | centro raiz (nível 1) da obra (`centros_custo.obra_id = obra_id`, `pai_id is null`) |
| `estado = 'operando'` com a marca "atende vários centros" | Equipamento Sem Alocação |
| `estado = 'operando'` sem obra (pátio central, oficina, sede: `sem_obra` da v1.21) | Equipamento Sem Alocação *(decisão do desenho)* |
| `parado`, `quebrado_obra`, `conserto`, `em_rota` | Equipamento Sem Alocação (`parado` decidido pelo Tiago; os demais são *decisão do desenho*: não estão trabalhando para obra nenhuma) |
| `sem_posicao` (no Mapa, mas sem posição) | Equipamento Sem Alocação (decidido pelo Tiago) |
| `fora_funcionamento`, seja marcado no Mapa ou forçado pelo cadastro (o `estado_efetivo` da v1.19) | **nenhum centro**: o dia não conta (decidido pelo Tiago). É máquina encostada |
| **Exceção, carretas da EMT Transportes** (obra fixa "001 - Carretas EMT"): `em_rota` / em frete | centro raiz de **001 - Carretas EMT** (decidido pelo Tiago), não Sem Alocação |
| **Implemento acoplado** (v1.19) | **herda o centro da máquina que o puxa**, enquanto estiver acoplado (decidido pelo Tiago). Desacoplado e fora do Mapa, não conta |

**Marca nova:** "Atende vários centros" (booleano), na ficha do equipamento no Mapa. É o
**único** dado novo que o pessoal informa. Ela fica ligada até alguém desligar e vale enquanto
o equipamento estiver operando.

## Como contar os dias *(decisões do desenho)*

- **Dias corridos**, contando sábado, domingo e feriado. O equipamento continua alocado ao
  centro nesses dias, e o aluguel e a depreciação correm do mesmo jeito.
- **Dia com troca de centro:** o dia inteiro vai para o centro onde o equipamento **terminou o
  dia**, no fuso `America/Rio_Branco`, o mesmo do resto do Mapa (conserto, dias de locação,
  `data_efetiva`). Assim cada dia tem um centro só e a soma dos dias do mês é
  exatamente o número de dias do mês em que o equipamento esteve no Mapa.
- **Dias que não contam em centro nenhum:**
  - equipamento fora do Mapa: alugado antes de começar ou depois de encerrar a locação,
    vendido;
  - `fora_funcionamento`;
  - implemento desacoplado.

  O total do relatório fecha contra os dias que **contam**, não contra os dias do mês.

## Forma de guardar (sugestão ao construtor)

Uma tabela de **períodos**, append-only, no estilo de `mapa_movimentacoes`: equipamento,
centro de custo, início, fim (nulo = em curso) e o motivo/movimentação que abriu o período.
Uma função de leitura gera os dias por mês a partir dos períodos, aplicando a regra de "quem
terminou o dia".

- **Derivado é trigger, não parâmetro:** o centro **não** é escolhido na tela. Ele é calculado
  a partir de obra, estado e a marca. O período deve ser aberto e fechado por trigger em
  `mapa_equipamentos` (ou dentro das funções do Mapa que gravam obra e estado), nunca pela
  tela. Assim, qualquer caminho que mude obra ou estado, inclusive OS em execução →
  `conserto`, mantém o registro certo.
- **Ao entrar no ar:** abrir um período para cada equipamento que está no Mapa, com o centro
  calculado pelo estado atual e início = data da implantação.
- **Correção de erro:** se alguém marcou errado e conserta depois, o período segue a data
  efetiva da movimentação (`data_efetiva`), quando o Mapa a informar. Se não, segue a hora da
  gravação. O construtor decide o detalhe olhando como `fn_mapa_mover_equipamentos` trata a
  data retroativa hoje. Enquanto não houver rateio em reais, a correção pode reescrever
  qualquer mês. O rateio futuro é quem trava o mês, como as competências fechadas
  *(decisão do desenho)*.

Alternativa considerada: ler a foto diária (`mapa_snapshots`). Descartada como fonte
principal, porque depende de o job da foto rodar todo dia e não guarda o centro. Serve como
conferência.

## Telas

1. **Ficha do equipamento no Mapa** (ficha ao lado, v1.12+):
   - o interruptor "Atende vários centros";
   - um bloco "Centros de custo" com o centro atual, desde quando, os dias no mês corrente
     por centro e a lista dos períodos.
2. **Relatório mensal "Dias de equipamento por centro"**:
   - escolhe o mês;
   - mostra linhas por equipamento e colunas ou linhas por centro, com os dias e o total do
     equipamento, que deve fechar com os dias do mês em que ele esteve no Mapa;
   - filtros por obra/centro e por próprio/alugado;
   - exporta para Excel, como os outros relatórios.

   Onde fica no menu é escolha do construtor: junto dos relatórios do Mapa, se existirem, ou em
   Relatórios.

## Armadilha conhecida

- **O tipo do centro novo não pode ser `'escritorio'`.** A migration
  `20261013171259_folha_cc_cadastro_e_13_ferias_indireto.sql` acha o Escritório Central por
  `pai_id is null and tipo = 'escritorio' and papel_rateio = 'indireto'`. Um segundo centro
  com esse par seria confundido com ele. Outras buscas usam `tipo = 'escritorio'` junto com o
  nome. O construtor deve usar um tipo próprio, como `'equipamento'`, ampliando o check de
  `centros_custo.tipo`, e varrer as buscas por `tipo` e por `papel_rateio = 'indireto'` para
  confirmar que nenhuma pega o centro novo por engano.
- **Rateio indireto:** ao ganhar `papel_rateio = 'indireto'`, o centro passa a aparecer em
  `fn_rel_custos_indiretos` e no rateio de 12/10. Isso é o desejado, mas com custo zero ele
  não pode quebrar nem poluir a tela de percentuais do mês.
- **Carretas da EMT Transportes (v1.22):** elas têm obra fixa "001 - Carretas EMT"
  (`papel_rateio = 'fora'`). Operando **ou em frete (`em_rota`)**, contam dias para 001, como o
  Tiago decidiu. A regra geral de "em rota vai para Sem Alocação" não vale para elas.
  Identificar a carreta pela obra fixa 001, do jeito que a v1.22 faz.
- **O Mapa muda todo dia:** são 22 versões em 3 dias. Toda alteração em função do Mapa parte
  do corpo **vivo** (`pg_get_functiondef` + âncoras), como faz a v1.21, e não de cópia em
  migration velha.

## Fica com o construtor

- Nome final da tabela, das colunas e das funções.
- Se a marca "atende vários centros" vive em `mapa_equipamentos` ou em `equipamentos`.
- Permissões, que seguem as do Mapa: ver ficha = `mapa.mapa/ver`, relatório = permissão de
  relatórios do Mapa, e mudar a marca = quem já move equipamento.
- Layout do relatório e da ficha, seguindo os padrões do ERP (Combobox, filtro em trilhos,
  filtros na URL).
