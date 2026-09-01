# As 59 respostas da planilha de dúvidas, aplicadas

**Aplicado em 01/09/2026.** 59 de 59 decididas: 58 na planilha e o 2686 na
conversa. Foi em duas cargas, cada uma com ENSAIO antes -- o bloco inteiro com
`raise exception` no fim, que desfaz mas roda todas as checagens:

    parte 1, os 40 diretos   respostas_da_planilha_parte1_2026_09_01.sql
    parte 2, os 6 do rateio  respostas_da_planilha_parte2_2026_09_01.sql

O MCP do Supabase perdeu o token no meio do trabalho e ficou algumas horas fora.
Enquanto isso eu gerei a parte 1 como SQL para ele colar no SQL Editor, resolvendo
destino por NOME em vez de uuid -- eu nao tinha os uuid e nome errado falha alto
em vez de gravar nulo. Quando o MCP voltou, rodei o mesmo bloco por aqui, com
ensaio. O arquivo da parte 1 e literalmente o que foi rodado.

**O banco tinha se movido entre a planilha e a aplicacao**: entrou o
LAN-2026-6666 (R$ 1.583,33, diarias de 01/09) na raiz. Nao esta no plano e ficou
la. Foi por isso que eu conferi os 59 um a um antes de mexer, em vez de confiar
no total: o total ja era outro.

Origem: `~/Downloads/raiz-manutencao-duvidas.xlsx`, devolvido em 01/09/2026 às
10:02 com 58 das 59 linhas respondidas.

## Antes de olhar resposta nenhuma, duas provas de que era o meu arquivo

1. os 59 números de lançamento são exatamente os que eu escrevi, na mesma ordem;
2. a soma da coluna "valor na raiz" continua R$ 101.994,63.

As duas passaram. Se qualquer uma tivesse falhado seria outro arquivo e nada
disto valeria.

## O efeito, medido depois

```
raiz da Manutenção: R$ 103.577,96 -> R$ 12.260,39   (60 -> 17 lançamentos)
etapas com custo:   53 de 62
```

Sobraram 17, e cada um por um motivo declarado:

    13  R$ 10.197,06  ele mandou ficar
     3  R$    480,00  fatia do MC que aponta para maquina fora do cadastro
     1  R$  1.583,33  chegou depois da planilha (LAN-2026-6666)

A parte 1 tirou R$ 87.505,52 da raiz e R$ 35.414,92 da subarvore; a parte 2
tirou mais R$ 3.812,05 da raiz e R$ 766,53 da subarvore.

## As 58 respostas, resolvidas

### Movimento simples (uma fatia, um destino)

| lanç. | valor | destino |
|---|---|---|
| 2629 | 18.248,77 | Manutenção > **Lubrificante** |
| 4432 | 5.450,00 | Manutenção > Hilux CHLSTM4FD QWQ-3H97 - 01 |
| 1905 | 3.194,38 | Manutenção > Hilux CHLSTM4FD QWQ-3H97 - 01 |
| 3500 | 3.000,00 | Manutenção > Oficina |
| 2669 | 2.819,48 | Amazônia > Manutenção de Equipamentos da Amazônia |
| 4570 | 2.503,35 | 007 - AC 405 - Lote 2 |
| 0426 | 1.996,65 | Manutenção > Oficina |
| 0949 | 1.520,00 | Manutenção > Hilux CHLSTM4FD QWQ-3H97 - 01 |
| 1468 | 1.294,95 | Manutenção > Oficina |
| 0490 | 1.158,67 | 003 - Recuperação do Ramal do Gama |
| 3169 | 879,54 | Manutenção > Oficina |
| 1147 | 607,20 | Manutenção > Oficina |
| 5943 | 500,00 | Manutenção > Oficina |
| 0055 | 409,82 | Manutenção > Oficina |
| 1248 | 405,02 | Escritório Central |
| 4623 | 401,20 | Escritório Central |
| 1450 | 309,90 | 003 - Recuperação do Ramal do Gama |
| 3614 | 285,00 | Escritório Central |
| 2467 | 279,15 | 001 - Carretas EMT > Caminhão Cavalo XF 530 FTT SQS7E01 - 02 |
| 3369 | 230,81 | Manutenção > Oficina |
| 0702 | 205,57 | Manutenção > Rolo CP56 - 01 |
| 3176 | 135,00 | Manutenção > Oficina |
| 2686 | 120,00 | Manutenção > Caminhão Cavalo 2644 S/33 MZO-2987 - 01 (CS-01) |
| 0295 | 90,00 | Manutenção > Trator de Esteira D6NXL - 01 |
| 3137 | 89,15 | 007 - AC 405 - Lote 2 |
| 5951 | 50,00 | 009 - BR-364 Lote 09 & 10 |
| 2377 | 50,00 | 009 - BR-364 Lote 09 & 10 |
| 5952 | 40,00 | 009 - BR-364 Lote 09 & 10 |
| 5847 | 30,00 | Manutenção > Pá Carregadeira 924K - 01 |
| 5937 | 14,00 | 009 - BR-364 Lote 09 & 10 |
| 5938 | 10,00 | 009 - BR-364 Lote 09 & 10 |

### Divisão (a última fatia é o RESTO, nunca outro round)

| lanç. | valor | divisão |
|---|---|---|
| 5080 | 27.000,00 | **Aquisição de Equipamentos**, em três iguais: Vibro Acabadora AF4500 - 01, Rolo Chapa CB10 - 01, Rolo de Pneu CW34 - 01 — 9.000,00 cada |
| 2027 | 6.000,00 | Cavalo MZO-2987 - 01 + Pipa 2626 NCP-4846 - 01 — 3.000,00 cada |
| 1536 | 5.500,00 | Caçamba MZO-5897 - 01 + MZO-8547 - 02 + MZO-8F87 - 03 — 1.833,33 / 1.833,33 / 1.833,34 |
| 1519 | 589,62 | Retroescavadeira 416E - 01 + Boiadeiro L1620 — 294,81 cada |
| 0632 | 580,00 | Hilux SQQ-8F87 - 06 + QWQ-1D76 - 05 + SQR1C93 - 07 — 193,33 / 193,33 / 193,34 |
| 1891 | 550,00 | Motoniveladora 12H - 01 + Retroescavadeira 416E - 01 — 275,00 cada |
| 2053 | 408,29 | Rolo CP56 - 01 + Rolo Pé de Carneiro CP56 - 02 — 204,15 / 204,14 |
| 3288 | 300,00 | Rolo CP56 - 01 + Rolo Pé de Carneiro CP56 - 02 — 150,00 cada |
| 2048 | 250,00 | Rolo Chapa CB10 - 01 + Rolo de Pneu CW34 - 01 (os da **Manutenção**) — 125,00 cada |

### Aplicar o rateio do Mais Controle

| lanç. | valor na raiz | observação |
|---|---|---|
| 2946 | 1.725,00 | 13 máquinas. **R$ 420 sem destino** (501 e 502 Motor Compactador de Solo). |
| 5125 | 773,33 | 11 destinos, dois fora da manutenção: Casa James R$ 30 e escola 011 R$ 25. |
| 2361 | 732,40 | o MC diz 009 R$ 12.500 + 003 R$ 2.500; o ERP tem 11.889,67 e 2.377,93. Reescreve o rateio inteiro do lançamento. |
| 4307 | 510,00 | 9 destinos. **R$ 20 sem destino** (Carga Semi-Reboque/Prancha 104). |
| 1486 | 296,32 | o MC diz Colorado R$ 319,48 + Pipa MZO-4486 - 02 R$ 65,52. O ERP está errado nos dois lados. |
| 0793 | 255,00 | 7 destinos. **R$ 40 sem destino** (Skidy). |

### Fica na raiz (13 lançamentos, R$ 10.197,06)

`1683` 6.416,04 · `3732` 900,00 · `5176` 800,00 · `5713` 285,44 · `4714` 262,21 ·
`2594` 214,88 · `4535` 214,88 · `0115` 214,88 · `1635` 214,88 · `0373` 204,53 ·
`5018` 198,15 · `1769` 198,15 · `4470` 73,02

Vale registrar que ele **não** aceitou a minha sugestão de mandar
licenciamento e IPVA de placa fora da frota para o Escritório Central: os sete
(`2594`, `4535`, `0115`, `1635`, `5018`, `1769`, `4470`) ficam na Manutenção.

## Onde ele passou por cima do que eu sugeri, e isso importa

- **5080, R$ 27.000** — eu tinha dito "fica, é custo da frota inteira". Ele disse
  o que a nota não conta: o transporte de PVH x CZS foi da **Vibro AF4500, do
  Rolo CB10 e do Rolo CW34**, e o custo é de **Aquisição de Equipamentos**, não
  de Manutenção. É a maior linha da planilha e eu tinha errado o centro inteiro.
- **5943** — eu sugeri `004 - Galpão Silo` porque a nota diz "serviço no SILO".
  Ele mandou para a Oficina.
- **1450** — eu sugeri Escritório Central seguindo o MC (que põe em Empresa).
  Ele mandou para o Ramal do Gama.
- **4570 e 3137** — eu sugeri Oficina; ele mandou tudo para o AC 405.
- **0490** — eu sugeri Oficina; ele mandou para o Ramal do Gama.
- **2669** — eu sugeri Oficina; ele mandou para a Amazônia.
- **0632** — o MC divide entre "James", "Tiago" e "Apoio Cinza". Ele respondeu
  "as placas estão na descrição da nota", ou seja: use SQQ8F87, QWQ1D76 e
  SQR1C93. **A palavra dele passa por cima do MC**, e a nota é explícita.

## As quatro Hilux do MC são menos que quatro carros

Ele respondeu `Hilux CHLSTM4FD QWQ-3H97 - 01` para o `4432` e o `0949` (que o MC
chama de **"Hilux Apoio - 203"**) **e** para o `1905` (que o MC chama de
**"Hilux de Apoio - Cinza - 209"**). Então esses dois nomes do MC são o mesmo
carro no ERP.

O `2686` ficou em branco na planilha e eu ia inferir o mesmo QWQ-3H97, porque o
MC também o põe em "Apoio Cinza 209". Perguntei, e ele respondeu **CS-01**, ou
seja o Caminhão Cavalo 2644 S/33 MZO-2987 - 01.

Vale registrar a tensão: a nota do 2686 diz "alinhamento e balanceamento HILUX
CINZA", e o MC concorda que é a Hilux. A resposta dele manda para o cavalo. Ele
e o dono da frota e a palavra dele vale, mas fica anotado que os dois documentos
dizem outra coisa -- se for erro de digitação são R$ 120,00 e um UPDATE.

Foi exatamente por isso que eu marquei essa linha como inferência em vez de
aplicar calado: a inferência estava errada.

A aba Hilux ficou em branco, mas as respostas linha a linha a tornaram
desnecessária.

## R$ 480 que não têm onde cair

Três fatias do rateio do MC apontam para máquina que não existe no cadastro do
ERP:

| onde o MC põe | valor | de qual lançamento |
|---|---|---|
| 501 Motor Compactador de Solo | 210,00 | 2946 |
| 502 Motor Compactador de Solo | 210,00 | 2946 |
| Carga Semi-Reboque/Prancha - 104 | 20,00 | 4307 |
| Skidy | 40,00 | 0793 |

Total R$ 480,00. Vou deixar essas fatias na raiz e reportar, em vez de escolher
uma máquina por conta própria. Se ele quiser, cadastro as quatro ou joga na
Oficina.

## Ids que eu ainda preciso buscar quando o MCP voltar

Já tenho todos os das etapas da Manutenção e os das obras 009, 002 e da Amazônia.
Faltam: `Escritório Central`, `003 - Recuperação do Ramal do Gama`,
`007 - AC 405 - Lote 2`, `Lubrificante`, `Casa James > Outros`,
`011 - CONSTRUÇÃO DE ESCOLA ... > ADMINISTRACAO LOCAL`, e as três etapas de
`Aquisição de Equipamentos` (Vibro AF4500 - 01, Rolo Chapa CB10 - 01,
Rolo de Pneu CW34 - 01).
