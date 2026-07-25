# Tabela de salário por função (#11) — Design

Data: 2026-07-25
Status: aprovado (design), pendente de plano
Autor: Léo (com Tiago)

## Problema

Do QA do RH (gap #11): a `funcao` do colaborador é texto livre, sem salário de referência por função. Não há de onde puxar piso salarial nem CBO por cargo. Bloco 3 do programa "RH completo" (Grupo A). Amarra função → salário base → CBO e prepara o terreno pra folha/eSocial.

## Objetivo

Criar o cadastro de funções com salário base e CBO, ligar o colaborador à função por FK, e sugerir o salário ao escolher a função. Sem inventar regra fiscal (salário base é referência editável).

## Decisões (fechadas com o Tiago)

1. **Função vira FK** (`colaboradores.funcao_id` → `funcoes`), substituindo o texto livre. Migra o texto atual (~1 colaborador de teste). As queries fazem join e seguem entregando o **nome** da função pro display (ripple pequeno).
2. **Salário sugere-e-preenche editável:** ao TROCAR a função no cadastro, preenche o salário com o piso da função; editável; ao abrir um colaborador existente NÃO sobrescreve o salário guardado.
3. **CBO passa pra função** (fonte única); remove o `colaboradores.cbo` (adicionado no Bloco 2, sem dado). O CBO do colaborador é derivado da função (read-only).
4. **Piso único** por função (não faixa mín/máx) na v1.
5. Aba nova `/cadastros/funcoes`, recurso `cadastros.funcoes`, no padrão dos outros cadastros (RLS/grants/auditoria/soft delete/importação).

## Design

### 1. Tabela `funcoes` (novo cadastro)
- Colunas: `id uuid pk default gen_random_uuid()`, `nome text not null` (unique), `salario_base numeric(14,2)` (nullable — piso opcional), `cbo text`, `ativo boolean not null default true`, `created_at`/`updated_at`/`created_by` no padrão dos cadastros.
- **RLS + grants + auditoria + soft delete + importação** espelhando um cadastro simples existente (ex.: `unidades` ou `categorias`). Ler a migration/estrutura viva desse cadastro antes e replicar: policies por `cadastros.funcoes` (ver/criar/editar/excluir), grants explícitos, trigger de auditoria, e o mesmo mecanismo de exclusão dos cadastros (lixeira via `fn_excluir_cadastro`/`fn_restaurar_cadastro` se for o padrão, ou soft delete de coluna — usar o que o cadastro-modelo usa).
- Recurso `cadastros.funcoes` em `config/recursos.ts` (acoes CRUD), com seed de permissão (perfil_permissoes + sync usuario_permissoes), espelhando outro `cadastros.*`.

### 2. Ligação com `colaboradores` (expand-contract)
- **Expand:** `alter table colaboradores add column funcao_id uuid references public.funcoes(id)`. Backfill: criar `funcoes` a partir dos valores distintos de `colaboradores.funcao` (não nulos) e setar `funcao_id`. Remover a coluna `colaboradores.cbo` (nullable, sem dado — segura).
- **Transição:** o código passa a ler/gravar `funcao_id`; as queries que expõem colaborador fazem `join funcoes` e continuam devolvendo `funcao` (o nome) pro display — assim as telas de RH que só mostram a função seguem funcionando.
- **Contract:** quando todo o código usa `funcao_id`, `alter table colaboradores drop column funcao`. Feito depois que a UI/queries já migraram (última etapa do bloco).

### 3. Backend do cadastro de funções
- `src/modules/cadastros/funcoes/{schemas,queries,actions,importacao}.ts` espelhando um cadastro simples: Zod (`nome` obrigatório; `salarioBase` dinheiro opcional 2 casas — reusar o validador de dinheiro; `cbo` texto opcional; `ativo` boolean); `listarFuncoes` (ativas/todas); CRUD com `exigirPermissao("cadastros.funcoes", ...)`; importação por planilha.
- `listarFuncoesAtivas()` enxuta (id, nome, salarioBase, cbo) pro Combobox do colaborador.

### 4. Backend do colaborador (integração)
- `schemas.ts`: trocar `funcao` (texto) por `funcaoId` (uuid nullable); remover `cbo` do schema.
- `queries.ts`/`actions.ts`/`ficha.ts`: gravar/ler `funcao_id`; nas leituras, join `funcoes(nome, cbo, salario_base)` e expor `funcao` (nome, pro display atual), `funcaoId`, `cbo` (da função) e opcionalmente `funcaoSalarioBase`. `importacao.ts` do colaborador: mapear a coluna de função (texto da planilha) pra `funcao_id`, criando a função se não existir (ou casando por nome) — decidir e documentar; manter compatível.
- Ajustar `rh/_shared/queries.ts`, `rh/folha/queries.ts`, `rh/apontamentos/queries.ts` e demais que expõem colaborador pra fazer o join e continuar entregando `funcao` (nome). Onde só exibem, não muda o componente.

### 5. UI
- **Aba `/cadastros/funcoes`:** `page.tsx` + `loading.tsx`; `DataTable` (nome, salário base `MoneyText`, CBO, ativo); `FormDrawer` (nome, salarioBase, cbo, ativo) canônico; `ImportDialog`. Padrão dos outros cadastros.
- **Form do colaborador:** o campo função vira `Combobox` das `funcoes` ativas (busca; `ComboboxCriavel` se quiser criar na hora — opcional). Ao **mudar** a função, `form.setValue("salario", funcao.salarioBase)` (só na mudança ativa do usuário, não no load de edição). Remover o campo CBO do form; mostrar o CBO da função como texto read-only (informativo).
- **Ficha do colaborador:** função (nome), salário, e CBO (derivado da função) read-only.

## Testes e definição de pronto
- Vitest: Zod da função (nome obrigatório, salário 2 casas); a lógica de sugerir salário ao trocar a função (função pura, ex. `salarioSugerido(funcao)`), incluindo "não sobrescreve no load".
- RLS: sem `cadastros.funcoes` ver não lista; sem criar/editar/excluir não muta. Colaborador: `funcao_id` respeitado.
- Advisors após migrations (a tabela nova precisa de RLS+policies). typecheck/lint/build verdes; testes existentes verdes; sem any/console.log. Combobox canônico em todo select.
- Verificação em banco: criar função com piso; ligar um colaborador; conferir o join entregando o nome; conferir o backfill.

## Fora de escopo (v1)
- Faixa salarial mín/máx (piso único agora).
- Validar CBO contra a tabela oficial de ocupações (texto livre; lookup depois).
- Histórico/versionamento de salário por função e reajuste em massa.
- Aplicar o piso retroativo a colaboradores já cadastrados (o piso só sugere na próxima edição da função).

## Riscos
- **Expand-contract da `funcao`**: dropar o texto só depois que TODO o código (queries de RH incl. folha/apontamentos, ficha, import) usa `funcao_id` e entrega o nome via join. Um lugar esquecido quebra display. Mapear todos os usos antes do contract.
- Tabela nova exige RLS/grants/trigger corretos desde a migration (regra de ouro): espelhar um cadastro vivo e rodar advisors.
- Import do colaborador por planilha (texto de função) precisa continuar funcionando (mapear pra funcao_id/criar função).
