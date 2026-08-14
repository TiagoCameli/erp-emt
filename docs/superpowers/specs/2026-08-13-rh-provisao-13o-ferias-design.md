# Provisão mensal de 13º e férias na folha (Bloco 8b) — Design

Data: 2026-08-13
Status: rascunho (design), pendente de revisão do Tiago
Autor: Léo (com Tiago)

## Problema

Hoje o custo de mão de obra que a folha reporta é `salário + encargos`. O 13º e as férias
existem e vão ser pagos, mas não aparecem em nenhum mês até o mês do pagamento. Consequência:
o custo por obra fica subestimado onze meses por ano e estoura em dezembro, o que torna
inútil comparar o custo mensal de uma obra com a medição dela.

Gap #5 do QA do RH de 23/07/2026, decomposto em quatro entregas na spec do Bloco 8a. Esta é a
**segunda**: 8a (a folha vira conta a pagar) já está em produção, e 8c (folha de 13º) e 8d
(recibo de férias) vêm depois, dependendo de regras trabalhistas que o Tiago fornece.

## Decisões fechadas com o Tiago

1. **A provisão entra no `custo_total` e não gera lançamento.** É o ponto da provisão: o custo do
   mês reflete o desembolso futuro, mas nada sai do caixa agora.
2. **Provisiona principal mais encargos.** Quando o 13º for pago, a empresa paga também INSS
   patronal e FGTS sobre ele; provisionar só o principal deixaria o custo mensal subestimado e
   dezembro ainda com degrau.
3. **Os percentuais são cadastrados pelo Tiago**, no mesmo padrão dos encargos. Sem seed de
   valor: config vazia significa provisão zero.

## Design

### 1. Modelo

**Tabela nova `folha_provisoes`** (`nome`, `percentual`, `ativo`, mais os campos de auditoria do
padrão da casa), espelhando `folha_encargos`: RLS, policies sob `rh.encargos`, soft delete via
`fn_excluir_cadastro`, sem DML para `anon`.

**Correção que veio junto, medida durante o planejamento:** o soft delete de `folha_encargos`
**está quebrado hoje**. `fn_excluir_cadastro` resolve o recurso por `fn_recurso_do_cadastro`, e
essa função não conhece `folha_encargos` (devolve null), o que faz a exclusão levantar
`Tabela folha_encargos nao pode ser excluida por esta funcao`. O botão existe na tela, porque
`rh.encargos` tem `CRUD` no catálogo, e nunca falhou na cara de ninguém só porque não existe
encargo cadastrado em produção. Espelhar o padrão sem consertar faria a provisão nascer com o
mesmo botão quebrado, então **as duas tabelas entram no dispatcher** nesta entrega.

**Não é uma flag em `folha_encargos`, e a razão é de segurança, não de estilo.** As duas tabelas
guardariam os mesmos campos, mas têm **destinos opostos**: encargo vira guia e sai do caixa,
provisão não vira nada. A `fn_gerar_folha` itera `folha_encargos where ativo` e o total dessa
soma é exatamente o que alimenta as guias no `fn_aprovar_folha`. Com provisão na mesma tabela,
um `where tipo = 'encargo'` esquecido em qualquer ponto futuro transforma provisão em conta a
pagar. Tabela separada torna esse erro impossível em vez de improvável.

**Snapshot em `folha_item_provisoes`**: `folha_item_id`, `nome`, `percentual`,
`valor_principal`, `valor_encargos`. Escrita **só pela função definer** (`authenticated` só
SELECT, espelhando `folha_item_encargos` e `folha_guias`), leitura por `rh.folha`, trigger de
auditoria.

As duas parcelas ficam em colunas separadas porque a conferência natural é "quanto é 13º e
quanto é encargo sobre o 13º", e derivar isso depois exigiria recalcular com percentuais que
podem ter mudado.

**Dois totais**, seguindo o que já existe: `folha_itens.provisoes numeric(14,2)` e
`folhas.valor_provisoes numeric(14,2)`.

**Onde cadastrar:** seção nova em `/rh/encargos`, sob o recurso `rh.encargos` que já existe.
Nenhum recurso de permissão novo: quem tem alçada para cadastrar encargo patronal tem a mesma
para cadastrar provisão, e um recurso a mais só engorda a matriz sem separar nada.

### 2. O cálculo (DINHEIRO)

Na `fn_gerar_folha`, por colaborador, **depois** de `v_encargos` estar somado:

```
para cada provisão ativa (ordem por nome):
    principal = round(salário × percentual / 100, 2)
    encargos  = round(principal × v_pct_total / 100, 2)
    grava linha em folha_item_provisoes
    acumula em v_provisoes

custo_total = salário + v_encargos + v_provisoes
```

`v_pct_total` é a soma dos percentuais de encargos ativos, **variável que já existe na função**
(hoje alimenta o campo informativo `folhas.encargos_percentual`). A provisão usa exatamente a
mesma base que os encargos daquele mês usaram, então não existe uma segunda definição de
"percentual de encargos" para divergir.

**Três pontos que o implementador não deve ter que adivinhar:**

- **`folha_itens.provisoes` é a soma de `valor_principal + valor_encargos` de todas as linhas de
  provisão daquele item**, e `folhas.valor_provisoes` é a soma disso na folha. Não é só o
  principal: o número tem que ser o que entrou no `custo_total`, senão os dois divergem e a
  identidade não fecha.
- **O arredondamento é por linha**, duas casas, exatamente como o Bloco 6 faz com cada encargo.
  Com duas provisões cadastradas, cada uma arredonda separado, e a soma delas pode diferir de
  arredondar um percentual composto. Isso é intencional e é o que faz `sum(linhas) ==
  folha_itens.provisoes` **por construção** — o mesmo argumento que fechou o Bloco 6.
- **Sem encargo cadastrado, `v_pct_total` é zero e a parcela de encargos da provisão é zero**,
  sem caso especial: a provisão nasce só com o principal. Isso é o estado de produção hoje.

**O líquido do colaborador não muda.** Provisão é custo do empregador: não é provento nem
desconto. `valor_liquido` continua `salário − inss − irrf − adiantamento descontado`.

**Regenerar a folha apaga e recria as linhas de provisão** junto com o resto, pelo mesmo
caminho que já limpa `folha_item_encargos` (FK em cascade a partir de `folha_itens`).

### 3. A identidade de conferência

Passa a ter quatro termos:

```
Σ líquidos + Σ guias + Σ adiantamento descontado + Σ provisões  ==  folhas.custo_total
```

Fecha pela mesma álgebra de sempre:
`Σ(salário − inss − irrf − desc) + Σ(encargos + inss + irrf) + Σ(desc) + Σ(provisões)
= Σ salário + Σ encargos + Σ provisões`.

**A provisão não é uma quarta causa de resíduo: é um termo explícito da conta.** As causas de
diferença legítima continuam três (encargo sem grupo de recolhimento, retido sem grupo, líquido
zero). Essa distinção é o que impede alguém de ver a diferença e concluir que é bug.

**O `obj_description` da `fn_aprovar_folha` e a consulta de diagnóstico gravada nele mudam na
mesma entrega.** Nesta frente isso já custou duas correções: mudar o cálculo e deixar o texto
velho faz a ferramenta de conferência mentir, e ela é o primeiro lugar onde alguém olha ao
encontrar diferença.

### 4. Telas

- **Detalhe da folha**: quebra da provisão por tipo, no mesmo padrão de disclosure que o Bloco 6
  usa para encargos, mais um resumo "Provisões por tipo". A agregação é função pura em
  `calculo.ts`, derivada dos itens já carregados — **sem leitura extra**, que é o erro que esta
  tela já cometeu uma vez.
- **A seção "Lançamentos gerados" não muda**, e ganha uma linha dizendo que a provisão é custo
  sem caixa e por isso não aparece ali. Sem esse texto, alguém compara custo com lançamentos,
  encontra a diferença e abre chamado.
- **O holerite não muda.** Provisão é custo do empregador, não provento nem desconto do
  colaborador. No holerite seria informação errada na mão de quem recebe.
- **A planilha da folha** ganha a coluna de provisão: é o arquivo que vai para o contador.

### 5. Testes

**Vitest (puro):** o cálculo do principal e dos encargos sobre ele, incluindo arredondamento em
que as duas parcelas somadas não batem com o percentual composto; e o resumo por tipo.

**Prova em banco, em transação revertida:**
- a identidade de **quatro** termos fechando no centavo, com a consulta **extraída do
  `obj_description` e executada**;
- **contagem de lançamentos idêntica antes e depois de aprovar**, que é a prova de que provisão
  não vira caixa;
- `custo_total = salário + encargos + provisões`, e `valor_liquido` **inalterado** em relação a
  antes da task;
- config de provisão vazia dando provisão zero e `custo_total` igual ao de hoje;
- regenerar a folha três vezes com resultado idêntico;
- **desativar um encargo depois da folha gerada** e confirmar que a provisão daquela folha não
  muda (é para isso que o snapshot existe);
- `folha_item_provisoes` sem DML para `authenticated`, `anon` sem nada.

**Definição de pronto:** `tsc`, lint e build limpos; advisors sem achado novo; migrations
aplicadas por MCP **e** versionadas com SQL executável igual ao ledger; a varredura
`fn_verificar_diagnosticos_gravados()` sem falha; nenhuma prova deixando resíduo em produção.

## Dependência que o Bloco 8c tem que honrar

**A provisão vai acumular sem nada consumi-la até o 8c existir.** Quando o 13º for pago de
verdade, a provisão acumulada precisa ser abatida, senão o custo conta duas vezes: uma na
provisão mensal, outra no pagamento. Isso é trabalho do 8c e está registrado aqui como
dependência, não como detalhe de implementação.

## Fora de escopo

- Relatório de saldo acumulado de provisão no ano.
- Reversão ou baixa da provisão (é 8c e 8d).
- Provisão para rescisão (multa de FGTS, aviso), que depende das regras do Bloco 9.
- Qualquer regra trabalhista de 13º ou férias: esta entrega só provisiona um percentual que o
  Tiago cadastra. O que é 1/12, o que conta como mês, e como se calcula o terço são regras que
  entram no 8c e no 8d, fornecidas por ele.

## Riscos

1. **`fn_gerar_folha` será alterada pela quinta vez.** O procedimento é o mesmo que funcionou nas
   quatro anteriores: copiar a definição viva, recriar a partir dela com `replace()` cirúrgico, e
   diffar depois esperando apenas as mudanças previstas. Os md5 atuais estão no ledger.
2. **A provisão entra no `custo_total`, que é lido pelo BI da Gestão.** O custo por obra vai
   **subir** no mês em que a config for cadastrada, sem que nada tenha piorado. Vale avisar quem
   olha esse número antes de cadastrar.
3. **O percentual de encargos usado na provisão é o do mês da geração.** Folha regerada depois de
   mudar um encargo recalcula a provisão com o percentual novo, o que é coerente com o resto da
   função (o snapshot protege a folha já gerada, não a regerada).
