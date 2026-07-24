# Dados pessoais + dependentes do colaborador (#9) — Design

Data: 2026-07-24
Status: aprovado (design), pendente de plano
Autor: Léo (com Tiago)

## Problema

Do QA do RH (gap #9): o cadastro do colaborador não estrutura os dados pessoais (RG, CTPS, PIS/NIS, CNH), não tem dependentes, CBO nem escolaridade. Isso faz falta pra gestão e é pré-requisito da folha oficial (IRRF/salário-família dependem de dependentes; eSocial depende dos dados pessoais). Bloco 2 do programa "RH completo" (Grupo A).

## Objetivo

Estruturar os dados pessoais do colaborador e os dependentes, sem inventar regra fiscal: guardar os campos e as flags que a folha/eSocial vão usar, sem calcular nada agora.

## Decisões (fechadas com o Tiago)

1. **Onde:** colunas em `colaboradores` (como salário/banco), não tabela 1:1 separada.
2. **Campos:** identidade (RG, CTPS, PIS), CNH, escolaridade e dados pra eSocial (nascimento, nome da mãe, nacionalidade, estado civil, raça/cor, título de eleitor, reservista).
3. **Dependentes:** tabela nova, já com as flags de folha (é dependente de IRRF / de salário-família), sem cálculo.
4. **CBO:** campo no colaborador já neste bloco (mesmo com `funcao` sendo texto livre).
5. **Dependente cadastrado após salvar o colaborador** (na seção de dependentes do drawer, modo edição), no padrão dos anexos — não embutido no save do colaborador.
6. **Enums amigáveis agora; mapear pros códigos oficiais do eSocial no Bloco 10** (não inventar código fiscal).
7. RG/CTPS/CNH estruturados **convivem** com os anexos de Documentos e ASO (o número fica no cadastro; o PDF continua podendo ser anexado).

## Design

### 1. Novas colunas em `colaboradores` (todas nullable, expand-only)
- **Identidade:** `rg text`, `rg_orgao text`, `rg_uf text`, `ctps_numero text`, `ctps_serie text`, `ctps_uf text`, `pis text` (PIS/NIS/PASEP).
- **CNH:** `cnh_numero text`, `cnh_categoria text` (check), `cnh_validade date`.
- **Dados pessoais / eSocial:** `data_nascimento date`, `nome_mae text`, `nacionalidade text`, `estado_civil text` (check), `raca_cor text` (check), `titulo_eleitor text`, `reservista text`.
- **Escolaridade:** `escolaridade text` (check). **CBO:** `cbo text`.

Enums (check `... is null or ... in (...)`, valores amigáveis em snake_case):
- `escolaridade`: analfabeto, fundamental_incompleto, fundamental_completo, medio_incompleto, medio_completo, superior_incompleto, superior_completo, pos_graduacao, mestrado, doutorado.
- `estado_civil`: solteiro, casado, divorciado, viuvo, uniao_estavel, separado_judicialmente.
- `raca_cor` (categorias IBGE): branca, preta, parda, amarela, indigena.
- `cnh_categoria`: A, B, C, D, E, AB, AC, AD, AE.

### 2. Nova tabela `rh_dependentes` (1:N)
Colunas: `id uuid pk default gen_random_uuid()`, `colaborador_id uuid not null references public.colaboradores(id)`, `nome text not null`, `data_nascimento date`, `parentesco text` (check), `cpf text`, `dependente_irrf boolean not null default false`, `dependente_salario_familia boolean not null default false`, `created_at`/`updated_at`/`created_by` no padrão das outras tabelas de RH.
- `parentesco`: conjuge, companheiro, filho, enteado, tutelado, pai, mae, outro.
- **RLS + grants + auditoria** espelhando uma tabela de RH existente (ex.: `rh_epis`/`rh_documentos`): select `tem_permissao('cadastros.colaboradores','ver')`, insert `criar`, update `editar`, delete `excluir`; grants explícitos só do que as policies permitem; trigger de auditoria universal (grava em `audit_log`). Ler a migration de uma tabela de RH viva antes, pra copiar o padrão exato de RLS/grant/trigger.
- Sem recurso novo: dependentes é sub-cadastro do colaborador, gateado por `cadastros.colaboradores`.
- **Exclusão:** hard delete com auditoria (a auditoria guarda o valor anterior). Não é transacional (sem dinheiro/status), então não entra no soft delete/lixeira; se a folha futura precisar de histórico, revisita.
- FK `colaborador_id` sem cascade (o colaborador usa soft delete via `fn_excluir_cadastro`; o dependente permanece ligado).

### 3. Backend (schema/queries/actions)
- `schemas.ts` do colaborador: adicionar os campos novos ao Zod (texto opcional pros de identidade/eSocial/CBO; `cnh_validade`/`data_nascimento` como data opcional; enums opcionais pra escolaridade/estado_civil/raca_cor/cnh_categoria). `queries.ts`/`actions.ts` do colaborador passam a ler/gravar as colunas novas (camelCase↔snake_case).
- Novo `src/modules/cadastros/colaboradores/dependentes.ts` (ou dentro de queries/actions): `listarDependentes(colaboradorId)`, `salvarDependente(input)` (criar/editar, checa `cadastros.colaboradores` criar/editar), `removerDependente(id)` (checa excluir). Zod do dependente. Padrão dos anexos (ação por registro, `revalidate`/refresh).

### 4. UI
- `colaboradores-form-drawer.tsx`: novas `SecaoFormulario` — **Documentos pessoais** (RG+órgão+UF, CTPS+série+UF, PIS), **CNH** (número, categoria via `Combobox`, validade), **Dados pessoais** (nascimento, escolaridade/estado civil/raça-cor/CNH via `Combobox`, nacionalidade, nome da mãe, título de eleitor, reservista), **Ocupação** (CBO). Preserva todos os campos atuais. Combobox canônico (com busca) em todo select.
- **Dependentes:** seção no drawer só no modo edição (colaborador com id), com lista + adicionar/editar/remover chamando as ações de dependente na hora (padrão do #10 anexos: `dependentesIniciais` buscados no server, sem travar em "Carregando"). Gated por `cadastros.colaboradores` (mostra editar/remover só pra quem tem editar/excluir; ver pra quem tem ver).
- `ficha-colaborador.tsx`: mostra os dados pessoais novos (na seção de cadastro, já gateada por `cadastros.colaboradores` ver) e uma seção de **Dependentes** read-only.

## Testes e definição de pronto
- Vitest: validação Zod dos campos novos (enums, data, texto opcional) e do dependente.
- RLS: sem `cadastros.colaboradores` ver, não lê dependentes; sem criar/editar/excluir, não muta (teste/raciocínio).
- Advisors após as migrations (a tabela nova precisa de RLS + policies, senão o advisor acusa). typecheck/lint/build verdes; testes existentes verdes; sem any/console.log. Toda a UI em canônicos.
- Verificação em banco: inserir um dependente de teste respeitando a RLS; conferir que as colunas novas gravam/leem.

## Fora de escopo (v1)
- Calcular IRRF / salário-família (só guardo as flags e os dependentes).
- Mapear os enums pros códigos oficiais do eSocial (Bloco 10).
- Validar CBO contra a tabela oficial de ocupações (por ora texto livre; lookup fica pra depois).
- Migrar CBO pra uma tabela de funções (isso é o Bloco 3, tabela de salário por função — quando existir, o CBO pode migrar pra lá).

## Riscos
- `colaboradores` fica larga (é aceitável num single-tenant; mantém o form/ficha simples de evoluir). Organizar o form em seções pra não virar um paredão.
- A tabela nova precisa de RLS/grants/trigger corretos desde a migration (regra de ouro): ler uma tabela de RH viva antes e espelhar; rodar advisors depois.
- Dependente com hard delete: se a folha futura exigir histórico, reavaliar soft delete (anotado).
