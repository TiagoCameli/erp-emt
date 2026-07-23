# Condições de pagamento estruturadas + vencimento no recebimento — Design

Data: 2026-07-22
Status: aprovado (design), pendente de plano de implementação
Autor: Léo (com Tiago)

## Problema

Vindo do QA do fluxo cotação → OC (2026-07-22):

- **Condição de pagamento não grava** (item 2). Hoje é texto livre (`condicoes_pagamento.descricao`, sem prazo estruturado). O "30 dias" que aparece no form é placeholder; se o usuário não escolhe, salva `null` na OC e na cotação.
- **Vencimento não é calculado** (item 2b). O lançamento nasce PREVISTO sem vencimento (por design da Fase 2) e só firmaria no recebimento — mas **não existe tela/ação de recebimento no app** (confirmado: rotas de Compras são só Ordens e Cotações; `fn_registrar_recebimento` está no banco, nada no front chama). Resultado: o previsto fica "Vence em -" pra sempre.
- **Trilha da OC suja** (item 3). `criarOrdem` insere o cabeçalho (total 0, calculado por trigger) e depois os itens em chamada separada; o trigger recalcula o total → a auditoria registra "criado (total 0)" + "editado (0 → 3680)".

## Objetivo

Condições de pagamento **estruturadas** (com parcelas: prazo em dias + percentual), que dirigem a geração das parcelas do contas a pagar quando o recebimento da NF é registrado **dentro da própria OC**. As datas das parcelas vêm pré-preenchidas pela condição e são ajustáveis na tela de Lançamentos existente. E a criação da OC vira transacional (trilha limpa).

Escopo: fluxo de **compras → contas a pagar**. Não toca contas a receber (medição).

## Decisões (fechadas com o Tiago)

1. **Condição parcelada.** Uma condição tem 1..N parcelas; cada parcela tem `dias_offset` e `percentual`. Soma dos percentuais = 100. "À vista" = 1 parcela (0 dias, 100%).
2. **Percentual por parcela** (não divisão igual automática) — cobre entrada + saldo desigual, comum em obra.
3. **Base do prazo = data da NF (recebimento).** Vencimento da parcela = data do recebimento + `dias_offset`.
4. **Cadastro dedicado** "Condições de pagamento" (em Cadastros) para criar/editar condição + parcelas. OC e cotação **escolhem uma condição pronta por id** (FK), não digitam texto.
5. **Recebimento é ação na própria OC** (não tela nova): dialog com nº da NF, valor da NF, data do recebimento. Ao confirmar, gera o lançamento a_pagar + as parcelas da condição.
6. **Vencimento pré-preenchido, editável no lançamento.** As parcelas nascem com vencimento sugerido (data NF + dias) e valor (valor NF × %); o ajuste fino das datas é na tela de Lançamentos, que já tem o editor de parcelas.
7. **Condição obrigatória na OC** (sempre há um termo, mesmo "à vista") — resolve o item 2a.
8. **Criação da OC transacional** (item 3): `fn_criar_ordem_compra` faz cabeçalho + itens + total numa transação; trilha registra um "criado" com o total certo.

## Modelo de dados

### `condicoes_pagamento` (existe)
Mantém `id`, `descricao` (rótulo, ex.: "Entrada 50% + 30 dias", "30/60/90"), `ativo`, `created_at`, `created_by`. A descrição passa a ser só o nome amigável; a estrutura vive nas parcelas.

### `condicao_parcelas` (nova)
- `id uuid pk`, `condicao_id uuid` FK → condicoes_pagamento (on delete cascade), `numero int`, `dias_offset int not null check (>= 0)`, `percentual numeric(5,2) not null check (> 0 and <= 100)`, `created_at`.
- Invariante: soma dos `percentual` por `condicao_id` = 100.00. Validado na função transacional que salva a condição (delete+insert das parcelas numa transação, padrão `salvar_*` do projeto) e/ou trigger de verificação.
- RLS + grants explícitos (select/insert/update/delete conforme permissão de `cadastros.condicoes-pagamento`) + auditoria.

### FK nas transações
- `ordens_compra`: substitui o texto `condicao_pagamento` por `condicao_pagamento_id uuid not null` FK → condicoes_pagamento.
- `cotacao_fornecedores`: substitui `condicao_pagamento` (texto) por `condicao_pagamento_id uuid` FK (nullable — cotação é rascunho de negociação).
- **Migração de dados:** para cada `descricao` distinta já usada, garantir uma condição estruturada (as semeadas "À vista", "7/15/21/28/30 dias" viram 1 parcela: dias = número parseado da descrição, % = 100; "À vista" = 0 dias). OCs/cotações existentes com texto apontam para a condição de mesma descrição. Textos livres antigos sem match viram condição 1-parcela pelo número achado, ou "À vista" se não houver número (registrar no log da migração).

## Cadastro de Condições de pagamento (UI)

- Recurso `cadastros.condicoes-pagamento` em `config/recursos.ts` (ações ver/criar/editar/excluir), com seed de permissão pros perfis que já veem Cadastros.
- Rota `/(app)/cadastros/condicoes-pagamento` com `loading.tsx` (padrão novo), DataTable (descrição, nº de parcelas, resumo tipo "30/60/90", ativo) e FormDrawer (tela cheia, padrão canônico).
- Form: `descricao` + editor de parcelas usando a `TabelaItens` canônica (colunas: nº, dias, %), com validação client (soma = 100, sem duplicar dias) espelhada no server (Zod) e no banco (função transacional). Segue RHF + Zod, actions com checagem de permissão.
- O `ComboboxCriavel` de condição no form da OC/cotação vira `Combobox` (seleção por id) das condições ativas. Criar condição nova é no cadastro (não inline).

## Recebimento (ação na OC)

- Na `ordem-detalhe`, botão "Registrar recebimento" (aparece com a OC aprovada e permissão), abrindo um dialog canônico: nº da NF, valor da NF, data do recebimento (default hoje, America/Rio_Branco). (Anexo da NF via Storage fica como folga conhecida se não for trivial reaproveitar o padrão de anexos.)
- Server Action chama a função de recebimento (evoluir a `fn_registrar_recebimento` existente): confirma o lançamento previsto da OC para `a_pagar`, e **gera as parcelas** a partir da condição da OC: para cada parcela da condição, `data_vencimento = data_recebimento + dias_offset` e `valor = round(valor_nf × percentual/100, 2)`, com a última parcela absorvendo o centavo de arredondamento para somar exatamente `valor_nf`. Transição de status e auditoria conforme o padrão.
- Divergência NF × OC continua usando a config `tolerancia_divergencia_nf_percentual` (já semeada), como o desenho da Fase 2 previa.

## Ajuste das datas no Lançamento

- O lançamento a_pagar gerado (origem 'oc') aparece em Financeiro › Lançamentos com suas parcelas. O usuário ajusta/confirma os vencimentos no editor de parcelas que já existe (Task 8 da padronização). Regra de edição segue a do módulo (parcela pendente é editável; aprovada/paga não).

## Item 3: criação transacional da OC

- `fn_criar_ordem_compra(p_cabecalho jsonb, p_itens jsonb)` (security definer, checagem de permissão): insere o cabeçalho (com `condicao_pagamento_id`), insere os itens e calcula o `valor_total` na mesma transação, devolvendo o id. `criarOrdem` (action) passa a chamar a RPC em vez dos dois inserts. A auditoria passa a registrar um único "criado" com o total final (ajustar a ordem para o total nunca passar por zero — computar antes do insert final, ou gravar itens e total antes de o trigger de auditoria do cabeçalho disparar; detalhar no plano após ler o trigger de auditoria e o de valor_total).

## Testes e definição de pronto

- Vitest: cálculo das parcelas (split por % com ajuste de centavo somando exato; datas = base + dias), validação da condição (soma 100, sem dias duplicados), parse da migração ("30 dias" → 30, "À vista" → 0).
- RLS testada nas tabelas novas (usuário sem `cadastros.condicoes-pagamento` não vê/muta).
- Advisors do Supabase (security + performance) após cada migration; corrigir o que aparecer.
- `typecheck`, `lint`, `build` verdes; testes existentes verdes.
- Trilha da OC: um "criado" com total certo (verificar no audit_log em banco).
- Fluxo ponta a ponta em banco: criar condição 30/60/90 → OC com ela → aprovar (previsto) → registrar recebimento (NF, valor, data) → 3 parcelas a_pagar com vencimentos e valores certos, soma = valor NF.

## Assunções e fora de escopo (v1)

- **Uma NF por OC** (recebimento único que confirma a OC). Recebimento parcial / várias NFs por OC fica como folga conhecida.
- **Contas a receber (medição) não muda.**
- Anexo da NF no recebimento entra só se reaproveitar o padrão de anexos existente sem custo alto; senão, folga conhecida (metadados primeiro).
- Cotação: a condição por fornecedor é opcional (rascunho); só a OC exige.

## Riscos

- **Migração destrutiva** (troca de coluna texto → FK em `ordens_compra`/`cotacao_fornecedores`, projeto Supabase único e vivo). Antes de aplicar: script de fix + rollback, e mapear todo texto existente para uma condição antes de dropar a coluna. Nenhuma OC pode ficar sem condição.
- **Evoluir `fn_registrar_recebimento`**: ler a definição real no banco (pode divergir do .sql do repo) antes de alterar.
- **Arredondamento das parcelas**: dinheiro NUMERIC(14,2), soma exata garantida pela última parcela; testar em banco.
- **Item 3 e triggers**: entender o trigger de auditoria e o de valor_total antes de montar a RPC, pra a trilha sair limpa sem quebrar o cálculo.
