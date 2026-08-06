# Definir a conta bancária de vários lançamentos de uma vez

Data: 2026-08-06
Recurso afetado: `financeiro.lancamentos`
Módulo: `src/modules/financeiro/lancamentos`, `src/components/canonicos/data-table.tsx`

## Problema

A carga do Mais Controle (27/06) trouxe 7.964 lançamentos **sem conta bancária**. A conta é o portão da aprovação: parcela sem conta não entra na fila de pagamento (`fn_aplicar_regra_pagamento`, e a query da fila em `aprovacao-pagamentos/queries.ts` ignora parcela sem conta).

Hoje o único caminho para definir a conta é abrir o **detalhe** de um lançamento e escolher no seletor. Uma tela, um lançamento, um toast de confirmação. Com centenas de itens no filtro "Não revisado", o Tiago repete isso centenas de vezes, e foi esse atrito que ele reportou (junto de "esses toasts têm que ficar menos tempo na tela", que é sintoma da mesma repetição).

## Objetivo

Selecionar vários lançamentos na listagem e definir a conta bancária **de todos numa ação**, sem inventar regra de negócio nova e sem nunca desfazer escolha que alguém já fez.

## O que já existe e vai ser reusado inteiro

`fn_definir_conta_lancamento(p_lanc_id, p_conta_id)`, migration `20260730210001_conta_bancaria_portao_da_aprovacao.sql`:

- exige `tem_permissao('financeiro.lancamentos', 'editar')`;
- recusa conta inexistente ou **inativa**;
- grava em toda parcela do lançamento com `status <> 'pago'` (parcela paga nunca é tocada);
- chama `fn_aplicar_regra_pagamento(p_lanc_id)` no fim, porque escolher a conta pode ser justamente o que libera dinheiro e cartão a andar.

A regra do negócio está aí. O lote **não** reimplementa nada disso.

## Fatos do domínio que moldam o desenho

1. **A conta mora em `lancamento_parcelas`, não em `lancamentos`.** Um lançamento com 3 parcelas tem 3 lugares para gravar. "A conta do lançamento" é uma abstração: o código de hoje lê a primeira parcela não paga e assume que vale para todas.
2. **"Revisão" é estado derivado, não campo.** `sem_conta` (nenhuma parcela pendente tem conta), `parcial` (algumas têm), `revisado` (todas têm), e `nao_revisado` é o complemento de `revisado`. Consequência: **definir a conta já vira o badge sozinho.** Não existe nem precisa existir um passo "marcar como revisado".
3. **O `DataTable` canônico não tem seleção de linha.** Nenhuma das 49 abas tem checkbox. É a peça nova de verdade.

## Decisões

### 1. Seleção por checkbox E "todos do filtro", nesta ordem (decisão do Tiago)

Checkbox por linha, checkbox de cabeçalho que marca a página, mais um "selecionar os N do filtro" quando o filtro achou mais do que a página mostra. Marcar a dedo serve para conferir; o "todos do filtro" resolve o dia.

### 2. O lote só PREENCHE VAZIO. Nunca sobrescreve (decisão do Tiago)

Lançamento que já tem conta em todas as parcelas pendentes é **pulado**, e aparece contado na confirmação. Para trocar conta já definida o caminho continua sendo o detalhe, um por um.

**Lançamento `parcial` é completado**, gravando só nas parcelas vazias e deixando intactas as que já têm conta. `parcial` é um estado quebrado (a conta deveria ser a mesma para todas as pendentes), e completar respeita as duas coisas: conserta a anomalia e não desfaz escolha de ninguém.

### 3. A ação recebe IDS, não o filtro

Mandar "aplique no filtro X" e deixar o servidor recalcular seria atômico, mas abre a porta para um lançamento criado entre o clique e a execução entrar de carona. Com ids, **o que o usuário viu é o que muda**.

Custo aceito: lista de ids envelhece se a tela ficar aberta. O resultado então informa quantos não foram encontrados, em vez de fingir sucesso. 500 uuids são ~18 KB de corpo, não é problema.

### 4. Teto de 500 lançamentos por chamada

Acima disso a confirmação manda dividir. Sem teto, um clique vira `update` em milhares de parcelas dentro de uma transação, segurando lock numa tabela que o resto da empresa está usando.

## Arquitetura

### Banco: migration nova

```sql
create or replace function public.fn_definir_conta_lancamentos_lote(
  p_lanc_ids uuid[],
  p_conta_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path to ''
```

Contrato:

- **Permissão**: `tem_permissao('financeiro.lancamentos', 'editar')`, igual à irmã. Sem permissão, `raise exception`.
- **Teto**: mais de 500 ids, `raise exception`.
- **Conta**: precisa existir e estar `ativo`, mesma checagem da irmã.
- **Elegibilidade**: para cada id, o lançamento entra se tiver **ao menos uma parcela `status <> 'pago'` com `conta_bancaria_id is null`**. Os outros são classificados e contados.
- **Escrita**: `update lancamento_parcelas set conta_bancaria_id = p_conta_id where lancamento_id = any(...) and status <> 'pago' and conta_bancaria_id is null`. O `is null` no `where` é o que garante a decisão 2 no nível da parcela, e não só do lançamento.
- **Regra de pagamento**: `perform fn_aplicar_regra_pagamento(id)` para cada lançamento efetivamente alterado. Não pode ser pulado: é o que faz dinheiro e cartão andarem.
- **Tudo numa transação.** Função plpgsql já é atômica: ou todos os elegíveis recebem, ou nenhum.

Retorno em `jsonb`, para a tela contar a verdade sem uma segunda consulta:

```json
{
  "definidos": 275,
  "pulados_com_conta": 12,
  "pulados_sem_parcela_pendente": 3,
  "nao_encontrados": 0
}
```

Grants: `revoke all ... from public`, `grant execute ... to authenticated`.

### Server Action

`definirContaLancamentosLote(ids: string[], contaId: string)` em `src/modules/financeiro/lancamentos/actions.ts`:

- valida cada id com `idSchema` (o canônico de `lib/id.ts`, que aceita o id de md5 da carga da BR-364);
- recusa lista vazia e lista acima de 500 **antes** de ir ao banco;
- chama a RPC, devolve `{ ok: true, resumo }` ou `{ erro }`, no contrato das actions do módulo;
- `revalidatePath` da listagem **e** de `/financeiro/aprovacao-pagamentos`, porque definir conta muda a fila de aprovação.

### DataTable: seleção opt-in

Prop nova, opcional:

```ts
selecao?: {
  /** Chave estável da linha. */
  idDaLinha: (linha: T) => string;
  selecionados: string[];
  onSelecionadosChange: (ids: string[]) => void;
  /** Desabilita o checkbox de certas linhas. Genérica; ver a nota abaixo. */
  habilitada?: (linha: T) => boolean;
};
```

Ausente, o DataTable se comporta exatamente como hoje: **as outras 48 abas não mudam**. Componente canônico que muda para todo mundo de uma vez é como se estraga 49 telas de uma vez.

**Nesta tela o checkbox fica habilitado em TODA linha, e `habilitada` não é usada.** Existe na prop canônica para quem precisar depois. O motivo de não usar aqui: desabilitar checkbox de lançamento já revisado viraria charada ("por que não consigo marcar esta linha?"), e ainda erraria o caso `parcial`, que parece revisado de relance e **é** elegível. Quem diz o que entrou e o que foi pulado é a confirmação antes e o resumo depois, não um checkbox cinza sem explicação.

O estado da seleção vive na tela (`lancamentos-tabela.tsx`), não no DataTable: quem sabe o que é elegível e o que fazer com a seleção é a tela.

### Tela

- **Barra de lote**, visível só com seleção: "N selecionados", botão "Definir conta bancária", e um "limpar seleção".
- **"Selecionar os N do filtro"**: aparece quando o total do filtro é maior que a página. Busca os ids do conjunto filtrado por uma query dedicada (`buscarIdsFiltrados`), que devolve **só ids** e respeita o teto de 500.
- **Confirmação** (`ConfirmDialog` canônico) mostrando, antes de gravar: quantos recebem, quantos são pulados e por quê, o **nome da conta** escolhida e o **valor total** dos que vão receber. É o que dá chance de perceber "R$ 4,2 milhões não era o que eu queria" antes, não depois.
- **Depois de gravar**: um toast com o resumo real ("Conta definida em 275 lançamentos, 12 pulados"), seleção limpa, `router.refresh()`.

## Erros

| Situação | Comportamento |
|---|---|
| Sem permissão | `{ erro }` da action, toast de erro, nada gravado |
| Conta inativa ou inexistente | `raise exception` na função, nada gravado |
| Lista vazia | Botão desabilitado; a action recusa também, por segurança |
| Acima de 500 | Confirmação manda dividir; a action recusa antes do banco |
| Id que não existe mais | Contado em `nao_encontrados` e informado no toast |
| Nenhum elegível na seleção | Não chama o banco; avisa "todos já têm conta" |
| Falha no meio | Transação inteira desfeita: ou todos os elegíveis, ou nenhum |

## Testes

**Vitest, regra pura** (`lancamentos/calculo` ou vizinho): classificação de elegibilidade a partir de parcelas (só paga, só vazia, mista/`parcial`, todas com conta), teto de 500, lista vazia, e a montagem do resumo em texto.

**Vitest, componente**: checkbox marca e desmarca; cabeçalho marca a página; linha inelegível não ganha checkbox; barra de lote só aparece com seleção; confirmação mostra contagem, conta e valor; DataTable **sem** a prop `selecao` não renderiza coluna nenhuma nova (a garantia das outras 48 abas).

**Prova em banco** (`supabase/provas/`, padrão do projeto): num `begin ... rollback`, provar que parcela paga não é tocada; que parcela com conta não é sobrescrita; que `parcial` é completado só nas vazias; que o lançamento já revisado não entra; que a fila de aprovação passa a ver as parcelas depois do lote; e que sem permissão a função estoura.

## Fora de escopo (explícito)

- Desfazer o lote.
- Aplicar conta **diferente** por linha na mesma ação.
- Trocar conta já definida em lote (continua um por um no detalhe).
- Agendar ou programar pagamento junto.
- Levar a seleção para as outras 48 listagens. A prop nasce opt-in; espalhar é decisão futura, com pedido de quem usa.

## Companheiro: duração do toast

Trabalho separado, PR separado, citado aqui porque nasceu do mesmo relato.

O `Toaster` é montado uma vez em `src/app/layout.tsx` sem `duration`, então vale o padrão do sonner (4 s). O sonner **não** tem duração por tipo, só global, e são 135 `toast.success` contra 152 `toast.error` em 97 arquivos. Encurtar global encurtaria o tempo de leitura de erro, e erro em app de dinheiro pede mais tempo, não menos.

Desenho: um módulo canônico `src/components/canonicos/toast.ts` que reexporta o `toast` do sonner com duração padrão por tipo (sucesso e info curtos, erro no atual ou mais longo), e um codemod trocando o import nos 97 arquivos. Um lugar para sempre, em vez de 300 chamadas com número na mão. `src/components/ui/sonner.tsx` **não** é editado: é arquivo shadcn, e o `CLAUDE.md` proíbe mexer na mão.
