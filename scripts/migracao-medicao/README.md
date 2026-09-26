# Carga do Lote 09 (Medição de Contratos, Fase 2)

Carrega no módulo "Medição de Contratos" o contrato do Lote 09 (CT 00615/2025, DNIT) com
a planilha contratual v0 e as 10 medições aprovadas, conferindo contra a planilha oficial
até o centavo.

Plano completo: `docs/superpowers/plans/2026-09-26-medicao-contratos-fase2-carga-lote09.md`.
Spec do módulo: `docs/superpowers/specs/2026-09-25-medicao-contratos-design.md` (seção 10).

## Task 1: `gerar_carga_lote09.py`

Lê a planilha oficial (`Medicao_Teste_3_ATUALIZADA_v12_NOVO.xlsx`, aba "Planilha de
Medição") e gera, fora do git:

```
_retrato/staging_l09.json   # contrato, linhas (265), medições (10), quantidades (2.450)
_retrato/esperado_l09.json  # contagens, grupos, totais, preços e quantidades por linha
```

Uso:

```
python3 scripts/migracao-medicao/gerar_carga_lote09.py [caminho_do_xlsx]
```

Sem argumento, usa a cópia local de trabalho (constante `XLSX_PADRAO` no script). O
script recusa qualquer arquivo cujo sha256 não seja o combinado com o Tiago.

### Decisões da extração (26/09/2026)

- **Regra de arredondamento: `sem_arredondar`.** Soma exata em Decimal por item e por
  grupo; só arredonda em 2 casas na saída de cada grupo e do total. Por isso o total pode
  diferir em 1 centavo da soma dos grupos já arredondados (o total sai do arredondamento
  da soma exata de todos os serviços, não da soma dos grupos).
- **Linha 20 (DOPE)** repete no xlsx o código `02.02` da linha 19: entra como
  `02.02.01`, renomeada antes de montar a hierarquia. A observação do contrato registra a
  troca.
- **Hierarquia (pai_ordem):** o pai de cada linha é a linha anterior de maior prefixo do
  código (pilha por segmentos separados por `.`), não necessariamente um título: `02.02.01`
  e `02.02.02` são filhos de `02.02` (um serviço, "Usinagem de concreto asfáltico"), não do
  título `02`.
- **Linhas 184 a 199** (`03.16.01` a `03.16.09`, ocultas no xlsx): preço preenchido,
  quantidade prevista vazia. Vazio em serviço vira quantidade prevista `"0"`.
- **Unidade `'un '`** (linhas 100 e 101): gravada aparada (`"un"`).
- **Grupo 08** (linha 278) tem preço 0 e é título mesmo assim (código de 2 dígitos, sem
  quantidade prevista).
- **Saldo = previsto − acumulado** pela conta direta (o módulo não trunca por item como a
  planilha faz na coluna AV).
- **Ajustes:** o staging carrega os 2.450 pares (item, medição) inteiros — 245 serviços ×
  10 medições, inclusive os com quantidade zero — para a conferência linha a linha da
  Task 3. Quem filtra é o carregador: só grava em `mc_ajustes` os 255 pares com
  quantidade diferente de zero (regra do banco: `mc_ajustes.quantidade <> 0`).
- **Contrato e períodos** não vêm da planilha: vêm do vault (`business/lote09-br364`) e do
  PDF do contrato (SEI 22563019), decididos pelo Tiago em 26/09/2026. Ver o dicionário
  `CONTRATO` e a lista `MEDICOES` no topo do script.
- Números sempre por `Decimal` a partir de `repr(float(célula))`, no mesmo formato do
  importador do app (`src/modules/medicao/planilha/leitor.ts`, `numeroParaTexto`): um
  float inteiro sai como `"36"`, não `"36.0"`. Recusa notação científica. A soma e a
  multiplicação da regra `sem_arredondar` rodam sob precisão alta (100 dígitos) com o
  trap de `Inexact` ligado: qualquer perda de precisão levanta exceção em vez de passar
  batida; o arredondamento em 2 casas (grupo e total) é deliberado e fica fora desse
  context.

### Testes

`test_gerar_carga_lote09.py` roda com a cópia local do xlsx (env var `L09_XLSX`, com a
cópia de trabalho como default). Se o arquivo não existir (caso do CI, que não tem a
planilha) ou se `openpyxl` não estiver instalado, os testes são pulados, não falham nem
quebram a coleta.

```
python3 -m unittest scripts/migracao-medicao/test_gerar_carga_lote09.py -v
# ou, se houver pytest:
python3 -m pytest scripts/migracao-medicao/test_gerar_carga_lote09.py -v
```

Confere: hash do xlsx; contagens (265 linhas, 20 títulos, 245 serviços, 10 medições); a
linha do DOPE (`02.02.01`); preço e quantidade de `02.07.04` e `01.01`; a 9ª medição de
`01.01`; a hierarquia por maior prefixo; os 8 grupos e os totais (previsto
243.927.483,49; acumulado 36.541.661,77; 10ª 680.738,27; saldo 207.385.821,72).
