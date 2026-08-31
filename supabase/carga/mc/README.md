# O rateio do Mais Controle resolve a raiz da Manutenção

Aplicado no banco em 30/08/2026.

## O que aconteceu

A raiz de "Manutenção/Documentação de Equipamentos" tinha **R$ 1.062.032,49 em 748
lançamentos** que ninguém sabia de qual máquina eram. As descrições diziam "caçamba",
"patrol", "hilux", e a frota tem várias de cada.

O Tiago lembrou do óbvio que eu não tinha visto: **o Mais Controle já tem o rateio por
etapa**. O export de Lançamentos traz a coluna `Etapa / Item`, e a etapa é a máquina.

Resultado: **390 rateios movidos, R$ 582.699,43 fora da raiz**, e a raiz caiu para
**R$ 479.333,06 em 358 lançamentos**.

## Os quatro exports

O MC exporta por período e por centro, e nenhum export sozinho cobre tudo:

| Arquivo | Linhas | Cobertura |
|---|---|---|
| `Lancamentos-2026-08-30.xlsx` | 594 | 2025 a mar/2026, centro 000 |
| `Lancamentos-2026-08-30 (1).xlsx` | 82 | idem, multi-rateio |
| `Lancamentos-2026-08-30 (2).xlsx` | 3.625 | jan a ago/2026, todos os centros |
| `Lancamentos-2026-08-30 (3).xlsx` | 3.139 | 2025 inteiro, todos os centros |

Juntos e deduplicados: **1.120 documentos** da Manutenção, todos os meses de jan/2025 a
ago/2026.

## A descoberta que destravou: são DOIS centros no MC

A raiz do erp-emt absorveu **dois** centros do Mais Controle, não um:

- `000 - Manutenção Equipamentos EMT` (e o `0.2 - Equipamentos EMT 2026`, o mesmo com
  nome novo)
- `009.1 - Manutenção Equipamentos BR-364 (Lote 9)`

Filtrando só o primeiro, 262 lançamentos não casavam e parecia falta de período. Peguei
os 78 de nov/dez que faltavam e procurei no MC inteiro: **61 estavam no 009.1**. Não era
período, era centro.

## Três convenções de nome convivem no MC

| Padrão | Onde | Exemplo |
|---|---|---|
| Nome do erp-emt com placa | 2026 | `Caminhão Caçamba 2423 K/36 MZO-5897 - 01 - Manutenção - UN` |
| Código numerado | 2025, centro 000 | `0107 Caminhão Caçamba 2423 K/36` |
| Nome com número e sufixo | centro 009.1 | `Caminhão Caçamba 111 - Peças` |

O primeiro casa sozinho com o cadastro. O segundo e o terceiro usam a MESMA numeração,
e é ela que precisou de tradução.

## O que o Tiago respondeu, e o que a evidência já dizia

Tentei deduzir a placa de cada código pelas descrições que citam código e placa juntos.
Só 49 linhas serviam, e deu conflito nas caçambas, então não apliquei. O Tiago
respondeu as sete famílias:

| Família | Resposta | A evidência dizia |
|---|---|---|
| Caçamba 2423 K/36 | 106→CB-01, 107→CB-02, 108→CB-03 | 107→MZO-8547 (x6) e 106→MZO-5897 (x2) **confirmam** |
| Caçamba 2425/48 | 109→CB-04, 110→CB-05, 111→CB-06 | 110→NAB-4669 (x4) e 111→NAB-4619 (x3) **confirmam** |
| Escavadeira 320C | 0001→01, 0002→02, 0003→03 | sem evidência |
| Retroescavadeira 416E | 0006→01, 0007→02 | sem evidência |
| Motoniveladora 12H | 0010→01, 0011→02 | sem evidência |
| Rolo CP56 | 0012→01, 0013→02 | sem evidência |
| Cavalo XF 530 | 0114→SQS7E01 | sem evidência |

**Quatro confirmações independentes.** A dedução por texto estava certa onde tinha
material; onde não tinha, calar foi o certo.

## O que este diretório guarda

- `1_junta_exports.py` — lê os quatro .xlsx, agrupa linha em DOCUMENTO (o `Índice`
  "26.1/26.2" são fatias do documento 26) e deduplica entre arquivos.
- `2_mapa_codigo_para_etapa.py` — traduz a etapa do MC para a etapa do erp-emt, com as
  sete respostas do Tiago.
- `3_gera_pares.py` — produz o par (data da compra, valor do documento) → destino.
- `pares_data_valor_destino.sql` / `legenda_destinos.sql` — o que foi carregado.

O casamento é por **data da compra e valor do documento**, que é único em 1.074 dos
1.120. As 18 chaves ambíguas e os documentos com destino em conflito ficaram de fora.

## Linhas de controle, e a que pegou o erro

Só UPDATE, nenhuma linha criada ou apagada, então `categoria_id` fica intocado. Além do
DRE por tipo e do rateio fechando com o valor, a linha forte é:

> a subárvore da Manutenção cai EXATAMENTE o que foi para fora dela

A primeira versão dessa linha falhou por R$ 500,00 e me fez olhar: o destino
`Caminhão Cavalo XF 530 FTT SQS7E01 - 02` mora em **001 - Carretas EMT**, não na
Manutenção. Saída legítima que a minha conta não previa. **Era a checagem errada, não a
operação** — é a terceira vez hoje que uma linha de controle acusa a própria conta e não
o dado, e as três vezes valeram por me obrigarem a olhar.

## O que ficou de fora de propósito

- **Oficina**, 84 lançamentos e R$ 54.330,37. O MC tem etapa "Oficina", o erp-emt não.
  Criar a etapa é decisão do Tiago.
- **Rateio entre várias etapas**, 59 lançamentos. O MC dá a proporção real (88/12,
  54/43/2); precisa dividir a linha, não só movê-la.
- **Máquina fora da frota**: Amarok, Agrale BX6180, Valtra BH180, usina Ciber, Honda
  BROS, John Deere. Sem cadastro, sem etapa.
