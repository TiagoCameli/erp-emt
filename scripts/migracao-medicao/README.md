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
- **Ajustes:** o staging carrega os 2.450 pares (item, medição) inteiros: 245 serviços ×
  10 medições, inclusive os com quantidade zero, para a conferência linha a linha da
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

## Task 2: preparo e carregador do staging

Migration `supabase/migrations/20260926192737_mc_fase2_preparo_carga_l09.sql` (aplicada em
produção): cria `legado.carga_mc_l09 (secao text, parte int, dados jsonb, carregado_em,
pk (secao, parte))`, RLS ligada, sem policy, `revoke all` de `public, anon,
authenticated`, e a função `legado.fn_staging_mc_l09(p_secao text) returns setof jsonb`
(sem grant: só `postgres`/MCP a usam). Mesmo molde da Fase 3/4
(`20260925120000_fase34_preparo_carga.sql`). O advisor de segurança acusa "RLS enabled,
no policies" para essa tabela, esperado (mesmo aviso das outras tabelas de staging:
`carga_fase2d`, `carga_fase34`).

`carregar_staging_lote09.py` lê `_retrato/staging_l09.json` e `_retrato/esperado_l09.json`
(Task 1), monta lotes de ~35 KB por seção (`contrato`, `linhas`, `medicoes`,
`quantidades`, `esperado`; `contrato` e `esperado` entram como lista de um elemento, para
a função devolver uma linha) como arquivos `_retrato/staging_l09_NNN.sql`, e
apaga-e-regrava `legado.carga_mc_l09` (idempotente):

```
python3 scripts/migracao-medicao/carregar_staging_lote09.py
```

Dois caminhos, os dois documentados aqui:

- **Caminho principal (usado nesta carga):** `supabase db query --linked`, no projeto
  linkado deste repositório (`supabase/.temp/project-ref`). O script recusa seguir se o
  ref linkado não for o ERP (`vsesgvqjgqpapoxhnbqx`) e para sem tocar em nada.
- **Caminho alternativo:** se o CLI não estiver linkado (ou não estiver logado) nesta
  máquina, o script só gera os arquivos `_retrato/staging_l09_NNN.sql` e para, sem tentar
  logar. Quem estiver rodando aplica cada arquivo, na ordem, pelo MCP
  (`mcp__plugin_supabase_supabase__execute_sql`, o conteúdo do arquivo como `query`, uma
  chamada por lote) e confere as contagens do mesmo jeito.

Conferência (pelo MCP `execute_sql`, os dois caminhos): contagem por seção
(`select secao, count(*) from legado.carga_mc_l09, jsonb_array_elements(dados) group by
secao`: 1 contrato, 265 linhas, 10 medições, 2.450 quantidades, 1 esperado) e um valor de
ponta (`02.07.04` com preço `580.8643`).

## Conferência do export (Fase 3, Task 8)

`conferir_export_lote09.py` compara, célula a célula, o xlsx do boletim que o app exporta
(aba "Boletim") com a planilha oficial do Lote 09 (aba "Planilha de Medição", recusada se o
sha256 não for o combinado). Não corrige nada: toda diferença sai no relatório, separada em
explicada (decisão já tomada pelo Tiago) e não explicada. Sai com 1 se houver qualquer
diferença não explicada.

Passo a passo (só leitura no banco; a transação termina em `rollback`):

```
# 1. jsonb da RPC como o Tiago, pelo CLI linkado
cat > scripts/migracao-medicao/_retrato/boletim_l09.sql <<'SQL'
begin;
set local role authenticated;
set local request.jwt.claims = '{"sub":"c66fca9f-5428-4fb9-855f-dcff548764df","role":"authenticated"}';
select public.fn_mc_boletim('c4109738-9af7-4ddb-8982-3b2c79fe6e43');
rollback;
SQL
supabase db query --linked -f scripts/migracao-medicao/_retrato/boletim_l09.sql \
  > scripts/migracao-medicao/_retrato/boletim_l09_cli.out
python3 -c "import json; d=json.load(open('scripts/migracao-medicao/_retrato/boletim_l09_cli.out')); \
json.dump(d['rows'][0]['fn_mc_boletim'], open('scripts/migracao-medicao/_retrato/boletim_l09.json','w'), ensure_ascii=False)"

# 2. xlsx pelo mesmo código do botão "Exportar Excel"
MC_BOLETIM_JSON=$PWD/scripts/migracao-medicao/_retrato/boletim_l09.json \
MC_BOLETIM_XLSX=$PWD/scripts/migracao-medicao/_retrato/boletim_l09.xlsx \
  npx vitest run src/modules/medicao/boletim/exportar-local.test.ts

# 3. conferência (relatório em _retrato/conferencia_export.txt)
python3 scripts/migracao-medicao/conferir_export_lote09.py \
  ~/Downloads/Medicao_Teste_3_ATUALIZADA_v12_NOVO.xlsx \
  scripts/migracao-medicao/_retrato/boletim_l09.xlsx
```

Como casa: linha oficial r com a linha exportada de mesma ordem (dados da 15 até a linha do
rótulo "Total:", que na oficial fica na coluna G; no export, do cabeçalho "Item" até
"Total:" na coluna A). Colunas do export achadas pelo texto do cabeçalho; N (até a Nª) vem do
cabeçalho da coluna AS da oficial. Números sempre por `Decimal(repr(v))`, oficial lida com
`data_only=True`.

| Campo | Regra |
|---|---|
| B código | texto igual |
| C descrição, E unidade | iguais depois de aparadas |
| F preço, G qtd prevista, 1ª..Nª | o mesmo double; vazio = 0 = vazio |
| (N+1)ª..36ª da oficial | vazio ou zero |
| H previsto, valor na Nª, AT acumulado | `round_half_up(oficial, 2) == exportado` |
| AU, AW (%) | `abs(oficial - exportado) < 0.00005` |
| AV saldo | exportado `== round(H,2) - round(AT,2)` da oficial; diferença contra o AV oficial é explicada |

Diferenças explicadas: `codigo_dope` (linha 20, `02.02` virou `02.02.01`), `saldo_trunc`
(conta direta contra `TRUNC(H-AT,3)`; no total 207.385.821,72 contra ,63), `qtd_prevista_vazia`
(03.16.x vazio = 0), `unidade_aparada` (`'un '`), `pct_previsto_zero` (`#DIV/0!` na oficial,
vazio no export, quando o previsto é zero) e `subtitulo_em_branco` (subtítulo, título abaixo
do nível 1, com a célula vazia na oficial: só é explicada se o valor exportado bater com o
recalculado da própria oficial, isto é, H, AS e AT = `round_half_up` da soma das linhas de
serviço da subárvore, cada linha com preço uma vez e títulos fora; AV = round(H) - round(AT)
desses; AU e AW a menos de 0.00005 da razão desses, nulos com previsto zero; subárvore pelas
linhas seguintes com o código do subtítulo + ".", linha 20 como `02.02.01`). Célula
preenchida na oficial num subtítulo (o AS102 = 0 de uma fórmula solta) segue a regra normal
e, se diferir, sai como não explicada com a soma recalculada no motivo. Exceção estreita,
`formula_servico_em_titulo`: célula de título (sem preço e sem unidade também no export) que
na oficial tem uma fórmula de serviço sobre o `F`/`$F` da própria linha, com esse F vazio (o
AS102 = 0 do 02.10, `=$F102*HLOOKUP(...)`); só é explicada se o valor exportado passar na
mesma verificação do subtotal recalculado da subárvore. A fórmula é lida numa segunda carga
com `data_only=False`, e cada célula assim aparece listada no relatório. Qualquer outra
diferença é não explicada.

Os avisos inofensivos do openpyxl ("Data Validation extension" da oficial e "DrawingML" da
logo do export) são calados só por essas mensagens.

Testes (arquivos mínimos montados em `tempfile`, não precisam da planilha oficial; pulam só
sem openpyxl):

```
python3 -m unittest scripts/migracao-medicao/test_conferir_export_lote09.py -v
```

Mutação: para provar que o conferidor acusa, editar o XML de uma célula do xlsx exportado
(não reabrir e salvar pelo openpyxl: ele regrava os doubles com menos dígitos e gera ruído
em outras células), rodar a conferência e regenerar o xlsx pelo passo 2.
